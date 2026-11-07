/* ═══════════════════════════════════════════════════════════════════
   SEASONAL EVENT FX
   What the town looks like while one of its calendar events is on
   (seasonal_events.js). Drawing only: nothing here touches the sim.

   Two passes, both in world space:
     renderDay    in with the finished scene, under the night overlay:
                  bunting strung over every building taking part.
     renderNight  over the night overlay, because it is light: the
                  pledge markers, Festival of Lights rooflines, the music
                  festival's stage beams, and (through NationalProject's
                  fireworks) New Year's Eve.

   One thing here outlasts its event: the winter decorations. The town
   tree goes up and the house lights start appearing on the third day of
   winter and stay until the day before spring (decoSeason), a few more
   homes joining in each evening. The Festival of Lights is the night
   every one of them is lit, from mid-afternoon.

   Spooky Night gets a run-up too: its pumpkins and gravestones start
   going out three days ahead (spookyLead), a few more doorsteps each day,
   and the ghosts, fog and trick-or-treaters wait for the night itself.

   The pledge markers do a job as well as dress the scene: a pledged
   building that has gone dark gets a pulsing red outline, day or night,
   so the one house letting the pledge down can be found.
   ═══════════════════════════════════════════════════════════════════ */

const SeasonalEventFx = (() => {

  // ── Who to draw on ───────────────────────────────────────────────
  // Rebuilt once a second rather than per frame: the involved set only
  // changes when the town does.
  let _for = null, _at = 0;
  let involved = [];      // buildings the event pulls on (effects with mult > 1)
  let pledged  = [];      // the pledge's targets, as an array
  function refresh(fx) {
    const t = performance.now();
    if (_for === fx.id && t - _at < 1000) return;
    _for = fx.id; _at = t;
    involved = [];
    for (const ty of [T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL]) for (const e of EntityRegistry.getByType(ty)) {
      if (!e._clientOwned && SeasonalEvents.involves(e)) involved.push(e);
    }
    pledged = fx.targets ? [...fx.targets] : [];
  }

  // ── The holiday season ───────────────────────────────────────────
  // Days of winter (1-based) the decorations are up for, event or no event.
  const DECO_FROM = 3, DECO_TO = 13;
  function decoSeason() {
    if (typeof Seasons === 'undefined' || !Seasons.enabled() || Seasons.index() !== 3) return false;
    const d = Seasons.dayOfSeason();
    return d >= DECO_FROM && d <= DECO_TO;
  }
  // Who decorates: every home and every shop. Rebuilt once a second.
  let decorated = [], _decoAt = -1e9;
  function refreshDeco() {
    const t = performance.now();
    if (t - _decoAt < 1000) return;
    _decoAt = t;
    decorated = [];
    // Not a building site: nobody's moved in to put anything up yet.
    for (const e of EntityRegistry.getByType(T.HOUSE)) if (!e._clientOwned && !e.commercialSubtype && !e._constructing) decorated.push(e);
    for (const e of EntityRegistry.getByType(T.COMMERCIAL)) if (!e._clientOwned && !e._constructing) decorated.push(e);
    findGarlands();
  }

  // ── The run-up to Spooky Night ───────────────────────────────────
  // How much of the town has its pumpkins out: 0 when the night is not
  // within SPOOKY_LEAD days (or not on the calendar), rising to 1 by dusk
  // on the day.
  const SPOOKY_LEAD = 3;
  function spookyLead() {
    if (typeof SeasonalEvents === 'undefined' || !SeasonalEvents.startsIn) return 0;
    const s = SeasonalEvents.startsIn('spookynight');
    if (s === null || s <= 0) return 0;
    const d = s / (DayNight.secondsPerGameHour() * 24);
    return d > SPOOKY_LEAD ? 0 : 1 - 0.7 * d / SPOOKY_LEAD;
  }
  let homes = [], _homesAt = -1e9;
  function refreshHomes() {
    const t = performance.now();
    if (t - _homesAt < 1000) return;
    _homesAt = t;
    homes = [];
    for (const e of EntityRegistry.getByType(T.HOUSE)) if (!e._clientOwned && !e.commercialSubtype && !e._constructing) homes.push(e);
  }

  const hash = e => ((e.col * 73856093) ^ (e.row * 19349663)) >>> 0;
  const onScreen = (e, c0, c1, r0, r1, pad = 0) =>
    e.col + (e.width || 1) >= c0 - pad && e.col <= c1 + pad && e.row + (e.height || 1) >= r0 - pad && e.row <= r1 + pad;

  // Glow sprites, one per colour, drawn with 'lighter'.
  const _spr = new Map();
  function glow(rgb) {
    let c = _spr.get(rgb);
    if (c) return c;
    c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, `rgba(${rgb},1)`);
    gr.addColorStop(0.55, `rgba(${rgb},0.35)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    _spr.set(rgb, c);
    return c;
  }

  // ── Palettes ─────────────────────────────────────────────────────
  const BUNTING = [
    ['#ffb3c8', '#b8e8a0', '#fff1a0', '#a8d8ff'],   // spring: pastels
    ['#ff5050', '#ffd040', '#40c0ff', '#60e070'],   // summer: brights
    ['#e07020', '#c04020', '#e0b040', '#806030'],   // autumn: harvest
    ['#d02030', '#20a050', '#f0c040', '#f0f0f0'],   // winter: holiday
  ];
  const BUNTING_OWN = { spookynight: ['#f07818', '#18141c', '#7a3ab0', '#f07818', '#9ad030'] };   // an event with colours of its own
  const GLOW = ['255,200,150', '255,220,120', '255,170,80', '255,230,170'];   // a pledge-kept warm glow per season
  const TWINKLE = ['255,60,60', '60,220,90', '255,200,60', '80,150,255', '255,255,255'];
  const BEAMS = ['255,80,220', '80,220,255', '255,230,90', '140,110,255'];
  const STAGE_SUBS = ['venue', 'stadium', 'nightclub', 'disco', 'superclub', 'supperclub', 'holoarena', 'skycasino', 'bowling', 'amusementpark', 'waterpark'];

  // ── Day pass ─────────────────────────────────────────────────────
  // Bunting for every festival, then the event's own dressing (DAY_FX).
  function renderDay(ctx, t, c0, c1, r0, r1) {
    const fx = typeof SeasonalEvents !== 'undefined' && SeasonalEvents.fx();
    const tree = decoSeason() || (fx && fx.id === 'lights');
    const lead = fx && fx.id === 'spookynight' ? 0 : spookyLead();
    if (!fx && !tree && !lead) return;
    if (Camera.zoom < 0.35) return;                      // too small to read, too many to draw
    ctx.save();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';   // whatever the last layer left set
    if (fx) {
      refresh(fx);
      if (!fx.ev.hazard && Camera.zoom >= 0.45) bunting(ctx, t, c0, c1, r0, r1, BUNTING_OWN[fx.ev.id] || BUNTING[fx.ev.season] || BUNTING[1]);
      const own = DAY_FX[fx.ev.id];
      if (own) { ctx.globalAlpha = 1; own(ctx, t, view(c0, c1, r0, r1)); wiresBackOver(ctx, t); }
    }
    if (tree) { ctx.globalAlpha = 1; drawTownTree(ctx, t); }   // up for the season, not just the night
    if (lead) { ctx.globalAlpha = 1; refreshHomes(); DAY_FX.spookynight(ctx, t, view(c0, c1, r0, r1), homes, lead); }
    ctx.restore();
  }

  // Things an event stands on the ground (the fair's stalls, rides and
  // people) belong under the overhead cables, but this pass comes after
  // the wires and their sockets (render_main_loop.js). So the event lists
  // the rectangles it stood things in, and the wires are drawn again over
  // them, clipped to those rectangles so nothing else is drawn twice.
  let _underWires = null;
  function standsUnderWires(x, y, w, h) { (_underWires || (_underWires = [])).push(x, y, w, h); }
  function wiresBackOver(ctx, t) {
    const q = _underWires;
    _underWires = null;
    if (!q || typeof renderWirePass !== 'function') return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let i = 0; i < q.length; i += 4) {
      ctx.rect(q[i], q[i + 1], q[i + 2], q[i + 3]);
      x0 = Math.min(x0, q[i]); y0 = Math.min(y0, q[i + 1]);
      x1 = Math.max(x1, q[i] + q[i + 2]); y1 = Math.max(y1, q[i + 1] + q[i + 3]);
    }
    ctx.clip();
    // A cable is drawn by the wire tile it leaves from, next to the plot.
    renderWirePass(Math.max(0, Math.floor(x0 / TILE) - 1), Math.ceil(x1 / TILE) + 1,
                   Math.max(0, Math.floor(y0 / TILE) - 1), Math.ceil(y1 / TILE) + 1, t);
    if (typeof _renderWireTerminals === 'function') _renderWireTerminals();
    ctx.restore();
  }

  function bunting(ctx, t, c0, c1, r0, r1, pal) {
    for (const e of involved) {
      if (!onScreen(e, c0, c1, r0, r1)) continue;
      // Along the roofline, where the building's outline is known (see fit()).
      const roof = roofOf(e);
      const fw = e.width || 1, fh = e.height || 1;
      const L = roof ? Math.max(0, Math.min(fw * 0.4, roof.left)) : 0, R = roof ? Math.min(fw, Math.max(fw * 0.6, roof.right)) : fw;
      const w = (R - L) * TILE;
      const x0 = (e.col + L) * TILE + TILE * 0.08, x1 = (e.col + L) * TILE + w - TILE * 0.08;
      const y  = (e.row + (roof ? Math.max(0, Math.min(fh * 0.8, roof.top)) : 0)) * TILE + TILE * 0.12;
      const sag = TILE * 0.16 * Math.sqrt(e.width || 1);
      const h = hash(e);
      // The string
      ctx.strokeStyle = 'rgba(40,36,30,0.7)'; ctx.lineWidth = Math.max(0.6, TILE * 0.018);
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.quadraticCurveTo((x0 + x1) / 2, y + sag * 2, x1, y); ctx.stroke();
      // The flags along it, swaying a little in the breeze
      const n = Math.max(3, Math.min(14, Math.round((e.width || 1) * 2.6)));
      const fs = TILE * 0.13;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const px = x0 + (x1 - x0) * u;
        const py = y + sag * 4 * u * (1 - u);
        const sway = Math.sin(t * 2.2 + i * 0.9 + (h & 63)) * fs * 0.25;
        ctx.fillStyle = pal[(i + h) % pal.length];
        ctx.beginPath(); ctx.moveTo(px - fs * 0.5, py); ctx.lineTo(px + fs * 0.5, py); ctx.lineTo(px + sway, py + fs * 1.15); ctx.closePath(); ctx.fill();
      }
    }
  }

  // ── Night pass ───────────────────────────────────────────────────
  let _fwOn = false;
  function renderNight(ctx, dark, t, c0, c1, r0, r1) {
    const fx = typeof SeasonalEvents !== 'undefined' && SeasonalEvents.fx();
    fireworks(fx);
    // The winter lights: all of them on festival night, a growing share of
    // them on every other evening of the season.
    const festival = !!fx && fx.id === 'lights';
    if (festival || decoSeason()) {
      refreshDeco();
      ctx.save();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
      rooflines(ctx, dark, t, c0, c1, r0, r1, festival);
      ctx.restore();
    }
    const lead = fx && fx.id === 'spookynight' ? 0 : spookyLead();
    if (lead) {                              // the pumpkins already out, lit after dark
      refreshHomes();
      ctx.save();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
      NIGHT_FX.spookynight(ctx, t, dark, view(c0, c1, r0, r1), homes, lead);
      ctx.restore();
    }
    if (!fx) return;
    refresh(fx);
    const ev = fx.ev;

    ctx.save();
    ctx.globalAlpha = 1;                    // ZoneLights, drawn just before, can leave it low
    ctx.globalCompositeOperation = 'lighter';
    if (ev.id === 'musicfest') stageBeams(ctx, dark, t, c0, c1, r0, r1);
    const own = NIGHT_FX[ev.id];
    if (own) { own(ctx, t, dark, view(c0, c1, r0, r1)); ctx.globalAlpha = 1; }
    // Pledge kept so far: a warm glow on each pledged building that is lit,
    // after dark. The Festival of Lights is already lit up on its own.
    if (dark > 0.08 && ev.id !== 'lights') {
      const spr = glow(GLOW[ev.season] || GLOW[1]);
      ctx.globalAlpha = Math.min(0.16, dark * 0.2);    // a hint: it sits on top of the porch and window lights
      for (const e of pledged) {
        if (!e.powered || !onScreen(e, c0, c1, r0, r1)) continue;
        const w = (e.width || 1) * TILE, h = (e.height || 1) * TILE;
        const r = Math.max(w, h) * 0.85;
        ctx.drawImage(spr, e.col * TILE + w / 2 - r, e.row * TILE + h / 2 - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Pledged but dark: a pulsing red outline, day or night.
    const pulse = 0.45 + 0.4 * Math.sin(t * 5);
    ctx.save();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(255,70,50,${pulse.toFixed(3)})`;
    ctx.lineWidth = Math.max(2.5, 3.5 / Math.max(0.3, Camera.zoom));
    ctx.setLineDash([TILE * 0.18, TILE * 0.1]);
    for (const e of pledged) {
      if (e.powered || !onScreen(e, c0, c1, r0, r1)) continue;
      const w = (e.width || 1) * TILE, h = (e.height || 1) * TILE;
      ctx.strokeRect(e.col * TILE - 2, e.row * TILE - 2, w + 4, h + 4);
    }
    ctx.restore();
  }

  // ── Festival of Lights ───────────────────────────────────────────
  //
  // Every household does its own thing. Each lit building gets a setup
  // picked off its hash: classic coloured bulbs, warm icicles, candy-cane
  // chasers, an all-blue frozen house, the one that can be seen from
  // space, and the neighbour who hung four bulbs on the porch and called
  // it done. Front gardens get lit trees, reindeer and snowmen; shops get
  // marquees, light curtains and roof stars; neighbours string garlands
  // across the street; and a town tree goes up outside City Hall.
  //
  // A setup is laid out once per building (a flat list of bulbs, in tiles
  // from the building's corner) and kept; a frame only works out how
  // bright each bulb is and draws its sprite.
  const LC = ['255,60,60', '60,220,90', '255,200,60', '80,150,255', '255,255,255',
              '255,214,150', '170,220,255', '255,110,200', '170,110,255', '255,140,50'];
  const RED = 0, GRN = 1, GOLD = 2, BLU = 3, WHT = 4, WARM = 5, ICE = 6, PINK = 7, PURP = 8, ORNG = 9;
  const MULTI = [RED, GRN, GOLD, BLU, PINK], CANDY = [RED, WHT], FROST = [ICE, BLU, WHT, ICE],
        NEON = [PINK, PURP, BLU, ICE, PURP], XMAS = [RED, GRN];
  // How a bulb behaves: twinkle, three-phase chase, slow two-group fade,
  // sparkle, a wave running along the string, or simply on.
  const TW = 0, CHASE = 1, FADE = 2, SPARK = 3, WAVE = 4, STEADY = 5;
  const STRIDE = 6;               // x, y, radius, colour, mode, phase
  const BULB_BUDGET = 9000;       // bulbs a frame; past it, buildings fall back to one glow each

  function lit(mode, ph, t) {
    switch (mode) {
      case CHASE: { const c = Math.cos((t * 2.2 - ph) * 2.0944); return c > 0 ? 0.22 + 0.78 * c * c : 0.22; }
      case FADE:  return 0.15 + 0.85 * (0.5 + 0.5 * Math.sin(t * 1.3 + ph * 3.1416));
      case SPARK: { const s = Math.sin(t * 2.3 + ph * 7.1); return s > 0.8 ? 0.5 + 2.5 * (s - 0.8) : 0.5; }
      case WAVE:  return 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2.6 - ph));
      case STEADY: return 0.88;
      default:    return 0.55 + 0.45 * Math.sin(t * 3.1 + ph);
    }
  }
  const phaseOf = (mode, i, seed) => mode === CHASE ? i % 3 : mode === FADE ? i % 2 : mode === WAVE ? i * 0.55 : i * 1.7 + (seed & 63);

  // A string of bulbs from one point to another, sagging by `sag` in the middle.
  function run(b, x0, y0, x1, y1, step, r, pal, mode, seed, sag = 0) {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      b.push(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + sag * 4 * u * (1 - u), r, pal[(i + seed) % pal.length], mode, phaseOf(mode, i, seed));
    }
  }
  // Round the roof: the top edge and part-way down the sides, or (`full`) right round.
  function outline(b, w, hh, step, r, pal, mode, seed, full) {
    const x0 = 0.06, x1 = w - 0.06, y0 = 0.08, y1 = full ? hh - 0.05 : hh * 0.66;
    run(b, x0, y0, x1, y0, step, r, pal, mode, seed);
    run(b, x1, y0 + step, x1, y1, step, r, pal, mode, seed + 1);
    run(b, x0, y0 + step, x0, y1, step, r, pal, mode, seed + 2);
    if (full) run(b, x0 + step, y1, x1 - step, y1, step, r, pal, mode, seed + 3);
  }
  function swags(b, x0, x1, y, n, depth, r, pal, mode, seed) {
    const d = (x1 - x0) / n;
    for (let k = 0; k < n; k++) run(b, x0 + d * k, y, x0 + d * (k + 1), y, 0.085, r, pal, mode, seed + k * 3, depth);
  }
  // Strands hanging off an edge, each its own length, a shimmer running down them.
  function icicles(b, x0, x1, y, step, maxN, h, col, drop = 0.075) {
    const n = Math.max(1, Math.round((x1 - x0) / step));
    for (let i = 0; i <= n; i++) {
      const len = 1 + Math.floor(rnd(h, i + 60) * maxN);
      for (let j = 0; j < len; j++) b.push(x0 + (x1 - x0) * i / n, y + j * drop, 0.05, col, WAVE, i * 0.6 - j * 0.9);
    }
  }
  function ring(b, cx, cy, rad, n, r, pal, mode, seed) {
    for (let i = 0; i < n; i++) { const a = i / n * 6.283; b.push(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, r, pal[(i + seed) % pal.length], mode, phaseOf(mode, i, seed)); }
  }
  // A lit tree: a string wound up a cone, a star on top.
  function tree(b, cx, base, ht, wd, pal, seed, r = 0.05) {
    const n = Math.round(ht * 26);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      b.push(cx + Math.sin(u * (5 + ht * 5) + (seed & 7)) * wd * 0.5 * (1 - u), base - u * ht, r, pal[(i + seed) % pal.length], TW, i * 1.7 + (seed & 31));
    }
    b.push(cx, base - ht - r * 0.6, r * 2.6, GOLD, STEADY, 0, cx, base - ht - r * 0.6, r * 1.3, WHT, SPARK, seed & 15);
  }
  const DEER = [[-.5, -.55], [-.3, -.58], [-.1, -.58], [.1, -.58], [.3, -.55], [-.58, -.64],
                [-.45, -.36], [-.46, -.17], [-.48, 0], [-.28, -.36], [-.26, -.17], [-.24, 0],
                [.22, -.36], [.2, -.17], [.18, 0], [.4, -.36], [.42, -.17], [.44, 0],
                [.42, -.74], [.5, -.92], [.58, -1.08], [.74, -1.1],
                [.5, -1.26], [.44, -1.4], [.62, -1.32], [.68, -1.46]];
  function reindeer(b, cx, base, s, dir, h) {
    for (let i = 0; i < DEER.length; i++) b.push(cx + DEER[i][0] * s * dir, base + DEER[i][1] * s, 0.04, WARM, SPARK, i + (h & 15));
    b.push(cx + 0.86 * s * dir, base - 1.07 * s, 0.055, RED, TW, h & 7);
  }
  function snowman(b, cx, base, h) {
    ring(b, cx, base - 0.11, 0.1, 8, 0.045, [WHT], STEADY, h);
    ring(b, cx, base - 0.28, 0.07, 6, 0.045, [WHT], STEADY, h);
    b.push(cx, base - 0.41, 0.075, WHT, STEADY, 0, cx + 0.05, base - 0.4, 0.035, ORNG, STEADY, 0);
  }
  function snowflake(b, cx, cy, rad, h, r = 0.05) {
    b.push(cx, cy, r * 1.5, WHT, SPARK, h & 7);
    for (let k = 0; k < 6; k++) {
      const a = k * 1.0472 + 0.5236, ca = Math.cos(a), sa = Math.sin(a);
      for (const u of [0.34, 0.67, 1]) b.push(cx + ca * rad * u, cy + sa * rad * u, r, u === 1 ? WHT : ICE, SPARK, k + u * 3 + (h & 7));
      for (const s of [-1, 1]) { const a2 = a + s * 0.7; b.push(cx + ca * rad * 0.6 + Math.cos(a2) * rad * 0.28, cy + sa * rad * 0.6 + Math.sin(a2) * rad * 0.28, r * 0.85, ICE, SPARK, k * 2 + s + (h & 7)); }
    }
  }
  function star(b, cx, cy, rad, col, mode, h, r = 0.05) {
    for (let k = 0; k < 10; k++) {
      const a0 = -1.5708 + k * 0.6283, a1 = a0 + 0.6283, r0 = k % 2 ? rad * 0.42 : rad, r1 = k % 2 ? rad : rad * 0.42;
      for (let j = 0; j < 2; j++) {
        const u = j / 2;
        b.push(cx + (Math.cos(a0) * r0) * (1 - u) + (Math.cos(a1) * r1) * u, cy + (Math.sin(a0) * r0) * (1 - u) + (Math.sin(a1) * r1) * u, r, col, mode, phaseOf(mode, k * 2 + j, h));
      }
    }
  }
  // Candy-cane stakes down both sides of the front path.
  function candyPath(b, cx, y0, n) {
    for (let j = 0; j < n; j++) for (const s of [-1, 1]) b.push(cx + s * 0.13, y0 + j * 0.13, 0.055, (j + (s > 0)) % 2 ? RED : WHT, CHASE, j % 3);
  }
  function arch(b, cx, base, wd, ht, pal, mode, h) {
    const n = 11;
    for (let i = 0; i <= n; i++) { const a = Math.PI * i / n; b.push(cx - Math.cos(a) * wd / 2, base - Math.sin(a) * ht, 0.05, pal[(i + h) % pal.length], mode, phaseOf(mode, i, h)); }
  }
  // Net lights thrown over the roof: two colours trading places.
  function net(b, x0, y0, x1, y1, step, r) {
    const nx = Math.max(1, Math.round((x1 - x0) / step)), ny = Math.max(1, Math.round((y1 - y0) / step));
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) b.push(x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny, r, XMAS[(i + j) % 2], FADE, (i + j) % 2);
  }
  // A curtain of drops down a shop front, its hem cut in a wave.
  function curtain(b, x0, x1, y, maxLen, step, h) {
    const n = Math.max(1, Math.round((x1 - x0) / step));
    for (let i = 0; i <= n; i++) {
      const len = maxLen * (0.45 + 0.55 * Math.abs(Math.sin(i * 0.55 + (h & 7))));
      for (let d = 0; d < len; d += 0.13) b.push(x0 + (x1 - x0) * i / n, y + d, 0.055, d + 0.13 >= len ? WHT : ICE, WAVE, i * 0.45 - d * 5);
    }
  }
  // Strings run from a mast in the middle of the roof out to its edge.
  function maypole(b, cx, cy, w, hh, n, h) {
    for (let k = 0; k < n; k++) {
      const a = k / n * 6.283 + 0.3, ex = cx + Math.cos(a) * w * 0.47, ey = cy + Math.sin(a) * hh * 0.47;
      run(b, cx, cy, ex, ey, 0.2, 0.065, [MULTI[k % MULTI.length]], CHASE, h);
    }
    b.push(cx, cy, 0.22, GOLD, STEADY, 0, cx, cy, 0.12, WHT, SPARK, h & 15);
  }

  // A string of bulbs along a polyline ([[x, y], ...]), evenly spaced.
  function runPoly(b, pts, step, r, pal, mode, seed) {
    let i = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [x0, y0] = pts[k], [x1, y1] = pts[k + 1], len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.round(len / step));
      for (let s = k ? 1 : 0; s <= n; s++, i++) {
        const u = s / n;
        b.push(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, r, pal[(i + seed) % pal.length], mode, phaseOf(mode, i, seed));
      }
    }
  }

  // ── Homes, on the house as drawn ─────────────────────────────────
  // Laid out on the outline BuildingSnow read off the house's own sprite
  // (roof.prof: across the house, the roof's top and where it meets the
  // wall), so the lights go where people hang them: along the roofline,
  // whatever its pitch, from the gutters, down the corners of the house and
  // round the door, and the garden in front of it. The old layouts drew a
  // box round the footprint, which ran flat across a pitched roof, down the
  // middle of the walls and along the lawn in front.
  function homeOnRoof(b, roof, h, pick, yard) {
    const P = roof.prof, L = roof.left + 0.04, R = roof.right - 0.04, B = roof.bottom - 0.03, cx = (L + R) / 2;
    // The roofline, sitting just on the edge, out to the eaves at both ends.
    const ridge = [[L, P[0][1] + 0.05], ...P.map(([x, t]) => [x, t + 0.05]), [R, P[P.length - 1][1] + 0.05]];
    // The gutter: where the roof meets the wall.
    const gut = [[L, P[0][2]], ...P.map(([x, , e]) => [x, e]), [R, P[P.length - 1][2]]];
    const eL = P[0][2], eR = P[P.length - 1][2];
    const mids = P.slice(4, -4); const eMid = (mids.length ? mids : P).map(p => p[2]).sort((p, q) => p - q)[(mids.length || P.length) >> 1];
    const topMin = Math.min(...P.map(p => p[1]));
    const corners = (step, r, pal, mode, seed) => { run(b, L, eL, L, B, step, r, pal, mode, seed); run(b, R, eR, R, B, step, r, pal, mode, seed + 1); };
    const door = [cx, B - Math.min(0.45, (B - eMid) * 0.55)];
    let tint = WARM, garden = true;
    if (pick < 0.16) {                       // the classic: big coloured bulbs along the roofline
      runPoly(b, ridge, 0.18, 0.09, MULTI, TW, h); tint = GOLD;
    } else if (pick < 0.30) {                // warm white icicles off the gutters
      runPoly(b, gut, 0.1, 0.055, [WARM], STEADY, h);
      for (let k = 0; k < gut.length; k++) {
        const len = 1 + Math.floor(rnd(h, k + 60) * 4), [gx, gy] = gut[k];
        for (let j = 1; j <= len; j++) b.push(gx, gy + j * 0.07, 0.045, WARM, WAVE, k * 0.6 - j * 0.9);
      }
    } else if (pick < 0.42) {                // candy cane: the roofline and the corners chasing, canes up the path
      runPoly(b, ridge, 0.15, 0.08, CANDY, CHASE, h); corners(0.15, 0.075, CANDY, CHASE, h + 3);
      candyPath(b, cx, B + 0.08, 4); tint = RED;
    } else if (pick < 0.54) {                // frozen: blues and whites, a snowflake on the roof
      runPoly(b, ridge, 0.16, 0.08, FROST, SPARK, h);
      snowflake(b, cx, (topMin + eMid) / 2, Math.max(0.12, Math.min(R - L, eMid - topMin) * 0.32), h); tint = ICE;
    } else if (pick < 0.63) {                // the one you can see from space
      runPoly(b, ridge, 0.12, 0.085, MULTI, CHASE, h);
      runPoly(b, gut, 0.12, 0.07, MULTI, CHASE, h + 1);
      corners(0.12, 0.07, MULTI, CHASE, h + 2);
      run(b, door[0] - 0.18, door[1], door[0] + 0.18, door[1], 0.09, 0.06, [WHT], STEADY, h);
      const pk = P.reduce((m, p) => p[1] < m[1] ? p : m, P[0]);
      run(b, pk[0], pk[1] - 0.2, pk[0], pk[1], 0.07, 0.04, [WHT], STEADY, h);
      star(b, pk[0], pk[1] - 0.4, 0.2, GOLD, CHASE, h);
      tree(b, L - 0.32, B + 0.45, 0.8, 0.42, MULTI, h);
      reindeer(b, R + 0.36, B + 0.45, 0.5, -1, h);
      tint = PINK; garden = false;
    } else if (pick < 0.75) {                // tasteful: warm swags off the gutters, a wreath on the door
      for (let k = 0; k + 2 < gut.length; k += 2) run(b, gut[k][0], gut[k][1], gut[k + 2][0], gut[k + 2][1], 0.08, 0.06, [WARM], STEADY, h + k, 0.06);
      ring(b, door[0], door[1], 0.09, 8, 0.04, [GRN], STEADY, h); b.push(door[0], door[1] + 0.09, 0.05, RED, STEADY, 0);
    } else if (pick < 0.85) {                // net lights thrown over the roof
      for (let k = 0; k < P.length; k += 2) {
        const [x, t, e] = P[k], n = Math.max(1, Math.round((e - t - 0.08) / 0.14));
        for (let j = 0; j <= n; j++) b.push(x, t + 0.08 + (e - t - 0.12) * j / n, 0.06, XMAS[(k / 2 + j) % 2], FADE, (k / 2 + j) % 2);
      }
      tint = GRN;
    } else if (pick < 0.94) {                // new-build neon: the roofline and the corners in a wave
      runPoly(b, ridge, 0.13, 0.08, NEON, WAVE, h); corners(0.13, 0.07, NEON, WAVE, h + 2); tint = PURP;
    } else {                                 // barely bothered: one string over the door, a candle in the window
      run(b, door[0] - 0.2, door[1] - 0.12, door[0] + 0.2, door[1] - 0.12, 0.12, 0.065, MULTI, TW, h);
      b.push(L + (R - L) * 0.25, (eMid + B) / 2, 0.12, WARM, STEADY, 0);
      garden = false;
    }
    // ── The front garden, in front of the house ──
    if (garden) {
      const side = rnd(h, 13) < 0.5 ? -1 : 1, gx = side < 0 ? L + 0.1 : R - 0.1, gy = B + 0.42;
      if (yard < 0.24)      tree(b, gx, gy, 0.62, 0.36, yard < 0.12 ? MULTI : [WARM], h);
      else if (yard < 0.40) reindeer(b, gx, gy, 0.42, -side, h);
      else if (yard < 0.52) snowman(b, gx, gy, h);
      else if (yard < 0.62) arch(b, cx, B + 0.36, 0.44, 0.3, MULTI, CHASE, h);
      else if (yard < 0.70) { run(b, gx, gy, gx, gy - 0.42, 0.07, 0.035, [WHT], STEADY, h); star(b, gx, gy - 0.58, 0.16, GOLD, TW, h, 0.04); }
    }
    return tint;
  }

  // Open-air lots with no roof to follow: the outline BuildingSnow finds on
  // them is the tops of the rides, so lights fitted to it ran through the
  // Ferris wheel and the coaster. They get a layout of their own instead.
  const OPEN_LOTS = new Set(['amusementpark']);
  const roofOf = e => OPEN_LOTS.has(e.commercialSubtype) ? null
    : typeof BuildingSnow !== 'undefined' && BuildingSnow.roof ? BuildingSnow.roof(e) : null;

  const _lay = new WeakMap();
  function layout(e) {
    let L = _lay.get(e);
    // Laid out again once the building's real outline comes in (see fit()).
    const roof = roofOf(e);
    if (L && L.col === e.col && L.row === e.row && L.roof === roof) return L;
    const h = hash(e), w = e.width || 1, hh = e.height || 1, b = [];
    const pick = rnd(h, 11), yard = rnd(h, 12), cx = w / 2, x0 = 0.06, x1 = w - 0.06;
    let tint = WARM, garden = true;
    if (e.commercialSubtype === 'amusementpark') {
      // Bulbs chasing round the hedge at the lot's edge, and warm swags over
      // the midway. The park art is 320 units tall at the lot's height and
      // as wide as the lot (_renderAmusementPark); the midway runs 8 units
      // in from either side, its top edge at 206.
      const k = hh / 320;
      outline(b, w, hh, 0.3, 0.1, MULTI, CHASE, h, true);
      swags(b, 8 * k, w - 8 * k, 206 * k, Math.max(8, Math.round(w / 2.6)), 0.25, 0.08, [WARM], STEADY, h);
      L = { col: e.col, row: e.row, roof, b, tint: GOLD, off: (h & 255) * 0.37, keen: rnd(h, 41) };
      _lay.set(e, L);
      return L;
    } else if (w < 3 && hh < 3 && roof && roof.prof && roof.prof.length >= 6) {
      tint = homeOnRoof(b, roof, h, pick, yard);
      L = { col: e.col, row: e.row, roof, b, tint, off: (h & 255) * 0.37, keen: rnd(h, 41) };
      _lay.set(e, L);
      return L;
    } else if (w < 3 && hh < 3) {
      // ── Homes ──
      if (pick < 0.16) {                       // the classic: big coloured bulbs round the roof
        outline(b, w, hh, 0.2, 0.1, MULTI, TW, h, false); tint = GOLD;
      } else if (pick < 0.30) {                // warm white icicles off the eaves
        run(b, x0, 0.08, x1, 0.08, 0.1, 0.06, [WARM], STEADY, h);
        icicles(b, x0, x1, 0.15, 0.12, 4, h, WARM);
      } else if (pick < 0.42) {                // candy cane: red and white chasing right round, canes up the path
        outline(b, w, hh, 0.16, 0.085, CANDY, CHASE, h, true); candyPath(b, cx, hh + 0.08, 4); tint = RED;
      } else if (pick < 0.54) {                // frozen: blues and whites, a snowflake on the roof
        outline(b, w, hh, 0.18, 0.085, FROST, SPARK, h, false); snowflake(b, cx, hh * 0.42, Math.min(w, hh) * 0.3, h); tint = ICE;
      } else if (pick < 0.63) {                // the one you can see from space
        outline(b, w, hh, 0.12, 0.09, MULTI, CHASE, h, true);
        run(b, x0, 0.08, x1, hh - 0.05, 0.14, 0.07, MULTI, CHASE, h + 1);
        run(b, x1, 0.08, x0, hh - 0.05, 0.14, 0.07, MULTI, CHASE, h + 2);
        run(b, cx, -0.14, cx, 0.04, 0.07, 0.04, [WHT], STEADY, h);
        star(b, cx, -0.36, 0.22, GOLD, CHASE, h);
        tree(b, -0.3, hh + 0.45, 0.8, 0.42, MULTI, h);
        reindeer(b, w + 0.32, hh + 0.45, 0.5, -1, h);
        tint = PINK; garden = false;
      } else if (pick < 0.75) {                // tasteful: warm swags and a wreath on the door
        swags(b, x0, x1, 0.08, Math.max(2, Math.round(w * 3)), 0.07, 0.065, [WARM], STEADY, h);
        run(b, x0, 0.2, x0, hh * 0.66, 0.16, 0.065, [WARM], STEADY, h);
        run(b, x1, 0.2, x1, hh * 0.66, 0.16, 0.065, [WARM], STEADY, h);
        ring(b, cx, hh * 0.6, 0.1, 8, 0.045, [GRN], STEADY, h); b.push(cx, hh * 0.6 + 0.1, 0.055, RED, STEADY, 0);
      } else if (pick < 0.85) {                // net lights over the roof
        net(b, x0 + 0.06, 0.12, x1 - 0.06, hh * 0.6, 0.15, 0.065); tint = GRN;
      } else if (pick < 0.94) {                // new-build neon: pinks and purples in a wave
        outline(b, w, hh, 0.14, 0.085, NEON, WAVE, h, true); tint = PURP;
      } else {                                 // barely bothered: one string on the porch, a candle in the window
        run(b, cx - 0.2, hh * 0.72, cx + 0.2, hh * 0.72, 0.13, 0.07, MULTI, TW, h);
        b.push(w * 0.27, hh * 0.45, 0.13, WARM, STEADY, 0);
        garden = false;
      }
      // ── The front garden ──
      if (garden) {
        const side = rnd(h, 13) < 0.5 ? -1 : 1, gx = cx + side * (w * 0.5 + 0.12), gy = hh + 0.42;
        if (yard < 0.24)      tree(b, gx, gy, 0.62, 0.36, yard < 0.12 ? MULTI : [WARM], h);
        else if (yard < 0.40) reindeer(b, gx, gy, 0.42, -side, h);
        else if (yard < 0.52) snowman(b, gx, gy, h);
        else if (yard < 0.62) arch(b, cx, hh + 0.36, 0.44, 0.3, MULTI, CHASE, h);
        else if (yard < 0.70) { run(b, gx, gy, gx, gy - 0.42, 0.07, 0.035, [WHT], STEADY, h); star(b, gx, gy - 0.58, 0.16, GOLD, TW, h, 0.04); }
      }
    } else {
      // ── Shops and the bigger buildings ──
      const st = Math.max(0.24, (w + hh) / 55), m = Math.min(w, hh);
      if (pick < 0.22) {                       // theatre marquee: warm bulbs chasing round the block
        outline(b, w, hh, st, 0.1, [WARM], CHASE, h, true);
        if (yard < 0.5) star(b, cx, hh * 0.42, m * 0.26, GOLD, TW, h, 0.07);
      } else if (pick < 0.42) {                // a curtain of ice-white drops down the front
        run(b, x0, 0.08, x1, 0.08, st * 0.6, 0.07, [ICE], STEADY, h);
        curtain(b, x0, x1, 0.2, Math.min(hh * 0.55, 2.2), Math.max(0.24, w / 34), h); tint = ICE;
      } else if (pick < 0.60) {                // red and green trading places, a great snowflake on the roof
        outline(b, w, hh, st, 0.1, XMAS, FADE, h, true); snowflake(b, cx, hh * 0.45, m * 0.32, h, 0.08); tint = RED;
      } else if (pick < 0.80) {                // swags along the front and a tree either side of the door
        swags(b, x0, x1, 0.08, Math.max(2, Math.round(w * 1.2)), 0.16, 0.085, MULTI, TW, h);
        swags(b, x0, x1, hh - 0.3, Math.max(2, Math.round(w * 1.2)), 0.12, 0.07, [WARM], STEADY, h);
        tree(b, 0.2, hh + 0.5, 1.3, 0.7, MULTI, h, 0.06); tree(b, w - 0.2, hh + 0.5, 1.3, 0.7, MULTI, h + 5, 0.06);
        tint = GOLD;
      } else {                                 // a maypole of lights: strings from a roof mast out to the eaves
        maypole(b, cx, hh * 0.47, w, hh, Math.max(8, Math.round((w + hh) * 1.1)), h);
        outline(b, w, hh, st * 1.4, 0.08, [WARM], STEADY, h, true); tint = GOLD;
      }
    }
    if (roof) fit(b, w, hh, roof);
    L = { col: e.col, row: e.row, roof, b, tint, off: (h & 255) * 0.37, keen: rnd(h, 41) };   // keen: how early in the season this one decorates
    _lay.set(e, L);
    return L;
  }

  // The layouts above are drawn on the footprint, as though the building
  // filled it. Most sprites don't: there is lawn, car park or open ground
  // round the building, and lights strung along the edges of the lot hung
  // in the air above the roof and out over the street. So they are moved
  // onto the building itself: the footprint's top is the roofline, its
  // sides the building's sides and its bottom the building's front. What
  // was set out below the footprint, in the front garden, moves up with the
  // front, so it stands just in front of the building.
  function fit(b, w, hh, roof) {
    const top = Math.max(0, Math.min(hh * 0.8, roof.top));
    const bottom = Math.min(hh, Math.max(top + hh * 0.2, roof.bottom ?? hh));
    const left = Math.max(0, Math.min(w * 0.4, roof.left)), right = Math.min(w, Math.max(w * 0.6, roof.right));
    if (top < 0.04 && bottom > hh - 0.04 && left < 0.04 && right > w - 0.04) return;
    const sx = (right - left) / w, sy = (bottom - top) / hh;
    for (let i = 0; i < b.length; i += STRIDE) {
      b[i] = left + b[i] * sx;
      b[i + 1] = b[i + 1] <= hh ? top + b[i + 1] * sy : b[i + 1] - hh + bottom;
    }
  }

  let _lspr = null;
  function bulbs(ctx, b, x, y, t, k) {
    for (let i = 0; i < b.length; i += STRIDE) {
      const r = b[i + 2] * TILE;
      ctx.globalAlpha = Math.min(1, lit(b[i + 4], b[i + 5], t) * k);
      ctx.drawImage(_lspr[b[i + 3]], x + b[i] * TILE - r, y + b[i + 1] * TILE - r, r * 2, r * 2);
    }
  }

  // ── The town tree ────────────────────────────────────────────────
  // A big fir outside City Hall: seven tiers of drooping boughs with snow
  // on their tips, tinsel, baubles and bows, a gold star, presents piled
  // on a red skirt, a roped ring round it and carol singers at the front.
  // By night (rooflines) a garland follows the edge of every tier, fairy
  // lights fill the boughs and the star flares.
  const TREE_H = 4.4, TREE_W = 2.9, TIERS = 7;
  const STAR_Y = -(0.42 + TREE_H + 0.24);
  function townTree() {
    const g = typeof GovernmentSystem !== 'undefined' && GovernmentSystem.getGovEntity && GovernmentSystem.getGovEntity();
    if (!g) return null;
    return { x: (g.col + (g.width || 1) / 2) * TILE, y: (g.row + (g.height || 1) + 1.1) * TILE };
  }
  // One tier, in tiles from the foot of the tree: where its hem hangs, how
  // wide it is, where it comes to a point, and the tips along the hem.
  const _tiers = [];
  function tiers() {
    if (_tiers.length) return _tiers;
    for (let k = 0; k < TIERS; k++) {
      const ub = k / TIERS * 0.84, hw = TREE_W / 2 * Math.pow(1 - ub, 0.85), yb = -0.42 - ub * TREE_H;
      const top = Math.max(-0.42 - TREE_H, yb - TREE_H * (0.3 - k * 0.012)), n = Math.max(4, 12 - k) & ~1, sc = 1 - ub * 0.45;
      const hem = [];
      for (let j = 0; j <= n; j++) {
        const x = -hw + 2 * hw * j / n;
        hem.push([x, yb + (j % 2 ? -0.1 * sc : 0) + 0.12 * sc * (x / hw) * (x / hw)]);
      }
      _tiers.push({ hw, yb, top, hem });
    }
    return _tiers;
  }
  // Somewhere on the boughs: a point inside the tree's outline, off a seed.
  function onTree(i, k) {
    const u = 0.04 + 0.86 * rnd(i, k), hw = TREE_W / 2 * Math.pow(1 - u, 0.85) * 0.82;
    return [(rnd(i, k + 1) * 2 - 1) * hw, -0.5 - u * TREE_H];
  }

  let _treeB = null;
  function treeLights() {
    if (_treeB) return _treeB;
    const b = [];
    const T7 = tiers();
    // A garland along every hem, a bulb on each tip and two between.
    T7.forEach((tr, k) => {
      for (let j = 0; j < tr.hem.length - 1; j++) {
        const [x0, y0] = tr.hem[j], [x1, y1] = tr.hem[j + 1];
        for (let q = 0; q < 3; q++) {
          const u = q / 3, i = j * 3 + q;
          b.push(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + 0.03, q === 0 ? 0.1 : 0.075, MULTI[(i + k) % MULTI.length], CHASE, i % 3);
        }
      }
      const e = tr.hem[tr.hem.length - 1];
      b.push(e[0], e[1] + 0.03, 0.1, MULTI[k % MULTI.length], CHASE, 0);
    });
    // Fairy lights all through the boughs.
    for (let i = 0; i < 110; i++) { const [x, y] = onTree(i, 5); b.push(x, y, 0.05, i % 4 ? WARM : WHT, SPARK, i * 1.3); }
    // The baubles catch the light.
    for (let i = 0; i < 26; i++) { const [x, y] = onTree(i, 61); b.push(x, y, 0.1, BAUBLE_L[i % BAUBLE_L.length], TW, i * 2.1); }
    star(b, 0, STAR_Y, 0.36, GOLD, STEADY, 0, 0.085);
    return (_treeB = b);
  }
  const BAUBLE   = ['#d8303a', '#e8c040', '#3a78d8', '#d8dce4', '#a04ac0', '#28a868'];
  const BAUBLE_L = [RED, GOLD, BLU, WHT, PURP, GRN];
  const PRESENT  = [['#c8323a', '#f4e8c0'], ['#2a6ab8', '#f0d050'], ['#2a9058', '#e84a4a'], ['#e8c040', '#c8323a'], ['#8a48b0', '#f4f4f4'], ['#f4f4f4', '#c8323a']];

  // The ring of posts and rope: the back half goes in behind the tree, the
  // front half in front of it.
  function treeRope(ctx, p, front) {
    const u = TILE, rx = u * 2.0, ry = u * 0.52, n = 12;
    const at = i => { const a = i / n * 6.283; return [p.x + Math.cos(a) * rx, p.y - u * 0.05 + Math.sin(a) * ry]; };
    for (let i = 0; i < n; i++) {
      const [x0, y0] = at(i), [x1, y1] = at(i + 1);
      if ((y0 + y1) / 2 > p.y - u * 0.05 !== front) continue;
      if (front && Math.abs((x0 + x1) / 2 - p.x) < u * 0.4) continue;            // the gap the carollers stand in
      ctx.strokeStyle = '#b02a34'; ctx.lineWidth = Math.max(0.8, u * 0.035);
      ctx.beginPath(); ctx.moveTo(x0, y0 - u * 0.22); ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - u * 0.08, x1, y1 - u * 0.22); ctx.stroke();
    }
    for (let i = 0; i < n; i++) {
      const [x, y] = at(i);
      if (y > p.y - u * 0.05 !== front) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y, u * 0.06, u * 0.025, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#c8a040'; ctx.fillRect(x - u * 0.025, y - u * 0.25, u * 0.05, u * 0.25);
      ctx.fillStyle = '#f0d070'; ctx.beginPath(); ctx.arc(x, y - u * 0.26, u * 0.045, 0, 6.283); ctx.fill();
    }
  }

  function drawTownTree(ctx, t) {
    const p = townTree();
    if (!p) return;
    const u = TILE, X = v => p.x + v * u, Y = v => p.y + v * u, fine = Camera.zoom > 0.9;
    // The ground: a long shadow, then the skirt.
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(X(0.25), Y(0.02), u * 1.75, u * 0.42, 0, 0, 6.283); ctx.fill();
    treeRope(ctx, p, false);
    ctx.fillStyle = '#f4f0e8'; ctx.beginPath(); ctx.ellipse(X(0), Y(-0.02), u * 1.22, u * 0.33, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#b02a34'; ctx.beginPath(); ctx.ellipse(X(0), Y(-0.03), u * 1.12, u * 0.28, 0, 0, 6.283); ctx.fill();
    if (fine) { ctx.fillStyle = '#f4f0e8'; for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; ctx.beginPath(); ctx.arc(X(Math.cos(a) * 0.98), Y(-0.03 + Math.sin(a) * 0.235), u * 0.03, 0, 6.283); ctx.fill(); } }
    // Trunk and tub.
    ctx.fillStyle = '#5a3a22'; ctx.fillRect(X(-0.14), Y(-0.62), u * 0.28, u * 0.5);
    ctx.fillStyle = '#3e2816'; ctx.fillRect(X(0.04), Y(-0.62), u * 0.1, u * 0.5);
    // The boughs, lowest tier first, each over the shadow it throws on the one below.
    const grad = ctx.createLinearGradient(X(-TREE_W / 2), 0, X(TREE_W / 2), 0);
    grad.addColorStop(0, '#2f8a4c'); grad.addColorStop(0.45, '#1f6a3a'); grad.addColorStop(1, '#0f3e24');
    const T7 = tiers();
    const shape = (tr, dy) => {
      ctx.beginPath(); ctx.moveTo(X(0), Y(tr.top + dy));
      for (const [hx, hy] of tr.hem) ctx.lineTo(X(hx), Y(hy + dy));
      ctx.closePath(); ctx.fill();
    };
    T7.forEach((tr, k) => {
      if (k) { ctx.fillStyle = 'rgba(4,20,12,0.4)'; shape(tr, 0.11); }
      ctx.fillStyle = grad; shape(tr, 0);
      if (fine) {                                                    // needles: short strokes fanning down each tier
        ctx.strokeStyle = 'rgba(8,36,20,0.4)'; ctx.lineWidth = Math.max(0.5, u * 0.014);
        ctx.beginPath();
        for (let j = 1; j < tr.hem.length - 1; j++) { const [hx, hy] = tr.hem[j]; ctx.moveTo(X(hx * 0.35), Y(tr.yb + (tr.top - tr.yb) * 0.55)); ctx.lineTo(X(hx * 0.94), Y(hy - 0.04)); }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(120,220,150,0.16)';
        ctx.beginPath();
        for (let j = 1; j < tr.hem.length / 2; j++) { const [hx, hy] = tr.hem[j]; ctx.moveTo(X(hx * 0.5 - 0.03), Y(tr.yb + (tr.top - tr.yb) * 0.5)); ctx.lineTo(X(hx * 0.9 - 0.03), Y(hy - 0.08)); }
        ctx.stroke();
      }
      // Snow sitting on the tips.
      ctx.fillStyle = 'rgba(244,250,255,0.9)';
      for (let j = 0; j < tr.hem.length; j += 2) {
        const [hx, hy] = tr.hem[j], r = u * (0.075 - k * 0.004);
        ctx.beginPath(); ctx.ellipse(X(hx * 0.97), Y(hy - 0.075), r * 1.25, r * 0.6, 0, 0, 6.283); ctx.fill();
      }
      // Tinsel slung across the tier.
      ctx.strokeStyle = k % 2 ? 'rgba(236,200,96,0.85)' : 'rgba(226,232,240,0.8)'; ctx.lineWidth = Math.max(0.8, u * 0.03);
      ctx.setLineDash([u * 0.05, u * 0.035]);
      ctx.beginPath(); ctx.moveTo(X(-tr.hw * 0.8), Y(tr.yb - 0.2)); ctx.quadraticCurveTo(X(0), Y(tr.yb + 0.02), X(tr.hw * 0.8), Y(tr.yb - 0.3)); ctx.stroke();
      ctx.setLineDash([]);
    });
    // Baubles, each with a cap and a highlight, and red bows between them.
    for (let i = 0; i < 26; i++) {
      const [bx, by] = onTree(i, 61), r = u * 0.068;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(X(bx) + r * 0.25, Y(by) + r * 0.3, r, 0, 6.283); ctx.fill();
      ctx.fillStyle = BAUBLE[i % BAUBLE.length]; ctx.beginPath(); ctx.arc(X(bx), Y(by), r, 0, 6.283); ctx.fill();
      if (fine) {
        ctx.fillStyle = '#d8c070'; ctx.fillRect(X(bx) - r * 0.3, Y(by) - r * 1.35, r * 0.6, r * 0.45);
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(X(bx) - r * 0.35, Y(by) - r * 0.35, r * 0.28, 0, 6.283); ctx.fill();
      }
    }
    for (let i = 0; i < 7; i++) {
      const [bx, by] = onTree(i, 83), w = u * 0.1;
      ctx.fillStyle = '#d02838';
      ctx.beginPath(); ctx.moveTo(X(bx), Y(by)); ctx.lineTo(X(bx) - w, Y(by) - w * 0.6); ctx.lineTo(X(bx) - w, Y(by) + w * 0.6); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(X(bx), Y(by)); ctx.lineTo(X(bx) + w, Y(by) - w * 0.6); ctx.lineTo(X(bx) + w, Y(by) + w * 0.6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f0c040'; ctx.beginPath(); ctx.arc(X(bx), Y(by), w * 0.25, 0, 6.283); ctx.fill();
    }
    // The star.
    const pts = (R, r) => { ctx.beginPath(); for (let q = 0; q < 10; q++) { const a = -1.5708 + q * 0.6283, rr = q % 2 ? r : R; ctx.lineTo(X(Math.cos(a) * rr), Y(STAR_Y + Math.sin(a) * rr)); } ctx.closePath(); ctx.fill(); };
    ctx.fillStyle = '#b88a20'; ctx.fillRect(X(-0.025), Y(STAR_Y + 0.1), u * 0.05, u * 0.26);
    ctx.fillStyle = '#c89a28'; pts(0.4, 0.17);
    ctx.fillStyle = '#ffd84a'; pts(0.34, 0.14);
    ctx.fillStyle = '#fff4b0'; pts(0.17, 0.07);
    // Presents piled on the skirt.
    for (let i = 0; i < 11; i++) {
      const side = i % 2 ? 1 : -1, gx = side * (0.24 + rnd(i, 71) * 0.82), gy = -0.04 + rnd(i, 72) * 0.2 - Math.abs(gx) * 0.08;
      const w = 0.2 + rnd(i, 73) * 0.16, h = 0.14 + rnd(i, 74) * 0.14, [box, rib] = PRESENT[i % PRESENT.length];
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(X(gx - w / 2 + 0.03), Y(gy - 0.02), u * w, u * 0.05);
      ctx.fillStyle = box; ctx.fillRect(X(gx - w / 2), Y(gy - h), u * w, u * h);
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(X(gx + w * 0.2), Y(gy - h), u * w * 0.3, u * h);
      ctx.fillStyle = rib; ctx.fillRect(X(gx - w * 0.08), Y(gy - h), u * w * 0.16, u * h); ctx.fillRect(X(gx - w / 2), Y(gy - h * 0.58), u * w, u * h * 0.16);
      if (fine) { ctx.beginPath(); ctx.arc(X(gx - w * 0.1), Y(gy - h - 0.02), u * 0.035, 0, 6.283); ctx.arc(X(gx + w * 0.1), Y(gy - h - 0.02), u * 0.035, 0, 6.283); ctx.fill(); }
    }
    treeRope(ctx, p, true);
    // Carol singers, song sheets up, swaying in time.
    const SCARF = ['#d02838', '#2a9058', '#f0c040', '#3a78d8'];
    for (let i = 0; i < 7; i++) {
      const s = u * 0.24, x = X(-0.9 + i * 0.3), y = Y(0.62 + (i % 2) * 0.09), sw = Math.sin(t * 1.6 + i * 0.5) * s * 0.08;
      person(ctx, x + sw, y, s, SHIRTS[(i * 3 + 1) % SHIRTS.length]);
      ctx.fillStyle = SCARF[i % SCARF.length]; ctx.fillRect(x + sw - s * 0.3, y - s * 0.78, s * 0.6, s * 0.13);
      ctx.fillStyle = '#f8f4e8'; ctx.fillRect(x + sw - s * 0.2, y - s * 0.55, s * 0.4, s * 0.26);
    }
  }

  // Whether a building's outline is still being worked out (BuildingSnow.roof).
  const _roofPending = e => !OPEN_LOTS.has(e.commercialSubtype) && typeof BuildingSnow !== 'undefined' && !!BuildingSnow.roof && BuildingSnow.roof(e) === undefined;
  function rooflines(ctx, dark, t, c0, c1, r0, r1, festival) {
    // Festival night they are on from mid-afternoon (they show by day, but
    // the dark is when they sing); any other evening they come on at dusk.
    const k = festival ? 0.3 + 0.7 * dark : dark;
    if (k < 0.12) return;
    // Who has theirs up: a third of the town when the season opens, most of
    // it a few days in, everybody on the night. It grows through the day,
    // not at midnight, so houses light up one by one rather than an eighth
    // of the town at once in the middle of the night.
    const day = Seasons.dayOfSeasonExact();
    const share = festival ? 1 : Math.max(0.35, Math.min(0.85, 0.35 + (day - DECO_FROM) * 0.125));
    // Close in, every bulb; further out, one glow per building. Cross-faded
    // over a band of zoom rather than swapped at one.
    const nz = Math.max(0, Math.min(1, (Camera.zoom - 0.62) / 0.16)), nearT = nz * nz * (3 - 2 * nz);
    const near = nearT > 0;
    if (!_lspr) _lspr = LC.map(glow);
    let budget = BULB_BUDGET;
    for (const e of decorated) {
      if (!e.powered || !onScreen(e, c0, c1, r0, r1, 2)) continue;
      // Not until the building's outline is in (a frame or two after it is
      // first seen): laid out without it, the lights jumped to the roofline
      // as soon as it came.
      if (_roofPending(e)) continue;
      const L = layout(e);
      if (L.keen > share) continue;
      const x = e.col * TILE, y = e.row * TILE;
      const all = near && budget > 0;
      if (!all || nearT < 1) {
        // Further out: one glow per building, in the colour it went for.
        const w = (e.width || 1) * TILE, hh = (e.height || 1) * TILE, r = Math.max(w, hh) * 0.7;
        ctx.globalAlpha = (0.38 + 0.14 * Math.sin(t * 1.4 + L.off)) * k * (all ? 1 - nearT : 1);
        ctx.drawImage(_lspr[L.tint], x + w / 2 - r, y + hh / 2 - r, r * 2, r * 2);
        if (!all) continue;
      }
      budget -= L.b.length / STRIDE;
      bulbs(ctx, L.b, x, y, t + L.off, k * nearT);
    }
    // Garlands strung across between neighbours.
    if (near) {
      for (const g of garlands) {
        const a = g.a, b = g.b;
        if (!a.powered || !b.powered || budget <= 0) continue;
        if (_roofPending(a) || _roofPending(b)) continue;
        if (layout(a).keen > share || layout(b).keen > share) continue;
        if (!onScreen(a, c0, c1, r0, r1, 1) && !onScreen(b, c0, c1, r0, r1, 1)) continue;
        // From eave to eave: the roofline where the building's outline is known.
        const ra = layout(a).roof, rb = layout(b).roof;
        const ax = (a.col + (a.width || 1) / 2) * TILE, ay = (a.row + (ra ? ra.top : 0) + 0.1) * TILE;
        const bx = (b.col + (b.width || 1) / 2) * TILE, by = (b.row + (rb ? rb.top : 0) + 0.1) * TILE;
        const n = g.n, sag = TILE * 0.1 * Math.sqrt(n), r = TILE * 0.075;
        budget -= n;
        for (let i = 1; i < n; i++) {
          const u = i / n;
          ctx.globalAlpha = (0.55 + 0.45 * Math.sin(t * 2.4 + i * 1.9 + g.ph)) * k * nearT;
          ctx.drawImage(_lspr[g.warm ? WARM : MULTI[(i + g.ph) % MULTI.length]], ax + (bx - ax) * u - r, ay + (by - ay) * u + sag * 4 * u * (1 - u) - r, r * 2, r * 2);
        }
      }
    }
    // The town tree: its lights, the star's flare, and the pool of
    // colour it throws on the square.
    const p = townTree();
    if (p && Camera.zoom >= 0.4 && p.x > (c0 - 4) * TILE && p.x < (c1 + 4) * TILE && p.y > (r0 - 2) * TILE && p.y < (r1 + 8) * TILE) {
      const r = TILE * 3.6, sy = p.y + STAR_Y * TILE, pulse = 0.82 + 0.18 * Math.sin(t * 2.2);
      ctx.globalAlpha = 0.3 * k;
      ctx.drawImage(_lspr[WARM], p.x - r, p.y - TILE * 2.4 - r, r * 2, r * 2);
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = (0.2 + 0.1 * Math.sin(t * 1.1 + i * 1.6)) * k;
        ctx.drawImage(_lspr[MULTI[i]], p.x + (i - 1.5) * TILE * 0.8 - TILE * 1.1, p.y - TILE * 0.5, TILE * 2.2, TILE * 1.1);
      }
      bulbs(ctx, treeLights(), p.x, p.y, t, Math.min(1, k * 1.15));
      const L = TILE * 1.7 * pulse, th = TILE * 0.1;
      ctx.globalAlpha = Math.min(1, 0.85 * k);
      ctx.drawImage(_lspr[GOLD], p.x - L, sy - th, L * 2, th * 2);
      ctx.drawImage(_lspr[GOLD], p.x - th, sy - L * 0.8, th * 2, L * 1.6);
      ctx.globalAlpha = Math.min(1, 0.7 * k);
      ctx.drawImage(_lspr[GOLD], p.x - TILE * 0.7 * pulse, sy - TILE * 0.7 * pulse, TILE * 1.4 * pulse, TILE * 1.4 * pulse);
      ctx.drawImage(_lspr[WHT], p.x - TILE * 0.3, sy - TILE * 0.3, TILE * 0.6, TILE * 0.6);
    }
    ctx.globalAlpha = 1;
  }

  // Which neighbours have strung a garland across to each other: each home
  // to the nearest one right of (or below) it, if that is close enough.
  let garlands = [];
  function findGarlands() {
    garlands = [];
    const homes = [];
    for (const e of decorated) {
      if (e.type === T.HOUSE && !e.commercialSubtype && (e.width || 1) < 3) homes.push(e);
      if (homes.length >= 500) break;
    }
    for (const a of homes) {
      const h = hash(a);
      if (rnd(h, 21) > 0.6) continue;
      let best = null, bd = 1e9;
      for (const b of homes) {
        const dx = b.col - a.col, dy = b.row - a.row;
        if (dx < 0 || (dx === 0 && dy <= 0)) continue;
        const d = Math.hypot(dx, dy);
        if (d >= 1.8 && d <= 4.6 && d < bd) { bd = d; best = b; }
      }
      if (best) garlands.push({ a, b: best, n: Math.round(bd / 0.2), ph: h & 31, warm: rnd(h, 22) < 0.4 });
    }
  }

  // Summer Music Festival: searchlights sweeping the sky from every venue.
  function stageBeams(ctx, dark, t, c0, c1, r0, r1) {
    if (dark < 0.12) return;                         // a searchlight at noon is just a pole
    const k = Math.min(1, (dark - 0.12) / 0.5);
    let drawn = 0;
    for (const e of involved) {
      if (!e.commercialSubtype || !STAGE_SUBS.includes(e.commercialSubtype)) continue;
      if (!e.powered || !onScreen(e, c0, c1, r0, r1, 14)) continue;   // a beam reaches well past its building
      if (++drawn > 14) break;
      const h = hash(e);
      const w = (e.width || 1) * TILE, hh = (e.height || 1) * TILE;
      const sx = e.col * TILE + w / 2, sy = e.row * TILE + hh * 0.3;
      const L = TILE * (12 + (h % 5));
      for (let b = 0; b < 3; b++) {
        const a = -Math.PI / 2 + Math.sin(t * (0.45 + b * 0.13) + b * 2.1 + (h & 31)) * 0.95;
        const ex = sx + Math.cos(a) * L, ey = sy + Math.sin(a) * L;
        const nx = -Math.sin(a) * L * 0.07, ny = Math.cos(a) * L * 0.07;
        const col = BEAMS[(b + h) % BEAMS.length];
        const gr = ctx.createLinearGradient(sx, sy, ex, ey);
        gr.addColorStop(0, `rgba(${col},${(0.42 * k).toFixed(3)})`);
        gr.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex + nx, ey + ny); ctx.lineTo(ex - nx, ey - ny); ctx.closePath(); ctx.fill();
      }
      // The stage itself, strobing.
      const strobe = 0.5 + 0.5 * Math.sin(t * 9 + (h & 15));
      const r = Math.max(w, hh) * 0.9;
      ctx.globalAlpha = 0.55 * k * strobe;
      ctx.drawImage(glow(BEAMS[Math.floor(t * 1.5 + h) % BEAMS.length]), sx - r, sy - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
    }
  }

  // New Year's Eve: a few early ones from nine, a sky full at midnight.
  function fireworks(fx) {
    if (typeof NationalProject === 'undefined' || !NationalProject.setFestiveFireworks) return;
    let rate = null;
    if (fx && fx.ev.id === 'newyear') {
      const h = DayNight.hour();
      const z = Camera.zoom;
      if (h >= 23.75 || h < 0.75) rate = [0.12 + z * 0.2, 0.35 + z * 0.5, 0.25];    // midnight, with salvos
      else if (h >= 21) rate = [1.2 + z, 3 + z * 2, 0.08];                          // the early ones
    }
    if (!!rate !== _fwOn || rate) { NationalProject.setFestiveFireworks(rate); _fwOn = !!rate; }
  }

  // ── Event dressing ───────────────────────────────────────────────
  //
  // Each event's own look, keyed by id. All of it is procedural and a pure
  // function of the clock and each building's hash, so nothing is kept
  // between frames and a building looks the same from one frame to the
  // next. Every loop is capped: a big town on screen draws its nearest
  // few dozen, not every one.

  const rnd = (h, k) => { const x = Math.sin(h * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  function view(c0, c1, r0, r1) { return { c0, c1, r0, r1, x0: c0 * TILE, x1: (c1 + 1) * TILE, y0: r0 * TILE, y1: (r1 + 1) * TILE }; }
  const SUB   = list => e => !!e.commercialSubtype && list.includes(e.commercialSubtype);
  const HOMES = e => e.type === T.HOUSE && !e.commercialSubtype;
  const ANY   = () => true;
  // The involved buildings on screen that pass `pred`, at most `cap`.
  function each(v, pred, cap, fn) { eachOf(involved, v, pred, cap, fn); }
  function eachOf(list, v, pred, cap, fn) {
    let n = 0;
    for (const e of list) {
      if (!pred(e) || !onScreen(e, v.c0, v.c1, v.r0, v.r1, 1)) continue;
      fn(e, hash(e), (e.width || 1) * TILE, (e.height || 1) * TILE);
      if (++n >= cap) break;
    }
  }

  const LEARN   = ['school', 'library', 'sciencemuseum'];
  const FARMSET = ['vineyard', 'verticalfarm', 'glasshouse', 'fishhatchery'];
  const STEAMY  = ['cannery', 'bakery', 'bottling', 'fertilizer', 'sawmill'];
  const HOTELS  = ['hotel', 'motel', 'resorthotel', 'boutiquehotel', 'marina', 'hotsprings'];
  const EATS    = ['restaurant', 'finedining', 'fastfood', 'donutshop', 'hotdog', 'pizzeria', 'cafe', 'bakery'];
  const SHOPS   = ['mall', 'galleria', 'arcade', 'clothing', 'cardealer', 'cornerstore', 'grocery', 'pharmacy'];
  const COLD    = ['coldstorage', 'coldchain', 'grocery', 'cornerstore', 'icerink', 'aquarium'];
  const PARTY   = ['venue', 'stadium', 'nightclub', 'jazzbar', 'disco', 'superclub', 'supperclub', 'holoarena', 'skycasino', 'bowling', ...EATS];
  const SHIRTS  = ['#e04848', '#4878e0', '#f0c040', '#40b070', '#c060d0', '#f08030', '#f0f0f0', '#38404a'];

  // A person from above-and-in-front: a shirt and a head. `s` is their height.
  function person(ctx, x, y, s, shirt, bob = 0) {
    ctx.fillStyle = shirt;
    ctx.fillRect(x - s * 0.3, y - s * 0.75 + bob, s * 0.6, s * 0.62);
    ctx.fillStyle = '#e6c29c';
    ctx.beginPath(); ctx.arc(x, y - s * 0.92 + bob, s * 0.24, 0, 6.283); ctx.fill();
  }
  // A queue along the front of a building, from its door out to the right.
  function queue(ctx, e, h, w, hh, t, n, bags) {
    const s = TILE * 0.24, y = e.row * TILE + hh + s * 1.05, x0 = e.col * TILE + w * 0.5;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * s * 0.72 + (rnd(h, i) - 0.5) * s * 0.2;
      const yy = y + (i % 2) * s * 0.12;
      person(ctx, x, yy, s, SHIRTS[(h + i * 3) % SHIRTS.length], Math.sin(t * 2.5 + i * 1.3) * s * 0.03);
      if (bags && rnd(h, i + 40) < 0.6) { ctx.fillStyle = bags[(h + i) % bags.length]; ctx.fillRect(x + s * 0.28, yy - s * 0.45, s * 0.26, s * 0.3); }
    }
  }
  // A few people milling about in front of a building.
  function crowd(ctx, e, h, w, hh, t, n, spread = 1) {
    const s = TILE * 0.22, base = e.row * TILE + hh;
    for (let i = 0; i < n; i++) {
      const x = e.col * TILE + w * (0.1 + 0.8 * rnd(h, i)) + Math.sin(t * (0.3 + rnd(h, i + 9) * 0.5) + i) * s * 1.5 * spread;
      const y = base + s * (0.9 + rnd(h, i + 20) * 1.6 * spread);
      person(ctx, x, y, s, SHIRTS[(h + i * 5) % SHIRTS.length], Math.sin(t * 4 + i) * s * 0.04);
    }
  }
  // A column of soft puffs rising from (x, y): steam, smoke, dust or mist.
  function puffs(ctx, x, y, t, h, rgb, n, rise, size, alpha, drift = 0.4) {
    for (let k = 0; k < n; k++) {
      const ph = (t * (0.18 + rnd(h, k) * 0.1) + k / n + rnd(h, k + 7)) % 1;
      const px = x + Math.sin(ph * 5 + k) * size * 0.5 + drift * ph * size * 3;
      const py = y - ph * rise;
      ctx.globalAlpha = (1 - ph) * alpha * Math.min(1, ph * 6);
      ctx.fillStyle = `rgb(${rgb})`;
      ctx.beginPath(); ctx.arc(px, py, size * (0.45 + ph), 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function dot(ctx, rgb, x, y, r, a) {
    ctx.globalAlpha = Math.max(0, Math.min(1, a));
    ctx.drawImage(glow(rgb), x - r, y - r, r * 2, r * 2);
  }

  // How far into itself the ice storm is, 0..1: it comes on over the first
  // two hours (the glaze thickening, icicles growing, the first squalls thin)
  // and eases off over the last one, rather than switching on and off.
  function iceBuild() {
    const fx = SeasonalEvents.fx();
    if (!fx) return 1;
    const hr = DayNight.secondsPerGameHour(), now = DayNight.getElapsed();
    return Math.max(0, Math.min(1, (now - fx.start) / (2 * hr), (fx.end - now) / hr));
  }

  // ── The spring fair's kit ────────────────────────────────────────
  // Where each piece stands is a function of the building's hash alone, so
  // the night pass (its lights) finds the same stall and ride the day pass
  // drew.
  const FAIR = ['#ffb3c8', '#b8e8a0', '#fff1a0', '#a8d8ff', '#e0c0ff'];
  const FAIR_BAL = ['#ff5a7a', '#5ab0ff', '#ffd84a', '#7ae07a', '#c58aff'];
  // Everything at the fair stands on the shopfront pavement: the brick strip
  // along a building's front edge, only a fifth of a tile deep where a street
  // runs past (render_core.js, drawCommercialGround). Past it is the road, so
  // stalls and rides stand on this line and rise up against the shopfront.
  const pavement = (e, hh) => e.row * TILE + hh + TILE * 0.17;
  // A ride beside the bigger buildings: a little wheel, or a carousel, at the
  // right-hand end of the front.
  function fairRide(e, h, w, hh) {
    if ((e.width || 1) < 3) return null;
    const k = rnd(h, 60), gy = pavement(e, hh);
    if (k < 0.3) { const R = TILE * 0.75; return { kind: 'wheel', R, cx: e.col * TILE + w - R * 1.15, gy, x0: e.col * TILE + w - R * 2.1 }; }
    if (k < 0.55) { const cw = TILE * 1.05, cx = e.col * TILE + w - cw * 0.7; return { kind: 'carousel', cw, cx, gy, x0: cx - cw * 0.6 }; }
    return null;
  }
  // A market stall in front of one shop in two, clear of any ride there.
  function fairStall(e, h, w, hh) {
    if (rnd(h, 50) >= 0.5) return null;
    const sw = TILE * 0.95, ride = fairRide(e, h, w, hh);
    const room = (ride ? ride.x0 - e.col * TILE : w) - sw;
    if (room < 0) return null;
    return { x: e.col * TILE + room * rnd(h, 51), y: pavement(e, hh) - TILE * 0.66, sw, col: FAIR[h % FAIR.length] };
  }
  function drawStall(ctx, s, h, t) {
    const { x, y, sw, col } = s, T_ = TILE;
    ctx.strokeStyle = '#5a4630'; ctx.lineWidth = Math.max(0.6, T_ * 0.03);
    ctx.beginPath(); ctx.moveTo(x + sw * 0.06, y); ctx.lineTo(x + sw * 0.06, y + T_ * 0.66); ctx.moveTo(x + sw * 0.94, y); ctx.lineTo(x + sw * 0.94, y + T_ * 0.66); ctx.stroke();
    person(ctx, x + sw * (0.35 + 0.3 * rnd(h, 52)), y + T_ * 0.5, T_ * 0.24, SHIRTS[(h + 2) % SHIRTS.length], Math.sin(t * 2 + h) * T_ * 0.008);   // the stallholder
    ctx.fillStyle = '#b88a58'; ctx.fillRect(x, y + T_ * 0.36, sw, T_ * 0.26);                  // counter
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x, y + T_ * 0.36, sw, T_ * 0.04);
    for (let i = 0; i < 6; i++) {                                                               // what's for sale
      ctx.fillStyle = [FAIR_BAL[(h + i) % FAIR_BAL.length], '#f4ead0', '#e8a040'][(h + i) % 3];
      ctx.beginPath(); ctx.arc(x + sw * (0.12 + i * 0.152), y + T_ * 0.33, T_ * 0.045, 0, 6.283); ctx.fill();
    }
    const n = 6, aw = T_ * 0.15;                                                                // striped awning
    for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? '#fbf6ea' : col; ctx.fillRect(x - T_ * 0.03 + i * (sw + T_ * 0.06) / n, y - aw, (sw + T_ * 0.06) / n + 0.5, aw); }
    for (let i = 0; i < n; i++) {                                                               // scalloped edge
      ctx.fillStyle = i % 2 ? '#fbf6ea' : col;
      ctx.beginPath(); ctx.arc(x - T_ * 0.03 + (i + 0.5) * (sw + T_ * 0.06) / n, y, (sw + T_ * 0.06) / n / 2, 0, Math.PI); ctx.fill();
    }
  }
  function drawWheel(ctx, r, h, t) {
    const { R, cx, gy } = r, cy = gy - R * 1.15, lw = Math.max(0.7, TILE * 0.035);
    ctx.strokeStyle = '#c8ccd4'; ctx.lineWidth = lw * 1.4;
    ctx.beginPath(); ctx.moveTo(cx - R * 0.55, gy); ctx.lineTo(cx, cy); ctx.lineTo(cx + R * 0.55, gy); ctx.stroke();   // A-frame legs
    ctx.fillStyle = '#8a8e96'; ctx.fillRect(cx - R * 0.7, gy - TILE * 0.05, R * 1.4, TILE * 0.08);
    const a0 = t * 0.25, N = 8;
    ctx.strokeStyle = '#f0f0f4'; ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.283); ctx.stroke();
    ctx.beginPath();
    for (let k = 0; k < N; k++) { const a = a0 + k * 6.283 / N; ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
    ctx.stroke();
    for (let k = 0; k < N; k++) {                                                               // gondolas hang level
      const a = a0 + k * 6.283 / N, gx = cx + Math.cos(a) * R, gyy = cy + Math.sin(a) * R;
      ctx.fillStyle = FAIR_BAL[(k + h) % FAIR_BAL.length];
      ctx.fillRect(gx - R * 0.13, gyy + R * 0.02, R * 0.26, R * 0.2);
    }
    ctx.fillStyle = '#f0c040'; ctx.beginPath(); ctx.arc(cx, cy, R * 0.09, 0, 6.283); ctx.fill();
  }
  function drawCarousel(ctx, r, h, t) {
    const { cw, cx, gy } = r, top = gy - TILE * 0.62, apex = gy - TILE * 0.95;
    ctx.fillStyle = '#d8c8a8'; ctx.beginPath(); ctx.ellipse(cx, gy, cw * 0.55, TILE * 0.1, 0, 0, 6.283); ctx.fill();   // platform
    // poles and horses going round: the back half first, darker
    const N = 6;
    for (const front of [false, true]) for (let k = 0; k < N; k++) {
      const a = t * 0.9 + k * 6.283 / N, s = Math.sin(a);
      if ((s > 0) !== front) continue;
      const px = cx + Math.cos(a) * cw * 0.44;
      ctx.strokeStyle = front ? '#e8c860' : '#a08a40'; ctx.lineWidth = Math.max(0.6, TILE * 0.025);
      ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, gy); ctx.stroke();
      const hy = gy - TILE * (0.26 + 0.07 * Math.sin(t * 2.4 + k));
      ctx.fillStyle = front ? ['#fbf6ea', '#c87050', '#f0d8a0'][k % 3] : 'rgba(120,100,80,0.8)';
      ctx.fillRect(px - TILE * 0.09, hy, TILE * 0.18, TILE * 0.08);
      ctx.fillRect(px + (Math.cos(a) > 0 ? TILE * 0.06 : -TILE * 0.1), hy - TILE * 0.06, TILE * 0.04, TILE * 0.08);
    }
    const n = 8;                                                                                // striped canopy
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#fbf6ea' : FAIR[(h + 1) % FAIR.length];
      ctx.beginPath(); ctx.moveTo(cx, apex); ctx.lineTo(cx - cw * 0.55 + i * cw * 1.1 / n, top); ctx.lineTo(cx - cw * 0.55 + (i + 1) * cw * 1.1 / n, top); ctx.closePath(); ctx.fill();
    }
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? FAIR[(h + 1) % FAIR.length] : '#fbf6ea';
      ctx.beginPath(); ctx.arc(cx - cw * 0.55 + (i + 0.5) * cw * 1.1 / n, top, cw * 1.1 / n / 2, 0, Math.PI); ctx.fill();
    }
    ctx.fillStyle = '#f0c040'; ctx.beginPath(); ctx.arc(cx, apex, TILE * 0.05, 0, 6.283); ctx.fill();
  }
  // Blossom on the breeze, over the whole view.
  function petals(ctx, t, v) {
    const W = v.x1 - v.x0, H = v.y1 - v.y0, n = Math.min(70, Math.round(W * H / (TILE * TILE * 6)));
    for (let i = 0; i < n; i++) {
      const sp = 0.6 + rnd(i, 3);
      const x = v.x0 + (((rnd(i, 1) * W + t * TILE * 0.5 * sp + Math.sin(t * 0.8 + i) * TILE * 0.4) % W) + W) % W;
      const y = v.y0 + ((rnd(i, 2) + t * 0.012 * sp) % 1) * H;
      ctx.fillStyle = i % 3 ? 'rgba(255,190,210,0.85)' : 'rgba(255,240,245,0.85)';
      ctx.beginPath(); ctx.ellipse(x, y, TILE * 0.05, TILE * 0.028, t * sp + i, 0, 6.283); ctx.fill();
    }
  }

  const DAY_FX = {
    // Market stalls on the pavements and a ride or two by the bigger
    // venues, balloons drifting up, a balloon seller, children with candy
    // floss, people everywhere, and blossom blowing through it all.
    springfair(ctx, t, v) {
      const BAL = FAIR_BAL;
      each(v, ANY, 24, (e, h, w, hh) => {
        const s = fairStall(e, h, w, hh);
        if (!s) return;
        drawStall(ctx, s, h, t);
        standsUnderWires(s.x - TILE * 0.06, s.y - TILE * 0.18, s.sw + TILE * 0.12, TILE * 0.86);
      });
      each(v, ANY, 6, (e, h, w, hh) => {
        const r = fairRide(e, h, w, hh);
        if (!r) return;
        (r.kind === 'wheel' ? drawWheel : drawCarousel)(ctx, r, h, t);
        if (r.kind === 'wheel') standsUnderWires(r.cx - r.R * 1.2, r.gy - r.R * 2.35, r.R * 2.4, r.R * 2.35 + TILE * 0.06);
        else standsUnderWires(r.cx - r.cw * 0.62, r.gy - TILE * 1.02, r.cw * 1.24, TILE * 1.15);
      });
      each(v, ANY, 40, (e, h, w, hh) => {
        for (let b = 0; b < 3; b++) {
          const ph = (t * 0.05 + rnd(h, b)) % 1;
          const bx = e.col * TILE + w * (0.2 + 0.6 * rnd(h, b + 3)) + Math.sin(t * 1.2 + b + h) * TILE * 0.18;
          const by = e.row * TILE + hh * 0.5 - ph * TILE * 7;
          const r  = TILE * 0.16;
          ctx.globalAlpha = ph < 0.75 ? 1 : (1 - ph) / 0.25;
          ctx.strokeStyle = 'rgba(60,60,60,0.6)'; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(bx, by + r * 1.2); ctx.quadraticCurveTo(bx + r * 0.4, by + r * 2.2, bx - r * 0.1, by + r * 3.2); ctx.stroke();
          ctx.fillStyle = BAL[(h + b) % BAL.length];
          ctx.beginPath(); ctx.ellipse(bx, by, r * 0.85, r * 1.1, 0, 0, 6.283); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.beginPath(); ctx.ellipse(bx - r * 0.3, by - r * 0.35, r * 0.2, r * 0.3, -0.5, 0, 6.283); ctx.fill();
        }
        ctx.globalAlpha = 1;
      });
      // fair-goers strolling along the pavement (the shared crowd() stands
      // people out past the kerb)
      each(v, ANY, 16, (e, h, w, hh) => {
        const s = TILE * 0.22, y = pavement(e, hh);
        standsUnderWires(e.col * TILE, y - s * 1.3, w, s * 1.4);
        for (let i = 0; i < 5; i++) {
          const u = (rnd(h, i) + t * 0.01 * (rnd(h, i + 9) - 0.5)) % 1;
          person(ctx, e.col * TILE + w * (0.05 + 0.9 * ((u + 1) % 1)), y - (i % 2) * s * 0.15, s, SHIRTS[(h + i * 5) % SHIRTS.length], Math.sin(t * 4 + i) * s * 0.04);
        }
      });
      each(v, ANY, 16, (e, h, w, hh) => {
        const s = TILE * 0.22, base = pavement(e, hh);
        // a balloon seller, a bunch of them bobbing on strings over their head
        if (rnd(h, 70) < 0.25) {
          const x = e.col * TILE + w * (0.15 + 0.7 * rnd(h, 71)), y = base;
          person(ctx, x, y, s, '#f4f0e6');
          for (let b = 0; b < 5; b++) {
            const bx = x + (b - 2) * s * 0.32 + Math.sin(t * 1.4 + b) * s * 0.08, by = y - s * (2.4 + (b % 2) * 0.4);
            ctx.strokeStyle = 'rgba(60,60,60,0.5)'; ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(x + s * 0.2, y - s * 0.7); ctx.lineTo(bx, by + s * 0.25); ctx.stroke();
            ctx.fillStyle = BAL[(b + h) % BAL.length];
            ctx.beginPath(); ctx.ellipse(bx, by, s * 0.2, s * 0.26, 0, 0, 6.283); ctx.fill();
          }
        }
        // a child with candy floss
        if (rnd(h, 72) < 0.45) {
          const x = e.col * TILE + w * (0.1 + 0.8 * rnd(h, 73)) + Math.sin(t * 0.4 + h) * s, y = base;
          person(ctx, x, y, s * 0.72, SHIRTS[(h + 4) % SHIRTS.length], Math.abs(Math.sin(t * 5 + h)) * -s * 0.05);
          ctx.strokeStyle = '#f4f0e6'; ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.moveTo(x + s * 0.2, y - s * 0.3); ctx.lineTo(x + s * 0.32, y - s * 0.75); ctx.stroke();
          ctx.fillStyle = '#ffb0d0'; ctx.beginPath(); ctx.arc(x + s * 0.34, y - s * 0.85, s * 0.2, 0, 6.283); ctx.fill();
        }
      });
      petals(ctx, t, v);
    },
    // Pupils queuing at the doors.
    exams(ctx, t, v) {
      each(v, SUB(LEARN), 10, (e, h, w, hh) => queue(ctx, e, h, w, hh, t, 6));
    },
    // A tractor working the ground in front of each farm, dust behind it.
    planting(ctx, t, v) {
      each(v, SUB(FARMSET), 12, (e, h, w, hh) => {
        const sp = 0.22 + rnd(h, 1) * 0.1;
        const u = Math.sin(t * sp + h) * 0.5 + 0.5, dir = Math.cos(t * sp + h) >= 0 ? 1 : -1;
        const tx = e.col * TILE + TILE * 0.3 + u * (w - TILE * 0.6), ty = e.row * TILE + hh + TILE * 0.42;
        puffs(ctx, tx - dir * TILE * 0.35, ty + TILE * 0.05, t, h, '170,140,100', 6, TILE * 0.6, TILE * 0.12, 0.45, -dir * 0.6);
        ctx.fillStyle = '#2f8a3a'; ctx.fillRect(tx - TILE * 0.26, ty - TILE * 0.14, TILE * 0.52, TILE * 0.26);
        ctx.fillStyle = '#9fd0ff'; ctx.fillRect(tx - dir * TILE * 0.02 - TILE * 0.08, ty - TILE * 0.12, TILE * 0.16, TILE * 0.12);
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(tx - dir * TILE * 0.16, ty + TILE * 0.12, TILE * 0.1, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.arc(tx + dir * TILE * 0.17, ty + TILE * 0.13, TILE * 0.06, 0, 6.283); ctx.fill();
      });
    },
    // A washing line out in front of every home.
    springclean(ctx, t, v) {
      const CL = ['#ffffff', '#ffb0c0', '#a8d0ff', '#fff0a0', '#b8e8b0'];
      each(v, HOMES, 50, (e, h, w, hh) => {
        const x0 = e.col * TILE + w * 0.1, x1 = e.col * TILE + w * 0.9, y = e.row * TILE + hh + TILE * 0.18;
        ctx.strokeStyle = '#6a5a48'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0, y - TILE * 0.1); ctx.lineTo(x0, y + TILE * 0.1); ctx.moveTo(x1, y - TILE * 0.1); ctx.lineTo(x1, y + TILE * 0.1); ctx.stroke();
        ctx.strokeStyle = 'rgba(80,80,80,0.7)';
        ctx.beginPath(); ctx.moveTo(x0, y - TILE * 0.08); ctx.quadraticCurveTo((x0 + x1) / 2, y, x1, y - TILE * 0.08); ctx.stroke();
        const n = Math.max(2, Math.round(w / TILE * 3));
        for (let i = 0; i < n; i++) {
          const u = (i + 0.5) / n, px = x0 + (x1 - x0) * u, py = y - TILE * 0.08 + TILE * 0.08 * 4 * u * (1 - u);
          const sw = Math.sin(t * 2.6 + i + h) * TILE * 0.03;
          ctx.fillStyle = CL[(h + i) % CL.length];
          ctx.beginPath(); ctx.moveTo(px - TILE * 0.07, py); ctx.lineTo(px + TILE * 0.07, py);
          ctx.lineTo(px + TILE * 0.07 + sw, py + TILE * 0.16); ctx.lineTo(px - TILE * 0.07 + sw, py + TILE * 0.16); ctx.closePath(); ctx.fill();
        }
      });
    },
    // Spring Floods: its standing water is PuddleSystem's, more and bigger.
    // Holidaymakers outside every hotel and restaurant, under parasols.
    tourists(ctx, t, v) {
      each(v, SUB([...HOTELS, ...EATS]), 24, (e, h, w, hh) => {
        const px = e.col * TILE + w * (0.15 + 0.2 * rnd(h, 2)), py = e.row * TILE + hh + TILE * 0.55;
        ctx.fillStyle = h & 1 ? '#ff6050' : '#40a0ff';
        ctx.beginPath(); ctx.arc(px, py, TILE * 0.32, 0, 6.283); ctx.fill();
        ctx.fillStyle = '#ffffff';
        for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, TILE * 0.32, k * 1.571, k * 1.571 + 0.785); ctx.closePath(); ctx.fill(); }
        crowd(ctx, e, h, w, hh, t, 6, 1.2);
      });
    },
    // Cold mist rolling off the fridges and freezers.
    icecream(ctx, t, v) {
      each(v, SUB(COLD), 24, (e, h, w, hh) => {
        for (let k = 0; k < 2; k++) {
          puffs(ctx, e.col * TILE + w * (0.3 + 0.4 * k), e.row * TILE + hh * 0.35, t, h + k, '170,200,230', 6, TILE * 1.1, TILE * 0.2, 0.7, 0.3);
        }
      });
    },
    // The bonfires' wood and smoke by day (the fire itself is in NIGHT_FX).
    midsummer(ctx, t, v) {
      each(v, SUB(PARTY), 20, (e, h, w, hh) => {
        const x = e.col * TILE + w * (0.3 + 0.4 * rnd(h, 1)), y = e.row * TILE + hh + TILE * 0.6;
        ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = TILE * 0.06;
        for (let k = 0; k < 4; k++) { const a = k * 0.8 + 0.3; ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * TILE * 0.22, y + TILE * 0.08); ctx.lineTo(x + Math.cos(a) * TILE * 0.12, y - TILE * 0.16); ctx.stroke(); }
        puffs(ctx, x, y - TILE * 0.2, t, h, '120,120,120', 6, TILE * 1.6, TILE * 0.14, 0.3, 0.5);
      });
    },
    // Dust devils wandering across the parched ground.
    dryspell(ctx, t, v) {
      const W = v.x1 - v.x0, H = v.y1 - v.y0;
      for (let i = 0; i < 4; i++) {
        const x = v.x0 + ((t * 0.012 * (1 + rnd(i, 1)) + rnd(i, 2)) % 1) * W;
        const y = v.y0 + (0.15 + 0.7 * rnd(i, 3)) * H + Math.sin(t * 0.3 + i * 2) * TILE * 2;
        for (let k = 0; k < 16; k++) {
          const a = t * 7 + k * 0.75, rr = TILE * (0.1 + k * 0.06);
          ctx.globalAlpha = 0.28 * (1 - k / 16);
          ctx.fillStyle = '#c8a878';
          ctx.beginPath(); ctx.arc(x + Math.cos(a) * rr, y - k * TILE * 0.09 + Math.sin(a) * rr * 0.35, TILE * (0.05 + k * 0.012), 0, 6.283); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    },
    // Hay bales by the farms, steam off the canneries and bakeries.
    harvest(ctx, t, v) {
      each(v, SUB(FARMSET), 16, (e, h, w, hh) => {
        for (let k = 0; k < 3; k++) {
          const x = e.col * TILE + w * (0.2 + 0.3 * k) + rnd(h, k) * TILE * 0.2, y = e.row * TILE + hh + TILE * 0.45;
          ctx.fillStyle = '#d8b050'; ctx.beginPath(); ctx.arc(x, y, TILE * 0.2, 0, 6.283); ctx.fill();
          ctx.strokeStyle = '#a07828'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, TILE * 0.12, 0, 5); ctx.stroke();
          ctx.beginPath(); ctx.arc(x, y, TILE * 0.05, 0, 5); ctx.stroke();
        }
      });
      each(v, SUB(STEAMY), 16, (e, h, w, hh) => puffs(ctx, e.col * TILE + w * 0.6, e.row * TILE + hh * 0.2, t, h, '240,240,240', 6, TILE * 1.4, TILE * 0.18, 0.5, 0.4));
    },
    // A school bus at the gate, pupils filing on.
    backtoschool(ctx, t, v) {
      each(v, SUB(LEARN), 10, (e, h, w, hh) => {
        const bx = e.col * TILE + w * 0.08, by = e.row * TILE + hh + TILE * 0.28, bw = TILE * 1.5, bh = TILE * 0.5;
        ctx.fillStyle = '#f2c018'; ctx.fillRect(bx, by, bw, bh);
        ctx.fillStyle = '#26323e';
        for (let k = 0; k < 5; k++) ctx.fillRect(bx + TILE * 0.12 + k * TILE * 0.26, by + TILE * 0.08, TILE * 0.18, TILE * 0.14);
        ctx.fillStyle = '#111'; ctx.fillRect(bx, by + bh * 0.62, bw, bh * 0.08);
        queue(ctx, { col: e.col + 1.7, row: e.row }, h, 0, hh, t, 5);
      });
    },
    // Families out on the step with their lanterns, waiting for dusk (the
    // lanterns themselves are light: NIGHT_FX).
    lanternnight(ctx, t, v) {
      each(v, HOMES, 40, (e, h, w, hh) => {
        crowd(ctx, e, h, w, hh, t, 3, 0.5);
        const s = TILE * 0.22;
        for (let i = 0; i < 3; i++) {
          const x = e.col * TILE + w * (0.1 + 0.8 * rnd(h, i)) + Math.sin(t * (0.3 + rnd(h, i + 9) * 0.5) + i) * s * 0.75 + s * 0.42;
          const y = e.row * TILE + hh + s * (0.9 + rnd(h, i + 20) * 0.8) - s * 0.62;
          ctx.fillStyle = ['#ffb060', '#ff8a50', '#ffd080'][(h + i) % 3];
          ctx.fillRect(x - s * 0.16, y - s * 0.2, s * 0.32, s * 0.4);
        }
      });
    },
    // Pumpkins on every step, gravestones in the keener gardens and
    // trick-or-treaters doing the rounds (lit and haunted in NIGHT_FX).
    // In the run-up (renderDay) it is handed the town's homes and the share
    // of them that have decorated so far, and draws only the decorations.
    spookynight(ctx, t, v, src = involved, share = 1) {
      const fine = Camera.zoom > 1.1, full = share >= 1;
      eachOf(src, v, HOMES, 120, (e, h, w, hh) => {
        if (rnd(h, 45) > share) return;
        const n = 1 + (h % 3);
        for (let k = 0; k < n; k++) {
          const x = e.col * TILE + w * (0.2 + 0.6 * rnd(h, k + 1)), y = e.row * TILE + hh + TILE * (0.12 + 0.07 * k), r = TILE * (0.13 - 0.02 * k);
          ctx.fillStyle = '#e8781e'; ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.78, 0, 0, 6.283); ctx.fill();
          ctx.fillStyle = 'rgba(160,70,10,0.5)'; ctx.fillRect(x - r * 0.45, y - r * 0.7, r * 0.12, r * 1.4); ctx.fillRect(x + r * 0.33, y - r * 0.7, r * 0.12, r * 1.4);
          ctx.fillStyle = '#3a6a20'; ctx.fillRect(x - r * 0.1, y - r * 1.1, r * 0.2, r * 0.4);
          if (fine) {                                   // the face
            ctx.fillStyle = '#3a1a04';
            ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.1); ctx.lineTo(x - r * 0.15, y - r * 0.1); ctx.lineTo(x - r * 0.32, y - r * 0.42); ctx.closePath(); ctx.fill();
            ctx.beginPath(); ctx.moveTo(x + r * 0.5, y - r * 0.1); ctx.lineTo(x + r * 0.15, y - r * 0.1); ctx.lineTo(x + r * 0.32, y - r * 0.42); ctx.closePath(); ctx.fill();
            ctx.fillRect(x - r * 0.45, y + r * 0.18, r * 0.9, r * 0.2);
          }
        }
        if (rnd(h, 34) < 0.3) for (let k = 0; k < 3; k++) {       // a graveyard on the lawn
          const x = e.col * TILE + w * (0.12 + 0.36 * k) + rnd(h, k + 40) * TILE * 0.08, y = e.row * TILE + hh + TILE * 0.5, gw = TILE * 0.13, gh = TILE * (0.17 + 0.06 * rnd(h, k + 44));
          ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y, gw * 0.8, gw * 0.25, 0, 0, 6.283); ctx.fill();
          ctx.fillStyle = k % 2 ? '#8a8e90' : '#9a9c98';
          ctx.beginPath(); ctx.roundRect(x - gw / 2, y - gh, gw, gh, [gw / 2, gw / 2, 0, 0]); ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - gw * 0.07, y - gh * 0.8, gw * 0.14, gh * 0.45); ctx.fillRect(x - gw * 0.25, y - gh * 0.66, gw * 0.5, gh * 0.12);
        }
      });
      if (!full) return;
      // Trick-or-treaters: ghosts, witches, pumpkins, wizards and monsters.
      const COSTUME = ['#f4f4f4', '#18141c', '#f07818', '#6a3ab0', '#3a9a3a'];
      each(v, HOMES, 36, (e, h, w, hh) => {
        const s = TILE * 0.17, base = e.row * TILE + hh;
        for (let i = 0; i < 3; i++) {
          const c = (h + i * 3) % COSTUME.length;
          const x = e.col * TILE + w * 0.5 + Math.sin(t * 0.35 + (h & 31) + i * 0.5) * TILE * 0.9 + i * s * 0.8;
          const y = base + s * (2.2 + 0.25 * i), bob = Math.abs(Math.sin(t * 5 + i + h)) * s * 0.08;
          person(ctx, x, y, s, COSTUME[c], -bob);
          if (c === 0) { ctx.fillStyle = '#f4f4f4'; ctx.beginPath(); ctx.arc(x, y - s * 0.92 - bob, s * 0.3, 0, 6.283); ctx.fill(); }                                                  // a sheet over the head
          if (c === 1 || c === 3) { ctx.fillStyle = COSTUME[c]; ctx.beginPath(); ctx.moveTo(x - s * 0.36, y - s * 1.08 - bob); ctx.lineTo(x + s * 0.36, y - s * 1.08 - bob); ctx.lineTo(x, y - s * 1.75 - bob); ctx.closePath(); ctx.fill(); }   // a pointed hat
          ctx.fillStyle = '#f07818'; ctx.fillRect(x + s * 0.3, y - s * 0.4 - bob, s * 0.22, s * 0.22);                                                                                // the sweet bucket
        }
      });
    },
    // Leaves tearing across the view on the wind.
    gales(ctx, t, v) {
      const LEAF = ['#d86a20', '#b84a18', '#e0a030', '#8a5a20', '#c03020'];
      const W = v.x1 - v.x0 + TILE * 8, H = v.y1 - v.y0;
      for (let i = 0; i < 90; i++) {
        const sp = TILE * (4 + rnd(i, 1) * 4);
        const x = v.x0 - TILE * 4 + ((rnd(i, 2) * W + t * sp) % W);
        const y = v.y0 + rnd(i, 3) * H + Math.sin(t * 2.4 + i) * TILE * 0.5;
        const a = t * (3 + rnd(i, 4) * 4) + i;
        ctx.fillStyle = LEAF[i % LEAF.length];
        ctx.beginPath(); ctx.ellipse(x, y, TILE * 0.09, TILE * 0.045, a, 0, 6.283); ctx.fill();
      }
    },
    // Queues round the block for the sale, bags in hand at the front.
    blackfriday(ctx, t, v) {
      each(v, SUB(SHOPS), 20, (e, h, w, hh) => queue(ctx, e, h, w, hh, t, 11, ['#d02030', '#202020', '#f0c040']));
    },
    // Holiday shoppers queuing with their presents.
    shopping(ctx, t, v) {
      each(v, SUB(SHOPS), 20, (e, h, w, hh) => queue(ctx, e, h, w, hh, t, 7, ['#d02030', '#20a050', '#f0c040']));
    },
    // Icicles off every roof edge and a glaze over the top.
    icestorm(ctx, t, v) {
      const b = iceBuild();
      if (b < 0.01) return;
      each(v, e => e.type === T.HOUSE || e.type === T.INDUSTRIAL, 90, (e, h, w, hh) => {
        const x = e.col * TILE, y = e.row * TILE;
        ctx.fillStyle = `rgba(200,230,255,${(0.18 * b).toFixed(3)})`; ctx.fillRect(x, y, w, hh);
        const n = Math.max(3, Math.round(w / TILE * 5));
        ctx.fillStyle = `rgba(225,245,255,${(0.9 * Math.min(1, b * 2)).toFixed(3)})`;
        for (let i = 0; i < n; i++) {
          if (rnd(h, i + 30) > b * 1.4) continue;                  // not every icicle has formed yet
          const ix = x + (i + 0.5) / n * w, len = TILE * (0.1 + rnd(h, i) * 0.22) * (0.3 + 0.7 * b);
          ctx.beginPath(); ctx.moveTo(ix - TILE * 0.035, y + hh); ctx.lineTo(ix + TILE * 0.035, y + hh); ctx.lineTo(ix, y + hh + len); ctx.closePath(); ctx.fill();
        }
      });
    },
    // Skaters circling in front of the rinks and halls, confetti over the route.
    skating(ctx, t, v) {
      each(v, SUB(['icerink', 'hotsprings', 'pavilion', 'convention']), 10, (e, h, w, hh) => {
        const cx = e.col * TILE + w / 2, cy = e.row * TILE + hh + TILE * 0.9, rx = Math.max(TILE, w * 0.45), ry = TILE * 0.5;
        ctx.fillStyle = 'rgba(210,235,255,0.75)'; ctx.beginPath(); ctx.ellipse(cx, cy, rx + TILE * 0.2, ry + TILE * 0.2, 0, 0, 6.283); ctx.fill();
        for (let i = 0; i < 7; i++) {
          const a = t * 0.8 + i * 0.9;
          person(ctx, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry + TILE * 0.1, TILE * 0.22, SHIRTS[(h + i) % SHIRTS.length]);
        }
      });
      const CF = ['#ff5a7a', '#5ab0ff', '#ffd84a', '#7ae07a', '#ffffff'];
      each(v, ANY, 24, (e, h, w, hh) => {
        for (let k = 0; k < 8; k++) {
          const ph = (t * 0.25 + rnd(h, k)) % 1;
          ctx.fillStyle = CF[(h + k) % CF.length];
          ctx.fillRect(e.col * TILE + rnd(h, k + 3) * w + Math.sin(t * 3 + k) * TILE * 0.15, e.row * TILE - TILE * 0.5 + ph * (hh + TILE), TILE * 0.06, TILE * 0.04);
        }
      });
    },
  };

  const NIGHT_FX = {
    // The fair runs into the evening: festoon bulbs along every stall's
    // awning, and the rides picked out in lights.
    springfair(ctx, t, dark, v) {
      if (dark < 0.05) return;
      const k = Math.min(1, dark * 1.6);
      each(v, ANY, 24, (e, h, w, hh) => {
        const s = fairStall(e, h, w, hh);
        if (!s) return;
        for (let i = 0; i <= 6; i++) dot(ctx, '255,226,150', s.x - TILE * 0.03 + i * (s.sw + TILE * 0.06) / 6, s.y - TILE * 0.15, TILE * 0.14, k * (0.7 + 0.25 * Math.sin(t * 3 + i + h)));
      });
      each(v, ANY, 6, (e, h, w, hh) => {
        const r = fairRide(e, h, w, hh);
        if (!r) return;
        if (r.kind === 'wheel') {
          const cy = r.gy - r.R * 1.15, a0 = t * 0.25;
          for (let i = 0; i < 16; i++) { const a = a0 + i * 6.283 / 16; dot(ctx, TWINKLE[(i + Math.floor(t * 2)) % TWINKLE.length], r.cx + Math.cos(a) * r.R, cy + Math.sin(a) * r.R, TILE * 0.16, k * 0.85); }
          dot(ctx, '255,230,150', r.cx, cy, TILE * 0.3, k * 0.7);
        } else {
          const top = r.gy - TILE * 0.62;
          for (let i = 0; i <= 8; i++) dot(ctx, '255,226,150', r.cx - r.cw * 0.55 + i * r.cw * 1.1 / 8, top, TILE * 0.13, k * (0.75 + 0.25 * Math.sin(t * 4 + i)));
          dot(ctx, '255,210,140', r.cx, r.gy - TILE * 0.3, TILE * 0.7, k * 0.35);
        }
      });
    },
    // Desk lamps on in every window.
    exams(ctx, t, dark, v) {
      if (dark < 0.1) return;
      each(v, SUB(LEARN), 10, (e, h, w, hh) => {
        const n = Math.min(14, Math.round(w * hh / (TILE * TILE) * 1.5));
        for (let i = 0; i < n; i++) dot(ctx, '255,230,150', e.col * TILE + w * (0.1 + 0.8 * rnd(h, i)), e.row * TILE + hh * (0.15 + 0.6 * rnd(h, i + 30)), TILE * 0.18, dark * (0.55 + 0.35 * Math.sin(t * 0.7 + i)));
      });
    },
    // Bonfires, flickering, sparks going up.
    midsummer(ctx, t, dark, v) {
      each(v, SUB(PARTY), 20, (e, h, w, hh) => {
        const x = e.col * TILE + w * (0.3 + 0.4 * rnd(h, 1)), y = e.row * TILE + hh + TILE * 0.5;
        const fl = 0.8 + 0.2 * Math.sin(t * 13 + h) * Math.sin(t * 7.3);
        dot(ctx, '255,140,40', x, y, TILE * 1.1 * fl, 0.55 * Math.max(0.35, dark));
        dot(ctx, '255,220,120', x, y - TILE * 0.05, TILE * 0.35 * fl, 0.9);
        for (let k = 0; k < 6; k++) {
          const ph = (t * 0.7 + rnd(h, k)) % 1;
          dot(ctx, '255,190,90', x + Math.sin(ph * 7 + k) * TILE * 0.25, y - ph * TILE * 1.6, TILE * 0.06, 1 - ph);
        }
      });
    },
    // Paper lanterns let go from every doorstep, rising and drifting off on
    // the wind until the sky is full of them. Few at first, most mid-evening.
    lanternnight(ctx, t, dark, v) {
      if (dark < 0.05) return;
      const fx = SeasonalEvents.fx();
      const p = fx ? Math.max(0, Math.min(1, (DayNight.getElapsed() - fx.start) / Math.max(1, fx.end - fx.start))) : 0.5;
      const per = 1 + Math.round(3 * Math.sin(Math.PI * p));
      const RISE = TILE * 20, a = Math.min(1, dark * 1.4);
      const body = glow('255,170,70'), flame = glow('255,235,170');
      // A lantern can be on screen long after the home that let it go has
      // scrolled off the bottom, so look that far below the view.
      let n = 0;
      for (const e of involved) {
        if (!HOMES(e) || !e.powered) continue;
        if (e.col < v.c0 - 9 || e.col > v.c1 + 2 || e.row < v.r0 - 1 || e.row > v.r1 + 21) continue;
        const h = hash(e), w = (e.width || 1) * TILE;
        for (let k = 0; k < per; k++) {
          const ph = (t * (0.016 + 0.008 * rnd(h, k)) + rnd(h, k + 5)) % 1;
          const x = e.col * TILE + w * 0.5 + ph * TILE * (3 + 5 * rnd(h, k + 9)) + Math.sin(t * 0.5 + k * 2 + (h & 63)) * TILE * 0.3 * (0.3 + ph);
          const y = e.row * TILE + TILE * 0.4 - ph * RISE;
          const s = TILE * (0.13 + 0.22 * ph);                       // rising towards the eye
          const fade = Math.min(1, ph * 14) * Math.min(1, (1 - ph) * 3.5);
          const fl = 0.85 + 0.15 * Math.sin(t * 7 + k * 3 + h);
          dot(ctx, '255,150,60', x, y, s * 2.6, 0.32 * fade * a * fl);
          ctx.globalAlpha = Math.min(1, 0.95 * fade * a);
          ctx.drawImage(body, x - s * 0.62, y - s * 0.95, s * 1.24, s * 1.6);     // the paper, taller than wide
          ctx.globalAlpha = Math.min(1, fade * a * fl);
          ctx.drawImage(flame, x - s * 0.3, y + s * 0.05, s * 0.6, s * 0.6);     // the flame at its mouth
        }
        if (++n >= 140) break;
      }
      ctx.globalAlpha = 1;
    },
    // Pumpkins lit from inside, a haunted house or two, ghosts over the
    // rooftops, eyes in the hedge and a low fog over everything.
    // In the run-up it only lights the pumpkins that are out so far.
    spookynight(ctx, t, dark, v, src = involved, share = 1) {
      if (dark < 0.08) return;
      const full = share >= 1;
      // The fog: wide, low, drifting, green where the lamps catch it. One
      // bank per FOG_CELL of the world, so it sits on the ground and the
      // camera pans past it (placed by the view, it slid along with the
      // screen). Each bank sways about its spot rather than drifting off.
      const fog = glow('150,190,150'), FOG_CELL = TILE * 20;
      const fc0 = Math.floor(v.x0 / FOG_CELL) - 1, fc1 = Math.floor(v.x1 / FOG_CELL) + 1;
      const fr0 = Math.floor(v.y0 / FOG_CELL) - 1, fr1 = Math.floor(v.y1 / FOG_CELL);
      if (full && (fc1 - fc0 + 1) * (fr1 - fr0 + 1) <= 600) {
        for (let fr = fr0; fr <= fr1; fr++) for (let fc = fc0; fc <= fc1; fc++) {
          const i = (fc * 7919 + fr * 104729) % 100003;
          const x = (fc + rnd(i, 1)) * FOG_CELL + Math.sin(t * 0.05 * (0.4 + rnd(i, 2)) + i) * TILE * 3;
          const y = (fr + rnd(i, 3)) * FOG_CELL + Math.sin(t * 0.2 + i) * TILE * 0.6;
          const fw = TILE * (7 + 6 * rnd(i, 4)), fh = TILE * (1.4 + rnd(i, 5));
          ctx.globalAlpha = 0.16 * dark * (0.6 + 0.4 * Math.sin(t * 0.3 + i * 1.7));
          ctx.drawImage(fog, x - fw / 2, y - fh / 2, fw, fh);
        }
      }
      eachOf(src, v, HOMES, 120, (e, h, w, hh) => {
        if (rnd(h, 45) > share) return;
        const x0 = e.col * TILE, y0 = e.row * TILE;
        const n = 1 + (h % 3);
        for (let k = 0; k < n; k++) dot(ctx, '255,150,40', x0 + w * (0.2 + 0.6 * rnd(h, k + 1)), y0 + hh + TILE * (0.12 + 0.07 * k), TILE * (0.3 + 0.04 * Math.sin(t * 9 + h + k)), dark * 0.5);
        if (full && rnd(h, 31) < 0.22) {                                    // the haunted one: sick green from below, purple in the windows
          const fl = Math.sin(t * 11 + h) * Math.sin(t * 3.7 + h) > 0.55 ? 1.5 : 1;
          dot(ctx, '110,255,90', x0 + w / 2, y0 + hh * 0.75, Math.max(w, hh) * 0.9, 0.24 * dark * fl);
          dot(ctx, '190,90,255', x0 + w * 0.3, y0 + hh * 0.42, TILE * 0.2, 0.55 * dark);
          dot(ctx, '190,90,255', x0 + w * 0.7, y0 + hh * 0.42, TILE * 0.2, 0.55 * dark);
        }
        if (full && rnd(h, 33) < 0.3 && Math.sin(t * 0.6 + (h & 127)) > -0.2 && Math.sin(t * 2.9 + h) < 0.94) {   // something watching, and blinking
          const ex = x0 + (h & 1 ? -TILE * 0.22 : w + TILE * 0.22), ey = y0 + hh * 0.8, col = h & 2 ? '255,50,30' : '255,220,60';
          dot(ctx, col, ex - TILE * 0.045, ey, TILE * 0.06, 0.95 * dark); dot(ctx, col, ex + TILE * 0.045, ey, TILE * 0.06, 0.95 * dark);
        }
      });
      // Ghosts: pale, see-through, drifting over the roofs. Drawn as paint
      // rather than light, so they keep their eyes.
      ctx.globalCompositeOperation = 'source-over';
      if (full) each(v, e => HOMES(e) && rnd(hash(e), 32) < 0.3, 40, (e, h, w, hh) => {
        const vis = 0.5 + 0.5 * Math.sin(t * 0.45 + (h & 255));
        if (vis < 0.15) return;
        const s = TILE * 0.3;
        const gx = e.col * TILE + w / 2 + Math.sin(t * 0.33 + h) * TILE * 1.6, gy = e.row * TILE - TILE * 0.35 + Math.cos(t * 0.27 + h * 1.3) * TILE * 0.7;
        ctx.globalAlpha = 0.55 * vis * Math.min(1, dark * 1.5);
        ctx.fillStyle = '#e4f0ff';
        ctx.beginPath(); ctx.arc(gx, gy, s * 0.5, Math.PI, 0);
        ctx.lineTo(gx + s * 0.5, gy + s * 0.75);
        for (let q = 0; q < 4; q++) {                                 // the ragged hem, rippling
          const qx = gx + s * 0.5 - (q + 1) * s * 0.25;
          ctx.quadraticCurveTo(qx + s * 0.125, gy + s * (0.5 + 0.12 * Math.sin(t * 4 + q * 2 + h)), qx, gy + s * 0.75);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#10141c';
        ctx.beginPath(); ctx.ellipse(gx - s * 0.17, gy - s * 0.05, s * 0.07, s * 0.11, 0, 0, 6.283); ctx.ellipse(gx + s * 0.17, gy - s * 0.05, s * 0.07, s * 0.11, 0, 0, 6.283); ctx.fill();
        ctx.beginPath(); ctx.ellipse(gx, gy + s * 0.22, s * 0.06, s * 0.09, 0, 0, 6.283); ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
    },
    // Ice catching the light, and the storm itself: sleet driving down on a
    // slant in gusts, hailstones bouncing where they land. It is drawn here
    // rather than in the day pass so it falls in front of everything, day
    // or night.
    icestorm(ctx, t, dark, v) {
      const b = iceBuild();
      if (b < 0.01) return;
      each(v, e => e.type === T.HOUSE || e.type === T.INDUSTRIAL, 60, (e, h, w, hh) => {
        for (let k = 0; k < 2; k++) {
          const tw = Math.max(0, Math.sin(t * 1.7 + rnd(h, k) * 20));
          if (tw > 0.8) dot(ctx, '235,250,255', e.col * TILE + rnd(h, k + 4) * w, e.row * TILE + rnd(h, k + 8) * hh, TILE * 0.14, (tw - 0.8) * 5 * (0.4 + 0.6 * dark) * b);
        }
      });
      if (Camera.zoom < 0.3) return;
      // It does not fall the whole time: squalls blow through, a little
      // under half the event between them, building and dying away. Timed
      // off the game clock, so a paused game holds the squall it is in.
      const gh = DayNight.getElapsed() / DayNight.secondsPerGameHour();
      // The first squalls come in thin while the storm is still building.
      const squall = b * b * Math.max(0, Math.min(1, (Math.sin(gh * 3.927 + 0.8) - 0.15) / 0.35));   // one every 1.6 game hours
      if (squall < 0.02) return;
      // Every stone belongs to a spot on the ground, not to the screen: the
      // world is cut into cells and each cell on screen throws its own, off
      // a hash of where it is, so panning slides the view over them. Cells
      // double in size as the view pulls back, which keeps the number of
      // stones on screen about the same at any zoom.
      const sx0 = Camera.x, sy0 = Camera.y, W = window.innerWidth / Camera.zoom, H = window.innerHeight / Camera.zoom;
      const gust = squall * (0.85 + 0.15 * Math.sin(t * 0.45) * Math.sin(t * 0.17 + 1));     // and it gusts within one
      const SLANT = 0.26;                                                      // sideways for every unit down
      const cell = 4 * TILE * Math.pow(2, Math.max(0, Math.round(Math.log2(1 / Camera.zoom))));
      const big = cell / 4;                                                    // a stone stays a few pixels across however far out
      const fall = H * 0.9;                                                    // how far up a stone is when it first shows
      const cx0 = Math.floor((sx0 - fall * SLANT) / cell) - 1, cx1 = Math.floor((sx0 + W) / cell);
      const cy0 = Math.floor(sy0 / cell), cy1 = Math.floor((sy0 + H) / cell), cyF = Math.floor((sy0 + H + fall) / cell);
      const cellHash = (cx, cy) => (((cx * 7919) ^ (cy * 104729)) & 0xffff) + 1;
      // Ice, not rain: solid stones, painted rather than lit, so they read
      // as lumps with a face and an edge. Fewer of them as a squall thins.
      const solid = 0.95 - 0.2 * dark;
      ctx.globalCompositeOperation = 'source-over';
      // The ones still falling: chunky shards, tumbling, a short smear
      // behind, each on its way down to a spot in its cell.
      for (let cy = cy0; cy <= cyF; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const hc = cellHash(cx, cy);
        for (let q = 0; q < 4; q++) {
          const c = t * (0.5 + rnd(hc, q) * 0.3) + rnd(hc, q + 10) * 7, k = Math.floor(c), ph = c - k;
          if (rnd(hc + k * 13, q + 50) > gust) continue;
          const x = (cx + rnd(hc + k * 31, q + 20)) * cell - (1 - ph) * fall * SLANT;
          const y = (cy + rnd(hc + k * 17, q + 30)) * cell - (1 - ph) * fall;
          if (y < sy0 - big || y > sy0 + H + big || x < sx0 - big || x > sx0 + W + big) continue;
          const s = big * (0.09 + 0.09 * rnd(hc, q + 40)), a = t * (4 + rnd(hc, q + 45) * 5) + hc;
          const ca = Math.cos(a) * s, sa = Math.sin(a) * s;
          ctx.globalAlpha = 0.22 * solid; ctx.fillStyle = '#cfe8ff';
          ctx.beginPath(); ctx.moveTo(x - s * 0.5, y); ctx.lineTo(x + s * 0.5, y); ctx.lineTo(x - s * 2.6 * SLANT, y - s * 2.6); ctx.closePath(); ctx.fill();
          ctx.globalAlpha = solid; ctx.fillStyle = '#a9d2f2';                                 // the stone: a blue edge...
          ctx.beginPath(); ctx.moveTo(x + ca, y + sa); ctx.lineTo(x - sa * 0.7, y + ca * 0.7); ctx.lineTo(x - ca, y - sa); ctx.lineTo(x + sa * 0.7, y - ca * 0.7); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#f4fbff';                                                         // ...and a white face
          ctx.beginPath(); ctx.moveTo(x + ca * 0.62, y + sa * 0.62); ctx.lineTo(x - sa * 0.42, y + ca * 0.42); ctx.lineTo(x - ca * 0.62, y - sa * 0.62); ctx.lineTo(x + sa * 0.42, y - ca * 0.42); ctx.closePath(); ctx.fill();
        }
      }
      // The ones that have landed: a bounce, a crack of fragments, then they
      // lie where they fell for a few seconds before melting away.
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        const hc = cellHash(cx, cy);
        for (let j = 0; j < 12; j++) {
          const c = t * (0.2 + rnd(hc, j + 60) * 0.12) + rnd(hc, j + 75) * 9, k = Math.floor(c), ph = c - k;
          if (rnd(hc + k * 13, j + 90) > gust) continue;
          const x = (cx + rnd(hc + k * 31, j + 105)) * cell, y = (cy + rnd(hc + k * 17, j + 120)) * cell, s = big * (0.055 + 0.06 * rnd(hc, j + 135));
          const up = ph < 0.1 ? Math.sin(ph / 0.1 * Math.PI) * big * 0.22 : 0;
          const fade = ph < 0.65 ? 1 : 1 - (ph - 0.65) / 0.35;
          ctx.globalAlpha = 0.28 * fade; ctx.fillStyle = '#1c2c44';
          ctx.beginPath(); ctx.ellipse(x + s * 0.3, y + s * 0.5, s * 1.05, s * 0.5, 0, 0, 6.283); ctx.fill();
          ctx.globalAlpha = solid * fade; ctx.fillStyle = '#b4d8f4';
          ctx.beginPath(); ctx.arc(x, y - up, s, 0, 6.283); ctx.fill();
          ctx.fillStyle = '#f6fcff';
          ctx.beginPath(); ctx.arc(x - s * 0.22, y - up - s * 0.22, s * 0.62, 0, 6.283); ctx.fill();
          if (ph < 0.09) {                                                                   // it cracks as it hits
            const q = ph / 0.09;
            ctx.globalAlpha = solid * (1 - q);
            for (let f = 0; f < 4; f++) { const fa = f * 1.571 + j; ctx.fillRect(x + Math.cos(fa) * s * (1 + q * 4) - s * 0.2, y - Math.abs(Math.sin(fa)) * s * (1 + q * 3) * (1 - q * 0.5) - s * 0.2, s * 0.4, s * 0.4); }
          }
        }
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1;
    },
    // The carnival's warm lights along the route.
    skating(ctx, t, dark, v) {
      if (dark < 0.1) return;
      each(v, ANY, 30, (e, h, w, hh) => {
        for (let k = 0; k < 4; k++) dot(ctx, TWINKLE[(h + k) % TWINKLE.length], e.col * TILE + w * (k + 0.5) / 4, e.row * TILE + hh + TILE * 0.1, TILE * 0.14, dark * (0.6 + 0.4 * Math.sin(t * 3 + k + h)));
      });
    },
  };

  return { renderDay, renderNight };
})();
