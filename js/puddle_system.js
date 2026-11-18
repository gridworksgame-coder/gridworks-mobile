/* ═══════════════════════════════════════════════════════════════════
   PUDDLE SYSTEM
   Standing water that collects on open ground and roads while it rains,
   and dries off once it stops; and in Spring Floods, sheets of flood
   water spreading over the low ground and the streets.

   Purely visual. Each puddle is a hollow in the ground anchored to a
   spot in the world: it fills from its lowest point outward the longer
   it rains (faster in a downpour), carries raindrop ripples while the
   rain is falling, and shrinks back to that point afterwards, leaving a
   damp stain that fades last. Snow lays no puddles, and the ones already
   down dry off faster under it (frozen and covered).

   The look, built up like real water seen from above:
   - the ground under and round it darkened (a multiply, so it takes on
     the grass, road or dirt under it): damp ground round it, the water's
     own shade, darker again where it is deep;
   - the water's surface: the overcast sky lying on it, with the clouds'
     brighter and duller patches drifting slowly across (world-anchored,
     so every puddle in a street shows the same sky), fine wind ripples
     moving over it, a band of bright sky caught along the shore that
     faces the light, and the water thinning over the shallows at its
     edge, where the ground shows through;
   - a dark wet lip where water meets ground;
   - raindrops landing: rings that spread and fade, lit on one side.
   The shapes are worked out pixel by pixel (each puddle's hollow, the
   flood's contour) into small images that are only redone when the
   water moves a step, so a frame just lays them down.

   Spring Floods (seasonal_events.js): the flood wakes more and bigger
   puddles, and the low ground floods. Every tile has a fixed lowness,
   from the lie of the land (terrain_system.js: hollows and valley floors
   first; streets a little lower, the drains being overwhelmed). As the
   flood rises the water creeps out of the lowest ground as one smooth
   waterline, joins up into sheets that wash round the plots of the
   buildings in its way, swells the lakes and rivers it reaches, and
   drains back the same way. Flood water is silty and brown,
   moves (its ripples run faster), and carries a line of foam and scum
   along its shore.

   Where puddles lie is fixed to the map, not to the camera: the world is
   cut into cells of a few tiles and each cell hashes out its own puddle
   spots, so the same storm wets the whole map evenly and panning to a
   new district finds it just as soaked as the last. How full each spot
   is follows the ground's soak, which is shared by the whole map.

   Drawn on the ground, under every entity (render_main_loop.js), so
   buildings stand in the water rather than under it.
   ═══════════════════════════════════════════════════════════════════ */

const PuddleSystem = (() => {
  const CELL     = 6;       // tiles per side of a placement cell
  // Puddle spots per cell on average (a flood wakes as many again). Was 1.1,
  // which left a soaked map pocked with them; 0.37 lays 65% fewer (fewer
  // spots crowd each other out, so the cut is a little under the ratio).
  const PER_CELL = 0.37;
  const CACHE    = 6000;    // cells' worth of spots kept before the cache is dropped and rebuilt
  // How wet the ground is, 0..1, is what everything else follows. It climbs
  // toward the rain's own intensity, so a light shower never soaks it the
  // way a downpour does, and it takes a while to get there: puddles are
  // the ground giving up, not the first drops landing.
  const SOAK_UP  = 1 / 90;  // per sim second, toward the rain level (~2 in-game hours to soak)
  const SOAK_DRY = 1 / 200; // per sim second once it stops (~4 in-game hours)
  const START    = 0.12;    // soak below which nothing pools at all
  const FILL     = 1 / 60;  // puddles widening toward their target, per sim second (~1 in-game hour)
  const DRY      = 1 / 150; // and shrinking back, per sim second
  // Flood water: a tile floods once the flood level passes its lowness,
  // its rank among the town's land (see tileLow), so at the flood's height
  // FLOOD_LVL of the open ground and streets is under water.
  const FLOOD_LVL = 0.3;
  // The flood comes up over about three in-game hours and goes down over
  // about five (an in-game hour is 50 sim seconds). It only goes down once
  // the rain eases: a rainstorm still going when the Spring Floods event
  // ends holds the water where it is, a lighter rain lets it drain slowly.
  const FLOOD_UP   = 1 / 150;
  const FLOOD_DOWN = 1 / 250;
  const ROAD_LOW  = 0.05;   // streets rank this much lower: the drains are overwhelmed
  let soak = 0;
  // How full the puddles are, map-wide: `water` eases after the soak (so
  // they fill and dry gradually), `stain` trails it down at half the pace
  // so the damp ground outlasts the water.
  let water = 0, stain = 0, floodK = 0;
  const cells = new Map();  // "cx,cy" → that cell's spots
  let worldKey = null;      // which world they belong to (home, or a job site)
  let lastNow = 0;

  // Puddles belong to the ground they formed on: the home city's do not
  // follow the crew to a job site.
  function currentWorld() {
    if (typeof ContractSystem === 'undefined' || !ContractSystem.isAway || !ContractSystem.isAway()) return 'home';
    const j = ContractSystem.getActive && ContractSystem.getActive();
    return 'site:' + (j && j.contract ? j.contract.id : '?');
  }
  const flooding = () => typeof SeasonalEvents !== 'undefined' && SeasonalEvents.fx && (SeasonalEvents.fx() || {}).id === 'springfloods';

  // How hard it is raining, 0..1. RainSystem draws every rain at the same
  // density, so the weather event is what says shower or downpour. A job
  // site's sky is a visual override ('rain') with no event behind it.
  const STRENGTH = { rainstorm: 1, rainfall: 0.4, rain: 0.6 };
  function rainStrength() {
    if (typeof WeatherEventSystem === 'undefined') return 0.6;
    const ov = WeatherEventSystem.getVisualOverride && WeatherEventSystem.getVisualOverride();
    const kind = ov || (WeatherEventSystem.getActiveEvent() || {}).type;
    return STRENGTH[kind] ?? 0.6;
  }

  // Open ground or road only: never on a building, a lake or a tree.
  function groundAt(col, row) {
    if (!GridManager.inBounds(col, row)) return false;
    const e = GridManager.getEntity(col, row);
    return !e || e.type === T.ROAD;
  }

  // A small seeded generator per cell, so a cell's spots are the same every
  // time it comes back into view (and differ per world).
  function cellRng(cx, cy) {
    let h = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(worldSalt, 83492791)) >>> 0;
    return () => {
      h = (h + 0x6D2B79F5) >>> 0;
      let v = Math.imul(h ^ (h >>> 15), 1 | h);
      v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
      return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
    };
  }
  let worldSalt = 0;

  // The puddle spots in one cell. `low` is how low-lying a spot is: low
  // spots pool in any rain, high ones only once the ground is soaked
  // through; bigger hollows sit lower, so the small ones dry first. `flood`
  // spots only wake in a Spring Flood. Whether there is open ground under
  // a spot is checked as it is drawn, so building over one dries it up.
  function cellSpots(cx, cy) {
    const key = cx + ',' + cy;
    let spots = cells.get(key);
    if (spots) return spots;
    if (cells.size > CACHE) cells.clear();
    const rnd = cellRng(cx, cy), span = CELL * TILE;
    spots = [];
    for (const flood of [false, true]) {
      // Poisson-ish count: 0, 1 or 2 most of the time, averaging PER_CELL.
      let n = 0, acc = rnd();
      while (acc > Math.exp(-PER_CELL) && n < 4) { n++; acc *= rnd(); }
      for (let i = 0; i < n; i++) {
        const x = (cx + rnd()) * span, y = (cy + rnd()) * span;
        // Mostly small, now and then a big one.
        const size = Math.pow(rnd(), 2.6);
        const r = TILE * (0.18 + size * 1.4);
        // Room for it: no crowding another spot in the cell.
        if (spots.some(p => Math.abs(p.x - x) < (p.r + r) * 0.9 && Math.abs(p.y - y) < (p.r + r) * 0.9)) { rnd(); rnd(); rnd(); rnd(); continue; }
        const low = rnd() * (1 - 0.35 * size);
        spots.push({ x, y, r0: r, r, flood, low, seed: rnd() * 1000, rot: rnd() * Math.PI, ar: 0.55 + rnd() * 0.4, wet: 0, peak: 0, rim: null });
      }
    }
    cells.set(key, spots);
    return spots;
  }

  // Open ground under the spot, and for a big one under most of it, or it
  // climbs walls.
  function spotOpen(p, r) {
    const col = Math.floor(p.x / TILE), row = Math.floor(p.y / TILE);
    if (!groundAt(col, row)) return false;
    if (r > TILE * 0.7) {
      const k = Math.ceil(r / TILE);
      for (const [dc, dr] of [[-k, 0], [k, 0], [0, -1], [0, 1]]) if (!groundAt(col + dc, row + dr)) return false;
    }
    return true;
  }

  // How full a spot of lowness `low` is at map-wide fill level `w`.
  const fillAt = (w, low) => Math.max(0, Math.min(1, (w - low * 0.6) / 0.5));

  // ── Flood ground ──────────────────────────────────────────────────
  // Where flood water lies follows the land (terrain_system.js): a tile's
  // lowness is how far it sits below the ground round it, so water gathers
  // in the hollows and the valley floors first, and a smooth field means it
  // gathers as whole basins and runs of street, not scattered tiles. That
  // is ranked against the land round City Hall (a sample, sorted once), so
  // the flood level reads as a share of the town:
  // FLOOD_LVL 0.3 is near a third of its open ground under water at the height
  // of the flood, whether the town sits on a plain or in a valley. Without
  // terrain (a job site) the same is drawn from smooth noise. Cached per
  // tile.
  function hash01(i, j, k) {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k ^ worldSalt, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, k) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash01(x0, y0, k), b = hash01(x0 + 1, y0, k), c = hash01(x0, y0 + 1, k), d = hash01(x0 + 1, y0 + 1, k);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  const terrainOn = () => typeof TerrainSystem !== 'undefined' && TerrainSystem.active && TerrainSystem.active();
  const RING6  = [[6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, 4], [4, -4], [-4, -4]];
  const RING14 = RING6.map(([c, r]) => [c * 14 / 6, r * 14 / 6].map(Math.round));
  // The parts of a tile's lowness: how far it sits below the ground six
  // tiles round, below the ground fourteen round, and a smooth noise (for
  // the lie of the land too fine for the height field, and for flat or
  // terrain-less ground).
  const _parts = [0, 0, 0];
  function parts(c, r) {
    const n = 0.85 * vnoise(c / 7, r / 7, 11) + 0.15 * vnoise(c / 3, r / 3, 23);
    if (!terrainOn()) { _parts[0] = _parts[1] = 0; _parts[2] = n; return _parts; }
    const el = TerrainSystem.elevAt, e = el(c, r);
    let m6 = 0, m14 = 0;
    for (const [dc, dr] of RING6) m6 += el(c + dc, r + dr);
    for (const [dc, dr] of RING14) m14 += el(c + dc, r + dr);
    _parts[0] = e - m6 / 8; _parts[1] = e - m14 / 8; _parts[2] = n;
    return _parts;
  }
  // Each part is weighed by how much it varies over the town, so a hilly
  // town floods by its hollows and a flat one by the noise, either way at
  // the same share of its ground.
  let lowW = [0, 0, 1];
  const rawLow = (c, r) => { const p = parts(c, r); return lowW[0] * p[0] + lowW[1] * p[1] + lowW[2] * p[2]; };
  let lowMap = null, lowRank = null, lowKey = '';
  function rankBase() {
    // The town's land: round City Hall, or the middle of the map.
    let cc = COLS / 2, cr = ROWS / 2;
    const gov = typeof EntityRegistry !== 'undefined' && EntityRegistry.getByType ? [...(EntityRegistry.getByType(T.GOVBUILDING) || [])][0] : null;
    if (gov) { cc = gov.col + 3; cr = gov.row + 3; }
    const rnd = cellRng(9137, 271), N = 3000, pts = [];
    const sum = [0, 0, 0], sq = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      const c = Math.max(0, Math.min(COLS - 1, Math.floor(cc + (rnd() - 0.5) * 160)));
      const r = Math.max(0, Math.min(ROWS - 1, Math.floor(cr + (rnd() - 0.5) * 160)));
      const p = parts(c, r);
      for (let j = 0; j < 3; j++) { sum[j] += p[j]; sq[j] += p[j] * p[j]; }
      pts.push(c, r);
    }
    const sd = sum.map((v, j) => Math.sqrt(Math.max(0, sq[j] / N - (v / N) ** 2)));
    lowW = [sd[0] > 1e-5 ? 1 / sd[0] : 0, sd[1] > 1e-5 ? 0.6 / sd[1] : 0, sd[2] > 1e-5 ? 0.5 / sd[2] : 0];
    const s = new Float32Array(N);
    for (let i = 0; i < N; i++) s[i] = rawLow(pts[2 * i], pts[2 * i + 1]);
    return s.sort();
  }
  function tileLow(col, row) {
    const key = worldKey + ':' + (terrainOn() ? TerrainSystem.version() : 'n');
    if (key !== lowKey || !lowMap) { lowKey = key; lowMap = new Float32Array(COLS * ROWS).fill(-1); lowRank = rankBase(); }
    const i = row * COLS + col;
    let v = lowMap[i];
    if (v >= 0) return v;
    // Its rank among the town's land, 0 (lowest) .. 1, by binary search.
    const raw = rawLow(col, row), s = lowRank;
    let lo = 0, hi = s.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid] < raw) lo = mid + 1; else hi = mid; }
    v = lo / s.length;
    lowMap[i] = v;
    return v;
  }

  // Government zones are paved plazas drawn into the ground; flood water
  // there would lie over their fountains and flower beds.
  function govTile(c, r) {
    const g = typeof ZoneSystem !== 'undefined' && ZoneSystem.getZoneRects ? ZoneSystem.getZoneRects('government') : null;
    if (!g || !g.length) return false;
    for (const q of g) if (c >= q.minC && c <= q.maxC && r >= q.minR && r <= q.maxR) return true;
    return false;
  }

  const LIGHT = -2.25;      // where the light comes from: up and to the left, the same for every puddle
  const LX = Math.cos(LIGHT), LY = Math.sin(LIGHT);

  // ── Puddles, baked ────────────────────────────────────────────────
  // A puddle is a hollow: how deep each point of it lies, from its middle
  // out to its rim (a wobbling, tilted oval, fixed per puddle), roughened
  // by fine noise in the ground. Water stands wherever the hollow is deeper
  // than the puddle is empty, so it fills from the lowest point out and,
  // drying, shrinks back to it, its edge ragged with the ground's own
  // bumps; the damp stain is the same hollow at the fullest the water got.
  // That is worked out pixel by pixel into two small images per puddle,
  // redone only when its water has risen or fallen a step, the zoom has
  // moved a long way or the light has changed:
  //   mul  — the ground under it and round it darkened (multiplied on);
  //   body — the water: the sky's colour, a band of bright sky along the
  //          shore facing the light, thinning over the shallows, and a
  //          dark wet lip.
  // The most recently drawn are kept, up to SPR_PX baked pixels in all.
  const RIM_T = 48;
  const SPR = new Map();    // spot → its baked images, least recently drawn first
  const SPR_PX = 3e6;       // ~24 MB of canvas
  let sprPx = 0, sprFrame = 0;
  let _img = null, _mimg = null;   // scratch pixels for a bake, reused while the size holds
  const STEP = 0.025;       // how far its water moves before a rebake
  function rimTable(p) {
    const t = new Float32Array(RIM_T + 1), s = p.seed;
    for (let i = 0; i <= RIM_T; i++) {
      const a = i / RIM_T * Math.PI * 2 - Math.PI;
      t[i] = 1 + 0.18 * Math.sin(a * 2 + s) + 0.12 * Math.sin(a * 3 + s * 1.7) + 0.08 * Math.sin(a * 5 + s * 2.3);
    }
    p.rim = t; p.cos = Math.cos(p.rot); p.sin = Math.sin(p.rot);
  }
  let _D = null;
  function sprite(p, zd, dark, pl) {
    const q = Math.min(zd * 0.5, 200 / (p.r * 1.75));    // baked px per world unit (two screen px each; capped)
    let s = SPR.get(p);
    if (s) { SPR.delete(p); SPR.set(p, s); s.frame = sprFrame; }    // most recently drawn
    if (s && Math.abs(s.L - p.wet) < STEP && Math.abs(s.K - p.peak) < STEP && Math.abs(s.R - p.r) < 0.5 &&
        s.q / q < 1.5 && q / s.q < 1.5 && Math.abs(s.dark - dark) < 0.05) return s;
    if (!s) {
      s = { body: document.createElement('canvas'), mul: document.createElement('canvas'), N: 0, frame: sprFrame };
      s.bg = s.body.getContext('2d');
      s.mg = s.mul.getContext('2d', { willReadFrequently: true });
      SPR.set(p, s);
    }
    if (!p.rim) rimTable(p);
    const R = p.r, ext = R * 1.75, N = Math.max(6, Math.ceil(2 * ext * q));
    if (s.N !== N) {
      sprPx += N * N - s.N * s.N;
      s.body.width = s.body.height = N; s.mul.width = s.mul.height = N;
      // Over budget: let go of the longest undrawn (never one drawn this frame).
      for (const [k, o] of SPR) {
        if (sprPx <= SPR_PX || o.frame === sprFrame) break;
        sprPx -= o.N * o.N; o.body.width = o.mul.width = 0; SPR.delete(k);
      }
    }
    Object.assign(s, { L: p.wet, K: p.peak, R, q, dark, ext, N });
    if (!_img || _img.width !== N) { _img = new ImageData(N, N); _mimg = new ImageData(N, N); }
    // How deep every pixel lies.
    if (!_D || _D.length < N * N) _D = new Float32Array(N * N);
    const D = _D, rim = p.rim, cos = p.cos, sin = p.sin, ar = p.ar;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const wx = (x + 0.5) / q - ext, wy = (y + 0.5) / q - ext;
      const lx = wx * cos + wy * sin, ly = (-wx * sin + wy * cos) / ar;
      const u = (Math.atan2(ly, lx) + Math.PI) / (Math.PI * 2) * RIM_T, i0 = u | 0, f = u - i0;
      const rr = rim[i0] + (rim[Math.min(RIM_T, i0 + 1)] - rim[i0]) * f;
      const gx = p.x + wx, gy = p.y + wy;
      D[y * N + x] = 1 - Math.sqrt(lx * lx + ly * ly) / (R * rr)
        + (vnoise(gx / (TILE * 0.3), gy / (TILE * 0.3), 51) - 0.5) * 0.22
        + (vnoise(gx / (TILE * 0.7), gy / (TILE * 0.7), 53) - 0.5) * 0.16;
    }
    // Water down to 1 - L, the stain down to a little past 1 - K.
    const tw = 1 - p.wet, ts = 1 - p.peak - 0.1, n = pl.n;
    const bd = _img.data, md = _mimg.data;
    bd.fill(0); new Uint32Array(md.buffer).fill(0xffffffff);
    const SH = R * q * 0.35, BAND = Math.max(1, R * q * 0.12), wA = pl.waterA;
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = y * N + x, v = D[i];
      if (v < ts && v < tw - 0.15) continue;
      const gx = (D[i + 1] - D[i - 1]) * 0.5, gy = (D[i + N] - D[i - N]) * 0.5;
      const gl = Math.sqrt(gx * gx + gy * gy) + 1e-7;
      const d = Math.max(-40, Math.min(40, (v - tw) / gl)); // px from the waterline, positive in the water
      const k = i * 4;
      // The ground: damp in the stain, darker under the water, darker
      // again where it is deep.
      let a = 0, c = n.damp;
      if (d > -0.5 && p.wet > 0.02) {
        a = 0.85 * Math.min(1, d + 0.5);
        const dp = Math.min(1, Math.max(0, (v - tw) / 0.35));
        md[k]     = 255 - (255 - (n.water[0] + (n.deep[0] - n.water[0]) * dp)) * a;
        md[k + 1] = 255 - (255 - (n.water[1] + (n.deep[1] - n.water[1]) * dp)) * a;
        md[k + 2] = 255 - (255 - (n.water[2] + (n.deep[2] - n.water[2]) * dp)) * a;
      } else if (v > ts) {
        a = 0.55 * Math.min(1, (v - ts) / 0.08);
        md[k] = 255 - (255 - c[0]) * a; md[k + 1] = 255 - (255 - c[1]) * a; md[k + 2] = 255 - (255 - c[2]) * a;
      }
      if (p.wet <= 0.02) continue;
      // The water, and the lip just outside it.
      if (d > -0.5) {
        const edge = Math.min(1, d + 0.5);
        const al = edge * (0.4 + 0.6 * Math.min(1, Math.max(0, d) / SH));
        // Brighter toward a shore that faces the light (the slope points
        // into the water, so the shore faces against it).
        const face = Math.max(0, -(gx * LX + gy * LY) / gl);
        const b = face * Math.max(0, 1 - Math.max(0, d) / BAND) * 0.85;
        bd[k]     = n.sky[0] + (n.edge[0] - n.sky[0]) * b;
        bd[k + 1] = n.sky[1] + (n.edge[1] - n.sky[1]) * b;
        bd[k + 2] = n.sky[2] + (n.edge[2] - n.sky[2]) * b;
        bd[k + 3] = al * wA * 255;
      } else if (d > -1.6) {
        bd[k] = n.lip[0]; bd[k + 1] = n.lip[1]; bd[k + 2] = n.lip[2];
        bd[k + 3] = 0.4 * (1 - Math.abs(d + 1.05) / 0.6) * 255;
      }
    }
    s.bg.putImageData(_img, 0, 0);
    s.mg.putImageData(_mimg, 0, 0);
    return s;
  }

  // ── Surface textures (built once) ─────────────────────────────────
  // Tileable value-noise fields painted into small canvases and laid on
  // the water as patterns: the clouds' reflection and the wind's ripples.
  // White with the pattern in the alpha, so one texture
  // serves day and night (the colour under it changes, not the texture).
  function noiseTex(W, H, gx, gy, oct, seed, paint) {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    let s = seed >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    const layers = [];
    for (let o = 0; o < oct; o++) {
      const nx = gx << o, ny = gy << o, v = new Float32Array(nx * ny);
      for (let i = 0; i < v.length; i++) v[i] = rnd();
      layers.push({ nx, ny, v });
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let n = 0, amp = 1, tot = 0;
      for (const L of layers) {
        const u = x / W * L.nx, w = y / H * L.ny;
        const i0 = Math.floor(u), j0 = Math.floor(w);
        let fu = u - i0, fw = w - j0;
        fu = fu * fu * (3 - 2 * fu); fw = fw * fw * (3 - 2 * fw);
        const i1 = (i0 + 1) % L.nx, j1 = (j0 + 1) % L.ny;
        const a = L.v[j0 * L.nx + i0], b = L.v[j0 * L.nx + i1], c = L.v[j1 * L.nx + i0], e = L.v[j1 * L.nx + i1];
        n += (a + (b - a) * fu + (c - a) * fw + (a - b - c + e) * fu * fw) * amp;
        tot += amp; amp *= 0.5;
      }
      const k = (y * W + x) * 4;
      paint(d, k, n / tot);
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
  let tex = null;
  function textures(g) {
    if (tex) return tex;
    const clamp = v => v < 0 ? 0 : v > 1 ? 1 : v;
    // Clouds: soft brighter patches with dull gaps between.
    const clouds = noiseTex(256, 256, 4, 4, 4, 1234, (d, k, n) => {
      d[k] = d[k + 1] = d[k + 2] = 255;
      d[k + 3] = Math.round(255 * Math.pow(clamp((n - 0.38) * 2.1), 1.6));
    });
    // Wind ripples: thin bright crests, long across the wind, short along it.
    const ripples = noiseTex(256, 256, 3, 22, 3, 777, (d, k, n) => {
      const r = 1 - Math.abs(n - 0.5) * 2;
      d[k] = d[k + 1] = d[k + 2] = 255;
      d[k + 3] = Math.round(255 * Math.pow(r, 7));
    });
    tex = {
      clouds: g.createPattern(clouds, 'repeat'),
      ripples: g.createPattern(ripples, 'repeat'),
    };
    return tex;
  }

  // Colours for the frame, by how dark it is (DayNight.darkness). The
  // multiply colours darken the ground under the water, so grass puddles
  // read green-brown, road puddles grey and dirt puddles muddy. The surface
  // follows the sky: an overcast white-grey by day, a dull deep blue by
  // night (the night overlay drawn later still darkens all of it with the
  // rest of the ground).
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const num = s => s.match(/\d+/g).map(Number);
  const rgb = (a, b, t) => `rgb(${lerp(a[0], b[0], t)},${lerp(a[1], b[1], t)},${lerp(a[2], b[2], t)})`;
  let palD = -1, pal = null;
  function palette(d) {
    if (pal && Math.abs(d - palD) < 0.01) return pal;
    palD = d;
    pal = {
      damp:  rgb([170, 158, 140], [150, 142, 132], d),   // wet ground round it: soil darkened, a little warm
      // At night the overlay already darkens it all, so the water darkens
      // the ground less; otherwise a puddle after dark reads as a hole.
      water: rgb([172, 180, 186], [184, 190, 202], d),   // the ground seen through the water
      deep:  rgb([190, 196, 202], [212, 216, 224], d),   // and darker again where it is deepest
      silt:  rgb([178, 164, 140], [196, 188, 172], d),   // flood water: the ground under it muddied
      sky:   rgb([150, 166, 184], [40, 54, 80], d),      // the overcast sky lying on its surface
      edge:  rgb([236, 242, 248], [118, 140, 178], d),   // the brighter sky caught along the light side
      lip:   rgb([34, 30, 24], [20, 20, 24], d),         // dark wet line where water meets ground
      mud:   rgb([104, 88, 58], [52, 48, 40], d),        // silt suspended in flood water
      cloudA: 0.7 - 0.45 * d,
      rippleA: 0.32 - 0.12 * d,
      // How much of the surface is seen over the ground, at its deepest:
      // a puddle is mostly the sky on it, flood water mostly mud.
      waterA: 0.8 - 0.2 * d,
      floodA: 0.88 - 0.18 * d,
      foam:  rgb([214, 206, 184], [92, 90, 84], d),       // foam and scum riding a flood's waterline
      ring:  rgb([226, 236, 246], [150, 176, 210], d),
      ringDark: `rgba(20,24,30,${(0.35 - 0.15 * d).toFixed(3)})`,
      // A slight blue over all of it, puddle and flood alike, so standing
      // water reads as water and not just wet ground.
      blue:  rgb([92, 150, 214], [52, 84, 150], d),
      blueA: 0.16 - 0.06 * d,
    };
    // The same colours as numbers, for the flood's baked pixels.
    pal.n = {};
    for (const k of ['damp', 'water', 'silt', 'deep', 'sky', 'edge', 'lip', 'foam']) pal.n[k] = num(pal[k]);
    return pal;
  }

  function render(ctx) {
    if (typeof GridManager === 'undefined') return;
    const wk = currentWorld();
    if (wk !== worldKey) {
      worldKey = wk; cells.clear(); SPR.clear(); sprPx = 0; FC.ok = false; soak = water = stain = floodK = 0;
      worldSalt = 0; for (let i = 0; i < wk.length; i++) worldSalt = (Math.imul(worldSalt, 31) + wk.charCodeAt(i)) | 0;
    }

    // Advance on the sim clock: paused is paused, fast-forward dries faster.
    const now = performance.now() / 1000;
    const real = lastNow ? Math.min(0.1, now - lastNow) : 0;
    lastNow = now;
    const scale = (typeof DevMode !== 'undefined' && DevMode.timeScale != null) ? DevMode.timeScale : 1;
    const dt = real * scale;
    if (dt > 0) simT += dt;

    const raining = typeof RainSystem !== 'undefined' && RainSystem.isActive() && !(RainSystem.isSnow && RainSystem.isSnow());
    const snowing = typeof RainSystem !== 'undefined' && RainSystem.isSnow && RainSystem.isSnow();
    const level = raining ? rainStrength() * Math.min(1, (RainSystem.level ? RainSystem.level() : 0.9) / 0.9) : 0;
    const flood = flooding();

    const m = ctx.getTransform();
    const z = Camera.zoom, zd = Math.hypot(m.a, m.b);          // camera zoom; device px per world unit
    const W = ctx.canvas.width, H = ctx.canvas.height;
    const vx0 = Camera.x, vy0 = Camera.y, vx1 = vx0 + W / zd, vy1 = vy0 + H / zd;

    // The ground soaks toward the rain level (a flood soaks it through) and dries when it stops.
    const goal = raining ? Math.min(1, level * (flood ? 1.6 : 1)) : 0;
    if (dt > 0) soak = soak < goal ? Math.min(goal, soak + SOAK_UP * dt * (0.5 + level))
                                   : Math.max(goal, soak - SOAK_DRY * dt * (snowing ? 2 : 1));
    const wetness = Math.max(0, (soak - START) / (1 - START));   // 0 until the ground starts to give

    // The map-wide water level eases after the soak, never jumps; the damp
    // stain follows it up at once and back down at half the pace, so it
    // outlasts the water and then fades on its own. The flood keeps its own
    // slower pace (FLOOD_UP, FLOOD_DOWN).
    if (dt > 0) {
      const dry = DRY * (snowing ? 3 : 1) * dt;
      water = water < wetness ? Math.min(wetness, water + FILL * dt) : Math.max(wetness, water - dry);
      stain = Math.max(water, stain - dry * 0.5);
      if (flood) floodK = Math.min(1, floodK + FLOOD_UP * dt);
      else if (!(raining && level >= 0.7)) floodK = Math.max(0, floodK - FLOOD_DOWN * dt * (raining ? 0.4 : 1) * (snowing ? 2 : 1));
    }
    if (stain < 0.005 && floodK <= 0) { FC.ok = false; return; }

    const t = now;
    const dark = typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;
    const pl = palette(dark);

    // What is in view this frame: how full each puddle is (`wet`) and how
    // full it has been (`peak`, its damp stain, lingering). Each spot runs a
    // little ahead of or behind the map-wide level, so a street's puddles
    // don't all fill in step. In a flood every spot fills.
    const vis = _vis; vis.length = 0;
    sprFrame++;
    const span = CELL * TILE, mg = TILE * 3;
    {
      const cx0 = Math.floor((vx0 - mg) / span), cx1 = Math.floor((vx1 + mg) / span);
      const cy0 = Math.floor((vy0 - mg) / span), cy1 = Math.floor((vy1 + mg) / span);
      const grow = 1 + 0.6 * floodK;
      const wl = Math.max(water, floodK * 0.8), sl = Math.max(stain, floodK * 0.8);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
        for (const p of cellSpots(cx, cy)) {
          if (p.flood && floodK <= 0) continue;
          const k = p.flood ? floodK : 1, lag = ((p.seed % 1) - 0.5) * 0.12;
          p.wet  = fillAt(wl + lag, p.low) * k;
          p.peak = fillAt(sl + lag, p.low) * k;
          if (p.wet < 0.02 && p.peak < 0.02) continue;
          p.r = p.r0 * grow;
          if (p.r * z < 3) continue;                    // a speck at this zoom
          const st = p.r * 1.75;
          if (p.x + st < vx0 || p.x - st > vx1 || p.y + st < vy0 || p.y - st > vy1) continue;
          if (!spotOpen(p, p.r)) continue;
          p.size = p.r * p.wet * 0.9;                   // roughly how far out its water reaches
          vis.push(p);
        }
      }
    }

    // The flood's sheets (see buildFlood): rebuilt only when the water has
    // risen or fallen a step, the light has changed, the view has left the
    // area they were drawn for, or the zoom has moved a long way.
    let fc = null;
    if (floodK > 0.01 && TILE * zd >= 3) {
      const lvl = Math.round(floodK * FLOOD_LVL / LVL_STEP) * LVL_STEP;
      const stale = !FC.ok || FC.lvl !== lvl || Math.abs(FC.dark - dark) > 0.05 ||
        zd / FC.zd > 1.45 || zd / FC.zd < 0.69 ||
        vx0 < FC.x0 || vy0 < FC.y0 || vx1 > FC.x1 || vy1 > FC.y1;
      if (stale) buildFlood(lvl, dark, zd, vx0, vy0, vx1, vy1, now, pl);
      if (FC.ok && FC.n) fc = FC;
    } else FC.ok = false;
    if (!vis.length && !fc) return;

    const smooth = w => w * w * (3 - 2 * w);
    // The flood fades in as it starts to spread and out as the last of it
    // drains, rather than appearing or vanishing at full strength.
    const fade = smooth(Math.min(1, floodK * 3));
    // Where the flood's cached canvases land on screen (device pixels).
    // Only the wet part of them, inside the area they cover.
    let lay = null;
    if (fc) {
      const ax0 = Math.max(fc.x0, fc.wx0), ay0 = Math.max(fc.y0, fc.wy0), ax1 = Math.min(fc.x1, fc.wx1), ay1 = Math.min(fc.y1, fc.wy1);
      const ux0 = (ax0 - fc.x0) / (fc.x1 - fc.x0), uy0 = (ay0 - fc.y0) / (fc.y1 - fc.y0);
      const ux1 = (ax1 - fc.x0) / (fc.x1 - fc.x0), uy1 = (ay1 - fc.y0) / (fc.y1 - fc.y0);
      const dx = m.a * ax0 + m.e, dy = m.d * ay0 + m.f, dw = (ax1 - ax0) * m.a, dh = (ay1 - ay0) * m.d;
      lay = (g, cv, cw, ch) => g.drawImage(cv, ux0 * cw, uy0 * ch, (ux1 - ux0) * cw, (uy1 - uy0) * ch, dx, dy, dw, dh);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = true;   // the flood's baked layers are drawn up to size

    // Pass 1, multiply: the ground darkened under and around the water.
    //
    // The puddles' part is built in a layer of its own and laid on the
    // ground with a single multiply. Every multiply fill straight onto the
    // main canvas made the browser copy the pixels under it first (its GPU
    // path has no multiply blend), a few dozen copies a frame in a
    // downpour: a fifth of the frame on integrated graphics. The layer
    // starts white, the fills multiply into it exactly as they did onto the
    // ground, and since multiplying is order-free, ground x layer is the
    // same picture. The flood's part is already baked the same way.
    if (vis.length) {
      const L = layered ? _layer(m, vis, W, H) : null;
      const g = L ? L.g : ctx;
      const lk = L ? L.k : 1, lx0 = L ? L.x0 : 0, ly0 = L ? L.y0 : 0;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'multiply';
      for (const p of vis) {
        const sp = sprite(p, zd, dark, pl), e = sp.ext;
        const cx = m.a * p.x + m.e, cy = m.d * p.y + m.f;
        g.drawImage(sp.mul, 0, 0, sp.N, sp.N, lk * (cx - e * zd - lx0), lk * (cy - e * zd - ly0), lk * 2 * e * zd, lk * 2 * e * zd);
      }
      if (L) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'multiply';
        ctx.drawImage(L.cv, 0, 0, L.w, L.h, L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0);
      }
    }
    if (fc) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = fade;
      lay(ctx, fc.mul, fc.mw, fc.mh);
    }

    // Pass 2, the surface: all the water in view painted in one layer of
    // its own (so puddles and flood that touch merge, with one shore), then
    // laid on the ground. The water is most of the way opaque in the middle
    // and thins toward its edge, where it is shallow and the darkened ground
    // shows through.
    const wd = _water(W, H);
    const wg = wd.g, tx = textures(wg);
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const box = (a0, b0, a1, b1) => { if (a0 < bx0) bx0 = a0; if (b0 < by0) by0 = b0; if (a1 > bx1) bx1 = a1; if (b1 > by1) by1 = b1; };
    if (fc) box(m.a * fc.wx0 + m.e, m.d * fc.wy0 + m.f, m.a * fc.wx1 + m.e, m.d * fc.wy1 + m.f);
    let nw = 0;
    for (const p of vis) {
      if (p.wet < 0.02) continue;
      const cx = m.a * p.x + m.e, cy = m.d * p.y + m.f, R = p.r * 1.75 * zd;
      box(cx - R, cy - R, cx + R, cy + R); nw++;
    }
    bx0 = Math.max(0, Math.floor(bx0)); by0 = Math.max(0, Math.floor(by0));
    bx1 = Math.min(W, Math.ceil(bx1));  by1 = Math.min(H, Math.ceil(by1));
    if ((nw || fc) && bx1 > bx0 && by1 > by0) {
      const bw = bx1 - bx0, bh = by1 - by0;
      wg.setTransform(1, 0, 0, 1, 0, 0);
      wg.globalAlpha = 1;
      wg.globalCompositeOperation = 'source-over';
      wg.clearRect(bx0, by0, bw, bh);
      // The flood's sheets, as baked (their shallows already thinned).
      if (fc) { wg.globalAlpha = pl.floodA * fade; lay(wg, fc.body, fc.bw, fc.bh); }
      // The puddles, as baked.
      if (nw) {
        wg.globalAlpha = 1;
        for (const p of vis) {
          if (p.wet < 0.02) continue;
          const sp = SPR.get(p);
          if (!sp) continue;
          const e = sp.ext;
          wg.drawImage(sp.body, 0, 0, sp.N, sp.N, m.a * p.x + m.e - e * zd, m.d * p.y + m.f - e * zd, 2 * e * zd, 2 * e * zd);
        }
      }
      // Over all of it (atop, so only where there is water): flood water
      // carries its silt, brown through and through; then the sky on its
      // surface, the clouds' reflection drifting slowly over it, and the
      // wind's ripples running across, both fixed to the world (they move
      // with the map as it pans, like the sky's image in real water).
      wg.globalCompositeOperation = 'source-atop';
      if (floodK > 0.01) {
        wg.globalAlpha = 0.75 * floodK; wg.fillStyle = pl.mud; wg.fillRect(bx0, by0, bw, bh);
      }
      const drift = simT * 0.6 % 4096;
      setPat(tx.clouds, m, TILE * 12 / 256, drift * TILE * 0.05, drift * TILE * 0.02);
      wg.globalAlpha = pl.cloudA * (1 - 0.5 * floodK); wg.fillStyle = tx.clouds; wg.fillRect(bx0, by0, bw, bh);
      // Ripples only resolve when close enough to see them; flood water
      // runs, so its ripples move faster.
      if (zd * TILE > 14) {
        const run = t * (0.5 + floodK * 1.6 + level * 0.4) % 1000;
        setPat(tx.ripples, m, TILE * 3 / 256, run * TILE * 0.35, run * TILE * 0.12);
        wg.globalAlpha = pl.rippleA * Math.min(1, (zd * TILE - 14) / 16);
        wg.fillStyle = tx.ripples; wg.fillRect(bx0, by0, bw, bh);
      }
      // The blue (see palette), over the water only.
      wg.globalAlpha = pl.blueA; wg.fillStyle = pl.blue; wg.fillRect(bx0, by0, bw, bh);
      // The flood's waterline, as baked: its lip and the foam riding it.
      wg.globalCompositeOperation = 'source-over';
      if (fc) {
        wg.globalAlpha = fade;
        lay(wg, fc.shore, fc.bw, fc.bh);
      }
      wg.globalCompositeOperation = 'source-over';
      // Onto the ground.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(wd.cv, bx0, by0, bw, bh, bx0, by0, bw, bh);
    }
    ctx.globalCompositeOperation = 'source-over';

    // Raindrops landing in it: rings that spread and fade, lit on the side
    // facing the light and shadowed on the other, a fresh one somewhere new
    // each cycle and a fainter second ring inside the first. Drawn in world
    // space (circles, not squashed with the puddle), kept to the middle of
    // the water so none hangs over the edge.
    if (raining && z * TILE >= 10) {
      ctx.setTransform(m);
      ctx.lineWidth = 1.0 / z;
      const ring = (x, y, rr, fade) => {
        ctx.strokeStyle = pl.ring; ctx.globalAlpha = 0.75 * fade;
        ctx.beginPath(); ctx.arc(x, y, rr, LIGHT - 1.9, LIGHT + 1.9); ctx.stroke();
        ctx.strokeStyle = pl.ringDark; ctx.globalAlpha = fade;
        ctx.beginPath(); ctx.arc(x, y, rr, LIGHT + 1.9, LIGHT + Math.PI * 2 - 1.9); ctx.stroke();
      };
      const drops = (x0, y0, size, cos, sin, ar, seed, count, a) => {
        for (let k = 0; k < count; k++) {
          // Each ring keeps its own pace and its own place in the cycle; the
          // offsets step round by the golden ratio so the rings in one
          // puddle are always spread out, never landing in step.
          const rate = 0.9 + ((seed * (k + 3)) % 1) * 0.6;
          const u = t * rate + ((seed * 0.618 + k * 0.618034) % 1) + seed * (k + 1);
          const ph = u % 1, cycle = Math.floor(u);
          const lx = Math.sin(cycle * 12.9 + seed + k * 3.1) * 0.4, ly = Math.cos(cycle * 7.3 + seed * 2 + k * 1.7) * 0.4 * ar;
          const x = x0 + (lx * cos - ly * sin) * size, y = y0 + (lx * sin + ly * cos) * size;
          const rr = Math.min(TILE * 0.16, size * 0.32) * ph + 0.4;
          const fade = (1 - ph) * (1 - ph) * a;
          ring(x, y, rr, fade);
          if (ph > 0.3) ring(x, y, rr * 0.55, fade * 0.5);
        }
      };
      for (const p of vis) {
        if (p.wet < 0.02 || p.size < TILE * 0.22 || p.size * z < 8) continue;
        // More drops in a bigger puddle and in harder rain.
        const n = Math.max(1, Math.min(5, Math.round((p.size / (TILE * 0.32)) * (0.5 + level))));
        drops(p.x, p.y, p.size, p.cos, p.sin, p.ar, p.seed, n, smooth(p.wet));
      }
      // On the flood, a drop on some of its tiles in view, more in harder
      // rain; none when zoomed out too far to make them out.
      if (fc && z * TILE >= 20) {
        const share = 0.15 + 0.3 * level, a = fade;
        for (const it of fc.tiles) {
          if (it.h > share || it.x < vx0 || it.x > vx1 || it.y < vy0 || it.y > vy1) continue;
          drops(it.x, it.y, it.size * 0.8, 1, 0, 1, it.h * 997, 1, a);
        }
      }
    }
    ctx.restore();
  }
  const _vis = [];        // reused list of puddles in view this frame
  let simT = 0;           // sim seconds, for the slow drift of the sky's reflection
  const _M = typeof DOMMatrix !== 'undefined' ? new DOMMatrix() : null;

  // ── The flood's sheets, baked ─────────────────────────────────────
  // The water's edge is a contour: how far the flood stands over each
  // tile's lowness (see tileLow), sampled at the tile centres and carried
  // between them on a smooth (Catmull-Rom) surface, so the shore is one
  // continuous waterline that follows the lie of the land, bending rather
  // than kinking at each tile. It creeps out of the hollows as the water
  // rises and back as it drains, curving round the plots of buildings and
  // swelling the lakes and rivers it meets.
  //
  // It only changes when the water does, so it is worked out once, pixel by
  // pixel at a quarter of the screen's resolution, for the view and a
  // margin round it, into three small canvases drawn up to size each frame
  // (their smoothing gives the waterline its soft, anti-aliased edge):
  //   mul   — the ground under the water muddied, darker again where it is
  //           deep, and a damp margin round it (multiplied onto the ground);
  //   body  — the water's surface: the sky's colour, brightening into a band
  //           along each shore that faces the light, thinning toward the
  //           shore where the water is shallow;
  //   shore — the dark wet lip at the waterline and the foam and scum
  //           riding it in broken clots (laid behind the surface).
  // Each pixel knows how far it is from the waterline (the field over its
  // slope) and which way the shore faces (the slope's direction), which is
  // all those need.
  const LVL_STEP = 0.002;   // flood level steps between rebuilds (the shore moves a few pixels each)
  const DEEP = 0.03;        // how far over the shore's level the deep water starts
  const MASK = 4;           // screen pixels per baked pixel
  const FC = { ok: false, n: 0, lvl: -1, dark: -1, zd: 1, at: 0, x0: 0, y0: 0, x1: 0, y1: 0, wx0: 0, wy0: 0, wx1: 0, wy1: 0,
               body: null, shore: null, mul: null, bw: 0, bh: 0, mw: 0, mh: 0, tiles: [], ms: 0 };
  const _pool = [];
  // A baked layer's canvas only ever grows (in steps, so a view a pixel
  // bigger doesn't reallocate it); its pixels are an ImageData the exact
  // size of this bake, put into the top-left corner.
  function canvas(old, w, h, soft) {
    const cv = old || document.createElement('canvas');
    if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, Math.ceil(w / 128) * 128); cv.height = Math.max(cv.height, Math.ceil(h / 128) * 128); }
    if (!cv._g) cv._g = cv.getContext('2d', soft ? { willReadFrequently: true } : undefined);
    if (!cv._img || cv._img.width !== w || cv._img.height !== h) cv._img = new ImageData(w, h);
    return cv;
  }
  // Catmull-Rom weights for the four samples round t (0..1 between the
  // middle two).
  function crW(t, out, o) {
    const t2 = t * t, t3 = t2 * t;
    out[o]     = 0.5 * (-t3 + 2 * t2 - t);
    out[o + 1] = 0.5 * (3 * t3 - 5 * t2 + 2);
    out[o + 2] = 0.5 * (-3 * t3 + 4 * t2 + t);
    out[o + 3] = 0.5 * (t3 - t2);
  }
  // What the flood runs over and round: water stands over open ground,
  // streets and the thin or natural things on it (wires, pipes, poles,
  // lamps, trees), and rises into lakes and rivers (drawn over it, so they
  // swell); it stays off everything built on a plot, so the shore curves
  // round a house's yard instead of showing through it in a square.
  let THROUGH = null;
  if (typeof T !== 'undefined') THROUGH = new Set([T.WIRE, T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR, T.SHAFT, T.POLE, T.LAMP, T.CAMERA, T.TREE, T.BUSH].filter(Boolean));
  let _F = null, _G = null, _V = null, _cT = null, _cW = null, _rT = null, _rW = null;

  function buildFlood(lvl, dark, zd, vx0, vy0, vx1, vy1, now, pl) {
    const t0 = performance.now();
    _buildFlood(lvl, dark, zd, vx0, vy0, vx1, vy1, now, pl);
    FC.ms = performance.now() - t0;
  }
  function _buildFlood(lvl, dark, zd, vx0, vy0, vx1, vy1, now, pl) {
    // The area: the view and two fifths of its size again on every side (so
    // panning runs a while before a rebuild), on whole tiles, in the map.
    const mx = (vx1 - vx0) * 0.4 + TILE * 2, my = (vy1 - vy0) * 0.4 + TILE * 2;
    const c0 = Math.max(0, Math.floor((vx0 - mx) / TILE)), c1 = Math.min(COLS - 1, Math.ceil((vx1 + mx) / TILE));
    const r0 = Math.max(0, Math.floor((vy0 - my) / TILE)), r1 = Math.min(ROWS - 1, Math.ceil((vy1 + my) / TILE));
    Object.assign(FC, { ok: true, lvl, dark, zd, at: now, x0: c0 * TILE, y0: r0 * TILE, x1: (c1 + 1) * TILE, y1: (r1 + 1) * TILE });
    // How far the flood stands over each tile centre (negative: dry),
    // roughened a touch so the shore wanders. The streets lie a little
    // lower; a government plaza and the map's edge stay dry. The tiles well
    // under open water carry the rain's rings.
    const tc = c1 - c0 + 1, tr = r1 - r0 + 1;
    if (!_F || _F.length < tc * tr) _F = new Float32Array(tc * tr);
    const F = _F, tiles = FC.tiles; tiles.length = 0;
    let wet = 0, wc0 = c1, wc1 = c0, wr0 = r1, wr1 = r0;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      let v = lvl - tileLow(c, r);
      const e = GridManager.getEntity(c, r);
      if (e && e.type === T.WATER) v = lvl;             // a lake or river: the lowest ground there is
      else if (v > -ROAD_LOW - 0.01) {
        v += 0.008 * (vnoise(c * 0.9, r * 0.9, 31) - 0.5);
        if (e && e.type === T.ROAD) v += ROAD_LOW;
        else if (e && !THROUGH.has(e.type)) v = Math.min(v, -0.04);
        if (v > 0 && govTile(c, r)) v = -0.05;
      }
      if (c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1) v = Math.min(v, -0.05);
      F[(r - r0) * tc + (c - c0)] = v;
      if (v > 0) {
        wet++;
        if (c < wc0) wc0 = c; if (c > wc1) wc1 = c; if (r < wr0) wr0 = r; if (r > wr1) wr1 = r;
        if (v > 0.012 && !GridManager.getEntity(c, r)) {
          const it = _pool[tiles.length] || (_pool[tiles.length] = {});
          it.x = (c + 0.5) * TILE; it.y = (r + 0.5) * TILE; it.size = TILE * 0.7; it.h = hash01(c, r, 5);
          tiles.push(it);
        }
      }
    }
    FC.n = wet;
    if (!wet) return;
    // What of the area is wet (with room for the shore's margin): all that
    // the frame has to lay down.
    FC.wx0 = (wc0 - 1) * TILE; FC.wy0 = (wr0 - 1) * TILE; FC.wx1 = (wc1 + 2) * TILE; FC.wy1 = (wr1 + 2) * TILE;

    // The baked pixels: q per world unit, capped so a far-in zoom stays small.
    const ww = FC.x1 - FC.x0, wh = FC.y1 - FC.y0;
    const q = Math.min(zd / MASK, 1400 / ww, 1400 / wh);
    const W = Math.max(4, Math.ceil(ww * q)), H = Math.max(4, Math.ceil(wh * q));
    FC.body = canvas(FC.body, W, H); FC.shore = canvas(FC.shore, W, H); FC.mul = canvas(FC.mul, W, H, true);
    Object.assign(FC, { bw: W, bh: H, mw: W, mh: H });

    // The field at every baked pixel: Catmull-Rom across each tile row
    // first (G), then down the columns (V).
    if (!_cT || _cT.length < W) { _cT = new Int32Array(W); _cW = new Float32Array(W * 4); }
    if (!_rT || _rT.length < H) { _rT = new Int32Array(H); _rW = new Float32Array(H * 4); }
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / q / TILE - 0.5, ti = Math.floor(u);
      _cT[x] = ti; crW(u - ti, _cW, x * 4);
    }
    for (let y = 0; y < H; y++) {
      const u = (y + 0.5) / q / TILE - 0.5, tj = Math.floor(u);
      _rT[y] = tj; crW(u - tj, _rW, y * 4);
    }
    if (!_G || _G.length < tr * W) _G = new Float32Array(tr * W);
    if (!_V || _V.length < W * H) _V = new Float32Array(W * H);
    const G = _G, V = _V, cl = (i, n) => i < 0 ? 0 : i >= n ? n - 1 : i;
    for (let r = 0; r < tr; r++) {
      const row = r * tc;
      for (let x = 0; x < W; x++) {
        const ti = _cT[x], o = x * 4;
        G[r * W + x] = _cW[o] * F[row + cl(ti - 1, tc)] + _cW[o + 1] * F[row + cl(ti, tc)]
                     + _cW[o + 2] * F[row + cl(ti + 1, tc)] + _cW[o + 3] * F[row + cl(ti + 2, tc)];
      }
    }
    for (let y = 0; y < H; y++) {
      const tj = _rT[y], o = y * 4;
      const g0 = cl(tj - 1, tr) * W, g1 = cl(tj, tr) * W, g2 = cl(tj + 1, tr) * W, g3 = cl(tj + 2, tr) * W;
      const w0 = _rW[o], w1 = _rW[o + 1], w2 = _rW[o + 2], w3 = _rW[o + 3];
      for (let x = 0; x < W; x++) V[y * W + x] = w0 * G[g0 + x] + w1 * G[g1 + x] + w2 * G[g2 + x] + w3 * G[g3 + x];
    }

    // Every pixel: how far from the waterline (d, in baked pixels: the
    // field over its slope, positive in the water), which way the shore
    // faces, and from those the three layers.
    const n = pl.n, P = TILE * q;                         // baked pixels per tile
    const SHALLOW = P * 0.55, BAND = Math.max(1.2, P * 0.13), DAMP = P * 0.55, LIP = 0.9, FOAM = Math.max(1.2, P * 0.07);
    const bd = FC.body._img.data, sd = FC.shore._img.data, md = FC.mul._img.data;
    bd.fill(0); sd.fill(0); new Uint32Array(md.buffer).fill(0xffffffff);
    const fx0 = FC.x0 / TILE, fy0 = FC.y0 / TILE, inv = 1 / P;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, v = V[i];
      if (v < -0.03) continue;                             // well clear of any water
      const gx = (V[i + 1] - V[i - 1]) * 0.5, gy = (V[i + W] - V[i - W]) * 0.5;
      const gl = Math.sqrt(gx * gx + gy * gy) + 1e-7;
      const d = Math.max(-40, Math.min(40, v / gl));
      if (d < -DAMP) continue;
      const k = i * 4;
      // The ground: damp toward the shore, muddied under the water, darker
      // again where it is deep.
      let mr, mg, mb;
      if (d < 0) {
        const a = 0.45 * (1 + d / DAMP);
        mr = 255 - (255 - n.damp[0]) * a; mg = 255 - (255 - n.damp[1]) * a; mb = 255 - (255 - n.damp[2]) * a;
      } else {
        const a = Math.min(1, d + 0.5) * 0.6, dp = v > DEEP ? Math.min(1, (v - DEEP) / 0.01) * 0.5 : 0;
        mr = (255 - (255 - n.silt[0]) * a) * (1 - (1 - n.deep[0] / 255) * dp);
        mg = (255 - (255 - n.silt[1]) * a) * (1 - (1 - n.deep[1] / 255) * dp);
        mb = (255 - (255 - n.silt[2]) * a) * (1 - (1 - n.deep[2] / 255) * dp);
      }
      md[k] = mr; md[k + 1] = mg; md[k + 2] = mb;
      // The shore: the lip just outside the waterline, the foam across it.
      if (d > -LIP - 1 && d < FOAM + 1) {
        const lipA = d < 0 ? Math.max(0, 1 - Math.abs(d + LIP * 0.5) / (LIP * 0.5 + 0.5)) * 0.9 : 0;
        const wx = fx0 + (x + 0.5) * inv, wy = fy0 + (y + 0.5) * inv;
        const clot = vnoise(wx * 2.6, wy * 2.6, 41) * 0.65 + vnoise(wx * 7, wy * 7, 43) * 0.35;
        const band = 1 - Math.abs(d - FOAM * 0.3) / (FOAM + 0.6);
        const foamA = band > 0 ? Math.min(1, Math.max(0, (clot - 0.42) * 3.2)) * band : 0;
        const a = foamA + lipA * (1 - foamA);
        if (a > 0.01) {
          sd[k]     = (n.foam[0] * foamA + n.lip[0] * lipA * (1 - foamA)) / a;
          sd[k + 1] = (n.foam[1] * foamA + n.lip[1] * lipA * (1 - foamA)) / a;
          sd[k + 2] = (n.foam[2] * foamA + n.lip[2] * lipA * (1 - foamA)) / a;
          sd[k + 3] = a * 255;
        }
      }
      // The surface: thin over the shallows, thick out in the deep; the sky
      // in it, brightening toward a shore that faces the light (the slope
      // points into the water, so the shore faces against it).
      if (d > -0.5) {
        const edge = Math.min(1, d + 0.5);
        const a = edge * (0.4 + 0.6 * Math.min(1, Math.max(0, d) / SHALLOW));
        const face = Math.max(0, -(gx * LX + gy * LY) / gl);
        const b = face * Math.max(0, 1 - Math.max(0, d) / BAND) * 0.85;
        bd[k]     = n.sky[0] + (n.edge[0] - n.sky[0]) * b;
        bd[k + 1] = n.sky[1] + (n.edge[1] - n.sky[1]) * b;
        bd[k + 2] = n.sky[2] + (n.edge[2] - n.sky[2]) * b;
        bd[k + 3] = a * 255;
      }
    }
    FC.body._g.putImageData(FC.body._img, 0, 0);
    FC.shore._g.putImageData(FC.shore._img, 0, 0);
    FC.mul._g.putImageData(FC.mul._img, 0, 0);
  }

  // A pattern laid on the world: `tex` world units per texel, shifted by
  // (ox, oy) world units, through the camera transform `m` into device px.
  function setPat(pat, m, tex, ox, oy) {
    const M = _M;
    M.a = m.a * tex; M.b = m.b * tex; M.c = m.c * tex; M.d = m.d * tex;
    M.e = m.a * ox + m.c * oy + m.e; M.f = m.b * ox + m.d * oy + m.f;
    pat.setTransform(M);
  }

  // The surface layer: a screen-sized canvas on the GPU (only plain
  // source-over, atop and clip work goes into it), cleared and drawn back
  // only over the box the water covers.
  let _wcv = null, _wg = null;
  function _water(W, H) {
    if (!_wcv) { _wcv = document.createElement('canvas'); _wg = _wcv.getContext('2d'); }
    if (_wcv.width !== W || _wcv.height !== H) { _wcv.width = W; _wcv.height = H; }
    return { cv: _wcv, g: _wg };
  }

  // The multiply pass's layer (see render): a software canvas (read back
  // never, but willReadFrequently keeps it off the GPU, where every multiply
  // fill into it would cost the same pixel copy it is here to save), sized
  // to the box the visible puddles' damp rings can reach, at LAYER_K of the
  // screen's resolution (the stain is soft-edged; the water's surface and
  // lip are drawn sharp on top in pass 2). Filled white, so wherever no
  // puddle lies it multiplies the ground by one: unchanged.
  let layered = true;
  const LAYER_K = 0.5;
  let _lcv = null, _lg = null;
  const _L = { cv: null, g: null, k: LAYER_K, x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };
  function _layer(m, vis, W, H) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of vis) {
      const R = p.r * 1.75;          // the baked images' reach
      const cx = m.a * p.x + m.c * p.y + m.e, cy = m.b * p.x + m.d * p.y + m.f;
      const rx = R * Math.abs(m.a), ry = R * Math.abs(m.d);
      if (cx - rx < x0) x0 = cx - rx;
      if (cy - ry < y0) y0 = cy - ry;
      if (cx + rx > x1) x1 = cx + rx;
      if (cy + ry > y1) y1 = cy + ry;
    }
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W, Math.ceil(x1));  y1 = Math.min(H, Math.ceil(y1));
    if (x1 <= x0 || y1 <= y0) return null;
    if (!_lcv) { _lcv = document.createElement('canvas'); _lg = _lcv.getContext('2d', { willReadFrequently: true }); }
    const w = Math.max(1, Math.ceil((x1 - x0) * LAYER_K)), h = Math.max(1, Math.ceil((y1 - y0) * LAYER_K));
    if (_lcv.width < w || _lcv.height < h) { _lcv.width = Math.max(w, _lcv.width); _lcv.height = Math.max(h, _lcv.height); }
    _lg.setTransform(1, 0, 0, 1, 0, 0);
    _lg.globalCompositeOperation = 'source-over';
    _lg.globalAlpha = 1;
    _lg.fillStyle = '#fff';
    _lg.fillRect(0, 0, w + 1, h + 1);
    // The box drawn back is exactly the layer pixels covered, so the
    // half-resolution layer lines up with the ground.
    Object.assign(_L, { cv: _lcv, g: _lg, x0, y0, x1: x0 + w / LAYER_K, y1: y0 + h / LAYER_K, w, h });
    return _L;
  }

  return {
    render,
    count: () => _vis.length,      // puddles drawn last frame
    // Dev: where the biggest puddles in view are, [x, y, size] in world units.
    devBiggest: n => _vis.filter(p => p.wet > 0.02).sort((a, b) => b.size - a.size).slice(0, n || 3).map(p => [Math.round(p.x), Math.round(p.y), Math.round(p.size)]),
    floodTiles: () => (FC.ok ? FC.n : 0),   // flooded tiles round the view
    floodBuildMs: () => FC.ms || 0,         // how long the last rebuild of the flood took
    // Dev: soak the map at once (0..1), to see or time a downpour's puddles.
    devSoak: v => { soak = water = stain = Math.max(0, Math.min(1, v)); },
    // Dev: raise the flood at once (0..1); it still drains if no flood is on.
    devFlood: v => { floodK = Math.max(0, Math.min(1, v)); },
    flood: () => floodK,           // how far up the flood is, 0..1
    // Dev A/B: false draws the puddles' multiply pass straight onto the ground again.
    get layered() { return layered; }, set layered(v) { layered = !!v; },
    soak: () => soak,
    clear: () => { cells.clear(); SPR.clear(); sprPx = 0; FC.ok = false; water = stain = floodK = soak = 0; },
  };
})();
