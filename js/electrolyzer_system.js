/* ═══════════════════════════════════════════════════════════════════
   ELECTROLYZER SYSTEM
   Water → Hydrogen Gas. First building in the fusion fuel chain — same
   pipe-connectivity shape as ChemicalSystem (nuclear_chain_systems.js)
   but with only two pipe stubs (water IN, hydrogen OUT) and no conveyor.
   ═══════════════════════════════════════════════════════════════════ */

const ElectrolyzerSystem = (() => {
  let totalHydrogenProduced = 0;

  // Footprint is 8×22 (4×11, and 3×8 before that - the resizes — electrolyzers already in a
  // save keep their saved size). Read off the entity rather than hardcoded,
  // so either size — and the axis-swapped footprint of a 90°/270° placement
  // — puts the stubs on faces the building actually has. Stubs are the
  // tiles just outside each face, opposite one another so the pipe run
  // doesn't have to double back.
  // rot 0: water IN left   (col-1, row+1), hydrogen OUT right  (col+w, row+h-2)
  // rot 1: water IN top    (row-1, col+1), hydrogen OUT bottom (row+h, col+w-2)
  // rot 2: water IN right  (col+w, row+1), hydrogen OUT left   (col-1, row+h-2)
  // rot 3: water IN bottom (row+h, col+1), hydrogen OUT top    (row-1, col+w-2)
  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || 8, h = e.height || 22;
    let waterStub, hydrogenStub;
    if (rot === 0) {
      waterStub    = { c: e.col - 1, r: e.row + 1 };
      hydrogenStub = { c: e.col + w, r: e.row + h - 2 };
    } else if (rot === 1) {
      waterStub    = { c: e.col + 1,     r: e.row - 1 };
      hydrogenStub = { c: e.col + w - 2, r: e.row + h };
    } else if (rot === 2) {
      waterStub    = { c: e.col + w, r: e.row + 1 };
      hydrogenStub = { c: e.col - 1, r: e.row + h - 2 };
    } else {
      waterStub    = { c: e.col + 1,     r: e.row + h };
      hydrogenStub = { c: e.col + w - 2, r: e.row - 1 };
    }
    return { waterStub, hydrogenStub };
  }

  function hasWaterPipe(e, def) {
    const { waterStub } = getStubs(e);
    const nb = GridManager.getEntity(waterStub.c, waterStub.r);
    if (!nb) return false;
    if (isPipe(nb)) {
      // Only a pipe actually carrying water counts — one fed by a powered
      // Water Extractor or a Liquid Storage Tank that holds water
      // (PowerNetwork.updatePipeConnectivity). A dry run, or one from an
      // empty tank, used to count as connected all the same.
      if (pipeCurrentFluid(getPipe(nb) || nb) !== 'water') return false;
      nb._waterFlowActive = true;
      nb._flowRate = def.waterPerSec;
      // ...and only once the water has run down the line to this stub.
      return pipeArrived(nb, 'water');
    }
    // Direct adjacency to a water extractor only counts if this IN stub is
    // exactly the extractor's rotatable output port tile.
    if (nb.type === T.WATEREXTRACTOR) {
      const port = HydroSystem.extractorOutputPort(nb);
      return !!(port && port.c === waterStub.c && port.r === waterStub.r);
    }
    return false;
  }

  // Clear hydrogen-active flags for all pipes — called once per tick, right
  // before the per-plant tick loop below recomputes them.
  function clearHydrogenPipeFlags() {
    for (const p of allPipes()) p._hydrogenActive = false;
  }

  return {
    clearHydrogenPipeFlags,
    tick(e, dt) {
      const def = EntityDefs[T.ELECTROLYZER];
      if (!def) return;

      e._waterConnected = hasWaterPipe(e, def);
      e._hydrogenPipeOut = false;

      const cap = def.hydrogenCapacity || 300;
      e._hydrogen = e._hydrogen || 0;

      // Mark hydrogen pipes active — BFS from the hydrogen OUT stub
      if (e._hydrogen > 0 && e.powered) {
        const { hydrogenStub } = getStubs(e);
        const run = pipeRun(hydrogenStub.c, hydrogenStub.r, 'hydrogen');
        // Flagged on whatever is on top of the tile (the wire or belt over a
        // stacked pipe), as this always has been.
        for (let i = 0; i < run.n; i++) {
          const top = run.top[i];
          top._hydrogenActive = true;
          top._flowRate = def.hydrogenPerSec;
        }
        if (run.n > 0) e._hydrogenPipeOut = true;
      }

      if (!e.powered || !e._waterConnected) return;
      if (e._hydrogen >= cap || e._idleFull) return;

      const produced = def.hydrogenPerSec * dt;
      e._hydrogen = Math.min(cap, e._hydrogen + produced);
      totalHydrogenProduced += produced;
    },
    getTotalHydrogenProduced() { return totalHydrogenProduced; },
    loadTotalHydrogenProduced(v) { if (v !== undefined) totalHydrogenProduced = v; },
    getStubs,
  };
})();
