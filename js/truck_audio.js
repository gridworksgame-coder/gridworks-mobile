/* ═══════════════════════════════════════════════════════════════════
   TRUCK AUDIO
   A diesel for each truck near the camera, synthesized rather than
   sampled so it can follow what the truck is doing: the note climbs
   through each gear and drops back on the change, it digs in and gets
   louder and brighter while the truck is pulling, falls to a lumpy idle
   when it stands, and has tyre roar that comes up with road speed. Air
   brakes hiss as it pulls up, and it beeps while it backs out of a jam.

   Only the VOICES nearest trucks are voiced, each panned to where its
   truck is on screen and faded with distance and zoom on the same shape
   as the building beds (audio.js). Everything feeds SFX.bedsBus(), so the
   pause menu and the end-of-run mute cover it with the rest.
   ═══════════════════════════════════════════════════════════════════ */
const TruckAudio = (() => {
  const VOICES      = 3;
  const HEAR_RADIUS = 26;      // tiles from the centre of the view
  const GEAR_SPAN   = 85;      // px/s of road speed per gear
  const IDLE_HZ     = 27;      // firing note at idle…
  const REDLINE_HZ  = 78;      // …and at the top of a gear
  const LEVEL       = (zoomT) => 0.035 + zoomT * 0.16;

  let voices = null, noise = null, silentSince = 0;
  const state = new WeakMap();   // truck → { speed, wasMoving, beepAt }

  function _noise(ctx) {
    if (noise && noise.sampleRate === ctx.sampleRate) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }

  // One engine, built the way a diesel actually sounds: a train of
  // combustion knocks rather than a tone. A sawtooth at the firing rate is
  // shaped into a sharp pulse (a hard edge, then a quick decay) and that
  // pulse opens a gate on broadband noise, so each firing is a short thud
  // of noise: the chug. The same pulse gates a high, narrow band for the
  // injector clatter, loudest at idle. Under it, a quiet hum at the firing
  // note gives the knocks a pitch to sit on, and every other firing lands a
  // little harder for the uneven lope of a big engine.
  //
  // (It used to be the hum alone: low sawtooths and a square an octave
  // under, at 13–80 Hz, with a narrow noise band swept along with the revs.
  // A low buzz with a moving vowel in it, bending up through each gear: it
  // read as something else entirely.)
  function makeVoice(ctx, dest) {
    const out = ctx.createGain(); out.gain.value = 0;
    let tail = out;
    let pan = null;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); out.connect(pan); tail = pan; }
    tail.connect(dest);

    const src = ctx.createBufferSource(); src.buffer = _noise(ctx); src.loop = true;
    src.start(0, Math.random() * 2);

    // The firing pulse: a rising sawtooth's phase p (0..1) mapped to
    // e^(-5.5p), so each cycle snaps to full and dies away before the next.
    const fire = ctx.createOscillator(); fire.type = 'sawtooth'; fire.frequency.value = IDLE_HZ;
    const pulse = ctx.createWaveShaper();
    const pc = new Float32Array(257);
    for (let i = 0; i < 257; i++) pc[i] = Math.exp(-5.5 * (i / 256));
    pulse.curve = pc;
    fire.connect(pulse);
    // The lope: every other firing a little harder.
    const lope = ctx.createOscillator(); lope.type = 'triangle'; lope.frequency.value = IDLE_HZ / 2;
    const lopeG = ctx.createGain(); lopeG.gain.value = 0.25;
    lope.connect(lopeG);

    // Knocks: noise gated by the pulse, through a wide band that opens up
    // with revs and throttle, then a lowpass so it thuds rather than hisses.
    const knockF = ctx.createBiquadFilter(); knockF.type = 'bandpass'; knockF.frequency.value = 420; knockF.Q.value = 0.55;
    const knockGate = ctx.createGain(); knockGate.gain.value = 0;
    pulse.connect(knockGate.gain); lopeG.connect(knockGate.gain);
    const knockLP = ctx.createBiquadFilter(); knockLP.type = 'lowpass'; knockLP.frequency.value = 900; knockLP.Q.value = 0.5;
    const knock = ctx.createGain(); knock.gain.value = 0;
    src.connect(knockF); knockF.connect(knockGate); knockGate.connect(knockLP); knockLP.connect(knock); knock.connect(out);

    // Injector clatter: the same pulse on a high, narrow band.
    const clatF = ctx.createBiquadFilter(); clatF.type = 'bandpass'; clatF.frequency.value = 2600; clatF.Q.value = 1.6;
    const clatGate = ctx.createGain(); clatGate.gain.value = 0;
    pulse.connect(clatGate.gain);
    const clat = ctx.createGain(); clat.gain.value = 0;
    src.connect(clatF); clatF.connect(clatGate); clatGate.connect(clat); clat.connect(out);

    // The hum under it: the firing note and its octave, gently clipped and
    // kept low and quiet. No sub-octave.
    const drive = ctx.createWaveShaper();
    const curve = new Float32Array(257);
    for (let i = 0; i < 257; i++) curve[i] = Math.tanh((i / 128 - 1) * 1.6);
    drive.curve = curve;
    const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 200; tone.Q.value = 0.5;
    const hum = ctx.createGain(); hum.gain.value = 0;
    drive.connect(tone); tone.connect(hum); hum.connect(out);
    const oscs = [[fire, 1], [lope, 0.5]];
    for (const [type, mult, g] of [['sawtooth', 1, 0.45], ['triangle', 2, 0.3]]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type; o.frequency.value = IDLE_HZ * mult; og.gain.value = g;
      o.connect(og); og.connect(drive);
      oscs.push([o, mult]);
    }
    for (const [o] of oscs) o.start();

    const roadF = ctx.createBiquadFilter(); roadF.type = 'bandpass'; roadF.frequency.value = 950; roadF.Q.value = 0.5;
    const road = ctx.createGain(); road.gain.value = 0;
    const hissF = ctx.createBiquadFilter(); hissF.type = 'highpass'; hissF.frequency.value = 3200;
    const hiss = ctx.createGain(); hiss.gain.value = 0;
    src.connect(roadF); roadF.connect(road); road.connect(out);
    src.connect(hissF); hissF.connect(hiss); hiss.connect(out);

    return {
      truck: null, out, pan,
      set(now, { hz, throttle, running, roadT, vol, panX }) {
        for (const [o, mult] of oscs) o.frequency.setTargetAtTime(hz * mult, now, 0.06);
        const fall = running ? 0.12 : 0.3;
        knockF.frequency.setTargetAtTime(300 + hz * 4 + 500 * throttle, now, 0.1);
        knockLP.frequency.setTargetAtTime(700 + hz * 6 + 900 * throttle, now, 0.1);
        knock.gain.setTargetAtTime(running ? 2.1 + 3.0 * throttle : 0, now, fall);
        clat.gain.setTargetAtTime(running ? 0.5 - 0.25 * throttle : 0, now, fall);
        tone.frequency.setTargetAtTime(150 + hz * 2 + 250 * throttle, now, 0.15);
        hum.gain.setTargetAtTime(running ? 0.12 + 0.1 * throttle : 0, now, fall);
        road.gain.setTargetAtTime(0.22 * roadT, now, 0.2);
        out.gain.setTargetAtTime(vol, now, 0.12);
        if (pan) pan.pan.setTargetAtTime(panX, now, 0.15);
      },
      // Air brakes letting go as it comes to a stand.
      hiss(now) {
        hiss.gain.cancelScheduledValues(now);
        hiss.gain.setValueAtTime(0, now);
        hiss.gain.linearRampToValueAtTime(0.16, now + 0.02);
        hiss.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
        hiss.gain.setValueAtTime(0, now + 0.45);
      },
      // One pip of the reversing alarm.
      beep(now) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 1150;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.07, now + 0.005);
        g.gain.setValueAtTime(0.07, now + 0.26);
        g.gain.linearRampToValueAtTime(0, now + 0.28);
        o.connect(g); g.connect(out);
        o.start(now); o.stop(now + 0.3);
      },
      stop() {
        for (const [o] of oscs) { try { o.stop(); } catch (_e) {} }
        try { src.stop(); } catch (_e) {}
        try { out.disconnect(); if (pan) pan.disconnect(); } catch (_e) {}
      },
    };
  }

  function _teardown() {
    if (voices) for (const v of voices) v.stop();
    voices = null;
    silentSince = 0;
  }

  // What the engine and tyres of one truck are doing right now.
  function _drive(trk) {
    const driven = TruckSystem.isDriven(trk);
    const busy = !!trk._haulState || !!trk._refuelTarget;
    const running = (driven || !!trk._patrolling || busy) && (trk._fuel ?? 1) > 0;
    const moving = driven || !!trk._patrolling;
    const a = trk._angle || 0;
    const fwd = moving ? (trk._vx || 0) * Math.sin(a) - (trk._vy || 0) * Math.cos(a) : 0;
    const speed = Math.abs(fwd);
    const reversing = moving && ((trk._recoverTimer || 0) > 0 || fwd < -5);
    const throttle = moving ? (reversing ? 0.5 : (trk._throttle || 0)) : 0;
    // Revs climb through each gear and drop back at the change; standing,
    // or with the clutch in below a crawl, it idles.
    const inGear = speed > 6 ? 0.32 + 0.68 * ((speed % GEAR_SPAN) / GEAR_SPAN) : 0;
    const hz = IDLE_HZ + (REDLINE_HZ - IDLE_HZ) * Math.max(inGear, throttle * 0.25);
    return { running, speed, reversing, throttle, hz, roadT: Math.min(1, Math.pow(speed / 300, 1.4)) };
  }

  return {
    tick() {
      if (typeof TruckSystem === 'undefined') return;
      const trucks = EntityRegistry.getByType(T.TRUCK);
      const paused = DevMode.timeScale === 0;

      // Nearest audible trucks to the centre of the view.
      const ZOOM_MIN = 0.25 * Math.pow(1.12, 2), ZOOM_MAX = 3.0;
      const zoomT = Math.max(0, Math.min(1, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)));
      const viewW = window.innerWidth / Camera.zoom;
      const cx = Camera.x + viewW / 2, cy = Camera.y + window.innerHeight / 2 / Camera.zoom;
      const near = [];
      if (!paused && trucks.size) {
        for (const trk of trucks) {
          if (trk._wx === undefined) continue;
          const dx = trk._wx + TILE / 2 - cx, dy = trk._wy + TILE * 1.5 - cy;
          const d = Math.hypot(dx, dy) / TILE;
          if (d >= HEAR_RADIUS) continue;
          const drive = _drive(trk);
          if (!drive.running && drive.speed < 3) { state.delete(trk); continue; }
          near.push({ trk, d, dx, drive });
        }
        near.sort((p, q) => p.d - q.d);
        near.length = Math.min(near.length, VOICES);
      }

      const ctx = (near.length || voices) ? SFX.context() : null;
      if (!ctx) return;
      const now = ctx.currentTime;
      if (!near.length) {
        for (const v of voices) { v.out.gain.setTargetAtTime(0, now, 0.15); v.truck = null; }
        const t = performance.now();
        if (!silentSince) silentSince = t;
        if (t - silentSince > 3000) _teardown();
        return;
      }
      silentSince = 0;
      if (!voices) {
        const dest = SFX.bedsBus();
        voices = [];
        for (let i = 0; i < VOICES; i++) voices.push(makeVoice(ctx, dest));
      }

      // A voice keeps the truck it already has; the rest go to the newcomers.
      const wanted = new Set(near.map(n => n.trk));
      for (const v of voices) if (v.truck && !wanted.has(v.truck)) v.truck = null;
      const voiced = new Set(voices.map(v => v.truck).filter(Boolean));
      const master = SFX.getVolume ? SFX.getVolume() : 1;
      for (const n of near) {
        let v = voices.find(q => q.truck === n.trk);
        if (!v) { v = voices.find(q => !q.truck); if (!v) continue; v.truck = n.trk; voiced.add(n.trk); }
        const { drive } = n;
        const vol = Math.max(0, Math.min(1, LEVEL(zoomT) * (1 - n.d / HEAR_RADIUS) * master));
        v.set(now, { ...drive, vol, panX: Math.max(-0.7, Math.min(0.7, n.dx / (viewW / 2) * 0.7)) });

        let st = state.get(n.trk);
        if (!st) { st = { wasMoving: false, beepAt: 0 }; state.set(n.trk, st); }
        if (drive.speed > 70) st.wasMoving = true;
        else if (drive.speed < 4 && st.wasMoving) { st.wasMoving = false; v.hiss(now); }
        if (drive.reversing && now >= st.beepAt) { st.beepAt = now + 0.6; v.beep(now); }
      }
      for (const v of voices) if (!v.truck) v.out.gain.setTargetAtTime(0, now, 0.15);
    },
    // For checking a render offline (see sound_preview.html's approach):
    // builds one voice on any BaseAudioContext.
    _makeVoice: makeVoice,
  };
})();
