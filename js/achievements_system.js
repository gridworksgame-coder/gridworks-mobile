/* ═══════════════════════════════════════════════════════════════════
   ACHIEVEMENTS SYSTEM
   Fixed list of milestone conditions checked each tick. First time a
   condition is met it fires a celebratory toast, logs to the message
   log, and stays unlocked forever (persisted in the save file).
   ═══════════════════════════════════════════════════════════════════ */
const AchievementsSystem = (() => {
  const unlocked = new Set();
  let _stormWitnessCount  = 0;
  let _prevWeatherActive  = false;
  let _everInDebt         = false;
  let _everHadLoan        = false;
  let _approvalStreakSecs = 0;
  let _closeCall          = false;   // a generator came back from critical without going up
  let _closeCallAdv       = false;   // ...and it was an Advanced Reactor
  const _critSeen = new Set();       // generators seen critical, waiting to see how it ends
  let _tickN = 0, _popTick = -1, _popCache = 0;

  // Population is read by several achievements every tick — count it once.
  function _totalPopulation() {
    if (_popTick === _tickN) return _popCache;
    let total = 0;
    for (const t of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) {
      for (const e of EntityRegistry.getByType(t)) if (e.fromRequest) total += (e._population || 0);
    }
    _popTick = _tickN; _popCache = total;
    return total;
  }
  const _n   = (...types) => types.reduce((k, t) => k + (t ? EntityRegistry.getByType(t).size : 0), 0);
  const _has = (...types) => _n(...types) > 0;
  const _gen = () => PowerNetwork.stats.totalGenerated || 0;
  const _fossil = () => _n(T.COALGENERATOR, T.FUELGEN);
  const _np  = p => typeof NationalProject !== 'undefined' && NationalProject.reached(p);
  // A late-game system's counter, or 0 before it exists (ReferenceError).
  const _v = fn => { try { return fn() || 0; } catch (_e) { return 0; } };
  // The player's own money: the balance less any contract advance still held
  // for an open job (client money until the job is signed off), so taking a
  // job can't hand out the balance achievements.
  const _ownBalance = () => Economy.balance - _v(() => ContractSystem.heldAdvance());
  const _generating = t => { for (const e of EntityRegistry.getByType(t)) if (e._generating) return true; return false; };
  const CIVIC_SET = [T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB];
  const _scrubbable = () => [T.COALGENERATOR, T.FUELGEN, T.REFINERY].flatMap(t => [...EntityRegistry.getByType(t)]);
  let _smogSurvived = false;
  let _prevWeatherType = null;
  function _poweredOfType(type) {
    for (const e of EntityRegistry.getByType(type)) if (e.powered) return true;
    return false;
  }

  const DEFS = [
    { id: 'first_light',        label: 'First Light',         icon: '💡', desc: 'Power your first connected building.',
      check: () => PowerNetwork.stats.poweredCount >= 1 },
    { id: 'grid_up',             label: 'Grid Online',         icon: '⚡', desc: 'Reach 100 kW total generation.',
      check: () => PowerNetwork.stats.totalGenerated >= 100 },
    { id: 'mega_watt',           label: 'Megawatt Club',       icon: '⚡', desc: 'Reach 1 MW total generation.',
      check: () => PowerNetwork.stats.totalGenerated >= 1000 },
    { id: 'gigawatt_grid',       label: 'Utility Scale',       icon: '⚡', desc: 'Reach 5 MW total generation.',
      check: () => PowerNetwork.stats.totalGenerated >= 5000 },
    { id: 'long_reach',          label: 'Long Reach',          icon: '🗼', desc: 'Unlock the Power Tower.',
      check: () => Progression.isUnlocked(T.POWERTOWER) },
    { id: 'coal_baron',          label: 'Coal Baron',          icon: '⛏', desc: 'Get a Coal Generator powered.',
      check: () => _poweredOfType(T.COALGENERATOR) },
    { id: 'oil_tycoon',          label: 'Oil Tycoon',          icon: '🛢', desc: 'Get a Fuel Generator powered.',
      check: () => _poweredOfType(T.FUELGEN) },
    { id: 'atomic_age',          label: 'Atomic Age',          icon: '☢', desc: 'Get a Nuclear Reactor generating power.',
      check: () => { for (const e of EntityRegistry.getByType(T.NUCLEARREACTOR)) if (e._generating) return true; return false; } },
    { id: 'hydro_power',         label: 'Hydro Power',         icon: '💧', desc: 'Get a Hydro Generator powered.',
      check: () => _poweredOfType(T.HYDROGENERATOR) },
    { id: 'renewable_trifecta',  label: 'Renewable Trifecta',  icon: '🌱', desc: 'Have Wind, Solar, and Biofuel generators powered at the same time.',
      check: () => _poweredOfType(T.WIND) && (_poweredOfType(T.SOLAR) || _poweredOfType(T.SOLAR2) || _poweredOfType(T.SOLAR3)) && _poweredOfType(T.BIOFUELGEN) },
    { id: 'first_customer',      label: 'First Customer',      icon: '🏠', desc: 'Connect your first house or business.',
      check: () => PowerNetwork.stats.totalConsumers >= 1 },
    { id: 'boomtown',            label: 'Boomtown',            icon: '🏗', desc: 'Reach a population of 200.',
      check: () => _totalPopulation() >= 200 },
    { id: 'big_city',            label: 'Big City',            icon: '🏙', desc: 'Reach a population of 500.',
      check: () => _totalPopulation() >= 500 },
    { id: 'metropolis',          label: 'Metropolis',          icon: '🌆', desc: 'Reach a population of 2,000.',
      check: () => _totalPopulation() >= 2000 },
    { id: 'urban_planner',       label: 'Urban Planner',       icon: '🗺', desc: 'Establish residential, commercial, and industrial zones.',
      check: () => ['residential', 'commercial', 'industrial'].every(k => (ZoneSystem.getZoneRects(k) || []).length > 0) },
    { id: 'happy_customers',     label: 'Happy Customers',     icon: '😊', desc: 'Average satisfaction ≥ 90% with 20+ customers.',
      check: () => PowerNetwork.stats.totalConsumers >= 20 && SatisfactionSystem.averageSatisfaction() >= 90 },
    { id: 'top_marks',           label: 'Top Marks',           icon: '🏆', desc: 'Reach a City Score grade of S.',
      check: () => (typeof CityScore !== 'undefined') && CityScore.grade === 'S' },
    { id: 'first_profit',        label: 'First Profit',        icon: '💰', desc: 'Reach a $50,000 balance.',
      check: () => _ownBalance() >= 50000 },
    { id: 'six_figures',         label: 'Six Figures',         icon: '💰', desc: 'Reach a $100,000 balance.',
      check: () => _ownBalance() >= 100000 },
    { id: 'watts_a_million',     label: "Watt's a Million?",   icon: '💵', desc: 'Reach a $1,000,000 balance.',
      check: () => _ownBalance() >= 1000000 },
    { id: 'debt_recovery',       label: 'Debt Recovery',       icon: '📈', desc: 'Climb back out of debt after going negative.',
      check: () => _everInDebt && _ownBalance() >= 0 },
    { id: 'debt_free',           label: 'Debt Free',           icon: '🧾', desc: 'Fully repay every outstanding loan.',
      check: () => _everHadLoan && (typeof GovernmentSystem !== 'undefined') && GovernmentSystem.getLoans().length === 0 },
    { id: 'mayors_favorite',     label: "Mayor's Favorite",    icon: '🎖', desc: 'Keep Mayor approval at 90%+ for 3 days straight.',
      check: () => _approvalStreakSecs >= DayNight.secondsPerGameHour() * 24 * 3 },
    { id: 'green_space',         label: 'Green Space',         icon: '🌳', desc: 'Build your first park.',
      check: () => EntityRegistry.getByType(T.SMALLPARK).size > 0 },
    { id: 'renaissance_engineer', label: 'Renaissance Engineer', icon: '🎓', desc: 'Unlock every technology.',
      check: () => Progression.getLockedTypes().length === 0 },
    { id: 'old_faithful',        label: 'Old Faithful',        icon: '📆', desc: 'Keep the grid running for 365 in-game days.',
      check: () => DayNight.day() >= 365 },
    { id: 'hook_line_sinker',    label: 'Hook, Line & Sinker', icon: '🎣', desc: 'Catch your first fish.',
      check: () => (typeof FishingSystem !== 'undefined') && FishingSystem.hasCaughtAny() },
    { id: 'compleat_angler',     label: 'The Compleat Angler', icon: '🐠', desc: 'Catch every type of fish.',
      check: () => (typeof FishingSystem !== 'undefined') && FishingSystem.hasCaughtAllFish() },
    { id: 'fossil_fuel',         label: 'Fossil Fuel',         icon: '🦴', desc: 'Catch the ancient Fossilized Fish.',
      check: () => (typeof FishingSystem !== 'undefined') && FishingSystem.hasCaughtIcon('fossil') },
    { id: 'nuclear_bait',        label: 'Nuclear Bait',        icon: '☢', desc: 'Catch something glowing (uranium?).',
      check: () => (typeof FishingSystem !== 'undefined') && FishingSystem.hasCaughtIcon('uranium') },
    { id: 'meridian_file',       label: 'Need to Know',        icon: '◈', desc: 'Have the Ministry of Energy open a classified file on your company.',
      check: () => (typeof NationalProject !== 'undefined') && NationalProject.reached('classified') },
    { id: 'meridian_ground',     label: 'Breaking Ground',     icon: '🏗', desc: 'Raise Hyperion Station (Stage II of Operation Hyperion).',
      check: () => (typeof NationalProject !== 'undefined') && NationalProject.reached('stage2') },
    { id: 'meridian_line',       label: 'On the Line',         icon: '🗼', desc: 'Tie the national grid in to yours (Stage IV of Operation Hyperion).',
      check: () => (typeof NationalProject !== 'undefined') && NationalProject.reached('stage3') },
    { id: 'grid_complete',       label: 'Grid Complete',       icon: '🌐', desc: 'Complete Operation Hyperion and power the nation.',
      check: () => (typeof NationalProject !== 'undefined') && NationalProject.reached('victory') },
    // ── Getting started ──
    { id: 'eureka',              label: 'Eureka!',             icon: '🔬', desc: 'Build your first Research Station.', cat: 'start',
      check: () => _has(T.RESEARCH) },
    { id: 'lab_upgrade',         label: 'Lab Upgrade',         icon: '🧪', desc: 'Build a Research Station MK2.', cat: 'start',
      check: () => _has(T.RESEARCH2) },
    { id: 'think_tank',          label: 'Think Tank',          icon: '🧠', desc: 'Build a Research Station MK3.', cat: 'start',
      check: () => _has(T.RESEARCH3) },
    { id: 'big_science',         label: 'Big Science',         icon: '🏢', desc: 'Build the MK4 Research Station.', cat: 'start',
      check: () => _has(T.MK4RESEARCH) },
    { id: 'final_tier',          label: 'The Final Tier',      icon: '🌠', desc: 'Build the MK5 Research Station.', cat: 'start',
      check: () => _has(T.MK5RESEARCH) },

    // ── Power & grid ──
    { id: 'ten_mw',              label: 'Ten Megawatts',       icon: '⚡', desc: 'Reach 10 MW total generation.', cat: 'grid',
      check: () => _gen() >= 10000 },
    { id: 'grid_giant',          label: 'Grid Giant',          icon: '⚡', desc: 'Reach 25 MW total generation.', cat: 'grid',
      check: () => _gen() >= 25000 },
    { id: 'powerhouse',          label: 'Powerhouse of a Nation', icon: '⚡', desc: 'Reach 50 MW total generation.', cat: 'grid',
      check: () => _gen() >= 50000 },
    { id: 'deep_reserves',       label: 'Deep Reserves',       icon: '🔋', desc: 'Build a Substation MK3.', cat: 'grid',
      check: () => _has(T.SUBSTATION3) },
    { id: 'spaghetti',           label: 'Spaghetti Junction',  icon: '🍝', desc: 'Lay 500 pieces of wire.', cat: 'grid',
      check: () => _n(T.WIRE) >= 500 },
    { id: 'high_voltage',        label: 'High Voltage',        icon: '🛡', desc: 'Build a Surge Protector MK3.', cat: 'grid',
      check: () => _has(T.PROTECTOR3) },
    { id: 'load_shedding',       label: 'Load Shedding',       icon: '🎚', desc: 'Build a Circuit Switch.', cat: 'grid',
      check: () => _has(T.CIRCUITSWITCH, T.CIRCUITSWITCH2) },
    { id: 'eyes_on_grid',        label: 'Eyes on the Grid',    icon: '📡', desc: 'Build a Monitoring Station.', cat: 'grid',
      check: () => _has(T.MONITOR) },
    { id: 'red_line',            label: 'Red Line',            icon: '🌡', desc: 'Push a generator to critical on Overdrive.', cat: 'grid',
      check: () => Progression.overdriveTripSeen?.() },
    { id: 'speed_limit',         label: 'Speed Limit',         icon: '⚙', desc: 'Fit a Throttle Governor.', cat: 'grid',
      check: () => _has(T.GOVERNOR) },

    // ── Renewables ──
    { id: 'solar_farm',          label: 'Solar Farm',          icon: '☀', desc: 'Have 25 solar panels on the map.', cat: 'green',
      check: () => _n(T.SOLAR, T.SOLAR2, T.SOLAR3) >= 25 },
    { id: 'salt_after_dark',     label: 'Salt After Dark',     icon: '🌇', desc: 'Have a Solar Array running on stored heat after sunset.', cat: 'green',
      check: () => { if (DayNight.darkness() < 0.95) return false; for (const e of EntityRegistry.getByType(T.SOLAR3)) if (e.powered && (e._saltFlow || 0) < -1) return true; return false; } },
    { id: 'utility_wind',        label: 'Utility-Scale Wind',  icon: '🌀', desc: 'Build a Wind Turbine MK3.', cat: 'green',
      check: () => _has(T.WIND3) },
    { id: 'hot_springs',         label: 'Hot Springs',         icon: '♨', desc: 'Build a Geothermal Turbine.', cat: 'green',
      check: () => _has(T.GEOTURBINE) },
    { id: 'green_grid',          label: 'Green Grid',          icon: '🍃', desc: 'Generate 5 MW with no coal or oil generators on the map.', cat: 'green',
      check: () => _gen() >= 5000 && _fossil() === 0 },
    { id: 'clean_giant',         label: 'Clean Giant',         icon: '🌍', desc: 'Generate 25 MW with no coal or oil generators on the map.', cat: 'green',
      check: () => _gen() >= 25000 && _fossil() === 0 },

    // ── Fossil & mining ──
    { id: 'down_the_mine',       label: 'Down the Mine',       icon: '⛏', desc: 'Mine 10,000 coal.', cat: 'fossil',
      check: () => _v(() => CoalSystem.getTotalMined()) >= 10000 },
    { id: 'black_gold',          label: 'Black Gold',          icon: '🛢', desc: 'Pump 10,000 crude oil.', cat: 'fossil',
      check: () => _v(() => OilSystem.getTotalCrude()) >= 10000 },
    { id: 'prospector',          label: 'Prospector',          icon: '🔍', desc: 'Run 10 resource scans.', cat: 'fossil',
      check: () => _v(() => CoalSystem.getTotalScans()) + _v(() => OilSystem.getTotalScans()) + _v(() => UraniumSystem.getTotalScans())
        + _v(() => SulfurSystem.getTotalScans()) + _v(() => LithiumSystem.getTotalScans()) + _v(() => HeliumSystem.getTotalScans())
        + _v(() => GeothermalSystem.getTotalScans()) >= 10 },
    { id: 'clean_up_crew',       label: 'Clean-Up Crew',       icon: '♻', desc: 'Build a waste processing facility.', cat: 'fossil',
      check: () => _has(T.COALWASTE, T.OILWASTE, T.NUCLEARWASTE) },
    { id: 'kaboom',              label: 'Kaboom',              icon: '💥', desc: 'Have a generator blow up. Oops.', cat: 'fossil',
      check: () => _v(() => LightningDamageSystem.getTotalGenExplosions()) > 0 },

    // ── Air quality ──
    { id: 'clean_stacks',        label: 'Clean Stacks',        icon: '🏭', desc: 'Have every coal generator, fuel generator and refinery scrubbed; at least 3 of them.', cat: 'air',
      check: () => { const p = _scrubbable(); return p.length >= 3 && p.every(e => e._scrubber); } },
    { id: 'pea_souper',          label: 'Pea-Souper',          icon: '🌫', desc: 'Live through a smog day.', cat: 'air',
      check: () => _smogSurvived },
    { id: 'sky_vacuum',          label: 'Sky Vacuum',          icon: '🌀', desc: 'Get a Carbon Capture Plant running.', cat: 'air',
      check: () => T.CARBONCAPTURE && _poweredOfType(T.CARBONCAPTURE) },
    { id: 'net_zero',            label: 'Net Zero',            icon: '⚖', desc: 'Burn enough fossil fuel for 20+ emission units and capture every bit of it.', cat: 'air',
      check: () => typeof PollutionSystem !== 'undefined' && PollutionSystem.grossEmissions() >= 20 && PollutionSystem.emissions() <= 0.01 },
    { id: 'ten_k_tonnes',        label: 'Ten Thousand Tonnes', icon: '🪨', desc: 'Capture 10,000 t of CO₂.', cat: 'air',
      check: () => typeof PollutionSystem !== 'undefined' && PollutionSystem.capturedTonnes() >= 10000 },
    { id: 'blue_skies',          label: 'Blue Skies',          icon: '🌤', desc: 'Run a 5 MW city at City Score grade S.', cat: 'air',
      check: () => _gen() >= 5000 && typeof CityScore !== 'undefined' && CityScore.grade === 'S' },

    // ── Nuclear ──
    { id: 'yellowcake',          label: 'Yellowcake',          icon: '🟨', desc: 'Mine 1,000 uranium ore.', cat: 'nuclear',
      check: () => _v(() => UraniumSystem.getTotalMined()) >= 1000 },
    { id: 'turbine_hall',        label: 'Turbine Hall',        icon: '🌀', desc: 'Have 12 Steam Turbines on the map.', cat: 'nuclear',
      check: () => _n(T.STEAMTURBINE) >= 12 },
    { id: 'breeder',             label: 'Breeder',             icon: '🧬', desc: 'Recover plutonium from spent fuel.', cat: 'nuclear',
      check: () => _v(() => ReprocessingSystem.getTotalPlutonium()) > 0 },
    { id: 'handle_with_care',    label: 'Handle With Care',    icon: '☢', desc: 'Get an Advanced Nuclear Reactor generating.', cat: 'nuclear',
      check: () => _generating(T.ADVREACTOR) },
    { id: 'drone_fleet',         label: 'Drone Fleet',         icon: '🚁', desc: 'Build a Drone Port.', cat: 'nuclear',
      check: () => _has(T.DRONEPORT) },
    { id: 'close_call',          label: 'Close Call',          icon: '😰', desc: 'Bring a critical generator back from the brink.', cat: 'nuclear',
      check: () => _closeCall },
    { id: 'nerves_of_steel',     label: 'Nerves of Steel',     icon: '🫀', desc: 'Pull an Advanced Reactor back from meltdown.', cat: 'nuclear',
      check: () => _closeCallAdv },

    // ── Fusion ──
    { id: 'q_above_one',         label: 'Q > 1',               icon: '⚛', desc: 'Achieve fusion at the Fusion Research Facility.', cat: 'fusion',
      check: () => typeof FusionResearch !== 'undefined' && FusionResearch.isComplete() },
    { id: 'splitting_water',     label: 'Splitting Water',     icon: '💧', desc: 'Produce your first hydrogen.', cat: 'fusion',
      check: () => _v(() => ElectrolyzerSystem.getTotalHydrogenProduced()) > 0 },
    { id: 'lithium_rush',        label: 'Lithium Rush',        icon: '🪨', desc: 'Mine 1,000 lithium ore.', cat: 'fusion',
      check: () => _v(() => LithiumSystem.getTotalMined()) >= 1000 },
    { id: 'heavy_water',         label: 'Heavy Water',         icon: '🫧', desc: 'Produce your first deuterium.', cat: 'fusion',
      check: () => _v(() => IsotopicWashTowerSystem.getTotalDeuteriumProduced()) > 0 },
    { id: 'breeding_program',    label: 'Breeding Program',    icon: '🧫', desc: 'Breed your first tritium.', cat: 'fusion',
      check: () => _v(() => TritiumBreederSystem.getTotalTritiumBred()) > 0 },
    { id: 'star_fuel',           label: 'Star Fuel',           icon: '✨', desc: 'Make 250 fusion fuel pellets.', cat: 'fusion',
      check: () => _v(() => FusionFuelPlantSystem.getTotalPlasmaProduced()) >= 250 },   // was 1,000 before the 75% pellet-rate cut
    { id: 'bottled_star',        label: 'A Star in a Bottle',  icon: '🌟', desc: 'Burn fuel pellets in a Fusion Reactor.', cat: 'fusion',
      check: () => _v(() => HulkingFusionReactorSystem.getTotalPelletsBurned()) > 0 },
    { id: 'moon_dust',           label: 'Moon Dust',           icon: '🌙', desc: 'Separate your first helium-3.', cat: 'fusion',
      check: () => _v(() => He3SeparatorSystem.getTotalHe3Produced()) > 0 },
    { id: 'direct_conversion',   label: 'Direct Conversion',   icon: '💫', desc: 'Get power out of the MHD Decelerator Ring.', cat: 'fusion',
      check: () => _v(() => MHDDeceleratorRingSystem.getTotalPower()) > 0 },
    { id: 'optimised',           label: 'Fully Optimised',     icon: '📉', desc: 'Let the Fusion Research Facility cut the fusion chain\'s goals by the full 20%.', cat: 'fusion',
      check: () => typeof FusionResearch !== 'undefined' && FusionResearch.goalScale() <= 0.8001 },

    // ── City & customers ──
    { id: 'open_for_business',   label: 'Open for Business',   icon: '🏪', desc: 'Connect your first commercial building.', cat: 'city',
      check: () => _has(T.COMMERCIAL) },
    { id: 'heavy_load',          label: 'Heavy Load',          icon: '🏭', desc: 'Connect your first industrial customer.', cat: 'city',
      check: () => _has(T.INDUSTRIAL) },
    { id: 'suburbia',            label: 'Suburbia',            icon: '🏡', desc: 'Power 100 houses.', cat: 'city',
      check: () => _n(T.HOUSE) >= 100 },
    { id: 'megalopolis',         label: 'Megalopolis',         icon: '🌃', desc: 'Reach a population of 5,000.', cat: 'city',
      check: () => _totalPopulation() >= 5000 },
    { id: 'park_life',           label: 'Park Life',           icon: '🌲', desc: 'Have 10 parks in your city.', cat: 'city',
      check: () => typeof PARK_TYPES !== 'undefined' && _n(...PARK_TYPES) >= 10 },
    { id: 'home_comforts',       label: 'Home Comforts',       icon: '🛋', desc: 'Fulfil 25 amenity requests.', cat: 'city',
      check: () => _v(() => AmenityRequestSystem.getTotalFulfilled()) >= 25 },
    { id: 'honour_roll',         label: 'Honour Roll',         icon: '🅰', desc: 'Reach a City Score grade of A.', cat: 'city',
      check: () => typeof CityScore !== 'undefined' && (CityScore.grade === 'A' || CityScore.grade === 'S') },

    // ── Government & money ──
    { id: 'public_servant',      label: 'Public Servant',      icon: '🏛', desc: 'Power every civic building: Town Hall, Civic Center, Courthouse, EMS, Hospital, University and Transport Hub.', cat: 'gov',
      check: () => CIVIC_SET.every(t => _poweredOfType(t)) },
    { id: 'national_stage',      label: 'The National Stage',  icon: '🏛', desc: 'Have the National Government Center arrive.', cat: 'gov',
      check: () => _has(T.NATIONALGOV) },
    { id: 'jet_set',             label: 'Jet Set',             icon: '✈', desc: 'Power the International Airport.', cat: 'gov',
      check: () => _poweredOfType(T.AIRPORT) },
    { id: 'defence_contract',    label: 'Defence Contract',    icon: '🎖', desc: 'Power the Military Base.', cat: 'gov',
      check: () => _poweredOfType(T.MILITARYBASE) },
    { id: 'eight_figures',       label: 'Eight Figures',       icon: '🤑', desc: 'Reach a $10,000,000 balance.', cat: 'gov',
      check: () => _ownBalance() >= 10000000 },

    // ── Weather & disasters ──
    { id: 'struck',              label: 'Struck',              icon: '⚡', desc: 'Have lightning hit something of yours.', cat: 'weather',
      check: () => _v(() => LightningDamageSystem.getTotalStrikes()) > 0 },
    { id: 'storm_spire',         label: 'Storm Spire',         icon: '🌩', desc: 'Build a Lightning Rod MK3.', cat: 'weather',
      check: () => _has(T.LIGHTNINGROD3) },

    // ── Logistics ──
    { id: 'keep_on_truckin',     label: "Keep On Truckin'",    icon: '🚚', desc: 'Own 5 trucks.', cat: 'logistics',
      check: () => _n(T.TRUCK) >= 5 },
    { id: 'jump_cut',            label: 'Jump Cut',            icon: '🗺', desc: 'Unlock Fast Travel.', cat: 'logistics',
      check: () => Progression.isUnlocked(T.FASTTRAVEL) },
    { id: 'copy_paste',          label: 'Copy & Paste',        icon: '📐', desc: 'Unlock Blueprints.', cat: 'logistics',
      check: () => Progression.isUnlocked(T.BLUEPRINT) },

    // ── Operation Hyperion ──
    { id: 'meridian_brief',      label: 'The Commission',      icon: '✉', desc: "Accept the Minister of Energy's commission.", cat: 'meridian',
      check: () => _np('briefed') },
    { id: 'meridian_final_day',  label: 'The Final Day',       icon: '🌅', desc: 'Reach Stage V of Operation Hyperion.', cat: 'meridian',
      check: () => _np('stage4') },
    { id: 'net_exporter',        label: 'Net Exporter',        icon: '📤', desc: 'Send 1,000 MWh to the nation through Hyperion Station.', cat: 'meridian',
      check: () => typeof NationalProject !== 'undefined' && NationalProject.exported() >= 1000 },

    // ── Legendary ──
    { id: 'centennial',          label: 'Centennial',          icon: '💯', desc: 'Keep the grid running for 100 in-game days.', cat: 'legend',
      check: () => DayNight.day() >= 100 },
    { id: 'fast_track',          label: 'Fast Track',          icon: '⏱', desc: 'Complete Operation Hyperion within 60 in-game days.', cat: 'legend',
      check: () => _np('victory') && DayNight.day() <= 60 },
    { id: 'green_nation',        label: 'Green Nation',        icon: '🌏', desc: 'Complete Operation Hyperion, then run 30 MW with no coal or oil generators on the map.', cat: 'legend',
      check: () => _np('victory') && _gen() >= 30000 && _fossil() === 0 },
    { id: 'completionist',       label: 'Completionist',       icon: '👑', desc: 'Unlock every other achievement.',
      check: () => unlocked.size === DEFS.length - 1, cat: 'legend' },
  ];

  // Panel sections, in the order a run meets them. The original list's
  // entries are sorted in by id; newer ones carry their own `cat`.
  const CATS = [
    ['start', 'Getting Started'], ['grid', 'Power & Grid'], ['green', 'Renewables'], ['fossil', 'Fossil & Mining'], ['air', 'Air Quality'],
    ['nuclear', 'Nuclear'], ['fusion', 'Fusion'], ['city', 'City & Customers'], ['gov', 'Government & Money'],
    ['weather', 'Weather & Disasters'], ['logistics', 'Logistics'], ['fishing', 'Fishing'], ['meridian', 'Operation Hyperion'], ['legend', 'Legendary'],
  ];
  const CAT_OF = {
    first_light: 'start', grid_up: 'start', first_customer: 'start', first_profit: 'start',
    mega_watt: 'grid', gigawatt_grid: 'grid', long_reach: 'grid',
    renewable_trifecta: 'green', hydro_power: 'green',
    coal_baron: 'fossil', oil_tycoon: 'fossil',     atomic_age: 'nuclear',
    boomtown: 'city', big_city: 'city', metropolis: 'city', urban_planner: 'city', happy_customers: 'city',
    top_marks: 'city', green_space: 'city',
    six_figures: 'gov', watts_a_million: 'gov', debt_recovery: 'gov', debt_free: 'gov', mayors_favorite: 'gov',
        hook_line_sinker: 'fishing', compleat_angler: 'fishing', fossil_fuel: 'fishing', nuclear_bait: 'fishing',
    meridian_file: 'meridian', meridian_ground: 'meridian', meridian_line: 'meridian', grid_complete: 'meridian',
    renaissance_engineer: 'legend', old_faithful: 'legend',
  };
  for (const d of DEFS) if (!d.cat) d.cat = CAT_OF[d.id] || 'legend';

  let _achStack = null;
  function showAchievementToast(def) {
    if (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.hasEnded()) return;
    if (typeof MessageLog !== 'undefined') MessageLog.add(`🏆 Achievement: ${def.label}`, '#ffd460');
    if (!document.getElementById('ach-toast-css')) {
      const st = document.createElement('style');
      st.id = 'ach-toast-css';
      st.textContent = `
        #ach-toast-stack{position:fixed;top:70px;right:18px;z-index:9000;display:flex;flex-direction:column;gap:10px;pointer-events:none;align-items:flex-end;}
        .ach-toast{position:relative;overflow:hidden;width:320px;display:flex;gap:14px;align-items:center;padding:12px 16px;border-radius:6px;
          background:linear-gradient(100deg,#2a2006,#120d02 70%);border:1px solid #c9a03a;box-shadow:0 0 22px rgba(255,200,70,0.35),0 6px 18px rgba(0,0,0,0.6);
          transform:translateX(120%);opacity:0;transition:transform .5s cubic-bezier(.2,1.2,.3,1),opacity .4s;}
        .ach-toast.in{transform:none;opacity:1;}
        .ach-toast.out{transform:translateX(120%);opacity:0;transition:transform .5s ease-in,opacity .5s;}
        .ach-toast::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,240,170,0.35) 50%,transparent 65%);transform:translateX(-120%);}
        .ach-toast.in::after{animation:achShine 1.1s .35s ease-out forwards;}
        @keyframes achShine{to{transform:translateX(120%);}}
        .ach-toast .ico{flex:none;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;
          background:radial-gradient(circle,#4a3810,#1a1402);border:2px solid #ffd460;}
        .ach-toast.in .ico{animation:achPop .7s .15s cubic-bezier(.2,1.8,.4,1) both;}
        @keyframes achPop{from{transform:scale(0) rotate(-90deg);}to{transform:none;}}
        .ach-toast .kick{font-size:9px;letter-spacing:.24em;color:#f0c040;font-weight:700;}
        .ach-toast .ttl{font-size:15px;color:#fff3c8;font-weight:700;margin:2px 0;}
        .ach-toast .dsc{font-size:11px;color:#c8b078;line-height:1.35;}
        .ach-toast .bar{position:absolute;left:0;bottom:0;height:2px;width:100%;background:#ffd460;transform-origin:left;animation:achBar 6s linear forwards;}
        @keyframes achBar{to{transform:scaleX(0);}}`;
      document.head.appendChild(st);
    }
    if (!_achStack) {
      _achStack = document.createElement('div');
      _achStack.id = 'ach-toast-stack';
      document.body.appendChild(_achStack);
    }
    const el = document.createElement('div');
    el.className = 'ach-toast';
    el.innerHTML = `<div class="ico">${def.icon}</div><div><div class="kick">ACHIEVEMENT UNLOCKED</div><div class="ttl"></div><div class="dsc"></div></div><div class="bar"></div>`;
    el.querySelector('.ttl').textContent = def.label;
    el.querySelector('.dsc').textContent = def.desc;
    _achStack.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    setTimeout(() => { el.classList.replace('in', 'out'); setTimeout(() => el.remove(), 600); }, 6000);
  }

  function renderPanel() {
    const body = document.getElementById('ach-body');
    if (!body) return;
    const countEl = document.getElementById('ach-count');
    if (countEl) countEl.textContent = `${unlocked.size} / ${DEFS.length}`;
    const card = d => {
      const done = unlocked.has(d.id);
      return `<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 4px;border-bottom:1px solid rgba(255,255,255,0.05);opacity:${done ? 1 : 0.4};">
        <div style="font-size:20px;line-height:1;">${d.icon}</div>
        <div style="flex:1;">
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${done ? '#ffd460' : 'var(--text-dim)'};font-weight:600;">${d.label}</div>
          <div style="font-size:11px;color:var(--text-dim);margin-top:2px;">${d.desc}</div>
        </div>
        <div style="font-size:10px;color:${done ? '#40c060' : 'var(--text-dim)'};white-space:nowrap;padding-top:2px;">${done ? '✓ DONE' : 'LOCKED'}</div>
      </div>`;
    };
    body.innerHTML = CATS.map(([key, title]) => {
      const list = DEFS.filter(d => d.cat === key);
      if (!list.length) return '';
      const got = list.filter(d => unlocked.has(d.id)).length;
      return `<div style="display:flex;justify-content:space-between;align-items:baseline;margin:14px 4px 4px;padding-bottom:4px;border-bottom:1px solid rgba(240,200,80,0.25);">
          <span style="font-size:10px;letter-spacing:0.18em;text-transform:uppercase;color:#f0c040;font-weight:700;">${title}</span>
          <span style="font-size:10px;color:${got === list.length ? '#40c060' : 'var(--text-dim)'};">${got} / ${list.length}</span>
        </div>` + list.map(card).join('');
    }).join('');
  }

  return {
    count() { return unlocked.size; },
    tick(dt) {
      // Not in a scenario: those start with a town standing and half the
      // game unlocked, so a dozen achievements would land in the first second
      // for things the player never did. Nothing is tracked or awarded there.
      if (typeof ScenarioSystem !== 'undefined' && ScenarioSystem.active()) return;
      // Track distinct weather events for the storm achievement purely by
      // watching the active-event edge — no changes needed in weather_events.js.
      const activeEv = (typeof WeatherEventSystem !== 'undefined') ? WeatherEventSystem.getActiveEvent() : null;
      if (!activeEv && _prevWeatherActive) _stormWitnessCount++;
      if (!activeEv && _prevWeatherType === 'smog') _smogSurvived = true;
      _prevWeatherActive = !!activeEv;
      _prevWeatherType = activeEv ? activeEv.type : null;

      if (Economy.balance < 0) _everInDebt = true;
      if ((typeof GovernmentSystem !== 'undefined') && GovernmentSystem.getLoans().length > 0) _everHadLoan = true;

      // Track a running streak of in-game seconds spent at ≥90% Mayor
      // approval — resets the moment approval dips below the threshold.
      const approvalOk = (typeof GovernmentSystem !== 'undefined') && GovernmentSystem.getApproval() >= 90;
      if (approvalOk) _approvalStreakSecs += (dt || 0);
      else _approvalStreakSecs = 0;

      // Close calls: a generator that went critical and came back without
      // going up. Once a second is plenty.
      _tickN++;
      if (_tickN % 10 === 0) {
        for (const t of [T.COALGENERATOR, T.FUELGEN, T.NUCLEARREACTOR, T.ADVREACTOR]) {
          const live = EntityRegistry.getByType(t);
          for (const e of live) if (e._meltdown > 0) _critSeen.add(e);
        }
        for (const e of _critSeen) {
          const alive = EntityRegistry.getByType(e.type).has(e);
          if (!alive) { _critSeen.delete(e); continue; }          // it went up (or was removed)
          if (!(e._meltdown > 0)) {
            _critSeen.delete(e);
            _closeCall = true;
            if (e.type === T.ADVREACTOR) _closeCallAdv = true;
          }
        }
      }

      for (const def of DEFS) {
        if (unlocked.has(def.id)) continue;
        let met = false;
        try { met = def.check(); } catch (e) { met = false; }
        if (met) {
          unlocked.add(def.id);
          window.GridworksDesktop?.steam?.unlock(def.id).catch(() => {});
          showAchievementToast(def);
          SFX.achievement();
          const btn = document.getElementById('btn-achievements');
          if (btn) btn.classList.add('has-new');
          renderPanel();
        }
      }
    },
    renderPanel,
    serialise() { return [...unlocked]; },
    // `scenario`: the save is a scenario's. It holds no achievements (any
    // in an older scenario save were awarded by mistake, and are dropped
    // rather than loaded or sent on to Steam).
    loadState(ids, scenario = false) {
      unlocked.clear();
      if (!scenario) {
        (ids || []).forEach(id => unlocked.add(id));
        window.GridworksDesktop?.steam?.sync([...unlocked]).catch(() => {});
      }
      renderPanel();
    },
    loadMisc(data) {
      if (!data) return;
      _stormWitnessCount  = data.stormWitnessCount || 0;
      _everInDebt         = !!data.everInDebt;
      _everHadLoan        = !!data.everHadLoan;
      _approvalStreakSecs = data.approvalStreakSecs || 0;
      _closeCall          = !!data.closeCall;
      _closeCallAdv       = !!data.closeCallAdv;
      _smogSurvived       = !!data.smogSurvived;
    },
    saveMisc() { return { stormWitnessCount: _stormWitnessCount, everInDebt: _everInDebt, everHadLoan: _everHadLoan, approvalStreakSecs: _approvalStreakSecs, closeCall: _closeCall, closeCallAdv: _closeCallAdv, smogSurvived: _smogSurvived }; },
  };
})();
