/* ═══════════════════════════════════════════════════════════════════
   ATMOSPHERE COLLECTOR SYSTEM
   Air → Nitrogen Gas. First building in the Haber-Bosch leg of the fusion
   fuel chain — same shape as ElectrolyzerSystem but with no input
   requirement at all (just power), since it draws from open air rather
   than a piped resource.
   ═══════════════════════════════════════════════════════════════════ */

const AtmosphereCollectorSystem = (() => {
  let totalNitrogenProduced = 0;

  // Footprint is 14×14 (7×7, and 4×4 before that - the resizes — collectors already in a save
  // keep their saved size, and their stub stays at offset 1). Single stub
  // is the tile just outside the output face — mid-face on a 14×14 —
  // rotation-aware like ElectrolyzerSystem.getStubs.
  // rot 0: nitrogen OUT right  (col+w)
  // rot 1: nitrogen OUT bottom (row+h)
  // rot 2: nitrogen OUT left   (col-1)
  // rot 3: nitrogen OUT top    (row-1)
  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || 14, h = e.height || 14;
    const o = w <= 4 ? 1 : Math.floor(w / 2);
    let nitrogenStub;
    if (rot === 0)      nitrogenStub = { c: e.col + w, r: e.row + o };
    else if (rot === 1) nitrogenStub = { c: e.col + o, r: e.row + h };
    else if (rot === 2) nitrogenStub = { c: e.col - 1, r: e.row + o };
    else                nitrogenStub = { c: e.col + o, r: e.row - 1 };
    return { nitrogenStub };
  }

  // Clear nitrogen-active flags for all pipes — called once per tick, right
  // before the per-plant tick loop below recomputes them.
  function clearNitrogenPipeFlags() {
    for (const p of allPipes()) p._nitrogenActive = false;
  }

  return {
    clearNitrogenPipeFlags,
    tick(e, dt) {
      const def = EntityDefs[T.ATMOSCOLLECTOR];
      if (!def) return;

      e._nitrogenPipeOut = false;

      const cap = def.nitrogenCapacity || 3000;
      e._nitrogen = e._nitrogen || 0;

      // Mark nitrogen pipes active — BFS from the nitrogen OUT stub
      if (e._nitrogen > 0 && e.powered) {
        const { nitrogenStub } = getStubs(e);
        const run = pipeRun(nitrogenStub.c, nitrogenStub.r, 'nitrogen');
        // Flagged on whatever is on top of the tile (see ElectrolyzerSystem).
        for (let i = 0; i < run.n; i++) {
          const top = run.top[i];
          top._nitrogenActive = true;
          top._flowRate = def.nitrogenPerSec;
        }
        if (run.n > 0) e._nitrogenPipeOut = true;
      }

      if (!e.powered) return;
      if (e._nitrogen >= cap || e._idleFull) return;

      const produced = def.nitrogenPerSec * dt;
      e._nitrogen = Math.min(cap, e._nitrogen + produced);
      totalNitrogenProduced += produced;
    },
    getTotalNitrogenProduced() { return totalNitrogenProduced; },
    loadTotalNitrogenProduced(v) { if (v !== undefined) totalNitrogenProduced = v; },
    getStubs,
  };
})();
