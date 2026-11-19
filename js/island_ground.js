/* ═══════════════════════════════════════════════════════════════════
   ISLAND GROUND
   The small islands of dry land left inside lakes and rivers are drawn as
   rocky outcrops instead of plain meadow: weathered grey-brown stone with
   lichen, the odd grassy pocket, darker wet rock along the waterline, and
   boulders and pebbles scattered over it.

   Islands are not stored anywhere (a save only keeps the water), so they
   are found from the water itself: any patch of land that is entirely
   surrounded by water and no bigger than MAX_TILES counts. The search
   reruns only when the water changes (a dam floods or drains a valley,
   a new world, a load), keyed on the water tile count and the terrain
   version. Like the deposit ground it is baked into the cached ground
   bitmap, so it costs nothing per frame.
   ═══════════════════════════════════════════════════════════════════ */
const IslandGround = (() => {
  const MAX_TILES = 1500;   // land bigger than this is a shore, not an island
  let _sig = null;
  let _lab = null;          // Int32Array per tile: island id (1-based), -1 not an island, 0 unvisited
  let _isles = [];          // [{ id, c0, r0, c1, r1, n, cv }]
  let _ver = 0;

  const _hash = (c, r, n) => {
    const x = Math.sin(c * 127.1 + r * 311.7 + n * 74.3) * 43758.5453;
    return x - Math.floor(x);
  };
  const _away = () => typeof ContractSystem !== 'undefined' && !!ContractSystem.isAway?.();
  const _water = (c, r) => WaterSystem.isWater(c, r);

  // ── Finding the islands ────────────────────────────────────────────
  // Flood each stretch of land that touches water. A flood that reaches
  // the map edge, land already known to be mainland, or more than
  // MAX_TILES tiles stops there and marks everything it reached mainland;
  // later floods of the same shore stop as soon as they meet that.
  function _compute() {
    const N = COLS * ROWS;
    const lab = new Int32Array(N);
    const isles = [];
    const q = new Int32Array(MAX_TILES + 4);
    const DC = [1, -1, 0, 0], DR = [0, 0, 1, -1];
    const flood = (start) => {
      let head = 0, tail = 0, main = false;
      lab[start] = -2; q[tail++] = start;
      while (head < tail && !main) {
        const i = q[head++], c = i % COLS, r = (i / COLS) | 0;
        for (let d = 0; d < 4; d++) {
          const nc = c + DC[d], nr = r + DR[d];
          if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) { main = true; break; }
          if (_water(nc, nr)) continue;
          const ni = nr * COLS + nc, v = lab[ni];
          if (v === -1) { main = true; break; }
          if (v !== 0) continue;
          if (tail >= MAX_TILES) { main = true; break; }
          lab[ni] = -2; q[tail++] = ni;
        }
      }
      const id = main ? -1 : isles.length + 1;
      let c0 = COLS, r0 = ROWS, c1 = -1, r1 = -1;
      for (let k = 0; k < tail; k++) {
        const i = q[k];
        lab[i] = id;
        if (!main) {
          const c = i % COLS, r = (i / COLS) | 0;
          if (c < c0) c0 = c; if (c > c1) c1 = c;
          if (r < r0) r0 = r; if (r > r1) r1 = r;
        }
      }
      if (!main) isles.push({ id, c0, r0, c1, r1, n: tail, cv: null });
    };
    for (const key of WaterSystem.getWaterTiles()) {
      const k = key.indexOf(',');
      const c = +key.slice(0, k), r = +key.slice(k + 1);
      for (let d = 0; d < 4; d++) {
        const nc = c + DC[d], nr = r + DR[d];
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || _water(nc, nr)) continue;
        if (lab[nr * COLS + nc] === 0) flood(nr * COLS + nc);
      }
    }
    _lab = lab; _isles = isles; _ver++;
  }

  function _ensure() {
    if (typeof WaterSystem === 'undefined') return false;
    const sig = WaterSystem.getWaterTiles().size + ':' + (typeof TerrainSystem !== 'undefined' ? TerrainSystem.version() : 0);
    if (sig !== _sig) { _sig = sig; _compute(); }
    return true;
  }

  function isIsland(c, r) {
    if (!_lab || c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    return _lab[r * COLS + c] > 0;
  }

  // ── The stone colour: one pixel per tile, stretched smooth ─────────
  // Pixel centres land on tile centres (plus a transparent ring), so the
  // rock blends across tiles the way the grass does and fades out over
  // the shore tile, where the water's own edge is drawn over it.
  function _bake(is) {
    const w = is.c1 - is.c0 + 3, h = is.r1 - is.r0 + 3;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    const img = g.createImageData(w, h), px = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = is.c0 - 1 + x, r = is.r0 - 1 + y;
      if (!(c >= 0 && r >= 0 && c < COLS && r < ROWS && _lab[r * COLS + c] === is.id)) continue;
      const shore = _water(c + 1, r) || _water(c - 1, r) || _water(c, r + 1) || _water(c, r - 1);
      const t = _hash(c, r, 1);
      let R = 92 + t * 30, G = 88 + t * 28, B = 80 + t * 24;           // grey-brown stone
      const lichen = _hash(c, r, 2);
      if (lichen > 0.78) { R += (104 - R) * 0.5; G += (116 - G) * 0.5; B += (70 - B) * 0.5; }      // yellow-green lichen
      else if (lichen < 0.1) { R += (150 - R) * 0.3; G += (128 - G) * 0.3; B += (96 - B) * 0.3; } // ochre stain
      if (shore) { R *= 0.72; G *= 0.74; B *= 0.78; }                                              // wet rock at the waterline
      // A grassy pocket here and there lets the meadow show through.
      const a = !shore && _hash(Math.floor(c / 3), Math.floor(r / 3), 3) < 0.2 ? 0.45 : 0.94;
      const o = (y * w + x) * 4;
      px[o] = R; px[o + 1] = G; px[o + 2] = B; px[o + 3] = a * 255;
    }
    g.putImageData(img, 0, 0);
    is.cv = cv;
  }

  // Boulders, stones and pebbles on the island's tiles inside the band.
  function _detail(tc, is, cStart, cEnd, rStart, rEnd) {
    const ca = Math.max(cStart, is.c0), cb = Math.min(cEnd - 1, is.c1);
    const ra = Math.max(rStart, is.r0), rb = Math.min(rEnd - 1, is.r1);
    for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) {
      if (_lab[r * COLS + c] !== is.id) continue;
      // Pebbles
      for (let p = 0; p < 4; p++) {
        const x = (c + _hash(c, r, 20 + p)) * TILE, y = (r + _hash(c, r, 30 + p)) * TILE;
        tc.fillStyle = _hash(c, r, 40 + p) > 0.5 ? 'rgba(170,164,150,0.6)' : 'rgba(46,42,38,0.5)';
        const s = 1.2 + _hash(c, r, 50 + p) * 1.8;
        tc.fillRect(x, y, s, s);
      }
      // A stone on some tiles, the odd boulder
      const s = LandCover.stoneSpec(c, r);                       // land_cover.js: one rule for
      if (s) LandCover.stone(tc, c, r, s[0], s[1]);              // drawing and the wildlife
    }
  }

  return {
    // Background-cache key (render_main_loop.js): changes when the islands do.
    version() { _ensure(); return _away() ? 0 : _ver; },
    isIsland(c, r) { return !_away() && isIsland(c, r); },

    draw(tc, cStart, cEnd, rStart, rEnd, lod) {
      if (_away() || !_ensure() || !_isles.length) return;
      for (const is of _isles) {
        if (is.c1 + 1 < cStart || is.c0 - 1 > cEnd || is.r1 + 1 < rStart || is.r0 - 1 > rEnd) continue;
        if (!is.cv) _bake(is);
        tc.save();
        tc.imageSmoothingEnabled = true;
        tc.imageSmoothingQuality = 'low';
        tc.drawImage(is.cv, (is.c0 - 1) * TILE, (is.r0 - 1) * TILE, is.cv.width * TILE, is.cv.height * TILE);
        tc.restore();
        if (lod > 0) _detail(tc, is, cStart, cEnd, rStart, rEnd);
      }
    },
  };
})();
