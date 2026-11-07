/* ═══════════════════════════════════════════════════════════════════
   WATERFALL AUDIO — the roar of the river's falls
   Every waterfall the river generator laid (water tiles flagged
   _waterfall, grouped here the way render_world_civic.js draws them) is
   heard from where it is: louder the closer the view is to it and the
   wider the fall, panned left or right across the view, and duller and
   further back the further off it is, so it reads as a place in the
   landscape rather than a bed laid over everything.

   It is made from a real recording, not synthesis: the fountain's
   splashing water (audio/sfx/fountain.mp3), slowed so it falls heavier and
   further, with a second, slower copy of it down through a low-pass for
   the deep thunder of water landing in the plunge pool. The two copies run
   from different points in the recording, each fall's at its own speed, so
   neighbouring falls don't sound alike, and the level breathes now and then
   the way a real fall's does as the flow surges and eases.

   The few falls nearest the view get a voice each (MAX_VOICES); the rest
   are too far off to hear. Everything goes through SFX.bedsBus(), so the
   pause menu and the end of a run silence it with the other beds, and the
   player's sound volume sets its level. Ticked from
   GameLoop._tickPresentation, beside OutdoorAmbience.
   ═══════════════════════════════════════════════════════════════════ */
const WaterfallAudio = (() => {
  const SRC        = 'audio/sfx/fountain.mp3';
  const MAX_VOICES = 3;
  const LEVEL      = 1.7;     // the recording is quiet (RMS ~0.014): brought up to sit above the river's babble
  const RUMBLE     = 2.6;     // the low layer, after its low-pass has taken most of its energy
  const RATE_FALL  = 0.8;     // the splash, slowed: a heavier, bigger body of water, keeping its spray
  const RATE_DEEP  = 0.46;    // the plunge: slower still, under the low-pass
  const IDLE_TEAR  = 12;      // seconds with no fall in earshot before the voices are torn down

  let c = null, buffer = null, loading = false, unusable = false;
  const slots = [];           // { fall, out, lp, pan, a, b, srcA, srcB, nextSurge }
  let idleFor = 0, lastNow = 0;

  // ── The falls on the map ───────────────────────────────────────────
  // Groups of 8-connected _waterfall tiles: each one fall, heard from its
  // centre, as wide as its lip. Rebuilt when the water changes.
  let _falls = [], _sig = -1;
  function _scanFalls() {
    const tiles = WaterSystem.getWaterTiles();
    if (tiles.size === _sig) return _falls;
    _sig = tiles.size;
    const at = new Map();
    for (const k of tiles) {
      const i = k.indexOf(','), col = +k.slice(0, i), row = +k.slice(i + 1);
      const e = GridManager.getEntity(col, row);
      if (e && e.type === T.WATER && e._waterfall) at.set(col * 100000 + row, e);
    }
    const seen = new Set(), out = [];
    for (const [key, seed] of at) {
      if (seen.has(key)) continue;
      const stack = [seed], members = [];
      seen.add(key);
      while (stack.length) {
        const e = stack.pop(); members.push(e);
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const k2 = (e.col + dc) * 100000 + e.row + dr;
          if (!seen.has(k2) && at.has(k2)) { seen.add(k2); stack.push(at.get(k2)); }
        }
      }
      let x = 0, y = 0;
      for (const m of members) { x += m.col + 0.5; y += m.row + 0.5; }
      const h = (members[0].col * 73856093) ^ (members[0].row * 19349663);
      out.push({ x: x / members.length * TILE, y: y / members.length * TILE, width: members.length,
                 vary: ((h >>> 0) % 1000) / 1000, members });   // vary 0..1, this fall's own pitch
    }
    _falls = out;
    return out;
  }

  // ── Voices ─────────────────────────────────────────────────────────
  function _load() {
    if (loading || buffer || unusable || typeof _bedBuffer !== 'function') return;
    loading = true;
    _bedBuffer(c, SRC, 1.5).then(b => { buffer = b; unusable = !b; loading = false; });
  }

  function _voice() {
    const out = c.createGain(); out.gain.value = 0;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5; lp.frequency.value = 2000;
    let tail = lp;
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (pan) { lp.connect(pan); tail = pan; }
    tail.connect(out); out.connect(SFX.bedsBus());
    // The falling water itself, with its very lowest rumble left to the plunge layer.
    const a = c.createGain(); a.gain.value = 1;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 140;
    a.connect(hp); hp.connect(lp);
    // The plunge: the same water, slower, through a low-pass.
    const b = c.createGain(); b.gain.value = RUMBLE;
    const deep = c.createBiquadFilter(); deep.type = 'lowpass'; deep.frequency.value = 420; deep.Q.value = 0.7;
    b.connect(deep); deep.connect(lp);
    const srcA = c.createBufferSource(); srcA.buffer = buffer; srcA.loop = true; srcA.playbackRate.value = RATE_FALL; srcA.connect(a);
    const srcB = c.createBufferSource(); srcB.buffer = buffer; srcB.loop = true; srcB.playbackRate.value = RATE_DEEP; srcB.connect(b);
    srcA.start(0, Math.random() * buffer.duration);
    srcB.start(0, Math.random() * buffer.duration);
    return { fall: null, out, lp, pan, a, b, srcA, srcB, nextSurge: 0 };
  }

  function _teardown() {
    for (const s of slots) {
      try { s.srcA.stop(); s.srcB.stop(); } catch (_e) {}
      try { s.out.disconnect(); } catch (_e) {}
    }
    slots.length = 0;
  }

  return {
    tick() {
      const nowMs = performance.now();
      const dt = lastNow ? Math.min(0.5, (nowMs - lastNow) / 1000) : 0;
      lastNow = nowMs;
      if (typeof Camera === 'undefined' || typeof WaterSystem === 'undefined' || typeof SFX === 'undefined') return;
      const ctx = SFX.context ? SFX.context() : null;
      if (!ctx || !SFX.bedsBus || !SFX.bedsBus()) return;
      if (c !== ctx) { _teardown(); c = ctx; buffer = null; loading = false; unusable = false; }

      // Where the view is, and how close in.
      const z = Camera.zoom, w = window.innerWidth / z, h = window.innerHeight / z;
      const cx = Camera.x + w / 2, cy = Camera.y + h / 2;
      const ZMIN = Camera.ZOOM_MIN || 0.31, ZMAX = Camera.ZOOM_MAX || 3;
      const zoomT = Math.max(0, Math.min(1, (z - ZMIN) / (ZMAX - ZMIN)));
      const vol = typeof SFX.getVolume === 'function' ? SFX.getVolume() : 1;

      // How each fall would sound from here: heard further off the wider it
      // is, falling away with distance, quieter seen from high up.
      const heard = [];
      for (const f of _scanFalls()) {
        // A dam upstream takes its water (it roars on what is left), and a
        // reservoir rising over it silences it (ReservoirSystem.fallState).
        const fs = typeof ReservoirSystem !== 'undefined' && ReservoirSystem.fallStateEased
          ? ReservoirSystem.fallStateEased(f, f.members) : { flow: 1, drown: 0 };
        const water = (0.15 + 0.85 * fs.flow) * (1 - fs.drown);
        if (water < 0.02) continue;
        const d = Math.hypot(f.x - cx, f.y - cy) / TILE;
        const reach = Math.min(55, 24 + f.width * 2.2);
        if (d >= reach) continue;
        const prox = Math.pow(1 - d / reach, 1.6);
        const size = Math.max(0.6, Math.min(1.35, 0.5 + f.width * 0.09));
        heard.push({ f, prox, level: LEVEL * prox * size * (0.35 + 0.65 * zoomT) * vol * water });
      }
      heard.sort((p, q) => q.level - p.level);
      heard.length = Math.min(heard.length, MAX_VOICES);

      if (!heard.length) {
        for (const s of slots) s.out.gain.setTargetAtTime(0, c.currentTime, 0.8);
        if (slots.length && (idleFor += dt) > IDLE_TEAR) { _teardown(); idleFor = 0; }
        return;
      }
      idleFor = 0;
      if (!buffer) { _load(); return; }

      // A voice for each fall in earshot; one already on a fall keeps it.
      while (slots.length < heard.length) slots.push(_voice());
      const free = slots.filter(s => !heard.some(hh => hh.f === s.fall));
      for (const hh of heard) {
        if (slots.some(s => s.fall === hh.f)) continue;
        const s = free.shift();
        if (!s) break;
        s.fall = hh.f;
        // Its own speed, so two falls in earshot never sound like one.
        s.srcA.playbackRate.setValueAtTime(RATE_FALL * (0.92 + 0.16 * hh.f.vary), c.currentTime);
        s.srcB.playbackRate.setValueAtTime(RATE_DEEP * (0.9 + 0.2 * hh.f.vary), c.currentTime);
      }
      const now = c.currentTime;
      for (const s of slots) {
        const hh = heard.find(x => x.f === s.fall);
        if (!hh) { s.out.gain.setTargetAtTime(0, now, 0.6); s.fall = null; continue; }
        s.out.gain.setTargetAtTime(hh.level, now, 0.35);
        // Further off: duller (air takes the highs), and off to its side.
        s.lp.frequency.setTargetAtTime(700 + 11000 * Math.pow(hh.prox, 0.8), now, 0.4);
        if (s.pan) s.pan.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, (s.fall.x - cx) / (w / 2) * 0.8)), now, 0.3);
        // The flow surging and easing every few seconds.
        if (now >= s.nextSurge) {
          s.a.gain.setTargetAtTime(0.82 + Math.random() * 0.36, now, 1.2);
          s.b.gain.setTargetAtTime(RUMBLE * (0.85 + Math.random() * 0.3), now, 2);
          s.nextSurge = now + 2.5 + Math.random() * 4;
        }
      }
    },
    // Dev: the falls on the map and what each is heard at from here.
    falls: () => _scanFalls().map(f => ({ x: Math.round(f.x / TILE), y: Math.round(f.y / TILE), width: f.width })),
    voices: () => slots.map(s => ({ fall: s.fall && { x: Math.round(s.fall.x / TILE), y: Math.round(s.fall.y / TILE) }, gain: +s.out.gain.value.toFixed(3) })),
  };
})();
