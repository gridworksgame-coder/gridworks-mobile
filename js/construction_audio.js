// ═══════════════════════════════════════════════════════════════════
// CONSTRUCTION SITE AUDIO
// A site going up (construction_system.js) is heard as well as seen, from
// the nearest active site to the camera:
//   - the crew's diesel generator, a low bed, while the site isn't getting
//     power from the grid (that's what the crew falls back on);
//   - the work itself, as synthesized one-shots: bursts of hammering,
//     scaffold poles clanking, a power drill, materials dropped, and on the
//     big crane jobs a reversing beeper now and then.
// A suburb lot still waiting its turn makes no noise. Nothing plays while
// the game is paused, and the work comes quicker on a site with grid power
// (it builds faster). Everything goes through SFX.bedsBus(), so the pause
// fade and the post-reactor silence cover it like the other beds.
// ═══════════════════════════════════════════════════════════════════

const ConstructionAudio = (() => {
  const HEAR_RADIUS = 20;    // tiles, to the nearest active site
  const CRANE_AREA  = 20;    // matches construction_system.js: sites this big get a crane

  const _active = (e) => e._constructing && (e._buildDone || 0) >= 0;

  function _sites() {
    const out = [];
    if (typeof ConstructionSystem === 'undefined') return out;
    for (const t of ConstructionSystem.siteTypes())
      for (const e of EntityRegistry.getByType(t)) if (_active(e)) out.push(e);
    return out;
  }

  // The crew's own generator: smallengine, pitched down a little so it
  // reads as a bigger diesel than the Biofuel Generator's.
  const Generator = makeSeamlessLoopAudio({
    src: 'audio/sfx/smallengine.mp3', rate: 0.82, radius: 14,
    level: z => 0.02 + z * 0.08,
    sources: () => _sites().filter(e => !e._sitePowered && !e._lightningDamaged),
  });

  // ── Synth voices ────────────────────────────────────────────────
  let _noise = null;
  function _noiseBuf(c) {
    if (_noise && _noise.sampleRate === c.sampleRate) return _noise;
    _noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = _noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return _noise;
  }
  function _env(g, t0, vol, attack, dur) {
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
  }
  function _burst(c, out, t0, { dur, vol, type = 'bandpass', freq, q = 1, attack = 0.001 }) {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = _noiseBuf(c);
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    _env(g, t0, vol, attack, dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t0, Math.random() * 0.8); s.stop(t0 + dur + 0.02);
  }
  function _tone(c, out, t0, { f0, f1 = f0, dur, vol, type = 'sine', attack = 0.002 }) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    _env(g, t0, vol, attack, dur);
    o.connect(g); g.connect(out);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // A hammer on a nail: a bright crack over a woody knock. A run of
  // 2–6 blows, the last one or two a little heavier (driving it home).
  function _hammer(c, out, t0, v) {
    const n = 2 + Math.floor(Math.random() * 5);
    const gap = 0.26 + Math.random() * 0.14;
    const pitch = 0.85 + Math.random() * 0.3;
    let t = t0;
    for (let i = 0; i < n; i++) {
      const hard = i >= n - 2 ? 1.25 : 1;
      _burst(c, out, t, { dur: 0.035, vol: v * 0.9 * hard, freq: 2200 * pitch, q: 2.5 });
      _burst(c, out, t, { dur: 0.09, vol: v * 0.8 * hard, type: 'lowpass', freq: 700 * pitch, q: 0.8 });
      _tone(c, out, t, { f0: 210 * pitch, f1: 130 * pitch, dur: 0.08, vol: v * 0.5 * hard });
      t += gap * (0.9 + Math.random() * 0.2);
    }
  }
  // A scaffold pole or clamp knocked: an inharmonic metal ring.
  function _clank(c, out, t0, v) {
    const base = 600 + Math.random() * 500;
    for (const [m, a, d] of [[1, 1, 0.5], [2.76, 0.6, 0.35], [5.4, 0.35, 0.2]])
      _tone(c, out, t0, { f0: base * m, dur: d, vol: v * 0.22 * a, type: 'triangle', attack: 0.001 });
    _burst(c, out, t0, { dur: 0.03, vol: v * 0.6, freq: 3500, q: 1.5 });
    if (Math.random() < 0.5) {   // and it rattles once more
      const t1 = t0 + 0.12 + Math.random() * 0.1;
      _tone(c, out, t1, { f0: base * 1.04, dur: 0.25, vol: v * 0.1, type: 'triangle', attack: 0.001 });
      _burst(c, out, t1, { dur: 0.02, vol: v * 0.3, freq: 3200, q: 1.5 });
    }
  }
  // A power drill: a whining motor through its gearbox, revved in a squeeze
  // or two.
  function _drill(c, out, t0, v) {
    const squeezes = 1 + Math.floor(Math.random() * 2);
    let t = t0;
    for (let i = 0; i < squeezes; i++) {
      const dur = 0.5 + Math.random() * 0.9, f = 150 + Math.random() * 60;
      const o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.6, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      o.frequency.setValueAtTime(f, t + dur - 0.1);
      o.frequency.exponentialRampToValueAtTime(f * 0.5, t + dur + 0.1);
      bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * 0.16, t + 0.08);
      g.gain.setValueAtTime(v * 0.16, t + dur - 0.05);
      g.gain.exponentialRampToValueAtTime(0.0005, t + dur + 0.12);
      o.connect(bp); bp.connect(g); g.connect(out);
      o.start(t); o.stop(t + dur + 0.15);
      _burst(c, out, t, { dur: dur, vol: v * 0.08, freq: 4200, q: 0.9, attack: 0.08 });
      t += dur + 0.25 + Math.random() * 0.3;
    }
  }
  // A stack of boards or a bag of something dropped off a pallet.
  function _drop(c, out, t0, v) {
    _burst(c, out, t0, { dur: 0.22, vol: v * 1.2, type: 'lowpass', freq: 380, q: 0.7, attack: 0.003 });
    _burst(c, out, t0 + 0.01, { dur: 0.09, vol: v * 0.4, freq: 1500, q: 1 });
    _tone(c, out, t0, { f0: 90, f1: 48, dur: 0.25, vol: v * 0.7, attack: 0.01 });
  }
  // A machine reversing on the crane jobs.
  function _beeper(c, out, t0, v) {
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * 0.9;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'square'; o.frequency.value = 1150;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * 0.05, t + 0.01);
      g.gain.setValueAtTime(v * 0.05, t + 0.42);
      g.gain.linearRampToValueAtTime(0, t + 0.45);
      o.connect(lp); lp.connect(g); g.connect(out);
      o.start(t); o.stop(t + 0.5);
    }
  }

  const KINDS = [[_hammer, 5], [_clank, 2], [_drill, 2], [_drop, 1.2]];
  function _pick(big) {
    const list = big ? [...KINDS, [_beeper, 0.6]] : KINDS;
    let total = 0;
    for (const [, w] of list) total += w;
    let r = Math.random() * total;
    for (const [f, w] of list) if ((r -= w) <= 0) return f;
    return list[0][0];
  }

  let _nextAt = 0;
  let _beepAt = 0;     // the beeper isn't heard more than once every 20s

  function tick() {
    Generator.tick();
    if (DevMode.timeScale === 0) { _nextAt = 0; return; }
    const now = performance.now();
    if (now < _nextAt) return;
    const sites = _sites();
    if (!sites.length) { _nextAt = now + 1000; return; }

    const cx = (Camera.x + window.innerWidth  / 2 / Camera.zoom) / TILE;
    const cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;
    let near = null, nearD = Infinity, nearby = 0;
    for (const e of sites) {
      const dx = e.col + (e.width || 1) / 2 - cx, dy = e.row + (e.height || 1) / 2 - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < HEAR_RADIUS) nearby++;
      if (d < nearD) { nearD = d; near = e; }
    }
    if (nearD >= HEAR_RADIUS) { _nextAt = now + 500; return; }

    // Next sound in 1.5–4s; sooner with grid power and with several sites
    // in earshot, a little sooner on fast-forward, never a wall of noise.
    const busy = (near._sitePowered ? 1 : 0.6) * Math.min(2, 1 + (nearby - 1) * 0.35) * Math.min(1.5, Math.sqrt(Math.max(1, DevMode.timeScale)));
    _nextAt = now + (1500 + Math.random() * 2500) / busy;

    const c = SFX.context(), bus = c && SFX.bedsBus();
    if (!c || !bus) return;
    const ZOOM_MIN = 0.25 * Math.pow(1.12, 2), ZOOM_MAX = 3.0;
    const zoomT = Math.max(0, Math.min(1, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)));
    const prox = 1 - nearD / HEAR_RADIUS;
    const v = (0.05 + zoomT * 0.22) * prox * prox * (SFX.getVolume ? SFX.getVolume() : 1);
    if (v < 0.004) return;

    const big = (near.width || 1) * (near.height || 1) >= CRANE_AREA && now > _beepAt;
    const kind = _pick(big);
    if (kind === _beeper) _beepAt = now + 20000;

    // Placed left or right of centre by where the site sits on screen.
    const out = c.createGain();
    out.gain.value = 1;
    let tail = out;
    if (c.createStereoPanner) {
      const pan = c.createStereoPanner();
      const sx = (near.col + (near.width || 1) / 2 - cx) * TILE * Camera.zoom / (window.innerWidth / 2);
      pan.pan.value = Math.max(-0.7, Math.min(0.7, sx * 0.7));
      out.connect(pan); tail = pan;
    }
    tail.connect(bus);
    kind(c, out, c.currentTime + 0.02, v);
    setTimeout(() => { try { tail.disconnect(); if (tail !== out) out.disconnect(); } catch (_e) {} }, 8000);
  }

  return { tick };
})();
