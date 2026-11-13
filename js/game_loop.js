/* ═══════════════════════════════════════════════════════════════════
   GAME LOOP
   Core fixed-tick update/render loop.
   ═══════════════════════════════════════════════════════════════════ */

const GameLoop = (() => {
  const TICK_RATE    = 100;   // ms between logic ticks
  let   lastTick     = 0;
  let   lastRender   = 0;
  let   startTime    = performance.now();

  const _sys = (name, fn) => { try { fn(); } catch(e) { console.error('[CRASH in', name + ']', e); DevMode.setTimeScale(0); throw e; } };

  // ── The logic tick, in five parts ────────────────────────────────
  // One tick is the same work in the same order it always was, but the frame
  // loop no longer has to do all of it in one frame. On a built-up map a tick
  // is several frames' worth of time, and done at once it was a hitch ten
  // times a second however fast the frames in between were. So it is cut at
  // the places where the world is in a state the renderer can be shown:
  //
  //   1. grid       the clock, weather, the power network and water — who
  //                 has power and who does not
  //   2. machines   every producer, consumer, pipe and belt, in three parts.
  //                 Each system's "carrying X" flags on its pipes and belts
  //                 are wiped and re-marked inside that system's own block,
  //                 so the cut goes between two blocks that share no flags:
  //                 after the oil block, which clears and re-lights every
  //                 crude, fuel oil and LPG pipe itself (acid lit by its tank
  //                 chains is put back by clearAcidPipeFlags), and before the
  //                 Tritium Breeders (see _tickMachinesC). Drawn between two
  //                 parts, the earlier part's lines show this tick and the
  //                 rest still show the last one. Any other cut needs the same
  //                 check, or lines flicker empty: tritium and steam are each
  //                 wiped in one block and re-marked in a later one.
  //   3. world      events, economy, scores, audio and the HUD
  //
  // The frame loop runs one part per frame (see frame()); tick() below runs
  // them all at once and is what GameLoop.step() uses.
  let _tk = null;                 // the tick under way: { dt, simDt, part, ms, topo }
  const WORLD_REPLACED = 5000;    // registry changes between two parts that can only be a load or a contract trip

  // Returns false if there is nothing more to do (paused: the presentation
  // layer has already run).
  function _tickStart() {
    SIM_TICK_ID++;   // see resource_helpers.js: once-per-tick caches key off this
    const dt    = TICK_RATE / 1000;                      // fixed 0.1s real-time step
    const simDt = dt * (DevMode.timeScale ?? 1);        // scaled sim step for cheap systems (?? not || so paused = 0 stays 0)
    // Paused means nothing happens. Every system used to keep ticking with
    // dt = 0, and any of them that acts on STATE rather than elapsed time
    // still fired while paused — unlock checks, customer requests, waste
    // warnings, truck dispatch ("no route"), auto-dispatch planning (which
    // runs on real seconds), achievements, tutorial cards — each with its
    // toast. So while paused only the presentation layer runs: audio, open
    // panels and the HUD readouts. Pipe/belt flow flags keep their last
    // state since their clear-and-remark passes are skipped together.
    if (DevMode.timeScale === 0) {
      const _tickT0 = performance.now(); // perf instrumentation (diagnostic only)
      // Except a tutorial card that paused time itself — see tickPaused().
      _sys('TutorialSystem', () => TutorialSystem.tickPaused());
      _tickPresentation();
      PerfMonitor.record('Total game tick time', performance.now() - _tickT0);
      return false;
    }
    _tk = { dt, simDt, part: 0, ms: 0, topo: EntityRegistry.getTopologyVersion() };
    return true;
  }

  // Runs the next part of the tick under way. Returns how long it took.
  function _tickRunPart() {
    const tk = _tk;
    const t0 = performance.now();
    let done = true;
    try {
      // The world was swapped out from under a half-finished tick (a save
      // loaded, a contract trip): the rest of it belongs to a map that is no
      // longer there. Drop it; the next tick starts clean.
      if (tk.part > 0 && Math.abs(EntityRegistry.getTopologyVersion() - tk.topo) > WORLD_REPLACED) return 0;
      _TICK_PARTS[tk.part](tk.dt, tk.simDt);
      tk.part++;
      done = tk.part >= _TICK_PARTS.length;
    } finally {
      const ms = performance.now() - t0;
      tk.ms += ms;
      tk.topo = EntityRegistry.getTopologyVersion();
      if (done) { _tk = null; PerfMonitor.record('Total game tick time', tk.ms); }
    }
    return performance.now() - t0;
  }

  // One whole tick, start to finish (finishing any tick already under way first).
  function tick() {
    while (_tk) _tickRunPart();
    if (_tickStart()) while (_tk) _tickRunPart();
  }

  // Part 1 — grid.
  function _tickGrid(dt, simDt) {
    DayNight.tick(simDt);
    Seasons.tick();
    if (typeof FusionResearch !== 'undefined') _sys('FusionResearch', () => FusionResearch.tick(simDt));
    // Not on a contract job site: Operation Hyperion reads the home city's
    // station, reactors and national buildings, none of which are on the grid.
    if (typeof NationalProject !== 'undefined' && !(typeof ContractSystem !== 'undefined' && ContractSystem.isAway()))
      _sys('NationalProject', () => NationalProject.tick(simDt));
    if (typeof CompanyHQ !== 'undefined') _sys('CompanyHQ', () => CompanyHQ.tick(simDt));
    CloudShadows.tick(simDt);
    RainSystem.tick(DevMode.timeScale === 0 ? 0 : 0.1);  // freeze rain while paused (was hardcoded 0.1)
    WireRepairSelector.tick();
    BiofuelSystem.tick(simDt);  // must run before PowerNetwork so output is current
    FishingSystem.tick(simDt);  // bite-wait countdown + post-catch result banner timing
    if (DevMode.timeScale > 0) {
      // Skip entirely while paused — recomputing with dt=0 still lets non-time-scaled
      // randomness (e.g. demand noise jitter) shift supply/demand and flicker power
      // on/off even though no game time has actually passed.
      // (Not in a demo scenario: the town starts dark on purpose, and the
      // mayor has no contracts or civic buildings to hand out there.)
      // The mayor and the player's loans are the home city's, and both carry
      // on through a contract trip: what they report there is labelled HOME.
      NotificationStack.fromHome(() => {
        if (!(typeof ScenarioSystem !== 'undefined' && ScenarioSystem.active())) GovernmentSystem.tick(DayNight.getElapsed());
        GovernmentSystem.tickLoans();
      });
      const _pnT0 = performance.now();
      _sys('PowerNetwork.tick', () => PowerNetwork.tick(dt));
      // Records each network's supply and demand for the Network Breakdown's history.
      if (typeof GridAnalyzer !== 'undefined') _sys('GridAnalyzer', () => GridAnalyzer.tick());
      PerfMonitor.record('PowerNetwork.tick', performance.now() - _pnT0);
      const _pipeT0 = performance.now();
      _sys('PowerNetwork.updatePipeConnectivity', () => PowerNetwork.updatePipeConnectivity());
      PerfMonitor.record('PN: updatePipeConnectivity', performance.now() - _pipeT0);
      // Straight after the power pass, while every e.powered is current.
      _sys('OutageWatch', () => OutageWatch.tick(simDt));
      _sys('GeneratorWatch', () => GeneratorWatch.tick(simDt));
      _sys('GridBreakWatch', () => GridBreakWatch.tick(simDt));
    }
  }

  // Part 2 — machines, first half (up to and including oil).
  function _tickMachinesA(dt, simDt) {
    // Count research rate from all powered Research Stations.
    // NOTE: the original full-grid scan counted RESEARCH2 (a 2×2 building)
    // once per occupied tile rather than once per station — preserved here
    // via the width*height multiplier so research rate balance is unchanged.
    let researchW = 0;
    for (const e of EntityRegistry.getByType(T.RESEARCH))
      if (e.powered) researchW += e.def.researchRate;
    for (const e of EntityRegistry.getByType(T.RESEARCH2))
      if (e.powered) researchW += e.def.researchRate * (e.width || 1) * (e.height || 1);
    for (const e of EntityRegistry.getByType(T.RESEARCH3))
      if (e.powered) researchW += e.def.researchRate * (e.width || 1) * (e.height || 1);
    for (const e of EntityRegistry.getByType(T.MK4RESEARCH))
      if (e.powered) researchW += e.def.researchRate * (e.width || 1) * (e.height || 1);
    for (const e of EntityRegistry.getByType(T.MK5RESEARCH))
      if (e.powered) researchW += e.def.researchRate * (e.width || 1) * (e.height || 1);

    // Advances stateful contract requirements (e.g. 'sustain') and the
    // on-site checklist. No-op until a contract is in progress.
    //
    // ONLY while the player is standing on the job site: 'sustain' reads
    // PowerNetwork.stats, which back home describes the player's OWN grid.
    // Ticking it at home would let their city quietly satisfy — or break —
    // an endurance clause about the client's.
    if (typeof ContractRequirements !== 'undefined'
        && typeof ContractSystem !== 'undefined' && ContractSystem.isAway()) {
      ContractRequirements.tickActive(simDt);
    }
    if (typeof ContractSystem !== 'undefined') ContractSystem.tick(simDt);
    if (typeof ScenarioSystem !== 'undefined') ScenarioSystem.tick(simDt);   // demo scenarios: clock, objectives, panel

    // While away on a contract the home city is not on the grid, so the
    // systems that read it must not run — progression checks in particular
    // would count the CLIENT's entities toward the player's own unlocks
    // (see docs/CONTRACTS_DESIGN.md §7). PowerNetwork and Economy keep
    // ticking: the job site needs power simulated, and materials are paid
    // for out of the player's balance.
    // A demo scenario freezes the same systems: its town is handed over ready
    // made, so nothing is researched, no new customers ask to move in and
    // nobody leaves over a blackout the scenario started them in.
    const _onContract = (typeof ContractSystem !== 'undefined' && ContractSystem.isAway())
      || (typeof ScenarioSystem !== 'undefined' && ScenarioSystem.active());
    if (!_onContract) {
      Progression.tick(simDt, PowerNetwork.stats.totalGenerated, researchW);
      HouseRequestSystem.tickRequests(simDt);
      ConstructionSystem.tick(simDt);
      HouseRequestSystem.tick(Progression.totalWs);
      AmenityRequestSystem.tick(simDt);
      ParkRequestSystem.tick(simDt);
      if (typeof ZoneRequestSystem !== 'undefined') ZoneRequestSystem.tick(simDt);
      _sys('PollutionSystem', () => PollutionSystem.tick(simDt));
      SatisfactionSystem.tick(simDt);
    }
    // Tick all survey stations and coal mines — registry iteration instead
    // of a full grid scan (Step 2); each entity ticked exactly once, same
    // as the original anchor-tile check.
    _sys('CoalSystem', () => {
      CoalSystem.resetGeneratorFeedFlags();
      SolidStorageSystem.resetTickFlags();
      for (const e of EntityRegistry.getByType(T.SURVEY))         CoalSystem.tickStation(e, simDt);
      for (const e of EntityRegistry.getByType(T.SURVEY2))        CoalSystem.tickStation(e, simDt);
      for (const e of EntityRegistry.getByType(T.COALMINE))       CoalSystem.tickMine(e, simDt);
      for (const e of EntityRegistry.getByType(T.COALMINE2))      CoalSystem.tickMine(e, simDt);
      // After the mines fill them, before the generators burn what they deliver.
      for (const e of EntityRegistry.getByType(T.SOLIDSTORAGE))   SolidStorageSystem.tick(e, simDt);
      for (const e of EntityRegistry.getByType(T.COALGENERATOR))  CoalSystem.tickGenerator(e, simDt);
      CoalSystem.syncShortageNotice(simDt);
    });
    _sys('GeothermalSystem', () => {
      for (const e of EntityRegistry.getByType(T.GEOWELL))    GeothermalSystem.tickWell(e, simDt);
      for (const e of EntityRegistry.getByType(T.GEOTURBINE)) GeothermalSystem.tickTurbine(e, simDt);
      GeothermalSystem.checkThreeRunning();
    });
    _sys('OilSystem', () => {
      OilSystem.clearOilPipeFlags?.();
      for (const e of EntityRegistry.getByType(T.PUMPJACK))       OilSystem.tickPumpJack(e, simDt);
      for (const e of EntityRegistry.getByType(T.PUMPJACK2))      OilSystem.tickPumpJack(e, simDt);
      for (const e of EntityRegistry.getByType(T.OILSTORAGE))     OilSystem.tickStorageTank(e, simDt);
      for (const e of EntityRegistry.getByType(T.REFINERY))       OilSystem.tickRefinery(e, simDt);
      for (const e of EntityRegistry.getByType(T.FUELGEN))        OilSystem.tickFuelGenerator(e, simDt);
      for (const e of EntityRegistry.getByType(T.GASSTATION))     OilSystem.tickGasStation(e, simDt);
    });
  }

  // Part 2 — machines, second half. See the note at the top on why the cut
  // is where it is.
  function _tickMachinesB(dt, simDt) {
    _sys('SulfurSystem', () => {
      for (const e of SulfurSystem.allMines()) SulfurSystem.tickMine(e, simDt);
    });
    _sys('LithiumSystem', () => {
      LithiumSystem.clearLithiumConveyorFlags();
      // The wipe above took the bins' marks with it. Nothing starves on this
      // one (the Processing Plant's walk does not follow the flag), but the
      // unmarked belt past a bin of ore drew, and read in the info panel, as
      // coal. Same for the rod, Reprocessing Plant and MOX wipes below.
      SolidStorageSystem.remarkOutBelts('lithium');
      for (const e of EntityRegistry.getByType(T.LITHIUMMINE)) LithiumSystem.tickMine(e, simDt);
    });
    _sys('ChemicalSystem', () => {
      ChemicalSystem.clearAcidPipeFlags();
      for (const e of EntityRegistry.getByType(T.CHEMICALPLANT)) ChemicalSystem.tick(e, simDt);
    });
    _sys('ElectrolyzerSystem', () => {
      ElectrolyzerSystem.clearHydrogenPipeFlags();
      for (const e of EntityRegistry.getByType(T.ELECTROLYZER)) ElectrolyzerSystem.tick(e, simDt);
      // Coke Ovens make hydrogen too (their oven gas), from the coal the
      // CoalSystem block above pushed into their bunkers.
      CokeOvenSystem.clearCokeConveyorFlags();
      SolidStorageSystem.remarkOutBelts('coke');   // the wipe above took the bins' marks with it
      for (const e of EntityRegistry.getByType(T.COKEOVEN)) CokeOvenSystem.tick(e, simDt);
      // The furnaces after the ovens, walking back up the coke belts they just stamped.
      GraphiteFurnaceSystem.clearGraphiteConveyorFlags();
      SolidStorageSystem.remarkOutBelts('graphite');
      for (const e of EntityRegistry.getByType(T.GRAPHITEFURNACE)) GraphiteFurnaceSystem.tick(e, simDt);
      // Gas Holders bank each gas right after its producers mark their pipes
      // and before its consumers look for a source.
      GasStorageSystem.tickGas('hydrogen', simDt);
    });
    _sys('AtmosphereCollectorSystem', () => {
      AtmosphereCollectorSystem.clearNitrogenPipeFlags();
      for (const e of EntityRegistry.getByType(T.ATMOSCOLLECTOR)) AtmosphereCollectorSystem.tick(e, simDt);
      GasStorageSystem.tickGas('nitrogen', simDt);
    });
    _sys('HaberBoschSystem', () => {
      HaberBoschSystem.clearAmmoniaPipeFlags();
      for (const e of EntityRegistry.getByType(T.HABERBOSCH)) HaberBoschSystem.tick(e, simDt);
      GasStorageSystem.tickGas('ammonia', simDt);
    });
    _sys('IsotopicWashTowerSystem', () => {
      IsotopicWashTowerSystem.clearDeuteriumPipeFlags();
      for (const e of EntityRegistry.getByType(T.WASHTOWER)) IsotopicWashTowerSystem.tick(e, simDt);
      GasStorageSystem.tickGas('deuterium', simDt);
    });
    _sys('FuelPlantSystem', () => {
      FuelPlantSystem.clearRodFlags();
      SolidStorageSystem.remarkOutBelts('rods');   // the wipe above took the bins' marks with it
      for (const e of EntityRegistry.getByType(T.FUELPLANT)) FuelPlantSystem.tick(e, simDt);
    });
    _sys('LithiumProcessPlantSystem', () => {
      LithiumProcessPlantSystem.clearCompoundConveyorFlags();
      SolidStorageSystem.remarkOutBelts('compound');   // the wipe above took the bins' marks with it
      for (const e of EntityRegistry.getByType(T.LITHIUMPROCESSPLANT)) LithiumProcessPlantSystem.tick(e, simDt);
    });
    // Field Core chain. The mine before the Leach Plant, which walks back up
    // the ore belt it stamps; both after the Chemical Plants have lit their
    // acid lines this tick.
    _sys('RareEarthSystem', () => {
      RareEarthSystem.clearRareEarthConveyorFlags();
      SolidStorageSystem.remarkOutBelts('rareearth');   // the wipe above took the bins' marks with it
      for (const e of EntityRegistry.getByType(T.RAREEARTHMINE)) RareEarthSystem.tickMine(e, simDt);
    });
    _sys('LeachPlantSystem', () => {
      LeachPlantSystem.clearOxideConveyorFlags();
      SolidStorageSystem.remarkOutBelts('oxide');
      for (const e of EntityRegistry.getByType(T.LEACHPLANT)) LeachPlantSystem.tick(e, simDt);
    });
    // After the Leach Plants (its oxide) and the hydrogen / nitrogen blocks
    // above (which light the gas lines and bank them in Gas Holders).
    _sys('SuperconductorMillSystem', () => {
      SuperconductorMillSystem.clearTapeConveyorFlags();
      SolidStorageSystem.remarkOutBelts('tape');
      for (const e of EntityRegistry.getByType(T.SCMILL)) SuperconductorMillSystem.tick(e, simDt);
    });
    _sys('CoreWorksSystem', () => {
      for (const e of EntityRegistry.getByType(T.COREWORKS)) CoreWorksSystem.tick(e, simDt);
    });
  }

  // Part 2 — machines, the rest: the fusion chain onward. The second half
  // above was the longest piece of a late-game tick (over 20 ms in a single
  // frame), so it is cut again here. None of the flags wiped above is marked
  // again below, and tritium and steam, which are wiped and re-marked in two
  // different blocks, both stay on this side.
  function _tickMachinesC(dt, simDt) {
    // After the Processing Plants (its lithium compound) and before the Fuel
    // Plants (which draw its tritium). Tritium pipe flags are cleared here
    // rather than in the reactor block below: the breeder marks its outlet
    // now, and clearing later in the tick would wipe those marks before the
    // frame draws. The reactor re-marks its own TRITIUM OUT when it ticks.
    _sys('TritiumBreederSystem', () => {
      HulkingFusionReactorSystem.clearTritiumPipeFlags();
      for (const e of EntityRegistry.getByType(T.TRITIUMBREEDER)) TritiumBreederSystem.tick(e, simDt);
      // Gas Holders bank tritium from the breeders just ticked and from the
      // reactors' buffers (which tick later, so theirs is last tick's stock),
      // before the Fuel Plants look for a supply.
      GasStorageSystem.tickGas('tritium', simDt);
    });
    _sys('FusionFuelPlantSystem', () => {
      FusionFuelPlantSystem.clearPlasmaConveyorFlags();
      // The wipe above took the bins' marks with it, and the Fusion Reactor's
      // walk back up its PLASMA IN belt only follows marked tiles: without
      // this a reactor belted to a Storage Container of pellets (every stocked
      // fusion job site) read NO FUEL PELLETS beside a full bin. Both kinds:
      // the wipe clears the D-He3 flag too, and the Advanced Fusion Reactor's
      // walk follows it the same way. With only 'pellets' re-marked, a bin of
      // D-He3 pellets never lit the reactor it was belted to, and its unmarked
      // belt drew (and read in the info panel) as coal.
      SolidStorageSystem.remarkOutBelts('pellets');
      SolidStorageSystem.remarkOutBelts('he3pellets');
      for (const e of EntityRegistry.getByType(T.FUSIONFUELPLANT)) FusionFuelPlantSystem.tick(e, simDt);
      GasStorageSystem.endTick(simDt);   // after the last gas consumer has drawn
    });
    // Helium leg of the fusion chain: wells claim their gas pipes, then the
    // Cryo Plant liquefies (wells + last tick's reactor ash), then the
    // reactor below reads the plant to cool its magnets.
    _sys('HeliumSystem', () => {
      HeliumSystem.clearHeliumPipeFlags();
      for (const e of EntityRegistry.getByType(T.HELIUMWELL))  HeliumSystem.tickWell(e, simDt);
      for (const e of EntityRegistry.getByType(T.HELIUMWELL2)) HeliumSystem.tickWell(e, simDt);
      // Gas Holders bank the wells' surplus (and take drone-flown helium)
      // before the Cryo Plants and He-3 Separators look for a source.
      GasStorageSystem.tickGas('helium', simDt);
    });
    _sys('CryoPlantSystem', () => {
      CryoPlantSystem.clearLiquidHePipeFlags();
      for (const e of EntityRegistry.getByType(T.CRYOPLANT)) CryoPlantSystem.tick(e, simDt);
    });
    // After the Cryo Plants, so keeping the magnets cold gets first call on
    // the wells' gas. Fuel Plants pick its helium-3 up next tick.
    _sys('He3SeparatorSystem', () => {
      He3SeparatorSystem.clearHe3PipeFlags();
      for (const e of EntityRegistry.getByType(T.HE3SEPARATOR)) He3SeparatorSystem.tick(e, simDt);
      // Gas Holders bank the separators' surplus helium-3; the Fuel Plants
      // draw it next tick, as they do the separators' own buffers.
      GasStorageSystem.tickGas('helium3', simDt);
    });
    _sys('CoolingTowerSystem', () => {
      CoolingTowerSystem.clearCoolPipeFlags();
      // Both tower types run on the same code, parameterised by their def.
      for (const type of CoolingTowerSystem.TOWER_TYPES)
        for (const e of EntityRegistry.getByType(type)) CoolingTowerSystem.tick(e, simDt);
    });
    _sys('NuclearSystem', () => {
      NuclearSystem.clearWasteFlags();
      NuclearSystem.clearSteamPipeFlags();
      // Hands out cooled water (MK1 → uranium reactors + cryo towers) and
      // Cryogenic Coolant (cryo towers → Advanced Reactors) before any reactor
      // ticks — has to sit after the CoolingTowerSystem block above (which sets
      // the towers' _hotConnected / _coolConnected) and before the loop below,
      // which reads the _cooled it sets.
      NuclearSystem.resolveCooling();
      // Both reactor types run on the same code, parameterised by their def.
      for (const type of NuclearSystem.REACTOR_TYPES)
        for (const e of EntityRegistry.getByType(type)) {
          NuclearSystem.tick(e, simDt);
          // Do NOT mutate e.def.powerOutput — power_network.js reads e._generating
          // and e._currentOutput directly. Mutating the shared def corrupts the
          // EntityDefs entry and breaks hover highlight checks in render.js.
        }
    });
    // Between NuclearSystem (which stamps the spent fuel belt flags) and
    // the Reprocessing Plant: pools take delivery and advance their cooling
    // clock first, so fuel that came ready this tick is drawable this tick.
    _sys('SpentFuelPoolSystem', () => {
      SpentFuelPoolSystem.resetTickFlags();
      for (const e of EntityRegistry.getByType(T.SPENTFUELPOOL)) SpentFuelPoolSystem.tick(e, simDt);
    });
    // After NuclearSystem, which is what stamps the spent fuel belt flags
    // the plant walks back along to find its reactors.
    _sys('ReprocessingSystem', () => {
      ReprocessingSystem.clearProductConveyorFlags();
      SolidStorageSystem.remarkOutBelts('recovered');   // the wipe above took the bins' marks with it
      SolidStorageSystem.remarkOutBelts('plutonium');
      for (const e of EntityRegistry.getByType(T.REPROCESSOR)) ReprocessingSystem.tick(e, simDt);
    });
    // After the Reprocessing Plant, which is what stamps the plutonium and
    // recovered-uranium belt flags this plant walks back along.
    _sys('MoxPlantSystem', () => {
      MoxPlantSystem.clearMoxConveyorFlags();
      SolidStorageSystem.remarkOutBelts('mox');   // the wipe above took the bins' marks with it
      for (const e of EntityRegistry.getByType(T.MOXPLANT)) MoxPlantSystem.tick(e, simDt);
    });
    // After everything that can damage a building this tick, so a drone
    // dispatched now is reacting to the current state of the world.
    _sys('DroneSystem', () => {
      // Before the ports: expires finished line-service buffs and refreshes
      // the congested-span list the dispatcher reads this tick.
      DroneSystem.tickServices(simDt);
      for (const e of EntityRegistry.getByType(T.DRONEPORT)) DroneSystem.tick(e, simDt);
      for (const e of EntityRegistry.getByType(T.DRONECHARGER)) DroneSystem.tickCharger(e);
    });
    _sys('SteamTurbineSystem', () => {
      SteamTurbineSystem.resetSteamBudgets();
      for (const e of EntityRegistry.getByType(T.STEAMTURBINE)) SteamTurbineSystem.tick(e, simDt);
      for (const e of EntityRegistry.getByType(T.STEAMTURBINE2)) SteamTurbineSystem.tick(e, simDt);
    });
    _sys('HulkingFusionReactorSystem', () => {
      HulkingFusionReactorSystem.clearHighBetaPipeFlags();
      HulkingFusionReactorSystem.updateMultipliers(simDt);
      // Tritium pipe flags are cleared up in the TritiumBreederSystem block.
      for (const e of EntityRegistry.getByType(T.HULKINGFUSIONREACTOR)) HulkingFusionReactorSystem.tick(e, simDt);
    });
    // Magnets only so far (cooling, helium charge, quench); the burn comes later.
    _sys('AdvancedFusionReactorSystem', () => {
      for (const e of EntityRegistry.getByType(T.ADVFUSIONREACTOR)) AdvancedFusionReactorSystem.tick(e, simDt);
    });
    _sys('MHDDeceleratorRingSystem', () => {
      for (const e of EntityRegistry.getByType(T.MHDRING)) MHDDeceleratorRingSystem.tick(e, simDt);
    });
    // After the reactors have burned: drains installed cores by the time each
    // reactor ran, and moves spent ones to the outgoing bay.
    _sys('FieldCoreSystem', () => FieldCoreSystem.tick(simDt));
    _sys('HaulSystem', () => {
      for (const trk of EntityRegistry.getByType(T.TRUCK)) HaulSystem.tickTruck(trk, simDt);
      for (const trk of EntityRegistry.getByType(T.TRUCK)) GasStationSystem.tickTruck(trk, simDt);
      GasStationSystem.tickSupply(simDt);
      GasStationSystem.tickStranded(simDt);
      for (const fac of EntityRegistry.getByType(T.COALWASTE))    HaulSystem.tickFacility(fac, simDt);
      for (const fac of EntityRegistry.getByType(T.OILWASTE))     HaulSystem.tickFacility(fac, simDt);
      for (const fac of EntityRegistry.getByType(T.NUCLEARWASTE)) HaulSystem.tickFacility(fac, simDt);
    });
    _sys('TruckDispatchSystem', () => TruckDispatchSystem.tick());
    _sys('AutoHaulSystem', () => AutoHaulSystem.tick());
    _sys('UraniumSystem', () => {
      for (const e of EntityRegistry.getByType(T.URANIUMMINE)) UraniumSystem.tickMine(e, simDt);
    });
    if (typeof ReservoirSystem !== 'undefined') _sys('ReservoirSystem', () => ReservoirSystem.tick(simDt));
    if (typeof ShaftSystem     !== 'undefined') _sys('ShaftSystem',     () => ShaftSystem.tick(simDt));
    // After the fluid systems have flagged this tick's flow: join touching
    // pipes that carry the same fluid (resource_helpers.js).
    _sys('PipeAutoJoin', () => autoJoinSameFluidPipes(simDt));
    _sys('BeltAutoJoin', () => autoJoinSameMaterialBelts(simDt));
    _sys('HydroSystem', () => {
      for (const e of EntityRegistry.getByType(T.WATEREXTRACTOR)) HydroSystem.tickExtractor(e, simDt);
      for (const e of EntityRegistry.getByType(T.HYDROGENERATOR)) HydroSystem.tickGenerator(e, simDt);
    });
    DevMode.forceRunPass();   // dev "Run All Machines" — last word on machine state
  }

  // Part 3 — world.
  function _tickWorld(dt, simDt) {
    const _onContract = typeof ContractSystem !== 'undefined' && ContractSystem.isAway();
    // Home weather is frozen for the duration of a contract trip, like the
    // rest of the home city. Left running, the player's own rainstorm could
    // start or expire while they stood on a job site under a different sky:
    // the expiry would fire its "stop the rain" half against visuals that
    // were already overridden, and they would come home to rain nothing was
    // tracking (WEATHER tab reading CLEAR) or to a clear sky mid-event.
    // Progression.totalWs and totalGenerated describe the CLIENT's grid
    // while away, too, so the spawn rolls would be reading the wrong city.
    if (!_onContract) {
      _sys('EventSystem', () => EventSystem.tick(simDt, Progression.totalWs, PowerNetwork.stats.totalGenerated));
      if (typeof SeasonalEvents !== 'undefined') _sys('SeasonalEvents', () => SeasonalEvents.tick(simDt));
      if (typeof LaunchSystem !== 'undefined') _sys('LaunchSystem', () => LaunchSystem.tick(simDt));
    }
    FrostSystem.tick(simDt);
    HeatSystem.tick(simDt);
    DustSystem.tick(simDt);
    FogSystem.tick(simDt);
    SmokeSystem.tick(simDt);
    AuroraSystem.tick(simDt);
    // (simDt, not the live time scale: a pause landing between two parts of
    // a tick must not drop this one's income.)
    if (simDt > 0) _sys('Economy.tick', () => Economy.tick(simDt));
    // Both read the grid as if it were the player's city, so on a job site
    // they score the CLIENT's town and award the player achievements for
    // the client's pre-existing houses (§7). Frozen for the trip; City
    // Score resumes from the home grid on return.
    if (!_onContract) {
      _sys('CityScore', () => CityScore.tick());
      _sys('AchievementsSystem', () => AchievementsSystem.tick(simDt));
    }
    _sys('TutorialSystem', () => TutorialSystem.tick());
    _sys('CompendiumSystem', () => CompendiumSystem.tick());
    PowerHistory.tick(simDt);
    _tickPresentation();
  }

  const _TICK_PARTS = [_tickGrid, _tickMachinesA, _tickMachinesB, _tickMachinesC, _tickWorld];

  // Audio, open panels and HUD readouts — everything tick() does that isn't
  // simulation. Runs every tick, paused or not, so the UI stays live (and
  // ambient loops can fade themselves out) while the world is frozen.
  function _tickPresentation() {
    // Belt junctions become splitters (and back) as belts are laid, paused or
    // not, so what the player builds shows at once (resource_helpers.js).
    syncAutoSplitters();
    NotificationStack.syncPlace();   // home cards take or drop their HOME label after a trip
    // From the Advanced Reactor's detonation on, the only bed left is the
    // general outdoor ambience — no generators, hums, fire, weather or city
    // noise under the song and the screaming, nor over the dead map after.
    // Self-correcting: a fresh world un-mutes. (The scream and the song are
    // one-shot elements, not beds — untouched.)
    const _apoc = typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.hasEnded();
    SFX.setBedsMuted?.(_apoc);
    if (_apoc) {
      // ...so the muted beds aren't ticked at all: each one scans the map,
      // and together they were ~50ms a tick on a big city, ten times a
      // second, half the sequence's frame budget. Nor the advisor or the
      // blueprint and contract buttons, which have nothing to say about a
      // dead map. Panels still update once the player walks the ashes.
      OutdoorAmbience.tick();
      if (!ApocalypseSystem.isActive()) {
        InspectionPanel.tick();
        EntityInfoPanel.tick();
        WireInspector.tick();
        TruckPatrolPanel.tick();
        updateStats();
      }
      updateClock();
      return;
    }
    GridHum.tick();
    WindmillAudio.tick(DevMode.timeScale > 0);
    PumpJackAudio.tick();
    WaterAudio.tick();
    ScanAudio.tick();
    FuelGenAudio.tick();
    WaterExtractorAudio.tick();
    HydroTurbineAudio.tick();
    HydroGeneratorAudio.tick();
    NuclearReactorAudio.tick();
    CoalGeneratorAudio.tick();
    GeothermalWellAudio.tick();
    GeothermalTurbineAudio.tick();
    FusionReactorAudio.tick();
    FusionShotAudio.tick();
    FusionStartupAudio.tick();
    FusionLabAudio.tick();
    AdvReactorAudio.tick();
    MhdRingAudio.tick();
    UraniumDepositAudio.tick();
    MachineAudio.tick();
    ConstructionAudio.tick();
    TruckAudio.tick();
    DroneAudio.tick();
    StadiumAudio.tick();
    NightclubAudio.tick();
    MilitaryBaseAudio.tick();
    AirportAudio.tick();
    LaunchComplexAudio.tick();
    MineAudio.tick();
    FountainAudio.tick();
    CityAmbienceAudio.tick();
    IndustryAmbienceAudio.tick();
    NeighborhoodAudio.tick();
    NightAmbienceAudio.tick();
    OutdoorAmbience.tick();
    WaterfallAudio.tick();
    FireAudio.tick();
    GeomagAudio.tick();
    TruckStatusPanel.tick();
    DroneFleetPanel.tick();
    Advisor.tick();
    ContractSystem.tickButton();
    BlueprintSystem.tick();
    InspectionPanel.tick();
    SolarPanelInspector.tick();
    EntityInfoPanel.tick();
    WireInspector.tick();
    TruckPatrolPanel.tick();
    // Refresh zone panel if open
    const _zp = document.getElementById('zone-panel');
    if (_zp && _zp.classList.contains('visible') && _zp.dataset.zone)
      ZoneSystem.buildZonePanel(_zp.dataset.zone, parseInt(_zp.dataset.zoneIndex) || 0);
    updateStats();
    updateClock();
    updateProgressTracker();
  }

  let frozenT = 0;
  let scaledAnimT = 0;
  let lastFrameTime = 0;
  let _fpsSmoothed = 60;
  let _fpsLastUpdate = 0;
  let _lastWorldRenderT = 0;

  // Every grid tile on the line from (c0,r0) to (c1,r1), in order — a plain
  // Bresenham walk. Used by the drag-placement block below so a cursor that
  // jumped several tiles in one frame (fast WASD camera pan while holding
  // LMB, especially zoomed out) still places on every tile it crossed
  // instead of just the tile it landed on.
  // fourConnected: a diagonal step becomes two orthogonal ones (column first).
  function _lineTiles(c0, r0, c1, r1, fourConnected) {
    const tiles = [];
    const dc = Math.abs(c1 - c0), dr = -Math.abs(r1 - r0);
    const sc = c0 < c1 ? 1 : -1, sr = r0 < r1 ? 1 : -1;
    let err = dc + dr, c = c0, r = r0;
    while (true) {
      tiles.push([c, r]);
      if (c === c1 && r === r1) break;
      const e2 = 2 * err;
      const stepC = e2 >= dr, stepR = e2 <= dc;
      if (stepC) { err += dr; c += sc; }
      if (stepC && stepR && fourConnected) tiles.push([c, r]);
      if (stepR) { err += dc; r += sr; }
    }
    return tiles;
  }

  let _nextFrameDue = 0;

  // The pause menu covers the city with a blur, and with the sim stopped and
  // the sprites' clock frozen nothing under it moves. So the city is drawn
  // as the menu opens and then left as it is, until the view itself changes
  // (a resize, the camera, the graphics level). Redrawing the same picture
  // every frame behind the menu kept a CPU core busy and had the GPU re-blur
  // the whole screen for the menu's backdrop each time: a paused game ran as
  // hot as a playing one.
  let _pmEl = null, _menuView = '';
  const _NO_KEYS = new Set();
  function _pauseMenuUp() {
    _pmEl = _pmEl || document.getElementById('pause-menu');
    return !!_pmEl && _pmEl.classList.contains('visible');
  }
  function _pauseMenuHolds() {
    if (!_pauseMenuUp()) { _menuView = ''; return false; }
    const v = canvas.width + 'x' + canvas.height + '|' + Camera.x + '|' + Camera.y + '|' + Camera.zoom + '|' + GfxQuality.level();
    if (v === _menuView) return true;
    _menuView = v;
    return false;
  }

  // The same for a plain pause (Space, the pause button) without the menu:
  // the sim has stopped and the sprites' clock is frozen, so the city is the
  // same picture frame after frame — and it was drawn sixty times a second,
  // as hot as playing. It is redrawn when something could have changed it:
  // any input (the cursor, a key, the wheel: tools, hover highlights and
  // ghosts all follow input), the camera, the hovered tile or tool, the
  // graphics level, a ground-cache rebuild or cross-fade still in progress —
  // and four times a second regardless, for anything else.
  const _PAUSED_REDRAW_MS = 250;
  let _inputSeq = 0, _stillSeq = -1, _stillView = '', _stillDrawnAt = 0;
  for (const ev of ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup', 'touchstart', 'touchmove'])
    window.addEventListener(ev, () => { _inputSeq++; }, { capture: true, passive: true });
  function _pausedStill(now) {
    const st = InputManager.state;
    const v = canvas.width + 'x' + canvas.height + '|' + Camera.x + '|' + Camera.y + '|' + Camera.zoom + '|' + GfxQuality.level() +
              '|' + st.hoverCol + ',' + st.hoverRow + '|' + st.selectedTool + '|' + RenderScale.get();
    const busy = (typeof _bgJob !== 'undefined' && _bgJob) || (typeof _bgFadeActive !== 'undefined' && _bgFadeActive) ||
                 (typeof _bgValid !== 'undefined' && !_bgValid);
    if (busy || v !== _stillView || _inputSeq !== _stillSeq || now - _stillDrawnAt >= _PAUSED_REDRAW_MS) {
      _stillView = v; _stillSeq = _inputSeq; _stillDrawnAt = now;
      return false;
    }
    return true;
  }

  // Desktop build: a minimised window still runs the simulation, but drawing
  // a world nobody can see was the whole of its CPU use while minimised.
  let _minimized = false;
  try { window.GridworksDesktop?.onMinimizeChange?.(on => { _minimized = on; }); } catch (_e) {}

  // Axis lock for dragging lines (wires, pipes, belts) and power poles /
  // towers over long distances. The first LINE_PICK_PX of a drag picks the
  // axis (whichever way the cursor moved further); after that the cursor
  // sticks to that row or column, so a wobbly mouse still lays a dead-straight
  // line. Measured on screen, not in tiles: zoomed out, a tile is a few
  // pixels and any wobble crossed one.
  // Swinging well off the line turns a corner: the line pivots at the
  // cursor's current position onto the other axis. Only sideways movement
  // that isn't paid for by travel along the line counts (LINE_DRIFT tiles of
  // leeway per tile travelled, tracked in L.drift). A fast swipe always
  // slants a little, and on a long one that slant alone used to add up to a
  // turn, whereas stopping and heading off sideways gets there at once.
  // The turning frame returns the corner tile on the OLD line, so a
  // continuous run gets a clean right-angle corner instead of a diagonal
  // staircase to the cursor; the next frame carries on along the new axis.
  const LINE_PICK_PX = 14, LINE_TURN_PX = 90, LINE_TURN_MIN = 3, LINE_DRIFT = 0.5;
  let _poleAxis = null;   // { axis: null | 'h' | 'v', c, r, wx, wy, along, drift } — reset on each fresh press

  // Wire runs stop at the last consumer. Dragging a wire past the house it
  // was run to used to keep laying wire out the far side, which then had to
  // be deleted by hand. Once a run touches a consumer and no other consumer
  // still needing power is within wire reach (MAX_WIRE_HOPS tiles), the
  // rest of the drag is held back instead of laid. If the drag then comes
  // within reach of another unpowered consumer, or touches anything the wire
  // could feed into (a pole, another wire, a building), the held stretch is
  // laid after all and the run carries on, so wiring down a street of
  // houses still works in one drag. Whatever is still held on release is
  // dropped. Reset on each fresh press (with _poleAxis).
  let _wireRun = null;    // { seen: Set<consumer>, mine: Set<wire>, held: null | [[c, r]], first }
  const _D4W = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  function _isConsumer(e) {
    if (!e) return false;
    const d = EntityDefs[e.type];
    return !!d && d.powerInput > 0 && !(d.powerOutput > 0 || d.peakOutput > 0 || d.baseOutput > 0);
  }
  // Something a held wire could feed into: wire-carrying lines, poles,
  // towers and any building that takes part in the grid (not scenery,
  // roads, deposits, water or plain pipes/belts).
  const _NOT_FEED = new Set([T.ROAD, T.BRIDGE, T.WATER, T.TREE, T.BUSH, T.AQUIFER, T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR,
    T.UNDERGNDCONVEYOR, T.GEODEPOSIT, T.COALDEPOSIT, T.OILDEPOSIT, T.URANIUMDEPOSIT, T.SULFURDEPOSIT, T.LITHIUMDEPOSIT,
    T.HELIUMDEPOSIT, T.RAREEARTHDEPOSIT, T.COALWASTE, T.OILWASTE, T.NUCLEARWASTE].filter(t => t !== undefined));
  function _feedsInto(e) {
    if (!e) return false;
    if (e._underWire) return true;
    if (_NOT_FEED.has(e.type)) return false;
    if (typeof PARK_TYPES !== 'undefined' && PARK_TYPES.includes(e.type)
        && !(typeof POWERED_PARK_TYPES !== 'undefined' && POWERED_PARK_TYPES.includes(e.type))) return false;
    return true;
  }
  // An unpowered consumer this run hasn't reached yet, within wire reach.
  function _consumerInReach(c, r, seen) {
    const R = (typeof PowerNetwork !== 'undefined' && PowerNetwork.MAX_WIRE_HOPS) || 4;
    for (let dr = -R; dr <= R; dr++) {
      const span = R - Math.abs(dr);
      for (let dc = -span; dc <= span; dc++) {
        if (!GridManager.inBounds(c + dc, r + dr)) continue;
        const e = GridManager.getEntity(c + dc, r + dr);
        if (_isConsumer(e) && !e.powered && !seen.has(e)) return true;
      }
    }
    return false;
  }
  function _wireStep(placeFn, c, r) {
    const W = _wireRun;
    if (W.held) {
      let go = _consumerInReach(c, r, W.seen);
      if (!go) {
        for (const [dc, dr] of [[0, 0], ..._D4W]) {
          if (!GridManager.inBounds(c + dc, r + dr)) continue;
          const e = GridManager.getEntity(c + dc, r + dr);
          if (_feedsInto(e) && !W.seen.has(e) && !W.mine.has(e)) { go = true; break; }
        }
      }
      if (!go) { W.held.push([c, r]); return; }
      const tiles = W.held;
      W.held = null;
      for (const [hc, hr] of tiles) _wireLay(placeFn, hc, hr, false);
    }
    _wireLay(placeFn, c, r, true);
  }
  function _wireLay(placeFn, c, r, mayStop) {
    const W = _wireRun;
    placeFn(c, r);
    const e = GridManager.getEntity(c, r);
    if (!e || !(e.type === T.WIRE || e._underWire)) return;   // not laid here (the house itself, no funds…)
    W.mine.add(e);
    let reached = false;
    for (const [dc, dr] of _D4W) {
      if (!GridManager.inBounds(c + dc, r + dr)) continue;
      const n = GridManager.getEntity(c + dc, r + dr);
      if (_isConsumer(n) && !W.seen.has(n)) { W.seen.add(n); reached = true; }
    }
    // The run's own first tile doesn't count: a run started beside a house
    // is heading away from it.
    if (W.first) { W.first = false; return; }
    if (reached && mayStop && !_consumerInReach(c, r, W.seen)) W.held = [];
  }
  function _lockPoleAxis(col, row, wx, wy) {
    const L = _poleAxis, z = Camera.zoom || 1;
    if (!L.axis) {
      // Hold at the start tile until the axis is picked: following the raw
      // cursor here let a wobble drop a stub in the next column over.
      const mx = wx - L.wx, my = wy - L.wy;
      if (Math.hypot(mx, my) * z < LINE_PICK_PX) return { col: L.c, row: L.r };
      L.axis = Math.abs(mx) >= Math.abs(my) ? 'h' : 'v';
      L.along = L.axis === 'h' ? L.c : L.r;
      L.drift = 0;
    }
    const horiz = L.axis === 'h';
    const along = horiz ? col : row, off = horiz ? row - L.r : col - L.c;
    const room = Math.abs(along - L.along) * LINE_DRIFT;
    L.along = along;
    L.drift += Math.max(-room, Math.min(room, off - L.drift));
    if (Math.abs(off - L.drift) >= Math.max(LINE_TURN_MIN, LINE_TURN_PX / (TILE * z))) {
      const corner = horiz ? { col, row: L.r } : { col: L.c, row };
      if (horiz) { L.axis = 'v'; L.c = col; L.along = row; }
      else       { L.axis = 'h'; L.r = row; L.along = col; }
      L.drift = 0;
      return corner;
    }
    return horiz ? { col, row: L.r } : { col: L.c, row };
  }

  function frame(now) {
    const _cap = GfxQuality.fpsCap();
    if (_cap) {
      const iv = 1000 / _cap;
      // 2ms slack so a 144Hz vsync tick landing just short of due isn't skipped;
      // the accumulator keeps the long-run average at the cap.
      if (now < _nextFrameDue - 2) { requestAnimationFrame(frame); return; }
      _nextFrameDue = Math.max(_nextFrameDue + iv, now - iv);
    }
    // Lock game speed to normal while fishing. DevMode.timeScale is a
    // getter-only accessor (see devmode.js) — direct assignment silently
    // no-ops, which is why this didn't actually do anything before.
    // setTimeScale() is the real public setter and is authoritative
    // regardless of which button/hotkey/file triggered the change.
    if (typeof FishingSystem !== 'undefined' && FishingSystem.isActive() && DevMode.timeScale > 1) {
      DevMode.setTimeScale(1);
    }

    // Particles tick every frame (not the 10Hz logic tick) so destruction
    // bursts and other effects move smoothly instead of stuttering.
    // Capped at 0.05s so a hitch doesn't fling particles across the map...
    // except under the Advanced Reactor's sequence, where everything is timed
    // on the wall clock (the front, the kills, the camera, the mushroom) and
    // a 0.05 cap put the fires, cook-offs and particles into slow motion
    // whenever the frame rate dipped, then let them snap back to speed: the
    // explosion visibly sped up and slowed down. There a frame advances the
    // animation by its real length, up to 0.25s.
    const _apocLive = typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.hasEnded() && !ApocalypseSystem.isHeld();
    const frameDt = lastFrameTime ? Math.min(_apocLive ? 0.25 : 0.05, (now - lastFrameTime) / 1000) : 0;
    lastFrameTime = now;
    // ...and during the apocalypse, which freezes the sim but not the
    // picture: without this every spark and chunk of debris froze in mid-air
    // and piled up for the whole sequence (particle drawing alone climbed to
    // ~7ms a frame by the end).
    // ...unless the pause menu is up over it (isHeld), which stops all of it.
    // ...and during the intro and the Hyperion finale, which hold the sim
    // the same way while the camera tours the city: a tour of machines
    // stopped dead reads as a city switched off.
    const _cineRunning = (typeof NationalProject !== 'undefined' && NationalProject.isActive())
                      || (typeof IntroCinematic !== 'undefined' && IntroCinematic.isActive())
                      || (typeof CompanyHQ !== 'undefined' && CompanyHQ.isActive());
    if (DevMode.timeScale !== 0 || _cineRunning || (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.hasEnded() && !ApocalypseSystem.isHeld())) Particles.tick(frameDt);

    // FPS counter — exponential moving average so the number doesn't jitter
    // wildly frame to frame, refreshed a few times a second when visible.
    if (frameDt > 0) _fpsSmoothed += ((1 / frameDt) - _fpsSmoothed) * 0.1;
    // Paused (not under a cinematic or the end-of-run sequence, which keep
    // moving): the world is a still picture, held between redraws.
    const _pausedPlain = DevMode.timeScale === 0 && !_cineRunning &&
      !(typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.hasEnded() && !ApocalypseSystem.isHeld());
    const _stillHeld = _pausedPlain && !_pauseMenuUp() && _pausedStill(now);
    // Not while paused: frames that draw nothing (the pause menu up, or a
    // held still frame) would read as a fast machine, and auto quality would
    // step up only to fall straight back on resuming (and then refuse to
    // climb again - see _stepTo).
    if (!_pauseMenuUp() && !_pausedPlain) GfxQuality.frame(now);
    if (DevMode.fpsVisible && now - _fpsLastUpdate > 200) {
      _fpsLastUpdate = now;
      const el = document.getElementById('fps-counter');
      if (el) el.textContent = `FPS: ${Math.round(_fpsSmoothed)}`;
    }

    // Keyboard camera pan (every frame for smooth movement)
    // — suppressed when a truck is being driven (WASD goes to the truck)
    // Contract arrival shot — before keyboardTick so the player's own
    // camera input in the same frame wins over the scripted move.
    if (typeof ContractSystem !== 'undefined') ContractSystem.frameTick(frameDt);
    // Behind the pause menu WASD/arrows don't pan: an empty key set still
    // lets any coasting inertia settle, it just adds no new input. Nor while
    // the apocalypse cutscene has the camera.
    const _camLocked = _pauseMenuUp() || (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.locksInput());
    if (!TruckSystem.getDriven()) Camera.keyboardTick(_camLocked ? _NO_KEYS : InputManager.heldKeys);
    // The camera can move without the mouse (keys, inertia), so the rubber
    // bands are re-pinned to their start tile each frame, not just on mousemove.
    InputManager.drawDragBoxes();
    if (DevMode.timeScale !== 0) TruckSystem.frameTick(frameDt, InputManager.heldKeys);
    // Drone flight runs on frame time for the same reason truck movement
    // does: the 10Hz logic tick is far too coarse for something moving at
    // 620 px/s. Dispatch stays on the logic tick (see DroneSystem.tick).
    if (DevMode.timeScale !== 0 && typeof DroneSystem !== 'undefined') DroneSystem.frameTick(frameDt);
    // Update chop progress every frame (doesn't require mouse movement).
    // updateChop advances on simulated time (frameDt * timeScale) so it's
    // naturally frozen while paused and scales with fast-forward — the
    // gate here is just a cheap early-out, not load-bearing correctness.
    if (DevMode.timeScale !== 0) InputManager.updateChop(frameDt);
    // Fishing minigame runs on frame-time for smooth arrow motion — also
    // drives the cast-charge meter while the pole is being held back.
    if (DevMode.timeScale !== 0) FishingSystem.frameTick(frameDt);

    // If tool active and mouse held, continue placement as camera moves
    const _dragPlacing = InputManager.state.mouseDown && InputManager.state.mouseButton === 0 &&
        InputManager.state.selectedTool && InputManager.state.selectedTool !== 'delete' &&
        !InputManager.state.dragEntity && !InputManager.zoneDeleteActive;
    // Batch the power network's topology rebuilds while a drag is live
    // (see PowerNetwork.setDragBatching); releasing settles it at once.
    // Delete drags too (Delete tool on LMB, or holding RMB over buildings):
    // each removed tile used to force a full grid rebuild.
    const _dragDeleting = InputManager.state.mouseDown && !InputManager.zoneDeleteActive && (
        (InputManager.state.mouseButton === 0 && InputManager.state.selectedTool === 'delete') ||
        (InputManager.state.mouseButton === 2 && InputManager.rmbDeleteDragging));
    PowerNetwork.setDragBatching?.(!!(_dragPlacing || _dragDeleting));
    // Tools that snap to one target (a deposit, a capped station) build once
    // per click; repeating the place while held hit the same target again
    // and threw "already has a Pump Jack!" right after a good placement.
    if (InputManager.state.mouseDown && InputManager.state.mouseButton === 0 &&
        InputManager.state.selectedTool && !InputManager.state.dragEntity &&
        !InputManager.zoneDeleteActive && !InputManager.isSingleTargetTool?.(InputManager.state.selectedTool)) {
      const sx = InputManager.lastMouseSX, sy = InputManager.lastMouseSY;
      const world = Camera.screenToWorld(sx, sy);
      // Same cursor centring as hover/click (InputManager.centreTile), so a
      // dragged multi-tile building lands where its ghost is drawn.
      let { col, row } = InputManager.centreTile
        ? InputManager.centreTile({ col: Math.floor(world.x / TILE), row: Math.floor(world.y / TILE) })
        : { col: Math.floor(world.x / TILE), row: Math.floor(world.y / TILE) };
      const _selTool = InputManager.state.selectedTool;
      const _windTool = !!InputManager.isWindTool?.(_selTool);
      const _beltTool = _selTool === T.CONVEYOR || _selTool === T.UNDERGNDCONVEYOR;
      const _lineTool = _selTool === T.POLE || _selTool === T.POWERTOWER || _selTool === T.WIRE || _selTool === T.PIPE || _beltTool
                     || _selTool === T.UNDERGNDPIPE || _selTool === T.WATEREXTRACTOR || _windTool;
      if (_lineTool) {
        if (InputManager._lastPlacedCol == null || !_poleAxis) _poleAxis = { axis: null, c: col, r: row, wx: world.x, wy: world.y };
        ({ col, row } = _lockPoleAxis(col, row, world.x, world.y));
        // Keep the ghost on the locked line too.
        InputManager.state.hoverCol = col;
        InputManager.state.hoverRow = row;
      }
      if (_selTool === T.WIRE && (InputManager._lastPlacedCol == null || !_wireRun)) {
        _wireRun = { seen: new Set(), mine: new Set(), held: null, first: true };
      }
      if (GridManager.inBounds(col, row) &&
          (col !== InputManager._lastPlacedCol || row !== InputManager._lastPlacedRow)) {
        const _placeFn = (InputManager.state.selectedTool === T.POLE || InputManager.state.selectedTool === T.POWERTOWER)
          ? InputManager.tryPoleAt   // interval drag logic (pole=4 tiles, tower=8 tiles)
          : (InputManager.state.selectedTool === T.ROAD)
            ? InputManager.tryRoadAt  // interval drag logic sized to the road sprite's own footprint
          : (InputManager.state.selectedTool === T.BRIDGE)
            ? InputManager.tryBridgeAt  // end-to-end along the lane axis from the first piece
            : _windTool
            ? InputManager.tryWindAt  // a straight, edge-to-edge row on the first turbine's lattice
            : (InputManager.state.selectedTool === T.SHAFT)
            ? InputManager.tryShaftAt // end to end along the shaft's orientation from the first piece
            : (InputManager.state.selectedTool === T.WATEREXTRACTOR)
            ? InputManager.tryWaterExtractorAt // edge to edge across the lake from the first one
            : InputManager.tryPlaceAt;
        const placeFn = _selTool === T.WIRE ? (c, r) => _wireStep(_placeFn, c, r) : _placeFn;

        // Walk every tile between the last placed tile and this frame's
        // cursor tile (not just the endpoint) — a fast camera pan can move
        // the cursor's world tile several tiles in one frame, and placing
        // only at the landing tile silently skipped everything in between.
        // The start tile was already placed last frame, so skip it here.
        if (InputManager._lastPlacedCol == null) {
          placeFn(col, row);
        } else {
          // Pipes, wires and belts step one side at a time: they only join
          // orthogonally, and a diagonal step would leave the two tiles
          // unconnected (the gaps in fast wire runs).
          const _four = InputManager.state.selectedTool === T.PIPE || InputManager.state.selectedTool === T.WIRE || _beltTool;
          for (const [c, r] of _lineTiles(InputManager._lastPlacedCol, InputManager._lastPlacedRow, col, row, _four)) {
            if (c === InputManager._lastPlacedCol && r === InputManager._lastPlacedRow) continue;
            if (!GridManager.inBounds(c, r)) continue;
            placeFn(c, r);
          }
        }
        InputManager._lastPlacedCol = col;
        InputManager._lastPlacedRow = row;
      }
    }

    // Logic tick (10 Hz) — single tick per interval, timeScale applied per-system.
    // A part of it per frame (see _tickStart): the part left over from the
    // tick under way, or — when the next one is due — the first part of that.
    // At 30fps and up a tick is finished well before the next is due; on a
    // slower machine whatever is left is finished in the frame the next one
    // starts in, so the sim never runs behind the clock.
    {
      let _tickMs = 0;
      if (_tk) _tickMs += _tickRunPart();
      if (now - lastTick >= TICK_RATE) {
        while (_tk) _tickMs += _tickRunPart();
        if (_tickStart()) _tickMs += _tickRunPart();
        lastTick = now;
      }
      if (_tickMs > 200) console.warn('[TICK OVERRUN]', _tickMs.toFixed(1), 'ms: timeScale:', DevMode.timeScale);
    }

    // animT freezes when paused so sprites stop animating (but not under a
    // cinematic that has paused the sim: see _cineRunning).
    // scaledAnimT accumulates real frameDt * timeScale so building animations
    // speed up at 2×/5×/10× without blowing up particle systems (which use
    // their own wall-clock time internally).
    const _apocRunning = typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.hasEnded() && !ApocalypseSystem.isHeld();
    if (DevMode.timeScale !== 0 || _apocRunning || _cineRunning) {
      frozenT = (now - startTime) / 1000;
      scaledAnimT += frameDt * (_apocRunning || _cineRunning ? 1 : (DevMode.timeScale || 1));
    }
    const animT = scaledAnimT;
    // (Not under a cinematic or the end-of-run sequence: those keep moving.)
    const _menuHeld = !_apocRunning && !_cineRunning && DevMode.timeScale === 0 && _pauseMenuHolds();
    if (!_menuHeld && !_stillHeld) { const _t0 = performance.now();
      RainSystem.frame(now, DevMode.timeScale === 0 && !_apocRunning && !_cineRunning);
      PerfMonitor.record('RainSystem.frame', performance.now() - _t0); }
    // The full-world redraw (tile grid, entities, weather, background
    // cache) is pure overhead while the fishing tension minigame is up —
    // the camera is locked and nothing in the visible world is changing,
    // but it still runs every single rAF frame and competes for the same
    // frame budget as the minigame's own arrow physics/HUD (which draws
    // to its own separate canvas — see fishing_system.js's frameTick/
    // _drawMinigame, already decoupled from this call). Throttling it to
    // ~15fps here frees that budget up for the minigame instead.
    const _fishingMinigame = typeof FishingSystem !== 'undefined' && FishingSystem.isMinigameActive();
    // The world map covers the whole screen (all but ~5% opaque), so the
    // city under it isn't redrawn while it is up: the last frame stays
    // behind it, and the map gets the frame time.
    const _mapUp = WorldMapSystem.isOpen;
    // Pipes filling up (PipeFill) run on even when the city isn't redrawn —
    // under the world map, minimised, on a reprojected frame — since the
    // sims hold each delivery until the liquid has run down to it.
    if (!_menuHeld && typeof PipeFill !== 'undefined') PipeFill.step();
    if (_menuHeld || _stillHeld) {
      // the last frame stays: under the pause menu (see _pauseMenuHolds), or
      // paused with nothing changed since it was drawn (see _pausedStill)
    } else if (!_minimized && !_mapUp && !_fishingMinigame && CameraReprojection.wants(now)) {
      // Smooth Camera: real frames are slow and the camera has moved, so
      // show the last one again at the new camera position instead of
      // rendering (camera_reprojection.js). The two world-anchored panels
      // are repositioned here as render() would have done.
      CameraReprojection.present();
      TutorialSystem.drawWorldHighlight(animT);
      TruckPatrolPanel.tick();
      SavedPathPanel.tick();
    } else if (!_minimized && !_mapUp && (!_fishingMinigame || now - _lastWorldRenderT >= 66)) {
      _lastWorldRenderT = now;
      const _t0 = performance.now();
      RenderSystem.render(animT, InputManager.state);
      CameraReprojection.rendered();
      TutorialSystem.drawWorldHighlight(animT);
      PerfMonitor.record('RenderSystem.render', performance.now() - _t0);
    }

    WorldMapSystem.tick();

    // The end-of-run sequence is cut to a song, so it advances on real
    // seconds from here rather than on the 10 Hz sim tick — the speed
    // multiplier and a slow tick must not slide the picture off the music.
    if (typeof ApocalypseSystem !== 'undefined') ApocalypseSystem.frame(frameDt);

    requestAnimationFrame(frame);
  }

  return {
    // Test hook: run exactly one logic tick, without the render loop.
    step() { tick(); },
    // The clock the sprites animate on (frozen while paused, faster at 2×–10×),
    // for sounds that follow a sprite's animation.
    animT: () => scaledAnimT,
    start() {
      lastTick   = performance.now();
      startTime  = performance.now();
      requestAnimationFrame(frame);
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   CSS ANIMATIONS (injected for flash message)
   ═══════════════════════════════════════════════════════════════════ */
