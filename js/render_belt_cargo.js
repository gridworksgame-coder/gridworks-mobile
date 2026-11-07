/* ═══════════════════════════════════════════════════════════════════
   BELT CARGO ART
   One drawing per belt-carried solid, used by BeltCargo.render. Each is
   drawn in the item's own frame: centred on (0,0), heading along +x, and
   sized to sit inside the belt (the rubber is ~14px wide at 1×).

   lod 2 = close up (glows, sheen, small details), 1 = mid, 0 = far away
   (one flat blob). `seed` (0..1, fixed per item) varies shape and
   orientation so a queue of ore doesn't look like one stamp repeated.
   ═══════════════════════════════════════════════════════════════════ */

const _CARGO_FAR = {
  coal: '#1a1714', uranium: '#9ac040', sulfur: '#e8cc30', lithium: '#e6daf0',
  compound: '#e8e4f0', pellets: '#70e8ff', he3pellets: '#c890ff', plutonium: '#b0a8a0', recovered: '#c8b030',
  rods: '#c8d2d6', mox: '#e0c890', spent: '#6a5a44',
  rareearth: '#b8603a', oxide: '#d8cce8', tape: '#c8a060', coke: '#8c9096', graphite: '#3a3e46',
};

// Deterministic 0..1 from an item's seed and an index.
function _cr(seed, n) {
  const v = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

// An irregular rock outline: `n` corners round radius r, jittered by seed.
function _rockPath(seed, salt, r, n, squash = 0.8) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + _cr(seed, salt + i) * 0.5;
    const rr = r * (0.72 + _cr(seed, salt + 10 + i) * 0.4);
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr * squash;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

// The layers of an item's drawing. 'all' is one ordinary pass; CargoSprites
// splits it into 'under' (live, beneath: the glows), 'body' (baked: nothing
// in it moves) and 'over' (live, on top: windows that pulse, light sweeps).
const _cU = p => p === 'all' || p === 'under';
const _cB = p => p === 'all' || p === 'body';
const _cO = p => p === 'all' || p === 'over';

// Item bodies, baked. A belt yard puts a thousand items on screen, each a
// dozen paths, gradients and a clip, and drawing them live left the GPU as
// the bottleneck (the main thread idle a quarter of the time at ~17fps). So
// each body is drawn once per kind, detail level and shape and blitted under
// the item's own rotation. Shapes come in BUCKETS variants per kind (an
// item's seed picks one; its rotation and the phase of anything animated
// still use the exact seed), which is plenty to keep a queue of ore from
// looking stamped. Like PipeStatic it waits for the zoom to settle, and
// steps aside for translucent draws. Zoomed in past MAX_SCALE items are drawn
// live: a rotated bitmap reads a touch soft there, and few items fit on
// screen anyway. CargoSprites.enabled = false compares against the live drawing.
const CargoSprites = (() => {
  const B = 12;                 // half-size of the baked box, item px (a body reaches ~9)
  const BUCKETS = 32;
  const SETTLE_MS = 150, MAX_SETS = 4, MAX_SCALE = 1.25;
  const sets = new Map();       // rounded scale -> { sc, born, bitmaps: Map(key -> canvas) }
  const KIND_IDX = {};
  Object.keys(_CARGO_FAR).forEach((k, i) => { KIND_IDX[k] = i; });
  const api = { enabled: true, B };
  api.clear = () => sets.clear();
  // The baked body for this item at the current (unrotated) transform, or
  // null to draw it live.
  api.get = (kind, lod, seed, fn) => {
    if (!api.enabled || ctx.globalAlpha !== 1 || KIND_IDX[kind] === undefined) return null;
    const m = ctx.getTransform();
    const sc = m.a;
    if (!(sc > 0.05) || sc > MAX_SCALE || m.b !== 0 || m.c !== 0 || Math.abs(m.d - sc) > 1e-6) return null;
    const sk = Math.round(sc * 1000);
    let st = sets.get(sk);
    if (!st) {
      st = { sc, born: performance.now(), bitmaps: new Map() };
      sets.set(sk, st);
      if (sets.size > MAX_SETS) sets.delete(sets.keys().next().value);
    }
    if (performance.now() - st.born < SETTLE_MS) return null;
    const bi = Math.min(BUCKETS - 1, Math.floor(seed * BUCKETS));
    const key = (KIND_IDX[kind] * 4 + lod) * BUCKETS + bi;
    let cv = st.bitmaps.get(key);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = cv.height = Math.ceil(2 * B * st.sc);
      const g = cv.getContext('2d');
      g.setTransform(st.sc, 0, 0, st.sc, B * st.sc, B * st.sc);
      const prev = ctx; ctx = g;
      try { fn(0, lod, (bi + 0.5) / BUCKETS, 'body'); }
      finally { ctx = prev; }
      cv._sc = st.sc;
      st.bitmaps.set(key, cv);
    }
    return cv;
  };
  return api;
})();

function drawCargo(kind, x, y, ang, t, lod, seed) {
  if (lod === 0) {
    ctx.fillStyle = _CARGO_FAR[kind] || '#aaa';
    ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  const fn = _CARGO_DRAW[kind];
  const body = fn ? CargoSprites.get(kind, lod, seed, fn) : null;
  // Loose material tumbles to any orientation; packaged goods ride square.
  const loose = kind === 'coal' || kind === 'uranium' || kind === 'sulfur' || kind === 'lithium' || kind === 'rareearth' || kind === 'coke';
  ctx.rotate(loose ? ang + seed * Math.PI * 2 : ang);
  if (body) {
    const B = CargoSprites.B;
    fn(t, lod, seed, 'under');
    ctx.drawImage(body, -B, -B, body.width / body._sc, body.height / body._sc);
    fn(t, lod, seed, 'over');
  } else if (fn) fn(t, lod, seed, 'all');
  ctx.restore();
}

const _CARGO_DRAW = {
  // A heap of anthracite: two or three angular lumps with glassy facets.
  coal(t, lod, seed, part = 'all') {
    if (!_cB(part)) return;
    const n = 2 + (_cr(seed, 1) > 0.45 ? 1 : 0);
    for (let k = 0; k < n; k++) {
      const a = k * 2.3 + seed * 6, d = k ? 2.4 : 0;
      const ox = Math.cos(a) * d, oy = Math.sin(a) * d * 0.8;
      const r = k ? 2.8 + _cr(seed, 20 + k) * 0.8 : 3.7;
      ctx.save(); ctx.translate(ox, oy);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.save(); ctx.translate(0.7, 1.1); _rockPath(seed, k * 30, r, 6); ctx.fill(); ctx.restore();
      _rockPath(seed, k * 30, r, 6);
      const g = ctx.createLinearGradient(-r, -r, r, r);
      g.addColorStop(0, '#5a5550'); g.addColorStop(0.45, '#26221e'); g.addColorStop(1, '#0c0b0a');
      ctx.fillStyle = g; ctx.fill();
      // edge catching the light, so a lump reads against the dark rubber
      ctx.strokeStyle = 'rgba(190,190,200,0.28)'; ctx.lineWidth = 0.45; ctx.stroke();
      if (lod > 1) {
        // a lit facet and a glint — anthracite is almost glassy
        ctx.fillStyle = 'rgba(150,150,160,0.28)';
        ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.5); ctx.lineTo(r * 0.1, -r * 0.7); ctx.lineTo(-r * 0.1, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(230,235,245,0.8)';
        ctx.fillRect(-r * 0.35, -r * 0.45, 0.8, 0.8);
      }
      ctx.restore();
    }
  },

  // Pitchblende ore: dull grey-brown rock shot through with bright
  // yellow-green secondary uranium minerals, which fluoresce.
  uranium(t, lod, seed, part = 'all') {
    const r = 3.9;
    if (lod > 1 && _cU(part)) {
      const p = 0.6 + 0.4 * Math.sin(t * 2.2 + seed * 9);
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 7.5);
      g.addColorStop(0, `rgba(170,255,60,${(0.42 * p).toFixed(3)})`); g.addColorStop(1, 'rgba(170,255,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.fill();
    }
    if (!_cB(part)) return;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.save(); ctx.translate(0.8, 1.2); _rockPath(seed, 3, r, 7); ctx.fill(); ctx.restore();
    _rockPath(seed, 3, r, 7);
    const g = ctx.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, '#b4c080'); g.addColorStop(0.5, '#6e7c44'); g.addColorStop(1, '#3a4424');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(20,16,12,0.6)'; ctx.lineWidth = 0.4; ctx.stroke();
    ctx.save(); _rockPath(seed, 3, r, 7); ctx.clip();
    // black pitchblende seam, crusted with fluorescent yellow-green minerals
    ctx.fillStyle = '#1c1a18';
    ctx.beginPath(); ctx.ellipse(0.4, 0.3, r * 0.75, r * 0.32, seed * 3, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 5; i++) {
      const vx = (_cr(seed, 40 + i) - 0.5) * r * 1.3, vy = (_cr(seed, 50 + i) - 0.5) * r * 0.9;
      const vr = 0.5 + _cr(seed, 60 + i) * 0.7;
      ctx.fillStyle = i % 2 ? '#b8e830' : '#e8ff70';
      ctx.beginPath(); ctx.ellipse(vx, vy, vr, vr * 0.7, i, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },

  // Native sulfur: a little druse of bright yellow bipyramidal crystals.
  sulfur(t, lod, seed, part = 'all') {
    if (!_cB(part)) return;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0.7, 1.2, 4.2, 3.2, 0, 0, Math.PI * 2); ctx.fill();
    // matrix crust
    ctx.fillStyle = '#b89a1a';
    ctx.beginPath(); ctx.ellipse(0, 0.4, 3.8, 2.8, 0, 0, Math.PI * 2); ctx.fill();
    const xs = [[-1.6, -0.4, 0.5], [1.4, 0.2, -0.6], [0, -1.2, 1.9]];
    for (let i = 0; i < 3; i++) {
      const [cx, cy, a] = xs[i];
      const L = 2.5 + _cr(seed, i) * 1.1, W = 1.5 + _cr(seed, 9 + i) * 0.4;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a + seed * 2);
      // lit and shaded halves of the bipyramid
      ctx.fillStyle = '#fff47a';
      ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, -W); ctx.lineTo(L, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d8ae10';
      ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, W); ctx.lineTo(L, 0); ctx.closePath(); ctx.fill();
      if (lod > 1) {
        ctx.strokeStyle = 'rgba(110,80,0,0.7)'; ctx.lineWidth = 0.35;
        ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(0, -W); ctx.lineTo(L, 0); ctx.lineTo(0, W); ctx.closePath(); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,230,0.9)'; ctx.fillRect(-0.6, -W * 0.6, 0.7, 0.5);
      }
      ctx.restore();
    }
  },

  // Spodumene: long glassy prisms, pale lilac, the lithium ore of choice.
  lithium(t, lod, seed, part = 'all') {
    if (!_cB(part)) return;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(0.7, 1.2, 4.6, 2.8, 0, 0, Math.PI * 2); ctx.fill();
    const prism = (L, W, a, ox, oy) => {
      ctx.save(); ctx.translate(ox, oy); ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(-L, -W * 0.5); ctx.lineTo(L - W * 0.6, -W * 0.5); ctx.lineTo(L, 0);
      ctx.lineTo(L - W * 0.6, W * 0.5); ctx.lineTo(-L, W * 0.5); ctx.closePath();
      const g = ctx.createLinearGradient(0, -W / 2, 0, W / 2);
      g.addColorStop(0, '#fbf4ff'); g.addColorStop(0.45, '#e2d0ee'); g.addColorStop(1, '#a88cc0');
      ctx.fillStyle = g; ctx.fill();
      if (lod > 1) {
        ctx.strokeStyle = 'rgba(90,60,120,0.55)'; ctx.lineWidth = 0.35; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.45;
        ctx.beginPath(); ctx.moveTo(-L + 0.6, -W * 0.18); ctx.lineTo(L - W, -W * 0.18); ctx.stroke();
        // striations along the cleavage
        ctx.strokeStyle = 'rgba(150,120,180,0.5)'; ctx.lineWidth = 0.25;
        ctx.beginPath(); ctx.moveTo(-L + 1, W * 0.22); ctx.lineTo(L - W, W * 0.22); ctx.stroke();
      }
      ctx.restore();
    };
    prism(4.2, 2.3, 0.15, 0, 0.8);
    prism(3.2, 1.9, -0.5 + seed * 0.4, -0.4, -1.2);
  },

  // Lithium carbonate, bagged: a white bulk bag seen from above, lifting
  // loops at the corners, filling spout in the middle, violet ID band.
  compound(t, lod, seed, part = 'all') {
    if (!_cB(part)) return;
    const s = 4.6;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.roundRect(-s + 0.8, -s + 1.3, s * 2, s * 2, 2.2); ctx.fill();
    const g = ctx.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#e6e2ee'); g.addColorStop(1, '#bdb6cc');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(-s, -s, s * 2, s * 2, 2.2); ctx.fill();
    // ID band across the bag
    ctx.fillStyle = '#9a6ae0';
    ctx.fillRect(-s, -0.7, s * 2, 1.4);
    if (lod > 1) {
      // woven texture, bulge shading, spout and loops
      ctx.strokeStyle = 'rgba(120,110,140,0.22)'; ctx.lineWidth = 0.3;
      for (let i = -s + 1.2; i < s; i += 1.2) { ctx.beginPath(); ctx.moveTo(i, -s + 0.4); ctx.lineTo(i, s - 0.4); ctx.stroke(); }
      ctx.fillStyle = '#d0cadb';
      ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#8a8298'; ctx.lineWidth = 0.4; ctx.stroke();
      ctx.fillStyle = '#6c3cc0';
      for (const [lx, ly] of [[-s, -s], [s, -s], [-s, s], [s, s]]) {
        ctx.beginPath(); ctx.arc(lx * 0.78, ly * 0.78, 1.1, 0, Math.PI * 2); ctx.fill();
      }
    }
  },

  // Fusion fuel: a cryogenic pellet cartridge — steel capsule, frosted
  // ends, a sight window where the frozen fuel glows.
  pellets(t, lod, seed, part = 'all') {
    const L = 5.4, W = 2.9;
    const p = 0.65 + 0.35 * Math.sin(t * 5 + seed * 11);
    if (lod > 1 && _cU(part)) {
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 9);
      g.addColorStop(0, `rgba(110,240,255,${(0.3 * p).toFixed(3)})`); g.addColorStop(1, 'rgba(110,240,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 9, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (_cB(part)) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.roundRect(-L + 0.8, -W + 1.2, L * 2, W * 2, W); ctx.fill();
    const g = ctx.createLinearGradient(0, -W, 0, W);
    g.addColorStop(0, '#6a747c'); g.addColorStop(0.4, '#eef4f8'); g.addColorStop(1, '#58626a');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(-L, -W, L * 2, W * 2, W); ctx.fill();
    // frosted caps
    ctx.fillStyle = 'rgba(225,245,255,0.85)';
    ctx.beginPath(); ctx.roundRect(-L, -W, 1.8, W * 2, [W, 0, 0, W]); ctx.fill();
    ctx.beginPath(); ctx.roundRect(L - 1.8, -W, 1.8, W * 2, [0, W, W, 0]); ctx.fill();
    // glowing window
    ctx.fillStyle = '#12303a';
    ctx.fillRect(-2.6, -1.1, 5.2, 2.2);
    }
    if (!_cO(part)) return;
    ctx.fillStyle = `rgba(120,245,255,${(0.6 + 0.4 * p).toFixed(3)})`;
    ctx.fillRect(-2.3, -0.8, 4.6, 1.6);
    if (lod > 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < 3; i++) ctx.fillRect(-1.8 + i * 1.6, -0.4, 0.6, 0.6);   // pellets
      ctx.fillStyle = 'rgba(40,50,60,0.6)';
      ctx.fillRect(-L + 1.8, -W, 0.4, W * 2); ctx.fillRect(L - 2.2, -W, 0.4, W * 2);
    }
  },

  // D-He3 fuel: the same cryogenic cartridge, banded in gold with a violet
  // window, so a D-He3 line reads apart from a D-T one at a glance.
  he3pellets(t, lod, seed, part = 'all') {
    const L = 5.4, W = 2.9;
    const p = 0.65 + 0.35 * Math.sin(t * 4 + seed * 11);
    if (lod > 1 && _cU(part)) {
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 9);
      g.addColorStop(0, `rgba(200,150,255,${(0.32 * p).toFixed(3)})`); g.addColorStop(1, 'rgba(200,150,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 9, 6.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (_cB(part)) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.roundRect(-L + 0.8, -W + 1.2, L * 2, W * 2, W); ctx.fill();
    const g = ctx.createLinearGradient(0, -W, 0, W);
    g.addColorStop(0, '#6c6878'); g.addColorStop(0.4, '#f2eef8'); g.addColorStop(1, '#5a5666');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(-L, -W, L * 2, W * 2, W); ctx.fill();
    // gold bands instead of frosted caps
    ctx.fillStyle = '#e8c060';
    ctx.fillRect(-L + 1.1, -W, 1.1, W * 2); ctx.fillRect(L - 2.2, -W, 1.1, W * 2);
    ctx.fillStyle = '#20142e';
    ctx.fillRect(-2.6, -1.1, 5.2, 2.2);
    }
    if (!_cO(part)) return;
    ctx.fillStyle = `rgba(205,155,255,${(0.6 + 0.4 * p).toFixed(3)})`;
    ctx.fillRect(-2.3, -0.8, 4.6, 1.6);
    if (lod > 1) {
      ctx.fillStyle = 'rgba(255,240,200,0.9)';
      for (let i = 0; i < 3; i++) ctx.fillRect(-1.8 + i * 1.6, -0.4, 0.6, 0.6);
    }
  },

  // Plutonium oxide in a sealed stainless storage can, seen from above:
  // bolted lid, radiation trefoil, and it runs warm.
  plutonium(t, lod, seed, part = 'all') {
    const r = 3.8;
    if (lod > 1 && _cU(part)) {
      const p = 0.6 + 0.4 * Math.sin(t * 1.7 + seed * 7);
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 7.5);
      g.addColorStop(0, `rgba(255,130,50,${(0.26 * p).toFixed(3)})`); g.addColorStop(1, 'rgba(255,130,50,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); ctx.fill();
    }
    if (!_cB(part)) return;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.arc(0.8, 1.2, r, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(-1.2, -1.2, 0.5, 0, 0, r);
    g.addColorStop(0, '#f2f5f7'); g.addColorStop(0.7, '#aab2b8'); g.addColorStop(1, '#6a7278');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ff7020'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.arc(0, 0, r - 0.6, 0, Math.PI * 2); ctx.stroke();
    if (lod > 1) {
      ctx.fillStyle = '#50585e';
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; ctx.fillRect(Math.cos(a) * (r - 1.6) - 0.3, Math.sin(a) * (r - 1.6) - 0.3, 0.6, 0.6); }
      ctx.fillStyle = '#ffd21a'; ctx.beginPath(); ctx.arc(0, 0, 1.35, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1a1208';
      for (let k = 0; k < 3; k++) {
        const a0 = -Math.PI / 2 + k * (2 * Math.PI / 3) - 0.5;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1.2, a0, a0 + 1.0); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#ffd21a'; ctx.beginPath(); ctx.arc(0, 0, 0.3, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = '#ff7020'; ctx.fillRect(-0.8, -0.8, 1.6, 1.6);
    }
  },

  // Recovered uranium oxide, drummed: a yellow steel drum from above, with
  // its rolling hoops, two bungs and a green "reprocessed" stencil dot.
  recovered(t, lod, seed, part = 'all') {
    if (!_cB(part)) return;
    const r = 3.9;
    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.beginPath(); ctx.arc(0.8, 1.2, r, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(-1.3, -1.3, 0.5, 0, 0, r);
    g.addColorStop(0, '#f4dc5a'); g.addColorStop(0.75, '#c8a820'); g.addColorStop(1, '#806a10');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(80,60,0,0.7)'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.arc(0, 0, r - 0.5, 0, Math.PI * 2); ctx.stroke();
    if (lod > 1) {
      ctx.beginPath(); ctx.arc(0, 0, r - 1.4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#5a4a08';
      ctx.beginPath(); ctx.arc(-1.3, -0.9, 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(1.5, 1.0, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,220,0.5)';
      ctx.fillRect(-2.4, -2.4, 1.2, 0.5);
    }
    ctx.fillStyle = '#58c040';
    ctx.beginPath(); ctx.arc(0.9, -1.3, 0.75, 0, Math.PI * 2); ctx.fill();
  },

  // Monazite sand, scooped: a low mound of honey-red heavy-mineral grains
  // with black ilmenite and white zircon specks, the way the beach sands lie.
  rareearth(t, lod, seed, part = 'all') {
    if (!_cB(part)) return;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(0.7, 1.2, 4.4, 3.1, 0, 0, Math.PI * 2); ctx.fill();
    _rockPath(seed, 7, 4.1, 9, 0.72);
    const g = ctx.createLinearGradient(-4, -3, 4, 3);
    g.addColorStop(0, '#e89a64'); g.addColorStop(0.5, '#b8603a'); g.addColorStop(1, '#6e3418');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(40,16,6,0.55)'; ctx.lineWidth = 0.4; ctx.stroke();
    if (lod > 1) {
      ctx.save(); _rockPath(seed, 7, 4.1, 9, 0.72); ctx.clip();
      for (let i = 0; i < 9; i++) {
        const gx = (_cr(seed, 70 + i) - 0.5) * 7, gy = (_cr(seed, 80 + i) - 0.5) * 5;
        ctx.fillStyle = i % 3 === 0 ? '#1a1410' : i % 3 === 1 ? '#f4ece0' : '#ffc890';
        ctx.fillRect(gx, gy, 0.7, 0.7);
      }
      ctx.restore();
    }
  },

  // Rare earth oxide, sacked: the leached concentrate is a pale lilac
  // powder (neodymium oxide's colour), shipped in a lined sack with an
  // orange band and a radiation-checked tag.
  oxide(t, lod, seed, part = 'all') {
    if (!_cB(part)) return;
    const s = 4.3;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.roundRect(-s + 0.8, -s + 1.3, s * 2, s * 2, 2.6); ctx.fill();
    const g = ctx.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, '#f6f0ff'); g.addColorStop(0.6, '#d8cce8'); g.addColorStop(1, '#a898c0');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(-s, -s, s * 2, s * 2, 2.6); ctx.fill();
    ctx.fillStyle = '#e07a40';
    ctx.fillRect(-s, -0.7, s * 2, 1.4);
    if (lod > 1) {
      // tied neck, crease shading and the checked tag
      ctx.strokeStyle = 'rgba(110,90,140,0.3)'; ctx.lineWidth = 0.35;
      ctx.beginPath(); ctx.moveTo(-s + 1, -s + 1.4); ctx.lineTo(s - 1.2, s - 1); ctx.stroke();
      ctx.fillStyle = '#b8a8d0';
      ctx.beginPath(); ctx.arc(0, -s + 1.3, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffe040'; ctx.fillRect(s - 2.4, s - 2.4, 1.6, 1.2);
    }
  },

  // HTS tape on its spool, seen from above: a flat reel of thin gold-brown
  // tape (the REBCO layer under a copper-silver stabiliser) on a dark hub.
  tape(t, lod, seed, part = 'all') {
    if (!_cB(part)) return;
    const r = 4.2;
    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.beginPath(); ctx.arc(0.8, 1.2, r, 0, Math.PI * 2); ctx.fill();
    const g = ctx.createRadialGradient(-1.2, -1.2, 0.4, 0, 0, r);
    g.addColorStop(0, '#f0d8a0'); g.addColorStop(0.6, '#c8a060'); g.addColorStop(1, '#7a5a28');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    if (lod > 1) {
      ctx.strokeStyle = 'rgba(90,60,20,0.45)'; ctx.lineWidth = 0.3;
      for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.arc(0, 0, r * (0.42 + k * 0.14), 0, Math.PI * 2); ctx.stroke(); }
    }
    ctx.fillStyle = '#2a2430'; ctx.beginPath(); ctx.arc(0, 0, r * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9fd8ff'; ctx.beginPath(); ctx.arc(0, 0, 0.6, 0, Math.PI * 2); ctx.fill();
  },

  // Metallurgical coke, fresh off the wharf: nothing like the coal it was.
  // Where coal is black, angular and glassy, coke is knobbly and rounded,
  // a dull silver-grey with a metallic sheen, riddled with gas pores and
  // split by shrinkage fissures. About one lump in four still carries a
  // live coal deep in a pore, glowing through the quench.
  coke(t, lod, seed, part = 'all') {
    const ember = _cr(seed, 90) > 0.74;
    const ex = (_cr(seed, 91) - 0.5) * 2.4, ey = (_cr(seed, 92) - 0.5) * 1.8;
    const glow = 0.55 + 0.3 * Math.sin(t * 3.1 + seed * 17) + 0.15 * Math.sin(t * 7.3 + seed * 5);
    if (ember && lod > 1 && _cU(part)) {
      const g = ctx.createRadialGradient(ex, ey, 0.2, ex, ey, 5.5);
      g.addColorStop(0, `rgba(255,130,40,${(0.38 * glow).toFixed(3)})`); g.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ex, ey, 5.5, 0, Math.PI * 2); ctx.fill();
    }
    if (_cB(part)) {
      const lumps = _cr(seed, 1) > 0.5 ? [[0, 0, 3.9], [2.7 + _cr(seed, 2), 1.4, 2.5]] : [[0, 0, 4.2]];
      for (let k = 0; k < lumps.length; k++) {
        const [ox, oy, r] = lumps[k];
        ctx.save(); ctx.translate(ox, oy);
        // knobbly outline: many corners, gently rounded
        const path = () => {
          ctx.beginPath();
          const n = 11;
          for (let i = 0; i <= n; i++) {
            const a = (i / n) * Math.PI * 2;
            const rr = r * (0.8 + _cr(seed, 100 + k * 20 + (i % n)) * 0.28);
            const px = Math.cos(a) * rr, py = Math.sin(a) * rr * 0.86;
            i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.closePath();
        };
        ctx.fillStyle = 'rgba(0,0,0,0.38)';
        ctx.save(); ctx.translate(0.8, 1.2); path(); ctx.fill(); ctx.restore();
        path();
        const g = ctx.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.1, 0, 0, r * 1.1);
        g.addColorStop(0, '#c4c8cc'); g.addColorStop(0.45, '#7c8086'); g.addColorStop(1, '#34363a');
        ctx.fillStyle = g; ctx.fill();
        ctx.strokeStyle = 'rgba(20,20,24,0.65)'; ctx.lineWidth = 0.4; ctx.stroke();
        ctx.save(); path(); ctx.clip();
        // gas pores: the honeycomb that makes coke strong and light
        const pores = lod > 1 ? 9 : 4;
        for (let i = 0; i < pores; i++) {
          const a = _cr(seed, 140 + k * 15 + i) * Math.PI * 2, d = Math.sqrt(_cr(seed, 160 + k * 15 + i)) * r * 0.8;
          const pr = 0.35 + _cr(seed, 180 + i) * 0.45;
          const px = Math.cos(a) * d, py = Math.sin(a) * d * 0.86;
          ctx.fillStyle = 'rgba(14,14,18,0.8)'; ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
          if (lod > 1) { ctx.fillStyle = 'rgba(230,234,240,0.35)'; ctx.beginPath(); ctx.arc(px - pr * 0.35, py - pr * 0.4, pr * 0.35, 0, Math.PI * 2); ctx.fill(); }
        }
        if (lod > 1) {
          // a shrinkage fissure, and the silvery sheen on the lit shoulder
          ctx.strokeStyle = 'rgba(16,16,20,0.75)'; ctx.lineWidth = 0.45;
          ctx.beginPath(); ctx.moveTo(-r * 0.7, r * 0.2); ctx.lineTo(-r * 0.1, -r * 0.05); ctx.lineTo(r * 0.25, r * 0.35); ctx.lineTo(r * 0.75, r * 0.15); ctx.stroke();
          ctx.fillStyle = 'rgba(240,244,250,0.4)';
          ctx.beginPath(); ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.38, r * 0.16, -0.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        ctx.restore();
      }
    }
    if (ember && lod > 1 && _cO(part)) {
      ctx.fillStyle = `rgba(255,${(150 + 60 * glow) | 0},60,${(0.7 + 0.3 * glow).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(ex, ey, 0.75, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,240,180,${(0.6 * glow).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(ex, ey, 0.35, 0, Math.PI * 2); ctx.fill();
    }
  },

  // Nuclear graphite, machined: a hexagonal reflector block seen end-on,
  // with the bore down its middle. Graphite is slick and metallic in a way
  // coke never is, so it reads by its sheen: a near-black body, a hard
  // silver highlight across the lit faces, crisp machined edges. A light
  // sweeps across it now and then as it rides.
  graphite(t, lod, seed, part = 'all') {
    const r = 4.5;
    const hex = (rr) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i*Math.PI/3; const x = Math.cos(a)*rr, y = Math.sin(a)*rr; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.closePath(); };
    if (_cB(part)) {
      ctx.save(); ctx.translate(0.8, 1.3); hex(r); ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fill(); ctx.restore();
      hex(r);
      const g = ctx.createLinearGradient(-r, -r, r, r);
      g.addColorStop(0, '#8a909a'); g.addColorStop(0.3, '#3e424a'); g.addColorStop(0.7, '#24262c'); g.addColorStop(1, '#141518');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = '#0a0a0c'; ctx.lineWidth = 0.45; ctx.stroke();
      // the three lit facets of the chamfered end
      ctx.fillStyle = 'rgba(200,206,216,0.22)';
      ctx.beginPath(); ctx.moveTo(Math.cos(Math.PI*4/3)*r, Math.sin(Math.PI*4/3)*r); ctx.lineTo(Math.cos(Math.PI*5/3)*r, Math.sin(Math.PI*5/3)*r);
      ctx.lineTo(Math.cos(Math.PI*5/3)*r*0.62, Math.sin(Math.PI*5/3)*r*0.62); ctx.lineTo(Math.cos(Math.PI*4/3)*r*0.62, Math.sin(Math.PI*4/3)*r*0.62); ctx.closePath(); ctx.fill();
      hex(r*0.62); ctx.strokeStyle = 'rgba(150,156,166,0.35)'; ctx.lineWidth = 0.35; ctx.stroke();
      // the bore
      ctx.fillStyle = '#060607'; ctx.beginPath(); ctx.arc(0, 0, r*0.24, 0, Math.PI*2); ctx.fill();
      if (lod > 1) {
        ctx.strokeStyle = 'rgba(190,196,206,0.5)'; ctx.lineWidth = 0.3; ctx.beginPath(); ctx.arc(0, 0, r*0.24, Math.PI*1.05, Math.PI*1.75); ctx.stroke();
        // hard silver edge where the light catches the top face
        ctx.strokeStyle = 'rgba(235,240,248,0.85)'; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(Math.cos(Math.PI*4/3)*r*0.96, Math.sin(Math.PI*4/3)*r*0.96); ctx.lineTo(Math.cos(Math.PI*5/3)*r*0.96, Math.sin(Math.PI*5/3)*r*0.96); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fillRect(-r*0.3, -r*0.78, 0.8, 0.8);
      }
    }
    // a glint sliding across the slick face
    if (lod > 1 && _cO(part)) {
      const f = ((t*0.35 + seed*3.7) % 2.2) - 0.6;
      if (f > -0.4 && f < 1.4) {
        ctx.save(); hex(r); ctx.clip();
        const x = -r + f*r*2;
        const gl = ctx.createLinearGradient(x - 1.6, 0, x + 1.6, 0);
        gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, 'rgba(225,232,245,0.45)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gl; ctx.save(); ctx.rotate(-0.5); ctx.fillRect(x - 1.6, -r*1.5, 3.2, r*3); ctx.restore();
        ctx.restore();
      }
    }
  },

  rods(t, lod, seed, part = 'all')  { _drawAssembly('fresh', t, lod, seed, part); },
  mox(t, lod, seed, part = 'all')   { _drawAssembly('mox', t, lod, seed, part); },
  spent(t, lod, seed, part = 'all') { _drawAssembly('spent', t, lod, seed, part); },
};

// A fuel assembly lying on the belt: a long square bundle of clad rods held
// by spacer grids, a bottom nozzle at the tail and a top nozzle with its
// hold-down springs at the head.
//   fresh — bright zircaloy, clean grids
//   mox   — the same, amber-coded grids and nozzles, and it runs warm (the
//           plutonium makes fresh MOX far hotter than fresh uranium fuel)
//   spent — cladding bronzed with oxide and crud, and a haze of decay heat
function _drawAssembly(v, t, lod, seed, part = 'all') {
  const L = 8.6, W = 2.9;        // half length / half width
  const spent = v === 'spent', mox = v === 'mox';
  if (lod > 1 && (spent || mox) && _cU(part)) {
    const p = 0.6 + 0.4 * Math.sin(t * (spent ? 1.3 : 2.6) + seed * 5);
    const col = spent ? '255,120,40' : '255,185,70';
    const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 11);
    g.addColorStop(0, `rgba(${col},${((spent ? 0.2 : 0.26) * p).toFixed(3)})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 12, 7, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (_cB(part)) {
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(-L + 0.8, -W + 1.3, L * 2, W * 2);

  // rod bundle
  const g = ctx.createLinearGradient(0, -W, 0, W);
  if (spent)    { g.addColorStop(0, '#4a3e30'); g.addColorStop(0.45, '#9a8058'); g.addColorStop(1, '#3a3026'); }
  else if (mox) { g.addColorStop(0, '#7a7466'); g.addColorStop(0.45, '#f6eedc'); g.addColorStop(1, '#6a6456'); }
  else          { g.addColorStop(0, '#727c80'); g.addColorStop(0.45, '#f0f5f6'); g.addColorStop(1, '#646e72'); }
  ctx.fillStyle = g;
  ctx.fillRect(-L + 1.6, -W, L * 2 - 3.4, W * 2);
  if (lod > 1) {
    // individual rods
    ctx.fillStyle = spent ? 'rgba(20,12,4,0.45)' : 'rgba(40,50,56,0.35)';
    for (let i = 1; i < 5; i++) ctx.fillRect(-L + 1.6, -W + i * (W * 2 / 5) - 0.18, L * 2 - 3.4, 0.36);
    if (spent) {
      // crud streaks
      ctx.fillStyle = 'rgba(120,60,20,0.55)';
      for (let i = 0; i < 3; i++) ctx.fillRect(-L + 3 + _cr(seed, i) * (L * 2 - 7), -W + _cr(seed, 5 + i) * W * 2 - 0.3, 1.6, 0.6);
    }
  }
  // spacer grids
  const gridCol = spent ? '#6a5a44' : mox ? '#ffc24a' : '#dfe6e8';
  for (let i = 0; i < 4; i++) {
    const gx = -L + 3 + i * ((L * 2 - 6) / 3);
    ctx.fillStyle = gridCol;
    ctx.fillRect(gx - 0.5, -W - 0.2, 1, W * 2 + 0.4);
    if (lod > 1) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(gx + 0.5, -W - 0.2, 0.25, W * 2 + 0.4); }
  }
  // bottom nozzle (tail) and top nozzle (head)
  const noz = spent ? '#4a4238' : '#7c868c';
  ctx.fillStyle = noz;
  ctx.fillRect(-L, -W + 0.3, 1.8, W * 2 - 0.6);
  ctx.fillRect(L - 1.9, -W, 1.9, W * 2);
  if (lod > 1) {
    ctx.fillStyle = spent ? '#2a241c' : '#4a5258';
    ctx.fillRect(L - 1.4, -W + 0.6, 0.9, W * 2 - 1.2);           // top nozzle bore
    ctx.fillStyle = spent ? '#8a7a60' : mox ? '#ff8a30' : '#c8d0d4';
    for (let i = 0; i < 2; i++) ctx.fillRect(L - 1.7, -W + 0.5 + i * (W * 2 - 1.6), 1.5, 0.6);   // hold-down springs
  }
  if (mox) {
    // Pu marking on the head
    ctx.fillStyle = '#e0601a';
    ctx.fillRect(L - 1.9, -0.5, 1.9, 1.0);
  }
  }
  if (lod > 1 && _cO(part)) {
    if (!spent) {
      // light running along the cladding
      const sweep = ((t * (mox ? 0.9 : 1.2) + seed) % 1) * (L * 2 + 6) - L - 3;
      const sg = ctx.createLinearGradient(sweep - 2.5, 0, sweep + 2.5, 0);
      const c = mox ? '255,220,140' : '200,255,220';
      sg.addColorStop(0, `rgba(${c},0)`); sg.addColorStop(0.5, `rgba(${c},0.55)`); sg.addColorStop(1, `rgba(${c},0)`);
      ctx.save();
      ctx.beginPath(); ctx.rect(-L + 1.6, -W, L * 2 - 3.4, W * 2); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = sg; ctx.fillRect(sweep - 2.5, -W, 5, W * 2);
      ctx.restore();
    } else {
      // decay heat shimmering off it
      for (let k = 0; k < 3; k++) {
        const p = (t * 0.6 + k / 3 + seed) % 1;
        const mx = (k - 1) * 4 + Math.sin(t * 3 + k) * 0.7, my = -W - p * 5;
        ctx.fillStyle = `rgba(255,170,90,${(0.45 * (1 - p)).toFixed(3)})`;
        ctx.fillRect(mx, my, 0.8, 1.2);
      }
    }
  }
}
