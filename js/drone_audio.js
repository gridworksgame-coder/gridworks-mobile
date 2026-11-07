/* ═══════════════════════════════════════════════════════════════════
   DRONE AUDIO
   The buzz of the drones nearest the camera, synthesized so each one
   follows its own rotors: it winds up from nothing on the pad, climbs in
   pitch as it lifts and again as it gets up to speed, drops to a steadier
   note while it hovers over a job, and winds back down as it lands.

   A quadcopter is four rotors that never quite agree, so a voice is four
   sawtooths a few cycles apart beating against each other, through a
   band that leaves the whine and takes off the bottom, with a little
   rushing air beside it. Each drone sits a few Hz from its neighbours so
   a fleet sounds like several machines rather than one louder one.

   Same shape as TruckAudio (truck_audio.js): only the VOICES nearest are
   voiced, panned to where they are on screen, faded with distance and
   zoom, and fed to SFX.bedsBus() so the pause menu covers them.
   ═══════════════════════════════════════════════════════════════════ */
const DroneAudio = (() => {
  const VOICES      = 4;
  const HEAR_RADIUS = 18;      // tiles from the centre of the view
  const TOP_SPEED   = 620;     // px/s, for how much flying fast raises the note
  const LEVEL       = (zoomT) => 0.012 + zoomT * 0.075;

  let voices = null, noise = null, silentSince = 0;
  const pitchOf = new WeakMap();   // drone → its own few Hz off the fleet's note

  function _noise(ctx) {
    if (noise && noise.sampleRate === ctx.sampleRate) return noise;
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noise;
  }

  function makeVoice(ctx, dest) {
    const out = ctx.createGain(); out.gain.value = 0;
    let pan = null, tail = out;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); out.connect(pan); tail = pan; }
    tail.connect(dest);

    const body = ctx.createBiquadFilter(); body.type = 'bandpass'; body.frequency.value = 700; body.Q.value = 0.9;
    const cut = ctx.createBiquadFilter(); cut.type = 'highpass'; cut.frequency.value = 180;
    const rotors = ctx.createGain(); rotors.gain.value = 1.6;
    body.connect(cut); cut.connect(rotors); rotors.connect(out);
    const oscs = [1, 1.017, 0.988, 2.03].map((mult, i) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 120 * mult; og.gain.value = i === 3 ? 0.14 : 0.3;
      o.connect(og); og.connect(body); o.start();
      return { o, mult };
    });
    const src = ctx.createBufferSource(); src.buffer = _noise(ctx); src.loop = true;
    const airF = ctx.createBiquadFilter(); airF.type = 'bandpass'; airF.frequency.value = 2600; airF.Q.value = 0.7;
    const air = ctx.createGain(); air.gain.value = 0;
    src.connect(airF); airF.connect(air); air.connect(out);
    src.start(0, Math.random() * 2);

    return {
      drone: null, out,
      set(now, { hz, vol, panX, speedT }) {
        for (const { o, mult } of oscs) o.frequency.setTargetAtTime(hz * mult, now, 0.09);
        body.frequency.setTargetAtTime(hz * 5, now, 0.12);
        air.gain.setTargetAtTime(0.05 + 0.1 * speedT, now, 0.2);
        out.gain.setTargetAtTime(vol, now, 0.12);
        if (pan) pan.pan.setTargetAtTime(panX, now, 0.15);
      },
      stop() {
        for (const { o } of oscs) { try { o.stop(); } catch (_e) {} }
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

  return {
    tick() {
      const ports = EntityRegistry.getByType(T.DRONEPORT);
      const paused = DevMode.timeScale === 0;

      const ZOOM_MIN = 0.25 * Math.pow(1.12, 2), ZOOM_MAX = 3.0;
      const zoomT = Math.max(0, Math.min(1, (Camera.zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)));
      const viewW = window.innerWidth / Camera.zoom;
      const cx = Camera.x + viewW / 2, cy = Camera.y + window.innerHeight / 2 / Camera.zoom;
      const near = [];
      if (!paused && ports.size) {
        for (const port of ports) for (const d of (port._drones || [])) {
          if (!(d.spin > 0.02)) continue;            // parked, rotors stopped
          const dx = d.x - cx, dist = Math.hypot(dx, d.y - cy) / TILE;
          if (dist >= HEAR_RADIUS) continue;
          near.push({ d, dist, dx });
        }
        near.sort((p, q) => p.dist - q.dist);
        near.length = Math.min(near.length, VOICES);
      }

      const ctx = (near.length || voices) ? SFX.context() : null;
      if (!ctx) return;
      const now = ctx.currentTime;
      if (!near.length) {
        for (const v of voices) { v.out.gain.setTargetAtTime(0, now, 0.15); v.drone = null; }
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

      // A voice keeps the drone it already has; the rest go to the newcomers.
      const wanted = new Set(near.map(n => n.d));
      for (const v of voices) if (v.drone && !wanted.has(v.drone)) v.drone = null;
      const master = SFX.getVolume ? SFX.getVolume() : 1;
      for (const n of near) {
        let v = voices.find(q => q.drone === n.d);
        if (!v) { v = voices.find(q => !q.drone); if (!v) continue; v.drone = n.d; }
        const d = n.d;
        let own = pitchOf.get(d);
        if (own === undefined) { own = (Math.random() - 0.5) * 16; pitchOf.set(d, own); }
        const spin = Math.max(0, Math.min(1, d.spin || 0)), alt = Math.max(0, Math.min(1, d.alt || 0));
        const speedT = Math.max(0, Math.min(1, (d.v || 0) / TOP_SPEED));
        // Winding up on the pad, working harder to climb, harder again at speed.
        const hz = 70 + 62 * spin + 16 * alt + 34 * speedT + own;
        const vol = LEVEL(zoomT) * (1 - n.dist / HEAR_RADIUS) * spin * (0.55 + 0.45 * alt) * master;
        v.set(now, { hz, speedT, vol: Math.max(0, Math.min(1, vol)), panX: Math.max(-0.7, Math.min(0.7, n.dx / (viewW / 2) * 0.7)) });
      }
      for (const v of voices) if (!v.drone) v.out.gain.setTargetAtTime(0, now, 0.15);
    },
    // Builds one voice on any BaseAudioContext, for checking a render offline.
    _makeVoice: makeVoice,
  };
})();
