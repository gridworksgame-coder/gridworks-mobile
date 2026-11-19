/* ═══════════════════════════════════════════════════════════════════
   LAND COVER
   What lies on the ground that the grass colour alone can't show:
     • Shores. Every stretch of lake and river bank is one of
         beach  — a strip of sand and shingle on gentle, low shores,
         reeds  — a reed bed on the lowest, wettest margins,
         rock   — a stony shore where the land comes down high or steep,
       or plain grass. The choice follows a slow noise along the shore
       plus the terrain height, so a bank keeps one character for a good
       stretch before it changes.
     • High ground. Stones and the odd boulder scattered over the rocky
       uplands that TerrainSystem.biome() marks out.
   Islands have their own rock (island_ground.js) and are left alone.

   Shores are found from the live water once per water change (a new
   world, a load, a dam) and kept per tile. Everything is baked into the
   cached ground bitmap with the grass, so it costs nothing per frame.
   ═══════════════════════════════════════════════════════════════════ */
const LandCover = (() => {
  const NONE = 0, BEACH = 1, REEDS = 2, ROCK = 3;
  const DEPTH = 3;                 // shore band, in tiles from the water
  let _sig = null, _ver = 0;
  let _type = null, _dist = null;  // Uint8Array per tile

  const _hash = (c, r, n) => {
    const x = Math.sin(c * 127.1 + r * 311.7 + n * 74.3) * 43758.5453;
    return x - Math.floor(x);
  };
  // Smooth value noise on a `cell`-tile lattice.
  const _vn = (c, r, cell, salt) => {
    const x = c / cell, y = r / cell, x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = _hash(x0, y0, salt), b = _hash(x0 + 1, y0, salt), c2 = _hash(x0, y0 + 1, salt), d = _hash(x0 + 1, y0 + 1, salt);
    const top = a + (b - a) * sx;
    return top + ((c2 + (d - c2) * sx) - top) * sy;
  };
  const _away = () => typeof ContractSystem !== 'undefined' && !!ContractSystem.isAway?.();
  const _water = (c, r) => WaterSystem.isWater(c, r);

  // ── Shores ─────────────────────────────────────────────────────────
  function _compute() {
    const N = COLS * ROWS;
    const dist = new Uint8Array(N), type = new Uint8Array(N);
    let front = [];
    const DC = [1, -1, 0, 0, 1, 1, -1, -1], DR = [0, 0, 1, -1, 1, -1, 1, -1];
    for (const key of WaterSystem.getWaterTiles()) {
      const k = key.indexOf(',');
      const c = +key.slice(0, k), r = +key.slice(k + 1);
      for (let d = 0; d < 4; d++) {
        const nc = c + DC[d], nr = r + DR[d];
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || _water(nc, nr)) continue;
        const i = nr * COLS + nc;
        if (!dist[i]) { dist[i] = 1; front.push(i); }
      }
    }
    for (let step = 2; step <= DEPTH; step++) {
      const next = [];
      for (const i of front) {
        const c = i % COLS, r = (i / COLS) | 0;
        for (let d = 0; d < 8; d++) {
          const nc = c + DC[d], nr = r + DR[d];
          if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
          const j = nr * COLS + nc;
          if (dist[j] || _water(nc, nr)) continue;
          dist[j] = step; next.push(j);
        }
      }
      front = next;
    }
    const isle = typeof IslandGround !== 'undefined' ? IslandGround.isIsland : () => false;
    for (let i = 0; i < N; i++) {
      if (!dist[i]) continue;
      const c = i % COLS, r = (i / COLS) | 0;
      if (isle(c, r)) continue;
      const h = TerrainSystem.elevAt(c, r);
      const n = _vn(c, r, 16, 11);
      let t = NONE;
      if (h > 0.46 || n > 0.76) t = ROCK;
      else if (n < 0.34 && h < 0.3) t = REEDS;
      else if (n > 0.52 && n < 0.7) t = BEACH;
      if (t === REEDS && dist[i] > 2) t = NONE;
      type[i] = t;
    }
    _type = type; _dist = dist; _ver++;
  }

  function _ensure() {
    if (typeof WaterSystem === 'undefined' || typeof TerrainSystem === 'undefined') return false;
    if (typeof IslandGround !== 'undefined') IslandGround.version();   // islands first: shores skip them
    const sig = WaterSystem.getWaterTiles().size + ':' + TerrainSystem.version();
    if (sig !== _sig) { _sig = sig; _compute(); }
    return true;
  }

  const COL = { [BEACH]: [144, 126, 86], [REEDS]: [50, 62, 32], [ROCK]: [82, 78, 70] };
  const ALPHA = { [BEACH]: [0, 0.95, 0.6, 0.22], [REEDS]: [0, 0.8, 0.35, 0], [ROCK]: [0, 0.9, 0.55, 0.2] };
  // Bare rock over the high ground. Painted over the grass (not just
  // tinted into it) so the meadow texture and its flower specks give way
  // to stone, fading in with TerrainSystem.biome's rock weight.
  const UPLAND = [80, 76, 68];
  function _px(i, c, r) {
    const t = _type[i];
    const a = t ? ALPHA[t][_dist[i]] : 0;
    const rock = TerrainSystem.biome(c, r)[2];
    const ra = rock > 0.15 ? Math.min(0.88, (rock - 0.15) * 1.6) : 0;
    if (ra > a) return [UPLAND, ra];
    return a > 0 ? [COL[t], a] : null;
  }

  // ── Stones (shared with the rocky shores, the uplands and islands) ─
  // Mossy rocks rendered straight down in Blender from Poly Haven's
  // rock_moss_set_02 (blender stuff/render_rocks.py), lit from the upper
  // left like every sprite, so they are never rotated. Until they have
  // loaded a stone is drawn as a lit polygon instead; version() changes as
  // they arrive so the ground is baked again with the real rocks.
  const ROCK_FRAME = 1.4;
  let _rocksLoaded = 0;
  const _rockSprites = [1, 2, 3, 4, 5, 6, 7].map(k => {
    const im = new Image();
    im.onload = () => { _rocksLoaded++; };
    im.src = `img/rock_moss_${k}.png`;
    return im;
  });
  // Where a stone sits and how big it is, from the tile's own hash, so it
  // never moves between redraws: centre in world px and the rock's width.
  function _stoneGeom(c, r, salt, big) {
    const H = n => _hash(c, r, salt + n);
    return {
      x: (c + 0.2 + H(1) * 0.6) * TILE, y: (r + 0.2 + H(2) * 0.6) * TILE,
      w: TILE * (big ? 0.69 + H(3) * 0.42 : 0.17 + H(3) * 0.28),
    };
  }
  // Which tiles carry a stone: [salt, big] or null. The one rule for the
  // shores, the uplands and the islands, read both to draw the stones
  // (here and in island_ground.js) and to keep animals out of them
  // (rocksNear), so what you see is what they walk round.
  function _stoneSpec(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS || _water(c, r)) return null;
    if (typeof IslandGround !== 'undefined' && IslandGround.isIsland(c, r)) {
      const roll = _hash(c, r, 60);
      return roll <= 0.3 ? [60, roll < 0.05] : null;
    }
    const i = r * COLS + c, t = _type[i], d = _dist[i];
    if (t === BEACH && d <= 2) return _hash(c, r, 240) < 0.06 ? [250, false] : null;
    if (t === REEDS) return null;
    if (t === ROCK && d <= 2) {
      const roll = _hash(c, r, 400);
      return roll < (d === 1 ? 0.28 : 0.1) ? [410, roll < 0.04] : null;
    }
    const rock = TerrainSystem.biome(c, r)[2];
    if (rock <= 0.2) return null;
    const roll = _hash(c, r, 500);
    return roll < rock * 0.12 ? [510, rock > 0.5 && roll < rock * 0.025] : null;
  }
  // Rock footprints by tile, for the animals: { x, y, rad } in world px, or
  // null. Worked out on demand, kept until the shores or terrain change.
  const _rockCache = new Map();
  let _rockCacheVer = null;
  function _rockAt(c, r) {
    const key = c * 100000 + r;
    let v = _rockCache.get(key);
    if (v !== undefined) return v;
    v = null;
    const s = _stoneSpec(c, r);
    if (s) {
      const g = _stoneGeom(c, r, s[0], s[1]);
      if (g.w >= TILE * 0.25) v = { x: g.x, y: g.y, rad: g.w * 0.42 };   // pebbles are stepped over
    }
    if (_rockCache.size > 50000) _rockCache.clear();
    _rockCache.set(key, v);
    return v;
  }

  // A stone with its soft contact shadow down and right.
  function stone(tc, c, r, salt, big) {
    const H = n => _hash(c, r, salt + n);
    const { x: sx, y: sy, w: rock } = _stoneGeom(c, r, salt, big);
    const im = _rockSprites[Math.floor(H(7) * _rockSprites.length)];
    if (im.complete && im.naturalWidth) {
      // The rock spans 1/ROCK_FRAME of the image; the rest holds its baked
      // shadow (scripts/render_rocks.py, FRAME).
      const disp = rock * ROCK_FRAME;
      tc.drawImage(im, sx - disp / 2, sy - disp / 2, disp, disp);
      return;
    }
    const sz = TILE * (big ? 0.3 + H(3) * 0.22 : 0.07 + H(3) * 0.13);
    const pts = [];
    for (let q = 0; q < 7; q++) {
      const ang = (q / 7) * Math.PI * 2 + H(4) * 1.2, d = sz * (0.7 + H(10 + q) * 0.45);
      pts.push([sx + Math.cos(ang) * d, sy + Math.sin(ang) * d * 0.85]);
    }
    const poly = (dx, dy) => { tc.beginPath(); pts.forEach(([x, y], q) => q ? tc.lineTo(x + dx, y + dy) : tc.moveTo(x + dx, y + dy)); tc.closePath(); };
    poly(sz * 0.22, sz * 0.3); tc.fillStyle = 'rgba(14,16,18,0.38)'; tc.fill();
    const tone = H(5);
    const base = tone > 0.66 ? [134, 128, 116] : tone > 0.33 ? [108, 102, 92] : [84, 80, 74];
    poly(0, 0); tc.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; tc.fill();
    tc.beginPath(); tc.moveTo(sx, sy);
    for (let q = 3; q <= 6; q++) tc.lineTo(pts[q][0], pts[q][1]);
    tc.closePath(); tc.fillStyle = `rgba(${base[0] + 60},${base[1] + 58},${base[2] + 52},0.4)`; tc.fill();
    if (big && H(6) > 0.5) {                                                       // lichen
      tc.beginPath(); tc.ellipse(sx - sz * 0.15, sy - sz * 0.2, sz * 0.3, sz * 0.2, 0.5, 0, Math.PI * 2);
      tc.fillStyle = 'rgba(150,160,80,0.45)'; tc.fill();
    }
  }

  // A reed clump seen from above: blades fanning out from the root, the
  // odd brown cattail head.
  function _reeds(tc, c, r, salt) {
    const H = n => _hash(c, r, salt + n);
    const x = (c + 0.15 + H(1) * 0.7) * TILE, y = (r + 0.15 + H(2) * 0.7) * TILE;
    const n = 6 + Math.floor(H(3) * 4);
    tc.lineCap = 'round'; tc.lineWidth = 1.1;
    for (let b = 0; b < n; b++) {
      const a = H(10 + b) * Math.PI * 2, len = TILE * (0.14 + H(20 + b) * 0.2);
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      tc.strokeStyle = H(30 + b) > 0.35 ? 'rgba(92,118,54,0.85)' : 'rgba(150,138,86,0.85)';
      tc.beginPath(); tc.moveTo(x, y); tc.quadraticCurveTo((x + ex) / 2 + Math.sin(a) * 2, (y + ey) / 2 - Math.cos(a) * 2, ex, ey); tc.stroke();
      if (H(40 + b) > 0.82) {
        tc.fillStyle = 'rgba(78,50,30,0.95)';
        tc.beginPath(); tc.ellipse(ex, ey, 2.2, 1.2, a, 0, Math.PI * 2); tc.fill();
      }
    }
  }

  function _detail(tc, c0, c1, r0, r1) {
    const isle = typeof IslandGround !== 'undefined' ? IslandGround.isIsland : () => false;
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
      if (_water(c, r) || isle(c, r)) continue;                                   // islands draw their own
      const i = r * COLS + c, t = _type[i], d = _dist[i];
      const spec = _stoneSpec(c, r);
      if (spec) stone(tc, c, r, spec[0], spec[1]);
      if (t === BEACH && d <= 2) {
        for (let p = 0; p < 4; p++) {                                              // grain, shingle and shells
          const x = (c + _hash(c, r, 200 + p)) * TILE, y = (r + _hash(c, r, 210 + p)) * TILE;
          const k = _hash(c, r, 220 + p);
          tc.fillStyle = k > 0.75 ? 'rgba(226,218,198,0.7)' : k > 0.4 ? 'rgba(176,160,122,0.6)' : 'rgba(84,76,62,0.5)';
          const s = 1.2 + _hash(c, r, 230 + p) * 1.8;
          tc.fillRect(x, y, s, s);
        }
        continue;
      }
      if (t === REEDS) {
        const n = d === 1 ? 3 : (_hash(c, r, 300) < 0.5 ? 1 : 0);
        for (let k = 0; k < n; k++) _reeds(tc, c, r, 310 + k * 50);
        continue;
      }
      if (t === ROCK && d <= 2) continue;
      // Uplands: grit scattered over the rocky high ground (the stones
      // themselves come from _stoneSpec above).
      const rock = TerrainSystem.biome(c, r)[2];
      if (rock > 0.2) {
        for (let p = 0; p < 3; p++) {
          if (_hash(c, r, 520 + p) > rock) continue;
          tc.fillStyle = _hash(c, r, 530 + p) > 0.5 ? 'rgba(160,154,140,0.5)' : 'rgba(44,40,36,0.45)';
          tc.fillRect((c + _hash(c, r, 540 + p)) * TILE, (r + _hash(c, r, 550 + p)) * TILE, 1.6, 1.6);
        }
      }
    }
  }

  let _cv = null;
  return {
    BEACH, REEDS, ROCK, stone,
    // [salt, big] for the stone on a tile, or null (island_ground.js draws
    // its islands' stones from this too).
    stoneSpec(c, r) { return _away() || !_ensure() ? null : _stoneSpec(c, r); },
    // The rocks (not pebbles) within `reach` world px of (x, y), as
    // { x, y, rad } in world px — what the wildlife walks round.
    rocksNear(x, y, reach) {
      if (_away() || !_ensure()) return [];
      const v = _ver + ':' + TerrainSystem.version();
      if (v !== _rockCacheVer) { _rockCache.clear(); _rockCacheVer = v; }
      const out = [];
      const c0 = Math.floor((x - reach) / TILE), c1 = Math.floor((x + reach) / TILE);
      const r0 = Math.floor((y - reach) / TILE), r1 = Math.floor((y + reach) / TILE);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const k = _rockAt(c, r);
        if (k && Math.hypot(k.x - x, k.y - y) <= reach + k.rad) out.push(k);
      }
      return out;
    },
    // Background-cache key (render_main_loop.js).
    version() { _ensure(); return _away() ? 0 : _ver + ':' + _rocksLoaded; },
    // Shore type of a tile (NONE when it isn't a beach, reed bed or stony shore).
    shoreType(c, r) {
      if (_away() || !_ensure() || c < 0 || r < 0 || c >= COLS || r >= ROWS) return NONE;
      return _type[r * COLS + c];
    },
    // How freely flowers and other green clutter grow here, 1 … 0: thinning
    // as the uplands turn to stone (gone by the time the rock shows through
    // the grass properly) and nothing on sand or a stony bank.
    growth(c, r) {
      if (_away() || !_type || c < 0 || r < 0 || c >= COLS || r >= ROWS) return 1;
      const i = r * COLS + c, t = _type[i];
      if ((t === BEACH || t === ROCK) && _dist[i] <= 2) return 0;
      const rock = TerrainSystem.biome(c, r)[2];
      return rock <= 0.1 ? 1 : Math.max(0, 1 - (rock - 0.1) * 3.4);
    },
    // A loaded rock sprite (img/rock_moss_*.png) picked by `u` in 0..1, or
    // null while they load; and the image-to-rock size ratio to draw it at.
    rockSprite(u) {
      const im = _rockSprites[Math.min(_rockSprites.length - 1, Math.floor(u * _rockSprites.length))];
      return im.complete && im.naturalWidth ? im : null;
    },
    ROCK_FRAME,
    // Bare ground — no flowers or leaf litter: sand, stony shore, rocky uplands.
    bare(c, r) {
      if (_away() || !_type || c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
      const i = r * COLS + c, t = _type[i];
      if ((t === BEACH || t === ROCK) && _dist[i] <= 2) return true;
      return TerrainSystem.biome(c, r)[2] > 0.45;
    },

    draw(tc, cStart, cEnd, rStart, rEnd, lod) {
      if (_away() || !_ensure()) return;
      const c0 = Math.max(0, cStart - 1), r0 = Math.max(0, rStart - 1);
      const c1 = Math.min(COLS, cEnd + 1), r1 = Math.min(ROWS, rEnd + 1);
      const w = c1 - c0, h = r1 - r0;
      if (w <= 0 || h <= 0) return;
      // Shore colour, one pixel per tile, stretched smooth over the band.
      // A water tile next to a shore takes that shore's colour, so the
      // smoothing doesn't fade the sand out just short of the water's edge
      // (the water is painted over it anyway).
      if (!_cv) _cv = document.createElement('canvas');
      if (_cv.width < w || _cv.height < h) { _cv.width = Math.max(_cv.width, w); _cv.height = Math.max(_cv.height, h); }
      const g = _cv.getContext('2d', { willReadFrequently: true });
      const img = g.createImageData(w, h), px = img.data;
      let any = false;
      for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
        let p = null;
        if (_water(c, r)) {
          for (let d = 0; d < 4 && !p; d++) {
            const nc = c + (d === 0) - (d === 1), nr = r + (d === 2) - (d === 3);
            if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
            const j = nr * COLS + nc;
            if (_dist[j] === 1 && _type[j]) p = _px(j, nc, nr);
          }
        } else p = _px(r * COLS + c, c, r);
        if (!p) continue;
        const o = ((r - r0) * w + (c - c0)) * 4;
        const v = (_hash(c, r, 90) - 0.5) * 14;                                   // a little per-tile mottling
        px[o] = p[0][0] + v; px[o + 1] = p[0][1] + v; px[o + 2] = p[0][2] + v * 0.8; px[o + 3] = p[1] * 255;
        any = true;
      }
      if (any) {
        g.putImageData(img, 0, 0);
        tc.save();
        tc.imageSmoothingEnabled = true;
        tc.imageSmoothingQuality = 'low';
        tc.drawImage(_cv, 0, 0, w, h, c0 * TILE, r0 * TILE, w * TILE, h * TILE);
        tc.restore();
      }
      if (lod > 0) _detail(tc, Math.max(0, cStart), Math.min(COLS, cEnd), Math.max(0, rStart), Math.min(ROWS, rEnd));
    },
  };
})();
