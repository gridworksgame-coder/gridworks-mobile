/* ═══════════════════════════════════════════════════════════════════
   GOVERNMENT SYSTEM
   Contracts, civic buildings, loans, and approval rating.
   ═══════════════════════════════════════════════════════════════════ */

const GovernmentSystem = (() => {
  // Hoisted to module scope (was previously redeclared inside tick()) so the
  // CONTRACT_TYPES condition closures below can also use it.
  const CUSTOMER_TYPES = [T.HOUSE, T.CABIN, T.COMMERCIAL, T.INDUSTRIAL];

  let govEntity     = null;
  let approvalRating = 75;  // 0-100
  let pendingContracts = [];
  let completedContracts = 0;
  let lastContractTime = -999;
  let govSentFirstContract = false;
  const CONTRACT_INTERVAL = 360; // 6 real minutes between contracts (game seconds)
  const CONTRACT_CATCHUP  = 20;  // ...but only this long after one that was already met when issued
  let _gameTime = 0;             // last tick's clock, for the panel's countdown

  const MAX_ACTIVE_CONTRACTS = 3; // the mayor keeps up to this many open at once
  const CLEAN_AIR_HOLD = 30;      // game seconds emissions must stay within the allowance (Clean Air Act)

  // A contract is a list of goals; it completes when every goal is met. The
  // panel draws the same goals as progress rows, so what the player reads is
  // exactly what is checked.
  const _goal = (label, have, need) => ({ label, have, need, kind: 'count' });
  const _pct  = (label, have, need) => ({ label, have: Math.round(have), need, kind: 'pct' });
  const _flag = (label, ok)         => ({ label, have: ok ? 1 : 0, need: 1, kind: 'bool' });
  const _unlocked = (label, type)   => _flag(label, Progression.isUnlocked(type));
  const _count = (...types) => types.reduce((n, t) => n + (t !== undefined ? EntityRegistry.getByType(t).size : 0), 0);
  // Customers that were requested, connected and have power right now.
  const _connected = (type) => { let n = 0; for (const e of EntityRegistry.getByType(type)) if (e.fromRequest && e.powered) n++; return n; };
  const _customers = () => { let n = 0; for (const t of CUSTOMER_TYPES) for (const e of EntityRegistry.getByType(t)) if (e.fromRequest) n++; return n; };
  // City-wide average of a customer stat; reads as perfect with no customers.
  const _avg = (field, dflt) => {
    let sum = 0, n = 0;
    for (const t of CUSTOMER_TYPES) for (const e of EntityRegistry.getByType(t)) if (e.fromRequest) { sum += e[field] ?? dflt; n++; }
    return n ? sum / n : 100;
  };
  // Civic buildings arrive at least this many in-game days apart. While the
  // council is still settling the last one, a goal row says how long is left;
  // once the gap has passed (or before the first is built) there is no row.
  const CIVIC_GAP_DAYS = 3;
  let lastCivicBuiltAt = -Infinity;
  const _civicGap = () => {
    const dayLen = DayNight.secondsPerGameHour() * 24;
    const left = lastCivicBuiltAt + CIVIC_GAP_DAYS * dayLen - _gameTime;
    if (left <= 0) return [];
    const days = left / dayLen;
    const wait = days >= 1 ? `${Math.ceil(days)} day${Math.ceil(days) === 1 ? '' : 's'}` : `${Math.max(1, Math.ceil(days * 24))} h`;
    return [_flag(`Council still settling the last civic building (${wait} left)`, false)];
  };
  const _parks = () => (typeof PARK_TYPES !== 'undefined' ? _count(...PARK_TYPES) : 0);

  // `phase` orders the queue (lowest first, then list order). `reqUnlock`
  // holds a contract back until that building is researched; `when` holds it
  // back until it is within reach, so a far-off goal doesn't sit in a slot.
  // Entries with `govBuilding` are the civic milestones: never issued as
  // contracts, they build themselves the moment their goals are met.
  const CONTRACT_TYPES = [
    // ── Phase 1: getting started ──
    { id: 'house',      label: 'First Connection',    desc: 'Connect Mae\'s Cabin to your grid.',
      reward: 3000, phase: 1,
      goals: () => [_flag('Mae\'s Cabin connected', HouseRequestSystem.getCabinCleared())] },
    { id: 'lamp',       label: 'Street Lighting',     desc: 'Put up 3 street lamps anywhere in the city.',
      reward: 2500, phase: 1, reqUnlock: T.LAMP,
      goals: () => [_goal('Street lamps', _count(T.LAMP), 3)] },
    { id: 'residents5', label: 'Population Growth',   desc: 'Have 5 homes connected and powered.',
      reward: 4000, phase: 1,
      goals: () => [_goal('Homes with power', _connected(T.HOUSE), 5)] },

    // ── Phase 2: a working town ──
    { id: 'commercial', label: 'Commercial District', desc: 'Have 3 businesses connected and powered.',
      reward: 5000, phase: 2,
      goals: () => [_goal('Businesses with power', _connected(T.COMMERCIAL), 3)] },
    { id: 'camera',     label: 'Public Safety Initiative', desc: 'Install 3 security cameras.',
      reward: 2000, phase: 2, reqUnlock: T.CAMERA,
      goals: () => [_goal('Security cameras', _count(T.CAMERA), 3)] },
    { id: 'battery',    label: 'Grid Stability Program', desc: 'Install 2 battery blocks for grid storage.',
      reward: 3000, phase: 2, reqUnlock: T.BATTERY,
      goals: () => [_goal('Battery blocks', _count(T.BATTERY), 2)] },
    { id: 'substation', label: 'Grid Expansion',      desc: 'Install 2 substations to support larger zones.',
      reward: 5000, phase: 2, reqUnlock: T.SUBSTATION,
      goals: () => [_goal('Substations', _count(T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5), 2)] },
    { id: 'residents10', label: 'Urban Expansion',    desc: 'Have 10 homes connected and powered.',
      reward: 6000, phase: 2,
      goals: () => [_goal('Homes with power', _connected(T.HOUSE), 10)] },
    { id: 'celltower_gov', label: 'Cell Tower Request', desc: 'Install a Cell Tower to improve connectivity.',
      reward: 5000, phase: 2, reqUnlock: T.CELLTOWER,
      goals: () => [_goal('Cell towers', _count(T.CELLTOWER), 1)] },
    { id: 'wind',       label: 'Renewable Energy Plan', desc: 'Install 8 wind turbines.',
      reward: 5000, phase: 2, reqUnlock: T.WIND,
      goals: () => [_goal('Wind turbines', _count(T.WIND, T.WIND2, T.WIND3), 8)] },
    { id: 'solar',      label: 'Solar Rooftops',      desc: 'Install 6 solar panels.',
      reward: 4000, phase: 2, reqUnlock: T.SOLAR,
      goals: () => [_goal('Solar panels', _count(T.SOLAR, T.SOLAR2, T.SOLAR3), 6)] },
    { id: 'lightningrod', label: 'Storm Readiness',   desc: 'Protect the grid with 2 lightning rods.',
      reward: 3500, phase: 2, reqUnlock: T.LIGHTNINGROD,
      goals: () => [_goal('Lightning rods', _count(T.LIGHTNINGROD, T.LIGHTNINGROD2, T.LIGHTNINGROD3), 2)] },
    { id: 'evcharger',  label: 'EV Charging Network', desc: 'Install 2 EV chargers.',
      reward: 4500, phase: 2, reqUnlock: T.EVCHARGER,
      goals: () => [_goal('EV chargers', _count(T.EVCHARGER), 2)] },
    { id: 'parks',      label: 'Green Space',         desc: 'Grow your neighbourhoods until the city has 3 parks or community spaces.',
      reward: 6000, phase: 2, when: () => _parks() >= 1,
      goals: () => [_goal('Parks and community spaces', _parks(), 3)] },

    // ── Phase 3: heavy power ──
    { id: 'industrial', label: 'Industrial Zone',     desc: 'Have 3 industrial facilities connected and powered.',
      reward: 7000, phase: 3,
      goals: () => [_goal('Industry with power', _connected(T.INDUSTRIAL), 3)] },
    { id: 'coal',       label: 'Heavy Industry Initiative', desc: 'Build a coal generator.',
      reward: 8000, phase: 3, reqUnlock: T.COALGENERATOR,
      when: () => _count(T.COALGENERATOR) >= 1 || !Progression.isUnlocked(T.NUCLEARREACTOR),   // not asked of a city already past coal
      goals: () => [_goal('Coal generators', _count(T.COALGENERATOR), 1)] },
    { id: 'hydro',      label: 'Clean Energy Mandate', desc: 'Commission a hydroelectric generator.',
      reward: 18000, phase: 3, reqUnlock: T.HYDROGENERATOR,
      goals: () => [_goal('Hydro generators', _count(T.HYDROGENERATOR), 1)] },
    { id: 'fuelgen',    label: 'Energy Independence', desc: 'Build a fuel generator.',
      reward: 14000, phase: 3, reqUnlock: T.FUELGEN,
      goals: () => [_goal('Fuel generators', _count(T.FUELGEN), 1)] },
    { id: 'reliable',   label: 'Dependable Service',  desc: 'Serve at least 20 customers at 95% average reliability.',
      reward: 12000, phase: 3, when: () => _customers() >= 12,
      goals: () => [_goal('Customers', _customers(), 20), _pct('Average reliability', _avg('reliability', 100), 95)] },
    { id: 'satisfied',  label: 'Happy Customers',     desc: 'Serve at least 25 customers at 85% average satisfaction.',
      reward: 12000, phase: 3, when: () => _customers() >= 15,
      goals: () => [_goal('Customers', _customers(), 25), _pct('Average satisfaction', _avg('satisfaction', 80), 85)] },
    { id: 'pop500',     label: 'Growing City',        desc: 'Reach a population of 500.',
      reward: 15000, phase: 3, when: () => _getPopulation() >= 250,
      goals: () => [_goal('Population', _getPopulation(), 500)] },

    // ── Phase 4: a real city ──
    { id: 'nuclear',    label: 'Atomic Age',          desc: 'Build a nuclear reactor.',
      reward: 40000, phase: 4, reqUnlock: T.NUCLEARREACTOR,
      goals: () => [_goal('Nuclear reactors', _count(T.NUCLEARREACTOR), 1)] },
    { id: 'geothermal', label: 'Heat From Below',     desc: 'Build a geothermal turbine.',
      reward: 30000, phase: 4, reqUnlock: T.GEOTURBINE,
      goals: () => [_goal('Geothermal turbines', _count(T.GEOTURBINE), 1)] },
    // Emissions are held under the allowance for CLEAN_AIR_HOLD seconds, read
    // from PollutionSystem's smoothed figure: one clean tick from plants that
    // are still starting up must not count.
    { id: 'cleanair',   label: 'Clean Air Act',       desc: `Keep city emissions within the free allowance for ${CLEAN_AIR_HOLD} seconds while serving a population of 400.`,
      reward: 25000, phase: 4, reqUnlock: T.COALGENERATOR, when: () => _getPopulation() >= 250,
      goals: () => [_goal('Population', _getPopulation(), 400),
                    _goal('Seconds within the allowance', typeof PollutionSystem === 'undefined' ? CLEAN_AIR_HOLD
                          : Math.min(CLEAN_AIR_HOLD, Math.floor(PollutionSystem.cleanFor())), CLEAN_AIR_HOLD)] },
    { id: 'carboncapture', label: 'Carbon Drawdown',  desc: 'Build a carbon capture plant.',
      reward: 30000, phase: 4, reqUnlock: T.CARBONCAPTURE,
      goals: () => [_goal('Carbon capture plants', _count(T.CARBONCAPTURE), 1)] },
    { id: 'confidence', label: 'Public Confidence',   desc: 'Raise mayor approval to 85%.',
      reward: 30000, phase: 4, when: () => _getPopulation() >= 300,
      goals: () => [_pct('Mayor approval', approvalRating, 85)] },
    { id: 'pop1500',    label: 'Metropolis',          desc: 'Reach a population of 1,500.',
      reward: 40000, phase: 4, when: () => _getPopulation() >= 800,
      goals: () => [_goal('Population', _getPopulation(), 1500)] },

    // ── Phase 5 and beyond ──
    { id: 'droneport',  label: 'Drone Logistics',     desc: 'Build a drone port.',
      reward: 35000, phase: 5, reqUnlock: T.DRONEPORT,
      goals: () => [_goal('Drone ports', _count(T.DRONEPORT), 1)] },
    { id: 'advreactor', label: 'Next-Generation Fission', desc: 'Build an advanced reactor.',
      reward: 75000, phase: 5, reqUnlock: T.ADVREACTOR,
      goals: () => [_goal('Advanced reactors', _count(T.ADVREACTOR), 1)] },
    { id: 'pop3000',    label: 'Regional Capital',    desc: 'Reach a population of 3,000.',
      reward: 80000, phase: 5, when: () => _getPopulation() >= 1800,
      goals: () => [_goal('Population', _getPopulation(), 3000)] },
    { id: 'fusionpower', label: 'Star Power',         desc: 'Build a fusion reactor.',
      reward: 250000, phase: 6, reqUnlock: T.HULKINGFUSIONREACTOR,
      goals: () => [_goal('Fusion reactors', _count(T.HULKINGFUSIONREACTOR), 1)] },

    // ── Civic milestones ──
    // Each also waits CIVIC_GAP_DAYS after the previous civic building, so a
    // city that races past several population marks still gets them one at a
    // time instead of three in an afternoon.
    { id: 'townhall',    label: 'Town Hall',          desc: 'The settlement needs a Town Hall.',
      reward: 15000, govBuilding: T.TOWNHALL, phase: 2,
      goals: () => [_goal('Population', _getPopulation(), 100), _pct('Average reliability', _avg('reliability', 100), 75),
                    _goal('Homes accepted', HouseRequestSystem.getHousesAccepted(), 5),
                    _goal('Businesses accepted', HouseRequestSystem.getCommercialsAccepted(), 5),
                    _goal('Industry accepted', HouseRequestSystem.getIndustrialsAccepted(), 5), ..._civicGap()] },
    { id: 'civiccenter', label: 'Civic Center',       desc: 'A Civic Center for a growing town.',
      reward: 20000, govBuilding: T.CIVICCENTER, phase: 2,
      goals: () => [_goal('Population', _getPopulation(), 350), _pct('Average satisfaction', _avg('satisfaction', 80), 75), ..._civicGap()] },
    { id: 'courthouse',  label: 'Courthouse',         desc: 'A Courthouse for the county seat.',
      reward: 25000, govBuilding: T.COURTHOUSE, phase: 3,
      goals: () => [_goal('Population', _getPopulation(), 600), _pct('Average reliability', _avg('reliability', 100), 85),
                    _unlocked('Coal power researched', T.COALGENERATOR), ..._civicGap()] },
    { id: 'ems',         label: 'Emergency Services', desc: 'Fire, police and ambulance under one roof.',
      reward: 30000, govBuilding: T.EMS, phase: 3,
      goals: () => [_goal('Population', _getPopulation(), 850), _unlocked('Oil power researched', T.FUELGEN), ..._civicGap()] },
    { id: 'hospital',    label: 'Hospital',           desc: 'A full Hospital. It cannot afford to lose power.',
      reward: 40000, govBuilding: T.HOSPITAL, phase: 3,
      goals: () => [_goal('Population', _getPopulation(), 1100), _pct('Average reliability', _avg('reliability', 100), 90),
                    _unlocked('Hydro power researched', T.HYDROGENERATOR), ..._civicGap()] },
    { id: 'university',  label: 'University',         desc: 'A University for the city.',
      reward: 50000, govBuilding: T.UNIVERSITY, phase: 3,
      goals: () => [_goal('Population', _getPopulation(), 1400), _unlocked('Steam turbine researched', T.STEAMTURBINE), ..._civicGap()] },
    { id: 'transporthub', label: 'Transportation Hub', desc: 'A Transportation Hub linking the city to the region.',
      reward: 65000, govBuilding: T.TRANSPORTHUB, phase: 3,
      goals: () => [_goal('Population', _getPopulation(), 1800), _unlocked('Steam turbine researched', T.STEAMTURBINE), ..._civicGap()] },
  ];
  for (const ct of CONTRACT_TYPES) ct.condition = () => ct.goals().every(g => g.have >= g.need);
  // The mayor's cash rewards are halved (to the nearest $250); the rewards
  // listed above are the pre-cut figures. Civic milestones keep theirs.
  const MAYOR_REWARD_MULT = 0.5;
  for (const ct of CONTRACT_TYPES) if (!ct.govBuilding) ct.reward = Math.max(250, Math.round(ct.reward * MAYOR_REWARD_MULT / 250) * 250);

  // Both of these were full ROWS×COLS grid scans. EntityRegistry already
  // tracks every placed entity by type (one entry per entity, regardless
  // of footprint size), so these become direct O(1)/O(count) lookups —
  // and _countType() no longer needs to loop at all.
  function _hasGovBuilding(type) {
    return EntityRegistry.getByType(type).size > 0;
  }

  function _countType(type) {
    return EntityRegistry.getByType(type).size;
  }

  // Mirrors the HUD's population counter (sum of each property's _population
  // field across houses, commercial, and industrial, must be fromRequest).
  // Civic building thresholds use this instead of raw property counts so
  // they track the actual population number shown in the top bar rather
  // than number of connected properties.
  function _getPopulation() {
    let total = 0;
    for (const t of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) {
      for (const e of EntityRegistry.getByType(t)) {
        if (e.fromRequest && (e._population || 0) > 0) total += e._population;
      }
    }
    return total;
  }

  function _govPowered() {
    return govEntity && govEntity.powered;
  }

  function spawnGovBuilding() {
    // Place near map centre, avoid water
    const W = EntityDefs[T.GOVBUILDING].width, H = EntityDefs[T.GOVBUILDING].height;
    const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
    // Spiral search from centre
    for (let d = 0; d < 30; d++) {
      for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue;
        const col = cx + dx - Math.floor(W/2);
        const row = cy + dy - Math.floor(H/2);
        if (!GridManager.inBounds(col, row) || !GridManager.inBounds(col+W-1, row+H-1)) continue;
        let clear = true;
        for (let dr = 0; dr < H && clear; dr++)
          for (let dc = 0; dc < W && clear; dc++)
            if (GridManager.getEntity(col+dc, row+dr)) clear = false;
        if (!clear) continue;
        govEntity = new Entity(T.GOVBUILDING, col, row);
        govEntity.width  = W; govEntity.height = H;
        govEntity._isGov = true;
        GridManager.setEntityFootprint(govEntity);
        ZoneSystem.setGovZone(govEntity);
        return govEntity;
      }
    }
    return null;
  }

  function getEligibleContracts() {
    const heavy = Progression.isUnlocked(T.COALGENERATOR) || Progression.isUnlocked(T.HYDROGENERATOR);
    return CONTRACT_TYPES.filter(ct => {
      if (ct.govBuilding) return false;                              // civic milestones build themselves
      if (pendingContracts.find(p => p.id === ct.id)) return false; // already active or completed
      if (ct.reqUnlock && !Progression.isUnlocked(ct.reqUnlock)) return false;
      if (ct.phase >= 3 && !heavy && ct.id !== 'coal') return false;
      if (ct.when && !ct.when()) return false;
      return true;
    });
  }

  // `spaced`: only spots where the government zone, grown to take the
  // building in, keeps the zone spacing rule (ZoneSystem.crowdsZones).
  function _spiralPlace(type, def, W, H, originCol, originRow, maxRadius, spaced = false) {
    const z = spaced ? ZoneSystem.getZoneRects('government')[0] : null;
    for (let d = 2; d < maxRadius; d++) {
      for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
        if (Math.abs(dx) !== d && Math.abs(dy) !== d) continue;
        const col = originCol + dx - Math.floor(W/2);
        const row = originRow + dy - Math.floor(H/2);
        if (!GridManager.inBounds(col, row) || !GridManager.inBounds(col+W-1, row+H-1)) continue;
        if (z && ZoneSystem.crowdsZones(z, { minC: Math.min(z.minC, col - 2), maxC: Math.max(z.maxC, col + W + 1),
                                             minR: Math.min(z.minR, row - 2), maxR: Math.max(z.maxR, row + H + 1) })) continue;
        if (!GridManager.canPlaceFootprint(col, row, W, H)) continue;
        const entity = new Entity(type, col, row);
        entity.width  = W; entity.height = H;
        entity._isGov = true;
        entity.powered = false;
        entity.reliability = 100; entity.satisfaction = 100;
        GridManager.setEntityFootprint(entity);
        ZoneSystem.expandGovZone(col, row, W, H);
        console.log(`[GOV] placed ${type} at col=${col} row=${row} (origin=${originCol},${originRow})`);
        return entity;
      }
    }
    return null;
  }

  // Civic buildings pay out a one-time reward the moment they're built —
  // the notification should say so, not just announce the building.
  function _notifyGovBuildingBuilt(entity, reward) {
    const def = EntityDefs[entity.type];
    NotificationStack.push({
      icon: '🏛',
      title: entity._constructing ? `${def.label} under construction` : `${def.label} built`,
      message: entity._constructing
        ? `The community rewarded your contribution with ${formatMoney(reward)}. A crew is building it now; once it's finished it needs power. Click to jump there`
        : `The community rewarded your contribution with ${formatMoney(reward)}; click to jump there`,
      color: '#c0a030',
      border: '#504010',
      onClick: () => {
        const wx = (entity.col + (entity.width  || 1) * 0.5) * TILE;
        const wy = (entity.row + (entity.height || 1) * 0.5) * TILE;
        Camera.recentreOn(wx, wy);
        SFX.click();
      },
    });
  }

  // ── National Government Zone ────────────────────────────────────
  // A second government zone out in the world, founded by the National
  // Government Center at the start of MK4 (the MK4 Research Station is
  // built). The Fusion Research Facility follows with the MK5 Research
  // Station, the
  // International Airport joins once the first Advanced Reactor has run, the
  // Military Base once the grid is generating 15 MW, and the Starhaven
  // Launch Complex after the base, at 20 MW.
  //
  // The founding site is chosen for the WHOLE complex, not just the first
  // building: the search reserves a roomy block far from City Hall and clear
  // of every existing zone, and only takes it if all four buildings fit on
  // clear dry land somewhere inside it. Where they go inside is random — the
  // zone reads as a sprawling compound, not a row of lots. The zone is created
  // at the full block size straight away (with a buffer that keeps customer
  // neighbourhoods from spawning up against it — see ZoneSystem.isInGovZone).
  // The plan is saved, so later arrivals drop into the spots kept for them.
  const NATIONAL_MIN_DIST = 90;     // tiles from City Hall — out past the city
  const NATIONAL_MAX_DIST = 300;
  const NATIONAL_ZONE_GAP = 25;     // clearance from any existing zone
  const NATIONAL_MARGIN   = 4;      // clear land around the reserved block (the zone's pad)
  const SIDE_GAP          = 3;      // tiles between neighbouring national buildings
  // The reserved block. The four buildings cover about a third of it, so
  // there's room for them to land anywhere rather than in fixed lots.
  const NATIONAL_BLOCK_W  = 120;   // the Fusion Research Facility alone is 56×32
  const NATIONAL_BLOCK_H  = 80;

  let nationalPlan = null;          // { c0, r0, w, h, slots: { type: [col,row] } } — saved

  const NATIONAL = {
    [T.NATIONALGOV]: {
      reward: 75000, icon: '🏛️', color: '#e0c060', border: '#605020',
      due: () => EntityRegistry.getByType(T.MK4RESEARCH).size > 0,
      title: 'New National Government Zone',
      built: 'A National Government Center has founded a new government zone out in the world',
      card: 'A National Government Center has been built in a new government zone; run power out to it. Click to jump there',
      online: '🏛 The National Government Center is connected and in session',
      noRoom: '🏛 A National Government Center is ready to found a new government zone, but there is no clear land far enough from your zones yet',
    },
    [T.FUSIONLAB]: {
      reward: 120000, icon: '⚛️', color: '#ff90e0', border: '#602050',
      // Arrives with the MK5 Research Station and starts researching fusion
      // (FusionResearch) — its breakthrough is the first fusion unlock.
      due: () => _hasGovBuilding(T.NATIONALGOV) && EntityRegistry.getByType(T.MK5RESEARCH).size > 0,
      title: 'Fusion Research Facility built',
      built: 'A Fusion Research Facility has been built in the National Government Zone',
      card: 'A Fusion Research Facility has opened in the National Government Zone to research fusion; power it to start the programme. Its plasma shots spike to 1 MW. Click to jump there',
      online: '⚛ The Fusion Research Facility is connected; fusion research under way',
      noRoom: '⚛ A Fusion Research Facility is ready to open, but there is no clear land beside the National Government Zone; clear some space around it',
    },
    [T.AIRPORT]: {
      reward: 100000, icon: '✈️', color: '#80c8ff', border: '#204860',
      due: () => {
        if (!_hasGovBuilding(T.NATIONALGOV)) return false;
        if (Progression.advReactorGenerated?.()) return true;
        for (const e of EntityRegistry.getByType(T.ADVREACTOR)) if (e._generating) return true;
        return false;
      },
      title: 'Airport built in the National Zone',
      built: 'An International Airport has been built in the National Government Zone',
      card: 'An International Airport has been built in the National Government Zone; run power to it to open it. Click to jump there',
      online: '✈ The International Airport is connected and open for flights',
      noRoom: '✈ An airport is ready to open, but there is no clear land beside the National Government Zone; clear some space around it',
    },
    [T.MILITARYBASE]: {
      reward: 120000, icon: '🎖️', color: '#a8c870', border: '#3a5020',
      // Arrives once the grid is generating 15 MW. The Government Center check
      // is just so the zone exists to drop into. (It used to wait on the MK5
      // station as well, at 12 MW.)
      due: () => _hasGovBuilding(T.NATIONALGOV) &&
        PowerNetwork.stats.totalGenerated >= 15000,
      title: 'Military Base established',
      built: 'A Military Base has been established in the National Government Zone',
      card: 'A Military Base has moved into the National Government Zone; run power to it. Click to jump there',
      online: '🎖 The Military Base is connected and operational',
      noRoom: '🎖 A military base is ready to move in, but there is no clear land beside the National Government Zone; clear some space around it',
    },
    [T.LAUNCHCOMPLEX]: {
      reward: 120000, icon: '🚀', color: '#8fc8ee', border: '#304050',
      // After the Military Base, with the grid generating 20 MW: a launch
      // count draws 12.6 MW, and a smaller grid cannot ride through one.
      // Starhaven used to be a rare industrial customer. A city that already
      // has that one keeps it, where it stands and still flying, and is not
      // given a second.
      due: () => {
        if (!_hasGovBuilding(T.MILITARYBASE) || PowerNetwork.stats.totalGenerated < 20000) return false;
        for (const e of EntityRegistry.getByType(T.INDUSTRIAL)) if (e.commercialSubtype === 'spaceport' && !e._clientOwned) return false;
        return true;
      },
      title: 'Starhaven Launch Complex built',
      built: 'The Starhaven Launch Complex has been built in the National Government Zone',
      card: 'The Starhaven Launch Complex has been built in the National Government Zone; run power to it. It flies a mission every few weeks, and each launch needs 8 to 18 MW available at liftoff. Click to jump there',
      online: '🚀 The Starhaven Launch Complex is connected; the first launch window will be announced',
      noRoom: '🚀 The Starhaven Launch Complex is ready to be built, but there is no clear land in or beside the National Government Zone; clear some space around it',
    },
    // Operation Hyperion's national interconnector (NationalProject) — breaks
    // ground at the start of Stage I (Ignition), on the spot reserved when the file opened.
    [T.NATIONALGRID]: {
      reward: 0, icon: '◈', color: '#7ad8ff', border: '#1a4a66',
      due: () => typeof NationalProject !== 'undefined' && NationalProject.stationDue(),
      title: 'Hyperion Station breaks ground',
      built: 'Construction has begun on Hyperion Station in the National Government Zone',
      card: 'Hyperion Station is under construction in the National Government Zone; run power out to it for the site. Click to jump there',
      online: '◈ Hyperion Station is connected',
      noRoom: '◈ Hyperion Station is ready to break ground, but there is no clear land in or beside the National Government Zone; clear some space',
    },
  };
  // The company's own headquarters (CompanyHQ): raised under wraps the moment
  // an Advanced Fusion Reactor is running, and unveiled by CompanyHQ's scene,
  // which is also what announces it. Hence `silent`: no card or chime here.
  NATIONAL[T.COMPANYHQ] = {
    reward: 0, icon: '🏢', color: '#ffce6e', border: '#6a4a10', silent: true,
    due: () => _hasGovBuilding(T.NATIONALGOV) && typeof CompanyHQ !== 'undefined' && CompanyHQ.due(),
    online: '🏢 Headquarters connected: the lights are on and the money is coming in',
    noRoom: '🎁 The government has something planned for you beside the National Government Zone, but there is no clear land there; clear some space around it',
  };
  const NATIONAL_TYPES = [T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ];
  // The block is founded around these five; Hyperion Station's spot is
  // reserved later, when Operation Hyperion opens (reserveNationalSlot).
  const FOUNDING_TYPES = [T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX];
  const _nationalNextTry = {}, _nationalFailToasted = {};

  function _clearDryLand(c0, r0, w, h) {
    if (!GridManager.inBounds(c0, r0) || !GridManager.inBounds(c0 + w - 1, r0 + h - 1)) return false;
    if (!GridManager.canPlaceFootprint(c0, r0, w, h)) return false;
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) if (WaterSystem.isWater(c, r)) return false;
    return true;
  }

  function _clearOfZones(c0, r0, w, h, gap, keys) {
    for (const key of keys) {
      const rects = ZoneSystem.getZoneRects(key);
      for (let i = 0; i < rects.length; i++) {
        if (key === 'government' && i > 0) continue;    // the national zone itself
        const z = rects[i];
        const dc = Math.max(0, z.minC - (c0 + w - 1), c0 - z.maxC);
        const dr = Math.max(0, z.minR - (r0 + h - 1), r0 - z.maxR);
        if (Math.max(dc, dr) < gap) return false;
      }
    }
    return true;
  }

  // Random spots for `types` inside a block: each on clear dry land (with a
  // one-tile rim), kept SIDE_GAP apart from the others and from `taken`.
  // Returns { type: [col,row] } or null if they can't all fit.
  function _scatterInBlock(c0, r0, w, h, types, taken = []) {
    const overlaps = (a, b) =>
      a.col < b.col + b.w + SIDE_GAP && b.col < a.col + a.w + SIDE_GAP &&
      a.row < b.row + b.h + SIDE_GAP && b.row < a.row + a.h + SIDE_GAP;
    for (let attempt = 0; attempt < 20; attempt++) {
      const placed = taken.slice(), slots = {};
      let ok = true;
      for (const type of [...types].sort(() => Math.random() - 0.5)) {
        const W = EntityDefs[type].width, H = EntityDefs[type].height;
        if (W > w - 2 || H > h - 2) { ok = false; break; }
        let spot = null;
        for (let t = 0; t < 80 && !spot; t++) {
          const col = c0 + 1 + Math.floor(Math.random() * (w - W - 1));
          const row = r0 + 1 + Math.floor(Math.random() * (h - H - 1));
          const cand = { col, row, w: W, h: H };
          if (placed.some(p => overlaps(cand, p))) continue;
          if (!_clearDryLand(col - 1, row - 1, W + 2, H + 2)) continue;
          spot = cand;
        }
        if (!spot) { ok = false; break; }
        placed.push(spot);
        slots[type] = [spot.col, spot.row];
      }
      if (ok) return slots;
    }
    return null;
  }

  // Rings outward from City Hall on shuffled bearings; the first block that is
  // clear of every zone, free of the player's structures, and has room for the
  // whole complex scattered inside it wins.
  function _findNationalSite() {
    const gc = Math.floor(govEntity.col + govEntity.width / 2);
    const gr = Math.floor(govEntity.row + govEntity.height / 2);
    const phase = Math.random() * Math.PI * 2;
    const m = NATIONAL_MARGIN;
    const w = NATIONAL_BLOCK_W, h = NATIONAL_BLOCK_H;
    for (let d = NATIONAL_MIN_DIST; d <= NATIONAL_MAX_DIST; d += 8) {
      const n = Math.max(12, Math.round(d / 6));
      const order = Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5);
      for (const i of order) {
        const a = phase + i / n * Math.PI * 2;
        const c0 = Math.round(gc + Math.cos(a) * d - w / 2);
        const r0 = Math.round(gr + Math.sin(a) * d - h / 2);
        if (!GridManager.inBounds(c0 - m, r0 - m) || !GridManager.inBounds(c0 + w - 1 + m, r0 + h - 1 + m)) continue;
        if (!_clearOfZones(c0 - m, r0 - m, w + 2*m, h + 2*m, NATIONAL_ZONE_GAP, ['residential', 'commercial', 'industrial', 'government'])) continue;
        if (!GridManager.canPlaceFootprint(c0, r0, w, h)) continue;   // none of the player's structures inside
        const slots = _scatterInBlock(c0, r0, w, h, FOUNDING_TYPES);
        if (slots) return { c0, r0, w, h, slots };
      }
    }
    return null;
  }

  // A random clear spot anywhere inside the national zone — for an arrival
  // whose reserved spot was built over since the zone was founded.
  function _findInNationalZone(type) {
    if (!nationalPlan) return null;
    const taken = [];
    for (const t of NATIONAL_TYPES) for (const e of EntityRegistry.getByType(t))
      taken.push({ col: e.col, row: e.row, w: e.width, h: e.height });
    const slots = _scatterInBlock(nationalPlan.c0, nationalPlan.r0, nationalPlan.w, nationalPlan.h, [type], taken);
    return slots ? { col: slots[type][0], row: slots[type][1] } : null;
  }

  // Fallback when a reserved slot has been built over (or an older save has
  // no plan): beside any existing national building — east, west, south,
  // north, sliding outward from the middle of each side.
  // When the national block is full: just outside it, on the side facing away
  // from City Hall first (out into open country rather than toward town),
  // then the two flanks, and the city-facing side last. Each side is tried
  // from its middle outward.
  function _findBesideZoneAwayFromCity(W, H, avoid = []) {
    if (!nationalPlan) return null;
    const p = nationalPlan, g = SIDE_GAP;
    const zc = p.c0 + p.w / 2, zr = p.r0 + p.h / 2;
    const cc = govEntity ? govEntity.col + govEntity.width / 2 : zc;
    const cr = govEntity ? govEntity.row + govEntity.height / 2 : zr;
    const sides = [
      { name: 'east',  fixed: 'col', v: p.c0 + p.w + g,  from: zr - H / 2, span: p.h, away: zc - cc },
      { name: 'west',  fixed: 'col', v: p.c0 - g - W,    from: zr - H / 2, span: p.h, away: cc - zc },
      { name: 'south', fixed: 'row', v: p.r0 + p.h + g,  from: zc - W / 2, span: p.w, away: zr - cr },
      { name: 'north', fixed: 'row', v: p.r0 - g - H,    from: zc - W / 2, span: p.w, away: cr - zr },
    ].sort((a, b) => b.away - a.away);
    const clash = (col, row) => avoid.some(q =>
      col < q.col + q.w + g && q.col < col + W + g && row < q.row + q.h + g && q.row < row + H + g);
    for (const s of sides) for (let k = 0; k <= s.span; k++) {
      const slide = Math.round(s.from + (k % 2 ? 1 : -1) * Math.ceil(k / 2));
      const col = s.fixed === 'col' ? s.v : slide, row = s.fixed === 'row' ? s.v : slide;
      if (!clash(col, row) && _clearDryLand(col - 1, row - 1, W + 2, H + 2) &&
          _clearOfZones(col - 1, row - 1, W + 2, H + 2, 8, ['residential', 'commercial', 'industrial'])) return { col, row };
    }
    return null;
  }

  function _findBesideNational(W, H, avoid = []) {
    // `avoid`: reserved spots (and buildings) the new footprint must keep clear of.
    const clash = (col, row) => avoid.some(p =>
      col < p.col + p.w + SIDE_GAP && p.col < col + W + SIDE_GAP && row < p.row + p.h + SIDE_GAP && p.row < row + H + SIDE_GAP);
    const anchors = [];
    for (const t of [T.AIRPORT, T.NATIONALGOV, T.FUSIONLAB, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ]) for (const e of EntityRegistry.getByType(t)) anchors.push(e);
    for (const a of anchors) {
      const sides = [
        { fixed: 'col', v: a.col + a.width + SIDE_GAP, from: a.row + a.height / 2 - H / 2, span: a.height },
        { fixed: 'col', v: a.col - SIDE_GAP - W,       from: a.row + a.height / 2 - H / 2, span: a.height },
        { fixed: 'row', v: a.row + a.height + SIDE_GAP, from: a.col + a.width / 2 - W / 2,  span: a.width },
        { fixed: 'row', v: a.row - SIDE_GAP - H,        from: a.col + a.width / 2 - W / 2,  span: a.width },
      ];
      for (const s of sides) for (let k = 0; k <= s.span; k++) {
        const slide = Math.round(s.from + (k % 2 ? 1 : -1) * Math.ceil(k / 2));
        const col = s.fixed === 'col' ? s.v : slide, row = s.fixed === 'row' ? s.v : slide;
        if (!clash(col, row) && _clearDryLand(col - 1, row - 1, W + 2, H + 2) &&
            _clearOfZones(col - 1, row - 1, W + 2, H + 2, 8, ['residential', 'commercial', 'industrial'])) return { col, row };
      }
    }
    return null;
  }

  function _jumpTo(entity) {
    Camera.recentreOn((entity.col + entity.width / 2) * TILE, (entity.row + entity.height / 2) * TILE);
  }
  // "Courthouse", or "Hospital #2" when there's more than one.
  function _govName(e) {
    return (EntityDefs[e.type]?.label || e.type) + (e._num !== undefined ? ` #${e._num}` : '');
  }

  function spawnNational(type) {
    const cfg = NATIONAL[type], def = EntityDefs[type];
    const W = def.width, H = def.height;
    let site = null;
    // A zone founded before this building existed has no spot kept for it
    // (Starhaven, in a save from before it was a national building): claim
    // one now, clear of the spots still held for buildings yet to arrive.
    // (So does the company's headquarters, which no zone was founded with.)
    const slot = nationalPlan?.slots?.[type] || (nationalPlan && (type === T.LAUNCHCOMPLEX || type === T.COMPANYHQ) ? _reserveNationalSlot(type) : null);
    // The plot is closed to the player, not to the station built on it.
    GridManager.ignoreReserved = type === T.NATIONALGRID;
    try {
    if (slot && _clearDryLand(slot[0], slot[1], W, H)) site = { col: slot[0], row: slot[1] };
    if (!site) site = _findInNationalZone(type);
    if (!site && NATIONAL_TYPES.some(t => _hasGovBuilding(t))) site = _findBesideNational(W, H);
    if (!site && !nationalPlan && !NATIONAL_TYPES.some(t => _hasGovBuilding(t))) {
      const plan = _findNationalSite();
      if (plan) { nationalPlan = plan; site = { col: plan.slots[type][0], row: plan.slots[type][1] }; }
    }
    } finally { GridManager.ignoreReserved = false; }
    if (!site) {
      if (!_nationalFailToasted[type]) { showToast(cfg.noRoom, '#ff9040', '#180c00', '#603010'); _nationalFailToasted[type] = true; }
      return null;
    }
    const e = new Entity(type, site.col, site.row);
    e.width = W; e.height = H;
    e._isGov = true;
    e.powered = false;
    e.reliability = 100; e.satisfaction = 100;
    GridManager.setEntityFootprint(e);
    // The zone is drawn round the national buildings standing, so it starts
    // at the founding building and grows with each arrival; the plan's other
    // spots are held clear meanwhile (ZoneSystem's _heldNational).
    ZoneSystem.joinGovZone(e, ZoneSystem.NATIONAL_ZONE_LABEL);
    approvalRating = Math.min(100, approvalRating + 8);
    Economy.spend(-cfg.reward);
    if (cfg.silent) return e;
    try { SFX.researchReady?.(); } catch (_e) {}
    // Stays up until the building is actually on the grid (see tick).
    NotificationStack.push({
      icon: cfg.icon, title: cfg.title, message: cfg.card,
      color: cfg.color, border: cfg.border, tag: `${type}-connect`, glow: true,
      onClick: () => { _jumpTo(e); SFX.click(); },
    });
    return e;
  }

  function getNationalPlan() { return nationalPlan; }

  // Claims a spot in the national block for a building that wasn't part of
  // the founding scatter (Hyperion Station), clear of every building there
  // and every spot already reserved. Falls back to beside the zone. Saved
  // with the plan, so the spot shown on the map is where it later lands.
  // A reserved spot is re-checked every time it's asked for, against the
  // national buildings and other reservations at their CURRENT sizes: a
  // building resized after the spot was picked (the Fusion Research Facility
  // and Hyperion Station both have been) could leave a saved spot sitting on
  // top of one, and the map kept drawing the fence there even though the
  // station would have broken ground somewhere else. An overlapping spot is
  // dropped and re-picked, and the new one is saved with the plan.
  function _nationalTaken(except) {
    const taken = [];
    for (const t of NATIONAL_TYPES) for (const e of EntityRegistry.getByType(t)) taken.push({ col: e.col, row: e.row, w: e.width, h: e.height });
    for (const [t, s] of Object.entries(nationalPlan.slots || {})) {
      if (t === except || NATIONAL_TYPES.some(nt => nt === t && EntityRegistry.getByType(nt).size > 0)) continue;   // built ones are counted above
      const d = EntityDefs[t]; if (d) taken.push({ col: s[0], row: s[1], w: d.width, h: d.height });
    }
    return taken;
  }
  // Operation Hyperion's plot is held clear like every other reserved spot
  // (ZoneSystem's _heldNational) and fenced on the map; the zone takes it in
  // when the station breaks ground, as it does every national arrival.
  function reserveNationalSlot(type) {
    return _reserveNationalSlot(type);
  }

  // True if any part of a col,row,w,h footprint sits on land held for Hyperion
  // Station, until the station itself is standing there. GridManager.canPlaceFootprint
  // consults this so nothing the player builds can land on the fenced plot.
  function isMeridianReserved(col, row, w = 1, h = 1) {
    const s = nationalPlan?.slots?.[T.NATIONALGRID];
    if (!s || EntityRegistry.getByType(T.NATIONALGRID).size > 0) return false;
    const d = EntityDefs[T.NATIONALGRID];
    return col < s[0] + d.width && s[0] < col + w && row < s[1] + d.height && s[1] < row + h;
  }

  function _reserveNationalSlot(type) {
    if (!nationalPlan) return null;
    nationalPlan.slots = nationalPlan.slots || {};
    const d0 = EntityDefs[type];
    const have = nationalPlan.slots[type];
    if (have && d0) {
      const me = { col: have[0], row: have[1], w: d0.width, h: d0.height };
      const hit = _nationalTaken(type).some(p =>
        me.col < p.col + p.w && p.col < me.col + me.w && me.row < p.row + p.h && p.row < me.row + me.h);
      // One-time move for a spot that was parked OUTSIDE the full block by the
      // older "beside any national building" fallback (which could land on
      // the town side): prefer the side facing away from City Hall. Flagged
      // on the plan so the search runs once, not every frame the fence draws.
      const outside = !(me.col >= nationalPlan.c0 && me.col + me.w <= nationalPlan.c0 + nationalPlan.w &&
                        me.row >= nationalPlan.r0 && me.row + me.h <= nationalPlan.r0 + nationalPlan.h);
      if (!hit && outside && !(nationalPlan.awayChecked || {})[type]) {
        nationalPlan.awayChecked = { ...(nationalPlan.awayChecked || {}), [type]: true };
        const b = _findBesideZoneAwayFromCity(d0.width, d0.height, _nationalTaken(type));
        if (b) { nationalPlan.slots[type] = [b.col, b.row]; return nationalPlan.slots[type]; }
      }
      if (!hit) return have;
      delete nationalPlan.slots[type];                                  // stale — pick a fresh spot below
    } else if (have) return have;
    const taken = _nationalTaken(type);
    const got = _scatterInBlock(nationalPlan.c0, nationalPlan.r0, nationalPlan.w, nationalPlan.h, [type], taken);
    let spot = got ? got[type] : null;
    if (!spot) { const b = _findBesideZoneAwayFromCity(EntityDefs[type].width, EntityDefs[type].height, taken); if (b) spot = [b.col, b.row]; }
    if (!spot) { const b = _findBesideNational(EntityDefs[type].width, EntityDefs[type].height, taken); if (b) spot = [b.col, b.row]; }
    if (spot) nationalPlan.slots[type] = spot;
    return spot;
  }

  // City Hall's zone: a new civic building lands at a random clear spot
  // within GOV_SCATTER_STEPS tiles of City Hall itself, rather than the nearest
  // free tile — the zone grows as a loose civic quarter, not a tightly
  // packed spiral. Measured from City Hall, not the zone's current edge, or
  // each arrival would push the next one further out and the zone would
  // snowball (customer requests measure their distance band from its rect).
  // A spot is only used if the grown zone keeps the zone spacing rule
  // (ZoneSystem.crowdsZones): the government zone never grows toward a
  // neighbourhood that is already within ZONE_GROW_GAP, so with a commercial
  // zone to its west and industry to its north it grows south and east.
  // When the nearby ground on the open sides is used up, the scatter reaches
  // further out (GOV_SCATTER_STEPS) rather than breaking the rule.
  const GOV_SCATTER_STEPS = [22, 34, 48];
  const GOV_NEAR_SLACK = 4;   // tiles past the closest free spot a new building may land
  function _scatterGovPlace(type, def, W, H, reach) {
    const z = ZoneSystem.getZoneRects('government')[0];
    if (!z || !govEntity) return null;
    const h = { minC: govEntity.col, maxC: govEntity.col + govEntity.width - 1,
                minR: govEntity.row, maxR: govEntity.row + govEntity.height - 1 };
    const cands = [];
    for (let row = h.minR - reach - H; row <= h.maxR + reach; row++) {
      for (let col = h.minC - reach - W; col <= h.maxC + reach; col++) {
        // Chebyshev distance from the footprint to City Hall
        const dc = Math.max(0, h.minC - (col + W - 1), col - h.maxC);
        const dr = Math.max(0, h.minR - (row + H - 1), row - h.maxR);
        if (Math.max(dc, dr) > reach) continue;
        if (!_clearDryLand(col - 1, row - 1, W + 2, H + 2)) continue;
        // The zone as it would be after this building (expandGovZone pads by 2)
        const g = { minC: Math.min(z.minC, col - 2), maxC: Math.max(z.maxC, col + W + 1),
                    minR: Math.min(z.minR, row - 2), maxR: Math.max(z.maxR, row + H + 1) };
        if (ZoneSystem.crowdsZones(z, g)) continue;
        cands.push({ col, row, d: Math.max(dc, dr) });
      }
    }
    if (!cands.length) return null;
    // Pick among the spots nearest City Hall, not the whole scatter area: a
    // uniform pick over the square lands mostly in its outer ring (that is
    // where most of the area is), so new buildings kept arriving ~20 tiles
    // out. GOV_NEAR_SLACK keeps some looseness without the long walk.
    const dMin = cands.reduce((m, c) => Math.min(m, c.d), Infinity);
    const near = cands.filter(c => c.d <= dMin + GOV_NEAR_SLACK);
    const { col, row } = near[Math.floor(Math.random() * near.length)];
    const entity = new Entity(type, col, row);
    entity.width  = W; entity.height = H;
    entity._isGov = true;
    entity.powered = false;
    entity.reliability = 100; entity.satisfaction = 100;
    GridManager.setEntityFootprint(entity);
    ZoneSystem.expandGovZone(col, row, W, H);
    console.log(`[GOV] scattered ${type} at col=${col} row=${row} (${cands.length} spots)`);
    showToast(`🏛 Work has started on a ${def.label} in the Government Zone`, '#c0a030', '#0e0c00', '#504010');
    SFX.unlock?.();
    return entity;
  }

  function placeGovBuilding(type) {
    const def = EntityDefs[type];
    if (!def) { console.warn('[GOV] placeGovBuilding: no EntityDef for', type); return null; }
    const W = def.width || 4, H = def.height || 4;
    const govE = govEntity;
    if (!govE) { console.warn('[GOV] placeGovBuilding: govEntity is null, cannot place', type); return null; }
    const gc = Math.floor(govE.col + govE.width/2);
    const gr = Math.floor(govE.row + govE.height/2);
    console.log(`[GOV] placeGovBuilding: type=${type} size=${W}x${H} searching from col=${gc} row=${gr}`);

    let entity = null;
    for (const reach of GOV_SCATTER_STEPS) if (!entity) entity = _scatterGovPlace(type, def, W, H, reach);

    // No room around the zone (hemmed in by neighbourhoods or water): fall
    // back to the nearest free spot, searching out to 90 tiles: still one
    // that keeps the zone spacing rule, if there is one.
    if (!entity) entity = _spiralPlace(type, def, W, H, gc, gr, 90, true);
    if (!entity) entity = _spiralPlace(type, def, W, H, gc, gr, 90);

    // Fallback: if the area near the gov building is fully packed, retry
    // from the map's absolute center instead of giving up. This uses the
    // same wide-radius spiral, just anchored differently, so a crowded gov
    // zone doesn't silently block a building whose requirements are met.
    if (!entity) {
      const mapCx = Math.floor(COLS / 2), mapCy = Math.floor(ROWS / 2);
      console.warn(`[GOV] placeGovBuilding: no space found near gov zone for ${type}, retrying from map center`);
      entity = _spiralPlace(type, def, W, H, mapCx, mapCy, 90);
    }

    if (!entity) {
      console.warn(`[GOV] placeGovBuilding: FAILED to place ${type}; no free footprint found anywhere searched`);
      showToast(`⚠ Could not place ${def.label}; no free space found`, '#ff6040', '#180800', '#602010');
    } else {
      // A crew builds it first (construction_system.js); it can't take
      // power, or be held against approval, until it's finished.
      ConstructionSystem.start(entity);
    }
    return entity;
  }

  function issueContract() {
    const eligible = getEligibleContracts();
    if (!eligible.length) return;
    // Pick lowest phase first
    eligible.sort((a, b) => (a.phase||1) - (b.phase||1));
    const ct = eligible[0];
    const contract = {
      id:       ct.id,
      label:    ct.label,
      desc:     ct.desc,
      reward:   ct.reward,
      govBuilding: ct.govBuilding || null,
      phase:    ct.phase,
      condition: ct.condition,
      _completed: false,
      _issuedAt: Date.now(),
      _issuedGame: _gameTime,
    };
    pendingContracts.push(contract);
    showToast(`📋 Mayor: New commission: ${ct.label}`, '#c0a030', '#0e0c00', '#504010');
    SFX.request?.();
    return contract;
  }

  // Sentiment model: conditions set a target (0-100); approval eases toward it.
  const SENT_BASE     = 50;     // neutral target with nothing helping or hurting
  const SENT_RISE_K   = 0.0012; // fraction of the gap closed per 0.1s tick when recovering
  const SENT_FALL_K   = 0.003;  // ...and when slipping
  const SENT_MAX_STEP = 0.08;   // max approval change per tick either way
  // Snapshot of last tick's inputs, for the panel's mood summary.
  let _lastMood = null;
  // A nuclear meltdown's fallout zone, while it lasts: the worst live stage
  // sets most of it, every further zone (a chain of cores) adds more. With
  // the base at 50, a fresh blast drives the target to the floor and holds
  // it there; it eases as the zone steps down and lifts when it recovers.
  const FALLOUT_SENT = [0, 15, 40, 65];   // by stage: none, residual, hazardous, highly contaminated
  function _falloutPenalty() {
    const L = typeof LightningDamageSystem !== 'undefined' ? LightningDamageSystem : null;
    if (!L || !L.falloutLevel) return 0;
    const lvl = L.falloutLevel();
    if (!lvl) return 0;
    return Math.min(80, FALLOUT_SENT[lvl] + 5 * Math.max(0, L.falloutZoneCount() - 1));
  }

  // How the mayor is feeling and why: biggest drains first, then what's helping.
  function getMood() {
    const m = _lastMood;
    const a = Math.round(approvalRating);
    const label = a >= 85 ? 'Delighted' : a >= 70 ? 'Pleased' : a >= 50 ? 'Content' : a >= 30 ? 'Unhappy' : a >= 10 ? 'Angry' : 'Furious';
    const reasons = [];
    let trend = 'steady', target = a;
    if (m) {
      target = Math.round(m.target);
      trend = target - a >= 2 ? 'rising' : target - a <= -2 ? 'falling' : 'steady';
      const P = typeof PollutionSystem !== 'undefined' ? PollutionSystem : null;
      const pt = m.parts;
      const bad = (pts, text) => { if (pts < -0.5) reasons.push({ good: false, pts: -pts, text }); };
      const good = (pts, text) => { if (pts > 0.5) reasons.push({ good: true, pts, text }); };
      // Pollution is two complaints with different fixes, so they are listed
      // apart: how much the city burns, and how much smog people breathe.
      if (P && pt.pollution < 0) {
        const ap = P.approvalParts(), over = ap.plants, expo = ap.smog, k = over + expo > 0 ? -pt.pollution / (over + expo) : 0;
        const n = Math.round(ap.count * 10) / 10;
        bad(-over * k, ap.count > ap.cap
          ? `Dirty plants: about ${Math.round(ap.count)} polluting buildings are running unsolved. Public anger tops out at ${ap.cap}, so approval only starts to recover once you are back under that. Scrub or replace them, or add carbon capture.`
          : `Dirty plants: the equivalent of ${n} polluting building${n === 1 ? '' : 's'} running unsolved (the city emits ${Math.round(P.emissions())} units against a free allowance of ${P.ALLOWANCE}). Each one scrubbed or replaced wins back about ${Math.round(ap.perPlant * 0.8 * 10) / 10} points; carbon capture helps too.`);
        bad(-expo * k, 'Smog is reaching homes and businesses. Move plants further from town and downwind of it.');
      }
      bad(pt.fallout || 0, 'A nuclear meltdown has left the city under fallout. Nothing wins people back while the blast zone is contaminated; the anger eases as it decays and lifts once it recovers.');
      const govNames = m.darkGovNames && m.darkGovNames.length ? ` (${m.darkGovNames.join(', ')})` : '';
      bad(pt.unconnected, `${m.unconnectedGov} government building${m.unconnectedGov === 1 ? '' : 's'}${govNames} ${m.unconnectedGov === 1 ? 'has' : 'have'} no power. Reconnect ${m.unconnectedGov === 1 ? 'it' : 'them'}; goodwill from parks and services is paused until you do.`);
      bad(pt.blackout, `${m.darkCustomers} customer${m.darkCustomers === 1 ? ' who had power is' : 's who had power are'} in a blackout. Check for overloaded lines or missing generation.`);
      // Goodwill the city could be earning and isn't. Only flagged when a
      // source is under half its cap, and not while it is withheld anyway.
      if (!m.unconnectedGov) {
        const miss = (have, cap, text) => { if (have < cap / 2) reasons.push({ good: false, pts: cap - have, text }); };
        miss(pt.parks, 15, m.parks ? `Only ${m.parks} park${m.parks === 1 ? '' : 's'} or playground${m.parks === 1 ? '' : 's'}. People want more green space; each one adds goodwill, up to 10.`
                                   : 'There are no parks or playgrounds. People want green space; each one adds goodwill, up to 10.');
        miss(pt.service, 8, 'Too few businesses are getting dependable power. Keep shops and services powered at 90% reliability or better.');
        miss(pt.civic, 10, "Few civic buildings are up and running. Complete the mayor's commissions to establish more, and keep them powered.");
        miss(pt.contracts, 6, `Only ${completedContracts} of the mayor's commissions and civic milestones completed. Each one adds lasting trust, up to 12. See COMMISSIONS below.`);
      }
      good(pt.parks, 'Parks and playgrounds are keeping people happy.');
      good(pt.service, 'Reliable businesses are earning goodwill.');
      good(pt.civic, 'Powered civic buildings are earning goodwill.');
      good(pt.contracts, 'Completed commissions have built trust.');
    }
    const drains = reasons.filter(r => !r.good).sort((x, y) => y.pts - x.pts);
    const helps = reasons.filter(r => r.good).sort((x, y) => y.pts - x.pts);
    const lead = `The mayor is ${label.toLowerCase()} and approval is ${trend}` + (trend === 'steady' ? '' : ` toward ${target}%`) + '. ';
    const summary = lead + (drains.length ? `${drains.length} thing${drains.length === 1 ? ' is' : 's are'} holding it down:` : 'Nothing is dragging it down.');
    return { label, trend, target, summary, reasons: drains.concat(helps) };
  }

  function tick(gameTime) {
    if (!govEntity) return;
    _gameTime = gameTime;
    // On a contract job site the town on the grid is the client's, and it
    // starts the job dark: approval is the home city's and stands still for
    // the trip, with no "Approval Falling" card. (It used to be worked out
    // from the client's unlit buildings, so every job site dragged the
    // player's rating down and nagged about blackouts that were the job.)
    const _onJob = typeof ContractSystem !== 'undefined' && ContractSystem.isAway();

    // Update approval: drift toward 70, push by events
    const powered = _govPowered();
    // City Hall connecting to power for the first time (or reconnecting
    // after an outage) gets an audible spark — same transition-detection
    // pattern as the blackout penalty below, just inverted. A short grace
    // period after (re)assignment (spawn, or _resolveGovEntity on load)
    // skips the check entirely, since right after a save loads, .powered
    // hasn't been recomputed by PowerNetwork yet and briefly reads false
    // before catching up — without the grace period that catch-up looks
    // like a real disconnect→connect transition and fires a false spark.
    if (govEntity._powerSparkGrace === undefined) govEntity._powerSparkGrace = 5;
    if (govEntity._wasPowered === undefined) govEntity._wasPowered = powered;
    if (govEntity._powerSparkGrace > 0) {
      govEntity._powerSparkGrace--;
    } else if (!govEntity._wasPowered && powered) {
      try { SFX.spark(); } catch (_e) {}
    }
    govEntity._wasPowered = powered;
    // Same grace window used for the power-spark check above: right after a
    // save loads, entities' .powered flags haven't been recomputed by
    // PowerNetwork yet and briefly read false across the board. Without this,
    // the blackout/civic penalty logic below reads that transient all-dark
    // state as a real outage and fires a false "ongoing blackouts" toast on
    // every session start, even with a perfectly healthy grid.
    const inLoadGrace = govEntity._powerSparkGrace > 0;
    // City Hall being dark is penalised with the other government buildings
    // below; this is only the small goodwill for keeping it lit.
    const satisfactionBonus = powered ? 0.01 : 0;
    // Parks generate small ongoing goodwill while consistently maintained
    let totalParks = 0;
    for (const pt of PARK_TYPES) totalParks += EntityRegistry.getByType(pt).size;
    const parkBonus = Math.min(0.03, totalParks * 0.005);
    let serviceBonus = 0;
    for (const e of EntityRegistry.getByType(T.COMMERCIAL)) {
      if (COMMERCIAL_SPIKES[e.commercialSubtype] && e.powered && e.reliability >= 90) serviceBonus += 0.003;
    }
    serviceBonus = Math.min(0.02, serviceBonus);

    // Government buildings — City Hall and every civic building — that aren't
    // connected to power weigh heavily on approval. Each one drains it at
    // the rate a dark City Hall always has (more for the essential ones),
    // and while any of them is dark the city's goodwill bonuses are withheld
    // (see `goodwill` below), so approval keeps falling until every one is
    // connected rather than parks and services quietly offsetting it.
    //
    // A building that has never had power gets a short grace period first,
    // so one that has only just been placed isn't punished before the player
    // can wire it up. One that HAD power and lost it counts immediately.
    const CIVIC_BUILDING_TYPES = [T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB, T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ];
    const CIVIC_IMPORTANCE = { [T.GOVBUILDING]: 1.5, [T.EMS]: 1.5, [T.HOSPITAL]: 1.5 }; // others default to 1
    const UNCONNECTED_PENALTY   = 0.05;  // approval per tick, per building, × importance
    const NEVER_CONNECTED_GRACE = 300;   // ticks (~30s) before a never-powered building counts
    // The airport stands well outside the city, so running a line out to it
    // takes real time — give it ~5 minutes rather than 30 seconds.
    const GRACE_BY_TYPE = { [T.NATIONALGOV]: 3000, [T.FUSIONLAB]: 3000, [T.AIRPORT]: 3000, [T.MILITARYBASE]: 3000, [T.LAUNCHCOMPLEX]: 3000, [T.NATIONALGRID]: 3000, [T.COMPANYHQ]: 3000 };
    let civicBonus = 0, civicPenalty = 0, unconnectedGov = 0;
    const darkGov = [];   // the buildings counted in unconnectedGov, so the card can name them
    const govBuildings = [govEntity];
    for (const ctype of CIVIC_BUILDING_TYPES) for (const e of EntityRegistry.getByType(ctype)) govBuildings.push(e);
    for (const e of govBuildings) {
      if (e._constructing) continue;   // still a building site: its grace starts when it's finished
      const weight = CIVIC_IMPORTANCE[e.type] || 1;
      if (e.powered) {
        e._everPowered = true;
        e._unconnectedTicks = 0;
        if (e !== govEntity) civicBonus += 0.002 * weight;
        continue;
      }
      e._unconnectedTicks = (e._unconnectedTicks || 0) + 1;
      if (!e._everPowered && e._unconnectedTicks < (GRACE_BY_TYPE[e.type] || NEVER_CONNECTED_GRACE)) continue;
      civicPenalty += UNCONNECTED_PENALTY * weight;
      unconnectedGov++;
      darkGov.push(e);
    }
    civicBonus   = Math.min(0.03, civicBonus);
    civicPenalty = Math.min(0.5,  civicPenalty);
    if (inLoadGrace) { civicPenalty = 0; unconnectedGov = 0; darkGov.length = 0; }

    // Blackout penalty — ongoing service failure should hurt approval, but
    // as a smooth drain rather than a single lump hit. Previously this fired
    // a flat -3/-5/-7 per customer the instant they transitioned to
    // unpowered, summed across everyone who flipped that tick — a big
    // simultaneous outage (or a flickering, unstable grid re-triggering the
    // same customers repeatedly) could crater approval by 50-70+ points in
    // one tick. Now it's a continuous drain proportional to how many
    // customers are CURRENTLY dark (not a one-time transition event), and
    // it's hard-capped per tick so even a total grid collapse decays
    // steadily instead of cliffing straight toward 0.
    //
    // Only counts customers that were PREVIOUSLY powered and are now dark —
    // a freshly-spawned house/business that hasn't been wired up yet reads
    // as unpowered too, but that's "not yet connected", not "lost power",
    // and was incorrectly triggering blackout toasts with no actual outage.
    let unpoweredWeight = 0, darkCustomers = 0;
    if (!inLoadGrace) {
      for (const ct2 of CUSTOMER_TYPES) for (const e of EntityRegistry.getByType(ct2)) {
        if (!e.fromRequest || e._constructing) continue;   // a building site's power isn't a customer's
        if (e.powered) { e._everPowered = true; continue; }
        if (!e._everPowered) continue; // never connected — not a blackout
        darkCustomers++;
        unpoweredWeight += e.type === T.INDUSTRIAL ? 0.06 : e.type === T.COMMERCIAL ? 0.04 : 0.02;
      }
    }
    const BLACKOUT_DRAIN_CAP = 0.6; // max approval lost per tick, no matter how large the outage
    const blackoutPenalty = Math.min(BLACKOUT_DRAIN_CAP, unpoweredWeight);

    const goodwill = unconnectedGov > 0 ? 0 : satisfactionBonus + parkBonus + serviceBonus + civicBonus;
    // Approval eases toward a sentiment target set by current conditions,
    // instead of being pushed straight up or down every tick. Trust is slow
    // to earn and quicker to lose, and the step per tick is capped, so a
    // problem (or a fix) plays out over minutes rather than seconds.
    const P = typeof PollutionSystem !== 'undefined' ? PollutionSystem : null;
    const parts = {
      base: SENT_BASE,
      hall: powered ? 3 : 0,
      parks: Math.min(15, totalParks * 1.5),
      service: serviceBonus / 0.02 * 8,
      civic: civicBonus / 0.03 * 10,
      contracts: Math.min(6, completedContracts * 0.5),
      pollution: -(P ? P.approvalPenalty() : 0),
      fallout: -_falloutPenalty(),
      blackout: -Math.min(40, blackoutPenalty * 60),
      unconnected: -Math.min(40, civicPenalty * 200),
    };
    if (unconnectedGov > 0) { parts.parks = 0; parts.service = 0; parts.civic = 0; }   // goodwill withheld while any civic building is dark
    let target = 0;
    for (const k in parts) target += parts[k];
    target = Math.max(0, Math.min(100, target));
    const gap = target - approvalRating;
    const step = gap * (gap < 0 ? SENT_FALL_K : SENT_RISE_K);
    if (!_onJob) {
      approvalRating = Math.max(0, Math.min(100, approvalRating + Math.max(-SENT_MAX_STEP, Math.min(SENT_MAX_STEP, step))));
      _lastMood = { target, parts, unconnectedGov, darkGovNames: darkGov.map(_govName), darkCustomers, blackoutPenalty, civicPenalty, parks: totalParks };
    }
    if (!_onJob && (blackoutPenalty > 0 || civicPenalty > 0)) {
      const _now = Date.now();
      // Require the outage to persist for 3 continuous seconds before ever
      // toasting — a momentary flicker (one bad tick as the grid re-settles)
      // shouldn't pop a toast the instant it happens.
      if (!Economy._blackoutConditionSince) Economy._blackoutConditionSince = _now;
      const _sustained = _now - Economy._blackoutConditionSince >= 3000;
      if (_sustained) {
        // Purge any blackout toasts queued by an earlier build — this is a
        // notification card now, but a save resumed mid-outage can still have
        // a stale toast sitting in the queue.
        for (let _i = _toastQueue.length - 1; _i >= 0; _i--) {
          if (_toastQueue[_i].tag === 'blackout') _toastQueue.splice(_i, 1);
        }
        // Name the dark buildings, so the player knows which one to wire up.
        const govList = darkGov.map(_govName).join(', ');
        const msg = civicPenalty > 0 && blackoutPenalty > 0
          ? `Blackouts and unconnected government buildings (${govList}) are hurting your approval rating`
          : civicPenalty > 0
          ? `Unconnected government buildings (${govList}) are dragging down your approval rating`
          : 'Ongoing blackouts are steadily hurting your approval rating';
        // One row per dark building; clicking a row jumps to it.
        const details = darkGov.length ? () => darkGov.map(e => ({
          key: e.id ?? `${e.col},${e.row}`,
          label: _govName(e),
          meta: 'no power',
          cause: e._lightningDamaged ? 'Damaged by lightning; repair it'
               : e._everPowered ? 'Lost its connection to a powered network'
               : 'Not connected to a powered network yet',
          onClick: () => { _jumpTo(e); SFX.click(); },
        })) : null;

        // A sticky notification rather than a toast: this is an ongoing
        // condition the player has to fix, not a momentary event, so it stays
        // on screen until the outage actually clears.
        const _showing = NotificationStack.hasTag('blackout');
        if (!_showing && Economy._blackoutNoteShown) {
          // It was up and now isn't, while the outage is still running — the
          // player pressed X. Respect that for the rest of this episode
          // instead of re-pushing it on the next tick.
          Economy._blackoutNoteDismissed = true;
        }
        if (!Economy._blackoutNoteDismissed) {
          // The wording changes as civic/blackout penalties come and go, and
          // push() de-dupes by tag, so an existing card has to be replaced
          // rather than left showing stale text.
          if (_showing && Economy._blackoutNoteMsg !== msg) {
            NotificationStack.dismissTag('blackout');
          }
          if (!NotificationStack.hasTag('blackout')) {
            NotificationStack.push({
              icon: '📉', title: 'Approval Falling', message: msg,
              color: '#ff8040', border: '#804020', tag: 'blackout', details,
            });
            // One log entry per outage episode, for history — the card itself
            // is the thing that persists.
            if (!Economy._blackoutNoteShown) MessageLog.add(`📉 ${msg}`, '#ff8040');
          }
          Economy._blackoutNoteShown = true;
          Economy._blackoutNoteMsg   = msg;
        }
      }
    } else {
      // Outage resolved — pull the card and re-arm for the next episode, so a
      // player who dismissed one still gets told about the next.
      Economy._blackoutConditionSince = null;
      if (Economy._blackoutNoteShown || Economy._blackoutNoteDismissed) {
        NotificationStack.dismissTag('blackout');
        Economy._blackoutNoteShown     = false;
        Economy._blackoutNoteDismissed = false;
        Economy._blackoutNoteMsg       = null;
      }
      for (let _i = _toastQueue.length - 1; _i >= 0; _i--) {
        if (_toastQueue[_i].tag === 'blackout') _toastQueue.splice(_i, 1);
      }
      Economy._lastBlackoutToastAt = null;
    }

    // Check completed contracts (the mayor's: judged on the home city only)
    for (const c of pendingContracts) {
      if (_onJob) break;
      if (c._completed) continue;
      if (c.condition()) {
        c._completed = true;
        completedContracts++;
        approvalRating = Math.min(100, approvalRating + 8);
        Economy.spend(-c.reward);
        SFX.cash?.();
        // Already met when it was handed over (a city further along than the
        // queue): don't make the player wait the full interval for the next.
        if (gameTime - (c._issuedGame ?? -Infinity) < 5) lastContractTime = Math.min(lastContractTime, gameTime - CONTRACT_INTERVAL + CONTRACT_CATCHUP);
        let _builtEntity = null;
        if (c.govBuilding && !_hasGovBuilding(c.govBuilding)) _builtEntity = placeGovBuilding(c.govBuilding);
        // A built civic building gets its own card, which already names the reward.
        if (_builtEntity) { lastCivicBuiltAt = gameTime; _notifyGovBuildingBuilt(_builtEntity, c.reward); }
        else showToast(`✅ Commission complete: ${c.label} · +$${c.reward.toLocaleString()}`, '#40ff80', '#001408', '#0a4020');
      }
    }

    // Civic buildings spawn the moment their requirements are met, regardless
    // of whether a contract for them was ever issued (contract issuance is
    // gated/sequenced and can lag behind or skip a building's own condition —
    // see CONTRACT_TYPES entries with a govBuilding field). This guarantees
    // townhall/civiccenter/courthouse/ems/hospital/university/transporthub
    // appear as soon as they're earned, independent of the contract queue.
    for (const ct2 of CONTRACT_TYPES) {
      if (!ct2.govBuilding) continue;
      if (_hasGovBuilding(ct2.govBuilding)) continue; // already built
      if (!ct2.condition()) continue; // requirements not yet met — silent, checked every tick
      console.log(`[GOV] civic building condition met: ${ct2.id} (${ct2.label}); attempting spawn`);
      const built = placeGovBuilding(ct2.govBuilding);
      if (!built) continue; // placement failed (logged/toasted inside placeGovBuilding) — retry next tick, don't pay out
      lastCivicBuiltAt = gameTime;   // starts the CIVIC_GAP_DAYS wait for the next one
      approvalRating = Math.min(100, approvalRating + 8);
      Economy.spend(-ct2.reward);
      _notifyGovBuildingBuilt(built, ct2.reward);
      // Mark any matching pending contract as completed too, so it doesn't
      // separately fire or stay listed as active/incomplete.
      const pc = pendingContracts.find(p => p.id === ct2.id && !p._completed);
      if (pc) pc._completed = true;
      completedContracts++;
    }

    // National Government Zone: each building arrives when its milestone is
    // met. The founding search is a wide scan, so a failed attempt waits half
    // an in-game hour before trying again.
    // Never on a contract job site: the home city is not on the grid there,
    // so "not built yet" is always true and the building would break ground
    // on the client's land instead (Hyperion Station did, where the job's
    // `service` clause then demanded it be powered). Any that an older build
    // left on a site is cleared off it here.
    const _awayOnJob = typeof ContractSystem !== 'undefined' && ContractSystem.isAway();
    if (_awayOnJob) {
      for (const type of NATIONAL_TYPES) for (const e of [...EntityRegistry.getByType(type)]) {
        if (e._clientOwned) continue;
        GridManager.removeEntityFootprint(e);
        NotificationStack.dismissTag(`${type}-connect`);
      }
    }
    for (const type of NATIONAL_TYPES) {
      if (_awayOnJob) break;
      if (_hasGovBuilding(type) || !NATIONAL[type].due()) continue;
      if (gameTime < (_nationalNextTry[type] || 0)) continue;
      if (!spawnNational(type)) _nationalNextTry[type] = gameTime + DayNight.secondsPerGameHour() * 0.5;
    }
    for (const type of NATIONAL_TYPES) {
      if (!NotificationStack.hasTag(`${type}-connect`)) continue;
      for (const b of EntityRegistry.getByType(type)) if (b.powered) {
        NotificationStack.dismissTag(`${type}-connect`);
        showToast(NATIONAL[type].online, NATIONAL[type].color, '#0c0e10', NATIONAL[type].border);
      }
    }

    // Issue new contract
    const allPending = pendingContracts.filter(c => !c._completed);
    const firstContractReady = !govSentFirstContract &&
      HouseRequestSystem.getCabinCleared() && powered;
    const intervalReady = gameTime - lastContractTime >= CONTRACT_INTERVAL;

    if (allPending.length < MAX_ACTIVE_CONTRACTS && (firstContractReady || (govSentFirstContract && intervalReady))) {
      if (issueContract()) {
        lastContractTime = gameTime;
        govSentFirstContract = true;
      }
    }
  }

  // Everything the panel shows about contracts: what is open and how far
  // along, when the next one is due, what has been done, and the civic
  // buildings the city is working toward.
  function getContractInfo() {
    const typeOf = id => CONTRACT_TYPES.find(ct => ct.id === id);
    const active = pendingContracts.filter(c => !c._completed).map(c => {
      const ct = typeOf(c.id);
      return { id: c.id, label: c.label, desc: c.desc, reward: c.reward, goals: ct ? ct.goals() : [] };
    });
    const done = pendingContracts.filter(c => c._completed).map(c => ({ label: c.label, reward: c.reward }));
    const civic = CONTRACT_TYPES.filter(ct => ct.govBuilding).map(ct => {
      const built = _hasGovBuilding(ct.govBuilding);
      return { label: ct.label, desc: ct.desc, reward: ct.reward, built, goals: built ? [] : ct.goals() };
    });
    let nextIn = null, waiting = null;
    if (active.length < MAX_ACTIVE_CONTRACTS) {
      if (!govSentFirstContract) {
        waiting = !HouseRequestSystem.getCabinCleared() ? "Connect Mae's Cabin and the mayor will send your first commission."
                : !_govPowered() ? 'City Hall needs power before the mayor will send a commission.' : null;
        if (!waiting) nextIn = 0;
      } else if (!getEligibleContracts().length) {
        waiting = active.length ? null : 'The mayor has nothing more to ask for now. New commissions open up as you research new technology and the city grows.';
      } else nextIn = Math.max(0, CONTRACT_INTERVAL - (_gameTime - lastContractTime));
    }
    return { active, done, civic, nextIn, waiting, maxActive: MAX_ACTIVE_CONTRACTS, completed: completedContracts };
  }

  function getApproval()   { return Math.round(approvalRating); }
  function getGovEntity()  { return govEntity; }

  // ── Loan system ──────────────────────────────────────────────────
  const LOAN_OPTIONS = [
    { amount: 5000,   label: '$5,000'   },
    { amount: 10000,  label: '$10,000'  },
    { amount: 25000,  label: '$25,000'  },
    { amount: 50000,  label: '$50,000'  },
    { amount: 100000, label: '$100,000' },
  ];
  // Daily interest, charged at noon as a flat share of the ORIGINAL amount
  // borrowed (not of the running balance), so a loan costs the same every day
  // it stands rather than compounding away from the player.
  const LOAN_INTEREST_RATE = 0.08;
  let loans = [];

  function takeLoaan(amount) {
    Economy.spend(-amount);
    const interest = Math.round(amount * LOAN_INTEREST_RATE);
    // A loan never bills on the day it is taken out. Borrow at 3pm and the
    // first charge lands at noon TOMORROW, giving the player a full day of
    // the money before it starts costing them. Tracking the due date per
    // loan (rather than one global "have we billed today" flag) is what
    // makes that possible: two loans taken on different days each keep
    // their own schedule.
    loans.push({
      amount, interest, balance: amount,
      takenDay: DayNight.day(),
      nextDueDay: DayNight.day() + 1,
    });
    showToast(`🏦 Loan of $${amount.toLocaleString()} received · $${interest.toLocaleString()}/day interest from Day ${DayNight.day() + 1}`, '#c0a030', '#100800', '#503010');
    SFX.cash?.();
  }

  function repayLoan(index) {
    console.log('[REPAY] called with index:', index, 'loans.length:', loans.length, 'loan:', loans[index], 'balance:', Economy.balance);
    const loan = loans[index];
    if (!loan) { console.log('[REPAY] bail: no loan at index', index); return; }
    if (!Economy.canAfford(loan.balance)) { console.log('[REPAY] bail: cannot afford', loan.balance, 'have', Economy.balance); SFX.error?.(); showToast('⚠ Not enough funds to repay', '#ff6040', '#140800', '#602010'); return; }
    Economy.spend(loan.balance);
    loans.splice(index, 1);
    console.log('[REPAY] success');
    showToast('✅ Loan repaid', '#40c060', '#001408', '#0a4020');
    SFX.goodConnect?.();
  }

  function tickLoans() {
    if (!loans.length) return;
    const day  = DayNight.day();
    const hour = DayNight.hour();
    if (hour < 12) return;

    // Charge each loan that has come due, then push it to the next day.
    // The old version gated on a single module-level `_lastNoonDay` that
    // started at -1 and — because of the `!loans.length` early return
    // above — was never advanced on days when the player had no debt. So
    // the first loan ever taken was billed on the very next tick as long
    // as it was past noon: borrow at 3pm, pay interest at 3pm.
    let total = 0;
    for (const loan of loans) {
      if (loan.nextDueDay === undefined) loan.nextDueDay = (loan.takenDay ?? day) + 1;
      if (day < loan.nextDueDay) continue;
      loan.balance += loan.interest;
      total += loan.interest;
      loan.nextDueDay = day + 1;
    }
    if (total > 0) {
      Economy.spend(total);
      showToast(`🏦 Loan interest: -$${total.toLocaleString()}`, '#e04030', '#140000', '#601010');
    }
  }

  function getLoans()       { return loans; }
  function getLoanOptions() { return LOAN_OPTIONS; }
  // So the panel blurb cannot drift from the rate actually charged - it had
  // been hardcoded at 8% and was left behind when the rate changed.
  function getLoanRatePct() { return Math.round(LOAN_INTEREST_RATE * 100); }
  function getContracts()  { return pendingContracts; }
  function getCompleted()  { return completedContracts; }

  function save() {
    return {
      approval: approvalRating, completed: completedContracts,
      lastContractTime, govSentFirstContract,
      lastCivicBuiltAt: Number.isFinite(lastCivicBuiltAt) ? lastCivicBuiltAt : null,
      pendingContracts: pendingContracts.map(c => ({
        id: c.id, label: c.label, desc: c.desc, reward: c.reward,
        _completed: c._completed, _issuedAt: c._issuedAt, _issuedGame: c._issuedGame,
      })),
      govCol: govEntity?.col, govRow: govEntity?.row,
      nationalPlan,
    };
  }

  function load(data) {
    if (!data) return;
    approvalRating     = data.approval ?? 75;
    completedContracts = data.completed ?? 0;
    lastContractTime   = data.lastContractTime ?? -999;
    lastCivicBuiltAt   = data.lastCivicBuiltAt ?? -Infinity;
    govSentFirstContract = data.govSentFirstContract ?? false;
    nationalPlan = data.nationalPlan || null;
    // Rebuild pending contracts with live condition functions
    pendingContracts = (data.pendingContracts || []).map(saved => {
      const ct = CONTRACT_TYPES.find(c => c.id === saved.id);
      if (!ct) return null;
      // Remove contracts whose unlock requirement isn't met yet
      if (ct.reqUnlock && !Progression.isUnlocked(ct.reqUnlock)) return null;
      // Wording and pay come from the current definition, so a rewritten or
      // rebalanced contract reads (and pays) correctly in an old save.
      return { ...saved, label: ct.label, desc: ct.desc, reward: ct.reward, condition: ct.condition, reqUnlock: ct.reqUnlock, govBuilding: ct.govBuilding || null, phase: ct.phase };
    }).filter(Boolean);
    // Restore gov entity from grid — deferred until after entity restore loop
    // because GovernmentSystem.load runs before data.grid is processed.
    if (data.govCol !== undefined) {
      // Store coords for resolution after entity restore
      GovernmentSystem._pendingGovCol = data.govCol;
      GovernmentSystem._pendingGovRow = data.govRow;
    }
  }

  return { spawnGovBuilding, tick, tickLoans, getApproval, getMood, getGovEntity, getContracts, getContractInfo, getCompleted, save, load, takeLoaan, repayLoan, getLoans, getLoanOptions, getLoanRatePct,
    forceSpawnNational(type) { return _hasGovBuilding(type) ? null : spawnNational(type); },
    forceSpawnNationalGov()  { return _hasGovBuilding(T.NATIONALGOV)  ? null : spawnNational(T.NATIONALGOV); },
    forceSpawnFusionLab()    { return _hasGovBuilding(T.FUSIONLAB)    ? null : spawnNational(T.FUSIONLAB); },
    forceSpawnAirport()      { return _hasGovBuilding(T.AIRPORT)      ? null : spawnNational(T.AIRPORT); },
    forceSpawnMilitaryBase() { return _hasGovBuilding(T.MILITARYBASE) ? null : spawnNational(T.MILITARYBASE); },
    forceSpawnLaunchComplex() { return _hasGovBuilding(T.LAUNCHCOMPLEX) ? null : spawnNational(T.LAUNCHCOMPLEX); },
    getNationalPlan, reserveNationalSlot, isMeridianReserved,
    adjustApproval(d) { approvalRating = Math.max(0, Math.min(100, approvalRating + d)); },
    forceSpawnGovBuilding(type) {
      console.log('[DEV] forceSpawnGovBuilding:', type, '| govEntity:', govEntity);
      return placeGovBuilding(type);
    },
    _resolveGovEntity(e) { govEntity = e; },
    distToGovZone: () => { const g = GovernmentSystem?.getGovEntity?.(); return g ? 0 : Infinity; } };
})();

// ─── Water Body System ────────────────────────────────────────────
