/* ═══════════════════════════════════════════════════════════════════
   GRIDWORKS MOBILE — touch layer
   Loaded first, in <head>. The desktop game is left as it is; this file
   makes it playable on a phone:

   • Viewport. The HUD is laid out for a desktop window, so on a phone the
     page is given a "virtual" landscape viewport (≥1000 CSS px wide) that
     the browser scales down to the screen. Everything — canvas, HUD,
     popups — keeps its desktop layout, just smaller. UI size (Settings
     in the ⋯ drawer) picks how big.
   • Map touch → mouse. Tap = click, drag = pan (or lay a run with a tool
     in hand), long-press = right-click (remove / chop / cancel), two
     fingers = pan + pinch zoom.
   • On-screen controls for everything the keyboard does: cancel, rotate,
     pick, shift, undo, copy/paste, blueprints, research, pause…, plus
     gas/brake/steer pads while driving a truck.
   • Hold anywhere to skip a cinematic; touch hold for the fishing reel;
     drag / pinch on the world map.

   ?mobile=1 forces it on (desktop testing), ?mobile=0 forces it off.
   ═══════════════════════════════════════════════════════════════════ */
(() => {
  'use strict';

  const qs = new URLSearchParams(location.search);
  // Testing aid: ?rafshim=1 drives requestAnimationFrame from timers, so
  // the game keeps running in a hidden/background browser tab.
  if (qs.get('rafshim') === '1') {
    const ids = new Map(); let n = 1;
    window.requestAnimationFrame = (cb) => { const id = n++; ids.set(id, setTimeout(() => { ids.delete(id); cb(performance.now()); }, 16)); return id; };
    window.cancelAnimationFrame = (id) => { clearTimeout(ids.get(id)); ids.delete(id); };
  }
  const forced = qs.get('mobile');
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  const touchy = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const ON = forced === '1' || (forced !== '0' && coarse && touchy);
  window.GW_MOBILE = ON;
  if (!ON) return;

  document.documentElement.classList.add('gw-mobile');

  // ── 0. Save storage ────────────────────────────────────────────────
  // A real city serialises to several MB, and a phone browser gives
  // localStorage about 5 MB in all, so saves soon fail with "storage full".
  // On desktop the game writes files to a folder instead; phones can't, so
  // here the big save blobs (powergrid_save_<id>, powergrid_mirror_<id>)
  // live in IndexedDB, which allows hundreds of MB. The game keeps calling
  // localStorage as usual: reads come from an in-memory copy loaded at
  // start-up, writes go to memory at once and to IndexedDB behind them. The
  // small slot index stays in localStorage.
  const SaveStore = (() => {
    const isBig = (k) => typeof k === 'string'
      && ((k.startsWith('powergrid_save_') && k !== 'powergrid_save_slots') || k.startsWith('powergrid_mirror_'));
    const mem = new Map();
    const P = Storage.prototype;
    const lsGet = P.getItem, lsSet = P.setItem, lsDel = P.removeItem;
    let db = null;
    const dbReady = new Promise((resolve) => {
      let req;
      try { req = indexedDB.open('gwm-saves', 1); } catch (_) { resolve(null); return; }
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        db = req.result;
        const tx = db.transaction('kv', 'readonly');
        const cur = tx.objectStore('kv').openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (c) { if (!mem.has(c.key)) mem.set(c.key, c.value); c.continue(); }
        };
        tx.oncomplete = () => resolve(db);
        tx.onerror = () => resolve(db);
      };
    });
    const put = (k, v) => dbReady.then((d) => { if (d) d.transaction('kv', 'readwrite').objectStore('kv').put(v, k); });
    const del = (k) => dbReady.then((d) => { if (d) d.transaction('kv', 'readwrite').objectStore('kv').delete(k); });

    P.getItem = function (k) {
      if (this === window.localStorage && isBig(k) && mem.has(k)) return mem.get(k);
      return lsGet.call(this, k);
    };
    P.setItem = function (k, v) {
      if (this === window.localStorage && isBig(k) && indexedDB) {
        const val = String(v);
        mem.set(k, val);
        put(k, val);
        try { lsDel.call(this, k); } catch (_) {}   // free the old copy's space
        return;
      }
      return lsSet.call(this, k, v);
    };
    P.removeItem = function (k) {
      if (this === window.localStorage && isBig(k)) { mem.delete(k); del(k); }
      return lsDel.call(this, k);
    };

    // Saves already sitting in localStorage move across, freeing its space.
    dbReady.then((d) => {
      if (!d) return;
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (isBig(k)) keys.push(k); }
        for (const k of keys) {
          const v = lsGet.call(localStorage, k);
          if (v != null && !mem.has(k)) { mem.set(k, v); put(k, v); }
          lsDel.call(localStorage, k);
        }
      } catch (_) {}
    });
    return { ready: dbReady };
  })();

  // ── Settings ───────────────────────────────────────────────────────
  const LS = {
    get(k, d) { try { const v = localStorage.getItem('gwm.' + k); return v == null ? d : v; } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem('gwm.' + k, v); } catch (_) {} },
  };
  // UI size → the virtual viewport height the layout gets (smaller = bigger UI).
  const UI_SIZES = { large: 480, medium: 600, small: 720 };
  const MIN_VW = 1000;   // the HUD's top bar needs about this much width

  // ── 1. Viewport ────────────────────────────────────────────────────
  const BUILD = 'm12';   // shown in the diagnostics readout (?fps=1)
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; document.head.appendChild(meta); }

  // What was last asked of the browser: layout width vw at page scale s.
  let _applied = null;
  // The visible area in device-independent px, worked out only from values
  // this file controls. Not visualViewport.scale (phones report it relative
  // to the page's own fit, so it reads 1 after we zoom out, and re-sizing
  // from it undid the zoom on every resize) and not screen.* (counts the
  // camera cutout and browser bars).
  // Installed app (display: fullscreen / standalone) or browser full
  // screen: the page has the whole screen, so size from screen.* (with
  // viewport-fit=cover that includes the camera-cutout strip). This also
  // catches the window growing after start-up, which a size worked out
  // from our own earlier numbers never noticed (it left an empty strip).
  const isAppMode = () => {
    try {
      return matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches
        || !!navigator.standalone || !!(document.fullscreenElement || document.webkitFullscreenElement);
    } catch (_) { return false; }
  };
  function physSize() {
    if (isAppMode() && screen.width > 0 && screen.height > 0) {
      const a = screen.width, b = screen.height, long = Math.max(a, b), short = Math.min(a, b);
      const land = matchMedia('(orientation: landscape)').matches;
      return land ? { w: long, h: short, land } : { w: short, h: long, land };
    }
    const iw = innerWidth, ih = innerHeight;
    // Browser tab: the window's own width (outerWidth, device-independent
    // px, not changed by page zoom) and the page's aspect ratio (the layout
    // viewport always has the visible area's shape). Measuring the page at
    // start-up instead could catch the browser's 980 px placeholder width
    // and then keep sizing from it — the zoomed-in look in a tab.
    const ow = window.outerWidth;
    if (ow > 0 && iw > 0 && ih > 0 && !isFramed()) {
      const land = iw >= ih;
      const a = screen.width, b = screen.height;
      const side = land ? Math.max(a, b) : Math.min(a, b);
      if (!side || (ow >= side * 0.6 && ow <= side * 1.05)) return { w: ow, h: ow * ih / iw, land };
    }
    let w = iw, h = ih;
    if (_applied && Math.abs(iw - _applied.vw) <= 2) { w = iw * _applied.s; h = ih * _applied.s; }
    return { w, h, land: w >= h };
  }
  function isFramed() { try { return window.self !== window.top; } catch (_) { return true; } }

  // Touch controls keep a finger-sized look whatever the page scale is:
  // #gwm-root is zoomed by about 1 / scale.
  let ctlZoom = 1;
  function setCtlZoom(pageScale) {
    ctlZoom = Math.max(1, Math.min(2.2, 0.62 / pageScale));
    document.documentElement.style.setProperty('--gwm-ctl-zoom', ctlZoom.toFixed(3));
  }
  // Cutscenes were framed for a desktop window: while one plays, the page
  // gets a desktop-height virtual screen so it shows as much as it does
  // there, then goes back to the UI size.
  const CINE_H = 1000;
  let cineMode = false;
  let _lastVp = '', _replaced = 0;
  const DEVICE_VP = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
  function setMeta(content, applied) {
    _applied = applied;
    if (content === _lastVp) return;
    _lastVp = content;
    meta.setAttribute('content', content);
    // Chrome doesn't always fire 'resize' when only the viewport meta
    // changes, which left the map canvas at its old, smaller size (black
    // strip right and bottom). Nudge the game's resize handlers.
    for (const ms of [80, 350, 900]) setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch (_) {} }, ms);
    // Some phone browsers only re-read the viewport when the tag itself is
    // replaced: if the layout hasn't taken the new width shortly after,
    // swap in a fresh <meta>.
    if (applied) setTimeout(() => {
      if (_lastVp !== content || Math.abs(innerWidth - applied.vw) <= 2 || _replaced > 6) return;
      _replaced++;
      const m = document.createElement('meta');
      m.name = 'viewport'; m.content = content;
      meta.replaceWith(m); meta = m;
    }, 350);
  }
  function applyViewport() {
    // The on-screen keyboard shrinks the visible area: don't re-lay the
    // page out under the player while they type a city name.
    const ae = document.activeElement;
    if (ae && ae.matches && ae.matches('input, textarea')) return;
    const { w, h, land } = physSize();
    if (!(w > 50 && h > 50)) return;
    if (!land) {
      // Portrait: lay out at device width; the rotate prompt covers the game.
      setCtlZoom(1);
      setMeta(DEVICE_VP, null);
      return;
    }
    const targetH = cineMode ? CINE_H : (UI_SIZES[LS.get('uiSize', 'medium')] || UI_SIZES.medium);
    const vw = Math.max(MIN_VW, Math.round(w * targetH / h));
    if (w >= vw - 2) {   // tablets and big screens already have the room
      setCtlZoom(1);
      setMeta(DEVICE_VP, null);
      return;
    }
    const s = +(w / vw).toFixed(4);
    setCtlZoom(s);
    setMeta(`width=${vw}, initial-scale=${s}, minimum-scale=${s}, maximum-scale=${s}, user-scalable=no, viewport-fit=cover`, { vw, s });
  }
  function setCineMode(on) {
    if (cineMode === on) return;
    cineMode = on;
    applyViewport();
  }
  applyViewport();
  // Again once the page exists: at <head> time some browsers haven't
  // measured the window yet.
  document.addEventListener('DOMContentLoaded', applyViewport);
  window.addEventListener('load', () => { applyViewport(); setTimeout(applyViewport, 600); });
  let _vpT = null;
  const onOrient = () => { clearTimeout(_vpT); _vpT = setTimeout(applyViewport, 150); };
  window.addEventListener('orientationchange', () => { _applied = null; setMeta(DEVICE_VP, null); onOrient(); });
  window.addEventListener('resize', onOrient);
  document.addEventListener('fullscreenchange', () => {
    if ((document.fullscreenElement || document.webkitFullscreenElement) && _applied && !fsAnyway()
        && !matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches) {
      try { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (_) {}
    }
    onOrient();
  });
  try { matchMedia('(display-mode: fullscreen)').addEventListener('change', onOrient); } catch (_) {}

  // Effects canvases (intro explosions, cutscene glow, lightning) are
  // sized innerWidth × devicePixelRatio. Zoomed out to a desktop-sized
  // page — above all a cutscene's 1000 px tall one — that came to several
  // times the phone's real screen (about 6000 × 2750 in the intro), which
  // is what made the explosions crawl. Report a density that gives roughly
  // the screen's own pixels, capped at 1.25.
  try {
    const dprDesc = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')
                 || Object.getOwnPropertyDescriptor(Window.prototype, 'devicePixelRatio');
    const realDpr = () => (dprDesc && dprDesc.get ? dprDesc.get.call(window) : 1) || 1;
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      get() {
        const r = realDpr();
        const honored = _applied && Math.abs(innerWidth - _applied.vw) <= 2;
        const eff = r * (honored ? _applied.s : 1);   // device px per page px
        return Math.min(r, Math.max(0.75, Math.min(eff, 1.25)));
      },
    });
    window.GW_REAL_DPR = realDpr;
  } catch (_) {}

  // ── Helpers ────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  // Not offsetParent: it is null for position:fixed elements, which most of
  // the game's overlays are.
  const visible = (el) => {
    if (!el || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && +cs.opacity > 0.05;
  };
  const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} };

  const mods = { shift: false, ctrl: false };

  function key(type, k, code, extra) {
    const ev = new KeyboardEvent(type, Object.assign({
      key: k, code: code || k, bubbles: true, cancelable: true,
      shiftKey: mods.shift, ctrlKey: mods.ctrl,
    }, extra || {}));
    (document.activeElement && document.activeElement !== document.body &&
     !document.activeElement.matches('input, textarea') ? document.activeElement : document.body)
      .dispatchEvent(ev);
  }
  function tapKey(k, code, extra) { key('keydown', k, code, extra); key('keyup', k, code, extra); }

  function mouse(target, type, x, y, button, extra) {
    const btns = type === 'mouseup' ? 0 : (button === 2 ? 2 : 1);
    const ev = new MouseEvent(type, Object.assign({
      bubbles: true, cancelable: true, view: window,
      clientX: x, clientY: y, screenX: x, screenY: y,
      button: button || 0, buttons: type === 'mousemove' && !extra?.held ? 0 : btns,
      shiftKey: mods.shift, ctrlKey: mods.ctrl,
    }, extra || {}));
    target.dispatchEvent(ev);
  }

  // The game's systems are top-level `const`s — global, but not on window.
  const _getters = {};
  function gameGlobal(name) {
    const f = _getters[name] || (_getters[name] = new Function('return typeof ' + name + ' !== "undefined" ? ' + name + ' : undefined'));
    try { return f(); } catch (_) { return undefined; }
  }
  const IM   = () => gameGlobal('InputManager');
  const tool = () => { try { return IM()?.state?.selectedTool || null; } catch (_) { return null; } };
  const fishingHold = () => {
    const F = gameGlobal('FishingSystem');
    try { return !!(F && (F.isMinigameActive?.() || F.isActive?.())); } catch (_) { return false; }
  };
  const driving = () => { try { return !!gameGlobal('TruckSystem')?.getDriven?.(); } catch (_) { return false; } };
  const inGame = () => {
    const mm = $('main-menu');
    return !!$('canvas') && !visible(mm) && visible($('hud'));
  };

  // ── 2. Map canvas: touch → mouse ───────────────────────────────────
  const TAP_SLOP   = 10;    // px a finger may wander and still be a tap
  const LONG_MS    = 450;   // hold this long (no tool) → right-click
  const TOOL_MS    = 110;   // hold this long (tool in hand) → press starts
  let pickMode = false;     // next tap copies the item under it (Q)

  function bindCanvas(cv) {
    let one = null;         // single-finger state
    let two = null;         // pinch state
    let suppressUntilClear = false;

    const pt = (t) => ({ x: t.clientX, y: t.clientY });

    // Laying a line (wire, belt, pipe, poles, road…) with a tool in hand:
    // a finger held near a screen edge scrolls the map that way, faster the
    // closer it is, and the run keeps extending under the finger as the map
    // moves — one long drag instead of place / pan / pick up / place.
    let edgeRaf = 0;
    function edgeVec(x, y) {
      const W = innerWidth, H = innerHeight;
      const m = Math.max(28, Math.min(W, H) * 0.06);   // edge zone: ~6% of the screen
      const tb = $('topbar');
      const top = tb ? tb.getBoundingClientRect().bottom : 0;
      const f = (d) => Math.max(0, Math.min(1, d / m));
      let dx = 0, dy = 0;
      if (x < m) dx = -f(m - x); else if (x > W - m) dx = f(x - (W - m));
      if (y < top + m) dy = -f(top + m - y); else if (y > H - m) dy = f(y - (H - m));
      return { dx, dy };
    }
    function edgeTick() {
      edgeRaf = 0;
      if (!one || !one.down || one.button !== 0 || !tool()) return;
      const v = edgeVec(one.x, one.y);
      if (!v.dx && !v.dy) { edgeTick._since = 0; return; }
      const Cam = gameGlobal('Camera');
      if (!Cam) return;
      // Speed per second, not per frame (a 120 Hz phone ran it twice as
      // fast): 80 px/s just inside the zone up to 420 px/s at the very edge.
      const now = performance.now();
      // Only once the finger has stayed in the zone a moment: passing
      // through it while drawing a line doesn't move the map.
      if (!edgeTick._since) edgeTick._since = now;
      const held = now - edgeTick._since;
      const dt = edgeTick._t ? Math.min(0.05, (now - edgeTick._t) / 1000) : 1 / 60;
      edgeTick._t = now;
      const ramp = Math.min(1, Math.max(0, (held - 250) / 400));   // 0.25 s wait, then eases in
      const sp = (k) => Math.sign(k) * 380 * k * k * ramp * dt;   // 0 at the zone's inner edge, ~380 px/s at the screen edge
      Cam.panByScreen(-sp(v.dx), -sp(v.dy));
      mouse(cv, 'mousemove', one.x, one.y, 0, { held: true });   // the world moved under the finger
      edgeRaf = requestAnimationFrame(edgeTick);
    }
    function edgeStop() {
      if (edgeRaf) { cancelAnimationFrame(edgeRaf); edgeRaf = 0; }
      try { gameGlobal('Camera')?.panByScreen(0, 0); } catch (_) {}   // no coasting after
    }
    // Two fingers tapped together (no pinch, no pan) with a tool in hand:
    // right-click, which puts the tool away (and cancels a path or a cast),
    // as on PC. Never without a tool: there right-click removes buildings.
    function twoFingerTap(tw) {
      if (!tool()) return;
      buzz(15);
      mouse(cv, 'mousemove', tw.cx, tw.cy, 0);
      mouse(cv, 'mousedown', tw.cx, tw.cy, 2);
      mouse(cv, 'mouseup', tw.cx, tw.cy, 2);
    }

    function press(button) {
      if (!one || one.down) return;
      one.down = true; one.button = button;
      mouse(cv, 'mousemove', one.sx, one.sy, 0);
      mouse(cv, 'mousedown', one.sx, one.sy, button);
      if (one.x !== one.sx || one.y !== one.sy) mouse(cv, 'mousemove', one.x, one.y, button, { held: true });
    }
    function release() {
      if (!one) return;
      if (edgeRaf) edgeStop();
      if (one.down) {
        mouse(cv, 'mouseup', one.x, one.y, one.button);
        if (one.button === 0 && !one.moved) mouse(cv, 'click', one.x, one.y, 0);
      }
      clearTimeout(one.timer); clearTimeout(one.longTimer);
      one = null;
    }
    function abortOne() {
      // A second finger arrived: drop the press without committing it.
      if (!one) return;
      if (edgeRaf) edgeStop();
      clearTimeout(one.timer); clearTimeout(one.longTimer);
      if (one.down) {
        cv.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: one.button }));
      }
      one = null;
    }

    cv.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const ts = e.touches;
      if (suppressUntilClear) return;
      if (ts.length === 1) {
        const p = pt(ts[0]);
        one = { id: ts[0].identifier, sx: p.x, sy: p.y, x: p.x, y: p.y, t: performance.now(), down: false, moved: false, button: 0 };
        mouse(cv, 'mousemove', p.x, p.y, 0);   // hover → ghost/tooltips
        if (pickMode) return;                  // resolved on touchend
        const immediate = !!tool() || fishingHold();
        if (immediate) {
          one.timer = setTimeout(() => press(0), fishingHold() ? 0 : TOOL_MS);
        } else {
          one.longTimer = setTimeout(() => {
            if (one && !one.down && !one.moved) { buzz(25); press(2); }
          }, LONG_MS);
        }
      } else if (ts.length === 2) {
        abortOne();
        const a = pt(ts[0]), b = pt(ts[1]);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        two = { cx, cy, d, sx: cx, sy: cy, d0: d, t0: performance.now(), moved: false };
      } else {
        abortOne(); two = null; suppressUntilClear = true;
      }
    }, { passive: false });

    cv.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const ts = e.touches;
      if (two && ts.length >= 2) {
        const a = pt(ts[0]), b = pt(ts[1]);
        const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const Cam = gameGlobal('Camera');
        if (Cam) {
          Cam.panByScreen(cx - two.cx, cy - two.cy);
          if (Cam.zoomByFactorAt) Cam.zoomByFactorAt(cx, cy, d / two.d);
        }
        two.cx = cx; two.cy = cy; two.d = d;
        if (Math.abs(d - two.d0) > 18 || Math.hypot(cx - two.sx, cy - two.sy) > 18) two.moved = true;
        return;
      }
      if (!one || ts.length !== 1) return;
      const p = pt(ts[0]);
      one.x = p.x; one.y = p.y;
      if (!one.moved && Math.hypot(p.x - one.sx, p.y - one.sy) > TAP_SLOP) {
        one.moved = true;
        clearTimeout(one.longTimer);
        if (pickMode) return;
        if (!one.down) { clearTimeout(one.timer); press(0); return; }
      }
      if (one.down) {
        mouse(cv, 'mousemove', p.x, p.y, one.button, { held: true });
        if (one.button === 0 && !edgeRaf && tool()) { const v = edgeVec(p.x, p.y); if (v.dx || v.dy) { edgeTick._t = 0; edgeTick._since = 0; edgeRaf = requestAnimationFrame(edgeTick); } }
      }
      else if (pickMode) mouse(cv, 'mousemove', p.x, p.y, 0);
    }, { passive: false });

    const end = (e) => {
      e.preventDefault();
      if (e.touches.length === 0) {
        const tw = two;
        suppressUntilClear = false; two = null;
        if (tw && !tw.moved && performance.now() - tw.t0 < 320) { twoFingerTap(tw); return; }
      }
      if (two) return;
      if (!one) return;
      if (pickMode) {
        mouse(cv, 'mousemove', one.x, one.y, 0);
        tapKey('q', 'KeyQ');
        setPick(false);
        one = null;
        return;
      }
      if (!one.down) {
        // A quick tap: press + release at the spot.
        clearTimeout(one.timer); clearTimeout(one.longTimer);
        press(0);
      }
      release();
    };
    cv.addEventListener('touchend', end, { passive: false });
    cv.addEventListener('touchcancel', (e) => { e.preventDefault(); abortOne(); two = null; suppressUntilClear = false; }, { passive: false });
  }

  // ── 3. Generic drag surface (world map, small canvases) ────────────
  // Converts one finger to mouse down/move/up on the element (+ click and
  // dblclick on taps) and two fingers to wheel events for zoom.
  function bindDragSurface(el) {
    if (el._gwmBound) return; el._gwmBound = true;
    let one = null, two = null, lastTap = 0;
    el.addEventListener('touchstart', (e) => {
      if (e.target.closest('button, input, select, textarea, a')) return;   // leave real controls alone
      e.preventDefault();
      const ts = e.touches;
      if (ts.length === 1) {
        const t = ts[0];
        one = { sx: t.clientX, sy: t.clientY, x: t.clientX, y: t.clientY, moved: false, tgt: document.elementFromPoint(t.clientX, t.clientY) || el };
        mouse(one.tgt, 'mousemove', one.x, one.y, 0);
        mouse(one.tgt, 'mousedown', one.x, one.y, 0);
      } else if (ts.length === 2) {
        if (one) { mouse(window, 'mouseup', one.x, one.y, 0); one = null; }
        const a = ts[0], b = ts[1];
        two = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1 };
      }
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      if (!one && !two) return;
      e.preventDefault();
      const ts = e.touches;
      if (two && ts.length >= 2) {
        const a = ts[0], b = ts[1];
        const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1;
        const r = d / two.d;
        if (r > 1.12 || r < 0.89) {
          const cx = (a.clientX + b.clientX) / 2, cy = (a.clientY + b.clientY) / 2;
          el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: cx, clientY: cy, deltaY: r > 1 ? -100 : 100 }));
          two.d = d;
        }
        return;
      }
      if (!one) return;
      const t = ts[0];
      one.x = t.clientX; one.y = t.clientY;
      if (Math.hypot(one.x - one.sx, one.y - one.sy) > TAP_SLOP) one.moved = true;
      mouse(window, 'mousemove', one.x, one.y, 0, { held: true });
    }, { passive: false });
    const end = (e) => {
      if (!one && !two) return;
      e.preventDefault();
      if (e.touches.length === 0) two = null;
      if (!one) return;
      mouse(one.tgt, 'mouseup', one.x, one.y, 0);
      if (!one.moved) {
        mouse(one.tgt, 'click', one.x, one.y, 0);
        const now = performance.now();
        if (now - lastTap < 350) mouse(one.tgt, 'dblclick', one.x, one.y, 0);
        lastTap = now;
      }
      one = null;
    };
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
  }

  // ── 4. Cinematic skip + fishing reel (document-level holds) ────────
  const SKIP_SEL = '.gi-skip, .hq-skip-label, .gf-skip-label, .npv-skip';
  let skipHeld = false;
  let _skipShown = false;
  function skipVisible() {
    for (const el of document.querySelectorAll(SKIP_SEL)) if (visible(el)) return true;
    return false;
  }
  document.addEventListener('touchstart', (e) => {
    // Uses the value sync() caches: reading styles here would force a
    // style recalc inside every touch and delay it.
    // Any cutscene on screen (some only show their skip label once held).
    if (e.target.closest && e.target.closest('#gwm-fsprompt')) return;
    if (e.touches.length === 1 && (_skipShown || cineMode)) { skipHeld = true; key('keydown', 'Escape', 'Escape'); }
  }, { capture: true, passive: true });
  const endHold = () => { if (skipHeld) { skipHeld = false; key('keyup', 'Escape', 'Escape'); } };
  document.addEventListener('touchend', endHold, { capture: true, passive: true });
  document.addEventListener('touchcancel', endHold, { capture: true, passive: true });

  // Fishing reel: during the minigame a hold anywhere reels in — not just
  // on the map (the map canvas already gets its own press). Our buttons
  // stay buttons, so ✕ still bails out.
  const reelActive = () => { try { return !!gameGlobal('FishingSystem')?.isMinigameActive?.(); } catch (_) { return false; } };
  let reelTouch = false;
  document.addEventListener('touchstart', (e) => {
    if (!reelActive() || e.target.id === 'canvas' || e.target.closest?.('#gwm-root')) return;
    e.preventDefault();
    if (!reelTouch) { reelTouch = true; mouse(window, 'mousedown', e.touches[0].clientX, e.touches[0].clientY, 0); }
  }, { capture: true, passive: false });
  const reelEnd = (e) => {
    if (!reelTouch || e.touches.length) return;
    reelTouch = false;
    mouse(window, 'mouseup', 0, 0, 0);
  };
  document.addEventListener('touchend', reelEnd, { capture: true, passive: true });
  document.addEventListener('touchcancel', reelEnd, { capture: true, passive: true });

  // Panels the game drags by a header with mouse events (window-level
  // mousemove) — a phone only sends a fake click on release, so they could
  // not be moved. A finger on one of these headers drives the same mouse
  // sequence. A press that never moves stays a click (the game tells the
  // two apart itself, e.g. the checklist header collapses on a plain tap).
  const DRAG_HEADERS = '#contract-checklist [data-collapse]';
  // The checklist re-renders its header on a timer. Touch events keep going
  // to the element the finger first landed on, and once that element is
  // replaced they no longer bubble up to document — the drag died after a
  // moment. So the move / end listeners go on the touched element itself
  // as well as on document (each event is handled once).
  let hdrDrag = null;
  const hdrSeen = new WeakSet();
  function hdrMove(e) {
    if (!hdrDrag || hdrSeen.has(e)) return;
    hdrSeen.add(e);
    e.preventDefault();
    const t = e.touches[0] || e.changedTouches[0];
    hdrDrag.x = t.clientX; hdrDrag.y = t.clientY;
    mouse(window, 'mousemove', t.clientX, t.clientY, 0, { held: true });
  }
  function hdrEnd(e) {
    if (!hdrDrag || (e && hdrSeen.has(e))) return;
    if (e) hdrSeen.add(e);
    const d = hdrDrag; hdrDrag = null;
    d.tgt.removeEventListener('touchmove', hdrMove);
    d.tgt.removeEventListener('touchend', hdrEnd);
    d.tgt.removeEventListener('touchcancel', hdrEnd);
    mouse(window, 'mouseup', d.x, d.y, 0);
  }
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const h = e.target.closest && e.target.closest(DRAG_HEADERS);
    if (!h) return;
    e.preventDefault();
    const t = e.touches[0];
    hdrDrag = { tgt: e.target, x: t.clientX, y: t.clientY };
    e.target.addEventListener('touchmove', hdrMove, { passive: false });
    e.target.addEventListener('touchend', hdrEnd);
    e.target.addEventListener('touchcancel', hdrEnd);
    mouse(e.target, 'mousedown', t.clientX, t.clientY, 0);
  }, { capture: true, passive: false });
  document.addEventListener('touchmove', hdrMove, { capture: true, passive: false });
  document.addEventListener('touchend', hdrEnd, { capture: true, passive: true });
  document.addEventListener('touchcancel', hdrEnd, { capture: true, passive: true });

  // ── 5. On-screen controls ──────────────────────────────────────────
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  // Buttons act on touchstart-free click, but keep focus off them so key
  // events land on the body.
  function btn(label, title, onTap, cls) {
    const b = el('button', 'gwm-btn' + (cls ? ' ' + cls : ''), label);
    b.type = 'button';
    b.title = title || '';
    b.setAttribute('aria-label', title || label);
    b.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); });
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); b.blur(); onTap(b); });
    return b;
  }

  let root, quick, drawer, drivePad, pickBtn, shiftBtn, cancelBtn, rotBtn, rotate;

  function setPick(on) {
    pickMode = on;
    pickBtn?.classList.toggle('on', on);
    quick?.querySelector('.gwm-pick')?.classList.toggle('on', on);
    if (on) toast('Tap an item on the map to pick it up');
  }
  function setShift(on) {
    if (mods.shift === on) return;
    mods.shift = on;
    key(on ? 'keydown' : 'keyup', 'Shift', 'ShiftLeft', { shiftKey: on });
    shiftBtn?.classList.toggle('on', on);
    quick?.querySelector('.gwm-shift')?.classList.toggle('on', on);
  }

  let _toastT = null;
  function toast(msg) {
    let t = $('gwm-toast');
    if (!t) { t = el('div', '', ''); t.id = 'gwm-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(_toastT);
    _toastT = setTimeout(() => t.classList.remove('show'), 1800);
  }

  // Chrome hands over its install prompt once the page qualifies (https,
  // manifest, service worker): keep it for the button.
  let _installPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); _installPrompt = e; });
  window.addEventListener('appinstalled', () => { _installPrompt = null; toast('Installed: open GRIDWORKS from your home screen'); });
  // Browser full screen on a phone that scales the page: Chrome locks a
  // full-screen page at 1:1, so the whole UI jumps to desktop size. Every
  // way in (the game's Options display toggle, the ⋯ button, the
  // return-to-full-screen button) goes through requestFullscreen, so it is
  // caught here: offer to install the app instead, which opens full screen
  // with the same layout as the windowed page.
  const fsAnyway = () => { try { return sessionStorage.getItem('gwm.fsAnyway') === '1'; } catch (_) { return false; } };
  let _origFullscreen = null;
  function showInstallCard() {
    if ($('gwm-install')) return;
    const card = el('div', '', `
      <div class="gwm-frame-card">
        <div class="gwm-frame-title">How do you want to play full screen?</div>
        <div class="gwm-frame-text">The browser's own full screen makes the interface bigger (desktop size). Installing GRIDWORKS as an app gives full screen with the layout you see now.</div>
        <button type="button" class="gwm-frame-go gwm-install-go">Install as an app (normal layout)</button>
        <button type="button" class="gwm-frame-go gwm-install-anyway">Browser full screen (bigger interface)</button>
        <button type="button" class="gwm-frame-here gwm-install-close">Stay windowed</button>
      </div>`);
    card.id = 'gwm-install';
    for (const t of ['touchstart', 'mousedown', 'pointerdown']) card.addEventListener(t, (e) => e.stopPropagation());
    card.querySelector('.gwm-install-go').addEventListener('click', (e) => {
      e.preventDefault();
      if (_installPrompt) { const ip = _installPrompt; _installPrompt = null; ip.prompt(); card.remove(); return; }
      card.querySelector('.gwm-frame-text').textContent =
        'Open your browser menu (⋮ at the top right) and choose "Install app" or "Add to Home screen". Then start GRIDWORKS from its new icon. (iPhone: Share → Add to Home Screen.)';
    });
    card.querySelector('.gwm-install-close').addEventListener('click', (e) => { e.preventDefault(); card.remove(); });
    card.querySelector('.gwm-install-anyway').addEventListener('click', (e) => {
      e.preventDefault();
      try { sessionStorage.setItem('gwm.fsAnyway', '1'); } catch (_) {}
      card.remove();
      const r = document.documentElement;
      if (_origFullscreen) Promise.resolve(_origFullscreen.call(r, { navigationUI: 'hide' })).then(() => {
        try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (_) {}
      }).catch(() => {});
    });
    document.body.appendChild(card);
  }
  try {
    const P = Element.prototype;
    const origReq = P.requestFullscreen, origWk = P.webkitRequestFullscreen;
    _origFullscreen = origReq || origWk;
    const guard = (orig) => function (...args) {
      if (_applied && !isAppMode() && !fsAnyway()) {
        showInstallCard();
        return Promise.resolve();
      }
      return orig ? orig.apply(this, args) : Promise.reject(new Error('no fullscreen'));
    };
    if (origReq) P.requestFullscreen = guard(origReq);
    if (origWk) P.webkitRequestFullscreen = guard(origWk);
  } catch (_) {}

  function fullscreen() {
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen)?.call(d);
      return;
    }
    if (_applied && !fsAnyway()) { showInstallCard(); return; }   // ask which kind of full screen first
    const r = d.documentElement;
    const req = r.requestFullscreen || r.webkitRequestFullscreen;
    if (!req) { toast('Use "Add to Home Screen" for full screen'); return; }
    Promise.resolve(req.call(r, { navigationUI: 'hide' })).then(() => {
      try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (_) {}
    }).catch(() => {});
  }

  function buildUI() {
    root = el('div', '', ''); root.id = 'gwm-root';

    // Quick column: contextual buttons on the left edge.
    quick = el('div', 'gwm-quick');
    cancelBtn = btn('✕', 'Cancel / put tool away (Esc)', () => tapKey('Escape', 'Escape'), 'gwm-cancel');
    rotBtn    = btn('⟳', 'Rotate (R)', () => tapKey('r', 'KeyR'), 'gwm-rot');
    const more = btn('⋯', 'More controls', () => toggleDrawer());
    const pk   = btn('⌖', 'Pick: tap an item to copy it (Q)', () => setPick(!pickMode), 'gwm-pick');
    const sh   = btn('⇧', 'Shift (box-select, variants)', () => setShift(!mods.shift), 'gwm-shift');
    quick.append(cancelBtn, rotBtn, pk, sh, more);

    // Drawer: every other keyboard command.
    drawer = el('div', 'gwm-drawer');
    const grid = el('div', 'gwm-grid');
    const add = (label, title, fn, cls) => { const b = btn(label, title, (bb) => { fn(bb); if (!cls?.includes('keep')) toggleDrawer(false); }, cls); b.innerHTML = `<b>${label}</b><span>${title}</span>`; grid.appendChild(b); return b; };
    add('⟲', 'Undo', () => { mods.ctrl = true; tapKey('z', 'KeyZ'); mods.ctrl = false; });
    add('⟳', 'Redo', () => { mods.ctrl = true; tapKey('y', 'KeyY'); mods.ctrl = false; });
    add('⧉', 'Copy area', () => { mods.ctrl = true; tapKey('c', 'KeyC'); mods.ctrl = false; });
    add('📋', 'Paste', () => { mods.ctrl = true; tapKey('v', 'KeyV'); mods.ctrl = false; });
    add('▦', 'Blueprint', () => tapKey('b', 'KeyB'));
    add('⌧', 'Zone delete', () => tapKey('x', 'KeyX'));
    add('⌫', 'Delete selection', () => tapKey('Delete', 'Delete'));
    add('⚗', 'Research', () => tapKey('e', 'KeyE'));
    add('🗺', 'Map', () => tapKey('m', 'KeyM'));
    add('💾', 'Quicksave', () => tapKey('F2', 'F2'));
    add('🔦', 'Flashlight', () => tapKey('f', 'KeyF'));
    add('☰', 'Build bar', () => tapKey('Tab', 'Tab'));
    add('✓', 'Finish path', () => tapKey('Enter', 'Enter'));
    add('⏯', 'Pause / play', () => tapKey(' ', 'Space'));
    add('⏩', 'Fast forward', () => tapKey('Alt', 'AltLeft'));
    pickBtn  = add('⌖', 'Pick item', () => setPick(!pickMode));
    shiftBtn = add('⇧', 'Shift lock', () => setShift(!mods.shift));
    add('⛶', 'Install / full screen', () => fullscreen());
    add('⏱', 'FPS counter', () => { const on = !fpsOn; LS.set('fps', on ? '1' : ''); setFps(on); });
    const sizeB = add('A', 'UI size', () => {
      const order = ['large', 'medium', 'small'];
      const cur = LS.get('uiSize', 'medium');
      const nx = order[(order.indexOf(cur) + 1) % order.length];
      LS.set('uiSize', nx);
      applyViewport();
      sizeB.querySelector('span').textContent = 'UI size: ' + nx;
      toast('UI size: ' + nx);
    }, 'keep');
    sizeB.querySelector('span').textContent = 'UI size: ' + LS.get('uiSize', 'medium');
    const PANEL_SIZES = { small: 0.65, medium: 0.8, large: 0.95 };
    const applyPanel = () => document.documentElement.style.setProperty('--gwm-panel-zoom', PANEL_SIZES[LS.get('panelSize', 'medium')] || 0.8);
    applyPanel();
    const panB = add('▭', 'Panel size', () => {
      const order = ['small', 'medium', 'large'];
      const nx = order[(order.indexOf(LS.get('panelSize', 'medium')) + 1) % order.length];
      LS.set('panelSize', nx); applyPanel();
      panB.querySelector('span').textContent = 'Panels: ' + nx;
      toast('Panel size: ' + nx);
    }, 'keep');
    panB.querySelector('span').textContent = 'Panels: ' + LS.get('panelSize', 'medium');
    add('?', 'Touch help', () => showHelp());
    drawer.appendChild(grid);
    const close = btn('✕', 'Close', () => toggleDrawer(false), 'gwm-drawer-close');
    drawer.appendChild(close);

    // Drive pads: steer on the left, gas / brake on the right.
    drivePad = el('div', 'gwm-drive');
    const hold = (label, k, code, cls) => {
      const b = el('div', 'gwm-pad ' + cls, label);
      let down = false;
      const on  = (e) => { e.preventDefault(); e.stopPropagation(); if (!down) { down = true; b.classList.add('on'); key('keydown', k, code); } };
      const off = (e) => { e.preventDefault(); e.stopPropagation(); if (down) { down = false; b.classList.remove('on'); key('keyup', k, code); } };
      b.addEventListener('touchstart', on, { passive: false });
      b.addEventListener('touchend', off, { passive: false });
      b.addEventListener('touchcancel', off, { passive: false });
      b.addEventListener('mousedown', on); b.addEventListener('mouseup', off); b.addEventListener('mouseleave', off);
      return b;
    };
    const left  = el('div', 'gwm-drive-l');
    left.append(hold('◀', 'a', 'KeyA', 'gwm-steer'), hold('▶', 'd', 'KeyD', 'gwm-steer'));
    const right = el('div', 'gwm-drive-r');
    right.append(hold('▲<small>GAS</small>', 'w', 'KeyW', 'gwm-gas'), hold('▼<small>BRAKE</small>', 's', 'KeyS', 'gwm-brake'));
    drivePad.append(left, right);

    // Portrait prompt.
    const rot = el('div', '', '<div class="gwm-rot-icon">📱</div><div>Turn your phone sideways to play</div><small>GRIDWORKS plays in landscape</small>');
    rot.id = 'gwm-rotate';
    rotate = rot;

    root.append(quick, drawer, drivePad);
    document.body.append(root, rot);
  }

  function toggleDrawer(force) {
    const open = force != null ? force : !drawer.classList.contains('open');
    drawer.classList.toggle('open', open);
  }

  function showHelp() {
    let h = $('gwm-help');
    if (!h) {
      h = el('div', '', `
        <div class="gwm-help-card">
          <h3>Touch controls</h3>
          <ul>
            <li><b>Tap</b> — click: select, inspect, place</li>
            <li><b>Drag</b> — pan the map · with a tool: lay a line of it</li>
            <li><b>Two fingers</b> — pan and pinch to zoom · <b>tap with two fingers</b> to put a tool away</li>
            <li><b>Laying a line</b> — hold your finger near a screen edge and the map scrolls that way</li>
            <li><b>Long-press</b> — right-click: remove a building, chop a tree</li>
            <li><b>Double-tap a truck</b> — drive it (pads appear) · double-tap again to park</li>
            <li><b>✕</b> put the tool away · <b>⟳</b> rotate · <b>⌖</b> pick an item off the map · <b>⇧</b> shift (box-select)</li>
            <li><b>⋯</b> undo, copy/paste, blueprints, research, pause, UI size…</li>
            <li><b>Fishing</b> — with the rod: press and hold on the shore to charge, drag to aim, let go to cast · when it bites, hold the screen to reel</li>
            <li><b>Hold the screen</b> to skip a cinematic</li>
          </ul>
          <button type="button" class="gwm-help-ok">Got it</button>
        </div>`);
      h.id = 'gwm-help';
      h.querySelector('.gwm-help-ok').addEventListener('click', () => { h.classList.remove('show'); LS.set('helpSeen', '1'); });
      document.body.appendChild(h);
    }
    h.classList.add('show');
  }

  // The quick column lives where the game's right-hand panels (entity
  // info, inspectors) open. When one is under it, slide the column to the
  // panel's left instead of covering the panel's values.
  function dodgePanels() {
    if (!root.classList.contains('show')) return;
    const cv = $('canvas');
    const z = ctlZoom;
    const x = innerWidth - safeR - (12 + 12) * z;
    let left = Infinity;
    for (const y of [70, 95, 120].map(v => v * z)) {
      for (const n of document.elementsFromPoint(x, y)) {
        if (root.contains(n)) continue;
        if (n === cv || n === document.body || n === document.documentElement || n.id === 'hud') break;
        const r = n.getBoundingClientRect();
        // Panels only: the game's own small icon buttons don't count.
        if (r.width > 120 && r.width < innerWidth * 0.8) left = Math.min(left, r.left);
        break;
      }
    }
    // On a short screen the column can reach down into the game's own icon
    // column (compendium, achievements…): then sit beside it instead.
    // The column grows as the game unlocks more of them (advisor, drones,
    // trucks, contracts…), so look at all of its buttons.
    if (left === Infinity) {
      let top = Infinity, iconLeft = Infinity;
      for (const n of document.body.children) {
        if (n === root || !n.id || !n.id.startsWith('btn-') && n.id !== 'hotbar-blueprint-btn') continue;
        const ir = n.getBoundingClientRect();
        if (!ir.width || ir.width > 90 || ir.right < innerWidth - 100) continue;
        top = Math.min(top, ir.top); iconLeft = Math.min(iconLeft, ir.left);
      }
      const qTop = 66 * z, qBottom = qTop + quick.getBoundingClientRect().height;
      if (top !== Infinity && qBottom > top - 4) left = iconLeft;
    }
    quick.style.right = left === Infinity ? '' : Math.round((innerWidth - left) / z + 8) + 'px';
    drawer.style.right = left === Infinity ? '' : Math.round((innerWidth - left) / z + 40) + 'px';
  }

  // FPS readout — real frames, counted off requestAnimationFrame.
  let fpsOn = false, _fpsEl = null;
  // Tap timing: finger down → click event, and finger up → click event.
  let _tDown = 0, _tUp = 0, _tapMs = null, _liftMs = null;
  document.addEventListener('touchstart', () => { _tDown = performance.now(); }, { capture: true, passive: true });
  document.addEventListener('touchend', () => { _tUp = performance.now(); }, { capture: true, passive: true });
  document.addEventListener('click', () => {
    if (!_tDown) return;
    const now = performance.now();
    _tapMs = Math.round(now - _tDown); _liftMs = Math.round(now - _tUp); _tDown = 0;
  }, true);
  function setFps(on) {
    fpsOn = on;
    if (!on) { _fpsEl?.remove(); _fpsEl = null; return; }
    _fpsEl = el('div', '', 'FPS'); _fpsEl.id = 'gwm-fps'; document.body.appendChild(_fpsEl);
    let n = 0, t0 = performance.now(), worst = 0, last = t0;
    const tick = (now) => {
      if (!fpsOn) return;
      n++; worst = Math.max(worst, now - last); last = now;
      if (now - t0 >= 1000) {
        const ok = _applied ? (Math.abs(innerWidth - _applied.vw) <= 2 ? 'ok' : 'IGNORED') : 'device';
        _fpsEl.textContent = `${Math.round(n * 1000 / (now - t0))} FPS · worst ${Math.round(worst)} ms` +
          (_tapMs != null ? ` · tap ${_tapMs} ms (lift→click ${_liftMs} ms)` : '') +
          `\n${BUILD} · page ${innerWidth}×${innerHeight} · asked ${_applied ? _applied.vw + ' @ ' + _applied.s : 'device-width'} → ${ok}` +
          ` · vv ${Math.round(visualViewport?.width || 0)}×${Math.round(visualViewport?.height || 0)} @ ${(visualViewport?.scale || 0).toFixed(3)}` +
          ` · outer ${outerWidth}×${outerHeight} · dpr ${devicePixelRatio.toFixed(2)}${cineMode ? ' · CUTSCENE' : ''}` +
          `\n${isAppMode() ? 'APP/fullscreen' : 'browser tab'} · screen ${screen.width}×${screen.height} · cutout L${safeL} R${safeR}` +
          `\n${navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 110)}`;
        n = 0; t0 = now; worst = 0;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Safety nets that hold even if a browser won't resize the page:
  // the top bar's stats strip shrinks to whatever width it really has, and
  // the intro's contract letter is sized as if on a 1000 px tall screen.
  function fitTopBar() {
    const st = $('stats'), tb = $('topbar');
    if (!st || !tb || !st.getClientRects().length) return;
    const z0 = parseFloat(st.style.zoom) || 1;
    const r = st.getBoundingClientRect();
    const title = tb.querySelector('.title-block');
    const left = title ? title.getBoundingClientRect().right + 12 : 8;
    const natural = r.width / z0;
    const z = Math.max(0.5, Math.min(1, (innerWidth - left - 8) / natural));
    if (Math.abs(z - z0) > 0.01) st.style.zoom = z.toFixed(3);
  }
  // Contract checklist: 50% of its desktop size on the actual screen
  // (asked for half size), whatever scale the page itself got.
  // Sizes asked for as a share of what's on the actual screen, whatever
  // scale the page itself got: the contract checklist at half size,
  // achievements panel 0.484 (45% smaller, then 10% back up), pop-ups 0.55.
  const SCREEN_SIZES = { '--gwm-checklist-zoom': 0.5, '--gwm-ach-zoom': 0.484, '--gwm-achtoast-zoom': 0.55, '--gwm-dossier-zoom': 0.5 };
  function fitChecklist() {
    const honored = _applied && Math.abs(innerWidth - _applied.vw) <= 2;
    const pageScale = honored ? _applied.s : 1;
    const st = document.documentElement.style;
    for (const [v, share] of Object.entries(SCREEN_SIZES)) {
      const z = Math.min(1, share / pageScale).toFixed(3);
      if (st.getPropertyValue(v) !== z) st.setProperty(v, z);
    }
  }
  // The game's right-hand icon column (compendium, achievements, advisor,
  // drones, trucks, contracts…) grows as things unlock and ran off the
  // bottom of a phone screen. Scale it to 60%, and further if it still
  // doesn't fit between the top bar and the bottom edge.
  const ICON_ZOOM = 0.6;
  function rightIcons() {
    const out = [];
    for (const n of document.body.children) {
      if (n === root || !n.id || (!n.id.startsWith('btn-') && n.id !== 'hotbar-blueprint-btn')) continue;
      const ir = n.getBoundingClientRect();
      if (!ir.width || ir.width > 90 || ir.right < innerWidth - 120) continue;
      out.push([n, ir]);
    }
    return out;
  }
  function fitIcons() {
    const icons = rightIcons();
    if (!icons.length) return;
    let top = Infinity, bottom = -Infinity, z0 = 1;
    for (const [n, ir] of icons) {
      top = Math.min(top, ir.top); bottom = Math.max(bottom, ir.bottom);
      z0 = parseFloat(n.style.zoom) || 1;
    }
    const natural = (bottom - top) / z0;
    const tb = $('topbar');
    const room = innerHeight - (tb ? tb.getBoundingClientRect().bottom : 80) - 16;
    // 60% of their desktop size on the actual screen, whatever scale the
    // page itself got (like the checklist).
    const honored = _applied && Math.abs(innerWidth - _applied.vw) <= 2;
    const want = Math.min(1, ICON_ZOOM / (honored ? _applied.s : 1));
    const z = Math.max(0.3, Math.min(want, room / natural)).toFixed(3);
    for (const [n] of icons) {
      if (n.style.zoom !== z) n.style.zoom = z;
      const mr = (safeR / parseFloat(z)).toFixed(1) + 'px';
      if (n.style.marginRight !== mr) n.style.marginRight = mr;
    }
  }
  // Scale an overlay card so it fits in the given share of the screen
  // (its desktop size is the cap). Used for the GRID COMPLETE victory card.
  function fitToScreen(sel, wShare, hShare) {
    const el = document.querySelector(sel);
    if (!el || !el.getClientRects().length) return;
    const z0 = parseFloat(el.style.zoom) || 1;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const nw = r.width / z0, nh = Math.max(r.height, el.scrollHeight * z0) / z0;
    const z = Math.max(0.3, Math.min(1, innerWidth * wShare / nw, innerHeight * hShare / nh));
    if (Math.abs(z - z0) > 0.01) el.style.zoom = z.toFixed(3);
  }
  // Notifications (and the contract checklist when it is in its default
  // spot) start just under the top bar and the city / company name, not
  // over them. Their own zoom scales the offset, so divide it back out.
  function belowTopBar() {
    const tb = $('topbar');
    if (!tb || !tb.getClientRects().length) return;
    const title = tb.querySelector('.title-block');
    const bottom = Math.max(tb.getBoundingClientRect().bottom,
                            title ? title.getBoundingClientRect().bottom : 0) + 8;
    const ns = $('notif-stack');
    if (ns && ns.getClientRects().length) {
      const z = parseFloat(getComputedStyle(ns).zoom) || 1;
      const want = Math.round(bottom / z) + 'px';
      if (ns.style.top !== want) ns.style.top = want;
    }
    // The checklist remembers where it was dragged: only nudge it down when
    // it sits under the top bar.
    const cl = $('contract-checklist');
    if (cl && cl.getClientRects().length && cl.getBoundingClientRect().top < bottom - 1) {
      const z = parseFloat(getComputedStyle(cl).zoom) || 1;
      cl.style.top = Math.round(bottom / z) + 'px';
    }
  }
  // Panels opened from the right-hand icon column sit beside their own
  // button (level with it, just left of the column), moved up only as far
  // as needed to stay on screen, and no taller than the room below the top
  // bar. They are zoomed, so screen positions are divided by the zoom.
  const SIDE_PANELS = {
    'advisor-panel': 'btn-advisor', 'drones-panel': 'btn-drones', 'trucks-panel': 'btn-trucks',
    'achievements-panel': 'btn-achievements', 'compendium-panel': 'btn-compendium', 'msg-log-panel': 'btn-msglog',
  };
  function fitSidePanels() {
    const tb = $('topbar');
    const floor = (tb ? tb.getBoundingClientRect().bottom : 60) + 6;
    for (const [pid, bid] of Object.entries(SIDE_PANELS)) {
      const pn = $(pid), bt = $(bid);
      if (!pn || !bt || !pn.getClientRects().length || !bt.getClientRects().length) continue;
      const z = parseFloat(getComputedStyle(pn).zoom) || 1;
      const br = bt.getBoundingClientRect();
      const room = innerHeight - floor - 8;
      pn.style.setProperty('max-height', (room / z).toFixed(1) + 'px', 'important');
      const h = Math.min(pn.getBoundingClientRect().height, room);
      const top = Math.max(floor, Math.min(br.top, innerHeight - 8 - h));
      const right = innerWidth - br.left + 6;
      const set = (prop, v) => { const val = v.toFixed(1) + 'px'; if (pn.style.getPropertyValue(prop) !== val) pn.style.setProperty(prop, val, 'important'); };
      set('top', top / z);
      set('right', right / z);
      if (pn.style.getPropertyValue('bottom') !== 'auto') pn.style.setProperty('bottom', 'auto', 'important');
      if (pn.style.getPropertyValue('left') !== 'auto') pn.style.setProperty('left', 'auto', 'important');
    }
  }
  // The blueprints window is a pop-out inside the blueprint button (which
  // is in the icon column, already scaled). Leave the game's placement,
  // only shift it up when it would run off the bottom of the screen.
  function keepBlueprintOnScreen() {
    const pn = $('blueprint-panel');
    if (!pn) return;
    if (!pn.getClientRects().length || getComputedStyle(pn).visibility === 'hidden') {
      if (pn._gwmShift) { pn.style.removeProperty('transform'); pn._gwmShift = 0; }
      return;
    }
    const r = pn.getBoundingClientRect();
    const over = r.bottom - (innerHeight - 8) + (pn._gwmShift || 0);
    const zEff = r.height / (pn.offsetHeight || r.height || 1);   // all zooms above it
    const shift = over > 0 ? Math.min(over, Math.max(0, r.top + (pn._gwmShift || 0) - 70)) : 0;
    if (Math.abs(shift - (pn._gwmShift || 0)) > 1) {
      pn._gwmShift = shift;
      pn.style.setProperty('transform', shift ? `translateY(${(-shift / zEff).toFixed(1)}px)` : '', 'important');
    }
  }
  // Tutorial card: desktop places it 170 px up from the bottom with a
  // height cap tuned to a tall window; scaled on a phone it sat over the
  // clock and stayed short. Sit it just above the clock instead, and let it
  // grow up to just under the top bar (and any notifications on that side).
  // Research panel: its desktop cap (82vh) is scaled down with the panel,
  // so on a phone it used about half the screen and long entries (Power
  // Pole's text and its UNLOCK button) needed scrolling. Let it use the
  // whole height under the top bar, and lift it when opening beside the
  // station would run it off the bottom. Positions written here are noted
  // in _gwmAnch so watchAnchored() doesn't treat them as the game's.
  function fitResearchPanel() {
    const pn = $('research-panel');
    if (!pn || !pn.classList.contains('visible') || !pn.getClientRects().length) return;
    const z = parseFloat(getComputedStyle(pn).zoom) || 1;
    const tb = $('topbar');
    const floor = (tb ? tb.getBoundingClientRect().bottom : 60) + 6;
    const room = innerHeight - floor - 8;
    const mh = (room / z).toFixed(1) + 'px';
    if (pn.style.maxHeight !== mh) pn.style.setProperty('max-height', mh, 'important');
    // Re-fit its top now that it may have grown (watchAnchored does the clamp).
    const r = pn.getBoundingClientRect();
    if (r.bottom > innerHeight - 8 && pn._gwmAnch) {
      const v = Math.round(Math.max(floor, innerHeight - 8 - r.height) / z * 10) / 10;
      pn._gwmAnch.top = v;
      pn.style.top = v + 'px';
    }
  }
  function fitTutorialCard() {
    const host = $('tutorial-card');
    if (!host || !host.getClientRects().length) return;
    const card = host.querySelector('.tut-card');
    if (!card) return;
    const z = parseFloat(getComputedStyle(host).zoom) || 1;
    const clock = $('clock');
    const cr = clock && clock.getClientRects().length ? clock.getBoundingClientRect() : null;
    const bottomEdge = cr ? cr.top - 8 : innerHeight - 12;
    const tb = $('topbar');
    let topEdge = (tb ? tb.getBoundingClientRect().bottom : 60) + 8;
    const ns = $('notif-stack');
    if (ns && ns.getClientRects().length) {
      const nr = ns.getBoundingClientRect();
      if (nr.height > 4 && nr.left < innerWidth / 2) topEdge = Math.max(topEdge, nr.bottom + 6);
    }
    const room = Math.max(120, bottomEdge - topEdge);
    const b = ((innerHeight - bottomEdge) / z).toFixed(1) + 'px';
    if (host.style.bottom !== b) host.style.setProperty('bottom', b, 'important');
    const mh = (room / z).toFixed(1) + 'px';
    if (card.style.maxHeight !== mh) card.style.setProperty('max-height', mh, 'important');
  }
  function fitLetter() {
    const L = document.querySelector('#gw-intro .gi-letter');
    if (!L) return;
    const z = Math.max(0.4, Math.min(1, innerHeight / 1000)).toFixed(3);
    if (L.style.zoom !== z) L.style.zoom = z;
  }

  // Camera cutout: with viewport-fit=cover the page reaches under it, so
  // the HUD pieces on the left and right edges move in by the cutout's
  // width. env(safe-area-inset-*) read through a probe element, in page px.
  let _safeProbe = null, safeL = 0, safeR = 0;
  function readSafeArea() {
    if (!_safeProbe) {
      _safeProbe = el('div', '', '');
      _safeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
        'padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)';
      document.body.appendChild(_safeProbe);
    }
    const cs = getComputedStyle(_safeProbe);
    const l = Math.round(parseFloat(cs.paddingLeft) || 0), r = Math.round(parseFloat(cs.paddingRight) || 0);
    if (l !== safeL || r !== safeR) {
      safeL = l; safeR = r;
      const st = document.documentElement.style;
      st.setProperty('--gwm-safe-l', l + 'px');
      st.setProperty('--gwm-safe-r', r + 'px');
    }
  }

  // ── 6. State sync loop ─────────────────────────────────────────────
  let helpShownThisRun = false;
  function sync() {
    if (!root) return;
    _skipShown = skipVisible();
    const playing = !_skipShown && !cineMode && inGame();
    root.classList.toggle('show', playing);
    const t = tool();
    // Three slots: tool in hand → cancel / rotate; otherwise pick / shift.
    // (Both stay reachable from the ⋯ drawer.)
    cancelBtn.style.display = (t || pickMode) ? '' : 'none';
    rotBtn.style.display = t ? '' : 'none';
    quick.querySelector('.gwm-pick').style.display = t ? 'none' : '';
    quick.querySelector('.gwm-shift').style.display = (t || pickMode) ? 'none' : '';
    readSafeArea();
    if (playing) dodgePanels();
    // Page not scaled (browser full screen, or inside a frame): a class
    // for the few sizes that need their own tuning there.
    document.documentElement.classList.toggle('gwm-unscaled', !!_applied && Math.abs(innerWidth - _applied.vw) > 2);
    fitTopBar();
    fitTutorialCard();
    fitResearchPanel();
    fitLetter();
    fitChecklist();
    fitIcons();
    belowTopBar();
    fitSidePanels();
    topPanelLayer();
    keepBlueprintOnScreen();
    fitToScreen('#np-victory .npv-card', 0.8, 0.86);
    const drv = driving();
    drivePad.classList.toggle('show', playing && drv);
    root.classList.toggle('driving', drv);
    const { land } = physSize();
    rotate.classList.toggle('show', !land);
    if (playing && !helpShownThisRun && LS.get('helpSeen', '') !== '1') {
      helpShownThisRun = true;
      setTimeout(showHelp, 1500);
    }
    // World map overlay: give it touch.
    const wm = $('worldmap-overlay');
    if (wm) bindDragSurface(wm);
  }

  // Top-bar drop-downs (weather, progress, income, population, score,
  // government) are placed by the game at their button's screen position
  // through style.left / style.top. On mobile they are CSS-zoomed, and a
  // zoomed element's own left/top are scaled by its zoom too, so each one
  // opened short of its button (the GRID panel already corrects for this
  // itself). Undo that: whenever the game writes a position, rewrite it
  // divided by the zoom, then keep the panel on screen.
  const ANCHORED = ['weather-panel', 'progress-tracker', 'income-breakdown', 'population-panel', 'score-panel', 'gov-panel', 'research-panel'];
  function watchAnchored() {
    for (const id of ANCHORED) {
      const n = $(id);
      if (!n || n._gwmAnch) continue;
      n._gwmAnch = { left: null, top: null };
      const fix = () => {
        const z = parseFloat(getComputedStyle(n).zoom) || 1;
        if (Math.abs(z - 1) < 0.01) return;
        for (const prop of ['left', 'top']) {
          const v = n.style[prop];
          // Compare numbers: the browser re-formats what we write ('80.0px' reads back '80px').
          if (!v || !v.endsWith('px') || (n._gwmAnch[prop] != null && Math.abs(parseFloat(v) - n._gwmAnch[prop]) < 0.06)) continue;
          let want = parseFloat(v) / z;
          if (prop === 'left') {
            const w = n.getBoundingClientRect().width || 0;
            want = Math.max(4 / z, Math.min(want, (innerWidth - w - 6) / z));
          }
          if (prop === 'top') {
            // Never over the top bar, and never past the bottom edge: the
            // game's own fit check uses the unscaled height, so it can leave
            // a scaled panel hanging off the bottom.
            const tb = $('topbar');
            const floor = tb ? tb.getBoundingClientRect().bottom + 4 : 0;
            const h = n.getBoundingClientRect().height || 0;
            want = Math.min(want, (innerHeight - 8 - h) / z);
            want = Math.max(want, floor / z);
          }
          const out = Math.round(want * 10) / 10;
          n._gwmAnch[prop] = out;
          n.style[prop] = out + 'px';
        }
      };
      new MutationObserver(() => { fix(); topPanelLayer(); }).observe(n, { attributes: true, attributeFilter: ['style', 'class'] });
      fix();
    }
  }

  // The top-bar drop-downs live inside #hud, whose whole layer (z 40) sits
  // below the notification stack and tutorial card (z 160), so no z-index
  // on the drop-downs themselves could lift them over the notifications.
  // While one is open, those two drop under the HUD instead.
  const TOP_PANELS = ['grid-panel', ...ANCHORED];
  function topPanelLayer() {
    const open = TOP_PANELS.some((id) => {
      const n = $(id);
      if (!n || !n.getClientRects().length) return false;
      const cs = getComputedStyle(n);
      return cs.display !== 'none' && cs.visibility !== 'hidden';
    });
    document.documentElement.classList.toggle('gwm-toppanel', open);
  }

  // Starting a new game (and a few other menu actions) reloads the page,
  // and a phone browser always leaves full screen on a reload — and won't
  // re-enter it without a tap. So: note full screen as the page goes, and
  // after the reload offer a small button that puts it back. Tapping it
  // doesn't touch the cutscene underneath.
  window.addEventListener('pagehide', () => {
    try { sessionStorage.setItem('gwm.wasFS', (document.fullscreenElement || document.webkitFullscreenElement) ? '1' : ''); } catch (_) {}
  });
  function fsPrompt() {
    let was = '';
    try { was = sessionStorage.getItem('gwm.wasFS') || ''; sessionStorage.removeItem('gwm.wasFS'); } catch (_) {}
    const r = document.documentElement;
    const req = r.requestFullscreen || r.webkitRequestFullscreen;
    if (was !== '1' || !req || document.fullscreenElement || document.webkitFullscreenElement) return;
    const b = el('button', '', '⛶ Tap to return to full screen');
    b.id = 'gwm-fsprompt'; b.type = 'button';
    const go = (e) => {
      e.preventDefault(); e.stopPropagation();
      Promise.resolve(req.call(r, { navigationUI: 'hide' })).then(() => {
        try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (_) {}
      }).catch(() => {});
      b.remove();
    };
    b.addEventListener('touchend', go, { passive: false });
    b.addEventListener('click', go);
    for (const t of ['touchstart', 'mousedown', 'pointerdown']) b.addEventListener(t, (e) => e.stopPropagation());
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 20000);
  }

  // Inside a frame (itch.io embeds HTML games in an iframe): a framed page
  // can't set its own viewport, so the layout comes out at desktop size,
  // and installing / true full screen aren't available either. Offer to
  // open the game on its own (same files, same saves — same origin), where
  // all of that works. "Play here" keeps the self-fitting fallbacks.
  function framedPrompt() {
    let framed = false;
    try { framed = window.self !== window.top; } catch (_) { framed = true; }
    if (!framed) return;
    if (window.__gwmPlayHere) return;   // only for this page load: ask again next time
    if ($('gwm-frame')) return;
    const ov = el('div', '', `
      <div class="gwm-frame-card">
        <div class="gwm-frame-title">GRIDWORKS on your phone</div>
        <div class="gwm-frame-text">Opens the game on its own page: full-screen, sized for your phone.</div>
        <a class="gwm-frame-go" target="_blank" rel="noopener">▶ Play</a>
        <button type="button" class="gwm-frame-here">Play inside this page instead</button>
      </div>`);
    ov.id = 'gwm-frame';
    const stop = (e) => e.stopPropagation();
    for (const t of ['touchstart', 'mousedown', 'pointerdown']) ov.addEventListener(t, stop);
    // A real link opening a new tab: the one thing a framed page may always
    // do on a tap. (Navigating itch's own tab was silently blocked.)
    const go = ov.querySelector('.gwm-frame-go');
    go.href = location.href;
    go.addEventListener('click', () => {
      setTimeout(() => {
        const t = ov.querySelector('.gwm-frame-text');
        if (t) t.textContent = 'The game opened in a new tab. Switch to it to play (your browser\'s tab button).';
      }, 300);
    });
    ov.querySelector('.gwm-frame-here').addEventListener('click', (e) => {
      e.preventDefault();
      window.__gwmPlayHere = true;
      ov.remove();
    });
    document.body.appendChild(ov);
  }

  // ── 7. Boot ────────────────────────────────────────────────────────
  function boot() {
    buildUI();
    const cv = $('canvas');
    if (cv) bindCanvas(cv);
    setInterval(sync, 250);
    fsPrompt();
    framedPrompt();
    // The game's start-up screens can clear it away: put it back once loaded.
    window.addEventListener('load', () => setTimeout(framedPrompt, 1500));
    watchAnchored(); setInterval(watchAnchored, 2000);   // some are built later
    // Cutscenes: switch to the desktop-height screen the moment one's root
    // is added, and back when it goes.
    const CINE_IDS = ['gw-intro', 'gi-titles', 'gw-hq', 'gw-fusion', 'np-draw', 'np-victory'];
    const cineCheck = () => setCineMode(CINE_IDS.some(id => { const n = $(id); return n && !n.classList.contains('out'); }));
    new MutationObserver(cineCheck).observe(document.body, { childList: true });
    cineCheck();
    if (qs.get('fps') === '1' || LS.get('fps', '') === '1') setFps(true);
    sync();
    // First touch anywhere: try full screen (Android). iOS has no API for
    // it outside Home-Screen web apps, which run full screen anyway.
    // Not any more on a phone that scales the page: browser full screen
    // locks the page at 1:1 (the readout then says IGNORED) and the UI comes
    // out desktop-sized. Installing the app gives full screen AND scaling.
    const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
    if (!standalone && LS.get('autoFS', '1') === '1' && !_applied) {
      const once = () => {
        document.removeEventListener('touchend', once, true);
        const r = document.documentElement;
        const req = r.requestFullscreen || r.webkitRequestFullscreen;
        if (req) Promise.resolve(req.call(r, { navigationUI: 'hide' })).then(() => {
          try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (_) {}
        }).catch(() => {});
      };
      document.addEventListener('touchend', once, true);
    }
  }
  // Installable app: a (pass-through) service worker, only where the
  // browser allows one (https, e.g. the GitHub Pages site).
  if ('serviceWorker' in navigator && window.isSecureContext && location.protocol === 'https:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  // ── 8. Bundled saves ───────────────────────────────────────────────
  // saves/bundled.json lists save files shipped with the mobile build. Each
  // is imported once into this browser's save list (named after its file),
  // so cities from the PC can be played on the phone.
  async function importBundled() {
    await SaveStore.ready;
    const SS = gameGlobal('SaveSystem');
    if (!SS || !SS.importSlot) return;
    let list;
    try { list = await (await fetch('saves/bundled.json', { cache: 'no-store' })).json(); } catch (_) { return; }
    let added = 0;
    for (const file of (list.files || [])) {
      const flag = 'bundled:' + file;
      if (LS.get(flag, '') === '1') continue;
      try {
        const text = await (await fetch('saves/' + encodeURIComponent(file), { cache: 'no-store' })).text();
        const id = await SS.importSlot(text);
        // Name the slot after its file: several saves share one city name.
        try {
          const idx = JSON.parse(localStorage.getItem('powergrid_save_slots') || '[]');
          const e = idx.find((x) => x.id === id);
          if (e) { e.saveName = file.replace(/\.json$/i, ''); localStorage.setItem('powergrid_save_slots', JSON.stringify(idx)); }
        } catch (_) {}
        LS.set(flag, '1');
        added++;
      } catch (err) {
        console.warn('[GW mobile] could not import bundled save', file, err);
      }
    }
    if (added) {
      // The menu drew its buttons before these existed: redraw so CONTINUE shows.
      try { gameGlobal('MenuSystem')?.updateLoadButtonVisibility?.(); } catch (_) {}
      toast(`${added} save${added > 1 ? 's' : ''} from the PC added: open LOAD GAME`);
    }
  }
  window.addEventListener('load', () => setTimeout(importBundled, 300));

  // Exposed for debugging from the console.
  window.GWMobile = { applyViewport, showHelp, toast, setShift, setPick, fsPrompt, framedPrompt };
})();
