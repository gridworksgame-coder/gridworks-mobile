/* ═══════════════════════════════════════════════════════════════════
   ENTITY DEFINITIONS
   The full EntityDefs config table (cost, power, footprint, etc. for
   every placeable type) plus subtype-footprint helpers.
   ═══════════════════════════════════════════════════════════════════ */

const EntityDefs = {
  [T.GOVBUILDING]: {
    label:       'City Hall',
    color:       '#1a1a2e',
    glowColor:   '#c0a030',
    powerOutput: 0,
    powerInput:  8,
    throughput:  0,
    cost:        0,
    upkeep:      0,
    width:       6,
    height:      6,
  },
  [T.TOWNHALL]:     { label: 'Town Hall',          color: '#12121e', glowColor: '#d0a840', powerOutput: 0, powerInput:  8, throughput: 0, cost:  18000, upkeep:  -6.0, income:  6.0, width: 9, height: 9 },
  [T.CIVICCENTER]:  { label: 'Civic Center',        color: '#12121e', glowColor: '#b890e0', powerOutput: 0, powerInput: 15, throughput: 0, cost:  25000, upkeep:  -8.5, income:  8.5, width: 6, height: 5 },
  [T.COURTHOUSE]:   { label: 'Courthouse',           color: '#12121e', glowColor: '#8090d0', powerOutput: 0, powerInput: 20, throughput: 0, cost:  32500, upkeep: -12.5, income: 12.5, width: 6, height: 6 },
  [T.EMS]:          { label: 'Emergency Services',   color: '#12121e', glowColor: '#ff4040', powerOutput: 0, powerInput: 30, throughput: 0, cost:  40000, upkeep: -18.5, income: 18.5, width: 6, height: 4 },
  [T.HOSPITAL]:     { label: 'Hospital',             color: '#12121e', glowColor: '#40e0b0', powerOutput: 0, powerInput: 50, throughput: 0, cost:  52500, upkeep: -25.0, income: 25.0, width: 14, height: 12 },
  [T.UNIVERSITY]:   { label: 'University',           color: '#12121e', glowColor: '#60c0ff', powerOutput: 0, powerInput: 110, minDraw: 45, throughput: 0, cost:  60000, upkeep: -32.5, income: 32.5, width: 23, height: 17 },   // 45–110 kW daily curve (DemandCurves)
  [T.NATIONALGOV]:  { label: 'National Government Center', color: '#16140e', glowColor: '#e0c060', powerOutput: 0, powerInput: 260, minDraw: 120, throughput: 0, cost: 120000, upkeep: -80.0, income: 80.0, width: 22, height: 17 },   // 120–260 kW office-hours curve (DemandCurves)
  [T.FUSIONLAB]:    { label: 'Fusion Research Facility', color: '#141620', glowColor: '#ff90e0', powerOutput: 0, powerInput: 1000, minDraw: 280, throughput: 0, cost: 200000, upkeep: -100.0, income: 100.0, width: 56, height: 32 },   // 280–430 kW, spiking to 1 MW for plasma shots (DemandCurves)
  // Hyperion Station: its draw is set by Operation Hyperion's stage (NationalProject.demandKW)
  // and it only earns while the export to the nation is flowing — hence the income getter.
  // Starhaven: 450–900 kW round the clock (DemandCurves), times up to 14 through a launch count
  // (LaunchSystem.demandMult). The launch bonus is where its money is, so the steady income sits with its neighbours'.
  [T.LAUNCHCOMPLEX]: { label: 'Starhaven Launch Complex', color: '#10141a', glowColor: '#8fc8ee', powerOutput: 0, powerInput: 900, minDraw: 450, throughput: 0, cost: 320000, upkeep: -115.0, income: 115.0, width: 27, height: 18 },
  [T.NATIONALGRID]: { label: 'Hyperion Station', color: '#0c141c', glowColor: '#7ad8ff', powerOutput: 0, powerInput: 30000, minDraw: 500, throughput: 0, cost: 2500000, upkeep: 0,
    get income() { return typeof NationalProject !== 'undefined' ? NationalProject.incomeNow() : 0; }, width: 64, height: 40 },
  // The company's own head office: the city's gift for Advanced Fusion (CompanyHQ, GovernmentSystem), named
  // after the player's company — hence the label getter. 600 kW–1.4 MW office-hours curve (DemandCurves).
  [T.COMPANYHQ]: { get label() { return `${(typeof CityInfo !== 'undefined' && CityInfo.getCompanyName()) || 'Company'} Headquarters`; },
    color: '#0e1622', glowColor: '#ffce6e', powerOutput: 0, powerInput: 1400, minDraw: 600, throughput: 0, cost: 5000000, upkeep: -900.0, income: 900.0, width: 40, height: 32 },   // $900/s pay + $900/s government grant (the negative upkeep)
  [T.MILITARYBASE]: { label: 'Military Base', color: '#141a14', glowColor: '#a8c870', powerOutput: 0, powerInput: 300, minDraw: 220, throughput: 0, cost: 175000, upkeep: -95.0, income: 95.0, width: 32, height: 23 },   // 220–300 kW round-the-clock curve (DemandCurves)
  [T.AIRPORT]:      { label: 'International Airport', color: '#10141c', glowColor: '#80c8ff', powerOutput: 0, powerInput: 480, minDraw: 180, throughput: 0, cost: 150000, upkeep: -110.0, income: 110.0, width: 37, height: 21 },   // 180–480 kW flight-schedule curve (DemandCurves)
  [T.TRANSPORTHUB]: { label: 'Transportation Hub',   color: '#12121e', glowColor: '#ffa040', powerOutput: 0, powerInput: 220, minDraw: 90, throughput: 0, cost: 72500, upkeep: -40.0, income: 40.0, width: 27, height: 18 },    // 90–220 kW daily curve (DemandCurves)
  [T.TRUCK]: {
    label:       'Waste Truck',
    color:       '#1a2a10',
    glowColor:   '#80c040',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        35000,
    upkeep:      5,
    width:       1,
    height:      3,
    cargoCapacity: 100,  // max waste units a truck can carry per trip
    fuelCapacity:  100,  // max fuel units a truck can carry
    fuelPerSec:    0.08, // fuel consumed per second while driving (driven or patrol) — 5x longer tank, +50% on top of that, +33.3% more on top of that, then burn rate −20%, then halved
  },
  // Hauler: the cargo truck. It moves ore, coal, rods, crude, fuel oil, water
  // and acid by road from where they are made to a storage vessel flagged for
  // Truck Supply, and it runs itself. Bigger and slower than the Waste
  // Truck, and it never carries waste.
  //
  // There is no T.HAULER entity. The tool places a T.TRUCK with `_hauler`
  // set and this as its def, so driving, routing, refuelling, saving and
  // every "for each truck" loop in the game apply to it unchanged; whatever
  // differs between the two reads its numbers through truckSpec().
  [T.HAULER]: {
    label:       'Hauler',
    color:       '#10202a',
    glowColor:   '#40a0d0',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        70000,
    upkeep:      5,
    width:       1,
    height:      3,
    cargoCapacity: 200,  // units of ore or liquid per trip (a drone carries 40 to 50; was 150)
    // Process gas rides in a tube trailer, the way real helium and hydrogen
    // move by road. Gas units run far larger than solids (a drone sortie is
    // 250 gas against 40 ore), so the trailer holds 750: three drone loads,
    // slower and needing roads and fuel, but it keeps its speed through the
    // storms that slow the fleet.
    cargoCapacityGas: 750,
    fuelCapacity:  140,
    fuelPerSec:    0.11, // about 40% thirstier than the Truck
    speedMult:     0.8,  // cruise, against the Waste Truck's
  },
  [T.CELLTOWER]: {
    label:       'Cell Tower',
    color:       '#101820',
    glowColor:   '#40c0ff',
    powerOutput: 0,
    powerInput:  5,   // draws 5 kW
    throughput:  0,
    cost:        20000,
    // Paid through the civic-income branch in Economy.tick, NOT through the
    // "negative upkeep = income" idiom the parks and amenities use. This
    // used to carry BOTH (upkeep -5 and income 5), and Economy applies each
    // of them independently, so a powered Cell Tower quietly earned $10/s
    // against a stated $5/s. One source of truth now: income only.
    upkeep:      0,
    income:      12,
    width:       4,
    height:      4,
    amenityRange: 6,
    satisfBoost:  18,
  },
  [T.FIBERHUB]: {
    label:       'Fiber Hub',
    color:       '#0c1820',
    glowColor:   '#40e0ff',
    powerOutput: 0,
    powerInput:  8,   // draws 8 kW
    throughput:  0,
    cost:        25000,
    upkeep:      -22, // negative upkeep = income ($22/s)
    income:      22,
    width:       5,
    height:      5,
  },
  [T.POWERTOWER]: {
    label:       'Power Tower',
    color:       '#1a2030',
    glowColor:   '#40a0ff',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        1000,
    upkeep:      0.1,
    width:       2,
    height:      2,
  },
  [T.LIGHTNINGROD]: {
    label:       'Lightning Rod',
    color:       '#181c24',
    glowColor:   '#a0d0ff',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        12000,
    upkeep:      8.5,
    width:       3,
    height:      4,
    // Buildings within this many tiles of the rod's FOOTPRINT (edge to
    // edge, not centre to centre) get their strike odds cut. Stacking
    // rods multiplies the reduction — see LightningDamageSystem.
    // protectionAt. Scaled with the mast's footprint: a taller tower
    // reaches further, and the wider base is what earns the price bump.
    protectRange: 14,   // was 9; half as far again
    // Watts fed back into the grid when this rod intercepts a strike,
    // decaying to 0 over surgeHours of in-game time. A second strike while
    // a surge is still live stacks on top of whatever is still flowing,
    // capped at surgeMax — see LightningDamageSystem.surgeWatts. Only
    // reaches the grid if the rod is wired in, which is the point: rods
    // stop being pure insurance and start paying for their own upkeep.
    surgeOutput: 10,
    surgeMax:    18,
    surgeHours:  1,
    // Fraction of a strike this rod FAILS to intercept. Stacking rods
    // multiplies these together, so mixed MK1/MK2 coverage composes
    // naturally — see LightningDamageSystem.protectionAt.
    passthrough: 0.38,   // 62% intercepted by one rod
  },
  [T.LIGHTNINGROD2]: {
    label:       'Lightning Rod MK2',
    color:       '#141a26',
    glowColor:   '#80e0ff',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        38000,
    upkeep:      17,
    width:       4,
    height:      5,
    protectRange: 26,   // was 13; doubled
    // A resonant capture coil rather than a bare spike: it pulls in strikes
    // that would otherwise ground elsewhere, and banks far more of the
    // energy before bleeding it back out.
    surgeOutput: 24,
    surgeMax:    42,
    surgeHours:  1.5,
    passthrough: 0.18,   // 82% intercepted by one rod
  },
  [T.LIGHTNINGROD3]: {
    label:       'Lightning Rod MK3',
    color:       '#10141e',
    glowColor:   '#b8a0ff',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        105000,
    upkeep:      32,
    width:       5,
    height:      6,
    protectRange: 54,   // was 18; tripled
    // A storm spire: twin capture toroids over a plasma column, feeding a
    // capacitor bank at the base. It holds a strike's energy far longer and
    // releases more of it than the MK2 — still a gameplay-scaled figure; a
    // real bolt is too brief to bank usefully.
    surgeOutput: 70,
    surgeMax:    130,
    surgeHours:  2,
    passthrough: 0.07,   // 93% intercepted by one rod
  },
  [T.WATER]: {
    label:       'Water',
    color:       '#061a2e',
    glowColor:   '#1060a0',
    powerOutput: 0, powerInput: 0, throughput: 0, cost: 0, upkeep: 0,
  },
  [T.BUSH]: {
    label:       'Bush',
    color:       '#1a3a10',
    glowColor:   '#30a030',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    upkeep:      0,
  },
  [T.TREE]: {
    label:       'Tree',
    color:       '#1a3a10',
    glowColor:   '#40c040',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    upkeep:      0,
  },
  [T.BIOFUELGEN]: {
    label:       'Biofuel Generator',
    color:       '#1a2a10',
    glowColor:   '#60c040',
    powerOutput: 3,
    powerInput:  0,
    throughput:  0,
    cost:        1500,
    upkeep:      1.0,
    blastRadius: 2,      // chain-explodes if caught close to another generator going up
  },
  [T.SOLAR]: {
    label:       'Solar MK1',
    upkeep:      1.25,  // $/s maintenance cost (was 2.5: the worst running cost per average kW in the game)
    color:       '#2a4a6a',
    glowColor:   '#80c8ff',
    peakOutput:  7.5,  // W at solar noon; scales to 0 at night
    powerOutput: 0,    // updated each tick by PowerNetwork
    powerInput:  0,
    throughput:  0,
    width:       2,
  height:      1,
  cost:        2000,
  },
  [T.WIRE]: {
    label:       'Wire',
    upkeep:      0.05,   // $/s maintenance cost
    color:       '#1e2a38',
    glowColor:   '#00d4ff',
    powerOutput: 0,
    powerInput:  0,
    throughput:  85,    // W max before overload (MK2 upgrade raises to 180)
    cost:        50,
  },
  [T.RESEARCH]: {
    label:        'Research Station MK1',
    color:        '#1a1a2e',
    glowColor:    '#b060ff',
    powerOutput:  0,
    powerInput:  3,      // W consumed while researching
    throughput:   0,
    upkeep:     4,
  cost:         5000,
    researchRate: 1,      // research points per second when powered
    income:       0,         // explicitly no income — research stations don't earn money
  },
  [T.RESEARCH2]: {
    label:        'Research Station MK2',
    color:        '#140a28',
    glowColor:    '#d090ff',
    powerOutput:  0,
    powerInput:   12,
    throughput:   0,
    upkeep:     10,
  cost:        30000,
    researchRate: 3,
    income:       0,
    width:        2,
    height:       2,
  },
  [T.RESEARCH3]: {
    label:        'Research Station MK3',
    color:        '#0e0420',
    glowColor:    '#e0a0ff',
    powerOutput:  0,
    powerInput:   20,
    throughput:   0,
    upkeep:      18,
    cost:        50000,
    researchRate: 6,
    income:       0,
    width:        3,
    height:       3,
  },
  [T.SMALLPARK]: {
    label:       'Small Park',
    color:       '#1a2a14',
    glowColor:   '#60d040',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    upkeep:      -2.0,   // negative upkeep = income
    income:      2.0,
    upfrontPaid: 8000,   // one-time income on completion
    width:       3,
    height:      2,
  },
  [T.COMMUNITYGARDEN]: {
    label:       'Community Garden',
    color:       '#1c2a10',
    glowColor:   '#a0d040',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    upkeep:      -1.5,
    income:      1.5,
    upfrontPaid: 6000,
    width:       3,
    height:      3,
  },
  [T.TREEDSTREET]: {
    label:       'Tree-Lined Street',
    color:       '#16240e',
    glowColor:   '#80c060',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    upkeep:      -0.5,
    income:      0.5,
    upfrontPaid: 3000,
    width:       4,
    height:      1,
  },
  [T.BASKETBALLCOURT]: {
    label:       'Basketball Court',
    color:       '#1a2024',
    glowColor:   '#f09030',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    upkeep:      -2.5,   // negative upkeep = income
    income:      2.5,
    upfrontPaid: 10000,
    width:       5,
    height:      3,
  },
  [T.FARMERSMARKET]: {
    label:       'Farmers Market',
    color:       '#242014',
    glowColor:   '#e0b040',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    upkeep:      -3.5,
    income:      3.5,
    upfrontPaid: 14000,
    width:       4,
    height:      2,
  },
  [T.FOUNTAIN]: {
    label:       'Fountain Plaza',
    color:       '#1a2a30',
    glowColor:   '#60c0f0',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    upkeep:      -3.0,
    income:      3.0,
    upfrontPaid: 12000,
    width:       3,
    height:      3,
  },
  // MK3-era parks (Research Station MK3). The Community Center is a powered
  // park like the Splash Pad: 14 kW 08:00–22:00, half pay while starved.
  [T.ALLOTMENTS]: {
    label: 'Community Allotments', color: '#1a2410', glowColor: '#a0d050',
    powerOutput: 0, powerInput: 0, throughput: 0, cost: 0, upkeep: -5.0, income: 5.0, upfrontPaid: 18000, width: 6, height: 5,
  },
  [T.DOGPARK]: {
    label: 'Dog Park', color: '#1a2410', glowColor: '#e0b060',
    powerOutput: 0, powerInput: 0, throughput: 0, cost: 0, upkeep: -4.0, income: 4.0, upfrontPaid: 15000, width: 5, height: 4,
  },
  // The shop on the corner, with the owner's flat upstairs. A powered
  // residential amenity: 2.5 kW while open 07:00–23:00, fridges overnight.
  [T.CORNERSTORE]: {
    label: 'Corner Store', color: '#201814', glowColor: '#ff8a5a',
    powerOutput: 0, powerInput: 2.5, throughput: 0, cost: 0, upkeep: -3.0, income: 3.0, upfrontPaid: 7000, width: 3, height: 3,
  },
  [T.COMMUNITYCENTER]: {
    label: 'Community Center', color: '#201a14', glowColor: '#ffc870',
    powerOutput: 0, powerInput: 14, throughput: 0, cost: 0, upkeep: -6.0, income: 6.0, upfrontPaid: 24000, width: 9, height: 6,
  },
  // MK3-era powered park: a public glasshouse. Grow lights, misting and
  // fans draw 18 kW 06:00–22:00; heating keeps 5 kW on overnight.
  [T.GREENHOUSE]: {
    label: 'Botanic Greenhouse', color: '#14241a', glowColor: '#90f0a0',
    powerOutput: 0, powerInput: 18, throughput: 0, cost: 0, upkeep: -6.0, income: 6.0, upfrontPaid: 22000, width: 8, height: 6,
  },
  // Hydro-era park. A working family farm on the edge of a big
  // neighbourhood: off-grid like the other parks, the biggest of them all.
  [T.FARM]: {
    label: 'Family Farm', color: '#2a2614', glowColor: '#d8b050',
    powerOutput: 0, powerInput: 0, throughput: 0, cost: 0, upkeep: -7.0, income: 7.0, upfrontPaid: 30000, width: 10, height: 8,
  },
  [T.PLAYGROUND]: {
    label:       'Playground',
    color:       '#1c1a10',
    glowColor:   '#f0a040',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    upkeep:      -1.5,
    income:      1.5,
    upfrontPaid: 5000,
    width:       4,
    height:      4,
  },
  // Powered park amenities. Unlike the parks above these DO join the grid:
  // their draw follows a schedule (DemandCurves), and while they're scheduled
  // on but unpowered they pay only half their income (see Economy.tick).
  [T.SPLASHPAD]: {
    label:       'Splash Pad',
    color:       '#0c1c24',
    glowColor:   '#40c8f0',
    powerOutput: 0,
    powerInput:  10,     // pumps, 10:00–19:00, off in rain
    throughput:  0,
    cost:        0,
    upkeep:      -2.5,
    income:      2.5,
    upfrontPaid: 9000,
    width:       5,
    height:      5,
  },
  [T.BASEBALLFIELD]: {
    label:       'Lit Baseball Diamond',
    color:       '#10200c',
    glowColor:   '#f0e090',
    powerOutput: 0,
    powerInput:  25,     // floodlights, 18:00–22:00
    throughput:  0,
    cost:        0,
    upkeep:      -4.0,
    income:      4.0,
    upfrontPaid: 16000,
    width:       13,
    height:      10,
  },
  [T.ROAD]: {
    label:       'Road',
    color:       '#222222',
    glowColor:   '#d0d0c0',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        800,
    upkeep:      0.1,
    width:       6,
    height:      6,
  },
  // Bridge: there is no T.BRIDGE entity. The tool places a T.ROAD with
  // `_bridge` set, so trucks, removal, refunds and saving treat it as the
  // road it is. `cost` is the road price; each water tile spanned adds
  // WaterBuild.BRIDGE_PER_TILE on top (see WaterBuild.bridgePlan).
  [T.BRIDGE]: {
    label:       'Bridge',
    color:       '#2a2c2e',
    glowColor:   '#c8ccd0',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        800,
    upkeep:      0.1,
    width:       6,
    height:      6,
  },
  [T.HOUSE]: {
    label:        'House MK1',
    color:        '#1a1a0a',
    glowColor:    '#ffe080',
    powerOutput:  0,
    powerInput:   4,      // W drawn from wire network (via substation)
    throughput:   0,
    cost:         0,
    income:       0,      // $/s when powered
    // Houses don't use wires — powered wirelessly by nearby substation
    // 2×2 (was 1×1). Houses saved at 1×1 before the change keep that
    // footprint on load (see save.js), and Mae's Cabin stays 1×1.
    width:        2,
    height:       2,
  },
  [T.BEACON]: {
    label:       'Communications Beacon',
    upkeep:      8.5,   // $/s maintenance cost
    color:       '#0a1424',
    glowColor:   '#5aa8ff',
    powerOutput: 0,
    powerInput:  3,    // W on standby — keeping the contract board online
    searchPowerInput: 12,   // W while sweeping for contract work
    throughput:  0,
    cost:        20000,
    income:      0,
    width:       5,
    height:      6,
  },
  [T.MONITOR]: {
    label:       'Monitoring Station',
    upkeep:      7.5,   // $/s maintenance cost,
    color:       '#0a1e1a',
    glowColor:   '#40ffcc',
    powerOutput: 0,
    powerInput:  3,    // W consumed — needs a real connection to work
    throughput:  0,
    cost:        16000,
    income:      0,
    width:       2,
    height:      2,
  },
  // The grid operations centre. Does everything the MK1 does (it counts as a
  // Monitoring Station everywhere: see hasActiveMonitor) and adds the two
  // things a grid with storage and several networks needs: the Network
  // Breakdown window and the GRID panel's storage readout (hasActiveMonitor2).
  // Priced as a Research MK3-era building: about twice that station.
  [T.MONITOR2]: {
    label:       'Monitoring Station MK2',
    upkeep:      30,
    color:       '#0a1e1a',
    glowColor:   '#40ffcc',
    powerOutput: 0,
    powerInput:  25,
    throughput:  0,
    cost:        120000,
    income:      0,
    width:       4,
    height:      4,
  },
  // Where the Engineering Audit is bought (advisor.js): a paid survey of the
  // pipe and fuel chains, written up as what is wrong and the steps to fix
  // it. One per map, a 10×8 campus; the audits themselves are charged
  // separately. Unlocked once an Advanced Nuclear Reactor has generated.
  [T.ENGOFFICE]: {
    label:       'Engineering Office',
    upkeep:      40,
    color:       '#0a1622',
    glowColor:   '#7ad8ff',
    powerOutput: 0,
    powerInput:  30,
    throughput:  0,
    cost:        180000,
    income:      0,
    width:       10,
    height:      8,
  },
  [T.LAMP]: {
    label:             'Street Lamp',
    upkeep:            -0.3,  // negative upkeep = income
    color:             '#2a2510',
    glowColor:         '#ffe090',
    powerOutput:       0,
    powerInput:        0.5,
    throughput:        0,
    cost:              280,
    income:            0.3,
    amenityRange:      4,
    satisfBoost:       14,
    recoveryMultiplier: 3,
  },
  [T.POLE]: {
    label:        'Power Pole',
    color:        '#2a3a2a',
    glowColor:    '#60c060',
    powerOutput:  0,
    powerInput:   0,
    throughput:   0,
    cost:         250,
    upkeep:       0.25,
    // Acts as a wire-range anchor — wires within MAX_WIRE_HOPS of a pole are in-range
  },
  [T.PROTECTOR]: {
    label:           'Surge Protector',
    color:           '#0a1820',
    glowColor:       '#40e0ff',
    powerOutput:     0,
    powerInput:      0,      // passive — works without power
    throughput:      0,
    cost:        12500,
    upkeep:      7.0,
    income:          0,
  },
  [T.GOVERNOR]: {
    label:       'Throttle Governor',
    color:       '#14181c',
    glowColor:   '#ffb040',
    powerOutput: 0,
    // Small control load, drawn from the generator's own network (it joins
    // whatever network the generator it touches is on — no wire needed).
    // Kept low on purpose: Overdrive only adds ~40 kW (coal) / ~62 kW (fuel), so
    // a heavy draw would eat the very power it exists to protect.
    powerInput:  4,
    throughput:  0,
    cost:        32000,
    upkeep:      6,
    width:       2,
    height:      2,
    // Governs every Fuel/Coal Generator sharing an edge with its footprint.
    // In Overdrive it blends the throttle back toward Normal as heat (fuel)
    // or boiler pressure (coal) climbs from trimStart to trimLimit — full
    // Overdrive below trimStart, pure Normal at trimLimit, where Normal's own
    // settling point pulls it back down well short of a trip.
    trimStart:   0.80,
    trimLimit:   0.90,
  },
  [T.CARBONCAPTURE]: {
    label:       'Carbon Capture Plant',
    color:       '#0c1a16',
    glowColor:   '#50e0a0',
    powerOutput: 0,
    // Big fans and a compressor train — pulling CO₂ out of open air is
    // power-hungry, which is the point: it's a way out of a dirty early
    // game, not a free pass to keep burning coal.
    powerInput:  120,
    throughput:  0,
    cost:        120000,
    upkeep:      10,
    income:      0,
    width:       10,
    height:      8,
    // See PollutionSystem: clears smog within CAPTURE_RADIUS cells (40
    // tiles) and captures CAPTURE_SHARE of the emissions of every polluting
    // plant inside that ring.
  },
  [T.PROTECTOR2]: {
    label:           'Surge Protector MK2',
    color:           '#0a1030',
    glowColor:       '#00ffcc',
    powerOutput:     0,
    powerInput:      0,
    throughput:      0,
    width:           2,
    height:          2,
    cost:        45000,
    upkeep:      10.0,
    income:          0,
  },
  // Substation-class gas-insulated arrester bay, and the top of the line.
  // Priced at 4.3× the MK2 for 4× its ceiling, so it stays the answer to an
  // MK2 bank that has converged rather than a shortcut past ever building
  // one. The curve itself lives in PowerNetwork's PROTECTION_TIERS table.
  [T.PROTECTOR3]: {
    label:           'Surge Protector MK3',
    color:           '#120a2c',
    glowColor:       '#b070ff',
    powerOutput:     0,
    // Unlike MK1/MK2 this one is not passive: a gas-insulated bay runs its
    // own SF6 monitoring and forced cooling. Small enough not to eat the
    // headroom it exists to provide, big enough that an isolated MK3 sitting
    // on a dead network is visibly idle rather than silently working.
    powerInput:      6,
    throughput:      0,
    width:           3,
    height:          3,
    cost:       195000,
    upkeep:      16.0,
    income:          0,
  },
  [T.SUBSTATION]: {
    label:        'Substation MK1',
    color:        '#0a1828',
    glowColor:    '#40a0ff',
    powerOutput:  0,
    powerInput:   0,
    throughput:   0,
    width:        2,      // 2×2 footprint
    height:       2,
    capacity:     27540,
    ratedKWh:     200,     // nameplate shown to the player; capacity above is the simulated store
    dischargeScale: 4.357,  // 500 kWh drain 1.5x faster
    maxRate:      929443359375,
    maxOutput:   200,      // max W discharge rate
    upkeep:       8.0,
    cost:         25500,
  },
  [T.SUBSTATION2]: {
    label:        'Substation MK2',
    color:        '#0a1030',
    glowColor:    '#60c0ff',
    powerOutput:  0,
    powerInput:   0,
    throughput:   0,
    width:        3,
    height:       3,
    // MK2 sits a flat 125% above MK1 on both storage and discharge:
    // MK1 is 200 kWh / 200 kW, so MK2 is 450 kWh / 450 kW. Keeping the two
    // numbers equal mirrors MK1 (also 200/200), so the tier reads as one
    // clean step up rather than two unrelated ones.
    capacity:     49320,  // 450 kWh (×109.6 game-time factor)
    ratedKWh:     450,     // nameplate shown to the player; capacity above is the simulated store
    dischargeScale: 4.357,
    maxRate:      929443359375,
    maxOutput:   450,
    upkeep:       18.0,
    cost:         55000,
  },
  [T.SUBSTATION3]: {
    label:        'Substation MK3',
    color:        '#060c24',
    glowColor:    '#80e0ff',
    powerOutput:  0,
    powerInput:   0,
    throughput:   0,
    width:        4,
    height:       4,
    // Same equal-storage/discharge shape as MK1/MK2, one big step up:
    // 1.2 MWh / 1.2 MW — enough to carry a late-game city through the night.
    capacity:     131520, // 1.2 MWh (×109.6 game-time factor)
    ratedKWh:     1200,     // nameplate shown to the player; capacity above is the simulated store
    dischargeScale: 4.357,
    maxRate:      929443359375,
    maxOutput:   1200,
    upkeep:       32.0,
    cost:         115000,
  },
  [T.SUBSTATION4]: {
    label:        'Substation MK4',
    color:        '#070b18',
    glowColor:    '#b0a0ff',
    powerOutput:  0,
    powerInput:   0,
    throughput:   0,
    width:        6,
    height:       6,
    // The MK4-era tier, same equal storage/discharge shape: 3 MWh / 3 MW,
    // 2.5x MK3 for a little under 2.5x the price.
    capacity:     328800, // 3 MWh (×109.6 game-time factor)
    ratedKWh:     3000,     // nameplate shown to the player; capacity above is the simulated store
    dischargeScale: 4.357,
    maxRate:      929443359375,
    maxOutput:   3000,
    upkeep:       90.0,
    cost:         275000,
  },
  [T.SUBSTATION5]: {
    label:        'Substation MK5',
    color:        '#0a0a12',
    glowColor:    '#ffd078',
    powerOutput:  0,
    powerInput:   0,
    throughput:   0,
    width:        8,
    height:       8,
    // Fusion-age tier, same equal storage/discharge shape: 8 MWh / 8 MW.
    capacity:     876800, // 8 MWh (×109.6 game-time factor)
    ratedKWh:     8000,     // nameplate shown to the player; capacity above is the simulated store
    dischargeScale: 4.357,
    maxRate:      929443359375,
    maxOutput:   8000,
    upkeep:       210.0,
    cost:         650000,
  },
  [T.SOLAR2]: {
    label:       'Solar Panel MK2',
    upkeep:      3.0,
    color:       '#0a2a50',
    glowColor:   '#40c8ff',
    peakOutput:  25,
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        5000,
    width:       3,
    height:      2,
  },
  // Nuclear-era solar: three single-axis tracker rows, a molten-salt tank that
  // banks part of the midday harvest for the evening, and rail-riding wash
  // robots that keep the glass clean. Behaviour lives in power_network.js
  // (_applySolar3Output); every array gets its own def copy there.
  [T.SOLAR3]: {
    label:        'Solar Array',
    upkeep:       18.0,
    color:        '#081830',
    glowColor:    '#ffb040',
    peakOutput:   180,    // kW raw at full sun, before the salt tank takes its share
    powerOutput:  0,
    powerInput:   0,
    throughput:   0,
    cost:         45000,
    width:        6,
    height:       4,
    trackingExp:  0.4,    // sunlight^exp: trackers face the low dawn/dusk sun head-on
    saltCapacity: 150,    // kWh of heat the tank holds
    saltRate:     50,     // kW: the tank tops the array up to this when the sun can't
    saltDivert:   0.25,   // share of raw output sent to the tank while it is filling
    saltEff:      0.9,    // round-trip efficiency into the tank
    saltLeak:     0.01,   // share of stored heat lost per game hour
    washerDraw:   4,      // kW the wash robots take from the array's own output
  },
  [T.WIND]: {
    label:       'Wind Turbine',
    upkeep:      5.0,
    color:       '#1a2a1a',
    glowColor:   '#80ffb0',
    baseOutput:  5,
    maxOutput:   12.5,
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        8500,
    width:       2,
    height:      2,
  },
  [T.WIND2]: {
    label:       'Wind Turbine MK2',
    upkeep:      11.0,
    color:       '#122224',
    glowColor:   '#60d8ff',
    baseOutput:  13,
    maxOutput:   32,
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        16000,
    width:       3,
    height:      3,
  },
  [T.WIND3]: {
    label:       'Wind Turbine MK3',
    upkeep:      16.0,
    color:       '#0e1c22',
    glowColor:   '#48e0ff',
    baseOutput:  28,
    maxOutput:   49,
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        30000,
    width:       4,
    height:      4,
  },
  [T.BATTERY]: {
    label:       'Battery Block',
    upkeep:      7.5,
    color:       '#1a2010',
    glowColor:   '#a0ff60',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    capacity:    9180,
    ratedKWh:     50,     // nameplate shown to the player; capacity above is the simulated store
    dischargeScale: 1.895,  // drain 20% faster than previous (was 2.274)
    maxRate:     309814453125,
    maxOutput:   50,        // max W discharge rate
    chargeRate:  1.25,      // 25% faster charge than default
    cost:        8000,
    width:       1,
    height:      2,
  },
  [T.INDUSTRIAL]: {
    label:       'Industrial Load',
    upkeep:      0,
    color:       '#1a0a0a',
    glowColor:   '#ff8040',
    powerOutput: 0,
    powerInput:  30,   // varies by subtype
    throughput:  0,
    cost:        0,
    income:      0,
  },
  [T.COMMERCIAL]: {
    label:       'Commercial Building',
    upkeep:      0,
    color:       '#1a1400',
    glowColor:   '#f0c040',
    powerOutput: 0,
    powerInput:  15,
    throughput:  0,
    cost:        0,
    income:      0,
  },
  [T.CAMERA]: {
    label:        'Security Camera',
    upkeep:       -0.6,  // negative upkeep = income
    color:        '#1a1a2a',
    glowColor:    '#8080ff',
    powerOutput:  0,
    powerInput:   1,
    throughput:   0,
    cost:         950,
    income:       0.6,
    amenityRange:           5,
    satisfBoost:            20,
    reliabilityProtection:  true,  // reduces blackout reliability decay by 40%
  },
  [T.FISHINGPOLE]: {
    label:       'Fishing Pole',
    color:       '#2a2010',
    glowColor:   '#60c0a0',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    upkeep:      0,
    // Not a placeable entity — selecting this tool hands control to
    // FishingSystem, which drives its own cast/bite/catch minigame
    // instead of the normal ghost-cursor + tryPlace() flow.
  },
  [T.CIRCUITSWITCH]: {
    label:       'Circuit Switch',
    upkeep:      12.5,
    color:       '#141a14',
    glowColor:   '#ffb040',
    powerOutput: 0,
    // Deliberately ZERO: a breaker that needs the grid up in order to be
    // thrown is useless during the exact event it exists for.
    powerInput:  0,
    throughput:  0,
    cost:        40000,
    income:      0,
    width:       4,
    height:      4,
    switchCapacity: 500,   // W of PEAK draw its roster may total
  },
  [T.CIRCUITSWITCH2]: {
    label:       'Circuit Switch MK2',
    upkeep:      30.0,
    color:       '#0e1620',
    glowColor:   '#40c0ff',
    powerOutput: 0,
    // Deliberately ZERO, same reasoning as the MK1 — a breaker that needs
    // the grid up to be thrown is useless during the exact event it exists
    // for.
    powerInput:  0,
    throughput:  0,
    cost:        150000,
    income:      0,
    width:       6,         // the compound's own tiles — was 7×7, with empty ground
    height:      5,         // above, below and down the left side
    switchCapacity: 1400,   // kW of PEAK draw its roster may total — 2.8x the MK1
  },
  [T.EVCHARGER]: {
    label:        'EV Charging Station',
    upkeep:       1.2,
    color:        '#0a1a0a',
    glowColor:    '#40ff80',
    powerOutput:  0,
    powerInput:   3,
    throughput:   0,
    cost:        12500,
    income:       0,
    // A 5×4 forecourt: solar canopy over four charging bays. Was a 1×1 post —
    // chargers already in a save keep that size (and the post sprite).
    width:        5,
    height:       4,
    amenityRange:       3,   // tiles from the nearest edge of the forecourt
    satisfBoost:        35,   // largest boost
    attractsPremium:    true  // biases requests toward higher-value families
  },
  [T.SURVEY]: {
    label:       'Resource Survey Station',
    upkeep:      1.0,
    color:       '#1a1008',
    glowColor:   '#c08030',
    powerOutput: 0,
    powerInput:  8,   // W dormant draw
    scanPowerInput: 40,   // W while actively scanning
    throughput:  0,
    cost:        30000,
    income:      0,
    width:       4,
    height:      4,
    surveyTime:  90,   // seconds to complete a survey
    cooldown:    3600, // 1 hour real-time cooldown between surveys
    scanSlots:   1,
  },
  // The MK4-era survey rig: a permanent geophysics observatory rather than a
  // field camp. Two independent dish towers, each running its own scan, so
  // the late game can survey two resources at once instead of queueing
  // 30-40 hour scans back to back. Scans started here cost `scanDiscount`
  // less (the ladder each kind climbs is unchanged — the discount comes off
  // whatever the next rung costs), and the last scans in the chain (see
  // SCAN_KINDS.mk2Only in coal_system.js) can only be run from one of these.
  // Each running slot draws its own scan power on top of the idle draw.
  [T.SURVEY2]: {
    label:       'Survey Station MK2',
    upkeep:      14.0,
    color:       '#0c1014',
    glowColor:   '#ffb040',
    powerOutput: 0,
    powerInput:  20,   // W dormant draw
    scanPowerInput: 40,   // W per running scan slot (climbs with the scan count, as on the MK1)
    throughput:  0,
    cost:        150000,
    income:      0,
    width:       6,
    height:      6,
    scanSlots:   2,
    scanDiscount: 0.25,
  },
  [T.AQUIFER]: {
    label:       'Aquifer Deposit',
    color:       '#041418',
    glowColor:   '#20d4c8',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    income:      0,
    // size set dynamically at spawn (5×5, 6×6, or 8×8)
  },
  [T.WATEREXTRACTOR]: {
    label:       'Water Extractor',
    color:       '#041820',
    glowColor:   '#20c8d4',
    powerOutput: 0,
    powerInput:  25,
    throughput:  0,
    upkeep:      7.0,   // was 17.5, then 10 — a pump was over a quarter of a coal plant's running cost
    cost:        35000,
    income:      0,
    width:       4,
    height:      4,
    // Units/s put into the pipe network it feeds. Coal generators draw
    // COALGENERATOR.waterPerSecond (10) each, so one extractor runs two of
    // them with 5 units/s spare — a third needs its own extractor, or a
    // second one piped into the same run to pool supply.
    waterPerSecond: 25,
  },
  [T.PIPE]: {
    label:       'Pipe',
    color:       '#081820',
    glowColor:   '#20a0c0',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    upkeep:     0.07,
  cost:        180,
    income:      0,
  },
  [T.UNDERGNDPIPE]: {
    label:       'Underground Pipe',
    color:       '#060e14',
    glowColor:   '#1880a0',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    upkeep:      0.3,
    cost:        800,
    income:      0,
  },
  // Tool/def only: the placed entity is a T.CONVEYOR flagged _udgBelt that
  // carries this def, so cost, refund and label come from here while every
  // conveyor system treats it as a belt (see beltSteps in resource_helpers.js).
  [T.UNDERGNDCONVEYOR]: {
    label:       'Underground Belt',
    color:       '#0e0a06',
    glowColor:   '#a06a28',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    upkeep:      0.25,
    cost:        600,
    income:      0,
  },
  // Tool/def only, like the Underground Belt: the placed entity is a
  // T.CONVEYOR flagged _splitter. It joins every side as a plain belt does;
  // what it adds is how a short supply divides where routes part on it
  // (Even / Priority / Ratio — BeltShare in resource_helpers.js).
  [T.CONVEYORSPLITTER]: {
    label:       'Conveyor Splitter',
    color:       '#0e0a06',
    glowColor:   '#e0b020',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    upkeep:      0.3,
    cost:        900,
    income:      0,
  },
  [T.HYDROGENERATOR]: {
    label:       'Hydroelectric Generator',
    color:       '#04101a',
    glowColor:   '#20d4ff',
    powerOutput: 235,
    powerInput:  0,
    throughput:  0,
    upkeep:      30.0,
    cost:        100000,
    income:      0,
    // Square footprint (was 9×9, 10×10, and 7×5 before that). The circular
    // generator pit is sized off min(width,height), so the art scales down
    // with the footprint without changing the shaft-input / transformer layout.
    width:       7,
    height:      7,
  },
  [T.GEODEPOSIT]: {
    label:       'Geothermal Deposit',
    color:       '#140a08',
    glowColor:   '#ff8040',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    income:      0,
    // size set dynamically at spawn (2×2, 3×3, or 3×2)
  },
  [T.GEOWELL]: {
    label:       'Geothermal Well',
    upkeep:      8.0,
    color:       '#120c0a',
    glowColor:   '#ff9050',
    powerOutput: 0,
    powerInput:  10,   // W — downhole pump + wellhead controls
    throughput:  0,
    cost:        22500,
    income:      0,
    width:       3,
    // 3×2, not 3×3: the sprite never reached into the bottom row, so that row
    // was reserving ground the well doesn't visibly occupy — it blocked
    // building and made deposits near an obstacle unusable for no visible
    // reason. The ARTWORK is still drawn three tiles tall (visualHeight
    // below), so nothing about the well's appearance changed.
    height:      2,
    // Height the sprite is drawn at, and the height the steam output port is
    // measured from (renderGeoWell / GeothermalSystem.wellOutputPort). Kept
    // separate from `height` so shrinking the footprint moved neither the
    // artwork nor the port tile a turbine has to cover.
    visualHeight: 3,
    steamOutput: 45,   // nominal steam units/s — the live figure is 35–55 depending on
                       // the world's geothermal activity (GeothermalSystem.getOutputPerTurbine)
  },
  [T.GEOTURBINE]: {
    label:       'Geothermal Turbine',
    upkeep:      8.0,  // was 14 — geothermal had the worst running cost per watt
    color:       '#0e1214',
    glowColor:   '#ffb070',
    powerOutput: 45,   // nominal — overridden per world by geothermal activity (35–55 kW)
    powerInput:  0,
    throughput:  0,
    cost:        30000,
    income:      0,
    width:       5,
    height:      4,
    blastRadius: 4,    // chain-explodes if caught close to another generator going up
    steamDraw:   35,   // must be fully met by its linked well to generate at all; scales
                       // with activity in lockstep with the well's output
  },
  [T.COALDEPOSIT]: {
    label:       'Coal Deposit',
    color:       '#0a0a0c',
    glowColor:   '#504840',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    income:      0,
  },
  [T.OILDEPOSIT]: {
    label:       'Oil Deposit',
    color:       '#0a0806',
    glowColor:   '#c08020',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    income:      0,
  },
  [T.URANIUMDEPOSIT]: {
    label:       'Uranium Deposit',
    color:       '#04100a',
    glowColor:   '#60ff60',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    income:      0,
  },
  [T.SULFURDEPOSIT]: {
    label:       'Sulfur Deposit',
    color:       '#14120a',
    glowColor:   '#e0d040',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    income:      0,
  },
  [T.LITHIUMDEPOSIT]: {
    label:       'Lithium Deposit',
    color:       '#181c1e',
    glowColor:   '#d8f4ff',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    income:      0,
  },
  // Monazite sand: heavy-mineral beach sand banded honey-red and black,
  // the rare earth ore the Field Core chain starts from (rare_earth_systems.js).
  [T.RAREEARTHDEPOSIT]: {
    label:       'Rare Earth Deposit',
    color:       '#1a120c',
    glowColor:   '#ff9a5a',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    income:      0,
  },
  [T.HELIUMDEPOSIT]: {
    label:       'Helium Gas Field',
    color:       '#14121c',
    glowColor:   '#f0b8ff',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        0,
    income:      0,
  },
  [T.HELIUMWELL]: {
    label:       'Helium Well',
    upkeep:      25.0,  // was 12
    color:       '#141220',
    glowColor:   '#f0b8ff',
    powerOutput: 0,
    powerInput:  20,
    throughput:  0,
    cost:        420000,   // was 385k
    income:      0,
    // 6x6 (was 4x4). Wells already in a save keep their saved 4x4: growing one
    // would move its HE OUT stub off its pipe. The art scales to either.
    width:       6,
    height:      6,
    heliumPerSec:    2,     // helium gas separated from the field's natural gas per second
    heliumCapacity:  1000,  // max helium gas output buffer
  },
  [T.HELIUMWELL2]: {
    // Unlocks once an Advanced Fusion Reactor has run. The stellarator boils
    // off 6/s, so one MK2 covers one reactor's magnets. Fields stay scarce: it
    // draws its field down three times as fast, so it trades field life for
    // rate rather than adding helium to the map. 8×8, laid so its HE OUT lands
    // on the tile an MK1's would (the field sits in its right half), so built
    // over an MK1 it takes over the MK1's pipe as it stands.
    label:       'Helium Well MK2',
    upkeep:      60.0,
    color:       '#141220',
    glowColor:   '#90e0ff',
    powerOutput: 0,
    powerInput:  60,
    throughput:  0,
    cost:        625000,
    income:      0,
    width:       8,
    height:      8,
    heliumPerSec:    6,
    heliumCapacity:  1000,
  },
  [T.CRYOPLANT]: {
    label:       'Cryo Plant',
    upkeep:      45.0,  // was 30
    color:       '#0c141c',
    glowColor:   '#b8f0ff',
    powerOutput: 0,
    powerInput:  60,    // refrigeration to 4 K is brutally inefficient — this is the reactor's real standing load
    throughput:  0,
    cost:        800000,   // was 750k (525k, 420k, 280k before fusion equipment +50%, then fusion tier x1.25)
    income:      0,
    // 20x18 (was 16x14, 10x9 before that). Plants already in a save keep their
    // saved size: growing one would move its LHe OUT stub off the reactor's cryo
    // line. The sprite stretches its 400x360 design to any of the footprints.
    width:       20,
    height:      18,
    heliumPerSec:      3,    // helium gas liquefied per second (wells + reactor ash, whichever is piped in)
    liquidHeCapacity:  500,  // max liquid helium buffer
    // Same trip rule as the Cooling Tower's pumps — a sudden outage can trip
    // the compressors, and they stay down until they've had restartSeconds of
    // steady power. The magnets they cool warm up the whole time.
    compressorTripChance: 0.4,
    compressorRestartSeconds: 45,
  },
  [T.LITHIUMMINE]: {
    label:       'Lithium Mine',
    upkeep:      42.0,  // was 33
    color:       '#12181a',
    glowColor:   '#d8f4ff',
    powerOutput: 0,
    powerInput:  70,
    throughput:  0,
    cost:        250000,
    income:      0,
    width:       8,
    height:      10,
  },
  [T.URANIUMMINE]: {
    label:       'Uranium Mine',
    upkeep:      25.0,  // was 15
    color:       '#081410',
    glowColor:   '#60ff80',
    powerOutput: 0,
    powerInput:  25,
    throughput:  0,
    cost:        80000,
    income:      0,
    width:       4,
    height:      5,
  },
  [T.URANIUMMINE]: {
    label:       'Uranium Mine',
    upkeep:      25.0,  // was 15
    color:       '#0a1410',
    glowColor:   '#60ff80',
    powerOutput: 0,
    powerInput:  25,
    throughput:  0,
    cost:        80000,
    income:      0,
    width:       4,
    height:      5,
  },
  // The Uranium Mine's frame (4×5, same OUT stub, ORE_MINE_RATE), costed for
  // the endgame: a dredge pit with a magnetic separator in place of a shaft.
  [T.RAREEARTHMINE]: {
    label:       'Rare Earth Mine',
    upkeep:      49.0,
    color:       '#160e0a',
    glowColor:   '#ff9a5a',
    powerOutput: 0,
    powerInput:  100,
    throughput:  0,
    cost:        375000,
    income:      0,
    width:       4,
    height:      5,
  },
  [T.SULFURMINE]: {
    label:       'Sulfur Mine',
    upkeep:      15.0,
    color:       '#14120a',
    glowColor:   '#e0d040',
    powerOutput: 0,
    powerInput:  25,
    throughput:  0,
    cost:        80000,
    income:      0,
    width:       4,
    height:      5,
  },
  [T.PUMPJACK]: {
    label:       'Pump Jack',
    upkeep:      9.0,
    color:       '#0c0e10',
    glowColor:   '#d0a030',
    powerOutput: 0,
    powerInput:  15,
    throughput:  0,
    cost:        32500,
    income:      0,
    width:       3,
    height:      3,
  },
  [T.PUMPJACK2]: {
    label:       'Pump Jack MK2',
    upkeep:      16.0,
    color:       '#0c0e10',
    glowColor:   '#40c8e0',
    powerOutput: 0,
    powerInput:  28,
    throughput:  0,
    cost:        60000,
    income:      0,
    width:       4,
    height:      4,
    mk2:         true,
  },
  [T.SOLIDSTORAGE]: {
    label:       'Storage Container',
    upkeep:      5.5,
    color:       '#0e0d0a',
    glowColor:   '#c07a30',
    powerOutput: 0,
    powerInput:  0,   // passive bin — needs no power (see SolidStorageSystem.online)
    throughput:  0,
    cost:        24000,
    income:      0,
    width:       5,
    height:      5,
  },
  [T.OILSTORAGE]: {
    label:       'Liquid Storage Tank',
    upkeep:      6.5,
    color:       '#0e0c08',
    glowColor:   '#c09030',
    powerOutput: 0,
    powerInput:  0,   // passive vessel — needs no power and no grid connection (see OilSystem.tankOnline)
    throughput:  0,
    cost:        28000,
    income:      0,
    // Was 7×7, with an empty top row and an empty column on the far side from
    // the stubs; those tanks are trimmed by trimLegacyTanks. (5×5 before that;
    // those keep the size they were built at.)
    width:       6,
    height:      6,
  },
  [T.REFINERY]: {
    label:       'Oil Refinery',
    upkeep:      14.0,
    color:       '#0e0c06',
    glowColor:   '#d08020',
    powerOutput: 0,
    powerInput:  22,
    throughput:  0,
    cost:        54000,
    income:      0,
    // Was 5×4; refineries in older saves keep their stored footprint, and the
    // sprite and pipe stubs are laid out from width/height so both sizes work.
    width:       7,
    height:      6,
    crudePerSec:  3.3,   // crude consumed per second — scaled to match fuelPerSec's conversion ratio
    crudeCapacity: 200,  // crude intake buffer cap when a Pump Jack pipes straight in (no storage tank)
    fuelPerSec:    2.2,   // fuel oil produced per second — supports 2.2 fuel generators (each draws 1/sec)
    fuelCapacity: 2000, // max fuel oil buffer
    wasteCapacity: 150, // caps _sludgeWaste buffer awaiting truck pickup
    // Light gases (propane/butane — LPG) off the top of the distillation
    // column. Real crude yields ~2–4% LPG; 0.12 of 3.3 crude is ~3.6%, and
    // fuel oil output is unchanged. Until the Cryogenic Cooling Tower unlocks
    // there is no LPG OUT port and every unit is burned at the flare stack,
    // as real refineries do with gas they have no outlet for. After that the
    // port banks up to lpgCapacity and flares only the overflow — LPG never
    // backs up into the refinery or stops fuel oil.
    lpgPerSec:    0.12,
    lpgCapacity:  60,
  },
  [T.FUELGEN]: {
    label:       'Fuel Power Generator',
    upkeep:      25.0,
    color:       '#0e0a04',
    glowColor:   '#ffa020',
    powerOutput: 165,
    powerInput:  0,
    throughput:  0,
    cost:        85000,
    income:      0,
    width:       7,
    height:      6,
    fuelPerSecond: 1,  // fuel oil units consumed per second (Normal throttle)
    // Engine model (OilSystem.tickFuelEngine). Player picks a throttle from
    // the generator panel. `rpm` is the settled engine speed (1 = rated),
    // `heat` the temperature the block settles toward — at 1.0 it goes
    // critical (MeltdownSystem) and explodes if held there too long.
    throttleModes: {
      eco:       { label: 'ECO',       output: 0.6, fuel: 0.45, rpm: 0.7,  heat: 0.35, color: '#60d040' },
      normal:    { label: 'NORMAL',    output: 1.0, fuel: 1.0,  rpm: 1.0,  heat: 0.62, color: '#ffa020' },
      overdrive: { label: 'OVERDRIVE', output: 1.5, fuel: 2.0,  rpm: 1.35, heat: 1.12, color: '#ff4020' },
    },
    crankSeconds:        2.5,  // starter motor turns the engine over before it catches
    meltdownSeconds:     25,   // seconds at 100% heat before the block explodes
    blastRadius:         5.5,  // tiles, footprint edge out — see LightningDamageSystem.detonateGenerator
  },
  [T.GASSTATION]: {
    label:       'Gas Station',
    upkeep:      5.0,
    color:       '#101008',
    glowColor:   '#ffc040',
    powerOutput: 0,
    powerInput:  8,
    throughput:  0,
    cost:        20000,
    income:      0,
    width:       6,
    height:      5,
    storageCapacity: 400,  // max fuel oil buffer, pulled from refinery pipe network
    pullRate:    8,        // fuel oil units/sec pulled from connected refineries
  },
  [T.COALMINE]: {
    label:       'Coal Mine',
    upkeep:      9.0,
    color:       '#0e0e10',
    glowColor:   '#ff6020',
    powerOutput: 0,
    powerInput:  12,  // W — heavy industrial machinery
    throughput:  0,
    cost:        28500,
    income:      0,
    // Default/preview size. A mine is actually built as its deposit plus a
    // one-tile yard on every side (2×2 seam → 4×4, 3×3 → 5×5) — see
    // _coalMineFootprint in input_manager.js. Mines built before that keep
    // their saved exact-cover size.
    width:       4,
    height:      4,
    burnRate:    0.05,
  },
  [T.URANIUMMINE]: {
    label:       'Uranium Mine',
    upkeep:      25.0,  // was 15
    color:       '#08120c',
    glowColor:   '#60ff80',
    powerOutput: 0,
    powerInput:  25,
    throughput:  0,
    cost:        80000,
    income:      0,
    width:       4,
    height:      5,
  },
  [T.SULFURMINE]: {
    label:       'Sulfur Mine',
    upkeep:      15.0,
    color:       '#14120a',
    glowColor:   '#e0d040',
    powerOutput: 0,
    powerInput:  25,
    throughput:  0,
    cost:        80000,
    income:      0,
    width:       4,
    height:      5,
  },
  [T.SULFURMINE2]: {
    // Unlocks once a sulfur deposit is 50% mined. 6×7, laid so its OUT
    // stub lands on the tile an MK1's would (it grows up and away from the
    // stub), so built over an MK1 it takes over the MK1's belt as it stands.
    // Digs 2.5× as fast and drains its deposit 2.5× as fast: it trades
    // deposit life for rate rather than adding sulfur to the map.
    label:       'Sulfur Mine MK2',
    upkeep:      40.0,
    color:       '#18140a',
    glowColor:   '#fff070',
    powerOutput: 0,
    powerInput:  60,
    throughput:  0,
    cost:        320000,
    income:      0,
    width:       6,
    height:      7,
    sulfurPerSec: 2,
  },
  [T.CHEMICALPLANT]: {
    label:       'Chemical Plant',
    upkeep:      45.0,  // was 30
    color:       '#0a1018',
    glowColor:   '#40e0c0',
    powerOutput: 0,
    powerInput:  30,
    throughput:  0,
    cost:        150000,
    income:      0,
    width:       10,
    height:      9,
    sulfurPerSec:  0.8,
    waterPerSec:   0.4,
    acidPerSec:    0.6,
    acidCapacity:  300,
  },
  [T.FUELPLANT]: {
    label:       'Fuel Processing Plant',
    upkeep:      30.0,
    color:       '#0c100a',
    glowColor:   '#a0ff60',
    powerOutput: 0,
    powerInput:  30,    // 25-40 kW average
    throughput:  0,
    cost:        225000,
    income:      0,
    width:       10,   // was 8×7 — plants already in a save keep their saved size
    height:      9,
    acidPerSec:    0.4,   // sulfuric acid consumed per second
    uraniumPerSec: 0.3,   // uranium units consumed per second
    // Fuel rods produced per second. Deliberately NOT a whole multiple of
    // NUCLEARREACTOR.rodPerSec (0.05): 0.13 feeds 2.6 reactors, so two run
    // with 30% headroom and a third can't be squeezed on without a second
    // plant. The old 0.15 was exactly 3 reactors with zero margin, which read
    // as "3 works" but throttled the moment uranium supply dipped — rod
    // production scales by the uranium ratio (see FuelPlantSystem), and
    // reactors draw up to 10× their burn rate to fill their buffers, so an
    // exact 3:1 starved the newest reactor on every cold start.
    rodPerSec:     0.13,
    rodCapacity:   500,   // max rod output buffer
  },
  // Field Core chain, step 2 (docs/FIELD_CORE_SPEC.md). The Fuel Processing
  // Plant's shape — ore belt + acid pipe in, one belt out — plus thorium
  // tailings, a waste stream hauled to the Nuclear Waste facility. Every link
  // runs ~20% above its consumer: one mine's 0.8 ore/s feeds it with margin,
  // and its 0.4 oxide/s keeps the Superconductor Mill's 0.33 covered.
  [T.LEACHPLANT]: {
    label:       'Leach Plant',
    upkeep:      74.0,
    color:       '#140e0a',
    glowColor:   '#ff9a5a',
    powerOutput: 0,
    powerInput:  150,
    throughput:  0,
    cost:        565000,
    income:      0,
    width:       10,
    height:      9,
    orePerSec:        0.66,  // rare earth ore leached per second
    acidPerSec:       0.28,  // sulfuric acid consumed per second: a Chemical Plant's 0.6 feeds two
    oxidePerSec:      0.4,   // rare earth oxide produced per second
    oxideCapacity:    300,
    tailingsPerSec:   0.04,  // thorium tailings per second: the 100 store fills in ~50 in-game hours
    tailingsCapacity: 100,   // one Waste Truck load
  },
  // Field Core chain, step 3. The Leach Plant's 0.4 oxide/s keeps its 0.33
  // covered; a Gas Holder or an Electrolyzer (72/s) and one Atmosphere
  // Collector (6/s) cover the gases with margin. 0.1 tape/s is 120 tape per
  // in-game day: one new core, or four recharges with room to spare.
  [T.SCMILL]: {
    label:       'Superconductor Mill',
    upkeep:      110.0,
    color:       '#120e16',
    glowColor:   '#c8b0f0',
    powerOutput: 0,
    powerInput:  250,
    throughput:  0,
    cost:        1150000,
    income:      0,
    width:       12,
    height:      10,
    oxidePerSec:    0.33,  // rare earth oxide drawn per second
    hydrogenPerSec: 30,    // hydrogen gas: the reducing atmosphere the tape is grown in
    nitrogenPerSec: 5,     // nitrogen gas: liquefied for the 77 K test bath
    tapePerSec:     0.1,   // HTS tape produced per second
    tapeCapacity:   300,
  },
  // Field Core chain, step 4. powerInput is the charging draw (the peak);
  // idleKW is what it draws the rest of the time (_activePowerInput).
  [T.COREWORKS]: {
    label:       'Core Works',
    upkeep:      147.0,
    color:       '#0e1018',
    glowColor:   '#9fd8ff',
    powerOutput: 0,
    powerInput:  800,
    idleKW:      100,
    throughput:  0,
    cost:        1500000,
    income:      0,
    width:       12,
    height:      10,
    bays:             4,
    coreTape:         120,   // tape wound into a new core
    rechargeTape:     28,    // tape to rewind a spent core's worn windings (double after a quench). 28 lets 4 mills keep 4 reactors' 12 cores charged
    chargeHours:      4,     // in-game hours to charge one core: 6 a day, so 3 works keep 12 cores charged
    tapeCapacity:     300,
    tapeIntakePerSec: 0.5,   // how fast it draws tape off its belt
  },
  [T.LITHIUMPROCESSPLANT]: {
    label:       'Lithium Processing Plant',
    upkeep:      48.0,  // was 36
    color:       '#10141c',
    glowColor:   '#c0a0ff',
    powerOutput: 0,
    powerInput:  85,
    throughput:  0,
    cost:        480000,
    income:      0,
    width:       20,
    height:      18,
    orePerSec:      15.0,  // lithium ore consumed per second (matches Lithium Mine's 15/s output)
    waterPerSec:    5,     // water drawn per second from the pipe run's supply while processing: a fifth of a
                           // Water Extractor's 25/s (was 0.6, and only a connection check, not a draw)
    compoundPerSec: 2.4,   // lithium compound produced per second (was 12) — well over a Tritium Breeder's
                             // 1/s intake, so one plant feeds two breeders
    compoundCapacity: 1200, // max compound output buffer: 500s of the plant's own output
    compoundResumeFrac: 0.5, // once full it stays off until the buffer is down to this share (see
                             // LithiumProcessPlantSystem.outputFull)
  },
  [T.NUCLEARREACTOR]: {
    label:       'Nuclear Reactor',
    upkeep:      75.0,  // was 70 (120 before that); raised on request
    color:       '#0a0e08',
    glowColor:   '#60ff80',
    powerOutput: 0,        // no longer feeds the grid directly — see T.STEAMTURBINE
    powerInput:  0,
    throughput:  0,
    cost:        500000,   // was 450k (580k before that)
    income:      0,
    width:       17,
    height:      17,
    steamOutput:   300,     // max steam/thermal output, consumed by a connected Steam Turbine
    rodPerSec:     0.05,    // fuel rods consumed per second
    coolWaterPerSec: 20,    // cooled water drawn at COOL IN from a tower's COOL OUT
                            // (COOLINGTOWER.coldOutput). Once-through, not a closed
                            // loop — the reactor has no hot-return port, so the water
                            // the tower pulls off the network ends at the reactor.
    // Spent fuel is a real belt-carried quantity, not a percentage: it
    // accumulates in _spentFuel up to spentFuelCapacity, and the reactor
    // stops when the cask store is full. The capacity is 100 because a
    // truck's cargoCapacity is 100 — one full reactor is exactly one
    // truckload, which is the balance the old 0-100 _nuclearWastePct had.
    spentFuelPerSec:   0.03,  // nominal belt throughput out of SPENT FUEL OUT
    spentFuelCapacity: 100,   // max spent fuel cask store
    rodCapacity:   50,      // max rod input buffer
    spentFuelPerDay: 6,     // in-game days to fill the cask store at full power
    // Meltdown (NuclearSystem core heat → MeltdownSystem → a nuclear blast,
    // LightningDamageSystem.detonateNuclear). Running with no cooling heats
    // the core from cold to critical in heatRiseSeconds; at critical the
    // meltdownSeconds clock runs, and at zero it goes up.
    heatRiseSeconds: 60,
    meltdownSeconds: 30,
    // Steam with nowhere to go: a running reactor with NO turbine drawing
    // its steam builds pressure from 0 to 100% in pressureRiseSeconds, then
    // the same meltdownSeconds clock runs. One turbine drawing, or cutting its fuel rods,
    // vents it again at pressureVentSeconds per 100%.
    pressureRiseSeconds: 90,
    pressureVentSeconds: 30,
  },
  [T.STEAMTURBINE]: {
    label:       'Steam Turbine',
    upkeep:      30.0,  // was 50
    color:       '#12181c',
    glowColor:   '#40e0ff',
    powerOutput: 300,
    powerInput:  0,
    throughput:  0,
    cost:        65000,   // was 175k — a turbine hall is ~25% of a real plant, so the reactor side carries the cost now
    income:      0,
    width:       14,
    height:      10,
    blastRadius: 5,     // chain-explodes if caught close to another generator going up
    steamDraw:   100,   // steam units drawn from a connected reactor's shared budget — 3 turbines fully use one reactor's 300
  },
  [T.STEAMTURBINE2]: {
    // High-pressure tandem-compound set: HP, IP and three LP casings on one
    // shaft, with moisture-separator reheaters and a water-cooled generator.
    // Same 3 kW per unit of steam as the MK1, four times the size, so a D-T
    // Fusion Reactor's 2000 steam runs 5 of these instead of 20 MK1s, and an
    // Advanced Reactor's 1200 runs 3. Cheaper at scale: four MK1s are $260k
    // and $120/s for the same 1.2 MW, in ~40% more ground.
    label:       'Steam Turbine MK2',
    upkeep:      60.0,
    color:       '#0c161c',
    glowColor:   '#7af5ff',
    powerOutput: 1200,
    powerInput:  0,
    throughput:  0,
    cost:        230000,
    income:      0,
    width:       24,
    height:      14,
    blastRadius: 7,
    steamDraw:   400,   // all-or-nothing, like the MK1: needs 400 spare on a reactor's budget to run
  },
  [T.SPENTFUELPOOL]: {
    label:       'Spent Fuel Pool',
    upkeep:      25.0,
    color:       '#0a1620',
    glowColor:   '#6ec8ff',
    powerOutput: 0,
    powerInput:  50,
    throughput:  0,
    cost:        150000,
    income:      0,
    // A real pool is a deep rectangular basin with a full-span refuelling
    // bridge running the long way, a cask loading bay at one end and a
    // walkway all the way round. At 4x4 none of that fit and the racks
    // were a few pixels each. Sized as a wide building so the bridge has a
    // run to travel and the rack grid reads at normal zoom -- still far
    // smaller than the Reprocessing Plant (16x13) it feeds. Grown from 9x7 to
    // 12x8 so the pool cooling plant and the cask hall stand on the deck
    // beside the basin; pools saved at 9x7 keep their size (their stubs
    // follow e.width/height, so belts already laid stay connected).
    width:       12,
    height:      8,
    // Bulk, cheap and passive-by-design: four full reactors' cask stores.
    // Its job is to pull spent fuel off reactors far faster than they make
    // it (a reactor whose store fills STOPS GENERATING), hold it while it
    // cools, and hand it on. Stock already in the pool is safe with the
    // power off — only the circulation, and therefore the cooling clock,
    // stops. See SpentFuelPoolSystem.
    spentFuelCapacity: 400,
    intakeRate:        0.5,   // units/s off the reactor belt — ~30x one reactor's output
    outRate:           0.5,   // units/s it can discharge to a consumer
    // Freshly discharged fuel is far too hot and too radioactive to handle,
    // and has to sit under water first. Real pools do this for years; this
    // is the gameplay-scaled stand-in, stated plainly in the panel and the
    // compendium rather than implied.
    coolSeconds:       240,
  },
  [T.REPROCESSOR]: {
    label:       'Reprocessing Plant',
    upkeep:      80.0,
    color:       '#0d0a12',
    glowColor:   '#b070ff',
    powerOutput: 0,
    powerInput:  120,
    throughput:  0,
    cost:        650000,
    income:      0,
    width:       16,
    height:      13,
    // ── Throughput ──────────────────────────────────────────────────
    // A reactor at full power accrues 100 / (6 in-game days) × WASTE_RATE_MULT
    // = 0.0174 spent fuel/s, and an in-game day is 1200 real seconds. So this
    // plant running flat out keeps up with about THREE reactors. That ratio is
    // the whole shape of the MK4 tier: plutonium is a trickle off a large
    // fission build, not a second fuel supply you can stand up on its own.
    spentFuelPerSec: 0.05,   // spent fuel consumed per second at full rate
    waterPerSec:     0.5,    // reprocessing is wet chemistry — pipe connection only, not buffered
    // ── Yields (per unit of spent fuel) ─────────────────────────────
    // Deliberately do NOT sum to 1: reprocessing recovers material, it does
    // not create it, and the missing 15% is fission products that are simply
    // gone. Recovered uranium is the bulk product but only partially
    // substitutes for ore at the Fuel Processing Plant; plutonium is the
    // point of the tier; high-level waste is the bill.
    recoveredPerUnit:  0.6,
    plutoniumPerUnit:  0.15,
    hlwPerUnit:        0.1,
    recoveredCapacity: 200,  // max recovered-uranium output buffer
    plutoniumCapacity: 100,  // max plutonium output buffer
    // High-level waste leaves by TRUCK, not by belt — it is registered in
    // WASTE_CFG against the same Nuclear Waste Processing Facility the
    // reactors use, so reprocessing concentrates the waste problem into a
    // smaller, hotter stream rather than deleting it. Sized to 100 to match
    // a truck's cargoCapacity: one full plant is exactly one truckload.
    hlwCapacity:       100,
  },
  [T.MOXPLANT]: {
    label:       'Advanced Fuel Processing',
    upkeep:      92.0,  // was 80
    color:       '#120c08',
    glowColor:   '#ff9060',
    powerOutput: 0,
    powerInput:  140,
    throughput:  0,
    cost:        820000,
    income:      0,
    // 15x13, up from 11x9. A glovebox line is not one row of boxes: the
    // powder side, the press/sinter train and the rod bay are separate
    // criticality-safe zones with keep-clear spacing between them, which is
    // exactly what the extra tiles are drawn as.
    width:       15,
    height:      13,
    // ── Recipe ──────────────────────────────────────────────────────
    // MOX is Mixed OXide: plutonium dioxide blended into a uranium dioxide
    // matrix. Real fuel runs about 5–10% plutonium by mass, with the bulk
    // being depleted or reprocessed uranium — so 10% here is the top of the
    // real range rather than a made-up ratio, and the uranium side accepts
    // recovered uranium and mined ore interchangeably for the same reason
    // (both are the fertile matrix; neither needs enriching).
    //
    // Dry powder metallurgy, deliberately: no water pipe. The wet chemistry
    // is upstream at the Reprocessing Plant, and keeping this plant dry is
    // what makes the two read as different halves of the same tier.
    moxPerSec:        0.06,   // MOX rods produced per second at full rate
    plutoniumPerUnit: 0.1,    // plutonium consumed per rod
    uraniumPerUnit:   0.9,    // uranium (recovered or mined) consumed per rod
    // One Reprocessing Plant running flat out makes 0.05 × 0.15 = 0.0075
    // plutonium/s; this plant flat out wants 0.006/s, so a single reprocessor
    // feeds a single fabricator with ~25% headroom. The uranium side needs
    // 0.054/s against the reprocessor's 0.03/s of recovered — the balance is
    // meant to come off an ore belt, which is why the intake takes either.
    moxCapacity:      300,    // max MOX rod output buffer
  },
  [T.ADVREACTOR]: {
    label:       'Advanced Nuclear Reactor',
    upkeep:      95.0,
    color:       '#080f0e',
    glowColor:   '#40ffd0',
    powerOutput: 0,        // steam, not watts — feeds Steam Turbines like the MK1
    powerInput:  0,
    throughput:  0,
    cost:        1000000,
    income:      0,
    // 21x21 against the MK1's 17x17: a MOX fast-plant is a bigger site than
    // a uranium one -- three intermediate heat-transfer loops instead of one
    // steam hall, a fuel magazine that has to be kept sub-critical by
    // spacing, and a dry cask farm on the product side. The extra four tiles
    // each way are what those pieces stand on.
    width:       21,
    height:      21,
    // 12 Steam Turbines' worth, against the base reactor's 3. Sized so the
    // whole MOX chain behind it (Reprocessing + MOX plants, a Cryogenic tower
    // and the MK1s feeding it — ~445 kW of its own draw and ~$300/s upkeep)
    // still beats a plain uranium reactor on net watts per $ of upkeep
    // (~4.8 vs ~4.3). At 400 it made LESS net power than an MK1 setup.
    steamOutput:   1200,
    rodPerSec:     0.05,    // MOX rods consumed per second
    // Less spent fuel per unit energy than the uranium reactor — the whole
    // point of burning plutonium is that it consumes material the fission
    // chain already made. Four times the steam on the same burn rate, and a
    // cask store that takes half again as long to fill.
    //
    // spentFuelPerDay is DAYS TO FILL, so a LARGER number is cleaner:
    //   MK1: (100/6) per day for 300 steam = 0.0556 waste per day per steam
    //   Adv: (100/9) per day for 1200 steam = 0.0093 — a sixth.
    // Getting this backwards (4, i.e. filling faster) made the endgame
    // reactor dirtier than the one it replaces.
    spentFuelPerSec:   0.02,
    spentFuelCapacity: 100,
    spentFuelPerDay:   9,   // in-game days to fill the cask store at full power (MK1: 6, for less steam)
    rodCapacity:   50,
    // ── Why it is less forgiving ────────────────────────────────────
    // A MOX core has a harder neutron spectrum and a smaller delayed-neutron
    // fraction than a uranium one, which in a real plant means less margin
    // between a control action and the core's response. Here that reads as:
    // heat climbs in 35s rather than 60, and cooling demands Cryogenic
    // Coolant from a Cryogenic Cooling Tower — ordinary cooled water from
    // MK1 towers will not cool a MOX core.
    heatRiseSeconds: 35,
    // 90s against the MK1's 30. Reaching zero ends the run
    // (ApocalypseSystem), so the player gets three times the warning — an
    // ordinary emergency card for the first minute, then the music slams in
    // with 48s left (ApocalypseSystem.DETONATE_AT) and the full-screen
    // countdown takes the last 30. Must stay longer than DETONATE_AT, or
    // the song would have to start before the core went critical.
    meltdownSeconds: 90,
    // 44 u/s of Cryogenic Coolant at CRYO IN — one Cryogenic Cooling Tower
    // (coldOutput 48) covers it with headroom. Deliberately not a round
    // multiple of the cryo's 48: a single tripped pump still has margin
    // before the shortfall, rather than an exact tie that trips into a
    // meltdown. Field name is shared with the MK1 reactor; the fluid is
    // cryocool, not cool (see NuclearSystem.resolveCooling).
    coolWaterPerSec: 44,
    pressureRiseSeconds: 70,
    pressureVentSeconds: 30,
    blastRadius: 6,
    // Graphite reflector blocks, belted into GRAPHITE IN (optional). A ring of
    // graphite round the core bounces escaping neutrons back in, so the same
    // MOX burn raises 20% more steam. The blocks swell and crack under the
    // flux and are swapped out as they wear: 0.1/s while generating.
    graphitePerSec:   0.1,
    graphiteCapacity: 40,
    graphiteBoost:    1.2,
  },
  [T.DRONEPORT]: {
    label:       'Drone Port',
    upkeep:      60.0,
    color:       '#0a1016',
    glowColor:   '#5ad8ff',
    powerOutput: 0,
    // Base draw: control tower, pad lights, uplink. On top of it, every drone
    // charging on its pad adds up to `chargeDraw` (easing off as it tops up)
    // and every drone aloft a small `flightDraw` for telemetry — drones fly
    // on their own batteries, so the grid pays when they come home. A fleet
    // sitting charged costs 40 kW; ten drones landing empty at once costs
    // 40 + 10x30 = 340 kW, and that lands right after a big repair push, when
    // the grid is least able to take it (DroneSystem.applyDraw).
    powerInput:  40,
    throughput:  0,
    cost:        300000,
    income:      0,
    // A vertiport, not a helipad. Ten aircraft need ten marked touchdown
    // pads with real separation between them, a control tower, a charging
    // gantry and room to taxi -- at 4x4 the whole fleet was notionally
    // stacked on about a tile and a half of deck. Sized between the Coal
    // Waste Facility (8x7) and the Nuclear Waste Facility (13x11): a fleet
    // base for ten aircraft, not a shed.
    width:       9,
    height:      9,
    drones:      10,     // fleet size per port
    chargeDraw:  30,     // W per drone charging on its pad, before the top-up taper
    flightDraw:  3,      // W per drone aloft (telemetry uplink only)
    // Coverage, measured from the port's footprint edge. A job outside every
    // port's radius is simply not a drone job — that boundary is what keeps
    // trucks the long-haul answer and drones the local one.
    // Half-width of the coverage SQUARE, from the port's centre (220x220
    // tiles; was 137.5 / 275x275, cut 20%). The square IS the battery limit:
    // `battery` below is sized so the worst trip that fits inside it can be
    // flown, so anything the player can see is covered is reachable. Keep
    // the two in step if either changes. Across a network of several ports, battery is
    // what bounds how far one port's drones reach -- the nearest port with a
    // free drone takes the job (see nearerPortFree in drone_system.js).
    radius:      110,
    // Flight. Trucks cruise at 352 px/s on patrol and have to follow roads;
    // drones fly straight lines at more than twice that, which is most of
    // what makes them worth the price.
    speed:       825,    // px/s, cruise (was 620; +33%)
    // Acceleration limits. A multirotor has mass: it leans into a move and
    // has to shed that speed again before it can stop, so it eases up to
    // cruise and eases back down into its target rather than snapping
    // between full speed and stationary.
    accel:       1040,   // px/s^2 -- about 0.8s from rest to cruise (scaled with speed; was 780)
    decel:       825,    // px/s^2 -- braking is gentler than the shove (scaled with speed; was 620)
    turnRate:    4.5,    // rad/s, how fast it can swing onto a new heading
    // Battery, in seconds of flight at cruise. On a trip across a network a
    // drone stops at the ports it passes and hovers beside each to charge,
    // so the battery bounds each hop between ports, not the whole trip; a
    // drone running low makes for the nearest port — see needsCharge().
    //
    // 66s covers the longest job one port's square can hold, in ordinary
    // weather: port to one corner, across to the opposite corner, and home
    // is 622 tiles (40s at cruise); add launch, landing and two 4s shielded
    // load stops and the 25% reserve canMakeRoundTrip keeps, and it comes to
    // 64.5s. At 45s a two-stop run from one edge of the square to the other
    // (a mine on the west side, storage on the east) was refused with
    // nothing on screen to say why. Heat waves and cold snaps still shave
    // it (drone_system.js WEATHER_FLEET), so the far corners can drop out
    // of reach while one lasts.
    battery:     66,
    rechargeSecs: 12,    // time from empty to full, on the pad or hovering at a port en route
    // -- Waste runs --
    // A drone is not a truck and the payload says so: 20 units against a
    // truck cargoCapacity of 100. Shielded streams carry a third of that,
    // because a spent-fuel cask is mostly shielding -- that is the whole
    // reason the real thing weighs a hundred tons and moves by road.
    wastePayload:     20,   // units per sortie, ash and sludge (was 12, +66%)
    wastePayloadHot:  7,    // units per sortie, spent fuel and HLW (was 4, +66%)
    wasteLoadSecs:    2.5,  // seconds on station to load or unload
    wasteLoadSecsHot: 4,    // slower: the cask has to be latched and checked
    // Extra draw while carrying a shielded load home. Lifting the cask costs
    // more than lifting a camera, and it lands on the grid the reactor feeds.
    hotFlightDraw:    12,
    // -- Line servicing --
    // Thermal imaging, corona inspection and live-line insulator washing.
    // Real utility drones do all three; what none of them can do is re-string
    // a conductor, so this lowers the odds of a fault on a loaded line and
    // does nothing whatsoever for a line that is simply over its rating.
    // A repair drone stays on the building until it is fixed, and the
    // repair runs this much faster while it is there (0.6 = 60% quicker).
    repairBoost:         0.6,
    wireServiceSecs:     3,    // seconds on station for a sweep
    wireServiceRadius:   6,    // tiles of line covered per sweep
    wireServiceDuration: 120,  // sim-seconds the sweep keeps protecting that span
    // -- Cargo runs --
    // Producer -> storage vessel flagged for drone supply (see the cargo
    // section of drone_system.js). Sized so a port's cargo wing out-hauls the
    // same money spent on Haulers anywhere inside coverage (about 23 units/s
    // against 16 over 50 tiles, worked out before solids and liquids doubled):
    // drones are the better carrier where they reach, and the Hauler is the
    // cheap way in and the answer beyond it.
    cargoPayloadSolid:  133,  // units of ore / coal / rods per sortie (was 80, +66%)
    cargoPayloadLiquid: 166,  // units of crude / water / acid / fuel oil (was 100, +66%)
    cargoPayloadGas:    415,  // units of process gas (was 250, +66%)
    cargoLoadSecs:      2,    // seconds on station to load or unload
    cargoMaxConcurrent: 8,    // per port -- several may share one source; the other two stay free for repairs
  },
  // The cheap way to stretch a drone network. No fleet of its own: it adds a
  // coverage square to any network it touches, and drones crossing that
  // network set down on its pads to recharge (DroneSystem, "charging ports").
  // Sized off the Drone Port: half the pads (5 against 10) on a 5×5 pad
  // against 9×9, and a coverage square scaled by the same 5/9, so 61 tiles
  // out from the centre against 110 (122×122 against 220×220). A quarter of
  // the price and a fifth of the upkeep, because a network still needs real
  // ports to have any drones in it at all.
  [T.DRONECHARGER]: {
    label:       'Drone Charging Port',
    upkeep:      15.0,
    color:       '#0a1016',
    glowColor:   '#7df0a4',
    powerOutput: 0,
    // Base draw for the mast and pad lights. Each drone charging on a pad
    // adds the Drone Port's chargeDraw (30 kW, tapering), so all five pads
    // busy is 10 + 5x30 = 160 kW (DroneSystem.tickCharger).
    powerInput:  10,
    throughput:  0,
    cost:        90000,
    income:      0,
    width:       5,
    height:      5,
    pads:        5,
    radius:      61,
  },
  [T.MK4RESEARCH]: {
    label:       'MK4 Research Station',
    upkeep:      50.0,
    color:       '#160424',
    glowColor:   '#ff60d0',
    powerOutput: 0,
    powerInput:  50,
    throughput:  0,
    cost:        100000,
    income:      0,
    width:       4,
    height:      4,
    researchRate: 10,
  },
  [T.MK5RESEARCH]: {
    label:       'MK5 Research Station',
    upkeep:      90.0,
    color:       '#1c0e02',
    glowColor:   '#ffb43c',
    powerOutput: 0,
    powerInput:  90,
    throughput:  0,
    cost:        315000,
    income:      0,
    width:       5,
    height:      5,
    researchRate: 14,
  },
  [T.ELECTROLYZER]: {
    label:       'Electrolyzer',
    upkeep:      45.0,  // was 30
    color:       '#041824',
    glowColor:   '#40c0ff',
    powerOutput: 0,
    powerInput:  55,
    throughput:  0,
    cost:        320000,  // was 170000
    income:      0,
    width:       8,
    height:      22,
    waterPerSec:      1.2,
    hydrogenPerSec:   72,   // 20% above the Haber-Bosch Complex's 60/s intake — it draws all-or-nothing,
                            // so an exact tie left no margin against drift (same reasoning as the Wash Tower)
    hydrogenCapacity: 3000,
  },
  [T.GASSTORAGE]: {
    label:       'Gas Holder',
    upkeep:      8.0,
    color:       '#10161c',
    glowColor:   '#80d8ff',
    powerOutput: 0,
    powerInput:  0,     // passive pressure vessel — needs no power (see GasStorageSystem.online)
    throughput:  0,
    cost:        75000,
    income:      0,
    width:       8,
    height:      8,
    gasCapacity: 5000,  // one gas at a time — hydrogen, nitrogen, ammonia, deuterium or tritium
    inRate:      150,   // max units/s it pulls from producers' surplus
    outRate:     150,   // pipe flow shown on its GAS OUT line
  },
  [T.ATMOSCOLLECTOR]: {
    label:       'Atmosphere Collector',
    upkeep:      30.0,  // was 15
    color:       '#0a1418',
    glowColor:   '#a0e0ff',
    powerOutput: 0,
    powerInput:  30,
    throughput:  0,
    cost:        200000,  // was 115000
    income:      0,
    width:       14,
    height:      14,
    nitrogenPerSec:   6,    // nitrogen gas extracted from air per second (was 24) — well under the
                            // Haber-Bosch Complex's 20/s intake, so one complex needs ~4 collectors
    nitrogenCapacity: 3000, // max nitrogen output buffer
  },
  [T.HABERBOSCH]: {
    label:       'Haber-Bosch Complex',
    upkeep:      52.0,  // was 28
    color:       '#0c1c10',
    glowColor:   '#40e070',
    powerOutput: 0,
    powerInput:  65,
    throughput:  0,
    cost:        650000,
    income:      0,
    width:       22,
    height:      20,
    nitrogenPerSec: 20,   // nitrogen gas consumed per second
    hydrogenPerSec: 60,   // hydrogen gas consumed per second
    ammoniaPerSec:  40,   // ammonia gas produced per second
    ammoniaCapacity: 3000, // max ammonia output buffer
  },
  [T.WASHTOWER]: {
    label:       'Isotopic Wash Tower',
    upkeep:      58.0,  // was 33
    color:       '#081820',
    glowColor:   '#ff6eb4',
    powerOutput: 0,
    powerInput:  75,
    throughput:  0,
    cost:        425000,   // was 375k (300k, 385k before that)
    income:      0,
    width:       20,
    height:      20,
    waterPerSec:      2,    // shown as the tower's water intake / pipe flow. Like the other fusion-chain
                            // plants it only needs a connected water pipe — it doesn't draw down extractor
                            // supply. Was 100, which read as 4× a Water Extractor's whole 25/s output.
    deuteriumPerSec:  2.1,  // deuterium gas produced per second (was 1.51, 1.34, and 6 before that) — well under a Fusion Fuel Plant's 5/s
                             // intake at full speed, though the plant is tritium-limited far below that.
                             // Was 1.33: three towers then made 3.99/s against a Fusion Reactor's 4/s, so
                             // it raised 1995 steam and the fifth MK2 turbine (400, all-or-nothing) sat idle.
                             // 1.51: eight towers make 12.08/s, a hair over the 12/s three reactors burn at
                             // full power (it took nine at 1.34). One reactor still wants three (4.53/s).
                             // 2.1: that sizing left out Field Cores, which burn up to 1.7x. Three Fusion
                             // Reactors (2+2+3 cores) and the Advanced one (3 cores) draw 3.09 pellets/s,
                             // 18.2 deuterium/s; nine towers make 18.9/s.
    deuteriumCapacity: 1000, // max deuterium output buffer: ~660s of the tower's own output
  },
  [T.FUSIONFUELPLANT]: {
    label:       'Fusion Fuel Plant',
    upkeep:      110.0,  // was 62
    color:       '#04141c',
    glowColor:   '#70f0ff',
    powerOutput: 0,
    powerInput:  100,
    throughput:  0,
    cost:        1250000,   // was 900k (720k, 480k before that) — unlocks after the Tritium Breeding Facility ($800k)
    income:      0,
    width:       24,
    height:      22,
    // Freezes fuel into pellets for the reactor's pellet injector. Two fuels
    // (FusionFuelPlantSystem, toggled from its panel):
    //   D-T   — deuterium + tritium (tritium bred in the reactor's lithium blanket)
    //   D-He3 — deuterium + helium-3 (from a Helium-3 Separator)
    // The "plasma" field names are the pellets — kept so saves stay compatible.
    deuteriumPerSec: 5,    // deuterium gas consumed per second (both fuels)
    tritiumPerSec:   5,    // tritium consumed per second at full D-T rate (8 per pellet)
    he3PerSec:       1,    // helium-3 consumed per second in D-He3 mode (gameplay-scaled)
    // Pellets are made slowly and carry a lot: the rate was 2.5/s, cut 75% with every pellet count in
    // the chain scaled to match (reactor burn, buffers, unlock goals, Hyperion, contract stock). The
    // input rates above are unchanged, so each pellet holds 4x the fuel it did and the power balance
    // is the same; only the counts changed.
    plasmaPerSec:    0.85,  // fuel pellets produced per second, both lines together. Was 0.625: two
                             // plants then made 1.25/s against three Fusion Reactors' 1.5/s, and two
                             // plants' D-He3 share 0.31/s against the Advanced Fusion Reactor's 0.4/s.
                             // The inputs per second above are unchanged, so each pellet now takes less
                             // of them (5.9 deuterium, not 8): three reactors and the Advanced one at full
                             // burn draw 11.2 deuterium/s, inside eight Wash Towers' 12.08/s.
    plasmaCapacity:  15,   // max D-T pellet output buffer (was 100). Kept small so a plant settles to
                           // making what its reactors burn within seconds: filling 100 ran every plant on
                           // the belt flat out for minutes, past what the Wash Towers make, and the
                           // deuterium the D-He3 line needs went with it. A reactor's core is the buffer.
    he3PelletShare:  0.35, // the split: D-He3 takes up to this share of the pellet rate, ahead of D-T unless a
                           // reactor the plant feeds is short (FusionFuelPlantSystem).
                           // Was 0.25 (0.21/s a plant): with three cores the Advanced Fusion Reactor burns
                           // 0.68/s, and the two or three plants D-T leaves free made only ~0.57/s of it.
    he3PelletCapacity: 50,  // max D-He3 pellet output buffer (D-He3 OUT)
    tritiumCapacity: 400,  // tritium held on site (piped in from a reactor or a Tritium Breeding Facility)
    he3Capacity:     300,  // helium-3 held on site
  },
  [T.HULKINGFUSIONREACTOR]: {
    label:       'Fusion Reactor',
    upkeep:      300.0,  // was 80 (and 125 before that); raised on request
    color:       '#0a0e18',
    glowColor:   '#40c0ff',
    powerOutput: 0,
    powerInput:  90,       // steady-state magnet draw (was 150 — the other 60 kW moved to the Cryo Plant,
                           // which is where a real tokamak's standing load actually goes)
    startupSurge: 5000,    // 5 MW grid surge required to fire up the magnets — paid again after every quench
    startupSurgeSeconds: 5, // how long the surge must be held — long enough that batteries or spare generation matter
    startupRetrySeconds: 20, // back-off after the grid fails to carry the surge (a shortfall blacks out the whole network)
    // ── Superconducting magnets (HulkingFusionReactorSystem) ──
    heliumChargeCap:  400,  // liquid helium the magnet cryostat holds when full
    heliumFillPerSec: 20,   // how fast it tops up from a connected Cryo Plant's buffer
    heliumBoilOff:    1.0,  // lost per second while the magnets are energised
    heliumAshPerSec:  0.4,  // Helium-4 fusion ash produced per second at full burn, piped out via HE ASH OUT
    heliumAshCapacity: 200,
    quenchVentFrac:   0.6,  // share of the helium charge blown out of the quench vent
    throughput:  0,
    cost:        2600000,   // was 2.07M (1.38M before fusion equipment +50%), then fusion tier x1.25; reactor + 20 turbines ~$3.9M
    income:      0,
    width:       30,
    height:      30,
    plasmaPerSec:   0.5,   // fuel pellets injected per second at full burn (was 2; pellets carry 4x since the cut)
    plasmaCapacity: 25,    // max fuel pellet input buffer
    pelletCoreCapacity: 300, // pellets the core holds and burns from: 10 min at full burn, like a fission core's rods
    coreLoadPerSec:     5,   // pellets/s it can pull off the PLASMA IN belt into the core
    // ── D-T burn (HulkingFusionReactorSystem) ──
    // ~80% of D-T energy leaves in neutrons, caught as heat by the lithium
    // breeding blanket and raised as steam for Steam Turbines — and the same
    // neutrons turn the blanket's lithium into the tritium the fuel needs.
    steamOutput:     2000, // steam at full burn — twenty Steam Turbines' worth (each draws 100 for 300 kW → 6 MW).
                           // Was 1200 (3.6 MW, the Advanced Reactor's hall), but a D-T plant's own chain
                           // draws ~1.15–1.3 MW at full burn (3 Wash Towers, 4 lithium mines and processing
                           // plants for the blanket, Fuel Plant, Cryo Plant, Helium Well), so it netted
                           // ~2.4 MW against plutonium's ~3.15 MW: a downgrade. At 2000 it nets ~4.7 MW,
                           // ~1.5× plutonium, and the twelve plutonium turbines still carry over.
                           // D-He3 through the MHD Rings (a reactor's 2400/s feeds two: 8 MW gross, ~7.3 MW
                           // net with no blanket or breeder) stays ~1.5× above this, as the end of the ladder.
    blanketPerSec:   0.7,  // Lithium Compound the breeding blanket consumes at full burn (was 2, 4, and 10 before that):
                           // one Processing Plant (2.4/s) now covers three reactors (2.1/s). At 2 it took a plant per
                           // reactor, and a plant short starved every blanket on the belt, so the reactors bred a
                           // third of the tritium the Fuel Plants burn. A real blanket spends one Li-6 atom per
                           // tritium, so it should breed far better than the accelerator's 1:1 — 6.3 here.
    tritiumBredPerSec: 4.4, // tritium bred at full burn with a full blanket — burning 0.5 pellets/s (5.9 tritium
                            // each since the Fuel Plant's 0.85/s) uses 2.9/s, a breeding ratio of 1.5
    tritiumCapacity: 500,  // bred tritium held for the Fuel Plant, piped out via TRITIUM OUT
    // ── D-He3 burn ──
    // Aneutronic: its energy leaves as charged particles, which the MHD Ring
    // can turn straight into electricity — no steam, no blanket.
    highBetaPerSec:   2400, // ion stream produced per second (20% above two MHD Rings' 2×1000/s draw — same
                             // margin-above-consumer reasoning as the other exact-tie links in this chain)
    highBetaCapacity: 60000, // max High-Beta Plasma output buffer — sized for ~30s of two MHD Rings' draw,
                             // matching the margin every other link in this chain carries (deuterium
                             // buffer holds ~200s of consumption, compound ~30s, plasma ~200s). At 1000
                             // this held exactly 1s, which a single fast-forward tick (dt up to 2s at 20x)
                             // could fully drain or exceed in one shot, capping/zeroing MHD Ring output
                             // every tick at high game speed even though the reactor was producing normally.
  },
  [T.ADVFUSIONREACTOR]: {
    // The D-He3 machine: a stellarator, the late-game step up from the
    // Fusion Reactor's tokamak. D-He3 needs a far hotter plasma held far
    // longer, and a stellarator's twisted coils hold it steady without the
    // plasma current a tokamak has to drive. Aneutronic, so no blanket and no
    // steam: its energy leaves as an ion stream for MHD Rings.
    // First-pass figures (AdvancedFusionReactorSystem): still to be balanced
    // against the endgame alongside the D-He3 pellet split.
    label:       'Advanced Fusion Reactor',
    upkeep:      650.0,  // was 260; raised on request
    color:       '#0c0816',
    glowColor:   '#c890ff',
    powerOutput: 0,
    powerInput:  160,      // magnets, gyrotrons and pumps at steady state
    startupSurge: 12000,   // 12 MW to energise the coil set — paid again after every quench
    startupSurgeSeconds: 6,
    startupRetrySeconds: 25,
    // Cooling is the price of the step up. D-He3 wants far stronger fields,
    // so the magnets boil off liquid helium 6× as fast as the Fusion
    // Reactor's 1/s: two Cryo Plants (3/s each) only just keep up, so build
    // three, with the wells behind them. The ash (0.8/s) recycles some back.
    heliumChargeCap:  2400,
    heliumFillPerSec: 60,
    heliumBoilOff:    6.0,
    heliumAshPerSec:  0.8,
    heliumAshCapacity: 400,
    // Quench — far worse than the Fusion Reactor's (AdvancedFusionReactorSystem).
    magnetWarmRate:      0.2,     // K/s without cooling: ~22s from 4.5 K to a quench (Fusion Reactor: 0.1, ~45s)
    quenchVentFrac:      0.9,     // share of the helium charge blown out (Fusion Reactor: 0.6)
    quenchSpikeK:        150,     // where a quench leaves the magnets (Fusion Reactor: 90)
    quenchArcRadius:     8,       // tiles from the reactor's edge the coil-lead discharge reaches
    quenchRepairSeconds: 180,     // coils locked out of cooling while they're repaired
    quenchRepairCost:    350000,  // charged on the spot, even into debt
    // And the waste heat: the direct converters turn ~60% of the ion
    // stream into power; the rest leaves as heat on the CRYO IN loop.
    // Cryogenic Coolant (cryocool), 90/s = two Cryogenic Cooling Towers
    // (48/s each), each running on ~5 ordinary towers' cool water. Short
    // of coolant, the converters will derate rather than trip outright.
    coolantPerSec:    90,
    coolWaterPerSec:  90,     // the same figure under the name NuclearSystem.resolveCooling allocates by
    uncooledOutputFrac: 0.3,  // ion stream output with the coolant short: the converters derate, they don't trip
    throughput:  0,
    cost:        6000000,   // was 4.8M; the fusion tier's other buildings were scaled x1.25 with it
    income:      0,
    width:       48,
    height:      48,
    plasmaPerSec:     0.4,    // D-He3 pellets injected per second at full burn (was 0.5): three Fusion Fuel Plants'
                              // D-He3 lines (0.156/s each, 0.469/s together) run one flat out with ~17% over
    plasmaCapacity:   50,
    highBetaPerSec:   4800,   // ion stream per second: four MHD Rings' worth (2 per ION OUT)
    highBetaCapacity: 120000,
  },
  [T.MHDRING]: {
    label:       'MHD Decelerator Ring',
    upkeep:      150.0,  // was 100
    color:       '#080c14',
    glowColor:   '#60d0ff',
    powerOutput: 4000,   // two rings per reactor (8 MW) beat a D-T reactor's 6 MW through turbines: direct conversion (~60%) beats a steam cycle (~35%)
    powerInput:  0,
    throughput:  0,
    cost:        750000,   // was 600k (400k after fusion equipment +50%; 1M before that), then fusion tier x1.25 — the ring is the D-He3 plant's conversion stage, the turbines' counterpart; D-He3 stays the cheapest power per watt
    income:      0,
    width:       38,
    height:      14,
    highBetaDraw: 1000,    // ion stream units drawn from a connected D-He3 reactor's buffer per second
  },
  [T.HE3SEPARATOR]: {
    label:       'Helium-3 Separator',
    upkeep:      40.0,  // was 35
    color:       '#100c1c',
    glowColor:   '#ffd0a0',
    powerOutput: 0,
    powerInput:  45,
    throughput:  0,
    cost:        900000,   // was 655k (525k, 350k before fusion equipment +50%) — fusion tier x1.25
    income:      0,
    width:       18,        // was 12 (and 8 before that); ones already built keep their size
    height:      18,
    // Cryogenic distillation of helium — real, and the only terrestrial
    // source of helium-3 besides tritium decay. Real helium carries ~1 part
    // per million helium-3, so these rates are scaled up for gameplay.
    heliumPerSec: 3,     // helium gas drawn from Helium Wells per second
    he3PerSec:    1.2,   // helium-3 produced per second (20% above the Fuel Plant's 1/s D-He3 intake)
    he3Capacity:  300,   // max helium-3 output buffer
  },
  [T.TRITIUMBREEDER]: {
    label:       'Tritium Breeding Facility',
    upkeep:      52.0,  // was 40
    color:       '#0a1410',
    glowColor:   '#80ffc0',
    powerOutput: 0,
    // An accelerator is a heavy, steady load — the largest in the fusion
    // chain (was 600 kW, which nearly doubled the chain's draw on its own
    // and left D-T netting well under plutonium). It drops to nothing
    // when the tritium buffer backs up (PowerNetwork._outputFull), which is
    // exactly what happens once a Fusion Reactor's blanket is feeding the
    // Fuel Plant instead.
    powerInput:  125,
    throughput:  0,
    cost:        800000,   // was 900k (790k, 630k, 420k before fusion equipment +50%, then fusion tier x1.25 for the $6M Advanced Fusion Reactor)
    income:      0,
    width:       38,    // was 26×12; breeders in older saves keep that size and its drawing
    height:      22,
    // A starter, not a supply: 1.0/s (was 0.3, and 1.2 before that) is about a
    // quarter of a reactor's full-burn appetite (4/s), so a new reactor starts
    // near 25% burn and its own blanket carries it the rest of the way.
    // Gameplay-scaled.
    compoundPerSec:  1,     // lithium compound drawn from the LITHIUM IN belt per second (was 4; cut with the output)
    tritiumPerSec:   1.0,   // tritium bred per second at full beam
    tritiumCapacity: 300,   // max tritium output buffer
  },
  [T.COOLINGTOWER]: {
    label:       'Cooling Tower',
    upkeep:      18.0,  // was 12
    color:       '#0c1418',
    glowColor:   '#60c0e0',
    powerOutput: 0,
    powerInput:  15,
    throughput:  0,
    cost:        90000,
    income:      0,
    width:       9,
    height:      10,
    coolingCapacity: 1.0,   // fraction of reactor output restored (1.0 = full 800 kW)
    // Water drawn at H₂O IN — 15, matching coldOutput below (the tower can
    // only discharge what it takes in). At 12 one Water Extractor (25 u/s)
    // ran two towers with 1 u/s spare; at 15 an extractor fully feeds ONE
    // tower with 10 spare, so a second tower needs a second extractor.
    // PowerNetwork hands water out by seniority, so on a short network the
    // tower left dry is whichever one was built last.
    waterPerSecond:  15,
    // Cooled water pushed out of COOL OUT, which uranium reactors draw
    // against at NUCLEARREACTOR.coolWaterPerSec (20) — one tower falls 5
    // short, so a reactor takes two towers on its COOL IN line (30, 10
    // spare), and two can't stretch to a second reactor. Also feeds Cryogenic Cooling Towers (70 u/s ≈ five
    // towers' worth). Must never
    // EXCEED waterPerSecond above: the tower cools the water it pulled off
    // the network, it does not create any. Equal is right here — the loop is
    // once-through (the reactor has no hot-return port), and once-through
    // cooling discharges what it draws rather than boiling any of it off, so
    // there is no evaporative loss to account for.
    coldOutput:      15,
    // A sudden loss of power can trip the circulation pumps: they stay down
    // after power returns until they have run pumpRestartSeconds of powered
    // time — and every reactor they cool overheats meanwhile. A flickering
    // grid is dangerous with nuclear on it. Cuts the weather causes don't
    // trip them (CoolingTowerSystem._weatherOutage).
    pumpTripChance:     0.4,
    pumpRestartSeconds: 45,
  },
  [T.COOLINGTOWER2]: {
    label:       'Cryogenic Cooling Tower',
    upkeep:      60.0,  // was 42
    color:       '#07121c',
    glowColor:   '#7af0ff',
    powerOutput: 0,
    // Six times the MK1's draw. A forced-draft chiller train is not a
    // chimney: the MK1 is a concrete shell that cools by letting air fall
    // through it, and costs 15 kW to run the pumps. This one runs the
    // refrigeration as well, and the bill is the point — the building that
    // saves you four tower plots spends the saving back on the grid.
    powerInput:  110,
    throughput:  0,
    cost:        450000,
    income:      0,
    // Bigger than anything else in the cooling chain, and meant to read that
    // way: 15×17 against the MK1's 9×10 is a little over 2.8× the area for
    // 4× the cooling, so it is still the tighter build per unit of coolant.
    // layoutHeight is the tile box the artwork was composed in (19 when the
    // shell was stretched +2); the bottom two of those rows were empty grass
    // under the striped base, so the live footprint is two shorter. Renderer
    // and getStubs pin shell/ports to layoutHeight so shrinking height moves
    // neither the drawing nor pipes already laid to the chiller houses.
    width:        15,
    height:       17,
    layoutHeight: 19,
    coolingCapacity: 1.0,
    // Doesn't draw raw water like the MK1 — it runs on cooled water off
    // another tower's COLD OUT (see NuclearSystem.resolveCooling, which
    // treats it as a cool-water consumer, the same as a uranium reactor).
    // 70 u/s wants several MK1s pooled (~5 × 15). Output is a different
    // fluid — Cryogenic Coolant (cryocool) at coldOutput — so the tower
    // cannot feed itself and ordinary cool will not cool an Advanced Reactor.
    coolWaterPerSec: 70,
    // Cryogenic Coolant pushed out of CRYO OUT. One Advanced Reactor draws
    // 44; 48 leaves headroom. Independent of coolWaterPerSec above: this is
    // a refrigeration step, not a 1:1 pass-through of the cool it drank.
    coldOutput:      48,
    // Half the MK1's trip chance and a faster restart. The chiller train runs
    // on variable-speed drives with a ride-through capacitor bank, which in
    // gameplay terms is what the player is buying along with the capacity —
    // not immunity, though: a MOX core uncooled goes critical in 35s, and 25s
    // of restart is still long enough to lose one.
    pumpTripChance:     0.2,
    pumpRestartSeconds: 25,
    // Marks it as the plutonium-tier tower for the info panel and hotbar.
    cryo: true,
  },
  [T.COALMINE2]: {
    label:       'Coal Mine MK2',
    upkeep:      14.0,   // was 5 — below the MK1's 8 for about 2.5x the coal
    color:       '#1a0e06',
    glowColor:   '#ff9040',
    powerOutput: 0,
    powerInput:  35,
    throughput:  0,
    cost:        45000,
    income:      0,
    width:       6,   // fixed 6×6 plant centred on its deposit — see _coalMineFootprint
    height:      6,
    burnRate:    0.05,
    mk2:         true,
  },
  [T.CONVEYOR]: {
    label:       'Conveyor Belt',
    upkeep:      0,
    color:       '#1a1208',
    glowColor:   '#c08030',
    powerOutput: 0,
    powerInput:  0,
    throughput:  0,
    cost:        150,
    income:      0,
  },
  [T.COALGENERATOR]: {
    label:       'Coal Power Generator',
    upkeep:      23.0,
    color:       '#100c08',
    glowColor:   '#ff4010',
    powerOutput: 100,  // was 80 — raised so coal out-runs Wind MK2 per watt
    powerInput:  0,
    throughput:  0,
    cost:        60000,
    income:      0,
    width:       5,
    height:      6,
    // Coal consumed per second at Normal throttle. Was 15 — cut 20x so the
    // "mine N tonnes" unlocks take 20x longer, then 0.75 — cut 25% so coal
    // burns slower for the same power. Mine output is fixed in coal/s
    // (CoalSystem MK1_COAL_PER_SEC), so mines dig and deposits drain at the
    // same speed and each mine now feeds a third more generators.
    coalPerSecond: 0.5625,
    waterPerSecond: 10,
    wasteCapacity: 150,  // caps _ashWaste buffer awaiting truck pickup
    // Firing model (CoalSystem.tickGenerator). Player picks a throttle from
    // the generator panel. `coal`/`ash` scale the burn and ash rates, and
    // `pressure` is the boiler pressure it settles toward — at 1.0 the boiler
    // goes critical (MeltdownSystem) and explodes if held there too long.
    throttleModes: {
      eco:       { label: 'ECO',       output: 0.6, coal: 0.45, ash: 0.45, pressure: 0.40, color: '#60d040' },
      normal:    { label: 'NORMAL',    output: 1.0, coal: 1.0,  ash: 1.0,  pressure: 0.65, color: '#ff8030' },
      overdrive: { label: 'OVERDRIVE', output: 1.5, coal: 2.0,  ash: 2.0,  pressure: 1.12, color: '#ff4020' },
    },
    meltdownSeconds: 25,   // seconds at 100% pressure before the boiler explodes
    blastRadius:     5,    // tiles, footprint edge out
  },
  // Coal's late-game outlet. One MK1 Coal Mine (~1.65 coal/s) keeps one
  // battery charged with a little to spare. Coke comes out at the real-world
  // ~0.75 yield; the oven gas it drives off is about half hydrogen, piped out
  // as a side stream a third the size of an Electrolyzer's and with no water.
  [T.COKEOVEN]: {
    label:       'Coke Oven Battery',
    upkeep:      40.0,
    color:       '#120c0a',
    glowColor:   '#ff7a2a',
    powerOutput: 0,
    powerInput:  90,
    throughput:  0,
    cost:        320000,
    income:      0,
    width:       14,
    height:      9,
    coalPerSec:        1.5,   // coal charged per second
    cokePerSec:        1.1,   // coke pushed per second
    hydrogenPerSec:    24,    // coke-oven gas (hydrogen) per second
    coalCapacity:      45,    // the coal bunker: 30 s of charging
    cokeCapacity:      300,
    cokeResumeFrac:    0.5,   // once full it stays off until the store is down to this share (CokeOvenSystem.outputFull)
    hydrogenCapacity:  1000,
  },
  // An Acheson furnace: coke packed round carbon electrodes and cooked at
  // ~3000 °C by brute electric current until it turns to graphite. The draw
  // is the point — 120 kW for a building that makes no power — and pays back
  // through the Advanced Reactors it feeds (graphiteBoost there). One Coke
  // Oven's 1.1 coke/s keeps nearly two of these going; one of these keeps
  // three Advanced Reactors moderated (0.1 graphite/s each).
  [T.GRAPHITEFURNACE]: {
    label:       'Graphitization Furnace',
    upkeep:      45.0,
    color:       '#0e0e12',
    glowColor:   '#fff0c0',
    powerOutput: 0,
    powerInput:  120,
    throughput:  0,
    cost:        400000,
    income:      0,
    width:       12,
    height:      8,
    cokePerSec:       0.6,   // coke drawn per second
    graphitePerSec:   0.3,   // graphite made per second
    cokeCapacity:     60,    // coke packed in the trough, waiting
    graphiteCapacity: 200,
    graphiteResumeFrac: 0.5, // once full it stays off until the store is down to this share (GraphiteFurnaceSystem.outputFull)
  },
  [T.COALWASTE]: {
    label:           'Coal Waste Processing Facility',
    color:           '#1a1610',
    glowColor:       '#a08040',
    powerOutput:     0,
    powerInput:      12,
    throughput:      0,
    cost:            30000,
    upkeep:          0,
    income:          0,
    width:           8,
    height:          7,
    disposalCostMin: 1000,
    disposalCostMax: 5000,
    storageCapacity: 300,  // max _wasteStored from truck deliveries
    processRate:     3,    // units/sec processed away while powered
  },
  [T.OILWASTE]: {
    label:           'Oil Waste Processing Facility',
    color:           '#0e1a0c',
    glowColor:       '#40a030',
    powerOutput:     0,
    powerInput:      15,
    throughput:      0,
    cost:            55000,
    upkeep:          0,
    income:          0,
    width:           8,
    height:          9,
    disposalCostMin: 2500,
    disposalCostMax: 7500,
    storageCapacity: 300,
    processRate:     3,
  },
  [T.NUCLEARWASTE]: {
    label:           'Nuclear Waste Processing Facility',
    color:           '#101810',
    glowColor:       '#60c040',
    powerOutput:     0,
    powerInput:      30,
    throughput:      0,
    cost:            110000,
    upkeep:          0,
    income:          0,
    width:           13,
    height:          11,
    disposalCostMin: 5000,
    disposalCostMax: 15000,
    storageCapacity: 300,
    processRate:     2,   // slower — nuclear waste is nastier
  },
};

// Per-subtype footprints for commercial / industrial customers
const SubtypeFootprints = {
  cafe:        { width: 4, height: 4 },
  office:      { width: 6, height: 6 },
  clinic:      { width: 3, height: 2 },
  grocery:     { width: 7, height: 4 },
  movietheatre:{ width: 4, height: 3 },
  coldstorage: { width: 5, height: 5 },
  factory:     { width: 9, height: 9 },
  chemical:    { width: 6, height: 6 },
  bottling:    { width: 6, height: 6 },
  datacenter:  { width: 4, height: 4 },
  watertreat:  { width: 6, height: 4 },
  evfactory:   { width: 10, height: 7 },
  serverfarm:  { width: 7, height: 6 },
  coldchain:   { width: 6, height: 5 },
  hotel:       { width: 7, height: 9 },
  motel:       { width: 8, height: 6 },
  boutiquehotel: { width: 8, height: 8 },
  resorthotel: { width: 12, height: 10 },
  mall:        { width: 10, height: 7 },
  galleria:    { width: 10, height: 7 },
  arcade:      { width: 10, height: 7 },
  venue:       { width: 9, height: 7 },
  restaurant:  { width: 5, height: 3 },
  fastfood:    { width: 4, height: 4 },
  donutshop:   { width: 4, height: 4 },
  hotdog:      { width: 4, height: 4 },
  pizzeria:    { width: 4, height: 4 },
  coworking:   { width: 5, height: 5 },
  gym:         { width: 4, height: 3 },
  pharmacy:    { width: 3, height: 3 },
  bakery:      { width: 4, height: 4 },
  kakery:      { width: 4, height: 4 },
  bank:        { width: 8, height: 8 },
  savingsloan: { width: 6, height: 6 },
  reservebank: { width: 7, height: 6 },
  autorepair:  { width: 6, height: 4 },
  fiberhub:    { width: 3, height: 3 },
  datarelay:   { width: 2, height: 2 },
  school:      { width: 10, height: 9 },
  townhouse:   { width: 6, height: 3 },
  apartment:   { width: 3, height: 4 },
  birchwood:   { width: 3, height: 4 },
  foundry:     { width: 3, height: 4 },
  willowbank:  { width: 6, height: 8 },
  condo:       { width: 3, height: 5 },
  lumiere:     { width: 4, height: 7 },
  ashford:     { width: 4, height: 7 },
  cedarpoint:  { width: 8, height: 10 },
  steelfoundry: { width: 4, height: 4 },
  movietheater: { width: 7, height: 5 },
  textilemill:     { width: 4, height: 3 },
  recyclingplant:  { width: 8, height: 6 },
  aluminumsmelter: { width: 9, height: 9 },
  // MK3-era properties
  sciencemuseum:   { width: 9, height: 7 },
  marina:          { width: 11, height: 7 },
  amusementpark:   { width: 22, height: 15 },
  waterpark:       { width: 21, height: 16 },
  thunderridge:    { width: 22, height: 16 },
  fertilizer:      { width: 6, height: 5 },
  isotopelab:      { width: 16, height: 12 },
  cryptomine:      { width: 15, height: 15 },
  companytown:     { width: 15, height: 13 },
  skyscraper:      { width: 7, height: 11 },
  machineshop:     { width: 14, height: 9 },
  fishhatchery:    { width: 15, height: 11 },
  coop:            { width: 9, height: 10 },
  pharmalab:       { width: 12, height: 12 },
  radiology:       { width: 16, height: 12 },
  stadium:         { width: 11, height: 9 },
  semifab:         { width: 9, height: 7 },
  aicompute:       { width: 32, height: 23 },
  spaceport:       { width: 24, height: 16 },
  cardealer:       { width: 7, height: 5 },
  aquarium:        { width: 14, height: 12 },
  convention:      { width: 16, height: 10 },
  finedining:      { width: 14, height: 12 },
  // MK4-era
  megatower:       { width: 17, height: 34 },
  arcology:        { width: 12, height: 14 },
  quantumx:        { width: 12, height: 12 },
  supercon:        { width: 16, height: 12 },
  spaceelevator:   { width: 17, height: 17 },
  evergreen:       { width: 12, height: 15 },
  prism:           { width: 11, height: 16 },
  tidecrest:       { width: 15, height: 15 },
  helix:           { width: 11, height: 16 },
  verdance:        { width: 21, height: 23 },
  holoarena:       { width: 13, height: 11 },
  verticalfarm:    { width: 11, height: 15 },
  geneworks:       { width: 21, height: 16 },
  collider:        { width: 35, height: 27 },
  maglev:          { width: 18, height: 11 },
  skycasino:       { width: 14, height: 12 },
  desal:           { width: 17, height: 12 },
  // Post-Hyperion
  worldexpo:       { width: 18, height: 14 },
  planetarium:     { width: 14, height: 12 },
  celestine:       { width: 18, height: 14 },
  carbonrefinery:  { width: 10, height: 7 },
  massdriver:      { width: 43, height: 18 },
  antimatter:      { width: 28, height: 21 },
  // Master-planned Suburb: the whole 5-lot block (see CLUSTER_LOTS)
  suburb:          { width: 10, height: 2 },
  mansion:         { width: 13, height: 10 },
  victorian:       { width: 12, height: 10 },
  pavilion:        { width: 10, height: 6 },
  glasshouse:      { width: 11, height: 7 },
  vineyard:        { width: 13, height: 8 },
  supperclub:      { width: 10, height: 6 },
  nightclub:       { width: 7, height: 6 },
  jazzbar:         { width: 6, height: 4 },
  disco:           { width: 8, height: 8 },
  superclub:       { width: 14, height: 10 },
  library:         { width: 7, height: 6 },
  clothing:        { width: 8, height: 6 },
  lawoffice:       { width: 5, height: 5 },
  callcentre:      { width: 8, height: 7 },
  summit:          { width: 8, height: 10 },
  newspaper:       { width: 12, height: 10 },
  icerink:         { width: 11, height: 7 },
  radio:           { width: 5, height: 7 },
  // Post-MK2 properties
  bowling:         { width: 12, height: 8 },
  nursery:         { width: 12, height: 8 },
  hotsprings:      { width: 11, height: 9 },
  cannery:         { width: 10, height: 7 },
  truckstop:       { width: 6, height: 4 },
  brickworks:      { width: 5, height: 4 },
  wastefacility:   { width: 6, height: 5 },
  sawmill:         { width: 10, height: 8 },
  glassworks:      { width: 9, height: 7 },
  papermill:       { width: 11, height: 8 },
  plastics:        { width: 5, height: 4 },
  duplex:          { width: 2, height: 2 },
  cornerstore:     { width: 3, height: 3 },
  retirement:      { width: 8, height: 4 },
  pemberton:       { width: 3, height: 4 },
  linden:          { width: 3, height: 4 },
  rialto:          { width: 3, height: 4 },
  sheriff:         { width: 5, height: 4 },
};

// Footprints the art of buildings with people and vehicles on them was drawn
// for. Drawn at those sizes, the figures on them came out at half to two
// thirds the size of the people and cars out on the streets (ZoneLife), so
// each of these buildings grew to the footprint in its def / SubtypeFootprints
// that puts them at street scale, and renderEntityAt draws the art scaled up
// to fill it (artScaleFor). A building still standing at its old size (one
// that has not been resized on load) draws as it always did.
const ArtFootprints = {
  type: {
    [T.TOWNHALL]: [4, 4], [T.CIVICCENTER]: [5, 4], [T.COURTHOUSE]: [5, 5], [T.HOSPITAL]: [6, 5],
    [T.UNIVERSITY]: [11, 8], [T.TRANSPORTHUB]: [12, 8], [T.NATIONALGOV]: [18, 14],
    [T.AIRPORT]: [28, 16], [T.MILITARYBASE]: [28, 20], [T.BASKETBALLCOURT]: [3, 2],
    [T.SPLASHPAD]: [3, 3], [T.PLAYGROUND]: [2, 2], [T.BASEBALLFIELD]: [5, 4],
    [T.COMMUNITYCENTER]: [6, 4], [T.CORNERSTORE]: [2, 2],
  },
  sub: {
    willowbank: [3, 4], arcology: [8, 9], evergreen: [7, 9], prism: [6, 9], tidecrest: [8, 8],
    helix: [6, 9], verdance: [9, 10], celestine: [10, 8], lumiere: [3, 5], ashford: [3, 5],
    cedarpoint: [4, 5], school: [7, 6], companytown: [6, 5], skyscraper: [5, 8], coop: [6, 7],
    cornerstore: [2, 2], retirement: [4, 2], mansion: [7, 5], victorian: [6, 5], pavilion: [8, 5],
    glasshouse: [8, 5], vineyard: [8, 5], cafe: [2, 2], office: [3, 3], grocery: [5, 3],
    motel: [4, 3], boutiquehotel: [4, 4], hotel: [5, 6], mall: [7, 5], galleria: [7, 5], arcade: [7, 5], venue: [6, 5],
    restaurant: [3, 2], fastfood: [2, 2], donutshop: [2, 2], hotdog: [2, 2], pizzeria: [2, 2], coworking: [3, 3], gym: [3, 2], pharmacy: [2, 2],
    kakery: [2, 2], bakery: [2, 2], bank: [4, 4], savingsloan: [3, 3], lawoffice: [3, 3],
    autorepair: [3, 2], nightclub: [5, 4], jazzbar: [3, 2], disco: [4, 4], superclub: [7, 5],
    resorthotel: [6, 5], reservebank: [5, 4], library: [5, 4], waterpark: [9, 7],
    thunderridge: [11, 8], amusementpark: [10, 8, 'wide'], clothing: [4, 3], pharmalab: [6, 6],
    radiology: [8, 6], summit: [5, 6], finedining: [6, 5], supperclub: [5, 3], aquarium: [6, 5],
    holoarena: [8, 7], quantumx: [7, 7], spaceelevator: [12, 12], megatower: [7, 14],
    maglev: [10, 6], skycasino: [8, 7], worldexpo: [10, 8], planetarium: [7, 6], newspaper: [5, 4],
    icerink: [6, 4], radio: [3, 4], bowling: [6, 4], callcentre: [6, 5], nursery: [6, 4],
    hotsprings: [6, 5], cannery: [6, 4], truckstop: [3, 2], sciencemuseum: [5, 4], marina: [6, 4],
    convention: [8, 5], factory: [4, 4], aluminumsmelter: [4, 4], isotopelab: [8, 6],
    cryptomine: [6, 6], machineshop: [8, 5], fishhatchery: [8, 6], desal: [10, 7], supercon: [9, 7],
    aicompute: [14, 10], verticalfarm: [6, 8], geneworks: [12, 9], collider: [18, 14],
    massdriver: [24, 10], antimatter: [16, 12], sawmill: [5, 4], glassworks: [5, 4],
    papermill: [7, 5], recyclingplant: [7, 5],
  },
};

// The scale to draw a building's art at: null when it is drawn at the size it
// was made for, else the old footprint and how far to stretch it each way.
function artScaleFor(e) {
  const sub = e.commercialSubtype;
  const a = sub ? ArtFootprints.sub[sub] : ArtFootprints.type[e.type];
  if (!a) return null;
  const w = e.width || 1, h = e.height || 1;
  if ((w === a[0] && h === a[1]) || w < a[0] || h < a[1]) return null;
  // 'wide': scaled to the footprint's height and widened, never stretched —
  // a lot wider than the art draws it at its own proportions, and the sprite
  // fills the extra either side (the Amusement Park's lawn).
  const aw = a[2] === 'wide' ? Math.max(a[0], w * a[1] / h) : a[0];
  return { w: aw, h: a[1], kx: w / aw, ky: h / a[1] };
}

function entityFootprint(type, subtype = null) {
  if (subtype && SubtypeFootprints[subtype])
    return SubtypeFootprints[subtype];
  const d = EntityDefs[type];
  return { width: d?.width || 1, height: d?.height || 1 };
}

// Whether a building's footprint turns (width and height swap) when it is
// placed at a 90°/270° rotation. Only buildings that keep a facing do: their
// sprites read e.width/height as the rotated footprint and e._rotation as
// the way they face. Everything else has one footprint, whatever the
// placement rotation happens to be — it is shared between tools, so a
// Steam Turbine picked after a turned Fuel Plant used to land 10×14 with
// its 14×10 sprite squeezed into it.
let _FOOTPRINT_TURNS = null;
function footprintTurns(type) {
  if (!_FOOTPRINT_TURNS) _FOOTPRINT_TURNS = new Set([
    T.COALGENERATOR, T.HYDROGENERATOR, T.FUELPLANT, T.NUCLEARREACTOR, T.RESEARCH2, T.RESEARCH3, T.ROAD,
    T.ELECTROLYZER, T.LITHIUMPROCESSPLANT, T.REPROCESSOR, T.SPENTFUELPOOL, T.MOXPLANT, T.ADVREACTOR,
    T.DRONEPORT, T.ATMOSCOLLECTOR, T.HABERBOSCH, T.WASHTOWER, T.FUSIONFUELPLANT, T.HULKINGFUSIONREACTOR,
    T.ADVFUSIONREACTOR, T.MHDRING, T.CRYOPLANT, T.HE3SEPARATOR, T.TRITIUMBREEDER, T.GASSTORAGE,
    T.OILSTORAGE, T.SOLIDSTORAGE, T.TRUCK, T.HAULER,
  ]);
  return _FOOTPRINT_TURNS.has(type);
}

// The only things R turns (or flips) when they are built. Everything else is
// built one way round, whatever the placement rotation happens to be: it is
// shared between tools, so a plant picked after a turned road used to come
// out turned as well, and most of the process plants could be turned on
// purpose, which their drawings were never good at.
// Buildings turned before this keep the facing they have (their ports and
// the lines laid to them depend on it), and a blueprint stamp builds each
// piece the way it was captured.
let _PLACEMENT_TURNS = null;
function placementTurns(type) {
  if (!_PLACEMENT_TURNS) _PLACEMENT_TURNS = new Set([
    T.WATEREXTRACTOR, T.HYDROGENERATOR,
    T.COALMINE, T.COALMINE2, T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2, T.LITHIUMMINE, T.RAREEARTHMINE,
    T.SOLIDSTORAGE, T.OILSTORAGE, T.GASSTORAGE,
    T.GEOWELL,   // R turns the steam spout N → E → S → W
    T.SHAFT, T.UNDERGNDPIPE, T.UNDERGNDCONVEYOR,
    T.TRUCK, T.HAULER, T.ROAD, T.BRIDGE, T.DAM,
  ].filter(v => v !== undefined));
  return _PLACEMENT_TURNS.has(type);
}

// Buildings already standing with a turned footprint they should never have
// had (see footprintTurns): put each back to its def's shape, from the same
// top-left tile, wherever the tiles that takes are free. One that is boxed
// in is left as it is. Run whenever a world goes onto the grid (a load, and
// each trip between home and a job site).
function repairTurnedFootprints() {
  const SKIP = new Set([T.SHAFT, T.LITHIUMMINE, T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2, T.RAREEARTHMINE, T.GEOWELL, T.GEOTURBINE]);
  let fixed = 0;
  for (const type of Object.keys(EntityDefs)) {
    const d = EntityDefs[type], dw = d.width || 1, dh = d.height || 1;
    if (dw === dh || footprintTurns(type) || SKIP.has(type)) continue;
    for (const e of Array.from(EntityRegistry.getByType(type))) {
      if (e.width !== dh || e.height !== dw) continue;
      let free = true;
      for (let r = e.row; r < e.row + dh && free; r++)
        for (let c = e.col; c < e.col + dw && free; c++) {
          if (!GridManager.inBounds(c, r)) { free = false; break; }
          const at = GridManager.tiles[r][c];
          if (at && at !== e) free = false;
        }
      if (!free) continue;
      for (let r = e.row; r < e.row + e.height; r++)
        for (let c = e.col; c < e.col + e.width; c++)
          if (GridManager.inBounds(c, r) && GridManager.tiles[r][c] === e) GridManager.tiles[r][c] = null;
      e.width = dw; e.height = dh;
      for (let r = e.row; r < e.row + dh; r++)
        for (let c = e.col; c < e.col + dw; c++) GridManager.tiles[r][c] = e;
      fixed++;
    }
  }
  return fixed;
}

// Liquid Storage Tanks went 7×7 → 6×6: the top row and the column on the far
// side from the stubs were empty ground. Tanks still standing at 7×7 lose
// those tiles whenever their world goes onto the grid. The drawing and the
// stubs stay on the same tiles (renderOilStorage, OilSystem.tankStubs), so the
// pipes laid to them still meet.
function trimLegacyTanks() {
  for (const e of EntityRegistry.getByType(T.OILSTORAGE)) {
    if (e.width !== 7 || e.height !== 7) continue;
    const nc = ((e._rotation || 0) % 2) === 1 ? e.col + 1 : e.col, nr = e.row + 1;
    for (let r = e.row; r < e.row + 7; r++)
      for (let c = e.col; c < e.col + 7; c++) {
        const keep = c >= nc && c < nc + 6 && r >= nr;
        if (!keep && GridManager.inBounds(c, r) && GridManager.tiles[r][c] === e) GridManager.tiles[r][c] = null;
      }
    e.col = nc; e.row = nr;
    e.width = 6; e.height = 6;
  }
  // A truck's queue names its stops by tile, and trimming moved the tank's
  // corner off that tile: Acid Haulers read "Liquid Storage Tank no longer
  // exists" beside a tank still standing, and stopped collecting. Point any
  // such stop at the corner it moved to, trimmed on this load or an earlier one.
  const tankAt = (c, r) => {
    const t = GridManager.inBounds(c, r) ? GridManager.getEntity(c, r) : null;
    return t && t.type === T.OILSTORAGE && t.col === c && t.row === r ? t : null;
  };
  for (const trk of EntityRegistry.getByType(T.TRUCK)) {
    for (const d of trk._destQueue || []) {
      if (!d || d.kind !== 'source' || d.sourceType !== T.OILSTORAGE || tankAt(d.col, d.row)) continue;
      const t = tankAt(d.col, d.row + 1) || tankAt(d.col + 1, d.row + 1);
      if (t) { d.col = t.col; d.row = t.row; }
    }
  }
}

// Family houses went from 1×1 to 2×2. Houses still standing at 1×1 from an
// older save grow on load: in place where they can (the new footprint keeps
// the old tile, so whatever wire or neighbour fed the house still touches
// it; growing upward first keeps its front on the same street), otherwise
// moved to the nearest free 2×2 nearby that touches a wire or another
// building to draw power through. One with nowhere to go stays 1×1 and
// tries again next load. Mae's Cabin stays 1×1. Returns how many changed.
function growLegacyHouses() {
  const HW = EntityDefs[T.HOUSE].width || 1, HH = EntityDefs[T.HOUSE].height || 1;
  if (HW === 1 && HH === 1) return 0;
  const legacy = Array.from(EntityRegistry.getByType(T.HOUSE)).filter(e =>
    !e.commercialSubtype && e.width === 1 && e.height === 1 && e.businessName !== "Mae's Cabin");
  if (!legacy.length) return 0;
  // Front rows first, left to right, so neighbours claim gaps in a fixed order.
  legacy.sort((a, b) => (b.row - a.row) || (a.col - b.col));
  const otherZones = ['commercial', 'industrial'].flatMap(k => ZoneSystem.getZoneRects?.(k) || []);
  const fits = (c, r) => GridManager.canPlaceFootprint(c, r, HW, HH) && !ZoneSystem.isInGovZone(c, r) &&
    !otherZones.some(z => c <= z.maxC && c + HW - 1 >= z.minC && r <= z.maxR && r + HH - 1 >= z.minR);
  const feeds = (t, e) => t && t !== e && (t.type === T.WIRE || t.type === T.HOUSE || t.type === T.COMMERCIAL || t.type === T.INDUSTRIAL);
  // Edge-touching (power never passes diagonally) and live as of the save.
  const live = (t, e) => feeds(t, e) && t.powered;
  const touchesFeed = (e, c, r) => {
    for (let x = c; x < c + HW; x++) for (const y of [r - 1, r + HH]) if (live(GridManager.getEntity(x, y), e)) return true;
    for (let y = r; y < r + HH; y++) for (const x of [c - 1, c + HW]) if (live(GridManager.getEntity(x, y), e)) return true;
    return false;
  };
  const place = (e, c, r) => {
    GridManager.removeEntityFootprint(e);
    e.col = c; e.row = r; e.width = HW; e.height = HH;
    GridManager.setEntityFootprint(e);
  };
  let grown = 0, moved = 0;
  const left = [];
  for (const e of legacy) {
    GridManager.removeEntityFootprint(e);   // its own tile counts as free
    const spot = [[e.col, e.row - HH + 1], [e.col - HW + 1, e.row - HH + 1], [e.col, e.row], [e.col - HW + 1, e.row]]
      .find(([c, r]) => fits(c, r));
    GridManager.setEntityFootprint(e);
    if (spot) { place(e, spot[0], spot[1]); grown++; }
    else left.push(e);
  }
  const R = 12;
  // Counted before anything moves, so a neighbour leaving first doesn't hide a link.
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const linksOf = new Map(left.map(e => [e, N4.filter(([dc, dr]) => feeds(GridManager.getEntity(e.col + dc, e.row + dr), e)).length]));
  for (const e of left) {
    GridManager.removeEntityFootprint(e);
    let best = null, bestD = Infinity;
    for (let r = e.row - R; r <= e.row + R; r++) for (let c = e.col - R; c <= e.col + R; c++) {
      const d = Math.hypot(c + HW / 2 - 0.5 - e.col, r + HH / 2 - 0.5 - e.row);
      if (d >= bestD || d > R || !fits(c, r) || !touchesFeed(e, c, r)) continue;
      best = [c, r]; bestD = d;
    }
    GridManager.setEntityFootprint(e);
    if (!best) continue;
    const c0 = e.col, r0 = e.row;
    // A house links whatever wires and buildings touch it into one network.
    // If it touched two or more, a wire takes its old tile so they stay linked.
    place(e, best[0], best[1]);
    if (linksOf.get(e) >= 2 && !GridManager.getEntity(c0, r0)) GridManager.setEntity(c0, r0, new Entity(T.WIRE, c0, r0));
    moved++;
  }
  if (moved && typeof PowerNetwork !== 'undefined') PowerNetwork.recomputeWireHops?.();
  if (grown + moved) {
    console.log(`[SAVE] Houses to ${HW}×${HH}: ${grown} grown in place, ${moved} moved, ${legacy.length - grown - moved} boxed in`);
    if (typeof MessageLog !== 'undefined') MessageLog.add(`Homes rebuilt bigger: ${grown + moved} houses now ${HW}×${HH}` +
      (moved ? ` (${moved} moved next door to make room)` : ''), '#f0c040');
  }
  return grown + moved;
}

function applySubtypeFootprint(entity) {
  if (!entity.commercialSubtype) return;
  const fp = SubtypeFootprints[entity.commercialSubtype];
  if (fp) { entity.width = fp.width; entity.height = fp.height; }
}

// Customer placement ring (global — used by render + EntityInfoPanel)
const MIN_DIST   = 6;   // minimum tiles from substation (exclusion zone)
const MAX_DIST   = 16;  // maximum tiles from substation (service range)
const EDGE_MARGIN = 15; // minimum tiles from any map edge for customer placement

/* Cloud cover state — affects solar output with gradual random variation */

// The numbers for a truck on the map: the Hauler's for a truck flagged
// _hauler, the Waste Truck's otherwise (and for no truck at all).
function truckSpec(trk) {
  return (trk && trk._hauler && EntityDefs[T.HAULER]) || EntityDefs[T.TRUCK];
}

// How much of `kind` one load is for this truck: a Hauler's tube trailer
// for a gas, its ordinary capacity for anything else (or no kind at all).
function truckCargoCap(trk, kind) {
  const spec = truckSpec(trk);
  if (kind && spec.cargoCapacityGas && typeof DroneSystem !== 'undefined' && DroneSystem.cargo) {
    const K = DroneSystem.cargo.kinds()[kind];
    if (K && K.phase === 'gas') return spec.cargoCapacityGas;
  }
  return spec.cargoCapacity || 100;
}
