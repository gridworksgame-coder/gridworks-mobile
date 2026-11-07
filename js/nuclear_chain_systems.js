/* ═══════════════════════════════════════════════════════════════════
   NUCLEAR CHAIN SYSTEMS
   Chemical plant, fuel processing plant, and nuclear reactor logic.
   ═══════════════════════════════════════════════════════════════════ */

const ChemicalSystem = (() => {
  let totalAcidProduced = 0;

  // Returns the conveyor stub tile (sulfur IN — the plant's only conveyor
  // connection), and the two pipe stub tiles (water IN, acid OUT — both
  // liquids, so both travel by pipe) based on rotation. Acid OUT sits on
  // the same face as the conveyor stub (second slot, where the plant's
  // acid storage tank is drawn) rather than paired with water IN, so it
  // no longer moves in lockstep with the water intake.
  // Stubs are the tiles just outside each face. Offsets are measured from the
  // anchor corner and stay fixed as the footprint grows; only the far-face
  // terms (col+w / row+h) move, so a bigger plant keeps its ports where the
  // player expects them relative to its top-left corner.
  // rot 0: conveyor+acid bottom (row+4), water pipe left  (col-1)
  // rot 1: conveyor+acid left   (col-1),  water pipe top   (row-1)
  // rot 2: conveyor+acid top    (row-1),  water pipe right (col+5)
  // rot 3: conveyor+acid right  (col+5),  water pipe bottom (row+4)
  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || 5, h = e.height || 4;
    let convStubs, pipeStubs, convInside;
    if (rot === 0) {
      convStubs  = [{ c: e.col + 1, r: e.row + h }];
      convInside = { c: e.col + 1, r: e.row + h - 1 };
      pipeStubs  = [{ c: e.col - 1, r: e.row + 1 }, { c: e.col + 4, r: e.row + h }];
    } else if (rot === 1) {
      convStubs  = [{ c: e.col - 1, r: e.row + 1 }];
      convInside = { c: e.col, r: e.row + 1 };
      pipeStubs  = [{ c: e.col + 1, r: e.row - 1 }, { c: e.col - 1, r: e.row + 3 }];
    } else if (rot === 2) {
      convStubs  = [{ c: e.col + 1, r: e.row - 1 }];
      convInside = { c: e.col + 1, r: e.row };
      pipeStubs  = [{ c: e.col + w, r: e.row + 1 }, { c: e.col + 4, r: e.row - 1 }];
    } else {
      convStubs  = [{ c: e.col + w, r: e.row + 1 }];
      convInside = { c: e.col + w - 1, r: e.row + 1 };
      pipeStubs  = [{ c: e.col + 1, r: e.row + h }, { c: e.col + w, r: e.row + 3 }];
    }
    // Acid OUT on the bottom/top face sits at the fixed anchor offset col+4 —
    // where renderChemicalPlant draws it (px + TILE*4.5). It used to be
    // col+w-1, which only equalled col+4 while the plant was 5 wide; once it
    // grew to 7 the logic port moved two tiles right of the drawn stub, so a
    // pipe laid to the visible ACID OUT never connected or lit up.
    // convInside: the footprint-edge cell immediately behind the conveyor
    // stub — this is what GridManager.getEntity() resolves to (the plant's
    // shared entity reference) when a BFS steps from the external stub tile
    // into the building, so downstream-target checks compare against this
    // cell, not the external stub coordinate itself.
    return { convStubs, pipeStubs, convInside };
  }

  // Sulfur reaching this plant: a powered mine on the belt, or a Storage
  // Container banking sulfur that the belt reaches through its OUT stub.
  function hasSulfurConveyor(e) {
    const { convStubs } = getStubs(e);
    let found = false;
    const bins = [];
    const mines = [];   // the mines this belt carries from (see hasUraniumConveyor)
    const addMine = m => { if (isSulfurMine(m) && !mines.includes(m)) mines.push(m); };
    for (const stub of convStubs) {
      const run = beltRun(stub.c, stub.r);
      for (let _i = 0; _i < run.n; _i++) {
        const ent = run.ent[_i], _p = run.par[_i];
        const pc = _p < 0 ? null : run.c[_p], pr = _p < 0 ? null : run.r[_p];
        // A mine only counts if the belt arrived at its OUT stub — a belt
        // merely brushing the side of the footprint carries nothing.
        if (isSulfurMine(ent)) {
          if (ent.powered && pc !== null && SulfurSystem.isOutputPort(ent, pc, pr)) { found = true; addMine(ent); }
          continue;
        }
        if (SolidStorageSystem.isSourceOf(ent, 'sulfur', pc, pr)) {
          if (!bins.includes(ent)) bins.push(ent);
          found = true;
          continue;
        }
        if (isConveyorTile(ent)) {
          if (ent._isSulfurConveyor && ent._sulfurConveyorSource) { found = true; addMine(ent._sulfurConveyorSource); }
        }
      }
    }
    return { found, bins, mines };
  }

  function hasWaterPipe(e, def) {
    const { pipeStubs } = getStubs(e);
    // Check water IN stub (first pipe stub)
    const waterStub = pipeStubs[0];
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

  // Clear acid-active flags for all pipes — called once per tick, right
  // before the per-plant tick loop below recomputes them. Kept separate
  // from OilSystem.clearOilPipeFlags so acid pipes don't briefly read as
  // "unclaimed" while other fluids' BFS passes are still running this tick.
  function clearAcidPipeFlags() {
    for (const p of allPipes()) p._acidActive = false;
    // Tank-to-tank acid runs are lit earlier in the tick (OilSystem.chainTanks)
    // — put those back rather than blanking them until the next frame.
    for (const t of EntityRegistry.getByType(T.OILSTORAGE))
      if (t._chainFluid === 'acid' && t._chainPipes) for (const p of t._chainPipes) p._acidActive = true;
  }

  return {
    clearAcidPipeFlags,
    tick(e, dt) {
      const def = EntityDefs[T.CHEMICALPLANT];
      if (!def) return;

      const sulfurResult = hasSulfurConveyor(e);
      e._sulfurConveyor = sulfurResult.found;
      e._waterConnected = hasWaterPipe(e, def);
      e._acidPipeOut    = false;

      const cap = def.acidCapacity || 300;
      e._acid   = e._acid || 0;

      // Mark acid pipes active — BFS from the acid OUT stub (second pipe stub).
      // Also while acid is being drawn off faster than it builds up: a
      // Liquid Storage Tank ticks earlier in the frame and can empty the
      // plant's buffer every tick, leaving it reading 0 here even though
      // acid is plainly flowing — the pipe used to look empty the whole time.
      const _acidFlowing = e._acid > 0 || e._acidPulled;
      e._acidPulled = false;
      e._chemActive = false;   // set below once sulfur actually gets processed (PollutionSystem)
      if (_acidFlowing && e.powered) {
        const { pipeStubs } = getStubs(e);
        const outStub = pipeStubs[1];
        const run = pipeRun(outStub.c, outStub.r, 'acid');
        // Flagged on whatever is on top of the tile (see ElectrolyzerSystem).
        for (let i = 0; i < run.n; i++) {
          const top = run.top[i];
          top._acidActive = true;
          top._flowRate = def.acidPerSec;
        }
        if (run.n > 0) e._acidPipeOut = true;
      }

      if (!e.powered || !e._sulfurConveyor || !e._waterConnected) return;
      if (e._acid >= cap || e._idleFull) return;

      // Drain sulfur from mine buffers, produce acid proportionally
      const need = def.sulfurPerSec * dt;
      let taken  = 0;
      for (const mine of sulfurResult.mines) {   // only the mines on its own input belt
        if (!mine.powered) continue;
        if (!BeltCargo.reach(mine, e, 'sulfur')) continue;   // still on its way along the belt
        const avail = mine._sulfurStored || 0;
        const take  = Math.min(avail, need - taken, BeltShare.cap(mine, e, avail, need - taken, 'sulfur'));
        mine._sulfurStored = avail - take;
        BeltCargo.moved(mine, e, 'sulfur', take);
        taken += take;
        if (taken >= need) break;
      }
      // Then any Storage Container on the belt — a stockpile keeps the plant
      // running through a mine outage or a worked-out seam.
      if (taken < need) taken += SolidStorageSystem.drawFrom(sulfurResult.bins, need - taken, e, 'sulfur');

      const ratio = need > 0 ? taken / need : 0;
      e._chemActive = ratio > 0;
      const produced = def.acidPerSec * dt * ratio;
      e._acid = Math.min(cap, e._acid + produced);
      totalAcidProduced += produced;
    },
    getTotalAcidProduced() { return totalAcidProduced; },
    loadTotalAcidProduced(v) { if (v !== undefined) totalAcidProduced = v; },
    getStubs,
  };
})();


// ─── Fuel Plant System ────────────────────────────────────────────
const FuelPlantSystem = (() => {
  let totalRodsProduced = 0;

  // Stubs: 1 pipe IN (acid), 1 conveyor IN (uranium), 1 conveyor OUT (rods)
  // All on the bottom face for default orientation (no rotation for now)
  // pipe IN: col+2, row+height
  // conveyor IN: col+1, row+height  (left of pipe)
  // conveyor OUT: col+4, row+height (right side)
  function getStubs(e) {
    const w = e.width || 6, h = e.height || 5;
    return {
      pipeIn:   { c: e.col + 2, r: e.row + h },
      convIn:   { c: e.col + 1, r: e.row + h },
      convOut:  { c: e.col + 4, r: e.row + h },
    };
  }

  function hasAcidPipe(e) {
    const { pipeIn } = getStubs(e);
    // Walk pipe network from stub looking for a chemical plant with acid,
    // and for Liquid Storage Tanks holding it. (Tanks were filled from the
    // chemical plant but nothing ever drew from them: a row of full acid
    // tanks on the line fed nobody once the plant itself ran dry.)
    const run = pipeRun(pipeIn.c, pipeIn.r, 'acid');
    let source = null;
    const tanks = [];
    const lines = new Map();   // each tank's OUT line, fetched once (see OilSystem.tanksBehind)
    for (let j = 0; j < run.pn; j++) {
      const nb = run.pe[j];
      // A stocked acid tank feeds through its OUT stub — and through its IN
      // stub too when that is the one on this line: a tank teed off the
      // Chemical Plant's own line, which fills and empties the same way. The
      // row of tanks behind such a tank is drawn on with it.
      // (It was the OUT stub only, so tanks teed off the line fed nobody.)
      if (nb.type === T.OILSTORAGE) {
        if (nb._liquidType != null && nb._liquidType !== 'acid') continue;
        if (typeof OilSystem === 'undefined' || !OilSystem.tankOnline(nb)) continue;
        const ports = OilSystem.resolveTankPorts(nb);
        const atIn  = run.ptc[j] === ports.in.c  && run.ptr[j] === ports.in.r;
        const atOut = run.ptc[j] === ports.out.c && run.ptr[j] === ports.out.r;
        if (!atIn && !atOut) continue;
        for (const tk of atIn ? [nb, ...OilSystem.tanksBehind(nb, 'acid', [], lines)] : [nb])
          if (tk._liquidType === 'acid' && (tk._crude || 0) > 0 && !tanks.includes(tk)) tanks.push(tk);
        continue;
      }
      // Acid only leaves through the plant's ACID OUT stub — a pipe on its
      // H₂O IN stub touches the plant too, but carries water, not acid.
      if (nb.type !== T.CHEMICALPLANT || source) continue;
      const ao = ChemicalSystem.getStubs(nb).pipeStubs[1];
      if (run.ptc[j] === ao.c && run.ptr[j] === ao.r && (nb._acid || 0) > 0 && nb.powered) source = nb;
    }
    // Nothing is drawn until the acid has run down the line to ACID IN;
    // `stocked` still lights the line from tank stock while it does.
    const arrived = pipeArrivedAt(pipeIn.c, pipeIn.r, 'acid');
    return { found: arrived && (!!source || tanks.length > 0), source: arrived ? source : null,
             tanks: arrived ? tanks : [], stocked: tanks.length > 0, run };
  }

  function hasUraniumConveyor(e) {
    const { convIn } = getStubs(e);
    let found = false;
    const bins = [];
    // The mines this belt actually carries from — reached at their OUT stub,
    // or named by a belt tile they've stamped (a line longer than the walk).
    const mines = [];
    const addMine = m => { if (m && m.type === T.URANIUMMINE && !mines.includes(m)) mines.push(m); };
    const run = beltRun(convIn.c, convIn.r);
    for (let _i = 0; _i < run.n; _i++) {
      const ent = run.ent[_i], c = run.c[_i], r = run.r[_i], _p = run.par[_i];
      const pc = _p < 0 ? null : run.c[_p], pr = _p < 0 ? null : run.r[_p];
      // Reaching a mine only counts if the belt arrived at its OUT stub —
      // a belt merely brushing the side of the footprint carries nothing.
      if (ent.type === T.URANIUMMINE) {
        if (ent.powered && pc !== null && UraniumSystem.isOutputPort(ent, pc, pr)) { found = true; addMine(ent); }
        continue;
      }
      // A Storage Container banking uranium counts too, reached through its
      // OUT stub.
      if (SolidStorageSystem.isSourceOf(ent, 'uranium', pc, pr)) {
        if (!bins.includes(ent)) bins.push(ent);
        found = true;
        continue;
      }
      if (isConveyorTile(ent) && ent._isUraniumConveyor) { found = true; addMine(ent._uraniumConveyorSource); }
    }
    return { found, bins, mines };
  }

  // Truck deliveries. A Hauler sent here unloads acid or uranium straight
  // into the plant's own hopper/tank, which is drawn on after the pipe and
  // the belt — so a plant with no pipe or belt at all runs off trucks alone.
  const TRUCK_FIELD = { acid: '_truckAcid', uranium: '_truckUranium' };
  const truckCap = (kind) => kind === 'acid' ? (EntityDefs[T.FUELPLANT].acidCapacity || 300) : (EntityDefs[T.FUELPLANT].uraniumCapacity || 300);
  function truckRoom(e, kind) {
    const f = TRUCK_FIELD[kind];
    return f ? Math.max(0, truckCap(kind) - (e[f] || 0)) : 0;
  }
  function truckPut(e, kind, amt) {
    const f = TRUCK_FIELD[kind];
    if (!f) return 0;
    const took = Math.max(0, Math.min(amt, truckRoom(e, kind)));
    e[f] = (e[f] || 0) + took;
    return took;
  }

  return {
    tick(e, dt) {
      const def = EntityDefs[T.FUELPLANT];
      if (!def) return;

      const { pipeIn } = getStubs(e);
      e._hasAcid     = false;
      e._hasUranium  = false;
      e._rodPipeOut  = false;

      // Check connections
      const acidResult = hasAcidPipe(e);
      e._hasAcid    = acidResult.found || (e._truckAcid || 0) > 0;
      // The Chemical Plant lights its own line only while it holds acid: with
      // tank stock on the line, light it from here so the pipe shows what it
      // carries, whether or not this plant drew any this tick (as the runs
      // between tanks do).
      if (acidResult.stocked) for (let i = 0; i < acidResult.run.n; i++) { const top = acidResult.run.top[i]; top._acidActive = true; top._flowRate = def.acidPerSec; }
      const uraniumResult = hasUraniumConveyor(e);
      e._hasUranium = uraniumResult.found || (e._truckUranium || 0) > 0;

      // Mark rod output conveyor unconditionally — the reactor detects
      // physical connection via BFS regardless of fuel plant power state.
      // Also stamps each belt tile with its
      // shortest-path distance from the plant and a source reference, so
      // the renderer can walk a single rod pellet down the chain instead
      // of animating flow continuously (a rod only actually leaves once
      // per completed unit).
      //
      // Known limitation: this is a flood-fill shortest-path distance, not
      // a walk along the belt's actual physical route. If a belt loops back
      // and runs adjacent (1 tile apart) to an earlier segment of itself,
      // the "shortcut" through that adjacency gets a shorter BFS distance
      // than the real belt-length position, and the pellet can appear to
      // jump to the near lane and travel backward. Only matters for layouts
      // where the rod belt runs parallel and touching itself.
      {
        const { convOut } = getStubs(e);
        e._rodConveyorOut = true;
        // Each tile's parent in the walk gives the *actual* travel direction
        // at every tile (flowDC/flowDR below), so the renderer need not
        // re-derive "downstream" independently per tile, which could
        // disagree between neighbours and make the rod pellet appear to jump
        // direction or snap along the belt.
        const plantFromC = convOut.c, plantFromR = convOut.r - 1;
        const run = beltRun(convOut.c, convOut.r);
        for (let i = 0; i < run.n; i++) {
          if (!run.belt[i]) continue;
          const tile = run.ent[i], c = run.c[i], r = run.r[i], pi = run.par[i];
          const fromC = pi < 0 ? plantFromC : run.c[pi], fromR = pi < 0 ? plantFromR : run.r[pi];
          tile._isRodConveyor     = true;
          tile._rodConveyorDist   = run.d[i];
          tile._rodConveyorSource = e;
          tile._rodFlowDC         = Math.sign(c - fromC);
          tile._rodFlowDR         = Math.sign(r - fromR);
          tile._flowRate          = def.rodPerSec;
        }
      }

      // Ages up every tick regardless of production state so rods already in
      // flight keep travelling down the belt.
      // Every rod still in flight on the belt, as seconds since it finished.
      // The renderer places each one at age × belt speed along the belt.
      // Dropped after a couple of minutes — past the end of any sane belt.
      e._rodPulses = (e._rodPulses || []).map(a => a + dt).filter(a => a < 120);

      if (!e.powered || !e._hasAcid || !e._hasUranium) return;

      const rodCap = def.rodCapacity || 150;
      e._rods = e._rods || 0;
      if (e._rods >= rodCap || e._idleFull) return;

      // Acid from the connected chemical plant: whatever it has, up to a
      // full tick's worth. (This was all-or-nothing, so a plant left with a
      // last drop smaller than one tick's draw could never use it, and went
      // on reading "acid connected" for ever while making nothing.) It is
      // drained below, by as much as the uranium that turned up allows.
      const acidNeed = def.acidPerSec * dt;
      // Fresh acid from the plant first, then what is banked in tanks.
      let acidStock = acidResult.source ? (acidResult.source._acid || 0) : 0;
      for (const tk of acidResult.tanks || []) acidStock += tk._crude || 0;
      acidStock += e._truckAcid || 0;
      const acidHad  = Math.min(acidNeed, acidStock);
      if (acidHad <= 0) return;   // not enough acid
      const acidK = acidHad / acidNeed;

      // Drain uranium from the mines on this plant's own input belt. (This
      // used to take from every uranium mine in the world, first come first
      // served — so a plant drew from mines it had no belt to at all, and
      // the ore never showed on its belt.)
      const uFull = def.uraniumPerSec * dt, uNeed = uFull * acidK;
      let uTaken = 0;
      for (const mine of uraniumResult.mines) {
        if (!mine.powered) continue;
        if (!BeltCargo.reach(mine, e, 'uranium')) continue;   // still on its way along the belt
        const avail = mine._uraniumStored || 0;
        const take  = Math.min(avail, uNeed - uTaken, BeltShare.cap(mine, e, avail, uNeed - uTaken, 'uranium'));
        mine._uraniumStored = avail - take;
        BeltCargo.moved(mine, e, 'uranium', take);
        uTaken += take;
        if (uTaken >= uNeed) break;
      }
      if (uTaken < uNeed) uTaken += SolidStorageSystem.drawFrom(uraniumResult.bins, uNeed - uTaken, e, 'uranium');
      if (uTaken < uNeed && (e._truckUranium || 0) > 0) {
        const take = Math.min(e._truckUranium, uNeed - uTaken);
        e._truckUranium -= take; uTaken += take;
        if (e._truckUranium < 1e-6) e._truckUranium = 0;
      }
      const ratio = uFull > 0 ? uTaken / uFull : 0;
      if (ratio > 0) {
        let owe = acidNeed * ratio;
        const src = acidResult.source;
        if (src) {
          const take = Math.min(owe, src._acid || 0);
          src._acid = (src._acid || 0) - take; owe -= take;
          if (src._acid < 1e-6) src._acid = 0;
          src._acidPulled = true;
        }
        for (const tk of acidResult.tanks || []) {
          if (owe <= 1e-9) break;
          const take = Math.min(owe, tk._crude || 0);
          if (take <= 0) continue;
          tk._crude -= take; owe -= take;
          tk._outThisTick = (tk._outThisTick || 0) + take;
          if (tk._crude <= 0.001) { tk._crude = 0; tk._liquidType = null; }
        }
        if (owe > 1e-9 && (e._truckAcid || 0) > 0) {
          const take = Math.min(owe, e._truckAcid);
          e._truckAcid -= take; owe -= take;
          if (e._truckAcid < 1e-6) e._truckAcid = 0;
        }
      }
      const produced = def.rodPerSec * dt * ratio;
      const prevWhole = Math.floor(e._rods);
      e._rods = Math.min(rodCap, e._rods + produced);
      BeltCargo.produced(e, 'rods', produced);
      totalRodsProduced += produced;
      // A whole rod just finished — restart the belt pellet from the plant.
      if (Math.floor(e._rods) > prevWhole && e._rodPulses.length < 24) e._rodPulses.push(0);
    },

    clearRodFlags() {
      for (const e of EntityRegistry.getByType(T.CONVEYOR)) e._isRodConveyor = false;
      for (const e of EntityRegistry.getByType(T.PIPE))     e._isRodConveyor = false;
    },

    getTotalRods() { return totalRodsProduced; },
    loadTotalRods(v) { if (v !== undefined) totalRodsProduced = v; },
    getStubs, truckRoom, truckPut,
  };
})();


// ─── Nuclear Reactor System ───────────────────────────────────────
const NuclearSystem = (() => {
  let totalPowerGenerated = 0;
  let totalSpentFuel      = 0;
  let totalGraphiteBurned = 0;

  // Both reactors run on THIS code — every tunable that differs between them
  // (steam output, heat rise, cooling demand, spent fuel rate, which plant
  // makes their fuel) is read from EntityDefs[e.type], never hardcoded. A
  // third reactor would be a def plus an entry here.
  const REACTOR_TYPES = [T.NUCLEARREACTOR, T.ADVREACTOR];

  // Which fabricator and which belt solid each reactor eats.
  const FUEL = {
    [T.NUCLEARREACTOR]: { plant: () => T.FUELPLANT, kind: 'rods', field: '_rods', cap: () => EntityDefs[T.FUELPLANT].rodCapacity || 150 },
    [T.ADVREACTOR]:     { plant: () => T.MOXPLANT,  kind: 'mox',  field: '_mox',  cap: () => EntityDefs[T.MOXPLANT].moxCapacity  || 300 },
  };
  const fuelOf = (e) => FUEL[e.type] || FUEL[T.NUCLEARREACTOR];

  // Stubs: rod IN / steam OUT / cool IN on the left face (col-1), waste OUT
  // on the right face (col+w). render_oil_nuclear.js draws the wall valves
  // from these, so the pipe's visible end lines up exactly with the valve
  // icon. They spread down the valve wall with the reactor's size: rod at
  // row 2, steam about 45% down, cool and waste three rows from the bottom —
  // rows 2/8/14 on a 17×17, 2/6/11 on a 14×14, and exactly the old 2/5/8 on an 11×11. Reactors
  // from before either resize keep their saved size; the 8×8 (and older)
  // ones keep rows 2/3/5 (waste at 3). Either way, pipes already laid to a
  // reactor stay connected.
  function getStubs(e) {
    const w = e.width || 17, h = e.height || 17;
    const legacy = h <= 8;
    const steamR = legacy ? 3 : Math.round(h * 0.45);
    const lowR   = legacy ? 5 : h - 3;
    const st = {
      rodIn:    { c: e.col - 1, r: e.row + 2 },
      wasteOut: { c: e.col + w, r: e.row + (legacy ? 3 : lowR) },
      coolIn:   { c: e.col - 1, r: e.row + lowR },
      steamOut: { c: e.col - 1, r: e.row + steamR },
    };
    // The Advanced Reactor's graphite reflector feed: the bottom face, under
    // the MOX magazine (30% along), the one face its other ports leave free.
    if (e.type === T.ADVREACTOR) st.graphiteIn = { c: e.col + Math.round(w * 0.3), r: e.row + h };
    return st;
  }

  // Graphite reaching GRAPHITE IN: Graphitization Furnaces at their OUT stub
  // or named by a belt tile they stamped, and Storage Containers banking it.
  const graphiteFeed = (e) => _fcBeltFeed(getStubs(e).graphiteIn, 'graphite', T.GRAPHITEFURNACE,
    f => GraphiteFurnaceSystem.getStubs(f).graphiteOut, '_isGraphiteConveyor', '_graphiteConveyorSource');

  // Walk the fuel belt back to whatever fabricates this reactor's rods. The
  // MK1 eats uranium rods off a Fuel Processing Plant; the Advanced Reactor
  // eats MOX off an Advanced Fuel Processing plant. Same walk either way —
  // only the plant type, belt flag and buffer field change (see FUEL above).
  function hasRodConveyor(e) {
    const fuel      = fuelOf(e);
    const plantType = fuel.plant();
    const beltFlag  = plantType === T.MOXPLANT ? '_isMoxConveyor' : '_isRodConveyor';
    const { rodIn } = getStubs(e);
    const bins = [];
    // Every plant this belt reaches, nearest first. (It used to stop at the
    // first one: a reactor on a line shared by two plants drew only from
    // the nearer, and sat dark beside a full one once that ran dry, with
    // the full plant's rods riding the belt straight past it.)
    const sources = [];
    let flagged = false;
    const run = beltRun(rodIn.c, rodIn.r);
    for (let _i = 0; _i < run.n; _i++) {
      const ent = run.ent[_i], c = run.c[_i], r = run.r[_i], _p = run.par[_i];
      const pc = _p < 0 ? null : run.c[_p], pr = _p < 0 ? null : run.r[_p];
      // Accept the plant regardless of its current stock — fill logic handles empty buffers
      // ...but only through its rod OUT stub: a belt brushing another face
      // of the plant is not a fuel line.
      if (ent.type === plantType) {
        const out = plantType === T.MOXPLANT ? MoxPlantSystem.getStubs(ent).moxOut
                                             : FuelPlantSystem.getStubs(ent).convOut;
        if (arrivedByPort(out, pc, pr) && !sources.includes(ent)) sources.push(ent);
        continue;
      }
      // A Storage Container banking this fuel feeds the reactor the same way.
      if (SolidStorageSystem.isSourceOf(ent, fuel.kind, pc, pr)) {
        if (!bins.includes(ent)) bins.push(ent);
        continue;
      }
      // A fuel-flagged belt means rods are on their way here. Note it, but
      // keep walking: a Storage Container's own OUT belt carries that flag
      // too, and stopping here would never reach the bin behind it.
      if (isConveyorTile(ent) && ent[beltFlag]) flagged = true;
    }
    if (sources.length) return { found: true, source: sources[0], sources, bins };
    if (bins.length) return { found: true, source: null, sources, bins };
    if (flagged) {
      for (const fp of EntityRegistry.getByType(plantType)) return { found: true, source: fp, sources: [fp], bins };
      return { found: true, source: null, sources, bins };
    }
    return { found: false, source: null, sources, bins };
  }

  // ── Core heat ───────────────────────────────────────────────────
  // A reactor on the grid without cooling heats up: cold to critical in the
  // def's heatRiseSeconds, then MeltdownSystem's clock takes over and at
  // zero the reactor goes nuclear (LightningDamageSystem.detonateNuclear).
  //
  // "On the grid" = fission running: it has fuel and is burning it. Turbines don't
  // come into core heat — a running core with nothing drawing its steam is
  // still making heat (and builds steam pressure too, see tickSteamPressure). Taking it off the grid (by
  // cutting its fuel rods) does NOT stop the heating dead. Decay heat keeps it climbing: the heating
  // rate relaxes toward passive cooling with time constant DECAY_TAU, so the
  // core keeps rising for ~35 s and only then turns over. That carry-over is
  // worth roughly a quarter of the gauge: off the grid before ~75% and it
  // settles; later than that it still goes critical, and the countdown only
  // drains once the heat is actually falling — so the closer to critical it
  // was taken off, the likelier it detonates anyway, and taking it off once
  // it is already critical is too late. Only a working Cooling Tower pulls
  // heat out at once, three times as fast as it built.
  //
  // Uses the PREVIOUS tick's _generating / steam draw (turbines tick after
  // the reactor) — one tick of lag is invisible and it means every early
  // return in tick() still counts.
  const DECAY_TAU      = 25;    // seconds — decay-heat momentum after shutdown
  const PASSIVE_COOL   = 0.3;   // passive cooling, × heatRise, once decay heat has died away
  const ACTIVE_COOL    = 3;     // a working Cooling Tower, × heatRise

  function _onGrid(e) {
    return !!e._generating && !e._detonated;
  }

  // A reactor warning only goes up once its condition has held this long.
  // Power (and so cooling and the turbines) takes a moment to come back
  // after a load or a blip, and without this the overheating / steam cards
  // flashed up for a split second and vanished again.
  const WARN_GRACE = 3;   // seconds

  // Heat still to come from the current rate as it relaxes to passive
  // cooling — used for the "it will still go critical" warning.
  function _projectedPeak(h, rate, rise) {
    const target = -PASSIVE_COOL * rise;
    if (rate <= 0) return h;
    const t0 = DECAY_TAU * Math.log((rate - target) / -target);
    return h + target * t0 + (rate - target) * DECAY_TAU * (1 - Math.exp(-t0 / DECAY_TAU));
  }

  function tickCoreHeat(e, dt) {
    if (dt <= 0) return false;
    const def  = EntityDefs[e.type];
    const rise = 1 / (def.heatRiseSeconds || 60);
    const onGrid = _onGrid(e);
    let rate = e._heatRate || 0;
    // Coolant still running down the line from towers that can cover the
    // core: hold the heat rather than climb, the same grace steam gets on
    // its way to a turbine (_steamEnRoute). Once it arrives, or if it hasn't
    // in EN_ROUTE_MAX, the usual rules apply.
    const coolComing = onGrid && !e._cooled && (e._coolWaitFor || 0) < EN_ROUTE_MAX && _coolEnRoute(e);
    e._coolWaitFor = coolComing ? (e._coolWaitFor || 0) + dt : (onGrid && !e._cooled ? (e._coolWaitFor || 0) : 0);
    if (e._cooled)     rate = -ACTIVE_COOL * rise;
    else if (coolComing) rate = 0;
    else if (onGrid)   rate = rise;
    else {
      const target = -PASSIVE_COOL * rise;
      rate = target + (rate - target) * Math.exp(-dt / DECAY_TAU);
    }
    let h = Math.max(0, Math.min(1, (e._coreHeat || 0) + rate * dt));
    if (h === 0 && rate < 0) rate = 0;   // cold and settled
    e._coreHeat = h;
    e._heatRate = rate;
    const heating = rate > 0 && h > 0;

    // Early warning with a live countdown, from the first moment it heats —
    // MeltdownSystem's own card takes over once it is critical.
    const tag  = `reactorheat-${e.col},${e.row}`;
    const name = (def.label || 'Nuclear Reactor') + (e._num !== undefined ? ` #${e._num}` : '');
    e._heatWarnFor = (heating && h < 1) ? (e._heatWarnFor || 0) + dt : 0;
    if (heating && h < 1 && (e._heatWarnFor >= WARN_GRACE || NotificationStack.hasTag(tag))) {
      let msg;
      if (onGrid) {
        const secs = Math.ceil((1 - h) / rise + MeltdownSystem.limitFor(e));
        const why = _coolDiagnosis(e);
        const coolHint = why
          ? why + ' Or cut its fuel rods.'
          : e.type === T.ADVREACTOR
          ? 'Pipe Cryogenic Coolant from a Cryogenic Cooling Tower into CRYO IN, or cut its fuel rods.'
          : 'Pipe a Cooling Tower into COOL IN, or cut its fuel rods.';
        msg = `${name} has NO COOLING; core ${Math.round(h * 100)}%, nuclear detonation in ~${secs}s. `
            + coolHint;
      } else {
        const peak = _projectedPeak(h, rate, rise);
        const connectHint = e.type === T.ADVREACTOR
          ? 'Connect Cryogenic Coolant from a Cryogenic Cooling Tower NOW.'
          : 'Connect a Cooling Tower NOW.';
        msg = peak >= 1
          ? `${name} has stopped burning fuel but decay heat is still climbing; core ${Math.round(h * 100)}% and it WILL still go critical. ${connectHint}`
          : `${name} has stopped burning fuel; decay heat still climbing (core ${Math.round(h * 100)}%, peaking ~${Math.round(peak * 100)}%). It should settle.`;
      }
      if (!NotificationStack.updateTag(tag, { message: msg })) {
        NotificationStack.push({
          icon: '☢', title: 'Reactor overheating', message: msg,
          color: '#ffd040', border: '#ff3020', tag, glow: true, emergency: true,
          onClick: () => {
            Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE);
            EntityInfoPanel.open(e);
          },
        });
      }
    } else if (!heating && NotificationStack.hasTag(tag)) {
      NotificationStack.dismissTag(tag);
    }
    const p = tickSteamPressure(e, dt, onGrid, name);

    // Critical while the core (or the steam pressure) is pinned at 100% and
    // still being driven up; the countdown only drains once both are
    // genuinely coming down. One meltdown clock covers either cause.
    const heatHot     = h >= 1 && rate > 0;
    const pressureHot = p >= 1 && e._pressureRising;
    e._meltdownCause  = pressureHot && !heatHot ? 'pressure' : 'heat';
    return MeltdownSystem.tick(e, Math.max(h, p), heatHot || pressureHot, dt);
  }

  // ── Steam pressure ──────────────────────────────────────────────
  // A running reactor with no turbine drawing any of its steam has nowhere
  // to send it: pressure climbs to 100% over pressureRiseSeconds and then
  // shares the core-heat meltdown clock. Any one turbine running on its line
  // (or taking it off the grid) vents it. Uses the PREVIOUS tick's turbine pass —
  // _steamDrawnTick is set by SteamTurbineSystem, which ticks after this.
  //
  // Steam still running down its pipe to a turbine that can take it isn't
  // trapped: a turbine only draws once the steam has visibly reached its
  // STEAM IN (hasSteamPipe), so for the few seconds a fresh line fills the
  // reactor read as having nowhere to send it and threw the pressure card.
  // While it's on its way the gauge holds; once it arrives and still nothing
  // draws, it builds as before. EN_ROUTE_MAX stops a line that never fills
  // from holding it forever.
  const EN_ROUTE_MAX = 30;   // seconds
  function _steamEnRoute(e) {
    const { steamOut } = getStubs(e);
    const run = pipeRun(steamOut.c, steamOut.r, 'steam');
    for (let j = 0; j < run.pn; j++) {
      const t = run.pe[j];
      if (t.type !== T.STEAMTURBINE && t.type !== T.STEAMTURBINE2) continue;
      if (t._lightningDamaged || !t._hasPower) continue;
      const { steamIn } = SteamTurbineSystem.getStubs(t);
      if (steamIn.c !== run.ptc[j] || steamIn.r !== run.ptr[j]) continue;
      if (!pipeArrivedAt(steamIn.c, steamIn.r, 'steam')) return true;
    }
    return false;
  }
  // A reactor short of rods can make less steam than one turbine needs to run
  // at all, so none draws on it. That is a fuel shortage, not trapped steam:
  // so little has nowhere dangerous to go, and it read as NO TURBINE DRAWING
  // and ran the detonation clock beside turbines ready to take it.
  function _steamTooThin(e) {
    const { steamOut } = getStubs(e);
    const run = pipeRun(steamOut.c, steamOut.r, 'steam');
    for (let j = 0; j < run.pn; j++) {
      const t = run.pe[j];
      if (t.type !== T.STEAMTURBINE && t.type !== T.STEAMTURBINE2) continue;
      if (t._lightningDamaged || !t._hasPower) continue;
      const { steamIn } = SteamTurbineSystem.getStubs(t);
      if (steamIn.c !== run.ptc[j] || steamIn.r !== run.ptr[j]) continue;
      if ((e._currentOutput || 0) < (EntityDefs[t.type].steamDraw || 100)) return true;
    }
    return false;
  }
  // The cooling twin: towers on this reactor's COOL IN line that are running
  // (water in, powered, pumps up) and together cover its need, with the
  // coolant not yet arrived at the inlet.
  function _coolEnRoute(e) {
    const { coolIn } = getStubs(e);
    if (pipeArrivedAt(coolIn.c, coolIn.r, e.type === T.ADVREACTOR ? 'cryocool' : 'cool')) return false;
    const fluid = e.type === T.ADVREACTOR ? 'cryocool' : 'cool';
    const want  = e.type === T.ADVREACTOR ? T.COOLINGTOWER2 : T.COOLINGTOWER;
    const run = pipeRun(coolIn.c, coolIn.r, fluid);
    let cap = 0;
    const seen = new Set();
    for (let j = 0; j < run.pn; j++) {
      const t = run.pe[j];
      if (t.type !== want || seen.has(t) || !t._hotConnected || !t._coolConnected) continue;
      const { coldOut } = CoolingTowerSystem.getStubs(t);
      if (coldOut.c !== run.ptc[j] || coldOut.r !== run.ptr[j]) continue;
      seen.add(t);
      cap += EntityDefs[t.type].coldOutput || 15;
    }
    return cap >= (EntityDefs[e.type].coolWaterPerSec || 20);
  }
  function tickSteamPressure(e, dt, onGrid, name) {
    const def   = EntityDefs[e.type];
    const rise  = 1 / (def.pressureRiseSeconds || 90);
    const vent  = 1 / (def.pressureVentSeconds || 30);
    const blocked = onGrid && !e._steamDrawnTick && !_steamTooThin(e);
    const enRoute = blocked && (e._steamWaitFor || 0) < EN_ROUTE_MAX && _steamEnRoute(e);
    e._steamWaitFor = enRoute ? (e._steamWaitFor || 0) + dt : (blocked ? (e._steamWaitFor || 0) : 0);
    const building = blocked && !enRoute;
    let p = e._steamPressure || 0;
    p = Math.max(0, Math.min(1, p + (building ? rise : enRoute ? 0 : -vent) * dt));
    e._steamPressure  = p;
    e._pressureRising = building;

    const tag = `reactorpressure-${e.col},${e.row}`;
    e._pressureWarnFor = (building && p < 1) ? (e._pressureWarnFor || 0) + dt : 0;
    if (building && p < 1 && (e._pressureWarnFor >= WARN_GRACE || NotificationStack.hasTag(tag))) {
      const secs = Math.ceil((1 - p) / rise + MeltdownSystem.limitFor(e));
      const msg = `${name} is making steam but NO turbine is drawing it; pressure ${Math.round(p * 100)}%, detonation in ~${secs}s. `
                + 'Pipe a powered Steam Turbine to its STEAM OUT, or cut its fuel rods.';
      if (!NotificationStack.updateTag(tag, { message: msg })) {
        NotificationStack.push({
          icon: '♨', title: 'Reactor steam pressure', message: msg,
          color: '#ffd040', border: '#ff3020', tag, glow: true, emergency: true,
          onClick: () => {
            Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE);
            EntityInfoPanel.open(e);
          },
        });
      }
    } else if (!building && NotificationStack.hasTag(tag)) {
      NotificationStack.dismissTag(tag);
    }
    return p;
  }

  // Why a reactor with a pipe on its coolant inlet is still uncooled — the
  // overheating card used to say "pipe a tower into CRYO IN" even when one
  // was piped in, because the break was further up the chain (usually a
  // Cryogenic tower starved of cooled water at its own COOL IN). Walks the
  // pipe run back from the inlet, ignoring fluid flags, to the towers on it.
  // Returns a sentence, or null when nothing is piped in at all.
  function _coolDiagnosis(e) {
    const { coolIn } = getStubs(e);
    const seed = GridManager.getEntity(coolIn.c, coolIn.r);
    if (!seed || !getPipe(seed)) return null;
    const wantType = e.type === T.ADVREACTOR ? T.COOLINGTOWER2 : T.COOLINGTOWER;
    const outs = new Map();
    for (const tw of EntityRegistry.getByType(wantType)) {
      const o = CoolingTowerSystem.getStubs(tw).coldOut;
      outs.set(`${o.c},${o.r}`, tw);
    }
    const found = [], visited = new Set(), queue = [[coolIn.c, coolIn.r]];
    while (queue.length && visited.size < 4096) {
      const [c, r] = queue.shift();
      const key = `${c},${r}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const tile = GridManager.getEntity(c, r);
      if (!tile || !getPipe(tile)) continue;
      const tw = outs.get(key);
      if (tw && !found.includes(tw)) found.push(tw);
      for (const [nc, nr] of pipeBfsCoords(c, r, null))
        if (GridManager.inBounds(nc, nr) && !visited.has(`${nc},${nr}`)) queue.push([nc, nr]);
    }
    const tName = e.type === T.ADVREACTOR ? 'Cryogenic Cooling Tower' : 'Cooling Tower';
    const outName = e.type === T.ADVREACTOR ? 'CRYO OUT' : 'COLD OUT';
    if (!found.length) return `The pipe at its inlet doesn't reach a ${tName}'s ${outName}.`;
    const tw = found[0];
    if (tw._pumpTripped) return `Its ${tName} has tripped pumps; they restart after it has had power for a while.`;
    if (!tw.powered) return `Its ${tName} has no power.`;
    if (e.type === T.ADVREACTOR && !tw._hasCoolWater) {
      // Usually the Cooling Towers feeding it have lost their own water.
      const dry = [...EntityRegistry.getByType(T.COOLINGTOWER)].find(t => t._pipeIn && !t._hotConnected);
      if (dry) return `Its ${tName} is getting no cooled water: the Cooling Towers feeding it have no water coming in. ${CoolingTowerSystem.waterCutCause(dry).text}`;
      const need = EntityDefs[T.COOLINGTOWER2].coolWaterPerSec || 70;
      const per  = EntityDefs[T.COOLINGTOWER].coldOutput || 12;
      return `Its ${tName} is getting no cooled water: it needs ${need} u/s at COOL IN from Cooling Towers' COLD OUT `
           + `(about ${Math.ceil(need / per)} Cooling Towers' worth, after any reactors on the same line take theirs).`;
    }
    if (!tw._hotConnected) return `Its ${tName} has no water coming in. ${CoolingTowerSystem.waterCutCause(tw).text}`;
    const need = EntityDefs[e.type].coolWaterPerSec || 20;
    return `Its ${tName} can't supply enough coolant (this reactor needs ${need} u/s); add another ${tName} to the line.`;
  }

  // Cooling is a metered supply, not a yes/no connection. Two fluids:
  //
  //   cool     — MK1 Cooling Tower COOL OUT. Feeds Nuclear Reactors and the
  //              Cryogenic Cooling Tower's COOL IN (coolWaterPerSec).
  //   cryocool — Cryogenic Cooling Tower CRYO OUT. Feeds Advanced Reactors
  //              only. Ordinary cooled water will not cool a MOX core.
  //
  // Each producer pushes its def's coldOutput units/s; each consumer draws
  // coolWaterPerSec against the matching fluid. All-or-nothing allocation,
  // oldest consumer first — same rule as PowerNetwork's water allocator.
  //
  // Resolved once per frame for the whole map rather than per reactor. Runs
  // between the tower ticks and the reactor ticks (see game_loop.js), so
  // every tower's _hotConnected / _coolConnected is current and every
  // reactor's _cooled is set before the reactor loop reads it.
  // Bumped every resolveCooling pass; a pipe's _coolNet tally only counts
  // when its gen matches, so a line that stopped running reads as nothing.
  let _coolNetGen = 0;

  function resolveCooling() {
    const capacityOf = (tw) => (EntityDefs[tw.type] || EntityDefs[T.COOLINGTOWER]).coldOutput || 12;
    const gen = ++_coolNetGen;

    for (const type of [...REACTOR_TYPES, T.ADVFUSIONREACTOR]) for (const reactor of EntityRegistry.getByType(type)) {
      reactor._cooled      = false;
      reactor._coolTower   = null;
      reactor._coolStarved = false;
      reactor._coolSupplied = 0;
      reactor._coolAvailable = 0;
    }
    for (const tower of EntityRegistry.getByType(T.COOLINGTOWER2)) {
      tower._hasCoolWater = false;
      tower._coolShort    = false;
    }
    for (const type of CoolingTowerSystem.TOWER_TYPES)
    for (const tower of EntityRegistry.getByType(type)) {
      tower._coolServed = 0;
      tower._coldDrawn  = 0;
      tower._coolLeft   = 0;
    }

    // Shared allocate helper: pool every reachable producer's remaining
    // capacity into each consumer, all-or-nothing, oldest first.
    function allocate(reachable, needOf, onShort, onFed) {
      const ordered = [...reachable.keys()].sort((a, b) =>
        (a._placedAt || 0) - (b._placedAt || 0) || a.col - b.col || a.row - b.row);
      for (const consumer of ordered) {
        const towers = reachable.get(consumer);
        const need   = needOf(consumer);
        let pooled = 0;
        for (const tw of towers) pooled += tw._coolLeft;
        if (pooled < need - 0.001) { onShort(consumer, pooled, need); continue; }
        let short = need;
        for (const tw of towers) {
          if (short <= 0) break;
          const give = Math.min(tw._coolLeft, short);
          tw._coolLeft -= give;
          tw._coldDrawn = (tw._coldDrawn || 0) + give;
          short -= give;
          if (give > 0) { tw._coolServed++; consumer._coolTower = consumer._coolTower || tw; }
        }
        onFed(consumer, need);
      }
    }

    function bfsReachable(producers, inlets, fluid) {
      const reachable = new Map();
      // The inlet table is keyed "c,r"; look tiles up by number instead, so a
      // string isn't built for every pipe the search walks over (same results).
      const inletByNum = new Map();
      for (const [k, v] of inlets) {
        const [ic, ir] = k.split(',').map(Number);
        inletByNum.set((ir + 8) * 65536 + (ic + 8), v);
      }
      for (const tower of producers) {
        tower._netPipes = null;
        if (!tower._hotConnected || !tower._coolConnected) continue;
        tower._coolLeft = capacityOf(tower);
        const netPipes = tower._netPipes = [];
        const stub = CoolingTowerSystem.getStubs(tower).coldOut;
        const run = pipeRun(stub.c, stub.r, fluid);
        for (let i = 0; i < run.n; i++) {
          netPipes.push(run.pipe[i]);
          const consumer = inletByNum.get((run.r[i] + 8) * 65536 + (run.c[i] + 8));
          // Fed only once the coolant has visibly run down to its inlet.
          if (consumer && pipeArrived(run.pipe[i], fluid)) {
            if (!reachable.has(consumer)) reachable.set(consumer, []);
            const list = reachable.get(consumer);
            if (!list.includes(tower)) list.push(tower);
          }
        }
      }
      return reachable;
    }

    // Per-line tally for the pipe panel: every pipe on one connected run
    // shares one object — total the towers put in, how much consumers drew,
    // and each consumer on the line with whether it got its full need.
    // Stamped after allocate(), so it matches exactly what was handed out.
    function stampLines(producers, inlets, fluid, isFed) {
      for (const tower of producers) {
        const pipes = tower._netPipes;
        if (!pipes || !pipes.length) continue;
        let line = pipes[0]._coolNet;
        if (!line || line.gen !== gen) {
          line = { gen, fluid, supplied: 0, drawn: 0, towers: 0, consumers: [] };
        }
        for (const p of pipes) p._coolNet = line;
        line.supplied += capacityOf(tower);
        line.drawn    += tower._coldDrawn || 0;
        line.towers++;
      }
      for (const [key, consumer] of inlets) {
        const [c, r] = key.split(',').map(Number);
        const tile = GridManager.getEntity(c, r);
        const pipe = tile && getPipe(tile);
        const line = pipe && pipe._coolNet;
        if (!line || line.gen !== gen) continue;
        line.consumers.push({
          entity: consumer,
          need: EntityDefs[consumer.type].coolWaterPerSec || 20,
          fed: isFed(consumer),
        });
      }
    }

    // ── Pass 1: cooled water (cool) from MK1 → uranium reactors + cryo towers ──
    // Cryo towers drink cooled water at COOL IN; they never produce cool, so
    // they cannot feed themselves or another cryo through their own CRYO OUT.
    const coolInlets = new Map();
    for (const reactor of EntityRegistry.getByType(T.NUCLEARREACTOR)) {
      const { coolIn } = getStubs(reactor);
      coolInlets.set(`${coolIn.c},${coolIn.r}`, reactor);
    }
    for (const tower of EntityRegistry.getByType(T.COOLINGTOWER2)) {
      const { hotIn } = CoolingTowerSystem.getStubs(tower);
      coolInlets.set(`${hotIn.c},${hotIn.r}`, tower);
    }
    const coolReachable = bfsReachable(
      EntityRegistry.getByType(T.COOLINGTOWER), coolInlets, 'cool');
    allocate(
      coolReachable,
      (c) => EntityDefs[c.type].coolWaterPerSec || 20,
      (c, pooled) => {
        // Kept for the panels: how much spare cool actually reached this
        // inlet, so "short" can say by how much.
        c._coolAvailable = pooled;
        if (c.type === T.COOLINGTOWER2) c._coolShort = true; else c._coolStarved = true;
      },
      (c, need) => {
        if (c.type === T.COOLINGTOWER2) {
          c._hasCoolWater = true;
          c._coolShort    = false;
        } else {
          c._coolSupplied = need;
          c._cooled       = true;
          c._coolStarved  = false;
        }
      });
    stampLines(EntityRegistry.getByType(T.COOLINGTOWER), coolInlets, 'cool',
      (c) => c.type === T.COOLINGTOWER2 ? !!c._hasCoolWater : !!c._cooled);

    // ── Pass 2: Cryogenic Coolant (cryocool) from cryo towers → Advanced Reactors ──
    // and the Advanced Fusion Reactor's CRYO IN (its converters' waste heat).
    const cryoInlets = new Map();
    for (const reactor of EntityRegistry.getByType(T.ADVREACTOR)) {
      const { coolIn } = getStubs(reactor);
      cryoInlets.set(`${coolIn.c},${coolIn.r}`, reactor);
    }
    if (typeof AdvancedFusionReactorSystem !== 'undefined')
      for (const afr of EntityRegistry.getByType(T.ADVFUSIONREACTOR)) {
        const { coolantIn } = AdvancedFusionReactorSystem.getStubs(afr);
        cryoInlets.set(`${coolantIn.c},${coolantIn.r}`, afr);
      }
    const cryoReachable = bfsReachable(
      EntityRegistry.getByType(T.COOLINGTOWER2), cryoInlets, 'cryocool');
    allocate(
      cryoReachable,
      (c) => EntityDefs[c.type].coolWaterPerSec || 44,
      (c, pooled) => { c._coolAvailable = pooled; c._coolStarved = true; },
      (c, need) => {
        c._coolSupplied = need;
        c._cooled       = true;
        c._coolStarved  = false;
      });
    stampLines(EntityRegistry.getByType(T.COOLINGTOWER2), cryoInlets, 'cryocool', (c) => !!c._cooled);

    for (const type of CoolingTowerSystem.TOWER_TYPES)
    for (const tower of EntityRegistry.getByType(type)) {
      if (tower._coolServed) { tower._active = true; tower._activeThisTick = true; }
    }
  }

  // Mark pipes carrying steam from the STEAM OUT stub — same BFS marking
  // pattern as ChemicalSystem's acid OUT / CoolingTowerSystem's COLD OUT,
  // so a pipe run off the reactor lights up whenever the reactor is
  // generating. Factored out so both the normal (dt>0) tick path and the
  // frozen (paused) path can re-run it — pipe flags get wiped every tick
  // regardless of pause state, so re-marking has to happen either way.
  function markSteamPipes(e) {
    const { steamOut } = getStubs(e);
    const run = pipeRun(steamOut.c, steamOut.r, 'steam');
    const rate = e._steamOutput || 0;
    for (let i = 0; i < run.n; i++) {
      const p = run.pipe[i];
      p._steamActive = true;
      p._flowRate = rate;
    }
  }

  return {
    tick(e, dt) {
      const def = EntityDefs[e.type];
      if (!def) return;

      // Frozen while paused (dt === 0) — otherwise rodConsumed below
      // computes to 0 every single tick and the "no fuel flowing" branch
      // trips, switching the reactor (and every Steam Turbine drawing off
      // it) to offline purely because time isn't advancing, not because
      // anything actually ran out. Leaving _generating/_currentOutput
      // untouched just holds whatever was last computed (same pattern as
      // CoalSystem.tickGenerator's own dt<=0 guard).
      if (dt <= 0) {
        // Still re-mark steam pipes off the frozen _generating state —
        // game_loop.js's clearSteamPipeFlags() wipes every pipe's
        // _steamActive flag each tick regardless of pause state, so without
        // this the pipe-flow animation reads as "stopped" the instant the
        // rest of tick() below starts getting skipped.
        if (e._generating) markSteamPipes(e);
        return;
      }

      e._hasRods   = false;
      e._wasteOut  = false;

      // Mark the SPENT FUEL output belt. Same shape as the fuel plant's rod
      // belt above (distance, source reference and per-tile travel direction,
      // not just an on/off flag): spent fuel is a real carried quantity now,
      // so a downstream consumer BFSes back along these flags to find the
      // reactor and draws from e._spentFuel directly — the same contract
      // every other belt solid uses (see SolidStorageSystem.KINDS).
      if ((e._spentFuel || 0) > 0 && e.powered) {
        const { wasteOut } = getStubs(e);
        e._wasteOut = true;
        const run = beltRun(wasteOut.c, wasteOut.r);
        for (let i = 0; i < run.n; i++) {
          if (!run.belt[i]) continue;
          const tile = run.ent[i], c = run.c[i], r = run.r[i], pi = run.par[i];
          const fromC = pi < 0 ? wasteOut.c - 1 : run.c[pi], fromR = pi < 0 ? wasteOut.r : run.r[pi];
          tile._isSpentFuelConveyor     = true;
          tile._spentFuelConveyorDist   = run.d[i];
          tile._spentFuelConveyorSource = e;
          tile._spentFuelFlowDC         = Math.sign(c - fromC);
          tile._spentFuelFlowDR         = Math.sign(r - fromR);
          tile._flowRate = def.spentFuelPerSec;
        }
      }

      // Check rod input
      const rodResult = hasRodConveyor(e);
      e._hasRods = rodResult.found;

      // _cooled is set for every reactor by resolveCooling() before this loop
      // runs (see game_loop.js) — unconditionally, since the panel needs it
      // regardless of rod/power state.

      // Reactor is a generator — does not need e.powered to run.
      // PowerNetwork reads e._generating / e._currentOutput directly for supply.
      // That also means the network's own "struck buildings are dead weight"
      // skip never reaches it: the reactor's output is STEAM, which the
      // turbines turn into watts. So a burning reactor has to shut itself
      // down here, or its turbines keep generating off a wreck.
      if (e._lightningDamaged) {
        e._generating    = false;
        e._currentOutput = 0;
        return;
      }

      // Meltdown check — returns true if it just went nuclear.
      if (tickCoreHeat(e, dt)) return;

      // A core that has blown (on a job site, where the wreck is not put
      // through the damage system): no fission, no steam.
      // Its heat still has to bleed off (decay heat, see tickCoreHeat).
      if (e._detonated) { e._generating = false; e._currentOutput = 0; return; }

      const rodCap       = def.rodCapacity       || 50;
      const spentFuelCap = def.spentFuelCapacity || 100;
      e._rodBuffer = e._rodBuffer || 0;
      if (e._spentFuel === undefined) e._spentFuel = 0;
      checkWasteBuildup(e, (e._spentFuel / spentFuelCap) * 100, 'Spent fuel');

      // Fill rod buffer from the fabricator (Fuel Processing Plant for the
      // MK1, Advanced Fuel Processing for MOX — see FUEL).
      const _fuel = fuelOf(e);
      // On a contract crew's job the rods stay out of the core until the
      // build is whole and this reactor's cooling is running
      // (ContractSystem.fuelHeld): the reason, or false.
      e._crewHeld = (typeof ContractSystem !== 'undefined' && ContractSystem.fuelHeld?.(e)) || false;
      if (!e._crewHeld && rodResult.found && rodResult.source) {
        // No free startup charge: an empty plant used to be seeded with 30%
        // of its buffer whenever it and the reactor were both dry, which
        // re-armed every time they ran out — a reactor burned for ever off a
        // plant that had never seen acid or uranium. The plant's own inputs
        // are the only source of fuel now; power to start the chain comes
        // from the rest of the grid (or the site's standing supply).
        let rodNeed = Math.min(def.rodPerSec * dt * 10, rodCap - e._rodBuffer);
        for (const src of rodResult.sources && rodResult.sources.length ? rodResult.sources : [rodResult.source]) {
          const stock = src[_fuel.field] || 0;
          // Nothing arrives until the rods have had time to travel the belt.
          // Claimed even from an empty plant, so a reactor ticking later still gets its share (BeltShare).
          const rodShare = BeltShare.cap(src, e, stock, rodNeed, _fuel.kind);
          const avail   = BeltCargo.reach(src, e, _fuel.kind) ? stock : 0;
          const take    = avail > 0 ? Math.min(avail, rodNeed, rodShare) : 0;
          if (take <= 0) continue;
          src[_fuel.field] -= take;
          e._rodBuffer += take;
          rodNeed -= take;
          BeltCargo.moved(src, e, _fuel.kind, take);
        }
      }
      // Rods banked in a Storage Container top the buffer up too — and are
      // the only supply once the fuel plant itself is empty or offline.
      if (!e._crewHeld && rodResult.bins && rodResult.bins.length && e._rodBuffer < rodCap) {
        e._rodBuffer += SolidStorageSystem.drawFrom(rodResult.bins,
          Math.min(def.rodPerSec * dt * 10, rodCap - e._rodBuffer), e, _fuel.kind);
      }

      // Graphite reflector (Advanced Reactor only, optional): top the block
      // store up off its belt. Burned below while it generates.
      e._hasGraphite = false;
      if (def.graphitePerSec && typeof GraphiteFurnaceSystem !== 'undefined') {
        if (e._graphite === undefined) e._graphite = 0;
        const gf = graphiteFeed(e);
        e._hasGraphite = gf.found;
        const gRoom = (def.graphiteCapacity || 40) - e._graphite;
        if (gf.found && gRoom > 0) e._graphite += _fcBeltDraw(gf, Math.min(gRoom, def.graphitePerSec * dt * 10), e, 'graphite', '_graphite');
      }

      // Can't run without rods connected, or with the cask store full.
      // Draining it is the player's job: belt the spent fuel out to a
      // consumer, or have a truck haul it to the Nuclear Waste Facility.
      if (!rodResult.found) { e._generating = false; return; }
      if (e._spentFuel >= spentFuelCap) { e._generating = false; return; }

      // Consume rods proportionally to what's available — reactor runs at
      // full output as long as any fuel is flowing; throttles only when starved.
      const rodConsumed = Math.min(def.rodPerSec * dt, e._rodBuffer);
      if (rodConsumed <= 0) { e._generating = false; return; }
      const powerFraction = rodConsumed / (def.rodPerSec * dt);

      // Apply cooling factor
      const coolingFactor = e._cooled ? 1.0 : 0.4;

      // Consume rods, generate power, produce waste
      e._rodBuffer = Math.max(0, e._rodBuffer - rodConsumed);
      e._generating = true;
      // _currentOutput is steam/thermal output, not grid power — the
      // reactor no longer feeds the wire network directly. A connected
      // Steam Turbine (see SteamTurbineSystem below) converts this into
      // actual electricity, capped at its own powerOutput rating.
      // A stocked graphite reflector lifts the steam (graphiteBoost); the
      // blocks wear in proportion to the burn.
      let reflector = 1;
      e._reflected = false;
      if (def.graphitePerSec && (e._graphite || 0) > 0) {
        const gUse = Math.min(e._graphite, def.graphitePerSec * dt * powerFraction);
        e._graphite -= gUse;
        totalGraphiteBurned += gUse;
        reflector = def.graphiteBoost || 1;
        e._reflected = true;
      }
      e._currentOutput = Math.round((def.steamOutput || 300) * coolingFactor * powerFraction * reflector);
      totalPowerGenerated += e._currentOutput * dt;
      // Spent fuel accrues at the same pace the old percentage did — a full
      // cask store over 6 in-game days at full power — so nothing about the
      // haul loop's balance moves with this change.
      const _nucSpd = DayNight.secondsPerGameHour() * 24;
      const _days   = def.spentFuelPerDay || 6;
      const _made = Math.min(spentFuelCap - e._spentFuel,
                             (spentFuelCap / (_days * _nucSpd)) * dt * powerFraction * WASTE_RATE_MULT);
      e._spentFuel     += _made;
      BeltCargo.produced(e, 'spent', _made);
      totalSpentFuel   += _made;
      WasteSystem.checkAvailability(e.type, e);

      markSteamPipes(e);
    },

    resolveCooling,
    coolNetGen() { return _coolNetGen; },

    REACTOR_TYPES,
    fuelKindOf(e) { return fuelOf(e).kind; },

    clearWasteFlags() {
      for (const e of EntityRegistry.getByType(T.CONVEYOR)) {
        e._isSpentFuelConveyor     = false;
        e._spentFuelConveyorSource = null;
      }
    },

    // Cumulative spent fuel ever produced, across every reactor — the
    // natural gate for the reprocessing tech that consumes it.
    getTotalSpentFuel()      { return totalSpentFuel; },
    loadTotalSpentFuel(v)    { totalSpentFuel = v || 0; },
    getTotalGraphiteBurned()   { return totalGraphiteBurned; },
    loadTotalGraphiteBurned(v) { totalGraphiteBurned = v || 0; },

    // Clear steam-active flags for all pipes — called once per tick, right
    // before the reactor tick loop below recomputes them (same pattern as
    // ChemicalSystem.clearAcidPipeFlags / CoolingTowerSystem.clearCoolPipeFlags).
    clearSteamPipeFlags() {
      for (const p of allPipes()) p._steamActive = false;
    },

    isGenerating(e) { return !!(e._generating); },
    getTotalPower()  { return totalPowerGenerated; },
    getStubs,
  };
})();


// ─── Steam Turbine System ─────────────────────────────────────────
// Converts steam from a physically pipe-connected Nuclear Reactor into
// grid electricity. Needs BOTH:
//   • STEAM — a pipe run of its own (carrying the 'steam' fluid) reaching
//     from its STEAM IN stub back to a reactor that's actively generating.
//     Same BFS-through-pipes pattern as FuelPlantSystem.hasAcidPipe.
//   • POWER — a wire or pole physically touching it, checked topologically
//     (direct adjacency) rather than via e.powered, since e.powered comes
//     out of PowerNetwork's supply/demand pass and the turbine IS the
//     supply for its own network — gating on e.powered would deadlock a
//     network with no other demand (never turns on because it's never
//     "powered", never "powered" because it never turns on).
// A reactor's steam output is a shared budget (up to its _currentOutput,
// capped at steamOutput=300) — each turbine draws up to STEAM_DRAW (100)
// units of it per tick, first-come across however many turbines are piped
// to that reactor, so a single fully-cooled reactor can feed up to 3
// turbines (300 / 100) before the budget runs out and further turbines on
// the same reactor sit starved at 0 kW.
const SteamTurbineSystem = (() => {
  let totalPowerGenerated = 0;

  // Stub: STEAM IN on left face (col-1), on the shaft's axis row. The STEAM
  // IN valve in render_oil_nuclear.js is drawn from this — same "pipe's
  // visible end lines up with the valve icon" convention as
  // NuclearSystem.getStubs(). A 14×10 turbine's axis is row+4; one built
  // before the resize keeps its saved size and row+2.
  // The MK2 (24×14) takes steam on its shaft's axis row, mid-face.
  function getStubs(e) {
    if (e.type === T.STEAMTURBINE2) return { steamIn: { c: e.col - 1, r: e.row + Math.floor((e.height || 14) / 2) } };
    const h = e.height || 10;
    return { steamIn: { c: e.col - 1, r: e.row + (h <= 7 ? 2 : 4) } };
  }

  // BFS from the STEAM IN stub through the pipe network looking for every
  // actively-generating reactor reachable — a shared/looped pipe network can
  // touch more than one reactor, so this keeps walking past the first hit
  // instead of stopping there (mirrors FuelPlantSystem.hasAcidPipe, but
  // collects all sources rather than returning on the first match). Order
  // is BFS discovery order, i.e. roughly nearest-first, so tick() below
  // tries the closest reactor's budget before falling back to farther ones.
  function hasSteamPipe(e) {
    const { steamIn } = getStubs(e);
    // The steam line is walked once and kept (pipeRun): every turbine on it
    // reads the same run instead of flooding it again each tick.
    const run = pipeRun(steamIn.c, steamIn.r, 'steam');
    const sources = [];
    for (let j = 0; j < run.pn; j++) {
      const nb = run.pe[j], c = run.ptc[j], r = run.ptr[j];
      // A D-T Fusion Reactor raises steam off its breeding blanket, so it
      // feeds turbines the same way (_steamGenerating / _steamOutput).
      // A fission reactor only counts when this pipe tile is its STEAM OUT
      // stub. Any pipe that merely ran alongside the reactor's wall used
      // to count, so a turbine line passing a second reactor (or sharing
      // a tile with its cooling run) drew that reactor's steam and vented
      // its pressure with nothing on its STEAM OUT at all.
      const isReactor = nb.type === T.NUCLEARREACTOR || nb.type === T.ADVREACTOR;
      if (isReactor) {
        if (!nb._generating) continue;
        const s = NuclearSystem.getStubs(nb).steamOut;
        if (s.c === c && s.r === r && !sources.includes(nb)) sources.push(nb);
      } else if (nb.type === T.HULKINGFUSIONREACTOR) {
        if (nb._steamGenerating && atOutPort(HulkingFusionReactorSystem.getStubs(nb).powerOut, c, r)
            && !sources.includes(nb)) sources.push(nb);
      }
    }
    // No steam to draw until it has visibly run down the line to STEAM IN.
    if (!pipeArrivedAt(steamIn.c, steamIn.r, 'steam')) sources.length = 0;
    return { found: sources.length > 0, sources };
  }

  function hasWireConnection(e) {
    for (const n of GridManager.getNeighbours(e.col, e.row)) {
      const nb = n.entity;
      // A wire still counts when a pipe or belt has been laid over it: the
      // tile then reads as the pipe, with the wire carried underneath.
      if (nb && (nb.type === T.WIRE || nb.type === T.POLE || nb._underWire)) return true;
    }
    return false;
  }

  return {
    // Called once per tick, before ticking every turbine — refills each
    // generating reactor's shared steam budget so this tick's turbines all
    // draw from a fresh pool (same "reset, then per-entity recompute"
    // pattern as NuclearSystem.clearWasteFlags / clearSteamPipeFlags).
    // _steamUsed / _turbinesFed keep the last tick's tally of what turbines
    // drew, for the reactor panels (budgets are full again once reset).
    resetSteamBudgets() {
      const tally = (r) => {
        r._steamUsed   = r._steamUsedTick || 0;   r._steamUsedTick = 0;
        r._turbinesFed = r._turbinesTick  || 0;   r._turbinesTick  = 0;
      };
      for (const type of [T.NUCLEARREACTOR, T.ADVREACTOR])
        for (const r of EntityRegistry.getByType(type)) {
          tally(r);
          r._steamRemaining = r._generating ? (r._currentOutput || 0) : 0;
          r._steamDrawnTick = false;   // set again below by any turbine drawing on it
        }
      for (const r of EntityRegistry.getByType(T.HULKINGFUSIONREACTOR)) {
        tally(r);
        r._steamRemaining = r._steamGenerating ? (r._steamOutput || 0) : 0;
      }
    },

    // Ticks both the MK1 and the MK2: each reads its own steamDraw and
    // powerOutput off its type's def.
    tick(e, dt) {
      const def = EntityDefs[e.type] || EntityDefs[T.STEAMTURBINE];
      if (!def) return;

      const pipeResult = hasSteamPipe(e);
      e._steamConnected = pipeResult.found;
      e._hasPower        = hasWireConnection(e);

      if (!pipeResult.found || !e._hasPower || e._lightningDamaged) {
        e._generating    = false;
        e._currentOutput = 0;
        return;
      }

      // Fixed requirement, not a proportional draw: a turbine needs its
      // full steamDraw (100) available on a reachable reactor's shared
      // budget to run at all. Once fed, it converts that draw into its
      // full rated powerOutput (300 kW) — the 100-unit "cost" is what limits
      // a single reactor to feeding 3 turbines (300 / 100), not what scales
      // each one's output down to 100 kW.
      // A shared/looped pipe network can reach more than one reactor, so
      // try each reachable reactor in turn (nearest first) rather than
      // giving up when the first one's budget is already spent — otherwise
      // turbines that happen to resolve to an exhausted reactor sit starved
      // even while a second reactor on the same network has spare budget.
      //
      // Of the reactors with room, draw on the one with the most steam left
      // (the nearest on a tie), so the turbines on a shared line are spread
      // across its reactors. Nearest-first put all three turbines of a
      // two-reactor line on the nearer reactor: the other, on the same pipe,
      // had nothing drawn from it, read NO TURBINE DRAWING and built
      // pressure to a detonation beside turbines that were running.
      const steamDraw = def.steamDraw || 100;
      let reactor = null;
      for (const r of pipeResult.sources)
        if ((r._steamRemaining || 0) >= steamDraw && (!reactor || r._steamRemaining > reactor._steamRemaining)) reactor = r;

      if (!reactor) {
        e._generating      = false;
        e._currentOutput   = 0;
        e._steamSourceType = null;
        return;
      }

      reactor._steamRemaining -= steamDraw;
      reactor._steamUsedTick = (reactor._steamUsedTick || 0) + steamDraw;
      reactor._turbinesTick  = (reactor._turbinesTick  || 0) + 1;
      // A running turbine vents every reactor on its line (NuclearSystem's
      // steam pressure), not only the one it drew on: the steam has somewhere
      // to go. With one turbine running on a two-reactor line, the other
      // reactor had nothing drawn from it and built to a detonation.
      for (const r of pipeResult.sources) r._steamDrawnTick = true;
      e._generating    = true;
      // A Fusion Reactor's fleet bonus (HulkingFusionReactorSystem) lifts the
      // turbines it feeds.
      e._currentOutput = reactor.type === T.HULKINGFUSIONREACTOR && typeof HulkingFusionReactorSystem !== 'undefined'
        ? def.powerOutput * HulkingFusionReactorSystem.getMultiplier(reactor) : def.powerOutput;
      // Which reactor this turbine is actually running on THIS tick. A
      // shared pipe network can reach several, and `find` above picks
      // whichever has budget, so the answer genuinely changes tick to tick —
      // it cannot be worked out from the pipes alone. Progression reads this
      // to tell plutonium-fired turbines from uranium-fired ones.
      e._steamSourceType = reactor.type;
      totalPowerGenerated += e._currentOutput * dt;
    },

    isGenerating(e) { return !!(e._generating); },
    getTotalPower()  { return totalPowerGenerated; },
    loadTotalPower(v) { if (v !== undefined) totalPowerGenerated = v; },
    getStubs,
  };
})();


