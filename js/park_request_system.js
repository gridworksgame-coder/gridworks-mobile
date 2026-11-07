/* ═══════════════════════════════════════════════════════════════════
   PARK REQUEST SYSTEM
   Zone-level requests (not per-building) for Small Park, Community
   Garden, Tree-Lined Street, Basketball Court, and Farmers Market.
   Residential zones only. Per-type caps below (2 for most, 1 for the
   Farmers Market as a milestone amenity). Locations are pulled near an
   existing residential building in that zone (same pattern as
   house/commercial/industrial requests), so options never land far
   from the grid; the zone rect expands to absorb the new building via
   ZoneSystem.addBuilding, same as any other residential placement.
   ═══════════════════════════════════════════════════════════════════ */
const PARK_TYPES = [T.SMALLPARK, T.COMMUNITYGARDEN, T.TREEDSTREET, T.BASKETBALLCOURT, T.FARMERSMARKET, T.FOUNTAIN, T.SPLASHPAD, T.BASEBALLFIELD, T.PLAYGROUND, T.ALLOTMENTS, T.DOGPARK, T.COMMUNITYCENTER, T.GREENHOUSE, T.CORNERSTORE, T.FARM];
// Parks that draw power on a schedule and so DO join the grid — every other
// park type is kept off it entirely (see isPark in power_network.js).
const POWERED_PARK_TYPES = [T.SPLASHPAD, T.BASEBALLFIELD, T.COMMUNITYCENTER, T.GREENHOUSE, T.CORNERSTORE];
const PARK_ONE_TIME = {
  [T.SMALLPARK]:       8000,
  [T.COMMUNITYGARDEN]: 6000,
  [T.TREEDSTREET]:     3000,
  [T.BASKETBALLCOURT]: 10000,
  [T.FARMERSMARKET]:   14000,
  [T.FOUNTAIN]:        12000,
  [T.SPLASHPAD]:       9000,
  [T.BASEBALLFIELD]:   16000,
  [T.PLAYGROUND]:      5000,
  [T.ALLOTMENTS]:      18000,
  [T.DOGPARK]:         15000,
  [T.COMMUNITYCENTER]: 24000,
  [T.GREENHOUSE]:      22000,
  [T.CORNERSTORE]:     7000,
  [T.FARM]:            30000,
};
// Max instances of a given park type per residential zone.
const PARK_MAX_PER_ZONE = {
  [T.SMALLPARK]:       2,
  [T.COMMUNITYGARDEN]: 2,
  [T.TREEDSTREET]:     2,
  [T.BASKETBALLCOURT]: 2,
  [T.FARMERSMARKET]:   1,  // milestone amenity — one per neighborhood
  [T.FOUNTAIN]:        1,  // centrepiece — one per neighborhood
  [T.SPLASHPAD]:       2,
  [T.BASEBALLFIELD]:   1,  // big lit field — one per neighborhood
  [T.PLAYGROUND]:      2,
  [T.ALLOTMENTS]:      1,
  [T.DOGPARK]:         1,
  [T.COMMUNITYCENTER]: 1,
  [T.GREENHOUSE]:      1,
  [T.CORNERSTORE]:     2,   // a shop at each end of the neighbourhood
  [T.FARM]:            1,   // one farm per neighbourhood
};
// Minimum residential buildings in a zone before a type becomes eligible.
// Absent = no extra threshold beyond the global power gate below.
const PARK_MIN_BUILDINGS = {
  [T.BASKETBALLCOURT]: 8,
  [T.PLAYGROUND]:      8,   // same stage as the Basketball Court
  [T.FARMERSMARKET]:   12,
  [T.BASEBALLFIELD]:   10,
  // MK3 parks want a settled neighbourhood.
  [T.ALLOTMENTS]:      12,
  [T.DOGPARK]:         12,
  [T.COMMUNITYCENTER]: 12,
  [T.GREENHOUSE]:      12,
  [T.CORNERSTORE]:     6,   // enough doorsteps to keep a shop going
  [T.FARM]:            14,  // a big neighbourhood to feed
};
// Peak generation (W) that must have been reached before a type becomes
// eligible. Latched — see genPeak below — so a dip in output (night, a
// storm) doesn't pull the type back out of the pool.
const PARK_MIN_GEN = {
  [T.FOUNTAIN]: 800,
};
// Generator type that must have been built before a park type becomes
// eligible. Latched for the session (see techReached) and, like PARK_MIN_GEN,
// satisfied by the park already existing so a load doesn't re-lock it.
const PARK_REQUIRES_BUILT = {
  [T.SPLASHPAD]:     T.COALGENERATOR,   // after coal power
  [T.BASEBALLFIELD]: T.FUELGEN,         // after fuel power
  [T.ALLOTMENTS]:      T.RESEARCH3,     // Research Station MK3
  [T.DOGPARK]:         T.RESEARCH3,
  [T.COMMUNITYCENTER]: T.RESEARCH3,
  [T.GREENHOUSE]:      T.RESEARCH3,
  [T.FARM]:            T.HYDROGENERATOR,  // hydro-power era
};
const COMMERCIAL_SPIKES = {
  restaurant: { base: 6,  peak: 15, freqMin: 45, freqMax: 75, durMin: 12, durMax: 18 },
  fastfood:   { base: 4.5, peak: 15.75, freqMin: 30, freqMax: 60, durMin: 8,  durMax: 12 },
  donutshop:  { base: 3,  peak: 12, freqMin: 40, freqMax: 70, durMin: 8,  durMax: 14 },
  hotdog:     { base: 3.5, peak: 11, freqMin: 35, freqMax: 65, durMin: 6,  durMax: 10 },
  pizzeria:   { base: 6,  peak: 14, freqMin: 45, freqMax: 75, durMin: 10, durMax: 16 },
  coworking:  { base: 13, peak: 20, freqMin: 60, freqMax: 90, durMin: 15, durMax: 25 },
  gym:        { base: 7,  peak: 22, freqMin: 40, freqMax: 70, durMin: 10, durMax: 15 },
  bakery:     { base: 2,  peak: 13, freqMin: 50, freqMax: 80, durMin: 10, durMax: 16 },
  autorepair: { base: 6,  peak: 32, freqMin: 35, freqMax: 65, durMin: 10, durMax: 18 },
  // Industrial — Recycling Plant. Same spike mechanism as the commercial
  // entries above; economy.js applies this table to both T.COMMERCIAL and
  // T.INDUSTRIAL entities keyed by commercialSubtype.
  recyclingplant: { base: 20, peak: 42, freqMin: 35, freqMax: 65, durMin: 10, durMax: 16 },
  // MK3-era — Precision Machine Shop (industrial) machining runs and the
  // Radiology Hospital Wing's (commercial) MRI scans.
  machineshop:    { base: 83, peak: 151, freqMin: 30, freqMax: 60, durMin: 10, durMax: 20 },
  radiology:      { base: 83, peak: 151, freqMin: 40, freqMax: 80, durMin: 8,  durMax: 14 },
  // Post-MK2 — Truck Stop Diner meal rushes as the rigs roll in.
  truckstop:      { base: 7,  peak: 14,  freqMin: 30, freqMax: 60, durMin: 10, durMax: 16 },
};

const ParkRequestSystem = (() => {
  let nextCheck = 300 + Math.random() * 300; // 5-10 min before first possible spawn
  const MIN_GAP = 360;        // min 6 min between spawns
  let lastFired = -9999;
  let elapsed = 0;

  // Pity counter — each spawn attempt an eligible (zone, type) pair loses
  // the random draw, its miss streak climbs; once it hits PITY it's forced
  // next time. Prevents low-probability types (e.g. Farmers Market, which
  // competes 1-in-N against every other eligible type/zone pair) from
  // theoretically never showing up in a long game — same idea as the
  // rare-house pity system in house_request_system.js.
  const PARK_PITY = 6;
  const missStreak = {};

  // Counts by current geometric containment in the zone rect, not the
  // entity's stored _zoneIndex — zone rects get renumbered/merged/split
  // whenever ZoneSystem recomputes them (e.g. computeZonesForType re-sorts
  // by earliest-placed building), so a stale stored index can drift from
  // the zone the building actually sits in and let the per-type cap leak.
  function countParkTypeInZone(rect, type) {
    let n = 0;
    for (const e of EntityRegistry.getByType(type)) {
      if (e.col < rect.minC || e.col > rect.maxC || e.row < rect.minR || e.row > rect.maxR) continue;
      n++;
    }
    return n;
  }

  function residentialBuildingsInZone(rect) {
    const list = [];
    for (const t of [T.HOUSE, T.CABIN]) {
      for (const e of EntityRegistry.getByType(t)) {
        if (!e.fromRequest) continue;
        if (rect && (e.col < rect.minC || e.col > rect.maxC || e.row < rect.minR || e.row > rect.maxR)) continue;
        list.push(e);
      }
    }
    return list;
  }

  // Types big enough that a hole for them inside a built-up zone is rare,
  // and that belong on the outskirts of town anyway, not in the middle of
  // it. They go up against the outside of the zone, on any side, and the
  // zone's outline grows to take them in (ZoneSystem.computeZonesForType).
  const PARK_EDGE_SPILL = new Set([T.FARM]);
  // How much open ground an edge-of-town plot wants between itself and any
  // OTHER zone before more stops counting. Under this, a side is worse the
  // nearer it brings the plot to a neighbour.
  const EDGE_CLEARANCE = 30;

  // Tiles between a footprint and a zone rect (0 = touching or overlapping).
  function _gapToRect(z, c0, r0, c1, r1) {
    return Math.max(0, z.minC - c1, c0 - z.maxC) + Math.max(0, z.minR - r1, r0 - z.maxR);
  }

  // Where an edge-of-town plot goes: against the outside of its own zone,
  // on whichever side keeps it furthest from every other zone (residential,
  // commercial, industrial, government) and faces away from City Hall —
  // out of the way of where the town is growing. Ground inside the zone is
  // a last resort.
  function pickEdgeLocation(footprint, rect) {
    const fw = footprint.width, fh = footprint.height, reach = ZoneSystem.PARK_REACH ?? 2;
    const others = [];
    for (const key of ['residential', 'commercial', 'industrial', 'government'])
      for (const z of ZoneSystem.getZoneRects(key)) if (z !== rect) others.push(z);
    const homeGov = ZoneSystem.distToGovZone(Math.round((rect.minC + rect.maxC) / 2), Math.round((rect.minR + rect.maxR) / 2));
    const zoneW = rect.maxC - rect.minC + 1, zoneH = rect.maxR - rect.minR + 1;

    const minC = Math.max(EDGE_MARGIN, rect.minC - fw - reach), maxC = Math.min(COLS - EDGE_MARGIN - fw, rect.maxC + 1 + reach);
    const minR = Math.max(EDGE_MARGIN, rect.minR - fh - reach), maxR = Math.min(ROWS - EDGE_MARGIN - fh, rect.maxR + 1 + reach);
    const scored = [];
    for (let r = minR; r <= maxR; r++)
      for (let c = minC; c <= maxC; c++) {
        const c1 = c + fw - 1, r1 = r + fh - 1;
        const gap = _gapToRect(rect, c, r, c1, r1);
        if (gap > reach) continue;                       // has to stay attached to its own zone
        if (!GridManager.canPlaceFootprint(c, r, fw, fh)) continue;
        if (ZoneSystem.isInGovZone(c, r) || ZoneSystem.isInGovZone(c1, r1)) continue;
        const gov = ZoneSystem.distToGovZone(c + (fw >> 1), r + (fh >> 1));
        if (gov < ZoneSystem.GOV_RING_MIN) continue;
        let clear = EDGE_CLEARANCE;
        for (const z of others) clear = Math.min(clear, _gapToRect(z, c, r, c1, r1));
        const inside = Math.max(0, Math.min(c1, rect.maxC) - Math.max(c, rect.minC) + 1) * Math.max(0, Math.min(r1, rect.maxR) - Math.max(r, rect.minR) + 1) / (fw * fh);
        // Sits squarely along its side rather than hanging off a corner.
        const along = Math.max(0, rect.minC - c, c1 - rect.maxC) / Math.max(1, zoneW) + Math.max(0, rect.minR - r, r1 - rect.maxR) / Math.max(1, zoneH);
        const overhang = (c1 < rect.minC || c > rect.maxC) ? Math.max(0, rect.minR - r, r1 - rect.maxR) : (r1 < rect.minR || r > rect.maxR) ? Math.max(0, rect.minC - c, c1 - rect.maxC) : 0;
        scored.push({ col: c, row: r, score: clear * 2 - inside * 24 - gap * 2 - overhang * 0.8 + Math.max(-10, Math.min(10, (gov - homeGov) * 0.25)) - along });
      }
    if (!scored.length) return null;
    scored.sort((a, b) => b.score - a.score);
    const pool = scored.filter(s => s.score >= scored[0].score - 1.5);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function pickParkLocation(footprint, rect, type) {
    if (PARK_EDGE_SPILL.has(type)) return pickEdgeLocation(footprint, rect);
    const buildings = residentialBuildingsInZone(rect);
    const candidates = [];
    const fw = footprint.width, fh = footprint.height;
    const minC = Math.max(EDGE_MARGIN, rect.minC);
    const maxC = Math.min(COLS - EDGE_MARGIN - fw, rect.maxC - fw + 1);
    const minR = Math.max(EDGE_MARGIN, rect.minR);
    const maxR = Math.min(ROWS - EDGE_MARGIN - fh, rect.maxR - fh + 1);
    for (let r = minR; r <= maxR; r++)
      for (let c = minC; c <= maxC; c++) {
        if (!GridManager.canPlaceFootprint(c, r, fw, fh)) continue;
        if (ZoneSystem.isInGovZone(c, r)) continue;
        { const _d = ZoneSystem.distToGovZone(c, r); if (_d < ZoneSystem.GOV_RING_MIN || _d > ZoneSystem.GOV_RING_MAX) continue; }
        candidates.push({ col: c, row: r });
      }
    if (!candidates.length) return null;
    // Prefer candidates near an existing residential building in this zone
    function minDist(cand) {
      if (!buildings.length) return Infinity;
      return Math.min(...buildings.map(b =>
        Math.abs(cand.col - b.col) + Math.abs(cand.row - b.row)
      ));
    }
    candidates.sort((a, b) => minDist(a) - minDist(b));
    const near = candidates.filter(c => minDist(c) <= 12);
    const pool = near.length ? near : candidates.slice(0, 10);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function trySpawn() {
    if ((PowerNetwork.stats.totalConsumed || 0) < 115) return;
    const rects = ZoneSystem.getZoneRects?.('residential') || [];
    if (!rects.length) return;

    // Collect every (zone, type) pair that's under its per-type cap and
    // meets its building-count threshold (if any), then pick one at random.
    const eligible = [];
    rects.forEach((rect, idx) => {
      PARK_TYPES.forEach(type => {
        // Corner stores no longer turn up as parks: they ask to be connected
        // (FAMILY_POOL in house_request_system.js). The type stays in
        // PARK_TYPES so stores already standing in older saves keep working.
        if (type === T.CORNERSTORE) return;
        if (countParkTypeInZone(rect, type) >= (PARK_MAX_PER_ZONE[type] ?? 1)) return;
        const minB = PARK_MIN_BUILDINGS[type];
        if (minB && residentialBuildingsInZone(rect).length < minB) return;
        const minGen = PARK_MIN_GEN[type];
        if (minGen && !genReached(type, minGen)) return;
        const needBuilt = PARK_REQUIRES_BUILT[type];
        if (needBuilt && !techReached(type, needBuilt)) return;
        eligible.push({ idx, type });
      });
    });
    if (!eligible.length) return;

    const due = eligible.find(e => (missStreak[`${e.idx}:${e.type}`] || 0) >= PARK_PITY);
    const picked = due || eligible[Math.floor(Math.random() * eligible.length)];
    for (const e of eligible) {
      const key = `${e.idx}:${e.type}`;
      missStreak[key] = (e === picked) ? 0 : (missStreak[key] || 0) + 1;
    }
    const { idx: zoneIndex, type } = picked;
    const fp = entityFootprint(type);
    const loc = pickParkLocation(fp, rects[zoneIndex], type);
    if (!loc) return;

    for (let dr = 0; dr < fp.height; dr++) for (let dc = 0; dc < fp.width; dc++) {
      const t = GridManager.getEntity(loc.col + dc, loc.row + dr);
      if (t && t.type === T.TREE) GridManager.removeEntity(loc.col + dc, loc.row + dr);
    }

    const entity = new Entity(type, loc.col, loc.row);
    entity.width  = fp.width;
    entity.height = fp.height;
    entity.fromRequest      = true;
    entity._placedAt        = Date.now();
    entity._zoneIndex       = zoneIndex;
    entity._parkActiveSince = Date.now();
    // A corner store is somebody's business: give it a name no other store
    // on the map is using (the sign, info panel and this card all show it).
    if (type === T.CORNERSTORE) {
      const used = new Set([...EntityRegistry.getByType(T.CORNERSTORE)].map(s => s.businessName));
      const free = CORNER_STORE_NAMES.filter(n => !used.has(n));
      entity.businessName = free.length ? free[Math.floor(Math.random() * free.length)]
                                        : CORNER_STORE_NAMES[Math.floor(Math.random() * CORNER_STORE_NAMES.length)];
    }
    GridManager.setEntityFootprint(entity);
    ZoneSystem.addBuilding(entity);
    Economy.spend(-PARK_ONE_TIME[type]);

    const isStore = type === T.CORNERSTORE;
    const label = isStore ? entity.businessName : EntityDefs[type].label;
    NotificationStack.push({
      icon: isStore ? '🏪' : '🌳',
      title: `${label} ${isStore ? 'opened' : 'built'}`,
      message: `Residential Zone ${zoneIndex + 1}: the community rewarded your contribution with ${formatMoney(PARK_ONE_TIME[type])}. Click to jump there`,
      color: '#80d040',
      border: '#305010',
      onClick: () => {
        const wx = (loc.col + fp.width  * 0.5) * TILE;
        const wy = (loc.row + fp.height * 0.5) * TILE;
        Camera.recentreOn(wx, wy);
        SFX.click();
      },
    });
  }

  // Returns a satisfaction-recovery multiplier and churn-buffer multiplier
  // for buildings in the given zone index, based on active parks present.
  function getZoneBonus(zoneIndex) {
    const rects = ZoneSystem.getZoneRects?.('residential') || [];
    const rect = rects[zoneIndex];
    let count = 0;
    if (rect) {
      for (const t of PARK_TYPES) {
        count += countParkTypeInZone(rect, t);
      }
    }
    // Playgrounds are the one amenity that keeps paying off past the 2-park
    // cap: families with kids nearby are slower to move away, so each one
    // adds a further +25% churn buffer on top of the capped park bonus.
    const playgrounds = rect ? countParkTypeInZone(rect, T.PLAYGROUND) : 0;
    return {
      recoveryMult: 1 + 0.5 * Math.min(2, count),  // +50% per park, cap at 2 parks
      churnBufferMult: 1 + 0.5 * Math.min(2, count) + 0.25 * playgrounds,
      activeCount: count,
    };
  }

  // Geometric zone lookup for a placed park entity — used by the info panel.
  function zoneIndexForEntity(entity) {
    const rects = ZoneSystem.getZoneRects?.('residential') || [];
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (entity.col >= r.minC && entity.col <= r.maxC && entity.row >= r.minR && entity.row <= r.maxR) return i;
    }
    return -1;
  }

  function getParkInfo(entity) {
    const rects = ZoneSystem.getZoneRects?.('residential') || [];
    const zoneIndex = zoneIndexForEntity(entity);
    const rect = rects[zoneIndex];
    return {
      zoneIndex,
      count: rect ? countParkTypeInZone(rect, entity.type) : 1,
      max: PARK_MAX_PER_ZONE[entity.type] ?? 1,
    };
  }

  // Highest generation seen this session. This system isn't saved, so a
  // gated type that already exists on the map also counts as unlocked —
  // otherwise loading a save at night would lock it again until the grid
  // climbs back past the threshold.
  let genPeak = 0;
  function genReached(type, minGen) {
    return genPeak >= minGen || EntityRegistry.getByType(type).size > 0;
  }

  const techSeen = new Set();
  function techReached(type, genType) {
    if (!techSeen.has(genType) && EntityRegistry.getByType(genType).size > 0) techSeen.add(genType);
    return techSeen.has(genType) || EntityRegistry.getByType(type).size > 0;
  }

  function tick(dt) {
    genPeak = Math.max(genPeak, PowerNetwork.stats.totalGenerated || 0);
    elapsed += dt;
    if (elapsed - lastFired < MIN_GAP) return;
    nextCheck -= dt;
    if (nextCheck <= 0) {
      trySpawn();
      lastFired = elapsed;
      nextCheck = 300 + Math.random() * 300;
    }
  }

  return { tick, getZoneBonus, getParkInfo };
})();


const CUSTOMER_TYPES = new Set([T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL, T.CABIN]);

