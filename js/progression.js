// Fusion-chain unlock goals. Sized so each takes roughly 5–15 minutes of one
// producer at 1× speed. Most exceed the producer's own output buffer, and
// production stalls when that buffer is full, so reaching them means
// banking the surplus in Gas Holders / Storage Containers (or running
// several producers). Totals are cumulative, so stored stock still counts.
const FUSION_GOALS_BASE = {
  hydrogenAtmos: 60000, // Atmos. Collector  — Electrolyzer 72/s        ≈ 14 min (lands after the Lithium Scan)
  hydrogen:  25000,  // Lithium Scan         — Electrolyzer 72/s        ≈ 6 min
  lithium:    5000,  // Lithium Proc. Plant  — Lithium Mine 15/s        ≈ 6 min
  nitrogen:  12000,  // Haber-Bosch          — Atmos. Collector 6/s     ≈ 33 min
  ammonia:   20000,  // Isotopic Wash Tower  — Haber-Bosch 40/s         ≈ 8 min
  compound:   4000,  // Tritium Breeder      — Lithium Proc. Plant 2.4/s ≈ 28 min
  deuterium:  5000,  // Fusion Fuel Plant    — Wash Tower 2.1/s         ≈ 40 min (was 3600 at 1.51/s)
  pellets1:     75,  // Helium Scan          — Fuel Plant, tritium-limited ≈ 0.0375/s ≈ 33 min
  helium:     4000,  // Cryo Plant, then the Fusion Reactor — Helium Well 2/s ≈ 33 min (past one well's 1,000 buffer: bank it in a Gas Holder)
  pellets2:    150,  // no longer an unlock gate (was the Fusion Reactor's, before it moved to pellets1)
  burned:      450,  // Helium-3 Separator   — pellets burned in a reactor (0.5/s at full burn ≈ 15 min; was 150)
  he3:         720,  // no longer an unlock gate (was the Advanced Fusion Reactor's placeholder)
  he3pellets:  200,  // Advanced Fusion Reactor + MHD Ring — D-He3 pellets made, ~0.156/s per Fuel Plant ≈ 21 min with one (was 60)
  dhe3burned:  100,  // Rare Earth Scan      — D-He3 pellets burned in an Advanced Fusion Reactor (0.4/s at full burn ≈ 4 min)
  rareearth:  2000,  // Leach Plant         — Rare Earth Mine 0.8/s     ≈ 42 min with one (Field Core chain; was 600)
  oxide:       300,  // Superconductor Mill  — Leach Plant 0.4/s         ≈ 12.5 min
  tape:         75,  // Core Works           — Superconductor Mill 0.1/s ≈ 12.5 min
};
// Live goals: the Fusion Research Facility's post-fusion experiments trim
// them (FusionResearch.goalScale), so read FUSION_GOALS, never the base.
const FUSION_GOALS = {};
for (const k of Object.keys(FUSION_GOALS_BASE)) Object.defineProperty(FUSION_GOALS, k, {
  enumerable: true,
  get: () => Math.ceil(FUSION_GOALS_BASE[k] * (typeof FusionResearch !== 'undefined' ? FusionResearch.goalScale() : 1)),
});
const _fmtGoal = n => n.toLocaleString('en-US');
// Carbon tax the player must have paid before scrubbers, and then the
// Carbon Capture Plant, unlock.
const SCRUBBER_TAX       = 100000;
const CARBON_CAPTURE_TAX = 200000;
// Coal mined (all mines, all time) that unlocks the Oil Scan, with MK2.
const OILSCAN_COAL_MINED = 20000;
// Coal mined (all mines, all time) that unlocks the Coal Mine MK2, with MK3.
const COALMINE2_COAL_MINED = 125000;
// Coal mined (all mines, all time) that unlocks the Coke Oven Battery, with MK4.
const COKEOVEN_COAL_MINED = 250000;
// Coke made (all ovens, all time) that unlocks the Graphitization Furnace.
const GRAPHITE_COKE_MADE = 1500;
// Nuclear Reactors running at once that unlocks the Engineering Office, with MK3.
const ENGOFFICE_REACTORS = 3;
// Oil chain gates, all cumulative and saved. Spaced so one MK1 pump jack
// (~3.9 crude/s) reaches the tank in ~6.5 min, the refinery ~11 min after,
// and the gas station ~4 min of refining after that.
const OILSTORAGE_CRUDE   = 1500;
const REFINERY_CRUDE     = 4000;
const GASSTATION_FUELOIL = 500;
// MK1 Steam Turbines running at once on Fusion Reactor steam that unlock
// the Steam Turbine MK2. _steamSourceType is set each tick by
// SteamTurbineSystem to the reactor the turbine actually drew from.
const FUSION_TURBINES_FOR_MK2 = 4;
const fusionTurbinesRunning = () => {
  let n = 0;
  for (const e of EntityRegistry.getByType(T.STEAMTURBINE))
    if (e._generating && e._steamSourceType === T.HULKINGFUSIONREACTOR) n++;
  return n;
};
// A Cryo Plant has made liquid helium (opens the Fusion Reactor).
const fusionCoolantMade = () => (typeof CryoPlantSystem !== 'undefined') && CryoPlantSystem.getTotalLiquefied() > 0;
// A Fusion Reactor with power on its line, lit or not (opens the Helium Scan
// for a save that already has one, built before the reactor came after it).
const fusionReactorPowered = () => {
  for (const r of EntityRegistry.getByType(T.HULKINGFUSIONREACTOR)) if (r.powered) return true;
  return false;
};
// D-He3 pellets made by the Fuel Plants' split (gates the Advanced Fusion
// Reactor and the MHD Ring).
const he3PelletsMade = () => (typeof FusionFuelPlantSystem !== 'undefined' && FusionFuelPlantSystem.getTotalHe3PelletsProduced)
  ? FusionFuelPlantSystem.getTotalHe3PelletsProduced() : 0;
// An Advanced Fusion Reactor has lit (or burned a pellet, for a save loaded
// with none standing): unlocks the Helium Well MK2.
const advFusionHasRun = () => {
  if (typeof AdvancedFusionReactorSystem === 'undefined') return false;
  if (AdvancedFusionReactorSystem.getTotalPelletsBurned() > 0) return true;
  for (const r of EntityRegistry.getByType(T.ADVFUSIONREACTOR)) if (r._started) return true;
  return false;
};
// MK1 + MK2 panels on the map that unlock the Solar Array.
const SOLAR3_PANELS = 25;
// Trucks owned that unlock the Drone Port.
const DRONE_PORT_TRUCKS = 5;
// Income ($/s, the HUD's INCOME figure) that unlocks the Lightning Rod MK3.
const LIGHTNINGROD3_INCOME = 4000;
// Paid resource surveys (all kinds together) that unlock the Survey Station MK2.
const SURVEY2_SCANS = 10;
const DRONE_CHARGER_PORTS = 3;   // Drone Ports standing before the Drone Charging Port is offered
const solarPanelCount = () => EntityRegistry.getByType(T.SOLAR).size + EntityRegistry.getByType(T.SOLAR2).size;
// Belt tiles on the map (underground belts and splitters included; a belt
// under a pipe crossing counts once) that unlock the Conveyor Splitter.
const SPLITTER_BELT_TILES = 150;
// Belt tiles on the map (same count) that unlock the Hauler.
const HAULER_BELT_TILES = 500;
const beltTileCount = () => {
  let n = EntityRegistry.getByType(T.CONVEYOR).size;
  for (const t of [T.PIPE, T.UNDERGNDPIPE]) for (const p of EntityRegistry.getByType(t)) if (p._underConveyor) n++;
  return n;
};

const Progression = (() => {
  const BASE_UNLOCKED = [T.BIOFUELGEN, 'delete'];  // WIRE and SOLAR unlock via progression
  const unlocked      = new Set(BASE_UNLOCKED);
  const ready         = new Set();   // threshold met, awaiting manual unlock
  const readyNotifIds = {};          // type -> NotificationStack id, for the "ready to unlock" card
  let totalWs             = 0;
  let totalResearch      = 0;
  let maxSubstationCharge = 0;

  // Residential + commercial + industrial properties currently placed
  // (HouseRequestSystem decrements these when a customer leaves).
  function _totalPropertiesPlaced() {
    return HouseRequestSystem.getHousesAccepted()
         + HouseRequestSystem.getCommercialsAccepted()
         + HouseRequestSystem.getIndustrialsAccepted();
  }

  // The MK5 gate: Steam Turbines running on plutonium at the same time.
  //
  // Deliberately turbines rather than "an Advanced Reactor ran once" — the
  // milestone is OPERATING the plutonium plant, not lighting it. One
  // Advanced Reactor raises 1200 steam against a turbine's 100 draw, so
  // PLUTONIUM_TURBINES = 12 is one reactor's FULL turbine hall, and the
  // whole chain behind it (≈3 uranium reactors' spent fuel → a Reprocessing
  // Plant → an Advanced Fuel Processing plant → two Cooling Towers) has to
  // be running clean to hold it there. Raising it past 12 would force a
  // second Advanced Reactor and double the entire chain.
  //
  // Declared up here, not beside its helpers: UNLOCK_DEFS' `hint` is a
  // template literal evaluated as the array is BUILT, so a const below it is
  // still in the temporal dead zone and the whole module throws on load.
  const PLUTONIUM_TURBINES = 12;
  // Reprocessing Plant gate: one Spent Fuel Pool 90% full — 360 of its 400
  // capacity (EntityDefs[T.SPENTFUELPOOL].spentFuelCapacity), the level its
  // waste card starts warning at. Needs no sticky flag — unlocks latch once
  // granted. Up here for the same dead-zone reason.
  const POOL_FILL_FOR_REPROCESSOR = 360;
  // Sulfur Mine MK2 gate: one sulfur deposit half worked out.
  const SULFUR_DEPOSIT_PCT_FOR_MK2 = 50;

  // ── Goal-based unlocks: one place for a requirement ────────────────
  // A requirement written out by hand lives in five places — check, hint,
  // progressFor() here, the research panel's description and progress line
  // (inspection_panel.js), the progress clock (progress_clock_ui.js) — and
  // changing one without the rest left bars and text that disagreed with
  // what actually unlocks. A def with `goals` states each target ONCE:
  //
  //   requires: { label: 'Research MK3', met: () => ... },   // optional gate
  //     (hint: 'Place the MK4 Research Station' when the gate is not an unlock)
  //   goals: [{ verb: 'Produce', what: 'sulfuric acid', target: 2000, get: () => ... }],
  //
  // and check, hint and progressFor() are derived from it here, while the
  // panel and the clock read goalProgress()/requirementText(). New or changed
  // requirements should be written this way.
  const _n = v => Math.floor(v).toLocaleString('en-US');
  // Water Extractors on power and over water (hydro_system sets _waterRate
  // only then). Gate for the Coal Power Generator and Pipe.
  const waterExtractorsPumping = () => {
    let n = 0;
    for (const e of EntityRegistry.getByType(T.WATEREXTRACTOR)) if (e.powered && e._waterRate > 0) n++;
    return n;
  };
  const _goalFrac = d => d.goals.reduce((s, g) => s + Math.min(1, (g.get() || 0) / g.target), 0) / d.goals.length;
  function _deriveFromGoals(d) {
    const met = () => !d.requires || d.requires.met();
    d.check = () => met() && d.goals.every(g => (g.get() || 0) >= g.target);
    d.hint  = [...(d.requires ? [d.requires.hint || `${d.requires.label} unlocked`] : []), ...d.goals.map(g => `${g.verb} ${_n(g.target)} ${g.what}`)].join(' · ');
    // Held at 99% until every goal is actually met, so rounding never shows
    // a bar at 100% that hasn't unlocked anything.
    d.progress = () => !met() ? 0 : d.check() ? 1 : Math.min(0.99, _goalFrac(d));
    // Panel readout: the bar fills with every goal, the label lists each one.
    d.goalProgress = () => met()
      ? { current: Math.floor(d.progress() * 100), target: 100, text: d.goals.map(g => `${_n(Math.min(g.target, g.get() || 0))} / ${_n(g.target)} ${g.what}`).join(' · ') }
      : { current: 0, target: 1, text: `${d.requires.label} needed` };
    d.requirementText = () => `Unlocks after you ${d.goals.map(g => `${g.verb.toLowerCase()} ${_n(g.target)} ${g.what}`).join(' and ')}${d.requires ? ` (${d.requires.label} required)` : ''}.`;
  }

  const UNLOCK_DEFS = [
    {
      id:    T.WIRE,
      tier:  1,
      label: 'Wire',
      check: () => BiofuelSystem.getTotalCollected() >= 50,
      hint:  'Collect 50 total biofuel',
    },
    {
      id:    T.SOLAR,
      tier:  1,
      label: 'Solar Panel MK1',
      check: () => DayNight.day() > 2 || (DayNight.day() === 2 && DayNight.hour() >= 6),
      hint:  'Survive to Day 2, 6:00 AM',
    },
    {
      id:    T.FISHINGPOLE,
      tier:  1,
      label: 'Fishing Pole',
      check: () => Progression.totalWs >= 5000 && Progression.isUnlocked(T.RESEARCH),
      hint:  'Generate 5000 Ws total and place a Research Station',
    },
    {
      id:    T.RESEARCH,
      tier:  1,
      label: 'Research Station MK1',
      check: () => BiofuelSystem.getTotalCollected() >= 125,
      hint:  'Collect 125 total biofuel',
    },
    {
      id:    T.MONITOR,
      tier:  1,
      label: 'Monitoring Station',
      check: () => EntityRegistry.getByType(T.WIND).size >= 5,
      hint:  'Place 5 Wind Turbines',
    },
    {
      id:    T.LAMP,
      tier:  1,
      label: 'Street Lamp',
      check: () => HouseRequestSystem.getHousesAccepted() >= 5,
      hint:  'Accept 5 residential customers',
    },
    {
      id:    T.CAMERA,
      tier:  1,
      label: 'Security Camera',
      check: () => AmenityRequestSystem.getTotalFulfilled() >= 5,
      hint:  'Fulfil 5 amenity requests',
    },
    {
      id:    T.CELLTOWER,
      tier:  2,
      label: 'Cell Tower',
      check: () => HouseRequestSystem.getHousesAccepted() >= 25 && Progression.isUnlocked(T.RESEARCH2),
      hint:  'Research MK2 unlocked · Accept 25 residential properties',
    },
    {
      id:    T.CIRCUITSWITCH,
      tier:  2,
      label: 'Circuit Switch',
      check: () => Progression.isUnlocked(T.RESEARCH2) && PowerNetwork.stats.totalConsumed >= 1000,
      hint:  'Research MK2 unlocked · Reach 1 MW of consumption',
    },
    {
      id:    T.FIBERHUB,
      tier:  3,
      label: 'Fiber Hub',
      check: () => Progression.isUnlocked(T.RESEARCH3) && _totalPropertiesPlaced() >= 85,
      hint:  'Research MK3 unlocked · Place 85 properties in total',
    },
    {
      id:    T.EVCHARGER,
      tier:  2,
      label: 'EV Charging Station',
      check: () => {
        if (!Progression.isUnlocked(T.RESEARCH2)) return false;
        for (const e of EntityRegistry.getByType(T.INDUSTRIAL)) {
          if (e.fromRequest && e.commercialSubtype === 'evfactory') return true;
        }
        return false;
      },
      hint:  'Research MK2 unlocked · Accept an EV Battery Factory',
    },
    {
      id:    T.BEACON,
      tier:  1,
      label: 'Communications Beacon',
      check: () => PowerNetwork.stats.totalGenerated >= 150,
      hint:  'Generate 150 kW total; the wider grid starts to notice you',
    },
    {
      id:    T.SUBSTATION,
      tier:  1,
      label: 'Substation MK1',
      check: () => PowerNetwork.stats.totalGenerated >= 200,
      hint:  'Generate 200 kW total',
    },
    {
      id:    T.POLE,
      tier:  1,
      label: 'Power Pole',
      check: () => HouseRequestSystem.getHousesAccepted() >= 1 || HouseRequestSystem.getCommercialsAccepted() >= 1 || HouseRequestSystem.getCabinCleared(),
      hint:  'Accept your first customer',
    },
    {
      id:    T.LIGHTNINGROD2,
      tier:  3,
      label: 'Lightning Rod MK2',
      // Deliberately not just "own a MK3 station" — the player has to take a
      // building strike WHILE that station stands. At MK3 the map is full of
      // reactors and plants worth real money, so the upgrade lands right
      // when losing one starts to genuinely hurt.
      check: () => Progression.isUnlocked(T.LIGHTNINGROD) &&
                   hasResearch3Placed() &&
                   (typeof LightningDamageSystem !== 'undefined') &&
                   LightningDamageSystem.hasStrikeAfterMk3(),
      hint:  'Build a Research Station MK3 · Take a lightning strike after it is up',
    },
    {
      id:    T.LIGHTNINGROD3,
      tier:  4,
      label: 'Lightning Rod MK3',
      // By $4,000/s of income there is enough on the grid that a strike on
      // the wrong plant is a costly outage, and the MK2's 13-tile reach
      // takes a forest of towers to cover it — the spire answers both at once.
      check: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 &&
                   Economy.income >= LIGHTNINGROD3_INCOME,
      hint:  `Place the MK4 Research Station · Reach $${LIGHTNINGROD3_INCOME.toLocaleString('en-US')}/s income`,
    },
    {
      id:    T.GOVERNOR,
      tier:  3,
      label: 'Throttle Governor',
      // Same shape as the Lightning Rod gates: it lands once Overdrive has
      // actually bitten — a Fuel or Coal Generator going critical — so the device
      // reads as the answer to a problem the player has already met.
      check: () => hasResearch3Placed() && _overdriveTripSeen,
      hint:  'Build a Research Station MK3 · Have a Fuel or Coal Generator go critical on Overdrive',
    },
    {
      id:    T.SCRUBBER,
      tier:  2,
      label: 'Scrubbers',
      // The first answer to the carbon tax: it lands once pollution has cost
      // the player something. Carbon Capture follows at MK3 and a bigger bill.
      check: () => hasResearch2Placed() && typeof PollutionSystem !== 'undefined' && PollutionSystem.taxPaid() >= SCRUBBER_TAX,
      hint:  'Build a Research Station MK2 · Pay $100,000 in carbon tax',
    },
    {
      id:    T.CARBONCAPTURE,
      tier:  3,
      label: 'Carbon Capture Plant',
      // Same shape as the Governor: it lands once pollution has actually
      // cost the player something — $200,000 of carbon tax paid.
      check: () => hasResearch3Placed() && carbonTaxSinceMk3() >= CARBON_CAPTURE_TAX,
      hint:  'Build a Research Station MK3 · Then pay $200,000 in carbon tax',
    },
    {
      id:    T.LIGHTNINGROD,
      tier:  2,
      label: 'Lightning Rod',
      // Same shape as the MK2 gate below: the player has to actually LOSE a
      // building to lightning while a Research Station MK2 stands. Letting
      // it bite once and then handing over the counter is what makes the rod
      // read as a response to the threat rather than a random tech drop.
      check: () => hasResearch2Placed() &&
                   (typeof LightningDamageSystem !== 'undefined') &&
                   LightningDamageSystem.hasStrikeAfterMk2(),
      hint:  'Build a Research Station MK2 · Take a lightning strike after it is up',
    },
    {
      id:    T.SOLAR2,
      tier:  2,
      label: 'Solar Panel MK2',
      check: () => Progression.isUnlocked(T.RESEARCH2) && PowerNetwork.stats.totalConsumed >= 250,
      hint:  'Research MK2 unlocked · Reach 250 kW total grid consumption',
    },
    {
      id:    T.WIND,
      tier:  1,
      label: 'Wind Turbine',
      check: () => PowerNetwork.stats.totalConsumed >= 25 && DayNight.day() >= 4,
      hint:  'Reach 25 kW consumed and survive to Day 4',
    },
    {
      id:    T.WIND2,
      tier:  2,
      label: 'Wind Turbine MK2',
      // hasResearch2Placed(), not isUnlocked(T.RESEARCH2) — the station must
      // actually be standing on the map, not merely researched. Those are
      // different states and the unlock is meant to gate on the built one.
      check: () => PowerNetwork.stats.totalConsumed >= 500 && hasResearch2Placed(),
      hint:  'Reach 500 kW total grid consumption · Build a Research Station MK2',
    },
    {
      id:    T.WIND3,
      tier:  3,
      label: 'Wind Turbine MK3',
      check: () => Progression.isUnlocked(T.RESEARCH3) && PowerNetwork.stats.totalConsumed >= 2500,
      hint:  'Research MK3 unlocked · Reach 2.5 MW total grid consumption',
    },
    {
      id:    T.SOLAR3,
      tier:  4,
      label: 'Solar Array',
      // A nuclear-era unlock that rewards the player who kept building solar
      // all game, rather than one more generation threshold. MK4, not MK5: at
      // 180 kW peak it's a real share of a 2-6 MW MK4 grid, and a rounding
      // error on a 12 MW+ fusion one.
      check: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 && solarPanelCount() >= SOLAR3_PANELS,
      hint:  `Place the MK4 Research Station · Have ${SOLAR3_PANELS} Solar Panels (MK1 or MK2) on the map`,
    },
    {
      id:    T.BATTERY,
      tier:  1,
      label: 'Battery Block',
      check: () => PowerNetwork.stats.totalGenerated >= 50 && (DayNight.day() > 3 || (DayNight.day() === 3 && DayNight.hour() >= 6)),
      hint:  'Generate 50 kW total and survive to Day 3, 6:00 AM',
    },
    {
      id:    T.RESEARCH2,
      tier:  1,
      label: 'Research Station MK2',
      // Gated on the COAL survey, not the geothermal one: the whole
      // geothermal chain (well + turbine) is tier 1 and needs no MK2, so
      // MK2 lands with coal — the first thing that actually requires it.
      check: () => CoalSystem.hasDeposits(),
      hint:  'Discover a coal deposit with the Survey Station',
    },
    {
      id:    T.GEOWELL,
      tier:  1,
      label: 'Geothermal Well',
      check: () => GeothermalSystem.hasDeposits(),
      hint:  'Discover a geothermal deposit via resource survey',
    },
    {
      id:    T.GEOTURBINE,
      tier:  1,
      label: 'Geothermal Turbine',
      check: () => EntityRegistry.getByType(T.GEOWELL).size > 0,
      hint:  'Sink a Geothermal Well on a deposit',
    },
    {
      id:    T.COALSCAN,
      tier:  1,
      label: 'Coal Scan',
      // Geothermal is the first discoverable resource now — coal only
      // becomes surveyable once the geothermal chain is running at scale,
      // not merely standing up once.
      check: () => GeothermalSystem.threeTurbinesEverRan(),
      hint:  'Have 3 Geothermal Turbines generating simultaneously',
    },
    {
      id:    T.RESEARCH3,
      tier:  2,
      label: 'Research Station MK3',
      check: () => OilSystem.getTotalFuelOil() >= 20000 && Progression.isUnlocked(T.RESEARCH2),
      hint:  'Refine 20,000 units of fuel oil (unlock via Research MK2)',
    },
    {
      id:    T.OILSCAN,
      tier:  2,
      label: 'Oil Scan',
      check: () => Progression.isUnlocked(T.RESEARCH2) && (CoalSystem.getTotalMined?.() || 0) >= OILSCAN_COAL_MINED,
      hint:  `Research MK2 unlocked · Mine ${OILSCAN_COAL_MINED.toLocaleString('en-US')}t of coal`,
    },
    {
      id:    T.URANIUMSCAN,
      tier:  3,
      label: 'Uranium Scan',
      check: () => Progression.isUnlocked(T.RESEARCH3) && (typeof ReservoirSystem !== 'undefined') && ReservoirSystem.getTotalTurbineRuntime() >= 3000,
      hint:  'Research MK3 unlocked · Run a Hydro Turbine for 60 in-game hours (2.5 days)',   // 3,000s; a day is 1,200s
    },
    {
      id:    T.SULFURSCAN,
      tier:  3,
      label: 'Sulfur Scan',
      check: () => Progression.isUnlocked(T.RESEARCH3) && (typeof ReservoirSystem !== 'undefined') && ReservoirSystem.getTotalTurbineRuntime() >= 3000,
      hint:  'Research MK3 unlocked · Run a Hydro Turbine for 60 in-game hours (2.5 days)',   // 3,000s; a day is 1,200s
    },
    {
      id:    T.URANIUMMINE,
      tier:  3,
      label: 'Uranium Mine',
      check: () => Progression.isUnlocked(T.RESEARCH3) && UraniumSystem.hasDeposits(),
      hint:  'Research MK3 unlocked · Discover a uranium deposit via uranium scan',
    },
    {
      id:    T.SULFURMINE,
      tier:  3,
      label: 'Sulfur Mine',
      check: () => Progression.isUnlocked(T.RESEARCH3) && SulfurSystem.hasDeposits(),
      hint:  'Research MK3 unlocked · Discover a sulfur deposit via sulfur scan',
    },
    {
      id:    T.CHEMICALPLANT,
      tier:  3,
      label: 'Chemical Plant',
      check: () => Progression.isUnlocked(T.RESEARCH3) && (typeof SulfurSystem !== 'undefined') && SulfurSystem.getTotalMined() >= 1000,
      hint:  'Research MK3 unlocked · Collect 1,000 sulfur units from a Sulfur Mine',
    },
    {
      id:    T.FUELPLANT,
      tier:  3,
      label: 'Fuel Processing Plant',
      requires: { label: 'Research MK3', met: () => Progression.isUnlocked(T.RESEARCH3) },
      goals: [
        { verb: 'Produce', what: 'sulfuric acid', target: 2000, get: () => (typeof ChemicalSystem !== 'undefined') ? ChemicalSystem.getTotalAcidProduced() : 0 },
        { verb: 'Mine',    what: 'uranium',       target: 2000, get: () => (typeof UraniumSystem  !== 'undefined') ? UraniumSystem.getTotalMined() : 0 },
      ],
    },
    {
      id:    T.NUCLEARREACTOR,
      tier:  3,
      label: 'Nuclear Reactor',
      check: () => Progression.isUnlocked(T.RESEARCH3) && (typeof FuelPlantSystem !== 'undefined') && FuelPlantSystem.getTotalRods() >= 800,
      hint:  'Research MK3 unlocked · Produce 800 uranium fuel rods',
    },
    {
      id:    T.COOLINGTOWER,
      tier:  3,
      label: 'Cooling Tower',
      check: () => Progression.isUnlocked(T.RESEARCH3) && EntityRegistry.getByType(T.NUCLEARREACTOR).size > 0,
      hint:  'Research MK3 unlocked · Place a Nuclear Reactor',
    },
    {
      id:    T.STEAMTURBINE,
      tier:  3,
      label: 'Steam Turbine',
      requires: { label: 'Research MK3', met: () => Progression.isUnlocked(T.RESEARCH3) },
      goals: [
        { verb: 'Power on', what: "Cooling Tower connected to a Nuclear Reactor's cooling", target: 1, get: () => hasTowerCoolingReactor() ? 1 : 0 },
      ],
    },
    {
      id:    T.MK4RESEARCH,
      tier:  3,
      label: 'MK4 Research Station',
      check: () => Progression.isUnlocked(T.RESEARCH3) && hasSixTurbinesRunning(),
      hint:  'Research MK3 unlocked · Have 6 Steam Turbines running simultaneously',
    },
    {
      id:    T.SPENTFUELPOOL,
      tier:  4,
      // The MK4's first unlock. Gated on spent fuel actually having piled up,
      // not just on reactors existing: by 250 units the player has watched
      // reactor cask stores fill toward the point where they stop generating,
      // and the pool is the answer to that. Real plants work the same way —
      // discharged fuel goes to a pool first and is only reprocessed later.
      label: 'Spent Fuel Pool',
      check: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 &&
        (typeof NuclearSystem !== 'undefined') && NuclearSystem.getTotalSpentFuel() >= 250,
      hint:  'Place the MK4 Research Station · Accumulate 250 total spent fuel',
    },
    {
      id:    T.REPROCESSOR,
      tier:  4,
      // Unlocks once a pool is 90% full. The plant's whole input is that
      // backlog, so offering it before there is one would hand the player a
      // building with nothing to eat.
      label: 'Reprocessing Plant',
      requires: { label: 'MK4 Research Station', hint: 'Place the MK4 Research Station', met: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 },
      goals: [
        { verb: 'Store', what: 'spent fuel in one Spent Fuel Pool',
          target: POOL_FILL_FOR_REPROCESSOR, get: () => fullestSpentFuelPool() },
      ],
    },
    {
      id:    T.MOXPLANT,
      tier:  4,
      // Gated on plutonium actually existing rather than on the Reprocessing
      // Plant merely being placed: the fabricator's whole reason to exist is
      // that stockpile. 50 units is about 2.8 in-game days of two
      // reprocessors at full rate (9/day each), 5.5 of one. It was 25 for a
      // while, which two plants cleared in under a day and a half.
      label: 'Advanced Fuel Processing',
      check: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 &&
        (typeof ReprocessingSystem !== 'undefined') && ReprocessingSystem.getTotalPlutonium() >= 50,
      hint:  'Place the MK4 Research Station · Separate 50 units of plutonium',
    },
    {
      id:    T.COOLINGTOWER2,
      tier:  4,
      // The cooling comes first now: it unlocks on the 100-MOX-rod gate the
      // reactor used to have, and the reactor waits for this tower to be
      // running. A MOX core takes Cryogenic Coolant and nothing else, so the
      // player builds and proves the cooling before the core it protects
      // exists, rather than placing the reactor and racing to plumb it.
      label: 'Cryogenic Cooling Tower',
      requires: { label: 'MK4 Research Station', hint: 'Place the MK4 Research Station', met: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 },
      goals: [
        { verb: 'Fabricate', what: 'MOX fuel rods', target: 100,
          get: () => (typeof MoxPlantSystem !== 'undefined') ? MoxPlantSystem.getTotalMox() : 0 },
      ],
    },
    {
      id:    T.ADVREACTOR,
      tier:  4,
      // Unlocks once a Cryogenic Cooling Tower is running: powered, pumps up,
      // and drinking its full cooled water at COOL IN. Sticky
      // (hasCryoTowerRunning), so a pump trip doesn't take it back.
      label: 'Advanced Nuclear Reactor',
      requires: { label: 'MK4 Research Station', hint: 'Place the MK4 Research Station', met: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 },
      goals: [
        { verb: 'Run', what: 'Cryogenic Cooling Tower on power and cooled water', target: 1,
          get: () => hasCryoTowerRunning() ? 1 : 0 },
      ],
    },
    {
      id:    T.DRONEPORT,
      tier:  4,
      // Gated on the job it does (hauling and service runs), not on MOX:
      // it shared the Advanced Reactor's 100-rod gate and arrived buried
      // under it. A fleet of trucks is the thing drones take over from,
      // and it lands during the long spent-fuel wait instead.
      label: 'Drone Port',
      check: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 && EntityRegistry.getByType(T.TRUCK).size >= DRONE_PORT_TRUCKS,
      hint:  `Place the MK4 Research Station · Own ${DRONE_PORT_TRUCKS} Trucks`,
    },
    {
      id:    T.DRONECHARGER,
      tier:  4,
      // The cheap way to stretch a network, so it comes once there is a
      // network worth stretching: three ports standing.
      label: 'Drone Charging Port',
      check: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 && EntityRegistry.getByType(T.DRONEPORT).size >= DRONE_CHARGER_PORTS,
      hint:  `Place the MK4 Research Station · Have ${DRONE_CHARGER_PORTS} Drone Ports`,
    },
    {
      id:    T.ENGOFFICE,
      // Tier 3, with the Nuclear Reactor it is gated on: at tier 4 it would
      // also wait on the MK4 station, which the condition says nothing about.
      tier:  3,
      label: 'Engineering Office',
      // A fission plant big enough that its pipe and fuel chains are worth an
      // audit. Sticky (hasReactorsRunning), so a reactor that drops out for a
      // tick, or has since been removed, does not take the unlock back.
      check: () => hasReactorsRunning(),
      hint:  `Have ${ENGOFFICE_REACTORS} Nuclear Reactors running at once`,
    },
    {
      id:    T.SULFURMINE2,
      tier:  4,
      label: 'Sulfur Mine MK2',
      // Offered once a deposit is half worked out: the point a player starts
      // weighing where the next one is, and the MK2's faster dig (and drain)
      // is the answer to that.
      requires: { label: 'MK4 Research Station', hint: 'Place the MK4 Research Station', met: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 },
      goals: [
        { verb: 'Mine', what: 'percent of a single sulfur deposit', target: SULFUR_DEPOSIT_PCT_FOR_MK2, get: () => mostWorkedSulfurDepositPct() },
      ],
    },
    {
      id:    T.COKEOVEN,
      tier:  4,
      // Coal's way into the late game, and the head of the graphite chain:
      // it opens once an Advanced Reactor has run (sticky, like the
      // Engineering Office), so its coke has a reactor to end up in by the
      // time it's made. Plus a long coal habit: a city still running its
      // mines is usually past it, and one that let them go has a reason to
      // dig again.
      label: 'Coke Oven Battery',
      check: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 && hasAdvReactorGenerated() &&
        (CoalSystem.getTotalMined?.() || 0) >= COKEOVEN_COAL_MINED,
      get hint() { return `Place the MK4 Research Station · Have an Advanced Nuclear Reactor running · Mine ${_fmtGoal(COKEOVEN_COAL_MINED)} total coal`; },
    },
    {
      id:    T.GRAPHITEFURNACE,
      tier:  4,
      // Once the ovens have a real coke pile. The Coke Oven's own gate already
      // waits on an Advanced Reactor having run, so there is a reactor for
      // the furnace's graphite to reflect.
      label: 'Graphitization Furnace',
      check: () => Progression.isUnlocked(T.COKEOVEN) &&
        (typeof CokeOvenSystem !== 'undefined') && CokeOvenSystem.getTotalCoke() >= GRAPHITE_COKE_MADE,
      get hint() { return `Coke Oven Battery unlocked · Make ${_fmtGoal(GRAPHITE_COKE_MADE)} coke (bank it in Storage Containers)`; },
    },
    {
      id:    T.SURVEY2,
      tier:  4,
      // The bigger rig arrives with the MK4 station, ahead of the tier-5
      // scans (lithium, helium, rare earth) that only it can run, so it is
      // always on the map before the player needs it. Gated on a working
      // survey habit as well as the station: by ten paid surveys the player
      // has felt the queue of long scans the second dish takes away. Nearly
      // every save reaching MK4 is already past it.
      label: 'Survey Station MK2',
      check: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 &&
        CoalSystem.getAllSurveyCount() >= SURVEY2_SCANS,
      hint:  `Place the MK4 Research Station · Run ${SURVEY2_SCANS} resource surveys (any kind)`,
    },
    {
      id:    T.MK5RESEARCH,
      tier:  4,
      // The gate on every fusion building below, and deliberately the LAST
      // thing on the MK4 tier: you reach fusion by running the plutonium
      // plant at full output, not by a rod count a big enough uranium build
      // would pass on its own. Mirrors the MK4's own gate (6 turbines on
      // fission) one tier up.
      // It cannot be gated on anything in the fusion chain itself — that
      // chain is tier 5, so it cannot exist before this station does.
      label: 'MK5 Research Station',
      check: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 && hasPlutoniumTurbinesRunning(),
      hint:  `Place the MK4 Research Station · Run ${PLUTONIUM_TURBINES} Steam Turbines on plutonium at once`,
    },
    {
      id:    T.ELECTROLYZER,
      tier:  5,
      label: 'Electrolyzer',
      // The first fusion unlock waits on the Fusion Research Facility, which
      // arrives with the MK5 station and researches fusion one plasma shot at a time
      // (FusionResearch). Its breakthrough scene is what hands this over.
      check: () => EntityRegistry.getByType(T.MK5RESEARCH).size > 0 &&
        typeof FusionResearch !== 'undefined' && FusionResearch.isComplete(),
      hint:  'Place the MK5 Research Station · Power the Fusion Research Facility through 45 full-power plasma shots (09:00–18:00, 1 MW each)',
    },
    {
      id:    T.LITHIUMSCAN,
      tier:  5,
      label: 'Lithium Scan',
      check: () => EntityRegistry.getByType(T.MK5RESEARCH).size > 0 &&
        (typeof ElectrolyzerSystem !== 'undefined') && ElectrolyzerSystem.getTotalHydrogenProduced() >= FUSION_GOALS.hydrogen,
      get hint() { return `Place the MK5 Research Station · Produce ${_fmtGoal(FUSION_GOALS.hydrogen)} total Hydrogen Gas (bank it in Gas Holders)`; },
    },
    {
      id:    T.LITHIUMMINE,
      tier:  5,
      label: 'Lithium Mine',
      check: () => Progression.isUnlocked(T.LITHIUMSCAN) &&
        (typeof LithiumSystem !== 'undefined') && LithiumSystem.hasDeposits(),
      hint:  'Lithium Scan unlocked · Discover a lithium deposit via lithium scan',
    },
    {
      id:    T.LITHIUMPROCESSPLANT,
      tier:  5,
      label: 'Lithium Processing Plant',
      check: () => EntityRegistry.getByType(T.MK5RESEARCH).size > 0 &&
        (typeof LithiumSystem !== 'undefined') && LithiumSystem.getTotalMined() >= FUSION_GOALS.lithium,
      get hint() { return `Place the MK5 Research Station · Mine ${_fmtGoal(FUSION_GOALS.lithium)} cumulative units of Lithium Ore (bank it in Storage Containers)`; },
    },
    {
      id:    T.ATMOSCOLLECTOR,
      tier:  5,
      label: 'Atmosphere Collector',
      // Gated on hydrogen, the Haber-Bosch's other input, and on far more of
      // it than the Lithium Scan asks — so the lithium branch is under way
      // and a banked hydrogen supply is waiting before the gas leg opens. It
      // has been 500 hydrogen (~7 seconds, gated nothing) and then 10 MW of
      // generation (a grid that reaches MK5 is already past it).
      check: () => EntityRegistry.getByType(T.MK5RESEARCH).size > 0 &&
        (typeof ElectrolyzerSystem !== 'undefined') && ElectrolyzerSystem.getTotalHydrogenProduced() >= FUSION_GOALS.hydrogenAtmos,
      get hint() { return `Place the MK5 Research Station · Produce ${_fmtGoal(FUSION_GOALS.hydrogenAtmos)} total Hydrogen Gas (bank it in Gas Holders)`; },
    },
    {
      id:    T.GASSTORAGE,
      tier:  5,
      label: 'Gas Holder',
      // Unlocks the moment it's needed: an Electrolyzer backing up with a
      // full buffer and nowhere to put the hydrogen.
      check: () => EntityRegistry.getByType(T.MK5RESEARCH).size > 0 && electrolyzerBufferFull(),
      hint:  "Place the MK5 Research Station · Fill an Electrolyzer's hydrogen buffer",
    },
    {
      id:    T.HABERBOSCH,
      tier:  5,
      label: 'Haber-Bosch Complex',
      check: () => EntityRegistry.getByType(T.MK5RESEARCH).size > 0 &&
        (typeof AtmosphereCollectorSystem !== 'undefined') && AtmosphereCollectorSystem.getTotalNitrogenProduced() >= FUSION_GOALS.nitrogen,
      get hint() { return `Place the MK5 Research Station · Extract ${_fmtGoal(FUSION_GOALS.nitrogen)} cumulative units of Nitrogen Gas (bank it in Gas Holders)`; },
    },
    {
      id:    T.WASHTOWER,
      tier:  5,
      label: 'Isotopic Wash Tower',
      check: () => EntityRegistry.getByType(T.MK5RESEARCH).size > 0 &&
        (typeof HaberBoschSystem !== 'undefined') && HaberBoschSystem.getTotalAmmoniaProduced() >= FUSION_GOALS.ammonia,
      get hint() { return `Place the MK5 Research Station · Produce ${_fmtGoal(FUSION_GOALS.ammonia)} cumulative units of Ammonia Gas (bank it in Gas Holders)`; },
    },
    {
      id:    T.TRITIUMBREEDER,
      tier:  5,
      label: 'Tritium Breeding Facility',
      // The end of the lithium branch, and the step that gives the Lithium
      // Processing Plant a job straight away instead of five unlocks later at
      // the Fusion Reactor's blanket. Comes before the Fuel Plant, so the
      // tritium supply is standing by when the first fuel is made.
      check: () => EntityRegistry.getByType(T.MK5RESEARCH).size > 0 &&
        (typeof LithiumProcessPlantSystem !== 'undefined') && LithiumProcessPlantSystem.getTotalCompoundProduced() >= FUSION_GOALS.compound,
      get hint() { return `Place the MK5 Research Station · Produce ${_fmtGoal(FUSION_GOALS.compound)} units of Lithium Compound (bank it in Storage Containers)`; },
    },
    {
      id:    T.FUSIONFUELPLANT,
      tier:  5,
      label: 'Fusion Fuel Plant',
      // Where the two tier-5 branches meet: deuterium from the gas chain,
      // tritium from the lithium chain's breeder. Gated on both — deuterium
      // used to be enough, and it used to share the Atmosphere Collector's
      // Lithium Compound gate before that, so it unlocked three buildings
      // before anything could feed its DEUTERIUM IN.
      check: () => Progression.isUnlocked(T.TRITIUMBREEDER) &&
        (typeof IsotopicWashTowerSystem !== 'undefined') && IsotopicWashTowerSystem.getTotalDeuteriumProduced() >= FUSION_GOALS.deuterium,
      get hint() { return `Tritium Breeding Facility unlocked · Produce ${_fmtGoal(FUSION_GOALS.deuterium)} cumulative units of Deuterium Gas (bank it in Gas Holders)`; },
    },
    {
      id:    T.HELIUMSCAN,
      tier:  5,
      label: 'Helium Scan',
      // First step of the cooling chain, which comes before the reactor: it
      // leads to the Helium Well and the Cryo Plant, and the reactor unlocks
      // once the plant is producing, so nobody pays for a reactor that can't
      // run yet.
      check: () => EntityRegistry.getByType(T.MK5RESEARCH).size > 0 &&
        (fusionReactorPowered() || ((typeof FusionFuelPlantSystem !== 'undefined') && FusionFuelPlantSystem.getTotalPlasmaProduced() >= FUSION_GOALS.pellets1)),
      get hint() { return `Place the MK5 Research Station · Make ${_fmtGoal(FUSION_GOALS.pellets1)} D-T fuel pellets in a Fusion Fuel Plant (bank them in Storage Containers)`; },
    },
    {
      id:    T.HELIUMWELL,
      tier:  5,
      label: 'Helium Well',
      check: () => Progression.isUnlocked(T.HELIUMSCAN) &&
        (typeof HeliumSystem !== 'undefined') && HeliumSystem.hasDeposits(),
      hint:  'Helium Scan unlocked · Discover a helium gas field via helium scan',
    },
    {
      id:    T.CRYOPLANT,
      tier:  5,
      label: 'Cryo Plant',
      check: () => (typeof HeliumSystem !== 'undefined') && HeliumSystem.getTotalExtracted() >= FUSION_GOALS.helium,
      get hint() { return `Extract ${_fmtGoal(FUSION_GOALS.helium)} cumulative units of Helium Gas (bank it in Gas Holders)`; },
    },
    {
      id:    T.HULKINGFUSIONREACTOR,
      tier:  5,
      label: 'Fusion Reactor',
      // Once a Cryo Plant is making the liquid helium its magnets need, so the
      // coolant is there before the reactor is. The pellets gated the Helium
      // Scan on the way here.
      check: () => fusionCoolantMade(),
      hint:  'Produce liquid helium in a Cryo Plant',
    },
    {
      id:    T.STEAMTURBINE2,
      tier:  5,
      label: 'Steam Turbine MK2',
      // Once a Fusion Reactor is actually raising steam for a turbine hall:
      // its 2000 steam would otherwise mean twenty MK1s. After the MK5 gate
      // (twelve MK1s on plutonium steam), so that goal is untouched;
      // plutonium plants can switch over from here too.
      check: () => fusionTurbinesRunning() >= FUSION_TURBINES_FOR_MK2,
      hint:  `Run ${FUSION_TURBINES_FOR_MK2} Steam Turbines at once on Fusion Reactor steam`,
    },
    {
      id:    T.MHDRING,
      tier:  5,
      label: 'MHD Decelerator Ring',
      // Unlocks together with the Advanced Fusion Reactor, the machine whose
      // ion stream it converts, so the first D-He3 burn has rings to feed.
      // The D-He3 pellets banked to get here are that burn's opening stock,
      // and the split keeps the D-T reactors running meanwhile.
      check: () => he3PelletsMade() >= FUSION_GOALS.he3pellets,
      get hint() { return `Make ${_fmtGoal(FUSION_GOALS.he3pellets)} D-He3 fuel pellets in a Fusion Fuel Plant (bank them in Storage Containers; unlocks with the Advanced Fusion Reactor)`; },
    },
    {
      id:    T.HE3SEPARATOR,
      tier:  5,
      label: 'Helium-3 Separator',
      // A save that already runs an MHD Ring (from before D-He3 needed
      // helium-3) gets it straight away — it's that ring's fuel supply now.
      check: () => ((typeof HulkingFusionReactorSystem !== 'undefined') && HulkingFusionReactorSystem.getTotalPelletsBurned() >= FUSION_GOALS.burned)
                   || EntityRegistry.getByType(T.MHDRING).size > 0,
      get hint() { return `Burn ${_fmtGoal(FUSION_GOALS.burned)} fuel pellets in a Fusion Reactor`; },
    },
    {
      id:    T.ADVFUSIONREACTOR,
      tier:  5,
      label: 'Advanced Fusion Reactor',
      // Once the split has banked a stock of D-He3 pellets: the Fuel Plant's
      // D-He3 line opens with the Helium-3 Separator, and its first pellets
      // are this reactor's opening fuel. Unlocks with the MHD Ring.
      check: () => he3PelletsMade() >= FUSION_GOALS.he3pellets,
      get hint() { return `Make ${_fmtGoal(FUSION_GOALS.he3pellets)} D-He3 fuel pellets in a Fusion Fuel Plant (bank them in Storage Containers)`; },
    },
    {
      id:    T.HELIUMWELL2,
      tier:  5,
      label: 'Helium Well MK2',
      // The stellarator's magnets boil off 6 helium a second, three MK1 wells'
      // worth, and helium fields are rare: the MK2 gets three times as much
      // out of a field the player already holds. Opens the moment the first
      // one lights, which is when that boil-off starts.
      check: () => advFusionHasRun(),
      hint:  'Start an Advanced Fusion Reactor',
    },
    // ── Field Core chain (docs/FIELD_CORE_SPEC.md) ──
    // The scan opens once the Advanced Fusion Reactor is burning D-He3. The
    // rest opens a step at a time as Operation Hyperion advances: the Leach
    // Plant at Stage II (Foundations), the Superconductor Mill at Stage III,
    // and the Core Works at Stage IV, where the chain is complete. Each step also has its own
    // production goal, like every other chain.
    {
      id:    T.RAREEARTHSCAN,
      tier:  5,
      label: 'Rare Earth Scan',
      check: () => typeof AdvancedFusionReactorSystem !== 'undefined' && AdvancedFusionReactorSystem.getTotalPelletsBurned() >= FUSION_GOALS.dhe3burned,
      get hint() { return `Burn ${_fmtGoal(FUSION_GOALS.dhe3burned)} D-He3 pellets in an Advanced Fusion Reactor`; },
    },
    {
      id:    T.RAREEARTHMINE,
      tier:  5,
      label: 'Rare Earth Mine',
      check: () => Progression.isUnlocked(T.RAREEARTHSCAN) &&
        (typeof RareEarthSystem !== 'undefined') && RareEarthSystem.hasDeposits(),
      hint:  'Rare Earth Scan unlocked · Discover a rare earth deposit via rare earth scan',
    },
    {
      id:    T.LEACHPLANT,
      tier:  5,
      label: 'Leach Plant',
      check: () => typeof NationalProject !== 'undefined' && NationalProject.reached('stage1') &&
        (typeof RareEarthSystem !== 'undefined') && RareEarthSystem.getTotalMined() >= FUSION_GOALS.rareearth,
      get hint() { return `Operation Hyperion at Stage II · Mine ${_fmtGoal(FUSION_GOALS.rareearth)} cumulative units of Rare Earth Ore (bank it in Storage Containers)`; },
    },
    {
      id:    T.SCMILL,
      tier:  5,
      label: 'Superconductor Mill',
      check: () => typeof NationalProject !== 'undefined' && NationalProject.reached('stage2') &&
        (typeof LeachPlantSystem !== 'undefined') && LeachPlantSystem.getTotalOxide() >= FUSION_GOALS.oxide,
      get hint() { return `Operation Hyperion at Stage III · Produce ${_fmtGoal(FUSION_GOALS.oxide)} cumulative units of Rare Earth Oxide (bank it in Storage Containers)`; },
    },
    {
      id:    T.COREWORKS,
      tier:  5,
      label: 'Core Works',
      check: () => typeof NationalProject !== 'undefined' && NationalProject.reached('stage3') &&
        (typeof SuperconductorMillSystem !== 'undefined') && SuperconductorMillSystem.getTotalTape() >= FUSION_GOALS.tape,
      get hint() { return `Operation Hyperion at Stage IV · Produce ${_fmtGoal(FUSION_GOALS.tape)} cumulative units of HTS Tape (bank it in Storage Containers)`; },
    },
    {
      id:    T.SURVEY,
      tier:  1,
      label: 'Resource Survey Station',
      check: () => PowerNetwork.stats.totalConsumed >= 200,
      hint:  'Reach 200 kW total grid consumption',
    },
    {
      id:    T.COALMINE,
      tier:  2,
      label: 'Coal Mine',
      check: () => Progression.isUnlocked(T.COALSCAN) && CoalSystem.hasDeposits(),
      hint:  'Coal Scan unlocked · Discover a coal deposit via resource survey',
    },
    {
      id:    T.COALMINE2,
      tier:  3,
      label: 'Coal Mine MK2',
      check: () => Progression.isUnlocked(T.RESEARCH3) && (CoalSystem.getTotalMined?.() || 0) >= COALMINE2_COAL_MINED,
      hint:  `Research MK3 unlocked · Mine ${COALMINE2_COAL_MINED.toLocaleString('en-US')}t of coal in total`,
    },
    {
      id:    T.MONITOR2,
      tier:  3,
      label: 'Monitoring Station MK2',
      check: () => EntityRegistry.getByType(T.RESEARCH3).size > 0 && EntityRegistry.getByType(T.MONITOR).size > 0
                && PowerNetwork.stats.totalConsumed >= 2000,
      hint:  'Place a Research Station MK3 · Have a Monitoring Station on the grid · Reach 2 MW total grid consumption',
    },
    {
      id:    T.BLUEPRINT,
      tier:  3,
      label: 'Blueprints',
      check: () => EntityRegistry.getByType(T.RESEARCH3).size > 0,
      hint:  'Place a Research Station MK3',
    },
    {
      id:    T.AUTODISPATCH,
      tier:  3,
      label: 'Auto-Dispatch',
      // Gated on the scale of the problem it solves, not just on tech: hand
      // -dispatching trucks is fine for a handful of buildings and becomes
      // unmanageable at twenty, which is the point of automating it.
      check: () => Progression.isUnlocked(T.RESEARCH3) && AutoHaulSystem.wasteBuildingCount() >= 15,
      hint:  'Research MK3 unlocked · Have 15 waste-producing buildings standing',
    },
    {
      // Unlocks with the Storage Container (500t mined): the same gate, so
      // belts arrive just as there's somewhere to run them to.
      id:    T.CONVEYOR,
      tier:  2,
      label: 'Conveyor Belt',
      check: () => CoalSystem.getTotalMined() >= 500,
      hint:  'Mine 500t of coal first',
    },
    {
      // Unlocks with the Conveyor Belt itself (and so the Storage
      // Container): the same gate, so they all land on the same tick.
      id:    T.UNDERGNDCONVEYOR,
      tier:  2,
      label: 'Underground Belt',
      check: () => CoalSystem.getTotalMined() >= 500,
      hint:  'Mine 500t of coal first',
    },
    // MK2 research, once there are enough belts about for one line to have to
    // feed several machines. (Archived for now: CONVEYOR_SPLITTER_ARCHIVED.)
    ...(CONVEYOR_SPLITTER_ARCHIVED ? [] : [{
      id:    T.CONVEYORSPLITTER,
      tier:  2,
      label: 'Conveyor Splitter',
      check: () => beltTileCount() >= SPLITTER_BELT_TILES,
      hint:  `Research MK2 unlocked · Have ${SPLITTER_BELT_TILES} conveyor belt tiles on the map`,
    }]),
    {
      id:    T.COALGENERATOR,
      tier:  2,
      label: 'Coal Power Generator',
      // Water first: the generator unlocks (with Pipes) once a Water
      // Extractor is placed and pumping, so its water is ready to pipe in.
      goals: [
        { verb: 'Run', what: 'Water Extractor pumping water', target: 1, get: waterExtractorsPumping },
      ],
    },
    {
      id:    T.SOLIDSTORAGE,
      // MK2 research, gated on coal actually coming out of the ground: it
      // lands well ahead of the Coal Power Generator (2,000t) so the mine has
      // somewhere to bank its output in the meantime.
      tier:  2,
      label: 'Storage Container',
      check: () => CoalSystem.getTotalMined() >= 500,
      hint:  'Mine 500t of coal first',
    },
    {
      id:    T.FASTTRAVEL,
      tier:  2,
      label: 'Fast Travel',
      check: () => {
        for (const e of EntityRegistry.getByType(T.COALGENERATOR)) {
          if (e.powered && e._fuelled) return true;
        }
        return false;
      },
      hint:  'Get a Coal Power Generator up and running',
    },
    {
      id:    T.WATEREXTRACTOR,
      tier:  2,
      label: 'Water Extractor',
      // The first step of the coal chain: it takes the 2,000t gate the Coal
      // Power Generator used to have, and running one unlocks the generator.
      goals: [
        { verb: 'Mine', what: 't of coal', target: 2000, get: () => CoalSystem.getTotalMined() },
      ],
    },
    {
      id:    T.PROTECTOR,
      tier:  1,
      label: 'Surge Protector',
      // Earned by the problem it solves: the first time a wire is actually
      // pushed to the edge of its 85 kW cap (the point it renders red), not at
      // an arbitrary grid-wide consumption figure that can be met by a wide,
      // lightly loaded grid that never strains a single line.
      check: () => typeof PowerNetwork !== 'undefined' && PowerNetwork.everRedlined(),
      hint:  'Push a wire to 90% of its 85 kW capacity; watch for the line turning red',
    },
    {
      id:    T.PROTECTOR2,
      tier:  2,
      label: 'Surge Protector MK2',
      check: () => PowerNetwork.stats.totalConsumed >= 800 && Progression.isUnlocked(T.RESEARCH2),
      hint:  'Reach 800 kW consumption and unlock Research MK2',
    },
    {
      id:    T.PROTECTOR3,
      tier:  4,
      label: 'Surge Protector MK3',
      // Gated on load served: by 5 MW consumed the city's lines carry more
      // than an MK2 bank's networks comfortably can.
      check: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 &&
        PowerNetwork.stats.totalConsumed >= 5000,
      hint:  'Place the MK4 Research Station · Reach 5 MW consumed',
    },
    {
      id:    T.CIRCUITSWITCH2,
      tier:  4,
      label: 'Circuit Switch MK2',
      // A city only outgrows the MK1's 500 kW roster once it's generating
      // enough that a single neighbourhood breaker is a real bottleneck to shed.
      check: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 &&
        PowerNetwork.stats.totalGenerated >= 7500,
      hint:  'Place the MK4 Research Station · Reach 7.5 MW generation',
    },
    {
      id:    T.PIPE,
      tier:  2,
      label: 'Pipe',
      // Unlocks with the Coal Power Generator: the same gate, same tick.
      goals: [
        { verb: 'Run', what: 'Water Extractor pumping water', target: 1, get: waterExtractorsPumping },
      ],
    },
    {
      id:    T.UNDERGNDPIPE,
      tier:  2,
      label: 'Underground Pipe',
      check: () => Progression.isReady(T.OILSTORAGE) || Progression.isUnlocked(T.OILSTORAGE),
      hint:  'Unlock the Liquid Storage Tank first',
    },
    {
      id:    T.DAM,
      tier:  3,
      label: 'Dam',
      check: () => EntityRegistry.getByType(T.RESEARCH3).size > 0,
      hint:  'Place a Research Station MK3',
    },
    {
      id:    T.HYDROTURBINE,
      tier:  3,
      label: 'Hydro Turbine',
      check: () => (typeof ReservoirSystem !== 'undefined') && ReservoirSystem.hasDams(),
      hint:  'Place a dam to form a reservoir',
    },
    {
      id:    T.SHAFT,
      tier:  3,
      label: 'Drive Shaft',
      check: () => (typeof ReservoirSystem !== 'undefined') && ReservoirSystem.getTotalTurbineRuntime() >= (3 * 300) && Progression.isUnlocked(T.RESEARCH3),
      hint:  'Research MK3 unlocked · Run a Hydro Turbine for 18 in-game hours',   // 900s
    },
    {
      id:    T.HYDROGENERATOR,
      tier:  3,
      label: 'Hydroelectric Generator',
      check: () => (typeof ReservoirSystem !== 'undefined') && ReservoirSystem.getTotalTurbineRuntime() >= (3 * 300) && Progression.isUnlocked(T.RESEARCH3),
      hint:  'Research MK3 unlocked · Run a Hydro Turbine for 18 in-game hours',   // 900s
    },
    {
      id:    T.POWERTOWER,
      tier:  2,
      label: 'Power Tower',
      check: () => EntityRegistry.getByType(T.COALMINE).size > 0,
      hint:  'Place a Coal Mine first',
    },
    {
      id:    T.SUBSTATION2,
      tier:  2,
      label: 'Substation MK2',
      check: () => PowerNetwork.stats.totalConsumed >= 600 && Progression.isUnlocked(T.RESEARCH2),
      hint:  'Reach 600 kW consumption and unlock Research MK2',
    },
    {
      id:    T.SUBSTATION3,
      tier:  3,
      label: 'Substation MK3',
      check: () => PowerNetwork.stats.totalGenerated >= 3500 && Progression.isUnlocked(T.RESEARCH3),
      hint:  'Generate 3.5 MW and unlock Research MK3',
    },
    {
      id:    T.SUBSTATION4,
      tier:  4,
      label: 'Substation MK4',
      check: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0 && PowerNetwork.stats.totalGenerated >= 10000,
      hint:  'Place the MK4 Research Station · Generate 10 MW',
    },
    {
      id:    T.SUBSTATION5,
      tier:  5,
      label: 'Substation MK5',
      // Sticky (hasFusionGenerated), like the Advanced Reactor gate: a
      // reactor tripping for a refuel doesn't take the unlock back.
      check: () => EntityRegistry.getByType(T.MK5RESEARCH).size > 0 && hasFusionGenerated(),
      hint:  'Place the MK5 Research Station · Get a Fusion Reactor generating power',
    },
    {
      id:    T.TRUCK,
      tier:  2,
      label: 'Waste Truck',
      check: () => hasAshWaste60(),
      hint:  'Reach 60% ash waste in a Coal Power Generator',
    },
    {
      id:    T.HAULER,
      tier:  2,
      // Gated on a belt network big enough that hauling by road starts to
      // pay off over laying yet more conveyor.
      label: 'Hauler',
      check: () => beltTileCount() >= HAULER_BELT_TILES,
      hint:  `Have ${HAULER_BELT_TILES} conveyor belt tiles on the map`,
    },
    {
      id:    T.ROAD,
      tier:  2,
      label: 'Road',
      check: () => Progression.isUnlocked(T.TRUCK),
      hint:  'Unlock the Waste Truck first',
    },
    {
      // Bridges come with the trucks that drive over them. The same unlock
      // lets any building be set down over water for a fill charge
      // (water_build.js).
      id:    T.BRIDGE,
      tier:  2,
      label: 'Bridge',
      check: () => Progression.isUnlocked(T.TRUCK),
      hint:  'Unlock the Waste Truck first',
    },
    {
      id:    T.PATHTOOL,
      tier:  2,
      label: 'Path Tool',
      check: () => Progression.isUnlocked(T.TRUCK),
      hint:  'Unlock the Waste Truck first',
    },
    {
      id:    T.GASSTATION,
      tier:  2,
      label: 'Gas Station',
      // Gated on the supply, not the demand: a station is a tap on a
      // refinery's fuel-oil pipe network and has nothing to dispense until
      // that network is producing. The counter is cumulative and saved, so
      // the unlock stays earned even if every drop is later burned off.
      check: () => typeof OilSystem !== 'undefined' && OilSystem.getTotalFuelOil() >= GASSTATION_FUELOIL,
      hint:  `Refine ${_fmtGoal(GASSTATION_FUELOIL)} units of fuel oil at an Oil Refinery`,
    },
    // The three waste facilities unlock off the same thing that used to make
    // one appear on the map by itself: the matching waste stream backing up
    // past WasteSystem's threshold. The player builds it themselves now, so
    // this hands over the build tool instead of the finished building.
    {
      id:    T.COALWASTE,
      tier:  2,
      label: 'Coal Waste Processing Facility',
      check: () => typeof WasteSystem !== 'undefined' && WasteSystem.isTriggered(T.COALGENERATOR),
      hint:  'Reach 60% ash waste in a Coal Power Generator',
    },
    {
      id:    T.OILWASTE,
      tier:  2,
      label: 'Oil Waste Processing Facility',
      check: () => typeof WasteSystem !== 'undefined' && WasteSystem.isTriggered(T.REFINERY),
      hint:  'Reach 60% sludge waste in an Oil Refinery',
    },
    {
      id:    T.NUCLEARWASTE,
      // MK3, not MK2 with the other two: the reactor that produces this waste
      // is itself MK3 tech, so the facility is confirmed at the same station.
      tier:  3,
      label: 'Nuclear Waste Processing Facility',
      check: () => typeof WasteSystem !== 'undefined' && WasteSystem.isTriggered(T.NUCLEARREACTOR),
      hint:  'Reach 60% waste storage in a Nuclear Reactor',
    },
    {
      id:    T.PUMPJACK,
      tier:  2,
      label: 'Pump Jack',
      check: () => Progression.isUnlocked(T.OILSCAN) && OilSystem.hasDeposits(),
      hint:  'Unlock Oil Scan, then complete an oil scan',
    },
    {
      id:    T.PUMPJACK2,
      tier:  3,
      label: 'Pump Jack MK2',
      // Earned by living through the problem it solves: the first well
      // running dry is when a faster pump starts to matter.
      check: () => Progression.isUnlocked(T.RESEARCH3) && OilSystem.hasExhaustedDeposit(),
      hint:  'Research MK3 unlocked · Pump an oil deposit dry',
    },
    {
      id:    T.OILSTORAGE,
      tier:  2,
      label: 'Liquid Storage Tank',
      check: () => OilSystem.getTotalCrude() >= OILSTORAGE_CRUDE,
      hint:  `Produce ${_fmtGoal(OILSTORAGE_CRUDE)} crude units from pump jacks`,
    },
    {
      id:    T.REFINERY,
      tier:  2,
      label: 'Oil Refinery',
      check: () => OilSystem.getTotalCrude() >= REFINERY_CRUDE,
      hint:  `Produce ${_fmtGoal(REFINERY_CRUDE)} crude units from pump jacks`,
    },
    {
      id:    T.FUELGEN,
      tier:  2,
      label: 'Fuel Power Generator',
      check: () => OilSystem.getTotalFuelOil() >= 2000 && Progression.isUnlocked(T.RESEARCH2),
      hint:  'Refine 2,000 fuel oil units and build a Research Station MK2',
    },
  ];
  UNLOCK_DEFS.forEach(d => { if (d.goals) _deriveFromGoals(d); });

  let snapshot = null;

  // ── Research station power gate ──────────────────────────────────
  // An unlock only advances toward "ready" while a Research Station of its
  // own tier is standing AND powered. A station with no juice isn't doing
  // research, so the tier it governs stalls until the wire is back.
  //
  // Strictly respective: a powered MK4 does NOT keep tier 2 moving. Each
  // tier answers to its own station, so a dark MK2 stalls MK2 unlocks even
  // in a city running three higher stations. (If you'd rather a higher tier
  // cover the ones below it, this is the single function to change.)
  // Tier 1 only needs its station standing, not powered (see tierPowered).
  // Tier -> the Research Station that owns that tier. Two jobs: it's the
  // station whose panel lists the tier's unlocks (openStationForTier below —
  // the panel filters by tierOf(), so opening the wrong one would show a
  // station that doesn't offer the item), and it's the station whose power
  // state gates the tier.
  const TIER_STATION = {
    1: T.RESEARCH,
    2: T.RESEARCH2,
    3: T.RESEARCH3,
    4: T.MK4RESEARCH,
    5: T.MK5RESEARCH,
  };

  // The two unlocks that bootstrap the whole chain and therefore cannot be
  // gated on it: WIRE is how power reaches anything at all, and RESEARCH is
  // the MK1 station itself — gating it on a powered MK1 is a hard deadlock.
  // Both already bypass the manual-unlock flow (see checkUnlocks).
  const POWER_GATE_EXEMPT = new Set([T.WIRE, T.RESEARCH]);
  // Ready items whose goal checkUnlocks() re-checks (see there). Advanced Fuel
  // Processing went 50 → 25 → 50 plutonium; saves made at 25 held it ready.
  // The Rare Earth Scan moved from the Hyperion briefing to D-He3 burned;
  // saves made in between hold it ready with nothing burned.
  const RECHECK_READY = new Set([T.MOXPLANT, T.RAREEARTHSCAN]);

  function stationTypeForTier(tier) { return TIER_STATION[tier] || T.RESEARCH; }

  // Is this tier's research station built and powered?
  function tierPowered(tier) {
    // MK1 is the exception: at the start of the game the player is still
    // learning to wire things up, and a dark station that silently withheld
    // UNLOCK read as a bug. A standing MK1 does its research powered or not.
    if ((tier || 1) === 1) return EntityRegistry.getByType(T.RESEARCH).size > 0;
    for (const e of EntityRegistry.getByType(stationTypeForTier(tier))) {
      if (e.powered) return true;
    }
    return false;
  }

  // Why a tier isn't advancing, or null when it is: 'missing' (no station of
  // that tier on the map) or 'unpowered' (one exists but it's dark).
  function tierStallReason(tier) {
    const type = stationTypeForTier(tier);
    const set = EntityRegistry.getByType(type);
    if (!set.size) return 'missing';
    if ((tier || 1) === 1) return null;
    for (const e of set) if (e.powered) return null;
    return 'unpowered';
  }

  function hasResearch3Placed() {
    return EntityRegistry.getByType(T.RESEARCH3).size > 0;
  }

  // Carbon tax paid since the first Research Station MK3 went down — gates the
  // Carbon Capture Plant. Counting the whole game's tax let it land the moment
  // the MK3 did, since a coal city has paid far more than the bar by then.
  // The total at that moment is kept (and saved); a save from before this
  // starts counting from when it is first seen with an MK3 standing.
  let _ccTaxBase = null;
  function carbonTaxSinceMk3() {
    if (typeof PollutionSystem === 'undefined') return 0;
    if (_ccTaxBase === null) {
      if (!hasResearch3Placed()) return 0;
      _ccTaxBase = PollutionSystem.taxPaid();
    }
    return Math.max(0, PollutionSystem.taxPaid() - _ccTaxBase);
  }

  // Fullest Electrolyzer's hydrogen buffer, 0..1 — gates the Gas Holder.
  function electrolyzerFillFrac() {
    const cap = EntityDefs[T.ELECTROLYZER].hydrogenCapacity || 3000;
    let best = 0;
    for (const e of EntityRegistry.getByType(T.ELECTROLYZER)) best = Math.max(best, (e._hydrogen || 0) / cap);
    return Math.min(1, best);
  }
  function electrolyzerBufferFull() { return electrolyzerFillFrac() >= 0.999; }
  function hasResearch2Placed() {
    // A higher-tier station counts too — a player who tore down their MK2
    // after building an MK3 shouldn't lose access to MK2-gated unlocks.
    return EntityRegistry.getByType(T.RESEARCH2).size > 0
        || EntityRegistry.getByType(T.RESEARCH3).size > 0
        || EntityRegistry.getByType(T.MK4RESEARCH).size > 0
        || EntityRegistry.getByType(T.MK5RESEARCH).size > 0;
  }

  function hasAshWaste60() {
    for (const e of EntityRegistry.getByType(T.COALGENERATOR)) {
      if ((e._ashWaste || 0) >= 60) return true;
    }
    return false;
  }

  // Sticky flag — once a Cooling Tower has been seen powered on (pumps
  // running) with a Nuclear Reactor's COOL IN run reaching it, stays true
  // even if it later loses power or the pipe is cut, so the Steam Turbine
  // unlock doesn't flicker. Variable name kept for the save key.
  let _reactorEverRan = false;
  function hasTowerCoolingReactor() {
    if (_reactorEverRan) return true;
    // _coolTower: the tower NuclearSystem.resolveCooling fed this reactor
    // from this tick; _coolConnected: that tower is powered, pumps running.
    for (const r of EntityRegistry.getByType(T.NUCLEARREACTOR)) {
      const tw = r._coolTower;
      if (tw && tw._coolConnected) { _reactorEverRan = true; return true; }
    }
    return false;
  }

  // Fullest pool, counting fuel still cooling as well as fuel that is
  // ready. Read from one pool rather than summed, so the Reprocessing Plant
  // gate (POOL_FILL_FOR_REPROCESSOR) means one pool genuinely backed up.
  // Rounded to the nearest 0.001: a pool topping itself up to capacity can
  // land a hair under 400 in floating point and would never quite unlock.
  // How far the most-worked sulfur deposit has been dug, in percent of its
  // reserve. A deposit under a mine is held on the mine (_linkedDeposit)
  // rather than standing in the registry, so both are looked at. Rounded to
  // a hundredth so a deposit at 49.9999% in floating point still counts.
  function mostWorkedSulfurDepositPct() {
    const deps = new Set(EntityRegistry.getByType(T.SULFURDEPOSIT));
    for (const t of [T.SULFURMINE, T.SULFURMINE2])
      for (const m of EntityRegistry.getByType(t)) if (m._linkedDeposit) deps.add(m._linkedDeposit);
    let best = 0;
    for (const d of deps) if (d._oreMax > 0) best = Math.max(best, (1 - (d._oreAmount || 0) / d._oreMax) * 100);
    return Math.round(best * 100) / 100;
  }
  function fullestSpentFuelPool() {
    let best = 0;
    for (const e of EntityRegistry.getByType(T.SPENTFUELPOOL))
      best = Math.max(best, (e._cooling || 0) + (e._ready || 0));
    return Math.round(best * 1000) / 1000;
  }

  // Sticky once reached, like hasSixTurbinesRunning: a turbine on a shared
  // pipe network can resolve to a uranium reactor on the next tick, so an
  // unlock that had to hold the count continuously would flicker for
  // reasons the player cannot see.
  // Sticky flag — once a Cryogenic Cooling Tower has been seen powered, pumps
  // running, with its full cooled water reaching COOL IN (_hasCoolWater, set
  // by NuclearSystem.resolveCooling), stays true. Gates the Advanced Reactor;
  // a CRYO OUT pipe isn't required, since there is no reactor to run it to yet.
  let _cryoTowerEverRan = false;
  function hasCryoTowerRunning() {
    if (_cryoTowerEverRan) return true;
    for (const tw of EntityRegistry.getByType(T.COOLINGTOWER2))
      if (tw.powered && !tw._pumpTripped && tw._hasCoolWater) { _cryoTowerEverRan = true; return true; }
    return false;
  }

  // Sticky, same reasoning as hasTowerCoolingReactor: an Advanced Reactor drops
  // out of _generating for a tick whenever its rod buffer runs dry or a pump
  // trips, and an unlock that flickered with it would be unreadable.
  let _advReactorGenerated = false;
  function hasAdvReactorGenerated() {
    if (_advReactorGenerated) return true;
    for (const e of EntityRegistry.getByType(T.ADVREACTOR))
      if (e._generating) { _advReactorGenerated = true; return true; }
    return false;
  }

  // Nuclear Reactors (fission) generating right now, and whether
  // ENGOFFICE_REACTORS of them have ever been at once. Sticky, for the
  // Engineering Office.
  let _reactorsRanAtOnce = false;
  function nuclearReactorsRunning() {
    let n = 0;
    for (const e of EntityRegistry.getByType(T.NUCLEARREACTOR)) if (e._generating) n++;
    return n;
  }
  function hasReactorsRunning() {
    if (_reactorsRanAtOnce) return true;
    if (nuclearReactorsRunning() >= ENGOFFICE_REACTORS) _reactorsRanAtOnce = true;
    return _reactorsRanAtOnce;
  }

  // Has any Fusion Reactor (Hulking or Advanced) ever put power out? Sticky.
  let _fusionGenerated = false;
  function hasFusionGenerated() {
    if (_fusionGenerated) return true;
    for (const t of [T.HULKINGFUSIONREACTOR, T.ADVFUSIONREACTOR])
      for (const e of EntityRegistry.getByType(t))
        if (e._generating) { _fusionGenerated = true; return true; }
    return false;
  }

  let _advReactorEverRan = false;   // save key kept for compatibility
  function plutoniumTurbineCount() {
    let n = 0;
    for (const e of EntityRegistry.getByType(T.STEAMTURBINE))
      if (e._generating && e._steamSourceType === T.ADVREACTOR) n++;
    return n;
  }
  function hasPlutoniumTurbinesRunning() {
    if (_advReactorEverRan) return true;
    if (plutoniumTurbineCount() >= PLUTONIUM_TURBINES) { _advReactorEverRan = true; return true; }
    return false;
  }

  // Sticky flag — set the first time any Fuel or Coal Generator goes critical
  // (100% heat/pressure) on Overdrive — see MeltdownSystem. Gates the Throttle Governor.
  let _overdriveTripSeen = false;

  // Sticky flag — once 6 Steam Turbines have been seen actively generating
  // power at the same time, stays true even if some later stall out (out of
  // steam, unpowered, etc.), same rationale as hasTowerCoolingReactor above.
  let _sixTurbinesEverRan = false;
  function hasSixTurbinesRunning() {
    if (_sixTurbinesEverRan) return true;
    let n = 0;
    for (const e of EntityRegistry.getByType(T.STEAMTURBINE)) if (e._generating) n++;
    if (n >= 6) { _sixTurbinesEverRan = true; return true; }
    return false;
  }

  function applyState(set, ws, rp) {
    unlocked.clear();
    ready.clear();
    set.forEach(v => unlocked.add(v));
    totalWs       = ws;
    totalResearch = rp;
    refreshHotbar();
  }

  // Opens the station's panel WITHOUT moving the camera. Confirming an unlock
  // is a menu action, not a trip: this used to recentre on the station, which
  // yanked the player away from whatever they were building, and left them to
  // find their way back afterwards. The panel clamps itself into view when its
  // station is off-screen (see InspectionPanel.reposition), so the view stays
  // exactly where the player left it.
  function openStationForTier(tier) {
    if (typeof InspectionPanel === 'undefined') return false;
    const type = TIER_STATION[tier || 1];   // tierOf() defaults to 1; match it
    if (!type) return false;
    const set = EntityRegistry.getByType(type);
    if (!set.size) return false;
    InspectionPanel.open([...set][0]);
    return true;
  }

  return {
    get unlocked()       { return unlocked; },
    get totalWs()        { return totalWs; },
    get totalResearch()         { return totalResearch; },
    get maxSubstationCharge()  { return maxSubstationCharge; },
    checkPowerTowerReady() { return EntityRegistry.getByType(T.COALMINE).size > 0; },

    checkUnlocks() {
      const MANUAL = new Set([
        T.SOLAR, T.SOLAR2, T.SOLAR3, T.WIND, T.WIND2, T.WIND3, T.BATTERY, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5, T.PROTECTOR, T.PROTECTOR2, T.PROTECTOR3,
        T.MONITOR, T.MONITOR2, T.ENGOFFICE, T.POLE, T.BEACON,
        T.SURVEY, T.SURVEY2, T.GEOWELL, T.GEOTURBINE, T.COALSCAN, T.COALMINE, T.COALMINE2, T.POWERTOWER,
        T.COALGENERATOR, T.HYDROGENERATOR, T.DAM, T.HYDROTURBINE, T.SHAFT, T.OILSCAN, T.URANIUMSCAN, T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2, T.CHEMICALPLANT, T.FUELPLANT, T.NUCLEARREACTOR, T.COOLINGTOWER, T.PUMPJACK, T.PUMPJACK2, T.OILSTORAGE, T.SOLIDSTORAGE, T.REFINERY, T.FUELGEN, T.WATEREXTRACTOR, T.MK4RESEARCH, T.REPROCESSOR, T.SPENTFUELPOOL, T.MOXPLANT, T.ADVREACTOR, T.COOLINGTOWER2, T.DRONEPORT, T.DRONECHARGER, T.MK5RESEARCH, T.ELECTROLYZER, T.LITHIUMSCAN, T.LITHIUMMINE, T.LITHIUMPROCESSPLANT, T.ATMOSCOLLECTOR, T.HABERBOSCH, T.WASHTOWER, T.FUSIONFUELPLANT, T.TRITIUMBREEDER, T.HULKINGFUSIONREACTOR, T.STEAMTURBINE2, T.ADVFUSIONREACTOR, T.MHDRING, T.HELIUMSCAN, T.HELIUMWELL, T.HELIUMWELL2, T.CRYOPLANT, T.HE3SEPARATOR, T.GASSTORAGE,
        T.RAREEARTHSCAN, T.RAREEARTHMINE, T.LEACHPLANT, T.SCMILL, T.COREWORKS, T.COKEOVEN, T.GRAPHITEFURNACE,
        T.LAMP, T.CAMERA, T.CELLTOWER, T.EVCHARGER,
        T.TRUCK, T.ROAD, T.BRIDGE, T.PATHTOOL, T.GASSTATION,
        T.COALWASTE, T.OILWASTE, T.NUCLEARWASTE,
        T.RESEARCH3,
      ]);
      // Only Wire and Research MK1 auto-unlock — everything else requires research station click
      UNLOCK_DEFS.forEach(def => {
        if (unlocked.has(def.id)) return;
        // Already built one — it's unlocked, whatever the save's list says.
        // (Saves from before an item's gate changed can hold a building whose
        // id never made it into `unlocked`; without this it went "ready" and
        // toasted again on every load.)
        if (EntityRegistry.getByType(def.id).size > 0) {
          unlocked.add(def.id);
          ready.delete(def.id);
          if (readyNotifIds[def.id] !== undefined) NotificationStack.dismiss?.(readyNotifIds[def.id]);
          return;
        }
        // READY is latched, so a goal raised after a save went ready would
        // still unlock there. These goals only count up (plutonium separated
        // never falls), so one READY that no longer meets its goal went ready
        // under an older, lower target: take it back until it does. Goals that
        // can dip, like grid consumption, are left latched on purpose.
        if (ready.has(def.id) && RECHECK_READY.has(def.id) && !def.check()) {
          ready.delete(def.id);
          if (readyNotifIds[def.id] !== undefined) { NotificationStack.dismiss?.(readyNotifIds[def.id]); delete readyNotifIds[def.id]; }
          refreshHotbar();
          return;
        }
        if (ready.has(def.id) || !def.check()) return;
        // The Electrolyzer opens the fusion chain, so nothing else on tier 5
        // goes ready ahead of it, however early its own condition is met
        // (a gate on grid output, say, could land mid fusion research).
        if (def.tier === 5 && def.id !== T.ELECTROLYZER && !unlocked.has(T.ELECTROLYZER)) return;
        // The tier's own station has to be powered for its research to land.
        // Checked after def.check() so the world condition can still be met
        // in the dark — the moment the station comes back on, the item goes
        // ready on the next tick without the player redoing anything.
        if (!POWER_GATE_EXEMPT.has(def.id) && !tierPowered(def.tier)) return;
        if (def.id === T.WIRE || def.id === T.RESEARCH) {
          // Auto-unlock immediately
          unlocked.add(def.id);
          if (def.id === T.RESEARCH && typeof ResearchMilestone !== 'undefined') ResearchMilestone.show(1);
          showUnlockToast(def.label);
          if (typeof flashUnlockButton !== 'undefined') flashUnlockButton(def.id);
          refreshHotbar();
        } else {
          // Queue for manual unlock via Research Station
          ready.add(def.id);
          // Name the station it unlocks at: an item only shows on its own
          // tier's tab, so "open Research Station" sent a player with an MK3
          // up to the wrong one for an MK2 unlock.
          const _tierN = def.tier || 1;
          // Not showUnlockToast: its "UNLOCKED:" read as done when nothing
          // has been unlocked until the player confirms it.
          showToast(`🔓 READY: ${def.label}. Open your MK${_tierN} Research Station to unlock it`, '#40ff80', '#0a1a10', '#40ff80');
          try { SFX.researchReady?.(); } catch (_e) {}
          readyNotifIds[def.id] = NotificationStack.push({
            icon: '🔓',
            title: `${def.label} ready to unlock`,
            message: `Click to confirm at your MK${_tierN} Research Station`,
            color: '#40ff80',
            border: '#206040',
            // Straight to the station that can actually perform this unlock.
            // The card used to open the PROGRESS panel, which only restates
            // what the card already said and leaves the player to work out
            // which station to walk to; the whole point of the card is that
            // something is waiting to be confirmed, so take them to where
            // they confirm it. Falls back to PROGRESS only when no station of
            // that tier is standing (the unlock became ready off a tier whose
            // station has since been removed).
            onClick: () => { if (!openStationForTier(def.tier)) document.getElementById('btn-progress')?.click(); },
          });
          refreshHotbar();
        }
      });
    },

    // Called each logic tick — marks items as ready; does NOT auto-unlock.
    tick(dt, generatedW, researchW) {
      totalWs       += generatedW * dt;
      totalResearch += researchW  * dt;
      // Track peak substation charge for Power Pole unlock
      for (const t of [T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5]) {
        for (const _e of EntityRegistry.getByType(t)) {
          if ((_e.charge || 0) > maxSubstationCharge) maxSubstationCharge = _e.charge;
        }
      }

      hasAdvReactorGenerated();   // keep the sticky flag current (read by the Airport's trigger)
      hasFusionGenerated();       // likewise, for the Substation MK5 gate
      this.checkUnlocks();
    },

    // Player manually confirms unlock from the Research Station panel
    manualUnlock(type) {
      if (!ready.has(type)) return;
      ready.delete(type);
      unlocked.add(type);
      if (readyNotifIds[type]) { NotificationStack.dismiss(readyNotifIds[type]); delete readyNotifIds[type]; }
      SFX.unlock();
      showUnlockToast(type === T.BLUEPRINT ? 'Blueprints'
                    : type === T.AUTODISPATCH ? 'Auto-Dispatch'
                    : type === T.SCRUBBER ? 'Scrubbers'
                    // Scans and other capabilities aren't buildings, so they
                    // have no EntityDefs entry: take the research item's own name.
                    : (EntityDefs[type]?.label ?? UNLOCK_DEFS.find(d => d.id === type)?.label ?? type));
      // A research tier landing is a milestone, not just a toast.
      const _mkTier = type === T.RESEARCH2 ? 2 : type === T.RESEARCH3 ? 3 : type === T.MK4RESEARCH ? 4 : type === T.MK5RESEARCH ? 5 : 0;
      if (_mkTier && typeof ResearchMilestone !== 'undefined') ResearchMilestone.show(_mkTier);
      // Wire MK2 — increase wire hop limit and throughput
      if (type === T.POWERTOWER) {
        PowerNetwork.setWireHops(8);
        PowerNetwork.recomputeWireHops();
        showToast('🗼 Power Tower unlocked; place towers for 8-tile wire runs', '#40c0ff', '#040c14', '#104060');
      }
      if (type === T.AUTODISPATCH) {
        showToast('🤖 Auto-Dispatch unlocked: open a truck to automate waste collection', '#6cb8ff', '#0b1119', '#16304f');
      }
      if (type === T.BLUEPRINT) {
        showToast('📐 Blueprints unlocked: drag to save a layout', '#40c0ff', '#001824', '#1e4a60');
      }
      if (type === T.SCRUBBER) {
        showToast('🌫 Scrubbers unlocked: fit one from a Coal Generator, Fuel Generator or Refinery panel', '#80d0a0', '#041008', '#205030');
      }      if (typeof flashUnlockButton !== 'undefined') flashUnlockButton(type);
      refreshHotbar();
    },

    isReady(type)    { return ready.has(type); },
    anyReady()       { return ready.size > 0; },
    anyReadyForMk1() {
      for (const id of ready) if (this.tierOf(id) === 1 && !unlocked.has(id)) return true;
      return false;
    },
    anyReadyForMk2() {
      for (const id of ready) if (this.tierOf(id) === 2 && !unlocked.has(id)) return true;
      return false;
    },
    anyReadyForMk3() {
      for (const id of ready) if (this.tierOf(id) === 3 && !unlocked.has(id)) return true;
      return false;
    },
    anyReadyForMk4() {
      for (const id of ready) if (this.tierOf(id) === 4 && !unlocked.has(id)) return true;
      return false;
    },
    anyReadyForMk5() {
      for (const id of ready) if (this.tierOf(id) === 5 && !unlocked.has(id)) return true;
      return false;
    },
    getLockedTypes()  { return UNLOCK_DEFS.filter(d => !unlocked.has(d.id)).map(d => d.id); },
    // Demo scenarios: hand over a fixed set of tools outright (scenario_system.js).
    grant(types)      { for (const t of types || []) if (t) unlocked.add(t); },

    isUnlocked(type) { return unlocked.has(type); },

    // Research-station power gate, for the Research Station panel's readout.
    tierPowered,
    tierStallReason,
    stationTypeForTier,
    // Is this specific unlock currently held back only by its tier's station
    // being off? (Exempt bootstrap unlocks are never held back.)
    isPowerStalled(type) {
      if (unlocked.has(type) || POWER_GATE_EXEMPT.has(type)) return false;
      return !tierPowered(this.tierOf(type));
    },

    reactorEverRan()      { return _reactorEverRan; },
    loadReactorEverRan(v) { _reactorEverRan = !!v; },

    noteOverdriveTrip()          { _overdriveTripSeen = true; },
    overdriveTripSeen()          { return _overdriveTripSeen; },
    loadOverdriveTripSeen(v)     { _overdriveTripSeen = !!v; },
    sixTurbinesEverRan()      { return _sixTurbinesEverRan; },
    loadSixTurbinesEverRan(v) { _sixTurbinesEverRan = !!v; },
    carbonTaxSinceMk3,
    carbonTaxBase()           { return _ccTaxBase; },
    loadCarbonTaxBase(v)      { _ccTaxBase = typeof v === 'number' ? v : null; },

    advReactorEverRan()      { return _advReactorEverRan; },
    loadAdvReactorEverRan(v) { _advReactorEverRan = !!v; },

    advReactorGenerated()      { return _advReactorGenerated; },
    loadAdvReactorGenerated(v) { _advReactorGenerated = !!v; },
    cryoTowerEverRan()         { return _cryoTowerEverRan; },
    loadCryoTowerEverRan(v)    { _cryoTowerEverRan = !!v; },
    fusionGenerated()          { return hasFusionGenerated(); },
    loadFusionGenerated(v)     { _fusionGenerated = !!v; },
    plutoniumTurbineCount,
    plutoniumTurbinesNeeded() { return PLUTONIUM_TURBINES; },
    nuclearReactorsRunning,
    engOfficeReactors() { return hasReactorsRunning() ? ENGOFFICE_REACTORS : Math.min(ENGOFFICE_REACTORS, nuclearReactorsRunning()); },
    engOfficeReactorsNeeded() { return ENGOFFICE_REACTORS; },

    // Single canonical source of truth for which research-station tier an
    // unlock belongs to (1/2/3). inspection_panel.js reads this instead of
    // keeping its own separate mk2Only/mk3Only classification — previously
    // there were two hand-maintained copies of this mapping (this file's
    // three Sets, plus per-item flags in inspection_panel.js) that could
    // silently drift apart, which is what caused items to show as "ready"
    // in one place and never appear in the other's unlock list.
    tierOf(type) {
      const d = UNLOCK_DEFS.find(d => d.id === type);
      return d ? d.tier : 1;
    },

    hintFor(type) {
      const d = UNLOCK_DEFS.find(d => d.id === type);
      return d ? d.hint : '';
    },

    // For goal-based unlocks only (see _deriveFromGoals); null otherwise, so
    // callers fall back to their own readout.
    goalProgress(type) {
      const d = UNLOCK_DEFS.find(d => d.id === type);
      return d && d.goals ? d.goalProgress() : null;
    },
    requirementText(type) {
      const d = UNLOCK_DEFS.find(d => d.id === type);
      return d && d.goals ? d.requirementText() : null;
    },

    // Progress toward next locked unlock (0–1) for a given type
    progressFor(type) {
      const d = UNLOCK_DEFS.find(d => d.id === type);
      if (!d || unlocked.has(type)) return 1;
      if (d.goals) return d.progress();
      if (type === T.RESEARCH)  return Math.min(1, BiofuelSystem.getTotalCollected() / 125);
      if (type === T.LAMP)       return Math.min(1, HouseRequestSystem.getHousesAccepted() / 5);
      if (type === T.CAMERA)     return Math.min(1, AmenityRequestSystem.getTotalFulfilled() / 5);
      if (type === T.EVCHARGER)  {
        if (!Progression.isUnlocked(T.RESEARCH2)) return 0;
        for (const e of EntityRegistry.getByType(T.INDUSTRIAL)) {
          if (e.fromRequest && e.commercialSubtype === 'evfactory') return 1;
        }
        return 0;
      }
      if (type === T.FIBERHUB)   {
        if (!Progression.isUnlocked(T.RESEARCH3)) return 0;
        return Math.min(1, _totalPropertiesPlaced() / 85);
      }
      if (type === T.MONITOR)    return Math.min(1, EntityRegistry.getByType(T.WIND).size / 5);
      // Nothing until the Research MK3 stands: a Monitoring Station is an
      // early-game building, and counting it as half the way there put the
      // MK2 at 50% from the first hour.
      if (type === T.ENGOFFICE)  return hasReactorsRunning() ? 1 : Math.min(1, nuclearReactorsRunning() / ENGOFFICE_REACTORS);
      if (type === T.MONITOR2)   return EntityRegistry.getByType(T.RESEARCH3).size > 0 && EntityRegistry.getByType(T.MONITOR).size > 0
                                   ? Math.min(1, PowerNetwork.stats.totalConsumed / 2000) : 0;
      if (type === T.BEACON)     return Math.min(1, PowerNetwork.stats.totalGenerated / 150);
      if (type === T.SUBSTATION) return Math.min(1, PowerNetwork.stats.totalGenerated / 200);
      if (type === T.SUBSTATION2) return Math.min(1, PowerNetwork.stats.totalConsumed / 600);
      if (type === T.SUBSTATION3) return Progression.isUnlocked(T.RESEARCH3) ? Math.min(1, PowerNetwork.stats.totalGenerated / 3500) : 0;
      if (type === T.SUBSTATION4) return EntityRegistry.getByType(T.MK4RESEARCH).size > 0 ? Math.min(1, PowerNetwork.stats.totalGenerated / 10000) : 0;
      if (type === T.SUBSTATION5) return (EntityRegistry.getByType(T.MK5RESEARCH).size > 0 ? 0.5 : 0) + (hasFusionGenerated() ? 0.5 : 0);
      if (type === T.TRUCK)       {
        let maxAsh = 0;
        for (const e of EntityRegistry.getByType(T.COALGENERATOR)) maxAsh = Math.max(maxAsh, e._ashWaste || 0);
        return Math.min(1, maxAsh / 60);
      }
      if (type === T.POLE)       return Math.min(1, HouseRequestSystem.getHousesAccepted() + HouseRequestSystem.getCommercialsAccepted() + (HouseRequestSystem.getCabinCleared() ? 1 : 0));
      if (type === T.SOLAR2)     return (Progression.isUnlocked(T.RESEARCH2) ? 0.5 : 0) + 0.5 * Math.min(1, PowerNetwork.stats.totalConsumed / 250);
      if (type === T.WIND)       return Math.min(1, PowerNetwork.stats.totalConsumed / 25) * 0.25 + Math.min(1, (DayNight.day() * 24 + DayNight.hour()) / 96) * 0.75;   // 25 kW consumed + Day 4
      if (type === T.WIND2)      return (hasResearch2Placed() ? 0.5 : 0) + 0.5 * Math.min(1, PowerNetwork.stats.totalConsumed / 500);
      if (type === T.WIND3)      return Progression.isUnlocked(T.RESEARCH3) ? Math.min(1, PowerNetwork.stats.totalConsumed / 2500) : 0;
      if (type === T.SOLAR3)     return EntityRegistry.getByType(T.MK4RESEARCH).size > 0 ? Math.min(1, solarPanelCount() / SOLAR3_PANELS) : 0;
      if (type === T.BATTERY)    return Math.min(1, PowerNetwork.stats.totalGenerated / 50) * 0.25 + Math.min(1, (DayNight.day() * 24 + DayNight.hour()) / 78) * 0.75;   // 50 kW generated + Day 3, 06:00
      if (type === T.RESEARCH2)       return CoalSystem.hasDeposits() ? 1 : 0;
      if (type === T.RESEARCH3)       return Math.min(1, OilSystem.getTotalFuelOil() / 20000);
      if (type === T.URANIUMSCAN) {
        if (!Progression.isUnlocked(T.RESEARCH3)) return 0;
        const r = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getTotalTurbineRuntime() : 0;
        return Math.min(1, r / 3000);
      }
      if (type === T.SULFURSCAN) {
        if (!Progression.isUnlocked(T.RESEARCH3)) return 0;
        const r = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getTotalTurbineRuntime() : 0;
        return Math.min(1, r / 3000);
      }
      if (type === T.URANIUMMINE) {
        if (!Progression.isUnlocked(T.RESEARCH3)) return 0;
        return UraniumSystem.hasDeposits() ? 1 : 0;
      }
      if (type === T.SULFURMINE) {
        if (!Progression.isUnlocked(T.RESEARCH3)) return 0;
        return SulfurSystem.hasDeposits() ? 1 : 0;
      }
      if (type === T.COKEOVEN) {
        if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return 0;
        // Half for the reactor having run (a quarter for one standing), half for the coal.
        const rPct = hasAdvReactorGenerated() ? 1 : (EntityRegistry.getByType(T.ADVREACTOR).size > 0 ? 0.5 : 0);
        return rPct * 0.5 + Math.min(1, (CoalSystem.getTotalMined?.() || 0) / COKEOVEN_COAL_MINED) * 0.5;
      }
      if (type === T.GRAPHITEFURNACE) {
        if (!Progression.isUnlocked(T.COKEOVEN)) return 0;
        return Math.min(1, (CokeOvenSystem.getTotalCoke?.() || 0) / GRAPHITE_COKE_MADE);
      }
      if (type === T.PUMPJACK) {
        if (!Progression.isUnlocked(T.OILSCAN)) return Math.min(1, (CoalSystem.getTotalMined?.() || 0) / OILSCAN_COAL_MINED);
        return OilSystem.hasDeposits() ? 1 : 0;
      }
      if (type === T.PUMPJACK2) {
        if (!Progression.isUnlocked(T.RESEARCH3)) return 0;
        if (OilSystem.hasExhaustedDeposit()) return 1;
        // Progress toward the first dry well: the most-drained live deposit.
        let best = 0;
        for (const d of EntityRegistry.getByType(T.OILDEPOSIT))
          if (d._pressure !== undefined) best = Math.max(best, 1 - d._pressure);
        return Math.min(0.99, best);
      }
      if (type === T.OILSTORAGE)      return Math.min(1, OilSystem.getTotalCrude() / OILSTORAGE_CRUDE);
      if (type === T.REFINERY)        return Math.min(1, OilSystem.getTotalCrude() / REFINERY_CRUDE);
      if (type === T.GASSTATION)      return Math.min(1, OilSystem.getTotalFuelOil() / GASSTATION_FUELOIL);
      // Mirrors this file's own check for OILSCAN (Research MK2 + OILSCAN_COAL_MINED t
      // coal). There was no case here at all, so progressFor(T.OILSCAN) fell
      // through to `return 0` — which is why the Progress panel rolled its
      // own formula instead of calling this, and got the threshold wrong by 30x.
      if (type === T.OILSCAN) {
        if (!Progression.isUnlocked(T.RESEARCH2)) return 0;
        return Math.min(1, (CoalSystem.getTotalMined?.() || 0) / OILSCAN_COAL_MINED);
      }
      if (type === T.UNDERGNDPIPE)    return (Progression.isReady(T.OILSTORAGE) || Progression.isUnlocked(T.OILSTORAGE)) ? 1 : 0;
      if (type === T.DAM)             return EntityRegistry.getByType(T.RESEARCH3).size > 0 ? 1 : 0;
      if (type === T.HYDROTURBINE)    return (typeof ReservoirSystem !== 'undefined' && ReservoirSystem.hasDams()) ? 1 : 0;
      if (type === T.SHAFT)           return (typeof ReservoirSystem !== 'undefined') ? Math.min(1, ReservoirSystem.getTotalTurbineRuntime() / (3 * 300)) : 0;
      if (type === T.HYDROGENERATOR)  return (typeof ReservoirSystem !== 'undefined') ? Math.min(1, ReservoirSystem.getTotalTurbineRuntime() / (3 * 300)) : 0;
      if (type === T.FUELGEN)        return Math.min(1, OilSystem.getTotalFuelOil() / 2000);
      if (type === T.GOVERNOR)       return (hasResearch3Placed() ? 0.5 : 0) + (_overdriveTripSeen ? 0.5 : 0);
      if (type === T.SCRUBBER)       return (hasResearch2Placed() ? 0.5 : 0) + 0.5 * Math.min(1, (typeof PollutionSystem !== 'undefined' ? PollutionSystem.taxPaid() : 0) / SCRUBBER_TAX);
      if (type === T.CARBONCAPTURE)  return (hasResearch3Placed() ? 0.5 : 0) + 0.5 * Math.min(1, carbonTaxSinceMk3() / CARBON_CAPTURE_TAX);
      if (type === T.NUCLEARREACTOR)  return Math.min(1, (typeof FuelPlantSystem !== 'undefined' ? FuelPlantSystem.getTotalRods() : 0) / 800);
      if (type === T.COOLINGTOWER)    return EntityRegistry.getByType(T.NUCLEARREACTOR).size > 0 ? 1 : 0;
      if (type === T.MK4RESEARCH) {
        if (!Progression.isUnlocked(T.RESEARCH3)) return 0;
        if (hasSixTurbinesRunning()) return 1;
        let n = 0;
        for (const e of EntityRegistry.getByType(T.STEAMTURBINE)) if (e._generating) n++;
        return Math.min(1, n / 6);
      }
      if (type === T.SPENTFUELPOOL) {
        if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return 0;
        const sf = (typeof NuclearSystem !== 'undefined') ? NuclearSystem.getTotalSpentFuel() : 0;
        return Math.min(1, sf / 250);
      }
      if (type === T.MOXPLANT) {
        if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return 0;
        const p = (typeof ReprocessingSystem !== 'undefined') ? ReprocessingSystem.getTotalPlutonium() : 0;
        return Math.min(1, p / 50);
      }
      if (type === T.DRONEPORT) {
        if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return 0;
        return Math.min(1, EntityRegistry.getByType(T.TRUCK).size / DRONE_PORT_TRUCKS);
      }
      if (type === T.DRONECHARGER) {
        if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return 0;
        return Math.min(1, EntityRegistry.getByType(T.DRONEPORT).size / DRONE_CHARGER_PORTS);
      }
      if (type === T.MK5RESEARCH) {
        // Gates on the MK4 being placed, not the MK5 — this read MK5RESEARCH,
        // which made the progress bar sit at 0% until the very station it was
        // measuring progress toward had already been built.
        if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return 0;
        if (hasPlutoniumTurbinesRunning()) return 1;
        return Math.min(1, plutoniumTurbineCount() / PLUTONIUM_TURBINES);
      }
      if (type === T.ELECTROLYZER) {
        if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return 0;
        return typeof FusionResearch !== 'undefined' ? FusionResearch.progress() : 0;
      }
      if (type === T.LITHIUMSCAN) {
        if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return 0;
        const h = (typeof ElectrolyzerSystem !== 'undefined') ? ElectrolyzerSystem.getTotalHydrogenProduced() : 0;
        return Math.min(1, h / FUSION_GOALS.hydrogen);
      }
      if (type === T.LITHIUMPROCESSPLANT) {
        if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return 0;
        const m = (typeof LithiumSystem !== 'undefined') ? LithiumSystem.getTotalMined() : 0;
        return Math.min(1, m / FUSION_GOALS.lithium);
      }
      if (type === T.ATMOSCOLLECTOR) {
        if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return 0;
        const h = (typeof ElectrolyzerSystem !== 'undefined') ? ElectrolyzerSystem.getTotalHydrogenProduced() : 0;
        return Math.min(1, h / FUSION_GOALS.hydrogenAtmos);
      }
      if (type === T.GASSTORAGE) {
        if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return 0;
        return electrolyzerFillFrac();
      }
      if (type === T.HABERBOSCH) {
        if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return 0;
        const n = (typeof AtmosphereCollectorSystem !== 'undefined') ? AtmosphereCollectorSystem.getTotalNitrogenProduced() : 0;
        return Math.min(1, n / FUSION_GOALS.nitrogen);
      }
      if (type === T.WASHTOWER) {
        if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return 0;
        const a = (typeof HaberBoschSystem !== 'undefined') ? HaberBoschSystem.getTotalAmmoniaProduced() : 0;
        return Math.min(1, a / FUSION_GOALS.ammonia);
      }
      if (type === T.TRITIUMBREEDER) {
        if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return 0;
        const c = (typeof LithiumProcessPlantSystem !== 'undefined') ? LithiumProcessPlantSystem.getTotalCompoundProduced() : 0;
        return Math.min(1, c / FUSION_GOALS.compound);
      }
      if (type === T.FUSIONFUELPLANT) {
        const d = (typeof IsotopicWashTowerSystem !== 'undefined') ? IsotopicWashTowerSystem.getTotalDeuteriumProduced() : 0;
        return (Progression.isUnlocked(T.TRITIUMBREEDER) ? 0.5 : 0) + Math.min(1, d / FUSION_GOALS.deuterium) * 0.5;
      }
      if (type === T.HELIUMSCAN) {
        if (EntityRegistry.getByType(T.MK5RESEARCH).size === 0) return 0;
        if (fusionReactorPowered()) return 1;
        const p = (typeof FusionFuelPlantSystem !== 'undefined') ? FusionFuelPlantSystem.getTotalPlasmaProduced() : 0;
        return Math.min(1, p / FUSION_GOALS.pellets1);
      }
      if (type === T.RAREEARTHSCAN) {
        return Math.min(1, ((typeof AdvancedFusionReactorSystem !== 'undefined') ? AdvancedFusionReactorSystem.getTotalPelletsBurned() : 0) / FUSION_GOALS.dhe3burned);
      }
      if (type === T.RAREEARTHMINE) {
        const sPct = Progression.isUnlocked(T.RAREEARTHSCAN) ? 1 : 0;
        const dPct = (typeof RareEarthSystem !== 'undefined' && RareEarthSystem.hasDeposits()) ? 1 : 0;
        return sPct * 0.5 + dPct * 0.5;
      }
      if (type === T.LEACHPLANT) {
        const sPct = typeof NationalProject !== 'undefined' && NationalProject.reached('stage1') ? 1 : 0;
        const m = (typeof RareEarthSystem !== 'undefined') ? RareEarthSystem.getTotalMined() : 0;
        return sPct * 0.5 + Math.min(1, m / FUSION_GOALS.rareearth) * 0.5;
      }
      if (type === T.SCMILL) {
        const sPct = typeof NationalProject !== 'undefined' && NationalProject.reached('stage2') ? 1 : 0;
        const o = (typeof LeachPlantSystem !== 'undefined') ? LeachPlantSystem.getTotalOxide() : 0;
        return sPct * 0.5 + Math.min(1, o / FUSION_GOALS.oxide) * 0.5;
      }
      if (type === T.COREWORKS) {
        const sPct = typeof NationalProject !== 'undefined' && NationalProject.reached('stage3') ? 1 : 0;
        const tp = (typeof SuperconductorMillSystem !== 'undefined') ? SuperconductorMillSystem.getTotalTape() : 0;
        return sPct * 0.5 + Math.min(1, tp / FUSION_GOALS.tape) * 0.5;
      }
      if (type === T.HELIUMWELL) {
        const sPct = Progression.isUnlocked(T.HELIUMSCAN) ? 1 : 0;
        const dPct = (typeof HeliumSystem !== 'undefined' && HeliumSystem.hasDeposits()) ? 1 : 0;
        return sPct * 0.5 + dPct * 0.5;
      }
      if (type === T.HELIUMWELL2) {
        if (advFusionHasRun()) return 1;
        return Progression.isUnlocked(T.ADVFUSIONREACTOR) ? 0.5 : Progression.progressFor(T.ADVFUSIONREACTOR) * 0.5;
      }
      if (type === T.CRYOPLANT) {
        const h = (typeof HeliumSystem !== 'undefined') ? HeliumSystem.getTotalExtracted() : 0;
        return Math.min(1, h / FUSION_GOALS.helium);
      }
      if (type === T.HULKINGFUSIONREACTOR) {
        return fusionCoolantMade() ? 1 : Progression.progressFor(T.CRYOPLANT) * 0.9;
      }
      if (type === T.MHDRING || type === T.ADVFUSIONREACTOR) return Math.min(1, he3PelletsMade() / FUSION_GOALS.he3pellets);
      if (type === T.STEAMTURBINE2) return Math.min(1, fusionTurbinesRunning() / FUSION_TURBINES_FOR_MK2);
      if (type === T.HE3SEPARATOR) {
        if (EntityRegistry.getByType(T.MHDRING).size > 0) return 1;
        return Math.min(1, ((typeof HulkingFusionReactorSystem !== 'undefined') ? HulkingFusionReactorSystem.getTotalPelletsBurned() : 0) / FUSION_GOALS.burned);
      }
      if (type === T.PROTECTOR)  return PowerNetwork.redlineProgress();
      if (type === T.PROTECTOR2) return Math.min(1, PowerNetwork.stats.totalConsumed / 800);
      if (type === T.PROTECTOR3) return EntityRegistry.getByType(T.MK4RESEARCH).size > 0 ? Math.min(1, PowerNetwork.stats.totalConsumed / 5000) : 0;
      if (type === T.LIGHTNINGROD3) {
        if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return 0;
        return Math.min(1, Math.max(0, Economy.income) / LIGHTNINGROD3_INCOME);
      }
      if (type === T.CIRCUITSWITCH2) return EntityRegistry.getByType(T.MK4RESEARCH).size > 0 ? Math.min(1, PowerNetwork.stats.totalGenerated / 7500) : 0;
      if (type === T.SURVEY)     return Math.min(1, PowerNetwork.stats.totalConsumed / 200);
      if (type === T.SURVEY2) {
        if (EntityRegistry.getByType(T.MK4RESEARCH).size === 0) return 0;
        return Math.min(1, CoalSystem.getAllSurveyCount() / SURVEY2_SCANS);
      }
      if (type === T.GEOWELL)    return GeothermalSystem.hasDeposits() ? 1 : 0;
      if (type === T.GEOTURBINE) return EntityRegistry.getByType(T.GEOWELL).size > 0 ? 1 : 0;
      if (type === T.COALSCAN)   return GeothermalSystem.threeTurbinesEverRan()
        ? 1
        : Math.min(1, GeothermalSystem.runningTurbineCount() / GeothermalSystem.COAL_SCAN_TURBINES);
      if (type === T.COALMINE)       return (Progression.isUnlocked(T.COALSCAN) && CoalSystem.hasDeposits()) ? 1 : 0;
      if (type === T.COALMINE2) {
        if (!Progression.isUnlocked(T.RESEARCH3)) return 0;
        return Math.min(1, (CoalSystem.getTotalMined?.() || 0) / COALMINE2_COAL_MINED);
      }
      if (type === T.BLUEPRINT)      return EntityRegistry.getByType(T.RESEARCH3).size > 0 ? 1 : 0;
      if (type === T.AUTODISPATCH) {
        if (!Progression.isUnlocked(T.RESEARCH3)) return 0;
        return Math.min(1, AutoHaulSystem.wasteBuildingCount() / 15);
      }
      if (type === T.CONVEYOR)       return Math.min(1, CoalSystem.getTotalMined() / 500);
      if (type === T.UNDERGNDCONVEYOR) return Math.min(1, CoalSystem.getTotalMined() / 500);
      if (type === T.CONVEYORSPLITTER) return Math.min(1, beltTileCount() / SPLITTER_BELT_TILES);
      if (type === T.HAULER)           return Math.min(1, beltTileCount() / HAULER_BELT_TILES);
      if (type === T.SOLIDSTORAGE)   return Math.min(1, CoalSystem.getTotalMined() / 500);
      if (type === T.FASTTRAVEL) {
        for (const e of EntityRegistry.getByType(T.COALGENERATOR)) if (e.powered && e._fuelled) return 1;
        return 0;
      }
      if (type === T.POWERTOWER)        return Progression.checkPowerTowerReady() ? 1 : 0;
      return 0;
    },

    saveSnapshot() {
      snapshot = { set: new Set(unlocked), ready: new Set(ready), ws: totalWs, rp: totalResearch, maxSC: maxSubstationCharge };
    },

    restoreSnapshot() {
      if (!snapshot) return;
      applyState(snapshot.set, snapshot.ws, snapshot.rp);
      maxSubstationCharge = snapshot.maxSC || 0;
      snapshot.ready.forEach(v => ready.add(v));
      snapshot = null;
    },

    unlockAll() {
      UNLOCK_DEFS.forEach(def => {
        unlocked.add(def.id); ready.delete(def.id);
        if (readyNotifIds[def.id]) { NotificationStack.dismiss(readyNotifIds[def.id]); delete readyNotifIds[def.id]; }
      });
      unlocked.add(T.LAMP);   // ensure lamp always included in unlockAll
      // Raise these to satisfy any WS/research-gated check, but never LOWER
      // them. These used to be plain assignments, which silently rolled a
      // developed save backwards — a city with 1.8M Ws banked got slammed to
      // 99,999 the moment you clicked Unlock All. HouseRequestSystem's
      // request thresholds live in another module and don't move with it, so
      // the result was a save whose thresholds sat a million Ws above its own
      // counter and could never spawn another customer request.
      totalWs             = Math.max(totalWs,             99999);
      totalResearch       = Math.max(totalResearch,       99999);
      maxSubstationCharge = Math.max(maxSubstationCharge, 99999);
      _reactorEverRan     = true;
      refreshHotbar();
    },

    resetProgress() {
      ready.clear();
      maxSubstationCharge = 0;
      _reactorEverRan = false;
      _cryoTowerEverRan = false;
      applyState(new Set(BASE_UNLOCKED), 0, 0);
      // Customer-request thresholds are owned by HouseRequestSystem and are
      // measured against the totalWs we just zeroed. Leaving them where a
      // mature city had pushed them (millions of Ws) strands the save: every
      // gate sits permanently above the counter, so residential, commercial
      // and industrial requests all stop spawning for good. Rebase them to
      // match the progression state we just reset to.
      if (typeof HouseRequestSystem !== 'undefined') HouseRequestSystem.fixStuckThresholds?.();
    },

    serialiseReady() { return [...ready]; },

    loadState(d) {
      unlocked.clear();
      ready.clear();
      (d.unlocked || []).forEach(v => unlocked.add(v));
      (d.ready    || []).forEach(v => { if (!unlocked.has(v)) ready.add(v); });
      // Saves from when the Fusion Reactor came before its cooling chain: back
      // to locked until the Cryo Plant is. A reactor already standing keeps
      // its unlock (the placed-building rule in the unlock tick restores it).
      if (!unlocked.has(T.CRYOPLANT)) { unlocked.delete(T.HULKINGFUSIONREACTOR); ready.delete(T.HULKINGFUSIONREACTOR); }
      totalWs             = d.totalWs             || 0;
      totalResearch       = d.totalResearch        || 0;
      maxSubstationCharge = d.maxSubstationCharge  || 0;
      refreshHotbar();
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   ECONOMY
   Simple: powered consumers generate income over time.
   ═══════════════════════════════════════════════════════════════════ */
