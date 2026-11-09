// ═══════════════════════════════════════════════════════════════════
// AUDIO SYSTEM
// ═══════════════════════════════════════════════════════════════════

// ── Proximity bed ──────────────────────────────────────────────────
// One looping bed shared by every building of a kind: it starts when any of
// them is running, stops when none are, and its volume follows the camera —
// louder zoomed in (base + zoomT * span) and fading out with distance to the
// nearest running building, silent beyond 40 tiles. `audible` picks which
// buildings count for that distance; it defaults to `running`.
function makeProximityBedAudio(src, entities, running, base, span, audible = running) {
  let audio = null;

  return {
    tick: () => {
      const list = entities();
      let anyRunning = false;
      for (const e of list) {
        if (running(e)) { anyRunning = true; break; }
      }
      if (anyRunning && !audio) {
        audio = makeSeamlessBed(src);
        audio.setVolume(0.1);
        audio.start();
      } else if (!anyRunning && audio) {
        audio.stop();
        audio = null;
      }
      if (audio) {
        const ZOOM_MIN = 0.25 * Math.pow(1.12, 2);
        const ZOOM_MAX = 3.0;
        const zoomT = Math.max(0, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN));

        const cx = (Camera.x + window.innerWidth  / 2 / Camera.zoom) / TILE;
        const cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;
        const HEAR_RADIUS = 40;
        let nearestDist = Infinity;
        for (const e of list) {
          if (!audible(e)) continue;
          const dist = Math.sqrt((e.col - cx) ** 2 + (e.row - cy) ** 2);
          if (dist < nearestDist) nearestDist = dist;
        }
        const proximityT = nearestDist < HEAR_RADIUS ? 1 - (nearestDist / HEAR_RADIUS) : 0;
        const master = typeof SFX !== 'undefined' && SFX.getVolume ? SFX.getVolume() : 1;
        audio.setVolume(Math.max(0, Math.min(1.0, (base + zoomT * span) * proximityT * master)));
      }
    }
  };
}

// ── Pump Jack Audio ────────────────────────────────────────────────
// A jack whose deposit pressure isn't set yet doesn't start the bed, but
// still counts for distance once it's playing.
const PumpJackAudio = makeProximityBedAudio('audio/sfx/pumpjack.mp3',
  () => [...EntityRegistry.getByType(T.PUMPJACK), ...EntityRegistry.getByType(T.PUMPJACK2)],
  e => e.powered && e._linkedDeposit && e._linkedDeposit._pressure > 0,
  0.025, 0.125,
  e => !(!e.powered || !e._linkedDeposit || e._linkedDeposit._pressure <= 0));

// ── Survey Scan Audio ───────────────────────────────────────────────
const ScanAudio = makeProximityBedAudio('audio/sfx/scan.mp3',
  () => [...EntityRegistry.getByType(T.SURVEY), ...EntityRegistry.getByType(T.SURVEY2)], e => e._scanning && e.powered, 0.15, 0.6);

// ── Fuel Generator Audio ────────────────────────────────────────────
const FuelGenAudio = (() => {
  let audio = null;

  return {
    tick: () => {
      const cx = (Camera.x + window.innerWidth  / 2 / Camera.zoom) / TILE;
      const cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;
      const HEAR_RADIUS = 40;
      let anyRunning = false, nearestDist = Infinity, nearestRpm = 1;
      for (const e of EntityRegistry.getByType(T.FUELGEN)) {
        const dist = Math.sqrt((e.col - cx) ** 2 + (e.row - cy) ** 2);
        // Backfire pops flagged by OilSystem.tickFuelEngine — only audible nearby
        if (e._fgBackfireSfx) {
          e._fgBackfireSfx = false;
          if (dist < HEAR_RADIUS * 0.5) SFX.backfire?.(0.35 * (1 - dist / (HEAR_RADIUS * 0.5)));
        }
        if (!e._fuelled) continue;
        anyRunning = true;
        if (dist < nearestDist) { nearestDist = dist; nearestRpm = e._fgRpm ?? 1; }
      }
      if (anyRunning && !audio) {
        audio = makeSeamlessBed('audio/sfx/diesel-power-generator-33638.mp3');
        audio.setVolume(0.1);
        audio.start();
      } else if (!anyRunning && audio) {
        audio.stop();
        audio = null;
      }
      if (audio) {
        const ZOOM_MIN = 0.25 * Math.pow(1.12, 2);
        const ZOOM_MAX = 3.0;
        const zoomT = Math.max(0, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN));
        const proximityT = nearestDist < HEAR_RADIUS ? 1 - (nearestDist / HEAR_RADIUS) : 0;
        audio.setVolume(Math.max(0, Math.min(1.0, (0.075 + zoomT * 0.3) * proximityT)));
        audio.setRate(Math.max(0.5, Math.min(1.6, 0.65 + 0.4 * nearestRpm)));
      }
    }
  };
})();

// ── Water Extractor Audio ───────────────────────────────────────────
const WaterExtractorAudio = makeProximityBedAudio('audio/sfx/waterext.mp3',
  () => EntityRegistry.getByType(T.WATEREXTRACTOR), e => e._waterRate > 0, 0.075, 0.3);

// ── Hydro Turbine Audio ─────────────────────────────────────────────
const HydroTurbineAudio = makeProximityBedAudio('audio/sfx/hydroturbine.mp3',
  () => EntityRegistry.getByType(T.HYDROTURBINE), e => e._fuelled, 0.15, 0.6);

// ── Hydro Generator Audio (shaft-driven, downstream of a Drive Shaft) ──
const HydroGeneratorAudio = makeProximityBedAudio('audio/sfx/hydrogenerator.mp3',
  () => EntityRegistry.getByType(T.HYDROGENERATOR), e => e.powered && (e._shaftRate || 0) > 0, 0.15, 0.6);

// ── Nuclear Reactor Audio ───────────────────────────────────────────
const NuclearReactorAudio = makeProximityBedAudio('audio/sfx/nuclear-reactor.mp3',
  () => EntityRegistry.getByType(T.NUCLEARREACTOR), e => e._generating, 0.15, 0.6);

// ── Coal Generator Audio ────────────────────────────────────────────
const CoalGeneratorAudio = makeProximityBedAudio('audio/sfx/running-generator-163754.mp3',
  () => EntityRegistry.getByType(T.COALGENERATOR), e => e._fuelled && e.powered, 0.15, 0.6);

// ── Seamless loop buffer ────────────────────────────────────────────
// Rebuilds a decoded sample as one that loops without a seam.
//
// The last `xfade` seconds are mixed back over the first `xfade` seconds
// with an equal-power ramp, and then dropped. The result is `xfade`
// shorter, and its end now runs continuously into its own start: what
// used to be a jump from the tail's amplitude to the head's is a blend
// that was already underway before the wrap. Equal-power (sin/cos) rather
// than linear because these beds are noise-like — two uncorrelated copies
// sum in power, not amplitude, and a linear crossfade would dip in
// perceived loudness across the join.
//
// `trimHead` first skips the quiet lead-in an MP3 encoder puts on the
// front of a file (priming silence plus a few ms of ramp). Left in, that
// lead-in lands inside the crossfade and plays as a faint dip on every
// lap. Trimming stops at the first 20ms window that reaches 60% of the
// clip's typical level, and never takes more than 0.3s.
//
// `align` is for beds with a steady pitch in them (a hum, a drone). There
// the tail and head are not uncorrelated: the same tones run through both,
// and how they add depends on their relative phase at the join. Out of
// phase they cancel and the hum hollows out mid-fade; in phase they pile
// up. So the loop is shortened by up to 0.1s to the point where the tail
// lines up best with the head, and the ramp is then scaled by how well
// they matched (r) so the blend holds constant power: equal-power at r=0,
// easing toward a plain linear crossfade as r approaches 1.
//
// `period` (seconds, with `align`) is for a bed with a rhythm to it — a
// swell that comes round every few seconds. Wrapping partway through a
// cycle is heard as a skipped beat however smooth the crossfade is, so the
// loop is cut to the largest whole number of cycles that fits, and the
// alignment search then settles the exact sample around that point.
function seamlessLoopBuffer(ctx, raw, xfade, trimHead = false, align = false, period = 0) {
  const sr = raw.sampleRate;
  let start = 0;
  if (trimHead) {
    const d   = raw.getChannelData(0);
    const win = Math.max(1, Math.round(sr * 0.02));
    const rms = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, b - a)); };
    const mid = Math.floor(raw.length / 2);
    const ref = rms(Math.max(0, mid - sr / 2), Math.min(raw.length, mid + sr / 2));
    const maxTrim = Math.min(Math.round(sr * 0.3), Math.floor(raw.length / 4));
    while (start + win <= maxTrim && rms(start, start + win) < ref * 0.6) start += win;
  }
  const usable = raw.length - start;
  const xf = Math.min(Math.round(sr * xfade), Math.floor(usable / 3));
  if (xf <= 0) return raw;
  let len = usable - xf;
  let r = 0;
  if (align) {
    // A coarse search (every 8th sample, 4-sample steps) is plenty to line
    // up a hum, and keeps this from hitching the frame the sample decodes on.
    const d = raw.getChannelData(0).subarray(start);
    if (period > 0) {
      // Start the search half its width past the whole-cycle point, so it
      // looks either side of it.
      const cycles = Math.floor(len / (period * sr));
      if (cycles >= 1) len = Math.min(len, Math.round(cycles * period * sr) + Math.round(sr * 0.05));
    }
    const maxShift = Math.min(Math.round(sr * 0.1), Math.floor(len / 4));
    let best = -2, bestShift = 0;
    for (let s = 0; s < maxShift; s += 4) {
      const tail = len - s;
      let ab = 0, aa = 0, bb = 0;
      for (let i = 0; i < xf; i += 8) { const a = d[i], b = d[tail + i]; ab += a * b; aa += a * a; bb += b * b; }
      const c = ab / Math.sqrt(aa * bb + 1e-20);
      if (c > best) { best = c; bestShift = s; }
    }
    len -= bestShift;
    r = Math.max(0, Math.min(1, best));
  }
  const out = ctx.createBuffer(raw.numberOfChannels, len, sr);
  for (let ch = 0; ch < raw.numberOfChannels; ch++) {
    const src = raw.getChannelData(ch).subarray(start);
    const dst = out.getChannelData(ch);
    dst.set(src.subarray(0, len));
    for (let i = 0; i < xf; i++) {
      const t  = i / xf;
      const fi = Math.sin(t * Math.PI / 2);
      const fo = Math.cos(t * Math.PI / 2);
      const norm = 1 / Math.sqrt(1 + 2 * r * fi * fo);
      dst[i] = (src[i] * fi + src[len + i] * fo) * norm;
    }
  }
  return out;
}

// ── Element looper ──────────────────────────────────────────────────
// Fallback for when a sample can't be fetched and decoded — most often the
// game opened straight from disk (file://), where fetch() is blocked.
// A plain <audio loop> is the wrong tool for a bed: the element stalls at
// the wrap, and it replays the MP3 encoder's lead-in silence (~50ms on the
// geothermal files) every lap, which is heard as a hole each time round.
// Level every element-looped machine bed plays at, on top of its own
// volume: SFX.setBedsMuted takes it to 0. The Web Audio beds are muted at
// bedsBus(), but these elements never go through it — and on file:// every
// bed is one of these, so the apocalypse used to leave whatever machine was
// humming at detonation humming over the ashes for good.
let _elementBedLevel = 1;
function makeElementLooper(src, xfade, isBed = true) {
  const HEAD = 0.08;   // s skipped at the front of every lap
  const els = [new Audio(src), new Audio(src)];
  let cur = 0, handing = false, target = 0, lvl = 0;
  els.forEach(el => { el.preload = 'auto'; el.volume = 0; });
  const first = els[0];
  const seek = () => {
    if (isFinite(first.duration)) first.currentTime = HEAD + Math.random() * Math.max(0, first.duration - xfade * 2 - HEAD);
  };
  if (first.readyState >= 1) seek(); else first.addEventListener('loadedmetadata', seek, { once: true });
  first.play().catch(() => {});
  const clamp = v => Math.max(0, Math.min(1, v));
  const timer = setInterval(() => {
    const gate = typeof SFX !== 'undefined' && SFX.getVolume && !(SFX.getVolume() > 0) ? 0 : 1;   // SFX at 0: silent
    lvl += (target * (isBed ? _elementBedLevel : 1) * gate - lvl) * 0.12;   // ~150ms swell/fade at 20ms steps
    const a = els[cur], b = els[1 - cur];
    const dur = a.duration;
    if (!isFinite(dur)) return;
    const xf = Math.min(xfade, (dur - HEAD) / 3);
    if (!handing && a.currentTime >= dur - xf) {
      handing = true;
      b.currentTime = HEAD;
      b.play().catch(() => {});
    }
    if (handing) {
      const t = a.ended ? 1 : clamp((a.currentTime - (dur - xf)) / xf);
      a.volume = clamp(lvl * Math.cos(t * Math.PI / 2));
      b.volume = clamp(lvl * Math.sin(t * Math.PI / 2));
      if (t >= 1) { a.pause(); cur = 1 - cur; handing = false; }
    } else {
      a.volume = clamp(lvl);
    }
  }, 20);
  return {
    setVolume(v) { target = v; },
    setRate(r) { els.forEach(el => { el.preservesPitch = false; el.playbackRate = r; }); },
    stop() { clearInterval(timer); els.forEach(el => el.pause()); },
  };
}

// ── Seamless bed ────────────────────────────────────────────────────
// A single looping sound with no audible seam, for the steady beds that
// used to be plain <audio loop> elements (general ambience, the grid hum,
// water, windmills, generator and machine loops). <audio loop> restarts
// through the media pipeline at every wrap, leaving a short hole plus the
// click of the tail's level jumping to the head's — heard every few seconds
// on a short hum. This plays the sample through Web Audio instead, rebuilt
// by seamlessLoopBuffer() so the wrap is a crossfade, from a random start
// point, with gain ramps rather than hard cuts. Decoded buffers are shared
// per file, so stopping and restarting a bed never refetches it. Drop-in
// for the old element: start(), stop(), setVolume(v), setRate(r).
const _bedBuffers = new Map();   // src → Promise<AudioBuffer | null>
function _bedBuffer(ctx, src, xfade) {
  let p = _bedBuffers.get(src);
  if (!p) {
    p = fetch(src)
      .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(b => ctx.decodeAudioData(b))
      .then(raw => seamlessLoopBuffer(ctx, raw, xfade, true))
      .catch(() => null);
    _bedBuffers.set(src, p);
  }
  return p;
}

// onAmbience: feed bus() directly rather than bedsBus() — only the general
// outdoor ambience does, so it survives SFX.setBedsMuted().
function makeSeamlessBed(src, xfade = 1.2, onAmbience = false) {
  let on = false, vol = 0, rate = 1, gen = 0;
  let gain = null, source = null, fallback = null;

  function useFallback() {
    fallback = makeElementLooper(src, xfade, !onAmbience);
    fallback.setVolume(vol);
    if (rate !== 1) fallback.setRate(rate);
  }

  return {
    start() {
      if (on) return;
      on = true;
      const my = ++gen;
      const ctx = SFX.context();
      if (!ctx) { useFallback(); return; }
      _bedBuffer(ctx, src, xfade).then(buf => {
        if (!on || my !== gen) return;
        if (!buf) { useFallback(); return; }
        gain = ctx.createGain();
        gain.gain.value = 0;
        gain.connect(onAmbience ? SFX.bus() : SFX.bedsBus());
        source = ctx.createBufferSource();
        source.buffer = buf;
        source.loop = true;
        source.playbackRate.value = rate;
        source.connect(gain);
        source.start(0, Math.random() * buf.duration);
        gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.25);
      });
    },
    stop() {
      if (!on) return;
      on = false; gen++;
      if (source) {
        const ctx = SFX.context(), s = source, g = gain;
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.06);
        setTimeout(() => { try { s.stop(); } catch (_e) {} s.disconnect(); g.disconnect(); }, 400);
      }
      source = gain = null;
      if (fallback) { fallback.stop(); fallback = null; }
    },
    setVolume(v) {
      vol = v;
      if (gain) gain.gain.setTargetAtTime(v, SFX.context().currentTime, 0.05);
      if (fallback) fallback.setVolume(v);
    },
    setRate(r) {
      rate = r;
      if (source) source.playbackRate.setTargetAtTime(r, SFX.context().currentTime, 0.1);
      if (fallback) fallback.setRate(r);
    },
    // Read/write alias for setVolume, for callers that ramp el.volume.
    get volume() { return vol; },
    set volume(v) { this.setVolume(v); },
  };
}

// ── Seamless positional loop ────────────────────────────────────────
// One shared Web Audio loop for every running instance of a building
// type, for steady beds heard for minutes at a time where <audio loop>'s
// gap and click at the wrap would be obvious. Same zoom + proximity shape
// as the other building loops, plus the things a long-running bed needs
// to not sound like a sample on repeat:
//   • gapless, crossfaded wrap (seamlessLoopBuffer above)
//   • a random start point, so it never opens on the same bar
//   • gain ramps in and out rather than cutting when the last instance
//     starts or stops; the source is only torn down after it has sat
//     silent for a moment, so a flicker doesn't restart the loop
// Falls back to a pair of crossfading <audio> elements without Web Audio.
function makeSeamlessLoopAudio({ src, xfade = 1.5, sources, level, radius = 40, align = false, period = 0, rate = 1 }) {
  let gain = null, source = null, buffer = null;
  let loading = false, unusable = false, fallback = null;
  let silentSince = 0;

  // Fallback for when the sample can't be fetched and decoded — most often
  // the game opened straight from disk (file://), where fetch() is blocked.
  // A plain <audio loop> is the wrong tool for a bed: the element stalls at
  // the wrap, and it replays the MP3 encoder's lead-in silence (~50ms on the
  // geothermal files) every lap, which is heard as a hole each time round.
  // So two elements hand over to each other instead: as the playing one
  // enters its last `xfade` seconds, the other starts just past the lead-in
  // and the pair equal-power crossfade, with the ramp read off the outgoing
  // element's own playhead so it stays locked to the audio. Driven by its
  // own 20ms timer — the game's 100ms logic tick is too coarse for a smooth
  // ramp.
  function _load(ctx) {
    if (loading || buffer || unusable) return;
    loading = true;
    fetch(src)
      .then(r => r.arrayBuffer())
      .then(b => ctx.decodeAudioData(b))
      .then(raw => { buffer = seamlessLoopBuffer(ctx, raw, xfade, true, align, period); loading = false; })
      .catch(() => { unusable = true; loading = false; });
  }

  function _start(ctx) {
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(SFX.bedsBus());
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop   = true;
    // `rate`: the same sample as another machine's, at another pitch. A
    // function is read every tick, for an engine that changes speed.
    source.playbackRate.value = typeof rate === 'function' ? rate() : rate;
    source.connect(gain);
    source.start(0, Math.random() * buffer.duration);
  }

  function _stop() {
    if (source) { try { source.stop(); } catch (_e) {} source.disconnect(); source = null; }
    if (gain)   { gain.disconnect(); gain = null; }
    if (fallback) { fallback.stop(); fallback = null; }
    silentSince = 0;
  }

  function _targetVolume(list) {
    const ZOOM_MIN = 0.25 * Math.pow(1.12, 2);
    const ZOOM_MAX = 3.0;
    const zoomT = Math.max(0, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN));
    const cx = (Camera.x + window.innerWidth  / 2 / Camera.zoom) / TILE;
    const cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;
    const HEAR_RADIUS = radius;
    let nearestDist = Infinity;
    for (const e of list) {
      const ec = e.col + (e.width  || 1) / 2;
      const er = e.row + (e.height || 1) / 2;
      const dist = Math.sqrt((ec - cx) ** 2 + (er - cy) ** 2);
      if (dist < nearestDist) nearestDist = dist;
    }
    const proximityT = nearestDist < HEAR_RADIUS ? 1 - (nearestDist / HEAR_RADIUS) : 0;
    const master = SFX.getVolume ? SFX.getVolume() : 1;
    return Math.max(0, Math.min(1.0, level(zoomT) * proximityT * master));
  }

  return {
    tick: () => {
      const list = sources();
      const ctx  = unusable ? null : SFX.context();

      if (!list.length) {
        if (!gain && !fallback) return;
        if (gain && ctx) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        if (fallback) fallback.setVolume(0);
        const now = performance.now();
        if (!silentSince) silentSince = now;
        if (now - silentSince > 2000) _stop();
        return;
      }
      silentSince = 0;
      const vol = _targetVolume(list);

      if (ctx) {
        if (!buffer) { _load(ctx); return; }
        const fresh = !source;
        if (fresh) _start(ctx);
        // Slow swell on a fresh start; short ramp while tracking the camera
        // so per-frame volume steps don't zipper.
        gain.gain.setTargetAtTime(vol, ctx.currentTime, fresh ? 0.35 : 0.05);
        if (typeof rate === 'function') source.playbackRate.setTargetAtTime(rate(), ctx.currentTime, 0.1);
        return;
      }

      if (!fallback) fallback = makeElementLooper(src, xfade);
      fallback.setVolume(vol);
      if (typeof rate === 'function') fallback.setRate(rate());
    }
  };
}

// ── Geothermal Well Audio ───────────────────────────────────────────
const GeothermalWellAudio = makeSeamlessLoopAudio({
  src: 'audio/sfx/geothermalwell.mp3',
  sources: () => {
    const out = [];
    for (const e of EntityRegistry.getByType(T.GEOWELL)) if (e._flowing) out.push(e);
    return out;
  },
  level: (zoomT) => 0.078 + zoomT * 0.2925,
});

// ── Geothermal Turbine Audio ────────────────────────────────────────
const GeothermalTurbineAudio = makeSeamlessLoopAudio({
  src: 'audio/sfx/geothermalturbine.mp3',
  sources: () => {
    const out = [];
    for (const e of EntityRegistry.getByType(T.GEOTURBINE)) if (e._generating) out.push(e);
    return out;
  },
  level: (zoomT) => 0.0975 + zoomT * 0.3575,
});

// ── Fusion Reactor Audio ────────────────────────────────────────────
// Only reactors with a lit plasma count: started and burning pellets, not
// ones still charging magnets or sitting out a quench. The reactor is
// 30×30, so the radius is wider than the default to reach past its walls.
// The sample is a low hum (50/100/180 Hz), hence `align`.
//
// _generating drops for any tick the pellet buffer happens to be empty, so
// a reactor fed slightly slower than it burns blinks off and on. A reactor
// therefore keeps counting for a moment after it last burned, and the hum
// only fades once it has really stopped rather than ducking on every blink.
const _lastGenerating = new WeakMap();
function _heldGenerating(type, isOn = e => e._generating) {
  const HOLD_MS = 1500;
  const now = performance.now();
  const out = [];
  for (const e of EntityRegistry.getByType(type)) {
    if (isOn(e)) _lastGenerating.set(e, now);
    if (now - (_lastGenerating.get(e) ?? -Infinity) < HOLD_MS) out.push(e);
  }
  return out;
}
const FusionReactorAudio = makeSeamlessLoopAudio({
  src: 'audio/sfx/fusion.mp3',
  align: true,
  sources: () => _heldGenerating(T.HULKINGFUSIONREACTOR),
  level: (zoomT) => 0.2 + zoomT * 0.8,
  radius: 50,
});

// ── Advanced Nuclear Reactor Audio ──────────────────────────────────
// Its own bed, separate from the MK1 reactor's. The sample is tonal (65,
// 120, 320 and 650 Hz), so it takes `align` like the fusion hum, and the
// same short hold so a blink in _generating doesn't duck it. 21×21, so a
// slightly wider radius than the default.
const AdvReactorAudio = makeSeamlessLoopAudio({
  src: 'audio/sfx/adv nuclear reactor.mp3',
  align: true,
  sources: () => _heldGenerating(T.ADVREACTOR),
  level: (zoomT) => 0.1 + zoomT * 0.4,
  radius: 45,
});

// ── MHD Decelerator Ring Audio ──────────────────────────────────────
// The sample is a swell that comes round every 4.63 s, so the loop is cut
// to whole cycles (`period`) and the beat carries on across the wrap. It
// was recorded about 7 dB quieter than the reactor beds, hence the higher
// level. 38×14, so a wider radius than the default.
const MhdRingAudio = makeSeamlessLoopAudio({
  src: 'audio/sfx/mhd ring.mp3',
  align: true,
  period: 4.63,
  sources: () => _heldGenerating(T.MHDRING),
  level: (zoomT) => 0.2 + zoomT * 0.8,
  radius: 50,
});

// ── Fusion Research Shot Audio ──────────────────────────────────────
// One pulse as each plasma shot lights at the Fusion Research Facility,
// on the same schedule the sprite and the 1 MW draw follow
// (DemandCurves.fusionShot). A one-shot rather than a bed: at most one per
// half-hour slot, so power coming back mid-shot doesn't fire it again, and
// a game loaded partway through a shot stays quiet until the next one.
const FusionShotAudio = (() => {
  let lastSlot = null;

  return {
    tick: () => {
      let lab = null;
      for (const e of EntityRegistry.getByType(T.FUSIONLAB)) { lab = e; break; }
      const slot = Math.floor(DayNight.getElapsed() / (DayNight.secondsPerGameHour() / 2));
      const fresh = lastSlot !== null && slot !== lastSlot;
      if (!lab || !lab.powered || !DemandCurves.fusionShot(DayNight.hour()).firing) {
        if (lastSlot === null) lastSlot = slot;
        return;
      }
      lastSlot = slot;
      if (!fresh) return;

      const ZOOM_MIN = 0.25 * Math.pow(1.12, 2);
      const ZOOM_MAX = 3.0;
      const zoomT = Math.max(0, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN));
      const cx = (Camera.x + window.innerWidth  / 2 / Camera.zoom) / TILE;
      const cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;
      // The campus is 56×32, so the radius reaches well past its fence.
      const HEAR_RADIUS = 60;
      const dist = Math.sqrt((lab.col + lab.width / 2 - cx) ** 2 + (lab.row + lab.height / 2 - cy) ** 2);
      const proximityT = dist < HEAR_RADIUS ? 1 - (dist / HEAR_RADIUS) : 0;
      const vol = Math.max(0, Math.min(1.0, (0.25 + zoomT * 0.45) * proximityT));
      if (vol > 0.01) SFX.fusionPulse(vol);
    }
  };
})();

// ── Fusion Reactor Startup Audio ────────────────────────────────────
// A Fusion Reactor (and the Advanced one, lower and heard further) powering
// up: SFX.fusionSpool for the length of its startup surge, then
// SFX.fusionOnline the moment it lights. A surge that browns out lets the
// spool fade. Reactors are only watched from the first tick they are seen,
// so one already running when a save loads stays quiet.
const FusionStartupAudio = (() => {
  const seen = new WeakMap();   // reactor -> { surging, started, spool }
  const hear = (e, radius) => {
    const ZOOM_MIN = 0.25 * Math.pow(1.12, 2), ZOOM_MAX = 3.0;
    const zoomT = Math.max(0, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN));
    const cx = (Camera.x + window.innerWidth  / 2 / Camera.zoom) / TILE;
    const cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;
    const dist = Math.hypot(e.col + (e.width || 1) / 2 - cx, e.row + (e.height || 1) / 2 - cy);
    const near = dist < radius ? 1 - dist / radius : 0;
    return Math.max(0, Math.min(1, (0.35 + zoomT * 0.5) * near));
  };
  return {
    tick: () => {
      for (const [type, adv] of [[T.HULKINGFUSIONREACTOR, false], [T.ADVFUSIONREACTOR, true]]) {
        if (type === undefined) continue;
        for (const e of EntityRegistry.getByType(type)) {
          const started = !!e._started;
          const surging = !started && (e._surgeProgress || 0) > 0;
          const s = seen.get(e);
          if (!s) { seen.set(e, { surging, started, spool: null }); continue; }
          const radius = adv ? 110 : 80;
          if (surging && !s.surging) {
            const vol = hear(e, radius);
            const secs = ((EntityDefs[type] || {}).startupSurgeSeconds || 5) / Math.max(1, (typeof DevMode !== 'undefined' && DevMode.timeScale) || 1);
            s.spool = vol > 0.01 ? SFX.fusionSpool(vol, Math.max(1.5, secs), adv) : null;
          } else if (!surging && s.surging && !started && s.spool) {
            s.spool.stop();                 // the surge browned out
            s.spool = null;
          }
          if (started && !s.started) {
            if (s.spool) { s.spool.stop(0.12); s.spool = null; }
            const vol = hear(e, radius);
            if (vol > 0.01) SFX.fusionOnline(vol, adv);
          }
          s.surging = surging; s.started = started;
        }
      }
    },
  };
})();

// ── Fusion Research Facility Audio ──────────────────────────────────
// The lab's own bed, synthesized (no samples, so it plays from file:// too)
// and kept to what such a place would really sound like, not a sci-fi drone:
//   • always, while powered: the transformer yard's mains hum, the helium
//     cryoplant's compressors thudding over low air noise, and very faint,
//     the high whine of the vacuum turbopumps
//   • before each shot (DemandCurves.fusionShot spinUp): the flywheel
//     generators spooling up, a sawtooth climbing through a resonant filter
//   • during a shot: a sub-bass swell and a filtered roar following the
//     plasma (the sprite's shotK), with a fine crackle of high noise over it;
//     FusionShotAudio's pulse still marks the moment it lights
//   • once fusion is achieved (FusionResearch ignited): a low, slowly beating
//     drone, the machine burning continuously
// Heard from the lab's footprint like the other beds (louder close in and
// zoomed in), through the beds bus, so the apocalypse mutes it with the rest.
const FusionLabAudio = (() => {
  let nodes = null, noise = null;
  const HEAR_RADIUS = 60;   // tiles: the campus is 56×32

  function _noise(c) {
    if (noise && noise.sampleRate === c.sampleRate) return noise;
    const n = c.sampleRate * 3;
    noise = c.createBuffer(1, n, c.sampleRate);
    const d = noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < n; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 4 + (Math.random() * 2 - 1) * 0.15; }   // mostly brown, a little white
    return noise;
  }
  const osc = (c, type, f, dest, g = 1) => {
    const o = c.createOscillator(), gn = c.createGain();
    o.type = type; o.frequency.value = f; gn.gain.value = g;
    o.connect(gn); gn.connect(dest); o.start();
    return { o, gn };
  };
  const noiseThrough = (c, type, f, q, dest, offset) => {
    const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain();
    s.buffer = _noise(c); s.loop = true;
    fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0;
    s.connect(fl); fl.connect(g); g.connect(dest); s.start(0, offset || 0);
    return { s, fl, g };
  };

  function _build(c) {
    const out = c.createGain(); out.gain.value = 0; out.connect(SFX.bedsBus());
    const srcs = [];
    // Mains hum off the transformer yard.
    const humG = c.createGain(); humG.gain.value = 0.022; humG.connect(out);
    for (const [f, a] of [[50, 1], [100, 0.45], [150, 0.25], [100.6, 0.15]]) srcs.push(osc(c, 'sine', f, humG, a).o);
    // Cryoplant: low air noise, its level swung by the compressor's stroke.
    const cryo = noiseThrough(c, 'lowpass', 220, 0.6, out, 0.3);
    const strokeG = c.createGain(); strokeG.gain.value = 0.018; strokeG.connect(cryo.g.gain);
    srcs.push(cryo.s, osc(c, 'sine', 0.75, strokeG).o);
    cryo.g.gain.value = 0.05;
    // Turbopumps: two close high tones beating, barely there.
    const pumpG = c.createGain(); pumpG.gain.value = 0.0035; pumpG.connect(out);
    srcs.push(osc(c, 'sine', 1180, pumpG).o, osc(c, 'sine', 1186.5, pumpG, 0.7).o);
    // Flywheels: a sawtooth through a resonant lowpass, pitch and level set per tick.
    const fwLp = c.createBiquadFilter(); fwLp.type = 'lowpass'; fwLp.frequency.value = 400; fwLp.Q.value = 4;
    const fwG = c.createGain(); fwG.gain.value = 0; fwLp.connect(fwG); fwG.connect(out);
    const fw = osc(c, 'sawtooth', 60, fwLp, 0.5), fw2 = osc(c, 'sawtooth', 60, fwLp, 0.35);
    srcs.push(fw.o, fw2.o);
    // The shot: a sub swell, a band of roar, and a high crackle.
    const subG = c.createGain(); subG.gain.value = 0; subG.connect(out);
    srcs.push(osc(c, 'sine', 38, subG).o, osc(c, 'sine', 57, subG, 0.4).o);
    const roar = noiseThrough(c, 'bandpass', 110, 0.8, out, 1.1);
    const hiss = noiseThrough(c, 'highpass', 4200, 0.7, out, 2.2);
    srcs.push(roar.s, hiss.s);
    // The sustained burn: a low drone, two tones beating slowly.
    const burnG = c.createGain(); burnG.gain.value = 0; burnG.connect(out);
    const burnLp = c.createBiquadFilter(); burnLp.type = 'lowpass'; burnLp.frequency.value = 260; burnLp.connect(burnG);
    srcs.push(osc(c, 'triangle', 55, burnLp).o, osc(c, 'triangle', 55.35, burnLp, 0.8).o, osc(c, 'sine', 110.2, burnLp, 0.3).o);
    return { out, srcs, fw: [fw.o, fw2.o], fwLp, fwG, subG, roar, hiss, burnG };
  }
  function _teardown() {
    for (const s of nodes.srcs) { try { s.stop(); } catch (_e) {} try { s.disconnect(); } catch (_e) {} }
    nodes.out.disconnect();
    nodes = null;
  }

  // How loud the lab is where the camera is: 0 out of earshot.
  function _presence(lab) {
    const ZOOM_MIN = 0.25 * Math.pow(1.12, 2), ZOOM_MAX = 3.0;
    const zoomT = Math.max(0, Math.min(1, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)));
    const cx = (Camera.x + window.innerWidth  / 2 / Camera.zoom) / TILE;
    const cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;
    // Distance to the footprint, not its centre: full strength anywhere over the campus.
    const dx = Math.max(lab.col - cx, 0, cx - (lab.col + lab.width));
    const dy = Math.max(lab.row - cy, 0, cy - (lab.row + lab.height));
    const d = Math.hypot(dx, dy);
    return d >= HEAR_RADIUS ? 0 : (1 - d / HEAR_RADIUS) ** 1.5 * (0.3 + 0.7 * zoomT);
  }

  return {
    tick() {
      let lab = null;
      for (const e of EntityRegistry.getByType(T.FUSIONLAB)) { lab = e; break; }
      const pres = lab && lab.powered ? _presence(lab) : 0;
      const c = pres > 0.005 || nodes ? SFX.context() : null;
      if (!c || !SFX.bedsBus()) { if (nodes) _teardown(); return; }
      if (pres <= 0.005) {
        if (nodes) { nodes.out.gain.setTargetAtTime(0, c.currentTime, 0.4); if (nodes.out.gain.value < 0.002) _teardown(); }
        return;
      }
      if (!nodes) nodes = _build(c);
      const now = c.currentTime;
      const shot = DemandCurves.fusionShot(DayNight.hour());
      const FR = typeof FusionResearch !== 'undefined' ? FusionResearch.visual(lab) : null;
      const lift = FR ? Math.max(FR.k || 0, FR.ignited ? 0.6 : 0) : 0;
      // The plasma, as the sprite has it: up and back down across the first
      // part of the shot, or held by a sustained burn.
      const shotK = Math.max(shot.firing ? Math.sin(Math.min(1, shot.ph / 0.15) * Math.PI) : 0, 0);
      // The flywheels: spooling up through the last of the wait, run down
      // through the shot as the stored energy goes into the coils.
      const spin = shot.spinUp ? Math.max(0, Math.min(1, (shot.ph - 0.8) / 0.2)) : shot.firing ? Math.max(0, 1 - shot.ph / 0.4) : 0;

      nodes.out.gain.setTargetAtTime(pres * SFX.getVolume(), now, 0.3);
      const fwHz = 55 + 330 * spin * spin;
      nodes.fw[0].frequency.setTargetAtTime(fwHz, now, 0.3);
      nodes.fw[1].frequency.setTargetAtTime(fwHz * 1.006, now, 0.3);
      nodes.fwLp.frequency.setTargetAtTime(240 + 1300 * spin, now, 0.3);
      nodes.fwG.gain.setTargetAtTime(0.045 * Math.min(1, spin * 1.6), now, 0.4);
      nodes.subG.gain.setTargetAtTime(0.16 * shotK, now, 0.25);
      nodes.roar.g.gain.setTargetAtTime(0.11 * shotK, now, 0.25);
      nodes.roar.fl.frequency.setTargetAtTime(90 + 160 * shotK, now, 0.3);
      // The crackle flickers rather than hissing steadily.
      nodes.hiss.g.gain.setTargetAtTime(0.012 * shotK * (0.4 + 0.6 * Math.random()), now, 0.05);
      nodes.burnG.gain.setTargetAtTime(0.06 * lift, now, 1.2);
    }
  };
})();

// ── Uranium Deposit Audio ───────────────────────────────────────────
// Geiger crackle near a surveyed uranium deposit. A detail for when the
// deposit is on screen, not a bed that carries: a short radius and a low
// level, like the fountain. Random clicks have no pitch or beat to line
// up, so the plain crossfade is all the wrap needs. A deposit stays in the
// registry under its mine, so it keeps crackling until it is mined out.
const UraniumDepositAudio = makeSeamlessLoopAudio({
  src: 'audio/sfx/nuclear deposit.mp3',
  sources: () => {
    const out = [];
    for (const e of EntityRegistry.getByType(T.URANIUMDEPOSIT)) if (!(e._oreAmount <= 0)) out.push(e);
    return out;
  },
  level: (zoomT) => 0.05 + zoomT * 0.2,
  radius: 16,
});

// ── Mine Audio ──────────────────────────────────────────────────────
// One shared bed for every mine: both coal tiers and the uranium, sulfur
// and lithium mines. Only mines actually digging count. For coal that is
// powered, on a deposit with coal left, and not held up by a backed-up
// line. The ore mines stop when their own buffer is full, which it is on
// and off for any mine feeding a plant slower than it digs, so they get
// the same short hold as the reactors rather than ducking on every pause.
const _oreMineDigging = e => e.powered && !e._bufferFull && !e._idleFull && !e._oreDepleted;
const MineAudio = makeSeamlessLoopAudio({
  src: 'audio/sfx/mine.mp3',
  sources: () => {
    const out = [];
    for (const type of [T.COALMINE, T.COALMINE2]) {
      for (const e of EntityRegistry.getByType(type)) {
        const d = e._linkedDeposit;
        if (e.powered && d && d.coalAmount > 0 && !e._backedUp) out.push(e);
      }
    }
    for (const type of [T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2, T.LITHIUMMINE, T.RAREEARTHMINE]) out.push(..._heldGenerating(type, _oreMineDigging));
    return out;
  },
  level: (zoomT) => 0.06 + zoomT * 0.225,
});

// ── Machine Audio ───────────────────────────────────────────────────
// A bed for every machine that had none. The samples are synthesized
// (scripts/synth_sfx.js) and grouped by what the machine physically is, so
// plants built around the same equipment share one: every gas compressor
// sounds like a compressor. A field recording saved under the same name
// replaces a sample with no change here.
//
// `on` is whether the machine is actually working, not merely placed, and
// every bed takes the reactors' short hold, since most of these stall for
// a tick whenever an input buffer runs dry. Levels sit below the reactor
// beds and the radius grows with the footprint: a dozen of these can be in
// earshot at once in an industrial district.
const _stocked = (...flags) => e => e.powered && flags.every(f => e[f]);
const _storeLive = e => e.powered || e.charge > 0;   // storage: on the grid, or holding charge
const _meridianLive = e => e.powered && typeof NationalProject !== 'undefined' && NationalProject.reached('stage2') && !NationalProject.isActive();
const MACHINE_BEDS = [
  { src: 'audio/sfx/steamturbine.mp3', align: true, radius: 30, level: z => 0.07 + z * 0.3,
    on: { [T.STEAMTURBINE]: e => e._generating, [T.STEAMTURBINE2]: e => e._generating } },
  // The two towers are different machines and sound it: falling water in a
  // concrete shell for the natural-draft MK1, fans and chillers for the
  // Cryogenic one. The water sits where the ear is keenest, so its level is
  // a little under the other beds' to come out as loud as they do.
  { src: 'audio/sfx/coolingtower.mp3', radius: 35, level: z => 0.05 + z * 0.21,
    on: { [T.COOLINGTOWER]: e => e._hotConnected && e._coolConnected } },
  { src: 'audio/sfx/cryotower.mp3', align: true, radius: 40, level: z => 0.06 + z * 0.26,
    on: { [T.COOLINGTOWER2]: e => e._hotConnected && e._coolConnected } },
  { src: 'audio/sfx/refinery.mp3', align: true, radius: 28, level: z => 0.06 + z * 0.26,
    on: { [T.REFINERY]: e => e._refStatus === 'running' } },
  { src: 'audio/sfx/chemicalplant.mp3', align: true, radius: 32, level: z => 0.06 + z * 0.24,
    on: { [T.CHEMICALPLANT]: e => e._chemActive, [T.WASHTOWER]: _stocked('_waterConnected', '_hasAmmonia'),
          [T.REPROCESSOR]: e => e._running, [T.TRITIUMBREEDER]: e => e._breeding } },
  { src: 'audio/sfx/compressor.mp3', align: true, radius: 30, level: z => 0.06 + z * 0.24,
    on: { [T.HABERBOSCH]: _stocked('_hasNitrogen', '_hasHydrogen'), [T.HELIUMWELL]: _oreMineDigging, [T.HELIUMWELL2]: _oreMineDigging } },
  { src: 'audio/sfx/cryoplant.mp3', align: true, period: 1.6, radius: 30, level: z => 0.06 + z * 0.24,
    on: { [T.CRYOPLANT]: e => e._running, [T.HE3SEPARATOR]: e => e._separating } },
  { src: 'audio/sfx/airfans.mp3', align: true, radius: 30, level: z => 0.06 + z * 0.24,
    on: { [T.ATMOSCOLLECTOR]: e => e.powered, [T.CARBONCAPTURE]: e => e.powered } },
  { src: 'audio/sfx/electrolyzer.mp3', align: true, radius: 28, level: z => 0.05 + z * 0.22,
    on: { [T.ELECTROLYZER]: _stocked('_waterConnected') } },
  { src: 'audio/sfx/fabrication.mp3', align: true, period: 2.4, radius: 30, level: z => 0.06 + z * 0.24,
    on: { [T.FUELPLANT]: _stocked('_hasAcid', '_hasUranium'), [T.MOXPLANT]: e => e._running, [T.FUSIONFUELPLANT]: e => e._generating } },
  { src: 'audio/sfx/crusher.mp3', radius: 30, level: z => 0.06 + z * 0.24,
    on: { [T.LITHIUMPROCESSPLANT]: _stocked('_oreConveyor', '_waterConnected'),
          [T.COALWASTE]: _stocked('_wasteStored'), [T.OILWASTE]: _stocked('_wasteStored'), [T.NUCLEARWASTE]: _stocked('_wasteStored') } },
  { src: 'audio/sfx/poolpumps.mp3', align: true, radius: 20, level: z => 0.05 + z * 0.2,
    on: { [T.SPENTFUELPOOL]: _stocked('_total') } },
  // These three are small and there can be dozens of them, so they stay
  // close: something you hear standing next to one.
  { src: 'audio/sfx/transformer.mp3', align: true, radius: 10, level: z => 0.04 + z * 0.15,
    on: { [T.SUBSTATION]: _storeLive, [T.SUBSTATION2]: _storeLive, [T.BATTERY]: _storeLive } },
  // The big storage tiers each have a voice of their own, carrying further
  // the bigger they are: MK3's superconducting magnet and cryocooler, MK4's
  // drone and arcing spires, MK5's captive star.
  { src: 'audio/sfx/smes.mp3', align: true, radius: 16, level: z => 0.05 + z * 0.19,
    on: { [T.SUBSTATION3]: _storeLive } },
  { src: 'audio/sfx/aegis.mp3', radius: 24, level: z => 0.06 + z * 0.24,
    on: { [T.SUBSTATION4]: _storeLive } },
  { src: 'audio/sfx/helios.mp3', align: true, radius: 34, level: z => 0.08 + z * 0.3,
    on: { [T.SUBSTATION5]: _storeLive } },
  // Hyperion Station is a converter station fed by fusion, so it has two
  // voices: the transformers' hum, as big as the site (64×40, heard from
  // well outside its fence), over the Fusion Reactor's sound pitched down.
  // Only once it stands (First Light on), and not during the finale, which
  // plays both itself (NationalProject).
  { src: 'audio/sfx/transformer.mp3', align: true, radius: 60, level: z => 0.07 + z * 0.3,
    on: { [T.NATIONALGRID]: e => _meridianLive(e) } },
  { src: 'audio/sfx/fusion.mp3', align: true, rate: 0.8, radius: 60, level: z => 0.06 + z * 0.26,
    on: { [T.NATIONALGRID]: e => _meridianLive(e) } },
  { src: 'audio/sfx/servers.mp3', align: true, radius: 10, level: z => 0.02 + z * 0.075,
    on: { [T.RESEARCH]: e => e.powered, [T.RESEARCH2]: e => e.powered, [T.RESEARCH3]: e => e.powered,
          [T.MK4RESEARCH]: e => e.powered, [T.MK5RESEARCH]: e => e.powered } },
  { src: 'audio/sfx/smallengine.mp3', radius: 14, level: z => 0.025 + z * 0.1,
    on: { [T.BIOFUELGEN]: e => e._biofuelOutput > 0 } },
].map(({ on, ...bed }) => makeSeamlessLoopAudio({
  ...bed,
  sources: () => {
    const out = [];
    for (const type of Object.keys(on)) out.push(..._heldGenerating(type, e => !e._lightningDamaged && on[type](e)));
    return out;
  },
}));
// "Fully charged": a substation near the camera reaching 100% plays a
// rising chime, pitched lower and fuller the bigger the tier. Each one
// re-arms once it has drawn down below 90%, so a store sitting at full
// never repeats it.
const StoreChargedAudio = (() => {
  const TIERS = [[T.SUBSTATION, 1], [T.SUBSTATION2, 2], [T.SUBSTATION3, 3], [T.SUBSTATION4, 4], [T.SUBSTATION5, 5]];
  const armed = new WeakMap();
  return {
    tick() {
      const ZOOM_MIN = 0.25 * Math.pow(1.12, 2), ZOOM_MAX = 3.0;
      const zoomT = Math.max(0, Math.min(1, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)));
      const cx = (Camera.x + window.innerWidth  / 2 / Camera.zoom) / TILE;
      const cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;
      for (const [type, tier] of TIERS) {
        for (const e of EntityRegistry.getByType(type)) {
          const cap = e.def?.capacity || 0;
          if (!cap) continue;
          const pct = (e.charge || 0) / cap;
          const was = armed.get(e);
          if (was === undefined) { armed.set(e, pct < 0.9); continue; }   // first sight (or a load): no chime
          if (pct < 0.9) { if (!was) armed.set(e, true); continue; }
          if (!was || pct < 0.995) continue;
          armed.set(e, false);
          const r = 18 + tier * 8;
          const d = Math.hypot(e.col + (e.width || 1) / 2 - cx, e.row + (e.height || 1) / 2 - cy);
          if (d >= r) continue;
          const vol = (0.25 + zoomT * 0.5) * (1 - d / r);
          if (vol > 0.02) SFX.storeCharged(vol, tier);
        }
      }
    },
  };
})();

const MachineAudio = { tick: () => { for (const bed of MACHINE_BEDS) bed.tick(); StoreChargedAudio.tick(); } };

// ── Stadium Audio ───────────────────────────────────────────────────
// The crowd, on event nights only and only while the event is on: the
// same test _renderStadium uses to fill the stands (powered, a match
// tonight, 19:00–22:00). One bed for matches, concerts and wrestling. The
// recording is loud, so the level is low for its reach.
//
// The clip is a crowd that settles, then erupts at about 24 s and is still
// roaring when the file ends, as it is when the file starts. So the wrap
// lands roar-on-roar at matched level; the two roars differ a little in
// tone, and a long 4 s crossfade turns that into a drift rather than a
// join. No `align`: a crowd has no steady pitch to line up.
const StadiumAudio = makeSeamlessLoopAudio({
  src: 'audio/sfx/stadium.mp3',
  xfade: 4,
  sources: () => {
    const hr = DayNight.hour();
    if (hr < 19 || hr >= 22) return [];
    const out = [];
    for (const e of EntityRegistry.getByType(T.COMMERCIAL)) {
      if (e.commercialSubtype === 'stadium' && e.powered && e._matchTonight) out.push(e);
    }
    return out;
  },
  level: (zoomT) => 0.05 + zoomT * 0.22,
  radius: 36,
});

// ── Nightclub Audio ─────────────────────────────────────────────────
// The music inside Club Voltage, heard from the street: a muffled house
// loop while the club is powered and open (22:00–04:00, the hours its sign
// and its demand curve keep). The sample is a four-bar phrase at 125 bpm,
// so the loop is cut on whole phrases (`period`) and the kick carries on
// across the wrap. A short radius: it is a wall's worth of bass you hear
// when you are looking at the building, not a bed for the whole district.
const NightclubAudio = makeSeamlessLoopAudio({
  src: 'audio/sfx/nightclub.mp3',
  align: true,
  period: 7.68,
  sources: () => {
    const hrs = DemandCurves.hours('nightclub');
    if (hrs && !hrs.isOpenNow) return [];
    const out = [];
    for (const e of EntityRegistry.getByType(T.COMMERCIAL)) {
      if (e.commercialSubtype === 'nightclub' && e.powered) out.push(e);
    }
    return out;
  },
  level: (zoomT) => 0.1 + zoomT * 0.4,
  radius: 16,
});

// ── Military Base Audio ─────────────────────────────────────────────
// Four voices, each following what the sprite shows (renderMilitaryBase),
// and all of them silent while the base has no power, as the sprite is dark:
//   • the base at rest, round the clock: generators, wind in the wire, the
//     radar, the radio net
//   • the firing range and the squad drilling, 07:00–18:00 as drawn
//   • the duty fighter's engine through its sortie
//   • the helicopter's rotor through its circuit
// The two aircraft are beds, not one-shots: their sprites run on the
// animation clock (GameLoop.animT), which speeds up with the game, so a
// take-off lasts 7 s at 1× and under a second at 10×. A bed whose level and
// pitch are read off that clock every tick fits any of them. They and the
// day shift stop with the clock when time is paused; the base bed carries
// on, like every other building's.
const MilitaryBaseAudio = (() => {
  const bases = () => { const out = []; for (const e of EntityRegistry.getByType(T.MILITARYBASE)) if (e.powered) out.push(e); return out; };
  const moving = () => DevMode.timeScale !== 0;

  // Fighter: [point in the cycle, level, pitch], straight lines between.
  // Spool up on the flight line, taxi at idle, burner in once lined up
  // (0.17–0.19), the roll and the climb away, quiet while it is off on its
  // sortie, back over the threshold at 0.6, taxi in, shut down.
  const JET = [[0, 0, 0.45], [0.012, 0.22, 0.72], [0.17, 0.22, 0.72], [0.19, 1, 1.15], [0.24, 1, 1.12], [0.27, 0.2, 1], [0.31, 0, 0.9],
               [0.575, 0, 0.85], [0.6, 0.4, 0.95], [0.64, 0.3, 0.8], [0.7, 0.22, 0.72], [0.84, 0.22, 0.72], [0.875, 0, 0.45], [1, 0, 0.45]];
  function jet() {
    const u = (GameLoop.animT() / _MB_JET_PERIOD) % 1;
    let i = 1;
    while (i < JET.length - 1 && JET[i][0] < u) i++;
    const a = JET[i - 1], b = JET[i], k = (u - a[0]) / (b[0] - a[0]);
    return { level: a[1] + (b[1] - a[1]) * k, rate: a[2] + (b[2] - a[2]) * k };
  }
  // Helicopter: 0 with the rotor idling on the pad, 1 at flight rpm.
  const heliK = () => (_mbHeliState(GameLoop.animT()).rotor - 0.4) / 1.6;

  const bed = makeSeamlessLoopAudio({
    src: 'audio/sfx/militarybase.mp3',
    align: true,
    sources: bases,
    level: (zoomT) => 0.05 + zoomT * 0.2,
    radius: 34,
  });
  // Rifle shots carry, and peak far above the level of a hum: kept low.
  const dayShift = makeSeamlessLoopAudio({
    src: 'audio/sfx/firingrange.mp3',
    align: true,
    period: Math.PI / 5,
    sources: () => { const hr = DayNight.hour(); return moving() && hr >= 7 && hr < 18 ? bases() : []; },
    level: (zoomT) => 0.035 + zoomT * 0.15,
    radius: 30,
  });
  const jetEngine = makeSeamlessLoopAudio({
    src: 'audio/sfx/jetengine.mp3',
    sources: () => (moving() && jet().level > 0.005 ? bases() : []),
    level: (zoomT) => (0.12 + zoomT * 0.5) * jet().level,
    rate: () => jet().rate,
    radius: 55,
  });
  // Heard from where the helicopter is, so it comes and goes as it laps
  // the base. Barely there while the rotor idles on the pad.
  const rotor = makeSeamlessLoopAudio({
    src: 'audio/sfx/helicopter.mp3',
    align: true,
    sources: () => {
      if (!moving()) return [];
      const h = _mbHeliState(GameLoop.animT());
      return bases().map(e => ({ col: e.col + h.hx / 1120 * e.width - 0.5, row: e.row + h.hy / 800 * e.height - 0.5, width: 1, height: 1 }));
    },
    level: (zoomT) => (0.07 + zoomT * 0.3) * (0.1 + 0.9 * heliK() ** 2),
    rate: () => 0.5 + 0.5 * heliK(),
    radius: 40,
  });

  return { tick: () => { bed.tick(); dayShift.tick(); jetEngine.tick(); rotor.tick(); } };
})();

// ── Airport Audio ───────────────────────────────────────────────────
// Two voices, silent while the airport has no power:
//   • the apron and terminal: ground power, a baggage tug, the PA. Round
//     the clock, at half level before the first flight (05:00)
//   • the airliner's engines, heard from where the aircraft is. It sits
//     lined up at idle between flights, comes up to full for the roll, goes
//     with it on the climb-out until it is out of earshot, comes back in on
//     the approach, roars in reverse after touchdown and taxis round at idle.
// The engines are a bed read off the animation clock, like the Military
// Base's aircraft and for the same reason, and stop with it when paused.
const AirportAudio = (() => {
  const airports = () => { const out = []; for (const e of EntityRegistry.getByType(T.AIRPORT)) if (e.powered) out.push(e); return out; };
  // [point in the flight, level, pitch], straight lines between. 0.999 is
  // the airliner waiting on the runway (and the whole of a slot with no flight).
  const ENG = [[0, 0.35, 0.8], [0.03, 1, 1.05], [0.20, 1, 1.1], [0.33, 0.9, 1], [0.34, 0.4, 0.82], [0.47, 0.4, 0.8], [0.485, 0.85, 1],
               [0.56, 0.5, 0.85], [0.61, 0.2, 0.7], [0.97, 0.2, 0.7], [0.985, 0.1, 0.65], [1, 0.1, 0.65]];
  function engines() {
    const u = _airportFlightPhase(GameLoop.animT());
    let i = 1;
    while (i < ENG.length - 1 && ENG[i][0] < u) i++;
    const a = ENG[i - 1], b = ENG[i], k = (u - a[0]) / (b[0] - a[0]);
    return { u, level: a[1] + (b[1] - a[1]) * k, rate: a[2] + (b[2] - a[2]) * k };
  }

  const bed = makeSeamlessLoopAudio({
    src: 'audio/sfx/airport.mp3',
    align: true,
    sources: airports,
    level: (zoomT) => (0.05 + zoomT * 0.2) * (DayNight.hour() < 5 ? 0.5 : 1),
    radius: 34,
  });
  const liner = makeSeamlessLoopAudio({
    src: 'audio/sfx/airliner.mp3',
    align: true,
    sources: () => {
      if (DevMode.timeScale === 0 || DayNight.hour() < 5) return [];
      const u = engines().u, p = _airportGroundAt(u) || _airportAirAt(u);
      if (!p) return [];
      // Sprite units are 40 to the tile: scaled to the footprint on the
      // ground, as the sprite is, and world pixels once it is in the air.
      return airports().map(e => ({ col: e.col + p.x / 1120 * (p.alt === undefined ? 28 : e.width) - 0.5,
                                    row: e.row + p.y / 640 * (p.alt === undefined ? 16 : e.height) - 0.5, width: 1, height: 1 }));
    },
    level: (zoomT) => (0.1 + zoomT * 0.42) * engines().level,
    rate: () => engines().rate,
    radius: 60,
  });

  // A synthesized jet under the airliner sample, giving the engines their
  // body: the turbofan's high whine (two close tones, beating) climbing with
  // the spool, the fan's low buzz, and broadband roar that swells on the roll
  // and the reverse thrust. Heard from the aircraft, like `liner`.
  let jet = null, jetNoise = null;
  function _jetNoise(c) {
    if (jetNoise && jetNoise.sampleRate === c.sampleRate) return jetNoise;
    const n = c.sampleRate * 2;
    jetNoise = c.createBuffer(1, n, c.sampleRate);
    const d = jetNoise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < n; i++) { b = 0.9 * b + 0.1 * (Math.random() * 2 - 1); d[i] = b * 2.2; }
    return jetNoise;
  }
  function _jetBuild(c) {
    const out = c.createGain(); out.gain.value = 0; out.connect(SFX.bedsBus());
    const mk = (type, f, g) => { const o = c.createOscillator(), gn = c.createGain(); o.type = type; o.frequency.value = f; gn.gain.value = g; o.connect(gn); return { o, gn }; };
    const whineG = c.createGain(); whineG.gain.value = 0; whineG.connect(out);
    const w1 = mk('sine', 2000, 1), w2 = mk('sine', 2011, 0.6); w1.gn.connect(whineG); w2.gn.connect(whineG);
    const buzzLp = c.createBiquadFilter(); buzzLp.type = 'lowpass'; buzzLp.frequency.value = 500; buzzLp.Q.value = 1.2;
    const buzzG = c.createGain(); buzzG.gain.value = 0; buzzLp.connect(buzzG); buzzG.connect(out);
    const b1 = mk('sawtooth', 110, 0.5); b1.gn.connect(buzzLp);
    const rs = c.createBufferSource(); rs.buffer = _jetNoise(c); rs.loop = true;
    const rf = c.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 600; rf.Q.value = 0.5;
    const roarG = c.createGain(); roarG.gain.value = 0; rs.connect(rf); rf.connect(roarG); roarG.connect(out);
    for (const s of [w1.o, w2.o, b1.o, rs]) s.start();
    return { out, w: [w1.o, w2.o], whineG, b: b1.o, buzzLp, buzzG, rf, roarG, srcs: [w1.o, w2.o, b1.o, rs] };
  }
  function _jetTeardown() {
    for (const s of jet.srcs) { try { s.stop(); } catch (_e) {} try { s.disconnect(); } catch (_e) {} }
    jet.out.disconnect(); jet = null;
  }
  // How loud the airliner is where the camera is (0 out of earshot), from
  // the same position `liner` uses.
  function _jetPresence() {
    if (DevMode.timeScale === 0 || DayNight.hour() < 5) return 0;
    const u = engines().u, p = _airportGroundAt(u) || _airportAirAt(u);
    if (!p) return 0;
    const ZOOM_MIN = 0.25 * Math.pow(1.12, 2), ZOOM_MAX = 3.0;
    const zoomT = Math.max(0, Math.min(1, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)));
    const cx = (Camera.x + window.innerWidth  / 2 / Camera.zoom) / TILE;
    const cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;
    let best = 0;
    for (const e of airports()) {
      const col = e.col + p.x / 1120 * (p.alt === undefined ? 28 : e.width);
      const row = e.row + p.y / 640 * (p.alt === undefined ? 16 : e.height);
      const d = Math.hypot(col - cx, row - cy);
      if (d < 60) best = Math.max(best, (1 - d / 60) ** 1.4);
    }
    return best * (0.35 + 0.65 * zoomT);
  }
  function jetTick() {
    const pres = _jetPresence();
    const c = pres > 0.005 || jet ? SFX.context() : null;
    if (!c || !SFX.bedsBus()) { if (jet) _jetTeardown(); return; }
    if (pres <= 0.005) {
      if (jet) { jet.out.gain.setTargetAtTime(0, c.currentTime, 0.3); if (jet.out.gain.value < 0.002) _jetTeardown(); }
      return;
    }
    if (!jet) jet = _jetBuild(c);
    const now = c.currentTime, en = engines();
    const spool = Math.max(0, Math.min(1, (en.rate - 0.65) / 0.45));    // idle 0 → take-off thrust 1
    jet.out.gain.setTargetAtTime(pres * SFX.getVolume(), now, 0.25);
    const wf = 1500 + 2100 * spool;
    jet.w[0].frequency.setTargetAtTime(wf, now, 0.4);
    jet.w[1].frequency.setTargetAtTime(wf * 1.0055, now, 0.4);
    jet.whineG.gain.setTargetAtTime(0.010 * en.level * (0.5 + 0.5 * spool), now, 0.3);
    jet.b.frequency.setTargetAtTime(70 + 90 * spool, now, 0.4);
    jet.buzzLp.frequency.setTargetAtTime(300 + 600 * spool, now, 0.4);
    jet.buzzG.gain.setTargetAtTime(0.028 * en.level, now, 0.3);
    jet.rf.frequency.setTargetAtTime(350 + 900 * spool, now, 0.5);
    jet.roarG.gain.setTargetAtTime(0.10 * en.level * en.level, now, 0.3);
  }

  return { tick: () => { bed.tick(); liner.tick(); jetTick(); } };
})();

// ── Launch Complex Audio ────────────────────────────────────────────
// Starhaven between and around its launches; the launch itself (the count's
// pips and the roar of the climb-out) is LaunchAudio's, in launch_system.js.
//   • the complex at rest, while it has power: wind, the tank farm venting,
//     the pad tannoy. Any launch complex, the client's on a job site too
// and, for the one that flies (LaunchSystem.getSite), following its sprite:
//   • propellant loading, from two hours out, coming up over its first minutes
//   • the pad klaxon through the terminal count, until the engines light
//   • the crawler bringing the next stack out from the assembly building
//   • the booster's landing burn, half a minute after liftoff
// The last two borrow the small engine and the jet at a lower pitch. All
// four stop while time is paused: the count stands still.
const LaunchComplexAudio = (() => {
  const isComplex = e => e.type === T.LAUNCHCOMPLEX || e.commercialSubtype === 'spaceport';
  const all = () => {
    const out = [];
    for (const e of EntityRegistry.getByType(T.LAUNCHCOMPLEX)) if (e.powered) out.push(e);
    for (const e of EntityRegistry.getByType(T.INDUSTRIAL)) if (e.commercialSubtype === 'spaceport' && e.powered) out.push(e);
    return out;
  };
  // What the flying complex is doing now, or null.
  function state() {
    if (DevMode.timeScale === 0 || typeof LaunchSystem === 'undefined') return null;
    const e = LaunchSystem.getSite();
    if (!e || !isComplex(e) || !e.powered) return null;
    const next = LaunchSystem.getNext();
    return { e, v: LaunchSystem.visual(e), left: next ? next.at - DayNight.getElapsed() : Infinity };
  }
  const when = test => () => { const s = state(); return s && test(s) ? [s.e] : []; };
  const TERMINAL_S = 24;

  const bed = makeSeamlessLoopAudio({
    src: 'audio/sfx/launchcomplex.mp3',
    align: true,
    sources: all,
    level: (zoomT) => 0.05 + zoomT * 0.2,
    radius: 32,
  });
  const loading = makeSeamlessLoopAudio({
    src: 'audio/sfx/propellant.mp3',
    align: true,
    sources: when(s => s.v.fuelling),
    // Louder as the count runs down: the last minute is the whole plant flat out.
    level: (zoomT) => { const s = state(); return (0.06 + zoomT * 0.24) * (s && s.left < 60 ? 1 : 0.6); },
    radius: 40,
  });
  const klaxon = makeSeamlessLoopAudio({
    src: 'audio/sfx/klaxon.mp3',
    align: true,
    period: 2,
    sources: when(s => s.v.fuelling && s.left <= TERMINAL_S && s.v.igniteK <= 0),
    level: (zoomT) => 0.04 + zoomT * 0.15,
    radius: 45,
  });
  const crawler = makeSeamlessLoopAudio({
    src: 'audio/sfx/smallengine.mp3',
    rate: 0.55,
    sources: when(s => s.v.rocket === 'rollout'),
    level: (zoomT) => 0.04 + zoomT * 0.16,
    radius: 30,
  });
  // Nothing until it is nearly down, then the burn all the way to the pad.
  const boosterK = () => { const s = state(); return s && s.v.boosterK >= 0 && s.v.boosterK < 1 ? s.v.boosterK : -1; };
  const booster = makeSeamlessLoopAudio({
    src: 'audio/sfx/jetengine.mp3',
    sources: when(s => s.v.boosterK >= 0.25 && s.v.boosterK < 1),
    level: (zoomT) => { const k = boosterK(); return (0.1 + zoomT * 0.4) * (k < 0 ? 0 : Math.min(1, (k - 0.25) / 0.35) * Math.min(1, (1 - k) / 0.06)); },
    rate: () => { const k = boosterK(); return 0.7 + 0.25 * Math.max(0, k); },
    radius: 55,
  });

  return { tick: () => { bed.tick(); loading.tick(); klaxon.tick(); crawler.tick(); booster.tick(); } };
})();

// ── Fountain Audio ──────────────────────────────────────────────────
// Quiet splashing bed near Fountain Plazas. Unpowered, so every placed
// fountain counts. A short radius and low level keep it a detail you
// hear when you're looking at the plaza, not a city-wide wash.
const FountainAudio = makeSeamlessLoopAudio({
  src: 'audio/sfx/fountain.mp3',
  sources: () => [...EntityRegistry.getByType(T.FOUNTAIN)],
  level: (zoomT) => 0.04 + zoomT * 0.14,
  radius: 18,
});

// ── Zone Ambience ───────────────────────────────────────────────────
// Commercial zones carry the city bed around the clock. Residential zones
// carry a neighbourhood bed by day and a night bed after dark, crossfaded
// through dawn and sunset as DayNight.darkness() ramps.
//
// A zone can span dozens of tiles, so its centre is a poor stand-in for
// "how close am I": each zone is fed to the loop as the point on its
// rectangle nearest the camera, so a bed is at full strength anywhere inside
// a zone and only fades out past its edge.
function _zoneSources(key) {
  const rects = typeof ZoneSystem !== 'undefined' ? ZoneSystem.getZoneRects(key) : [];
  if (!rects.length) return [];
  const cx = (Camera.x + window.innerWidth  / 2 / Camera.zoom) / TILE;
  const cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;
  // col/row offset by half a tile: the loop measures to col + width/2.
  return rects.map(z => ({
    col: Math.max(z.minC, Math.min(z.maxC, cx)) - 0.5,
    row: Math.max(z.minR, Math.min(z.maxR, cy)) - 0.5,
    width: 1, height: 1,
  }));
}

// 0 in full daylight, 1 at night. darkness() floors at 0.05 in daytime.
function _nightMix() {
  const d = typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;
  return Math.max(0, Math.min(1, (d - 0.05) / 0.95));
}

const ZONE_AMBIENCE_LEVEL = (zoomT) => 0.10 + zoomT * 0.22;

// City bed over commercial zones, day and night.
const CityAmbienceAudio = makeSeamlessLoopAudio({
  src: 'audio/sfx/cityambience.mp3',
  sources: () => _zoneSources('commercial'),
  level: ZONE_AMBIENCE_LEVEL,
  radius: 30,
});

// Industrial bed over industrial zones, day and night.
const IndustryAmbienceAudio = makeSeamlessLoopAudio({
  src: 'audio/sfx/industry.mp3',
  sources: () => _zoneSources('industrial'),
  level: ZONE_AMBIENCE_LEVEL,
  radius: 30,
});

// Residential: neighbourhood by day, night bed after dark. Each reports no
// sources once its share of the mix is effectively zero, so the loop fades
// out and is torn down rather than running silent all day (or all night) —
// and neither file is fetched until its half of the day comes round.
const NeighborhoodAudio = makeSeamlessLoopAudio({
  src: 'audio/sfx/neighborhood.mp3',
  sources: () => (1 - _nightMix() < 0.01 ? [] : _zoneSources('residential')),
  level: (zoomT) => ZONE_AMBIENCE_LEVEL(zoomT) * (1 - _nightMix()),
  radius: 30,
});

const NightAmbienceAudio = makeSeamlessLoopAudio({
  src: 'audio/sfx/nightambience.mp3',
  sources: () => (_nightMix() < 0.01 ? [] : _zoneSources('residential')),
  level: (zoomT) => ZONE_AMBIENCE_LEVEL(zoomT) * _nightMix(),
  radius: 30,
});

// ── Fire Audio ────────────────────────────────────────
// A single looping crackle for everything currently alight — struck
// buildings and burning cable both. One shared loop rather than one per
// fire: a detonation can leave a dozen wrecks in a block, and a dozen
// overlapping copies of the same sample is noise, not a bigger fire.
// Scale instead comes through the volume, which rises a little with the
// number of fires burning and falls off with distance from the nearest.
//
// Unlike every other loop in this file it runs through Web Audio rather
// than <audio loop>, because a fire bed is heard continuously for minutes
// at a time and both of that tag's seam artefacts are audible over it:
//
//   1. <audio loop> is not gapless — the element restarts through the
//      media pipeline, leaving a short but repeating hole.
//   2. The sample's last moment and first moment are different amplitudes,
//      so even a gapless restart clicks.
//
// A looping AudioBufferSourceNode fixes (1) for free, and
// seamlessLoopBuffer() fixes (2) by folding the tail back over the head, so the wrap
// point is a crossfade rather than a cut. If Web Audio isn't available
// the module falls back to the plain looping element — audible seam and
// all, which is still better than silence.
const FireAudio = (() => {
  const SRC   = 'audio/sfx/fire.mp3';
  const XFADE = 1.5;   // seconds of tail folded back over the head

  let gain     = null;
  let source   = null;
  let buffer   = null;
  let loading  = false;
  let unusable = false;   // Web Audio missing, or the fetch/decode failed
  let fallback = null;    // the <audio loop> path, used only if unusable

  // Every burning thing on the map, buildings and cable together. Both
  // lists are rebuilt each logic tick by LightningDamageSystem, so this is
  // a read of two small arrays rather than a registry scan.
  function burning() {
    if (typeof LightningDamageSystem === 'undefined') return [];
    const out = LightningDamageSystem.getDamaged();
    const w   = LightningDamageSystem.getBurningWires();
    return w.length ? out.concat(w) : out;
  }

  // Fetch + decode once, on the first fire of the session. Any failure
  // (no Web Audio, offline file, decode error) drops to the fallback and
  // is never retried.
  function _load(ctx) {
    if (loading || buffer || unusable) return;
    loading = true;
    fetch(SRC)
      .then(r => r.arrayBuffer())
      .then(b => ctx.decodeAudioData(b))
      .then(raw => { buffer = seamlessLoopBuffer(ctx, raw, XFADE); loading = false; })
      .catch(() => { unusable = true; loading = false; });
  }

  function _startWebAudio(ctx) {
    gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(SFX.bedsBus());
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop   = true;
    source.connect(gain);
    source.start();
  }

  function _stop() {
    if (source) { try { source.stop(); } catch (_e) {} source.disconnect(); source = null; }
    if (gain)   { gain.disconnect(); gain = null; }
    if (fallback) { fallback.stop(); fallback = null; }
  }

  // Zoom + proximity, the same shape every other loop in this file uses.
  function _targetVolume(fires) {
    const ZOOM_MIN = 0.25 * Math.pow(1.12, 2);
    const ZOOM_MAX = 3.0;
    const zoomT = Math.max(0, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN));

    const cx = (Camera.x + window.innerWidth  / 2 / Camera.zoom) / TILE;
    const cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;
    const HEAR_RADIUS = 40;
    let nearestDist = Infinity;
    for (const e of fires) {
      // Measure to the middle of the footprint — a burning 9x7 waste
      // facility shouldn't read as distant because its anchor corner is.
      const ec = e.col + (e.width  || 1) / 2;
      const er = e.row + (e.height || 1) / 2;
      const dist = Math.sqrt((ec - cx) ** 2 + (er - cy) ** 2);
      if (dist < nearestDist) nearestDist = dist;
    }
    const proximityT = nearestDist < HEAR_RADIUS ? 1 - (nearestDist / HEAR_RADIUS) : 0;
    // A whole block alight is louder than one shed, but only up to a
    // point — saturates at 1.4x so a bad night can't drown the game out.
    const countT = Math.min(1.4, 1 + Math.log2(fires.length + 1) * 0.12);
    const master = SFX.getVolume ? SFX.getVolume() : 1;
    return Math.max(0, Math.min(1.0, (0.12 + zoomT * 0.42) * proximityT * countT * master));
  }

  return {
    tick: () => {
      const fires = burning();
      if (fires.length === 0) { _stop(); return; }

      const vol = _targetVolume(fires);
      const ctx = unusable ? null : SFX.context();

      if (ctx) {
        if (!buffer) { _load(ctx); return; }   // silent until decoded — one frame or two
        if (!source) _startWebAudio(ctx);
        // Ramped rather than assigned: the target moves every frame as the
        // camera pans, and stepping a gain per frame is a zipper noise.
        gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.05);
        return;
      }

      // Fallback (file://): an element looper, which the beds mute reaches.
      if (!fallback) fallback = makeElementLooper(SRC, 0.6);
      fallback.setVolume(vol);
    }
  };
})();

// ── Weather beds ───────────────────────────────────────────────────
// A weather loop that fades in to `target` over 3s on start() and back out
// over 5s on stop(), then lets go of the bed.
function makeWeatherBedAudio(src, target) {
  let audio = null;
  let fadeInterval = null;

  function clearFade() {
    if (fadeInterval) { clearInterval(fadeInterval); fadeInterval = null; }
  }

  return {
    start: () => {
      clearFade();
      if (!audio) {
        // Weather is part of the general ambience: still heard over the
        // ashes once the machine beds are muted.
        audio = makeSeamlessBed(src, 1.2, true);
        audio.volume = 0;
        audio.start();
      }
      const steps = 30;
      const inc = target / steps;
      fadeInterval = setInterval(() => {
        audio.volume = Math.min(target, audio.volume + inc);
        if (audio.volume >= target) clearFade();
      }, 3000 / steps);
    },
    stop: () => {
      if (!audio) return;
      clearFade();
      const steps = 50;
      const dec = audio.volume / steps;
      fadeInterval = setInterval(() => {
        audio.volume = Math.max(0, audio.volume - dec);
        if (audio.volume <= 0) {
          clearFade();
          audio.stop();
          audio = null;
        }
      }, 5000 / steps);
    }
  };
}

// ── Rain Audio ─────────────────────────────────────────────────────
const RainAudio = makeWeatherBedAudio('audio/sfx/rain.mp3', 0.21);

// ── Heavy Wind Audio (storm) ───────────────────────────────────────
const HeavyWindAudio = makeWeatherBedAudio('audio/sfx/heavywind.mp3', 0.5);

// ── Geomagnetic storm bed ──────────────────────────────────────────
// Synthesized, no samples, and kept to what a grid under a geomagnetic
// storm really sounds like rather than a sci-fi sky. Induced current pushes
// the transformers into half-cycle saturation, so the mains hum thickens
// and grows heavy odd harmonics, swelling and easing with the storm; under
// it a low rumble of air; over it, sparse dry static off the lines, coming
// quicker as the storm builds. tick() follows AuroraSystem (its fade in and
// out, and how hard the storm is blowing), so it begins and ends with the
// event, a restored one included, and needs no start() of its own.
const GeomagAudio = (() => {
  let nodes = null, nextCrackle = 0, noise = null;

  function _noise(c) {
    if (noise && noise.sampleRate === c.sampleRate) return noise;
    const n = c.sampleRate * 2;
    noise = c.createBuffer(1, n, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }

  function _build(c) {
    const out = c.createGain();
    out.gain.value = 0;
    out.connect(SFX.bedsBus());
    // The hum: 60 Hz and its harmonics, the odd ones heavy (saturation),
    // with a slightly detuned third beating against it so it never sits
    // still. Through a lowpass that opens as the storm builds.
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 0.5;
    const hum = c.createGain();
    hum.gain.value = 0;
    lp.connect(hum); hum.connect(out);
    const srcs = [];
    for (const [f, a] of [[60, 1], [120, 0.3], [180, 0.55], [180.7, 0.25], [300, 0.22], [420, 0.1]]) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f; g.gain.value = a;
      o.connect(g); g.connect(lp); o.start();
      srcs.push(o);
    }
    // The rumble: noise, deep lowpassed, barely there.
    const rs = c.createBufferSource(), rlp = c.createBiquadFilter(), rg = c.createGain();
    rs.buffer = _noise(c); rs.loop = true;
    rlp.type = 'lowpass'; rlp.frequency.value = 140; rlp.Q.value = 0.7;
    rg.gain.value = 0;
    rs.connect(rlp); rlp.connect(rg); rg.connect(out); rs.start();
    srcs.push(rs);
    return { out, lp, hum, rg, srcs };
  }

  function _teardown() {
    for (const s of nodes.srcs) { try { s.stop(); } catch (_e) {} s.disconnect(); }
    nodes.out.disconnect();
    nodes = null;
  }

  // Where the next crackle comes from: a random live wire near the middle
  // of the view, its loudness falling off with distance and with zooming
  // out, panned to its side of the screen. Null when no wire is in earshot,
  // so the static only ever comes off the lines.
  const HEAR_RADIUS = 30;   // tiles
  function _nearWire() {
    if (typeof EntityRegistry === 'undefined') return null;
    const cx = (Camera.x + window.innerWidth  / 2 / Camera.zoom) / TILE;
    const cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;
    const halfW = window.innerWidth / 2 / Camera.zoom / TILE;
    let pick = null, seen = 0;
    for (const w of EntityRegistry.getByType(T.WIRE)) {
      if (w.failed) continue;
      const d = Math.hypot(w.col + 0.5 - cx, w.row + 0.5 - cy);
      if (d > HEAR_RADIUS) continue;
      if (Math.random() * ++seen < 1) pick = { d, dx: w.col + 0.5 - cx };   // a fair random pick, one pass
    }
    if (!pick) return null;
    const ZOOM_MIN = 0.25 * Math.pow(1.12, 2), ZOOM_MAX = 3.0;
    const zoomT = Math.max(0, Math.min(1, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)));
    return {
      gain: Math.pow(1 - pick.d / HEAR_RADIUS, 1.5) * (0.35 + 0.65 * zoomT),
      pan: Math.max(-0.8, Math.min(0.8, pick.dx / Math.max(4, halfW))),
    };
  }

  // One tick of static: a few dry clicks close together, highpassed,
  // through a panner set to the wire it came off.
  function _crackle(c, t0, v, pan) {
    let dest = nodes.out;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = pan; p.connect(nodes.out);
      dest = p;
      setTimeout(() => p.disconnect(), 600);
    }
    const n = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const at = t0 + i * (0.015 + Math.random() * 0.06), dur = 0.006 + Math.random() * 0.025;
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = _noise(c);
      f.type = 'highpass'; f.frequency.value = 2200 + Math.random() * 3000;
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(v * (0.4 + 0.6 * Math.random()), at + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
      src.connect(f); f.connect(g); g.connect(dest);
      src.start(at, Math.random() * 1.5); src.stop(at + dur + 0.02);
    }
  }

  return {
    tick() {
      const k = typeof AuroraSystem !== 'undefined' ? AuroraSystem.intensity : 0;
      const c = k > 0.01 || nodes ? SFX.context() : null;
      if (!c || !SFX.bedsBus()) { if (nodes) _teardown(); return; }
      if (k <= 0.005) { if (nodes) _teardown(); return; }
      if (!nodes) { nodes = _build(c); nextCrackle = c.currentTime + 1; }
      const act = AuroraSystem.activity, now = c.currentTime;
      // Ramped, never assigned: these move every frame.
      nodes.out.gain.setTargetAtTime(k * SFX.getVolume(), now, 0.4);
      nodes.hum.gain.setTargetAtTime(0.03 * (0.4 + 0.9 * act), now, 1.2);
      nodes.lp.frequency.setTargetAtTime(300 + 700 * act, now, 1.5);
      nodes.rg.gain.setTargetAtTime(0.09 * (0.5 + 0.7 * act), now, 1.5);
      if (now >= nextCrackle) {
        const w = _nearWire();
        // Closer wires crackle a little louder than the old flat level.
        if (w && w.gain > 0.02) _crackle(c, now + 0.02, (0.06 + 0.06 * act) * w.gain, w.pan);
        nextCrackle = now + (0.6 + Math.random() * 3) / (0.35 + act);
      }
    }
  };
})();

const MusicSystem = (() => {
  let timeout = null;
  let _vol = 0.5;
  let _currentTrack = null;
  let _currentBase = 0;   // the playing track's own level, before the player's volume
  let _currentFade = 0;   // the playing track's end fade length (s), 0 = none
  let _currentIn = 1;     // 0→1 while a track joined part-way (play) fades in

  const TRACKS = [
    { src: 'audio/music/ost1.mp3', vol: 0.2875 },
    { src: 'audio/music/ost2.mp3', vol: 0.2875 },
    { src: 'audio/music/ost3.mp3', vol: 0.1725 },
    { src: 'audio/music/ost4.mp3', vol: 0.2875 },
    // Levels matched to the tracks above (≈ −25 dB after `vol`), measured
    // from each file's loudness, so no song jumps out of the rotation.
    // `fadeOut` (seconds): ramp down over the song's tail — for a file that
    // stops dead rather than ending on its own.
    // File names are matched exactly, case included: the web demo is served
    // from a case-sensitive host.
    { src: 'audio/music/Been A Minute grid.mp3', vol: 0.30 },
    { src: 'audio/music/Beginners Mind.mp3',     vol: 0.186 },
    { src: 'audio/music/Door Closed.mp3',        vol: 0.237 },
    { src: 'audio/music/Pulchritude.mp3',        vol: 0.42 },
    { src: 'audio/music/Seldom Sound.mp3',       vol: 0.251 },
    { src: 'audio/music/Wondering.mp3',          vol: 0.272 },
    { src: 'audio/music/Need Another.mp3',       vol: 0.178 },
    { src: 'audio/music/On the Spot.mp3',        vol: 0.222 },
    { src: 'audio/music/Today.mp3',              vol: 0.380 },
    { src: 'audio/music/Years Ago.mp3',          vol: 0.285 },
    { src: 'audio/music/We Sit.mp3',             vol: 0.166 },
    { src: 'audio/music/Green and Orange.mp3',   vol: 0.154 },
    { src: 'audio/music/Wind Waves.mp3',         vol: 0.29 },
    { src: 'audio/music/Movin and Cruisin.mp3',  vol: 0.158 },
    { src: 'audio/music/Getting There.mp3',      vol: 0.204 },
    { src: 'audio/music/They Shine.mp3',         vol: 0.176 },
    { src: 'audio/music/Cool Down the Road.mp3', vol: 0.225 },
    { src: 'audio/music/Sleepless.mp3',          vol: 0.210 },
    // Not in the rotation, on purpose: Electron.mp3 scores the apocalypse
    // (apocalypse_system.js) and Rope to the Sky.mp3 is Operation Hyperion's
    // victory song (national_project.js) — each is saved for its moment.
  ];
  // Shuffle bag: every track plays once before any comes round again, and
  // the bag is kept in localStorage so a new session carries on through it.
  // The old picker only remembered the last six plays, and only until the
  // page reloaded — with a song every several minutes, a session hears a
  // handful, and each fresh session could draw the same handful again.
  // NO_REPEAT covers the seam between rounds: the last few songs of one
  // round are held out of the opening of the next, so even there a song
  // never returns with fewer than NO_REPEAT others in between.
  const QUEUE_KEY = 'gw_music_queue';
  const NO_REPEAT = 6;
  function _shuffled(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function _nextTrackIdx() {
    let st = null;
    try { st = JSON.parse(localStorage.getItem(QUEUE_KEY) || 'null'); } catch (_e) {}
    // Stored by file so adding or reordering TRACKS can't mis-map old entries.
    const known = src => TRACKS.some(t => t.src === src);
    let queue  = (st && Array.isArray(st.queue)  ? st.queue  : []).filter(known);
    let recent = (st && Array.isArray(st.recent) ? st.recent : []).filter(known);
    if (!queue.length) {
      const hold  = Math.min(NO_REPEAT, TRACKS.length - 1);
      const held  = recent.slice(-hold);
      const fresh = _shuffled(TRACKS.map(t => t.src).filter(src => !held.includes(src)));
      // The opening `hold` slots take only songs outside the held set; the
      // held ones are shuffled in with whatever is left after that.
      queue = [...fresh.slice(0, hold), ..._shuffled([...fresh.slice(hold), ...held])];
    }
    // A song added to TRACKS since the bag was saved joins the round under
    // way, at a random place in what is left of it, rather than waiting for
    // the bag to empty (up to twenty songs, hours of play). `seen` is the
    // track list the bag was last saved against; a bag from before it was
    // kept can't tell new from already played, so that once anything not
    // queued or just heard goes back in.
    else {
      const seen = st && Array.isArray(st.seen) ? st.seen : null;
      for (const t of TRACKS) {
        if (queue.includes(t.src) || recent.includes(t.src) || (seen && seen.includes(t.src))) continue;
        queue.splice(Math.floor(Math.random() * (queue.length + 1)), 0, t.src);
      }
    }
    const src = queue.shift();
    recent.push(src);
    if (recent.length > NO_REPEAT) recent = recent.slice(-NO_REPEAT);
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify({ queue, recent, seen: TRACKS.map(t => t.src) })); } catch (_e) {}
    return TRACKS.findIndex(t => t.src === src);
  }
  // A song put on by hand (play(): the intro's first song, a scene's) counts
  // as heard: it leaves the bag's current round and joins the recent ones, so
  // the rotation doesn't bring it straight back.
  function _markPlayed(src) {
    let st = null;
    try { st = JSON.parse(localStorage.getItem(QUEUE_KEY) || 'null'); } catch (_e) {}
    if (!st || !Array.isArray(st.queue)) st = { queue: [], recent: [] };   // no bag yet: the first one built holds it out (recent)
    const queue = st.queue.filter(s => s !== src);
    let recent = (Array.isArray(st.recent) ? st.recent : []).filter(s => s !== src);
    recent.push(src);
    if (recent.length > NO_REPEAT) recent = recent.slice(-NO_REPEAT);
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify({ queue, recent, seen: st.seen || TRACKS.map(t => t.src) })); } catch (_e) {}
  }

  // First song of a session: 30s–8.5 min. Between songs: 4–14 min, so a
  // track finishing leaves a proper stretch of ambience before the next.
  function scheduleNext(first) {
    const delay = (first === true
      ? 0.5 + Math.random() * 8
      : 4 + Math.random() * 10) * 60 * 1000;
    timeout = setTimeout(() => {
      timeout = null;
      // The Advanced Reactor's meltdown owns the soundtrack from the moment
      // its song starts until the run ends — nothing else may play over it.
      if (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.ownsMusic?.()) return;
      const idx = _nextTrackIdx();
      _currentTrack = new Audio(TRACKS[idx].src);
      _currentIn = 1;
      _currentBase = TRACKS[idx].vol * 2;
      _currentFade = TRACKS[idx].fadeOut || 0;
      applyVolume();
      _currentTrack.play().catch(() => {});
      _currentTrack.addEventListener('ended', scheduleNext);
      // A file that is missing or won't decode never ends: without this the
      // music stopped for the rest of the session the first time one came up.
      _currentTrack.addEventListener('error', scheduleNext, { once: true });
      if (_currentFade) _currentTrack.addEventListener('timeupdate', applyVolume);
    }, delay);
  }

  // Track level × player volume × the end-of-song fade (if the track has one).
  function applyVolume() {
    const t = _currentTrack;
    if (!t) return;
    let fade = 1;
    if (_currentFade && isFinite(t.duration)) {
      const left = t.duration - t.currentTime;
      if (left < _currentFade) fade = Math.max(0, left / _currentFade) ** 2;
    }
    t.volume = Math.min(1, _currentBase * _vol * fade * _currentIn);
  }

  function stop() {
    clearTimeout(timeout);
    timeout = null;
    if (_currentTrack) {
      _currentTrack.removeEventListener('ended', scheduleNext);
      _currentTrack.removeEventListener('timeupdate', applyVolume);
      _currentTrack.pause();
      _currentTrack = null;
    }
  }

  return {
    // Idempotent: start() used to schedule a fresh timer on every call while
    // stop() only ever cleared the latest one, so each extra start (intro
    // callback, a reactor cooled and re-armed, the Hyperion finale) left an
    // orphaned timer that later played a track nothing could stop — several
    // songs stacked on top of each other, meltdown song included.
    start: () => { stop(); scheduleNext(true); },
    getVolume: () => _vol,
    // A song is on (or loading) right now.
    isPlaying: () => !!_currentTrack,
    stop,
    tracks: () => TRACKS.map(t => t.src),   // the rotation's files (the dev panel's picker)
    // Put a song from the rotation on now, for a scene that wants that one
    // (CompanyHQ's unveiling), joined `at` seconds in. The rotation carries
    // on after it. Returns the element, so the scene can keep time to it.
    // Joined part-way, it is loaded as a blob first, so the seek works
    // whatever the server makes of range requests.
    play(src, at = 0) {
      const tr = TRACKS.find(t => t.src === src);
      if (!tr) return null;
      _markPlayed(src);
      // Whatever is playing bows out first: faded over FADE ms, and the new
      // song holds back until it has gone.
      const FADE = 1200, old = _currentTrack && !_currentTrack.paused ? _currentTrack : null;
      if (old) {
        old.removeEventListener('ended', scheduleNext);
        old.removeEventListener('timeupdate', applyVolume);
        _currentTrack = null;                                 // so stop() below leaves it to fade
        const v0 = old.volume, t0 = performance.now(), iv = setInterval(() => {
          const u = Math.min(1, (performance.now() - t0) / FADE);
          old.volume = v0 * (1 - u) * (1 - u);
          if (u >= 1) { clearInterval(iv); old.pause(); }
        }, 40);
      }
      stop();
      const a = _currentTrack = new Audio();
      _currentBase = tr.vol * 2;
      _currentFade = tr.fadeOut || 0;
      _currentIn = at > 0 ? 0 : 1;                            // joined mid-song, it comes up over a second rather than cutting in
      applyVolume();
      a.addEventListener('ended', scheduleNext);
      a.addEventListener('error', scheduleNext, { once: true });
      if (_currentFade) a.addEventListener('timeupdate', applyVolume);
      const go = url => {
        if (_currentTrack !== a) return;                      // stopped, or replaced, while it loaded
        if (at > 0) a.addEventListener('loadedmetadata', () => { try { a.currentTime = at; } catch (_e) {} }, { once: true });
        a.src = url;
        a.play().catch(() => {});
        if (at > 0) a.addEventListener('playing', () => {
          const t0 = performance.now(), iv = setInterval(() => {
            if (_currentTrack !== a) { clearInterval(iv); return; }
            _currentIn = Math.min(1, (performance.now() - t0) / 1000);
            applyVolume();
            if (_currentIn >= 1) clearInterval(iv);
          }, 40);
        }, { once: true });
      };
      const after = fn => old ? setTimeout(fn, FADE) : fn();
      if (at > 0) fetch(tr.src).then(r => r.ok ? r.blob() : Promise.reject(new Error('song'))).then(b => after(() => go(URL.createObjectURL(b)))).catch(() => after(() => go(tr.src)));
      else after(() => go(tr.src));
      return a;
    },
    setVolume: (v) => {
      _vol = v;
      // Keep the track's own level: setting the raw slider value here made the
      // music jump up whenever Options opened (it re-applies the saved volume).
      applyVolume();
      if (typeof MenuTheme !== 'undefined') MenuTheme.setVolume(v);
    }
  };
})();

// ── Ambient Audio ──────────────────────────────────────────────────
const AmbientAudio = (() => {
  let audio = null;
  return {
    start: () => {
      if (audio) return;
      audio = makeSeamlessBed('audio/sfx/general ambience.mp3', 1.2, true);
      audio.setVolume(0.6);
      audio.start();
    },
    stop: () => { if (audio) { audio.stop(); audio = null; } }
  };
})();

// ── Grid Hum ───────────────────────────────────────────────────────
const GridHum = (() => {
  let audio = null;
  return {
    start: () => {
      if (audio) return;
      audio = makeSeamlessBed('audio/sfx/electric hum.mp3');
      audio.setVolume(0.3);
      audio.start();
    },
    stop: () => { if (audio) { audio.stop(); audio = null; } },
    tick: () => {
      if (!audio) return;
      const ZOOM_MIN = 0.25 * Math.pow(1.12, 2);
      const ZOOM_MAX = 3.0;
      const zoomT = Math.max(0, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN));

      // Find nearest wire to camera centre (in tiles)
      const cx = (Camera.x + window.innerWidth  / 2 / Camera.zoom) / TILE;
      const cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;
      const HEAR_RADIUS = 40; // tiles
      let nearestDist = Infinity;
      for (const type of [T.POLE, T.POWERTOWER]) {
        for (const e of EntityRegistry.getByType(type)) {
          const dist = Math.sqrt((e.col - cx) ** 2 + (e.row - cy) ** 2);
          if (dist < nearestDist) nearestDist = dist;
        }
      }
      const proximityT = nearestDist < HEAR_RADIUS
        ? 1 - (nearestDist / HEAR_RADIUS)
        : 0;

      audio.setVolume(Math.max(0, Math.min(1.0, zoomT * proximityT * 0.1)));
    }
  };
})();

// ── Water Audio (ambient babble near any water body) ───────────────
const WaterAudio = (() => {
  let audio = null;
  const HEAR_RADIUS = 40; // tiles
  const VOL_MAX = 1.75;

  return {
    start: () => {
      if (audio) return;
      audio = makeSeamlessBed('audio/sfx/water.wav');
      audio.setVolume(0);
      audio.start();
    },
    stop: () => { if (audio) { audio.stop(); audio = null; } },
    tick: () => {
      if (!audio || typeof WaterSystem === 'undefined') return;
      const ZOOM_MIN = 0.25 * Math.pow(1.12, 2);
      const ZOOM_MAX = 3.0;
      const zoomT = Math.max(0, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN));

      const cx = (Camera.x + window.innerWidth  / 2 / Camera.zoom) / TILE;
      const cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;

      // Scan a box of tiles around the camera centre for the nearest
      // water tile — WaterSystem.isWater() is an O(1) Set lookup, so
      // a 41x41 box (radius 20) per tick is cheap.
      const baseC = Math.floor(cx), baseR = Math.floor(cy);
      let nearestDist = Infinity;
      for (let dr = -HEAR_RADIUS; dr <= HEAR_RADIUS; dr++) {
        const r = baseR + dr;
        for (let dc = -HEAR_RADIUS; dc <= HEAR_RADIUS; dc++) {
          const c = baseC + dc;
          if (!WaterSystem.isWater(c, r)) continue;
          const dist = Math.sqrt((c - cx) ** 2 + (r - cy) ** 2);
          if (dist < nearestDist) nearestDist = dist;
        }
      }

      const proximityT = nearestDist < HEAR_RADIUS ? 1 - (nearestDist / HEAR_RADIUS) : 0;
      audio.setVolume(Math.max(0, Math.min(1.0, zoomT * proximityT * VOL_MAX)));
    }
  };
})();

const WindmillAudio = (() => {
  let audio = null;
  return {
    start: () => {}, // tick() manages playback
    stop: () => { if (audio) { audio.stop(); audio = null; } },
    tick: (isPlaying = true) => {
      const hasWindmills = EntityRegistry.getByType(T.WIND).size > 0 || EntityRegistry.getByType(T.WIND2).size > 0 || EntityRegistry.getByType(T.WIND3).size > 0;
      if (!hasWindmills || !isPlaying) {
        if (audio) { audio.stop(); audio = null; }
        return;
      }
      if (!audio) {
        audio = makeSeamlessBed('audio/sfx/windmillaudio.mp3');
        audio.setVolume(0);
        audio.start();
      }
      const ZOOM_MIN = 0.25 * Math.pow(1.12, 2);
      const ZOOM_MAX = 3.0;
      const zoomT = Math.max(0, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN));

      const cx = (Camera.x + window.innerWidth  / 2 / Camera.zoom) / TILE;
      const cy = (Camera.y + window.innerHeight / 2 / Camera.zoom) / TILE;
      const HEAR_RADIUS = 40;
      let nearestDist = Infinity;
      for (const e of EntityRegistry.getByType(T.WIND)) {
        const dist = Math.sqrt((e.col - cx) ** 2 + (e.row - cy) ** 2);
        if (dist < nearestDist) nearestDist = dist;
      }
      for (const t of [T.WIND2, T.WIND3]) for (const e of EntityRegistry.getByType(t)) {
        const dist = Math.sqrt((e.col - cx) ** 2 + (e.row - cy) ** 2);
        if (dist < nearestDist) nearestDist = dist;
      }
      const proximityT = nearestDist < HEAR_RADIUS
        ? 1 - (nearestDist / HEAR_RADIUS)
        : 0;

      audio.setVolume(Math.max(0, Math.min(1.0, zoomT * proximityT * 0.36)));
    }
  };
})();

// ── Reel Audio (fishing charge-hold loop) ──────────────────────────
const ReelAudio = (() => {
  let audio = null;
  return {
    start: () => {
      if (audio) return;
      audio = makeSeamlessBed('audio/sfx/reel.wav');
      audio.setVolume(0.4);
      audio.start();
    },
    stop: () => { if (audio) { audio.stop(); audio = null; } }
  };
})();

// ── Reel-In Audio (minigame hold-to-reel loop) ─────────────────────
const ReelInAudio = (() => {
  let audio = null;
  return {
    start: () => {
      if (audio) return;
      audio = makeSeamlessBed('audio/sfx/reelin.mp3');
      audio.setVolume(0.5);
      audio.start();
    },
    stop: () => { if (audio) { audio.stop(); audio = null; } }
  };
})();

// ── SFX ────────────────────────────────────────────────────────────
const SFX = (() => {
  let _vol = 1.0;
  let _actx = null; // lazily-created AudioContext, used only by goodConnect's synthesized chime
  let _bus = null;  // gain node every looping bed feeds (see bus())
  let _bedsBus = null, _bedsMuted = false;   // every bed but the outdoor ambience (see bedsBus())
  let _lastBurnoutPlay = 0; // Date.now() of last burnout/blackout sound, for the 5s global cooldown

  // One-shots are fire-and-forget, which means nothing in the program holds
  // a reference to them while they play. A detached <audio> element in that
  // state can be garbage-collected MID-PLAYBACK, which cuts the sound off
  // partway through — invisible on a 0.2 s click, obvious on the 7 s
  // lightning crack, which is why that one sounded truncated while the file
  // itself is fine. Holding each element until it reports 'ended' keeps it
  // alive for its full length; the set empties itself as clips finish.
  const _playing = new Set();
  function _hold(a) {
    _playing.add(a);
    const _drop = () => _playing.delete(a);
    a.addEventListener('ended', _drop, { once: true });
    a.addEventListener('error', _drop, { once: true });
  }

  // Voice cap: at most MAX_SAME copies of one sample playing at once. Each
  // one-shot is its own <audio> element and they simply sum at the output,
  // so a burst of explosions (a meltdown's blast front, a storm's chain of
  // strikes) used to stack ten-plus copies of a loud 3-second sample and
  // clip hard enough to hurt speakers. Past the cap a request is dropped —
  // with that many already sounding, one more is inaudible anyway.
  const MAX_SAME = 3;
  const _srcKey = (src) => src.split('/').pop();
  // `rate` above 1 plays the sample higher and shorter (pitch not preserved).
  function play(src, volume = 1.0, rate = 1) {
    const key = _srcKey(src);
    let same = 0;
    for (const p of _playing) if (!p.paused && !p.ended && p.__key === key && ++same >= MAX_SAME) return;
    const a = new Audio(src);
    a.__key = key;
    a.volume = Math.min(1, volume * _vol);
    if (rate !== 1) { a.preservesPitch = false; a.playbackRate = rate; }
    _hold(a);
    a.play().catch(() => { _playing.delete(a); });
  }

  // Single-voice playback: while the previous clip under `key` is still
  // playing, further requests are dropped instead of stacking. Wiring up a
  // row of towers fires a spark per connection in quick succession, and
  // overlapping copies summed into one loud, harsh burst.
  const _exclusive = new Map();
  function playExclusive(key, src, volume = 1.0) {
    const cur = _exclusive.get(key);
    if (cur && !cur.ended && !cur.paused) return;
    const a = new Audio(src);
    a.volume = Math.min(1, volume * _vol);
    _hold(a);
    _exclusive.set(key, a);
    a.play().catch(() => { _playing.delete(a); if (_exclusive.get(key) === a) _exclusive.delete(key); });
  }

  // ── Alarm voices ──────────────────────────────────────────────────
  // The meltdown alarms are synthesized, and what makes a synthesized
  // alarm read as a real one is mostly where it seems to be: a horn on a
  // pole across a yard, not a tone inside the speaker. So every alarm voice
  // goes out through this bus, which adds two slap echoes off far walls and
  // a long dull tail.
  let _alarmBus = null, _noise = null;
  function _alarmOut(c) {
    if (_alarmBus && _alarmBus.context === c) return _alarmBus;
    const len = Math.round(c.sampleRate * 2.4), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += ((Math.random() * 2 - 1) * Math.pow(1 - t, 2.8) - lp) * (0.55 - 0.45 * t);   // darker as it decays
        d[i] = lp;
      }
      for (const [at, g] of [[0.17 + ch * 0.013, 0.9], [0.39 - ch * 0.017, 0.55]]) d[Math.round(at * c.sampleRate)] += g;
    }
    const input = c.createGain(), conv = c.createConvolver(), wet = c.createGain();
    conv.buffer = ir;
    wet.gain.value = 0.5;
    input.connect(c.destination);
    input.connect(conv); conv.connect(wet); wet.connect(c.destination);
    _alarmBus = input;
    return input;
  }
  function _noiseBuffer(c) {
    if (_noise && _noise.sampleRate === c.sampleRate) return _noise;
    _noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = _noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return _noise;
  }
  // One blast of a horn: two sawtooths a few Hz apart with a square an
  // octave under them, driven into a soft clip and out through the horn's
  // own resonance, which is what turns a buzz into a klaxon. f0 → f1 over
  // the blast gives a whoop.
  function _horn(c, t0, { f0, f1 = f0, dur, vol, tone = 1100, detune = 4 }) {
    const out = c.createGain(), drive = c.createWaveShaper(), body = c.createBiquadFilter(), top = c.createBiquadFilter();
    const curve = new Float32Array(257);
    for (let i = 0; i < 257; i++) curve[i] = Math.tanh((i / 128 - 1) * 2.5);
    drive.curve = curve;
    body.type = 'bandpass'; body.frequency.value = tone; body.Q.value = 0.8;
    top.type = 'lowpass'; top.frequency.value = tone * 3.2;
    for (const [type, mult, off, g] of [['sawtooth', 1, 0, 0.5], ['sawtooth', 1, detune, 0.5], ['square', 0.5, 0, 0.35]]) {
      const o = c.createOscillator(), og = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0 * mult + off, t0);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1 * mult + off, t0 + dur);
      og.gain.value = g;
      o.connect(og); og.connect(drive);
      o.start(t0); o.stop(t0 + dur + 0.05);
    }
    drive.connect(body); body.connect(top); top.connect(out);
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    out.gain.setValueAtTime(vol, t0 + dur - 0.03);
    out.gain.exponentialRampToValueAtTime(0.0005, t0 + dur + 0.04);
    out.connect(_alarmOut(c));
  }
  // A burst of filtered noise: a Geiger click at 2 ms, a relief valve at 200.
  function _noiseBurst(c, t0, { dur, vol, type = 'highpass', freq, q = 1, attack = 0.001 }) {
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = _noiseBuffer(c);
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    src.connect(f); f.connect(g); g.connect(_alarmOut(c));
    src.start(t0, Math.random() * 0.7); src.stop(t0 + dur + 0.02);
  }
  // The thud under an alarm, felt more than heard.
  function _subDrop(c, t0, { f0, f1, dur, vol }) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur + 0.05);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.1);
  }
  // One struck note: a sine with a quieter octave on top, fast attack and an
  // exponential ring-out. The building block of the UI chimes below; `out`
  // is where it lands (the alarm bus gives it a room, destination keeps it dry).
  function _bell(c, t0, out, { freq, dur, vol, type = 'sine', bright = 0.25 }) {
    for (const [m, a] of [[1, 1], [2, bright]]) {
      if (a <= 0) continue;
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.value = freq * m;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol * a, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
      o.connect(g); g.connect(out);
      o.start(t0); o.stop(t0 + dur + 0.05);
    }
  }
  // A band of noise swept from f0 to f1: a whoosh, rising or falling.
  function _whoosh(c, t0, { f0, f1, dur, vol, q = 2.5 }) {
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = _noiseBuffer(c);
    f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0);
    f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    src.connect(f); f.connect(g); g.connect(c.destination);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.02);
  }
  // A relay or breaker throwing: a dull knock, a bright contact tick on top
  // and a little thump under it.
  function _clunk(c, t0, v) {
    _noiseBurst(c, t0, { dur: 0.07, vol: v * 1.4, type: 'lowpass', freq: 520, q: 0.8, attack: 0.002 });
    _noiseBurst(c, t0 + 0.004, { dur: 0.02, vol: v * 0.5, type: 'bandpass', freq: 2600, q: 1.5 });
    _subDrop(c, t0, { f0: 95, f1: 52, dur: 0.2, vol: v * 1.1 });
  }
  // Machinery hum gliding from f0 to f1: a spool-up (rising) or a wind-down
  // (falling). A filtered sawtooth, so it reads as a motor, not a note.
  function _hum(c, t0, out, { f0, f1, dur, vol, cut = 600 }) {
    const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    lp.type = 'lowpass'; lp.frequency.value = cut;
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + Math.min(0.12, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0005, t0 + dur);
    o.connect(lp); lp.connect(g); g.connect(out);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  // Rate limit for the UI one-shots that can be fired in bursts (an invalid
  // drag across a row of tiles, holding Ctrl+Z). key → last performance.now().
  const _lastAt = new Map();
  function _cool(key, ms) {
    const now = performance.now(), t = _lastAt.get(key) || 0;
    if (now - t < ms) return false;
    _lastAt.set(key, now);
    return true;
  }

  // SFX at 0 is silence, whatever a sound does with the level on its own:
  // a gate in front of the speakers on the shared context (every Web Audio
  // sound, bed and synth goes through it), and the clips already playing
  // muted. Only shut or open, so the mix at any other level is unchanged.
  let _gate = null;
  function _applyMute() {
    const off = !(_vol > 0);
    if (_gate) _gate.gain.setTargetAtTime(off ? 0 : 1, _gate.context.currentTime, 0.02);
    for (const a of _playing) a.muted = off;
    for (const a of _exclusive.values()) a.muted = off;
  }

  return {
    setVolume: (v) => { _vol = v; _applyMute(); },
    getVolume: () => _vol,
    click:    () => play('audio/sfx/click.mp3', 0.4),
    unlock:   () => play('audio/sfx/unlock.mp3', 0.35),
    achievement: () => play('audio/sfx/achievement.mp3', 0.3),
    demolish: () => play('audio/sfx/delete.mp3', 0.5),
    request:     () => play('audio/sfx/request.mp3', 0.4),
    researchReady: () => play('audio/sfx/casual-click-pop-ui-3-262120.mp3', 0.15),
    amenityRequest: () => play('audio/sfx/notification_request.mp3', 0.35),
    houseIn:        () => play('audio/sfx/house-in.mp3', 0.4),
    bush:        () => play('audio/sfx/bush.mp3', 0.4),
    treecut:     () => play('audio/sfx/treecut.mp3', 0.2),
    // The page's one AudioContext, created on first use. Shared so the
    // synthesized chime below and FireAudio's looping bed don't each stand
    // up their own — browsers cap how many a page may open. Returns null
    // where Web Audio isn't available, so callers must fall back.
    context: () => {
      if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return null;
      if (!_actx) {
        _actx = new (window.AudioContext || window.webkitAudioContext)();
        // A limiter just under full scale in front of the speakers. The
        // Options sliders go up to ~1.43× the normal level, and the beds and
        // synthesized sounds summed at that can pass 0 dBFS; this holds the
        // peaks down rather than letting them clip. It sits above anything
        // the normal mix usually reaches, so at the usual levels it rarely acts.
        // Everything here connects to `destination`, so the context's own
        // property is pointed at the limiter.
        try {
          const lim = _actx.createDynamicsCompressor();
          lim.threshold.value = -1.5;
          lim.knee.value = 0;
          lim.ratio.value = 20;
          lim.attack.value = 0.002;
          lim.release.value = 0.2;
          lim.connect(_actx.destination);
          _gate = _actx.createGain();
          _gate.gain.value = _vol > 0 ? 1 : 0;
          _gate.connect(lim);
          Object.defineProperty(_actx, 'destination', { value: _gate });
        } catch (_e) {}
      }
      if (_actx.state === 'suspended') _actx.resume();
      return _actx;
    },
    // Shared output for the looping Web Audio beds, so the pause menu can
    // fade all of them together (PauseAudio). One-shot chimes skip it.
    bus: () => {
      const c = SFX.context();
      if (!c) return null;
      if (!_bus || _bus.context !== c) { _bus = c.createGain(); _bus.connect(c.destination); }
      return _bus;
    },
    // Every bed EXCEPT the general outdoor ambience feeds this, which feeds
    // bus() — so the pause menu's fade still covers everything, while this
    // stage can silence all the machinery, weather and city beds on its own
    // (after an Advanced Reactor has ended the run, only the wind is left).
    bedsBus: () => {
      const b = SFX.bus();
      if (!b) return null;
      if (!_bedsBus || _bedsBus.context !== b.context) { _bedsBus = b.context.createGain(); _bedsBus.connect(b); }
      return _bedsBus;
    },
    // Fade the non-ambience beds out (true) or back in (false). Idempotent.
    setBedsMuted: (m) => {
      m = !!m;
      if (m === _bedsMuted) return;
      _bedsMuted = m;
      _elementBedLevel = m ? 0 : 1;
      const b = SFX.bedsBus();
      if (b) b.gain.setTargetAtTime(m ? 0 : 1, b.context.currentTime, m ? 1.2 : 0.3);
    },
    // Power coming on: a relay closes and the load spools up behind it.
    goodConnect: (vol = 0.22) => {
      const c = SFX.context();
      if (!c) return;
      const now = c.currentTime, v = vol * 0.6;
      if (v <= 0) return;
      _clunk(c, now, v);
      _hum(c, now + 0.05, c.destination, { f0: 55, f1: 120, dur: 0.6, vol: v * 0.45, cut: 500 });
    },
    thump:    () => play('audio/sfx/thump.mp3', 0.55),
    // A Power Pole going in: the building thump, lighter and a little higher,
    // so a run of poles laid by dragging reads as posts, not buildings.
    polePlace: (v = 0.42) => play('audio/sfx/thump.mp3', v, 1.3),
    backfire: (v = 0.35) => play('audio/sfx/thump.mp3', v),
    // A direct hit on a building — the crack of the bolt landing, played
    // alongside the spark/thunder pair so the strike reads as close by.
    lightningStrike: (v = 0.7) => play('audio/sfx/lightningstrike.mp3', v),
    // A charged substation or battery bank letting go.
    lightningExplosion: (v = 0.8) => play('audio/sfx/lightningexplosion.mp3', v),
    // A Fuel/Coal Generator (or anything it chains into) blowing apart.
    generatorExplosion: (v = 0.9) => play('audio/sfx/explosion-425457.mp3', v),
    // One sounding of the meltdown alarm. MeltdownSystem sets the cadence
    // and passes how far the clock has run (`frac`, 0–1), which is what
    // makes it escalate rather than merely repeat faster.
    //
    // A generator gets a plant-floor klaxon: a two-tone falling blast. Past
    // 60% its relief valve starts screaming over it. A reactor gets the
    // rising whoop of a site evacuation alarm, with a Geiger counter
    // underneath that goes from the odd click to a crackle. Both grow a
    // thud under each sounding as the clock runs down.
    meltdownAlarm: (vol = 0.08, { reactor = false, frac = 0 } = {}) => {
      const c = SFX.context();
      if (!c) return;
      const now = c.currentTime, v = vol * _vol;
      if (v <= 0) return;
      if (reactor) {
        _horn(c, now, { f0: 520, f1: 1040, dur: 0.3, vol: v * 1.5, tone: 1300, detune: 6 });
        _horn(c, now, { f0: 347, f1: 694,  dur: 0.3, vol: v * 0.6, tone: 800,  detune: 3 });
        const clicks = Math.round(1 + frac * 11), spread = 0.3 + 0.6 * (1 - frac);
        for (let i = 0; i < clicks; i++) _noiseBurst(c, now + Math.random() * spread, { dur: 0.004, vol: v * (0.5 + 0.5 * Math.random()), freq: 1800, attack: 0.0004 });
      } else {
        _horn(c, now,        { f0: 392, dur: 0.15, vol: v * 1.5, tone: 1100 });
        _horn(c, now + 0.16, { f0: 311, dur: 0.15, vol: v * 1.5, tone: 1000 });
        if (frac > 0.6) _noiseBurst(c, now + 0.05, { dur: 0.22, vol: v * 0.9 * (frac - 0.6) / 0.4, type: 'bandpass', freq: 3200, q: 1.5, attack: 0.02 });
      }
      if (frac > 0.15) _subDrop(c, now, { f0: 58, f1: 36, dur: 0.22, vol: v * (0.6 + 1.8 * frac) });
    },
    // The Advanced Reactor's countdown. Lower and slower than
    // meltdownAlarm, with a sub-bass drop under it — it has to read as
    // "the run is ending" against a music bed, not as a UI blip. A deep
    // two-tone horn, doubled a fifth up so it carries on small speakers.
    doomAlarm: (vol = 0.12) => {
      const c = SFX.context();
      if (!c) return;
      const now = c.currentTime, v = vol * _vol;
      if (v <= 0) return;
      _horn(c, now,        { f0: 220, dur: 0.26, vol: v * 1.5, tone: 700, detune: 3 });
      _horn(c, now,        { f0: 330, dur: 0.26, vol: v * 0.5, tone: 900, detune: 5 });
      _horn(c, now + 0.28, { f0: 165, dur: 0.28, vol: v * 1.5, tone: 600, detune: 3 });
      _horn(c, now + 0.28, { f0: 247, dur: 0.28, vol: v * 0.5, tone: 800, detune: 5 });
      _subDrop(c, now, { f0: 70, f1: 28, dur: 0.85, vol: v * 1.6 });
    },
    // "Can't do that": a short, soft two-step buzz downward. Fired by every
    // refused placement, so it is kept quiet, dull and rate-limited — a drag
    // across a row of blocked tiles gives one, not twenty.
    error: (vol = 0.09) => {
      const c = SFX.context();
      if (!c || !_cool('error', 280)) return;
      const now = c.currentTime, v = vol * _vol;
      if (v <= 0) return;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(c.destination);
      _bell(c, now,        lp, { freq: 233, dur: 0.11, vol: v, type: 'square', bright: 0 });
      _bell(c, now + 0.09, lp, { freq: 185, dur: 0.16, vol: v, type: 'square', bright: 0 });
    },
    // Undo sweeps down, redo sweeps up: a short breath of air either way.
    undo: (vol = 0.3) => {
      const c = SFX.context();
      if (!c || !_cool('undo', 70)) return;
      _whoosh(c, c.currentTime, { f0: 2400, f1: 500, dur: 0.16, vol: vol * _vol });
    },
    redo: (vol = 0.3) => {
      const c = SFX.context();
      if (!c || !_cool('undo', 70)) return;
      _whoosh(c, c.currentTime, { f0: 500, f1: 2400, dur: 0.16, vol: vol * _vol });
    },
    // A meltdown pulled back: no fanfare, just the plant standing down — a
    // relief valve clunks shut over a long blow-off of steam, and the
    // machine's overdriven hum spools down under it.
    meltdownAverted: (vol = 0.14) => {
      const c = SFX.context();
      if (!c) return;
      const now = c.currentTime, v = vol * _vol;
      if (v <= 0) return;
      _noiseBurst(c, now, { dur: 0.08, vol: v * 1.4, type: 'lowpass', freq: 500, attack: 0.002 });
      _subDrop(c, now, { f0: 90, f1: 45, dur: 0.18, vol: v * 1.6 });
      _whoosh(c, now + 0.04, { f0: 3800, f1: 700, dur: 1.4, vol: v * 1.1, q: 0.9 });
      const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(140, now);
      o.frequency.exponentialRampToValueAtTime(48, now + 1.6);
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(700, now); lp.frequency.exponentialRampToValueAtTime(180, now + 1.6);
      g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(v * 0.5, now + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0005, now + 1.7);
      o.connect(lp); lp.connect(g); g.connect(c.destination);
      o.start(now); o.stop(now + 1.75);
    },
    // A contract paid out: a breaker closing (a dull clunk with a thump
    // under it), then a soft open chord swelling in. No third and no
    // arpeggio, so it reads as "job done" rather than a fanfare.
    contractComplete: (vol = 0.16) => {
      const c = SFX.context();
      if (!c) return;
      const now = c.currentTime, v = vol * _vol;
      if (v <= 0) return;
      const out = _alarmOut(c);
      _noiseBurst(c, now, { dur: 0.07, vol: v * 1.4, type: 'lowpass', freq: 520, q: 0.8 });
      _noiseBurst(c, now + 0.004, { dur: 0.02, vol: v * 0.5, type: 'bandpass', freq: 2600, q: 1.5 });
      _subDrop(c, now, { f0: 95, f1: 52, dur: 0.22, vol: v * 1.1 });
      // C3 · G3 · D4: a fifth with a ninth on top, slow to come in.
      const t0 = now + 0.09;
      for (const [f, a] of [[130.81, 1], [196.0, 0.8], [293.66, 0.55]]) {
        const o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        lp.type = 'lowpass'; lp.frequency.value = 1400;
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(v * 0.7 * a, t0 + 0.12);
        g.gain.exponentialRampToValueAtTime(0.0005, t0 + 1.8);
        o.connect(lp); lp.connect(g); g.connect(out);
        o.start(t0); o.stop(t0 + 1.85);
      }
    },
    // The other way: a breaker trips and the plant winds down in the room.
    failure: (vol = 0.15) => {
      const c = SFX.context();
      if (!c) return;
      const now = c.currentTime, v = vol * _vol;
      if (v <= 0) return;
      _clunk(c, now, v * 1.2);
      _hum(c, now + 0.02, _alarmOut(c), { f0: 120, f1: 38, dur: 1.5, vol: v * 0.6, cut: 450 });
      _subDrop(c, now + 0.1, { f0: 65, f1: 40, dur: 0.6, vol: v * 0.8 });
    },
    // Money in: a handful of coins — bright inharmonic pings (a struck
    // coin's partials don't line up), each with a tiny metallic tick.
    cash: (vol = 0.1) => {
      const c = SFX.context();
      if (!c || !_cool('cash', 150)) return;
      const now = c.currentTime, v = vol * _vol;
      if (v <= 0) return;
      for (let i = 0; i < 4; i++) {
        const t0 = now + i * 0.06 + Math.random() * 0.02, f = 2200 + Math.random() * 900;
        for (const [m, a] of [[1, 1], [2.76, 0.4], [5.4, 0.2]])
          _bell(c, t0, c.destination, { freq: f * m, dur: 0.25 + (i === 3 ? 0.3 : 0), vol: v * a * (i === 3 ? 1 : 0.7), bright: 0 });
        _noiseBurst(c, t0, { dur: 0.012, vol: v * 0.6, freq: 6000 });
      }
    },
    // A customer walking out on the grid: two low notes stepping down with
    // a soft knock under them, like a door shutting in another room. Losses
    // come in clusters, so one sounding covers a few seconds of them.
    customerLeft: (vol = 0.12) => {
      const c = SFX.context();
      if (!c || !_cool('customerLeft', 4000)) return;
      const now = c.currentTime, v = vol * _vol;
      if (v <= 0) return;
      _bell(c, now,        c.destination, { freq: 311.13, dur: 0.35, vol: v, type: 'triangle', bright: 0.1 });
      _bell(c, now + 0.16, c.destination, { freq: 233.08, dur: 0.6,  vol: v, type: 'triangle', bright: 0.1 });
      _subDrop(c, now + 0.16, { f0: 110, f1: 60, dur: 0.12, vol: v * 1.2 });
    },
    // A new season arriving: a gust of wind through the town, higher and
    // thinner in winter, warmer and lower in summer. idx 0..3 = spring..winter.
    season: (idx = 0, vol = 0.12) => {
      const c = SFX.context();
      if (!c) return;
      const v = vol * _vol;
      if (v <= 0) return;
      const [f0, f1] = [[500, 1400], [300, 800], [450, 900], [900, 2400]][((idx % 4) + 4) % 4];
      _whoosh(c, c.currentTime, { f0, f1, dur: 1.6, vol: v * 1.2, q: 0.7 });
    },
    // A town festival starting: fireworks going up somewhere across town.
    festival: (vol = 0.13) => {
      const c = SFX.context();
      if (!c) return;
      const now = c.currentTime, v = vol * _vol;
      if (v <= 0) return;
      for (const d of [0, 0.35, 0.55]) {
        _noiseBurst(c, now + d, { dur: 0.12, vol: v * 1.3, type: 'lowpass', freq: 900, attack: 0.002 });
        _subDrop(c, now + d, { f0: 80, f1: 40, dur: 0.25, vol: v * 1.2 });
        _noiseBurst(c, now + d + 0.05, { dur: 0.5, vol: v * 0.35, type: 'highpass', freq: 4000, attack: 0.02 });
      }
    },
    // A tutorial task done: a relay clicking over, nothing more.
    step: (vol = 0.1) => {
      const c = SFX.context();
      if (!c || !_cool('step', 400)) return;
      const now = c.currentTime, v = vol * _vol;
      if (v <= 0) return;
      _noiseBurst(c, now, { dur: 0.03, vol: v * 1.2, type: 'bandpass', freq: 1800, q: 1.2 });
      _noiseBurst(c, now + 0.06, { dur: 0.04, vol: v, type: 'lowpass', freq: 700 });
    },
    // A weather event rolling in. Storms get distant thunder; the slow
    // hazards (heatwave, cold snap, smog) one low horn from across town, the
    // pitch telling them apart. Gentle rain and snow pass without comment.
    weatherAlert: (type, vol = 0.12) => {
      if (type === 'storm' || type === 'rainstorm') { SFX.thunder(0.35); return; }
      if (type === 'blizzard') {
        const c = SFX.context();
        if (c) _whoosh(c, c.currentTime, { f0: 300, f1: 1400, dur: 1.8, vol: 0.18 * _vol, q: 0.8 });
        return;
      }
      if (type === 'geomag') {
        // A grid warning, not a show: two low klaxon blasts sagging in pitch
        // like a line browning out, each with a thud under it, over a dark
        // rush of solar wind and transformers groaning under induced
        // current, with crackles off the lines.
        const c = SFX.context();
        if (!c) return;
        const now = c.currentTime, v = vol * _vol;
        if (v <= 0) return;
        _whoosh(c, now, { f0: 180, f1: 520, dur: 2.8, vol: v * 0.9, q: 0.9 });
        for (const d of [0.15, 1.0]) {
          _horn(c, now + d, { f0: 196, f1: 164, dur: 0.65, vol: v * 0.7, tone: 520, detune: 3 });
          _subDrop(c, now + d, { f0: 70, f1: 38, dur: 0.5, vol: v * 1.1 });
        }
        _hum(c, now, c.destination, { f0: 60, f1: 45, dur: 2.6, vol: v * 0.5, cut: 360 });
        for (const d of [0.3, 0.34, 0.9, 1.45, 1.5, 2.0]) _noiseBurst(c, now + d, { dur: 0.04, vol: v * 0.7, type: 'highpass', freq: 3200 });
        return;
      }
      if (type !== 'heatwave' && type !== 'coldsnap' && type !== 'smog') return;
      const c = SFX.context();
      if (!c) return;
      const now = c.currentTime, v = vol * _vol;
      if (v <= 0) return;
      if (type === 'heatwave') {
        // Cicadas buzzing in the heat over transformers humming under load.
        const n = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
        const lfo = c.createOscillator(), lg = c.createGain();
        n.buffer = _noiseBuffer(c);
        bp.type = 'bandpass'; bp.frequency.value = 5200; bp.Q.value = 6;
        lfo.frequency.value = 38; lg.gain.value = v * 0.6;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(v * 0.7, now + 0.6);
        g.gain.linearRampToValueAtTime(0, now + 2.2);
        lfo.connect(lg); lg.connect(g.gain);
        n.connect(bp); bp.connect(g); g.connect(c.destination);
        n.start(now, Math.random() * 0.5); n.stop(now + 2.3); lfo.start(now); lfo.stop(now + 2.3);
        _hum(c, now, c.destination, { f0: 100, f1: 100, dur: 2.2, vol: v * 0.35, cut: 400 });
        return;
      }
      if (type === 'coldsnap') {
        // Ice cracking under a thin, cold wind.
        _whoosh(c, now, { f0: 1200, f1: 2600, dur: 1.8, vol: v * 0.8, q: 1.2 });
        for (const d of [0.15, 0.5, 0.62, 1.05]) {
          _noiseBurst(c, now + d, { dur: 0.03, vol: v * 1.3, type: 'highpass', freq: 2500, attack: 0.0005 });
          _noiseBurst(c, now + d, { dur: 0.06, vol: v * 0.8, type: 'lowpass', freq: 400, attack: 0.001 });
        }
        return;
      }
      _horn(c, now, { f0: 165, dur: 0.9, vol: v * 0.8, tone: 600, detune: 4 });
    },
    // Induced current tripping lines in a geomagnetic storm: the breaker
    // throwing, a short ugly buzz of arc before it clears, and static
    // spitting off the line after. Rate-limited, as trips come in clusters.
    geomagSurge: (vol = 0.14) => {
      const c = SFX.context();
      if (!c || !_cool('geomagSurge', 1500)) return;
      const now = c.currentTime, v = vol * _vol;
      if (v <= 0) return;
      // The arc: a 120 Hz buzz, harsh and narrow, stuttering out.
      const o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = 120;
      bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.6;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(v * 0.9, now + 0.01);
      for (let i = 1; i < 9; i++) g.gain.setValueAtTime(v * (0.9 - i * 0.09) * (i % 2 ? 0.35 : 1), now + i * 0.045);
      g.gain.exponentialRampToValueAtTime(0.0005, now + 0.45);
      o.connect(bp); bp.connect(g); g.connect(_alarmOut(c));
      o.start(now); o.stop(now + 0.5);
      _clunk(c, now + 0.4, v * 1.1);
      for (const d of [0.5, 0.56, 0.8, 1.1]) _noiseBurst(c, now + d, { dur: 0.03, vol: v * 0.5, type: 'highpass', freq: 3000 });
    },
    spark:    () => playExclusive('spark', 'audio/sfx/spark.mp3', 0.4),
    // A storage substation reaching full: a quick charging whine, then a
    // relay clicks over and the bank settles into a hum. tier 1..5 sets the
    // pitch (bigger is lower); MK4/MK5 add a sub swell under it.
    storeCharged: (vol = 0.3, tier = 1) => {
      const c = SFX.context();
      if (!c) return;
      const v = vol * _vol * 0.35;
      if (v <= 0.002) return;
      const now = c.currentTime, base = 660 / Math.pow(1.19, tier - 1);
      const out = c.createGain(); out.gain.value = 1; out.connect(_alarmOut(c));
      // the sweep
      const sw = c.createOscillator(), sg = c.createGain();
      sw.type = 'triangle';
      sw.frequency.setValueAtTime(base * 0.25, now);
      sw.frequency.exponentialRampToValueAtTime(base, now + 0.35);
      sg.gain.setValueAtTime(0, now); sg.gain.linearRampToValueAtTime(v * 0.6, now + 0.05);
      sg.gain.exponentialRampToValueAtTime(0.0005, now + 0.42);
      sw.connect(sg); sg.connect(out); sw.start(now); sw.stop(now + 0.45);
      // the relay, then the bank's hum settling
      _clunk(c, now + 0.34, v * 0.9);
      _hum(c, now + 0.34, out, { f0: base * 0.18, f1: base * 0.15, dur: 0.8 + tier * 0.2, vol: v * 0.6, cut: 500 });
      if (tier >= 4) _subDrop(c, now + 0.3, { f0: 55, f1: 41, dur: 1.2, vol: v * 1.2 });
    },
    fusionPulse: (v = 0.5) => playExclusive('fusionPulse', 'audio/sfx/pulse.mp3', v),
    // A Fusion Reactor's startup surge (FusionStartupAudio), `secs` long:
    // heavy plant, not a sci-fi charge-up. The magnets drawing current as a
    // pressure under everything, two coil whines a hair apart climbing
    // slowly so they beat against each other, and the cryogenics' hiss
    // opening up. No notes. `adv` (the Advanced reactor) sits lower.
    // Returns { stop } so a surge that browns out can fade away.
    fusionSpool: (vol, secs, adv) => {
      const c = SFX.context();
      if (!c) return null;
      const v = vol * _vol;
      if (v <= 0.002) return null;
      const now = c.currentTime, end = now + secs, k = adv ? 0.78 : 1;
      const out = c.createGain();
      out.gain.setValueAtTime(0, now);
      out.gain.linearRampToValueAtTime(1, now + Math.min(1.4, secs * 0.35));
      out.connect(_alarmOut(c));
      const stops = [];
      const osc = (type, f0, f1, g0, g1, dest) => {
        const o = c.createOscillator(), g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(f1, end);
        g.gain.setValueAtTime(g0, now); g.gain.linearRampToValueAtTime(g1, end);
        o.connect(g); g.connect(dest);
        o.start(now); o.stop(end + 0.6); stops.push(o);
      };
      // the magnets: a sub you feel rising
      osc('sine', 27 * k, 49 * k, v * 0.25, v * 1.0, out);
      // the weight of it: a heavy rotor winding up, a low sawtooth under a
      // lowpass that opens as it comes up to speed
      const rotor = c.createBiquadFilter(); rotor.type = 'lowpass'; rotor.Q.value = 1.1;
      rotor.frequency.setValueAtTime(150 * k, now); rotor.frequency.exponentialRampToValueAtTime(520 * k, end);
      rotor.connect(out);
      osc('sawtooth', 21 * k, 84 * k, v * 0.12, v * 0.5, rotor);
      osc('sawtooth', 21.3 * k, 84.9 * k, v * 0.08, v * 0.3, rotor);
      // the coils: two triangles beating, kept dark
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
      lp.frequency.setValueAtTime(700 * k, now); lp.frequency.exponentialRampToValueAtTime(1900 * k, end);
      lp.connect(out);
      osc('triangle', 118 * k, 352 * k, v * 0.05, v * 0.2, lp);
      osc('triangle', 119.4 * k, 356.2 * k, v * 0.05, v * 0.18, lp);
      // the cryogenics: hiss opening up
      const n = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain();
      n.buffer = _noiseBuffer(c); n.loop = true;
      bp.type = 'bandpass'; bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(260 * k, now); bp.frequency.exponentialRampToValueAtTime(1500 * k, end);
      ng.gain.setValueAtTime(v * 0.05, now); ng.gain.linearRampToValueAtTime(v * 0.32, end);
      n.connect(bp); bp.connect(ng); ng.connect(out);
      n.start(now); n.stop(end + 0.6); stops.push(n);
      // and it holds there until it lights (or is let go)
      out.gain.setValueAtTime(1, end);
      out.gain.linearRampToValueAtTime(0, end + 0.5);
      return {
        stop(fade = 0.45) {
          const t = c.currentTime;
          out.gain.cancelScheduledValues(t);
          out.gain.setValueAtTime(out.gain.value, t);
          out.gain.linearRampToValueAtTime(0, t + fade);
          for (const s of stops) { try { s.stop(t + fade + 0.05); } catch (_e) {} }
        },
      };
    },
    // The reactor coming online: contactors slamming shut, a deep drop as
    // the plasma lights and takes the load, a low pressure wave through the
    // hall, and a dark mains hum settling under it into the running bed.
    fusionOnline: (vol, adv) => {
      const c = SFX.context();
      if (!c) return;
      const v = vol * _vol;
      if (v <= 0.002) return;
      const now = c.currentTime, k = adv ? 0.78 : 1;
      _clunk(c, now, v * 0.9);
      _clunk(c, now + 0.12, v * 0.55);
      _subDrop(c, now + 0.03, { f0: 64 * k, f1: 29 * k, dur: adv ? 3.2 : 2.6, vol: v * 1.3 });
      _noiseBurst(c, now + 0.03, { dur: adv ? 2.0 : 1.6, vol: v * 0.55, type: 'lowpass', freq: 380 * k, q: 0.7, attack: 0.012 });
      _noiseBurst(c, now + 0.05, { dur: 0.5, vol: v * 0.18, type: 'bandpass', freq: 900 * k, q: 0.8, attack: 0.02 });
      _hum(c, now + 0.2, _alarmOut(c), { f0: 61 * k, f1: 55 * k, dur: adv ? 4.2 : 3.4, vol: v * 0.3, cut: 260 * k });
    },
    burnout:  (v = 0.4) => {
      const now = Date.now();
      if (_lastBurnoutPlay && now - _lastBurnoutPlay < 5000) return;
      _lastBurnoutPlay = now;
      play('audio/sfx/burnout.mp3', v);
    },
    thunder:  (v = 0.5) => {
      const idx = 1 + Math.floor(Math.random() * 5);
      const a = new Audio(`audio/sfx/thunder${idx}.mp3`);
      const targetVol = Math.min(1, v * _vol);
      a.volume = targetVol;
      _hold(a);
      a.play().catch(() => { _playing.delete(a); });
      const FADE = 0.5; // seconds
      a.addEventListener('timeupdate', () => {
        if (!a.duration || !isFinite(a.duration)) return;
        const remaining = a.duration - a.currentTime;
        if (remaining < FADE) {
          a.volume = Math.max(0, targetVol * (remaining / FADE));
        }
      });
    },
    popup:    () => {},
    cast:     () => play('audio/sfx/fishing-rod-whoosh-411640.mp3', 0.5),
    splash:   () => play('audio/sfx/dropinwater.wav', 0.5),
  };
})();
