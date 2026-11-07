/* ═══════════════════════════════════════════════════════════════════
   COKE OVEN SYSTEM
   Coal's late-game outlet: a battery of slot ovens that bakes coal without
   air into coke, and draws off the coke-oven gas — about half hydrogen —
   as a side stream.
     Coal (belt, pushed) → Coke (belt) + Hydrogen Gas (pipe)

   Coal arrives the way it reaches a Coal Generator: Coal Mines and coal
   Storage Containers PUSH it along their belt (CoalSystem.beltTargets lists
   the ovens a belt reaches), generators first, then ovens, then bins. It
   lands in the oven's coal bunker (`_coalBunker`), and the battery bakes
   from that.

   Coke goes out on a belt like any plant's solid (Storage Containers bank
   it). The gas goes out on a pipe and is hydrogen to everything downstream:
   Gas Holders, the Haber-Bosch Complex and the Superconductor Mill take it
   from an oven's GAS OUT exactly as from an Electrolyzer's HYDROGEN OUT.
   A full gas buffer doesn't stop the ovens — a real battery flares what it
   can't use — only a full coke store does.

   Built one way round. All three stubs sit on the bottom face:
     COAL IN (belt) col+1 · COKE OUT (belt) col+8 · GAS OUT (pipe) col+12
   ═══════════════════════════════════════════════════════════════════ */

const CokeOvenSystem = (() => {
  let totalCokeProduced = 0;
  let totalGasProduced  = 0;

  const def = () => EntityDefs[T.COKEOVEN];

  function getStubs(e) {
    const h = e.height || 9;
    return {
      coalIn:  { c: e.col + 1,  r: e.row + h },
      cokeOut: { c: e.col + 8,  r: e.row + h },
      gasOut:  { c: e.col + 12, r: e.row + h },
    };
  }
  const isCoalIn = (e, c, r) => { const s = getStubs(e).coalIn; return s.c === c && s.r === r; };

  // Same rule as LithiumProcessPlantSystem.outputFull: stops when its coke
  // store is full and stays off until the store is down to cokeResumeFrac.
  // Restarting the moment anything was taken had it switching on and off
  // every few ticks whenever its consumer was slower than it is (a furnace
  // takes 0.6/s of its 1.1), flickering the art and the flare, swinging its
  // power draw, and burning coal for coke the full store then threw away.
  function outputFull(e) {
    const d = def(), cap = d.cokeCapacity || 300, have = e._coke || 0;
    if (have >= cap) e._cokeHold = true;
    else if (have <= cap * (d.cokeResumeFrac ?? 0.5)) e._cokeHold = false;
    return !!e._cokeHold;
  }

  function bunkerRoom(e) {
    return Math.max(0, (def().coalCapacity || 45) - (e._coalBunker || 0));
  }

  // Push up to `budget` coal from `src` into `ovens`, split by bunker room.
  // Called by a Coal Mine or a coal Storage Container after its generators
  // have taken theirs. Returns what went in.
  function pushCoal(src, ovens, budget) {
    if (!(budget > 0) || !ovens.length) return 0;
    const withRoom = [];
    let total = 0;
    for (const o of ovens) {
      const room = bunkerRoom(o);
      if (room > 0 && BeltCargo.reach(src, o, 'coal')) { withRoom.push({ o, room }); total += room; }
    }
    if (total <= 0) return 0;
    const give = Math.min(budget, total);
    for (const { o, room } of withRoom) {
      const share = give * (room / total);
      o._coalBunker = (o._coalBunker || 0) + share;
      o._coalInThisTick = (o._coalInThisTick || 0) + share;
      BeltCargo.moved(src, o, 'coal', share);
    }
    return give;
  }

  function clearCokeConveyorFlags() {
    for (const e of EntityRegistry.getByType(T.CONVEYOR)) { e._isCokeConveyor = false; e._cokeConveyorSource = null; }
    for (const e of EntityRegistry.getByType(T.PIPE))     e._isCokeConveyor = false;
  }

  return {
    getStubs, isCoalIn, bunkerRoom, pushCoal, clearCokeConveyorFlags,

    // After the coal pushes (CoalSystem block) and inside the hydrogen block,
    // right after the Electrolyzers' pipe flags were cleared.
    tick(e, dt) {
      const d = def();
      if (!d) return;
      if (e._coalBunker === undefined) e._coalBunker = 0;
      if (e._coke       === undefined) e._coke       = 0;
      if (e._hydrogen   === undefined) e._hydrogen   = 0;
      const { cokeOut, gasOut } = getStubs(e);

      // Smoothed coal intake, for the panel and the COAL IN lamp.
      if (dt > 0) {
        const k = Math.min(1, dt * 2);
        e._coalInRate = (e._coalInRate || 0) + (((e._coalInThisTick || 0) / dt) - (e._coalInRate || 0)) * k;
      }
      e._coalInThisTick = 0;
      e._hasCoal = (e._coalBunker || 0) > 0.01 || (e._coalInRate || 0) > 0.01;

      // Stamp the coke belt unconditionally so a bin or the next plant sees
      // the physical connection on a cold start (LeachPlantSystem's rule).
      markOreBelt(e, cokeOut, e.width || 14, e.height || 9, '_isCokeConveyor', '_cokeConveyorSource', d.cokePerSec);

      // Light the gas line while there is gas to send down it.
      e._gasPipeOut = false;
      if (e._hydrogen > 0 && e.powered) {
        const run = pipeRun(gasOut.c, gasOut.r, 'hydrogen');
        for (let i = 0; i < run.n; i++) { const top = run.top[i]; top._hydrogenActive = true; top._flowRate = d.hydrogenPerSec; }
        if (run.n > 0) e._gasPipeOut = true;
      }

      if (dt <= 0) return;
      e._running = false;
      e._flaring = false;
      e._blockedBy = outputFull(e) ? 'Coke' : null;
      if (!e.powered || e._blockedBy || e._idleFull) return;

      const want = d.coalPerSec * dt;
      const got  = Math.min(want, e._coalBunker || 0);
      if (got <= 1e-9) return;
      const ratio = got / want;
      e._coalBunker -= got;

      const coke = d.cokePerSec * dt * ratio;
      e._coke = Math.min(d.cokeCapacity || 300, e._coke + coke);
      BeltCargo.produced(e, 'coke', coke);
      totalCokeProduced += coke;

      const gas  = d.hydrogenPerSec * dt * ratio;
      const room = (d.hydrogenCapacity || 1000) - e._hydrogen;
      e._hydrogen = Math.min(d.hydrogenCapacity || 1000, e._hydrogen + gas);
      e._flaring  = gas > room + 1e-9;   // the surplus goes up the flare stack
      totalGasProduced += Math.min(gas, Math.max(0, room));

      e._running = true;
    },

    outputFull,
    getTotalCoke()      { return totalCokeProduced; },
    loadTotalCoke(v)    { if (v !== undefined) totalCokeProduced = v; },
    getTotalGas()       { return totalGasProduced; },
    loadTotalGas(v)     { if (v !== undefined) totalGasProduced = v; },
  };
})();

/* ─── Graphitization Furnace ──────────────────────────────────────────
   Coke (belt) → Graphite (belt). An Acheson furnace: coke packed round
   carbon electrodes in a long trough and cooked electrically until its
   carbon reorders into graphite. Pulled off a Coke Oven's COKE OUT or a
   Storage Container banking coke, like any belt-fed plant (_fcBeltFeed).
   Graphite goes to an Advanced Nuclear Reactor's GRAPHITE IN, or banks in
   Storage Containers. A full graphite store stops it.
   Built one way round; both stubs on the bottom face:
     COKE IN (belt) col+1 · GRAPHITE OUT (belt) col+9
   ─────────────────────────────────────────────────────────────────── */
const GraphiteFurnaceSystem = (() => {
  let totalGraphite = 0;
  const def = () => EntityDefs[T.GRAPHITEFURNACE];

  function getStubs(e) {
    const h = e.height || 8;
    return {
      cokeIn:      { c: e.col + 1, r: e.row + h },
      graphiteOut: { c: e.col + 9, r: e.row + h },
    };
  }
  const cokeFeed = (e) => _fcBeltFeed(getStubs(e).cokeIn, 'coke', T.COKEOVEN,
    o => CokeOvenSystem.getStubs(o).cokeOut, '_isCokeConveyor', '_cokeConveyorSource');

  // Stops at full, restarts at graphiteResumeFrac: see CokeOvenSystem.outputFull.
  function outputFull(e) {
    const d = def(), cap = d.graphiteCapacity || 200, have = e._graphite || 0;
    if (have >= cap) e._graphiteHold = true;
    else if (have <= cap * (d.graphiteResumeFrac ?? 0.5)) e._graphiteHold = false;
    return !!e._graphiteHold;
  }

  function clearGraphiteConveyorFlags() {
    for (const e of EntityRegistry.getByType(T.CONVEYOR)) { e._isGraphiteConveyor = false; e._graphiteConveyorSource = null; }
    for (const e of EntityRegistry.getByType(T.PIPE))     e._isGraphiteConveyor = false;
  }

  return {
    getStubs, clearGraphiteConveyorFlags,
    tick(e, dt) {
      const d = def();
      if (!d) return;
      if (e._cokeStock === undefined) e._cokeStock = 0;
      if (e._graphite  === undefined) e._graphite  = 0;
      markOreBelt(e, getStubs(e).graphiteOut, e.width || 12, e.height || 8, '_isGraphiteConveyor', '_graphiteConveyorSource', d.graphitePerSec);
      const feed = cokeFeed(e);
      e._hasCoke = feed.found;
      if (dt <= 0) return;
      e._running = false;
      e._blockedBy = outputFull(e) ? 'Graphite' : null;
      if (!e.powered) return;

      // Pack the trough, a few seconds ahead of the burn.
      const room = (d.cokeCapacity || 60) - e._cokeStock;
      if (feed.found && room > 0) e._cokeStock += _fcBeltDraw(feed, Math.min(room, d.cokePerSec * dt * 4), e, 'coke', '_coke');

      if (e._blockedBy || e._idleFull) return;
      const want = d.cokePerSec * dt;
      const got = Math.min(want, e._cokeStock);
      if (got <= 1e-9) return;
      const ratio = got / want;
      e._cokeStock -= got;
      const made = d.graphitePerSec * dt * ratio;
      e._graphite = Math.min(d.graphiteCapacity || 200, e._graphite + made);
      BeltCargo.produced(e, 'graphite', made);
      totalGraphite += made;
      e._running = true;
    },
    outputFull,
    getTotalGraphite()   { return totalGraphite; },
    loadTotalGraphite(v) { if (v !== undefined) totalGraphite = v; },
  };
})();
