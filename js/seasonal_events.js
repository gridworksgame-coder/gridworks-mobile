/* ═══════════════════════════════════════════════════════════════════
   SEASONAL EVENTS
   The town's calendar: festivals, rushes and the odd natural hazard,
   three per season (drawn from that season's five or six), each on a day of its own.

   Weather (weather_events.js) is the sky doing things to the grid. These
   are the PEOPLE doing things to it: a spring fair that has every shop on
   the square lit late, an exam season with the schools open till ten, a
   festival of lights in the dark of winter. Each one:

     • is announced a day ahead, so there is time to line up supply
     • pulls harder on the buildings it involves while it runs
       (power_network.js reads demandMult per consumer)
     • carries a pledge: keep every one of those buildings lit for the
       whole event and the town pays a bonus, sized off what those same
       buildings pay you, so it stays worth having in the late game
     • sometimes brings weather of its own (gales, a cold snap)

   Home only. On a contract site the calendar is frozen with the rest of
   the home city (game_loop.js does not tick it while away), and DayNight
   holds the site's clock there, which is not home's.
   ═══════════════════════════════════════════════════════════════════ */

const SeasonalEvents = (() => {

  // Who an effect or pledge is about. `homes` is a plain house (no
  // subtype); `subs` match a building's commercialSubtype whatever its type.
  const CUSTOMER = () => [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL];
  function matches(sel, e) {
    if (!sel || !e) return false;
    if (sel.homes && e.type === T.HOUSE && !e.commercialSubtype) return true;
    if (sel.shops && e.type === T.COMMERCIAL) return true;
    if (sel.industry && e.type === T.INDUSTRIAL) return true;
    if (sel.lamps && e.type === T.LAMP) return true;
    if (sel.subs && e.commercialSubtype && sel.subs.includes(e.commercialSubtype)) return true;
    return false;
  }

  // ── The calendar ─────────────────────────────────────────────────
  //
  //   start   hour of the day it begins      hours   how long it runs
  //   effects [{ sel, mult }]                 pledge  who has to stay lit
  //   weather a weather event it brings (only if the sky is quiet)
  //   weatherLabel  what the panels call that weather, if not its own name
  //   noRain  no rain for the whole event: rain already falling is ended,
  //           and EventSystem holds its rain timers off until it is over
  const NIGHTLIFE = ['venue', 'stadium', 'nightclub', 'jazzbar', 'disco', 'superclub', 'supperclub', 'holoarena', 'skycasino', 'bowling'];
  const FOOD      = ['restaurant', 'finedining', 'fastfood', 'donutshop', 'hotdog', 'pizzeria', 'cafe', 'bakery'];
  const HOTELS    = ['hotel', 'motel', 'resorthotel', 'boutiquehotel', 'marina', 'hotsprings'];
  const FARMS     = ['vineyard', 'verticalfarm', 'glasshouse', 'cannery', 'fertilizer', 'bottling', 'fishhatchery'];
  const RETAIL    = ['mall', 'galleria', 'arcade', 'clothing', 'cardealer', 'cornerstore', 'grocery', 'pharmacy'];
  const CHILLED   = ['coldstorage', 'coldchain', 'grocery', 'cornerstore', 'icerink', 'aquarium'];
  const LEARNING  = ['school', 'library', 'sciencemuseum'];

  const EVENTS = [
    // ── Spring ──
    { id: 'springfair', season: 0, icon: '🎡', name: 'Spring Fair', start: 10, hours: 11,
      blurb: 'Stalls and rides on the square: shops and eateries trade late.',
      effects: [{ sel: { shops: true }, mult: 1.35 }, { sel: { subs: ['amusementpark', 'pavilion', ...FOOD] }, mult: 1.3 }],
      pledge: { sel: { shops: true }, what: 'every shop and business' } },
    { id: 'exams', season: 0, icon: '📚', name: 'Exam Season', start: 7, hours: 15,
      blurb: 'Schools and libraries stay open late for revision.',
      effects: [{ sel: { subs: LEARNING }, mult: 1.7 }, { sel: { homes: true }, mult: 1.05 }],
      pledge: { sel: { subs: LEARNING }, what: 'every school and library' } },
    { id: 'planting', season: 0, icon: '🌱', name: 'Planting Season', start: 5, hours: 20,
      blurb: 'Farms, greenhouses and canneries run flat out to get the year in.',
      effects: [{ sel: { subs: FARMS }, mult: 1.5 }],
      pledge: { sel: { subs: FARMS }, what: 'every farm and food plant' } },
    { id: 'springclean', season: 0, icon: '🧹', name: 'Spring Cleaning Weekend', start: 8, hours: 12,
      blurb: 'Every washing machine and vacuum in town is running.',
      effects: [{ sel: { homes: true }, mult: 1.2 }],
      pledge: { sel: { homes: true }, what: 'every home' } },
    { id: 'springfloods', season: 0, icon: '🌊', name: 'Spring Floods', start: 3, hours: 10, hazard: true,
      blurb: 'Meltwater and heavy rain: the river is up and the storm drains are pumping.',
      weather: 'rainstorm',
      effects: [{ sel: { subs: ['watertreat', 'desal'] }, mult: 1.6 }, { sel: { homes: true }, mult: 1.1 }],
      pledge: { sel: { homes: true }, what: 'every home through the floods' } },

    // ── Summer ──
    { id: 'musicfest', season: 1, icon: '🎶', name: 'Summer Music Festival', start: 16, hours: 10,
      blurb: 'Three stages and a late licence. Half the town is out; the other half is at the bars.',
      effects: [{ sel: { subs: [...NIGHTLIFE, 'amusementpark', 'waterpark'] }, mult: 1.8 }, { sel: { subs: FOOD }, mult: 1.3 }, { sel: { homes: true }, mult: 0.9 }],
      pledge: { sel: { shops: true }, what: 'every venue, shop and bar' } },
    { id: 'tourists', season: 1, icon: '🏖', name: 'Tourist Peak', start: 8, hours: 24,
      blurb: 'Every room in town is booked and the air conditioning never stops.',
      effects: [{ sel: { subs: HOTELS }, mult: 1.5 }, { sel: { subs: FOOD }, mult: 1.3 }],
      pledge: { sel: { subs: [...HOTELS, ...FOOD] }, what: 'every hotel and restaurant' } },
    { id: 'icecream', season: 1, icon: '🍦', name: 'Cold Chain Crunch', start: 11, hours: 9,
      blurb: 'The hottest week of the year: fridges, freezers and the ice rink are working hard.',
      effects: [{ sel: { subs: CHILLED }, mult: 1.4 }],
      pledge: { sel: { subs: CHILLED }, what: 'every cold store and grocer' } },
    { id: 'midsummer', season: 1, icon: '🔥', name: 'Midsummer Night', start: 19, hours: 7,
      blurb: 'Bonfires, street parties and every lamp in town lit till dawn.',
      effects: [{ sel: { lamps: true }, mult: 1.5 }, { sel: { subs: [...NIGHTLIFE, ...FOOD] }, mult: 1.4 }],
      pledge: { sel: { shops: true }, what: 'every business on the night' } },
    { id: 'dryspell', season: 1, icon: '🌵', name: 'Dry Spell', start: 10, hours: 12, hazard: true,
      blurb: 'Weeks without rain: the heat builds and the water plants run hot.',
      weather: 'heatwave', noRain: true,
      effects: [{ sel: { subs: ['watertreat', 'desal'] }, mult: 1.5 }],
      pledge: { sel: { homes: true }, what: 'every home through the heat' } },

    // ── Autumn ──
    { id: 'harvest', season: 2, icon: '🌾', name: 'Harvest Festival', start: 6, hours: 18,
      blurb: 'The harvest is in: canneries, mills and bakeries work round the clock.',
      effects: [{ sel: { subs: [...FARMS, 'bakery', 'grocery', 'sawmill'] }, mult: 1.5 }],
      pledge: { sel: { industry: true }, what: 'every factory and plant' } },
    { id: 'backtoschool', season: 2, icon: '🎒', name: 'Back to School', start: 7, hours: 10,
      blurb: 'First day of term: every classroom lit and every bus running.',
      effects: [{ sel: { subs: LEARNING }, mult: 1.6 }, { sel: { subs: ['clothing', 'mall', 'galleria', 'arcade'] }, mult: 1.3 }],
      pledge: { sel: { subs: LEARNING }, what: 'every school and library' } },
    { id: 'lanternnight', season: 2, icon: '🏮', name: 'Lantern Night', start: 17, hours: 7,
      blurb: 'At dusk the whole town lets paper lanterns go, and the sky fills with them.',
      effects: [{ sel: { homes: true }, mult: 1.25 }, { sel: { lamps: true }, mult: 1.4 }, { sel: { subs: FOOD }, mult: 1.2 }],
      pledge: { sel: { homes: true }, what: 'every home' } },
    { id: 'spookynight', season: 2, icon: '🎃', name: 'Spooky Night', start: 17, hours: 7,
      blurb: 'Pumpkins on every step, costumes on every street and something moving in the fog.',
      effects: [{ sel: { homes: true }, mult: 1.2 }, { sel: { lamps: true }, mult: 1.3 }, { sel: { subs: ['cornerstore', 'grocery'] }, mult: 1.4 }, { sel: { subs: NIGHTLIFE }, mult: 1.3 }],
      pledge: { sel: { homes: true }, what: 'every home' } },
    { id: 'gales', season: 2, icon: '🍂', name: 'Autumn Gales', start: 14, hours: 8, hazard: true,
      blurb: 'The first big blow of the season. Wind farms will love it; your lines will not.',
      weather: 'storm',
      effects: [{ sel: { homes: true }, mult: 1.1 }],
      pledge: { sel: { homes: true }, what: 'every home through the gales' } },
    { id: 'blackfriday', season: 2, icon: '🛒', name: 'Big Sale Day', start: 6, hours: 16,
      blurb: 'Doors open at six. The car parks are full by seven.',
      effects: [{ sel: { subs: RETAIL }, mult: 1.6 }],
      pledge: { sel: { subs: RETAIL }, what: 'every shop in the sale' } },

    // ── Winter ──
    { id: 'lights', season: 3, icon: '✨', name: 'Festival of Lights', start: 16, hours: 8,
      blurb: 'Every house strung with lights and the high street glowing.',
      effects: [{ sel: { homes: true }, mult: 1.35 }, { sel: { shops: true }, mult: 1.25 }, { sel: { lamps: true }, mult: 1.5 }],
      pledge: { sel: { homes: true }, what: 'every home' } },
    { id: 'shopping', season: 3, icon: '🛍', name: 'Holiday Shopping Rush', start: 9, hours: 12,
      blurb: 'Late opening on every shop in town and queues out of the door.',
      effects: [{ sel: { subs: RETAIL }, mult: 1.6 }, { sel: { subs: FOOD }, mult: 1.2 }],
      pledge: { sel: { shops: true }, what: 'every shop and business' } },
    { id: 'newyear', season: 3, icon: '🎆', name: "New Year's Eve", start: 20, hours: 6,
      blurb: 'Fireworks at midnight. Every party in town wants the lights on until dawn.',
      effects: [{ sel: { homes: true }, mult: 1.2 }, { sel: { subs: NIGHTLIFE }, mult: 2.0 }, { sel: { subs: FOOD }, mult: 1.3 }],
      pledge: { sel: { homes: true, subs: NIGHTLIFE }, what: 'every home and venue' } },
    { id: 'icestorm', season: 3, icon: '🧊', name: 'Ice Storm', start: 2, hours: 12, hazard: true,
      blurb: 'Freezing rain glazes everything. Heating is up and the lines are icing over.',
      weather: 'coldsnap', weatherLabel: '🧊 Ice Storm',
      effects: [{ sel: { homes: true }, mult: 1.15 }, { sel: { industry: true }, mult: 1.1 }],
      pledge: { sel: { homes: true }, what: 'every home through the ice' } },
    { id: 'skating', season: 3, icon: '⛸', name: 'Winter Carnival', start: 12, hours: 10,
      blurb: 'Skating, markets and a parade. The rinks and hot springs are packed.',
      effects: [{ sel: { subs: ['icerink', 'hotsprings', 'pavilion', 'convention', ...FOOD] }, mult: 1.6 }],
      pledge: { sel: { shops: true }, what: 'every business on the route' } },
  ];
  const byId = id => EVENTS.find(e => e.id === id) || null;
  const WET  = new Set(['rainstorm', 'rainfall']);

  // Each season's three events land in these bands (days into the season,
  // 0-based), so they are spread out rather than bunched.
  const BANDS = [[2, 4], [6, 8], [10, 12]];
  const PLEDGE_PASS = 0.97;       // share of the time the pledged buildings must be lit
  // A home-wide pledge (Dry Spell, Ice Storm, Festival of Lights...) is the
  // whole residential income for half a day, so at 0.5 a big town was paid
  // ~70k for one heat wave. 0.15 keeps it worth chasing without that.
  const BONUS_SHARE = 0.15;       // bonus = this share of what they pay over the event
  const BONUS_FLOOR = 1000;
  const MIN_TARGETS = 3;          // a town with fewer has nothing to celebrate yet

  // ── State ────────────────────────────────────────────────────────
  let schedule  = [];      // [{ id, at, end, phase }]  at/end in DayNight seconds; phase: pending|warned|live|done
  let forSeason = -1;      // season index the schedule was drawn for
  let live      = null;    // { id, end, targets: Set, lit, total, fees }
  let lastYear  = {};      // season -> [ids] drawn last time, to avoid back-to-back repeats
  let liveMults = null;    // [{ sel, mult }] for the event running, or null

  const dayLen = () => DayNight.secondsPerGameHour() * 24;
  // NotificationStack.push drops a card whose tag is already showing, so a
  // fresh one (tomorrow's event, this event's result) clears the last first.
  function card(opts) {
    if (typeof NotificationStack === 'undefined') return;
    NotificationStack.dismissTag?.(opts.tag);
    NotificationStack.push(opts);
  }
  const now    = () => DayNight.getElapsed();
  const on     = () => typeof Seasons !== 'undefined' && Seasons.enabled();

  // The schedule is redrawn when the season turns. The index alone is
  // enough: the same index only comes round again after the other three.
  const seasonKey = () => Seasons.index();

  function drawSchedule() {
    const idx = Seasons.index();
    const startDay = Math.floor(now() / dayLen()) - (Seasons.dayOfSeason() - 1);
    const pool = EVENTS.filter(e => e.season === idx);
    // Last year's three go to the back of the queue.
    const prev = lastYear[idx] || [];
    const shuffled = pool.map(e => ({ e, k: Math.random() + (prev.includes(e.id) ? 1 : 0) }))
                         .sort((a, b) => a.k - b.k).map(x => x.e);
    // At most one hazard a season: the calendar is mostly the town having fun.
    const picks = [];
    for (const e of shuffled) {
      if (picks.length >= BANDS.length) break;
      if (e.hazard && picks.some(p => p.hazard)) continue;
      picks.push(e);
    }
    picks.sort(() => Math.random() - 0.5);
    lastYear[idx] = picks.map(e => e.id);
    schedule = picks.map((e, i) => {
      const [a, b] = BANDS[i];
      const day = startDay + a + Math.floor(Math.random() * (b - a + 1));
      const at  = (day + e.start / 24) * dayLen();
      return { id: e.id, at, end: at + e.hours * DayNight.secondsPerGameHour(), phase: 'pending' };
    }).filter(s => s.at > now());   // a schedule drawn mid-season skips what is already past
    forSeason = seasonKey();

    // Only what the town could take part in today; one it grows into by the
    // day still happens, with its own card the day before.
    const listed = schedule.filter(sc => relevant(byId(sc.id)));
    if (listed.length && typeof NotificationStack !== 'undefined') {
      const lines = listed.map(s => `${byId(s.id).icon} ${byId(s.id).name}: day ${Math.floor(s.at / dayLen()) - startDay + 1}`).join(' · ');
      card({ icon: '📅', title: `This ${Seasons.name().toLowerCase()} in town`, message: lines,
                               color: Seasons.color(), border: '#304050', tag: 'season-calendar' });
    }
  }

  // ── Pledge accounting ────────────────────────────────────────────
  function pledgeTargets(ev) {
    const out = [];
    for (const t of CUSTOMER()) for (const e of EntityRegistry.getByType(t)) {
      if (e._clientOwned) continue;
      if (((e.def && e.def.powerInput) || 0) <= 0) continue;
      if (matches(ev.pledge.sel, e)) out.push(e);
    }
    return out;
  }
  const feeOf = e => (e.dailyFee ?? e.def.income ?? 0);
  // Whether the town has anything this event is about. A spring fair in a
  // town with no shops is not an event, it is a notification.
  function relevant(ev) {
    return pledgeTargets(ev).length >= MIN_TARGETS;
  }

  function begin(s) {
    const ev = byId(s.id);
    const targets = pledgeTargets(ev);
    s.phase = 'live';
    if (targets.length < MIN_TARGETS) {
      // Nothing to pledge yet: the event still happens, demand and all.
      live = { id: s.id, start: s.at, end: s.end, targets: null, lit: 0, total: 0, fees: 0 };
    } else {
      live = { id: s.id, start: s.at, end: s.end, targets: new Set(targets), lit: 0, total: 0, fees: 0 };
    }
    liveMults = ev.effects;
    // A dry spell that opens under a shower would skip its heat wave and
    // leave the rain falling: clear the rain first.
    if (ev.noRain && typeof WeatherEventSystem !== 'undefined') {
      const wx = WeatherEventSystem.getActiveEvent();
      if (wx && WET.has(wx.type)) WeatherEventSystem._forceEnd();
    }
    if (ev.weather && typeof WeatherEventSystem !== 'undefined' && !WeatherEventSystem.getActiveEvent()) {
      WeatherEventSystem.triggerEvent(ev.weather, ev.weatherLabel);
    }
    pushLiveCard(ev);
    // Hazards announce themselves through the weather they bring.
    if (!ev.hazard) try { SFX.festival?.(); } catch (_e) {}
  }

  function pushLiveCard(ev) {
    if (typeof NotificationStack === 'undefined') return;
    NotificationStack.dismissTag?.('season-event-ahead');
    card({
      icon: ev.icon, title: `${ev.name} is on`,
      message: liveMessage(ev),
      color: ev.hazard ? '#ff9060' : '#ffd070', border: ev.hazard ? '#703018' : '#6a5010',
      tag: 'season-event-live', glow: true,
    });
  }
  function liveMessage(ev) {
    const left = Math.max(0, (live ? live.end : 0) - now());
    const hrs  = Math.ceil(left / DayNight.secondsPerGameHour());
    if (!live || !live.targets) return `${ev.blurb} ${hrs}h to go.`;
    const pct = live.total > 0 ? Math.round(100 * live.lit / live.total) : 100;
    return `${ev.blurb} Pledge: keep ${ev.pledge.what} lit (${live.targets.size}) · ${pct}% so far · ${hrs}h to go.`;
  }

  function finish() {
    const ev = byId(live.id);
    const s  = schedule.find(x => x.id === live.id);
    if (s) s.phase = 'done';
    NotificationStack.dismissTag?.('season-event-live');
    if (live.targets && live.total > 0) {
      const share = live.lit / live.total;
      if (share >= PLEDGE_PASS) {
        let bonus = Math.max(BONUS_FLOOR, Math.round(live.fees * BONUS_SHARE));
        if (typeof Difficulty !== 'undefined' && Difficulty.incomeMult) bonus = Math.round(bonus * Difficulty.incomeMult());
        Economy.setBalance(Economy.balance + bonus);
        card({ icon: ev.icon, title: `${ev.name}: pledge kept`,
          message: `${ev.pledge.what[0].toUpperCase() + ev.pledge.what.slice(1)} stayed lit. The town sends ${formatMoney(bonus)} by way of thanks.`,
          color: '#40d090', border: '#1f6b4a', tag: 'season-event-result' });
        MessageLog.add(`${ev.name}: pledge kept, ${formatMoney(bonus)} bonus`, '#40d090');
        try { SFX.cash?.(); } catch (_e) {}
      } else {
        card({ icon: ev.icon, title: `${ev.name}: pledge missed`,
          message: `Only ${Math.round(share * 100)}% of the time with ${ev.pledge.what} lit (${Math.round(PLEDGE_PASS * 100)}% needed). No bonus this time.`,
          color: '#c08060', border: '#603020', tag: 'season-event-result' });
        MessageLog.add(`${ev.name}: pledge missed (${Math.round(share * 100)}% lit)`, '#c08060');
      }
    } else {
      MessageLog.add(`${ev.name} is over`, '#7a8a99');
    }
    live = null; liveMults = null;
  }

  // ── Tick ─────────────────────────────────────────────────────────
  let _cardAcc = 0;
  function tick(dt) {
    if (!on() || typeof DayNight === 'undefined') return;
    if (typeof ScenarioSystem !== 'undefined' && ScenarioSystem.active && ScenarioSystem.active()) return;
    if (!live && seasonKey() !== forSeason) drawSchedule();

    const t = now();
    for (const s of schedule) {
      if (s.phase === 'pending' && t >= s.at - dayLen() / 2) {
        if (!relevant(byId(s.id))) { s.phase = 'done'; continue; }
        s.phase = 'warned';
        const ev = byId(s.id);
        const hh = String(Math.floor(ev.start)).padStart(2, '0');
        card({ icon: ev.icon, title: `${ev.name} at ${hh}:00`,
          message: `${ev.blurb}${ev.weather ? ' Expect rough weather.' : ''} Keep ${ev.pledge.what} lit for the whole ${ev.hours} hours for a bonus.`,
          color: '#c0d0e0', border: '#304050', tag: 'season-event-ahead' });
      }
      if ((s.phase === 'pending' || s.phase === 'warned') && !live && t >= s.at && t < s.end) begin(s);
      // Slept straight past it (a long fast-forward or a trip away): it just didn't happen.
      if ((s.phase === 'pending' || s.phase === 'warned') && t >= s.end) s.phase = 'done';
    }

    if (live) {
      if (live.targets && dt > 0) {
        // Demolished since the event began: no longer the town's to light.
        const reg = EntityRegistry.all();
        let lit = 0, n = 0, fees = 0;
        for (const e of live.targets) {
          if (reg.has(e)) { n++; if (e.powered) { lit++; fees += feeOf(e); } }
        }
        const frac = n ? lit / n : 1;
        live.lit += frac * dt; live.total += dt; live.fees += fees * dt;
      }
      _cardAcc += dt;
      if (_cardAcc >= 2) { _cardAcc = 0; NotificationStack.updateTag?.('season-event-live', { message: liveMessage(byId(live.id)) }); }
      if (t >= live.end) finish();
    }
  }

  // ── Demand (read per consumer by power_network.js) ───────────────
  function demandMult(e) {
    if (!liveMults) return 1;
    let m = 1;
    for (const fx of liveMults) if (matches(fx.sel, e)) m *= fx.mult;
    return m;
  }

  // ── Save ─────────────────────────────────────────────────────────
  function serialise() {
    return {
      schedule: schedule.map(s => ({ ...s })), forSeason, lastYear,
      live: live ? { id: live.id, end: live.end, lit: live.lit, total: live.total, fees: live.fees, pledged: !!live.targets } : null,
    };
  }
  function loadState(d) {
    schedule = []; forSeason = -1; live = null; liveMults = null; lastYear = {};
    if (!d) return;
    schedule  = Array.isArray(d.schedule) ? d.schedule.filter(s => byId(s.id)) : [];
    forSeason = typeof d.forSeason === 'number' ? d.forSeason : -1;
    lastYear  = d.lastYear || {};
    if (d.live && byId(d.live.id)) {
      const ev = byId(d.live.id);
      // Entity references don't survive a save: re-find who is pledged.
      const targets = d.live.pledged ? new Set(pledgeTargets(ev)) : null;
      live = { id: d.live.id, start: d.live.end - ev.hours * DayNight.secondsPerGameHour(), end: d.live.end,
               targets, lit: d.live.lit || 0, total: d.live.total || 0, fees: d.live.fees || 0 };
      liveMults = ev.effects;
    }
  }

  // Dev: start one now (or the next on the calendar) to watch it run.
  function devStart(id) {
    if (live) finish();
    const ev = id ? byId(id) : byId((schedule.find(s => s.phase !== 'done') || {}).id);
    if (!ev) return null;
    const s = { id: ev.id, at: now(), end: now() + ev.hours * DayNight.secondsPerGameHour(), phase: 'pending' };
    schedule.push(s);
    begin(s);
    return ev.id;
  }

  // Dev: stop whatever is running, settling its pledge as if it had run out.
  function devEnd() { if (live) finish(); }

  // For the visuals (seasonal_event_fx.js): what is on, who it involves
  // and who is pledged. Read every frame, so it hands out live references.
  const _fx = { id: null, ev: null, start: 0, end: 0, targets: null };
  function fx() {
    if (!live) return null;
    _fx.id = live.id; _fx.ev = byId(live.id); _fx.start = live.start; _fx.end = live.end; _fx.targets = live.targets;
    return _fx;
  }
  // Seconds until an event on this season's calendar starts: null if it is
  // not coming (not drawn this year, already on, or over).
  function startsIn(id) {
    const s = schedule.find(x => x.id === id && (x.phase === 'pending' || x.phase === 'warned'));
    return s ? s.at - now() : null;
  }
  function involves(e) {
    if (!liveMults) return false;
    for (const f of liveMults) if (f.mult > 1 && matches(f.sel, e)) return true;
    return false;
  }

  return {
    tick, demandMult, serialise, loadState, devStart, devEnd, fx, involves, matches, startsIn,
    EVENTS,
    // A live event that keeps the rain away (Dry Spell): EventSystem's rain timers wait it out.
    holdsOffRain: () => !!(live && byId(live.id).noRain),
    // `relevant`: whether the town has enough of what the event is about to take part (see relevant()).
    getSchedule: () => schedule.map(s => { const ev = byId(s.id);
      return { ...s, name: ev.name, icon: ev.icon, blurb: ev.blurb, hazard: !!ev.hazard, what: ev.pledge ? ev.pledge.what : '', relevant: relevant(ev) }; }),
    getLive: () => live ? { id: live.id, name: byId(live.id).name, end: live.end,
                             share: live.total > 0 ? live.lit / live.total : 1, pledged: live.targets ? live.targets.size : 0 } : null,
  };
})();
