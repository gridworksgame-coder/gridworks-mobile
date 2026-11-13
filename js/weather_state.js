/* ═══════════════════════════════════════════════════════════════════
   WEATHER STATE
   Cloud cover and wind state tracking.
   ═══════════════════════════════════════════════════════════════════ */

const CloudState = (() => {
  let cover  = 0.35;   // 0=clear, 1=overcast; starts with visible cloud cover
  let target = 0.35;
  let eventTimer = 0;   // forced cover duration
  return {
    get factor() { return 1 - cover * 0.45; },
    get cover()  { return cover; },
    triggerBurst(intensity, duration) {
      target     = intensity;
      eventTimer = duration;
    },
    load(savedCover, savedTarget) {
      cover  = savedCover  || 0.05;
      target = savedTarget || 0.05;
    },
    get target() { return target; },
    tick(dt) {
      if (eventTimer > 0) {
        eventTimer -= dt;
        if (eventTimer <= 0) {
          target = Math.random() * 0.15;   // clear after event
          WindState.triggerCalm();
        }
      } else {
        if (Math.random() < 0.003) target = 0.2 + Math.random() * 0.65;
      }
      cover += (target - cover) * Math.min(1, dt * 0.08);
      cover  = Math.max(0, Math.min(1, cover));
    },
  };
})();

/* Frost and snow on the ground. What is drawn is `coverage` (0 bare, 1
   buried), the deepest of three things:
     • rime    — a cold snap's frost, eased in and out (about 0.4);
     • floor   — the snow that lies through midwinter (Seasons.frostFloor);
     • snow    — what has actually FALLEN. It builds for as long as it is
                 snowing, at the event's rate (a blizzard lays it about
                 twice as fast as a snowfall, and a long one leaves more
                 than a short one), stacks from one fall to the next, and
                 then melts at a rate set by the temperature: not at all
                 below MELT_ABOVE or outside the middle of the day
                 (MELT_FROM to MELT_TO), so it lies through every night and
                 whole cold days, and goes slowly through mild afternoons:
                 late snow is still on the ground on the first morning of
                 spring. Saved with the world.

   It is drawn as a blanket, not per tile: a warped, world-anchored noise
   field says how readily each spot holds snow, and `coverage` sets how far
   down that field the snow reaches, so cover arrives as scattered patches in
   the hollows, the patches grow and join, and the last bare ground closes
   over. Snow is opaque: less of it is smaller patches fraying into flecks,
   never a see-through layer. It carries drifts (blue-grey hollows, white
   crests), wind ripples and a fine grain, it lies thinner toward a zone's
   streets and lots, and it sits under water, buildings and trees.
   The field is baked into chunk bitmaps at a resolution that follows the
   zoom (a third of a tile to a twelfth), the chunks on screen are put
   together into one bitmap and that is drawn smoothed, so a
   frame costs a handful of drawImage calls. A chunk's field (the noise) is
   worked out once, and again only when a zone has changed; as the cover
   moves a step, each chunk is repainted from its field, a cheap threshold,
   so the whole view moves with it. */
const FrostSystem = (() => {
  let coverage = 0;   // 0 = bare ground, 1 = buried: what is drawn
  let target   = 0;   // rime a cold snap is asking for
  let rime     = 0;   // rime actually on the ground
  let snow     = 0;   // fallen snow, 0..SNOW_CAP (above 1 is depth in reserve: it takes longer to melt off)
  let falling  = 0;   // snow being laid right now, per second (0 when it isn't snowing)
  let rimeOnly = 0;   // 0..1, how much of the cover is a cold snap's rime alone (drawn fainter)
  // Where in the noise field the cover is read from. Rolled afresh each time
  // frost or snow forms on bare ground, so no two cold snaps or snowfalls lie
  // in the same pattern, and saved, so a reload shows the same ground.
  const _rollPattern = () => Math.floor(Math.random() * 200000);
  let patX = _rollPattern(), patY = _rollPattern();
  let bare = false;   // the ground has gone fully bare since the pattern was rolled
  const RIME_ALPHA   = 0.16;     // a cold snap's thick frost patches are drawn at this opacity (over ground already frosted, see render); real snow at full
  const SNOW_CAP     = 1.3;
  const MELT_ABOVE   = 8;         // °C: colder than this, fallen snow doesn't melt
  const MELT_PER_DEG = 0.000035;  // depth per second per °C above that (a mild 18°C afternoon clears ~0.018 a game hour, so
                                  // one snowfall's worth takes most of a mild day to go; it was three times this)
  const MELT_FROM    = 9, MELT_TO = 19;   // hours of the day it melts between (see tick)
  const SUBLIME      = 0.00001;   // and a trickle is lost whatever the weather

  // Cheap deterministic per-tile hash — same tile always gets the same
  // value, so frost patches don't shimmer/jitter as the camera moves.
  function _hash(gx, gy) {
    let h = (gx * 1619 + gy * 31337 + 7919) & 0x7fffffff;
    h = ((h >> 16) ^ h) * 0x45d9f3b | 0;
    h = ((h >> 16) ^ h) & 0x7fffffff;
    return h / 0x7fffffff;
  }

  // Smooth 0..1 value noise on a `cell`-unit lattice, from the tile hash above.
  function _noise(x, y, cell) {
    const gx = x / cell, gy = y / cell, x0 = Math.floor(gx), y0 = Math.floor(gy);
    const fx = gx - x0, fy = gy - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = _hash(x0, y0), b = _hash(x0 + 1, y0), c = _hash(x0, y0 + 1), d = _hash(x0 + 1, y0 + 1);
    const top = a + (b - a) * sx;
    return top + ((c + (d - c) * sx) - top) * sy;
  }

  // Fallen leaves: one tile of scattered leaf shapes, repeated across the
  // world as a pattern (it is anchored to world space, so it stays put under
  // the camera). Drifts of them here and there rather than an even sprinkle.
  let _litter = null;
  function _leafLitter(ctx) {
    if (_litter) return _litter;
    const SZ = 560, c = document.createElement('canvas');
    c.width = c.height = SZ;
    const g = c.getContext('2d');
    const COLS_L = ['#c8521e', '#d8842a', '#e0a832', '#a8301c', '#b8641e', '#8a4a1c', '#d8b040'];
    let seed = 20261;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const leaf = (x, y) => {
      const r = 1.3 + rnd() * 1.5;
      g.fillStyle = COLS_L[Math.floor(rnd() * COLS_L.length)];
      g.globalAlpha = 0.7 + rnd() * 0.3;
      // drawn wrapped, so the tile repeats without a seam
      for (const ox of [0, SZ, -SZ]) for (const oy of [0, SZ, -SZ]) {
        if (x + ox < -6 || x + ox > SZ + 6 || y + oy < -6 || y + oy > SZ + 6) continue;
        g.beginPath(); g.ellipse(x + ox, y + oy, r, r * 0.55, rnd() * 3.14, 0, Math.PI * 2); g.fill();
      }
    };
    for (let i = 0; i < 260; i++) leaf(rnd() * SZ, rnd() * SZ);                    // the even scatter
    for (let d = 0; d < 16; d++) {                                                  // and the drifts
      const dx = rnd() * SZ, dy = rnd() * SZ, n = 16 + Math.floor(rnd() * 26), spread = 14 + rnd() * 26;
      for (let i = 0; i < n; i++) { const a = rnd() * 6.283, q = Math.pow(rnd(), 0.6) * spread; leaf(dx + Math.cos(a) * q, dy + Math.sin(a) * q * 0.7); }
    }
    g.globalAlpha = 1;
    return (_litter = ctx.createPattern(c, 'repeat'));
  }

  // Hoar frost: a tile of fine ice crystals, the rime caught on every blade
  // of grass. Short bright needles at all angles, some with a side spur, and
  // a scatter of glints, mostly white with a cold blue cast. Two of these at
  // different sizes are laid over each other (see render), so the repeat
  // never lines up.
  const _rimePats = {};
  function _rimeCrystals(ctx, SZ, seed0) {
    if (_rimePats[SZ]) return _rimePats[SZ];
    const c = document.createElement('canvas');
    c.width = c.height = SZ;
    const g = c.getContext('2d');
    let seed = seed0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    g.lineCap = 'round';
    const wrap = (fn, x, y) => { for (const ox of [0, SZ, -SZ]) for (const oy of [0, SZ, -SZ]) if (x + ox > -4 && x + ox < SZ + 4 && y + oy > -4 && y + oy < SZ + 4) fn(x + ox, y + oy); };
    for (let i = 0; i < SZ * SZ / 34; i++) {
      const x = rnd() * SZ, y = rnd() * SZ, a = rnd() * Math.PI, len = 0.8 + rnd() * 1.9, al = 0.45 + rnd() * 0.5;
      const spur = rnd() < 0.35, sa = a + (rnd() < 0.5 ? 1 : -1) * (0.9 + rnd() * 0.4);
      g.strokeStyle = rnd() < 0.7 ? `rgba(246,250,255,${al.toFixed(2)})` : `rgba(206,222,240,${al.toFixed(2)})`;
      g.lineWidth = 0.35 + rnd() * 0.35;
      wrap((px, py) => {
        const dx = Math.cos(a) * len / 2, dy = Math.sin(a) * len / 2;
        g.beginPath(); g.moveTo(px - dx, py - dy); g.lineTo(px + dx, py + dy);
        if (spur) { g.moveTo(px, py); g.lineTo(px + Math.cos(sa) * len * 0.45, py + Math.sin(sa) * len * 0.45); }
        g.stroke();
      }, x, y);
    }
    for (let i = 0; i < SZ * SZ / 90; i++) {                                    // glints
      const x = rnd() * SZ, y = rnd() * SZ, r = 0.3 + rnd() * 0.45;
      g.fillStyle = `rgba(255,255,255,${(0.6 + rnd() * 0.4).toFixed(2)})`;
      wrap((px, py) => { g.beginPath(); g.arc(px, py, r, 0, Math.PI * 2); g.fill(); }, x, y);
    }
    return (_rimePats[SZ] = ctx.createPattern(c, 'repeat'));
  }

  // Spring wildflowers, placed tile by tile across the whole map rather than
  // as a repeating tile, so no two stretches of meadow look alike. A slow
  // noise field decides where they grow — thick meadows in some places, a
  // light scatter or almost nothing in others — and a second picks which
  // flower a patch is mostly made of (a run of buttercups, a drift of
  // daisies). Each world has its own layout: the fields are offset by a seed
  // from the city's name and where City Hall stands (_flowerSeed), and
  // nothing is saved, so any world — new or old — gets it as it loads. Drawn
  // into FL_CHUNK-tile canvases once, then just stamped.
  const FL_PETALS = ['#ffffff', '#f6e04a', '#f2b8d4', '#b08ae0', '#8ab8f0'];
  const FL_CHUNK = 16, FL_MAX_CHUNKS = 36, FL_BAKES_PER_FRAME = 3, FL_CHECKS_PER_FRAME = 8;
  // Zoomed out, chunks are baked at half resolution (the flowers are a pixel
  // or two there anyway), so a view of 70+ chunks costs a quarter the memory.
  const FL_LOW_ZOOM = 0.6;
  const _flChunks = new Map();       // "scale|cx,cy" -> { canvas, mask, ver }, least recently used first
  let _flSeedKey = null, _flOX = 0, _flOY = 0;
  function _flowerSeed() {
    const name = typeof CityInfo !== 'undefined' ? CityInfo.getCityName() : '';
    const hall = typeof ZoneSystem !== 'undefined' && ZoneSystem.govZoneCentre ? ZoneSystem.govZoneCentre() : null;
    const key = name + '|' + (hall ? Math.round(hall.c) + ',' + Math.round(hall.r) : '');
    if (key !== _flSeedKey) {
      _flSeedKey = key; _flChunks.clear();
      let h = 2166136261;
      for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
      _flOX = (h % 9973) * 97; _flOY = ((h >>> 12) % 9967) * 89;   // where in the noise this world's map sits
    }
  }
  // Flowers grow on open grass only. This layer is drawn over the zones and
  // roads (with the frost, under the entities), so without this they lay
  // across plazas, car parks and the road. Not on a zone (its paving and
  // lawns are its own), not where anything stands (a road, a building, a
  // pole), and not on water. One byte per tile of a chunk.
  // getZoneAt, not the bare rects: a zone's ring road and pavement are drawn
  // in its padding, a tile outside the rect, and flowers landed on them.
  function _flMask(cx, cy) {
    const c0 = cx * FL_CHUNK, r0 = cy * FL_CHUNK;
    const zs = typeof ZoneSystem !== 'undefined' ? ZoneSystem : null;
    const water = typeof WaterSystem !== 'undefined' && WaterSystem.isWater;
    const m = new Uint8Array(FL_CHUNK * FL_CHUNK);
    for (let j = 0; j < FL_CHUNK; j++) for (let i = 0; i < FL_CHUNK; i++) {
      const c = c0 + i, r = r0 + j;
      if (!GridManager.inBounds(c, r) || GridManager.getEntity(c, r)) continue;
      if (zs && ((zs.getZoneAt && zs.getZoneAt(c, r)) || (zs.isInGovZone && zs.isInGovZone(c, r)))) continue;
      if (water && WaterSystem.isWater(c, r)) continue;
      m[j * FL_CHUNK + i] = 1;
    }
    return m;
  }
  const _flSameMask = (a, b) => { for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false; return true; };
  // What the world looked like when a chunk's mask was taken: when either
  // count moves, the chunks on screen re-check their mask (and rebake only
  // if it actually changed).
  const _flWorldVer = () => (typeof ZoneSystem !== 'undefined' && ZoneSystem.getVersion ? ZoneSystem.getVersion() : 0) + '|' +
                            (typeof EntityRegistry !== 'undefined' && EntityRegistry.getTopologyVersion ? EntityRegistry.getTopologyVersion() : 0);
  function _bakeFlowers(cx, cy, scale, mask) {
    const SZ = FL_CHUNK * TILE * scale, c = document.createElement('canvas');
    c.width = c.height = SZ;
    const g = c.getContext('2d');
    g.scale(scale, scale);
    for (let j = 0; j < FL_CHUNK; j++) for (let i = 0; i < FL_CHUNK; i++) {
      if (!mask[j * FL_CHUNK + i]) continue;
      const col = cx * FL_CHUNK + i, row = cy * FL_CHUNK + j;
      const wx = col * TILE + _flOX, wy = row * TILE + _flOY;
      // How meadowy this spot is: broad patches with a finer ragged edge.
      const m = _noise(wx, wy, TILE * 11) * 0.75 + _noise(wx + 4111, wy + 2777, TILE * 3.5) * 0.25;
      const lam = 0.1 + Math.max(0, m - 0.55) * 11;           // flowers expected on this tile
      const base = Math.floor(lam), n = base + (_hash(col * 3 + 17, row * 5 + 11) < lam - base ? 1 : 0);
      if (!n) continue;
      // What the patch is mostly made of; a few strays of anything else.
      const kind = Math.floor(_noise(wx + 9001, wy + 7003, TILE * 8) * FL_PETALS.length * 0.999);
      for (let k = 0; k < n; k++) {
        const h1 = _hash(col * 7 + k * 131, row * 11 + k * 71), h2 = _hash(col * 13 + k * 37, row * 3 + k * 197);
        const h3 = _hash(col * 19 + k * 59, row * 23 + k * 113);
        const x = (i + h1) * TILE, y = (j + h2) * TILE, r = 0.9 + h3 * 0.8;
        const petal = h3 < 0.72 ? FL_PETALS[kind] : FL_PETALS[Math.floor(_hash(col + k * 3, row - k * 5) * FL_PETALS.length) % FL_PETALS.length];
        g.fillStyle = petal;
        for (let p = 0; p < 5; p++) { const a = p * 1.2566 + h1 * 6; g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2); g.fill(); }
        g.fillStyle = petal === '#f6e04a' ? '#c8801e' : '#f0c030';
        g.beginPath(); g.arc(x, y, r * 0.55, 0, Math.PI * 2); g.fill();
      }
    }
    return { canvas: c, mask, ver: _flWorldVer() };
  }
  // Stamp the flower chunks over the visible world rect (camera transform on).
  function _drawWildflowers(ctx, x0, y0, x1, y1) {
    _flowerSeed();
    const size = FL_CHUNK * TILE;
    const scale = Camera.zoom > FL_LOW_ZOOM ? 1 : 0.5, other = scale === 1 ? 0.5 : 1;
    const cx0 = Math.max(0, Math.floor(x0 / size)), cx1 = Math.min(Math.ceil(COLS / FL_CHUNK) - 1, Math.floor(x1 / size));
    const cy0 = Math.max(0, Math.floor(y0 / size)), cy1 = Math.min(Math.ceil(ROWS / FL_CHUNK) - 1, Math.floor(y1 / size));
    // Never evict a chunk that is on screen: when the view held more chunks
    // than the cache, each frame's bakes pushed out visible ones, and the
    // flowers flashed in and out at max zoom-out.
    const cap = Math.max(FL_MAX_CHUNKS, (cx1 - cx0 + 1) * (cy1 - cy0 + 1) + 8);
    const ver = _flWorldVer();
    let baked = 0, checked = 0;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const key = scale + '|' + cx + ',' + cy;
      let ch = _flChunks.get(key);
      if (ch) {
        _flChunks.delete(key); _flChunks.set(key, ch);                    // most recently used last
        // Something was built, cleared or rezoned somewhere: re-check this
        // chunk's ground, a few chunks a frame, and keep drawing the old
        // bake until a new one is due.
        if (ch.ver !== ver && checked < FL_CHECKS_PER_FRAME) {
          checked++;
          const mask = _flMask(cx, cy);
          if (_flSameMask(mask, ch.mask)) ch.ver = ver;
          else if (baked < FL_BAKES_PER_FRAME) { ch = _bakeFlowers(cx, cy, scale, mask); baked++; _flChunks.set(key, ch); }
        }
      } else if (baked < FL_BAKES_PER_FRAME) {
        ch = _bakeFlowers(cx, cy, scale, _flMask(cx, cy)); baked++;
        _flChunks.set(key, ch);
        while (_flChunks.size > cap) _flChunks.delete(_flChunks.keys().next().value);
      } else {
        // The rest fill in over the next frames; meanwhile the same chunk at
        // the other resolution, if it is still cached, stands in for it.
        ch = _flChunks.get(other + '|' + cx + ',' + cy);
        if (!ch) continue;
      }
      ctx.drawImage(ch.canvas, cx * size, cy * size, size, size);
    }
  }

  // Detail follows the zoom. Every chunk is N samples a side whatever its
  // tier, so a bake costs the same everywhere: zoomed out a chunk covers a
  // lot of ground coarsely, zoomed in a little of it finely, and a patch's
  // edge stays about a screen pixel or two wide rather than smearing out as
  // the view closes in.
  const N           = 192;                       // samples a side per chunk
  const TIER_SUB    = [3, 6, 12];                // samples per tile, by tier
  const TIER_TILES  = TIER_SUB.map(s => N / s);  // tiles a side per chunk: 64, 32, 16
  const STEPS       = 96;            // coverage is baked in this many steps (fine enough that the blend between two is no wider than an edge)
  const MAX_CHUNKS  = 72;            // baked chunks kept (more while more are on screen)
  const BAKE_BUDGET_MS = 5;          // working out fields per frame, at least one chunk
  const NEW_BUDGET_MS  = 14;         // ...and for chunks just come into view
  const PAINT_BUDGET_MS = 8;         // painting steps from them (well under a millisecond each)
  const EDGE_ROUGH  = 0.05;          // how ragged a patch's edge is
  const EDGE_BAND   = 0.012;         // and how hard: about a sample wide, which the smoothed drawing antialiases
  const ZONE_LESS   = 0.8;           // how much higher a zone's ground sets the bar for snow to lie: its streets and lots are ploughed and trodden
  const _chunks = new Map();         // "tier|cx,cy" -> { lo, hi }: the two steps either side of the cover
  let _tier = 1;
  let _comp = null, _compCtx = null; // the view's snow, put together a sample to a pixel, then drawn once
  let _rimeMask = null, _rimeMaskCtx = null;   // a cold snap's thick frost, at screen resolution
  function _tierFor(zoom) {
    // a little hysteresis, so a zoom sitting on a threshold doesn't rebake
    const up = [0.5, 0.75], down = [0.42, 0.65];
    let t = _tier;
    while (t < 2 && zoom > up[t]) t++;
    while (t > 0 && zoom < down[t - 1]) t--;
    return t;
  }

  // The snow field at a point, in tiles: how readily the spot holds snow
  // (hold), its fine grain, and the warped coordinates the texture is read
  // from. Shared by the bake and snowAt, so a footprint or a rut and the snow
  // drawn under it always agree. The field is read in sixths of a tile (U),
  // whatever the tier. It is warped and its finer layers turned off the
  // grid, so the patches don't come out squared off along the lattice.
  const U = 6;
  const _F = { hold: 0, grain: 0, rough: 0, qx: 0, qy: 0, rx: 0, ry: 0, nx: 0, ny: 0 };
  function _field(tx, ty) {
    const nx = tx * U + patX, ny = ty * U + patY;
    const qx = nx + (_noise(nx + 5003, ny + 17, U * 5) - 0.5) * U * 2.4;
    const qy = ny + (_noise(nx + 29, ny + 5011, U * 5) - 0.5) * U * 2.4;
    const rx = qx * 0.8 - qy * 0.6, ry = qx * 0.6 + qy * 0.8;
    _F.hold = _noise(qx, qy, U * 7) * 0.6 + _noise(rx + 911, ry + 377, U * 1.9) * 0.28 + _noise(ry + 57, 613 - rx, U * 0.8) * 0.12;
    _F.grain = _noise(nx * 1.25 + 71, ny * 1.25 + 19, 1);
    _F.rough = _noise(nx * 0.4 + 433, ny * 0.4 + 271, 1);
    _F.qx = qx; _F.qy = qy; _F.rx = rx; _F.ry = ry; _F.nx = nx; _F.ny = ny;
    return _F;
  }
  // How much of a zone one tile's surroundings are, softened the way the
  // bake softens its mask (two 3x3 box blurs come to these 5x5 weights).
  const _ZW = [1, 2, 3, 2, 1];
  function _zoneFrac(c, r) {
    if (typeof ZoneSystem === 'undefined' || !ZoneSystem.getZoneRects) return 0;
    const rects = [];
    for (const k of ['residential', 'commercial', 'industrial'])
      for (const R of (ZoneSystem.getZoneRects(k) || [])) if (R.maxC >= c - 2 && R.minC <= c + 2 && R.maxR >= r - 2 && R.minR <= r + 2) rects.push(R);
    const gov = !!ZoneSystem.isInGovZone;
    let s = 0;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const cc = c + dc, rr = r + dr;
      let z = false;
      for (const R of rects) if (cc >= R.minC && cc <= R.maxC && rr >= R.minR && rr <= R.maxR) { z = true; break; }
      if (!z && gov) z = ZoneSystem.isInGovZone(cc, rr);
      if (z) s += _ZW[dr + 2] * _ZW[dc + 2];
    }
    return s / 81;
  }

  // A zone's streets, sidewalks, haul roads and promenades (the route network
  // render_core.js lays out in _zoneGroundPlan) are ploughed and walked on, so
  // snow lies thinly on them: fewer patches, and those see-through, so the
  // paving reads through a grey slush. A route tile is a band HW px either
  // side of its centre lines, with an arm out to each route neighbour, the
  // same shape _bandRects paints.
  const PATH_LESS  = 0.12;   // how much higher a route sets the bar for snow to lie
  const PATH_ALPHA = 0.45;   // and how opaque what does lie on it is
  const ROUTE_HW   = { residential: 7, commercial: 12, industrial: 12, government: 10 };
  // The route through tile (c, r): arms N1 S2 W4 E8 in the low bits, half
  // width in px above them, or 0 for none.
  function _routeTile(c, r) {
    if (typeof ZoneSystem === 'undefined' || !ZoneSystem.getZoneRects || typeof _zoneGroundPlan !== 'function') return 0;
    for (const k in ROUTE_HW) for (const R of (ZoneSystem.getZoneRects(k) || [])) {
      if (c < R.minC - 1 || c > R.maxC + 1 || r < R.minR - 1 || r > R.maxR + 1) continue;
      const p = _zoneGroundPlan(k, R);
      const on = (cc, rr) => (cc >= p.c0 && cc <= p.c1 && rr >= p.r0 && rr <= p.r1 && p.path[(rr - p.r0) * p.w + (cc - p.c0)] === 1)
                             || p.portalAt.has(cc + ',' + rr);
      if (!(c >= p.c0 && c <= p.c1 && r >= p.r0 && r <= p.r1 && p.path[(r - p.r0) * p.w + (c - p.c0)] === 1)) continue;
      return (ROUTE_HW[k] << 4) | (on(c, r - 1) ? 1 : 0) | (on(c, r + 1) ? 2 : 0) | (on(c - 1, r) ? 4 : 0) | (on(c + 1, r) ? 8 : 0);
    }
    return 0;
  }
  // The roads linking one zone to the next (render_core.js's connector
  // network) run through open country, outside every zone, so nothing above
  // thinned the snow on them and they disappeared under it. They are
  // ploughed: the carriageway takes the slush the zones' streets do, set
  // back a lot further, and the gravel shoulders keep the snow pushed off
  // it, so a cleared road runs between two banks.
  const CONNECTOR_LESS = 0.85;
  const CONNECTOR_HW   = 15;    // half the carriageway, px (a tile less its shoulders)
  // A connector tile's route code (same shape as _routeTile's), or 0.
  function _connectorTile(c, r) {
    if (typeof _connectorTiles === 'undefined' || !_connectorTiles.size) return 0;
    const v = _connectorTiles.get(c + ',' + r);
    if (v === undefined) return 0;
    const has = (dc, dr, bit) => (v & bit) || (v & (bit << 4)) || _connectorTiles.has((c + dc) + ',' + (r + dr));
    return (CONNECTOR_HW << 4) | (has(0, -1, 1) ? 1 : 0) | (has(0, 1, 2) ? 2 : 0) | (has(-1, 0, 4) ? 4 : 0) | (has(1, 0, 8) ? 8 : 0);
  }
  function _connectorsReady() {
    if (typeof _ensureConnectorNetwork === 'function' && typeof ZoneSystem !== 'undefined' && ZoneSystem.getVersion) _ensureConnectorNetwork();
    return typeof _connectorTiles !== 'undefined' && _connectorTiles.size > 0;
  }
  // Whether a point (tiles) of a tile with route code `rt` is on the paving.
  function _onRoute(rt, tx, ty) {
    if (!rt) return false;
    const hw = (rt >> 4) / TILE;
    const fx = tx - Math.floor(tx) - 0.5, fy = ty - Math.floor(ty) - 0.5;
    const inX = fx >= -hw && fx <= hw, inY = fy >= -hw && fy <= hw;
    if (inX && inY) return true;
    return (inX && ((fy < 0 && rt & 1) || (fy > 0 && rt & 2))) || (inY && ((fx < 0 && rt & 4) || (fx > 0 && rt & 8)));
  }

  // Work out one chunk's snow field: everything about each sample that does
  // not depend on how much snow there is. The bitmap carries one sample of
  // margin on every side so it scales smoothly right up to its edge.
  //
  // This is the costly part (all the noise), and it is done once per chunk,
  // not once per coverage step: drawing a step from it (_bake) is a cheap
  // threshold, so every chunk on screen follows the cover in the same frame.
  // Baking the noise per step took 13-30 ms a chunk against a 5 ms budget,
  // so while snow was falling or melting the chunks caught up one a frame,
  // each lagging its neighbours and then jumping: the cover popped in and
  // out a chunk at a time.
  //
  // Per sample: O, how far above the bar the spot is before the cover's
  // reach is taken off (NEVER where no amount of snow would lie); R, the
  // edge roughness; L, the texture's brightness; P, on a route.
  const NEVER = -9;
  function _bakeField(tier, cx, cy, zoneVer) {
    const S = TIER_SUB[tier], CT = TIER_TILES[tier], NN = N + 2;
    const O = new Float32Array(NN * NN).fill(NEVER), R = new Uint8Array(NN * NN), L = new Uint8Array(NN * NN), P = new Uint8Array(NN * NN);
    const fld = { zoneVer, O, R, L, P };
    const reach = 1.05 - 1.25;                // the furthest down the field the snow ever comes (full cover)
    // How much of a zone each tile is (0 or 1), softened over a couple of
    // tiles so the cover thins toward a zone rather than stopping at a line.
    const B = 3, M = CT + 2 * B + 2;
    const b0c = cx * CT - B - 1, b0r = cy * CT - B - 1;
    const rects = [];
    if (typeof ZoneSystem !== 'undefined' && ZoneSystem.getZoneRects) for (const k of ['residential', 'commercial', 'industrial'])
      for (const r of (ZoneSystem.getZoneRects(k) || [])) if (r.maxC >= b0c && r.minC <= b0c + M && r.maxR >= b0r && r.minR <= b0r + M) rects.push(r);
    const gov = typeof ZoneSystem !== 'undefined' && !!ZoneSystem.isInGovZone;
    let zone = new Float32Array(M * M), any = false;
    for (let tr = 0; tr < M; tr++) for (let tc = 0; tc < M; tc++) {
      const c = b0c + tc, r = b0r + tr;
      let z = 0;
      for (let q = 0; q < rects.length; q++) { const R = rects[q]; if (c >= R.minC && c <= R.maxC && r >= R.minR && r <= R.maxR) { z = 1; break; } }
      if (!z && gov && ZoneSystem.isInGovZone(c, r)) z = 1;
      if (z) { zone[tr * M + tc] = 1; any = true; }
    }
    if (any) for (let pass = 0; pass < 2; pass++) {          // two box blurs: a soft ~2 tile edge
      const out = new Float32Array(M * M);
      for (let tr = 0; tr < M; tr++) for (let tc = 0; tc < M; tc++) {
        let s = 0, n = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = tr + dr, cc = tc + dc;
          if (rr < 0 || cc < 0 || rr >= M || cc >= M) continue;
          s += zone[rr * M + cc]; n++;
        }
        out[tr * M + tc] = s / n;
      }
      zone = out;
    }
    // The route through every tile, worked out once per tile rather than
    // once per sample.
    const route = new Uint16Array(M * M);
    if (any) for (let tr = 0; tr < M; tr++) for (let tc = 0; tc < M; tc++) route[tr * M + tc] = _routeTile(b0c + tc, b0r + tr);
    // ...and the roads between zones, kept apart since they clear further.
    const conn = _connectorsReady() ? new Uint16Array(M * M) : null;
    let anyConn = false;
    if (conn) for (let tr = 0; tr < M; tr++) for (let tc = 0; tc < M; tc++) { const v = _connectorTile(b0c + tc, b0r + tr); if (v) { conn[tr * M + tc] = v; anyConn = true; } }
    const zoneAt = (tx, ty) => {                             // tile coords, bilinear between tile centres
      const fx = tx - b0c - 0.5, fy = ty - b0r - 0.5;
      const x0 = Math.max(0, Math.min(M - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(M - 2, Math.floor(fy)));
      const ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0));
      const a = zone[y0 * M + x0], b = zone[y0 * M + x0 + 1], c = zone[(y0 + 1) * M + x0], d = zone[(y0 + 1) * M + x0 + 1];
      const top = a + (b - a) * ax;
      return top + ((c + (d - c) * ax) - top) * ay;
    };
    const sx0 = cx * N - 1, sy0 = cy * N - 1;                // this chunk's first sample, in world samples
    // The broad parts of the field (the warp, the big hollows, the drifts)
    // change over tiles, not samples, so they are worked out on a coarse
    // grid every G samples and interpolated: the same picture (_field has
    // them exact, for snowAt) for about half the cost of a bake.
    const G = 4, GN = Math.ceil((N + 2) / G) + 1, grid = new Float32Array(GN * GN * 4);
    for (let gj = 0; gj < GN; gj++) for (let gi = 0; gi < GN; gi++) {
      const nx = (sx0 + gi * G + 0.5) / S * U + patX, ny = (sy0 + gj * G + 0.5) / S * U + patY;
      const dqx = (_noise(nx + 5003, ny + 17, U * 5) - 0.5) * U * 2.4, dqy = (_noise(nx + 29, ny + 5011, U * 5) - 0.5) * U * 2.4;
      const qx = nx + dqx, qy = ny + dqy, rx = qx * 0.8 - qy * 0.6, ry = qx * 0.6 + qy * 0.8;
      const o = (gj * GN + gi) * 4;
      grid[o] = dqx; grid[o + 1] = dqy; grid[o + 2] = _noise(qx, qy, U * 7); grid[o + 3] = _noise(rx + 131, ry + 71, U * 3.2);
    }
    const g4 = [0, 0, 0, 0];
    for (let j = 0; j < N + 2; j++) {
      const ty = (sy0 + j + 0.5) / S, ny = ty * U + patY;
      const gy = j / G, gj = Math.floor(gy), fy = gy - gj;
      for (let i = 0; i < N + 2; i++) {
        const tx = (sx0 + i + 0.5) / S, nx = tx * U + patX;
        const gx = i / G, gi = Math.floor(gx), fx = gx - gi;
        const o00 = (gj * GN + gi) * 4, o10 = o00 + 4, o01 = o00 + GN * 4, o11 = o01 + 4;
        for (let q = 0; q < 4; q++) {
          const top = grid[o00 + q] + (grid[o10 + q] - grid[o00 + q]) * fx;
          g4[q] = top + ((grid[o01 + q] + (grid[o11 + q] - grid[o01 + q]) * fx) - top) * fy;
        }
        const zf = any ? zoneAt(tx, ty) : 0;
        // Nothing the finer detail could add would bring snow here, even
        // under a full cover: bare for good.
        if (g4[2] * 0.6 + 0.4 + EDGE_ROUGH / 2 - reach - zf * ZONE_LESS <= 0) continue;
        // Where snow holds: broad hollows, broken up by finer detail.
        const qx = nx + g4[0], qy = ny + g4[1], rx = qx * 0.8 - qy * 0.6, ry = qx * 0.6 + qy * 0.8;
        const hold = g4[2] * 0.6 + _noise(rx + 911, ry + 377, U * 1.9) * 0.28 + _noise(ry + 57, 613 - rx, U * 0.8) * 0.12;
        const grain = _noise(nx * 1.25 + 71, ny * 1.25 + 19, 1);
        const rough = _noise(nx * 0.4 + 433, ny * 0.4 + 271, 1);
        const tci = Math.floor(tx) - b0c, tri = Math.floor(ty) - b0r;
        const inBox = tci >= 0 && tri >= 0 && tci < M && tri < M;
        const onConn = anyConn && inBox && _onRoute(conn[tri * M + tci], tx, ty);
        const onPath = onConn || (any && inBox && _onRoute(route[tri * M + tci], tx, ty));
        // Texture: drifts, a slow swell; the wind's marks, long one way and
        // short the other, on a slant; and the grain over all of it.
        const drift = g4[3];
        const wind = _noise((qx + qy) * 0.3 + 3001, (qy - qx) + 1999, U * 0.9);
        const k = j * (N + 2) + i;
        O[k] = hold - zf * ZONE_LESS - (onConn ? CONNECTOR_LESS : onPath ? PATH_LESS : 0);
        R[k] = Math.round(rough * 255);
        L[k] = Math.round(Math.max(0, Math.min(1, 0.45 * drift + 0.2 * wind + 0.35 * grain)) * 255);
        P[k] = onPath ? 1 : 0;
      }
    }
    return fld;
  }

  // Paint one chunk's snow for coverage step `step` into a layer's canvas,
  // from the chunk's field.
  //
  // Snow is opaque. Where there is less of it, there is less of it: the
  // patches are smaller and break up into flecks with grass between them,
  // rather than the whole cover turning see-through. Its texture is a broad
  // swell of drifts (bright crests, blue-grey hollows), soft marks the wind
  // has combed across it and a fine grain, and the grain roughens the edge
  // too, so a patch ends in a ragged fringe of flecks, not a fade. All of it
  // is measured in tiles, so it is the same snow at every tier.
  function _bake(ch, fld, step) {
    const NN = N + 2;
    if (!ch.canvas) { ch.canvas = document.createElement('canvas'); ch.canvas.width = ch.canvas.height = NN; ch.ctx = ch.canvas.getContext('2d'); }
    ch.step = step; ch.fld = fld;
    if (step <= 0) { ch.ctx.clearRect(0, 0, NN, NN); return; }
    if (!ch.img) { ch.img = ch.ctx.createImageData(NN, NN); ch.u32 = new Uint32Array(ch.img.data.buffer); }
    // Written a whole pixel at a time (little-endian RGBA, as every browser
    // this runs in is): a quarter of the stores, about half the time.
    const u32 = ch.u32, O = fld.O, R = fld.R, L = fld.L, P = fld.P;
    const reach = 1.05 - (step / STEPS) * 1.25;   // how far down the field the snow comes
    for (let k = 0, n = NN * NN; k < n; k++) {
      const over = O[k] - reach;
      // A hard edge, roughened: a patch ends in a ragged line with flecks
      // of snow and tufts of grass along it, not a fade. The roughness is
      // a little coarser than a sample, so the outline is drawn as curves
      // rather than stepping along the sample grid.
      let amt = (over + (R[k] / 255 - 0.5) * EDGE_ROUGH) / EDGE_BAND;
      if (amt <= 0) { u32[k] = 0; continue; }
      if (amt > 1) amt = 1;
      // The fringe of a patch is thin, so it reads greyer, the ground under it.
      const lum = L[k] / 255 * (over >= 0.02 ? 1 : 0.82 + 0.18 * Math.max(0, over / 0.02));
      // Trodden slush on the paving is greyer than the snow beside it.
      const onPath = P[k] === 1, dim = onPath ? 0.9 : 1;
      // hollow (cool blue-grey) to crest (white)
      const r = ((206 + lum * 49) * dim + 0.5) | 0, g = ((216 + lum * 39) * dim + 0.5) | 0, b = ((234 + lum * 21) * dim + 0.5) | 0;
      const a = (255 * amt * (onPath ? PATH_ALPHA : 1) + 0.5) | 0;
      u32[k] = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
    }
    ch.ctx.putImageData(ch.img, 0, 0);
  }

  return {
    get coverage() { return coverage; },

    get snowDepth() { return snow; },

    // Called when a cold snap starts — ramps frost in over time (tick()).
    // Frost already showing is taken as rime, so a cold snap restored from a
    // save made before the rime was kept carries on where it was.
    triggerFrost(intensity = 0.8) { target = intensity; rime = Math.max(rime, Math.min(intensity, coverage)); },
    // Called when the cold snap ends — frost thaws back out.
    clear() { target = 0; },
    // A snowfall or blizzard starts or stops laying snow, `rate` depth per second.
    snowing(rate) { falling = Math.max(0, rate || 0); },
    stopSnowing() { falling = 0; },

    // A bare number is a coverage from before fallen snow was tracked.
    load(saved) {
      const d = saved && typeof saved === 'object' ? saved : { coverage: +saved || 0 };
      snow = Math.max(0, Math.min(SNOW_CAP, +d.snow || 0));
      coverage = Math.max(0, Math.min(1, +d.coverage || 0));
      // The rime is saved too, so a cold snap's frost is still lying after a
      // reload rather than melting off and settling again.
      rime   = Math.max(0, Math.min(1, +d.rime || 0));
      target = Math.max(0, Math.min(1, +d.target || 0));
      falling = 0;
      if (Number.isFinite(d.patX) && Number.isFinite(d.patY)) { patX = d.patX; patY = d.patY; }
      else { patX = _rollPattern(); patY = _rollPattern(); }
      bare = false;
      _chunks.clear();
    },
    serialise() { return { snow, coverage, rime, target, patX, patY }; },

    tick(dt) {
      // Rime settles and thaws slowly, mirroring CloudState's easing.
      rime += (target - rime) * Math.min(1, dt * 0.05);
      const floor = typeof Seasons !== 'undefined' ? Seasons.frostFloor() : 0;
      if (falling > 0) {
        // New snow lands on whatever is already lying.
        snow = Math.min(SNOW_CAP, Math.max(snow, floor) + falling * dt);
      } else if (snow > 0) {
        // It only melts with the sun on it: from mid-morning to dusk. So snow
        // lying at nightfall is still there at dawn however mild the night,
        // and what is left on the last day of winter sees in the first
        // morning of spring before it starts to go.
        const temp = typeof WeatherEventSystem !== 'undefined' ? WeatherEventSystem.getTemperature() : 18;
        const h = typeof DayNight !== 'undefined' ? DayNight.hour() : 12;
        const sun = h >= MELT_FROM && h < MELT_TO ? 1 : 0;
        snow = Math.max(0, snow - (Math.max(0, temp - MELT_ABOVE) * MELT_PER_DEG * sun + SUBLIME) * dt);
      }
      // The picture follows the depth closely but never jumps (a load, a dev
      // weather button, a season boundary).
      const lying = Math.max(floor, Math.min(1, snow));
      const want = Math.max(rime, lying);
      rimeOnly = rime > lying ? (rime - lying) / rime : 0;
      coverage += (want - coverage) * Math.min(1, dt * 0.25);
      coverage = Math.max(0, Math.min(1, coverage));
      // Fresh pattern for the next frost, chosen while there is none to see.
      if (coverage < 0.002) bare = true;
      else if (bare) { bare = false; patX = _rollPattern(); patY = _rollPattern(); _chunks.clear(); }
    },

    // Draws the snow cover over the visible ground. Assumes ctx already has
    // the camera transform applied (same convention as the rest of
    // RenderSystem's world-space drawing).
    render(ctx) {
      const zoom = Camera.zoom;
      const worldLeft = Camera.x, worldTop = Camera.y;
      // CSS px, not backing-store px — see RENDER_SCALE in render_core.js.
      const worldW = window.innerWidth / zoom, worldH = window.innerHeight / zoom;
      // Dormant ground: through the cold half of the year the grass (and a
      // zone's lawns) fades to straw, so what shows between the snow is
      // winter ground, not a summer meadow.
      const dorm = typeof Seasons !== 'undefined' && Seasons.dormancy ? Seasons.dormancy() : 0;
      const gold = typeof Seasons !== 'undefined' && Seasons.autumn ? Seasons.autumn() : 0;
      const grd  = typeof Seasons !== 'undefined' && Seasons.ground ? Seasons.ground() : null;
      if (grd && (grd.fresh > 0.01 || grd.dry > 0.01 || grd.flowers > 0.01)) {
        const gx = Math.max(0, worldLeft), gy = Math.max(0, worldTop);
        const gw = Math.min(COLS * TILE, worldLeft + worldW) - gx, gh = Math.min(ROWS * TILE, worldTop + worldH) - gy;
        // Spring: the grass comes up a brighter, fresher green.
        if (grd.fresh > 0.01) { ctx.fillStyle = `rgba(132,214,72,${(0.12 * grd.fresh).toFixed(3)})`; ctx.fillRect(gx, gy, gw, gh); }
        // Late summer: sun-bleached, drier grass.
        if (grd.dry > 0.01) { ctx.fillStyle = `rgba(206,184,104,${(0.2 * grd.dry).toFixed(3)})`; ctx.fillRect(gx, gy, gw, gh); }
        if (grd.flowers > 0.01 && zoom > 0.3) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, grd.flowers);
          _drawWildflowers(ctx, gx, gy, gx + gw, gy + gh);
          ctx.restore();
        }
      }
      if (gold > 0.01) {
        // Autumn: the grass goes golden, and fallen leaves lie over everything.
        const gx = Math.max(0, worldLeft), gy = Math.max(0, worldTop);
        const gw = Math.min(COLS * TILE, worldLeft + worldW) - gx, gh = Math.min(ROWS * TILE, worldTop + worldH) - gy;
        ctx.fillStyle = `rgba(206,140,40,${(0.36 * gold).toFixed(3)})`;
        ctx.fillRect(gx, gy, gw, gh);
        if (zoom > 0.3) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, gold * 1.15);
          ctx.fillStyle = _leafLitter(ctx);
          ctx.fillRect(gx, gy, gw, gh);
          ctx.restore();
        }
      }
      if (dorm > 0.01) {
        ctx.fillStyle = `rgba(134,122,94,${(0.5 * dorm).toFixed(3)})`;
        ctx.fillRect(Math.max(0, worldLeft), Math.max(0, worldTop), Math.min(COLS * TILE, worldLeft + worldW) - Math.max(0, worldLeft), Math.min(ROWS * TILE, worldTop + worldH) - Math.max(0, worldTop));
      }
      if (coverage < 0.002) { if (_chunks.size) _chunks.clear(); return; }   // low, so the first patches fade in rather than pop
      const tier = _tier = _tierFor(zoom);
      const S = TIER_SUB[tier], CT = TIER_TILES[tier], size = CT * TILE;
      const cx0 = Math.max(0, Math.floor(worldLeft / size)), cx1 = Math.min(Math.ceil(COLS / CT) - 1, Math.floor((worldLeft + worldW) / size));
      const cy0 = Math.max(0, Math.floor(worldTop / size)),  cy1 = Math.min(Math.ceil(ROWS / CT) - 1, Math.floor((worldTop + worldH) / size));
      if (cx0 > cx1 || cy0 > cy1) return;
      // The cover is baked in STEPS steps; each chunk keeps the step below
      // and the step above the current cover and draws an exact blend of the
      // two, so snow creeps in, spreads and melts back continuously instead
      // of jumping a step at a time.
      const v  = coverage * STEPS;
      const lo = Math.min(STEPS, Math.floor(v)), hi = Math.min(STEPS, lo + 1);
      const zoneVer = typeof ZoneSystem !== 'undefined' && ZoneSystem.getVersion ? ZoneSystem.getVersion() : 0;
      // Never evict a chunk that is on screen, nor the other tiers' chunks
      // that are standing in for ones still to bake.
      const cap = Math.max(MAX_CHUNKS, (cx1 - cx0 + 3) * (cy1 - cy0 + 3) * 2 + 8);
      // The view's snow is put together in one bitmap, a sample to a pixel,
      // and laid down in one go. Drawn chunk by chunk, each scaled on its
      // own, they met at fractional screen pixels and left a faint grid
      // across the snow; put together first they are one picture.
      const vw = (cx1 - cx0 + 1) * N, vh = (cy1 - cy0 + 1) * N;
      if (!_comp) { _comp = document.createElement('canvas'); _compCtx = _comp.getContext('2d'); }
      if (_comp.width < vw || _comp.height < vh) { _comp.width = Math.max(_comp.width, vw); _comp.height = Math.max(_comp.height, vh); }
      const cc = _compCtx;
      cc.globalCompositeOperation = 'source-over'; cc.globalAlpha = 1;
      cc.imageSmoothingEnabled = true;
      cc.clearRect(0, 0, vw, vh);
      // Copy what a chunk shows (the given part of it) into the view: the
      // blend of its two steps, or whichever one it has. The blend is drawn
      // straight into the view, the lower step at 1-f and the upper added
      // over it at f: 'lighter' adds premultiplied colour and alpha, so
      // A·(1-f) + B·f is an exact linear blend, and no two chunks' rects
      // overlap. (It used to be built in a scratch bitmap per chunk, each
      // one waiting on the last: 8-10 ms a frame whenever the cover sat
      // between two steps.) Returns whether anything was drawn.
      const put = (ch, sx, sy, sw, sh, dx, dy, dw, dh) => {
        const A = ch.lo, Bl = ch.hi;
        let f;
        if (!A.canvas || !Bl.canvas) f = A.canvas ? 0 : Bl.canvas ? 1 : -1;
        else f = Bl.step > A.step ? Math.max(0, Math.min(1, (v - A.step) / (Bl.step - A.step))) : 0;
        if (f < 0) return false;
        if (f <= 0.001 || f >= 0.999) {
          const L = f >= 0.999 ? Bl : A;
          if (L.step <= 0) return L.step === 0;
          cc.drawImage(L.canvas, sx, sy, sw, sh, dx, dy, dw, dh);
          return true;
        }
        cc.globalAlpha = 1 - f; cc.drawImage(A.canvas, sx, sy, sw, sh, dx, dy, dw, dh);
        cc.globalCompositeOperation = 'lighter';
        cc.globalAlpha = f;     cc.drawImage(Bl.canvas, sx, sy, sw, sh, dx, dy, dw, dh);
        cc.globalCompositeOperation = 'source-over'; cc.globalAlpha = 1;
        return true;
      };
      // A chunk not baked yet at this tier borrows the same ground from
      // another tier's chunks, coarser ones first (the coarsest is kept
      // baked for the whole view, below), so a zoom across a tier or a pan
      // onto new ground never shows a hole while it bakes: the snow is
      // there at once, a little soft, and sharpens a moment later.
      const borrow = (cx, cy, dx, dy) => {
        const tc0 = cx * CT, tr0 = cy * CT;
        for (const u of [tier - 1, tier - 2, tier + 1, tier + 2]) {
          if (u < 0 || u > 2) continue;
          const CU = TIER_TILES[u], SU = TIER_SUB[u];
          const kx0 = Math.floor(tc0 / CU), kx1 = Math.floor((tc0 + CT - 1) / CU);
          const ky0 = Math.floor(tr0 / CU), ky1 = Math.floor((tr0 + CT - 1) / CU);
          let drew = false;
          for (let ky = ky0; ky <= ky1; ky++) for (let kx = kx0; kx <= kx1; kx++) {
            const och = _chunks.get(u + '|' + kx + ',' + ky);
            if (!och) continue;
            // the overlap of that chunk and this one, in tiles
            const a0 = Math.max(tc0, kx * CU), a1 = Math.min(tc0 + CT, (kx + 1) * CU);
            const b0 = Math.max(tr0, ky * CU), b1 = Math.min(tr0 + CT, (ky + 1) * CU);
            if (put(och, 1 + (a0 - kx * CU) * SU, 1 + (b0 - ky * CU) * SU, (a1 - a0) * SU, (b1 - b0) * SU,
                         dx + (a0 - tc0) * S, dy + (b0 - tr0) * S, (a1 - a0) * S, (b1 - b0) * S)) drew = true;
          }
          if (drew) return;
        }
      };
      const t0 = performance.now();
      let baked = 0;
      const chunk = (u, cx, cy) => {
        const key = u + '|' + cx + ',' + cy;
        let ch = _chunks.get(key);
        if (ch) { _chunks.delete(key); _chunks.set(key, ch); }         // most recently used last
        else {
          ch = { fld: null, lo: { canvas: null, ctx: null, img: null, step: -1, fld: null }, hi: { canvas: null, ctx: null, img: null, step: -1, fld: null } };
          _chunks.set(key, ch);
          while (_chunks.size > cap) _chunks.delete(_chunks.keys().next().value);
        }
        return ch;
      };
      // Bring a chunk up to date. Its field (the costly part) is worked out
      // while there is time this frame, at least one a frame; a field from
      // before a zone change is still drawn from until its turn comes. Its
      // two steps are then painted from whatever field it has, every frame
      // they need it: that is cheap, so the whole view follows the cover
      // together.
      const update = (ch, u, cx, cy) => {
        if ((!ch.fld || ch.fld.zoneVer !== zoneVer) && (baked === 0 || performance.now() - t0 < (ch.fld ? BAKE_BUDGET_MS : NEW_BUDGET_MS))) {
          ch.fld = _bakeField(u, cx, cy, zoneVer); baked++;
        }
        if (!ch.fld) return;
        // As the cover crosses a step the old upper layer becomes the new
        // lower one (or the reverse while melting), so it costs one paint.
        if (ch.hi.step === lo && ch.hi.fld === ch.fld && ch.lo.step !== lo) { const x = ch.lo; ch.lo = ch.hi; ch.hi = x; }
        else if (ch.lo.step === hi && ch.lo.fld === ch.fld && ch.hi.step !== hi) { const x = ch.hi; ch.hi = ch.lo; ch.lo = x; }
        // A stale layer is still drawn if this frame runs out of time: it is
        // a step out at most, and caught up on the next.
        for (const [layer, want] of [[ch.lo, lo], [ch.hi, hi]])
          if ((layer.step !== want || layer.fld !== ch.fld) && (!layer.canvas || performance.now() - t0 < PAINT_BUDGET_MS)) _bake(layer, ch.fld, want);
      };
      // The base: the view at the coarsest tier, a bake of which covers 4 or
      // 16 of this tier's chunks. Kept baked first, so there is always
      // something to borrow; it costs a bake or two when new ground comes
      // into view, and follows the cover with the rest.
      if (tier > 0) {
        const C0 = TIER_TILES[0] * TILE;
        const bx0 = Math.max(0, Math.floor(worldLeft / C0)), bx1 = Math.min(Math.ceil(COLS / TIER_TILES[0]) - 1, Math.floor((worldLeft + worldW) / C0));
        const by0 = Math.max(0, Math.floor(worldTop / C0)),  by1 = Math.min(Math.ceil(ROWS / TIER_TILES[0]) - 1, Math.floor((worldTop + worldH) / C0));
        for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) update(chunk(0, bx, by), 0, bx, by);
      }
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const ch = chunk(tier, cx, cy);
          update(ch, tier, cx, cy);
          const dx = (cx - cx0) * N, dy = (cy - cy0) * N;
          if (!put(ch, 1, 1, N, N, dx, dy, N, N)) borrow(cx, cy, dx, dy);
        }
      }
      // Time to spare: bake one chunk of the ring just off screen, so a pan
      // finds it ready.
      if (performance.now() - t0 < BAKE_BUDGET_MS) {
        const mx = Math.ceil(COLS / CT) - 1, my = Math.ceil(ROWS / CT) - 1;
        ring: for (let cy = cy0 - 1; cy <= cy1 + 1; cy++) for (let cx = cx0 - 1; cx <= cx1 + 1; cx++) {
          if (cx >= cx0 && cx <= cx1 && cy >= cy0 && cy <= cy1) continue;
          if (cx < 0 || cy < 0 || cx > mx || cy > my) continue;
          const key = tier + '|' + cx + ',' + cy, ch = _chunks.get(key);
          if (ch && ch.fld) continue;
          update(chunk(tier, cx, cy), tier, cx, cy);
          break ring;
        }
      }
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      // the map's edge: snow stops where the land does
      ctx.beginPath(); ctx.rect(0, 0, COLS * TILE, ROWS * TILE); ctx.clip();
      // A cold snap's rime is not a thin sheet of snow over green grass: the
      // grass itself goes frost-bitten. So first the whole ground is drained
      // of its colour and silvered, then rimed with fine crystals, and the
      // patches below only mark where it lies thickest, in the hollows.
      const frost = rimeOnly * Math.min(1, coverage / 0.35);
      if (frost > 0.01) {
        const fx = Math.max(0, worldLeft), fy = Math.max(0, worldTop);
        const fw = Math.min(COLS * TILE, worldLeft + worldW) - fx, fh = Math.min(ROWS * TILE, worldTop + worldH) - fy;
        ctx.globalCompositeOperation = 'saturation';                       // the green drains out
        ctx.globalAlpha = 0.25 * frost; ctx.fillStyle = '#808080'; ctx.fillRect(fx, fy, fw, fh);
        ctx.globalCompositeOperation = 'screen';                           // and it goes pale and cold
        ctx.globalAlpha = 0.2 * frost; ctx.fillStyle = '#a8b8c4'; ctx.fillRect(fx, fy, fw, fh);
        ctx.globalCompositeOperation = 'source-over';
        if (zoom > 0.35) {
          // The crystals: fine detail, so they come in with the zoom rather
          // than turning to a grey haze when seen from far off. A light
          // scatter everywhere...
          const zk = Math.min(1, (zoom - 0.35) / 0.3);
          ctx.globalAlpha = 0.4 * frost * zk; ctx.fillStyle = _rimeCrystals(ctx, 256, 4099); ctx.fillRect(fx, fy, fw, fh);
          // ...and thick in the hollows: where the field's patches lie, the
          // crystals are laid on densely instead of a flat sheet of white.
          // Built at screen resolution (the patches masking a crystal fill)
          // so the needles stay sharp whatever the field's sample size.
          const cv = ctx.canvas, m = ctx.getTransform();
          if (!_rimeMask) { _rimeMask = document.createElement('canvas'); _rimeMaskCtx = _rimeMask.getContext('2d'); }
          if (_rimeMask.width !== cv.width || _rimeMask.height !== cv.height) { _rimeMask.width = cv.width; _rimeMask.height = cv.height; }
          const mc = _rimeMaskCtx;
          mc.setTransform(1, 0, 0, 1, 0, 0); mc.globalCompositeOperation = 'source-over'; mc.clearRect(0, 0, cv.width, cv.height);
          mc.setTransform(m); mc.imageSmoothingEnabled = true;
          mc.drawImage(_comp, 0, 0, vw, vh, cx0 * size, cy0 * size, vw * TILE / S, vh * TILE / S);
          mc.globalCompositeOperation = 'source-in';
          mc.fillStyle = _rimeCrystals(ctx, 181, 7717); mc.fillRect(fx, fy, fw, fh);
          ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 0.85 * frost * zk; ctx.drawImage(_rimeMask, 0, 0);
          ctx.restore();
        }
      }
      // A cold snap's rime alone is a frosting, not a cover: its thick
      // patches are drawn fainter, over ground that is already frosted.
      ctx.globalAlpha = 1 - (1 - RIME_ALPHA) * rimeOnly;
      ctx.drawImage(_comp, 0, 0, vw, vh, cx0 * size, cy0 * size, vw * TILE / S, vh * TILE / S);
      ctx.restore();
    },

    // How frozen open water is, 0..1: ice forms once the cover is deep
    // (renderWaterBaseFill lays it over lakes and rivers).
    ice() { return Math.max(0, Math.min(1, (coverage - 0.42) / 0.3)); },
    // How white the ground is drawn, 0..1 (rime or snow), and how much of it
    // is lying snow rather than a cold snap's rime — Wildlife reads both for
    // winter coats and footprints.
    cover() { return coverage; },
    snowCover() { return coverage * (1 - rimeOnly); },
    // How much lying snow is drawn at a world point, 0..1: the same field
    // and the same edge as the bake, so a print or a rut lands only where
    // there is snow to take it. A cold snap's rime alone takes none.
    snowAt(x, y) {
      if (coverage < 0.002 || rimeOnly >= 0.999) return 0;
      const tx = x / TILE, ty = y / TILE;
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return 0;
      const F = _field(tx, ty);
      const reach = 1.05 - coverage * 1.25;
      const zf = _zoneFrac(Math.floor(tx), Math.floor(ty));
      const onConn = _connectorsReady() && _onRoute(_connectorTile(Math.floor(tx), Math.floor(ty)), tx, ty);
      const onPath = onConn || (zf > 0 && _onRoute(_routeTile(Math.floor(tx), Math.floor(ty)), tx, ty));
      const over = F.hold - reach - zf * ZONE_LESS - (onConn ? CONNECTOR_LESS : onPath ? PATH_LESS : 0);
      return Math.max(0, Math.min(1, (over + (F.rough - 0.5) * EDGE_ROUGH) / EDGE_BAND)) * (1 - rimeOnly);
    },
    isSnowing() { return falling > 0; },
    snowRate() { return falling; },   // depth being laid per second right now

    // A cold wash over the finished scene, so roofs, roads and machinery
    // take on the same pale light as the ground they stand on.
    renderWash(ctx) {
      if (coverage < 0.05) return;
      const zoom = Camera.zoom;
      ctx.fillStyle = `rgba(196,220,246,${(0.085 * coverage).toFixed(3)})`;
      ctx.fillRect(Camera.x, Camera.y, window.innerWidth / zoom, window.innerHeight / zoom);
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   SNOW TRACKS
   Tyre tracks the trucks leave in lying snow: behind every truck that
   drives through it, a rut under each side's wheels, packed snow printed
   with the tread's staggered lugs, shaded down one wall and with a ridge of
   pushed-up snow along each edge. They are laid from where the wheels
   actually are, so on a bend the steer axle's ruts swing wide of the
   tandem's and on a straight the two run as one. A track lasts
   about half a game day and fades as it goes; fresh snow fills one in
   far faster (under an hour in a snowfall, half that in a blizzard), and
   they go when the snow does.

   On bare ground the rest of the year a truck leaves fainter marks: two
   bands of flattened grass and scuffed earth with a hint of tread, which
   last a few game hours and wash out faster in the rain. A road is drawn
   over them, so they show where trucks cut across open ground. Snow
   settling hides them.

   Looks only: nothing reads them and they are not saved. Laid and drawn
   from the frame (straight after FrostSystem.render, so they sit on the
   snow and under everything else), aged on the game clock so a paused
   game keeps them.
   ═══════════════════════════════════════════════════════════════════ */
const SnowTracks = (() => {
  const MAX   = 6000;            // samples kept, oldest dropped first
  const STEP  = TILE * 0.25;     // a truck lays a new sample once either axle has moved this far
  // Where the wheels are on the truck (truck.js draws them): each rut sits
  // this far either side of the centre line, the steer axle this far ahead
  // of the body centre and the middle of the tandem this far behind it.
  const HALF  = 17.9;
  const FRONT = 41, REAR = 37;
  const RUT   = 6.5;             // world px across a rut
  // The town's own traffic (zone_life.js) lays them too, at a car's size:
  // narrow ruts, a sample every few px, and only ever in snow (its streets
  // are paved, so it leaves nothing on bare ground).
  const CAR_RUT = 1.8;
  const TRUCK = { car: false, step: STEP, dirt: true };
  const CAR   = { car: true,  step: 4,    dirt: false };
  const LIFE  = 12;              // game hours a track shows for
  const FILL  = 15;              // times faster it goes in a steady snowfall: under an hour and it is filled in
  const FILL_RATE = 0.00085;     // ...which lays this much a second; heavier snow (a blizzard) fills it in faster in step
  const MIN_COVER = 0.3;         // snow has to be lying at least this much to take a track
  const DIRT_LIFE = 6;           // game hours a track on bare ground shows for
  const DIRT_COVER = 0.05;       // below this much snow the ground is bare
  const RAIN_WASH = 4;           // times faster heavy rain washes a ground track out
  const AGES  = 8;               // a track fades in this many steps over its life
  // A sample is where the four wheel groups were at one moment: rear left
  // and right (ax..dy below), front left and right. `prev` is the one before
  // it on the same track, while that one is still lying.
  const segs = [];               // { id, prev, age, dirt, car, dead, ax, ay, bx, by, cx, cy, dx, dy }
  const last = new WeakMap();    // vehicle -> { s: its last sample, rx, ry, fx, fy, dirt }
  let _ids = 0;
  let _t = null, _site = null;

  // The rear and front axle centres and the wheel offset, from the truck's heading.
  function _wheels(e, o) {
    const ca = Math.cos(e._angle), sa = Math.sin(e._angle);
    const x = e._wx + TILE / 2, y = e._wy + TILE * 1.5;
    o.rx = x - sa * REAR;  o.ry = y + ca * REAR;     // back along the heading
    o.fx = x + sa * FRONT; o.fy = y - ca * FRONT;    // forward along it
    o.ox = ca * HALF;      o.oy = sa * HALF;         // across it
    return o;
  }
  const _w = {};
  function _sample(id, prev, w, dirt, car) {
    return { id, prev, age: 0, dirt, car, dead: false,
      ax: w.rx - w.ox, ay: w.ry - w.oy, bx: w.rx + w.ox, by: w.ry + w.oy,
      cx: w.fx - w.ox, cy: w.fy - w.oy, dx: w.fx + w.ox, dy: w.fy + w.oy };
  }

  // Lay: wherever either axle has moved on since the vehicle's last sample.
  // Turning on the spot swings the cab while the tandem barely moves, so the
  // front alone can call for one. Snow ruts go down only where snow is
  // actually lying under the wheels (FrostSystem.snowAt), so a truck crossing
  // a bare patch leaves the patch bare; off the road on bare ground a truck
  // leaves earth marks instead.
  function _lay(key, w, kind, offRoad) {
    const p = last.get(key);
    if (!p) { last.set(key, { s: null, rx: w.rx, ry: w.ry, fx: w.fx, fy: w.fy, dirt: false }); return; }
    const dr = Math.hypot(w.rx - p.rx, w.ry - p.ry), df = Math.hypot(w.fx - p.fx, w.fy - p.fy);
    if (dr < kind.step && df < kind.step) return;
    // Further than TILE * 4 in one go is a teleport, not a drive. Ground
    // tracks only off the road: one on a road would be drawn over anyway.
    const snow = FrostSystem.snowAt ? FrostSystem.snowAt(w.rx, w.ry) > 0.5 : FrostSystem.snowCover() >= MIN_COVER;
    const dirt = !snow && kind.dirt && offRoad && FrostSystem.snowCover() < DIRT_COVER;
    if ((snow || dirt) && dr < TILE * 4 && df < TILE * 4) {
      // A new kind of track, or one after a gap, starts a new line, so
      // the two never join. Its first sample is where the vehicle was.
      let prev = p.s;
      if (!prev || prev.dead || p.dirt !== dirt) {
        const back = { rx: p.rx, ry: p.ry, fx: p.fx, fy: p.fy, ox: w.ox, oy: w.oy };
        prev = _sample(++_ids, null, back, dirt, kind.car);
        segs.push(prev);
      }
      p.s = _sample(prev.id, prev, w, dirt, kind.car);
      segs.push(p.s);
      if (segs.length > MAX) { const gone = segs.length - MAX; for (let i = 0; i < gone; i++) segs[i].dead = true; segs.splice(0, gone); }
    } else p.s = null;
    p.dirt = dirt; p.rx = w.rx; p.ry = w.ry; p.fx = w.fx; p.fy = w.fy;
  }

  // One of the town's vehicles where it is drawn this frame (zone_life.js):
  // centre, heading (0 = east), length and width. Its axles sit a little in
  // from each end, its wheels just inside its sides.
  const _cw = {};
  function vehicle(v, x, y, ang, len, wid) {
    if (typeof FrostSystem === 'undefined' || !(FrostSystem.cover() > 0.05)) return;
    const ca = Math.cos(ang), sa = Math.sin(ang), ax = len * 0.3, h = wid * 0.36;
    _cw.rx = x - ca * ax; _cw.ry = y - sa * ax;
    _cw.fx = x + ca * ax; _cw.fy = y + sa * ax;
    _cw.ox = -sa * h;     _cw.oy = ca * h;
    _lay(v, _cw, CAR, false);
  }

  function render(ctx) {
    if (typeof FrostSystem === 'undefined' || typeof EntityRegistry === 'undefined' || typeof DayNight === 'undefined') return;
    const cover = FrostSystem.snowCover();
    // Home and a job site are different ground.
    const site = typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite ? ContractSystem.isAtSite() : false;
    if (site !== _site) { segs.length = 0; _site = site; }
    const now = DayNight.getElapsed(), dt = _t === null ? 0 : Math.max(0, Math.min(60, now - _t));
    _t = now;

    for (const e of EntityRegistry.getByType(T.TRUCK)) {
      if (e._wx === undefined || e._angle === undefined) continue;
      _lay(e, _wheels(e, _w), TRUCK, e._fxOffRoad !== false);
    }
    if (!segs.length) return;

    // Age, and drop what has gone. Samples are oldest first, so by the time
    // one is reached the one before it on its track has been settled.
    const laying = FrostSystem.snowRate ? FrostSystem.snowRate() : (FrostSystem.isSnowing() ? FILL_RATE : 0);
    const base = dt / DayNight.secondsPerGameHour();
    const hrs = base * (1 + (FILL - 1) * laying / FILL_RATE);
    const rain = typeof RainSystem !== 'undefined' && RainSystem.level && !(RainSystem.isSnow && RainSystem.isSnow()) ? RainSystem.level() : 0;
    const dirtHrs = base * (1 + RAIN_WASH * rain);
    if (base > 0) {
      let w = 0;
      const melted = cover < 0.02;                      // no snow left: its tracks go with it
      for (const s of segs) {
        let keep;
        if (s.dirt) { s.age += dirtHrs; keep = s.age < DIRT_LIFE; }
        else { s.age += hrs; keep = !melted && s.age < LIFE; }
        if (!keep) { s.dead = true; continue; }
        if (s.prev && s.prev.dead) s.prev = null;
        segs[w++] = s;
      }
      segs.length = w;
    }
    // Pulled right back a rut is under a pixel: it thins out to nothing
    // rather than switching off at one zoom.
    const zoom = Camera.zoom;
    const zf = Math.max(0, Math.min(1, (zoom - 0.16) / 0.16));
    if (zf <= 0 || !segs.length) return;

    const pad = TILE * 2, vx0 = Camera.x - pad, vy0 = Camera.y - pad;
    const vx1 = Camera.x + Math.max(window.innerWidth, ctx.canvas.width) / zoom + pad;
    const vy1 = Camera.y + Math.max(window.innerHeight, ctx.canvas.height) / zoom + pad;
    const k  = Math.max(0, Math.min(1, (cover - 0.05) / 0.15));
    const kd = Math.max(0, 1 - cover / MIN_COVER);      // snow settling hides the ground tracks
    // Snow tracks by age, trucks' in the first AGES and cars' after them.
    const bands = [], dirtBands = [];
    for (let b = 0; b < AGES * 2; b++) bands.push([]);
    for (let b = 0; b < AGES; b++) dirtBands.push([]);
    for (const s of segs) {
      const p = s.prev;
      if (!p || p.dead) continue;                       // a track's first sample only starts it
      if (Math.max(s.ax, s.cx, p.ax) < vx0 || Math.min(s.ax, s.cx, p.ax) > vx1 || Math.max(s.ay, s.cy, p.ay) < vy0 || Math.min(s.ay, s.cy, p.ay) > vy1) continue;
      if (s.dirt) dirtBands[Math.min(AGES - 1, Math.floor(s.age / DIRT_LIFE * AGES))].push(s);
      else bands[Math.min(AGES - 1, Math.floor(s.age / LIFE * AGES)) + (s.car ? AGES : 0)].push(s);
    }
    // Several trucks lay at once, so their samples are interleaved: put each
    // track's together (the sort is stable, so still in the order laid).
    for (const l of bands) if (l.length > 1) l.sort((a, b) => a.id - b.id);
    for (const l of dirtBands) if (l.length > 1) l.sort((a, b) => a.id - b.id);

    // Each wheel group's line through its samples, as a curve through the
    // midpoints so a bend is round rather than a run of short straights.
    // All four go in one path: where the front wheels run in the rear
    // ones' ruts (any straight) they are one rut, not one drawn twice.
    // `m` is how far across the rut, in rut-halves, the line runs.
    const KEYS = [['ax', 'ay'], ['bx', 'by'], ['cx', 'cy'], ['dx', 'dy']];
    const trace = (list, m, R = RUT) => {
      ctx.beginPath();
      for (const [kx, ky] of KEYS) {
        const left = kx === 'ax' || kx === 'cx' ? -1 : 1;
        let drawn = null;                               // the sample the path's pen last reached
        for (const s of list) {
          const p = s.prev, q = p.prev && !p.dead && !p.prev.dead ? p.prev : null;
          // across the rut: the wheel-offset direction, which is the same on all four
          const sp = Math.hypot(s.bx - s.ax, s.by - s.ay) || 1;
          const nx = (s.bx - s.ax) / sp, ny = (s.by - s.ay) / sp;
          const o = m * left * R / 2;
          const px = p[kx] + nx * o, py = p[ky] + ny * o, sx = s[kx] + nx * o, sy = s[ky] + ny * o;
          const x0 = q ? (q[kx] + nx * o + px) / 2 : px, y0 = q ? (q[ky] + ny * o + py) / 2 : py;
          // Carried straight on from the last piece where it can be, so the
          // tread's dashes run through rather than restarting at every sample.
          // Only from the piece drawn just before: anything else (another
          // truck's track) would be joined to this one by a long straight.
          if (drawn !== p) ctx.moveTo(x0, y0);
          ctx.quadraticCurveTo(px, py, (px + sx) / 2, (py + sy) / 2);
          drawn = s;
        }
      }
      ctx.stroke();
    };
    // A stroke `w` world px wide, never under a pixel on screen: thinner
    // than that it is drawn a pixel wide and fainter, which is what it would
    // have covered anyway, rather than crawling as the view moves.
    const pen = (w, a) => {
      const px = w * zoom;
      if (px < 1) { ctx.lineWidth = 1 / zoom; ctx.globalAlpha = a * px; }
      else { ctx.lineWidth = w; ctx.globalAlpha = a; }
    };
    // The tread only reads close in; it fades out as the view pulls back.
    const tread = Math.max(0, Math.min(1, (zoom - 0.45) / 0.3));
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // Every rut is lit from the same side: the light catches the far wall
    // of the groove, the near wall is in shade, whichever way it runs.
    const SH = 0.9;                                     // world px the wall offsets sit off the groove
    // Bare ground: a soft band of flattened grass and scuffed earth per
    // tyre, darker down the shaded wall, the tread a faint stipple in it.
    for (let b = 0; b < AGES && kd > 0; b++) {
      const list = dirtBands[b];
      if (!list.length) continue;
      const a = kd * zf * (1 - b / AGES * 0.85);
      ctx.strokeStyle = '#3a3222'; pen(RUT, 0.17 * a); trace(list, 0);
      ctx.save(); ctx.translate(SH, SH);
      ctx.strokeStyle = '#2a2418'; pen(RUT * 0.45, 0.12 * a); trace(list, 0);
      ctx.restore();
      if (tread > 0) {
        ctx.lineCap = 'butt'; ctx.strokeStyle = '#2a2418';
        ctx.setLineDash([2.2, 2.6]); pen(1.5, 0.13 * a * tread);
        ctx.lineDashOffset = 0;   trace(list, 0.35);
        ctx.lineDashOffset = 2.4; trace(list, -0.35);
        ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.lineCap = 'round';
      }
    }
    for (let bi = 0; bi < AGES * 2 && k > 0; bi++) {
      const list = bands[bi];
      if (!list.length) continue;
      const b = bi % AGES, R = bi < AGES ? RUT : CAR_RUT, g = R / RUT;   // a car's ruts are the truck's, scaled down
      const a = k * zf * (1 - b / AGES * 0.8);
      ctx.strokeStyle = '#7c8da6'; pen(R, 0.2 * a / Math.sqrt(g)); trace(list, 0, R);      // packed snow
      ctx.save(); ctx.translate(SH * g, SH * g);
      ctx.strokeStyle = '#56688a'; pen(R * 0.5, 0.16 * a); trace(list, 0, R);              // the shaded wall, down in the groove
      ctx.restore();
      if (tread > 0 && bi < AGES) {                                                         // the tread: staggered lugs, either side of the middle
        ctx.lineCap = 'butt'; ctx.strokeStyle = '#4a5a7c';
        ctx.setLineDash([2.0, 2.4]); pen(1.6, 0.22 * a * tread);
        ctx.lineDashOffset = 0;   trace(list, 0.38);
        ctx.lineDashOffset = 2.2; trace(list, -0.38);
        ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.lineCap = 'round';
      }
      ctx.save(); ctx.translate(-SH * 0.6 * g, -SH * 0.6 * g);
      ctx.strokeStyle = '#ffffff'; pen(1.2 * g, 0.3 * a); trace(list, 1.25, R); trace(list, -1.25, R);  // the ridges squeezed out along each edge
      ctx.restore();
    }
    ctx.restore();
  }

  return { render, vehicle, clear() { for (const s of segs) s.dead = true; segs.length = 0; }, count: () => segs.length };
})();

/* Snow on buildings. Every sprite is drawn live by its own code, so there is
   no "roof" to ask for. Instead each kind of building is rendered once into
   an offscreen canvas and read back, and a snow overlay is worked out from
   what it actually looks like:
     • a cap along the top of every solid shape (roof ridges, parapets,
       canopies, tanks, tree tops), a few pixels deep with a ragged lower
       edge. Shapes too small to hold snow (people, lamp heads) are skipped;
     • anything grass-green — lawns, playing fields, hedges, the trees in a
       school yard — is snowed over outright.
   The overlay is cached per kind of building (type, subtype, footprint,
   rotation) and drawn over the live sprite, fading in once the snow on the
   ground is more than a rime.
   Kinds are baked between frames, never inside one: render() only draws
   what is cached and queues what isn't. Reading a bake back has to wait for
   the GPU (the sprites are drawn from GPU-held images), and mid-frame that
   meant waiting for everything the frame had queued: after a fast travel,
   with a whole new background in the queue, one bake held the frame for
   over a second, and it used to do two. */
const BuildingSnow = (() => {
  const _cache = new Map();          // key -> canvas, or null when a kind has nothing to snow
  const _queue = new Map();          // key -> an entity of that kind: seen on screen, not baked yet
  // Where each kind's building actually stands inside its footprint, read
  // off the same bake: { top, left, right } in tiles from the footprint's
  // top-left, or null when nothing in it is solid enough to count. Many
  // sprites leave ground (a lawn, a car park, open sky above a low roof)
  // between the footprint's edge and the building, and anything hung on the
  // building (SeasonalEventFX's Christmas lights and bunting) needs to know
  // where the building is, not where its lot is. `bottom` is where most of
  // its columns end (the front wall, or the front of a lot drawn as part of
  // it, like a car park).
  const _roof = new Map();
  // A family home picks its own style, colours and yard from its family name
  // and tile (_renderFamilyHouse), so no two need share a shape: those are
  // baked one per house. Shared by size, every 2×2 home on a street wore one
  // neighbour's outline, and a dust storm laid a ghost of a different house,
  // and its yard, over each of them.
  const _perHouse = e => e.type === T.HOUSE && !e.commercialSubtype;
  const _key = e => e.type + '|' + (e.commercialSubtype || '') + '|' + (e.width || 1) + 'x' + (e.height || 1) + '|' + (e._rotation || 0)
    + (_perHouse(e) ? '|' + e.col + ',' + e.row : '');
  const BAKE_BUDGET_MS = 4;          // a pass bakes one kind, more only while inside this
  let _pass = 0;
  const SHOW_FROM = 0.3, SHOW_FULL = 0.62;   // ground cover over which the overlay fades in
  // A kind's overlay comes in a frame or two after its buildings are first
  // seen (it is baked between frames), so it fades in over this long from
  // then rather than snapping onto every building of that kind at once.
  const ARRIVE_MS = 600;
  const _arrived = new Map();        // key -> when its overlay was first drawn (performance.now)
  let _types = null;

  function _typeList() {
    if (_types) return _types;
    const skip = new Set([T.TREE, T.BUSH, T.WATER, T.WIRE, T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR, T.ROAD, T.TRUCK, T.AQUIFER,
      T.COALDEPOSIT, T.OILDEPOSIT, T.URANIUMDEPOSIT, T.SULFURDEPOSIT, T.LITHIUMDEPOSIT, T.HELIUMDEPOSIT, T.RAREEARTHDEPOSIT, T.GEODEPOSIT]);
    _types = Object.values(T).filter(t => t !== undefined && !skip.has(t));
    return _types;
  }
  const _wob = (x, seed) => { const v = Math.sin(x * 12.9898 + seed * 78.233) * 43758.5453; return v - Math.floor(v); };
  function _noise1(x, seed) { const x0 = Math.floor(x), f = x - x0, sx = f * f * (3 - 2 * f); return _wob(x0, seed) + (_wob(x0 + 1, seed) - _wob(x0, seed)) * sx; }

  function _bake(e) {
    const w = e.width || 1, h = e.height || 1, area = w * h;
    const rkey = _key(e);
    _roof.set(rkey, null);
    if (area > 1600) return null;
    // Big plants at 1x: their overlay would be tens of megabytes at 2x. So
    // are family homes, baked one apiece: a town has hundreds.
    const SC = area > 160 || _perHouse(e) ? 1 : 2;
    const off = document.createElement('canvas');
    off.width = w * TILE * SC; off.height = h * TILE * SC;
    // Software-drawn (willReadFrequently): reading back a GPU canvas mid-frame
    // waits on everything the frame has queued, half a second at a time.
    const octx = off.getContext('2d', { willReadFrequently: true });
    // Without shadows. Blurred shadows are most of what software drawing
    // costs, and they never make anything solid enough to count as a shape:
    // the outlines came out identical for every kind in a late-game city, and
    // a Spent Fuel Pool baked in 13 ms instead of 150.
    Object.defineProperty(octx, 'shadowBlur',  { get: () => 0, set: () => {} });
    Object.defineProperty(octx, 'shadowColor', { get: () => 'rgba(0,0,0,0)', set: () => {} });
    // The renderers draw to the global ctx and read the clock and the camera
    // for lighting and level of detail: pin all three for the one call (the
    // same thing the build-menu icons and the old-city bake do).
    const saved = ctx, oh = DayNight.hour, od = DayNight.darkness, oz = Camera.zoom;
    const W = off.width, H = off.height;
    // Drawn at three moments apart. The overlay is a still picture
    // laid over a live sprite, so anything that moves (a Ferris wheel, a
    // ride, a turning fan, a crane) would carry a frozen copy of itself
    // that the real one turned away from. A pixel only counts as solid if
    // it is solid in every frame (see `open` below): snow and dust sit on
    // what stands there all the time, whatever passes in front of it.
    const frame = (tt) => {
      const saved2 = ctx;
      try {
        ctx = octx; DayNight.hour = () => 13; DayNight.darkness = () => 0; Camera.zoom = 1;
        // Drawn where it stands, with the footprint's corner moved to the
        // bitmap's: the bigger buildings' renderers place themselves from
        // their own col/row rather than the x, y they are given, and drawn at
        // (0, 0) they landed off the bitmap and came out blank.
        const X = (e.col || 0) * TILE, Y = (e.row || 0) * TILE;
        octx.setTransform(1, 0, 0, 1, 0, 0); octx.clearRect(0, 0, W, H);
        octx.setTransform(SC, 0, 0, SC, -X * SC, -Y * SC);
        renderEntityAt(e, X, Y, tt);
      } finally { ctx = saved2; DayNight.hour = oh; DayNight.darkness = od; Camera.zoom = oz; octx.setTransform(1, 0, 0, 1, 0, 0); }
      return octx.getImageData(0, 0, W, H).data;
    };
    // Three moments at uneven spacings, so nothing that turns at a steady
    // rate (16 gondolas round a wheel) lands back in the same places in all
    // of them.
    let src, alt, alt2;
    try { alt = frame(16.0); alt2 = frame(24.2); src = frame(12.3); } catch (err) { return null; }
    finally { ctx = saved; }
    const out = octx.createImageData(W, H), o = out.data;
    const CAP = 4.4 * SC, MIN_RUN = 9 * SC, SOLID = 150;
    const seed = (e.col || 0) * 0.37 + (e.row || 0) * 0.11 + w;
    // A nursery's plants are indoors, under the lamps. A Storage Container's
    // green stock (uranium ore, lithium compound) is not a lawn either: the
    // bake is shared by every container of a size, so it put a snowy mound
    // in empty ones; the container draws the snow on its heap itself.
    const greens = e.commercialSubtype !== 'nursery' && e.type !== T.SOLIDSTORAGE;
    // Many sprites stand on a ground of their own (a lawn, a paved lot) that
    // fills the footprint, so the building has no outline against empty
    // space for a cap to sit on. If one colour dominates a ring just inside
    // the sprite's edge, that is its ground: it is snowed over (lighter than
    // grass, so paving still shows through), and it counts as open space
    // when looking for the tops of things.
    let gr = -1, gg = 0, gb = 0;
    {
      const inset = Math.round(4 * SC), bins = new Map();
      let ring = 0, solid = 0;
      const sample = (x, y) => {
        ring++;
        const j = (y * W + x) * 4;
        if (src[j + 3] < SOLID) return;
        solid++;
        const k = (src[j] >> 3) << 10 | (src[j + 1] >> 3) << 5 | (src[j + 2] >> 3);
        let bn = bins.get(k);
        if (!bn) bins.set(k, bn = [0, 0, 0, 0]);
        bn[0]++; bn[1] += src[j]; bn[2] += src[j + 1]; bn[3] += src[j + 2];
      };
      for (let x = inset; x < W - inset; x += 2) { sample(x, inset); sample(x, H - 1 - inset); }
      for (let y = inset; y < H - inset; y += 2) { sample(inset, y); sample(W - 1 - inset, y); }
      let best = null;
      for (const bn of bins.values()) if (!best || bn[0] > best[0]) best = bn;
      if (best && solid >= ring * 0.6 && best[0] >= solid * 0.35) { gr = best[1] / best[0]; gg = best[2] / best[0]; gb = best[3] / best[0]; }
    }
    const isGrass  = (r, g, b) => greens && g > 55 && g > r * 1.12 && g > b * 1.25 && r < g * 0.92;
    const isGround = (r, g, b) => gr >= 0 && Math.abs(r - gr) + Math.abs(g - gg) + Math.abs(b - gb) < 34;
    const openIn = (d, j) => d[j + 3] < SOLID || isGrass(d[j], d[j + 1], d[j + 2]) || isGround(d[j], d[j + 1], d[j + 2]);
    const open = (j) => openIn(src, j) || openIn(alt, j) || openIn(alt2, j);
    let any = 0;
    const tops = [], cols = [], bots = [];      // per column: where its first solid run starts, and its last one ends
    // ...and where the roof stops and the wall begins: down from the top of
    // the column until the colour changes for good (the roof's own shading
    // and a gutter line don't count, a wall of another colour does).
    const eaves = [];
    const eaveOf = (x, y, y1) => {
      const ref = (yy) => { const j = (yy * W + x) * 4; return [src[j], src[j + 1], src[j + 2]]; };
      const r0 = ref(Math.min(y1 - 1, y + Math.round(2 * SC)));
      let run = 0;
      for (let yy = y + Math.round(3 * SC); yy < y1; yy++) {
        const [r, g, b] = ref(yy);
        if (Math.abs(r - r0[0]) + Math.abs(g - r0[1]) + Math.abs(b - r0[2]) > 70) { if (++run >= Math.round(3 * SC)) return yy - run + 1; }
        else run = 0;
      }
      return y1;
    };
    const put = (j, a, shade) => { o[j] = 240 - shade * 16; o[j + 1] = 245 - shade * 10; o[j + 2] = 252 - shade * 3; o[j + 3] = a; any++; };
    for (let x = 0; x < W; x++) {
      const capD = CAP * (0.5 + 0.95 * _noise1(x / (5 * SC), seed));
      let y = 0;
      while (y < H) {
        const j0 = (y * W + x) * 4;
        if (open(j0)) {
          // lying snow on the sprite's own grass and ground
          // (read off whichever frame shows the ground there, not a ride passing over it)
          const d = openIn(src, j0) ? src : openIn(alt, j0) ? alt : alt2;
          if (d[j0 + 3] >= SOLID) put(j0, isGrass(d[j0], d[j0 + 1], d[j0 + 2]) ? 228 : 176, 0.3 + 0.35 * _wob(x * 0.31 + y * 1.7, seed));
          y++; continue;
        }
        let y1 = y;
        while (y1 < H && !open((y1 * W + x) * 4)) y1++;
        if (y1 - y >= MIN_RUN) {
          if (cols[cols.length - 1] !== x) { tops.push(y); cols.push(x); bots.push(y1); eaves.push(eaveOf(x, y, y1)); }
          else bots[bots.length - 1] = y1;
        }
        // a cap on anything tall enough for snow to sit on
        if (y1 - y >= MIN_RUN) for (let yy = y; yy < y1 && yy - y < capD; yy++) { const q = (yy - y) / capD; put((yy * W + x) * 4, 245 * (1 - q * q * q * 0.55), q * 0.9); }
        y = y1;
      }
    }
    // The roofline: where most of the building's columns start (the 35th
    // percentile, so a dome, a spire or a flagpole over a few columns doesn't
    // lift it), and the building's left and right, ignoring stray posts.
    if (cols.length >= W * 0.15) {
      const ts = tops.slice().sort((a, b) => a - b), pc = (arr, q) => arr[Math.min(arr.length - 1, Math.floor(arr.length * q))];
      const bs = bots.slice().sort((a, b) => a - b);
      const roof = { top: pc(ts, 0.35) / (TILE * SC), bottom: pc(bs, 0.65) / (TILE * SC),
                     left: pc(cols, 0.03) / (TILE * SC), right: (pc(cols, 0.97) + 1) / (TILE * SC) };
      // The roof's shape, for lights to follow (SeasonalEventFx): across the
      // building in PROF_BINS slices, the top of each and where its roof ends,
      // a median per slice, then a median of three neighbours so a chimney
      // or an aerial doesn't put a spike in the string.
      const PROF_BINS = 20, lx = roof.left * TILE * SC, rx = roof.right * TILE * SC;
      const binT = [], binE = [];
      for (let k = 0; k < PROF_BINS; k++) {
        const a = lx + (rx - lx) * k / PROF_BINS, b = lx + (rx - lx) * (k + 1) / PROF_BINS;
        const t = [], e = [];
        for (let i = 0; i < cols.length; i++) if (cols[i] >= a && cols[i] < b) { t.push(tops[i]); e.push(eaves[i]); }
        if (!t.length) { binT.push(null); binE.push(null); continue; }
        t.sort((p, q) => p - q); e.sort((p, q) => p - q);
        binT.push(t[t.length >> 1]); binE.push(e[e.length >> 1]);
      }
      const fill = arr => { let last = null; for (let k = 0; k < arr.length; k++) if (arr[k] === null) arr[k] = last; else last = arr[k];
                            last = null; for (let k = arr.length - 1; k >= 0; k--) if (arr[k] === null) arr[k] = last; else last = arr[k]; };
      fill(binT); fill(binE);
      const med3 = arr => arr.map((v, k) => { const s = [arr[Math.max(0, k - 1)], v, arr[Math.min(arr.length - 1, k + 1)]].sort((p, q) => p - q); return s[1]; });
      if (binT[0] !== null) {
        const T3 = med3(binT), E3 = med3(binE);
        roof.prof = T3.map((tv, k) => {
          const x = (lx + (rx - lx) * (k + 0.5) / PROF_BINS) / (TILE * SC);
          const top = tv / (TILE * SC), eave = Math.max(top + 0.08, Math.min(roof.bottom, E3[k] / (TILE * SC)));
          return [x, top, eave];
        });
      }
      _roof.set(rkey, roof);
    }
    // The building's silhouette (everything solid that isn't its own lawn
    // or ground), for a dust storm's film over the whole building.
    {
      const sv = document.createElement('canvas'); sv.width = W; sv.height = H;
      const sctx = sv.getContext('2d'), sd = sctx.createImageData(W, H), q = sd.data;
      let sAny = false;
      // Pale, greyish dust with a fine grain, so it reads as a coating
      // rather than a tint.
      for (let j = 0; j < src.length; j += 4) if (!open(j)) {
        const p = j >> 2, n = _wob((p % W) * 0.73 + Math.floor(p / W) * 1.31, seed);
        q[j] = 200 + n * 18; q[j + 1] = 180 + n * 14; q[j + 2] = 146 + n * 10; q[j + 3] = 170 + n * 85; sAny = true;
      }
      if (sAny) { sctx.putImageData(sd, 0, 0); _sil.set(rkey, sv); }
    }
    if (!any) return null;
    octx.clearRect(0, 0, W, H);
    octx.putImageData(out, 0, 0);
    return off;
  }

  const _sil = new Map();            // key -> the kind's dust film, over its silhouette (see _bake)

  // One baking pass, in a task of its own between frames (idle time when
  // there is any, and within 250 ms regardless).
  function _schedule() {
    if (_pass || !_queue.size) return;
    const run = () => {
      _pass = 0;
      const t0 = performance.now();
      for (const [key, e] of _queue) {
        _queue.delete(key);
        if (!_cache.has(key) || !_roof.has(key)) _cache.set(key, _bake(e));
        if (performance.now() - t0 > BAKE_BUDGET_MS) break;
      }
      _schedule();
    };
    _pass = typeof requestIdleCallback === 'function' ? requestIdleCallback(run, { timeout: 250 }) : setTimeout(run, 16);
  }

  return {
    // Where e's building stands in its footprint (see _roof): the profile,
    // null if it has none, or undefined until its kind has been baked
    // (asked for here, it is queued and comes in a frame or two later).
    roof(e) {
      const k = _key(e);
      if (_roof.has(k)) return _roof.get(k);
      if (!_queue.has(k)) _queue.set(k, e);
      _schedule();
      return undefined;
    },
    // Over the finished buildings, in world space (camera transform applied).
    render(c, cStart, cEnd, rStart, rEnd) {
      const cover = FrostSystem.coverage;
      // Without snow, a dust storm's settled dust is a film over each
      // building's silhouette (DustSystem.settled).
      const dust = cover <= SHOW_FROM && typeof DustSystem !== 'undefined' ? DustSystem.settled : 0;
      if (cover <= SHOW_FROM && dust < 0.02) { if (cover < 0.02 && _cache.size) { _cache.clear(); _queue.clear(); _arrived.clear(); _sil.clear(); } return; }
      c.save();
      const alpha = dust ? 0.6 * Math.min(1, dust * 1.4) : Math.min(1, (cover - SHOW_FROM) / (SHOW_FULL - SHOW_FROM));
      const now = performance.now();
      for (const type of _typeList()) {
        const set = EntityRegistry.getByType(type);
        if (!set || !set.size) continue;
        const customer = type === T.HOUSE || type === T.COMMERCIAL || type === T.INDUSTRIAL || type === T.CABIN;
        for (const e of set) {
          const w = e.width || 1, h = e.height || 1;
          // Homes and businesses of any size; anything else has to be big
          // enough to have a top worth capping (not poles, lamps, valves).
          if (w * h < 4 && !customer) continue;
          // A building site isn't the finished building: its snow (traced off
          // the finished sprite) hung in mid-air over the scaffolding and the
          // half-raised walls. It snows over once it is built.
          if (e.col + w < cStart || e.col > cEnd || e.row + h < rStart || e.row > rEnd || e._irreparable || e._constructing) continue;
          const key = _key(e);
          const ov = _cache.get(key);
          if (ov === undefined) { if (!_queue.has(key)) _queue.set(key, e); continue; }
          if (!ov && !(dust && _sil.get(key))) continue;
          let t = _arrived.get(key);
          if (t === undefined) _arrived.set(key, t = now);
          const arrive = Math.min(1, (now - t) / ARRIVE_MS);
          if (dust) {
            // Just a film of dust over the building itself. The snow's caps
            // and lawn cover are left out: tinted sand they read as drifts
            // and as a box over the whole lot, not as dust.
            const sil = _sil.get(key);
            if (sil) { c.globalAlpha = 0.3 * Math.min(1, dust * 1.4) * arrive; c.drawImage(sil, e.col * TILE, e.row * TILE, w * TILE, h * TILE); }
            continue;
          }
          c.globalAlpha = alpha * arrive;
          c.drawImage(ov, e.col * TILE, e.row * TILE, w * TILE, h * TILE);
        }
      }
      c.restore();
      _schedule();
    },
  };
})();

/* Heat state — what a heat wave looks like. Until this existed a heat wave
   was a line in the weather tab and nothing on the map, so its effects
   (thirsty air-conditioning, drones short of range) arrived unexplained.
   Two layers over the finished scene, both scaled by how much sun there
   is, so the map cools visibly at dusk and the effect is gone by night:
     • a warm wash, which is what reads at any zoom;
     • heat shimmer: short, soft bright ribbons scattered over the ground,
       each rising a little and wavering before it fades, then turning up
       somewhere else. A real refraction pass would mean re-sampling the
       frame; these cost a few dozen line segments.
   Like frost, intensity eases in and out rather than snapping. start() and
   stop() are the names WeatherEventSystem's visual table calls. */
// Shimmer tuning, all in world units, so the haze sits on the ground and
// zooming magnifies it like the terrain; nothing is fitted to the view size.
const SHIMMER_CELL_W = 400;           // world px: one ribbon per lattice cell
const SHIMMER_CELL_H = 200;
const SHIMMER_RISE   = 150;           // world px a ribbon climbs over its life
const SHIMMER_K1     = 9 / 1920;      // wave frequency, long swell
const SHIMMER_K2     = 23 / 1920;     // wave frequency, fine ripple

const HeatSystem = (() => {
  let intensity = 0;   // 0 = ordinary day, 1 = full heat wave
  let target    = 0;

  return {
    get intensity() { return intensity; },
    start() { target = 1; },
    stop()  { target = 0; },
    snap()  { intensity = target; },   // restored from a save: no fade-in
    load(saved) { intensity = saved || 0; target = intensity; },

    tick(dt) {
      intensity += (target - intensity) * Math.min(1, dt * 0.12);
      intensity = Math.max(0, Math.min(1, intensity));
    },

    // Assumes ctx has the camera transform applied, like FrostSystem.render.
    // `t` is the render clock in seconds.
    render(ctx, t) {
      if (intensity < 0.01) return;
      const sun = typeof DayNight !== 'undefined' ? Math.max(0, 1 - DayNight.darkness()) : 1;
      const k = intensity * sun;
      if (k < 0.01) return;
      const zoom = Camera.zoom;
      // CSS px, not backing-store px — see RENDER_SCALE in render_core.js.
      const left = Camera.x, top = Camera.y;
      const w = window.innerWidth / zoom, h = window.innerHeight / zoom;

      ctx.save();
      // Warm wash: amber over everything, a touch stronger toward the top of
      // the view where the glare would be.
      const g = ctx.createLinearGradient(0, top, 0, top + h);
      g.addColorStop(0, `rgba(255,170,60,${(0.13 * k).toFixed(3)})`);
      g.addColorStop(1, `rgba(255,140,40,${(0.08 * k).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(left, top, w, h);

      // Shimmer: short ribbons, one per cell of a world-space lattice. Each
      // cell hashes its own length, sway, pace and life; a ribbon fades in,
      // climbs SHIMMER_RISE and fades out, and every new life re-rolls where
      // in the cell it appears and how long it is. So the haze comes in
      // broken, staggered wisps rather than rows. All sizes are world units
      // and the lattice is fixed to the ground, so nothing slides or
      // stretches when the view pans or zooms. Zoomed out, or below high
      // quality, a stable hashed share of cells sits out so the count of
      // strokes stays about flat.
      const lv = typeof GfxQuality !== 'undefined' ? GfxQuality.level() : 2;
      {
        const CW = SHIMMER_CELL_W, CH = SHIMMER_CELL_H;
        const keep = Math.min(1, zoom * zoom / 0.36) * (lv >= 2 ? 1 : 0.6);
        const M = 60 + SHIMMER_RISE;                     // margin: amplitude, stroke width, the climb
        const c0 = Math.floor((left - CW) / CW), c1 = Math.ceil((left + w) / CW);
        const r0 = Math.floor((top - M) / CH),   r1 = Math.ceil((top + h + M) / CH);
        const hash = (a, b, s) => { const x = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453; return x - Math.floor(x); };
        const step = 24;                                 // vertex spacing, world px
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
          if (hash(c, r, 1) > keep) continue;
          // Where this ribbon is through its life, and which life it's on.
          const speed = 0.035 + hash(c, r, 2) * 0.05;
          const life = t * speed + hash(c, r, 3) * 7;
          const n = Math.floor(life), p = life - n;
          const a = k * Math.sin(p * Math.PI) * (0.55 + 0.45 * hash(c, r, 4));
          if (a < 0.002) continue;
          // This life's placement: rolled afresh each time it comes round.
          const hx = hash(c + n * 13, r, 5), hy = hash(c, r + n * 7, 6), hl = hash(c - n, r + n, 8);
          const len = 140 + hl * 300;
          const xA = c * CW + hx * (CW - 60) - len * 0.3, xB = xA + len;
          const y0 = r * CH + hy * CH - p * SHIMMER_RISE;
          const amp = 3 + hash(c, r, 9) * 7, ph = hash(c, r, 10) * 6.28;
          ctx.beginPath();
          const s0 = Math.floor(xA / step), s1 = Math.ceil(xB / step);
          for (let s = s0; s <= s1; s++) {
            // Vertices on a world-space lattice: the curve is a function of
            // world x alone, so panning or zooming never resamples it.
            const x = s * step;
            const y = y0 + (Math.sin(x * SHIMMER_K1 + t * 1.7 + ph) + Math.sin(x * SHIMMER_K2 - t * 2.6 + ph * 1.3) * 0.45) * amp;
            if (s === s0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
          }
          // Taper both ends, so a ribbon thins into the air rather than stops.
          const x0 = s0 * step, x1 = s1 * step;
          const body = ctx.createLinearGradient(x0, 0, x1, 0);
          const ab = (0.060 * a).toFixed(3), ac = (0.056 * a).toFixed(3);
          body.addColorStop(0, 'rgba(255,236,190,0)');
          body.addColorStop(0.3, `rgba(255,236,190,${ab})`);
          body.addColorStop(0.7, `rgba(255,236,190,${ab})`);
          body.addColorStop(1, 'rgba(255,236,190,0)');
          ctx.strokeStyle = body;
          ctx.lineWidth = 40; ctx.stroke();              // wide, soft body
          const core = ctx.createLinearGradient(x0, 0, x1, 0);
          core.addColorStop(0, 'rgba(255,248,224,0)');
          core.addColorStop(0.35, `rgba(255,248,224,${ac})`);
          core.addColorStop(0.65, `rgba(255,248,224,${ac})`);
          core.addColorStop(1, 'rgba(255,248,224,0)');
          ctx.strokeStyle = core;
          ctx.lineWidth = 16; ctx.stroke();              // a little brighter through the middle
        }
      }
      ctx.restore();
    },
  };
})();

// Soft blobs drifting across the world with velocity (vx, vy) world px/s:
// lattice cells `S` world px apart, each with a hashed jitter, size and
// pulse, laid out in a frame that moves with the drift, so they slide in
// from one edge of the view and out of the other and never pop. Shared by
// the dust storm's billows and the fog's banks.
function _driftBlobs(ctx, t, vx, vy, S, rgb, alpha, rMin, rMax, seed) {
  const zoom = Camera.zoom;
  const left = Camera.x, top = Camera.y, w = window.innerWidth / zoom, h = window.innerHeight / zoom;
  const dx = vx * t, dy = vy * t, R = S * rMax;
  const c0 = Math.floor((left - dx - R) / S), c1 = Math.ceil((left + w - dx + R) / S);
  const r0 = Math.floor((top - dy - R) / S),  r1 = Math.ceil((top + h - dy + R) / S);
  const hash = (a, b) => { let x = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453; return x - Math.floor(x); };
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const h1 = hash(c, r), h2 = hash(c + 17, r - 9), h3 = hash(c - 31, r + 5);
    const a = alpha * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.25 + h3 * 20))) * (0.5 + h2 * 0.5);
    if (a < 0.004) continue;
    const x = c * S + h1 * S + dx, y = r * S + h2 * S + dy, rad = S * (rMin + (rMax - rMin) * h3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`);
    g.addColorStop(0.6, `rgba(${rgb},${(a * 0.5).toFixed(3)})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

/* Dust storm (weather_events.js 'dust'): a brown haze over the whole view,
   billows of dust rolling across it downwind and fine grit streaking past,
   eased in and out. Drawn over the finished scene, like the heat wave.
   What it leaves on the solar panels is power_network.js's (SolarDust). */
const DustSystem = (() => {
  let intensity = 0, target = 0;
  // The heading the storm blows on, taken from the wind as it rolls in and
  // held while it lasts. The billows and streamers sit at heading × the
  // render clock, which runs from page load, so following WindState.dir as
  // it veered swung them by clock × angle: hundreds of px a frame an hour
  // in, a storm that lurched about instead of drifting.
  let heading = 0;
  // Dust settled over the whole city, 0..1: buildings take on a dusty film
  // (BuildingSnow draws it while there's no snow).
  // It builds while a storm blows and goes the way the panels' does
  // (power_network.js): rain washes it off, otherwise it slowly blows
  // clear. Saved with the world.
  let settled = 0, lastT;
  const SETTLE = 0.0035, CLEAR = 0.0004;   // per game second, like the panels'
  const WASH = { rainfall: 0.005, rainstorm: 0.012, snowfall: 0.002, blizzard: 0.004, storm: 0.002 };
  return {
    get intensity() { return intensity; },
    get settled()   { return settled; },
    // A storm arriving over a last one still fading out keeps its heading.
    start() { if (intensity < 0.01) heading = WindState.dir; target = 1; },
    stop()  { target = 0; },
    snap()  { intensity = target; heading = WindState.dir; },   // restored from a save: no fade-in
    load(v) { settled = Math.max(0, Math.min(1, +v || 0)); },
    serialise() { return settled; },
    tick(dt) {
      intensity += (target - intensity) * Math.min(1, dt * (target > intensity ? 0.15 : 0.08));
      if (intensity < 0.001 && target === 0) intensity = 0;
      // Settled dust runs on the game clock, so it keeps pace at any sim speed.
      const now = DayNight.getElapsed();
      let gdt = lastT === undefined ? 0 : now - lastT;
      lastT = now;
      if (gdt <= 0 || gdt > 30) return;   // paused, a load or a clock jump
      const type = typeof WeatherEventSystem !== 'undefined' ? (WeatherEventSystem.getActiveEvent() || {}).type : null;
      if (type === 'dust') settled = Math.min(1, settled + SETTLE * gdt);
      else if (settled > 0) settled = Math.max(0, settled - (CLEAR + (WASH[type] || 0)) * gdt);
    },
    render(ctx, t) {
      if (intensity < 0.01) return;
      const k = intensity, zoom = Camera.zoom;
      const left = Camera.x, top = Camera.y, w = window.innerWidth / zoom, h = window.innerHeight / zoom;
      const day = 1 - (typeof DayNight !== 'undefined' ? DayNight.darkness() : 0) * 0.6;
      const vx = Math.cos(heading), vy = Math.sin(heading);
      ctx.save();
      // The haze: ochre, heavier toward the top of the view.
      const g = ctx.createLinearGradient(0, top, 0, top + h);
      g.addColorStop(0, `rgba(176,128,66,${(0.34 * k * day).toFixed(3)})`);
      g.addColorStop(1, `rgba(150,110,62,${(0.24 * k * day).toFixed(3)})`);
      ctx.fillStyle = g; ctx.fillRect(left, top, w, h);
      // Billows rolling downwind; coarser lattice zoomed out, so the count stays flat.
      const S = 260 * Math.max(1, 0.6 / zoom);
      _driftBlobs(ctx, t, vx * 140, vy * 140, S, '190,146,88', 0.38 * k * day, 0.9, 1.7, 3);
      // Sand on the wind, the way a desert sandstorm reads: long soft
      // streamers of sand sweeping across in waves, and loose grains
      // tumbling along with them on wavy paths. Anchored to the world, like
      // the billows: laid out in a frame turned to the wind (along / across
      // it, world px), in a pattern that repeats every P world px both ways,
      // drifting downwind with time. Panning slides past it; zooming scales
      // it like the ground. Each streamer and grain takes its lane and phase
      // from its index, so nothing pops in or out.
      {
        const ux = vx, uy = vy, qx = -uy, qy = ux;                 // along and across the wind
        const lv = typeof GfxQuality !== 'undefined' ? GfxQuality.level() : 2;
        const hsh = (i, s) => { const v = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return v - Math.floor(v); };
        // The view's extent in the wind frame.
        let aMin = Infinity, aMax = -Infinity, cMin = Infinity, cMax = -Infinity;
        for (const [x, y] of [[left, top], [left + w, top], [left, top + h], [left + w, top + h]]) {
          const a = x * ux + y * uy, c = x * qx + y * qy;
          aMin = Math.min(aMin, a); aMax = Math.max(aMax, a); cMin = Math.min(cMin, c); cMax = Math.max(cMax, c);
        }
        const toWorld = (a, c) => [ux * a + qx * c, uy * a + qy * c];
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';

        // Streamers: wavy bands, thick and faint with a brighter core,
        // fading out at both ends. Fewer per tile zoomed out, where many
        // tiles are on screen at once.
        const P = 2000;
        const NS = Math.round((lv >= 2 ? 15 : lv >= 1 ? 10 : 6) * (zoom < 0.5 ? 0.5 : 1));
        const reach = 1200 + 140;                                  // longest streamer, plus wave and width
        for (let kA = Math.floor((aMin - P) / P); kA <= Math.ceil((aMax + reach) / P); kA++)
          for (let kC = Math.floor((cMin - 140) / P); kC <= Math.ceil((cMax + 140) / P); kC++)
            for (let i = 0; i < NS; i++) {
              const f1 = hsh(i, 1), f2 = hsh(i, 2), f3 = hsh(i, 3);
              const len = 500 + 700 * f3, speed = 380 + f2 * 320;
              const head = ((f1 * P + t * speed) % P) + kA * P;
              if (head < aMin || head - len > aMax) continue;
              const amp = 18 + f3 * 40, thick = 34 + f3 * 56, lane = f2 * P + kC * P;
              if (lane + amp + thick < cMin || lane - amp - thick > cMax) continue;
              const wl = 0.004 + f1 * 0.005, a = (0.085 + 0.07 * f1) * k * day;
              const pts = [];
              for (let s2 = 0; s2 <= 24; s2++) {
                const al = head - len * (s2 / 24);
                pts.push(toWorld(al, lane + Math.sin(al * wl + t * (1.5 + f2) + i) * amp));
              }
              const [hx, hy] = pts[0], [tx, ty] = pts[pts.length - 1];
              // Layered wide-and-faint to narrow, so the band's edges fall
              // off softly into the haze instead of ending on a line.
              for (const [wd, mul, col] of [[thick * 1.9, 0.3, '196,154,96'], [thick * 1.3, 0.4, '196,154,96'], [thick * 0.8, 0.5, '204,164,106'], [thick * 0.4, 0.55, '214,176,118']]) {
                const g = ctx.createLinearGradient(tx, ty, hx, hy);
                g.addColorStop(0, `rgba(${col},0)`);
                g.addColorStop(0.35, `rgba(${col},${(a * mul).toFixed(3)})`);
                g.addColorStop(0.8, `rgba(${col},${(a * mul).toFixed(3)})`);
                g.addColorStop(1, `rgba(${col},0)`);
                ctx.strokeStyle = g; ctx.lineWidth = wd;
                ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
                for (let s2 = 1; s2 < pts.length; s2++) ctx.lineTo(pts[s2][0], pts[s2][1]);
                ctx.stroke();
              }
            }

        // Grains: round, in three sizes, bobbing on wavy paths as they go.
        // Too small to see zoomed well out, so skipped there.
        if (zoom > 0.4) {
          const PG = 800;
          for (const [n, speed, size, col, a0] of [
            [lv >= 2 ? 170 : 90, 300, 1.0, '214,178,120', 0.4],
            [lv >= 2 ? 90 : 50,  470, 1.5, '200,160,102', 0.5],
            [lv >= 1 ? 32 : 20,  650, 2.1, '180,138,86',  0.55],
          ]) {
            ctx.fillStyle = `rgba(${col},${(a0 * k * day).toFixed(3)})`;
            ctx.beginPath();
            for (let kA = Math.floor((aMin - PG) / PG); kA <= Math.ceil(aMax / PG); kA++)
              for (let kC = Math.floor((cMin - 30) / PG); kC <= Math.ceil((cMax + 30) / PG); kC++)
                for (let i = 0; i < n; i++) {
                  const f1 = hsh(i, size * 5), f2 = hsh(i, size * 9);
                  const al = ((f1 * PG + t * speed * (0.8 + f2 * 0.4)) % PG) + kA * PG;
                  if (al < aMin - 4 || al > aMax + 4) continue;
                  const ac = f2 * PG + kC * PG + Math.sin(al * 0.012 + t * 3 + i) * (8 + f1 * 14);
                  if (ac < cMin - 4 || ac > cMax + 4) continue;
                  const [x, y] = toWorld(al, ac), r = size * (0.7 + f2 * 0.6);
                  ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2);
                }
            ctx.fill();
          }
        }
      }
      ctx.restore();
    },
  };
})();

/* Fog (weather_events.js 'fog'): a pale veil over the view with banks of
   denser fog drifting slowly through it. Rolls in over half a minute or so
   and burns off more slowly once the event ends. The night overlay drawn
   after it greys it down after dark. */
const FogSystem = (() => {
  let intensity = 0, target = 0;
  let heading = 0;   // held from when it rolls in, as DustSystem's is
  return {
    get intensity() { return intensity; },
    start() { if (intensity < 0.01) heading = WindState.dir; target = 1; },
    stop()  { target = 0; },
    snap()  { intensity = target; heading = WindState.dir; },   // restored from a save: no fade-in
    tick(dt) {
      intensity += (target - intensity) * Math.min(1, dt * (target > intensity ? 0.05 : 0.02));
      if (intensity < 0.001 && target === 0) intensity = 0;
    },
    render(ctx, t) {
      if (intensity < 0.01) return;
      const k = intensity, zoom = Camera.zoom;
      const left = Camera.x, top = Camera.y, w = window.innerWidth / zoom, h = window.innerHeight / zoom;
      const dir = heading;
      ctx.save();
      ctx.fillStyle = `rgba(214,220,226,${(0.3 * k).toFixed(3)})`;
      ctx.fillRect(left, top, w, h);
      // Banks of thicker fog creeping along on the faint breeze.
      const S = 300 * Math.max(1, 0.6 / zoom);
      _driftBlobs(ctx, t, Math.cos(dir) * 14, Math.sin(dir) * 14, S, '226,231,236', 0.42 * k, 1.0, 1.9, 11);
      ctx.restore();
    },
  };
})();

/* Wildfire smoke (weather_events.js 'smoke'): a brown-orange veil, heavier
   toward the top of the view, banks of thicker smoke rolling downwind, a
   faint orange cast over everything, and ash drifting down through it,
   world-anchored like the dust storm's grains, with the odd ember glowing
   in it after dark. Rolls in over a minute or so, clears more slowly. */
const SmokeSystem = (() => {
  let intensity = 0, target = 0;
  let heading = 0;   // held from when it rolls in, as FogSystem's is
  return {
    get intensity() { return intensity; },
    start() { if (intensity < 0.01) heading = WindState.dir; target = 1; },
    stop()  { target = 0; },
    snap()  { intensity = target; heading = WindState.dir; },   // restored from a save: no fade-in
    tick(dt) {
      intensity += (target - intensity) * Math.min(1, dt * (target > intensity ? 0.04 : 0.015));
      if (intensity < 0.001 && target === 0) intensity = 0;
    },
    render(ctx, t) {
      if (intensity < 0.01) return;
      const k = intensity, zoom = Camera.zoom;
      const left = Camera.x, top = Camera.y, w = window.innerWidth / zoom, h = window.innerHeight / zoom;
      const dark = typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;
      const day = 1 - dark * 0.6;
      const vx = Math.cos(heading), vy = Math.sin(heading);
      ctx.save();
      // The veil: smoky brown, thicker toward the top, and an orange cast
      // where the low sun comes through it.
      const g = ctx.createLinearGradient(0, top, 0, top + h);
      g.addColorStop(0, `rgba(118,98,88,${(0.24 * k * day).toFixed(3)})`);
      g.addColorStop(1, `rgba(128,112,104,${(0.12 * k * day).toFixed(3)})`);
      ctx.fillStyle = g; ctx.fillRect(left, top, w, h);
      const og = ctx.createLinearGradient(0, top, 0, top + h);
      og.addColorStop(0, `rgba(255,120,30,${(0.12 * k * day).toFixed(3)})`);
      og.addColorStop(1, `rgba(255,150,60,${(0.03 * k * day).toFixed(3)})`);
      ctx.fillStyle = og; ctx.fillRect(left, top, w, h);
      // Banks of thicker smoke rolling downwind.
      const S = 320 * Math.max(1, 0.6 / zoom);
      _driftBlobs(ctx, t, vx * 40, vy * 40, S, '108,98,94', 0.26 * k * day, 0.9, 2.0, 23);
      // Ash: pale flecks drifting down and downwind, with a few embers that
      // glow after dark. Too small to see zoomed well out.
      if (zoom > 0.4) {
        const lv = typeof GfxQuality !== 'undefined' ? GfxQuality.level() : 2;
        const P = 900, n = lv >= 2 ? 110 : lv >= 1 ? 70 : 40;
        const hsh = (i, s) => { const v = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return v - Math.floor(v); };
        const kx0 = Math.floor(left / P) - 1, kx1 = Math.ceil((left + w) / P);
        const ky0 = Math.floor(top / P) - 1, ky1 = Math.ceil((top + h) / P);
        ctx.fillStyle = `rgba(214,206,196,${(0.55 * k).toFixed(3)})`;
        ctx.beginPath();
        const embers = [];
        for (let kx = kx0; kx <= kx1; kx++) for (let ky = ky0; ky <= ky1; ky++)
          for (let i = 0; i < n; i++) {
            const f1 = hsh(i, 1), f2 = hsh(i, 2), f3 = hsh(i, 3);
            const fall = 18 + f3 * 22, drift = 30 + f2 * 30;
            const x = kx * P + ((f1 * P + t * (vx * drift) + Math.sin(t * (0.7 + f2) + i) * 10) % P + P) % P;
            const y = ky * P + ((f2 * P + t * (fall + vy * drift)) % P + P) % P;
            if (x < left - 4 || x > left + w + 4 || y < top - 4 || y > top + h + 4) continue;
            if (dark > 0.3 && f3 > 0.94) { embers.push(x, y, f1); continue; }
            const r = 0.8 + f3 * 1.1;
            ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2);
          }
        ctx.fill();
        for (let j = 0; j < embers.length; j += 3) {
          const fl = 0.5 + 0.5 * Math.sin(t * 7 + embers[j + 2] * 40);
          ctx.fillStyle = `rgba(255,${Math.round(120 + 80 * fl)},40,${(0.85 * k * (0.5 + 0.5 * fl)).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(embers[j], embers[j + 1], 1.4, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    },
  };
})();

/* Geomagnetic storm (weather_events.js 'geomag'): the aurora.
     • renderSky — drawn on the canvas just after the night overlay, so it
       glows over the darkened city, but laid out in a sky anchored to the
       world: panning moves past it, a little slower than the ground (the
       stars are pinned to the map itself). In it: stars; a deep red glow
       high up; curtains every so far down the
       map, each a run of vertical rays that brighten and fade, green at
       the lower fringe through teal and violet to red at the top, with a
       hot bright edge throwing light on the ground below; a corona of
       rays fanning out from points overhead; and a green and violet wash.
       The storm breathes: every few minutes a substorm swells it, the red
       flares magenta and the corona blazes. Full strength by night, a
       ghost of itself by day.
     • renderSparks — in the world, with the other night lights: water
       mirroring the sky; induced current shimmering along the power lines
       in slow green-violet waves, crackling off them now and then; and
       arcing across substations, batteries and power towers.
     • surge(wires) — weather_events.js calls it when induced current trips
       lines: a violet flash across the sky, the city's lights browning out
       for a moment, and a bolt leaping off each tripped wire.
   The curtains are a single gradient per band, stretched to each column's
   height by the transform rather than rebuilt per column. Eased in and out
   like the other weather visuals. */
const AuroraSystem = (() => {
  let intensity = 0, target = 0;
  let surgeK = 0, lastT = null;
  const bursts = [];   // { x, y, age } world px: a tripped wire's bolt
  // The sky is a layer of its own over the map, anchored to the world so
  // panning moves past it, a little slower than the ground (it is high up).
  // Positions in it are sky units; SKY_SCALE * zoom^0.75 screen px to one.
  const SKY_SCALE = 0.8;
  const BAND_GAP  = 430;    // sky units between curtains, down the map
  const CORONA_GAP = 2600;  // and between the points the corona fans from
  // Curtain colours, taken in turn down the map: fringe, body, top.
  const BANDS = [
    { fringe: '190,255,215', body: '60,255,150',  top: '150,90,255' },
    { fringe: '170,255,240', body: '40,230,190',  top: '120,110,255' },
    { fringe: '255,190,240', body: '120,255,170', top: '230,90,220' },
    { fringe: '210,255,200', body: '90,255,120',  top: '190,80,255' },
  ];
  const _hash = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
  // How hard the storm is blowing right now, 0.45..1: a slow swell with a
  // substorm every few minutes, and a jolt whenever lines trip.
  const _activity = t => {
    const s = 0.5 + 0.5 * Math.sin(t * 0.045) * Math.sin(t * 0.019 + 1.3);
    return Math.min(1, 0.45 + 0.55 * Math.pow(s, 1.5) + surgeK * 0.5);
  };
  return {
    get intensity() { return intensity; },
    // How hard the storm is blowing now, 0.45..1 (GeomagAudio follows it).
    get activity() { return _activity(lastT ?? 0); },
    // 0..1 through a substorm, the magenta flare in the sky (weather_events.js
    // bunches its line trips into these).
    get substorm() { return Math.max(0, (_activity(lastT ?? 0) - 0.7) / 0.3); },
    start() { target = 1; },
    stop()  { target = 0; },
    // Jump straight to where it is heading: a storm restored from a save
    // was already in full swing, so it should not fade in again.
    snap()  { intensity = target; },
    tick(dt) {
      intensity += (target - intensity) * Math.min(1, dt * (target > intensity ? 0.06 : 0.03));
      if (intensity < 0.001 && target === 0) intensity = 0;
    },
    // Induced current just tripped `wires`: flash and a bolt off each.
    surge(wires) {
      surgeK = 1;
      for (const w of wires || []) if (bursts.length < 24) bursts.push({ x: (w.col + 0.5) * TILE, y: (w.row + 0.5) * TILE, age: 0, seed: Math.random() * 100 });
    },

    // Screen space (identity transform), W x H canvas px, but everything in
    // it placed in sky units anchored to the world (see SKY_SCALE).
    renderSky(ctx, t, W, H) {
      // The surge and bolts fade on the render clock, so fast-forward
      // doesn't flick them past unseen.
      const dt = lastT === null ? 0 : Math.min(0.1, Math.max(0, t - lastT));
      lastT = t;
      surgeK = Math.max(0, surgeK - dt * 0.6);
      for (let i = bursts.length - 1; i >= 0; i--) if ((bursts[i].age += dt) > 1.6) bursts.splice(i, 1);
      if (intensity < 0.01) return;
      const dark = typeof DayNight !== 'undefined' ? DayNight.darkness() : 1;
      const k = intensity * (0.18 + 0.82 * dark);
      if (k < 0.01) return;
      const lv = typeof GfxQuality !== 'undefined' ? GfxQuality.level() : 2;
      const act = _activity(t);
      const sub = Math.max(0, (act - 0.7) / 0.3);   // 0..1 through a substorm
      const night = 1 + 0.4 * dark;                  // the curtains brighten after dark

      // Sky units ↔ canvas px, about the view's centre.
      const z = Camera.zoom, D = W / window.innerWidth;
      const S = SKY_SCALE * Math.pow(z, 0.75) * D;
      const wcx = Camera.x + window.innerWidth / z / 2, wcy = Camera.y + window.innerHeight / z / 2;
      const toU = x => (x - W / 2) / S + wcx;
      const toX = u => W / 2 + (u - wcx) * S;
      const toY = v => H / 2 + (v - wcy) * S;
      ctx.save();

      // The lights browning out as the surge hits the grid: a flickering
      // dimming under the sky, so the aurora itself stays bright.
      if (surgeK > 0.02 && dark > 0.05) {
        const fl = surgeK * (0.5 + 0.5 * Math.sin(t * 47) * Math.sin(t * 31 + 1));
        ctx.fillStyle = `rgba(2,0,10,${(0.32 * fl * dark * intensity).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.globalCompositeOperation = 'lighter';

      // Stars, by night only: pinned to the map, not the sky layer, so they
      // stay put under the camera. Each square tile of the world holds a fixed
      // list of them; zoomed out, only the first m of each list are drawn (the
      // last fading), so they thin out without any star moving.
      const sk = intensity * dark;
      if (sk > 0.02) {
        const SS = z * D, TILE_W = 1024, MAX_PER_TILE = 256, MAX_DRAWN = 1400;
        const m = Math.min(MAX_PER_TILE, MAX_DRAWN * (TILE_W * SS) * (TILE_W * SS) / (W * H));
        const n = Math.ceil(m);
        const i0 = Math.floor((wcx - W / 2 / SS) / TILE_W), i1 = Math.floor((wcx + W / 2 / SS) / TILE_W);
        const j0 = Math.floor((wcy - H / 2 / SS) / TILE_W), j1 = Math.floor((wcy + H / 2 / SS) / TILE_W);
        ctx.fillStyle = '#e4eaff';
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (let q = 0; q < n; q++) {
          const a1 = i * 53 + q * 1.37, b1 = j * 97 - q * 0.71;
          const x = W / 2 + ((i + _hash(a1, b1)) * TILE_W - wcx) * SS, y = H / 2 + ((j + _hash(b1, a1 + 0.5)) * TILE_W - wcy) * SS;
          if (x < -12 * D || x > W + 12 * D || y < -12 * D || y > H + 12 * D) continue;
          const big = Math.pow(_hash(a1 + 0.3, b1), 4), r = (0.6 + 1.8 * big) * D;
          const a = sk * Math.min(1, m - q) * (0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * (1 + 3 * _hash(b1, a1)) + q * 1.7 + i + j)));
          ctx.globalAlpha = a;
          ctx.fillRect(x - r / 2, y - r / 2, r, r);
          if (big > 0.35) { ctx.globalAlpha = a * 0.4; ctx.fillRect(x - r * 2.2, y - 0.4 * D, r * 4.4, 0.8 * D); ctx.fillRect(x - 0.4 * D, y - r * 2.2, 0.8 * D, r * 4.4); }
        }
        ctx.globalAlpha = 1;
      }

      // The wash: the sky lit green and violet, deep red high up, flaring
      // magenta in a substorm.
      const wash = ctx.createLinearGradient(0, 0, 0, H);
      wash.addColorStop(0,    `rgba(${Math.round(200 + 55 * sub)},40,${Math.round(90 + 80 * sub)},${(k * (0.10 + 0.14 * sub)).toFixed(3)})`);
      wash.addColorStop(0.3,  `rgba(120,70,255,${(0.09 * k * act).toFixed(3)})`);
      wash.addColorStop(0.65, `rgba(40,255,160,${(0.07 * k * act).toFixed(3)})`);
      wash.addColorStop(1,    `rgba(40,255,160,${(0.04 * k * act).toFixed(3)})`);
      ctx.fillStyle = wash; ctx.fillRect(0, 0, W, H);

      // The corona: from points fixed in the sky, rays fanning out every
      // way, as an aurora looks straight overhead. Faint whenever it is
      // dark, blazing in a substorm.
      const ck = k * (0.25 * dark + 0.75 * sub);
      if (ck > 0.02) {
        const R = 1500 * S;
        const ci0 = Math.floor((toU(-R)) / CORONA_GAP), ci1 = Math.floor(toU(W + R) / CORONA_GAP);
        const cj0 = Math.floor((wcy - (H / 2 + R) / S) / CORONA_GAP), cj1 = Math.floor((wcy + (H / 2 + R) / S) / CORONA_GAP);
        const N = lv >= 2 ? 36 : lv >= 1 ? 24 : 16;
        for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
          const zx = toX((ci + 0.25 + 0.5 * _hash(ci, cj)) * CORONA_GAP), zy = toY((cj + 0.25 + 0.5 * _hash(cj, ci)) * CORONA_GAP);
          if (zx < -R || zx > W + R || zy < -R || zy > H + R) continue;
          const cg = ctx.createRadialGradient(zx, zy, 0, zx, zy, R);
          cg.addColorStop(0,    'rgba(255,230,255,0.7)');
          cg.addColorStop(0.08, 'rgba(220,130,255,0.45)');
          cg.addColorStop(0.3,  'rgba(90,255,180,0.25)');
          cg.addColorStop(0.7,  'rgba(60,220,200,0.06)');
          cg.addColorStop(1,    'rgba(60,220,200,0)');
          ctx.fillStyle = cg;
          const spin = t * 0.02 + _hash(ci, cj) * 6.28;
          // Each ray twice, wide and faint then narrow, so its sides feather
          // off instead of ending in a hard edge.
          for (let g = 0; g < 3; g++) for (const spread of [2.4, 1]) {
            ctx.beginPath();
            for (let i = g; i < N; i += 3) {
              const a0 = spin + (i / N) * Math.PI * 2 + Math.sin(t * 0.13 + i) * 0.03;
              const wd = (0.012 + 0.02 * _hash(i, ci + cj * 7)) * spread;
              const len = R * (0.55 + 0.45 * _hash(i, cj - ci));
              ctx.moveTo(zx, zy);
              ctx.lineTo(zx + Math.cos(a0 - wd) * len, zy + Math.sin(a0 - wd) * len);
              ctx.lineTo(zx + Math.cos(a0 + wd) * len, zy + Math.sin(a0 + wd) * len);
              ctx.closePath();
            }
            ctx.globalAlpha = Math.min(1, 0.5 * ck * (0.07 + 0.11 * (0.5 + 0.5 * Math.sin(t * (0.9 + g * 0.4) + g * 2))));
            ctx.fill();
          }
          // The bright knot the rays spring from.
          ctx.globalAlpha = Math.min(1, ck * (0.6 + 0.4 * Math.sin(t * 2.3)));
          const kg = ctx.createRadialGradient(zx, zy, 0, zx, zy, 160 * S);
          kg.addColorStop(0, 'rgba(255,235,255,0.8)'); kg.addColorStop(1, 'rgba(200,120,255,0)');
          ctx.fillStyle = kg; ctx.fillRect(zx - 160 * S, zy - 160 * S, 320 * S, 320 * S);
        }
        ctx.globalAlpha = 1;
      }

      // The curtains: one every BAND_GAP down the map, each a wavering
      // line of rays rising off a bright lower edge.
      const step = lv >= 2 ? 3 : lv >= 1 ? 4 : 6;
      const HTmax = 700 * (0.85 + 0.35 * act), AMPmax = 130;
      const BELOW = 0.3;   // how far under its edge a curtain fades out, in curtain heights
      const j0 = Math.floor((wcy - (H / 2) / S - AMPmax - BELOW * HTmax) / BAND_GAP);
      const j1 = Math.ceil((wcy + (H / 2) / S + HTmax + AMPmax) / BAND_GAP);
      for (let j = j0; j <= j1; j++) {
        const B = BANDS[((j % BANDS.length) + BANDS.length) % BANDS.length];
        const ph = _hash(j, 1.7) * 6.28, sp = 0.25 + 0.2 * _hash(j, 2.9);
        const amp = (60 + 70 * _hash(j, 3.1)) * (0.8 + 0.4 * act);
        const HT = (420 + 280 * _hash(j, 4.3)) * (0.85 + 0.35 * act);
        const by = toY(j * BAND_GAP + 120 * _hash(j, 5.5));
        // Long, uneven waves: each curtain gets its own wavelength (about
        // 1.6 to 3 times the old one), and a slow warp along it stretches
        // some waves and bunches others, so no two swings are the same size.
        const fs = 0.33 + 0.3 * _hash(j, 7.7);
        const warp = u => u + Math.sin(u * 0.0007 + ph * 1.3) * 520 + Math.sin(u * 0.0016 - ph) * 180;
        const yAt = u => {
          const w = warp(u);
          return by + (Math.sin(w * 0.0034 * fs + t * sp + ph) * amp
                     + Math.sin(w * 0.0088 * fs - t * sp * 1.7 + ph * 2) * amp * 0.35) * S;
        };
        if (by + (AMPmax + BELOW * HTmax) * S < 0 || by - (HT + AMPmax) * S > H) continue;
        // One gradient for the band, in unit space: BELOW under the edge
        // (nothing) through 0 at the edge to -1 at the top; violet up top
        // running to red as a substorm builds, with a red fringe above that
        // after dark. The light fades in from below the edge and peaks just
        // above it, so a curtain has no line along its bottom and melts into
        // the one beneath it.
        const top = sub > 0.05 ? `${Math.round(150 + 105 * sub)},${Math.round(90 - 40 * sub)},${Math.round(255 - 110 * sub)}` : B.top;
        const g = ctx.createLinearGradient(0, BELOW, 0, -1);
        const at = y => (BELOW - y) / (BELOW + 1);   // unit y → gradient stop
        g.addColorStop(0,         `rgba(${B.fringe},0)`);
        g.addColorStop(at(0.12),  `rgba(${B.fringe},0.12)`);
        g.addColorStop(at(0),     `rgba(${B.body},0.38)`);
        g.addColorStop(at(-0.12), `rgba(${B.body},0.6)`);
        g.addColorStop(at(-0.4),  `rgba(${B.body},0.4)`);
        g.addColorStop(at(-0.68), `rgba(${top},${(0.25 + 0.2 * sub).toFixed(3)})`);
        g.addColorStop(at(-0.88), `rgba(255,60,110,${(0.12 * dark + 0.15 * sub).toFixed(3)})`);
        g.addColorStop(1,         'rgba(255,60,110,0)');
        ctx.fillStyle = g;
        for (let x = -step; x < W + step; x += step) {
          const u = toU(x);
          // Rays: columns brightening and fading at their own pace, under
          // a slower swell that rolls along the curtain, and a quick
          // flicker racing along it while the storm is up.
          // Kept low-contrast and broad so the rays read as soft folds, not streaks.
          const ray = 0.5 + 0.5 * Math.sin(u * 0.02 + t * 1.2 + ph + Math.sin(u * 0.012 + t * 0.3) * 2);
          const swell = 0.6 + 0.4 * Math.sin(u * 0.0048 - t * 0.6 + ph);
          const flick = 1 + 0.25 * act * Math.max(0, Math.sin(u * 0.018 - t * 3.5 + ph * 5));
          const a = k * act * night * (0.14 + 0.2 * ray * swell) * flick;
          if (a < 0.004) continue;
          // The rise and fall of the curtain's height follows the same uneven
          // stretch, at about half its old rate.
          const hc = HT * S * (0.6 + 0.4 * Math.sin(warp(u) * 0.0136 * (0.4 + 0.3 * _hash(j, 8.3)) + t * 0.5 + ph * 3)) * (0.92 + 0.16 * (0.5 + 0.5 * Math.sin(u * 0.08 + ph) * Math.sin(u * 0.031 - ph)));
          // Each column is exactly two steps wide, so every pixel is under
          // exactly two of them: an even sheet, with no pinstripes from
          // uneven overlap.
          ctx.globalAlpha = Math.min(1, a * 0.55);
          ctx.setTransform(1, 0, 0, hc, x, yAt(u));
          ctx.fillRect(-step, -1, step * 2, 1 + BELOW);
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;

        // The veil: a soft sheet of light the rays hang in, so the curtain
        // glows as a whole and not only in rays. One gradient over the full
        // width, fading to nothing both below the lowest the edge swings and
        // well under the top, so it never shows an edge of its own.
        const vTop = by - HT * S * 0.7, vBot = by + (AMPmax + 80) * S;
        const vg = ctx.createLinearGradient(0, vBot, 0, vTop);
        const vMid = (vBot - by) / (vBot - vTop);
        vg.addColorStop(0,    `rgba(${B.body},0)`);
        vg.addColorStop(vMid, `rgba(${B.body},${(0.1 * k * act * night).toFixed(3)})`);
        vg.addColorStop(vMid + (1 - vMid) * 0.45, `rgba(${top},${(0.05 * k * act * night).toFixed(3)})`);
        vg.addColorStop(1,    `rgba(${top},0)`);
        ctx.fillStyle = vg; ctx.fillRect(0, vTop, W, vBot - vTop);

        // Pulses of light racing along the lower edge, the storm surging
        // through the curtain, each lifting a soft glow up into it. Brighter
        // in a substorm.
        const PG = 2400;
        const pa = Math.min(1, k * act * night * (0.5 + 0.5 * sub));
        const off = (t * (220 + 120 * _hash(j, 6.1)) + ph * 400) % PG;
        for (let pu = Math.floor((toU(-300) - off) / PG) * PG + off; toX(pu) < W + 300; pu += PG) {
          const px = toX(pu), py = yAt(pu), pr = 220 * S;
          ctx.save(); ctx.translate(px, py); ctx.scale(1, 0.35);
          const pg = ctx.createRadialGradient(0, 0, 0, 0, 0, pr);
          pg.addColorStop(0,   `rgba(${B.fringe},${(0.35 * pa).toFixed(3)})`);
          pg.addColorStop(0.3, `rgba(${B.body},${(0.15 * pa).toFixed(3)})`);
          pg.addColorStop(1,   `rgba(${B.body},0)`);
          ctx.fillStyle = pg; ctx.fillRect(-pr, -pr, pr * 2, pr * 2);
          ctx.restore();
          // The glow it lifts: a tall soft ellipse, no hard sides.
          const rx = pr * 0.5, ry = HT * S * 0.4;
          ctx.save(); ctx.translate(px, py - ry * 0.8); ctx.scale(1, ry / rx);
          const lg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
          lg.addColorStop(0, `rgba(${B.body},${(0.16 * pa).toFixed(3)})`);
          lg.addColorStop(1, `rgba(${top},0)`);
          ctx.fillStyle = lg; ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
          ctx.restore();
        }
      }

      // The surge: the whole sky flashing violet-white.
      if (surgeK > 0.02) {
        const fg = ctx.createRadialGradient(W / 2, H * 0.2, 0, W / 2, H * 0.2, Math.max(W, H));
        fg.addColorStop(0, `rgba(210,190,255,${(0.35 * surgeK * surgeK * intensity).toFixed(3)})`);
        fg.addColorStop(1, `rgba(120,80,255,${(0.08 * surgeK * intensity).toFixed(3)})`);
        ctx.fillStyle = fg; ctx.fillRect(0, 0, W, H);
      }
      ctx.restore();
    },

    // A jagged line from (x0,y0) heading `ang` for `len`, as points.
    _bolt(x0, y0, ang, len, segs, seed) {
      const pts = [[x0, y0]];
      for (let s = 1; s <= segs; s++) {
        const f = s / segs;
        const j = (s < segs ? (_hash(seed * 7 + s, seed) - 0.5) * len * 0.5 : 0);
        pts.push([x0 + Math.cos(ang) * len * f - Math.sin(ang) * j, y0 + Math.sin(ang) * len * f + Math.cos(ang) * j]);
      }
      return pts;
    },
    _strokeBolt(ctx, pts, a, w = 1) {
      for (const [lw, col] of [[3.2 * w, `rgba(140,150,255,${(0.35 * a).toFixed(3)})`], [1.1 * w, `rgba(235,240,255,${(0.95 * a).toFixed(3)})`]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
        for (let s = 1; s < pts.length; s++) ctx.lineTo(pts[s][0], pts[s][1]);
        ctx.stroke();
      }
    },

    // World space (camera transform), with the night lights.
    renderSparks(ctx, t, cStart, cEnd, rStart, rEnd) {
      if (intensity < 0.05 && !bursts.length) return;
      const dark = typeof DayNight !== 'undefined' ? DayNight.darkness() : 1;
      const lv = typeof GfxQuality !== 'undefined' ? GfxQuality.level() : 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      // Water mirroring the sky: open water in view washed green and violet
      // in long drifting bands, with soft columns of reflected curtain light
      // swaying across it. Painted smooth and cut to the water by its own
      // shoreline (WaterLook.paintOnWater), so it follows the rounded banks.
      const rk = intensity * dark * _activity(t);
      if (rk > 0.03 && typeof WaterLook !== 'undefined' && WaterLook.enabled && WaterLook.paintOnWater) {
        const x0 = cStart * TILE, x1 = (cEnd + 1) * TILE, y0 = rStart * TILE, y1 = (rEnd + 1) * TILE;
        WaterLook.paintOnWater(ctx, (g, m, H) => {
          g.setTransform(m.a * H, 0, 0, m.d * H, m.e * H, m.f * H);
          const col = (hue, a) => `rgba(${Math.round(60 + 140 * hue)},${Math.round(255 - 150 * hue)},${Math.round(170 + 85 * hue)},${a.toFixed(3)})`;
          // The wash: hue drifting in long bands down the map.
          const wash = g.createLinearGradient(0, y0, 0, y1);
          for (let i = 0; i <= 8; i++) {
            const y = y0 + (y1 - y0) * i / 8;
            wash.addColorStop(i / 8, col(0.5 + 0.5 * Math.sin(y * 0.004 + t * 0.2), 0.12 * rk));
          }
          g.fillStyle = wash; g.fillRect(x0, y0, x1 - x0, y1 - y0);
          // Reflected curtains: soft bright columns sliding slowly sideways.
          const cols = g.createLinearGradient(x0, 0, x1, 0);
          for (let i = 0; i <= 24; i++) {
            const x = x0 + (x1 - x0) * i / 24;
            const s = Math.max(0, Math.sin(x * 0.009 - t * 0.5) * Math.sin(x * 0.0031 + t * 0.21));
            cols.addColorStop(i / 24, col(0.5 + 0.5 * Math.sin(x * 0.002 + t * 0.15), 0.2 * rk * s));
          }
          g.fillStyle = cols; g.fillRect(x0, y0, x1 - x0, y1 - y0);
        });
      }

      // The power lines carrying induced current. Each straight run of wire
      // is traced as one line, so the light flows along it unbroken: a soft
      // halo breathing between green and violet, and packets of current
      // racing along it (dashes sliding down the line), some runs one way,
      // some the other, with faster sparks skittering between them.
      const wk = intensity * (0.3 + 0.7 * dark) * _activity(t);
      if (wk > 0.03 && Camera.zoom > 0.2) {
        const base = new Path2D(), fwd = new Path2D(), back = new Path2D();
        const isWire = n => n && (n.type === T.WIRE || n._underWire) && !n.failed;
        const at = (c, r) => isWire(GridManager.getEntity(c, r));
        const seenH = new Set(), seenV = new Set();
        let any = false;
        const crackles = [];
        // One run from (c0,r0) to (c1,r1), tile centres; the hash of its
        // start picks which way its current flows.
        const runs = [];   // [from x, y, to x, y, seed]: in the current's direction
        const run = (c0, r0, c1, r1) => {
          const x0 = (c0 + 0.5) * TILE, y0 = (r0 + 0.5) * TILE, x1 = (c1 + 0.5) * TILE, y1 = (r1 + 0.5) * TILE;
          const h = _hash(c0 * 0.37, r0 * 0.53);
          base.moveTo(x0, y0); base.lineTo(x1, y1);
          if (h < 0.5) { fwd.moveTo(x0, y0); fwd.lineTo(x1, y1); runs.push([x0, y0, x1, y1, h]); }
          else { back.moveTo(x1, y1); back.lineTo(x0, y0); runs.push([x1, y1, x0, y0, h]); }
        };
        for (const w of EntityRegistry.getByType(T.WIRE)) {
          if (w.failed || w.col < cStart - 1 || w.col > cEnd || w.row < rStart - 1 || w.row > rEnd) continue;
          const key = w.col * 65536 + w.row;
          let lone = true;
          if (!seenH.has(key) && (at(w.col - 1, w.row) || at(w.col + 1, w.row))) {
            let c0 = w.col, c1 = w.col;
            while (c0 > cStart - 2 && at(c0 - 1, w.row)) c0--;
            while (c1 < cEnd + 1 && at(c1 + 1, w.row)) c1++;
            for (let c = c0; c <= c1; c++) seenH.add(c * 65536 + w.row);
            if (c1 > c0) run(c0, w.row, c1, w.row);
          }
          if (!seenV.has(key) && (at(w.col, w.row - 1) || at(w.col, w.row + 1))) {
            let r0 = w.row, r1 = w.row;
            while (r0 > rStart - 2 && at(w.col, r0 - 1)) r0--;
            while (r1 < rEnd + 1 && at(w.col, r1 + 1)) r1++;
            for (let r = r0; r <= r1; r++) seenV.add(w.col * 65536 + r);
            if (r1 > r0) run(w.col, r0, w.col, r1);
          }
          if (seenH.has(key) || seenV.has(key)) lone = false;
          const cx = (w.col + 0.5) * TILE, cy = (w.row + 0.5) * TILE;
          if (lone) { base.moveTo(cx - 1, cy); base.lineTo(cx + 1, cy); }
          any = true;
          // Now and then a crackle of induced current jumping off the line.
          const bucket = Math.floor(t * 6 + w.col * 0.37), seed = w.col * 0.731 + w.row * 0.377;
          if (_hash(bucket, seed) < 0.012 * wk) crackles.push([cx, cy, bucket, seed, (t * 6 + w.col * 0.37) - bucket]);
        }
        if (any) {
          // The halo: three widths stacked so it fades softly off the line,
          // its colour drifting between green and violet.
          const hue = 0.5 + 0.5 * Math.sin(t * 0.35);
          const breathe = 0.75 + 0.25 * Math.sin(t * 1.3);
          const rgb = `${Math.round(80 + 100 * hue)},${Math.round(255 - 120 * hue)},${Math.round(190 + 65 * hue)}`;
          // Many faint widths, so the edge is a gradual falloff, not a tube.
          ctx.strokeStyle = `rgba(${rgb},${(0.035 * wk * breathe).toFixed(3)})`;
          for (const lw of [TILE * 1.6, TILE * 1.25, TILE * 0.95, TILE * 0.7, TILE * 0.48, TILE * 0.3]) { ctx.lineWidth = lw; ctx.stroke(base); }
          ctx.strokeStyle = `rgba(200,255,235,${(0.22 * wk).toFixed(3)})`;
          ctx.lineWidth = 1; ctx.stroke(base);
          // Packets of current: a glow built of layers each shorter and
          // narrower than the last (centred on one another, so it swells
          // softly to the middle), and a gentle core; then the faster sparks.
          const pc = `rgba(${rgb},${(0.045 * wk).toFixed(3)})`, P = TILE * 3.3;
          const flows = [[1.3, 1.1], [1.05, 0.8], [0.8, 0.56], [0.55, 0.34]].map(([on, w]) =>
                           [TILE * on, P - TILE * on, 3.2, pc, TILE * w, TILE * (1.3 - on) / 2]);
          flows.push([TILE * 0.5, P - TILE * 0.5, 3.2, `rgba(225,255,240,${(0.4 * wk).toFixed(3)})`, 1.3, TILE * 0.4]);
          if (lv >= 1) flows.push([TILE * 0.12, TILE * 1.3, 7.5, `rgba(225,215,255,${(0.45 * wk).toFixed(3)})`, 1]);
          for (const [on, off, speed, col, lw, lead = 0] of flows) {
            ctx.setLineDash([on, off]);
            ctx.lineDashOffset = -t * TILE * speed - lead;
            ctx.strokeStyle = col; ctx.lineWidth = lw;
            ctx.stroke(fwd); ctx.stroke(back);
          }
          ctx.setLineDash([]); ctx.lineDashOffset = 0;
          // Arcs crawling along the runs: a jagged spark of current riding
          // each line end to end, re-striking every few frames, lighting the
          // ground round it as it goes.
          const flick = Math.floor(t * 18);
          for (let i = 0, n = Math.min(runs.length, lv >= 2 ? 80 : lv >= 1 ? 40 : 16); i < n; i++) {
            const [x0, y0, x1, y1, h] = runs[i];
            const len = Math.hypot(x1 - x0, y1 - y0), cyc = len + TILE * 4;
            const s = (t * TILE * (2.2 + 1.6 * h) + h * 997) % cyc - TILE * 2;
            if (s < -TILE * 0.6 || s > len + TILE * 0.6) continue;
            const dx = (x1 - x0) / len, dy = (y1 - y0) / len;
            const sx = x0 + dx * Math.max(0, Math.min(len, s)), sy = y0 + dy * Math.max(0, Math.min(len, s));
            const ga = Math.min(1, wk * 1.2);
            const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, TILE * 1.5);
            glow.addColorStop(0,   `rgba(200,210,255,${(0.28 * ga).toFixed(3)})`);
            glow.addColorStop(0.4, `rgba(170,185,255,${(0.1 * ga).toFixed(3)})`);
            glow.addColorStop(1,   'rgba(140,160,255,0)');
            ctx.fillStyle = glow; ctx.fillRect(sx - TILE * 1.5, sy - TILE * 1.5, TILE * 3, TILE * 3);
            const back0 = Math.min(TILE * 0.8, Math.max(0, s));
            this._strokeBolt(ctx, this._bolt(sx - dx * back0, sy - dy * back0, Math.atan2(dy, dx), back0 + TILE * 0.5, 5, flick + h * 31), ga * 0.55, 0.6);
          }
          for (const [cx, cy, bucket, seed, life] of crackles) {
            const a = Math.min(1, wk * 1.5) * (1 - life);
            for (let s2 = 0; s2 < 2; s2++) this._strokeBolt(ctx, this._bolt(cx, cy, _hash(bucket + s2, seed) * Math.PI * 2, TILE * (0.4 + 0.5 * _hash(seed, bucket + s2)), 4, bucket + seed + s2), a, 0.8);
          }
        }
      }

      // Arcs across the transformers.
      if (intensity >= 0.05) for (const type of [T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5, T.BATTERY, T.POWERTOWER]) {
        for (const e of EntityRegistry.getByType(type)) {
          const w = e.width || 1, h = e.height || 1;
          if (e.col + w < cStart || e.col > cEnd || e.row + h < rStart || e.row > rEnd) continue;
          // A spark every so often, each lasting a fraction of a second.
          const seed = e.col * 0.731 + e.row * 0.377;
          const bucket = Math.floor(t * 4 + seed * 9);
          if (_hash(bucket, seed) > 0.16 * intensity * (0.6 + 0.6 * _activity(t))) continue;
          const life = (t * 4 + seed * 9) - bucket;   // 0..1 through this spark
          const a = intensity * (1 - life) * (0.7 + 0.3 * Math.sin(t * 60));
          const x0 = (e.col + 0.15 + 0.7 * _hash(bucket, seed + 1) * w) * TILE, y0 = (e.row + 0.1 + 0.4 * _hash(bucket, seed + 2) * h) * TILE;
          const ang = _hash(bucket, seed + 3) * Math.PI * 2, len = TILE * (0.25 + 0.35 * _hash(bucket, seed + 4)) * Math.min(2, w);
          const glow = ctx.createRadialGradient(x0, y0, 0, x0, y0, TILE * 0.6);
          glow.addColorStop(0, `rgba(150,170,255,${(0.45 * a).toFixed(3)})`);
          glow.addColorStop(1, 'rgba(150,170,255,0)');
          ctx.fillStyle = glow; ctx.fillRect(x0 - TILE * 0.6, y0 - TILE * 0.6, TILE * 1.2, TILE * 1.2);
          this._strokeBolt(ctx, this._bolt(x0, y0, ang, len, 5, bucket + seed), a);
        }
      }

      // Tripped wires: a bolt leaping up off the line, forking, and a ring
      // of light running out along the ground.
      for (const b of bursts) {
        const f = b.age / 1.6, a = (1 - f) * (b.age < 0.5 ? 1 : 0.6 + 0.4 * Math.sin(b.age * 70));
        const ring = TILE * (0.5 + 5 * Math.sqrt(f));
        const rg = ctx.createRadialGradient(b.x, b.y, ring * 0.7, b.x, b.y, ring);
        rg.addColorStop(0, 'rgba(160,140,255,0)');
        rg.addColorStop(0.8, `rgba(170,150,255,${(0.35 * (1 - f)).toFixed(3)})`);
        rg.addColorStop(1, 'rgba(170,150,255,0)');
        ctx.fillStyle = rg; ctx.fillRect(b.x - ring, b.y - ring, ring * 2, ring * 2);
        const core = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, TILE * 1.4);
        core.addColorStop(0, `rgba(230,225,255,${(0.7 * a).toFixed(3)})`);
        core.addColorStop(1, 'rgba(160,140,255,0)');
        ctx.fillStyle = core; ctx.fillRect(b.x - TILE * 1.4, b.y - TILE * 1.4, TILE * 2.8, TILE * 2.8);
        const flick = Math.floor(b.age * 14);   // re-strike every few frames
        const main = this._bolt(b.x, b.y, -Math.PI / 2 + (_hash(flick, b.seed) - 0.5) * 0.6, TILE * 3.5, 8, flick + b.seed);
        this._strokeBolt(ctx, main, a, 1.6);
        for (let k = 0; k < 2; k++) {
          const p = main[3 + k * 2];
          this._strokeBolt(ctx, this._bolt(p[0], p[1], -Math.PI / 2 + (k ? 0.9 : -0.9) + (_hash(flick, b.seed + k) - 0.5), TILE * 1.4, 4, flick + b.seed + k + 3), a * 0.8, 1);
        }
      }
      ctx.restore();
    },
  };
})();

/* Birds — every so often a few birds cross the view, high over the map, their
   shadows sliding over the ground below. Purely ambient: nothing reads it.
     • one to four at a time, all of one kind;
     • spring and summer: songbirds — cardinals, bluebirds, goldfinches,
       swallows, kingfishers and parakeets — with the odd pair of geese;
     • autumn: mostly Canada geese in a little V, heading south, and crows;
     • winter: cardinals (they stay the year round) and loose flocks of crows;
     • gulls whenever there is open water in view, and crows now and then
       all year;
     • night: now and then a lone owl gliding over;
     • heavy rain: none (birds already up fly on out).
   With seasons switched off it is songbird weather all year. Birds are aimed
   through the view rather than placed on the map, so they are seen wherever
   the player is looking; they move on the render clock and stop while the
   game is paused.
   Each kind is drawn once, at a decent size, into BIRD_FRAMES canvases — one
   per step of the wingbeat — plus a matching black silhouette for its
   shadow (_birdSprites), and those are what get stamped on the map. */
const BirdFlocks = (() => {
  const flocks = [];
  let wait  = 10 + Math.random() * 20;   // seconds until the next flight is due
  let lastT = null;

  // Seen from above. `span` is the wingspan in world px; colours are the
  // upper side: wing, shoulder (covert) band, wingtip primaries, optional
  // wing bar, body, head, beak, tail; extras: crest, cap, mask, cheek,
  // shoulder patch, throat, a long neck (geese).
  const SPECIES = {
    cardinal:   { span: 26, wing: '#b81c26', covert: '#de3a3c', tip: '#7a1016', body: '#d22a2e', head: '#e4363a', beak: '#f08a30', beakLen: 5,
                  tail: '#9a1620', tailShape: 'fan', crest: true, mask: '#1a0e10' },
    bluebird:   { span: 25, wing: '#2f6cd0', covert: '#5a9cf2', tip: '#1a3a84', body: '#4282de', head: '#3670d4', beak: '#2a2a2a', beakLen: 4,
                  tail: '#2a58b4', tailShape: 'fan', patch: '#d8783a' },
    goldfinch:  { span: 22, wing: '#1c1c1c', covert: '#2e2e2e', tip: '#0c0c0c', bar: '#ffffff', body: '#f4d020', head: '#f6da2c', beak: '#f2a860', beakLen: 4,
                  tail: '#1a1a1a', tailShape: 'fork', cap: '#141414' },
    swallow:    { span: 30, wing: '#1c2a5e', covert: '#2c4486', tip: '#0e1630', body: '#22367a', head: '#1e2e66', beak: '#151515', beakLen: 3,
                  tail: '#1c2a5e', tailShape: 'streamers', throat: '#c4523a' },
    kingfisher: { span: 24, wing: '#1688a0', covert: '#36c4d6', tip: '#0e5466', bar: '#8ae8f4', body: '#22b6cc', head: '#1a8ca4', beak: '#222222', beakLen: 9,
                  tail: '#1680a0', tailShape: 'stub', cheek: '#f08a30' },
    parakeet:   { span: 26, wing: '#34b046', covert: '#6cd85a', tip: '#1c62cc', body: '#46c456', head: '#c4e43c', beak: '#f2e2c2', beakLen: 4,
                  tail: '#2a84de', tailShape: 'long' },
    goose:      { span: 40, wing: '#8a7a66', covert: '#a6947c', tip: '#3a3028', body: '#7c6c5a', head: '#141210', beak: '#141210', beakLen: 4,
                  tail: '#1a1612', tailShape: 'stub', neck: true },
    crow:       { span: 34, wing: '#18181e', covert: '#262630', tip: '#0a0a0e', body: '#1c1c24', head: '#16161c', beak: '#0e0e12', beakLen: 6,
                  tail: '#141418', tailShape: 'fan' },
    gull:       { span: 44, wing: '#b8c2cc', covert: '#d2d9e0', tip: '#18181a', body: '#f2f4f6', head: '#f8f9fa', beak: '#e8b830', beakLen: 6,
                  tail: '#eceef0', tailShape: 'fan' },
    owl:        { span: 46, wing: '#8c6a46', covert: '#a8865c', tip: '#5a4228', bar: '#c8a87a', body: '#9a7650', head: '#a6825a', beak: '#3a2e22', beakLen: 2,
                  tail: '#7a5a3a', tailShape: 'stub', owl: true },
  };
  const SONGBIRDS = ['cardinal', 'bluebird', 'goldfinch', 'swallow', 'kingfisher', 'parakeet'];
  const BIRD_FRAMES = 8, SPRITE = 128, UNIT = 100;       // canvas px; the wingspan is UNIT of them
  const _birdSprites = {};

  // Draw one bird into `g`, centred, facing +x, wings at beat angle `a`.
  function _drawBird(g, sp, a) {
    const half  = 50 * (0.55 + 0.45 * Math.abs(Math.cos(a)));   // wings shorten as they rise and fall
    const sweep = UNIT * (0.06 + 0.1 * Math.sin(a));              // and the tips rock forward and back
    const E = (x, y, rx, ry, col, rot = 0) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); };
    const P = (pts, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); };

    // Tail, under everything.
    const ts = sp.tailShape;
    if (ts === 'fork')           P([[-12, -4], [-32, -10], [-25, 0], [-32, 10], [-12, 4]], sp.tail);
    else if (ts === 'streamers') P([[-12, -5], [-44, -13], [-40, -9], [-24, 0], [-40, 9], [-44, 13], [-12, 5]], sp.tail);
    else if (ts === 'long')      P([[-12, -5], [-42, -3], [-46, 0], [-42, 3], [-12, 5]], sp.tail);
    else if (ts === 'stub')      E(-17, 0, 7, 6, sp.tail);
    else { g.fillStyle = sp.tail; g.beginPath(); g.moveTo(-12, -4); g.lineTo(-30, -10); g.quadraticCurveTo(-35, 0, -30, 10); g.lineTo(-12, 4); g.closePath(); g.fill(); }
    if (ts !== 'stub') {                                     // feather lines down the tail
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.8;
      for (const yy of [-4, 0, 4]) { g.beginPath(); g.moveTo(-14, yy * 0.6); g.lineTo(-28, yy * 1.5); g.stroke(); }
    }

    // Wings.
    for (const s of [-1, 1]) {
      const wp = new Path2D();
      wp.moveTo(8, s * 3);
      wp.quadraticCurveTo(10, s * half * 0.55, -sweep, s * half);                      // leading edge
      wp.quadraticCurveTo(-16 - sweep * 0.5, s * half * 0.6, -11, s * 3);              // trailing edge
      wp.closePath();
      g.fillStyle = sp.wing; g.fill(wp);
      g.save(); g.clip(wp);
      // primaries: the outer wing in the tip colour
      g.fillStyle = sp.tip; g.beginPath();
      g.moveTo(-60, s * half * 0.62); g.lineTo(60, s * half * 0.5); g.lineTo(60, s * 80); g.lineTo(-60, s * 80); g.closePath(); g.fill();
      // shoulder band along the leading edge
      g.strokeStyle = sp.covert; g.lineWidth = 10;
      g.beginPath(); g.moveTo(8, s * 3); g.quadraticCurveTo(10, s * half * 0.55, -sweep, s * half); g.stroke();
      // wing bar
      if (sp.bar) {
        g.strokeStyle = sp.bar; g.lineWidth = 3;
        g.beginPath(); g.moveTo(-3, s * 5); g.quadraticCurveTo(-1, s * half * 0.5, -sweep - 7, s * half * 0.82); g.stroke();
      }
      // feather lines fanning to the trailing edge
      g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 0.9;
      for (let k = 1; k <= 6; k++) {
        const f = k / 7;
        g.beginPath(); g.moveTo(-3 - sweep * f * 0.5, s * half * f * 0.9); g.lineTo(-13 - sweep * f, s * half * f); g.stroke();
      }
      // light along the front edge
      g.strokeStyle = 'rgba(255,255,255,0.28)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(8, s * 3); g.quadraticCurveTo(10, s * half * 0.55, -sweep, s * half); g.stroke();
      g.restore();
      // fingered tip: a few loose primaries past the wing's end
      for (let j = 0; j < 3; j++) E(-sweep - 3 - j * 3.6, s * (half - 1.5 - j * 1.2), 5.2, 1.6, sp.tip, s * (0.35 + j * 0.12));
    }

    // Body, lit from the top left.
    E(1, 0, 17, 7.5, sp.body);
    const bg = g.createLinearGradient(0, -8, 0, 8);
    bg.addColorStop(0, 'rgba(255,255,255,0.22)'); bg.addColorStop(0.5, 'rgba(255,255,255,0)'); bg.addColorStop(1, 'rgba(0,0,0,0.18)');
    E(1, 0, 17, 7.5, bg);
    if (sp.patch) { E(3, -6.5, 4, 2.4, sp.patch); E(3, 6.5, 4, 2.4, sp.patch); }

    if (sp.neck) {
      // Goose: long black neck, black head, the white chinstrap across it.
      g.fillStyle = sp.head; g.fillRect(12, -2.6, 20, 5.2);
      E(33, 0, 5.8, 4.6, sp.head);
      E(32, 0, 2.2, 4.4, '#f0ece4');
      P([[38, -1.8], [38, 1.8], [38 + sp.beakLen, 0]], sp.beak);
      E(35, -2.6, 0.9, 0.9, '#000'); E(35, 2.6, 0.9, 0.9, '#000');
      return;
    }
    if (sp.owl) {
      // Owl: a big round head set straight on the body, ear tufts, and the
      // pale rims of the face disc just showing from above.
      E(15, 0, 9.5, 9.5, sp.head);
      for (const s of [-1, 1]) { E(13, s * 7.5, 3.4, 1.6, sp.tip, s * 0.5); E(19.5, s * 4.6, 2.6, 3.2, '#e4d2b0'); E(20.5, s * 4.6, 1.3, 1.3, '#e8b020'); E(20.9, s * 4.6, 0.6, 0.6, '#000'); }
      for (const [x, y] of [[8, -2.5], [12, 2], [15, -4], [5, 3]]) E(x, y, 1.1, 0.8, sp.tip);   // speckles
      P([[24, -1.2], [24, 1.2], [24 + sp.beakLen, 0]], sp.beak);
      return;
    }
    if (sp.crest) P([[17, -3.5], [17, 3.5], [6, 0]], sp.head);
    if (sp.throat) E(21, 0, 4.5, 4, sp.throat);
    E(18, 0, 6.6, 6.2, sp.head);
    if (sp.cap)   E(20, 0, 3.6, 4.2, sp.cap);
    if (sp.mask)  E(22.5, 0, 3, 4.6, sp.mask);
    if (sp.cheek) { E(19, -4.6, 2.4, 1.6, sp.cheek); E(19, 4.6, 2.4, 1.6, sp.cheek); }
    P([[23.5, -2], [23.5, 2], [23.5 + sp.beakLen, 0]], sp.beak);
    for (const s of [-1, 1]) { E(20, s * 4.4, 1.2, 1.2, '#0a0a0a'); E(20.4, s * 4.1, 0.45, 0.45, '#ffffff'); }
  }

  function _sprites(kind) {
    if (_birdSprites[kind]) return _birdSprites[kind];
    const sp = SPECIES[kind], frames = [], shadows = [];
    for (let i = 0; i < BIRD_FRAMES; i++) {
      const c = document.createElement('canvas'); c.width = c.height = SPRITE;
      const g = c.getContext('2d');
      g.translate(SPRITE / 2, SPRITE / 2);
      _drawBird(g, sp, (i / BIRD_FRAMES) * Math.PI * 2);
      frames.push(c);
      const sh = document.createElement('canvas'); sh.width = sh.height = SPRITE;
      const sg = sh.getContext('2d');
      sg.drawImage(c, 0, 0);
      sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#000'; sg.fillRect(0, 0, SPRITE, SPRITE);
      shadows.push(sh);
    }
    return (_birdSprites[kind] = { frames, shadows });
  }

  const _seasonIdx = () => (typeof Seasons !== 'undefined' && Seasons.enabled()) ? Seasons.index() : -1;
  // Some open water in view? A few sample points is enough to call gulls in.
  function _waterInView(vx, vy, vw, vh) {
    if (typeof WaterSystem === 'undefined') return false;
    for (let i = 0; i < 24; i++) {
      if (WaterSystem.isWater(Math.floor((vx + Math.random() * vw) / TILE), Math.floor((vy + Math.random() * vh) / TILE))) return true;
    }
    return false;
  }
  // Which kind is up now, or null for nobody.
  function _choose(vx, vy, vw, vh) {
    if (typeof RainSystem !== 'undefined' && RainSystem.level && RainSystem.level() > 0.45) return null;
    const s = _seasonIdx(), r = Math.random();
    if (typeof DayNight !== 'undefined' && DayNight.darkness() > 0.3) return r < (s === 3 ? 0.5 : 0.35) ? 'owl' : null;
    if (s !== 3 && Math.random() < 0.3 && _waterInView(vx, vy, vw, vh)) return 'gull';
    if (s === 3) return r < 0.55 ? 'crow' : r < 0.85 ? 'cardinal' : null;
    if (s === 2) return r < 0.5 ? 'goose' : r < 0.68 ? 'crow' : SONGBIRDS[Math.floor(Math.random() * SONGBIRDS.length)];
    return r < 0.08 ? 'goose' : r < 0.15 ? 'crow' : SONGBIRDS[Math.floor(Math.random() * SONGBIRDS.length)];
  }

  function _spawn(vx, vy, vw, vh, kind) {
    const autumn = _seasonIdx() === 2;
    kind = kind || _choose(vx, vy, vw, vh);
    if (!kind) return;
    const geese = kind === 'goose';
    const r = Math.random();
    const n = kind === 'owl' ? 1
            : kind === 'crow' ? 2 + Math.floor(r * 5)                // a loose, straggling flock
            : kind === 'gull' ? 1 + Math.floor(r * 3)
            : r < 0.2 ? 1 : r < 0.55 ? 2 : r < 0.85 ? 3 : 4;
    // Autumn geese head south (down the map); everything else any way at all.
    const ang   = geese && autumn ? Math.PI / 2 + (Math.random() - 0.5) * 0.9 : Math.random() * Math.PI * 2;
    const speed = geese ? 140 + Math.random() * 30 : kind === 'swallow' ? 250 + Math.random() * 60
                : kind === 'owl' ? 95 + Math.random() * 20 : kind === 'gull' ? 130 + Math.random() * 30
                : kind === 'crow' ? 150 + Math.random() * 30 : 170 + Math.random() * 60;   // world px/s
    // Through a point inside the view, from well outside it, out the far side.
    const cx = vx + vw * (0.2 + Math.random() * 0.6), cy = vy + vh * (0.2 + Math.random() * 0.6);
    const R  = Math.hypot(vw, vh) / 2 + 240;
    const birds = [];
    for (let k = 0; k < n; k++) {
      if (geese) {
        const rank = Math.ceil(k / 2), side = k % 2 ? 1 : -1;            // a little V
        birds.push({ back: rank * 34, side: side * rank * 30, ph: Math.random() * 6.28, weave: 0 });
      } else if (kind === 'crow') {
        birds.push({ back: k ? 20 + Math.random() * 110 : 0, side: k ? (Math.random() - 0.5) * 140 : 0, ph: Math.random() * 6.28, weave: 8 + Math.random() * 14 });
      } else if (kind === 'gull') {
        birds.push({ back: k ? 30 + Math.random() * 60 : 0, side: k ? (Math.random() - 0.5) * 120 : 0, ph: Math.random() * 6.28, weave: 20 + Math.random() * 20 });   // wheeling
      } else {
        birds.push({ back: k ? 18 + Math.random() * 45 : 0, side: k ? (Math.random() - 0.5) * 80 : 0, ph: Math.random() * 6.28, weave: 6 + Math.random() * 10 });
      }
    }
    flocks.push({
      x0: cx - Math.cos(ang) * R, y0: cy - Math.sin(ang) * R,
      dx: Math.cos(ang), dy: Math.sin(ang), ang, speed, age: 0, life: (2 * R) / speed,
      kind, geese, span: SPECIES[kind].span * (0.94 + Math.random() * 0.12),
      flap: geese ? 5.5 : kind === 'owl' ? 4 : kind === 'gull' ? 5 : kind === 'crow' ? 7 : 11, birds,
      // Owls and gulls spend most of a crossing on open wings.
      glide: kind === 'owl' ? -0.3 : kind === 'gull' ? -0.1 : geese || kind === 'crow' ? 2 : 0.35,
      high: 70 + Math.random() * 40,                               // how far below and right the shadows fall
    });
  }

  return {
    SPECIES: Object.keys(SPECIES),
    // The flights in the air now, for OutdoorAmbience to give them a voice:
    // { ref (stable while it flies), kind, x, y } at the lead bird.
    nearby: () => flocks.map(f => ({ ref: f, kind: f.kind, x: f.x0 + f.dx * f.speed * f.age, y: f.y0 + f.dy * f.speed * f.age })),
    // The drawn bird for `kind` at wingbeat step `i` (a canvas), for previews.
    sprite: (kind, i = 0) => SPECIES[kind] ? _sprites(kind).frames[((i % BIRD_FRAMES) + BIRD_FRAMES) % BIRD_FRAMES] : null,
    // Dev / trailer: send birds over the current view now, whatever the
    // season; `along` (0..1) starts them that far into the crossing, and
    // `kind` picks the species (one of SPECIES).
    spawnNow(along = 0, kind) {
      const z = Camera.zoom;
      _spawn(Camera.x, Camera.y, window.innerWidth / z, window.innerHeight / z, SPECIES[kind] ? kind : undefined);
      const f = flocks[flocks.length - 1];
      f.age = f.life * Math.max(0, Math.min(0.95, along));
    },

    // World-space, camera transform applied; `t` is the render clock in seconds.
    render(ctx, t) {
      let dt = lastT === null ? 0 : Math.min(0.5, Math.max(0, t - lastT));
      lastT = t;
      if (typeof DevMode !== 'undefined' && DevMode.timeScale === 0) dt = 0;   // paused
      const zoom = Camera.zoom;
      const vx = Camera.x, vy = Camera.y, vw = window.innerWidth / zoom, vh = window.innerHeight / zoom;

      wait -= dt;
      if (wait <= 0) {
        wait = 20 + Math.random() * 40;
        if (flocks.length < 2 && zoom > 0.3) _spawn(vx, vy, vw, vh);
      }
      if (!flocks.length) return;

      // Zoomed far out they fade away rather than blinking off.
      const fade = Math.max(0, Math.min(1, (zoom - 0.3) / 0.12));
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      for (let i = flocks.length - 1; i >= 0; i--) {
        const f = flocks[i];
        f.age += dt;
        const spr = _sprites(f.kind);
        const hx = f.x0 + f.dx * f.speed * f.age, hy = f.y0 + f.dy * f.speed * f.age;
        const px = -f.dy, py = f.dx;
        const size = f.span * SPRITE / UNIT;
        // Gone only once every bird and its shadow are out of view, past the
        // halfway point — so panning or zooming out mid-crossing never has
        // them vanish on screen. The long cap is just a backstop.
        if (f.age > f.life * 0.5) {
          const m = size + f.high;
          const seen = f.birds.some(b => {
            const x = hx - f.dx * b.back + px * b.side, y = hy - f.dy * b.back + py * b.side;
            return x > vx - m && x < vx + vw + m && y > vy - m && y < vy + vh + m;
          });
          if (!seen || f.age > f.life * 4) { flocks.splice(i, 1); continue; }
        }
        if (fade <= 0) continue;
        for (const pass of [0, 1]) {                              // shadows, then the birds
          for (const b of f.birds) {
            // A gentle weave side to side, and a slight bank into it.
            const w = b.weave ? Math.sin(f.age * 1.3 + b.ph) * b.weave : 0;
            const bank = b.weave ? Math.cos(f.age * 1.3 + b.ph) * 0.12 : 0;
            const x = hx - f.dx * b.back + px * (b.side + w), y = hy - f.dy * b.back + py * (b.side + w);
            // Songbirds fly in bursts: a run of beats, then a glide on open wings.
            const gliding = Math.sin(f.age * 0.9 + b.ph * 1.7) > f.glide;
            const beat = gliding ? 0 : ((t * f.flap + b.ph) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
            const fi = Math.floor(beat / (Math.PI * 2) * BIRD_FRAMES) % BIRD_FRAMES;
            ctx.save();
            if (pass === 0) { ctx.translate(x + f.high * 0.7, y + f.high); ctx.globalAlpha = 0.18 * fade; }
            else { ctx.translate(x, y); ctx.globalAlpha = fade; }
            ctx.rotate(f.ang + bank);
            ctx.drawImage(pass === 0 ? spr.shadows[fi] : spr.frames[fi], -size / 2, -size / 2, size, size);
            ctx.restore();
          }
        }
      }
      ctx.restore();
    },
  };
})();

/* Wildlife — rabbits, squirrels, foxes, deer and wild turkeys out on the open
   land; ducks, swans, herons, frogs and turtles on and around the water. Ambient, like BirdFlocks: nothing reads it. A few are
   kept around wherever the player is looking (they fade in, and when they
   have been about a while they make off out of view before going), so it
   costs nothing for the parts of the map no one is watching.
     • land animals keep to open ground: no trees, buildings, roads, zones,
       the government district or water. Ducks keep to open water, and stay
       away once it freezes;
     • by day: rabbits, squirrels, deer, foxes and ducks; at dusk and night
       mostly foxes and deer. Winter thins them out;
     • deer come in ones to threes, a stag now and then, fawns in spring;
       ducks in pairs, or a mother and her ducklings in spring;
     • the seasons: turkeys strut about in little flocks in autumn, when the
       squirrels stop to bury nuts; in winter the rabbits are white snowshoe
       hares and swans come to open water; herons wade, frogs sit and turtles
       bask along the shore through the warm months;
     • shore animals keep to water touching the bank. When it's time to go a
       heron takes off and a frog or turtle slips under;
     • on lying snow every land animal leaves a trail of prints behind it,
       which fade over a couple of minutes.
   Drawn on the ground pass (render_main_loop.js, after zone life), so trees
   and buildings overhang them. They hold still while the game is paused.
   Each kind is drawn once per pose into small canvases (_critterSprites),
   facing +x, and stamped rotated to the animal's heading. */
const Wildlife = (() => {
  const animals = [];
  let lastT = null, spawnWait = 1.5;
  const RES = 4;                         // sprite px per world px

  // ── Drawing, in world px, facing +x, centred on the body ─────────────
  const _E = (g, x, y, rx, ry, col, rot = 0) => { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); };
  const _P = (g, pts, col) => { g.fillStyle = col; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill(); };
  // Soft light from the top of the screen, over a body ellipse.
  function _sheen(g, x, y, rx, ry) {
    const gr = g.createLinearGradient(0, y - ry, 0, y + ry);
    gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.55, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.16)');
    _E(g, x, y, rx, ry, gr);
  }
  // Four legs stepping: diagonal pairs swing together. `ph` 0..2π.
  function _legs(g, fx, hx, sy, rx, ry, col, ph) {
    const s = Math.sin(ph) * 1.6;
    for (const [x, y, d] of [[fx, -sy, s], [fx, sy, -s], [hx, -sy, -s], [hx, sy, s]]) _E(g, x + d, y, rx, ry, col);
  }

  // Cottontail, or (white) a snowshoe hare in its winter coat, black-tipped ears.
  const _BUNNY = {
    brown: { foot: '#7c5c42', paw: '#8a6a4c', coat: '#a8845e', ear: '#9a7654', inner: '#e6aea6', tail: '#f4efe8', tip: null },
    white: { foot: '#cfd4da', paw: '#dde1e6', coat: '#f1f3f6', ear: '#e4e8ec', inner: '#e8c8c4', tail: '#ffffff', tip: '#2a2626' },
  };
  function _rabbit(g, f, white) {
    const c = _BUNNY[white ? 'white' : 'brown'];
    const s = [1, 1.18, 1.06, 0.92][f];                 // a hop: stretch out, gather in
    const big = white ? 1.12 : 1;                       // hares run a little larger
    g.save(); g.scale(big, big);
    _E(g, -3.2 * s, -2.5, 2.3, 1.0, c.foot); _E(g, -3.2 * s, 2.5, 2.3, 1.0, c.foot);   // hind feet
    _E(g, 2.6 * s, -1.6, 0.9, 0.6, c.paw); _E(g, 2.6 * s, 1.6, 0.9, 0.6, c.paw);       // fore paws
    _E(g, -0.4, 0, 4.6 * s, 3.2, c.coat); _sheen(g, -0.4, 0, 4.6 * s, 3.2);
    _E(g, -5 * s, 0, 1.4, 1.4, c.tail);                                                  // cotton tail
    _E(g, 3.9 * s, 0, 2.4, 2.1, c.coat);
    for (const y of [-1.1, 1.1]) {                                                         // ears laid back
      _E(g, 2.3 * s, y, 2.7, 0.8, c.ear, y * 0.22); _E(g, 2.3 * s, y, 1.9, 0.35, c.inner, y * 0.22);
      if (c.tip) _E(g, 0, y * 1.45, 0.8, 0.6, c.tip, y * 0.22);
    }
    _E(g, 4.7 * s, -1.4, 0.45, 0.45, '#1a1410'); _E(g, 4.7 * s, 1.4, 0.45, 0.45, '#1a1410');
    _E(g, 6.1 * s, 0, 0.45, 0.4, '#d08a8a');
    g.restore();
  }
  function _squirrel(g, f) {
    const ph = f / 4 * Math.PI * 2, sw = Math.sin(ph) * 0.8;
    _legs(g, 2.2, -2.2, 1.9, 0.9, 0.5, '#8a4a1e', ph);
    for (let i = 0; i <= 6; i++) {                                                             // bushy S-curved tail
      const u = i / 6, x = -3 - u * 7.5, y = Math.sin(u * 3.4 + sw) * 1.6;
      _E(g, x, y, 2.3 - u * 0.4, 2.0 - u * 0.3, i % 2 ? '#c8783c' : '#b8662c');
    }
    _E(g, -9.8, Math.sin(3.4 + sw) * 1.6, 1.2, 1.0, '#e0a070');
    _E(g, 0, 0, 3.6, 2.2, '#b8642c'); _sheen(g, 0, 0, 3.6, 2.2);
    _E(g, 3.6, 0, 1.8, 1.6, '#b8642c');
    _E(g, 3.1, -1.4, 0.6, 0.5, '#8a4a1e'); _E(g, 3.1, 1.4, 0.6, 0.5, '#8a4a1e');
    _E(g, 4.3, -0.9, 0.35, 0.35, '#120c08'); _E(g, 4.3, 0.9, 0.35, 0.35, '#120c08');
  }
  function _fox(g, f) {
    const ph = f / 4 * Math.PI * 2, sw = Math.sin(ph) * 1.2;
    _legs(g, 5, -5, 2.7, 1.5, 0.9, '#2a1a12', ph);
    for (let i = 0; i <= 6; i++) {                                                             // brush
      const u = i / 6;
      _E(g, -7 - u * 9, sw * u, 2.4 - u * 0.5, 2.1 - u * 0.4, u > 0.82 ? '#f4f0ea' : '#d0682a');
    }
    _E(g, 0, 0, 7.6, 3.4, '#d4702a'); _E(g, 0, 0, 6.4, 1.3, '#b85a20'); _sheen(g, 0, 0, 7.6, 3.4);
    _E(g, 8.2, 0, 3.2, 2.8, '#d4702a');
    _P(g, [[10.4, -1.4], [13.6, 0], [10.4, 1.4]], '#d4702a');
    _E(g, 10.2, -1.5, 1.2, 0.85, '#f4ece0'); _E(g, 10.2, 1.5, 1.2, 0.85, '#f4ece0');
    for (const s of [-1, 1]) { _P(g, [[7.6, s * 2.0], [5.8, s * 4.4], [8.8, s * 2.6]], '#c05a1c'); _P(g, [[6.4, s * 3.6], [5.8, s * 4.4], [7.0, s * 3.9]], '#2a1a12'); }
    _E(g, 13.5, 0, 0.55, 0.55, '#1a1410');
    _E(g, 9.6, -1.3, 0.45, 0.45, '#1a1410'); _E(g, 9.6, 1.3, 0.45, 0.45, '#1a1410');
  }
  function _deer(g, f, stag, fawn) {
    const ph = f / 4 * Math.PI * 2;
    _legs(g, 7, -7, 3.0, 1.4, 0.8, '#3a2618', ph);
    const coat = fawn ? '#b07a48' : '#9a6a42';
    _E(g, 0, 0, 10, 4.6, coat); _E(g, 0, 0, 8.6, 1.6, fawn ? '#9a6638' : '#84583a'); _sheen(g, 0, 0, 10, 4.6);
    if (fawn) for (const [x, y] of [[-6, -1.6], [-3, 1.8], [0, -2], [3, 1.6], [5.5, -1.2], [-4.5, 0.4], [1.6, 0.2], [-1, -0.6]]) _E(g, x, y, 0.7, 0.6, '#f4ece0');
    _E(g, -9, 0, 2.4, 3.2, '#f2ece2'); _E(g, -10.4, 0, 1.0, 0.8, '#6a4a30');
    _E(g, 9.2, 0, 3.4, 2.2, coat);
    _E(g, 13, 0, 2.8, 2.2, '#8e6240'); _E(g, 15.4, 0, 1.2, 1.1, '#4a3424');
    for (const s of [-1, 1]) { _E(g, 11.8, s * 2.4, 1.9, 0.9, coat, s * 0.6); _E(g, 11.8, s * 2.4, 1.1, 0.45, '#e2c4ac', s * 0.6); }
    _E(g, 13.8, -1.4, 0.45, 0.45, '#120c08'); _E(g, 13.8, 1.4, 0.45, 0.45, '#120c08');
    if (stag) {                                                                                  // antlers
      g.strokeStyle = '#d8c8a8'; g.lineWidth = 0.6; g.lineCap = 'round';
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(12.4, s * 1.2); g.quadraticCurveTo(11, s * 4.5, 13.6, s * 6.4); g.stroke();
        g.beginPath(); g.moveTo(11.8, s * 3.4); g.lineTo(14.2, s * 3.8); g.stroke();
        g.beginPath(); g.moveTo(12.4, s * 5.2); g.lineTo(14.6, s * 5.0); g.stroke();
      }
    }
  }
  function _duck(g, f, drake) {
    const pad = f % 2 ? 0.3 : -0.3;
    _P(g, [[-4.3, -1.4], [-6.2 + pad, 0], [-4.3, 1.4]], drake ? '#2a2a2a' : '#7a5a3a');
    _E(g, 0, 0, 4.6, 3.0, drake ? '#a8a49a' : '#9a7a58'); _sheen(g, 0, 0, 4.6, 3.0);
    if (!drake) for (const [x, y] of [[-2, -1], [0, 1.2], [1.4, -0.4], [-1, 0.6]]) _E(g, x, y, 0.8, 0.45, '#7a5a3a');
    for (const s of [-1, 1]) { _E(g, -0.8, s * 1.7, 3.3, 1.1, drake ? '#7a766c' : '#7e6044'); _E(g, -1.4, s * 2.3, 1.0, 0.4, '#3a5ad0'); }
    if (drake) { _E(g, 2.6, 0, 1.8, 2.4, '#7a4a32'); _E(g, 3.6, 0, 0.6, 1.5, '#f4f4f0'); }
    _E(g, 4.6, 0, 1.9, 1.6, drake ? '#1e6a3a' : '#8a6a48');
    _E(g, 6.6, 0, 1.3, 0.8, drake ? '#e8c040' : '#d88a30');
    _E(g, 4.9, -1.1, 0.35, 0.35, '#0a0a0a'); _E(g, 4.9, 1.1, 0.35, 0.35, '#0a0a0a');
  }
  function _duckling(g, f) {
    _E(g, 0, 0, 2.4, 1.7, '#d8c060'); _E(g, -0.4, 0, 1.6, 1.0, '#8a6a30');
    _E(g, 2.2, 0, 1.2, 1.1, '#e0c868'); _E(g, 3.4, 0, 0.6, 0.4, '#3a3020');
  }
  // Wild turkey: bronze body, a barred fan of a tail, bare blue-red head.
  function _turkey(g, f) {
    const ph = f / 4 * Math.PI * 2, bob = Math.sin(ph * 2) * 0.6;
    for (const s of [-1, 1]) _E(g, 1 + Math.sin(ph) * s * 1.4, s * 1.6, 1.0, 0.45, '#b07a3a');   // feet
    for (let i = -3; i <= 3; i++) {                                                              // tail fan
      const a = Math.PI + i * 0.22;
      _E(g, -5 + Math.cos(a) * 3.6, Math.sin(a) * 3.6, 2.6, 1.1, i % 2 ? '#5a3a20' : '#6e4826', a);
      _E(g, -5 + Math.cos(a) * 5.6, Math.sin(a) * 5.6, 0.9, 0.9, '#d8c8a4');                   // pale tips
    }
    _E(g, 0, 0, 6, 3.8, '#4a3220'); _sheen(g, 0, 0, 6, 3.8);
    for (const [x, y] of [[-2, -1.6], [0, 1.4], [2, -1], [-3, 0.8], [1, -2.4], [-1, 2.4]]) _E(g, x, y, 1.2, 0.6, '#7a5a2a');   // bronze sheen
    for (const s of [-1, 1]) _E(g, -0.5, s * 3.2, 3.6, 1.0, '#3a2818');                     // wings
    _E(g, 5.6 + bob, 0, 1.3, 1.1, '#5a3e26');                                                  // neck
    _E(g, 7.4 + bob, 0, 1.4, 1.2, '#7aa0c8'); _E(g, 7.0 + bob, 0, 0.7, 1.3, '#c83030');       // blue head, red wattle
    _E(g, 8.8 + bob, 0, 0.7, 0.4, '#c8a878');
    _E(g, 7.8 + bob, -0.8, 0.3, 0.3, '#0a0a0a'); _E(g, 7.8 + bob, 0.8, 0.3, 0.3, '#0a0a0a');
  }
  // Great blue heron. Poses 0-1 wading (neck folded forward, long bill),
  // 2-3 in flight (wings wide, neck tucked, legs trailing).
  function _heron(g, f) {
    if (f >= 2) {
      const span = f === 2 ? 15 : 17;
      for (const s of [-1, 1]) {
        _P(g, [[3, s * 2], [1, s * span * 0.6], [-4, s * span], [-6, s * span * 0.9], [-5, s * 2.5]], '#6e88a4');
        _P(g, [[-1, s * span * 0.55], [-4, s * span], [-6, s * span * 0.9], [-4, s * span * 0.5]], '#2a3442');   // dark flight feathers
      }
      g.strokeStyle = '#8a7a50'; g.lineWidth = 0.6;
      for (const s of [-0.5, 0.5]) { g.beginPath(); g.moveTo(-6, s); g.lineTo(-14, s * 1.4); g.stroke(); }   // trailing legs
      _E(g, -1, 0, 6.5, 2.4, '#7a92ac'); _sheen(g, -1, 0, 6.5, 2.4);
      _E(g, 5, 0, 2.2, 1.6, '#c8d4de'); _E(g, 5.4, 0, 1.4, 0.5, '#20242a');
      _P(g, [[6.8, -0.6], [6.8, 0.6], [11, 0]], '#d8b040');
      return;
    }
    const lean = f ? 0.6 : 0;
    _E(g, -2, 0, 7.2, 3.0, '#6e88a4'); _sheen(g, -2, 0, 7.2, 3.0);
    for (const s of [-1, 1]) _E(g, -3, s * 1.9, 5.6, 1.2, '#4e6680', s * 0.08);              // folded wings
    _E(g, -8.6, 0, 2.2, 1.6, '#3e5068');                                                        // tail
    g.strokeStyle = '#a8b8c8'; g.lineWidth = 1.4; g.lineCap = 'round';                           // S-curved neck
    g.beginPath(); g.moveTo(3.5, 0); g.quadraticCurveTo(6, 2.2 + lean, 8.5 + lean, 0); g.stroke();
    _E(g, 9.6 + lean, 0, 1.8, 1.4, '#e8ecf0'); _E(g, 9.6 + lean, 0, 1.6, 0.45, '#1a1e24');   // white face, black crown stripe
    _P(g, [[11.2 + lean, -0.5], [11.2 + lean, 0.5], [16.5 + lean, 0]], '#d8b040');           // dagger bill
    _E(g, 10.2 + lean, -0.9, 0.3, 0.3, '#e8c020'); _E(g, 10.2 + lean, 0.9, 0.3, 0.3, '#e8c020');
  }
  // Mute swan: big and white, neck curved forward, orange bill.
  function _swan(g, f) {
    const pad = f % 2 ? 0.25 : -0.25;
    _E(g, -0.5, 0, 8.6, 5.0, '#f6f6f2'); _sheen(g, -0.5, 0, 8.6, 5.0);
    for (const s of [-1, 1]) {                                                                   // raised wing feathers
      _E(g, -1.5, s * 2.4, 6.4, 2.4, '#ececE6', s * 0.06);
      g.strokeStyle = 'rgba(120,120,110,0.25)'; g.lineWidth = 0.4;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(2 - i * 2.4, s * 1.2); g.lineTo(-1 - i * 2.4 + pad, s * 4.2); g.stroke(); }
    }
    _E(g, -8.6, 0, 1.6, 1.4, '#e8e8e2');
    g.strokeStyle = '#f2f2ee'; g.lineWidth = 1.8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(6, 0); g.quadraticCurveTo(9.5, 1.2, 10.5, 0); g.stroke();
    _E(g, 11.2, 0, 1.8, 1.4, '#f8f8f4');
    _P(g, [[12.4, -0.7], [12.4, 0.7], [14.8, 0]], '#e8782a'); _E(g, 12.4, 0, 0.6, 0.6, '#1a1a1a');
    _E(g, 11.6, -1.0, 0.3, 0.3, '#0a0a0a'); _E(g, 11.6, 1.0, 0.3, 0.3, '#0a0a0a');
  }
  // Green frog sitting at the water's edge (0), or mid-hop (1).
  function _frog(g, f) {
    const leg = f ? 3.2 : 0;
    for (const s of [-1, 1]) {
      _E(g, -2.4 - leg, s * (2.6 - leg * 0.3), 2.4 + leg * 0.4, 0.8, '#4a7a2e', s * (f ? 0.25 : 0.9));   // hind legs
      _E(g, 1.8, s * 2.2, 1.1, 0.5, '#4a7a2e', s * 0.6);                                             // fore legs
    }
    _E(g, 0, 0, 3.4, 2.5, '#5e9a36'); _sheen(g, 0, 0, 3.4, 2.5);
    for (const [x, y] of [[-1.2, -0.8], [0.6, 0.9], [-0.4, 0.2]]) _E(g, x, y, 0.55, 0.45, '#3a6420');
    for (const s of [-1, 1]) { _E(g, 2.2, s * 1.3, 0.8, 0.8, '#6aa83e'); _E(g, 2.4, s * 1.35, 0.42, 0.42, '#1a1408'); }
  }
  // Painted turtle: a domed olive-black shell with pale seams between the
  // plates and a rim of red-barred marginals; dark skin striped yellow and
  // red, a yellow blotch behind each eye, clawed feet paddling diagonally.
  function _turtle(g, f) {
    const sw = f ? 0.8 : -0.8, skin = '#2c3424', claw = '#c8c0a0';
    g.lineCap = 'round';
    // Limbs: diagonal pairs step together, fore feet reaching forward.
    for (const [x, y, d, fore] of [[3.2, -3.4, sw, 1], [3.2, 3.4, -sw, 1], [-3.4, -3.1, -sw, 0], [-3.4, 3.1, sw, 0]]) {
      const s = Math.sign(y), fx = x + d + (fore ? 0.6 : -0.6), fy = y + s * 1.1;
      _E(g, x + d * 0.5, y, 1.7, 1.0, skin, s * (fore ? 0.55 : -0.55));
      _E(g, fx, fy, 1.1, 0.8, skin, s * (fore ? 0.4 : -0.4));
      g.strokeStyle = '#c8a838'; g.lineWidth = 0.22;                                          // leg stripe
      g.beginPath(); g.moveTo(x + d * 0.5 - (fore ? 0.8 : -0.8), y - s * 0.2); g.lineTo(fx, fy); g.stroke();
      g.strokeStyle = claw; g.lineWidth = 0.18;
      for (const k of [-0.5, 0, 0.5]) {
        const dir = fore ? 1 : -1;
        g.beginPath(); g.moveTo(fx + dir * 0.7, fy + k); g.lineTo(fx + dir * 1.25, fy + k * 1.25 + s * 0.2); g.stroke();
      }
    }
    _P(g, [[-4.6, -0.7], [-7.0, 0], [-4.6, 0.7]], skin);                                       // pointed tail
    g.strokeStyle = '#c8a838'; g.lineWidth = 0.18; g.beginPath(); g.moveTo(-4.8, 0); g.lineTo(-6.4, 0); g.stroke();
    // Neck and head, yellow-striped, with the red line along the jaw.
    _E(g, 5.0, 0, 1.6, 1.1, skin);
    _E(g, 6.7, 0, 1.5, 1.2, skin);
    _E(g, 8.1, 0, 0.7, 0.75, skin);
    g.lineWidth = 0.22;
    for (const [y, col] of [[-0.8, '#e0c040'], [-0.3, '#c8402a'], [0.3, '#c8402a'], [0.8, '#e0c040'], [0, '#e0c040']]) {
      g.strokeStyle = col; g.beginPath(); g.moveTo(4.0, y * 1.2); g.quadraticCurveTo(6.4, y * 1.05, 8.2, y * 0.5); g.stroke();
    }
    for (const s of [-1, 1]) {
      _E(g, 6.5, s * 0.95, 0.5, 0.3, '#f0d040');                                               // blotch behind the eye
      _E(g, 7.4, s * 0.85, 0.36, 0.32, '#0e0c08');
      _E(g, 7.5, s * 0.78, 0.12, 0.1, 'rgba(255,255,255,0.8)');
    }
    // Shell: a drop shadow under the dome, then the marginal rim.
    _E(g, 0.5, 0.6, 5.4, 4.3, 'rgba(0,0,0,0.25)');
    _E(g, 0, 0, 5.4, 4.3, '#1e2418');
    const marg = 16;
    for (let i = 0; i < marg; i++) {                                                           // red bars on the marginals
      const a = (i + 0.5) / marg * Math.PI * 2;
      g.strokeStyle = '#b8402a'; g.lineWidth = 0.35;
      g.beginPath(); g.moveTo(Math.cos(a) * 4.4, Math.sin(a) * 3.4); g.lineTo(Math.cos(a) * 5.15, Math.sin(a) * 4.05); g.stroke();
    }
    g.strokeStyle = 'rgba(200,170,80,0.5)'; g.lineWidth = 0.15;
    g.beginPath(); g.ellipse(0, 0, 5.3, 4.2, 0, 0, Math.PI * 2); g.stroke();
    // Carapace dome, lit from the top of the screen.
    const dome = g.createRadialGradient(-0.8, -1.2, 0.4, 0, 0, 4.8);
    dome.addColorStop(0, '#56643e'); dome.addColorStop(0.65, '#38432a'); dome.addColorStop(1, '#232b1a');
    _E(g, 0, 0, 4.6, 3.6, dome);
    // Scute seams: a spine of five vertebrals with pleurals either side.
    g.strokeStyle = 'rgba(214,190,96,0.45)'; g.lineWidth = 0.24;
    g.beginPath();
    for (const x of [-3.0, -1.2, 0.6, 2.4]) {
      g.moveTo(x, -1.0); g.lineTo(x + 0.4, 0); g.lineTo(x, 1.0);                               // vertebral joins
    }
    g.moveTo(-4.2, -1.0); g.lineTo(3.9, -1.0); g.moveTo(-4.2, 1.0); g.lineTo(3.9, 1.0);         // vertebral sides
    for (const s of [-1, 1]) for (const x of [-1.6, 0.6, 2.6]) {                               // pleural seams
      g.moveTo(x, s * 1.0); g.lineTo(x - 0.3, s * 3.3);
    }
    g.stroke();
    g.strokeStyle = 'rgba(230,200,90,0.2)'; g.lineWidth = 0.4;                                  // faint mid-dorsal stripe
    g.beginPath(); g.moveTo(-3.8, 0); g.lineTo(3.8, 0); g.stroke();
    // Wet gloss: a crisp highlight on the crown of the shell.
    _E(g, -0.6, -1.5, 2.0, 0.7, 'rgba(255,255,240,0.18)', -0.15);
    _E(g, -1.0, -1.7, 0.8, 0.25, 'rgba(255,255,250,0.35)', -0.15);
  }

  // len: world px nose to tail. speeds in world px/s. frames: walk cycle poses.
  // hab: where it may stand — true land, false open water, 'shore' water
  // touching the bank (defaults to `land`). bob: rides the ripples. dive:
  // slips under when it goes. fly: takes off when it goes (flight speed).
  const KIND = {
    rabbit:   { len: 13, walk: 40, run: 120, frames: 4, land: true,  pause: [1.5, 5], hop: [2, 5],  draw: (g, f) => _rabbit(g, f, false) },
    hare:     { len: 15, walk: 42, run: 140, frames: 4, land: true,  pause: [1.5, 5], hop: [2, 6],  draw: (g, f) => _rabbit(g, f, true) },
    turkey:   { len: 20, walk: 24, run: 110, frames: 4, land: true,  pause: [1.2, 4], hop: [1.5, 4], draw: _turkey },
    heron:    { len: 30, walk: 7,  run: 10,  frames: 4, land: false, hab: 'shore', bob: false, fly: 85, pause: [4, 11], hop: [0.6, 2], draw: _heron },
    swan:     { len: 30, walk: 11, run: 40,  frames: 2, land: false, pause: [3, 8],   hop: [2, 6],  draw: _swan },
    frog:     { len: 9,  walk: 55, run: 55,  frames: 2, land: false, hab: 'shore', bob: false, dive: true, pause: [4, 14], hop: [0.4, 1.2], draw: _frog },
    turtle:   { len: 14, walk: 5,  run: 12,  frames: 2, land: false, hab: 'shore', bob: false, dive: true, pause: [8, 22], hop: [0.3, 1],   draw: _turtle },
    squirrel: { len: 21, walk: 60, run: 130, frames: 4, land: true,  pause: [0.8, 3], hop: [2, 6],  draw: _squirrel },
    fox:      { len: 31, walk: 38, run: 135, frames: 4, land: true,  pause: [2, 6],   hop: [4, 10], draw: _fox },
    deer:     { len: 33, walk: 22, run: 140, frames: 4, land: true,  pause: [3, 9],   hop: [3, 8],  draw: (g, f) => _deer(g, f, false, false) },
    stag:     { len: 33, walk: 22, run: 140, frames: 4, land: true,  pause: [3, 9],   hop: [3, 8],  draw: (g, f) => _deer(g, f, true, false) },
    fawn:     { len: 22, walk: 22, run: 140, frames: 4, land: true,  pause: [3, 9],   hop: [3, 8],  draw: (g, f) => _deer(g, f, false, true) },
    duck:     { len: 13, walk: 16, run: 60,  frames: 2, land: false, pause: [2, 6],   hop: [2, 6],  draw: (g, f) => _duck(g, f, false) },
    drake:    { len: 13, walk: 16, run: 60,  frames: 2, land: false, pause: [2, 6],   hop: [2, 6],  draw: (g, f) => _duck(g, f, true) },
    duckling: { len: 7,  walk: 16, run: 60,  frames: 1, land: false, pause: [2, 6],   hop: [2, 6],  draw: _duckling },
  };
  for (const k of Object.values(KIND)) { if (k.hab === undefined) k.hab = k.land; if (k.bob === undefined) k.bob = !k.land; }
  const _critterSprites = {};
  function _sprites(kind) {
    if (_critterSprites[kind]) return _critterSprites[kind];
    const k = KIND[kind], size = Math.ceil(k.len * 1.5 * RES), out = [];
    for (let f = 0; f < k.frames; f++) {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const g = c.getContext('2d');
      g.translate(size / 2, size / 2); g.scale(RES, RES);
      k.draw(g, f);
      out.push(c);
    }
    return (_critterSprites[kind] = { frames: out, size: size / RES });
  }

  // ── Where they may go ────────────────────────────────────────────────
  const _tile = (x, y) => [Math.floor(x / TILE), Math.floor(y / TILE)];
  function _open(land, x, y) {
    if (land === 'shore') return _open(false, x, y) && _byBank(x, y);
    const [c, r] = _tile(x, y);
    if (typeof GridManager === 'undefined' || !GridManager.inBounds(c, r)) return false;
    const water = typeof WaterSystem !== 'undefined' && WaterSystem.isWater(c, r);
    if (!land) {
      if (!water) return false;
      const e = GridManager.getEntity(c, r);
      return (!e || e.type === T.WATER) && !(typeof FrostSystem !== 'undefined' && FrostSystem.ice() > 0.3);
    }
    if (water || GridManager.getEntity(c, r)) return false;
    if (typeof ZoneSystem !== 'undefined' && (ZoneSystem.isInGovZone(c, r) || ZoneSystem.getZoneAt(c, r))) return false;
    return true;
  }
  // Open water with dry ground on at least one side.
  function _byBank(x, y) {
    const [c, r] = _tile(x, y);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if ((dc || dr) && GridManager.inBounds(c + dc, r + dr) && !WaterSystem.isWater(c + dc, r + dr)) return true;
    }
    return false;
  }
  // Every half tile along the way is open too.
  function _clearPath(land, x0, y0, x1, y1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE * 0.5)));
    for (let i = 1; i <= n; i++) if (!_open(land, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false;
    return true;
  }

  // ── Who turns up ─────────────────────────────────────────────────────
  const _season = () => (typeof Seasons !== 'undefined' && Seasons.enabled()) ? Seasons.index() : -1;
  const _snow = () => typeof FrostSystem !== 'undefined' && FrostSystem.snowCover ? FrostSystem.snowCover() : 0;
  function _pick() {
    const night = typeof DayNight !== 'undefined' && DayNight.darkness() > 0.45, s = _season(), winter = s === 3;
    const bunny = winter || _snow() > 0.5 ? 'hare' : 'rabbit';
    const w = night ? { fox: 5, deer: 4, [bunny]: 1, ...(s === 0 || s === 1 || s === -1 ? { frog: 1.5 } : {}) }
            : winter ? { hare: 3, fox: 2, deer: 3, squirrel: 1, swan: 1.5 }
            : s === 2 ? { rabbit: 3, squirrel: 4, deer: 2.5, fox: 1.5, duck: 2, turkey: 2.5, heron: 1, swan: 0.4 }
            : s === 0 ? { rabbit: 4, squirrel: 3, deer: 2, fox: 1.5, duck: 3, heron: 1.2, frog: 1.5, turtle: 0.8, turkey: 0.6 }
            : { rabbit: 4, squirrel: 3, deer: 2, fox: 1.5, duck: 3, heron: 1.2, frog: 1.5, turtle: 2 };
    let tot = 0; for (const k in w) tot += w[k];
    let r = Math.random() * tot;
    for (const k in w) { if ((r -= w[k]) < 0) return k; }
    return bunny;
  }

  // ── Marks left on the ground ─────────────────────────────────────────
  // Footprints in lying snow, and the little dug patch where a squirrel
  // buried a nut. World-anchored; each fades out over its own life (render
  // seconds), and prints also go with the snow.
  const marks = [];
  const MAX_MARKS = 1600;          // the town's people walk here too (zone_life.js, via print())
  const MARK_LIFE = { cache: 70, print: 120 };
  // Distance between prints, per walker (world px).
  const STRIDE = { rabbit: 13, hare: 15, squirrel: 9, fox: 7, deer: 9, stag: 9, fawn: 7, turkey: 6 };
  let _clock = 0;
  function _mark(kind, x, y, ang, foot) {
    marks.push({ kind, x, y, ang, foot, born: _clock });
    if (marks.length > MAX_MARKS) marks.splice(0, marks.length - MAX_MARKS);
  }
  const PRINT = 'rgba(64,88,124,';
  function _drawMark(ctx, m, a) {
    ctx.save();
    ctx.translate(m.x, m.y); ctx.rotate(m.ang);
    const E = (x, y, rx, ry, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
    const ink = PRINT + (0.32 * a).toFixed(3) + ')';
    const side = m.foot ? 1 : -1;
    switch (m.kind) {
      case 'cache':                                             // a scuffed little patch of earth
        E(0, 0, 2.4, 1.7, `rgba(88,62,38,${0.55 * a})`);
        E(0.8, -0.6, 0.7, 0.5, `rgba(60,42,26,${0.5 * a})`); E(-0.9, 0.7, 0.6, 0.4, `rgba(120,90,58,${0.45 * a})`);
        break;
      case 'rabbit': case 'hare': case 'squirrel': {            // the Y: two long hind feet ahead, fore paws one behind the other
        const s = m.kind === 'squirrel' ? 0.7 : m.kind === 'hare' ? 1.15 : 1;
        E(2.2 * s, -1.5 * s, 1.5 * s, 0.7 * s, ink); E(2.2 * s, 1.5 * s, 1.5 * s, 0.7 * s, ink);
        E(-1.6 * s, 0.3 * s, 0.6 * s, 0.55 * s, ink); E(-3.4 * s, -0.2 * s, 0.6 * s, 0.55 * s, ink);
        break;
      }
      case 'person':                                            // a shoe: the sole, and the heel just behind it
        E(0.35, side * 0.75, 0.75, 0.42, ink); E(-0.75, side * 0.75, 0.4, 0.36, ink);
        break;
      case 'bike':                                              // a tyre's thin line, a short dash of it at a time
        ctx.fillStyle = ink; ctx.fillRect(-2.2, -0.22, 4.4, 0.44);
        break;
      case 'fox':                                               // neat single line, one pad after another
        E(0, side * 0.9, 0.9, 0.7, ink);
        break;
      case 'deer': case 'stag': case 'fawn': {                  // split hoof
        const s = m.kind === 'fawn' ? 0.7 : 1;
        E(0, side * 2.2 * s - 0.45 * s, 1.1 * s, 0.4 * s, ink); E(0, side * 2.2 * s + 0.45 * s, 1.1 * s, 0.4 * s, ink);
        break;
      }
      case 'turkey':                                            // three toes forward
        ctx.strokeStyle = ink; ctx.lineWidth = 0.45; ctx.lineCap = 'round';
        ctx.beginPath();
        for (const t of [-0.55, 0, 0.55]) { ctx.moveTo(0, side * 1.4); ctx.lineTo(Math.cos(t) * 2, side * 1.4 + Math.sin(t) * 2); }
        ctx.moveTo(0, side * 1.4); ctx.lineTo(-0.9, side * 1.4);
        ctx.stroke();
        break;
    }
    ctx.restore();
  }

  const _rand = (a, b) => a + Math.random() * (b - a);
  function _make(kind, x, y, heading, leader) {
    return { kind, x, y, heading, state: 'pause', timer: _rand(0.5, 2), tx: x, ty: y, speed: 0, anim: Math.random() * 4,
             alpha: 0, life: _rand(70, 160), leader: leader || null, slot: 0, leaving: false };
  }
  function _spawn(vx, vy, vw, vh, kind) {
    const want = kind || _pick(), land = KIND[want].hab;
    // Shore tiles are a thin band, so it takes more looking to land on one.
    const tries = land === 'shore' ? 90 : land ? 30 : 40;
    for (let n = 0; n < tries; n++) {
      const x = vx - vw * 0.15 + Math.random() * vw * 1.3, y = vy - vh * 0.15 + Math.random() * vh * 1.3;
      if (!_open(land, x, y)) continue;
      const h = Math.random() * Math.PI * 2, spring = _season() === 0;
      if (want === 'deer') {
        const lead = _make(Math.random() < 0.25 ? 'stag' : 'deer', x, y, h);
        animals.push(lead);
        const n = Math.floor(Math.random() * 3);                     // 0-2 more
        for (let i = 0; i < n; i++) { const f = _make(spring && i === n - 1 ? 'fawn' : 'deer', x - Math.cos(h) * 30 * (i + 1), y - Math.sin(h) * 30 * (i + 1), h, lead); f.slot = i + 1; animals.push(f); }
      } else if (want === 'duck') {
        const lead = _make('duck', x, y, h);
        animals.push(lead);
        if (spring && Math.random() < 0.7) {
          const n = 2 + Math.floor(Math.random() * 4);
          for (let i = 0; i < n; i++) { const d = _make('duckling', x, y, h, lead); d.slot = i + 1; animals.push(d); }
        } else { const m = _make('drake', x, y, h, lead); m.slot = 1; animals.push(m); }
      } else if (want === 'turkey') {
        const lead = _make('turkey', x, y, h);
        animals.push(lead);
        const n = 2 + Math.floor(Math.random() * 4);                 // a little flock pecking along
        for (let i = 0; i < n; i++) { const t = _make('turkey', x - Math.cos(h) * 16 * (i + 1), y - Math.sin(h) * 16 * (i + 1), h, lead); t.slot = i + 1; animals.push(t); }
      } else if (want === 'swan') {
        const lead = _make('swan', x, y, h);
        animals.push(lead);
        if (Math.random() < 0.75) { const m = _make('swan', x, y, h, lead); m.slot = 1; animals.push(m); }   // they keep in pairs
      } else animals.push(_make(want, x, y, h));
      return;
    }
  }

  // ── Behaviour ────────────────────────────────────────────────────────
  function _newTarget(a, k, flee, fx, fy) {
    const land = k.hab;
    for (let tries = 0; tries < 10; tries++) {
      const ang = flee ? Math.atan2(a.y - fy, a.x - fx) + _rand(-0.6, 0.6) : (Math.random() < 0.6 ? a.heading + _rand(-1, 1) : Math.random() * Math.PI * 2);
      const d = (flee ? _rand(5, 8) : _rand(k.hop[0], k.hop[1])) * TILE * (land === false ? 0.6 : 1);
      const tx = a.x + Math.cos(ang) * d, ty = a.y + Math.sin(ang) * d;
      if (_clearPath(land, a.x, a.y, tx, ty)) { a.tx = tx; a.ty = ty; a.state = flee ? 'flee' : 'move'; return true; }
    }
    return false;
  }
  function _turnTo(a, ang, dt, rate) {
    let d = ang - a.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    a.heading += Math.max(-rate * dt, Math.min(rate * dt, d));
  }

  function _update(a, dt, view) {
    const k = KIND[a.kind];
    if (a.leader) {
      // Followers trail their leader: deer at a stride, ducklings in a line.
      const L = a.leader;
      if (!animals.includes(L)) { a.leader = null; return; }
      const gap = ({ duckling: 9, drake: 14, swan: 24, turkey: 15 }[a.kind] || 28) * a.slot;
      const side = a.kind === 'drake' ? 8 : a.kind === 'swan' ? 12 : (a.slot % 2 ? 6 : -6) * (a.kind === 'duckling' ? 0.3 : a.kind === 'turkey' ? 1.3 : 1);
      const tx = L.x - Math.cos(L.heading) * gap - Math.sin(L.heading) * side, ty = L.y - Math.sin(L.heading) * gap + Math.cos(L.heading) * side;
      const dx = tx - a.x, dy = ty - a.y, dist = Math.hypot(dx, dy);
      const sp = Math.min(dist * 2.2, (L.state === 'flee' ? k.run : k.walk) * 1.4);
      if (dist > 0.5) { a.x += dx / dist * sp * dt; a.y += dy / dist * sp * dt; _turnTo(a, Math.atan2(dy, dx), dt, 6); }
      a.speed = sp; a.leaving = L.leaving;
      return;
    }
    // Up and away: straight out over everything, wings beating.
    if (a.state === 'fly') {
      a.speed = k.fly;
      a.x += Math.cos(a.heading) * k.fly * dt; a.y += Math.sin(a.heading) * k.fly * dt;
      return;
    }
    // Time to go: make for the nearest edge of the view, and on out — or,
    // for the shore animals, take off or slip under the water.
    if (!a.leaving && a.life <= 0) {
      a.leaving = true;
      if (k.fly) { a.state = 'fly'; a.flying = true; a.dig = 0; return; }
      if (k.dive) { a.diving = true; a.state = 'pause'; a.timer = 99; return; }
      const ex = a.x < view.x + view.w / 2 ? view.x - 200 : view.x + view.w + 200;
      if (_clearPath(k.hab, a.x, a.y, ex, a.y)) { a.tx = ex; a.ty = a.y; a.state = 'flee'; }
    }
    if (a.dig > 0) {
      a.dig -= dt; a.speed = 0;
      if (a.dig <= 0) _mark('cache', a.x + Math.cos(a.heading) * 4, a.y + Math.sin(a.heading) * 4, a.heading, 0);
      return;
    }
    if (a.state === 'pause') {
      a.speed = 0;
      if ((a.timer -= dt) <= 0 && !_newTarget(a, k, false)) a.timer = _rand(1, 3);
      return;
    }
    const dx = a.tx - a.x, dy = a.ty - a.y, dist = Math.hypot(dx, dy);
    let sp = a.state === 'flee' ? k.run : k.walk;
    if ((a.kind === 'rabbit' || a.kind === 'hare' || a.kind === 'frog') && a.state !== 'flee') sp *= 0.4 + 1.2 * Math.abs(Math.sin(a.anim * Math.PI / 2));   // hop, hop
    _turnTo(a, Math.atan2(dy, dx), dt, a.state === 'flee' ? 9 : 4);
    const step = Math.min(dist, sp * dt);
    if (dist < 1.5) {
      a.state = 'pause'; a.timer = _rand(k.pause[0], k.pause[1]); a.speed = 0;
      // Autumn: a squirrel stops to bury a nut, and leaves the dug spot behind.
      if (a.kind === 'squirrel' && _season() === 2 && !a.leaving && Math.random() < 0.6) a.dig = _rand(1.6, 3);
      return;
    }
    const nx = a.x + dx / dist * step, ny = a.y + dy / dist * step;
    if (!_open(k.hab, nx, ny)) { a.state = 'pause'; a.timer = _rand(0.5, 1.5); return; }   // something built in the way
    a.x = nx; a.y = ny; a.speed = sp;
  }

  return {
    KINDS: Object.keys(KIND),
    // A mark left by something that is not one of these animals: the town's
    // people ('person', alternating `foot`) and cyclists ('bike'), from
    // zone_life.js. The caller decides there is snow to take it.
    print(kind, x, y, ang, foot) { _mark(kind, x, y, ang, foot ? 1 : 0); },
    // The animals about now, for OutdoorAmbience: { ref, kind, x, y, fleeing }.
    nearby: () => animals.map(a => ({ ref: a, kind: a.kind, x: a.x, y: a.y, fleeing: a.state === 'flee' })),
    // Dev / trailer: put a `kind` ('rabbit', 'squirrel', 'fox', 'deer' for a
    // group, 'duck' for a pair or brood), or a random one, on open ground or
    // water near the middle of the view.
    spawnNow(kind) {
      const z = Camera.zoom, vw = window.innerWidth / z, vh = window.innerHeight / z;
      const want = ['deer', 'stag', 'fawn'].includes(kind) ? 'deer' : ['duck', 'drake', 'duckling'].includes(kind) ? 'duck' : (KIND[kind] ? kind : undefined);
      const before = animals.length;
      for (let i = 0; i < 20 && animals.length === before; i++) _spawn(Camera.x + vw * 0.3, Camera.y + vh * 0.3, vw * 0.4, vh * 0.4, want);
      return animals.length > before;
    },
    // The drawn animal `kind` in pose `f` (a canvas), for previews.
    sprite: (kind, f = 0) => KIND[kind] ? _sprites(kind).frames[f % KIND[kind].frames] : null,
    // Debug: footprints and dug spots on the ground now, per kind.
    marks: () => marks.reduce((o, m) => (o[m.kind] = (o[m.kind] || 0) + 1, o), {}),

    // World-space, camera transform applied; `t` is the render clock in seconds.
    render(ctx, t) {
      let dt = lastT === null ? 0 : Math.min(0.25, Math.max(0, t - lastT));
      lastT = t;
      if (typeof DevMode !== 'undefined' && DevMode.timeScale === 0) dt = 0;   // paused
      const zoom = Camera.zoom;
      const view = { x: Camera.x, y: Camera.y, w: window.innerWidth / zoom, h: window.innerHeight / zoom };
      const fade = Math.max(0, Math.min(1, (zoom - 0.35) / 0.12));

      // Keep a few about: more on a wide view, fewer in heavy rain.
      const rain = typeof RainSystem !== 'undefined' && RainSystem.level ? RainSystem.level() : 0;
      const target = Math.round(Math.max(2, Math.min(7, view.w * view.h / (TILE * TILE * 110))) * (rain > 0.45 ? 0.5 : 1));
      const leaders = animals.filter(a => !a.leader).length;
      if (dt > 0 && zoom > 0.35 && leaders < target && (spawnWait -= dt) <= 0) { _spawn(view.x, view.y, view.w, view.h); spawnWait = _rand(2, 6); }


      if (dt > 0) _clock += dt;
      const snow = _snow();
      for (let i = animals.length - 1; i >= 0; i--) {
        const a = animals[i];
        if (dt > 0) {
          const k = KIND[a.kind], px = a.x, py = a.y;
          a.life -= dt;
          _update(a, dt, view);
          a.anim += dt * (a.speed > 0 ? Math.max(4, a.speed / 6) : 0);
          if (a.diving) { a.alpha -= dt / 1.6; if (a.alpha <= 0) { animals.splice(i, 1); continue; } }
          else a.alpha = Math.min(1, a.alpha + dt / 1.2);
          // Prints in the snow, one every stride, alternating feet.
          const stride = STRIDE[a.kind];
          if (stride && k.land && snow > 0.4) {
            a.trail = (a.trail || 0) + Math.hypot(a.x - px, a.y - py);
            if (a.trail >= stride) { a.trail -= stride; a.foot = !a.foot; _mark(a.kind, a.x, a.y, a.heading, a.foot ? 1 : 0); }
          }
        }
        // Gone once well out of view (or zoomed right out).
        const m = 260;
        if (a.x < view.x - m || a.x > view.x + view.w + m || a.y < view.y - m || a.y > view.y + view.h + m || (zoom <= 0.3 && dt > 0)) { animals.splice(i, 1); continue; }
      }
      // Marks run out on their own clock, and the prints go with the snow.
      for (let i = marks.length - 1; i >= 0; i--) if (_clock - marks[i].born > MARK_LIFE[marks[i].kind === 'cache' ? 'cache' : 'print']) marks.splice(i, 1);
      if (fade <= 0 || (!animals.length && !marks.length)) return;

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      const snowA = Math.max(0, Math.min(1, (snow - 0.25) / 0.25));
      for (const mk of marks) {
        if (mk.x < view.x - 20 || mk.x > view.x + view.w + 20 || mk.y < view.y - 20 || mk.y > view.y + view.h + 20) continue;
        const life = MARK_LIFE[mk.kind === 'cache' ? 'cache' : 'print'];
        const age = (_clock - mk.born) / life;
        const al = fade * Math.min(1, (1 - age) * 3) * (mk.kind === 'cache' ? 1 : snowA);
        if (al > 0.01) _drawMark(ctx, mk, al);
      }
      for (const a of animals) {
        const k = KIND[a.kind], spr = _sprites(a.kind);
        const moving = a.speed > 0;
        const f = a.flying ? 2 + (Math.floor(a.anim * 0.6) % 2)
                : a.kind === 'heron' ? (moving ? Math.floor(a.anim) % 2 : 0)
                : moving ? Math.floor(a.anim) % k.frames : 0;
        const al = a.alpha * fade;
        if (!k.land && moving && !a.flying && a.kind !== 'frog') {      // a wake behind a swimmer
          // A Kelvin-style V, drawn in the swimmer's own frame: each arm a
          // crest with a soft swell under it and a darker trough inside,
          // fading out behind; small transverse ripples roll back between
          // the arms, and a little bow wave curls off the breast. Faster
          // swimmers throw a longer, wider wake.
          const L = k.len, sp = Math.min(1, a.speed / Math.max(1, k.walk * 2));
          const reach = L * (0.9 + 0.8 * sp), spread = 0.36 + 0.1 * sp, x0 = -L * 0.32;
          const ax = Math.cos(spread) * reach, ay = Math.sin(spread) * reach;
          ctx.save();
          ctx.translate(a.x, a.y); ctx.rotate(a.heading); ctx.lineCap = 'round';
          for (const s of [-1, 1]) {
            const ex = x0 - ax, ey = s * ay, mx = x0 - ax * 0.5, my = s * (ay * 0.5 + L * 0.07);
            const arm = (off, col, w) => {
              ctx.strokeStyle = col; ctx.lineWidth = w;
              ctx.beginPath(); ctx.moveTo(x0, s * off); ctx.quadraticCurveTo(mx, my + s * off, ex, ey + s * off * 2); ctx.stroke();
            };
            const fadeG = (r, g2, b, a0) => {
              const gr = ctx.createLinearGradient(x0, 0, ex, ey);
              gr.addColorStop(0, `rgba(${r},${g2},${b},${a0 * al})`); gr.addColorStop(0.55, `rgba(${r},${g2},${b},${a0 * 0.45 * al})`); gr.addColorStop(1, `rgba(${r},${g2},${b},0)`);
              return gr;
            };
            arm(-0.9, fadeG(20, 50, 70, 0.16), 1.0);                     // trough inside the crest
            arm(0, fadeG(225, 240, 250, 0.16 + 0.1 * sp), 2.6);           // swell
            arm(0, fadeG(240, 248, 255, 0.5 + 0.2 * sp), 0.7);            // crest
          }
          // Transverse ripples rolling back between the arms.
          ctx.lineWidth = 0.5;
          for (let j = 0; j < 3; j++) {
            const u = (t * (0.35 + 0.5 * sp) + j / 3 + (a.anim || 0) * 0.01) % 1;
            const x = x0 - ax * (0.12 + 0.8 * u), w = ay * (0.12 + 0.8 * u) * 0.8;
            ctx.strokeStyle = `rgba(235,245,252,${0.3 * (1 - u) * (0.5 + 0.5 * sp) * al})`;
            ctx.beginPath(); ctx.moveTo(x + w * 0.15, -w); ctx.quadraticCurveTo(x - w * 0.3, 0, x + w * 0.15, w); ctx.stroke();
          }
          // Bow wave and a fleck of foam off the breast.
          ctx.strokeStyle = `rgba(245,250,255,${(0.35 + 0.25 * sp) * al})`; ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.ellipse(L * 0.1, 0, L * 0.36, L * 0.3, 0, -1.1, 1.1); ctx.stroke();
          ctx.fillStyle = `rgba(250,252,255,${0.4 * sp * al})`;
          for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x0 + L * 0.08, s * L * 0.2, 0.45, 0, Math.PI * 2); ctx.fill(); }
          ctx.restore();
        }
        if (a.diving) {                                                   // rings spreading where it went under
          const r = (1 - a.alpha) * k.len * 0.9 + 2;
          ctx.strokeStyle = `rgba(220,236,246,${0.5 * a.alpha * fade})`; ctx.lineWidth = 0.7;
          ctx.beginPath(); ctx.ellipse(a.x, a.y, r, r * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
        }
        if (k.land || a.flying) {                                         // a soft shadow underfoot (well below, for a bird up)
          const off = a.flying ? 14 : 0;
          ctx.fillStyle = `rgba(0,0,0,${(a.flying ? 0.12 : 0.18) * al})`;
          ctx.beginPath(); ctx.ellipse(a.x + 1.5 + off * 0.7, a.y + 2 + off, k.len * (a.flying ? 0.5 : 0.36), k.len * 0.16, a.heading, 0, Math.PI * 2); ctx.fill();
        }
        ctx.save();
        ctx.globalAlpha = al;
        ctx.translate(a.x, a.y); ctx.rotate(a.heading);
        if (k.bob) ctx.translate(0, Math.sin(t * 2 + a.anim) * 0.3);       // bobbing on the water
        if (a.dig > 0) {                                                   // nose down, scrabbling
          ctx.translate(Math.sin(t * 17) * 0.6, 0);
          for (let j = 0; j < 3; j++) {
            const u = (t * 2.3 + j / 3) % 1;
            ctx.fillStyle = `rgba(96,68,40,${0.7 * (1 - u)})`;
            ctx.beginPath(); ctx.arc(5 - u * 3, (j - 1) * (1 + u * 3), 0.55, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.drawImage(spr.frames[f], -spr.size / 2, -spr.size / 2, spr.size, spr.size);
        ctx.restore();
      }
      ctx.restore();
    },
  };
})();

/* Wind state — shared by all Wind Turbines */
const WindState = (() => {
  // Two-layer wind model:
  //   trend  — slow-moving base (shifts over 30-120s), the underlying "weather"
  //   turb   — fast turbulence riding on top (changes every second), adds realism
  // effectiveSpeed is what turbines actually see and what drives rotation speed.
  let trend   = 0.4 + Math.random() * 0.3;
  let target  = trend;
  let turb    = 0;       // -0.2 to +0.2 turbulence layer
  let stormBoost    = 0; // 0-1 extra wind from active storm, decays over time
  let stormTurbMult = 1; // turbulence multiplier during storm

  // Running effective speed exposed to the outside
  let effective = trend;

  // Direction the wind blows TOWARD, radians (0 = east, π/2 = south on
  // screen). Wanders slowly; carries smog downwind (PollutionSystem).
  let dir       = Math.random() * Math.PI * 2;
  let dirTarget = dir;
  let calmHold  = 0;   // seconds of forced still air left (smog day, dead calm)
  // Dead calm: not a breath of wind. The air settles to nothing (no 0.05
  // floor, next to no turbulence), and turbines sit on their base output —
  // which itself sags now and then (`lull`, a multiplier on base output that
  // wanders down to 0.7 while it lasts: an MK1's 5 kW to 3.5), so the minimum
  // isn't a floor.
  let stillAir  = false;
  let lull = 1, lullTarget = 1;

  return {
    get speed()     { return effective; },
    get trendSpeed(){ return trend; },
    get dir()       { return dir; },
    set dir(v)      { dir = v; dirTarget = v; },
    // How much of a turbine's base output is there right now (1 but in a dead calm).
    get lull()      { return lull; },

    // Smog day / dead calm (weather_events.js): hold the air still for
    // `secs`. `still` is a dead calm: dead still rather than barely moving.
    holdCalm(secs, still = false) {
      calmHold = Math.max(calmHold, secs || 0); stillAir = stillAir || !!still;
      target = stillAir ? 0 : 0.03; stormBoost = 0; stormTurbMult = 1;
    },
    releaseCalm()  { stillAir = false; if (calmHold > 0) { calmHold = 0; target = 0.2 + Math.random() * 0.4; } },
    get calm()     { return calmHold > 0; },

    // Called by storm event — pushes wind high and increases turbulence
    triggerStorm(intensity, duration) {
      // High wind target during storm (0.7–1.0)
      target        = 0.70 + intensity * 0.30;
      stormBoost    = intensity * 0.25;
      stormTurbMult = 1.5 + intensity;
      // Storm boost decays over the storm duration
      // We approximate via a per-tick decay rate
      this._stormDecayRate = stormBoost / Math.max(1, duration / 0.1);
    },

    // Called when storm clears — wind settles back down
    triggerCalm() {
      target        = Math.random() * 0.20;
      stormBoost    = 0;
      stormTurbMult = 1;
    },

    tick(dt) {
      // Storm boost decays each tick
      if (stormBoost > 0) {
        stormBoost = Math.max(0, stormBoost - (this._stormDecayRate || 0.001));
        if (stormBoost <= 0) stormTurbMult = 1;
      }

      // Slow trend: infrequent large shifts (gusts, lulls)
      // During storms, target stays high; otherwise normal random walk
      if (calmHold > 0) {
        calmHold = Math.max(0, calmHold - dt);
        if (calmHold <= 0) stillAir = false;
        target = stillAir ? 0 : 0.03;
      } else if (!stormBoost && Math.random() < 0.003) {
        // Allow proper calms (low wind periods) as well as gusts
        target = Math.random() < 0.3 ? Math.random() * 0.15 : 0.10 + Math.random() * 0.85;
      }

      // Passive coupling to cloud cover — overcast = windier baseline
      const cloudInfluence = calmHold > 0 ? 0 : CloudState.cover * 0.15;
      const adjustedTarget = Math.min(1.0, target + cloudInfluence);

      // A dead calm settles in (and lets go) a little quicker than a lull.
      trend += (adjustedTarget - trend) * Math.min(1, dt * (stillAir ? 0.2 : 0.04));

      // Fast turbulence — amplified during storms
      turb = turb * 0.80 + (Math.random() - 0.5) * 0.18 * stormTurbMult * (calmHold > 0 ? (stillAir ? 0.03 : 0.2) : 1);

      // Combine and clamp — turbulence can bring wind near-zero briefly.
      // A dead calm has no floor: the air can stop altogether.
      effective = Math.max(stillAir ? 0 : 0.05, Math.min(1.0, trend + turb + stormBoost));

      // Base output sagging in a dead calm: a new low every so often,
      // eased toward; back to 1 once the air moves again.
      if (stillAir && trend < 0.1) { if (Math.random() < dt * 0.12) lullTarget = Math.random() < 0.5 ? 1 : 0.7 + Math.random() * 0.3; }
      else lullTarget = 1;
      lull += (lullTarget - lull) * Math.min(1, dt * 0.4);

      // Direction: an occasional new prevailing heading (a big swing during
      // storms), eased toward along the short way round.
      if (Math.random() < (stormBoost ? 0.004 : 0.0008)) dirTarget = dir + (Math.random() - 0.5) * Math.PI * (stormBoost ? 1.5 : 0.8);
      const dd = Math.atan2(Math.sin(dirTarget - dir), Math.cos(dirTarget - dir));
      dir += dd * Math.min(1, dt * 0.02);
    },
  };
})();

