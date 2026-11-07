/* ═══════════════════════════════════════════════════════════════════
   REPROCESSING PLANT SYSTEM
   Spent Fuel (conveyor) + Water (pipe)
     → Plutonium (conveyor) + Recovered Uranium (conveyor) + HLW (truck)

   The head of the MK4 plutonium/MOX tier. Structurally it is the Lithium
   Processing Plant with one extra output belt and a truck-hauled waste
   stream, so the connectivity code below follows those same patterns:
     • belt IN  — flood-fill from the IN stub exactly like
       NuclearSystem.hasRodConveyor, walking the spent fuel belt flags
       (_isSpentFuelConveyor / _spentFuelConveyorSource) back to the Spent
       Fuel Pools feeding it. ONLY pools: fuel has to sit out the pool's
       cooling clock before it can be reprocessed, so a belt straight off a
       reactor feeds nothing (the panel says so, see _reactorDirect).
     • water IN — direct adjacency only (ChemicalSystem pattern); water is
       an unbuffered aquifer feed, not a finite piped resource.
     • belts OUT — the fuel plant's rod-belt marking run twice, once per
       product, with its own flag/distance/source/direction per tile.
     • HLW      — NOT a belt. It accrues in `_hlw` and is registered in
       WASTE_CFG against the same Nuclear Waste Processing Facility the
       reactors already use, so it inherits truck hauling and the
       "can't demolish a building full of waste" rule for free. That is
       the point of the tier: reprocessing CONCENTRATES the waste problem
       into a smaller, hotter stream rather than deleting it.

   The yields (def.recoveredPerUnit / plutoniumPerUnit / hlwPerUnit)
   deliberately sum to 0.85, not 1. Reprocessing recovers material, it does
   not create it, and the missing 15% is fission products that are simply
   gone. Closing the loop would make the whole tier perpetual motion.
   ═══════════════════════════════════════════════════════════════════ */

const ReprocessingSystem = (() => {
  let totalPlutoniumProduced = 0;
  let totalSpentFuelConsumed = 0;

  // Footprint is 16×13 (12×10 before the plant was enlarged — saves keep
  // their own size). Stubs are the tiles just outside each face.
  // Both products leave on the face OPPOSITE the spent fuel intake, so the
  // hot side and the clean side of the plant are physically separated —
  // which is also how the building is drawn.
  //   rot 0: spent IN top,    water left,   products bottom
  //   rot 1: spent IN right,  water top,    products left
  //   rot 2: spent IN bottom, water right,  products top
  //   rot 3: spent IN left,   water bottom, products right
  // (Same bottom→left→top→right rotation order as
  // LithiumProcessPlantSystem.getStubs, so a rotated plant's ports land
  // where a player who has built one of those expects them.)
  // Plutonium sits at the far offset and recovered uranium at the near one
  // so each product leaves on the side its own equipment is drawn on — the
  // reverse crosses the two belts over each other inside the building.
  //
  // Offsets are fractions of whichever face the port lands on, so they sit
  // over the same equipment at any size. A plant saved at the old 12×10
  // keeps the literal 2 / 3 / 8 / 2 it was built with, so its belts and
  // pipe stay connected.
  const LEGACY = { spent: 2, water: 3, plut: 8, recov: 2 };
  const FRAC   = { spent: 0.19, water: 0.62, plut: 0.62, recov: 0.19 };
  const legacySize = (e) => (e.width || 16) <= 12 && (e.height || 13) <= 10;

  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || 16, h = e.height || 13;
    const o = (key, len) => legacySize(e) ? LEGACY[key] : Math.round(FRAC[key] * (len - 1));
    const top    = (k) => ({ c: e.col + o(k, w), r: e.row - 1 });
    const bottom = (k) => ({ c: e.col + o(k, w), r: e.row + h });
    const left   = (k) => ({ c: e.col - 1, r: e.row + o(k, h) });
    const right  = (k) => ({ c: e.col + w, r: e.row + o(k, h) });
    if (rot === 1) return { spentIn: right('spent'),  waterIn: top('water'),    plutoniumOut: left('plut'),   recoveredOut: left('recov') };
    if (rot === 2) return { spentIn: bottom('spent'), waterIn: right('water'),  plutoniumOut: top('plut'),    recoveredOut: top('recov') };
    if (rot === 3) return { spentIn: left('spent'),   waterIn: bottom('water'), plutoniumOut: right('plut'),  recoveredOut: right('recov') };
    return          { spentIn: top('spent'),    waterIn: left('water'),   plutoniumOut: bottom('plut'), recoveredOut: bottom('recov') };
  }

  // Walk the IN belt back to the Spent Fuel Pools feeding it, following the
  // source reference SpentFuelPoolSystem stamps onto each tile past a
  // pool's OUT stub. The pool is a required step: it makes the fuel wait
  // out its cooling clock. Reactors reached on the walk (a belt straight
  // off SPENT FUEL OUT) are reported, not drawn from, so the panel can tell
  // the player to put a pool in the line.
  //
  // Spent fuel is deliberately absent from SolidStorageSystem.KINDS (a
  // generic Storage Container must not be able to bank it, or the waste
  // pressure the loop runs on disappears). The Spent Fuel Pool is the one
  // building allowed to hold it, and it earns that by making the fuel wait.
  function hasSpentFuelConveyor(e) {
    const { spentIn } = getStubs(e);
    const visited  = new Set();
    const reactors = [];
    const pools    = [];
    const queue = [{ c: spentIn.c, r: spentIn.r, pc: null, pr: null }];
    while (queue.length) {
      const { c, r, pc, pr } = queue.shift();
      const key = `${c},${r}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const ent = GridManager.getEntity(c, r);
      if (!ent) continue;
      // A reactor reached directly counts only through its SPENT FUEL OUT
      // stub; a belt passing along any other wall carries nothing.
      if (ent.type === T.NUCLEARREACTOR) {
        if (arrivedByPort(NuclearSystem.getStubs(ent).wasteOut, pc, pr) && !reactors.includes(ent)) reactors.push(ent);
        continue;
      }
      // A pool counts only when the walk arrived at its OUT stub — a belt
      // merely brushing the side of the footprint carries nothing.
      if (typeof SpentFuelPoolSystem !== 'undefined'
          && SpentFuelPoolSystem.isSourceOf(ent, pc, pr)) {
        if (!pools.includes(ent)) pools.push(ent);
        continue;
      }
      if (isConveyorTile(ent)) {
        // The producer stamps its OUT belt with a source reference each
        // tick. That reference is the connection — following it is what
        // makes a belt of any length and shape work.
        const src = ent._spentFuelConveyorSource;
        if (src && src.type === T.NUCLEARREACTOR && !reactors.includes(src)) reactors.push(src);
        if (src && src.type === T.SPENTFUELPOOL  && !pools.includes(src))    pools.push(src);
        for (const [dc, dr] of beltSteps(c, r))
          queue.push({ c: c+dc, r: r+dr, pc: c, pr: r });
      }
    }
    return { found: pools.length > 0, reactors, pools };
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

  // Stamp one product belt with flag / BFS distance / source reference /
  // travel direction, so a consumer can walk back to this plant and the
  // renderer can animate a pellet along the belt. Identical in shape to
  // FuelPlantSystem's rod-belt marking — including its known limitation:
  // this is a flood-fill shortest-path distance, not a walk along the
  // belt's real route, so a belt that loops back and runs adjacent to an
  // earlier segment of itself can show a pellet jumping lanes.
  // `kind` is the BeltCargo kind the belt carries: each tile points the way
  // that kind is really routed over it (BeltCargo.flowDir), which on a belt
  // two plants share is the same from either side. Only a tile no route
  // crosses (a dead-end branch) falls back to pointing away from this plant.
  function markProductBelt(e, stub, inward, flag, distField, srcField, dcField, drField, rate, kind) {
    const visited = new Set();
    const queue = [{ c: stub.c, r: stub.r, d: 0, fromC: inward.c, fromR: inward.r }];
    while (queue.length) {
      const { c, r, d, fromC, fromR } = queue.shift();
      const key = `${c},${r}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const tile = GridManager.getEntity(c, r);
      if (!tile || !isConveyorTile(tile)) continue;
      tile[flag]      = true;
      tile[distField] = d;
      tile[srcField]  = e;
      const dir = typeof BeltCargo !== 'undefined' && BeltCargo.flowDir(e, kind, c, r);
      tile[dcField]   = dir ? dir[0] : Math.sign(c - fromC);
      tile[drField]   = dir ? dir[1] : Math.sign(r - fromR);
      tile._flowRate  = rate;
      for (const [dc, dr] of beltSteps(c, r))
        queue.push({ c: c+dc, r: r+dr, d: d + 1, fromC: c, fromR: r });
    }
  }

  return {
    tick(e, dt) {
      const def = EntityDefs[T.REPROCESSOR];
      if (!def) return;

      const recovCap = def.recoveredCapacity || 200;
      const plutCap  = def.plutoniumCapacity || 100;
      const hlwCap   = def.hlwCapacity       || 100;
      if (e._plutonium === undefined) e._plutonium = 0;
      if (e._recovered === undefined) e._recovered = 0;
      if (e._hlw       === undefined) e._hlw       = 0;

      const spentResult = hasSpentFuelConveyor(e);
      e._hasSpentFuel   = spentResult.found;
      // Belted straight to a reactor with no pool in between: feeds nothing.
      e._reactorDirect  = !spentResult.found && spentResult.reactors.length > 0;
      e._waterConnected = hasWaterPipe(e, def);

      // Mark both product belts unconditionally — a consumer downstream
      // detects the physical connection whether or not this plant happens
      // to be running right now, the same cold-start bootstrap the fuel
      // plant's rod belt allows.
      {
        const { plutoniumOut, recoveredOut } = getStubs(e);
        const rot = e._rotation || 0;
        // The footprint cell just inside each OUT stub, so the first belt
        // tile's travel direction points away from the building.
        const inward = (s) => (rot === 0) ? { c: s.c, r: s.r - 1 }
                            : (rot === 1) ? { c: s.c + 1, r: s.r }
                            : (rot === 2) ? { c: s.c, r: s.r + 1 }
                                          : { c: s.c - 1, r: s.r };
        e._plutoniumConveyorOut = true;
        e._recoveredConveyorOut = true;
        markProductBelt(e, plutoniumOut, inward(plutoniumOut), '_isPlutoniumConveyor',
          '_plutoniumConveyorDist', '_plutoniumConveyorSource', '_plutoniumFlowDC', '_plutoniumFlowDR',
          def.spentFuelPerSec * def.plutoniumPerUnit, 'plutonium');
        markProductBelt(e, recoveredOut, inward(recoveredOut), '_isRecoveredConveyor',
          '_recoveredConveyorDist', '_recoveredConveyorSource', '_recoveredFlowDC', '_recoveredFlowDR',
          def.spentFuelPerSec * def.recoveredPerUnit, 'recovered');
      }

      // The HLW store warns and blocks demolition through the same helpers
      // every other waste source uses.
      checkWasteBuildup(e, (e._hlw / hlwCap) * 100, 'High-level waste');

      if (dt <= 0) return;
      if (!e.powered || !e._hasSpentFuel || !e._waterConnected) { e._running = false; return; }

      // Any full output buffer stops the plant, including recovered uranium.
      // Every other plant in the game backs up rather than venting, and
      // quietly destroying a product here would be the same loophole the
      // waste chain exists to close — so if the bulk stream has nowhere to
      // go, belt it to a Storage Container. `_blockedBy` tells the panel
      // which buffer is the one holding everything up.
      e._blockedBy = (e._hlw       >= hlwCap)  ? 'High-level waste'
                   : (e._plutonium >= plutCap) ? 'Plutonium'
                   : (e._recovered >= recovCap) ? 'Recovered uranium'
                   : null;
      if (e._blockedBy || e._idleFull) { e._running = false; return; }

      // Draw cooled spent fuel from the pools on the IN belt. Only pools:
      // the fuel has to have sat out a pool's cooling clock first.
      const need = def.spentFuelPerSec * dt;
      let taken = 0;
      for (const pool of spentResult.pools) {
        if (taken >= need) break;
        if (!BeltCargo.reach(pool, e, 'spent')) continue;   // still on its way along the belt
        const got = SpentFuelPoolSystem.draw(pool, Math.min(need - taken, BeltShare.cap(pool, e, SpentFuelPoolSystem.total(pool), need - taken, 'spent')), dt);
        BeltCargo.moved(pool, e, 'spent', got);
        taken += got;
      }

      const ratio = need > 0 ? taken / need : 0;
      e._running  = ratio > 0;
      // Connected to a pool that is holding fuel but hasn't finished cooling
      // any of it. Distinct from "nothing is connected": the player has built
      // the chain correctly and simply has to wait, and the panel says so
      // rather than showing a bare idle state they might try to debug.
      e._waitingOnCooling = taken <= 0 && spentResult.pools.some(p => (p._cooling || 0) > 0);
      if (taken <= 0) return;

      totalSpentFuelConsumed += taken;
      const plut = taken * def.plutoniumPerUnit;
      e._recovered  = Math.min(recovCap, e._recovered + taken * def.recoveredPerUnit);
      e._plutonium  = Math.min(plutCap,  e._plutonium + plut);
      e._hlw        = Math.min(hlwCap,   e._hlw       + taken * def.hlwPerUnit);
      totalPlutoniumProduced += plut;
      BeltCargo.produced(e, 'plutonium', plut);
      BeltCargo.produced(e, 'recovered', taken * def.recoveredPerUnit);
    },

    clearProductConveyorFlags() {
      for (const c of EntityRegistry.getByType(T.CONVEYOR)) {
        c._isPlutoniumConveyor      = false;
        c._plutoniumConveyorSource  = null;
        c._isRecoveredConveyor      = false;
        c._recoveredConveyorSource  = null;
      }
    },

    getStubs,
    getTotalPlutonium()      { return totalPlutoniumProduced; },
    loadTotalPlutonium(v)    { totalPlutoniumProduced = v || 0; },
    getTotalSpentFuelConsumed()   { return totalSpentFuelConsumed; },
    loadTotalSpentFuelConsumed(v) { totalSpentFuelConsumed = v || 0; },
  };
})();
