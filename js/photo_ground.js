/* ═══════════════════════════════════════════════════════════════════
   PHOTO GROUND
   Photo-scanned ground for the deposits, in place of flat painted fills:
   Poly Haven textures (CC0; the 2K originals live in "blender stuff/
   textures", the game carries 512 px copies as img/ground_*.jpg) laid
   down as repeating patterns in world space, so neighbouring draws line up
   and the texture never swims as the camera moves.

   patch() builds a deposit's whole ground once — an outer texture (the
   rim), an inner one fading in over it, darkening toward the middle, all
   cut to the patch's ragged outline with a soft, blurred edge — and keeps
   it, at a fraction of world resolution, so a ground-cache rebake only
   blits it. version() changes as textures finish loading, so the ground
   cache is rebaked with them (render_main_loop.js key, via DepositGround).
   ═══════════════════════════════════════════════════════════════════ */
const PhotoGround = (() => {
  const TEX = 512;                 // px a side of every img/ground_*.jpg
  const RES = 1;                   // patch canvases, px per world px (a photo needs its detail)...
  const MAX_PX = 1100;             // ...up to this many px across, for the biggest patches
  const _imgs = new Map();
  let _loaded = 0;

  // Load an image, retrying if it fails: on a patchy phone connection one
  // dropped download left that deposit on its plain painted stand-in for the
  // rest of the session. Tries again after 2, 4, 8 ... s (8 tries in all).
  function _load(im, src, onload) {
    let tries = 0;
    im.onload = onload;
    im.onerror = () => {
      if (++tries >= 8) return;
      setTimeout(() => { im.src = src + (src.includes('?') ? '&' : '?') + 'r=' + tries; }, 1000 * 2 ** tries);
    };
    im.src = src;
  }

  function img(name) {
    let im = _imgs.get(name);
    if (!im) {
      im = new Image();
      _load(im, `img/${name}.jpg`, () => { _loaded++; });
      _imgs.set(name, im);
    }
    return im.complete && im.naturalWidth ? im : null;
  }
  // A repeating pattern of `name` on context `g`, `span` world px across
  // one repeat, anchored to the world origin. Kept per context, so a sprite
  // drawn every frame doesn't make a new one each time.
  const _pats = new WeakMap();
  function pattern(g, name, span) {
    const im = img(name);
    if (!im) return null;
    let m = _pats.get(g);
    if (!m) { m = new Map(); _pats.set(g, m); }
    const key = name + '@' + span;
    let p = m.get(key);
    if (!p) {
      p = g.createPattern(im, 'repeat');
      p.setTransform(new DOMMatrix().scale(span / TEX));
      m.set(key, p);
    }
    return p;
  }

  // Rendered rocks (img/<prefix>_1..4.png from scripts/render_rocks.py: the
  // rock spans 1/1.4 of the frame, shadow baked in), picked by u in 0..1;
  // null while they load.
  const _sets = new Map();
  let _spritesLoaded = 0;
  function sprite(prefix, u) {
    let set = _sets.get(prefix);
    if (!set) {
      set = [1, 2, 3, 4].map(n => { const im = new Image(); _load(im, `img/${prefix}_${n}.png`, () => { _spritesLoaded++; }); return im; });
      _sets.set(prefix, set);
    }
    const im = set[Math.min(set.length - 1, Math.floor(u * set.length))];
    return im.complete && im.naturalWidth ? im : null;
  }

  const _patches = new Map();
  // spec: { key, cx, cy, R, outline: (scale) => Path2D, rim, inner, span,
  //         innerFrom, innerTo (fractions of R where the inner texture is
  //         full / gone), shade (0..1 darkening at the middle), edge (blur
  //         as a fraction of R), tone (rgba laid over all, optional) }
  // Returns { cv, x, y, size } in world px, or null until textures load.
  function patch(spec) {
    let p = _patches.get(spec.key);
    if (p) return p;
    const rimP = img(spec.rim), innerP = spec.inner ? img(spec.inner) : rimP;
    if (!rimP || !innerP) return null;
    const size = spec.R * 2.5, x = spec.cx - size / 2, y = spec.cy - size / 2;
    const px = Math.max(16, Math.min(MAX_PX, Math.ceil(size * RES)));
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = px; return c; };
    const toWorld = g => { g.scale(px / size, px / size); g.translate(-x, -y); };

    // 1. The rim texture over everything.
    const cv = mk(), g = cv.getContext('2d');
    toWorld(g);
    g.fillStyle = pattern(g, spec.rim, spec.span);
    g.fillRect(x, y, size, size);

    // 2. The inner texture, faded out toward the rim.
    if (spec.inner && spec.inner !== spec.rim) {
      const ic = mk(), ig = ic.getContext('2d');
      toWorld(ig);
      ig.fillStyle = pattern(ig, spec.inner, spec.span);
      ig.fillRect(x, y, size, size);
      ig.globalCompositeOperation = 'destination-in';
      const gr = ig.createRadialGradient(spec.cx, spec.cy, spec.R * spec.innerFrom, spec.cx, spec.cy, spec.R * spec.innerTo);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ig.fillStyle = gr;
      ig.fillRect(x, y, size, size);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(ic, 0, 0);
      toWorld(g);
    }

    // 3. Tone and darkening toward the middle.
    if (spec.tone) { g.fillStyle = spec.tone; g.fillRect(x, y, size, size); }
    if (spec.shade > 0) {
      const sg = g.createRadialGradient(spec.cx, spec.cy, 0, spec.cx, spec.cy, spec.R * 0.9);
      sg.addColorStop(0, `rgba(8,6,4,${spec.shade})`); sg.addColorStop(1, 'rgba(8,6,4,0)');
      g.fillStyle = sg; g.fillRect(x, y, size, size);
    }

    // 4. Cut to the ragged outline, faded out over a wide band
    // (featherMask), so the ground thins into the grass rather than ending
    // on a line. No blur filter: canvas filters cost seconds on some phones.
    const mc = featherMask(spec.outline, x, y, size, spec.R, spec.R * Math.min(spec.edge, 0.06));
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.imageSmoothingEnabled = true;
    blit(g, mc, 0, 0, px, px);
    g.globalCompositeOperation = 'source-over';

    p = { cv, x, y, size, mask: mc };   // mask: fades what a bake lays over the photo the same way
    _patches.set(spec.key, p);
    return p;
  }

  // A patch's shape as a soft-edged mask, opaque over the patch and clear
  // outside, for cutting it out of the seasons' grass washes and
  // wildflowers (FrostSystem.render). Low resolution, kept per key.
  const _holes = new Map();
  function hole(key, f, outline) {
    let m = _holes.get(key);
    if (m) return m;
    const size = f.R * 2.6, x = f.cx - size / 2, y = f.cy - size / 2;
    m = { cv: featherMask(outline, x, y, size, f.R, f.R * 0.06), x, y, size };   // the patch's own fade
    _holes.set(key, m);
    return m;
  }

  // A patch outline as a mask that is opaque inside FEATHER_IN of the
  // outline's size and fades to clear by FEATHER_OUT: the ragged shape
  // filled at FEATHER_N steps between the two, each adding 1/N alpha
  // ('lighter' sums them), then blurred a little more by drawing it at one
  // pixel per `soft` world px (as softMask). Ragged outlines reach 1.18x,
  // so FEATHER_OUT keeps inside a patch's 2.5R square.
  const FEATHER_IN = 0.78, FEATHER_OUT = 1.04, FEATHER_N = 10;
  function featherMask(outline, x, y, size, R, soft) {
    const px = Math.max(8, Math.min(256, Math.ceil(size / Math.max(1, soft))));
    const c = document.createElement('canvas'); c.width = c.height = px + 2;   // + the clear border, see blit
    const g = c.getContext('2d');
    g.translate(1, 1); g.scale(px / size, px / size); g.translate(-x, -y);
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = `rgba(0,0,0,${1 / FEATHER_N})`;
    for (let i = 0; i < FEATHER_N; i++) g.fill(outline(FEATHER_IN + (FEATHER_OUT - FEATHER_IN) * i / (FEATHER_N - 1)));
    return c;
  }

  // A filled path as a soft-edged mask: drawn small (one pixel per `soft`
  // world px) so that scaling it up blurs its edge by about that much.
  // Used instead of ctx.filter blur, which some phones run on the CPU over
  // a whole canvas-sized layer per draw: seconds, every ground re-bake.
  function softMask(path, x, y, size, soft) {
    const px = Math.max(8, Math.min(256, Math.ceil(size / Math.max(1, soft))));
    const c = document.createElement('canvas'); c.width = c.height = px + 2;   // + the clear border, see blit
    const g = c.getContext('2d');
    g.translate(1, 1); g.scale(px / size, px / size); g.translate(-x, -y);
    g.fillStyle = '#000';
    g.fill(path);
    return c;
  }

  // Soft-edged drawing kept per key: draw(g) paints in world coordinates
  // onto a small canvas over (x, y, size), one pixel per `soft` world px;
  // drawn back scaled up, its edges come out blurred by about `soft`.
  // For the deposits' faint stains, baked once instead of blurred with a
  // canvas filter on every ground re-bake.
  const _soft = new Map();

  // Draws a canvas made by softMask / soft (or any canvas with a 1 px clear
  // border) without that border, scaled to (dx, dy, dw, dh). The border is
  // what the scaling samples past the picture's edge: Chrome on Android
  // keeps a small canvas in a bigger GPU texture and, upscaling it, read the
  // texture's leftover padding along the right and bottom edges, so a
  // deposit's photo ground showed a hard straight line along two sides of
  // its square (and the seasons' washes a cut-out one round its hole).
  function blit(g, c, dx, dy, dw, dh) {
    g.drawImage(c, 1, 1, c.width - 2, c.height - 2, dx, dy, dw, dh);
  }
  function soft(key, x, y, size, softPx, draw) {
    let c = _soft.get(key);
    if (!c) {
      const px = Math.max(8, Math.min(512, Math.ceil(size / Math.max(1, softPx))));
      c = document.createElement('canvas'); c.width = c.height = px + 2;   // + the clear border, see blit
      const g = c.getContext('2d');
      g.translate(1, 1); g.scale(px / size, px / size); g.translate(-x, -y);
      draw(g);
      _soft.set(key, c);
    }
    return c;
  }

  // A sprite with a CSS filter applied once, kept: drawing through
  // ctx.filter onto the big ground canvas costs a full-canvas pass per draw
  // on some phones (75 rocks round a coal seam = a multi-second freeze on
  // every re-bake). The filtered copy is turned back into an Image: a canvas
  // as a drawImage source is several times slower than an image (measured
  // ~120 µs against ~12 µs a rock). Until it has decoded the plain sprite
  // is returned, and its arrival bumps version() so the ground re-bakes.
  // Browsers without canvas filters get the plain sprite.
  const _filtered = new WeakMap();
  function filtered(im, filter) {
    if (!im || !filter) return im;
    let m = _filtered.get(im);
    if (!m) { m = new Map(); _filtered.set(im, m); }
    let out = m.get(filter);
    if (!out) {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth || im.width; c.height = im.naturalHeight || im.height;
      const g = c.getContext('2d');
      g.filter = filter;
      g.drawImage(im, 0, 0);
      try {
        out = new Image();
        out.onload = () => { _spritesLoaded++; };
        out.src = c.toDataURL();
      } catch (_e) {
        // The game opened straight from its folder (file://): every image is
        // "cross-origin" there, so the canvas can't be exported. Use the
        // canvas itself — slower to draw, but it works (an uncaught throw
        // here, mid-render, blacked out the whole world).
        out = c; out._ready = true;
      }
      m.set(filter, out);
    }
    return out._ready || (out.complete && out.naturalWidth) ? out : im;
  }

  // Drop a patch once its owner has baked it into something of its own.
  function forget(key) { _patches.delete(key); }

  return {
    img, pattern, patch, sprite, hole, soft, blit, filtered, forget,
    SPRITE_FRAME: 1.4,
    version: () => _loaded + ':' + _spritesLoaded,
  };
})();
