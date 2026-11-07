/* ═══════════════════════════════════════════════════════════════════
   STORM DEBRIS SYSTEM
   Flying debris particles during storms.
   ═══════════════════════════════════════════════════════════════════ */

const StormDebrisSystem = (() => {
  const MAX = 7;
  const wx    = new Float32Array(MAX);   // world x
  const wy    = new Float32Array(MAX);   // world y
  const pvx   = new Float32Array(MAX);   // world units / sec
  const pvy   = new Float32Array(MAX);
  const prot  = new Float32Array(MAX);
  const pspin = new Float32Array(MAX);
  const psize = new Float32Array(MAX);   // world units
  const pswayA= new Float32Array(MAX);
  const pswayF= new Float32Array(MAX);
  const pswayP= new Float32Array(MAX);
  const ptype = new Uint8Array(MAX);     // 0=leaf, 1=stick
  const pcolor= new Uint8Array(MAX);
  let count = 0;

  const LEAF_COLORS  = ['#6b8a3a', '#8a6a2a', '#a8541c', '#5a7030', '#7a4a1a', '#4a6028'];
  const STICK_COLORS = ['#3a2614', '#4a3020', '#2a1808', '#5a3a22'];

  let intensity = 0, targetIntensity = 0;
  let lastNow = 0;
  let elapsed = 0;
  let canvas, ctx;

  // Shared full-screen overlay canvas (see weather_canvas.js) — this used
  // to create its own separate <canvas> element; now it reuses the one
  // canvas shared by all weather particle systems.
  function init() {
    if (canvas) return;
    canvas = WeatherCanvas.getCanvas();
    ctx = WeatherCanvas.getCtx();
  }

  function resize() {
    if (!canvas) return;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  // Spawn a debris particle at a random world position visible (or about to
  // be visible) on screen. fromOffscreen=true places it just off the left
  // edge so it blows in naturally.
  function spawn(i, fromOffscreen) {
    const W = canvas?.width  || window.innerWidth;
    const H = canvas?.height || window.innerHeight;
    const zoom = Camera.zoom;
    // World-space viewport bounds
    const worldLeft   = Camera.x;
    const worldTop    = Camera.y;
    const worldRight  = Camera.x + W / zoom;
    const worldBottom = Camera.y + H / zoom;
    const viewW = worldRight - worldLeft;
    const viewH = worldBottom - worldTop;

    wx[i]     = fromOffscreen
                  ? worldLeft - (60 + Math.random() * 240) / zoom
                  : worldLeft + Math.random() * viewW;
    wy[i]     = worldTop + Math.random() * viewH;
    pvx[i]    = 180 + Math.random() * 280;    // world units / sec
    pvy[i]    = (Math.random() - 0.3) * 40;
    prot[i]   = Math.random() * Math.PI * 2;
    pspin[i]  = (Math.random() - 0.5) * 8;
    ptype[i]  = Math.random() < 0.65 ? 0 : 1;
    psize[i]  = ptype[i] === 0
                  ? 5  + Math.random() * 5    // leaves 5-10 world units
                  : 10 + Math.random() * 12;  // sticks 10-22 long
    pswayA[i] = 20 + Math.random() * 40;
    pswayF[i] = 1.5 + Math.random() * 2.5;
    pswayP[i] = Math.random() * Math.PI * 2;
    pcolor[i] = Math.floor(Math.random() * (ptype[i] === 0 ? LEAF_COLORS.length : STICK_COLORS.length));
  }

  function start() {
    init();
    targetIntensity = 1.0;
  }

  function stop() { targetIntensity = 0; }

  function tick(dt) {
    intensity += (targetIntensity - intensity) * Math.min(1, dt * 0.8);
    if (intensity < 0.01 && targetIntensity === 0) {
      intensity = 0; count = 0;
    }
  }

  function frame(now, paused) {
    if (!canvas) return;
    if (intensity < 0.01 && targetIntensity < 0.01) return;

    if (!lastNow) lastNow = now;
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;
    if (!paused) elapsed += dt * (DevMode.timeScale || 1);

    const target = Math.round(intensity * MAX);
    while (count < target) { spawn(count, true); count++; }
    if (count > target) count = target;

    const W = canvas.width, H = canvas.height;
    const zoom = Camera.zoom;
    const zoomSqrt = Math.sqrt(Math.max(0.1, zoom));

    // World-space viewport bounds for cull/recycle checks
    const worldLeft   = Camera.x;
    const worldTop    = Camera.y;
    const worldRight  = Camera.x + W / zoom;
    const worldBottom = Camera.y + H / zoom;
    const marginW = 80 / zoom;

    // Physics in world units — paused freezes everything
    if (!paused) {
      const tsScale = Math.min(DevMode.timeScale || 1, 20);
      for (let i = 0; i < count; i++) {
        wx[i] += pvx[i] * dt * tsScale;
        const sway = Math.sin(elapsed * pswayF[i] + pswayP[i]) * pswayA[i];
        wy[i] += (pvy[i] + sway * 0.4) * dt * tsScale;
        prot[i] += pspin[i] * dt * tsScale;

        // Recycle if blown past the right edge or drifted far out of view vertically
        if (wx[i] > worldRight + marginW ||
            wy[i] > worldBottom + marginW ||
            wy[i] < worldTop - marginW) {
          spawn(i, true);
        }
      }
    }

    // Render — transform world → screen via the camera projection
    // (canvas already cleared once for this frame by WeatherCanvas)
    ctx.globalAlpha = Math.min(1, intensity);

    for (let i = 0; i < count; i++) {
      const sx = (wx[i] - Camera.x) * zoom;
      const sy = (wy[i] - Camera.y) * zoom;
      if (sx < -80 || sx > W + 80 || sy < -80 || sy > H + 80) continue;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(prot[i]);
      const s = psize[i] * zoomSqrt;
      if (ptype[i] === 0) {
        // Leaf — small ellipse with a center vein
        ctx.fillStyle = LEAF_COLORS[pcolor[i]];
        ctx.beginPath();
        ctx.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(-s, 0); ctx.lineTo(s, 0);
        ctx.stroke();
      } else {
        // Stick — short tapered line
        ctx.strokeStyle = STICK_COLORS[pcolor[i]];
        ctx.lineWidth = Math.max(1.2, 2 * zoomSqrt);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-s * 0.5, 0); ctx.lineTo(s * 0.5, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function isActive() { return intensity > 0.02 || targetIntensity > 0; }

  return { init, start, stop, tick, frame, isActive };
})();

// ═══════════════════════════════════════════════════════════════════
// GROUND SPLASH SYSTEM — small expanding ripples where raindrops hit
// the ground during rainfall. Positions stored in world space, like
// StormDebrisSystem, so they stay anchored when panning/zooming.
// ═══════════════════════════════════════════════════════════════════
