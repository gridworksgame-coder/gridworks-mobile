/* ═══════════════════════════════════════════════════════════════════
   HOUSE REQUEST SYSTEM
   Residential customer connection request lifecycle.
   ═══════════════════════════════════════════════════════════════════ */

const HouseRequestSystem = (() => {
  // First request: after 500Ws AND a substation exists.
  // Each subsequent request needs another 600Ws — roughly one per
  // real-world minute of good solar output.
  const WS_PER_REQUEST = 22500;
  const MAX_PENDING    = 3;
  let nextThreshold    = 10000;
  let requestIdCounter = 1;

  // Upfront = grid connection infrastructure cost (stays substantial).
  // Fee = ongoing revenue per real-world second. Kept low so wealth
  // accumulates over minutes, not seconds — you need multiple houses
  // and time to afford the next tier of infrastructure.
  // Each commercial type has a subtype key matching DemandCurves
  // These used to be full ROWS×COLS grid scans, run as `unlock` predicates
  // against every pool entry every time a new request is rolled — one of
  // the biggest hot-path costs in the game. EntityRegistry already tracks
  // every placed entity by type, so this is now a direct O(1) check.
  // Wealth tier for standard single-family houses, derived from demandMult —
  // drives which of the 4 house sprites (renderHouse in render_residential_
  // commercial.js) gets drawn. Matches the FAMILY_POOL tier comments below.
  function _wealthTier(demandMult) {
    if (demandMult >= 2.0)  return 'luxury';
    if (demandMult >= 1.56) return 'premium';
    if (demandMult >= 1.11) return 'mid';
    return 'budget';
  }

  const hasCoalGen   = () => EntityRegistry.getByType(T.COALGENERATOR).size  > 0;
  // Gate for the large buildings — see genEverAbove750 below for why this is
  // a latch on peak generation rather than a check on one building type.
  const hasBigGrid   = () => genEverAbove750;
  const hasHydroGen  = () => EntityRegistry.getByType(T.HYDROGENERATOR).size > 0;
  // "Geothermal achieved" = a turbine on the map. The well alone is only half
  // the chain — it's the turbine that actually puts geothermal watts on the
  // grid, which is the milestone schools are meant to follow.
  const hasGeothermal = () => EntityRegistry.getByType(T.GEOTURBINE).size > 0;

  // ── MK3-era gates ──────────────────────────────────────────────────
  // Every MK3 property waits for Research Station MK3 to be researched, then
  // each also waits on a later milestone along that tech tree, so new
  // customers keep arriving right through the era instead of all at once.
  const hasMk3         = () => typeof Progression !== 'undefined' && Progression.isUnlocked(T.RESEARCH3);
  const hasMk3Dam      = () => hasMk3() && typeof ReservoirSystem !== 'undefined' && ReservoirSystem.hasDams();
  const hasMk3Hydro    = () => hasMk3() && hasHydroGen();
  const hasSulfurWorks = () => hasMk3() && typeof SulfurSystem !== 'undefined' && SulfurSystem.getTotalMined() >= 1000;
  const hasFuelRods    = () => hasMk3() && typeof FuelPlantSystem !== 'undefined' && FuelPlantSystem.getTotalRods() > 0;
  const hasMk3Reactor  = () => hasMk3() && EntityRegistry.getByType(T.NUCLEARREACTOR).size > 0;
  const hasMk3Turbines = () => hasMk3() && EntityRegistry.getByType(T.STEAMTURBINE).size >= 2;
  // Latched like genEverAbove750 below: generation sags every night, and a
  // live check would pull the Crypto Mine in and out of the pool.
  let genEverAbove1500 = false;
  const hasMk3BigGen   = () => {
    if (PowerNetwork.stats.totalGenerated >= 1500) genEverAbove1500 = true;
    return hasMk3() && genEverAbove1500;
  };
  // Master-planned Suburb — latched and saved the same way.
  let genEverAbove2500 = false;
  const hasMk3Grid2500 = () => {
    if (PowerNetwork.stats.totalGenerated >= 2500) genEverAbove2500 = true;
    return hasMk3() && genEverAbove2500;
  };
  // Whitmore Hall — same latch/counter as the 2.5 MW suburb gate, later threshold.
  let genEverAbove5000 = false;
  const hasMk3Grid5000 = () => {
    if (PowerNetwork.stats.totalGenerated >= 5000) genEverAbove5000 = true;
    return hasMk3() && genEverAbove5000;
  };

  // Starhaven Launch Complex — latched the same way, at 20 MW generated.
  let genEverAbove20000 = false;
  const hasGrid20000 = () => {
    if (PowerNetwork.stats.totalGenerated >= 20000) genEverAbove20000 = true;
    return genEverAbove20000;
  };

  // Late MK3: the Aquarium wants a dam (reservoir water) and a turbine bank;
  // the Convention Centre waits for a reactor plus the turbines behind it.
  const hasMk3Aquarium   = () => hasMk3Dam() && hasMk3Turbines();
  const hasMk3Convention = () => hasMk3Reactor() && hasMk3Turbines();

  // ── MK4-era gate ───────────────────────────────────────────────────
  const hasMk4 = () => typeof Progression !== 'undefined' && Progression.isUnlocked(T.MK4RESEARCH);
  // MK4 → endgame milestones for the late landmark buildings.
  const hasMk4AdvReactor = () => hasMk4() && EntityRegistry.getByType(T.ADVREACTOR).size > 0;
  const hasFusionReactor = () => hasMk4() && EntityRegistry.getByType(T.HULKINGFUSIONREACTOR).size > 0;
  const hasMeridianDone  = () => typeof NationalProject !== 'undefined' && NationalProject.reached('complete');
  const hasMhdRing       = () => hasMk4() && EntityRegistry.getByType(T.MHDRING).size > 0;
  // Post-Hyperion second wave: latched like the other generation gates, at
  // 40 MW generated, so a finished run keeps getting new customers after the
  // first post-endgame arrivals instead of all of them landing at once.
  let genEverAbove40000 = false;
  const hasPostMeridian40 = () => {
    if (PowerNetwork.stats.totalGenerated >= 40000) genEverAbove40000 = true;
    return hasMeridianDone() && genEverAbove40000;
  };

  // ── Post-MK2 gates ─────────────────────────────────────────────────
  // Same shape as the MK3 gates: Research Station MK2 first, then a
  // milestone along the coal/oil tree for each property.
  const hasMk2           = () => typeof Progression !== 'undefined' && Progression.isUnlocked(T.RESEARCH2);
  const hasMk2CoalGen    = () => hasMk2() && hasCoalGen();
  const hasMk2CoalMine   = () => hasMk2() && (EntityRegistry.getByType(T.COALMINE).size + EntityRegistry.getByType(T.COALMINE2).size) > 0;
  const hasMk2PumpJack   = () => hasMk2() && (EntityRegistry.getByType(T.PUMPJACK).size + EntityRegistry.getByType(T.PUMPJACK2).size) > 0;
  const hasMk2FuelOil    = () => hasMk2() && typeof OilSystem !== 'undefined' && OilSystem.getTotalFuelOil() > 0;
  const hasMk2GasStation = () => hasMk2() && EntityRegistry.getByType(T.GASSTATION).size > 0;

  // ── Civic zoning (schools, sheriff's offices) ──────────────────────
  // A neighbourhood only ever supports so many schools or sheriff's offices,
  // so each residential zone is capped per subtype. Counted by geometric containment in the zone rect rather
  // than a stored zone index: rects get merged/split/renumbered whenever
  // ZoneSystem recomputes them, and a stale index would let the cap leak.
  // Same reasoning as countParkTypeInZone in park_request_system.js.
  // The three Maple-Court-era apartment blocks and the three Harrington-era
  // condos ride the same cap: each one appears at most once per neighbourhood.
  // So do the three MK2-era apartment blocks.
  const CIVIC_PER_ZONE = { school: 2, sheriff: 1, birchwood: 1, foundry: 1, willowbank: 1,
                           lumiere: 1, ashford: 1, cedarpoint: 1,
                           pemberton: 1, linden: 1, rialto: 1,
                           cornerstore: 2 };   // a shop at each end of the neighbourhood
  const ZONE_JOIN_DIST   = 10;   // mirrors ZoneSystem's NEW_ZONE_DIST
  function _civicInRect(rect, sub) {
    let n = 0;
    for (const e of EntityRegistry.getByType(T.HOUSE)) {
      if (e.commercialSubtype !== sub) continue;
      if (e.col < rect.minC || e.col > rect.maxC || e.row < rect.minR || e.row > rect.maxR) continue;
      n++;
    }
    // Corner stores from older saves are the park-era entity type
    // (T.CORNERSTORE, see park_request_system.js); they fill the same cap.
    if (sub === 'cornerstore') {
      for (const e of EntityRegistry.getByType(T.CORNERSTORE)) {
        if (e.col < rect.minC || e.col > rect.maxC || e.row < rect.minR || e.row > rect.maxR) continue;
        n++;
      }
    }
    return n;
  }
  // A candidate site is refused when it would join a residential zone that is
  // already at its cap — "join" meaning inside the rect or within the same
  // distance ZoneSystem uses to merge a new building into an existing zone.
  // A site far from every zone starts a new one, so it's always allowed.
  function _civicSiteAllowed(loc, fp, sub) {
    if (!loc) return false;
    const rects = ZoneSystem.getZoneRects?.('residential') || [];
    const fw = (fp && fp.width) || 1, fh = (fp && fp.height) || 1;
    for (const rect of rects) {
      const dc = Math.max(0, rect.minC - (loc.col + fw - 1), loc.col - rect.maxC);
      const dr = Math.max(0, rect.minR - (loc.row + fh - 1), loc.row - rect.maxR);
      if (dc + dr > ZONE_JOIN_DIST) continue;              // wouldn't join this zone
      if (_civicInRect(rect, sub) >= CIVIC_PER_ZONE[sub]) return false;
    }
    return true;
  }
  // Offer a civic subtype only while at least one existing residential zone
  // still has room (or there are no zones yet, in which case any site starts one).
  const civicWanted = (sub) => {
    const rects = ZoneSystem.getZoneRects?.('residential') || [];
    return !rects.length || rects.some(r => _civicInRect(r, sub) < CIVIC_PER_ZONE[sub]);
  };

  // A corner store wants enough doorsteps to keep it going: offered only
  // while some residential zone has CORNER_STORE_MIN_HOMES homes and room
  // under the cap.
  const CORNER_STORE_MIN_HOMES = 6;
  const cornerStoreWanted = () => {
    const rects = ZoneSystem.getZoneRects?.('residential') || [];
    return rects.some(rect => {
      if (_civicInRect(rect, 'cornerstore') >= CIVIC_PER_ZONE.cornerstore) return false;
      let homes = 0;
      for (const e of EntityRegistry.getByType(T.HOUSE)) {
        if (!e.fromRequest || e.commercialSubtype === 'cornerstore') continue;
        if (e.col < rect.minC || e.col > rect.maxC || e.row < rect.minR || e.row > rect.maxR) continue;
        if (++homes >= CORNER_STORE_MIN_HOMES) return true;
      }
      return false;
    });
  };
  // Every store is somebody's business, with a name no other store on the
  // map is using (the sign, the request card and the info panel all show it).
  function _freshStoreName() {
    const used = new Set();
    for (const e of EntityRegistry.getByType(T.HOUSE)) if (e.commercialSubtype === 'cornerstore') used.add(e.businessName);
    for (const e of EntityRegistry.getByType(T.CORNERSTORE)) used.add(e.businessName);
    const free = CORNER_STORE_NAMES.filter(n => !used.has(n));
    const from = free.length ? free : CORNER_STORE_NAMES;
    return from[Math.floor(Math.random() * from.length)];
  }

  const _rareAccepted = new Set();  // tracks which rare subtypes have been accepted
  const _rareMissStreak = {};       // subtype -> consecutive house spawns skipped since unlock
  const RARE_PITY = 12;             // guarantee a rare type within this many spawns of being eligible

  // Pity selection, shared by all three pools. Only the residential spawner
  // had this; commercial and industrial used a flat weight, so their rare
  // entries sat at their base odds forever — a Grand Hotel is weight 3 out of
  // ~155, i.e. about 1 commercial request in 52, with nothing pulling it in.
  // A player could clear the whole mid-game without ever being offered one.
  // The loadState comment below already claimed the "guaranteed within
  // RARE_PITY misses" promise covered "any rare commercial/industrial type";
  // it didn't, and this is what makes that true.
  //
  // `eligible` is the already-unlock-filtered pool. `exclude` drops the
  // previous subtype so the caller's no-repeats rule still applies — but a
  // type that is due on pity is never excluded, or a two-entry pool could
  // starve it forever.
  //
  // `fresh`, when given, is the subset the weighted draw is made from (see
  // _freshFirst): the types not yet seen this time round. Pity keeps to it
  // too, so a rare type the player turned down waits its turn like the rest.
  function _pickWithPity(eligible, exclude = null, fresh = null) {
    if (!eligible.length) return null;
    const duePity = eligible.find(x => x.rare && !_rareAccepted.has(x.subtype) &&
      (_rareMissStreak[x.subtype] || 0) >= RARE_PITY && (!fresh || !fresh.length || fresh.includes(x)));
    let chosen;
    if (duePity) {
      chosen = duePity;
    } else {
      const weighted = [];
      for (const x of (fresh && fresh.length ? fresh : eligible)) {
        if (exclude && x.subtype === exclude && eligible.length > 1) continue;
        let w;
        if (x.rare && _rareAccepted.has(x.subtype)) w = 1;
        else if (x.rare) w = (x.weight || 10) + (_rareMissStreak[x.subtype] || 0) * 2;
        else w = x.weight || 10;
        for (let n = 0; n < w; n++) weighted.push(x);
      }
      if (!weighted.length) weighted.push(...eligible);
      chosen = weighted[Math.floor(Math.random() * weighted.length)];
    }
    // Every eligible-but-unpicked rare type builds pity.
    for (const x of eligible) {
      if (!x.rare || _rareAccepted.has(x.subtype)) continue;
      _rareMissStreak[x.subtype] = (x === chosen) ? 0 : (_rareMissStreak[x.subtype] || 0) + 1;
    }
    return chosen;
  }

  const INDUSTRIAL_POOL = [
    { name: 'Steel Foundry',          subtype: 'steelfoundry',    upfront: 25500, fee: 35, minDraw: 15, peakDraw: 40, desc: '15–40 kW: heavy furnace cycles',          weight: 10 },
    { name: 'Logistics Depot',        subtype: 'coldstorage',upfront: 32250, fee: 27, minDraw: 17, peakDraw: 28, desc: '17–28 kW: refrigeration + dock activity',        weight: 10 },
    { name: 'Solvent Works',          subtype: 'chemical',    upfront: 29500, fee: 40, peakDraw: 38, desc: '38 kW daytime: evening shutdown',                  weight: 10 },
    { name: 'Data Farm',              subtype: 'datacenter', upfront: 33500, fee: 44, minDraw: 24, peakDraw: 40, desc: '24–40 kW: zero-tolerance blackouts',            weight: 10 },
    { name: 'Bottling Plant',         subtype: 'bottling',    upfront: 18750, fee: 26, peakDraw: 30, idleDraw: 18, desc: '30 kW day shift · 18 kW overnight',   weight: 10 },
    { name: 'Manufacturing Co',       subtype: 'factory',     upfront: 21000, fee: 22, peakDraw: 30, desc: '30 kW daytime only · off at night',                  weight: 10 },
    { name: 'Cold Chain Warehouse',   subtype: 'coldchain',  upfront: 38000, fee: 48, minDraw: 27, peakDraw: 45, desc: '27–45 kW: large-scale cold storage',           weight: 3, unlock: hasCoalGen,                         rare: true },
    { name: 'Water Treatment Plant',  subtype: 'watertreat', upfront: 35000, fee: 48, minDraw: 30, peakDraw: 50, desc: '30–50 kW: municipal water infrastructure',      weight: 3, unlock: hasHydroGen,                        rare: true },
    { name: 'EV Battery Factory',     subtype: 'evfactory',  upfront: 42000, fee: 50, peakDraw: 60, desc: '60 kW daytime: high-voltage manufacturing',       weight: 2, unlock: hasCoalGen, rare: true },
    { name: 'Server Farm',            subtype: 'serverfarm', upfront: 50000, fee: 65, minDraw: 60, peakDraw: 110, desc: '60–110 kW: zero tolerance for outages',         weight: 2, unlock: hasCoalGen,                         rare: true },
    { name: 'Textile Mill',           subtype: 'textilemill',    upfront: 16000, fee: 24, peakDraw: 12, desc: '12 kW daytime: spinning & weaving looms',              weight: 10 },
    { name: 'Recycling Plant',        subtype: 'recyclingplant', upfront: 23000, fee: 32, peakDraw: 20, desc: '20 kW base: spikes to 42 kW during sorting bursts',      weight: 10, spike: { base: 20, peak: 42, freqMin: 35, freqMax: 65, durMin: 10, durMax: 16 } },
    { name: 'Aluminum Smelter',       subtype: 'aluminumsmelter', upfront: 34000, fee: 46, minDraw: 48, peakDraw: 58, desc: '48–58 kW constant: smelting can\'t tolerate cycling', weight: 10 },
    // ── MK3-era (all require Research Station MK3) — heavier than anything before it ──
    { name: 'Fertilizer Works',       subtype: 'fertilizer', upfront: 52000, fee: 62, minDraw: 97,  peakDraw: 131,  desc: '97–131 kW: continuous chemical process',        weight: 4, unlock: hasSulfurWorks, rare: true },
    { name: 'Isotope Research Lab',   subtype: 'isotopelab', upfront: 70000, fee: 88, minDraw: 151, peakDraw: 180, desc: '151–180 kW: zero tolerance for outages',        weight: 3, unlock: hasFuelRods,    rare: true },
    { name: 'Crypto Mine',            subtype: 'cryptomine', upfront: 45000, fee: 58, minDraw: 55,  peakDraw: 221, desc: '55–221 kW: soaks up your spare generation',     weight: 4, unlock: hasMk3BigGen,   rare: true },
    { name: 'Precision Machine Shop', subtype: 'machineshop',  upfront: 40000, fee: 50,  peakDraw: 83,  desc: '83 kW base · spikes to 151 kW on machining runs', weight: 4, unlock: hasMk3,         rare: true },
    { name: 'Fish Hatchery',          subtype: 'fishhatchery', upfront: 44000, fee: 54,  minDraw: 22,  peakDraw: 28,  desc: '22–28 kW: pumps run around the clock',  weight: 4, unlock: hasMk3Dam,      rare: true },
    { name: 'Semiconductor Fab',      subtype: 'semifab',      upfront: 90000, fee: 110, minDraw: 193, peakDraw: 234, desc: '193–234 kW: a blackout scraps the batch ($20,000 fine)', weight: 3, unlock: hasMk3Turbines, rare: true },
    // ── MK4-era ── (fees cut 40% to squeeze mid-game income; see mk4Fee)
    { name: 'Seaspray Desalination Megaplant', subtype: 'desal', upfront: 320000, fee: 205, minDraw: 400, peakDraw: 600, desc: '400–600 kW: reverse-osmosis pumps run flat out day and night', weight: 3, unlock: hasMhdRing, rare: true },
    { name: 'Cryon Superconductor Works', subtype: 'supercon', upfront: 300000, fee: 190, minDraw: 300, peakDraw: 450, desc: '300–450 kW: liquid-helium cryogenics run around the clock', weight: 3, unlock: hasFusionReactor, rare: true },
    { name: 'AI Computing Center',    subtype: 'aicompute',    upfront: 240000, fee: 155, minDraw: 420, peakDraw: 700, desc: '420–700 kW flat out, day and night; a blackout crashes the training run ($60,000 fine)', weight: 3, unlock: hasMk4, rare: true },
    { name: 'Skyharvest Vertical Farm', subtype: 'verticalfarm', upfront: 190000, fee: 125, minDraw: 150, peakDraw: 320, desc: '150–320 kW: racks of LED grow lights run through the night', weight: 3, unlock: hasMk4, rare: true },
    { name: 'Helix Gene Foundry',     subtype: 'geneworks',    upfront: 240000, fee: 155, minDraw: 250, peakDraw: 380, desc: '250–380 kW: bioreactors and sequencers never stop; a blackout ruins the cultures', weight: 3, unlock: hasMk4AdvReactor, rare: true },
    { name: 'Hyperion Particle Collider', subtype: 'collider', upfront: 700000, fee: 440, minDraw: 800, peakDraw: 1500, desc: '800 kW–1.5 MW: superconducting ring magnets ramp for every beam fill', weight: 2, unlock: hasMeridianDone, rare: true },
    // ── Post-Hyperion ──
    { name: 'Skyscrub Carbon Refinery', subtype: 'carbonrefinery', upfront: 450000, fee: 280, minDraw: 500, peakDraw: 900, desc: '500–900 kW: fan walls pull CO₂ from the air and turn it into synthetic fuel', weight: 3, unlock: hasMeridianDone, rare: true },
    { name: 'Skyline Mass Driver',     subtype: 'massdriver',   upfront: 800000, fee: 500, minDraw: 700, peakDraw: 2200, desc: '700 kW–2.2 MW: capacitor banks charge for every cargo launch up the rail', weight: 2, unlock: hasMeridianDone, rare: true },
    { name: 'Penning Antimatter Works', subtype: 'antimatter',  upfront: 1100000, fee: 690, minDraw: 1400, peakDraw: 2000, desc: '1.4–2 MW: magnetic traps hold the antimatter, and they can never go dark', weight: 2, unlock: hasPostMeridian40, rare: true },
    // ── 20 MW generated ──
    { name: 'Starhaven Launch Complex', subtype: 'spaceport', upfront: 320000, fee: 340, minDraw: 450, peakDraw: 900, desc: '450–900 kW around the clock · launch counts surge to 12.6 MW; propellant plant, VAB and launch pad', weight: 3, unlock: () => false, rare: true },   // no longer offered: Starhaven is a national building now (GovernmentSystem, T.LAUNCHCOMPLEX). Kept for the cities that already have one.
    // ── Post-MK2 (require Research Station MK2) ──
    // Early: a day-shift sawmill — no minDraw, so it's off overnight.
    { name: 'Ridgeline Sawmill',       subtype: 'sawmill',    upfront: 18000, fee: 24, peakDraw: 22, desc: '22 kW day shift 07:00–19:00; head saw, blowers and kilns', weight: 8 },
    // Post-MK2: a glass furnace is never let go cold, so it runs 24/7.
    { name: 'Crystal Bay Glassworks',  subtype: 'glassworks', upfront: 34000, fee: 42, minDraw: 40, peakDraw: 55, desc: '40–55 kW: the furnace never goes cold', weight: 4, unlock: hasMk2, rare: true },
    // MK3 + hydro: a pulp and paper mill, continuous process.
    { name: 'Riverbend Paper Mill',    subtype: 'papermill',  upfront: 58000, fee: 70, minDraw: 97, peakDraw: 138, desc: '97–138 kW: pulping and the paper machine run around the clock', weight: 3, unlock: hasMk3Hydro, rare: true },
    // Mid-MK2: a municipal waste site once the oilfield is pumping. Compactors,
    // leachate pumps and the flare blower never stop; the tipping hall's
    // conveyors and fans add the daytime top end.
    { name: 'Tri-County Waste Disposal', subtype: 'wastefacility', upfront: 28000, fee: 36, minDraw: 25, peakDraw: 45, desc: '25–45 kW: compactors, pumps and the gas flare run around the clock', weight: 4, unlock: hasMk2PumpJack, rare: true },
    { name: 'Brick Works',            subtype: 'brickworks',   upfront: 30000, fee: 38,  minDraw: 45,  peakDraw: 60,  desc: '45–60 kW: kilns fire around the clock',  weight: 4, unlock: hasMk2CoalGen,  rare: true },
    { name: 'Plastics Plant',         subtype: 'plastics',     upfront: 36000, fee: 45,  minDraw: 55,  peakDraw: 75,  desc: '55–75 kW: polymer reactors and extruders', weight: 4, unlock: hasMk2FuelOil,  rare: true },
  ];

  const COMMERCIAL_POOL = [
    { name: 'Downtown Café',    subtype: 'cafe',        upfront: 10500, fee: 12,  peakDraw: 8,  desc: '8 kW day · 4 kW eve · off at night',           weight: 10 },
    { name: 'Tech Office',      subtype: 'office',      upfront: 16500, fee: 16,  peakDraw: 12, desc: '12 kW office hours only',                      weight: 10 },
    { name: 'City Clinic',      subtype: 'clinic',      upfront: 13500, fee: 15,  minDraw: 6,  peakDraw: 10, desc: '6–10 kW: cannot go dark',                    weight: 10 },
    { name: 'Grocery Store',    subtype: 'grocery',     upfront: 11250, fee: 15,  peakDraw: 20, desc: '5 kW day · 20 kW evening peak',                  weight: 10 },
    { name: 'Cold Storage',     subtype: 'coldstorage', upfront: 18000, fee: 20,  minDraw: 9,  peakDraw: 15, desc: '9–15 kW: refrigeration cycling',              weight: 10 },
    { name: 'Data Center',      subtype: 'datacenter',  upfront: 24000, fee: 26,  minDraw: 22, peakDraw: 28, desc: '22–28 kW: zero tolerance',                   weight: 10 },
    { name: 'Starlite Motor Inn', subtype: 'motel',   upfront: 9000,  fee: 12,  peakDraw: 10, desc: '10 kW evenings and overnight · 3 kW midday', weight: 8 },
    { name: 'The Harbourside',  subtype: 'boutiquehotel', upfront: 22000, fee: 27, peakDraw: 20, desc: '20 kW evening peak with the rooftop bar · 8 kW daytime', weight: 3, unlock: hasBigGrid, rare: true },
    { name: 'Grand Hotel',      subtype: 'hotel',       upfront: 24000, fee: 30,  peakDraw: 28, desc: '28 kW night peak · 10 kW daytime',               weight: 3, unlock: hasBigGrid,  rare: true },
    { name: 'Shopping Mall',    subtype: 'mall',        upfront: 32000, fee: 38,  peakDraw: 45, desc: '45 kW evening peak · 15 kW daytime',             weight: 2, unlock: hasBigGrid,  rare: true },
    { name: 'Aurora Galleria',  subtype: 'galleria',    upfront: 36000, fee: 42,  minDraw: 4, peakDraw: 50, desc: '50 kW evening peak · 22–32 kW daytime · façade lit all night', weight: 2, unlock: hasBigGrid,  rare: true },
    { name: 'The Grand Arcade', subtype: 'arcade',      upfront: 28000, fee: 34,  minDraw: 3, peakDraw: 34, desc: '34 kW through the afternoon · open 08:00–20:00', weight: 2, unlock: hasBigGrid,  rare: true },
    { name: 'The Picture House', subtype: 'movietheater', upfront: 26000, fee: 32, peakDraw: 26, desc: '26 kW evening screenings · 10 kW matinees · dark 01:00–11:00', weight: 6, unlock: hasBigGrid },
    { name: 'Concert Venue',    subtype: 'venue',       upfront: 28000, fee: 34,  peakDraw: 50, desc: '50 kW evening spike · near zero by day',       weight: 2, unlock: hasHydroGen, rare: true },
    { name: 'Bistro Restaurant', subtype: 'restaurant', upfront: 7600,  fee: 19,  peakDraw: 6,  desc: '6 kW base · spikes to 15 kW during rush',       weight: 10, spike: { base: 6,  peak: 15, freqMin: 45, freqMax: 75, durMin: 12, durMax: 18 } },
    { name: 'Zap Burger', subtype: 'fastfood',   upfront: 6400,  fee: 16,  peakDraw: 4.5, desc: '4.5 kW base · spikes to 15.75 kW during rush', weight: 10, spike: { base: 4.5, peak: 15.75, freqMin: 30, freqMax: 60, durMin: 8,  durMax: 12 } },
    // Three more novelty drive-ins on the same footing as Zap Burger; each a
    // little rarer so fast food doesn't crowd out the rest of the pool.
    { name: 'Dynamo Donuts', subtype: 'donutshop', upfront: 5800, fee: 14, peakDraw: 12, desc: '3 kW base · fryer batches spike to 12 kW · open 05:00–14:00', weight: 6, spike: { base: 3, peak: 12, freqMin: 40, freqMax: 70, durMin: 8, durMax: 14 } },
    { name: 'Coil Dog',      subtype: 'hotdog',    upfront: 5200, fee: 13, peakDraw: 11, desc: '3.5 kW base · spikes to 11 kW in the late-night rush · open 11:00–03:00', weight: 6, spike: { base: 3.5, peak: 11, freqMin: 35, freqMax: 65, durMin: 6, durMax: 10 } },
    { name: 'Ohm Slice Pizza', subtype: 'pizzeria', upfront: 7000, fee: 17, peakDraw: 14, desc: '6 kW base · spikes to 14 kW at dinner · ovens kept warm overnight', weight: 6, spike: { base: 6, peak: 14, freqMin: 45, freqMax: 75, durMin: 10, durMax: 16 } },
    { name: 'Co-working Space', subtype: 'coworking',  upfront: 8400,  fee: 21,  peakDraw: 13, desc: '13 kW base · spikes to 20 kW during rush',      weight: 10, spike: { base: 13, peak: 20, freqMin: 60, freqMax: 90, durMin: 15, durMax: 25 } },
    { name: 'Fitness Gym',     subtype: 'gym',         upfront: 7200,  fee: 18,  peakDraw: 7,  desc: '7 kW base · spikes to 22 kW during rush',       weight: 10, spike: { base: 7,  peak: 22, freqMin: 40, freqMax: 70, durMin: 10, durMax: 15 } },
    { name: 'Corner Pharmacy', subtype: 'pharmacy',    upfront: 9800,  fee: 14,  minDraw: 5,  peakDraw: 9,  desc: '5–9 kW: essential, cannot go dark',           weight: 10 },
    { name: 'The Kakery',      subtype: 'kakery',      upfront: 8200,  fee: 14,  peakDraw: 11, desc: '11 kW morning bake · 7 kW day · 2 kW fridges overnight', weight: 10 },
    { name: 'Sunrise Bakery',  subtype: 'bakery',      upfront: 7000,  fee: 13,  peakDraw: 6,  desc: '2 kW base · spikes to 13 kW during morning bake', weight: 10, spike: { base: 2,  peak: 13, freqMin: 50, freqMax: 80, durMin: 10, durMax: 16 } },
    { name: 'First Trust Bank', subtype: 'bank',       upfront: 19000, fee: 24,  peakDraw: 18, desc: '18 kW business hours only · off at night',     weight: 8 },
    { name: 'Cornerstone Savings & Loan', subtype: 'savingsloan', upfront: 9500, fee: 13, peakDraw: 9, desc: '9 kW 09:00–17:00 · 1 kW after hours', weight: 8 },
    { name: 'Harbor & Whitlock Law Offices', subtype: 'lawoffice', upfront: 12500, fee: 17, peakDraw: 10, desc: '10 kW office hours · 5 kW working late · 2 kW overnight', weight: 8 },
    { name: 'Ace Auto Repair', subtype: 'autorepair',  upfront: 11500, fee: 17,  peakDraw: 14, desc: '6 kW base · spikes to 32 kW mid-job',            weight: 10, spike: { base: 6,  peak: 32, freqMin: 35, freqMax: 65, durMin: 10, durMax: 18 } },
    // ── MK3-era (all require Research Station MK3) — heavier than anything before it ──
    // Early MK3: open as soon as the MK3 Research Station is up. The club fills
    // the small hours after the evening peaks; the library a flat working day.
    { name: 'Club Voltage',       subtype: 'nightclub',     upfront: 30000, fee: 36, peakDraw: 49,  desc: '49 kW after midnight · open 22:00–04:00 · 4.2 kW by day', weight: 5, unlock: hasMk3,      rare: true },
    { name: 'The Blue Note',      subtype: 'jazzbar',       upfront: 9000,  fee: 13, peakDraw: 12,  desc: '12 kW for live sets 20:00–02:00 · 1 kW by day', weight: 6, unlock: hasMk2 },
    { name: 'The Mirrorball',     subtype: 'disco',         upfront: 25000, fee: 29, peakDraw: 38,  desc: '38 kW on the dance floor 21:00–03:00 · 2.8 kW by day', weight: 5, unlock: hasMk3,      rare: true },
    { name: 'Pulse',              subtype: 'superclub',     upfront: 80000, fee: 88, minDraw: 12, peakDraw: 151, desc: '151 kW midnight–04:00 · open 22:00–05:00 · 12 kW by day', weight: 3, unlock: hasMk3Grid5000, rare: true },
    { name: 'Azure Bay Resort',   subtype: 'resorthotel',  upfront: 56000, fee: 66, minDraw: 25, peakDraw: 76, desc: '76 kW evenings · pool pumps and lighting · 25 kW overnight', weight: 3, unlock: hasMk3, rare: true },
    { name: 'Sterling Reserve Bank', subtype: 'reservebank', upfront: 40000, fee: 48, minDraw: 17, peakDraw: 44, desc: '44 kW business hours · 17 kW vault security overnight', weight: 4, unlock: hasMk3, rare: true },
    { name: 'Ashby Public Library', subtype: 'library',     upfront: 24000, fee: 28, peakDraw: 19,  desc: '19 kW steady while open 09:00–20:00 · 4.2 kW after hours', weight: 5, unlock: hasMk3,      rare: true },
    { name: 'Science Museum',     subtype: 'sciencemuseum', upfront: 38000, fee: 44, peakDraw: 97,  desc: '76–97 kW while open · 11 kW after hours',           weight: 4, unlock: hasMk3,      rare: true },
    { name: 'Marina & Boat Club', subtype: 'marina',        upfront: 42000, fee: 48, peakDraw: 35,  desc: '35 kW evening peak · 17–24 kW daytime',            weight: 4, unlock: hasMk3Dam,   rare: true },
    { name: 'Splash Kingdom Water Park', subtype: 'waterpark', upfront: 52000, fee: 62, peakDraw: 90, desc: '90 kW by day; wave, slide and river pumps · open 10:00–19:00 · closes in rain', weight: 3, unlock: hasMk3Dam, rare: true },
    { name: 'Thunder Ridge Adventure Park', subtype: 'thunderridge', upfront: 85000, fee: 96, peakDraw: 234, desc: '151 kW by day · 234 kW evenings to midnight · rides close in rain', weight: 3, unlock: hasMk3Grid5000, rare: true },
    { name: 'Amusement Park',     subtype: 'amusementpark', upfront: 60000, fee: 72, peakDraw: 166, desc: '166 kW evening light show · rides close in rain', weight: 3, unlock: hasMk3Hydro, rare: true },
    // Mid MK3 — arrives once the fuel plant has made its first rods.
    { name: 'Threadline Outfitters',   subtype: 'clothing',  upfront: 34000, fee: 42, peakDraw: 36, desc: '25 kW by day · 36 kW evening rush 17:00–21:00 · 4.2 kW after hours', weight: 4, unlock: hasFuelRods, rare: true },
    { name: 'Pharma Lab',            subtype: 'pharmalab', upfront: 46000, fee: 56, minDraw: 31, peakDraw: 42,  desc: '31–42 kW: cold chain, cannot go dark',             weight: 4, unlock: hasSulfurWorks, rare: true },
    { name: 'Radiology Hospital Wing', subtype: 'radiology', upfront: 58000, fee: 68, peakDraw: 83,               desc: '83 kW always on · MRI scans spike to 151 kW',         weight: 4, unlock: hasFuelRods,    rare: true },
    { name: 'Summit Tower',            subtype: 'summit',    upfront: 62000, fee: 72, minDraw: 19, peakDraw: 66, desc: '66 kW through the working day · 19 kW overnight', weight: 3, unlock: hasMk3Reactor, rare: true },
    { name: 'Stadium',                 subtype: 'stadium',   upfront: 75000, fee: 85, minDraw: 20, peakDraw: 248, desc: '20 kW idle · 248 kW on event nights (every 3rd day); matches, concerts, wrestling', weight: 3, unlock: hasMk3Reactor,  rare: true },
    // Late MK3 — wait for the steam turbine bank / a 2.5 MW grid
    { name: 'Apex Motors Dealership',  subtype: 'cardealer',  upfront: 48000, fee: 58, minDraw: 17, peakDraw: 55, desc: '30 kW showroom by day · 55 kW floodlit lot at night', weight: 4, unlock: hasMk3Turbines, rare: true },
    { name: 'Le Grand Salon',          subtype: 'finedining', upfront: 52000, fee: 64, peakDraw: 76, desc: '20 kW prep by day · 76 kW dinner service 18:00–23:00', weight: 4, unlock: hasMk3Grid2500, rare: true },
    { name: 'The Gold Room',           subtype: 'supperclub', upfront: 48000, fee: 60, peakDraw: 66, desc: '5.5 kW idle by day · 66 kW supper service 21:00–02:00', weight: 4, unlock: hasMk3Grid5000, rare: true },
    { name: 'Tidewater Aquarium',      subtype: 'aquarium',   upfront: 56000, fee: 66, minDraw: 48, peakDraw: 68, desc: '48 kW life support 24/7 · 68 kW open; a blackout kills stock ($15,000 fine)', weight: 4, unlock: hasMk3Aquarium, rare: true },
    { name: 'Grand Convention Centre', subtype: 'convention', upfront: 68000, fee: 78, minDraw: 17, peakDraw: 208, desc: '17 kW idle · 208 kW on expo days (every 4th day, 09:00–18:00)', weight: 3, unlock: hasMk3Convention, rare: true },
    // ── MK4-era ── (fees cut 40% to squeeze mid-game income; see mk4Fee)
    { name: 'Nexus Holo-Arena',        subtype: 'holoarena', upfront: 280000, fee: 180, peakDraw: 280, desc: '70 kW by day · 280 kW for the 19:00–23:00 hologram show', weight: 3, unlock: hasFusionReactor, rare: true },
    { name: 'Quantum Exchange',        subtype: 'quantumx',  upfront: 260000, fee: 170, minDraw: 180, peakDraw: 260, desc: '180–260 kW: the quantum computers never sleep', weight: 3, unlock: hasMk4AdvReactor, rare: true },
    { name: 'Hyperion Space Elevator', subtype: 'spaceelevator', upfront: 600000, fee: 370, minDraw: 600, peakDraw: 1200, desc: '600 kW always · 1.2 MW for an hour every six hours as a climber launches', weight: 3, unlock: hasMeridianDone, rare: true },
    { name: 'Hyperion Spire',          subtype: 'megatower',  upfront: 220000, fee: 145, minDraw: 120, peakDraw: 320, desc: '120–320 kW: a supertall that never sleeps', weight: 3, unlock: hasMk4, rare: true },
    { name: 'Skyline Maglev Terminal', subtype: 'maglev',     upfront: 260000, fee: 170, minDraw: 90, peakDraw: 340, desc: '90–340 kW: commuter rush peaks at 05:00–09:00 and 16:00–20:00', weight: 3, unlock: hasFusionReactor, rare: true },
    { name: 'Aurora Sky Casino',       subtype: 'skycasino',  upfront: 310000, fee: 200, minDraw: 160, peakDraw: 430, desc: '160 kW by day · 430 kW on the night floor, 18:00–03:00', weight: 3, unlock: hasMeridianDone, rare: true },
    // ── Post-Hyperion ──
    { name: 'Hyperion World Expo',     subtype: 'worldexpo',   upfront: 420000, fee: 265, minDraw: 140, peakDraw: 520, desc: '140 kW overnight · 260 kW open 09:00–20:00 · 520 kW for the 20:00–23:00 light show', weight: 3, unlock: hasMeridianDone, rare: true },
    { name: 'Zenith Observatory & Planetarium', subtype: 'planetarium', upfront: 240000, fee: 155, minDraw: 60, peakDraw: 240, desc: '60 kW by day · 240 kW for the dome shows and telescope, 19:00–02:00', weight: 3, unlock: hasPostMeridian40, rare: true },
    // ── Early, each with a load shape of its own: a night shift, chillers
    // that follow the weather, and a tiny draw the whole town hears go dark ──
    { name: 'The Morning Ledger',      subtype: 'newspaper', upfront: 15000, fee: 20, minDraw: 5,  peakDraw: 26, desc: '26 kW press run 22:00–04:00 · 5–10 kW newsroom by day', weight: 8 },
    { name: 'Frostline Ice Rink',      subtype: 'icerink',   upfront: 19000, fee: 24, minDraw: 14, peakDraw: 22, desc: '22 kW open 10:00–22:00 · 14 kW chillers overnight · up to 38 kW in a heatwave', weight: 6 },
    { name: 'WGRD 98.7 FM',            subtype: 'radio',     upfront: 6000,  fee: 12, minDraw: 3,  peakDraw: 5,  desc: '3–5 kW around the clock · off the air, satisfaction drops across town', weight: 6 },
    // ── Post-MK2 (require Research Station MK2) ──
    { name: 'Bowling Alley',           subtype: 'bowling',   upfront: 22000, fee: 26, peakDraw: 24, desc: '24 kW evening peak · open 11:00–23:00',  weight: 4, unlock: hasMk2,           rare: true },
    { name: 'Beacon Call Centre',      subtype: 'callcentre', upfront: 24000, fee: 29, minDraw: 10, peakDraw: 18, desc: '16–18 kW on the day shifts · 10 kW overnight; staffed 24/7', weight: 4, unlock: hasMk2, rare: true },
    // Three more with a shape of their own: lamps that follow the sky, an
    // evening soak on geothermal ground, and a plant that runs one day in three.
    { name: 'Glasswing Nursery',       subtype: 'nursery',    upfront: 21000, fee: 26, minDraw: 4,  peakDraw: 30, desc: '30 kW of grow lamps all night · 4 kW on a clear day · up to 22 kW under heavy cloud', weight: 4, unlock: hasMk2, rare: true },
    { name: 'Emberstone Hot Springs',  subtype: 'hotsprings', upfront: 27000, fee: 32, minDraw: 8,  peakDraw: 34, desc: '34 kW evening peak 17:00–22:00 · 22 kW by day · 8 kW pumps overnight', weight: 4, unlock: () => hasMk2() && hasGeothermal(), rare: true },
    { name: 'Saltwind Cannery',        subtype: 'cannery',    upfront: 26000, fee: 30, minDraw: 10, peakDraw: 65, desc: '65 kW on canning days (every 3rd day, 06:00–18:00) · 10 kW cold store between runs', weight: 4, unlock: hasMk2, rare: true },
    { name: 'Truck Stop Diner',        subtype: 'truckstop', upfront: 18000, fee: 22, peakDraw: 7, desc: '7 kW around the clock · rushes to 14 kW', weight: 4, unlock: hasMk2GasStation, rare: true },
  ];

  // Surnames for ordinary households. FAMILY_POOL's "The ..." entries are
  // stat templates (tier, fee, upfront); the family that actually turns up
  // takes a name from here, so a city doesn't fill with the same few dozen
  // families. Special and rare entries keep their own names.
  const HOUSEHOLD_SURNAMES = [
    'Abernathys', 'Ackermans', 'Adeyemis', 'Afolabis', 'Agarwals', 'Aguilars', 'Ahmadis',
    'Albrechts', 'Alcotts', 'Aldanas', 'Alvarados', 'Amundsens', 'Anderssons', 'Antonellis',
    'Appiahs', 'Aquinos', 'Arbuckles', 'Arnauds', 'Asantes', 'Ashworths', 'Atkinsons', 'Avilas',
    'Ayodeles', 'Baptistes', 'Barroses', 'Bartoszes', 'Basus', 'Beaumonts', 'Beckers', 'Belangers',
    'Benedettis', 'Bhatts', 'Blackwoods', 'Blanchards', 'Boatengs', 'Bogdans', 'Bonnets', 'Borgeses',
    'Brennans', 'Brewsters', 'Brodskys', 'Buis', 'Calloways', 'Camaras', 'Camposes', 'Cardenases',
    'Carmichaels', 'Carvalhos', 'Castanedas', 'Chakrabortys', 'Chandras', 'Chens', 'Chos',
    'Chowdhurys', 'Ciccones', 'Clarksons', 'Colemans', 'Contrerases', 'Costas', 'Cranes', 'Cruzes',
    'Dahls', 'Daltons', 'Dangs', 'Darkos', 'Dasguptas', 'Delacroixes', 'Delgados', 'Demirs',
    'Desais', 'Diallos', 'Dimitrovs', 'Dobsons', 'Dominguezes', 'Donovans', 'Duboises', 'Duongs',
    'Eastwoods', 'Ebrahims', 'Eklunds', 'Elsayeds', 'Emersons', 'Engels', 'Espositos', 'Estradas',
    'Ezes', 'Fairbankses', 'Falks', 'Farouks', 'Ferreiras', 'Figueroas', 'Finches', 'Fitzgeralds',
    'Flemings', 'Fontaines', 'Forsbergs', 'Foxes', 'Francoises', 'Friedmans', 'Fujimotos',
    'Gallaghers', 'Gallos', 'Gangulys', 'Gathiis', 'Gellers', 'Ghoshes', 'Gonzagas', 'Goodwins',
    'Gordons', 'Grecos', 'Grimaldis', 'Gunawardenas', 'Guptas', 'Haddads', 'Halvorsens', 'Hamids',
    'Hartleys', 'Haugens', 'Hawthornes', 'Hellers', 'Hernandezes', 'Hoangs', 'Holloways', 'Horvaths',
    'Hosseinis', 'Huangs', 'Hugheses', 'Ibarras', 'Iqbals', 'Ishikawas', 'Ivanovas', 'Jaramillos',
    'Jensens', 'Jimenezes', 'Joshis', 'Kaczmareks', 'Kagames', 'Kamaus', 'Kapoors', 'Karlssons',
    'Kaufmans', 'Kawasakis', 'Kellers', 'Khalils', 'Khans', 'Kimuras', 'Kinsellas', 'Kipchoges',
    'Kobayashis', 'Koenigs', 'Kowalczyks', 'Krugers', 'Kumars', 'Lachances', 'Lamberts', 'Landrys',
    'Larsens', 'Laurents', 'Laus', 'Leblancs', 'Lehmanns', 'Lemieuxes', 'Leones', 'Lindgrens',
    'Lombardis', 'Lopezes', 'Lovells', 'Lozanos', 'Lundqvists', 'Macharias', 'Madsens', 'Magnussons',
    'Mahlangus', 'Maldonados', 'Mancinis', 'Marchettis', 'Marinos', 'Markovics', 'Martels', 'Masons',
    'Matsumotos', 'Mazurs', 'Mbekis', 'Medinas', 'Mehtas', 'Meyers', 'Mishras', 'Mistrys', 'Molinas',
    'Monroes', 'Montoyas', 'Moreaus', 'Morenos', 'Mukherjees', 'Mullers', 'Munozes', 'Murakamis',
    'Nakagawas', 'Navarros', 'Ndlovus', 'Nielsens', 'Nilssons', 'Novaks', 'Nowaks', 'Nunezes',
    'Obis', 'Ochoas', 'Odhiambos', 'Ogunleyes', 'Okadas', 'Okoyes', 'Oliveiras', 'Olsens',
    'Onyangos', 'Ortegas', 'Oseis', 'Owusus', 'Pachecos', 'Palmers', 'Pappases', 'Parks', 'Pereiras',
    'Perrins', 'Phams', 'Pienaars', 'Popescus', 'Prakashes', 'Quinns', 'Quinteros', 'Rahmans',
    'Ramirezes', 'Raos', 'Rasmussens', 'Reddys', 'Reyeses', 'Richters', 'Rinaldis', 'Riveras',
    'Rochas', 'Romanos', 'Rossis', 'Ruizes', 'Saitos', 'Salazars', 'Santiagos', 'Santoses', 'Satos',
    'Schmidts', 'Schneiders', 'Sens', 'Serranos', 'Shapiros', 'Sharmas', 'Shimizus', 'Sigurdssons',
    'Singhs', 'Sokolovs', 'Solbergs', 'Sotos', 'Stavroses', 'Steiners', 'Strands', 'Suarezes',
    'Suzukis', 'Svenssons', 'Szabos', 'Tanakas', 'Tavareses', 'Teixeiras', 'Thakurs', 'Thornes',
    'Toivonens', 'Torreses', 'Trans', 'Trevinos', 'Tshabalalas', 'Uchennas', 'Uddins', 'Valdezes',
    'Vargases', 'Vasquezes', 'Vermas', 'Vidals', 'Virtanens', 'Vogels', 'Volkovs', 'Wagners',
    'Wainwrights', 'Walshes', 'Wanjirus', 'Watanabes', 'Webers', 'Whitakers', 'Wilkinsons',
    'Winters', 'Wolffs', 'Wrights', 'Xus', 'Yadavs', 'Yamamotos', 'Yangs', 'Yeboahs', 'Yildizes',
    'Yoshidas', 'Zamoras', 'Zapatas', 'Zhangs', 'Zaragozas','Zimmermanns', 'Zulus',
  ];
  const _recentFamilyNames = [];   // offered lately, so they don't come round again too soon
  function _freshFamilyName() {
    const inTown = new Set();
    for (const t of [T.HOUSE, T.CABIN]) for (const e of EntityRegistry.getByType(t)) {
      if (e.familyName) inTown.add(e.familyName);
      else if (e.businessName) inTown.add(e.businessName);
    }
    for (const r of pending.concat(backlog)) if (r.family) inTown.add(r.family);
    const recent = new Set(_recentFamilyNames);
    let pool = HOUSEHOLD_SURNAMES.filter(n => !inTown.has('The ' + n) && !recent.has(n));
    if (!pool.length) pool = HOUSEHOLD_SURNAMES.filter(n => !inTown.has('The ' + n));
    if (!pool.length) pool = HOUSEHOLD_SURNAMES;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    _recentFamilyNames.push(pick);
    if (_recentFamilyNames.length > 80) _recentFamilyNames.shift();
    return 'The ' + pick;
  }

  const FAMILY_POOL = [
    // Budget tier — low demand (×0.78)
    { name: 'The Petrovs',       upfront:  5250, fee: 11, demandMult: 0.78 },
    { name: 'The Nguyens',       upfront:  5950, fee: 14, demandMult: 0.78 },
    { name: 'The Sanchezes',     upfront:  4550, fee: 8, demandMult: 0.78 },
    { name: 'The Kowalskis',     upfront:  5600, fee: 13, demandMult: 0.78 },
    { name: 'The Mwangis',       upfront:  4900, fee: 10, demandMult: 0.78 },
    { name: 'The Babics',        upfront:  4550, fee: 8, demandMult: 0.78 },
    { name: 'The Trans',         upfront:  5950, fee: 14, demandMult: 0.78 },
    { name: 'The Adebajos',      upfront:  5040, fee: 10, demandMult: 0.78 },
    { name: 'The Yilmazs',       upfront:  4900, fee: 10, demandMult: 0.78 },
    { name: 'The Fernandezes',   upfront:  6650, fee: 15, demandMult: 0.78 },
    { name: 'The Okonkwos',      upfront:  5460, fee: 12, demandMult: 0.78 },
    { name: 'The Bernards',      upfront:  4760, fee: 9, demandMult: 0.78 },
    { name: 'The Silvas',        upfront:  5180, fee: 11, demandMult: 0.78 },
    { name: 'The Zhous',         upfront:  5740, fee: 13, demandMult: 0.78 },
    { name: 'The Ihejirika',     upfront:  5320, fee: 11, demandMult: 0.78 },
    { name: 'The Reinhardts',    upfront:  4830, fee: 10, demandMult: 0.78 },
    { name: 'The Rodriguezes',   upfront:  6160, fee: 15, demandMult: 0.78 },
    { name: 'The Kovačs',        upfront:  4970, fee: 10, demandMult: 0.78 },
    { name: 'The Abubakarrs',    upfront:  5110, fee: 10, demandMult: 0.78 },
    { name: 'The Mendozas',      upfront:  6300, fee: 15, demandMult: 0.78 },

    // Mid tier — standard demand (×1.11)
    { name: 'The Hendersons',    upfront: 7700, fee: 17, demandMult: 1.11 },
    { name: 'The Garcias',       upfront: 9450, fee: 21, demandMult: 1.11 },
    { name: 'The Murphys',       upfront: 7350, fee: 15, demandMult: 1.11 },
    { name: 'The Krishnamurthys',upfront: 8400, fee: 18, demandMult: 1.11 },
    { name: 'The Sullivans',     upfront: 8050, fee: 18, demandMult: 1.11 },
    { name: 'The Yamadas',       upfront: 7000, fee: 15, demandMult: 1.11 },
    { name: 'The Okafor-Smiths', upfront: 8750, fee: 19, demandMult: 1.11 },
    { name: 'The Lindqvists',    upfront: 7000, fee: 14, demandMult: 1.11 },
    { name: 'The Castellanos',   upfront: 8400, fee: 18, demandMult: 1.11 },
    { name: 'The Achebe',        upfront: 7700, fee: 17, demandMult: 1.11 },
    { name: 'The Bergmanns',     upfront: 7350, fee: 15, demandMult: 1.11 },
    { name: 'The Nkosis',        upfront:  6650, fee: 14, demandMult: 1.11 },
    { name: 'The Morozovs',      upfront: 9100, fee: 20, demandMult: 1.11 },
    { name: 'The Patels',        upfront: 7350, fee: 15, demandMult: 1.11 },
    { name: 'The Johansens',     upfront: 8750, fee: 19, demandMult: 1.11 },
    { name: 'The Oyelarans',     upfront: 7840, fee: 17, demandMult: 1.11 },
    { name: 'The Wójciks',       upfront: 7560, fee: 16, demandMult: 1.11 },
    { name: 'The Takahashis',    upfront: 8260, fee: 18, demandMult: 1.11 },
    { name: 'The Kellys',        upfront: 7140, fee: 15, demandMult: 1.11 },
    { name: 'The Diakités',      upfront: 8120, fee: 18, demandMult: 1.11 },
    { name: 'The Andreescus',    upfront: 8540, fee: 18, demandMult: 1.11 },
    { name: 'The Mbongis',       upfront: 7490, fee: 16, demandMult: 1.11 },
    { name: 'The Haddads',       upfront: 7980, fee: 17, demandMult: 1.11 },
    { name: 'The Petersons',     upfront: 9240, fee: 20, demandMult: 1.11 },
    { name: 'The Adeyemis',      upfront: 8330, fee: 18, demandMult: 1.11 },

    // Premium tier — higher demand (×1.56) — $29-35/s
    { name: 'The Okafors',       upfront: 10850, fee: 21, demandMult: 1.56 },
    { name: 'The Whitfields',    upfront: 12250, fee: 23, demandMult: 1.56 },
    { name: 'The Abramowiczes',  upfront: 10500, fee: 20, demandMult: 1.56 },
    { name: 'The Delacroix',     upfront: 12950, fee: 24, demandMult: 1.56 },
    { name: 'The Hashimotos',    upfront: 11550, fee: 22, demandMult: 1.56 },
    { name: 'The Obermeyers',    upfront: 14000, fee: 24, demandMult: 1.56 },
    { name: 'The Adesanyos',     upfront: 11200, fee: 22, demandMult: 1.56 },
    { name: 'The Vandenbergs',   upfront: 12600, fee: 23, demandMult: 1.56 },
    { name: 'The Ngozis',        upfront: 10150, fee: 20, demandMult: 1.56 },
    { name: 'The Fitzpatricks',  upfront: 11900, fee: 22, demandMult: 1.56 },
    { name: 'The Beaumonts',     upfront: 11760, fee: 22, demandMult: 1.56 },
    { name: 'The Evangelistas',  upfront: 11060, fee: 21, demandMult: 1.56 },
    { name: 'The Nakamuras',     upfront: 12040, fee: 23, demandMult: 1.56 },
    { name: 'The Hoffmanns',     upfront: 13300, fee: 24, demandMult: 1.56 },
    { name: 'The Oduyas',        upfront: 10640, fee: 20, demandMult: 1.56 },
    { name: 'The Magnussens',    upfront: 12740, fee: 24, demandMult: 1.56 },
    { name: 'The Quarteys',      upfront: 11340, fee: 22, demandMult: 1.56 },
    { name: 'The Volkovas',      upfront: 12460, fee: 23, demandMult: 1.56 },

    // Luxury tier — very high demand (×2.0) — $36-45/s — post-coal only
    { name: 'The Worthingtons',  upfront: 16800, fee: 31, demandMult: 2.0, unlock: hasCoalGen },
    { name: 'The Chakrabortys',  upfront: 15400, fee: 28, demandMult: 2.0, unlock: hasCoalGen },
    { name: 'The Vásquez-Ruizs', upfront: 16450, fee: 29, demandMult: 2.0, unlock: hasCoalGen },
    { name: 'The Alexandersons', upfront: 14350, fee: 25, demandMult: 2.0, unlock: hasCoalGen },
    { name: 'The Osei-Mensahs',  upfront: 17500, fee: 31, demandMult: 2.0, unlock: hasCoalGen },
    { name: 'The Carmichaels',   upfront: 16100, fee: 29, demandMult: 2.0, unlock: hasCoalGen },
    { name: 'The Tremaines',     upfront: 17150, fee: 30, demandMult: 2.0, unlock: hasCoalGen },
    { name: 'The Adichies',      upfront: 15050, fee: 27, demandMult: 2.0, unlock: hasCoalGen },
    { name: 'The Montagues',     upfront: 15750, fee: 27, demandMult: 2.0, unlock: hasCoalGen },
    { name: 'The Falconers',     upfront: 18200, fee: 31, demandMult: 2.0, unlock: hasCoalGen },

    // Post-coal residential — multi-unit. Weight 44 puts each at ~5% of the
    // pool once unlocked (regular houses total ~730 weight combined), vs.
    // the ~0.5-1% they'd sit at with a "normal" rare weight of 6-9.
    { name: 'Riverside Townhouses', upfront: 14000, fee: 21, demandMult: 1.56, subtype: 'townhouse', width: 6, height: 3, weight: 44, unlock: hasCoalGen,  rare: true },
    { name: 'Maple Court Apts',     upfront: 24500, fee: 34, demandMult: 1.56, subtype: 'apartment', width: 3, height: 4, weight: 44, unlock: hasBigGrid,  rare: true },
    // Maple Court's siblings on the same 750 kW gate. Kept uncommon (weight
    // 10 each, under a quarter of Maple Court's) so apartments don't crowd
    // out ordinary houses, and each is capped at one per residential zone
    // (CIVIC_PER_ZONE) — offered only while some zone still lacks one.
    { name: 'Birchwood Terrace',    upfront: 25000, fee: 35, demandMult: 1.56, subtype: 'birchwood',  width: 3, height: 4, weight: 10, unlock: () => hasBigGrid() && civicWanted('birchwood'),  rare: true },
    { name: 'The Foundry Lofts',    upfront: 24000, fee: 33, demandMult: 1.56, subtype: 'foundry',    width: 3, height: 4, weight: 10, unlock: () => hasBigGrid() && civicWanted('foundry'),    rare: true },
    { name: 'Willowbank Garden Flats', upfront: 24500, fee: 34, demandMult: 1.56, subtype: 'willowbank', width: 3, height: 4, weight: 10, unlock: () => hasBigGrid() && civicWanted('willowbank'), rare: true },
    { name: 'The Harrington',       upfront: 21000, fee: 28, demandMult: 2.0,  subtype: 'condo',     width: 3, height: 5, weight: 44, unlock: hasHydroGen, rare: true },
    // The Harrington's siblings on the same hydro gate — uncommon (weight 10)
    // and one per residential zone, like the apartment siblings below.
    { name: 'The Lumière',          upfront: 22000, fee: 29, demandMult: 2.0,  subtype: 'lumiere',    width: 3, height: 5, weight: 10, unlock: () => hasHydroGen() && civicWanted('lumiere'),    rare: true },
    { name: 'Ashford Place',        upfront: 20500, fee: 27, demandMult: 2.0,  subtype: 'ashford',    width: 3, height: 5, weight: 10, unlock: () => hasHydroGen() && civicWanted('ashford'),    rare: true },
    { name: 'Cedar Point Residences', upfront: 21500, fee: 28, demandMult: 2.0, subtype: 'cedarpoint', width: 4, height: 5, weight: 10, unlock: () => hasHydroGen() && civicWanted('cedarpoint'), rare: true },

    // Corner Store — the little shop on the corner, owner's flat upstairs.
    // Used to arrive on its own as a park (park_request_system.js); now it
    // asks to be connected like any other customer. Not `rare`: a
    // neighbourhood takes two, and an accepted rare type drops to weight 1.
    { name: 'Corner Store', upfront: 7000, fee: 9, demandMult: 1.0, subtype: 'cornerstore', width: 2, height: 2, weight: 24,
      unlock: cornerStoreWanted },

    // Post-geothermal civic. Big daytime load (see the `school` curve in
    // DemandCurves — ~18 kW base at the plateau, lifted by demandScale and the
    // staff/pupil population multiplier to roughly 35 kW early on), so a city
    // that just brought geothermal online has somewhere to put the headroom.
    // Weight 26 keeps it rarer than housing, and the per-zone cap in
    // _civicSiteAllowed stops a neighbourhood filling up with them.
    { name: 'Fernhill Public School', upfront: 26000, fee: 36, demandMult: 1.0, subtype: 'school', width: 7, height: 6, weight: 26,
      unlock: () => hasGeothermal() && civicWanted('school'), rare: true },

    // Mid/late-MK2 civic: arrives once the refinery is turning out fuel oil.
    // Dispatch, the holding cells and the radio mast run around the clock and
    // the floodlit lot pushes the load up after dark (DemandCurves.sheriff).
    // One per neighbourhood — see CIVIC_PER_ZONE.
    { name: "County Sheriff's Office", upfront: 22000, fee: 30, demandMult: 1.0, subtype: 'sheriff', width: 5, height: 4, weight: 26,
      unlock: () => hasMk2FuelOil() && civicWanted('sheriff'), rare: true },

    // MK3-era residential (require Research Station MK3) — the heaviest homes.
    { name: 'Company Town',      upfront: 36000, fee: 46, demandMult: 1.56, subtype: 'companytown', width: 6, height: 5, weight: 30, unlock: hasMk3Reactor,  rare: true },
    { name: 'Skyscraper Condos', upfront: 48000, fee: 60, demandMult: 2.0,  subtype: 'skyscraper',  width: 5, height: 8, weight: 30, unlock: hasMk3Turbines, rare: true },
    { name: 'Mid-rise Co-op',    upfront: 30000, fee: 40, demandMult: 1.8,  subtype: 'coop',        width: 6, height: 7, weight: 30, unlock: hasMk3Hydro,    rare: true },
    // Master-planned Suburb — one request, a block of five luxury homes.
    { name: 'Maple Grove Estates', upfront: 70000, fee: 30, demandMult: 2.76,  subtype: 'suburb',      width: 10, height: 2, weight: 30, unlock: hasMk3Grid2500, rare: true },
    // Grand estate — later stage of the same generation latch as Maple Grove.
    { name: 'Whitmore Hall',       upfront: 58000, fee: 55, demandMult: 2.0,  subtype: 'mansion',     width: 7, height: 5, weight: 12, unlock: hasMk3Grid5000, rare: true },
    { name: 'Thornfield House',    upfront: 54000, fee: 52, demandMult: 2.0,  subtype: 'victorian',   width: 6, height: 5, weight: 12, unlock: hasMk3Grid5000, rare: true },
    { name: 'Glasswater Pavilion', upfront: 62000, fee: 58, demandMult: 2.0,  subtype: 'pavilion',    width: 8, height: 5, weight: 12, unlock: hasMk3Grid5000, rare: true },
    // Night glasshouses + vineyard — same 5 MW gate, different daily clocks.
    { name: 'The Glass Gardens',   upfront: 56000, fee: 54, demandMult: 2.0,  subtype: 'glasshouse',  width: 8, height: 5, weight: 12, unlock: hasMk3Grid5000, rare: true },
    // Fusion era: twin vertical-forest towers.
    { name: 'Evergreen Spires',    upfront: 150000, fee: 100, demandMult: 1.0,  subtype: 'evergreen',   width: 7, height: 9, weight: 3, unlock: hasFusionReactor, rare: true },
    // Its fusion-era neighbours on the same gate: a faceted crystal tower,
    // twin sail towers over a lagoon, and a twisting helix.
    { name: 'Prism Crest Residences', upfront: 160000, fee: 110, demandMult: 1.0, subtype: 'prism',     width: 6, height: 9, weight: 3, unlock: hasFusionReactor, rare: true },
    { name: 'Tidecrest Lagoon Towers', upfront: 140000, fee: 95, demandMult: 1.0, subtype: 'tidecrest', width: 8, height: 8, weight: 3, unlock: hasFusionReactor, rare: true },
    { name: 'Halcyon Helix',       upfront: 155000, fee: 105, demandMult: 1.0,  subtype: 'helix',       width: 6, height: 9, weight: 3, unlock: hasFusionReactor, rare: true },
    // MK4: a whole neighbourhood in one terraced megastructure.
    { name: 'Verdance Sky Habitat', upfront: 260000, fee: 170, demandMult: 1.0,  subtype: 'verdance',     width: 9, height: 10, weight: 3, unlock: hasMeridianDone, rare: true },
    { name: 'Nova Arcology',       upfront: 180000, fee: 120, demandMult: 1.0,  subtype: 'arcology',    width: 8, height: 9, weight: 3, unlock: hasMk4, rare: true },
    // Post-Hyperion second wave: a residential arch over its own canal.
    { name: 'Celestine Arch',      upfront: 300000, fee: 190, demandMult: 1.0,  subtype: 'celestine',   width: 10, height: 8, weight: 3, unlock: hasPostMeridian40, rare: true },
    { name: 'Ashmere Vineyard',    upfront: 60000, fee: 56, demandMult: 2.0,  subtype: 'vineyard',    width: 8, height: 5, weight: 12, unlock: hasMk3Grid5000, rare: true },

    // Post-MK2 residential (require Research Station MK2).
    { name: 'Worker Duplexes',     upfront: 12000, fee: 18, demandMult: 1.4,  subtype: 'duplex',      width: 2, height: 2, weight: 30, unlock: hasMk2CoalMine, rare: true },
    // Retirement village — replaced the Oilfield Bunkhouses (an oil-crew camp
    // never sat right in a residential zone); same footprint, price and unlock.
    { name: 'Sunset Grove Retirement Village', upfront: 16000, fee: 22, demandMult: 1.5, subtype: 'retirement', width: 4, height: 2, weight: 30, unlock: hasMk2PumpJack, rare: true },
    // MK2-era apartment blocks — Maple Court's scale (3×4), one per
    // neighbourhood, arriving one at a time along the coal/oil tree so the
    // stretch between MK2 and MK3 research keeps bringing new flats.
    { name: 'Pemberton Mansions',  upfront: 26000, fee: 36, demandMult: 1.56, subtype: 'pemberton', width: 3, height: 4, weight: 10, unlock: () => hasMk2CoalMine() && civicWanted('pemberton'), rare: true },
    { name: 'Linden Court',        upfront: 25500, fee: 35, demandMult: 1.56, subtype: 'linden',    width: 3, height: 4, weight: 10, unlock: () => hasMk2PumpJack() && civicWanted('linden'),    rare: true },
    { name: 'The Rialto',          upfront: 27000, fee: 37, demandMult: 1.56, subtype: 'rialto',    width: 3, height: 4, weight: 10, unlock: () => hasMk2FuelOil() && civicWanted('rialto'),     rare: true },
  ];

  // Active pending requests (player hasn't accepted/declined yet)
  let pending  = [];
  let backlog  = [];   // off-screen demand reservoir
  let panelOpen = false;
  let viewIndex = 0;   // which pending request (0..pending.length-1) is currently shown/scrolled to
  // The option the player is looking at before committing: picking a letter
  // jumps the camera to that site and asks for a confirm (renderPanel), so a
  // far-out F or G isn't accepted sight unseen. { id: request id, idx: option }.
  let _viewedOption = null;

  // Keep viewIndex pointing at a real entry after pending shrinks/grows.
  function clampViewIndex() {
    if (viewIndex < 0) viewIndex = 0;
    if (viewIndex > pending.length - 1) viewIndex = Math.max(0, pending.length - 1);
  }
  let cooldownTimer = 0;

  const TTL = { house: 12, commercial: 10, industrial: 10, cabin: 8 }; // in-game hours
  const MIN_REQUEST_INTERVAL = { house: 150, commercial: 240, industrial: 360 };
  // MK4-era pacing. By the time MK4 research is unlocked every kind's
  // acceptance scaling (below) has usually climbed to its 8x cap, so
  // requests had slowed to a trickle just as the heaviest customers and
  // biggest plants arrive. From MK4 on, both gates — the energy step and the
  // real-time interval — shrink by this factor. It was 0.6 (≈ 1.67x as
  // often), which was about 10% too many requests between MK4 and MK5, so
  // the gates are now a ninth longer than that (10% fewer requests).
  // MK5 research once made them 10% faster than that 0.6; that turned out
  // to be too many for a city that big, so the MK5 gates are a quarter
  // longer again (20% fewer requests than 0.6 / 1.10 gave).
  // MK4's gates went a quarter longer too (20% fewer requests), alongside
  // the cut in MK4 customers' fees, to slow mid-game income.
  const MK4_REQUEST_PACE = 0.6 / 0.9 * 1.25;
  const MK5_REQUEST_PACE = 0.6 / 1.10 * 1.25;
  const hasMk5 = () => typeof Progression !== 'undefined' && Progression.isUnlocked(T.MK5RESEARCH);
  const eraPace = () => hasMk5() ? MK5_REQUEST_PACE : hasMk4() ? MK4_REQUEST_PACE : 1;
  let gameTime = 0;
  let lastRequestTime = { house: -999, commercial: -999, industrial: -999 };

  // Cabin (first-ever request) state
  let cabinSent        = false;
  let cabinCleared     = false;
  // Connection deal for the first customer: from accepting Mae's Cabin
  // until a house first has power, wires are free and Power Poles are half
  // price (see buildCost below). Saved, so it survives a reload mid-hookup.
  let cabinDeal        = false;
  let housesAccepted   = 0;     // commercial requests unlock after 3 houses
  let _lastLocs = [];            // track last request locations to avoid repeats
  let _declinedLocs = [];        // { col, row, expires } — locations to avoid after decline

  // Shuffle an array in place and return it
  function _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Pick a location from pool that is at least minDist from _lastLocs entries
  function _pickFresh(pool, minDist = 10) {
    if (!pool.length) return null;
    _shuffle(pool);
    // Try to find a spot far from recent picks AND declined locations
    const fresh = pool.find(p =>
      !_lastLocs.some(ll => Math.abs(ll.col-p.col)+Math.abs(ll.row-p.row) < minDist) &&
      !_declinedLocs.some(dl => Math.abs(dl.col-p.col)+Math.abs(dl.row-p.row) < 15)
    );
    // Fallback 1: ignore lastLocs but still avoid declined
    const fallback1 = fresh || pool.find(p => !_declinedLocs.some(dl => Math.abs(dl.col-p.col)+Math.abs(dl.row-p.row) < 15));
    // Fallback 2: just pick randomly
    const pick = fallback1 || pool[0];
    _lastLocs.push(pick);
    if (_lastLocs.length > 9) _lastLocs.shift();
    return pick;
  }

  // Pick from `pool` the spot that best spreads a request's options out:
  // the candidates are scored by their Manhattan distance to the nearest
  // option already chosen (`chosen`, nulls ignored), plus a nudge for sitting
  // further from City Hall, and one of the top few percent is taken at random
  // so the layout still varies from request to request. New-zone options are
  // meant to be genuinely different places to build — a random pick from a
  // big pool kept landing them all in the same corner of it. Falls back to
  // _pickFresh when nothing has been chosen yet.
  //
  // Distance alone still let a request's options pile up on one side of town
  // (two spots far apart can both be north-east of City Hall). So before
  // scoring, the pool is cut down to the compass sectors round City Hall that
  // the options chosen so far cover least: each option loads its own sector
  // and, at half weight, the two beside it, and only candidates in the
  // lightest-loaded sectors the pool can reach are kept. The options a
  // request ends up with therefore go round the map as far as there is
  // buildable ground to allow it.
  const SPREAD_GOV_WEIGHT = 0.25;
  const SPREAD_TOP_FRAC   = 0.03;
  const SPREAD_SECTORS    = 8;
  const SPREAD_SAMPLE     = 3000;
  function _pickSpread(pool, chosen) {
    if (!pool.length) return null;
    const others = (chosen || []).filter(Boolean);
    if (!others.length) return _pickFresh(pool);
    const avail = pool.filter(p => !_declinedLocs.some(dl => Math.abs(dl.col-p.col)+Math.abs(dl.row-p.row) < 15));
    let all = avail.length ? avail : pool;
    // A random SPREAD_SAMPLE of a big pool spreads as well as the whole of it
    // and keeps the sort below off tens of thousands of candidates.
    if (all.length > SPREAD_SAMPLE) { all = _shuffle(all.slice()); all.length = SPREAD_SAMPLE; }
    const hall = ZoneSystem.govZoneCentre?.() || { c: COLS / 2, r: ROWS / 2 };
    const sectorOf = p => Math.floor((Math.atan2(p.row - hall.r, p.col - hall.c) + Math.PI) / (Math.PI * 2) * SPREAD_SECTORS) % SPREAD_SECTORS;
    const load = new Array(SPREAD_SECTORS).fill(0);
    for (const o of others) {
      const k = sectorOf(o);
      load[k] += 1; load[(k + 1) % SPREAD_SECTORS] += 0.5; load[(k + SPREAD_SECTORS - 1) % SPREAD_SECTORS] += 0.5;
    }
    const secs = all.map(sectorOf);
    let lightest = Infinity;
    for (const k of secs) if (load[k] < lightest) lightest = load[k];
    const src = all.filter((_, i) => load[secs[i]] <= lightest);
    const scored = src.map(p => {
      let d = Infinity;
      for (const o of others) d = Math.min(d, Math.abs(o.col - p.col) + Math.abs(o.row - p.row));
      return { p, score: d + SPREAD_GOV_WEIGHT * ZoneSystem.distToGovZone(p.col, p.row) };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.max(1, Math.ceil(scored.length * SPREAD_TOP_FRAC)));
    const pick = top[Math.floor(Math.random() * top.length)].p;
    _lastLocs.push(pick);
    if (_lastLocs.length > 9) _lastLocs.shift();
    return pick;
  }
  let commercialThresh = 20000;
  let commercialsAccepted = 0;

  // ── Substation readiness ────────────────────────────────────────────
  // Shared by the commercial spawn gate and the Grid Progress tracker, so the
  // panel can never tell the player something the sim disagrees with.
  //
  // "Ready" means a powered substation that is either taking charge right now
  // or already sitting on a real reserve. Both halves matter: power_network
  // sets `charging` from `absorb > 0.01`, so it drops to false the instant the
  // substation tops out at def.capacity. Testing `charging` alone meant a
  // player whose grid was healthy enough to FILL the bank had commercial
  // requests switch off permanently — exactly backwards. The stored-charge
  // half covers that standby case; `charging` covers a bank still filling.
  const SUB_RESERVE_FRAC = 0.25;   // of capacity — "has a real reserve banked"

  // Both request gates latch: once the player has met the requirement the
  // category stays unlocked for good. A live re-check punishes exactly the
  // grids that satisfied it best — a full substation stops charging, a
  // geothermal field browns out for a tick — and silently turns off a whole
  // income stream with nothing on screen explaining why.
  let subEverReady   = false;  // commercial gate — a substation banked real charge
  let geoEverRan     = false;  // industrial gate — a geothermal turbine generated
  // Big-building gate. Apartments, hotels and malls used to require a placed
  // Coal Power Generator, which quietly locked them behind one specific
  // building on one specific tech route — a player going wind → geothermal →
  // hydro could clear the whole mid-game and never be offered any of them.
  // Peak generation says the same thing ("this grid is big enough to matter")
  // without caring how the watts are made.
  //
  // Latched rather than live: generation sags every night and in bad weather,
  // and a gate that unlatches would pull these back out of the pool halfway
  // through the game. Same reasoning as the two latches above.
  const BIG_BUILDING_GEN = 750;   // W of generation that opens them up
  let genEverAbove750 = false;

  function substationState() {
    let present = false, ready = false, charge = 0, pct = 0;
    for (const t of [T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5]) {
      const cap = EntityDefs[t].capacity || 0;
      for (const e of EntityRegistry.getByType(t)) {
        present = true;
        charge  = Math.max(charge, e.charge || 0);
        if (cap > 0) pct = Math.max(pct, (e.charge || 0) / cap);
        if (!e.powered) continue;
        if (e.charging || (cap > 0 && (e.charge || 0) >= cap * SUB_RESERVE_FRAC)) ready = true;
      }
    }
    return { present, ready, charge, pct };
  }

  let industrialsAccepted = 0;
  // Saves made before this counter was persisted (and before it was ever
  // incremented) load it as 0 however many factories are on the map, which
  // left the Town Hall (needs 5) and the Industrial Zone contract (needs 3)
  // permanently unreachable. Reconcile it once, lazily, against the
  // industrial customers actually placed — lazily because loadState() runs
  // before the grid's entities exist.
  let _industrialsReconciled = false;
  function _reconcileIndustrials() {
    if (_industrialsReconciled || typeof EntityRegistry === 'undefined') return;
    const all = EntityRegistry.getByType(T.INDUSTRIAL);
    if (!all || all.size === 0) return;
    let placed = 0;
    for (const e of all) if (e.fromRequest) placed++;
    if (placed > industrialsAccepted) industrialsAccepted = placed;
    _industrialsReconciled = true;
  }
  let industrialThresh = 50000;

  // How many requests can be visible at once
  function activeCapacity() {
    if (commercialsAccepted >= 2) return 3;
    if (housesAccepted >= 3)      return 2;
    return 1;
  }

  // Cooldown duration based on grid health
  function gridHealthCooldown() {
    let totalRel = 0, count = 0;
    for (const t of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) {
      for (const e of EntityRegistry.getByType(t)) { totalRel += (e.reliability ?? 100); count++; }
    }
    const avgRel = count ? totalRel / count : 100;
    const avgSat = typeof SatisfactionSystem !== 'undefined' ? SatisfactionSystem.averageSatisfaction() : 80;
    if (avgRel > 80 && avgSat > 70) return 30;
    if (avgRel > 50)                return 60;
    return 90;
  }

  // Nobody asks to be hooked up on blast ground: a request's sites inside a
  // live nuclear contamination zone (any stage, until it recovers) are
  // struck off, and a request left with none is dropped. Applied when a
  // request leaves the backlog and again on pending ones each tick, so a
  // blast that lands on an open request clears it too. True if any survive.
  function _clearOfFallout(req) {
    if (typeof LightningDamageSystem === 'undefined' || !LightningDamageSystem.contaminationAt) return true;
    if (!req.locations || !req.locations.length) return true;
    const type = req.isIndustrial ? T.INDUSTRIAL : req.isCommercial ? T.COMMERCIAL : req.isCabin ? T.CABIN : T.HOUSE;
    const fp = entityFootprint(type, req.subtype || null) || { width: 1, height: 1 };
    req.locations = req.locations.filter(l => LightningDamageSystem.contaminationAt(l.col, l.row, fp.width || 1, fp.height || 1).level === 0);
    return req.locations.length > 0;
  }

  // No two open requests offer the same ground. A request's options are
  // picked against what is built, not against the other requests waiting,
  // so two could be offered the same spot. On its way into `pending` a
  // request loses any option overlapping one an open request already offers;
  // left with none, it waits in the backlog (untouched) until that one is
  // accepted, declined or expires, and the next in line goes ahead.
  function _offerRect(req, l) {
    const fp = req._width && req._height ? { width: req._width, height: req._height } : _buildFootprint(req);
    return { c: l.col, r: l.row, w: fp.width || 1, h: fp.height || 1 };
  }
  function _clearOfOtherOffers(req) {
    if (!req.locations || !req.locations.length) return true;
    const taken = [];
    for (const o of pending) if (o !== req) for (const l of (o.locations || [])) if (l) taken.push(_offerRect(o, l));
    if (!taken.length) return true;
    const free = req.locations.filter(l => {
      if (!l) return false;
      const a = _offerRect(req, l);
      return !taken.some(t => a.c < t.c + t.w && t.c < a.c + a.w && a.r < t.r + t.h && t.r < a.r + a.h);
    });
    if (!free.length) return false;
    req.locations = free;
    return true;
  }

  // Move one item from backlog to pending if conditions allow
  function drainBacklog() {
    if (!backlog.length) return;
    if (pending.length >= activeCapacity()) return;
    if (cooldownTimer > 0) return;
    let pick = -1;
    for (let i = 0; i < backlog.length; i++) {
      if (!_clearOfFallout(backlog[i])) { backlog.splice(i, 1); i--; continue; }   // fallout took every option: dropped, as before
      if (_clearOfOtherOffers(backlog[i])) { pick = i; break; }
    }
    if (pick < 0) return;
    const req = backlog.splice(pick, 1)[0];
    req.ttl    = TTL[req._tier] || 100;
    req.ttlMax = req.ttl;
    pending.push(req);
    const emoji = req.isIndustrial ? '🏭' : req.isCommercial ? '📬' : '📬';
    SFX.request();
    req.notifId = NotificationStack.push({
      icon: emoji,
      title: `${req.family}`,
      message: 'New connection request: click to review',
      color: '#f0c040',
      border: '#604010',
      onClick: () => openPanel(req.id),
    });
    updateBadge();
    if (panelOpen) renderPanel();
  }

  function spawnCabin() {
    // Find the first generation machine as anchor
    let anchor = null;
    const GEN = [T.BIOFUELGEN, T.SOLAR, T.SOLAR2, T.SOLAR3, T.WIND, T.WIND2, T.WIND3, T.GEOTURBINE, T.COALGENERATOR, T.HYDROGENERATOR];
    outer: for (const t of GEN) for (const e of EntityRegistry.getByType(t)) { anchor = e; break outer; }
    // Generate cabin candidates within 10 tiles of anchor in any direction
    let locs = [];
    if (anchor) {
      const candidates = [];
      for (let r = anchor.row - 10; r <= anchor.row + 10; r++)
        for (let c = anchor.col - 10; c <= anchor.col + 10; c++) {
          if (!GridManager.inBounds(c, r)) continue;
          if (GridManager.getEntity(c, r)) continue;
          if (WaterSystem.isWater(c, r)) continue;
          { const _d = ZoneSystem.distToGovZone(c, r); if (ZoneSystem.isInGovZone(c, r) || _d < ZoneSystem.GOV_RING_MIN || _d > ZoneSystem.GOV_RING_MAX) continue; }
          if (c < 15 || c >= COLS-15 || r < 15 || r >= ROWS-15) continue;
          candidates.push({ col: c, row: r });
        }
      // Shuffle and pick OPTION_COUNT
      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i+1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }
      locs = candidates.slice(0, OPTION_COUNT);
    }
    // Top up to OPTION_COUNT whenever the anchor-radius search came up short (not just
    // when it found nothing) — the anchor is usually a generator placed
    // close to City Hall, so the gov-zone distance band (ZoneSystem.GOV_RING_MIN..MAX) can leave
    // little or no room inside a ±10 tile search box, regularly yielding
    // just 1-2 candidates instead of the intended OPTION_COUNT.
    if (locs.length < OPTION_COUNT) {
      const extra = pickCandidateLocations(false, OPTION_COUNT - locs.length, { width: 1, height: 1 }, T.CABIN, 14);
      for (const loc of extra) {
        if (locs.length >= OPTION_COUNT) break;
        if (!locs.some(l => l.col === loc.col && l.row === loc.row)) locs.push(loc);
      }
    }
    const req = {
      id:        requestIdCounter++,
      family:    "Mae's Cabin",
      upfront:   2500,
      fee: 9,
      isCabin:   true,
      _tier:     'cabin',
      locations: locs,
    };
    // Cabin goes directly to pending — it's the tutorial moment
    req.ttl    = TTL.cabin;
    req.ttlMax = TTL.cabin;
    pending.push(req);
    cabinSent = true;
    updateBadge();
    SFX.request();
    req.notifId = NotificationStack.push({
      icon: '📬',
      title: "Mae's Cabin",
      message: 'Your first connection request; click to review',
      color: '#f0c040',
      border: '#604010',
      onClick: () => openPanel(req.id),
    });
    if (panelOpen) renderPanel();
  }

  // How many placement options (A..G) a request offers. Relocation keeps its
  // own three (see freshLocations) — it's a different decision.
  // The last FAR_SLOTS of them (F and G) are never anchored to a zone: they
  // are always far-out sites that start a new one (_makeRemoteNewZoneOptions),
  // held to the same placement rules as every other option. So A..E behave
  // as the five options always did, and F/G add two distant choices.
  const OPTION_COUNT   = 7;
  const FAR_SLOTS      = 2;
  const ANCHOR_SLOTS   = OPTION_COUNT - FAR_SLOTS;
  const OPTION_LETTERS = 'ABCDEFG';

  // ── Site rules ─────────────────────────────────────────────────────
  // A few properties only make sense beside something specific: the Marina
  // and Fish Hatchery on reservoir water, the Company Town next to the reactor
  // it houses workers for. Their A/B/C sites are found by searching outward
  // from those targets instead of the usual zone-anchored picker. If nothing
  // fits, the normal sites stand, so the request still spawns.
  function _reservoirShoreTargets() {
    const out = [];
    for (const w of EntityRegistry.getByType(T.WATER)) {
      if (w._reservoirId === undefined) continue;
      // Only water with land beside it can have a building on its shore.
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const n = GridManager.getEntity(w.col + dc, w.row + dr);
        if (!n || n.type !== T.WATER) { out.push(w); break; }
      }
    }
    return out;
  }
  const SITE_RULES = {
    marina:       { targets: _reservoirShoreTargets, maxDist: 2 },
    fishhatchery: { targets: _reservoirShoreTargets, maxDist: 3 },
    companytown:  { targets: () => [...EntityRegistry.getByType(T.NUCLEARREACTOR)], maxDist: 16 },
  };
  // Cluster requests: one request whose block footprint (SubtypeFootprints)
  // holds several ordinary houses. accept() places a house on each lot, offset
  // from the block's anchor. Keyed by subtype so dev spawns and saved requests
  // resolve the same layout without carrying it on the request itself.
  const CLUSTER_LOTS = {
    suburb: [{ dc: 0, dr: 0 }, { dc: 2, dr: 0 }, { dc: 4, dr: 0 }, { dc: 6, dr: 0 }, { dc: 8, dr: 0 }],
  };

  // Population for a building placed from this request. Commercial/industrial
  // properties count their workers toward population too, not just residents.
  function _rollPopulation(req, isLot) {
    const s = req.subtype || '';
    const roll = (min, max) => min + Math.floor(Math.random() * (max - min + 1));
    if (isLot)                  return roll(3, 6);    // per suburb home
    if (req.isIndustrial)       return roll(10, 40);  // workers
    if (req.isCommercial)       return roll(5, 20);   // workers
    if (s === 'apartment' || s === 'birchwood' || s === 'foundry' || s === 'willowbank' ||
        s === 'pemberton' || s === 'linden' || s === 'rialto') return roll(18, 32);
    if (s === 'townhouse')      return roll(8, 14);
    if (s === 'arcology')       return roll(400, 700);
    if (s === 'evergreen')      return roll(250, 450);
    if (s === 'prism')          return roll(280, 480);
    if (s === 'tidecrest')      return roll(220, 400);
    if (s === 'helix')          return roll(260, 460);
    if (s === 'verdance')        return roll(700, 1100);
    if (s === 'celestine')       return roll(800, 1200);
    if (s === 'condo' || s === 'lumiere' || s === 'ashford' || s === 'cedarpoint') return roll(4, 8);
    if (s === 'companytown')    return roll(40, 60);
    if (s === 'skyscraper')     return roll(60, 90);
    if (s === 'coop')           return roll(24, 36);
    if (s === 'duplex')         return roll(6, 10);
    if (s === 'retirement')     return roll(10, 16);
    if (s === 'mansion')        return roll(10, 20);  // household + staff
    if (s === 'victorian')      return roll(6, 12);
    if (s === 'pavilion')       return roll(6, 12);
    if (s === 'glasshouse')     return roll(6, 12);    // gardeners + caretakers
    if (s === 'vineyard')       return roll(8, 16);   // field + cellar staff
    if (s === 'school')         return roll(20, 40);  // staff + pupils
    if (s === 'sheriff')        return roll(8, 14);   // deputies + dispatch
    if (s === 'cornerstore')    return roll(2, 4);    // the owner upstairs + counter staff
    if (req.isCabin)            return roll(1, 2);
    return roll(1, 6);                                // standard house
  }

  // One population per building the request will place (one per lot for a
  // cluster). Rolled lazily and stored on the request — it's serialised with
  // it — so the peak quoted on the card is the peak the building really has,
  // and requests from older saves pick one up the first time they're shown.
  function _requestPopulations(req) {
    const n = CLUSTER_LOTS[req.subtype]?.length || 1;
    if (!Array.isArray(req._populations) || req._populations.length !== n) {
      req._populations = Array.from({ length: n }, () => _rollPopulation(req, n > 1));
    }
    return req._populations;
  }

  // Highest draw a building from this request can actually put on the grid,
  // mirroring power_network.js's demand pass (weather events aside — those
  // are temporary and announced on their own). For a cluster it's the
  // hungriest single home.
  function quotedPeak(req) {
    const type = req.isIndustrial ? T.INDUSTRIAL : req.isCommercial ? T.COMMERCIAL : T.HOUSE;
    let peak = DemandCurves.peak(type, req.subtype || null);
    // Min/peak industrial types have no curve, so peak() reads 0 for them —
    // their pool entry's peakDraw is exactly the top of their range.
    if (peak === 0) peak = req.peakDraw ?? (req.isIndustrial ? 30 : req.isCommercial ? 15 : 6);
    if (type !== T.HOUSE) return peak;
    // Homes: the curve is scaled by the request's demandScale and by the
    // household's size, and residential noise can sit 15% above that.
    const maxPop = Math.max(..._requestPopulations(req));
    return peak * DemandCurves.houseScale(req.demandScale, maxPop) * DemandCurves.popScale(maxPop) * 1.15;
  }
  // Trees and bushes don't block — accept() clears them from the footprint.
  function _siteFree(c, r, fw, fh) {
    if (c < EDGE_MARGIN || r < EDGE_MARGIN || c + fw > COLS - EDGE_MARGIN || r + fh > ROWS - EDGE_MARGIN) return false;
    for (let dr = 0; dr < fh; dr++) for (let dc = 0; dc < fw; dc++) {
      const e = GridManager.getEntity(c + dc, r + dr);
      if (e && e.type !== T.TREE && e.type !== T.BUSH) return false;
    }
    return !(ZoneSystem.isInGovZone && ZoneSystem.isInGovZone(c, r));
  }
  // Sites as close to a target as they fit (up to maxDist tiles away), kept at
  // least SPREAD tiles apart so the options aren't stacked on one spot. A
  // single target — one reactor — can supply every option from its different
  // sides; with many targets (a shoreline) they come from shuffled stretches.
  function _sitesNear(targets, fp, maxDist, count) {
    const SPREAD = 8;
    const fw = fp.width || 1, fh = fp.height || 1, found = [];
    for (const tgt of _shuffle([...targets]).slice(0, 80)) {
      const tw = tgt.width || 1, th = tgt.height || 1;
      for (let d = 1; d <= maxDist && found.length < count; d++) {
        const cands = [];
        for (let c = tgt.col - d - fw + 1; c <= tgt.col + tw - 1 + d; c++) {
          cands.push([c, tgt.row - d - fh + 1]); cands.push([c, tgt.row + th - 1 + d]);
        }
        for (let r = tgt.row - d - fh + 1; r <= tgt.row + th - 1 + d; r++) {
          cands.push([tgt.col - d - fw + 1, r]); cands.push([tgt.col + tw - 1 + d, r]);
        }
        for (const [c, r] of _shuffle(cands)) {
          if (found.length >= count) break;
          if (!_siteFree(c, r, fw, fh)) continue;
          if (found.some(f => Math.abs(f.col - c) + Math.abs(f.row - r) < SPREAD)) continue;
          found.push({ col: c, row: r });
        }
      }
      if (found.length >= count) break;
    }
    return found;
  }
  function _applySiteRule(subtype, fp, locs) {
    const rule = subtype && SITE_RULES[subtype];
    if (!rule) return locs;
    const sites = _sitesNear(rule.targets(), fp, rule.maxDist, OPTION_COUNT);
    return sites.length ? sites : locs;
  }

  // ── Sliced spawning ─────────────────────────────────────────────────
  // Choosing a request's A..G sites scans large parts of the map, which on a
  // built-up world is 100-200 ms of work (over a second the first time,
  // before the JIT warms up), so running it in one go froze the game for a
  // visible hitch every time a request arrived. The spawners and the
  // searches under them are generators that yield once per scanned row;
  // this runs them a few milliseconds at a time between frames. Spawns run
  // one after another in the order they were asked for, exactly as the
  // back-to-back setTimeouts they replace did, so a request still sees the
  // one before it in the backlog. loadState()/reset() drop any in flight so
  // a search started in one world never lands in another.
  const SPAWN_SLICE_MS = 4;
  const _spawnQueue = [];
  let _spawnJob = null, _spawnTimer = null;
  function _queueSpawn(genFn) {
    _spawnQueue.push(genFn);
    if (_spawnTimer === null) _spawnTimer = setTimeout(_runSpawnSlice, 0);
  }
  function _runSpawnSlice() {
    _spawnTimer = null;
    const end = performance.now() + SPAWN_SLICE_MS;
    do {
      if (!_spawnJob) {
        if (!_spawnQueue.length) return;
        _spawnJob = _spawnQueue.shift()();
      }
      if (_spawnJob.next().done) _spawnJob = null;
    } while (performance.now() < end);
    _spawnTimer = setTimeout(_runSpawnSlice, 0);
  }
  function _cancelSpawns() {
    _spawnQueue.length = 0;
    _spawnJob = null;
  }
  // Run a generator to completion right now, for callers that need the result.
  function _drain(gen) {
    let r;
    do r = gen.next(); while (!r.done);
    return r.value;
  }

  function spawnCommercial() {
    _queueSpawn(_doSpawnCommercial);
  }
  // Subtype of the most recent commercial / industrial request, so the next
  // one can avoid repeating it. With ~14 commercial entries all on weight 10,
  // a plain weighted draw repeats roughly 1 in 14 times, which reads as "that
  // again?" far more often than the odds suggest.
  let _lastComSubtype = null;
  let _lastIndSubtype = null;

  // Different businesses before repeats. Avoiding only the previous type
  // still let a pool of thirty-odd come round to the same few again and
  // again while most of it had never been offered. Each pool now deals like
  // a deck: a type that has been offered is out until every type the player
  // can currently get has had its turn, and one the city already has
  // standing waits behind the ones it does not. Only when nothing new is
  // left does the deck go round again. Weights and rare pity still decide
  // the order within what is left. Saved, so a reload does not reshuffle.
  const _offeredCom = new Set(), _offeredInd = new Set();
  function _freshFirst(avail, offered, type) {
    const built = new Set();
    for (const e of EntityRegistry.getByType(type)) if (e.commercialSubtype) built.add(e.commercialSubtype);
    const unseen = avail.filter(x => !offered.has(x.subtype));
    const brandNew = unseen.filter(x => !built.has(x.subtype));
    if (brandNew.length) return brandNew;
    if (unseen.length) return unseen;
    offered.clear();          // everything has been round: deal again
    return avail;
  }

  let _commercialRequestFired = false;
  function* _doSpawnCommercial() {
    _commercialRequestFired = true;
    const availCom = COMMERCIAL_POOL.filter(b => !b.unlock || b.unlock());
    // Never offer the same type twice running — unless it's the only one
    // available, in which case a repeat beats no request at all.
    const biz = _pickWithPity(availCom, _lastComSubtype, _freshFirst(availCom, _offeredCom, T.COMMERCIAL));
    if (!biz) return;
    _lastComSubtype = biz.subtype;
    _offeredCom.add(biz.subtype);
    let locs = yield* _firstGuessLocations(true, entityFootprint(T.COMMERCIAL, biz.subtype), T.COMMERCIAL, 'commercial');
    yield* _anchorOptionsToZones('commercial', entityFootprint(T.COMMERCIAL, biz.subtype), locs, { subtype: biz.subtype });
    locs = _applySiteRule(biz.subtype, entityFootprint(T.COMMERCIAL, biz.subtype), locs);
    const req = {
      id:           requestIdCounter++,
      family:       biz.name,
      subtype:      biz.subtype,
      upfront:      biz.upfront,
      fee:          biz.fee,
      peakDraw:     biz.peakDraw,
      minDraw:      biz.minDraw,
      idleDraw:     biz.idleDraw,
      desc:         biz.desc,
      isCommercial: true,
      _rare:        !!biz.rare,
      _tier:        'commercial',
      locations:    locs,
    };
    backlog.push(req);
    showToast(`📬 ${biz.name} interested in commercial connection`, '#f0c040', '#141000', '#705000');
    drainBacklog();
  }

  function spawnIndustrial() {
    _queueSpawn(_doSpawnIndustrial);
  }
  let _industrialRequestFired = false;
  function* _doSpawnIndustrial() {
    _industrialRequestFired = true;
    const availInd = INDUSTRIAL_POOL.filter(i => !i.unlock || i.unlock());
    // Never offer the same type twice running — see _lastComSubtype above.
    const ind = _pickWithPity(availInd, _lastIndSubtype, _freshFirst(availInd, _offeredInd, T.INDUSTRIAL));
    if (!ind) return;
    _lastIndSubtype = ind.subtype;
    _offeredInd.add(ind.subtype);
    let locs = yield* _firstGuessLocations(true, entityFootprint(T.INDUSTRIAL, ind.subtype), T.INDUSTRIAL, 'industrial');
    const _indFp = entityFootprint(T.INDUSTRIAL, ind.subtype);
    yield* _anchorOptionsToZones('industrial', _indFp, locs, { subtype: ind.subtype });
    // First industrial customer only — offer one site well clear of the town.
    _reconcileIndustrials();
    // (The first-industrial remote option is now covered by _makeRemoteNewZoneOptions.)
    locs = _applySiteRule(ind.subtype, _indFp, locs);
    const req = {
      id:           requestIdCounter++,
      family:       ind.name,
      subtype:      ind.subtype,
      upfront:      ind.upfront,
      fee:          ind.fee,
      peakDraw:     ind.peakDraw,
      minDraw:      ind.minDraw,
      idleDraw:     ind.idleDraw,
      desc:         ind.desc,
      isCommercial: true,
      isIndustrial: true,
      _rare:        !!ind.rare,
      _tier:        'industrial',
      locations:    locs,
    };
    backlog.push(req);
    showToast(`🏭 ${ind.name}: industrial contract available`, '#ff8040', '#180800', '#804020');
    drainBacklog();
  }

  // ── DEV MODE: force-place a specific pool entry directly in the world ──
  // Bypasses random weighting, unlock gates, backlog capacity, the request
  // cooldown, AND the normal placement rules (substation requirement, gov-
  // zone distance ring, zone clustering) — dev spawns need to work on a
  // brand-new world with zero infrastructure, not just once a substation
  // and zones already exist. _devFindPlacement scans for any free,
  // buildable tile outside the government zone core; that's the only
  // constraint that survives. Builds the same request shape the normal
  // flow uses, then immediately calls accept() on it (instead of leaving
  // it in `pending` for the player to act on) so the building actually
  // lands on the map right away — same income, zone tracking, and
  // population logic as a normal acceptance.
  function _devFindPlacement(fp) {
    const fw = fp.width || 1, fh = fp.height || 1;
    const candidates = [];
    for (let r = EDGE_MARGIN; r < ROWS - EDGE_MARGIN - fh + 1; r++) {
      for (let c = EDGE_MARGIN; c < COLS - EDGE_MARGIN - fw + 1; c++) {
        if (!GridManager.canPlaceFootprint(c, r, fw, fh)) continue;
        if (ZoneSystem.isInGovZone(c, r)) continue;
        candidates.push({ col: c, row: r });
      }
    }
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
  // The footprint a residential pool entry is built at. SubtypeFootprints is
  // the authority: it is what applySubtypeFootprint and the post-load grow
  // pass hold a building to. Several entries' own width/height predate the
  // street-scale resize (a school is 10×9 now; its entry still said 7×6), and
  // with the two disagreeing the offered spots were found at one size and
  // accept() checked them at the other, so a spot that fit was refused as
  // occupied and the building went to another option.
  function _famFootprint(fam) {
    if (fam.subtype && SubtypeFootprints[fam.subtype]) return entityFootprint(T.HOUSE, fam.subtype);
    return fam.subtype ? { width: fam.width || 1, height: fam.height || 1 } : entityFootprint(T.HOUSE);
  }
  function _devSpawnHouseEntry(fam) {
    const fp = _famFootprint(fam);
    const pos = _devFindPlacement(fp);
    if (!pos) { showToast(`⚠ DEV: no free tile found for ${fam.name}`, '#ff8040', '#180a00', '#804020'); return; }
    const req = {
      id:        requestIdCounter++,
      family:    fam.subtype === 'cornerstore' ? _freshStoreName() : fam.name,
      upfront:   fam.upfront,
      fee:       fam.fee,
      demandScale: fam.demandMult || 1.0,
      _rare:     !!fam.rare,
      subtype:   fam.subtype || null,
      _width:    fp.width,
      _height:   fp.height,
      _tier:     'house',
      houseWealthTier: fam.subtype ? null : _wealthTier(fam.demandMult || 1.0),
      locations: [pos],
      ttl: TTL.house, ttlMax: TTL.house,
    };
    pending.push(req);
    accept(req.id, 0);
  }
  function _devSpawnBizEntry(biz, entityType, isIndustrial) {
    const fp = entityFootprint(entityType, biz.subtype);
    const pos = _devFindPlacement(fp);
    if (!pos) { showToast(`⚠ DEV: no free tile found for ${biz.name}`, '#ff8040', '#180a00', '#804020'); return; }
    if (isIndustrial) _industrialRequestFired = true;
    else _commercialRequestFired = true;
    const tier = isIndustrial ? 'industrial' : 'commercial';
    const req = {
      id:           requestIdCounter++,
      family:       biz.name,
      subtype:      biz.subtype,
      upfront:      biz.upfront,
      fee:          biz.fee,
      peakDraw:     biz.peakDraw,
      minDraw:      biz.minDraw,
      idleDraw:     biz.idleDraw,
      desc:         biz.desc,
      isCommercial: true,
      isIndustrial: !!isIndustrial,
      _rare:        !!biz.rare,
      _tier:        tier,
      locations:    [pos],
      ttl: TTL[tier], ttlMax: TTL[tier],
    };
    pending.push(req);
    accept(req.id, 0);
  }

  function spawnRequest() {
    _queueSpawn(_doSpawnRequest);
  }
  function* _doSpawnRequest() {
    // EV Charger attracts wealthier families — weight toward higher-fee entries
    let pool = FAMILY_POOL.filter(f => !f.unlock || f.unlock());
    // 2nd property restricted to non-rare tier 1 or 2
    if (housesAccepted === 1) {
      pool = pool.filter(f => f.demandMult <= 1.11 && !f.rare);
    } else if (hasActiveEVCharger()) {
      const premium = pool.filter(f => f.fee >= 400 && !f.rare);
      pool = [...pool, ...premium, ...premium];
    }
    // Pity: each spawn a not-yet-accepted rare type is eligible but skipped,
    // its odds climb, and it's forced after RARE_PITY misses — so "rare"
    // doesn't mean "never" once unlock conditions are met. Shared with the
    // commercial and industrial spawners via _pickWithPity (this block used
    // to be the only copy, which is why those two never had the behaviour).
    const fam = _pickWithPity(pool);
    if (!fam) return;
    const fp = _famFootprint(fam);
    let locs = yield* _firstGuessLocations(false, fp, T.HOUSE, 'residential');
    yield* _anchorOptionsToZones('residential', fp, locs,
      { subtype: fam.subtype || null, tier: fam.subtype ? null : _wealthTier(fam.demandMult || 1.0) });
    locs = _applySiteRule(fam.subtype, fp, locs);
    // Civic buildings are capped per residential zone. The options above are
    // anchored one per zone, so drop any that would land in a zone already at
    // its cap; if that leaves nothing, skip the spawn entirely rather than
    // offering a site the cap would have to refuse later.
    if (CIVIC_PER_ZONE[fam.subtype]) {
      // One capped request at a time: a second one waiting alongside the
      // first could be accepted into the same zone and slip past the cap.
      if ([...pending, ...backlog].some(r => r.subtype === fam.subtype)) return;
      locs = locs.filter(l => _civicSiteAllowed(l, fp, fam.subtype));
      if (!locs.length) return;
    }

    // The upfront is paid TO the player. It used to rise ~8% per property
    // placed, to 2.5× — meant as mid-game pressure, it did the opposite: every
    // new customer paid more the bigger the city got, and that growth was over
    // half of all the upfront money a run took in. Now a family pays its own
    // terms however many neighbours it has.
    const scaledUpfront = Math.round(fam.upfront / 500) * 500; // round to nearest $500

    // Power demand: grows with grid size (~3% per house, to 1.5×) AND scales
    // with family tier. The fee does not grow with it, so a steeper ramp made
    // every later home cost more power for the same income.
    const demandScale = Math.min(1.5, 1 + housesAccepted * 0.03) * (fam.demandMult || 1.0);

    const req = {
      id:        requestIdCounter++,
      // Ordinary households get a fresh surname; the pool entry only sets
      // their tier and terms. Special/rare ones keep their own name.
      family:    fam.subtype === 'cornerstore' ? _freshStoreName()
               : (!fam.subtype && !fam.rare && /^The /.test(fam.name)) ? _freshFamilyName() : fam.name,
      upfront:   scaledUpfront,
      fee:       fam.fee,
      demandScale,
      _rare:     !!fam.rare,
      subtype:   fam.subtype || null,
      _width:    fp.width,
      _height:   fp.height,
      _tier:     'house',
      houseWealthTier: fam.subtype ? null : _wealthTier(fam.demandMult || 1.0),
      locations: locs,
    };
    backlog.push(req);
    // req.family, not fam.name: the pool entry only says 'Corner Store' (or a
    // placeholder surname); the request carries the name it will go by.
    if (backlog.length === 1) showToast(`📬 ${req.family} ${/^The /.test(req.family) ? 'want' : 'wants'} to join your grid`);
    drainBacklog();
  }

  // Spawn near a substation (within 9 tiles Euclidean) — player still
  // needs to run wire from substation to power the house.

  function distToSubstation(c, r, sub) {
    let min = Infinity;
    for (let fr = sub.row; fr < sub.row + sub.height; fr++)
      for (let fc = sub.col; fc < sub.col + sub.width; fc++)
        min = Math.min(min, Math.sqrt((fc-c)**2 + (fr-r)**2));
    return min;
  }

  // Expanding-ring search for the nearest valid empty footprint around a
  // point. Used as the accept()-time fallback when an offered A/B/C spot
  // is no longer available — searches outward from that spot instead of
  // jumping straight to findValidPlacement(), which is zone-agnostic and
  // can land the building anywhere in the substation/solar ring, far from
  // the zone it was originally offered next to (creating an orphaned new
  // zone even when the intended zone had plenty of room). ZoneSystem's
  // clustering merges any building placed within NEW_ZONE_DIST of an
  // existing zone member automatically, so staying local here is enough
  // to grow the existing zone rather than spawning a new one.
  function findNearbyValidPlacement(originCol, originRow, fw, fh, maxRadius = 25) {
    for (let radius = 1; radius <= maxRadius; radius++) {
      const candidates = [];
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue; // ring perimeter only
          const c = originCol + dc, r = originRow + dr;
          if (c < EDGE_MARGIN || r < EDGE_MARGIN ||
              c >= COLS - EDGE_MARGIN - fw + 1 || r >= ROWS - EDGE_MARGIN - fh + 1) continue;
          if (!GridManager.canPlaceFootprint(c, r, fw, fh)) continue;
          if (ZoneSystem.isInGovZone(c, r)) continue;
          const _d = ZoneSystem.distToGovZone(c, r);
          if (_d < ZoneSystem.GOV_RING_MIN || _d > ZoneSystem.GOV_RING_MAX) continue;
          if (!_hasOpenPerimeter(c, r, fw, fh)) continue;
          candidates.push({ col: c, row: r });
        }
      }
      if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return null;
  }

  function findValidPlacement(requireSubstation = false, footprint = { width: 1, height: 1 }) {
    const candidates = [];
    const fw = footprint.width, fh = footprint.height;

    // Check if any substation exists
    let hasSub = false;
    for (let sr = 0; sr < ROWS && !hasSub; sr++)
      for (let sc = 0; sc < COLS && !hasSub; sc++) {
        const e = GridManager.getEntity(sc, sr);
        if (e && (e.type === T.SUBSTATION || e.type === T.SUBSTATION2 || e.type === T.SUBSTATION3 || e.type === T.SUBSTATION4 || e.type === T.SUBSTATION5) && e.col === sc && e.row === sr) hasSub = true;
      }

    if (requireSubstation && !hasSub) return null;

    for (let r = EDGE_MARGIN; r < ROWS - EDGE_MARGIN - fh + 1; r++)
      for (let c = EDGE_MARGIN; c < COLS - EDGE_MARGIN - fw + 1; c++) {
        if (!GridManager.canPlaceFootprint(c, r, fw, fh)) continue;
        if (ZoneSystem.isInGovZone(c, r)) continue;
        { const _d = ZoneSystem.distToGovZone(c, r); if (_d < ZoneSystem.GOV_RING_MIN || _d > ZoneSystem.GOV_RING_MAX) continue; }
        if (!_hasOpenPerimeter(c, r, fw, fh)) continue;
        const cc = c + fw / 2 - 0.5, cr = r + fh / 2 - 0.5;

        if (hasSub) {
          // With substation: spawn in ring (6-16 tiles away)
          let inRing = false;
          for (let sr = 0; sr < ROWS && !inRing; sr++)
            for (let sc = 0; sc < COLS && !inRing; sc++) {
              const sub = GridManager.getEntity(sc, sr);
              if (!sub || sub.type !== T.SUBSTATION || sub.col !== sc || sub.row !== sr) continue;
              const d = distToSubstation(cc, cr, sub);
              if (d >= MIN_DIST && d <= MAX_DIST) inRing = true;
            }
          if (inRing) candidates.push({ col: c, row: r });
        } else {
          // No substation yet: spawn near solar infrastructure (8-18 tiles)
          let nearSolar = false;
          for (let sr = 0; sr < ROWS && !nearSolar; sr++)
            for (let sc = 0; sc < COLS && !nearSolar; sc++) {
              const e = GridManager.getEntity(sc, sr);
              if (!e || (e.type !== T.SOLAR && e.type !== T.SOLAR2 && e.type !== T.SOLAR3 && e.type !== T.WIND && e.type !== T.WIND2 && e.type !== T.WIND3)) continue;
              const d = Math.sqrt((sc-cc)**2 + (sr-cr)**2);
              if (d >= 7 && d <= 18) nearSolar = true;
            }
          if (nearSolar) candidates.push({ col: c, row: r });
        }
      }

    if (!candidates.length) {
      // Fallback: any empty footprint within the edge margin (still respecting gov-zone buffer)
      for (let r = EDGE_MARGIN; r < ROWS - EDGE_MARGIN - fh + 1; r++)
        for (let c = EDGE_MARGIN; c < COLS - EDGE_MARGIN - fw + 1; c++) {
          if (!GridManager.canPlaceFootprint(c, r, fw, fh)) continue;
          if (ZoneSystem.isInGovZone(c, r)) continue;
          const _d = ZoneSystem.distToGovZone(c, r);
          if (_d < ZoneSystem.GOV_RING_MIN || _d > ZoneSystem.GOV_RING_MAX) continue;
          if (!_hasOpenPerimeter(c, r, fw, fh)) continue;
          candidates.push({ col: c, row: r });
        }
    }

    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // Pick N well-spread candidate locations for a request to choose from.
  // Returns an array of {col, row} (may be fewer than N if map is cramped).
  // neighbourType: if set, at least one pick will be within NEAR_DIST tiles of
  // an existing entity of that type (so the player can build a cluster).
  // A candidate tile is rejected if it falls within this many tiles of a
  // zone of a *different* type (e.g. a commercial request landing near an
  // industrial zone). Same-type zones are exempt — expanding your own
  // zone is expected. Used by every request-placement pool below.
  // A footprint with zero open (buildable) perimeter tiles can never be
  // reached by a wire — every side is flush against another building/zone
  // rect/water. Used everywhere a candidate spawn tile is validated so a
  // request can never wedge itself into a spot with no way to power it.
  function _hasOpenPerimeter(c, r, fw, fh) {
    for (let cc = c; cc < c + fw; cc++) {
      if (GridManager.canPlaceFootprint(cc, r - 1, 1, 1)) return true;
      if (GridManager.canPlaceFootprint(cc, r + fh, 1, 1)) return true;
    }
    for (let rr = r; rr < r + fh; rr++) {
      if (GridManager.canPlaceFootprint(c - 1, rr, 1, 1)) return true;
      if (GridManager.canPlaceFootprint(c + fw, rr, 1, 1)) return true;
    }
    return false;
  }

  const CROSS_ZONE_CLEARANCE = 12;
  function _tooCloseToDifferentZoneType(c, r, myKey) {
    for (const k of ['residential', 'commercial', 'industrial']) {
      if (k === myKey) continue;
      for (const rect of (ZoneSystem.getZoneRects?.(k) || [])) {
        const edC = Math.max(0, Math.max(c - rect.maxC, rect.minC - c));
        const edR = Math.max(0, Math.max(r - rect.maxR, rect.minR - r));
        if (edC + edR < CROSS_ZONE_CLEARANCE) return true;
      }
    }
    return false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Zone-anchored option placement.
  //
  // Rule (identical for residential, commercial and industrial): option N is
  // anchored to zone N, and "anchored" means CLOSE ENOUGH TO MERGE - within
  // ZONE_MERGE_DIST of that zone's nearest building, so accepting it grows
  // the zone the player already has instead of starting another one. A slot
  // with no zone to anchor to is free, and is placed deliberately FAR from
  // every same-type zone so it seeds a new one.
  //   0 zones  -> helper no-ops, initial pickCandidateLocations picks stand.
  //   1 zone   -> A joins zone 1; B..E are fresh seeds.
  //   2 zones  -> A joins zone 1, B joins zone 2; C..E are fresh seeds.
  //   ...and so on up to ANCHOR_SLOTS (5) zones, where each of A..E joins one.
  // F and G are always far-out fresh seeds, whatever the zone count. An
  // anchored option fills empty ground inside its zone before it grows it,
  // and grows it away from neighbouring zones (ZoneSystem.ZONE_GROW_GAP).
  // Zone order is ZoneSystem's, which is stable (sorted by earliest-placed
  // building), so "zone 1" means the same zone from one request to the next.
  // -------------------------------------------------------------------------
  const ZONE_MERGE_DIST      = 10;  // MUST equal NEW_ZONE_DIST in zone_system.js.
                                    // Options within this Manhattan distance (edge-to-edge)
                                    // of an existing zone's nearest BUILDING merge into it
                                    // on accept; beyond it they seed a new zone.
                                    // This sat at 6 while ZoneSystem used 10. That did not
                                    // break merging (6 < 10 still merges) but it needlessly
                                    // shrank every anchored slot's candidate pool, making
                                    // "nothing found near the zone" - and the new-zone
                                    // fallback that followed - far likelier than intended.
  // A free slot seeds a NEW zone, so it keeps well clear of every existing
  // same-type zone — and a bigger zone pushes it further: the required gap is
  // NEW_ZONE_MIN_DIST plus NEW_ZONE_SIZE_K × that zone's size (the longer
  // side of its rect). A 40-tile neighbourhood wants new ones 65 tiles off.
  const NEW_ZONE_MIN_DIST    = 45;
  const NEW_ZONE_SIZE_K      = 0.5;
  // A free slot relaxes its distance only down to this (and a quarter of the
  // zone's size), never to merge range: free slots are there to offer a
  // genuinely separate neighbourhood, so they must never land beside one.
  const NEW_ZONE_MIN_FLOOR   = 30;
  const NEW_ZONE_FLOOR_K     = 0.25;
  // A new zone also keeps a size-aware buffer from zones of OTHER types
  // (the flat CROSS_ZONE_CLEARANCE still governs growing an existing zone).
  const NEW_ZONE_CROSS_BASE  = 20;
  const NEW_ZONE_CROSS_K     = 0.25;
  const zoneSize = (rect) => Math.max(rect.maxC - rect.minC + 1, rect.maxR - rect.minR + 1);
  const NEW_ZONE_MAX_FROM_GC = 120; // free-slot option ≤ this from grid centroid — wide
                                    // enough to take in the whole City Hall ring, so new
                                    // zones can sit anywhere round it, not only on its inner edge
  const INFILL_MARGIN        = 3;   // tiles of slack around a zone rect still counted "inside" it
  const OPTION_SEPARATION    = 6;   // options in same request must be ≥ this apart
  // Two FREE options exist to offer two DIFFERENT new neighbourhoods, so they
  // have to be far enough apart that accepting one wouldn't have swallowed the
  // other. OPTION_SEPARATION (6) is under ZoneSystem's NEW_ZONE_DIST (10), so
  // B and C could land 6 tiles apart and describe the same future zone twice —
  // the player sees "two new-zone options" and gets one. Must stay > the merge
  // distance, with slack for the footprint's own width — and in practice
  // much more than that: the new-zone options are there to offer genuinely
  // different parts of the map, not four spots in one clearing. The pick
  // itself also maximises spread (_pickSpread); this is the floor it has to
  // clear before the search starts relaxing.
  const NEW_ZONE_SEPARATION  = 40;
  const GOV_BUFFER_ZA        = ZoneSystem.GOV_RING_MIN;
  const GOV_MAX_ZA           = ZoneSystem.GOV_RING_MAX;

  // Every placed building ZoneSystem counts as a member of `zoneKey`'s zones.
  //
  // This MUST agree with ZoneSystem.zoneFor()/computeZonesForType(), because
  // the zone rects come from there and the anchoring below measures distance
  // to these buildings to decide whether an option will merge into a zone.
  // Where the two disagreed, the anchoring measured to the wrong set:
  //   - industrial: ZoneSystem counts `isIndustrial` buildings whatever their
  //     entity type, and an industrial customer can be a T.COMMERCIAL entity
  //     carrying that flag (see the accept path and getBuildingsOfType).
  //     Reading only T.INDUSTRIAL left such a zone with an EMPTY building
  //     list, so _distToZoneBuildings fell back to bounding-rect distance —
  //     an underestimate, since a rect corner can be empty. An option 10 from
  //     the rect but 15 from the nearest real building passed the merge check
  //     and then started a new zone anyway. That is the "B was too far from
  //     my 2nd industrial zone" report.
  //   - commercial: the same flagged buildings had to be EXCLUDED here, or a
  //     commercial option measures itself against factories.
  //   - residential: ZoneSystem counts T.CABIN too, so Mae's cabin is part of
  //     the first neighbourhood and options must be able to grow toward it.
  // `fromRequest` mirrors the filter in computeZonesForType.
  function _zoneMemberBuildings(zoneKey) {
    const out = [];
    const add = (e) => { if (e.fromRequest) out.push(e); };
    if (zoneKey === 'industrial') {
      for (const e of EntityRegistry.getByType(T.INDUSTRIAL)) add(e);
      for (const e of EntityRegistry.getByType(T.COMMERCIAL))  if (e.isIndustrial) add(e);
    } else if (zoneKey === 'commercial') {
      for (const e of EntityRegistry.getByType(T.COMMERCIAL)) if (!e.isIndustrial) add(e);
    } else if (zoneKey === 'residential') {
      for (const t of [T.HOUSE, T.CABIN]) for (const e of EntityRegistry.getByType(t)) add(e);
    }
    return out;
  }

  function _gridCentroidZA() {
    let sumC = 0, sumR = 0, n = 0;
    const INFRA = [T.WIRE, T.POLE, T.SOLAR, T.SOLAR2, T.SOLAR3, T.WIND, T.WIND2, T.WIND3, T.BIOFUELGEN,
                   T.RESEARCH, T.RESEARCH2, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5,
                   T.MONITOR, T.MONITOR2, T.GEOWELL, T.GEOTURBINE, T.COALGENERATOR, T.HYDROGENERATOR, T.POWERTOWER];
    for (const t of INFRA) for (const e of EntityRegistry.getByType(t)) { sumC += e.col; sumR += e.row; n++; }
    return n > 0 ? { col: Math.round(sumC/n), row: Math.round(sumR/n) }
                 : { col: Math.floor(COLS/2), row: Math.floor(ROWS/2) };
  }

  // The options a request starts from, before _anchorOptionsToZones. Once a
  // zone of this type exists that pass re-places every one of them (A..E are
  // anchored or re-picked as new-zone slots, F and G go far out), so the
  // whole-map candidate search behind pickCandidateLocations was being paid
  // for and thrown away: about a second and a half of frozen game per request
  // on a built-up map. It is only run now for the first zone of a type.
  function* _firstGuessLocations(requireSubstation, fp, neighbourType, zoneKey) {
    if ((ZoneSystem.getZoneRects?.(zoneKey) || []).length) return [];
    return yield* _candidateLocationSteps(requireSubstation, OPTION_COUNT, fp, neighbourType);
  }

  // Reachability is answered from a precomputed Manhattan distance field
  // rather than by rescanning the infrastructure list per candidate. The
  // linear scan was O(candidates x infra entities), and a built-out city has
  // thousands of wires, so on an industrial request (which scans the map for
  // its free slot) that alone cost over a second of frozen game. Two sweeps
  // of a chamfer distance transform over the grid is one linear pass and
  // gives the identical answer: "is any infra tile within maxDist
  // Manhattan tiles of this one".
  // Returns a (c, r) test; a null maxDist means no cap.
  function _infraReachTest(maxDist) {
    let _reach = null;
    if (maxDist !== null) {
      const TYPES = [T.WIRE, T.POLE, T.POWERTOWER, T.SOLAR, T.SOLAR2, T.SOLAR3,
        T.WIND, T.WIND2, T.WIND3, T.BIOFUELGEN, T.GEOWELL, T.GEOTURBINE, T.COALGENERATOR, T.HYDROGENERATOR,
        T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5, T.RESEARCH, T.RESEARCH2,
        T.MONITOR, T.MONITOR2, T.PROTECTOR, T.PROTECTOR2, T.PROTECTOR3, T.SURVEY, T.SURVEY2];
      const BIG = 0x3fffffff;
      const dist = new Int32Array(COLS * ROWS).fill(BIG);
      let seeded = 0;
      for (const t of TYPES) for (const e of EntityRegistry.getByType(t)) {
        if (e.col < 0 || e.col >= COLS || e.row < 0 || e.row >= ROWS) continue;
        dist[e.row * COLS + e.col] = 0; seeded++;
      }
      if (seeded) {
        // Forward sweep (up/left neighbours), then backward (down/right).
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
          const i = r * COLS + c;
          let d = dist[i];
          if (r > 0)  { const u = dist[i - COLS] + 1; if (u < d) d = u; }
          if (c > 0)  { const l = dist[i - 1]    + 1; if (l < d) d = l; }
          dist[i] = d;
        }
        for (let r = ROWS - 1; r >= 0; r--) for (let c = COLS - 1; c >= 0; c--) {
          const i = r * COLS + c;
          let d = dist[i];
          if (r < ROWS - 1) { const dn = dist[i + COLS] + 1; if (dn < d) d = dn; }
          if (c < COLS - 1) { const rt = dist[i + 1]    + 1; if (rt < d) d = rt; }
          dist[i] = d;
        }
        _reach = dist;
      }
    }
    return (c, r) => {
      if (maxDist === null || !_reach) return true;   // no cap, or no infra placed yet
      return _reach[r * COLS + c] <= maxDist;
    };
  }

  // `info` ({ subtype, tier }) says what the request is, so NeighbourhoodPlan
  // can pick the plot that suits it within each slot's allowed sites.
  function* _anchorOptionsToZones(zoneKey, fp, locs, info = null) {
    const rects = (ZoneSystem.getZoneRects?.(zoneKey) || []).slice();
    console.log(`[anchor] zoneKey=${zoneKey} fp=${fp.width}x${fp.height} zoneCount=${rects.length}`);
    if (rects.length) {
      rects.forEach((r, i) => console.log(`[anchor]   zone[${i}] minC=${r.minC} maxC=${r.maxC} minR=${r.minR} maxR=${r.maxR}`));
    }
    console.log(`[anchor]   initialLocs:`, locs.map(l => l ? `(${l.col},${l.row})` : 'null').join(', '));
    if (!rects.length) {
      // Nothing was placeable at all (no substation yet, say): no request.
      if (!locs.length) return;
      // The FIRST zone of this type has nothing to anchor to, but the same rule
      // holds: some options should start it well away from town.
      yield* _makeRemoteNewZoneOptions(fp, locs, new Set(), (c, r, slot, minSep) =>
        locs.every((o, j) => j === slot || !o || Math.abs(o.col - c) + Math.abs(o.row - r) >= minSep));
      for (let i = locs.length - 1; i >= 0; i--) if (!locs[i]) locs.splice(i, 1);   // keep the letters contiguous
      return;
    }
    // ZoneSystem returns rects already sorted by earliest-placed building --
    // that IS the player's zone 1 / zone 2 / zone 3. This used to _shuffle()
    // them, which threw the mapping away: option A anchored to a random zone
    // rather than to zone 1. With more than three zones we still sample which
    // three get an option, but the sampled three are restored to zone order so
    // A/B/C stay ascending.
    // With more than three zones only three can be offered, but A and B are
    // not up for sampling: "A is my first neighbourhood, B is my second" is
    // the whole reason the options read as stable from one request to the
    // next. Only the third slot rotates, so zones 4+ still get offers.
    // (With ANCHOR_SLOTS anchored options, the first ANCHOR_SLOTS-1 zones are fixed
    // and only the last slot rotates.)
    const allRects = rects.slice();   // every same-type zone — new-zone slots keep clear of all of them
    if (rects.length > ANCHOR_SLOTS) {
      const _rest = rects.slice(ANCHOR_SLOTS - 1);
      const _keep = [...rects.slice(0, ANCHOR_SLOTS - 1), _rest[Math.floor(Math.random() * _rest.length)]];
      rects.length = 0;
      rects.push(..._keep);
    }
    // F and G are never anchored (FAR_SLOTS), however many zones there are.
    const anchored = Math.min(rects.length, ANCHOR_SLOTS);
    // The new-zone search is centred on City Hall. It used to be centred on
    // the centroid of the player's infrastructure, which a big plant built
    // off to one side drags that way, and then every near new-zone option
    // came out on that side of town. Falls back to the centroid only on a map
    // with no government zone.
    const _hallZA = ZoneSystem.govZoneCentre?.();
    const gc = _hallZA ? { col: Math.round(_hallZA.c), row: Math.round(_hallZA.r) } : _gridCentroidZA();
    const fw = fp.width, fh = fp.height;

    // Bucket the actual buildings of this zoneKey into each rect by anchor
    // position. Distance must be measured to the NEAREST BUILDING, not to
    // the rect edge — the rect is a bounding box that can have empty corners,
    // so a candidate at rect-edge distance 10 may be at edge distance 13+
    // from the actual nearest building, which would fail NEW_ZONE_DIST merge.
    const zoneMembers = _zoneMemberBuildings(zoneKey);
    const buildingsByRect = rects.map(() => []);
    for (const e of zoneMembers) {
      for (let ri = 0; ri < rects.length; ri++) {
        const rect = rects[ri];
        if (e.col >= rect.minC && e.col <= rect.maxC && e.row >= rect.minR && e.row <= rect.maxR) {
          buildingsByRect[ri].push({ col: e.col, row: e.row, width: e.width || 1, height: e.height || 1, e });
          break;
        }
      }
    }

    // Track which slots have been claimed so free slots avoid them.
    const claimedSlots = new Set();

    // Commercial and industrial requests must stay within reach of the grid.
    // Commercial: 30 tiles ≈ "modest wire run". Industrial: 40 tiles ≈ same
    // idea but a bit looser since factories often sit on the outskirts.
    // Residential is unconstrained (cabins/test connections seed outward).
    const MAX_FROM_INFRA = (zoneKey === 'commercial') ? 30
                        : (zoneKey === 'industrial') ? 40 : null;
    const _withinReach = _infraReachTest(MAX_FROM_INFRA);

    // The "stay near the city" cap must never exclude the INSIDE of a zone the
    // player already has. A zone that sits at or beyond GOV_MAX_ZA (industrial
    // especially — the first one is deliberately sited 40-50 tiles out) would
    // otherwise have every interior tile rejected, so options could only ever
    // land outside it and the zone got pushed further out with each request.
    // Stretch the cap to cover the farthest building of this zone type, plus a
    // little slack so infill has somewhere to go.
    let _govMax = GOV_MAX_ZA;
    for (const b of zoneMembers) {
      const bd = ZoneSystem.distToGovZone(b.col, b.row);
      if (bd > _govMax - 10) _govMax = bd + 10;
    }

    // opts lets an anchored slot drop the two SOFT guards when the strict
    // pass finds nothing: the open-perimeter check and the gov-zone distance
    // floor. Never negotiable: the footprint has to fit, on land, outside the
    // government zone itself, and inside _govMax.
    const _placeable = (c, r, opts) => {
      const perimeter = !opts || opts.perimeter !== false;
      const govFloor  = (opts && opts.govFloor !== undefined) ? opts.govFloor : GOV_BUFFER_ZA;
      const govMax    = (opts && opts.govMax   !== undefined) ? opts.govMax   : _govMax;
      const _d = ZoneSystem.distToGovZone(c, r);
      return GridManager.canPlaceFootprint(c, r, fw, fh) &&
      !ZoneSystem.isInGovZone(c, r) &&
      _d >= govFloor && _d <= govMax &&
      !WaterSystem.isWater(c, r) &&
      _withinReach(c, r) &&
      (!perimeter || _hasOpenPerimeter(c, r, fw, fh));
    };

    const _distToRect = (c, r, rect) => {
      const nc = Math.max(rect.minC, Math.min(rect.maxC, c));
      const nr = Math.max(rect.minR, Math.min(rect.maxR, r));
      return Math.abs(c - nc) + Math.abs(r - nr);
    };

    // Fraction of tiles in a ring around a candidate footprint that are
    // still buildable. Two spots can both satisfy the same zone-merge
    // distance band, but one may be wedged directly against existing
    // buildings while another sits in open space just as close to the
    // zone — this lets picking prefer the latter instead of whichever
    // cramped tile happened to pass the distance check first.
    const OPENNESS_RADIUS = 4;
    const _openness = (c, r) => {
      let open = 0, total = 0;
      for (let rr = r - OPENNESS_RADIUS; rr < r + fh + OPENNESS_RADIUS; rr++) {
        for (let cc = c - OPENNESS_RADIUS; cc < c + fw + OPENNESS_RADIUS; cc++) {
          if (cc >= c && cc < c + fw && rr >= r && rr < r + fh) continue; // skip own footprint
          total++;
          if (GridManager.canPlaceFootprint(cc, rr, 1, 1)) open++;
        }
      }
      return total > 0 ? open / total : 0;
    };

    // Narrow a candidate pool down to its most open ~40% before the random
    // pick, so placement favours breathing room over pure proximity.
    const _preferOpen = (pool) => {
      if (pool.length <= 1) return pool;
      const scored = pool.map(p => ({ p, score: _openness(p.col, p.row) }));
      scored.sort((a, b) => b.score - a.score);
      const keep = Math.max(1, Math.ceil(scored.length * 0.4));
      return scored.slice(0, keep).map(s => s.p);
    };

    // Which of a slot's allowed sites to offer. NeighbourhoodPlan scores
    // them against the zone's street lattice and its neighbours (frontage,
    // the gap to the building beside it, like with like, transitions to the
    // other zone types) with a random draw on top, so the zone fills out in
    // streets and blocks. It only ever chooses from `pool`: every placement
    // rule above has already been applied. Declined spots are still kept
    // clear while anything else is on offer, as _pickFresh does.
    const _planCtx = [];
    const _planPick = (pool, ri) => {
      if (typeof NeighbourhoodPlan === 'undefined' || !NeighbourhoodPlan.enabled()) return _pickFresh(_preferOpen(pool));
      const avail = pool.filter(p => !_declinedLocs.some(dl => Math.abs(dl.col - p.col) + Math.abs(dl.row - p.row) < 15));
      const X = _planCtx[ri] || (_planCtx[ri] = NeighbourhoodPlan.context(zoneKey, rects[ri], buildingsByRect[ri], fw, fh, info));
      const pick = NeighbourhoodPlan.pick(X, avail.length ? avail : pool);
      if (pick) { _lastLocs.push(pick); if (_lastLocs.length > 9) _lastLocs.shift(); }
      return pick;
    };
    // How well a picked site sits in the plan of zone `ri` (no random draw).
    const _planScore = (p, ri) => {
      if (!p || typeof NeighbourhoodPlan === 'undefined' || !NeighbourhoodPlan.enabled() || !_planCtx[ri]) return 0;
      return NeighbourhoodPlan.score(_planCtx[ri], p.col, p.row);
    };
    // Filling a zone's own ground comes first while there's a good plot in
    // it. A plot inside that would sit off the streets or in someone's back
    // garden is only held in reserve: a well-set plot on the zone's edge
    // (from the tiers below) beats it, and it is used if there's none.
    const PLAN_GOOD_INSIDE = 7, PLAN_INSIDE_BONUS = 1.5;

    // True edge-to-edge Manhattan distance from a candidate placement (col c,
    // row r, footprint fw×fh) to the nearest actual building in rect index ri.
    // Mirrors ZoneSystem's edgeDist so a result ≤ NEW_ZONE_DIST guarantees
    // the placement will merge into the zone.
    // Every candidate an anchored slot can accept lies within ZONE_MERGE_DIST
    // of the zone it is anchored to (or inside that zone's rect, plus the
    // infill margin), so the search only ever needs the box around that zone
    // rather than all ~500k tiles of the map. Scanning the whole grid per
    // guard tier per slot was costing hundreds of milliseconds on a large
    // footprint; this keeps the tier ladder cheap enough to always walk.
    const _zoneBox = (rect) => {
      const pad = ZONE_MERGE_DIST + Math.max(fw, fh) + INFILL_MARGIN;
      return {
        c0: Math.max(EDGE_MARGIN, rect.minC - pad),
        c1: Math.min(COLS - EDGE_MARGIN - fw, rect.maxC + pad),
        r0: Math.max(EDGE_MARGIN, rect.minR - pad),
        r1: Math.min(ROWS - EDGE_MARGIN - fh, rect.maxR + pad),
      };
    };

    const _distToZoneBuildings = (c, r, ri) => {
      const list = buildingsByRect[ri];
      // Bounding-rect distance UNDERESTIMATES distance to the nearest real
      // building (empty rect corners), so using it for the merge test lets an
      // option through that ZoneSystem then refuses to merge. With the
      // collector above a rect always has members, so this is a guard against
      // future drift rather than a live path — bias it so a wrong answer
      // fails the merge test instead of passing it.
      if (!list || !list.length) return _distToRect(c, r, rects[ri]) + ZONE_MERGE_DIST;
      let minD = Infinity;
      for (let k = 0; k < list.length; k++) {
        const b = list[k];
        const dc = Math.max(0, Math.max(c - (b.col + b.width - 1), b.col - (c + fw - 1)));
        const dr = Math.max(0, Math.max(r - (b.row + b.height - 1), b.row - (r + fh - 1)));
        const d  = dc + dr;
        if (d < minD) minD = d;
      }
      return minD;
    };

    // Whether a site at (c, r) becomes part of zone ri when built: within
    // ZONE_MERGE_DIST of one of its buildings, or with its whole footprint
    // inside the zone's outline (ZoneSystem.computeZonesForType counts both).
    const _fullyInRect = (c, r, rect) =>
      c >= rect.minC && r >= rect.minR && c + fw - 1 <= rect.maxC && r + fh - 1 <= rect.maxR;
    const _joinsZone = (c, r, ri) =>
      _fullyInRect(c, r, rects[ri]) || _distToZoneBuildings(c, r, ri) <= ZONE_MERGE_DIST;

    const _farFromChosen = (c, r, mySlot, minSep = OPTION_SEPARATION) => {
      for (let j = 0; j < locs.length; j++) {
        if (j === mySlot) continue;
        const o = locs[j];
        if (o && Math.abs(o.col - c) + Math.abs(o.row - r) < minSep) return false;
      }
      return true;
    };

    // Zones keep their distance from each other as they grow. A site that
    // would stretch `rect` TOWARD another zone of any type, the government
    // zone included, to within ZoneSystem.ZONE_GROW_GAP is refused, so a
    // zone with a neighbour to its east is only offered sites on its other
    // sides. A site inside the rect doesn't grow it and is always fine. This
    // is never relaxed: when every side of a zone is closed, its slot goes
    // to another zone that still has room, or to a new zone.
    const _crowdsNeighbour = (c, r, rect) => {
      if (c >= rect.minC && r >= rect.minR && c + fw - 1 <= rect.maxC && r + fh - 1 <= rect.maxR) return false;
      const grown = { minC: Math.min(rect.minC, c), maxC: Math.max(rect.maxC, c + fw - 1),
                      minR: Math.min(rect.minR, r), maxR: Math.max(rect.maxR, r + fh - 1) };
      return ZoneSystem.crowdsZones(rect, grown);
    };

    // ────────────────────────────────────────────────────────────────
    // (1) Anchored slots — one option PER existing zone, guaranteed, and
    // always within merge range of it. Order tried, per slot:
    //   interior infill  ->  within ZONE_MERGE_DIST of its own zone
    //   ->  within ZONE_MERGE_DIST of any OTHER same-type zone  ->  give up.
    // Each distance step tries a strict pool first, then a relaxed one that
    // drops the option-separation guard: keeping the option inside its zone
    // matters more than spacing the three choices apart.
    // ────────────────────────────────────────────────────────────────

    // Interior infill — a zone's own bounding box often has unfilled gaps
    // (tiles boxed in by roads/other buildings) that sit farther than
    // ZONE_MERGE_DIST from the nearest building in raw distance, even
    // though they're visually "inside" the zone already. Always tried first:
    // if a zone has usable interior space, an option should land in it rather
    // than outside, which only pushes the zone outward. Falls straight through
    // to the distance bands below when there's genuinely no room inside, so
    // making this unconditional costs nothing.
    const INFILL_BIAS   = 1.0;
    const _isInZoneRect = (c, r, rect) =>
      c + fw - 1 >= rect.minC - INFILL_MARGIN && c <= rect.maxC + INFILL_MARGIN &&
      r + fh - 1 >= rect.minR - INFILL_MARGIN && r <= rect.maxR + INFILL_MARGIN;

    for (let i = 0; i < anchored; i++) {
      const rect = rects[i];
      let picked = null;
      let pickedBand = null, pickedKind = null;
      let insideAlt = null;   // an inside plot held in reserve (see PLAN_GOOD_INSIDE)

      // How close to the government zone this zone's OWN buildings already
      // stand (never closer than inside it). Filling the zone's interior
      // goes no nearer City Hall than the zone already is, so the interior
      // passes below are held to this rather than to GOV_BUFFER_ZA (55): a
      // zone built up against City Hall otherwise had every inside plot
      // refused as "too close to the government", and its only options were
      // ever on the far rim (the tier ladder below drops to this floor, the
      // interior passes didn't), pushing it outward with each request.
      const _zoneGovFloor = (() => {
        let f = GOV_BUFFER_ZA;
        for (const b of buildingsByRect[i] || []) f = Math.min(f, ZoneSystem.distToGovZone(b.col, b.row));
        return f;
      })();
      const _insideOpts = { govFloor: _zoneGovFloor };

      // Fill the zone before growing it. A site whose whole footprint lies
      // inside the zone's own rect uses up empty ground the zone already
      // encloses and pushes its edge nowhere, so it is taken ahead of
      // everything below. (The infill pass that follows also counts
      // INFILL_MARGIN tiles outside the rect as "inside" and then prefers the
      // most OPEN candidates, which between them kept choosing the rim.) Of
      // the sites that fit, the deepest half are kept: the ones furthest from
      // the rect's edge. Tried with the cross-type clearance and then without
      // it, since the inside of a zone that already sits near another type is
      // still the inside of that zone.
      {
        const c0 = Math.max(EDGE_MARGIN, rect.minC), c1 = Math.min(COLS - EDGE_MARGIN - fw, rect.maxC - fw + 1);
        const r0 = Math.max(EDGE_MARGIN, rect.minR), r1 = Math.min(ROWS - EDGE_MARGIN - fh, rect.maxR - fh + 1);
        // No cross-type clearance in here. It keeps a NEW zone from being
        // started against another type; the inside of a zone that already
        // stands beside one is still its own ground, and NeighbourhoodPlan
        // weighs what sits next door. Applied first, it threw out the plots
        // beside the zone's own buildings whenever another zone was within
        // 12 tiles, leaving the plan to choose among stray gaps.
        for (const cross of [false]) {
          const apart = [], close = [];
          for (let r = r0; r <= r1; r++) {
            yield;
            for (let c = c0; c <= c1; c++) {
              // Wholly inside the outline, so it joins this zone wherever it
              // stands in it (see _joinsZone), near a building or not.
              if (!_placeable(c, r, _insideOpts)) continue;
              (_farFromChosen(c, r, i) ? apart : close).push({ col: c, row: r });
            }
          }
          const inside = apart.length ? apart : close;
          if (!inside.length) continue;
          // An inside plot is always taken when there is one. The plan
          // still chooses WHICH inside plot, but it no longer gets to trade
          // one away for a better-scored plot on the rim: its "grow the
          // short side" term pays up to +5.5 for pushing the edge out, which
          // outbid the inside bonus, so a zone with a block of open ground
          // in it kept offering nothing but expansions.
          picked = _planPick(inside, i); pickedBand = 0; pickedKind = cross ? 'inside' : 'inside/nocross';
          console.log(`[anchor]   slot=${i} inside=${inside.length}`);
          break;
        }
      }

      if (!picked && Math.random() < INFILL_BIAS) {
        const infill = [];
        const ib = _zoneBox(rect);
        for (let r = ib.r0; r <= ib.r1; r++) {
          yield;
          for (let c = ib.c0; c <= ib.c1; c++) {
            if (!_isInZoneRect(c, r, rect)) continue;
            if (_crowdsNeighbour(c, r, rect)) continue;
            // Being inside the bounding rect is NOT membership. ZoneSystem
            // clusters by distance between buildings, never by rect, so a
            // site in an empty corner of the box (or out in INFILL_MARGIN)
            // more than ZONE_MERGE_DIST from every building becomes its own
            // zone on accept — even while sitting visually "inside" this one.
            if (_distToZoneBuildings(c, r, i) > ZONE_MERGE_DIST) continue;
            if (!_farFromChosen(c, r, i)) continue;
            if (_tooCloseToDifferentZoneType(c, r, zoneKey)) continue;
            if (!_placeable(c, r, _insideOpts)) continue;
            infill.push({ col: c, row: r });
          }
        }
        console.log(`[anchor]   slot=${i} infill=${infill.length}`);
        if (infill.length) {
          const p = _planPick(infill, i);
          const sc = _planScore(p, i) + PLAN_INSIDE_BONUS;
          if (sc >= PLAN_GOOD_INSIDE || !_planCtx[i]) { picked = p; pickedBand = 0; pickedKind = 'infill'; }
          else if (p && (!insideAlt || sc > insideAlt.s)) insideAlt = { p, s: sc, kind: 'infill/held' };
        }
      }

      // An anchored slot exists to GROW the zone it is anchored to. Anything
      // past ZONE_MERGE_DIST seeds a brand new zone on accept, so the wider
      // bands (14/20/30/45) this used to walk for slots 1 and 2 quietly turned
      // "B joins zone 2" into "B starts a fourth zone 30 tiles away". The cap
      // was applied to slot 0 only; it belongs on every anchored slot.
      //
      // The merge distance is the one guard that is never relaxed — pass it
      // and the option grows this zone, fail it and the option starts another
      // one, which is the entire bug this slot exists to prevent. Everything
      // else gives way in tiers, because a slot that finds nothing falls
      // through to the free-slot pass and seeds a distant new zone: exactly
      // the outcome the player sees as "none of A/B/C were near my zones".
      //   cross     — CROSS_ZONE_CLEARANCE (12) is WIDER than the merge band
      //               (10), so a single commercial/industrial zone beside a
      //               residential one can wipe out every candidate around it.
      //               A hemmed-in zone still has to be able to grow.
      //   perimeter — an infill pocket flush against its neighbours is worse
      //               than a new zone 40 tiles out, but only just.
      //   govFloor  — dropped to how close this zone's OWN buildings already
      //               sit to the government zone (never inside it), so a
      //               neighbourhood that grew toward City Hall can still
      //               infill alongside what the player already placed
      //               (_zoneGovFloor, above).
      //   gap       — the zone spacing rule (_crowdsNeighbour) is NOT one of
      //               these: it holds in every tier. A zone that can only grow
      //               toward a neighbour doesn't grow; its slot goes to another
      //               zone (the rescue below) or to a new zone instead.
      const TIERS = [
        { cross: true,  gap: true, opts: undefined },
        { cross: false, gap: true, opts: undefined },
        { cross: false, gap: true, opts: { perimeter: false } },
        { cross: false, gap: true, opts: { perimeter: false, govFloor: _zoneGovFloor } },
      ];
      for (let ti = 0; ti < TIERS.length && !picked; ti++) {
        const tier = TIERS[ti];
        const strict = [], relaxed = [];
        const bb = _zoneBox(rect);
        for (let r = bb.r0; r <= bb.r1; r++) {
          yield;
          for (let c = bb.c0; c <= bb.c1; c++) {
            if (_distToZoneBuildings(c, r, i) > ZONE_MERGE_DIST) continue;
            if (tier.gap && _crowdsNeighbour(c, r, rect)) continue;
            if (!_placeable(c, r, tier.opts)) continue;
            const crossOK = !tier.cross || !_tooCloseToDifferentZoneType(c, r, zoneKey);
            const sepOK   = _farFromChosen(c, r, i);
            if (crossOK && sepOK) strict.push({ col: c, row: r });
            else if (crossOK)     relaxed.push({ col: c, row: r });
          }
        }
        console.log(`[anchor]   slot=${i} tier=${ti} strict=${strict.length} relaxed=${relaxed.length}`);
        if (strict.length)  { picked = _planPick(strict, i);  pickedBand = ZONE_MERGE_DIST; pickedKind = `strict/t${ti}`;  }
        else if (relaxed.length) { picked = _planPick(relaxed, i); pickedBand = ZONE_MERGE_DIST; pickedKind = `relaxed/t${ti}`; }
      }

      if (insideAlt && (!picked || _planScore(picked, i) < insideAlt.s)) {
        picked = insideAlt.p; pickedBand = 0; pickedKind = insideAlt.kind;
      }

      // Still nothing adjacent to this zone? Try merging into any OTHER zone
      // of the same type before giving up. An anchored option is allowed to
      // attach to a different zone than the one it was nominally assigned --
      // what it must not do is land far enough away to start a new one.
      //
      // But only a zone that has no option of its own. Every zone in `rects`
      // gets an anchored slot, so a closed-in zone 1 used to send A into zone
      // 2 — where B was going anyway, and the player got two options at the
      // same neighbourhood. One option per zone: a slot whose zone is closed
      // goes to the free-slot pass instead and offers somewhere else. (With
      // more zones than slots, `rects` holds only the zones being offered,
      // so this rescue has nothing left to take; it stays for a zone set
      // that ever leaves one unanchored.)
      if (!picked) {
        // Same tier ladder as above — a rescue that only tries the strictest
        // guards is no rescue at all in the layouts that need one.
        for (let ti = 0; ti < TIERS.length && !picked; ti++) {
          const tier = TIERS[ti];
          for (let ri = 0; ri < rects.length && !picked; ri++) {
            if (ri === i || ri < anchored) continue;   // that zone has its own option
            const alt = [];
            const ab = _zoneBox(rects[ri]);
            for (let r = ab.r0; r <= ab.r1; r++) {
              yield;
              for (let c = ab.c0; c <= ab.c1; c++) {
                // Same rule as infill: inside the rect doesn't mean it merges.
                if (_distToZoneBuildings(c, r, ri) > ZONE_MERGE_DIST) continue;
                if (!_farFromChosen(c, r, i)) continue;
                if (tier.gap && _crowdsNeighbour(c, r, rects[ri])) continue;
                if (tier.cross && _tooCloseToDifferentZoneType(c, r, zoneKey)) continue;
                if (!_placeable(c, r, tier.opts)) continue;
                alt.push({ col: c, row: r });
              }
            }
            if (alt.length) {
              picked = _planPick(alt, ri);
              pickedBand = ZONE_MERGE_DIST; pickedKind = `mergeIntoZone${ri}/t${ti}`;
              console.log(`[anchor]   slot=${i} merged into zone[${ri}] instead, tier=${ti} pool=${alt.length}`);
            }
          }
        }
      }

      // There is deliberately no wider "last resort" band here. A placement 45
      // tiles from a zone does not join it -- it starts a new one -- so falling
      // back to that distance would defeat the whole point of the slot. If
      // nothing within ZONE_MERGE_DIST of ANY zone is placeable then the zones
      // really are boxed in, and the free-slot pass below seeds a new zone,
      // which is the correct answer in that case rather than a fudged one.

      // Last line of defence: whatever path produced it, an anchored option
      // that wouldn't merge into ANY zone of this type is exactly the bug
      // this slot exists to prevent. Drop it and let the free-slot pass
      // handle the "genuinely boxed in" case honestly.
      if (picked && !rects.some((_, ri) => _joinsZone(picked.col, picked.row, ri))) {
        console.warn(`[anchor]   slot=${i} REJECTED (${picked.col},${picked.row}) kind=${pickedKind}; would not merge into any zone`);
        picked = null;
      }

      if (picked) {
        let d = Infinity;
        for (let ri = 0; ri < rects.length; ri++) d = Math.min(d, _distToZoneBuildings(picked.col, picked.row, ri));
        const willMerge = d <= ZONE_MERGE_DIST || rects.some((_, ri) => _fullyInRect(picked.col, picked.row, rects[ri]));
        console.log(`[anchor]   slot=${i} PICKED (${picked.col},${picked.row}) distToZone=${d} ` +
                    `merges=${willMerge ? 'YES' : 'NO, WOULD START A NEW ZONE'} band=${pickedBand} kind=${pickedKind} ` +
                    `zoneBuildings=${(buildingsByRect[i] || []).length}`);
        locs[i] = picked; claimedSlots.add(i);
      } else {
        console.log(`[anchor]   slot=${i} FAILED: no placeable site within ${ZONE_MERGE_DIST} of zone[${i}] ` +
                    `(zoneBuildings=${(buildingsByRect[i] || []).length}, fp=${fw}x${fh}); falling through to the free-slot pass`, locs[i]);
      }
    }

    // ────────────────────────────────────────────────────────────────
    // (2) Free slots (only when fewer than OPTION_COUNT zones exist).
    // Far from same-type zones, near grid centroid. Progressive
    // relaxation as well so a slot is still filled on tight maps.
    // ────────────────────────────────────────────────────────────────
    // Guards are ordered cheapest-first on purpose. A free slot searches the
    // whole map, and _placeable ends in canPlaceFootprint — fw*fh tile probes,
    // 42 of them for a 6x7 co-op, which across ~500k positions is tens of
    // millions of probes and seconds of frozen game. The distance bands below
    // are a handful of arithmetic ops each and throw out the overwhelming
    // majority of the map first, so the footprint probe only ever runs on
    // positions that already passed everything else. Same pool, same result,
    // just not paid for on every tile.
    // Edge-to-edge distance from this footprint to the nearest building of
    // ANY same-type zone. The old check measured the candidate's top-left
    // tile to each zone's bounding rect, which under-reads for a big footprint
    // sitting left of / above a zone.
    // Free slots measure against EVERY same-type zone (allRects), not just the
    // ones that got an anchored slot. Buildings are bucketed per zone here the
    // same way as above, so the exact edge-to-edge check matches ZoneSystem.
    const allBuildings = allRects.map(() => []);
    for (const e of zoneMembers) {
      for (let ri = 0; ri < allRects.length; ri++) {
        const rect = allRects[ri];
        if (e.col >= rect.minC && e.col <= rect.maxC && e.row >= rect.minR && e.row <= rect.maxR) {
          allBuildings[ri].push({ col: e.col, row: e.row, width: e.width || 1, height: e.height || 1 });
          break;
        }
      }
    }
    const _edgeToBuildings = (c, r, list, rect) => {
      if (!list.length) return _distToRect(c, r, rect);
      let minD = Infinity;
      for (const b of list) {
        const dc = Math.max(0, Math.max(c - (b.col + b.width - 1), b.col - (c + fw - 1)));
        const dr = Math.max(0, Math.max(r - (b.row + b.height - 1), b.row - (r + fh - 1)));
        if (dc + dr < minD) minD = dc + dr;
      }
      return minD;
    };
    // True when (c,r) is at least base + k × size from every same-type zone.
    // Rect distance from the top-left tile is a cheap pre-filter; the exact
    // per-building check only runs near the boundary, where the footprint's
    // own size can close the gap.
    const _clearOfZones = (c, r, base, k) => {
      for (let ri = 0; ri < allRects.length; ri++) {
        const rect = allRects[ri];
        const need = base + k * zoneSize(rect);
        const rd = _distToRect(c, r, rect);
        if (rd < need) return false;
        if (rd < need + fw + fh && _edgeToBuildings(c, r, allBuildings[ri], rect) < need) return false;
      }
      return true;
    };
    // Size-aware buffer from zones of the other types, for a new zone.
    const _otherTypeRects = ['residential', 'commercial', 'industrial']
      .filter(k => k !== zoneKey)
      .flatMap(k => ZoneSystem.getZoneRects?.(k) || []);
    const _tooCloseToOtherTypeNew = (c, r) => _otherTypeRects.some(rect =>
      _distToRect(c, r, rect) < Math.max(CROSS_ZONE_CLEARANCE, NEW_ZONE_CROSS_BASE + NEW_ZONE_CROSS_K * zoneSize(rect)));
    function* buildFreePool(minFromZones, sizeK, maxFromGc, enforceCross, minSep, slotIdx, govMax) {
      const p = [];
      // Only the box around the centroid can satisfy maxFromGc, so walk that
      // instead of all ~500k map positions per tier.
      const r0 = Math.max(EDGE_MARGIN, gc.row - maxFromGc);
      const r1 = Math.min(ROWS - EDGE_MARGIN - fh, gc.row + maxFromGc);
      const c0 = Math.max(EDGE_MARGIN, gc.col - maxFromGc);
      const c1 = Math.min(COLS - EDGE_MARGIN - fw, gc.col + maxFromGc);
      for (let r = r0; r <= r1; r++) {
        yield;
        for (let c = c0; c <= c1; c++) {
          if (Math.abs(c - gc.col) + Math.abs(r - gc.row) > maxFromGc) continue;
          if (!_clearOfZones(c, r, minFromZones, sizeK)) continue;
          if (minSep > 0 && !_farFromChosen(c, r, slotIdx, minSep)) continue;
          if (enforceCross && _tooCloseToOtherTypeNew(c, r)) continue;
          if (ZoneSystem.footprintCrowdsZones(c, r, fw, fh)) continue;   // never relaxed, even in the backstops below
          if (!_placeable(c, r, govMax !== undefined ? { govMax } : undefined)) continue;
          p.push({ col: c, row: r });
        }
      }
      return p;
    }

    // Relaxation order matters. A free slot's whole job is "somewhere that
    // starts a NEW zone, distinct from the other options", so the search
    // widens its radius and drops cross-zone clearance before it gives up
    // either the distance from existing zones or the separation from the
    // other options — those two ARE the slot's purpose. The last line is a
    // "put something on the map" backstop for a map with nowhere left.
    // Distance from existing zones is the LAST thing given up, and only down
    // to NEW_ZONE_MIN_FLOOR — the search reaches further from the grid first.
    // It used to drop straight to merge range (10) and then to 0, which is how
    // a "new zone" B or C ended up pressed against the only zone on the map.
    // The zone band around City Hall is only so wide, so once size-aware
    // gaps have used it up, a new-zone option may sit further out (GOV_REACH)
    // before it gives up any distance from the existing zones.
    const GC_STEPS = [NEW_ZONE_MAX_FROM_GC, NEW_ZONE_MAX_FROM_GC + 30, NEW_ZONE_MAX_FROM_GC + 60, NEW_ZONE_MAX_FROM_GC + 100];
    const GC_WIDEST = GC_STEPS[GC_STEPS.length - 1];
    const GOV_REACH = [undefined, _govMax + 30, _govMax + 60];
    // Unclaimed slots still hold pickCandidateLocations' first guesses, which
    // this pass replaces. Left in, they count as "chosen" in _farFromChosen
    // and fence off everything within NEW_ZONE_SEPARATION of a spot that is
    // about to be thrown away — pushing the real picks to the relaxed pools.
    for (let i = 0; i < OPTION_COUNT; i++) if (!claimedSlots.has(i)) locs[i] = null;
    for (let i = 0; i < OPTION_COUNT; i++) {
      if (claimedSlots.has(i)) continue;
      let pool = [];
      for (const [minD, k] of [[NEW_ZONE_MIN_DIST, NEW_ZONE_SIZE_K], [NEW_ZONE_MIN_FLOOR, NEW_ZONE_FLOOR_K]]) {
        for (const govMax of GOV_REACH) {
          for (const gcMax of GC_STEPS) {
            if (pool.length) break;
            pool = yield* buildFreePool(minD, k, gcMax, true, NEW_ZONE_SEPARATION, i, govMax);
          }
          for (const gcMax of GC_STEPS) {
            if (pool.length) break;
            pool = yield* buildFreePool(minD, k, gcMax, false, NEW_ZONE_SEPARATION, i, govMax);
          }
          if (pool.length) break;
        }
        if (pool.length) break;
      }
      if (!pool.length) pool = yield* buildFreePool(NEW_ZONE_MIN_FLOOR, 0, GC_WIDEST, false, OPTION_SEPARATION, i, GOV_REACH[GOV_REACH.length - 1]);
      // Map genuinely full: anything that at least starts its own zone.
      if (!pool.length) pool = yield* buildFreePool(ZONE_MERGE_DIST + 1, 0, GC_WIDEST, false, OPTION_SEPARATION, i, GOV_REACH[GOV_REACH.length - 1]);
      console.log(`[anchor]   freeSlot=${i} pool=${pool.length}`);
      // Spread against every option placed so far — the anchored ones too.
      if (pool.length) locs[i] = _pickSpread(pool, locs);
    }
    // (3) F and G go somewhere far out, not just "clear of this zone type".
    yield* _makeRemoteNewZoneOptions(fp, locs, claimedSlots, _farFromChosen);
    // Options that join a zone read first, in zone order, then the new-zone
    // ones. When zone 1 is closed its slot became a new-zone site, which left
    // A out in the country and the one option at an existing neighbourhood
    // under B; now the zone option is A and every other letter is elsewhere.
    {
      const near = [], away = [];
      for (let i = 0; i < ANCHOR_SLOTS; i++) (claimedSlots.has(i) ? near : away).push(locs[i]);
      locs.splice(0, ANCHOR_SLOTS, ...near, ...away);
    }
    // A slot that found nothing anywhere would show as a dead button; drop
    // it so the letters stay contiguous.
    for (let i = locs.length - 1; i >= 0; i--) if (!locs[i]) locs.splice(i, 1);
    locs.length = Math.min(locs.length, OPTION_COUNT);

    // Final summary: print the actual A/B/C the player will see, with distances
    // to the nearest zone of this type. Stash on window for inspection.
    const summary = locs.map((l, i) => {
      if (!l) return `${OPTION_LETTERS[i]}=null`;
      let minD = Infinity, nearestZone = -1;
      for (let ri = 0; ri < rects.length; ri++) {
        const d = _distToZoneBuildings(l.col, l.row, ri);
        if (d < minD) { minD = d; nearestZone = ri; }
      }
      return `${OPTION_LETTERS[i]}=(${l.col},${l.row}) d=${minD} →zone${nearestZone}`;
    }).join('  ');
    console.log(`[anchor]   FINAL: ${summary}`);
    if (typeof window !== 'undefined') {
      window.__lastAnchor = { zoneKey, rects, locs: locs.map(l => l ? { ...l } : null) };
    }
  }

  // Far options (F and G). The free slots above already keep clear of every
  // same-type zone, but "clear" is 45-65 tiles, so all of them end up within
  // one hop of town and the choice is really "which side of the city".
  // Starting a neighbourhood somewhere genuinely apart (at the cost of a long
  // wire run) should be a real option too. So the last FAR_SLOTS options are
  // always placed the first FAR_BANDS range (110-240 tiles, edge to edge) from
  // EVERY customer building of any zone type; A..E stay where the passes above
  // put them, so this adds choices rather than removing the near ones. The
  // band widens if the map has no room at that distance.
  // They follow every placement rule the others do (the footprint fits on
  // land, outside the government zone and its buffer, with an open side for a
  // wire, and NEW_ZONE_SEPARATION from the other options) and are picked by
  // _pickSpread, so they go to the sides of the map the other options aren't on.
  // Deliberately not held to the commercial/industrial reach-of-grid cap or the
  // City Hall ring: being out past both is the point.
  const FAR_BANDS = [[110, 240], [80, 300], [45, 400]];
  function* _makeRemoteNewZoneOptions(fp, locs, claimedSlots, farFromChosen) {
    // G first, then F: each is spread against everything placed before it.
    const far = [];
    for (let i = OPTION_COUNT - 1; i >= ANCHOR_SLOTS; i--) if (!claimedSlots.has(i)) far.push(i);
    if (!far.length) return;
    const fw = fp.width, fh = fp.height;

    // Manhattan distance from every tile to the nearest customer building tile
    // (any zone type), as two chamfer sweeps: one linear pass, not a scan of
    // every building per candidate.
    const BIG = 0x3fffffff, dist = new Int32Array(COLS * ROWS).fill(BIG);
    let seeded = 0;
    for (const t of [T.HOUSE, T.CABIN, T.COMMERCIAL, T.INDUSTRIAL]) for (const e of EntityRegistry.getByType(t)) {
      for (let r = e.row; r < e.row + (e.height || 1); r++) for (let c = e.col; c < e.col + (e.width || 1); c++) {
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
        dist[r * COLS + c] = 0; seeded++;
      }
    }
    if (!seeded) return;
    for (let r = 0; r < ROWS; r++) {
      yield;
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c; let d = dist[i];
        if (r > 0) { const u = dist[i - COLS] + 1; if (u < d) d = u; }
        if (c > 0) { const l = dist[i - 1] + 1; if (l < d) d = l; }
        dist[i] = d;
      }
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      yield;
      for (let c = COLS - 1; c >= 0; c--) {
        const i = r * COLS + c; let d = dist[i];
        if (r < ROWS - 1) { const dn = dist[i + COLS] + 1; if (dn < d) d = dn; }
        if (c < COLS - 1) { const rt = dist[i + 1] + 1; if (rt < d) d = rt; }
        dist[i] = d;
      }
    }
    // Footprint corners stand in for edge-to-edge distance to the nearest building.
    const edgeD = (c, r) => Math.min(dist[r * COLS + c], dist[r * COLS + c + fw - 1],
                                     dist[(r + fh - 1) * COLS + c], dist[(r + fh - 1) * COLS + c + fw - 1]);

    // Every third tile each way, from a random start: the band is a large
    // share of the whole map, and a ninth of it is still far more sites than
    // the 400 the pick is made from.
    const STEP = 3, c00 = EDGE_MARGIN + Math.floor(Math.random() * STEP), r00 = EDGE_MARGIN + Math.floor(Math.random() * STEP);
    for (const slot of far) {
      const keep = locs[slot] || null;
      locs[slot] = null;                       // don't let this slot's old spot fence off the new one
      let pool = [];
      for (const [lo, hi] of FAR_BANDS) {
        for (let r = r00; r < ROWS - EDGE_MARGIN - fh + 1; r += STEP) {
          yield;
          for (let c = c00; c < COLS - EDGE_MARGIN - fw + 1; c += STEP) {
            const d = edgeD(c, r);
            if (d < lo || d > hi) continue;
            if (!farFromChosen(c, r, slot, NEW_ZONE_SEPARATION)) continue;
            if (ZoneSystem.footprintCrowdsZones(c, r, fw, fh)) continue;
            if (!GridManager.canPlaceFootprint(c, r, fw, fh)) continue;
            if (WaterSystem.isWater(c, r) || ZoneSystem.isInGovZone(c, r)) continue;
            if (ZoneSystem.distToGovZone(c, r) < GOV_BUFFER_ZA) continue;
            if (!_hasOpenPerimeter(c, r, fw, fh)) continue;
            pool.push({ col: c, row: r });
          }
        }
        if (pool.length) break;
      }
      console.log(`[remote-zone] slot=${slot} pool=${pool.length}`);
      if (pool.length > 400) { _shuffle(pool); pool.length = 400; }
      locs[slot] = pool.length ? _pickSpread(pool, locs) : keep;   // nowhere that far out: keep the near one
    }
  }

  // On the very first industrial request there are no industrial zones yet, so
  // _anchorOptionsToZones returns immediately and every option ends up wherever
  // pickCandidateLocations happened to land — typically pressed right up against
  // the existing town. Heavy industry wants its own ground, so reserve ONE of
  // the three options out at REMOTE_MIN..REMOTE_MAX tiles from every existing
  // zone building, letting the player deliberately start the industrial
  // district away from housing (at the cost of a long wire run).
  //
  // Only the last option is replaced — the other two stay close to town, so
  // this adds a choice rather than forcing the remote site on the player.
  const FIRST_IND_REMOTE_MIN = 40;
  const FIRST_IND_REMOTE_MAX = 50;
  function _ensureRemoteIndustrialOption(fp, locs) {
    const fw = fp.width, fh = fp.height;

    // Every placed customer building, of any zone type — the new site must be
    // far from ALL of them, not just from other industry.
    const zoneBuildings = [];
    for (const t of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) {
      for (const e of EntityRegistry.getByType(t)) {
        if (!e.fromRequest) continue;
        zoneBuildings.push({ col: e.col, row: e.row, width: e.width || 1, height: e.height || 1 });
      }
    }
    if (!zoneBuildings.length) return;   // nothing to be remote from

    // Edge-to-edge Manhattan distance, matching _distToZoneBuildings.
    const distToAllZones = (c, r) => {
      let minD = Infinity;
      for (let k = 0; k < zoneBuildings.length; k++) {
        const b = zoneBuildings[k];
        const dc = Math.max(0, Math.max(c - (b.col + b.width - 1), b.col - (c + fw - 1)));
        const dr = Math.max(0, Math.max(r - (b.row + b.height - 1), b.row - (r + fh - 1)));
        const d  = dc + dr;
        if (d < minD) minD = d;
      }
      return minD;
    };

    const pool = [];
    for (let r = EDGE_MARGIN; r < ROWS - EDGE_MARGIN - fh + 1; r++) {
      for (let c = EDGE_MARGIN; c < COLS - EDGE_MARGIN - fw + 1; c++) {
        if (!GridManager.canPlaceFootprint(c, r, fw, fh)) continue;
        if (WaterSystem.isWater(c, r)) continue;
        if (ZoneSystem.isInGovZone(c, r)) continue;
        const gd = ZoneSystem.distToGovZone(c, r);
        if (gd < GOV_BUFFER_ZA) continue;
        if (ZoneSystem.footprintCrowdsZones(c, r, fw, fh)) continue;
        if (!_hasOpenPerimeter(c, r, fw, fh)) continue;
        const d = distToAllZones(c, r);
        if (d < FIRST_IND_REMOTE_MIN || d > FIRST_IND_REMOTE_MAX) continue;
        pool.push({ col: c, row: r });
      }
    }

    console.log(`[remote-ind] pool=${pool.length} band=${FIRST_IND_REMOTE_MIN}-${FIRST_IND_REMOTE_MAX}`);
    if (!pool.length) return;   // map too small / too built-up — leave options as-is

    const pick = pool[Math.floor(Math.random() * pool.length)];
    locs[locs.length - 1] = pick;
    console.log(`[remote-ind] option ${OPTION_LETTERS[locs.length - 1]} -> (${pick.col},${pick.row}) d=${distToAllZones(pick.col, pick.row)}`);
  }


  function pickCandidateLocations(...args) {
    return _drain(_candidateLocationSteps(...args));
  }
  function* _candidateLocationSteps(requireSubstation, count = 3, footprint = { width: 1, height: 1 }, neighbourType = null, gridAnchorDist = 0) {
    const fw = footprint.width, fh = footprint.height;
    const NEAR_DIST = 8;  // at least one option within 8 tiles of an existing neighbour
    const zoneKey = neighbourType === T.HOUSE ? 'residential'
                  : neighbourType === T.COMMERCIAL ? 'commercial'
                  : neighbourType === T.INDUSTRIAL ? 'industrial' : null;

    let hasSub = false;
    for (let sr = 0; sr < ROWS && !hasSub; sr++) {
      yield;
      for (let sc = 0; sc < COLS && !hasSub; sc++) {
        const e = GridManager.getEntity(sc, sr);
        if (e && (e.type === T.SUBSTATION || e.type === T.SUBSTATION2 || e.type === T.SUBSTATION3 || e.type === T.SUBSTATION4 || e.type === T.SUBSTATION5) && e.col === sc && e.row === sr) hasSub = true;
      }
    }

    if (requireSubstation && !hasSub) return [];

    // Collect anchor entities for proximity rule
    const anchors = [];
    if (neighbourType) {
      for (let sr = 0; sr < ROWS; sr++) {
        yield;
        for (let sc = 0; sc < COLS; sc++) {
          const e = GridManager.getEntity(sc, sr);
          if (e && e.type === neighbourType && e.col === sc && e.row === sr)
            anchors.push({ col: sc, row: sr });
        }
      }
    }

    // If gridAnchorDist set, find centroid of all placed infrastructure
    // and use it as the proximity anchor for one pick
    if (gridAnchorDist > 0 && !anchors.length) {
      let sumC = 0, sumR = 0, n = 0;
      const INFRA_TYPES = new Set([T.SOLAR, T.SOLAR2, T.SOLAR3, T.WIND, T.WIND2, T.WIND3, T.WIRE, T.POLE, T.RESEARCH, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5, T.MONITOR]);
      for (let sr = 0; sr < ROWS; sr++) {
        yield;
        for (let sc = 0; sc < COLS; sc++) {
          const e = GridManager.getEntity(sc, sr);
          if (e && INFRA_TYPES.has(e.type) && e.col === sc && e.row === sr) {
            sumC += sc; sumR += sr; n++;
          }
        }
      }
      if (n > 0) anchors.push({ col: Math.round(sumC / n), row: Math.round(sumR / n) });
    }

    // Build full candidate pool — any free tile within map margin
    const pool = [];
    const GOV_MIN = ZoneSystem.GOV_RING_MIN;
    const GOV_MAX = ZoneSystem.GOV_RING_MAX;
    const ZONE_CLEARANCE = 12;
    // Separate zone rects by type for cross-type clearance enforcement
    const ZONE_RECTS_BY_KEY = {};
    for (const k of ['residential', 'commercial', 'industrial'])
      ZONE_RECTS_BY_KEY[k] = ZoneSystem.getZoneRects?.(k) || [];
    const ALL_ZONE_RECTS = Object.values(ZONE_RECTS_BY_KEY).flat();
    function _edgeDistToRect(c, r, rect) {
      const edC = Math.max(0, Math.max(c - rect.maxC, rect.minC - c));
      const edR = Math.max(0, Math.max(r - rect.maxR, rect.minR - r));
      return edC + edR;
    }
    // Only reject candidates that are too close to a DIFFERENT-type zone.
    // exceptKey: the zone type this placement belongs to — same-type rects are allowed.
    // exceptRect: the specific zone rect being anchored to — always exempt.
    // With no zone of this type yet, every option here starts a new zone, so
    // the buffer from other types grows with their size (as for the free
    // slots in _anchorOptionsToZones). With zones, the anchoring pass
    // replaces these picks anyway, so the flat clearance is kept.
    const _noSameType = !zoneKey || !(ZONE_RECTS_BY_KEY[zoneKey] || []).length;
    function _tooCloseToOtherZone(c, r, exceptRect = null, exceptKey = null) {
      for (const k of ['residential', 'commercial', 'industrial']) {
        if (k === exceptKey) continue;  // same-type zones never block
        for (const rect of (ZONE_RECTS_BY_KEY[k] || [])) {
          if (rect === exceptRect) continue;
          const need = _noSameType
            ? Math.max(ZONE_CLEARANCE, NEW_ZONE_CROSS_BASE + NEW_ZONE_CROSS_K * zoneSize(rect))
            : ZONE_CLEARANCE;
          if (_edgeDistToRect(c, r, rect) < need) return true;
        }
      }
      return false;
    }
    // Commercial and industrial: hard cap on distance from grid infra.
    // 30/40 tiles ≈ "reachable with a modest/longer wire run" — anything
    // further is too disconnected to belong on the grid yet.
    const MAX_FROM_INFRA = (neighbourType === T.COMMERCIAL) ? 30
                        : (neighbourType === T.INDUSTRIAL) ? 40 : null;
    const _withinReach = _infraReachTest(MAX_FROM_INFRA);

    for (let r = EDGE_MARGIN; r < ROWS - EDGE_MARGIN - fh + 1; r++) {
      yield;
      for (let c = EDGE_MARGIN; c < COLS - EDGE_MARGIN - fw + 1; c++) {
        if (!GridManager.canPlaceFootprint(c, r, fw, fh)) continue;
        if (ZoneSystem.isInGovZone(c, r)) continue;
        if (ZoneSystem.distToGovZone(c, r) < GOV_MIN) continue;
        if (ZoneSystem.distToGovZone(c, r) > GOV_MAX) continue;
        if (WaterSystem.isWater(c, r)) continue;
        if (_tooCloseToOtherZone(c, r, null, zoneKey)) continue;  // enforce cross-zone in main pool
        if (ZoneSystem.footprintCrowdsZones(c, r, fw, fh)) continue;
        if (!_withinReach(c, r)) continue;
        pool.push({ col: c, row: r });
      }
    }

    const activePool = pool.length ? pool : (() => {
      const fb = [];
      for (let r = EDGE_MARGIN; r < ROWS - EDGE_MARGIN - fh + 1; r++)
        for (let c = EDGE_MARGIN; c < COLS - EDGE_MARGIN - fw + 1; c++)
          if (GridManager.canPlaceFootprint(c, r, fw, fh) && !ZoneSystem.isInGovZone(c,r) && ZoneSystem.distToGovZone(c,r) >= ZoneSystem.GOV_RING_MIN && ZoneSystem.distToGovZone(c,r) <= ZoneSystem.GOV_RING_MAX && !WaterSystem.isWater(c,r) && !_tooCloseToOtherZone(c, r, null, zoneKey) && !ZoneSystem.footprintCrowdsZones(c, r, fw, fh)) fb.push({ col: c, row: r });
      return fb;
    })();

    if (!activePool.length) return [];

    // Shuffle pool
    const shuffled = _shuffle([...activePool]);   // was a random-comparator sort: O(n log n) over a pool of hundreds of thousands
    // Far enough apart that two new-zone options don't describe the same zone.
    const MIN_SPREAD = NEW_ZONE_SEPARATION;

    // If anchors exist, find the best "near" candidate — closest to any anchor
    // that is still within NEAR_DIST tiles
    let nearPick = null;
    if (anchors.length) {
      const dist = gridAnchorDist > 0 ? gridAnchorDist : NEAR_DIST;
      const nearCandidates = shuffled.filter(cand =>
        !_tooCloseToOtherZone(cand.col, cand.row, null, zoneKey) &&
        anchors.some(a => Math.sqrt((a.col - cand.col)**2 + (a.row - cand.row)**2) <= dist)
      );
      if (nearCandidates.length) nearPick = nearCandidates[0];
    }

    // Get zone rects for this request type
    const zoneRectsArr = zoneKey ? (ZoneSystem.getZoneRects?.(zoneKey) || []) : [];
    const ZONE_DIST = 10;
    const numZones  = zoneRectsArr.length;

    // Helper: pick candidate near a specific zone rect
    // Get all placed buildings of this zone type for distance checks
    function getBuildingsOfType(zKey) {
      // Preserves the original priority: isIndustrial flag wins over a
      // T.COMMERCIAL type, same as the ternary chain this replaces.
      const buildings = [];
      if (zKey === 'industrial') {
        for (const ent of EntityRegistry.getByType(T.INDUSTRIAL)) if (ent.fromRequest) buildings.push(ent);
        for (const ent of EntityRegistry.getByType(T.COMMERCIAL))  if (ent.fromRequest && ent.isIndustrial) buildings.push(ent);
      } else if (zKey === 'commercial') {
        for (const ent of EntityRegistry.getByType(T.COMMERCIAL)) if (ent.fromRequest && !ent.isIndustrial) buildings.push(ent);
      } else if (zKey === 'residential') {
        for (const t of [T.HOUSE, T.CABIN]) for (const ent of EntityRegistry.getByType(t)) if (ent.fromRequest) buildings.push(ent);
      }
      // Sort by placement time so index 0 is always the first placed
      buildings.sort((a, b) => (a._placedAt || 0) - (b._placedAt || 0));
      return buildings;
    }

    function nearZonePick(zRect, existing) {
      // Only consider buildings that actually sit inside this specific zone
      // rect — otherwise a busy zone 1 would always "win" the distance
      // comparison and zone 2/3 would never get their own anchor.
      const allOfType = getBuildingsOfType(zoneKey);
      const inThisZone = allOfType.filter(b =>
        b.col >= zRect.minC && b.col <= zRect.maxC && b.row >= zRect.minR && b.row <= zRect.maxR
      );
      function minDistToBuildings(cand) {
        if (!inThisZone.length) {
          const zc = (zRect.minC+zRect.maxC)/2, zr = (zRect.minR+zRect.maxR)/2;
          return Math.sqrt((zc-cand.col)**2+(zr-cand.row)**2);
        }
        return Math.min(...inThisZone.map(b => {
          const edC = Math.max(0, Math.max(cand.col - (b.col+(b.width||1)-1), b.col - cand.col));
          const edR = Math.max(0, Math.max(cand.row - (b.row+(b.height||1)-1), b.row - cand.row));
          return edC + edR;  // Manhattan distance
        }));
      }
      const valid = shuffled
        .filter(cand =>
          !existing.includes(cand) &&
          !existing.some(p => Math.sqrt((p.col-cand.col)**2+(p.row-cand.row)**2) < MIN_SPREAD) &&
          !_tooCloseToOtherZone(cand.col, cand.row, zRect, zoneKey)
        )
        .sort((a, b) => minDistToBuildings(a) - minDistToBuildings(b));
      // Pick randomly from candidates within 15 tiles of an existing building
      const nearby = valid.filter(c => minDistToBuildings(c) <= ZONE_DIST);
      if (!nearby.length) return null;
      return nearby[Math.floor(Math.random() * nearby.length)];
    }

    // Build picks based on how many zones exist:
    // 0 zones: all random (use nearPick from anchors if available)
    // 1 zone:  A near zone, B+C random
    // 2 zones: A near zone 1, B near zone 2, C random
    // 3+ zones: A/B/C each near a different zone
    const picks = [];

    if (zoneKey && numZones > 0) {
      // Option A anchors to zone 1, B to zone 2, C to zone 3 — exactly
      // matching however many zones of this type actually exist. Slots
      // beyond numZones fall through to the random fill loop below.
      for (let zi = 0; zi < Math.min(count, numZones); zi++) {
        const pick = nearZonePick(zoneRectsArr[zi], picks);
        if (pick) picks.push(pick);
      }
    }

    // If no zone picks found, seed with nearPick (infrastructure anchor) only
    if (picks.length === 0 && nearPick) picks.push(nearPick);

    // Fill remaining slots as far from each other as the pool allows: each
    // new pick is the best-spread of the candidates that clear MIN_SPREAD
    // from everything picked so far (see _pickSpread). The pool already
    // excludes other-type zone buffers and the ring around City Hall.
    while (picks.length < count) {
      // `shuffled` is in random order, so the first SPREAD_SAMPLE that clear
      // MIN_SPREAD are a fair sample of all that do; scoring every one of a
      // whole map's worth of tiles per pick froze the game for over a second.
      const ok = [];
      for (const cand of shuffled) {
        if (picks.includes(cand) || picks.some(p => Math.sqrt((p.col - cand.col)**2 + (p.row - cand.row)**2) < MIN_SPREAD)) continue;
        ok.push(cand);
        if (ok.length >= SPREAD_SAMPLE) break;
      }
      if (!ok.length) break;
      picks.push(_pickSpread(ok, picks));
    }

    // Fill remaining slots if needed
    while (picks.length < count && picks.length < activePool.length) {
      const next = shuffled.find(c => !picks.includes(c) && !_tooCloseToOtherZone(c.col, c.row, null, zoneKey));
      if (next) picks.push(next);
      else break;
    }

    return picks.slice(0, count);
  }

  // How long the crew takes to build a request once accepted, wired up
  // (game seconds), and the construction load the site draws meanwhile.
  // A suburb's lots are ordinary houses going up one after another.
  function _buildFootprint(req) {
    if (req.isCabin) return { width: 1, height: 1, isCabin: true };
    if (CLUSTER_LOTS[req.subtype]) return entityFootprint(T.HOUSE);
    return entityFootprint(req.isIndustrial ? T.INDUSTRIAL : req.isCommercial ? T.COMMERCIAL : T.HOUSE, req.subtype);
  }
  function _buildSecs(req) {
    const lots = CLUSTER_LOTS[req.subtype];
    return ConstructionSystem.durationFor(_buildFootprint(req))
      + (lots ? (lots.length - 1) * ConstructionSystem.LOT_STAGGER : 0);
  }
  // Per building (each suburb lot draws its own), from the quoted peak.
  const _siteKW = (req) => ConstructionSystem.siteKWFor(quotedPeak(req));

  function accept(id, locIndex = 0) {
    const req = pending.find(r => r.id === id);
    if (!req) return;

    const needsSub = req.isCommercial || req.isIndustrial;

    const entityType = req.isIndustrial ? T.INDUSTRIAL : req.isCommercial ? T.COMMERCIAL : T.HOUSE;
    // Mae's Cabin keeps the old 1×1 house footprint (its slots are found at 1×1).
    // Otherwise the size it is about to be built at (below): the request's own
    // where it carries one, as the map pins draw it. Checked at the subtype's
    // size instead, a request carrying a different one had a spot that fit
    // refused as "occupied" and was moved to another option.
    const _subFp = entityFootprint(entityType, req.subtype);
    const fp = req.isCabin ? { width: 1, height: 1 }
      : { width: req._width > 1 ? req._width : _subFp.width, height: req._height > 1 ? req._height : _subFp.height };

    // Use the pre-chosen location; fall back to random if somehow missing
    let pos = (req.locations && req.locations[locIndex]) ? req.locations[locIndex] : null;
    const _chosenPos = pos;
    if (!pos || !GridManager.canPlaceFootprint(pos.col, pos.row, fp.width, fp.height)) {
      // Slot occupied — try other offered slots first
      pos = (req.locations || []).find(l => l && GridManager.canPlaceFootprint(l.col, l.row, fp.width, fp.height));
      // Still nothing? Search outward from wherever the request was
      // originally anchored, so the fallback stays near the zone the
      // player was shown instead of landing anywhere on the map.
      if (!pos) {
        const anchor = _chosenPos || (req.locations && req.locations[0]);
        if (anchor) pos = findNearbyValidPlacement(anchor.col, anchor.row, fp.width, fp.height);
      }
      if (!pos) pos = findValidPlacement(needsSub, fp);
      // Say where it went, and let the player go and look: the spot it was
      // moved to is the game's pick, not theirs, and can be some way off.
      if (pos && _chosenPos) {
        const at = pos, dist = Math.round(Math.hypot(at.col - _chosenPos.col, at.row - _chosenPos.row));
        const go = () => { Camera.recentreOn((at.col + fp.width / 2) * TILE, (at.row + fp.height / 2) * TILE); SFX.click?.(); };
        showToast(`⚠ Chosen spot was occupied: ${req.family} is going up ${dist} tile${dist === 1 ? '' : 's'} away instead. Click to see it`, '#f0a040', '#141000', '#705000', null, go);
        NotificationStack.push({
          icon: '📍', title: `${req.family}: moved to a new spot`,
          message: `The spot you picked was taken, so the crew set up ${dist} tile${dist === 1 ? '' : 's'} away at (${at.col}, ${at.row}). Click to see it`,
          color: '#f0a040', border: '#705000', onClick: go,
        });
      }
    }
    if (!pos) {
      const msg = needsSub ? '⚠ Build a Substation first for commercial connections!' : '⚠ No valid placement found!';
      showToast(msg, '#ff8040', '#180a00', '#804020');
      return;
    }

    // Count total accepted so far (before this acceptance)
    const _totalAccepted = housesAccepted + commercialsAccepted;
    const _incomeScale   = _totalAccepted >= 2 ? 0.75 : 1.0;  // 25% reduction from 3rd property onward

    // A cluster request (the Master-planned Suburb) places an ordinary house
    // on each lot inside its block; everything else places one building at
    // pos. Each lot is a full house in its own right — fee, family, demand,
    // population, zone membership — so nothing downstream needs to know it
    // arrived as part of a block. Upfront, the toast and the request itself
    // are still settled once, below the loop.
    const _cluster = CLUSTER_LOTS[req.subtype];
    const _lots = _cluster
      ? _cluster.map((l, i) => ({ col: pos.col + l.dc, row: pos.row + l.dr, lot: i + 1 }))
      : [{ col: pos.col, row: pos.row, lot: 0 }];
    // Track rare acceptances
    if (req._rare && req.subtype) _rareAccepted.add(req.subtype);
    const _prevResCount = ZoneSystem.zoneCount('residential');
    const _prevComCount = ZoneSystem.zoneCount('commercial');
    const _prevIndCount = ZoneSystem.zoneCount('industrial');

    for (const lotPos of _lots) {
    const isLot = lotPos.lot > 0;
    const entity = new Entity(entityType, lotPos.col, lotPos.row);
    entity.dailyFee = Math.round(req.fee * _incomeScale);
    entity.businessName = isLot ? `${req.family} · Lot ${lotPos.lot}` : req.family;  // family name for all customer types
    entity.demandScale  = req.demandScale || 1;
    if (req.peakDraw != null) entity.peakDraw = req.peakDraw;
    if (req.minDraw  != null) entity.minDraw  = req.minDraw;
    if (req.idleDraw != null) entity.idleDraw = req.idleDraw;
    if (!isLot) {
      if (req._width  > 1) entity.width  = req._width;
      if (req._height > 1) entity.height = req._height;
      if (req.subtype)     entity.commercialSubtype = req.subtype;
    }
    if (req.houseWealthTier) entity.houseWealthTier = req.houseWealthTier;
    if (isLot) entity.houseWealthTier = 'luxury';   // suburb homes use the luxury house sprite
    if (req.isCommercial || req.isIndustrial) {
      entity.commercialSubtype = req.subtype || 'commercial_default';
      applySubtypeFootprint(entity);
    }
    if (req.isCabin) { entity.width = 1; entity.height = 1; }
    // Clear any trees in the footprint
    for (let _dr=0; _dr<(entity.height||1); _dr++) for (let _dc=0; _dc<(entity.width||1); _dc++) {
      const _t = GridManager.getEntity(lotPos.col+_dc, lotPos.row+_dr);
      if (_t && _t.type === T.TREE) GridManager.removeEntity(lotPos.col+_dc, lotPos.row+_dr);
    }
    if (entity.width > 1 || entity.height > 1) GridManager.setEntityFootprint(entity);
    else GridManager.setEntity(lotPos.col, lotPos.row, entity);
    entity.fromRequest = true;
    entity._placedAt = Date.now();
    if (req.family) entity.familyName = req.family;
    // A crew builds it first; it can't take power until it's finished. The
    // move-in moment (_movedIn, zone_moments.js) is stamped when it's done.
    // A suburb's lots go up one after another.
    ConstructionSystem.start(entity, isLot ? (lotPos.lot - 1) * ConstructionSystem.LOT_STAGGER : 0, _siteKW(req));
    // Assign population based on building subtype. Commercial/industrial
    // properties count their workers toward population too, not just
    // residents — a factory or office employs people just as much as an
    // apartment houses them.
    // Rolled when the request was first shown (see _requestPopulations) so
    // the card's quoted peak already reflects it.
    entity._population = _requestPopulations(req)[Math.max(0, lotPos.lot - 1)];
    if (req.isCabin) entity.isCabin = true;
    // Suburb lots each record their share of the block's upfront, so a
    // relocation penalty on one home isn't priced as the whole estate.
    entity.upfrontPaid = isLot ? Math.round(req.upfront / _lots.length) : req.upfront;
    AmenityRequestSystem.scheduleRequest(entity);
    if (!req.isCommercial) housesAccepted++;  // cabin counts as first customer
    if (req.isCommercial && !req.isIndustrial) commercialsAccepted++;
    if (req.isIndustrial) industrialsAccepted++;   // was never counted — see _reconcileIndustrials
    ZoneSystem.addBuilding(entity);
    }
    const _newResCount = ZoneSystem.zoneCount('residential');
    const _newComCount = ZoneSystem.zoneCount('commercial');
    const _newIndCount = ZoneSystem.zoneCount('industrial');
    if (_newResCount > _prevResCount) showToast(_prevResCount===0 ? '🏘 Residential Zone established!' : `🏘 Residential Zone ${_newResCount} established!`, '#c8a040', '#0e0a00', '#604010');
    if (_newComCount > _prevComCount) showToast(_prevComCount===0 ? '🏢 Commercial Zone established!'  : `🏢 Commercial Zone ${_newComCount} established!`,  '#4080ff', '#00040e', '#1a3a6a');
    if (_newIndCount > _prevIndCount) showToast(_prevIndCount===0 ? '🏭 Industrial Zone established!'  : `🏭 Industrial Zone ${_newIndCount} established!`,  '#ff6020', '#0e0400', '#6a2a0a');
    Progression.checkUnlocks(); // re-evaluate immediately so pole etc. unlock right away
    let _scaledUpfront = Math.round(req.upfront * _incomeScale);
    // 2nd property guaranteed minimum $10k upfront
    if (_totalAccepted === 1) _scaledUpfront = Math.max(_scaledUpfront, 10000);
    Economy.spend(-_scaledUpfront);   // credit upfront payment
    try { SFX.houseIn?.(); } catch (_e) {}
    showToast(`✓ ${req.family} signed on: construction started (${ConstructionSystem.formatSecs(_buildSecs(req))}) +${formatMoney(_scaledUpfront)}`, '#50e890', '#081408', '#206030');

    const req2 = pending.find(r => r.id === id);
    const wasCabin = req2?.isCabin;
    if (req2?.notifId) NotificationStack.dismiss(req2.notifId);
    pending = pending.filter(r => r.id !== id);
    // The ground this one now stands on comes off every other open request's
    // options, so none still offers a spot that is being built on. A request
    // that would be left with nothing keeps what it had: accepting it then
    // finds the nearest free spot and says where (above).
    for (const o of pending) {
      const ofp = _offerRect(o, { col: 0, row: 0 });
      const left = (o.locations || []).filter(l => l && GridManager.canPlaceFootprint(l.col, l.row, ofp.w, ofp.h));
      if (left.length && left.length < (o.locations || []).length) o.locations = left;
    }
    if (wasCabin) {
      cabinCleared = true;
      cabinDeal = true;
      showToast("⚡ Hookup deal: wires are FREE and Power Poles are 50% off until Mae's Cabin is online", '#50e890', '#081408', '#206030');
      if (typeof refreshHotbar === 'function') refreshHotbar();
    }
    cooldownTimer = gridHealthCooldown();
    updateBadge();
    if (panelOpen) renderPanel();
  }

  function decline(id) {
    const req2 = pending.find(r => r.id === id);
    const wasCabin = req2?.isCabin;
    if (req2?.notifId) NotificationStack.dismiss(req2.notifId);
    pending = pending.filter(r => r.id !== id);
    if (wasCabin) cabinCleared = true;
    // Save declined locations so next request avoids them for 10 in-game hours
    if (req2 && !wasCabin && req2.locs) {
      const expiresAt = gameTime + 10; // 10 in-game hours
      req2.locs.filter(Boolean).forEach(loc => _declinedLocs.push({ col: loc.col, row: loc.row, expires: expiresAt }));
    }
    // Do NOT re-add to backlog — player deliberately declined, generate a fresh request next time
    cooldownTimer = Math.max(cooldownTimer, gridHealthCooldown());
    updateBadge();
    if (panelOpen) renderPanel();
  }

  function updateBadge() {
    const badge = document.getElementById('req-badge');
    // Also update hotbar badge
    const hBadge = document.getElementById('hotbar-req-badge');
    const hFace  = document.getElementById('hotbar-req-face');
    if (hBadge) { hBadge.textContent = pending.length; hBadge.style.display = pending.length > 0 ? 'block' : 'none'; }
    if (hFace)  { hFace.style.borderColor = pending.length > 0 ? '#f0c040' : ''; }
    if (!badge) return;
    const total = pending.length + backlog.length;
    badge.textContent = total;
    badge.style.display = total > 0 ? 'flex' : 'none';
    document.getElementById('btn-requests').classList.toggle('has-requests', pending.length > 0);
  }

  function renderPanel() {
    const body = document.getElementById('req-panel-body');
    if (!body) return;
    body.innerHTML = '';

    const totalQueue = pending.length + backlog.length;

    if (!pending.length) {
      const cd = Math.ceil(cooldownTimer);
      body.innerHTML = totalQueue > 0
        ? `<div class="req-empty" id="req-cd-text">Next request in ${cd}s...</div>`
        : `<div class="req-empty">No pending requests</div>`;
      // Show queue info
      if (backlog.length > 0) {
        body.innerHTML += `<div class="req-empty" style="color:#506070">${backlog.length} in queue</div>`;
      }
      return;
    }

    // Clamp in case pending shrank/grew since the last render
    clampViewIndex();

    // Show the currently-viewed pending request
    const req = pending[viewIndex];
    {
      const item = document.createElement('div');
      item.className = 'req-item';
      const ttlPct = req.ttlMax ? (req.ttl / req.ttlMax) * 100 : 100;
      const locs = req.locations || [];
      const locLabels = OPTION_LETTERS;

      // Scroll nav — only shown when there's more than one pending request
      const navHtml = pending.length > 1
        ? `<div style="display:flex;align-items:center;justify-content:center;gap:8px;padding-bottom:4px">
             <button class="req-nav-btn" data-nav="prev" ${viewIndex === 0 ? 'disabled' : ''}
               style="font-size:9px;line-height:1;padding:2px 7px;border:1px solid #1e3a50;border-radius:2px;background:transparent;color:${viewIndex === 0 ? '#304050' : '#6090a8'};cursor:${viewIndex === 0 ? 'default' : 'pointer'}">‹</button>
             <span style="font-size:7px;letter-spacing:1px;color:#6090a8">${viewIndex + 1} / ${pending.length}</span>
             <button class="req-nav-btn" data-nav="next" ${viewIndex === pending.length - 1 ? 'disabled' : ''}
               style="font-size:9px;line-height:1;padding:2px 7px;border:1px solid #1e3a50;border-radius:2px;background:transparent;color:${viewIndex === pending.length - 1 ? '#304050' : '#6090a8'};cursor:${viewIndex === pending.length - 1 ? 'default' : 'pointer'}">›</button>
           </div>`
        : '';

      // Location buttons HTML
      // Picking a letter only looks: the camera goes there and a confirm
      // button appears under the row. Another letter looks somewhere else.
      const sel = (_viewedOption && _viewedOption.id === req.id && locs[_viewedOption.idx]) ? _viewedOption.idx : -1;
      const SEL_STYLE = ' style="background:rgba(240,192,64,0.28) !important;border-color:#f0c040 !important;color:#ffe9a8 !important;text-shadow:0 0 6px rgba(240,192,64,0.9);animation:none"';
      const locBtnsHtml = locs.length > 0
        ? `<div class="req-loc-label">${sel >= 0 ? `Viewing ${locLabels[sel]}: confirm, or look at another` : 'Choose location:'}</div>
           <div class="req-loc-btns">
             ${locs.map((l, i) => `<button class="req-btn req-loc-btn" data-id="${req.id}" data-locidx="${i}"${i === sel ? SEL_STYLE : ''}>${locLabels[i]}</button>`).join('')}
           </div>
           ${sel >= 0 ? `<div class="req-actions" style="margin-top:4px">
             <button class="req-btn accept" data-id="${req.id}" data-locidx="${sel}">Confirm ${locLabels[sel]}</button>
           </div>` : ''}`
        : `<div class="req-actions">
             <button class="req-btn accept" data-id="${req.id}">Accept</button>
           </div>`;

      item.innerHTML = `
        ${navHtml}
        <div class="req-item-header">
          <span class="req-family">${req.family}</span>
          <span style="display:flex;gap:4px">
            ${req.isCabin ? '<span style="font-size:7px;letter-spacing:1px;color:#6090a8;padding:2px 5px;border:1px solid #1e3a50;border-radius:2px">TEST CONNECTION</span>' : ''}
            ${req.isIndustrial
              ? '<span title="Industrial zone" style="font-size:7px;letter-spacing:1px;color:#ff8040;padding:2px 5px;border:1px solid #804020;border-radius:2px">INDUSTRIAL</span>'
              : req.isCommercial
              ? '<span title="Commercial zone" style="font-size:7px;letter-spacing:1px;color:#f0c040;padding:2px 5px;border:1px solid #705010;border-radius:2px">COMMERCIAL</span>'
              : '<span title="Residential zone" style="font-size:7px;letter-spacing:1px;color:#60d080;padding:2px 5px;border:1px solid #206040;border-radius:2px">RESIDENTIAL</span>'}
          </span>
        </div>
        ${req.isCabin ? '<div style="font-size:7px;color:var(--text-dim);letter-spacing:0.5px;padding:0 0 4px">A local farmer wants to test your grid before the town connects.</div>' : ''}
        <div class="req-details">
          <div class="req-detail"><span class="req-dlabel">Upfront</span><span class="req-dval gold">${formatMoney(Math.round(req.upfront * ((housesAccepted + commercialsAccepted) >= 2 ? 0.75 : 1.0)))}</span></div>
          <div class="req-detail"><span class="req-dlabel">Daily fee</span><span class="req-dval good">$${req.fee}/s${CLUSTER_LOTS[req.subtype] ? ` × ${CLUSTER_LOTS[req.subtype].length} homes` : ''}</span></div>
          <div class="req-detail"><span class="req-dlabel">Power req.</span><span class="req-dval warn">${(() => {
            const peak = quotedPeak(req);
            const _each = CLUSTER_LOTS[req.subtype] ? ' each' : '';
            return peak % 1 === 0 ? `${formatPower(peak)} peak${_each}` : `${formatPower(peak, 1)} peak${_each}`;
          })()}</span></div>
          <div class="req-detail" title="Built on site before it can take power or pay its fee: ${ConstructionSystem.formatSecs(_buildSecs(req))} wired up, drawing ${formatPower(_siteKW(req))}${CLUSTER_LOTS[req.subtype] ? ' per home' : ''} from your grid while it builds. Left unwired, the crew runs a diesel generator and takes ${ConstructionSystem.formatSecs(_buildSecs(req) / ConstructionSystem.UNPOWERED_SPEED)}."><span class="req-dlabel">Build</span><span class="req-dval">${ConstructionSystem.formatSecs(_buildSecs(req))} · ${formatPower(_siteKW(req))}</span></div>
        </div>
        <div class="req-ttl-bar"><div class="req-ttl-fill" style="width:${Math.round(ttlPct)}%;background:${ttlPct>50?'#306050':ttlPct>25?'#806020':'#803020'}"></div></div>
        ${locBtnsHtml}
        <div class="req-actions" style="margin-top:4px">
          <button class="req-btn decline" data-id="${req.id}">Decline</button>
        </div>
      `;

      // Nav buttons
      item.querySelectorAll('.req-nav-btn').forEach(b =>
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (b.dataset.nav === 'prev' && viewIndex > 0) viewIndex--;
          if (b.dataset.nav === 'next' && viewIndex < pending.length - 1) viewIndex++;
          renderPanel();
        })
      );
      // Location choice buttons
      item.querySelectorAll('.req-loc-btn').forEach(b =>
        b.addEventListener('click', () => {
          const id  = parseInt(b.dataset.id);
          const idx = parseInt(b.dataset.locidx);
          const r = pending.find(q => q.id === id), loc = r && (r.locations || [])[idx];
          if (!loc) return;
          // Look first: cut the camera to the site's footprint and wait for
          // the confirm button. A cut, not a glide — flicking between A..E
          // to compare sites shouldn't mean flying across the map each time.
          const fp = entityFootprint(r.isIndustrial ? T.INDUSTRIAL : r.isCommercial ? T.COMMERCIAL : T.HOUSE, r.subtype);
          _viewedOption = { id, idx };
          // The site is in the player's own city. Viewed from a contract
          // site, go home first, or the cut lands on the same tiles of the
          // client's map. (returnHome does nothing when already home.)
          if (typeof ContractSystem !== 'undefined') ContractSystem.returnHome();
          Camera.cut(() => Camera.recentreOn((loc.col + fp.width / 2) * TILE, (loc.row + fp.height / 2) * TILE));
          try { SFX.click?.(); } catch (_e) {}
          renderPanel();
        })
      );
      // Confirm the viewed option (or plain accept, for a request with no locations)
      item.querySelectorAll('.req-btn.accept').forEach(b =>
        b.addEventListener('click', () => { _viewedOption = null; accept(parseInt(b.dataset.id), parseInt(b.dataset.locidx) || 0); })
      );
      item.querySelectorAll('.req-btn.decline').forEach(b =>
        b.addEventListener('click', () => {
          const id = parseInt(b.dataset.id);
          // A decline can't be undone, so ask first — a stray click next to
          // the location buttons shouldn't throw away a request.
          if (typeof MenuSystem === 'undefined' || !MenuSystem.showConfirm) { decline(id); return; }
          try { SFX.click?.(); } catch (_e) {}
          MenuSystem.showConfirm('Decline this connection request? It will be removed and won\'t come back.',
            () => decline(id), { confirmLabel: 'Yes, Decline' });
        })
      );
      body.appendChild(item);
    }

    // Queue count footer — remaining items beyond the MAX_PENDING window
    const waiting = backlog.length;
    if (waiting > 0) {
      const footer = document.createElement('div');
      footer.className = 'req-empty';
      footer.style.color = '#506070';
      footer.textContent = `+ ${waiting} more in queue`;
      body.appendChild(footer);
    }
  }

  // The panel is visible iff the hotbar's request button carries `.open` —
  // that class is the entire CSS rule (`.cat-btn.open .cat-popup`), so the DOM
  // is the authority and `panelOpen` is only a cache of it.
  function isPanelVisible() {
    const b = document.getElementById('hotbar-req-btn');
    return !!(b && b.classList.contains('open'));
  }

  // Open regardless of what the cached flag says.
  //
  // closeCategoryPopup() (hotbar_ui.js) clears `.open` from every category
  // button, the request button included, but has no way to reach this
  // module's `panelOpen`. One press of Escape or a hotbar category key
  // therefore left the flag stuck true with the panel shut, and from then on
  // `if (!panelOpen) togglePanel()` was a no-op: clicking a request
  // notification did nothing at all, for the rest of the session.
  //
  // `id` is the request to show: each request's notification card opens the
  // panel on its own request, not on whichever is first in the list.
  function openPanel(id) {
    if (isPanelVisible()) panelOpen = true;
    else {
      panelOpen = false;   // resync before toggling, so this always opens
      togglePanel();       // (puts the view on the first request)
    }
    const i = id === undefined ? -1 : pending.findIndex(r => r.id === id);
    if (i >= 0) viewIndex = i;
    renderPanel();
  }

  function togglePanel() {
    panelOpen = !panelOpen;
    const reqBtn = document.getElementById('hotbar-req-btn');
    if (panelOpen) {
      if (typeof closeCategoryPopup === 'function') closeCategoryPopup();
      if (reqBtn) { reqBtn.classList.add('open'); openCategoryId = '__requests__'; }
      viewIndex = 0;
    } else {
      if (reqBtn) reqBtn.classList.remove('open');
      // Only give up the slot if this panel still owns it. Build-category
      // popups can now be opened while the requests list stays up, and
      // blanking their id here left a popup on screen that every
      // `openCategoryId` check believed was closed.
      if (openCategoryId === '__requests__') openCategoryId = null;
    }
    if (panelOpen) renderPanel();
  }

  // MK4-era customers are the ones behind an MK4-or-later gate. Their fees
  // were cut 40% to squeeze mid-game income; save.js re-prices the ones a
  // save already holds from this, since a placed property keeps the fee it
  // was accepted at (see dailyFee in accept()).
  const _MK4_GATES = new Set([hasMk4, hasMk4AdvReactor, hasFusionReactor, hasMeridianDone, hasMhdRing, hasPostMeridian40]);
  let _mk4Fees = null;
  function mk4Fee(subtype) {
    if (!_mk4Fees) {
      _mk4Fees = new Map();
      for (const r of [...INDUSTRIAL_POOL, ...COMMERCIAL_POOL, ...FAMILY_POOL])
        if (r.subtype && _MK4_GATES.has(r.unlock)) _mk4Fees.set(r.subtype, r.fee);
    }
    return _mk4Fees.get(subtype);
  }

  return {
    mk4Fee,
    tickRequests(dt) {
      gameTime += dt;

      // Re-derive the cached flag from the DOM. Anything that closes category
      // popups does so without going through togglePanel(), so without this
      // the flag drifts and every `if (panelOpen)` in this file starts lying.
      panelOpen = isPanelVisible();

      // Expire old declined location cooldowns
      if (_declinedLocs.length) _declinedLocs = _declinedLocs.filter(d => d.expires > gameTime);
      // TTL expiry — tracked in in-game hours so speed doesn't affect deadline
      // TTL drains in real seconds regardless of time scale
      const _realDt = dt / (DevMode.timeScale || 1); // unscaled real seconds
      const _hourPerRealSec = 24 / 1200; // in-game hours per real second
      const expired = pending.filter(r => {
        r.ttl -= _realDt * _hourPerRealSec;  // always real-time based
        // Every site now on contaminated ground: the request is withdrawn.
        if (!_clearOfFallout(r)) r.ttl = 0;
        return r.ttl <= 0;
      });
      expired.forEach(r => {
        if (r.notifId) NotificationStack.dismiss(r.notifId);
        if (!r.isCabin) showToast(`${r.family} found another provider`, '#506070', '#080c10', '#1e3040');
        else cabinSent = false;  // cabin can retry
      });
      if (expired.length) {
        pending = pending.filter(r => r.ttl > 0);
        updateBadge();
        if (panelOpen) renderPanel();
      }

      // Cooldown tick
      if (cooldownTimer > 0) {
        cooldownTimer -= dt;
        if (cooldownTimer <= 0) drainBacklog();
      }

      // Keep the "Next request in Xs..." text live while the panel is idle-open.
      // renderPanel() only runs on discrete events (accept/decline/nav/open), so
      // without this the countdown would visibly freeze until something else
      // forced a re-render.
      if (panelOpen && !pending.length) {
        const cdEl = document.getElementById('req-cd-text');
        if (cdEl) cdEl.textContent = `Next request in ${Math.ceil(Math.max(0, cooldownTimer))}s...`;
      }
    },

    tick(totalWs) {
      const gen = PowerNetwork.stats.totalGenerated;

      // The hookup deal ends the moment Mae's Cabin (the first house) has power.
      if (cabinDeal) {
        for (const h of EntityRegistry.getByType(T.HOUSE)) {
          if (!h.powered) continue;
          cabinDeal = false;
          showToast("Mae's Cabin is online; wires and Power Poles are back to full price", '#a0c0d0', '#080c10', '#1e3040');
          if (typeof refreshHotbar === 'function') refreshHotbar();
          break;
        }
      }

      // Latch the two category gates FIRST, before the early returns in the
      // phases below (cabin just spawned, cabin not yet cleared). The player
      // can satisfy either requirement at a moment when the rest of this
      // function is short-circuited, and a gate that only latches on the path
      // that also spawns a request would miss it.
      const _sub = substationState();
      if (_sub.ready) subEverReady = true;
      if (GeothermalSystem.runningTurbineCount() > 0) geoEverRan = true;
      if (PowerNetwork.stats.totalGenerated >= BIG_BUILDING_GEN) genEverAbove750 = true;

      // ── PHASE 1: Mae's Cabin ──────────────────────────────────────
      // Fires early — just needs solar generating. No substation.
      // First signal that this grid is supposed to serve people.
      if (!cabinSent && totalWs >= 400 && gen > 0.5 && Progression.isUnlocked(T.RESEARCH)) {
        spawnCabin();
        return;
      }

      // ── PHASE 2: Small houses ─────────────────────────────────────
      // Arrive after cabin dealt with, no substation required.
      // They wire directly to solar — work in day, dark at night.
      // This is the pressure that makes substation feel necessary.
      if (!cabinCleared) return;

      if (totalWs >= nextThreshold && gen > 1) {
        // Keep slowing request frequency as the city grows — a one-time doubling at
        // house #2 wasn't enough because generation (and so totalWs accrual rate)
        // keeps climbing as more houses/plants get added, which made requests feel
        // like they sped back up again past ~house #6. Scale continuously instead,
        // capped so it doesn't grind to a halt on a huge city.
        const _scaleFactor = Math.min(8, 1 + housesAccepted * 0.5);
        const _wsStep = WS_PER_REQUEST * _scaleFactor * eraPace();
        const _houseInterval = MIN_REQUEST_INTERVAL.house * _scaleFactor * eraPace();
        if (pending.length < MAX_PENDING && gameTime - lastRequestTime.house >= _houseInterval) {
          nextThreshold += _wsStep;
          spawnRequest();
          lastRequestTime.house = gameTime;
        }
      }

      // ── PHASE 3: Commercial — REQUIRES charged substation ─────────
      // The only prerequisite is a substation that has banked real charge.
      // The old "3 residential accepted first" requirement is gone: a player
      // who wires up a substation early should be able to take commercial
      // customers without first being handed three houses.
      // Commercial customers need reliable power. They won't connect
      // without a substation, making it the gateway to premium income.
      // NOTE: this used to try GridManager.getAllEntities() as a "fast path"
      // first — that method never existed on GridManager, so it always fell
      // through to the full ROWS×COLS scan below. EntityRegistry is the
      // actual fast path.
      const subCharge = _sub.charge;

      if (subEverReady && totalWs >= commercialThresh && gen > 1) {
        // Keep slowing commercial request frequency as more get accepted, same
        // continuous-scaling approach as residential (see PHASE 2 above) — a
        // one-time doubling wasn't enough once generation kept climbing.
        const _comScale = Math.min(8, 1 + commercialsAccepted * 0.5);
        const _comStep = 40000 * _comScale * eraPace();
        const _comInterval = MIN_REQUEST_INTERVAL.commercial * _comScale * eraPace();
        if (pending.length < MAX_PENDING && gameTime - lastRequestTime.commercial >= _comInterval) {
          // Rebase off the watt-hours actually banked rather than the old
          // threshold: with the fixed 1.25M tier gone there is no special
          // case left, but starting from totalWs still keeps the next
          // request a full step away even if the player banked a large
          // surplus while the substation was not yet charging.
          commercialThresh = Math.max(commercialThresh, totalWs) + _comStep;
          spawnCommercial();
          lastRequestTime.commercial = gameTime;
        }
      }

      // ── PHASE 4: Industrial — after geothermal power is running ────
      // Industry follows the heavy generation, not the shopfronts: the gate
      // used to be 5 accepted commercial customers, which arrived on a
      // schedule the player couldn't really influence. Requiring a running
      // Geothermal Turbine ties it to an actual build-out decision instead.
      if (geoEverRan && subCharge >= 50 && totalWs >= industrialThresh && gen > 5) {
        // Industrial requests are spaced a further 20% apart than the base
        // scaling gives — factories are big, disruptive placements and arrived
        // faster than they felt earned. Applied to BOTH gates: the WH step
        // (how much more power must be banked) and the real-time interval.
        const _indScale = Math.min(8, 1 + HouseRequestSystem.getIndustrialsAccepted() * 0.5) * 1.2;
        const _indStep = 60000 * _indScale * eraPace();
        const _indInterval = MIN_REQUEST_INTERVAL.industrial * _indScale * eraPace();
        if (pending.length < MAX_PENDING && gameTime - lastRequestTime.industrial >= _indInterval) {
          industrialThresh += _indStep;
          spawnIndustrial();
          lastRequestTime.industrial = gameTime;
        }
      }
    },

    init() {
      document.getElementById('btn-requests').addEventListener('click', togglePanel);
      updateBadge();
    },

    // Dev: reset requests
    reset() { _cancelSpawns(); pending=[]; backlog=[]; cooldownTimer=0; cabinSent=false; cabinCleared=false; cabinDeal=false; housesAccepted=0; subEverReady=false; geoEverRan=false; genEverAbove750=false; genEverAbove1500=false; genEverAbove2500=false; genEverAbove5000=false; genEverAbove20000=false; genEverAbove40000=false; commercialThresh=4000; commercialsAccepted=0; industrialsAccepted=0; _industrialsReconciled=false; industrialThresh=8000; viewIndex=0; _lastComSubtype=null; _lastIndSubtype=null; _commercialRequestFired=false; _industrialRequestFired=false; updateBadge(); if(panelOpen) renderPanel(); },

    // One-time repair for saves affected by the runaway-threshold bug (thresholds
    // that kept advancing every tick even when no request could spawn, because
    // the pending queue was full). Clamps each threshold back to just above the
    // current totalWs so requests resume at a reasonable pace. Run once from the
    // browser console: HouseRequestSystem.fixStuckThresholds()
    fixStuckThresholds() {
      const totalWs = Progression.totalWs;
      const before = { nextThreshold, commercialThresh, industrialThresh };
      nextThreshold    = Math.min(nextThreshold,    totalWs + WS_PER_REQUEST);
      commercialThresh = Math.min(commercialThresh, totalWs + 40000);
      industrialThresh = Math.min(industrialThresh, totalWs + 60000);
      updateBadge();
      if (panelOpen) renderPanel();
      console.log('[HouseRequestSystem] Thresholds repaired:', { before, after: { nextThreshold, commercialThresh, industrialThresh } });
      return { before, after: { nextThreshold, commercialThresh, industrialThresh } };
    },
    getHousesAccepted()      { return housesAccepted; },
    onCustomerLeft(entity) {
      // Decrement the right counter so progression thresholds stay accurate
      if (entity.type === T.COMMERCIAL && !entity.isIndustrial) commercialsAccepted = Math.max(0, commercialsAccepted - 1);
      else if (entity.type === T.INDUSTRIAL) { _reconcileIndustrials(); industrialsAccepted = Math.max(0, industrialsAccepted - 1); }
      else if (entity.type === T.HOUSE) housesAccepted = Math.max(0, housesAccepted - 1);
      // Severance — leaving customers are owed 90% of their upfront payment back
      if (entity.upfrontPaid) {
        const severance = Math.round(entity.upfrontPaid * 0.9);
        Economy.spend(severance);
        showToast(`💸 Paid ${formatMoney(severance)} severance`, '#ff8040', '#180a00', '#804020');
      }
      ZoneSystem.removeBuilding(entity);
    },
    getCommercialsAccepted() { return commercialsAccepted; },
    hasCommercialRequestFired() {
      // The dedicated flag covers the normal spawn path; fall back to scanning
      // live state too so this stays correct for saves made before the flag
      // existed, and for any other path (dev tools, etc.) that skips it.
      return _commercialRequestFired || commercialsAccepted >= 1
        || pending.some(r => r.isCommercial && !r.isIndustrial)
        || backlog.some(r => r.isCommercial && !r.isIndustrial);
    },
    hasIndustrialRequestFired() {
      return _industrialRequestFired || industrialsAccepted >= 1
        || pending.some(r => r.isIndustrial)
        || backlog.some(r => r.isIndustrial);
    },
    getIndustrialsAccepted() { _reconcileIndustrials(); return industrialsAccepted; },
    getCabinCleared()        { return cabinCleared; },
    cabinDealActive()        { return cabinDeal; },
    getActivePendingRequest() { return (panelOpen && pending[viewIndex]) ? pending[viewIndex] : null; },
    getTrackerStatus() {
      return {
        cooldownTimer,
        cooldownTotal: gridHealthCooldown(),
        pendingCount:  pending.length,
        backlogCount:  backlog.length,
        nextThreshold,
        commercialThresh,
        industrialThresh,
        housesAccepted,
        commercialsAccepted,
        industrialsAccepted,
        geoTurbinesRunning: GeothermalSystem.runningTurbineCount(),
        substation:         substationState(),
        subEverReady,
        geoEverRan,
        genEverAbove750,
        cabinCleared,
        cabinSent,
        gameTime,
        lastRequestTime,
      };
    },
    getPendingCount() { return pending.length; },
    renderPanel() { renderPanel(); },
    togglePanel() { togglePanel(); },
    // Sites for relocating an existing property: the same A..G a new
    // request of its kind would be offered (anchored to its zones, F and G
    // far out, its site rule if it has one), minus the spot it stands on.
    freshLocations(requireSubstation, entity = null) {
      const fp = entity
        ? { width: entity.width || 1, height: entity.height || 1 }
        : { width: 1, height: 1 };
      if (!entity) return pickCandidateLocations(requireSubstation, 3, fp);
      const ind = entity.type === T.INDUSTRIAL || entity.isIndustrial;
      const zoneKey = ind ? 'industrial' : entity.type === T.COMMERCIAL ? 'commercial' : 'residential';
      const nType   = ind ? T.INDUSTRIAL : entity.type === T.COMMERCIAL ? T.COMMERCIAL : T.HOUSE;
      const sub = entity.commercialSubtype && entity.commercialSubtype !== 'commercial_default' ? entity.commercialSubtype : null;
      let locs = [];
      try {
        locs = _drain((function* () {
          const l = yield* _firstGuessLocations(requireSubstation, fp, nType, zoneKey);
          yield* _anchorOptionsToZones(zoneKey, fp, l, { subtype: sub, tier: entity.houseWealthTier || null });
          return _applySiteRule(sub, fp, l);
        })()) || [];
      } catch (err) { console.warn('[relocate] site search failed', err); locs = []; }
      const seen = new Set();
      const out = [];
      for (const l of locs) {
        if (!l || l.col == null) continue;
        if (l.col === entity.col && l.row === entity.row) continue;
        const k = l.col + ',' + l.row;
        if (seen.has(k)) continue;
        seen.add(k); out.push({ col: l.col, row: l.row });
      }
      if (out.length) return out.slice(0, OPTION_COUNT);
      return pickCandidateLocations(requireSubstation, OPTION_COUNT, fp);
    },

    serialise() {
      return {
        cabinSent, cabinCleared, cabinDeal, nextThreshold, housesAccepted, commercialThresh,
        commercialsAccepted, industrialsAccepted, industrialThresh, cooldownTimer, gameTime, lastRequestTime,
        subEverReady, geoEverRan, genEverAbove750, genEverAbove1500, genEverAbove2500, genEverAbove5000, genEverAbove20000, genEverAbove40000,
        pending: pending.map(r => ({ ...r })),
        backlog: backlog.map(r => ({ ...r })),
        rareAccepted:   [..._rareAccepted],
        rareMissStreak: { ..._rareMissStreak },
        offeredCom: [..._offeredCom], offeredInd: [..._offeredInd],
      };
    },

    loadState(d) {
      _cancelSpawns();
      cabinSent        = d.cabinSent        || false;
      cabinCleared     = d.cabinCleared     || false;
      cabinDeal        = d.cabinDeal        || false;
      nextThreshold      = d.nextThreshold      || 10000;
      housesAccepted     = d.housesAccepted     || 0;
      commercialThresh   = d.commercialThresh   || 4000;
      commercialsAccepted = d.commercialsAccepted || 0;
      industrialsAccepted = d.industrialsAccepted || 0;
      _industrialsReconciled = false;
      industrialThresh   = d.industrialThresh   || 8000;
      pending       = d.pending || [];
      // Rare-item pity tracking — without persisting these, every reload
      // wiped the miss streak back to 0, so the "guaranteed within
      // RARE_PITY misses" promise for townhouses/apartments/condos (and
      // any rare commercial/industrial type) never actually paid off for
      // anyone who saved and reloaded instead of playing one unbroken run.
      _rareAccepted.clear();
      (d.rareAccepted || []).forEach(s => _rareAccepted.add(s));
      Object.keys(_rareMissStreak).forEach(k => delete _rareMissStreak[k]);
      Object.assign(_rareMissStreak, d.rareMissStreak || {});
      _offeredCom.clear(); (d.offeredCom || []).forEach(x => _offeredCom.add(x));
      _offeredInd.clear(); (d.offeredInd || []).forEach(x => _offeredInd.add(x));
      backlog       = d.backlog || [];
      // Oilfield Bunkhouses became Sunset Grove Retirement Village: re-tag any
      // offer still waiting, and carry its rare-pity progress across, so a
      // save made before the change neither places the old type nor loses
      // the streak it had built up (the placed buildings migrate in save.js).
      for (const r of [...pending, ...backlog]) {
        if (r.subtype !== 'bunkhouse') continue;
        r.subtype = 'retirement';
        if (r.family === 'Oilfield Bunkhouses') r.family = 'Sunset Grove Retirement Village';
        if (r.name === 'Oilfield Bunkhouses')   r.name   = 'Sunset Grove Retirement Village';
      }
      // The industrial Chemical Plant customer became Solvent Works, so it
      // isn't confused with the placeable Chemical Plant (sulfuric acid).
      for (const r of [...pending, ...backlog]) {
        if (r.name === 'Chemical Plant' && (r.subtype === 'chemical' || r.subtype === 'factory')) r.name = 'Solvent Works';
      }
      if (_rareAccepted.delete('bunkhouse')) _rareAccepted.add('retirement');
      if (_rareMissStreak.bunkhouse !== undefined) {
        _rareMissStreak.retirement = Math.max(_rareMissStreak.retirement || 0, _rareMissStreak.bunkhouse);
        delete _rareMissStreak.bunkhouse;
      }
      cooldownTimer = d.cooldownTimer || 0;
      gameTime = d.gameTime || 0;
      lastRequestTime = d.lastRequestTime || { house: -999, commercial: -999, industrial: -999 };
      // Saves from before the latches existed carry no flag. Infer each one
      // from what the player was already being offered — anyone who had seen
      // a request of that kind had plainly met the gate — so nobody loses a
      // category they had earned. Run after pending/backlog are restored,
      // since hasCommercialRequestFired() reads them.
      subEverReady = d.subEverReady !== undefined ? d.subEverReady
                   : HouseRequestSystem.hasCommercialRequestFired();
      // Saves from before this gate existed carry no flag. Anyone already
      // running a grid this size has plainly met it, so infer from live
      // generation rather than making them re-cross a line they are past.
      genEverAbove750 = d.genEverAbove750 !== undefined ? d.genEverAbove750
                      : (PowerNetwork.stats.totalGenerated >= BIG_BUILDING_GEN);
      geoEverRan   = d.geoEverRan   !== undefined ? d.geoEverRan
                   : HouseRequestSystem.hasIndustrialRequestFired();
      // Crypto Mine gate — same inference as genEverAbove750 for older saves.
      genEverAbove1500 = d.genEverAbove1500 !== undefined ? d.genEverAbove1500
                       : (PowerNetwork.stats.totalGenerated >= 1500);
      genEverAbove2500 = d.genEverAbove2500 !== undefined ? d.genEverAbove2500
                       : (PowerNetwork.stats.totalGenerated >= 2500);
      genEverAbove5000 = d.genEverAbove5000 !== undefined ? d.genEverAbove5000
                       : (PowerNetwork.stats.totalGenerated >= 5000);
      genEverAbove20000 = d.genEverAbove20000 !== undefined ? d.genEverAbove20000
                       : (PowerNetwork.stats.totalGenerated >= 20000);
      genEverAbove40000 = d.genEverAbove40000 !== undefined ? d.genEverAbove40000
                       : (PowerNetwork.stats.totalGenerated >= 40000);
      // Restart the id sequence PAST every id restored above. requestIdCounter
      // is module state that a load doesn't touch, so it used to resume at 1
      // while the restored queue still held ids 1..n — the next few requests
      // spawned with ids that collided with ones already pending. Every accept
      // path resolves its button through `pending.find(r => r.id === id)`,
      // which returns the FIRST match, so clicking Accept on the second
      // request could place the first one's building instead (a Textile Mill
      // appearing where a Chemical Plant was chosen). Ids must be unique for
      // that lookup to mean anything.
      let _maxId = 0;
      for (const r of pending) if (r && r.id > _maxId) _maxId = r.id;
      for (const r of backlog) if (r && r.id > _maxId) _maxId = r.id;
      requestIdCounter = Math.max(requestIdCounter, _maxId + 1);
      viewIndex = 0;
      updateBadge();
    },
    spawn()  { spawnRequest(); },
    lookupPoolEntry(name) {
      // Used by inspection panels to read authoritative minDraw/peakDraw
      // for entities placed before those fields started being copied to
      // the entity itself.
      return COMMERCIAL_POOL.find(b => b.name === name)
          || INDUSTRIAL_POOL.find(i => i.name === name)
          || null;
    },
    // Wealth-tier lookup by family name — lets houses placed before
    // houseWealthTier started being stamped on accept() self-heal to the
    // right sprite at render time instead of staying stuck on "mid".
    lookupHouseTier(name) {
      const fam = FAMILY_POOL.find(f => f.name === name);
      if (!fam) return null;
      return fam.subtype ? null : _wealthTier(fam.demandMult || 1.0);
    },

    // ── DEV MODE API ────────────────────────────────────────────────
    getFamilyPool()     { return FAMILY_POOL.map(f => ({ name: f.name, rare: !!f.rare })); },
    getCommercialPool() { return COMMERCIAL_POOL.map(b => ({ name: b.name, subtype: b.subtype, rare: !!b.rare })); },
    getIndustrialPool() { return INDUSTRIAL_POOL.map(i => ({ name: i.name, subtype: i.subtype, rare: !!i.rare })); },
    devSpawnHouse(name) {
      const fam = FAMILY_POOL.find(f => f.name === name);
      if (fam) _devSpawnHouseEntry(fam);
    },
    devSpawnCommercial(subtype) {
      const biz = COMMERCIAL_POOL.find(b => b.subtype === subtype);
      if (biz) _devSpawnBizEntry(biz, T.COMMERCIAL, false);
    },
    devSpawnIndustrial(subtype) {
      const ind = INDUSTRIAL_POOL.find(i => i.subtype === subtype);
      if (ind) _devSpawnBizEntry(ind, T.INDUSTRIAL, true);
    },
    // Dev / testing: grow the city by `n` ordinary requests of a kind
    // ('house', 'commercial', 'industrial'), each rolled and placed exactly
    // as a live one is, then accepted at option `opt` (an index, or 'zone'
    // for a random zone-anchored option). Skips the cooldown and the queue.
    devGrow(kind = 'house', n = 1, opt = 0) {
      let placed = 0;
      for (let k = 0; k < n; k++) {
        const top = requestIdCounter;
        _drain((kind === 'commercial' ? _doSpawnCommercial : kind === 'industrial' ? _doSpawnIndustrial : _doSpawnRequest)());
        const req = [...backlog, ...pending].find(r => r.id === top);
        if (!req || !req.locations || !req.locations.length) { backlog = backlog.filter(r => r !== req); continue; }
        backlog = backlog.filter(r => r !== req);
        if (!pending.includes(req)) pending.push(req);
        req.ttl = req.ttlMax = 100;
        const zones = ZoneSystem.zoneCount(kind === 'house' ? 'residential' : kind);
        const i = opt === 'zone'
          ? Math.floor(Math.random() * Math.max(1, Math.min(zones, ANCHOR_SLOTS, req.locations.length)))
          : Math.min(opt, req.locations.length - 1);
        accept(req.id, i);
        placed++;
      }
      cooldownTimer = 0;
      return placed;
    },

    // ── Demo scenarios (scenario_system.js) ──
    // Move a customer from the pools in at a chosen tile, through the same
    // accept() a player's click goes through, so it is a real customer in
    // every respect: fee, demand, population, zone. `key` is a pool
    // subtype; for tier 'house' it may also be a wealth tier ('budget',
    // 'mid', 'premium', 'luxury') for a family home, taken in turn (`n`).
    scenarioFootprint(tier, key) {
      if (tier === 'house') {
        const fam = FAMILY_POOL.find(f => f.subtype === key);
        return fam ? _famFootprint(fam) : entityFootprint(T.HOUSE);
      }
      return entityFootprint(tier === 'industrial' ? T.INDUSTRIAL : T.COMMERCIAL, key);
    },
    scenarioPlace(tier, key, col, row, n = 0) {
      const before = EntityRegistry.all().size;
      if (tier === 'house') {
        let fam = FAMILY_POOL.find(f => f.subtype === key);
        if (!fam) {
          const homes = FAMILY_POOL.filter(f => !f.subtype && _wealthTier(f.demandMult || 1) === key);
          fam = homes.length ? homes[n % homes.length] : FAMILY_POOL.find(f => !f.subtype);
        }
        if (!fam) return false;
        pending.push({
          id: requestIdCounter++, family: fam.subtype === 'cornerstore' ? _freshStoreName() : fam.name,
          upfront: fam.upfront, fee: fam.fee,
          demandScale: fam.demandMult || 1.0, _rare: !!fam.rare, subtype: fam.subtype || null,
          _width: _famFootprint(fam).width, _height: _famFootprint(fam).height, _tier: 'house',
          houseWealthTier: fam.subtype ? null : _wealthTier(fam.demandMult || 1.0),
          locations: [{ col, row }], ttl: TTL.house, ttlMax: TTL.house,
        });
      } else {
        const isIndustrial = tier === 'industrial';
        const biz = (isIndustrial ? INDUSTRIAL_POOL : COMMERCIAL_POOL).find(b => b.subtype === key);
        if (!biz) return false;
        if (isIndustrial) _industrialRequestFired = true; else _commercialRequestFired = true;
        pending.push({
          id: requestIdCounter++, family: biz.name, subtype: biz.subtype, upfront: biz.upfront, fee: biz.fee,
          peakDraw: biz.peakDraw, minDraw: biz.minDraw, idleDraw: biz.idleDraw, desc: biz.desc,
          isCommercial: true, isIndustrial, _rare: !!biz.rare, _tier: tier,
          locations: [{ col, row }], ttl: TTL[tier], ttlMax: TTL[tier],
        });
      }
      accept(pending[pending.length - 1].id, 0);
      return EntityRegistry.all().size !== before;
    },
  };
})();

// What placing `type` costs right now. Normally its listed cost; during the
// Mae's Cabin hookup deal wires are free and Power Poles half price. Every
// placement path charges through this, and each wire/pole remembers what it
// actually cost (`_paid`) so removing or undoing it refunds that, not the
// list price — a free wire must never refund money.
function buildCost(type) {
  const base = EntityDefs[type]?.cost || 0;
  let price = base;
  if (typeof HouseRequestSystem !== 'undefined' && HouseRequestSystem.cabinDealActive()) {
    if (type === T.WIRE) price = 0;
    else if (type === T.POLE) price = Math.round(base * 0.5);
  }
  // A contract perk (contract_perks.js) can discount equipment too; the
  // better of the two deals wins.
  if (typeof ContractPerks !== 'undefined') price = Math.min(price, ContractPerks.priceFor(type, base));
  return price;
}
// Refund for removing a placed wire/pole: what was paid for it.
function paidCost(e) {
  return e && e._paid !== undefined ? e._paid : (e?.def?.cost || EntityDefs[e?.type]?.cost || 0);
}
