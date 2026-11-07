/* ═══════════════════════════════════════════════════════════════════
   DEMAND CURVES
   Time-of-day power demand curves for customer types.
   ═══════════════════════════════════════════════════════════════════ */

const DemandCurves = (() => {
  // Share of the nursery's grow lamps that are lit at hour `h`: all of them
  // through the night, ramping with the dawn and dusk, and by day as many as
  // the cloud calls for (none under a clear sky, 70% under full overcast).
  // `steady` leaves the weather out, for quoted figures. Shared by the
  // nursery's demand curve and its sprite.
  function growLight(h, steady) {
    const hour = h == null ? DayNight.hour() : h;
    const dark = hour < 5.5 || hour >= 19.5 ? 1 : hour < 7 ? (7 - hour) / 1.5 : hour >= 18 ? (hour - 18) / 1.5 : 0;
    if (steady || typeof CloudState === 'undefined') return dark;
    const overcast = Math.max(0, Math.min(1, ((CloudState.cover || 0) - 0.4) / 0.5)) * 0.7;
    return Math.max(dark, overcast);
  }
  // True on the cannery's canning days: every third in-game day.
  function canneryRun() {
    const d = (typeof DayNight !== 'undefined' && DayNight.day) ? DayNight.day() : 0;
    return ((d % 3) + 3) % 3 === 0;
  }

  // How much harder the ice rink's chillers are working than on a mild day,
  // as a share of its draw: nothing up to 24°C, then 5% per degree, capped at
  // +80%. An ordinary afternoon adds about 13%; a heatwave afternoon about 73%.
  // Shared by the rink's demand curve and its sprite (fans, vapour, drips).
  function rinkHeat() {
    if (typeof WeatherEventSystem === 'undefined') return 0;
    return Math.max(0, Math.min(0.8, (WeatherEventSystem.getTemperatureDelta() - 6) * 0.05));
  }

  // Returns W for a given hour (0-24) from a simple segment table
  // segments: [[startHour, endHour, watts], ...]
  function fromSegments(segments, hour) {
    for (const [s, e, w] of segments) {
      if (hour >= s && hour < e) return w;
    }
    return segments[segments.length - 1][2];
  }

  const CURVES = {
    // Residential
    [T.HOUSE]: h => fromSegments([
      [0,  6,  3],   // overnight
      [6,  17, 2],   // daytime — people at work
      [17, 22, 6],   // evening peak
      [22, 24, 3],   // late night
    ], h),

    // Street lamp — only on when dark. The switching hours move with the
    // season's dawn and dusk (no shift with seasons off, or for a quoted figure).
    [T.LAMP]: (h, steady) => { const s = steady || typeof Seasons === 'undefined' ? 0 : Seasons.dayShift(); return (h >= 6 - s && h < 20 + s) ? 0 : 0.5; },

    // Commercial subtypes
    grocery:   h => fromSegments([[0,7,3],[7,17,5],[17,22,20],[22,24,3]], h),
    coldstorage: () => 15,
    factory:   h => (h >= 7 && h < 19) ? 30 : 0,
    cafe:      h => fromSegments([[0,6,0],[6,10,8],[10,17,6],[17,21,4],[21,24,0]], h),
    // The Kakery: display fridges overnight, ovens 05:00–09:00, decorating
    // and the shop floor through the day, winding down to close at 19:00.
    kakery:    h => fromSegments([[0,5,2],[5,9,11],[9,17,7],[17,19,5],[19,24,2]], h),
    office:    h => fromSegments([[0,8,0],[8,18,12],[18,20,2],[20,24,0]], h),
    clinic:    h => fromSegments([[0,6,4],[6,9,8],[9,17,12],[17,20,8],[20,24,4]], h),  // morning ramp, daytime peak, evening taper
    coldstorage: h => fromSegments([[0,24,13],[0,6,17],[6,18,13],[18,24,17]], h),  // slightly higher at night
    datacenter: h => fromSegments([[0,6,22],[6,12,25],[12,18,28],[18,24,23]], h),  // near-constant, tops out at 28 kW
    // Default commercial fallback
    commercial_default: h => fromSegments([[0,7,5],[7,17,10],[17,22,20],[22,24,5]], h),

    // New commercial types
    hotel:    h => fromSegments([[0,6,28],[6,12,10],[12,18,14],[18,22,20],[22,24,28]], h), // night peak (guests), day trough
    // Starlite Motor Inn: guests check in at dusk; the place is empty by midday.
    motel:         h => fromSegments([[0,6,9],[6,9,6],[9,16,3],[16,19,6],[19,24,10]], h),
    // The Harbourside: a quiet day, then the rooftop bar and full rooms.
    boutiquehotel: h => fromSegments([[0,1,16],[1,6,10],[6,10,9],[10,17,8],[17,23,20],[23,24,16]], h),
    // Azure Bay Resort: pool pumps all day, the evening show and lit tower at night.
    resorthotel:   h => fromSegments([[0,6,25],[6,10,42],[10,18,53],[18,23,76],[23,24,42]], h),
    mall:     h => fromSegments([[0,9,0],[9,12,20],[12,18,30],[18,21,45],[21,22,10],[22,24,0]], h),  // evening peak, fully shut 22:00–09:00
    // Aurora Galleria: trades late, peaks with the evening crowd; the LED
    // façade and the billboard keep a little on through the night.
    galleria: h => fromSegments([[0,10,4],[10,13,22],[13,18,32],[18,22,50],[22,23,24],[23,24,4]], h),
    // The Grand Arcade: a daytime place, busiest through the afternoon; after
    // hours just the lamps and string lights on the square.
    arcade:   h => fromSegments([[0,8,3],[8,11,18],[11,17,34],[17,20,26],[20,24,3]], h),
    venue:    h => fromSegments([[0,1,8],[1,10,0],[10,17,5],[17,20,20],[20,23,50],[23,24,8]], h),    // huge evening spike, dark 01:00–10:00

    // Strictly business-hours — dark outside them
    bank:     h => fromSegments([[0,8,0],[8,18,18],[18,24,0]], h),
    // Cornerstone Savings & Loan: a short banking day; the ATM and sign carry the night.
    savingsloan: h => fromSegments([[0,9,1],[9,17,9],[17,24,1]], h),
    // Sterling Reserve Bank: trading floor by day, vault security and servers all night.
    reservebank: h => fromSegments([[0,7,17],[7,8,28],[8,18,44],[18,20,28],[20,24,17]], h),
    // Closes after the last showing, opens late morning
    movietheater: h => fromSegments([[0,1,14],[1,11,0],[11,17,10],[17,23,26],[23,24,20]], h),
    // Essential — never goes dark (mirrors the clinic's always-on shape)
    pharmacy: h => fromSegments([[0,7,5],[7,9,7],[9,19,9],[19,22,7],[22,24,5]], h),

    // ── Spike-driven subtypes ────────────────────────────────────────
    // These return null while OPEN so the service-density spike system in
    // economy.js (COMMERCIAL_SPIKES -> _activePowerInput) keeps driving their
    // draw; power_network.js only falls through to that when the curve gives
    // null. A number is returned only for closed/idle hours, which the curve
    // must own since the spike system has no concept of opening hours.
    restaurant: h => (h >= 1 && h < 10) ? 1 : null,      // shut to diners overnight, coolers still running
    fastfood:   h => (h >= 2 && h < 6)  ? 1.35 : null,      // late-night drive-thru, brief pre-dawn lull
    donutshop:  h => (h >= 14 || h < 5) ? 1 : null,         // fryers at dawn, sold out by early afternoon
    hotdog:     h => (h >= 3 && h < 11) ? 0.8 : null,       // the after-bar crowd, shut through the morning
    pizzeria:   h => (h < 11) ? 2 : null,                   // dough proving, ovens held warm overnight
    coworking:  h => (h >= 22 || h < 6) ? 0 : null,      // members go home
    gym:        h => (h >= 23 || h < 5) ? 2 : null,      // 24hr access, near-empty overnight
    bakery:     h => (h >= 15 || h < 3) ? 0 : null,      // bakers start ~03:00, shop shuts mid-afternoon
    autorepair: h => (h >= 19 || h < 7) ? 0 : null,      // trade shop, no night shift

    // New residential subtypes — use house curve but scaled via demandMult
    // Neighbourhood school — a residential-zone civic building, so it rides
    // the T.HOUSE dispatch like the multi-unit subtypes. Shape is the inverse
    // of a house: the load lands while everyone else's is at its daily low.
    // 05:00 plant warm-up, a flat teaching-day plateau, clubs/cleaning after
    // the bell, evening community hire, then a night setback that never quite
    // reaches zero (servers, freezers, security lighting).
    school:    h => fromSegments([[0,5,4],[5,7,10],[7,15,18],[15,18,9],[18,21,6],[21,24,4]], h),
    // Sheriff's office — staffed 24/7 (dispatch, holding cells, radio mast),
    // so there's no night trough; the floodlit lot and the night shift make
    // the evening the peak instead.
    sheriff:   h => fromSegments([[0,6,12],[6,18,10],[18,24,14]], h),
    // Corner store — tills, lights and chillers while open 07:00–23:00;
    // just the fridges overnight.
    cornerstore: h => (h >= 7 && h < 23) ? 2.5 : 0.75,
    townhouse: h => fromSegments([[0,6,8],[6,17,6],[17,22,16],[22,24,8]], h),
    apartment: h => fromSegments([[0,6,10],[6,17,8],[17,22,20],[22,24,10]], h),
    // Maple Court's siblings — same scale, different residents.
    // Birchwood: young professionals — a morning blip, empty by day, late evenings.
    birchwood: h => fromSegments([[0,1,14],[1,6,8],[6,9,13],[9,17,5],[17,19,15],[19,24,21]], h),
    // Foundry Lofts: lots of home-workers, so the day never empties out.
    foundry:   h => fromSegments([[0,7,9],[7,17,14],[17,23,20],[23,24,12]], h),
    // Willowbank: families — busy before school, home early, lights out early.
    willowbank: h => fromSegments([[0,6,9],[6,9,16],[9,15,8],[15,21,21],[21,24,9]], h),
    condo:     h => fromSegments([[0,6,4],[6,17,3],[17,22,9],[22,24,4]], h),
    // The Harrington's siblings — same scale, different owners.
    // The Lumière: pool pumps and dinner parties — a late evening peak.
    lumiere:   h => fromSegments([[0,1,7],[1,6,5],[6,9,6],[9,17,3],[17,19,7],[19,24,10]], h),
    // Ashford Place: mostly retired — home all day, early to bed.
    ashford:   h => fromSegments([[0,6,3],[6,10,7],[10,17,6],[17,21,9],[21,24,4]], h),
    // Cedar Point: terrace lighting and the penthouse hot tub keep evenings high.
    cedarpoint: h => fromSegments([[0,6,5],[6,17,4],[17,23,9],[23,24,5]], h),

    // ── MK3-era properties ───────────────────────────────────────────
    // Everything here unlocks after Research Station MK3, and is pitched
    // deliberately above the pre-MK3 customers of the same kind.
    // Company Town: shift-work housing — the afternoon shift change, not the
    // evening, is its peak, and the night shift keeps it busy overnight.
    companytown: h => fromSegments([[0,6,22],[6,14,14],[14,22,34],[22,24,22]], h),
    // Skyscraper Condos: the steepest residential evening peak in the game.
    skyscraper:  h => fromSegments([[0,6,19],[6,17,14],[17,22,36],[22,24,25]], h),
    // Whitmore Hall: luxury estate — quiet days, a steep evening peak.
    mansion:     h => fromSegments([[0,6,14],[6,17,11],[17,22,30],[22,24,19]], h),
    // Thornfield House: Victorian manor — similar evening rise, a touch lighter.
    victorian:   h => fromSegments([[0,6,12],[6,17,9.6],[17,22,28],[22,24,17]], h),
    // Glasswater Pavilion: modern villa — pool pumps and glass keep the night high.
    pavilion:    h => fromSegments([[0,6,17],[6,17,12],[17,22,34],[22,24,22]], h),
    // The Glass Gardens: modest by day; grow lights run hard overnight (22:00–06:00)
    // after the mansions' evening peak has eased — deliberately NOT an evening house.
    glasshouse:  h => fromSegments([[0,6,36],[6,10,14],[10,18,11],[18,22,14],[22,24,34]], h),
    // Ashmere Vineyard: pumps and cold storage by day, a smaller tasting bump at dusk,
    // then quiet overnight — fills the afternoon while mansions are still low.
    vineyard:    h => fromSegments([[0,8,5.5],[8,17,30],[17,21,19],[21,24,7]], h),
    // Science Museum: exhibit halls and a planetarium through opening hours.
    sciencemuseum: h => fromSegments([[0,9,11],[9,12,76],[12,17,97],[17,20,55],[20,24,11]], h),
    // Marina: shore power and the clubhouse; evenings on the water peak it.
    marina:      h => fromSegments([[0,7,5.5],[7,11,17],[11,17,24],[17,23,35],[23,24,5.5]], h),
    // Amusement Park: rides all day, a light show every evening. Rain closes
    // the rides and cuts the load to about a third. `steady` skips the
    // weather so quoted peaks (request cards, compendium) don't dip in a storm.
    amusementpark: (h, steady) => {
      if (h < 10 || h >= 23) return 17;
      const base = h >= 17 ? 166 : 97;
      return (!steady && typeof RainSystem !== 'undefined' && RainSystem.isActive()) ? Math.round(base * 0.35) : base;
    },
    // Splash Kingdom: the wave machine, slide and lazy-river pumps are the
    // load, so it peaks by day and drops once the gates shut at 19:00.
    // Rain empties the pools and the pumps back off to about a third.
    waterpark: (h, steady) => {
      if (h < 9 || h >= 21) return 11;
      if (h < 10) return 42;                        // filtration + filling before opening
      if (h >= 19) return 28;                       // closed; underwater lights + filtration
      return (!steady && typeof RainSystem !== 'undefined' && RainSystem.isActive()) ? 31 : 90;
    },
    // Thunder Ridge: launch coasters and lit rides — full tilt into the
    // evening, with the laser show and night rides running to midnight.
    thunderridge: (h, steady) => {
      if (h < 10) return 28;
      const base = h >= 18 ? 234 : 151;
      return (!steady && typeof RainSystem !== 'undefined' && RainSystem.isActive()) ? Math.round(base * 0.35) : base;
    },
    // Mid-rise Co-op: a big shared block that stays busy all day.
    coop:        h => fromSegments([[0,6,25],[6,17,22],[17,22,30],[22,24,28]], h),
    // Pharma Lab: cold chain overnight, clean rooms at full tilt by day.
    pharmalab:   h => fromSegments([[0,7,31],[7,19,42],[19,24,31]], h),
    // Radiology Wing: always on — its MRI scans are driven by the spike system
    // (COMMERCIAL_SPIKES), which only takes over while the curve returns null.
    radiology:   () => null,
    // Stadium: live draw comes from its match-night schedule in the economy
    // tick. `steady` returns the match-night shape so quoted peaks read 248 kW.
    stadium:     (h, steady) => steady ? ((h >= 19 && h < 22) ? 248 : (h >= 18 && h < 23) ? 124 : 20) : null,
    // Car Dealership: showroom lighting through trading hours, then the lot
    // floodlights carry it overnight — the peak is after dark, not by day.
    cardealer:   h => fromSegments([[0,6,44],[6,9,19],[9,18,30],[18,21,55],[21,24,49]], h),
    // Fine dining: kitchen prep through the afternoon, full dinner service.
    finedining:  h => fromSegments([[0,11,5.5],[11,15,34],[15,18,20],[18,23,76],[23,24,14]], h),
    // The Gold Room: idle through the day, then a sharp late supper spike that
    // starts after mansion evening peaks ease (21:00) and runs past midnight.
    supperclub:  h => fromSegments([[0,2,66],[2,11,5.5],[11,18,8.3],[18,21,11],[21,24,66]], h),
    // Aquarium: tank life support never stops; galleries lit while open.
    aquarium:    h => fromSegments([[0,9,48],[9,20,68],[20,24,48]], h),
    // Convention Centre: live draw comes from its expo schedule in the
    // economy tick. `steady` returns the expo-day shape so quotes read 208 kW.
    convention:  (h, steady) => steady ? ((h >= 9 && h < 18) ? 208 : (h >= 7 && h < 20) ? 83 : 17) : null,
    // Hyperion Spire: offices by day, observation deck + façade show at night.
    // Evergreen Spires: a mixed tower pair — morning bump, evening peak.
    evergreen:   h => fromSegments([[0,6,30],[6,9,45],[9,17,32],[17,23,60],[23,24,38]], h),
    // Prism Crest: professionals — quiet days, a strong evening peak.
    prism:       h => fromSegments([[0,6,32],[6,9,48],[9,17,30],[17,23,64],[23,24,40]], h),
    // Tidecrest: the lagoon and sky-pool pumps hold the daytime load up.
    tidecrest:   h => fromSegments([[0,6,28],[6,10,40],[10,18,46],[18,23,58],[23,24,34]], h),
    // Halcyon Helix: families and professionals, a busy morning and evening.
    helix:       h => fromSegments([[0,6,30],[6,9,50],[9,17,34],[17,23,66],[23,24,40]], h),
    // Nexus Holo-Arena: a show every evening 19:00–23:00 — projectors, the
    // LED dome and the searchlights; doors from 17:00; tours by day.
    holoarena:   h => h >= 19 && h < 23 ? 280 : h >= 17 && h < 19 ? 120 : h >= 10 && h < 17 ? 70 : 30,
    // Nova Arcology: a city in one building — busy mornings, a heavy evening peak.
    // Verdance Sky Habitat: a thousand homes plus the halo's sky apartments and
    // the pumps lifting its waterfall: busy mornings, a heavy evening.
    verdance:    h => fromSegments([[0,6,80],[6,9,120],[9,17,95],[17,23,160],[23,24,105]], h),
    arcology:    h => fromSegments([[0,6,50],[6,9,70],[9,17,55],[17,23,90],[23,24,60]], h),
    // Quantum Exchange: the quantum computers and their cryostats never stop;
    // the trading floor adds the daytime top end.
    quantumx:    h => fromSegments([[0,7,180],[7,9,220],[9,17,260],[17,24,200]], h),
    // Hyperion Space Elevator: the station ticks over at 600 kW; each climber
    // launch (every six hours, for an hour) beams another 600 kW up the tether.
    spaceelevator: h => (h % 6) < 1 ? 1200 : 600,
    megatower:   h => fromSegments([[0,6,120],[6,9,220],[9,17,300],[17,19,260],[19,23,320],[23,24,160]], h),
    // Skyline Maglev Terminal: two commuter rushes with a lull between.
    maglev:      h => fromSegments([[0,5,90],[5,9,340],[9,16,200],[16,20,340],[20,24,120]], h),
    // Aurora Sky Casino: quiet mornings, a heavy night floor until 03:00.
    skycasino:   h => fromSegments([[0,3,400],[3,10,160],[10,18,240],[18,24,430]], h),
    // ── Post-Hyperion ──
    // Hyperion World Expo: pavilions and the monorail from 09:00, then the
    // globe's 20:00–23:00 light show; halls ticking over through the night.
    worldexpo:   h => fromSegments([[0,8,140],[8,9,200],[9,20,260],[20,23,520],[23,24,180]], h),
    // Zenith Observatory & Planetarium: offices and the café by day; the dome
    // shows and the cooled telescope cameras run 19:00 to 02:00.
    planetarium: h => fromSegments([[0,2,240],[2,10,60],[10,17,90],[17,19,130],[19,24,240]], h),
    // Celestine Arch: twelve hundred homes and the canal pumps under them.
    celestine:   h => fromSegments([[0,6,90],[6,9,140],[9,17,110],[17,23,190],[23,24,120]], h),

    // ── Post-MK2 properties ──────────────────────────────────────────
    // Unlock after Research Station MK2; heavier than the everyday early
    // customers of the same kind, lighter than the MK3 set above.
    // Worker Duplexes: coal-town shift work — the afternoon change peaks it.
    duplex:      h => fromSegments([[0,6,8],[6,14,5],[14,22,14],[22,24,8]], h),
    // Sunset Grove Retirement Village: residents home all day — a morning
    // lift, a quieter afternoon, a gentle early-evening peak, lights out early.
    retirement:  h => fromSegments([[0,6,6],[6,11,12],[11,17,10],[17,21,16],[21,24,7]], h),
    // MK2-era apartment blocks — Maple Court's scale, each on its own clock.
    // Pemberton Mansions: pit overmen on the day shift — up before dawn,
    // home mid-afternoon, early to bed.
    pemberton:   h => fromSegments([[0,4,7],[4,7,17],[7,14,7],[14,20,20],[20,22,11],[22,24,7]], h),
    // Linden Court: night-shift nurses and refinery crews — the peak lands
    // before they head out, and plenty of lights stay on through the small hours.
    linden:      h => fromSegments([[0,6,14],[6,9,10],[9,15,6],[15,19,20],[19,22,12],[22,24,15]], h),
    // The Rialto: musicians and theatre people — asleep all morning, home
    // after the last curtain, so the peak is around midnight.
    rialto:      h => fromSegments([[0,2,20],[2,4,12],[4,11,5],[11,18,9],[18,23,12],[23,24,19]], h),
    // Club Voltage: doors at 22:00, packed from midnight to the 04:00 close —
    // fills the small hours after the evening peaks. Idles on fridges by day.
    nightclub:   h => fromSegments([[0,3,49],[3,4,34],[4,6,8.3],[6,20,4.2],[20,22,11],[22,24,36]], h),
    // The Blue Note: a small room, live sets from 20:00 to the 02:00 close.
    jazzbar:     h => fromSegments([[0,2,12],[2,10,1],[10,17,2],[17,20,5],[20,24,12]], h),
    // The Mirrorball: doors at 21:00, the floor lit until 03:00.
    disco:       h => fromSegments([[0,3,38],[3,5,7],[5,19,2.8],[19,21,11],[21,24,36]], h),
    // Pulse: the big room. Builds from 22:00, flat out from midnight to 04:00,
    // winding down to the 05:00 close; chillers and the pool plant by day.
    superclub:   h => fromSegments([[0,4,151],[4,5,97],[5,7,19],[7,20,12],[20,22,34],[22,24,118]], h),
    // Ashby Public Library: a flat working day, reading rooms lit into the evening.
    library:     h => fromSegments([[0,8,4.2],[8,9,11],[9,17,19],[17,20,17],[20,24,4.2]], h),
    // Threadline Outfitters: lit display windows, fitting rooms and HVAC from
    // 10:00; the after-work rush makes 17:00–21:00 the peak. Window spots
    // stay on dimmed overnight.
    // Harbor & Whitlock: a working day, with somebody always in late on a case.
    lawoffice:   h => fromSegments([[0,7,2],[7,9,6],[9,18,10],[18,21,5],[21,24,2]], h),
    // Beacon Call Centre: three shifts round the clock; nights run a skeleton floor.
    callcentre:  h => fromSegments([[0,6,10],[6,14,16],[14,22,18],[22,24,10]], h),
    // Summit Tower: offices fill from 07:00; servers, lobby and the lit crown carry the night.
    summit:      h => fromSegments([[0,6,19],[6,8,42],[8,18,66],[18,21,42],[21,24,22]], h),
    clothing:    h => fromSegments([[0,9,4.2],[9,10,11],[10,17,25],[17,21,36],[21,24,4.2]], h),
    // Bowling Alley: afternoon leagues, then a busy evening.
    bowling:     h => fromSegments([[0,11,3],[11,17,13],[17,23,24],[23,24,3]], h),
    // The Morning Ledger: a quiet newsroom by day, then the press run from
    // 22:00 to 04:00 and the dispatch dock until dawn. Its peak lands when
    // solar is at zero and most of the town is asleep.
    newspaper:   h => fromSegments([[0,4,26],[4,6,12],[6,8,5],[8,18,8],[18,22,10],[22,24,26]], h),
    // Frostline Ice Rink: the chillers hold the ice all night; lights, hire
    // desk and dehumidifiers come on for 10:00–22:00. Both scale with the
    // heat outside (rinkHeat) unless a steady figure is asked for.
    icerink:     (h, steady) => ((h >= 10 && h < 22) ? 22 : 14) * (steady ? 1 : 1 + rinkHeat()),
    // WGRD 98.7 FM: transmitter and studio, never off; a little more for the
    // breakfast and drive-time shows.
    radio:       h => fromSegments([[0,6,3],[6,10,5],[10,16,4],[16,20,5],[20,24,3.5]], h),
    // Glasswing Nursery: fans and pumps (4 kW) plus up to 26 kW of grow lamps,
    // lit by how little daylight there is (growLight). All night, off on a
    // clear day, part-way under cloud: the inverse of a solar panel.
    nursery:     (h, steady) => 4 + 26 * growLight(h, steady),
    // Emberstone Hot Springs: circulation pumps all night, day visitors, then
    // the after-work soak.
    hotsprings:  h => fromSegments([[0,7,8],[7,10,16],[10,17,22],[17,22,34],[22,24,14]], h),
    // Saltwind Cannery: every third day is a canning day (canneryRun): the
    // line and retorts run 06:00–18:00 with an hour's warm-up and a two-hour
    // clean-down either side. Between runs only the cold store draws.
    cannery:     (h, steady) => !(steady || canneryRun()) ? 10 : (h >= 6 && h < 18) ? 65 : (h >= 5 && h < 20) ? 30 : 10,
    // Truck Stop Diner: 24h — rush spikes come from COMMERCIAL_SPIKES.
    truckstop:   () => null,
  };

  // Trading hours per commercial subtype, kept alongside the curves above so
  // the two can't drift apart. `null` means the business never shuts. `idle`
  // is the reduced overnight draw for places that close to customers but keep
  // something running (coolers, security lighting, 24hr access).
  //   open/close are in 24h clock; close < open means it runs past midnight.
  const HOURS = {
    cafe:         { open: 6,  close: 21 },
    office:       { open: 8,  close: 20 },
    factory:      { open: 7,  close: 19 },
    bank:         { open: 8,  close: 18 },
    savingsloan:  { open: 9,  close: 17, idle: 1 },
    reservebank:  { open: 8,  close: 18, idle: 17 },
    coworking:    { open: 6,  close: 22 },
    autorepair:   { open: 7,  close: 19 },
    bakery:       { open: 3,  close: 15 },
    kakery:       { open: 7,  close: 19, idle: 2 },
    school:       { open: 7,  close: 15, idle: 4 },
    mall:         { open: 9,  close: 22 },
    galleria:     { open: 10, close: 23, idle: 4 },
    arcade:       { open: 8,  close: 20, idle: 3 },
    movietheater: { open: 11, close: 1 },
    venue:        { open: 10, close: 1 },
    restaurant:   { open: 10, close: 1, idle: 1 },
    fastfood:     { open: 6,  close: 2, idle: 1.35 },
    donutshop:    { open: 5,  close: 14, idle: 1 },
    hotdog:       { open: 11, close: 3, idle: 0.8 },
    pizzeria:     { open: 11, close: 24, idle: 2 },
    gym:          { open: 5,  close: 23, idle: 2 },
    grocery:      { open: 7,  close: 22, idle: 3 },
    sciencemuseum: { open: 9,  close: 20, idle: 11 },
    marina:        { open: 7,  close: 23, idle: 5.5 },
    amusementpark: { open: 10, close: 23, idle: 17 },
    waterpark:     { open: 10, close: 19, idle: 11 },
    thunderridge:  { open: 10, close: 24, idle: 28 },
    bowling:       { open: 11, close: 23, idle: 3 },
    hotsprings:    { open: 7,  close: 23, idle: 8 },
    nursery:       null,
    cannery:       null,
    icerink:       { open: 10, close: 22, idle: 14 },
    newspaper:     null,
    radio:         null,
    nightclub:     { open: 22, close: 4,  idle: 4.2 },
    jazzbar:       { open: 20, close: 2,  idle: 1 },
    disco:         { open: 21, close: 3,  idle: 2.8 },
    superclub:     { open: 22, close: 5,  idle: 12 },
    library:       { open: 9,  close: 20, idle: 4.2 },
    clothing:      { open: 10, close: 21, idle: 4.2 },
    lawoffice:     { open: 8,  close: 19, idle: 2 },
    summit:        { open: 7,  close: 19, idle: 19 },
    callcentre:    null,
    cardealer:     { open: 9,  close: 21, idle: 44 },
    finedining:    { open: 11, close: 23, idle: 5.5 },
    supperclub:    { open: 21, close: 2,  idle: 5.5 },
    megatower:     null,
    maglev:        null,
    skycasino:     null,
    worldexpo:     { open: 9,  close: 23, idle: 140 },
    planetarium:   { open: 10, close: 2,  idle: 60 },
    quantumx:      null,
    spaceelevator: null,
    holoarena:     { open: 10, close: 23, idle: 30 },
    aquarium:      { open: 9,  close: 20, idle: 48 },
    // Always-on — medical, refrigeration, servers, guests
    clinic:      null,
    pharmacy:    null,
    coldstorage: null,
    datacenter:  null,
    hotel:       null,
    motel:       null,
    boutiquehotel: null,
    resorthotel: null,
  };

  const pad2 = n => String(Math.floor(n)).padStart(2, '0') + ':00';

  // Fusion Research Facility shot schedule — one plasma shot every half
  // in-game hour from 09:00 to 18:00, lasting the first 15% of the slot; the
  // flywheels spin up over the last 20% before it. Shared by the power draw
  // above and the sprite (renderFusionLab), so the two can't disagree.
  function fusionShot(hour) {
    const inDay = hour >= 9 && hour < 18;
    const ph = (hour * 2) % 1;
    return { inDay, ph, firing: inDay && ph < 0.15, spinUp: inDay && ph > 0.8 };
  }

  // Most a home's curve can be multiplied by once its demandScale (wealth
  // tier × grid growth) and its household size are combined. Each factor is
  // reasonable alone; stacked, a 6 kW evening peak could pass 30 kW.
  const HOUSE_SCALE_CAP = 2.5;

  return {
    fusionShot,
    rinkHeat,
    growLight,
    canneryRun,
    HOUSE_SCALE_CAP,
    // Household-size factor on a home's draw — more people, more power.
    popScale(population) {
      return population ? Math.min(2.0, 0.7 + population / 10) : 1.0;
    },
    // A home's demandScale, trimmed so that demandScale × popScale stays
    // within HOUSE_SCALE_CAP. Shared by the grid's demand pass and the peak
    // quoted on request cards so the two can't disagree.
    houseScale(demandScale, population) {
      return Math.min(demandScale || 1, HOUSE_SCALE_CAP / this.popScale(population));
    },
    // Trading hours for a commercial subtype. Returns null when the business
    // never closes, otherwise { open, close, idle, label, isOpenNow }.
    hours(subtype, hour) {
      if (!(subtype in HOURS)) return null;   // unknown subtype — assume always on
      const h = HOURS[subtype];
      if (!h) return null;
      const cur = hour == null ? DayNight.hour() : hour;
      const isOpenNow = h.close > h.open
        ? (cur >= h.open && cur < h.close)
        : (cur >= h.open || cur < h.close);   // wraps past midnight
      return {
        ...h,
        label: `${pad2(h.open)} – ${pad2(h.close)}`,
        isOpenNow,
      };
    },
    // `steady` asks for the building's normal figure, ignoring live
    // conditions such as rain — used for quoted peaks.
    get(entityType, subtype, hour, steady = false) {
      if (entityType === T.LAMP) return CURVES[T.LAMP](hour);
      // Powered parks. `steady` ignores rain so quoted figures don't vanish in a storm.
      if (entityType === T.SPLASHPAD) {
        if (hour < 10 || hour >= 19) return 0;
        return (!steady && typeof RainSystem !== 'undefined' && RainSystem.isActive()) ? 0 : EntityDefs[T.SPLASHPAD].powerInput;
      }
      // Corner Store: tills, lights and chillers while open; fridges all night.
      if (entityType === T.CORNERSTORE) {
        return (hour >= 7 && hour < 23) ? EntityDefs[T.CORNERSTORE].powerInput : 0.75;
      }
      // Community Center: lights + heating through opening hours.
      if (entityType === T.COMMUNITYCENTER) {
        return (hour >= 8 && hour < 22) ? EntityDefs[T.COMMUNITYCENTER].powerInput : 0;
      }
      // Botanic Greenhouse: grow lights + misting by day, heating overnight.
      if (entityType === T.GREENHOUSE) {
        return (hour >= 6 && hour < 22) ? EntityDefs[T.GREENHOUSE].powerInput : 5;
      }
      if (entityType === T.BASEBALLFIELD) {
        return (hour >= 18 && hour < 22) ? EntityDefs[T.BASEBALLFIELD].powerInput : 0;
      }
      // Large civic buildings run a daily load curve rather than a flat draw.
      // University: dorms and labs overnight, lecture-day peak, busy evenings.
      if (entityType === T.UNIVERSITY) {
        return fromSegments([[0,6,45],[6,8,65],[8,9,90],[9,17,110],[17,22,90],[22,24,60]], hour);
      }
      // Airport: terminal, lighting and cargo keep it at 180 kW overnight; the
      // morning and evening departure banks are the peaks.
      // National Government Center: a working-day seat of government —
      // chambers and ministries peak in office hours, security and the
      // floodlit dome keep a floor overnight.
      if (entityType === T.NATIONALGOV) {
        return fromSegments([[0,6,120],[6,8,180],[8,18,260],[18,21,200],[21,24,140]], hour);
      }
      // Fusion Research Facility: cryoplant and systems idle at 180 kW overnight,
      // 280 kW through the working day — and every plasma shot (half-hourly,
      // 09:00–18:00; see fusionShot) pulls the full 1 MW while it lasts.
      if (entityType === T.FUSIONLAB) {
        const s = fusionShot(hour);
        if (s.firing) return 1000;
        return fromSegments([[0,7,280],[7,9,370],[9,18,430],[18,21,340],[21,24,280]], hour);
      }
      // Military Base: never stands down — 220 kW overnight (security lighting,
      // comms, radar), up to 300 kW through the working day's drills and workshops.
      // Hyperion Station: whatever Operation Hyperion's current stage asks of it —
      // construction power, commissioning surges, then the nation's export.
      if (entityType === T.NATIONALGRID) {
        return typeof NationalProject !== 'undefined' ? NationalProject.demandKW(hour) : 300;
      }
      // Starhaven Launch Complex: 450 kW overnight, 900 kW through the working
      // day, which is when a launch window falls. A count multiplies whatever
      // this returns (LaunchSystem.demandMult).
      if (entityType === T.LAUNCHCOMPLEX) {
        return fromSegments([[0,6,450],[6,9,650],[9,18,900],[18,22,650],[22,24,450]], hour);
      }
      // Company Headquarters: three towers of offices — trading floors and the
      // control centre keep 600 kW on overnight, 1.4 MW through the working day.
      if (entityType === T.COMPANYHQ) {
        return fromSegments([[0,6,600],[6,8,950],[8,18,1400],[18,21,1050],[21,24,700]], hour);
      }
      if (entityType === T.MILITARYBASE) {
        return fromSegments([[0,6,220],[6,8,260],[8,18,300],[18,22,260],[22,24,220]], hour);
      }
      if (entityType === T.AIRPORT) {
        return fromSegments([[0,5,180],[5,6,300],[6,9.5,440],[9.5,16,340],[16,21,480],[21,23,300],[23,24,220]], hour);
      }
      // Transport Hub: night maintenance service, two rush-hour peaks.
      if (entityType === T.TRANSPORTHUB) {
        return fromSegments([[0,1,110],[1,5,90],[5,7,150],[7,9.5,220],[9.5,16.5,160],[16.5,19,220],[19,23,150],[23,24,110]], hour);
      }
      if (entityType === T.HOUSE) {
        const fn = CURVES[subtype] || CURVES[T.HOUSE];
        return fn(hour, steady);
      }
      if (entityType === T.COMMERCIAL) {
        const fn = CURVES[subtype] || CURVES.commercial_default;
        return fn(hour, steady);
      }
      // All other entities: use their static def value
      return null;
    },
    // Display-side resolver. get() deliberately returns null for the hours a
    // spike-driven subtype is OPEN, so power_network.js falls through to the
    // spike system's _activePowerInput. UI that just wants "roughly what does
    // this building pull at hour h" has no such fallback, so resolve() fills
    // the gap with the subtype's spike base. Returns null only when there is
    // genuinely no curve and no spike table entry.
    resolve(entityType, subtype, hour) {
      const v = DemandCurves.get(entityType, subtype, hour);
      if (v !== null) return v;
      const sp = (typeof COMMERCIAL_SPIKES !== 'undefined') ? COMMERCIAL_SPIKES[subtype] : null;
      return sp ? sp.base : null;
    },
    // Peak demand for an entity (for display purposes)
    peak(entityType, subtype) {
      const sp = (typeof COMMERCIAL_SPIKES !== 'undefined') ? COMMERCIAL_SPIKES[subtype] : null;
      let max = 0;
      for (let h = 0; h < 24; h++) {
        // A spike subtype's true peak happens during its open (null) hours.
        const raw = DemandCurves.get(entityType, subtype, h, true);
        const v = raw === null ? (sp ? sp.peak : null) : raw;
        if (v !== null && v > max) max = v;
      }
      return max;
    },
  };
})();

/* Audio disabled */
