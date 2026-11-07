/* ═══════════════════════════════════════════════════════════════════
   CAMERA REPROJECTION  ("Smooth Camera" in Options, off by default)
   When a full world render can't keep up with the display, some frames
   are not rendered at all: the last finished frame is drawn again,
   shifted and scaled to where the camera is NOW. That costs one
   drawImage (about half a millisecond against 25-50 for a real frame in
   a dense city), so the camera keeps moving between real frames.

   It only ever steps in while the camera is moving and real frames are
   slow. A still camera, or a machine that keeps up, renders every frame
   exactly as before.

   What a reprojected frame gets wrong, and why that is acceptable:
     - Nothing in the world has moved since the keyframe: trucks, drones
       and building animation advance at the real-frame rate only.
     - The strip of world the pan has just uncovered isn't in the
       keyframe. Its edge pixels are stretched over the gap. That only
       passes while the strip is thin, so a move that would uncover more
       (a fast drag, any zoom out) is not reprojected at all: stretched
       over a wide gap it reads as the screen warping. Filling the strip
       with the ground from the background cache instead was tried and
       measured further from the real frame in a built-up area, where the
       strip is mostly buildings, not grass.
     - Screen-space overlays baked into the keyframe (the sun glow, the
       cursor lantern) travel with the world for that frame.
   Anything else where those would show is not reprojected either: a driven
   or Focused truck (the camera follows it, so the keyframe's truck, a frame
   behind, would slide back and snap forward every real frame: worst at
   high game speed, when it moves furthest per frame and real frames are
   slowest), screen shake, the intro, trailer mode and the end-of-run
   sequence.
   ═══════════════════════════════════════════════════════════════════ */
const CameraReprojection = (() => {
  // Real-frame interval above which reprojection steps in / below which it
  // lets go again (~45fps and ~55fps). Measured on real frames only: the
  // cheap frames in between would otherwise make a slow machine look fast
  // and switch this straight back off.
  const ENGAGE_MS = 22, RELEASE_MS = 18;
  // Reprojected frames per real one. Each costs the world a display refresh
  // it could have started rendering in, so one is the rule and more are kept
  // for real frames slow enough that the camera would otherwise visibly stall.
  const TWO_MS = 60, THREE_MS = 100;
  const MAX_ZOOM_IN = 1.3;    // further in than this from the keyframe's zoom is too soft to show
  // Widest strip (CSS px) the keyframe may leave uncovered at a screen edge.
  // Two frames of keyboard pan at full speed is 28.
  const MAX_GAP = 32;

  let key = null, kctx = null;          // copy of the last real frame, device pixels
  let kx = 0, ky = 0, kz = 1, kValid = false;
  let px = NaN, py = NaN, pz = NaN;     // camera at the last frame put on screen
  let realEma = 16.7, lastNow = 0, lastWasReal = true;
  let engaged = false, sinceReal = 0;
  let reprojected = 0;                  // running count, for stats()

  function _blocked() {
    if (Camera.getShake() > 0) return true;
    if (TruckSystem.getDriven() || TruckSystem.getFocused()) return true;
    if (typeof ApocalypseSystem !== 'undefined' && (ApocalypseSystem.isActive() || ApocalypseSystem.hasEnded())) return true;
    if (typeof IntroCinematic !== 'undefined' && IntroCinematic.isActive()) return true;
    if (typeof TrailerMode !== 'undefined' && TrailerMode.isActive()) return true;
    return false;
  }

  function _release() {
    kValid = false;
    if (key && key.width > 1) { key.width = 0; key.height = 0; }   // hand the buffer back
  }

  // Called once per drawn frame, before anything is drawn. True means this
  // frame should be present()ed instead of rendered.
  function wants(now) {
    if (lastNow && lastWasReal) realEma += (Math.min(250, now - lastNow) - realEma) * 0.2;
    lastNow = now;
    if (!GfxQuality.smoothCamera()) { engaged = false; return false; }
    // A deliberate frame cap isn't a slow machine: judge against the cap.
    const cap = GfxQuality.fpsCap(), capMs = cap ? 1000 / cap : 0;
    if (engaged) { if (realEma < Math.max(RELEASE_MS, capMs * 1.1)) engaged = false; }
    else if (realEma > Math.max(ENGAGE_MS, capMs * 1.25)) engaged = true;
    if (!engaged || !kValid) return false;
    if (key.width !== canvas.width || key.height !== canvas.height) return false;
    if (sinceReal >= (realEma > THREE_MS ? 3 : realEma > TWO_MS ? 2 : 1)) return false;
    const x = Camera.x, y = Camera.y, z = Camera.zoom;
    if (x === px && y === py && z === pz) return false;   // nothing to gain: draw the real thing
    const s = z / kz;
    if (s > MAX_ZOOM_IN) return false;
    // Where the keyframe would land, in CSS px, and how much screen it
    // leaves bare on each side.
    const W = window.innerWidth, H = window.innerHeight;
    const dx = (kx - x) * z, dy = (ky - y) * z;
    if (dx > MAX_GAP || dy > MAX_GAP || W - (dx + W * s) > MAX_GAP || H - (dy + H * s) > MAX_GAP) return false;
    return !_blocked();
  }

  // Draw the keyframe where the current camera would have put it.
  //   keyframe screen = (world - k) * kz      current screen = (world - c) * z
  //   => current = keyframe * (z / kz) + (k - c) * z
  function present() {
    const rs = RenderScale.get();
    const z = Camera.zoom, s = z / kz;
    const W = canvas.width, H = canvas.height;
    let dx = (kx - Camera.x) * z * rs, dy = (ky - Camera.y) * z * rs;
    // A pure pan lands on whole device pixels, so the frame is a straight
    // copy rather than a resample: alternating sharp and bilinear-soft
    // frames shimmers.
    if (s === 1) { dx = Math.round(dx); dy = Math.round(dy); }
    const dw = W * s, dh = H * s;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(key, 0, 0, W, H, dx, dy, dw, dh);
    // Stretch the keyframe's edge pixels over the thin strip (MAX_GAP at
    // most) that the move uncovered.
    if (dx > 0)      ctx.drawImage(key, 0, 0, 1, H, 0, dy, Math.ceil(dx), dh);
    if (dx + dw < W) ctx.drawImage(key, W - 1, 0, 1, H, Math.floor(dx + dw), dy, W - Math.floor(dx + dw), dh);
    if (dy > 0)      ctx.drawImage(key, 0, 0, W, 1, dx, 0, dw, Math.ceil(dy));
    if (dy + dh < H) ctx.drawImage(key, 0, H - 1, W, 1, dx, Math.floor(dy + dh), dw, H - Math.floor(dy + dh));
    ctx.restore();
    px = Camera.x; py = Camera.y; pz = z;
    lastWasReal = false;
    sinceReal++;
    reprojected++;
    PerfMonitor.record('Reprojected frames', 1);
  }

  // Called straight after a real world render, before anything that is
  // redrawn on every frame (the tutorial highlight) goes on top.
  function rendered() {
    px = Camera.x; py = Camera.y; pz = Camera.zoom;
    lastWasReal = true;
    sinceReal = 0;
    if (!engaged) { _release(); return; }
    if (Camera.getShake() > 0) { kValid = false; return; }   // the frame carries the shake offset
    if (!key) { key = document.createElement('canvas'); kctx = key.getContext('2d', { alpha: false }); }
    if (key.width !== canvas.width || key.height !== canvas.height) { key.width = canvas.width; key.height = canvas.height; }
    kctx.drawImage(canvas, 0, 0);
    kx = px; ky = py; kz = pz;
    kValid = true;
  }

  return {
    wants, present, rendered,
    stats() { return { on: GfxQuality.smoothCamera(), engaged, realFrameMs: +realEma.toFixed(1), reprojected }; },
  };
})();
