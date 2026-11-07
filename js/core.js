const PerfMonitor = (() => {
  const WINDOW_MS = 5000;
  const samples = {}; // label -> array of [timestamp, ms]

  function record(label, ms) {
    let arr = samples[label];
    if (!arr) { arr = []; samples[label] = arr; }
    const now = performance.now();
    arr.push([now, ms]);
    const cutoff = now - WINDOW_MS;
    let i = 0;
    while (i < arr.length && arr[i][0] < cutoff) i++;
    if (i > 0) arr.splice(0, i);
  }

  function avg(label) {
    const arr = samples[label];
    if (!arr || arr.length === 0) return 0;
    const cutoff = performance.now() - WINDOW_MS;
    let i = 0;
    while (i < arr.length && arr[i][0] < cutoff) i++;
    if (i > 0) arr.splice(0, i);
    if (arr.length === 0) return 0;
    let sum = 0;
    for (let j = 0; j < arr.length; j++) sum += arr[j][1];
    return sum / arr.length;
  }

  function max(label) {
    const arr = samples[label];
    if (!arr || arr.length === 0) return 0;
    const cutoff = performance.now() - WINDOW_MS;
    let i = 0;
    while (i < arr.length && arr[i][0] < cutoff) i++;
    if (i > 0) arr.splice(0, i);
    let m = 0;
    for (let j = 0; j < arr.length; j++) if (arr[j][1] > m) m = arr[j][1];
    return m;
  }

  function count(label) {
    const arr = samples[label];
    if (!arr || arr.length === 0) return 0;
    const cutoff = performance.now() - WINDOW_MS;
    let i = 0;
    while (i < arr.length && arr[i][0] < cutoff) i++;
    if (i > 0) arr.splice(0, i);
    return arr.length;
  }

  return { record, avg, max, count };
})();

// Utility/generation building types that can have multiple instances and
// otherwise all show an identical, indistinguishable title in the entity
// info panel (unlike houses/shops, which already get a unique name from
// the zone/request system). Each gets a "#N" suffix reflecting how many
// live instances of that type exist — see EntityRegistry.add() below.
// Numbers are reassigned from the lowest free slot, so removing e.g.
// Oil Refinery #2 and placing a new one makes it #2 again rather than
// counting up forever.
// Deliberately excludes types placed in bulk arrays (Solar, Wind, Battery,
// Biofuel Generator) — numbering every tile of a 50-panel solar farm would
// be noise, not a useful way to tell buildings apart.
const NUMBERED_ENTITY_TYPES = new Set([
  T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5,
  T.COALGENERATOR, T.HYDROGENERATOR, T.FUELGEN, T.NUCLEARREACTOR,
  T.COALMINE, T.COALMINE2, T.PUMPJACK, T.PUMPJACK2, T.OILSTORAGE, T.SOLIDSTORAGE, T.REFINERY, T.GASSTATION,
  T.GEOWELL, T.GEOTURBINE,
  T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2, T.LITHIUMMINE, T.RAREEARTHMINE, T.CHEMICALPLANT, T.FUELPLANT, T.LEACHPLANT, T.SCMILL, T.COREWORKS, T.COKEOVEN, T.GRAPHITEFURNACE, T.LITHIUMPROCESSPLANT, T.COOLINGTOWER, T.COOLINGTOWER2, T.ELECTROLYZER,
  T.ATMOSCOLLECTOR, T.HABERBOSCH, T.WASHTOWER, T.FUSIONFUELPLANT, T.HULKINGFUSIONREACTOR, T.ADVFUSIONREACTOR, T.MHDRING,
  T.ADVREACTOR, T.MOXPLANT, T.REPROCESSOR, T.SPENTFUELPOOL,
  T.HELIUMWELL, T.HELIUMWELL2, T.CRYOPLANT, T.HE3SEPARATOR, T.TRITIUMBREEDER, T.GASSTORAGE,
  T.WATEREXTRACTOR, T.DAM, T.HYDROTURBINE, T.SHAFT,
  T.MONITOR, T.MONITOR2, T.SURVEY, T.SURVEY2, T.PROTECTOR, T.PROTECTOR2, T.PROTECTOR3, T.POWERTOWER,
  T.GOVERNOR, T.CARBONCAPTURE,
]);

const EntityRegistry = (() => {
  const all = new Set();
  // Everything in `all` except pure scenery (water, trees, bushes — about 80%
  // of a mature world), in the same relative order. Scenery has no power,
  // upkeep or behaviour, so per-tick passes that act on "every entity" use
  // this and skip tens of thousands of tiles that cannot matter to them.
  const active = new Set();
  const _isScenery = t => t === T.WATER || t === T.TREE || t === T.BUSH;
  const byType = new Map(); // type -> Set<Entity>
  const EMPTY = new Set();
  let _solarVersion = 0; // bumped only when a SOLAR/SOLAR2 entity is added/removed
  // Bumped on every single add()/remove(), regardless of type — a generic
  // "has the grid's entity layout changed since I last looked" counter for
  // consumers (e.g. PowerNetwork's wire-hop cache) that need to know when
  // ANY entity anywhere could have appeared, disappeared, or moved (a move
  // is a remove+add pair), without caring which one. Cheap enough to bump
  // unconditionally since it's a single integer increment.
  let _topologyVersion = 0;
  // Bumped only when something that changes where a truck can drive comes or
  // goes: anything trucks can't drive through, plus roads (a bridge is a road
  // over water). Wires, pipes, belts and the like are driven over, so laying
  // or lifting one leaves truck routes as they were. Truck reachability
  // caches key on this: on a big map each recheck is a whole-map flood, and
  // keyed on _topologyVersion every belt placed re-ran them all.
  let _driveVersion = 0;
  const _bumpDrive = (e) => {
    if (e.type === T.ROAD || e._bridge || typeof TruckSystem === 'undefined' || !TruckSystem.isPassthrough(e.type)) _driveVersion++;
  };

  // Spatial cell index — cellKey(row,col) -> Set<Entity>, keyed off each
  // entity's OWN col/row/width/height rather than GridManager.tiles[][].
  // This matters because trucks temporarily "steal" a tile's pointer in
  // GridManager.tiles (see truck.js _restampAfterMove) without calling
  // remove() on whatever was there — the occupant stays a live registry
  // member the whole time, just orphaned from the tiles array. Building
  // the index from add()/remove() (this entity's true membership) instead
  // of the tiles array means it keeps working correctly even while a truck
  // sits on top of a wire/pole. Lets truck.js do a handful-of-cells lookup
  // instead of scanning every entity in the city for collision/vegetation/
  // restamp checks (previously O(totalEntities) per truck per substep).
  const cellIndex = new Map(); // (row*COLS+col) -> Set<Entity>
  function _forEachCell(entity, fn) {
    const w = entity.width || 1, h = entity.height || 1;
    const rMax = Math.min(ROWS, entity.row + h);
    const cMax = Math.min(COLS, entity.col + w);
    for (let r = Math.max(0, entity.row); r < rMax; r++)
      for (let c = Math.max(0, entity.col); c < cMax; c++)
        fn(r * COLS + c);
  }
  function _typeSet(type) {
    let s = byType.get(type);
    if (!s) { s = new Set(); byType.set(type, s); }
    return s;
  }

  // Lowest positive integer not currently used by a live entity of `type`.
  function _lowestFreeNum(type) {
    const used = new Set();
    for (const e of _typeSet(type)) if (e._num !== undefined) used.add(e._num);
    let n = 1;
    while (used.has(n)) n++;
    return n;
  }

  function add(entity) {
    if (!entity || all.has(entity)) return;
    all.add(entity);
    if (!_isScenery(entity.type)) active.add(entity);
    _typeSet(entity.type).add(entity);
    _forEachCell(entity, key => {
      let s = cellIndex.get(key);
      if (!s) { s = new Set(); cellIndex.set(key, s); }
      s.add(entity);
    });
    if (entity.type === T.SOLAR || entity.type === T.SOLAR2) _solarVersion++;
    _topologyVersion++;
    _bumpDrive(entity);
    if (NUMBERED_ENTITY_TYPES.has(entity.type) && entity._num === undefined) {
      entity._num = _lowestFreeNum(entity.type);
    }
  }

  function remove(entity) {
    if (!entity) return;
    // A deposit leaving the map (a worked-out one goes with its mine or pump
    // jack) takes its "running low" / "exhausted" cards with it. Before the
    // membership check: a deposit rebuilt from a mine's saved details is
    // removed without ever having been added.
    if (typeof dismissDepositAlerts === 'function') dismissDepositAlerts(entity);
    if (!all.has(entity)) return;
    all.delete(entity);
    active.delete(entity);
    const s = byType.get(entity.type);
    if (s) s.delete(entity);
    _forEachCell(entity, key => {
      const cs = cellIndex.get(key);
      if (cs) { cs.delete(entity); if (cs.size === 0) cellIndex.delete(key); }
    });
    if (entity.type === T.SOLAR || entity.type === T.SOLAR2) _solarVersion++;
    _topologyVersion++;
    _bumpDrive(entity);
  }

  return {
    add, remove,
    all() { return all; },
    active() { return active; },
    getByType(type) { return byType.get(type) || EMPTY; },
    getSolarVersion() { return _solarVersion; },
    getTopologyVersion() { return _topologyVersion; },
    getDriveVersion() { return _driveVersion; },
    driveChanged() { _driveVersion++; },   // an entity in place stopped being drivable (a bridge wrecked)
    // All distinct entities whose OWN footprint overlaps tile rect
    // [c0,c1] x [r0,r1] (inclusive), per the cell index above — independent
    // of whatever GridManager.tiles currently points at in that range.
    getInTileRect(c0, r0, c1, r1) {
      const result = new Set();
      const cLo = Math.max(0, c0), cHi = Math.min(COLS - 1, c1);
      const rLo = Math.max(0, r0), rHi = Math.min(ROWS - 1, r1);
      for (let r = rLo; r <= rHi; r++) {
        for (let c = cLo; c <= cHi; c++) {
          const s = cellIndex.get(r * COLS + c);
          if (s) for (const e of s) result.add(e);
        }
      }
      return result;
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   GRID MANAGER
   Owns the 2D tile array. Each tile = { entity | null }.
   Responsible for: coord conversion, neighbor lookups.
   ═══════════════════════════════════════════════════════════════════ */
const GridManager = (() => {
  // tiles[row][col] = Entity | null
  const tiles = Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  return {
    tiles,

    // World position → tile column/row (floored)
    worldToTile(wx, wy) {
      return { col: Math.floor(wx / TILE), row: Math.floor(wy / TILE) };
    },

    // Tile top-left world position
    tileToWorld(col, row) {
      return { x: col * TILE, y: row * TILE };
    },

    inBounds(col, row) {
      return col >= 0 && col < COLS && row >= 0 && row < ROWS;
    },

    getEntity(col, row) {
      if (!this.inBounds(col, row)) return null;
      return tiles[row][col];
    },

    // ── Stacked tiles ──
    // A wire, pipe and belt can share one tile: whichever is on the grid
    // carries the others as _underWire / _underPipe / _underConveyor. Two
    // rules keep a layer from ever being dropped:
    //   • the layers are held FLAT on the top entity. Stacking onto a tile
    //     that was already stacked used to nest them (belt → wire → pipe),
    //     and every lookup, the save and the Delete tool only read one level
    //     down, so the bottom layer went missing.
    //   • taking the top layer off hands the tile to what was underneath,
    //     on EVERY removal path, not just the Delete tool's special cases.
    _STACK_SLOTS: ['_underConveyor', '_underPipe', '_underWire'],
    _slotFor(e) { return e.type === T.WIRE ? '_underWire' : e.type === T.CONVEYOR ? '_underConveyor' : '_underPipe'; },
    _isLayer(u) { return !!u && typeof u === 'object' && !!u.type; },
    flattenStack(top) {
      if (!top) return;
      const own = this._slotFor(top);
      for (let pass = 0; pass < 3; pass++) {
        for (const k of this._STACK_SLOTS) {
          const u = top[k];
          if (!this._isLayer(u)) continue;
          if (u._underWater && !top._underWater) top._underWater = u._underWater;
          for (const j of this._STACK_SLOTS) {
            const v = u[j];
            if (!this._isLayer(v)) continue;
            u[j] = null;
            if (v !== top && j !== own && !this._isLayer(top[j])) top[j] = v;
          }
        }
      }
    },
    // What takes the tile when `e` comes off it, with any other layer `e`
    // was carrying moved onto it. Null if nothing was underneath. A belt
    // hosts a pipe or wire, a pipe hosts a wire: same forms placement makes.
    lowerLayer(e) {
      if (!e) return null;
      this.flattenStack(e);
      const unders = this._STACK_SLOTS.map(k => e[k]).filter(u => this._isLayer(u));
      if (!unders.length) return null;
      const host = unders[0];
      for (const u of unders.slice(1)) { const slot = this._slotFor(u); if (!this._isLayer(host[slot])) host[slot] = u; }
      host.col = e.col; host.row = e.row;
      if (e._underWater && !host._underWater) host._underWater = e._underWater;
      return host;
    },

    // The baked water look (water_look.js) gives water a natural bank, or a
    // hard straight edge beside a dam. Tell it when a tile flips between the
    // two -- and only then, so a truck re-stamping a road does not re-bake
    // the lake beside it.
    _lookBuilt(e) { return !!e && e.type === T.DAM; },   // matches hardEntity in water_look.js
    _lookTouch(prev, next, c, r, w, h) {
      if (typeof WaterLook === 'undefined') return;
      // A turbine or shaft bridges water the look draws under it.
      const bridge = e => !!e && (e.type === T.HYDROTURBINE || e.type === T.SHAFT);
      if (bridge(prev) !== bridge(next)) WaterLook.invalidate(true);
      else if (this._lookBuilt(prev) !== this._lookBuilt(next)) WaterLook.touch(c, r, w, h);
    },

    setEntity(col, row, entity) {
      if (!this.inBounds(col, row)) return;
      const prev = tiles[row][col];
      if (entity && (entity._underWire || entity._underPipe || entity._underConveyor)) this.flattenStack(entity);
      tiles[row][col] = entity;
      this._lookTouch(prev, entity, col, row, 1, 1);
      // Writing one tile of a multi-tile building must not unregister the
      // whole building while its other tiles still show it — that left a
      // "ghost" drawn on the map but invisible to every system that walks the
      // registry (ticks, fuel delivery, truck destinations). It happened when
      // a building's footprint grew over a wire laid beside it: loading
      // placed the wire after the building and evicted it on every load.
      if (prev && prev !== entity && !this._stillOnGrid(prev)) EntityRegistry.remove(prev);
      if (entity) EntityRegistry.add(entity);
    },

    // True if any tile of e's footprint still points at e.
    _stillOnGrid(e) {
      const w = e.width || 1, h = e.height || 1;
      if (w === 1 && h === 1) return false;   // its only tile was just overwritten
      for (let r = e.row; r < e.row + h; r++)
        for (let c = e.col; c < e.col + w; c++)
          if (this.inBounds(c, r) && tiles[r][c] === e) return true;
      return false;
    },

    // Takes the top entity off a tile. Whatever it was laid over (a wire
    // under a pipe, a pipe under a belt, the lake under a pipe) gets the
    // tile back. Pass { wholeStack: true } to wipe every layer (a blast).
    removeEntity(col, row, opts) {
      if (!this.inBounds(col, row)) return;
      const prev = tiles[row][col];
      const whole = !!(opts && opts.wholeStack);
      const low = prev && !whole && (prev.width || 1) === 1 && (prev.height || 1) === 1 ? this.lowerLayer(prev) : null;
      tiles[row][col] = low || null;
      if (prev) {
        EntityRegistry.remove(prev);
        if (low) EntityRegistry.add(low);
        else if (!whole && this._isLayer(prev._underWater) && prev._underWater.type === T.WATER) tiles[row][col] = prev._underWater;
        else this._restoreWaterUnder(prev);
        if (typeof ZoneSystem !== 'undefined') ZoneSystem.noteFootprintChanged?.(prev);
        this._lookTouch(prev, tiles[row][col], col, row, 1, 1);
      }
    },

    // Bridge-over-water entities (shafts, turbines) keep a _waterTiles
    // capture so any delete path — bulldozer, lightning, undo — can put
    // water back. Prefer the live entity ref when present (shafts never
    // destroy water); otherwise rebuild from the snapshot (turbines).
    // Do NOT clear _waterTiles after restore: wiping it made a second
    // remove / undo-redo cycle unable to restore water at all.
    // t.entity is only trusted when it is a real Entity: a save used to
    // serialise the cached ref, and the plain JSON object it loaded back as
    // put a broken, invisible "water" tile on the grid.
    _restoreWaterUnder(entity) {
      if (!entity || !entity._waterTiles || !entity._waterTiles.length) return;
      for (const t of entity._waterTiles) {
        if (!this.inBounds(t.c, t.r)) continue;
        if (tiles[t.r][t.c]) continue; // something else already occupies it
        let w = (t.entity instanceof Entity && t.entity.type === T.WATER) ? t.entity : null;
        if (!w) {
          w = new Entity(T.WATER, t.c, t.r);
          if (t.isRiver) { w._isRiver = true; w._flowDc = t.flowDc; w._flowDr = t.flowDr; }
          if (t.reservoirId !== undefined) w._reservoirId = t.reservoirId;
          t.entity = w;
        }
        tiles[t.r][t.c] = w;
        EntityRegistry.add(w);
        if (typeof WaterSystem !== 'undefined' && WaterSystem._register && !WaterSystem.isWater(t.c, t.r)) {
          WaterSystem._register(t.c, t.r);
        }
      }
    },

    // Trees and bushes never block building — anything placed or moved onto
    // them simply destroys them (setEntityFootprint / setEntity).
    isVegetation(e) {
      return !!e && (e.type === T.TREE || e.type === T.BUSH);
    },

    // Multi-tile footprint helpers
    canPlaceFootprint(col, row, w, h) {
      // Land fenced off for Hyperion Station is closed to building.
      if (!this.ignoreReserved && typeof GovernmentSystem !== 'undefined' && GovernmentSystem.isMeridianReserved?.(col, row, w, h)) return false;
      for (let r = row; r < row + h; r++)
        for (let c = col; c < col + w; c++)
          if (!this.inBounds(c, r) || (tiles[r][c] && !this.isVegetation(tiles[r][c]))) return false;
      return true;
    },

    // Can `entity`, being dragged to a new spot, be set down with its anchor
    // at (col, row)? Its own tiles and vegetation never block it. With
    // `absorbWires`, neither does plain wire: the drop takes those tiles'
    // wire up (input_manager.js refunds it), so a building's own hook-up
    // stub does not force it a whole footprint away before it can move at
    // all. Wire laid over a pipe or over water stays in the way: lifting
    // that puts the pipe or the water back on the tile.
    // `ownLines` (a Set, from ownLineTiles) is the building's own pipe and
    // belt runs: those don't block either, and are lifted on drop. Without
    // it a building with lines on its ports couldn't shift less than its
    // own footprint, since any small move overlapped one of them.
    // With `fill`, open water doesn't block either: the drop fills it, as
    // placing the building there would (WaterBuild.refillAfterMove).
    canDropMoved(entity, col, row, absorbWires, ownLines, fill) {
      const w = entity.width || 1, h = entity.height || 1;
      if (!this.ignoreReserved && typeof GovernmentSystem !== 'undefined' && GovernmentSystem.isMeridianReserved?.(col, row, w, h)) return false;
      for (let r = row; r < row + h; r++)
        for (let c = col; c < col + w; c++) {
          if (!this.inBounds(c, r)) return false;
          const t = tiles[r][c];
          if (!t || t === entity || this.isVegetation(t)) continue;
          if (absorbWires && this.isLooseWire(t)) continue;
          if (ownLines && ownLines.has(t)) continue;
          if (fill && WaterBuild.canFillTile(entity.type, t)) continue;
          return false;
        }
      return true;
    },
    // A Water Extractor being moved needs lake under every tile of its new
    // spot; its own current tiles count as lake (they were lake when it was
    // built, and are put back when it lifts off). One rule for the drag
    // ghost, the cursor and the drop, which used to disagree: the ghost ran
    // the empty-ground rule above and showed red over open water.
    canDropExtractor(entity, col, row) {
      const w = entity.width || 4, h = entity.height || 4;
      for (let r = row; r < row + h; r++)
        for (let c = col; c < col + w; c++) {
          if (!this.inBounds(c, r)) return false;
          const t = tiles[r][c];
          if (!t || (t !== entity && t.type !== T.WATER)) return false;
        }
      return true;
    },
    // Why canDropMoved said no: the first thing in the way, for the
    // "can't move here" message. Same rules, in the same order.
    dropBlocker(entity, col, row, absorbWires, ownLines, fill) {
      const w = entity.width || 1, h = entity.height || 1;
      if (!this.ignoreReserved && typeof GovernmentSystem !== 'undefined' && GovernmentSystem.isMeridianReserved?.(col, row, w, h))
        return { reason: typeof NationalProject !== 'undefined' && NationalProject.named?.() ? 'land reserved for Hyperion Station' : 'land reserved for a classified site' };
      for (let r = row; r < row + h; r++)
        for (let c = col; c < col + w; c++) {
          if (!this.inBounds(c, r)) return { reason: 'the edge of the map' };
          const t = tiles[r][c];
          if (!t || t === entity || this.isVegetation(t)) continue;
          if (absorbWires && this.isLooseWire(t)) continue;
          if (ownLines && ownLines.has(t)) continue;
          if (fill && WaterBuild.canFillTile(entity.type, t)) continue;
          if (fill && t.type === T.WATER && !WaterBuild.noFill(entity.type))
            return { reason: WaterBuild.isReservoir(t) ? 'a dam reservoir' : 'water (unlock the Bridge to build over it)', c, r, ent: t };
          const label = t.def?.label || EntityDefs[t.type]?.label || t.type;
          const extra = t.type === T.WIRE && t._underPipe ? ' (wire laid over a pipe)'
                      : t.type === T.WIRE && t._underWater ? ' (wire over water)'
                      : (t.type === T.PIPE || t.type === T.CONVEYOR) ? ' (not this building\'s own line)' : '';
          return { reason: `${label}${extra}`, c, r, ent: t };
        }
      return null;
    },
    // A building's own pipe and belt runs, as far as a short move could
    // reach: plain pipe / conveyor tiles connected to a tile touching its
    // footprint, walked out to one footprint's width/height beyond it (a
    // move further than that clears its own lines anyway). Pieces under
    // water or another structure, or a client's, never count.
    ownLineTiles(entity) {
      const w = entity.width || 1, h = entity.height || 1;
      const c0 = entity.col - w - 1, c1 = entity.col + 2 * w, r0 = entity.row - h - 1, r1 = entity.row + 2 * h;
      const liftable = (t) => !!t && (t.type === T.PIPE || t.type === T.CONVEYOR)
        && !t._underWater && !t._underPipe && !t._underWire && !t._clientOwned;
      const out = new Set(), queue = [];
      for (let r = entity.row - 1; r <= entity.row + h; r++)
        for (let c = entity.col - 1; c <= entity.col + w; c++) {
          const inside = r >= entity.row && r < entity.row + h && c >= entity.col && c < entity.col + w;
          if (inside || !this.inBounds(c, r)) continue;
          const t = tiles[r][c];
          if (liftable(t) && !out.has(t)) { out.add(t); queue.push([c, r]); }
        }
      while (queue.length) {
        const [c, r] = queue.shift();
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nc = c + dc, nr = r + dr;
          if (nc < c0 || nc > c1 || nr < r0 || nr > r1 || !this.inBounds(nc, nr)) continue;
          const t = tiles[nr][nc];
          if (liftable(t) && !out.has(t) && t.type === tiles[r][c].type) { out.add(t); queue.push([nc, nr]); }
        }
      }
      return out;
    },
    isLooseWire(t) {
      return !!t && t.type === T.WIRE && !t._underPipe && !t._underWater && !t._clientOwned;
    },

    setEntityFootprint(entity) {
      // A re-stamp of something already standing (a truck driving off a road
      // puts the road's tiles back) is not a change to what stands where.
      const isNew = !EntityRegistry.getByType(entity.type).has(entity);
      for (let r = entity.row; r < entity.row + entity.height; r++)
        for (let c = entity.col; c < entity.col + entity.width; c++) {
          if (!this.inBounds(c, r)) continue;
          const prev = tiles[r][c];
          if (prev && prev !== entity && this.isVegetation(prev)) EntityRegistry.remove(prev);
          tiles[r][c] = entity;
        }
      EntityRegistry.add(entity);
      if (isNew && typeof ZoneSystem !== 'undefined') ZoneSystem.noteFootprintChanged?.(entity);
      if (isNew) this._lookTouch(null, entity, entity.col, entity.row, entity.width, entity.height);
    },

    removeEntityFootprint(entity) {
      for (let r = entity.row; r < entity.row + entity.height; r++)
        for (let c = entity.col; c < entity.col + entity.width; c++)
          if (this.inBounds(c, r) && tiles[r][c] === entity) tiles[r][c] = null;
      EntityRegistry.remove(entity);
      // A truck stamps itself over whatever it is parked on (a road, a wire,
      // a bridge). Taking it away hands those tiles back to what is still
      // there, or the road under it would be left with holes in it — and a
      // hole in a bridge reads as open ground you could build on.
      if (entity.type === T.TRUCK) {
        for (let r = entity.row; r < entity.row + entity.height; r++)
          for (let c = entity.col; c < entity.col + entity.width; c++) {
            if (!this.inBounds(c, r) || tiles[r][c]) continue;
            for (const o of EntityRegistry.getInTileRect(c, r, c, r)) {
              if (o === entity || o.type === T.TRUCK) continue;
              if (c >= o.col && c < o.col + (o.width || 1) && r >= o.row && r < o.row + (o.height || 1)) { tiles[r][c] = o; break; }
            }
          }
      }
      this._restoreWaterUnder(entity);
      if (typeof ZoneSystem !== 'undefined') ZoneSystem.noteFootprintChanged?.(entity);
      this._lookTouch(entity, null, entity.col, entity.row, entity.width, entity.height);
    },

    // Returns array of {col, row, entity} for all 4 orthogonal neighbours
    getNeighbours(col, row) {
      const entity = tiles[row]?.[col];
      // For multi-tile entities, gather neighbours of every perimeter tile
      const w = (entity?.width  || 1);
      const h = (entity?.height || 1);
      const ac = entity ? entity.col : col;
      const ar = entity ? entity.row : row;

      if (w === 1 && h === 1) {
        // Fast path for single-tile entities — this is the hottest path in
        // the power/pipe network BFS (called once per visited tile, up to
        // thousands of times per tick on a built-up city). Built as a plain
        // loop into one pre-sized array instead of a literal-array + filter
        // + map chain, which allocated 3 throwaway arrays and re-spread
        // every surviving neighbour into a new object on every call.
        const result = [];
        if (this.inBounds(ac, ar - 1)) result.push({ col: ac,     row: ar - 1, entity: tiles[ar - 1][ac] });
        if (this.inBounds(ac, ar + 1)) result.push({ col: ac,     row: ar + 1, entity: tiles[ar + 1][ac] });
        if (this.inBounds(ac - 1, ar)) result.push({ col: ac - 1, row: ar,     entity: tiles[ar][ac - 1] });
        if (this.inBounds(ac + 1, ar)) result.push({ col: ac + 1, row: ar,     entity: tiles[ar][ac + 1] });
        return result;
      }

      // Multi-tile: check every cell just outside the bounding box
      const seen = new Set();
      const result = [];
      for (let dc = 0; dc < w; dc++) {
        // Top edge
        const tr = ar - 1, tc = ac + dc;
        if (this.inBounds(tc, tr)) { const k=`${tc},${tr}`; if(!seen.has(k)){seen.add(k);result.push({col:tc,row:tr,entity:tiles[tr][tc]});} }
        // Bottom edge
        const br = ar + h, bc = ac + dc;
        if (this.inBounds(bc, br)) { const k=`${bc},${br}`; if(!seen.has(k)){seen.add(k);result.push({col:bc,row:br,entity:tiles[br][bc]});} }
      }
      for (let dr = 0; dr < h; dr++) {
        // Left edge
        const lc = ac - 1, lr = ar + dr;
        if (this.inBounds(lc, lr)) { const k=`${lc},${lr}`; if(!seen.has(k)){seen.add(k);result.push({col:lc,row:lr,entity:tiles[lr][lc]});} }
        // Right edge
        const rc = ac + w, rr = ar + dr;
        if (this.inBounds(rc, rr)) { const k=`${rc},${rr}`; if(!seen.has(k)){seen.add(k);result.push({col:rc,row:rr,entity:tiles[rr][rc]});} }
      }
      return result;
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   ENTITY
   One placed object on a specific tile.
   Carries runtime state: powered, load, overloaded etc.
   ═══════════════════════════════════════════════════════════════════ */
class Entity {
  constructor(type, col, row) {
    this.type     = type;
    this.col      = col;
    this.row      = row;
    this.def      = EntityDefs[type];

    // Footprint — multi-tile entities fill all tiles with this object
    this.width      = EntityDefs[type].width  || 1;
    this.height     = EntityDefs[type].height || 1;

    // Runtime state
    this.powered    = false;
    this.load       = 0;
    this.overloaded = false;
    this.networkId  = -1;

    // Wire state
    this.hopCount   = 0;       // hops from nearest anchor
    this.outOfRange = false;   // beyond MAX_WIRE_HOPS — doesn't conduct
    this.failed     = false;   // overloaded beyond throughput — doesn't conduct
    // Storage state (Substation + Battery Block)
    this.charge     = (type === T.SUBSTATION || type === T.SUBSTATION2 || type === T.SUBSTATION3 || type === T.SUBSTATION4 || type === T.SUBSTATION5 || type === T.BATTERY) ? 0 : null;
    this.charging   = false;
    // Consumer-specific
    this.dailyFee         = null;
    this.commercialSubtype = null;  // 'grocery','factory','datacenter', etc.
    this.businessName      = null;  // e.g. 'Downtown Café', 'Tech Office'
    this.reliability       = 100;
    this.blackoutSeconds   = 0;
    this.satisfaction      = 80;
    this.wear              = 0;     // 0-1; solar panels degrade over time
  }
}

