/* ═══════════════════════════════════════════════════════════════════
   GROUND TEXTURES
   Pre-baked, tileable CanvasPattern textures used by the background
   ground layer (grass micro-detail) and water surface (animated
   caustics). Built once at load onto small offscreen canvases — a
   pattern fill costs the same as a flat fillRect regardless of how much
   detail is baked into the tile, so this is the cheap way to add real
   texture to large redraw areas without per-tile draw-call overhead.
   Loaded before render_core.js / render_world_civic.js, which consume
   GroundTextures.grassPatternA/B and GroundTextures.causticPatternA/B.
   ═══════════════════════════════════════════════════════════════════ */

const GroundTextures = (() => {
  // Deterministic-enough PRNG for the one-time bake — doesn't need to be
  // reproducible across sessions, just needs to run once.
  function _mkRng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  // ── Grass speckle patterns ─────────────────────────────────────────
  // Short angled blade dashes + tiny highlight/shadow flecks. Every mark is
  // kept well inside a margin from the canvas edge so a single tile repeats
  // with no visible seam — but a SINGLE repeating tile is still an obvious
  // stamp once it's covering enough ground to show more than one repeat
  // (a fixed 3x3-tile-ish block visibly identical to its neighbours). Same
  // fix as the water caustics: build two tiles at different sizes/seeds/
  // blade density and layer both, one of them rotated. The combined result
  // only repeats at the two periods' lowest common multiple — thousands of
  // world px, far past anything visible on screen at once — so it reads as
  // continuous variation instead of a stamped grid.
  function _buildGrassPattern(seed, size, margin, bladeCount, aoCount, hiCount) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const rng = _mkRng(seed);

    const light = 'rgba(172,214,110,';
    const mid   = 'rgba(88,136,58,';
    const dark  = 'rgba(18,36,12,';

    g.lineCap = 'round';

    // Blade dashes
    for (let i = 0; i < bladeCount; i++) {
      const x = margin + rng() * (size - margin * 2);
      const y = margin + rng() * (size - margin * 2);
      const len = 3.5 + rng() * 7;
      const ang = -Math.PI / 2 + (rng() - 0.5) * 1.1; // mostly upright, some lean
      const tone = rng();
      const style = tone > 0.6 ? light : tone > 0.25 ? mid : dark;
      const alpha = 0.5 + rng() * 0.4;
      g.strokeStyle = style + alpha.toFixed(2) + ')';
      g.lineWidth = 1.1 + rng() * 0.9;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }

    // Tiny AO flecks (grounding shadow dots)
    g.fillStyle = 'rgba(8,16,5,0.4)';
    for (let i = 0; i < aoCount; i++) {
      const x = margin + rng() * (size - margin * 2);
      const y = margin + rng() * (size - margin * 2);
      const r = 0.7 + rng() * 1.3;
      g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); g.fill();
    }

    // Tiny highlight flecks (dew / sun glint)
    g.fillStyle = 'rgba(220,242,185,0.38)';
    for (let i = 0; i < hiCount; i++) {
      const x = margin + rng() * (size - margin * 2);
      const y = margin + rng() * (size - margin * 2);
      const r = 0.5 + rng() * 1;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }

    return g.createPattern(c, 'repeat');
  }

  // ── Ground-cover variety patterns ──────────────────────────────────
  // Unlike grassPatternA/B (applied everywhere), these are only filled
  // inside noise-masked patch shapes (see the ground-cover pass in
  // render_core.js), so different parts of the map carry visibly
  // different surface texture instead of one uniform blade speckle.

  // Clover / low broadleaf cover — clusters of tiny round leaflets.
  function _buildCloverPattern(seed, size, margin, clumpCount) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const rng = _mkRng(seed);
    for (let i = 0; i < clumpCount; i++) {
      const x = margin + rng() * (size - margin * 2);
      const y = margin + rng() * (size - margin * 2);
      const leaves = 3 + Math.floor(rng() * 2);
      const rot = rng() * Math.PI * 2;
      const lr = 1.6 + rng() * 1.2;
      const tone = rng();
      // Shadow under the clump grounds it
      g.fillStyle = 'rgba(6,16,6,0.35)';
      g.beginPath(); g.arc(x + 0.8, y + 1, lr * 1.9, 0, Math.PI * 2); g.fill();
      g.fillStyle = tone > 0.5 ? 'rgba(74,122,52,0.8)' : 'rgba(50,96,40,0.8)';
      for (let k = 0; k < leaves; k++) {
        const a = rot + k * Math.PI * 2 / leaves;
        g.beginPath(); g.arc(x + Math.cos(a) * lr, y + Math.sin(a) * lr, lr, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(140,184,104,0.35)';
      g.beginPath(); g.arc(x - lr * 0.4, y - lr * 0.4, lr * 0.6, 0, Math.PI * 2); g.fill();
    }
    return g.createPattern(c, 'repeat');
  }

  // Dry straw / sun-bleached tall grass — longer, thinner, paler strokes
  // with a consistent wind lean so dry patches read as a different plant,
  // not just a colour tint.
  function _buildStrawPattern(seed, size, margin, strokeCount) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const rng = _mkRng(seed);
    g.lineCap = 'round';
    for (let i = 0; i < strokeCount; i++) {
      const x = margin + rng() * (size - margin * 2);
      const y = margin + rng() * (size - margin * 2);
      const len = 4.5 + rng() * 6;
      const ang = -Math.PI / 2 + 0.45 + (rng() - 0.5) * 0.6;
      const tone = rng();
      g.strokeStyle = tone > 0.55 ? `rgba(196,178,110,${(0.45 + rng() * 0.3).toFixed(2)})`
                    : tone > 0.2  ? `rgba(142,128,72,${(0.45 + rng() * 0.3).toFixed(2)})`
                                  : `rgba(52,44,22,${(0.4 + rng() * 0.25).toFixed(2)})`;
      g.lineWidth = 0.8 + rng() * 0.7;
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 - 1.5, y + Math.sin(ang) * len * 0.5,
                         x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      g.stroke();
    }
    return g.createPattern(c, 'repeat');
  }

  // ── Wildflower sprites ─────────────────────────────────────────────
  // Tiny pre-baked flowers (petals + centre + a couple of leaves + soft
  // shadow) for the meadow clusters in render_core.js. Baked at 2x the
  // size they're drawn at so they stay crisp when zoomed in; each species
  // gets two variants with different baked rotation/leaf layout so a
  // cluster doesn't show identical stamps side by side.
  const FLOWER_SPRITE_SIZE = 28;
  const _FLOWER_SPECIES = [
    // daisy: many slim white petals, yellow eye
    { petals: 8, len: 5.2, wid: 1.9, petal: '#ecebdc', edge: 'rgba(150,146,120,0.6)', eye: '#e2b53a', eyeR: 2.2 },
    // buttercup: five round glossy yellow petals
    { petals: 5, len: 3.8, wid: 3.0, petal: '#e8c23c', edge: 'rgba(150,110,20,0.6)', eye: '#b8781c', eyeR: 1.6 },
    // violet: five purple petals, pale eye
    { petals: 5, len: 4.2, wid: 2.7, petal: '#9a74c8', edge: 'rgba(70,44,110,0.6)', eye: '#f1e6a8', eyeR: 1.4 },
    // wild rose / pink: five broad pink petals, gold eye
    { petals: 5, len: 4.4, wid: 3.2, petal: '#dc8a9c', edge: 'rgba(130,56,74,0.6)', eye: '#e8c35a', eyeR: 1.7 },
  ];

  function _buildFlowerSprite(sp, seed) {
    const S = FLOWER_SPRITE_SIZE;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    const rng = _mkRng(seed);
    const cx = S / 2, cy = S / 2;

    // Leaves peeking out from under the bloom
    const leafCount = 2 + Math.floor(rng() * 2);
    for (let i = 0; i < leafCount; i++) {
      const a = rng() * Math.PI * 2;
      g.save();
      g.translate(cx + Math.cos(a) * 5.5, cy + Math.sin(a) * 5.5);
      g.rotate(a);
      g.fillStyle = rng() > 0.5 ? 'rgba(52,96,38,0.95)' : 'rgba(38,78,30,0.95)';
      g.beginPath(); g.ellipse(0, 0, 4.2, 1.8, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    // Soft shadow under the bloom
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath(); g.arc(cx + 1, cy + 1.3, sp.len + 1.2, 0, Math.PI * 2); g.fill();

    // Petals
    const rot = rng() * Math.PI * 2;
    g.lineWidth = 0.6;
    g.strokeStyle = sp.edge;
    for (let i = 0; i < sp.petals; i++) {
      const a = rot + i * Math.PI * 2 / sp.petals;
      g.save();
      g.translate(cx + Math.cos(a) * sp.len * 0.55, cy + Math.sin(a) * sp.len * 0.55);
      g.rotate(a);
      g.fillStyle = sp.petal;
      g.beginPath(); g.ellipse(0, 0, sp.len * 0.6, sp.wid * 0.5, 0, 0, Math.PI * 2);
      g.fill(); g.stroke();
      g.restore();
    }
    // Highlight wash on the upper-left petals
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.beginPath(); g.arc(cx - 1.4, cy - 1.4, sp.len * 0.7, 0, Math.PI * 2); g.fill();

    // Eye
    g.fillStyle = sp.eye;
    g.beginPath(); g.arc(cx, cy, sp.eyeR, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.arc(cx + 0.5, cy + 0.5, sp.eyeR * 0.55, 0, Math.PI * 2); g.fill();
    return c;
  }

  // flowerSprites[species][variant]
  const flowerSprites = _FLOWER_SPECIES.map((sp, i) =>
    [0, 1].map(v => _buildFlowerSprite(sp, 0xF10 + i * 97 + v * 13)));

  // ── Meadow filler sprites ──────────────────────────────────────────
  // Mixed in among the wildflowers so meadows aren't wall-to-wall blooms:
  // leafy weeds/seedlings, small pebble clusters, and worn dirt patches.
  // Same canvas size and 2x bake as the flowers.

  // Leafy plant: a rosette of pointed leaves with a midrib highlight.
  function _buildPlantSprite(seed) {
    const S = FLOWER_SPRITE_SIZE;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    const rng = _mkRng(seed);
    const cx = S / 2, cy = S / 2;
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.arc(cx + 1, cy + 1.3, 6.5, 0, Math.PI * 2); g.fill();
    const leaves = 5 + Math.floor(rng() * 4);
    const rot = rng() * Math.PI * 2;
    for (let i = 0; i < leaves; i++) {
      const a = rot + i * Math.PI * 2 / leaves + (rng() - 0.5) * 0.4;
      const len = 6 + rng() * 5;
      const w = 1.8 + rng() * 1.2;
      g.save();
      g.translate(cx, cy);
      g.rotate(a);
      const tone = rng();
      g.fillStyle = tone > 0.6 ? '#5f9a3e' : tone > 0.25 ? '#477f32' : '#356628';
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(len * 0.5, -w, len, 0);
      g.quadraticCurveTo(len * 0.5, w, 0, 0);
      g.fill();
      g.strokeStyle = 'rgba(170,210,120,0.45)';
      g.lineWidth = 0.5;
      g.beginPath(); g.moveTo(1, 0); g.lineTo(len * 0.85, 0); g.stroke();
      g.restore();
    }
    return c;
  }

  // Pebbles: 2–4 small grey-brown stones with a top-left highlight.
  function _buildPebbleSprite(seed) {
    const S = FLOWER_SPRITE_SIZE;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    const rng = _mkRng(seed);
    const n = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const x = S / 2 + (rng() - 0.5) * 12, y = S / 2 + (rng() - 0.5) * 12;
      const rx = 1.8 + rng() * 2.6, ry = rx * (0.6 + rng() * 0.3), ang = rng() * Math.PI;
      const tone = 96 + Math.floor(rng() * 50);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath(); g.ellipse(x + 0.8, y + 1, rx, ry, ang, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgb(${tone},${tone - 6},${tone - 16})`;
      g.beginPath(); g.ellipse(x, y, rx, ry, ang, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,240,0.25)';
      g.beginPath(); g.ellipse(x - rx * 0.3, y - ry * 0.3, rx * 0.45, ry * 0.4, ang, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  // Dirt patch: soft-edged irregular bare-earth blotch with a few specks.
  function _buildDirtSprite(seed) {
    const S = FLOWER_SPRITE_SIZE;
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    const rng = _mkRng(seed);
    for (let i = 0; i < 5; i++) {
      const x = S / 2 + (rng() - 0.5) * 8, y = S / 2 + (rng() - 0.5) * 8;
      const r = 4 + rng() * 5;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0,   'rgba(92,70,44,0.7)');
      grad.addColorStop(0.6, 'rgba(84,64,40,0.45)');
      grad.addColorStop(1,   'rgba(84,64,40,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 10; i++) {
      const x = S / 2 + (rng() - 0.5) * 12, y = S / 2 + (rng() - 0.5) * 12;
      g.fillStyle = rng() > 0.5 ? 'rgba(140,116,82,0.6)' : 'rgba(40,30,20,0.5)';
      g.beginPath(); g.arc(x, y, 0.5 + rng() * 0.7, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  const plantSprites  = [0, 1, 2].map(v => _buildPlantSprite(0x9A1 + v * 31));
  const pebbleSprites = [0, 1].map(v => _buildPebbleSprite(0x7EB + v * 17));
  const dirtSprites   = [0, 1].map(v => _buildDirtSprite(0xD17 + v * 23));

  // ── Water caustic patterns ─────────────────────────────────────────
  // Soft blurred light dapples — animated by translating each pattern's
  // own matrix over time (see renderWater in render_world_civic.js),
  // rather than redrawing anything per tile or per frame.
  //
  // A single repeating tile reads as an obvious stamped grid once you can
  // see more than one repeat on screen, no matter how organic the tile
  // itself looks in isolation. Building two tiles at different sizes/blob
  // counts/seeds and compositing both (offset, drifting at different
  // speeds, one rotated) means their periodicities essentially never
  // align — the classic two-layer-scrolling-noise trick for hiding
  // tiling. Cost is still just one extra fillRect per water tile per
  // frame (see renderWater), not per-blob work.
  function _buildCausticPattern(seed, size, margin, blobCount, rMin, rMax) {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const rng = _mkRng(seed);

    for (let i = 0; i < blobCount; i++) {
      const x = margin + rng() * (size - margin * 2);
      const y = margin + rng() * (size - margin * 2);
      const r = rMin + rng() * (rMax - rMin);
      const squash = 0.55 + rng() * 0.75; // irregular ellipses read less "stamped" than uniform circles
      const rot = rng() * Math.PI;
      const a = 0.1 + rng() * 0.18;
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      g.scale(1, squash);
      // Gradient is defined in the post-transform local space (origin at
      // the blob centre) since the translate/rotate/scale above already
      // moved the coordinate system there.
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
      grad.addColorStop(0,   `rgba(195,232,255,${a.toFixed(2)})`);
      grad.addColorStop(0.55,`rgba(150,210,255,${(a * 0.45).toFixed(2)})`);
      grad.addColorStop(1,   'rgba(150,210,255,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    return g.createPattern(c, 'repeat');
  }

  // ── Photo-real grass tiles (Blender-rendered, optional) ────────────
  // Rendered top-down in Blender with a wrap-tiled particle scatter (each
  // tile's point set is joined with 8 tile-offset copies before instancing,
  // so blades crossing one edge have an identical twin completing them from
  // the opposite edge — genuinely seamless, not just cropped-and-hoped).
  // Loaded async into separate photoPatternA/B properties and layered ON
  // TOP of the procedural patterns below (not swapped in place of them) —
  // the procedural dashes give crisp, zoom-independent base texture, the
  // photo layer adds a subtler wash of extra depth. Flip this flag to skip
  // loading/drawing the photo layer entirely and use procedural-only.
  const USE_PHOTO_GRASS_TEXTURE = false; // TEMP perf experiment — see SIMPLE_GROUND_MODE in render_core.js

  // Source PNGs are rendered at 320/228px native. A too-aggressive shrink
  // (was 0.2x, from an earlier much-higher-res source) blurred the fine
  // blade detail into a flat wash; 0.4x is a much gentler minification that
  // keeps individual blade clumps readable while still landing well under
  // tree size (~128/91px repeat period, matching the original procedural
  // tiles' scale).
  const PHOTO_GRASS_SCALE = 0.4;

  function _loadImagePattern(url, rotationDeg, onReady) {
    const img = new Image();
    img.onload = () => {
      const pattern = document.createElement('canvas').getContext('2d').createPattern(img, 'repeat');
      let m = new DOMMatrix().scale(PHOTO_GRASS_SCALE);
      if (rotationDeg) m = new DOMMatrix().rotate(rotationDeg).scale(PHOTO_GRASS_SCALE);
      pattern.setTransform(m);
      onReady(pattern);
    };
    img.src = url;
  }

  const grassPatternA = _buildGrassPattern(0xA17E,   128, 10, 85, 20, 16);
  const grassPatternB = _buildGrassPattern(0x9E6C41,  91,  9, 60, 14, 11);
  // Rotate B a fixed, non-right-angle amount so its grid never lines up
  // with A's even where the two periods happen to coincide. This is a
  // one-time STATIC transform (never re-set after load), so unlike the
  // caustic patterns below there's no per-frame wrap to get wrong.
  grassPatternB.setTransform(new DOMMatrix().rotate(37));

  const cloverPattern = _buildCloverPattern(0xC10E4, 113, 6, 70);
  const strawPattern  = _buildStrawPattern(0x5724A, 97, 12, 110);
  strawPattern.setTransform(new DOMMatrix().rotate(-11));

  const api = { grassPatternA, grassPatternB, cloverPattern, strawPattern, flowerSprites, plantSprites, pebbleSprites, dirtSprites, photoGrassPatternA: null, photoGrassPatternB: null };

  if (USE_PHOTO_GRASS_TEXTURE) {
    _loadImagePattern('img/grass_tile_a.png', 0,  p => { api.photoGrassPatternA = p; });
    _loadImagePattern('img/grass_tile_b.png', 37, p => { api.photoGrassPatternB = p; });
  }

  // Three layers (not two) at mutually-awkward sizes — a 2-layer combo can
  // still show faint beat patterns where the two periods nearly coincide;
  // a third, differently-sized layer breaks those up too. Bigger tiles
  // with more, smaller, softer blobs than the original version so a single
  // tile also looks busier/less obviously "stamped" in isolation.
  const causticPatternA = _buildCausticPattern(0xC0FFEE,   211, 26, 7, 11, 24);
  const causticPatternB = _buildCausticPattern(0x51DE5EED, 149, 22, 6, 9,  20);
  const causticPatternC = _buildCausticPattern(0x8BADF00D, 173, 24, 6, 10, 22);

  return Object.assign(api, { causticPatternA, causticPatternB, causticPatternC });
})();
