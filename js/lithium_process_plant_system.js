/* ═══════════════════════════════════════════════════════════════════
   LITHIUM PROCESSING PLANT SYSTEM
   Lithium Ore (conveyor) + Water (pipe) → Lithium Compound (conveyor).
   Same connectivity shape as FuelPlantSystem (nuclear_chain_systems.js) —
   one conveyor IN, one pipe IN, one conveyor OUT — but the water pipe is
   checked by direct adjacency only (ChemicalSystem/ElectrolyzerSystem
   pattern), since water is an unbuffered/unlimited aquifer feed rather
   than a finite resource carried through the pipe network.
   ═══════════════════════════════════════════════════════════════════ */

const LithiumProcessPlantSystem = (() => {
  let totalCompoundProduced = 0;

  // Footprint is 20×18 (10×9, and 6×5 before that - the resizes — plants already in a save keep
  // their saved size and the 1/1/4 offsets below; a 10×9 plant spreads them
  // to 2/2/6). Stubs are the tiles just outside each face.
  // Ore IN stays on its own face; Compound OUT now sits on the water pipe's
  // face (at the water stub's original, pre-shift offset) instead of
  // pairing with Ore IN, and the water pipe sits 3 tiles further along that
  // same face than that original offset.
  // rot 0: ore bottom (row+5, col+1); compound+water left (col-1) — compound at row+1, water at row+4
  // rot 1: ore left   (col-1, row+1); compound+water top  (row-1) — compound at col+1, water at col+4
  // rot 2: ore top    (row-1, col+1); compound+water right(col+6) — compound at row+1, water at row+4
  // rot 3: ore right  (col+6, row+1); compound+water bottom(row+5)— compound at col+1, water at col+4
  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || 20, h = e.height || 18;
    const legacy = Math.max(w, h) <= 6;
    const oO = legacy ? 1 : 2, oC = legacy ? 1 : 2, oW = legacy ? 4 : 6;
    let oreIn, waterIn, compoundOut;
    if (rot === 0) {
      oreIn       = { c: e.col + oO, r: e.row + h };
      compoundOut = { c: e.col - 1,  r: e.row + oC };
      waterIn     = { c: e.col - 1,  r: e.row + oW };
    } else if (rot === 1) {
      oreIn       = { c: e.col - 1,  r: e.row + oO };
      compoundOut = { c: e.col + oC, r: e.row - 1 };
      waterIn     = { c: e.col + oW, r: e.row - 1 };
    } else if (rot === 2) {
      oreIn       = { c: e.col + oO, r: e.row - 1 };
      compoundOut = { c: e.col + w,  r: e.row + oC };
      waterIn     = { c: e.col + w,  r: e.row + oW };
    } else {
      oreIn       = { c: e.col + w,  r: e.row + oO };
      compoundOut = { c: e.col + oC, r: e.row + h };
      waterIn     = { c: e.col + oW, r: e.row + h };
    }
    return { oreIn, waterIn, compoundOut };
  }

  function hasOreConveyor(e) {
    const { oreIn } = getStubs(e);
    const bins = [];
    let found = false;
    const mines = [];   // the mines this belt carries from (see the fuel plant's hasUraniumConveyor)
    const addMine = m => { if (m && m.type === T.LITHIUMMINE && !mines.includes(m)) mines.push(m); };
    const run = beltRun(oreIn.c, oreIn.r);
    for (let _i = 0; _i < run.n; _i++) {
      const ent = run.ent[_i], c = run.c[_i], r = run.r[_i], _p = run.par[_i];
      const pc = _p < 0 ? null : run.c[_p], pr = _p < 0 ? null : run.r[_p];
      // Deliberately does NOT require ent.powered — same reasoning as the
      // ore-draw loop below: a physically conveyor-connected mine still
      // counts as connected even if its control power is momentarily out.
      // Only through the mine's OUT stub, like the uranium/sulfur chains.
      if (ent.type === T.LITHIUMMINE) { if (pc !== null && LithiumSystem.isOutputPort(ent, pc, pr)) { found = true; addMine(ent); } continue; }
      // A Storage Container banking lithium ore counts as a source too.
      if (SolidStorageSystem.isSourceOf(ent, 'lithium', pc, pr)) {
        if (!bins.includes(ent)) bins.push(ent);
        found = true;
        continue;
      }
      if (isConveyorTile(ent) && ent._isLithiumConveyor) { found = true; addMine(ent._lithiumConveyorSource); }
    }
    return { found, bins, mines };
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

  // Level control with a deadband, like the refinery's fuel tank: the plant
  // stops when its compound buffer is full and does not start again until
  // the level has fallen to compoundResumeFrac of it. Restarting the moment
  // anything was taken had it switching on and off every tick whenever its
  // consumer was slower than it is (a Tritium Breeding Facility takes 4/s of
  // its 12), and since it now draws metered water, its claim on the pipe
  // flickered with it. PowerNetwork's idle-when-full check reads this.
  function outputFull(e) {
    const def = EntityDefs[T.LITHIUMPROCESSPLANT];
    const cap = def.compoundCapacity || 300, have = e._compound || 0;
    if (have >= cap) e._compoundHold = true;
    else if (have <= cap * (def.compoundResumeFrac ?? 0.5)) e._compoundHold = false;
    return !!e._compoundHold;
  }

  return {
    outputFull,
    tick(e, dt) {
      const def = EntityDefs[T.LITHIUMPROCESSPLANT];
      if (!def) return;

      const oreResult   = hasOreConveyor(e);
      e._oreConveyor    = oreResult.found;
      // Plumbed in is no longer enough: the plant draws def.waterPerSec out
      // of the pipe run's metered supply, and PowerNetwork
      // .updatePipeConnectivity marks it _waterShort when the run's
      // extractors and tanks have nothing left for it.
      e._waterConnected = hasWaterPipe(e, def) && !e._waterShort;

      const cap = def.compoundCapacity || 300;
      e._compound = e._compound || 0;

      // Mark compound output conveyor tiles unconditionally — flow-direction
      // marking mirrors LithiumSystem.tickMine's own outward BFS, so the
      // renderer can animate belt flow using the same convention.
      {
        const { compoundOut } = getStubs(e);
        e._compoundConveyorOut = true;
        const run = beltRun(compoundOut.c, compoundOut.r);
        for (let i = 0; i < run.n; i++) {
          if (!run.belt[i]) continue;
          const tile = run.ent[i], c = run.c[i], r = run.r[i], pi = run.par[i];
          const fromC = pi < 0 ? e.col + 3 : run.c[pi], fromR = pi < 0 ? e.row + 2 : run.r[pi];
          tile._isLithiumCompoundConveyor = true;
          tile._flowDC = Math.sign(c - fromC);
          tile._flowDR = Math.sign(r - fromR);
          tile._flowRate = def.compoundPerSec;
        }
      }

      if (!e.powered || !e._oreConveyor || !e._waterConnected) return;
      if (outputFull(e)) return;

      // Drain lithium ore from mine buffers, produce compound proportionally.
      // Water has already been claimed for this tick (see _waterConnected).
      const need = def.orePerSec * dt;
      let taken  = 0;
      for (const mine of oreResult.mines) {   // only the mines on its own input belt
        // Deliberately does NOT require mine.powered — same reasoning as
        // FusionFuelPlantSystem's source lookups: an already-mined ore
        // buffer should still be drawable even if the mine's own control
        // power is momentarily out or its powered flag is frozen (e.g.
        // while the game is paused, since PowerNetwork.tick doesn't run
        // then). The mine's own tick already gates NEW ore production on
        // being powered; this only gates access to ore already mined.
        if (!BeltCargo.reach(mine, e, 'lithium')) continue;   // ore still on its way along the belt
        const avail = mine._lithiumStored || 0;
        const take  = Math.min(avail, need - taken, BeltShare.cap(mine, e, avail, need - taken, 'lithium'));   // fair share of a shared mine
        mine._lithiumStored = avail - take;
        BeltCargo.moved(mine, e, 'lithium', take);
        taken += take;
        if (taken >= need) break;
      }
      if (taken < need) taken += SolidStorageSystem.drawFrom(oreResult.bins, need - taken, e, 'lithium');

      const ratio = need > 0 ? taken / need : 0;
      const produced = def.compoundPerSec * dt * ratio;
      e._compound = Math.min(cap, e._compound + produced);
      // Latch the stop here, at the moment the buffer tops out: by the next
      // look a consumer has usually taken a sip and the level reads just under.
      if (e._compound >= cap) e._compoundHold = true;
      BeltCargo.produced(e, 'compound', produced);
      totalCompoundProduced += produced;
    },

    clearCompoundConveyorFlags() {
      for (const e of EntityRegistry.getByType(T.CONVEYOR)) e._isLithiumCompoundConveyor = false;
    },

    getTotalCompoundProduced() { return totalCompoundProduced; },
    loadTotalCompoundProduced(v) { if (v !== undefined) totalCompoundProduced = v; },
    getStubs,
  };
})();
