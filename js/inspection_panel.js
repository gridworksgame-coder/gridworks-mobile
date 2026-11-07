/* ═══════════════════════════════════════════════════════════════════
   INSPECTION PANEL
   General-purpose entity inspection panel (wires, generators, etc).
   ═══════════════════════════════════════════════════════════════════ */

const InspectionPanel = (() => {
  let targetEntity = null;   // the Research Station being inspected
  let anchorEntity = null;   // the station the panel was opened on; it stays put while the MK tabs switch targetEntity

  // Organized by hotbar category — matches taskbar layout
  // Shared progress readout for the three waste processing facilities: how
  // close the matching source is to the 60% backup that makes the facility
  // available. WasteSystem's flag is sticky once tripped, so report Ready
  // from it rather than the live level — trucks draining the source would
  // otherwise walk a completed bar back down again.
  function _wasteProgress(sourceType, field, unit) {
    if (typeof WasteSystem !== 'undefined' && WasteSystem.isTriggered(sourceType)) {
      return { current: 1, target: 1, unit: 'Ready' };
    }
    let max = 0;
    for (const e of EntityRegistry.getByType(sourceType)) max = Math.max(max, e[field] || 0);
    return { current: Math.floor(max), target: 60, unit };
  }

  const RESEARCH_UNLOCK_CATEGORIES = [
    {
      id: 'generation', label: 'Generation',
      items: [
        {
          type: T.SOLAR,
          name: 'Solar Panel MK1',
          desc: '7.5 kW peak output. Unlocks after surviving to Day 2, 6:00 AM.',
          cost: 0,
          getProgress() {
            if (DayNight.day() < 2) return { current: DayNight.day(), target: 2, unit: 'days survived' };
            return { current: Math.min(Math.floor(DayNight.hour()), 6), target: 6, unit: 'hrs on Day 2' };
          },
        },
        {
          type: T.SOLAR2,
          name: 'Solar Panel MK2',
          desc: '25 kW peak output. Unlocks at 250 kW grid consumption. Requires Research MK2.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH2)) return { current: 0, target: 1, unit: 'Research MK2 needed' };
            return { current: Math.min(Math.floor(PowerNetwork.stats.totalConsumed), 250), target: 250, unit: 'W consumed' };
          },
        },
        {
          type: T.WIND,
          name: 'Wind Turbine',
          desc: '5–12.5 kW output, rising and falling with the wind. Unlocks at 25 kW consumed + survive to Day 4.',
          cost: 0,
          getProgress() {
            const wMet = PowerNetwork.stats.totalConsumed >= 25;
            const timeMet = DayNight.day() >= 4;
            if (!wMet) return { current: Math.floor(PowerNetwork.stats.totalConsumed), target: 25, unit: 'W consumed' };
            if (!timeMet) return { current: DayNight.day(), target: 4, unit: 'days survived' };
            return { current: 1, target: 1, unit: 'Ready' };
          },
        },
        {
          type: T.WIND2,
          name: 'Wind Turbine MK2',
          desc: '3×3, stable 13–32 kW baseline output. Unlocks at 500 kW total consumption with a Research Station MK2 built.',
          cost: 0,
          getProgress() {
            const mk2 = [T.RESEARCH2, T.RESEARCH3, T.MK4RESEARCH, T.MK5RESEARCH].some(t => EntityRegistry.getByType(t).size > 0);
            if (PowerNetwork.stats.totalConsumed >= 500 && !mk2) return { current: 0, target: 1, unit: 'Research MK2 station placed' };
            return { current: Math.min(Math.floor(PowerNetwork.stats.totalConsumed), 500), target: 500, unit: 'W consumed' };
          },
        },
        {
          type: T.WIND3,
          name: 'Wind Turbine MK3',
          desc: '4×4 utility-scale turbine, 28–49 kW variable output. $30,000, $16/s upkeep. Unlocks at 2.5 MW total consumption.',
          cost: 0,
          getProgress() { return { current: Math.min(Math.floor(PowerNetwork.stats.totalConsumed), 2500), target: 2500, unit: 'W consumed' }; },
        },
        {
          type: T.SOLAR3,
          name: 'Solar Array',
          desc: '6×4 sun-tracking array, 180 kW peak. $45,000, $18/s upkeep. A molten-salt tank banks midday heat and holds it at 50 kW for ~3 hours after sunset; no row-shading penalty; wash robots stop panel wear. Requires the MK4 Research Station + 25 Solar Panels (MK1/MK2) on the map.',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK4 Research Station needed' };
            const n = EntityRegistry.getByType(T.SOLAR).size + EntityRegistry.getByType(T.SOLAR2).size;
            return { current: Math.min(n, SOLAR3_PANELS), target: SOLAR3_PANELS, unit: 'Solar Panels on the map' };
          },
        },
        {
          type: T.RESEARCH,
          name: 'Research Station MK1',
          desc: '1×1. Enables research-gated tech. Unlocks after collecting 125 total biofuel.',
          cost: 0,
          getProgress() { return { current: Math.min(Math.floor(BiofuelSystem.getTotalCollected()), 125), target: 125, unit: 'biofuel collected' }; },
        },
        {
          type: T.RESEARCH2,
          name: 'Research Station MK2',
          desc: '2×2, 3× research speed. Unlocks after a Coal Scan turns up coal.',
          cost: 0,
          getProgress() { return { current: CoalSystem.hasDeposits() ? 1 : 0, target: 1, unit: 'coal deposit found' }; },
        },
        {
          type: T.GEOWELL,
          name: 'Geothermal Well',
          get desc() { return `3×3. Sunk into a geothermal deposit; one well per deposit. Draws 10 kW and raises ${GeothermalSystem.getBaseOutputPerTurbine()} steam/s on this world (${GeothermalSystem.getActivityLabel().text} activity).`; },
          cost: 0,
          getProgress() { return { current: GeothermalSystem.hasDeposits() ? 1 : 0, target: 1, unit: 'geothermal deposit found' }; },
        },
        {
          type: T.GEOTURBINE,
          name: 'Geothermal Turbine',
          get desc() { const w = GeothermalSystem.getBaseOutputPerTurbine(); return `5×4. Built over a Geothermal Well’s output port; one turbine per well. Converts ${w} steam/s into ${formatPower(w)} of steady grid power; the figure is set by the world’s geothermal activity (35–55 kW) and shifts with the ambient temperature.`; },
          cost: 0,
          getProgress() { return { current: EntityRegistry.getByType(T.GEOWELL).size > 0 ? 1 : 0, target: 1, unit: 'well placed' }; },
        },
        {
          type: T.COALSCAN,
          name: 'Coal Scan',
          desc: 'Unlocks the ability to scan for coal deposits at the Resource Survey Station. Requires 3 Geothermal Turbines generating at the same time.',
          cost: 0,
          getProgress() {
            const target = GeothermalSystem.COAL_SCAN_TURBINES;
            const n = GeothermalSystem.threeTurbinesEverRan() ? target : GeothermalSystem.runningTurbineCount();
            return { current: Math.min(n, target), target, unit: 'turbines running' };
          },
        },
        {
          type: T.RESEARCH3,
          name: 'Research Station MK3',
          desc: '3×3, 6× research speed. Gates all hydro tech. Unlocks after refining 20,000 fuel oil.',
          cost: 0,
          getProgress() { return { current: Math.min(Math.floor(OilSystem.getTotalFuelOil()), 20000), target: 20000, unit: 'fuel oil refined' }; },
        },
        {
          type: T.OILSCAN,
          name: 'Oil Scan',
          desc: 'Unlocks the ability to scan for oil deposits at the Resource Survey Station. Requires extensive coal mining experience.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH2)) return { current: 0, target: 1, unit: 'Research MK2 needed' };
            const mined = Math.floor(CoalSystem.getTotalMined?.() || 0);
            return { current: Math.min(mined, OILSCAN_COAL_MINED), target: OILSCAN_COAL_MINED, unit: 't coal mined' };
          },
        },
        {
          type: T.URANIUMSCAN,
          name: 'Uranium Scan',
          desc: 'Unlocks the ability to scan for uranium deposits at the Resource Survey Station. Requires a Hydro Turbine to have run for 60 in-game hours (2.5 days) and Research MK3.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH3)) return { current: 0, target: 1, unit: 'Research MK3 needed' };
            const r = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getTotalTurbineRuntime() : 0;
            const sph = DayNight.secondsPerGameHour(), need = Math.round(3000 / sph);
            return { current: Math.min(Math.floor(r / sph), need), target: need, unit: 'in-game hours of turbine runtime' };
          },
        },
        {
          type: T.SULFURSCAN,
          name: 'Sulfur Scan',
          desc: 'Unlocks the ability to scan for sulfur deposits at the Resource Survey Station. Requires a Hydro Turbine to have run for 60 in-game hours (2.5 days) and Research MK3.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH3)) return { current: 0, target: 1, unit: 'Research MK3 needed' };
            const r = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getTotalTurbineRuntime() : 0;
            const sph = DayNight.secondsPerGameHour(), need = Math.round(3000 / sph);
            return { current: Math.min(Math.floor(r / sph), need), target: need, unit: 'in-game hours of turbine runtime' };
          },
        },
        {
          type: T.URANIUMMINE,
          name: 'Uranium Mine',
          desc: '4×5. $80,000, 25 kW draw, $25/s upkeep. Extracts uranium from deposits. Unlocks after discovering a uranium deposit.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH3)) return { current: 0, target: 1, unit: 'Research MK3 needed' };
            return { current: UraniumSystem.hasDeposits() ? 1 : 0, target: 1, unit: 'uranium deposit found' };
          },
        },
        {
          type: T.SULFURMINE,
          name: 'Sulfur Mine',
          desc: '4×5. $80,000, 25 kW draw, $15/s upkeep. Extracts sulfur from deposits. Unlocks after discovering a sulfur deposit.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH3)) return { current: 0, target: 1, unit: 'Research MK3 needed' };
            return { current: SulfurSystem.hasDeposits() ? 1 : 0, target: 1, unit: 'sulfur deposit found' };
          },
        },
        {
          type: T.SULFURMINE2,
          name: 'Sulfur Mine MK2',
          // Requirement and progress come from its goals in progression.js.
          desc: "6×7. $320,000, 60 kW draw, $40/s upkeep. Two and a half times a Sulfur Mine's sulfur (2 u/s, enough for two and a half Chemical Plants), and two and a half times the drain on its deposit. Build it on a sulfur deposit, or straight over a Sulfur Mine to replace it: it keeps the old mine's OUT stub, so its belt carries on as it is, but needs clear ground 2 tiles above and 2 to the side away from the stub.",
          cost: 0,
          getProgress: () => Progression.goalProgress(T.SULFURMINE2),
        },
        {
          type: T.LITHIUMSCAN,
          name: 'Lithium Scan',
          desc: 'Unlocks the ability to scan for lithium deposits at the Resource Survey Station. Requires the MK5 Research Station and 25,000 total Hydrogen Gas produced; bank it in Gas Holders.',
          cost: 180000,
          getProgress() {
            if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK5 Research Station needed' };
            const h = (typeof ElectrolyzerSystem !== 'undefined') ? ElectrolyzerSystem.getTotalHydrogenProduced() : 0;
            return { current: Math.min(Math.floor(h), FUSION_GOALS.hydrogen), target: FUSION_GOALS.hydrogen, unit: 'units Hydrogen Gas' };
          },
        },
        {
          type: T.LITHIUMMINE,
          name: 'Lithium Mine',
          desc: '8×10. $250,000, 70 kW draw, $42/s upkeep. Extracts lithium from deposits. Unlocks after discovering a lithium deposit.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.LITHIUMSCAN)) return { current: 0, target: 1, unit: 'Lithium Scan needed' };
            return { current: (typeof LithiumSystem !== 'undefined' && LithiumSystem.hasDeposits()) ? 1 : 0, target: 1, unit: 'lithium deposit found' };
          },
        },
        {
          type: T.LITHIUMPROCESSPLANT,
          name: 'Lithium Processing Plant',
          desc: '20×18. $480,000, 85 kW draw, $48/s upkeep. Converts Lithium Ore + Water into Lithium Compound, drawing 5 u/s of water from its pipe while it runs (a fifth of a Water Extractor). Unlocks after placing the MK5 Research Station and mining 5,000 cumulative units of Lithium Ore; bank it in Storage Containers.',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK5 Research Station needed' };
            const mined = (typeof LithiumSystem !== 'undefined') ? LithiumSystem.getTotalMined() : 0;
            return { current: Math.min(Math.floor(mined), FUSION_GOALS.lithium), target: FUSION_GOALS.lithium, unit: 'lithium ore mined' };
          },
        },
        {
          type: T.CONVEYOR,
          name: 'Conveyor Belt',
          desc: 'Transports coal from mines to generators. Unlocks once a Coal Mine is placed.',
          cost: 0,
          getProgress() { return { current: (EntityRegistry.getByType(T.COALMINE).size > 0 || EntityRegistry.getByType(T.COALMINE2).size > 0) ? 1 : 0, target: 1, unit: 'Coal Mine placed' }; },
        },
        {
          type: T.UNDERGNDCONVEYOR,
          name: 'Underground Belt',
          desc: 'Tunnels a belt up to 8 tiles along one axis. Place one at each end; the pair links up, and anything between them, including a crossing belt, is left alone. Unlocks with the Conveyor Belt.',
          cost: 0,
          getProgress() { return { current: (EntityRegistry.getByType(T.COALMINE).size > 0 || EntityRegistry.getByType(T.COALMINE2).size > 0) ? 1 : 0, target: 1, unit: 'Coal Mine placed' }; },
        },
        {
          type: T.COALMINE,
          name: 'Coal Mine',
          desc: 'Extracts coal from deposits. Unlocks on first coal discovery.',
          cost: 0,
          getProgress() { return { current: CoalSystem.hasDeposits() ? 1 : 0, target: 1, unit: 'deposit found' }; },
        },
        {
          type: T.COALMINE2,
          name: 'Coal Mine MK2',
          desc: 'Higher output coal mine. Unlocks at 125,000t of coal mined in total (Research MK3 required).',
          cost: 0,
          getProgress() { return { current: Math.min(Math.floor(CoalSystem.getTotalMined?.() || 0), COALMINE2_COAL_MINED), target: COALMINE2_COAL_MINED, unit: 't of coal mined' }; },
        },
        {
          type: T.PUMPJACK,
          name: 'Pump Jack',
          desc: '3×3. Placed on oil deposit. Extracts crude at a steady rate until the deposit runs dry. Unlocks after first oil scan (requires Oil Scan ability).',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.OILSCAN)) return { current: 0, target: 1, unit: 'Oil Scan needed' };
            return { current: OilSystem.hasDeposits() ? 1 : 0, target: 1, unit: 'oil deposit found' };
          },
        },
        {
          type: T.PUMPJACK2,
          name: 'Pump Jack MK2',
          desc: '4×4, centred on an oil deposit. Pumps 30% more crude than the MK1 (drawing the deposit down 30% faster). Unlocks with Research MK3 once an oil deposit has been pumped dry.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH3)) return { current: 0, target: 1, unit: 'Research MK3 needed' };
            return { current: OilSystem.hasExhaustedDeposit() ? 1 : 0, target: 1, unit: 'oil deposit pumped dry' };
          },
        },
        {
          type: T.SOLIDSTORAGE,
          name: 'Storage Container',
          desc: '5×5. Stockpiles up to 600 units of coal from a conveyor; surplus from a mine goes in the left IN stub, and the right OUT stub feeds generators from the stock. No power needed. Unlocks after mining 500t of coal.',
          cost: 0,
          getProgress() {
            return { current: Math.min(Math.floor(CoalSystem.getTotalMined()), 500), target: 500, unit: 't coal mined' };
          },
        },
        ...(CONVEYOR_SPLITTER_ARCHIVED ? [] : [{
          type: T.CONVEYORSPLITTER,
          name: 'Conveyor Splitter',
          desc: 'A belt junction that decides who gets what when a line is short. Even shares it out, Priority fills one way first, Ratio gives one way a set share. Drop it on any belt tile; R turns its favoured side. Unlocks with 150 conveyor tiles on the map.',
          cost: 0,
          getProgress() {
            const n = Math.round(Progression.progressFor(T.CONVEYORSPLITTER) * 150);
            return { current: n, target: 150, unit: 'conveyor tiles on the map' };
          },
        }]),
        {
          type: T.OILSTORAGE,
          name: 'Liquid Storage Tank',
          desc: '6×6. Stores up to 1,000 units of one liquid at a time; oil, water, acid, or fuel; auto-detected from whatever fills it first via pipe. Unlocks after producing ' + OILSTORAGE_CRUDE.toLocaleString('en-US') + ' crude.',
          cost: 0,
          getProgress() { return { current: Math.min(Math.floor(OilSystem.getTotalCrude()), OILSTORAGE_CRUDE), target: OILSTORAGE_CRUDE, unit: 'crude produced' }; },
        },
        {
          type: T.REFINERY,
          name: 'Oil Refinery',
          desc: '7×6. Converts crude oil into fuel oil for the Fuel Power Generator. Consumes 3.3 crude/s, produces 2.2 fuel/s, 22 kW draw. Light gases (LPG) are burned at the flare stack. Unlocks after producing ' + REFINERY_CRUDE.toLocaleString('en-US') + ' crude.',
          cost: 0,
          getProgress() { return { current: Math.min(Math.floor(OilSystem.getTotalCrude()), REFINERY_CRUDE), target: REFINERY_CRUDE, unit: 'crude produced' }; },
        },
        {
          type: T.FUELGEN,
          name: 'Fuel Power Generator',
          desc: '7×6. Crank-start diesel burning refined fuel oil: 165 kW at Normal, up to 247 kW in Overdrive (watch the heat gauge; held at 100% it explodes), or 99 kW in Eco on half the fuel. Unlocks at 2000 fuel oil refined AND Research MK2 unlocked.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH2)) return { current: 0, target: 1, unit: 'Research MK2 needed' };
            return { current: Math.floor(OilSystem.getTotalFuelOil()), target: 2000, unit: 'fuel oil refined' };
          },
        },
        {
          type: T.COALGENERATOR,
          name: 'Coal Power Generator',
          desc: '5×6 coal-fired boiler: 100 kW at Normal, up to 150 kW in Overdrive (watch boiler pressure; held at 100% it explodes), or 60 kW in Eco on under half the coal. Unlocks after mining 2,000t of coal.',
          cost: 0,
          getProgress() { return { current: Math.min(Math.floor(CoalSystem.getTotalMined()), 2000), target: 2000, unit: 't coal mined' }; },
        },
        {
          type: T.SCRUBBER,
          name: 'Scrubbers',
          desc: "Flue-gas scrubber fitted to a Coal Generator, Fuel Generator or Refinery from its panel: $30,000, $4/s upkeep, cuts that plant's emissions by 60%. Unlocks after paying $100,000 in carbon tax with a Research Station MK2 standing.",
          cost: 0,
          getProgress() {
            const mk2 = [T.RESEARCH2, T.RESEARCH3, T.MK4RESEARCH, T.MK5RESEARCH].some(t => EntityRegistry.getByType(t).size > 0);
            if (!mk2) return { current: 0, target: 1, unit: 'Research MK2 station placed' };
            return { current: Math.min(SCRUBBER_TAX, Math.floor(PollutionSystem.taxPaid())), target: SCRUBBER_TAX, unit: '$ carbon tax paid' };
          },
        },
        {
          type: T.GOVERNOR,
          name: 'Throttle Governor',
          desc: '2×2 control cabinet, $32,000, $6/s upkeep, 4 kW draw taken from the generator it touches. Governs every Fuel or Coal Generator it touches: in Overdrive it eases the throttle back toward Normal as heat or boiler pressure passes 80%, so the generator never goes critical and explodes. Unlocks after a generator goes critical on Overdrive with a Research Station MK3 standing.',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.RESEARCH3).size === 0) return { current: 0, target: 1, unit: 'Research MK3 station placed' };
            return { current: Progression.overdriveTripSeen() ? 1 : 0, target: 1, unit: 'generator gone critical on Overdrive' };
          },
        },
        {
          type: T.WATEREXTRACTOR,
          name: 'Water Extractor',
          desc: '4×4. $35,000, 25 kW draw, $10/s upkeep. Placed on a lake water body. Pumps water through Pipes to a Coal Power Generator or Hydro Generator. Unlocks once a Coal Power Generator is placed.',
          cost: 0,
          getProgress() { return { current: EntityRegistry.getByType(T.COALGENERATOR).size > 0 ? 1 : 0, target: 1, unit: 'Coal Generator placed' }; },
        },
        {
          type: T.DAM,
          name: 'Dam',
          desc: 'Spans a river. Forms a reservoir behind it. Required for hydro turbines. Unlocks once a Research Station MK3 is placed.',
          cost: 0,
          getProgress() { return { current: EntityRegistry.getByType(T.RESEARCH3).size > 0 ? 1 : 0, target: 1, unit: 'Research Station MK3 placed' }; },
        },
        {
          type: T.HYDROTURBINE,
          name: 'Hydro Turbine',
          desc: '5×5. Sits downstream of a dam. Draws 10 kW, produces mechanical rotation. Unlocks after placing a Dam (Research MK3 required).',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH3)) return { current: 0, target: 1, unit: 'Research MK3 needed' };
            return { current: (typeof ReservoirSystem !== 'undefined' && ReservoirSystem.hasDams()) ? 1 : 0, target: 1, unit: 'dam placed' };
          },
        },
        {
          type: T.SHAFT,
          name: 'Drive Shaft',
          desc: '1×3. Transmits rotation from turbine to generator. Chains together. Unlocks after running a Hydro Turbine for 18 in-game hours (Research MK3 required).',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH3)) return { current: 0, target: 1, unit: 'Research MK3 needed' };
            const r = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getTotalTurbineRuntime() : 0;
            const sph = DayNight.secondsPerGameHour(), need = Math.round(900 / sph);
            return { current: Math.min(Math.floor(r / sph), need), target: need, unit: 'in-game hours of turbine runtime' };
          },
        },
        {
          type: T.HYDROGENERATOR,
          name: 'Hydroelectric Generator',
          desc: '7×7. Shaft-driven. Up to 235 kW output, scales with reservoir fill and inflow. Unlocks after running a Hydro Turbine for 18 in-game hours (Research MK3 required).',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH3)) return { current: 0, target: 1, unit: 'Research MK3 needed' };
            const r = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getTotalTurbineRuntime() : 0;
            const sph = DayNight.secondsPerGameHour(), need = Math.round(900 / sph);
            return { current: Math.min(Math.floor(r / sph), need), target: need, unit: 'in-game hours of turbine runtime' };
          },
        },
        {
          type: T.CHEMICALPLANT,
          name: 'Chemical Plant',
          desc: 'Converts mined sulfur into sulfuric acid for the Fuel Processing Plant. Unlocks after mining 1,000 sulfur (Research MK3 required).',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH3)) return { current: 0, target: 1, unit: 'Research MK3 needed' };
            return { current: Math.min(Math.floor(SulfurSystem.getTotalMined()), 1000), target: 1000, unit: 'sulfur mined' };
          },
        },
        {
          type: T.FUELPLANT,
          name: 'Fuel Processing Plant',
          // Requirement and progress come from its goals in progression.js.
          desc: 'Refines sulfuric acid into uranium fuel rods.',
          cost: 0,
          getProgress: () => Progression.goalProgress(T.FUELPLANT),
        },
        {
          type: T.NUCLEARREACTOR,
          name: 'Nuclear Reactor',
          desc: 'High-output reactor fed by uranium fuel rods. ☢ Needs 20 u/s of cooling: connect two Cooling Towers before fuelling it; uncooled, it melts down in about 90s and detonates with a 72-tile blast. Unlocks after producing 800 fuel rods (Research MK3 required).',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH3)) return { current: 0, target: 1, unit: 'Research MK3 needed' };
            const rods = (typeof FuelPlantSystem !== 'undefined') ? FuelPlantSystem.getTotalRods() : 0;
            return { current: Math.min(Math.floor(rods), 800), target: 800, unit: 'fuel rods produced' };
          },
        },
        {
          type: T.COOLINGTOWER,
          name: 'Cooling Tower',
          desc: 'Vents reactor waste heat. Unlocks after placing a Nuclear Reactor (Research MK3 required).',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH3)) return { current: 0, target: 1, unit: 'Research MK3 needed' };
            return { current: EntityRegistry.getByType(T.NUCLEARREACTOR).size > 0 ? 1 : 0, target: 1, unit: 'Nuclear Reactor placed' };
          },
        },
        {
          type: T.STEAMTURBINE,
          name: 'Steam Turbine',
          // Requirement and progress come from its goals in progression.js.
          desc: 'Converts reactor steam into grid electricity; the Nuclear Reactor no longer feeds power directly.',
          cost: 0,
          getProgress: () => Progression.goalProgress(T.STEAMTURBINE),
        },
        {
          type: T.MK4RESEARCH,
          name: 'MK4 Research Station',
          desc: '4×4. The fusion-era laboratory, and the only place the MK5 can be researched. Unlocks after running 6 Steam Turbines simultaneously.',
          cost: 0,
          getProgress() {
            let n = 0;
            for (const e of EntityRegistry.getByType(T.STEAMTURBINE)) if (e._generating) n++;
            return { current: Math.min(n, 6), target: 6, unit: 'turbines running at once' };
          },
        },
        {
          type: T.COKEOVEN,
          name: 'Coke Oven Battery',
          desc: `14×9. $320,000, 90 kW draw, $40/s upkeep. A battery of slot ovens that bakes coal without air into coke (1.5 coal → 1.1 coke per second), and pipes off the coke-oven gas as hydrogen (24/s) for Gas Holders, the Haber-Bosch Complex or the Superconductor Mill. Coal arrives on a belt from a Coal Mine or a coal Storage Container (generators on the same line eat first); coke leaves on a belt, and Storage Containers bank it. Gas nobody takes is flared. Unlocks with the MK4 Research Station placed, an Advanced Nuclear Reactor running and ${_fmtGoal(COKEOVEN_COAL_MINED)} total coal mined.`,
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK4 Research Station needed' };
            if (!Progression.advReactorGenerated()) return { current: 0, target: 1, unit: 'Advanced Nuclear Reactor running needed' };
            return { current: Math.min(Math.floor(CoalSystem.getTotalMined()), COKEOVEN_COAL_MINED), target: COKEOVEN_COAL_MINED, unit: 't coal mined' };
          },
        },
        {
          type: T.GRAPHITEFURNACE,
          name: 'Graphitization Furnace',
          desc: `12×8. $400,000, 120 kW draw, $45/s upkeep. An Acheson furnace that cooks coke into graphite (0.6 coke → 0.3 graphite per second) for the Advanced Nuclear Reactor's GRAPHITE IN, where it lifts the reactor's steam by 20%. One feeds three reactors. Coke comes in on a belt from a Coke Oven Battery or a Storage Container; graphite leaves on a belt. Unlocks once the Coke Oven Battery is unlocked and ${_fmtGoal(GRAPHITE_COKE_MADE)} coke has been made.`,
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.COKEOVEN)) return { current: 0, target: 1, unit: 'Coke Oven Battery needed' };
            return { current: Math.min(Math.floor(CokeOvenSystem.getTotalCoke()), GRAPHITE_COKE_MADE), target: GRAPHITE_COKE_MADE, unit: 'coke made' };
          },
        },
        {
          type: T.SPENTFUELPOOL,
          name: 'Spent Fuel Pool',
          desc: '12×8. A water-filled buffer on a reactor\'s SPENT FUEL OUT belt. Pulls spent fuel about thirty times faster than one reactor makes it, so reactors never back up to the level where they stop generating, but fuel has to sit under water and cool before it can be drawn. Unlocks after placing the MK4 Research Station and accumulating 250 total spent fuel.',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK4 Research Station needed' };
            const sf = (typeof NuclearSystem !== 'undefined') ? NuclearSystem.getTotalSpentFuel() : 0;
            return { current: Math.min(Math.floor(sf), 250), target: 250, unit: 'spent fuel produced' };
          },
        },
        {
          type: T.REPROCESSOR,
          name: 'Reprocessing Plant',
          // Requirement and progress come from its goals in progression.js.
          desc: '16×13. Dissolves spent reactor fuel into plutonium, recovered uranium and a much smaller stream of high-level waste, which still has to be trucked to the Nuclear Waste Processing Facility.',
          cost: 0,
          getProgress: () => Progression.goalProgress(T.REPROCESSOR),
        },
        {
          type: T.MOXPLANT,
          name: 'Advanced Fuel Processing',
          desc: '15×13. $820,000, 140 kW draw, $92/s upkeep. Blends plutonium into a uranium matrix as MOX fuel rods; about 10% plutonium, the top of the real range. The uranium side takes recovered uranium and mined ore interchangeably, so a reprocessor that can\'t keep up is topped up straight off an ore belt. Dry process: no water needed. Unlocks after separating 50 units of plutonium.',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK4 Research Station needed' };
            const p = (typeof ReprocessingSystem !== 'undefined') ? ReprocessingSystem.getTotalPlutonium() : 0;
            return { current: Math.min(Math.floor(p), 50), target: 50, unit: 'units plutonium separated' };
          },
        },
        {
          type: T.COOLINGTOWER2,
          name: 'Cryogenic Cooling Tower',
          // Requirement and progress come from its goals in progression.js.
          desc: '15×17. $450,000, 110 kW draw, $60/s upkeep. Turns cooled water from MK1 Cooling Towers into Cryogenic Coolant (periwinkle in the pipes): 48 u/s out of CRYO OUT, enough for an Advanced Nuclear Reactor\'s 44 u/s. Drinks 70 u/s of cooled water at COOL IN (five MK1s). Rides out a flicker better than the MK1: a 20% chance of tripping its pumps on an outage against 40%, restarting in 25s rather than 45.',
          cost: 0,
          getProgress: () => Progression.goalProgress(T.COOLINGTOWER2),
        },
        {
          type: T.ADVREACTOR,
          name: 'Advanced Nuclear Reactor',
          // Requirement and progress come from its goals in progression.js.
          desc: '21×21. $1,000,000, $166/s upkeep. Burns MOX instead of uranium rods: 1200 steam (twelve Steam Turbines) on the same burn rate, and a cask store that takes 9 in-game days to fill rather than 6; a sixth of the spent fuel per unit of energy. ☢ Far less forgiving; a MOX core has a smaller delayed-neutron fraction, so heat climbs to critical in 35s instead of 60, and its 44 u/s cooling demand needs Cryogenic Coolant from a Cryogenic Cooling Tower (ordinary cooled water will not cool it).',
          cost: 0,
          getProgress: () => Progression.goalProgress(T.ADVREACTOR),
        },
        {
          type: T.DRONECHARGER,
          name: 'Drone Charging Port',
          desc: '5×5. $90,000, $15/s upkeep, 10 kW idle and up to 160 kW with all five pads charging. The cheap way to stretch a drone network: it has no drones of its own, but it adds a 122×122 tile square of coverage to any network it touches, and drones crossing that network set down on its five pads to recharge. Needs at least one Drone Port in the network to be any use. Unlocks once you have 3 Drone Ports (MK4 Research Station required).',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK4 Research Station needed' };
            return { current: Math.min(3, EntityRegistry.getByType(T.DRONEPORT).size), target: 3, unit: 'Drone Ports' };
          },
        },
        {
          type: T.DRONEPORT,
          name: 'Drone Port',
          desc: '9×9. $300,000, $60/s upkeep, 40 kW idle and up to 340 kW while the fleet recharges. A vertiport for ten autonomous drones; they fly straight lines with no roads inside the port\'s coverage square, at more than twice a truck\'s speed, repairing damage, shaving waste off plants about to stop, servicing loaded lines and flying cargo to storage flagged for Drone Supply. Storms slow them to half speed or less. Unlocks once you own 5 Trucks (MK4 Research Station required).',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK4 Research Station needed' };
            return { current: Math.min(EntityRegistry.getByType(T.TRUCK).size, DRONE_PORT_TRUCKS), target: DRONE_PORT_TRUCKS, unit: 'Trucks owned' };
          },
        },
        {
          type: T.MK5RESEARCH,
          name: 'MK5 Research Station',
          desc: '5×5. The ultimate laboratory tier; gates every fusion-tech building, from the Electrolyzer to the MHD Decelerator Ring. Unlocks once the plutonium plant is carrying a full turbine hall: twelve Steam Turbines running at once on Advanced Nuclear Reactor steam (the full 1200 output of one reactor).',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK4 Research Station needed' };
            const target = Progression.plutoniumTurbinesNeeded ? Progression.plutoniumTurbinesNeeded() : 4;
            if (Progression.advReactorEverRan && Progression.advReactorEverRan()) return { current: target, target, unit: 'turbines on plutonium' };
            if (EntityRegistry.getByType(T.ADVREACTOR).size === 0) return { current: 0, target, unit: 'Advanced Nuclear Reactor needed' };
            const n = Progression.plutoniumTurbineCount ? Progression.plutoniumTurbineCount() : 0;
            return { current: Math.min(n, target), target, unit: 'turbines on plutonium' };
          },
        },
        {
          type: T.ELECTROLYZER,
          name: 'Electrolyzer',
          desc: '8×22. Splits water into hydrogen gas for the fusion fuel chain. Unlocks when the Fusion Research Facility achieves fusion (3–7 days of research after the MK5 Research Station is placed).',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK5 Research Station needed' };
            return { current: Math.round((typeof FusionResearch !== 'undefined' ? FusionResearch.progress() : 0) * 100), target: 100, unit: '% fusion research (Fusion Research Facility)' };
          },
        },
        {
          type: T.GASSTORAGE,
          name: 'Gas Holder',
          desc: "8×8. $75,000, no power. A pressure sphere holding 5,000 units of one gas; hydrogen, nitrogen, ammonia, deuterium, tritium, helium or helium-3. Unlocks when an Electrolyzer's hydrogen buffer fills up.",
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK5 Research Station needed' };
            return { current: Math.round(Progression.progressFor(T.GASSTORAGE) * 100), target: 100, unit: '% Electrolyzer buffer filled' };
          },
        },
        {
          type: T.ATMOSCOLLECTOR,
          name: 'Atmosphere Collector',
          desc: '14×14. $200,000, 30 kW draw, $30/s upkeep. Sucks air to extract pure Nitrogen Gas. Unlocks after placing the MK5 Research Station and producing 60,000 total Hydrogen Gas; bank it in Gas Holders.',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK5 Research Station needed' };
            const h = (typeof ElectrolyzerSystem !== 'undefined') ? ElectrolyzerSystem.getTotalHydrogenProduced() : 0;
            return { current: Math.min(Math.floor(h), FUSION_GOALS.hydrogenAtmos), target: FUSION_GOALS.hydrogenAtmos, unit: 'units Hydrogen Gas' };
          },
        },
        {
          type: T.HABERBOSCH,
          name: 'Haber-Bosch Complex',
          desc: '22×20. $650,000, 65 kW draw, $52/s upkeep. Synthesizes Nitrogen Gas + Hydrogen Gas into Ammonia Gas. Unlocks after placing the MK5 Research Station and extracting 12,000 cumulative units of Nitrogen Gas; bank it in Gas Holders.',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK5 Research Station needed' };
            const n = (typeof AtmosphereCollectorSystem !== 'undefined') ? AtmosphereCollectorSystem.getTotalNitrogenProduced() : 0;
            return { current: Math.min(Math.floor(n), FUSION_GOALS.nitrogen), target: FUSION_GOALS.nitrogen, unit: 'units Nitrogen Gas extracted' };
          },
        },
        {
          type: T.WASHTOWER,
          name: 'Isotopic Wash Tower',
          desc: '20×20. $425,000, 75 kW draw, $58/s upkeep. Rinses fresh Water using the Ammonia Gas catalyst to drop out concentrated Deuterium Gas. Unlocks after placing the MK5 Research Station and producing 20,000 cumulative units of Ammonia Gas; bank it in Gas Holders.',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK5 Research Station needed' };
            const a = (typeof HaberBoschSystem !== 'undefined') ? HaberBoschSystem.getTotalAmmoniaProduced() : 0;
            return { current: Math.min(Math.floor(a), FUSION_GOALS.ammonia), target: FUSION_GOALS.ammonia, unit: 'units Ammonia Gas produced' };
          },
        },
        {
          type: T.TRITIUMBREEDER,
          name: 'Tritium Breeding Facility',
          desc: "38×22. $800,000, 125 kW draw, $52/s upkeep. A particle accelerator fires into a heavy-metal target, and the neutrons turn a lithium blanket into tritium. Belt Lithium Compound into LITHIUM IN and pipe TRITIUM OUT to a Fusion Fuel Plant; it starts the D-T loop before you have a Fusion Reactor, and idles once the reactor's blanket takes over. Unlocks after placing the MK5 Research Station and producing 4,000 units of Lithium Compound; bank it in Storage Containers.",
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK5 Research Station needed' };
            const c = (typeof LithiumProcessPlantSystem !== 'undefined') ? LithiumProcessPlantSystem.getTotalCompoundProduced() : 0;
            return { current: Math.min(Math.floor(c), FUSION_GOALS.compound), target: FUSION_GOALS.compound, unit: 'units Lithium Compound produced' };
          },
        },
        {
          type: T.FUSIONFUELPLANT,
          name: 'Fusion Fuel Plant',
          desc: "24×22. $1,250,000, 100 kW draw, $110/s upkeep. Freezes Deuterium Gas with Tritium into D-T fuel pellets for the Fusion Reactor; pipe tritium in from a Tritium Breeding Facility to make the first ones. Later, with helium-3, it splits its output: one D-He3 pellet out of a second port for every three D-T. Unlocks after the Tritium Breeding Facility, and 3,600 cumulative units of Deuterium Gas produced.",
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.TRITIUMBREEDER)) return { current: 0, target: 1, unit: 'Tritium Breeding Facility needed' };
            const d = (typeof IsotopicWashTowerSystem !== 'undefined') ? IsotopicWashTowerSystem.getTotalDeuteriumProduced() : 0;
            return { current: Math.min(Math.floor(d), FUSION_GOALS.deuterium), target: FUSION_GOALS.deuterium, unit: 'units Deuterium Gas produced' };
          },
        },
        {
          type: T.HELIUMSCAN,
          name: 'Helium Scan',
          desc: 'Unlocks the ability to scan for helium gas fields at the Resource Survey Station ($400,000 per scan). The first step towards the Fusion Reactor, whose magnets need liquid helium. Unlocks after making 75 D-T fuel pellets.',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK5 Research Station needed' };
            const p = (typeof FusionFuelPlantSystem !== 'undefined') ? FusionFuelPlantSystem.getTotalPlasmaProduced() : 0;
            return { current: Math.min(Math.floor(p), FUSION_GOALS.pellets1), target: FUSION_GOALS.pellets1, unit: 'Fuel Pellets' };
          },
        },
        {
          type: T.HELIUMWELL,
          name: 'Helium Well',
          desc: '6×6. $420,000, 20 kW draw, $25/s upkeep. Separates helium from a helium gas field (2 u/s) and pipes it out of HE OUT. Unlocks after discovering a helium gas field.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.HELIUMSCAN)) return { current: 0, target: 1, unit: 'Helium Scan needed' };
            return { current: (typeof HeliumSystem !== 'undefined' && HeliumSystem.hasDeposits()) ? 1 : 0, target: 1, unit: 'helium gas field found' };
          },
        },
        {
          type: T.CRYOPLANT,
          name: 'Cryo Plant',
          desc: '20×18. $800,000, 60 kW draw, $45/s upkeep. Liquefies helium gas into liquid helium (LHe) for the Fusion Reactor\'s magnets. Unlocks after extracting 4,000 cumulative units of Helium Gas (a well only holds 1,000, so bank it in Gas Holders). Once one is producing liquid helium, the Fusion Reactor unlocks.',
          cost: 0,
          getProgress() {
            const h = (typeof HeliumSystem !== 'undefined') ? HeliumSystem.getTotalExtracted() : 0;
            return { current: Math.min(Math.floor(h), FUSION_GOALS.helium), target: FUSION_GOALS.helium, unit: 'units Helium Gas extracted' };
          },
        },
        {
          type: T.HULKINGFUSIONREACTOR,
          name: 'Fusion Reactor',
          desc: "30×30. $2,600,000, 90 kW draw (5 MW startup surge), $80/s upkeep. Burns fuel pellets: D-T raises steam for Steam Turbines and breeds tritium in its lithium blanket; D-He3 feeds an MHD Ring. Its magnets need liquid helium from a Cryo Plant to run. Unlocks once a Cryo Plant is producing liquid helium.",
          cost: 0,
          getProgress() {
            return { current: fusionCoolantMade() ? 1 : 0, target: 1, unit: 'Cryo Plant producing liquid helium' };
          },
        },
        {
          type: T.STEAMTURBINE2,
          name: 'Steam Turbine MK2',
          desc: "24×14. $230,000, $60/s upkeep. A high-pressure tandem set: HP, IP and three LP casings on one shaft. Draws 400 steam for 1.2 MW, four MK1s' worth for less money, half the upkeep and less ground. A D-T Fusion Reactor runs five; an Advanced Nuclear Reactor runs three. Unlocks once four Steam Turbines run at once on Fusion Reactor steam.",
          cost: 0,
          getProgress() {
            return { current: Math.min(fusionTurbinesRunning(), FUSION_TURBINES_FOR_MK2), target: FUSION_TURBINES_FOR_MK2, unit: 'Steam Turbines on Fusion Reactor steam' };
          },
        },
        {
          type: T.HE3SEPARATOR,
          name: 'Helium-3 Separator',
          desc: '18×18. $900,000, 45 kW draw, $40/s upkeep. Distils helium-3 out of Helium Well gas for D-He3 fuel. Unlocking it opens the Fusion Fuel Plant\'s D-He3 line: with helium-3 on HE-3 IN, one D-He3 pellet comes out of D-He3 OUT for every three D-T. Unlocks after burning 450 fuel pellets in a Fusion Reactor.',
          cost: 0,
          getProgress() {
            const p = (typeof HulkingFusionReactorSystem !== 'undefined') ? HulkingFusionReactorSystem.getTotalPelletsBurned() : 0;
            return { current: Math.min(Math.floor(p), FUSION_GOALS.burned), target: FUSION_GOALS.burned, unit: 'fuel pellets burned' };
          },
        },
        {
          type: T.ADVFUSIONREACTOR,
          name: 'Advanced Fusion Reactor',
          desc: "48×48. $6,000,000, 160 kW draw (12 MW startup surge), $260/s upkeep. A five-period stellarator: fifty twisted superconducting coils hold a D-He3 plasma far hotter than any tokamak could. Aneutronic, so no blanket and no steam; it streams ions out of two ION OUT ports to MHD Rings, through its own direct energy converters. Cooling is the price: its magnets boil off liquid helium (LHe) six times as fast as the Fusion Reactor's (two or three Cryo Plants on LHe IN), and the converters' waste heat needs two Cryogenic Cooling Towers on CRYO IN. Unlocks with the MHD Ring after making 60 D-He3 fuel pellets.",
          cost: 0,
          getProgress() {
            const h = typeof FusionFuelPlantSystem !== 'undefined' && FusionFuelPlantSystem.getTotalHe3PelletsProduced ? FusionFuelPlantSystem.getTotalHe3PelletsProduced() : 0;
            return { current: Math.min(Math.floor(h), FUSION_GOALS.he3pellets), target: FUSION_GOALS.he3pellets, unit: 'D-He3 fuel pellets made' };
          },
        },
        {
          type: T.MHDRING,
          name: 'MHD Decelerator Ring',
          desc: "38×14. $750,000, $150/s upkeep. Turns an Advanced Fusion Reactor's ion stream straight into 4 MW, no turbines needed; the reactor feeds four. Pipe ION OUT into HIGH-BETA IN and wire it to the grid. Unlocks with the Advanced Fusion Reactor after making 60 D-He3 fuel pellets.",
          cost: 0,
          getProgress() {
            const h = typeof FusionFuelPlantSystem !== 'undefined' && FusionFuelPlantSystem.getTotalHe3PelletsProduced ? FusionFuelPlantSystem.getTotalHe3PelletsProduced() : 0;
            return { current: Math.min(Math.floor(h), FUSION_GOALS.he3pellets), target: FUSION_GOALS.he3pellets, unit: 'D-He3 fuel pellets made' };
          },
        },
        {
          type: T.HELIUMWELL2,
          name: 'Helium Well MK2',
          desc: "8×8. $625,000, 60 kW draw, $60/s upkeep. Three times a Helium Well's helium (6 u/s, one Advanced Fusion Reactor's boil-off), and three times the drain on its field. Build it on a gas field, or straight over a Helium Well to replace it: it keeps the old well's HE OUT pipe, but needs clear ground 4 tiles left and 2 above and below. Unlocks once an Advanced Fusion Reactor has started.",
          cost: 0,
          getProgress() {
            return { current: advFusionHasRun() ? 1 : 0, target: 1, unit: 'Advanced Fusion Reactor started' };
          },
        },
        // ── Field Core chain (docs/FIELD_CORE_SPEC.md) ──
        {
          type: T.RAREEARTHSCAN,
          name: 'Rare Earth Scan',
          desc: 'Unlocks the ability to scan for rare earth deposits at the Resource Survey Station MK2 ($500,000 for the first scan, then 25% more each time). Monazite sand is the head of the Field Core chain. Unlocks after burning 100 D-He3 pellets in an Advanced Fusion Reactor, so the chain can be running before Stage III.',
          cost: 0,
          getProgress() {
            const p = (typeof AdvancedFusionReactorSystem !== 'undefined') ? AdvancedFusionReactorSystem.getTotalPelletsBurned() : 0;
            return { current: Math.min(Math.floor(p), FUSION_GOALS.dhe3burned), target: FUSION_GOALS.dhe3burned, unit: 'D-He3 pellets burned' };
          },
        },
        {
          type: T.RAREEARTHMINE,
          name: 'Rare Earth Mine',
          desc: '4×5. $375,000, 100 kW draw, $49/s upkeep. Dredges monazite sand from a rare earth deposit and separates the ore out magnetically (0.8 u/s, a Uranium Mine\'s rate). Unlocks after discovering a rare earth deposit.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RAREEARTHSCAN)) return { current: 0, target: 1, unit: 'Rare Earth Scan needed' };
            return { current: (typeof RareEarthSystem !== 'undefined' && RareEarthSystem.hasDeposits()) ? 1 : 0, target: 1, unit: 'rare earth deposit found' };
          },
        },
        {
          type: T.LEACHPLANT,
          name: 'Leach Plant',
          desc: `10×9. $565,000, 150 kW draw, $74/s upkeep. Leaches rare earth ore in sulfuric acid into rare earth oxide (0.66 ore + 0.28 acid → 0.4 oxide per second). Leaves thorium tailings that trucks or drones haul to the Nuclear Waste Processing Facility; a full store stops it. Unlocks once Operation Hyperion reaches Stage II and ${_fmtGoal(FUSION_GOALS.rareearth)} cumulative units of Rare Earth Ore have been mined; bank it in Storage Containers.`,
          cost: 0,
          getProgress() {
            if (typeof NationalProject === 'undefined' || !NationalProject.reached('stage1')) return { current: 0, target: 1, unit: 'Operation Hyperion Stage II needed' };
            const m = (typeof RareEarthSystem !== 'undefined') ? RareEarthSystem.getTotalMined() : 0;
            return { current: Math.min(Math.floor(m), FUSION_GOALS.rareearth), target: FUSION_GOALS.rareearth, unit: 'units Rare Earth Ore mined' };
          },
        },
        {
          type: T.SCMILL,
          name: 'Superconductor Mill',
          desc: `12×10. $1,150,000, 250 kW draw, $110/s upkeep. Grows high-temperature superconductor tape from rare earth oxide in a hydrogen atmosphere and tests it in liquid nitrogen (0.33 oxide + 30 hydrogen + 5 nitrogen → 0.1 tape per second). Unlocks once Operation Hyperion reaches Stage III and ${_fmtGoal(FUSION_GOALS.oxide)} cumulative units of Rare Earth Oxide have been made.`,
          cost: 0,
          getProgress() {
            if (typeof NationalProject === 'undefined' || !NationalProject.reached('stage2')) return { current: 0, target: 1, unit: 'Operation Hyperion Stage III needed' };
            const o = (typeof LeachPlantSystem !== 'undefined') ? LeachPlantSystem.getTotalOxide() : 0;
            return { current: Math.min(Math.floor(o), FUSION_GOALS.oxide), target: FUSION_GOALS.oxide, unit: 'units Rare Earth Oxide produced' };
          },
        },
        {
          type: T.COREWORKS,
          name: 'Core Works',
          desc: `12×10. $1,500,000, 100 kW idle / 800 kW charging, $147/s upkeep. Winds HTS tape into Field Cores (120 tape each) and charges them, 4 in-game hours a core; recharges spent cores for 28 tape. Four bays. Unlocks once Operation Hyperion reaches Stage IV and ${_fmtGoal(FUSION_GOALS.tape)} cumulative units of HTS Tape have been made: the Field Core chain is complete.`,
          cost: 0,
          getProgress() {
            if (typeof NationalProject === 'undefined' || !NationalProject.reached('stage3')) return { current: 0, target: 1, unit: 'Operation Hyperion Stage IV needed' };
            const tp = (typeof SuperconductorMillSystem !== 'undefined') ? SuperconductorMillSystem.getTotalTape() : 0;
            return { current: Math.min(Math.floor(tp), FUSION_GOALS.tape), target: FUSION_GOALS.tape, unit: 'units HTS Tape produced' };
          },
        },
      ],
    },
    {
      id: 'grid', label: 'Grid',
      items: [
        {
          type: T.WIRE,
          name: 'Wire',
          desc: 'Basic power connection between buildings. Unlocks after collecting 50 total biofuel.',
          cost: 0,
          getProgress() { return { current: Math.min(Math.floor(BiofuelSystem.getTotalCollected()), 50), target: 50, unit: 'biofuel collected' }; },
        },
        {
          type: T.POLE,
          name: 'Power Pole',
          desc: 'Relay node that extends wire range. Unlocks after first customer.',
          cost: 50,
          getProgress() { const n = HouseRequestSystem.getHousesAccepted() + HouseRequestSystem.getCommercialsAccepted() + (HouseRequestSystem.getCabinCleared() ? 1 : 0); return { current: Math.min(n, 1), target: 1, unit: 'customer' }; },
        },
        {
          type: T.PROTECTOR,
          name: 'Surge Protector',
          desc: 'Attach to wire network. Each one adds 170 kW to the whole network’s wire capacity, with no limit (85 kW → 255 → 425 → 595…), and cuts storm faults toward 35%. Unlocks the first time a wire runs at 90% of its capacity and turns red.',
          cost: 0,
          getProgress() { return { current: Math.round(PowerNetwork.redlineProgress() * 100), target: 100, unit: '% to redline' }; },
        },
        {
          type: T.PROTECTOR2,
          name: 'Surge Protector MK2',
          desc: '2×2. Each one adds 2.1 MW to the whole network’s wire capacity, with no limit, and cuts storm faults toward 12%. Stacks with MK1. Requires 800 kW consumed + Research MK2.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH2)) return { current: 0, target: 1, unit: 'Research MK2 needed' };
            return { current: Math.floor(PowerNetwork.stats.totalConsumed), target: 800, unit: 'W consumed' };
          },
        },
        {
          type: T.PROTECTOR3,
          name: 'Surge Protector MK3',
          desc: '3×3 gas-insulated bay, 6 kW draw. Each one adds 9 MW to the whole network’s wire capacity, with no limit, and cuts storm faults toward 3%. Requires the MK4 Research Station + 5 MW consumed.',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK4 Research Station needed' };
            return { current: Math.min(Math.floor(PowerNetwork.stats.totalConsumed), 5000), target: 5000, unit: 'W consumed' };
          },
        },
        {
          type: T.BATTERY,
          name: 'Battery Block',
          desc: '1×2 storage block. 50 kWh capacity, 50 kW max discharge. Unlocks at 50 kW generated + survive to Day 3, 6:00 AM.',
          cost: 0,
          getProgress() {
            const wMet = PowerNetwork.stats.totalGenerated >= 50;
            const timeMet = DayNight.day() > 3 || (DayNight.day() === 3 && DayNight.hour() >= 6);
            if (!wMet) return { current: Math.floor(PowerNetwork.stats.totalGenerated), target: 50, unit: 'W generated' };
            if (!timeMet) return { current: DayNight.day() < 3 ? 0 : Math.floor(DayNight.hour()), target: 6, unit: 'hrs on Day 3' };
            return { current: 1, target: 1, unit: 'Ready' };
          },
        },
        {
          type: T.PIPE,
          name: 'Pipe',
          desc: 'Carries water and other liquids between buildings. Unlocks once a Coal Power Generator is placed.',
          cost: 0,
          getProgress() { return { current: EntityRegistry.getByType(T.COALGENERATOR).size > 0 ? 1 : 0, target: 1, unit: 'Coal Generator placed' }; },
        },
        {
          type: T.UNDERGNDPIPE,
          name: 'Underground Pipe',
          desc: 'Tunnels under obstacles along one axis, so a crossing pipe carrying a different liquid can pass over without connecting. Unlocks once the Liquid Storage Tank is available (pump ' + OILSTORAGE_CRUDE.toLocaleString('en-US') + ' crude).',
          cost: 0,
          // This said "Unlocks alongside Pipe" and tracked Pipe's 2,000t coal
          // gate, so it read 2000/2000 done while staying LOCKED forever. The
          // real gate in progression.js is the Liquid Storage Tank, which is
          // itself gated on OILSTORAGE_CRUDE — so show the player that chain instead.
          getProgress() {
            if (Progression.isReady(T.OILSTORAGE) || Progression.isUnlocked(T.OILSTORAGE)) {
              return { current: 1, target: 1, unit: 'Ready' };
            }
            const crude = Math.floor(OilSystem.getTotalCrude());
            return { current: Math.min(crude, OILSTORAGE_CRUDE), target: OILSTORAGE_CRUDE, unit: 'crude (for Liquid Storage Tank)' };
          },
        },
        {
          type: T.POWERTOWER,
          name: 'Power Tower',
          desc: '2×2 tower, $1,000, $0.1/s upkeep. Extends wire runs to 8 tiles. Unlocks after placing a Coal Mine.',
          cost: 0,
          getProgress() { return { current: EntityRegistry.getByType(T.COALMINE).size > 0 ? 1 : 0, target: 1, unit: 'Coal Mine placed' }; },
        },
        {
          type: T.LIGHTNINGROD3,
          name: 'Lightning Rod MK3',
          desc: '5×6 storm spire, $105,000, $32/s upkeep. Intercepts 93% of strikes on its own across an 18 tile radius, and banks 70 kW; up to 130 kW stacked; back into the grid over 2 in-game hours. Stacks with MK1/MK2 rods. Requires the MK4 Research Station + $4,000/s income.',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK4 Research Station needed' };
            const inc = Math.max(0, Math.floor(Economy.income)), need = LIGHTNINGROD3_INCOME;
            return { current: Math.min(inc, need), target: need,
                     text: `$${Math.min(inc, need).toLocaleString('en-US')}/s / $${need.toLocaleString('en-US')}/s income` };
          },
        },
        {
          type: T.LIGHTNINGROD2,
          name: 'Lightning Rod MK2',
          desc: '4×5 resonant capture tower, $38,000, $17/s upkeep. Intercepts 82% of strikes on its own (vs 62% for MK1) across a 13 tile radius, and banks 24 kW; up to 42 kW stacked; back into the grid over 1.5 in-game hours. Unlocks after taking a strike with a Research Station MK3 standing.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.LIGHTNINGROD)) return { current: 0, target: 1, unit: 'Lightning Rod MK1 needed' };
            if (EntityRegistry.getByType(T.RESEARCH3).size === 0) return { current: 0, target: 1, unit: 'Research MK3 station placed' };
            const hit = (typeof LightningDamageSystem !== 'undefined') && LightningDamageSystem.hasStrikeAfterMk3();
            return { current: hit ? 1 : 0, target: 1, unit: 'strike taken since MK3' };
          },
        },
        {
          type: T.LIGHTNINGROD,
          name: 'Lightning Rod',
          desc: '3×4 grounded mast, $12,000, $8.5/s upkeep. Intercepts lightning that would otherwise knock a nearby building offline. Protects 14 tiles; overlapping rods stack. Wire one in and each strike it takes returns 10 kW to the grid, fading to 0 over an in-game hour; up to 18 kW if it is struck again mid-surge. Unlocks after lightning knocks out a building with a Research Station MK2 standing.',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.RESEARCH2).size === 0
             && EntityRegistry.getByType(T.RESEARCH3).size === 0
             && EntityRegistry.getByType(T.MK4RESEARCH).size === 0
             && EntityRegistry.getByType(T.MK5RESEARCH).size === 0) {
              return { current: 0, target: 1, unit: 'Research MK2 station placed' };
            }
            const hit = (typeof LightningDamageSystem !== 'undefined') && LightningDamageSystem.hasStrikeAfterMk2();
            return { current: hit ? 1 : 0, target: 1, unit: 'strike taken since MK2' };
          },
        },
        {
          type: T.BLUEPRINT,
          name: 'Blueprints',
          desc: 'Rubber-band select placed entities, save their layout, and stamp copies back into the world. Unlocks after placing a Research Station MK3.',
          cost: 0,
          getProgress() { return { current: EntityRegistry.getByType(T.RESEARCH3).size > 0 ? 1 : 0, target: 1, unit: 'Research MK3 station placed' }; },
        },
        {
          type: T.CARBONCAPTURE,
          name: 'Carbon Capture Plant',
          desc: '10×8 direct-air-capture plant, $120,000, $10/s upkeep, 120 kW draw. While powered it captures half the emissions of every polluting plant within 40 tiles, cutting the carbon tax and the approval drain, and pulls smog out of the air there. Overlapping plants stack, each taking half of what is left. Unlocks after paying $200,000 in carbon tax once a Research Station MK3 is standing.',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.RESEARCH3).size === 0) return { current: 0, target: 1, unit: 'Research MK3 station placed' };
            return { current: Math.min(CARBON_CAPTURE_TAX, Math.floor(Progression.carbonTaxSinceMk3())), target: CARBON_CAPTURE_TAX, unit: '$ carbon tax paid since MK3' };
          },
        },
      ],
    },
    {
      id: 'stations', label: 'Stations',
      items: [
        {
          type: T.MONITOR,
          name: 'Monitoring Station',
          desc: 'Activates the GRID panel. Unlocks after placing 5 Wind Turbines.',
          cost: 0,
          getProgress() { return { current: EntityRegistry.getByType(T.WIND).size, target: 5, unit: 'Wind Turbines placed' }; },
        },
        {
          type: T.MONITOR2,
          name: 'Monitoring Station MK2',
          desc: '4×4 grid operations centre. Adds the Network Breakdown window (a full read-out of any one power network: lines, generators, storage, consumers, history and advice) the storage readout in the GRID panel, and early warnings: a card when the lines on a network run hot, its margin gets thin or it falls back on storage, before it goes dark, and a 24-hour forecast of when a network will run out. Does everything the MK1 does. Unlocks with a Research Station MK3 placed, a Monitoring Station on the grid and 2 MW total consumption.',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MONITOR).size === 0) return { current: 0, target: 1, unit: 'Monitoring Station placed' };
            return { current: Math.min(Math.floor(PowerNetwork.stats.totalConsumed), 2000), target: 2000, unit: 'W consumed' };
          },
        },
        {
          type: T.ENGOFFICE,
          name: 'Engineering Office',
          desc: '10×8. $180,000, $40/s upkeep, 30 kW. Sells the Engineering Audit: for a fee, an engineer walks your pipe and fuel chains and reports what is holding them back, why it matters, and the steps to fix it, with the tiles to go to. One per map. Unlocks with 3 Nuclear Reactors running at once (Research MK3 required).',
          cost: 0,
          getProgress() { return { current: Progression.engOfficeReactors(), target: Progression.engOfficeReactorsNeeded(), unit: 'Nuclear Reactors running at once' }; },
        },
        {
          type: T.BEACON,
          name: 'Communications Beacon',
          desc: '5×6 transmitter. Puts your grid on the map. Draws 3 kW on standby; run a sweep from its panel to go looking for contract work, that draws 12 kW and takes anywhere from a couple of hours to three days to turn something up. Unlocks at 150 kW generated.',
          cost: 0,
          getProgress() {
            return { current: Math.floor(PowerNetwork.stats.totalGenerated), target: 150, unit: 'W generated' };
          },
        },
        {
          type: T.SUBSTATION,
          name: 'Substation MK1',
          desc: '2×2 storage node. 200 kWh capacity, 200 kW max discharge. Fills in ~20min at 30 kW surplus. Unlocks at 200 kW generated.',
          cost: 0,
          getProgress() {
            const wMet = PowerNetwork.stats.totalGenerated >= 200;
            if (!wMet) return { current: Math.floor(PowerNetwork.stats.totalGenerated), target: 200, unit: 'W generated' };
            return { current: Math.min(DayNight.day(), 5), target: 5, unit: 'days survived' };
          },
        },
        {
          type: T.SUBSTATION2,
          name: 'Substation MK2',
          desc: '3×3 storage node. 450 kWh capacity, 450 kW max discharge. Unlocks at 600 kW consumption (Research MK2 required).',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH2)) return { current: 0, target: 1, unit: 'Research MK2 needed' };
            return { current: Math.floor(PowerNetwork.stats.totalConsumed), target: 600, unit: 'W consumed' };
          },
        },
        {
          type: T.SUBSTATION3,
          name: 'Substation MK3',
          desc: '4×4 grid-scale storage yard. 1.2 MWh capacity, 1.2 MW max discharge. Unlocks at 3.5 MW generated (Research MK3 required).',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH3)) return { current: 0, target: 1, unit: 'Research MK3 needed' };
            return { current: Math.min(Math.floor(PowerNetwork.stats.totalGenerated), 3500), target: 3500, unit: 'W generated' };
          },
        },
        {
          type: T.SUBSTATION4,
          name: 'Substation MK4',
          desc: '6×6 storage citadel. 3 MWh capacity, 3 MW max discharge. Unlocks at 10 MW generated (MK4 Research Station required).',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK4 Research Station needed' };
            return { current: Math.min(Math.floor(PowerNetwork.stats.totalGenerated), 10000), target: 10000, unit: 'W generated' };
          },
        },
        {
          type: T.SUBSTATION5,
          name: 'Substation MK5',
          desc: '8×8 stellar vault. 8 MWh capacity, 8 MW max discharge. Unlocks once a Fusion Reactor has generated power (MK5 Research Station required).',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK5 Research Station needed' };
            return { current: Progression.fusionGenerated() ? 1 : 0, target: 1, unit: 'Fusion Reactor generating' };
          },
        },
        {
          type: T.TRUCK,
          name: 'Waste Truck',
          desc: '1×3 driveable vehicle. Double-click to drive, WASD to move. Hauls waste from generators, refineries and reactors to its processing facility. Unlocks after a Coal Power Generator reaches 60% ash waste.',
          cost: 0,
          getProgress() {
            let maxAsh = 0;
            for (const e of EntityRegistry.getByType(T.COALGENERATOR)) maxAsh = Math.max(maxAsh, e._ashWaste || 0);
            return { current: Math.floor(maxAsh), target: 60, unit: '% ash waste' };
          },
        },
        {
          type: T.HAULER,
          name: 'Hauler',
          desc: `1×3 cargo truck, $70,000. Carries 200 units of ore, coal, rods, crude, fuel oil, water or acid, or 750 of a process gas in its tube trailer, by road from where it is made to a Storage Container, Liquid Storage Tank or Gas Holder you have flagged for Truck Supply. Runs itself and refuels at Gas Stations; slower and thirstier than a Waste Truck, and never carries waste. Unlocks once you have ${HAULER_BELT_TILES} conveyor belt tiles on the map.`,
          cost: 0,
          getProgress() {
            return { current: Math.min(beltTileCount(), HAULER_BELT_TILES), target: HAULER_BELT_TILES, unit: 'conveyor belt tiles' };
          },
        },
        {
          type: T.ROAD,
          name: 'Road',
          desc: '6×6 two-lane road tile. Decorative infrastructure; trucks drive on the left and right lanes, yellow dash centre line. Unlocks with the Waste Truck.',
          cost: 800,
          getProgress() { return { current: Progression.isUnlocked(T.TRUCK) ? 1 : 0, target: 1, unit: 'Waste Truck unlocked' }; },
        },
        {
          type: T.BRIDGE,
          name: 'Bridge',
          desc: '6×6 steel truss span on concrete piers, laid across water so trucks can drive over it. Drag to lay a straight run; pieces join up on their own. Road price plus $100 per water tile spanned. Also lets you build over water for a $250 fill charge per tile (not over a dam reservoir). Unlocks with the Waste Truck.',
          cost: 800,
          getProgress() { return { current: Progression.isUnlocked(T.TRUCK) ? 1 : 0, target: 1, unit: 'Waste Truck unlocked' }; },
        },
        {
          type: T.PATHTOOL,
          name: 'Path Tool',
          desc: 'Assign patrol waypoints to a truck. Unlocks with the Waste Truck.',
          cost: 0,
          getProgress() { return { current: Progression.isUnlocked(T.TRUCK) ? 1 : 0, target: 1, unit: 'Waste Truck unlocked' }; },
        },
        {
          type: T.AUTODISPATCH,
          name: 'Auto-Dispatch',
          desc: "Give a truck a standing job; collect coal, oil or nuclear waste, or all of it, and it runs the round on its own: drives to whichever source is backing up past 85%, loads, delivers to the matching processing facility, and detours for fuel when the tank won't cover the trip. Several automated trucks split the map between them rather than chasing the same building. Unlocks with Research MK3 once 15 waste-producing buildings are standing.",
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH3)) return { current: 0, target: 1, unit: 'Research MK3 unlocked' };
            return { current: Math.min(AutoHaulSystem.wasteBuildingCount(), 15), target: 15, unit: 'waste-producing buildings' };
          },
        },
        {
          type: T.GASSTATION,
          name: 'Gas Station',
          desc: '6×5 refuelling stop. Pulls fuel oil off a refinery pipe network and tops up any truck that drives near it. Up to 5 across the map. Unlocks after an Oil Refinery produces ' + GASSTATION_FUELOIL.toLocaleString('en-US') + ' fuel oil.',
          cost: EntityDefs[T.GASSTATION].cost,
          getProgress() { return { current: Math.min(Math.floor(OilSystem.getTotalFuelOil()), GASSTATION_FUELOIL), target: GASSTATION_FUELOIL, unit: 'fuel oil refined' }; },
        },
        {
          type: T.COALWASTE,
          name: 'Coal Waste Processing Facility',
          desc: '8×7. Trucks drop coal ash here; it processes away while powered, for a disposal fee per load. One per city. Unlocks after a Coal Power Generator reaches 60% ash waste.',
          cost: EntityDefs[T.COALWASTE].cost,
          getProgress() { return _wasteProgress(T.COALGENERATOR, '_ashWaste', '% ash waste'); },
        },
        {
          type: T.OILWASTE,
          name: 'Oil Waste Processing Facility',
          desc: '8×9. Trucks drop refinery sludge here; it processes away while powered, for a disposal fee per load. One per city. Unlocks after an Oil Refinery reaches 60% sludge.',
          cost: EntityDefs[T.OILWASTE].cost,
          getProgress() { return _wasteProgress(T.REFINERY, '_sludgeWaste', '% sludge'); },
        },
        {
          type: T.NUCLEARWASTE,
          name: 'Nuclear Waste Processing Facility',
          desc: '13×11. Trucks drop spent reactor waste here; it processes away slowly while powered, for a steep disposal fee per load. One per city. Unlocks after a Nuclear Reactor reaches 60% waste storage.',
          cost: EntityDefs[T.NUCLEARWASTE].cost,
          getProgress() { return _wasteProgress(T.NUCLEARREACTOR, '_spentFuel', 'spent fuel'); },
        },
        {
          type: T.SURVEY,
          name: 'Resource Survey Station',
          desc: '4×4. Paid scans reveal geothermal deposits first, then coal, oil, uranium and sulfur once researched. One scan at a time. First geothermal scan: $12.5k. Unlocks at 200 kW consumed.',
          cost: 0,
          getProgress() { return { current: Math.floor(PowerNetwork.stats.totalConsumed), target: 200, unit: 'W consumed' }; },
        },
        {
          type: T.SURVEY2,
          name: 'Survey Station MK2',
          desc: `6×6 geophysics observatory. Two dishes run two scans at once, every scan started here costs 25% less, and it is the only station that can run the Lithium, Helium and Rare Earth scans. $150,000. Unlocks with the MK4 Research Station placed and ${SURVEY2_SCANS} surveys run.`,
          cost: 0,
          getProgress() { return { current: (EntityRegistry.getByType(T.MK4RESEARCH).size > 0 ? 1 : 0) + Math.min(SURVEY2_SCANS, CoalSystem.getAllSurveyCount()), target: 1 + SURVEY2_SCANS, unit: `of: MK4 Research placed, ${SURVEY2_SCANS} surveys run` }; },
        },
      ],
    },
    {
      id: 'amenities', label: 'Amenities',
      items: [
        {
          type: T.LAMP,
          name: 'Street Lamp',
          desc: 'Boosts satisfaction within 4 tiles. Unlocks after 5 residential customers.',
          cost: 2,
          getProgress() { const n = HouseRequestSystem.getHousesAccepted(); return { current: Math.min(n, 5), target: 5, unit: 'residential customers' }; },
        },
        {
          type: T.CAMERA,
          name: 'Security Camera',
          desc: 'Boosts satisfaction within 5 tiles. Unlocks after 5 fulfilled amenity requests.',
          cost: 4,
          getProgress() { return { current: Math.min(AmenityRequestSystem.getTotalFulfilled(), 5), target: 5, unit: 'amenity requests' }; },
        },
        {
          type: T.CELLTOWER,
          name: 'Cell Tower',
          desc: '4×4, $20k, earns $12/s. Unlocks after 25 residential properties (Research MK2 required).',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH2)) return { current: 0, target: 1, unit: 'Research MK2 needed' };
            return { current: Math.min(HouseRequestSystem.getHousesAccepted(), 25), target: 25, unit: 'houses' };
          },
        },
        {
          type: T.EVCHARGER,
          name: 'EV Charging Station',
          desc: 'Largest satisfaction boost within 3 tiles. Unlocks after accepting an EV Battery Factory (Research MK2 required). Residential zones request one, same as Cell Towers.',
          cost: 0,
          getProgress() {
            for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
              const e = GridManager.getEntity(c, r);
              if (e && e.col === c && e.row === r && e.fromRequest && e.commercialSubtype === 'evfactory') return { current: 1, target: 1, unit: 'EV Battery Factory' };
            }
            return { current: 0, target: 1, unit: 'EV Battery Factory' };
          },
        },
        {
          type: T.CIRCUITSWITCH,
          name: 'Circuit Switch',
          desc: '4×4, $40k, -$12.5/s. A manual feeder breaker: assign up to 500 kW of peak load to its circuit, then open it to shed that load and keep the rest of the grid up. Draws no power, so it can be thrown during a blackout. Requires Research MK2.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH2)) return { current: 0, target: 1, unit: 'Research MK2 needed' };
            return { current: Math.min(Math.round(PowerNetwork.stats.totalConsumed), 1000), target: 1000, unit: 'W consumed' };
          },
        },
        {
          type: T.CIRCUITSWITCH2,
          name: 'Circuit Switch MK2',
          desc: '6×5 armoured switchgear compound, $150k, -$30/s. A bigger breaker: assign up to 1.4 MW of peak load to its circuit, then open it to shed that load. Requires the MK4 Research Station + 7.5 MW generation.',
          cost: 0,
          getProgress() {
            if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return { current: 0, target: 1, unit: 'MK4 Research Station needed' };
            return { current: Math.min(Math.floor(PowerNetwork.stats.totalGenerated), 7500), target: 7500, unit: 'W generated' };
          },
        },
        {
          type: T.FIBERHUB,
          name: 'Fiber Hub',
          desc: '5×5, $25k, earns $22/s. Requires Research MK3. Unlocks after placing 85 properties in total.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH3)) return { current: 0, target: 1, unit: 'Research MK3 needed' };
            const placed = HouseRequestSystem.getHousesAccepted() + HouseRequestSystem.getCommercialsAccepted() + HouseRequestSystem.getIndustrialsAccepted();
            return { current: Math.min(placed, 85), target: 85, unit: 'properties placed' };
          },
        },
        {
          type: T.FISHINGPOLE,
          name: 'Fishing Pole',
          desc: 'Cast over any water tile to fish for biofuel. Unlocks after placing a Research Station and generating 5000 Ws with biofuel generator.',
          cost: 0,
          getProgress() {
            if (!Progression.isUnlocked(T.RESEARCH)) {
              return { current: Math.floor(BiofuelSystem.getTotalCollected()), target: 125, unit: 'biofuel collected (Research Station)' };
            }
            return { current: Math.floor(Progression.totalWs), target: 5000, unit: 'Ws generated' };
          },
        },
        {
          type: T.FASTTRAVEL,
          name: 'Fast Travel',
          desc: 'Double-click anywhere on the World Map to pan the camera there instantly. Unlocks after getting a Coal Power Generator running.',
          cost: 0,
          getProgress() {
            for (const e of EntityRegistry.getByType(T.COALGENERATOR)) {
              if (e.powered && e._fuelled) return { current: 1, target: 1, unit: 'Coal Generator running' };
            }
            return { current: 0, target: 1, unit: 'Coal Generator running' };
          },
        },
      ],
    },
  ];

  // Flat list for backward-compat lookups
  const RESEARCH_UNLOCKS = RESEARCH_UNLOCK_CATEGORIES.flatMap(c => c.items);

  function panel()   { return document.getElementById('research-panel'); }
  function isOpen()  { return panel().classList.contains('visible'); }

  function open(entity) {
    targetEntity = entity;
    anchorEntity = entity;
    panel().classList.add('visible');
    // Defensive: if SFX.windowpop is missing or throws, it must NOT prevent
    // reposition()/refresh() below — a thrown error here used to silently
    // skip buildUnlockItems() on every open(), leaving the panel showing
    // stale content from whichever station last successfully refreshed
    // (e.g. via the UNLOCK button or updateStats()'s periodic rebuild) —
    // which is exactly what caused MK2/MK3 panels to show the wrong list.
    try { SFX.windowpop?.(); } catch (_e) {}
    filter = 'all';
    _frozenOrder = null;   // a fresh look: sort the list again
    document.getElementById('rp-unlocks').scrollTop = 0;
    buildHeader();
    reposition();
    refresh();
  }

  function close() {
    targetEntity = null;
    anchorEntity = null;
    panel().classList.remove('visible');
  }

  // Position panel near the entity in screen space. Anchored to the station
  // it was opened on, so flicking through the MK tabs doesn't fling the panel
  // across the map to each tier's station.
  function reposition() { _positionNear(anchorEntity || targetEntity); }

  function _positionNear(targetEntity) {
    if (!targetEntity) return;
    const { x: wx, y: wy } = GridManager.tileToWorld(targetEntity.col, targetEntity.row);
    const sx = (wx + TILE - targetEntity.col * 0 ) * Camera.zoom - Camera.x * Camera.zoom;
    const sy = wy * Camera.zoom - Camera.y * Camera.zoom;

    // Use Camera.worldToScreen equivalent
    const screenX = (wx + TILE) * Camera.zoom - Camera.x * Camera.zoom + 8;
    const screenY = wy          * Camera.zoom - Camera.y * Camera.zoom;

    const p   = panel();
    const W   = window.innerWidth;
    const H   = window.innerHeight;
    // Measure the panel rather than assuming its CSS width (index.html) —
    // a hardcoded figure here once drifted from the real one and left the
    // right-hand edge hanging off the screen.
    const pw  = p.offsetWidth  || 380;
    const ph  = p.offsetHeight || 240;

    // Station not on screen at all? Then there is nothing to anchor to, and
    // the clamps below would shove the panel into whichever corner the
    // station happens to lie past — a panel pinned to an arbitrary edge for
    // no visible reason. Centre it instead, so it reads as the dialog it
    // effectively is. This is the normal case when the panel is opened from
    // an unlock notification, which no longer moves the camera.
    const stW = (targetEntity.width  || 1) * TILE * Camera.zoom;
    const stH = (targetEntity.height || 1) * TILE * Camera.zoom;
    const stX = wx * Camera.zoom - Camera.x * Camera.zoom;
    const stY = wy * Camera.zoom - Camera.y * Camera.zoom;
    if (stX + stW < 0 || stX > W || stY + stH < 0 || stY > H) {
      p.style.left = `${Math.round(Math.max(10, (W - pw) / 2))}px`;
      p.style.top  = `${Math.round(Math.max(10, (H - ph) / 2))}px`;
      keepPanelOnScreen(p);
      return;
    }

    let left = screenX;
    let top  = screenY;

    // Keep inside viewport
    if (left + pw > W - 10) left = screenX - TILE * Camera.zoom - pw - 8;
    if (top  + ph > H - 10) top  = H - ph - 10;
    if (top  < 10)          top  = 10;
    if (left < 10)          left = 10;

    // Final clamp on BOTH axes. The flip-to-the-left branch above only
    // subtracts a fixed offset from screenX, so a station far to the RIGHT of
    // the camera still lands well outside the viewport — and the `left < 10`
    // guard never catches it because the value is large and positive, not
    // negative. The panel then opens correctly but sits off-screen, which is
    // indistinguishable from "E did nothing" when you press it away from your
    // build. Same reasoning vertically.
    left = Math.max(10, Math.min(left, W  - pw - 10));
    top  = Math.max(10, Math.min(top,  H  - ph - 10));

    p.style.left = `${Math.round(left)}px`;
    p.style.top  = `${Math.round(top)}px`;
    keepPanelOnScreen(p);
  }

  // Track last-known ready state to detect changes without rebuilding every tick
  let lastReadySnapshot = '';

  // Which slice of the list the filter chips are showing
  let filter = 'all';
  const FILTERS = [['all', 'All'], ['ready', 'Ready'], ['progress', 'In progress'], ['unlocked', 'Unlocked']];
  const EMPTY_TEXT = {
    all:      'Nothing to research at this station.',
    ready:    'Nothing is ready to unlock yet.',
    progress: 'Nothing left in progress.',
    unlocked: 'Nothing unlocked here yet.',
  };
  // Tier-wide tallies from the last rebuild, keyed like FILTERS
  let lastCounts = { all: 0, ready: 0, progress: 0, unlocked: 0 };

  // Strict per-tier match — each station shows ONLY its own tier's
  // unlocks, no fallthrough from lower tiers. Tier comes from
  // Progression.tierOf(), the single canonical classification (see
  // progression.js) shared by both the unlock-ready logic and this panel,
  // so an item can never be "ready" in one place and invisible in another.
  function _stationTier() {
    const t = targetEntity && targetEntity.type;
    return t === T.MK5RESEARCH ? 5 : t === T.MK4RESEARCH ? 4 : t === T.RESEARCH3 ? 3 : t === T.RESEARCH2 ? 2 : 1;
  }

  function _stateOf(type) {
    return Progression.isUnlocked(type) ? 'unlocked' : Progression.isReady(type) ? 'ready' : 'progress';
  }

  // This station's items in display order: ready to unlock first, then in
  // progress from the closest to done, then unlocked. Ties keep the category
  // order.
  //
  // The in-progress order is taken once, when the panel opens (or turns to
  // another tier's tab), and held while the player is looking: two items
  // neck and neck used to trade places every time one crept ahead, so the
  // row being read jumped. An item still moves to its new section when its
  // state changes (it needs its Unlock button), but keeps its place in the
  // order; the next open sorts afresh.
  const SECTION_LABEL = { ready: 'Ready to unlock', progress: 'In progress', unlocked: 'Unlocked' };
  const STATE_RANK = { ready: 0, progress: 1, unlocked: 2 };
  let _frozenOrder = null;   // { tier, rank: Map(type -> position) } while the panel is open
  function _orderedItems() {
    const tier = _stationTier(), items = [];
    RESEARCH_UNLOCK_CATEGORIES.forEach(cat => cat.items.forEach(u => {
      if (Progression.tierOf(u.type) !== tier) return;
      const pg = _progressOf(u);
      items.push({ u, cat, state: _stateOf(u.type), pct: Math.round(Math.min(1, pg.target ? pg.current / pg.target : 1) * 100) });
    }));
    if (!_frozenOrder || _frozenOrder.tier !== tier) {
      items.sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || (a.state === 'progress' ? b.pct - a.pct : 0));
      _frozenOrder = { tier, rank: new Map(items.map((it, i) => [it.u.type, i])) };
      return items;
    }
    const rank = _frozenOrder.rank;
    return items.sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || (rank.get(a.u.type) ?? 1e9) - (rank.get(b.u.type) ?? 1e9));
  }

  function _drawIcon(canvas, type) {
    if (!canvas) return;
    const c = canvas.getContext('2d');
    try { RenderSystem.drawIconInto(c, type, canvas.width); } catch (_e) {}
    // Capabilities with no sprite or hand-drawn icon (the resource scans)
    // come out empty — CSS draws a plain research marker in the tile instead.
    const d = c.getImageData(0, 0, canvas.width, canvas.height).data;
    let blank = true;
    for (let i = 3; i < d.length; i += 4) if (d[i]) { blank = false; break; }
    canvas.parentElement.classList.toggle('no-icon', blank);
  }

  // Header controls, filter chips and UNLOCK buttons are bound once, by
  // delegation, so rebuilding the list never leaves a dead button behind.
  let _chromeBound = false;
  function _initChrome() {
    if (_chromeBound) return;
    _chromeBound = true;
    const root = panel();
    root.querySelector('.rp-close').addEventListener('click', close);
    // Point the panel at another tier's station. The tab's tier is only the
    // panel's view; the panel stays where it is.
    const switchTier = (tier, toFilter = 'all') => {
      if (tier === _stationTier()) return;
      const set = EntityRegistry.getByType(Progression.stationTypeForTier(tier));
      if (!set.size) return;
      targetEntity = [...set][0];
      filter = toFilter;
      document.getElementById('rp-unlocks').scrollTop = 0;
      try { SFX.click?.(); } catch (_e) {}
      buildHeader();
      refresh();
    };
    root.querySelector('.rp-tabs').addEventListener('click', ev => {
      const tab = ev.target.closest('.rp-tab');
      if (!tab || tab.disabled) return;
      switchTier(+tab.dataset.tier);
    });
    // "Ready at MK2 → Go": straight to that tab, showing what's ready.
    root.querySelector('.rp-elsewhere').addEventListener('click', ev => {
      const go = ev.target.closest('.rp-elsewhere-go');
      if (go) switchTier(+go.dataset.tier, 'ready');
    });
    root.querySelector('.rp-filters').addEventListener('click', ev => {
      const chip = ev.target.closest('.rp-filter');
      if (!chip || chip.dataset.filter === filter) return;
      filter = chip.dataset.filter;
      document.getElementById('rp-unlocks').scrollTop = 0;
      buildUnlockItems();
    });
    document.getElementById('rp-unlocks').addEventListener('click', ev => {
      const btn = ev.target.closest('.rp-unlock-btn');
      if (!btn) return;
      Progression.manualUnlock(btn.dataset.type);
      buildUnlockItems();
    });
  }

  // Station name, tier badge and sprite — only changes when the panel is
  // pointed at a different station.
  function buildHeader() {
    const root = panel();
    const label = EntityDefs[targetEntity.type]?.label || 'Research Station';
    // The tier is shown in its own badge, so drop it from the name ("MK4
    // Research Station" and "Research Station MK2" both read "Research Station").
    root.querySelector('.rp-title').textContent = label.replace(/\s*MK\s*\d+$/i, '').replace(/^MK\s*\d+\s*/i, '') || label;
    root.querySelector('.rp-tier').textContent = `MK${_stationTier()}`;
    _drawIcon(root.querySelector('.rp-emblem-icon'), targetEntity.type);
  }

  // MK1…MK5 tabs along the top. A tier with no station standing has nothing
  // to show (its stats are the station's), so its tab is greyed out; a dot
  // marks tiers with something ready to unlock.
  function _buildTabs() {
    const cur = _stationTier(), readyAt = _readyElsewhere();
    panel().querySelector('.rp-tabs').innerHTML = [1, 2, 3, 4, 5].map(tier => {
      const type  = Progression.stationTypeForTier(tier);
      const built = EntityRegistry.getByType(type).size > 0;
      const ready = built && tier !== cur && readyAt.has(tier);
      const title = !built ? `No MK${tier} Research Station built`
                  : ready  ? `Ready to unlock here: ${readyAt.get(tier).join(', ')}`
                  : (EntityDefs[type]?.label || `MK${tier} Research Station`);
      return `<button class="rp-tab${tier === cur ? ' active' : ''}${ready ? ' has-ready' : ''}" data-tier="${tier}"`
           + `${built ? '' : ' disabled'} title="${title}">MK${tier}</button>`;
    }).join('');
  }

  // Items ready to unlock on OTHER tiers. Each item lives on its own tier's
  // tab only, so research that lands at an older station (the EV Charging
  // Station is MK2's, say) was invisible from the newest one the player
  // actually opens — the R key opens the highest station. Said up top with
  // a button straight to that tab. Only tiers whose station stands, since
  // that's where the unlock is confirmed.
  // tier -> names of its items ready to unlock, for every tier but the one
  // shown whose station stands. Drives both this banner and the flashing tabs.
  function _readyElsewhere() {
    const cur = _stationTier(), byTier = new Map();
    for (const u of RESEARCH_UNLOCKS) {
      if (!Progression.isReady(u.type) || Progression.isUnlocked(u.type)) continue;
      const tier = Progression.tierOf(u.type);
      if (tier === cur || !EntityRegistry.getByType(Progression.stationTypeForTier(tier)).size) continue;
      if (!byTier.has(tier)) byTier.set(tier, []);
      if (!byTier.get(tier).includes(u.name)) byTier.get(tier).push(u.name);
    }
    return byTier;
  }
  function _buildElsewhere() {
    const box = panel().querySelector('.rp-elsewhere');
    const byTier = _readyElsewhere();
    box.classList.toggle('show', byTier.size > 0);
    if (!byTier.size) { box.innerHTML = ''; return; }
    const n = [...byTier.values()].reduce((s, l) => s + l.length, 0);
    box.innerHTML = `<div class="rp-elsewhere-head">🔓 ${n === 1 ? 'Ready to unlock at another station' : `${n} ready to unlock at other stations`}</div>`
      + [...byTier.entries()].sort((a, b) => a[0] - b[0]).map(([tier, names]) =>
          `<div class="rp-elsewhere-row"><span class="rp-elsewhere-tier">MK${tier}</span>`
        + `<span class="rp-elsewhere-names">${names.join(', ')}</span>`
        + `<button class="rp-elsewhere-go" data-tier="${tier}">Go to MK${tier} →</button></div>`).join('');
  }

  // Full DOM rebuild — called on open() and when unlock state actually changes
  function buildUnlockItems() {
    _initChrome();
    const root = panel();
    const container = document.getElementById('rp-unlocks');
    const scrollTop = container.scrollTop;
    container.innerHTML = '';

    const counts = { all: 0, ready: 0, progress: 0, unlocked: 0 };
    const items = _orderedItems();
    items.forEach(it => { counts.all++; counts[it.state]++; });

    // One heading per state, over the items the filter shows
    let section = null;
    items.forEach(({ u, cat, state, pct }) => {
      if (filter !== 'all' && state !== filter) return;
      if (state !== section) {
        section = state;
        const head = document.createElement('div');
        head.className = 'rp-cat';
        head.innerHTML = `<span>${SECTION_LABEL[state]}</span><span class="rp-cat-n">${counts[state]}</span>`;
        container.appendChild(head);
      }
      const stalled = state === 'progress' && _isStalled(u.type);
      const pg      = _progressOf(u);

      const item = document.createElement('div');
      item.className = `rp-item is-${state}`;

      const tag = state === 'unlocked' ? '<span class="rp-item-tag unlocked">✓ Unlocked</span>'
                : state === 'ready'    ? '<span class="rp-item-tag ready">Ready</span>'
                : stalled              ? '<span class="rp-item-tag paused">Paused</span>'
                : '';
      const foot = state === 'unlocked' ? ''
                 : state === 'ready'    ? `<button class="rp-unlock-btn" data-type="${u.type}">Unlock</button>`
                 : `<div class="rp-bar-row" data-type="${u.type}">
                      <div class="rp-bar"><div class="rp-bar-fill${stalled ? ' stalled' : ''}" style="width:${pct}%"></div></div>
                      <span class="rp-pct">${pct}%</span>
                    </div>
                    <div class="rp-bar-label">${_progText(pg)}</div>`;

      item.innerHTML = `
        <div class="rp-icon"><canvas width="72" height="72"></canvas></div>
        <div class="rp-item-main">
          <div class="rp-item-header">
            <span class="rp-item-name">${u.name}</span>
            ${tag}
          </div>
          <div class="rp-item-cat">${cat.label}</div>
          <div class="rp-item-desc">${_descOf(u)}</div>
          ${foot}
        </div>
      `;
      _drawIcon(item.querySelector('canvas'), u.type);
      container.appendChild(item);
    });

    if (!container.firstChild) {
      const empty = document.createElement('div');
      empty.className = 'rp-empty';
      empty.textContent = EMPTY_TEXT[filter];
      container.appendChild(empty);
    }
    container.scrollTop = scrollTop;

    lastCounts = counts;
    _buildTabs();
    _buildElsewhere();
    root.querySelector('.rp-filters').innerHTML = FILTERS.map(([id, label]) =>
      `<button class="rp-filter${id === filter ? ' active' : ''}${id === 'ready' && counts.ready ? ' has-ready' : ''}" data-filter="${id}">`
      + `${label}<span class="rp-filter-n">${counts[id]}</span></button>`
    ).join('');
    root.querySelector('.rp-count-val').textContent = `${counts.unlocked} / ${counts.all}`;
    root.querySelector('.rp-overall-fill').style.width = `${counts.all ? Math.round(counts.unlocked / counts.all * 100) : 0}%`;

    lastReadySnapshot = snapshotReady();
    reposition();
  }

  // A progress readout. Power targets ('W consumed', 'W generated') read in
  // kW/MW like everywhere else, both ends in the target's unit; money ('$ …')
  // reads as dollars; other counts get thousands separators (125,000 t, not
  // 125000 t).
  // An unlock written as goals in progression.js reports its own progress and
  // requirement sentence, so the panel can't drift from what actually unlocks
  // it. Everything else still uses its entry's getProgress() and desc.
  function _progressOf(u) {
    return Progression.goalProgress?.(u.type) || u.getProgress();
  }
  function _descOf(u) {
    const req = Progression.requirementText?.(u.type);
    return req ? `${u.desc} ${req}` : u.desc;
  }

  function _progText(p) {
    if (p.text) return p.text;   // goal-based unlocks write their own
    if (/^W\b/.test(p.unit)) return `${formatPowerPair(p.current, p.target)}${p.unit.slice(1)}`;
    const n = v => (Number.isInteger(v) ? v : +(+v).toFixed(1)).toLocaleString('en-US');
    if (/^\$\s/.test(p.unit)) return `$${n(p.current)} / $${n(p.target)} ${p.unit.slice(2)}`;
    return `${n(p.current)} / ${n(p.target)} ${p.unit}`;
  }

  // Lightweight stat update — only touches text nodes, never rebuilds DOM
  function updateStats() {
    if (!targetEntity) return;
    const powered = targetEntity.powered;

    const root = panel();
    const statusEl = root.querySelector('.rp-status');
    statusEl.textContent = powered ? 'Active' : 'Offline';
    statusEl.className   = `rp-status ${powered ? 'active' : 'offline'}`;
    const upkeep = targetEntity.def?.upkeep ?? EntityDefs[targetEntity.type]?.upkeep ?? 0;
    root.querySelector('.rp-upkeep-val').textContent = `$${upkeep.toFixed(2)}/s`;
    const draw = targetEntity._activePowerInput ?? targetEntity.def?.powerInput ?? EntityDefs[targetEntity.type]?.powerInput ?? 0;
    root.querySelector('.rp-draw-val').textContent = `${formatPower(draw)}`;

    // Research only advances while this tier's station is powered (see
    // progression.js). Said once here, for the whole list, rather than on
    // every row — the rows just carry a "Paused" tag.
    const notice = root.querySelector('.rp-notice');
    const note   = lastCounts.progress > 0 ? _powerStallNote(_stationTier()) : null;
    notice.classList.toggle('show', !!note);
    if (note) notice.textContent = note;

    // Research stations are strikeable, and this is their only panel.
    // Hung off the panel root, not #rp-unlocks — buildUnlockItems() clears
    // that container's innerHTML whenever unlock state changes.
    LightningDamageSystem.attachRepairUI(root, targetEntity, refresh);

    // Update progress bars + readouts in-place (no DOM recreation)
    root.querySelectorAll('.rp-bar-row[data-type]').forEach(row => {
      const u = RESEARCH_UNLOCKS.find(u => u.type === row.dataset.type);
      if (!u) return;
      const p   = _progressOf(u);
      const pct = Math.round(Math.min(1, p.current / p.target) * 100);
      row.querySelector('.rp-bar-fill').style.width = `${pct}%`;
      row.querySelector('.rp-pct').textContent = `${pct}%`;
      row.nextElementSibling.textContent = _progText(p);
    });

    // Rebuild DOM only if ready-state actually changed (e.g. threshold just
    // crossed). The order itself holds while the panel is open (_frozenOrder).
    const snap = snapshotReady();
    if (snap !== lastReadySnapshot) buildUnlockItems();
  }

  function _isStalled(type) {
    return !!Progression.isPowerStalled && Progression.isPowerStalled(type);
  }

  // Why this tier's research is frozen, or null. A dark MK1 stops MK1 items
  // dead — this is what tells the player that, instead of leaving progress
  // bars that silently never pay out.
  function _powerStallNote(tier) {
    if (!Progression.tierPowered || Progression.tierPowered(tier)) return null;
    if (Progression.tierStallReason(tier) !== 'missing') return '⚡ Station unpowered. Research is paused until it has power.';
    const station = Progression.stationTypeForTier(tier);
    return `⚡ Research is paused. It needs a ${EntityDefs[station]?.label || 'MK' + tier + ' Research Station'}.`;
  }

  function snapshotReady() {
    return RESEARCH_UNLOCKS.map(u =>
      Progression.isUnlocked(u.type) ? 'U'
        : Progression.isReady(u.type) ? 'R'
        : _isStalled(u.type) ? 'P'
        : 'L'
    ).join('');
  }

  function refresh() { buildUnlockItems(); updateStats(); }

  // Opens the panel for the highest-tier Research Station currently
  // placed (MK5 > MK4 > MK3 > MK2 > MK1) — used by the 'R' hotkey so the player
  // doesn't have to click through to whichever station they want.
  function openHighestTier() {
    const tiers = [T.MK5RESEARCH, T.MK4RESEARCH, T.RESEARCH3, T.RESEARCH2, T.RESEARCH];
    for (const t of tiers) {
      const set = EntityRegistry.getByType(t);
      if (set.size > 0) { open([...set][0]); return true; }
    }
    return false;
  }

  return {
    open,
    close,
    isOpen,
    openHighestTier,
    get target() { return targetEntity; },

    tick() {
      if (!isOpen()) return;
      if (!targetEntity || !GridManager.getEntity(targetEntity.col, targetEntity.row)) {
        close(); return;
      }
      if (anchorEntity && !GridManager.getEntity(anchorEntity.col, anchorEntity.row)) anchorEntity = targetEntity;
      updateStats();   // safe every tick — never touches button DOM
    },
  };
})();

