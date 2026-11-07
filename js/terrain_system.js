/* ═══════════════════════════════════════════════════════════════════
   TERRAIN SYSTEM — elevation
   A smooth height field over the whole map (0 = valley floor, 1 = the
   highest peak). It never blocks building: it is read as shading and
   contour lines on the ground, and as placement value for the systems
   that care how high or exposed a spot is:
     • wind turbines turn faster on high, exposed ground (windMult);
     • lightning favours tall, exposed targets (lightningMult);
     • a dam across a deep valley has more head behind it (damHead).
   All three multipliers sit at ~×1.0 on ordinary ground, so terrain is a
   reason to pick a site, not a tax on every existing build.

   The field is rebuilt from a saved seed plus the water already on the
   map, which is carved in as valleys: rivers and lakes always sit low,
   whether the water was generated this session or came from an old save
   (a save from before terrain existed simply gets a fresh seed).
   Contract sites are their own small maps, so while the player is away
   every multiplier is neutral and no relief is drawn.
   ═══════════════════════════════════════════════════════════════════ */
const TerrainSystem = (() => {
  const N = COLS * ROWS;
  let H  = null;        // Float32Array — elevation 0..1 per tile
  let HB = null;        // Float32Array — broad local mean, for prominence
  let _seed = 0;
  // The map size the seed was rolled for. When a world is recentred onto a
  // bigger map the noise is still laid out for this size and sampled at the
  // old map's offset, so the hills under an existing city (and the wind and
  // view values that came with them) stay exactly where they were; the new
  // ring of land outside continues the same field.
  let _oc = COLS, _or = ROWS;
  let _ver = 0;         // bumps on every rebuild; render caches key on it
  let _waterSig = -1;   // water tile count the field was carved from

  const NEUTRAL = 0.35; // exposure that maps every multiplier to ~×1.0
  const VALLEY_R = 22;  // tiles over which ground rises out of a river/lake
  const PROM_R = 14;    // box radius for the local mean (ridge prominence)

  // ── Seeded helpers ─────────────────────────────────────────────────
  function _rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Smooth value noise on a `cell`-tile lattice (same shape as the forest
  // noise in generateLandscape, but drawn from the seeded generator).
  // Lattice points past the seeded grid (land added round a recentred world)
  // come from a hash of their position instead of the generator's sequence.
  function _hash01(x, y, salt) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ salt;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function _noise(rnd, cell) {
    const w = Math.ceil(_oc / cell) + 2, h = Math.ceil(_or / cell) + 2;
    const g = new Float32Array(w * h);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    const salt = (_seed ^ Math.imul(cell, 0x9e3779b1)) | 0;
    const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h) ? g[y * w + x] : _hash01(x, y, salt);
    return (c, r) => {
      const x = c / cell, y = r / cell, x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = at(x0, y0), b = at(x0 + 1, y0), c2 = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      const top = a + (b - a) * sx;
      return top + ((c2 + (d - c2) * sx) - top) * sy;
    };
  }
  const _smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

  // Distance (in tiles) from every tile to the nearest water tile, via a
  // two-pass 3-4 chamfer — round valleys instead of the diamonds a 4-way
  // BFS gives. Capped well past VALLEY_R; only the near range matters.
  function _waterDistance() {
    const CAP = (VALLEY_R + 4) * 3;
    const d = new Uint16Array(N).fill(CAP);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (WaterSystem.isWater(c, r)) d[r * COLS + c] = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        let v = d[i];
        if (v === 0) continue;
        if (c > 0) v = Math.min(v, d[i - 1] + 3);
        if (r > 0) {
          v = Math.min(v, d[i - COLS] + 3);
          if (c > 0) v = Math.min(v, d[i - COLS - 1] + 4);
          if (c < COLS - 1) v = Math.min(v, d[i - COLS + 1] + 4);
        }
        d[i] = v;
      }
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      for (let c = COLS - 1; c >= 0; c--) {
        const i = r * COLS + c;
        let v = d[i];
        if (v === 0) continue;
        if (c < COLS - 1) v = Math.min(v, d[i + 1] + 3);
        if (r < ROWS - 1) {
          v = Math.min(v, d[i + COLS] + 3);
          if (c < COLS - 1) v = Math.min(v, d[i + COLS + 1] + 4);
          if (c > 0) v = Math.min(v, d[i + COLS - 1] + 4);
        }
        d[i] = v;
      }
    }
    return d;   // units of 1/3 tile
  }

  // Separable box blur of `src` with radius `R`, clamped at the edges.
  function _boxBlur(src, R) {
    const tmp = new Float32Array(N), out = new Float32Array(N);
    for (let r = 0; r < ROWS; r++) {
      const o = r * COLS;
      let s = 0, n = 0;
      for (let c = 0; c <= Math.min(R, COLS - 1); c++) { s += src[o + c]; n++; }
      for (let c = 0; c < COLS; c++) {
        tmp[o + c] = s / n;
        const add = c + R + 1, sub = c - R;
        if (add < COLS) { s += src[o + add]; n++; }
        if (sub >= 0)   { s -= src[o + sub]; n--; }
      }
    }
    for (let c = 0; c < COLS; c++) {
      let s = 0, n = 0;
      for (let r = 0; r <= Math.min(R, ROWS - 1); r++) { s += tmp[r * COLS + c]; n++; }
      for (let r = 0; r < ROWS; r++) {
        out[r * COLS + c] = s / n;
        const add = r + R + 1, sub = r - R;
        if (add < ROWS) { s += tmp[add * COLS + c]; n++; }
        if (sub >= 0)   { s -= tmp[sub * COLS + c]; n--; }
      }
    }
    return out;
  }

  // ── Build ──────────────────────────────────────────────────────────
  function _build() {
    const rnd = _rng(_seed);
    const nCont = _noise(rnd, 300), nHill = _noise(rnd, 110), nRidge = _noise(rnd, 55), nDet = _noise(rnd, 22);
    const h = new Float32Array(N);
    // Where the seed's own map sits on this one (the same offset
    // SaveSystem._migrateMapSize recentres a world by; 0 for a world made at
    // this size). The height range is taken over that map alone, so its
    // terrain comes out as it always did.
    const ox = Math.floor(COLS / 2) - Math.floor(_oc / 2), oy = Math.floor(ROWS / 2) - Math.floor(_or / 2);
    let lo = Infinity, hi = -Infinity;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const sc = c - ox, sr = r - oy;
        const cont = nCont(sc, sr), hill = nHill(sc, sr);
        const rg = 1 - Math.abs(2 * nRidge(sc, sr) - 1);         // sharp crest lines
        // Ridges only rise where the land is already high, so they run
        // along uplands instead of criss-crossing the plains.
        const v = 0.42 * cont + 0.28 * hill + 0.24 * rg * rg * _smooth(0.3, 0.75, cont * 0.6 + hill * 0.4) + 0.06 * nDet(sc, sr);
        h[r * COLS + c] = v;
        if (sc < 0 || sr < 0 || sc >= _oc || sr >= _or) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    const span = (hi - lo) || 1;
    const dist = _waterDistance();
    const cx = COLS / 2, cy = ROWS / 2;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        // Clamped: h[] holds float32-rounded values but lo/hi were taken
        // from the unrounded ones, so the lowest tile can land a hair below
        // lo — and a negative base to a fractional power is NaN, which the
        // blurs below would then smear along whole rows and columns.
        let v = Math.pow(Math.max(0, Math.min(1, (h[i] - lo) / span)), 1.25);   // more lowland than peak
        // Gentle ground round City Hall — the start shouldn't open on a cliff.
        const dc = Math.hypot(c - cx, r - cy);
        if (dc < 95) { const w = Math.pow(1 - dc / 95, 2) * 0.6; v += (0.33 - v) * w; }
        // Water sits in valleys: land rises out of it over VALLEY_R tiles.
        const floor = v * 0.2;
        v = floor + (v - floor) * _smooth(0, VALLEY_R, dist[i] / 3);
        h[i] = v;
      }
    }
    // Two light blurs (≈ a small gaussian): the chamfer distance leaves
    // faceted valley walls that hill shading turns into streaks.
    H = _boxBlur(_boxBlur(h, 2), 2);
    HB = _boxBlur(H, PROM_R);
    _waterSig = WaterSystem.getWaterTiles().size;
    _ver++;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────
  // New world: fresh seed, built from the water WaterSystem.generate() laid.
  function generate() {
    _seed = (Math.random() * 0x7fffffff) | 0;
    _oc = COLS; _or = ROWS;
    _build();
  }
  function save() { return { seed: _seed, cols: _oc, rows: _or }; }
  // Loading: reuse the saved seed, or roll one for a save from before
  // terrain existed. Must run after WaterSystem.load(). `origin` is the map
  // size the world was last saved at, for a save that doesn't record the
  // size its seed was rolled for (SaveSystem passes it after a recentre).
  function load(data, origin) {
    const fresh = !(data && Number.isFinite(data.seed));
    _seed = fresh ? (Math.random() * 0x7fffffff) | 0 : data.seed;
    const o = !fresh && data.cols > 0 && data.rows > 0 ? data : !fresh ? origin : null;
    _oc = o && o.cols > 0 && o.cols <= COLS ? o.cols : COLS;
    _or = o && o.rows > 0 && o.rows <= ROWS ? o.rows : ROWS;
    _build();
  }
  // Back home from a contract site: if the field was carved from some
  // other water (a save loaded while away), carve it again from home's.
  function syncToWater() {
    if (!H || WaterSystem.getWaterTiles().size !== _waterSig) _build();
  }

  // ── Queries ────────────────────────────────────────────────────────
  function _away() { return typeof ContractSystem !== 'undefined' && !!ContractSystem.isAway?.(); }
  function active() { return !!H && !_away(); }

  // Bilinear elevation at a point in tile units (tile centres at c + 0.5).
  function sample(x, y, field = H) {
    if (!field) return NEUTRAL;
    const fx = Math.max(0, Math.min(COLS - 1.001, x - 0.5)), fy = Math.max(0, Math.min(ROWS - 1.001, y - 0.5));
    const x0 = fx | 0, y0 = fy | 0, ax = fx - x0, ay = fy - y0;
    const i = y0 * COLS + x0;
    const x1 = x0 < COLS - 1 ? 1 : 0, y1 = y0 < ROWS - 1 ? COLS : 0;
    const top = field[i] + (field[i + x1] - field[i]) * ax;
    const bot = field[i + y1] + (field[i + y1 + x1] - field[i + y1]) * ax;
    return top + (bot - top) * ay;
  }
  function elevAt(c, r) {
    if (!H || c < 0 || r < 0 || c >= COLS || r >= ROWS) return NEUTRAL;
    return H[r * COLS + c];
  }
  // Exposure of a footprint: its height plus how far it stands above the
  // surrounding land, so a lone ridge beats a broad plateau of equal height.
  function exposure(col, row, w = 1, h = 1) {
    if (!active()) return NEUTRAL;
    const x = col + w / 2, y = row + h / 2;
    const e = sample(x, y), m = sample(x, y, HB);
    return e + 0.8 * (e - m);
  }
  const _rect = (a, b, w, h) => typeof a === 'object' && a
    ? [a.col, a.row, a.width || 1, a.height || 1] : [a, b, w || 1, h || 1];

  // ×0.75 in a sheltered hollow … ×1.0 on ordinary ground … ×1.45 on a crest.
  function windMult(a, b, w, h) {
    if (!active()) return 1;
    return Math.max(0.75, Math.min(1.45, 0.78 + 0.62 * exposure(..._rect(a, b, w, h))));
  }
  // Relative chance a bolt picks this building over one on ordinary ground.
  function lightningMult(a, b, w, h) {
    if (!active()) return 1;
    return Math.max(0.35, Math.min(2.2, 0.35 + 1.85 * exposure(..._rect(a, b, w, h))));
  }
  // How deep a valley a dam at (col,row) closes off: the mean height of the
  // dry ground within ~20 tiles (the width of a carved valley) over the
  // water's own level. Half of all river spots stay at ×1.0; the deepest
  // quarter reach ×1.1+, and a gorge through high country up to ×1.5.
  function valleyDepth(col, row) {
    if (!active()) return 0;
    const R = 20, base = elevAt(col, row);
    let s = 0, n = 0;
    for (let dr = -R; dr <= R; dr += 3)
      for (let dc = -R; dc <= R; dc += 3) {
        if (dc * dc + dr * dr > R * R) continue;
        const c = col + dc, r = row + dr;
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS || WaterSystem.isWater(c, r)) continue;
        s += H[r * COLS + c]; n++;
      }
    return n ? Math.max(0, s / n - base) : 0;
  }
  function damHead(col, row) {
    if (!active()) return 1;
    return Math.min(1.5, 1 + Math.max(0, valleyDepth(col, row) - 0.08) * 3.5);
  }
  // ── Slope ──────────────────────────────────────────────────────────
  // Gradient magnitude (elevation per tile) at a point. Typical ground is
  // ~0.004; the steepest tenth of the map starts near 0.012, the steepest
  // hundredth near 0.03.
  function _gradAt(x, y) {
    return Math.hypot(sample(x + 1, y) - sample(x - 1, y), sample(x, y + 1) - sample(x, y - 1)) / 2;
  }
  // 0 (flat enough to ignore) … 1 (the steepest ground on the map), from
  // the steepest of a footprint's centre and four inset corners.
  function steepness(col, row, w = 1, h = 1) {
    if (!active()) return 0;
    const x0 = col + Math.min(0.5, w / 2), x1 = col + Math.max(w - 0.5, w / 2);
    const y0 = row + Math.min(0.5, h / 2), y1 = row + Math.max(h - 0.5, h / 2);
    const g = Math.max(_gradAt(col + w / 2, row + h / 2), _gradAt(x0, y0), _gradAt(x1, y0), _gradAt(x0, y1), _gradAt(x1, y1));
    return Math.max(0, Math.min(1, (g - 0.006) / 0.024));
  }
  // Roads and surface pipes have to be cut and graded into a hillside: up
  // to double the list price on the steepest ground. Everything else (and
  // pipes laid over wire, belts or water) pays list.
  const SLOPE_PRICED = new Set([T.ROAD, T.PIPE]);
  function buildCostMult(type, col, row, w = 1, h = 1) {
    return SLOPE_PRICED.has(type) ? 1 + steepness(col, row, w, h) : 1;
  }
  // Is world point (tile units) on a road? Roads that overlap wires or pipes
  // don't own those grid tiles, so this checks footprints rather than the grid.
  function onRoad(x, y) {
    for (const r of EntityRegistry.getByType(T.ROAD))
      if (x >= r.col && x < r.col + r.width && y >= r.row && y < r.row + r.height) return true;
    return false;
  }
  // Speed factor for a truck at world px (wx, wy) heading along unit vector
  // (hx, hy): 1 on the flat or downhill, down to ×0.55 climbing the steepest
  // grades. A road is graded, so it halves the penalty (×0.78 at worst).
  function climbFactor(wx, wy, hx, hy) {
    if (!active()) return 1;
    const x = wx / TILE, y = wy / TILE;
    const g = (sample(x + hx, y + hy) - sample(x - hx, y - hy)) / 2;   // rise per tile along heading
    const k = Math.max(0, Math.min(1, (g - 0.004) / 0.024));
    if (k <= 0) return 1;
    return 1 - k * (onRoad(x, y) ? 0.22 : 0.45);
  }

  // ── Views ──────────────────────────────────────────────────────────
  // Satisfaction a home gains from where it stands: up to +8 for high,
  // exposed ground (nothing on ordinary ground, so no existing home loses
  // out) and +3 for looking down on a lake or river within 14 tiles.
  // Cached per entity; recomputed only when the terrain changes.
  function _viewOf(col, row, w, h) {
    if (!active()) return { pts: 0, height: 0, water: 0 };
    const height = Math.round(Math.max(0, Math.min(1, (exposure(col, row, w, h) - 0.38) / 0.4)) * 8);
    const cx = col + w / 2, cy = row + h / 2, here = sample(cx, cy);
    let water = 0;
    for (let rad = 3; rad <= 14 && !water; rad += 2)
      for (let a = 0; a < 16; a++) {
        const c = Math.floor(cx + Math.cos(a * 0.3927) * rad), r = Math.floor(cy + Math.sin(a * 0.3927) * rad);
        if (WaterSystem.isWater(c, r) && here - elevAt(c, r) >= 0.06) { water = 3; break; }
      }
    return { pts: height + water, height, water };
  }
  function viewFor(e) {
    const v = _ver * 2 + (active() ? 1 : 0);
    if (e._viewVer !== v) { e._view = _viewOf(e.col, e.row, e.width || 1, e.height || 1); e._viewVer = v; }
    return e._view;
  }
  function viewLabel(e) {
    const v = viewFor(e);
    if (!v.pts) return '—';
    const kind = v.height && v.water ? 'Hillside & water' : v.height ? 'Hillside' : 'Water';
    return `${kind} view +${v.pts}`;
  }

  // Display height in metres.
  function metres(v) { return Math.round(20 + v * 680); }
  function metresAt(col, row, w = 1, h = 1) { return metres(active() ? sample(col + w / 2, row + h / 2) : NEUTRAL); }
  // One-word read of a spot, for placement tags and info panels.
  function describe(col, row, w = 1, h = 1) {
    const x = exposure(col, row, w, h);
    return x > 0.75 ? 'Ridge' : x > 0.55 ? 'Upland' : x > 0.28 ? 'Rolling' : x > 0.15 ? 'Lowland' : 'Hollow';
  }
  // "Ridge · 540 m" for an entity's footprint.
  function siteLabel(e) {
    const w = e.width || 1, h = e.height || 1;
    return `${describe(e.col, e.row, w, h)} · ${metresAt(e.col, e.row, w, h)} m`;
  }

  // ── Relief drawing ─────────────────────────────────────────────────
  // Baked into the cached background bitmap by drawStaticBackgroundLayer
  // (render_core.js), so none of it costs anything per frame. Two
  // one-pixel-per-tile canvases, upscaled with bilinear smoothing: hill
  // shade (light from the north-west) and a faint altitude tint. Contour
  // lines go on top as vector strokes so they stay crisp at any zoom.
  let _shadeCv = null, _tintCv = null, _reliefVer = -1;
  const RELIEF_K = 24;   // vertical exaggeration: 1.0 of elevation ≈ 24 tiles of rise
  function _buildRelief() {
    const mk = () => { const cv = document.createElement('canvas'); cv.width = COLS; cv.height = ROWS; return cv; };
    _shadeCv = _shadeCv || mk(); _tintCv = _tintCv || mk();
    const sg = _shadeCv.getContext('2d'), tg = _tintCv.getContext('2d');
    const si = sg.createImageData(COLS, ROWS), ti = tg.createImageData(COLS, ROWS);
    const S = si.data, Tn = ti.data;
    const lx = -0.45, ly = -0.55, lz = 0.70;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c, o = i * 4;
        const cl = c > 0 ? i - 1 : i, cr = c < COLS - 1 ? i + 1 : i;
        const ru = r > 0 ? i - COLS : i, rd = r < ROWS - 1 ? i + COLS : i;
        const gx = (H[cr] - H[cl]) * 0.5 * RELIEF_K, gy = (H[rd] - H[ru]) * 0.5 * RELIEF_K;
        // Brightness of the slope's normal against the light, relative to flat ground.
        const s = (-gx * lx - gy * ly + lz) / Math.sqrt(gx * gx + gy * gy + 1) - lz;
        if (s > 0) { S[o] = 255; S[o + 1] = 244; S[o + 2] = 214; S[o + 3] = Math.min(0.16, s * 0.55) * 255; }
        else       { S[o] = 6;   S[o + 1] = 12;  S[o + 2] = 22;  S[o + 3] = Math.min(0.34, -s * 0.9) * 255; }
        // High ground dries out toward pale olive; the lowest bottoms go lusher.
        const v = H[i], up = _smooth(0.42, 0.95, v), low = _smooth(0.16, 0.03, v);
        if (up > 0)       { Tn[o] = 156; Tn[o + 1] = 148; Tn[o + 2] = 108; Tn[o + 3] = up * 0.24 * 255; }
        else if (low > 0) { Tn[o] = 10;  Tn[o + 1] = 44;  Tn[o + 2] = 24;  Tn[o + 3] = low * 0.16 * 255; }
      }
    }
    sg.putImageData(si, 0, 0);
    tg.putImageData(ti, 0, 0);
  }

  // Marching squares between tile centres, one path per weight.
  function _contours(g, c0, c1, r0, r1, zoom, night) {
    // Strongest in the mid zoom range where they read as the lie of the
    // land; they thin out as the camera closes in (≈65% at zoom 0.8, 40%
    // at 1, 10% from 1.4 in), where they'd only be lines scribbled across the ground.
    const fade = _smooth(0.12, 0.3, zoom) * (1 - 0.9 * _smooth(0.35, 1.4, zoom));
    if (fade <= 0.02) return;
    const STEP = 0.05, MAJ = 5;          // a line every ~34 m, a heavier one every 170 m
    const minor = new Path2D(), major = new Path2D();
    let any = false;
    for (let r = r0; r < r1 - 1; r++) {
      for (let c = c0; c < c1 - 1; c++) {
        const i = r * COLS + c;
        const a = H[i], b = H[i + 1], d = H[i + COLS + 1], e = H[i + COLS];
        const lo = Math.min(a, b, d, e), hi = Math.max(a, b, d, e);
        let k = Math.floor(lo / STEP) + 1;
        if (k * STEP > hi) continue;
        // No contours across water — its surface is drawn over them anyway,
        // and a line hugging every shore reads as a second bank.
        if (WaterSystem.isWater(c, r) || WaterSystem.isWater(c + 1, r) ||
            WaterSystem.isWater(c, r + 1) || WaterSystem.isWater(c + 1, r + 1)) continue;
        const x0 = (c + 0.5) * TILE, y0 = (r + 0.5) * TILE;
        for (; k * STEP <= hi; k++) {
          const lev = k * STEP, pts = [];
          if ((a < lev) !== (b < lev)) pts.push(x0 + (lev - a) / (b - a) * TILE, y0);
          if ((b < lev) !== (d < lev)) pts.push(x0 + TILE, y0 + (lev - b) / (d - b) * TILE);
          if ((e < lev) !== (d < lev)) pts.push(x0 + (lev - e) / (d - e) * TILE, y0 + TILE);
          if ((a < lev) !== (e < lev)) pts.push(x0, y0 + (lev - a) / (e - a) * TILE);
          const p = k % MAJ === 0 ? major : minor;
          for (let q = 0; q + 3 < pts.length; q += 4) { p.moveTo(pts[q], pts[q + 1]); p.lineTo(pts[q + 2], pts[q + 3]); }
          any = true;
        }
      }
    }
    if (!any) return;
    g.lineCap = 'round';
    g.strokeStyle = `rgba(6,14,10,${0.10 * fade * night})`; g.lineWidth = 1.0 / zoom; g.stroke(minor);
    g.strokeStyle = `rgba(6,14,10,${0.17 * fade * night})`; g.lineWidth = 1.5 / zoom; g.stroke(major);
  }

  function drawRelief(g, c0, c1, r0, r1, dark, zoom) {
    if (!active()) return;
    if (_reliefVer !== _ver) { _buildRelief(); _reliefVer = _ver; }
    // Two tiles of slack: bilinear filtering clamps at the source rect's
    // edge, and the band clip hides the margin.
    const a0 = Math.max(0, c0 - 2), a1 = Math.min(COLS, c1 + 2), b0 = Math.max(0, r0 - 2), b1 = Math.min(ROWS, r1 + 2);
    if (a1 <= a0 || b1 <= b0) return;
    const night = 1 - dark * 0.45;
    g.save();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.globalAlpha = night;
    const sw = a1 - a0, sh = b1 - b0;
    g.drawImage(_tintCv,  a0, b0, sw, sh, a0 * TILE, b0 * TILE, sw * TILE, sh * TILE);
    g.drawImage(_shadeCv, a0, b0, sw, sh, a0 * TILE, b0 * TILE, sw * TILE, sh * TILE);
    g.globalAlpha = 1;
    // Contours are the only per-tile work here — skipped at low graphics
    // quality (gfx_quality.js steps down on its own when frames run long).
    if (typeof GfxQuality === 'undefined' || GfxQuality.level() >= 1) _contours(g, a0, a1, b0, b1, zoom, night);
    g.restore();
  }

  // Placement read-out pinned under a ghost, in screen-sized type (the
  // same look as the blueprint cost tag). tone: 1 good, -1 poor, 0 plain.
  // `above` puts it over the footprint instead (water_build.js's fill tag,
  // so it never sits on top of the wind or slope read-out below).
  function drawTag(g, col, row, w, h, main, sub, tone, above) {
    const z = Camera.zoom || 1, px = 1 / z;
    const x = col * TILE, y = above ? row * TILE - 26 * px : (row + h) * TILE + 6 * px;
    g.save();
    g.font = `bold ${13 * px}px Arial, sans-serif`;
    const mw = g.measureText(main).width;
    g.font = `${10.5 * px}px Arial, sans-serif`;
    const sw = sub ? g.measureText(sub).width : 0;
    const padX = 7 * px, gap = sub ? 7 * px : 0, th = 20 * px, tw = padX * 2 + mw + gap + sw;
    const col1 = tone > 0 ? '#60e890' : tone < 0 ? '#ff8a60' : '#d8e8f0';
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,16,26,0.88)';
    g.strokeStyle = tone > 0 ? 'rgba(96,232,144,0.85)' : tone < 0 ? 'rgba(255,138,96,0.9)' : 'rgba(64,192,255,0.8)';
    g.lineWidth = 1.2 * px;
    g.beginPath(); g.roundRect(x, y, tw, th, 4 * px); g.fill(); g.stroke();
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.font = `bold ${13 * px}px Arial, sans-serif`;
    g.fillStyle = col1;
    g.fillText(main, x + padX, y + th / 2 + 0.5 * px);
    if (sub) {
      g.font = `${10.5 * px}px Arial, sans-serif`;
      g.fillStyle = '#8ab8d0';
      g.fillText(sub, x + padX + mw + gap, y + th / 2 + 0.5 * px);
    }
    g.restore();
  }

  // Ghost read-out for the tools terrain matters to.
  function drawPlacementTag(g, type, col, row) {
    if (!active() || !GridManager.inBounds(col, row)) return;
    const d = EntityDefs[type] || {}, w = d.width || 1, h = d.height || 1;
    const where = `${describe(col, row, w, h)} · ${metresAt(col, row, w, h)} m`;
    if (type === T.WIND || type === T.WIND2 || type === T.WIND3) {
      const m = windMult(col, row, w, h);
      drawTag(g, col, row, w, h, `Wind ×${m.toFixed(2)}`, where, m >= 1.1 ? 1 : m < 0.95 ? -1 : 0);
    } else if (type === T.LIGHTNINGROD || type === T.LIGHTNINGROD2 || type === T.LIGHTNINGROD3) {
      const m = lightningMult(col, row, w, h);
      drawTag(g, col, row, w, h, `Strike risk ×${m.toFixed(2)}`, where, 0);
    } else if (type === T.DAM) {
      const m = damHead(col, row);
      drawTag(g, col, row, 1, 1, `Valley head ×${m.toFixed(2)}`, where, m >= 1.1 ? 1 : 0);
    } else if (SLOPE_PRICED.has(type) && type !== T.PIPE) {
      // Roads only: pipes still pay the slope surcharge, but the tag was
      // clutter while dragging a run — the price shows in the build cost.
      // Roads place rotated (6×6 either way).
      const m = buildCostMult(type, col, row, w, h);
      if (m < 1.02) return;                       // flat ground: no tag, no clutter
      const price = Math.round((typeof buildCost === 'function' ? buildCost(type) : d.cost || 0) * m);
      drawTag(g, col, row, w, h, `Slope +${Math.round((m - 1) * 100)}%`, `${formatMoney(price)} · ${where}`, -1);
    }
  }

  return {
    generate, save, load, syncToWater,
    active, version: () => _ver,
    sample, elevAt, exposure, windMult, lightningMult, valleyDepth, damHead,
    steepness, buildCostMult, climbFactor, viewFor, viewLabel,
    metres, metresAt, describe, siteLabel,
    drawRelief, drawPlacementTag, drawTag,
    field: () => (active() ? H : null),
  };
})();
