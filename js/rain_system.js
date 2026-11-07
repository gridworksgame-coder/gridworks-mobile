/* ═══════════════════════════════════════════════════════════════════
   RAIN SYSTEM
   Falling rain particle simulation.
   ═══════════════════════════════════════════════════════════════════ */

const RainSystem = (() => {
  // Rain uses RAIN_MAX particles, as it always has; a blizzard uses the lot.
  const RAIN_MAX = 200;
  const MAX = 460;
  // Snow instead of rain (a winter snowfall or blizzard): the same particles,
  // falling slowly as flakes and, in a blizzard, driven sideways by the wind.
  let snow = false, heavy = false;
  const _cap = () => (snow && heavy) ? MAX : RAIN_MAX;
  const px     = new Float32Array(MAX);
  const py     = new Float32Array(MAX);
  const pspd   = new Float32Array(MAX);
  const plen   = new Float32Array(MAX);
  const pdrift = new Float32Array(MAX);
  const pbright= new Uint8Array(MAX);
  // How far each flake has faded in, 0..1. One placed out in the open sky
  // (rather than above the top edge) starts at 0, so it appears gently
  // instead of popping into being where it hangs.
  const pfade  = new Float32Array(MAX);
  let count = 0;

  let intensity = 0, targetIntensity = 0;
  let sinA = 0.15;
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
    return Math.random() * (W + 100) - 50;
  }

  function spawnDrop(i) {
    const H = canvas?.height || window.innerHeight;
    px[i]     = _rngX();
    py[i]     = Math.random() < 0.3 ? Math.random() * H : -20;
    if (snow) {
      pspd[i]   = heavy ? 150 + Math.random() * 190 : 46 + Math.random() * 70;
      plen[i]   = 1 + Math.random() * (heavy ? 1.6 : 2);       // flake radius
      pdrift[i] = heavy ? 380 + Math.random() * 420 : 14 + Math.random() * 30;
      if (Math.random() < 0.5) py[i] = Math.random() * H;      // flakes hang about; fill the sky from the start
    } else {
      pspd[i]   = 480 + Math.random() * 480;
      plen[i]   = 8   + Math.random() * 14;
      pdrift[i] = 40  + Math.random() * 60;
    }
    pbright[i]= Math.random() > 0.45 ? 1 : 0;
    pfade[i]  = py[i] < 0 ? 1 : 0;
  }

  // One soft white dot, drawn once and blitted per flake.
  let _flake = null;
  function _flakeSprite() {
    if (_flake) return _flake;
    _flake = document.createElement('canvas'); _flake.width = _flake.height = 24;
    const g = _flake.getContext('2d'), grad = g.createRadialGradient(12, 12, 0, 12, 12, 12);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.75, 'rgba(240,247,255,0.35)'); grad.addColorStop(1, 'rgba(240,247,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 24, 24);
    return _flake;
  }

  // Switch what falls. Called by WeatherEventSystem before start(), so every
  // event sets it explicitly and a snowfall can't leave the next rain white.
  function setSnow(on, isHeavy) {
    const was = snow, wasHeavy = heavy;
    snow = !!on; heavy = !!(on && isHeavy);
    if ((was !== snow || wasHeavy !== heavy) && count) for (let i = 0; i < count; i++) spawnDrop(i);
  }

  function start() {
    init();
    targetIntensity = snow && !heavy ? 0.75 : snow ? 1 : 0.9;
    const target = Math.round(targetIntensity * _cap());
    for (let i = 0; i < target; i++) spawnDrop(i);
    count = target;
    // Sync pan position
    _lastPanX = Camera.x;
    _lastPanY = Camera.y;
  }

  function stop() { targetIntensity = 0; }

  function tick(dt) {
    intensity += (targetIntensity - intensity) * Math.min(1, dt * 2);
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

    const target = Math.round(intensity * _cap());
    while (count < target) { spawnDrop(count); count++; }
    if (count > target) count = target;

    const W = canvas.width, H = canvas.height;
    const zoom = Camera.zoom;
    const zoomSqrt = Math.sqrt(Math.max(0.1, zoom));

    // Camera pan delta for parallax
    const panDX = Camera.x - _lastPanX;
    const panDY = Camera.y - _lastPanY;
    _lastPanX = Camera.x;
    _lastPanY = Camera.y;

    const PARALLAX_BG = 0.12;
    const PARALLAX_FG = 0.32;

    // Camera parallax always runs — even when paused or fast-forwarding
    // Also recycle drops that go off-screen due to panning while paused
    for (let i = 0; i < count; i++) {
      const isFG = pbright[i];
      px[i] -= panDX * (isFG ? PARALLAX_FG : PARALLAX_BG);
      py[i] -= panDY * (isFG ? PARALLAX_FG : PARALLAX_BG);
      // Wrap horizontally always
      if (px[i] > W + 50) px[i] = -50;
      if (px[i] < -50)    px[i] = W + 50;
      // Recycle vertically if panned off-screen while paused: in at the
      // far edge, off screen, the way the view is moving. (Pushed off the
      // top, a flake used to be put back at a random point mid-screen, so
      // panning down through a snowfall kept popping flakes into the air.)
      if (py[i] > H + 20) { py[i] = -10; px[i] = _rngX(); pfade[i] = 1; }
      if (py[i] < -50)    { py[i] = H + 15; px[i] = _rngX(); pfade[i] = 1; }
      if (pfade[i] < 1) pfade[i] = Math.min(1, pfade[i] + dt * 2.5);
    }

    // Drop physics — pauses when paused, scales with timeScale
    if (!paused) {
      const tsScale = DevMode.timeScale || 1;
      for (let i = 0; i < count; i++) {
        const isFG = pbright[i];
        const spd  = (isFG ? 1.0 : 0.6) * pspd[i] * Math.min(tsScale, 20);

        py[i] += spd * dt;
        if (snow) {
          // A blizzard drives the flakes across the screen in gusts; a
          // snowfall lets each one wander on its own.
          const gust = heavy ? 0.75 + 0.35 * Math.sin(now * 0.0007 + py[i] * 0.004) : 0;
          px[i] += (heavy ? -pdrift[i] * gust : Math.sin(now * 0.0011 + i * 1.7) * pdrift[i]) * dt * Math.min(tsScale, 20);
        } else {
          px[i] += pdrift[i] * sinA * dt * Math.min(tsScale, 20);
        }

        if (py[i] > H + 20) { px[i] = _rngX(); py[i] = -10; pfade[i] = 1; }
      }
    }

    // Render (canvas already cleared once for this frame by WeatherCanvas)

    if (snow) {
      // A pale haze (a whiteout in a blizzard, drifting in bands with the
      // gusts), then the flakes: each one a soft round dot from a small
      // pre-drawn sprite. In a blizzard they are smeared a little along the
      // wind, still round-ended, never a hard-edged block.
      ctx.globalAlpha = (heavy ? 0.24 + 0.06 * Math.sin(now * 0.0009) : 0.07) * intensity;
      ctx.fillStyle = '#dfeaf2';
      ctx.fillRect(0, 0, W, H);
      const zs = Math.max(0.8, Math.min(1.8, zoomSqrt));
      const flake = _flakeSprite();
      for (let i = 0; i < count; i++) {
        const fg = pbright[i];
        const r = plen[i] * zs * (fg ? 1.3 : 0.95) * (heavy ? 0.9 : 1);
        ctx.globalAlpha = (fg ? 0.95 : 0.55) * intensity * pfade[i];
        if (heavy) ctx.drawImage(flake, px[i] - r * 1.5, py[i] - r, r * 3, r * 2);
        else ctx.drawImage(flake, px[i] - r, py[i] - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      return;
    }

    // Subtle dark atmosphere overlay
    ctx.globalAlpha = 0.12 * intensity;
    ctx.fillStyle = '#07101a';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(170,210,240,1)';
    const lw = Math.min(2, 0.6 + 0.5 * zoom);
    ctx.lineWidth = lw;

    // Background layer — dim, shorter streaks
    ctx.globalAlpha = 0.20 * intensity;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      if (pbright[i]) continue;
      const len = plen[i] * zoomSqrt * 0.7;
      ctx.moveTo(px[i]|0, py[i]|0);
      ctx.lineTo((px[i] - sinA*len)|0, (py[i] - len)|0);
    }
    ctx.stroke();

    // Foreground layer — bright, longer streaks
    ctx.globalAlpha = 0.55 * intensity;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      if (!pbright[i]) continue;
      const len = plen[i] * zoomSqrt;
      ctx.moveTo(px[i]|0, py[i]|0);
      ctx.lineTo((px[i] - sinA*len)|0, (py[i] - len)|0);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function isActive() { return intensity > 0.02 || targetIntensity > 0; }
  function render() {}
  function tickFrame() {}

  // Current (smoothed) rain strength, 0..1 — zone_life.js opens umbrellas on it.
  function level() { return intensity; }

  return { init, start, stop, tick, frame, isActive, render, tickFrame, level, setSnow, isSnow: () => snow && isActive() };
})();

// ═══════════════════════════════════════════════════════════════════
// WIND STREAK SYSTEM — visual streaks shown during storms.
// Modeled on RainSystem: pale, fast, mostly-horizontal streaks with
// parallax. Hooked into RainSystem.tick/frame below so the existing
// game-loop callsites drive it automatically.
// ═══════════════════════════════════════════════════════════════════
