/* ═══════════════════════════════════════════════════════════════════
   LAUNCH SYSTEM
   The Starhaven Launch Complex flies a mission every month or so, and a
   launch is an event for the grid as much as for the town:

     • the window is announced a day ahead, so there is time to line up
       supply (and it is listed on the calendar, see events_panel.js)
     • two hours out the complex starts loading propellant and its draw
       climbs to FUEL_K of the mission's peak
     • in the last seconds of the count it peaks at the mission's power:
       pumps, chill-down and the pad deluge all at once
     • every mission has a payload class that sets the power it needs at
       liftoff (CLASSES), stated when the window is announced: its grid
       must have that much to give the complex at T-0, generation plus what
       storage can put out, over everything else it is carrying
     • six hours out, a grid that could not give it that much now is warned
     • keep it powered through liftoff with that much to spare and the
       mission pays a bonus; lose power for more than a moment, or come up
       short at T-0, and the launch is scrubbed and recycled for another
       day, at a cost to approval and City Score (SCRUB_*)

   The rocket itself is drawn here too, in world space, once it has left
   the pad (renderSpaceLaunches, the same kind of pass as the airport's
   airliners): it climbs out over the city on its plume and leaves a
   column of smoke that hangs and thins. Everything on the ground — the
   stack on the pad, the swing arms, the booster coming back — is
   _renderSpaceport's, driven by visual() below.

   Home only: game_loop.js does not tick this on a contract site, and a
   client's complex (_clientOwned) is never the one that launches.
   ═══════════════════════════════════════════════════════════════════ */

const LaunchSystem = (() => {
  const FIRST_DAYS  = [6, 10];     // first window after the complex is connected
  const GAP_DAYS    = [22, 34];    // days between windows after that
  const WARN_H      = 24;          // announced this many game hours ahead
  const FUEL_H      = 2;           // propellant loading, game hours
  const TERMINAL_S  = 24;          // final count, real seconds: the peak of the surge
  const IGNITE_S    = 6;           // engines light this long before liftoff
  const ASCENT_S    = 24;          // the climb-out that is drawn
  const TRAIL_S     = 26;          // how long the smoke column lingers after that
  const BOOST_AT    = 30;          // seconds after liftoff the booster comes back into view
  const BOOST_S     = 16;          // its landing burn
  const ROLLOUT_H   = 20;          // game hours after a launch before the next stack rolls out
  const ROLLOUT_S   = 90;          // the crawl from the assembly building to the pad
  const RETRY_H     = 20;          // a scrubbed launch recycles this much later
  const CHECK_H     = 6;           // the grid's spare power is checked against the need this far out
  const FUEL_K      = 5 / 14;      // propellant loading draws this share of the class's peak
  const OUTAGE_S    = 3;           // unpowered this long (in total) during the count and it is a scrub
  const BONUS       = 120000;      // a medium lift; scaled by the class's power
  // Payload classes: the power the complex needs at liftoff. The first
  // mission from a city is a light lift; after that it is drawn at random.
  const CLASSES = [
    { label: 'Light lift',  kw: 8000 },
    { label: 'Medium lift', kw: 12600 },
    { label: 'Heavy lift',  kw: 18000 },
  ];
  const PEAK_KW     = CLASSES[CLASSES.length - 1].kw;   // the most any count draws
  const SCRUB_APPROVAL = 6;        // approval lost on a scrub
  const SCRUB_SCORE    = 5;        // City Score points lost on a scrub...
  const SCRUB_FADE_D   = 3;        // ...fading out over this many game days

  // ── State (saved) ────────────────────────────────────────────────
  // t0 liftoff (DayNight seconds) · mission number · needKw the power it
  // needs at liftoff · warned / checked / fuelling / terminal / ignited
  // latches · dark seconds unpowered this count · last liftoff that flew ·
  // rollAt when the next stack leaves the VAB · penAt the last scrub (for
  // the fading score hit) · result of the last mission { ok, mission, why }
  let st = null;
  let site = null, siteAt = -1;

  const now  = () => DayNight.getElapsed();
  const hour = () => DayNight.secondsPerGameHour();
  const day  = () => hour() * 24;
  const rand = ([a, b]) => a + Math.random() * (b - a);
  const mw   = kw => `${(kw / 1000).toFixed(1)} MW`;
  const pickKw = mission => mission <= 1 ? CLASSES[0].kw : CLASSES[Math.floor(Math.random() * CLASSES.length)].kw;
  const classOf = kw => CLASSES.find(c => c.kw === kw) || { label: 'Launch', kw };
  const fresh = (t0, mission, needKw = pickKw(mission)) => ({ t0, mission, needKw, warned: false, checked: false, fuelling: false, terminal: false, ignited: false, dark: 0, last: -1e9, rollAt: -1e9, penAt: -1e9, result: null });

  // What the complex's grid could give it right now: everything the network
  // can supply (generation plus storage output) less what the rest of it is
  // drawing. The complex's own draw is left out, since that is what the
  // launch needs the room for.
  function spareFor(e) {
    if (!e || !(e.networkId >= 0) || typeof PowerNetwork === 'undefined' || !PowerNetwork.getNetworkHeadroom) return 0;
    const h = PowerNetwork.getNetworkHeadroom(e.networkId);
    if (!h) return 0;
    return Math.max(0, h.cap - Math.max(0, h.demand - (e._liveDemand || 0)));
  }

  // The complex that launches: the one in the National Government Zone.
  // Failing that, the player's own industrial customer from before Starhaven
  // was a national building, top-left first so it is the same one every time.
  const isComplex = e => e.type === T.LAUNCHCOMPLEX || e.commercialSubtype === 'spaceport';
  function findSite() {
    let best = null;
    if (typeof EntityRegistry === 'undefined') return null;
    for (const e of EntityRegistry.getByType(T.LAUNCHCOMPLEX)) return e;
    for (const e of EntityRegistry.getByType(T.INDUSTRIAL)) {
      if (e.commercialSubtype !== 'spaceport' || e._clientOwned) continue;
      if (!best || e.row < best.row || (e.row === best.row && e.col < best.col)) best = e;
    }
    return best;
  }
  function getSite() {
    const n = performance.now();
    if (n - siteAt > 500 || (site && !isComplex(site))) { site = findSite(); siteAt = n; }
    return site;
  }

  // A window in daylight, so the climb-out can be seen: some whole days
  // out, at a time between mid-morning and late afternoon.
  function windowAfter(from, days) {
    const d = Math.floor(from / day()) + Math.max(1, Math.round(days));
    return (d + (9 + Math.random() * 8) / 24) * day();
  }

  function card(opts) {
    if (typeof NotificationStack === 'undefined') return;
    NotificationStack.dismissTag?.(opts.tag);
    NotificationStack.push(opts);
  }
  const clockAt = sec => {
    const h = ((sec / day()) % 1) * 24, hh = Math.floor(h + 1e-6), mm = String(Math.floor(((h + 1e-6) % 1) * 60)).padStart(2, '0');
    if (DayNight.isUse24Hour()) return `${String(hh).padStart(2, '0')}:${mm}`;
    return `${hh % 12 === 0 ? 12 : hh % 12}:${mm} ${hh < 12 ? 'AM' : 'PM'}`;
  };
  const bonus = () => Math.round(BONUS * (st ? st.needKw : CLASSES[1].kw) / CLASSES[1].kw * (typeof Difficulty !== 'undefined' && Difficulty.incomeMult ? Difficulty.incomeMult() : 1));

  function scrub(why) {
    if (typeof GovernmentSystem !== 'undefined' && GovernmentSystem.adjustApproval) GovernmentSystem.adjustApproval(-SCRUB_APPROVAL);
    card({ icon: '🚀', title: `Mission ${st.mission} scrubbed`,
      message: `${why} Approval −${SCRUB_APPROVAL} and City Score −${SCRUB_SCORE} (fading over ${SCRUB_FADE_D} days). The count is recycled: the next window opens in ${RETRY_H} hours, needing the same ${mw(st.needKw)}.`,
      color: '#ff9060', border: '#703018', tag: 'launch' });
    if (typeof MessageLog !== 'undefined') MessageLog.add(`Launch scrubbed: mission ${st.mission} (approval −${SCRUB_APPROVAL}, City Score −${SCRUB_SCORE})`, '#c08060');
    const keep = { last: st.last, rollAt: st.rollAt, penAt: now(), result: { ok: false, mission: st.mission, why } };
    st = Object.assign(fresh(now() + RETRY_H * hour(), st.mission, st.needKw), keep);
    LaunchAudio.stop();
  }

  function liftoff() {
    const pay = bonus();
    Economy.setBalance(Economy.balance + pay);
    card({ icon: '🚀', title: `Liftoff! Mission ${st.mission} is away`,
      message: `Starhaven had the ${mw(st.needKw)} it needed at liftoff. The launch pays ${formatMoney(pay)}.`,
      color: '#40d090', border: '#1f6b4a', tag: 'launch', glow: true });
    if (typeof MessageLog !== 'undefined') MessageLog.add(`Liftoff: mission ${st.mission}, ${formatMoney(pay)} launch bonus`, '#40d090');
    const t0 = st.t0, penAt = st.penAt, mission = st.mission;
    st = fresh(windowAfter(t0, rand(GAP_DAYS)), mission + 1);
    st.last = t0; st.rollAt = t0 + ROLLOUT_H * hour(); st.penAt = penAt;
    st.result = { ok: true, mission };
  }

  // ── Tick ─────────────────────────────────────────────────────────
  function tick(dt) {
    if (typeof DayNight === 'undefined') return;
    // A scenario only flies if it is built around a launch (Launch Day), and
    // then on the window it sets with schedule().
    if (typeof ScenarioSystem !== 'undefined' && ScenarioSystem.active && ScenarioSystem.active()
        && !(ScenarioSystem.launches && ScenarioSystem.launches())) return;
    const e = getSite();
    if (!e) { st = null; LaunchAudio.stop(); return; }
    if (!st) st = fresh(windowAfter(now(), rand(FIRST_DAYS)), 1);
    const left = st.t0 - now();

    if (!st.warned && left <= WARN_H * hour()) {
      st.warned = true;
      if (left > FUEL_H * hour()) card({ icon: '🚀', title: `Launch window: ${clockAt(st.t0)}, in ${Math.round(left / hour())} hours`,
        message: `Mission ${st.mission} is a ${classOf(st.needKw).label.toLowerCase()}: Starhaven needs ${mw(st.needKw)} available at liftoff (its grid can give it ${mw(spareFor(e))} now). Have it there for a ${formatMoney(bonus())} bonus; come up short and the launch is scrubbed, costing approval and City Score.`,
        color: '#8fc8ee', border: '#304050', tag: 'launch' });
    }
    if (!st.checked && left <= CHECK_H * hour()) {
      st.checked = true;
      const spare = spareFor(e);
      if (left > FUEL_H * hour() && spare < st.needKw) card({ icon: '⚠', title: `Mission ${st.mission} is short of power`,
        message: `Liftoff at ${clockAt(st.t0)} needs ${mw(st.needKw)} for Starhaven, and its grid can give it only ${mw(spare)} now. Add ${mw(st.needKw - spare)} of generation or storage in the next ${Math.round(left / hour())} hours, or the launch will be scrubbed.`,
        color: '#ffb060', border: '#704818', tag: 'launch', glow: true });
    }
    if (!st.fuelling && left <= FUEL_H * hour()) {
      st.fuelling = true; st.dark = 0;
      if (!e.powered) { scrub('The complex had no power when propellant loading was due to start.'); return; }
      card({ icon: '🚀', title: `Mission ${st.mission}: propellant loading`,
        message: `Draw is climbing to ${mw(st.needKw * FUEL_K)}, and peaks at ${mw(st.needKw)} in the last seconds of the count. Its grid can give it ${mw(spareFor(e))} now.`,
        color: '#ffd070', border: '#6a5010', tag: 'launch', glow: true });
    }
    if (st.fuelling) {
      if (!e.powered) { st.dark += dt; if (st.dark > OUTAGE_S) { scrub('Starhaven lost power during the count.'); return; } }
      if (!st.terminal && left <= TERMINAL_S) {
        st.terminal = true;
        if (typeof showToast === 'function') showToast(`🚀 Terminal count: Starhaven is drawing up to ${mw(st.needKw)}`, '#ffd070', '#141004', '#6a5010');
      }
      if (!st.ignited && left <= IGNITE_S) st.ignited = true;
      if (left <= 0) {
        // The stated need, not just whatever the count happened to draw:
        // within 2% for the noise on the complex's own draw.
        const spare = spareFor(e);
        if (!e.powered) { scrub('Starhaven had no power at liftoff.'); return; }
        if (spare < st.needKw * 0.98) { scrub(`Liftoff needed ${mw(st.needKw)} for Starhaven and its grid could give it only ${mw(spare)}.`); return; }
        liftoff();
      }
    }
    // Ground shake while the engines are lit and the stack is still low.
    const since = now() - st.last;
    const burn = st.ignited ? 1 - Math.max(0, st.t0 - now()) / IGNITE_S : since < 7 ? 1 - since / 7 : 0;
    if (burn > 0 && dt > 0 && typeof Camera !== 'undefined') {
      const f = _spaceportFrame(e), dx = f.padX - (Camera.x + innerWidth / Camera.zoom / 2), dy = f.padY - (Camera.y + innerHeight / Camera.zoom / 2);
      const near = Math.max(0, 1 - Math.hypot(dx, dy) / 3200);
      if (near > 0 && Camera.getShake() < 5 * near) Camera.shake(1.6 * burn * near);
    }
    LaunchAudio.tick(e, st.ignited ? -(st.t0 - now()) : since, st.fuelling ? Math.max(0, st.t0 - now()) : -1);
  }

  // What the count does to the complex's draw (power_network.js).
  // Scaled off the complex's 900 kW peak draw, so the count peaks at the
  // class's power.
  function demandMult(e) {
    if (!st || !st.fuelling || e !== site) return 1;
    const left = st.t0 - now();
    const peak = st.needKw / ((e.def && e.def.powerInput) || 900), fuel = peak * FUEL_K;
    if (left > TERMINAL_S) {
      const k = 1 - (left - TERMINAL_S) / Math.max(1, FUEL_H * hour() - TERMINAL_S);
      return 1 + (fuel - 1) * Math.min(1, k / 0.25);
    }
    return fuel + (peak - fuel) * Math.min(1, (TERMINAL_S - left) / 8);
  }

  // City Score points the last scrub is still costing (city_score.js).
  function scorePenalty() {
    if (!st || typeof DayNight === 'undefined') return 0;
    const k = 1 - (now() - st.penAt) / (SCRUB_FADE_D * day());
    return k > 0 && k <= 1 ? SCRUB_SCORE * k : 0;
  }

  // ── What the sprite should show ──────────────────────────────────
  const IDLE = { rocket: 'pad', fuelling: false, igniteK: 0, smokeK: 0, delugeK: 0, boosterK: -1, rolloutK: -1, doorOpen: 0, armK: 0, strobe: false, msg: 'STANDBY', col: '#60ff90' };
  function visual(e) {
    if (!st || e !== getSite()) return IDLE;
    const n = now(), since = n - st.last, left = st.t0 - n;
    const v = Object.assign({}, IDLE);
    if (since < BOOST_AT + BOOST_S + 8 || n < st.rollAt) {
      // just flown: pad clear, the cloud thinning, the booster back on its pad
      v.rocket = 'none'; v.armK = 1;
      v.smokeK = since < 8 ? 1 : Math.max(0, 1 - (since - 8) / 36);
      v.delugeK = since < 5 ? 1 - since / 5 : 0;
      v.boosterK = since >= BOOST_AT ? (since - BOOST_AT) / BOOST_S : -1;
      if (since < ASCENT_S)        { v.msg = 'LIFTOFF'; v.col = '#ffb040'; }
      else if (v.boosterK >= 0 && v.boosterK < 1) { v.msg = 'BOOSTER RTLS'; v.col = '#80d0ff'; }
      else v.msg = 'PAD CLEAR';
      return v;
    }
    if (n < st.rollAt + ROLLOUT_S) {
      v.rocket = 'rollout'; v.rolloutK = (n - st.rollAt) / ROLLOUT_S; v.armK = 1;
      v.doorOpen = v.rolloutK < 0.4 ? Math.sin(v.rolloutK / 0.4 * Math.PI) : 0;
      v.msg = 'ROLLOUT';
      return v;
    }
    v.fuelling = st.fuelling;
    v.strobe = st.warned;
    if (st.fuelling) {
      v.igniteK = left <= IGNITE_S ? Math.max(0, Math.min(1, 1 - left / IGNITE_S)) : 0;
      v.armK = left <= IGNITE_S + 3 ? Math.min(1, (IGNITE_S + 3 - left) / 3) : 0;
      v.delugeK = v.igniteK > 0 ? Math.min(1, v.igniteK * 3) : 0;
      v.smokeK = v.igniteK * 0.8;
    }
    if (st.warned) {
      const s = Math.max(0, Math.ceil(left));
      if (s > 99) { const gm = Math.floor(left / hour() * 60); v.msg = `T-${String(Math.floor(gm / 60)).padStart(2, '0')}h${String(gm % 60).padStart(2, '0')}`; }
      else { v.msg = `T-00:${String(s).padStart(2, '0')}`; if (s <= 10) v.col = '#ffd060'; }
    } else v.msg = `M-${st.mission} · ${Math.max(1, Math.ceil(left / day()))}D`;
    return v;
  }

  function serialise() { return st ? { ...st } : null; }
  function loadState(d) {
    st = null; site = null; siteAt = -1; LaunchAudio.stop();
    if (!d || typeof d.t0 !== 'number') return;
    // A save from before payload classes was announced at a medium lift's peak.
    st = Object.assign(fresh(d.t0, d.mission || 1, d.needKw || CLASSES[1].kw), d);
  }

  // Dev: put a stack on the pad and fly it `secs` from now.
  function devLaunch(secs = 40) {
    if (!getSite()) return false;
    st = fresh(now() + secs, st ? st.mission : 1);
    st.warned = true;
    return true;
  }

  // A scenario sets its own first window (DayNight seconds) rather than the
  // random one a city gets.
  // Launch Day is built around a medium lift's 12.6 MW.
  function schedule(t0) { st = fresh(t0, 1, CLASSES[1].kw); }

  return {
    tick, demandMult, scorePenalty, spareFor, visual, serialise, loadState, devLaunch, schedule,
    // Missions that have flown (a scrub keeps the mission number).
    flown: () => st ? st.mission - 1 : 0,
    ASCENT_S, TRAIL_S, IGNITE_S, PEAK_KW,
    getSite,
    // { since } seconds since the last liftoff, or a negative count while the engines are lit on the pad
    flight: () => !st ? null : st.ignited ? { since: -(st.t0 - now()) } : (now() - st.last < ASCENT_S + TRAIL_S ? { since: now() - st.last } : null),
    getNext: () => st && getSite() ? { at: st.t0, mission: st.mission, fuelling: st.fuelling, bonus: bonus(), peakKw: st.needKw, needKw: st.needKw, cls: classOf(st.needKw).label, checked: st.checked, result: st.result } : null,
    clockAt,
  };
})();

// Where the complex's art sits in the world: the sprite is authored in a
// 640×440 box, scaled to fit the footprint and centred in it. Shared by
// _renderSpaceport and the passes here so the rocket leaves from the pad.
function _spaceportFrame(e) {
  const W = (e.width || 27) * TILE, H = (e.height || 18) * TILE;
  const S = Math.min(W / 640, H / 440);
  const x0 = e.col * TILE + (W - 640 * S) / 2, y0 = e.row * TILE + (H - 440 * S) / 2;
  return { S, x0, y0, padX: x0 + 470 * S, padY: y0 + 368 * S };
}

/* ── The roar ─────────────────────────────────────────────────────────
   Synthesised: brown noise through a low-pass that opens as the engines
   come up, a sub rumble under it, and a crackle that comes and goes. It
   is re-levelled every tick from the game clock, so it tracks a paused
   or fast-forwarded launch, and it carries: a launch is heard right
   across the map, only louder close to. Plus the pad's count-down pips. */
const LaunchAudio = (() => {
  let v = null, lastPip = -1;
  function build(c) {
    const len = c.sampleRate * 3, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { b = (b + (Math.random() * 2 - 1) * 0.06) / 1.006; d[i] = b * 3.2; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; lp.Q.value = 0.6;
    const crack = c.createBufferSource(); crack.buffer = buf; crack.loop = true; crack.playbackRate.value = 2.7;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.8;
    const cg = c.createGain(); cg.gain.value = 0;
    const sub = c.createOscillator(); sub.type = 'sawtooth'; sub.frequency.value = 38;
    const slp = c.createBiquadFilter(); slp.type = 'lowpass'; slp.frequency.value = 90;
    const sg = c.createGain(); sg.gain.value = 0.5;
    const out = c.createGain(); out.gain.value = 0;
    src.connect(lp); lp.connect(out);
    crack.connect(bp); bp.connect(cg); cg.connect(out);
    sub.connect(slp); slp.connect(sg); sg.connect(out);
    out.connect((SFX.bedsBus && SFX.bedsBus()) || c.destination);
    src.start(); crack.start(); sub.start();
    return { c, src, crack, sub, lp, cg, out };
  }
  function stop() {
    if (!v) return;
    try { v.out.gain.setTargetAtTime(0, v.c.currentTime, 0.2); const q = v; setTimeout(() => { try { q.src.stop(); q.crack.stop(); q.sub.stop(); q.out.disconnect(); } catch (_) {} }, 900); } catch (_) {}
    v = null;
  }
  function pip(c, hz, vol) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = hz;
    g.gain.setValueAtTime(0, c.currentTime); g.gain.linearRampToValueAtTime(vol, c.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.16);
    o.connect(g); g.connect((SFX.bedsBus && SFX.bedsBus()) || c.destination);
    o.start(); o.stop(c.currentTime + 0.2);
  }
  // s: seconds since liftoff (negative while the engines are lit on the pad,
  // large when nothing is flying). count: seconds to liftoff, or -1.
  function tick(e, s, count) {
    if (typeof SFX === 'undefined' || !SFX.context) return;
    const master = SFX.getVolume ? SFX.getVolume() : 1;
    const f = _spaceportFrame(e);
    const dist = Math.hypot(f.padX - (Camera.x + innerWidth / Camera.zoom / 2), f.padY - (Camera.y + innerHeight / Camera.zoom / 2));
    const near = 0.3 + 0.7 * Math.max(0, 1 - dist / 9000);
    // count-down pips over the last ten seconds
    if (count > 0 && count <= 10) {
      const n = Math.ceil(count);
      if (n !== lastPip) { lastPip = n; const c = SFX.context(); if (c && master > 0) pip(c, n === 1 ? 1320 : 880, 0.05 * master * near); }
    } else lastPip = -1;
    const live = s > -LaunchSystem.IGNITE_S - 0.5 && s < LaunchSystem.ASCENT_S + 10;
    if (!live) { stop(); return; }
    const c = SFX.context();
    if (!c) return;
    if (!v || v.c !== c) v = build(c);
    // level: builds through ignition, full for the first seconds of the climb, then recedes
    const lvl = s < 0 ? Math.pow(Math.max(0, 1 + s / LaunchSystem.IGNITE_S), 2) * 0.8 : s < 5 ? 1 : Math.exp(-(s - 5) / 8);
    const t = c.currentTime;
    v.out.gain.setTargetAtTime(Math.min(1, 0.9 * lvl * near * master), t, 0.12);
    v.lp.frequency.setTargetAtTime(s < 0 ? 140 + 500 * lvl : Math.max(120, 700 - s * 26), t, 0.2);
    v.cg.gain.setTargetAtTime(lvl * (0.25 + 0.75 * Math.random()) * 0.5, t, 0.04);
  }
  return { tick, stop, isLive: () => !!v };
})();

/* ── The climb-out, in world space ────────────────────────────────────
   Drawn over the buildings (render_main_loop.js, beside the airliners):
   the stack rising off the pad on its plume, tipping over into its
   gravity turn and growing as it comes up toward the camera, the smoke
   column it leaves, and the cloud rolling out across the complex. */
function _launchPath(tau, S) {
  const h = 14 * Math.pow(tau, 2.0) * S, x = 0.9 * Math.pow(tau, 2.3) * S;
  const vh = 28 * tau, vx = 2.07 * Math.pow(tau, 1.3);
  return { x, y: -h, tilt: Math.atan2(vx, Math.max(1, vh)) };
}

function _launchRocket(s, night, flame, t) {
  // a heavy-lift stack, base at the origin, nose up: 20-wide core, twin boosters
  const body = night ? '#b4b6ba' : '#f4f4f0', band = '#1e1e22', rust = night ? '#7a3420' : '#c05030';
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x * s, y * s, w * s, h * s); };
  if (flame > 0) {
    const fl = (190 + Math.sin(t * 41) * 14) * flame;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [fx, fw] of [[-20, 6], [0, 10], [20, 6]]) {
      const g = ctx.createLinearGradient(0, 8 * s, 0, (8 + fl) * s);
      g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.15, 'rgba(255,225,140,0.95)'); g.addColorStop(0.5, 'rgba(255,150,60,0.6)'); g.addColorStop(1, 'rgba(255,70,20,0)');
      ctx.fillStyle = g; ctx.beginPath();
      ctx.moveTo((fx - fw) * s, 8 * s); ctx.lineTo((fx + fw) * s, 8 * s); ctx.lineTo((fx + fw * 0.5) * s, (8 + fl * 0.5) * s);
      ctx.lineTo(fx * s, (8 + fl) * s); ctx.lineTo((fx - fw * 0.5) * s, (8 + fl * 0.5) * s); ctx.closePath(); ctx.fill();
    }
    const g = ctx.createRadialGradient(0, 40 * s, 0, 0, 40 * s, 170 * s);
    g.addColorStop(0, `rgba(255,200,110,${0.6 * flame})`); g.addColorStop(1, 'rgba(255,200,110,0)');
    ctx.fillStyle = g; ctx.fillRect(-170 * s, -130 * s, 340 * s, 340 * s);
    ctx.restore();
  }
  for (const bx of [-20, 20]) {
    R(bx - 6, -150, 12, 150, body);
    ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo((bx - 6) * s, -150 * s); ctx.quadraticCurveTo((bx - 4) * s, -166 * s, bx * s, -172 * s); ctx.quadraticCurveTo((bx + 4) * s, -166 * s, (bx + 6) * s, -150 * s); ctx.closePath(); ctx.fill();
    R(bx - 6, -60, 12, 4, band); R(bx - 6, -108, 12, 2, band); R(bx - 7, -8, 14, 8, '#7a8088');
    R(bx + 2, -150, 4, 150, 'rgba(0,0,0,0.14)');
  }
  R(-10, -250, 20, 250, body); R(-10, -120, 20, 5, band); R(-10, -200, 20, 3, band); R(-10, -250, 20, 2, band);
  R(-8, -290, 16, 40, body);
  ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-8 * s, -290 * s); ctx.quadraticCurveTo(-7.5 * s, -308 * s, 0, -320 * s); ctx.quadraticCurveTo(7.5 * s, -308 * s, 8 * s, -290 * s); ctx.closePath(); ctx.fill();
  R(-8, -291, 16, 1.6, band); R(-10, -262, 20, 2, night ? '#1a2c50' : '#2a4a8a');
  R(-7, -250, 3, 250, night ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.45)'); R(4, -320, 6, 320, 'rgba(0,0,0,0.13)');
  ctx.fillStyle = rust;
  for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sd * 10 * s, -16 * s); ctx.lineTo(sd * 17 * s, 1 * s); ctx.lineTo(sd * 10 * s, 0); ctx.closePath(); ctx.fill(); }
  R(-9, 0, 18, 4, '#7a8088');
}

function renderSpaceLaunches(t) {
  if (typeof LaunchSystem === 'undefined') return;
  const fl = LaunchSystem.flight();
  if (!fl) return;
  const e = LaunchSystem.getSite();
  if (!e) return;
  const f = _spaceportFrame(e), S = f.S, since = fl.since;
  const night = DayNight.darkness() > 0.3;
  const A = LaunchSystem.ASCENT_S, IG = LaunchSystem.IGNITE_S;
  const smoke = night ? '150,146,140' : '238,235,230';
  ctx.save();
  ctx.translate(-Camera.x * Camera.zoom, -Camera.y * Camera.zoom);
  ctx.scale(Camera.zoom, Camera.zoom);
  ctx.translate(f.padX, f.padY);

  // Smoke is the cooling towers' billow (CoolingTowerPlume.puffSprite): a
  // pre-shaded cauliflower puff, lit upper left and grey underneath, stamped
  // many times at different sizes rather than a few huge flat ovals.
  const puff = typeof CoolingTowerPlume !== 'undefined' && CoolingTowerPlume.puffSprite ? CoolingTowerPlume.puffSprite('warm') : null;
  const stamp = (x, y, r, a) => {
    if (a <= 0.01 || r <= 0) return;
    if (puff) { ctx.globalAlpha = a; ctx.drawImage(puff, x - r, y - r, r * 2, r * 2); return; }
    ctx.globalAlpha = 1; ctx.fillStyle = `rgba(${smoke},${(a * 0.6).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx.fill();
  };
  const jit = (i) => { const k = Math.sin(i * 12.9898) * 43758.5453; return k - Math.floor(k); };
  const dim = night ? 0.8 : 1;

  // The cloud rolling out along the ground: builds through ignition, then
  // rolls away to both sides, each billow swelling, lifting and thinning.
  // Back to front (higher on screen first), so nearer billows overlap.
  const gk = since < 0 ? Math.max(0, 1 + since / IG) : 1, age = Math.max(0, since);
  const fade = Math.max(0, 1 - age / 34);
  if (gk > 0 && fade > 0) {
    const ground = [];
    for (let k = 0; k < 56; k++) {
      const side = k % 2 ? 1 : -1, r = (k >> 1) / 27, j = jit(k);
      const reach = (40 + r * 240 + age * (6 + r * 12)) * gk;
      const px = side * reach * S + Math.sin(t * 0.45 + k * 1.7) * 5 * S;
      const py = (8 + (j - 0.5) * 22 - r * 18 - age * (1.4 + r * 1.8)) * S;
      const rad = (16 + r * 14 + j * 10 + age * 1.6) * (0.6 + 0.4 * gk) * S;
      // dense near the trench, thinning toward the leading edge
      ground.push([py, px, rad, 0.92 * fade * (1 - r * 0.55) * Math.min(1, gk * 1.5) * dim]);
    }
    ground.sort((a, b) => a[0] - b[0]);
    for (const [py, px, rad, a] of ground) stamp(px, py, rad, a);
    ctx.globalAlpha = 1;
    if (since < 6) {   // the fire lighting the cloud from inside
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 380 * S);
      g.addColorStop(0, `rgba(255,170,80,${(0.5 * gk * (1 - Math.max(0, since) / 6)).toFixed(3)})`); g.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(-380 * S, -380 * S, 760 * S, 760 * S); ctx.restore();
    }
  }

  if (since >= 0) {
    // The column: billows along the climb, oldest (and highest) first, each
    // swelling and thinning as it hangs and drifts. Two per step, either side
    // of the path, so the column is lumpy rather than a string of beads.
    for (let tau = Math.min(since, A); tau >= 0; tau -= 0.25) {
      const a = since - tau;
      if (a > LaunchSystem.TRAIL_S) break;
      const p = _launchPath(tau, S), k = a / LaunchSystem.TRAIL_S, i = Math.round(tau * 4);
      const base = (11 + a * 2.6 + tau * 0.9) * S;
      const al = 0.85 * Math.pow(1 - k, 1.6) * Math.min(1, a / 0.3 + 0.3) * dim;
      for (let q = 0; q < 2; q++) {
        const j = jit(i * 2 + q), sd = q ? 1 : -1;
        const x = p.x + Math.sin(tau * 2.3) * a * 2.2 * S + a * 4 * S + sd * base * (0.25 + 0.3 * j);
        const y = p.y + 30 * S + (j - 0.5) * base * 0.5;
        stamp(x, y, base * (0.8 + 0.4 * j), al);
      }
    }
    ctx.globalAlpha = 1;
    if (since < A) {
      const p = _launchPath(since, S), grow = 1 + since * 0.035;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.tilt);
      ctx.globalAlpha = since > A - 6 ? Math.max(0, (A - since) / 6) : 1;
      _launchRocket(S * grow, night, 1, t);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
