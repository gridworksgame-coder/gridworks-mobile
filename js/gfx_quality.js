/* ═══════════════════════════════════════════════════════════════════
   GRAPHICS QUALITY
   One knob the renderers read to decide how much to draw per frame:
     2 = high    everything, every frame
     1 = medium  no canvas shadow blur, zone life under a figure budget
     0 = low     as medium, with zone life thinned right down to simple
                 silhouettes

   Separately, "Smooth Building Animation" (on by default) decides how
   zone buildings are drawn below high quality. Turned off, they are always
   blitted from cached bitmaps refreshed a few times a second — much
   cheaper, but their machinery then visibly animates at that refresh rate.
   Left on, BuildingSpriteCache decides per frame: live (and perfectly
   smooth) while few enough are on screen to afford it, bitmaps once there
   are too many. Zone buildings cost far more per frame than everything
   else in the renderer combined, so this is the setting that decides
   whether a dense city is playable — see the policy note on the cache in
   render_main_loop.js for the measurements behind it.

   The player picks Auto / High / Medium / Low in Options (persisted).
   Auto steps the level down when real frame intervals stay long and back
   up after a long stretch of smooth frames, refusing to climb back to a
   level it has already had to leave (so it doesn't oscillate). It also
   prefers frames to detail: a step up that costs frame rate is undone, and
   a view settled under the frame cap tries the level below to see whether
   that gets the frames back. Levels it has ruled out are ruled out for that
   view, not for good: zooming well in or out, or moving a screen away, lets
   it try again.

   Why frame interval and not script time: on integrated graphics the
   bottleneck is the GPU rasterising thousands of anti-aliased paths, which
   never shows up in performance.now() around the draw calls. The rAF
   interval does pick it up once the GPU backs the browser up.
   ═══════════════════════════════════════════════════════════════════ */

const GfxQuality = (() => {
  const KEY   = 'gw_gfx_quality';
  const MODES = ['auto', 'high', 'medium', 'low'];
  const SMOOTH_KEY = 'gw_gfx_smooth_buildings';
  let mode = 'auto';
  let smoothBuildings = true;
  const FPS_KEY = 'gw_fps_cap', FPS_CAPS = [0, 60, 30];
  let fpsCap = 60;
  // "Smooth Camera" (off by default, experimental): see camera_reprojection.js.
  const SMOOTH_CAM_KEY = 'gw_gfx_smooth_camera';
  let smoothCamera = false;
  try {
    const v = localStorage.getItem(KEY); if (MODES.includes(v)) mode = v;
    smoothBuildings = localStorage.getItem(SMOOTH_KEY) !== '0';
    smoothCamera = localStorage.getItem(SMOOTH_CAM_KEY) === '1';
    const f = parseInt(localStorage.getItem(FPS_KEY), 10); if (FPS_CAPS.includes(f)) fpsCap = f;
  } catch (_) {}

  // A browser can keep firing rAF at a healthy rate while the GPU silently
  // drops most of those frames before they reach the screen — the frame
  // interval then looks fine while the game visibly runs at a few fps. So
  // auto can't rely on timing alone: on integrated or software graphics it
  // starts at medium and never climbs above it on its own.
  function _weakGpu() {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const r = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
      if (!gl) return true;                                   // no GPU context at all
      return /intel|swiftshader|basic render|llvmpipe|software|radeon\(tm\) graphics|vega \d+ graphics|adreno|mali/i.test(r);
    } catch (_) { return false; }
  }
  const WEAK_GPU = _weakGpu();
  const AUTO_MAX = WEAK_GPU ? 1 : 2;

  let autoLevel = AUTO_MAX;
  let ceiling   = AUTO_MAX; // highest level auto may climb back to
  let ema       = 16.7;     // smoothed real frame interval, ms
  let lastT     = 0;
  let slowSince = 0, fastSince = 0, lastStepUpAt = -Infinity;

  // Step down at ~33fps, not ~25. The old 40ms floor left a wide dead band
  // (25-45fps) in which auto did nothing at all, so a city that settled at a
  // steady 30fps stayed pinned at whatever level it was on — including high,
  // where BuildingSpriteCache is switched off entirely and every zone
  // building on screen is re-rendered in full every frame. That is exactly
  // the zoomed-out case this is supposed to rescue, and it never fired.
  // 30ms had the same flaw a step higher: a view holding a steady 33-34fps
  // smoothed to just under it and sat at high indefinitely. ~38fps leaves a
  // usual frame-to-frame wobble clear of the line.
  const SLOW_MS = 26, FAST_MS = 20;        // ~38fps down, ~50fps up
  const SLOW_HOLD = 1500, FAST_HOLD = 10000;

  function level() {
    return mode === 'high' ? 2 : mode === 'medium' ? 1 : mode === 'low' ? 0 : autoLevel;
  }

  // Canvas shadow blur is one of the slowest things a 2D canvas can do on
  // integrated graphics. Below high quality it's swallowed at the context:
  // an own-property setter on the main context shadows the prototype's, so
  // the twenty-odd `ctx.shadowBlur = …` sites don't each need a check.
  const _blurDesc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
  let _blurKilled = false;
  function _applyBlur() {
    if (typeof canvas === 'undefined' || !_blurDesc) return;
    const main = canvas.getContext('2d');
    const kill = level() < 2;
    // The interface's frosted glass goes with it: see body.gfx-lite in
    // theme-dashboard.css for what the backdrop blurs cost.
    if (document.body) document.body.classList.toggle('gfx-lite', kill);
    if (kill === _blurKilled) return;
    _blurKilled = kill;
    if (kill) {
      _blurDesc.set.call(main, 0);
      Object.defineProperty(main, 'shadowBlur', {
        configurable: true,
        get() { return 0; },
        set(_) {},
      });
    } else {
      delete main.shadowBlur;
    }
  }

  // Permanently mutes shadow blur on an offscreen context (the building
  // sprite cache's, which is only ever drawn into below high quality).
  function muteBlur(c) {
    if (!_blurDesc) return;
    _blurDesc.set.call(c, 0);
    Object.defineProperty(c, 'shadowBlur', { configurable: true, get() { return 0; }, set(_) {} });
  }

  // A step up is a trial. A few seconds in, the frame interval is held up
  // against the one that earned the climb: if the higher level costs more
  // than a few percent of the frame rate (and is off the cap), auto steps
  // back and (through the fell-straight-back rule below) stays there.
  // Without it a machine that ran a level at 57fps climbed to one that held
  // 49-52fps, above the line it steps down at, and stayed: smooth frames
  // traded for detail nobody had asked for (High is still there to choose).
  // Judged on a slower average than `ema` (about a second's worth), so one
  // tick's long frame can't decide it either way.
  //
  // And the same question the other way round. Auto starts at the top, and
  // a level that holds above the slow line is never stepped down from, so a
  // view settled below the frame cap (say 50fps of 60) would never find out
  // whether the level below gets it back. After PROBE_HOLD there, it tries
  // the level below for TRIAL_MS: a few percent faster and it stays (that
  // is the new ceiling), otherwise it goes back up and leaves it a while,
  // twice as long after each probe that found nothing.
  const TRIAL_MS = 3000, TRIAL_COST = 1.06;
  const PROBE_HOLD = 8000, PROBE_AGAIN = 60000, PROBE_AGAIN_MAX = 600000;
  let trial = null;   // { from, ema, at, up } while a step up or a probe down is on trial
  let emaSlow = 16.7;
  let belowSince = 0, belowView = null, lastProbeAt = -Infinity, probeWait = PROBE_AGAIN;

  // What a level costs is what is on screen: a ceiling found zoomed right
  // out over the industrial belt says little about a close look at one
  // street. So a lowered ceiling remembers the view it was found at, and is
  // lifted once the camera is well away from it: zoomed CEIL_ZOOM_SPAN in
  // or out, or moved a whole screen. The same goes for a probe that found
  // nothing: its wait is for that view.
  const CEIL_ZOOM_SPAN = 1.6;
  let ceilingView = null, probeView = null;   // { z, x, y } (camera centre, world px)
  function _viewNow() {
    if (typeof Camera === 'undefined') return null;
    const z = Camera.zoom;
    return { z, x: Camera.x + innerWidth / z / 2, y: Camera.y + innerHeight / z / 2 };
  }
  function _farFrom(v) {
    const n = v && _viewNow();
    if (!n) return false;
    return n.z > v.z * CEIL_ZOOM_SPAN || n.z < v.z / CEIL_ZOOM_SPAN ||
           Math.abs(n.x - v.x) > innerWidth / n.z || Math.abs(n.y - v.y) > innerHeight / n.z;
  }
  function _lowerCeiling(lv) {
    ceiling = lv;
    ceilingView = _viewNow();
  }

  function _stepTo(lv, now) {
    if (lv > autoLevel) { lastStepUpAt = now; trial = { from: autoLevel, ema: emaSlow, at: now, up: true, view: _viewNow() }; }
    else { trial = null; if (now - lastStepUpAt < 15000) _lowerCeiling(lv); }   // climbed and fell straight back
    autoLevel = lv;
    _applyBlur();
  }

  // Called once per rAF from the game loop.
  function frame(now) {
    if (lastT) {
      const dt = Math.min(250, now - lastT);   // a backgrounded tab's gap isn't a slow frame
      ema += (dt - ema) * 0.1;
      emaSlow += (dt - emaSlow) * 0.02;
      PerfMonitor.record('Frame interval', dt);
    }
    lastT = now;
    if (mode !== 'auto') return;
    // A deliberate frame cap isn't a slow machine: judge against the cap.
    const capMs = fpsCap ? 1000 / fpsCap : 0;
    const slowMs = Math.max(SLOW_MS, capMs * 1.25), fastMs = Math.max(FAST_MS, capMs * 1.1);
    if (ceiling < AUTO_MAX && _farFrom(ceilingView)) { ceiling = AUTO_MAX; ceilingView = null; }
    if (_farFrom(probeView)) { probeView = null; probeWait = PROBE_AGAIN; lastProbeAt = -Infinity; }
    // A trial is a comparison within one view. If the camera has gone
    // somewhere else since it began, its two numbers describe different
    // scenes: a probe goes back where it came from, a step up just stands,
    // and neither rules anything out.
    if (trial && _farFrom(trial.view)) {
      if (!trial.up) { autoLevel = trial.from; _applyBlur(); }
      trial = null; slowSince = fastSince = belowSince = 0;
    }
    if (trial && now - trial.at > TRIAL_MS) {
      const tr = trial;
      trial = null;
      if (tr.up) {
        // The climb cost frames: back down, and (falling straight back) that's the ceiling.
        if (emaSlow > Math.max(tr.ema * TRIAL_COST, capMs * 1.1)) { _stepTo(tr.from, now); slowSince = fastSince = 0; return; }
      } else {
        lastProbeAt = now; probeView = _viewNow();
        if (emaSlow * TRIAL_COST < tr.ema) { _lowerCeiling(Math.min(ceiling, autoLevel)); probeWait = PROBE_AGAIN; }   // faster down here: stay
        else { autoLevel = tr.from; _applyBlur(); probeWait = Math.min(PROBE_AGAIN_MAX, probeWait * 2); }       // no better: back up
        slowSince = fastSince = belowSince = 0;
        return;
      }
    }
    if (trial && !trial.up) return;   // a probe runs its course
    // Settled under the cap but above the slow line: probe the level below.
    // On the slow average both ways: the odd long frame (a sim tick) spikes
    // `ema` over the slow line for a frame or two, which would restart the
    // wait every few seconds and the probe would never come.
    if (capMs && autoLevel > 0 && emaSlow > capMs * TRIAL_COST && emaSlow <= slowMs) {
      if (!belowSince || _farFrom(belowView)) { belowSince = now; belowView = _viewNow(); }
      else if (now - belowSince > PROBE_HOLD && now - lastProbeAt > probeWait) {
        trial = { from: autoLevel, ema: emaSlow, at: now, up: false, view: _viewNow() };
        autoLevel--; _applyBlur();
        belowSince = 0;
        return;
      }
    } else belowSince = 0;
    if (ema > slowMs) {
      fastSince = 0;
      if (!slowSince) slowSince = now;
      else if (now - slowSince > SLOW_HOLD && autoLevel > 0) { _stepTo(autoLevel - 1, now); slowSince = now; }
    } else if (ema < fastMs) {
      slowSince = 0;
      if (!fastSince) fastSince = now;
      else if (now - fastSince > FAST_HOLD && autoLevel < ceiling) { _stepTo(autoLevel + 1, now); fastSince = now; }
    } else {
      slowSince = fastSince = 0;
    }
  }

  function setMode(m) {
    if (!MODES.includes(m)) return;
    mode = m;
    try { localStorage.setItem(KEY, m); } catch (_) {}
    if (m === 'auto') { autoLevel = AUTO_MAX; ceiling = AUTO_MAX; slowSince = fastSince = belowSince = 0; trial = null; lastProbeAt = -Infinity; probeWait = PROBE_AGAIN; ceilingView = probeView = null; }
    _applyBlur();
  }

  return {
    level,
    frame,
    setMode,
    getMode() { return mode; },
    smoothBuildings() { return smoothBuildings; },
    setSmoothBuildings(on) {
      smoothBuildings = !!on;
      try { localStorage.setItem(SMOOTH_KEY, on ? '1' : '0'); } catch (_) {}
    },
    smoothCamera() { return smoothCamera; },
    setSmoothCamera(on) {
      smoothCamera = !!on;
      try { localStorage.setItem(SMOOTH_CAM_KEY, on ? '1' : '0'); } catch (_) {}
    },
    fpsCap() { return fpsCap; },
    setFpsCap(v) {
      if (!FPS_CAPS.includes(v)) return;
      fpsCap = v;
      try { localStorage.setItem(FPS_KEY, String(v)); } catch (_) {}
    },
    label() { return ['low', 'medium', 'high'][level()]; },
    fpsEstimate() { return 1000 / ema; },
    weakGpu: WEAK_GPU,
    muteBlur,
  };
})();
GfxQuality.setMode(GfxQuality.getMode());   // apply the saved mode's blur setting now
