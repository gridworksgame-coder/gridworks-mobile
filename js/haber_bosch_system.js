/* ═══════════════════════════════════════════════════════════════════
   HABER-BOSCH COMPLEX SYSTEM
   Nitrogen Gas (from Atmosphere Collector) + Hydrogen Gas (from
   Electrolyzer) → Ammonia Gas. Two gas pipe-network inputs, each found via
   a BFS walk filtered by fluid type — same shape as FuelPlantSystem's
   hasAcidPipe (nuclear_chain_systems.js), used twice.
   ═══════════════════════════════════════════════════════════════════ */

const HaberBoschSystem = (() => {
  let totalAmmoniaProduced = 0;

  // Footprint is 22×20 (11×10, and 6×5 before that - the resizes — complexes already in a
  // save keep their saved size and the old 1/3/2 offsets). Nitrogen IN +
  // Hydrogen IN share one face, Ammonia OUT sits mid-face opposite. Offsets
  // run along the input face, so a 90°/270° placement (axis-swapped
  // footprint) reads them as columns.
  // rot 0: nitrogen/hydrogen IN left   (col-1), ammonia OUT right  (col+w)
  // rot 1: nitrogen/hydrogen IN top    (row-1), ammonia OUT bottom (row+h)
  // rot 2: nitrogen/hydrogen IN right  (col+w), ammonia OUT left   (col-1)
  // rot 3: nitrogen/hydrogen IN bottom (row+h), ammonia OUT top    (row-1)
  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || 22, h = e.height || 20;
    const face = (rot % 2) ? w : h;   // length of the input/output faces
    const [oN, oH, oA] = face <= 5 ? [1, 3, 2] : [2, face - 3, Math.floor(face / 2)];
    let nitrogenIn, hydrogenIn, ammoniaOut;
    if (rot === 0) {
      nitrogenIn = { c: e.col - 1, r: e.row + oN };
      hydrogenIn = { c: e.col - 1, r: e.row + oH };
      ammoniaOut = { c: e.col + w, r: e.row + oA };
    } else if (rot === 1) {
      nitrogenIn = { c: e.col + oN, r: e.row - 1 };
      hydrogenIn = { c: e.col + oH, r: e.row - 1 };
      ammoniaOut = { c: e.col + oA, r: e.row + h };
    } else if (rot === 2) {
      nitrogenIn = { c: e.col + w, r: e.row + oN };
      hydrogenIn = { c: e.col + w, r: e.row + oH };
      ammoniaOut = { c: e.col - 1, r: e.row + oA };
    } else {
      nitrogenIn = { c: e.col + oN, r: e.row + h };
      hydrogenIn = { c: e.col + oH, r: e.row + h };
      ammoniaOut = { c: e.col + oA, r: e.row - 1 };
    }
    return { nitrogenIn, hydrogenIn, ammoniaOut };
  }

  function findGasSource(startStub, fluid, sourceType, sourceBufferKey) {
    // Nothing to draw until the gas has visibly run down the line to this IN.
    if (!pipeArrivedAt(startStub.c, startStub.r, fluid)) return { found: false };
    const run = pipeRun(startStub.c, startStub.r, fluid);
    for (let j = 0; j < run.pn; j++) {
      const nb = run.pe[j], c = run.ptc[j], r = run.ptr[j];
      // Only through the producer's own gas OUT stub (see atOutPort).
      // A Coke Oven's GAS OUT is hydrogen too.
      const out = (fluid === 'hydrogen' && nb.type === T.COKEOVEN) ? CokeOvenSystem.getStubs(nb).gasOut
                : nb.type !== sourceType ? null
                : sourceType === T.ATMOSCOLLECTOR ? AtmosphereCollectorSystem.getStubs(nb).nitrogenStub
                : sourceType === T.ELECTROLYZER   ? ElectrolyzerSystem.getStubs(nb).hydrogenStub
                : null;
      if (out && atOutPort(out, c, r) && (nb[sourceBufferKey] || 0) > 0 && nb.powered) return { found: true, source: nb };
      // A Gas Holder banks the gas in the same field, so it's drawn the same way.
      if (GasStorageSystem.isSourceOf(nb, fluid, c, r)) return { found: true, source: nb };
    }
    return { found: false };
  }

  function hasNitrogenPipe(e) {
    const { nitrogenIn } = getStubs(e);
    return findGasSource(nitrogenIn, 'nitrogen', T.ATMOSCOLLECTOR, '_nitrogen');
  }

  function hasHydrogenPipe(e) {
    const { hydrogenIn } = getStubs(e);
    return findGasSource(hydrogenIn, 'hydrogen', T.ELECTROLYZER, '_hydrogen');
  }

  // Clear ammonia-active flags for all pipes — called once per tick, right
  // before the per-plant tick loop below recomputes them.
  function clearAmmoniaPipeFlags() {
    for (const p of allPipes()) p._ammoniaActive = false;
  }

  return {
    clearAmmoniaPipeFlags,
    tick(e, dt) {
      const def = EntityDefs[T.HABERBOSCH];
      if (!def) return;

      e._ammoniaPipeOut = false;

      const cap = def.ammoniaCapacity || 3000;
      e._ammonia = e._ammonia || 0;

      const nitrogenResult = hasNitrogenPipe(e);
      const hydrogenResult = hasHydrogenPipe(e);
      e._hasNitrogen = nitrogenResult.found;
      e._hasHydrogen = hydrogenResult.found;

      // Mark ammonia pipes active — BFS from the ammonia OUT stub
      if (e._ammonia > 0 && e.powered) {
        const { ammoniaOut } = getStubs(e);
        const run = pipeRun(ammoniaOut.c, ammoniaOut.r, 'ammonia');
        // Flagged on whatever is on top of the tile (see ElectrolyzerSystem).
        for (let i = 0; i < run.n; i++) {
          const top = run.top[i];
          top._ammoniaActive = true;
          top._flowRate = def.ammoniaPerSec;
        }
        if (run.n > 0) e._ammoniaPipeOut = true;
      }

      if (!e.powered || !e._hasNitrogen || !e._hasHydrogen) return;
      if (e._ammonia >= cap || e._idleFull) return;

      // Both gas sources hard-gated above — drain directly from each,
      // same as FuelPlantSystem draining acidResult.source._acid.
      const nitrogenNeed = def.nitrogenPerSec * dt;
      const hydrogenNeed = def.hydrogenPerSec * dt;
      if ((nitrogenResult.source._nitrogen || 0) < nitrogenNeed) return;
      if ((hydrogenResult.source._hydrogen || 0) < hydrogenNeed) return;
      nitrogenResult.source._nitrogen -= nitrogenNeed;
      hydrogenResult.source._hydrogen -= hydrogenNeed;

      const produced = def.ammoniaPerSec * dt;
      e._ammonia = Math.min(cap, e._ammonia + produced);
      totalAmmoniaProduced += produced;
    },
    getTotalAmmoniaProduced() { return totalAmmoniaProduced; },
    loadTotalAmmoniaProduced(v) { if (v !== undefined) totalAmmoniaProduced = v; },
    getStubs,
  };
})();
