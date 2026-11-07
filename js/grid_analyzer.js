/* ═══════════════════════════════════════════════════════════════════
   GRID ANALYZER — the deep breakdown of one power network
   A window on a single network: whether it is healthy and why, how hard
   its lines are working, what every kind of generator is giving against
   what it is rated for, what is stored, who is drawing the power, and how
   all of that has moved over a chosen stretch of time.

   Opened from the GRID panel (the Network Breakdown row, or the ⌕ beside
   any network's name) and from a Wire, Power Pole or Power Tower's panel.

   ── Time ─────────────────────────────────────────────────────────
   History is kept in IN-GAME time (DayNight.getElapsed), not real time.
   Supply and demand follow the game's clock: solar follows the sun and
   every customer follows a daily curve, so "the last day" is the window
   that means something, and it has to mean the same day at 1x, at 4x and
   across a pause (when nothing is recorded, because nothing happened).
   A sample is taken every SAMPLE_GAME_SEC of game time for every listed
   network and kept for KEEP_HOURS in-game hours. The home grid's is saved
   with the game and carries on after a load; a job site's is not.

   ALL TIME is separate and IS saved: a running total per network (energy
   made and used, the highest supply and demand seen, time spent short)
   from the day this network was first recorded. Job sites keep their own,
   thrown away on leaving, so a contract never bleeds into the home grid's
   totals.

   ── Early warnings ───────────────────────────────────────────────
   With a Monitoring Station MK2 standing, every network is also watched
   as it is sampled, and a card goes up BEFORE it fails: lines climbing
   toward burnout, a margin too thin to survive a cloud, generation that
   has quietly fallen back onto storage. A network that is already short
   is left to the game's own outage cards. A warning needs the condition
   to hold for a few samples, clears with some slack, and will not come
   back for WARN_REPEAT_HOURS, so a network sitting on a threshold says
   so once rather than every few seconds. Clicking one opens the
   breakdown on that network.

   ── Forecast ─────────────────────────────────────────────────────
   The next 24 in-game hours, played forward from the last 24. Each sample
   of the past day stands in for the same moment of the coming one:
   generation (less whatever storage was adding then) scaled by how the
   network's rated generation has changed since, demand scaled by how
   demand now compares with the same time yesterday. The network's storage
   is then run through that day from its present charge. It says when the
   network goes dark and for how long, or how close the reserve comes.
   It assumes tomorrow's weather repeats the last day's, and it needs most
   of a day recorded before it will say anything.
   Storage in this game drains by the real second, not the game second
   (PowerNetwork ticks on real time), so the same charge lasts longer on
   the game clock at higher speed. The forecast runs at the current game
   speed and says so.

   ── Which network is which ───────────────────────────────────────
   networkId is handed out afresh by the flood fill every tick, so it
   cannot key a history. A network is keyed here by the lowest tile index
   among its wires and poles, which stays put while the network is merely
   extended. Joined networks carry on under the lower key; after a split
   one half keeps the history and the other starts a new one.
   ═══════════════════════════════════════════════════════════════════ */

const GridAnalyzer = (() => {
  const SAMPLE_GAME_SEC = 2.5;          // ~3 in-game minutes
  const KEEP_HOURS      = 72;
  const WINDOWS = [                      // [id, button label, in-game hours]
    ['1h', '1 HOUR', 1], ['6h', '6 HOURS', 6], ['24h', '1 DAY', 24], ['72h', '3 DAYS', 72],
  ];
  const WINDOW_KEY = 'gridworks.gridAnalyzer.window';

  const hist = new Map();               // network key -> { t: [], g: [], c: [] }
  // network key -> { since, last, sec, eG, eC, pG, pC, short }: kW-seconds of
  // game time made and used, peaks, seconds short. Home's is saved.
  const allHome = new Map(), allAway = new Map();
  const FORGET_HOURS = 240;             // a network not seen for ten in-game days is dropped from the save
  // Early warnings: "kind:key" -> { on, off, up, clearedAt }
  const warns = new Map();
  const WARN_RAISE = 2, WARN_CLEAR = 3; // samples the condition must hold / stay away
  const WARN_REPEAT_HOURS = 2;          // in-game hours before the same warning may return
  const WARN_LINES = 0.65, WARN_LINES_CLEAR = 0.60, WARN_MARGIN = 0.10, WARN_MARGIN_CLEAR = 0.15;
  let lastSampleAt = -1, wasAway = false;
  // A fresh history (a load, a contract trip either way, a reset) starts
  // recording only once the grid has run this long. The first tick after a
  // load runs before the steam turbines and the MHD ring have output again,
  // so generation read a fraction of the real figure with storage covering
  // the rest, and that one sample was the "tightest moment of the day" that
  // Hyperion's standby check and the engineering audit then read for a whole
  // in-game day: 13.8 MW short on a grid with 22.9 MW to spare.
  const SETTLE_GAME_SEC = 10;
  let settleFrom = Infinity;
  let root = null, bodyEl = null, chartEl = null, titleEl = null, timer = 0;
  let selKey = null, selNetId = -1;
  let win = '24h';
  let jumpList = [];                    // entities the rows of the current render point at
  let cycle = new Map();                // generator type -> next unit to jump to
  let lastHtml = '';
  try { const w = localStorage.getItem(WINDOW_KEY); if (WINDOWS.some(o => o[0] === w)) win = w; } catch (_e) {}

  const hourLen = () => (typeof DayNight !== 'undefined' ? DayNight.secondsPerGameHour() : 50);
  const now     = () => (typeof DayNight !== 'undefined' ? DayNight.getElapsed() : 0);
  const esc     = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fp      = (w, d = 1) => formatPower(w, d);
  const plural  = (n, w) => `${n.toLocaleString('en-US')} ${w}${n === 1 ? '' : 's'}`;

  // ── Stable keys ──────────────────────────────────────────────────
  function networkKeys() {
    const keys = new Map();             // networkId -> key
    for (const t of [T.WIRE, T.POLE]) for (const e of EntityRegistry.getByType(t)) {
      if (!(e.networkId >= 0)) continue;
      const k = e.row * 8192 + e.col, cur = keys.get(e.networkId);
      if (cur === undefined || k < cur) keys.set(e.networkId, k);
    }
    return keys;
  }

  // ── Recording ────────────────────────────────────────────────────
  function tick() {
    const away = typeof ContractSystem !== 'undefined' && ContractSystem.isAway && ContractSystem.isAway();
    const t = now();
    // A different world (a job site, or a loaded save): the old history is not this grid's.
    if (away !== wasAway || t < lastSampleAt) { hist.clear(); lastSampleAt = -1; settleFrom = Infinity; wasAway = away; allAway.clear(); clearWarnings(); }
    const all = away ? allAway : allHome;
    if (lastSampleAt < 0) {
      if (!(t >= settleFrom)) settleFrom = t;      // first look at this world (or the clock went back)
      if (t - settleFrom < SETTLE_GAME_SEC) return;
      // History loaded with the save carries on from here; anything stamped
      // after the restored clock isn't this timeline's.
      for (const [key, h] of hist) {
        let n = h.t.length; while (n > 0 && h.t[n - 1] > t) n--;
        if (n < h.t.length) { h.t.length = n; h.g.length = n; h.c.length = n; h.o.length = n; h.r.length = n; }
        if (!n) hist.delete(key);
      }
    }
    if (lastSampleAt >= 0 && t - lastSampleAt < SAMPLE_GAME_SEC) return;
    lastSampleAt = t;
    const s = PowerNetwork.stats;
    const gen = new Map((s.genSources || []).map(n => [n.netId, n.supply]));
    const con = new Map((s.conSources || []).map(n => [n.netId, n.demand]));
    const keys = networkKeys();
    const rated = typeof _peakPotentialByNetwork === 'function' ? _peakPotentialByNetwork() : new Map();
    const horizon = t - KEEP_HOURS * hourLen();
    for (const [netId, key] of keys) {
      if (!gen.has(netId) && !con.has(netId)) continue;
      let h = hist.get(key);
      if (!h) hist.set(key, h = { t: [], g: [], c: [], o: [], r: [] });   // o: storage discharge within g; r: rated generation
      const gNow = gen.get(netId) || 0, cNow = con.get(netId) || 0;
      h.t.push(t); h.g.push(gNow); h.c.push(cNow);
      { const gN = (s.genSources || []).find(n => n.netId === netId), so = gN && gN.sources && gN.sources.get ? gN.sources.get('storage') : null;
        h.o.push(so && so.w > 0 ? so.w : 0); h.r.push(rated.get(netId) || 0); }
      let a = all.get(key);
      if (!a) all.set(key, a = { since: t, last: t, sec: 0, eG: 0, eC: 0, pG: 0, pC: 0, short: 0 });
      let d = t - a.last;
      if (!(d > 0) || d > SAMPLE_GAME_SEC * 4) d = SAMPLE_GAME_SEC;   // a gap (load, time skip): count one sample, not the gap
      a.last = t; a.sec += d; a.eG += gNow * d; a.eC += cNow * d;
      if (gNow > a.pG) a.pG = gNow; if (cNow > a.pC) a.pC = cNow;
      if (gNow < cNow - 0.05) a.short += d;
      if (h.t.length > 256 && h.t[200] < horizon) {       // drop what has aged out, a block at a time
        let cut = 0; while (cut < h.t.length && h.t[cut] < horizon) cut++;
        h.t.splice(0, cut); h.g.splice(0, cut); h.c.splice(0, cut); h.o.splice(0, cut); h.r.splice(0, cut);
      }
    }
    for (const [key, h] of hist) if (!h.t.length || h.t[h.t.length - 1] < horizon) hist.delete(key);
    watch(s, keys, gen, con, t, rated);
  }

  // What a network's storage can do, as one tank: kW-seconds (real) it can
  // still deliver, its ceiling, how fast it can pay out, and how much of a
  // charged kW-second comes back out (PowerNetwork step 3c: 0.85 x the
  // unit's chargeRate into `charge`, each unit of which delivers its
  // dischargeScale).
  function storeTank(stores) {
    const k = { e: 0, max: 0, out: 0, eff: 0.85, n: stores.length };
    let effW = 0;
    for (const e of stores) {
      const d = e.def || EntityDefs[e.type] || {}, ds = d.dischargeScale || 1;
      k.e += Math.max(0, e.charge || 0) * ds; k.max += (d.capacity || 0) * ds;
      k.out += d.maxOutput || d.maxRate || 0;
      effW += 0.85 * (d.chargeRate || 1) * ds * (d.capacity || 1);
    }
    if (k.n) { let capSum = 0; for (const e of stores) capSum += ((e.def || EntityDefs[e.type] || {}).capacity || 1); k.eff = effW / capSum; }
    return k;
  }
  const FORECAST_HOURS = 24, FORECAST_NEEDS = 18;
  const clock = tt => { const h = (((DayNight.hour() + (tt - now()) / hourLen()) % 24) + 24) % 24, m = Math.floor((h % 1) * 60); return `${String(Math.floor(h)).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };

  function forecast(key, tank, cNow, ratedNow) {
    const h = hist.get(key), t1 = now(), day = FORECAST_HOURS * hourLen(), t0 = t1 - day;
    const out = { ready: false, have: 0 };
    if (!h || h.t.length < 4) return out;
    let i0 = h.t.length; while (i0 > 0 && h.t[i0 - 1] >= t0) i0--;
    out.have = (t1 - h.t[i0]) / hourLen();
    if (out.have < FORECAST_NEEDS) return out;
    // Demand now against the same half hour yesterday; rated generation now against then.
    const half = hourLen() / 2; let cThen = 0, nThen = 0, cLate = 0, nLate = 0;
    for (let k = i0; k < h.t.length; k++) {
      if (h.t[k] <= t0 + half) { cThen += h.c[k]; nThen++; }
      if (h.t[k] >= t1 - half) { cLate += h.c[k]; nLate++; }
    }
    const dScale = nThen && nLate && cThen > 0.5 ? Math.max(0.5, Math.min(3, (cLate / nLate) / (cThen / nThen))) : 1;
    const speed = Math.max(1, (typeof DevMode !== 'undefined' && DevMode.timeScale) || 1);
    let E = tank.e;
    const cells = new Array(FORECAST_HOURS).fill(-1);   // -1: no history for that hour yet
    let darkAt = null, darkSec = 0, recoverAt = null, emptyAt = null, lowE = E, lowAt = t1, tight = Infinity, tightAt = t1, storeSec = 0;
    for (let k = i0; k < h.t.length; k++) {
      const tt = h.t[k] + day;                                   // the moment this sample stands in for
      let d = (k + 1 < h.t.length ? h.t[k + 1] : t1) - h.t[k];
      if (!(d > 0) || d > SAMPLE_GAME_SEC * 4) d = SAMPLE_GAME_SEC;
      const rThen = h.r[k] || 0;
      const gScale = rThen > 0.5 && ratedNow > 0 ? Math.max(0, Math.min(5, ratedNow / rThen)) : 1;
      const gen = Math.max(0, (h.g[k] - (h.o[k] || 0))) * gScale, dem = h.c[k] * dScale;
      const sur = gen - dem, real = d / speed;                   // storage runs on real seconds
      let state = 0;
      if (sur >= 0) { E = Math.min(tank.max, E + sur * real * tank.eff); if (recoverAt === null && darkAt !== null) recoverAt = tt; }
      else {
        const need = -sur, give = Math.min(need, tank.out, real > 0 ? E / real : 0);
        E = Math.max(0, E - give * real);
        if (give < need - 0.05) { state = 2; darkSec += d; if (darkAt === null) darkAt = tt; recoverAt = null; if (tank.n && emptyAt === null && E <= 0.001) emptyAt = tt; }
        else { state = 1; storeSec += d; if (darkAt !== null && recoverAt === null) recoverAt = tt; }
      }
      if (tank.n && E < lowE) { lowE = E; lowAt = tt; }
      if (sur < tight) { tight = sur; tightAt = tt; }
      const cell = Math.min(FORECAST_HOURS - 1, Math.max(0, Math.floor((tt - t1) / hourLen())));
      if (state > cells[cell]) cells[cell] = state;
    }
    return { ready: true, have: out.have, cells, darkAt, darkHours: darkSec / hourLen(), recoverAt, emptyAt, storeHours: storeSec / hourLen(),
             lowFrac: tank.max > 0 ? lowE / tank.max : null, lowAt, tight, tightAt, dScale, speed, stores: tank.n };
  }

  function clearWarnings() {
    for (const [id, w] of warns) if (w.up) NotificationStack.dismissTag('gridwarn-' + id);
    warns.clear();
  }

  // The early warnings. Called once per sample with that sample's figures.
  function watch(s, keys, gen, con, t, rated) {
    if (typeof NotificationStack === 'undefined') return;
    if (locked()) { if (warns.size) clearWarnings(); return; }
    // How hard each network's lines are working.
    const load = new Map(), cap = new Map();
    for (const ty of [T.WIRE, T.POLE]) for (const e of EntityRegistry.getByType(ty)) {
      const id = e.networkId; if (!(id >= 0)) continue;
      if ((e.load || 0) > (load.get(id) || 0)) load.set(id, e.load || 0);
      if ((e._effectiveThreshold || 0) > (cap.get(id) || 0)) cap.set(id, e._effectiveThreshold);
    }
    const storesBy = new Map();
    for (const ty of sets().store) for (const e of EntityRegistry.getByType(ty)) {
      if (!(e.networkId >= 0)) continue;
      if (!storesBy.has(e.networkId)) storesBy.set(e.networkId, []);
      storesBy.get(e.networkId).push(e);
    }
    const seen = new Set();
    for (const [netId, key] of keys) {
      if (!gen.has(netId) && !con.has(netId)) continue;
      const g = gen.get(netId) || 0, c = con.get(netId) || 0;
      const short = g < c - 0.05;
      const cp = cap.get(netId) || 0, ld = load.get(netId) || 0, stress = cp > 0 ? ld / cp : 0;
      const gNet = (s.genSources || []).find(n => n.netId === netId);
      const st = gNet && gNet.sources && gNet.sources.get ? gNet.sources.get('storage') : null;
      const onStore = !!st && st.w > 0.05;
      const margin = g > 0 ? (g - c) / g : 0;
      const name = getNetworkDisplayName(netId) || 'A power network';
      const tank = storeTank(storesBy.get(netId) || []);
      const fc = forecast(key, tank, c, rated ? (rated.get(netId) || 0) : 0);
      const soon = fc.ready && fc.darkAt !== null ? (fc.darkAt - t) / hourLen() : null;
      const kinds = {
        forecast: {
          on: !short && soon !== null && soon > 0.25 && soon <= 12, off: short || soon === null || soon > 13 || soon <= 0.1,
          title: `${name}: forecast to go dark at ${fc.ready && fc.darkAt !== null ? clock(fc.darkAt) : ''}`,
          message: soon === null ? '' : `On the last day's pattern ${fc.stores ? 'the storage runs out' : 'supply falls short of demand'} in about ${dur(soon)}, and the network is dark for ${dur(fc.darkHours)}. Add storage, or generation that runs at that hour.`,
        },
        lines: {
          on: !short && stress >= WARN_LINES, off: short || stress < WARN_LINES_CLEAR, bad: stress >= 0.8,
          title: `${name}: lines at ${Math.round(stress * 100)}%`,
          // Line load is what the network's customers draw against its wire
          // rating (base + surge protection), not generation against demand.
          message: `The wires carry ${fp(ld)} of a ${fp(cp)} rating. ` + (stress >= 0.8
            ? `Past 80% spans burn out and generation is lost to congestion. Add surge protection or move load off this network now.`
            : `${fp(Math.max(0, cp * 0.8 - ld))} of room before spans start burning out. Add surge protection before this network grows.`),
        },
        margin: {
          on: !short && !onStore && c > 0.01 && g > 0 && margin < WARN_MARGIN, off: short || onStore || c <= 0.01 || margin > WARN_MARGIN_CLEAR,
          title: `${name}: only ${fp(Math.max(0, g - c))} to spare`,
          message: `Just ${Math.round(margin * 100)}% of what is being generated is spare. One cloud or one new customer tips this network into a blackout. Add generation.`,
        },
        // Batteries covering a passing cloud or a demand spike come and go
        // all day, so this one has to hold a while before it is raised, stay
        // away a while before it clears, and keeps out longer once it has.
        storage: {
          on: !short && onStore, off: short || !onStore,
          raise: 6, clear: 10, repeatHours: 8,
          title: `${name}: running on storage`,
          message: `Generation is not meeting demand; the reserve is covering ${fp(st ? st.w : 0)}. When it runs out the network goes dark.`,
        },
      };
      for (const kind in kinds) {
        const k = kinds[kind], id = `${kind}:${key}`, tag = 'gridwarn-' + id;
        seen.add(id);
        let w = warns.get(id);
        if (!w) warns.set(id, w = { on: 0, off: 0, up: false, clearedAt: -Infinity });
        if (k.on) { w.on++; w.off = 0; } else { w.on = 0; if (k.off) w.off++; }
        if (!w.up && w.on >= (k.raise || WARN_RAISE) && t - w.clearedAt >= (k.repeatHours || WARN_REPEAT_HOURS) * hourLen()) {
          w.up = true;
          NotificationStack.push({
            icon: '⚡', title: k.title, message: k.message + ' Click for the breakdown.',
            color: k.bad ? '#ff7050' : '#ffd070', border: k.bad ? '#602818' : '#604a10', tag,
            onClick: () => open(netIdForKey(key)),
          });
          try { SFX.click?.(); } catch (_e) {}
        } else if (w.up && (k.on || !k.off)) {   // live figures until it clears, not frozen at the last "on" sample
          NotificationStack.updateTag(tag, { title: k.title, message: k.message + ' Click for the breakdown.' });   // no-op once the player has dismissed it
        } else if (w.up && w.off >= (k.clear || WARN_CLEAR)) {
          w.up = false; w.clearedAt = t;
          NotificationStack.dismissTag(tag);
        }
      }
    }
    // Networks that have gone (removed, or joined into another) take their warnings with them.
    for (const [id, w] of warns) if (!seen.has(id)) { if (w.up) NotificationStack.dismissTag('gridwarn-' + id); warns.delete(id); }
  }
  // A warning is raised against a key; by the time it is clicked the id may have moved.
  function netIdForKey(key) { for (const [id, k] of networkKeys()) if (k === key) return id; return undefined; }

  // What the chosen window says about a network.
  function windowStats(key) {
    const hours = WINDOWS.find(o => o[0] === win)[2];
    const h = hist.get(key), t1 = now(), t0 = t1 - hours * hourLen();
    const out = { hours, n: 0, covered: 0, t0, t1, idx0: 0, h };
    if (!h || !h.t.length) return out;
    let i = h.t.length; while (i > 0 && h.t[i - 1] >= t0) i--;
    out.idx0 = i;
    const n = h.t.length - i; if (!n) return out;
    let sg = 0, sc = 0, pg = 0, pc = 0, lg = Infinity, minSur = Infinity, short = 0;
    for (let k = i; k < h.t.length; k++) {
      const g = h.g[k], c = h.c[k];
      sg += g; sc += c; if (g > pg) pg = g; if (c > pc) pc = c; if (g < lg) lg = g;
      if (g - c < minSur) minSur = g - c;
      if (g < c - 0.05) short++;
    }
    out.n = n; out.avgG = sg / n; out.avgC = sc / n; out.peakG = pg; out.peakC = pc; out.lowG = lg;
    out.minSur = minSur; out.shortFrac = short / n;
    out.covered = Math.min(hours, (t1 - h.t[i]) / hourLen() + SAMPLE_GAME_SEC / hourLen());
    out.kWhG = out.avgG * out.covered; out.kWhC = out.avgC * out.covered;   // kW x in-game hours
    return out;
  }

  // ── What is on the network right now ─────────────────────────────
  let _sets = null;
  function sets() {
    if (_sets) return _sets;
    const S = a => new Set(a.filter(Boolean));
    return _sets = {
      gen: S([T.BIOFUELGEN, T.SOLAR, T.SOLAR2, T.SOLAR3, T.WIND, T.WIND2, T.WIND3, T.COALGENERATOR, T.HYDROGENERATOR,
              T.FUELGEN, T.GEOTURBINE, T.STEAMTURBINE, T.STEAMTURBINE2, T.MHDRING]),
      store: S([T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5, T.BATTERY]),
      prot: S([T.PROTECTOR, T.PROTECTOR2, T.PROTECTOR3]),
      gov: S([T.GOVBUILDING, T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB,
              T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ]),
      infra: S([T.LAMP, T.CAMERA, T.EVCHARGER, T.CELLTOWER, T.FIBERHUB, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5,
                T.RESEARCH, T.RESEARCH2, T.RESEARCH3, T.MONITOR, T.MONITOR2, T.ENGOFFICE, T.BEACON, T.SURVEY, T.SURVEY2, T.BATTERY, T.POLE, T.POWERTOWER,
                T.PROTECTOR, T.PROTECTOR2, T.PROTECTOR3, T.PIPE, T.UNDERGNDPIPE, T.WATER]),
    };
  }
  // The GRID panel's consumption categories (stats_panel.js _catFor).
  const category = type => (type === T.HOUSE || type === T.CABIN) ? 'Residential'
                         : type === T.COMMERCIAL ? 'Commercial' : type === T.INDUSTRIAL ? 'Industrial'
                         : sets().gov.has(type) ? 'Government Buildings'
                         : sets().infra.has(type) ? 'Infrastructure & Devices' : 'Production & Processing';
  const nameOf = e => {
    let label = e.businessName || e.familyName || (e.def && e.def.label) || (EntityDefs[e.type] || {}).label || e.type;
    if (e._num !== undefined && typeof NUMBERED_ENTITY_TYPES !== 'undefined' && NUMBERED_ENTITY_TYPES.has(e.type)) label += ` #${e._num}`;
    return label;
  };

  function census(netId) {
    const S = sets();
    const c = { wires: 0, poles: 0, towers: 0, load: 0, cap: 0, gens: new Map(), stores: [], prot: new Map(),
                buildings: 0, dark: [] };
    for (const e of EntityRegistry.all()) {
      if (e.networkId !== netId) continue;
      const t = e.type;
      if (t === T.WIRE || t === T.POLE) {
        if (t === T.WIRE) c.wires++; else c.poles++;
        if ((e.load || 0) > c.load) c.load = e.load || 0;
        if ((e._effectiveThreshold || 0) > c.cap) c.cap = e._effectiveThreshold;
      } else if (t === T.POWERTOWER) c.towers++;
      else if (S.gen.has(t)) { if (!c.gens.has(t)) c.gens.set(t, []); c.gens.get(t).push(e); }
      else if (S.store.has(t)) c.stores.push(e);
      else if (S.prot.has(t)) c.prot.set(t, (c.prot.get(t) || 0) + 1);
      else if (t !== T.PIPE && t !== T.UNDERGNDPIPE && t !== T.CONVEYOR && t !== T.ROAD) {
        c.buildings++;
        if (!e.powered && ((e.def && e.def.powerInput) || 0) > 0) c.dark.push(e);
      }
    }
    if (!c.cap) c.cap = (EntityDefs[T.WIRE] || {}).throughput || 85;
    return c;
  }

  // ── Rendering ────────────────────────────────────────────────────
  const row = (label, value, col = 'var(--text)', title = '') =>
    `<div class="ga-row"${title ? ` title="${esc(title)}"` : ''}><span>${label}</span><b style="color:${col}">${value}</b></div>`;
  const meter = (frac, col) =>
    `<div class="ga-meter"><i style="width:${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%;background:${col}"></i></div>`;
  const head = (text, right = '') => `<div class="ga-head"><span>${text}</span><em>${right}</em></div>`;
  const jump = e => { jumpList.push(e); return jumpList.length - 1; };
  const dur = hrs => hrs >= 24 ? `${(hrs / 24).toFixed(hrs % 24 ? 1 : 0)} day${hrs === 24 ? '' : 's'}`
                   : hrs >= 1 ? `${hrs.toFixed(hrs % 1 ? 1 : 0)} h` : `${Math.max(1, Math.round(hrs * 60))} min`;

  function verdict(g, c, cen) {
    const stress = cen.cap > 0 ? cen.load / cen.cap : 0;
    if (g <= 0.01 && c > 0.01) return ['bad', 'NO SUPPLY', `Nothing is generating here, and ${fp(c)} is being asked for.`];
    if (g < c - 0.05) return ['bad', 'SHORT OF POWER', `Demand is ${fp(c - g)} over supply. A network that cannot meet its demand powers nothing.`];
    if (stress >= 1) return ['bad', 'LINES OVERLOADED', `The lines are carrying ${fp(cen.load, 0)} against a ${fp(cen.cap, 0)} rating. Spans are tripping.`];
    if (stress >= 0.8) return ['warn', 'LINES RUNNING HOT', `Lines are at ${Math.round(stress * 100)}% of their rating; past 80% spans start to burn out and power is lost to congestion.`];
    const head = g > 0 ? (g - c) / g : 0;
    if (c > 0.01 && head < 0.1) return ['warn', 'THIN MARGIN', `Only ${fp(g - c)} (${Math.round(head * 100)}%) to spare. One cloud or one new customer tips it over.`];
    if (c <= 0.01) return ['dim', 'IDLE', 'Generating, with nothing drawing power.'];
    return ['good', 'HEALTHY', `${fp(g - c)} to spare, ${Math.round(head * 100)}% of what is being generated.`];
  }

  // What the player should look out for on this network, worst first. Each
  // tip says what is wrong (or about to be) and what would fix it, in the
  // game's own terms: [severity, text].
  function advice(g, c, cen, rated, w, srcs) {
    const tips = [];
    const add = (sev, text) => tips.push([sev, text]);
    const S = t => (cen.gens.get(t) || []).filter(e => !e._lightningDamaged).length * _ratedPeakOutput(t);
    const solar = S(T.SOLAR) + S(T.SOLAR2) + S(T.SOLAR3), wind = S(T.WIND) + S(T.WIND2) + S(T.WIND3);
    const stress = cen.cap > 0 ? cen.load / cen.cap : 0;
    const mk1 = PowerNetwork.protectionInfo ? PowerNetwork.protectionInfo(selNetId, 'mk1') : null;
    const perUnit = mk1 && mk1.capPerUnit ? ` Each Surge Protector MK1 adds ${fp(mk1.capPerUnit, 0)} to the rating.` : '';
    const storing = cen.stores.length > 0;
    const discharging = srcs.some(([k, v]) => k === 'storage' && v.w > 0.05);

    // Supply
    if (g < c - 0.05) add('bad', `Short by ${fp(c - g)}. Nothing on a network that cannot meet its demand gets power, so the whole network is dark until you add generation, add charged storage, or cut load off with a Circuit Switch.`);
    else if (c > 0.01 && g > 0 && (g - c) / g < 0.1) add('warn', `Only ${fp(g - c)} to spare. Build generation before you connect anything else here.`);
    if (discharging) add('warn', `Storage is covering a shortfall right now. Generation alone is not meeting demand, and the network goes dark when the reserve runs out.`);
    const struck = [...cen.gens.values()].reduce((n, l) => n + l.filter(e => e._lightningDamaged).length, 0);
    if (struck) add('bad', `${plural(struck, 'generator')} knocked out by lightning. Repair ${struck === 1 ? 'it' : 'them'} to get the output back (click the row under Generation to find ${struck === 1 ? 'it' : 'one'}).`);

    // Lines
    if (stress >= 1) add('bad', `Lines are over their ${fp(cen.cap, 0)} rating and spans are tripping.${perUnit} Or move some of this load onto a separate network.`);
    else if (stress >= 0.8) add('bad', `Lines are at ${Math.round(stress * 100)}% of their rating. Past 80% spans can burn out and generation is lost to congestion.${perUnit}`);
    else if (stress >= 0.65) add('warn', `Lines are at ${Math.round(stress * 100)}% of their rating, with ${fp(cen.cap * 0.8 - cen.load, 0)} of room before they start burning out. Add surge protection before this network grows.${perUnit}`);
    if (!cen.prot.size && cen.wires > 0) add('info', `No surge protection. Storms fault these wires at full risk, and the lines carry only the bare ${fp(cen.cap, 0)} rating.`);

    // What the supply depends on
    if (rated > 0 && solar / rated >= 0.5) add(storing ? 'info' : 'warn', storing
      ? `${Math.round(solar / rated * 100)}% of the rated generation here is solar, which makes nothing at night. Check the storage holds enough to carry the night.`
      : `${Math.round(solar / rated * 100)}% of the rated generation here is solar and there is no storage. Supply collapses at dusk: add a Substation or Battery Block, or a plant that runs at night.`);
    else if (rated > 0 && (solar + wind) / rated >= 0.7) add('info', `${Math.round((solar + wind) / rated * 100)}% of rated generation is wind and solar. A calm night gives almost nothing; storage or a fuelled plant covers it.`);
    const biggest = srcs.filter(([k]) => k !== 'storage' && k !== 'congestion').sort((a, b) => b[1].w - a[1].w)[0];
    if (biggest && g > 0 && biggest[1].count === 1 && biggest[1].w / g >= 0.6 && c > 0.01)
      add('info', `One ${esc((EntityDefs[biggest[0]] || {}).label || biggest[0])} is giving ${Math.round(biggest[1].w / g * 100)}% of the supply. If it stops, so does most of this network.`);

    // Storage
    if (storing) {
      let kwh = 0, capK = 0;
      for (const e of cen.stores) { const d = e.def || {}; kwh += (d.ratedKWh || 0) * (d.capacity ? (e.charge || 0) / d.capacity : 0); capK += d.ratedKWh || 0; }
      if (capK > 0 && kwh / capK < 0.2 && discharging) add('bad', `Storage is down to ${Math.round(kwh / capK * 100)}% and still draining.`);
    }

    // Customers
    if (cen.dark.length && g >= c - 0.05 && g > 0.01)
      add('warn', `${plural(cen.dark.length, 'building')} on this network ${cen.dark.length === 1 ? 'is' : 'are'} dark although it has power: struck by lightning, or switched off at a Circuit Switch. See Without Power below.`);

    // What the window shows
    if (w && w.n >= 2) {
      if (w.shortFrac > 0 && g >= c - 0.05) add('warn', `It went short of power for ${dur(w.shortFrac * w.covered)} in the last ${dur(w.covered)} (shaded red on the chart). See what hour it happens: that is when it needs help.`);
      else if (w.shortFrac === 0 && w.minSur < w.peakC * 0.1 && w.peakC > 0.01 && (g - c) / Math.max(g, 1) >= 0.1)
        add('info', `The margin got as thin as ${fp(Math.max(0, w.minSur))} in the last ${dur(w.covered)}, though it is comfortable now. The tight hour will come round again.`);
      if (w.lowG < w.peakC - 0.05 && w.shortFrac === 0) add('info', `Supply has dipped to ${fp(w.lowG)} and demand has peaked at ${fp(w.peakC)} in this window. They did not coincide; if they do, it goes dark.`);
    }
    if (!tips.length && c > 0.01 && g > 0 && (g - c) / g >= 0.4) add('good', `Plenty to spare: this network could take about ${fp((g - c) * 0.8, 0)} more load as it stands.`);
    const rank = { bad: 0, warn: 1, info: 2, good: 3 };
    return tips.sort((a, b) => rank[a[0]] - rank[b[0]]);
  }

  // The Network Breakdown is what the Monitoring Station MK2 adds.
  const locked = () => typeof hasActiveMonitor2 === 'function' && !hasActiveMonitor2();
  const LOCK_MSG = 'The Network Breakdown needs a Monitoring Station MK2';

  function bodyHtml() {
    jumpList = [];
    if (locked()) {
      if (titleEl) titleEl.textContent = 'NETWORK BREAKDOWN';
      return `<div class="ga-empty">🔒 ${LOCK_MSG}.<br><br>It unlocks with a Research Station MK3 placed and a Monitoring Station on the grid. If you had one, it has been struck by lightning: repair it.</div>`;
    }
    const s = PowerNetwork.stats;
    const keys = networkKeys();
    const order = _gridNetworkOrder(s);
    // Resolve the chosen network again: its id may have moved since last time.
    selNetId = -1;
    for (const [id, k] of keys) if (k === selKey) { selNetId = id; break; }
    if (selNetId < 0 && order.length && selKey === null) { selNetId = order[0]; selKey = keys.get(selNetId) ?? null; }

    // The strip of networks to pick from.
    const tabs = order.map((id, i) => {
      const g = (s.genSources || []).find(n => n.netId === id), c = (s.conSources || []).find(n => n.netId === id);
      const short = (g ? g.supply : 0) < (c ? c.demand : 0) - 0.05;
      return `<button class="ga-tab${id === selNetId ? ' on' : ''}${short ? ' short' : ''}" data-ga-net="${id}">${esc(getNetworkDisplayName(id) || `NETWORK ${i + 1}`)}</button>`;
    }).join('');
    if (titleEl) titleEl.textContent = selNetId >= 0 ? (getNetworkDisplayName(selNetId) || 'NETWORK') : 'NETWORK BREAKDOWN';
    if (selNetId < 0) {
      return `<div class="ga-tabs">${tabs}</div><div class="ga-empty">${order.length
        ? 'That network is gone: it was removed, or joined into another. Pick one above.'
        : 'No power networks yet. Wire a generator to a customer and it will show up here.'}</div>`;
    }

    const gNet = (s.genSources || []).find(n => n.netId === selNetId);
    const cNet = (s.conSources || []).find(n => n.netId === selNetId);
    const g = gNet ? gNet.supply : 0, c = cNet ? cNet.demand : 0;
    const cen = census(selNetId);
    const [vc, vt, vx] = verdict(g, c, cen);
    const monitor = true;   // the window itself is the MK2's (see locked() below), so everything in it is on
    let html = `<div class="ga-tabs">${tabs}</div>
      <div class="ga-verdict ${vc}"><b>${vt}</b><span>${vx}</span></div>`;

    let rated = 0;
    for (const [type, list] of cen.gens) rated += list.filter(e => !e._lightningDamaged).length * _ratedPeakOutput(type);
    const w = windowStats(selKey);

    // ── Advice ──
    const tips = advice(g, c, cen, rated, monitor ? w : null, gNet ? [...gNet.sources] : []);
    html += `<div class="ga-sec">${head('WATCH OUT FOR', tips.length ? `${tips.length} thing${tips.length === 1 ? '' : 's'}` : '')}
      ${tips.length ? tips.map(([sev, text]) => `<div class="ga-tip ${sev}"><i></i><span>${text}</span></div>`).join('')
                    : `<div class="ga-tip good"><i></i><span>Nothing needs attention on this network right now.</span></div>`}
    </div>`;

    // ── Forecast ──
    {
      const fc = forecast(selKey, storeTank(cen.stores), c, rated);
      html += `<div class="ga-sec">${head('FORECAST', 'next 24 in-game hours')}`;
      if (!fc.ready) html += `<div class="ga-note">Needs ${FORECAST_NEEDS} in-game hours of history for this network to work from; ${fc.have > 0 ? dur(fc.have) : 'none'} recorded so far.</div>`;
      else {
        const h0 = Math.floor(DayNight.hour());
        html += `<div class="ga-strip">${fc.cells.map((v, i) => `<i class="${v < 0 ? 'sx' : 's' + v}" title="${String((h0 + i) % 24).padStart(2, '0')}:00 · ${v < 0 ? 'no history for this hour yet' : v === 2 ? 'dark' : v === 1 ? 'on storage' : 'covered'}"></i>`).join('')}</div>
          <div class="ga-strip-ax"><span>now</span><span>+6 h</span><span>+12 h</span><span>+18 h</span><span>+24 h</span></div>`;
        if (fc.darkAt !== null) {
          html += row('Goes dark at', `${clock(fc.darkAt)} · in ${dur(Math.max(0, (fc.darkAt - now()) / hourLen()))}`, '#ff6050');
          html += row('Dark for', dur(fc.darkHours), '#ff6050');
          if (fc.stores) html += row('Storage', fc.emptyAt !== null ? `Runs out at ${clock(fc.emptyAt)}` : 'Cannot pay out fast enough to cover the gap', '#ff6050');
          else html += row('Storage', 'None on this network', 'var(--text-dim)');
        } else {
          html += row('Outlook', 'Stays powered', '#50e890');
          if (fc.stores && fc.storeHours > 0) html += row('Leans on storage for', dur(fc.storeHours), '#ffe040');
          if (fc.stores && fc.lowFrac !== null) html += row('Lowest reserve', `${Math.round(fc.lowFrac * 100)}% at ${clock(fc.lowAt)}`, fc.lowFrac < 0.15 ? '#ffe040' : 'var(--text)');
          if (!fc.stores || fc.storeHours === 0) html += row('Tightest moment', `${fc.tight >= 0 ? '+' : '−'}${fp(Math.abs(fc.tight))} at ${clock(fc.tightAt)}`, fc.tight < c * 0.1 ? '#ffe040' : 'var(--text)');
        }
        if (fc.cells.includes(-1)) html += `<div class="ga-note">Grey hours have no history yet (${dur(fc.have)} of 24 recorded), so they are left out.</div>`;
        html += `<div class="ga-note">Plays the last day forward: same weather, demand ${fc.dScale > 1.03 ? `up ${Math.round((fc.dScale - 1) * 100)}%` : fc.dScale < 0.97 ? `down ${Math.round((1 - fc.dScale) * 100)}%` : 'as it was'} on yesterday${fc.stores ? `, storage timed at the current ${fc.speed}× game speed` : ''}.</div>`;
      }
      html += `</div>`;
    }

    // ── Balance ──
    const sur = g - c, surCol = sur > 0.05 ? '#40c060' : sur < -0.05 ? '#e04030' : 'var(--text-dim)';
    const top = Math.max(g, c, 1);
    html += `<div class="ga-sec">${head('BALANCE NOW')}
      <div class="ga-duel"><span>Supply</span>${meter(g / top, '#f0c040')}<b style="color:#f0c040">${fp(g)}</b></div>
      <div class="ga-duel"><span>Demand</span>${meter(c / top, '#ff9070')}<b style="color:#ff9070">${fp(c)}</b></div>
      ${row('Surplus', `${sur >= 0 ? '+' : '−'}${fp(Math.abs(sur))}`, surCol)}
      ${row('Rated generation', rated > 0 ? `${fp(rated, 0)} · running at ${Math.round(g / rated * 100)}%` : '—', 'var(--text)',
            'What every generator on this network would give flat out: full sun, full wind, fuelled.')}
    </div>`;

    // ── Lines ──
    const stress = cen.cap > 0 ? cen.load / cen.cap : 0;
    const sCol = stress >= 0.8 ? '#ff4040' : stress > 0.5 ? '#ffe040' : '#00d4ff';
    const protText = [[T.PROTECTOR, 'MK1'], [T.PROTECTOR2, 'MK2'], [T.PROTECTOR3, 'MK3']]
      .filter(([t]) => cen.prot.get(t)).map(([t, l]) => `${cen.prot.get(t)} × ${l}`).join(' · ') || 'None';
    const resist = PowerNetwork.faultResistance ? PowerNetwork.faultResistance(selNetId) : 1;
    html += `<div class="ga-sec">${head('LINES', `${plural(cen.wires, 'wire')} · ${plural(cen.poles, 'pole')} · ${plural(cen.towers, 'tower')}`)}
      <div class="ga-duel"><span>Load</span>${meter(stress, sCol)}<b style="color:${sCol}">${Math.round(stress * 100)}%</b></div>
      ${row('Carrying', `${fp(cen.load, 0)} of a ${fp(cen.cap, 0)} rating`, sCol, 'Every span on a network carries the network\'s whole demand. Surge protection raises the rating.')}
      ${row('Room before 80%', cen.cap * 0.8 - cen.load > 0 ? fp(cen.cap * 0.8 - cen.load, 0) : 'None', cen.cap * 0.8 - cen.load > 0 ? 'var(--text)' : '#ff4040',
            'How much more demand the lines take before spans start burning out.')}
      ${row('Surge protection', protText)}
      ${row('Storm fault risk', resist >= 0.999 ? 'Unprotected' : `${Math.round((1 - resist) * 100)}% lower than bare wire`, resist >= 0.999 ? 'var(--text-dim)' : '#50e890')}
    </div>`;

    if (!monitor) {
      return html + `<div class="ga-hint">Build a Monitoring Station for the generation, storage and consumption breakdown and the history.</div>`;
    }

    // ── History ──
    html += `<div class="ga-sec">${head('OVER TIME', 'in-game time')}
      <div class="ga-wins">${WINDOWS.map(([id, label]) => `<button class="ga-win${id === win ? ' on' : ''}" data-ga-win="${id}">${label}</button>`).join('')}</div>
      <div class="ga-chart-slot"></div>`;
    if (w.n < 2) html += `<div class="ga-note">Recording. History builds up as the game runs; nothing is recorded while paused.</div>`;
    else {
      const partial = w.covered < w.hours * 0.98;
      html += `${partial ? `<div class="ga-note">Only ${dur(w.covered)} recorded so far; the figures below cover that.</div>` : ''}
        <div class="ga-grid">
          ${row('Avg supply', fp(w.avgG), '#f0c040')}${row('Avg demand', fp(w.avgC), '#ff9070')}
          ${row('Lowest supply', fp(w.lowG))}${row('Peak demand', fp(w.peakC))}
          ${row('Tightest margin', `${w.minSur >= 0 ? '+' : '−'}${fp(Math.abs(w.minSur))}`, w.minSur < -0.05 ? '#e04030' : w.minSur < w.peakC * 0.1 ? '#ffe040' : '#40c060',
                'The smallest gap between supply and demand in this window. Negative means it went short.')}
          ${row('Time short of power', w.shortFrac > 0 ? `${dur(w.shortFrac * w.covered)} · ${(w.shortFrac * 100).toFixed(w.shortFrac < 0.1 ? 1 : 0)}%` : 'None', w.shortFrac > 0 ? '#e04030' : '#40c060')}
          ${row('Energy generated', `${Math.round(w.kWhG).toLocaleString('en-US')} kWh`)}${row('Energy used', `${Math.round(w.kWhC).toLocaleString('en-US')} kWh`)}
        </div>`;
    }
    html += `</div>`;

    // ── All time ──
    {
      const a = (wasAway ? allAway : allHome).get(selKey);
      const E = kws => { const k = kws / hourLen(); return k >= 1e6 ? `${(k / 1e6).toFixed(2)} GWh` : k >= 1000 ? `${(k / 1000).toFixed(k >= 1e5 ? 0 : 1)} MWh` : `${Math.round(k)} kWh`; };
      const grid = typeof Progression !== 'undefined' && Progression.totalWs ? E(Progression.totalWs) : null;
      html += `<div class="ga-sec">${head('ALL TIME', a ? `this network, recorded for ${dur(a.sec / hourLen())}` : '')}`;
      if (!a) html += `<div class="ga-note">Nothing recorded for this network yet.</div>`;
      else html += `<div class="ga-grid">
          ${row('Energy generated', E(a.eG), '#f0c040')}${row('Energy used', E(a.eC), '#ff9070')}
          ${row('Highest supply', fp(a.pG))}${row('Highest demand', fp(a.pC))}
          ${row('Time short of power', a.short > 0 ? `${dur(a.short / hourLen())} · ${(a.short / a.sec * 100).toFixed(a.short / a.sec < 0.1 ? 1 : 0)}%` : 'Never', a.short > 0 ? '#e04030' : '#40c060')}
          ${row('First recorded', `Day ${Math.floor(a.since / (hourLen() * 24)) + 1}`)}
        </div>`;
      if (grid && !wasAway) html += row('Whole grid, since the city was founded', `${grid} generated`, 'var(--text)', 'Every network together, from the first watt.');
      html += `</div>`;
    }

    // ── Generation ──
    const srcs = gNet ? [...gNet.sources] : [];
    const genRows = [];
    for (const [type, list] of cen.gens) {
      const live = (srcs.find(([k]) => k === type) || [null, { w: 0 }])[1].w;
      const ok = list.filter(e => !e._lightningDamaged).length, r = ok * _ratedPeakOutput(type);
      genRows.push({ type, list, live, rated: r, down: list.length - ok });
    }
    genRows.sort((a, b) => b.live - a.live || b.rated - a.rated);
    const extra = srcs.filter(([k]) => k === 'storage' || k === 'congestion');
    html += `<div class="ga-sec">${head('GENERATION', genRows.length ? 'click a row to find the next one' : '')}`;
    if (!genRows.length && !extra.length) html += `<div class="ga-note">No generators on this network.</div>`;
    for (const r of genRows) {
      const u = r.rated > 0 ? r.live / r.rated : 0;
      const idx = jump({ _gaType: r.type, _gaList: r.list });
      html += `<div class="ga-item" data-ga-jump="${idx}">
        <div class="ga-item-top"><span>${esc((EntityDefs[r.type] || {}).label || r.type)} <i>×${r.list.length}</i>${r.down ? ` <u>${r.down} struck</u>` : ''}</span>
          <b>${fp(r.live)} <i>/ ${fp(r.rated, 0)}</i></b></div>
        <div class="ga-item-bar">${meter(u, '#ffe080')}<em>${Math.round(u * 100)}% · ${g > 0 ? Math.round(Math.max(0, r.live) / g * 100) : 0}% of supply</em></div></div>`;
    }
    for (const [k, v] of extra) html += row(k === 'storage' ? 'Storage discharge' : 'Lost to line congestion',
      `${v.w < 0 ? '−' : '+'}${fp(Math.abs(v.w))}`, v.w < 0 ? '#e05040' : '#f0c040');
    html += `</div>`;

    // ── Storage ──
    if (cen.stores.length) {
      let kwh = 0, capK = 0;
      for (const e of cen.stores) { kwh += (e.def && e.def.ratedKWh || 0) * (e.def && e.def.capacity ? (e.charge || 0) / e.def.capacity : 0); capK += (e.def && e.def.ratedKWh) || 0; }
      const frac = capK > 0 ? kwh / capK : 0;
      const charging = cen.stores.filter(e => e.charging).length;
      html += `<div class="ga-sec">${head('STORAGE', plural(cen.stores.length, 'unit'))}
        <div class="ga-duel"><span>Charge</span>${meter(frac, frac > 0.5 ? '#40c060' : frac > 0.2 ? '#ffe040' : '#e04030')}<b>${Math.round(frac * 100)}%</b></div>
        ${row('Held', `${Math.round(kwh).toLocaleString('en-US')} of ${Math.round(capK).toLocaleString('en-US')} kWh`)}
        ${row('State', extra.some(([k, v]) => k === 'storage' && v.w > 0.05) ? 'Discharging to cover a shortfall' : charging ? `Charging (${charging} of ${cen.stores.length})` : 'Standing by',
              extra.some(([k, v]) => k === 'storage' && v.w > 0.05) ? '#f0c040' : charging ? '#40c060' : 'var(--text-dim)')}
      </div>`;
    }

    // ── Consumption ──
    const ents = cNet ? (cNet.entities || []) : [];
    const cats = new Map();
    for (const e of ents) { const k = category(e.type), o = cats.get(k) || { w: 0, n: 0 }; o.w += e._liveDemand || 0; o.n++; cats.set(k, o); }
    html += `<div class="ga-sec">${head('CONSUMPTION', `${plural(cen.buildings, 'building')} on the network`)}`;
    if (!cats.size) html += `<div class="ga-note">Nothing is drawing power.</div>`;
    for (const [k, o] of [...cats].sort((a, b) => b[1].w - a[1].w)) {
      html += `<div class="ga-item still"><div class="ga-item-top"><span>${k} <i>×${o.n}</i></span><b>${fp(o.w)}</b></div>
        <div class="ga-item-bar">${meter(c > 0 ? o.w / c : 0, '#ff9070')}<em>${c > 0 ? Math.round(o.w / c * 100) : 0}% of demand</em></div></div>`;
    }
    const big = [...ents].sort((a, b) => (b._liveDemand || 0) - (a._liveDemand || 0)).slice(0, 8).filter(e => (e._liveDemand || 0) > 0);
    if (big.length) {
      html += `<div class="ga-sub">BIGGEST DRAWS</div>`;
      for (const e of big) html += `<div class="ga-line" data-ga-jump="${jump(e)}"><span>${esc(nameOf(e))}</span><b>${fp(e._liveDemand)} <i>${c > 0 ? Math.round(e._liveDemand / c * 100) : 0}%</i></b></div>`;
    }
    if (cen.dark.length) {
      html += `<div class="ga-sub bad">WITHOUT POWER · ${cen.dark.length}</div>`;
      for (const e of cen.dark.slice(0, 8)) html += `<div class="ga-line" data-ga-jump="${jump(e)}"><span>${esc(nameOf(e))}</span><b style="color:#ff5555">${e._lightningDamaged ? 'struck' : 'dark'}</b></div>`;
      if (cen.dark.length > 8) html += `<div class="ga-note">and ${cen.dark.length - 8} more.</div>`;
    }
    return html + `</div>`;
  }

  // Supply and demand across the window, drawn into the one canvas that
  // outlives every rebuild of the body.
  function drawChart() {
    const slot = bodyEl && bodyEl.querySelector('.ga-chart-slot');
    if (!slot) { if (chartEl) chartEl.style.display = 'none'; return; }
    if (chartEl.parentNode !== slot) slot.appendChild(chartEl);
    chartEl.style.display = 'block';
    const dpr = window.devicePixelRatio || 1, W = slot.clientWidth || 480, H = 96;
    if (chartEl.width !== Math.round(W * dpr) || chartEl.height !== Math.round(H * dpr)) { chartEl.width = Math.round(W * dpr); chartEl.height = Math.round(H * dpr); }
    chartEl.style.width = W + 'px'; chartEl.style.height = H + 'px';
    const x = chartEl.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, W, H);
    const w = windowStats(selKey), h = w.h;
    const L = 4, R = W - 4, Tp = 6, B = H - 16;
    x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const gx = L + (R - L) * k / 4; x.beginPath(); x.moveTo(gx + 0.5, Tp); x.lineTo(gx + 0.5, B); x.stroke(); }
    x.beginPath(); x.moveTo(L, B + 0.5); x.lineTo(R, B + 0.5); x.stroke();
    x.fillStyle = 'rgba(255,255,255,0.4)'; x.font = '9px monospace'; x.textBaseline = 'top';
    for (let k = 0; k <= 4; k++) {
      const ago = w.hours * (1 - k / 4);
      x.textAlign = k === 0 ? 'left' : k === 4 ? 'right' : 'center';
      x.fillText(k === 4 ? 'now' : `-${dur(ago)}`, L + (R - L) * k / 4, B + 4);
    }
    if (!h || w.n < 2) return;
    let top = 1; for (let k = w.idx0; k < h.t.length; k++) top = Math.max(top, h.g[k], h.c[k]);
    top *= 1.08;
    const X = t => L + (R - L) * (t - w.t0) / (w.t1 - w.t0), Y = v => B - (B - Tp) * v / top;
    // Shade the stretches where supply fell short.
    x.fillStyle = 'rgba(224,64,48,0.28)';
    for (let k = w.idx0; k < h.t.length - 1; k++) if (h.g[k] < h.c[k] - 0.05) x.fillRect(X(h.t[k]), Tp, Math.max(1, X(h.t[k + 1]) - X(h.t[k])), B - Tp);
    const line = (arr, col, fill) => {
      x.beginPath();
      for (let k = w.idx0; k < h.t.length; k++) { const px = X(h.t[k]), py = Y(arr[k]); k === w.idx0 ? x.moveTo(px, py) : x.lineTo(px, py); }
      if (fill) { x.lineTo(X(h.t[h.t.length - 1]), B); x.lineTo(X(h.t[w.idx0]), B); x.closePath(); x.fillStyle = fill; x.fill(); return; }
      x.strokeStyle = col; x.lineWidth = 1.6; x.lineJoin = 'round'; x.stroke();
    };
    line(h.g, null, 'rgba(240,192,64,0.10)');
    line(h.g, '#f0c040'); line(h.c, '#ff9070');
    x.textAlign = 'left'; x.textBaseline = 'top'; x.fillStyle = 'rgba(255,255,255,0.4)';
    x.fillText(fp(top / 1.08, 0), L + 2, Tp);
  }

  function render(force) {
    if (!root || !root.classList.contains('open')) return;
    if (!force && bodyEl.matches(':hover') && performance.now() - (render._at || 0) < 1500) { drawChart(); return; }   // let a click land
    const html = bodyHtml();
    if (force || html !== lastHtml) {
      const st = bodyEl.scrollTop;
      if (chartEl.parentNode) chartEl.parentNode.removeChild(chartEl);
      bodyEl.innerHTML = html; lastHtml = html;
      bodyEl.scrollTop = st;
      render._at = performance.now();
    }
    drawChart();
  }

  // ── The window itself ────────────────────────────────────────────
  // Styles go in at load, not on first open: the openers in the GRID panel
  // and the entity panel are on screen before the window has ever been built.
  (function styles() {
    const css = document.createElement('style');
    css.textContent = `
      #grid-analyzer { position:fixed; top:58px; left:50%; transform:translateX(-50%); width:min(540px, calc(100vw - 16px));
        max-height:calc(100vh - 76px); display:none; flex-direction:column; z-index:120; pointer-events:all;
        background:rgba(8,12,20,0.97); border:1px solid rgba(128,200,255,0.28); border-radius:8px;
        box-shadow:0 12px 40px rgba(0,0,0,0.6); color:var(--text, #d8e4f0); font-size:10px; letter-spacing:0.4px; }
      #grid-analyzer.open { display:flex; }
      #grid-analyzer .ga-bar { display:flex; align-items:center; gap:8px; padding:9px 12px; border-bottom:1px solid rgba(255,255,255,0.08); cursor:default; }
      #grid-analyzer .ga-bar small { color:#80c8ff; letter-spacing:1.6px; font-size:9px; }
      #grid-analyzer .ga-bar b { flex:1; font-size:12px; letter-spacing:1px; text-transform:uppercase; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      #grid-analyzer .ga-bar button, #grid-analyzer .ga-tab, #grid-analyzer .ga-win { font:inherit; color:inherit; cursor:pointer;
        background:rgba(255,255,255,0.04); border:1px solid rgba(128,200,255,0.22); border-radius:4px; padding:4px 9px; }
      #grid-analyzer .ga-bar button:hover, #grid-analyzer .ga-tab:hover, #grid-analyzer .ga-win:hover { border-color:rgba(128,200,255,0.6); }
      #grid-analyzer .ga-body { overflow-y:auto; overscroll-behavior:contain; padding:8px 12px 12px; }
      #grid-analyzer .ga-body::-webkit-scrollbar { width:5px; } #grid-analyzer .ga-body::-webkit-scrollbar-thumb { background:rgba(128,200,255,0.3); border-radius:3px; }
      #grid-analyzer .ga-tabs { display:flex; gap:5px; overflow-x:auto; padding-bottom:6px; } #grid-analyzer .ga-tabs::-webkit-scrollbar { height:3px; }
      #grid-analyzer .ga-tab { flex:none; font-size:9px; text-transform:uppercase; white-space:nowrap; }
      #grid-analyzer .ga-tab.short { border-color:rgba(224,64,48,0.7); color:#ff8070; }
      #grid-analyzer .ga-tab.on, #grid-analyzer .ga-win.on { background:rgba(64,255,204,0.14); border-color:#40ffcc; color:#40ffcc; }
      #grid-analyzer .ga-verdict { display:flex; flex-direction:column; gap:3px; padding:8px 10px; border-radius:5px; margin:2px 0 4px; border-left:3px solid; background:rgba(255,255,255,0.04); }
      #grid-analyzer .ga-verdict b { letter-spacing:1.6px; font-size:11px; } #grid-analyzer .ga-verdict span { color:var(--text-dim, #8a9aac); line-height:1.45; }
      #grid-analyzer .ga-verdict.good { border-color:#40c060; } #grid-analyzer .ga-verdict.good b { color:#50e890; }
      #grid-analyzer .ga-verdict.warn { border-color:#ffe040; } #grid-analyzer .ga-verdict.warn b { color:#ffe040; }
      #grid-analyzer .ga-verdict.bad  { border-color:#e04030; background:rgba(224,64,48,0.10); } #grid-analyzer .ga-verdict.bad b { color:#ff6050; }
      #grid-analyzer .ga-verdict.dim  { border-color:#5a6878; } #grid-analyzer .ga-verdict.dim b { color:var(--text-dim, #8a9aac); }
      #grid-analyzer .ga-sec { padding-top:8px; }
      #grid-analyzer .ga-strip { display:grid; grid-template-columns:repeat(24, 1fr); gap:2px; margin:3px 0 2px; }
      #grid-analyzer .ga-strip i { height:14px; border-radius:2px; background:#2f8a52; } #grid-analyzer .ga-strip i.s1 { background:#d8b830; } #grid-analyzer .ga-strip i.s2 { background:#e04030; } #grid-analyzer .ga-strip i.sx { background:rgba(255,255,255,0.10); }
      #grid-analyzer .ga-strip-ax { display:flex; justify-content:space-between; color:var(--text-dim, #8a9aac); font-size:9px; margin-bottom:4px; }
      #grid-analyzer .ga-tip { display:flex; gap:8px; padding:4px 0; line-height:1.45; } #grid-analyzer .ga-tip span { flex:1; }
      #grid-analyzer .ga-tip i { flex:none; width:7px; height:7px; border-radius:50%; margin-top:4px; background:#80c8ff; }
      #grid-analyzer .ga-tip.bad i { background:#ff5040; box-shadow:0 0 6px #ff5040; } #grid-analyzer .ga-tip.bad span { color:#ffb0a4; }
      #grid-analyzer .ga-tip.warn i { background:#ffe040; } #grid-analyzer .ga-tip.good i { background:#40c060; }
      #grid-analyzer .ga-tip.info span, #grid-analyzer .ga-tip.good span { color:var(--text-dim, #8a9aac); }
      #grid-analyzer .ga-head { display:flex; justify-content:space-between; align-items:baseline; color:#80c8ff; letter-spacing:1.6px; font-size:9px;
        padding-bottom:4px; margin-bottom:4px; border-bottom:1px solid rgba(255,255,255,0.08); }
      #grid-analyzer .ga-head em { font-style:normal; color:var(--text-dim, #8a9aac); letter-spacing:0.4px; }
      #grid-analyzer .ga-row { display:flex; justify-content:space-between; gap:10px; padding:2px 0; } #grid-analyzer .ga-row span { color:var(--text-dim, #8a9aac); }
      #grid-analyzer .ga-row b { font-weight:500; text-align:right; }
      #grid-analyzer .ga-duel { display:flex; align-items:center; gap:8px; padding:2px 0; } #grid-analyzer .ga-duel span { width:52px; color:var(--text-dim, #8a9aac); }
      #grid-analyzer .ga-duel b { width:78px; text-align:right; font-weight:500; } #grid-analyzer .ga-duel .ga-meter { flex:1; }
      #grid-analyzer .ga-meter { height:5px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden; } #grid-analyzer .ga-meter i { display:block; height:100%; border-radius:3px; opacity:0.75; }
      #grid-analyzer .ga-grid { display:grid; grid-template-columns:1fr 1fr; column-gap:18px; }
      #grid-analyzer .ga-wins { display:flex; gap:5px; margin:2px 0 6px; } #grid-analyzer .ga-win { font-size:9px; flex:1; }
      #grid-analyzer .ga-chart-slot { margin-bottom:4px; }
      #grid-analyzer .ga-note, #grid-analyzer .ga-hint, #grid-analyzer .ga-empty { color:var(--text-dim, #8a9aac); padding:3px 0; line-height:1.45; }
      #grid-analyzer .ga-hint { color:#40ffcc; font-style:italic; padding-top:10px; } #grid-analyzer .ga-empty { padding:18px 0; text-align:center; }
      #grid-analyzer .ga-item { padding:3px 4px; margin:0 -4px; border-radius:3px; cursor:pointer; } #grid-analyzer .ga-item.still { cursor:default; }
      #grid-analyzer .ga-item:not(.still):hover, #grid-analyzer .ga-line:hover { background:rgba(255,255,255,0.07); }
      #grid-analyzer .ga-item-top { display:flex; justify-content:space-between; } #grid-analyzer .ga-item-top b { font-weight:500; color:#f0c040; }
      #grid-analyzer .ga-item.still .ga-item-top b { color:#ff9070; }
      #grid-analyzer .ga-item i, #grid-analyzer .ga-line i { font-style:normal; color:var(--text-dim, #8a9aac); font-weight:400; }
      #grid-analyzer .ga-item u { text-decoration:none; color:#ff6050; margin-left:4px; }
      #grid-analyzer .ga-item-bar { display:flex; align-items:center; gap:8px; margin-top:3px; } #grid-analyzer .ga-item-bar .ga-meter { flex:1; height:3px; }
      #grid-analyzer .ga-item-bar em { font-style:normal; color:var(--text-dim, #8a9aac); font-size:9px; width:150px; text-align:right; }
      #grid-analyzer .ga-sub { color:var(--text-dim, #8a9aac); letter-spacing:1.4px; font-size:9px; padding:8px 0 3px; } #grid-analyzer .ga-sub.bad { color:#ff8070; }
      #grid-analyzer .ga-line { display:flex; justify-content:space-between; padding:2px 4px; margin:0 -4px; border-radius:3px; cursor:pointer; } #grid-analyzer .ga-line b { font-weight:500; }
      .ga-open-btn { width:100%; margin:8px 0 2px; font-size:9px; letter-spacing:1.5px; padding:8px 0; border:1px solid #1a4a66; border-radius:2px; background:#06182a; color:#7ad8ff; cursor:pointer; }
      .ga-open-btn:hover { border-color:#3a8ab8; }
      .gp-net-detail { cursor:pointer; opacity:0.55; margin-left:6px; } .gp-net-detail:hover { opacity:1; color:#ffd070; }
    `;
    document.head.appendChild(css);
  })();

  function build() {
    root = document.createElement('div');
    root.id = 'grid-analyzer';
    root.innerHTML = `<div class="ga-bar"><small>⚡ NETWORK BREAKDOWN</small><b></b><button data-ga-close title="Close (Esc)">✕</button></div><div class="ga-body"></div>`;
    document.body.appendChild(root);
    titleEl = root.querySelector('.ga-bar b');
    bodyEl  = root.querySelector('.ga-body');
    chartEl = document.createElement('canvas');
    // mousedown, not click: the body is rebuilt as the numbers move, so the
    // element under the cursor at mouseup may not be the one that was pressed.
    root.addEventListener('mousedown', ev => {
      ev.stopPropagation();
      if (ev.button !== 0) return;
      const t = ev.target;
      if (t.closest('[data-ga-close]')) { close(); return; }
      const tab = t.closest('[data-ga-net]');
      if (tab) { ev.preventDefault(); select(+tab.getAttribute('data-ga-net')); return; }
      const wb = t.closest('[data-ga-win]');
      if (wb) { ev.preventDefault(); win = wb.getAttribute('data-ga-win'); try { localStorage.setItem(WINDOW_KEY, win); } catch (_e) {} render(true); return; }
      const j = t.closest('[data-ga-jump]');
      if (j) { ev.preventDefault(); goTo(jumpList[+j.getAttribute('data-ga-jump')]); }
    });
    for (const type of ['wheel', 'mouseup', 'click', 'dblclick', 'contextmenu']) root.addEventListener(type, ev => ev.stopPropagation());
    window.addEventListener('keydown', ev => {
      if (ev.key !== 'Escape' || !isOpen()) return;
      ev.stopImmediatePropagation(); ev.preventDefault(); close();
    }, true);
    window.addEventListener('resize', () => { if (isOpen()) drawChart(); });
  }

  function goTo(target) {
    if (!target) return;
    let e = target;
    if (target._gaList) {                                  // a generator row: walk round its units
      const n = cycle.get(target._gaType) || 0;
      e = target._gaList[n % target._gaList.length];
      cycle.set(target._gaType, n + 1);
    }
    if (!e) return;
    try { Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE); } catch (_e) {}
    try { if (typeof EntityInfoPanel !== 'undefined' && EntityInfoPanel.open) EntityInfoPanel.open(e); } catch (_e) {}
    try { SFX.click?.(); } catch (_e) {}
  }

  function select(netId) {
    selKey = networkKeys().get(netId) ?? null;
    selNetId = netId; cycle = new Map();
    if (bodyEl) bodyEl.scrollTop = 0;
    render(true);
  }
  const isOpen = () => !!root && root.classList.contains('open');
  function open(netId) {
    if (locked()) {
      if (typeof showToast === 'function') showToast(`🔒 ${LOCK_MSG}`, '#ffd070', '#181204', '#604a10');
      return;
    }
    if (!root) build();
    root.classList.add('open');
    if (netId !== undefined && netId !== null && netId >= 0) select(netId);
    else { if (selKey === null) { const o = _gridNetworkOrder(); if (o.length) selKey = networkKeys().get(o[0]) ?? null; } render(true); }
    clearInterval(timer);
    timer = setInterval(() => render(false), 500);
    try { SFX.click?.(); } catch (_e) {}
  }
  function close() {
    if (!root) return;
    root.classList.remove('open');
    clearInterval(timer);
  }

  // Openers elsewhere are rebuilt every tick (the entity panel, the GRID
  // panel's lists), so they are caught here by attribute, on press.
  document.addEventListener('mousedown', ev => {
    if (ev.button !== 0 || !ev.target.closest) return;
    const a = ev.target.closest('[data-open-gridnet]');
    if (!a) return;
    ev.preventDefault(); ev.stopPropagation();
    const v = a.getAttribute('data-open-gridnet');
    open(v === '' ? undefined : +v);
  }, true);

  return {
    tick, open, close, isOpen, toggle: netId => (isOpen() ? close() : open(netId)),
    // Read-only: a network's recorded samples over the last `hours`, and how
    // many hours they actually cover. The engineering audit reads a day's
    // peak demand and tightest margin off these (Advisor.meridianPower).
    samples(netId, hours) {
      const key = networkKeys().get(netId), h = key !== undefined ? hist.get(key) : null;
      if (!h || !h.t.length) return null;
      const t1 = now(), t0 = t1 - hours * hourLen();
      let i = h.t.length; while (i > 0 && h.t[i - 1] >= t0) i--;
      if (i >= h.t.length) return null;
      return { t: h.t.slice(i), g: h.g.slice(i), c: h.c.slice(i), o: h.o.slice(i), covered: (t1 - h.t[i]) / hourLen() };
    },
    reset() { clearWarnings(); hist.clear(); allHome.clear(); allAway.clear(); lastSampleAt = -1; settleFrom = Infinity; wasAway = false; selKey = null; close(); },
    // The home grid's all-time totals and its recorded history, for the save.
    // History goes in as [key, first t, t deltas in tenths of a second, g, c,
    // o, r to a tenth of a kW]; a job site's is never saved.
    serialise() {
      const t = now(), nets = [], hs = [];
      for (const [k, a] of allHome) if (t - a.last < FORGET_HOURS * hourLen())
        nets.push([k, Math.round(a.since), Math.round(a.last), Math.round(a.sec), Math.round(a.eG), Math.round(a.eC), +a.pG.toFixed(1), +a.pC.toFixed(1), Math.round(a.short)]);
      const r1 = v => Math.round(v * 10) / 10;
      if (!wasAway) for (const [k, h] of hist) {
        if (!h.t.length) continue;
        // Deltas between the rounded times, so rounding never adds up into drift.
        const tq = h.t.map(v => Math.round(v * 10)), dt = tq.map((v, i) => i ? v - tq[i - 1] : 0);
        hs.push([k, tq[0] / 10, dt, h.g.map(r1), h.c.map(r1), h.o.map(r1), h.r.map(r1)]);
      }
      return { v: 2, nets, hist: hs };
    },
    loadState(d) {
      clearWarnings();
      hist.clear(); allHome.clear(); allAway.clear(); lastSampleAt = -1; settleFrom = Infinity; wasAway = false; selKey = null;
      for (const n of (d && d.nets) || []) {
        if (!Array.isArray(n) || n.length < 9) continue;
        allHome.set(n[0], { since: +n[1] || 0, last: +n[2] || 0, sec: +n[3] || 0, eG: +n[4] || 0, eC: +n[5] || 0, pG: +n[6] || 0, pC: +n[7] || 0, short: +n[8] || 0 });
      }
      for (const n of (d && d.hist) || []) {
        if (!Array.isArray(n) || n.length < 7 || !Array.isArray(n[2])) continue;
        const len = n[2].length;
        if (!len || [3, 4, 5, 6].some(i => !Array.isArray(n[i]) || n[i].length !== len)) continue;
        const ts = []; let tq = Math.round((+n[1] || 0) * 10);
        for (let i = 0; i < len; i++) { if (i) tq += +n[2][i] || 0; ts.push(tq / 10); }
        hist.set(n[0], { t: ts, g: n[3].map(Number), c: n[4].map(Number), o: n[5].map(Number), r: n[6].map(Number) });
      }
    },
    // The button a conductor's info panel shows (rebuilt each tick, hence the attribute).
    locked,
    buttonFor(netId) {
      const b = document.createElement('button');
      b.className = 'ga-open-btn'; b.textContent = locked() ? '🔒 NETWORK BREAKDOWN · NEEDS MONITORING STATION MK2' : '⚡ NETWORK BREAKDOWN';
      if (locked()) b.style.opacity = '0.55';
      b.setAttribute('data-open-gridnet', String(netId));
      return b;
    },
  };
})();
