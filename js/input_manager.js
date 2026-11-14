/* ═══════════════════════════════════════════════════════════════════
   INPUT MANAGER
   All mouse/keyboard/touch input handling: placement, dragging,
   selection, camera controls, and keyboard shortcuts.
   ═══════════════════════════════════════════════════════════════════ */

const InputManager = (() => {
  const canvas = document.getElementById('canvas');

  // Resource deposits are fixed terrain features — never movable or deletable
  // directly. They can only be cleared indirectly (exhausted by mining, or
  // restored automatically when their mine/pump jack is removed).
  const DEPOSIT_TYPES = new Set([T.COALDEPOSIT, T.OILDEPOSIT, T.URANIUMDEPOSIT, T.SULFURDEPOSIT, T.LITHIUMDEPOSIT, T.HELIUMDEPOSIT, T.RAREEARTHDEPOSIT, T.GEODEPOSIT]);

  // ── Circuit Switch assignment mode ───────────────────────────────
  // While active, a left click toggles the clicked building's membership of
  // this switch's roster instead of selecting it. Escape leaves the mode.
  let _circuitAssignSw = null;

  // ── Deposits caught under a mine's footprint ─────────────────────
  // A mine is always bigger than the deposit it works — an MK1 coal mine adds
  // a one-tile ring, the ore mines are 4×5 — so two deposits that spawned
  // close together used to block each other's mines forever: the footprint
  // check rejected the neighbour, and a deposit can't be cleared by hand
  // (see DEPOSIT_TYPES above). The mine now builds straight over a
  // neighbouring deposit. The covered one is lifted off the grid, kept as a
  // snapshot on the mine, and put back untouched — full reserve and all —
  // when that mine is removed, so the two seams are worked one after the
  // other instead of neither being workable at all.
  function _depositsCoveredBy(col, row, w, h, keep) {
    const found = [];
    for (let r = row; r < row + h; r++)
      for (let c = col; c < col + w; c++) {
        const t = GridManager.getEntity(c, r);
        if (!t || t === keep || !DEPOSIT_TYPES.has(t.type)) continue;
        if (!found.includes(t)) found.push(t);
      }
    return found;
  }
  // Plain-object snapshot: it rides on the mine through save/load, where an
  // object reference would not survive.
  function _snapshotDeposit(d) {
    return {
      type: d.type, col: d.col, row: d.row,
      width: d.width || 2, height: d.height || 2,
      _tierLabel: d._tierLabel, _revealed: d._revealed,
      _outputVariance: d._outputVariance,
      coalAmount: d.coalAmount, coalMax: d.coalMax,
      _pressure: d._pressure, _totalUnits: d._totalUnits,
      _oreAmount: d._oreAmount, _oreMax: d._oreMax,
      _uraniumPhase: d._uraniumPhase, _sulfurPhase: d._sulfurPhase,
      _lithiumPhase: d._lithiumPhase, _coalPhase: d._coalPhase, _heliumPhase: d._heliumPhase,
      _rareEarthPhase: d._rareEarthPhase,
    };
  }
  function _coverDeposits(mine, deposits) {
    if (!deposits || !deposits.length) return;
    mine._coveredDeposits = mine._coveredDeposits || [];
    for (const d of deposits) {
      mine._coveredDeposits.push(_snapshotDeposit(d));
      GridManager.removeEntityFootprint(d);
      EntityRegistry.remove(d);
    }
  }
  // Puts the covered deposits back. Only onto tiles that are free now, so a
  // deposit never stomps something built since; one with nowhere left to go
  // is dropped rather than half-stamped.
  function _restoreCoveredDeposits(mine) {
    const snaps = mine && mine._coveredDeposits;
    if (!snaps || !snaps.length) return;
    for (const s of snaps) {
      let clear = true;
      for (let r = s.row; r < s.row + s.height && clear; r++)
        for (let c = s.col; c < s.col + s.width && clear; c++)
          if (!GridManager.inBounds(c, r) || GridManager.getEntity(c, r)) clear = false;
      if (!clear) continue;
      const d = new Entity(s.type, s.col, s.row);
      for (const k of Object.keys(s)) if (k !== 'type' && s[k] !== undefined) d[k] = s[k];
      d._hasMine = false;
      GridManager.setEntityFootprint(d);
      EntityRegistry.add(d);
    }
    mine._coveredDeposits = null;
  }

  // DAM and SHAFT bridge/impound specific water tiles via a captured
  // _waterTiles snapshot (or, for DAM, an irregular _spanTiles footprint)
  // that the generic drag-move path doesn't know how to re-derive at a new
  // location. Relocating one via drag would strand the water restoration at
  // the old (now-empty) tiles and leave the entity's real new footprint
  // with no water underneath once later deleted — so relocation is
  // disabled and a drag always snaps back to the origin tile.
  // (HYDROTURBINE used to be here for the same reason — it's since gotten
  // its own relocate path, ReservoirSystem.relocateTurbine, that re-derives
  // the water snapshot at the destination the same way buildTurbine does;
  // see the T.HYDROTURBINE branches in the drag handlers below.)
  // Deposit-anchored extraction buildings keep a reference to their linked
  // deposit (_linkedDeposit) that never updates with the building's live
  // position — relocating one away from its deposit would leave it mining
  // from thin air at the new spot while orphaning the deposit's tile at the
  // old one, since only tryRemove() (not drag-relocate) knows how to restore
  // the deposit underneath. Simplest correct fix: these can't be relocated.
  // Government buildings (City Hall and every civic building) are fixed in
  // place too: the government zone is built around where they stand, and
  // they're already protected from removal (see _GOV_PROTECT in tryRemove).
  // Parks and amenities (PARK_TYPES — Tree-Lined Street, Small Park, ...)
  // spawn in from the neighbourhood's requests at a spot it chose; the player
  // doesn't place them, so they don't get to move them either.
  // Gas Stations used to be here from when the game scattered them itself;
  // the player builds them now, so they move like any other kit (a job
  // site's fuel depot excepted, below).
  const NOT_RELOCATABLE = new Set([
    T.DAM, T.SHAFT,
    T.PUMPJACK, T.PUMPJACK2, T.COALMINE, T.COALMINE2, T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2, T.LITHIUMMINE, T.RAREEARTHMINE, T.HELIUMWELL, T.HELIUMWELL2, T.GEOWELL,
    T.GOVBUILDING, T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB, T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ,
    ...PARK_TYPES,
  ]);

  // Waste processing facilities are a one-per-stream commitment (see
  // PLACEMENT_LIMITS), so they're treated like placed properties rather than
  // freely rearrangeable kit: a relocation goes through the same drag-and-
  // confirm flow customer buildings use, and removal is a confirmed
  // demolition — neither is refunded or undoable. Fees are a share of the
  // facility's build cost.
  // Stacking a wire under a belt that's already on the grid changes what
  // conducts without any EntityRegistry add/remove, so PowerNetwork's
  // topology-versioned wire-hop cache wouldn't notice. Cycling the host
  // through the registry bumps that version.
  function _touchTopology(e) { EntityRegistry.remove(e); EntityRegistry.add(e); }

  const WASTE_FACILITY_TYPES = new Set([T.COALWASTE, T.OILWASTE, T.NUCLEARWASTE]);
  const WASTE_REMOVE_FEE_PCT   = 1.00;
  const WASTE_RELOCATE_FEE_PCT = 0.80;
  // The placement confirm (see _tryPlaceTile): a dialog is up, and the
  // player has said yes to this spot.
  let _wasteSpotAsking = false, _wasteSpotOk = false;
  // All of that is for the player's own grid. On a job site the facility is
  // kit for one contract, built, moved and removed like anything else there.
  function _wasteFacilityFixed(type) {
    return WASTE_FACILITY_TYPES.has(type) && !ContractSystem.isAtSite();
  }
  function _wasteFacilityFee(e, pct) {
    return Math.round((e.def?.cost ?? EntityDefs[e.type]?.cost ?? 0) * pct);
  }

  // Rectangle-overlap deposit lookup — mirrors the linking logic in
  // OilSystem.tickPumpJack. More reliable than a per-tile GridManager.getEntity
  // scan: it only needs the deposit's own col/row/width/height, so it finds
  // the deposit as long as the placement footprint overlaps it AT ALL,
  // regardless of exactly which tile was clicked or how footprint cells
  // are individually registered on the grid.
  function _depositOverlap(depositType, col, row, w, h) {
    for (const dep of EntityRegistry.getByType(depositType)) {
      const dw = dep.width || 2, dh = dep.height || 2;
      const overlapC = col < dep.col + dw && col + w > dep.col;
      const overlapR = row < dep.row + dh && row + h > dep.row;
      if (overlapC && overlapR) return dep;
    }
    return null;
  }

  // Tools built ON a deposit, and the deposit each one needs. Read by both
  // the ghost (canPlace) and the mousedown handler, so a click lands
  // wherever the ghost says it will.
  const MINE_DEPOSIT = {
    [T.GEOWELL]:       T.GEODEPOSIT,
    [T.COALMINE]:      T.COALDEPOSIT,
    [T.COALMINE2]:     T.COALDEPOSIT,
    [T.URANIUMMINE]:   T.URANIUMDEPOSIT,
    [T.SULFURMINE]:    T.SULFURDEPOSIT,
    [T.SULFURMINE2]:   T.SULFURDEPOSIT,
    [T.LITHIUMMINE]:   T.LITHIUMDEPOSIT,
    [T.RAREEARTHMINE]: T.RAREEARTHDEPOSIT,
    [T.HELIUMWELL]:    T.HELIUMDEPOSIT,
    [T.HELIUMWELL2]:   T.HELIUMDEPOSIT,
  };
  // Whether `tool`'s footprint anchored at col,row touches the deposit it
  // builds on. The click used to test only the footprint's top-left tile, so
  // with a wire, belt or road there the press turned into a camera pan while
  // the ghost showed green — placing took several clicks until the corner
  // happened to land on bare ground.
  function _overOwnDeposit(tool, col, row) {
    const depType = MINE_DEPOSIT[tool];
    if (depType === undefined) return false;
    const def = EntityDefs[tool];
    return !!_depositOverlap(depType, col, row, def?.width || 1, def?.height || 1);
  }

  // Shared state read by RenderSystem for ghost cursor
  const state = {
    selectedTool:      null,
    hoverCol:          0,
    hoverNetworkId:    -1,  // networkId of wire under cursor (-1 = none)
    hoverRow:          0,
    canPlace:          false,
    placementRotation: 0,
    undergndPipeAxis:  'h',  // axis the next-placed underground pipe will run — toggled with R
    undergndBeltAxis:  'h',  // same, for the underground belt
    // The next Conveyor Splitter's settings: R turns the favoured side, and
    // changing a placed splitter in its panel (or Q on one) carries over.
    splitter:          { mode: 'even', side: 0, ratio: 0.7 },
  };

  function canvasMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Convert raw screen position → world position → tile, accounting for camera
  function screenToTile(sx, sy) {
    const w = Camera.screenToWorld(sx, sy);
    return _centreOnCursor(GridManager.worldToTile(w.x, w.y));
  }

  // Multi-tile buildings are anchored by their top-left tile, but the player
  // aims with the middle of the building — so while one is the selected tool,
  // shift the cursor tile up/left by half its footprint. Everything
  // downstream (ghost, validity check, click, drag placement) keeps working
  // in anchor space, so this one spot centres every large building. 1×1
  // tools, deletion, inspection clicks with no tool and the shaft (whose
  // footprint follows its drag orientation, not its def) are left alone.
  function _centreOnCursor(tile) {
    const tool = state.selectedTool;
    if (!tool || tool === 'delete' || tool === T.SHAFT) return tile;
    const d = EntityDefs[tool];
    const w = d?.width || 1, h = d?.height || 1;
    if (w <= 1 && h <= 1) return tile;
    return { col: tile.col - Math.floor((w - 1) / 2), row: tile.row - Math.floor((h - 1) / 2) };
  }

  // Count how many placed entities match a given type (anchor tile only for multi-tile)
  function countEntitiesOfType(type) {
    return EntityRegistry.getByType(type).size;
  }

  // Buildings the city only ever needs a fixed number of. Read by BOTH
  // tryPlace (which refuses the click) and the placement ghost (which turns
  // red at the cap), so the cursor never promises a placement that can't
  // happen — the caps used to live in one place or the other, never both.
  const PLACEMENT_LIMITS = {
    [T.RESEARCH]:     { max: 1, msg: 'Only 1 Research Station MK1 allowed!' },
    [T.RESEARCH2]:    { max: 1, msg: 'Only 1 Research Station MK2 allowed!' },
    [T.RESEARCH3]:    { max: 1, msg: 'Only 1 Research Station MK3 allowed!' },
    [T.MK4RESEARCH]:  { max: 1, msg: 'Only 1 MK4 Research Station allowed!' },
    [T.MK5RESEARCH]:  { max: 1, msg: 'Only 1 MK5 Research Station allowed!' },
    [T.MONITOR]:      { max: 1, msg: 'Only 1 Monitoring Station allowed!' },
    [T.MONITOR2]:     { max: 1, msg: 'Only 1 Monitoring Station MK2 allowed!' },
    [T.ENGOFFICE]:    { max: 1, msg: 'Only 1 Engineering Office allowed!' },
    [T.BEACON]:       { max: 1, msg: 'Only 1 Beacon allowed!' },
    // One facility per waste stream serves the whole city — trucks route to
    // whichever facility matches the cargo they're carrying, so a second of
    // the same kind adds nothing but another power draw.
    [T.COALWASTE]:    { max: 1, msg: 'Only 1 Coal Waste Processing Facility allowed!' },
    [T.OILWASTE]:     { max: 1, msg: 'Only 1 Oil Waste Processing Facility allowed!' },
    [T.NUCLEARWASTE]: { max: 1, msg: 'Only 1 Nuclear Waste Processing Facility allowed!' },
  };
  function atPlacementLimit(type) {
    const lim = PLACEMENT_LIMITS[type];
    return !!lim && countEntitiesOfType(type) >= lim.max;
  }

  // Underground pipe axis auto-orientation — look at the 4 immediate
  // neighbours for an existing pipe/underground-pipe and infer which axis
  // continues that line, so placing it in the middle of an existing run
  // doesn't require remembering to press R first. Falls back to the
  // manually-toggled state.undergndPipeAxis when neighbours are ambiguous
  // (e.g. placed on empty ground, or pipes on all 4 sides).
  function inferUndergndPipeAxis(col, row) {
    const isPipeLike = (e) => e && (e.type === T.PIPE || e.type === T.UNDERGNDPIPE);
    const vScore = (isPipeLike(GridManager.getEntity(col, row - 1)) ? 1 : 0) + (isPipeLike(GridManager.getEntity(col, row + 1)) ? 1 : 0);
    const hScore = (isPipeLike(GridManager.getEntity(col - 1, row)) ? 1 : 0) + (isPipeLike(GridManager.getEntity(col + 1, row)) ? 1 : 0);
    if (vScore > hScore) return 'v';
    if (hScore > vScore) return 'h';
    return null;
  }

  // A stamped piece keeps the pairing it was captured with (older blueprints
  // carry none, and pair up the way a hand-placed end does).
  function _udgPairPlaced(e) {
    if (state.bpUdgSpans) { e._udgNeg = state.bpUdgSpans[0]; e._udgPos = state.bpUdgSpans[1]; }
    else udgPairNew(e);
  }

  // Underground belt twin of inferUndergndPipeAxis: follow the belt line it
  // is being dropped into, so a tunnel end continues the run it sits on.
  function inferUndergndBeltAxis(col, row) {
    const beltAt = (c, r) => !!beltOf(GridManager.getEntity(c, r));
    const vScore = (beltAt(col, row - 1) ? 1 : 0) + (beltAt(col, row + 1) ? 1 : 0);
    const hScore = (beltAt(col - 1, row) ? 1 : 0) + (beltAt(col + 1, row) ? 1 : 0);
    if (vScore > hScore) return 'v';
    if (hScore > vScore) return 'h';
    return null;
  }

  let _wxVisited = null;   // wouldExceedWireHops scratch, one byte per tile
  function wouldExceedWireHops(col, row) {
    const MAX  = PowerNetwork.MAX_WIRE_HOPS;
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];

    // BFS outward from the candidate tile through existing wires.
    // Collect the hop-distance to every reachable non-wire anchor.
    // Runs per dragged tile AND on every hover move with the wire tool, so
    // it uses a shared numeric scratch buffer (no string keys / Set) and
    // stops early — see the break below.
    if (!_wxVisited || _wxVisited.length !== ROWS * COLS) _wxVisited = new Uint8Array(ROWS * COLS);
    const visited = _wxVisited;
    const touched = [row * COLS + col];
    visited[touched[0]] = 1;
    let   frontier = [[col, row, 0]];   // [c, r, depth]
    const anchorDists = [];             // distances to each anchor found

    while (frontier.length) {
      const next = [];
      for (const [c, r, d] of frontier) {
        for (const [dc, dr] of dirs) {
          const nc = c + dc, nr = r + dr;
          if (!GridManager.inBounds(nc, nr)) continue;
          const idx = nr * COLS + nc;
          if (visited[idx]) continue;
          visited[idx] = 1;
          touched.push(idx);
          const e = GridManager.getEntity(nc, nr);
          if (!e) continue;
          if (e.type !== T.WIRE) {
            // Found an anchor at depth d+1 (d wires traversed, then this
            // non-wire). Same rule as the power network's range pass:
            // scenery (trees, roads, deposits) anchors nothing.
            // Any pole counts, in range or not yet. A pole's own range is only
            // worked out from the wires joining it, and not until a drag is
            // released (PowerNetwork.setDragBatching), so going by it refused
            // the first wire off a freshly placed pole and stopped a run
            // dragged on through one pole toward the next. Whether the pole
            // then carries power is the network's call, as before.
            if (e.type === T.POLE || PowerNetwork.isRangeAnchor(e)) anchorDists.push(d + 1);
          } else {
            next.push([nc, nr, d + 1]);
          }
        }
      }
      frontier = next;
      // Only the two nearest anchors are used below, and BFS drains a whole
      // level before getting here, so nothing further out can change the
      // answer. Without this every tile walked the ENTIRE connected wire
      // network — the lag when running wire across a big grid.
      if (anchorDists.length >= 2) break;
    }
    for (let i = 0; i < touched.length; i++) visited[touched[i]] = 0;

    // Rule 1: candidate must be reachable from at least one anchor within MAX hops
    if (anchorDists.length === 0) return true;  // no anchor reachable — floating
    if (Math.min(...anchorDists) > MAX) return true;  // too far from every anchor

    // Rule 2: no pair of anchors may be connected through this wire
    // with a total chain length > MAX.
    // Each distance counts the wires from the anchor up to AND including the
    // candidate, so two anchors at d1 and d2 have d1 + d2 - 1 wires between
    // them — the candidate is in both counts. (Summing them straight counted
    // it twice, so a full MAX-tile gap between two towers was refused.)
    if (anchorDists.length >= 2) {
      anchorDists.sort((a, b) => a - b);
      // Closest pair gives the shortest chain — if even that exceeds MAX, block.
      if (anchorDists[0] + anchorDists[1] - 1 > MAX) return true;
    }

    return false;
  }

  // Coal mines are built around their deposit. MK1 is the deposit plus a
  // one-tile yard on every side (2×2 seam → 4×4 mine, 3×2 → 5×4, 3×3 →
  // 5×5); MK2 is a fixed-size plant (6×6) centred on it — a 2×2 seam sits 2
  // tiles in from every edge, a 3×3/4×4 seam 1. Either way the deposit lies
  // inside the footprint and the rest of it has to be in bounds and clear.
  // (MK1 mines built before it grew keep their saved exact-cover size.)
  function _coalMineFootprint(deposit, type) {
    const dw = deposit.width || 2, dh = deposit.height || 2;
    if (type === T.COALMINE2) {
      const def = EntityDefs[T.COALMINE2];
      const mw = def.width || 6, mh = def.height || 6;
      return { col: deposit.col - Math.floor((mw - dw) / 2),
               row: deposit.row - Math.floor((mh - dh) / 2), w: mw, h: mh };
    }
    return { col: deposit.col - 1, row: deposit.row - 1, w: dw + 2, h: dh + 2 };
  }

  // Why a mine of `type` can't be built on `deposit`, or null if it can.
  function _coalMineFootprintClear(deposit, type) {
    const fp = _coalMineFootprint(deposit, type);
    if ((deposit.width || 2) > fp.w || (deposit.height || 2) > fp.h) return 'Deposit is too large for this mine!';
    if (!GridManager.inBounds(fp.col, fp.row) ||
        !GridManager.inBounds(fp.col + fp.w - 1, fp.row + fp.h - 1)) {
      return `${type === T.COALMINE2 ? 'Coal Mine MK2' : 'Coal Mine'} extends out of bounds; deposit too close to map edge!`;
    }
    for (let r = fp.row; r < fp.row + fp.h; r++)
      for (let c = fp.col; c < fp.col + fp.w; c++) {
        const tile = GridManager.getEntity(c, r);
        // A neighbouring deposit is built over, not a blocker — it can't be
        // cleared by hand, so rejecting it would strand both seams forever.
        if (tile && tile !== deposit && !GridManager.isVegetation(tile) && !DEPOSIT_TYPES.has(tile.type))
          return 'Mine footprint blocked: clear the surrounding tiles first!';
      }
    return null;
  }

  // Uranium, sulfur and lithium mines are fixed-size and centred over their deposit.
  function _centredMineFootprint(dep, type) {
    const def = EntityDefs[type];
    const w = def.width || 4, h = def.height || 5;
    const dw = dep.width || 2, dh = dep.height || 2;
    return { col: dep.col - Math.floor((w - dw) / 2), row: dep.row - Math.floor((h - dh) / 2), w, h };
  }

  // Where a pump jack of `type` sits on `dep`. The MK1 anchors on the
  // deposit's top-left corner (its original behaviour); the bigger MK2 is
  // centred over the deposit.
  function _pumpJackFootprint(dep, type) {
    const dw = dep.width || 2, dh = dep.height || 2;
    if (type === T.PUMPJACK2) {
      const d = EntityDefs[T.PUMPJACK2];
      const w = Math.max(d.width || 4, dw), h = Math.max(d.height || 4, dh);
      return { col: dep.col - Math.floor((w - dw) / 2), row: dep.row - Math.floor((h - dh) / 2), w, h };
    }
    return { col: dep.col, row: dep.row, w: Math.max(3, dw), h: Math.max(3, dh) };
  }

  // Why a pump jack of `type` can't go on `dep`, or null if it can.
  function _pumpJackBlocked(dep, type) {
    const label = EntityDefs[type].label;
    if (dep._pressure !== undefined && dep._pressure <= 0) return 'This deposit is fully depleted!';
    if ((dep.width || 2) < 2 || (dep.height || 2) < 2) return `Deposit too small for a ${label}!`;
    for (const t of [T.PUMPJACK, T.PUMPJACK2])
      for (const j of EntityRegistry.getByType(t))
        if (j._linkedDeposit === dep || (j._depositCol === dep.col && j._depositRow === dep.row))
          return 'This deposit already has a Pump Jack!';
    if (type === T.PUMPJACK2) {
      const fp = _pumpJackFootprint(dep, type);
      if (!GridManager.inBounds(fp.col, fp.row) || !GridManager.inBounds(fp.col + fp.w - 1, fp.row + fp.h - 1))
        return `${label} extends out of bounds; deposit too close to map edge!`;
      for (let r = fp.row; r < fp.row + fp.h; r++)
        for (let c = fp.col; c < fp.col + fp.w; c++) {
          const tile = GridManager.getEntity(c, r);
          if (tile && tile !== dep && !GridManager.isVegetation(tile) && !DEPOSIT_TYPES.has(tile.type))
            return `${label} footprint blocked: clear the surrounding tiles first!`;
        }
    }
    return null;
  }

  // Blueprint stamps: what tryPlace would say about one piece, for the cases
  // a plain "are its tiles free" test gets wrong — a build cap (with `extra`
  // more of the type already counted earlier in the same stamp), a pump
  // jack, whose oil deposit always reads as occupied, and anything built in
  // water, whose tiles do too. null = no opinion.
  function stampPieceCheck(type, col, row, w, h, extra = 0) {
    const lim = PLACEMENT_LIMITS[type];
    if (lim && countEntitiesOfType(type) + extra >= lim.max) return { ok: false, why: lim.msg };
    if (type === T.PUMPJACK || type === T.PUMPJACK2) {
      const dep = _depositOverlap(T.OILDEPOSIT, col, row, w, h);
      const why = dep ? _pumpJackBlocked(dep, type) : `${EntityDefs[type].label} must be placed on an oil deposit!`;
      return { ok: !why, why };
    }
    if (type === T.GEOWELL) {
      const dep = _depositOverlap(T.GEODEPOSIT, col, row, w, h);
      return dep ? GeothermalSystem.canPlaceWell(dep) : { ok: false, why: 'Geothermal Well must be placed on a geothermal deposit!' };
    }
    // Its well is usually in the same stamp, so there's no port to look for
    // yet, and the well clears any of the deposit it leaves uncovered.
    if (type === T.GEOTURBINE) {
      for (let r = row; r < row + h; r++)
        for (let c = col; c < col + w; c++) {
          const t = GridManager.getEntity(c, r);
          if (!GridManager.inBounds(c, r) || (t && !GridManager.isVegetation(t) && t.type !== T.GEODEPOSIT))
            return { ok: false, why: 'Turbine footprint blocked: clear the tiles first!' };
        }
      return { ok: true };
    }
    if (type === T.WATEREXTRACTOR) return { ok: _allLake(col, row, w, h), why: 'Water Extractor must be fully on a lake!' };
    if (type === T.HYDROTURBINE) {
      const chk = ReservoirSystem.canBuildTurbine(col, row);
      return { ok: chk.ok, why: chk.reason };
    }
    const fill = type === T.POWERTOWER ? WaterBuild.towerPlan(col, row, w, h) : WaterBuild.fillPlan(type, col, row, w, h);
    return fill ? { ok: fill.ok, why: fill.reason } : null;
  }

  // The open deposit a blueprint's well would land on. A well only ever
  // builds at its deposit's corner, so the stamp snaps to put it there.
  function stampWellDeposit(col, row, w, h) {
    const dep = _depositOverlap(T.GEODEPOSIT, col, row, w, h);
    return dep && !dep._hasWell ? dep : null;
  }

  function tryPlacePumpJack(dep, type) {
    const why = _pumpJackBlocked(dep, type);
    if (why) { flashMessage(why); return; }
    const cost = EntityDefs[type].cost;
    if (!Economy.canAfford(cost)) { flashMessage('Not enough funds!'); return; }
    Economy.spend(cost);
    const fp = _pumpJackFootprint(dep, type);
    // Vegetation under the wider MK2 footprint is cleared, as for mines.
    for (let r = fp.row; r < fp.row + fp.h; r++)
      for (let c = fp.col; c < fp.col + fp.w; c++) {
        const tile = GridManager.getEntity(c, r);
        if (tile && GridManager.isVegetation(tile)) GridManager.removeEntity(c, r);
      }
    const jack = new Entity(type, fp.col, fp.row);
    jack.width = fp.w; jack.height = fp.h;
    jack._linkedDeposit = dep;
    jack._depositCol = dep.col; jack._depositRow = dep.row;
    jack._pressure = dep._pressure !== undefined ? dep._pressure : 1.0;
    GridManager.setEntityFootprint(jack);
    EntityRegistry.add(jack);
    SFX.thump();
    Progression.checkUnlocks();
  }

  function tryPlaceCoalMine(col, row, deposit, type = T.COALMINE) {
    const isMk2 = type === T.COALMINE2;
    // Both tiers build around the deposit (see _coalMineFootprint).
    const fp = _coalMineFootprint(deposit, type);
    ({ col, row } = fp);
    const cost = EntityDefs[type].cost;
    const why = _coalMineFootprintClear(deposit, type);
    if (why) { flashMessage(why); return; }
    if (!Economy.canAfford(cost)) { flashMessage('Not enough funds!'); return; }
    Economy.spend(cost);
    const entity = new Entity(type, col, row);
    entity.width     = fp.w;
    entity.height    = fp.h;
    entity._rotation = state.placementRotation || 0;

    if (!deposit._outputVariance) deposit._outputVariance = 0.8 + Math.random() * 0.4;
    if (deposit._hasMine) {
      flashMessage('This deposit already has a mine!');
      Economy.spend(-cost);
      return;
    }
    deposit._hasMine = true;
    _coverDeposits(entity, _depositsCoveredBy(fp.col, fp.row, fp.w, fp.h, deposit));
    entity._linkedDeposit      = deposit;
    entity._depositCol         = deposit.col;
    entity._depositRow         = deposit.row;
    entity._depositWidth       = deposit.width  || 2;
    entity._depositHeight      = deposit.height || 2;
    entity._depositCoalAmount  = deposit.coalAmount;
    entity._depositCoalMax     = deposit.coalMax;
    entity._coalRate = CoalSystem.outputForDeposit(deposit, isMk2);
    entity.def.powerOutput = 0;

    GridManager.setEntityFootprint(entity);
    HistoryManager.record({ type: 'place', entity, cost });
    AmenityRequestSystem.onAmenityPlaced(type, col, row);
    SFX.thump();
    PowerNetwork.recomputeWireHops();
    const label = isMk2 ? 'Coal Mine MK2' : 'Coal Mine';
    showToast(`⛏ ${label} placed: ${entity._coalRate.toFixed(1)} coal rate`, '#c06020', '#0e0800', '#604010');
  }

  function tryPlaceUraniumMine(deposit) {
    const def = EntityDefs[T.URANIUMMINE];
    const mw = def.width  || 4;
    const mh = def.height || 5;
    const { col, row } = _centredMineFootprint(deposit, T.URANIUMMINE);
    if (!GridManager.inBounds(col, row) || !GridManager.inBounds(col + mw - 1, row + mh - 1)) {
      flashMessage('Uranium Mine extends out of bounds; deposit too close to map edge!');
      return;
    }
    // Verify all non-deposit tiles in the mine footprint are empty
    for (let r = row; r < row + mh; r++)
      for (let c = col; c < col + mw; c++) {
        const tile = GridManager.getEntity(c, r);
        if (!tile) continue;
        // As with coal: a neighbouring deposit is covered, not a blocker.
        if (tile === deposit || GridManager.isVegetation(tile) || DEPOSIT_TYPES.has(tile.type)) continue;
        flashMessage('Mine footprint blocked: clear the surrounding tiles first!');
        return;
      }
    if (deposit._hasMine) {
      flashMessage('This deposit already has a mine!');
      return;
    }
    if (!Economy.canAfford(def.cost)) { flashMessage('Not enough funds!'); return; }
    Economy.spend(def.cost);
    const entity = new Entity(T.URANIUMMINE, col, row);
    entity.width  = mw;
    entity.height = mh;
    // OUT stub side: even = bottom-right end of the rail, odd = bottom-left.
    entity._rotation = state.placementRotation || 0;
    deposit._hasMine = true;
    _coverDeposits(entity, _depositsCoveredBy(col, row, mw, mh, deposit));
    // Persist deposit reference + metadata so removal/save can reconstruct it
    entity._linkedDeposit   = deposit;
    entity._depositCol      = deposit.col;
    entity._depositRow      = deposit.row;
    entity._depositWidth    = deposit.width  || 2;
    entity._depositHeight   = deposit.height || 2;
    entity._depositTier     = deposit._tierLabel || 'Uranium Deposit';
    entity._depositPhase    = deposit._uraniumPhase || 0;
    entity._depositOreAmount = deposit._oreAmount;
    entity._depositOreMax    = deposit._oreMax;
    GridManager.setEntityFootprint(entity);
    HistoryManager.record({ type: 'place', entity, cost: def.cost });
    SFX.thump();
    PowerNetwork.recomputeWireHops();
    Progression.checkUnlocks?.();
    showToast(`☢ Uranium Mine placed`, '#60ff80', '#041008', '#206040');
  }

  // Where a sulfur mine of `type` goes on `dep` at facing `rot`. The MK1 is
  // centred on the deposit. The bigger MK2 is laid so its OUT stub lands on
  // the tile an MK1's would at the same facing (it grows up and away from
  // the stub), so built over an MK1 it takes over the MK1's belt as it stands.
  function _sulfurMineFootprint(dep, type, rot = 0) {
    const fp = _centredMineFootprint(dep, T.SULFURMINE);
    if (type !== T.SULFURMINE2) return fp;
    const d = EntityDefs[T.SULFURMINE2], w = d.width || 6, h = d.height || 7;
    const right = ((rot || 0) % 2) === 0;
    return { col: right ? fp.col + fp.w - w : fp.col, row: fp.row + fp.h - h, w, h };
  }
  // Why a sulfur mine can't go on this footprint, or null if it can. `ignore`
  // is a mine being replaced, whose tiles count as free.
  function _sulfurMineBlocked(fp, deposit, label, ignore = null) {
    if (!GridManager.inBounds(fp.col, fp.row) || !GridManager.inBounds(fp.col + fp.w - 1, fp.row + fp.h - 1))
      return `${label} extends out of bounds; deposit too close to map edge!`;
    for (let r = fp.row; r < fp.row + fp.h; r++)
      for (let c = fp.col; c < fp.col + fp.w; c++) {
        const tile = GridManager.getEntity(c, r);
        // As with coal: a neighbouring deposit is covered, not a blocker.
        if (!tile || tile === deposit || tile === ignore || GridManager.isVegetation(tile) || DEPOSIT_TYPES.has(tile.type)) continue;
        return `Mine footprint blocked by ${tile.def?.label || tile.type} at ${c},${r}: clear the surrounding tiles first!`;
      }
    return null;
  }

  // `type` is either mark; `rot` keeps a replaced mine's facing (see
  // tryReplaceSulfurMine). Returns the new mine, or nothing if it wasn't built.
  function tryPlaceSulfurMine(deposit, type = T.SULFURMINE, rot = null) {
    const def = EntityDefs[type];
    // OUT stub side: even = bottom-right, odd = bottom-left.
    const facing = rot !== null ? rot : (state.placementRotation || 0);
    const fp = _sulfurMineFootprint(deposit, type, facing);
    const { col, row, w: mw, h: mh } = fp;
    const why = _sulfurMineBlocked(fp, deposit, def.label);
    if (why) { flashMessage(why); return; }
    if (deposit._hasMine) {
      flashMessage('This deposit already has a mine!');
      return;
    }
    if (!Economy.canAfford(def.cost)) { flashMessage('Not enough funds!'); return; }
    Economy.spend(def.cost);
    const entity = new Entity(type, col, row);
    entity.width  = mw;
    entity.height = mh;
    entity._rotation = facing;
    deposit._hasMine = true;
    _coverDeposits(entity, _depositsCoveredBy(col, row, mw, mh, deposit));
    entity._linkedDeposit   = deposit;
    entity._depositCol      = deposit.col;
    entity._depositRow      = deposit.row;
    entity._depositWidth    = deposit.width  || 2;
    entity._depositHeight   = deposit.height || 2;
    entity._depositTier     = deposit._tierLabel || 'Sulfur Deposit';
    entity._depositPhase    = deposit._sulfurPhase || 0;
    entity._depositOreAmount = deposit._oreAmount;
    entity._depositOreMax    = deposit._oreMax;
    GridManager.setEntityFootprint(entity);
    HistoryManager.record({ type: 'place', entity, cost: def.cost });
    SFX.thump();
    PowerNetwork.recomputeWireHops();
    Progression.checkUnlocks?.();
    showToast(`🟡 ${def.label} placed`, '#e8d040', '#100a00', '#504010');
    return entity;
  }

  // The first Sulfur Mine (MK1) under a footprint, if any.
  function _mk1SulfurMineUnder(col, row, w, h) {
    for (let r = row; r < row + h; r++)
      for (let c = col; c < col + w; c++) {
        const t = GridManager.getEntity(c, r);
        if (t && t.type === T.SULFURMINE) return t;
      }
    return null;
  }

  // An MK2 built over an MK1: the MK1 comes down (refunded as a demolition
  // would be) and the MK2 goes up on the same deposit at the same facing,
  // its OUT stub on the MK1's, so the OUT belt joins it as it stood, and the
  // banked sulfur carries over.
  function tryReplaceSulfurMine(old) {
    const def = EntityDefs[T.SULFURMINE2];
    const refund = old._paid !== undefined ? old._paid : old.def.cost;
    if (!Economy.canAfford(def.cost - refund)) { flashMessage('Not enough funds!'); return; }
    const dep = old._linkedDeposit;
    if (!dep || isDepositExhausted(dep)) { flashMessage('This sulfur deposit is exhausted: nothing left for an MK2 to dig.'); return; }
    const rot = old._rotation || 0, banked = old._sulfurStored || 0;
    // Checked before the MK1 comes down: the MK2 is bigger, and a blocked
    // footprint must leave the old mine standing.
    const why = _sulfurMineBlocked(_sulfurMineFootprint(dep, T.SULFURMINE2, rot), dep, def.label, old);
    if (why) { flashMessage(why); return; }
    tryRemove(old.col, old.row, true);
    const e = tryPlaceSulfurMine(dep, T.SULFURMINE2, rot);
    if (e) e._sulfurStored = banked;
  }

  // The deposit a mine of `mineType` placed at col,row would cover: any tile
  // of the proposed footprint, else the clicked tile itself.
  function _depositUnderMine(mineType, depType, col, row) {
    const mDef = EntityDefs[mineType];
    const mw = mDef.width || 4, mh = mDef.height || 5;
    for (let r = row; r < row + mh; r++)
      for (let c = col; c < col + mw; c++) {
        const t = GridManager.getEntity(c, r);
        if (t && t.type === depType) return t;
      }
    const hit = GridManager.getEntity(col, row);
    return hit && hit.type === depType ? hit : null;
  }

  // The Uranium Mine's placement, on a rare earth deposit.
  function tryPlaceRareEarthMine(deposit) {
    const def = EntityDefs[T.RAREEARTHMINE];
    const { col, row, w: mw, h: mh } = _centredMineFootprint(deposit, T.RAREEARTHMINE);
    if (!GridManager.inBounds(col, row) || !GridManager.inBounds(col + mw - 1, row + mh - 1)) {
      flashMessage('Rare Earth Mine extends out of bounds; deposit too close to map edge!');
      return;
    }
    for (let r = row; r < row + mh; r++)
      for (let c = col; c < col + mw; c++) {
        const tile = GridManager.getEntity(c, r);
        if (!tile) continue;
        // As with coal: a neighbouring deposit is covered, not a blocker.
        if (tile === deposit || GridManager.isVegetation(tile) || DEPOSIT_TYPES.has(tile.type)) continue;
        flashMessage('Mine footprint blocked: clear the surrounding tiles first!');
        return;
      }
    if (deposit._hasMine) {
      flashMessage('This deposit already has a mine!');
      return;
    }
    if (!Economy.canAfford(def.cost)) { flashMessage('Not enough funds!'); return; }
    Economy.spend(def.cost);
    const entity = new Entity(T.RAREEARTHMINE, col, row);
    entity.width  = mw;
    entity.height = mh;
    // OUT stub side: even = bottom-right end of the rail, odd = bottom-left.
    entity._rotation = state.placementRotation || 0;
    deposit._hasMine = true;
    _coverDeposits(entity, _depositsCoveredBy(col, row, mw, mh, deposit));
    entity._linkedDeposit    = deposit;
    entity._depositCol       = deposit.col;
    entity._depositRow       = deposit.row;
    entity._depositWidth     = deposit.width  || 2;
    entity._depositHeight    = deposit.height || 2;
    entity._depositTier      = deposit._tierLabel || 'Rare Earth Deposit';
    entity._depositPhase     = deposit._rareEarthPhase || 0;
    entity._depositOreAmount = deposit._oreAmount;
    entity._depositOreMax    = deposit._oreMax;
    GridManager.setEntityFootprint(entity);
    HistoryManager.record({ type: 'place', entity, cost: def.cost });
    SFX.thump();
    PowerNetwork.recomputeWireHops();
    Progression.checkUnlocks?.();
    showToast(`🧲 Rare Earth Mine placed`, '#ff9a5a', '#140a04', '#603018');
  }

  function tryPlaceLithiumMine(deposit) {
    const def = EntityDefs[T.LITHIUMMINE];
    // Centred over the deposit, like the uranium and sulfur mines.
    const { col, row, w: mw, h: mh } = _centredMineFootprint(deposit, T.LITHIUMMINE);
    if (!GridManager.inBounds(col, row) || !GridManager.inBounds(col + mw - 1, row + mh - 1)) {
      flashMessage('Lithium Mine extends out of bounds; deposit too close to map edge!');
      return;
    }
    for (let r = row; r < row + mh; r++)
      for (let c = col; c < col + mw; c++) {
        const tile = GridManager.getEntity(c, r);
        if (!tile) continue;
        // As with coal: a neighbouring deposit is covered, not a blocker.
        if (tile === deposit || GridManager.isVegetation(tile) || DEPOSIT_TYPES.has(tile.type)) continue;
        flashMessage('Mine footprint blocked: clear the surrounding tiles first!');
        return;
      }
    if (deposit._hasMine) {
      flashMessage('This deposit already has a mine!');
      return;
    }
    if (!Economy.canAfford(def.cost)) { flashMessage('Not enough funds!'); return; }
    Economy.spend(def.cost);
    const entity = new Entity(T.LITHIUMMINE, col, row);
    entity.width  = mw;
    entity.height = mh;
    entity._rotation = state.placementRotation || 0;   // R flips the OUT stub left/right
    deposit._hasMine = true;
    _coverDeposits(entity, _depositsCoveredBy(col, row, mw, mh, deposit));
    entity._linkedDeposit   = deposit;
    entity._depositCol      = deposit.col;
    entity._depositRow      = deposit.row;
    entity._depositWidth    = deposit.width  || 2;
    entity._depositHeight   = deposit.height || 2;
    entity._depositTier     = deposit._tierLabel || 'Lithium Deposit';
    entity._depositPhase    = deposit._lithiumPhase || 0;
    entity._depositOreAmount = deposit._oreAmount;
    entity._depositOreMax    = deposit._oreMax;
    GridManager.setEntityFootprint(entity);
    HistoryManager.record({ type: 'place', entity, cost: def.cost });
    SFX.thump();
    PowerNetwork.recomputeWireHops();
    Progression.checkUnlocks?.();
    showToast(`💎 Lithium Mine placed`, '#a0e0ff', '#001018', '#204050');
  }

  // Same rules as tryPlaceLithiumMine, plus the placement rotation — the
  // well's single HE OUT stub faces whichever way R set it.
  // `type` is either tier; `rot` keeps a replaced well's facing (see
  // tryReplaceHeliumWell). Returns the new well, or nothing if it wasn't built.
  // Where a well of `type` goes on `deposit`. An MK1 sits on the field's
  // top-left. The 8×8 MK2 is laid so its HE OUT lands on the tile an MK1's
  // would at the same facing, so it takes over an MK1's pipe as it stands
  // (the field ends up in the half of it nearest HE OUT). `mk1` is the well it
  // takes over, which may be an older, smaller one: its HE OUT is what counts.
  function _heliumWellFootprint(deposit, type, rot = 0, mk1 = EntityDefs[T.HELIUMWELL]) {
    const d = EntityDefs[type], w = d.width || 4, h = d.height || 4;
    if (type !== T.HELIUMWELL2) return { col: deposit.col, row: deposit.row, w, h };
    const s = HeliumSystem.getStubs({ col: deposit.col, row: deposit.row, width: mk1.width || 4, height: mk1.height || 4, _rotation: rot }).heliumOut;
    const o = Math.floor(w / 2);
    const at = rot === 1 ? [s.c - o, s.r - h] : rot === 2 ? [s.c + 1, s.r - o] : rot === 3 ? [s.c - o, s.r + 1] : [s.c - w, s.r - o];
    return { col: at[0], row: at[1], w, h };
  }
  // Why a well can't go on this footprint, or null if it can. `ignore` is a
  // well being replaced, whose tiles count as free.
  function _heliumWellBlocked(fp, deposit, ignore = null) {
    if (!GridManager.inBounds(fp.col, fp.row) || !GridManager.inBounds(fp.col + fp.w - 1, fp.row + fp.h - 1))
      return 'Helium Well extends out of bounds; gas field too close to map edge!';
    for (let r = fp.row; r < fp.row + fp.h; r++)
      for (let c = fp.col; c < fp.col + fp.w; c++) {
        const tile = GridManager.getEntity(c, r);
        if (!tile || tile === deposit || tile === ignore || GridManager.isVegetation(tile) || DEPOSIT_TYPES.has(tile.type)) continue;
        return `Well footprint blocked by ${tile.def?.label || tile.type} at ${c},${r}: clear the surrounding tiles first!`;
      }
    return null;
  }

  function tryPlaceHeliumWell(deposit, type = T.HELIUMWELL, rot = null, mk1 = undefined) {
    const def = EntityDefs[type];
    const facing = rot !== null ? rot : state.bpStamping ? (state.placementRotation || 0) : 0;
    const fp = _heliumWellFootprint(deposit, type, facing, mk1);
    const ww = fp.w, wh = fp.h, col = fp.col, row = fp.row;
    const why = _heliumWellBlocked(fp, deposit);
    if (why) { flashMessage(why); return; }
    if (deposit._hasMine) {
      flashMessage('This gas field already has a well!');
      return;
    }
    if (!Economy.canAfford(def.cost)) { flashMessage('Not enough funds!'); return; }
    Economy.spend(def.cost);
    const entity = new Entity(type, col, row);
    entity.width     = ww;
    entity.height    = wh;
    // Built one way round only, HE OUT on the right. (A blueprint stamp
    // keeps the facing it captured, so wells turned before this still
    // stamp as they stand, and an MK2 keeps the facing of the well it replaced.)
    entity._rotation = facing;
    deposit._hasMine = true;
    _coverDeposits(entity, _depositsCoveredBy(col, row, ww, wh, deposit));
    entity._linkedDeposit   = deposit;
    entity._depositCol      = deposit.col;
    entity._depositRow      = deposit.row;
    entity._depositWidth    = deposit.width  || 2;
    entity._depositHeight   = deposit.height || 2;
    entity._depositTier     = deposit._tierLabel || 'Helium Gas Field';
    entity._depositPhase    = deposit._heliumPhase || 0;
    entity._depositOreAmount = deposit._oreAmount;
    entity._depositOreMax    = deposit._oreMax;
    GridManager.setEntityFootprint(entity);
    HistoryManager.record({ type: 'place', entity, cost: def.cost });
    SFX.thump();
    PowerNetwork.recomputeWireHops();
    Progression.checkUnlocks?.();
    const labels = ['→ E', '↓ S', '← W', '↑ N'];
    showToast(`🎈 ${def.label} placed; HE OUT faces ${labels[entity._rotation % 4]}`, '#f0b8ff', '#100818', '#503060');
    return entity;
  }

  // The first Helium Well (MK1) under a footprint, if any.
  function _mk1WellUnder(col, row, w, h) {
    for (let r = row; r < row + h; r++)
      for (let c = col; c < col + w; c++) {
        const t = GridManager.getEntity(c, r);
        if (t && t.type === T.HELIUMWELL) return t;
      }
    return null;
  }

  // An MK2 built over an MK1: the MK1 comes down (refunded as a demolition
  // would be), the MK2 goes up on the same field, same spot and facing, so
  // the HE OUT pipe joins it as it stood, and the banked gas carries over.
  function tryReplaceHeliumWell(old) {
    const def = EntityDefs[T.HELIUMWELL2];
    const refund = old._paid !== undefined ? old._paid : old.def.cost;
    if (!Economy.canAfford(def.cost - refund)) { flashMessage('Not enough funds!'); return; }
    const dep = old._linkedDeposit;
    if (!dep || isDepositExhausted(dep)) { flashMessage('This gas field is exhausted: nothing left for an MK2 to draw.'); return; }
    const rot = old._rotation || 0, banked = old._helium || 0;
    // Checked before the MK1 comes down: the MK2 is bigger, and a blocked
    // footprint must leave the old well standing.
    const size = { width: old.width, height: old.height };
    const why = _heliumWellBlocked(_heliumWellFootprint(dep, T.HELIUMWELL2, rot, size), dep, old);
    if (why) { flashMessage(why); return; }
    tryRemove(old.col, old.row, true);
    const e = tryPlaceHeliumWell(dep, T.HELIUMWELL2, rot, size);
    if (e) e._helium = banked;
  }

  function tryPlaceGeoWell(deposit) {
    const def = EntityDefs[T.GEOWELL];
    const check = GeothermalSystem.canPlaceWell(deposit);
    if (!check.ok) { flashMessage(check.why); return; }
    if (!Economy.canAfford(def.cost)) { flashMessage('Not enough funds!'); return; }
    Economy.spend(def.cost);
    const entity = new Entity(T.GEOWELL, deposit.col, deposit.row);
    entity.width     = def.width  || 3;
    entity.height    = def.height || 3;
    // R picks which way the steam spout faces (a blueprint stamp keeps the
    // facing it captured, which arrives the same way).
    entity._rotation = (state.placementRotation || 0) % 4;
    deposit._hasWell = true;
    // Keep everything removal/save needs to rebuild the deposit later.
    entity._linkedDeposit = deposit;
    entity._depositCol    = deposit.col;
    entity._depositRow    = deposit.row;
    entity._depositWidth  = deposit.width  || 2;
    entity._depositHeight = deposit.height || 2;
    entity._depositPhase  = deposit._geoPhase || 0;
    GridManager.setEntityFootprint(entity);
    // A deposit can be 3 tiles tall (GeothermalSystem.spawnGeoDeposits sizes)
    // while the well footprint is only 2, so the deposit's bottom row would
    // be left sitting on the grid under the sprite — occupied ground the
    // player can neither see nor build on. Clear whatever the footprint no
    // longer covers; removal rebuilds the deposit from _deposit* below.
    for (let r = deposit.row; r < deposit.row + (deposit.height || 2); r++)
      for (let c = deposit.col; c < deposit.col + (deposit.width || 2); c++)
        if (GridManager.getEntity(c, r) === deposit) GridManager.tiles[r][c] = null;
    GeothermalSystem.relinkWell(entity);
    HistoryManager.record({ type: 'place', entity, cost: def.cost });
    SFX.thump();
    PowerNetwork.recomputeWireHops();
    Progression.checkUnlocks?.();
    const labels = ['↑ N', '→ E', '↓ S', '← W'];
    showToast(`♨ Geothermal Well placed; steam output faces ${labels[entity._rotation]}`, '#ff9050', '#140800', '#703018');
  }

  function tryPlaceGeoTurbine(col, row) {
    const def = EntityDefs[T.GEOTURBINE];
    const tw = def.width || 5, th = def.height || 4;
    const well = GeothermalSystem.wellForTurbineAt(col, row, tw, th);
    if (!well) {
      flashMessage('Geothermal Turbine must cover an unused well’s steam output port; press R while placing the well to move it!');
      return;
    }
    if (!GridManager.canPlaceFootprint(col, row, tw, th)) {
      flashMessage('Turbine footprint blocked: clear the tiles first!');
      return;
    }
    if (!Economy.canAfford(def.cost)) { flashMessage('Not enough funds!'); return; }
    Economy.spend(def.cost);
    const entity = new Entity(T.GEOTURBINE, col, row);
    entity.width  = tw;
    entity.height = th;
    GridManager.setEntityFootprint(entity);
    GeothermalSystem.relinkWell(well);
    HistoryManager.record({ type: 'place', entity, cost: def.cost });
    SFX.thump();
    PowerNetwork.recomputeWireHops();
    Progression.checkUnlocks?.();
    showToast('♨ Geothermal Turbine connected to well', '#ffb070', '#140c04', '#704018');
  }

  // ── Drag-connected pipes ──
  // Every pipe tile one drag touches — pipes it lays and existing pipes it
  // passes over — joins the tile the drag came from (pipesJoin,
  // resource_helpers.js). Only that one: a drag can now wander round corners,
  // and a run doubling back beside itself must not join across the gap.
  // A new pipe starts closed on all sides, so a run laid
  // alongside another line stays separate from it. The drag's first and last
  // new tiles (the only tile of a single click) also join the END of any line
  // they touch, so extending a line by starting or finishing next to its end
  // works as it always did, without reaching into the middle of a parallel one.
  //
  // A new pipe is empty until its fluid has run down it, and crude is traced
  // first each tick, so an empty pipe touching a crude line went crude and
  // shut fuel out of it for good. So a drag knows what it carries — the
  // fluid of the line it joins, or of the port it is laid on (FUEL OUT is
  // fuel oil) — and never joins a pipe carrying something else.
  let _pipeDrag = null;   // { tiles: Map<"c,r", pipe>, fresh: Set<"c,r">, first, prev, fluid }
  const _isPipeTool = (t) => t === T.PIPE || t === T.UNDERGNDPIPE;
  const _D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];

  function _pipeDragBegin() {
    _pipeDrag = _isPipeTool(state.selectedTool) ? { tiles: new Map(), fresh: new Set(), first: null, prev: null, fluid: null } : null;
  }

  // The fluid a building's port at pipe tile (c,r) sends or takes, or null.
  function _portFluidAt(c, r) {
    for (const [dc, dr] of _D4) {
      const f = GridManager.inBounds(c + dc, r + dr) ? pipePortFluid(GridManager.getEntity(c + dc, r + dr), c, r) : null;
      if (f) return f;
    }
    return null;
  }
  // False if pipe q carries a fluid other than `fluid` (either may be unknown).
  const _pipeFluidOk = (q, fluid) => { const f = q && pipeCurrentFluid(q); return !fluid || !f || f === fluid; };

  // Sides of (c,r)'s pipe that join another pipe, not counting (exC,exR).
  function _pipeJoinDirs(c, r, exC, exR) {
    const out = [];
    for (const [dc, dr] of _D4) {
      const nc = c + dc, nr = r + dr;
      if ((nc === exC && nr === exR) || !GridManager.inBounds(nc, nr)) continue;
      if (getPipe(GridManager.getEntity(nc, nr)) && pipeStepAllowed(nc, nr, dc, dr)) out.push([dc, dr]);
    }
    return out;
  }

  // Join a new pipe at (c,r) to every neighbouring line end (or lone pipe)
  // when either side runs toward the other: the old line continues straight
  // into the new pipe, or the new run heads straight away from the old end
  // (a corner turned off the end of a line), or the new pipe stands alone.
  // Two parallel runs that sit side by side — each running past the other's
  // end — are left apart. The middle of a line is never joined. An
  // underground pipe only takes a connection along its axis, on an unpaired
  // side.
  function _pipeJoinLineEnds(c, r, fluid = null) {
    const p = getPipe(GridManager.getEntity(c, r));
    if (!p) return;
    fluid = fluid || _portFluidAt(c, r) || pipeCurrentFluid(p);
    for (const [dc, dr] of _D4) {
      const nc = c + dc, nr = r + dr;
      if (!GridManager.inBounds(nc, nr)) continue;
      const q = getPipe(GridManager.getEntity(nc, nr));
      if (!q || !_pipeFluidOk(q, fluid)) continue;
      if (q.type === T.UNDERGNDPIPE && ((dc !== 0) !== (q._udgAxis === 'h') || udgPartner(nc, nr, -dc, -dr, q._udgAxis))) continue;
      if (p.type === T.UNDERGNDPIPE && ((dc !== 0) !== (p._udgAxis === 'h') || udgPartner(c, r, dc, dr, p._udgAxis))) continue;
      const joins = _pipeJoinDirs(nc, nr, c, r);
      if (joins.length > 1) continue;
      const oldRunsIn  = joins.length === 0 || (joins[0][0] === dc && joins[0][1] === dr);
      const own        = _pipeJoinDirs(c, r, nc, nr);
      const newRunsOut = own.length === 0 || own.some(([jc, jr]) => jc === -dc && jr === -dr);
      if (!oldRunsIn && !newRunsOut) continue;
      linkPipes(p, q, dc, dr);
    }
  }

  function _pipeDragVisit(col, row, before) {
    const p = getPipe(GridManager.getEntity(col, row));
    if (!p) return;
    const fresh = p !== before;
    // Blueprint stamp: the links were captured with the layout.
    if (state.bpPipeLinks !== undefined) {
      if (fresh && p.type === T.PIPE) p._links = state.bpPipeLinks === null ? undefined : state.bpPipeLinks;
      return;
    }
    if (fresh && p.type === T.PIPE) p._links = 0;
    const key = `${col},${row}`;
    if (!_pipeDrag) { if (fresh) _pipeJoinLineEnds(col, row); return; }
    if (!_pipeDrag.tiles.has(key)) {
      _pipeDrag.tiles.set(key, p);
      if (fresh) _pipeDrag.fresh.add(key);
      if (_pipeDrag.first === null) _pipeDrag.first = key;
    }
    if (!_pipeDrag.fluid && fresh) _pipeDrag.fluid = _portFluidAt(col, row);
    const prev = _pipeDrag.prev;
    _pipeDrag.prev = { col, row, key };
    if (!prev || prev.key === key) return;
    // Two old pipes the drag merely passed over stay as they were, and an old
    // pipe carrying another fluid than the drag's is passed over unjoined.
    const join = (nk, dc, dr) => {
      const q = _pipeDrag.tiles.get(nk);
      if (!q || !(_pipeDrag.fresh.has(key) || _pipeDrag.fresh.has(nk))) return;
      const old = _pipeDrag.fresh.has(key) ? q : p;
      if (!_pipeFluidOk(old, _pipeDrag.fluid)) return;
      _pipeDrag.fluid = _pipeDrag.fluid || pipeCurrentFluid(old);
      linkPipes(p, q, dc, dr);
    };
    const dc = prev.col - col, dr = prev.row - row;
    if (Math.abs(dc) + Math.abs(dr) === 1) { join(prev.key, dc, dr); return; }
    // The cursor jumped (mousemove and the frame's tile walk can arrive out
    // of order): join whatever of this drag is next to it, so no gap is left.
    for (const [ndc, ndr] of _D4) join(`${col + ndc},${row + ndr}`, ndc, ndr);
  }

  function _pipeDragEnd(lastCol, lastRow) {
    if (!_pipeDrag) return;
    const { fresh, first, fluid } = _pipeDrag;
    _pipeDrag = null;
    const ends = new Set([first, `${lastCol},${lastRow}`]);
    for (const key of ends) {
      if (!key || !fresh.has(key)) continue;
      const [c, r] = key.split(',').map(Number);
      _pipeJoinLineEnds(c, r, fluid);
    }
  }

  // ── Drag-connected belts ──
  // The same rules for belts (beltsJoin, resource_helpers.js): every belt
  // tile one drag touches joins its neighbours from the same drag, a new
  // plain belt starts closed on all sides so a line laid alongside another
  // stays separate, and the drag's end tiles join the END of a line they
  // touch. A drag started on an existing belt branches off it there. Any
  // belt ending against a Conveyor Splitter joins it: the splitter is the
  // junction. Underground belts and splitters keep every side open
  // themselves; only plain belts carry links.
  let _beltDrag = null;   // { tiles: Map<"c,r", belt>, fresh: Set<"c,r">, first }
  const _isBeltTool = (t) => t === T.CONVEYOR || t === T.UNDERGNDCONVEYOR || t === T.CONVEYORSPLITTER;
  const _isPlainBelt = (b) => !!b && b.type === T.CONVEYOR && !b._udgBelt && !b._splitter;

  function _beltDragBegin() {
    _beltDrag = _isBeltTool(state.selectedTool) ? { tiles: new Map(), fresh: new Set(), first: null } : null;
  }

  // Sides of (c,r)'s belt that join another belt, not counting (exC,exR).
  function _beltJoinDirs(c, r, exC, exR) {
    const out = [];
    for (const [dc, dr] of _D4) {
      const nc = c + dc, nr = r + dr;
      if ((nc === exC && nr === exR) || !GridManager.inBounds(nc, nr)) continue;
      if (beltOf(GridManager.getEntity(nc, nr)) && beltStepAllowed(c, r, dc, dr)) out.push([dc, dr]);
    }
    return out;
  }

  // _pipeJoinLineEnds for belts: join a new belt at (c,r) to each neighbouring
  // line end (or lone belt) that runs toward it or that it runs away from,
  // and to any splitter beside it. The middle of a line is joined only when
  // the new line runs straight into its side, so a run dragged up to a line
  // (or away from it) tees in there and syncAutoSplitters makes the junction
  // a splitter; a line laid alongside meets it side-on and stays separate,
  // as does a single tile, which has no direction. An underground belt only
  // takes a connection along its axis, on an unpaired side.
  // What the belt line through (c,r) carries (BeltCargo.kindAt on any of its
  // tiles), or null while nothing has ridden it. Lines carrying different
  // things are never joined by a drag.
  function _beltLineKind(c, r) {
    if (typeof BeltCargo === 'undefined' || !BeltCargo.kindAt) return null;
    const seen = new Set([c + ',' + r]), q = [[c, r]];
    for (let i = 0; i < q.length && i < 4000; i++) {
      const [x, y] = q[i];
      const s = BeltCargo.kindAt(x, y);
      if (s) return s.kind;
      for (const [dc, dr] of beltSteps(x, y)) {
        const k = (x + dc) + ',' + (y + dr);
        if (seen.has(k) || !beltOf(GridManager.getEntity(x + dc, y + dr))) continue;
        seen.add(k); q.push([x + dc, y + dr]);
      }
    }
    return null;
  }
  function _beltKindsClash(c, r, nc, nr) {
    const a = _beltLineKind(c, r);
    if (!a) return false;
    const b = _beltLineKind(nc, nr);
    return !!b && b !== a;
  }

  function _beltJoinLineEnds(c, r) {
    const p = beltOf(GridManager.getEntity(c, r));
    if (!p) return;
    for (const [dc, dr] of _D4) {
      const nc = c + dc, nr = r + dr;
      if (!GridManager.inBounds(nc, nr)) continue;
      const q = beltOf(GridManager.getEntity(nc, nr));
      if (!q) continue;
      if (q._udgBelt && ((dc !== 0) !== (q._udgAxis === 'h') || udgBeltPartner(nc, nr, -dc, -dr, q._udgAxis))) continue;
      if (p._udgBelt && ((dc !== 0) !== (p._udgAxis === 'h') || udgBeltPartner(c, r, dc, dr, p._udgAxis))) continue;
      if (beltStepAllowed(c, r, dc, dr)) continue;          // already joined
      if (_beltKindsClash(c, r, nc, nr)) continue;          // different materials stay apart
      if (q._splitter) { linkBelts(p, q, dc, dr); continue; }
      const joins = _beltJoinDirs(nc, nr, c, r);
      const own   = _beltJoinDirs(c, r, nc, nr);
      if (joins.length > 1) {
        const headOn = own.length === 1 && own[0][0] === -dc && own[0][1] === -dr;
        if (headOn && !p._udgBelt && _isPlainBelt(q)) linkBelts(p, q, dc, dr);
        continue;
      }
      // End to end. A straight run on, a bend (one line turning off the other)
      // and a jog (two parallel lines ending side by side, running away from
      // each other) all join. Two parallel ends running the SAME way are
      // lines laid side by side, and stay separate.
      const oldRunsIn  = joins.length === 0 || (joins[0][0] === dc && joins[0][1] === dr);
      const newRunsOut = own.length === 0 || own.some(([jc, jr]) => jc === -dc && jr === -dr);
      let bend = false;
      if (!oldRunsIn && !newRunsOut && own.length === 1) {
        const [qc, qr] = joins[0], [pc, pr] = own[0];
        bend = !(qc === pc && qr === pr && (qc !== 0) !== (dc !== 0));
      }
      if (!oldRunsIn && !newRunsOut && !bend) continue;
      linkBelts(p, q, dc, dr);
    }
  }

  function _beltDragVisit(col, row, before) {
    const p = beltOf(GridManager.getEntity(col, row));
    if (!p) return;
    const fresh = p !== before;
    // Blueprint stamp / contract crew: the links were captured with the layout.
    if (state.bpBeltLinks !== undefined) {
      if (fresh && _isPlainBelt(p)) { p._links = state.bpBeltLinks === null ? undefined : state.bpBeltLinks; BELT_LINK_EPOCH++; }
      if (fresh && !_isPlainBelt(p)) _beltJoinLineEnds(col, row);
      return;
    }
    if (fresh && _isPlainBelt(p)) { p._links = 0; BELT_LINK_EPOCH++; }
    const key = `${col},${row}`;
    if (!_beltDrag) { if (fresh) _beltJoinLineEnds(col, row); return; }
    if (!_beltDrag.tiles.has(key)) {
      _beltDrag.tiles.set(key, p);
      if (fresh) _beltDrag.fresh.add(key);
      if (_beltDrag.first === null) _beltDrag.first = key;
    }
    const pFresh = _beltDrag.fresh.has(key);
    for (const [dc, dr] of _D4) {
      const nk = `${col + dc},${row + dr}`;
      const q = _beltDrag.tiles.get(nk);
      // Two old belts the drag merely passed over stay as they were.
      if (q && (pFresh || _beltDrag.fresh.has(nk))) linkBelts(p, q, dc, dr);
    }
    // ...unless the drag stepped straight from one onto the other and one of
    // them is a line's end: that is the player drawing the join between two
    // lines already laid (a bend or jog that didn't take), so it is made,
    // as long as they don't carry different materials.
    const prev = _beltDrag.prev;
    _beltDrag.prev = key;
    if (!prev || prev === key || pFresh || _beltDrag.fresh.has(prev)) return;
    const [pc, pr] = prev.split(',').map(Number);
    const dc = pc - col, dr = pr - row;
    if (Math.abs(dc) + Math.abs(dr) !== 1) return;
    const q = _beltDrag.tiles.get(prev);
    if (!_isPlainBelt(p) || !_isPlainBelt(q) || beltStepAllowed(col, row, dc, dr)) return;
    const isEnd = (c, r, exC, exR) => _beltJoinDirs(c, r, exC, exR).length <= 1;
    if (!isEnd(col, row, pc, pr) && !isEnd(pc, pr, col, row)) return;
    if (_beltKindsClash(col, row, pc, pr)) return;
    linkBelts(p, q, dc, dr);
  }

  function _beltDragEnd(lastCol, lastRow) {
    if (!_beltDrag) return;
    const { fresh, first } = _beltDrag;
    _beltDrag = null;
    const ends = new Set([first, `${lastCol},${lastRow}`]);
    for (const key of ends) {
      if (!key || !fresh.has(key)) continue;
      const [c, r] = key.split(',').map(Number);
      _beltJoinLineEnds(c, r);
    }
  }

  function tryPlace(col, row) {
    if (_isBeltTool(state.selectedTool) && GridManager.inBounds(col, row)) {
      const before = beltOf(GridManager.getEntity(col, row));
      _tryPlaceTile(col, row);
      _beltDragVisit(col, row, before);
      return;
    }
    if (!_isPipeTool(state.selectedTool) || !GridManager.inBounds(col, row)) { _tryPlaceTile(col, row); return; }
    const before = getPipe(GridManager.getEntity(col, row));
    _tryPlaceTile(col, row);
    _pipeDragVisit(col, row, before);
  }

  function _tryPlaceTile(col, row) {
    // The map is spent. An Advanced Reactor apocalypse contaminates the
    // whole grid permanently — there is no rebuilding on it and no
    // demolishing the ruins (this is the delete tool's path too, see the
    // 'delete' branch below). The only way on from here is loading a save.
    if (_apocBuilt()) return;
    if (!GridManager.inBounds(col, row)) return;
    if (state.selectedTool === T.PATHTOOL) return;
    if (state.selectedTool === T.FISHINGPOLE) return;  // handled entirely by FishingSystem
    // Vegetation is not cleared up front: canPlaceFootprint treats trees and
    // bushes as free, and setEntity/setEntityFootprint destroy whatever
    // vegetation the building actually lands on — so a placement that fails
    // (no funds, blocked, wrong size) leaves the trees alone.

    // Debug: log what's blocking
    const _blocking = GridManager.getEntity(col, row);

    if (!state.selectedTool) return;
    if (state.selectedTool === 'delete') { if (!_pathDeleteHold) _pressRemove(col, row); return; }

    const type = state.selectedTool;

    // A splitter put down on a plain belt tile takes its place, so a junction
    // already laid is turned into one with a click. One undo step puts the
    // belt back (a blueprint stamp already has its own batch open).
    if (type === T.CONVEYORSPLITTER) {
      const here = GridManager.getEntity(col, row);
      if (here && here.type === T.CONVEYOR && !here._udgBelt && !here._underWire && !here._underPipe) {
        if (here._splitter) return;
        const refund = here._paid !== undefined ? here._paid : (here.def?.cost ?? EntityDefs[T.CONVEYOR].cost);
        if (!Economy.canAfford(EntityDefs[T.CONVEYORSPLITTER].cost - refund)) { flashMessage('Not enough funds!'); return; }
        const own = !state.bpStamping;
        if (own) HistoryManager.beginBatch();
        tryRemove(col, row, true);
        if (!GridManager.getEntity(col, row)) _tryPlaceTile(col, row);
        if (own) HistoryManager.endBatch();
        return;
      }
    }

    // Operation Hyperion's fenced plot is off limits — the sign says keep it clear.
    { const _rd = EntityDefs[type];
      if (_rd && typeof GovernmentSystem !== 'undefined' && GovernmentSystem.isMeridianReserved?.(col, row, _rd.width || 1, _rd.height || 1)) {
        flashMessage(typeof NationalProject !== 'undefined' && NationalProject.named?.()
          ? 'Reserved for Operation Hyperion; this land must stay clear'
          : 'Classified site reserved by the Ministry of Energy; this land must stay clear');
        return;
      }
    }
    // The "only when requested" rules below are about the player's OWN city:
    // they stop lamps, cameras, cell towers, fiber hubs and EV chargers being
    // sprayed around for satisfaction, so the only way to get one is to be asked.
    //
    // A job site is a different city with a different arrangement. The client
    // asks for this work in the contract itself (contract_sites.js EXTRA_WORK
    // lists these types), and that IS the request — but it lives in the
    // contract, not in AmenityRequestSystem or ZoneRequestSystem, both of
    // which only ever know about home. Enforcing the home rule on site made
    // those clauses impossible to satisfy: the checklist asked for cameras and
    // placement refused them.
    const _onJobSite = typeof ContractSystem !== 'undefined' && ContractSystem.isAway();

    // CELLTOWER, FIBERHUB and EVCHARGER can only be placed when a zone has
    // requested one, on the spot that request marks: anywhere the footprint
    // overlaps that spot, it is built exactly on it (the ghost snaps there too).
    if (!_onJobSite && (type === T.CELLTOWER || type === T.FIBERHUB || type === T.EVCHARGER) && typeof ZoneRequestSystem !== 'undefined') {
      const at = ZoneRequestSystem.placementFor(type, col, row);
      if (!at) {
        // Don't warn on a harmless duplicate invocation for the same tile
        // (e.g. mousedown + drag-continuation both firing for one click,
        // same guard used for road placement below) — the first call may
        // have already placed this exact item here and fulfilled the
        // request, which makes placementFor correctly return null on the
        // second call even though placement already succeeded.
        const already = GridManager.getEntity(col, row);
        const isSelfDuplicate = already && already.type === type;
        const label = EntityDefs[type]?.label || 'Item';
        const zone = ZoneRequestSystem.openZoneLabel(type);
        if (!isSelfDuplicate) flashMessage(zone ? `Build the ${label} on the spot marked in ${zone}` : `${label} can only be placed when a zone requests it`);
        return;
      }
      col = at.col; row = at.row;
      // One per zone, enforced at placement rather than trusting the request
      // flow. Two zones whose tolerance bands overlap could otherwise let a
      // request open for one of them authorise a tile inside the other.
      if (ZoneRequestSystem.zoneAlreadyHasItem?.(type, col, row)) {
        const already = GridManager.getEntity(col, row);
        const isSelfDuplicate = already && already.type === type && already.col === col && already.row === row;
        if (!isSelfDuplicate) flashMessage(`Only one ${EntityDefs[type]?.label || 'item'} per zone`);
        return;
      }
    }

    // LAMP and CAMERA can only be placed when a nearby resident has actually
    // requested one — same gating idiom as zone items above, backed by
    // AmenityRequestSystem instead of ZoneRequestSystem.
    if (!_onJobSite && (type === T.LAMP || type === T.CAMERA) && typeof AmenityRequestSystem !== 'undefined') {
      const _amDef = EntityDefs[type] || {};
      const hasRequest = AmenityRequestSystem.hasActiveRequestAt(type, col, row, _amDef.width || 1, _amDef.height || 1);
      if (!hasRequest) {
        const already = GridManager.getEntity(col, row);
        const isSelfDuplicate = already && already.type === type && already.col === col && already.row === row;
        if (!isSelfDuplicate) flashMessage(`${EntityDefs[type]?.label || 'Street Lamp'} can only be placed when requested`);
        return;
      }
    }
    // One Monitoring Station per grid — it unlocks the GRID panel, which is a
    // global readout, so extras add nothing but upkeep. Checked before the
    // affordability/placement work below so no money is ever taken.
    if (type === T.BEACON && EntityRegistry.getByType(T.BEACON).size >= 1) {
      const already = GridManager.getEntity(col, row);
      const isSelfDuplicate = already && already.type === type && already.col === col && already.row === row;
      if (!isSelfDuplicate) flashMessage('Only one Communications Beacon can be built');
      return;
    }
    if (type === T.MONITOR2 && EntityRegistry.getByType(T.MONITOR2).size >= 1) {
      const already = GridManager.getEntity(col, row);
      const isSelfDuplicate = already && already.type === type && already.col === col && already.row === row;
      if (!isSelfDuplicate) flashMessage('Only one Monitoring Station MK2 can be built');
      return;
    }
    if (type === T.MONITOR && EntityRegistry.getByType(T.MONITOR).size >= 1) {
      const already = GridManager.getEntity(col, row);
      const isSelfDuplicate = already && already.type === type && already.col === col && already.row === row;
      if (!isSelfDuplicate) flashMessage('Only one Monitoring Station can be built');
      return;
    }
    // One Survey Station of each tier at a time.
    if ((type === T.SURVEY || type === T.SURVEY2) && EntityRegistry.getByType(type).size >= 1) {
      const already = GridManager.getEntity(col, row);
      const isSelfDuplicate = already && already.type === type && already.col === col && already.row === row;
      if (!isSelfDuplicate) flashMessage(`Only one ${EntityDefs[type].label} can be built at a time`);
      return;
    }

    const def  = EntityDefs[type];
    // Only a few things turn (placementTurns); the rest are built one way
    // round. The placement rotation is shared between tools, so without this
    // a plant took whatever the last tool was turned to. (A blueprint stamp
    // keeps the facing it captured, so plants turned before this still stamp
    // as they stand.)
    const rot  = (!placementTurns(type) && !state.bpStamping) ? 0 : (state.placementRotation || 0);
    // Swap width/height for 90°/270° rotations — only for buildings that
    // turn (footprintTurns). The placement rotation is shared between tools
    // and a blueprint stamp sets it for every piece, so anything else (a
    // Steam Turbine, a Cooling Tower, the Chemical Plant, whose rotation is
    // visual only) keeps the footprint its def gives it.
    const baseW = def.width  || 1;
    const baseH = def.height || 1;
    const turned = (rot === 1 || rot === 3) && footprintTurns(type);
    let w = turned ? baseH : baseW;
    let h = turned ? baseW : baseH;
    // Shaft: orientation governs dimensions, not placementRotation
    if (type === T.SHAFT) {
      const ori = state.shaftOrientation || 'h';
      w = ori === 'h' ? 3 : 1;
      h = ori === 'h' ? 1 : 3;
    }

    // Nuclear contamination (LightningDamageSystem.checkPlacement): severe
    // ground forbids building, hazardous ground allows only lines, residual
    // ground allows it at a decontamination surcharge (applied to `cost`).
    const _contam = LightningDamageSystem.checkPlacement(type, col, row, w, h);
    if (!_contam.ok) { flashMessage(_contam.msg); return; }

    // Bridge: a road piece laid across water (water_build.js). It snaps flush
    // to a bridge or road it's laid against, so a run joins up by itself.
    if (type === T.BRIDGE) {
      ({ col, row } = WaterBuild.snapBridge(col, row, rot));
      const _dup = topRoadAt(col, row);
      if (_dup && _dup.col === col && _dup.row === row) return;   // mousedown + drag both firing for one click
      // The whole crossing in one go (WaterBuild.bridgeRun): as many pieces
      // as it takes to reach the bank on both sides. A piece dragged on from
      // a run already laid is just the one piece.
      const run = state._bridgeDrag ? null : WaterBuild.bridgeRun(col, row, rot);
      const pieces = run ? run.pieces : [{ col, row, plan: WaterBuild.bridgePlan(col, row, WaterBuild.SPAN, WaterBuild.SPAN, rot) }];
      const bad = pieces.find(p => !p.plan.ok);
      if (bad) { flashMessage(bad.plan.reason); return; }
      const total = pieces.reduce((s, p) => s + p.plan.cost, 0);
      if (!Economy.canAfford(total)) { flashMessage('Not enough funds!'); return; }
      const own = pieces.length > 1 && !state.bpStamping;
      if (own) HistoryManager.beginBatch();
      for (const p of pieces) {
        const d = topRoadAt(p.col, p.row);
        if (d && d.col === p.col && d.row === p.row) continue;
        Economy.spend(p.plan.cost);
        const road = new Entity(T.ROAD, p.col, p.row);
        road.width = road.height = WaterBuild.SPAN;
        road._rotation = rot % 2;
        road._paid = p.plan.cost;
        WaterBuild.claimBridge(road, p.plan);
        EntityRegistry.add(road);
        HistoryManager.record({ type: 'place', entity: road, cost: p.plan.cost });
      }
      if (own) HistoryManager.endBatch();
      state._lastBridge = { col, row };
      SFX.thump?.();
      PowerNetwork.recomputeWireHops?.();
      Progression.checkUnlocks?.();
      return;
    }

    // Power Pole stood in a lake or river on a concrete footing (water_build.js):
    // no Bridge needed. The water stays water, kept underneath like a wire's.
    if (type === T.POLE) {
      const _hit = GridManager.getEntity(col, row);
      if (_hit && _hit.type === T.WATER) {
        const plan = WaterBuild.polePlan(_hit);
        if (!plan.ok) { flashMessage(plan.reason); return; }
        if (!Economy.canAfford(plan.cost)) { flashMessage('Not enough funds!'); return; }
        Economy.spend(plan.cost);
        const pole = new Entity(T.POLE, col, row);
        pole._paid = plan.cost;
        pole._underWater = _hit;
        GridManager.tiles[row][col] = pole;
        EntityRegistry.add(pole);
        HistoryManager.record({ type: 'place', entity: pole, cost: plan.cost });
        SFX.polePlace?.();
        return;
      }
    }

    // Special case: conveyor placed on wire — wire stays underneath
    if (type === T.CONVEYOR) {
      const _hit = GridManager.getEntity(col, row);
      if (_hit && _hit.type === T.WIRE) {
        if (!Economy.canAfford(def.cost || 0)) { flashMessage('Not enough funds!'); return; }
        Economy.spend(def.cost || 0);
        const conv = new Entity(T.CONVEYOR, col, row);
        conv._underWire = _hit;
        GridManager.setEntity(col, row, conv);
        EntityRegistry.add(conv);
        HistoryManager.record({ type: 'place', entity: conv, cost: def.cost || 0 });
        return;
      }
    }

    // Wires can be discounted (the Mae's Cabin hookup deal — see buildCost).
    const _wirePriceNow = typeof buildCost === 'function' ? buildCost(T.WIRE) : (def.cost || 0);
    const _wirePrice = type === T.WIRE ? _wirePriceNow : (def.cost || 0);

    // Special case: wire placed on a conveyor — ends up exactly as if the
    // conveyor had been laid over the wire (belt on top, wire carried as its
    // _underWire), so both build orders look and conduct the same. The belt
    // already there is kept rather than replaced, so nothing riding on it
    // is lost. A belt already laid over a pipe takes the wire too: a tile
    // holds all three layers (the belt draws both under it). Only a belt
    // already carrying a wire has no room.
    if (type === T.WIRE) {
      const _hit = GridManager.getEntity(col, row);
      if (_hit && _hit.type === T.CONVEYOR && !_hit._underWire) {
        if (!Economy.canAfford(_wirePrice)) { flashMessage('Not enough funds!'); return; }
        Economy.spend(_wirePrice);
        const wire = new Entity(T.WIRE, col, row);
        if (_wirePrice !== (def.cost || 0)) wire._paid = _wirePrice;
        _hit._underWire = wire;
        _touchTopology(_hit);
        HistoryManager.record({ type: 'stackWire', host: _hit, wire, cost: _wirePrice });
        return;
      }
    }

    // Wire or belt laid over an UNDERGROUND pipe.
    //
    // The surface-pipe cases below put the NEW entity on the grid and carry
    // the pipe as its _underPipe. That can't be done here: udgPartner() and
    // pipeStepAllowed() both identify a tunnel by the type of the entity
    // sitting on the grid tile, so burying a tunnel end under a wire would
    // quietly demote it to an ordinary pipe — its two ends would stop sealing
    // and stop jumping to each other, breaking the very crossing it was built
    // for. So the tunnel stays on the grid and hosts the wire or belt
    // instead, exactly the way a belt hosts a wire run through it above.
    //
    // Pipes are deliberately NOT stackable here: two pipes on one tile is
    // ambiguous for fluid traversal (getPipe returns the tunnel, so the
    // surface pipe would carry nothing), and a crossing line doesn't need it
    // — the tiles BETWEEN a tunnel's two ends are ordinary ground.
    if (type === T.WIRE || type === T.CONVEYOR) {
      const _hit = GridManager.getEntity(col, row);
      const _slot = type === T.WIRE ? '_underWire' : '_underConveyor';
      if (_hit && _hit.type === T.UNDERGNDPIPE && !_hit[_slot]) {
        const _wirePrice = type === T.WIRE ? _wirePriceNow : (def.cost || 0);
        if (!Economy.canAfford(_wirePrice)) { flashMessage('Not enough funds!'); return; }
        Economy.spend(_wirePrice);
        const rider = new Entity(type, col, row);
        if (type === T.WIRE && _wirePrice !== (def.cost || 0)) rider._paid = _wirePrice;
        _hit[_slot] = rider;
        // Not added to EntityRegistry: a stacked rider lives only on its
        // host, same as the wire-under-belt case above. Systems reach it
        // through the host tile, and _touchTopology bumps PowerNetwork.
        _touchTopology(_hit);
        HistoryManager.record(type === T.WIRE
          ? { type: 'stackWire', host: _hit, wire: rider, cost: _wirePrice }
          : { type: 'stackBelt', host: _hit, belt: rider, cost: _wirePrice });
        return;
      }
    }

    // Special case: wire placed on pipe — bypass canPlaceFootprint entirely
    if (type === T.WIRE) {
      const _hit = GridManager.getEntity(col, row);
      if (_hit && _hit.type === T.PIPE) {
        if (!Economy.canAfford(_wirePrice)) { flashMessage('Not enough funds!'); return; }
        Economy.spend(_wirePrice);
        const wire = new Entity(T.WIRE, col, row);
        if (_wirePrice !== (def.cost || 0)) wire._paid = _wirePrice;
        wire._underPipe = _hit;
        GridManager.setEntity(col, row, wire);
        EntityRegistry.add(wire);
        HistoryManager.record({ type: 'place', entity: wire, cost: _wirePrice });
        return;
      }
      // Wire placed on water tile — float wire over water (for reaching water extractor)
      if (_hit && _hit.type === T.WATER) {
        if (!Economy.canAfford(_wirePrice)) { flashMessage('Not enough funds!'); return; }
        Economy.spend(_wirePrice);
        const wire = new Entity(T.WIRE, col, row);
        if (_wirePrice !== (def.cost || 0)) wire._paid = _wirePrice;
        wire._underWater = _hit;
        GridManager.tiles[row][col] = wire;
        EntityRegistry.add(wire);
        HistoryManager.record({ type: 'place', entity: wire, cost: _wirePrice });
        return;
      }
    }

    // Special case: pipe placed on wire — wire stays underneath, pipe on top
    if (type === T.PIPE) {
      const _hit = GridManager.getEntity(col, row);
      if (_hit && _hit.type === T.WIRE) {
        if (!Economy.canAfford(def.cost || 0)) { flashMessage('Not enough funds!'); return; }
        Economy.spend(def.cost || 0);
        const pipe = new Entity(T.PIPE, col, row);
        pipe._underWire = _hit;
        GridManager.setEntity(col, row, pipe);
        EntityRegistry.add(pipe);
        HistoryManager.record({ type: 'place', entity: pipe, cost: def.cost || 0 });
        return;
      }
    }

    // Special case: conveyor placed on pipe — pipe stays underneath, conveyor on top
    if (type === T.CONVEYOR) {
      const _hit = GridManager.getEntity(col, row);
      if (_hit && _hit.type === T.PIPE) {
        if (!Economy.canAfford(def.cost || 0)) { flashMessage('Not enough funds!'); return; }
        Economy.spend(def.cost || 0);
        const conv = new Entity(T.CONVEYOR, col, row);
        conv._underPipe = _hit;
        GridManager.setEntity(col, row, conv);
        EntityRegistry.add(conv);
        HistoryManager.record({ type: 'place', entity: conv, cost: def.cost || 0 });
        return;
      }
    }

    // Special case: pipe placed on conveyor — conveyor stays underneath, pipe on top.
    // A splitter too: its settings show on the pipe's panel, and R still turns it.
    if (type === T.PIPE) {
      const _hit = GridManager.getEntity(col, row);
      if (_hit && _hit.type === T.CONVEYOR) {
        if (!Economy.canAfford(def.cost || 0)) { flashMessage('Not enough funds!'); return; }
        Economy.spend(def.cost || 0);
        const pipe = new Entity(T.PIPE, col, row);
        pipe._underConveyor = _hit;
        GridManager.setEntity(col, row, pipe);
        EntityRegistry.add(pipe);
        HistoryManager.record({ type: 'place', entity: pipe, cost: def.cost || 0 });
        return;
      }
    }

    // Special case: underground pipe placed on wire — wire stays underneath
    if (type === T.UNDERGNDPIPE) {
      const _hit = GridManager.getEntity(col, row);
      if (_hit && _hit.type === T.WIRE) {
        if (!Economy.canAfford(def.cost || 0)) { flashMessage('Not enough funds!'); return; }
        Economy.spend(def.cost || 0);
        const pipe = new Entity(T.UNDERGNDPIPE, col, row);
        pipe._underWire = _hit;
        pipe._udgAxis = inferUndergndPipeAxis(col, row) || (state.undergndPipeAxis === 'v' ? 'v' : 'h');
        _udgPairPlaced(pipe);
        GridManager.setEntity(col, row, pipe);
        EntityRegistry.add(pipe);
        HistoryManager.record({ type: 'place', entity: pipe, cost: def.cost || 0 });
        return;
      }
    }

    // Special case: conveyor laid across water — a trestle over the lake,
    // exactly like a pipe: the water tile is kept underneath and put back
    // when the belt is removed (removal's _underWater branch).
    if (type === T.CONVEYOR) {
      const _hit = GridManager.getEntity(col, row);
      if (_hit && _hit.type === T.WATER) {
        if (!Economy.canAfford(def.cost || 0)) { flashMessage('Not enough funds!'); return; }
        Economy.spend(def.cost || 0);
        const conv = new Entity(T.CONVEYOR, col, row);
        conv._underWater = _hit;
        GridManager.tiles[row][col] = conv;
        EntityRegistry.add(conv);
        HistoryManager.record({ type: 'place', entity: conv, cost: def.cost || 0 });
        return;
      }
    }

    // Special case: pipe placed on a water tile — store water underneath, place pipe on top
    if (type === T.PIPE) {
      const _hit = GridManager.getEntity(col, row);
      if (_hit && _hit.type === T.WATER) {
        if (!Economy.canAfford(def.cost || 0)) { flashMessage('Not enough funds!'); return; }
        Economy.spend(def.cost || 0);
        const pipe = new Entity(T.PIPE, col, row);
        pipe._underWater = _hit;   // remember the water tile for removal restoration
        GridManager.tiles[row][col] = pipe;
        EntityRegistry.add(pipe);
        HistoryManager.record({ type: 'place', entity: pipe, cost: def.cost || 0 });
        return;
      }
    }

    // Water Extractor must be placed entirely on lake water tiles (before canPlaceFootprint — water tiles are occupied)
    if (type === T.WATEREXTRACTOR) {
      const mw = 4, mh = 4;
      // All 16 tiles must be T.WATER
      for (let r = row; r < row + mh; r++)
        for (let c = col; c < col + mw; c++) {
          if (!GridManager.inBounds(c, r)) { flashMessage('Out of bounds!'); return; }
          const t = GridManager.getEntity(c, r);
          if (!t || t.type !== T.WATER) { flashMessage('Water Extractor must be fully on a lake!'); return; }
        }
      if (!Economy.canAfford(EntityDefs[T.WATEREXTRACTOR].cost)) { flashMessage('Not enough funds!'); return; }
      Economy.spend(EntityDefs[T.WATEREXTRACTOR].cost);
      const extractor = new Entity(T.WATEREXTRACTOR, col, row);
      extractor.width  = mw;
      extractor.height = mh;
      extractor._rotation = state.placementRotation || 0;
      extractor._waterRate    = EntityDefs[T.WATEREXTRACTOR].waterPerSecond || 20;
      extractor._waterBuffer  = 0;
      extractor._lakeConnected = true;
      // Save the water tiles before overwriting so they can be restored on removal
      extractor._savedWaterTiles = [];
      for (let r = row; r < row + mh; r++)
        for (let c = col; c < col + mw; c++)
          extractor._savedWaterTiles.push({ c, r, tile: GridManager.getEntity(c, r) });
      for (let r = row; r < row + mh; r++)
        for (let c = col; c < col + mw; c++)
          GridManager.tiles[r][c] = extractor;
      EntityRegistry.add(extractor);
      HistoryManager.record({ type: 'place', entity: extractor, cost: EntityDefs[T.WATEREXTRACTOR].cost });
      SFX.thump?.();
      Progression.checkUnlocks?.();
      showToast(`💧 Water Extractor placed: ${extractor._waterRate} units/s`, '#20d4c8', '#020c10', '#104040');
      return;
    }

    // Trucks aren't on the grid (see the placement below), so the footprint
    // check can't see one: look for another truck standing here directly.
    // All of them, not the tile index: a patrolling truck only updates its
    // col/row, so the index can still file it where it set off from.
    if (type === T.TRUCK || type === T.HAULER) {
      for (const o of EntityRegistry.getByType(T.TRUCK)) {
        if (o.col < col + w && col < o.col + (o.width || 1) && o.row < row + h && row < o.row + (o.height || 1)) {
          flashMessage('Cannot place a truck there; already occupied!');
          return;
        }
      }
    }

    // Dams and turbines only go on water, whose tiles count as blocked, so
    // their branches below never see open ground. Without this, a click on
    // land fell through and built a 1×1 one that did nothing.
    if ((type === T.DAM || type === T.HYDROTURBINE) && GridManager.canPlaceFootprint(col, row, w, h)) {
      flashMessage(type === T.DAM ? 'Dam must be placed on a river tile!' : 'Turbine must be placed in a reservoir.');
      return;
    }

    // Set when the footprint is blocked only by water this building may fill
    // (water_build.js): the fill charge is added to the price below.
    let _fill = null;
    if (!GridManager.canPlaceFootprint(col, row, w, h)) {
      // Special case: road can be built over wires, pipes, and other roads —
      // it doesn't claim those cells in the grid (they stay the stamped
      // occupant so power/pipe connectivity and the existing road are
      // completely unaffected), it just leaves them alone and visually
      // draws over/around them. This lets partial-length road tiles overlap
      // freely instead of needing the full footprint to be empty.
      if (type === T.ROAD) {
        let blocked = false;
        for (let r = row; r < row + h && !blocked; r++) {
          for (let c = col; c < col + w && !blocked; c++) {
            if (!GridManager.inBounds(c, r)) { blocked = true; break; }
            const t = GridManager.getEntity(c, r);
            if (t && t.type !== T.WIRE && t.type !== T.PIPE && t.type !== T.UNDERGNDPIPE && t.type !== T.ROAD) blocked = true;
          }
        }
        if (blocked) {
          // Don't warn on a harmless duplicate invocation for the same tile
          // (e.g. mousedown + drag-continuation both firing for one click) —
          // only warn if something OTHER than our own just-placed road is here.
          const already = GridManager.getEntity(col, row);
          const isSelfDuplicate = already && already.type === T.ROAD && already.col === col && already.row === row;
          let _wet = false;
          for (let r = row; r < row + h && !_wet; r++) for (let c = col; c < col + w; c++) if (WaterSystem.isWater(c, r)) { _wet = true; break; }
          if (!isSelfDuplicate) flashMessage(_wet ? (Progression.isUnlocked(T.BRIDGE) ? 'Use the Bridge tool to cross water' : 'Roads can\'t cross water') : 'Cannot place road here.');
          return;
        }
        // Same duplicate-invocation guard, but for the ALLOWED path (overlap
        // over wire/pipe/road doesn't hit "blocked" above) — without this, a
        // road overlapping another road would get created twice per click,
        // stacking an identical duplicate on the exact same tile every time.
        const _dupRoad = topRoadAt(col, row);
        if (_dupRoad && _dupRoad.col === col && _dupRoad.row === row && _dupRoad.width === w && _dupRoad.height === h) {
          return;
        }
        // Steep ground costs more to grade (terrain_system.js); the road
        // remembers what it cost so removing or undoing it refunds that.
        const cost = Math.round(EntityDefs[T.ROAD].cost * TerrainSystem.buildCostMult(T.ROAD, col, row, w, h));
        if (!Economy.canAfford(cost)) { flashMessage('Not enough funds!'); return; }
        Economy.spend(cost);
        const road = new Entity(T.ROAD, col, row);
        road.width  = w;
        road.height = h;
        if (cost !== EntityDefs[T.ROAD].cost) road._paid = cost;
        road._rotation = state.placementRotation || 0;
        for (let r = row; r < row + h; r++)
          for (let c = col; c < col + w; c++)
          {
            const prev = GridManager.getEntity(c, r);
            if (GridManager.isVegetation(prev)) EntityRegistry.remove(prev);  // road flattens trees/bushes
            if (!prev || GridManager.isVegetation(prev)) GridManager.tiles[r][c] = road;  // claim empty cells only
          }
        EntityRegistry.add(road);
        HistoryManager.record({ type: 'place', entity: road, cost });
        SFX.thump?.();
        PowerNetwork.recomputeWireHops?.();
        Progression.checkUnlocks?.();
        showToast('🛣️ Road built over existing lines', '#d0d0c0', '#141414', '#404040');
        return;
      }
      // Special case: dam placed across a river
      if (type === T.DAM) {
        const preview = ReservoirSystem.findRiverSpan(col, row);
        if (!preview) { flashMessage('Dam must be placed on a river tile!'); return; }
        if (preview.tiles.length < 2) { flashMessage('River too narrow for a dam.'); return; }
        const cost = EntityDefs[T.DAM].cost;
        if (!Economy.canAfford(cost)) { flashMessage('Not enough funds!'); return; }
        // Odd placementRotation → downstream bank; even → upstream (default).
        const side = ((state.placementRotation || 0) % 2) === 1 ? 'downstream' : 'upstream';
        const result = ReservoirSystem.buildDam(col, row, { side });
        if (!result.ok) { flashMessage(result.reason || 'Cannot place dam here.'); return; }
        Economy.spend(cost);
        // Snapshot side + reservoir so undoing then redoing this place
        // restores the same bank / membership (not a fresh side pick).
        HistoryManager.record({
          type: 'place',
          entity: result.dam,
          cost,
          damUndo: ReservoirSystem.captureDamUndoState(result.dam),
        });
        SFX.thump?.();
        PowerNetwork.recomputeWireHops?.();
        Progression.checkUnlocks?.();
        if (result.status === 'pending') {
          showToast('🏗️ Dam built: place a second dam within 30 tiles upstream (or near the river\'s end) to form a reservoir', '#a0c0e0', '#101418', '#404850');
        } else if (result.status === 'paired') {
          showToast(`🏗️ Dams paired: reservoir formed (${result.reservoir.tiles.length} tiles)`, '#a0c0e0', '#101418', '#404850');
        } else {
          showToast(`🏗️ Dam built: reservoir forming (${result.reservoir.tiles.length} tiles)`, '#a0c0e0', '#101418', '#404850');
        }
        return;
      }
      // Special case: hydro turbine placed in water on downstream side of dam
      if (type === T.HYDROTURBINE) {
        const cost = EntityDefs[T.HYDROTURBINE].cost;
        if (!Economy.canAfford(cost)) { flashMessage('Not enough funds!'); return; }
        const result = ReservoirSystem.buildTurbine(col, row, state.placementRotation || 0);
        if (!result.ok) { flashMessage(result.reason || 'Cannot place turbine here.'); return; }
        Economy.spend(cost);
        HistoryManager.record({ type: 'place', entity: result.entity, cost });
        SFX.thump?.();
        PowerNetwork.recomputeWireHops?.();
        Progression.checkUnlocks?.();
        showToast(`⚡ Hydro Turbine placed; generating from reservoir`, '#80e8ff', '#001828', '#0a4078');
        return;
      }
      // Special case: shaft can bridge over water tiles
      if (type === T.SHAFT) {
        const cost = EntityDefs[T.SHAFT].cost;
        if (!Economy.canAfford(cost)) { flashMessage('Not enough funds!'); return; }
        const ori = state.shaftOrientation || 'h';
        const result = ShaftSystem.buildShaft(col, row, ori);
        if (!result.ok) { flashMessage(result.reason || 'Cannot place shaft.'); return; }
        Economy.spend(cost);
        HistoryManager.record({ type: 'place', entity: result.entity, cost });
        SFX.thump?.();
        PowerNetwork.recomputeWireHops?.();
        Progression.checkUnlocks?.();
        return;
      }
      // Special case: pump jack placed on oil deposit
      if (type === T.PUMPJACK || type === T.PUMPJACK2) {
        // Rectangle overlap against the deposit's own bounds — valid as long
        // as the pump jack's footprint touches the deposit at all.
        const dep = _depositOverlap(T.OILDEPOSIT, col, row, w, h);
        if (!dep) { flashMessage(`${EntityDefs[type].label} must be placed on an oil deposit!`); return; }
        tryPlacePumpJack(dep, type);
        return;
      }
      // Special case: geothermal well — accept clicks anywhere whose proposed
      // 3×3 footprint overlaps a geothermal deposit (snaps to the deposit
      // anchor in tryPlaceGeoWell).
      if (type === T.GEOWELL) {
        const gDef = EntityDefs[T.GEOWELL];
        const dep = _depositOverlap(T.GEODEPOSIT, col, row, gDef.width || 3, gDef.height || 3)
                 || ((GridManager.getEntity(col, row)?.type === T.GEODEPOSIT) ? GridManager.getEntity(col, row) : null);
        if (!dep) { flashMessage('Geothermal Well must be placed on a geothermal deposit!'); return; }
        return tryPlaceGeoWell(dep);
      }
      // Special case: uranium mine — accept clicks anywhere whose proposed 4×5 footprint
      // overlaps a uranium deposit (snap to deposit anchor in tryPlaceUraniumMine).
      if (type === T.URANIUMMINE) {
        const mDef = EntityDefs[T.URANIUMMINE];
        const mw = mDef.width || 4, mh = mDef.height || 5;
        let deposit = null;
        // Look anywhere the proposed footprint would touch
        for (let r = row; r < row + mh && !deposit; r++)
          for (let c = col; c < col + mw && !deposit; c++) {
            const t = GridManager.getEntity(c, r);
            if (t && t.type === T.URANIUMDEPOSIT) deposit = t;
          }
        // Fallback: click tile itself
        if (!deposit) {
          const hit = GridManager.getEntity(col, row);
          if (hit && hit.type === T.URANIUMDEPOSIT) deposit = hit;
        }
        if (!deposit) { flashMessage('Uranium Mine footprint must cover a uranium deposit!'); return; }
        return tryPlaceUraniumMine(deposit);
      }
      // Special case: sulfur mine — same logic as uranium mine. An MK2 over
      // an MK1 replaces it.
      if (type === T.SULFURMINE || type === T.SULFURMINE2) {
        const mDef = EntityDefs[type];
        const mw = mDef.width || 4, mh = mDef.height || 5;
        if (type === T.SULFURMINE2) { const old = _mk1SulfurMineUnder(col, row, mw, mh); if (old) return tryReplaceSulfurMine(old); }
        let deposit = null;
        for (let r = row; r < row + mh && !deposit; r++)
          for (let c = col; c < col + mw && !deposit; c++) {
            const t = GridManager.getEntity(c, r);
            if (t && t.type === T.SULFURDEPOSIT) deposit = t;
          }
        if (!deposit) {
          const hit = GridManager.getEntity(col, row);
          if (hit && hit.type === T.SULFURDEPOSIT) deposit = hit;
        }
        if (!deposit) { flashMessage(`${mDef.label} footprint must cover a sulfur deposit${type === T.SULFURMINE2 ? ' or a Sulfur Mine' : ''}!`); return; }
        return tryPlaceSulfurMine(deposit, type);
      }
      // Special case: lithium mine — same logic as uranium mine
      if (type === T.LITHIUMMINE) {
        const mDef = EntityDefs[T.LITHIUMMINE];
        const mw = mDef.width || 4, mh = mDef.height || 5;
        let deposit = null;
        for (let r = row; r < row + mh && !deposit; r++)
          for (let c = col; c < col + mw && !deposit; c++) {
            const t = GridManager.getEntity(c, r);
            if (t && t.type === T.LITHIUMDEPOSIT) deposit = t;
          }
        if (!deposit) {
          const hit = GridManager.getEntity(col, row);
          if (hit && hit.type === T.LITHIUMDEPOSIT) deposit = hit;
        }
        if (!deposit) { flashMessage('Lithium Mine footprint must cover a lithium deposit!'); return; }
        return tryPlaceLithiumMine(deposit);
      }
      // Special case: rare earth mine — same logic as the uranium mine
      if (type === T.RAREEARTHMINE) {
        const deposit = _depositUnderMine(T.RAREEARTHMINE, T.RAREEARTHDEPOSIT, col, row);
        if (!deposit) { flashMessage('Rare Earth Mine footprint must cover a rare earth deposit!'); return; }
        return tryPlaceRareEarthMine(deposit);
      }
      // Special case: helium well — same logic as the lithium mine. An MK2
      // over an MK1 replaces it.
      if (type === T.HELIUMWELL || type === T.HELIUMWELL2) {
        const wDef = EntityDefs[type];
        const ww = wDef.width || 4, wh = wDef.height || 4;
        if (type === T.HELIUMWELL2) { const old = _mk1WellUnder(col, row, ww, wh); if (old) return tryReplaceHeliumWell(old); }
        let deposit = null;
        for (let r = row; r < row + wh && !deposit; r++)
          for (let c = col; c < col + ww && !deposit; c++) {
            const t = GridManager.getEntity(c, r);
            if (t && t.type === T.HELIUMDEPOSIT) deposit = t;
          }
        if (!deposit) {
          const hit = GridManager.getEntity(col, row);
          if (hit && hit.type === T.HELIUMDEPOSIT) deposit = hit;
        }
        if (!deposit) { flashMessage(`${wDef.label} footprint must cover a helium gas field${type === T.HELIUMWELL2 ? ' or a Helium Well' : ''}!`); return; }
        return tryPlaceHeliumWell(deposit, type);
      }
      if (type === T.TRUCK || type === T.HAULER) {
        // Trucks need to fall through here so they can be placed on top of
        // roads/wires/poles/pipes/conveyors — those all count as "occupied"
        // to canPlaceFootprint, but a truck legitimately drives over them
        // (see PASSTHROUGH in truck.js). The bug: this used to fall through
        // unconditionally for ANY occupied tile, with no check on what was
        // actually there. Click the Truck tool on a tile already holding a
        // truck (e.g. the depot, or the existing truck itself) and it placed
        // a brand new truck stacked right on top — a second truck appearing
        // in a world that already had one. Now we only allow the fall-
        // through when every tile in the footprint is either empty or one
        // of the genuinely passable types; anything else (including another
        // truck) blocks placement like it does for every other entity type.
        const TRUCK_PLACEMENT_PASSTHROUGH = new Set([T.WIRE, T.POLE, T.LAMP, T.ROAD, T.POWERTOWER, T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR]);
        let blocked = false;
        for (let r = row; r < row + h && !blocked; r++) {
          for (let c = col; c < col + w && !blocked; c++) {
            if (!GridManager.inBounds(c, r)) { blocked = true; break; }
            const t = GridManager.getEntity(c, r);
            if (t && !TRUCK_PLACEMENT_PASSTHROUGH.has(t.type)) blocked = true;
          }
        }
        if (blocked) { flashMessage('Cannot place a truck there; already occupied!'); return; }
        /* fall through to normal placement below */
      }
      else if (type === T.PATHTOOL) { /* fall through */ }
      else
      // Special case: coal mine (any tier) can be placed on top of a coal deposit
      if (type === T.COALMINE || type === T.COALMINE2) {
        // Find the deposit under the cursor, or any deposit the mine's
        // footprint overlaps — the same rule the green ghost uses, so a
        // click is accepted wherever the ghost says it will be.
        const hit = GridManager.getEntity(col, row);
        const deposit = (hit && hit.type === T.COALDEPOSIT) ? hit : _depositOverlap(T.COALDEPOSIT, col, row, w, h);

        if (!deposit) {
          flashMessage('Coal Mine must be placed on a coal deposit!');
          return;
        }
        if (deposit.coalAmount <= 0) {
          flashMessage('This deposit is exhausted!');
          return;
        }
        // Both tiers build around the deposit, whatever its size —
        // tryPlaceCoalMine checks the footprint (_coalMineFootprintClear).
        return tryPlaceCoalMine(deposit.col, deposit.row, deposit, type);
      } else {
        // Only water in the way: fill it, at a charge, once the Bridge is
        // unlocked (and never a dam reservoir). A Power Tower stands in it
        // on footings instead, Bridge or not.
        _fill = type === T.POWERTOWER ? WaterBuild.towerPlan(col, row, w, h) : WaterBuild.fillPlan(type, col, row, w, h);
        if (!_fill) return;
        if (!_fill.ok) { flashMessage(_fill.reason); return; }
      }
    }
    // Also allow clicking anywhere on a deposit even if canPlace passes (edge case)
    if (type === T.COALMINE || type === T.COALMINE2) {
      const hit = GridManager.getEntity(col, row);
      const dep = (hit && hit.type === T.COALDEPOSIT) ? hit : _depositOverlap(T.COALDEPOSIT, col, row, w, h);
      if (dep) {
        return tryPlaceCoalMine(dep.col, dep.row, dep, type);
      }
      flashMessage('Coal Mine must be placed on a 2×2 or 3×3 coal deposit!');
      return;
    }

    if (type === T.GEOWELL) {
      const gDef = EntityDefs[T.GEOWELL];
      const dep = _depositOverlap(T.GEODEPOSIT, col, row, gDef.width || 3, gDef.height || 3);
      if (dep) return tryPlaceGeoWell(dep);
      flashMessage('Geothermal Well must be placed on a geothermal deposit!');
      return;
    }

    if (type === T.GEOTURBINE) return tryPlaceGeoTurbine(col, row);

    if (type === T.URANIUMMINE) {
      const mDef = EntityDefs[T.URANIUMMINE];
      const mw = mDef.width || 4, mh = mDef.height || 5;
      let deposit = null;
      for (let r = row; r < row + mh && !deposit; r++)
        for (let c = col; c < col + mw && !deposit; c++) {
          const t = GridManager.getEntity(c, r);
          if (t && t.type === T.URANIUMDEPOSIT) deposit = t;
        }
      if (deposit) return tryPlaceUraniumMine(deposit);
      flashMessage('Uranium Mine footprint must cover a uranium deposit!');
      return;
    }

    if (type === T.SULFURMINE || type === T.SULFURMINE2) {
      const mDef = EntityDefs[type];
      const mw = mDef.width || 4, mh = mDef.height || 5;
      if (type === T.SULFURMINE2) { const old = _mk1SulfurMineUnder(col, row, mw, mh); if (old) return tryReplaceSulfurMine(old); }
      let deposit = null;
      for (let r = row; r < row + mh && !deposit; r++)
        for (let c = col; c < col + mw && !deposit; c++) {
          const t = GridManager.getEntity(c, r);
          if (t && t.type === T.SULFURDEPOSIT) deposit = t;
        }
      if (deposit) return tryPlaceSulfurMine(deposit, type);
      flashMessage(`${mDef.label} footprint must cover a sulfur deposit${type === T.SULFURMINE2 ? ' or a Sulfur Mine' : ''}!`);
      return;
    }

    if (type === T.LITHIUMMINE) {
      const mDef = EntityDefs[T.LITHIUMMINE];
      const mw = mDef.width || 4, mh = mDef.height || 5;
      let deposit = null;
      for (let r = row; r < row + mh && !deposit; r++)
        for (let c = col; c < col + mw && !deposit; c++) {
          const t = GridManager.getEntity(c, r);
          if (t && t.type === T.LITHIUMDEPOSIT) deposit = t;
        }
      if (deposit) return tryPlaceLithiumMine(deposit);
      flashMessage('Lithium Mine footprint must cover a lithium deposit!');
      return;
    }

    if (type === T.RAREEARTHMINE) {
      const deposit = _depositUnderMine(T.RAREEARTHMINE, T.RAREEARTHDEPOSIT, col, row);
      if (deposit) return tryPlaceRareEarthMine(deposit);
      flashMessage('Rare Earth Mine footprint must cover a rare earth deposit!');
      return;
    }

    if (type === T.HELIUMWELL || type === T.HELIUMWELL2) {
      const wDef = EntityDefs[type];
      const ww = wDef.width || 4, wh = wDef.height || 4;
      if (type === T.HELIUMWELL2) { const old = _mk1WellUnder(col, row, ww, wh); if (old) return tryReplaceHeliumWell(old); }
      let deposit = null;
      for (let r = row; r < row + wh && !deposit; r++)
        for (let c = col; c < col + ww && !deposit; c++) {
          const t = GridManager.getEntity(c, r);
          if (t && t.type === T.HELIUMDEPOSIT) deposit = t;
        }
      if (deposit) return tryPlaceHeliumWell(deposit, type);
      flashMessage(`${wDef.label} footprint must cover a helium gas field${type === T.HELIUMWELL2 ? ' or a Helium Well' : ''}!`);
      return;
    }

    // Pump Jack must be placed on an oil deposit
    if (type === T.PUMPJACK || type === T.PUMPJACK2) {
      // Rectangle overlap against the deposit's own bounds — see matching
      // comment in the occupied-tile branch above.
      const dep = _depositOverlap(T.OILDEPOSIT, col, row, w, h);
      if (!dep) { flashMessage(`${EntityDefs[type].label} must be placed on an oil deposit!`); return; }
      tryPlacePumpJack(dep, type);
      return;
    }

    // Block wire placement if it would exceed the hop limit
    if (type === T.WIRE && wouldExceedWireHops(col, row)) {
      flashMessage('Wire too long: place a Power Pole first!');
      return;
    }

    // Per-type build caps (research tiers, waste facilities)
    if (atPlacementLimit(type)) { flashMessage(PLACEMENT_LIMITS[type].msg); return; }

    // Surface pipes on steep ground are dearer (terrain_system.js); what the
    // slope adds is kept in _paid below so a removal refunds it.
    const _slope = TerrainSystem.buildCostMult(type, col, row, w, h);
    const _list = Math.round((typeof buildCost === 'function' ? buildCost(type) : def.cost) * _slope);
    const _fillCost = _fill ? _fill.cost : 0;
    const cost = Math.round(_list * _contam.mult) + _fillCost;
    if (!Economy.canAfford(cost)) { flashMessage('Not enough funds!'); return; }

    // A waste facility is fixed once it's down: moving it costs most of its
    // price again and removing it all of it (WASTE_*_FEE_PCT), and its
    // placement can't be undone. So the spot is confirmed first, quoting
    // both fees. Confirm runs the placement again from the top, so the spot
    // is rechecked after however long the dialog stood open. A blueprint
    // stamp lays many pieces at once and doesn't stop for one.
    if (_wasteFacilityFixed(type) && !state.bpStamping && !_wasteSpotOk) {
      if (_wasteSpotAsking) return;
      _wasteSpotAsking = true;
      const label = def.label || 'facility';
      PenaltyModal.show({
        title: 'CONFIRM LOCATION',
        msg:   `Build the ${label} here? It's fixed once built: moving it later costs ${formatMoney(_wasteFacilityFee({ type }, WASTE_RELOCATE_FEE_PCT))} (${Math.round(WASTE_RELOCATE_FEE_PCT * 100)}% of its build cost), removing it costs ${formatMoney(_wasteFacilityFee({ type }, WASTE_REMOVE_FEE_PCT))}, and placing it can't be undone.`,
        fine:  cost,
        onConfirm() {
          _wasteSpotAsking = false;
          if (state.selectedTool !== type) return;
          _wasteSpotOk = true;
          try { _tryPlaceTile(col, row); } finally { _wasteSpotOk = false; }
        },
        onCancel() { _wasteSpotAsking = false; },
      });
      return;
    }
    if (_contam.mult > 1) flashMessage(_contam.msg);

    // Shaft: use current placement orientation
    if (type === T.SHAFT) {
      const ori = state.shaftOrientation || 'h';
      const result = ShaftSystem.buildShaft(col, row, ori);
      if (!result.ok) { flashMessage(result.reason || 'Cannot place shaft.'); return; }
      Economy.spend(cost);
      HistoryManager.record({ type: 'place', entity: result.entity, cost });
      SFX.thump?.();
      PowerNetwork.recomputeWireHops?.();
      Progression.checkUnlocks?.();
      return;
    }

    Economy.spend(cost);
    // The Hauler tool places a Truck entity flagged as one (truckSpec).
    const entity = new Entity(type === T.HAULER ? T.TRUCK : type, col, row);
    if (type === T.HAULER) { entity._hauler = true; entity.def = EntityDefs[T.HAULER]; }
    entity.width  = w;
    entity.height = h;
    if (_list < def.cost) entity._paid = cost - _fillCost;   // any discounted build (hookup deal, contract perk) is refunded as paid
    if (_slope > 1 && _list !== def.cost) entity._paid = _list;                           // slope surcharge, refunded as paid
    if (_fill) {
      // The fill (or footing) charge is refunded with the building, and the lake comes back with it.
      entity._paid = (entity._paid !== undefined ? entity._paid : def.cost) + _fillCost;
      if (_fill.footing) WaterBuild.claimTower(entity, _fill);
      else WaterBuild.fill(entity, _fill);
    }
    // Underground belt: built as an ordinary conveyor so every belt system
    // sees it, keeping its own def for cost/refund/label (resource_helpers.js).
    if (type === T.UNDERGNDCONVEYOR) {
      entity.type    = T.CONVEYOR;
      entity._udgBelt = true;
      entity._udgAxis = inferUndergndBeltAxis(col, row) || (state.undergndBeltAxis === 'v' ? 'v' : 'h');
      _udgPairPlaced(entity);
    }
    if (type === T.CONVEYORSPLITTER) initSplitter(entity, { ...state.splitter, placed: true });
    // Build order matters for anything rationed by seniority — water is shared
    // out among coal generators oldest-first (see updatePipeConnectivity), so
    // a newly built plant must never take a running one's supply. Customer
    // buildings get this stamped on accept(); player-built ones need it here.
    entity._placedAt = Date.now();
    if (w > 1 || h > 1) {
      if (type === T.COALGENERATOR || type === T.HYDROGENERATOR || type === T.CHEMICALPLANT || type === T.FUELPLANT || type === T.NUCLEARREACTOR || type === T.RESEARCH2 || type === T.RESEARCH3 || type === T.ROAD || type === T.ELECTROLYZER || type === T.LITHIUMPROCESSPLANT || type === T.REPROCESSOR || type === T.SPENTFUELPOOL || type === T.MOXPLANT || type === T.ADVREACTOR || type === T.DRONEPORT || type === T.DRONECHARGER || type === T.ATMOSCOLLECTOR || type === T.HABERBOSCH || type === T.WASHTOWER || type === T.FUSIONFUELPLANT || type === T.HULKINGFUSIONREACTOR || type === T.ADVFUSIONREACTOR || type === T.MHDRING || type === T.CRYOPLANT || type === T.HE3SEPARATOR || type === T.TRITIUMBREEDER || type === T.GASSTORAGE || type === T.OILSTORAGE || type === T.SOLIDSTORAGE) {
        // The Chemical Plant is fixed: its three ports always sit where the
        // default layout puts them (water left, sulfur + acid on the bottom).
        // Blueprint stamps come through here too, so they can't turn it.
        // Liquid Storage Tank: even rotation = left-face stubs (legacy default),
        // odd = right-face stubs. IN/OUT roles are resolved from connections.
        entity._rotation = (type === T.CHEMICALPLANT || (!placementTurns(type) && !state.bpStamping)) ? 0 : (state.placementRotation || 0);
        entity.def = { ...EntityDefs[type] }; // per-instance def
        // Map placementRotation 0/1/2/3 → N/E/S/W input side for hydrogenerator
        if (type === T.HYDROGENERATOR) {
          const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
          const [dc, dr] = dirs[entity._rotation % 4];
          entity._inSideDc = dc;
          entity._inSideDr = dr;
        }
      } else if (type === T.BIOFUELGEN) {
        entity.def = { ...EntityDefs[T.BIOFUELGEN] };
      } else if (type === T.GASSTATION || type === T.COALWASTE
              || type === T.OILWASTE   || type === T.NUCLEARWASTE) {
        // These carry live per-instance state (fuel stored, waste stored) that
        // the panels and save loader read off entity.def — the auto-spawners
        // that used to create them cloned the def for exactly this reason, so
        // the player-built ones have to as well. No rotation: their sprites
        // only exist in one orientation.
        entity.def = { ...EntityDefs[type] };
      } else if (type === T.TRUCK || type === T.HAULER) {
        // Trucks use continuous _angle (radians) rather than the discrete
        // _rotation buildings use — convert the same 0-3 N/E/S/W cycle.
        entity._angle = ((state.placementRotation || 0) % 4) * (Math.PI / 2);
      }
      // Trucks live in world space and are never stamped onto the grid (the
      // load never stamps them either; it is registered just below). Stamped
      // here, a truck put down on a wire took the wire's tiles, and once it
      // drove off on a patrol (which runs off the grid, skipGrid) nothing
      // handed them back: the wire was gone from the map and from saves, and
      // the tiles still read as the truck, so nothing could be built there.
      if (type !== T.TRUCK && type !== T.HAULER) GridManager.setEntityFootprint(entity);
    } else {
      // If placing a wire over a pipe, store the pipe for BFS continuity and restoration
      if (type === T.WIRE) {
        const _existing = GridManager.getEntity(col, row);
        if (_existing && _existing.type === T.PIPE) {
          entity._underPipe = _existing;
        }
      }
      if (type === T.UNDERGNDPIPE) {
        entity._udgAxis = inferUndergndPipeAxis(col, row) || (state.undergndPipeAxis === 'v' ? 'v' : 'h');
        _udgPairPlaced(entity);
      }
      GridManager.setEntity(col, row, entity);
    }
    if (type === T.TRUCK || type === T.HAULER) { EntityRegistry.add(entity); selectTool(null); }
    if (type === T.GOVERNOR) {
      const _gens = GovernorSystem.generatorsFor(entity);
      // Attaching says nothing (the generator's panel shows it); only a
      // governor touching no generator is worth flagging.
      if (!_gens.length) showToast('⚙ Governor idle: place it touching a Fuel or Coal Generator', '#e08040', '#140802', '#603010');
    }
    if (type === T.CHEMICALPLANT) EntityRegistry.add(entity);
    if (type === T.FUELPLANT) {
      EntityRegistry.add(entity);
    }
    if (type === T.NUCLEARREACTOR) EntityRegistry.add(entity);
    if (type === T.LITHIUMPROCESSPLANT) EntityRegistry.add(entity);
    if (type === T.REPROCESSOR)    EntityRegistry.add(entity);
    if (type === T.MOXPLANT)       EntityRegistry.add(entity);
    if (type === T.ADVREACTOR)     EntityRegistry.add(entity);
    if (type === T.DRONEPORT)      EntityRegistry.add(entity);
    if (type === T.DRONECHARGER)   EntityRegistry.add(entity);
    if (type === T.SPENTFUELPOOL)  EntityRegistry.add(entity);
    if (type === T.COOLINGTOWER)   EntityRegistry.add(entity);
    if (type === T.COOLINGTOWER2)  EntityRegistry.add(entity);
    if (type === T.STEAMTURBINE)   EntityRegistry.add(entity);
    if (type === T.STEAMTURBINE2)  EntityRegistry.add(entity);
    // A waste facility's placement isn't undoable: undo refunds the full cost,
    // which would sidestep its removal fee (see WASTE_FACILITY_TYPES).
    if (!_wasteFacilityFixed(type)) HistoryManager.record({ type: 'place', entity, cost });
    AmenityRequestSystem.onAmenityPlaced(type, col, row, w, h);
    if (typeof ZoneRequestSystem !== 'undefined') ZoneRequestSystem.onItemPlaced(type, col, row, entity);

    // Thump for buildings, a lighter one for a pole; wire has its own spark sound
    if (type !== T.WIRE && type !== T.POLE && type !== T.CONVEYOR && type !== T.PIPE && type !== T.PATHTOOL) SFX.thump();
    if (type === T.POLE) SFX.polePlace?.();
    // Power tower placement — ensure 8-hop limit is active
    if (type === T.POWERTOWER) PowerNetwork.setWireHops(8);

    // Spark SFX — only if this wire/entity connects to live current.
    // Defer by one tick so PowerNetwork has updated e.powered.
    if (type === T.WIRE) {
      setTimeout(() => {
        const placed = GridManager.getEntity(col, row);
        if (!placed) return;
        // Check if this wire is powered, or if any powered entity is adjacent
        const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
        const liveNeighbour = dirs.some(([dc,dr]) => {
          const n = GridManager.getEntity(col+dc, row+dr);
          return n && n.powered && n.type !== T.WIRE;
        });
        if (liveNeighbour) SFX.spark();
      }, 120);  // one tick after PowerNetwork update
    }
  }



  // Roads can overlap each other (partial-length overlaps). The grid cell
  // only ever points at whichever road claimed it FIRST, so a direct lookup
  // at an overlap always resolves to the original/bottom road even when a
  // newer one was laid on top. This scans the registry for every road
  // covering the tile and returns the most recently placed (topmost) one.
  function topRoadAt(col, row) {
    let top = null;
    for (const r of EntityRegistry.getByType(T.ROAD)) {
      if (col >= r.col && col < r.col + r.width && row >= r.row && row < r.row + r.height) top = r;
    }
    return top;
  }

  // Clearing a nuclear ruin (LightningDamageSystem ruins). The removal itself
  // goes through tryRemove so every per-type cleanup (deposits, water, dams)
  // still runs, but whatever refund that path pays is taken back on top of
  // the fee, and it leaves no undo entry.
  let _clearingWreck = false;
  function askClearWreck(existing) {
    const fee   = LightningDamageSystem.wreckClearCost(existing);
    const label = existing.businessName || existing.def?.label || EntityDefs[existing.type]?.label || 'building';
    PenaltyModal.show({
      title: 'CLEAR NUCLEAR WRECKAGE',
      msg:   `The ${label} was destroyed in the nuclear blast. Hauling away the contaminated rubble costs ${formatMoney(fee)} (60% of its value). Nothing is refunded and this cannot be undone.`,
      fine:  fee,
      onConfirm() {
        if (!Economy.canAfford(fee)) { flashMessage('Not enough funds!'); return; }
        if (GridManager.getEntity(existing.col, existing.row) !== existing) return;
        const before = Economy.balance;
        _clearingWreck = true;
        HistoryManager.mute();
        try { tryRemove(existing.col, existing.row, true); }
        finally { _clearingWreck = false; HistoryManager.unmute(); }
        Economy.spend((Economy.balance - before) + fee);
        EntityInfoPanel.close();
        PowerNetwork.recomputeWireHops();
        SFX.demolish();
        showToast(`☢ Wreckage cleared: ${formatMoney(fee)}`, '#ff6040', '#180800', '#602010');
      },
      onCancel() {},
    });
  }

  // Batteries and substations hold charge, and tearing one down throws it
  // away. Removing one that is holding any asks first: a single delete asks
  // about that building (tryRemove); a Zone Delete or a selection delete asks
  // once for the lot (askBulkStorage), where Cancel keeps the charged ones
  // and removes the rest. Silent removals (upgrades, line lifting) don't ask.
  const STORAGE_TYPES = new Set([T.BATTERY, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5]);
  const STORAGE_WARN_PCT = 0.01;   // below this it is as good as empty
  const _storedPct = e => (e && STORAGE_TYPES.has(e.type) && e.def?.capacity > 0)
    ? Math.max(0, Math.min(1, (e.charge || 0) / e.def.capacity)) : 0;
  const _holdsCharge = e => _storedPct(e) >= STORAGE_WARN_PCT;
  let _storageOk   = false;   // the player said yes: let a charged one through tryRemove
  let _keepCharged = false;   // the player said keep them: a sweep passes over charged ones
  function askRemoveStorage(existing) {
    const label = existing.def?.label || EntityDefs[existing.type]?.label || 'building';
    PenaltyModal.show({
      title: 'REMOVE CHARGED STORAGE',
      msg:   `The ${label} is still holding ${Math.round(_storedPct(existing) * 100)}% of its charge. Removing it throws that stored power away.`,
      fine:  null,
      onConfirm() {
        if (GridManager.getEntity(existing.col, existing.row) !== existing) return;
        _storageOk = true;
        try { tryRemove(existing.col, existing.row); }
        finally { _storageOk = false; }
        PowerNetwork.recomputeWireHops();
      },
      onCancel() {},
    });
  }
  // `list` is what the sweep would take; `run` does the sweep.
  function askBulkStorage(list, run) {
    const charged = [...new Set(list)].filter(_holdsCharge);
    if (!charged.length) { run(); return; }
    const n = charged.length;
    PenaltyModal.show({
      title: 'REMOVE CHARGED STORAGE',
      msg:   `${n === 1 ? 'A battery or substation' : `${n} batteries and substations`} in this area ${n === 1 ? 'is' : 'are'} still holding charge. Removing ${n === 1 ? 'it' : 'them'} throws that stored power away. Confirm removes ${n === 1 ? 'it' : 'them'} too. Cancel keeps ${n === 1 ? 'it' : 'them'} and removes the rest.`,
      fine:  null,
      onConfirm() { run(); },
      onCancel() {
        _keepCharged = true;
        try { run(); } finally { _keepCharged = false; }
        showToast(`⚡ ${n} charged ${n === 1 ? 'storage building' : 'storage buildings'} kept`, '#6cb8ff', '#0b1119', '#16304f');
      },
    });
  }

  // A truck running Auto Dispatch (or driving a dispatch queue) is mid-job:
  // moving or deleting it would strand its claim and route. The switch (or
  // Stop) in its panel has to come off first. A queue trip that is paused,
  // with the truck parked, keeps _autoDispatch set so Start can resume it;
  // that alone used to lock the truck with the switch showing off, and only
  // flicking Auto Dispatch on and off (which clears the queue) freed it.
  function truckLocked(e) {
    return !!e && e.type === T.TRUCK
      && !!(e._autoHaulEnabled || e._autoHaulPendingEnable || (e._autoDispatch && e._patrolling));
  }
  function truckLockedToast(verb, e) {
    const msg = e && !e._autoHaulEnabled && !e._autoHaulPendingEnable
      ? `🚛 Truck is driving its queue: press Stop in the truck's panel before ${verb} it`
      : `🤖 Truck is on Auto Dispatch: turn it off in the truck's panel before ${verb} it`;
    showToast(msg, '#6cb8ff', '#0b1119', '#16304f');
  }
  // A truck with waste or materials in its bed has to unload first:
  // deleting it would make the load vanish.
  function truckLoaded(e) {
    return !!e && e.type === T.TRUCK && (e._cargoAmount || 0) > 0.01;
  }
  function truckLoadedToast(e) {
    const what = e._cargoLabel ? e._cargoLabel.toLowerCase() : 'a load';
    showToast(`⚠ Truck is carrying ${what}: unload it before deleting it`, '#ff6040', '#140800', '#602010');
  }

  // Burnout SFX when pulling a wire cuts something off. The snapshot of
  // powered buildings walks every entity in the city, so a delete-drag over
  // a wire run takes it once at the first tile and checks once after the
  // power network has caught up (it holds its rebuild until the drag ends —
  // see PowerNetwork.setDragBatching), instead of once per tile.
  let _burnoutSnap = null;
  function _armWireBurnoutCheck() {
    if (_burnoutSnap) return;
    _burnoutSnap = [];
    for (const _e of EntityRegistry.all()) {
      if (_e.powered && _e.type !== T.WIRE) _burnoutSnap.push(_e);
    }
    const check = () => {
      if (PowerNetwork.isDragBatching?.()) { setTimeout(check, 100); return; }
      setTimeout(() => {
        const snap = _burnoutSnap;
        _burnoutSnap = null;
        for (const _e of snap) {
          if (!_e.powered) { SFX.burnout(0.55); break; }
        }
      }, 150);   // one tick after PowerNetwork update
    };
    setTimeout(check, 0);
  }

  // Deleting by hand (the Delete tool, or a held right-click) takes ONE thing
  // off each tile per press. A tile can hold a stack (a belt over a pipe, a
  // pipe over a wire), and removing the top hands the tile to the layer
  // underneath; deleting again on every mousemove meant the slightest wobble
  // while the button was down took the layer below as well, so deleting a
  // belt laid over a pipe always lost the pipe too. Press again to take the
  // next layer. (Zone Delete still clears whole stacks: _zoneClearTile.)
  let _pressRemoved = null;   // "c,r" keys struck since the button went down
  function _pressRemove(col, row) {
    const k = col + ',' + row;
    if (_pressRemoved) {
      if (_pressRemoved.has(k)) return;
      _pressRemoved.add(k);
    }
    tryRemove(col, row);
  }

  function tryRemove(col, row, suppressSound = false) {
    let _existing = GridManager.getEntity(col, row);
    // If grid points at wire/pipe/undergndpipe, or at a road that another
    // (newer) road is overlapping, prefer the topmost road covering this
    // tile for deletion — the grid cell only ever belongs to whichever
    // road claimed it first, so a direct lookup alone can't tell you
    // which overlapping road you're actually looking at.
    if (_existing && (_existing.type === T.WIRE || _existing.type === T.PIPE || _existing.type === T.UNDERGNDPIPE || _existing.type === T.ROAD)) {
      const _roadHere = topRoadAt(col, row);
      if (_roadHere) _existing = _roadHere;
    }
    // A job site's existing plant belongs to the client. The player is
    // there to add to it, not to strip it for the refund. Checked ahead of
    // the shaft/dam branches below, which return before any other guard.
    if (_existing && _existing._clientOwned) {
      if (!suppressSound) showToast('⚠ Client property, not yours to remove', '#ff6040', '#140800', '#602010');
      return;
    }
    if (truckLocked(_existing)) {
      if (!suppressSound) truckLockedToast('deleting', _existing);
      return;
    }
    if (truckLoaded(_existing)) {
      if (!suppressSound) truckLoadedToast(_existing);
      return;
    }
    // A bridge with a truck on it stays put: taking it away would drop the truck in the water.
    if (_existing && _existing._bridge && WaterBuild.truckOn(_existing)) {
      if (!suppressSound) showToast('⚠ A truck is on this bridge; wait for it to cross', '#ff6040', '#140800', '#602010');
      return;
    }
    // Shaft: clear footprint, restore any water tiles it was bridging
    if (_existing && _existing.type === T.SHAFT && _existing._waterTiles && _existing._waterTiles.length) {
      const refund = Math.round((_existing.def.cost || 0) * 0.5);
      GridManager.removeEntityFootprint(_existing);
      ShaftSystem.onShaftRemoved?.(_existing);
      Economy.spend(-refund);
      EntityInfoPanel?.close?.();
      HistoryManager.record({ type: 'remove', entity: _existing, cost: refund });
      return;
    }
    // Dam/turbine: delegate cleanup BEFORE generic removal so reservoir state syncs
    if (_existing && (_existing.type === T.DAM || _existing.type === T.HYDROTURBINE)) {
      const refund = Math.round((_existing.def.cost || 0) * 0.5);
      // Capture dam side + reservoir membership BEFORE dissolve so Ctrl+Z
      // can put it back on the same bank / same reservoir.
      const damUndo = _existing.type === T.DAM
        ? ReservoirSystem.captureDamUndoState?.(_existing)
        : undefined;
      // Clear the footprint FIRST so water restoration can write into empty tiles
      if (_existing.type === T.DAM && _existing._spanTiles) {
        // Dam: clear span tiles manually (irregular footprint)
        for (const t of _existing._spanTiles) {
          if (GridManager.inBounds(t.c, t.r) && GridManager.tiles[t.r][t.c] === _existing) {
            GridManager.tiles[t.r][t.c] = null;
          }
        }
        EntityRegistry.remove(_existing);
      } else {
        if (_existing.width > 1 || _existing.height > 1) GridManager.removeEntityFootprint(_existing);
        else GridManager.removeEntity(col, row);
      }
      // Now restore water + reservoir cleanup
      ReservoirSystem.onEntityRemoved(_existing);
      Economy.spend(-refund);
      EntityInfoPanel?.close?.();
      HistoryManager.record({ type: 'remove', entity: _existing, cost: refund, damUndo });
      return;
    }
    const _GOV_PROTECT = new Set([T.GOVBUILDING, T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB, T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ]);
    if (_existing && _GOV_PROTECT.has(_existing.type)) {
      showToast('⚠ Government buildings cannot be removed', '#ff6040', '#140800', '#602010');
      return;
    }
    if (_existing && DEPOSIT_TYPES.has(_existing.type)) {
      showToast('⚠ Resource deposits cannot be removed', '#ff6040', '#140800', '#602010');
      return;
    }
    // Lamps, cameras, cell towers, fiber hubs and EV chargers were asked for
    // by customers and stay where they were put.
    if (requestedAmenityLocked(_existing)) {
      if (!suppressSound) requestedAmenityLockedToast(_existing);
      return;
    }
    // A Survey Station (either tier) mid-scan stays put until the scan finishes.
    if (_existing && (_existing.type === T.SURVEY || _existing.type === T.SURVEY2) && _existing._scanning) {
      if (!suppressSound) showToast('⚠ Survey Station is scanning; wait for the scan to finish', '#ff6040', '#140800', '#602010');
      return;
    }
    const _e = _existing;
    if (_e && (_e.type === T.TREE || _e.type === T.BUSH)) return;  // vegetation removed by chopping only
    if (_e && _e.type === T.WATER) return;
    const existing = _existing;
    if (!existing) return;

    // A nuclear ruin: no refund, a confirmed (and not undoable) cleanup bill.
    if (existing._irreparable && !_clearingWreck) {
      if (!suppressSound) askClearWreck(existing);
      return;
    }

    // Waste sources (coal generator, refinery, reactor) must be emptied
    // below WASTE_REMOVE_BLOCK_PCT before demolition.
    const _wastePct = _clearingWreck ? null : wasteBlocksRemoval(existing);
    if (_wastePct !== null) {
      if (!suppressSound) wasteRemovalBlockedToast(existing, _wastePct);
      return;
    }

    // A battery or substation still holding charge: ask first (see askRemoveStorage).
    if (!suppressSound && !_storageOk && !_clearingWreck && _holdsCharge(existing)) {
      askRemoveStorage(existing);
      return;
    }

    // Waste facilities: confirmed demolition for the full build cost, no
    // refund, not undoable (an undo would hand the facility straight back).
    if (_wasteFacilityFixed(existing.type) && !_clearingWreck) {
      const fine  = _wasteFacilityFee(existing, WASTE_REMOVE_FEE_PCT);
      const label = existing.def?.label || EntityDefs[existing.type]?.label || 'facility';
      PenaltyModal.show({
        title:   'REMOVE FACILITY',
        msg:     `Removing the ${label} costs a removal fee of ${formatMoney(fine)} (${Math.round(WASTE_REMOVE_FEE_PCT * 100)}% of its build cost). Nothing is refunded and this cannot be undone.`,
        fine,
        onConfirm() {
          if (!Economy.canAfford(fine)) { flashMessage('Not enough funds!'); return; }
          // The modal is async — make sure it's still standing where it was.
          if (GridManager.getEntity(existing.col, existing.row) !== existing) return;
          Economy.spend(fine);
          GridManager.removeEntityFootprint(existing);
          if (WastePanel.isOpen() && WastePanel.target === existing) WastePanel.close();
          EntityInfoPanel.close();
          PowerNetwork.recomputeWireHops();
          SFX.demolish();
          showToast(`✕ ${label} removed: ${formatMoney(fine)} fee`, '#ff6040', '#180800', '#602010');
        },
        onCancel() {},
      });
      return;
    }

    // Customer buildings require a demolish penalty confirmation
    if (CUSTOMER_TYPES.has(existing.type) && !_clearingWreck) {
      const base = existing.upfrontPaid || (existing.dailyFee || 100) * 20;
      const fine = Math.round(base * 0.75);
      PenaltyModal.show({
        title:   'DEMOLISH BUILDING',
        msg:     `Permanently removing this building incurs a demolition penalty of ${formatMoney(fine)} (75% of upfront payment). This cannot be undone.`,
        fine,
        onConfirm() {
          if (!Economy.canAfford(fine)) { flashMessage('Not enough funds!'); return; }
          Economy.spend(fine);
          if (existing.width > 1 || existing.height > 1) GridManager.removeEntityFootprint(existing);
          else GridManager.removeEntity(col, row);
          EntityInfoPanel.close();
          showToast(`✕ Demolished: ${formatMoney(fine)} penalty`, '#ff6040', '#180800', '#602010');
        },
        onCancel() {},
      });
      return;
    }

    // An underground pipe carrying a wire or belt: the rider is what the
    // player can see on top, so delete takes that first and leaves the tunnel
    // intact. A second click then removes the tunnel itself.
    if (existing.type === T.UNDERGNDPIPE && (existing._underWire || existing._underConveyor)) {
      const rider  = existing._underWire || existing._underConveyor;
      const isWire = existing._underWire === rider;
      const refund = rider._paid !== undefined ? rider._paid : (rider.def?.cost || EntityDefs[rider.type]?.cost || 0);
      Economy.spend(-refund);
      if (isWire) existing._underWire = null; else existing._underConveyor = null;
      _touchTopology(existing);
      EntityInfoPanel.close();
      HistoryManager.record(isWire
        ? { type: 'unstackWire', host: existing, wire: rider, cost: refund }
        : { type: 'unstackBelt', host: existing, belt: rider, cost: refund });
      return;
    }

    // Normal removal — no penalty
    if (existing.type === T.CONVEYOR && existing._underWire) {
      const refund = existing.def?.cost || 0;
      Economy.spend(-refund);
      EntityRegistry.remove(existing);
      GridManager.setEntity(existing.col, existing.row, GridManager.lowerLayer(existing));   // the wire, carrying any pipe that was under both
      EntityInfoPanel.close();
      HistoryManager.record({ type: 'remove', entity: existing, cost: refund });
      return;
    }
    if (existing.type === T.CONVEYOR && existing._underPipe) {
      const refund = existing.def?.cost || 0;
      Economy.spend(-refund);
      EntityRegistry.remove(existing);
      GridManager.setEntity(existing.col, existing.row, GridManager.lowerLayer(existing));
      EntityInfoPanel.close();
      HistoryManager.record({ type: 'remove', entity: existing, cost: refund });
      return;
    }
    if (existing.type === T.WIRE) {
      // Note what's powered before the removal (once per drag, not per tile)
      _armWireBurnoutCheck();
      // Remove wire first, then check after network updates
      const _wireCol = existing.col, _wireRow = existing.row;
      const cost = existing._paid !== undefined ? existing._paid : existing.def.cost;
      Economy.spend(-cost);
      if (existing._underPipe) {
        EntityRegistry.remove(existing);
        GridManager.setEntity(_wireCol, _wireRow, GridManager.lowerLayer(existing));
        EntityInfoPanel.close();
        HistoryManager.record({ type: 'remove', entity: existing, cost });
        return;
      }
      // Pipe removed that had a wire underneath — restore the wire
      if (existing.type === T.PIPE && existing._underWire) {
        Economy.spend(-cost);
        EntityRegistry.remove(existing);
        GridManager.setEntity(existing.col, existing.row, existing._underWire);
        EntityInfoPanel.close();
        HistoryManager.record({ type: 'remove', entity: existing, cost });
        return;
      }
      if (existing.type === T.PIPE && existing._underConveyor) {
        Economy.spend(-cost);
        EntityRegistry.remove(existing);
        GridManager.setEntity(existing.col, existing.row, existing._underConveyor);
        EntityInfoPanel.close();
        HistoryManager.record({ type: 'remove', entity: existing, cost });
        return;
      }
      if (existing._underWater) {
        EntityRegistry.remove(existing);
        GridManager.tiles[_wireRow][_wireCol] = existing._underWater;
        EntityInfoPanel.close();
        HistoryManager.record({ type: 'remove', entity: existing, cost });
        return;
      }
      GridManager.removeEntity(_wireCol, _wireRow);
      HistoryManager.record({ type: 'remove', entity: existing, cost });
      return;
    } else if (!suppressSound) {
      SFX.demolish();                                  // poles too (they used to come down in silence)
    }
    const cost = existing._paid !== undefined ? existing._paid : existing.def.cost;
    Economy.spend(-cost);

    if (existing.type === T.COALMINE || existing.type === T.COALMINE2) {
      // Find the deposit — try _linkedDeposit first, then fall back to saved coords,
      // then scan the entire grid for a deposit with matching anchor
      let deposit = existing._linkedDeposit;
      if (!deposit && existing._depositCol !== undefined) {
        // Scan grid and depositRegistry for matching deposit
        for (let sr = 0; sr < ROWS && !deposit; sr++)
          for (let sc = 0; sc < COLS && !deposit; sc++) {
            const d = GridManager.getEntity(sc, sr);
            if (d && d.type === T.COALDEPOSIT && d.col === existing._depositCol && d.row === existing._depositRow)
              deposit = d;
          }
        // If still not found, reconstruct a minimal deposit entity from saved data
        if (!deposit && existing._depositCoalAmount !== undefined) {
          deposit = new Entity(T.COALDEPOSIT, existing._depositCol, existing._depositRow);
          deposit.width       = existing._depositWidth  || 2;
          deposit.height      = existing._depositHeight || 2;
          deposit.coalAmount  = existing._depositCoalAmount;
          deposit.coalMax     = existing._depositCoalMax || existing._depositCoalAmount;
          deposit._revealed   = true;
          deposit._outputVariance = existing._outputVariance;
        }
      }
      GridManager.removeEntityFootprint(existing);
      // Put the deposit back — unless the mine worked it out. An exhausted
      // seam has nothing left to build on, so it goes with the mine instead
      // of sitting on the map looking like a live deposit.
      if (deposit && isDepositExhausted(deposit)) {
        deposit._hasMine = false;
        EntityRegistry.remove(deposit);
      } else if (deposit) {
        deposit._hasMine = false;
        deposit.width    = deposit.width  || 2;
        deposit.height   = deposit.height || 2;
        GridManager.setEntityFootprint(deposit);
      }
      // Any neighbouring deposit this mine was built over comes back too.
      _restoreCoveredDeposits(existing);
    } else if (existing.type === T.URANIUMMINE) {
      // Restore the uranium deposit underneath when the mine is removed
      let dep = existing._linkedDeposit;
      // If link lost, scan EntityRegistry for matching deposit by saved coords
      if (!dep && existing._depositCol !== undefined) {
        for (const d of EntityRegistry.getByType(T.URANIUMDEPOSIT)) {
          if (d.col === existing._depositCol && d.row === existing._depositRow) { dep = d; break; }
        }
      }
      // Last resort: reconstruct a minimal deposit from saved metadata
      if (!dep && existing._depositCol !== undefined) {
        dep = new Entity(T.URANIUMDEPOSIT, existing._depositCol, existing._depositRow);
        dep.width        = existing._depositWidth  || 2;
        dep.height       = existing._depositHeight || 2;
        dep._tierLabel   = existing._depositTier   || 'Uranium Deposit';
        dep._uraniumPhase = existing._depositPhase || 0;
        dep._oreAmount   = existing._depositOreAmount !== undefined
          ? existing._depositOreAmount : oreReserveFor(dep.width);
        dep._oreMax      = existing._depositOreMax !== undefined
          ? existing._depositOreMax : dep._oreAmount;
      }
      GridManager.removeEntityFootprint(existing);
      // A worked-out ore body goes with the mine rather than sitting on the
      // map looking live, exactly as a spent coal seam does above.
      if (dep && isDepositExhausted(dep)) {
        dep._hasMine = false;
        EntityRegistry.remove(dep);
      } else if (dep) {
        dep._hasMine = false;
        dep.width    = dep.width  || 2;
        dep.height   = dep.height || 2;
        GridManager.setEntityFootprint(dep);
      }
      _restoreCoveredDeposits(existing);
      EntityInfoPanel.close();
      HistoryManager.record({ type: 'remove', entity: existing, cost });
      return;
    } else if (isSulfurMine(existing)) {
      // Restore the sulfur deposit underneath when the mine is removed
      let dep = existing._linkedDeposit;
      if (!dep && existing._depositCol !== undefined) {
        for (const d of EntityRegistry.getByType(T.SULFURDEPOSIT)) {
          if (d.col === existing._depositCol && d.row === existing._depositRow) { dep = d; break; }
        }
      }
      if (!dep && existing._depositCol !== undefined) {
        dep = new Entity(T.SULFURDEPOSIT, existing._depositCol, existing._depositRow);
        dep.width        = existing._depositWidth  || 2;
        dep.height       = existing._depositHeight || 2;
        dep._tierLabel   = existing._depositTier   || 'Sulfur Deposit';
        dep._sulfurPhase = existing._depositPhase  || 0;
        dep._oreAmount   = existing._depositOreAmount !== undefined
          ? existing._depositOreAmount : oreReserveFor(dep.width);
        dep._oreMax      = existing._depositOreMax !== undefined
          ? existing._depositOreMax : dep._oreAmount;
      }
      GridManager.removeEntityFootprint(existing);
      // As with uranium: an exhausted seam leaves with the mine.
      if (dep && isDepositExhausted(dep)) {
        dep._hasMine = false;
        EntityRegistry.remove(dep);
      } else if (dep) {
        dep._hasMine = false;
        dep.width    = dep.width  || 2;
        dep.height   = dep.height || 2;
        GridManager.setEntityFootprint(dep);
      }
      _restoreCoveredDeposits(existing);
      EntityInfoPanel.close();
      HistoryManager.record({ type: 'remove', entity: existing, cost });
      return;
    } else if (existing.type === T.RAREEARTHMINE) {
      // Restore the rare earth deposit underneath, as the uranium mine does
      let dep = existing._linkedDeposit;
      if (!dep && existing._depositCol !== undefined) {
        for (const d of EntityRegistry.getByType(T.RAREEARTHDEPOSIT)) {
          if (d.col === existing._depositCol && d.row === existing._depositRow) { dep = d; break; }
        }
      }
      if (!dep && existing._depositCol !== undefined) {
        dep = new Entity(T.RAREEARTHDEPOSIT, existing._depositCol, existing._depositRow);
        dep.width           = existing._depositWidth  || 2;
        dep.height          = existing._depositHeight || 2;
        dep._tierLabel      = existing._depositTier   || 'Rare Earth Deposit';
        dep._rareEarthPhase = existing._depositPhase  || 0;
        dep._oreAmount      = existing._depositOreAmount !== undefined
          ? existing._depositOreAmount : oreReserveFor(dep.width);
        dep._oreMax         = existing._depositOreMax !== undefined
          ? existing._depositOreMax : dep._oreAmount;
      }
      GridManager.removeEntityFootprint(existing);
      if (dep && isDepositExhausted(dep)) {
        dep._hasMine = false;
        EntityRegistry.remove(dep);
      } else if (dep) {
        dep._hasMine = false;
        dep.width    = dep.width  || 2;
        dep.height   = dep.height || 2;
        GridManager.setEntityFootprint(dep);
      }
      _restoreCoveredDeposits(existing);
      EntityInfoPanel.close();
      HistoryManager.record({ type: 'remove', entity: existing, cost });
      return;
    } else if (existing.type === T.LITHIUMMINE) {
      // Restore the lithium deposit underneath when the mine is removed
      let dep = existing._linkedDeposit;
      if (!dep && existing._depositCol !== undefined) {
        for (const d of EntityRegistry.getByType(T.LITHIUMDEPOSIT)) {
          if (d.col === existing._depositCol && d.row === existing._depositRow) { dep = d; break; }
        }
      }
      if (!dep && existing._depositCol !== undefined) {
        dep = new Entity(T.LITHIUMDEPOSIT, existing._depositCol, existing._depositRow);
        dep.width         = existing._depositWidth  || 2;
        dep.height        = existing._depositHeight || 2;
        dep._tierLabel    = existing._depositTier   || 'Lithium Deposit';
        dep._lithiumPhase = existing._depositPhase  || 0;
        dep._oreAmount    = existing._depositOreAmount !== undefined
          ? existing._depositOreAmount : oreReserveFor(dep.width, LITHIUM_MINE_RATE);
        dep._oreMax       = existing._depositOreMax !== undefined
          ? existing._depositOreMax : dep._oreAmount;
      }
      GridManager.removeEntityFootprint(existing);
      // As with uranium and sulfur: a worked-out body leaves with the mine.
      if (dep && isDepositExhausted(dep)) {
        dep._hasMine = false;
        EntityRegistry.remove(dep);
      } else if (dep) {
        dep._hasMine = false;
        dep.width    = dep.width  || 2;
        dep.height   = dep.height || 2;
        GridManager.setEntityFootprint(dep);
      }
      _restoreCoveredDeposits(existing);
      EntityInfoPanel.close();
      HistoryManager.record({ type: 'remove', entity: existing, cost });
      return;
    } else if (isHeliumWell(existing)) {
      // Restore the helium gas field underneath when the well is removed
      let dep = existing._linkedDeposit;
      if (!dep && existing._depositCol !== undefined) {
        for (const d of EntityRegistry.getByType(T.HELIUMDEPOSIT)) {
          if (d.col === existing._depositCol && d.row === existing._depositRow) { dep = d; break; }
        }
      }
      if (!dep && existing._depositCol !== undefined) {
        dep = new Entity(T.HELIUMDEPOSIT, existing._depositCol, existing._depositRow);
        dep.width        = existing._depositWidth  || 2;
        dep.height       = existing._depositHeight || 2;
        dep._tierLabel   = existing._depositTier   || 'Helium Gas Field';
        dep._heliumPhase = existing._depositPhase  || 0;
        dep._oreAmount   = existing._depositOreAmount !== undefined
          ? existing._depositOreAmount : oreReserveFor(dep.width, HELIUM_WELL_RATE);
        dep._oreMax      = existing._depositOreMax !== undefined
          ? existing._depositOreMax : dep._oreAmount;
      }
      GridManager.removeEntityFootprint(existing);
      // As with the ore mines: a worked-out field leaves with the well.
      if (dep && isDepositExhausted(dep)) {
        dep._hasMine = false;
        EntityRegistry.remove(dep);
      } else if (dep) {
        dep._hasMine = false;
        dep.width    = dep.width  || 2;
        dep.height   = dep.height || 2;
        GridManager.setEntityFootprint(dep);
      }
      _restoreCoveredDeposits(existing);
      EntityInfoPanel.close();
      HistoryManager.record({ type: 'remove', entity: existing, cost });
      return;
    } else if (existing.type === T.GEOWELL) {
      // Restore the geothermal deposit underneath when the well is removed,
      // and cut the turbine loose so it reads as disconnected rather than
      // silently keeping the grid's 35 kW alive off a well that's gone.
      let dep = existing._linkedDeposit;
      if (!dep && existing._depositCol !== undefined) {
        for (const d of EntityRegistry.getByType(T.GEODEPOSIT)) {
          if (d.col === existing._depositCol && d.row === existing._depositRow) { dep = d; break; }
        }
      }
      if (!dep && existing._depositCol !== undefined) {
        dep = new Entity(T.GEODEPOSIT, existing._depositCol, existing._depositRow);
        dep.width     = existing._depositWidth  || 2;
        dep.height    = existing._depositHeight || 2;
        dep._geoPhase = existing._depositPhase  || 0;
      }
      if (existing._linkedTurbine) {
        existing._linkedTurbine._linkedWell = null;
        existing._linkedTurbine._generating = false;
        existing._linkedTurbine._currentOutput = 0;
        existing._linkedTurbine = null;
      }
      GridManager.removeEntityFootprint(existing);
      if (dep) {
        dep._hasWell = false;
        dep.width    = dep.width  || 2;
        dep.height   = dep.height || 2;
        GridManager.setEntityFootprint(dep);
      }
      EntityInfoPanel.close();
      HistoryManager.record({ type: 'remove', entity: existing, cost });
      return;
    } else if (existing.type === T.GEOTURBINE) {
      if (existing._linkedWell) {
        if (existing._linkedWell._linkedTurbine === existing) existing._linkedWell._linkedTurbine = null;
        existing._linkedWell = null;
      }
      GridManager.removeEntityFootprint(existing);
      EntityInfoPanel.close();
      HistoryManager.record({ type: 'remove', entity: existing, cost });
      return;
    } else if (existing.type === T.PUMPJACK || existing.type === T.PUMPJACK2) {
      // Restore the oil deposit underneath when pump jack is removed
      let dep = existing._linkedDeposit;
      if (!dep && existing._depositCol !== undefined) {
        for (let sr = 0; sr < ROWS && !dep; sr++)
          for (let sc = 0; sc < COLS && !dep; sc++) {
            const d = GridManager.getEntity(sc, sr);
            if (d && d.type === T.OILDEPOSIT && d.col === existing._depositCol && d.row === existing._depositRow)
              dep = d;
          }
      }
      if (!dep) {
        // Reconstruct minimal deposit at pumpjack position
        // The MK2 is centred over its deposit rather than anchored on it,
        // and is bigger than any deposit — put back a standard 2×2 seam.
        const mk2 = existing.type === T.PUMPJACK2;
        dep = new Entity(T.OILDEPOSIT, mk2 ? (existing._depositCol ?? existing.col + 1) : existing.col,
                                       mk2 ? (existing._depositRow ?? existing.row + 1) : existing.row);
        dep.width      = mk2 ? 2 : (existing.width  || 2);
        dep.height     = mk2 ? 2 : (existing.height || 2);
        dep._tierLabel = 'Oil Deposit';
        dep._pressure  = existing._pressure !== undefined ? existing._pressure : 1.0;
      }
      GridManager.removeEntityFootprint(existing);
      EntityRegistry.remove(existing);
      dep._pressure = existing._pressure !== undefined ? existing._pressure : (dep._pressure || 1.0);
      // A dry reservoir goes with the pump jack rather than being put back.
      if (isDepositExhausted(dep)) {
        EntityRegistry.remove(dep);
      } else {
        GridManager.setEntityFootprint(dep);
      }
      EntityInfoPanel.close();
      HistoryManager.record({ type: 'remove', entity: existing, cost });
      return;
    } else if (existing.type === T.WATEREXTRACTOR) {
      // Clear footprint then restore the water tiles that were underneath
      const mw = existing.width || 4, mh = existing.height || 4;
      for (let r = existing.row; r < existing.row + mh; r++)
        for (let c = existing.col; c < existing.col + mw; c++)
          if (GridManager.inBounds(c, r) && GridManager.tiles[r][c] === existing)
            GridManager.tiles[r][c] = null;
      // Restore saved water tiles
      if (existing._savedWaterTiles) {
        for (const { c, r, tile } of existing._savedWaterTiles)
          if (GridManager.inBounds(c, r) && !GridManager.tiles[r][c])
            GridManager.tiles[r][c] = tile;
      }
      EntityRegistry.remove(existing);
      // Already refunded with everything else above (`cost`) — refunding
      // again here paid out double the build price.
      HistoryManager.record({ type: 'remove', entity: existing, cost });
      return;
    } else if (existing.type === T.TRUCK) {
      // Deleting a truck always deletes the truck — clearing just its path
      // is a separate, explicit action (the 🗑 Clear button in the Patrol
      // panel), not something the Delete tool does as an implicit first
      // step. Previously a truck with a path needed two Delete clicks
      // (first silently cleared the path, second actually removed the
      // truck), which conflated two unrelated actions into one tool.
      TruckSystem.stopPatrol(existing);
      TruckSystem.stopDriving();
      TruckPatrolPanel.close();
      GridManager.removeEntityFootprint(existing);
      EntityRegistry.remove(existing);
      // Refunded with everything else above — not a second time here.
      HistoryManager.record({ type: 'remove', entity: existing, cost });
      return;
    } else if (existing.type === T.ROAD) {
      // Only clear cells this specific road actually owns in the grid —
      // an overlapping road underneath/on top may still own some of the
      // cells in this footprint and must be left untouched.
      // The refund (what was paid, slope included) already went out with
      // everything else above; refunding here too paid roads back double.
      for (let r = existing.row; r < existing.row + existing.height; r++)
        for (let c = existing.col; c < existing.col + existing.width; c++)
          if (GridManager.inBounds(c, r) && GridManager.tiles[r][c] === existing) GridManager.tiles[r][c] = null;
      EntityRegistry.remove(existing);
      // A bridge hands its tiles back to the water it was laid over.
      if (existing._bridge) GridManager._restoreWaterUnder(existing);
      PowerNetwork.recomputeWireHops?.();
      HistoryManager.record({ type: 'remove', entity: existing, cost });
      return;
    } else if (existing.width > 1 || existing.height > 1) {
      GridManager.removeEntityFootprint(existing);
    } else {
      // removeEntity hands the tile back to whatever this was laid over: a
      // wire or belt under a pipe, or the lake under a pipe across water.
      // (Deleting a pipe that sat on a wire used to delete the wire too:
      // the branch meant to restore it was nested where a pipe never got.)
      GridManager.removeEntity(col, row);
    }
    // Generic removal history for multi-tile/single-tile fallback paths (road branch returns early)
    const _cost = existing._paid !== undefined ? existing._paid : existing.def.cost;   // what was refunded above
    HistoryManager.record({ type: 'remove', entity: existing, cost: _cost });
  }

  // Track mouse button state for drag-placing and pan-dragging
  let mouseDown   = false;
  let mouseButton = 0;
  let isPanning    = false;
  let lastMouseSX  = 0;
  let lastMouseSY  = 0;
  let _lastZoneClick = 0, _lastZoneKey = null, _lastZoneIndex = -1;
  let _zoneDeleteActive = false;
  // These tools snap to one specific target (a deposit, an aquifer, a
  // capped-at-1 station) rather than painting a chain like wire/lamp/etc —
  // re-firing tryPlace on every mousemove pixel of jitter during a click
  // would hit the same target a second time and throw a spurious
  // "already has one"/"only 1 allowed" error right after a successful place.
  // Dams and Hydro Turbines snap to a river span / reservoir the same way:
  // the repeat landed on the one just built ("A dam already exists here.",
  // "Turbine footprint is blocked by a building.").
  const NO_DRAG_REPLACE_TOOLS = new Set([T.POLE, T.COALMINE, T.COALMINE2, T.DAM, T.HYDROTURBINE,
    T.PUMPJACK, T.PUMPJACK2, T.GEOWELL, T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2,
    T.LITHIUMMINE, T.RAREEARTHMINE, T.HELIUMWELL, T.HELIUMWELL2, T.RESEARCH, T.RESEARCH2, T.RESEARCH3, T.MK4RESEARCH, T.MK5RESEARCH, T.REPROCESSOR, T.SPENTFUELPOOL, T.MOXPLANT, T.ADVREACTOR,
    T.SURVEY, T.SURVEY2, T.MONITOR, T.MONITOR2, T.BEACON]);
  let _zoneDeleteDragging = false;
  let _zoneDeleteStart = null;
  function _zoneDeleteCancel() {
    _zoneDeleteDragging = false;
    _zoneDeleteStart    = null;
    document.getElementById('zone-delete-overlay')?.classList.remove('active');
  }
  // A rubber band runs from the world spot the drag began on to the cursor.
  // The start is kept in world pixels and re-projected each frame, so panning
  // mid-drag leaves it on the tiles being swept instead of riding along
  // with the camera (the sweep itself always used the start tile).
  function _drawRubberBand(overlayId, start) {
    const overlay = document.getElementById(overlayId);
    if (!overlay) return;
    overlay.classList.add('active');
    const ax = (start.wx - Camera.x) * Camera.zoom;
    const ay = (start.wy - Camera.y) * Camera.zoom;
    const x1 = Math.min(lastMouseSX, ax), y1 = Math.min(lastMouseSY, ay);
    const x2 = Math.max(lastMouseSX, ax), y2 = Math.max(lastMouseSY, ay);
    overlay.style.left   = x1 + 'px';
    overlay.style.top    = y1 + 'px';
    overlay.style.width  = (x2 - x1) + 'px';
    overlay.style.height = (y2 - y1) + 'px';
  }
  // Every rubber band in progress: Zone Delete, the Select tool, blueprint select.
  function _drawDragBoxes() {
    if (_zoneDeleteDragging && _zoneDeleteStart) _drawRubberBand('zone-delete-overlay', _zoneDeleteStart);
    if (_selBoxing && _selBoxStart) _drawRubberBand('select-overlay', _selBoxStart);
    if (_bpSelectDragging && _bpSelectStart) _drawRubberBand('blueprint-select-overlay', _bpSelectStart);
  }
  // Zone Delete's sweep of one tile, shared with deleting a selection (the
  // Select tool, below). A tile can hold a stack (a belt over a pipe over a
  // wire): removing the top puts the next layer back on the tile, so keep
  // clearing it until it is empty, protected, or stops changing. Taking only
  // the top one used to leave pipes and wires behind. `deleted` collects
  // what was taken (or held back) across the sweep. Returns 1 when a
  // building was held back for still holding waste, else 0.
  const _ZD_CUSTOMER_TYPES = new Set([T.HOUSE, T.CABIN, T.COMMERCIAL, T.INDUSTRIAL, T.GOVBUILDING, T.CELLTOWER, T.FIBERHUB, T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB, T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ]);
  function _zoneClearTile(c, r, deleted) {
    for (let layer = 0; layer < 8; layer++) {
      const top = GridManager.getEntity(c, r);
      if (!top) break;
      // tryRemove takes a road crossing a wire or pipe before the
      // wire or pipe itself, so that road is the next thing to go.
      const road = (top.type === T.WIRE || top.type === T.PIPE || top.type === T.UNDERGNDPIPE || top.type === T.ROAD) ? topRoadAt(c, r) : null;
      const e = road || top;
      if (deleted.has(e)) break;
      if (e.type === T.WATER) break;             // the lake a pipe was laid over
      if (_ZD_CUSTOMER_TYPES.has(e.type)) break;  // skip properties
      if (_wasteFacilityFixed(e.type)) break; // fee'd removal — single click only
      if (e._irreparable) break;                  // nuclear ruin — fee'd, single click only
      if (DEPOSIT_TYPES.has(e.type)) break;   // skip resource deposits
      if (e._clientOwned) break;              // skip the client's own plant
      if (_keepCharged && _holdsCharge(e)) break;   // the player chose to keep charged storage
      if (wasteBlocksRemoval(e) !== null) { deleted.add(e); return 1; }  // must be emptied first
      deleted.add(e);
      // This tile, not the entity's anchor: the anchor of a road or a
      // building can be covered by something else, and tryRemove
      // works on whatever is on the tile it is given.
      tryRemove(c, r, true);
      if (GridManager.getEntity(c, r) === top && (!road || topRoadAt(c, r) === road)) break;   // refused (locked, ...)
    }
    return 0;
  }

  // ── Select tool ──────────────────────────────────────────────────
  // Rubber-band select what the player has built, then move it all at once
  // or delete it. Armed from the Function tab (a plain LMB drag then
  // selects), or at any time with no build tool in hand by holding Shift
  // and dragging. Shift+click adds or drops one item, or a whole line (wire,
  // pipe, belt); Shift+double click takes everything that belongs with it
  // (_selSameAround); Shift+right click deletes a line. With a selection up,
  // dragging any selected item carries the whole group; Delete removes it
  // (Zone Delete's rules, one undo step); Esc or RMB lets it go.
  // A selection is the things on top of each tile: a stack (a belt over a
  // pipe over a wire) moves as one. Buildings fixed to the land (mines on
  // their deposits, anything on or over water, roads, the client's plant, a
  // running reactor, a requested amenity...) can be selected but stay put
  // when the group moves; they are outlined amber. A move keeps everything
  // as it was (stock, settings, links): it lifts the group off the map and
  // sets it down again, free, and undoes as one step.
  let _selArmed  = false;
  let _selBoxing = false, _selBoxStart = null, _selBoxAdd = false;
  const SEL_DOUBLE_MS = 350, SEL_TRIPLE_MS = 700;
  let _selLastClick = null;   // { t, at, clicks, before }: the last Shift+click, for counting a double
  const _sel = new Set();
  let _selMove = null;   // { grabC, grabR, dc, dr, ok, why, movers }
  state.selection = _sel;
  state.selectionMove = null;
  const _SEL_SKIP = new Set([T.TREE, T.BUSH, T.WATER, T.TRUCK, ..._ZD_CUSTOMER_TYPES, ...DEPOSIT_TYPES]);
  // Water Extractors move with a group (onto open lake only, see
  // _selBlocker / _shiftGroup); the rest of these stay put.
  const _SEL_WATER_BOUND = new Set([T.HYDROTURBINE, T.HYDROGENERATOR, T.ROAD, T.BRIDGE]);
  const _selectable = (e) => !!e && !_SEL_SKIP.has(e.type);
  const _onGrid = (e) => GridManager.getEntity(e.col, e.row) === e;
  // A job site's existing plant is the client's and stays where it stands,
  // except their Storage Containers: a bin only banks what its belts bring,
  // so the player may shift it to suit the line they are building.
  function _clientFixed(e) {
    return !!e && !!e._clientOwned && e.type !== T.SOLIDSTORAGE;
  }
  // Why `e` stays put when its selection moves, or null if it goes along.
  function _selPinned(e) {
    if (NOT_RELOCATABLE.has(e.type) || _wasteFacilityFixed(e.type)) return 'fixed in place';
    if (_SEL_WATER_BOUND.has(e.type) || e._bridge || e._filled || e._waterTiles
        || (e._savedWaterTiles && e.type !== T.WATEREXTRACTOR)) return 'tied to the water or roads';
    for (const k of GridManager._STACK_SLOTS) if (e[k] && (e[k]._underWater || e[k]._clientOwned)) return 'over water';
    if (e._underWater) return 'over water';
    if (_clientFixed(e)) return 'client property';
    if (reactorOverheating(e) !== null || reactorWorking(e) !== null) return 'a running reactor';
    if (requestedAmenityLocked(e)) return 'requested by customers';
    return null;
  }
  function _selPrune() { for (const e of _sel) if (!_onGrid(e)) _sel.delete(e); }
  function _selMovers() { _selPrune(); return [..._sel].filter(e => !_selPinned(e)); }
  function selClear() {
    _sel.clear(); _selMove = null; state.selectionMove = null;
    _selBoxing = false; _selBoxStart = null;
    document.getElementById('select-overlay')?.classList.remove('active');
  }
  function selDisarm() { _selArmed = false; selClear(); if (typeof syncCategoryState === 'function') syncCategoryState(); canvas.style.cursor = _modeCursor(); }
  function selArm() {
    selectTool(null);
    _zoneDeleteActive = false;
    if (_bpSelectActive || _bpStampActive) { _bpSelectActive = false; _bpStampActive = false; BlueprintSystem.cancelStamp(); }
    _selArmed = true;
    canvas.style.cursor = _modeCursor();
    if (typeof syncCategoryState === 'function') syncCategoryState();
    showToast('⬚ Drag to select · drag a selected item to move the group · Delete removes it · Esc lets go (Shift + drag works with no tool too)',
      '#60d0ff', '#001824', '#1e4a60');
  }
  // Add what is on top of each tile in the rectangle (and is the player's
  // to select). Returns how many were added.
  function _selAddRect(minC, minR, maxC, maxR) {
    let n = 0;
    for (let r = minR; r <= maxR; r++)
      for (let c = minC; c <= maxC; c++) {
        const e = GridManager.getEntity(c, r);
        if (_selectable(e) && !_sel.has(e)) { _sel.add(e); n++; }
      }
    return n;
  }
  function _selSummary() {
    _selPrune();
    if (!_sel.size) return;
    const pinned = [..._sel].filter(e => _selPinned(e)).length;
    showToast(`⬚ ${_sel.size} selected${pinned ? ` (${pinned} fixed in place)` : ''}: drag to move · Delete to remove`,
      '#60d0ff', '#001824', '#1e4a60', 'select-summary');
  }
  // Would `movers` fit shifted by (dc, dr)? Their own tiles and vegetation
  // never block (trees are cleared on the drop). Returns null or what is in
  // the way.
  function _selBlocker(movers, dc, dr) {
    const mine = new Set(movers);
    for (const m of movers) {
      const w = m.width || 1, h = m.height || 1, c0 = m.col + dc, r0 = m.row + dr;
      if (!GridManager.ignoreReserved && typeof GovernmentSystem !== 'undefined' && GovernmentSystem.isMeridianReserved?.(c0, r0, w, h))
        return { reason: 'land reserved for Hyperion Station' };
      const ext = m.type === T.WATEREXTRACTOR;
      for (let r = r0; r < r0 + h; r++)
        for (let c = c0; c < c0 + w; c++) {
          if (!GridManager.inBounds(c, r)) return { reason: 'the edge of the map' };
          const t = GridManager.tiles[r][c];
          // A tile an extractor in the group is leaving is lake again once
          // it lifts (its _savedWaterTiles go back down).
          const vacatedLake = !!t && mine.has(t) && t.type === T.WATEREXTRACTOR;
          if (ext) {
            // An extractor lands only on open lake, as a single drag does
            // (GridManager.canDropExtractor).
            if ((t && t.type === T.WATER) || vacatedLake) continue;
            return { reason: t ? (t.def?.label || EntityDefs[t.type]?.label || t.type) : 'dry land (extractors need open lake)', c, r };
          }
          if (vacatedLake) return { reason: 'water', c, r };
          if (!t || mine.has(t) || GridManager.isVegetation(t)) continue;
          return { reason: t.def?.label || EntityDefs[t.type]?.label || t.type, c, r };
        }
    }
    return null;
  }
  // Lift `ents` off the map and set them down again (dc, dr) away. The
  // caller has checked the way is clear. Each one keeps everything it
  // carries, stacked layers included.
  function _shiftGroup(ents, dc, dr) {
    for (const m of ents) {
      const w = m.width || 1, h = m.height || 1;
      for (let r = m.row; r < m.row + h; r++)
        for (let c = m.col; c < m.col + w; c++)
          if (GridManager.inBounds(c, r) && GridManager.tiles[r][c] === m) GridManager.tiles[r][c] = null;
      // An extractor gives back the lake it stood on (as a single drag does).
      if (m.type === T.WATEREXTRACTOR && m._savedWaterTiles)
        for (const { c, r, tile } of m._savedWaterTiles)
          if (GridManager.inBounds(c, r) && !GridManager.tiles[r][c]) GridManager.tiles[r][c] = tile;
      EntityRegistry.remove(m);
      if (typeof ZoneSystem !== 'undefined') ZoneSystem.noteFootprintChanged?.(m);
    }
    for (const m of ents) {
      m.col += dc; m.row += dr;
      for (const k of GridManager._STACK_SLOTS) if (GridManager._isLayer(m[k])) { m[k].col = m.col; m[k].row = m.row; }
      if (m.type === T.WATEREXTRACTOR) {
        // ...and keeps the lake under its new spot, to give back next time.
        m._savedWaterTiles = [];
        for (let r = m.row; r < m.row + (m.height || 4); r++)
          for (let c = m.col; c < m.col + (m.width || 4); c++)
            if (GridManager.inBounds(c, r)) m._savedWaterTiles.push({ c, r, tile: GridManager.tiles[r][c] });
      }
      if ((m.width || 1) > 1 || (m.height || 1) > 1) GridManager.setEntityFootprint(m);
      else GridManager.setEntity(m.col, m.row, m);
    }
    if (typeof BELT_LINK_EPOCH !== 'undefined') BELT_LINK_EPOCH++;
    if (typeof PipeRuns !== 'undefined') PipeRuns.linksChanged?.();
    PowerNetwork.recomputeWireHops();
  }
  // Undo / redo of a group move (history_manager.js). False if it no longer fits.
  function applyGroupMove(ents, dc, dr) {
    const here = ents.filter(_onGrid);
    if (!here.length) return true;
    const b = _selBlocker(here, dc, dr);
    if (b) { flashMessage(`Can't move the group back: blocked by ${b.reason}${b.c !== undefined ? ` at ${b.c}, ${b.r}` : ''}`); return false; }
    _shiftGroup(here, dc, dr);
    return true;
  }
  function _selCommitMove() {
    const mv = _selMove;
    if (!mv || !(mv.dc || mv.dr) || !mv.movers.length) return;
    const b = _selBlocker(mv.movers, mv.dc, mv.dr);
    if (b) { flashMessage(`Can't move here: blocked by ${b.reason}${b.c !== undefined ? ` at ${b.c}, ${b.r}` : ''}`); return; }
    _shiftGroup(mv.movers, mv.dc, mv.dr);
    HistoryManager.record({ type: 'groupMove', entities: mv.movers.slice(), dc: mv.dc, dr: mv.dr });
    SFX.thump?.();
    const stayed = _sel.size - mv.movers.length;
    if (stayed > 0) showToast(`↷ Moved ${mv.movers.length}; ${stayed} fixed in place stayed behind`, '#f0c040', '#0e0a00', '#604010');
  }
  // Drawn by the render loop in world space: an outline on each selected
  // item (amber for one that stays put when the group moves) and, while the
  // group is being carried, each mover's sprite faded at its drop spot,
  // washed red when the drop is blocked. Sprites only for a modest group;
  // a big one shows outlines alone so the frame stays quick.
  const SEL_GHOST_MAX = 400;
  function renderSelection(t) {
    if (!_sel.size) return;
    _selPrune();
    const z = Camera.zoom || 1;
    const mv = state.selectionMove;
    const moving = mv && (mv.dc || mv.dr) ? new Set(mv.movers) : null;
    ctx.save();
    for (const e of _sel) {
      const x = e.col * TILE, y = e.row * TILE, w = (e.width || 1) * TILE, h = (e.height || 1) * TILE;
      const pinned = !!_selPinned(e);
      if (moving && moving.has(e)) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#000810'; ctx.fillRect(x, y, w, h); }
      ctx.globalAlpha = 0.16 + 0.06 * Math.sin(t * 4);
      ctx.fillStyle = pinned ? '#ffb040' : '#60d8ff';
      ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = pinned ? 'rgba(255,176,64,0.95)' : 'rgba(110,225,255,0.95)';
      ctx.lineWidth = 1.5 / z;
      ctx.strokeRect(x + 1 / z, y + 1 / z, w - 2 / z, h - 2 / z);
    }
    ctx.restore();
    if (!moving) return;
    const { dc, dr, ok } = mv;
    if (mv.movers.length <= SEL_GHOST_MAX) {
      // Tile lookups answer from the group at its new spot while it draws,
      // so its belts, pipes and wires join each other the way they will.
      const tiles = new Map();
      for (const m of mv.movers)
        for (let r = 0; r < (m.height || 1); r++)
          for (let c = 0; c < (m.width || 1); c++) tiles.set((m.col + dc + c) + ',' + (m.row + dr + r), m);
      const _realGet = GridManager.getEntity;
      GridManager.getEntity = function (c, r) { return tiles.get(c + ',' + r) || null; };
      const order = mv.movers.slice().sort((a, b) => ((a.type === T.WIRE ? 0 : 1) - (b.type === T.WIRE ? 0 : 1)) || (a.row - b.row) || (a.col - b.col));
      try {
        for (const m of order) {
          const c0 = m.col, r0 = m.row;
          m.col = c0 + dc; m.row = r0 + dr;
          ctx.save();
          ctx.globalAlpha = ok ? 0.7 : 0.35;
          try {
            if (m.type === T.WIRE) renderWire(m, m.col * TILE, m.row * TILE, t);
            else renderEntityAt(m, m.col * TILE, m.row * TILE, t);
          } catch (_err) {
            ctx.fillStyle = '#40c0ff';
            ctx.fillRect(m.col * TILE, m.row * TILE, (m.width || 1) * TILE, (m.height || 1) * TILE);
          } finally {
            m.col = c0; m.row = r0;
          }
          ctx.restore();
        }
      } finally {
        GridManager.getEntity = _realGet;
      }
    }
    ctx.save();
    for (const m of mv.movers) {
      const x = (m.col + dc) * TILE, y = (m.row + dr) * TILE, w = (m.width || 1) * TILE, h = (m.height || 1) * TILE;
      if (!ok) { ctx.globalAlpha = 0.25; ctx.fillStyle = '#ff2200'; ctx.fillRect(x, y, w, h); }
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = ok ? 'rgba(110,225,255,0.8)' : 'rgba(255,60,60,0.9)';
      ctx.lineWidth = 1.5 / z;
      ctx.strokeRect(x, y, w, h);
    }
    // Where it is blocked, if it is.
    if (!ok && mv.why && mv.why.c !== undefined) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ff3030';
      ctx.lineWidth = 2.5 / z;
      ctx.strokeRect(mv.why.c * TILE, mv.why.r * TILE, TILE, TILE);
    }
    ctx.restore();
  }

  // A whole line, from any piece of it: Shift + click selects it, Shift +
  // right click deletes it (one undo step). A line is everything joined to
  // that piece by the game's own rules: wires and their poles, pipes or belts,
  // tunnels included. It ends at buildings, and doesn't follow onto another
  // kind of line it crosses. Returns [{ c, r, piece }], or null off a line.
  const _lineKind = (e) => !e ? null : (e.type === T.WIRE || e.type === T.POLE) ? 'wire'
    : (e.type === T.PIPE || e.type === T.UNDERGNDPIPE) ? 'pipe' : e.type === T.CONVEYOR ? 'belt' : null;
  function _linePieceAt(c, r, kind) {
    const top = GridManager.getEntity(c, r);
    if (_lineKind(top) === kind) return top;
    if (!top) return null;
    for (const k of GridManager._STACK_SLOTS) if (_lineKind(top[k]) === kind) return top[k];
    return null;
  }
  function _lineSteps(c, r, kind, piece) {
    if (kind === 'belt') return beltSteps(c, r).map(([dc, dr]) => [c + dc, r + dr]);
    const out = [];
    for (const [dc, dr] of _D4) {
      if (kind === 'wire') { out.push([c + dc, r + dr]); continue; }
      if (piece.type === T.UNDERGNDPIPE) {
        if ((dc !== 0) !== (piece._udgAxis === 'h')) continue;
        const far = udgPartner(c, r, dc, dr, piece._udgAxis);
        if (far) { out.push(far); continue; }
      }
      if (pipeStepAllowed(c + dc, r + dr, dc, dr, null)) out.push([c + dc, r + dr]);
    }
    return out;
  }
  function _lineAt(col, row) {
    const kind = _lineKind(GridManager.getEntity(col, row));
    if (!kind) return null;
    const seen = new Set([row * COLS + col]);
    const line = [], todo = [[col, row]];
    while (todo.length) {
      const [c, r] = todo.pop();
      const piece = _linePieceAt(c, r, kind);
      line.push({ c, r, piece });
      for (const [nc, nr] of _lineSteps(c, r, kind, piece)) {
        const idx = nr * COLS + nc;
        if (seen.has(idx) || !GridManager.inBounds(nc, nr) || !_linePieceAt(nc, nr, kind)) continue;
        seen.add(idx);
        todo.push([nc, nr]);
      }
    }
    return line;
  }
  // Selection is what's on top of each tile, so a stretch buried under
  // another line stays out of it. Clicking a line that is all selected drops it.
  function _selToggleLine(line) {
    const tops = line.map(t => t.piece).filter(p => GridManager.getEntity(p.col, p.row) === p);
    if (tops.every(p => _sel.has(p))) for (const p of tops) _sel.delete(p);
    else for (const p of tops) _sel.add(p);
  }
  // Shift + double click: everything that belongs with the thing clicked.
  // A third click adds what it's hooked up with. A power run (wire,
  // pole, tower) is the stretch it stands on: its poles and towers out each
  // way to the next building or fork, not the whole network. Pipes and belts
  // are their line. A building is the block of its
  // own type around it: others of that type within GROUP_GAP tiles or one
  // building's length of each other, chaining outward, so a turbine hall
  // comes whole and the hall across the map doesn't.
  const GROUP_GAP = 6, GROUP_GAP_MAX = 16;
  const _isPowerRun = (e) => _lineKind(e) === 'wire' || (!!e && e.type === T.POWERTOWER);
  const _RUN_PASSES = new Set([T.TREE, T.BUSH, T.WATER, T.ROAD, T.BRIDGE, ...DEPOSIT_TYPES]);
  const _runEnds = (e) => !!e && !_isPowerRun(e) && !_lineKind(e) && !_RUN_PASSES.has(e.type) && PowerNetwork.isRangeAnchor(e);
  function _powerRun(start) {
    const seen = new Set([start]), todo = [start];
    while (todo.length) {
      const e = todo.pop();
      const near = GridManager.getNeighbours(e.col, e.row);
      const links = [];
      for (const n of near) {
        const p = _isPowerRun(n.entity) ? n.entity : _linePieceAt(n.col, n.row, 'wire');
        // Only a wire conducts: two towers side by side aren't joined.
        if (p && p !== e && !links.includes(p) && (e.type === T.WIRE || p.type === T.WIRE)) links.push(p);
      }
      if (e !== start && (links.length > 2 || near.some(n => _runEnds(n.entity)))) continue;
      for (const p of links) if (!seen.has(p)) { seen.add(p); todo.push(p); }
    }
    return seen;
  }
  function _groupAround(t) {
    const gapOf = (a, b) => Math.max(b.col - (a.col + (a.width || 1)), a.col - (b.col + (b.width || 1)),
                                     b.row - (a.row + (a.height || 1)), a.row - (b.row + (b.height || 1)));
    const reach = Math.max(GROUP_GAP, Math.min(GROUP_GAP_MAX, Math.max(t.width || 1, t.height || 1)));
    const left = new Set(EntityRegistry.getByType(t.type));
    const group = new Set([t]), todo = [t];
    left.delete(t);
    while (todo.length) {
      const a = todo.pop();
      for (const b of left) if (gapOf(a, b) <= reach) { left.delete(b); group.add(b); todo.push(b); }
    }
    return group;
  }
  function _selSameAround(t, clicks) {
    const kind = _lineKind(t);
    // From a pole or tower the double click takes just those, and a third
    // click brings the wires between them in too.
    const wires = t.type === T.WIRE || clicks > 2;
    const found = _isPowerRun(t) ? [..._powerRun(t)].filter(e => wires || e.type !== T.WIRE)
      : kind ? _lineAt(t.col, t.row).map(p => p.piece)
      : _selectable(t) ? [..._groupAround(t)] : [];
    for (const e of found) if (_selectable(e) && _onGrid(e)) _sel.add(e);
    if (clicks > 2 && found.length && !_isPowerRun(t)) _selHookupsOf(found, kind ? ['wire'] : ['wire', 'pipe', 'belt']);
  }
  // The third click on anything else: the lines it is hooked up with, so the
  // group can be moved as a whole. Only those joined to it, and only inside
  // its bounds (GROUP_LINE_MARGIN round them): a bus between the buildings
  // comes along, a feed line leaving the block is cut at the edge.
  const GROUP_LINE_MARGIN = 2;
  function _selHookupsOf(group, kinds) {
    const minC = Math.min(...group.map(e => e.col)) - GROUP_LINE_MARGIN;
    const minR = Math.min(...group.map(e => e.row)) - GROUP_LINE_MARGIN;
    const maxC = Math.max(...group.map(e => e.col + (e.width || 1) - 1)) + GROUP_LINE_MARGIN;
    const maxR = Math.max(...group.map(e => e.row + (e.height || 1) - 1)) + GROUP_LINE_MARGIN;
    for (const kind of kinds) {
      const seen = new Set(), todo = [];
      const visit = (c, r) => {
        const idx = r * COLS + c;
        if (c < minC || c > maxC || r < minR || r > maxR || seen.has(idx)) return;
        if (!GridManager.inBounds(c, r) || !_linePieceAt(c, r, kind)) return;
        seen.add(idx);
        todo.push([c, r]);
      };
      for (const e of group) for (const n of GridManager.getNeighbours(e.col, e.row)) visit(n.col, n.row);
      while (todo.length) {
        const [c, r] = todo.pop();
        const piece = _linePieceAt(c, r, kind);
        if (_selectable(piece) && _onGrid(piece)) _sel.add(piece);
        for (const [nc, nr] of _lineSteps(c, r, kind, piece)) visit(nc, nr);
      }
    }
  }
  // Only the line itself goes. tryRemove takes what's on top of a tile, so a
  // stretch under a road or another line is left, or that would go instead.
  function _deleteLine(line) {
    let removed = 0, kept = 0;
    HistoryManager.beginBatch();
    try {
      for (const { c, r, piece } of line) {
        if (GridManager.getEntity(c, r) !== piece || topRoadAt(c, r)) { kept++; continue; }
        tryRemove(c, r, true);
        if (GridManager.getEntity(c, r) === piece) kept++; else removed++;
      }
    } finally {
      HistoryManager.endBatch();
    }
    if (removed) {
      SFX.demolish();
      showToast(`🗑 Line deleted: ${removed} piece${removed === 1 ? '' : 's'} (Ctrl+Z to undo)`, '#ff7a7a', '#180800', '#602010');
    }
    if (kept) showToast(`⚠ ${kept} kept: under a road or another line, or can't be removed`, '#ff8040', '#180c00', '#603010');
  }
  function selDelete() {
    _selPrune();
    if (!_sel.size) return false;
    askBulkStorage([..._sel], _selDeleteNow);
    return true;
  }
  function _selDeleteNow() {
    _selPrune();
    if (!_sel.size) return;
    const deleted = new Set();
    let held = 0;
    HistoryManager.beginBatch();
    try {
      for (const e of [..._sel]) {
        if (!_onGrid(e)) continue;   // went with something removed before it
        for (let r = e.row; r < e.row + (e.height || 1); r++)
          for (let c = e.col; c < e.col + (e.width || 1); c++)
            if (GridManager.getEntity(c, r) === e) held += _zoneClearTile(c, r, deleted);
      }
    } finally {
      HistoryManager.endBatch();
    }
    _selPrune();
    const kept = _sel.size;
    if (deleted.size > held) SFX.demolish();
    if (held > 0) showToast(`⚠ ${held} kept: still holding waste or liquid, empty ${held === 1 ? 'it' : 'them'} first`, '#ff6040', '#140800', '#602010');
    else if (kept > 0) showToast(`⚠ ${kept} kept: can't be removed this way`, '#ff8040', '#180c00', '#603010');
    _sel.clear();
    return true;
  }
  // Blueprint area-select drag (rubber-band, mirrors zone delete) and
  // stamp-placement mode (ghost follows cursor, click to place a copy).
  let _bpSelectActive   = false;
  let _bpSelectDragging = false;
  let _bpSelectStart    = null;
  let _bpStampActive    = false;
  let _bpSelectCopy     = false;   // the select drag is Ctrl+C copy, not a blueprint capture

  // Canvas cursor for the current mode. Copying and pasting get their own
  // (reticle + copy badge, custom_cursor.js) so the mode reads at a glance;
  // other tools and a plain blueprint capture keep the placement reticle.
  function _modeCursor() {
    if ((_bpSelectActive && _bpSelectCopy) || _bpStampActive) return 'copy';
    return (state.selectedTool || _bpSelectActive || _selArmed) ? 'crosshair' : 'default';
  }
  let _chopTarget = null;   // { col, row }
  const CHOP_DURATION = 1.5;  // simulated seconds (scales with fast-forward, frozen while paused)

  // Path tool drawing state — click-to-place waypoints, double-click/RMB to confirm
  let _pathActive     = false;   // true once first point placed
  let _pathTruck      = null;    // truck entity being assigned a path
  let _pathWaypoints  = [];      // [{wx,wy}] confirmed waypoints
  let _pathLastClickT = 0;       // timestamp of last click (for double-click detection)
  // Set when the first click of a new path snapped onto an existing path's
  // start/end waypoint — the drawn points get merged onto that path instead
  // of becoming a new one. { kind: 'truck'|'saved', ref, end: 'start'|'end' }
  let _extendTarget   = null;

  // Path tool hold-to-pan — holding LMB (rather than a quick click) pans the
  // camera instead of dropping a waypoint, so long paths don't require
  // scrolling separately between clicks. The click/drag decision is made on
  // release: mousedown just records where the press started, and mousemove
  // promotes it to a drag once the cursor has moved far enough.
  let _pathDownSX      = 0;
  let _pathDownSY      = 0;
  let _pathDragging    = false;
  const PATH_PAN_THRESHOLD = 6;  // px of movement before a held click becomes a pan

  // How close the cursor needs to get to the very first waypoint before a
  // path is considered "closed into a loop" — see _snapPathClose below.
  const PATH_CLOSE_SNAP_RANGE = TILE * 0.6;

  // Once at least 3 points are down (so the 2nd click can't immediately
  // close the loop against the 1st), snaps a candidate point onto the
  // path's own start point whenever it's close enough. Returns the point
  // unchanged — plus closing:false — otherwise.
  function _snapPathClose(wx, wy) {
    if (!_pathActive || _pathWaypoints.length < 3) return { x: wx, y: wy, closing: false };
    const start = _pathWaypoints[0];
    if (Math.hypot(wx - start.wx, wy - start.wy) <= PATH_CLOSE_SNAP_RANGE) {
      return { x: start.wx, y: start.wy, closing: true };
    }
    return { x: wx, y: wy, closing: false };
  }

  // Finishes drawing. Three outcomes:
  //  - Started by snapping onto an existing path's start/end waypoint →
  //    merge the newly drawn points onto that path (truck or saved).
  //  - Started near a truck → hand the path to it directly (existing).
  //  - Otherwise → store it in SavedPathSystem so it can be assigned to any
  //    truck later from the Patrol panel.
  function _confirmPath() {
    if (_pathWaypoints.length >= 2) {
      if (_extendTarget) {
        // _pathWaypoints[0] duplicates the anchor already present in the
        // target path (that's what we snapped onto) — drop it before merging.
        const added = _pathWaypoints.slice(1);
        if (_extendTarget.kind === 'truck') {
          const trk = _extendTarget.ref;
          const original = trk._path || [];
          const merged = _extendTarget.end === 'end'
            ? [...original, ...added]
            : [...added.slice().reverse(), ...original];
          TruckSystem.setPath(trk, merged);
          showToast(`🛤 Path extended (${merged.length} waypoints); click truck to Start patrol`, '#c0a020', '#0e0a00', '#604800');
        } else {
          const sp = _extendTarget.ref;
          const merged = _extendTarget.end === 'end'
            ? [...sp.waypoints, ...added]
            : [...added.slice().reverse(), ...sp.waypoints];
          SavedPathSystem.setWaypoints(sp.id, merged);
          showToast(`🛤 "${sp.name}" extended (${merged.length} waypoints)`, '#c0a020', '#0e0a00', '#604800');
        }
      } else if (_pathTruck) {
        TruckSystem.setPath(_pathTruck, _pathWaypoints);
        showToast('🛤 Path set: click truck to Start patrol', '#c0a020', '#0e0a00', '#604800');
      } else {
        const saved = SavedPathSystem.add(_pathWaypoints);
        showToast(`🛤 Path saved as "${saved.name}": assign it to a truck from its Patrol panel`, '#c0a020', '#0e0a00', '#604800');
      }
    }
    _pathActive = false; _pathTruck = null; _pathWaypoints = []; _extendTarget = null;
    state._pathPreview = null; state._pathCursor = null;
  }

  // Commits a genuine (non-drag) path-tool click: places a waypoint, starts
  // a new path (optionally off a nearby truck), or — on a quick double-click
  // or a click that closes the loop back onto the start point — confirms
  // the path. Called from mouseup once we know the press wasn't a pan-drag.
  // This is the same logic that used to run directly on mousedown.
  function _commitPathClick(sx, sy) {
    const _rawWorld = Camera.screenToWorld(sx, sy);
    const _wasteSnapped = _snapPathPointNearWaste(_rawWorld.x, _rawWorld.y);
    const _closeSnap = _snapPathClose(_wasteSnapped.x, _wasteSnapped.y);
    const _world = { x: _closeSnap.x, y: _closeSnap.y };
    const _now   = performance.now();
    const _dbl   = (_now - _pathLastClickT) < 450;
    _pathLastClickT = _now;

    if (_dbl && _pathActive) {
      // Double-click = confirm path (don't add another waypoint — the previous
      // single click already added the final point; just commit what we have)
      _confirmPath();
      return;
    }

    if (!_pathActive) {
      // First click — snapping onto an existing path's start/end waypoint
      // extends that path; failing that, attach to a nearby truck (existing
      // behavior); failing that, start a standalone path with no truck at all.
      const _endpointHit = _findPathEndpointHit(_world.x, _world.y);
      let _nearest = null;
      if (!_endpointHit) {
        let _nearDist = Infinity;
        for (const _trk of EntityRegistry.getByType(T.TRUCK)) {
          TruckSystem.initWorldPos(_trk);
          const _dx = _world.x - (_trk._wx + TILE/2);
          const _dy = _world.y - (_trk._wy + TILE*1.5);
          const _d  = Math.sqrt(_dx*_dx + _dy*_dy);
          if (_d < TILE * 3 && _d < _nearDist) { _nearest = _trk; _nearDist = _d; }
        }
      }
      const _startX = _endpointHit ? _endpointHit.x : _world.x;
      const _startY = _endpointHit ? _endpointHit.y : _world.y;
      _extendTarget = _endpointHit;
      _pathTruck = _endpointHit ? null : _nearest;
      _pathWaypoints = [{ wx: _startX, wy: _startY }];
      _pathActive = true;
      state._pathPreview = _pathWaypoints;
      state._pathCursor  = { wx: _startX, wy: _startY };
      if (_endpointHit) {
        const label = _endpointHit.kind === 'truck' ? 'truck path' : `"${_endpointHit.ref.name}"`;
        showToast(`🛤 Extending ${label}: click to add points, double-click to finish`, '#c0a020', '#0e0a00', '#604800');
      } else {
        showToast(_nearest
          ? '🛤 Path started: click to add points, double-click to finish'
          : '🛤 Path started: click to add points, double-click (or close the loop) to save', '#c0a020', '#0e0a00', '#604800');
      }
    } else if (_closeSnap.closing) {
      // Clicked back on the start point — confirm in one step, no
      // double-click needed. Don't push a duplicate final waypoint: patrol
      // already wraps last→first automatically (see TruckSystem._tickPatrol),
      // so the closing segment is that wrap itself, back to the real start.
      _confirmPath();
    } else {
      // Subsequent click — add waypoint
      _pathWaypoints.push({ wx: _world.x, wy: _world.y });
      state._pathPreview = _pathWaypoints;
    }
  }

  // Waste-building path snapping — clicking a path waypoint within range of
  // a waste-producing (Coal Generator, Refinery, Nuclear Reactor) or
  // waste-processing (Coal/Oil/Nuclear Waste Processing Facility) building
  // snaps the point to land ~2 tiles from its edge, matching
  // HaulSystem.PICKUP_BUFFER so a drawn path reliably falls inside the
  // pickup/dropoff zone instead of requiring pixel-precise clicking.
  const WASTE_PATH_SNAP_TYPES = [T.COALGENERATOR, T.REFINERY, T.NUCLEARREACTOR, T.ADVREACTOR, T.REPROCESSOR, T.COALWASTE, T.OILWASTE, T.NUCLEARWASTE];
  const PATH_SNAP_RANGE  = TILE * 3;   // start snapping once within this range
  const PATH_SNAP_BUFFER = TILE * 2;   // snapped point sits this far past the edge

  function _snapPathPointNearWaste(wx, wy) {
    let best = null, bestDist = Infinity;
    for (const type of WASTE_PATH_SNAP_TYPES) {
      for (const ent of EntityRegistry.getByType(type)) {
        const left  = ent.col * TILE, top = ent.row * TILE;
        const w     = (ent.width  || 1) * TILE;
        const h     = (ent.height || 1) * TILE;
        const right = left + w, bottom = top + h;
        const nx = Math.max(left, Math.min(wx, right));
        const ny = Math.max(top,  Math.min(wy, bottom));
        const d  = Math.hypot(wx - nx, wy - ny);
        if (d < bestDist) {
          bestDist = d;
          best = { left, top, right, bottom, cx: left + w / 2, cy: top + h / 2, halfW: w / 2, halfH: h / 2 };
        }
      }
    }
    if (!best || bestDist > PATH_SNAP_RANGE) return { x: wx, y: wy };

    // Direction from the building's centre through the click point, so the
    // snapped point lands on whichever side the player was aiming for.
    let dx = wx - best.cx, dy = wy - best.cy;
    let dlen = Math.hypot(dx, dy);
    if (dlen < 0.01) { dx = 0; dy = -1; dlen = 1; } // clicked dead-centre — default to the north side
    dx /= dlen; dy /= dlen;

    // Distance from centre to where this ray exits the footprint rectangle
    // (simple slab intersection), then push out by the fixed buffer.
    const tX = dx !== 0 ? best.halfW / Math.abs(dx) : Infinity;
    const tY = dy !== 0 ? best.halfH / Math.abs(dy) : Infinity;
    const edgeDist = Math.min(tX, tY);
    const snapDist = edgeDist + PATH_SNAP_BUFFER;
    return { x: best.cx + dx * snapDist, y: best.cy + dy * snapDist };
  }

  // Clicking near any waypoint dot — on a truck's active patrol path or on
  // an unassigned SavedPathSystem path — opens that path's info panel.
  // Generous radius since dots render small; first match wins (truck paths
  // checked first since they're the more common case once paths get used).
  const WAYPOINT_CLICK_RADIUS = TILE * 0.6;
  function _findPathWaypointHit(wx, wy) {
    for (const _trk of EntityRegistry.getByType(T.TRUCK)) {
      if (!_trk._path) continue;
      // Auto-dispatched routes always start with a waypoint right on the
      // truck's own current tile (that's just where the route began) — skip
      // it, otherwise clicking the truck itself always "hits" that waypoint
      // first and opens the patrol panel instead of ever reaching the normal
      // entity click below, silently breaking double-click-to-drive for any
      // truck currently running a dispatch route.
      const _tcx = (_trk._wx ?? _trk.col * TILE) + TILE / 2;
      const _tcy = (_trk._wy ?? _trk.row * TILE) + TILE * 1.5;
      if (Math.hypot(wx - _tcx, wy - _tcy) <= WAYPOINT_CLICK_RADIUS) continue;
      for (const _wp of _trk._path) {
        if (Math.hypot(wx - _wp.wx, wy - _wp.wy) <= WAYPOINT_CLICK_RADIUS) return { kind: 'truck', truck: _trk };
      }
    }
    if (typeof SavedPathSystem !== 'undefined') {
      for (const _sp of SavedPathSystem.all()) {
        for (const _wp of _sp.waypoints) {
          if (Math.hypot(wx - _wp.wx, wy - _wp.wy) <= WAYPOINT_CLICK_RADIUS) return { kind: 'saved', path: _sp };
        }
      }
    }
    return null;
  }

  // Starting a new path near the FIRST or LAST waypoint of an existing path
  // (truck-assigned or saved) snaps onto it and extends that path instead of
  // creating an unrelated new one. Only checked when beginning a fresh draw
  // (see _commitPathClick) — same radius as the click-to-inspect hit-test
  // above so "close enough to click" and "close enough to extend" agree.
  function _findPathEndpointHit(wx, wy) {
    for (const _trk of EntityRegistry.getByType(T.TRUCK)) {
      if (!_trk._path || _trk._path.length < 1) continue;
      const _first = _trk._path[0], _last = _trk._path[_trk._path.length - 1];
      if (Math.hypot(wx - _first.wx, wy - _first.wy) <= WAYPOINT_CLICK_RADIUS)
        return { kind: 'truck', ref: _trk, end: 'start', x: _first.wx, y: _first.wy };
      if (Math.hypot(wx - _last.wx, wy - _last.wy) <= WAYPOINT_CLICK_RADIUS)
        return { kind: 'truck', ref: _trk, end: 'end', x: _last.wx, y: _last.wy };
    }
    if (typeof SavedPathSystem !== 'undefined') {
      for (const _sp of SavedPathSystem.all()) {
        if (!_sp.waypoints.length) continue;
        const _first = _sp.waypoints[0], _last = _sp.waypoints[_sp.waypoints.length - 1];
        if (Math.hypot(wx - _first.wx, wy - _first.wy) <= WAYPOINT_CLICK_RADIUS)
          return { kind: 'saved', ref: _sp, end: 'start', x: _first.wx, y: _first.wy };
        if (Math.hypot(wx - _last.wx, wy - _last.wy) <= WAYPOINT_CLICK_RADIUS)
          return { kind: 'saved', ref: _sp, end: 'end', x: _last.wx, y: _last.wy };
      }
    }
    return null;
  }

  // ── Deleting paths ──────────────────────────────────────────────────
  // A path is a list of waypoints, not anything on the grid, so the Delete
  // tool, right-click delete and zone delete — all of which work tile by
  // tile — never touched one. These find the paths that are on screen
  // (saved paths always; a truck's own path while a truck panel shows it,
  // as the renderer draws them) under a point or inside a box, and remove
  // one: a saved path from the list, a truck's path off the truck.
  let _pathDeleteHold = false;   // this press removed a path: the rest of the drag deletes nothing
  function _visiblePaths() {
    const out = [];
    if (typeof SavedPathSystem !== 'undefined')
      for (const sp of SavedPathSystem.all()) if (sp.waypoints.length) out.push({ kind: 'saved', ref: sp, pts: sp.waypoints });
    const roster = typeof TruckStatusPanel !== 'undefined' && TruckStatusPanel.isOpen();
    for (const trk of EntityRegistry.getByType(T.TRUCK)) {
      if (!TruckSystem.hasPath(trk) || trk._path.length < 2) continue;
      if (!roster && !(TruckPatrolPanel.isOpen() && TruckPatrolPanel.target() === trk)) continue;
      out.push({ kind: 'truck', ref: trk, pts: trk._path });
    }
    return out;
  }
  // Each leg of a path, the closing one back to the start included (paths
  // are drawn, and driven, as loops).
  function _pathLegs(pts) {
    const legs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (pts.length > 1 && (i < pts.length - 1 || pts.length > 2)) legs.push([a, b]);
    }
    return legs;
  }
  function _distToLeg(px, py, a, b) {
    const dx = b.wx - a.wx, dy = b.wy - a.wy, L = dx * dx + dy * dy;
    const k = L ? Math.max(0, Math.min(1, ((px - a.wx) * dx + (py - a.wy) * dy) / L)) : 0;
    return Math.hypot(px - (a.wx + dx * k), py - (a.wy + dy * k));
  }
  // The visible path under a world point: on a waypoint, or on its line.
  function _pathAt(wx, wy) {
    const r = Math.max(WAYPOINT_CLICK_RADIUS * 0.6, 10 / Camera.zoom);
    for (const p of _visiblePaths()) {
      if (p.pts.some(w => Math.hypot(wx - w.wx, wy - w.wy) <= WAYPOINT_CLICK_RADIUS)) return p;
      if (_pathLegs(p.pts).some(([a, b]) => _distToLeg(wx, wy, a, b) <= r)) return p;
    }
    return null;
  }
  // Every visible path with a waypoint or a stretch of line inside a world box.
  function _pathsInBox(x0, y0, x1, y1) {
    const inBox = (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    return _visiblePaths().filter(p => p.pts.some(w => inBox(w.wx, w.wy)) || _pathLegs(p.pts).some(([a, b]) => {
      const n = Math.max(1, Math.ceil(Math.hypot(b.wx - a.wx, b.wy - a.wy) / (TILE / 4)));
      for (let i = 0; i <= n; i++) if (inBox(a.wx + (b.wx - a.wx) * i / n, a.wy + (b.wy - a.wy) * i / n)) return true;
      return false;
    }));
  }
  function _removePath(p, quiet = false) {
    if (p.kind === 'saved') {
      SavedPathSystem.remove(p.ref.id);
      if (typeof SavedPathPanel !== 'undefined' && SavedPathPanel.close) SavedPathPanel.close();
      if (!quiet) showToast(`🗑 "${p.ref.name}" deleted`, '#ff7a7a', '#180800', '#602010');
    } else {
      TruckSystem.clearPath(p.ref);
      if (!quiet) showToast(`🗑 ${TruckSystem.displayName(p.ref)}'s path deleted`, '#ff7a7a', '#180800', '#602010');
    }
  }

  // Drag-move state — active while entity is picked up and being repositioned
  let dragEntity   = null;   // the entity being moved
  let rmbDeselected = false;  // suppresses delete after tool-deselect RMB
  // Drag-deleting with a held RMB (or a controller's B) only happens when the
  // press itself landed on something removable. A hold that started on a tree,
  // a bush or empty ground is a chopping hold: sweeping it across a building
  // must never demolish that building.
  let rmbDeleteDrag = false;
  let dragOriginC  = 0;      // its original col (to restore on cancel)
  let dragOriginR  = 0;
  let dragOffsetC  = 0;      // where within the footprint the drag started
  let dragOffsetR  = 0;
  let dragStarted  = false;  // true once cursor moved to a different tile
  let _lmbDownSX = 0, _lmbDownSY = 0;   // where the last left press went down (a click vs a pan)
  let dragDownSX   = 0;      // screen coords at mousedown — lets trucks (which
  let dragDownSY   = 0;      // move continuously, not tile-to-tile) tell a real
                              // drag apart from ordinary click jitter
  const TRUCK_DRAG_PX = 6;   // min screen-px movement before a truck click counts as a drag

  // Turn a placed building the way R does while no tool is out: the one
  // under the cursor, or every building in a selection (Select tool).
  // Most kinds turn or flip a port; the rest are left as they are.
  // `quiet` keeps the per-building toasts down for a group. Returns
  // whether `e` turned.
  function rotatePlaced(e, quiet) {
    if (!e) return false;
    const before = [e._rotation, e._outSideDc, e._outSideDr, e._reservoirSide, e._udgAxis, e._orientation];
    let turned = false;
    // Coal mines with a rail yard (every MK2, and MK1s built since the
    // yard was added) flip their OUT stub between the rail's two ends.
    if (e && (e.type === T.COALMINE2 || (e.type === T.COALMINE && CoalSystem.isYardMine(e)))) {
      e._rotation = ((e._rotation || 0) + 1) % 4;
      PowerNetwork.recomputeWireHops();
      turned = true;
    } else if (e && (e.type === T.COALMINE || e.type === T.HYDROGENERATOR || e.type === T.WATEREXTRACTOR)) {
      e._rotation = ((e._rotation || 0) + 1) % 4;
      if (e.type === T.HYDROGENERATOR) {
        const dirs = [[0,-1],[1,0],[0,1],[-1,0]];
        const [dc, dr] = dirs[e._rotation % 4];
        e._inSideDc = dc;
        e._inSideDr = dr;
      }
      PowerNetwork.recomputeWireHops();
    }
    // Placed uranium mine: flip its OUT stub to the other end of the rail.
    if (e && (e.type === T.URANIUMMINE || e.type === T.RAREEARTHMINE || isSulfurMine(e))) {
      e._rotation = ((e._rotation || 0) + 1) % 4;
    }
    // Geothermal Well: turn the steam spout to the next side. The turbine
    // link follows the port (GeothermalSystem.relinkWell), so a turbine
    // only stays hooked up while the spout points at it.
    if (e && e.type === T.GEOWELL) {
      e._rotation = ((e._rotation || 0) + 1) % 4;
      e._southPortLow = false;
      GeothermalSystem.relinkWell(e);
      PowerNetwork.recomputeWireHops();
      if (!quiet) showToast(`♨ Steam output now faces ${['↑ N', '→ E', '↓ S', '← W'][e._rotation]}`, '#ff9050', '#140800', '#703018');
    }
    // Hydro Turbine: turn the drive shaft output to the next side. The
    // shaft chain is walked from the output port every tick
    // (ShaftSystem.tick), so it only drives a shaft the port now touches.
    if (e && e.type === T.HYDROTURBINE && ReservoirSystem.flipTurbine(e)) {
      const side = ['↑ N', '→ E', '↓ S', '← W'][[[0, -1], [1, 0], [0, 1], [-1, 0]].findIndex(([dc, dr]) => dc === e._outSideDc && dr === e._outSideDr)];
      if (!quiet) showToast(`⚙ Drive shaft output now faces ${side}`, '#80e8ff', '#001828', '#0a4078');
    }
    // Liquid Storage Tank: flip both stubs to the opposite face.
    if (e && e.type === T.OILSTORAGE) {
      e._rotation = ((e._rotation || 0) + 1) % 4;
      PowerNetwork.recomputeWireHops();
    }
    // Storage Container: swap the IN and OUT belt stubs between the left
    // and right faces (SolidStorageSystem.ports reads the flip live).
    if (e && e.type === T.SOLIDSTORAGE) {
      e._rotation = ((e._rotation || 0) + 1) % 4;
      PowerNetwork.recomputeWireHops();
    }
    // Gas Holder: swap GAS IN and GAS OUT between the left and right
    // faces (GasStorageSystem.getStubs reads the rotation live).
    if (e && e.type === T.GASSTORAGE) {
      e._rotation = (e._rotation || 0) === 0 ? 2 : 0;
      PowerNetwork.recomputeWireHops();
    }
    // Rotate placed road under cursor
    if (e && e.type === T.ROAD) {
      e._rotation = ((e._rotation || 0) + 1) % 4;
    }
    // Flip which bank a placed dam creates its reservoir on
    if (e && e.type === T.DAM) {
      ReservoirSystem.flipDam(e);
    }
    // Rotate placed shaft
    if (e && e.type === T.SHAFT) {
      if (!ShaftSystem.rotateShaft(e)) { if (!quiet) flashMessage('No room to rotate shaft.'); }
      else turned = true;
    }
    // Rotate placed underground pipe
    if (e && e.type === T.UNDERGNDPIPE) {
      e._udgAxis = (e._udgAxis === 'v') ? 'h' : 'v';
      udgPairNew(e);
      // A surface pipe only opens toward an underground mouth when one of
      // the two is placed. Turning the mouth to face a pipe that was
      // already there has to make that same join, or the two sit end to
      // end and nothing ever passes between them.
      _pipeJoinLineEnds(e.col, e.row);
    }
    const _hb = beltOf(e);
    if (_hb && _hb._udgBelt) {
      _hb._udgAxis = (_hb._udgAxis === 'v') ? 'h' : 'v';
      udgPairNew(_hb);
      // As for the underground pipe: a belt end it now faces joins it.
      _beltJoinLineEnds(e.col, e.row);
    }
    // Placed splitter: turn its favoured side clockwise.
    if (_hb && _hb._splitter) {
      _hb._splitSide = ((_hb._splitSide || 0) + 1) % 4;
      _hb._autoSplit = false;   // turned by the player: it stays
      state.splitter = splitterSettings(_hb);
    }
    return turned || !!(_hb && (_hb._udgBelt || _hb._splitter))
      || before.some((v, i) => v !== [e._rotation, e._outSideDc, e._outSideDr, e._reservoirSide, e._udgAxis, e._orientation][i]);
  }

  // Expose drag state + house selection
  state.dragEntity    = null;
  state.dragOwnLines  = null;
  state.dragCanDrop   = false;
  state.selectedHouse      = null;   // house entity whose substation radius to highlight
  state.selectedSubstation = null;   // substation entity to highlight its own radius
  state.selectedLightningRod = null; // lightning rod entity to highlight its protection radius

  // The end-of-run cinematic takes the controls away entirely: the player
  // is watching, not playing. "Walk the ashes" hands pan and zoom back but
  // never building, so locksBuild() stays true for the rest of the session.
  const _apocLocked = () => typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.locksInput();
  const _apocBuilt  = () => typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.locksBuild();

  canvas.addEventListener('mousedown', e => {
    if (_apocLocked()) return;
    // While the fishing tension minigame is up it behaves like a modal —
    // FishingSystem has its own window-level mouse listeners for the
    // hold-to-reel input, so normal placement/panning/chop input is
    // suppressed until it resolves. RMB is still let through so the
    // player can bail out of the minigame entirely.
    if (typeof FishingSystem !== 'undefined' && FishingSystem.isMinigameActive()) {
      if (e.button === 2) {
        e.preventDefault();
        FishingSystem.cancelAll();
        showToast('🎣 Line reeled in; the fish swims free', '#a04020', '#0e0400', '#602000');
      }
      return;
    }
    state._poleDragOrigin = null;
    const { x: sx, y: sy } = canvasMousePos(e);
    const { col, row }     = screenToTile(sx, sy);
    if (e.button === 0) { _lmbDownSX = sx; _lmbDownSY = sy; }
    mouseDown   = true;
    state.mouseDown = true;
    _pressRemoved = new Set();   // this press deletes at most one layer per tile
    mouseButton = e.button;
    state.mouseButton = e.button;
    // Fresh press — clear the drag-placement anchor (see game_loop.js's
    // drag-placement block) so it doesn't draw a line connecting this new
    // click back to wherever a previous drag left off.
    InputManager._lastPlacedCol = null;
    InputManager._lastPlacedRow = null;
    // Select tool (see _sel): RMB lets a selection go; Shift + LMB drag (or
    // a plain drag while armed) draws the box; pressing on a selected item
    // picks the whole group up.
    if (e.button === 2 && (_sel.size || _selArmed) && !state.selectedTool) {
      selDisarm();
      rmbDeselected = true;
      lastMouseSX = sx; lastMouseSY = sy;
      return;
    }
    if (e.button === 0 && !state.selectedTool && !_bpSelectActive && !_bpStampActive && !RelocatePicker.active && !_circuitAssignSw) {
      _selPrune();
      const _top = GridManager.getEntity(col, row);
      if (!e.shiftKey && _top && _sel.has(_top)) {
        _selMove = { grabC: col, grabR: row, dc: 0, dr: 0, ok: true, why: null, movers: _selMovers() };
        state.selectionMove = null;
        isPanning = false;
        lastMouseSX = sx; lastMouseSY = sy;
        return;
      }
      if (e.shiftKey || _selArmed) {
        _selBoxing   = true;
        const _bw = Camera.screenToWorld(sx, sy);
        _selBoxStart = { sx, sy, col, row, wx: _bw.x, wy: _bw.y, shift: e.shiftKey };
        _selBoxAdd   = e.shiftKey && (e.ctrlKey || e.metaKey);
        isPanning = false;
        lastMouseSX = sx; lastMouseSY = sy;
        return;
      }
      if (_sel.size) selClear();   // a plain click elsewhere lets the selection go
    }
    if (e.button === 0) { _pipeDragBegin(); _beltDragBegin(); }
    if (_zoneDeleteActive && state.selectedTool === 'delete' && e.button === 0) {
      _zoneDeleteDragging = true;
      const w = Camera.screenToWorld(sx, sy);
      _zoneDeleteStart = { sx, sy, col, row, wx: w.x, wy: w.y };
    }
    // RMB cancels an active blueprint stamp instead of chopping/removing
    if (_bpStampActive && e.button === 2) {
      _bpStampActive = false;
      BlueprintSystem.cancelStamp();
      lastMouseSX = sx; lastMouseSY = sy;
      return;
    }
    if (e.button === 2 && !state.selectedTool) {
      const _te = GridManager.getEntity(col, row);
      if (_te && (_te.type === T.TREE || _te.type === T.BUSH)) {
        if (DevMode.timeScale > 0) {
          _chopTarget = { col, row };
          _te._chopProgress = 0;
        } else {
          showToast('⏸ Unpause to chop', '#c0a020', '#0e0a00', '#605020');
        }
      }
    }
    lastMouseSX = sx;
    lastMouseSY = sy;

    if (e.button === 0) {
      // Fishing pole — hold LMB while standing on land within reach of
      // water to charge a cast. FishingSystem validates and shows its
      // own toast if you're on the water or too far from shore.
      if (state.selectedTool === T.FISHINGPOLE) {
        if (FishingSystem.isActive()) return;
        FishingSystem.startCharge(col, row);
        return;
      }
      // Path tool — record press position only. Whether this becomes a
      // waypoint click or a camera pan is decided on release (see
      // mouseup) once we know whether the cursor moved far enough.
      if (state.selectedTool === T.PATHTOOL) {
        _pathDownSX   = sx;
        _pathDownSY   = sy;
        _pathDragging = false;
        return;
      }
      // Blueprint area-select — start a rubber-band drag over entities
      if (_bpSelectActive) {
        _bpSelectDragging = true;
        const _bw = Camera.screenToWorld(sx, sy);
        _bpSelectStart = { sx, sy, col, row, wx: _bw.x, wy: _bw.y };
        return;
      }
      // Blueprint stamp — click to place a copy of the armed blueprint
      if (_bpStampActive) {
        BlueprintSystem.stampAt(col, row);
        return;
      }
      if (!state.selectedTool) {
        // Clicking a waypoint dot on any path (truck-assigned or saved)
        // opens that path's info panel — checked before anything else so
        // a small precise target isn't swallowed by a broader zone/tile hit.
        const _wpWorld = Camera.screenToWorld(sx, sy);
        const _wpHit = _findPathWaypointHit(_wpWorld.x, _wpWorld.y);
        if (_wpHit) {
          if (_wpHit.kind === 'truck') {
            TruckPatrolPanel.open(_wpHit.truck);
          } else {
            SavedPathPanel.open(_wpHit.path, _wpWorld);
          }
          return;
        }
        const _tileEnt = GridManager.getEntity(col, row);
        const _zoneHit = ZoneSystem.getZoneAt(col, row);
        // Phones open the zone panel with a long-press (js/mobile.js): there
        // a double tap zooms in, so it doesn't open the panel as well.
        if (_zoneHit && !_tileEnt && !window.GW_MOBILE) {
          const now = Date.now();
          const DBLCLICK_MS = 350;
          if (now - (_lastZoneClick||0) < DBLCLICK_MS &&
              _lastZoneKey === _zoneHit.key && _lastZoneIndex === (_zoneHit.index||0)) {
            const _zp = document.getElementById('zone-panel');
            const alreadyOpen = _zp.classList.contains('visible') && _zp.dataset.zone === _zoneHit.key;
            if (alreadyOpen) {
              _zp.classList.remove('visible');
            } else {
              ZoneSystem.buildZonePanel(_zoneHit.key, _zoneHit.index || 0);
              _zp.dataset.zone = _zoneHit.key;
              _zp.dataset.zoneIndex = _zoneHit.index || 0;
              _zp.classList.add('visible');
              _zp.style.left = Math.min(lastMouseSX + 12, window.innerWidth  - 240) + 'px';
              _zp.style.top  = Math.min(lastMouseSY + 12, window.innerHeight - 300) + 'px';
            }
            _lastZoneClick = 0;
            return;
          }
          _lastZoneClick = now;
          _lastZoneKey   = _zoneHit.key;
          _lastZoneIndex = _zoneHit.index || 0;
          // Don't return — allow camera drag to proceed
        }
      }
      // A relocation in progress: a click on a site (its pin, just above
      // its first tile, or anywhere in its outline) moves the building
      // there. Anywhere else just drags the map, so the player can look
      // around for the sites; Cancel on the banner (or Escape) cancels.
      if (RelocatePicker.active) {
        const i = RelocatePicker.siteAt(col, row);
        if (i >= 0) { RelocatePicker.choose(i); return; }
        isPanning = true;
        return;
      }

      // A drone in the air under the cursor: say what it is doing.
      if (!state.selectedTool && typeof DroneInspector !== 'undefined') {
        const _w = Camera.screenToWorld(sx, sy);
        const _hit = DroneSystem.droneAt(_w.x, _w.y);
        if (_hit) { DroneInspector.open(_hit.port, _hit.d); SFX.click?.(); isPanning = true; return; }
      }
      if (typeof DroneInspector !== 'undefined') DroneInspector.close();

      let entity     = GridManager.getEntity(col, row);
      // Fallback: if no entity at tile, OR the entity here is something a
      // truck can legitimately be sitting on top of, check world space for
      // a truck and prefer it. Patrol movement never restamps the grid
      // (skipGrid=true — see TruckSystem.frameTick), so the grid can be
      // stale wherever a patrolling truck currently is; over empty ground
      // that's harmless (falls through here anyway), but over a road/wire/
      // pipe/etc the grid still shows THAT entity, which used to block this
      // fallback from ever running and made the truck unclickable there.
      const _truckPassthrough = new Set([T.WIRE, T.POLE, T.LAMP, T.ROAD, T.POWERTOWER, T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR]);
      if (!entity || _truckPassthrough.has(entity.type)) {
        const _wx2 = col * TILE + TILE * 0.5;
        const _wy2 = row * TILE + TILE * 0.5;
        for (const _trk of EntityRegistry.getByType(T.TRUCK)) {
          TruckSystem.initWorldPos(_trk);
          const _cx = _trk._wx + TILE * 0.5;
          const _cy = _trk._wy + TILE * 1.5;
          if (Math.abs(_wx2 - _cx) < TILE && Math.abs(_wy2 - _cy) < TILE * 2) { entity = _trk; break; }
        }
      }
      const occupied   = !!entity && entity.type !== T.TREE && entity.type !== T.BUSH;
      const toolActive = !!state.selectedTool && state.selectedTool !== 'delete';

      if ((!state.selectedTool || ((state.selectedTool === T.TRUCK || state.selectedTool === T.HAULER) && entity && entity.type === T.TRUCK)) && occupied && entity.type !== T.TREE && entity.type !== T.BUSH && entity.type !== T.WATER) {
        // Don't stop driving/patrol here — a plain click should just open the
        // patrol panel (see the "no movement" branch below) without
        // interrupting the truck's path. Patrol/driving only actually stops
        // once the drag is confirmed (see dragStarted flip below).
        dragEntity  = entity;
        dragOriginC = entity.col;   // always use anchor, not clicked tile
        dragOriginR = entity.row;
        dragOffsetC = col - entity.col;  // where within the footprint was clicked
        dragOffsetR = row - entity.row;
        dragDownSX  = sx;
        dragDownSY  = sy;
        dragStarted = false;
        state.dragEntity  = null;
        state.dragCanDrop = false;
        isPanning = false;
      // The tiles a tool may build over (wire over a pipe or a belt, a belt
      // over a wire...) are listed here: a press anywhere else that is taken
      // pans the map. A drag still laid them through the game loop, but a
      // phone's quick tap is a press and release with no frame in between,
      // so a tile missing here (wire over a belt) could not be tapped on.
      } else if (!state.selectedTool || (toolActive && occupied && !_overOwnDeposit(state.selectedTool, col, row) && !((state.selectedTool === T.COALMINE || state.selectedTool === T.COALMINE2) && entity && entity.type === T.COALDEPOSIT) && !((state.selectedTool === T.PUMPJACK || state.selectedTool === T.PUMPJACK2) && !!_depositOverlap(T.OILDEPOSIT, col, row, EntityDefs[state.selectedTool].width || 3, EntityDefs[state.selectedTool].height || 3)) && !(state.selectedTool === T.URANIUMMINE && entity && entity.type === T.URANIUMDEPOSIT) && !(state.selectedTool === T.SULFURMINE && entity && entity.type === T.SULFURDEPOSIT) && !(state.selectedTool === T.SULFURMINE2 && entity && (entity.type === T.SULFURDEPOSIT || entity.type === T.SULFURMINE)) && !(state.selectedTool === T.LITHIUMMINE && entity && entity.type === T.LITHIUMDEPOSIT) && !(state.selectedTool === T.RAREEARTHMINE && entity && entity.type === T.RAREEARTHDEPOSIT) && !(state.selectedTool === T.HELIUMWELL && entity && entity.type === T.HELIUMDEPOSIT) && !(state.selectedTool === T.HELIUMWELL2 && entity && (entity.type === T.HELIUMDEPOSIT || entity.type === T.HELIUMWELL)) && !(state.selectedTool === T.GEOWELL && entity && entity.type === T.GEODEPOSIT) && !(state.selectedTool === T.WIRE && entity && entity.type === T.PIPE) && !(state.selectedTool === T.WIRE && entity && entity.type === T.CONVEYOR && !entity._underWire) && !((state.selectedTool === T.WIRE || state.selectedTool === T.CONVEYOR) && entity && entity.type === T.UNDERGNDPIPE && !entity[state.selectedTool === T.WIRE ? '_underWire' : '_underConveyor']) && !(state.selectedTool === T.CONVEYOR && entity && entity.type === T.WIRE) && !(state.selectedTool === T.CONVEYOR && entity && entity.type === T.PIPE) && !((state.selectedTool === T.CONVEYOR || state.selectedTool === T.CONVEYORSPLITTER) && entity && entity.type === T.CONVEYOR) && !(state.selectedTool === T.PIPE && entity && entity.type === T.WIRE) && !(state.selectedTool === T.PIPE && entity && entity.type === T.CONVEYOR) && !((state.selectedTool === T.PIPE || state.selectedTool === T.WIRE || state.selectedTool === T.CONVEYOR || state.selectedTool === T.BRIDGE || state.selectedTool === T.POLE || state.selectedTool === T.SHAFT || state.selectedTool === T.WATEREXTRACTOR || state.selectedTool === T.DAM || state.selectedTool === T.HYDROTURBINE) && entity && entity.type === T.WATER) && !(state.selectedTool === T.UNDERGNDPIPE && entity && entity.type === T.WIRE) && !(state.selectedTool === T.ROAD && entity && (entity.type === T.WIRE || entity.type === T.PIPE || entity.type === T.UNDERGNDPIPE || entity.type === T.ROAD)))) {
        // TruckPatrolPanel deliberately excluded — it should only close via
        // its own CLOSE button (or an explicit action like deleting the
        // truck), not by clicking elsewhere on the map to pan/deselect.
        if (!state.selectedTool) { InspectionPanel.close(); SolarPanelInspector.close(); RefineryPanel.close(); FuelGenPanel.close(); CoalGenPanel.close(); EntityInfoPanel.close(); WireInspector.close(); DroneInspector?.close(); SavedPathPanel.close(); TurbinePanel.close(); ShaftGenPanel.close(); ShaftPanel.close(); DamPanel.close(); WastePanel.close(); state.selectedHouse = null; state.selectedSubstation = null; state.selectedLightningRod = null; }
        isPanning = true;
      } else if (!(_zoneDeleteActive && state.selectedTool === 'delete')) {
        // Zone-delete drag handles the whole rectangle (including this
        // starting tile) in one batch on mouseup — deleting it here too
        // would both double-delete and fire a second demolish sound.
        isPanning = false;
        // Delete tool on a path's line or waypoint: remove the path, and
        // nothing else on this press (the road it runs along stays).
        if (state.selectedTool === 'delete') {
          const { x: _pwx, y: _pwy } = Camera.screenToWorld(sx, sy);
          const _hitPath = _pathAt(_pwx, _pwy);
          if (_hitPath) { _removePath(_hitPath); SFX.demolish(); _pathDeleteHold = true; return; }
        }
        tryPlace(col, row);
      }
    }
    if (e.button === 2) {
      e.preventDefault();
      rmbDeleteDrag = false;  // set below only if this press lands on something removable
      // Cancel an in-progress cast (charging, mid-throw, or line already
      // out waiting for a bite). Switching tools already cancels the
      // session outright (see selectTool()), so this only ever fires
      // while the pole is still equipped — a quick way to bail early.
      if (typeof FishingSystem !== 'undefined' && FishingSystem.isActive() && state.selectedTool === T.FISHINGPOLE) {
        FishingSystem.cancelAll();
        return;
      }
      // Cancel active path drawing
      if (_pathActive) {
        _pathActive = false; _pathTruck = null; _pathWaypoints = []; _extendTarget = null;
        state._pathPreview = null; state._pathCursor = null;
        showToast('Path cancelled', '#806040', '#0a0800', '#403000');
        return;
      }
      if (state.selectedTool) {
        selectTool(null);   // tool active → deselect only, never delete
        rmbDeselected = true;
        return;
      }
      if (e.shiftKey) {
        const line = _lineAt(col, row);
        if (line) { _deleteLine(line); rmbDeselected = true; return; }
      }
      // Truck right-click — world-space hit detection (rendered position, not grid footprint)
      const { x: _worldX, y: _worldY } = Camera.screenToWorld(sx, sy);
      let _truckHit = null;
      for (const _trk of EntityRegistry.getByType(T.TRUCK)) {
        TruckSystem.initWorldPos(_trk);
        const _cx = _trk._wx + TILE * 0.5;       // horizontal center
        const _cy = _trk._wy + TILE * 1.5;       // vertical center of 3-tile body
        if (Math.abs(_worldX - _cx) < TILE && Math.abs(_worldY - _cy) < TILE * 1.5) { _truckHit = _trk; break; }
      }
      if (_truckHit) {
        // Right-click always deletes the truck outright — clearing just its
        // path is a separate, explicit action (the 🗑 Clear button in the
        // Patrol panel), same reasoning as the Delete tool's truck handling
        // in tryRemove() above.
        if (truckLocked(_truckHit)) { truckLockedToast('deleting', _truckHit); return; }
        if (truckLoaded(_truckHit)) { truckLoadedToast(_truckHit); return; }
        const _truckCost = _truckHit.def.cost || 0;
        TruckSystem.stopPatrol(_truckHit);
        if (TruckSystem.getDriven() === _truckHit) TruckSystem.stopDriving();
        if (typeof TruckPatrolPanel !== 'undefined') TruckPatrolPanel.close();
        GridManager.removeEntityFootprint(_truckHit);
        EntityRegistry.remove(_truckHit);
        Economy.spend(-_truckCost);
        HistoryManager.record({ type: 'remove', entity: _truckHit, cost: _truckCost });
        rmbDeleteDrag = true;
        return;
      }
      // Right-click on a path's line or waypoint deletes the path (not what
      // is on the tile under it).
      const _hitPath = _pathAt(_worldX, _worldY);
      if (_hitPath) { _removePath(_hitPath); SFX.demolish(); rmbDeleteDrag = false; return; }
      const _pressed = GridManager.getEntity(col, row);
      rmbDeleteDrag = !!_pressed && _pressed.type !== T.TREE && _pressed.type !== T.BUSH;
      _pressRemove(col, row);  // cursor mode only
      return;
    }
    e.preventDefault();
  });

  canvas.addEventListener('mousemove', e => {
    if (_apocLocked()) return;
    const { x: sx, y: sy } = canvasMousePos(e);
    const { col, row }     = screenToTile(sx, sy);

    state.hoverCol = col;
    state.hoverRow = row;

    // Select tool: the rubber band, or the selection being carried.
    if (_selBoxing && _selBoxStart) {
      lastMouseSX = sx; lastMouseSY = sy;
      _drawDragBoxes();
      return;
    }
    if (_selMove) {
      const dc = col - _selMove.grabC, dr = row - _selMove.grabR;
      if (dc !== _selMove.dc || dr !== _selMove.dr) {
        _selMove.dc = dc; _selMove.dr = dr;
        _selMove.why = (dc || dr) ? _selBlocker(_selMove.movers, dc, dr) : null;
        _selMove.ok  = !_selMove.why;
      }
      state.selectionMove = (dc || dr) ? _selMove : null;
      canvas.style.cursor = (dc || dr) ? (_selMove.ok ? 'grabbing' : 'not-allowed') : 'grab';
      lastMouseSX = sx; lastMouseSY = sy;
      return;
    }

    // Path tool — holding LMB and moving pans the camera instead of
    // dropping a waypoint; otherwise just track the cursor for the live
    // preview line.
    if (state.selectedTool === T.PATHTOOL) {
      // This branch returns before the shared state.canPlace computation
      // below, which is what normally sets canPlace=true for PATHTOOL —
      // without this line the ghost renders red off a stale value left
      // over from the previous tool/hover.
      state.canPlace = true;
      if (mouseDown && mouseButton === 0) {
        if (!_pathDragging) {
          const _dx0 = sx - _pathDownSX, _dy0 = sy - _pathDownSY;
          if (Math.hypot(_dx0, _dy0) > PATH_PAN_THRESHOLD) _pathDragging = true;
        }
        if (_pathDragging) {
          Camera.panByScreen(sx - lastMouseSX, sy - lastMouseSY);
          lastMouseSX = sx; lastMouseSY = sy;
          return;
        }
      }
      if (_pathActive) {
        const _w = Camera.screenToWorld(sx, sy);
        const _snapped = _snapPathPointNearWaste(_w.x, _w.y);
        const _closeSnap = _snapPathClose(_snapped.x, _snapped.y);
        state._pathCursor = { wx: _closeSnap.x, wy: _closeSnap.y, closing: _closeSnap.closing };
      }
      lastMouseSX = sx; lastMouseSY = sy;
      return;
    }
    const _hov = GridManager.getEntity(col, row);
    state.hoverNetworkId = (_hov && _hov.type === T.WIRE) ? _hov.networkId : -1;
    const _tool = state.selectedTool;
    const _def  = _tool && _tool !== 'delete' ? EntityDefs[_tool] : null;
    const _w    = _def?.width  || 1;
    const _h    = _def?.height || 1;
    // Vegetation doesn't block placement — tile is free if only veg is there
    const _canPlaceIgnoreVeg = (() => {
      for (let _r = row; _r < row + _h; _r++)
        for (let _c = col; _c < col + _w; _c++) {
          if (!GridManager.inBounds(_c, _r)) return false;
          const _t = GridManager.getEntity(_c, _r);
          if (_t && _t.type !== T.TREE && _t.type !== T.BUSH
              && !(_t.type === T.ROAD && (_tool === T.TRUCK || _tool === T.HAULER || _tool === T.PATHTOOL || _tool === T.ROAD))) return false;
        }
      if (typeof GovernmentSystem !== 'undefined' && GovernmentSystem.isMeridianReserved?.(col, row, _w, _h)) return false;      return true;
    })();
    const _wireOnPipe = _tool === T.WIRE && !!GridManager.getEntity(col, row) && GridManager.getEntity(col, row).type === T.PIPE;
    const _wireOnWater = _tool === T.WIRE && !!GridManager.getEntity(col, row) && GridManager.getEntity(col, row).type === T.WATER
                       && Economy.canAfford(_def?.cost ?? 0);
    const _pipeOnWater = _tool === T.PIPE && !!GridManager.getEntity(col, row) && GridManager.getEntity(col, row).type === T.WATER
                      && Economy.canAfford(_def?.cost ?? 0);
    const _conveyorOnPipe = _tool === T.CONVEYOR && !!GridManager.getEntity(col, row) && GridManager.getEntity(col, row).type === T.PIPE
                      && Economy.canAfford(_def?.cost ?? 0);
    const _conveyorOnWater = _tool === T.CONVEYOR && !!GridManager.getEntity(col, row) && GridManager.getEntity(col, row).type === T.WATER
                      && Economy.canAfford(_def?.cost ?? 0);
    const _pipeOnConveyor = _tool === T.PIPE && !!GridManager.getEntity(col, row) && GridManager.getEntity(col, row).type === T.CONVEYOR
                      && Economy.canAfford(_def?.cost ?? 0);
    // Mirrors tryPlace's wire-under-belt case: any belt not already carrying a wire.
    const _wireOnConveyor = _tool === T.WIRE && (() => {
      const _b = GridManager.getEntity(col, row);
      return !!_b && _b.type === T.CONVEYOR && !_b._underWire;
    })() && Economy.canAfford(_def?.cost ?? 0);
    // Mirrors _tryPlaceTile's splitter-over-belt swap: a plain belt only.
    const _splitterOnConveyor = _tool === T.CONVEYORSPLITTER && (() => {
      const _b = GridManager.getEntity(col, row);
      return !!_b && _b.type === T.CONVEYOR && !_b._udgBelt && !_b._splitter && !_b._underWire && !_b._underPipe;
    })();
    const _undergndPipeOnWire = _tool === T.UNDERGNDPIPE && !!GridManager.getEntity(col, row) && GridManager.getEntity(col, row).type === T.WIRE
                      && Economy.canAfford(_def?.cost ?? 0);
    // The other stackings tryPlace allows (a belt or pipe laid over a wire,
    // a wire or belt over an underground pipe's tunnel end), so their ghost
    // reads green rather than red over a tile they really can share.
    const _conveyorOnWire = _tool === T.CONVEYOR && !!GridManager.getEntity(col, row) && GridManager.getEntity(col, row).type === T.WIRE
                      && Economy.canAfford(_def?.cost ?? 0);
    const _pipeOnWire = _tool === T.PIPE && !!GridManager.getEntity(col, row) && GridManager.getEntity(col, row).type === T.WIRE
                      && Economy.canAfford(_def?.cost ?? 0);
    const _onUndergndPipe = (_tool === T.WIRE || _tool === T.CONVEYOR) && (() => {
      const _u = GridManager.getEntity(col, row);
      return !!_u && _u.type === T.UNDERGNDPIPE && !_u[_tool === T.WIRE ? '_underWire' : '_underConveyor'];
    })() && Economy.canAfford(_def?.cost ?? 0);
    // Water Extractor: ALL tiles in 4×4 footprint must be T.WATER
    const _waterExtractorCanPlace = _tool === T.WATEREXTRACTOR && _allLake(col, row, _w, _h);
    // Pump Jack: valid as long as its footprint overlaps an oil deposit at
    // all (matches placement logic in tryPlace) — without this, canPlace
    // stays false the whole time the tool is over a deposit (deposit tiles
    // are "occupied" from _canPlaceIgnoreVeg's point of view) and the ghost
    // renders red even when the placement itself would succeed.
    const _pjDep = (_tool === T.PUMPJACK || _tool === T.PUMPJACK2) ? _depositOverlap(T.OILDEPOSIT, col, row, _w, _h) : null;
    const _pumpJackOnDeposit = !!_pjDep
      && !_pumpJackBlocked(_pjDep, _tool)
      && Economy.canAfford(_def?.cost ?? 0);
    // Mines have the same problem the Pump Jack did: they're placed ON a
    // deposit, whose tiles read as "occupied" to _canPlaceIgnoreVeg, so the
    // ghost stayed red over the one spot the mine can actually go. Mirror the
    // real rules from tryPlace — footprint overlapping a live deposit (and for
    // coal, a deposit big enough and not already mined).
    const _MINE_DEPOSIT = MINE_DEPOSIT;
    // An MK2 well over an MK1 replaces it (tryReplaceHeliumWell), as does an
    // MK2 sulfur mine over an MK1 (tryReplaceSulfurMine).
    const _mk1Under = _tool === T.HELIUMWELL2 ? _mk1WellUnder(col, row, _w, _h)
                    : _tool === T.SULFURMINE2 ? _mk1SulfurMineUnder(col, row, _w, _h) : null;
    // The MK2's real footprint (bigger than the deposit, offset from it).
    const _isSulfur2 = _tool === T.SULFURMINE2;
    const _mk2Dep = _tool === T.HELIUMWELL2 ? (_mk1Under ? _mk1Under._linkedDeposit : _depositOverlap(T.HELIUMDEPOSIT, col, row, _w, _h))
                  : _isSulfur2 ? (_mk1Under ? _mk1Under._linkedDeposit : _depositOverlap(T.SULFURDEPOSIT, col, row, _w, _h)) : null;
    const _mk2Rot = _mk1Under ? (_mk1Under._rotation || 0) : _isSulfur2 ? (state.placementRotation || 0) : 0;
    const _mk2Fp = !_mk2Dep ? null : _isSulfur2 ? _sulfurMineFootprint(_mk2Dep, T.SULFURMINE2, _mk2Rot)
                 : _heliumWellFootprint(_mk2Dep, T.HELIUMWELL2, _mk2Rot, _mk1Under || undefined);
    const _mk2Blocked = (fp, dep, ignore = null) => _isSulfur2 ? _sulfurMineBlocked(fp, dep, '', ignore) : _heliumWellBlocked(fp, dep, ignore);
    const _mineOnDeposit = (() => {
      if (_mk1Under) {
        const dep = _mk1Under._linkedDeposit;
        const refund = _mk1Under._paid !== undefined ? _mk1Under._paid : _mk1Under.def.cost;
        return !!dep && !isDepositExhausted(dep) && !(_mk2Fp && _mk2Blocked(_mk2Fp, dep, _mk1Under))
            && Economy.canAfford((_def?.cost ?? 0) - refund);
      }
      const depType = _tool != null ? _MINE_DEPOSIT[_tool] : undefined;
      if (depType === undefined) return false;
      const dep = _depositOverlap(depType, col, row, _w, _h);
      if (!dep) return false;
      if (dep._hasMine) return false;                       // already mined
      if (_mk2Fp && _mk2Blocked(_mk2Fp, dep)) return false;
      if (depType === T.GEODEPOSIT) return GeothermalSystem.canPlaceWell(dep).ok && Economy.canAfford(_def?.cost ?? 0);
      if (depType === T.COALDEPOSIT) {
        if ((dep.coalAmount ?? 1) <= 0) return false;       // exhausted
        if (_coalMineFootprintClear(dep, _tool)) return false;   // the footprint round the deposit must be in bounds and clear
      }
      return Economy.canAfford(_def?.cost ?? 0);
    })();
    // Mines and wells always build anchored on their deposit's top-left,
    // wherever the cursor is — so snap the ghost there while it overlaps one
    // instead of drawing it at the cursor and leaving the player to guess.
    {
      const depType = _tool != null ? _MINE_DEPOSIT[_tool] : undefined;
      const snapDep = depType !== undefined ? _depositOverlap(depType, col, row, _w, _h) : null;
      // Coal mines carry their real size too (w/h), so the ghost and its
      // red tint match what will actually be built on this deposit.
      const _cmFp = (snapDep && (_tool === T.COALMINE || _tool === T.COALMINE2)) ? _coalMineFootprint(snapDep, _tool)
                  : (snapDep && (_tool === T.URANIUMMINE || _tool === T.SULFURMINE || _tool === T.LITHIUMMINE || _tool === T.RAREEARTHMINE)) ? _centredMineFootprint(snapDep, _tool) : null;
      if (_mk2Fp) {
        state.ghostAnchor = { tool: _tool, col: _mk2Fp.col, row: _mk2Fp.row, w: _mk2Fp.w, h: _mk2Fp.h, rot: _mk2Rot };
      } else if (_pjDep) {
        // Pump jacks build on their deposit wherever the cursor is — snap
        // the ghost to the real footprint (the MK2 centres on the deposit).
        const fp = _pumpJackFootprint(_pjDep, _tool);
        state.ghostAnchor = { tool: _tool, col: fp.col, row: fp.row, w: fp.w, h: fp.h };
      } else
      state.ghostAnchor = !snapDep ? null
        : _cmFp ? { tool: _tool, col: _cmFp.col, row: _cmFp.row, w: _cmFp.w, h: _cmFp.h }   // built around the deposit
        : { tool: _tool, col: snapDep.col, row: snapDep.row };
    }
    // Hydro Turbine: footprint is mostly reservoir water, which
    // _canPlaceIgnoreVeg treats as occupied — check reservoir placement
    // rules directly instead (matches ReservoirSystem.buildTurbine).
    const _hydroTurbineCanPlace = _tool === T.HYDROTURBINE
      && typeof ReservoirSystem !== 'undefined'
      && ReservoirSystem.canBuildTurbine(col, row).ok
      && Economy.canAfford(_def?.cost ?? 0);
    // Anything with a build cap reads as un-placeable once it's reached,
    // instead of going green and only failing on click.
    const _atLimit = _tool != null && atPlacementLimit(_tool);
    // Over water (water_build.js): a building that would fill it reads green
    // if the fill is allowed and affordable; a bridge piece snaps flush to
    // the run it's joining, and the ghost shows it there.
    const _rotOdd = (state.placementRotation || 0) % 2 === 1 && footprintTurns(_tool) && placementTurns(_tool);
    const _fillGhost = !_def || _canPlaceIgnoreVeg ? null
      : _tool === T.POWERTOWER ? WaterBuild.towerPlan(col, row, _w, _h)
      : WaterBuild.fillPlan(_tool, col, row, _rotOdd ? _h : _w, _rotOdd ? _w : _h);
    const _fillCanPlace = !!_fillGhost && _fillGhost.ok && Economy.canAfford((_def.cost ?? 0) + _fillGhost.cost);
    let _bridgeCanPlace = false;
    if (_tool === T.BRIDGE) {
      const _bs = WaterBuild.snapBridge(col, row, state.placementRotation || 0);
      state.ghostAnchor = { tool: _tool, col: _bs.col, row: _bs.row };
      // The whole run one click will lay (see the T.BRIDGE branch of tryPlace).
      const _bp = WaterBuild.bridgeRun(_bs.col, _bs.row, state.placementRotation || 0);
      _bridgeCanPlace = _bp.ok && Economy.canAfford(_bp.cost);
    }
    // A Power Pole stood in the water on a footing (water_build.js).
    const _poleWater = _tool === T.POLE && GridManager.inBounds(col, row) ? GridManager.getEntity(col, row) : null;
    const _polePlan = _poleWater && _poleWater.type === T.WATER ? WaterBuild.polePlan(_poleWater) : null;
    // A zone-requested amenity goes on the spot its request marks (see the
    // gate in _tryPlaceTile): the ghost snaps onto the spot while it overlaps
    // it, and reads red anywhere it would be refused. Job sites have their
    // own rules, so they keep the plain free-ground check.
    let _zoneItemCanPlace = null;
    if ((_tool === T.CELLTOWER || _tool === T.FIBERHUB || _tool === T.EVCHARGER) && typeof ZoneRequestSystem !== 'undefined'
        && !(typeof ContractSystem !== 'undefined' && ContractSystem.isAway())) {
      const at = ZoneRequestSystem.placementFor(_tool, col, row);
      if (at && (at.col !== col || at.row !== row)) state.ghostAnchor = { tool: _tool, col: at.col, row: at.row };
      _zoneItemCanPlace = !!at && GridManager.canPlaceFootprint(at.col, at.row, _w, _h)
        && !ZoneRequestSystem.zoneAlreadyHasItem(_tool, at.col, at.row)
        && Economy.canAfford(_def?.cost ?? 0);
    }

    // Tools that can ONLY go on a resource deposit must not fall through to
    // the generic "is this tile free" branch below — empty ground passes that
    // check, so the ghost went green everywhere except the deposit, which is
    // the one place the click actually succeeds. Their dedicated deposit
    // checks are the whole answer for these tools.
    const _depositOnly = _tool === T.PUMPJACK  || _tool === T.PUMPJACK2 || _tool === T.COALMINE
                      || _tool === T.COALMINE2 || _tool === T.URANIUMMINE
                      || _tool === T.SULFURMINE || _tool === T.SULFURMINE2 || _tool === T.LITHIUMMINE || _tool === T.RAREEARTHMINE
                      || _tool === T.HELIUMWELL || _tool === T.HELIUMWELL2 || _tool === T.GEOWELL;
    // Geothermal Turbine: empty ground isn't enough — the footprint has to
    // land on an unused well's steam output port, so the ghost has to check
    // that rather than only "is this tile free".
    const _geoTurbineCanPlace = _tool === T.GEOTURBINE
      && !!GeothermalSystem.wellForTurbineAt(col, row, _w, _h)
      && GridManager.canPlaceFootprint(col, row, _w, _h)
      && Economy.canAfford(_def?.cost ?? 0);

    state.canPlace = !_atLimit && (
                     _zoneItemCanPlace !== null
                   ? _zoneItemCanPlace
                   : _tool === T.BRIDGE
                   ? _bridgeCanPlace
                   // A drive shaft can bridge water; its size follows the orientation, not the def.
                   : _tool === T.SHAFT
                   ? ShaftSystem.canBuildShaft(col, row, state.shaftOrientation || 'h') && Economy.canAfford(_def?.cost ?? 0)
                   : _polePlan
                   ? _polePlan.ok && Economy.canAfford(_polePlan.cost)
                   : _fillGhost
                   ? _fillCanPlace
                   : _depositOnly
                   ? (_pumpJackOnDeposit || _mineOnDeposit)
                   : _tool === T.GEOTURBINE
                   ? _geoTurbineCanPlace
                   : (   _tool === T.PATHTOOL
                      || _tool === T.TRUCK || _tool === T.HAULER
                      || _wireOnPipe
                      || _wireOnConveyor
                      || _splitterOnConveyor
                      || _wireOnWater
                      || _pipeOnWater
                      || _conveyorOnWater
                      || _conveyorOnPipe
                      || _pipeOnConveyor
                      || _undergndPipeOnWire
                      || _conveyorOnWire
                      || _pipeOnWire
                      || _onUndergndPipe
                      || _waterExtractorCanPlace
                      || _hydroTurbineCanPlace
                      || (!!_def
                      && _tool !== T.HYDROTURBINE
                      && _canPlaceIgnoreVeg
                      && Economy.canAfford(_def.cost ?? 0)
                      && !(_tool === T.WIRE && wouldExceedWireHops(col, row)))));

    if (mouseDown && mouseButton === 2 && !rmbDeselected) {
      const ent = GridManager.getEntity(col, row);
      if (ent && (ent.type === T.TREE || ent.type === T.BUSH)) {
        // Hold RMB to chop tree — retarget when the drag lands on a
        // different plant. All progress advancement and completion happens
        // once per frame in updateChop() (simulated-time driven, so it's
        // naturally frozen while paused and scales with fast-forward); this
        // handler only tracks which tile is being chopped.
        if (DevMode.timeScale > 0 && (!_chopTarget || _chopTarget.col !== col || _chopTarget.row !== row)) {
          _chopTarget = { col, row };
          ent._chopProgress = 0;
        }
      } else {
        _chopTarget = null;
        if (rmbDeleteDrag) _pressRemove(col, row);
      }
    }

    if (mouseDown && mouseButton === 0) {
      if ((state.selectedTool === T.POLE || state.selectedTool === T.POWERTOWER || state.selectedTool === T.ROAD || state.selectedTool === T.BRIDGE) && !dragEntity) {
        // Interval drag handled by tryPoleAt / tryRoadAt in game loop — nothing to do here
      } else if ((state.selectedTool === T.WIRE || state.selectedTool === T.PIPE || state.selectedTool === T.UNDERGNDPIPE || state.selectedTool === T.CONVEYOR || state.selectedTool === T.UNDERGNDCONVEYOR || state.selectedTool === T.WATEREXTRACTOR || _WIND_TOOLS.has(state.selectedTool)) && !dragEntity) {
        // Line runs are laid by the game loop on the axis-locked line, with
        // every tile in between filled. Placing here too used the raw cursor
        // tile — a wobble across a column boundary (aiming at a 2-wide
        // tower's centre does exactly that) laid a second parallel run.
      } else if (dragEntity) {
        // Entity picked up — first movement to a new tile activates the drag.
        // Trucks move continuously in world space rather than tile-to-tile,
        // so they instead need to clear a small screen-pixel threshold —
        // otherwise the mousemove jitter inherent to an ordinary click would
        // register as a "drag" and stop the truck's patrol/driving for no reason.
        const _truckMoved = dragEntity.type === T.TRUCK &&
          Math.hypot(sx - dragDownSX, sy - dragDownSY) >= TRUCK_DRAG_PX;
        const _wantsMove = _truckMoved || col - dragOffsetC !== dragOriginC || row - dragOffsetR !== dragOriginR;
        // A customer's property (house, cabin, commercial, industrial) is
        // never dragged to a new spot: it moves only through its panel's
        // Relocate button, after the penalty warning, to an A/B/C site
        // (EntityInfoPanel.askRelocate). A drag that starts on one pans the
        // map instead.
        if (!dragStarted && _wantsMove && CUSTOMER_TYPES.has(dragEntity.type)) {
          dragEntity = null;
          isPanning = true;
        } else
        // An overheating reactor can't be carried away from its detonation either.
        if (!dragStarted && _wantsMove && reactorOverheating(dragEntity) !== null) {
          wasteRemovalBlockedToast(dragEntity, reactorOverheating(dragEntity));
          dragEntity = null;
        } else if (!dragStarted && _wantsMove && reactorWorking(dragEntity) !== null) {
          // Nor can one that is running at all: shut it down, then move it.
          showToast(`☢ This reactor is running (${reactorWorking(dragEntity)}); shut it down before moving it`,
                    '#ff6040', '#140800', '#602010');
          dragEntity = null;
        } else if (!dragStarted && _wantsMove && requestedAmenityLocked(dragEntity)) {
          // A requested amenity stays within reach of whoever asked for it.
          requestedAmenityLockedToast(dragEntity, 'moved');
          dragEntity = null;
        } else if (!dragStarted && _wantsMove && truckLocked(dragEntity)) {
          truckLockedToast('moving', dragEntity);
          dragEntity = null;
        } else if (!dragStarted && _wantsMove && _clientFixed(dragEntity)) {
          // Same rule as tryRemove(): a job site's existing plant is the
          // client's, so it can't be dragged somewhere else either (bar
          // their Storage Containers, see _clientFixed).
          showToast('⚠ Client property, not yours to move', '#ff6040', '#140800', '#602010');
          dragEntity = null;
        } else if (!dragStarted && _wantsMove && (dragEntity._bridge || dragEntity._waterFooting || (dragEntity.type === T.POLE && dragEntity._underWater)
                   || (dragEntity._filled && (_wasteFacilityFixed(dragEntity.type) || CUSTOMER_TYPES.has(dragEntity.type))))) {
          // Built over water (water_build.js): a bridge or footing is sunk into
          // the lake bed. (A filled building moves like any other: the drop
          // gives its old water back and fills under the new spot. Not one
          // that relocates through a fee prompt, which doesn't handle fill.)
          // Demolishing refunds it in full, fill or footing included, and gives the water back.
          showToast(dragEntity._bridge ? '⚠ Bridges can\'t be moved; delete and rebuild'
                                       : '⚠ Built over water: can\'t be moved. Delete it (fully refunded) and rebuild',
                    '#ff6040', '#140800', '#602010');
          dragEntity = null;
        } else if (!dragStarted && dragEntity.type !== T.GOVBUILDING && !DEPOSIT_TYPES.has(dragEntity.type) && !NOT_RELOCATABLE.has(dragEntity.type) && _wantsMove) {
          dragStarted = true;
          if (dragEntity.type === T.TRUCK) {
            // Only actually interrupt driving/patrol once the drag is real
            TruckSystem.stopDriving();
            TruckSystem.stopPatrol(dragEntity);
            dragEntity._vx = 0; dragEntity._vy = 0;
          }
          // Entity stays on grid at origin — render system draws it there dimmed
          // and draws a full copy at the cursor tile
          state.dragEntity  = dragEntity;
          state.dragOffsetC = dragOffsetC;
          state.dragOffsetR = dragOffsetR;
          // Moves that go through a fee prompt place the building later, by
          // their own route, so they keep the plain "must be empty" rule.
          state.dragAbsorbWires = !_wasteFacilityFixed(dragEntity.type) && !CUSTOMER_TYPES.has(dragEntity.type);
          // Its own pipe and belt runs don't block a short shift either (they're
          // lifted on drop, see the commit below and GridManager.ownLineTiles).
          state.dragOwnLines = state.dragAbsorbWires && dragEntity.type !== T.TRUCK && ((dragEntity.width || 1) > 1 || (dragEntity.height || 1) > 1)
            ? GridManager.ownLineTiles(dragEntity) : null;
          // ...and open water doesn't, for the same buildings: the drop fills it.
          state.dragFill = state.dragAbsorbWires && dragEntity.type !== T.TRUCK;
        }
        if (dragStarted) {
          const destAC = col - dragOffsetC, destAR = row - dragOffsetR;
          let canDrop;
          if (dragEntity.type === T.WATEREXTRACTOR) {
            canDrop = GridManager.canDropExtractor(dragEntity, destAC, destAR);
          } else if (dragEntity.type === T.HYDROTURBINE) {
            canDrop = (destAC === dragOriginC && destAR === dragOriginR)
              || (typeof ReservoirSystem !== 'undefined' && ReservoirSystem.canBuildTurbine(destAC, destAR, dragEntity).ok);
          } else {
            // Whole footprint must be in bounds and empty, ignoring the
            // entity's own origin tiles and vegetation (destroyed on drop) —
            // same rule as the drop commit and the drag ghost's red tint.
            canDrop = dragEntity.type === T.TRUCK
                   || GridManager.canDropMoved(dragEntity, destAC, destAR, state.dragAbsorbWires, state.dragOwnLines, state.dragFill);
          }
          state.dragCanDrop  = canDrop;
          canvas.style.cursor = canDrop ? 'grabbing' : 'not-allowed';
        }
      } else if (isPanning) {
        Camera.panByScreen(sx - lastMouseSX, sy - lastMouseSY);
        canvas.style.cursor = 'grabbing';
      } else if (!NO_DRAG_REPLACE_TOOLS.has(state.selectedTool) && state.selectedTool !== T.SHAFT && !_zoneDeleteActive && !_bpSelectActive && !_bpStampActive) {
        tryPlace(col, row);   // (a shaft drag runs through tryShaftAt, from the game loop)
      }
    }

    lastMouseSX = sx;
    lastMouseSY = sy;
    // Update the rubber-band overlays (also redrawn every frame, for keyboard
    // panning; see drawDragBoxes).
    _drawDragBoxes();
    // Live-refresh the stamp HUD (cost affordability can change as balance ticks)
    if (_bpStampActive && typeof BlueprintSystem !== 'undefined') BlueprintSystem.refreshStampHud?.();
  });

  canvas.addEventListener('mouseup', () => {
    if (_apocLocked()) return;
    if (typeof FishingSystem !== 'undefined' && FishingSystem.isMinigameActive()) return;

    // Fishing pole — release the charged cast. FishingSystem figures out
    // direction/distance/success from the live cursor position itself.
    if (state.selectedTool === T.FISHINGPOLE && FishingSystem.isCharging()) {
      FishingSystem.releaseCast();
    }

    rmbDeselected = false;
    rmbDeleteDrag = false;
    _pathDeleteHold = false;
    _pressRemoved = null;
    state._poleDragOrigin = null;
    state._poleLastPlaced = null;
    state._roadLastPlaced = null;
    state._bridgeDrag = null;
    state._lastBridge = null;
    state._windDrag = null;
    state._shaftDrag = null;
    state._extractorDrag = null;
    Camera.releaseDrag();

    // Path tool — commit the click now that we know whether it was a quick
    // click or a hold-and-drag pan. A drag already panned the camera live
    // in mousemove, so there's nothing further to do for it here.
    if (state.selectedTool === T.PATHTOOL) {
      if (mouseButton === 0 && !_pathDragging) {
        _commitPathClick(lastMouseSX, lastMouseSY);
      }
      _pathDragging = false;
    }
    // Open panel for vegetation on LMB click (no drag)
    if (!dragEntity && mouseButton === 0 && !_zoneDeleteDragging) {
      const _vw = Camera.screenToWorld(lastMouseSX, lastMouseSY);
      const _vt = GridManager.worldToTile(_vw.x, _vw.y);
      const _ve = GridManager.getEntity(_vt.col, _vt.row);
      if (_ve && (_ve.type === T.TREE || _ve.type === T.BUSH)) {
        EntityInfoPanel.open(_ve);
      }
      // A reservoir's water: its level, inflow and turbines. Only for a
      // click, not the end of a drag that panned the map across it.
      if (_ve && _ve.type === T.WATER && _ve._reservoirId !== undefined && !state.selectedTool
          && Math.hypot(lastMouseSX - _lmbDownSX, lastMouseSY - _lmbDownSY) < 6) {
        EntityInfoPanel.open(_ve);
      }
    }
    if (dragEntity) {
      if (dragStarted) {
        // Commit drop if destination is free, otherwise restore to origin
        const { col, row } = GridManager.worldToTile(
          Camera.screenToWorld(lastMouseSX, lastMouseSY).x,
          Camera.screenToWorld(lastMouseSX, lastMouseSY).y
        );
        // canDrop: dest must be free OR be the origin tile itself
        const destAnchorC = col - dragOffsetC;
        const destAnchorR = row - dragOffsetR;
        const w2 = dragEntity.width, h2 = dragEntity.height;
        // For multi-tile: temporarily clear footprint to check dest
        if (dragEntity.type === T.WATEREXTRACTOR) {
          // Restore water tiles at origin before checking dest
          const mw = dragEntity.width || 4, mh = dragEntity.height || 4;
          for (let r = dragEntity.row; r < dragEntity.row + mh; r++)
            for (let c = dragEntity.col; c < dragEntity.col + mw; c++)
              if (GridManager.inBounds(c, r) && GridManager.tiles[r][c] === dragEntity)
                GridManager.tiles[r][c] = null;
          if (dragEntity._savedWaterTiles)
            for (const { c, r, tile } of dragEntity._savedWaterTiles)
              if (GridManager.inBounds(c, r) && !GridManager.tiles[r][c])
                GridManager.tiles[r][c] = tile;
        } else if (dragEntity.type !== T.TRUCK) {
          // For HYDROTURBINE this also restores the water under its OLD
          // footprint (GridManager._restoreWaterUnder, driven by the
          // _waterTiles it captured at build/relocate time) — ReservoirSystem
          // .relocateTurbine below re-captures a fresh snapshot at wherever
          // it actually ends up (new spot, or back at origin if the drop
          // is rejected).
          // Not for a truck: this unregisters it as well, and a truck is
          // never stamped back down (TruckSystem.relocate below).
          GridManager.removeEntityFootprint(dragEntity);
        }
        // canDrop check
        let canDrop;
        if (dragEntity.type === T.WATEREXTRACTOR) {
          // Lifted off its origin above, so its old tiles are lake again.
          canDrop = (destAnchorC === dragOriginC && destAnchorR === dragOriginR)
            || GridManager.canDropExtractor(dragEntity, destAnchorC, destAnchorR);
        } else if (dragEntity.type === T.HYDROTURBINE) {
          canDrop = (destAnchorC === dragOriginC && destAnchorR === dragOriginR)
            || (typeof ReservoirSystem !== 'undefined' && ReservoirSystem.canBuildTurbine(destAnchorC, destAnchorR).ok);
        } else {
          canDrop = dragEntity.type === T.TRUCK
                 || GridManager.canDropMoved(dragEntity, destAnchorC, destAnchorR, state.dragAbsorbWires, state.dragOwnLines, state.dragFill)
                 || (destAnchorC === dragOriginC && destAnchorR === dragOriginR);
          // A refused drop used to just snap back with no word why — say what
          // is in the way (and where), since it is often hard to see.
          if (!canDrop) {
            const _b = GridManager.dropBlocker(dragEntity, destAnchorC, destAnchorR, state.dragAbsorbWires, state.dragOwnLines, state.dragFill);
            if (_b) flashMessage(`Can't move here: blocked by ${_b.reason}${_b.c !== undefined ? ` at ${_b.c}, ${_b.r}` : ''}`);
          }
          // Landing on water costs its fill, less what the old spot gives back.
          if (canDrop && state.dragFill && (destAnchorC !== dragOriginC || destAnchorR !== dragOriginR)) {
            const _fc = WaterBuild.moveFillCost(dragEntity, destAnchorC, destAnchorR);
            if (_fc > 0 && !Economy.canAfford(_fc)) {
              canDrop = false;
              flashMessage(`Not enough funds: filling the water there costs ${formatMoney(_fc)}`);
            }
          }
        }
        if (canDrop && (destAnchorC !== dragOriginC || destAnchorR !== dragOriginR)) {
          if (_wasteFacilityFixed(dragEntity.type)) {
            // Same flow as a customer building below, priced off build cost.
            const fine  = _wasteFacilityFee(dragEntity, WASTE_RELOCATE_FEE_PCT);
            const label = dragEntity.def?.label || EntityDefs[dragEntity.type]?.label || 'facility';
            const entityToMove = dragEntity;
            const destCol = destAnchorC, destRow = destAnchorR;
            const origCol = dragOriginC, origRow = dragOriginR;
            entityToMove.col = origCol;
            entityToMove.row = origRow;
            GridManager.setEntityFootprint(entityToMove);
            PenaltyModal.show({
              title:   'RELOCATE FACILITY',
              msg:     `Moving the ${label} costs a relocation fee of ${formatMoney(fine)} (${Math.round(WASTE_RELOCATE_FEE_PCT * 100)}% of its build cost).`,
              fine,
              onConfirm() {
                if (!Economy.canAfford(fine)) { flashMessage('Not enough funds!'); return; }
                if (GridManager.getEntity(origCol, origRow) !== entityToMove) return;
                // Re-check the destination: the world can change while the modal is up.
                GridManager.removeEntityFootprint(entityToMove);
                if (!GridManager.canPlaceFootprint(destCol, destRow, entityToMove.width || 1, entityToMove.height || 1)) {
                  GridManager.setEntityFootprint(entityToMove);
                  flashMessage('That spot is no longer free!');
                  return;
                }
                Economy.spend(fine);
                entityToMove.col = destCol;
                entityToMove.row = destRow;
                GridManager.setEntityFootprint(entityToMove);
                HistoryManager.record({ type: 'move', entity: entityToMove,
                  fromCol: origCol, fromRow: origRow, toCol: destCol, toRow: destRow, fine });
                PowerNetwork.recomputeWireHops();
                showToast(`↷ ${label} relocated: ${formatMoney(fine)} fee`, '#f0c040', '#0e0a00', '#604010');
              },
              onCancel() {
                // already restored above
              },
            });
          } else if (CUSTOMER_TYPES.has(dragEntity.type)) {
            // Intercept — show relocation penalty modal before committing
            const base = dragEntity.upfrontPaid || (dragEntity.dailyFee || 100) * 20;
            const fine = Math.round(base * 0.40);
            // Capture references now — dragEntity will be nulled after mouseup returns
            const entityToMove = dragEntity;
            const destCol = destAnchorC, destRow = destAnchorR;
            const origCol = dragOriginC, origRow = dragOriginR;
            // Restore entity to origin while modal is open
            entityToMove.col = origCol;
            entityToMove.row = origRow;
            GridManager.setEntityFootprint(entityToMove);
            PenaltyModal.show({
              title:   'RELOCATE BUILDING',
              msg:     `Moving this building incurs a relocation penalty of ${formatMoney(fine)} (40% of upfront payment).`,
              fine,
              onConfirm() {
                if (!Economy.canAfford(fine)) { flashMessage('Not enough funds!'); return; }
                Economy.spend(fine);
                GridManager.removeEntityFootprint(entityToMove);
                entityToMove.col = destCol;
                entityToMove.row = destRow;
                GridManager.setEntityFootprint(entityToMove);
                ZoneSystem.removeBuilding(entityToMove); // rescans grid, rebuilds zone at new position
                HistoryManager.record({ type: 'move', entity: entityToMove,
                  fromCol: origCol, fromRow: origRow, toCol: destCol, toRow: destRow, fine });
                PowerNetwork.recomputeWireHops();
                showToast(`↷ Relocated: ${formatMoney(fine)} penalty`, '#f0c040', '#0e0a00', '#604010');
              },
              onCancel() {
                // already restored above
              },
            });
          } else {
            const fromC = dragOriginC, fromR = dragOriginR;
            // One undo step: the wire (and own pipe/belt) taken up under the
            // new spot comes back with the building, rather than each tile
            // sitting on the stack under the move as an undo of its own.
            HistoryManager.beginBatch();
            if (dragEntity.type === T.WATEREXTRACTOR) {
              // Save new water tiles at destination
              const mw = dragEntity.width || 4, mh = dragEntity.height || 4;
              dragEntity._savedWaterTiles = [];
              for (let r = destAnchorR; r < destAnchorR + mh; r++)
                for (let c = destAnchorC; c < destAnchorC + mw; c++)
                  dragEntity._savedWaterTiles.push({ c, r, tile: GridManager.tiles[r][c] });
              dragEntity.col = destAnchorC;
              dragEntity.row = destAnchorR;
              for (let r = destAnchorR; r < destAnchorR + mh; r++)
                for (let c = destAnchorC; c < destAnchorC + mw; c++)
                  GridManager.tiles[r][c] = dragEntity;
            } else if (dragEntity.type === T.HYDROTURBINE) {
              ReservoirSystem.relocateTurbine(dragEntity, destAnchorC, destAnchorR);
            } else if (dragEntity.type === T.TRUCK) {
              // Trucks never occupy grid tiles — not at placement
              // (input_manager.js's T.TRUCK placement branch), not while
              // patrolling (TruckSystem ticks with skipGrid=true). Calling
              // setEntityFootprint here would stamp the truck onto
              // whatever tile it's dropped on (pipe, conveyor, wire...)
              // and, since nothing restamps the grid for a parked/
              // patrolling truck afterward, that stamp never gets
              // released — permanently hiding/blocking the entity that
              // was really there.
              TruckSystem.relocate(dragEntity, destAnchorC, destAnchorR);
            } else {
              dragEntity.col = destAnchorC;
              dragEntity.row = destAnchorR;
              // Take up any plain wire the building is landing on (see
              // GridManager.canDropMoved), refunded like any removed wire.
              // ...and any of its own pipe or belt runs it now sits on.
              let _lifted = 0, _liftedLines = 0;
              if (state.dragAbsorbWires) {
                for (let r = destAnchorR; r < destAnchorR + (h2 || 1); r++)
                  for (let c = destAnchorC; c < destAnchorC + (w2 || 1); c++) {
                    const _t = GridManager.tiles[r][c];
                    if (GridManager.isLooseWire(_t)) { tryRemove(c, r, true); _lifted++; }
                    else if (_t && state.dragOwnLines && state.dragOwnLines.has(_t)) { tryRemove(c, r, true); _liftedLines++; }
                  }
              }
              // The lake under the old spot is back (lifted above); fill under the new one.
              const _fillDelta = WaterBuild.refillAfterMove(dragEntity);
              GridManager.setEntityFootprint(dragEntity);
              if (_lifted || _liftedLines) {
                const _parts = [];
                if (_lifted) _parts.push(`${_lifted} wire tile${_lifted === 1 ? '' : 's'}`);
                if (_liftedLines) _parts.push(`${_liftedLines} of its own pipe/belt tile${_liftedLines === 1 ? '' : 's'}`);
                showToast(`↷ Moved over ${_parts.join(' and ')}: removed and refunded`, '#f0c040', '#0e0a00', '#604010');
              }
              if (_fillDelta) {
                const _n = Math.abs(_fillDelta) / WaterBuild.FILL_PER_TILE;
                showToast(_fillDelta > 0
                  ? `↷ Filled ${_n} more water tile${_n === 1 ? '' : 's'}: ${formatMoney(_fillDelta)}`
                  : `↷ ${_n} water tile${_n === 1 ? '' : 's'} given back: ${formatMoney(-_fillDelta)} fill refunded`,
                  '#f0c040', '#0e0a00', '#604010');
              }
            }
            HistoryManager.record({ type: 'move', entity: dragEntity,
              fromCol: fromC, fromRow: fromR, toCol: destAnchorC, toRow: destAnchorR });
            HistoryManager.endBatch();
            PowerNetwork.recomputeWireHops();
          }
        } else {
          dragEntity.col = dragOriginC;
          dragEntity.row = dragOriginR;
          if (dragEntity.type === T.WATEREXTRACTOR) {
            // Re-stamp over the origin water tiles (already restored above)
            const mw = dragEntity.width || 4, mh = dragEntity.height || 4;
            dragEntity._savedWaterTiles = [];
            for (let r = dragOriginR; r < dragOriginR + mh; r++)
              for (let c = dragOriginC; c < dragOriginC + mw; c++) {
                dragEntity._savedWaterTiles.push({ c, r, tile: GridManager.tiles[r][c] });
                GridManager.tiles[r][c] = dragEntity;
              }
          } else if (dragEntity.type === T.HYDROTURBINE) {
            // Re-place at the origin and re-capture its water snapshot there
            // (already lifted/restored above by removeEntityFootprint).
            ReservoirSystem.relocateTurbine(dragEntity, dragOriginC, dragOriginR);
          } else if (dragEntity.type !== T.TRUCK) {
            WaterBuild.refillAfterMove(dragEntity);   // a filled building takes its water back up (no charge: same tiles)
            GridManager.setEntityFootprint(dragEntity);
          }
          PowerNetwork.recomputeWireHops();
        }
      } else if (_circuitAssignSw && dragEntity && typeof CircuitSwitchSystem !== 'undefined') {
        // Assignment mode: the click means "put this on / take this off the
        // circuit", not "select this".
        if (!EntityRegistry.all().has(_circuitAssignSw)) {
          _circuitAssignSw = null;                      // switch went away mid-assign
        } else {
          const res = CircuitSwitchSystem.toggleMember(_circuitAssignSw, dragEntity);
          if (!res.ok) flashMessage(res.why);
          else SFX.click?.();
          if (typeof EntityInfoPanel !== 'undefined' && EntityInfoPanel.isOpen()) EntityInfoPanel.refresh?.();
        }
      } else {
        // No movement — treat as a click: open inspector
        const INSPECTABLE = [T.CIRCUITSWITCH, T.CIRCUITSWITCH2, T.TREE, T.BUSH, T.BIOFUELGEN, T.SOLAR, T.SOLAR2, T.SOLAR3, T.WIND, T.WIND2, T.WIND3, T.RESEARCH, T.RESEARCH2, T.RESEARCH3, T.PROTECTOR, T.PROTECTOR2, T.PROTECTOR3, T.AQUIFER, T.WATEREXTRACTOR, T.HYDROGENERATOR, T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL, T.CABIN, T.MONITOR, T.MONITOR2, T.ENGOFFICE, T.BEACON, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5, T.LAMP, T.CAMERA, T.EVCHARGER, T.CELLTOWER, T.FIBERHUB, T.POLE, T.POWERTOWER, T.LIGHTNINGROD, T.LIGHTNINGROD2, T.LIGHTNINGROD3, T.BATTERY, T.WIRE, T.SURVEY, T.SURVEY2, T.GEODEPOSIT, T.GEOWELL, T.GEOTURBINE, T.COALDEPOSIT, T.OILDEPOSIT, T.URANIUMDEPOSIT, T.SULFURDEPOSIT, T.LITHIUMDEPOSIT, T.RAREEARTHDEPOSIT, T.HELIUMDEPOSIT, T.COALMINE, T.COALMINE2, T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2, T.LITHIUMMINE, T.RAREEARTHMINE, T.HELIUMWELL, T.HELIUMWELL2, T.CONVEYOR, T.COALGENERATOR, T.PUMPJACK, T.PUMPJACK2, T.OILSTORAGE, T.SOLIDSTORAGE, T.GASSTORAGE, T.REFINERY, T.FUELGEN, T.GOVERNOR, T.CARBONCAPTURE, T.GASSTATION, T.GOVBUILDING, T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB, T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ, T.TRUCK, T.ROAD, T.DAM, T.HYDROTURBINE, T.SHAFT, T.CHEMICALPLANT, T.FUELPLANT, T.LEACHPLANT, T.SCMILL, T.COREWORKS, T.COKEOVEN, T.GRAPHITEFURNACE, T.LITHIUMPROCESSPLANT, T.REPROCESSOR, T.SPENTFUELPOOL, T.MOXPLANT, T.DRONEPORT, T.DRONECHARGER, T.NUCLEARREACTOR, T.ADVREACTOR, T.COOLINGTOWER, T.COOLINGTOWER2, T.STEAMTURBINE, T.STEAMTURBINE2, T.MK4RESEARCH, T.MK5RESEARCH, T.ELECTROLYZER, T.ATMOSCOLLECTOR, T.HABERBOSCH, T.WASHTOWER, T.FUSIONFUELPLANT, T.HULKINGFUSIONREACTOR, T.ADVFUSIONREACTOR, T.MHDRING, T.CRYOPLANT, T.HE3SEPARATOR, T.TRITIUMBREEDER, T.PIPE, T.UNDERGNDPIPE, T.COALWASTE, T.OILWASTE, T.NUCLEARWASTE, T.SMALLPARK, T.COMMUNITYGARDEN, T.TREEDSTREET, T.BASKETBALLCOURT, T.FARMERSMARKET, T.FOUNTAIN, T.SPLASHPAD, T.BASEBALLFIELD, T.PLAYGROUND, T.ALLOTMENTS, T.DOGPARK, T.COMMUNITYCENTER, T.GREENHOUSE, T.CORNERSTORE, T.FARM];
        if (INSPECTABLE.includes(dragEntity.type)) {
          const ENTITY_PANEL_TYPES = [T.CIRCUITSWITCH, T.CIRCUITSWITCH2, T.TREE, T.BUSH, T.BIOFUELGEN, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5, T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL, T.CABIN, T.LAMP, T.CAMERA, T.EVCHARGER, T.CELLTOWER, T.FIBERHUB, T.POLE, T.POWERTOWER, T.LIGHTNINGROD, T.LIGHTNINGROD2, T.LIGHTNINGROD3, T.MONITOR, T.MONITOR2, T.ENGOFFICE, T.BEACON, T.SOLAR2, T.SOLAR3, T.WIND, T.WIND2, T.WIND3, T.BATTERY, T.SURVEY, T.SURVEY2, T.GEODEPOSIT, T.GEOWELL, T.GEOTURBINE, T.COALMINE, T.COALMINE2, T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2, T.LITHIUMMINE, T.RAREEARTHMINE, T.HELIUMWELL, T.HELIUMWELL2, T.COALDEPOSIT, T.OILDEPOSIT, T.URANIUMDEPOSIT, T.SULFURDEPOSIT, T.LITHIUMDEPOSIT, T.RAREEARTHDEPOSIT, T.HELIUMDEPOSIT, T.PUMPJACK, T.PUMPJACK2, T.OILSTORAGE, T.SOLIDSTORAGE, T.GASSTORAGE, T.CONVEYOR, T.WATEREXTRACTOR, T.GOVERNOR, T.CARBONCAPTURE, T.GASSTATION, T.GOVBUILDING, T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB, T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ, T.CHEMICALPLANT, T.FUELPLANT, T.LEACHPLANT, T.SCMILL, T.COREWORKS, T.COKEOVEN, T.GRAPHITEFURNACE, T.LITHIUMPROCESSPLANT, T.REPROCESSOR, T.SPENTFUELPOOL, T.MOXPLANT, T.DRONEPORT, T.DRONECHARGER, T.ATMOSCOLLECTOR, T.HABERBOSCH, T.WASHTOWER, T.FUSIONFUELPLANT, T.HULKINGFUSIONREACTOR, T.ADVFUSIONREACTOR, T.MHDRING, T.CRYOPLANT, T.HE3SEPARATOR, T.TRITIUMBREEDER, T.NUCLEARREACTOR, T.ADVREACTOR, T.COOLINGTOWER, T.COOLINGTOWER2, T.STEAMTURBINE, T.STEAMTURBINE2, T.PIPE, T.UNDERGNDPIPE, T.SMALLPARK, T.COMMUNITYGARDEN, T.TREEDSTREET, T.BASKETBALLCOURT, T.FARMERSMARKET, T.FOUNTAIN, T.SPLASHPAD, T.BASEBALLFIELD, T.PLAYGROUND, T.ALLOTMENTS, T.DOGPARK, T.COMMUNITYCENTER, T.GREENHOUSE, T.CORNERSTORE, T.FARM];

          // A lightning-struck building always opens the entity info panel,
          // whatever it would normally open. The repair button (and "repair
          // all nearby") lives there and nowhere else, so a struck Fuel
          // Generator, Refinery, Solar Panel, Dam or Research Station used to
          // open its own specialised panel and leave the player with no way
          // to fix it at all. The specialised readouts are all about output
          // the wreck isn't producing anyway.
          if (dragEntity._lightningDamaged) {
            RefineryPanel.close(); FuelGenPanel.close(); CoalGenPanel.close(); TurbinePanel.close();
            ShaftGenPanel.close(); ShaftPanel.close(); DamPanel.close();
            WastePanel.close(); SolarPanelInspector.close(); InspectionPanel.close();
            if (EntityInfoPanel.isOpen() && EntityInfoPanel.target === dragEntity) EntityInfoPanel.close();
            else EntityInfoPanel.open(dragEntity);
          } else if (dragEntity.type === T.TRUCK) {
            const handled = TruckSystem.handleClick(dragEntity);
            // Single click (not double-click which starts driving) — open patrol panel
            if (!handled) {
              TruckPatrolPanel.open(dragEntity);
            }
          } else if (dragEntity.type === T.HOUSE && !dragEntity.isCabin) {
            // Keep radius visual + open info panel
            state.selectedHouse = (state.selectedHouse === dragEntity) ? null : dragEntity;
            if (state.selectedHouse) EntityInfoPanel.open(dragEntity);
            else EntityInfoPanel.close();
          } else if (dragEntity.type === T.LIGHTNINGROD || dragEntity.type === T.LIGHTNINGROD2 || dragEntity.type === T.LIGHTNINGROD3) {
            // Keep the protection-radius visual up while its panel is open,
            // and let a second click on the same rod toggle both back off.
            state.selectedLightningRod = (state.selectedLightningRod === dragEntity) ? null : dragEntity;
            if (state.selectedLightningRod) EntityInfoPanel.open(dragEntity);
            else EntityInfoPanel.close();
          } else if (dragEntity.type === T.SUBSTATION || dragEntity.type === T.SUBSTATION2 || dragEntity.type === T.SUBSTATION3 || dragEntity.type === T.SUBSTATION4 || dragEntity.type === T.SUBSTATION5) {
            // Keep radius visual + open info panel
            state.selectedSubstation = (state.selectedSubstation === dragEntity) ? null : dragEntity;
            if (state.selectedSubstation) EntityInfoPanel.open(dragEntity);
            else EntityInfoPanel.close();
          } else if (ENTITY_PANEL_TYPES.includes(dragEntity.type)) {
            // Monitor also toggles GRID panel
            // `powered` is forced false on a lightning-struck building, so
            // this already refuses a burning station — spelled out because
            // the two conditions mean different things and a later change to
            // either shouldn't silently re-enable the wreck.
            if ((dragEntity.type === T.MONITOR || dragEntity.type === T.MONITOR2) && dragEntity.powered && !dragEntity._lightningDamaged) {
              const btn   = document.getElementById('grid-tab-btn');
              const gp    = document.getElementById('grid-panel');
              const open  = gp.classList.toggle('open');
              btn.classList.toggle('open', open);
              if (open) {
                // Always anchor under the GRID tab button, same as clicking it directly —
                // otherwise the panel keeps whatever stale position it last had (or none).
                placeGridPanel(gp, btn);
              }
            }
            if (EntityInfoPanel.isOpen() && EntityInfoPanel.target === dragEntity) EntityInfoPanel.close();
            else EntityInfoPanel.open(dragEntity);
          } else if (dragEntity.type === T.REFINERY) {
            if (RefineryPanel.isOpen() && RefineryPanel.target === dragEntity) RefineryPanel.close();
            else { RefineryPanel.close(); FuelGenPanel.close(); SolarPanelInspector.close(); RefineryPanel.open(dragEntity); }
          } else if (dragEntity.type === T.FUELGEN) {
            if (FuelGenPanel.isOpen() && FuelGenPanel.target === dragEntity) FuelGenPanel.close();
            else { FuelGenPanel.close(); CoalGenPanel.close(); RefineryPanel.close(); SolarPanelInspector.close(); FuelGenPanel.open(dragEntity); }
          } else if (dragEntity.type === T.COALGENERATOR) {
            if (CoalGenPanel.isOpen() && CoalGenPanel.target === dragEntity) CoalGenPanel.close();
            else { CoalGenPanel.close(); FuelGenPanel.close(); RefineryPanel.close(); SolarPanelInspector.close(); EntityInfoPanel.close(); CoalGenPanel.open(dragEntity); }
          } else if (dragEntity.type === T.HYDROTURBINE) {
            if (TurbinePanel.isOpen() && TurbinePanel.target === dragEntity) TurbinePanel.close();
            else { TurbinePanel.close(); ShaftGenPanel.close(); ShaftPanel.close(); DamPanel.close(); TurbinePanel.open(dragEntity); }
          } else if (dragEntity.type === T.HYDROGENERATOR) {
            if (ShaftGenPanel.isOpen() && ShaftGenPanel.target === dragEntity) ShaftGenPanel.close();
            else { ShaftGenPanel.close(); TurbinePanel.close(); ShaftPanel.close(); DamPanel.close(); EntityInfoPanel.close(); ShaftGenPanel.open(dragEntity); }
          } else if (dragEntity.type === T.SHAFT) {
            if (ShaftPanel.isOpen() && ShaftPanel.target === dragEntity) ShaftPanel.close();
            else { ShaftPanel.close(); TurbinePanel.close(); ShaftGenPanel.close(); DamPanel.close(); ShaftPanel.open(dragEntity); }
          } else if (dragEntity.type === T.DAM) {
            if (DamPanel.isOpen() && DamPanel.target === dragEntity) DamPanel.close();
            else { DamPanel.close(); TurbinePanel.close(); ShaftGenPanel.close(); ShaftPanel.close(); DamPanel.open(dragEntity); }

          } else if (dragEntity.type === T.COALWASTE || dragEntity.type === T.OILWASTE || dragEntity.type === T.NUCLEARWASTE) {
            if (WastePanel.isOpen() && WastePanel.target === dragEntity) WastePanel.close();
            else { WastePanel.close(); WastePanel.open(dragEntity); }
          } else if (dragEntity.type === T.WIRE || dragEntity.type === T.POLE) {
            // A storm-opened wire opens the same panel as any other: its
            // Repair Wire and Repair All Faults buttons start the work.
            if (WireInspector.isOpen() && WireInspector.target === dragEntity) WireInspector.close();
            else WireInspector.open(dragEntity);
          } else if (dragEntity.type === T.SOLAR) {
            if (SolarPanelInspector.isOpen() && SolarPanelInspector.target === dragEntity) {
              SolarPanelInspector.close();
            } else {
              SolarPanelInspector.close(); InspectionPanel.close();
              SolarPanelInspector.open(dragEntity);
            }
          } else if (dragEntity.type === T.PROTECTOR || dragEntity.type === T.PROTECTOR2 || dragEntity.type === T.PROTECTOR3) {
            if (EntityInfoPanel.isOpen() && EntityInfoPanel.target === dragEntity) EntityInfoPanel.close();
            else EntityInfoPanel.open(dragEntity);
          } else if (dragEntity.type === T.AQUIFER || dragEntity.type === T.WATEREXTRACTOR || dragEntity.type === T.HYDROGENERATOR || dragEntity.type === T.ELECTROLYZER) {
            if (EntityInfoPanel.isOpen() && EntityInfoPanel.target === dragEntity) EntityInfoPanel.close();
            else EntityInfoPanel.open(dragEntity);
          } else if (dragEntity.type === T.RESEARCH || dragEntity.type === T.RESEARCH2 || dragEntity.type === T.RESEARCH3 || dragEntity.type === T.MK4RESEARCH || dragEntity.type === T.MK5RESEARCH) {
            if (InspectionPanel.isOpen() && InspectionPanel.target === dragEntity) {
              InspectionPanel.close();
            } else {
              InspectionPanel.close(); SolarPanelInspector.close();
              InspectionPanel.open(dragEntity);
            }
          }
        }
        // Deselect house/substation if clicking something else
        if (dragEntity.type !== T.HOUSE)       state.selectedHouse = null;
        if (dragEntity.type !== T.SUBSTATION && dragEntity.type !== T.SUBSTATION2 && dragEntity.type !== T.SUBSTATION3 && dragEntity.type !== T.SUBSTATION4 && dragEntity.type !== T.SUBSTATION5)  state.selectedSubstation = null;
        if (dragEntity.type !== T.LIGHTNINGROD && dragEntity.type !== T.LIGHTNINGROD2 && dragEntity.type !== T.LIGHTNINGROD3) state.selectedLightningRod = null;
        if (dragEntity.type !== T.WIRE && dragEntity.type !== T.POLE) WireInspector.close();
      }
    }

    // Reset all drag state
    dragEntity        = null;
    dragStarted       = false;
    state.dragEntity  = null; state.dragOwnLines = null; state.dragFill = false;
    state.dragCanDrop = false;
    mouseDown         = false;
    state.mouseDown   = false;
    state.mouseButton = -1;
    isPanning         = false;
    // Select tool: finish the rubber band (a click without a drag picks, or
    // with Shift toggles, the one item under it), or set the group down.
    if (_selBoxing && _selBoxStart) {
      const s = _selBoxStart, end = screenToTile(lastMouseSX, lastMouseSY);
      const click = end.col === s.col && end.row === s.row && Math.hypot(lastMouseSX - s.sx, lastMouseSY - s.sy) < 6;
      if (click) {
        const t = GridManager.getEntity(s.col, s.row);
        const now = performance.now(), prev = _selLastClick;
        const again = s.shift && t && prev && prev.t === t && now - prev.at < (prev.clicks > 1 ? SEL_TRIPLE_MS : SEL_DOUBLE_MS);
        const clicks = again ? prev.clicks + 1 : 1;
        _selLastClick = s.shift && t ? { t, at: now, clicks, before: again ? prev.before : new Set(_sel) } : null;
        const line = s.shift ? _lineAt(s.col, s.row) : null;
        if (again) {
          // Past the first click: its toggle is taken back.
          _sel.clear();
          for (const e of prev.before) _sel.add(e);
          _selSameAround(t, clicks);
        }
        else if (line) _selToggleLine(line);
        else if (s.shift) { if (_sel.has(t)) _sel.delete(t); else if (_selectable(t)) _sel.add(t); }
        else { _sel.clear(); if (_selectable(t)) _sel.add(t); }
      } else {
        if (!_selBoxAdd) _sel.clear();
        _selAddRect(Math.min(end.col, s.col), Math.min(end.row, s.row), Math.max(end.col, s.col), Math.max(end.row, s.row));
      }
      document.getElementById('select-overlay')?.classList.remove('active');
      _selBoxing = false; _selBoxStart = null; _selBoxAdd = false;
      if (_sel.size) { SFX.click?.(); _selSummary(); }
    }
    if (_selMove) {
      _selCommitMove();
      _selMove = null;
      state.selectionMove = null;
    }
    // Execute zone delete
    if (_zoneDeleteDragging && _zoneDeleteStart && state.selectedTool === 'delete') {
      const _endTile = screenToTile(lastMouseSX, lastMouseSY);
      const minC = Math.min(_endTile.col, _zoneDeleteStart.col);
      const maxC = Math.max(_endTile.col, _zoneDeleteStart.col);
      const minR = Math.min(_endTile.row, _zoneDeleteStart.row);
      const maxR = Math.max(_endTile.row, _zoneDeleteStart.row);
      const sweep = () => {
        const deleted = new Set();
        // Group the whole sweep into a single undo/redo step, the way a
        // blueprint stamp does — one Ctrl+Z should put the zone back, not walk
        // it back one entity per press.
        let _wasteHeld = 0;
        HistoryManager.beginBatch();
        try {
          for (let r = minR; r <= maxR; r++)
            for (let c = minC; c <= maxC; c++) _wasteHeld += _zoneClearTile(c, r, deleted);
        } finally {
          // Always close the batch: leaving it open would swallow every later
          // action into this one entry.
          HistoryManager.endBatch();
        }
        // Paths the box touches go too: they are drawn over the map but
        // aren't on any tile, so the sweep above never saw them.
        const _boxPaths = _pathsInBox(minC * TILE, minR * TILE, (maxC + 1) * TILE, (maxR + 1) * TILE);
        for (const p of _boxPaths) _removePath(p, true);
        if (_boxPaths.length) showToast(`🗑 ${_boxPaths.length === 1 ? (_boxPaths[0].kind === 'saved' ? `"${_boxPaths[0].ref.name}"` : '1 path') : `${_boxPaths.length} paths`} deleted`, '#ff7a7a', '#180800', '#602010');
        if (deleted.size > _wasteHeld || (_boxPaths.length && !deleted.size)) SFX.demolish();
        // Deliberately not "over 25%": the held-back set can now include a
        // truck with cargo aboard, which is blocked at any amount at all.
        if (_wasteHeld > 0) showToast(`⚠ ${_wasteHeld} kept: still holding waste or liquid, empty ${_wasteHeld === 1 ? 'it' : 'them'} first`, '#ff6040', '#140800', '#602010');
      };
      const inArea = [];
      for (let r = minR; r <= maxR; r++)
        for (let c = minC; c <= maxC; c++) { const e = GridManager.getEntity(c, r); if (e) inArea.push(e); }
      askBulkStorage(inArea, sweep);
    }
    // Hide the box even when the sweep didn't run (tool switched mid-drag),
    // or it is left stuck on screen.
    _zoneDeleteCancel();
    // Execute blueprint area select — capture entities under the rectangle
    if (_bpSelectDragging && _bpSelectStart) {
      const _endTile = screenToTile(lastMouseSX, lastMouseSY);
      const minC = Math.min(_endTile.col, _bpSelectStart.col);
      const maxC = Math.max(_endTile.col, _bpSelectStart.col);
      const minR = Math.min(_endTile.row, _bpSelectStart.row);
      const maxR = Math.max(_endTile.row, _bpSelectStart.row);
      BlueprintSystem.captureSelection(minC, minR, maxC, maxR);
      const bpOverlay = document.getElementById('blueprint-select-overlay');
      if (bpOverlay) bpOverlay.classList.remove('active');
      _bpSelectActive = false;
    }
    _bpSelectDragging = false;
    _bpSelectStart    = null;
    // Reset chop progress if mouse released early
    if (_chopTarget) {
      const _ct = GridManager.getEntity(_chopTarget.col, _chopTarget.row);
      if (_ct && _ct.type === T.TREE) _ct._chopProgress = 0;
      _chopTarget = null;
    }
    canvas.style.cursor = _modeCursor();
  });

  canvas.addEventListener('mouseleave', () => {
    // A box or a carried selection leaving the map is dropped, not committed.
    if (_selBoxing || _selMove) {
      _selBoxing = false; _selBoxStart = null; _selMove = null; state.selectionMove = null;
      document.getElementById('select-overlay')?.classList.remove('active');
    }
    // Entity never left the grid — if multi-tile, footprint was removed; restore
    if (dragEntity && dragStarted) {
      dragEntity.col = dragOriginC;
      dragEntity.row = dragOriginR;
      GridManager.setEntityFootprint(dragEntity);
    }
    dragEntity        = null;
    dragStarted       = false;
    state.dragEntity  = null; state.dragOwnLines = null; state.dragFill = false;
    state.dragCanDrop = false;
    mouseDown         = false;
    state.mouseDown   = false;
    state.mouseButton = -1;
    isPanning         = false;
  });
  // Document-wide (not just canvas) — a right-click that opens a DOM overlay
  // mid-press (e.g. PenaltyModal, shown while RMB is still held during a
  // demolish) fires its contextmenu event on that overlay, not the canvas,
  // so a canvas-only listener misses it and Windows' native menu shows through.
  document.addEventListener('contextmenu', e => e.preventDefault());

  // Reset mouseDown if mouse released anywhere outside canvas
  document.addEventListener('mouseup', () => {
    mouseDown = false;
    state.mouseDown = false;
    // Released over the HUD rather than the map: drop the zone delete box
    // (the canvas mouseup has already run and cleared it when over the map).
    _zoneDeleteCancel();
    if (_pipeDrag || _beltDrag) {
      // Where the run actually ended: the axis lock can hold it off the cursor.
      const { col, row } = InputManager._lastPlacedCol != null
        ? { col: InputManager._lastPlacedCol, row: InputManager._lastPlacedRow }
        : screenToTile(lastMouseSX, lastMouseSY);
      _pipeDragEnd(col, row);
      _beltDragEnd(col, row);
    }
  });
  // A plain left click on the map closes the requests panel. Not a drag:
  // panning round to see where an option would go leaves the list up, which
  // is why it does not close on mousedown like the build popups do. Not
  // while a tool is in hand or a relocation is being picked either: those
  // clicks are doing something else.
  let _reqClickAt = null;
  canvas.addEventListener('mouseup', (e) => {
    const at = _reqClickAt; _reqClickAt = null;
    if (!at || e.button !== 0 || Math.hypot(e.clientX - at.x, e.clientY - at.y) > 6) return;
    if (state.selectedTool || (typeof RelocatePicker !== 'undefined' && RelocatePicker.active)) return;
    if (typeof closeRequestsPanel === 'function') closeRequestsPanel();
  });
  canvas.addEventListener('mousedown', (e) => {
    _reqClickAt = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    if (typeof closeCategoryPopup === 'function') closeCategoryPopup();
    const pt = document.getElementById('progress-tracker');
    if (pt && pt.classList.contains('visible')) {
      pt.classList.remove('visible');
      document.getElementById('btn-progress')?.classList.remove('open');
    }
  }, true);

  // Zoom on scroll wheel
  canvas.addEventListener('wheel', e => {
    if (_apocLocked()) { e.preventDefault(); return; }
    const { x: sx, y: sy } = canvasMousePos(e);
    Camera.zoomAt(sx, sy, -e.deltaY);
    e.preventDefault();
  }, { passive: false });

  // True if any tool/panel/popup is active that Escape should close instead
  // of falling through to the pause menu. Shared by this module's own Escape
  // handler and by menu_system.js's capture-phase listener (which fires
  // first and must step aside whenever this is true — see hasEscapeTarget()).
  function _anyPanelOpen() {
    return !!(state.selectedTool
      || _circuitAssignSw
      || openCategoryId
      || InspectionPanel.isOpen?.()
      || SolarPanelInspector.isOpen?.()
      || RefineryPanel.isOpen?.()
      || FuelGenPanel.isOpen?.()
      || CoalGenPanel.isOpen?.()
      || TurbinePanel.isOpen?.()
      || ShaftGenPanel.isOpen?.()
      || ShaftPanel.isOpen?.()
      || DamPanel.isOpen?.()
      || WastePanel.isOpen?.()
      || EntityInfoPanel.isOpen?.()
      || WireInspector.isOpen?.()
      || TruckPatrolPanel.isOpen?.()
      || SavedPathPanel.isOpen?.()
      || (typeof EventsPanel !== 'undefined' && EventsPanel.isOpen())
      || state.selectedHouse
      || state.selectedSubstation
      || state.selectedLightningRod
      || document.getElementById('research-panel')?.classList.contains('visible')
      || document.getElementById('penalty-modal')?.classList.contains('visible'));
  }

  // Held keys set — for smooth keyboard panning in GameLoop
  const heldKeys = new Set();

  // 1-0 are the player's own item hotkeys (ToolHotkeys, hotbar_ui.js): hover
  // an item in a build popup and press a number to bind it, press the number
  // anywhere else to pick that item up. They used to open the build
  // categories (1-5, 0) and the top HUD panels (6-9).
  const _hotkeyDigit = e => /^(Digit|Numpad)[0-9]$/.test(e.code) ? e.code.slice(-1) : null;

  // Letter keys are tracked lower-case so Caps Lock (or Shift) never changes
  // what a key means — and so a key pressed as 'w' and released as 'W'
  // (Caps toggled mid-hold) can't stay stuck "held".
  const _normKey = k => (k && k.length === 1) ? k.toLowerCase() : k;
  document.addEventListener('keydown', e => {
    // Nothing here answers the keyboard over the end of the world, and no
    // tool shortcut has anything left to place. (Escape still reaches the
    // pause menu: menu_system.js takes it in the capture phase, and the
    // sequence holds while the menu is up, see ApocalypseSystem.isHeld.)
    if (_apocBuilt() && !e.target?.matches?.('input, textarea')) {
      if (_apocLocked()) { e.preventDefault(); return; }
      if (e.key === 'Escape' || _hotkeyDigit(e)) { e.preventDefault(); return; }
    }
    heldKeys.add(_normKey(e.key));

    // Tab shows / hides the build bar. Same guards the map used when it
    // owned Tab: leave it alone in text fields, the main menu and modals,
    // where it should keep doing ordinary focus navigation.
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey
        && !e.target.matches?.('input, textarea, [contenteditable]')) {
      const mainMenu = document.getElementById('main-menu');
      const blocked = (mainMenu && !mainMenu.classList.contains('hidden'))
        || ['citynaming-modal', 'options-modal', 'load-game-modal', 'confirm-modal', 'pause-menu']
             .some(id => document.getElementById(id)?.classList.contains('visible'));
      if (!blocked) {
        e.preventDefault();
        if (!e.repeat) { SFX.click(); hotbarTab(); }
        return;
      }
    }

    const _digit = _hotkeyDigit(e);
    if (_digit && !e.ctrlKey && !e.metaKey && !e.altKey
        && !e.target.matches?.('input, textarea, [contenteditable]')) {
      if (!e.repeat) ToolHotkeys.onKey(_digit);
      return;
    }
    if (e.code === 'AltLeft' || e.code === 'AltRight') {
      e.preventDefault();
      document.getElementById('pb-ff')?.click();
    }
    // B toggles blueprint area-select (drag a rectangle to capture a layout)
    if (e.code === 'KeyB' && !e.ctrlKey && !e.metaKey && !e.altKey
        && !e.target.matches('input, textarea') && BlueprintSystem.isUnlocked()) {
      if (BlueprintSystem.isSelecting()) InputManager.setBlueprintSelect(false);
      else BlueprintSystem.beginAreaSelect();
    }
    // Ctrl+C / Ctrl+V copy-paste — part of the Blueprints unlock, so until
    // it's researched both just say so (as the Copy tile does). Each paste
    // charges full price.
    if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyC' || e.code === 'KeyV') && !e.target.matches('input, textarea')) {
      e.preventDefault();
      if (!BlueprintSystem.isUnlocked()) {
        if (!e.repeat) showToast('Copy unlocks with Blueprints', '#ff8040', '#180c00', '#603010');
      } else if (e.code === 'KeyC') {
        // A Select-tool selection up: copy that, rather than drag out a new area.
        _selPrune();
        if (_sel.size) {
          const tops = [..._sel];
          if (!e.repeat) { selDisarm(); BlueprintSystem.copyEntities(tops); }
        } else BlueprintSystem.beginCopySelect();
      } else BlueprintSystem.pasteClipboard();
    }
    if (e.code === 'KeyX' && !e.target.matches('input, textarea')) {
      e.preventDefault();
      _zoneDeleteActive = !_zoneDeleteActive;
      if (_zoneDeleteActive && state.selectedTool !== 'delete') selectTool('delete');
      else if (!_zoneDeleteActive && state.selectedTool === 'delete') selectTool('delete');
    }
if (e.code === 'Space' && !e.target.matches('input, textarea')) {
      e.preventDefault();
      // Behind the pause menu Space would click Play/Pause on the hidden
      // playback bar — changing the speed the game resumes at, and (before
      // DevMode.setSpeed's guard) unpausing the game under the menu.
      if (document.getElementById('pause-menu')?.classList.contains('visible')) return;
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
      if (DevMode.timeScale === 0) {
        // Paused → resume at normal speed
        document.getElementById('pb-play')?.click();
      } else if (DevMode.timeScale === 1) {
        // Normal speed → pause
        document.getElementById('pb-pause')?.click();
      } else {
        // Fast forward → back to normal speed
        document.getElementById('pb-play')?.click();
      }
    }
    if (e.key === 'r' || e.key === 'R') {
      // Blueprint stamp — rotate the ghost layout 90° instead of any
      // tool-specific rotation (there's no selectedTool while stamping).
      if (_bpStampActive) {
        BlueprintSystem.rotateStamp();
        return;
      }
      // Rotate during placement
      // Coal mines (both tiers) build with a rail yard whose OUT stub sits
      // at either end of the bottom row — R flips between them.
      if (state.selectedTool === T.COALMINE || state.selectedTool === T.COALMINE2) {
        state.placementRotation = ((state.placementRotation || 0) + 1) % 4;
      }
      // Only what placementTurns lists turns at all. The process plants, the
      // reactors and the Coal Generator used to; they are built one way round
      // now. The Geothermal Well turns its steam spout N → E → S → W.
      if (state.selectedTool === T.HYDROGENERATOR || state.selectedTool === T.WATEREXTRACTOR || state.selectedTool === T.GEOWELL) {
        state.placementRotation = ((state.placementRotation || 0) + 1) % 4;
      }
      // Gas Holder: its ports stay on the left and right faces; R swaps
      // which side is GAS IN and which is GAS OUT.
      if (state.selectedTool === T.GASSTORAGE) {
        state.placementRotation = (state.placementRotation || 0) === 0 ? 2 : 0;
      }
      // Liquid Storage Tank: flip both stubs left face ↔ right face.
      if (state.selectedTool === T.OILSTORAGE) {
        state.placementRotation = ((state.placementRotation || 0) + 1) % 4;
      }
      // Storage Container: mirror the belt stubs (IN left/OUT right <-> IN right/OUT left).
      if (state.selectedTool === T.SOLIDSTORAGE) {
        state.placementRotation = ((state.placementRotation || 0) + 1) % 4;
      }
      // Uranium / sulfur / lithium mine: flip the OUT stub between the two
      // ends of the rail. (The Lithium Mine always built at the placement
      // rotation, but R never changed it while its own tool was out.)
      if (state.selectedTool === T.URANIUMMINE || state.selectedTool === T.SULFURMINE || state.selectedTool === T.SULFURMINE2 || state.selectedTool === T.LITHIUMMINE || state.selectedTool === T.RAREEARTHMINE) {
        state.placementRotation = ((state.placementRotation || 0) + 1) % 4;
      }
      // Shaft: toggle orientation horizontal ↔ vertical during placement
      if (state.selectedTool === T.SHAFT) {
        state.shaftOrientation = (state.shaftOrientation === 'v') ? 'h' : 'v';
      }
      // Hydro Turbine: turn the drive shaft output N → E → S → W.
      if (state.selectedTool === T.HYDROTURBINE) {
        state.placementRotation = ((state.placementRotation || 0) + 1) % 4;
      }
      // Dam: flip which river bank the reservoir forms on
      if (state.selectedTool === T.DAM) {
        state.placementRotation = ((state.placementRotation || 0) + 1) % 4;
      }
      // Underground pipe: toggle the axis its two open ends run along —
      // only those two ends connect, so a crossing pipe of a different
      // liquid can occupy the perpendicular sides without merging into it.
      if (state.selectedTool === T.UNDERGNDPIPE) {
        state.undergndPipeAxis = (state.undergndPipeAxis === 'v') ? 'h' : 'v';
      }
      if (state.selectedTool === T.UNDERGNDCONVEYOR) {
        state.undergndBeltAxis = (state.undergndBeltAxis === 'v') ? 'h' : 'v';
      }
      if (state.selectedTool === T.CONVEYORSPLITTER) {
        state.splitter = { ...state.splitter, side: ((state.splitter.side || 0) + 1) % 4 };
      }
      // Road / Bridge: toggle vertical ↔ horizontal lane orientation during placement
      if (state.selectedTool === T.ROAD || state.selectedTool === T.BRIDGE) {
        state.placementRotation = ((state.placementRotation || 0) + 1) % 4;
      }
      // Truck: cycle facing direction during placement
      if (state.selectedTool === T.TRUCK || state.selectedTool === T.HAULER) {
        state.placementRotation = ((state.placementRotation || 0) + 1) % 4;
      }
      // Rotate placed buildings: every one in a selection, else the one under the cursor
      if (!state.selectedTool) {
        _selPrune();
        if (_sel.size) {
          let n = 0;
          for (const se of _sel) if (rotatePlaced(se, true)) n++;
          if (n) { PowerNetwork.recomputeWireHops(); SFX.click?.(); }
          showToast(n ? `⟳ Rotated ${n} of ${_sel.size} selected` : '⟳ Nothing in the selection can be rotated',
            '#60d0ff', '#001824', '#1e4a60', 'select-summary');
          return;
        }
        const { col, row } = screenToTile(lastMouseSX, lastMouseSY);
        let hovered = GridManager.getEntity(col, row);
        // Road cells that have a wire/pipe running through them don't point
        // at the road in the grid (it deliberately doesn't claim them so
        // power/pipe connectivity stays intact) — fall back to a bounding-box
        // search so rotation still works when the cursor lands on one of
        // those. Also prefer the topmost (most recently placed) road when
        // multiple roads overlap this tile, same as removal.
        if (!hovered || hovered.type !== T.ROAD) {
          for (const _r of EntityRegistry.getByType(T.ROAD)) {
            if (col >= _r.col && col < _r.col + _r.width && row >= _r.row && row < _r.row + _r.height) {
              hovered = _r;
              break;
            }
          }
        } else {
          hovered = topRoadAt(col, row) || hovered;
        }
        rotatePlaced(hovered, false);
      }

    }
    if (e.key === 'e' || e.key === 'E') {
      // Toggles the highest-tier placed Research Station's panel —
      // dedicated quick-access key, separate from 'R' (rotation) so it
      // never competes with it.
      if (InspectionPanel.isOpen()) InspectionPanel.close();
      else InspectionPanel.openHighestTier();
    }
    if (e.key === 'Enter') {
      // Reliable alternative to double-click for finishing a path — the
      // manual timestamp-based double-click detection in the mousedown
      // handler can miss legitimate double-clicks depending on click
      // cadence/hardware, silently leaving the path uncommitted.
      if (_pathActive) {
        if (_pathWaypoints.length >= 2 && _pathTruck) {
          TruckSystem.setPath(_pathTruck, _pathWaypoints);
          showToast('🛤 Path set: click truck to Start patrol', '#c0a020', '#0e0a00', '#604800');
        } else {
          showToast('Need at least 2 points to set a path', '#a04020', '#0e0400', '#602000');
        }
        _pathActive = false; _pathTruck = null; _pathWaypoints = []; _extendTarget = null;
        state._pathPreview = null; state._pathCursor = null;
      }
      return;
    }
    if (e.key === 'Escape' && typeof RelocatePicker !== 'undefined' && RelocatePicker.active) {
      e.preventDefault();
      RelocatePicker.cancel();
      return;
    }
    if (e.key === 'Escape') {
      // Circuit Switch assignment owns Escape first — it is a transient
      // cursor mode, and leaving it should never also close a panel or
      // open the pause menu.
      if (_circuitAssignSw) {
        e.preventDefault();
        _circuitAssignSw = null;
        canvas.style.cursor = 'default';
        if (typeof EntityInfoPanel !== 'undefined' && EntityInfoPanel.isOpen()) EntityInfoPanel.refresh?.();
        return;
      }
      // World map owns Escape while it's open: close the map and stop here.
      // We call WorldMapSystem.close() directly from this single handler
      // rather than depending on a second, independently-registered keydown
      // listener in worldmap.js to also fire and do it — with two separate
      // document-level listeners there's no guaranteed ordering between them,
      // which is what let the pause menu open (or the map fail to close)
      // depending on registration order. One code path, no race.
      if (typeof WorldMapSystem !== 'undefined' && WorldMapSystem.isOpen) {
        e.preventDefault();
        WorldMapSystem.close();
        return;
      }
      // Same for the contract board: Escape drops back into the game.
      if (typeof ContractSystem !== 'undefined' && ContractSystem.isOpen()) {
        e.preventDefault();
        ContractSystem.closeBoard();
        return;
      }
      // Let a selection go (and put the Select tool away).
      if (_sel.size || _selArmed) {
        e.preventDefault();
        selDisarm();
        return;
      }
      // Cancel active path drawing
      if (_pathActive) {
        _pathActive = false; _pathTruck = null; _pathWaypoints = []; _extendTarget = null;
        state._pathPreview = null; state._pathCursor = null;
        return;
      }
      // Cancel blueprint area-select or stamp-placement mode
      if (_bpSelectActive || _bpStampActive) {
        _bpSelectActive   = false;
        _bpSelectDragging = false;
        _bpSelectStart    = null;
        _bpStampActive    = false;
        BlueprintSystem.cancelStamp();
        const _bpOverlay = document.getElementById('blueprint-select-overlay');
        if (_bpOverlay) _bpOverlay.classList.remove('active');
        return;
      }
      // If a truck is being driven, ESC parks it first
      if (TruckSystem.getDriven()) {
        TruckSystem.stopDriving();
        showToast('🚛 Truck parked', '#60a020', '#080e00', '#204010');
        return;
      }
      // Check if any panel/window is open
      const anyOpen = _anyPanelOpen();

      if (anyOpen) {
        selectTool(null);
        closeCategoryPopup();
        // Escape is an explicit "put everything away", so it closes the
        // requests panel too — closeCategoryPopup() no longer does.
        if (typeof closeRequestsPanel === 'function') closeRequestsPanel();
        InspectionPanel.close?.();
        SolarPanelInspector.close?.();
        RefineryPanel.close?.();
        FuelGenPanel.close?.();
        CoalGenPanel.close?.();
        TurbinePanel.close?.();
        ShaftGenPanel.close?.();
        ShaftPanel.close?.();
        DamPanel.close?.();
        WastePanel.close?.();
        EntityInfoPanel.close?.();
        WireInspector.close?.();
        TruckPatrolPanel.close?.();
        SavedPathPanel.close?.();
        if (typeof EventsPanel !== 'undefined') EventsPanel.close();
        state.selectedHouse = null;
        state.selectedSubstation = null;
        state.selectedLightningRod = null;
        // Close research panel if open
        const rp = document.getElementById('research-panel');
        if (rp?.classList.contains('visible')) rp.classList.remove('visible');
      } else {
        // Nothing open — toggle pause menu
        const pauseEl = document.getElementById('pause-menu');
        if (pauseEl?.classList.contains('visible')) {
          pauseEl.classList.remove('visible');
        } else if (!window.padBackEscape) {   // a controller's B backs out; it doesn't open the menu
          pauseEl?.classList.add('visible');
          const ts = typeof getSaveTimestamp === 'function' ? getSaveTimestamp() : null;
          const timeEl = document.getElementById('pause-save-time');
          if (timeEl) timeEl.textContent = ts ? `Last saved: ${formatDate(ts)}` : 'Not yet saved this session';
        }
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const target = EntityInfoPanel.target;
      if (_sel.size && !e.target?.matches?.('input, textarea')) {
        // A selection is up: Delete removes all of it (Select tool).
        e.preventDefault();
        _selMove = null; state.selectionMove = null;
        selDelete();
      } else if (target && target._irreparable) {
        e.preventDefault();
        askClearWreck(target);
      } else if (target && CUSTOMER_TYPES.has(target.type)) {
        e.preventDefault();
        const base = target.upfrontPaid || (target.dailyFee || 100) * 20;
        const fine = Math.round(base * 0.75);
        PenaltyModal.show({
          title:   'DEMOLISH BUILDING',
          msg:     `Permanently removing this building incurs a demolition penalty of ${formatMoney(fine)} (75% of upfront payment). This cannot be undone.`,
          fine,
          onConfirm() {
            if (!Economy.canAfford(fine)) { flashMessage('Not enough funds!'); return; }
            Economy.spend(fine);
            GridManager.removeEntity(target.col, target.row);
            EntityInfoPanel.close();
            showToast(`✕ Demolished: ${formatMoney(fine)} penalty`, '#ff6040', '#180800', '#602010');
          },
          onCancel() {},
        });
      }
    }

    // Undo / Redo
    // Compared case-insensitively: with Caps Lock on (or Shift held) the key
    // arrives as 'Z'/'Y', which is why Ctrl+Z did nothing with Caps on — and
    // why Ctrl+Shift+Z redo could never match at all.
    const _k = _normKey(e.key);
    if ((e.ctrlKey || e.metaKey) && _k === 'z' && !e.shiftKey) {
      e.preventDefault();
      HistoryManager.undo();
    }
    if ((e.ctrlKey || e.metaKey) && (_k === 'y' || (e.shiftKey && _k === 'z'))) {
      e.preventDefault();
      HistoryManager.redo();
    }

    // C — copy: pick up the tool type of whatever entity is under the cursor
    if (e.key === 'q' || e.key === 'Q') {
      const hovered = GridManager.getEntity(state.hoverCol, state.hoverRow);
      // Tools that place a flagged entity of another type copy back to
      // their own tool: a bridge is a road underneath, a Hauler a truck.
      // (A fork the player has set copies as a plain belt while the placeable
      // splitter is archived.)
      const piece = hovered && hovered.type === T.CONVEYOR ? beltPieceType(hovered) : null;
      const tool = !hovered ? null
        : hovered.type === T.ROAD && hovered._bridge ? T.BRIDGE
        : hovered.type === T.TRUCK && hovered._hauler ? T.HAULER
        : piece ? (CONVEYOR_SPLITTER_ARCHIVED && piece === T.CONVEYORSPLITTER ? T.CONVEYOR : piece)
        : hovered.type;
      if (tool && Progression.isUnlocked(tool)) {
        selectTool(tool);
        // Keep the copied piece's lane direction, so a run carries straight on.
        if (tool === T.ROAD || tool === T.BRIDGE) state.placementRotation = (hovered._rotation || 0) % 2;
        if (tool === T.UNDERGNDCONVEYOR && hovered._udgAxis) state.undergndBeltAxis = hovered._udgAxis;
        if (tool === T.CONVEYORSPLITTER) state.splitter = splitterSettings(hovered);
        if (tool === T.UNDERGNDPIPE && hovered._udgAxis) state.undergndPipeAxis = hovered._udgAxis;
      }
    }
    // Prevent arrow keys scrolling the page
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
  });
  // A release always lets the key go, whatever else has the keyboard. The
  // cinematics (FUSION ACHIEVED, the HQ unveiling, Hyperion's finale) take
  // every key in the capture phase and stop it there, so a camera key held
  // as one began never reached here on release, and the camera panned on
  // by itself after the scene until a reload. Registered on the window in
  // the capture phase, at load, so it runs before any scene's listener.
  // Losing focus (Alt+Tab mid-pan) lets every key go for the same reason.
  window.addEventListener('keyup', e => heldKeys.delete(_normKey(e.key)), true);
  window.addEventListener('blur', () => heldKeys.clear());

  function selectTool(type) {
    const alreadyActive = state.selectedTool === type;
    // Deselecting the pole cancels any active fishing session outright —
    // charging, mid-throw, or waiting on a line. You have to stay on the
    // pole to see a cast through; switching tools bails on it.
    if (state.selectedTool === T.FISHINGPOLE && (alreadyActive || type !== T.FISHINGPOLE)
        && typeof FishingSystem !== 'undefined' && FishingSystem.isActive()) {
      FishingSystem.cancelAll();
    }
    state.selectedTool  = alreadyActive ? null : type;
    // A well's steam spout starts north every time its tool is picked up.
    // placementRotation is shared between tools, so R pressed for a road or
    // a mine used to carry over and build the next well facing east.
    if (state.selectedTool === T.GEOWELL) state.placementRotation = 0;
    // Picking up a build tool puts the Select tool and its selection away.
    if (state.selectedTool && (_selArmed || _sel.size)) { _selArmed = false; selClear(); }
    // Reset zone delete if switching away from delete tool
    if (type !== 'delete' || alreadyActive) _zoneDeleteActive = false;
    canvas.style.cursor = state.selectedTool ? 'crosshair' : 'default';
    if (typeof syncCategoryState === 'function') syncCategoryState();
  }

  // Flash a message near the top
  function flashMessage(msg) {
    try { SFX.error(); } catch(_e) {}
    const el = document.createElement('div');
    el.style.cssText = `
      position:fixed; top:60px; left:50%; transform:translateX(-50%);
      background:#1a0808; border:1px solid #ff4444; color:#ff8888;
      padding:6px 16px; font-size:10px; letter-spacing:2px;
      pointer-events:none; z-index:200;
      animation: fadeOut 1.4s forwards;
    `;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  function tryPoleAt(col, row) {
    const isTower = state.selectedTool === T.POWERTOWER;
    const poleInterval = isTower ? 9 : 4;
    if (!state._poleLastPlaced) state._poleLastPlaced = { col, row };
    const lp = state._poleLastPlaced;
    const dist = Math.abs(col - lp.col) + Math.abs(row - lp.row);
    if (dist >= poleInterval) {
      tryPlace(col, row);
      state._poleLastPlaced = { col, row };
    }
  }

  // Wind turbines dragged out in a row: every one lands on a lattice a
  // footprint wide, counted from the first one of the drag, so the row runs
  // dead straight and edge to edge (touching turbines share a network)
  // however the mouse wobbles. The game loop locks the drag to one axis
  // first (like poles and wire), and every tile it walks snaps to the
  // lattice point it is nearest; each point is built at most once a drag.
  const _WIND_TOOLS = new Set([T.WIND, T.WIND2, T.WIND3]);
  function tryWindAt(col, row) {
    const def = EntityDefs[state.selectedTool] || {};
    const sw = def.width || 1, sh = def.height || 1;
    if (!state._windDrag) state._windDrag = { col, row, done: new Set() };
    const o = state._windDrag;
    const c = o.col + Math.round((col - o.col) / sw) * sw;
    const r = o.row + Math.round((row - o.row) / sh) * sh;
    const key = c + ',' + r;
    if (o.done.has(key)) return;
    o.done.add(key);
    tryPlace(c, r);
  }

  // Drive shafts dragged out in a line: end to end along the placement
  // orientation, every 3 tiles from the first one, each spot built once a
  // drag. The press itself already built the first, so it is only noted here;
  // building every tile the cursor crossed put a second shaft on top of the
  // one just laid and threw "Shaft footprint blocked." after a good placement.
  function tryShaftAt(col, row) {
    if (!state._shaftDrag) { state._shaftDrag = { col, row, done: new Set([col + ',' + row]) }; return; }
    const o = state._shaftDrag;
    const h = (state.shaftOrientation || 'h') === 'h';
    const c = h ? o.col + Math.round((col - o.col) / 3) * 3 : o.col;
    const r = h ? o.row : o.row + Math.round((row - o.row) / 3) * 3;
    const key = c + ',' + r;
    if (o.done.has(key)) return;
    o.done.add(key);
    tryPlace(c, r);
  }

  function _allLake(col, row, w, h) {
    for (let r = row; r < row + h; r++)
      for (let c = col; c < col + w; c++) {
        if (!GridManager.inBounds(c, r)) return false;
        const t = GridManager.getEntity(c, r);
        if (!t || t.type !== T.WATER) return false;
      }
    return true;
  }

  // Water Extractors dragged across a lake: edge to edge on a lattice a
  // footprint wide, counted from the first one, along the axis the game loop
  // locks the drag to. The press already built the first, so it is only noted
  // here. A spot that isn't all lake is skipped quietly, so a drag that runs
  // over the shore or an extractor already there doesn't buzz at every step.
  function tryWaterExtractorAt(col, row) {
    const def = EntityDefs[T.WATEREXTRACTOR];
    const sw = def.width || 4, sh = def.height || 4;
    if (!state._extractorDrag) { state._extractorDrag = { col, row, done: new Set([col + ',' + row]) }; return; }
    const o = state._extractorDrag;
    const c = o.col + Math.round((col - o.col) / sw) * sw;
    const r = o.row + Math.round((row - o.row) / sh) * sh;
    const key = c + ',' + r;
    if (o.done.has(key)) return;
    o.done.add(key);
    if (_allLake(c, r, sw, sh)) tryPlace(c, r);
  }

  // Same interval-spacing pattern as tryPoleAt (pole=4, tower=9) — holding
  // LMB and dragging only drops a new road once you've moved 7 tiles away,
  // instead of one every tile. A single click (tryPlace, unaffected by
  // this) can still overlap freely.
  function tryRoadAt(col, row) {
    const interval = 7;
    if (!state._roadLastPlaced) state._roadLastPlaced = { col, row };
    const lp = state._roadLastPlaced;
    const dist = Math.abs(col - lp.col) + Math.abs(row - lp.row);
    if (dist >= interval) {
      tryPlace(col, row);
      state._roadLastPlaced = { col, row };
    }
  }

  // Bridge drag: pieces go down end to end along the lane axis from the
  // first one, so a run is seamless however the cursor wanders. Moving back
  // along the line places nothing; skipping ahead fills every gap.
  function tryBridgeAt(col, row) {
    const vert = (state.placementRotation || 0) % 2 === 0, S = WaterBuild.SPAN;
    let d = state._bridgeDrag;
    if (!d) {
      // The click itself already placed (or tried) the first piece.
      const o = state._lastBridge || WaterBuild.snapBridge(col, row, state.placementRotation || 0);
      state._bridgeDrag = { col: o.col, row: o.row, done: new Set([0]) };
      return;
    }
    const k = Math.round(vert ? (row - d.row) / S : (col - d.col) / S);
    const step = k > 0 ? 1 : -1;
    for (let i = step; Math.abs(i) <= Math.abs(k); i += step) {
      if (d.done.has(i)) continue;
      d.done.add(i);
      tryPlace(vert ? d.col : d.col + i * S, vert ? d.row + i * S : d.row);
    }
  }

  // frameDt = real seconds since last frame. Progress advances on simulated
  // time (frameDt * timeScale), not wall clock — so chopping is frozen
  // while paused (timeScale 0) and completes proportionally faster while
  // fast-forwarding, instead of always taking the same real-world time.
  function updateChop(frameDt) {
    if (!_chopTarget || !mouseDown || mouseButton !== 2) return;
    if (DevMode.timeScale <= 0) return;  // chopping requires time to be moving
    const ent = GridManager.getEntity(_chopTarget.col, _chopTarget.row);
    if (!ent || (ent.type !== T.TREE && ent.type !== T.BUSH)) { _chopTarget = null; return; }
    const _dur = ent.type === T.BUSH ? 0.8 : CHOP_DURATION;
    const simDt = frameDt * DevMode.timeScale;
    ent._chopProgress = Math.min(1, (ent._chopProgress || 0) + simDt / _dur);
    if (ent._chopProgress >= 1) {
      const isBush = ent.type === T.BUSH;
      const _bf2 = isBush ? BiofuelSystem.rollYield(1, 5) : BiofuelSystem.rollYield(4, 8);
      BiofuelSystem.addFuel(_bf2);
      // Spawn particles at world centre of tile
      const _wx = (_chopTarget.col + 0.5) * TILE;
      const _wy = (_chopTarget.row + 0.5) * TILE;
      Particles.spawn(_wx, _wy, isBush ? '#40c030' : '#8B4513', isBush ? 5 : 6);
      if (!isBush) Particles.spawn(_wx, _wy, '#5a3010', 3);  // extra dark brown for trees
      GridManager.removeEntity(_chopTarget.col, _chopTarget.row);
      if (isBush) SFX.bush(); else SFX.treecut();
      if (BiofuelSystem.hasAnyPlaced()) showToast(`🌿 +${_bf2} biofuel collected`, '#40c040', '#041004', '#204020', 'biofuel-collect');
      _chopTarget = null;
    }
  }

  return {
    state, selectTool, heldKeys, tryPlaceAt: tryPlace, stampPieceCheck, stampWellDeposit, tryPoleAt, tryRoadAt, tryBridgeAt, tryWindAt, tryShaftAt, tryWaterExtractorAt, isWindTool: (t) => _WIND_TOOLS.has(t),
    // Poles are in the set only to keep mousemove off them; their drag runs through tryPoleAt.
    isSingleTargetTool: (t) => NO_DRAG_REPLACE_TOOLS.has(t) && t !== T.POLE, updateChop, askClearWreck,
    centreTile: _centreOnCursor,
    // Mobile: the building panel's Rotate button turns a placed building's
    // stubs the way R does over it (there is no R key on a phone).
    rotatePlacedFromPanel(e) {
      if (!rotatePlaced(e, false)) return false;
      PowerNetwork.recomputeWireHops(); SFX.click?.();
      return true;
    },
    // Circuit Switch roster assignment
    beginCircuitAssign(sw) { _circuitAssignSw = sw; state.selectedTool = null; canvas.style.cursor = 'crosshair'; },
    endCircuitAssign()     { _circuitAssignSw = null; canvas.style.cursor = 'default'; },
    circuitAssignTarget()  { return _circuitAssignSw; },
    get lastMouseSX() { return lastMouseSX; },
    get lastMouseSY() { return lastMouseSY; },
    setZoneDelete(v) { _zoneDeleteActive = v; },
    // Select tool (Function tab): arm / put away, and its pieces for the
    // render loop and HistoryManager's group-move undo.
    armSelect() { if (_selArmed) selDisarm(); else selArm(); },
    disarmSelect: selDisarm,
    get selectArmed() { return _selArmed; },
    deleteSelection: selDelete,
    // The cursor is over something in the selection (a controller's B then
    // deletes the selection instead of letting it go).
    selectionUnderCursor() {
      if (!_sel.size || _selMove || _selBoxing) return false;
      const { col, row } = screenToTile(lastMouseSX, lastMouseSY);
      const t = GridManager.inBounds(col, row) ? GridManager.getEntity(col, row) : null;
      return !!t && _sel.has(t);
    },
    applyGroupMove,
    renderSelection,
    get zoneDeleteActive() { return _zoneDeleteActive; },
    drawDragBoxes: _drawDragBoxes,
    get rmbDeleteDragging() { return rmbDeleteDrag; },
    // A click on the map is doing a job (placing, assigning, drawing a
    // path, picking a spot) rather than dismissing what's open. PanelDismiss
    // leaves panels up for those clicks.
    mapModeActive() {
      return !!(state.selectedTool || _circuitAssignSw || _pathActive || _bpSelectActive || _bpStampActive
        || _selArmed || _sel.size
        || (typeof RelocatePicker !== 'undefined' && RelocatePicker.active)
        || (typeof TruckSystem !== 'undefined' && TruckSystem.getDriven?.()));
    },
    setBlueprintSelect(v, copy = false) {
      _bpSelectActive = v;
      _bpSelectCopy   = v && copy;
      canvas.style.cursor = _modeCursor();
      if (!v) { _bpSelectDragging = false; _bpSelectStart = null;
        const overlay = document.getElementById('blueprint-select-overlay');
        if (overlay) overlay.classList.remove('active');
      }
    },
    get blueprintSelectActive() { return _bpSelectActive; },
    setBlueprintStamp(v) { _bpStampActive = v; canvas.style.cursor = _modeCursor(); },
    get blueprintStampActive() { return _bpStampActive; },
    // Anything Escape should close/cancel here (path drawing, driving a
    // truck, or any tool/panel) before it's allowed to fall through to the
    // pause menu. World map is intentionally excluded — that's already
    // checked directly by name wherever this is consulted.
    hasEscapeTarget() {
      return _pathActive || !!TruckSystem.getDriven() || _anyPanelOpen() || _selArmed || _sel.size > 0
        || (typeof RelocatePicker !== 'undefined' && RelocatePicker.active)
        || (typeof ContractSystem !== 'undefined' && ContractSystem.isOpen());
    },
  };
})();

/* Unlock toast notification */
// Format large numbers with commas: 25000 → "$25,000"


// Returns true if any powered EV Charger exists on the grid
