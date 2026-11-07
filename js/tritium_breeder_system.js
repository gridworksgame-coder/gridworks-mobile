/* ═══════════════════════════════════════════════════════════════════
   TRITIUM BREEDING FACILITY SYSTEM
   Lithium Compound (conveyor, from a Lithium Processing Plant) → Tritium
   (pipe, to a Fusion Fuel Plant's TRITIUM IN). An accelerator-driven
   breeder: a linear accelerator fires protons into a heavy-metal target,
   and the spallation neutrons turn the lithium blanket around it into
   tritium — the scheme the US planned at Savannah River in the 1990s
   (Accelerator Production of Tritium). It needs no reactor, which is the
   point: it starts the D-T loop before a Fusion Reactor exists.

   The catch is the accelerator's appetite for power, and a rate a quarter
   of what a reactor at full burn needs. It gets you your first pellets;
   the Fusion Reactor's own breeding blanket is what runs D-T for real,
   after which this can be switched off to give its power back.
   ═══════════════════════════════════════════════════════════════════ */

const TritiumBreederSystem = (() => {
  let totalTritiumBred = 0;

  // Same stub convention as He3SeparatorSystem.getStubs (and the sprite's
  // _plantFrame): LITHIUM IN mid left face (a conveyor), TRITIUM OUT mid
  // right face (a pipe), in the unrotated frame.
  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width  || EntityDefs[T.TRITIUMBREEDER].width;
    const h = e.height || EntityDefs[T.TRITIUMBREEDER].height;
    const face = (rot % 2) ? w : h;
    const o = Math.floor(face / 2);
    let compoundIn, tritiumOut;
    if (rot === 0)      { compoundIn = { c: e.col - 1, r: e.row + o }; tritiumOut = { c: e.col + w, r: e.row + o }; }
    else if (rot === 1) { compoundIn = { c: e.col + o, r: e.row - 1 }; tritiumOut = { c: e.col + o, r: e.row + h }; }
    else if (rot === 2) { compoundIn = { c: e.col + w, r: e.row + o }; tritiumOut = { c: e.col - 1, r: e.row + o }; }
    else                { compoundIn = { c: e.col + o, r: e.row + h }; tritiumOut = { c: e.col + o, r: e.row - 1 }; }
    return { compoundIn, tritiumOut };
  }

  // Lithium Compound on the LITHIUM IN belt — the same walk the Fusion
  // Reactor's blanket uses (HulkingFusionReactorSystem.findBlanketSources):
  // back along compound-flagged belt to a Processing Plant with compound
  // banked, or a Storage Container banking compound.
  //
  // Every source on the belt, nearest first. The tick draws from the first
  // whose stream has reached this facility (BeltCargo.reach), the way a
  // Processing Plant works through the mines on its ore belt — taking only
  // the first found left it waiting on a plant that had a little compound
  // banked but whose stream never got through, while another source on the
  // same belt was delivering.
  function findCompoundSources(e) {
    const { compoundIn } = getStubs(e);
    const run = beltRun(compoundIn.c, compoundIn.r, '_isLithiumCompoundConveyor');
    const out = [];
    for (let _i = 0; _i < run.n; _i++) {
      const ent = run.ent[_i], _p = run.par[_i];
      const pc = _p < 0 ? null : run.c[_p], pr = _p < 0 ? null : run.r[_p];
      if (out.some(s => s.source === ent)) continue;
      if (ent.type === T.LITHIUMPROCESSPLANT && (ent._compound || 0) > 0
          && arrivedByPort(LithiumProcessPlantSystem.getStubs(ent).compoundOut, pc, pr)) out.push({ source: ent, field: '_compound' });
      else if (SolidStorageSystem.isSourceOf(ent, 'compound', pc, pr)) out.push({ source: ent, field: '_stored' });
    }
    return out;
  }

  // Tritium flags on the pipes are cleared by the game loop right before
  // this system ticks (HulkingFusionReactorSystem.clearTritiumPipeFlags) —
  // the reactor's TRITIUM OUT and this facility's share one fluid.
  function markTritiumPipes(e, rate) {
    const { tritiumOut } = getStubs(e);
    const run = pipeRun(tritiumOut.c, tritiumOut.r, 'tritium');
    for (let i = 0; i < run.n; i++) {
      const p = run.pipe[i];
      p._tritiumActive = true;
      p._flowRate = rate;
    }
    return run.n > 0;
  }

  return {
    getStubs,
    tick(e, dt) {
      const def = EntityDefs[T.TRITIUMBREEDER];
      const cap = def.tritiumCapacity || 300;
      e._tritium = Math.min(cap, e._tritium || 0);

      const srcs = findCompoundSources(e);
      e._hasCompound = srcs.length > 0;
      e._breeding = false;

      if (e.powered && srcs.length && dt > 0 && e._tritium < cap && !e._idleFull) {
        // Proportional to the compound actually on hand, so a thin supply
        // runs the beam at part output instead of flickering it on and off.
        const need = def.compoundPerSec * dt;
        let taken = 0;
        for (const src of srcs) {
          // Nothing to breed from until the compound has had time to travel the belt.
          if (!BeltCargo.reach(src.source, e, 'compound')) continue;
          const have = src.source[src.field] || 0;
          const take = Math.min(need - taken, have, BeltShare.cap(src.source, e, have, need - taken, 'compound'));
          if (take <= 0) continue;
          src.source[src.field] -= take;
          BeltCargo.moved(src.source, e, 'compound', take);
          taken += take;
          if (taken >= need) break;
        }
        if (taken > 0) {
          const bred = def.tritiumPerSec * dt * (taken / need);
          e._tritium = Math.min(cap, e._tritium + bred);
          e._breeding = true;
          totalTritiumBred += bred;
        }
      }
      // Marked after production, like the Helium-3 Separator's outlet.
      e._tritiumPipeOut = e._tritium > 0 && markTritiumPipes(e, def.tritiumPerSec);
    },
    getTotalTritiumBred() { return totalTritiumBred; },
    loadTotalTritiumBred(v) { if (v !== undefined) totalTritiumBred = v; },
  };
})();
