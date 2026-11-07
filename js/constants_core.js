/* ═══════════════════════════════════════════════════════════════════
   GRIDWORKS — Minimal Playable Prototype
   ─────────────────────────────────────
   Architecture overview:
     GridManager   — owns the tile array, translates coords
     EntityTypes   — pure definitions (no state)
     Entity        — one placed object on a tile
     PowerNetwork  — BFS flood-fill each tick; computes power flow
     RenderSystem  — reads world state, draws to canvas
     InputManager  — translates DOM events → game actions
     GameLoop      — requestAnimationFrame; ticks + renders
   ═══════════════════════════════════════════════════════════════════ */

// ─── Constants ────────────────────────────────────────────────────
const TILE   = 40;          // px per tile

// ─── World size ───────────────────────────────────────────────────
// Picked on the Found Your Company screen. The grid is sized once, when the
// page loads, from the choice left in sessionStorage — a new game sets it
// before the reload that starts the world, and loading a save of another
// size sets it and reloads (MenuSystem readAndStartLoad).
// The sizes have been enlarged twice: 20% wider and taller, then another
// 25% (`was`: every earlier set of dimensions, newest first). A save made at
// a `was` size belongs to the same size and is recentred onto the bigger map
// by SaveSystem _migrateMapSize, so City Hall and everything built round it
// stay put and the new land is a ring outside. Saves from sizes that match
// nothing here are recentred onto Normal.
// `field`: the map this size had before either enlargement, where coal, oil
// and aquifers are rolled (DEPOSIT_FIELD below), so they stay as many and as
// far from City Hall as they were tuned for.
const WORLD_SIZES = {
  small:  { label: 'Small',  cols: 1351, rows: 809,  was: [[1081, 647],  [901, 539]],   field: [901, 539],   desc: 'Tighter map: fewer lakes and rivers, shorter truck runs' },
  normal: { label: 'Normal', cols: 1931, rows: 1155, was: [[1545, 924],  [1287, 770]],  field: [1287, 770],  desc: 'The standard map' },
  large:  { label: 'Large',  cols: 2509, rows: 1501, was: [[2007, 1201], [1673, 1001]], field: [1673, 1001], desc: 'More land, water and room to sprawl; heavier on older PCs' },
};
// The Normal map the game's feature counts were tuned on.
const WORLD_TUNED = { cols: 1287, rows: 770 };
const WORLD_SIZE = (() => {
  try { const k = sessionStorage.getItem('gw_world_size'); if (WORLD_SIZES[k]) return k; } catch (_e) {}
  return 'normal';
})();
const COLS   = WORLD_SIZES[WORLD_SIZE].cols;
const ROWS   = WORLD_SIZES[WORLD_SIZE].rows;
// How this map compares with the tuned Normal — world generation multiplies
// fixed feature counts by these so a bigger map isn't just the same features
// spread thin. AREA for things scattered over the land, SPAN for things that
// cross it. Measured against WORLD_TUNED, not today's Normal, so each
// enlargement kept the density of lakes and rivers it was tuned for.
const WORLD_AREA_SCALE = (COLS * ROWS) / (WORLD_TUNED.cols * WORLD_TUNED.rows);
const WORLD_SPAN_SCALE = Math.sqrt(WORLD_AREA_SCALE);
// Where surveys find deposits: the footprint of this size's map from before
// the enlargements (`field`), centred on the map (so on City Hall). Every
// survey judges "outer" against this rectangle's edges, not the map's, so the
// bigger map did not move the near edge of any deposit band. Coal, oil and
// aquifers are also rolled inside it, so they are exactly as far out as they
// have always been; the later finds (uranium, sulfur, lithium, helium) are
// rolled over the whole map and can land in the new land beyond it as well.
const DEPOSIT_FIELD = (() => {
  const [fc, fr] = WORLD_SIZES[WORLD_SIZE].field;
  const c0 = Math.floor(COLS / 2) - Math.floor(fc / 2), r0 = Math.floor(ROWS / 2) - Math.floor(fr / 2);
  return { c0, r0, c1: c0 + fc, r1: r0 + fr, cols: fc, rows: fr };
})();
// Outer band of the deposit field (its outer 15% on each side) — where
// surveys find deposits. True if at least one tile of the w×h footprint at
// (col, row) is in the band. Shared by every deposit system's spawner, so
// it also turns away the National Government Zone and the land held for it
// (ZoneSystem.onNationalLand): nothing is discovered where a national
// building is due to go.
function isOuterZone(col, row, w, h) {
  if (typeof ZoneSystem !== 'undefined' && ZoneSystem.onNationalLand?.(col, row, w, h)) return false;
  const marginX = Math.floor(DEPOSIT_FIELD.cols * 0.15);
  const marginY = Math.floor(DEPOSIT_FIELD.rows * 0.15);
  for (let dr = 0; dr < h; dr++)
    for (let dc = 0; dc < w; dc++) {
      const c = col + dc, r = row + dr;
      if (c < DEPOSIT_FIELD.c0 + marginX || c >= DEPOSIT_FIELD.c1 - marginX || r < DEPOSIT_FIELD.r0 + marginY || r >= DEPOSIT_FIELD.r1 - marginY)
        return true;
    }
  return false;
}
// Which world size a save's recorded dimensions belong to: its current
// dimensions or any it had before an enlargement ('normal' when they match
// none — older map sizes are migrated onto Normal).
function worldSizeForDims(cols, rows) {
  for (const k of Object.keys(WORLD_SIZES)) {
    const w = WORLD_SIZES[k];
    if ((w.cols === cols && w.rows === rows) || w.was.some(d => d[0] === cols && d[1] === rows)) return k;
  }
  return 'normal';
}

// ─── Power units ──────────────────────────────────────────────────
// The game's power numbers (powerOutput, powerInput, throughput, network
// totals…) are KILOWATTS, and its energy numbers kilowatt-hours: a house
// draws 4 kW, the biggest plant makes 4 MW. The stored values are plain
// numbers; only the display carries the unit, so show them through
// formatPower (and formatWh, input_utils.js) rather than appending a unit.
const POWER_UNITS = ['kW', 'MW', 'GW', 'TW'];

// `dp` fixes the decimals below 1,000 kW (live readouts pass 1 so the text
// doesn't jitter). From a megawatt up: 2 decimals under 10, 1 under 100,
// none above, trailing zeros dropped ("4 MW", "3.59 MW", "15.3 MW").
function formatPower(n, dp) {
  let v = Number(n) || 0, i = 0;
  const d0 = dp != null ? dp : Number.isInteger(v) ? 0 : 1;
  if (Math.abs(+v.toFixed(d0)) < 1000) return `${v.toFixed(d0)} ${POWER_UNITS[0]}`;
  while (Math.abs(v) >= 999.5 && i < POWER_UNITS.length - 1) { v /= 1000; i++; }
  const a = Math.abs(v);
  return `${parseFloat(v.toFixed(a < 10 ? 2 : a < 100 ? 1 : 0))} ${POWER_UNITS[i]}`;
}

// "current / target" with both sides in the TARGET's unit, so a progress
// readout never shows its two ends in different units ("812 / 1,000 kW",
// "3.2 / 6 MW").
function formatPowerPair(cur, target) {
  let t = Number(target) || 0, c = Number(cur) || 0, i = 0;
  while (Math.abs(t) >= 1000 && i < POWER_UNITS.length - 1) { t /= 1000; c /= 1000; i++; }
  const d = i === 0 ? 0 : Math.abs(t) < 10 ? 2 : Math.abs(t) < 100 ? 1 : 0;
  return `${c.toFixed(d)} / ${parseFloat(t.toFixed(d))} ${POWER_UNITS[i]}`;
}

// The placeable Conveyor Splitter is archived: every belt fork already
// becomes a splitter on its own (syncAutoSplitters, resource_helpers.js) with
// the same settings panel, so the build tool, its unlock, research entry,
// progress-clock row, compendium entry and Q-copy are hidden while this is
// true. Everything else is kept, so setting it false brings it all back.
const CONVEYOR_SPLITTER_ARCHIVED = true;

// Entity type IDs
const T = {
  SOLAR:      'solar',
  WIRE:       'wire',
  RESEARCH:   'research',
  HOUSE:      'house',       // House MK1 — wirelessly powered by nearby substation
  SUBSTATION: 'substation',  // Substation MK1 — 2×2, charges from grid, powers houses
  SUBSTATION2: 'substation2', // Substation MK2 — 3×3, 450 kWh
  SUBSTATION3: 'substation3', // Substation MK3 — 4×4, 1.2 MWh
  SUBSTATION4: 'substation4', // Substation MK4 — 6×6, 3 MWh
  SUBSTATION5: 'substation5', // Substation MK5 — 8×8, 8 MWh
  POLE:       'pole',        // Power Pole — relay; resets wire run counter
  LAMP:       'lamp',        // Street Lamp — amenity; boosts nearby customer satisfaction
  CAMERA:     'camera',      // Security Camera — amenity; safety boost
  EVCHARGER:  'evcharger',   // EV Charger — zone-requested amenity; modern comfort boost
  CELLTOWER:    'celltower',     // Cell Tower — 4×4 amenity; generates income, serves residential zones
  FIBERHUB:     'fiberhub',     // Fiber Hub — 5×5 MK3 amenity; generates income, serves all zones
  TOWNHALL:     'townhall',      // Government: Town Hall — 4×4
  CIVICCENTER:  'civiccenter',   // Government: Civic Center — 5×4
  COURTHOUSE:   'courthouse',    // Government: Courthouse — 5×5
  EMS:          'ems',           // Government: Emergency Services — 6×4
  HOSPITAL:     'hospital',      // Government: Hospital — 6×5
  UNIVERSITY:   'university',    // Government: University — 11×8
  TRANSPORTHUB: 'transporthub',  // Government: Transportation Hub — 12×8
  NATIONALGOV:  'nationalgov',   // Government: National Government Center — 18×14, founds the National Government Zone
  FUSIONLAB:    'fusionlab',     // Government: Fusion Research Facility — 20×16, National Government Zone
  AIRPORT:      'airport',       // Government: International Airport — 28×16, National Government Zone
  MILITARYBASE: 'militarybase',  // Government: Military Base — 28×20, joins the airport's zone at 15 MW generated
  LAUNCHCOMPLEX: 'launchcomplex',  // Government: Starhaven Launch Complex — 27×18, joins the national zone after the Military Base, at 20 MW (LaunchSystem)
  NATIONALGRID: 'nationalgrid',  // Government: Hyperion Station — 28×18, Operation Hyperion's national interconnector (NationalProject)
  COMPANYHQ:    'companyhq',     // The player's own headquarters — 40×32, the city's gift in the national zone once an Advanced Fusion Reactor runs (CompanyHQ)
  TRUCK:        'truck',         // Truck — 1×3 driveable vehicle
  HAULER:       'hauler',        // Hauler — the cargo truck. A TOOL and a definition only: placing one makes a T.TRUCK entity flagged _hauler (see truckSpec in entity_defs.js)
  SMALLPARK:       'smallpark',       // Small Park — 3×2, residential zone request, generates income
  COMMUNITYGARDEN: 'communitygarden', // Community Garden — 3×3, residential zone request, generates income
  TREEDSTREET:     'treedstreet',     // Tree-Lined Street — 4×1, residential zone request, generates income
  BASKETBALLCOURT: 'basketballcourt', // Basketball Court — 3×2, residential zone request, generates income
  FARMERSMARKET:   'farmersmarket',   // Farmers Market — 4×2, residential zone request, generates income
  FOUNTAIN:        'fountain',        // Fountain Plaza — 3×3, residential zone request, generates income
  SPLASHPAD:       'splashpad',       // Splash Pad — 3×3, residential zone request; pumps draw power on dry days. After coal power.
  ALLOTMENTS:      'allotments',      // Community Allotments — 6×5, residential zone request after Research MK3
  DOGPARK:         'dogpark',         // Dog Park — 5×4, residential zone request after Research MK3
  FARM:            'farm',            // Family Farm — 10×8, residential zone request once a Hydroelectric Generator is built
  CORNERSTORE:     'cornerstore',     // Corner Store — 2×2, powered residential amenity, open 07:00–23:00
  COMMUNITYCENTER: 'communitycenter', // Community Center — 6×4, powered park (lights/heating 08:00–22:00) after Research MK3
  GREENHOUSE:      'greenhouse',      // Botanic Greenhouse — 8×6, powered park (grow lights 06:00–22:00, heating overnight) after Research MK3
  PLAYGROUND:      'playground',      // Playground — 2×2, residential zone request; steadies residents beyond the park-bonus cap
  BASEBALLFIELD:   'baseballfield',   // Lit Baseball Diamond — 5×4, residential zone request; floodlights draw power in the evening. After fuel power.
  FASTTRAVEL:      'fasttravel',      // Fast Travel — world map double-click pan. Unlocks after generating coal power.
  BLUEPRINT:       'blueprint',       // Blueprints ability — save/stamp entity layouts. Unlocks via Research Station MK3.
  AUTODISPATCH:    'autodispatch',    // Auto-Dispatch ability — hands a truck a waste-collection job it runs by itself. Unlocks via Research Station MK3.
  SCRUBBER:        'scrubber',        // Scrubber upgrade — fitted from a Coal/Fuel Generator or Refinery panel. Unlocks via Research Station MK2 + carbon tax paid.
  MONITOR:    'monitor',     // Monitoring Station — unlocks GRID panel when powered
  MONITOR2:   'monitor2',    // Monitoring Station MK2 — 4x4 grid operations centre: Network Breakdown and the storage readout
  ENGOFFICE:  'engoffice',   // Engineering Office — 10x8, once 3 Nuclear Reactors have run at once: sells the Engineering Audit (advisor.js)
  SOLAR2:     'solar2',      // Solar Panel MK2 — 20 kW peak, higher upkeep
  SOLAR3:     'solar3',      // Solar Array — 6×4 sun-tracking array with a molten-salt night buffer. Unlocks via MK4 Research.
  WIND:       'wind',        // Wind Turbine — variable output, day+night
  WIND2:      'wind2',       // Wind Turbine MK2 — 3×3, bigger blades, 10-25 kW variable output
  WIND3:      'wind3',       // Wind Turbine MK3 — 4×4 utility-scale turbine, 28-49 kW variable output
  BATTERY:    'battery',     // Battery Block — standalone 500 kWh storage
  CIRCUITSWITCH: 'circuitswitch', // Circuit Switch — 4×4 manual load-shedding breaker, 500 kW peak roster
  CIRCUITSWITCH2: 'circuitswitch2', // Circuit Switch MK2 — 6×5, 1.4 MW peak roster
  COMMERCIAL:  'commercial',  // Commercial Building — high draw, high fee (system-placed)
  INDUSTRIAL:  'industrial',  // Industrial Load — very high draw, premium revenue (system-placed)
  SURVEY:      'survey',      // Resource Survey Station — reveals resource deposits
  SURVEY2:     'survey2',     // Survey Station MK2 — 6×6 geophysics observatory: two scans at once, cheaper scans, and the only rig that runs the late-game scans. Unlocks via MK4 Research.
  GEODEPOSIT:  'geodeposit',  // Geothermal Deposit — first discoverable resource, revealed by the default survey scan
  GEOWELL:     'geowell',     // Geothermal Well — 3×2 footprint (drawn 3 tall), sunk into a geothermal deposit; one per deposit
  GEOTURBINE:  'geoturbine',  // Geothermal Turbine — 5×4, plugs into a well's steam output port; one per well
  COALSCAN:    'coalscan',    // Coal Scan capability — unlocked once a Geothermal Turbine has run
  COALDEPOSIT: 'coaldeposit', // Coal Deposit — mineable resource (revealed by the coal scan)
  OILSCAN:     'oilscan',     // Oil Scan capability — unlocked via Research MK2 after mining 30k coal
  URANIUMSCAN: 'uraniumscan', // Uranium Scan capability — unlocked via Research MK3 after pumping 50k oil
  SULFURSCAN:  'sulfurscan',  // Sulfur Scan capability — unlocked via Research MK3 after pumping 50k oil
  OILDEPOSIT:  'oildeposit',  // Oil Deposit  — discovered via survey scan
  URANIUMDEPOSIT: 'uraniumdeposit', // Uranium Deposit — discovered via uranium scan
  SULFURDEPOSIT:  'sulfurdeposit',  // Sulfur Deposit — discovered via sulfur scan
  URANIUMMINE: 'uraniummine',    // Uranium Mine — 4×5, placed on uranium deposit
  URANIUMMINE:    'uraniummine',    // Uranium Mine — 4×5 extraction building
  SULFURMINE:  'sulfurmine',     // Sulfur Mine — 4×5, placed on sulfur deposit
  PUMPJACK:    'pumpjack',    // Pump Jack — placed on oil deposit, extracts crude
  PUMPJACK2:   'pumpjack2',   // Pump Jack MK2 — 4×4, pumps 30% more crude than the MK1
  OILSTORAGE:  'oilstorage',  // Oil Storage Tank — buffers crude from pump jacks
  GASSTORAGE:   'gasstorage',   // Gas Holder — 8×8 pipe-fed sphere that stockpiles one fusion-chain gas
  SOLIDSTORAGE: 'solidstorage', // Storage Container — 5×5 belt-fed bin that stockpiles coal/ore
  REFINERY:    'refinery',    // Oil Refinery — converts crude → fuel oil for oil power plant
  FUELGEN:     'fuelgen',     // Fuel Power Generator — burns refined fuel oil, 3×3, 75 kW
  COALMINE:    'coalmine',    // Coal Mine — placed on deposit, generates power
  URANIUMMINE: 'uraniummine', // Uranium Mine — 4×5, extracts uranium from deposits
  SULFURMINE:  'sulfurmine',  // Sulfur Mine — 4×5, extracts sulfur from deposits
  SULFURMINE2: 'sulfurmine2', // Sulfur Mine MK2 — 6×7 on the MK1's OUT stub, 2.5× the rate (and deposit drain); unlocks once a sulfur deposit is 50% mined
  CHEMICALPLANT: 'chemicalplant', // Chemical Plant — 5×4, converts sulfur + water → sulfuric acid
  FUELPLANT:    'fuelplant',    // Fuel Processing Plant — 6×5, converts uranium + acid → uranium fuel rods
  NUCLEARREACTOR: 'nuclearreactor', // Nuclear Reactor — 6×6, burns fuel rods → steam, outputs nuclear waste (no direct power output)
  COOLINGTOWER:   'coolingtower',   // Cooling Tower — 5×6, cools reactor hot water loop
  COOLINGTOWER2:  'coolingtower2',  // Cryogenic Cooling Tower — 15×17, cooled water → Cryogenic Coolant for Advanced Reactor
  STEAMTURBINE:   'steamturbine',   // Steam Turbine — 9×5, converts reactor steam → 300 kW electricity
  STEAMTURBINE2:  'steamturbine2',  // Steam Turbine MK2 — 24×14, high-pressure tandem set: 400 steam → 1.2 MW
  COALMINE2:   'coalmine2',   // Coal Mine MK2 — higher output, feeds 2 generators
  CONVEYOR:    'conveyor',    // Conveyor Belt — carries coal from mine to generator
  COALGENERATOR: 'coalgenerator', // Coal Power Generator — burns coal, produces power
  COKEOVEN:    'cokeoven',    // Coke Oven Battery — 14×9, coal (belt) → coke (belt) + coke-oven gas (hydrogen, pipe). Tier 4 (MK4)
  GRAPHITEFURNACE: 'graphitefurnace', // Graphitization Furnace — 12×8 Acheson furnace, coke (belt) → graphite (belt) for the Advanced Reactor's GRAPHITE IN. Tier 4 (MK4)
  GOVERNOR:    'governor',    // Throttle Governor — 2×2; touching a Fuel/Coal Generator, trims Overdrive before it melts down
  CARBONCAPTURE: 'carboncapture', // Carbon Capture Plant — 10×8 direct-air-capture fan wall; scrubs smog nearby, offsets city emissions
  POWERTOWER:  'powertower',  // Power Tower — 4×4, extends wire runs to 8 tiles
  LIGHTNINGROD: 'lightningrod', // Lightning Rod — 3×4 mast; draws strikes away from nearby buildings
  LIGHTNINGROD2: 'lightningrod2', // Lightning Rod MK2 — 4×5 coil tower; wider reach, near-total interception
  LIGHTNINGROD3: 'lightningrod3', // Lightning Rod MK3 — 5×6 storm spire; widest reach, capacitor-banked surge
  RESEARCH2:   'research2',  // Research Station MK2 — 2×2, faster research rate
  RESEARCH3:   'research3',  // Research Station MK3 — 3×3, gates hydro unlocks
  BEACON:      'beacon',    // Communications Beacon — 2x3; opens the contract board
  PROTECTOR:   'protector',  // Surge Protector MK1 — inline wire node, caps throughput segment
  PROTECTOR2:  'protector2', // Surge Protector MK2 — 2×2, saturating wire-cap tier (→ 7.65 MW)
  PROTECTOR3:  'protector3', // Surge Protector MK3 — 3×3, saturating wire-cap tier (→ 30.6 MW)
  AQUIFER:     'aquifer',    // Underground aquifer deposit — inexhaustible water source
  WATEREXTRACTOR: 'waterextractor', // Water Extractor — placed on aquifer, 3×3
  PIPE:        'pipe',       // Pipe — connects extractor to hydro generator
  UNDERGNDPIPE:'undergndpipe', // Underground Pipe — same as pipe, skips surface tiles
  UNDERGNDCONVEYOR:'undergndconveyor', // Underground Belt — placement tool; builds a T.CONVEYOR flagged _udgBelt
  CONVEYORSPLITTER:'conveyorsplitter', // Conveyor Splitter — placement tool; builds a T.CONVEYOR flagged _splitter
  HYDROGENERATOR: 'hydrogenerator', // Hydroelectric Generator — 7×7, shaft-driven
  TREE:           'tree',           // Harvestable tree — yields biofuel
  BUSH:           'bush',           // Harvestable bush — yields less biofuel
  BIOFUELGEN:     'biofuelgen',     // Biofuel Generator — starter gen, 3 kW
  WATER:          'water',          // Water tile — blocks placement
  DAM:            'dam',            // Dam — placed across a river, forms reservoir behind it
  HYDROTURBINE:   'hydroturbine',   // Hydro Turbine — 5×5 in water, produces mechanical rotation
  SHAFT:          'shaft',          // Drive Shaft — 1×4 mechanical transmission
  GOVBUILDING:    'govbuilding',    // Government Building (City Hall) — untouchable, 6×6
  ROAD:           'road',           // Road — 4×4 two-lane road tile with centre markings
  BRIDGE:         'bridge',         // Bridge — a TOOL and a definition only: places a T.ROAD flagged _bridge across water (water_build.js)
  PATHTOOL:       'pathtool',       // Path Tool — assign patrol waypoints to a truck
  COALWASTE:      'coalwaste',      // Coal Waste Processing Facility — 8×7
  OILWASTE:       'oilwaste',       // Oil Waste Processing Facility  — 8×9
  NUCLEARWASTE:   'nuclearwaste',   // Nuclear Waste Processing Facility — 13×11
  GASSTATION:     'gasstation',     // Gas Station — refuels trucks, INPUT stub pulls fuel oil from refinery pipe network
  FISHINGPOLE:    'fishingpole',    // Fishing Pole — non-placeable tool; arms FishingSystem's cast/bite/catch minigame
  SPENTFUELPOOL:  'spentfuelpool', // Spent Fuel Pool — 12x8 cooling buffer between a reactor's SPENT FUEL OUT and the Reprocessing Plant. Tier 4 (MK4)
  REPROCESSOR:    'reprocessor',   // Reprocessing Plant — 16×13, spent fuel + water → plutonium + recovered uranium + high-level waste. Tier 4 (MK4)
  MOXPLANT:       'moxplant',      // Advanced Fuel Processing — 15×13, plutonium + uranium (recovered or mined) → MOX fuel rods. Tier 4 (MK4)
  ADVREACTOR:     'advreactor',    // Advanced Nuclear Reactor — 21×21, burns MOX rods. Hotter, twitchier, less spent fuel per unit energy. Tier 4 (MK4)
  DRONECHARGER:   'dronecharger',  // Drone Charging Port — 5×5 relay, no fleet: 5 pads where passing drones top up, and a smaller square added to the drone network. Tier 4 (MK4)
  DRONEPORT:      'droneport',     // Drone Port — 9×9 vertiport, hosts 10 drones that fly repair/service/waste jobs inside its radius. Tier 4 (MK4), late
  MK4RESEARCH:    'mk4research',    // MK4 Research Station — 4×4, prerequisite for the MK5. Unlocks after running 6 Steam Turbines simultaneously
  MK5RESEARCH:    'mk5research',    // MK5 Research Station — 5×5, gates all fusion tech. Unlocks after placing the MK4 and producing 2,500 uranium fuel rods
  ELECTROLYZER:   'electrolyzer',   // Electrolyzer — 8×22, converts water → hydrogen gas. Unlocks after placing MK5 Research Station
  LITHIUMSCAN:    'lithiumscan',    // Lithium Scan capability — unlocked via MK5 Research Station after 25,000 cumulative Hydrogen Gas
  LITHIUMDEPOSIT: 'lithiumdeposit', // Lithium Deposit — discovered via lithium scan
  LITHIUMMINE:    'lithiummine',    // Lithium Mine — 8×10, placed on lithium deposit
  LITHIUMPROCESSPLANT: 'lithiumprocessplant', // Lithium Processing Plant — 20×18, converts lithium ore + water → lithium compound
  ATMOSCOLLECTOR: 'atmoscollector', // Atmosphere Collector — 14×14, converts air → nitrogen gas
  HABERBOSCH:     'haberbosch',     // Haber-Bosch Complex — 22×20, converts nitrogen + hydrogen gas → ammonia gas
  WASHTOWER:      'washtower',      // Isotopic Wash Tower — 20×20, converts water + ammonia catalyst → deuterium gas
  FUSIONFUELPLANT: 'fusionfuelplant', // Fusion Fuel Plant — 24×22, converts deuterium gas + lithium compound → plasma fuel cells
  HULKINGFUSIONREACTOR: 'hulkingfusionreactor', // Hulking Fusion Reactor — 30×30, burns plasma fuel cells → High-Beta Plasma (no direct power output)
  ADVFUSIONREACTOR: 'advfusionreactor', // Advanced Fusion Reactor — 48×48 stellarator, burns D-He3 pellets → ion stream for MHD Rings
  MHDRING: 'mhdring', // MHD Decelerator Ring — 38×14, decelerates a D-He3 ion stream into +4 MW grid power
  HELIUMSCAN:    'heliumscan',    // Helium Scan capability — opens after 75 D-T fuel pellets (MK5 Research Station)
  HELIUMDEPOSIT: 'heliumdeposit', // Helium Gas Field — helium-rich natural gas pocket, discovered via helium scan
  HELIUMWELL:    'heliumwell',    // Helium Well — 6×6, placed on a helium gas field, pipes out helium gas
  HELIUMWELL2:   'heliumwell2',   // Helium Well MK2 — 8×8 on the MK1's stub, 3× the rate (and field drain); unlocks once an Advanced Fusion Reactor runs
  CRYOPLANT:     'cryoplant',     // Cryo Plant — 20×18, liquefies helium gas → liquid helium for the Fusion Reactor's magnets
  HE3SEPARATOR:  'he3separator',  // Helium-3 Separator — 12×12, cryogenic distillation of helium gas → helium-3 for D-He3 fuel
  TRITIUMBREEDER: 'tritiumbreeder', // Tritium Breeding Facility — 38×22, accelerator-driven: lithium compound → tritium for D-T fuel
  // Field Core chain (docs/FIELD_CORE_SPEC.md)
  RAREEARTHSCAN:    'rareearthscan',    // Rare Earth Scan capability — opens after burning 100 D-He3 pellets in an Advanced Fusion Reactor
  RAREEARTHDEPOSIT: 'rareearthdeposit', // Rare Earth Deposit — monazite body, discovered via rare earth scan
  RAREEARTHMINE:    'rareearthmine',    // Rare Earth Mine — 4×5, placed on a rare earth deposit
  LEACHPLANT:       'leachplant',       // Leach Plant — 10×9, rare earth ore + sulfuric acid → rare earth oxide + thorium tailings
  SCMILL:           'scmill',           // Superconductor Mill — 12×10, oxide + hydrogen + nitrogen → HTS tape
  COREWORKS:        'coreworks',        // Core Works — 12×10, HTS tape → Field Cores; winds, charges and recharges them in four bays
};

// ─── Entity type definitions ───────────────────────────────────────
// Static def data. powerOutput for SOLAR is dynamic (computed per tick
// from DayNight); this value is the MK1 peak at solar noon.
