/* ═══════════════════════════════════════════════════════════════════
   COMPANY HEADQUARTERS
   The city's thank-you for Advanced Fusion. The moment an Advanced Fusion
   Reactor is running, GovernmentSystem raises the player's own head office
   (T.COMPANYHQ, 40×32) in the National Government Zone, blacked out, and
   this plays the scene that unveils it:

     1. over the reactor: ADVANCED FUSION ONLINE, and how far the company
        has come;
     2. "the government of <city> has prepared a surprise", and a cut to
        the plot, still under wraps;
     3. a count of three, the wraps come off under fireworks, and the
        building is named: <COMPANY> HEADQUARTERS.

   The sim is held for the scene (as FUSION ACHIEVED holds it) and the
   fireworks are NationalProject's, drawn on this scene's own canvas; they
   carry on over the city for a couple of in-game hours afterwards. The
   building pays its income (EntityDefs) once the player has run power out
   to it, like every other national building.

   `revealed` is saved: a world saved mid-scene plays it again on load.
   ═══════════════════════════════════════════════════════════════════ */
const CompanyHQ = (() => {
  const SETTLE     = 2.5;    // sim seconds the reactor's own light-up gets before the scene takes over
  const FW_HOURS   = 2;      // in-game hours the fireworks go on after the scene
  // The scene's song (one of MusicSystem's), and the scene is cut to it. The
  // wraps come off on the big downbeat at 1:25 (DRUMS_AT: the loudest hit in
  // the file's kick band there, after a bar with the hats dropped out). The
  // song runs 2.669 s a bar, so it is joined twelve bars before that
  // (SONG_AT) and the plot is first seen four bars before it (PLOT_AT).
  const SONG       = 'audio/music/Been A Minute grid.mp3';
  const DRUMS_AT   = 85.4, BAR = 2.669, SONG_AT = DRUMS_AT - 12 * BAR, PLOT_AT = DRUMS_AT - 4 * BAR;
  // The scene's beats, in real seconds.
  const T_FLY = 2.6, T_HERO = 0.7, T_HERO_LEN = 5;
  const T_CAPS = [6.2, 10.4], CAP_LEN = 3.8;
  const T_REVEAL = DRUMS_AT - SONG_AT, T_COUNT = T_REVEAL - 3;
  const T_TEASE = 15.2, T_CUT = PLOT_AT - SONG_AT - 1.0;          // (the dip to black starts lifting on the hit)
  const T_NAME = T_REVEAL + 1.7, T_GO = T_REVEAL + 5.6;
  const CUT_OUT = 0.5, CUT_HOLD = 0.5, CUT_IN = 0.8;

  let revealed = false, fwUntil = 0, settle = 0;
  let scene = null, root = null, fx = null, g = null, raf = 0, lastNow = 0;

  const hq    = () => { for (const e of EntityRegistry.getByType(T.COMPANYHQ)) return e; return null; };
  const _city = () => (typeof CityInfo !== 'undefined' && CityInfo.getCityName()) || 'the city';
  const _co   = () => (typeof CityInfo !== 'undefined' && CityInfo.getCompanyName()) || 'your company';
  const _esc  = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const _mid  = e => ({ x: (e.col + (e.width || 1) / 2) * TILE, y: (e.row + (e.height || 1) / 2) * TILE });
  const _padOn = () => typeof GamepadInput !== 'undefined' && GamepadInput.connected;
  const ease = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  const clamp01 = u => Math.max(0, Math.min(1, u));
  const _fw = () => (typeof NationalProject !== 'undefined' && NationalProject.fw) || null;

  // The reactor that earned it: one that is lit and burning.
  function _reactor() {
    for (const e of EntityRegistry.getByType(T.ADVFUSIONREACTOR)) if (e._started && e._generating) return e;
    return null;
  }
  // GovernmentSystem's milestone: an Advanced Fusion Reactor is running.
  function due() { return !!_reactor(); }

  // What the sprite needs: under wraps until the scene has unveiled it, and
  // shown lit (whatever the hour, wired up or not) while the scene is on it.
  function visual() { return { veiled: !revealed, showcase: !!scene && revealed }; }

  function _busy() {
    for (const m of [typeof NationalProject !== 'undefined' && NationalProject, typeof FusionResearch !== 'undefined' && FusionResearch,
                     typeof ResearchMilestone !== 'undefined' && ResearchMilestone, typeof IntroCinematic !== 'undefined' && IntroCinematic]) {
      if (m && m.isActive && m.isActive()) return true;
    }
    return false;
  }

  function tick(dt) {
    if (scene || revealed) return;
    if (typeof ContractSystem !== 'undefined' && ContractSystem.isAway()) return;
    const e = hq();
    if (!e) { settle = 0; return; }
    if (_busy()) return;
    settle += dt;
    if (settle >= SETTLE) _startScene(e);
  }

  // ═══ The scene ══════════════════════════════════════════════════
  function _fit(e, kw, kh) {
    const z = Math.min(innerWidth * kw / (e.width * TILE), innerHeight * kh / (e.height * TILE));
    return Math.max(Camera.ZOOM_MIN || 0.3, Math.min(1.4, z));
  }

  function _startScene(e) {
    const z0 = Camera.zoom;
    const from = { x: Camera.x + innerWidth / z0 / 2, y: Camera.y + innerHeight / z0 / 2 };
    const rx = _reactor();
    const zH = _fit(e, 0.8, 0.64), m = _mid(e);
    let pop = 0;
    for (const t of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) for (const b of EntityRegistry.getByType(t)) if (b.fromRequest) pop += (b._population || 0);
    const day = DayNight.day(), gen = Math.round(PowerNetwork.stats.totalGenerated || 0);
    scene = {
      e, clock: 0, from, z0,
      // the reactor, if there is one to look at (a dev-spawned HQ has none)
      rTo: rx ? _mid(rx) : from, rZ: rx ? _fit(rx, 0.5, 0.5) : z0,
      // the plot, framed in the upper part of the shot so its name can sit under it
      hTo: { x: m.x, y: m.y + innerHeight * 0.085 / zH }, hZ: zH,
      speed: typeof DevMode !== 'undefined' ? DevMode.timeScale : 1,
      count: -1, done: {}, song: null, songOn: false, wait: 0, skipAt: -1, padB: false, holdReady: false, sparks: [], rings: [],
      caps: [
        `DAY ${day} · ${pop.toLocaleString('en-US')} PEOPLE · ${formatPower(gen)} ON THE GRID`,
        'WIND · COAL · OIL · THE ATOM · AND NOW A STAR OF YOUR OWN',
      ],
    };
    if (typeof DevMode !== 'undefined') DevMode.setTimeScale(0);
    // Its song; it plays on after the scene and the rotation resumes when it ends.
    try { if (!(typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.ownsMusic?.())) scene.song = MusicSystem.play(SONG, SONG_AT); } catch (_e) {}

    const CO = _esc(_co()).toUpperCase(), CITY = _esc(_city()).toUpperCase();
    // Its pay and its government grant (the negative upkeep): both are paid.
    const income = EntityDefs[T.COMPANYHQ].income, grant = Math.max(0, -(EntityDefs[T.COMPANYHQ].upkeep || 0));
    root = document.createElement('div');
    root.id = 'gw-hq';
    root.innerHTML = `
      <canvas class="hq-fx"></canvas>
      <div class="hq-bar hq-top"><span>◆ ${CO}</span><span class="hq-r">${CITY} · DAY ${day}</span></div>
      <div class="hq-bar hq-bot"><span class="hq-status">STELLARATOR BURNING · D-He3</span><span class="hq-skip"><span class="hq-skip-label"></span><i></i></span></div>
      <div class="hq-hero"><i>${CITY} · DAY ${day}</i><b>ADVANCED FUSION</b><em>ONLINE</em></div>
      <div class="hq-cap"></div>
      <div class="hq-say"><i></i><b></b></div>
      <div class="hq-count"></div>
      <div class="hq-title">
        <div class="hq-eyebrow">A GIFT FROM THE GOVERNMENT AND PEOPLE OF ${CITY}</div>
        <div class="hq-big" style="font-size:min(96px, 11vh, calc(86vw / ${Math.max(8, _co().length * 0.9).toFixed(1)}))">${CO}</div>
        <div class="hq-sub">HEADQUARTERS</div>
        <div class="hq-pill"><span>YOURS, IN THE NATIONAL GOVERNMENT ZONE · RUN POWER OUT TO IT</span><b>+$${(income + grant).toLocaleString('en-US')}/s</b></div>
        ${grant ? `<div class="hq-pill-note">$${income.toLocaleString('en-US')}/s INCOME + $${grant.toLocaleString('en-US')}/s GOVERNMENT GRANT</div>` : ''}
        <div class="hq-go"></div>
      </div>`;
    document.body.appendChild(root);
    document.body.classList.add('gw-hq');
    root.querySelector('.hq-skip-label').textContent = _padOn() ? 'HOLD Ⓑ TO SKIP' : (window.GW_MOBILE ? 'HOLD SCREEN TO SKIP' : 'HOLD ESC TO SKIP');
    root.querySelector('.hq-go').textContent = _padOn() ? 'PRESS Ⓐ TO CONTINUE' : 'CLICK TO CONTINUE';
    fx = root.querySelector('.hq-fx'); g = fx.getContext('2d');
    _resize();
    window.addEventListener('resize', _resize);
    window.addEventListener('keydown', _onKey, true);
    window.addEventListener('keyup', _onKeyUp, true);
    root.addEventListener('mousedown', () => _advance());
    root.addEventListener('wheel', ev => ev.preventDefault(), { passive: false });
    const fw = _fw();
    if (fw) { fw.reset(); fw.load(); }
    lastNow = 0;
    raf = requestAnimationFrame(_frame);
  }

  function _resize() {
    if (!fx) return;
    const dpr = window.devicePixelRatio || 1;
    fx.width = Math.round(innerWidth * dpr); fx.height = Math.round(innerHeight * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function _onKey(ev) {
    if (!scene) return;
    if (ev.key === 'F11' || ev.key === 'F12') return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (ev.key === 'Escape') { if (scene.skipAt < 0) scene.skipAt = performance.now(); return; }
    if (!ev.repeat && (ev.key === 'Enter' || ev.key === ' ')) _advance();
  }
  function _onKeyUp(ev) { if (!scene) return; if (ev.key === 'Escape') scene.skipAt = -1; ev.stopImmediatePropagation(); }
  // From gamepad_input.js while the scene is up.
  function padFrame(aDown, bHeld) {
    if (!scene) return;
    if (aDown) _advance();
    if (bHeld && !scene.padB) scene.skipAt = performance.now();
    if (!bHeld && scene.padB) scene.skipAt = -1;
    scene.padB = bHeld;
  }
  function _advance() { if (scene && scene.holdReady) _endScene(); }

  function _tone(freq, dur, vol, type = 'sine', delay = 0) {
    const c = typeof SFX !== 'undefined' && SFX.context ? SFX.context() : null;
    if (!c) return;
    const v = vol * (SFX.getVolume ? SFX.getVolume() : 1), now = c.currentTime + delay;
    const o = c.createOscillator(), gn = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, now);
    gn.gain.setValueAtTime(0.0001, now); gn.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), now + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.connect(gn); gn.connect(c.destination); o.start(now); o.stop(now + dur + 0.05);
  }

  // Where the plot is on screen: its centre, and its crown (the top of the
  // main tower is at 800, 150 of the 1600×1280 art in renderCompanyHQ).
  function _hqScreen() {
    const e = scene.e, z = Camera.zoom;
    const at = (ax, ay) => ({ x: ((e.col + e.width * ax / 1600) * TILE - Camera.x) * z, y: ((e.row + e.height * ay / 1280) * TILE - Camera.y) * z });
    return { mid: at(800, 640), crown: at(800, 150), base: at(800, 960), w: e.width * TILE * z, h: e.height * TILE * z };
  }

  // Once per scene, at time `at`: `fn` if the scene got there by playing
  // (not by a hitch or a skip jumping far past it).
  function _once(key, at, fn) {
    const s = scene;
    if (s.clock < at || s.done[key]) return;
    s.done[key] = 1;
    if (s.clock < at + 1.5) fn();
  }
  function _cap(text, dur) {
    const el = root.querySelector('.hq-cap');
    el.classList.remove('in'); void el.offsetWidth;
    el.style.animationDuration = dur + 's';
    el.textContent = text; el.classList.add('in');
  }
  function _say(step, l1, l2) {
    const el = root.querySelector('.hq-say');
    if (step === 1) { el.firstElementChild.textContent = l1; el.lastElementChild.textContent = l2; }
    el.classList.toggle('a', step >= 1); el.classList.toggle('b', step >= 2);
  }

  function _reveal() {
    const s = scene;
    revealed = true;
    s.revealAt = s.clock;
    root.querySelector('.hq-count').classList.remove('in');
    root.querySelector('.hq-cap').classList.remove('in');
    root.querySelector('.hq-status').textContent = `${_co().toUpperCase()} HEADQUARTERS · UNVEILED`;
    try { BuildingSpriteCache.clear(); } catch (_e) {}         // the wraps come off this frame, not at the next re-bake
    try { SFX.unlock?.(); SFX.goodConnect?.(0.3); } catch (_e) {}
    [261.6, 329.6, 392, 523.3, 659.3].forEach((f, i) => _tone(f, 3.4, 0.07 - i * 0.008, 'sine', i * 0.07));
    _tone(65.4, 3, 0.16, 'sawtooth');
    Camera.shake?.(18);
    s.rings.push({ at: s.clock, speed: 1 }, { at: s.clock + 0.3, speed: 0.7 });
    const c = _hqScreen().crown;
    for (let i = 0; i < 180; i++) {
      const a = Math.random() * Math.PI * 2, sp = 160 + Math.random() * 820;
      s.sparks.push({ x: c.x, y: c.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: 0.9 + Math.random() * 1.7, age: 0, gold: Math.random() < 0.6 });
    }
  }

  function _frame(now) {
    if (!scene) return;
    raf = requestAnimationFrame(_frame);
    const dt = lastNow ? Math.min(0.05, (now - lastNow) / 1000) : 0;
    lastNow = now;
    const s = scene, song = s.song;
    // The song keeps the time. The scene waits (a moment, at most) for it to
    // start, and if a hitch lets the picture slip it catches up to the music.
    const playing = song && !song.paused && song.currentTime >= SONG_AT;
    if (song && !s.songOn) { if (playing) s.songOn = true; else if ((s.wait += dt) < 2.5) { _draw(0); return; } }
    s.clock += dt;
    if (playing && !s.holdReady) { const a = song.currentTime - SONG_AT; if (Math.abs(a - s.clock) > 0.1) s.clock = a; }
    if (typeof DevMode !== 'undefined' && DevMode.timeScale !== 0) DevMode.setTimeScale(0);
    const c = s.clock, q = sel => root.querySelector(sel);

    // Camera: fly to the reactor and push in on it; cut (through black) to
    // the plot and push in on that until the wraps come off.
    const cutAt = T_CUT + CUT_OUT + CUT_HOLD * 0.5;
    if (c < cutAt) {
      const u = ease(clamp01(c / T_FLY));
      Camera.setZoom((s.z0 + (s.rZ - s.z0) * u) * (1 + 0.06 * clamp01((c - T_FLY) / (cutAt - T_FLY))));
      Camera.jumpTo(s.from.x + (s.rTo.x - s.from.x) * u, s.from.y + (s.rTo.y - s.from.y) * u);
    } else {
      Camera.setZoom(s.hZ * (0.9 + 0.1 * ease(clamp01((c - cutAt) / (T_REVEAL + 2.5 - cutAt)))));
      Camera.jumpTo(s.hTo.x, s.hTo.y);
    }

    // 1. How far it has come.
    _once('hero', T_HERO, () => {
      const el = q('.hq-hero'); el.style.animationDuration = T_HERO_LEN + 's'; el.classList.add('in');
      try { SFX.achievement?.(); } catch (_e) {}
      [196, 293.7, 392, 587.3].forEach((f, i) => _tone(f, T_HERO_LEN - 0.6, 0.05 - i * 0.007));
    });
    s.caps.forEach((line, i) => _once('cap' + i, T_CAPS[i], () => { _cap(line, CAP_LEN); _tone(392 + i * 65, 0.8, 0.035); }));
    // 2. The surprise.
    _once('t1', T_TEASE, () => { _say(1, `THE GOVERNMENT OF ${_city().toUpperCase()} HAS BEEN WATCHING`, 'THEY HAVE PREPARED A SURPRISE.'); _tone(110, 2.6, 0.08, 'triangle'); });
    _once('t2', T_TEASE + 1.2, () => _say(2));
    if (c >= T_CUT && !s.done.t3) { s.done.t3 = 1; _say(0); }
    _once('site', cutAt, () => { q('.hq-status').textContent = 'NATIONAL GOVERNMENT ZONE · PLOT UNDER WRAPS'; });
    _once('cap3', T_CUT + CUT_OUT + CUT_HOLD + 0.2, () => _cap('BUILT IN SECRET · WHILE YOU WERE BUSY LIGHTING A STAR', T_COUNT - T_CUT - CUT_OUT - CUT_HOLD - 0.1));
    // 3. The count, and the wraps come off.
    if (c >= T_COUNT && c < T_REVEAL) {
      const k = Math.floor(c - T_COUNT);
      if (k !== s.count) {
        s.count = k;
        const el = q('.hq-count');
        el.textContent = String(Math.round(T_REVEAL - T_COUNT) - k);
        el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
        _tone(330 + k * 82, 0.4, 0.11, 'square');
        Camera.shake?.(2 + k * 2);
      }
    }
    if (c >= T_REVEAL && !revealed) _reveal();
    if (revealed && c >= T_NAME && !s.done.name) {
      s.done.name = 1;
      q('.hq-title').classList.add('in');
      try { SFX.achievement?.(); } catch (_e) {}
    }
    if (revealed && c >= T_GO && !s.holdReady) { s.holdReady = true; q('.hq-go').classList.add('in'); }

    // Skip: straight to the building, unveiled.
    const su = s.skipAt < 0 ? 0 : clamp01((now - s.skipAt) / 900);
    q('.hq-skip i').style.transform = `scaleX(${su})`;
    if (su >= 1) { _endScene(); return; }

    // Fireworks, once it is unveiled: a barrage, then a steady show.
    const fw = _fw();
    if (fw) {
      const z = Camera.zoom, x0 = Camera.x, y0 = Camera.y, lt = revealed ? c - s.revealAt : -1;
      fw.step(dt, x0, y0, x0 + innerWidth / z, y0 + innerHeight / z, lt < 0.15 ? null : lt < 7 ? [0.09, 0.26] : [0.3, 0.7], 0.9, true);   // over the headquarters only
    }
    _draw(dt);
  }

  // The building itself, drawn again on the scene's canvas: above the night
  // and the vignette, so it stands fully lit however dark the hour. (`ctx`
  // is the renderers' shared context, swapped as BuildingSpriteCache does.)
  function _drawLit(a) {
    const e = scene.e, z = Camera.zoom, dpr = window.devicePixelRatio || 1;
    g.save();
    g.globalAlpha = a;
    g.setTransform(dpr * z, 0, 0, dpr * z, -Camera.x * z * dpr, -Camera.y * z * dpr);
    const main = ctx;
    ctx = g;
    try { renderCompanyHQ(e, e.col * TILE, e.row * TILE, performance.now() / 1000); } catch (_e) {} finally { ctx = main; }
    g.restore();
  }

  function _draw(dt) {
    const s = scene, W = innerWidth, H = innerHeight, c = s.clock;
    const cutAt = T_CUT + CUT_OUT + CUT_HOLD * 0.5;
    g.clearRect(0, 0, W, H);
    const lt = revealed ? c - s.revealAt : -1;
    // Darken the world so the lights carry it, but as a vignette: whatever
    // the reactor shot is of stays as bright as the hour allows (it may
    // well be night already) and the rest falls away. Over the plot it
    // closes right in, and stays closed: once the wraps are off the building
    // is drawn again above it (_drawLit), lit, with the dark all round it.
    const hp = c >= cutAt ? _hqScreen() : null;
    const vx = hp ? hp.mid.x : W / 2, vy = hp ? hp.mid.y : H / 2, vr = hp ? Math.max(hp.w, hp.h) * 0.62 : Math.min(W, H) * 0.42;
    const inner = c < cutAt ? 0.04 + 0.1 * clamp01((c - T_HERO) / 1.2) : 0.56;
    const outer = c < cutAt ? 0.2 + 0.36 * clamp01((c - T_HERO) / 1.2) : 0.66;
    const vg = g.createRadialGradient(vx, vy, vr * 0.75, vx, vy, vr * 1.9);
    vg.addColorStop(0, `rgba(2,6,14,${inner.toFixed(3)})`); vg.addColorStop(1, `rgba(2,6,14,${outer.toFixed(3)})`);
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    // the dip to black the camera cuts under
    const d = c - T_CUT;
    const cut = d < 0 ? 0 : d < CUT_OUT ? d / CUT_OUT : d < CUT_OUT + CUT_HOLD ? 1 : Math.max(0, 1 - (d - CUT_OUT - CUT_HOLD) / CUT_IN);
    if (cut > 0) { g.fillStyle = `rgba(0,0,0,${cut.toFixed(3)})`; g.fillRect(0, 0, W, H); }

    if (lt >= 0) _drawLit(clamp01(lt / 0.5));

    g.save();
    g.globalCompositeOperation = 'lighter';
    if (c >= cutAt) {
      const p = _hqScreen();
      if (lt < 0) {
        // Under wraps: searchlights feeling over it, tightening with the count.
        const k = clamp01((c - T_COUNT) / (T_REVEAL - T_COUNT));
        for (let i = 0; i < 4; i++) {
          const ox = i % 2 ? W * 1.02 : -W * 0.02, oy = i < 2 ? H * 1.02 : H * 0.55;
          const tx = p.mid.x + Math.sin(c * (0.5 + i * 0.13) + i * 1.7) * p.w * 0.42 * (1 - 0.7 * k);
          const ty = p.mid.y + Math.cos(c * (0.4 + i * 0.11) + i) * p.h * 0.36 * (1 - 0.7 * k);
          const a = Math.atan2(ty - oy, tx - ox), len = Math.hypot(tx - ox, ty - oy) * 1.25, wd = 0.035;
          const gr = g.createLinearGradient(ox, oy, tx, ty);
          gr.addColorStop(0, `rgba(190,225,255,${(0.2 + 0.12 * k).toFixed(3)})`); gr.addColorStop(1, 'rgba(190,225,255,0.02)');
          g.fillStyle = gr;
          g.beginPath(); g.moveTo(ox, oy);
          g.lineTo(ox + Math.cos(a - wd) * len, oy + Math.sin(a - wd) * len);
          g.lineTo(ox + Math.cos(a + wd) * len, oy + Math.sin(a + wd) * len);
          g.closePath(); g.fill();
        }
        if (k > 0) {
          const r = Math.max(p.w, p.h) * (0.75 - 0.2 * k);
          g.strokeStyle = `rgba(255,206,110,${(0.25 + 0.5 * k).toFixed(3)})`; g.lineWidth = 2 + 3 * k;
          for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(p.mid.x, p.mid.y, r + i * 26, c * (1 + i * 0.6), c * (1 + i * 0.6) + 4.4); g.stroke(); }
        }
      } else {
        // Unveiled: a flash, light standing behind the crown, rays turning.
        const f = lt < 0.08 ? 1 : Math.max(0, 1 - (lt - 0.08) / 1.1);
        if (f > 0) { g.fillStyle = `rgba(255,244,214,${(0.95 * f).toFixed(3)})`; g.fillRect(0, 0, W, H); }
        const pulse = 0.85 + 0.15 * Math.sin(c * 5), k = 0.35 + 0.65 * Math.exp(-lt / 3.5);
        const br = p.h * (0.75 + 0.1 * pulse);
        const gr = g.createRadialGradient(p.crown.x, p.crown.y, 0, p.crown.x, p.crown.y, br);
        gr.addColorStop(0, `rgba(255,250,235,${(0.5 * k * pulse).toFixed(3)})`); gr.addColorStop(0.3, `rgba(255,206,110,${(0.3 * k).toFixed(3)})`); gr.addColorStop(1, 'rgba(90,220,255,0)');
        g.fillStyle = gr; g.fillRect(p.crown.x - br, p.crown.y - br, br * 2, br * 2);
        const len = Math.hypot(W, H);
        for (let i = 0; i < 6; i++) {
          const a = c * 0.25 + i * Math.PI / 3;
          g.fillStyle = `rgba(255,220,150,${((0.05 + 0.03 * Math.sin(c * 2 + i)) * k).toFixed(3)})`;
          g.beginPath(); g.moveTo(p.crown.x, p.crown.y);
          g.lineTo(p.crown.x + Math.cos(a - 0.05) * len, p.crown.y + Math.sin(a - 0.05) * len);
          g.lineTo(p.crown.x + Math.cos(a + 0.05) * len, p.crown.y + Math.sin(a + 0.05) * len);
          g.closePath(); g.fill();
        }
      }
      for (const r of s.rings) {
        const rt = c - r.at; if (rt < 0) continue;
        const uu = clamp01(rt / (2.4 / r.speed)); if (uu >= 1) continue;
        g.strokeStyle = `rgba(255,226,170,${(0.8 * (1 - uu)).toFixed(3)})`; g.lineWidth = 3 + 8 * (1 - uu);
        g.beginPath(); g.arc(p.mid.x, p.mid.y, (1 - Math.pow(1 - uu, 2.4)) * Math.hypot(W, H), 0, 6.283); g.stroke();
      }
    }
    for (const sp of s.sparks) {
      sp.age += dt; const k = Math.pow(0.2, dt); sp.vx *= k; sp.vy = sp.vy * k + 260 * dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt;
      const a = 1 - sp.age / sp.life; if (a <= 0) continue;
      g.strokeStyle = sp.gold ? `rgba(255,${190 + 50 * a | 0},120,${a.toFixed(3)})` : `rgba(150,230,255,${a.toFixed(3)})`; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(sp.x, sp.y); g.lineTo(sp.x - sp.vx * 0.03, sp.y - sp.vy * 0.03); g.stroke();
    }
    s.sparks = s.sparks.filter(sp => sp.age < sp.life);
    const fw = _fw();
    if (fw) { const z = Camera.zoom, x0 = Camera.x, y0 = Camera.y; fw.draw(g, x => (x - x0) * z, y => (y - y0) * z, z, W, H); }
    g.restore();
    // A scrim under the name, so it reads over the forecourt.
    if (lt >= 0) {
      const a = 0.7 * clamp01((c - T_NAME + 0.4) / 1.2);
      if (a > 0) {
        const gr = g.createLinearGradient(0, H * 0.5, 0, H);
        gr.addColorStop(0, 'rgba(2,6,14,0)'); gr.addColorStop(0.55, `rgba(2,6,14,${a.toFixed(3)})`); gr.addColorStop(1, `rgba(2,6,14,${a.toFixed(3)})`);
        g.fillStyle = gr; g.fillRect(0, H * 0.5, W, H * 0.5);
      }
    }
  }

  function _endScene() {
    if (!scene) return;
    const s = scene;
    if (!revealed) { revealed = true; try { BuildingSpriteCache.clear(); } catch (_e) {} }
    scene = null;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', _resize);
    window.removeEventListener('keydown', _onKey, true);
    window.removeEventListener('keyup', _onKeyUp, true);
    const r = root; root = null; fx = null; g = null;
    r.classList.add('out');
    document.body.classList.remove('gw-hq');
    setTimeout(() => r.remove(), 800);
    // Leave the player looking at it, whole.
    Camera.setZoom(_fit(s.e, 0.8, 0.8)); Camera.jumpTo(_mid(s.e).x, _mid(s.e).y);
    if (typeof DevMode !== 'undefined') DevMode.setTimeScale(s.speed || 1);
    fwUntil = DayNight.getElapsed() + FW_HOURS * DayNight.secondsPerGameHour();   // the city goes on celebrating
    const e = s.e, def = EntityDefs[T.COMPANYHQ];
    // Stays up until the building is on the grid (GovernmentSystem.tick).
    NotificationStack.push({
      icon: '🏢', title: `${def.label} unveiled`,
      message: `The government of ${_city()} has built ${_co()} a headquarters in the National Government Zone. Run power out to it (${def.minDraw}–${formatPower(def.powerInput)}) and it pays $${def.income.toLocaleString('en-US')}/s, plus a $${Math.max(0, -(def.upkeep || 0)).toLocaleString('en-US')}/s government grant. Click to jump there`,
      color: '#ffce6e', border: '#6a4a10', tag: `${T.COMPANYHQ}-connect`, glow: true,
      onClick: () => { Camera.recentreOn(_mid(e).x, _mid(e).y); try { SFX.click(); } catch (_e) {} },
    });
    try { MessageLog.add(`🏢 ${def.label} unveiled in the National Government Zone`, '#ffce6e'); } catch (_e) {}
  }

  // The fireworks over the city after the scene (NationalProject.renderFireworks).
  function celebrating() { return !scene && revealed && DayNight.getElapsed() < fwUntil; }

  // ── Save / load ─────────────────────────────────────────────────
  function serialise() { return { revealed, fwUntil }; }
  function loadState(d) {
    if (scene) {                                              // (a load can't happen under the scene; belt and braces)
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', _resize);
      window.removeEventListener('keydown', _onKey, true);
      window.removeEventListener('keyup', _onKeyUp, true);
      if (root) root.remove();
      document.body.classList.remove('gw-hq');
      scene = null; root = null; fx = null; g = null;
    }
    revealed = !!(d && d.revealed); fwUntil = +(d && d.fwUntil) || 0; settle = 0;
  }

  return { tick, due, visual, padFrame, isActive: () => !!scene, celebrating, serialise, loadState,
           // Dev: play the unveiling again (console: CompanyHQ.replay()).
           replay() { const e = hq(); if (!e || scene) return false; revealed = false; try { BuildingSpriteCache.clear(); } catch (_e) {} _startScene(e); return true; } };
})();
