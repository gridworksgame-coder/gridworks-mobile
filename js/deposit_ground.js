/* ═══════════════════════════════════════════════════════════════════
   DEPOSIT GROUND
   Every discovered resource deposit sits in a patch of the ground that
   goes with it, the way the real thing shows at the surface, instead of
   straight in the grass. Geothermal has its own barren ground (GeoField in
   render_core.js); this does the same for every other deposit:
     coal        – a shelf of grey stone: slate plates, coal dust, black chips
     oil         – tar sand: dark oily soil, seep stains and black tar pools
     uranium     – weathered granite, tors, yellow-green mineral stain
     sulfur      – a yellow sulphur crust over grey ash, with small vents
     lithium     – a white salt flat crazed into polygons, with brine pools
     helium      – a pale cracked clay pan with bubbling gas seeps
     rare earth  – red laterite soil, rain-cut gullies, ironstone pebbles

   A deposit only exists once a survey has found it, so the patch appears
   on discovery. It stays while a mine works the deposit (the deposit stays
   registered under it) and goes when a worked-out deposit is cleared.

   Like GeoField: the size and every detail are fixed per deposit from its
   own coordinates, it is baked into the cached ground bitmap with the grass
   (so it costs nothing per frame), and version() is part of that cache's
   key (render_main_loop.js) so a survey repaints the ground at once.
   ═══════════════════════════════════════════════════════════════════ */
const DepositGround = (() => {
  const NV = 18;                 // outline vertices — enough to read ragged
  const MIN_R = 6, SPAN_R = 6;   // radius in tiles: 6–12, plus a little for a big deposit
  const MAX_R = MIN_R + SPAN_R + 4;

  const _hash = (c, r, n) => {
    const x = Math.sin(c * 127.1 + r * 311.7 + n * 74.3) * 43758.5453;
    return x - Math.floor(x);
  };
  const _rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  // ── Patch geometry ─────────────────────────────────────────────────
  const _cache = new Map();
  function fieldFor(e) {
    const key = e.type + ':' + e.col + ',' + e.row;
    let f = _cache.get(key);
    if (!f) {
      const w = e.width || 2, h = e.height || 2;
      const cx = (e.col + w / 2) * TILE, cy = (e.row + h / 2) * TILE;
      const R = (MIN_R + _hash(e.col, e.row, 1) * SPAN_R + 0.6 * Math.max(w, h)) * TILE;
      const jit = [];
      for (let i = 0; i < NV; i++) jit.push(0.74 + _hash(e.col, e.row, 10 + i) * 0.42);
      f = { cx, cy, R, jit };
      _cache.set(key, f);
    }
    return f;
  }

  // Ragged outline, curved through the vertex midpoints (as GeoField).
  function pathFor(f, scale) {
    const p = new Path2D();
    const pts = [];
    for (let i = 0; i < NV; i++) {
      const a = (i / NV) * Math.PI * 2, rr = f.R * f.jit[i] * scale;
      pts.push([f.cx + Math.cos(a) * rr, f.cy + Math.sin(a) * rr]);
    }
    const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2];
    const m0 = mid(pts[NV - 1], pts[0]);
    p.moveTo(m0[0], m0[1]);
    for (let i = 0; i < NV; i++) {
      const m = mid(pts[i], pts[(i + 1) % NV]);
      p.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    p.closePath();
    return p;
  }

  // ── Shared drawing helpers (k = { tc, f, H, Rt, polar }) ──────────
  // A smooth, lumpy closed blob around (x, y), left as the current path.
  function _blob(k, x, y, r, seed, nv, rough, squash, rot) {
    const { tc, H } = k, pts = [];
    for (let i = 0; i < nv; i++) {
      const a = (i / nv) * Math.PI * 2;
      const rr = r * (1 - rough / 2 + H(seed + i) * rough);
      const ex = Math.cos(a) * rr, ey = Math.sin(a) * rr * squash;
      pts.push([x + ex * Math.cos(rot) - ey * Math.sin(rot), y + ex * Math.sin(rot) + ey * Math.cos(rot)]);
    }
    tc.beginPath();
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const m0 = mid(pts[nv - 1], pts[0]);
    tc.moveTo(m0[0], m0[1]);
    for (let i = 0; i < nv; i++) {
      const m = mid(pts[i], pts[(i + 1) % nv]);
      tc.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
    }
    tc.closePath();
  }

  // Scattered blobs of one or more fills over the patch.
  function _blobs(k, n, seed, rMin, rSpan, fills, reach = 0.8, stroke = null) {
    const { tc, f, H } = k;
    for (let i = 0; i < n; i++) {
      const [bx, by] = k.polar(H(seed + i) * Math.PI * 2, Math.sqrt(H(seed + 100 + i)) * f.R * reach);
      _blob(k, bx, by, TILE * (rMin + H(seed + 200 + i) * rSpan), seed * 3 + i * 16, 11, 0.7,
            0.55 + H(seed + 300 + i) * 0.45, H(seed + 400 + i) * 6.3);
      tc.fillStyle = fills[Math.floor(H(seed + 500 + i) * fills.length)];
      tc.fill();
      if (stroke) { tc.strokeStyle = stroke; tc.lineWidth = 1.2; tc.stroke(); }
    }
  }

  // Meandering channels out from the centre, drawn in tapering layers
  // (the same build as geothermal's runoff channels).
  function _channels(k, n, layers, lenMin, lenSpan) {
    const { tc, f, H } = k, steps = 22;
    tc.lineCap = 'round'; tc.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      let a = (i / n) * Math.PI * 2 + H(2710 + i) * 1.2;
      let rr = f.R * 0.06;
      const len = f.R * (lenMin + H(2720 + i) * lenSpan);
      const pts = [k.polar(a, rr)];
      for (let s = 0; s < steps; s++) {
        a += (H(2800 + i * 30 + s) - 0.5) * 0.14;
        rr += len / steps;
        const wob = (H(3500 + i * 30 + s) - 0.5) * TILE * 0.2;
        const [x, y] = k.polar(a, rr);
        pts.push([x + Math.cos(a + 1.57) * wob, y + Math.sin(a + 1.57) * wob]);
      }
      for (const [wd, col] of layers) {
        for (let s = 0; s < 3; s++) {
          const a0 = Math.floor(s * steps / 3), a1 = Math.floor((s + 1) * steps / 3);
          tc.strokeStyle = col; tc.lineWidth = TILE * wd * (1 - s * 0.28);
          tc.beginPath(); tc.moveTo(pts[a0][0], pts[a0][1]);
          for (let q = a0 + 1; q <= a1; q++) tc.lineTo(pts[q][0], pts[q][1]);
          tc.stroke();
        }
      }
    }
  }

  // Clusters of short, branching crack walks (crazed, dried ground).
  function _cracks(k, clusters, col, spread = 3.2, reach = 0.7) {
    const { tc, f, H } = k;
    tc.lineCap = 'round'; tc.strokeStyle = col; tc.lineWidth = 0.9;
    for (let ci = 0; ci < clusters; ci++) {
      const [ox, oy] = k.polar(H(4000 + ci) * Math.PI * 2, f.R * (0.1 + H(4100 + ci) * reach));
      for (let w = 0; w < 9; w++) {
        let x = ox + (H(4200 + ci * 20 + w) - 0.5) * TILE * spread;
        let y = oy + (H(4300 + ci * 20 + w) - 0.5) * TILE * spread;
        let a = H(4400 + ci * 20 + w) * Math.PI * 2;
        tc.beginPath(); tc.moveTo(x, y);
        for (let s = 0; s < 6; s++) {
          a += (H(4500 + ci * 120 + w * 6 + s) - 0.5) * 1.6;
          x += Math.cos(a) * TILE * 0.28; y += Math.sin(a) * TILE * 0.28;
          tc.lineTo(x, y);
        }
        tc.stroke();
      }
    }
  }

  // Fine speckle so the ground has texture up close.
  function _grain(k, density, cols) {
    const { tc, f, H, Rt } = k;
    const n = Math.min(1800, Math.round(Rt * Rt * density));
    for (let i = 0; i < n; i++) {
      const [sx, sy] = k.polar(H(10000 + i) * Math.PI * 2, Math.sqrt(H(20000 + i)) * f.R * 0.95);
      const t = H(30000 + i);
      tc.fillStyle = t > 0.7 ? cols[0] : t > 0.35 ? cols[1] : cols[2];
      const s = 0.8 + H(40000 + i) * 1.6;
      tc.fillRect(sx, sy, s, s);
    }
  }

  // Where rock i of a patch sits and its size (polygon radius, world px).
  // Kept clear of the middle, where the deposit itself is drawn.
  function _rockGeom(f, H, i, bigChance, sizeMul, spread) {
    const a = H(100 + i) * Math.PI * 2, rr = (0.18 + Math.pow(H(300 + i), spread) * 0.75) * f.R;
    const big = H(600 + i) > 1 - bigChance;
    const sz = TILE * sizeMul * (big ? 0.28 + H(500 + i) * 0.22 : 0.06 + H(500 + i) * 0.14);
    return { x: f.cx + Math.cos(a) * rr, y: f.cy + Math.sin(a) * rr, sz };
  }
  // Rocks a quarter tile across or more are the mossy Blender rocks
  // (land_cover.js) tinted to the deposit's own stone, and are what the
  // wildlife walks round (rocksNear); smaller grit stays a drawn polygon.
  const SPRITE_SZ = TILE * 0.125;
  const _tinted = new Map();
  function _tintedRock(u, tone) {
    const im = typeof LandCover !== 'undefined' && LandCover.rockSprite ? LandCover.rockSprite(u) : null;
    if (!im) return null;
    const key = im.src + '|' + tone.join(',');
    let cv = _tinted.get(key);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = cv.height = 96;
      const g = cv.getContext('2d');
      g.drawImage(im, 0, 0, 96, 96);
      // Multiply by the tone (darker stone darkens the rock; the hue comes
      // through), then put the sprite's own alpha back.
      const s = 255 / 140;
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = `rgb(${Math.min(255, tone[0] * s)},${Math.min(255, tone[1] * s)},${Math.min(255, tone[2] * s)})`;
      g.fillRect(0, 0, 96, 96);
      g.globalCompositeOperation = 'destination-in';
      g.drawImage(im, 0, 0, 96, 96);
      _tinted.set(key, cv);
    }
    return cv;
  }
  // A deposit's own rendered rocks (photo_ground.js), untinted.
  const OIL_FRAME = 1.25;   // the pool spans 1/OIL_FRAME of an oil_seep/oil_pool sprite (render_oil_pools.py)
  const _spriteRock = (prefix, u) => typeof PhotoGround !== 'undefined' ? PhotoGround.sprite(prefix, u) : null;
  // Rock — irregular, lit from the upper left, with a contact shadow.
  function _rocks(k, n, tones, bigChance = 0.1, sizeMul = 1, spread = 0.45) {
    const { tc, f, H } = k;
    for (let i = 0; i < n; i++) {
      const { x: sx, y: sy, sz } = _rockGeom(f, H, i, bigChance, sizeMul, spread);
      if (sz >= SPRITE_SZ) {
        const sp = k.rockSprites ? _spriteRock(k.rockSprites, H(900 + i))
                 : _tintedRock(H(900 + i), tones[Math.floor(H(700 + i) * tones.length)]);
        if (sp) {
          const disp = sz * 2 * LandCover.ROCK_FRAME;
          if (k.rockFilter) tc.filter = k.rockFilter;   // bake-time only
          tc.drawImage(sp, sx - disp / 2, sy - disp / 2, disp, disp);
          if (k.rockFilter) tc.filter = 'none';
          continue;
        }
      }
      const pts = [];
      for (let q = 0; q < 6; q++) {
        const ang = (q / 6) * Math.PI * 2 + H(800 + i) * 1.0;
        const d = sz * (0.7 + H(1000 + i * 7 + q) * 0.5);
        pts.push([sx + Math.cos(ang) * d, sy + Math.sin(ang) * d * 0.8]);
      }
      const poly = (dx, dy) => { tc.beginPath(); pts.forEach(([x, y], q) => q ? tc.lineTo(x + dx, y + dy) : tc.moveTo(x + dx, y + dy)); tc.closePath(); };
      poly(sz * 0.25, sz * 0.3); tc.fillStyle = 'rgba(16,12,10,0.35)'; tc.fill();
      const base = tones[Math.floor(H(700 + i) * tones.length)];
      poly(0, 0); tc.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; tc.fill();
      tc.beginPath(); tc.moveTo(pts[3][0], pts[3][1]); tc.lineTo(pts[4][0], pts[4][1]); tc.lineTo(pts[5][0], pts[5][1]); tc.lineTo(sx, sy); tc.closePath();
      tc.fillStyle = `rgba(${base[0] + 60},${base[1] + 56},${base[2] + 50},0.45)`; tc.fill();
      tc.beginPath(); tc.moveTo(pts[0][0], pts[0][1]); tc.lineTo(pts[1][0], pts[1][1]); tc.lineTo(sx, sy); tc.closePath();
      tc.fillStyle = 'rgba(0,0,0,0.18)'; tc.fill();
    }
  }

  // Small dark holes with a coloured halo and a ring of crystal specks.
  function _vents(k, n, halo, speck) {
    const { tc, f, H } = k;
    for (let i = 0; i < n; i++) {
      const [vx, vy] = k.polar(H(4910 + i) * Math.PI * 2, f.R * (0.12 + H(4920 + i) * 0.45));
      const vr = TILE * (0.14 + H(4930 + i) * 0.12);
      const g = tc.createRadialGradient(vx, vy, 0, vx, vy, vr * 3.2);
      g.addColorStop(0, halo[0]); g.addColorStop(0.45, halo[1]); g.addColorStop(1, halo[2]);
      tc.fillStyle = g; tc.beginPath(); tc.arc(vx, vy, vr * 3.2, 0, Math.PI * 2); tc.fill();
      tc.fillStyle = speck;
      for (let s = 0; s < 10; s++) {
        const aa = H(4940 + i * 12 + s) * Math.PI * 2, dd = vr * (1.1 + H(5100 + i * 12 + s) * 1.6);
        tc.fillRect(vx + Math.cos(aa) * dd, vy + Math.sin(aa) * dd, 1.6, 1.6);
      }
      tc.fillStyle = '#1a1612'; tc.beginPath(); tc.ellipse(vx, vy, vr, vr * 0.7, H(4950 + i) * 3, 0, Math.PI * 2); tc.fill();
    }
  }

  // ── The ground for each deposit type ───────────────────────────────
  // fringe: the band where the grass gives way; soil: centre, middle and
  // edge colours of the base; tones: broad blotches; grain: speckle colours;
  // tuft: the dying grass round the rim. features() draws at every zoom,
  // detail() only once the ground detail fades in (lod > 0).
  const STYLES = {
    [T.COALDEPOSIT]: {
      fringe: [116, 116, 98],
      soil: [[50, 50, 50], [78, 78, 76], [92, 92, 88]],
      tones: ['rgba(46,48,52,0.18)', 'rgba(96,102,110,0.14)', 'rgba(98,86,72,0.12)', 'rgba(150,148,140,0.10)'],
      grain: ['rgba(170,170,166,0.30)', 'rgba(24,24,26,0.34)', 'rgba(100,100,98,0.28)'],
      tuft: ['rgba(150,148,116,0.7)', 'rgba(118,116,92,0.7)'],
      rocks: Rt => [Math.round(34 + Rt * 3.6), [[132, 132, 128], [104, 104, 102], [78, 78, 78]], 0.14],   // count, tones, big chance, size, spread
      // Photo ground (photo_ground.js): grey gravelly ground at the rim
      // (Poly Haven rock_ground), dark coal-dusted shale scree toward the
      // seam (gray_rocks), both lit by scripts/bake_ground_tex.py; black
      // rendered rocks (rock_09, the same img/rock_tar_* as oil).
      photo: { rim: 'ground_coal_rim', inner: 'ground_coal_scree', span: TILE * 5, innerFrom: 0.12, innerTo: 0.7,
               shade: 0.2, edge: 0.14, tone: 'rgba(14,14,16,0.08)' },
      rockSprites: 'rock_tar',
      rockFilter: 'saturate(0.2) brightness(0.85)',   // the black rock, greyed to the shale
      features(k) {
        const { tc, f, H, Rt } = k;
        // Slate shelves: broad flat plates of grey stone, lit along the rim
        // (the photo scree has its own)
        const n = k.photo ? 0 : 6 + Math.round(Rt * 0.6);
        for (let i = 0; i < n; i++) {
          const [bx, by] = k.polar(H(2100 + i) * Math.PI * 2, f.R * (0.1 + H(2200 + i) * 0.6));
          _blob(k, bx, by, TILE * (1.2 + H(2300 + i) * 2.2), 6000 + i * 16, 7, 0.55, 0.5 + H(2400 + i) * 0.4, H(2500 + i) * 6.3);
          tc.fillStyle = 'rgba(122,124,124,0.20)'; tc.fill();
          tc.strokeStyle = 'rgba(176,178,176,0.16)'; tc.lineWidth = 1.2; tc.stroke();
        }
        // Coal dust: black smudges, heaviest round the seam itself
        const nd = 5 + Math.round(Rt * 0.4);
        for (let i = 0; i < nd; i++) {
          const [bx, by] = k.polar(H(2600 + i) * Math.PI * 2, f.R * Math.pow(H(2650 + i), 1.6) * 0.6);
          _blob(k, bx, by, TILE * (0.6 + H(2680 + i) * 1.6), 6500 + i * 16, 10, 0.7, 0.6 + H(2690 + i) * 0.4, H(2695 + i) * 6.3);
          if (k.photo) { tc.save(); tc.filter = `blur(${(TILE * 0.12).toFixed(1)}px)`; tc.fillStyle = 'rgba(10,10,12,0.16)'; tc.fill(); tc.restore(); }   // soft over the photo (bake-time only)
          else { tc.fillStyle = 'rgba(14,14,16,0.30)'; tc.fill(); }
        }
      },
      detail(k) {
        const { tc, f, H, Rt } = k;
        // Coal chips — small black angular shards with a glint
        const n = k.photo ? 0 : Math.round(20 + Rt * 3);   // the scree has its own chips
        for (let i = 0; i < n; i++) {
          const [sx, sy] = k.polar(H(8000 + i) * Math.PI * 2, Math.pow(H(8100 + i), 0.8) * f.R * 0.7);
          const sz = TILE * (0.05 + H(8200 + i) * 0.08);
          tc.beginPath();
          for (let q = 0; q < 5; q++) {
            const a = (q / 5) * Math.PI * 2 + H(8300 + i) * 2, d = sz * (0.6 + H(8400 + i * 5 + q) * 0.6);
            q ? tc.lineTo(sx + Math.cos(a) * d, sy + Math.sin(a) * d) : tc.moveTo(sx + Math.cos(a) * d, sy + Math.sin(a) * d);
          }
          tc.closePath(); tc.fillStyle = 'rgb(22,22,24)'; tc.fill();
          tc.fillStyle = 'rgba(200,210,220,0.45)'; tc.fillRect(sx - sz * 0.3, sy - sz * 0.3, 1.2, 1.2);
        }
        _rocks(k, ...this.rocks(k.Rt));
      },
    },

    [T.OILDEPOSIT]: {
      fringe: [128, 112, 70],
      soil: [[30, 26, 22], [60, 50, 38], [96, 82, 60]],
      tones: ['rgba(132,112,80,0.14)', 'rgba(26,22,20,0.18)', 'rgba(82,62,40,0.14)', 'rgba(110,96,70,0.12)'],
      grain: ['rgba(160,140,100,0.30)', 'rgba(16,12,10,0.34)', 'rgba(96,78,54,0.28)'],
      tuft: ['rgba(160,140,86,0.7)', 'rgba(120,104,64,0.7)'],
      rocks: Rt => [Math.round(14 + Rt * 1.5), [[128, 108, 80], [100, 84, 62], [70, 58, 44]], 0.08],   // count, tones, big chance, size, spread
      // Photo ground (photo_ground.js): stony mud at the rim, dark wet mud
      // toward the seep, soaked darker still in the middle; oil-stained
      // rocks (rock_09, scripts/render_rocks.py) instead of tinted moss rocks.
      photo: { rim: 'ground_oil_rim', inner: 'ground_oil_mud', span: TILE * 5, innerFrom: 0.15, innerTo: 0.8,
               shade: 0.5, edge: 0.14, tone: 'rgba(22,16,10,0.2)' },
      rockSprites: 'rock_tar',
      features(k) {
        const { tc, f, H } = k;
        // Seep stains — dark oily tongues spreading out from the seep
        _channels(k, 3 + Math.floor(H(2700) * 3),
          [[1.2, 'rgba(18,12,8,0.10)'], [0.5, 'rgba(14,10,6,0.16)'], [0.18, 'rgba(8,6,4,0.24)']], 0.4, 0.4);
        // Crude seeping up round the deposit (clear of the deposit sprite):
        // small pools rendered in Blender (img/oil_seep_*, render_oil_pools.py),
        // each on a soft soaked stain; only the stains while they load.
        const n = 3 + Math.floor(H(2900) * 4);
        for (let i = 0; i < n; i++) {
          const [px, py] = k.polar(H(2910 + i) * Math.PI * 2, f.R * (0.2 + H(2920 + i) * 0.38));
          const pr = TILE * (0.3 + H(2930 + i) * 0.4);   // small, scattered seeps
          const sg = tc.createRadialGradient(px, py, pr * 0.5, px, py, pr * 1.7);
          sg.addColorStop(0, 'rgba(10,7,4,0.45)'); sg.addColorStop(1, 'rgba(10,7,4,0)');
          tc.fillStyle = sg; tc.fillRect(px - pr * 2, py - pr * 2, pr * 4, pr * 4);
          const sp = _spriteRock('oil_seep', H(2940 + i));
          if (sp) {
            const disp = pr * 2 * OIL_FRAME;
            tc.drawImage(sp, px - disp / 2, py - disp / 2, disp, disp);   // unturned: the light is baked in
          }
        }
      },
      detail(k) {
        _rocks(k, ...this.rocks(k.Rt));
      },
    },

    [T.URANIUMDEPOSIT]: {
      fringe: [134, 126, 84],
      soil: [[92, 86, 80], [108, 100, 92], [114, 108, 94]],
      tones: ['rgba(138,112,104,0.16)', 'rgba(104,104,100,0.14)', 'rgba(70,64,60,0.14)', 'rgba(170,160,140,0.10)'],
      grain: ['rgba(200,190,176,0.30)', 'rgba(52,46,44,0.30)', 'rgba(130,116,108,0.28)'],
      tuft: ['rgba(164,154,100,0.7)', 'rgba(128,120,78,0.7)'],
      rocks: Rt => [Math.round(24 + Rt * 2.4), [[150, 130, 122], [118, 106, 100], [86, 78, 76]], 0.12],   // count, tones, big chance, size, spread
      // Photo ground (photo_ground.js): granite grit and gravel at the rim
      // (Poly Haven rocky_trail), grey ground with the granite breaking
      // through toward the ore (rocks_ground_05), both lit by
      // scripts/bake_ground_tex.py; granite boulders and tors rendered from
      // namaqualand_boulder_03/_05 (img/rock_granite_*).
      photo: { rim: 'ground_uranium_rim', inner: 'ground_uranium_granite', span: TILE * 8, innerFrom: 0.12, innerTo: 0.7,
               shade: 0.18, edge: 0.14 },
      rockSprites: 'rock_granite',
      rockFilter: 'saturate(0.6) brightness(0.95)',
      features(k) {
        const { tc, f, H, Rt } = k;
        // Mineral stain — yellow-green blotches where the ore weathers out
        if (k.photo) {   // soft and faint over the photo (bake-time blur)
          tc.save(); tc.filter = `blur(${(TILE * 0.25).toFixed(1)}px)`;
          _blobs(k, 5 + Math.round(Rt * 0.4), 2100, 0.5, 1.0, ['rgba(176,170,60,0.12)', 'rgba(140,150,70,0.10)'], 0.55);
          tc.restore();
        } else _blobs(k, 6 + Math.round(Rt * 0.6), 2100, 0.6, 1.2, ['rgba(176,170,60,0.20)', 'rgba(140,168,70,0.18)'], 0.6);
        // Granite tors — big rounded boulders, pinkish grey, shaded lower right
        const n = 4 + Math.round(Rt * 0.4);
        for (let i = 0; i < n; i++) {
          const [bx, by] = k.polar(H(2600 + i) * Math.PI * 2, f.R * (0.15 + H(2650 + i) * 0.6));
          const br = TILE * (0.6 + H(2700 + i) * 0.9), rot = H(2750 + i) * 6.3;
          const tor = k.photo ? _spriteRock('rock_granite', H(2760 + i)) : null;
          if (tor) {   // a rendered granite boulder (smaller than the painted tor: real ones dwarfed the ore)
            const disp = br * 1.1 * PhotoGround.SPRITE_FRAME;
            if (k.rockFilter) tc.filter = k.rockFilter;
            tc.drawImage(tor, bx - disp / 2, by - disp / 2, disp, disp);
            tc.filter = 'none';
            continue;
          }
          _blob(k, bx + br * 0.25, by + br * 0.3, br, 6600 + i * 16, 10, 0.4, 0.8, rot);
          tc.fillStyle = 'rgba(20,16,14,0.35)'; tc.fill();
          _blob(k, bx, by, br, 6600 + i * 16, 10, 0.4, 0.8, rot);
          const g = tc.createRadialGradient(bx - br * 0.35, by - br * 0.35, br * 0.1, bx, by, br * 1.1);
          g.addColorStop(0, 'rgb(164,146,136)'); g.addColorStop(1, 'rgb(98,86,82)');
          tc.fillStyle = g; tc.fill();
        }
      },
      detail(k) {
        const { tc, f, H, Rt } = k;
        // Quartz specks and the odd bright mineral glint
        const n = k.photo ? Math.round(8 + Rt) : Math.round(40 + Rt * 6);   // the photo has its own grit
        for (let i = 0; i < n; i++) {
          const [sx, sy] = k.polar(H(8000 + i) * Math.PI * 2, Math.sqrt(H(8100 + i)) * f.R * 0.9);
          tc.fillStyle = H(8200 + i) > 0.8 ? 'rgba(206,224,96,0.55)' : 'rgba(232,228,216,0.5)';
          tc.fillRect(sx, sy, 1.4, 1.4);
        }
        _rocks(k, ...this.rocks(k.Rt));
      },
    },

    [T.SULFURDEPOSIT]: {
      fringe: [150, 138, 70],
      soil: [[124, 110, 48], [106, 100, 66], [98, 96, 80]],
      tones: ['rgba(110,106,96,0.16)', 'rgba(186,166,60,0.14)', 'rgba(170,120,50,0.10)', 'rgba(70,66,60,0.14)'],
      grain: ['rgba(230,212,96,0.34)', 'rgba(56,52,46,0.30)', 'rgba(150,140,100,0.28)'],
      tuft: ['rgba(176,160,90,0.7)', 'rgba(140,128,70,0.7)'],
      rocks: Rt => [Math.round(18 + Rt * 2), [[110, 106, 96], [86, 82, 76], [62, 60, 56]], 0.1],   // count, tones, big chance, size, spread
      // Photo ground (photo_ground.js): grey, cracked altered ground at the
      // rim (Poly Haven dry_ground_01), bleached crust toward the vents
      // (coral_mud_01), both lit by scripts/bake_ground_tex.py; bleached
      // rendered rocks (stone_01, img/rock_geo_*).
      photo: { rim: 'ground_sulfur_rim', inner: 'ground_sulfur_crust', span: TILE * 6, innerFrom: 0.12, innerTo: 0.7,
               shade: 0.08, edge: 0.14 },
      rockSprites: 'rock_geo',
      rockFilter: 'saturate(0.3) brightness(1.08)',
      features(k) {
        const { Rt } = k;
        if (k.photo) {
          // Faint sulphur staining spread over the crust (blurred, bake-time)
          k.tc.save(); k.tc.filter = `blur(${(TILE * 0.3).toFixed(1)}px)`;
          _blobs(k, 5 + Math.round(Rt * 0.5), 2600, 0.8, 1.4, ['rgba(206,182,58,0.13)', 'rgba(170,120,50,0.08)'], 0.6);
          k.tc.restore();
          return;
        }
        // White evaporite crust under the sulphur
        _blobs(k, 4 + Math.round(Rt * 0.4), 2100, 0.8, 1.6, ['rgba(210,206,186,0.15)'], 0.75);
        // Sulphur crust: bright yellow plates, crisp at the edge
        _blobs(k, 7 + Math.round(Rt * 0.7), 2600, 0.8, 1.6, ['rgba(206,182,58,0.24)', 'rgba(222,196,70,0.20)'], 0.6,
               'rgba(236,216,110,0.22)');
      },
      detail(k) {
        const { H, Rt } = k;
        if (!k.photo) _vents(k, 2 + Math.floor(H(4900) * 3),
          ['rgba(226,200,60,0.6)', 'rgba(206,176,60,0.3)', 'rgba(190,160,60,0)'], 'rgba(244,222,90,0.6)');
        _rocks(k, ...this.rocks(k.Rt));
      },
    },

    [T.LITHIUMDEPOSIT]: {
      fringe: [140, 138, 110],
      soil: [[136, 138, 134], [130, 132, 128], [124, 126, 116]],
      tones: ['rgba(214,212,204,0.14)', 'rgba(120,122,120,0.10)', 'rgba(170,160,140,0.10)'],
      grain: ['rgba(236,236,230,0.34)', 'rgba(110,110,108,0.24)', 'rgba(190,188,180,0.28)'],
      tuft: ['rgba(170,166,128,0.7)', 'rgba(136,132,100,0.7)'],
      rocks: Rt => [Math.round(6 + Rt * 0.6), [[150, 150, 144], [122, 122, 118]], 0.05],   // count, tones, big chance, size, spread
      // Photo ground (photo_ground.js): dry cracked flat at the rim (Poly
      // Haven mud_cracked_dry_riverbed_002), the same bleached to salt
      // toward the pans, both lit by scripts/bake_ground_tex.py; pale
      // rendered rocks (stone_01, img/rock_geo_*).
      photo: { rim: 'ground_lithium_rim', inner: 'ground_lithium_salt', span: TILE * 3, innerFrom: 0.15, innerTo: 0.8,
               shade: 0.04, edge: 0.14 },
      rockSprites: 'rock_geo',
      rockFilter: 'saturate(0.25) brightness(1.1)',
      features(k) {
        const { tc, f, H } = k;
        // Brine pools — a few shallow puddles in the low middle (painted ground only)
        const n = k.photo ? 0 : 2 + Math.floor(H(2900) * 3);
        for (let i = 0; i < n; i++) {
          const [px, py] = k.polar(H(2910 + i) * Math.PI * 2, f.R * H(2920 + i) * 0.45);
          _blob(k, px, py, TILE * (0.8 + H(2930 + i) * 1.0), 7000 + i * 16, 12, 0.6, 0.55 + H(2940 + i) * 0.4, H(2950 + i) * 6.3);
          tc.fillStyle = 'rgba(92,128,140,0.55)'; tc.fill();
          tc.strokeStyle = 'rgba(226,232,232,0.4)'; tc.lineWidth = 1.6; tc.stroke();
        }
      },
      detail(k) {
        const { tc, f } = k;
        // Salt polygons: a network of raised ridges. Corners sit on a
        // world-fixed hex lattice and are jittered hard by their own
        // position, so neighbouring cells share them and the crust reads as
        // grown, not stamped; a few edges are left out so cells merge into
        // bigger, odd-shaped plates.
        const a = TILE * 0.95, hy = Math.sqrt(3) * a / 2;
        const corner = (x, y) => {
          const kx = Math.round(x / (a / 2)), ky = Math.round(y / hy);
          return [x + (_hash(kx, ky, 77) - 0.5) * a * 0.8, y + (_hash(kx, ky, 78) - 0.5) * a * 0.8];
        };
        const ridge = new Path2D();
        const i0 = Math.floor((f.cx - f.R) / (1.5 * a)) - 1, i1 = Math.ceil((f.cx + f.R) / (1.5 * a)) + 1;
        const j0 = Math.floor((f.cy - f.R) / (2 * hy)) - 1, j1 = Math.ceil((f.cy + f.R) / (2 * hy)) + 1;
        for (let i = i0; i <= i1; i++) {
          for (let j = j0; j <= j1; j++) {
            const cx = i * 1.5 * a, cy = j * 2 * hy + (i & 1) * hy;
            if (Math.hypot(cx - f.cx, cy - f.cy) > f.R * 1.05) continue;
            // Three edges per cell; its neighbours draw the other three
            for (let q = 0; q < 3; q++) {
              const p0 = corner(cx + a * Math.cos(q * Math.PI / 3), cy + a * Math.sin(q * Math.PI / 3));
              const p1 = corner(cx + a * Math.cos((q + 1) * Math.PI / 3), cy + a * Math.sin((q + 1) * Math.PI / 3));
              if (_hash(i * 3 + q, j, 79) < 0.22) continue;
              ridge.moveTo(p0[0], p0[1]); ridge.lineTo(p1[0], p1[1]);
            }
          }
        }
        tc.lineCap = 'round'; tc.lineJoin = 'round';
        if (k.photo) tc.globalAlpha = 0.5;   // fainter over the photo crust
        tc.strokeStyle = 'rgba(226,226,218,0.24)'; tc.lineWidth = TILE * 0.08; tc.stroke(ridge);
        tc.strokeStyle = 'rgba(70,72,70,0.24)'; tc.lineWidth = 1; tc.stroke(ridge);
        tc.globalAlpha = 1;
        _rocks(k, ...this.rocks(k.Rt));
      },
    },

    [T.HELIUMDEPOSIT]: {
      fringe: [138, 126, 90],
      soil: [[116, 102, 92], [126, 114, 100], [122, 112, 94]],
      tones: ['rgba(150,120,110,0.14)', 'rgba(110,108,104,0.14)', 'rgba(160,150,128,0.12)', 'rgba(84,72,66,0.12)'],
      grain: ['rgba(196,184,166,0.30)', 'rgba(60,50,46,0.28)', 'rgba(140,126,112,0.28)'],
      tuft: ['rgba(168,156,108,0.7)', 'rgba(132,122,84,0.7)'],
      rocks: Rt => [Math.round(14 + Rt * 1.5), [[150, 136, 124], [120, 108, 100], [88, 80, 76]], 0.06, 0.8],   // count, tones, big chance, size, spread
      // Photo ground (photo_ground.js): grey sour ground at the rim (Poly
      // Haven ground_grey), cracked clay pan toward the seeps, matching the
      // render's (mud_cracked_dry_03), both lit by scripts/bake_ground_tex.py; pale rendered
      // rocks (stone_01, img/rock_geo_*).
      photo: { rim: 'ground_helium_pan', inner: 'ground_helium_rim', span: TILE * 2.5, innerFrom: 0.25, innerTo: 0.85,
               shade: 0.06, edge: 0.14 },
      rockSprites: 'rock_geo',
      rockFilter: 'saturate(0.35) brightness(1.05)',
      features(k) {
        // Pale evaporite skins on the clay
        if (!k.photo) _blobs(k, 5 + Math.round(k.Rt * 0.5), 2100, 0.8, 1.8, ['rgba(196,186,166,0.14)'], 0.75);
      },
      detail(k) {
        const { tc, f, H, Rt } = k;
        // Crazed clay — cracks right across the pan
        if (!k.photo) _cracks(k, 6 + Math.round(Rt * 0.6), 'rgba(46,36,32,0.40)', 3.6, 0.8);   // the photo clay is cracked already
        // Gas seeps: a dark mouth in rings of pale, bubbled-up mud (painted ground only)
        const n = k.photo ? 0 : 3 + Math.floor(H(4900) * 4);
        for (let i = 0; i < n; i++) {
          const [vx, vy] = k.polar(H(4910 + i) * Math.PI * 2, f.R * (0.1 + H(4920 + i) * 0.5));
          const vr = TILE * (0.12 + H(4930 + i) * 0.1);
          for (let q = 2; q >= 0; q--) {
            tc.strokeStyle = `rgba(206,196,180,${0.16 + (2 - q) * 0.08})`; tc.lineWidth = 1.2;
            tc.beginPath(); tc.arc(vx, vy, vr * (1.6 + q * 1.1), 0, Math.PI * 2); tc.stroke();
          }
          tc.fillStyle = 'rgba(40,34,32,0.8)'; tc.beginPath(); tc.ellipse(vx, vy, vr, vr * 0.75, H(4950 + i) * 3, 0, Math.PI * 2); tc.fill();
        }
        _rocks(k, ...this.rocks(k.Rt));
      },
    },

    [T.RAREEARTHDEPOSIT]: {
      fringe: [140, 104, 64],
      soil: [[104, 46, 30], [124, 62, 38], [122, 78, 52]],
      tones: ['rgba(168,96,50,0.16)', 'rgba(84,36,26,0.16)', 'rgba(160,120,60,0.12)', 'rgba(90,56,60,0.12)'],
      grain: ['rgba(196,130,80,0.30)', 'rgba(50,22,16,0.32)', 'rgba(140,76,46,0.28)'],
      tuft: ['rgba(164,136,86,0.7)', 'rgba(128,100,62,0.7)'],
      rocks: Rt => [Math.round(40 + Rt * 4), [[96, 52, 40], [74, 40, 32], [54, 30, 26]], 0.05, 0.8, 0.6],   // count, tones, big chance, size, spread
      // Photo ground (photo_ground.js): red laterite with its stones at the
      // rim (Poly Haven red_laterite_soil_stones), red mud and stones toward
      // the sand (red_mud_stones), both lit by scripts/bake_ground_tex.py;
      // ironstone nodules from the black rock renders, reddened.
      photo: { rim: 'ground_rareearth_rim', inner: 'ground_rareearth_soil', span: TILE * 5, innerFrom: 0.12, innerTo: 0.7,
               shade: 0.12, edge: 0.14 },
      rockSprites: 'rock_tar',
      rockFilter: 'sepia(0.7) saturate(1.6) hue-rotate(-18deg) brightness(0.75)',
      features(k) {
        // Rain-cut gullies in the soft red soil
        if (k.photo) { k.tc.save(); k.tc.globalAlpha = 0.3; }   // faint over the photo
        _channels(k, 3 + Math.floor(k.H(2700) * 3),
          [[1.6, 'rgba(90,36,22,0.14)'], [0.8, 'rgba(110,44,26,0.20)'], [0.3, 'rgba(60,24,18,0.30)']], 0.5, 0.45);
        if (k.photo) k.tc.restore();
        // Ochre clay showing through (the photo has its own)
        if (!k.photo) _blobs(k, 5 + Math.round(k.Rt * 0.5), 2100, 0.7, 1.4, ['rgba(176,120,60,0.16)'], 0.75);
      },
      detail(k) {
        // Ironstone pebbles — lots of small dark nodules
        _rocks(k, ...this.rocks(k.Rt));
      },
    },
  };
  const TYPES = Object.keys(STYLES);

  // A patch's sprite-sized rocks as { x, y, rad }, worked out once per
  // deposit from the same style arguments and geometry its detail draws.
  const _rockLists = new Map();
  function _rockList(e) {
    const key = e.type + ':' + e.col + ',' + e.row;
    let list = _rockLists.get(key);
    if (list) return list;
    list = [];
    const s = STYLES[e.type], f = fieldFor(e), H = n => _hash(e.col, e.row, n);
    const [n, , bigChance = 0.1, sizeMul = 1, spread = 0.45] = s.rocks(f.R / TILE);
    for (let i = 0; i < n; i++) {
      const g = _rockGeom(f, H, i, bigChance, sizeMul, spread);
      if (g.sz >= SPRITE_SZ) list.push({ x: g.x, y: g.y, rad: g.sz * 0.85 });
    }
    _rockLists.set(key, list);
    return list;
  }

  function draw(tc, e, lod) {
    const s = STYLES[e.type];
    if (!s) return;
    const f = fieldFor(e);
    const H = n => _hash(e.col, e.row, n);
    const k = { tc, f, H, Rt: f.R / TILE, polar: (a, rr) => [f.cx + Math.cos(a) * rr, f.cy + Math.sin(a) * rr], rockSprites: s.rockSprites, rockFilter: s.rockFilter };

    // Fringe — the grass dying back into the new ground
    let g = tc.createRadialGradient(f.cx, f.cy, f.R * 0.55, f.cx, f.cy, f.R * 1.12);
    g.addColorStop(0, _rgba(s.fringe, 0)); g.addColorStop(0.55, _rgba(s.fringe, 0.28));
    g.addColorStop(0.82, _rgba(s.fringe, 0.2)); g.addColorStop(1, _rgba(s.fringe, 0));
    tc.fillStyle = g;
    tc.fill(pathFor(f, 1.12));

    // Photo-scanned ground (photo_ground.js) where the style has it, in place
    // of the painted base and blotches; the painted ground while it loads.
    const ph = s.photo && typeof PhotoGround !== 'undefined'
      ? PhotoGround.patch({ key: e.type + ':' + e.col + ',' + e.row, cx: f.cx, cy: f.cy, R: f.R, outline: sc => pathFor(f, sc), ...s.photo })
      : null;
    if (ph) {
      k.photo = true;
      tc.save();
      tc.imageSmoothingEnabled = true;
      tc.drawImage(ph.cv, ph.x, ph.y, ph.size, ph.size);
      tc.restore();
      tc.save();
      tc.clip(pathFor(f, 0.97));
      s.features(k);
      if (lod > 0) s.detail(k);
      tc.restore();
      _tufts(k, s, lod);
      return;
    }

    // Base — strongest round the deposit, fading out at the rim
    const [c0, c1, c2] = s.soil;
    const mix = (p, q, t) => [Math.round(p[0] + (q[0] - p[0]) * t), Math.round(p[1] + (q[1] - p[1]) * t), Math.round(p[2] + (q[2] - p[2]) * t)];
    g = tc.createRadialGradient(f.cx, f.cy, 0, f.cx, f.cy, f.R);
    g.addColorStop(0, _rgba(c0, 0.97)); g.addColorStop(0.3, _rgba(mix(c0, c1, 0.6), 0.96));
    g.addColorStop(0.62, _rgba(c1, 0.93)); g.addColorStop(0.86, _rgba(c2, 0.55)); g.addColorStop(1, _rgba(c2, 0));
    tc.fillStyle = g;
    tc.fill(pathFor(f, 1.0));

    tc.save();
    tc.clip(pathFor(f, 0.97));
    _blobs(k, 10 + Math.round(k.Rt * 1.2), 1500, 0.08 * k.Rt, 0.16 * k.Rt, s.tones, 0.82);
    s.features(k);
    if (lod > 0) {
      _grain(k, 7, s.grain);
      s.detail(k);
    }
    tc.restore();

    _tufts(k, s, lod);
  }

  // Dead grass tufts round the rim (outside the clip)
  function _tufts(k, s, lod) {
    const { tc, f, H } = k;
    if (lod > 0) {
      tc.lineCap = 'round'; tc.lineWidth = 1;
      const n = Math.round(k.Rt * 8);
      for (let i = 0; i < n; i++) {
        const a = H(7000 + i) * Math.PI * 2;
        const idx = Math.round(a / (Math.PI * 2) * NV) % NV;
        const [tx, ty] = k.polar(a, f.R * f.jit[idx] * (0.8 + H(7100 + i) * 0.28));
        tc.strokeStyle = H(7200 + i) > 0.5 ? s.tuft[0] : s.tuft[1];
        tc.beginPath();
        for (let q = 0; q < 4; q++) {
          const ba = -Math.PI / 2 + (q - 1.5) * 0.35 + (H(7300 + i * 4 + q) - 0.5) * 0.4;
          const bl = TILE * (0.12 + H(7400 + i * 4 + q) * 0.14);
          tc.moveTo(tx, ty); tc.lineTo(tx + Math.cos(ba) * bl, ty + Math.sin(ba) * bl);
        }
        tc.stroke();
      }
    }
  }

  // The seasons' grass washes and wildflowers (FrostSystem.render: spring
  // green, late-summer straw, autumn gold and leaves, winter brown) are for
  // grass, not a deposit's bare ground. holeMask(e): opaque over the patch,
  // clear outside, with a soft edge like the photo ground's, for cutting
  // the patch back out of them. Kept per deposit, at low resolution.
  function holeMask(e) {
    const f = fieldFor(e);
    return PhotoGround.hole('dep:' + e.type + ':' + e.col + ',' + e.row, f, sc => pathFor(f, sc));
  }

  return {
    // Background-cache key: a hash of every patched deposit's type and
    // position (see GeoField.version for why a count is not enough).
    version() {
      if (typeof EntityRegistry === 'undefined') return 0;
      let v = 0;
      for (let t = 0; t < TYPES.length; t++)
        for (const e of EntityRegistry.getByType(TYPES[t]))
          v = (v + e.col * 73856093 + e.row * 19349663 + (t + 1) * 83492791) | 0;
      // ...and rebake as the photo textures and rock sprites arrive.
      return v + ':' + (typeof PhotoGround !== 'undefined' ? PhotoGround.version() : 0);
    },

    // Every deposit whose patch could touch the given tile rect.
    visible(cStart, cEnd, rStart, rEnd) {
      const out = [];
      if (typeof EntityRegistry === 'undefined') return out;
      for (const t of TYPES) {
        for (const e of EntityRegistry.getByType(t)) {
          if (e.col + (e.width || 2) + MAX_R < cStart || e.col - MAX_R > cEnd) continue;
          if (e.row + (e.height || 2) + MAX_R < rStart || e.row - MAX_R > rEnd) continue;
          out.push(e);
        }
      }
      return out;
    },

    // Is this tile inside any of these patches (fieldFor results)? Keeps
    // flowers and leaf litter off the bare ground.
    covers(fields, c, r) {
      const x = (c + 0.5) * TILE, y = (r + 0.5) * TILE;
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const dx = x - f.cx, dy = y - f.cy, d = Math.hypot(dx, dy);
        if (d > f.R * 1.2) continue;
        const a = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
        if (d <= f.R * f.jit[Math.round(a / (Math.PI * 2) * NV) % NV]) return true;
      }
      return false;
    },

    // The rocks (a quarter tile across and up) on the deposit patches within
    // `reach` world px of (x, y), as { x, y, rad } — the same rocks the
    // ground draws, for the wildlife to walk round.
    rocksNear(x, y, reach) {
      const out = [];
      if (typeof EntityRegistry === 'undefined') return out;
      const c = x / TILE, r = y / TILE, span = MAX_R + reach / TILE + 3;
      for (const t of TYPES) {
        for (const e of EntityRegistry.getByType(t)) {
          if (Math.abs(e.col + 1 - c) > span || Math.abs(e.row + 1 - r) > span) continue;
          for (const q of _rockList(e)) if (Math.hypot(q.x - x, q.y - y) <= reach + q.rad) out.push(q);
        }
      }
      return out;
    },

    draw, fieldFor, holeMask,
  };
})();
