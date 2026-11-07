/* ═══════════════════════════════════════════════════════════════════
   GROUND SPLASH SYSTEM
   Rain-splash particles on the ground.
   ═══════════════════════════════════════════════════════════════════ */

const GroundSplashSystem = (() => {
  const MAX = 120;
  const wx   = new Float32Array(MAX);  // world x
  const wy   = new Float32Array(MAX);  // world y
  const page = new Float32Array(MAX);  // age in seconds
  const plife= new Float32Array(MAX);  // total lifetime
  const psize= new Float32Array(MAX);  // max radius in world units
  const palive = new Uint8Array(MAX);
  let cursor = 0;  // next slot to overwrite
  let aliveCount = 0;  // PERF: track alive splashes so render can early-out
                       // when none are visible. Previous code iterated all
                       // MAX=120 slots every frame regardless.

  let intensity = 0, targetIntensity = 0;
  let lastNow = 0;
  let spawnAccum = 0;
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

  function spawnSplash() {
    if (!canvas) return;
    const W = canvas.width, H = canvas.height;
    const zoom = Camera.zoom;
    const worldLeft = Camera.x;
    const worldTop  = Camera.y;
    const viewW = W / zoom;
    const viewH = H / zoom;

    const i = cursor;
    cursor = (cursor + 1) % MAX;
    // If we're overwriting a slot that was still alive, the aliveCount
    // stays the same. If overwriting a dead slot, alive goes up by 1.
    if (!palive[i]) aliveCount++;
    wx[i]    = worldLeft + Math.random() * viewW;
    wy[i]    = worldTop  + Math.random() * viewH;
    page[i]  = 0;
    plife[i] = 0.35 + Math.random() * 0.25;   // 0.35-0.6s
    psize[i] = 3 + Math.random() * 4;         // 3-7 world units
    palive[i] = 1;
  }

  function start() {
    init();
    targetIntensity = 1.0;
  }

  function stop() { targetIntensity = 0; }

  function tick(dt) {
    intensity += (targetIntensity - intensity) * Math.min(1, dt * 1.2);
    if (intensity < 0.01 && targetIntensity === 0) {
      intensity = 0;
      for (let i = 0; i < MAX; i++) palive[i] = 0;
      aliveCount = 0;
    }
  }

  function frame(now, paused) {
    if (!canvas) return;
    if (intensity < 0.01 && targetIntensity < 0.01) return;

    if (!lastNow) lastNow = now;
    const dt = Math.min(0.05, (now - lastNow) / 1000);
    lastNow = now;

    // Spawn new splashes at a rate scaled by intensity. ~70 per second
    // at full intensity feels like steady rainfall without being noisy.
    if (!paused) {
      const tsScale = Math.min(DevMode.timeScale || 1, 20);
      const rate = 70 * intensity;
      spawnAccum += rate * dt * tsScale;
      while (spawnAccum >= 1) { spawnSplash(); spawnAccum -= 1; }

      // Age existing splashes
      for (let i = 0; i < MAX; i++) {
        if (!palive[i]) continue;
        page[i] += dt * tsScale;
        if (page[i] >= plife[i]) { palive[i] = 0; aliveCount--; }
      }
    }

    const W = canvas.width, H = canvas.height;
    const zoom = Camera.zoom;

    // Render — PERF: bail out cheaply if no splashes are alive.
    // Previously this iterated all MAX=120 slots and issued a separate
    // beginPath/arc/stroke per alive splash. Now we batch all splashes
    // with similar age into one stroked path. Per-splash alpha fade is
    // approximated with two age-bucketed strokes (early/late) which is
    // visually indistinguishable for the 0.35–0.6s splash lifetime.
    if (aliveCount === 0) {
      return;
    }

    ctx.strokeStyle = 'rgba(170,210,240,1)';
    ctx.lineWidth = Math.max(0.6, 0.8 * Math.sqrt(Math.max(0.1, zoom)));

    // Two age buckets to preserve the fade-out feel without per-arc alpha.
    // Bucket 0: t < 0.5 (bright), Bucket 1: t >= 0.5 (dim).
    for (let bucket = 0; bucket < 2; bucket++) {
      ctx.globalAlpha = (bucket === 0 ? 0.4 : 0.18) * intensity;
      ctx.beginPath();
      let drewAny = false;
      for (let i = 0; i < MAX; i++) {
        if (!palive[i]) continue;
        const tNorm = page[i] / plife[i];   // 0 → 1
        if ((bucket === 0 && tNorm >= 0.5) || (bucket === 1 && tNorm < 0.5)) continue;
        const sx = (wx[i] - Camera.x) * zoom;
        const sy = (wy[i] - Camera.y) * zoom;
        if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue;
        const r = psize[i] * zoom * tNorm;
        if (r < 0.3) continue;
        ctx.moveTo(sx + r, sy);
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        drewAny = true;
      }
      if (drewAny) ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function isActive() { return intensity > 0.02 || targetIntensity > 0; }

  return { init, start, stop, tick, frame, isActive };
})();

// ═══════════════════════════════════════════════════════════════════
// LIGHTNING SYSTEM — periodic screen flashes + jagged bolts during
// rainstorms. Sits on a canvas above the rain (z-index 502) so the
// flash washes the whole scene. Flashes come in clusters (flicker)
// and the brighter ones draw a forked bolt.
// ═══════════════════════════════════════════════════════════════════
