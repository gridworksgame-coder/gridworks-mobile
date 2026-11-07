/* ═══════════════════════════════════════════════════════════════════
   WATER BUILD
   Building on water, unlocked with the Bridge (which comes with the
   Waste Truck). Two ways in:

   • Bridges. The Bridge tool lays a T.ROAD flagged _bridge. The water
     stays water (still in WaterSystem), so the lake is still a lake for
     fishing, rivers and the water bake; the bridge claims the grid tiles
     and its water entities wait in _waterTiles, out of the registry. (A
     driven truck re-stamps every registered entity on the tiles it
     leaves, which would put the lake back on top of the deck.)
     GridManager._restoreWaterUnder hands them back on every removal path.

   • Filling. Any ordinary building may be set down over water for a
     per-tile fill charge. Like a hydro turbine, the water it covers is
     taken out of WaterSystem (it is land now) and snapshotted in
     _waterTiles with _filled set; removing the building puts the lake
     back the same way.

   • Poles. A Power Pole may stand in a lake or river on a concrete
     footing, Bridge or not, so a line can cross water wider than wire
     range from the banks. Like a wire across water, the water stays
     water and is kept as the pole's _underWater; removing it puts the
     tile back.

   • Power Towers. The same for a tower's 2×2 footprint: concrete
     footings, no Bridge needed, the water stays water. Like a bridge,
     the tower claims the grid tiles and their water waits in
     _waterTiles (_waterFooting set), handed back on every removal path.

   None may touch a dam reservoir: those are sized to their dams.
   ═══════════════════════════════════════════════════════════════════ */
const WaterBuild = (() => {
  const FILL_PER_TILE   = 250;   // $ per water tile filled under a building
  const BRIDGE_PER_TILE = 100;   // $ per water tile a bridge piece spans, on top of the road price
  const POLE_FOOTING    = 500;   // $ for a pole's concrete footing in water, on top of the pole price
  const TOWER_FOOTING   = 2000;  // $ for a Power Tower's footings in water, on top of the tower price
  const SPAN = 6;                // bridge pieces are 6×6, like roads

  // Tools that never fill: they have their own way with water, or they
  // aren't buildings at all.
  let _noFill = null;
  function noFill(type) {
    if (!_noFill) _noFill = new Set([T.WIRE, T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR, T.UNDERGNDCONVEYOR, T.CONVEYORSPLITTER,
      T.ROAD, T.BRIDGE, T.POLE, T.POWERTOWER, T.TRUCK, T.HAULER, T.PATHTOOL, T.FISHINGPOLE,
      T.WATEREXTRACTOR, T.DAM, T.HYDROTURBINE, T.SHAFT, T.WATER,
      // Built on their deposit by their own placement rules
      T.PUMPJACK, T.PUMPJACK2, T.COALMINE, T.COALMINE2, T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2,
      T.LITHIUMMINE, T.RAREEARTHMINE, T.HELIUMWELL, T.HELIUMWELL2, T.GEOWELL, T.GEOTURBINE]);
    return _noFill.has(type);
  }
  const unlocked = () => typeof Progression !== 'undefined' && Progression.isUnlocked(T.BRIDGE);

  function isReservoir(w) {
    return !!w && w._reservoirId !== undefined && typeof ReservoirSystem !== 'undefined'
      && !!ReservoirSystem.getReservoir(w._reservoirId);
  }
  function _snapOf(w) {
    return { c: w.col, r: w.row, isRiver: !!w._isRiver, flowDc: w._flowDc || 0, flowDr: w._flowDr || 0, entity: w };
  }

  // ── Filling ──────────────────────────────────────────────────────
  // What it takes to set `type` down w×h at (col,row) when water is in the
  // way. null: no water there, something other than water blocks it, or
  // the tool never fills (the caller's usual "blocked" rules apply).
  // Otherwise { ok: true, tiles, cost } or { ok: false, reason }.
  function fillPlan(type, col, row, w, h) {
    if (!type || noFill(type) || !EntityDefs[type]) return null;
    const tiles = [];
    let reservoir = false;
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) {
      if (!GridManager.inBounds(c, r)) return null;
      const t = GridManager.getEntity(c, r);
      if (!t || GridManager.isVegetation(t)) continue;
      if (t.type !== T.WATER) return null;
      if (isReservoir(t)) reservoir = true; else tiles.push(t);
    }
    if (!tiles.length && !reservoir) return null;
    if (!GridManager.ignoreReserved && typeof GovernmentSystem !== 'undefined'
        && GovernmentSystem.isMeridianReserved?.(col, row, w, h)) return null;
    if (reservoir) return { ok: false, reason: "Can't build over a dam reservoir" };
    if (!unlocked()) return { ok: false, reason: 'Unlock the Bridge to build over water' };
    return { ok: true, tiles, cost: tiles.length * FILL_PER_TILE };
  }

  // Take the planned water off the map (before the footprint is stamped).
  function fill(entity, plan) {
    const snap = Array.isArray(entity._waterTiles) && entity._filled ? entity._waterTiles : [];
    for (const w of plan.tiles) {
      snap.push(_snapOf(w));
      if (GridManager.tiles[w.row][w.col] === w) GridManager.tiles[w.row][w.col] = null;
      EntityRegistry.remove(w);
      if (WaterSystem.isWater(w.col, w.row)) WaterSystem._unregister(w.col, w.row);
    }
    entity._waterTiles = snap;
    entity._filled = true;
  }

  // Whether a building being dragged may land on this water tile, filling
  // it: the same terms as placing one there (Bridge unlocked, no reservoir).
  function canFillTile(type, t) {
    return !!t && t.type === T.WATER && !noFill(type) && unlocked() && !isReservoir(t);
  }

  // Water tiles a w×h footprint at (col,row) would fill, ignoring `self`.
  function _waterUnder(col, row, w, h) {
    const tiles = [];
    for (let r = row; r < row + h; r++)
      for (let c = col; c < col + w; c++) {
        const t = GridManager.inBounds(c, r) ? GridManager.tiles[r][c] : null;
        if (t && t.type === T.WATER) tiles.push(t);
      }
    return tiles;
  }
  const _filledCount = e => (e._filled && Array.isArray(e._waterTiles) ? e._waterTiles.length : 0);

  // What moving `e` to (col,row) costs in fill: new tiles charged, old ones
  // refunded, so it can be negative. Read once `e` is lifted off its old
  // spot (removeEntityFootprint), so water it gives back there counts again.
  function moveFillCost(e, col, row) {
    if (!e || noFill(e.type)) return 0;
    const wet = _waterUnder(col, row, e.width || 1, e.height || 1).length;
    return (wet - _filledCount(e)) * FILL_PER_TILE;
  }

  // A building has just moved (a drag, or a move undone/redone): the lake
  // under its old spot is already back (removeEntityFootprint), so take
  // whatever water the new footprint covers. Call after col/row change and
  // before the footprint is stamped. The fill difference is charged or
  // refunded here, and kept in _paid so deleting it later refunds the fill
  // it now stands on; undo runs the same path back, so it nets out.
  function refillAfterMove(e) {
    if (!e || noFill(e.type)) return 0;
    const tiles = _waterUnder(e.col, e.row, e.width || 1, e.height || 1);
    const delta = (tiles.length - _filledCount(e)) * FILL_PER_TILE;
    if (e._filled) { e._waterTiles = []; e._filled = false; }
    if (tiles.length) fill(e, { tiles });
    if (delta) {
      Economy.setBalance(Economy.balance - delta);
      e._paid = (e._paid !== undefined ? e._paid : (e.def?.cost ?? EntityDefs[e.type]?.cost ?? 0)) + delta;
    }
    return delta;
  }

  // Redo of a filled building's placement: the water undo put back comes
  // off again, the same entities (cached on the capture) so a later undo
  // hands those back rather than stacking new ones.
  function reclaimFill(e) {
    for (const t of e._waterTiles || []) {
      const w = GridManager.getEntity(t.c, t.r);
      if (!w || w.type !== T.WATER) continue;
      GridManager.tiles[t.r][t.c] = null;
      EntityRegistry.remove(w);
      if (WaterSystem.isWater(t.c, t.r)) WaterSystem._unregister(t.c, t.r);
      t.entity = w;
    }
  }

  // ── Poles ────────────────────────────────────────────────────────
  // A Power Pole set down on the water tile `w`. Needs no unlock: it is
  // how a line gets over a river before there are bridges.
  function polePlan(w) {
    if (isReservoir(w)) return { ok: false, reason: "Can't build in a dam reservoir" };
    const base = typeof buildCost === 'function' ? buildCost(T.POLE) : (EntityDefs[T.POLE].cost || 0);
    return { ok: true, cost: base + POLE_FOOTING };
  }

  // A Power Tower set down w×h at (col,row) with water in its footprint.
  // Shaped like fillPlan: null when there's no water there or something
  // other than water blocks it; otherwise { ok, water, cost } where cost is
  // the footing, on top of the tower's own price.
  function towerPlan(col, row, w, h) {
    const water = [];
    let reservoir = false;
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) {
      if (!GridManager.inBounds(c, r)) return null;
      const t = GridManager.getEntity(c, r);
      if (!t || GridManager.isVegetation(t)) continue;
      if (t.type !== T.WATER) return null;
      if (isReservoir(t)) reservoir = true; else water.push(t);
    }
    if (!water.length && !reservoir) return null;
    if (!GridManager.ignoreReserved && typeof GovernmentSystem !== 'undefined'
        && GovernmentSystem.isMeridianReserved?.(col, row, w, h)) return null;
    if (reservoir) return { ok: false, reason: "Can't build in a dam reservoir" };
    return { ok: true, water, cost: TOWER_FOOTING, footing: true };
  }

  // Keep the planned water under the tower, out of the registry like a
  // bridge's (before the footprint is stamped). It stays in WaterSystem.
  function claimTower(tower, plan) {
    tower._waterFooting = true;
    tower._waterTiles = plan.water.map(_snapOf);
    for (const w of plan.water) EntityRegistry.remove(w);
  }

  // ── Bridges ──────────────────────────────────────────────────────
  // Does a piece at (col,row) carry straight on from the end of a bridge?
  function _continuesBridge(col, row, rot) {
    const vert = _vertical(rot);
    for (const rd of EntityRegistry.getByType(T.ROAD)) {
      if (!rd._bridge || _vertical(rd._rotation) !== vert) continue;
      if (vert ? (rd.col === col && (rd.row + rd.height === row || row + SPAN === rd.row))
               : (rd.row === row && (rd.col + rd.width === col || col + SPAN === rd.col))) return true;
    }
    return false;
  }

  // A piece may go where every tile is water, open ground, or something a
  // road already lies over (wire, pipe, another road). It must span some
  // water, or carry a bridge on onto the bank (drawn as its approach on an
  // embankment), and none of it may be a reservoir.
  function bridgePlan(col, row, w = SPAN, h = SPAN, rot = 0) {
    const water = [];
    let reservoir = false;
    for (let r = row; r < row + h; r++) for (let c = col; c < col + w; c++) {
      if (!GridManager.inBounds(c, r)) return { ok: false, reason: 'Out of bounds' };
      const t = GridManager.getEntity(c, r);
      if (!t || GridManager.isVegetation(t)) continue;
      if (t.type === T.WATER) { if (isReservoir(t)) reservoir = true; else water.push(t); continue; }
      if (t.type === T.WIRE || t.type === T.PIPE || t.type === T.UNDERGNDPIPE || t.type === T.ROAD) continue;
      return { ok: false, reason: 'Something is in the way' };
    }
    if (reservoir) return { ok: false, reason: "Can't bridge a dam reservoir" };
    if (!water.length && !_continuesBridge(col, row, rot))
      return { ok: false, land: true, reason: 'Bridges cross water: use the Road tool on land' };
    return { ok: true, water, cost: EntityDefs[T.ROAD].cost + water.length * BRIDGE_PER_TILE };
  }

  // The run of pieces one click lays: the piece under the cursor and, when
  // it is over water, as many more on either side along its lanes as it
  // takes to reach the bank, so a bridge spans the whole crossing wherever
  // it's put down (a river running at a slant still gets a bridge that
  // lands on both banks) instead of one square dropped in the middle of it.
  // Stops short of anything already a road or bridge, and at MAX_RUN
  // pieces (a lake that wide is crossed by dragging a run). Returns
  // { pieces: [{col,row,plan}], ok, cost, water, reason }.
  const MAX_RUN = 8;
  function bridgeRun(col, row, rot = 0) {
    const vert = _vertical(rot);
    const wet = (c0, r0) => {
      for (let r = r0; r < r0 + SPAN; r++) for (let c = c0; c < c0 + SPAN; c++) {
        const t = GridManager.inBounds(c, r) ? GridManager.getEntity(c, r) : null;
        if (t && t.type === T.WATER && !isReservoir(t)) return true;
      }
      return false;
    };
    const roadIn = (c0, r0) => {
      for (let r = r0; r < r0 + SPAN; r++) for (let c = c0; c < c0 + SPAN; c++)
        if (GridManager.inBounds(c, r) && _roadsCovering(c, r, null)) return true;
      return false;
    };
    const at = [{ col, row }];
    if (wet(col, row) && !roadIn(col, row)) {
      for (const dir of [-1, 1]) for (let k = 1; at.length < MAX_RUN; k++) {
        const c = vert ? col : col + dir * k * SPAN, r = vert ? row + dir * k * SPAN : row;
        if (!GridManager.inBounds(c, r) || !GridManager.inBounds(c + SPAN - 1, r + SPAN - 1)) break;
        if (!wet(c, r) || roadIn(c, r)) break;
        at.push({ col: c, row: r });
      }
      at.sort((a, b) => vert ? a.row - b.row : a.col - b.col);
    }
    const pieces = at.map(p => ({ ...p, plan: bridgePlan(p.col, p.row, SPAN, SPAN, rot) }));
    const bad = pieces.find(p => !p.plan.ok);
    return {
      pieces, ok: !bad, reason: bad ? bad.plan.reason : '', land: !!(bad && bad.plan.land && pieces.length === 1),
      cost: pieces.reduce((s, p) => s + (p.plan.ok ? p.plan.cost : 0), 0),
      water: pieces.reduce((s, p) => s + (p.plan.ok ? p.plan.water.length : 0), 0),
    };
  }

  // Claim the planned tiles for a new bridge (the water stays registered).
  function claimBridge(road, plan) {
    road._bridge = true;
    road._waterTiles = plan.water.map(_snapOf);
    for (let r = road.row; r < road.row + road.height; r++)
      for (let c = road.col; c < road.col + road.width; c++) {
        const prev = GridManager.tiles[r][c];
        if (GridManager.isVegetation(prev)) EntityRegistry.remove(prev);
        if (prev && prev.type === T.WATER) EntityRegistry.remove(prev);
        if (!prev || GridManager.isVegetation(prev) || prev.type === T.WATER) GridManager.tiles[r][c] = road;
      }
  }

  // Redo of a bridge, or a save loaded under it: point the capture at the
  // live water now on those tiles before the footprint claims them.
  function relinkBridge(road) {
    for (const t of road._waterTiles || []) {
      const w = GridManager.inBounds(t.c, t.r) ? GridManager.tiles[t.r][t.c] : null;
      if (w && w.type === T.WATER) { t.entity = w; EntityRegistry.remove(w); }
    }
  }

  const _vertical = rot => ((rot || 0) % 2) === 0;   // even rotation: lanes run north–south
  function _roadsCovering(c, r, except) {
    let top = null;
    for (const rd of EntityRegistry.getByType(T.ROAD))
      if (rd !== except && c >= rd.col && c < rd.col + rd.width && r >= rd.row && r < rd.row + rd.height) top = rd;
    return top;
  }

  // Line a new piece up with a bridge or road it is being laid against, so
  // a run joins seamlessly without pixel-hunting: within 2 tiles of an
  // end, on the same axis, it snaps flush to that end; turned across one,
  // it snaps flush against its side, squared up with it, for a T-junction.
  function snapBridge(col, row, rot) {
    const vert = _vertical(rot);
    let best = null, bestD = 99;
    for (const rd of EntityRegistry.getByType(T.ROAD)) {
      if (_vertical(rd._rotation) !== vert) {
        // rd runs across this piece. Our end meets its side.
        const along = vert ? row : col;                       // our axis position
        const side0 = vert ? rd.row - SPAN : rd.col - SPAN, side1 = vert ? rd.row + rd.height : rd.col + rd.width;
        const lo = vert ? rd.col : rd.row, hi = (vert ? rd.col + rd.width : rd.row + rd.height) - SPAN;
        const cr = vert ? col : row;
        if (cr < lo - 5 || cr > hi + 5) continue;            // generous: a corner is often dropped a little off
        const crSnap = Math.abs(cr - lo) <= 3 ? lo : Math.max(lo, Math.min(hi, cr));
        for (const target of [side0, side1]) {
          const d = Math.abs(along - target);
          if (d <= 2 && d + Math.abs(cr - crSnap) < bestD) {
            bestD = d + Math.abs(cr - crSnap);
            best = vert ? { col: crSnap, row: target } : { col: target, row: crSnap };
          }
        }
        continue;
      }
      const cross = vert ? col - rd.col : row - rd.row;
      if (Math.abs(cross) > 2) continue;
      const a = vert ? row : col, s = vert ? rd.row : rd.col, len = vert ? rd.height : rd.width;
      for (const target of [s + len, s - SPAN]) {
        const d = Math.abs(a - target);
        if (d <= 2 && d + Math.abs(cross) < bestD) {
          bestD = d + Math.abs(cross);
          best = vert ? { col: rd.col, row: target } : { col: target, row: rd.row };
        }
      }
    }
    return best || { col, row };
  }

  // What each edge of a bridge piece meets, for drawing it so a run reads
  // as one structure: 'bridge' / 'road' (carry straight on), 'land' (an
  // abutment on the bank) or 'water' (an open end, barriered off). Sides
  // only care whether a road or bridge joins there. Cached briefly: roads
  // rarely change and this runs per frame.
  function links(e, t) {
    if (e._bl && t - e._blAt < 0.5 && e._blN === EntityRegistry.getByType(T.ROAD).size) return e._bl;
    const vert = _vertical(e._rotation), c0 = e.col, r0 = e.row, w = e.width || SPAN, h = e.height || SPAN;
    const kind = (c, r) => {
      const rd = _roadsCovering(c, r, e);
      if (rd && !rd._irreparable) return rd._bridge ? 'bridge' : 'road';   // a wreck joins nothing
      if (!GridManager.inBounds(c, r)) return 'land';
      return WaterSystem.isWater(c, r) ? 'water' : 'land';
    };
    const midC = c0 + (w >> 1), midR = r0 + (h >> 1);
    // A side joins if a road or bridge touches it anywhere along the deck,
    // not just at its midpoint (a T-junction laid a little off-centre).
    const side = (pts) => {
      let k = 'water';
      for (const [c, r] of pts) { const x = kind(c, r); if (x === 'bridge' || x === 'road') return x; if (x === 'land') k = 'land'; }
      return k;
    };
    const along = (fixed, horiz) => [1, 2, 3, 4].map(i => horiz ? [c0 + i, fixed] : [fixed, r0 + i]);
    // Ends: start = north/west, end = south/east. Sides: left = west/north, right = east/south.
    const out = vert
      ? { start: kind(midC, r0 - 1), end: kind(midC, r0 + h), left: side(along(c0 - 1, false)), right: side(along(c0 + w, false)) }
      : { start: kind(c0 - 1, midR), end: kind(c0 + w, midR), left: side(along(r0 - 1, true)), right: side(along(r0 + h, true)) };
    e._bl = out; e._blAt = t; e._blN = EntityRegistry.getByType(T.ROAD).size;
    return out;
  }

  // The outer tile either side of a bridge is truss and parapet, not road:
  // solid to trucks, whether driven by hand or routed. Open where a road
  // joins from that side; a corner's closed end is solid as well.
  function railAt(road, c, r) {
    if (!road || !road._bridge) return false;
    const vert = _vertical(road._rotation), w = road.width || SPAN, h = road.height || SPAN;
    const a = vert ? r - road.row : c - road.col;          // along the deck
    const x = vert ? c - road.col : r - road.row;          // across it
    if (a < 0 || a >= (vert ? h : w) || x < 0 || x >= (vert ? w : h)) return false;
    if (road._irreparable) return true;   // blown down: no deck to drive
    const L = links(road, performance.now() / 1000);
    const joinL = L.left === 'road' || L.left === 'bridge', joinR = L.right === 'road' || L.right === 'bridge';
    const gap = a >= 1 && a <= 4;
    if (x === 0) return !(joinL && gap);
    if (x === (vert ? w : h) - 1) return !(joinR && gap);
    // A corner: a dead end with a road joining at the side is closed off
    const side = joinL || joinR, dead = k => k === 'water' || k === 'land';
    if (side && a === 0 && dead(L.start)) return true;
    if (side && a === (vert ? h : w) - 1 && dead(L.end)) return true;
    return false;
  }

  // Is a truck on this bridge right now? Taking it away then would leave
  // the truck sitting in the water with no way off.
  function truckOn(road) {
    const x0 = road.col * TILE, y0 = road.row * TILE, x1 = x0 + road.width * TILE, y1 = y0 + road.height * TILE;
    for (const trk of EntityRegistry.getByType(T.TRUCK)) {
      const tx = trk._wx !== undefined ? trk._wx : trk.col * TILE, ty = trk._wy !== undefined ? trk._wy : trk.row * TILE;
      if (tx + TILE > x0 && tx < x1 && ty + TILE * 3 > y0 && ty < y1) return true;
    }
    return false;
  }

  // ── Ghost read-outs ──────────────────────────────────────────────
  // The tag under the cursor when a building would land on water, or for
  // the Bridge tool: what the water adds to the price, before you pay it.
  function drawPlacementTag(g, type, col, row, rot) {
    if (!type || typeof TerrainSystem === 'undefined' || !TerrainSystem.drawTag) return;
    const d = EntityDefs[type];
    if (!d) return;
    if (type === T.BRIDGE) {
      const s = snapBridge(col, row, rot);
      const run = bridgeRun(s.col, s.row, rot), n = run.pieces.length;
      const a = run.pieces[0], z = run.pieces[n - 1];
      const tc = Math.min(a.col, z.col), tr = Math.min(a.row, z.row);
      const tw = Math.max(a.col, z.col) + SPAN - tc, th = Math.max(a.row, z.row) + SPAN - tr;
      if (run.ok) TerrainSystem.drawTag(g, tc, tr, tw, th, `Bridge ${formatMoney(run.cost)}`,
        run.water ? `${n > 1 ? `${n} spans · ` : ''}${run.water} water tile${run.water === 1 ? '' : 's'} × ${formatMoney(BRIDGE_PER_TILE)} + road`
                  : 'approach onto the bank', 0, true);
      else if (!run.land || GridManager.inBounds(col, row)) TerrainSystem.drawTag(g, tc, tr, tw, th, run.reason, '', -1, true);
      return;
    }
    if (type === T.POLE) {
      const w = GridManager.inBounds(col, row) ? GridManager.getEntity(col, row) : null;
      if (!w || w.type !== T.WATER) return;
      const p = polePlan(w);
      if (!p.ok) { TerrainSystem.drawTag(g, col, row, 1, 1, p.reason, '', -1, true); return; }
      TerrainSystem.drawTag(g, col, row, 1, 1, `Pole in water ${formatMoney(p.cost)}`,
        `concrete footing +${formatMoney(POLE_FOOTING)}`, -1, true);
      return;
    }
    if (type === T.POWERTOWER) {
      const w = d.width || 2, h = d.height || 2;
      const p = towerPlan(col, row, w, h);
      if (!p) return;
      if (!p.ok) { TerrainSystem.drawTag(g, col, row, w, h, p.reason, '', -1, true); return; }
      const base = typeof buildCost === 'function' ? buildCost(type) : (d.cost || 0);
      TerrainSystem.drawTag(g, col, row, w, h, `Tower in water ${formatMoney(base + p.cost)}`,
        `concrete footings +${formatMoney(TOWER_FOOTING)}`, -1, true);
      return;
    }
    // Footprints turn with the placement rotation (as in tryPlace), bar the Chemical Plant's.
    const swap = (rot || 0) % 2 === 1 && type !== T.CHEMICALPLANT;
    const w = swap ? (d.height || 1) : (d.width || 1), h = swap ? (d.width || 1) : (d.height || 1);
    const p = fillPlan(type, col, row, w, h);
    if (!p) return;
    if (!p.ok) { TerrainSystem.drawTag(g, col, row, w, h, p.reason, '', -1, true); return; }
    const base = typeof buildCost === 'function' ? buildCost(type) : (d.cost || 0);
    TerrainSystem.drawTag(g, col, row, w, h, `Fill water +${formatMoney(p.cost)}`,
      `${p.tiles.length} tile${p.tiles.length === 1 ? '' : 's'} × ${formatMoney(FILL_PER_TILE)} · ${formatMoney(base + p.cost)} total`, -1, true);
  }

  return {
    FILL_PER_TILE, BRIDGE_PER_TILE, POLE_FOOTING, TOWER_FOOTING, SPAN,
    unlocked, isReservoir, noFill,
    fillPlan, fill, canFillTile, moveFillCost, refillAfterMove, reclaimFill, polePlan, towerPlan, claimTower,
    bridgePlan, bridgeRun, claimBridge, relinkBridge, snapBridge, links, truckOn, railAt,
    drawPlacementTag,
  };
})();
