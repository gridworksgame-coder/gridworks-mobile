/* ═══════════════════════════════════════════════════════════════════
   SITE YARDS — the ground a plant stands on
   Most process plants are drawn as their equipment alone: tanks, kilns
   and towers standing straight on the grass with pipework between them,
   which read as parts left lying in a field rather than a site someone
   built. Each of the types listed below gets a yard laid under it:
     concrete  a poured slab with expansion joints, kerb, a painted safety
               line and hazard-striped corners (process plants)
     gravel    a crushed-stone compound inside a chain-link fence
               (extraction sites, wellheads, switchgear)
     bund      a concrete floor walled round to hold a spill (tank farms)
   and the free ground on it is dressed with the clutter a working site
   collects: drum clusters, pallets, IBC totes, cable reels, gas cylinder
   cages, a forklift, a pickup or a van, a site cabin, skips, cones, a
   few people in hard hats, and floodlight masts that light the yard
   after dark (renderNight, drawn over the night overlay like ZoneLights).

   Where things go is read off the sprite itself: each kind of plant is
   drawn once, tiny, into a CPU canvas and every 10 px cell its art covers
   is marked taken (plus a cell of clearance), so props only ever land on
   open ground, never under a tank or across a stub label. That read-back
   is done between frames, a few kinds at a time; until a kind has been
   measured its plants show the bare pad. Placement is seeded by the
   plant's tile, so a plant always gets the same yard.

   Drawn by renderEntityAt in the static phase, under the contact shadow,
   so it is baked into BuildingSpriteCache bitmaps with everything else.
   It stays out of ContactShadow's bake and WireReach's read-back
   (ContactShadow.busy()), so shadows are still cast by the equipment and
   cables still run in to the plant rather than stopping at the kerb.
   ═══════════════════════════════════════════════════════════════════ */

const SiteYard = (() => {
  const CELL = 10;                   // world px per placement cell
  const RES  = 3;                    // prop sprite px per world px
  let KIND = null;                   // type -> 'concrete' | 'gravel' | 'bund'

  function kinds() {
    if (KIND) return KIND;
    KIND = new Map();
    const set = (k, list) => { for (const t of list) if (t !== undefined) KIND.set(t, k); };
    set('concrete', [T.CHEMICALPLANT, T.FUELPLANT, T.REFINERY, T.FUELGEN, T.COALGENERATOR, T.ELECTROLYZER,
      T.ATMOSCOLLECTOR, T.HABERBOSCH, T.WASHTOWER, T.COOLINGTOWER, T.COOLINGTOWER2, T.NUCLEARREACTOR,
      T.ADVREACTOR, T.COALWASTE, T.OILWASTE, T.NUCLEARWASTE, T.GEOTURBINE, T.MHDRING, T.SOLIDSTORAGE,
      T.LEACHPLANT, T.SCMILL, T.COREWORKS, T.COKEOVEN, T.GRAPHITEFURNACE]);
    set('gravel', [T.PUMPJACK, T.PUMPJACK2, T.URANIUMMINE, T.SULFURMINE, T.COALMINE2, T.LITHIUMMINE,
      T.GEOWELL, T.SURVEY, T.BEACON, T.CIRCUITSWITCH, T.RAREEARTHMINE]);
    set('bund', [T.OILSTORAGE]);
    return KIND;
  }
  const has = (type) => kinds().has(type);

  // ── Deterministic randomness ─────────────────────────────────────────
  function hash(a, b, c) {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function rngFrom(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let r = Math.imul(s ^ (s >>> 15), 1 | s);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const typeSalt = (type) => { let h = 7; for (let i = 0; i < type.length; i++) h = (h * 31 + type.charCodeAt(i)) | 0; return h; };

  // ── Ground textures (patterns, world-anchored) ───────────────────────
  // One 4×4-tile swatch per material, drawn once at 2× and repeated. A
  // pattern fill is anchored to the world origin under the camera
  // transform, so the slab joints (every 2 tiles) land on tile lines.
  let _pat = null;
  function patterns() {
    if (_pat) return _pat;
    const P = TILE * 4, R = 2;
    const mk = (paint) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = P * R;
      const g = cv.getContext('2d');
      g.scale(R, R);
      paint(g, rngFrom(0x5eed + P));
      const p = g.createPattern(cv, 'repeat');
      try { p.setTransform(new DOMMatrix([1 / R, 0, 0, 1 / R, 0, 0])); } catch (_e) {}
      return p;
    };
    _pat = {
      concrete: mk((g, rnd) => {
        g.fillStyle = '#7e7b73'; g.fillRect(0, 0, P, P);
        for (let i = 0; i < 26; i++) {                              // pour tone
          const x = rnd() * P, y = rnd() * P, r = 10 + rnd() * 26, lite = rnd() < 0.5;
          const rg = g.createRadialGradient(x, y, 0, x, y, r);
          rg.addColorStop(0, lite ? 'rgba(255,252,240,0.07)' : 'rgba(30,28,24,0.07)');
          rg.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        for (let i = 0; i < 2600; i++) {                            // aggregate
          g.fillStyle = rnd() < 0.55 ? 'rgba(40,38,34,0.22)' : 'rgba(250,248,240,0.2)';
          g.fillRect(rnd() * P, rnd() * P, 0.5 + rnd() * 0.6, 0.5 + rnd() * 0.6);
        }
        g.strokeStyle = 'rgba(36,34,30,0.28)'; g.lineWidth = 0.5;    // hairline cracks
        for (let i = 0; i < 4; i++) {
          let x = rnd() * P, y = rnd() * P;
          g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 12; y += (rnd() - 0.3) * 9; g.lineTo(x, y); }
          g.stroke();
        }
        const J = TILE * 2;                                         // saw-cut joints
        for (const o of [0, J]) {
          g.fillStyle = 'rgba(34,32,28,0.42)'; g.fillRect(o, 0, 1, P); g.fillRect(0, o, P, 1);
          g.fillStyle = 'rgba(255,255,250,0.13)'; g.fillRect(o + 1, 0, 0.7, P); g.fillRect(0, o + 1, P, 0.7);
        }
      }),
      gravel: mk((g, rnd) => {
        g.fillStyle = '#7a7366'; g.fillRect(0, 0, P, P);
        for (let i = 0; i < 18; i++) {                              // where it's been packed down
          const x = rnd() * P, y = rnd() * P, r = 14 + rnd() * 24;
          const rg = g.createRadialGradient(x, y, 0, x, y, r);
          rg.addColorStop(0, rnd() < 0.5 ? 'rgba(60,54,44,0.1)' : 'rgba(255,248,230,0.07)');
          rg.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        const tones = ['rgba(150,142,128,0.5)', 'rgba(92,84,72,0.45)', 'rgba(134,126,112,0.5)', 'rgba(168,160,146,0.4)', 'rgba(84,76,66,0.4)', 'rgba(140,128,110,0.45)'];
        for (let i = 0; i < 5200; i++) {
          const x = rnd() * P, y = rnd() * P, r = 0.35 + rnd() * 0.75;
          g.fillStyle = tones[(rnd() * tones.length) | 0];
          g.beginPath(); g.ellipse(x, y, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2); g.fill();
        }
        for (let i = 0; i < 700; i++) { g.fillStyle = 'rgba(255,250,235,0.18)'; g.fillRect(rnd() * P, rnd() * P, 0.5, 0.5); }
      }),
    };
    return _pat;
  }

  // ── The pad ──────────────────────────────────────────────────────────
  function drawPad(g, x, y, w, h, kind, seed, detail) {
    const P = patterns();
    const ins = 2, r = 6;
    const X = x + ins, Y = y + ins, W = w - ins * 2, H = h - ins * 2;
    g.save();
    // kerb
    g.fillStyle = kind === 'gravel' ? '#4a4438' : '#45433d';
    g.beginPath(); g.roundRect(X, Y, W, H, r); g.fill();
    // surface
    g.fillStyle = kind === 'gravel' ? P.gravel : P.concrete;
    g.beginPath(); g.roundRect(X + 2, Y + 2, W - 4, H - 4, r - 1); g.fill();
    // daylight falloff across the slab, light from the top left as everywhere
    const lg = g.createLinearGradient(X, Y, X + W, Y + H);
    lg.addColorStop(0, 'rgba(255,250,235,0.08)'); lg.addColorStop(1, 'rgba(20,18,14,0.12)');
    g.fillStyle = lg; g.fill();
    if (detail) {
      // oil and rust stains
      const rnd = rngFrom(seed ^ 0x51a1);
      const n = Math.min(14, 2 + Math.round((W * H) / (TILE * TILE * 9)));
      g.save(); g.beginPath(); g.roundRect(X + 2, Y + 2, W - 4, H - 4, r - 1); g.clip();
      for (let k = 0; k < n; k++) {
        const sx = X + 8 + rnd() * (W - 16), sy = Y + 8 + rnd() * (H - 16), sr = 4 + rnd() * 11;
        const rg = g.createRadialGradient(sx, sy, 0, sx, sy, sr);
        const rust = rnd() < 0.3;
        rg.addColorStop(0, rust ? 'rgba(120,64,30,0.2)' : 'rgba(26,22,18,0.24)');
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rg;
        g.beginPath(); g.ellipse(sx, sy, sr * (1 + rnd() * 0.6), sr, rnd() * 3, 0, Math.PI * 2); g.fill();
      }
      if (kind === 'gravel') {                                       // tyre ruts
        g.strokeStyle = 'rgba(48,42,34,0.22)'; g.lineWidth = 2.6;
        const vx = X + W * (0.3 + rnd() * 0.4);
        for (const o of [-6, 6]) {
          g.beginPath(); g.moveTo(vx + o, Y + H); g.bezierCurveTo(vx + o, Y + H * 0.7, vx + o + (rnd() - 0.5) * 30, Y + H * 0.5, vx + o + (rnd() - 0.5) * 40, Y + H * 0.3); g.stroke();
        }
      }
      g.restore();
    }
    // bevel: lit top-left lip, shaded bottom-right
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,252,240,0.32)';
    g.beginPath(); g.moveTo(X + 2.5, Y + H - r); g.lineTo(X + 2.5, Y + r); g.quadraticCurveTo(X + 2.5, Y + 2.5, X + r, Y + 2.5); g.lineTo(X + W - r, Y + 2.5); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.32)';
    g.beginPath(); g.moveTo(X + W - 2.5, Y + r); g.lineTo(X + W - 2.5, Y + H - r); g.quadraticCurveTo(X + W - 2.5, Y + H - 2.5, X + W - r, Y + H - 2.5); g.lineTo(X + r, Y + H - 2.5); g.stroke();

    if (kind === 'concrete') {
      // painted safety line, hazard-striped corners
      g.strokeStyle = 'rgba(226,186,40,0.82)'; g.lineWidth = 1.5;
      g.beginPath(); g.roundRect(X + 6, Y + 6, W - 12, H - 12, 3); g.stroke();
      if (detail) {
        const cl = Math.min(13, W * 0.1, H * 0.1);
        g.save(); g.beginPath(); g.roundRect(X + 2, Y + 2, W - 4, H - 4, r - 1); g.clip();
        for (const [cx, cy, sx, sy] of [[X + 2, Y + 2, 1, 1], [X + W - 2, Y + 2, -1, 1], [X + 2, Y + H - 2, 1, -1], [X + W - 2, Y + H - 2, -1, -1]]) {
          g.save(); g.translate(cx, cy); g.scale(sx, sy);
          g.beginPath(); g.moveTo(0, 0); g.lineTo(cl, 0); g.lineTo(0, cl); g.closePath();
          g.fillStyle = '#e2b420'; g.fill();
          g.clip(); g.strokeStyle = '#1c1a16'; g.lineWidth = 2;
          for (let d = 0; d < cl * 2; d += 4.5) { g.beginPath(); g.moveTo(d, 0); g.lineTo(d - cl, cl); g.stroke(); }
          g.restore();
        }
        g.restore();
      }
    } else if (kind === 'gravel') {
      // chain-link fence on the kerb line: posts, mesh, a top rail
      g.strokeStyle = 'rgba(30,32,34,0.35)'; g.lineWidth = 1.6;
      g.beginPath(); g.roundRect(X + 4.5, Y + 5.5, W - 8, H - 8, 3); g.stroke();      // its shadow
      g.strokeStyle = 'rgba(170,176,180,0.75)'; g.lineWidth = 0.9;
      g.beginPath(); g.roundRect(X + 3.5, Y + 3.5, W - 7, H - 7, 3); g.stroke();
      if (detail) {
        g.fillStyle = '#5e6266';
        const step = 12;
        for (let px = X + 3.5; px <= X + W - 3.5; px += step) { g.fillRect(px - 0.9, Y + 2.6, 1.8, 1.8); g.fillRect(px - 0.9, Y + H - 4.4, 1.8, 1.8); }
        for (let py = Y + 3.5 + step; py < Y + H - 3.5; py += step) { g.fillRect(X + 2.6, py - 0.9, 1.8, 1.8); g.fillRect(X + W - 4.4, py - 0.9, 1.8, 1.8); }
      }
    } else if (kind === 'bund') {
      // the bund wall: a raised concrete rim round the tank floor
      g.lineWidth = 4;
      g.strokeStyle = '#9c988e';
      g.beginPath(); g.roundRect(X + 3, Y + 3, W - 6, H - 6, r - 2); g.stroke();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(255,255,248,0.4)';
      g.beginPath(); g.roundRect(X + 1.6, Y + 1.6, W - 3.2, H - 3.2, r - 1); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.roundRect(X + 5.4, Y + 5.4, W - 10.8, H - 10.8, r - 3); g.stroke();
      if (detail) {                                                  // sump grate
        const gx = X + W - 16, gy = Y + H - 16;
        g.fillStyle = '#2a2a28'; g.fillRect(gx, gy, 8, 8);
        g.strokeStyle = '#6a6a64'; g.lineWidth = 0.6;
        for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(gx + k * 2, gy); g.lineTo(gx + k * 2, gy + 8); g.stroke(); }
      }
    }
    g.restore();
  }

  // ── Props ────────────────────────────────────────────────────────────
  // Each is drawn in a box w×h centred on the origin, in world px, facing
  // "up". They're baked to small bitmaps (with a cast shadow added down
  // and right, whatever way round the prop is turned) and blitted.
  const C = (g, x, y, r, fill, stroke, lw) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 0.6; g.stroke(); } };
  const RR = (g, x, y, w, h, r, fill, stroke, lw) => { g.beginPath(); g.roundRect(x, y, w, h, r); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 0.6; g.stroke(); } };

  function drum(g, x, y, r, col) {
    C(g, x, y, r, col, 'rgba(0,0,0,0.55)', 0.6);
    C(g, x, y, r * 0.78, null, 'rgba(0,0,0,0.3)', 0.5);
    C(g, x - r * 0.35, y - r * 0.3, r * 0.16, 'rgba(20,20,20,0.7)');
    C(g, x + r * 0.38, y + r * 0.3, r * 0.12, 'rgba(20,20,20,0.6)');
    g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.45, r * 0.45, r * 0.18, -0.5, 0, Math.PI * 2); g.fill();
  }
  const DRUM_COLS = ['#2c5aa6', '#d4a820', '#3a8448', '#a8302a', '#26282c', '#6a7480'];

  const PROPS = {
    drums: { w: 2, h: 2, wt: 9, kinds: 'cgb', draw(g, w, h, v) {
      const col = DRUM_COLS[v % DRUM_COLS.length], alt = DRUM_COLS[(v + 3) % DRUM_COLS.length];
      const r = 4.3;
      drum(g, -4.6, -4.4, r, col); drum(g, 4.4, -4.6, r, col);
      drum(g, -4.4, 4.5, r, v % 2 ? alt : col);
      if (v % 3) drum(g, 4.6, 4.4, r, col);
    } },
    pallet: { w: 2, h: 2, wt: 9, kinds: 'cg', draw(g, w, h, v) {
      RR(g, -8.5, -8.5, 17, 17, 0.8, '#9a7a4a', 'rgba(40,28,14,0.7)');
      g.fillStyle = 'rgba(60,40,20,0.5)'; for (let k = -6; k <= 6; k += 4) g.fillRect(-8.5, k, 17, 1);
      const load = v % 4;
      if (load === 0) {                                              // shrink-wrapped cartons
        RR(g, -7, -7, 14, 14, 1, '#b08a5a', 'rgba(50,34,16,0.7)');
        g.strokeStyle = 'rgba(80,56,28,0.6)'; g.lineWidth = 0.5;
        g.beginPath(); g.moveTo(0, -7); g.lineTo(0, 7); g.moveTo(-7, 0); g.lineTo(7, 0); g.stroke();
        g.fillStyle = 'rgba(230,240,255,0.25)'; g.fillRect(-7, -7, 14, 4);
      } else if (load === 1) {                                       // bagged chemicals
        for (const [bx, by] of [[-3.6, -3.8], [3.6, -3.8], [-3.6, 3.6], [3.6, 3.6]]) RR(g, bx - 3.3, by - 3, 6.6, 6, 2, '#e8e4d8', 'rgba(90,86,74,0.7)');
        g.fillStyle = '#2a68a8'; g.fillRect(-5, -4.6, 2.6, 1.4); g.fillRect(2.2, 2.8, 2.6, 1.4);
      } else if (load === 2) {                                       // steel plate
        RR(g, -7.5, -6.5, 15, 13, 0.5, '#8a9098', 'rgba(30,34,38,0.8)');
        g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(-6, -4.5); g.lineTo(6, -4.5); g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.moveTo(-7.5, -2); g.lineTo(7.5, -2); g.moveTo(-7.5, 2); g.lineTo(7.5, 2); g.stroke();
      } else {                                                       // blue drums on a pallet
        drum(g, -3.8, -3.8, 3.4, '#2c5aa6'); drum(g, 3.8, -3.8, 3.4, '#2c5aa6'); drum(g, -3.8, 3.8, 3.4, '#2c5aa6'); drum(g, 3.8, 3.8, 3.4, '#2c5aa6');
      }
    } },
    ibc: { w: 2, h: 2, wt: 6, kinds: 'cb', draw(g, w, h, v) {
      RR(g, -8, -8, 16, 16, 1, '#3a3e42');
      RR(g, -7, -7, 14, 14, 1.5, v % 2 ? '#e8ecee' : '#d8e0c8');
      g.strokeStyle = 'rgba(80,86,92,0.85)'; g.lineWidth = 0.7;
      for (let k = -4.5; k <= 4.5; k += 3) { g.beginPath(); g.moveTo(k, -7.5); g.lineTo(k, 7.5); g.moveTo(-7.5, k); g.lineTo(7.5, k); g.stroke(); }
      C(g, 0, 0, 2.6, '#2a2c30'); C(g, 0, 0, 1.6, v % 2 ? '#2a6aa8' : '#c8a020');
    } },
    spool: { w: 2, h: 2, wt: 5, kinds: 'cg', draw(g, w, h, v) {
      C(g, 0, 0, 8.4, '#a07a48', 'rgba(50,32,14,0.8)', 0.7);
      C(g, 0, 0, 6.2, v % 2 ? '#2a2a2a' : '#7a3a20');
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 0.6;
      for (let k = 2.6; k < 6.2; k += 1.2) { g.beginPath(); g.arc(0, 0, k, 0, Math.PI * 2); g.stroke(); }
      C(g, 0, 0, 2.2, '#b48a54', 'rgba(50,32,14,0.8)'); C(g, 0, 0, 0.9, '#3a2a18');
    } },
    cylinders: { w: 2, h: 1, wt: 5, kinds: 'cg', draw(g, w, h, v) {
      RR(g, -9.5, -4.5, 19, 9, 1, null, 'rgba(70,74,78,0.9)', 0.8);
      const caps = v % 2 ? ['#2a8a48', '#2a8a48', '#e0e0e0', '#2a8a48'] : ['#a83028', '#3a3a3a', '#a83028', '#e8c020'];
      for (let k = 0; k < 4; k++) { const cx = -6.6 + k * 4.4; C(g, cx, 0, 2, '#9aa0a6', 'rgba(20,20,20,0.7)'); C(g, cx, 0, 1.1, caps[k]); }
      g.strokeStyle = 'rgba(70,74,78,0.9)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-9.5, 0); g.lineTo(9.5, 0); g.stroke();
    } },
    crates: { w: 2, h: 3, wt: 6, kinds: 'cg', draw(g, w, h, v) {
      const crate = (cx, cy, s) => {
        RR(g, cx - s / 2, cy - s / 2, s, s, 0.6, v % 2 ? '#b08850' : '#9a7444', 'rgba(50,30,12,0.85)', 0.7);
        g.strokeStyle = 'rgba(60,38,16,0.7)'; g.lineWidth = 0.7;
        g.beginPath(); g.moveTo(cx - s / 2, cy - s / 2); g.lineTo(cx + s / 2, cy + s / 2); g.moveTo(cx + s / 2, cy - s / 2); g.lineTo(cx - s / 2, cy + s / 2); g.stroke();
        RR(g, cx - s / 2 + 1, cy - s / 2 + 1, s - 2, s - 2, 0.4, null, 'rgba(60,38,16,0.6)', 0.5);
      };
      crate(-3.5, -7.5, 9); crate(4.5, -8.5, 7.5); crate(0, 3.5, 11); if (v % 3 === 0) crate(-5, 11, 6.5);
    } },
    forklift: { w: 2, h: 3, wt: 4, kinds: 'cg', draw(g, w, h, v) {
      g.fillStyle = '#9aa0a6'; g.fillRect(-4.6, -14, 1.6, 8); g.fillRect(3, -14, 1.6, 8);          // forks
      RR(g, -6, -7, 12, 4, 0.6, '#3a3c40');                                                          // mast
      for (const [wx, wy] of [[-6.4, -2.5], [6.4, -2.5], [-6.2, 8.5], [6.2, 8.5]]) RR(g, wx - 1.3, wy - 2.3, 2.6, 4.6, 1, '#151515');
      RR(g, -5.8, -4, 11.6, 16, 2.2, v % 2 ? '#e0a818' : '#d86818', 'rgba(60,36,6,0.85)', 0.7);     // body
      RR(g, -5, 6.5, 10, 5, 1.6, '#3a3a38');                                                         // counterweight
      g.strokeStyle = '#1e1e20'; g.lineWidth = 1;                                                    // overhead guard
      RR(g, -4.6, -2.8, 9.2, 8.6, 1, null, '#1e1e20', 1);
      g.beginPath(); g.moveTo(-4.6, 0); g.lineTo(4.6, 0); g.moveTo(-4.6, 2.9); g.lineTo(4.6, 2.9); g.moveTo(0, -2.8); g.lineTo(0, 5.8); g.stroke();
      C(g, 3.6, 7.4, 0.9, '#ff8a20');
    } },
    van: { w: 3, h: 5, wt: 3, kinds: 'cg', draw(g, w, h, v) {
      const body = ['#eceeee', '#e8e8e2', '#e06a1a', '#2a6a3a'][v % 4];
      for (const [wx, wy] of [[-10.5, -12], [10.5, -12], [-10.5, 13], [10.5, 13]]) RR(g, wx - 1.6, wy - 3.4, 3.2, 6.8, 1.2, '#141414');
      RR(g, -10, -21, 20, 43, 4, body, 'rgba(20,20,20,0.75)', 0.8);
      RR(g, -8.6, -17.5, 17.2, 7, 2.5, '#1e2a38');                                                   // windscreen
      g.fillStyle = 'rgba(160,200,240,0.35)'; g.fillRect(-7.5, -16.8, 6, 2);
      RR(g, -8.4, -9.5, 16.8, 28.5, 2, 'rgba(0,0,0,0.06)', 'rgba(0,0,0,0.18)', 0.5);               // roof panel
      g.strokeStyle = 'rgba(40,40,40,0.75)'; g.lineWidth = 0.9;                                       // roof rack
      for (const ry of [-6, 0, 6, 12]) { g.beginPath(); g.moveTo(-7.5, ry); g.lineTo(7.5, ry); g.stroke(); }
      g.beginPath(); g.moveTo(-7.5, -7.5); g.lineTo(-7.5, 14); g.moveTo(7.5, -7.5); g.lineTo(7.5, 14); g.stroke();
      if (v % 4 < 2) { RR(g, -3, -9, 6, 2.2, 1, '#f08a10'); }                                         // amber beacon bar
      RR(g, -11.6, -14.5, 2, 3, 0.8, '#1a1a1a'); RR(g, 9.6, -14.5, 2, 3, 0.8, '#1a1a1a');            // mirrors
      g.fillStyle = '#fff6d0'; g.fillRect(-8, -21, 3, 1.2); g.fillRect(5, -21, 3, 1.2);              // headlamps
      g.fillStyle = '#b02020'; g.fillRect(-9, 20.6, 3, 1.2); g.fillRect(6, 20.6, 3, 1.2);
    } },
    pickup: { w: 3, h: 5, wt: 3, kinds: 'g', draw(g, w, h, v) {
      const body = ['#c8c8c4', '#2a4a8a', '#7a1e1e', '#e8e4dc'][v % 4];
      for (const [wx, wy] of [[-9.8, -12], [9.8, -12], [-9.8, 12], [9.8, 12]]) RR(g, wx - 1.6, wy - 3.4, 3.2, 6.8, 1.2, '#141414');
      RR(g, -9.4, -21, 18.8, 42, 3.5, body, 'rgba(20,20,20,0.75)', 0.8);
      RR(g, -8, -15.5, 16, 6, 2, '#1e2a38');
      RR(g, -7.6, -9, 15.2, 7, 1.5, 'rgba(0,0,0,0.08)');
      RR(g, -8, 0, 16, 19, 1, '#3a3a38', 'rgba(0,0,0,0.5)', 0.6);                                    // bed
      if (v % 2) { RR(g, -6, 2, 5, 6, 0.5, '#b08850'); C(g, 3, 9, 3, '#a07a48', 'rgba(0,0,0,0.5)'); C(g, 3, 9, 1.4, '#7a3a20'); }
      else { g.fillStyle = '#9aa0a6'; for (let k = 0; k < 4; k++) g.fillRect(-6.5 + k * 3.6, 2, 2.2, 15); }
      g.fillStyle = '#fff6d0'; g.fillRect(-7.5, -21, 3, 1.2); g.fillRect(4.5, -21, 3, 1.2);
    } },
    cabin: { w: 4, h: 7, wt: 2, kinds: 'cg', draw(g, w, h, v) {
      const roof = ['#e4e6e8', '#d8dcd0', '#c8d4dc'][v % 3], trim = ['#2a5a9a', '#3a7a4a', '#a8342a'][v % 3];
      RR(g, -15.5, -31, 31, 62, 1.2, roof, 'rgba(30,30,30,0.8)', 0.9);
      g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 0.6;                                          // corrugation
      for (let k = -14; k < 15; k += 2.2) { g.beginPath(); g.moveTo(k, -30); g.lineTo(k, 30); g.stroke(); }
      g.fillStyle = trim; g.fillRect(-15.5, -31, 31, 2.2); g.fillRect(-15.5, 28.8, 31, 2.2);
      RR(g, -9, -20, 10, 7, 0.8, '#7a8088', 'rgba(20,20,20,0.7)');                                    // AC unit
      C(g, -4, -16.5, 2.6, '#3a3e44'); g.strokeStyle = '#9aa0a6'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(-6.4, -16.5); g.lineTo(-1.6, -16.5); g.moveTo(-4, -18.9); g.lineTo(-4, -14.1); g.stroke();
      RR(g, 6, 14, 6, 5, 0.5, '#5a6066');                                                             // vent
      g.fillStyle = '#6a6e72'; g.fillRect(15.5, 8, 4, 9);                                              // steps
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(16, 10, 3.5, 0.6); g.fillRect(16, 13, 3.5, 0.6);
    } },
    skip: { w: 3, h: 4, wt: 3, kinds: 'cg', draw(g, w, h, v) {
      const col = ['#d0a818', '#2a6a3a', '#3a5a8a'][v % 3];
      g.beginPath(); g.moveTo(-12, -17); g.lineTo(12, -17); g.lineTo(10, 17); g.lineTo(-10, 17); g.closePath();
      g.fillStyle = col; g.fill(); g.strokeStyle = 'rgba(20,20,10,0.85)'; g.lineWidth = 0.9; g.stroke();
      g.beginPath(); g.moveTo(-9.5, -14.5); g.lineTo(9.5, -14.5); g.lineTo(8, 14.5); g.lineTo(-8, 14.5); g.closePath();
      g.fillStyle = '#3a342c'; g.fill();
      const rnd = rngFrom(v * 97 + 3);                                                                // rubble
      for (let k = 0; k < 16; k++) { g.fillStyle = ['#8a7a68', '#6a6a66', '#a08a60', '#4a4a48', '#9a3a2a'][(rnd() * 5) | 0]; g.fillRect(-8 + rnd() * 15, -13 + rnd() * 26, 1.5 + rnd() * 3, 1.2 + rnd() * 2.5); }
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-12, -2, 1.4, 4); g.fillRect(10.6, -2, 1.4, 4);
    } },
    cones: { w: 1, h: 1, wt: 4, kinds: 'cgb', draw(g, w, h, v) {
      const cone = (x, y) => { RR(g, x - 2.6, y - 2.6, 5.2, 5.2, 0.8, '#1e1e1e'); C(g, x, y, 2.3, '#f06818'); C(g, x, y, 1.4, '#f4f4f0'); C(g, x, y, 0.7, '#f06818'); };
      cone(-1.5, -1.2); if (v % 2) cone(2, 2);
    } },
    hydrant: { w: 1, h: 1, wt: 3, kinds: 'cb', draw(g, w, h, v) {
      RR(g, -3.6, -3.6, 7.2, 7.2, 1, '#d8d4c8', 'rgba(0,0,0,0.5)', 0.5);
      C(g, 0, 0, 2.4, '#c42420', 'rgba(60,0,0,0.8)'); C(g, -0.6, -0.6, 0.8, 'rgba(255,200,200,0.6)');
    } },
    barrier: { w: 1, h: 3, wt: 3, kinds: 'cg', draw(g, w, h, v) {
      for (let k = -1; k <= 1; k++) {
        RR(g, -3.4, k * 9.6 - 4.5, 6.8, 9, 1.2, '#c8c4b8', 'rgba(40,40,36,0.7)', 0.6);
        g.fillStyle = 'rgba(255,255,250,0.35)'; g.fillRect(-1.2, k * 9.6 - 4, 2.4, 8);
        if (v % 2) { g.fillStyle = '#d8381c'; g.fillRect(-3.4, k * 9.6 - 1, 6.8, 1.6); }
      }
    } },
    pipes: { w: 3, h: 2, wt: 5, kinds: 'g', draw(g, w, h, v) {
      g.fillStyle = '#6a4a28'; g.fillRect(-11, -9, 2.4, 18); g.fillRect(8.6, -9, 2.4, 18);            // dunnage
      const col = v % 2 ? '#8a8e94' : '#7a4a2a';
      for (let k = 0; k < 5; k++) {
        const y = -7.2 + k * 3.6;
        const pg = g.createLinearGradient(0, y - 1.6, 0, y + 1.6);
        pg.addColorStop(0, '#d8dce0'); pg.addColorStop(0.5, col); pg.addColorStop(1, '#2a2c30');
        g.fillStyle = pg; g.fillRect(-13.5, y - 1.6, 27, 3.2);
        C(g, -13.5, y, 1.6, '#3a3c40'); C(g, -13.5, y, 0.9, '#121314');
      }
    } },
    tyres: { w: 2, h: 2, wt: 3, kinds: 'g', draw(g, w, h, v) {
      for (const [tx, ty] of [[-4, -4], [4.2, -3.6], [0, 4.4]]) { C(g, tx, ty, 4.4, '#1c1c1c', '#000', 0.5); C(g, tx, ty, 2.1, '#5a5a56'); C(g, tx, ty, 1.1, '#2a2a28'); }
    } },
    worker: { w: 1, h: 1, wt: 5, kinds: 'cgb', draw(g, w, h, v) {
      const vest = v % 2 ? '#f08a18' : '#d8e820', hat = ['#f4f4f0', '#f0d020', '#2a6ad0'][v % 3];
      g.save(); g.rotate((v % 5) * 1.3);
      RR(g, -3.2, -1.6, 6.4, 3.4, 1.6, vest, 'rgba(40,30,0,0.6)', 0.4);                              // shoulders
      C(g, -3.4, 0.2, 0.9, '#3a3430'); C(g, 3.4, 0.2, 0.9, '#3a3430');                              // arms
      C(g, 0, 0, 1.75, hat, 'rgba(0,0,0,0.5)', 0.4);                                                 // hard hat
      g.restore();
    } },
    mast: { w: 1, h: 1, wt: 0, kinds: '', draw(g, w, h, v) {
      RR(g, -3, -3, 6, 6, 0.8, '#5a5a56', 'rgba(0,0,0,0.6)', 0.5);                                  // footing
      C(g, 0, 0, 1.5, '#2a2c2e');
      RR(g, -3.8, -2.2, 7.6, 2.6, 0.8, '#3a3c40');                                                   // lamp heads
      g.fillStyle = '#fff4d8'; g.fillRect(-3.3, -1.6, 2.6, 1.4); g.fillRect(0.7, -1.6, 2.6, 1.4);
    } },
  };

  const _sprites = new Map();   // 'kind|variant|rot' -> { cv, w, h }
  function sprite(kind, v, rot) {
    const key = kind + '|' + v + '|' + rot;
    let s = _sprites.get(key);
    if (s) return s;
    const P = PROPS[kind];
    const fw = (rot ? P.h : P.w) * CELL, fh = (rot ? P.w : P.h) * CELL;
    const M = 3;                                                      // margin for the shadow
    const cw = Math.ceil((fw + M * 2) * RES), chh = Math.ceil((fh + M * 2) * RES);
    const art = document.createElement('canvas'); art.width = cw; art.height = chh;
    const a = art.getContext('2d');
    a.setTransform(RES, 0, 0, RES, (fw / 2 + M) * RES, (fh / 2 + M) * RES);
    if (rot) a.rotate(Math.PI / 2);
    a.lineJoin = 'round';
    P.draw(a, P.w * CELL, P.h * CELL, v);
    // shadow: the art's silhouette, flattened, down and to the right
    const out = document.createElement('canvas'); out.width = cw; out.height = chh;
    const o = out.getContext('2d');
    const sh = document.createElement('canvas'); sh.width = cw; sh.height = chh;
    const sx = sh.getContext('2d');
    sx.drawImage(art, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = '#000'; sx.fillRect(0, 0, cw, chh);
    o.globalAlpha = kind === 'worker' || kind === 'mast' ? 0.3 : 0.38;
    const d = (kind === 'cabin' || kind === 'van' || kind === 'pickup' || kind === 'skip') ? 2.6 : kind === 'mast' ? 3 : 1.6;
    o.drawImage(sh, d * RES, d * 1.2 * RES);
    o.globalAlpha = 1;
    o.drawImage(art, 0, 0);
    s = { cv: out, w: fw + M * 2, h: fh + M * 2, M };
    _sprites.set(key, s);
    return s;
  }

  // ── Free-space masks (per kind of plant) ─────────────────────────────
  const _masks = new Map();     // 'type|w|h|rot' -> { cw, ch, occ } | null
  const _queue = new Map();     // key -> an entity of that kind, waiting to be measured
  let _measuring = false, _cv = null, _cx = null, _scheduled = false;
  const maskKey = (e) => e.type + '|' + (e.width || 1) + '|' + (e.height || 1) + '|' + ((e._rotation || 0) & 3);

  function measure(e) {
    const w = (e.width || 1) * TILE, h = (e.height || 1) * TILE;
    const cw = Math.ceil(w / CELL), ch = Math.ceil(h / CELL);
    if (!_cv) { _cv = document.createElement('canvas'); _cx = _cv.getContext('2d', { willReadFrequently: true }); }
    if (_cv.width < cw || _cv.height < ch) { _cv.width = Math.max(_cv.width, cw); _cv.height = Math.max(_cv.height, ch); }
    _cx.setTransform(1, 0, 0, 1, 0, 0);
    _cx.clearRect(0, 0, _cv.width, _cv.height);
    const x = (e.col || 0) * TILE, y = (e.row || 0) * TILE;
    _cx.setTransform(1 / CELL, 0, 0, 1 / CELL, -x / CELL, -y / CELL);
    const saved = ctx, oh = DayNight.hour, od = DayNight.darkness;
    _measuring = true;
    try {
      ctx = _cx; DayNight.hour = () => 13; DayNight.darkness = () => 0;
      ContactShadow.without(() => SplitPhase.run('all', () => renderEntityAt(e, x, y, 0)));
    } catch (_err) {
      return null;
    } finally {
      ctx = saved; DayNight.hour = oh; DayNight.darkness = od; _measuring = false;
    }
    const d = _cx.getImageData(0, 0, cw, ch).data;
    const raw = new Uint8Array(cw * ch);
    for (let i = 0; i < cw * ch; i++) raw[i] = d[i * 4 + 3] > 28 ? 1 : 0;
    // one cell of clearance round everything drawn, and off the kerb
    const occ = new Uint8Array(cw * ch);
    for (let r = 0; r < ch; r++) for (let c = 0; c < cw; c++) {
      let t = (c < 1 || r < 1 || c >= cw - 1 || r >= ch - 1) ? 1 : 0;
      for (let dr = -1; dr <= 1 && !t; dr++) for (let dc = -1; dc <= 1 && !t; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < ch && cc < cw && raw[rr * cw + cc]) t = 1;
      }
      occ[r * cw + c] = t;
    }
    // The bottom face carries every plant's stubs and their labels: keep a
    // band clear of props there so nothing sits in front of a port.
    for (let r = Math.max(0, ch - 3); r < ch; r++) for (let c = 0; c < cw; c++) occ[r * cw + c] = 1;
    return { cw, ch, occ };
  }

  function pump() {
    _scheduled = false;
    // The renderers leave their small detail out below about half zoom
    // (Camera.zoom can't be pinned for the one call: it has no setter), and
    // a mask taken then would let props land on details drawn closer in.
    if ((Camera.zoom || 1) < 0.55) { setTimeout(schedule, 500); return; }
    const t0 = performance.now();
    for (const [key, e] of _queue) {
      _queue.delete(key);
      _masks.set(key, measure(e));
      if (performance.now() - t0 > 6) break;
    }
    if (_queue.size) schedule();
  }
  function schedule() {
    if (_scheduled) return;
    _scheduled = true;
    if (typeof requestIdleCallback === 'function') requestIdleCallback(pump, { timeout: 250 });
    else setTimeout(pump, 30);
  }

  // ── Layout (per plant) ───────────────────────────────────────────────
  const _layouts = new WeakMap();   // entity -> { key, props: [[kind, v, rot, cx, cy]], masts: [[x, y]] }
  const ORDER = ['cabin', 'van', 'pickup', 'skip', 'crates', 'forklift', 'pipes', 'pallet', 'drums', 'ibc', 'spool', 'tyres', 'cylinders', 'barrier', 'cones', 'hydrant', 'worker'];

  function layoutFor(e, kind) {
    const mk = maskKey(e);
    const lkey = mk + '|' + e.col + '|' + e.row;
    let L = _layouts.get(e);
    if (L && L.key === lkey) return L;
    if (!_masks.has(mk)) {
      if (!_queue.has(mk) && e.col !== undefined) { _queue.set(mk, e); schedule(); }
      return null;
    }
    const M = _masks.get(mk);
    L = { key: lkey, props: [], masts: [] };
    _layouts.set(e, L);
    if (!M) return L;
    const { cw, ch } = M;
    const occ = M.occ.slice();
    const rnd = rngFrom(hash(e.col | 0, e.row | 0, typeSalt(e.type)));
    const fits = (c, r, w, h) => {
      if (c < 0 || r < 0 || c + w > cw || r + h > ch) return false;
      for (let rr = r; rr < r + h; rr++) for (let cc = c; cc < c + w; cc++) if (occ[rr * cw + cc]) return false;
      return true;
    };
    const take = (c, r, w, h, pad) => {
      for (let rr = r - pad; rr < r + h + pad; rr++) for (let cc = c - pad; cc < c + w + pad; cc++)
        if (rr >= 0 && cc >= 0 && rr < ch && cc < cw) occ[rr * cw + cc] = 1;
    };
    // Floodlight masts first, in the corners of the open ground nearest the
    // pad's corners (and along the long sides of a big one).
    const spots = [[1, 1], [cw - 2, 1], [1, ch - 4], [cw - 2, ch - 4]];
    if (cw > 40) spots.push([Math.round(cw / 2), 1]);
    if (ch > 40) spots.push([1, Math.round(ch / 2)], [cw - 2, Math.round(ch / 2)]);
    for (const [sc, sr] of spots) {
      let best = null;
      for (let rad = 0; rad < 5 && !best; rad++)
        for (let dr = -rad; dr <= rad && !best; dr++) for (let dc = -rad; dc <= rad && !best; dc++) {
          const c = sc + dc, r = sr + dr;
          if (fits(c, r, 1, 1)) best = [c, r];
        }
      if (!best) continue;
      take(best[0], best[1], 1, 1, 2);
      const x = (best[0] + 0.5) * CELL, y = (best[1] + 0.5) * CELL;
      L.masts.push([x, y]);
      L.props.push(['mast', 0, 0, x, y]);
    }
    // Then the clutter: big things first, where they fit, then the small
    // stuff, up to a density that leaves the yard looking used, not full.
    let free = 0;
    for (let i = 0; i < occ.length; i++) if (!occ[i]) free++;
    const want = Math.min(34, Math.round(free / 22));
    const letter = kind[0];
    const pool = ORDER.filter(k => PROPS[k].kinds.includes(letter));
    const weightSum = pool.reduce((s, k) => s + PROPS[k].wt, 0);
    const pick = () => { let x = rnd() * weightSum; for (const k of pool) { x -= PROPS[k].wt; if (x <= 0) return k; } return pool[pool.length - 1]; };
    let placed = 0, bigs = 0;
    for (let tries = 0; tries < want * 14 && placed < want; tries++) {
      let k = pick();
      const big = k === 'cabin' || k === 'van' || k === 'pickup' || k === 'skip';
      if (big && bigs >= 1 + Math.floor(free / 900)) continue;
      const P = PROPS[k];
      const rot = (k === 'worker' || k === 'mast') ? 0 : (rnd() < 0.5 ? 1 : 0);
      const w = rot ? P.h : P.w, h = rot ? P.w : P.h;
      const c = Math.floor(rnd() * (cw - w + 1)), r = Math.floor(rnd() * (ch - h + 1));
      if (!fits(c, r, w, h)) continue;
      const v = (rnd() * 12) | 0;
      take(c, r, w, h, k === 'worker' ? 0 : 1);
      L.props.push([k, v, rot, (c + w / 2) * CELL, (r + h / 2) * CELL]);
      placed++; if (big) bigs++;
      // Small things come in groups: a second of the same beside it.
      if (!big && k !== 'worker' && rnd() < 0.45) {
        const nc = c + (rnd() < 0.5 ? w : 0), nr = r + (rnd() < 0.5 ? 0 : h);
        if (fits(nc, nr, w, h)) { take(nc, nr, w, h, 1); L.props.push([k, (v + 1) % 12, rot, (nc + w / 2) * CELL, (nr + h / 2) * CELL]); placed++; }
      }
    }
    // Draw order: top to bottom, so shadows fall over what lies below.
    L.props.sort((a, b) => a[4] - b[4]);
    return L;
  }

  // ── Draw ─────────────────────────────────────────────────────────────
  function draw(e, x, y, t) {
    if (_measuring || e._iconThumb) return;
    if (typeof ContactShadow !== 'undefined' && ContactShadow.busy && ContactShadow.busy()) return;
    const kind = kinds().get(e.type);
    if (!kind) return;
    const w = (e.width || 1) * TILE, h = (e.height || 1) * TILE;
    const z = Camera.zoom || 1;
    const detail = z > 0.42;
    const seed = hash(e.col | 0, e.row | 0, 11);
    drawPad(ctx, x, y, w, h, kind, seed, detail);
    if (!detail || e.col === undefined) return;
    const L = layoutFor(e, kind);
    if (!L) return;
    for (const p of L.props) {
      const s = sprite(p[0], p[1], p[2]);
      ctx.drawImage(s.cv, x + p[3] - s.w / 2, y + p[4] - s.h / 2, s.w, s.h);
    }
  }

  // ── Floodlights after dark ───────────────────────────────────────────
  // Over the night overlay (render_main_loop.js pass 8b), like ZoneLights:
  // each mast throws a pool of light across its yard while the plant has
  // power. One pre-rendered glow per colour, blitted additively.
  const _glow = new Map();
  function glow(rgb) {
    let s = _glow.get(rgb);
    if (s) return s;
    s = document.createElement('canvas'); s.width = s.height = 128;
    const g = s.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, `rgba(${rgb},0.9)`); gr.addColorStop(0.18, `rgba(${rgb},0.42)`);
    gr.addColorStop(0.5, `rgba(${rgb},0.12)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    _glow.set(rgb, s);
    return s;
  }
  const LIGHT = { concrete: '255,222,170', gravel: '255,184,96', bund: '255,222,170' };
  let _typeList = null;
  function renderNight(g, dark, cStart, cEnd, rStart, rEnd) {
    if (dark < 0.18) return;
    const k = Math.min(1, (dark - 0.18) / 0.45);
    if (!_typeList) _typeList = [...kinds().keys()];
    const x0 = (cStart - 3) * TILE, x1 = (cEnd + 3) * TILE, y0 = (rStart - 3) * TILE, y1 = (rEnd + 3) * TILE;
    const R = TILE * 3.1, core = TILE * 0.45;
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const type of _typeList) {
      const kind = KIND.get(type);
      for (const e of EntityRegistry.getByType(type)) {
        if (!e.powered || e.col === undefined) continue;
        const ex = e.col * TILE, ey = e.row * TILE;
        if (ex > x1 || ey > y1 || ex + (e.width || 1) * TILE < x0 || ey + (e.height || 1) * TILE < y0) continue;
        const L = _layouts.get(e);
        if (!L || !L.masts.length) continue;
        const sp = glow(LIGHT[kind]);
        for (const [mx, my] of L.masts) {
          g.globalAlpha = 0.34 * k;
          g.drawImage(sp, ex + mx - R, ey + my - R * 0.85, R * 2, R * 2);
          g.globalAlpha = 0.85 * k;
          g.drawImage(sp, ex + mx - core, ey + my - core - 1, core * 2, core * 2);
        }
      }
    }
    g.restore();
  }

  return { has, draw, renderNight, PROPS, sprite,
           clear() { _masks.clear(); _queue.clear(); _sprites.clear(); } };
})();
