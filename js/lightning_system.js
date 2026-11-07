/* ═══════════════════════════════════════════════════════════════════
   LIGHTNING SYSTEM
   Lightning flash/bolt rendering and thunder timing.
   ═══════════════════════════════════════════════════════════════════ */

const LightningSystem = (() => {
  let canvas, ctx;
  let active = false;
  let nextStrikeAt = 0;      // schedClock value at which the next cluster fires
  // Two clocks on purpose:
  //   elapsed    — REAL seconds. Drives the flash/bolt animation envelopes,
  //                which should look the same at 1x and 10x.
  //   schedClock — SIM seconds. Drives when the next cluster fires.
  // The storm's own duration is measured in sim time (EventSystem.tick gets
  // simDt), but this file is ticked from RainSystem.tick with a hardcoded
  // real-time 0.1. Running the cadence on real time therefore meant a
  // fast-forwarded storm ended after far fewer clusters — at 10x a 5-minute
  // storm was over in 30 real seconds and fired about one. Speeding through
  // bad weather was the optimal way to dodge lightning entirely.
  let elapsed = 0;
  let schedClock = 0;
  let flashes = [];          // {t0, dur, peak, bolt}
  let lastNow = 0;

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

  function scheduleNext() {
    // 12.5–55 s between strike clusters, in sim seconds
    nextStrikeAt = schedClock + 12.5 + Math.random() * 42.5;
  }

  function buildBolt() {
    // Jagged polyline from top of screen to somewhere lower, with one fork.
    const W = canvas.width, H = canvas.height;
    const startX = 80 + Math.random() * (W - 160);
    const segs = 8 + (Math.random() * 6 | 0);
    const pts = [{ x: startX, y: -10 }];
    let x = startX, y = -10;
    const endY = H * (0.45 + Math.random() * 0.35);
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      y = -10 + (endY + 10) * t;
      x += (Math.random() - 0.5) * 80;
      pts.push({ x, y });
    }
    // Fork from a middle point
    const fIdx = 2 + (Math.random() * (segs - 3) | 0);
    const fork = [{ x: pts[fIdx].x, y: pts[fIdx].y }];
    let fx = pts[fIdx].x, fy = pts[fIdx].y;
    const fSegs = 3 + (Math.random() * 3 | 0);
    for (let i = 1; i <= fSegs; i++) {
      fx += (Math.random() - 0.5) * 70;
      fy += (H * 0.08) + Math.random() * 20;
      fork.push({ x: fx, y: fy });
    }
    return { main: pts, fork };
  }

  function spawnCluster() {
    // 1–3 sub-flashes spaced 40–140 ms apart; first one is usually the brightest
    const subs = 1 + (Math.random() * 3 | 0);
    const hasBolt = Math.random() < 0.55;
    const bolt = hasBolt ? buildBolt() : null;
    let offset = 0;
    for (let i = 0; i < subs; i++) {
      const isFirst = i === 0;
      flashes.push({
        t0: elapsed + offset,
        dur: 0.18 + Math.random() * 0.22,
        peak: (isFirst ? 0.55 : 0.25) + Math.random() * 0.2,
        bolt: isFirst ? bolt : null,
      });
      offset += 0.04 + Math.random() * 0.10;
    }
    // Distant thunder rumble via SFX if available — gated on the same cluster
    // so we don't pile multiple thunder claps. Volume scaled down.
    if (typeof SFX !== 'undefined' && SFX.thunder) {
      setTimeout(() => SFX.thunder(0.35 + Math.random() * 0.25),
                 400 + Math.random() * 1800);
    }
    // One structural-strike roll per cluster. Almost always a no-op —
    // see GROUND_STRIKE_CHANCE — but this is what can knock a building
    // offline, and it plays its own close thunder crack when it lands.
    if (typeof LightningDamageSystem !== 'undefined') LightningDamageSystem.rollStrike();
  }

  function start() {
    init();
    active = true;
    elapsed = 0;
    schedClock = 0;
    flashes.length = 0;
    // First strike comes fairly soon so the storm registers visually
    nextStrikeAt = 5 + Math.random() * 12.5;
  }

  function stop() {
    active = false;
    flashes.length = 0;
  }

  function tick(dt) {
    if (!active) return;
    elapsed += dt;
    const scale = (typeof DevMode !== 'undefined' && DevMode.timeScale != null) ? DevMode.timeScale : 1;
    schedClock += dt * scale;
    if (schedClock >= nextStrikeAt) {
      spawnCluster();
      scheduleNext();
    }
  }

  function frame(now, paused) {
    if (!canvas) return;
    if (!active && flashes.length === 0) return;

    if (!lastNow) lastNow = now;
    lastNow = now;

    const W = canvas.width, H = canvas.height;

    if (flashes.length === 0) return;

    // Each flash: triangular envelope (fast ramp up, slower decay)
    let maxAlpha = 0;
    let activeBolt = null;
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const t = elapsed - f.t0;
      if (t < 0) continue;
      if (t > f.dur) { flashes.splice(i, 1); continue; }
      const u = t / f.dur;
      // Quick spike, longer tail
      const env = u < 0.15 ? (u / 0.15) : (1 - (u - 0.15) / 0.85);
      const a = f.peak * Math.max(0, env);
      if (a > maxAlpha) maxAlpha = a;
      if (f.bolt && u < 0.25) activeBolt = f.bolt;
    }

    if (maxAlpha > 0) {
      ctx.globalAlpha = maxAlpha;
      ctx.fillStyle = '#e6f0ff';
      ctx.fillRect(0, 0, W, H);
    }

    if (activeBolt) {
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#a8c4ff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      const m = activeBolt.main;
      ctx.moveTo(m[0].x, m[0].y);
      for (let i = 1; i < m.length; i++) ctx.lineTo(m[i].x, m[i].y);
      const f = activeBolt.fork;
      ctx.moveTo(f[0].x, f[0].y);
      for (let i = 1; i < f.length; i++) ctx.lineTo(f[i].x, f[i].y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }

  function isActive() { return active; }

  return { init, start, stop, tick, frame, isActive };
})();

// Piggyback wind streaks + debris + splash + lightning on RainSystem's
// existing game-loop callsites (RainSystem.tick(dt) and
// RainSystem.frame(now, paused)). Wrapping here keeps the change confined
// to this file — no main-loop edits required.
//
// All 5 weather particle systems now share ONE canvas (WeatherCanvas)
// instead of each owning a separate full-screen <canvas> element — during
// a storm all 5 could be active at once, which meant 5 separate browser
// compositing layers each doing their own full-screen clear+redraw every
// frame. That's the thing that made storms specifically so much heavier
// than calm weather. Now there's one clear and one composited layer;
// the draw order below reproduces the original z-index stacking
// (splash 498 < wind streaks 499 < rain 500 < storm debris 501 <
// lightning 502, bottom to top).
(() => {
  const _origTick  = RainSystem.tick;
  const _origFrame = RainSystem.frame;
  let _wasWeatherActive = false;

  RainSystem.tick = function(dt) {
    _origTick.call(RainSystem, dt);
    WindStreakSystem.tick(dt);
    StormDebrisSystem.tick(dt);
    GroundSplashSystem.tick(dt);
    LightningSystem.tick(dt);
    // Ages out strike visuals and clears the pinned notification once
    // every damaged building has been repaired. Must run even when no
    // storm is active, so it lives outside the isActive() checks below.
    LightningDamageSystem.tick(dt);
  };

  RainSystem.frame = function(now, paused) {
    const anyActive = RainSystem.isActive() || WindStreakSystem.isActive() ||
      StormDebrisSystem.isActive() || GroundSplashSystem.isActive() || LightningSystem.isActive();

    // Nothing active now, and nothing was active last frame either —
    // canvas is already clean, skip all work entirely.
    if (!anyActive && !_wasWeatherActive) return;

    WeatherCanvas.clear();
    if (anyActive) {
      GroundSplashSystem.frame(now, paused);    // z 498 — bottom
      WindStreakSystem.frame(now, paused);      // z 499
      _origFrame.call(RainSystem, now, paused); // z 500 — rain
      StormDebrisSystem.frame(now, paused);     // z 501
      LightningSystem.frame(now, paused);       // z 502 — top
    }
    _wasWeatherActive = anyActive;
  };
})();

// ═══════════════════════════════════════════════════════════════════
// WEATHER EVENT SYSTEM — Storm, Heat Wave, Cold Snap
// ═══════════════════════════════════════════════════════════════════
