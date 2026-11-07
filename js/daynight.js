/* ═══════════════════════════════════════════════════════════════════
   DAY/NIGHT CYCLE
   In-game clock, darkness curve, and sky/grid colour lerp.
   ═══════════════════════════════════════════════════════════════════ */

const DayNight = (() => {
  const CYCLE_DURATION = 20 * 60;   // 20 real minutes in seconds

  let elapsed = 5 / 24 * CYCLE_DURATION;   // start at 05:00

  // Clock display format — persisted, defaults to 24-hour (the game's original
  // and only format) so existing players see no change unless they opt out.
  const CLOCK_FORMAT_KEY = 'gw_24hr_clock';
  let use24Hour = (localStorage.getItem(CLOCK_FORMAT_KEY) ?? '1') === '1';

  // 0–1 progress through the day, 0 = midnight
  function phase() { return (elapsed % CYCLE_DURATION) / CYCLE_DURATION; }

  // 0 = bright noon, 1 = dark midnight  (smooth cosine)
  function darkness() {
    const h = phase() * 24;  // 0-24 hour
    // Sunrise ~6:00, full sun 8:00-17:00, sunset 17:45-18:50 at the equinox.
    // Seasons move both ends: `shift` hours earlier dawn and later dusk in
    // summer, the reverse in winter (0 with seasons off). Everything that
    // reads darkness follows: solar output, night rendering, lit windows.
    const shift = typeof Seasons !== 'undefined' ? Seasons.dayShift() : 0;
    const sunrise     = 6 - shift;
    const sunsetStart = 17.75 + shift;  // 17:45
    const sunsetEnd   = 18.83 + shift;  // 18:50
    if (h >= sunrise && h <= sunsetStart) {
      // Daytime — a two-hour dawn ramp, then full sun to the start of sunset
      if (h < sunrise + 2) return 1 - ((h - sunrise) / 2) * 0.95;  // dawn ramp
      return 0.05;  // essentially full sun
    } else if (h > sunsetStart && h <= sunsetEnd) {
      // Sunset ramp 17:45-18:50
      return 0.05 + 0.95 * ((h - sunsetStart) / (sunsetEnd - sunsetStart));
    } else if (h > sunsetEnd && h <= 22) {
      // Dusk to night
      return 1;
    } else {
      // Night (22:00-6:00)
      return 1;
    }
  }

  // In-game hour (0–24) derived from phase
  function hour() { return phase() * 24; }

  // Day number (1-indexed)
  function day() { return Math.floor(elapsed / CYCLE_DURATION) + 1; }

  // Human-readable clock string — 24-hour "HH:MM" or 12-hour "H:MM AM/PM"
  // depending on the player's Options setting.
  function timeString() {
    const h = hour();
    const mm = String(Math.floor((h % 1) * 60)).padStart(2, '0');
    if (use24Hour) {
      const hh = String(Math.floor(h)).padStart(2, '0');
      return `${hh}:${mm}`;
    }
    let hh12 = Math.floor(h) % 12;
    if (hh12 === 0) hh12 = 12;
    return `${hh12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
  }

  function isUse24Hour() { return use24Hour; }
  function setUse24Hour(v) {
    use24Hour = !!v;
    localStorage.setItem(CLOCK_FORMAT_KEY, use24Hour ? '1' : '0');
  }

  // Phase name for label
  function phaseName() {
    const h = hour();
    if (h < 5  || h >= 22) return 'NIGHT';
    if (h < 8)              return 'DAWN';
    if (h < 17)             return 'DAY';
    return 'DUSK';
  }

  // Sky background colour components — lerps between night and day tones.
  // Exposed as raw numbers (not just the CSS string below) so callers that
  // need to blend it into their own colour math — e.g. a water-surface sky
  // reflection tint — don't have to parse a formatted string back apart.
  function skyColorRGB() {
    const d = darkness();
    // night: #080808  day: #181810  near-neutral dark
    return {
      r: Math.round(8 + (24 - 8) * (1 - d)),
      g: Math.round(8 + (24 - 8) * (1 - d)),
      b: Math.round(8 + (18 - 8) * (1 - d)),
    };
  }

  // Sky background colour — lerps between night and day tones
  function skyColor() {
    const { r, g, b } = skyColorRGB();
    return `rgb(${r},${g},${b})`;
  }

  // Grid line colour — warm brown tint. Takes an explicit darkness so the
  // ground cache can bake grid lines at the keyframe it is baking, not at
  // whatever the clock reads while the rebuild happens to run.
  function gridColor(d = darkness()) {
    const v = Math.round(18 + (30 - 18) * (1 - d));
    return `rgba(${Math.round(v*1.2)},${Math.round(v)},${Math.round(v*0.75)},0.5)`;
  }

  return {
    // dt in seconds; called every game tick
    tick(dt) { elapsed += dt; },

    darkness,
    hour,
    day,
    timeString,
    isUse24Hour,
    setUse24Hour,
    phaseName,
    skyColor,
    skyColorRGB,
    gridColor,

    getElapsed()  { return elapsed; },
    setElapsed(v) { elapsed = v; },
    secondsPerGameHour() { return CYCLE_DURATION / 24; },
    skipToNoon()  { elapsed = 12 / 24 * CYCLE_DURATION + Math.floor(elapsed / CYCLE_DURATION) * CYCLE_DURATION; },
    skipToNight() { elapsed = 0.02 * CYCLE_DURATION + Math.floor(elapsed / CYCLE_DURATION) * CYCLE_DURATION; },

    // Set time to a specific minute of the day (0–1439)
    setMinute(m) {
      const dayOffset = Math.floor(elapsed / CYCLE_DURATION) * CYCLE_DURATION;
      elapsed = dayOffset + (m / 1440) * CYCLE_DURATION;
    },
    getMinute() { return Math.floor(hour() / 24 * 1440); },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   SEASONS
   A four-season year laid over the day/night clock: SEASON_DAYS in-game
   days each, so a year is 56 days (about 19 real hours at normal speed).
   One number drives everything, `warmth`: +1 at midsummer, -1 at midwinter,
   and 0 on the first day of spring and in mid-autumn, moving smoothly
   between them (see warmth()). From it:
     • daylight  — dawn and dusk each move up to DAYLIGHT_SHIFT hours
                   (DayNight.darkness), so solar gets about 2.4 hours more
                   sun at midsummer and 2.4 fewer at midwinter;
     • temperature — up to TEMP_SWING °C either way on the day's curve
                   (WeatherEventSystem.getTemperature), which the ice rink,
                   the hot springs and geothermal already read;
     • demand    — homes draw up to HOME_DEMAND more at either extreme
                   (cooling in summer, heating in winter);
     • weather   — no heatwaves in the cold half of the year and no cold
                   snaps in the warm half (EventSystem), and standing frost
                   through the depth of winter (FrostSystem). In winter rain
                   falls as snow, and a rainstorm comes as a blizzard;
     • trees     — leaves turn in autumn, fall for the winter and return in
                   spring, when about half the broadleaf trees blossom pink or
                   white for most of the season (foliage; drawn in
                   render_world_civic.js);
     • grass     — bright new green and wildflowers in spring, bleaching in
                   the late-summer sun, then autumn gold and winter straw
                   (ground; drawn by FrostSystem.render).
   A world starts on the first day of spring, at warmth 0, so day one plays
   as it did before seasons (in blossom and wildflowers, which are already
   out on that day) and the first winter is 42 game days
   away. A save from before seasons picks up the same way: the day it is
   first loaded becomes the first day of spring.
   Switched per world in World Settings (Difficulty.seasons); with it off
   every figure here is neutral.
   ═══════════════════════════════════════════════════════════════════ */
const Seasons = (() => {
  const SEASON_DAYS    = 14;
  const YEAR_DAYS      = SEASON_DAYS * 4;
  const DAYLIGHT_SHIFT = 1.2;    // hours each of dawn and dusk moves at the extremes (about ±20% of the day)
  const TEMP_SWING     = 8;      // °C either side of the day's curve
  const HOME_DEMAND    = 0.12;   // share added to home demand at midsummer and midwinter
  const FROST_FROM     = 0.55;   // frost starts to lie once warmth drops below -this
  const FROST_MAX      = 0.5;    // snow that lies at midwinter whatever the weather; snowfalls and blizzards build on it (FrostSystem)
  const START_DAY      = 0;                 // where in the year a world begins: the first day of spring
  const INFO = [
    { name: 'Spring', icon: '🌱', color: '#8fe08a', border: '#2a6a34',
      arrive: 'The days are lengthening and the cold is easing: blossom and wildflowers are on the way. Solar climbs from here to midsummer.',
      ahead:  'The days start to lengthen and solar output climbs.' },
    { name: 'Summer', icon: '☀', color: '#ffd060', border: '#806010',
      arrive: 'Long days: solar runs about two hours longer at midsummer. Homes draw more for cooling, and heatwaves are possible.',
      ahead:  'Long days for solar, more cooling demand from homes, and heatwaves become possible.' },
    { name: 'Autumn', icon: '🍂', color: '#ff9a50', border: '#803a10',
      arrive: 'The days are drawing in. Solar output falls from here to midwinter; bank what you can.',
      ahead:  'The days draw in and solar output starts to fall.' },
    { name: 'Winter', icon: '❄', color: '#a8dcff', border: '#2a5a80',
      arrive: 'Short days: solar loses about two hours of sun by midwinter. Homes draw more for heating, and frost and cold snaps are likely.',
      ahead:  'Short days for solar, more heating demand from homes, and frost and cold snaps are likely.' },
  ];

  let epoch = null;       // in-game day (fractional, 0-based) the current year began on; null = set on the next tick
  const _GREEN = { turned: 0, bare: 0, blossom: 0 }, _fol = { turned: 0, bare: 0, blossom: 0 };
  const _PLAIN = { fresh: 0, flowers: 0, dry: 0 }, _grd = { fresh: 0, flowers: 0, dry: 0 };
  let lastIdx = -1;       // season index last announced
  let warnedFor = -1;     // season index a "tomorrow" notice has gone out for

  const _on = () => typeof Difficulty === 'undefined' || !Difficulty.seasons || Difficulty.seasons();
  const _dayFloat = () => DayNight.getElapsed() / (DayNight.secondsPerGameHour() * 24);
  // A contract job site stands at a fixed point in ITS year, wherever home's
  // calendar is: named by the job (ContractSystem.siteSeason) and held for
  // as long as the player is standing on it. Everything else in here reads
  // the year through _yearPos, so daylight, temperature, frost, foliage and
  // the HUD all follow without knowing a site is involved.
  const SITE_POS = { spring: 0.45, summer: 1.5, autumn: 2.42, winter: 3.45 };   // in seasons into the year
  function _sitePos() {
    // A scenario with a climate of its own is held at its season the same way.
    if (typeof ScenarioSystem !== 'undefined' && ScenarioSystem.season) {
      const scn = ScenarioSystem.season();
      if (scn && SITE_POS[scn] !== undefined) return SITE_POS[scn] * SEASON_DAYS;
    }
    if (typeof ContractSystem === 'undefined' || !ContractSystem.siteSeason) return null;
    const name = ContractSystem.siteSeason();
    return name && SITE_POS[name] !== undefined ? SITE_POS[name] * SEASON_DAYS : null;
  }
  // Position in the year, 0..YEAR_DAYS.
  function _yearPos() {
    const site = _sitePos();
    if (site !== null) return site;
    if (epoch === null) return START_DAY;
    return (((_dayFloat() - epoch) % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
  }
  // The year's curve, eased between four fixed points so each season has the
  // weather its name promises AND the year opens neutral:
  //     first day of spring   0   (where a world starts)
  //     midsummer            +1
  //     mid-autumn            0
  //     midwinter            -1   then a quick thaw back to 0 by spring
  // A plain sine can't do both: neutral on the first day of spring would put
  // its extremes on the first days of summer and winter, not in the middle.
  const _CURVE = [[0, 0], [1.5, 1], [2.5, 0], [3.5, -1], [4, 0]];   // [seasons into the year, warmth]
  function warmth() {
    if (!_on()) return 0;
    const u = _yearPos() / SEASON_DAYS;
    for (let i = 1; i < _CURVE.length; i++) {
      const [x1, w1] = _CURVE[i];
      if (u > x1) continue;
      const [x0, w0] = _CURVE[i - 1];
      return w0 + (w1 - w0) * (0.5 - 0.5 * Math.cos(Math.PI * (u - x0) / (x1 - x0)));
    }
    return 0;
  }
  const index = () => Math.floor(_yearPos() / SEASON_DAYS) % 4;

  function tick() {
    if (epoch === null) epoch = _dayFloat() - START_DAY;
    // Away on a job the season is the site's and nothing is announced; the
    // first tick back home starts watching again without a notice.
    if (!_on() || _sitePos() !== null) { lastIdx = -1; return; }
    const idx = index(), pos = _yearPos();
    if (lastIdx === -1) { lastIdx = idx; warnedFor = -1; return; }   // first tick of a session: nothing to announce
    const next = (idx + 1) % 4, left = (idx + 1) * SEASON_DAYS - pos;
    if (typeof NotificationStack === 'undefined') { lastIdx = idx; return; }
    if (left <= 1 && warnedFor !== next) {
      warnedFor = next;
      const n = INFO[next];
      NotificationStack.push({ icon: n.icon, title: `${n.name} begins tomorrow`, message: n.ahead, color: n.color, border: n.border, tag: 'season-ahead' });
    }
    if (idx !== lastIdx) {
      lastIdx = idx;
      const n = INFO[idx];
      NotificationStack.dismissTag?.('season-ahead');
      NotificationStack.push({ icon: n.icon, title: `${n.name} has arrived`, message: n.arrive, color: n.color, border: n.border, tag: 'season-now' });
      try { SFX.season?.(idx); } catch (_e) {}
    }
  }

  return {
    SEASON_DAYS, YEAR_DAYS, DAYLIGHT_SHIFT, TEMP_SWING,
    tick,
    enabled: _on,
    warmth,
    index,
    // Dev: move the calendar so today is `day` (1-based) of season `idx`,
    // without touching the clock.
    devJump(idx, day = 7) { epoch = _dayFloat() - (idx * SEASON_DAYS + day - 0.5); lastIdx = -1; },
    name:  () => INFO[index()].name,
    icon:  () => INFO[index()].icon,
    color: () => INFO[index()].color,
    // 1-based day within the current season, and whole days until the next.
    dayOfSeason: () => Math.floor(_yearPos() % SEASON_DAYS) + 1,
    // The same without rounding: 1 at the season's first moment, 1.5 half a day in.
    dayOfSeasonExact: () => _yearPos() % SEASON_DAYS + 1,
    daysToNext:  () => Math.ceil((index() + 1) * SEASON_DAYS - _yearPos()),
    nextName:    () => INFO[(index() + 1) % 4].name,
    // Hours dawn moves earlier and dusk later (negative in the cold half).
    dayShift:   () => DAYLIGHT_SHIFT * warmth(),
    tempOffset: () => TEMP_SWING * warmth(),
    // Homes: cooling at one end of the year, heating at the other.
    demandMult: (entityType) => (typeof T !== 'undefined' && entityType === T.HOUSE) ? 1 + HOME_DEMAND * warmth() * warmth() : 1,
    // Ground frost that lies through the depth of winter, 0..FROST_MAX.
    frostFloor: () => Math.max(0, Math.min(1, (-warmth() - FROST_FROM) / (1 - FROST_FROM))) * FROST_MAX,
    // How dormant the ground is, 0..1: grass fading to straw through the cold
    // half of the year (FrostSystem draws it under the snow).
    dormancy: () => Math.max(0, Math.min(1, -warmth() * 1.3)),
    // What the leaves are doing, as two shares of the map's trees: `turned`
    // (in autumn colour) and `bare` (leaves dropped). Each tree compares its
    // own fixed hash against these (render_world_civic.js), so a wood changes
    // tree by tree over a couple of days rather than all at once: colour
    // comes in over the first days of autumn, the leaves fall around the turn
    // of winter, and they come back over the first days of spring.
    foliage() {
      if (!_on() || (epoch === null && _sitePos() === null)) return _GREEN;
      const p = _yearPos(), S = SEASON_DAYS;
      const ramp = (a, b) => Math.max(0, Math.min(1, (p - a) / (b - a)));
      // Colour over the first 40% of autumn; the leaves fall across the turn
      // of winter; they come back through the last 30% of winter's thaw, so
      // the first day of spring (and of a new world) is fully in leaf.
      _fol.turned = p >= 2 * S && p < 3.7 * S ? ramp(2 * S, 2.4 * S) : 0;
      _fol.bare   = p >= 3.7 * S ? 1 - ramp(3.7 * S, 4 * S) : ramp(2.75 * S, 3.1 * S);
      // Spring blossom: opens over the last days of winter as the leaves come
      // back, so the first day of spring (and of a new world) is already in
      // bloom, and falls through the back half of spring.
      _fol.blossom = p >= 3.85 * S ? ramp(3.85 * S, 4 * S) : p < S ? 1 - ramp(0.6 * S, 0.9 * S) : 0;
      return _fol;
    },
    // The grass between the trees, as three 0..1 amounts (FrostSystem.render):
    // `fresh` — spring's bright new green, easing off into early summer;
    // `flowers` — wildflowers through spring into the first days of summer;
    // `dry` — late summer's sun-bleached grass, handing over to autumn's gold.
    ground() {
      if (!_on() || (epoch === null && _sitePos() === null)) return _PLAIN;
      const p = _yearPos(), S = SEASON_DAYS;
      const ramp = (a, b) => Math.max(0, Math.min(1, (p - a) / (b - a)));
      // Like the blossom, both are already out on the first day of spring
      // (a new world opens on it), coming up over the last days of winter.
      _grd.fresh   = p >= 3.85 * S ? ramp(3.85 * S, 4 * S) : p < 1.2 * S ? 1 - ramp(0.75 * S, 1.15 * S) : 0;
      _grd.flowers = p >= 3.9 * S ? ramp(3.9 * S, 4 * S) : p < 1.6 * S ? 1 - ramp(1.25 * S, 1.6 * S) : 0;
      _grd.dry     = p >= 1.25 * S && p < 2.35 * S ? ramp(1.25 * S, 1.9 * S) * (1 - ramp(2.05 * S, 2.35 * S)) : 0;
      return _grd;
    },
    // The same, in the steps the baked ground layer is repainted at. Each
    // repaint turns that share of the zones' painted canopies at once, so
    // the steps are small: at 6 a sixth of every wood changed in one frame.
    foliageStep() { const f = this.foliage(); return Math.round(f.turned * 24) + '.' + Math.round(f.bare * 24) + '.' + Math.round(f.blossom * 24); },
    // How far into its colour the land is, 0..1: a golden cast on grass and
    // lawns through autumn, giving way to winter's straw (dormancy).
    autumn() { const f = this.foliage(); return f.turned * (1 - f.bare) * (1 - this.dormancy()); },
    serialise: () => ({ epoch }),
    // After DayNight's clock is restored. A save with no seasons block starts
    // its year on the next tick, on the first day of spring.
    load(d) { epoch = d && Number.isFinite(d.epoch) ? d.epoch : null; lastIdx = -1; warnedFor = -1; },
    reset() { epoch = null; lastIdx = -1; warnedFor = -1; },
  };
})();

