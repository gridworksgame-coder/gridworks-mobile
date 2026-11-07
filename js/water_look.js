/* ═══════════════════════════════════════════════════════════════════
   WATER LOOK
   ─────────────────────────────────────────────────────────────────
   The static look of open water and its banks: depth shading (pale
   shallows running down to deep navy), an organic shoreline in place of
   the tile grid's square one, and the damp soil and wet sand that follow
   that shoreline up onto the land.

   None of it is drawn per frame. Everything that does not move is baked
   once into chunk images and the frame pays one drawImage per visible
   chunk, which is the only way this fits the budget the old caustics,
   ripples and shimmer were all cut for (see the notes in
   render_world_civic.js). What moves -- streaks, glints, falls -- stays in
   renderWaterEffects, drawn on top.

   How a chunk is made:
     • DEPTH is distance from the nearest land tile, worked out once for
       the whole map.
     • Depth, the water mask and a "natural bank" flag are written one
       pixel per tile and scaled up with smoothing, which turns the tile
       staircase into continuous fields for free. The shoreline is the
       mask's 0.5 contour, so corners round off and diagonal runs stop
       being steps.
     • World-keyed noise pushes the contour in and out by a few pixels, so
       a straight bank wobbles. Keyed on world position, never on the
       chunk, so neighbouring chunks agree along their seam.
     • The bank is shaded off the same field on the land side of the
       contour, so soil and sand hug the waterline wherever it goes.
     • Inside a water tile the bake is opaque (the ground layer skips water
       tiles, so there is nothing underneath to reveal); on a land tile it
       has alpha and lies over the ground.

   HARD EDGES. Where the land beside the water is a paved zone with its
   quay wall, or a dam, the waterline stays exactly
   on the tile boundary, dead straight, with no bank: a wobbling shore
   would put a strip of mud between a quay and its water. The natural-bank
   field carries that, and fades the wobble out towards such a tile.

   FOAM AND ICE. The same pass writes, beside the water, two masks of a
   band just off the waterline and (coarse bakes only) a mask of the water
   itself. Foam is the two masks faded in and out against each other; ice is
   the third laid over in winter. Both follow the baked shoreline for the
   price of a drawImage or two per chunk.

   Each 16-tile chunk is baked coarse first (2-3 ms) and drawn at once; when
   the zoom wants more, each quarter is baked again at 20 or 40 px a tile
   (2-5 ms), about one a frame, the coarse quarter standing in meanwhile.
   Until even the coarse one exists the flat fill from renderWaterBaseFill
   shows through.
   ═══════════════════════════════════════════════════════════════════ */
const WaterLook = (() => {

  const CH     = 16;            // tiles per chunk side, coarse bakes
  const FCH    = 8;             // tiles per chunk side, fine bakes: a quarter of a coarse
                                // chunk, so one fine bake fits in a frame's allowance
  const MARGIN = 2;             // tiles of surround sampled, so smoothing sees past the seam
  const PAD    = 1;             // baked pixels past each side, for smoothing to sample at the edge
  const COARSE = 10;            // baked pixels per tile for the first, immediate bake
  const LODS   = [40, 20, 10];  // baked pixels per tile; picked by zoom
  const KEEP_BYTES = 96 * 1024 * 1024;   // chunks out of view are dropped past this

  const DEPTH_CAP   = 7;        // tiles; deeper than this is all one navy
  const DEPTH_SCALE = 18;       // 8-bit steps per tile of depth in the field image

  // Depth (tiles from the true shoreline) -> colour. The flat water fill
  // used to be mixed 16% toward DayNight.skyColorRGB(), which is a dark grey
  // all day (8-23 a channel): that darkening is folded in here rather than
  // laid over as a per-tile overlay, which would put the tile grid back
  // wherever the baked water reaches over a land tile.
  const RAMP = [
    [0.0,  47, 102, 100],
    [0.5,  27,  77,  87],
    [1.5,  15,  52,  73],
    [3.5,  10,  34,  56],
    [6.0,   8,  26,  46],
  ];
  const EDGE  = [150, 190, 182]; // the pale wet line right where water meets the bank
  // The bank, from the waterline outwards. The tones of the square band the
  // ground layer used to paint (_bankGrad in render_core.js), the soil
  // lifted off near-black: as a continuous line round every shore it read
  // as an outline.
  const SOIL  = [32, 30, 21];    // damp soil at the waterline
  const SAND  = [58, 52, 35];    // wet sand
  const SAND2 = [84, 74, 46];    // drying out, and fading into the grass
  const FOAM_RGB = [226, 240, 244];
  const ICE_RGB  = [208, 230, 244]; // as the flat ice renderWaterBaseFill used to lay
  const FOAM_A = 1, FOAM_B = 2, ICE = 3;   // panels of a baked chunk image, after the water

  let depth = null;              // Float32Array, 0 = land, 1 = shore tile, rising into open water
  const chunks = new Map();      // "P:cx,cy" -> chunk, see bakeChunk
  // Chunks a single tile's water/land change has just made wrong. They are
  // re-baked on the next frame whatever the budget, so a lake comes back
  // the moment the building filling it is removed, not some seconds later.
  const urgent = new Set();
  let bytes = 0, frame = 0, zoneVer = null;
  let small = null, smallCtx = null, mid = null, midCtx = null, big = null, bigCtx = null;
  const MID = 4;                 // pixels per tile the fields are blurred at

  // ── Depth field ──────────────────────────────────────────────────
  // A two-pass chamfer transform (1 across, √2 diagonally) rather than a
  // flood fill: a flood counts in city blocks, and its depth contours come
  // out as diamonds that show straight through the shading as diagonal
  // bands. The map edge is not a shore -- water runs off it -- so only land
  // tiles are sources.
  function buildDepth() {
    buildBridged();
    const d = new Float32Array(COLS * ROWS), D2 = Math.SQRT2;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        d[r * COLS + c] = wet(c, r) ? DEPTH_CAP : 0;
    const relax = (i, c, r, dc, dr, w) => {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) return;
      const v = d[nr * COLS + nc] + w;
      if (v < d[i]) d[i] = v;
    };
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c; if (!d[i]) continue;
      relax(i, c, r, -1, 0, 1); relax(i, c, r, 0, -1, 1); relax(i, c, r, -1, -1, D2); relax(i, c, r, 1, -1, D2);
    }
    for (let r = ROWS - 1; r >= 0; r--) for (let c = COLS - 1; c >= 0; c--) {
      const i = r * COLS + c; if (!d[i]) continue;
      relax(i, c, r, 1, 0, 1); relax(i, c, r, 0, 1, 1); relax(i, c, r, 1, 1, D2); relax(i, c, r, -1, 1, D2);
    }
    // Soften what is left of the lattice out in open water. The first tile
    // in from the bank is left exact: that is where the shoreline is read.
    depth = new Float32Array(d);
    for (let r = 1; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) {
      const i = r * COLS + c;
      if (d[i] < 1.9) continue;
      let s = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) s += Math.max(1, d[i + dr * COLS + dc]);
      depth[i] = s / 9;
    }
  }

  // Water a hydro turbine or a shaft stands over. A turbine takes its tiles
  // out of WaterSystem altogether and a shaft claims them in the grid, but
  // the water is still there under the structure: read as land, the bake
  // drew a bank round each one and the structure repainted the gap as flat
  // squares.
  let bridged = new Set();
  function buildBridged() {
    bridged = new Set();
    for (const ty of [T.HYDROTURBINE, T.SHAFT])
      for (const e of EntityRegistry.getByType(ty))
        for (const w of e._waterTiles || []) bridged.add(w.r * COLS + w.c);
  }
  function wet(c, r) {
    if (WaterSystem.isWater(c, r)) return true;
    return c >= 0 && r >= 0 && c < COLS && r < ROWS && bridged.has(r * COLS + c);
  }

  // Off-map reads as whatever the nearest edge tile is, so a river leaving
  // the map does not grow a bank along the border.
  function depthAt(c, r) {
    c = c < 0 ? 0 : c >= COLS ? COLS - 1 : c;
    r = r < 0 ? 0 : r >= ROWS ? ROWS - 1 : r;
    return depth[r * COLS + c];
  }

  // ── Hard edges ───────────────────────────────────────────────────
  // Paved ground: a zone's rect plus the one-tile apron its cobbles cover
  // (the same PAD=1 drawZoneQuays uses). Not industrial: a gravel yard
  // has no quay wall (QUAY_ZONE_KEYS in render_core.js), and treating it as
  // hard squared off any natural lake one of its corners touched.
  const ZONE_KEYS = ['residential', 'commercial', 'government'];
  function zoneRectsNear(c0, r0, c1, r1) {
    const hit = [];
    if (typeof ZoneSystem === 'undefined') return hit;
    for (const key of ZONE_KEYS) {
      for (const z of (ZoneSystem.getZoneRects(key) || [])) {
        if (z.maxC + 1 >= c0 && z.minC - 1 <= c1 && z.maxR + 1 >= r0 && z.minR - 1 <= r1) hit.push(z);
      }
    }
    return hit;
  }
  // A hard edge stands on this land tile. Only a dam: everything else
  // stands on the bank and is drawn over it, and treating it as hard cut a
  // square bite out of the shore wherever a wire run, a pole or a pipe stub
  // reached the water. (Paved zones are the other hard edge, see above.)
  const hardEntity = e => !!e && e.type === T.DAM;
  function built(c, r) { return hardEntity(GridManager.getEntity(c, r)); }

  // ── Noise ────────────────────────────────────────────────────────
  // Value noise on world coordinates, so it is identical whichever chunk
  // asks. The lattice is a 256-square table of hashed values, wrapped: at the
  // finest scale that repeats every 5000-odd pixels, which nobody will spot
  // in a wobble, and a table read is several times cheaper than hashing.
  const NT = 256, ntab = new Float32Array(NT * NT);
  for (let iy = 0; iy < NT; iy++) for (let ix = 0; ix < NT; ix++) {
    let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    ntab[iy * NT + ix] = ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const x0 = ix & 255, x1 = (ix + 1) & 255, y0 = (iy & 255) * NT, y1 = ((iy + 1) & 255) * NT;
    const a = ntab[y0 + x0], b = ntab[y0 + x1], c = ntab[y1 + x0], d = ntab[y1 + x1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  // How far the shoreline is pushed, in mask units (about tiles), and the
  // faint broad mottling that keeps a big lake from being one airbrushed
  // gradient.
  const wobble = (wx, wy) => (noise(wx / 64, wy / 64) - 0.5) * 0.36 + (noise(wx / 21, wy / 21) - 0.5) * 0.16;
  const mottle = (wx, wy) => 1 + (noise(wx / 150, wy / 150) - 0.5) * 0.10 + (noise(wx / 37 + 9, wy / 37) - 0.5) * 0.05;

  function ramp(d, out) {
    let i = 1;
    while (i < RAMP.length - 1 && d > RAMP[i][0]) i++;
    const a = RAMP[i - 1], b = RAMP[i];
    let f = (d - a[0]) / (b[0] - a[0]);
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    out[0] = a[1] + (b[1] - a[1]) * f;
    out[1] = a[2] + (b[2] - a[2]) * f;
    out[2] = a[3] + (b[3] - a[3]) * f;
  }
  // The ramp as a table, LUT_RES steps per tile of depth: the bake reads it
  // for every water pixel and a search per pixel was a real share of the time.
  const LUT_RES = 32, LUT_N = 8 * LUT_RES;
  let lut = null;
  function buildLut() {
    lut = new Float32Array(LUT_N * 3);
    const c = [0, 0, 0];
    for (let i = 0; i < LUT_N; i++) { ramp(i / LUT_RES, c); lut[i * 3] = c[0]; lut[i * 3 + 1] = c[1]; lut[i * 3 + 2] = c[2]; }
  }

  // ── Bake ─────────────────────────────────────────────────────────
  // Returns { canvas, interior, zoned }. `canvas` is null where there is no
  // water in or lapping at the chunk. `interior` is open water with no
  // shore anywhere near: nothing but smooth gradient, so the coarse bake is
  // all it will ever need. `zoned` is whether paving reached into it.
  const sizeOf = P => P === COARSE ? CH : FCH;
  function bakeChunk(P, cx, cy) {
    const CS = sizeOf(P);
    const c0 = cx * CS, r0 = cy * CS;
    const n = CS + MARGIN * 2;
    let wetN = 0;
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++)
        if (wet(c0 - MARGIN + i, r0 - MARGIN + j)) wetN++;
    const zones = zoneRectsNear(c0 - MARGIN, r0 - MARGIN, c0 + CS + MARGIN, r0 + CS + MARGIN);
    const res = { canvas: null, interior: wetN === n * n, zoned: zones.length > 0, bytes: 0, stale: false, used: frame };
    // Open water gains nothing from a finer bake: the coarse one stands.
    if (!wetN || (res.interior && P !== COARSE)) return res;

    // 1. The fields, one pixel per tile.
    //    R = signed depth: half a tile under on the water side, half over on
    //        land, so the scaled-up field crosses zero on the tile boundary.
    //    G = water mask.   B = natural bank (0 where the land is built on).
    // All three helpers live on the CPU (willReadFrequently): the result is
    // read back, and a GPU canvas in the chain would mean a readback each.
    if (!small) {
      small = document.createElement('canvas');
      smallCtx = small.getContext('2d', { willReadFrequently: true });
      mid = document.createElement('canvas');
      midCtx = mid.getContext('2d', { willReadFrequently: true });
      big = document.createElement('canvas');
      bigCtx = big.getContext('2d', { willReadFrequently: true });
    }
    if (small.width !== n) { small.width = small.height = n; mid.width = mid.height = n * MID; }
    const field = smallCtx.createImageData(n, n);
    const hard = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const c = c0 - MARGIN + i, r = r0 - MARGIN + j;
        const d = depthAt(c, r);
        const o = (j * n + i) * 4;
        if (!d && (built(c, r) || zones.some(z => c >= z.minC - 1 && c <= z.maxC + 1 && r >= z.minR - 1 && r <= z.maxR + 1))) hard[j * n + i] = 1;
        field.data[o]     = 128 + (d ? d - 0.5 : -0.5) * DEPTH_SCALE;
        field.data[o + 1] = d ? 255 : 0;
        field.data[o + 2] = hard[j * n + i] ? 0 : 255;
        field.data[o + 3] = 255;
      }
    }
    smallCtx.putImageData(field, 0, 0);

    // 2. Scaled up with smoothing: the staircase becomes continuous fields.
    //    Blurred at a few pixels a tile, where blurring is cheap, then
    //    scaled the rest of the way; a blur run at full size was most of the
    //    cost of a fine bake.
    midCtx.imageSmoothingEnabled = true;
    midCtx.filter = `blur(${(MID * 0.42).toFixed(1)}px)`;
    midCtx.drawImage(small, 0, 0, n * MID, n * MID);
    midCtx.filter = 'none';
    const N = n * P;
    if (big.width !== N) big.width = big.height = N;
    bigCtx.imageSmoothingEnabled = true;
    bigCtx.imageSmoothingQuality = 'low';
    bigCtx.drawImage(mid, 0, 0, N, N);

    // 3. Shade it. PAD extra pixels all round, for smoothing to sample past
    //    the edge. The image is panels side by side, each S square: the
    //    water and bank, then two foam masks (FOAM_A, FOAM_B), then on a
    //    coarse bake the ice mask (ICE), all from the same shoreline.
    const S = CS * P + PAD * 2, K = P === COARSE ? 4 : 3;
    const src = bigCtx.getImageData(MARGIN * P - PAD, MARGIN * P - PAD, S, S).data;
    const canvas = document.createElement('canvas');
    canvas.width = K * S; canvas.height = S;
    const g = canvas.getContext('2d');
    const img = g.createImageData(K * S, S);
    const out32 = new Uint32Array(img.data.buffer);   // one write a pixel: 0xAABBGGRR
    const iceOn = K > ICE, iceRGB = (ICE_RGB[2] << 16) | (ICE_RGB[1] << 8) | ICE_RGB[0];
    const foamRGB = (FOAM_RGB[2] << 16) | (FOAM_RGB[1] << 8) | FOAM_RGB[0];
    const k = TILE / P;
    const wx0 = c0 * TILE, wy0 = r0 * TILE;
    if (!lut) buildLut();

    // Noise is evaluated on a grid every 8 world pixels and interpolated:
    // its finest feature is over twice that, and at full resolution this is
    // a sixty-fourth of the noise a per-pixel evaluation costs. The coarse
    // bake, four times the area and soft anyway, takes every 16.
    const step = Math.max(1, Math.round((P === COARSE ? 16 : 8) / k)), gw = Math.ceil(S / step) + 2;
    const wobG = new Float32Array(gw * gw), motG = new Float32Array(gw * gw);
    for (let j = 0; j < gw; j++) {
      for (let i = 0; i < gw; i++) {
        const wx = wx0 + (i * step - PAD + 0.5) * k, wy = wy0 + (j * step - PAD + 0.5) * k;
        wobG[j * gw + i] = wobble(wx, wy);
        motG[j * gw + i] = mottle(wx, wy);
      }
    }
    // Per column: which local tile (offset by MARGIN into `hard`) and which
    // noise cell each baked pixel falls in.
    const tileOf = new Int32Array(S), gx = new Int32Array(S), fxs = new Float32Array(S);
    for (let x = 0; x < S; x++) {
      tileOf[x] = Math.floor((x - PAD + 0.5) / P) + MARGIN;
      gx[x] = Math.floor(x / step); fxs[x] = x / step - gx[x];
    }
    const wetT = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) wetT[i] = field.data[i * 4 + 1] === 255 ? 1 : 0;
    const wobR = new Float32Array(gw), motR = new Float32Array(gw);
    // Field bytes past which the shoreline (and so the wobble) cannot reach.
    const DEEP = 128 + Math.ceil(1.2 * DEPTH_SCALE);

    for (let y = 0; y < S; y++) {
      const rowT = tileOf[y] * n, gj = Math.floor(y / step), fy = y / step - gj;
      const g0 = gj * gw, g1 = g0 + gw;
      for (let i = 0; i < gw; i++) {
        wobR[i] = wobG[g0 + i] + (wobG[g1 + i] - wobG[g0 + i]) * fy;
        motR[i] = motG[g0 + i] + (motG[g1 + i] - motG[g0 + i]) * fy;
      }
      for (let x = 0; x < S; x++) {
        const o = (y * S + x) * 4, q = y * K * S + x;   // src byte, out pixel
        const ti = rowT + tileOf[x];
        const inTile = wetT[ti] === 1;
        const mb = src[o + 1];
        if (!inTile && (mb < 3 || hard[ti])) continue;     // dry land well back, or built on
        const gi = gx[x], fx = fxs[x];
        const mot = motR[gi] + (motR[gi + 1] - motR[gi]) * fx;
        const sb = src[o];

        // Open water: nothing here but depth.
        if (inTile && sb >= DEEP) {
          let li = ((sb - 128) / DEPTH_SCALE * LUT_RES) | 0;
          if (li >= LUT_N) li = LUT_N - 1;
          li *= 3;
          out32[q] = 0xff000000 | ((lut[li + 2] * mot) << 16) | ((lut[li + 1] * mot) << 8) | (lut[li] * mot);
          if (iceOn) out32[q + ICE * S] = 0xff000000 | iceRGB;
          continue;
        }

        // 1 on a natural bank, falling to 0 against anything built.
        let nat = (src[o + 2] / 255 - 0.55) / 0.35;
        nat = nat < 0 ? 0 : nat > 1 ? 1 : nat;
        const sd = (sb - 128) / DEPTH_SCALE;
        const wobRaw = wobR[gi] + (wobR[gi + 1] - wobR[gi]) * fx, wob = wobRaw * nat;
        const exact = inTile ? 1 : 0;
        const mm = exact + (mb / 255 + wob - exact) * nat;

        // Water coverage: 1 in water, 0 on the bank, antialiased over about a pixel.
        let a = (mm - 0.5) * P * 0.7 + 0.5;
        a = a < 0 ? 0 : a > 1 ? 1 : a;

        // The bank under and beside it, by how far up from the waterline.
        let u = (0.5 - mm) / 0.4;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        let br, bg, bb, ba;
        if (u < 0.3) {
          const f = u / 0.3;
          br = SOIL[0] + (SAND[0] - SOIL[0]) * f; bg = SOIL[1] + (SAND[1] - SOIL[1]) * f; bb = SOIL[2] + (SAND[2] - SOIL[2]) * f;
          ba = 1;
        } else {
          let f = (u - 0.3) / 0.7; f = f * f;
          br = SAND[0] + (SAND2[0] - SAND[0]) * f; bg = SAND[1] + (SAND2[1] - SAND[1]) * f; bb = SAND[2] + (SAND2[2] - SAND[2]) * f;
          ba = u < 0.5 ? 1 : 1 - (u - 0.5) / 0.5;
        }
        if (inTile) ba = 1; else ba *= nat;
        if (a <= 0 && ba <= 0) continue;

        let rr = 0, gg = 0, bl = 0;
        if (a > 0) {
          const d = sd + wob > 0 ? sd + wob : 0;
          let li = (d * LUT_RES) | 0;
          if (li >= LUT_N) li = LUT_N - 1;
          li *= 3;
          rr = lut[li] * mot; gg = lut[li + 1] * mot; bl = lut[li + 2] * mot;
          if (d < 0.1) {
            const e = (1 - d / 0.1) * 0.3 * (0.4 + 0.6 * nat);
            rr += (EDGE[0] - rr) * e; gg += (EDGE[1] - gg) * e; bl += (EDGE[2] - bl) * e;
          }
          // Foam: a band just off the waterline, split between the two
          // masks by the wobble noise so they pulse in patches, not as one.
          const w = mm - 0.5;
          let f = w < 0.03 ? w / 0.03 : 1 - (w - 0.03) / 0.14;
          if (f > 0) {
            f *= a * (0.5 + 0.5 * nat);
            let sp = 0.5 + wobRaw * 3;
            sp = sp < 0 ? 0 : sp > 1 ? 1 : sp;
            out32[q + FOAM_A * S] = ((f * sp * 255) << 24) | foamRGB;
            out32[q + FOAM_B * S] = ((f * (1 - sp) * 255) << 24) | foamRGB;
          }
          if (iceOn) out32[q + ICE * S] = ((a * 255) << 24) | iceRGB;
        }
        // Water over bank.
        const al = a + (1 - a) * ba;
        const wb = (1 - a) * ba / al;
        out32[q] = ((al * 255) << 24) | ((bl * (1 - wb) + bb * wb) << 16) | ((gg * (1 - wb) + bg * wb) << 8) | (rr * (1 - wb) + br * wb);
      }
    }
    g.putImageData(img, 0, 0);
    res.canvas = canvas;
    res.size = S;
    res.bytes = K * S * S * 4;
    return res;
  }

  // Bakes (or re-bakes) one chunk into the cache if `budget` allows.
  // Returns what is cached afterwards, stale or not, or undefined.
  function ensure(P, cx, cy, budget) {
    const key = `${P}:${cx},${cy}`;
    const old = chunks.get(key);
    if (old && !old.stale) { old.used = frame; return old; }
    if (budget.left <= 0 && !urgent.has(key)) { if (old) old.used = frame; return old; }
    urgent.delete(key);
    const t0 = performance.now();
    const ch = bakeChunk(P, cx, cy);
    budget.left -= performance.now() - t0;
    if (old) bytes -= old.bytes;
    chunks.set(key, ch);
    bytes += ch.bytes;
    return ch;
  }

  // Drop chunks that are out of view once the cache is over its allowance.
  // Never one drawn this frame: a view bigger than the allowance must not
  // start baking the same chunks over and over.
  function trim() {
    if (bytes <= KEEP_BYTES) return;
    for (const [key, ch] of chunks) {
      if (ch.used === frame) continue;
      chunks.delete(key); bytes -= ch.bytes;
      if (bytes <= KEEP_BYTES) return;
    }
  }

  function markStale(c0, r0, c1, r1, now) {
    if (!chunks.size) return;
    for (const P of LODS) {
      const CS = sizeOf(P);
      for (let cy = Math.floor(r0 / CS); cy <= Math.floor(r1 / CS); cy++)
        for (let cx = Math.floor(c0 / CS); cx <= Math.floor(c1 / CS); cx++) {
          const key = `${P}:${cx},${cy}`, ch = chunks.get(key);
          if (ch) { ch.stale = true; if (now) urgent.add(key); }
        }
    }
  }

  const tmp = [0, 0, 0];

  // ── Ripples ──────────────────────────────────────────────────────
  // The surface moving: two layers of small light crests drifting at
  // different speeds and headings, so they slide through each other. A
  // tileable texture is laid in plain drawImage calls into a half-size
  // offscreen canvas, cut to the water by the baked coverage masks there
  // (destination-in), and the result goes onto the screen in one drawImage.
  // No patterns and no 'lighter' anywhere near the main canvas: that
  // combination is what the old caustics were cut for (render_main_loop.js).
  const RIP = 256;              // world pixels per texture tile
  let ripTex = null, ripCv = null, ripCtx = null;
  function buildRipples() {
    ripTex = document.createElement('canvas');
    ripTex.width = ripTex.height = RIP;
    const g = ripTex.getContext('2d');
    g.lineCap = 'round';
    let seed = 7;
    const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
    for (let i = 0; i < 42; i++) {
      const x = rnd() * RIP, y = rnd() * RIP, len = 6 + rnd() * 14, bow = 1 + rnd() * 2.5;
      const a = 0.25 + rnd() * 0.55;
      // Drawn at every wrap so the tile has no seam.
      for (const dx of [-RIP, 0, RIP]) for (const dy of [-RIP, 0, RIP]) {
        const cx = x + dx, cy = y + dy;
        if (cx + len < 0 || cx - len > RIP || cy + 6 < 0 || cy - 6 > RIP) continue;
        g.strokeStyle = `rgba(190,226,236,${a.toFixed(2)})`; g.lineWidth = 1.3;
        g.beginPath(); g.moveTo(cx - len, cy + bow); g.quadraticCurveTo(cx, cy - bow, cx + len, cy + bow); g.stroke();
        g.strokeStyle = `rgba(0,10,20,${(a * 0.5).toFixed(2)})`; g.lineWidth = 1.1;     // the trough behind it
        g.beginPath(); g.moveTo(cx - len * 0.8, cy + bow + 2); g.quadraticCurveTo(cx, cy - bow + 2, cx + len * 0.8, cy + bow + 2); g.stroke();
      }
    }
    ripCv = document.createElement('canvas');
    ripCtx = ripCv.getContext('2d');
  }
  // `drawn` as recorded by draw(); m the world->device transform. `shades`
  // maps an alpha to a world-space Path2D to darken by it first (how full
  // each reservoir is), so it is cut to the water by the same masks.
  function drawSurface(ctx, drawn, m, t, alpha, shades) {
    if (!ripTex) buildRipples();
    const H = 0.5, W = Math.ceil(ctx.canvas.width * H), Hh = Math.ceil(ctx.canvas.height * H);
    if (ripCv.width !== W || ripCv.height !== Hh) { ripCv.width = W; ripCv.height = Hh; }
    const g = ripCtx;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, W, Hh);
    g.imageSmoothingEnabled = true;
    if (shades.size) {
      g.setTransform(m.a * H, 0, 0, m.d * H, m.e * H, m.f * H);
      for (const [a, path] of shades) { g.fillStyle = `rgba(4,12,24,${a})`; g.fill(path); }
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    // Only the box the water pieces drawn this frame cover gets tiled:
    // cutToWater clears everything outside them anyway, and a view with a
    // strip of river along one edge was laying ~300 tiles over the whole
    // offscreen, every frame, to keep a few dozen.
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (let i = 0; i < drawn.length; i += 12) {
      const dx = drawn[i + 8] * H, dy = drawn[i + 9] * H;
      if (dx < bx0) bx0 = dx;
      if (dy < by0) by0 = dy;
      if (dx + drawn[i + 10] * H > bx1) bx1 = dx + drawn[i + 10] * H;
      if (dy + drawn[i + 11] * H > by1) by1 = dy + drawn[i + 11] * H;
    }
    bx0 = Math.max(0, bx0); by0 = Math.max(0, by0); bx1 = Math.min(W, bx1); by1 = Math.min(Hh, by1);
    // Two layers: [speed x, speed y, scale, opacity] in world pixels / second.
    for (const [vx, vy, sc, op] of alpha > 0.02 && bx1 > bx0 && by1 > by0 ? [[7, 2.5, 1, 1], [-4.5, 4, 1.6, 0.7]] : []) {
      const ts = RIP * sc * m.a * H;               // tile size on the offscreen
      if (ts < 24) continue;                       // too small to read: skip
      let ox = ((m.e + t * vx * m.a) * H) % ts, oy = ((m.f + t * vy * m.d) * H) % ts;
      if (ox > 0) ox -= ts;
      if (oy > 0) oy -= ts;
      // First tile of the grid that reaches into the box, same grid as before.
      const x0 = ox + Math.max(0, Math.floor((bx0 - ox) / ts)) * ts;
      const y0 = oy + Math.max(0, Math.floor((by0 - oy) / ts)) * ts;
      g.globalAlpha = op * alpha;
      for (let y = y0; y < by1; y += ts) for (let x = x0; x < bx1; x += ts) g.drawImage(ripTex, x, y, ts, ts);
    }
    cutToWater(g, drawn, H);
    ctx.globalAlpha = 1;
    ctx.drawImage(ripCv, 0, 0, W, Hh, 0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  // Keep only what lies on water in `g`, an offscreen at H times device
  // size, using the baked coverage masks of the pieces in `drawn`.
  function cutToWater(g, drawn, H) {
    g.globalAlpha = 1;
    g.fillStyle = '#000';
    // Each piece's square snapped to whole pixels here: at a fractional edge
    // two neighbours each only part-cover the pixels they share, and
    // destination-in fades those pixels, a line along every chunk seam that
    // a bright paint (the aurora on the water) shows up plainly. Both sides
    // of a seam round the same edge, so they still tile exactly.
    const rects = [];
    for (let i = 0; i < drawn.length; i += 12) {
      const x0 = Math.round(drawn[i + 8] * H), y0 = Math.round(drawn[i + 9] * H);
      rects.push(x0, y0, Math.round((drawn[i + 8] + drawn[i + 10]) * H) - x0, Math.round((drawn[i + 9] + drawn[i + 11]) * H) - y0);
    }
    // Off-chunk areas must go too -- including dry chunks between wet ones,
    // which draw nothing: destination-in with the union of the drawn pieces
    // clears everything outside it in one fill.
    const union = new Path2D();
    for (let k = 0; k < rects.length; k += 4) union.rect(rects[k], rects[k + 1], rects[k + 2], rects[k + 3]);
    g.globalCompositeOperation = 'destination-in';
    g.fill(union);
    // destination-in clears everything outside the image drawn, so each
    // piece's mask is drawn clipped to its own square: the pieces tile the
    // area exactly and none wipes its neighbours.
    for (let i = 0, k = 0; i < drawn.length; i += 12, k += 4) {
      const cimg = drawn[i + 4], csw = drawn[i + 7];
      const dx = rects[k], dy = rects[k + 1], dw = rects[k + 2], dh = rects[k + 3];
      if (dw <= 0 || dh <= 0) continue;
      g.save();
      g.beginPath(); g.rect(dx, dy, dw, dh); g.clip();
      g.drawImage(cimg.canvas, drawn[i + 5] + ICE * cimg.size, drawn[i + 6], csw, csw, dx, dy, dw, dh);
      g.restore();
    }
    g.globalCompositeOperation = 'source-over';
  }
  // The pieces the last draw() put on screen, for paintOnWater(), which
  // uses them once: a frame that draws no water leaves none to reuse.
  let lastDrawn = [];
  let glowCv = null, glowCtx = null;

  return {
    enabled: true,

    // Paints every visible chunk, then its shore foam and any ice. World
    // space, after the flat base fill and before anything that stands on the
    // water. `t` is the render time, `day` 0..1 daylight, `ice` 0..1 how far
    // winter has frozen it (FrostSystem.ice).
    draw(ctx, cStart, cEnd, rStart, rEnd, t = 0, day = 1, ice = 0) {
      if (!depth) buildDepth();
      frame++;
      // Paving moved: the hard edges may have. Only chunks paving reaches,
      // or reached, need another look.
      const zv = typeof ZoneSystem !== 'undefined' ? ZoneSystem.getVersion() : 0;
      if (zv !== zoneVer) {
        zoneVer = zv;
        for (const [key, ch] of chunks) {
          if (ch.stale) continue;
          const at = key.indexOf(':'), CS = sizeOf(+key.slice(0, at));
          const [cx, cy] = key.slice(at + 1).split(',').map(Number);
          if (ch.zoned || zoneRectsNear(cx * CS - MARGIN, cy * CS - MARGIN, cx * CS + CS + MARGIN, cy * CS + CS + MARGIN).length) ch.stale = true;
        }
      }
      const want = TILE * Camera.zoom;
      let P = LODS[0];
      for (const p of LODS) if (p >= want * 0.75) P = p;
      // Two allowances a frame: the coarse bakes that get something on
      // screen, and the fine ones that sharpen it.
      const coarseBudget = { left: 8 }, fineBudget = { left: 5 };
      // Drawn in device pixels with every edge rounded, so neighbouring
      // chunks meet on exactly the same pixel line: overlapping them would
      // double the bank's alpha along the seam, and fractional edges leave a
      // hairline. The baked PAD stays outside the source rect, where
      // smoothing samples it.
      const m = ctx.getTransform();
      const X = wx => Math.round(wx * m.a + m.e), Y = wy => Math.round(wy * m.d + m.f);
      // Each piece drawn: the image and source square it came from, the
      // coarse chunk and square under it (for the ice), and where it landed.
      const drawn = [];
      const blit = (img, sx, sy, sw, cimg, csx, csy, csw, wx, wy, ws) => {
        const x0 = X(wx), y0 = Y(wy), x1 = X(wx + ws), y1 = Y(wy + ws);
        if (x1 <= x0 || y1 <= y0) return;
        ctx.drawImage(img.canvas, sx, sy, sw, sw, x0, y0, x1 - x0, y1 - y0);
        drawn.push(img, sx, sy, sw, cimg, csx, csy, csw, x0, y0, x1 - x0, y1 - y0);
      };
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      const CW = CH * COARSE, QW = FCH * COARSE;
      for (let cy = Math.floor(rStart / CH); cy * CH < rEnd; cy++) {
        for (let cx = Math.floor(cStart / CH); cx * CH < cEnd; cx++) {
          const ch = ensure(COARSE, cx, cy, coarseBudget);
          if (!ch || !ch.canvas) continue;
          if (P === COARSE || ch.interior) {
            blit(ch, PAD, PAD, CW, ch, PAD, PAD, CW, cx * CH * TILE, cy * CH * TILE, CH * TILE);
            continue;
          }
          // Its four fine quarters; one not baked yet shows that quarter of
          // the coarse bake meanwhile.
          for (let q = 0; q < 4; q++) {
            const fx = cx * 2 + (q & 1), fy = cy * 2 + (q >> 1);
            if (fx * FCH >= cEnd || (fx + 1) * FCH <= cStart || fy * FCH >= rEnd || (fy + 1) * FCH <= rStart) continue;
            const fine = ensure(P, fx, fy, fineBudget);
            const csx = PAD + (q & 1) * QW, csy = PAD + (q >> 1) * QW;
            if (fine && fine.canvas) blit(fine, PAD, PAD, FCH * P, ch, csx, csy, QW, fx * FCH * TILE, fy * FCH * TILE, FCH * TILE);
            else blit(ch, csx, csy, QW, ch, csx, csy, QW, fx * FCH * TILE, fy * FCH * TILE, FCH * TILE);
          }
        }
      }
      // Foam laps at the shore: the two masks fade in and out against each
      // other, so it comes and goes in patches. None on ice.
      const foam = 0.42 * (0.35 + 0.65 * day) * (1 - ice);
      if (foam > 0.01 && Camera.zoom > 0.22) {
        const ph = Math.sin(t * 1.3);
        for (const [panel, al] of [[FOAM_A, 0.5 + 0.5 * ph], [FOAM_B, 0.5 - 0.5 * ph]]) {
          ctx.globalAlpha = foam * (0.25 + 0.75 * al);
          for (let i = 0; i < drawn.length; i += 12) {
            const img = drawn[i], sw = drawn[i + 3];
            ctx.drawImage(img.canvas, drawn[i + 1] + panel * img.size, drawn[i + 2], sw, sw, drawn[i + 8], drawn[i + 9], drawn[i + 10], drawn[i + 11]);
          }
        }
      }
      // The surface moving. Not on ice, and not when zoomed so far out a
      // crest would be under a pixel.
      const rip = Camera.zoom > 0.3 ? 0.4 * (0.3 + 0.7 * day) * (1 - ice) : 0;
      // A reservoir darkens as it drains. Each tile's square reaches half a
      // tile past it, to take in where the water wobbles onto the bank; the
      // masks trim it back to the water. One path per shade, so overlaps
      // never darken twice.
      const shades = new Map();
      if (typeof ReservoirSystem !== 'undefined') {
        for (let r = rStart; r < rEnd; r++) for (let c = cStart; c < cEnd; c++) {
          const e = GridManager.getEntity(c, r);
          if (!e || e._reservoirId === undefined || e.type !== T.WATER) continue;
          const res = ReservoirSystem.getReservoir(e._reservoirId);
          const fill = res && res.capacity > 0 ? res.waterLevel / res.capacity : 0.5;
          const a = (Math.round((0.08 + 0.42 * (1 - fill)) * 50) / 50).toFixed(2);
          let path = shades.get(a);
          if (!path) shades.set(a, path = new Path2D());
          path.rect((c - 0.5) * TILE, (r - 0.5) * TILE, TILE * 2, TILE * 2);
        }
      }
      if ((rip > 0.02 || shades.size) && drawn.length) drawSurface(ctx, drawn, m, t, rip, shades);
      // Ice over the water only, off the coarse bakes: it is soft-edged
      // anyway and the fine bakes do not carry it.
      if (ice > 0.01) {
        ctx.globalAlpha = 0.78 * ice;
        for (let i = 0; i < drawn.length; i += 12) {
          const cimg = drawn[i + 4], csw = drawn[i + 7];
          ctx.drawImage(cimg.canvas, drawn[i + 5] + ICE * cimg.size, drawn[i + 6], csw, csw, drawn[i + 8], drawn[i + 9], drawn[i + 10], drawn[i + 11]);
        }
      }
      ctx.restore();
      lastDrawn = drawn;
      trim();
    },

    // Paint something over the water only, with the same soft shoreline the
    // water has: `paint(g, m, H)` draws into a half-size offscreen (m the
    // world->device transform; set g's transform from it to work in world
    // px), which is then cut to the water this frame's draw() put down and
    // laid on `ctx` (world transform) as one image. For overlays drawn later
    // in the frame, such as the aurora's reflection. No-op if the water was
    // not drawn this frame.
    paintOnWater(ctx, paint) {
      const drawn = lastDrawn;
      lastDrawn = [];
      if (!drawn.length) return;
      const H = 0.5, W = Math.ceil(ctx.canvas.width * H), Hh = Math.ceil(ctx.canvas.height * H);
      if (!glowCv) { glowCv = document.createElement('canvas'); glowCtx = glowCv.getContext('2d'); }
      if (glowCv.width !== W || glowCv.height !== Hh) { glowCv.width = W; glowCv.height = Hh; }
      const g = glowCtx, m = ctx.getTransform();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.clearRect(0, 0, W, Hh);
      g.save(); paint(g, m, H); g.restore();
      g.setTransform(1, 0, 0, 1, 0, 0);
      cutToWater(g, drawn, H);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(glowCv, 0, 0, W, Hh, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    },

    // Is this water tile painted by a baked chunk right now? Callers that
    // repaint the water under something (a wire, a pipe, a barge) ask this
    // before falling back to a flat fill.
    covers(c, r) {
      if (!wet(c, r)) return false;
      const ch = chunks.get(`${COARSE}:${Math.floor(c / CH)},${Math.floor(r / CH)}`);
      return !!ch && !!ch.canvas;
    },

    // The colour a flat fill should use while the look is on: mid shallows,
    // which is what a river tile mostly is.
    flatRGB() { ramp(1.0, tmp); return tmp; },

    // Water changed somewhere: start again. Depth is a whole-map transform
    // and one changed tile can move it a long way, so nothing here tries to
    // be local about it. `soft` (a dam filling, a tile restored) keeps the
    // old chunks on screen until each is re-baked, rather than flashing the
    // flat fill; a new or loaded world drops them.
    invalidate(soft) {
      depth = null;
      if (soft) { for (const ch of chunks.values()) ch.stale = true; return; }
      chunks.clear();
      bytes = 0;
    },

    // One tile just turned from land to water or back (a building filling
    // it, or removed and handing it back). Its depth shading reaches
    // DEPTH_CAP tiles out, so only chunks that close need baking again, and
    // they are done straight away rather than whenever the budget allows.
    waterChanged(c, r) {
      depth = null;
      const R = DEPTH_CAP + MARGIN;
      markStale(c - R, r - R, c + R, r + R, true);
    },

    // Something was built on, or cleared from, this footprint. If it is
    // beside water its bank just changed between natural and hard.
    touch(c, r, w, h) {
      if (!chunks.size) return;
      const c0 = c - MARGIN, r0 = r - MARGIN, c1 = c + (w || 1) - 1 + MARGIN, r1 = r + (h || 1) - 1 + MARGIN;
      // Only land within reach of the water has a bank to change.
      let near = false;
      for (let y = r0; y <= r1 && !near; y++) for (let x = c0; x <= c1; x++) if (wet(x, y)) { near = true; break; }
      if (near) markStale(c0, r0, c1, r1);
    },

    stats: () => ({ chunks: chunks.size, mb: +(bytes / 1048576).toFixed(1) }),
  };
})();
