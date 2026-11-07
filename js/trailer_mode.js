/* ═══════════════════════════════════════════════════════════════════
   TRAILER MODE
   A clean camera for recording footage (F9 toggles). Every piece of DOM
   UI is hidden, the map's own cursor/hover/ghost drawing is starved of
   input, and the camera is flown by this module instead of the player's
   usual pan/zoom:

     WASD / arrows   fly (Shift = slow, for precise framing)
     Wheel / Q E     smooth zoom about the screen centre
     Drag            pan by hand
     K               drop a keyframe at the current view
     Backspace       remove the last keyframe      C (twice)  clear all
     Space / P       play the keyframe path (or stop it)
     [ ]             path length shorter / longer
     , .             sim speed down / up (pause … 10×) — time-lapse
     T               time of day: dawn → noon → golden hour → dusk → night
     L               letterbox bars (2.39:1)
     H               hide / show this help
     Esc / F9        leave trailer mode

   A path plays as one continuous move through every keyframe (Catmull-Rom
   on centre + log-zoom), eased at both ends, with a short hold on the
   first and last frame so there are clean cut points in the edit. The
   HUD hides itself while a path plays, so a screen recorder running the
   whole time only needs trimming, not masking.

   Keyframes are kept in localStorage so a shot survives a reload.
   ═══════════════════════════════════════════════════════════════════ */

const TrailerMode = (() => {
  const STORE_KEY  = 'gw.trailer.v1';
  const SPEEDS     = [0, 1, 2, 5, 10];
  const TIMES      = [   // minute of day, label
    [6 * 60,       'Dawn'],
    [12 * 60,      'Noon'],
    [18 * 60 + 20, 'Golden hour'],
    [19 * 60 + 40, 'Dusk'],
    [23 * 60,      'Night'],
  ];
  const FLY_SPEED  = 520;    // screen px / s at full stick
  const FLY_ACCEL  = 7;      // per-second approach rate to the wanted velocity
  const ZOOM_RATE  = 5;      // per-second approach rate to the wanted zoom
  const WHEEL_STEP = 0.10;   // log-zoom per wheel notch
  const HOLD_S     = 1.0;    // hold on first/last frame of a path
  const MIN_LEN_S  = 3, MAX_LEN_S = 60;

  let active = false;
  let root = null, hudEl = null, toastEl = null;
  let raf = 0, lastNow = 0;

  // The camera this module owns while active, in world px + log zoom.
  let cx = 0, cy = 0, lz = 0, wantLz = 0, vx = 0, vy = 0;
  const keys = new Set();
  let drag = null;             // { sx, sy } last mouse pos while dragging

  let frames = [];             // [{ x, y, lz }]
  let pathLen = 12;            // seconds of motion (holds are extra)
  let play = null;             // { t, segT: [cumulative 0..1], total }
  let letterbox = false;
  let helpOn = true;
  let clearArmed = 0;
  let speedIdx = 1;
  let timeIdx = -1;
  let prevSpeed = 1;

  // ── Persistence ─────────────────────────────────────────────────────
  function _load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (d && Array.isArray(d.frames)) frames = d.frames.filter(f => isFinite(f.x) && isFinite(f.y) && isFinite(f.lz));
      if (d && isFinite(d.pathLen)) pathLen = Math.min(MAX_LEN_S, Math.max(MIN_LEN_S, d.pathLen));
      if (d && typeof d.letterbox === 'boolean') letterbox = d.letterbox;
    } catch (_e) {}
  }
  function _save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ frames, pathLen, letterbox })); } catch (_e) {}
  }

  // ── Camera plumbing ─────────────────────────────────────────────────
  function _readCam() {
    const z = Camera.zoom;
    cx = Camera.x + window.innerWidth  / z / 2;
    cy = Camera.y + window.innerHeight / z / 2;
    lz = wantLz = Math.log(z);
  }
  // Push our state into Camera, then read back what its clamps allowed so
  // we never drift off past the edge and have to "come back" first.
  function _applyCam() {
    const zMin = Math.log(Camera.ZOOM_MIN), zMax = Math.log(Camera.ZOOM_MAX);
    lz = Math.min(zMax, Math.max(zMin, lz));
    wantLz = Math.min(zMax, Math.max(zMin, wantLz));
    Camera.setZoom(Math.exp(lz));
    Camera.jumpTo(cx, cy);
    const z = Camera.zoom;
    cx = Camera.x + window.innerWidth  / z / 2;
    cy = Camera.y + window.innerHeight / z / 2;
  }

  // ── Path ────────────────────────────────────────────────────────────
  // Catmull-Rom through p0..p3 at u ∈ [0,1] between p1 and p2.
  function _cr(a, b, c, d, u) {
    const u2 = u * u, u3 = u2 * u;
    return 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
  }
  // Segment time shares proportional to how far each move looks on screen
  // (pan at the average zoom + zoom change), so a long flight and a small
  // nudge don't each get the same number of seconds.
  function _segShares() {
    const diag = Math.hypot(window.innerWidth, window.innerHeight);
    const cost = [];
    for (let i = 0; i < frames.length - 1; i++) {
      const a = frames[i], b = frames[i + 1];
      const z = Math.exp((a.lz + b.lz) / 2);
      cost.push(Math.max(0.15, Math.hypot(b.x - a.x, b.y - a.y) * z / diag + Math.abs(b.lz - a.lz) * 1.2));
    }
    const sum = cost.reduce((s, c) => s + c, 0);
    const cum = [0];
    for (const c of cost) cum.push(cum[cum.length - 1] + c / sum);
    return cum;
  }
  function _pathAt(s) {           // s ∈ [0,1] along the whole path
    const n = frames.length;
    if (n === 1) {                // one keyframe = a slow push-in on it
      const f = frames[0];
      return { x: f.x, y: f.y, lz: f.lz + 0.18 * s };
    }
    const cum = play.cum;
    let i = 0;
    while (i < n - 2 && s > cum[i + 1]) i++;
    const u = (s - cum[i]) / Math.max(1e-6, cum[i + 1] - cum[i]);
    const P = k => frames[Math.max(0, Math.min(n - 1, k))];
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
    return { x: _cr(a.x, b.x, c.x, d.x, u), y: _cr(a.y, b.y, c.y, d.y, u), lz: _cr(a.lz, b.lz, c.lz, d.lz, u) };
  }
  const _easeInOut = u => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, u)));

  function _startPlay() {
    if (!frames.length) { _toast('No keyframes yet. Frame a shot and press K'); return; }
    play = { t: 0, cum: frames.length > 1 ? _segShares() : [0, 1] };
    const p = _pathAt(0);
    cx = p.x; cy = p.y; lz = wantLz = p.lz; vx = vy = 0;
    _applyCam();
    root.classList.add('playing');
  }
  function _stopPlay() {
    if (!play) return;
    play = null;
    wantLz = lz;
    root.classList.remove('playing');
    _renderHud();
  }

  // ── Frame ───────────────────────────────────────────────────────────
  function _frame(now) {
    if (!active) return;
    raf = requestAnimationFrame(_frame);
    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0;
    lastNow = now;

    if (play) {
      play.t += dt;
      const s = _easeInOut((play.t - HOLD_S) / pathLen);
      const p = _pathAt(s);
      cx = p.x; cy = p.y; lz = wantLz = p.lz;
      _applyCam();
      if (play.t >= HOLD_S * 2 + pathLen) { _stopPlay(); _toast('Path finished'); }
      return;
    }

    // Free fly — velocity eases toward the stick so starts and stops are
    // smooth enough to use as footage directly.
    let ix = 0, iy = 0;
    if (keys.has('a') || keys.has('arrowleft'))  ix -= 1;
    if (keys.has('d') || keys.has('arrowright')) ix += 1;
    if (keys.has('w') || keys.has('arrowup'))    iy -= 1;
    if (keys.has('s') || keys.has('arrowdown'))  iy += 1;
    if (ix && iy) { ix *= Math.SQRT1_2; iy *= Math.SQRT1_2; }
    const z = Math.exp(lz);
    const spd = FLY_SPEED * (keys.has('shift') ? 0.25 : 1) / z;
    const a = 1 - Math.exp(-FLY_ACCEL * dt);
    vx += (ix * spd - vx) * a;
    vy += (iy * spd - vy) * a;
    if (!drag) { cx += vx * dt; cy += vy * dt; }

    const zr = (keys.has('shift') ? 0.35 : 1) * 0.9 * dt;
    if (keys.has('q')) wantLz -= zr;
    if (keys.has('e')) wantLz += zr;
    lz += (wantLz - lz) * (1 - Math.exp(-ZOOM_RATE * dt));
    _applyCam();
  }

  // ── Input (capture phase: the game never sees any of it) ────────────
  function _onKeyDown(e) {
    if (e.key === 'F9') { e.preventDefault(); e.stopPropagation(); toggle(); return; }
    if (!active) return;
    if (e.key === 'F11' || e.key === 'F12') return;
    e.preventDefault(); e.stopPropagation();
    const k = e.key.toLowerCase();
    keys.add(k);
    if (e.repeat) return;
    if (k !== 'c') clearArmed = 0;

    switch (k) {
      case 'escape': exit(); return;
      case ' ': case 'p': play ? _stopPlay() : _startPlay(); return;
    }
    if (play) return;           // nothing else interrupts a take
    switch (k) {
      case 'k':
        frames.push({ x: cx, y: cy, lz });
        _save(); _toast(`Keyframe ${frames.length} added`); break;
      case 'backspace':
        if (frames.length) { frames.pop(); _save(); _toast(`Removed. ${frames.length} left`); }
        break;
      case 'c':
        if (!frames.length) break;
        if (clearArmed && performance.now() - clearArmed < 2000) {
          frames = []; clearArmed = 0; _save(); _toast('Keyframes cleared');
        } else { clearArmed = performance.now(); _toast('Press C again to clear all keyframes'); }
        break;
      case '[': pathLen = Math.max(MIN_LEN_S, pathLen - (pathLen > 20 ? 5 : 1)); _save(); _toast(`Path length ${pathLen}s`); break;
      case ']': pathLen = Math.min(MAX_LEN_S, pathLen + (pathLen >= 20 ? 5 : 1)); _save(); _toast(`Path length ${pathLen}s`); break;
      case ',': _setSpeed(speedIdx - 1); break;
      case '.': _setSpeed(speedIdx + 1); break;
      case 't': _nextTime(); break;
      case 'l': letterbox = !letterbox; _save(); _layoutBars(); break;
      case 'h': helpOn = !helpOn; root.classList.toggle('nohelp', !helpOn); break;
    }
    _renderHud();
  }
  function _onKeyUp(e) {
    if (!active) return;
    if (e.key === 'F11' || e.key === 'F12') return;
    e.stopPropagation();
    keys.delete(e.key.toLowerCase());
  }
  function _onMouseDown(e) {
    if (!active) return;
    e.preventDefault(); e.stopPropagation();
    if (play) return;
    drag = { sx: e.clientX, sy: e.clientY };
    vx = vy = 0;
  }
  function _onMouseMove(e) {
    if (!active) return;
    e.stopPropagation();
    _wakeCursor();
    if (!drag) return;
    const z = Math.exp(lz);
    cx -= (e.clientX - drag.sx) / z;
    cy -= (e.clientY - drag.sy) / z;
    drag.sx = e.clientX; drag.sy = e.clientY;
    _applyCam();
  }
  function _onMouseUp(e) {
    if (!active) return;
    e.stopPropagation();
    drag = null;
  }
  function _onWheel(e) {
    if (!active) return;
    e.preventDefault(); e.stopPropagation();
    if (play) return;
    wantLz += (e.deltaY < 0 ? 1 : -1) * WHEEL_STEP;
  }
  function _swallow(e) { if (active) { e.preventDefault(); e.stopPropagation(); } }
  function _onBlur() { keys.clear(); drag = null; }

  const LISTEN = [
    ['keyup', _onKeyUp], ['mousedown', _onMouseDown], ['mousemove', _onMouseMove],
    ['mouseup', _onMouseUp], ['click', _swallow], ['dblclick', _swallow],
    ['contextmenu', _swallow], ['pointerdown', _swallow], ['pointerup', _swallow],
  ];

  // Cursor hides after a moment of stillness so it's never in a take.
  let cursorTimer = 0;
  function _wakeCursor() {
    document.body.classList.remove('gw-trailer-idle');
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => active && document.body.classList.add('gw-trailer-idle'), 1200);
  }

  // ── Sim speed / time of day ─────────────────────────────────────────
  function _setSpeed(i) {
    speedIdx = Math.max(0, Math.min(SPEEDS.length - 1, i));
    DevMode.setTimeScale(SPEEDS[speedIdx]);
    _toast(SPEEDS[speedIdx] ? `Sim speed ${SPEEDS[speedIdx]}×` : 'Sim paused');
  }
  // Only ever moves the clock forward (to the next occurrence of that time),
  // so nothing that counts days sees time run backwards.
  function _nextTime() {
    timeIdx = (timeIdx + 1) % TIMES.length;
    const [m, label] = TIMES[timeIdx];
    const per = DayNight.secondsPerGameHour() * 24;
    const el = DayNight.getElapsed();
    const dayStart = Math.floor(el / per) * per;
    let target = dayStart + m / 1440 * per;
    if (target <= el) target += per;
    DayNight.setElapsed(target);
    _toast(`Time: ${label} (${DayNight.timeString ? DayNight.timeString() : ''})`);
  }

  // ── DOM ─────────────────────────────────────────────────────────────
  function _build() {
    root = document.createElement('div');
    root.id = 'gw-trailer';
    root.innerHTML = `
      <div class="gt-bar gt-top"></div><div class="gt-bar gt-bot"></div>
      <div class="gt-toast"></div>
      <div class="gt-hud"></div>`;
    document.body.appendChild(root);
    hudEl = root.querySelector('.gt-hud');
    toastEl = root.querySelector('.gt-toast');
  }
  function _layoutBars() {
    const W = window.innerWidth, H = window.innerHeight;
    const h = letterbox ? Math.max(0, (H - W / 2.39) / 2) : 0;
    root.querySelectorAll('.gt-bar').forEach(b => { b.style.height = h + 'px'; });
  }
  let toastTimer = 0;
  function _toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
  }
  function _renderHud() {
    if (!hudEl) return;
    const spd = SPEEDS[speedIdx];
    hudEl.innerHTML = `
      <div class="gt-title">● TRAILER MODE</div>
      <div class="gt-stats">
        <span>${frames.length} keyframe${frames.length === 1 ? '' : 's'}</span>
        <span>path ${pathLen}s</span>
        <span>sim ${spd ? spd + '×' : 'paused'}</span>
        <span>${letterbox ? 'letterbox' : 'full frame'}</span>
      </div>
      <div class="gt-help">
        <div><b>WASD</b> fly · <b>Shift</b> slow · <b>Wheel/Q E</b> zoom · <b>Drag</b> pan</div>
        <div><b>K</b> add keyframe · <b>⌫</b> undo · <b>C C</b> clear · <b>Space</b> play path</div>
        <div><b>[ ]</b> path length · <b>, .</b> sim speed · <b>T</b> time of day · <b>L</b> letterbox</div>
        <div><b>H</b> hide help · <b>Esc</b> exit</div>
      </div>`;
  }

  // ── Enter / exit ────────────────────────────────────────────────────
  function _canEnter() {
    if (typeof IntroCinematic !== 'undefined' && IntroCinematic.isActive()) return false;
    const menu = document.getElementById('main-menu');
    if (menu && !menu.classList.contains('hidden')) return false;
    if (document.getElementById('pause-menu')?.classList.contains('visible')) return false;
    return true;
  }

  function enter() {
    if (active || !_canEnter()) return false;
    active = true;
    _load();
    if (!root) _build();
    root.classList.remove('playing');

    // Put down whatever tool is in hand and forget the hover tile, so no
    // placement ghost or hover highlight is left painted on the map.
    try { InputManager.selectTool(null); } catch (_e) {}
    try { InputManager.state.hoverCol = null; InputManager.state.hoverRow = null; } catch (_e) {}
    try { InputManager.heldKeys.clear(); } catch (_e) {}

    prevSpeed = DevMode.timeScale;
    speedIdx = Math.max(0, SPEEDS.indexOf(prevSpeed));
    if (SPEEDS.indexOf(prevSpeed) < 0) speedIdx = 1;
    timeIdx = -1;

    _readCam();
    vx = vy = 0; keys.clear(); drag = null; play = null;
    document.body.classList.add('gw-trailer');
    root.classList.toggle('nohelp', !helpOn);
    _layoutBars();
    _renderHud();
    _wakeCursor();
    for (const [ev, fn] of LISTEN) window.addEventListener(ev, fn, true);
    window.addEventListener('wheel', _onWheel, { capture: true, passive: false });
    window.addEventListener('resize', _layoutBars);
    window.addEventListener('blur', _onBlur);
    lastNow = 0;
    raf = requestAnimationFrame(_frame);
    return true;
  }

  function exit() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf);
    for (const [ev, fn] of LISTEN) window.removeEventListener(ev, fn, true);
    window.removeEventListener('wheel', _onWheel, { capture: true });
    window.removeEventListener('resize', _layoutBars);
    window.removeEventListener('blur', _onBlur);
    clearTimeout(cursorTimer);
    document.body.classList.remove('gw-trailer', 'gw-trailer-idle');
    play = null; keys.clear(); drag = null;
    if (root) root.classList.remove('playing');
    // Hand the sim back at the speed the playback bar thinks it's at.
    DevMode.setTimeScale(prevSpeed);
  }

  function toggle() { active ? exit() : enter(); }

  window.addEventListener('keydown', _onKeyDown, true);

  return { enter, exit, toggle, isActive: () => active };
})();
