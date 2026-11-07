/* ═══════════════════════════════════════════════════════════════════
   FUSION RESEARCH
   The Fusion Research Facility's programme, and the first rung of the
   fusion chain. The facility arrives in the National Government Zone once
   the MK5 Research Station is placed (see GovernmentSystem NATIONAL), and
   from then on researches fusion one plasma shot at a time. Shots fire
   every half hour from 09:00 to 18:00 (DemandCurves.fusionShot) and pull
   1 MW while they last: a shot that stays powered the whole way through
   counts as a good experiment, one that browns out is aborted and counts
   for nothing. SHOTS_NEEDED good shots achieve fusion, which unlocks the
   Electrolyzer (see Progression) — so a grid built to carry the spikes gets
   there in a couple of days, and a weak one never does.

   Milestone notes land at 25/50/75%. Within the last WARN_SHOTS shots an
   urgent notification goes out, and from then on losing power costs
   OUTAGE_LOSS shots of data. The breakthrough itself plays as a scene: the
   camera flies to the facility, a countdown runs, the tokamak ignites and
   the whole campus lights up. The unlock lands when the player dismisses
   the title card.

   After fusion the facility keeps experimenting: every good shot trims the
   rest of the fusion chain's goals (FUSION_GOALS) by BONUS_PER_SHOT, up to
   BONUS_MAX — see goalScale().
   ═══════════════════════════════════════════════════════════════════ */

const FusionResearch = (() => {
  const SHOTS_NEEDED   = 45;      // ≈ 2.5 in-game days at 18 shots a day
  const WARN_SHOTS     = 2;       // "imminent" once this few good shots remain
  const OUTAGE_LOSS    = 2;       // shots of data lost to a power cut while imminent
  const FIRE_FRAC      = 0.15;    // must match DemandCurves.fusionShot
  const BONUS_PER_SHOT = 0.01;
  const BONUS_MAX      = 20;      // post-fusion shots that count — 20% off at most
  const NOTE_TAG = 'fusion-imminent';
  const FAIL_TAG = 'fusion-shot-fail';
  const MILESTONES = [
    { at: 0.25, title: 'First stable confinement', message: 'The Fusion Research Facility has held its first stable plasma. Keep every shot powered.' },
    { at: 0.50, title: 'Record plasma temperature', message: 'The tokamak has passed 100 million °C; the programme is halfway to ignition.' },
    { at: 0.75, title: 'Energy gain approaching 1', message: 'The shots are nearly breaking even. A few more full-power experiments and fusion is within reach.' },
  ];

  // Saved state.
  let started    = false;
  let shots      = 0;             // good shots toward fusion
  let warned     = false;
  let complete   = false;
  let milestones = 0;             // bitmask of MILESTONES passed
  let bonusShots = 0;             // good shots after fusion (goalScale)

  // Not saved.
  let scene      = null;          // a reload mid-scene just replays it
  let doneSlot   = -1;            // last half-hour slot whose shot has been scored
  let pend       = null;          // { slot, ok } — the shot firing right now
  let failStreak = 0;
  let seenPower  = false;         // don't nag about aborted shots on a facility never wired up
  let prevPowered = null;
  let lastFx     = null;          // { kind, at, ... } — the sprite's latest effect (real-time seconds)
  const _fx = (kind, extra) => { lastFx = { kind, at: performance.now() / 1000, ...extra }; };

  const hourLen = () => DayNight.secondsPerGameHour();
  const lab = () => { for (const e of EntityRegistry.getByType(T.FUSIONLAB)) return e; return null; };
  const mk5 = () => EntityRegistry.getByType(T.MK5RESEARCH).size > 0;
  // Half-hour slots count from elapsed 0 (midnight of day 1), 48 a day.
  const isShotSlot = slot => { const h = (slot % 48) / 2; return h >= 9 && h < 18; };

  function _labCentre(e) {
    return { x: (e.col + e.width / 2) * TILE, y: (e.row + e.height / 2) * TILE };
  }
  function _jump(e) {
    const c = _labCentre(e);
    Camera.recentreOn(c.x, c.y);
  }
  const _click = e => () => { _jump(e); SFX.click(); };

  function _left() {
    const n = Math.max(0, SHOTS_NEEDED - shots);
    return `${n} good shot${n === 1 ? '' : 's'}`;
  }
  function _imminentText(e) {
    return e.powered
      ? `The Fusion Research Facility is ${_left()} from ignition. Keep it powered through every shot. Click to watch.`
      : `The Fusion Research Facility has LOST POWER moments from ignition: ${OUTAGE_LOSS} shots of data lost. Restore it to finish the experiment.`;
  }

  // ── Per-tick ─────────────────────────────────────────────────────
  function tick(dt) {
    if (scene) return;
    const e = lab();
    if (!e || !mk5()) return;

    if (!started) {
      started = true;
      NotificationStack.push({
        icon: '⚛️', title: 'Fusion research begins',
        message: `The Fusion Research Facility fires a plasma shot every half hour from 09:00 to 18:00, pulling 1 MW each time. Every shot that stays powered the whole way counts: ${SHOTS_NEEDED} good shots achieve fusion.`,
        color: '#ff90e0', border: '#602050', tag: 'fusion-start',
        onClick: _click(e),
      });
    }
    if (e.powered) seenPower = true;

    // Saved at full shots but before the title card was dismissed (mid-scene,
    // or an older build): replay the breakthrough now rather than waiting on
    // a shot that can't add anything.
    if (!complete && shots >= SHOTS_NEEDED) { _startScene(e); return; }

    // Losing power this close to ignition ruins the run in progress.
    if (warned && !complete && prevPowered === true && !e.powered) {
      shots = Math.max(0, shots - OUTAGE_LOSS);
      _fx('outage');
      try { SFX.burnout?.(0.4); } catch (_e) {}
    }
    prevPowered = e.powered;
    if (warned && !complete) NotificationStack.updateTag(NOTE_TAG, { message: _imminentText(e) });

    // Score every shot window that has closed since the last tick — more
    // than one at high game speed.
    const slotLen = hourLen() / 2, t = DayNight.getElapsed();
    const slot = Math.floor(t / slotLen), ph = t / slotLen - slot;
    // First tick, clock set back, or a big skip: only a shot still firing now
    // can count — one whose window closed before we were watching never happened.
    if (doneSlot < 0 || slot < doneSlot || slot - doneSlot > 48) doneSlot = ph < FIRE_FRAC ? slot - 1 : slot;
    for (let s = doneSlot + 1; s <= slot; s++) {
      if (s === slot && ph < FIRE_FRAC) break;               // still firing
      if (isShotSlot(s)) _score(e, pend && pend.slot === s ? pend.ok : e.powered);
      doneSlot = s;
      if (scene) return;
    }
    if (isShotSlot(slot) && ph < FIRE_FRAC) {
      if (!pend || pend.slot !== slot) pend = { slot, ok: true };
      pend.ok = pend.ok && e.powered;
    }
  }

  function _score(e, ok) {
    if (complete) {
      if (!ok || bonusShots >= BONUS_MAX) return;
      bonusShots++;
      _fx('bonus');
      if (bonusShots === 1 || bonusShots === BONUS_MAX) {
        const done = bonusShots === BONUS_MAX;
        NotificationStack.push({
          icon: '⚛️', title: done ? 'Fusion chain fully optimised' : 'Fusion data streamlining the chain',
          message: done
            ? `The Fusion Research Facility's experiments have cut every remaining fusion-chain goal by ${Math.round(BONUS_MAX * BONUS_PER_SHOT * 100)}%.`
            : `Every full-power shot at the Fusion Research Facility now cuts the remaining fusion-chain goals by ${Math.round(BONUS_PER_SHOT * 100)}%, up to ${Math.round(BONUS_MAX * BONUS_PER_SHOT * 100)}%. Keep it powered.`,
          color: '#ff90e0', border: '#602050', tag: done ? 'fusion-bonus-max' : 'fusion-bonus',
          onClick: _click(e),
        });
      }
      return;
    }

    if (!ok) {
      failStreak++;
      _fx('abort');
      if (!seenPower) return;
      const msg = failStreak === 1
        ? 'A plasma shot at the Fusion Research Facility browned out and was aborted; it needs 1 MW for the whole shot. Aborted shots count for nothing.'
        : `${failStreak} plasma shots in a row have been aborted for lack of power; each needs 1 MW for the whole shot. Aborted shots count for nothing.`;
      if (!NotificationStack.updateTag(FAIL_TAG, { message: msg })) {
        NotificationStack.push({ icon: '⚛️', title: 'Plasma shot aborted', message: msg, color: '#ff9060', border: '#603020', tag: FAIL_TAG, onClick: _click(e) });
      }
      return;
    }

    failStreak = 0;
    NotificationStack.dismissTag?.(FAIL_TAG);
    shots++;
    _fx('good', { n: shots });
    MILESTONES.forEach((m, i) => {
      if (milestones & (1 << i) || shots < Math.ceil(m.at * SHOTS_NEEDED)) return;
      milestones |= 1 << i;
      _fx('milestone', { n: shots, title: m.title });
      NotificationStack.push({ icon: '⚛️', title: m.title, message: m.message, color: '#ff90e0', border: '#602050', tag: 'fusion-ms-' + i, onClick: _click(e) });
    });
    if (shots >= SHOTS_NEEDED) { _startScene(e); return; }
    if (!warned && SHOTS_NEEDED - shots <= WARN_SHOTS) {
      warned = true;
      try { SFX.meltdownAlarm?.(0.06); setTimeout(() => SFX.meltdownAlarm?.(0.06), 900); } catch (_e) {}
      NotificationStack.push({
        icon: '⚛️', title: 'FUSION BREAKTHROUGH IMMINENT', message: _imminentText(e),
        color: '#ff90e0', border: '#a03080', tag: NOTE_TAG, glow: true, emergency: true,
        onClick: _click(e),
      });
    }
  }

  // ── Queries (Progression, the facility sprite, the info panel) ───
  function isComplete() { return complete; }
  function progress()   { return complete ? 1 : Math.min(1, shots / SHOTS_NEEDED); }
  // Multiplier on the fusion chain's unlock goals — see FUSION_GOALS.
  function goalScale()  { return 1 - Math.min(bonusShots, BONUS_MAX) * BONUS_PER_SHOT; }

  // What the facility sprite needs to know. `k` is the scene's intensity,
  // 0 outside the scene.
  function visual(e) {
    return {
      researching: started && !complete,
      pct: progress(),
      imminent: warned && !complete,
      shots, shotsNeeded: SHOTS_NEEDED, shotsLeft: Math.max(0, SHOTS_NEEDED - shots),
      stage: MILESTONES.filter((_m, i) => milestones & (1 << i)).length,
      lastFailed: failStreak > 0, everPowered: seenPower,
      bonusShots, bonusMax: BONUS_MAX, goalCut: 1 - goalScale(),
      fx: lastFx, scene: !!(scene && scene.lab === e),
      ignited: complete || !!(scene && scene.lab === e && scene.phase === 'lit'),
      k: scene && scene.lab === e ? scene.k : 0,
    };
  }

  // ═══ The breakthrough scene ═════════════════════════════════════
  let root = null, fx = null, g = null, raf = 0, lastNow = 0;

  // Operation Hyperion's reveal on the title card (seconds after the card).
  const REVEAL_NAME = '◈ OPERATION HYPERION', REVEAL_AT = 3.0, REVEAL_DUR = 1.3;
  const GLYPHS = '█▓▒░#%&@$*+=/\\<>';
  // The first `n` letters plain, the rest still scrambled (spaces stay put).
  const _scramble = (str, n) => [...str].map((ch, i) => i < n || ch === ' ' ? ch : GLYPHS[Math.random() * GLYPHS.length | 0]).join('');

  function _el(cls, html) { const d = document.createElement('div'); d.className = cls; if (html) d.innerHTML = html; root.appendChild(d); return d; }
  function _padOn() { return typeof GamepadInput !== 'undefined' && GamepadInput.connected; }
  const ease = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const clamp01 = u => Math.max(0, Math.min(1, u));

  function _startScene(e) {
    NotificationStack.dismissTag?.(NOTE_TAG);
    const z0 = Camera.zoom;
    const from = { x: Camera.x + window.innerWidth / z0 / 2, y: Camera.y + window.innerHeight / z0 / 2 };
    const to = _labCentre(e);
    // Frame the whole campus with a little room around it.
    const fit = Math.min(window.innerWidth / (e.width * TILE), window.innerHeight / (e.height * TILE)) * 0.78;
    const z1 = Math.max(Camera.ZOOM_MIN || 0.3, Math.min(1.4, fit));
    scene = {
      lab: e, clock: 0, k: 0, from, to, z0, z1,
      speed: typeof DevMode !== 'undefined' ? DevMode.timeScale : 1,
      phase: 'fly', count: -1, igniteAt: 7.6, holdReady: false, skipAt: -1, padB: false,
      sparks: [], rings: [],
      // The classified site's name is first revealed on the title card.
      reveal: typeof NationalProject !== 'undefined' && NationalProject.reached?.('classified') && !NationalProject.named?.(),
    };
    if (typeof DevMode !== 'undefined') DevMode.setTimeScale(0);

    root = document.createElement('div');
    root.id = 'gw-fusion';
    fx = document.createElement('canvas'); fx.className = 'gf-fx'; root.appendChild(fx);
    _el('gf-bar gf-top', `<span class="gf-bar-l">⚛ FUSION RESEARCH FACILITY</span><span class="gf-bar-r">LIVE</span>`);
    _el('gf-bar gf-bot', `<span class="gf-status">PLASMA CURRENT RISING</span><span class="gf-skip"><span class="gf-skip-label"></span><i class="gf-skip-fill"></i></span>`);
    _el('gf-count');
    _el('gf-title', `<div class="gf-eyebrow">${(typeof CityInfo !== 'undefined' ? CityInfo.getCityName() : '').toUpperCase()} · NATIONAL FUSION PROGRAMME</div>
      <div class="gf-big">FUSION ACHIEVED</div>
      <div class="gf-sub">SUSTAINED IGNITION &nbsp;·&nbsp; Q &gt; 1</div>
      <div class="gf-unlock"><span>NEW RESEARCH READY AT THE MK5 STATION</span><b>⚗ ELECTROLYZER</b></div>
      ${scene.reveal ? `<div class="gf-reveal"><span>THE MINISTRY OF ENERGY HAS DECLASSIFIED ITS FILE</span><b>${_scramble(REVEAL_NAME, 0)}</b></div>` : ''}
      <div class="gf-go"></div>`);
    document.body.appendChild(root);
    document.body.classList.add('gw-fusion');
    root.querySelector('.gf-skip-label').textContent = _padOn() ? 'HOLD Ⓑ TO SKIP' : (window.GW_MOBILE ? 'HOLD SCREEN TO SKIP' : 'HOLD ESC TO SKIP');
    root.querySelector('.gf-go').textContent = _padOn() ? 'PRESS Ⓐ TO CONTINUE' : 'CLICK TO CONTINUE';
    g = fx.getContext('2d');
    _resize();
    window.addEventListener('resize', _resize);
    window.addEventListener('keydown', _onKey, true);
    window.addEventListener('keyup', _onKeyUp, true);
    root.addEventListener('mousedown', () => _advance());
    root.addEventListener('wheel', ev => ev.preventDefault(), { passive: false });
    try { _auStart(); } catch (_e) {}
    lastNow = 0;
    raf = requestAnimationFrame(_frame);
  }

  function _resize() {
    if (!fx) return;
    const dpr = window.devicePixelRatio || 1;
    fx.width = Math.round(innerWidth * dpr); fx.height = Math.round(innerHeight * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function _onKey(ev) {
    if (!scene) return;
    if (ev.key === 'F11' || ev.key === 'F12') return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (ev.key === 'Escape') { if (scene.skipAt < 0) scene.skipAt = performance.now(); return; }
    if (!ev.repeat && (ev.key === 'Enter' || ev.key === ' ')) _advance();
  }
  function _onKeyUp(ev) { if (!scene) return; if (ev.key === 'Escape') scene.skipAt = -1; ev.stopImmediatePropagation(); }
  // From gamepad_input.js while the scene is up.
  function padFrame(aDown, bHeld) {
    if (!scene) return;
    if (aDown) _advance();
    if (bHeld && !scene.padB) scene.skipAt = performance.now();
    if (!bHeld && scene.padB) scene.skipAt = -1;
    scene.padB = bHeld;
  }
  function _advance() { if (scene && scene.holdReady) _endScene(); }

  // ── Scene sound ──────────────────────────────────────────────────
  // All synthesised, through one bus with a soft echo so it reads as a big
  // hall: a magnet drone that climbs through the countdown, a clean rising
  // ping per beat, then at ignition a deep thump, a rush of air and a slow
  // bright chord, settling into a warm plasma hum until the card is dismissed.
  let au = null;   // { c, bus, drone: [nodes], droneF, droneG, hum: { g, nodes } }

  function _auStart() {
    const c = typeof SFX !== 'undefined' && SFX.context ? SFX.context() : null;
    if (!c) return;
    const now = c.currentTime;
    const bus = c.createGain(); bus.gain.value = 0.9 * (SFX.getVolume ? SFX.getVolume() : 1);
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    bus.connect(comp); comp.connect(c.destination);
    // Echo send: two taps, darkened, feeding back a little.
    const send = c.createGain(); send.gain.value = 0.32;
    const d1 = c.createDelay(1), d2 = c.createDelay(1), fb = c.createGain(), lp = c.createBiquadFilter();
    d1.delayTime.value = 0.23; d2.delayTime.value = 0.37; fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 2400;
    bus.connect(send); send.connect(d1); send.connect(d2); d1.connect(lp); d2.connect(lp); lp.connect(fb); fb.connect(d1); lp.connect(comp);
    au = { c, bus, send, drone: [] };

    // Magnet drone: detuned saws and a sub, through a lowpass that opens up.
    const droneG = c.createGain(), droneF = c.createBiquadFilter();
    droneF.type = 'lowpass'; droneF.frequency.setValueAtTime(140, now); droneF.Q.value = 3;
    droneG.gain.setValueAtTime(0.0001, now); droneG.gain.exponentialRampToValueAtTime(0.16, now + 2.4);
    droneF.connect(droneG); droneG.connect(bus);
    for (const [type, f, det, g] of [['sawtooth', 55, -7, 0.5], ['sawtooth', 55, 7, 0.5], ['sawtooth', 82.4, 3, 0.25], ['sine', 27.5, 0, 0.9]]) {
      const o = c.createOscillator(), og = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, now); o.detune.value = det; og.gain.value = g;
      o.connect(og); og.connect(type === 'sine' ? droneG : droneF); o.start(now);
      au.drone.push(o);
    }
    au.droneF = droneF; au.droneG = droneG;
  }

  // A soft sine ping with an octave shimmer: the countdown beats.
  function _auPing(freq, vol) {
    if (!au) return;
    const { c, bus } = au, now = c.currentTime;
    for (const [m, v, type] of [[1, vol, 'sine'], [2, vol * 0.35, 'sine'], [3.01, vol * 0.12, 'triangle']]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq * m, now);
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(v, now + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
      o.connect(g); g.connect(bus); o.start(now); o.stop(now + 1.2);
    }
  }

  // Each beat pushes the drone up a step: the field building.
  function _auBeat(cd) {
    if (!au) return;
    const { c } = au, now = c.currentTime;
    _auPing([523.25, 587.33, 659.25, 783.99, 880][cd] || 880, 0.11 + cd * 0.015);
    au.droneF.frequency.setTargetAtTime(160 + cd * 170, now, 0.35);
    au.droneG.gain.setTargetAtTime(0.16 + cd * 0.03, now, 0.4);
    for (const o of au.drone) o.frequency.setTargetAtTime(o.frequency.value * 1.06, now, 0.5);
    if (cd === 4) {
      // The last beat: a rising whine as the heating peaks.
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(300, now); o.frequency.exponentialRampToValueAtTime(2400, now + 1.0);
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.05, now + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);
      o.connect(g); g.connect(au.bus); o.start(now); o.stop(now + 1.1);
    }
  }

  function _noise(c, sec) {
    const b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function _auIgnite() {
    if (!au) return;
    const { c, bus } = au, now = c.currentTime;
    // Drone cuts out under the hit.
    au.droneG.gain.cancelScheduledValues(now); au.droneG.gain.setTargetAtTime(0.0001, now, 0.05);
    for (const o of au.drone) o.stop(now + 0.6);
    au.drone = [];
    // Thump: a sine dropping into the sub.
    { const o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(150, now); o.frequency.exponentialRampToValueAtTime(28, now + 1.4);
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.9, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);
      o.connect(g); g.connect(bus); o.start(now); o.stop(now + 2.3); }
    // Rush of air: noise through a falling bandpass.
    { const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = _noise(c, 3); f.type = 'bandpass'; f.Q.value = 0.7;
      f.frequency.setValueAtTime(5000, now); f.frequency.exponentialRampToValueAtTime(260, now + 2.6);
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.35, now + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);
      s.connect(f); f.connect(g); g.connect(bus); s.start(now); s.stop(now + 3); }
    // The chord: A major spread wide, swelling in after the hit, long tail.
    for (const [f, v] of [[110, 0.05], [220, 0.06], [277.18, 0.045], [329.63, 0.045], [440, 0.04], [554.37, 0.03], [659.25, 0.025], [880, 0.015]]) {
      for (const det of [-6, 6]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = f < 200 ? 'triangle' : 'sine'; o.frequency.value = f; o.detune.value = det;
        g.gain.setValueAtTime(0.0001, now + 0.15); g.gain.exponentialRampToValueAtTime(v, now + 1.6); g.gain.exponentialRampToValueAtTime(0.0001, now + 7);
        o.connect(g); g.connect(bus); o.start(now + 0.15); o.stop(now + 7.1);
      }
    }
    au.send.gain.setTargetAtTime(0.45, now, 0.5);
    // Plasma hum underneath from here on: a low fifth, slowly beating.
    const hg = c.createGain(), hf = c.createBiquadFilter();
    hf.type = 'lowpass'; hf.frequency.value = 600;
    hg.gain.setValueAtTime(0.0001, now + 1); hg.gain.exponentialRampToValueAtTime(0.07, now + 4);
    hf.connect(hg); hg.connect(bus);
    const nodes = [];
    for (const [f, det] of [[55, 0], [55, 4], [82.4, -3], [110, 2]]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      o.connect(hf); o.start(now + 1); nodes.push(o);
    }
    au.hum = { g: hg, nodes };
  }

  // The name resolving: a low swell under a bright fifth, in Hyperion's key.
  function _auReveal() {
    if (!au) return;
    const { c, bus } = au, now = c.currentTime;
    for (const [f, v] of [[146.83, 0.05], [220, 0.04], [293.66, 0.035], [440, 0.025], [587.33, 0.018]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(v, now + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, now + 3.5);
      o.connect(g); g.connect(bus); o.start(now); o.stop(now + 3.6);
    }
  }

  // Title card: a gentle bell pair.
  function _auTitle() {
    _auPing(880, 0.07);
    setTimeout(() => _auPing(1318.5, 0.05), 160);
  }

  function _auStop() {
    if (!au) return;
    const { c, bus } = au, now = c.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    for (const o of [...au.drone, ...(au.hum ? au.hum.nodes : [])]) { try { o.stop(now + 1.7); } catch (_e) {} }
    const b = bus; setTimeout(() => { try { b.disconnect(); } catch (_e) {} }, 2500);
    au = null;
  }

  function _ignite() {
    const s = scene;
    s.phase = 'lit';
    try { _auIgnite(); } catch (_e) {}
    Camera.shake(22);
    s.rings.push({ at: s.clock, speed: 1 }, { at: s.clock + 0.25, speed: 0.7 });
    const c = _labScreen();
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, sp = 200 + Math.random() * 900;
      s.sparks.push({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.8 + Math.random() * 1.6, age: 0 });
    }
    root.querySelector('.gf-status').textContent = 'IGNITION: SELF-SUSTAINING BURN';
    root.querySelector('.gf-count').classList.remove('in');
  }

  // The tokamak itself, not the middle of the campus (see fusionTokamakWorld).
  function _labScreen() {
    const z = Camera.zoom, tk = fusionTokamakWorld(scene.lab);
    return { x: (tk.x - Camera.x) * z, y: (tk.y - Camera.y) * z, r: tk.r * z };
  }

  function _frame(now) {
    if (!scene) return;
    raf = requestAnimationFrame(_frame);
    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0;
    lastNow = now;
    const s = scene;
    s.clock += dt;
    if (typeof DevMode !== 'undefined' && DevMode.timeScale !== 0) DevMode.setTimeScale(0);

    // Camera: fly in, then hold.
    const u = ease(clamp01(s.clock / 2.6));
    Camera.setZoom(s.z0 + (s.z1 - s.z0) * u);
    Camera.jumpTo(s.from.x + (s.to.x - s.from.x) * u, s.from.y + (s.to.y - s.from.y) * u);

    // Countdown 5…1, the plasma building with each beat.
    const cd = Math.floor((s.clock - 2.6) / 1.0);
    if (s.phase === 'fly' && s.clock >= 2.6) s.phase = 'count';
    if (s.phase === 'count' && cd !== s.count && cd >= 0 && cd < 5) {
      s.count = cd;
      const el = root.querySelector('.gf-count');
      el.textContent = String(5 - cd);
      el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
      try { _auBeat(cd); } catch (_e) {}
      Camera.shake(2 + cd * 1.5);
      root.querySelector('.gf-status').textContent = ['MAGNETS AT FIELD', 'NEUTRAL BEAMS ON', 'PLASMA CURRENT 12 MA', 'TEMPERATURE 150 MILLION °C', 'IGNITION'][cd];
    }
    if (s.phase === 'count' && s.clock >= s.igniteAt) _ignite();
    if (s.phase === 'lit' && s.clock >= s.igniteAt + 1.8 && !s.titleShown) {
      s.titleShown = true;
      root.querySelector('.gf-title').classList.add('in');
      try { _auTitle(); } catch (_e) {}
    }
    // The sealed name decodes a letter at a time, once its line has faded in.
    if (s.reveal && s.titleShown && s.decoded !== REVEAL_NAME.length) {
      const u = clamp01((s.clock - s.igniteAt - 1.8 - REVEAL_AT) / REVEAL_DUR);
      const n = Math.floor(u * REVEAL_NAME.length);
      const b = root.querySelector('.gf-reveal b');
      b.textContent = _scramble(REVEAL_NAME, n);
      if (n > (s.decoded || 0)) { try { _auPing(1760 + n * 40, 0.018); } catch (_e) {} }
      s.decoded = n;
      if (n === REVEAL_NAME.length) { b.classList.add('done'); try { _auReveal(); } catch (_e) {} }
    }
    if (s.titleShown && !s.holdReady && s.clock >= s.igniteAt + (s.reveal ? 1.8 + REVEAL_AT + REVEAL_DUR + 1.2 : 4.2)) {
      s.holdReady = true;
      root.querySelector('.gf-go').classList.add('in');
    }

    // Intensity for the facility sprite: builds through the countdown, peaks at ignition, settles bright.
    if (s.phase === 'fly') s.k = 0.1 * u;
    else if (s.phase === 'count') s.k = 0.15 + 0.5 * clamp01((s.clock - 2.6) / 5);
    else { const lt = s.clock - s.igniteAt; s.k = lt < 0.4 ? 1 : 0.75 + 0.25 * Math.exp(-(lt - 0.4)); }

    // Skip
    const fill = root.querySelector('.gf-skip-fill');
    const su = s.skipAt < 0 ? 0 : clamp01((now - s.skipAt) / 900);
    fill.style.transform = `scaleX(${su})`;
    if (su >= 1) { _endScene(); return; }

    _draw(dt);
  }

  function _draw(dt) {
    const s = scene, W = innerWidth, H = innerHeight;
    g.clearRect(0, 0, W, H);
    const c = _labScreen();
    g.save();
    g.globalCompositeOperation = 'lighter';

    // Charging: arcs crawling round the torus, faster each beat.
    if (s.phase === 'count') {
      const n = 2 + (s.count + 1) * 2;
      for (let i = 0; i < n; i++) {
        const a0 = s.clock * (2 + s.count) + i * 6.283 / n, r = c.r * (1.0 + 0.1 * Math.sin(s.clock * 7 + i));
        g.strokeStyle = `rgba(255,170,240,${0.35 + 0.1 * s.count})`; g.lineWidth = 2;
        g.beginPath(); g.arc(c.x, c.y, r, a0, a0 + 0.7); g.stroke();
      }
    }

    if (s.phase === 'lit') {
      const lt = s.clock - s.igniteAt;
      // Flash
      const f = lt < 0.08 ? 1 : Math.max(0, 1 - (lt - 0.08) / 0.9);
      if (f > 0) { g.fillStyle = `rgba(255,230,250,${0.9 * f})`; g.fillRect(0, 0, W, H); }
      // Core bloom
      const pulse = 0.85 + 0.15 * Math.sin(s.clock * 9);
      const br = c.r * (2.4 + 0.4 * pulse);
      const gr = g.createRadialGradient(c.x, c.y, 0, c.x, c.y, br);
      gr.addColorStop(0, `rgba(255,255,255,${0.55 * pulse})`);
      gr.addColorStop(0.35, `rgba(255,120,220,${0.45 * pulse})`);
      gr.addColorStop(1, 'rgba(120,60,255,0)');
      g.fillStyle = gr; g.fillRect(c.x - br, c.y - br, br * 2, br * 2);
      // Light pillar and sweeping beams
      const pil = g.createLinearGradient(c.x - c.r * 0.5, 0, c.x + c.r * 0.5, 0);
      pil.addColorStop(0, 'rgba(255,140,230,0)'); pil.addColorStop(0.5, `rgba(255,220,250,${0.3 * pulse})`); pil.addColorStop(1, 'rgba(255,140,230,0)');
      g.fillStyle = pil; g.fillRect(c.x - c.r * 0.5, 0, c.r, c.y);
      for (let k = 0; k < 4; k++) {
        const a = s.clock * 0.5 + k * Math.PI / 2;
        const len = Math.hypot(W, H);
        g.fillStyle = `rgba(255,160,240,${0.07 + 0.04 * Math.sin(s.clock * 3 + k)})`;
        g.beginPath(); g.moveTo(c.x, c.y);
        g.lineTo(c.x + Math.cos(a - 0.05) * len, c.y + Math.sin(a - 0.05) * len);
        g.lineTo(c.x + Math.cos(a + 0.05) * len, c.y + Math.sin(a + 0.05) * len);
        g.closePath(); g.fill();
      }
      // Anamorphic streak
      if (lt < 1.2) {
        const a = Math.pow(1 - lt / 1.2, 2), len = W * 0.9;
        const sg = g.createLinearGradient(c.x - len, 0, c.x + len, 0);
        sg.addColorStop(0, 'rgba(140,120,255,0)'); sg.addColorStop(0.5, `rgba(255,240,255,${a})`); sg.addColorStop(1, 'rgba(140,120,255,0)');
        g.fillStyle = sg; g.fillRect(c.x - len, c.y - 5, len * 2, 10);
      }
    }

    // Light shockwaves rolling out across the map.
    for (const r of s.rings) {
      const rt = s.clock - r.at; if (rt < 0) continue;
      const uu = clamp01(rt / (2.4 / r.speed)); if (uu >= 1) continue;
      const R = (1 - Math.pow(1 - uu, 2.4)) * Math.hypot(W, H);
      g.strokeStyle = `rgba(255,200,250,${0.8 * (1 - uu)})`; g.lineWidth = 3 + 8 * (1 - uu);
      g.shadowColor = 'rgba(255,120,220,1)'; g.shadowBlur = 24;
      g.beginPath(); g.arc(c.x, c.y, R, 0, 6.283); g.stroke();
      g.shadowBlur = 0;
    }

    // Sparks
    for (const p of s.sparks) {
      p.age += dt; const k = Math.pow(0.15, dt); p.vx *= k; p.vy *= k; p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.age / p.life; if (a <= 0) continue;
      g.strokeStyle = `rgba(255,${180 + 60 * a | 0},250,${a})`; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
    }
    s.sparks = s.sparks.filter(p => p.age < p.life);
    g.restore();
  }

  // Loading a save (or a new game) while the scene is up: drop it without
  // completing anything — the loaded state decides whether it replays.
  function _abortScene() {
    if (!scene) return;
    const s = scene;
    scene = null;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', _resize);
    window.removeEventListener('keydown', _onKey, true);
    window.removeEventListener('keyup', _onKeyUp, true);
    root?.remove(); root = null;
    _auStop();
    document.body.classList.remove('gw-fusion');
    if (typeof DevMode !== 'undefined') DevMode.setTimeScale(s.speed || 1);
  }

  function _endScene() {
    if (!scene) return;
    const s = scene;
    scene = null;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', _resize);
    window.removeEventListener('keydown', _onKey, true);
    window.removeEventListener('keyup', _onKeyUp, true);
    complete = true;
    _auStop();
    const r = root; root = null;
    r.classList.add('out');
    document.body.classList.remove('gw-fusion');
    setTimeout(() => r.remove(), 700);
    Camera.setZoom(s.z1); Camera.jumpTo(s.to.x, s.to.y);
    if (typeof DevMode !== 'undefined') DevMode.setTimeScale(s.speed || 1);
    // The Electrolyzer's gate is isComplete() — check now rather than on the next tick.
    try { Progression.checkUnlocks(); } catch (_e) {}
  }

  // ── Save / load ─────────────────────────────────────────────────
  function serialise() { return { started, shots, warned, complete, milestones, bonusShots }; }
  function loadState(d) {
    _abortScene();
    d = d || {};
    started = !!d.started; warned = !!d.warned; complete = !!d.complete;
    milestones = d.milestones | 0; bonusShots = d.bonusShots | 0;
    // Saves from the old timed programme carry needSec/doneSec instead.
    shots = d.shots != null ? d.shots | 0
          : (d.needSec ? Math.floor(Math.min(1, (d.doneSec || 0) / d.needSec) * SHOTS_NEEDED) : 0);
    if (d.shots == null) {
      MILESTONES.forEach((m, i) => { if (shots >= Math.ceil(m.at * SHOTS_NEEDED)) milestones |= 1 << i; });
      warned = SHOTS_NEEDED - shots <= WARN_SHOTS && started;
    }
    doneSlot = -1; pend = null; failStreak = 0; seenPower = false; prevPowered = null; lastFx = null;
    // A world that unlocked the Electrolyzer under the old rule has, in
    // effect, already achieved fusion.
    if (!complete && typeof Progression !== 'undefined' &&
        (Progression.isUnlocked?.(T.ELECTROLYZER) || Progression.isReady?.(T.ELECTROLYZER))) complete = true;
  }
  function reset() {
    _abortScene();
    started = false; shots = 0; warned = false; complete = false; milestones = 0; bonusShots = 0;
    doneSlot = -1; pend = null; failStreak = 0; seenPower = false; prevPowered = null; lastFx = null;
  }

  return { tick, isComplete, progress, goalScale, visual, padFrame, isActive: () => !!scene, serialise, loadState, reset, timeLeftText: _left };
})();
