/* ═══════════════════════════════════════════════════════════════════
   ISOTOPIC WASH TOWER SYSTEM
   Water (pipe, direct-adjacency aquifer feed) + Ammonia Gas (catalyst,
   drawn from a connected Haber-Bosch Complex via pipe-network BFS) →
   Deuterium Gas. The ammonia catalyst is recycled back into the tower
   loop per spec, so it's a presence gate on the source's buffer rather
   than a net drain — same BFS-with-fluid-filter shape as
   HaberBoschSystem.findGasSource, just without withdrawing anything.
   ═══════════════════════════════════════════════════════════════════ */

const IsotopicWashTowerSystem = (() => {
  let totalDeuteriumProduced = 0;

  // Footprint is 20×20 (10×10, and 5×5 before that - the resizes — towers already in a save
  // keep their saved size and the old 1/3/2 offsets). Water IN + Ammonia
  // catalyst IN share one face, Deuterium OUT sits mid-face opposite.
  // rot 0: water/ammonia IN left   (col-1), deuterium OUT right  (col+w)
  // rot 1: water/ammonia IN top    (row-1), deuterium OUT bottom (row+h)
  // rot 2: water/ammonia IN right  (col+w), deuterium OUT left   (col-1)
  // rot 3: water/ammonia IN bottom (row+h), deuterium OUT top    (row-1)
  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || 20, h = e.height || 20;
    const face = (rot % 2) ? w : h;
    const [oW, oA, oD] = face <= 5 ? [1, 3, 2] : [2, face - 3, Math.floor(face / 2)];
    let waterIn, ammoniaIn, deuteriumOut;
    if (rot === 0) {
      waterIn      = { c: e.col - 1, r: e.row + oW };
      ammoniaIn    = { c: e.col - 1, r: e.row + oA };
      deuteriumOut = { c: e.col + w, r: e.row + oD };
    } else if (rot === 1) {
      waterIn      = { c: e.col + oW, r: e.row - 1 };
      ammoniaIn    = { c: e.col + oA, r: e.row - 1 };
      deuteriumOut = { c: e.col + oD, r: e.row + h };
    } else if (rot === 2) {
      waterIn      = { c: e.col + w, r: e.row + oW };
      ammoniaIn    = { c: e.col + w, r: e.row + oA };
      deuteriumOut = { c: e.col - 1, r: e.row + oD };
    } else {
      waterIn      = { c: e.col + oW, r: e.row + h };
      ammoniaIn    = { c: e.col + oA, r: e.row + h };
      deuteriumOut = { c: e.col + oD, r: e.row - 1 };
    }
    return { waterIn, ammoniaIn, deuteriumOut };
  }

  function hasWaterPipe(e, def) {
    const { waterIn } = getStubs(e);
    const nb = GridManager.getEntity(waterIn.c, waterIn.r);
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
      return !!(port && port.c === waterIn.c && port.r === waterIn.r);
    }
    return false;
  }

  // Presence gate only — the tower draws on the catalyst without net
  // depletion, so this never withdraws from the source's ammonia buffer.
  function hasAmmoniaCatalyst(e) {
    const { ammoniaIn } = getStubs(e);
    // Not until the ammonia has visibly run down the line to AMMONIA IN.
    if (!pipeArrivedAt(ammoniaIn.c, ammoniaIn.r, 'ammonia')) return false;
    const run = pipeRun(ammoniaIn.c, ammoniaIn.r, 'ammonia');
    for (let j = 0; j < run.pn; j++) {
      const nb = run.pe[j], c = run.ptc[j], r = run.ptr[j];
      if (nb.type === T.HABERBOSCH && (nb._ammonia || 0) > 0 && nb.powered
          && atOutPort(HaberBoschSystem.getStubs(nb).ammoniaOut, c, r)) return true;
      if (GasStorageSystem.isSourceOf(nb, 'ammonia', c, r)) return true;
    }
    return false;
  }

  // Clear deuterium-active flags for all pipes — called once per tick,
  // right before the per-plant tick loop below recomputes them.
  function clearDeuteriumPipeFlags() {
    for (const p of allPipes()) p._deuteriumActive = false;
  }

  return {
    clearDeuteriumPipeFlags,
    tick(e, dt) {
      const def = EntityDefs[T.WASHTOWER];
      if (!def) return;

      e._deuteriumPipeOut = false;

      const cap = def.deuteriumCapacity || 1000;
      e._deuterium = e._deuterium || 0;

      e._waterConnected  = hasWaterPipe(e, def);
      e._hasAmmonia       = hasAmmoniaCatalyst(e);

      if (e.powered && e._waterConnected && e._hasAmmonia && e._deuterium < cap && !e._idleFull) {
        const produced = def.deuteriumPerSec * dt;
        e._deuterium = Math.min(cap, e._deuterium + produced);
        totalDeuteriumProduced += produced;
      }

      // Mark deuterium pipes active — BFS from the deuterium OUT stub.
      // After production, not before: a Fuel Plant drawing the whole output
      // empties the buffer every tick, so checked first it always read 0 and
      // the out line drew dry while the tower was washing at full rate.
      if (e._deuterium > 0 && e.powered) {
        const { deuteriumOut } = getStubs(e);
        const run = pipeRun(deuteriumOut.c, deuteriumOut.r, 'deuterium');
        // Flagged on whatever is on top of the tile (see ElectrolyzerSystem).
        for (let i = 0; i < run.n; i++) {
          const top = run.top[i];
          top._deuteriumActive = true;
          top._flowRate = def.deuteriumPerSec;
        }
        if (run.n > 0) e._deuteriumPipeOut = true;
      }
    },
    getTotalDeuteriumProduced() { return totalDeuteriumProduced; },
    loadTotalDeuteriumProduced(v) { if (v !== undefined) totalDeuteriumProduced = v; },
    getStubs,
  };
})();
