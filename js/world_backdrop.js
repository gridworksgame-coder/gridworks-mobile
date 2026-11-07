/* ═══════════════════════════════════════════════════════════════════
   WORLD BACKDROP
   What the player sees past the edge of the buildable map, instead of a
   flat void: untamed country that fades into haze — forest, rocky
   highlands drawn with survey contour lines, lakes, the map's own rivers
   carrying on out of bounds, and a few neighbouring towns whose roads run
   up to the city limits (and whose windows light up after dark). The map
   edge itself is marked as the CITY LIMITS with a dashed survey line.

   Nothing here is interactive or saved. The country is baked lazily into
   four low-resolution strips (top / bottom / left / right) the first time
   each is needed, seeded from the city name so a world always looks the
   same. The strips are drawn upscaled with smoothing: the softness is the
   point — the land beyond the limits reads as out of focus, and the haze
   baked into them thickens with distance until it meets the sky fill.
   ═══════════════════════════════════════════════════════════════════ */

const WorldBackdrop = (() => {
  const M  = 72;   // tiles of country baked past each edge
  const PX = 4;    // strip pixels per tile
  const PAD = 2;   // tiles baked past each strip's own edges, so smoothing at
                   // a seam samples real neighbouring land, not transparency

  let strips = null;   // [{ c0, r0, w, h, canvas|null }]
  let towns  = null;   // [{ cx, cy, lights: [{x, y, ph}] }] world tiles
  let rivers = null;   // [{ pts: [[c, r]...], width }] world tiles
  let seed   = 0;
  let idleQueued = false;
  let idleGen = 0;     // bumped by reset(), so a background bake of an old world stops
  const SLICE_MS = 6;  // background baking per task, so frames keep coming

  // ── Noise (same hash family as the in-map ground) ───────────────────
  function _hash(gx, gy) {
    let h = (gx * 1619 + gy * 31337 + seed) & 0x7fffffff;
    h = ((h >> 16) ^ h) * 0x45d9f3b | 0;
    h = ((h >> 16) ^ h) & 0x7fffffff;
    return h / 0x7fffffff;
  }
  function _vnoise(x, y, scale) {
    const fx = x / scale, fy = y / scale;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const ux = fx - ix, uy = fy - iy;
    const sx = ux * ux * (3 - 2 * ux), sy = uy * uy * (3 - 2 * uy);
    return _hash(ix, iy) * (1 - sx) * (1 - sy) + _hash(ix + 1, iy) * sx * (1 - sy)
         + _hash(ix, iy + 1) * (1 - sx) * sy   + _hash(ix + 1, iy + 1) * sx * sy;
  }
  // Two octaves — enough to break up the blobby look of one.
  const _fbm = (x, y, s) => _vnoise(x, y, s) * 0.68 + _vnoise(x + 311, y + 173, s * 0.42) * 0.32;
  const _smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  // Deterministic PRNG for placement (towns, rivers, trees).
  function _rng(s) {
    let a = s >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // Distance (tiles) from a point to the map rectangle — 0 inside it.
  function _outDist(u, v) {
    const dx = u < 0 ? -u : (u > COLS ? u - COLS : 0);
    const dy = v < 0 ? -v : (v > ROWS ? v - ROWS : 0);
    return Math.hypot(dx, dy);
  }

  // ── Palette (matches render_core.js ground anchors) ─────────────────
  const GRASS_DARK  = [16, 30, 16], GRASS_LIGHT = [44, 70, 28];
  const MEADOW = [76, 70, 36], LUSH = [24, 60, 22];
  const FOREST_FLOOR = [12, 24, 13];
  const ROCK_LO = [46, 46, 40], ROCK_HI = [86, 82, 70];
  const WATER = [6, 28, 52], SAND = [70, 64, 44];
  const HAZE = [22, 28, 32];
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // Terrain fields. Features ease in over the first few tiles past the
  // edge so the land meets the map as plain grass, not a cliff of rock.
  function _fields(u, v, d) {
    const k = _smooth(2, 12, d);
    return {
      forest: _fbm(u + 1000, v + 1000, 22) + (k - 1) * 0.3,
      rock:   _fbm(u + 3000, v - 2000, 55) * k,
      lake:   _fbm(u - 5000, v + 9000, 30) * k,
    };
  }

  // ── Setup ───────────────────────────────────────────────────────────
  function _init() {
    const name = (typeof CityInfo !== 'undefined' && CityInfo.getCityName()) || 'city';
    seed = 12345;
    for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) & 0x7fffffff;
    strips = [
      { c0: -M,   r0: -M,   w: COLS + 2 * M, h: M },     // top
      { c0: -M,   r0: ROWS, w: COLS + 2 * M, h: M },     // bottom
      { c0: -M,   r0: 0,    w: M,            h: ROWS },  // left
      { c0: COLS, r0: 0,    w: M,            h: ROWS },  // right
    ].map(s => ({ ...s, canvas: null, job: null }));
    _planRivers();
    _planTowns();
  }

  // The map's rivers don't stop at the border: every run of water tiles
  // touching an edge carries on outward, meandering, until it's lost in
  // the haze.
  function _planRivers() {
    rivers = [];
    if (typeof WaterSystem === 'undefined') return;
    const rnd = _rng(seed ^ 0x51f15e);
    const edges = [
      { len: COLS, at: i => [i, 0],        dir: [0, -1] },
      { len: COLS, at: i => [i, ROWS - 1], dir: [0, 1] },
      { len: ROWS, at: i => [0, i],        dir: [-1, 0] },
      { len: ROWS, at: i => [COLS - 1, i], dir: [1, 0] },
    ];
    for (const e of edges) {
      let runStart = -1;
      for (let i = 0; i <= e.len; i++) {
        const wet = i < e.len && WaterSystem.isWater(...e.at(i));
        if (wet && runStart < 0) runStart = i;
        if (!wet && runStart >= 0) {
          const width = i - runStart;
          const mid = (runStart + i) / 2;
          const [c, r] = e.at(mid);
          // Start on the edge line itself (tile centre → boundary).
          let x = e.dir[0] ? (e.dir[0] < 0 ? 0 : COLS) : c;
          let y = e.dir[1] ? (e.dir[1] < 0 ? 0 : ROWS) : r;
          const pts = [[x - e.dir[0] * 1.5, y - e.dir[1] * 1.5], [x, y]];
          let ang = Math.atan2(e.dir[1], e.dir[0]), drift = 0;
          for (let s = 0; s < M * 1.4; s++) {
            drift += (rnd() - 0.5) * 0.35;
            drift *= 0.9;
            const a = ang + drift;
            x += Math.cos(a); y += Math.sin(a);
            pts.push([x, y]);
          }
          rivers.push({ pts, width: Math.max(1, width) });
          runStart = -1;
        }
      }
    }
  }

  // A handful of neighbouring towns, each with a road running in to the
  // city limits.
  function _planTowns() {
    towns = [];
    const rnd = _rng(seed ^ 0x70e5);
    const n = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) {
      const side = Math.floor(rnd() * 4);
      const along = 0.12 + rnd() * 0.76;
      const out = 16 + rnd() * 16;
      let cx, cy, ex, ey;
      if (side === 0)      { cx = along * COLS; cy = -out;        ex = cx + (rnd() - 0.5) * 20; ey = 0; }
      else if (side === 1) { cx = along * COLS; cy = ROWS + out;  ex = cx + (rnd() - 0.5) * 20; ey = ROWS; }
      else if (side === 2) { cx = -out;        cy = along * ROWS; ex = 0;    ey = cy + (rnd() - 0.5) * 20; }
      else                 { cx = COLS + out;  cy = along * ROWS; ex = COLS; ey = cy + (rnd() - 0.5) * 20; }
      // Keep towns clear of lakes and each other.
      const f = _fields(cx, cy, out);
      if (f.lake > 0.66) continue;
      if (towns.some(t => Math.hypot(t.cx - cx, t.cy - cy) < 40)) continue;
      const blocks = [], lights = [];
      const size = 4 + rnd() * 5;
      const count = Math.floor(18 + size * 5);
      for (let b = 0; b < count; b++) {
        // Buildings line up on a loose street grid.
        const gx = Math.round((rnd() - 0.5) * size * 2 / 1.6) * 1.6;
        const gy = Math.round((rnd() - 0.5) * size * 2 / 1.6) * 1.6;
        if (Math.hypot(gx, gy) > size) continue;
        const bw = 0.6 + rnd() * 0.7, bh = 0.6 + rnd() * 0.7;
        const tone = rnd();
        blocks.push({ x: cx + gx, y: cy + gy, w: bw, h: bh, tone });
        if (rnd() < 0.7) lights.push({ x: cx + gx + bw / 2, y: cy + gy + bh / 2, ph: rnd() * 6.28, big: rnd() < 0.15 });
      }
      towns.push({ cx, cy, ex, ey, size, blocks, lights, fade: 1 - _smooth(M * 0.4, M * 0.85, out) });
    }
  }

  // ── Baking a strip ──────────────────────────────────────────────────
  // A strip is a few million pixels of noise: the long ones took up to
  // five seconds to bake, and they were baked one after another just after
  // a game started, each in one go, so the first ten seconds or so of
  // every session stuttered. The bake is a generator now, yielding every
  // row or so: in the background it runs a few milliseconds per task
  // between frames (_queueIdle), and a strip needed on screen before it is
  // done is finished at once (_bake), the same as before.
  function _bake(s) {
    if (!s.job) s.job = _bakeSteps(s);
    while (!s.job.next().done);
    s.job = null;
  }
  function* _bakeSteps(s) {
    const c0 = s.c0 - PAD, r0 = s.r0 - PAD;
    const cw = (s.w + 2 * PAD) * PX, ch = (s.h + 2 * PAD) * PX;
    const cv = document.createElement('canvas');
    cv.width = cw; cv.height = ch;
    const g = cv.getContext('2d');

    // 1. Ground, rock, lakes — per pixel.
    const img = g.createImageData(cw, ch);
    const D = img.data;
    const trees = [];
    for (let y = 0; y < ch; y++) {
      const v = r0 + (y + 0.5) / PX;
      for (let x = 0; x < cw; x++) {
        const u = c0 + (x + 0.5) / PX;
        const d = _outDist(u, v);
        const f = _fields(u, v, d);
        const n = _vnoise(u, v, 16);
        const region = _vnoise(u + 5000, v + 5000, 44);
        let col = lerp3(GRASS_DARK, GRASS_LIGHT, n);
        col = lerp3(col, MEADOW, _smooth(0.55, 0.8, region) * 0.6);
        col = lerp3(col, LUSH, _smooth(0.45, 0.2, region) * 0.6);
        const forest = _smooth(0.5, 0.6, f.forest);
        col = lerp3(col, FOREST_FLOOR, forest);
        // Highlands: bare rock with survey contour lines.
        const rockT = _smooth(0.5, 0.6, f.rock);
        if (rockT > 0) {
          const rockCol = lerp3(ROCK_LO, ROCK_HI, _smooth(0.5, 0.85, f.rock) * 0.8 + n * 0.2);
          col = lerp3(col, rockCol, rockT);
          const lvl = f.rock * 34;
          const fr = lvl - Math.floor(lvl);
          if (fr < 0.09) { const k = 1 - 0.35 * rockT; col = [col[0] * k, col[1] * k, col[2] * k]; }
          else if (fr > 0.5 && fr < 0.56) { const k = 1 + 0.1 * rockT; col = [col[0] * k, col[1] * k, col[2] * k]; }
        }
        // Lakes with a sandy rim.
        if (f.lake > 0.62) {
          const wT = _smooth(0.655, 0.67, f.lake);
          col = lerp3(lerp3(col, SAND, _smooth(0.62, 0.65, f.lake)), WATER, wT);
        }
        const i = (y * cw + x) * 4;
        D[i] = col[0]; D[i + 1] = col[1]; D[i + 2] = col[2]; D[i + 3] = 255;

        // One tree candidate per tile, placed from the tile's top-left
        // pixel. Hashed from the tile itself (not a running PRNG) so two
        // strips baking the same tile near a seam grow the same tree.
        if ((x % PX) === 0 && (y % PX) === 0 && f.lake < 0.61 && rockT < 0.6) {
          const tc = Math.floor(u), tr = Math.floor(v);
          const p = forest > 0.05 ? 0.35 + forest * 0.6 : 0.025;
          if (_hash(tc * 13 + 7, tr * 17 + 3) < p) {
            trees.push([tc + 0.5 + (_hash(tc * 5 + 1, tr * 3 + 9) - 0.5) * 0.8,
                        tr + 0.5 + (_hash(tc * 11 + 4, tr * 7 + 2) - 0.5) * 0.8,
                        0.45 + _hash(tc * 3 + 8, tr * 19 + 5) * 0.45 + forest * 0.2,
                        _hash(tc * 23 + 6, tr * 29 + 1)]);
          }
        }
        if ((x & 2047) === 2047) yield;   // a row of a long strip is several thousand pixels
      }
      yield;
    }
    g.putImageData(img, 0, 0);

    const toX = u => (u - c0) * PX, toY = v => (v - r0) * PX;

    // 2. Roads to the neighbouring towns (under the trees' shadows is fine).
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const t of towns) {
      g.strokeStyle = 'rgb(62,56,46)';
      g.lineWidth = 0.9 * PX;
      g.beginPath();
      g.moveTo(toX(t.ex), toY(t.ey));
      g.quadraticCurveTo(toX((t.ex + t.cx) / 2 + (t.cy - t.ey) * 0.15), toY((t.ey + t.cy) / 2 + (t.ex - t.cx) * 0.15), toX(t.cx), toY(t.cy));
      g.stroke();
    }

    // 3. Trees — shadow, canopy, a lit edge.
    trees.sort((a, b) => a[1] - b[1]);
    // The canvas puts off drawing until something reads it back (the haze
    // pass below), and tens of thousands of trees drawn in one go held that
    // read for over 100 ms: a one-pixel read every batch draws them a batch
    // at a time instead.
    const flush = () => g.getImageData(0, 0, 1, 1);
    let ti = 0;
    for (const [u, v, r, tone] of trees) {
      if (++ti % 400 === 0) { flush(); yield; }
      if (towns.some(t => Math.hypot(t.cx - u, t.cy - v) < t.size + 1.5)) continue;
      const x = toX(u), y = toY(v), rp = r * PX;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.arc(x + rp * 0.35, y + rp * 0.45, rp, 0, 6.2832); g.fill();
      const gr = 38 + tone * 26 | 0;
      g.fillStyle = `rgb(${14 + tone * 12 | 0},${gr},${16 + tone * 10 | 0})`;
      g.beginPath(); g.arc(x, y, rp, 0, 6.2832); g.fill();
      g.fillStyle = `rgba(120,160,70,${0.18 + tone * 0.12})`;
      g.beginPath(); g.arc(x - rp * 0.3, y - rp * 0.35, rp * 0.45, 0, 6.2832); g.fill();
    }

    flush(); yield;

    // 4. Rivers.
    for (const rv of rivers) {
      const path = () => { g.beginPath(); rv.pts.forEach(([u, v], i) => i ? g.lineTo(toX(u), toY(v)) : g.moveTo(toX(u), toY(v))); };
      g.strokeStyle = `rgb(${SAND})`; g.lineWidth = (rv.width + 0.8) * PX; path(); g.stroke();
      g.strokeStyle = `rgb(${WATER})`; g.lineWidth = rv.width * PX; path(); g.stroke();
    }

    // 5. Towns: rooftops with a little shading.
    for (const t of towns) {
      for (const b of t.blocks) {
        const x = toX(b.x), y = toY(b.y), w = b.w * PX, h = b.h * PX;
        g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x + 1, y + 1.5, w, h);
        const roof = b.tone < 0.4 ? [110, 58, 44] : b.tone < 0.75 ? [84, 84, 88] : [120, 104, 80];
        g.fillStyle = `rgb(${roof})`; g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x, y, w, h * 0.4);
      }
    }

    flush(); yield;

    // 6. Haze: desaturate toward the fog colour with distance, then fade
    // alpha out so the far edge melts into the sky fill.
    const out = g.getImageData(0, 0, cw, ch);
    yield;
    const O = out.data;
    for (let y = 0; y < ch; y++) {
      const v = r0 + (y + 0.5) / PX;
      for (let x = 0; x < cw; x++) {
        const u = c0 + (x + 0.5) / PX;
        const d = _outDist(u, v);
        // Starts slightly hazed and dimmed even at the limits, so the
        // country always sits a step behind the playable map.
        const hz = 0.12 + _smooth(0, M * 0.75, d) * 0.5;
        const dim = 0.8;
        const a  = 1 - _smooth(M * 0.4, M * 0.97, d);
        const i = (y * cw + x) * 4;
        O[i]     = (O[i]     + (HAZE[0] - O[i])     * hz) * dim;
        O[i + 1] = (O[i + 1] + (HAZE[1] - O[i + 1]) * hz) * dim;
        O[i + 2] = (O[i + 2] + (HAZE[2] - O[i + 2]) * hz) * dim;
        O[i + 3] = 255 * a;
      }
      if (y % 4 === 3) yield;
    }
    yield;
    g.putImageData(out, 0, 0);
    s.canvas = cv;
  }

  // Bake whatever hasn't been baked yet, one strip per idle slot, so the
  // first pan to an edge doesn't pay for it.
  function _queueIdle() {
    if (idleQueued) return;
    idleQueued = true;
    const gen = idleGen;
    const next = () => {
      if (gen !== idleGen || !strips) return;
      const s = strips.find(x => !x.canvas);
      if (!s) return;
      if (!s.job) s.job = _bakeSteps(s);
      const t0 = performance.now();
      let done = false;
      while (!(done = s.job.next().done) && performance.now() - t0 < SLICE_MS);
      if (done) { s.job = null; setTimeout(next, 250); }
      else setTimeout(next, 0);
    };
    setTimeout(next, 1500);
  }

  // ── Per-frame drawing (world space, before the ground layer) ────────
  function render(ctx, W, H) {
    if (!strips) _init();
    _queueIdle();
    const a = Camera.screenToWorld(0, 0), b = Camera.screenToWorld(W, H);
    const vx0 = a.x / TILE, vy0 = a.y / TILE, vx1 = b.x / TILE, vy1 = b.y / TILE;
    // Nothing of the outside is on screen — the common case.
    if (vx0 >= 0 && vy0 >= 0 && vx1 <= COLS && vy1 <= ROWS) return;

    const dark = DayNight.darkness();
    // Strip edges land on whole backing-store pixels, so neighbouring
    // strips meet exactly instead of leaving an anti-aliased hairline.
    const z = Camera.zoom * (typeof RenderScale === 'undefined' ? 1 : RenderScale.get());
    const snapX = wx => Math.round((wx - Camera.x) * z) / z + Camera.x;
    const snapY = wy => Math.round((wy - Camera.y) * z) / z + Camera.y;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 0.88 - dark * 0.3;   // same as the in-map ground layer
    for (const s of strips) {
      // Visible part of this strip, in tiles.
      const x0 = Math.max(s.c0, vx0), y0 = Math.max(s.r0, vy0);
      const x1 = Math.min(s.c0 + s.w, vx1), y1 = Math.min(s.r0 + s.h, vy1);
      if (x1 <= x0 || y1 <= y0) continue;
      if (!s.canvas) _bake(s);
      // Visible part in whole strip pixels (clamped to the strip's own
      // area — the padding is only there to be sampled, never drawn).
      const px0 = Math.max(0, Math.floor((x0 - s.c0) * PX)), py0 = Math.max(0, Math.floor((y0 - s.r0) * PX));
      const px1 = Math.min(s.w * PX, Math.ceil((x1 - s.c0) * PX)), py1 = Math.min(s.h * PX, Math.ceil((y1 - s.r0) * PX));
      if (px1 <= px0 || py1 <= py0) continue;
      const dx0 = snapX((s.c0 + px0 / PX) * TILE), dy0 = snapY((s.r0 + py0 / PX) * TILE);
      const dx1 = snapX((s.c0 + px1 / PX) * TILE), dy1 = snapY((s.r0 + py1 / PX) * TILE);
      ctx.drawImage(s.canvas, px0 + PAD * PX, py0 + PAD * PX, px1 - px0, py1 - py0, dx0, dy0, dx1 - dx0, dy1 - dy0);
    }
    ctx.restore();
    _drawLimits(ctx, vx0, vy0, vx1, vy1);
  }

  // The CITY LIMITS: a dashed survey line just outside the map edge, with
  // marker posts and the odd label.
  function _drawLimits(ctx, vx0, vy0, vx1, vy1) {
    const z = Camera.zoom;
    const off = 0.4 * TILE;
    const x0 = -off, y0 = -off, x1 = COLS * TILE + off, y1 = ROWS * TILE + off;
    ctx.save();
    ctx.strokeStyle = 'rgba(240,192,64,0.5)';
    ctx.lineWidth = Math.max(2, 2.5 / z);
    ctx.setLineDash([TILE * 0.9, TILE * 0.55]);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.setLineDash([]);

    if (z > 0.28) {
      const STEP = 12;
      const post = (x, y) => {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - 5, y - 3, 12, 12);
        ctx.fillStyle = '#d8b050';         ctx.fillRect(x - 6, y - 6, 12, 12);
        ctx.fillStyle = '#7a5c1c';         ctx.fillRect(x - 6, y + 2, 12, 4);
      };
      const cA = Math.max(0, Math.floor(vx0 / STEP) - 1), cB = Math.min(Math.ceil(COLS / STEP), Math.ceil(vx1 / STEP) + 1);
      const rA = Math.max(0, Math.floor(vy0 / STEP) - 1), rB = Math.min(Math.ceil(ROWS / STEP), Math.ceil(vy1 / STEP) + 1);
      if (vy0 < 1)         for (let i = cA; i <= cB; i++) post(i * STEP * TILE, y0);
      if (vy1 > ROWS - 1)  for (let i = cA; i <= cB; i++) post(i * STEP * TILE, y1);
      if (vx0 < 1)         for (let i = rA; i <= rB; i++) post(x0, i * STEP * TILE);
      if (vx1 > COLS - 1)  for (let i = rA; i <= rB; i++) post(x1, i * STEP * TILE);

      // Labels every so often along each visible edge.
      const LSTEP = 60;
      ctx.font = `600 ${Math.round(TILE * 0.42)}px "JetBrains Mono", monospace`;
      ctx.fillStyle = 'rgba(240,200,100,0.55)';
      const label = 'CITY LIMITS';
      const tw = ctx.measureText(label).width;
      ctx.textBaseline = 'middle';
      const lA = Math.max(0, Math.floor(vx0 / LSTEP)), lB = Math.min(Math.floor(COLS / LSTEP), Math.ceil(vx1 / LSTEP));
      for (let i = lA; i <= lB; i++) {
        const x = (i + 0.5) * LSTEP * TILE - tw / 2;
        if (vy0 < 1)        ctx.fillText(label, x, y0 - TILE * 0.7);
        if (vy1 > ROWS - 1) ctx.fillText(label, x, y1 + TILE * 0.7);
      }
      const mA = Math.max(0, Math.floor(vy0 / LSTEP)), mB = Math.min(Math.floor(ROWS / LSTEP), Math.ceil(vy1 / LSTEP));
      for (let i = mA; i <= mB; i++) {
        const y = (i + 0.5) * LSTEP * TILE;
        for (const [x, rot] of [[x0 - TILE * 0.7, -Math.PI / 2], [x1 + TILE * 0.7, Math.PI / 2]]) {
          if ((rot < 0 && vx0 >= 1) || (rot > 0 && vx1 <= COLS - 1)) continue;
          ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.fillText(label, -tw / 2, 0); ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  // Neighbouring towns' lights — drawn after the night overlay so they
  // glow. World space.
  function renderLights(ctx, t) {
    if (!towns) return;
    const dark = DayNight.darkness();
    if (dark < 0.25) return;
    const a = Camera.screenToWorld(0, 0), b = Camera.screenToWorld(window.innerWidth, window.innerHeight);
    const vx0 = a.x / TILE, vy0 = a.y / TILE, vx1 = b.x / TILE, vy1 = b.y / TILE;
    const k = _smooth(0.25, 0.8, dark);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const town of towns) {
      if (town.cx + town.size < vx0 - 2 || town.cx - town.size > vx1 + 2 ||
          town.cy + town.size < vy0 - 2 || town.cy - town.size > vy1 + 2) continue;
      // A soft glow over the whole town…
      const R = (town.size + 3) * TILE;
      const gr = ctx.createRadialGradient(town.cx * TILE, town.cy * TILE, 0, town.cx * TILE, town.cy * TILE, R);
      gr.addColorStop(0, `rgba(255,170,80,${0.16 * k * town.fade})`);
      gr.addColorStop(1, 'rgba(255,150,60,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(town.cx * TILE - R, town.cy * TILE - R, R * 2, R * 2);
      // …and individual windows, some flickering.
      for (const L of town.lights) {
        const fl = 0.75 + 0.25 * Math.sin(t * (L.big ? 1.3 : 2.1) + L.ph);
        const al = k * town.fade * fl;
        const r = (L.big ? 0.32 : 0.2) * TILE;
        ctx.fillStyle = `rgba(255,205,120,${0.85 * al})`;
        ctx.fillRect(L.x * TILE - r / 2, L.y * TILE - r / 2, r, r);
        ctx.fillStyle = `rgba(255,170,70,${0.18 * al})`;
        ctx.beginPath(); ctx.arc(L.x * TILE, L.y * TILE, r * 2.2, 0, 6.2832); ctx.fill();
      }
    }
    ctx.restore();
  }

  // A new world (or a load) has a different city name, rivers and seed.
  function reset() { strips = null; towns = null; rivers = null; idleQueued = false; idleGen++; }

  return { render, renderLights, reset };
})();
