/* ═══════════════════════════════════════════════════════════════════
   INTRO CINEMATIC
   Plays once at the start of every brand-new world, between the naming
   modal and the first tutorial card. It opens on two title cards, "PLAY
   US NOW GAMES presents" and then the GRIDWORKS logo (_titleCards), and
   then the story, in beats:
     1. Archive      — a terminal cues up an old security feed from
                       Halcyon Atomic, the city's previous power company.
     2. The disaster — sepia CCTV footage of the old city lit up at night.
                       Reactor alarms, then a chain of explosions: flash,
                       fireball, shockwave, the city's lights dying in a
                       wave. The feed loses signal.
     3. 20 years on  — the exclusion zone is lifted. The black lifts on the
                       real pre-dawn map and the camera drifts in over the
                       regrown land to City Hall.
     4. The letter   — the mayor's contract, addressed to the player's
                       company. ACCEPT stamps it.
     5. Power on     — a bolt strikes City Hall, a shockwave draws the tile
                       grid across the map, and the city's name slams in as
                       a title card before the HUD returns.
   The sim is frozen throughout (it's still 05:00 when the player takes
   over) and input belongs to the cinematic — hold Esc / B to skip. The
   letter replaces the tutorial's opening "Welcome" card, which is marked
   as already shown so the tutorial picks up at the card after it.
   ═══════════════════════════════════════════════════════════════════ */

const IntroCinematic = (() => {
  const OLD_COMPANY = 'Halcyon Atomic';
  const SKIP_HOLD_S = 0.9;     // how long Esc / B must be held to skip
  const TYPE_CPS    = 30;      // terminal typing speed (chars / second)
  const LETTER_CPS  = 110;     // the letter types faster — it's long

  // Timeline anchors (seconds from play()).
  const FB_AT      = 9.6;              // archive footage starts (after the cue has been read)
  // The footage: hard cuts between Halcyon's security cameras, establishing
  // the city (OldCity) before it goes. Times are seconds after FB_AT.
  // No two cameras are the same unit, mounted the same way, or keeping the
  // same time: each has its own colour cast (`grade`, a CSS filter over the
  // footage), a slight mounting tilt in degrees, and a clock a few seconds
  // off the others (`tc`). The two out at the plant end also carry a rolling
  // interference bar (`roll`).
  const SHOTS = [
    { at: 0.0,  dur: 7.0,  where: 'skyline',     cam: 'CAM 00 · CITY SKYLINE',          z: [0.5, 0.55], to: 'skylineEnd' },
    { at: 7.0,  dur: 5.8,  where: 'downtown',    cam: 'CAM 01 · DOWNTOWN',              z: [1.0, 1.1],   grade: 'saturate(1.15) contrast(1.08)', tilt: -0.5, tc: 3 },
    { at: 12.8, dur: 6.2,  where: 'leisure',     cam: 'CAM 03 · NORTHSIDE',             z: [0.72, 0.8],  grade: 'hue-rotate(-10deg) saturate(1.2) brightness(1.06)', tilt: 0.7, tc: -2 },
    { at: 19.0, dur: 5.8,  where: 'residential', cam: 'CAM 07 · WESTSIDE',              z: [0.95, 1.05], grade: 'hue-rotate(14deg) saturate(0.7) brightness(0.96)', tilt: -0.8, tc: 6 },
    { at: 24.8, dur: 6.2,  where: 'airport',     cam: 'CAM 12 · INTERNATIONAL AIRPORT', z: [0.85, 0.95], grade: 'hue-rotate(-18deg) saturate(0.8) contrast(1.1) brightness(1.08)', tilt: 0.4, tc: -4 },
    { at: 31.0, dur: 5.6,  where: 'industrial',  cam: 'CAM 15 · EASTSIDE INDUSTRIAL',   z: [0.85, 0.95], grade: 'saturate(0.45) contrast(1.3) brightness(0.95)', tilt: 0.9, tc: 1, roll: true },
    // Wide enough to take in all four reactors and the cooling towers.
    { at: 36.6, dur: 8.4,  where: 'power',       cam: 'CAM 04 · HALCYON POWER STATION', z: [0.44, 0.40], grade: 'hue-rotate(-6deg) saturate(1.3) contrast(1.15) brightness(0.92)', tilt: -0.3, roll: true },
    { at: 45.0, dur: 20.0, where: 'wide',        cam: 'CAM 00 · CITY OVERVIEW',         z: [0.36, 0.33] },
  ];
  const VENT_LEAD  = 10;               // seconds before the first blast that the relief valves open
  const ALARM_LEAD = 7;                // … and that the beacons start turning
  const DAWN_DARK  = 0.42;             // DayNight.darkness the present-day shot is lit at
  const WIDE_AT    = FB_AT + 45.0;
  const BOOM_AT    = WIDE_AT + 2.8;    // first reactor goes — a calm look at the whole city first
  const CUT_AT     = BOOM_AT + 16.5;   // signal lost → black
  const LATER_AT   = CUT_AT + 0.9;     // "20 YEARS LATER"
  const PRESENT_AT = LATER_AT + 10.6;  // black lifts on today's map
  const DRIFT_S    = 14;
  const LOCK_AT    = PRESENT_AT + DRIFT_S + 0.2;
  const LETTER_AT  = LOCK_AT + 1.2;

  // Halcyon's four reactors (positions from OldCity): when each goes after
  // BOOM_AT and how big. The last is the one that ends the city — its
  // shock front crosses all of it.
  const REACTORS = [
    { at: 0.0, size: 0.8 },
    { at: 2.0, size: 0.9 },
    { at: 3.8, size: 1.0 },
    { at: 6.0, size: 1.45 },
  ];
  let cityAmb = null, screams = null;   // archive-footage audio
  // The game's first song comes in just after 20 YEARS LATER lands and plays
  // all the way through, past the intro and into the game; the rotation
  // follows it (MusicSystem.play). Skipped before then, it starts as the
  // intro ends, so it is still the first song heard.
  const FIRST_SONG    = 'audio/music/Sleepless.mp3';
  const FIRST_SONG_AT = LATER_AT + 0.5;   // after the card's thump
  let songOn = false;
  function _firstSong() {
    if (songOn) return;
    songOn = true;
    try { if (typeof MusicSystem !== 'undefined') MusicSystem.play(FIRST_SONG); } catch (_e) {}
  }
  let _shx = 0, _shy = 0;               // this frame's screen shake

  let active   = false;
  let onDone   = null;
  let root     = null;
  let fx = null, fxCtx = null;
  let raf      = 0;
  let clock    = 0;            // seconds since play() — real time, not sim time
  let lastNow  = 0;
  let events   = [];           // { at, fn } fired once clock passes `at`
  let typers   = [];
  let camAnim  = null;         // { at, dur, fromC, toC, fromZ, toZ }
  let hall     = null;         // City Hall in world px: { x, y, w, h, cx, cy }
  let phase    = 'open';       // open | archive | later | drift | letter | power
  let letterReady = false;
  let lockAt   = -1;
  let boltAt   = -1;
  let boltPath = null, boltNext = 0;
  let sparks   = [];
  let ash      = [];
  let oldCity  = null;         // { buildings, reactors } in world tiles
  let skipDownAt = -1;
  let padSkipHeld = false;
  let tcOff    = 0;            // this camera's clock error, seconds
  let rollBar  = false;        // this camera has an interference bar
  let tearT    = 0;            // clock until which the frame is torn
  let ghost    = null;         // what the old city left in the ground (OldCity.traces())
  let dawnK    = 0, dawnTarget = 0;   // 0 = the game's own light, 1 = the cinematic's dawn
  let realDark = null;         // DayNight.darkness as the game had it

  const $   = sel => root.querySelector(sel);
  const ease = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const easeOut = u => 1 - Math.pow(1 - u, 3);
  const clamp01 = u => Math.max(0, Math.min(1, u));
  const sfx = (name, ...a) => { try { if (typeof SFX !== 'undefined' && SFX[name]) SFX[name](...a); } catch (_e) {} };

  function schedule(at, fn) { events.push({ at, fn }); }

  // ── Sound ───────────────────────────────────────────────────────────
  function _sfxVol() { return typeof SFX !== 'undefined' && SFX.getVolume ? SFX.getVolume() : 1; }
  function _play(src, vol) {
    try { const a = new Audio(src); a.volume = Math.min(1, vol * _sfxVol()); a.play().catch(() => {}); } catch (_e) {}
  }
  function _ctx() { return typeof SFX !== 'undefined' && SFX.context ? SFX.context() : null; }
  // A dry little typewriter tick, synthesized so it never lags the text.
  function _tick(pitch = 1) {
    const c = _ctx(); if (!c) return;
    const now = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'square';
    o.frequency.value = (1500 + Math.random() * 500) * pitch;
    g.gain.setValueAtTime(0.018 * _sfxVol(), now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
    o.connect(g); g.connect(c.destination);
    o.start(now); o.stop(now + 0.03);
  }
  // Tape hiss / signal-loss static.
  function _static(dur, vol) {
    const c = _ctx(); if (!c) return;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 900;
    g.gain.value = vol * _sfxVol();
    src.buffer = buf; src.connect(f); f.connect(g); g.connect(c.destination);
    src.start();
  }

  // ── Typing ──────────────────────────────────────────────────────────
  // Driven from the frame loop, so "finish now" (click / Enter / A) and
  // the skip path can complete every running typer at once.
  function type(el, text, cps, onFinish, pitch) {
    const t = { el, text, cps, i: 0, acc: 0, onFinish, pitch, done: false };
    el.textContent = '';
    typers.push(t);
    return t;
  }
  function _tickTypers(dt) {
    for (const t of typers) {
      if (t.done) continue;
      t.acc += dt * t.cps;
      const n = Math.min(t.text.length, Math.floor(t.acc));
      if (n > t.i) {
        const ch = t.text[n - 1];
        if (ch && ch.trim() && n % 2 === 0) _tick(t.pitch || 1);
        t.i = n;
        t.el.textContent = t.text.slice(0, n);
      }
      if (t.i >= t.text.length) _finishTyper(t);
    }
    typers = typers.filter(t => !t.done);
  }
  function _finishTyper(t) {
    if (t.done) return;
    t.done = true;
    t.el.textContent = t.text;
    if (t.onFinish) t.onFinish();
  }

  // ── DOM ─────────────────────────────────────────────────────────────
  function _build(city, company) {
    root = document.createElement('div');
    root.id = 'gw-intro';
    root.innerHTML = `
      <canvas class="gi-fx"></canvas>
      <div class="gi-scan"></div>
      <div class="gi-vignette"></div>
      <div class="gi-grain"></div>
      <div class="gi-glitch"></div>
      <div class="gi-black"></div>
      <div class="gi-chapter"></div>
      <div class="gi-caption"></div>
      <div class="gi-letter" role="dialog" aria-label="Contract letter">
        <div class="gi-urgent">URGENT</div>
        <div class="gi-lh">
          <canvas class="gi-flag" width="72" height="48"></canvas>
          <div>
            <div class="gi-lh-office">OFFICE OF THE MAYOR</div>
            <div class="gi-lh-city"></div>
          </div>
        </div>
        <div class="gi-ref"><span>CONTRACT NO. GW-0001</span><span>DAY 1 · 05:00</span></div>
        <div class="gi-to"></div>
        <div class="gi-body"></div>
        <div class="gi-sign">
          <div class="gi-sign-from">
            <div class="gi-sig">The Mayor</div>
            <div class="gi-sign-label">FOR THE CITY</div>
          </div>
          <div class="gi-sign-to">
            <div class="gi-sig gi-sig-co"></div>
            <div class="gi-sign-label">ACCEPTED BY</div>
          </div>
        </div>
        <button class="gi-accept" disabled>ACCEPT CONTRACT <span class="gi-key"></span></button>
        <div class="gi-stamp">CONTRACT<br>AWARDED</div>
      </div>
      <div class="gi-title">
        <div class="gi-title-eyebrow"></div>
        <div class="gi-title-city"></div>
        <div class="gi-title-trace"><i></i></div>
        <div class="gi-title-sub">REBUILD IT &nbsp;·&nbsp; POWER IT &nbsp;·&nbsp; DON'T REPEAT HISTORY</div>
        <div class="gi-title-go"></div>
      </div>
      <div class="gi-bar gi-bar-top"><span class="gi-bar-l"></span><span class="gi-bar-r"></span></div>
      <div class="gi-bar gi-bar-bot"><span class="gi-bar-bl"></span><span class="gi-skip"><span class="gi-skip-label"></span><i class="gi-skip-fill"></i></span></div>
    `;
    document.body.appendChild(root);

    $('.gi-lh-city').textContent = `CITY OF ${city.toUpperCase()}`;
    $('.gi-to').textContent = `To the owner of ${company},`;
    $('.gi-title-eyebrow').textContent = `CONTRACT AWARDED  ·  ${company.toUpperCase()}`;
    const titleEl = $('.gi-title-city');
    [...city.toUpperCase()].forEach((ch, i) => {
      const s = document.createElement('span');
      s.textContent = ch === ' ' ? ' ' : ch;
      s.style.animationDelay = `${0.05 + i * 0.045}s`;
      titleEl.appendChild(s);
    });
    const flagC = $('.gi-flag');
    try { CityInfo.drawFlag(flagC.getContext('2d'), CityInfo.getFlag(), 0, 0, flagC.width, flagC.height); }
    catch (_e) { flagC.style.display = 'none'; }
    _refreshPadLabels();

    $('.gi-accept').addEventListener('click', () => { if (letterReady) _accept(); });
    $('.gi-letter').addEventListener('wheel', e => { e.stopPropagation(); e.currentTarget._userScrolled = true; }, { passive: true });
    fx = $('.gi-fx');
    fxCtx = fx.getContext('2d');
    _resize();
  }

  function _bars(left, right, bottomLeft) {
    $('.gi-bar-l').textContent = left;
    $('.gi-bar-r').textContent = right;
    $('.gi-bar-bl').textContent = bottomLeft || '';
  }

  function _padOn() { return typeof GamepadInput !== 'undefined' && GamepadInput.connected; }
  function _refreshPadLabels() {
    if (!root) return;
    const pad = _padOn();
    $('.gi-skip-label').textContent = pad ? 'HOLD Ⓑ TO SKIP' : (window.GW_MOBILE ? 'HOLD SCREEN TO SKIP' : 'HOLD ESC TO SKIP');
    $('.gi-key').textContent = pad ? 'Ⓐ' : 'ENTER';
    $('.gi-title-go').textContent = pad ? 'PRESS Ⓐ TO BEGIN' : 'CLICK TO BEGIN';
  }

  function _resize() {
    if (!fx) return;
    const dpr = window.devicePixelRatio || 1;
    fx.width  = Math.round(window.innerWidth  * dpr);
    fx.height = Math.round(window.innerHeight * dpr);
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // A boot-terminal block: each line types its label, then its value.
  function _terminal(lines, at, outAt) {
    const el = document.createElement('div');
    el.className = 'gi-term';
    lines.forEach(() => {
      const row = document.createElement('div');
      row.className = 'gi-term-line';
      row.innerHTML = '<span class="gi-k"></span><span class="gi-v"></span>';
      el.appendChild(row);
    });
    root.insertBefore(el, $('.gi-caption'));
    const rows = el.querySelectorAll('.gi-term-line');
    lines.forEach(([k, v, bad], i) => {
      schedule(at + i * 1.35, () => {
        rows[i].classList.add('on');
        type(rows[i].querySelector('.gi-k'), k, TYPE_CPS * 1.6, () => {
          const vEl = rows[i].querySelector('.gi-v');
          if (bad) vEl.classList.add('gi-bad');
          type(vEl, v, TYPE_CPS, bad ? () => { vEl.classList.add('blink'); sfx('spark'); } : null, bad ? 0.6 : 1);
        });
      });
    });
    schedule(outAt, () => el.classList.add('out'));
    schedule(outAt + 0.8, () => el.remove());
  }

  // ── Input ───────────────────────────────────────────────────────────
  // Captured on window before anything else sees it: the game's own
  // shortcuts (Esc → pause menu, WASD, hotkeys) must not fire underneath.
  function _onKeyDown(e) {
    if (!active) return;
    if (e.key === 'F11' || e.key === 'F12') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === 'Escape') { if (skipDownAt < 0) skipDownAt = performance.now(); return; }
    if (e.repeat) return;
    if (e.key === 'Enter' || e.key === ' ') _advance();
  }
  function _onKeyUp(e) {
    if (!active) return;
    if (e.key === 'Escape') skipDownAt = -1;
    e.stopImmediatePropagation();
  }
  function _onPointer(e) {
    if (!active) return;
    if (e.target && e.target.closest && e.target.closest('.gi-accept')) return;
    _advance();
  }

  // Click / Enter / A: finish whatever is typing; on a finished letter, accept.
  function _advance() {
    if (typers.length) { [...typers].forEach(_finishTyper); typers = []; return; }
    if (phase === 'letter' && letterReady) _accept();
    else if (phase === 'title') _handOver();
  }

  // Called from gamepad_input.js's poll loop while the cinematic runs.
  function padFrame(aDown, bHeld) {
    if (titles) { if (bHeld) _titleEnd(); else if (aDown) _titleNext(); return; }
    if (!active) return;
    _refreshPadLabels();
    if (aDown) _advance();
    if (bHeld && !padSkipHeld) skipDownAt = performance.now();
    if (!bHeld && padSkipHeld) skipDownAt = -1;
    padSkipHeld = bHeld;
  }

  // ── Camera ──────────────────────────────────────────────────────────
  function _camCentre() {
    const z = Camera.zoom;
    return { x: Camera.x + window.innerWidth / z / 2, y: Camera.y + window.innerHeight / z / 2 };
  }
  // Mobile browser full screen: the page can't be scaled there (mobile.js
  // marks it gwm-unscaled), so every shot came out much tighter than on the
  // phone's normal layout. Pull the whole intro out 30% there. Shots are
  // written at the normal zoom; _zk() is applied only when setting the camera.
  const _zk = () => (window.GW_MOBILE && document.documentElement.classList.contains('gwm-unscaled')) ? 0.7 : 1;
  function _setCam(c, z) { Camera.setZoom(z * _zk()); Camera.jumpTo(c.x, c.y); }
  function _updateCamera() {
    if (!camAnim || clock < camAnim.at) return;
    const u = ease(clamp01((clock - camAnim.at) / camAnim.dur));
    _setCam({
      x: camAnim.fromC.x + (camAnim.toC.x - camAnim.fromC.x) * u,
      y: camAnim.fromC.y + (camAnim.toC.y - camAnim.fromC.y) * u,
    }, camAnim.fromZ + (camAnim.toZ - camAnim.fromZ) * u);
  }
  const _sx = wx => (wx - Camera.x) * Camera.zoom;
  const _sy = wy => (wy - Camera.y) * Camera.zoom;
  // City Hall's on-screen rectangle this frame.
  function _hallScreen() {
    const z = Camera.zoom;
    return { x: _sx(hall.x), y: _sy(hall.y), w: hall.w * z, h: hall.h * z, cx: _sx(hall.cx), cy: _sy(hall.cy) };
  }
  // Frame City Hall in the left third while the letter sits on the right.
  function _letterSide() { return window.innerWidth >= 900; }

  // ── Captions ────────────────────────────────────────────────────────
  function _caption(text, at, hold) {
    schedule(at, () => { const c = $('.gi-caption'); c.textContent = text; c.classList.add('show'); });
    schedule(at + hold, () => $('.gi-caption').classList.remove('show'));
  }

  // ── The old city (flashback set dressing) ───────────────────────────
  // OldCity builds and bakes the city around the real City Hall; here we
  // only need Halcyon's reactors and when each shock front reaches what.
  function _buildOldCity() {
    const sites = OldCity.build(GovernmentSystem.getGovEntity());
    const reactors = REACTORS.map((r, i) => ({
      ...r, c: sites[i].c, r: sites[i].r,
      reach: r.size > 1.2 ? 260 : 75 * r.size,     // tiles
      speed: r.size > 1.2 ? 36 : 26,               // tiles / second
    }));
    OldCity.scheduleHits(reactors.map(R => ({ c: R.c, r: R.r, at: BOOM_AT + R.at, reach: R.reach, speed: R.speed })));
    oldCity = { reactors };
  }

  // A hard cut to another camera.
  function _cutTo(shot, i) {
    const from = OldCity.shotCentre(shot.where);
    const to = shot.to ? OldCity.shotCentre(shot.to) : { x: from.x + 2.5 * TILE, y: from.y + 0.8 * TILE };
    camAnim = { at: clock, dur: shot.dur, fromC: from, toC: to, fromZ: shot.z[0], toZ: shot.z[1] };
    _setCam(from, shot.z[0]);
    const cam = shot.cam.replace('INTERNATIONAL AIRPORT', `${CityInfo.getCityName().toUpperCase()} INTERNATIONAL AIRPORT`);
    _bars(`● REC   ${OLD_COMPANY.toUpperCase()}: ${cam}`, '', `PLAYBACK ▶   ${cam.split('·')[1].trim()}`);
    _camLook(shot);
    if (i > 0) {
      // The switcher takes a moment to lock onto the new feed: the picture
      // rolls and tears before it settles.
      _static(0.18, 0.1);
      tearT = clock + 0.16;
      root.classList.add('hit', 'cut');
      setTimeout(() => root && root.classList.remove('hit'), 110);
      setTimeout(() => root && root.classList.remove('cut'), 240);
    }
  }
  // One camera's look. The tilt is scaled up slightly so the rotated frame
  // still covers the screen.
  function _camLook(shot) {
    fx.style.filter = (shot && shot.grade) || '';
    root.style.setProperty('--gi-tilt', `${(shot && shot.tilt) || 0}deg`);
    root.style.setProperty('--gi-scale', shot && shot.tilt ? '1.035' : '1');
    tcOff = (shot && shot.tc) || 0;
    rollBar = !!(shot && shot.roll);
  }

  function _loop(src, vol) {
    try {
      const a = new Audio(src); a.loop = true;
      a.volume = Math.min(1, vol * _sfxVol());
      a.play().catch(() => {});
      return a;
    } catch (_e) { return null; }
  }
  function _fadeOut(a, sec) {
    if (!a) return;
    const v0 = a.volume, t0 = performance.now();
    const step = () => {
      const u = (performance.now() - t0) / 1000 / sec;
      if (u >= 1) { a.pause(); return; }
      a.volume = v0 * (1 - u);
      setTimeout(step, 50);
    };
    step();
  }

  function _explode(R) {
    R.boomed = clock;
    const big = R.size > 1.2;
    sfx('generatorExplosion', big ? 1 : 0.75);
    if (big) { sfx('lightningExplosion', 0.9); setTimeout(() => sfx('thunder', 0.8), 700); setTimeout(() => sfx('thunder', 0.5), 1900); }
    else setTimeout(() => sfx('thump'), 120);
    Camera.shake(big ? 34 : 18);
    // The feed tears for a moment with every blast.
    root.classList.add('hit');
    tearT = clock + (big ? 0.5 : 0.28);
    setTimeout(() => root && root.classList.remove('hit'), big ? 320 : 170);

    const R_ = Math.random;
    // Fireball: a churning cluster of puffs that bloom out, cool from
    // white to red, and roll into smoke.
    // Outermost first, so the hot core is painted over the cooler rim.
    R.puffs = Array.from({ length: big ? 32 : 22 }, () => ({
      a: R_() * 6.2832, d: Math.pow(R_(), 0.6), r: 0.45 + R_() * 0.55, dl: R_() * 0.18, spin: (R_() - 0.5) * 0.6,
    })).sort((p, q) => q.d - p.d);
    // The mushroom cap seen from above: a rolling ring of smoke.
    const nCap = big ? 26 : 18;
    R.cap = Array.from({ length: nCap }, (_, i) => ({
      a: (i / nCap) * 6.2832 + R_() * 0.2, r: 0.75 + R_() * 0.5, w: R_(),
    }));
    // The smoke column that stands over the crater for the rest of the
    // footage: puffs let go one after another, each drifting downwind and
    // swelling as it thins. Offsets and speeds in tiles.
    R.plume = Array.from({ length: big ? 70 : 48 }, (_, i) => ({
      t0: 0.5 + i * 0.2 + R_() * 0.15, ox: (R_() - 0.5) * 4.5 * R.size, oy: (R_() - 0.5) * 4.5 * R.size,
      vx: 1.7 + R_() * 1.5, vy: -0.25 - R_() * 0.55, r0: 2.2 + R_() * 1.6, life: 7 + R_() * 4, shade: R_(),
    }));
    // Debris and embers. Top-down, so they fly out and drag to a stop
    // rather than falling.
    const x = _sx(R.c * TILE), y = _sy(R.r * TILE);
    const n = big ? 240 : 130;
    for (let i = 0; i < n; i++) {
      const a = R_() * Math.PI * 2, sp = (220 + R_() * 1200) * R.size;
      const chunk = R_() < 0.25;
      sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.8 + R_() * (chunk ? 2.4 : 1.4), age: 0,
                    hot: true, drag: true, chunk, sz: chunk ? 2 + R_() * 3 : 0 });
    }
  }

  // Fire colour ramp: 1 = white-hot core, 0 = dull ember red.
  function _heat(h) {
    const stops = [[0, 90, 18, 4], [0.35, 225, 70, 12], [0.62, 255, 160, 40], [0.85, 255, 232, 150], [1, 255, 255, 240]];
    for (let i = 1; i < stops.length; i++) {
      if (h <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i], t = (h - a[0]) / (b[0] - a[0]);
        return [a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0, a[3] + (b[3] - a[3]) * t | 0];
      }
    }
    return [255, 255, 240];
  }
  // A soft puff, baked once and stamped for every piece of smoke or mist.
  let _mistSpr = null;
  function _puffSprite(rgb, a) {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const q = c.getContext('2d'), gr = q.createRadialGradient(48, 48, 4, 48, 48, 48);
    gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(0.55, `rgba(${rgb},${a * 0.6})`); gr.addColorStop(1, `rgba(${rgb},0)`);
    q.fillStyle = gr; q.fillRect(0, 0, 96, 96);
    return c;
  }
  const _mistSprite  = () => _mistSpr  || (_mistSpr  = _puffSprite('214,224,230', 0.9));
  function _glow(g, x, y, r, rgb, a) {
    if (r <= 0 || a <= 0) return;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${rgb},${a})`);
    gr.addColorStop(0.45, `rgba(${rgb},${a * 0.55})`);
    gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // One reactor going up, in screen space. Layered bottom to top: ground
  // scar, dust wall, smoke, fire, the cap ring, shock ring, then the flash
  // and lens streak. The dust, smoke, fire and cap are the billows every
  // explosion in the game is drawn with (LightningDamageSystem's fire and
  // smoke sprites), so the blast in the footage is the same fire the
  // player will later see in their own city.
  function _drawExplosion(g, R, x, y, T, W, H) {
    const L = LightningDamageSystem;
    const btReal = clock - R.boomed;
    const bt = btReal * 0.65, S = R.size, big = S > 1.2;   // fire, smoke and cap unfold ~1.5x slower
    const wind = bt * T * 0.35;   // everything airborne leans downwind

    // Scorched crater where the containment stood, its core still burning.
    const cr = Math.min(9, 6.6 * S) * T;
    const cg = g.createRadialGradient(x, y, cr * 0.35, x, y, cr * 1.25);
    cg.addColorStop(0, 'rgba(6,5,4,0.92)'); cg.addColorStop(0.7, 'rgba(10,8,6,0.8)'); cg.addColorStop(1, 'rgba(10,8,6,0)');
    g.fillStyle = cg; g.fillRect(x - cr * 1.25, y - cr * 1.25, cr * 2.5, cr * 2.5);
    g.save(); g.globalCompositeOperation = 'lighter';
    _glow(g, x, y, cr * 0.8, '255,90,20', 0.4 + 0.14 * Math.sin(clock * 6 + R.c));
    _glow(g, x, y, cr * 0.3, '255,220,150', 0.5 + 0.2 * Math.sin(clock * 11 + R.r));
    g.restore();

    // Light thrown across the whole city, fading over a few seconds.
    if (bt < 5) {
      g.save(); g.globalCompositeOperation = 'lighter';
      _glow(g, x, y, Math.max(W, H) * (0.6 + 0.4 * S), '255,120,40', Math.pow(1 - bt / 5, 2) * 0.26 * S);
      g.restore();
    }

    // Dust wall: a thick brown ring of billows kicked up off the ground,
    // slower than the shock front.
    if (bt < 3.6) {
      const u = easeOut(bt / 3.6);
      const rr = u * (R.reach || 55 * S) * 0.47 * T, n = big ? 60 : 44, dust = L.smokeBillow(0, 0.35, true);
      g.globalAlpha = 0.6 * (1 - u);
      for (let i = 0; i < n; i++) {
        const j = (i * 0.618034) % 1;      // fixed per billow, so the ring doesn't shimmer
        const a = (i + j * 0.8) / n * 6.2832;
        const pr = (0.9 + 1.8 * u) * S * T * (0.75 + 0.5 * j);
        g.drawImage(dust, x + wind * 0.3 + Math.cos(a) * rr - pr, y + Math.sin(a) * rr - pr, pr * 2, pr * 2);
      }
      g.globalAlpha = 1;
    }

    // Fireball puffs: soot body first, fire over it, then a little of its
    // light on top so it glows rather than sitting on the picture.
    const spread = (3.0 + 3.3 * S) * T, maxR = (3.2 + 3.5 * S) * T;   // big enough to swallow the 17-tile reactor
    const puffAt = p => {
      const t = bt - p.dl;
      const grow = easeOut(Math.min(1, Math.max(0, t) / 0.55));
      const a = p.a + p.spin * t;
      return {
        t,
        x: x + Math.cos(a) * p.d * spread * grow + wind * (0.5 + p.d),
        y: y + Math.sin(a) * p.d * spread * grow,
        r: p.r * maxR * (0.55 + 0.45 * grow) * (1 + Math.max(0, t) * 0.14),
        heat: clamp01(1 - t / (1.7 + 1.1 * S) - p.d * 0.25),
      };
    };
    for (const p of R.puffs) {
      const q = puffAt(p);
      if (q.t < 0) continue;
      const smoke = Math.min(0.85, (1 - q.heat) * 1.3) * clamp01(1 - (q.t - 6) / 3);
      if (smoke > 0.02) {
        // Lit from within while the fire is still in it.
        const sr = q.r * 1.1;
        g.globalAlpha = smoke;
        g.drawImage(L.smokeBillow(Math.min(1, q.heat * 2), 0), q.x - sr, q.y - sr, sr * 2, sr * 2);
      }
    }
    for (const p of R.puffs) {
      const q = puffAt(p);
      if (q.t < 0 || q.heat <= 0) continue;
      const flick = 0.85 + 0.15 * Math.sin(clock * 23 + p.a * 7);
      const fr = q.r * (0.75 + q.heat * 0.3);
      g.globalAlpha = Math.min(1, q.heat * 2) * flick;
      g.drawImage(L.fireBillow(1 - q.heat), q.x - fr, q.y - fr, fr * 2, fr * 2);
    }
    g.globalAlpha = 1;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const p of R.puffs) {
      const q = puffAt(p);
      if (q.t < 0 || q.heat <= 0) continue;
      _glow(g, q.x, q.y, q.r * (0.9 + q.heat * 0.4), _heat(q.heat).join(','), Math.min(1, q.heat * 1.4) * 0.35);
    }
    g.restore();

    // The cap: a ring of smoke rolling outward, lit orange from beneath.
    if (bt > 0.35) {
      const ct = bt - 0.35;
      const ringR = (2.6 + 6.0 * easeOut(Math.min(1, ct / 4.5))) * S * T;
      const roll = ct * 0.25;
      const under = clamp01(1 - ct / 3.2);
      for (const c of R.cap) {
        const a = c.a + roll;
        const px = x + Math.cos(a) * ringR + wind * 1.2, py = y + Math.sin(a) * ringR * 0.92;
        const pr = (1.4 + c.r * 1.2) * S * T * (1 + ct * 0.12);
        const al = Math.min(0.8, ct * 1.6) * clamp01(1 - (ct - 6) / 3);
        // Thinner than the soot puffs, built in slowly and small while the
        // ring is still tight: the billow is near-opaque where the old
        // gradient faded off, and early on the whole ring piles up into a
        // grey disc right over the fireball it should be rolling round.
        const grow = clamp01(ct / 1.5);
        const cr = pr * 0.95 * (0.55 + 0.45 * grow);
        g.globalAlpha = al * 0.5 * grow;
        g.drawImage(L.smokeBillow(under, 0.1 * c.w, true), px - cr, py - cr, cr * 2, cr * 2);
        g.globalAlpha = 1;
        // The billow is lit from below; seen from above the light comes
        // from the fireball in the middle, so add it on that side.
        if (under > 0) {
          g.save(); g.globalCompositeOperation = 'lighter';
          _glow(g, px - Math.cos(a) * pr * 0.35, py - Math.sin(a) * pr * 0.35, pr * 0.8, '255,130,40', 0.35 * under);
          g.restore();
        }
      }
    }

    // Smoke column, standing over the crater and trailing off downwind.
    // Lit orange from below while still over the fire, greying as it thins.
    if (R.plume) {
      for (const p of R.plume) {
        const age = btReal - p.t0;
        if (age <= 0 || age >= p.life) continue;
        const u = age / p.life;
        const pr = p.r0 * (1 + u * 2.6) * T;
        const pxq = x + (p.ox + p.vx * age) * T, pyq = y + (p.oy + p.vy * age) * T;
        if (pxq < -pr || pxq > W + pr || pyq < -pr || pyq > H + pr) continue;
        // Thickening slowly: each billow is born over the fireball and is
        // painted after it, so at full strength straight away the column
        // buries the fire under a grey ball. By the time it is dense it has
        // drifted downwind.
        g.globalAlpha = clamp01((age - 0.35) * 0.6) * (1 - u) * (0.55 + 0.25 * p.shade);
        g.drawImage(L.smokeBillow(age < 1.6 ? 1 - age / 1.6 : 0, 0.15 * p.shade + 0.3 * u, true), pxq - pr, pyq - pr, pr * 2, pr * 2);
      }
      g.globalAlpha = 1;
    }

    // Shock front: a hard white ring with a faint echo behind it.
    const frontT = R.reach && R.speed ? R.reach / R.speed : 1.6;
    if (btReal < frontT) {
      const u = btReal / frontT;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.shadowColor = 'rgba(255,200,140,1)'; g.shadowBlur = 24;
      g.strokeStyle = `rgba(255,245,225,${0.95 * (1 - u)})`;
      g.lineWidth = (3 + 5 * (1 - u)) * S;
      g.beginPath(); g.arc(x, y, u * (R.reach || 55 * S) * T, 0, 6.2832); g.stroke();
      g.strokeStyle = `rgba(255,190,120,${0.4 * (1 - u)})`;
      g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, u * (R.reach || 55 * S) * T * 0.82, 0, 6.2832); g.stroke();
      g.restore();
    }

    // Detonation: a blinding core and an anamorphic streak across the lens.
    if (bt < 0.7) {
      const u = bt / 0.7, a = Math.pow(1 - u, 2);
      g.save(); g.globalCompositeOperation = 'lighter';
      _glow(g, x, y, (5 + 8 * S) * T * (0.6 + u), '255,252,235', a);
      const len = W * (0.5 + 0.6 * S) * (0.7 + u * 0.5), th = (big ? 10 : 6) * (1 - u * 0.5);
      const sg = g.createLinearGradient(x - len, y, x + len, y);
      sg.addColorStop(0, 'rgba(120,200,255,0)');
      sg.addColorStop(0.5, `rgba(255,250,240,${a})`);
      sg.addColorStop(1, 'rgba(120,200,255,0)');
      g.fillStyle = sg;
      g.fillRect(x - len, y - th / 2, len * 2, th);
      g.fillStyle = `rgba(160,210,255,${a * 0.35})`;
      g.fillRect(x - len * 0.7, y - th * 2, len * 1.4, th * 4);
      g.restore();
    }
  }

  // ── Timeline ────────────────────────────────────────────────────────
  function _timeline(city) {
    // 1. Archive cue.
    _bars('', '');
    _terminal([
      ['SOURCE .......... ', `${OLD_COMPANY.toUpperCase()} SECURITY FEED`],
      ['LOCATION ........ ', city.toUpperCase()],
      ['RECORDED ........ ', '20 YEARS AGO'],
      ['STATUS .......... ', 'LAST KNOWN FOOTAGE', true],
    ], 0.5, FB_AT - 0.5);

    // 2. The footage: establishing shots, then the end of it.
    schedule(FB_AT, () => {
      if (!OldCity.isBaked()) OldCity.finishBake();
      phase = 'archive';
      root.classList.add('archive');
      document.body.classList.add('gw-archive');
      $('.gi-black').classList.add('out');
      _static(0.4, 0.12);
      cityAmb = _loop('audio/sfx/cityambience.mp3', 0.45);
    });
    SHOTS.forEach((shot, i) => schedule(FB_AT + shot.at, () => _cutTo(shot, i)));
    _caption(`${city}. Twenty years ago.`, FB_AT + 1.2, 4.2);
    _caption('Thousands of people called it home.', FB_AT + 13.4, 4.2);
    _caption('A city on the rise.', FB_AT + 25.4, 4.0);
    _caption('And every light in it ran on nuclear power.', FB_AT + 31.5, 3.8);
    _caption(`${OLD_COMPANY} ran every reactor in the valley.`, FB_AT + 37.2, 3.4);
    _caption('They cut every corner they could find.', FB_AT + 41.0, 3.2);
    // Alarms over the power station, into the wide shot.
    for (let a = BOOM_AT - 3.6; a < BOOM_AT; a += 0.85) schedule(a, () => sfx('meltdownAlarm', 0.1));
    schedule(BOOM_AT - 0.9, () => sfx('doomAlarm', 0.14));
    REACTORS.forEach((_, i) => schedule(BOOM_AT + REACTORS[i].at, () => _explode(oldCity.reactors[i])));
    // Hold on the reactors through the chain, then follow the last front
    // back across the city.
    schedule(BOOM_AT + 6.6, () => {
      camAnim = { at: clock, dur: 7.5, fromC: _camCentre(), toC: OldCity.shotCentre('wideEnd'), fromZ: Camera.zoom / _zk(), toZ: 0.31 };
    });
    schedule(BOOM_AT + 0.1, () => { _fadeOut(cityAmb, 0.6); cityAmb = null; });
    schedule(BOOM_AT + 0.5, () => { screams = _loop('audio/sfx/screaming.mp3', 0.6); if (screams) screams.loop = false; });
    _caption(`In one night, ${city} was gone.`, BOOM_AT + 10.3, 5.3);
    // Signal lost.
    schedule(CUT_AT - 0.7, () => { root.classList.add('glitching'); _static(0.8, 0.22); _fadeOut(screams, 0.7); screams = null; });
    schedule(CUT_AT, () => {
      root.classList.remove('glitching', 'archive');
      document.body.classList.remove('gw-archive');
      // A hard cut to black, not a fade.
      const blk = $('.gi-black');
      blk.style.transition = 'none';
      blk.classList.remove('out');
      void blk.offsetWidth;
      blk.style.transition = '';
      const cap = $('.gi-caption');
      cap.style.transition = 'none';
      cap.classList.remove('show');
      void cap.offsetWidth;
      cap.style.transition = '';
      phase = 'later';
      oldCity = null; sparks = []; ash = [];
      try { ghost = OldCity.traces(); } catch (_e) { ghost = null; }
      _camLook(null);
      tearT = 0;
      OldCity.reset();
      _bars('', '', 'SIGNAL LOST');
      _setCam(camAnim.fromC, camAnim.fromZ);
    });

    // 3. Twenty years on.
    schedule(LATER_AT, () => {
      const ch = $('.gi-chapter');
      ch.textContent = '20 YEARS LATER';
      ch.classList.add('in');
      _bars('', '', '');
      sfx('thump');
    });
    schedule(FIRST_SONG_AT, _firstSong);
    schedule(LATER_AT + 4.0, () => $('.gi-chapter').classList.add('out'));
    _terminal([
      ['EXCLUSION ZONE .. ', 'LIFTED'],
      ['GRID STATUS ..... ', 'NOT FOUND', true],
    ], LATER_AT + 4.7, PRESENT_AT - 0.3);
    schedule(PRESENT_AT, () => {
      phase = 'drift';
      _startDawn();
      $('.gi-black').classList.add('out');
      _bars(`● ${city.toUpperCase()}`, 'DAY 1  ·  05:00');
    });
    _caption('The fallout has cleared. The land has grown back.', PRESENT_AT + 1.2, 4.2);
    _caption('But no one has switched the lights back on.', PRESENT_AT + 6.0, 3.8);
    _caption('Until now.', PRESENT_AT + 10.6, 3.2);

    // 4. Lock on, then the letter.
    schedule(LOCK_AT, () => { lockAt = clock; _play('audio/sfx/scan.mp3', 0.35); });
    schedule(LETTER_AT, _showLetter);
  }

  function _showLetter() {
    phase = 'letter';
    const L = $('.gi-letter');
    L.classList.toggle('centred', !_letterSide());
    L.classList.add('in');
    sfx('request');
    const city = CityInfo.getCityName(), company = CityInfo.getCompanyName();
    const body =
      `Twenty years ago, ${OLD_COMPANY} cut every corner in ${city}, until the night ` +
      `its reactors went up and took the city with them.

` +
      `The exclusion zone has finally been lifted. The land is clean and people want to ` +
      `come home, but no one comes home to a dark city.

` +
      `The council has voted: ${company} is to rebuild ${city}'s power grid from nothing; ` +
      `and do it right this time. City Hall will be your first customer.

` +
      `Build it. Grow it. Don't repeat history.`;
    schedule(clock + 0.7, () => type($('.gi-body'), body, LETTER_CPS, () => {
      letterReady = true;
      const b = $('.gi-accept');
      b.disabled = false;
      b.classList.add('ready');
    }));
  }

  function _accept() {
    if (phase !== 'letter') return;
    phase = 'power';
    letterReady = false;
    const b = $('.gi-accept');
    b.disabled = true;
    b.classList.remove('ready');
    sfx('click');
    const A = clock;

    // Stamp, then the company signs.
    schedule(A + 0.15, () => { $('.gi-stamp').classList.add('slam'); sfx('thump'); Camera.shake(5); });
    schedule(A + 0.45, () => type($('.gi-sig-co'), CityInfo.getCompanyName(), 26, null, 0.8));

    // Letter away, camera settles square on City Hall.
    schedule(A + 1.6, () => {
      $('.gi-letter').classList.add('out');
      camAnim = { at: clock, dur: 1.4, fromC: _camCentre(), toC: { x: hall.cx, y: hall.cy }, fromZ: Camera.zoom / _zk(), toZ: 1 };
    });

    // Charge… then the strike.
    schedule(A + 2.5, () => sfx('spark'));
    schedule(A + 3.1, _strike);

    // Title card.
    schedule(A + 4.0, () => { $('.gi-title').classList.add('in'); sfx('goodConnect', 0.22); });
    schedule(A + 5.4, () => sfx('unlock'));

    // The title card holds until the player is ready: once it has fully
    // landed, a prompt appears and click / Enter / Space / A begins.
    schedule(A + 6.6, () => {
      phase = 'title';
      _refreshPadLabels();
      $('.gi-title-go').classList.add('in');
    });
  }

  // Hand the city over. (Not `_begin`: that is the entry point further
  // down, and a second function of that name silently replaced this one,
  // which left the title card's "click to begin" doing nothing.)
  function _handOver() {
    if (phase !== 'title') return;
    phase = 'out';
    sfx('click');
    $('.gi-title').classList.add('out');
    root.classList.add('ending');
    _revealHud();
    schedule(clock + 1.1, () => _finish(false));
  }

  function _strike() {
    boltAt = clock;
    boltNext = 0;
    sfx('lightningStrike', 0.6);
    setTimeout(() => sfx('thunder', 0.45), 260);
    Camera.shake(30);
    setTimeout(() => active && Camera.shake(14), 340);   // the return stroke
    const h = _hallScreen();
    for (let i = 0; i < 170; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 140 + Math.random() * 760;
      sparks.push({
        x: h.cx, y: h.y + h.h * 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 180,
        life: 0.5 + Math.random() * 0.9, age: 0, hot: Math.random() < 0.55,
      });
    }
  }

  // ── Drawing helpers ─────────────────────────────────────────────────
  function _jag(x1, y1, x2, y2, disp, out) {
    if (disp < 3) { out.push([x2, y2]); return; }
    const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * disp;
    const my = (y1 + y2) / 2 + (Math.random() - 0.5) * disp * 0.35;
    _jag(x1, y1, mx, my, disp / 2, out);
    _jag(mx, my, x2, y2, disp / 2, out);
  }
  function _makeBolt(h) {
    const top = { x: h.cx + (Math.random() - 0.5) * 220, y: -30 };
    const hit = { x: h.cx, y: h.y + h.h * 0.25 };
    const main = [[top.x, top.y]];
    _jag(top.x, top.y, hit.x, hit.y, 240, main);
    const branches = [];
    for (let i = 0; i < 8; i++) {
      const p = main[Math.floor(main.length * (0.12 + Math.random() * 0.62))];
      const b = [[p[0], p[1]]];
      _jag(p[0], p[1], p[0] + (Math.random() - 0.5) * 420, p[1] + 70 + Math.random() * 200, 110, b);
      branches.push(b);
      // …and a twig off every other branch.
      if (i % 2 === 0) {
        const q = b[Math.floor(b.length * 0.6)], t = [[q[0], q[1]]];
        _jag(q[0], q[1], q[0] + (Math.random() - 0.5) * 180, q[1] + 40 + Math.random() * 90, 50, t);
        branches.push(t);
      }
    }
    // Where it earths: arcs crawling out across the ground from the hall.
    const ground = [];
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2, len = Math.max(h.w, h.h) * (0.7 + Math.random() * 1.3);
      const g0 = [[h.cx + Math.cos(a) * h.w * 0.3, h.cy + Math.sin(a) * h.h * 0.3]];
      _jag(g0[0][0], g0[0][1], h.cx + Math.cos(a) * len, h.cy + Math.sin(a) * len, len * 0.3, g0);
      ground.push(g0);
    }
    return { main, branches, ground };
  }
  function _stroke(g, pts, w, col, blur) {
    g.save();
    g.shadowColor = col; g.shadowBlur = blur;
    g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    g.stroke();
    g.restore();
  }
  function _circle(g, x, y, r, fill) { g.fillStyle = fill; g.beginPath(); g.arc(x, y, Math.max(0, r), 0, 6.2832); g.fill(); }

  // ── The flashback ───────────────────────────────────────────────────
  function _drawOldCity(g, W, H, dt) {
    const z = Camera.zoom, T = TILE * z;
    // The old city and its countryside cover the whole view; a light veil
    // keeps the night-footage mood.
    g.fillStyle = 'rgba(8,7,6,0.18)';
    g.fillRect(0, 0, W, H);

    const firstBoom = oldCity.reactors.reduce((m, R) => R.boomed != null ? Math.min(m, R.boomed) : m, Infinity);

    // The city itself — buildings, traffic, people, planes, ruins and fires.
    OldCity.draw(g, clock, dt, window.devicePixelRatio || 1, _shx, _shy);

    // Trouble at the station before it goes. First the relief valves lift
    // and each reactor starts venting; then the warning beacons come on, a
    // red wash over the containment with a beam sweeping round it. A reactor
    // keeps both until the moment it goes.
    if (clock > BOOM_AT - VENT_LEAD) {
      const vent = clamp01((clock - (BOOM_AT - VENT_LEAD)) / 2.5);
      const warn = clamp01((clock - (BOOM_AT - ALARM_LEAD)) / 1.5);
      const mist = _mistSprite();
      for (const R of oldCity.reactors) {
        if (R.boomed != null) continue;
        const x = _sx(R.c * TILE), y = _sy(R.r * TILE);
        for (let i = 0; i < 7; i++) {
          const ph = (clock * 0.32 + i / 7 + R.c * 0.137) % 1;
          const pr = (1.0 + ph * 3.2) * T;
          g.globalAlpha = 0.34 * vent * (1 - ph) * Math.min(1, ph * 6);
          g.drawImage(mist, x + (5.6 + ph * 7) * T - pr, y - (5.6 + ph * 2.2) * T + Math.sin(ph * 5 + i) * T * 0.5 - pr, pr * 2, pr * 2);
        }
        g.globalAlpha = 1;
        if (warn > 0) {
          const blink = 0.5 + 0.5 * Math.sin(clock * 9 + R.r);
          g.save(); g.globalCompositeOperation = 'lighter';
          _glow(g, x, y, 12 * T, '255,36,22', 0.34 * warn * (0.35 + 0.65 * blink));
          const a0 = clock * 3.4 + R.c;
          for (const a of [a0, a0 + Math.PI]) {
            const bg = g.createRadialGradient(x, y, T, x, y, 17 * T);
            bg.addColorStop(0, `rgba(255,70,40,${0.42 * warn})`); bg.addColorStop(1, 'rgba(255,40,20,0)');
            g.fillStyle = bg;
            g.beginPath(); g.moveTo(x, y); g.arc(x, y, 17 * T, a - 0.2, a + 0.2); g.closePath(); g.fill();
          }
          _glow(g, x, y, 1.6 * T, '255,220,200', 0.9 * warn * blink);
          g.restore();
        }
      }
    }
    // Explosions go over every tower, so a later blast's fire and smoke
    // roll over the earlier craters rather than under them.
    for (const R of oldCity.reactors) {
      if (R.boomed != null) _drawExplosion(g, R, _sx(R.c * TILE), _sy(R.r * TILE), T, W, H);
    }

    // Flash — the last one whites the whole frame out.
    for (const R of oldCity.reactors) {
      if (R.boomed == null) continue;
      const bt = clock - R.boomed;
      const peak = R.size > 1.2 ? 1 : 0.75;
      const f = bt < 0.06 ? peak : Math.max(0, peak - (bt - 0.06) / (R.size > 1.2 ? 1.1 : 0.5));
      if (f > 0) { g.fillStyle = `rgba(255,248,230,${f})`; g.fillRect(0, 0, W, H); }
    }

    // After it's over: ash drifting down, and a red cast over everything.
    if (firstBoom < Infinity) {
      const since = clock - firstBoom;
      g.fillStyle = `rgba(120,24,4,${Math.min(0.28, since * 0.08)})`;
      g.fillRect(0, 0, W, H);
      if (ash.length < 160 && Math.random() < 0.9) {
        for (let i = 0; i < 3; i++) ash.push({ x: Math.random() * W, y: -10, vx: 20 + Math.random() * 30, vy: 30 + Math.random() * 50, s: 1 + Math.random() * 2.5, ph: Math.random() * 6 });
      }
    }

    // Interference: a soft dark bar rolling down the frame on the cameras
    // that have it, and on every camera once the plant has started to go.
    if (rollBar || firstBoom < Infinity) {
      const by = ((clock * 0.21) % 1.35 - 0.2) * H, bh = H * 0.13;
      const rg = g.createLinearGradient(0, by, 0, by + bh);
      rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(0.5, 'rgba(0,0,0,0.2)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(0, by, W, bh);
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, by + bh * 0.5, W, 1.5);
    }
  }

  // ── The present day ─────────────────────────────────────────────────
  // The map is real and it is 05:00, which the game draws close to black.
  // For this shot the cinematic borrows the light of the dawn that is about
  // an hour off: DayNight.darkness is eased down to DAWN_DARK (and handed
  // back afterwards, see _releaseDawn), low sun rakes in from the east and
  // ground mist lies in drifts. Under the regrowth, faintly, the streets of
  // the city that stood here.
  function _startDawn() {
    if (realDark || typeof DayNight === 'undefined') return;
    realDark = DayNight.darkness;
    DayNight.darkness = () => { const d = realDark(); return d - (d - Math.min(d, DAWN_DARK)) * dawnK; };
    dawnTarget = 1;
  }
  // Give the game its own light back. Eased over a few seconds after the
  // hand-over (the sim's clock is running by then), not snapped.
  function _releaseDawn() {
    if (!realDark) return;
    const fn = realDark, k0 = dawnK, t0 = performance.now();
    realDark = null; dawnK = 0; dawnTarget = 0;
    const step = () => {
      const u = (performance.now() - t0) / 6000;
      if (u >= 1 || k0 <= 0) { DayNight.darkness = fn; return; }
      const k = k0 * (1 - ease(u));
      DayNight.darkness = () => { const d = fn(); return d - (d - Math.min(d, DAWN_DARK)) * k; };
      setTimeout(step, 50);
    };
    step();
  }

  function _drawDawn(g, W, H) {
    const k = dawnK * (phase === 'out' ? 0.4 : 1);
    if (k <= 0.01) return;
    const z = Camera.zoom, T = TILE * z;

    // What the old city left in the ground, read the way ruins read from the
    // air: the street grid as pale worn strips with scraps of asphalt and
    // paint, and every building as the outline of its foundations. The
    // streets alone looked like stray roads; it is the blocks of footings
    // between them that make it a town. Seen on the way in, and gone by the
    // time the camera is down at City Hall.
    const gk = k * clamp01((0.92 - z) / 0.3);
    if (ghost && gk > 0.01) {
      g.save();
      // Not across City Hall's own grounds.
      const hp = 4 * T, hs = _hallScreen();
      g.beginPath(); g.rect(0, 0, W, H); g.rect(hs.x - hp, hs.y - hp, hs.w + hp * 2, hs.h + hp * 2); g.clip('evenodd');
      g.lineCap = 'butt';
      // Foundations first, so the streets lie over their edges.
      for (const p of ghost.plots || []) {
        const x = _sx(p.x * TILE), y = _sy(p.y * TILE), w = p.w * T, h = p.h * T;
        if (x > W || y > H || x + w < 0 || y + h < 0) continue;
        const i = 0.16 * T;
        g.fillStyle = `rgba(14,20,10,${0.16 * gk})`; g.fillRect(x + i, y + i, w - i * 2, h - i * 2);
        g.strokeStyle = `rgba(214,208,184,${0.26 * gk})`; g.lineWidth = Math.max(1, T * 0.2);
        // Walls stand in stretches; the breaks differ plot to plot.
        g.setLineDash([T * 1.9, T * 0.5, T * 0.8, T * 0.35, T * 2.6, T * 0.7]);
        g.lineDashOffset = (p.x * 3 + p.y * 5) * T * 0.37;
        g.strokeRect(x + i, y + i, w - i * 2, h - i * 2);
      }
      // The roadbed: thin soil over hardcore, so the grass on it is pale.
      // Unbroken, which is what lets the grid read as a grid, and filled as
      // one shape so crossings are no brighter than the streets.
      g.beginPath();
      for (const rd of ghost.roads) g.rect(_sx(rd.x * TILE), _sy(rd.y * TILE), rd.w * T, rd.h * T);
      g.fillStyle = `rgba(198,190,150,${0.17 * gk})`; g.fill();
      for (const rd of ghost.roads) {
        const rx = _sx(rd.x * TILE), ry = _sy(rd.y * TILE), rw = rd.w * T, rh = rd.h * T;
        if (rx > W || ry > H || rx + rw < 0 || ry + rh < 0) continue;
        const wide = rd.horiz ? rh : rw;
        const line = () => {
          g.beginPath();
          if (rd.horiz) { g.moveTo(rx, ry + rh / 2); g.lineTo(rx + rw, ry + rh / 2); }
          else { g.moveTo(rx + rw / 2, ry); g.lineTo(rx + rw / 2, ry + rh); }
          g.stroke();
        };
        g.lineDashOffset = (rd.x * 7 + rd.y * 13) * T;
        // Asphalt that has not been swallowed yet, in slabs.
        g.strokeStyle = `rgba(52,56,54,${0.42 * gk})`; g.lineWidth = wide * 0.7;
        g.setLineDash([T * 2.6, T * 3.2, T * 1.3, T * 4.6, T * 3.8, T * 2.4]);
        line();
        // …and the paint still on it.
        g.strokeStyle = `rgba(240,226,170,${0.5 * gk})`; g.lineWidth = Math.max(1, T * 0.12);
        g.setLineDash([T * 0.55, T * 0.75, T * 0.55, T * 0.75, T * 0.55, T * 3.8, T * 0.55, T * 5.2, T * 0.55, T * 0.75, T * 0.55, T * 2.6]);
        line();
      }
      g.setLineDash([]); g.lineDashOffset = 0;
      // The reactor sites: a dark hollow ringed with thicker growth.
      for (const R of ghost.reactors) {
        const x = _sx(R.c * TILE), y = _sy(R.r * TILE);
        if (x < -12 * T || x > W + 12 * T || y < -12 * T || y > H + 12 * T) continue;
        _circle(g, x, y, 7 * T, `rgba(8,10,6,${0.34 * gk})`);
        g.strokeStyle = `rgba(150,196,120,${0.2 * gk})`; g.lineWidth = 1.4 * T;
        g.beginPath(); g.arc(x, y, 8.6 * T, 0, 6.2832); g.stroke();
      }
      g.restore();
    }

    // Ground mist, anchored to the land so it slides past as the camera moves.
    const mist = _mistSprite();
    for (let i = 0; i < 18; i++) {
      const ax = Math.sin(i * 12.9898) * 43758.5453, ay = Math.sin(i * 78.233) * 12543.123;
      const fxq = ax - Math.floor(ax), fyq = ay - Math.floor(ay);
      const wx = hall.cx + (fxq - 0.5) * 110 * TILE + clock * 9 * (0.6 + fyq);
      const wy = hall.cy + (fyq - 0.5) * 70 * TILE + Math.sin(clock * 0.2 + i) * TILE;
      const rw = (11 + fxq * 12) * T, rh = rw * (0.34 + fyq * 0.2);
      const x = _sx(wx), y = _sy(wy);
      if (x + rw < 0 || x - rw > W || y + rh < 0 || y - rh > H) continue;
      g.globalAlpha = (0.10 + 0.07 * fyq) * k;
      g.drawImage(mist, x - rw, y - rh, rw * 2, rh * 2);
    }
    g.globalAlpha = 1;

    // First light: warm from the east, cool shadow still lying to the west.
    g.save(); g.globalCompositeOperation = 'screen';
    const sun = g.createLinearGradient(W, H * 0.15, 0, H * 0.7);
    sun.addColorStop(0, `rgba(255,190,120,${0.20 * k})`);
    sun.addColorStop(0.45, `rgba(255,170,120,${0.07 * k})`);
    sun.addColorStop(1, 'rgba(120,150,200,0)');
    g.fillStyle = sun; g.fillRect(0, 0, W, H);
    g.restore();
  }

  // ── Per-frame drawing (overlay canvas, screen space) ────────────────
  function _draw(dt) {
    const g = fxCtx, W = window.innerWidth, H = window.innerHeight;
    g.clearRect(0, 0, W, H);
    if (!hall) return;
    // Ride the same shake as the map underneath (camera.js shakeOffset()).
    const mag = Camera.getShake ? Camera.getShake() : 0, sn = performance.now() / 1000;
    _shx = mag > 0.05 ? mag * (Math.sin(sn * 47) * 0.6 + Math.sin(sn * 83 + 1.7) * 0.4) : 0;
    _shy = mag > 0.05 ? mag * (Math.sin(sn * 53 + 2.1) * 0.6 + Math.sin(sn * 71) * 0.4) : 0;
    g.save();
    if (mag > 0.05) g.translate(_shx, _shy);
    _drawScene(g, W, H, dt);
    g.restore();
    // A torn frame: bands of the picture knocked sideways.
    if (clock < tearT && phase === 'archive') {
      const dpr = fx.width / W;
      for (let i = 0; i < 4; i++) {
        const y = Math.random() * H, bh = 6 + Math.random() * 46, dx = (Math.random() - 0.5) * 90;
        g.drawImage(fx, 0, y * dpr, fx.width, bh * dpr, dx, y, W, bh);
      }
    }
  }

  function _drawScene(g, W, H, dt) {
    if (oldCity && phase === 'archive') _drawOldCity(g, W, H, dt);
    if (realDark) _drawDawn(g, W, H);

    const h = _hallScreen();

    // Reticle: closes in on City Hall, then fades once the strike lands.
    if (lockAt >= 0) {
      const u = ease(clamp01((clock - lockAt) / 0.55));
      const fade = boltAt >= 0 ? clamp01(1 - (clock - boltAt) / 0.4) : (phase === 'power' ? 0.8 : 1);
      if (fade > 0) {
        const pad = 10 + 90 * (1 - u);
        const x0 = h.x - pad, y0 = h.y - pad, x1 = h.x + h.w + pad, y1 = h.y + h.h + pad;
        const L = Math.min(22, (x1 - x0) * 0.25);
        const pulse = 0.65 + 0.35 * Math.sin(clock * 7);
        g.save();
        g.globalAlpha = fade * u;
        g.strokeStyle = `rgba(255,90,90,${pulse})`;
        g.shadowColor = 'rgba(255,60,60,0.9)'; g.shadowBlur = 10;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x0, y0 + L); g.lineTo(x0, y0); g.lineTo(x0 + L, y0);
        g.moveTo(x1 - L, y0); g.lineTo(x1, y0); g.lineTo(x1, y0 + L);
        g.moveTo(x1, y1 - L); g.lineTo(x1, y1); g.lineTo(x1 - L, y1);
        g.moveTo(x0 + L, y1); g.lineTo(x0, y1); g.lineTo(x0, y1 - L);
        g.stroke();
        g.shadowBlur = 0;
        g.font = '600 11px "JetBrains Mono", monospace';
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.fillText('CITY HALL', x0, y1 + 16);
        g.fillStyle = `rgba(255,100,100,${pulse})`;
        g.fillText('0 kW  ·  NO POWER', x0, y1 + 30);

        // A leader line from the target to the letter it's about.
        const letter = root.querySelector('.gi-letter.in:not(.out):not(.centred)');
        if (letter && u >= 1) {
          const r = letter.getBoundingClientRect();
          g.strokeStyle = 'rgba(0,212,255,0.55)';
          g.setLineDash([4, 5]);
          g.lineDashOffset = -clock * 20;
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x1 + 4, (y0 + y1) / 2);
          g.lineTo(r.left - 8, (y0 + y1) / 2);
          g.stroke();
          g.setLineDash([]);
        }
        g.restore();
      }
    }

    // Charge-up crackle in the moment before the strike.
    if (phase === 'power' && boltAt < 0 && root.querySelector('.gi-letter.out')) {
      if (Math.random() < 0.45) {
        const a = Math.random() * Math.PI * 2, r0 = Math.max(h.w, h.h) * 0.7;
        const pts = [[h.cx + Math.cos(a) * r0, h.cy + Math.sin(a) * r0]];
        _jag(pts[0][0], pts[0][1], h.cx + Math.cos(a + 0.6) * r0 * 0.4, h.cy + Math.sin(a + 0.6) * r0 * 0.4, 30, pts);
        _stroke(g, pts, 1.2, 'rgba(160,240,255,0.9)', 8);
      }
    }

    if (boltAt >= 0) {
      const bt = clock - boltAt;

      // The grid itself, drawn outward by the shockwave.
      const maxR = Math.hypot(W, H) * 1.05;
      const ringU = clamp01(bt / 2.1);
      const R = maxR * (1 - Math.pow(1 - ringU, 2.4));
      const gridFade = bt < 2.1 ? 1 : clamp01(1 - (bt - 2.1) / 1.6);
      if (gridFade > 0 && R > 2) {
        const ts = TILE * Camera.zoom;
        const ox = ((-Camera.x * Camera.zoom) % ts + ts) % ts;
        const oy = ((-Camera.y * Camera.zoom) % ts + ts) % ts;
        const gridPath = () => {
          g.beginPath();
          for (let x = ox; x <= W; x += ts) { g.moveTo(x, 0); g.lineTo(x, H); }
          for (let y = oy; y <= H; y += ts) { g.moveTo(0, y); g.lineTo(W, y); }
        };
        g.save();
        g.beginPath(); g.arc(h.cx, h.cy, R, 0, Math.PI * 2); g.clip();
        g.globalAlpha = 0.26 * gridFade;
        g.strokeStyle = '#00d4ff'; g.lineWidth = 1;
        gridPath(); g.stroke();
        g.restore();
        // Every fifth crossing lights as the front reaches it, the way lamps
        // come on down a street, then settles back.
        const step = ts * 5, tw = 1.5;
        const nx0 = Math.floor(Camera.x / (TILE * 5)), ny0 = Math.floor(Camera.y / (TILE * 5));
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let ix = 0; ix * step <= W + step; ix++) for (let iy = 0; iy * step <= H + step; iy++) {
          const nx = _sx((nx0 + ix) * TILE * 5), ny = _sy((ny0 + iy) * TILE * 5);
          const d = Math.hypot(nx - h.cx, ny - h.cy);
          if (d > R) continue;
          const tHit = 2.1 * (1 - Math.pow(1 - Math.min(1, d / maxR), 1 / 2.4));
          const age = bt - tHit;
          if (age < 0 || age > tw) continue;
          const a = Math.pow(1 - age / tw, 1.5);
          _glow(g, nx, ny, ts * (0.9 + 1.4 * a), '150,236,255', 0.75 * a);
          g.fillStyle = `rgba(255,255,255,${a})`;
          g.fillRect(nx - ts * 0.6 * a, ny - 0.75, ts * 1.2 * a, 1.5); g.fillRect(nx - 0.75, ny - ts * 0.6 * a, 1.5, ts * 1.2 * a);
        }
        g.restore();
        if (ringU < 1) {
          const band = 110;
          g.save();
          g.beginPath();
          g.arc(h.cx, h.cy, R, 0, Math.PI * 2);
          g.arc(h.cx, h.cy, Math.max(0, R - band), 0, Math.PI * 2, true);
          g.clip('evenodd');
          g.globalAlpha = 0.85 * (1 - ringU * 0.6);
          g.strokeStyle = '#8ff0ff'; g.lineWidth = 1.5;
          g.shadowColor = '#00d4ff'; g.shadowBlur = 8;
          gridPath(); g.stroke();
          g.restore();
          g.save();
          g.globalAlpha = 1 - ringU;
          g.strokeStyle = '#d8fbff'; g.lineWidth = 3;
          g.shadowColor = '#00d4ff'; g.shadowBlur = 24;
          g.beginPath(); g.arc(h.cx, h.cy, R, 0, Math.PI * 2); g.stroke();
          g.restore();
        }
      }

      // City Hall's glow.
      const glow = Math.max(0, 1 - bt / 4.2);
      if (glow > 0) {
        const r = Math.max(h.w, h.h) * (1.6 + bt * 0.8);
        const grd = g.createRadialGradient(h.cx, h.cy, 0, h.cx, h.cy, r);
        grd.addColorStop(0, `rgba(255,245,200,${0.85 * glow})`);
        grd.addColorStop(0.35, `rgba(120,220,255,${0.45 * glow})`);
        grd.addColorStop(1, 'rgba(0,120,255,0)');
        g.fillStyle = grd;
        g.fillRect(h.cx - r, h.cy - r, r * 2, r * 2);
      }

      // The bolt: a first stroke, then a return stroke down the same
      // channel a third of a second later, re-forked while each lasts.
      const RET = 0.34;
      if (bt < 0.95) {
        if (!boltPath || bt >= boltNext) { boltPath = _makeBolt(h); boltNext = bt + 0.07; }
        const a = bt < RET ? (bt < 0.1 ? 1 : Math.max(0.18, 1 - (bt - 0.1) / 0.22))
                           : (bt < RET + 0.08 ? 1 : Math.max(0, 1 - (bt - RET - 0.08) / 0.5));
        boltPath.ground.forEach(b => _stroke(g, b, 2, `rgba(170,235,255,${0.75 * a})`, 14));
        boltPath.branches.forEach(b => _stroke(g, b, 2.4, `rgba(170,235,255,${0.75 * a})`, 16));
        _stroke(g, boltPath.main, 22, `rgba(70,170,255,${0.35 * a})`, 70);
        _stroke(g, boltPath.main, 11, `rgba(110,210,255,${0.7 * a})`, 40);
        _stroke(g, boltPath.main, 4.5, `rgba(255,255,255,${a})`, 18);
      }

      const fl = t0 => bt < t0 ? 0 : bt < t0 + 0.08 ? 1 : Math.max(0, 1 - (bt - t0 - 0.08) / 0.7);
      const flash = Math.max(fl(0), 0.75 * fl(RET));
      if (flash > 0) { g.fillStyle = `rgba(235,250,255,${0.9 * flash})`; g.fillRect(0, 0, W, H); }
    }

    // Sparks and debris.
    if (sparks.length) {
      g.save();
      g.lineCap = 'round';
      for (const s of sparks) {
        s.age += dt;
        if (s.drag) { const k = Math.pow(0.12, dt); s.vx *= k; s.vy *= k; }
        else { s.vy += 620 * dt; s.vx *= 0.985; }
        s.x += s.vx * dt; s.y += s.vy * dt;
        const a = 1 - s.age / s.life;
        if (a <= 0) continue;
        if (s.chunk) {
          g.fillStyle = `rgba(20,16,14,${Math.min(1, a * 2)})`;
          g.fillRect(s.x - s.sz / 2, s.y - s.sz / 2, s.sz, s.sz);
          g.fillStyle = `rgba(255,140,50,${a * 0.9})`;
          g.fillRect(s.x - s.sz / 4, s.y - s.sz / 4, s.sz / 2, s.sz / 2);
          continue;
        }
        g.strokeStyle = s.hot ? `rgba(255,${160 + 60 * a | 0},${60 + 60 * a | 0},${a})` : `rgba(140,230,255,${a})`;
        g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(s.x - s.vx * 0.025, s.y - s.vy * 0.025); g.stroke();
      }
      g.restore();
      sparks = sparks.filter(s => s.age < s.life);
    }

    // Ash.
    if (ash.length) {
      for (const p of ash) {
        p.x += (p.vx + Math.sin(clock * 2 + p.ph) * 25) * dt; p.y += p.vy * dt;
        g.fillStyle = p.s > 2.6 ? 'rgba(255,140,60,0.8)' : 'rgba(170,160,150,0.7)';
        g.fillRect(p.x, p.y, p.s, p.s);
      }
      ash = ash.filter(p => p.y < H + 10);
    }
  }

  // ── Skip ────────────────────────────────────────────────────────────
  function _updateSkip(now) {
    const fill = root.querySelector('.gi-skip-fill');
    const u = skipDownAt < 0 ? 0 : clamp01((now - skipDownAt) / 1000 / SKIP_HOLD_S);
    fill.style.transform = `scaleX(${u})`;
    root.querySelector('.gi-skip').classList.toggle('holding', u > 0);
    if (u >= 1) _finish(true);
  }

  // ── Frame ───────────────────────────────────────────────────────────
  function _frame(now) {
    if (!active) return;
    raf = requestAnimationFrame(_frame);
    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0;
    lastNow = now;
    clock += dt;

    // The world stays frozen at 05:00 until the player has it.
    if (typeof DevMode !== 'undefined' && DevMode.timeScale !== 0) DevMode.setTimeScale(0);

    const due = events.filter(e => e.at <= clock);
    if (due.length) {
      events = events.filter(e => e.at > clock);
      due.forEach(e => { try { e.fn(); } catch (err) { console.error('[intro]', err); } });
    }
    if (!active) return;   // an event may have finished the sequence
    if (phase === 'archive') {
      // A security-cam timecode, ticking toward the moment it all ends.
      const s = Math.floor(clock * 1) + tcOff + 2 * 3600 + 46 * 60 + 58;
      const p2 = n => String(n).padStart(2, '0');
      $('.gi-bar-r').textContent = `${p2(Math.floor(s / 3600))}:${p2(Math.floor(s / 60) % 60)}:${p2(s % 60)}`;
    }
    if (phase === 'archive' && oldCity) {
      // Once the plant starts to go, so does the feed: tears come more and
      // more often until the signal is lost.
      const first = oldCity.reactors.reduce((m, R) => R.boomed != null ? Math.min(m, R.boomed) : m, Infinity);
      if (first < Infinity && clock >= tearT && Math.random() < dt * Math.min(2.4, 0.35 + (clock - first) * 0.14)) {
        const d = 0.05 + Math.random() * 0.13;
        tearT = clock + d;
        root.classList.add('hit');
        setTimeout(() => root && root.classList.remove('hit'), d * 1000);
      }
    }
    if (realDark) dawnK += (dawnTarget - dawnK) * Math.min(1, dt * 0.55);
    _tickTypers(dt);
    if (phase === 'letter') {
      const L = $('.gi-letter');
      if (L.scrollHeight > L.clientHeight + 1 && (typers.length || letterReady) && !L._userScrolled) L.scrollTop = L.scrollHeight;
    }
    if (phase === 'open' && !OldCity.isBaked()) OldCity.bakeStep(7);
    _updateCamera();
    _updateSkip(now);
    _draw(dt);
  }

  // ── HUD hand-back ───────────────────────────────────────────────────
  function _revealHud() {
    document.body.classList.add('gw-intro-reveal');
    document.body.classList.remove('gw-intro', 'gw-archive');
    setTimeout(() => document.body.classList.remove('gw-intro-reveal'), 1600);
  }

  function _finish(skipped) {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', _onKeyDown, true);
    window.removeEventListener('keyup', _onKeyUp, true);
    window.removeEventListener('resize', _resize);

    // Wherever the sequence was, land exactly where it would have ended.
    if (hall) _setCam({ x: hall.cx, y: hall.cy }, 1);

    const r = root;
    if (skipped) {
      _revealHud();
      r.classList.add('skipped');
      setTimeout(() => r.remove(), 450);
    } else {
      r.remove();
    }
    oldCity = null; sparks = []; ash = []; ghost = null;
    OldCity.reset();
    _releaseDawn();
    _fadeOut(cityAmb, 0.3); _fadeOut(screams, 0.3); cityAmb = null; screams = null;

    if (typeof TutorialSystem !== 'undefined' && TutorialSystem.markShown) TutorialSystem.markShown('intro', 0);
    if (typeof DevMode !== 'undefined') DevMode.setTimeScale(1);
    _firstSong();                                  // skipped before it came in: it starts now
    const cb = onDone; onDone = null;
    if (cb) cb();
  }

  // ── Opening title cards ─────────────────────────────────────────────
  // "PLAY US NOW GAMES / PRESENTS", then the GRIDWORKS emblem and wordmark,
  // on black, before the archive cue. Both logos are cloned from the main
  // menu (its studio badge and its title block), so there's one copy of
  // the art and the wordmark replays its letter-slam as it appears.
  // A left click (or A) moves on to the next card; Esc (or B) goes straight
  // into the cinematic.
  const CARD_S    = [4.4, 8.9];   // how long each card is up, fades included
  const CARD_FADE = 0.9;
  let titles = null;              // { el, cards, idx, timer, done }

  function _titleCards(done) {
    const el = document.createElement('div');
    el.id = 'gi-titles';
    el.style.cssText = 'position:fixed;inset:0;z-index:6000;background:#000;display:flex;' +
      'align-items:center;justify-content:center;cursor:pointer;user-select:none;transition:opacity 0.5s ease;';
    document.body.appendChild(el);

    const cards = [];
    // 1 — the studio, presenting
    {
      const c = document.createElement('div');
      c.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5vh;';
      const badge = document.querySelector('#main-menu .menu-studio');
      if (badge) {
        const svg = badge.cloneNode(true);
        svg.removeAttribute('class');
        svg.style.cssText = 'display:block;width:min(38vh,58vw);height:auto;';
        c.appendChild(svg);
      }
      const p = document.createElement('div');
      p.textContent = 'PRESENTS';
      p.style.cssText = "font-family:Inter, system-ui, sans-serif;font-weight:300;font-size:clamp(14px,2.4vh,26px);" +
        'letter-spacing:0.9em;padding-left:0.9em;color:#f0eee8;';
      c.appendChild(p);
      cards.push(c);
    }
    // 2 — the game
    {
      const c = document.createElement('div');
      const logo = document.querySelector('#main-menu .menu-logo');
      if (logo) {
        const l = logo.cloneNode(true);
        l.querySelector('canvas')?.remove();          // the menu's arc canvas is driven by the menu
        // The bolt's gradient is looked up by id, and the menu's copy is hidden
        // in game, so the clone carries its own.
        const grad = l.querySelector('#gwBoltGrad');
        if (grad) { grad.id = 'giBoltGrad'; l.querySelector('.gw-bolt')?.style.setProperty('fill', 'url(#giBoltGrad)'); }
        c.dataset.fit = '1';                          // scaled to the window in _titleShow
        // Slower than the menu (which is timed to its music): the three
        // groups, GRI / DWO / RKS, land 1.8s apart, about 4s longer in all.
        // The O's bolt lights after DWO, the title flashes as RKS lands, and
        // the shine sweep waits until the whole word is in.
        const GROUP_AT = [0.6, 2.4, 4.2], LETTER_GAP = 0.14, SLAM_S = 0.6, SHINE_AT = 5.9;
        l.querySelectorAll('.menu-logo-title > span').forEach((sp, i) => {
          const at = GROUP_AT[Math.floor(i / 3)] + (i % 3) * LETTER_GAP;
          sp.style.animationDuration = `${SLAM_S}s, 5.5s`;
          sp.style.animationDelay    = `${at.toFixed(2)}s, ${(SHINE_AT + i * 0.06).toFixed(2)}s`;
        });
        const title = l.querySelector('.menu-logo-title');
        if (title) title.style.animationDelay = `${SHINE_AT}s, ${(GROUP_AT[2] + 2 * LETTER_GAP + 0.1).toFixed(2)}s`;
        const oBolt = l.querySelector('.gw-o-bolt');
        if (oBolt) oBolt.style.animationDelay = `${(GROUP_AT[1] + 2 * LETTER_GAP + 0.35).toFixed(2)}s, ${SHINE_AT}s`;
        c.appendChild(l);
      } else {
        c.textContent = 'GRIDWORKS';
        c.style.cssText = 'font:700 12vh Inter, system-ui, sans-serif;letter-spacing:0.12em;color:#ffd24a;';
      }
      cards.push(c);
    }

    titles = { el, cards, idx: -1, timer: 0, done };
    el.addEventListener('mousedown', e => { if (e.button === 0) _titleNext(); });
    window.addEventListener('keydown', _titleKey, true);
    _titleNext();
  }

  function _titleShow(i) {
    const T = titles;
    T.el.replaceChildren();
    const c = T.cards[i];
    c.style.opacity = '0';
    c.style.transition = `opacity ${CARD_FADE}s ease`;
    T.el.appendChild(c);
    if (c.dataset.fit) {                           // as big as fits, up to 1.2×
      const l = c.firstElementChild;
      l.style.transform = 'none';
      const k = Math.min(1.2, (window.innerWidth * 0.86) / Math.max(1, l.scrollWidth));
      l.style.transform = `scale(${k.toFixed(3)})`;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => { c.style.opacity = '1'; }));
    T.timer = setTimeout(() => {
      c.style.opacity = '0';
      T.timer = setTimeout(_titleNext, CARD_FADE * 1000 + 250);
    }, (CARD_S[i] - CARD_FADE) * 1000);
  }

  function _titleNext() {
    if (!titles) return;
    clearTimeout(titles.timer);
    titles.idx++;
    if (titles.idx < titles.cards.length) _titleShow(titles.idx);
    else _titleEnd();
  }

  function _titleKey(e) {
    if (!titles) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); _titleEnd(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); _titleNext(); }
  }

  // Start the cinematic underneath, then let the black card fade off it.
  function _titleEnd() {
    if (!titles) return;
    const T = titles;
    titles = null;
    clearTimeout(T.timer);
    window.removeEventListener('keydown', _titleKey, true);
    T.done();
    T.el.style.pointerEvents = 'none';
    T.el.style.opacity = '0';
    setTimeout(() => T.el.remove(), 600);
  }

  // ── Entry point ─────────────────────────────────────────────────────
  // Returns false (and does nothing) if there's no City Hall to fly to.
  function play(done) {
    const gov = typeof GovernmentSystem !== 'undefined' ? GovernmentSystem.getGovEntity() : null;
    if (!gov || active || titles) return false;
    // Freeze the sim and hide the HUD for the cards, as the cinematic does.
    document.body.classList.add('gw-intro');
    if (typeof DevMode !== 'undefined') DevMode.setTimeScale(0);
    _titleCards(() => _begin(done));
    return true;
  }

  function _begin(done) {
    const gov = typeof GovernmentSystem !== 'undefined' ? GovernmentSystem.getGovEntity() : null;
    if (!gov || active) { if (done) done(); return false; }

    const w = (gov.width || 1) * TILE, h = (gov.height || 1) * TILE;
    const x = gov.col * TILE, y = gov.row * TILE;
    hall = { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };

    active = true;
    onDone = done || null;
    clock = 0; lastNow = 0; events = []; typers = []; sparks = []; ash = [];
    phase = 'open'; letterReady = false; lockAt = -1; boltAt = -1; boltPath = null;
    skipDownAt = -1; padSkipHeld = false; songOn = false;
    tcOff = 0; rollBar = false; tearT = 0; ghost = null; dawnK = 0; dawnTarget = 0;

    const city = CityInfo.getCityName(), company = CityInfo.getCompanyName();
    _build(city, company);
    _buildOldCity();
    document.body.classList.add('gw-intro');
    if (typeof DevMode !== 'undefined') DevMode.setTimeScale(0);

    // Footage: a slow push-in over downtown. Present day: start far out and
    // off to one side; end with City Hall framed where the letter won't
    // cover it.
    const firstShot = OldCity.shotCentre(SHOTS[0].where);
    const zoomTo = 1;
    const zoomFrom = Math.max(Camera.ZOOM_MIN || 0.3, 0.42);
    const offX = _letterSide() ? -(window.innerWidth * 0.2) / zoomTo : 0;
    const presentAnim = {
      at: PRESENT_AT, dur: DRIFT_S,
      fromC: { x: hall.cx - 26 * TILE, y: hall.cy + 15 * TILE },
      toC:   { x: hall.cx - offX,      y: hall.cy + 0.5 * TILE },
      fromZ: zoomFrom, toZ: zoomTo,
    };
    camAnim = null;
    _setCam(firstShot, SHOTS[0].z[0]);
    // The CUT_AT event reads camAnim.fromC to park the camera; hand it the
    // present-day shot just before.
    schedule(CUT_AT - 0.01, () => { camAnim = presentAnim; });

    window.addEventListener('keydown', _onKeyDown, true);
    window.addEventListener('keyup', _onKeyUp, true);
    window.addEventListener('resize', _resize);
    root.addEventListener('mousedown', _onPointer);
    root.addEventListener('wheel', e => { if (!e.target.closest('.gi-letter')) e.preventDefault(); }, { passive: false });
    root.addEventListener('contextmenu', e => e.preventDefault());

    _timeline(city);
    raf = requestAnimationFrame(_frame);
    return true;
  }

  return { play, padFrame, isActive: () => active || !!titles, clock: () => clock };   // clock(): read-only, for recording tools
})();
