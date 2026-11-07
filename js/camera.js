/* ═══════════════════════════════════════════════════════════════════
   CAMERA
   Owns the viewport transform: pan offset (x, y) and zoom scale.
   All world→screen and screen→world conversions live here so no
   other system needs to know about the camera.

   Pan is stored in world-space pixels (before zoom is applied).
     screen = (world - pan) * zoom
     world  = screen / zoom + pan
   ═══════════════════════════════════════════════════════════════════ */
const Camera = (() => {
  const ZOOM_STEP  = 0.12;
  // Max zoom-out limited to 2 scroll-steps in from the previous max zoom-out (0.25),
  // using the same per-step factor zoomAt() uses when zooming in.
  // Mobile: zoom out further (a phone screen shows far less map).
  const ZOOM_MIN   = window.GW_MOBILE ? 0.18 : 0.25 * Math.pow(1 + ZOOM_STEP, 2);
  const ZOOM_MAX   = 3.0;
  const FRICTION   = 0.88;   // velocity multiplier per frame (lower = more slide)
  const KEY_ACCEL  = 0.8;    // keyboard acceleration per frame (world units)
  const DRAG_INERTIA = 0.75; // how much drag velocity is kept on release

  let panX = 0;
  let panY = 0;
  let zoom = 1;
  let vx   = 0;   // current pan velocity (world units/frame)
  let vy   = 0;

  // Smooth pan target for recentre animation
  let targetX = null;
  let targetY = null;
  const EASE  = 0.10;

  // Bumped every time the PLAYER moves the camera themselves — a drag or a
  // WASD/arrow press. Anything that auto-follows a moving subject by calling
  // panTo() every frame watches this so it can let go the instant the player
  // takes over; without it a follow re-centres on its subject every frame and
  // the player simply cannot pan away from it.
  let manualPanSeq = 0;
  // Bumped by every recentreOn() jump, so a caller can tell whether some
  // action it just ran relocated the camera (see NotificationStack clicks).
  let recentreSeq = 0;
  // Set while Camera.cut() runs a callback: recentreOn() lands at once
  // instead of easing there.
  let cutting = false;

  function centreOnGrid(canvasW, canvasH) {
    const gridW = COLS * TILE;
    const gridH = ROWS * TILE;
    panX = (gridW - canvasW / zoom) / 2;
    panY = (gridH - canvasH / zoom) / 2;
    vx = 0; vy = 0;
  }

  function targetForWorldCentre(cx, cy, canvasW, canvasH) {
    return {
      x: cx - canvasW / zoom / 2,
      y: cy - canvasH / zoom / 2,
    };
  }

  // ── Optional pan limit ───────────────────────────────────────────
  // A world-space rect the viewport must stay inside. Used to keep the
  // player on a contract job site instead of letting them wander off
  // across the empty rest of the grid. Null = the home default: the map
  // plus a thin margin, enough to see the CITY LIMITS line and a strip of
  // the country past it (world_backdrop.js) but not to roam out into it.
  //
  // Applied through clampPan() after every write to panX/panY rather
  // than by a watcher, so there is no frame where the camera is outside
  // the limit and no fighting with the player's own input.
  let limit = null;   // { minX, minY, maxX, maxY } in world pixels
  const HOME_MARGIN = 6 * TILE;
  const _homeLimit = () => ({ minX: -HOME_MARGIN, minY: -HOME_MARGIN,
                              maxX: COLS * TILE + HOME_MARGIN, maxY: ROWS * TILE + HOME_MARGIN });

  function clampPan() {
    const limit = _limitNow();
    const vw = window.innerWidth  / zoom;
    const vh = window.innerHeight / zoom;
    const spanX = limit.maxX - limit.minX;
    const spanY = limit.maxY - limit.minY;
    // When the allowed area is smaller than the viewport, centre on it —
    // clamping normally would be unsatisfiable (min > max).
    panX = spanX <= vw ? limit.minX + (spanX - vw) / 2
                       : Math.max(limit.minX, Math.min(limit.maxX - vw, panX));
    panY = spanY <= vh ? limit.minY + (spanY - vh) / 2
                       : Math.max(limit.minY, Math.min(limit.maxY - vh, panY));
  }
  function _limitNow() { return limit || _homeLimit(); }

  // ── Screen shake ─────────────────────────────────────────────────
  // A decaying jitter applied to the draw transform ONLY. Pan is left
  // untouched, so screenToWorld — and therefore every click, hover and
  // placement preview — keeps pointing at the tile the player thinks
  // they are on while the ground is still ringing.
  //
  // Magnitude is in SCREEN pixels and decays exponentially off the wall
  // clock, so a shake looks and lasts the same at any zoom or frame rate.
  let shakeMag = 0;          // current amplitude, screen px
  let shakeAt  = 0;          // performance.now() of the last update
  const SHAKE_HALFLIFE = 0.22;   // seconds for the amplitude to halve
  const SHAKE_MAX      = 26;     // hard ceiling, so a chain of blasts can't
                                 // shake the view into unreadability

  function shakeOffset() {
    if (shakeMag <= 0.05) return null;
    const now = performance.now() / 1000;
    const dt  = Math.max(0, now - shakeAt);
    shakeAt   = now;
    shakeMag *= Math.pow(0.5, dt / SHAKE_HALFLIFE);
    if (shakeMag <= 0.05) { shakeMag = 0; return null; }
    // Two out-of-phase sines per axis rather than random(): a rumble with
    // direction to it, instead of per-frame static.
    return {
      x: shakeMag * (Math.sin(now * 47) * 0.6 + Math.sin(now * 83 + 1.7) * 0.4),
      y: shakeMag * (Math.sin(now * 53 + 2.1) * 0.6 + Math.sin(now * 71) * 0.4),
    };
  }

  return {
    get x()    { return panX; },
    get y()    { return panY; },
    get zoom() { return zoom; },

    // Adds to whatever is still ringing (capped), so overlapping blasts
    // build rather than the newest one resetting the old.
    shake(mag) {
      shakeOffset();                       // decay what's there first
      shakeMag = Math.min(SHAKE_MAX, shakeMag + Math.max(0, mag || 0));
      shakeAt  = performance.now() / 1000;
    },
    getShake() { return shakeMag; },

    // rect is in world pixels, or null to lift the restriction.
    setPanLimit(rect) {
      limit = rect || null;
      if (limit) { clampPan(); targetX = null; targetY = null; vx = 0; vy = 0; }
    },
    getPanLimit() { return limit; },

    // The render-scale factor (render_core.js) is folded into the base
    // transform rather than applied at each draw site: every renderer goes
    // on authoring in CSS pixels and the whole frame lands on a smaller
    // backing store. RenderScale is defined in a file that loads after this
    // one, so it's read at call time, not captured.
    applyTransform(ctx) {
      const s = shakeOffset();
      const rs = typeof RenderScale === 'undefined' ? 1 : RenderScale.get();
      const z = zoom * rs;
      ctx.setTransform(z, 0, 0, z,
                       (-panX * zoom + (s ? s.x : 0)) * rs,
                       (-panY * zoom + (s ? s.y : 0)) * rs);
    },

    // "Screen space" for the caller — still CSS pixels, not device pixels.
    resetTransform(ctx) {
      const rs = typeof RenderScale === 'undefined' ? 1 : RenderScale.get();
      ctx.setTransform(rs, 0, 0, rs, 0, 0);
    },

    screenToWorld(sx, sy) {
      // sx/sy are CSS pixels; canvas is DPR×, so transform already handles it
      return { x: sx / zoom + panX, y: sy / zoom + panY };
    },

    // Called during drag — accumulates velocity so release feels smooth.
    // panByScreen and zoomAt are the player's camera (mouse, wheel, gamepad);
    // while the apocalypse cutscene runs it owns the camera (setZoom, jumpTo,
    // panTo), so they do nothing.
    panByScreen(dsx, dsy) {
      if (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.locksInput()) return;
      targetX = null;
      targetY = null;
      manualPanSeq++;
      const dx = -dsx / zoom;
      const dy = -dsy / zoom;
      panX += dx;
      panY += dy;
      clampPan();
      // Feed velocity so inertia kicks in after release
      vx = dx * DRAG_INERTIA;
      vy = dy * DRAG_INERTIA;
    },

    // Called on drag release to let inertia coast naturally
    releaseDrag() {
      // velocity already set by panByScreen; just let keyboardTick apply friction
    },

    zoomAt(sx, sy, delta) {
      if (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.locksInput()) return;
      const factor = delta > 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP;
      let newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * factor));
      // Clamping pan alone still lets the player zoom out until the empty
      // world beyond a limited area fills the screen. Hold zoom at the
      // point where the allowed area exactly fills the viewport.
      if (limit) {
        const fitZoom = Math.max(window.innerWidth  / (limit.maxX - limit.minX),
                                 window.innerHeight / (limit.maxY - limit.minY));
        newZoom = Math.max(newZoom, Math.min(ZOOM_MAX, fitZoom));
      }
      const wx = sx / zoom + panX;
      const wy = sy / zoom + panY;
      zoom = newZoom;
      panX = wx - sx / zoom;
      panY = wy - sy / zoom;
      clampPan();
    },

    // Continuous zoom for touch pinch (mobile.js): scale by an arbitrary
    // factor, keeping the world point under (sx, sy) fixed — zoomAt() only
    // takes whole wheel steps.
    zoomByFactorAt(sx, sy, f) {
      if (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.locksInput()) return;
      if (!(f > 0)) return;
      let newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * f));
      if (limit) {
        const fitZoom = Math.max(window.innerWidth  / (limit.maxX - limit.minX),
                                 window.innerHeight / (limit.maxY - limit.minY));
        newZoom = Math.max(newZoom, Math.min(ZOOM_MAX, fitZoom));
      }
      targetX = null; targetY = null;
      manualPanSeq++;
      const wx = sx / zoom + panX;
      const wy = sy / zoom + panY;
      zoom = newZoom;
      panX = wx - sx / zoom;
      panY = wy - sy / zoom;
      vx = 0; vy = 0;
      clampPan();
    },

    // Zoom limits, and a direct setter for scripted camera work.
    //
    // `zoom` itself is a getter with no setter on purpose — every ordinary
    // zoom goes through zoomAt(), which keeps the world point under the
    // cursor fixed. A cinematic doesn't have a cursor to anchor to: it eases
    // the scale every frame while panTo() owns the centre, so it needs to
    // write the scale on its own. Assigning Camera.zoom silently did nothing
    // (sloppy-mode write to an accessor without a setter), which is exactly
    // the kind of no-op that looks like it worked.
    ZOOM_MIN, ZOOM_MAX,
    setZoom(z) {
      zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z || 1));
      clampPan();
    },

    // Hard cut: put (wx, wy) on screen centre THIS frame, no easing.
    // recentreOn() and panTo() both travel, which is right for following
    // something and wrong for a cut — a shot that spends a second and a
    // half flying to its subject arrives after the thing it was cutting to
    // has already happened.
    jumpTo(wx, wy) {
      const W = window.innerWidth, H = window.innerHeight;
      panX = wx - W / zoom / 2;
      panY = wy - H / zoom / 2;
      targetX = null; targetY = null;
      vx = 0; vy = 0;
      clampPan();
    },

    recentre(canvasW, canvasH) {
      let minC = COLS, maxC = 0, minR = ROWS, maxR = 0, found = false;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (GridManager.getEntity(c, r)) {
            minC = Math.min(minC, c); maxC = Math.max(maxC, c);
            minR = Math.min(minR, r); maxR = Math.max(maxR, r);
            found = true;
          }
      const cx = found ? ((minC + maxC + 1) / 2) * TILE : (COLS * TILE) / 2;
      const cy = found ? ((minR + maxR + 1) / 2) * TILE : (ROWS * TILE) / 2;
      const t  = targetForWorldCentre(cx, cy, canvasW, canvasH);
      targetX  = t.x;
      targetY  = t.y;
      vx = 0; vy = 0;
    },

    keyboardTick(keys) {
      const pressing =
        keys.has('ArrowLeft')  || keys.has('a') || keys.has('A') ||
        keys.has('ArrowRight') || keys.has('d') || keys.has('D') ||
        keys.has('ArrowUp')    || keys.has('w') || keys.has('W') ||
        keys.has('ArrowDown')  || keys.has('s') || keys.has('S');

      if (pressing) {
        // Keyboard input: accelerate velocity, cancel recentre target
        targetX = null;
        targetY = null;
        manualPanSeq++;
        const accel = KEY_ACCEL / zoom;
        if (keys.has('ArrowLeft')  || keys.has('a') || keys.has('A')) vx -= accel;
        if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) vx += accel;
        if (keys.has('ArrowUp')    || keys.has('w') || keys.has('W')) vy -= accel;
        if (keys.has('ArrowDown')  || keys.has('s') || keys.has('S')) vy += accel;

        // Cap velocity so it doesn't accelerate forever
        const maxV = 14 / zoom;
        vx = Math.max(-maxV, Math.min(maxV, vx));
        vy = Math.max(-maxV, Math.min(maxV, vy));
      }

      if (targetX !== null) {
        // Smooth recentre animation — override velocity
        vx = 0; vy = 0;
        panX += (targetX - panX) * EASE;
        panY += (targetY - panY) * EASE;
        if (Math.abs(targetX - panX) < 0.5 && Math.abs(targetY - panY) < 0.5) {
          panX = targetX; panY = targetY;
          targetX = null; targetY = null;
        }
        clampPan();
      } else {
        // Apply velocity then friction
        panX += vx;
        panY += vy;
        clampPan();
        vx   *= FRICTION;
        vy   *= FRICTION;
        // Kill tiny velocity to avoid infinite micro-drift
        if (Math.abs(vx) < 0.01) vx = 0;
        if (Math.abs(vy) < 0.01) vy = 0;
      }
    },

    // Read by auto-follow code to notice the player has grabbed the camera.
    manualPanSeq: () => manualPanSeq,
    recentreSeq:  () => recentreSeq,

    recentreOn(wx, wy) {
      recentreSeq++;
      const W = window.innerWidth, H = window.innerHeight;
      const t = targetForWorldCentre(wx, wy, W, H);
      targetX = t.x; targetY = t.y;
      vx = 0; vy = 0;
      if (cutting) { panX = targetX; panY = targetY; targetX = null; targetY = null; clampPan(); }
    },
    // Run fn with every recentreOn() it makes turned into a hard cut. For
    // "click to jump there": the player asked to be somewhere, not to be
    // flown across the map to it.
    cut(fn) {
      const was = cutting;
      cutting = true;
      try { return fn(); } finally { cutting = was; }
    },
    loadState({ panX: px, panY: py, zoom: z }) { panX = px; panY = py; zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)); vx = 0; vy = 0; clampPan(); },
    centreOnGrid,
    // Smoothly pan so world point (wx, wy) is centred on screen — used to
    // follow a driven truck. dt-scaled exponential smoothing so the follow
    // speed stays consistent regardless of frame rate (previously eased by
    // a flat 12% per call, which sped up/slowed down with FPS and produced
    // a jittery-feeling follow whenever frame time varied).
    //
    // A follow owns the camera while it runs, so it cancels any pending
    // recentre animation (e.g. the one Focus starts): keyboardTick would
    // otherwise keep easing toward that stale point every frame while this
    // eases toward the moving subject, and the two pulls read as shake.
    panTo(wx, wy, dt = 1/60, followRate = 8) {
      targetX = null; targetY = null;
      const W = window.innerWidth, H = window.innerHeight;
      const tx = wx - W / zoom / 2;
      const ty = wy - H / zoom / 2;
      const FOLLOW_RATE = followRate; // higher = snappier follow, per-second
      const alpha = 1 - Math.exp(-FOLLOW_RATE * dt);
      panX += (tx - panX) * alpha;
      panY += (ty - panY) * alpha;
      clampPan();
      vx = 0; vy = 0;
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   RENDER SYSTEM
   Pure read of game state → canvas draw calls.
   Stateless: never mutates anything outside canvas context.
   
   Rendering layers (bottom → top):
   1. Grid background lines
   2. Entity base shapes
   3. Power glow effects (powered state)
   4. Overload flicker effect
   5. Cursor ghost (placement preview)
   ═══════════════════════════════════════════════════════════════════ */
