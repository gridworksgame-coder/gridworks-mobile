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
  _mixWithOtherAudio();

  // ── Game sound plays alongside the phone's own media ──────────────
  // A podcast or music app on the phone keeps playing at its own level
  // under the game: no dip on every click, no pause when a song starts.
  // The player sets the game's volumes in Settings.
  //
  // iPhone (Safari 16.4+): an "ambient" audio session, which mixes with
  // other apps and never interrupts or ducks them.
  //
  // Android: Chrome gives every <audio> element the phone's audio focus,
  // and a short one (a click) asks the other app to duck for it, a long
  // one (a song) to pause. Web Audio output takes no focus and just mixes.
  // So here `new Audio(…)` (every sound the game makes outside its Web
  // Audio beds) hands back a stand-in with the same face (src, volume,
  // play/pause, currentTime, duration, loop, playbackRate, muted, the
  // events the game listens for) that plays the file through Web Audio.
  // Short files are decoded once and kept; long ones (the music) are
  // decoded at full quality while they play and let go when done.
  // pause_audio.js fades real elements for the pause menu; the same fade
  // is done here for these. ?mixaudio=0 turns all this off.
  function _mixWithOtherAudio() {
    try { if (navigator.audioSession) { navigator.audioSession.type = 'ambient'; return; } } catch (_e) {}
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || qs.get('mixaudio') === '0') return;

    let _ctx = null, _out = null;
    const ctxGet = () => {
      if (!_ctx) {
        _ctx = typeof SFX !== 'undefined' && SFX.context ? SFX.context() : null;
        if (!_ctx) _ctx = new AC();
        // SFX.context() points `destination` at its limiter-and-mute stage;
        // these sounds carry their own levels, so they go straight to the
        // speakers the way the <audio> elements did.
        let real = null;
        try {
          const base = window.BaseAudioContext ? BaseAudioContext.prototype : AC.prototype;
          real = Object.getOwnPropertyDescriptor(base, 'destination').get.call(_ctx);
        } catch (_e) {}
        _out = real || _ctx.destination;
      }
      if (_ctx.state === 'suspended') _ctx.resume().catch(() => {});
      return _ctx;
    };
    // Chrome starts a context suspended until the player touches the page.
    const unlock = () => { if (_ctx && _ctx.state === 'suspended') _ctx.resume().catch(() => {}); };
    window.addEventListener('touchend', unlock, true);
    window.addEventListener('click', unlock, true);

    const BIG = 1.5e6;                           // bytes: a file this size is a song, not a click
    const cache = new Map();                     // src → Promise<AudioBuffer>, short files only
    const load = (src) => {
      if (cache.has(src)) return cache.get(src);
      const p = fetch(src).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(buf => {
        if (buf.byteLength > BIG) {
          cache.delete(src);
          return new Promise((res, rej) => ctxGet().decodeAudioData(buf, res, rej)).then(b => { b.__big = true; return b; });
        }
        return new Promise((res, rej) => ctxGet().decodeAudioData(buf, res, rej));
      });
      cache.set(src, p);
      p.catch(() => cache.delete(src));
      return p;
    };

    const live = new Set();                      // stand-ins sounding now
    const waiting = new Set();                   // asked to start while the pause menu was open
    class MixAudio extends EventTarget {
      constructor(src) {
        super();
        this._src = ''; this._buf = null; this._node = null; this._gain = null; this._tick = null;
        this._vol = 1; this._muted = false; this._rate = 1; this.loop = false;
        this._pos = 0; this._t0 = 0; this._want = false; this._fade = 1;
        this.paused = true; this.ended = false; this.seeking = false;
        this.preload = 'auto'; this.preservesPitch = true;
        if (src) this.src = src;
      }
      get src() { return this._src; }
      set src(v) {
        this._stopNode(); this._buf = null; this._pos = 0; this.ended = false;
        this._src = v ? new URL(v, location.href).href : '';
        if (!this._src) return;
        const me = this._src;
        load(me).then(b => {
          if (this._src !== me) return;
          this._buf = b;
          for (const t of ['loadedmetadata', 'loadeddata', 'canplay', 'canplaythrough']) this._fire(t);
          if (this._want && !this._node) this._start();
        }, () => { if (this._src === me) this._fire('error'); });
      }
      get currentSrc() { return this._src; }
      get readyState() { return this._buf ? 4 : 0; }
      get duration() { return this._buf ? this._buf.duration : NaN; }
      get volume() { return this._vol; }
      set volume(v) { this._vol = Math.max(0, Math.min(1, +v || 0)); this._level(); }
      get muted() { return this._muted; }
      set muted(v) { this._muted = !!v; this._level(); }
      get playbackRate() { return this._rate; }
      set playbackRate(r) {
        if (this._node) { this._pos = this.currentTime; this._t0 = this._node.context.currentTime; }
        this._rate = +r || 1;
        if (this._node) this._node.playbackRate.value = this._rate;
      }
      get currentTime() {
        if (!this._node) return this._pos;
        const d = this.duration, t = this._pos + (this._node.context.currentTime - this._t0) * this._rate;
        return this.loop && d > 0 ? t % d : Math.min(t, d || t);
      }
      set currentTime(v) {
        this._pos = Math.max(0, +v || 0); this.ended = false;
        if (this._node) { this._stopNode(); this._start(); }
      }
      play() {
        if (this.ended) { this._pos = 0; this.ended = false; }
        if (this._background() && typeof PauseAudio !== 'undefined' && PauseAudio.isPaused()) {
          this._played = true; waiting.add(this);   // the pause menu is open: start when it closes
          return Promise.resolve();
        }
        this._played = true;
        this._want = true;
        if (this.paused) { this.paused = false; this._fire('play'); }
        if (this._buf && !this._node) this._start();
        return Promise.resolve();
      }
      pause() {
        waiting.delete(this);
        this._want = false;
        if (this._node) { this._pos = this.currentTime; this._stopNode(); }
        if (!this.paused) { this.paused = true; this._fire('pause'); }
      }
      load() {}
      canPlayType() { return 'maybe'; }
      _background() { return !this._gwExempt && (this._played || this.loop || /\/music\//.test(this._src)); }
      _level() { if (this._gain) this._gain.gain.value = this._muted ? 0 : this._vol * this._fade; }
      _start() {
        const c = ctxGet(), b = this._buf;
        if (!b) return;
        if (this._pos >= b.duration) { if (!this.loop) { this._end(); return; } this._pos %= b.duration; }
        const n = c.createBufferSource(), g = c.createGain();
        n.buffer = b; n.loop = this.loop; n.playbackRate.value = this._rate;
        n.connect(g); g.connect(_out);
        this._node = n; this._gain = g; this._level();
        this._t0 = c.currentTime;
        n.onended = () => { if (this._node === n && !this.loop) this._end(); };
        n.start(0, this._pos);
        live.add(this);
        this._fire('playing');
        this._tick = setInterval(() => this._fire('timeupdate'), 250);
      }
      _stopNode() {
        if (this._tick) { clearInterval(this._tick); this._tick = null; }
        const n = this._node; this._node = null;
        if (n) { n.onended = null; try { n.stop(); } catch (_e) {} try { n.disconnect(); } catch (_e) {} }
        if (this._gain) { try { this._gain.disconnect(); } catch (_e) {} this._gain = null; }
        live.delete(this);
      }
      _end() {
        this._stopNode();
        this._pos = this.duration || 0; this._want = false;
        this.ended = true; this.paused = true;
        this._fire('timeupdate'); this._fire('pause'); this._fire('ended');
        if (this._buf && this._buf.__big) this._buf = null;   // a song: let its memory go
      }
      _fire(type) {
        const ev = new Event(type);
        this.dispatchEvent(ev);
        const h = this['on' + type];
        if (typeof h === 'function') { try { h.call(this, ev); } catch (_e) {} }
      }
    }

    // The pause menu: background sounds fade out over 350 ms and pause,
    // then pick up where they were with a 250 ms fade in.
    let held = null, fade = 1;
    setInterval(() => {
      const quiet = typeof PauseAudio !== 'undefined' && PauseAudio.isPaused();
      if (quiet && !held) { held = new Set(); for (const a of live) if (a._background()) held.add(a); }
      if (!held) return;
      fade = quiet ? Math.max(0, fade - 50 / 350) : Math.min(1, fade + 50 / 250);
      for (const a of held) { a._fade = fade; a._level(); }
      if (quiet && fade === 0) for (const a of held) if (!a.paused) { a.pause(); a._resume = true; }
      if (!quiet) {
        for (const a of held) if (a._resume) { a._resume = false; a.play(); }
        for (const a of waiting) { waiting.delete(a); a.play(); }
        if (fade === 1) { for (const a of held) { a._fade = 1; a._level(); } held = null; }
      }
    }, 50);

    function Audio(src) { return new MixAudio(src); }
    Audio.prototype = MixAudio.prototype;
    Audio.Native = window.Audio;
    window.Audio = Audio;
  }

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
    // 'relaxed': the write counts as done once the browser has it, without
    // waiting on the disk flush, so the save made as the app is left has
    // the best chance of landing before the phone freezes the page.
    const tx = (d) => { try { return d.transaction('kv', 'readwrite', { durability: 'relaxed' }); } catch (_) { return d.transaction('kv', 'readwrite'); } };
    const put = (k, v) => dbReady.then((d) => { if (d) tx(d).objectStore('kv').put(v, k); });
    const del = (k) => dbReady.then((d) => { if (d) tx(d).objectStore('kv').delete(k); });

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
    // Each slot's "saved at" in the index is written the instant a save is
    // made, but the save itself reaches IndexedDB a moment later, in the
    // background. Leaving the app saves to the Quicksave slot, and the phone
    // then freezes the page at once, so that write can be lost while the index
    // still calls the slot the newest: CONTINUE then loaded an old Quicksave
    // instead of the autosaves holding the real progress. So at start-up every
    // slot's time is put back to the one stored inside its own save data.
    let lostWrites = 0;
    function reconcileIndex() {
      try {
        const idx = JSON.parse(lsGet.call(localStorage, 'powergrid_save_slots') || '[]');
        if (!Array.isArray(idx)) return;
        let changed = false;
        for (const s of idx) {
          const v = s && mem.get('powergrid_save_' + s.id);
          if (typeof v !== 'string') continue;
          const at = v.lastIndexOf('"_savedAt":');
          if (at < 0) continue;
          const real = parseInt(v.slice(at + 11, at + 32), 10);
          if (!(real > 0) || real === s.savedAt) continue;
          if ((s.savedAt || 0) - real > 5000) lostWrites++;
          s.savedAt = real;
          changed = true;
        }
        if (changed) lsSet.call(localStorage, 'powergrid_save_slots', JSON.stringify(idx));
      } catch (_) {}
    }
    const ready = dbReady.then((d) => { if (d) reconcileIndex(); return d; });
    if (typeof window !== 'undefined') window.addEventListener('load', () => ready.then(() => {
      if (!lostWrites) return;
      setTimeout(() => {
        try { gameGlobal('MenuSystem')?.updateLoadButtonVisibility?.(); } catch (_) {}
        toast(lostWrites > 1 ? `${lostWrites} saves made as the game closed did not finish writing: CONTINUE picks your newest complete save`
                             : 'The save made as the game last closed did not finish writing: CONTINUE picks your newest complete save');
      }, 1200);
    }));
    // The game must not read a save before this resolves (menu_system.js
    // waits on it): until then the in-memory copy is still filling, and the
    // slot times are not yet checked against the saves themselves.
    window.GWM_SAVES_READY = ready;
    return { ready };
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
  const BUILD = 'm32';   // shown in the diagnostics readout (?fps=1)
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
  // Line cast (waiting, bite, reeling, result): the rod is drawn at the
  // cursor, so a finger must not move the cursor now or the rod jumps to
  // every reeling tap. (Charging is different: dragging aims the cast.)
  const fishingLocked = () => {
    const F = gameGlobal('FishingSystem');
    try { return !!(F && F.isActive?.() && !F.isCharging?.()); } catch (_) { return false; }
  };
  // Camera position helpers (Camera only offers screen → world).
  function worldToScreen(wx, wy) {
    const Cam = gameGlobal('Camera');
    if (!Cam) return null;
    const a = Cam.screenToWorld(0, 0), b = Cam.screenToWorld(100, 0);
    const z = 100 / ((b.x - a.x) || 1);
    return { x: (wx - a.x) * z, y: (wy - a.y) * z };
  }
  let rodAnchor = null;      // world point the rod is planted on while the line is out
  let fingersDown = 0;
  function rodTick() {
    requestAnimationFrame(rodTick);
    const locked = fishingLocked();
    if (!locked) { rodAnchor = null; return; }
    const im = IM(), Cam = gameGlobal('Camera'), cv = $('canvas');
    if (!im || !Cam || !cv || im.lastMouseSX == null) return;
    if (!rodAnchor) { rodAnchor = Cam.screenToWorld(im.lastMouseSX, im.lastMouseSY); return; }
    const sp = worldToScreen(rodAnchor.x, rodAnchor.y);
    if (!sp || (Math.abs(sp.x - im.lastMouseSX) < 0.5 && Math.abs(sp.y - im.lastMouseSY) < 0.5)) return;
    const r = cv.getBoundingClientRect();
    // While reeling with a finger down the button must read as held, or the
    // game treats the move as a missed release and stops reeling.
    let reeling = false;
    try { reeling = !!gameGlobal('FishingSystem')?.isMinigameActive?.() && fingersDown > 0; } catch (_) {}
    mouse(cv, 'mousemove', sp.x + r.left, sp.y + r.top, 0, reeling ? { held: true } : undefined);
  }
  document.addEventListener('touchstart', (e) => { fingersDown = e.touches.length; }, { capture: true, passive: true });
  document.addEventListener('touchend', (e) => { fingersDown = e.touches.length; }, { capture: true, passive: true });
  document.addEventListener('touchcancel', (e) => { fingersDown = e.touches.length; }, { capture: true, passive: true });
  requestAnimationFrame(rodTick);
  const driving = () => { try { return !!gameGlobal('TruckSystem')?.getDriven?.(); } catch (_) { return false; } };
  const inGame = () => {
    const mm = $('main-menu');
    return !!$('canvas') && !visible(mm) && visible($('hud'));
  };

  // ── 2. Map canvas: touch → mouse ───────────────────────────────────
  const TAP_SLOP   = 10;    // px a finger may wander and still be a tap
  const LONG_MS    = 450;   // hold this long (no tool) → right-click
  const TOOL_MS    = 110;   // hold this long (tool in hand) → press starts
  const AIM_DEAD   = 40;    // px: casting drags shorter than this auto-aim at the water
  const DTAP_MS    = 300;   // second tap within this → double tap
  const DTAP_SLOP  = 40;    // px between the two taps of a double tap
  const DUPE_HOLD_MS = 250; // duplicate mode: hold on an item this long, then drag to lay copies
  let pickMode = false;     // duplicate mode: every tap on an item copies it (Q); stays on until ⌖ again
  // What the duplicate (Q) key would copy at the cursor, if anything: the
  // item under it, as long as its tool is unlocked. Read after the hover
  // mousemove so the game's hover tile is the finger's.
  function pickHere() {
    try {
      const st = IM()?.state, GM = gameGlobal('GridManager'), TT = gameGlobal('T'), P = gameGlobal('Progression');
      const e = st && GM ? GM.getEntity(st.hoverCol, st.hoverRow) : null;
      if (!e || e.type === TT.WATER) return null;
      const t = e.type === TT.ROAD && e._bridge ? TT.BRIDGE : e.type === TT.TRUCK && e._hauler ? TT.HAULER : e.type;
      if (e.type !== TT.CONVEYOR && P && P.isUnlocked && !P.isUnlocked(t)) return null;
      return t;
    } catch (_) { return null; }
  }

  function bindCanvas(cv) {
    let one = null;         // single-finger state
    let two = null;         // pinch state
    let suppressUntilClear = false;
    let lastTap = null;     // previous quick tap (double tap → zoom)
    let lastPickTap = null; // previous quick tap in duplicate mode (double tap → off)
    // Only bare ground: a double tap on a truck drives it, and one on a
    // building or road is two clicks on it, as before.
    function emptyGround(x, y) {
      try {
        const r = cv.getBoundingClientRect();
        const w = gameGlobal('Camera').screenToWorld(x - r.left, y - r.top);
        const TL = gameGlobal('TILE') || 40;
        const row = gameGlobal('GridManager').tiles[Math.floor(w.y / TL)];
        if (!row || row[Math.floor(w.x / TL)]) return false;
        const TT = gameGlobal('T'), ER = gameGlobal('EntityRegistry');
        for (const t of ER.getByType(TT.TRUCK)) {
          const tx = t._wx != null ? t._wx : (t.col + 0.5) * TL, ty = t._wy != null ? t._wy : (t.row + 0.5) * TL;
          if (Math.hypot(tx - w.x, ty - w.y) < TL * 1.5) return false;
        }
        return true;
      } catch (_) { return false; }
    }
    // Long-press on a zone's open ground (no building, nothing in hand):
    // open that zone's panel, as a double click does on desktop.
    function openZonePanelHere(x, y) {
      try {
        if (tool()) return false;
        const r = cv.getBoundingClientRect();
        const w = gameGlobal('Camera').screenToWorld(x - r.left, y - r.top);
        const TL = gameGlobal('TILE') || 40, c = Math.floor(w.x / TL), rr = Math.floor(w.y / TL);
        const ZS = gameGlobal('ZoneSystem'), GM = gameGlobal('GridManager');
        const hit = ZS && ZS.getZoneAt(c, rr);
        if (!hit || GM.getEntity(c, rr)) return false;
        const zp = $('zone-panel');
        if (!zp) return false;
        ZS.buildZonePanel(hit.key, hit.index || 0);
        zp.dataset.zone = hit.key;
        zp.dataset.zoneIndex = hit.index || 0;
        zp.classList.add('visible');
        const sx = x - r.left, sy = y - r.top;
        zp.style.left = Math.min(sx + 12, innerWidth - 240) + 'px';
        zp.style.top = Math.min(sy + 12, innerHeight - 300) + 'px';
        return true;
      } catch (_) { return false; }
    }
    // Eased zoom-in by 1.6× about a screen point over ~0.2 s.
    function zoomStep(x, y) {
      const Cam = gameGlobal('Camera');
      if (!Cam || !Cam.zoomByFactorAt) return;
      buzz(10);
      const r = cv.getBoundingClientRect();
      const sx = x - r.left, sy = y - r.top, total = 1.6, dur = 200, t0 = performance.now();
      let done = 1;
      (function step() {
        const k = Math.min(1, (performance.now() - t0) / dur);
        const e = 1 - (1 - k) * (1 - k);
        const want = Math.pow(total, e);
        Cam.zoomByFactorAt(sx, sy, want / done);
        done = want;
        if (k < 1) requestAnimationFrame(step);
      })();
    }

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
      // The bottom zone is a little taller: near the foot of a phone the
      // finger can't get far into it past the build bar and the screen edge.
      const mb = m * 1.35;
      if (y < top + m) dy = -f(top + m - y); else if (y > H - mb) dy = Math.max(0, Math.min(1, (y - (H - mb)) / mb));
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
      // Southward a little quicker (x1.35): laying a run down the screen
      // felt slow next to the other directions.
      Cam.panByScreen(-sp(v.dx), -sp(v.dy) * (v.dy > 0 ? 1.35 : 1));
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
      if (button === 2) chopWatch();
    }
    // Chopping a tree/bush (long-press = hold right button): the game draws
    // the progress bar along the bottom of the tile, right under the finger.
    // Mirror it in a pill above the finger while the hold lasts.
    let chopPill = null, chopRaf = 0;
    function chopWatch() {
      if (chopRaf) return;
      const step = () => {
        chopRaf = 0;
        if (!one || !one.down || one.button !== 2) { chopPill?.classList.remove('show'); return; }
        chopRaf = requestAnimationFrame(step);
        let ent = null, prog = 0;
        try {
          const Cam = gameGlobal('Camera'), GM = gameGlobal('GridManager'), T = gameGlobal('T');
          const TL = gameGlobal('TILE') || 40, r = cv.getBoundingClientRect();
          const w = Cam.screenToWorld(one.x - r.left, one.y - r.top);
          ent = GM.getEntity(Math.floor(w.x / TL), Math.floor(w.y / TL));
          if (ent && (ent.type === T.TREE || ent.type === T.BUSH)) prog = ent._chopProgress || 0;
          else ent = null;
        } catch (_) { ent = null; }
        if (!ent || !(prog > 0)) { chopPill?.classList.remove('show'); return; }
        if (!chopPill) {
          chopPill = el('div', '', '<span class="gwm-chop-lbl"></span><div class="gwm-chop-bar"><i></i></div>');
          chopPill.id = 'gwm-chop';
          chopPill.dataset.offscreenOk = '';
          document.body.appendChild(chopPill);
        }
        const isBush = ent.type === gameGlobal('T').BUSH;
        const pct = Math.min(100, Math.round(prog * 100));
        chopPill.querySelector('.gwm-chop-lbl').textContent = `${isBush ? 'Bush' : 'Tree'} ${pct}%`;
        const bar = chopPill.querySelector('i');
        bar.style.width = pct + '%';
        bar.style.background = `rgb(${Math.round(220 - 220 * prog)},${Math.round(180 + 75 * prog)},0)`;
        chopPill.classList.add('show');
        // Well clear of the fingertip: above it, or below near the top edge.
        const z = ctlZoom, pw = chopPill.offsetWidth * z, ph = chopPill.offsetHeight * z;
        const gap = 70 * z;
        let x = Math.max(8, Math.min(innerWidth - pw - 8, one.x - pw / 2));
        let y = one.y - gap - ph;
        if (y < 8) y = one.y + gap;
        chopPill.style.left = (x / z) + 'px';
        chopPill.style.top = (y / z) + 'px';
      };
      chopRaf = requestAnimationFrame(step);
    }
    // Wires: the first tap on a network lights it up (the hover highlight
    // a mouse gives on PC), a second tap on the same network opens the
    // wire's panel. Returns true for a first tap.
    let wireArmed = -1;
    function wireFirstTap(x, y) {
      if (tool()) { wireArmed = -1; return false; }
      try {
        const Cam = gameGlobal('Camera'), GM = gameGlobal('GridManager'), T = gameGlobal('T');
        const TL = gameGlobal('TILE') || 40, r = cv.getBoundingClientRect();
        const w = Cam.screenToWorld(x - r.left, y - r.top);
        const ent = GM.getEntity(Math.floor(w.x / TL), Math.floor(w.y / TL));
        const net = ent && ent.type === T.WIRE && ent.networkId >= 0 ? ent.networkId : -1;
        if (net < 0 || net === wireArmed) { wireArmed = -1; return false; }
        wireArmed = net;
        return true;
      } catch (_) { wireArmed = -1; return false; }
    }
    // Duplicate mode, held on an item and dragged: pick it up (Q at the
    // spot it was held) and press from there, so the drag lays a run of it
    // like any tool in hand: one goes down wherever the next fits.
    function dupeDrag() {
      const t = one.pick;
      one.pick = null; one.armed = false;
      mouse(cv, 'mousemove', one.sx, one.sy, 0);
      if (t !== tool()) tapKey('q', 'KeyQ');
      if (!tool()) return;
      buzz(12);
      press(0);
    }
    function release() {
      if (!one) return;
      if (edgeRaf) edgeStop();
      if (one.panning) { if (one.down) mouse(cv, 'mouseup', one.x, one.y, one.button); clearTimeout(one.timer); one = null; return; }
      if (one.down) {
        if (one.button === 0 && !one.moved && wireFirstTap(one.x, one.y)) {
          // Let the press go without a release on the map, so no panel
          // opens; the highlight from the finger's position stays up.
          cv.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
          document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
        } else {
          mouse(cv, 'mouseup', one.x, one.y, one.button);
          if (one.button === 0 && !one.moved) mouse(cv, 'click', one.x, one.y, 0);
        }
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
        let p = pt(ts[0]);
        const locked = fishingLocked();
        if (locked) {
          const im = IM(), r = cv.getBoundingClientRect();
          if (im && im.lastMouseSX != null) p = { x: im.lastMouseSX + r.left, y: im.lastMouseSY + r.top };
        }
        const f0 = pt(ts[0]);
        one = { id: ts[0].identifier, sx: p.x, sy: p.y, x: p.x, y: p.y, fx: f0.x, fy: f0.y, t: performance.now(), et: e.timeStamp, down: false, moved: false, button: 0, locked };
        if (!locked) mouse(cv, 'mousemove', p.x, p.y, 0);   // hover → ghost/tooltips
        // Duplicate mode: a touch on an item picks it up (on release); a
        // touch on open ground goes on as normal (places what's in hand).
        one.pick = pickMode && !locked ? pickHere() : null;
        if (one.pick) {
          // Held a moment on the item, a drag lays copies of it the way the
          // finger goes (dupeDrag). A press without a tool would move the item.
          const me = one; one.armTimer = setTimeout(() => { if (one === me && one.pick && !one.moved) { one.armed = true; buzz(12); } }, DUPE_HOLD_MS);
          return;
        }
        const immediate = !!tool() || fishingHold();
        if (immediate) {
          one.timer = setTimeout(() => press(0), fishingHold() ? 0 : TOOL_MS);
        } else {
          one.longTimer = setTimeout(() => {
            if (!one || one.down || one.moved) return;
            // Held on open ground inside a zone: its panel (the double
            // click on desktop). Anywhere else: right-click, as before.
            if (openZonePanelHere(one.x, one.y)) { buzz(25); one.zoneOpened = true; return; }
            buzz(25); press(2);
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
      if (one.locked) {
        // Line out: a drag moves the camera; the rod stays planted
        // (rodTick re-places the cursor on it). Reeling keeps going.
        const p = pt(ts[0]);
        if (!one.panning && Math.hypot(p.x - one.fx, p.y - one.fy) > TAP_SLOP) { one.panning = true; one.moved = true; one.px = p.x; one.py = p.y; }
        if (one.panning) {
          try { gameGlobal('Camera')?.panByScreen(p.x - one.px, p.y - one.py); } catch (_) {}
          one.px = p.x; one.py = p.y;
        }
        return;
      }
      let p = pt(ts[0]);
      let charging = false;
      try { charging = !!gameGlobal('FishingSystem')?.isCharging?.(); } catch (_) {}
      if (charging && one.down && Math.hypot(p.x - one.sx, p.y - one.sy) < AIM_DEAD) p = { x: one.sx, y: one.sy };
      one.x = p.x; one.y = p.y;
      if (!one.moved && Math.hypot(p.x - one.sx, p.y - one.sy) > TAP_SLOP) {
        one.moved = true;
        clearTimeout(one.longTimer); clearTimeout(one.armTimer);
        if (one.pick) {
          if (one.armed) dupeDrag();
          return;                                // a quick swipe from an item does nothing, as before
        }
        if (!one.down) { clearTimeout(one.timer); press(0); return; }
      }
      if (one.down) {
        mouse(cv, 'mousemove', p.x, p.y, one.button, { held: true });
        if (one.button === 0 && !edgeRaf && tool()) { const v = edgeVec(p.x, p.y); if (v.dx || v.dy) { edgeTick._t = 0; edgeTick._since = 0; edgeRaf = requestAnimationFrame(edgeTick); } }
      }
      else if (one.pick) mouse(cv, 'mousemove', p.x, p.y, 0);
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
      // Duplicate mode: a double tap anywhere ends it, and puts away what
      // is in hand (like ✕). The first tap did its normal thing.
      // Sizes are in real screen px (the page is scaled down on a phone), and
      // a finger may wobble a little: one.moved trips at a few px, too
      // strict for a fingertip tap.
      const spx = (_applied && _applied.s) || 1;
      const drift = Math.hypot(one.x - one.sx, one.y - one.sy) * spx;
      if (pickMode && !one.locked && drift < 22) {
        // Timed from the touch events themselves: a busy frame between the
        // handlers must not turn a quick tap into a slow one.
        const now = e.timeStamp;
        if (now - one.et < 400 && lastPickTap && now - lastPickTap.t < 600
            && Math.hypot(one.x - lastPickTap.x, one.y - lastPickTap.y) * spx < 60) {
          lastPickTap = null;
          clearTimeout(one.timer); clearTimeout(one.longTimer);
          if (one.down) mouse(cv, 'mouseup', one.x, one.y, one.button);
          one = null;
          setPick(false);
          putAwayTool();
          buzz(15);
          return;
        }
        lastPickTap = { t: now, x: one.x, y: one.y };
      }
      if (one.zoneOpened) { one = null; return; }   // the hold opened a zone panel
      if (one.pick) {
        // A tap (not a drag) on an item: pick it up, and stay in duplicate
        // mode for the next one. Already holding that very item: leave it
        // (Q on the tool in hand would put it away).
        if (!one.moved) {
          mouse(cv, 'mousemove', one.x, one.y, 0);
          const t = pickHere();
          if (t && t !== tool()) { tapKey('q', 'KeyQ'); buzz(12); }
        }
        one = null;
        return;
      }
      if (!one.down) {
        clearTimeout(one.timer); clearTimeout(one.longTimer);
        // Second quick tap near the first, nothing in hand: zoom in there
        // (the first tap already did its normal click).
        const now = performance.now();
        if (!one.locked && !tool() && !fishingHold() && now - one.t < 250 && emptyGround(one.x, one.y)
            && lastTap && now - lastTap.t < DTAP_MS + 250 && Math.hypot(one.x - lastTap.x, one.y - lastTap.y) < DTAP_SLOP) {
          lastTap = null;
          zoomStep(one.x, one.y);
          one = null;
          return;
        }
        lastTap = { t: now, x: one.x, y: one.y };
        // A quick tap: press + release at the spot.
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
    if (e.target.closest?.('button, a, input, select, textarea, label, [onclick], #notif-stack, #tutorial-card, .gw-toast, .panel, [id$="-panel"]')) return;
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

  // Escape first cancels anything in progress (a road or pipe being
  // drawn), so keep going until the hand is empty.
  function putAwayTool() {
    let n = 0;
    const go = () => { if (tool() && n++ < 3) { tapKey('Escape', 'Escape'); setTimeout(go, 60); } };
    go();
  }
  function setPick(on) {
    pickMode = on;
    pickBtn?.classList.toggle('on', on);
    quick?.querySelector('.gwm-pick')?.classList.toggle('on', on);
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
  const fsAnyway = () => {
    try { return LS.get('fsAnyway', '') === '1' || sessionStorage.getItem('gwm.fsAnyway') === '1'; } catch (_) { return false; }
  };
  // 'full' while the player wants browser full screen; cleared only when
  // they leave it themselves (a reload or app switch leaves it set).
  const fsWanted = () => LS.get('fsWant', '') === '1';
  document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) LS.set('fsWant', '1'); });
  document.addEventListener('webkitfullscreenchange', () => { if (document.webkitFullscreenElement) LS.set('fsWant', '1'); });
  try {
    const D = Document.prototype;
    for (const name of ['exitFullscreen', 'webkitExitFullscreen']) {
      const orig = D[name];
      if (orig) D[name] = function (...a) { LS.set('fsWant', ''); return orig.apply(this, a); };
    }
  } catch (_) {}
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
    // It can open mid-tap (a tap that asked for full screen): the rest of
    // that same tap must not land on one of its buttons.
    const shownAt = performance.now();
    card.addEventListener('click', (e) => { if (performance.now() - shownAt < 450) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    card.querySelector('.gwm-install-go').addEventListener('click', (e) => {
      e.preventDefault();
      LS.set('fsWant', '');   // don't ask again on every reload of this tab
      if (_installPrompt) { const ip = _installPrompt; _installPrompt = null; ip.prompt(); card.remove(); return; }
      card.querySelector('.gwm-frame-text').textContent =
        'Open your browser menu (⋮ at the top right) and choose "Install app" or "Add to Home screen". Then start GRIDWORKS from its new icon. (iPhone: Share → Add to Home Screen.)';
    });
    card.querySelector('.gwm-install-close').addEventListener('click', (e) => { e.preventDefault(); LS.set('fsWant', ''); card.remove(); });
    card.querySelector('.gwm-install-anyway').addEventListener('click', (e) => {
      e.preventDefault();
      LS.set('fsAnyway', '1');
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
    cancelBtn = btn('✕', 'Cancel / put tool away (Esc)', () => {
      // Duplicate mode: one ✕ ends it and puts away what's in hand.
      if (pickMode) { setPick(false); putAwayTool(); }
      else tapKey('Escape', 'Escape');
    }, 'gwm-cancel');
    rotBtn    = btn('⟳', 'Rotate (R)', () => tapKey('r', 'KeyR'), 'gwm-rot');
    const more = btn('⋯', 'More controls', () => toggleDrawer());
    const pk   = btn('⌖', 'Pick: tap an item to copy it (Q)', () => setPick(!pickMode), 'gwm-pick');
    const sh   = btn('⇧', 'Shift (box-select, variants)', () => setShift(!mods.shift), 'gwm-shift');
    const map  = btn('🗺', 'World map (M)', () => tapKey('m', 'KeyM'), 'gwm-map');
    quick.append(cancelBtn, rotBtn, pk, sh, map, more);

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
            <li><b>Double-tap a truck</b> — drive it (pads appear) · double-tap again to park · <b>double-tap open ground</b> to zoom in</li>
            <li><b>✕</b> put the tool away · <b>⟳</b> rotate · <b>⌖</b> pick an item off the map · <b>⇧</b> shift (box-select)</li>
            <li><b>⋯</b> undo, copy/paste, blueprints, research, pause, UI size…</li>
            <li><b>Fishing</b> — with the rod: press and hold on the shore to charge, drag to aim (a short drag aims at the nearest water), let go to cast · with the line out, drag to look around · when it bites, hold the screen to reel</li>
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
  // Where the time goes, from the game's own PerfMonitor (5 s averages):
  // the simulation tick (10 a second when it keeps up), drawing the world,
  // and the busiest systems inside the tick. For performance reports.
  function perfLine() {
    const PM = gameGlobal('PerfMonitor');
    if (!PM) return '';
    const a = (l) => PM.avg(l), mx = (l) => PM.max(l);
    const r1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
    const ticks = PM.count('Total game tick time') / 5;
    let ents = 0;
    try { ents = gameGlobal('EntityRegistry')?.all?.().size || 0; } catch (_) {}
    return `\nsim ${r1(a('Total game tick time'))} ms/tick (max ${Math.round(mx('Total game tick time'))}) · ${r1(ticks)} ticks/s` +
      ` · power ${r1(a('PowerNetwork.tick'))} · pipes ${r1(a('PN: updatePipeConnectivity'))}` +
      ` · draw ${r1(a('RenderSystem.render'))} ms (entities ${r1(a('Entity rendering'))}, bldg ${r1(a('Buildings live-drawn'))})` +
      ` · gfx ${gameGlobal('GfxQuality')?.getMode?.() || '?'}/${gameGlobal('GfxQuality')?.label?.() ?? '?'}` +
      ` · res ${gameGlobal('RenderScale')?.label?.() || '?'} · ${Math.round(ents / 1000)}k items`;
  }
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
          perfLine() +
          `\n${BUILD} · page ${innerWidth}×${innerHeight} · asked ${_applied ? _applied.vw + ' @ ' + _applied.s : 'device-width'} → ${ok}` +
          ` · vv ${Math.round(visualViewport?.width || 0)}×${Math.round(visualViewport?.height || 0)} @ ${(visualViewport?.scale || 0).toFixed(3)}` +
          ` · outer ${outerWidth}×${outerHeight} · dpr ${devicePixelRatio.toFixed(2)}${cineMode ? ' · CUTSCENE' : ''}` +
          `\n${isAppMode() ? 'APP/fullscreen' : 'browser tab'} · screen ${screen.width}×${screen.height} · cutout L${safeL} R${safeR}` +
          `\nFS want ${LS.get('fsWant', '') || '-'} · in ${document.fullscreenElement ? 'YES' : 'no'} · dm ${['fullscreen', 'standalone', 'minimal-ui', 'browser'].find(m => matchMedia('(display-mode: ' + m + ')').matches) || '?'}` +
          ` · standalone ${navigator.standalone ? 'yes' : '-'} · api ${document.documentElement.requestFullscreen ? 'yes' : (document.documentElement.webkitRequestFullscreen ? 'webkit' : 'NONE')}` +
          ` · btn ${document.getElementById('gwm-fsprompt') ? 'shown' : '-'} · tries ${window.GWM_FS_DIAG?.tries || 0} (${window.GWM_FS_DIAG?.last || '-'} → ${window.GWM_FS_DIAG?.result || '-'})` +
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
  // Intro contract letter: big enough to read. It used to be zoomed to the
  // page height, which on a phone left its text about 5 px tall. Now it is
  // scaled (the `scale` property, which leaves its slide-in transform and
  // its place on the page alone) so the text comes out about 14 px on the
  // actual screen, capped so it keeps to the right of City Hall, as on PC,
  // and fits the screen's height (longer text scrolls inside it, following
  // the typing).
  const LETTER_PX = 14;
  function fitLetter() {
    const L = document.querySelector('#gw-intro .gi-letter');
    if (!L) return;
    if (L.style.zoom) L.style.zoom = '';
    const scaled = !!_applied && Math.abs(innerWidth - _applied.vw) <= 2;
    const s = scaled ? _applied.s : 1;                       // screen px per page px
    const side = !L.classList.contains('centred');
    const base = parseFloat(getComputedStyle(L).fontSize) || 12;
    const w0 = L.offsetWidth || 420;
    let k = LETTER_PX / (base * s);
    k = Math.min(k, (side ? 0.56 : 0.92) * innerWidth / w0);
    k = Math.max(0.3, k);
    const ks = k.toFixed(3);
    if (L.style.scale !== ks) {
      L.style.scale = ks;
      L.style.transformOrigin = side ? '100% 50%' : '50% 50%';
    }
    const mh = Math.floor(innerHeight * 0.9 / k) + 'px';
    if (L.style.maxHeight !== mh) L.style.maxHeight = mh;
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
    // ⌖ stays up while duplicating, tool in hand or not, to switch it off.
    quick.querySelector('.gwm-pick').style.display = (t && !pickMode) ? 'none' : '';
    quick.querySelector('.gwm-shift').style.display = (t || pickMode) ? 'none' : '';
    readSafeArea();
    if (playing) dodgePanels();
    // Page not scaled (browser full screen, or inside a frame): a class
    // for the few sizes that need their own tuning there.
    document.documentElement.classList.toggle('gwm-unscaled', !!_applied && Math.abs(innerWidth - _applied.vw) > 2);
    // Full screen (the Options toggle / return button): a few panels size down.
    document.documentElement.classList.toggle('gwm-fs', !!(document.fullscreenElement || document.webkitFullscreenElement));
    // The return-to-full-screen button, however full screen came back.
    if (document.fullscreenElement || document.webkitFullscreenElement) { const fb = $('gwm-fsprompt'); if (fb) fb.remove(); }
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
    // World map overlay: give it touch, and an ✕ to close it (on PC it's
    // closed with M / Esc, which a phone doesn't have to hand).
    const wm = $('worldmap-overlay');
    if (wm) { bindDragSurface(wm); worldMapClose(wm); }
  }

  function worldMapClose(wm) {
    if (wm._gwmX) return;
    const x = el('button', '', '✕');
    x.type = 'button'; x.id = 'gwm-mapx'; x.title = 'Close the map';
    x.style.cssText = 'position:absolute;top:calc(10px + env(safe-area-inset-top,0px));right:calc(12px + var(--gwm-safe-r,0px));z-index:5;' +
      'width:34px;height:34px;padding:0;border-radius:8px;cursor:pointer;font:700 17px/1 Inter,system-ui,sans-serif;' +
      'color:#ffb0a0;background:rgba(8,14,24,0.88);border:1px solid rgba(255,120,100,0.55);zoom:var(--gwm-ctl-zoom,1);';
    // Kept off the map's own drag / click handling underneath.
    for (const t of ['touchstart', 'mousedown', 'pointerdown', 'wheel']) x.addEventListener(t, (e) => e.stopPropagation(), { passive: true });
    x.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { gameGlobal('WorldMapSystem')?.close(); } catch (_) {}
    });
    wm.appendChild(x);
    wm._gwmX = x;
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
    for (const id of ANCHORED) anchorFix($(id));
  }
  // Also used for toasts (placed just under the top bar the same way).
  function anchorFix(n) {
    {
      if (!n || n._gwmAnch) return;
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
  // Full screen wanted from last time: menu_system.js puts it back on the
  // first tap (and keeps the Options buttons in step), so there's no
  // "tap to return" button to show as well.
  function fsResume() {
    return !isAppMode() && !isFramed() && fsWanted() && fsAnyway();
  }
  function fsPrompt() {
    let was = '';
    try { was = sessionStorage.getItem('gwm.wasFS') || ''; sessionStorage.removeItem('gwm.wasFS'); } catch (_) {}
    if (fsResume()) return;
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
    // Gone as soon as the page is back in full screen by any route (the
    // first-tap resume, the Options toggle), not only from its own tap.
    const gone = () => {
      if (!(document.fullscreenElement || document.webkitFullscreenElement)) return;
      b.remove();
      document.removeEventListener('fullscreenchange', gone);
      document.removeEventListener('webkitfullscreenchange', gone);
    };
    document.addEventListener('fullscreenchange', gone);
    document.addEventListener('webkitfullscreenchange', gone);
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

  // ── 6b. Typing bar ────────────────────────────────────────────────
  // The on-screen keyboard covers most of a landscape phone, and the box
  // being typed in (save name, city name, blueprint…) sits behind it, small
  // because the page is scaled down. While a text box has focus, a large
  // bar pinned to the top of the visible area mirrors what is typed, with a
  // caret, and a Done button that closes the keyboard.
  const TYPE_SEL = 'textarea, input:not([type]), input[type=text], input[type=search], input[type=number], input[type=email], input[type=url], input[type=tel]';
  let tbar = null, tIn = null, tBase = 0, tKbSeen = false;
  function typingLabel(inp) {
    const a = inp.getAttribute('aria-label');
    if (a) return a;
    if (inp.id) { const l = document.querySelector(`label[for="${CSS.escape(inp.id)}"]`); if (l && l.textContent.trim()) return l.textContent.trim(); }
    const sec = inp.closest('.pause-section');
    const sl = sec && sec.querySelector('.pause-section-label');
    if (sl && sl.textContent.trim()) return sl.textContent.trim();
    const box = inp.closest('.options-box, [class*="modal"], [id*="modal"]');
    const t = box && box.querySelector('.pause-title, h1, h2, h3');
    if (t && t.textContent.trim()) return t.textContent.replace(/^[^\w]+/, '').trim();
    return inp.placeholder || 'Type';
  }
  function buildTypingBar() {
    tbar = el('div', '', `
      <div class="gwm-tb-main"><div class="gwm-tb-label"></div><div class="gwm-tb-text"></div></div>
      <button type="button" class="gwm-tb-done">Done</button>`);
    tbar.id = 'gwm-typebar';
    tbar.dataset.offscreenOk = '';   // edge-to-edge on purpose: PanelOnScreenGuard would inset it
    // Keep the focus (and the keyboard) on the real box.
    for (const t of ['touchstart', 'mousedown', 'pointerdown']) tbar.addEventListener(t, (e) => { e.stopPropagation(); e.preventDefault(); }, { passive: false });
    const done = tbar.querySelector('.gwm-tb-done');
    const finish = (e) => {
      e.preventDefault(); e.stopPropagation();
      // Just finish typing: close the keyboard and leave the name in the
      // box. Saving / starting stays on the game's own buttons.
      tIn?.blur();
    };
    done.addEventListener('touchend', finish, { passive: false });
    done.addEventListener('click', finish);
    document.body.appendChild(tbar);
  }
  function renderTypingBar() {
    if (!tbar || !tIn) return;
    const txt = tbar.querySelector('.gwm-tb-text');
    const v = tIn.value;
    let at = v.length;
    try { if (tIn.selectionStart != null) at = tIn.selectionStart; } catch (_) {}
    txt.textContent = '';
    if (!v) {
      const ph = el('span', 'gwm-tb-ph'); ph.textContent = tIn.placeholder || '';
      txt.append(el('span', 'gwm-tb-caret'), ph);
    } else {
      txt.append(document.createTextNode(v.slice(0, at)), el('span', 'gwm-tb-caret'), document.createTextNode(v.slice(at)));
    }
    // Long names: keep the caret in view (scroll the bar only, never the page).
    const c = txt.querySelector('.gwm-tb-caret');
    const cx = c.offsetLeft - txt.offsetLeft;
    if (cx > txt.scrollLeft + txt.clientWidth - 8) txt.scrollLeft = cx - txt.clientWidth + 8;
    else if (cx < txt.scrollLeft) txt.scrollLeft = Math.max(0, cx - 8);
  }
  function placeTypingBar() {
    if (!tbar || !tIn) return;
    const vv = window.visualViewport;
    const w = vv ? vv.width : innerWidth, h = vv ? vv.height : innerHeight;
    // Keyboard closed again (Android back) while the box keeps focus: done.
    if (h < tBase * 0.8) tKbSeen = true;
    else if (tKbSeen && h > tBase * 0.9) { tIn.blur(); return; }
    const fs = Math.max(10, Math.min(w / 30, h / 3.2));
    tbar.style.left = (vv ? vv.offsetLeft : 0) + 'px';
    tbar.style.top = (vv ? vv.offsetTop : 0) + 'px';
    tbar.style.width = w + 'px';
    tbar.style.fontSize = fs + 'px';
    tbar.style.paddingLeft = Math.max(fs * 0.6, safeL) + 'px';
    tbar.style.paddingRight = Math.max(fs * 0.6, safeR) + 'px';
  }
  function showTypingBar(inp) {
    if (!tbar) buildTypingBar();
    if (!tIn) { tBase = window.visualViewport ? visualViewport.height : innerHeight; tKbSeen = false; }
    tIn = inp;
    tbar.querySelector('.gwm-tb-label').textContent = typingLabel(inp);
    tbar.classList.add('show');
    placeTypingBar(); renderTypingBar();
  }
  function hideTypingBar() {
    tIn = null;
    tbar?.classList.remove('show');
  }
  document.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches(TYPE_SEL) && !t.readOnly && !t.disabled) showTypingBar(t);
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (!(a && a.matches && a.matches(TYPE_SEL))) hideTypingBar();
    }, 0);
  });
  for (const t of ['input', 'keyup', 'selectionchange']) document.addEventListener(t, renderTypingBar);
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', placeTypingBar);
    visualViewport.addEventListener('scroll', placeTypingBar);
  }
  // The game sometimes hides a modal (or clears a box) without a blur.
  setInterval(() => {
    if (!tIn) return;
    if (!tIn.isConnected || document.activeElement !== tIn || !tIn.offsetParent) { if (document.activeElement === tIn) tIn.blur(); hideTypingBar(); return; }
    placeTypingBar(); renderTypingBar();
  }, 300);

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
    // Toasts: the game places each one just under the top bar in screen px,
    // which their zoom would scale up into the bar. Correct each new one.
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) if (n.classList && n.classList.contains('gw-toast')) anchorFix(n);
    }).observe(document.body, { childList: true });
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
