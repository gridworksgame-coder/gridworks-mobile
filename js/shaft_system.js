/* ═══════════════════════════════════════════════════════════════════
   SHAFT SYSTEM
   Drive shaft placement and power transmission from hydro turbines.
   ═══════════════════════════════════════════════════════════════════ */

const ShaftSystem = (() => {

  // Snapshot water under a footprint without destroying it. Like wires/pipes
  // over water: the grid slot is claimed by the shaft, but the live WATER
  // entity stays in EntityRegistry + WaterSystem and is put back on remove.
  function _captureWatersUnder(col, row, w, h) {
    const waterTileState = [];
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        if (!GridManager.inBounds(c, r)) return { ok: false, reason: 'Shaft out of bounds.' };
        const tile = GridManager.getEntity(c, r);
        if (!tile || GridManager.isVegetation(tile)) continue; // vegetation cleared by setEntityFootprint
        if (tile.type === T.WATER) {
          waterTileState.push({
            c, r,
            isRiver: !!tile._isRiver,
            flowDc:  tile._flowDc || 0,
            flowDr:  tile._flowDr || 0,
            reservoirId: tile._reservoirId,
            entity: tile, // live tile — never delete / unregister
          });
          continue;
        }
        return { ok: false, reason: 'Shaft footprint blocked.' };
      }
    }
    return { ok: true, waterTileState };
  }

  function _waterFromCapture(t) {
    // Only a real Entity — see GridManager._restoreWaterUnder.
    if (t.entity instanceof Entity && t.entity.type === T.WATER) return t.entity;
    const w = new Entity(T.WATER, t.c, t.r);
    if (t.isRiver) {
      w._isRiver = true;
      w._flowDc = t.flowDc; w._flowDr = t.flowDr;
    }
    if (t.reservoirId !== undefined) w._reservoirId = t.reservoirId;
    t.entity = w;
    return w;
  }

  // Put captured water entities back onto empty grid cells. Idempotent.
  function _restoreWaters(waterTiles) {
    if (!waterTiles || !waterTiles.length) return;
    for (const t of waterTiles) {
      if (!GridManager.inBounds(t.c, t.r)) continue;
      if (GridManager.tiles[t.r][t.c]) continue;
      const w = _waterFromCapture(t);
      GridManager.tiles[t.r][t.c] = w;
      EntityRegistry.add(w);
      if (typeof WaterSystem !== 'undefined' && WaterSystem._register && !WaterSystem.isWater(t.c, t.r)) {
        WaterSystem._register(t.c, t.r);
      }
    }
  }

  // ── Try to place a shaft at (col,row) with given orientation
  // orientation: 'h' = 3 wide x 1 tall, 'v' = 1 wide x 3 tall
  function buildShaft(col, row, orientation = 'h') {
    const w = orientation === 'h' ? 3 : 1;
    const h = orientation === 'h' ? 1 : 3;
    const cap = _captureWatersUnder(col, row, w, h);
    if (!cap.ok) return cap;
    const e = new Entity(T.SHAFT, col, row);
    e.width  = w;
    e.height = h;
    e._orientation  = orientation;
    e._rotationRate = 0;
    e._sourceTurbine = null;
    e._waterTiles = cap.waterTileState; // live refs; grid slot only is claimed
    GridManager.setEntityFootprint(e);
    return { ok: true, entity: e };
  }

  // ── Would buildShaft succeed here? (the placement ghost asks)
  function canBuildShaft(col, row, orientation = 'h') {
    return _captureWatersUnder(col, row, orientation === 'h' ? 3 : 1, orientation === 'h' ? 1 : 3).ok;
  }

  // ── Restore water tiles when a shaft is removed
  function onShaftRemoved(shaft) {
    if (!shaft || shaft.type !== T.SHAFT) return;
    _restoreWaters(shaft._waterTiles);
  }

  // ── Get the two endpoints of a shaft (start tile, end tile)
  function endpoints(shaft) {
    if (shaft._orientation === 'h') {
      return [
        { c: shaft.col, r: shaft.row },                       // left end
        { c: shaft.col + 2, r: shaft.row },                   // right end
      ];
    } else {
      return [
        { c: shaft.col, r: shaft.row },                       // top end
        { c: shaft.col, r: shaft.row + 2 },                   // bottom end
      ];
    }
  }

  // ── Walk a chain from a turbine output, propagating rotation rate.
  //    Marks each shaft with _sourceTurbine and _rotationRate.
  function propagateFromTurbine(turbine) {
    if (!turbine || turbine.type !== T.HYDROTURBINE) return;
    const dc = turbine._outSideDc, dr = turbine._outSideDr;
    const fpC = turbine.col, fpR = turbine.row, fpW = turbine.width, fpH = turbine.height;
    let portC, portR;
    if (dc !== 0) {
      portC = dc > 0 ? fpC + fpW : fpC - 1;
      portR = fpR + Math.floor(fpH / 2);
    } else {
      portC = fpC + Math.floor(fpW / 2);
      portR = dr > 0 ? fpR + fpH : fpR - 1;
    }
    // The shaft directly at the output port
    let shaft = GridManager.getEntity(portC, portR);
    if (!shaft || shaft.type !== T.SHAFT) return;

    const rate = turbine._rotationRate || 0;
    const visited = new Set();
    let current = shaft;
    let prevExitC = portC, prevExitR = portR;
    // A burning shaft doesn't carry rotation — the chain stops at it.
    while (current && current.type === T.SHAFT && !visited.has(current) && !current._lightningDamaged) {
      visited.add(current);
      current._sourceTurbine = turbine;
      current._rotationRate = rate;
      // Determine the OUT end of this shaft (the one farther from prevExit)
      const [a, b] = endpoints(current);
      // Whichever endpoint matches the entry tile is the "in" end
      let inEnd, outEnd;
      if (a.c === prevExitC && a.r === prevExitR) { inEnd = a; outEnd = b; }
      else if (b.c === prevExitC && b.r === prevExitR) { inEnd = b; outEnd = a; }
      else {
        // First shaft: prevExit was the port. Take the closer endpoint as inEnd.
        const da = Math.abs(a.c - prevExitC) + Math.abs(a.r - prevExitR);
        const db = Math.abs(b.c - prevExitC) + Math.abs(b.r - prevExitR);
        if (da <= db) { inEnd = a; outEnd = b; } else { inEnd = b; outEnd = a; }
      }
      // Next tile beyond the outEnd in the same direction
      const stepC = outEnd.c - inEnd.c;
      const stepR = outEnd.r - inEnd.r;
      const nextC = outEnd.c + Math.sign(stepC);
      const nextR = outEnd.r + Math.sign(stepR);
      prevExitC = outEnd.c; prevExitR = outEnd.r;
      const next = GridManager.getEntity(nextC, nextR);
      if (!next || next.type !== T.SHAFT) break;
      // Only chain if alignment is consistent (allow direction change at corners)
      current = next;
    }
  }

  // ── Per-tick: reset all shafts then propagate from each turbine,
  //    then drive any Hydroelectric Generator whose input port is touched
  //    by a shaft carrying rotation.
  function tick(dt) {
    const shafts = EntityRegistry.getByType(T.SHAFT);
    for (const s of shafts) {
      s._sourceTurbine = null;
      s._rotationRate = 0;
    }
    const turbines = EntityRegistry.getByType(T.HYDROTURBINE);
    for (const tb of turbines) {
      propagateFromTurbine(tb);
    }
    // Drive hydrogenerators
    const gens = EntityRegistry.getByType(T.HYDROGENERATOR);
    for (const g of gens) {
      if (g.def === EntityDefs[T.HYDROGENERATOR]) g.def = { ...EntityDefs[T.HYDROGENERATOR] };
      const dc = g._inSideDc || 0, dr = g._inSideDr || 0;
      let portC, portR;
      if (dc !== 0) {
        portC = dc > 0 ? g.col + g.width : g.col - 1;
        portR = g.row + Math.floor(g.height / 2);
      } else if (dr !== 0) {
        portC = g.col + Math.floor(g.width / 2);
        portR = dr > 0 ? g.row + g.height : g.row - 1;
      } else {
        // Legacy hydrogen with no input side set — leave as-is (no shaft drive)
        g._shaftRate = 0;
        continue;
      }
      const inShaft = GridManager.getEntity(portC, portR);
      if (inShaft && inShaft.type === T.SHAFT && inShaft._rotationRate > 0) {
        g._shaftRate = inShaft._rotationRate;
        g._headFactor = inShaft._sourceTurbine?._headFactor || 1;   // valley head behind the dam
        g.def.powerOutput = Math.round(EntityDefs[T.HYDROGENERATOR].powerOutput * Math.min(1, inShaft._rotationRate) * g._headFactor);
      } else {
        g._shaftRate = 0;
        g.def.powerOutput = 0;
      }
    }
  }

  // ── Rotate a shaft entity (R key) — swap orientation
  function rotateShaft(shaft) {
    if (!shaft || shaft.type !== T.SHAFT) return false;
    const col = shaft.col, row = shaft.row;
    const oldOri = shaft._orientation;
    const oldW = shaft.width, oldH = shaft.height;
    const oldWaters = shaft._waterTiles;
    const newOri = oldOri === 'h' ? 'v' : 'h';
    const newW = newOri === 'h' ? 3 : 1;
    const newH = newOri === 'h' ? 1 : 3;
    // Lift footprint and put captured water back — do not wipe the capture
    // list; we need it if the new orientation is blocked.
    for (let r = row; r < row + oldH; r++)
      for (let c = col; c < col + oldW; c++)
        if (GridManager.inBounds(c, r) && GridManager.tiles[r][c] === shaft)
          GridManager.tiles[r][c] = null;
    EntityRegistry.remove(shaft);
    _restoreWaters(oldWaters);

    const cap = _captureWatersUnder(col, row, newW, newH);
    if (!cap.ok) {
      shaft._orientation = oldOri;
      shaft.width = oldW; shaft.height = oldH;
      shaft._waterTiles = oldWaters || [];
      GridManager.setEntityFootprint(shaft);
      return false;
    }
    shaft._orientation = newOri;
    shaft.width  = newW;
    shaft.height = newH;
    shaft._waterTiles = cap.waterTileState;
    GridManager.setEntityFootprint(shaft);
    return true;
  }

  return {
    buildShaft, canBuildShaft, rotateShaft, tick,
    propagateFromTurbine,
    onShaftRemoved,
  };
})();
