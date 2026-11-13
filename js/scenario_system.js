/* ═══════════════════════════════════════════════════════════════════
   SCENARIOS  (the demo and the full game share this file)
   ─────────
   Jump-in games picked from the main menu's GAME MODES screen (which this
   file also draws: Scenarios or New Game). Each one is a real, small world
   with a town already standing on it: residential, commercial and
   industrial zones full of ordinary customers, none of them powered. The
   tools for one part of the later game are unlocked, the resources for it
   are in the ground beside the town, and there is a list of objectives:
   get a coal chain burning, an oil field refining, three streams dammed,
   two reactors steaming, a fusion ring feeding a metropolis.

   How one starts: picking a scenario writes its id to sessionStorage and
   reloads, as a new game does. MenuSystem finds it on the clean boot
   (takePending), makes an ordinary new world on the Small map, and calls
   begin(). begin() then builds the scenario onto that world (_build):
     • clears the natural lakes and rivers out of the area it will use and
       lays down the scenario's own (a lake to pump from, streams to dam);
     • moves the town's customers in through HouseRequestSystem
       .scenarioPlace(), the same accept() a player's click runs, so zones,
       fees, demand and sprites are the game's own;
     • puts the deposits in the ground of the work area, and nothing else:
       no machine, store or wire is ever preset;
     • hands over the tools and the budget, and sets the clock to morning.
   Everything is laid out in tiles from City Hall's centre, so it lands
   the same on any generated world.

   While a scenario runs, GameLoop freezes the systems that grow a city
   (research, new customer requests, satisfaction, weather events, the
   mayor): the town is handed over ready made. Power, the economy and every
   production chain run as they do in the full game.

   An optional walkthrough (GUIDE) runs through TutorialSystem: the game's
   own tutorial cards, asking first, one step at a time, with the item to
   use glowing in the build bar.

   Some scenarios are played under conditions of their own (`climate`): a
   fixed season, a sky, and a programme of real weather events on the
   scenario's clock. See Climate, below.

   Objectives are a ContractRequirements set evaluated over the scenario's
   area (that layer knows nothing about contracts; see its header), shown
   in this file's own panel. Saving is the game's own: a scenario is a
   world like any other, with this file's state (serialise) riding in the
   save and the slot tagged with the scenario id, which is how the picker
   offers RESUME. Best medals are kept apart, in localStorage.
   ═══════════════════════════════════════════════════════════════════ */
const ScenarioSystem = (() => {

  // The same screens serve the demo and the full game; only a few lines of
  // wording differ (the demo sells the full game, the full game does not).
  const DEMO = typeof GW_DEMO !== 'undefined' && !!GW_DEMO.on;

  const PENDING_KEY = 'gw_scenario';        // sessionStorage: scenario to start on the next boot
  const OPEN_KEY    = 'gw_open_scenarios';  // sessionStorage: reopen the picker on the next boot
  const BEST_KEY    = 'gw_scenario_best';   // localStorage: { id: { medal, spent } } (older: { medal, hours })

  // ── Layout ───────────────────────────────────────────────────────
  // Tiles from City Hall's centre. The town stands to the east in three
  // stacked zones; the work area, with whatever is in the ground, is the
  // open country to the west; City Hall sits between them and needs power
  // like everything else. The town's zones are different sizes and shapes
  // in every scenario (_layoutTown).
  const AREA = { x0: -175, y0: -78, x1: 150, y1: 78 };   // everything a scenario touches
  const WORK = { x0: -94,  y0: -42, x1: -30, y1: 42 };   // cleared of trees and water (a scenario may ask for more: `work`)
  const TOWN = { x: 30, width: 104 };                    // where the town starts, and how far east it may run
  const START_HOUR = 8;

  // What a scenario can put in the work area. Coordinates are tiles from
  // the work area's top-left corner. The deposit props are the ones the
  // full game's contract sites and surveys use, so mines, pump jacks and
  // wells treat them exactly as surveyed deposits. Only what is in the
  // ground is ever placed: every machine, store and wire is the player's
  // to build.
  const _heReserve = () => (typeof oreReserveFor === 'function'
    ? oreReserveFor(4, typeof HELIUM_WELL_RATE !== 'undefined' ? HELIUM_WELL_RATE : 2) : 200000);
  const GROUND = {
    coal:   (x, y) => ({ type: T.COALDEPOSIT, x, y, props: { width: 3, height: 2, _revealed: true, _hasMine: false, coalAmount: 105000, coalMax: 105000, _outputVariance: 1 } }),
    oil:    (x, y) => ({ type: T.OILDEPOSIT,  x, y, props: { width: 4, height: 4, _revealed: true, _oilPhase: 0, _totalUnits: 30000, _crudeBuffer: 0 } }),
    geo:    (x, y) => ({ type: T.GEODEPOSIT,  x, y, props: { _revealed: true, _hasWell: false } }),
    helium: (x, y) => ({ type: T.HELIUMDEPOSIT, x, y, props: { width: 4, height: 4, _revealed: true, _tierLabel: 'Large Helium Gas Field',
                                                               _oreAmount: _heReserve(), _oreMax: _heReserve(), _heliumPhase: 0 } }),
    // Ore bodies, as a survey leaves them (mining_systems.js).
    uranium: (x, y) => ({ type: T.URANIUMDEPOSIT, x, y, ore: 3, props: { width: 3, height: 3, _tierLabel: 'Medium Uranium Deposit', _uraniumPhase: 1.3 } }),
    sulfur:  (x, y) => ({ type: T.SULFURDEPOSIT,  x, y, ore: 3, props: { width: 3, height: 3, _tierLabel: 'Medium Sulfur Deposit', _sulfurPhase: 2.1 } }),
    rareearth: (x, y) => ({ type: T.RAREEARTHDEPOSIT, x, y, ore: 3, props: { width: 3, height: 3, _tierLabel: 'Medium Rare Earth Deposit', _rareEarthPhase: 0.7 } }),
    // The one thing a scenario ever leaves standing that is not in the
    // ground: a client's Storage Container of D-T pellets, as on a contract
    // site's fusion job. It is the client's (it cannot be moved or sold) and
    // is kept topped up (SolidStorageSystem.tick), so the job is the reactor
    // and what is built around it, not the fuel.
    pellets: (x, y) => ({ type: T.SOLIDSTORAGE, x, y, props: { _solidType: 'pellets', _stored: 1000, _pelletMode: 'dt', _clientOwned: true } }),
    lake:   (x, y, w, h) => ({ water: true, x, y, w, h }),
    // A stream: water with a direction of flow, which is what a dam works from.
    stream: (x, y, w, h, dc, dr) => ({ water: true, x, y, w, h, dc, dr }),
  };

  // ── Tool sets ────────────────────────────────────────────────────
  // What a scenario unlocks. `GRID` is the wiring and storage every job
  // needs; `STARTER` is simple generation, because every big plant here has
  // to be powered before it can make power.
  const _t = (...keys) => keys.map(k => T[k]).filter(Boolean);
  const GRID    = _t('WIRE', 'POLE', 'POWERTOWER', 'PROTECTOR', 'PROTECTOR2', 'SUBSTATION', 'SUBSTATION2',
                     'BATTERY', 'MONITOR', 'LAMP', 'LIGHTNINGROD', 'LIGHTNINGROD2');
  const STARTER = _t('WIND', 'WIND2', 'SOLAR', 'SOLAR2');
  const PIPES   = _t('WATEREXTRACTOR', 'PIPE', 'UNDERGNDPIPE');
  const BELTS   = _t('CONVEYOR', 'UNDERGNDCONVEYOR', 'CONVEYORSPLITTER');
  const BIG     = _t('WIND3', 'SUBSTATION3', 'PROTECTOR3', 'LIGHTNINGROD3');
  const COAL    = [..._t('COALMINE', 'COALGENERATOR', 'GOVERNOR'), ...BELTS, ...PIPES];
  const OIL     = [..._t('PUMPJACK', 'OILSTORAGE', 'REFINERY', 'FUELGEN', 'GOVERNOR'), ...PIPES];
  const HYDRO   = _t('DAM', 'HYDROTURBINE', 'SHAFT', 'HYDROGENERATOR');
  const GEO     = _t('GEOWELL', 'GEOTURBINE');
  const WINDS   = _t('WIND', 'WIND2');
  const SOLARS  = _t('SOLAR', 'SOLAR2');
  const NUCLEAR = [..._t('URANIUMMINE', 'SULFURMINE', 'CHEMICALPLANT', 'FUELPLANT', 'NUCLEARREACTOR', 'COOLINGTOWER', 'STEAMTURBINE'), ...BELTS, ...PIPES];
  const FUSION  = [..._t('HELIUMWELL', 'HE3SEPARATOR', 'ELECTROLYZER', 'ATMOSCOLLECTOR', 'HABERBOSCH', 'WASHTOWER', 'FUSIONFUELPLANT', 'GASSTORAGE',
                         'CRYOPLANT', 'HULKINGFUSIONREACTOR', 'MHDRING', 'GEOWELL', 'GEOTURBINE'), ...BELTS, ...PIPES];
  const STORAGE = _t('SUBSTATION4', 'SUBSTATION5');
  // Field Strength: a Fusion Reactor burning the client's D-T into steam, and
  // the Field Core chain to boost it (field_core_systems.js, rare_earth_systems.js).
  const FIELDCORE = [..._t('HELIUMWELL', 'CRYOPLANT', 'HULKINGFUSIONREACTOR', 'STEAMTURBINE2',
                           'SULFURMINE', 'CHEMICALPLANT', 'ELECTROLYZER', 'ATMOSCOLLECTOR', 'GASSTORAGE', 'SOLIDSTORAGE',
                           'RAREEARTHMINE', 'LEACHPLANT', 'SCMILL', 'COREWORKS', 'DRONEPORT', 'NUCLEARWASTE'), ...BELTS, ...PIPES];

  // Objectives the requirement kinds cannot say on their own, asked of the
  // systems directly (ContractRequirements 'check').
  const _clock = sec => {
    const d = Math.floor(sec / (DayNight.secondsPerGameHour() * 24)) + 1;
    const h = (sec / DayNight.secondsPerGameHour()) % 24, hh = Math.floor(h + 1e-6), mm = String(Math.floor(((h + 1e-6) % 1) * 60)).padStart(2, '0');
    return `day ${d}, ${String(hh).padStart(2, '0')}:${mm}`;
  };
  const LAUNCHED = {
    kind: 'check', latch: true, doneText: 'Mission 1 is away',
    label: 'Fly Mission 1: keep the Launch Complex powered from propellant loading to liftoff (peak 12.6 MW)',
    test() {
      if (typeof LaunchSystem === 'undefined') return { pass: false, progress: 0, detail: '' };
      if (LaunchSystem.flown() >= 1) return { pass: true, progress: 1, detail: 'Mission 1 is away' };
      const n = LaunchSystem.getNext();
      if (!n) return { pass: false, progress: 0, detail: 'no launch scheduled' };
      const left = (n.at - DayNight.getElapsed()) / DayNight.secondsPerGameHour();
      if (n.fuelling) return { pass: false, progress: 0.6, detail: `loading propellant · liftoff in ${left >= 1 ? `${Math.floor(left)}h ${Math.floor((left % 1) * 60)}m` : `${Math.max(0, Math.ceil(left * DayNight.secondsPerGameHour()))}s`}` };
      return { pass: false, progress: 0, detail: `window ${_clock(n.at)}` };
    },
  };
  const CORES = 2;
  const CORED = {
    kind: 'check', latch: true, doneText: `${CORES} live Field Cores reached the reactor`,
    label: `Run the Fusion Reactor with ${CORES} live Field Cores in it`,
    test() {
      let best = 0;
      if (typeof FieldCoreSystem !== 'undefined')
        for (const e of EntityRegistry.getByType(T.HULKINGFUSIONREACTOR)) if (e._generating) best = Math.max(best, FieldCoreSystem.liveCount(e));
      return { pass: best >= CORES, progress: best / CORES, detail: `${Math.min(best, CORES)} / ${CORES} live` };
    },
  };

  // ── The scenarios ────────────────────────────────────────────────
  // town:    the customers, as [key, count] per zone. Keys are the pools'
  //          subtypes (house_request_system.js); for homes they may also be
  //          a wealth tier ('budget', 'mid', 'premium', 'luxury').
  // ground:  what is in the work area (GROUND, above).
  // goals:   the plant the objectives ask for, as requirement specs
  //          (contract_requirements.js). Powering everything, protecting
  //          the lines and the hold are added to every scenario.
  // holdH:   hours everything must stay powered without a break.
  // medals:  the most the plant standing at sign-off may be worth (what the
  //          player built, at what they paid) for gold and silver; anything
  //          dearer is bronze. Money, not time: building is allowed while
  //          paused, so a clock could be beaten by pausing, and the balance
  //          could be by waiting while customers pay. Set ~5% and ~30% over
  //          the least plant that meets the objectives.
  // climate: the conditions it is played under, if it has its own (see
  //          Climate, below): a fixed season, the hour it opens at, the
  //          sky, and a programme of weather that comes round on its clock.
  const G = GROUND;
  const place   = (type, count) => ({ kind: 'place',   type, count, powered: true });
  const install = (type, count) => ({ kind: 'place',   type, count, powered: false });
  const running = (type, count) => ({ kind: 'running', type, count });
  const SCENARIOS = [
    {
      id: 'coal', accent: '#ffb454',
      title: 'Coal Country', kicker: 'Scenario 1 · Coal', place: 'Harrow Vale',
      tagline: 'Sink mines, lay belts and bring a dark mill town back on.',
      win: 'Harrow Vale is running on its own coal: the mills are turning and the streets are lit.',
      blurb: 'The foundry, the mills and four streets of houses, and not a light on in any of them since the old plant was condemned. There is coal under the fell west of City Hall and water in the tarn beside it. Dig it, burn it and bring the valley back on.',
      level: 'Medium', mins: '25–40 min',
      town: {
        house:      [['budget', 10], ['cornerstore', 1], ['mid', 8], ['duplex', 1], ['premium', 4], ['cornerstore', 1], ['townhouse', 1]],
        commercial: [['grocery', 1], ['bakery', 1], ['cafe', 2], ['clinic', 1], ['restaurant', 1], ['pharmacy', 1], ['savingsloan', 1], ['motel', 1]],
        industrial: [['steelfoundry', 1], ['textilemill', 2], ['factory', 2]],
      },
      ground: [G.coal(8, 12), G.coal(8, 34), G.coal(8, 56), G.lake(30, 56, 26, 18)],
      goals: [place(T.COALMINE, 3), place(T.WATEREXTRACTOR, 3), running(T.COALGENERATOR, 6)],
      holdH: 6,
      tools: [...GRID, ...STARTER, ...COAL],
      medals: { gold: 625000, silver: 775000 },
      budget: 800000,
      steps: [
        ['Get something turning', 'Mines and pumps need power before they can make anything. Put a few Wind Turbines up in the work area west of City Hall and wire them together; they only have to carry the first mine and extractor.'],
        ['Dig', 'Place a Coal Mine on each of the three coal seams and wire them in.'],
        ['Burn', 'Place Coal Power Generators nearby and run Conveyor Belts from each mine\'s output to the generators. One mine feeds two generators.'],
        ['Cool', 'Put Water Extractors on the tarn (R rotates the outlet) and run Pipes to each generator\'s water inlet. One extractor supplies two generators.'],
        ['Deliver', 'Run lines east to City Hall and into all three zones. A bare wire network carries 85 kW, so add Surge Protectors or it will burn out.'],
      ],
    },
    {
      id: 'oil', accent: '#e8c860',
      title: 'Black Gold', kicker: 'Scenario 2 · Oil', place: 'Port Sable',
      tagline: 'Pump crude, refine it and burn it to power a harbour town.',
      win: 'Port Sable runs on its own oil, from the wellhead to the harbour lights.',
      blurb: 'The hotel is full, the cold store is humming and the whole town is running off one coughing diesel set. Everybody here knows what is under the flats west of City Hall. Nobody has ever put a pump on it.',
      level: 'Medium', mins: '30–45 min',
      town: {
        house:      [['budget', 8], ['cornerstore', 1], ['mid', 8], ['premium', 2]],
        commercial: [['marina', 1], ['motel', 1], ['restaurant', 2], ['grocery', 1], ['truckstop', 2], ['fastfood', 1], ['bakery', 1], ['cafe', 1], ['library', 1]],
        industrial: [['coldstorage', 1], ['bottling', 1]],
      },
      ground: [G.oil(8, 10), G.oil(8, 30), G.oil(8, 50), G.oil(8, 70)],
      goals: [place(T.PUMPJACK, 4), install(T.OILSTORAGE, 4), place(T.REFINERY, 4), running(T.FUELGEN, 4)],
      holdH: 6,
      tools: [...GRID, ...STARTER, ...OIL],
      medals: { gold: 950000, silver: 1200000 },
      budget: 1100000,
      steps: [
        ['Get something turning', 'A Fuel Generator cannot start itself, and pump jacks and refineries draw power. Build a few Wind Turbines or Solar Panels in the work area west of City Hall first and wire them together.'],
        ['Pump', 'Place a Pump Jack on each of the four oil deposits and wire it in.'],
        ['Store and refine', 'Pipe each Pump Jack into a Liquid Storage Tank, and the tank on into an Oil Refinery. The refinery turns crude into fuel oil.'],
        ['Burn', 'Pipe each refinery\'s fuel outlet into a Fuel Power Generator and wire the generator to your starter grid. Nothing lights until the whole line is joined.'],
        ['Deliver', 'Run lines east to City Hall and into all three zones, and protect them with Surge Protectors: a bare wire network carries only 85 kW.'],
      ],
    },
    {
      id: 'hydro', accent: '#5fd8ff',
      title: 'White Water', kicker: 'Scenario 3 · Hydro', place: 'Stonegate',
      tagline: 'Dam three mountain streams and run a mill town on water.',
      win: 'Three streams dammed and Stonegate runs on water.',
      blurb: 'Three streams come down off the hill west of City Hall and every one of them goes to waste. The mills have burned coal for a century. A turbine behind each dam and a generator on the bank, and the town runs on water.',
      level: 'Medium', mins: '30–45 min',
      town: {
        house:      [['budget', 8], ['cornerstore', 1], ['mid', 10], ['townhouse', 1], ['premium', 4], ['cornerstore', 1]],
        commercial: [['clinic', 1], ['bakery', 1], ['cafe', 2], ['grocery', 1], ['library', 1], ['bank', 1], ['restaurant', 1], ['gym', 1], ['bowling', 1]],
        industrial: [['machineshop', 1], ['textilemill', 2], ['sawmill', 1], ['brickworks', 1], ['glassworks', 1]],
      },
      ground: [
        G.stream(4, 8, 28, 6, 1, 0),  G.lake(29, 4, 20, 14),
        G.stream(4, 36, 28, 6, 1, 0), G.lake(29, 32, 20, 14),
        G.stream(4, 64, 28, 6, 1, 0), G.lake(29, 60, 20, 14),
      ],
      goals: [install(T.DAM, 3), place(T.HYDROTURBINE, 6), running(T.HYDROGENERATOR, 6)],
      holdH: 8,
      tools: [...GRID, ...STARTER, ...BIG, ...HYDRO],
      medals: { gold: 1350000, silver: 1650000 },
      budget: 1500000,
      steps: [
        ['Get something turning', 'Hydro Turbines draw a little power to run. Put up a few Wind Turbines in the work area west of City Hall first and wire them together.'],
        ['Dam', 'Build a Dam across each of the three streams. A reservoir forms behind it.'],
        ['Turbines', 'Place two Hydro Turbines in each reservoir, partly in the water, and wire them in. A turbine makes rotation, not electricity.'],
        ['Shafts and generators', 'Run Drive Shafts in an unbroken line from each turbine to a Hydroelectric Generator on the bank. The generator is what feeds the grid.'],
        ['Deliver', 'Run lines east to City Hall and into all three zones, and protect them with Surge Protectors.'],
      ],
    },
    {
      id: 'nuclear', accent: '#9dff6a',
      title: 'Critical Mass', kicker: 'Scenario 4 · Nuclear', place: 'Dunmere',
      tagline: 'Mine the ore, make the fuel and start two reactors without a meltdown.',
      win: 'From ore in the ground to two reactors steaming: Dunmere is on nuclear power.',
      blurb: 'The stadium, the hospital wing and the convention hall were all built on the promise of a power station nobody finished. The uranium and the sulfur are still in the ground west of City Hall, and the lake is right there. Finish it. Carefully.',
      level: 'Hard', mins: '60–90 min',
      town: {
        house:      [['mid', 8], ['premium', 8], ['apartment', 4], ['condo', 3], ['skyscraper', 1], ['luxury', 4]],
        commercial: [['mall', 1], ['hotel', 1], ['bowling', 1], ['sciencemuseum', 1], ['radiology', 1], ['stadium', 1], ['convention', 1], ['bank', 1], ['restaurant', 2], ['grocery', 1]],
        industrial: [['machineshop', 2], ['datacenter', 1], ['chemical', 1], ['bottling', 1], ['recyclingplant', 1]],
      },
      work: { x0: -124, y0: -42, x1: -30, y1: 42 },
      ground: [G.uranium(8, 10), G.sulfur(8, 34), G.lake(54, 56, 30, 22)],
      goals: [place(T.URANIUMMINE, 1), place(T.SULFURMINE, 1), place(T.CHEMICALPLANT, 1), place(T.FUELPLANT, 1),
              place(T.WATEREXTRACTOR, 4), place(T.COOLINGTOWER, 4), install(T.NUCLEARREACTOR, 2), running(T.STEAMTURBINE, 6)],
      holdH: 8,
      tools: [...GRID, ...STARTER, ...BIG, ...NUCLEAR],
      medals: { gold: 2800000, silver: 3450000 },
      budget: 3000000,
      steps: [
        ['Get something turning', 'Mines, pumps and plants need about 200 kW before a reactor makes anything. Build Wind Turbines (MK3 are the quickest) in the work area west of City Hall and wire them together.'],
        ['Mine', 'Place a Uranium Mine on the uranium deposit and a Sulfur Mine on the sulfur deposit, and wire them in.'],
        ['Acid', 'Build a Chemical Plant. Run a Conveyor Belt of sulfur into it from the Sulfur Mine and pipe in water from a Water Extractor on the lake. It makes sulfuric acid.'],
        ['Fuel rods', 'Build a Fuel Processing Plant. Pipe the acid into it and belt in ore from the Uranium Mine. One plant makes enough fuel rods for both reactors.'],
        ['Cooling first', "Pipe Water Extractors to a Cooling Tower's H2O IN, and the tower into a reactor's COOL IN. Never fuel a reactor that is not cooled."],
        ['Fuel and steam', 'Belt fuel rods from the Fuel Processing Plant to each Nuclear Reactor. A reactor makes steam, not power: pipe it to Steam Turbines, three per reactor, 300 kW each, and wire the turbines in.'],
        ['Deliver', 'Run protected lines east to City Hall and the town. Watch the reactors: if cooling stops, the core heats and a meltdown clock starts. A meltdown levels everything around it.'],
      ],
    },
    {
      id: 'fusion', accent: '#ff7ad9',
      title: 'Star Power', kicker: 'Scenario 5 · Fusion', place: 'Novacrest',
      tagline: 'Build the whole fusion fuel chain and light a metropolis with it.',
      win: 'A star in a bottle, and every tower in Novacrest lit from it.',
      blurb: 'Novacrest was built for a grid that does not exist yet: a supertall, a maglev terminal, a casino in the sky and four megawatts of appetite. The helium fields are west of City Hall; everything else fusion fuel is made of is air and water. Build the star.',
      level: 'Expert', mins: '2–3 hours',
      town: {
        house:      [['arcology', 1], ['verdance', 1], ['evergreen', 1], ['skyscraper', 2], ['luxury', 10], ['mansion', 2]],
        commercial: [['megatower', 1], ['maglev', 1], ['skycasino', 1], ['holoarena', 1], ['quantumx', 1], ['stadium', 1], ['convention', 1], ['thunderridge', 1], ['summit', 1], ['finedining', 1]],
        industrial: [['aicompute', 1], ['geneworks', 1], ['verticalfarm', 1], ['semifab', 1], ['serverfarm', 1]],
      },
      work: { x0: -168, y0: -64, x1: -30, y1: 64 },
      ground: [
        G.helium(8, 8), G.helium(8, 28),
        G.geo(8, 50), G.geo(18, 50), G.geo(28, 50), G.geo(8, 60), G.geo(18, 60), G.geo(28, 60),
        G.coal(8, 76), G.coal(22, 76), G.coal(36, 76), G.oil(8, 92), G.lake(52, 96, 34, 24),
      ],
      goals: [place(T.HELIUMWELL, 2), place(T.HE3SEPARATOR, 1), place(T.ELECTROLYZER, 1), place(T.ATMOSCOLLECTOR, 1),
              place(T.HABERBOSCH, 1), place(T.WASHTOWER, 1), place(T.FUSIONFUELPLANT, 1), place(T.CRYOPLANT, 1),
              place(T.HULKINGFUSIONREACTOR, 1), running(T.MHDRING, 2)],
      holdH: 12,
      tools: [...GRID, ...STARTER, ...BIG, ...FUSION, ...COAL, ...OIL],
      medals: { gold: 9400000, silver: 11600000 },
      budget: 10500000,
      steps: [
        ['Build a starter grid', 'The fuel chain and the reactor need about 600 kW before fusion makes a watt. The work area west of City Hall has geothermal vents, coal and oil: Geothermal Wells and Turbines plus a coal line will carry it.'],
        ['Deuterium', 'Four machines make it. An Electrolyzer splits water into hydrogen; an Atmosphere Collector pulls nitrogen from the air; a Haber-Bosch Complex turns the two into ammonia; an Isotopic Wash Tower uses that ammonia and water to wash out deuterium. Pipe each into the next.'],
        ['Helium-3', 'Place a Helium Well on a helium gas field and pipe it into a Helium-3 Separator.'],
        ['Fuel pellets', 'Build a Fusion Fuel Plant, pipe deuterium into D2 IN and helium-3 into HE-3 IN. Here it makes D-He3 only, the fuel the MHD Rings run on, and freezes the two into pellets.'],
        ['Cold magnets', "Put a second Helium Well on the other gas field and pipe it to a Cryo Plant's HE IN. Place the Fusion Reactor and pipe the Cryo Plant's LHe OUT to its LHe IN: the magnets must reach 4.5 K before it will ignite."],
        ['Ignite', 'Run a Conveyor Belt of pellets from the Fuel Plant to the reactor, and pipe the reactor into two MHD Decelerator Rings. Each turns the plasma straight into 4 MW; wire them in.'],
        ['Deliver', 'Eight megawatts will melt ordinary protection. Put Surge Protectors MK3 on the lines east to City Hall and the city, and connect every building.'],
      ],
    },
    {
      id: 'winter', accent: '#a8dcff',
      title: 'Whiteout', kicker: 'Scenario 6 · Deep winter', place: 'Borealis Station',
      tagline: 'Keep a polar station alive on ground heat and meltwater through a week of blizzards.',
      win: 'Borealis Station rode out the winter on its own heat and water.',
      blurb: 'Nothing reaches us between October and April: no fuel, no parts, no rescue. The labs, the cold store and the wintering crew all depend on a supply that must not fail. There is heat under the ice west of City Hall and two streams off the glacier. Use them, and use them well.',
      level: 'Hard', mins: '45–70 min',
      town: {
        house:      [['budget', 6], ['mid', 8], ['duplex', 1], ['apartment', 2]],
        commercial: [['clinic', 1], ['grocery', 1], ['cafe', 1], ['library', 1], ['motel', 1], ['sciencemuseum', 1]],
        industrial: [['coldstorage', 1], ['machineshop', 1], ['datacenter', 1]],
      },
      ground: [
        G.geo(8, 6), G.geo(18, 6), G.geo(28, 6), G.geo(8, 16), G.geo(18, 16), G.geo(28, 16),
        G.stream(4, 34, 28, 6, 1, 0), G.lake(29, 30, 20, 14),
        G.stream(4, 62, 28, 6, 1, 0), G.lake(29, 58, 20, 14),
      ],
      goals: [running(T.GEOTURBINE, 6), install(T.DAM, 2), place(T.HYDROTURBINE, 4), running(T.HYDROGENERATOR, 4)],
      holdH: 10,
      tools: [...GRID, ...WINDS, ...BIG, ...GEO, ...HYDRO],
      medals: { gold: 1275000, silver: 1600000 },
      budget: 1800000,
      climate: {
        label: 'Midwinter · blizzards', season: 'winter', hour: 11, sky: 0.8,
        grade: { tint: '#a9c8ee', alpha: 0.26 },
        note: 'It is midwinter and it stays midwinter: short days, snow on the ground and every home heating. A <b>blizzard</b> blows through each day (homes draw 30% more, wind turbines run 45% harder), with snowfall and a cold snap either side of it. The WEATHER tab shows what is overhead.',
        cycleH: 24, spells: [[2, 'snowfall', 5], [9, 'blizzard', 8], [19, 'coldsnap', 4]],
      },
      steps: [
        ['Get something turning', 'Wells and hydro turbines draw power to run. Wind is the one thing a blizzard is good for: put a few Wind Turbines up in the work area west of City Hall and wire them together.'],
        ['Tap the heat', "Place a Geothermal Well on each of the six vents and a Geothermal Turbine over each well's steam port. Ground heat does not care what the sky is doing."],
        ['Dam the meltwater', 'Build a Dam across each of the two streams, put two Hydro Turbines in each reservoir, and run Drive Shafts from each to a Hydroelectric Generator on the bank.'],
        ['Deliver', 'Run lines east to City Hall and into all three zones, and protect them with Surge Protectors.'],
        ['Ride it out', 'Demand climbs when the blizzard comes in. Build for the storm, not for the calm, or the hold will break in the middle of it.'],
      ],
    },
    {
      id: 'heat', accent: '#ffb070',
      title: 'Dry Season', kicker: 'Scenario 7 · Heat wave', place: 'Calder Flats',
      tagline: 'Run a desert town on sun and stored power while a heat wave pushes every air conditioner to full.',
      win: 'Calder Flats stayed cool through the worst of the dry season, and the lights stayed on after dark.',
      blurb: 'Nine months without rain and the forecast says forty-four by noon. Every unit in town has the air conditioning hard on, and the old line from the coast browns out by lunchtime. The sun is the one thing Calder Flats has plenty of. There is a little oil under the pan too, for the nights.',
      level: 'Medium', mins: '35–50 min',
      town: {
        house:      [['budget', 8], ['cornerstore', 1], ['mid', 10], ['premium', 4]],
        commercial: [['motel', 1], ['truckstop', 1], ['grocery', 1], ['restaurant', 1], ['fastfood', 1], ['cafe', 1], ['clinic', 1], ['pharmacy', 1]],
        industrial: [['coldstorage', 1], ['bottling', 1]],
      },
      ground: [G.oil(8, 34)],
      goals: [place(T.SOLAR2, 24), { kind: 'store', type: T.BATTERY, count: 10, powered: true },
              place(T.PUMPJACK, 1), running(T.FUELGEN, 1)],
      holdH: 24,
      tools: [...GRID, ...SOLARS, ...WINDS, ...OIL],
      medals: { gold: 625000, silver: 775000 },
      budget: 1100000,
      climate: {
        label: 'High summer · heat wave', season: 'summer', hour: 6, sky: 0.05,
        grade: { tint: '#ffd49a', alpha: 0.32 },
        note: 'It is high summer: long days, a hard clear sky and barely a breath of wind. A <b>heat wave</b> builds every day from late morning to dusk (homes draw 25% more, shops 10% more), which is when the sun is strongest. The trouble is the evening: the heat is still on when the panels go dark.',
        cycleH: 24, spells: [[4.5, 'heatwave', 10]],
      },
      steps: [
        ['Plant the panels', 'Lay out Solar Panels MK2 in the work area west of City Hall. Panels placed touching share power without a wire. Under this sky each gives about 13 kW from dawn to dusk, so the town at its hottest needs two dozen and more.'],
        ['Bank the afternoon', 'Add Batteries to the same network. They fill while the sun is up and carry the town through the evening, when the heat wave is still running and the panels are not.'],
        ['Cover the night', 'There is one oil deposit. Place a Pump Jack on it, pipe it through a Liquid Storage Tank and an Oil Refinery into a Fuel Power Generator, and wire the generator in. It is 165 kW that does not care what time it is, but it will not carry the town alone.'],
        ['Deliver', 'Run lines east to City Hall and into all three zones, and protect them with Surge Protectors.'],
        ['Hold a whole day', 'The hold is a full 24 hours: one heat wave and one night, without a break.'],
      ],
    },
    {
      id: 'storm', accent: '#8fb4ff',
      title: 'Storm Front', kicker: 'Scenario 8 · Storm season', place: 'Skerry Airfield',
      tagline: 'Build a supply that holds while rainstorms and lightning come in off the sea.',
      win: 'Skerry Airfield kept its runway lit through the storm season.',
      blurb: 'The runway lights, the terminal and the freight hall all draw from a diesel plant older than the airfield. We have crude and coal behind the dunes and nobody who knows how to use them. The autumn storms are already coming in off the water, and lightning has had two of our sheds this month. We need a proper supply, and we need to know it will hold.',
      level: 'Hard', mins: '45–70 min',
      town: {
        house:      [['budget', 8], ['mid', 8], ['townhouse', 1], ['premium', 2]],
        commercial: [['hotel', 1], ['motel', 1], ['restaurant', 1], ['cafe', 1], ['truckstop', 1], ['grocery', 1], ['marina', 1]],
        industrial: [['coldstorage', 1], ['machineshop', 1], ['factory', 1]],
      },
      ground: [G.coal(8, 10), G.coal(8, 30), G.oil(8, 50), G.oil(8, 68), G.lake(32, 52, 26, 18)],
      goals: [place(T.COALMINE, 2), running(T.COALGENERATOR, 4), place(T.PUMPJACK, 2), running(T.FUELGEN, 2),
              install(T.LIGHTNINGROD, 4)],
      holdH: 20,
      tools: [...GRID, ...STARTER, ...COAL, ...OIL],
      medals: { gold: 1000000, silver: 1250000 },
      budget: 1500000,
      climate: {
        label: 'Autumn · storms and lightning', season: 'autumn', hour: 5.5, sky: 0.7,
        grade: { tint: '#93b6d8', alpha: 0.28 },
        note: 'It is storm season on the coast. A <b>rainstorm</b> comes through every day (solar down 85%, homes up 20%) and brings <b>lightning</b>, which knocks out whatever it hits until you repair it: click a struck building to fix it. Buildings near a <b>Lightning Rod</b> are far less likely to be hit, and that goes for the town as much as for your plant. Lighter rain and a dry gale fill the gaps. The hold is 20 hours, so it has to stand through a storm.',
        cycleH: 24, spells: [[3, 'rainstorm', 6], [12, 'rainfall', 4], [18.5, 'storm', 3]],
        strikeEvery: 2.5,
      },
      steps: [
        ['Get something turning', 'Mines and pumps need power before they can make anything. Wind is strong here: put a few Wind Turbines up in the work area west of City Hall and wire them together.'],
        ['Coal', 'Place a Coal Mine on each of the two seams, belt each to two Coal Power Generators, and pipe Water Extractors on the lagoon to the generators.'],
        ['Oil', 'Place a Pump Jack on each oil deposit and pipe each through a Liquid Storage Tank and an Oil Refinery into a Fuel Power Generator.'],
        ['Guard it', 'Stand Lightning Rods among your plant, and in the town, before the first storm arrives. A strike takes a building off the grid until it is repaired: a struck generator is power you were counting on, and a struck house breaks the hold.'],
        ['Deliver', 'Run lines east to City Hall and into all three zones, and protect them with Surge Protectors.'],
      ],
    },
    {
      id: 'launch', accent: '#ffd070',
      title: 'Launch Day', kicker: 'Scenario 9 · Launch', place: 'Cape Halyard',
      tagline: 'Bank enough power to carry a rocket launch: 12.6 MW for the final count.',
      win: 'Mission 1 cleared the tower, and Cape Halyard never so much as flickered.',
      blurb: 'The Starhaven Launch Complex has a rocket on the pad and a window on the second afternoon. Loading the propellant takes five times its normal draw for two hours, and the last seconds of the count take fourteen. The town around it is dark. Three streams come down to the sea west of City Hall. That is all the power there is, unless you store it.',
      level: 'Hard', mins: '45–70 min',
      town: {
        house:      [['budget', 6], ['mid', 8], ['premium', 3], ['apartment', 1]],
        commercial: [['hotel', 1], ['motel', 1], ['restaurant', 1], ['cafe', 1], ['grocery', 1], ['sciencemuseum', 1]],
        industrial: [['spaceport', 1], ['machineshop', 1]],
      },
      ground: [
        G.stream(4, 8, 28, 6, 1, 0),  G.lake(29, 4, 20, 14),
        G.stream(4, 36, 28, 6, 1, 0), G.lake(29, 32, 20, 14),
        G.stream(4, 64, 28, 6, 1, 0), G.lake(29, 60, 20, 14),
        G.geo(52, 22), G.geo(52, 50),
      ],
      goals: [install(T.DAM, 3), running(T.HYDROGENERATOR, 6), LAUNCHED],
      holdH: 6,
      tools: [...GRID, ...STARTER, ...BIG, ...HYDRO, ...GEO, ...STORAGE],
      medals: { gold: 3000000, silver: 3750000 },
      budget: 3500000,
      // The first window, in game hours after the scenario opens. A scrub
      // recycles it 20 hours later (LaunchSystem).
      launch: { firstH: 30 },
      climate: {
        label: 'Launch campaign', season: 'summer', sky: 0.3,
        note: 'Mission 1\'s window opens on <b>day 2 at 14:00</b>. Two hours before liftoff Starhaven starts <b>loading propellant</b> and its draw climbs to <b>4.5 MW</b>; for the last 24 seconds of the count it peaks at <b>12.6 MW</b>. Lose power for more than a moment and the launch is <b>scrubbed</b> and recycled 20 hours later. Click the clock to see the window on the calendar.',
      },
      steps: [
        ['Get something turning', 'Hydro Turbines draw a little power to run. Put up a few Wind Turbines in the work area west of City Hall and wire them together.'],
        ['Dam', 'Build a Dam across each of the three streams, put two Hydro Turbines in each reservoir, and run Drive Shafts to a Hydroelectric Generator on the bank for each. That carries the town day to day.'],
        ['Store', 'The streams cannot make 12.6 MW. Storage can deliver it: a Substation MK5 puts out up to 8 MW and a Substation MK4 3 MW. Build enough to cover the count on top of what the dams make, and give them time to fill before the window.'],
        ['Deliver', 'Run lines east to City Hall, the town and the Launch Complex. Twelve megawatts will melt ordinary protection: use Surge Protectors MK3.'],
        ['Fly', 'Keep everything lit through propellant loading and the terminal count. The objectives panel counts down to the window.'],
      ],
    },
    {
      id: 'fieldcore', accent: '#7fe8ff',
      title: 'Field Strength', kicker: 'Scenario 10 · Field Cores', place: 'Kessel Ridge',
      tagline: 'Wind superconducting Field Cores and drive one fusion reactor past its rating.',
      win: 'Two Field Cores in the reactor and Kessel Ridge runs on one machine pushed far past its rating.',
      blurb: 'The client will fuel one Fusion Reactor and not a second: the pellets are in the container west of City Hall, kept full. One reactor will not carry Kessel Ridge. Field Cores will: superconducting windings that tighten the plasma and make every turbine run harder. The rare earths for the tape are in the ridge. Make the cores.',
      level: 'Expert', mins: '2–3 hours',
      town: {
        house:      [['arcology', 1], ['skyscraper', 2], ['luxury', 8], ['condo', 3], ['apartment', 3], ['premium', 6]],
        commercial: [['megatower', 1], ['maglev', 1], ['holoarena', 1], ['convention', 1], ['stadium', 1], ['hotel', 1], ['mall', 1], ['finedining', 1], ['radiology', 1]],
        industrial: [['collider', 1], ['aicompute', 1], ['desal', 1], ['supercon', 1], ['geneworks', 1], ['verticalfarm', 1], ['semifab', 1]],
      },
      work: { x0: -168, y0: -64, x1: -30, y1: 64 },
      ground: [
        G.pellets(96, 54), G.helium(8, 8),
        G.rareearth(8, 40), G.rareearth(8, 58), G.sulfur(8, 76),
        G.geo(30, 8), G.geo(40, 8), G.geo(50, 8), G.geo(30, 18), G.geo(40, 18), G.geo(50, 18),
        G.lake(40, 96, 40, 24),
      ],
      goals: [place(T.HULKINGFUSIONREACTOR, 1), running(T.STEAMTURBINE2, 5),
              place(T.RAREEARTHMINE, 1), place(T.LEACHPLANT, 1), place(T.SCMILL, 1), place(T.COREWORKS, 1), CORED],
      holdH: 12,
      tools: [...GRID, ...STARTER, ...BIG, ...GEO, ...FIELDCORE],
      medals: { gold: 8700000, silver: 10750000 },
      budget: 10000000,
      steps: [
        ['Build a starter grid', 'The reactor and the plant around it need a few hundred kilowatts before fusion makes any. Geothermal Wells and Turbines on the vents, and Wind Turbines, will carry it.'],
        ['The reactor', "Put a Helium Well on the gas field and pipe it into a Cryo Plant, and the Cryo Plant's LHe OUT into the Fusion Reactor's LHe IN. Belt pellets from the client's container into the reactor and pipe its steam to five Steam Turbines MK2: 6 MW."],
        ['Ore and acid', 'A Rare Earth Mine on a rare earth deposit, belted into a Leach Plant. Sulfuric acid for it comes from a Chemical Plant fed by a Sulfur Mine and water from the lake.'],
        ['Tape', 'A Superconductor Mill takes the Leach Plant\'s oxide by belt, hydrogen from an Electrolyzer and nitrogen from an Atmosphere Collector by pipe, and makes HTS tape.'],
        ['Cores', 'Belt the tape into a Core Works: 120 tape winds a core, and four hours at 800 kW charges it. A Drone Port in reach of both, on the same network, carries cores to the reactor.'],
        ['Boost', 'Click the Fusion Reactor and set it to take two Field Cores. Each live core makes every turbine it feeds run harder (+50%, then +30%), and burns a little more fuel.'],
        ['Deliver', 'Run lines east to City Hall and the town with Surge Protectors MK3, and connect every building.'],
      ],
    },
  ];
  const byId = id => SCENARIOS.find(s => s.id === id) || null;

  // ── State ────────────────────────────────────────────────────────
  // run: the scenario in play, or null.
  //   elapsed  sim seconds on the clock (stops when signed off)
  //   reqs     the objectives (a ContractRequirements set)
  //   spots    where the work area and the town are, for the panel's jump buttons
  //   demand   the town's summed peak draw, kW
  //   guideAt  the walkthrough step reached (null until it has been offered); guideDone once it has run out
  //   done     signed off; `result` holds the medal
  let run = null;
  let _overlay = null, _prevScale = 1;

  const active = () => !!run;
  const isDone = () => !!(run && run.done);

  // ── Best medals ──────────────────────────────────────────────────
  function _best() {
    try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; } catch (_e) { return {}; }
  }
  const MEDAL_RANK = { bronze: 1, silver: 2, gold: 3 };
  // A medal from before medals went by money (old.spent unset) is replaced by
  // the first money result, whatever it is: the two do not compare.
  function _recordBest(id, medal, spent) {
    const all = _best(), old = all[id];
    if (!old || old.spent == null || MEDAL_RANK[medal] > MEDAL_RANK[old.medal] || (medal === old.medal && spent < old.spent)) {
      all[id] = { medal, spent: Math.round(spent) };
      try { localStorage.setItem(BEST_KEY, JSON.stringify(all)); } catch (_e) {}
    }
  }
  const _money = n => typeof formatMoney === 'function' ? formatMoney(n) : '$' + Math.round(n).toLocaleString();

  // What the player's plant is worth: everything standing in the scenario's
  // area that they built, at what they paid for it (stacked wire, pipe and
  // belt included). The town, City Hall, the ground and a client's own stock
  // cost nothing. Selling something back takes it off the total.
  function builtValue() {
    if (!run || !run.reqs) return 0;
    const b = run.reqs.context.bounds, seen = new Set();
    let total = 0;
    const add = e => {
      if (!e || seen.has(e)) return;
      seen.add(e);
      if (e.fromRequest || e.type === T.GOVBUILDING || e._clientOwned) return;
      const d = EntityDefs[e.type];
      const paid = e._paid != null ? e._paid : (d && d.cost) || 0;
      if (paid > 0) total += paid;
    };
    for (const e of EntityRegistry.getInTileRect(b.minC, b.minR, b.maxC, b.maxR)) {
      add(e);
      for (const k of GridManager._STACK_SLOTS) if (GridManager._isLayer(e[k])) add(e[k]);
    }
    return Math.round(total);
  }

  // ── Clock ────────────────────────────────────────────────────────
  function hoursScored() { return run ? run.elapsed / DayNight.secondsPerGameHour() : 0; }
  function _fmtHours(h) {
    const d = Math.floor(h / 24), r = Math.floor(h % 24);
    return d > 0 ? `${d}d ${r}h` : `${r}h ${Math.floor((h % 1) * 60)}m`;
  }
  function clockText() { return run ? _fmtHours(hoursScored()) : ''; }

  // ── Climate ──────────────────────────────────────────────────────
  // A scenario may be played under conditions of its own (`climate`): the
  // season it always is there, the hour it opens at, the sky between spells
  // of weather, a colour grade for the place, and a programme of weather
  // that comes round on the scenario's clock. The spells are the game's own
  // weather events (WeatherEventSystem), so each does what it does in the
  // full game: a blizzard takes the solar and feeds the wind turbines, a
  // heat wave puts every air conditioner on, a rainstorm brings lightning.
  // The city's random weather never fires in a scenario (it waits on a
  // research total a scenario never earns), so this programme is all the
  // weather there is.
  //   label    what the cards call it
  //   season   'spring' | 'summer' | 'autumn' | 'winter' (read by Seasons)
  //   hour     hour of the day it opens at (START_HOUR without one)
  //   sky      cloud cover between spells, 0 clear to 1 overcast
  //   grade    { tint, alpha }: a multiply pass over the scene, as on a job site
  //   cycleH   hours the programme takes to come round
  //   spells   [hour into the cycle, event type, hours it lasts]
  //   note     the briefing's paragraph on it
  //   strikeEvery  sim seconds between extra lightning rolls during a
  //            rainstorm (LightningDamageSystem.rollStrike, the same roll a
  //            flash makes). The game's own odds are set for a city played
  //            over many storms; a scenario built around lightning has one
  //            storm a day to make its point in.
  const SPELL_COVER = { rainstorm: 0.98, rainfall: 0.7, snowfall: 0.8, blizzard: 0.98, coldsnap: 0.6, heatwave: 0.04, storm: 0.85 };
  const _climate = () => (run && run.def.climate) || null;
  const season = () => { const c = _climate(); return (c && c.season) || null; };

  function _sky() {
    const c = _climate();
    if (!c || c.sky == null) return;
    try { CloudState.load(c.sky, c.sky); if (c.sky < 0.2) WindState.triggerCalm(); } catch (_e) {}
  }
  function _spell(type, secs) {
    const now = WeatherEventSystem.getGameTime();
    WeatherEventSystem.loadEvent({ type, endTime: now + secs }, now);
    try {
      if (SPELL_COVER[type] !== undefined) CloudState.triggerBurst(SPELL_COVER[type], secs);
      if (type === 'storm' || type === 'blizzard') WindState.triggerStorm(type === 'storm' ? 0.9 : 0.95, secs);
    } catch (_e) {}
    run.skyDue = true;   // put the scenario's own sky back once this has passed
  }
  // Where the programme stands is a function of the scenario's clock alone,
  // so it is the same weather after a save and a load. `run.wx` (saved) is
  // the spell last started, which is what stops one being started twice.
  function _weather(dt) {
    const c = _climate();
    if (!c || !c.spells || run.done || typeof WeatherEventSystem === 'undefined') return;
    const live = WeatherEventSystem.getHomeEvent();
    if (live) {
      if (c.strikeEvery && live.type === 'rainstorm' && typeof LightningDamageSystem !== 'undefined') {
        run.strikeT = (run.strikeT || 0) + dt;
        while (run.strikeT >= c.strikeEvery) { run.strikeT -= c.strikeEvery; LightningDamageSystem.rollStrike(); }
      }
      return;   // one spell at a time
    }
    if (run.skyDue) { run.skyDue = false; _sky(); }
    const H = hoursScored(), n = Math.floor(H / c.cycleH), at = H - n * c.cycleH;
    for (const [start, type, len] of c.spells) {
      if (at < start || at >= start + len - 0.5) continue;
      const key = n + ':' + start;
      if (run.wx === key) return;
      run.wx = key;
      _spell(type, (start + len - at) * DayNight.secondsPerGameHour());
      return;
    }
  }
  // The place's colour grade, drawn over the world (render_main_loop.js).
  function renderGrade(ctx) {
    const c = _climate();
    if (!c || !c.grade) return;
    const cv = document.getElementById('canvas');
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = c.grade.alpha;
    ctx.fillStyle = c.grade.tint;
    ctx.fillRect(Camera.x, Camera.y, (cv ? cv.width : 1280) / Camera.zoom, (cv ? cv.height : 720) / Camera.zoom);
    ctx.restore();
  }

  // Called from GameLoop with the scaled sim step: runs the clock, advances
  // the hold, and repaints the objectives a few times a second.
  let _panelT = 0;
  function tick(dt) {
    if (!run) return;
    if (!run.done && !_overlay) run.elapsed += dt;
    if (dt > 0 && !_overlay) _weather(dt);
    if (run.reqs) run.reqs.tick(dt);
    _panelT += dt;
    if (_panelT >= 0.3) { _panelT = 0; _renderPanel(); _trackGuide(); }
  }

  // Keeps `run.guideAt` on the walkthrough's current step, and puts the
  // walkthrough back when Tutorial Cards is switched on again in OPTIONS:
  // switching it off (or answering No to the first card) only hides the
  // cards, it does not lose the player's place. Coming back skips the
  // "would you like a walkthrough?" card, since switching cards on is a yes.
  function _trackGuide() {
    if (!run || run.guideDone || run.guideAt == null) return;
    const seq = _guide(run.def), at = TutorialSystem.sequenceStep(seq);
    if (at >= 0) { run.guideAt = at; return; }
    if (TutorialSystem.isSkipped()) return;                    // cards are off
    if (run.guideAt >= seq.steps.length - 1) { run.guideDone = true; return; }   // it ran to its last card
    TutorialSystem.startSequence(seq, Math.max(1, run.guideAt));   // cards are back on
  }

  // ── Save files ───────────────────────────────────────────────────
  // A scenario's saves (its manual file and autosave rotation), newest first.
  function slotsFor(id) {
    try { return SaveSystem.listSlots().filter(s => s.scenario === id); } catch (_e) { return []; }
  }
  function serialise() {
    return run ? { id: run.def.id, elapsed: run.elapsed, done: run.done, result: run.result,
                   budget: run.budget, demand: run.demand, reqState: run.reqs ? run.reqs.toJSON() : null,
                   // The walkthrough: the step it has reached, and whether it has finished.
                   guideAt: run.guideAt, guideDone: run.guideDone,
                   wx: run.wx || null } : null;   // the weather spell last started (see Climate)
  }
  let _loaded = null;   // a scenario's state out of the save being loaded, until resumeLoaded()
  function loadState(d) { _loaded = (d && byId(d.id)) ? d : null; }

  // The save just loaded is a scenario's: the world is all there, so only
  // this file's side of it needs putting back.
  function resumeLoaded() {
    const d = _loaded;
    _loaded = null;
    if (!d) return;
    const def = byId(d.id);
    run = { def, elapsed: d.elapsed || 0, done: !!d.done, result: d.result || null,
            budget: d.budget || def.budget, demand: d.demand || 0, reqs: null, spots: null };
    _objectives();
    if (d.reqState && run.reqs) run.reqs.fromJSON(d.reqState);
    run.guideAt = d.guideAt || 0;
    run.guideDone = !!d.guideDone;
    run.wx = d.wx || null;
    _enter();
    // Cards switched off in this save (TutorialSystem has already loaded
    // that) stay off: _trackGuide brings the walkthrough back if they are
    // switched on again. Otherwise it carries on from where it was.
    if (!run.guideDone && !TutorialSystem.isSkipped()) TutorialSystem.startSequence(_guide(def), run.guideAt);
  }

  // A linked save folder whose permission lapsed (browser restarted) can only
  // be unlocked from a click, and both ways in below reload the page: after
  // the reload there is no click left to spend, so the resumed file could not
  // be read ("Save failed to load") and a fresh run's file could not be
  // written. Spend this click on it first, as CONTINUE does.
  async function _folderAccess() {
    try {
      if (!SaveSystem.folderNeedsPermission()) return true;
      if (await SaveSystem.folderRequestAccess()) return true;
    } catch (_e) {}
    try { showToast('Save folder access is needed to play: click again and allow it', '#ff8040', '#180800', '#602010'); } catch (_e) {}
    return false;
  }

  async function resume(id) {
    if (!(await _folderAccess())) return;
    const slot = slotsFor(id)[0];
    if (!slot) return launch(id);
    try { sessionStorage.setItem('autostart_loadslot', slot.id); sessionStorage.setItem('menu_return', '1'); } catch (_e) { return; }
    location.reload();
  }

  // ── Starting one ─────────────────────────────────────────────────
  // Always a fresh start: any earlier save of the same scenario is cleared
  // first, so the picker never offers to resume a run that was replaced.
  // Started from inside another scenario (NEXT on the result screen), that
  // one is saved on the way out.
  async function launch(id) {
    if (!byId(id)) return;
    if (!(await _folderAccess())) return;
    if (run) { try { SaveSystem.save(); } catch (_e) {} }
    try { await Promise.all(slotsFor(id).map(s => SaveSystem.deleteSlot(s.id))); } catch (_e) {}
    try {
      sessionStorage.setItem(PENDING_KEY, id);
      sessionStorage.setItem('menu_return', '1');   // no studio card on the way in
      // The site sits in one corner of the map and the rest is never seen:
      // the smallest world is the quickest to build.
      sessionStorage.setItem('gw_world_size', 'small');
    } catch (_e) { return; }
    try { SaveSystem.pause(); } catch (_e) {}
    location.reload();
  }

  // A scenario is on its way in (this boot): cover the menu until its intro
  // card takes over, so picking one never flashes the title screen.
  let _cover = null;
  try {
    if (sessionStorage.getItem(PENDING_KEY)) {
      _cover = document.createElement('div');
      _cover.style.cssText = 'position:fixed;inset:0;z-index:6990;background:#03070d;';
      document.body.appendChild(_cover);
    }
  } catch (_e) {}
  function _uncover() { if (_cover) { _cover.remove(); _cover = null; } }

  // Read (and clear) the scenario this boot was started for. MenuSystem
  // calls it once, before anything else is auto-started.
  function takePending() {
    let id = null;
    try { id = sessionStorage.getItem(PENDING_KEY); sessionStorage.removeItem(PENDING_KEY); } catch (_e) {}
    const def = id ? byId(id) : null;
    if (!def) { _uncover(); return null; }
    // The names the world (and its save file) goes by.
    return { ...def, company: `Scenario: ${def.title}` };
  }

  // City Hall's centre tile: everything is laid out from here.
  function _hall() {
    const g = GovernmentSystem.getGovEntity();
    return g ? { c: Math.round(g.col + (g.width || 1) / 2), r: Math.round(g.row + (g.height || 1) / 2) }
             : { c: Math.floor(COLS / 2), r: Math.floor(ROWS / 2) };
  }
  const _abs = (h, rect) => ({ minC: h.c + rect.x0, minR: h.r + rect.y0, maxC: h.c + rect.x1, maxR: h.r + rect.y1 });

  function begin(pending) {
    const def = byId(pending.id);
    if (!def) { _uncover(); return; }
    run = { def, elapsed: 0, done: false, result: null, budget: def.budget, demand: 0, reqs: null, spots: null,
            guideAt: null, guideDone: false };

    // Building the town runs sixty-odd customers through accept(): keep its
    // move-in toasts, sounds and unlock checks to itself.
    const toast = window.showToast, houseIn = SFX.houseIn;
    window.showToast = () => {};
    SFX.houseIn = () => {};
    try { _build(def); } finally { window.showToast = toast; SFX.houseIn = houseIn; }

    Progression.grant(def.tools);
    Economy.setBalance(def.budget);
    // Morning of day one, whatever hour the world was made at.
    const startH = (def.climate && def.climate.hour) || START_HOUR;
    DayNight.setElapsed(DayNight.secondsPerGameHour() * startH);
    // A launch scenario's window is fixed, so the count comes when the briefing says.
    if (def.launch && typeof LaunchSystem !== 'undefined') LaunchSystem.schedule(DayNight.secondsPerGameHour() * (startH + def.launch.firstH));

    _objectives();
    _enter();
    // Open on the whole picture: City Hall centred, work area and town either side.
    const h = _hall(), zoom = Math.max(0.32, Math.min(0.6, window.innerWidth / (230 * TILE)));
    Camera.loadState({ panX: (h.c + 2) * TILE - window.innerWidth / 2 / zoom, panY: h.r * TILE - window.innerHeight / 2 / zoom, zoom });
    _intro(() => showBriefing(true, () => { run.guideAt = 0; TutorialSystem.startSequence(_guide(def)); }));
  }

  // What both a new scenario and a resumed one need once `run` is set.
  function _enter() {
    // Nothing is researched in a scenario: the tools are handed over, so the
    // unlock checks placing a building triggers have nothing to do.
    Progression.checkUnlocks = () => {};
    if (run.def.tools.includes(T.POWERTOWER)) {      // what unlocking the Power Tower does
      PowerNetwork.setWireHops(8);
      PowerNetwork.recomputeWireHops();
    }
    if (typeof refreshHotbar === 'function') refreshHotbar();
    // Its own sky, unless a saved spell of weather is still overhead.
    if (!(typeof WeatherEventSystem !== 'undefined' && WeatherEventSystem.getHomeEvent())) _sky();
    document.body.classList.add('gw-scenario');
    _css();
    // The objectives always open unfolded when a scenario is started or
    // resumed: folding them away lasts for that sitting only.
    try { localStorage.removeItem(COLLAPSE_KEY); } catch (_e) {}
    _panelSig = null;
    _renderPanel();
  }

  // The objectives: the scenario's own plant, then the three every scenario
  // ends on. Evaluated over the scenario's area only, so walking the grid
  // for them stays cheap and nothing built off in the wilds counts.
  function _objectives() {
    const h = _hall(), d = run.def;
    const specs = [...d.goals, { kind: 'service' }, { kind: 'protect', scope: 'allLines' },
                   { kind: 'sustain', watts: Math.round(run.demand), hours: d.holdH }];
    run.reqs = ContractRequirements.create(specs, { bounds: _abs(h, AREA) });
    // Where the panel's jump buttons go: the work area, and the middle of the town as built.
    let n = 0, sc = 0, sr = 0;
    for (const t of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) for (const e of EntityRegistry.getByType(t)) {
      if (!e.fromRequest) continue;
      n++; sc += e.col + (e.width || 1) / 2; sr += e.row + (e.height || 1) / 2;
    }
    run.spots = {
      work: { c: h.c + ((d.work || WORK).x0 + (d.work || WORK).x1) / 2, r: h.r },
      town: n ? { c: sc / n, r: sr / n } : { c: h.c + TOWN.x + 30, r: h.r },
    };
  }

  // ── Building the world ───────────────────────────────────────────
  // Water shapes. A lake is a lobed blob inside its box rather than the box
  // itself, and a stream wanders and changes width as it runs, so neither
  // reads as a rectangle. Both are seeded from where they sit, so a
  // scenario's water is the same every time it is played.
  const _rnd = (g, k) => { const v = Math.sin(g.x * 12.9898 + g.y * 78.233 + k * 37.719) * 43758.5453; return (v - Math.floor(v)) * 6.2832; };
  function _lakeCells(g) {
    const cx = (g.w - 1) / 2, cy = (g.h - 1) / 2, rx = g.w / 2, ry = g.h / 2;
    const p1 = _rnd(g, 1), p2 = _rnd(g, 2), p3 = _rnd(g, 3), out = [];
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, th = Math.atan2(dy, dx);
      // The shore sits between 70% and 100% of the way out: the middle is
      // always open water, wide enough to stand extractors in.
      const shore = 0.85 + 0.09 * Math.sin(2 * th + p1) + 0.06 * Math.sin(3 * th + p2) + 0.04 * Math.sin(5 * th + p3);
      if (Math.hypot(dx, dy) <= shore) out.push([x, y]);
    }
    return out;
  }
  // The town's layout. Each zone is its customers wrapped into rows like
  // text, at a width picked for that zone, so one comes out a tall block
  // and the next a wide one; a big residential list is split into two
  // neighbourhoods. The blocks are then set out east of City Hall in
  // ragged rows, with enough clear ground between them that zones of the
  // same kind stay separate (ZoneSystem joins buildings 10 tiles apart).
  // Seeded from the scenario, so a scenario's town is always the same town.
  // Returns [{ tier, x, y, cells: [{ key, x, y }] }], in tiles from the
  // town's west edge and City Hall's row.
  function _layoutTown(def) {
    let seed = 0;
    for (const ch of def.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const GAP = { house: 3, commercial: 3, industrial: 4 }, BETWEEN = 12;

    const lists = [];
    for (const tier of ['house', 'commercial', 'industrial']) {
      const flat = [];
      for (const [key, count] of def.town[tier] || []) for (let i = 0; i < count; i++) flat.push(key);
      if (tier === 'house' && flat.length >= 18) {
        const cut = Math.round(flat.length * (0.5 + rnd() * 0.2));
        lists.push({ tier, keys: flat.slice(0, cut) }, { tier, keys: flat.slice(cut) });
      } else if (flat.length) lists.push({ tier, keys: flat });
    }

    const blocks = lists.map(({ tier, keys }) => {
      const fps = keys.map(k => HouseRequestSystem.scenarioFootprint(tier, k));
      const widest = Math.max(...fps.map(f => f.width)), gap = GAP[tier];
      // The ground the list needs, shaped anywhere from twice as tall as
      // wide to twice as wide as tall.
      const ground = fps.reduce((t, f) => t + (f.width + gap) * (f.height + gap), 0);
      const width = Math.max(widest + 1, Math.min(50, Math.round(Math.sqrt(ground * (0.5 + rnd() * 1.5)))));
      const cells = [];
      let x = 0, y = 0, rowH = 0, w = 0;
      keys.forEach((key, i) => {
        const f = fps[i];
        if (x > 0 && x + f.width > width) { x = 0; y += rowH + gap; rowH = 0; }
        cells.push({ key, x, y });
        x += f.width + gap;
        w = Math.max(w, x - gap);
        rowH = Math.max(rowH, f.height);
      });
      return { tier, cells, w, h: y + rowH };
    });

    // Shuffle, then shelve: left to right, a new row when the next block will not fit.
    for (let i = blocks.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [blocks[i], blocks[j]] = [blocks[j], blocks[i]]; }
    let x = 0, y = 0, rowH = 0;
    for (const b of blocks) {
      if (x > 0 && x + b.w > TOWN.width) { x = 0; y += rowH + BETWEEN; rowH = 0; }
      const drop = Math.floor(rnd() * 7);          // rows are ragged, not ruled
      b.x = x; b.y = y + drop;
      x += b.w + BETWEEN + Math.floor(rnd() * 8);
      rowH = Math.max(rowH, b.h + drop);
    }
    const height = y + rowH;
    for (const b of blocks) b.y -= Math.round(height / 2);   // centred on City Hall's row
    return blocks;
  }

  // West to east: the flow stays (1, 0) on every tile, which is what a dam
  // reads, while the channel itself drifts a couple of tiles either way.
  function _streamCells(g) {
    const p1 = _rnd(g, 1), p2 = _rnd(g, 2), p3 = _rnd(g, 3), mid = (g.h - 1) / 2, out = [];
    for (let x = 0; x < g.w; x++) {
      const centre = mid + 1.5 * Math.sin(x * 0.24 + p1) + 0.6 * Math.sin(x * 0.63 + p2);
      const half = 2.3 + 0.5 * Math.sin(x * 0.41 + p3);
      for (let y = Math.round(centre - half); y <= Math.round(centre + half); y++) out.push([x, y]);
    }
    return out;
  }

  function _build(def) {
    const h = _hall();
    const work = _abs(h, def.work || WORK), area = _abs(h, AREA);
    const veg = e => e && (e.type === T.TREE || e.type === T.BUSH);
    const each = (rect, fn) => {
      for (let r = Math.max(0, rect.minR); r <= Math.min(ROWS - 1, rect.maxR); r++)
        for (let c = Math.max(0, rect.minC); c <= Math.min(COLS - 1, rect.maxC); c++) fn(c, r);
    };

    // Natural lakes and rivers out of the whole area, so the layout below
    // lands the same on every world; trees and bushes out of the work area
    // and off the town's ground.
    each(area, (c, r) => {
      if (!WaterSystem.isWater(c, r)) return;
      GridManager.removeEntity(c, r);
      WaterSystem._unregister(c, r);
    });
    const townRect = { minC: h.c + TOWN.x - 3, minR: area.minR + 8, maxC: h.c + TOWN.x + TOWN.width + 8, maxR: area.maxR - 8 };
    for (const rect of [work, townRect]) each(rect, (c, r) => { if (veg(GridManager.getEntity(c, r))) GridManager.removeEntity(c, r); });

    // The work area: water first (it is terrain), then what stands on the land.
    for (const g of def.ground) {
      const c0 = work.minC + g.x, r0 = work.minR + g.y;
      if (g.water) {
        for (const [dx, dy] of (g.dc || g.dr) ? _streamCells(g) : _lakeCells(g)) {
          const c = c0 + dx, r = r0 + dy;
          if (!GridManager.inBounds(c, r) || GridManager.getEntity(c, r)) continue;
          const w = new Entity(T.WATER, c, r);
          if (g.dc || g.dr) { w._flowDc = g.dc; w._flowDr = g.dr; w._isRiver = true; }
          GridManager.setEntity(c, r, w);
          WaterSystem._register(c, r);
        }
        continue;
      }
      const e = new Entity(g.type, c0, r0);
      e.fromRequest = false;
      Object.assign(e, g.props);
      if (g.ore) { e._oreAmount = oreReserveFor(g.ore); e._oreMax = e._oreAmount; }
      // A deposit always starts full: its max is whatever it was given.
      if (e._oreAmount !== undefined) e._oreMax = e._oreAmount;
      if (e.coalAmount !== undefined) e.coalMax = e.coalAmount;
      for (let r = r0; r < r0 + (e.height || 1); r++)
        for (let c = c0; c < c0 + (e.width || 1); c++) if (GridManager.inBounds(c, r)) GridManager.setEntity(c, r, e);
    }
    TerrainSystem.syncToWater();   // the land follows the new water

    // The town (see _layoutTown).
    let n = 0, demand = 0;
    for (const b of _layoutTown(def))
      for (const pl of b.cells) HouseRequestSystem.scenarioPlace(b.tier, pl.key, h.c + TOWN.x + b.x + pl.x, h.r + b.y + pl.y, n++);
    ZoneSystem.rebuild();

    // The town's appetite: every customer's own peak, summed. (City Hall too.)
    for (const e of EntityRegistry.getInTileRect(area.minC, area.minR, area.maxC, area.maxR)) {
      if (!e.fromRequest && e.type !== T.GOVBUILDING) continue;
      const peak = e.peakDraw != null ? e.peakDraw
        : (DemandCurves.peak(e.type, e.commercialSubtype || null) || (e.def && e.def.powerInput) || 0) * (e.demandScale || 1);
      demand += peak;
    }
    run.demand = Math.round(demand);
  }

  // ── Leaving ──────────────────────────────────────────────────────
  function toMenu(openPicker) {
    if (run) { try { SaveSystem.save(); } catch (_e) {} }   // resumable from the picker
    try {
      if (openPicker) sessionStorage.setItem(OPEN_KEY, '1');
      sessionStorage.setItem('menu_return', '1');
    } catch (_e) {}
    try { SaveSystem.pause(); } catch (_e) {}
    location.reload();
  }

  // What the player has standing at sign-off, for the result screen: the
  // town's buildings lit, the power on the grid, the plant they built
  // (dearest first) and the wire, pipe and belt they laid.
  function _achieved() {
    const b = run.reqs.context.bounds;
    const RUNS = new Set([T.WIRE, T.POLE, T.POWERTOWER, T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR, T.UNDERGNDCONVEYOR, T.CONVEYORSPLITTER, T.SHAFT].filter(Boolean));
    const plant = new Map();
    let customers = 0, lit = 0, runs = 0, people = 0;
    for (const e of EntityRegistry.getInTileRect(b.minC, b.minR, b.maxC, b.maxR)) {
      if (e.fromRequest || e.type === T.GOVBUILDING) {
        customers++;
        if (e.powered) { lit++; people += e._population || 0; }
        continue;
      }
      // Anything else with a price on it is something the player built.
      if (e._clientOwned || !(e.def && e.def.cost > 0)) continue;
      if (RUNS.has(e.type)) { runs++; continue; }
      plant.set(e.type, (plant.get(e.type) || 0) + 1);
    }
    const built = [...plant.entries()]
      .map(([type, n]) => ({ n, label: (EntityDefs[type] && EntityDefs[type].label) || type, cost: (EntityDefs[type] && EntityDefs[type].cost) || 0 }))
      .sort((x, y) => y.cost - x.cost);
    return {
      customers, lit, runs, built, people,
      generated: Math.round(PowerNetwork.stats.totalGenerated || 0),
      demand:    Math.round(PowerNetwork.stats.totalConsumed || 0),
      income:    Math.round((Economy.income || 0) - (Economy.upkeep || 0)),
    };
  }

  // ── Signing off ──────────────────────────────────────────────────
  function signOff() {
    if (!run) return;
    if (run.done) { _showResult(); return; }
    if (!run.reqs || !run.reqs.allPass()) return;
    const hours = hoursScored(), spent = builtValue(), m = run.def.medals;
    const medal = spent <= m.gold ? 'gold' : spent <= m.silver ? 'silver' : 'bronze';
    run.done = true;
    run.result = { medal, hours, spent, left: Math.round(Economy.balance), ..._achieved() };
    _recordBest(run.def.id, medal, spent);
    try { SFX.unlock?.(); } catch (_e) {}
    try { SaveSystem.save(); } catch (_e) {}   // the medal is in the save from here on
    _renderPanel();
    _showResult();
  }

  // ── Walkthroughs ─────────────────────────────────────────────────
  // Each scenario has an optional guided walkthrough, run through the game's
  // own tutorial engine (TutorialSystem.startSequence): the same cards, and
  // the same glow on the build bar for the item a card asks for. The first
  // card asks whether the player wants it; No turns cards off for this
  // world, as it does in a new game, and OPTIONS > Tutorial Cards turns
  // them off or back on at any point (_trackGuide keeps the player's place).
  //
  // A step is { text, highlight, check }: the card stays up (folded away if
  // the player likes) until `check` is true, then the next one appears.
  // Checks only ask what is certain from outside a machine (how many are
  // placed, whether one has power, whether one is running by the same test
  // the objectives use), so a card can never wait on something that has
  // already happened. `manual` steps are a Continue button instead.
  const _n = (...types) => types.reduce((t, k) => t + EntityRegistry.getByType(k).size, 0);
  const _powered = type => { for (const e of EntityRegistry.getByType(type)) if (e.powered) return true; return false; };
  const _any = (type, pred) => { for (const e of EntityRegistry.getByType(type)) if (pred(e)) return true; return false; };
  const _runs = (type, count = 1) => !!(run && run.reqs
    && ContractRequirements.create([{ kind: 'running', type, count }], { bounds: run.reqs.context.bounds }).evaluate(true)[0].pass);
  // A card asking for a building to be hooked up waits until it is actually
  // making what it makes, not just standing there with power: the same
  // tests its info panel uses for PRODUCING / EXTRACTING / COOLING. Anything
  // not listed works as soon as it has power.
  const WORKS = {
    [T.WATEREXTRACTOR]:  e => e.powered && !!e._lakeConnected,
    [T.HYDROTURBINE]:    e => e.powered && !!e._fuelled,
    [T.REFINERY]:        e => e.powered && (e._refStatus === 'running' || e._refStatus === 'full'),
    [T.OILSTORAGE]:      e => (e._crude || 0) > 0,
    [T.COALGENERATOR]:   e => (e._hopperCoal || 0) > 0,
    [T.CHEMICALPLANT]:   e => e.powered && !!e._sulfurConveyor && !!e._waterConnected,
    [T.FUELPLANT]:       e => e.powered && !!e._hasAcid && !!e._hasUranium,
    [T.COOLINGTOWER]:    e => e.powered && !e._pumpTripped && !!e._hotConnected,
    [T.NUCLEARREACTOR]:  e => !!e._cooled,
    [T.ELECTROLYZER]:    e => e.powered && !!e._waterConnected,
    [T.HABERBOSCH]:      e => e.powered && !!e._hasNitrogen && !!e._hasHydrogen,
    [T.WASHTOWER]:       e => e.powered && !!e._waterConnected && !!e._hasAmmonia,
    [T.HE3SEPARATOR]:    e => e.powered && !!e._hasHeliumSource,
    [T.FUSIONFUELPLANT]: e => e.powered && !!e._hasDeuterium && (!!e._hasTritium || !!e._hasHe3 || (e._he3 || 0) > 0),
    [T.CRYOPLANT]:       e => e.powered && !e._tripped && !!e._hasHeliumSource,
    [T.HULKINGFUSIONREACTOR]: e => e.powered && ((e._heCharge || 0) > 0 || !!e._coolingOK),
    [T.LEACHPLANT]:      e => !!e._running,
    [T.SCMILL]:          e => !!e._running,
    [T.COREWORKS]:       e => e.powered && (e._tapeStock || 0) > 0,
  };
  const _works = (type, count = 1) => {
    const ok = WORKS[type] || (e => !!e.powered);
    let n = 0;
    for (const e of EntityRegistry.getByType(type)) if (ok(e) && ++n >= count) return true;
    return false;
  };
  // The deposit of a kind with nothing built on it yet that is nearest the
  // player's starter turbines (the middle of the work area before there are
  // any), for the card's marker in the world.
  const STARTER_GEN = _t('WIND', 'WIND2', 'WIND3', 'SOLAR', 'SOLAR2');
  const _free = type => () => {
    let n = 0, ac = 0, ar = 0;
    for (const t of STARTER_GEN) for (const g of EntityRegistry.getByType(t)) { n++; ac += g.col + (g.width || 1) / 2; ar += g.row + (g.height || 1) / 2; }
    const w = run && run.spots && run.spots.work;
    const at = n ? { c: ac / n, r: ar / n } : w;
    let best = null, bestD = Infinity;
    // (A mine or well flags its deposit; a pump jack simply stands on its tiles.)
    for (const e of EntityRegistry.getByType(type)) {
      if (e._hasMine || e._hasWell || GridManager.getEntity(e.col, e.row) !== e) continue;
      if (!at) return e;
      const d = Math.hypot(e.col + (e.width || 1) / 2 - at.c, e.row + (e.height || 1) / 2 - at.r);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  };
  const _toWork = () => { const w = run && run.spots && run.spots.work; if (w) Camera.recentreOn(w.c * TILE, w.r * TILE); };
  const _hallLit = () => { const g = GovernmentSystem.getGovEntity(); return !!(g && g.powered); };

  const wait = (text, highlight, check, extra) => ({ text, highlight, check, ...(extra || {}) });
  const say  = text => ({ text, manual: true });
  const ask  = d => ({ choice: true,
    text: `Would you like a guided walkthrough of ${d.title}?\n\nCards will take you through it one step at a time, and the item each step uses will glow in the build bar. Click a card's title to fold it away.\n\nYou can switch these cards off, or back on, at any time: MENU, then OPTIONS, then Tutorial Cards. Switching them back on picks up where you left off.` });
  // How every scenario ends: get the power to town, protect the lines, hold it.
  const deliver = (d, protector, name) => [
    wait('Time to deliver. Run a line east to City Hall with Power Towers: hold the mouse button and drag to set them at full reach. The Town button on the objectives panel jumps there.', T.POWERTOWER, _hallLit, { deliverStart: true }),
    wait(`A bare wire network carries only 85 kW and burns out above that. Place a ${name} anywhere on the network to raise its limit; they stack.`, protector, () => _n(T.PROTECTOR, T.PROTECTOR2, T.PROTECTOR3) >= 1),
    say(`Carry the lines on into every zone until each building is lit, then keep them lit for ${d.holdH} hours. Watch the wire colours: red means that network needs more protection.\n\nWhen every objective is green, press Sign off.`),
  ];
  // `spots`, if given: [x, y] tiles from the work area's top-left where the
  // card marks a place for each turbine (3×3, as a Wind Turbine MK2). A spot
  // stops glowing once a turbine stands on it.
  const _spotRects = spots => () => {
    if (!run) return null;
    const w = _abs(_hall(), run.def.work || WORK), turbines = [T.WIND, T.WIND2, T.WIND3].filter(Boolean);
    const out = [];
    for (const [x, y] of spots) {
      const r = { minC: w.minC + x, minR: w.minR + y, maxC: w.minC + x + 2, maxR: w.minR + y + 2 };
      let taken = false;
      for (let c = r.minC; c <= r.maxC && !taken; c++) for (let rr = r.minR; rr <= r.maxR && !taken; rr++) {
        const e = GridManager.inBounds(c, rr) ? GridManager.getEntity(c, rr) : null;
        if (e && turbines.includes(e.type)) taken = true;
      }
      if (!taken) out.push(r);
    }
    return out.length ? out : null;
  };
  const starter = (count, type, name, why, spots) => [
    wait(`${why} Open GENERATION and place ${count} ${name} in the work area west of City Hall${spots ? ', on the marked spots' : ''}.`, type,
         () => _n(T.WIND, T.WIND2, T.WIND3) >= count, { onEnter: _toWork, ...(spots ? { highlightWorld: _spotRects(spots) } : {}) }),
    wait('Wire the turbines to each other so their output adds up. Turbines placed touching share power without a wire. Three wires in a row at most, then a Power Pole.', T.WIRE, () => _n(T.WIRE) >= 2),
  ];

  const GUIDE = {
    coal: d => [
      ask(d),
      // Three touching spots beside the middle coal seam, where the card's camera lands: they share power without a wire.
      ...starter(3, T.WIND2, 'Wind Turbines MK2', 'Mines and pumps need power before they can make anything.', [[16, 36], [19, 36], [22, 36]]),
      wait('Place a Coal Mine on one of the three coal seams. The nearest free one is marked.', T.COALMINE, () => _n(T.COALMINE) >= 1, { highlightWorld: _free(T.COALDEPOSIT) }),
      wait('Run a wire from your turbines to the mine. It starts digging as soon as it has power.', T.WIRE, () => _works(T.COALMINE)),
      wait('Place a Coal Power Generator a few tiles from the mine.', T.COALGENERATOR, () => _n(T.COALGENERATOR) >= 1),
      wait("Run a Conveyor Belt from the mine's output to the generator's coal inlet. Click either building to see where its ports are. This card moves on when coal reaches the generator.", T.CONVEYOR, () => _works(T.COALGENERATOR)),
      wait('Generators need water too. Place a Water Extractor on the tarn at the south end of the work area. R rotates its outlet before you place it.', T.WATEREXTRACTOR, () => _n(T.WATEREXTRACTOR) >= 1),
      wait("Run Pipes from the extractor's outlet to the generator's water inlet, and wire the extractor into your grid. This card moves on when water reaches the generator.", T.PIPE, () => _works(T.WATEREXTRACTOR) && _any(T.COALGENERATOR, g => !!g._hasWater)),
      wait('Wire the generator in as well. With coal, water and a wire all reaching it, it starts: 100 kW. If it stays dark, click it; its panel says what is missing.', T.WIRE, () => _runs(T.COALGENERATOR)),
      wait('That is the whole chain. Now build it out: three mines, three extractors and six generators. One mine feeds two generators, and so does one extractor. The objectives panel keeps count.', T.COALGENERATOR, () => _works(T.COALMINE, 3) && _works(T.WATEREXTRACTOR, 3) && _runs(T.COALGENERATOR, 6)),
      ...deliver(d, T.PROTECTOR, 'Surge Protector'),
    ],
    oil: d => [
      ask(d),
      ...starter(4, T.WIND2, 'Wind Turbines MK2', 'A Fuel Generator cannot start itself, and pumps and refineries draw power.'),
      wait('Place a Pump Jack on one of the four oil deposits. The nearest free one is marked.', T.PUMPJACK, () => _n(T.PUMPJACK) >= 1, { highlightWorld: _free(T.OILDEPOSIT) }),
      wait('Wire the Pump Jack to your turbines so it starts pumping.', T.WIRE, () => _works(T.PUMPJACK)),
      wait('Place a Liquid Storage Tank beside it to hold the crude.', T.OILSTORAGE, () => _n(T.OILSTORAGE) >= 1),
      wait("Run Pipes from the Pump Jack's outlet into the tank's inlet. This card moves on when crude reaches the tank.", T.PIPE, () => _works(T.OILSTORAGE)),
      wait('Place an Oil Refinery and wire it in. It turns crude oil into fuel oil.', T.REFINERY, () => _powered(T.REFINERY)),
      wait("Pipe the tank's outlet into the refinery's crude inlet. This card moves on when the refinery is making fuel oil.", T.PIPE, () => _works(T.REFINERY)),
      wait('Place a Fuel Power Generator near the refinery.', T.FUELGEN, () => _n(T.FUELGEN) >= 1),
      wait("Pipe the refinery's fuel outlet into the generator, and wire the generator to your starter grid: it needs power already on its network to start. When fuel reaches it, it runs.", T.PIPE, () => _runs(T.FUELGEN)),
      wait('That is one complete line. Build three more: a pump jack, tank, refinery and generator on each of the other deposits. The objectives panel keeps count.', T.PUMPJACK, () => _works(T.PUMPJACK, 4) && _works(T.REFINERY, 4) && _runs(T.FUELGEN, 4)),
      ...deliver(d, T.PROTECTOR, 'Surge Protector'),
    ],
    hydro: d => [
      ask(d),
      ...starter(3, T.WIND2, 'Wind Turbines MK2', 'Hydro Turbines draw a little power to run.'),
      wait('Build a Dam across one of the three streams, a little way upstream of its pond. A reservoir forms behind it.', T.DAM, () => _n(T.DAM) >= 1),
      wait('Place a Hydro Turbine in the reservoir behind the dam, partly in the water.', T.HYDROTURBINE, () => _n(T.HYDROTURBINE) >= 1),
      wait('Wire the turbine to your starter grid. It makes rotation, not electricity.', T.WIRE, () => _works(T.HYDROTURBINE)),
      wait('Place a Hydroelectric Generator on the bank near the turbine.', T.HYDROGENERATOR, () => _n(T.HYDROGENERATOR) >= 1),
      wait('Run Drive Shafts from the turbine to the generator in one unbroken line, with no gaps.', T.SHAFT, () => _n(T.SHAFT) >= 1),
      wait('Wire the generator into your grid. Once the shaft is turning it, it produces power, more as the reservoir fills.', T.WIRE, () => _runs(T.HYDROGENERATOR)),
      wait('That is one turbine and generator. Each reservoir takes two, so build a second pair here, then dam the other two streams and do the same: three dams, six turbines, six generators.', T.DAM, () => _n(T.DAM) >= 3 && _works(T.HYDROTURBINE, 6) && _runs(T.HYDROGENERATOR, 6)),
      ...deliver(d, T.PROTECTOR2, 'Surge Protector MK2'),
    ],
    nuclear: d => [
      ask(d),
      ...starter(6, T.WIND3, 'Wind Turbines MK3', 'Mines, pumps and plants need about 200 kW before a reactor makes anything.'),
      wait('Place a Sulfur Mine on the sulfur deposit (marked) and wire it in.', T.SULFURMINE, () => _works(T.SULFURMINE), { highlightWorld: _free(T.SULFURDEPOSIT) }),
      wait('Place a Uranium Mine on the uranium deposit (marked) and wire it in.', T.URANIUMMINE, () => _works(T.URANIUMMINE), { highlightWorld: _free(T.URANIUMDEPOSIT) }),
      wait('Place a Water Extractor on the lake at the south end of the work area and wire it in. R rotates its outlet.', T.WATEREXTRACTOR, () => _works(T.WATEREXTRACTOR)),
      wait('Place a Chemical Plant and wire it in. It turns sulfur and water into sulfuric acid.', T.CHEMICALPLANT, () => _powered(T.CHEMICALPLANT)),
      wait("Run a Conveyor Belt from the Sulfur Mine into the Chemical Plant, and Pipes from the Water Extractor into its water inlet. This card moves on when the plant is producing acid.", T.CONVEYOR, () => _works(T.CHEMICALPLANT)),
      wait('Place a Fuel Processing Plant and wire it in. It turns acid and uranium ore into fuel rods.', T.FUELPLANT, () => _powered(T.FUELPLANT)),
      wait("Pipe the Chemical Plant's acid outlet into the Fuel Processing Plant, and run a Conveyor Belt from the Uranium Mine into it. Click a plant to see its ports and what it is short of. This card moves on when the plant is making fuel rods.", T.PIPE, () => _works(T.FUELPLANT)),
      wait('Cooling comes before fuel. A reactor needs 20 u/s of cooling and a tower makes 15, so place two Cooling Towers and wire them in.', T.COOLINGTOWER, () => _powered(T.COOLINGTOWER) && _n(T.COOLINGTOWER) >= 2),
      wait('Place a Nuclear Reactor near the towers.', T.NUCLEARREACTOR, () => _n(T.NUCLEARREACTOR) >= 1),
      wait("Each tower drinks 15 u/s of water and an extractor gives 25, so put a second Water Extractor on the lake. Pipe the extractors into both towers' H2O IN, and both towers' COOL OUT into the reactor's COOL IN. Never fuel a reactor that is not cooled: without cooling its core heats up, a meltdown clock starts, and a meltdown levels everything around it. This card moves on when the reactor is cooled.", T.PIPE, () => _works(T.WATEREXTRACTOR, 2) && _works(T.COOLINGTOWER, 2) && _works(T.NUCLEARREACTOR)),
      wait('A reactor makes steam, not power. Place a Steam Turbine beside it.', T.STEAMTURBINE, () => _n(T.STEAMTURBINE) >= 1),
      wait("Pipe the reactor's steam outlet to the turbine and wire the turbine into your grid. Then run a Conveyor Belt of fuel rods from the Fuel Processing Plant to the reactor. When rods, cooling and steam are all connected, the turbine runs: 300 kW.", T.CONVEYOR, () => _runs(T.STEAMTURBINE)),
      wait('Each reactor drives three turbines. Add two more to this one, then build a second reactor with its own two Cooling Towers (and their extractors) and three turbines. One Fuel Processing Plant feeds both.', T.STEAMTURBINE, () => _works(T.NUCLEARREACTOR, 2) && _works(T.COOLINGTOWER, 4) && _works(T.WATEREXTRACTOR, 4) && _runs(T.STEAMTURBINE, 6)),
      ...deliver(d, T.PROTECTOR3, 'Surge Protector MK3'),
    ],
    fusion: d => [
      ask(d),
      wait('The fuel chain and the reactor need about 600 kW before fusion makes a watt. Build a starter grid in the work area west of City Hall: Geothermal Wells and Turbines on the vents, and a coal line on the seams beside the lake. This card moves on at 300 kW.', T.GEOWELL,
           () => (PowerNetwork.stats.totalGenerated || 0) >= 300, { onEnter: _toWork }),
      wait('Deuterium first. Place a Water Extractor on the lake and an Electrolyzer near it, and wire both in. The Electrolyzer splits water into hydrogen.', T.ELECTROLYZER, () => _works(T.ELECTROLYZER)),
      wait('Place an Atmosphere Collector and wire it in. It pulls nitrogen out of the air.', T.ATMOSCOLLECTOR, () => _powered(T.ATMOSCOLLECTOR)),
      wait('Place a Haber-Bosch Complex and wire it in. Pipe the hydrogen and the nitrogen into it; it makes ammonia.', T.HABERBOSCH, () => _works(T.HABERBOSCH)),
      wait('Place an Isotopic Wash Tower and wire it in. Pipe in ammonia from the Haber-Bosch Complex and water from an extractor; it washes deuterium out of the water.', T.WASHTOWER, () => _works(T.WASHTOWER)),
      wait('Now helium-3. Place a Helium Well on a helium gas field (marked) and wire it in.', T.HELIUMWELL, () => _powered(T.HELIUMWELL), { highlightWorld: _free(T.HELIUMDEPOSIT) }),
      wait('Place a Helium-3 Separator, wire it in, and pipe the Helium Well into its HE IN.', T.HE3SEPARATOR, () => _works(T.HE3SEPARATOR)),
      wait('Place a Fusion Fuel Plant and wire it in.', T.FUSIONFUELPLANT, () => _powered(T.FUSIONFUELPLANT)),
      wait("Pipe deuterium from the Wash Tower into the Fuel Plant's D2 IN and helium-3 from the Separator into its HE-3 IN. Here it makes D-He3 only, the fuel the MHD Rings run on, and freezes the two into fuel pellets. This card moves on when the plant is making fuel.", T.PIPE, () => _works(T.FUSIONFUELPLANT)),
      wait('The reactor needs cold magnets. Place a second Helium Well on the other gas field.', T.HELIUMWELL, () => _n(T.HELIUMWELL) >= 2, { highlightWorld: _free(T.HELIUMDEPOSIT) }),
      wait("Place a Cryo Plant, wire it in, and pipe that Helium Well into its HE IN.", T.CRYOPLANT, () => _works(T.CRYOPLANT)),
      wait("Place the Fusion Reactor and wire it in. Pipe the Cryo Plant's LHe OUT into its LHe IN: the magnets must cool to 4.5 K before it will ignite.", T.HULKINGFUSIONREACTOR, () => _powered(T.HULKINGFUSIONREACTOR)),
      wait('Place two MHD Decelerator Rings beside the reactor. Each turns the plasma straight into 4 MW.', T.MHDRING, () => _n(T.MHDRING) >= 2),
      wait('Run a Conveyor Belt of pellets from the Fuel Plant to the reactor, pipe the reactor into both rings, and wire the rings into your grid. When the magnets are cold and the pellets arrive, it ignites.', T.CONVEYOR, () => _runs(T.MHDRING)),
      ...deliver(d, T.PROTECTOR3, 'Surge Protector MK3'),
    ],
    winter: d => [
      ask(d),
      ...starter(3, T.WIND2, 'Wind Turbines MK2', 'Wells and hydro turbines draw power to run, and wind is the one thing a blizzard is good for.'),
      wait('Place a Geothermal Well on one of the six vents at the north end of the work area. The nearest free one is marked.', T.GEOWELL, () => _n(T.GEOWELL) >= 1, { highlightWorld: _free(T.GEODEPOSIT) }),
      wait('Wire the well to your turbines. It starts raising steam as soon as it has power.', T.WIRE, () => _powered(T.GEOWELL)),
      wait("Place a Geothermal Turbine over the well's steam output port and wire it in. One turbine per well. Ground heat runs the same in a blizzard as on a clear day.", T.GEOTURBINE, () => _runs(T.GEOTURBINE)),
      wait('That is one vent working. Do the same on the other five: six wells, six turbines. The objectives panel keeps count.', T.GEOWELL, () => _runs(T.GEOTURBINE, 6)),
      wait('Now the meltwater. Build a Dam across one of the two streams, a little way upstream of its pond. A reservoir forms behind it.', T.DAM, () => _n(T.DAM) >= 1),
      wait('Place a Hydro Turbine in the reservoir, partly in the water, and wire it in. It makes rotation, not electricity.', T.HYDROTURBINE, () => _works(T.HYDROTURBINE)),
      wait('Place a Hydroelectric Generator on the bank and run Drive Shafts from the turbine to it in one unbroken line. Wire the generator into your grid.', T.HYDROGENERATOR, () => _runs(T.HYDROGENERATOR)),
      wait('Each reservoir takes two turbines and two generators. Finish this one, then dam the second stream and do the same.', T.DAM, () => _n(T.DAM) >= 2 && _works(T.HYDROTURBINE, 4) && _runs(T.HYDROGENERATOR, 4)),
      say('Watch the WEATHER tab. When the blizzard comes in every home turns its heating up, so the town draws well over what it does in the calm. Build enough to carry the storm.'),
      ...deliver(d, T.PROTECTOR2, 'Surge Protector MK2'),
    ],
    heat: d => [
      ask(d),
      wait('Under this sky a panel gives everything it has. Open GENERATION and place 6 Solar Panels MK2 in the work area west of City Hall, touching, so they share power without a wire.', T.SOLAR2, () => _n(T.SOLAR2) >= 6, { onEnter: _toWork }),
      wait('Place a Battery beside the panels and wire it to them. It fills while the sun is up.', T.BATTERY, () => _n(T.BATTERY) >= 1),
      wait('Keep going: twenty-four panels and ten batteries at least. The batteries are for the evening, when the heat wave is still running and the panels have gone dark.', T.SOLAR2, () => _n(T.SOLAR2) >= 24 && _n(T.BATTERY) >= 10),
      wait('Sun will not get the town through the night. Place a Pump Jack on the oil deposit (marked) and wire it in.', T.PUMPJACK, () => _works(T.PUMPJACK), { highlightWorld: _free(T.OILDEPOSIT) }),
      wait('Place a Liquid Storage Tank beside it and pipe the Pump Jack into it.', T.OILSTORAGE, () => _works(T.OILSTORAGE)),
      wait("Place an Oil Refinery, wire it in, and pipe the tank's outlet into its crude inlet.", T.REFINERY, () => _works(T.REFINERY)),
      wait("Place a Fuel Power Generator, pipe the refinery's fuel outlet into it and wire it to your panels: it needs power already on its network to start.", T.FUELGEN, () => _runs(T.FUELGEN)),
      say('That generator carries the small hours. It cannot carry the evening on its own: watch the batteries as the sun goes down, and add panels and batteries until they last until the heat wave breaks.'),
      ...deliver(d, T.PROTECTOR, 'Surge Protector'),
    ],
    storm: d => [
      ask(d),
      ...starter(3, T.WIND2, 'Wind Turbines MK2', 'Mines and pumps need power before they can make anything, and the wind here is strong.'),
      wait('Place a Coal Mine on one of the two coal seams (marked) and wire it in.', T.COALMINE, () => _works(T.COALMINE), { highlightWorld: _free(T.COALDEPOSIT) }),
      wait('Place a Coal Power Generator a few tiles from the mine.', T.COALGENERATOR, () => _n(T.COALGENERATOR) >= 1),
      wait("Run a Conveyor Belt from the mine's output to the generator's coal inlet. This card moves on when coal reaches the generator.", T.CONVEYOR, () => _works(T.COALGENERATOR)),
      wait("Place a Water Extractor on the lagoon, wire it in, and run Pipes from it to the generator's water inlet. Then wire the generator in: with coal, water and a wire it starts.", T.WATEREXTRACTOR, () => _runs(T.COALGENERATOR)),
      wait('Before the first storm: place a Lightning Rod among your plant. Buildings near a rod are far less likely to be struck, and a struck building is off the grid until you click it and repair it.', T.LIGHTNINGROD, () => _n(T.LIGHTNINGROD, T.LIGHTNINGROD2) >= 1),
      wait('Build the coal side out: two mines and four generators, one mine and one extractor to every two generators.', T.COALGENERATOR, () => _works(T.COALMINE, 2) && _runs(T.COALGENERATOR, 4)),
      wait('Now oil. Place a Pump Jack on one of the two oil deposits (marked) and wire it in.', T.PUMPJACK, () => _works(T.PUMPJACK), { highlightWorld: _free(T.OILDEPOSIT) }),
      wait('Pipe it into a Liquid Storage Tank, the tank into an Oil Refinery, and the refinery into a Fuel Power Generator. Wire the refinery and the generator in.', T.FUELGEN, () => _runs(T.FUELGEN)),
      say('Build the second oil line, and stand Lightning Rods across the plant and through the town; four is the least that will do. When the rainstorm comes through, watch for struck buildings and repair them quickly: the hold breaks while any building in town is dark.'),
      ...deliver(d, T.PROTECTOR2, 'Surge Protector MK2'),
    ],
    launch: d => [
      ask(d),
      ...starter(3, T.WIND2, 'Wind Turbines MK2', 'Hydro Turbines draw a little power to run.'),
      wait('Build a Dam across one of the three streams, a little way upstream of its pond. A reservoir forms behind it.', T.DAM, () => _n(T.DAM) >= 1),
      wait('Place a Hydro Turbine in the reservoir, partly in the water, and wire it in. It makes rotation, not electricity.', T.HYDROTURBINE, () => _works(T.HYDROTURBINE)),
      wait('Place a Hydroelectric Generator on the bank and run Drive Shafts from the turbine to it in one unbroken line. Wire the generator into your grid.', T.HYDROGENERATOR, () => _runs(T.HYDROGENERATOR)),
      wait('Each reservoir takes two turbines and two generators. Finish this one, then dam the other two streams the same way. The two geothermal vents are there too, if you want a little more.', T.DAM, () => _n(T.DAM) >= 3 && _works(T.HYDROTURBINE, 6) && _runs(T.HYDROGENERATOR, 6)),
      wait('Now the part that flies the rocket. Place a Substation MK5 on your network. It stores power while there is spare and gives up to 8 MW of it back at once.', T.SUBSTATION5, () => _n(T.SUBSTATION4, T.SUBSTATION5) >= 1),
      say('The terminal count takes 12.6 MW, and the town and the dams are still there underneath it. Two Substations MK5, or one and a couple of MK4s, will carry it. They fill only from what the dams make beyond what the town is using, so build them early.'),
      ...deliver(d, T.PROTECTOR3, 'Surge Protector MK3'),
      say('Watch the objectives panel as the window comes up. Through propellant loading and the final count, keep an eye on the storage: if it runs dry before liftoff the count is scrubbed and comes round again 20 hours later.'),
    ],
    fieldcore: d => {
      const bin = () => { for (const e of EntityRegistry.getByType(T.SOLIDSTORAGE)) if (e._clientOwned) return e; return null; };
      const reactor = () => { for (const e of EntityRegistry.getByType(T.HULKINGFUSIONREACTOR)) return e; return null; };
      return [
        ask(d),
        ...starter(4, T.WIND3, 'Wind Turbines MK3', 'The reactor and its helium plant need power before fusion makes any.'),
        wait('Place a Helium Well on the helium gas field (marked) and wire it in.', T.HELIUMWELL, () => _works(T.HELIUMWELL), { highlightWorld: _free(T.HELIUMDEPOSIT) }),
        wait('Place a Cryo Plant, wire it in, and pipe the Helium Well into its HE IN.', T.CRYOPLANT, () => _works(T.CRYOPLANT)),
        wait("Place the Fusion Reactor and wire it in. Pipe the Cryo Plant's LHe OUT into its LHe IN: the magnets must cool to 4.5 K before it will ignite.", T.HULKINGFUSIONREACTOR, () => _powered(T.HULKINGFUSIONREACTOR)),
        wait("The client's Storage Container (marked) holds D-T pellets and is kept full. Run a Conveyor Belt from its OUT to the reactor's pellet inlet.", T.CONVEYOR, () => _n(T.CONVEYOR) >= 3, { highlightWorld: bin }),
        wait("Place a Steam Turbine MK2, pipe the reactor's steam outlet to it and wire it in. When the magnets are cold and the pellets arrive, the reactor ignites.", T.STEAMTURBINE2, () => _runs(T.STEAMTURBINE2)),
        wait('One reactor raises steam for five Steam Turbines MK2: 6 MW. Build the other four. That is all the reactor makes on its own, and the town needs more.', T.STEAMTURBINE2, () => _runs(T.STEAMTURBINE2, 5)),
        wait('Now the Field Cores. Place a Rare Earth Mine on a rare earth deposit (marked) and wire it in.', T.RAREEARTHMINE, () => _powered(T.RAREEARTHMINE), { highlightWorld: _free(T.RAREEARTHDEPOSIT) }),
        wait('The ore is leached with sulfuric acid. Place a Sulfur Mine on the sulfur deposit (marked), a Chemical Plant, and a Water Extractor on the lake. Belt the sulfur and pipe the water into the Chemical Plant. This card moves on when it is producing acid.', T.CHEMICALPLANT, () => _works(T.CHEMICALPLANT), { highlightWorld: _free(T.SULFURDEPOSIT) }),
        wait("Place a Leach Plant and wire it in. Belt ore into it from the Rare Earth Mine and pipe in acid from the Chemical Plant. Rare earth oxide comes out on a belt. Its thorium tailings stay in the plant; this job ends long before they fill it.", T.LEACHPLANT, () => _works(T.LEACHPLANT)),
        wait('The tape mill needs hydrogen and nitrogen. Place an Electrolyzer, piped from a Water Extractor, and an Atmosphere Collector, and wire both in.', T.ELECTROLYZER, () => _works(T.ELECTROLYZER) && _works(T.ATMOSCOLLECTOR)),
        wait("Place a Superconductor Mill and wire it in. Belt in the Leach Plant's oxide and pipe in the hydrogen and the nitrogen. It makes HTS tape.", T.SCMILL, () => _works(T.SCMILL)),
        wait('Place a Core Works and belt the tape into it. 120 tape winds a core, and four hours at 800 kW charges it. Click it to watch its four bays.', T.COREWORKS, () => _works(T.COREWORKS)),
        wait('Cores travel by drone. Place a Drone Port within reach of both the Core Works and the reactor, on the same network, and wire it in.', T.DRONEPORT, () => _powered(T.DRONEPORT)),
        wait('Click the Fusion Reactor and set Field Cores to 2. The drones bring each charged core over as soon as there is one; each makes every turbine it feeds run harder.', T.HULKINGFUSIONREACTOR,
             () => { const r = reactor(); return !!(r && FieldCoreSystem.wanted(r) >= 2); }, { highlightWorld: reactor }),
        ...deliver(d, T.PROTECTOR3, 'Surge Protector MK3'),
      ];
    },
  };
  // Built once per scenario and kept: TutorialSystem tells sequences apart by identity.
  const _guides = new Map();
  function _guide(def) {
    if (!_guides.has(def.id)) _guides.set(def.id, { id: `scn-${def.id}`, title: def.title, trigger: () => false, steps: _gateDeliver(GUIDE[def.id](def)) });
    return _guides.get(def.id);
  }

  // The plant on the objectives panel is all built (and running, where a
  // goal asks for that): its first goals are the scenario's own (see
  // _objectives). `check` goals (the launch, the field cores) are left out:
  // they only come once power reaches town, which is what the cards after
  // this are about.
  const BUILD_KINDS = new Set(['place', 'running', 'store']);
  const _plantDone = () => {
    if (!run || !run.reqs) return false;
    const res = run.reqs.evaluate(), n = run.def.goals.length;
    for (let i = 0; i < n && i < res.length; i++) if (BUILD_KINDS.has(res[i].kind) && !res[i].pass) return false;
    return true;
  };
  // "Time to deliver" waits until the plant is all ticked off: the card
  // before it stays up until then (a Continue card loses its button), on
  // top of whatever that card itself waits for.
  function _gateDeliver(steps) {
    const i = steps.findIndex(s => s.deliverStart);
    if (i < 1) return steps;
    const prev = steps[i - 1], own = prev.manual ? null : prev.check;
    steps[i - 1] = { ...prev, manual: false, check: own ? () => own() && _plantDone() : _plantDone,
                     text: `${prev.text}\n\nThis card stays up until every build goal on the objectives panel is ticked off.` };
    return steps;
  }

  // ── The objectives panel ─────────────────────────────────────────
  // Top-right, under the HUD, until the player drags it somewhere else by
  // its header (the position is remembered). Rebuilt a few times a second from the
  // requirement set; mousedown rather than click on its buttons, because a
  // rebuild between press and release would swallow a click.
  const COLLAPSE_KEY = 'gw_scenario_panel_collapsed';
  const POS_KEY      = 'gw_scenario_panel_pos';
  let _panelSig = null;
  const ROW_LABEL = {
    service: () => 'Power every building in town, and City Hall',
    protect: () => 'Fit surge protection on every line',
    sustain: () => `Keep everything powered for ${run.def.holdH} hours without a break`,
  };
  function _panel() {
    let el = document.getElementById('scn-panel');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'scn-panel';
    el.addEventListener('mousedown', ev => {
      if (ev.button !== 0 || !run) return;
      const hit = sel => ev.target.closest(sel);
      if (hit('[data-p-toggle]')) {
        // The header both moves the panel and collapses it, told apart by
        // movement: a press that travels is a drag, one that does not is a click.
        const box = el.getBoundingClientRect();
        const start = { x: ev.clientX, y: ev.clientY, left: box.left, top: box.top, moved: false };
        const move = e => {
          const dx = e.clientX - start.x, dy = e.clientY - start.y;
          if (!start.moved && Math.abs(dx) + Math.abs(dy) <= 4) return;
          start.moved = true;
          el.classList.add('dragging');
          _placePanel(el, start.left + dx, start.top + dy);
          e.preventDefault();
        };
        const up = () => {
          window.removeEventListener('mousemove', move, true);
          window.removeEventListener('mouseup', up, true);
          el.classList.remove('dragging');
          if (start.moved) {
            try { localStorage.setItem(POS_KEY, JSON.stringify({ left: parseFloat(el.style.left) || 0, top: parseFloat(el.style.top) || 0 })); } catch (_e) {}
            return;
          }
          let c = false;
          try { c = localStorage.getItem(COLLAPSE_KEY) !== '1'; localStorage.setItem(COLLAPSE_KEY, c ? '1' : '0'); } catch (_e) {}
          try { SFX.click?.(); } catch (_e) {}
          _panelSig = null; _renderPanel();
        };
        window.addEventListener('mousemove', move, true);
        window.addEventListener('mouseup', up, true);
        ev.preventDefault();     // no text selection while dragging
        return;
      } else if (hit('[data-p-sign]')) signOff();
      else if (hit('[data-p-brief]')) showBriefing();
      else if (hit('[data-p-quit]')) confirmQuit();
      else if (hit('[data-p-go]')) {
        const s = run.spots && run.spots[hit('[data-p-go]').dataset.pGo];
        if (s) Camera.recentreOn(s.c * TILE, s.r * TILE);
      } else return;
      try { SFX.click?.(); } catch (_e) {}
      ev.preventDefault();
    });
    document.body.appendChild(el);
    // Back where the player last left it; and a window that shrinks must not strand it off screen.
    try { const pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); if (pos) _placePanel(el, pos.left, pos.top); } catch (_e) {}
    window.addEventListener('resize', () => { if (el.style.left) _placePanel(el, parseFloat(el.style.left) || 0, parseFloat(el.style.top) || 0); });
    return el;
  }
  // Keeps at least the header on screen.
  function _placePanel(el, left, top) {
    el.style.left = Math.max(4, Math.min(window.innerWidth - 120, left)) + 'px';
    el.style.top  = Math.max(4, Math.min(window.innerHeight - 56, top)) + 'px';
    el.style.maxHeight = `calc(100vh - ${Math.round(parseFloat(el.style.top) + 16)}px)`;
  }
  function _renderPanel() {
    if (!run || !run.reqs) return;
    const el = _panel(), d = run.def;
    let collapsed = false;
    try { collapsed = localStorage.getItem(COLLAPSE_KEY) === '1'; } catch (_e) {}
    const rows = run.reqs.evaluate(true);
    const passed = rows.filter(r => r.pass).length, all = passed === rows.length;
    // What the plant is worth so far, against the medals (see `medals`).
    const spent = run.done && run.result && run.result.spent != null ? run.result.spent : builtValue();
    const pace = spent <= d.medals.gold ? 'gold' : spent <= d.medals.silver ? 'silver' : 'bronze';
    const sig = [collapsed, run.done, clockText(), spent, ...rows.map(r => `${r.pass}:${r.progress.toFixed(3)}:${r.detail}`)].join('|');
    if (sig === _panelSig) return;
    _panelSig = sig;
    // Collapsed, the panel is a compact strip: overall progress as one bar and
    // the next thing to do, so it still answers "what now?" at a glance.
    const next = rows.find(r => !r.pass);
    const overall = rows.reduce((t, r) => t + (r.pass ? 1 : Math.min(0.99, r.progress || 0)), 0) / rows.length;
    const label = r => (ROW_LABEL[r.kind] || (() => r.label))();
    const body = collapsed ? `
      <div class="scn-p-mini">
        <div class="scn-p-bar"><b style="width:${Math.round(overall * 100)}%"></b></div>
        <div class="scn-p-next${next ? '' : ' ok'}">${next
          ? `<span>Next</span>${esc(label(next))}${next.detail ? ` <em>${esc(next.detail)}</em>` : ''}`
          : (run.done ? '<span>Done</span>Signed off' : '<span>Ready</span>Every objective met: open to sign off')}</div>
      </div>` : `
      <div class="scn-p-rows">${rows.map(r => `
        <div class="scn-p-row${r.pass ? ' ok' : ''}">
          <i>${r.pass ? '✔' : ''}</i>
          <div>
            <div class="scn-p-l">${esc(label(r))}</div>
            <div class="scn-p-bar"><b style="width:${Math.round(r.progress * 100)}%"></b></div>
            <div class="scn-p-d">${esc(r.detail || '')}</div>
          </div>
        </div>`).join('')}
      </div>
      <div class="scn-p-spend" title="The medal goes by the value of what you have built: gold up to ${_money(d.medals.gold)}, silver up to ${_money(d.medals.silver)}">
        <i style="background:${MEDAL[pace].col}"></i><span>Built</span><b>${_money(spent)}</b>
        <em>${pace === 'gold' ? `gold up to ${_money(d.medals.gold)}` : pace === 'silver' ? `silver up to ${_money(d.medals.silver)}` : 'bronze'}</em>
      </div>
      <div class="scn-p-foot">
        <button class="scn-p-sign${all || run.done ? ' on' : ''}" data-p-sign ${all || run.done ? '' : 'disabled'}>${run.done ? 'Results' : 'Sign off'}</button>
        <div class="scn-p-btns">
          <button data-p-go="work">Work area</button><button data-p-go="town">Town</button>
          <button data-p-brief>Briefing</button><button data-p-quit>Quit</button>
        </div>
      </div>`;
    el.classList.toggle('collapsed', collapsed);
    el.classList.toggle('all', all || run.done);
    // The panel is rebuilt whenever a reading changes (the clock does every
    // game minute), which would throw a scrolled list back to the top.
    const _oldRows = el.querySelector('.scn-p-rows'), _scroll = _oldRows ? _oldRows.scrollTop : 0;
    el.innerHTML = `
      <div class="scn-p-head" data-p-toggle title="Drag to move · click to ${collapsed ? 'show' : 'hide'} objectives">
        <div><span>${esc(d.kicker)}</span><b>${esc(d.title)}</b></div>
        <div class="scn-p-n"><b>${passed}/${rows.length}</b><span>${run.done ? '✔' : '⏱'} ${clockText()}</span></div>
        <svg class="scn-p-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5"/></svg>
      </div>${body}`;
    const _newRows = el.querySelector('.scn-p-rows');
    if (_newRows && _scroll) _newRows.scrollTop = _scroll;
  }

  // ── UI ───────────────────────────────────────────────────────────
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const MEDAL = {
    gold:   { label: 'Gold',   col: '#f5c451', glow: 'rgba(245,196,81,0.55)' },
    silver: { label: 'Silver', col: '#cfd8e3', glow: 'rgba(207,216,227,0.45)' },
    bronze: { label: 'Bronze', col: '#d08a4e', glow: 'rgba(208,138,78,0.45)' },
  };
  const _power = kw => kw >= 1000 ? `${(kw / 1000).toFixed(kw >= 10000 ? 0 : 1)} MW` : `${Math.round(kw)} kW`;
  const LEVEL_COL = { Medium: '#f5b83d', Hard: '#ff8a4a', Expert: '#ff5d5d' };

  function _css() {
    if (document.getElementById('scn-css')) return;
    const st = document.createElement('style');
    st.id = 'scn-css';
    st.textContent = `
      /* A scenario's town is handed over ready made: hide the HUD for growing one. */
      body.gw-scenario #btn-progress, body.gw-scenario #progress-tracker, body.gw-scenario #btn-requests,
      body.gw-scenario #hotbar-req-btn,
      body.gw-scenario #gov-stat-btn, body.gw-scenario #gov-stat-btn + .stat-divider,
      body.gw-scenario #score-stat-btn, body.gw-scenario #score-stat-btn + .stat-divider { display: none !important; }

      #scn-panel { position: fixed; top: 96px; right: 14px; z-index: 820; width: 320px; max-height: calc(100vh - 230px);
        display: flex; flex-direction: column; overflow: hidden; pointer-events: all; font-family: 'Inter', system-ui, sans-serif;
        background: rgba(8,13,22,0.94); border: 1px solid rgba(95,216,255,0.24); border-radius: 8px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.5); }
      body:not(.gw-scenario) #scn-panel, body.gw-intro #scn-panel { display: none; }
      .scn-p-head { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; cursor: grab; user-select: none; }
      #scn-panel.dragging { transition: none; box-shadow: 0 18px 50px rgba(0,0,0,0.65); }
      #scn-panel.dragging .scn-p-head { cursor: grabbing; }
      .scn-p-head span { display: block; font: 600 9px 'JetBrains Mono', monospace; letter-spacing: 0.2em; text-transform: uppercase; color: #5fd8ff; }
      .scn-p-head b { display: block; margin-top: 4px; font: 800 14px 'Orbitron', 'Inter', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: #f0f5fb; }
      .scn-p-n { text-align: right; flex: none; }
      .scn-p-n b { font: 700 13px 'JetBrains Mono', monospace; letter-spacing: 0; color: #f0f5fb; }
      .scn-p-n span { margin-top: 4px; color: #9fb2c6; letter-spacing: 0.04em; text-transform: none; font-variant-numeric: tabular-nums; white-space: nowrap; }
      .scn-p-chev { flex: none; width: 12px; height: 12px; fill: none; stroke: #7a8b9f; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;
        transform: rotate(180deg); transition: transform .18s ease, stroke .15s; }
      #scn-panel.collapsed .scn-p-chev { transform: none; }
      .scn-p-head:hover .scn-p-chev { stroke: #f0f5fb; }
      #scn-panel { transition: width .18s ease; }
      #scn-panel.collapsed { width: 290px; }
      #scn-panel.collapsed .scn-p-head { padding-bottom: 9px; }
      #scn-panel.all { border-color: rgba(61,220,132,0.5); }
      .scn-p-mini { padding: 0 14px 12px; }
      .scn-p-mini .scn-p-bar { margin-top: 0; height: 4px; }
      #scn-panel.all .scn-p-mini .scn-p-bar b { background: #3ddc84; }
      .scn-p-next { margin-top: 8px; font-size: 11.5px; line-height: 1.4; color: #c3d0de;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .scn-p-next span { margin-right: 7px; font: 700 9px 'JetBrains Mono', monospace; letter-spacing: 0.16em; text-transform: uppercase; color: #5fd8ff; }
      .scn-p-next.ok span { color: #3ddc84; }
      .scn-p-next em { font-style: normal; font: 500 10px 'JetBrains Mono', monospace; color: #7a8b9f; white-space: nowrap; }
      .scn-p-rows { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 14px; border-top: 1px solid rgba(150,180,215,0.1); }
      .scn-p-spend { flex: none; display: flex; align-items: center; gap: 7px; padding: 8px 14px; border-top: 1px solid rgba(150,180,215,0.1);
        font-size: 11.5px; color: #9fb2c6; }
      .scn-p-spend i { flex: none; width: 8px; height: 8px; border-radius: 50%; }
      .scn-p-spend span { font: 600 9px 'JetBrains Mono', monospace; letter-spacing: 0.16em; text-transform: uppercase; color: #5fd8ff; }
      .scn-p-spend b { font: 700 12px 'JetBrains Mono', monospace; color: #f0f5fb; }
      .scn-p-spend em { margin-left: auto; font-style: normal; font: 500 10px 'JetBrains Mono', monospace; color: #7a8b9f; white-space: nowrap; }
      .scn-p-row { display: flex; gap: 10px; padding: 10px 0; border-top: 1px solid rgba(150,180,215,0.07); }
      .scn-p-row:first-child { border-top: 0; }
      .scn-p-row > i { flex: none; width: 16px; height: 16px; margin-top: 1px; border-radius: 50%; border: 1px solid rgba(150,180,215,0.3);
        display: flex; align-items: center; justify-content: center; font: 700 10px 'Inter', sans-serif; font-style: normal; color: #06101a; }
      .scn-p-row.ok > i { background: #3ddc84; border-color: #3ddc84; }
      .scn-p-row > div { flex: 1; min-width: 0; }
      .scn-p-l { font-size: 12px; line-height: 1.4; color: #c3d0de; }
      .scn-p-row.ok .scn-p-l { color: #8fe0b4; }
      .scn-p-bar { height: 3px; margin-top: 6px; border-radius: 2px; background: rgba(150,180,215,0.12); }
      .scn-p-bar b { display: block; height: 3px; border-radius: 2px; background: #3b9eff; }
      .scn-p-row.ok .scn-p-bar b { background: #3ddc84; }
      .scn-p-d { margin-top: 4px; font: 500 10px 'JetBrains Mono', monospace; color: #7a8b9f; }
      .scn-p-foot { flex: none; padding: 10px 14px 12px; border-top: 1px solid rgba(150,180,215,0.1); }
      .scn-p-foot button { font: 700 10px 'Orbitron', 'Inter', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; cursor: pointer;
        border-radius: 5px; border: 1px solid rgba(150,180,215,0.2); background: rgba(255,255,255,0.03); color: #9fb2c6; padding: 7px 0; }
      .scn-p-foot button:hover { color: #f0f5fb; border-color: rgba(150,180,215,0.45); }
      .scn-p-sign { width: 100%; padding: 10px 0 !important; }
      .scn-p-sign[disabled] { cursor: default; opacity: 0.45; }
      .scn-p-sign.on { background: linear-gradient(180deg, #3ddc84, #1f9e58); border-color: #6ff0a8; color: #04140b; }
      .scn-p-sign.on:hover { color: #04140b; filter: brightness(1.1); }
      .scn-p-btns { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 8px; }
      .scn-p-btns button { font-size: 8.5px; letter-spacing: 0.06em; }

      .scn-overlay { position: fixed; inset: 0; z-index: 7000; display: flex; align-items: center; justify-content: center;
        padding: 16px; background: rgba(3,7,13,0.78); backdrop-filter: blur(3px); pointer-events: all;
        font-family: 'Inter', system-ui, sans-serif; animation: scnFade .25s ease both; }
      @keyframes scnFade { from { opacity: 0; } }
      .scn-box { width: min(980px, 100%); max-height: calc(100vh - 32px); display: flex; flex-direction: column;
        background: linear-gradient(180deg, rgba(13,20,31,0.98), rgba(7,12,20,0.98));
        border: 1px solid rgba(95,216,255,0.28); border-radius: 10px;
        box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04); }
      .scn-box.narrow { width: min(620px, 100%); }
      .scn-head { flex: none; display: flex; align-items: flex-end; justify-content: space-between; gap: 16px;
        padding: 20px 24px 16px; border-bottom: 1px solid rgba(150,180,215,0.12); }
      .scn-kicker { font: 600 10px 'JetBrains Mono', monospace; letter-spacing: 0.28em; text-transform: uppercase; color: #5fd8ff; }
      .scn-title { margin-top: 6px; font: 800 24px 'Orbitron', 'Inter', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: #f0f5fb; }
      .scn-sub { margin-top: 6px; font-size: 13px; line-height: 1.5; color: #9fb2c6; }
      .scn-x { flex: none; background: none; border: 1px solid rgba(150,180,215,0.2); border-radius: 6px; color: #9fb2c6;
        font: 600 11px 'Inter', sans-serif; letter-spacing: 0.08em; padding: 7px 12px; cursor: pointer; }
      .scn-x:hover { color: #f0f5fb; border-color: rgba(150,180,215,0.45); }
      .scn-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 18px 24px 6px; }
      .scn-foot { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
        padding: 14px 24px 18px; border-top: 1px solid rgba(150,180,215,0.12); }
      .scn-note { font-size: 11.5px; line-height: 1.5; color: #7a8b9f; flex: 1 1 240px; }
      .scn-btns { display: flex; gap: 10px; flex-wrap: wrap; }
      .scn-btn { border: 1px solid rgba(150,180,215,0.24); border-radius: 6px; background: rgba(255,255,255,0.03); color: #c3d0de;
        font: 700 11px 'Orbitron', 'Inter', sans-serif; letter-spacing: 0.16em; text-transform: uppercase;
        padding: 11px 18px; cursor: pointer; transition: background .15s, border-color .15s, color .15s, transform .15s; }
      .scn-btn:hover { background: rgba(255,255,255,0.07); color: #f0f5fb; border-color: rgba(150,180,215,0.5); }
      .scn-btn.go { background: linear-gradient(180deg, #5fd8ff, #0a8fcf); border-color: #7fe2ff; color: #04121c; }
      .scn-btn.go:hover { filter: brightness(1.1); transform: translateY(-1px); color: #04121c; }
      .scn-btn.bad:hover { border-color: #ff5d5d; color: #ff8a8a; }

      .scn-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 14px; padding-bottom: 14px; }
      .scn-card { position: relative; display: flex; flex-direction: column; gap: 10px; text-align: left; padding: 16px 16px 14px;
        background: rgba(255,255,255,0.025); border: 1px solid rgba(150,180,215,0.14); border-radius: 8px; cursor: pointer;
        color: inherit; font: inherit; transition: border-color .15s, background .15s, transform .15s, box-shadow .15s; }
      .scn-card:hover, .scn-card:focus-visible { outline: none; border-color: rgba(95,216,255,0.65); background: rgba(95,216,255,0.06);
        transform: translateY(-2px); box-shadow: 0 10px 28px rgba(0,0,0,0.45), 0 0 22px rgba(95,216,255,0.12); }
      .scn-modes { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
      .scn-modes .scn-card { padding: 22px 20px 16px; gap: 12px; }
      .scn-modes .scn-card-t { font-size: 22px; }
      .scn-modes .scn-card-p { font-size: 13.5px; line-height: 1.6; }
      .scn-card-k { font: 600 9.5px 'JetBrains Mono', monospace; letter-spacing: 0.24em; text-transform: uppercase; color: #5fd8ff; }
      .scn-card-t { font: 800 17px 'Orbitron', 'Inter', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; color: #f0f5fb; }
      .scn-card-p { font-size: 12.5px; line-height: 1.5; color: #9fb2c6; flex: 1; }
      .scn-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .scn-chip { font: 600 10px 'JetBrains Mono', monospace; letter-spacing: 0.06em; padding: 4px 8px; border-radius: 999px;
        border: 1px solid rgba(150,180,215,0.18); color: #9fb2c6; white-space: nowrap; }
      .scn-card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 2px;
        padding-top: 10px; border-top: 1px solid rgba(150,180,215,0.1); font: 600 10.5px 'JetBrains Mono', monospace; color: #7a8b9f; }
      .scn-play { color: #5fd8ff; letter-spacing: 0.2em; }
      .scn-medal { display: inline-flex; align-items: center; gap: 6px; }
      .scn-dot { width: 10px; height: 10px; border-radius: 50%; }

      .scn-card-acts { display: inline-flex; align-items: center; gap: 12px; }
      .scn-link { background: none; border: 0; padding: 2px 0; cursor: pointer; color: #7a8b9f;
        font: 600 10.5px 'JetBrains Mono', monospace; letter-spacing: 0.04em; text-decoration: underline; text-underline-offset: 3px; }
      .scn-link:hover, .scn-link:focus-visible { color: #ff8a8a; outline: none; }
      .scn-notes { list-style: none; margin: 0; padding: 0; }
      .scn-notes li { padding: 9px 0; border-top: 1px solid rgba(150,180,215,0.08); font-size: 13px; line-height: 1.55; color: #c3d0de; }
      .scn-notes li:first-child { border-top: 0; }
      .scn-notes b { color: #f0f5fb; font-weight: 700; }

      /* ── Scenario intro card ── */
      .scn-overlay.scn-intro-bg { padding: 0; background: #03070d; backdrop-filter: none; overflow: hidden; cursor: pointer;
        animation: none; clip-path: inset(0); transition: clip-path 0.42s cubic-bezier(.7,0,.3,1); }
      .scn-overlay.scn-intro-bg.out { clip-path: inset(50% 0 50% 0); }
      .scn-overlay.scn-intro-bg::before { content: ''; position: absolute; inset: 0; pointer-events: none;
        background:
          linear-gradient(rgba(95,216,255,0.07) 1px, transparent 1px) 0 0 / 100% 44px,
          linear-gradient(90deg, rgba(95,216,255,0.07) 1px, transparent 1px) 0 0 / 44px 100%;
        -webkit-mask-image: radial-gradient(ellipse at center, #000 10%, transparent 72%); mask-image: radial-gradient(ellipse at center, #000 10%, transparent 72%);
        animation: scnGrid 3.4s linear both; }
      @keyframes scnGrid { from { opacity: 0; background-position: 0 44px, 44px 0; } 18% { opacity: 1; } to { opacity: 1; background-position: 0 0, 0 0; } }
      .scn-box.intro { position: relative; width: 100%; max-height: none; background: none; border: 0; box-shadow: none; align-items: center; justify-content: center; }
      .scn-intro-in { width: min(1000px, 100%); padding: 24px; text-align: center; display: flex; flex-direction: column; align-items: center; }
      .scn-intro-k { font: 600 clamp(10px, 1.2vw, 13px) 'JetBrains Mono', monospace; letter-spacing: 0.42em; text-transform: uppercase; color: var(--ac);
        animation: scnRise 0.5s ease 0.05s both; }
      .scn-intro-t { margin: 16px 0 0; font: 900 clamp(38px, min(10vw, 15vh), 128px)/0.98 'Orbitron', 'Inter', sans-serif;
        letter-spacing: 0.06em; text-transform: uppercase; text-wrap: balance; }
      .scn-intro-t span { display: inline-block; color: transparent;
        background: linear-gradient(180deg, #ffffff 0%, color-mix(in srgb, var(--ac) 30%, #fff) 36%, var(--ac) 66%, color-mix(in srgb, var(--ac) 55%, #000) 100%);
        -webkit-background-clip: text; background-clip: text;
        filter: drop-shadow(0 0 3px color-mix(in srgb, var(--ac) 70%, #fff)) drop-shadow(0 0 30px color-mix(in srgb, var(--ac) 55%, transparent));
        animation: scnSlam 0.7s cubic-bezier(.2,.9,.2,1) both; }
      .scn-intro-rule { width: min(520px, 70%); height: 2px; margin-top: clamp(16px, 3vh, 28px);
        background: linear-gradient(90deg, transparent, var(--ac), transparent); transform-origin: center;
        animation: scnRule 0.7s cubic-bezier(.2,.9,.2,1) 0.85s both; }
      @keyframes scnRule { from { transform: scaleX(0); opacity: 0; } }
      .scn-intro-p { margin-top: clamp(14px, 2.6vh, 24px); font: 600 clamp(11px, 1.3vw, 14px) 'JetBrains Mono', monospace; letter-spacing: 0.3em;
        text-transform: uppercase; color: #f0f5fb; animation: scnRise 0.5s ease 1.1s both; }
      .scn-intro-p i { font-style: normal; color: var(--ac); margin: 0 0.4em; }
      .scn-intro-tag { margin-top: 12px; max-width: 52ch; font-size: clamp(13px, 1.5vw, 17px); line-height: 1.5; color: #9fb2c6;
        animation: scnRise 0.5s ease 1.3s both; }
      .scn-intro-skip { margin-top: clamp(24px, 6vh, 56px); background: none; border: 0; color: #56677b; cursor: pointer;
        font: 600 10px 'JetBrains Mono', monospace; letter-spacing: 0.3em; text-transform: uppercase; animation: scnRise 0.5s ease 1.8s both; }
      .scn-intro-skip:focus-visible { outline: none; color: #9fb2c6; }
      @media (prefers-reduced-motion: reduce) {
        .scn-overlay.scn-intro-bg { transition: none; }
        .scn-overlay.scn-intro-bg::before, .scn-intro-k, .scn-intro-t span, .scn-intro-rule, .scn-intro-p, .scn-intro-tag, .scn-intro-skip { animation: none; }
      }

      .scn-quote { margin: 0 0 16px; padding: 12px 14px; border-left: 2px solid #5fd8ff; background: rgba(95,216,255,0.05);
        font-size: 13px; line-height: 1.6; color: #c3d0de; font-style: italic; }
      .scn-cond { margin: 0; font-size: 13px; line-height: 1.6; color: #c3d0de; }
      .scn-cond b { color: #eaf2fb; }
      .scn-h { margin: 18px 0 8px; font: 700 10px 'JetBrains Mono', monospace; letter-spacing: 0.24em; text-transform: uppercase; color: #7a8b9f; }
      .scn-steps { list-style: none; margin: 0; padding: 0; counter-reset: scn; }
      .scn-steps li { counter-increment: scn; position: relative; padding: 9px 0 9px 38px; border-top: 1px solid rgba(150,180,215,0.08);
        font-size: 13px; line-height: 1.55; color: #c3d0de; }
      .scn-steps li:first-child { border-top: 0; }
      .scn-steps li::before { content: counter(scn); position: absolute; left: 0; top: 9px; width: 24px; height: 24px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center; border: 1px solid rgba(95,216,255,0.5); color: #5fd8ff;
        font: 700 11px 'JetBrains Mono', monospace; }
      .scn-steps b { color: #f0f5fb; font-weight: 700; }
      .scn-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-bottom: 4px; }
      .scn-fact { padding: 10px 12px; border: 1px solid rgba(150,180,215,0.12); border-radius: 6px; background: rgba(255,255,255,0.02); }
      .scn-fact span { display: block; font: 600 9px 'JetBrains Mono', monospace; letter-spacing: 0.2em; text-transform: uppercase; color: #7a8b9f; }
      .scn-fact b { display: block; margin-top: 5px; font: 700 15px 'Inter', sans-serif; color: #f0f5fb; font-variant-numeric: tabular-nums; }

      /* ── Scenario complete ── */
      .scn-overlay.scn-win-bg { padding: 0; align-items: stretch; background: #03070d; backdrop-filter: none; overflow: hidden; }
      .scn-box.win { position: relative; width: 100%; max-height: none; background: none; border: 0; border-radius: 0; box-shadow: none;
        overflow-y: auto; overscroll-behavior: contain; align-items: center; }
      .scn-win-rays { position: fixed; inset: -40vmax; pointer-events: none; opacity: 0.55;
        background:
          radial-gradient(closest-side, color-mix(in srgb, var(--mc) 26%, transparent), transparent 62%),
          repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--mc) 16%, transparent) 0deg 4deg, transparent 4deg 18deg);
        -webkit-mask-image: radial-gradient(closest-side, #000 18%, transparent 70%); mask-image: radial-gradient(closest-side, #000 18%, transparent 70%);
        will-change: transform; animation: scnSpin 90s linear infinite, scnFade 1.2s ease both; }
      @keyframes scnSpin { to { transform: rotate(360deg); } }
      .scn-win-in { position: relative; width: min(940px, 100%); margin: auto; padding: clamp(20px, 5vh, 56px) 20px clamp(20px, 4vh, 40px);
        display: flex; flex-direction: column; align-items: center; text-align: center; }
      .scn-win-title { margin: 12px 0 0; font: 900 clamp(34px, min(8.4vw, 11vh), 104px)/0.98 'Orbitron', 'Inter', sans-serif;
        letter-spacing: 0.06em; text-transform: uppercase; text-wrap: balance; }
      .scn-win-title span { display: inline-block; color: transparent;
        background: linear-gradient(180deg, #ffffff 0%, color-mix(in srgb, var(--mc) 35%, #fff) 34%, var(--mc) 62%, color-mix(in srgb, var(--mc) 55%, #000) 100%);
        -webkit-background-clip: text; background-clip: text;
        filter: drop-shadow(0 0 3px color-mix(in srgb, var(--mc) 70%, #fff)) drop-shadow(0 0 28px var(--mg));
        animation: scnSlam 0.8s cubic-bezier(.2,.9,.2,1) 0.15s both; }
      .scn-win-title span + span { animation-delay: 0.4s; }
      @keyframes scnSlam { from { opacity: 0; transform: scale(1.8); filter: blur(14px); } }
      .scn-win-line { margin: 16px 0 0; max-width: 56ch; font-size: clamp(14px, 1.5vw, 17px); line-height: 1.55; color: #c3d0de; text-wrap: pretty; }

      .scn-win-medal { display: flex; align-items: center; gap: 20px; margin-top: clamp(18px, 3.4vh, 34px); text-align: left; }
      .scn-win-disc { position: relative; flex: none; width: 112px; height: 112px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
        background: radial-gradient(circle at 34% 28%, #fff, var(--mc) 52%, color-mix(in srgb, var(--mc) 55%, #000) 100%);
        box-shadow: 0 0 0 4px rgba(3,7,13,0.9), 0 0 0 6px var(--mc), 0 0 46px var(--mg);
        animation: scnPop 0.8s cubic-bezier(.2,1.6,.4,1) 0.75s both; }
      .scn-win-disc b { font: 900 14px 'Orbitron', sans-serif; letter-spacing: 0.16em; text-transform: uppercase; color: #06101a; }
      .scn-win-disc i { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; }
      .scn-win-disc i::after { content: ''; position: absolute; inset: 0;
        background: linear-gradient(105deg, transparent 38%, rgba(255,255,255,0.75) 50%, transparent 62%);
        transform: translateX(-120%); animation: scnShine 1.1s ease-out 1.5s forwards; }
      @keyframes scnShine { to { transform: translateX(120%); } }
      @keyframes scnPop { from { transform: scale(0) rotate(-40deg); opacity: 0; } }
      .scn-win-medal-t span { display: block; font: 600 10px 'JetBrains Mono', monospace; letter-spacing: 0.24em; text-transform: uppercase; color: #7a8b9f; }
      .scn-win-medal-t b { display: block; margin-top: 5px; font: 800 clamp(20px, 2.6vw, 28px) 'Orbitron', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; color: var(--mc); }
      .scn-win-medal-t em { display: block; margin-top: 5px; font-style: normal; font-size: 12.5px; color: #9fb2c6; }

      .scn-win-stats { width: 100%; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: clamp(18px, 3.4vh, 34px); }
      .scn-win-stat { padding: 14px 14px 12px; text-align: left; border: 1px solid rgba(150,180,215,0.14); border-top: 2px solid var(--mc);
        border-radius: 6px; background: rgba(10,16,26,0.72); }
      .scn-win-stat span { display: block; font: 600 9.5px 'JetBrains Mono', monospace; letter-spacing: 0.2em; text-transform: uppercase; color: #7a8b9f; }
      .scn-win-stat b { display: block; margin-top: 7px; font: 700 clamp(19px, 2.3vw, 26px) 'Inter', sans-serif; color: #f0f5fb;
        font-variant-numeric: tabular-nums; white-space: nowrap; }
      .scn-win-stat em { display: block; margin-top: 5px; font-style: normal; font-size: 11.5px; line-height: 1.4; color: #7a8b9f; }
      .scn-win-built { width: 100%; margin-top: 18px; text-align: left; }
      .scn-win-built > span { display: block; margin-bottom: 8px; font: 600 9.5px 'JetBrains Mono', monospace; letter-spacing: 0.2em; text-transform: uppercase; color: #7a8b9f; }
      .scn-win-built .scn-chip { font-size: 11px; padding: 5px 10px; background: rgba(10,16,26,0.72); }
      .scn-win-built .scn-chip b { color: #f0f5fb; }
      .scn-win-btns { justify-content: center; margin-top: clamp(20px, 3.6vh, 36px); }
      .scn-win-btns .scn-btn { padding: 14px 24px; font-size: 12px; background: rgba(10,16,26,0.8); }
      .scn-win-btns .scn-btn.go { background: linear-gradient(180deg, #5fd8ff, #0a8fcf); }
      .scn-win-foot { margin: 16px 0 0; font-size: 12px; color: #7a8b9f; }
      .scn-w1, .scn-w2, .scn-w3, .scn-w4, .scn-w5, .scn-w6 { animation: scnRise 0.6s ease both; }
      .scn-w1 { animation-delay: 0.05s; } .scn-w2 { animation-delay: 0.7s; } .scn-w3 { animation-delay: 0.75s; }
      .scn-w4 { animation-delay: 0.95s; } .scn-w5 { animation-delay: 1.15s; } .scn-w6 { animation-delay: 1.35s; }
      @keyframes scnRise { from { opacity: 0; transform: translateY(12px); } }
      @media (max-width: 760px) { .scn-win-stats { grid-template-columns: repeat(2, 1fr); } }
      @media (max-width: 420px) { .scn-win-medal { flex-direction: column; text-align: center; } }
      @media (prefers-reduced-motion: reduce) {
        .scn-win-rays, .scn-win-title span, .scn-win-disc, .scn-win-disc i::after,
        .scn-w1, .scn-w2, .scn-w3, .scn-w4, .scn-w5, .scn-w6 { animation: none; }
      }
      @media (max-width: 560px) { .scn-title { font-size: 19px; } .scn-head, .scn-body, .scn-foot { padding-left: 16px; padding-right: 16px; } }
    `;
    document.head.appendChild(st);
  }

  // One overlay at a time. In a running scenario it also holds the sim
  // still, so the clock never runs while the player is reading.
  function _open(html, kind) {
    _close();
    _css();
    const el = document.createElement('div');
    el.className = 'scn-overlay';
    // true: a narrow card. 'win' / 'intro': full-screen, with their own backdrop.
    const cls = kind === true ? ' narrow' : kind ? ' ' + kind : '';
    if (kind && kind !== true) el.classList.add(`scn-${kind}-bg`);
    el.innerHTML = `<div class="scn-box${cls}" role="dialog" aria-modal="true">${html}</div>`;
    // Keys typed here are not game hotkeys; Escape runs the overlay's own close.
    el.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') el.querySelector('[data-esc]')?.click(); });
    document.body.appendChild(el);
    _overlay = el;
    if (run && typeof DevMode !== 'undefined') { _prevScale = DevMode.timeScale || 1; DevMode.setTimeScale(0); }
    (el.querySelector('[data-focus]') || el.querySelector('button'))?.focus();
    return el;
  }
  function _close() {
    if (!_overlay) return;
    _overlay.remove();
    _overlay = null;
    if (run && typeof DevMode !== 'undefined') DevMode.setTimeScale(_prevScale || 1);
  }
  const _on = (el, sel, fn) => el.querySelectorAll(sel).forEach(n => n.addEventListener('click', () => { try { SFX.click?.(); } catch (_e) {} fn(n); }));

  // The picker, from the main menu.
  function openPicker() {
    const best = _best();
    const cards = SCENARIOS.map(s => {
      const b = best[s.id];
      const saved = slotsFor(s.id).length > 0;
      // A card is one big button: RESUME when there is a save to go back to
      // (with a small START OVER beside it), PLAY otherwise.
      return `
        <div class="scn-card" role="button" tabindex="0" ${saved ? 'data-resume' : 'data-play'}="${s.id}">
          <div class="scn-card-k">${esc(s.kicker)}</div>
          <div class="scn-card-t">${esc(s.title)}</div>
          <div class="scn-card-p">${esc(s.tagline)}</div>
          <div class="scn-chips">
            <span class="scn-chip" style="color:${LEVEL_COL[s.level] || '#9fb2c6'};border-color:${LEVEL_COL[s.level] || '#9fb2c6'}55">${esc(s.level)}</span>
            <span class="scn-chip">${esc(s.mins)}</span>
            <span class="scn-chip">${esc(s.place)}</span>
            ${s.climate ? `<span class="scn-chip" style="color:${s.accent};border-color:${s.accent}55">${esc(s.climate.label)}</span>` : ''}
          </div>
          <div class="scn-card-foot">
            ${b ? `<span class="scn-medal"><i class="scn-dot" style="background:${MEDAL[b.medal].col};box-shadow:0 0 8px ${MEDAL[b.medal].glow}"></i>${MEDAL[b.medal].label}${b.spent != null ? ` · built for ${_money(b.spent)}` : ''}</span>`
                : '<span>Not yet completed</span>'}
            ${saved ? `<span class="scn-card-acts"><button class="scn-link" data-restart="${s.id}">Start over</button><span class="scn-play">RESUME ▶</span></span>`
                    : '<span class="scn-play">PLAY ▶</span>'}
          </div>
        </div>`;
    }).join('');
    const el = _open(`
      <div class="scn-head">
        <div>
          <div class="scn-kicker">${DEMO ? 'Demo · ' : ''}Jump straight in</div>
          <div class="scn-title">Scenarios</div>
          <div class="scn-sub">A small world with a town already standing on it, dark. The tools for one kind of power, and a job to finish. Pick one.</div>
        </div>
        <button class="scn-x" data-esc data-back>‹ Game modes</button>
      </div>
      <div class="scn-body"><div class="scn-grid">${cards}</div></div>
      <div class="scn-foot">
        <div class="scn-note">Scenarios autosave as you play: come back here to resume one. ${DEMO ? "They show parts of the full game that come after the demo's research chain." : 'Every tool a scenario needs is unlocked for it, whatever you have researched in your own cities.'}</div>
      </div>`);
    _on(el, '[data-back]', openModes);
    _on(el, '[data-play]', n => launch(n.dataset.play));
    _on(el, '[data-resume]', n => resume(n.dataset.resume));
    // START OVER sits inside the card: its click must not also resume.
    el.querySelectorAll('[data-restart]').forEach(n => n.addEventListener('click', e => {
      e.stopPropagation();
      try { SFX.click?.(); } catch (_e) {}
      launch(n.dataset.restart);
    }));
    // The cards are divs (they hold a button), so give them a button's keys.
    el.querySelectorAll('.scn-card[role=button]').forEach(n => n.addEventListener('keydown', e => {
      if (e.target === n && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); n.click(); }
    }));
  }

  // The card a scenario opens on: its number, name and place slam in over a
  // drawn grid, hold for a beat, then the screen snaps shut to a line and
  // the site is there. About three seconds; any click or key skips it.
  function _intro(then) {
    const d = run.def, demand = _power(run.demand);
    const words = d.title.split(' ').map((w, i) => `<span style="animation-delay:${(0.25 + i * 0.22).toFixed(2)}s">${esc(w)}</span>`).join(' ');
    const el = _open(`
      <div class="scn-intro-in" style="--ac:${d.accent || '#5fd8ff'}">
        <div class="scn-intro-k">${esc(d.kicker)}</div>
        <h1 class="scn-intro-t">${words}</h1>
        <div class="scn-intro-rule"></div>
        <div class="scn-intro-p">${esc(d.place)} <i>·</i> ${demand} town <i>·</i> ${esc(d.level)}${d.climate ? ` <i>·</i> ${esc(d.climate.label)}` : ''}</div>
        <div class="scn-intro-tag">${esc(d.tagline)}</div>
        <button class="scn-intro-skip" data-esc data-focus>Click to skip</button>
      </div>`, 'intro');
    _uncover();
    let gone = false;
    const done = () => {
      if (gone) return;
      gone = true;
      clearTimeout(timer);
      el.classList.add('out');
      setTimeout(() => { if (_overlay === el) _close(); then(); }, 420);
    };
    const timer = setTimeout(done, 3100);
    el.addEventListener('click', done);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') done(); });
  }

  // GAME MODES, from the main menu: the two ways in. New Game is
  // the menu's own (hidden) button, so its handler in menu_system.js runs.
  function openModes() {
    const el = _open(`
      <div class="scn-head">
        <div>
          <div class="scn-kicker">${DEMO ? 'GRIDWORKS Demo' : 'GRIDWORKS'}</div>
          <div class="scn-title">Game modes</div>
        </div>
        <button class="scn-x" data-esc data-close>✕ Close</button>
      </div>
      <div class="scn-body"><div class="scn-grid scn-modes">
        <button class="scn-card" data-mode="scenarios" data-focus>
          <div class="scn-card-k">Jump straight in</div>
          <div class="scn-card-t">Scenarios</div>
          <div class="scn-card-p">Experience early, mid and late game power grid technologies. Each scenario drops you into a town that is already built and waiting for power, with coal, oil, hydro, nuclear or fusion ready to put to work. Three are played against the weather: a polar winter, a heat wave and a storm season. Two push the late game further: carry a rocket launch on stored power, and wind Field Cores to drive a fusion reactor past its rating.</div>
          <div class="scn-card-foot"><span>${SCENARIOS.length} scenarios</span><span class="scn-play">CHOOSE ▶</span></div>
        </button>
        <button class="scn-card" data-mode="newgame">
          <div class="scn-card-k">${DEMO ? 'The start of the full game' : 'The full game'}</div>
          <div class="scn-card-t">New Game</div>
          <div class="scn-card-p">${DEMO ? `Experience the first portion of the full game: found a power company and grow a city from a single generator. When the full game releases, your progress can be sent from the demo so you can continue where you left off.` : 'Found a power company and grow a city from a single generator, all the way to fusion. Research, customers, weather and the mayor are all yours to deal with.'}</div>
          <div class="scn-card-foot"><span>Saves as you play</span><span class="scn-play">START ▶</span></div>
        </button>
      </div></div>`);
    _on(el, '[data-close]', _close);
    _on(el, '[data-mode]', n => {
      if (n.dataset.mode === 'scenarios') { openPicker(); return; }
      _close();
      document.getElementById('menu-btn-newgame')?.click();
    });
  }

  // The briefing: once on arrival, and again from the checklist's BRIEFING button.
  function showBriefing(first, then) {
    if (!run) return;
    const d = run.def, m = d.medals;
    const steps = d.steps.map(([h, t]) => `<li><b>${esc(h)}.</b> ${esc(t)}</li>`).join('');
    const el = _open(`
      <div class="scn-head">
        <div>
          <div class="scn-kicker">${esc(d.kicker)} · ${esc(d.place)}</div>
          <div class="scn-title">${esc(d.title)}</div>
        </div>
        ${first ? '' : '<button class="scn-x" data-esc data-close>✕ Close</button>'}
      </div>
      <div class="scn-body">
        <p class="scn-quote">${esc(d.blurb)}</p>
        <div class="scn-facts">
          <div class="scn-fact"><span>Town demand</span><b>${_power(run.demand)} peak</b></div>
          <div class="scn-fact"><span>Budget</span><b>${typeof formatMoney === 'function' ? formatMoney(run.budget) : '$' + run.budget.toLocaleString()}</b></div>
          <div class="scn-fact"><span>Gold</span><b>build for ${_money(m.gold)}</b></div>
          <div class="scn-fact"><span>Silver</span><b>build for ${_money(m.silver)}</b></div>
        </div>
        ${d.climate ? `<div class="scn-h">Conditions: ${esc(d.climate.label)}</div><p class="scn-cond">${d.climate.note}</p>` : ''}
        <div class="scn-h">How to do it</div>
        <ol class="scn-steps">${steps}</ol>
        <div class="scn-h">Good to know</div>
        <ul class="scn-notes">
          <li>The town is to the <b>east</b> of City Hall and the work area, with everything in the ground, to the <b>west</b>. The objectives panel has buttons that jump to each.</li>
          <li>The medal goes by <b>what you build</b>: the value of all the plant, wire, pipe and belt standing when you sign off. Build it for ${_money(m.gold)} or less for gold, ${_money(m.silver)} for silver. Time does not count, so pause to plan as long as you like, and selling something back takes it off the total.</li>
          <li>The last objective is to keep every building powered for ${d.holdH} hours without a break, in <b>in-game time</b>: fast-forward to get through it sooner.</li>
          <li>Customers start paying as soon as they have power, and what you build costs upkeep, as in the full game. No new customers arrive and nobody moves out.</li>
          <li>Click any building to see what it needs. <b>R</b> rotates before placing, <b>X</b> deletes, <b>M</b> opens the map.</li>
          <li>The walkthrough cards can be switched off or on at any time under <b>MENU › OPTIONS › Tutorial Cards</b>. Click a card's title to fold it away without switching it off.</li>
          <li>The scenario <b>autosaves</b>. Leave whenever you like and resume it from Scenarios on the main menu.</li>
        </ul>
      </div>
      <div class="scn-foot">
        <div class="scn-note">${first ? 'Next you will be asked whether you want a guided walkthrough. This briefing stays one click away: Briefing on the objectives panel.' : ''}</div>
        <div class="scn-btns"><button class="scn-btn go" data-focus ${first ? 'data-esc' : ''} data-close>${first ? 'Start' : 'Back to work'}</button></div>
      </div>`, true);
    _on(el, '[data-close]', () => { _close(); if (then) then(); });
  }

  function confirmQuit() {
    if (!run) return;
    const el = _open(`
      <div class="scn-head"><div>
        <div class="scn-kicker">${esc(run.def.kicker)}</div>
        <div class="scn-title">Quit scenario?</div>
        <div class="scn-sub">${run.done ? 'Your medal is saved, and so is the town.' : 'Your progress is saved. Resume it from Scenarios on the main menu.'}</div>
      </div></div>
      <div class="scn-foot">
        <div class="scn-note"></div>
        <div class="scn-btns">
          <button class="scn-btn" data-focus data-esc data-close>Keep playing</button>
          <button class="scn-btn" data-quit>Save and quit</button>
        </div>
      </div>`, true);
    _on(el, '[data-close]', _close);
    _on(el, '[data-quit]', () => toMenu(true));
  }

  // The result: a full-screen card. Numbers count up as it lands (unless
  // the player has asked for reduced motion).
  function _showResult() {
    if (!run || !run.result) return;
    const d = run.def, r = run.result, md = MEDAL[r.medal];
    if (r.spent == null) r.spent = builtValue();   // signed off before medals went by money
    const next = SCENARIOS[SCENARIOS.indexOf(d) + 1] || null;
    const money = n => typeof formatMoney === 'function' ? formatMoney(n) : '$' + Math.round(n).toLocaleString();
    const power = _power;
    const better = r.medal === 'gold' ? `Gold: built for ${money(d.medals.gold)} or less`
                 : r.medal === 'silver' ? `Gold needs building for ${money(d.medals.gold)} or less`
                 : `Silver needs building for ${money(d.medals.silver)} or less`;
    const builtChips = r.built.slice(0, 8).map(x => `<span class="scn-chip"><b>${x.n}</b> ${esc(x.label)}${x.n === 1 ? '' : 's'}</span>`).join('')
      + (r.runs ? `<span class="scn-chip"><b>${r.runs}</b> pieces of wire, pipe and belt</span>` : '');
    const el = _open(`
      <div class="scn-win-rays" style="--mc:${md.col}"></div>
      <div class="scn-win-in" style="--mc:${md.col};--mg:${md.glow}">
        <div class="scn-kicker scn-w1">${esc(d.kicker)} · ${esc(d.place)}</div>
        <h1 class="scn-win-title"><span>Scenario</span> <span>Complete</span></h1>
        <p class="scn-win-line scn-w2">${esc(d.win || d.title)}</p>

        <div class="scn-win-medal scn-w3">
          <div class="scn-win-disc"><i></i><b>${md.label}</b></div>
          <div class="scn-win-medal-t">
            <span>${esc(d.title)}</span>
            <b>${md.label} medal</b>
            <em>${better}</em>
          </div>
        </div>

        <div class="scn-win-stats scn-w4">
          <div class="scn-win-stat"><span>Built for</span><b data-count="${r.spent || 0}" data-fmt="money">${money(r.spent || 0)}</b>
            <em>in ${_fmtHours(r.hours)} of in-game time</em></div>
          <div class="scn-win-stat"><span>Power online</span><b data-count="${r.generated}" data-fmt="power">${power(r.generated)}</b>
            <em>against ${power(r.demand)} of demand</em></div>
          <div class="scn-win-stat"><span>Buildings powered</span><b data-count="${r.lit}" data-fmt="int" data-suffix=" / ${r.customers}">${r.lit} / ${r.customers}</b>
            <em>${r.people ? r.people.toLocaleString() + ' people, ' : ''}held for ${d.holdH} hours</em></div>
          <div class="scn-win-stat"><span>In the bank</span><b data-count="${r.left}" data-fmt="money">${money(r.left)}</b>
            <em>from ${money(run.budget)}, earning ${money(r.income)}/s</em></div>
        </div>

        ${builtChips ? `<div class="scn-win-built scn-w5"><span>What you built</span><div class="scn-chips">${builtChips}</div></div>` : ''}

        <div class="scn-btns scn-win-btns scn-w6">
          <button class="scn-btn" data-esc data-close>Keep building</button>
          <button class="scn-btn" data-menu>Scenarios</button>
          ${next ? `<button class="scn-btn go" data-focus data-next="${next.id}">Next: ${esc(next.title)} ▶</button>`
                 : '<button class="scn-btn go" data-focus data-main>Main menu</button>'}
        </div>
        <p class="scn-win-foot scn-w6">${DEMO ? 'In the full game you find the deposits, research each machine and grow the town that needs them.' : 'In a city of your own you find the deposits, research each machine and grow the town that needs them.'}</p>
      </div>`, 'win');
    _on(el, '[data-close]', _close);
    _on(el, '[data-menu]', () => toMenu(true));
    _on(el, '[data-main]', () => toMenu(false));
    _on(el, '[data-next]', n => launch(n.dataset.next));

    // Count the figures up from zero.
    const fmt = { hours: _fmtHours, power, money, int: v => String(Math.round(v)) };
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nodes = [...el.querySelectorAll('[data-count]')];
    if (!still && nodes.length) {
      const t0 = performance.now() + 900, DUR = 1100;
      const set = k => nodes.forEach(n => { n.textContent = fmt[n.dataset.fmt](+n.dataset.count * k) + (n.dataset.suffix || ''); });
      set(0);
      const step = now => {
        if (_overlay !== el) return;
        const u = Math.max(0, Math.min(1, (now - t0) / DUR));
        set(1 - Math.pow(1 - u, 3));
        if (u < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      // A tab that is not being drawn runs no animation frames: never leave zeros up.
      setTimeout(() => { if (_overlay === el) set(1); }, 900 + DUR + 300);
    }
  }

  // Called by MenuSystem once the main menu is up (no scenario pending).
  function menuReady() {
    const btn = document.getElementById('menu-btn-modes');
    if (btn && !btn._scn) {
      btn._scn = true;
      btn.addEventListener('click', () => { try { SFX.click?.(); } catch (_e) {} openModes(); });
    }
    let reopen = false;
    try { reopen = sessionStorage.getItem(OPEN_KEY) === '1'; sessionStorage.removeItem(OPEN_KEY); } catch (_e) {}
    if (reopen) openPicker();
  }

  return {
    active, isDone, tick, clockText,
    takePending, begin, menuReady, openModes, openPicker, launch, resume,
    serialise, loadState, resumeLoaded,
    signOff, showBriefing, confirmQuit,
    season, renderGrade,
    // Whether this scenario flies rockets (LaunchSystem asks before it ticks).
    launches: () => !!(run && run.def.launch),
    list: () => SCENARIOS.map(s => s.id),
    state: () => run,   // read-only, for testing
  };
})();
