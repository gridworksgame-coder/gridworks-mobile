/* ═══════════════════════════════════════════════════════════════════
   OUTDOOR AMBIENCE — birds, insects, frogs and the small sounds of town
   One-off calls laid quietly over the existing beds (general ambience,
   neighbourhood, city, industry, night): a robin, a crow across the
   fields, crickets after dark, peepers by the water in spring, a dog a few
   streets over, wind chimes on a porch, a clank from the yards.

   Everything is synthesized here with Web Audio (no files), from what the
   real call is made of: a whistled pitch contour for songbirds, a buzzy
   formant for crows and ducks, a pulsed carrier for crickets, struck
   inharmonic partials for chimes, bells and metal. Each call gets a place:
   panned to where it is in the view, quieter, darker and wetter the
   further off it is.

   What sounds, and how often, is read every couple of seconds from:
     • the clock — a dawn chorus, songbirds by day, owls, crickets and frogs
       by night, mowers and reversing beepers only in working hours;
     • the season and the temperature — no insects in the cold, peepers in
       spring, cicadas on hot summer days, geese in autumn, chickadees and
       crows through winter (with seasons off, a mild in-between year);
     • the weather — rain and storms quiet the birds and wake the frogs;
     • what is under the camera — trees, water, open grass and each zone:
       residential (dogs, chimes, mowers, doves), commercial (pigeons,
       sparrows, a car horn), industrial (crows, gulls, clanks, beepers),
       the government district (a bell on the quarter-day hours);
     • the zoom — fewer and quieter calls from high up.
   The flocks and animals actually on screen (BirdFlocks, Wildlife) call
   from where they are: geese honk as they pass over, ducks quack, a fox
   barks at night.

   All of it is deliberately sparse and low: one-shots go through a single
   gain into SFX.bedsBus(), so the pause menu fades it with the other beds
   and it falls silent with them after an Advanced Reactor ends the run.
   Ticked from GameLoop._tickPresentation.
   ═══════════════════════════════════════════════════════════════════ */
const OutdoorAmbience = (() => {
  const MASTER     = 0.3;    // under everything else in the mix
  const MAX_VOICES = 4;      // calls sounding at once
  const RATE       = 0.6;    // on every rate in TABLE: how busy it all is
  const SAMPLE_EVERY = 1.5;  // seconds between reads of the scene
  // Birds, insects, frogs and the rest of the wildlife sit a quarter below the level
  // of the town's own sounds (they are far more frequent, and were too loud).
  const ANIMAL_LEVEL = 0.75;
  const TOWN_CALLS = new Set(['chimes', 'mower', 'horn', 'clank', 'beeper', 'bell']);
  let callLevel = 1;         // level of the call being built (set in _play, read in _out)

  let c = null, master = null, verb = null, noiseBuf = null;
  let lastNow = 0, sampleIn = 0, animalsIn = 0, scene = null;
  let lastBellHour = -1;
  const recent = [];                          // the last calls made, newest last (dev)
  const voices = [];                          // end times (context seconds) of calls sounding
  const _timers = new WeakMap();              // flock / animal -> seconds until it may call again

  const rand  = (a, b) => a + Math.random() * (b - a);
  const irand = (a, b) => Math.floor(rand(a, b + 1));
  const pick  = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ── Audio plumbing ────────────────────────────────────────────────
  function _setup() {
    const ctx = typeof SFX !== 'undefined' && SFX.context ? SFX.context() : null;
    const bus = ctx && SFX.bedsBus ? SFX.bedsBus() : null;
    if (!ctx || !bus) return false;
    if (c === ctx && master) return true;
    c = ctx;
    master = c.createGain(); master.gain.value = 0; master.connect(bus);
    // Open air: a short, soft, dark tail, a little longer on the right.
    const len = Math.round(c.sampleRate * 2.2), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += ((Math.random() * 2 - 1) * Math.pow(1 - t, 3 + ch * 0.4) - lp) * (0.5 - 0.4 * t);
        d[i] = lp * (i < c.sampleRate * 0.012 ? i / (c.sampleRate * 0.012) : 1);
      }
    }
    verb = c.createConvolver(); verb.buffer = ir; verb.connect(master);
    noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return true;
  }

  // One call's way out: its level, how far off it is (quieter, duller,
  // wetter), and where it sits left to right. `far` puts it beyond the view.
  // `track` false: part of a chorus already counted as one voice.
  function _out(t0, dur, pos, vol, track = true) {
    const v = scene.view;
    const dx = (pos.x - v.cx) / (v.w / 2), dy = (pos.y - v.cy) / (v.h / 2);
    const d = clamp(Math.hypot(dx, dy) / 1.6 + (pos.far ? 0.35 : 0), 0, 1);
    const g = c.createGain(); g.gain.value = vol * callLevel * (1 - 0.55 * d);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = (pos.far ? 2600 : 12000) * (1 - 0.6 * d) + 900;
    g.connect(lp);
    let tail = lp;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner(); p.pan.value = clamp(dx * 0.75, -0.85, 0.85);
      lp.connect(p); tail = p;
    }
    tail.connect(master);
    const send = c.createGain(); send.gain.value = 0.1 + 0.35 * d + (pos.far ? 0.25 : 0);
    tail.connect(send); send.connect(verb);
    if (track) voices.push(t0 + dur);
    setTimeout(() => { try { g.disconnect(); lp.disconnect(); tail.disconnect(); send.disconnect(); } catch (_e) {} },
      (t0 - c.currentTime + dur + 3) * 1000);
    return g;
  }

  // A smooth pitch contour from [[0..1, hz], ...] points, for setValueCurveAtTime.
  function _curve(pts, n = 32) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      let k = 1; while (k < pts.length - 1 && pts[k][0] < u) k++;
      const [u0, f0] = pts[k - 1], [u1, f1] = pts[k];
      const s = u1 > u0 ? clamp((u - u0) / (u1 - u0), 0, 1) : 1;
      out[i] = f0 + (f1 - f0) * (0.5 - 0.5 * Math.cos(Math.PI * s));
    }
    return out;
  }
  // Attack, hold, release on a gain param.
  function _env(param, t0, dur, peak, a = 0.01, r = 0.05) {
    param.setValueAtTime(0, t0);
    param.linearRampToValueAtTime(peak, t0 + Math.min(a, dur * 0.5));
    param.setValueAtTime(peak, t0 + Math.max(a, dur - r));
    param.linearRampToValueAtTime(0, t0 + dur);
  }
  // An oscillator following a pitch contour (a number for a steady pitch).
  function _tone(dest, t0, dur, pitch, { type = 'sine', vol = 1, a = 0.01, r = 0.04, vib = 0, vibHz = 0 } = {}) {
    const o = c.createOscillator(); o.type = type;
    if (typeof pitch === 'number') o.frequency.value = pitch;
    else o.frequency.setValueCurveAtTime(_curve(pitch), t0, dur);
    const g = c.createGain(); _env(g.gain, t0, dur, vol, a, r);
    o.connect(g); g.connect(dest);
    if (vib) {
      const l = c.createOscillator(), lg = c.createGain();
      l.frequency.value = vibHz; lg.gain.value = vib; l.connect(lg); lg.connect(o.frequency);
      l.start(t0); l.stop(t0 + dur + 0.05);
    }
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }
  // A burst of filtered noise.
  function _hiss(dest, t0, dur, { f = 2000, q = 1, vol = 1, a = 0.003, r = 0.02, type = 'bandpass' } = {}) {
    const s = c.createBufferSource(); s.buffer = noiseBuf;
    const bp = c.createBiquadFilter(); bp.type = type; bp.frequency.value = f; bp.Q.value = q;
    const g = c.createGain(); _env(g.gain, t0, dur, vol, a, r);
    s.connect(bp); bp.connect(g); g.connect(dest);
    s.start(t0, Math.random() * 1.5, dur + 0.05);
  }
  // A resonant filter in front of `dest`: the throat or horn of a voice.
  function _formant(dest, f, q, gain = 1) {
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
    const g = c.createGain(); g.gain.value = gain;
    bp.connect(g); g.connect(dest);
    return bp;
  }
  // A struck thing: a few sine partials, each dying away at its own rate.
  function _strike(dest, t0, f, partials, vol) {
    for (const [ratio, amp, decay] of partials) {
      const o = c.createOscillator(); o.frequency.value = f * ratio;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol * amp, t0 + 0.004);
      g.gain.setTargetAtTime(0, t0 + 0.004, decay / 4);
      o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + decay + 0.1);
    }
  }

  // ── The calls ─────────────────────────────────────────────────────
  // Each takes a start time and a place, and returns how long it lasts.
  const CALLS = {
    // Robin: phrases of two or three rich, rising-and-falling whistles.
    robin(t0, pos) {
      const out = _out(t0, 4, pos, 0.32);
      let t = t0;
      for (let p = irand(2, 4); p > 0; p--) {
        for (let n = irand(2, 3); n > 0; n--) {
          const f = rand(2100, 3000), d = rand(0.13, 0.2);
          _tone(out, t, d, [[0, f * 0.85], [0.4, f * 1.12], [1, f * 0.9]], { vol: 1, r: 0.05 });
          _tone(out, t, d, [[0, f * 1.7], [0.4, f * 2.24], [1, f * 1.8]], { vol: 0.12, r: 0.05 });
          t += d + rand(0.03, 0.07);
        }
        t += rand(0.25, 0.5);
      }
      return t - t0;
    },
    // Cardinal: a run of clear down-slurred "birdy" whistles, or rising "cheers".
    cardinal(t0, pos) {
      const out = _out(t0, 3, pos, 0.3), up = Math.random() < 0.35;
      let t = t0;
      for (let n = irand(3, 6); n > 0; n--) {
        const d = up ? 0.3 : 0.2;
        _tone(out, t, d, up ? [[0, 1700], [0.6, 3300], [1, 3000]] : [[0, 4300], [1, 1900]], { vol: 1, a: 0.02 });
        t += d + rand(0.06, 0.12);
      }
      return t - t0;
    },
    // Wren: a fast, bright trill that wanders down.
    wren(t0, pos) {
      const out = _out(t0, 3, pos, 0.22);
      let t = t0, f = rand(5000, 6200);
      for (let n = irand(10, 20); n > 0; n--) {
        _tone(out, t, 0.045, [[0, f * 1.06], [1, f * 0.9]], { vol: 1, a: 0.004, r: 0.015 });
        t += 0.06; f *= rand(0.975, 0.995);
      }
      return t - t0;
    },
    // Warbler: a buzzy series climbing to a high finish.
    warbler(t0, pos) {
      const out = _out(t0, 3, pos, 0.18);
      let t = t0;
      const n = irand(5, 8);
      for (let i = 0; i < n; i++) {
        const f = 3800 + (i / n) * 2200;
        _tone(out, t, 0.09, [[0, f], [1, f * 1.04]], { vol: 1, vib: 260, vibHz: 75, a: 0.006 });
        t += 0.13;
      }
      return t - t0;
    },
    // Chickadee: the two-note "fee-bee", or the "chick-a-dee-dee-dee".
    chickadee(t0, pos) {
      const out = _out(t0, 3, pos, 0.28);
      if (Math.random() < 0.55) {
        _tone(out, t0, 0.32, [[0, 4000], [1, 3900]], { a: 0.03, r: 0.08 });
        _tone(out, t0 + 0.42, 0.36, [[0, 3420], [1, 3300]], { a: 0.03, r: 0.1 });
        return 0.8;
      }
      _tone(out, t0, 0.05, [[0, 6500], [1, 5200]], { vol: 0.8, a: 0.003 });
      _tone(out, t0 + 0.08, 0.045, [[0, 7200], [1, 6000]], { vol: 0.6, a: 0.003 });
      let t = t0 + 0.18;
      for (let n = irand(2, 4); n > 0; n--) { _tone(out, t, 0.13, 3600, { vol: 0.7, vib: 220, vibHz: 110 }); t += 0.17; }
      return t - t0;
    },
    // House sparrow: a few scattered cheerful chirps.
    sparrow(t0, pos) {
      const out = _out(t0, 3, pos, 0.2);
      let t = t0;
      for (let n = irand(2, 6); n > 0; n--) {
        const f = rand(3600, 5200);
        _tone(out, t, 0.07, [[0, f * 1.2], [0.5, f], [1, f * 0.75]], { a: 0.004, r: 0.02 });
        t += rand(0.12, 0.45);
      }
      return t - t0;
    },
    // Songbirds overhead: high, quick twitters.
    twitter(t0, pos) {
      const out = _out(t0, 2, pos, 0.16);
      let t = t0;
      for (let n = irand(3, 8); n > 0; n--) {
        const f = rand(4500, 7000);
        _tone(out, t, 0.04, [[0, f], [1, f * rand(0.8, 1.15)]], { a: 0.003, r: 0.015 });
        t += rand(0.05, 0.22);
      }
      return t - t0;
    },
    // Mourning dove: the soft, hollow "coo-OO-oo, oo, oo".
    dove(t0, pos) {
      const out = _out(t0, 4, pos, 0.3), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1100; lp.connect(out);
      const notes = [[0.35, [[0, 470], [0.5, 560], [1, 520]], 0.1], [0.7, [[0, 560], [0.3, 600], [1, 470]], 0.3],
                     [0.45, [[0, 470], [1, 440]], 0.22], [0.45, [[0, 470], [1, 440]], 0.22], [0.45, [[0, 465], [1, 435]], 0]];
      let t = t0;
      for (const [d, pc, gap] of notes) {
        _tone(lp, t, d, pc, { a: 0.08, r: 0.14 });
        _tone(lp, t, d, pc.map(([u, f]) => [u, f * 2]), { vol: 0.07, a: 0.08, r: 0.14 });
        t += d + gap;
      }
      return t - t0;
    },
    // Pigeon: a low, rolling "crr-oo-oo".
    pigeon(t0, pos) {
      const out = _out(t0, 3, pos, 0.35), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(out);
      let t = t0;
      for (let n = irand(1, 2); n > 0; n--) {
        _tone(lp, t, 0.95, [[0, 320], [0.3, 410], [0.65, 395], [1, 320]], { type: 'triangle', a: 0.1, r: 0.2, vib: 14, vibHz: 17 });
        t += 1.2;
      }
      return t - t0;
    },
    // Crow: two to four harsh, falling caws.
    crow(t0, pos) {
      const out = _out(t0, 3, pos, 0.2);
      const f1 = _formant(out, 1300, 1.3, 1), f2 = _formant(out, 2500, 2.2, 0.6);
      let t = t0;
      const base = rand(560, 680);
      for (let n = irand(2, 4); n > 0; n--) {
        const pc = [[0, base], [0.25, base * 1.1], [1, base * 0.82]];
        _tone(f1, t, 0.3, pc, { type: 'sawtooth', a: 0.02, r: 0.08 });
        _tone(f2, t, 0.3, pc, { type: 'sawtooth', a: 0.02, r: 0.08 });
        _hiss(out, t, 0.28, { f: 1600, q: 1.2, vol: 0.25 });
        t += 0.3 + rand(0.28, 0.45);
      }
      return t - t0;
    },
    // Gull: a long rising-falling "kee-ow", then a laughing run.
    gull(t0, pos) {
      const out = _out(t0, 3, pos, 0.16), f = _formant(out, 1800, 1.4, 1.2);
      _tone(f, t0, 0.5, [[0, 900], [0.35, 1800], [1, 1200]], { type: 'sawtooth', a: 0.03, r: 0.1 });
      let t = t0 + 0.65;
      for (let n = irand(3, 6); n > 0; n--) { _tone(f, t, 0.12, [[0, 1550], [1, 1250]], { type: 'sawtooth', a: 0.01, r: 0.04 }); t += 0.19; }
      return t - t0;
    },
    // Woodpecker: a quick drum on a dead branch, slowing at the end.
    woodpecker(t0, pos) {
      const out = _out(t0, 3, pos, 0.35);
      let t = t0;
      const n = irand(14, 24), body = rand(600, 900);
      for (let k = 0; k < n; k++) {
        _hiss(out, t, 0.014, { f: 1000, q: 5, vol: 1, a: 0.001, r: 0.01 });
        _tone(out, t, 0.035, body, { vol: 0.35, a: 0.001, r: 0.03 });
        t += 0.05 + 0.025 * (k / n);
      }
      return t - t0;
    },
    // Owl: a great horned owl's deep "hoo, h'hoo, hoo, hoo", or a barred
    // owl's "who cooks for you".
    owl(t0, pos) {
      const out = _out(t0, 5, pos, 0.38), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 800; lp.connect(out);
      let t = t0;
      if (Math.random() < 0.65) {
        const f = rand(290, 340);
        for (const [d, gap] of [[0.38, 0.22], [0.12, 0.06], [0.26, 0.36], [0.45, 0.3], [0.45, 0]]) {
          _tone(lp, t, d, [[0, f * 0.94], [0.3, f * 1.03], [1, f * 0.97]], { a: 0.06, r: 0.12 });
          t += d + gap;
        }
      } else {
        const f = rand(380, 430);
        for (const [d, k, gap] of [[0.2, 1.1, 0.06], [0.2, 1.2, 0.06], [0.2, 1.15, 0.06], [0.35, 1.0, 0.45],
                                   [0.2, 1.1, 0.06], [0.2, 1.2, 0.06], [0.2, 1.15, 0.06], [0.75, 1.1, 0]]) {
          _tone(lp, t, d, gap ? f * k : [[0, f * 1.2], [1, f * 0.72]], { a: 0.04, r: 0.08, vib: 6, vibHz: 6 });
          t += d + gap;
        }
      }
      return t - t0;
    },
    // Crickets: a few of them chirping together for a while. The rate
    // follows the temperature, as real ones do (Dolbear's law).
    crickets(t0, pos) {
      const D = rand(7, 14), tf = scene.temp * 1.8 + 32;
      const period = 60 / clamp(4 * (tf - 50) + 40, 40, 180);
      for (let k = irand(2, 4); k > 0; k--) {
        const p = { x: pos.x + rand(-1, 1) * scene.view.w * 0.3, y: pos.y + rand(-1, 1) * scene.view.h * 0.3 };
        const out = _out(t0, D, p, 0.07, k === 1);
        const o = c.createOscillator(); o.frequency.value = rand(4300, 4900);
        const g = c.createGain(); g.gain.value = 0;
        o.connect(g); g.connect(out);
        const per = period * rand(0.93, 1.07);
        for (let t = rand(0, per); t < D - 0.2; t += per) {
          const lvl = Math.sin(Math.PI * t / D);
          for (let s = 0; s < 3; s++) {
            const ts = t0 + t + s * 0.032;
            g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(lvl, ts + 0.004);
            g.gain.setValueAtTime(lvl, ts + 0.016); g.gain.linearRampToValueAtTime(0, ts + 0.02);
          }
        }
        o.start(t0); o.stop(t0 + D);
      }
      return D;
    },
    // Spring peepers: a chorus of short rising peeps by the water.
    peepers(t0, pos) {
      const D = rand(6, 11);
      for (let k = irand(3, 6); k > 0; k--) {
        const p = { x: pos.x + rand(-1, 1) * scene.view.w * 0.2, y: pos.y + rand(-1, 1) * scene.view.h * 0.2 };
        const out = _out(t0, D, p, 0.06, k === 1);
        const o = c.createOscillator(), g = c.createGain(), lo = rand(2400, 2700);
        g.gain.value = 0; o.connect(g); g.connect(out);
        for (let t = rand(0, 1); t < D - 0.3; t += rand(0.8, 1.6)) {
          const ts = t0 + t, lvl = Math.sin(Math.PI * t / D);
          o.frequency.setValueAtTime(lo, ts); o.frequency.linearRampToValueAtTime(lo * 1.18, ts + 0.12);
          g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(lvl, ts + 0.02);
          g.gain.setValueAtTime(lvl, ts + 0.09); g.gain.linearRampToValueAtTime(0, ts + 0.13);
        }
        o.start(t0); o.stop(t0 + D);
      }
      return D;
    },
    // Bullfrog: a few deep "rumm"s.
    bullfrog(t0, pos) {
      const out = _out(t0, 4, pos, 0.4), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 520; lp.connect(out);
      let t = t0;
      for (let n = irand(2, 4); n > 0; n--) {
        _tone(lp, t, 0.6, [[0, 105], [0.3, 128], [1, 98]], { type: 'sawtooth', a: 0.05, r: 0.15, vib: 8, vibHz: 28 });
        t += 0.6 + rand(0.4, 0.7);
      }
      return t - t0;
    },
    // Cicada: a dry buzz that swells and dies away in the summer heat.
    cicada(t0, pos) {
      const D = rand(5, 9), out = _out(t0, D, pos, 0.1);
      const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rand(4400, 5400); bp.Q.value = 2.5;
      const am = c.createGain(); am.gain.value = 0.55;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = rand(160, 220); lg.gain.value = 0.45;
      lfo.connect(lg); lg.connect(am.gain);
      const env = c.createGain();
      env.gain.setValueAtTime(0, t0); env.gain.linearRampToValueAtTime(1, t0 + D * 0.4);
      env.gain.setValueAtTime(1, t0 + D * 0.7); env.gain.linearRampToValueAtTime(0, t0 + D);
      s.connect(bp); bp.connect(am); am.connect(env); env.connect(out);
      s.start(t0); s.stop(t0 + D); lfo.start(t0); lfo.stop(t0 + D);
      return D;
    },
    // A dog a few streets over: one to three woofs.
    dog(t0, pos) {
      const out = _out(t0, 2, pos, 0.32), f = _formant(out, 650, 0.9, 1.4);
      let t = t0;
      const base = rand(360, 470);
      for (let n = irand(1, 3); n > 0; n--) {
        _tone(f, t, 0.16, [[0, base], [0.3, base * 1.15], [1, base * 0.7]], { type: 'sawtooth', a: 0.01, r: 0.06 });
        _hiss(f, t, 0.12, { f: 800, q: 0.8, vol: 0.4 });
        t += 0.16 + rand(0.22, 0.55);
      }
      return t - t0;
    },
    // Wind chimes on a porch, struck by the breeze.
    chimes(t0, pos) {
      const out = _out(t0, 6, pos, 0.07);
      const notes = [880, 988, 1175, 1319, 1480, 1760];
      let t = t0;
      for (let n = irand(3, 7); n > 0; n--) {
        _strike(out, t, pick(notes), [[1, 1, 2.6], [2.76, 0.35, 1.2], [5.4, 0.15, 0.6], [8.93, 0.06, 0.3]], 1);
        t += rand(0.15, 0.7);
      }
      return t - t0 + 2.5;
    },
    // A lawnmower somewhere down the street, fading in and away.
    mower(t0, pos) {
      const D = rand(12, 22), out = _out(t0, D, pos, 0.09);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 480;
      const load = c.createGain(); load.gain.value = 0.75;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = rand(0.2, 0.4); lg.gain.value = 0.25;
      lfo.connect(lg); lg.connect(load.gain);
      const env = c.createGain();
      env.gain.setValueAtTime(0, t0); env.gain.linearRampToValueAtTime(1, t0 + 3);
      env.gain.setValueAtTime(1, t0 + D - 4); env.gain.linearRampToValueAtTime(0, t0 + D);
      lp.connect(load); load.connect(env); env.connect(out);
      const f = rand(85, 100);
      for (const [mul, v] of [[1, 1], [2, 0.4]]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f * mul;
        const og = c.createGain(); og.gain.value = v; o.connect(og); og.connect(lp);
        const w = c.createOscillator(), wg = c.createGain(); w.frequency.value = 0.15; wg.gain.value = 4 * mul;
        w.connect(wg); wg.connect(o.frequency);
        o.start(t0); o.stop(t0 + D); w.start(t0); w.stop(t0 + D);
      }
      lfo.start(t0); lfo.stop(t0 + D);
      return D;
    },
    // A car horn a block or two away.
    horn(t0, pos) {
      const out = _out(t0, 1, pos, 0.07), lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1500; lp.connect(out);
      let t = t0;
      for (const d of Math.random() < 0.5 ? [0.28] : [0.12, 0.3]) {
        _tone(lp, t, d, 415, { type: 'square', a: 0.01, r: 0.03 });
        _tone(lp, t, d, 520, { type: 'square', vol: 0.8, a: 0.01, r: 0.03 });
        t += d + 0.12;
      }
      return t - t0;
    },
    // Metal on metal somewhere in the yards.
    clank(t0, pos) {
      const out = _out(t0, 3, pos, 0.16);
      let t = t0;
      for (let n = irand(1, 3); n > 0; n--) {
        const f = rand(320, 460);
        _strike(out, t, f, [[1, 1, 0.6], [2.68, 0.6, 0.35], [5.03, 0.4, 0.25], [7.9, 0.25, 0.15]], 1);
        _hiss(out, t, 0.02, { f: 2600, q: 1, vol: 0.6, a: 0.001 });
        t += rand(0.35, 1.2);
      }
      return t - t0 + 0.6;
    },
    // A truck reversing across the yard.
    beeper(t0, pos) {
      const out = _out(t0, 6, pos, 0.045);
      let t = t0;
      for (let n = irand(6, 10); n > 0; n--) { _tone(out, t, 0.3, 1150, { a: 0.005, r: 0.01 }); t += 0.6; }
      return t - t0;
    },
    // City Hall's bell striking the hour.
    bell(t0, pos, strikes = 3) {
      const out = _out(t0, strikes * 2.4 + 4, pos, 0.14);
      const f = 290;
      for (let k = 0; k < strikes; k++)
        _strike(out, t0 + k * 2.4, f, [[0.5, 0.5, 4], [1, 1, 3.2], [1.2, 0.6, 2.2], [1.5, 0.3, 1.6], [2, 0.35, 1.5], [2.5, 0.15, 1], [3, 0.1, 0.8]], 1);
      return strikes * 2.4 + 3;
    },
    // A goose's honk (one bird; a flock is several of these).
    honk(t0, pos, track = true) {
      const out = _out(t0, 0.5, pos, 0.2, track), f = _formant(out, 1100, 1.5, 1.3);
      const base = rand(310, 380);
      _tone(f, t0, 0.2, [[0, base * 0.9], [0.25, base * 1.18], [1, base * 1.05]], { type: 'sawtooth', a: 0.015, r: 0.06 });
      return 0.25;
    },
    // Geese going over out of sight: a ragged run of honks.
    geese(t0, pos) {
      let t = 0;
      for (let n = irand(5, 10); n > 0; n--) { CALLS.honk(t0 + t, { x: pos.x + t * 60, y: pos.y, far: pos.far }, t === 0); t += rand(0.25, 0.7); }
      return t;
    },
    // A duck's quack: the hen's run of falling quacks, or a drake's rasp.
    quack(t0, pos, drake = false) {
      const out = _out(t0, 2, pos, 0.18);
      const f1 = _formant(out, 1400, 3, 1.4), f2 = _formant(out, 2600, 4, 0.8);
      let t = t0;
      const n = drake ? 1 : irand(2, 5);
      for (let k = 0; k < n; k++) {
        const s = drake ? 0.8 : 1 - k * 0.05, d = drake ? 0.24 : 0.17;
        const pc = [[0, 320 * s], [0.4, 295 * s], [1, 230 * s]];
        _tone(f1, t, d, pc, { type: 'sawtooth', a: 0.01, r: 0.05 }); _tone(f2, t, d, pc, { type: 'sawtooth', a: 0.01, r: 0.05 });
        if (drake) _hiss(f1, t, d, { f: 1400, q: 2, vol: 0.5 });
        t += d + 0.08;
      }
      return t - t0;
    },
    // Ducklings: thin high peeps.
    peeps(t0, pos) {
      const out = _out(t0, 2, pos, 0.1);
      let t = t0;
      for (let n = irand(3, 7); n > 0; n--) { _tone(out, t, 0.08, [[0, 3100], [1, 3600]], { a: 0.005, r: 0.03 }); t += rand(0.1, 0.3); }
      return t - t0;
    },
    // A fox's sharp barks at night.
    fox(t0, pos) {
      const out = _out(t0, 3, pos, 0.16), f = _formant(out, 1200, 2, 1.2);
      let t = t0;
      for (let n = irand(2, 4); n > 0; n--) {
        _tone(f, t, 0.13, [[0, 800], [0.2, 1000], [1, 650]], { type: 'sawtooth', a: 0.008, r: 0.04 });
        t += 0.13 + rand(0.35, 0.6);
      }
      return t - t0;
    },
    // A squirrel's scolding chatter.
    squirrel(t0, pos) {
      const out = _out(t0, 2, pos, 0.14);
      let t = t0;
      for (let n = irand(6, 14); n > 0; n--) {
        _hiss(out, t, 0.03, { f: 3000, q: 3, vol: 1, a: 0.002, r: 0.015 });
        _tone(out, t, 0.03, [[0, 2700], [1, 2300]], { vol: 0.4, a: 0.002, r: 0.015 });
        t += 0.09;
      }
      return t - t0;
    },
  };

  // ── Reading the scene ─────────────────────────────────────────────
  // A coarse grid over the view says what the camera is looking at; the
  // points of each kind are kept so a call can come from a real tree,
  // pond or street.
  function _sample() {
    const z = Camera.zoom, w = window.innerWidth / z, h = window.innerHeight / z;
    const view = { x: Camera.x, y: Camera.y, w, h, cx: Camera.x + w / 2, cy: Camera.y + h / 2 };
    const pts = { tree: [], water: [], open: [], residential: [], commercial: [], industrial: [], government: [] };
    const GX = 10, GY = 7;
    let n = 0;
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      const x = view.x + (i + Math.random()) / GX * w, y = view.y + (j + Math.random()) / GY * h;
      const col = Math.floor(x / TILE), row = Math.floor(y / TILE);
      if (typeof GridManager === 'undefined' || !GridManager.inBounds(col, row)) continue;
      n++;
      const p = { x, y };
      if (typeof WaterSystem !== 'undefined' && WaterSystem.isWater(col, row)) { pts.water.push(p); continue; }
      const e = GridManager.getEntity(col, row);
      if (e && e.type === T.TREE) pts.tree.push(p);
      if (typeof ZoneSystem !== 'undefined') {
        if (ZoneSystem.isInGovZone(col, row)) { pts.government.push(p); continue; }
        const zn = ZoneSystem.getZoneAt(col, row);
        if (zn && pts[zn.key]) { pts[zn.key].push(p); continue; }
      }
      if (!e) pts.open.push(p);
    }
    const f = k => n ? pts[k].length / n : 0;
    const cc = Math.floor(view.cx / TILE), cr = Math.floor(view.cy / TILE);
    const govNear = typeof ZoneSystem !== 'undefined' && ZoneSystem.distToGovZone ? ZoneSystem.distToGovZone(cc, cr) < 30 : false;

    const dark = typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;
    const hour = typeof DayNight !== 'undefined' ? DayNight.hour() : 12;
    const night = clamp((dark - 0.05) / 0.9, 0, 1);
    const twilight = clamp(1 - Math.abs(dark - 0.4) / 0.35, 0, 1);   // the half-light either side of night
    const dawn = hour < 12 ? twilight : 0, dusk = hour >= 12 ? twilight : 0;
    const season = typeof Seasons !== 'undefined' && Seasons.enabled() ? Seasons.index() : 4;   // 4: seasons off
    const ev = typeof WeatherEventSystem !== 'undefined' ? WeatherEventSystem.getActiveEvent() : null;
    const rain = typeof RainSystem !== 'undefined' && RainSystem.level ? RainSystem.level() : 0;
    const snowing = typeof RainSystem !== 'undefined' && RainSystem.isSnow ? RainSystem.isSnow() : false;
    const ZMIN = Camera.ZOOM_MIN || 0.31, ZMAX = Camera.ZOOM_MAX || 3;
    scene = {
      view, pts, govNear, hour, night, day: 1 - night, dawn, dusk, season,
      temp: typeof WeatherEventSystem !== 'undefined' ? WeatherEventSystem.getTemperature() : 15,
      ev: ev ? ev.type : null, rain, snowing,
      wind: typeof WindState !== 'undefined' ? WindState.speed : 0.3,
      tree: Math.min(1, f('tree') * 4), water: Math.min(1, f('water') * 5), open: f('open'),
      res: f('residential'), com: f('commercial'), ind: f('industrial'), gov: f('government'),
      zoomT: clamp((z - ZMIN) / (ZMAX - ZMIN), 0, 1),
      away: typeof ContractSystem !== 'undefined' && ContractSystem.isAway ? ContractSystem.isAway() : false,
    };
  }

  // Where a call comes from: a point of one of `kinds` in view if there is
  // one, else anywhere in view; `far` puts it out past the edge.
  function _where(kinds, far = false) {
    const v = scene.view;
    if (far) {
      const a = Math.random() * Math.PI * 2, r = Math.hypot(v.w, v.h) * 0.55;
      return { x: v.cx + Math.cos(a) * r, y: v.cy + Math.sin(a) * r * 0.6, far: true };
    }
    const pool = kinds.flatMap(k => scene.pts[k] || []);
    if (pool.length) return { ...pick(pool) };
    return { x: v.x + Math.random() * v.w, y: v.y + Math.random() * v.h };
  }

  // ── Who calls, and how often ──────────────────────────────────────
  // rate: calls a minute when everything suits it. season: weight for
  // [spring, summer, autumn, winter, seasons off]. when(s): the time of
  // day, weather and place, as a multiplier.
  const birdWeather = s => (s.ev === 'storm' || s.ev === 'rainstorm' || s.ev === 'blizzard' ? 0.05 : 1)
    * (s.rain > 0.45 ? 0.12 : s.rain > 0.08 ? 0.5 : 1) * (s.snowing ? 0.3 : 1)
    * (s.ev === 'smog' ? 0.6 : 1) * (s.wind > 0.75 ? 0.6 : 1);
  const bugWeather = s => (s.rain > 0.08 ? 0.2 : 1) * (s.ev === 'coldsnap' ? 0 : 1);
  const frogWeather = s => (s.ev === 'storm' || s.ev === 'rainstorm' ? 0.4 : s.rain > 0.08 ? 1.6 : 1) * (s.ev === 'coldsnap' ? 0 : 1);
  const songbird = s => s.day * (1 + 2.5 * s.dawn + 0.8 * s.dusk) * (s.ev === 'heatwave' && s.hour > 11 && s.hour < 16 ? 0.5 : 1);
  const working = s => s.hour >= 8 && s.hour < 18 ? 1 : 0;

  const TABLE = [
    { call: 'robin',     rate: 2.2, season: [1.4, 1, 0.3, 0.03, 1],   where: ['tree', 'open', 'residential'],
      when: s => songbird(s) * birdWeather(s) * (0.3 + s.tree * 1.2 + s.open * 0.5 + s.res * 0.6 + s.com * 0.1) },
    { call: 'cardinal',  rate: 1.4, season: [1.2, 1, 0.6, 0.4, 1],    where: ['tree', 'residential'],
      when: s => songbird(s) * birdWeather(s) * (0.2 + s.tree * 1.2 + s.res * 0.6) },
    { call: 'wren',      rate: 1.0, season: [1.3, 1, 0.3, 0, 0.8],    where: ['tree', 'residential'],
      when: s => songbird(s) * birdWeather(s) * (0.2 + s.tree + s.res * 0.5) },
    { call: 'warbler',   rate: 0.8, season: [1.4, 0.7, 0.3, 0, 0.7],  where: ['tree'],
      when: s => songbird(s) * birdWeather(s) * (0.1 + s.tree * 1.4) },
    { call: 'chickadee', rate: 1.2, season: [0.8, 0.6, 0.9, 1.3, 0.7], where: ['tree', 'residential'],
      when: s => s.day * (1 + s.dawn) * birdWeather(s) * (s.snowing ? 2 : 1) * (0.2 + s.tree * 1.4 + s.res * 0.4) },
    { call: 'sparrow',   rate: 1.8, season: [1, 1, 0.8, 0.5, 1],      where: ['commercial', 'residential', 'open'],
      when: s => s.day * (1 + s.dawn) * birdWeather(s) * (0.2 + s.res * 0.8 + s.com * 1.1 + s.gov * 0.6 + s.open * 0.3) },
    { call: 'dove',      rate: 0.7, season: [1, 1, 0.4, 0.15, 0.8],   where: ['residential', 'open', 'tree'],
      when: s => s.day * (1 + 1.5 * s.dawn) * (s.hour < 11 ? 1.4 : 0.8) * birdWeather(s) * (0.2 + s.res * 0.9 + s.open * 0.6) },
    { call: 'pigeon',    rate: 1.4, season: [1, 1, 1, 0.8, 1],        where: ['commercial', 'government', 'industrial'],
      when: s => s.day * birdWeather(s) * (s.com * 1.6 + s.gov * 1.6 + s.ind * 0.4) },
    { call: 'crow',      rate: 0.8, season: [0.7, 0.6, 1.3, 1.3, 0.8], where: ['open', 'industrial', 'tree'], far: 0.5,
      when: s => s.day * (1 + s.dawn) * Math.max(0.3, birdWeather(s)) * (0.3 + s.open * 0.6 + s.ind * 0.9 + s.tree * 0.4) },
    { call: 'gull',      rate: 1.2, season: [1, 1, 1, 0.8, 1],        where: ['water', 'industrial'],
      when: s => s.day * Math.max(0.3, birdWeather(s)) * s.water * (0.4 + s.ind + s.com * 0.5) },
    { call: 'woodpecker', rate: 0.5, season: [1.4, 0.6, 0.5, 0.4, 0.7], where: ['tree'],
      when: s => s.day * (s.hour < 12 ? 1.3 : 0.7) * birdWeather(s) * s.tree * 1.5 },
    { call: 'owl',       rate: 0.8, season: [0.6, 0.5, 1, 1.4, 0.8],  where: ['tree'], far: 0.3,
      when: s => s.night * (s.rain > 0.45 ? 0.2 : 1) * (0.2 + s.tree * 1.4 + s.open * 0.2) },
    { call: 'crickets',  rate: 4,   season: [0.3, 1, 0.8, 0, 0.8],    where: ['open', 'residential', 'tree'],
      when: s => Math.max(s.night, s.dusk * 0.6) * bugWeather(s) * clamp((s.temp - 12) / 6, 0, 1) * (0.25 + s.open + s.res * 0.6 + s.tree * 0.4) },
    { call: 'peepers',   rate: 4,   season: [1.5, 0.15, 0, 0, 0.3],   where: ['water'],
      when: s => Math.max(s.night, s.dusk) * frogWeather(s) * clamp((s.temp - 5) / 5, 0, 1) * s.water },
    { call: 'bullfrog',  rate: 1.2, season: [0.3, 1, 0.2, 0, 0.5],    where: ['water'],
      when: s => Math.max(s.night, s.dusk * 0.5) * frogWeather(s) * clamp((s.temp - 15) / 5, 0, 1) * s.water },
    { call: 'cicada',    rate: 1.5, season: [0, 1, 0.2, 0, 0.4],      where: ['tree', 'residential', 'open'],
      when: s => s.day * bugWeather(s) * clamp((s.temp - 23) / 5, 0, 1) * (s.ev === 'heatwave' ? 2 : 1) * (0.2 + s.tree + s.res * 0.4) },
    { call: 'dog',       rate: 0.5, season: [1, 1, 1, 1, 1],          where: ['residential'], far: 0.6,
      when: s => (s.day + s.night * 0.35) * (s.rain > 0.45 ? 0.3 : 1) * s.res },
    { call: 'chimes',    rate: 1.6, season: [1, 1, 1, 1, 1],          where: ['residential'],
      when: s => s.res * clamp((s.wind - 0.2) / 0.5, 0, 1) },
    { call: 'mower',     rate: 0.25, season: [0.8, 1, 0.3, 0, 0.6],   where: ['residential'], far: 0.7,
      when: s => (s.hour >= 9 && s.hour < 18 ? 1 : 0) * (s.rain > 0.05 ? 0 : 1) * (s.ev === 'heatwave' ? 0.4 : 1) * s.res },
    { call: 'horn',      rate: 0.5, season: [1, 1, 1, 1, 1],          where: ['commercial'], far: 0.8,
      when: s => ((s.hour >= 7 && s.hour < 9) || (s.hour >= 16 && s.hour < 18.5) ? 2 : s.day * 0.8 + s.night * 0.15) * s.com },
    { call: 'clank',     rate: 1.6, season: [1, 1, 1, 1, 1],          where: ['industrial'], far: 0.6,
      when: s => (working(s) ? 1 : 0.3) * s.ind },
    { call: 'beeper',    rate: 0.35, season: [1, 1, 1, 1, 1],         where: ['industrial'], far: 0.8,
      when: s => working(s) * s.ind },
    { call: 'geese',     rate: 0.12, season: [0.5, 0.05, 1, 0.15, 0.2], where: [], far: 1,
      when: s => (s.day + s.dawn) * birdWeather(s) },
  ];

  // ── Playing ───────────────────────────────────────────────────────
  function _busy(now) {
    for (let i = voices.length - 1; i >= 0; i--) if (voices[i] < now) voices.splice(i, 1);
    return voices.length;
  }

  function _play(name, pos, ...args) {
    const t0 = c.currentTime + 0.05;
    recent.push(name); if (recent.length > 40) recent.shift();
    callLevel = TOWN_CALLS.has(name) ? 1 : ANIMAL_LEVEL;
    try { return CALLS[name](t0, pos, ...args); } catch (_e) { return 0; }
  }

  // Calls from the flocks and animals actually on screen.
  function _animals(dt) {
    const now = c.currentTime;
    const due = (ref, every) => {
      const t = (_timers.get(ref) ?? rand(0, every)) - dt;
      _timers.set(ref, t > 0 ? t : rand(every * 0.6, every * 1.4));
      return t <= 0;
    };
    const v = scene.view, inView = o => o.x > v.x - 80 && o.x < v.x + v.w + 80 && o.y > v.y - 80 && o.y < v.y + v.h + 80;
    if (typeof BirdFlocks !== 'undefined' && BirdFlocks.nearby) {
      for (const f of BirdFlocks.nearby()) {
        if (!inView(f)) continue;
        if (f.kind === 'goose') { if (due(f.ref, 1.8)) _play('honk', f, false); }
        else if (f.kind === 'crow') { if (due(f.ref, 4) && Math.random() < 0.7 && _busy(now) < MAX_VOICES) _play('crow', f); }
        else if (f.kind === 'gull') { if (due(f.ref, 5) && Math.random() < 0.6 && _busy(now) < MAX_VOICES) _play('gull', f); }
        else if (f.kind === 'owl')  { if (due(f.ref, 9) && Math.random() < 0.5 && _busy(now) < MAX_VOICES) _play('owl', f); }
        else if (due(f.ref, 6) && Math.random() < 0.6 && _busy(now) < MAX_VOICES) _play('twitter', f);
      }
    }
    if (typeof Wildlife !== 'undefined' && Wildlife.nearby && scene.zoomT > 0.02) {
      for (const a of Wildlife.nearby()) {
        if (!inView(a) || _busy(now) >= MAX_VOICES) continue;
        if (a.kind === 'duck' || a.kind === 'drake') { if (due(a.ref, 25)) _play('quack', a, a.kind === 'drake'); }
        else if (a.kind === 'duckling') { if (due(a.ref, 40)) _play('peeps', a); }
        else if (a.kind === 'squirrel') { if (due(a.ref, 45) && Math.random() < 0.5) _play('squirrel', a); }
        else if (a.kind === 'fox' && scene.night > 0.5) { if (due(a.ref, 70) && Math.random() < 0.5) _play('fox', a); }
        else if (a.kind === 'frog') { if (due(a.ref, 30) && Math.random() < 0.5) _play(scene.season === 0 ? 'peepers' : 'bullfrog', a); }
      }
    }
  }

  return {
    tick() {
      const nowMs = performance.now();
      const dt = lastNow ? Math.min(0.5, (nowMs - lastNow) / 1000) : 0;
      lastNow = nowMs;
      if (!dt || typeof Camera === 'undefined' || !_setup()) return;
      if ((sampleIn -= dt) <= 0 || !scene) { _sample(); sampleIn = SAMPLE_EVERY; }
      const s = scene;

      // Level: the player's sound volume, and quieter seen from high up.
      const lvl = MASTER * (typeof SFX.getVolume === 'function' ? SFX.getVolume() : 1) * (0.45 + 0.55 * s.zoomT) * (s.away ? 0.5 : 1);
      master.gain.setTargetAtTime(lvl, c.currentTime, 0.5);

      // Fewer calls from high up.
      const busy = _busy(c.currentTime);
      const rateMul = RATE * (0.5 + 0.5 * s.zoomT) * (s.away ? 0.5 : 1);
      for (const e of TABLE) {
        const r = e.rate * e.season[s.season] * e.when(s) * rateMul;
        if (r <= 0 || Math.random() >= r * dt / 60 || busy >= MAX_VOICES) continue;
        _play(e.call, _where(e.where, Math.random() < (e.far || 0)));
        break;   // one new call a tick at most
      }

      // City Hall's bell on the quarter-day hours, heard near the district.
      const hr = Math.floor(s.hour);
      if (hr !== lastBellHour) {
        if (lastBellHour >= 0 && s.govNear && [9, 12, 15, 18].includes(hr)) {
          const pool = s.pts.government;
          _play('bell', pool.length ? { ...pick(pool) } : _where([], true), hr % 12 || 12);
        }
        lastBellHour = hr;
      }

      if ((animalsIn -= dt) <= 0) { _animals(0.5 - animalsIn); animalsIn = 0.5; }
    },
    // Dev: hear one call now, from the middle of the view.
    play(name, ...args) {
      if (!CALLS[name] || !_setup()) return false;
      if (!scene) _sample();
      master.gain.setTargetAtTime(MASTER, c.currentTime, 0.05);
      return _play(name, { x: scene.view.cx, y: scene.view.cy }, ...args);
    },
    CALLS: Object.keys(CALLS),
    recent: () => recent.slice(),
    // Dev: calls a minute each would make here and now, before the zoom.
    rates() {
      _sample();
      const out = {};
      for (const e of TABLE) { const r = RATE * e.rate * e.season[scene.season] * e.when(scene); if (r > 0.005) out[e.call] = +r.toFixed(2); }
      return out;
    },
  };
})();
