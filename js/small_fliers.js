/* ═══════════════════════════════════════════════════════════════════
   SMALL FLIERS — the little things in the air close to the ground.
   Ambient, like BirdFlocks and Wildlife: nothing reads it. A handful are
   kept around wherever the player is looking, and they drift off or fade
   out on their own.
     • fireflies: blinking over open ground on warm summer nights (and the
       warm end of spring), from dusk on — drawn over the night overlay,
       so they really glow;
     • butterflies: whites, sulphurs and blues by day through spring and
       summer, settling now and then with their wings slowly opening;
     • monarchs: through the first half of autumn, drifting south across
       the map like the geese overhead;
     • dragonflies: darting and hovering over water on warm days;
     • bats: flitting about from dusk through the night, spring to autumn
       (also drawn over the night overlay, as dark shapes).
   Rain and cold put them all away. They move on the render clock and hold
   still while the game is paused. Shapes are drawn straight to the canvas:
   they are only a few pixels across, so there is nothing to cache but the
   firefly's glow.
   ═══════════════════════════════════════════════════════════════════ */

const SmallFliers = (() => {
  const bugs = [];
  let lastT = null, spawnWait = 0;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ── Who is about now ────────────────────────────────────────────────
  const _season = () => (typeof Seasons !== 'undefined' && Seasons.enabled()) ? Seasons.index() : -1;   // -1: seasons off (summer-ish)
  const _warm   = () => (typeof Seasons !== 'undefined' && Seasons.enabled()) ? Seasons.warmth() : 0.6;
  const _temp   = () => typeof WeatherEventSystem !== 'undefined' && WeatherEventSystem.getTemperature ? WeatherEventSystem.getTemperature() : 18;
  const _rain   = () => typeof RainSystem !== 'undefined' && RainSystem.level ? RainSystem.level() : 0;
  const _dark   = () => typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;

  // How many of each kind the current view should hold.
  function _wanted(view) {
    const s = _season(), dark = _dark(), temp = _temp(), rain = _rain();
    const scale = clamp(view.w * view.h / (TILE * TILE * 600), 0.4, 2);
    const warmHalf = s === 1 || s === -1 || (s === 0 && _warm() > 0.3);
    const day = dark < 0.2, dry = rain < 0.05;
    const autumnEarly = s === 2 && typeof Seasons !== 'undefined' && Seasons.dayOfSeason() <= Seasons.SEASON_DAYS * 0.5;
    return {
      firefly:   warmHalf && dark > 0.35 && temp > 14 && rain < 0.08 ? Math.round(14 * scale) : 0,
      butterfly: (s === 0 || s === 1 || s === -1) && day && dry && temp > 12 ? Math.round(5 * scale) : 0,
      monarch:   autumnEarly && day && dry && temp > 10 ? Math.round(5 * scale) : 0,
      dragonfly: warmHalf && day && dry && temp > 16 ? Math.round(4 * scale) : 0,
      bat:       s !== 3 && dark > 0.3 && temp > 8 && rain < 0.2 ? Math.round((dark < 0.6 ? 5 : 3) * scale) : 0,
    };
  }

  // ── Where they may be ───────────────────────────────────────────────
  const _tileAt = (x, y) => [Math.floor(x / TILE), Math.floor(y / TILE)];
  function _water(x, y) {
    const [c, r] = _tileAt(x, y);
    return typeof GridManager !== 'undefined' && GridManager.inBounds(c, r) && typeof WaterSystem !== 'undefined' && WaterSystem.isWater(c, r);
  }
  // Open dry ground: no building or tree on it, no water.
  function _ground(x, y) {
    const [c, r] = _tileAt(x, y);
    if (typeof GridManager === 'undefined' || !GridManager.inBounds(c, r)) return false;
    return !_water(x, y) && !GridManager.getEntity(c, r);
  }
  const _inView = (b, v, m) => b.x > v.x - m && b.x < v.x + v.w + m && b.y > v.y - m && b.y < v.y + v.h + m;

  const BUTTERFLY = [   // fore wing, hind wing, edge/spot
    { fore: '#f4f2ea', hind: '#ecead8', edge: '#2a2a2a' },   // cabbage white
    { fore: '#f2da48', hind: '#e8cc38', edge: '#a88a20' },   // clouded sulphur
    { fore: '#8ab6ec', hind: '#7aa4dc', edge: '#3a4a6a' },   // spring azure
    { fore: '#f0a040', hind: '#e89030', edge: '#3a2418' },   // fritillary
  ];
  const MONARCH = { fore: '#e8742a', hind: '#e07024', edge: '#18120e' };
  const DRAGON = ['#2a78d8', '#2aa86a', '#d0402c', '#4a60c8'];

  function _spawn(kind, view) {
    for (let tries = 0; tries < 25; tries++) {
      let x = view.x + Math.random() * view.w, y = view.y + Math.random() * view.h;
      if (kind === 'monarch') {
        if (tries === 0 && Math.random() < 0.7) y = view.y - 30;           // mostly coming in over the top edge
      } else if (kind === 'dragonfly') {
        if (!_water(x, y)) continue;
      } else if (kind === 'firefly' || kind === 'butterfly') {
        if (!_ground(x, y)) continue;
      }
      const b = { kind, x, y, hx: x, hy: y, vx: 0, vy: 0, heading: Math.random() * Math.PI * 2, age: 0, alpha: 0,
                  ph: Math.random() * 10, timer: rand(0.3, 1.5), state: 'fly', leaving: false };
      if (kind === 'firefly') {
        b.life = rand(25, 50); b.period = rand(2.4, 4.5); b.flash = rand(0.7, 1.2);
        // Hovering: slow loose loops (a figure-of-eight-ish Lissajous) around
        // a spot that itself wanders off across the grass.
        b.loopR = rand(5, 13); b.loopSp = rand(0.35, 0.8) * (Math.random() < 0.5 ? -1 : 1); b.loopK = rand(1.3, 2.1);
      }
      else if (kind === 'butterfly') { b.life = rand(25, 55); b.col = BUTTERFLY[Math.floor(Math.random() * BUTTERFLY.length)]; b.size = rand(0.85, 1.15); }
      else if (kind === 'monarch') { b.life = 999; b.col = MONARCH; b.size = rand(1.15, 1.35); b.heading = Math.PI / 2 + rand(-0.5, 0.5); }
      else if (kind === 'dragonfly') { b.life = rand(25, 50); b.col = DRAGON[Math.floor(Math.random() * DRAGON.length)]; b.state = 'hover'; }
      else if (kind === 'bat') { b.life = rand(15, 35); b.speed = rand(70, 95); }
      bugs.push(b);
      return true;
    }
    return false;
  }

  // ── Behaviour ───────────────────────────────────────────────────────
  function _turn(b, ang, dt, rate) {
    const d = Math.atan2(Math.sin(ang - b.heading), Math.cos(ang - b.heading));
    b.heading += clamp(d, -rate * dt, rate * dt);
  }
  function _update(b, dt, view) {
    b.age += dt;
    b.ph += dt;
    const ending = b.age > b.life;
    switch (b.kind) {
      case 'firefly': {
        // Hovering a little above the grass: lazy loops round a spot that
        // drifts slowly on, so it lingers in one place and then moves along.
        b.vx = clamp(b.vx + (Math.random() - 0.5) * 8 * dt, -4, 4);
        b.vy = clamp(b.vy + (Math.random() - 0.5) * 8 * dt, -4, 4);
        b.hx += b.vx * dt; b.hy += b.vy * dt;
        const a = b.ph * b.loopSp;
        b.x = b.hx + Math.cos(a) * b.loopR + Math.sin(b.ph * 1.7) * 1.2;
        b.y = b.hy + Math.sin(a * b.loopK) * b.loopR * 0.6 + Math.cos(b.ph * 2.3) * 1.0;
        b.alpha = ending ? b.alpha - dt / 2 : Math.min(1, b.alpha + dt / 2);
        break;
      }
      case 'butterfly': case 'monarch': {
        if (b.state === 'rest') {
          if ((b.timer -= dt) <= 0) { b.state = 'fly'; b.timer = rand(3, 9); }
          break;
        }
        // Fluttering: a wandering heading, the body lurching with each beat.
        b.heading += (Math.random() - 0.5) * 5 * dt;
        if (b.kind === 'monarch') _turn(b, Math.PI / 2 + Math.sin(b.ph * 0.3) * 0.4, dt, 0.8);   // and south
        const sp = (b.kind === 'monarch' ? 30 : 22) * (0.6 + 0.6 * Math.abs(Math.sin(b.ph * 7)));
        b.x += Math.cos(b.heading) * sp * dt; b.y += Math.sin(b.heading) * sp * dt + Math.sin(b.ph * 7) * 6 * dt;
        if (b.kind === 'butterfly' && !ending && (b.timer -= dt) <= 0) {
          if (_ground(b.x, b.y) && Math.random() < 0.5) { b.state = 'rest'; b.timer = rand(1.5, 5); }
          else b.timer = rand(2, 6);
        }
        if (ending && b.kind === 'butterfly' && !b.leaving) { b.leaving = true; b.heading = Math.random() * Math.PI * 2; }
        b.alpha = b.age > b.life + 15 ? b.alpha - dt / 1.5 : Math.min(1, b.alpha + dt / 1.2);   // one that won't wander off just fades
        break;
      }
      case 'dragonfly': {
        if (b.state === 'hover') {
          b.x += Math.sin(b.ph * 9) * 2 * dt; b.y += Math.cos(b.ph * 7) * 2 * dt;
          if ((b.timer -= dt) <= 0) {
            // Dart to another spot over the water near home (or out, at the end).
            for (let i = 0; i < 8; i++) {
              const a = Math.random() * Math.PI * 2, d = rand(1, 3.5) * TILE;
              const tx = (ending ? b.x : b.hx) + Math.cos(a) * d * (ending ? 4 : 1), ty = (ending ? b.y : b.hy) + Math.sin(a) * d * (ending ? 4 : 1);
              if (ending || _water(tx, ty)) { b.tx = tx; b.ty = ty; b.state = 'dart'; break; }
            }
            if (b.state === 'hover') b.timer = rand(0.4, 1.2);
          }
        } else {
          const dx = b.tx - b.x, dy = b.ty - b.y, dist = Math.hypot(dx, dy);
          b.heading = Math.atan2(dy, dx);
          const step = Math.min(dist, 150 * dt);
          b.x += dx / (dist || 1) * step; b.y += dy / (dist || 1) * step;
          if (dist < 1) { b.state = 'hover'; b.timer = rand(0.4, 1.8); }
        }
        b.alpha = ending ? b.alpha - dt / 2 : Math.min(1, b.alpha + dt / 1);
        break;
      }
      case 'bat': {
        // Erratic: sharp jinks every fraction of a second, kept in over the view.
        if ((b.timer -= dt) <= 0) { b.heading += rand(-1.6, 1.6); b.timer = rand(0.15, 0.5); }
        if (!ending) {
          const cx = view.x + view.w / 2, cy = view.y + view.h / 2;
          if (Math.abs(b.x - cx) > view.w * 0.45 || Math.abs(b.y - cy) > view.h * 0.45) _turn(b, Math.atan2(cy - b.y, cx - b.x), dt, 4);
        }
        b.x += Math.cos(b.heading) * b.speed * dt; b.y += Math.sin(b.heading) * b.speed * dt;
        b.alpha = b.age > b.life + 10 ? b.alpha - dt / 1.5 : Math.min(1, b.alpha + dt / 1);
        break;
      }
    }
  }

  // ── Drawing ─────────────────────────────────────────────────────────
  const E = (ctx, x, y, rx, ry, col, rot = 0) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.05, rx), Math.max(0.05, ry), rot, 0, Math.PI * 2); ctx.fill(); };

  function _butterfly(ctx, b, al) {
    // Wings open and shut; resting ones fan slowly.
    const open = b.state === 'rest' ? 0.55 + 0.45 * Math.sin(b.ph * 1.6) : Math.abs(Math.cos(b.ph * 16));
    const s = b.size, c = b.col;
    ctx.save();
    if (!b.noShadow) { ctx.globalAlpha = al * 0.14; E(ctx, b.x + (b.state === 'rest' ? 1 : 6), b.y + (b.state === 'rest' ? 1.5 : 8), 2.6 * s * open + 0.4, 1.4 * s, '#000', b.heading); }   // shadow
    ctx.globalAlpha = al;
    ctx.translate(b.x, b.y); ctx.rotate(b.heading);
    for (const side of [-1, 1]) {
      const w = side * open;
      E(ctx, 0.6 * s, w * 2.1 * s, 1.9 * s, Math.abs(w) * 1.9 * s + 0.15, c.edge, side * 0.35);       // fore wing, dark rim
      E(ctx, 0.6 * s, w * 2.0 * s, 1.6 * s, Math.abs(w) * 1.6 * s + 0.1, c.fore, side * 0.35);
      E(ctx, -1.0 * s, w * 1.5 * s, 1.3 * s, Math.abs(w) * 1.3 * s + 0.1, c.hind, -side * 0.3);         // hind wing
      if (b.kind === 'monarch') {                                                                        // black veins
        ctx.strokeStyle = c.edge; ctx.lineWidth = 0.18;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1.6 * s, w * 3 * s); ctx.moveTo(0, 0); ctx.lineTo(-1.6 * s, w * 2.4 * s); ctx.stroke();
      } else E(ctx, 1.4 * s, w * 3.0 * s, 0.35 * s, Math.abs(w) * 0.35 * s + 0.05, c.edge);            // a spot near the tip
    }
    E(ctx, 0, 0, 1.5 * s, 0.32 * s, '#2a2420');                                                            // body
    ctx.restore();
  }

  function _dragonfly(ctx, b, al) {
    const flick = 0.35 + 0.25 * Math.abs(Math.sin(b.ph * 40));
    ctx.save();
    if (!b.noShadow) { ctx.globalAlpha = al * 0.12; E(ctx, b.x + 5, b.y + 7, 3.4, 0.7, '#000', b.heading); }
    ctx.globalAlpha = al;
    ctx.translate(b.x, b.y); ctx.rotate(b.heading);
    for (const [x, len] of [[0.9, 3.4], [-0.3, 3.0]]) for (const side of [-1, 1]) E(ctx, x, side * len * 0.55, 0.55, len * 0.55, `rgba(225,238,255,${flick})`, side * 0.12);
    E(ctx, -2.2, 0, 3.0, 0.35, b.col);                                                                     // long tail
    E(ctx, 1.0, 0, 1.1, 0.55, b.col);                                                                      // thorax
    E(ctx, 2.3, 0, 0.6, 0.65, '#1a2a30');                                                                  // big eyes
    ctx.restore();
  }

  function _bat(ctx, b, al) {
    const beat = Math.cos(b.ph * 22);
    const span = 5.5 * (0.45 + 0.55 * Math.abs(beat));
    ctx.save();
    ctx.globalAlpha = al * 0.95;
    ctx.translate(b.x, b.y); ctx.rotate(b.heading);
    ctx.fillStyle = '#2a2228';
    ctx.beginPath();
    ctx.moveTo(1.2, 0);
    for (const side of [1, -1]) {                                                                          // scalloped membrane
      ctx.lineTo(0.6, side * span * 0.25);
      ctx.lineTo(0.9, side * span);
      ctx.quadraticCurveTo(-0.2, side * span * 0.8, -0.6, side * span * 0.7);
      ctx.quadraticCurveTo(-0.8, side * span * 0.45, -1.4, side * span * 0.4);
      ctx.lineTo(-1.2, 0);
    }
    ctx.closePath(); ctx.fill();
    E(ctx, 0, 0, 1.4, 0.75, '#3a2e30');
    E(ctx, 1.4, 0, 0.6, 0.55, '#3a2e30');
    ctx.restore();
  }

  // The firefly's light: a soft green-gold glow, made once.
  let _glow = null;
  function _glowSprite() {
    if (_glow) return _glow;
    const S = 64, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(250,255,190,1)'); gr.addColorStop(0.12, 'rgba(220,255,120,0.95)');
    gr.addColorStop(0.35, 'rgba(170,235,70,0.35)'); gr.addColorStop(1, 'rgba(120,200,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    return (_glow = c);
  }
  // 0..1: how lit a firefly is now — a soft swell and fade once a period,
  // over a faint glow it keeps between flashes, so the eye can follow it
  // drifting about instead of seeing lights pop on and off.
  const FIREFLY_IDLE = 0.22;
  function _lit(b) {
    const u = (b.ph % b.period) / b.period, w = b.flash / b.period;
    const s = u < w ? Math.sin(Math.PI * u / w) : 0;
    return FIREFLY_IDLE + (1 - FIREFLY_IDLE) * s * s * (3 - 2 * s);
  }

  let _view = null, _fade = 0;
  return {
    // Dev / trailer: put `n` of `kind` in view now, whatever the hour or season.
    spawnNow(kind, n = 6) {
      const z = Camera.zoom, view = { x: Camera.x, y: Camera.y, w: window.innerWidth / z, h: window.innerHeight / z };
      let made = 0;
      for (let i = 0; i < n * 4 && made < n; i++) if (_spawn(kind, view)) made++;
      return made;
    },
    KINDS: ['firefly', 'butterfly', 'monarch', 'dragonfly', 'bat'],
    // Previews: draw one `kind` at (x, y) in ctx's current space, `ph`
    // seconds into its flutter (butterfly colour `variant`, 0-3).
    preview(ctx, kind, x, y, ph = 0, variant = 0) {
      const b = { kind, x, y, heading: -Math.PI / 2, ph, state: 'fly', noShadow: true, size: kind === 'monarch' ? 1.25 : 1, period: 1, flash: 1,
                  col: kind === 'monarch' ? MONARCH : kind === 'dragonfly' ? DRAGON[variant % DRAGON.length] : BUTTERFLY[variant % BUTTERFLY.length] };
      if (kind === 'butterfly' || kind === 'monarch') _butterfly(ctx, b, 1);
      else if (kind === 'dragonfly') _dragonfly(ctx, b, 1);
      else if (kind === 'bat') _bat(ctx, b, 1);
      else if (kind === 'firefly') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(_glowSprite(), x - 9, y - 9, 18, 18); ctx.restore(); }
    },
    count: () => bugs.length,

    // Day pass: world space, camera transform applied, under the night
    // overlay. Also moves everything (once a frame).
    render(ctx, t) {
      let dt = lastT === null ? 0 : Math.min(0.25, Math.max(0, t - lastT));
      lastT = t;
      if (typeof DevMode !== 'undefined' && DevMode.timeScale === 0) dt = 0;   // paused
      const zoom = Camera.zoom;
      const view = _view = { x: Camera.x, y: Camera.y, w: window.innerWidth / zoom, h: window.innerHeight / zoom };
      _fade = clamp((zoom - 0.35) / 0.12, 0, 1);

      if (dt > 0 && zoom > 0.35 && (spawnWait -= dt) <= 0) {
        spawnWait = 0.12;
        const want = _wanted(view), have = {};
        for (const b of bugs) if (!b.leaving && b.age <= b.life) have[b.kind] = (have[b.kind] || 0) + 1;
        for (const k in want) if ((have[k] || 0) < want[k]) { _spawn(k, view); if (k !== 'firefly') spawnWait = rand(0.8, 2.5); break; }
      }
      for (let i = bugs.length - 1; i >= 0; i--) {
        const b = bugs[i];
        if (dt > 0) _update(b, dt, view);
        if (b.alpha < 0 || !_inView(b, view, 220) || (zoom <= 0.3 && dt > 0)) bugs.splice(i, 1);
      }
      if (_fade <= 0) return;
      ctx.save();
      for (const b of bugs) {
        if (!_inView(b, view, 20)) continue;
        const al = clamp(b.alpha, 0, 1) * _fade;
        if (b.kind === 'butterfly' || b.kind === 'monarch') _butterfly(ctx, b, al);
        else if (b.kind === 'dragonfly') _dragonfly(ctx, b, al);
      }
      ctx.restore();
    },

    // Night pass: over the night overlay (camera transform applied) — the
    // fireflies' light, and the bats as dark shapes against the dusk.
    renderNight(ctx) {
      if (!_view || _fade <= 0 || !bugs.length) return;
      const view = _view, glow = _glowSprite();
      ctx.save();
      for (const b of bugs) {
        if (b.kind !== 'bat' || !_inView(b, view, 20)) continue;
        _bat(ctx, b, clamp(b.alpha, 0, 1) * _fade);
      }
      ctx.globalCompositeOperation = 'lighter';
      for (const b of bugs) {
        if (b.kind !== 'firefly' || !_inView(b, view, 20)) continue;
        const l = _lit(b) * clamp(b.alpha, 0, 1) * _fade;
        if (l <= 0.02) continue;
        const r = 5 + 8 * l;
        ctx.globalAlpha = l;
        ctx.drawImage(glow, b.x - r, b.y - r, r * 2, r * 2);
      }
      ctx.restore();
    },
  };
})();
