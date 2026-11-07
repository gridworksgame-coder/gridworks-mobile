/* ═══════════════════════════════════════════════════════════════════
   WIND STREAK SYSTEM
   Visible wind-streak particles during windy/stormy weather.
   ═══════════════════════════════════════════════════════════════════ */

const WindStreakSystem = (() => {
  const MAX = 140;
  const px      = new Float32Array(MAX);
  const py      = new Float32Array(MAX);
  const pspd    = new Float32Array(MAX);
  const plen    = new Float32Array(MAX);
  const pvy     = new Float32Array(MAX);   // small vertical drift component
  const pbright = new Uint8Array(MAX);
  let count = 0;

  let intensity = 0, targetIntensity = 0;
  let lastNow = 0;
  let _lastPanX = 0, _lastPanY = 0;
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

  function _rngX() {
    const W = canvas?.width || window.innerWidth;
    return Math.random() * (W + 200) - 100;
  }
  function _rngY() {
    const H = canvas?.height || window.innerHeight;
    return Math.random() * H;
  }

  function spawnStreak(i, fromOffscreen) {
    px[i]      = fromOffscreen ? -120 - Math.random() * 200 : _rngX();
    py[i]      = _rngY();
    pspd[i]    = 700 + Math.random() * 800;
    plen[i]    = 35  + Math.random() * 65;
    pvy[i]     = (Math.random() - 0.5) * 60;  // small drift, keeps streaks from feeling flat
    pbright[i] = Math.random() > 0.4 ? 1 : 0;
  }

  function start() {
    init();
    targetIntensity = 0.3;
    const target = Math.round(targetIntensity * MAX);
    for (let i = 0; i < target; i++) spawnStreak(i, false);
    count = target;
    _lastPanX = Camera.x;
    _lastPanY = Camera.y;
  }

  function stop() { targetIntensity = 0; }

  function tick(dt) {
    intensity += (targetIntensity - intensity) * Math.min(1, dt * 1.5);
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

    const target = Math.round(intensity * MAX);
    while (count < target) { spawnStreak(count, true); count++; }
    if (count > target) count = target;

    const W = canvas.width, H = canvas.height;
    const zoom = Camera.zoom;
    const zoomSqrt = Math.sqrt(Math.max(0.1, zoom));

    // Camera pan delta for parallax
    const panDX = Camera.x - _lastPanX;
    const panDY = Camera.y - _lastPanY;
    _lastPanX = Camera.x;
    _lastPanY = Camera.y;

    const PARALLAX_BG = 0.10;
    const PARALLAX_FG = 0.28;

    // Parallax always runs — even when paused or fast-forwarding
    for (let i = 0; i < count; i++) {
      const isFG = pbright[i];
      px[i] -= panDX * (isFG ? PARALLAX_FG : PARALLAX_BG);
      py[i] -= panDY * (isFG ? PARALLAX_FG : PARALLAX_BG);
      if (px[i] > W + 100) { px[i] = -120; py[i] = _rngY(); }
      if (px[i] < -200)    { px[i] = W + 100; py[i] = _rngY(); }
      if (py[i] > H + 50)  { py[i] = -20; }
      if (py[i] < -100)    { py[i] = H + 20; }
    }

    // Streak physics — pauses when paused, scales with timeScale
    if (!paused) {
      const tsScale = DevMode.timeScale || 1;
      for (let i = 0; i < count; i++) {
        const isFG = pbright[i];
        const spd  = (isFG ? 1.0 : 0.65) * pspd[i] * Math.min(tsScale, 20);
        px[i] += spd * dt;
        py[i] += pvy[i] * dt * Math.min(tsScale, 20);
        if (px[i] > W + 120) { px[i] = -120; py[i] = _rngY(); }
      }
    }

    // Render (canvas already cleared once for this frame by WeatherCanvas)

    // Very subtle warm dust tint — kept low so CloudState dimming dominates
    ctx.globalAlpha = 0.05 * intensity;
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(0, 0, W, H);

    const lw = Math.min(2.2, 0.7 + 0.6 * zoom);
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(220,210,190,1)';

    // Background layer — dim, shorter streaks
    ctx.globalAlpha = 0.18 * intensity;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      if (pbright[i]) continue;
      const len = plen[i] * zoomSqrt * 0.7;
      ctx.moveTo(px[i]|0, py[i]|0);
      ctx.lineTo((px[i] - len)|0, (py[i] - pvy[i]*0.02)|0);
    }
    ctx.stroke();

    // Foreground layer — bright, longer streaks
    ctx.globalAlpha = 0.45 * intensity;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      if (!pbright[i]) continue;
      const len = plen[i] * zoomSqrt;
      ctx.moveTo(px[i]|0, py[i]|0);
      ctx.lineTo((px[i] - len)|0, (py[i] - pvy[i]*0.02)|0);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function isActive() { return intensity > 0.02 || targetIntensity > 0; }

  return { init, start, stop, tick, frame, isActive };
})();

// ═══════════════════════════════════════════════════════════════════
// STORM DEBRIS SYSTEM — leaves and sticks tumbling across the screen
// during storms. Positions are stored in WORLD space; the camera's
// transform handles pan + zoom naturally, so particles stay anchored
// to the world point beneath them regardless of camera changes.
// ═══════════════════════════════════════════════════════════════════
