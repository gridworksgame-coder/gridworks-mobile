/* ═══════════════════════════════════════════════════════════════════
   RENDER CORE
   Canvas/context setup, camera-independent draw helpers, ghost preview
   renderer, background layer painter, and the RenderSystem namespace
   shell. Loaded before all other render_*.js files.
   ═══════════════════════════════════════════════════════════════════ */

const RenderSystem = {};

// TEMP perf experiment: strip all grass texture (noise base, procedural
// blade patterns, photo PNG layers, clutter doodads) down to one flat
// fill, to isolate how much of the zoom/pan lag is the grass rendering
// itself vs. everything else. Revert by setting this back to false.
const SIMPLE_GROUND_MODE = false;

// Base grass colour is a pure function of tile coordinates (noise sampled
// from c,r only) — it never depends on darkness, zoom, or camera position.
// A darkness-only cache rebuild (the dawn/dusk step, which fires up to
// ~50 times over a lighting transition — see the 0.02 quantisation note in
// render_main_loop.js) was re-running the full noise sampling + colour
// composition for every tile in the margin just to end up with the exact
// same bucket it computed last time. Caching the quantised bucket key per
// tile forever (bounded by COLS*ROWS, populated lazily as tiles are drawn)
// turns every redraw after a tile's first render into a plain lookup —
// the actual noise math never re-runs for that tile again.
const _grassBucketCache = new Map(); // tile key (c*10000+r) -> "qR,qG,qB"
// Same idea for the ground-cover patch masks (clover / straw / wildflower
// meadow strengths) — pure functions of c,r, so sample the noise once.
const _groundCoverCache = new Map(); // tile key -> [clover, straw, flower] each 0..1

// ── Geothermal barren ground ───────────────────────────────────────
// A discovered geothermal deposit sits in a patch of dead, rocky ground
// rather than straight in the grass — the heat and mineral crust kill off
// vegetation well beyond the vent itself. Radius is 8–20 tiles, fixed per
// deposit from its own coordinates so it never changes between redraws.
//
// This is a background-layer effect, baked into the same cached bitmap as
// the grass, so it costs nothing per frame. The cache is keyed partly on
// GeoField.version() (see render_main_loop.js) so a fresh survey repaints
// the ground instead of leaving the new deposits sitting on green.
const GeoField = (() => {
  const MIN_R = 8, MAX_R = 20;
  const NV    = 18;               // outline vertices — enough to read ragged

  const _hash = (c, r, n) => {
    const x = Math.sin(c * 127.1 + r * 311.7 + n * 74.3) * 43758.5453;
    return x - Math.floor(x);
  };

  // Cached per-deposit geometry. Deposits never move, so this is computed
  // once each and reused for the life of the session.
  const _cache = new Map();

  function fieldFor(e) {
    const key = e.col * 10000 + e.row;
    let f = _cache.get(key);
    if (!f) {
      const cx = (e.col + (e.width  || 2) / 2) * TILE;
      const cy = (e.row + (e.height || 2) / 2) * TILE;
      const R  = (MIN_R + _hash(e.col, e.row, 1) * (MAX_R - MIN_R)) * TILE;
      // Ragged outline: per-vertex radius noise, same trick the deposit
      // sprite's crater rim uses, so patch and crater look related.
      const jit = [];
      for (let i = 0; i < NV; i++) jit.push(0.72 + _hash(e.col, e.row, 10 + i) * 0.46);
      f = { cx, cy, R, jit };
      _cache.set(key, f);
    }
    return f;
  }

  function pathFor(f, scale) {
    // Curves through the vertex midpoints: a ragged but smooth outline
    // instead of a visible 18-sided polygon.
    const p = new Path2D();
    const pts = [];
    for (let i = 0; i < NV; i++) {
      const a = (i / NV) * Math.PI * 2;
      const rr = f.R * f.jit[i] * scale;
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

  return {
    MAX_R,
    // Background-cache key for the barren patches. This hashes the actual set
    // of deposit positions, not just how many there are: a count alone misses
    // any change that swaps one deposit for another (a reload, a dev respawn,
    // a survey that replaces cleared ground), leaving stale patches baked at
    // the old coordinates while the new deposits sit on untouched grass.
    // Deposit counts are in the dozens, so the sum runs once per frame for
    // nothing measurable.
    version() {
      if (typeof EntityRegistry === 'undefined' || typeof T === 'undefined') return 0;
      let v = 0;
      for (const e of EntityRegistry.getByType(T.GEODEPOSIT)) {
        v = (v + e.col * 73856093 + e.row * 19349663) | 0;
      }
      return v;
    },

    // Every deposit whose patch could touch the given tile rect.
    visible(cStart, cEnd, rStart, rEnd) {
      const out = [];
      if (typeof EntityRegistry === 'undefined') return out;
      for (const e of EntityRegistry.getByType(T.GEODEPOSIT)) {
        if (e.col + (e.width || 2) + MAX_R < cStart || e.col - MAX_R > cEnd) continue;
        if (e.row + (e.height || 2) + MAX_R < rStart || e.row - MAX_R > rEnd) continue;
        out.push(e);
      }
      return out;
    },

    // Is this tile inside any patch? Used to keep grass clutter (flowers,
    // leaf litter) off dead ground.
    covers(fields, c, r) {
      const x = (c + 0.5) * TILE, y = (r + 0.5) * TILE;
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const dx = x - f.cx, dy = y - f.cy;
        const d = Math.hypot(dx, dy);
        if (d > f.R * 1.2) continue;
        // Compare against the ragged outline at this angle, not the max radius
        const a = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
        const idx = Math.round(a / (Math.PI * 2) * NV) % NV;
        if (d <= f.R * f.jit[idx]) return true;
      }
      return false;
    },

    fieldFor, pathFor, hash: _hash,
  };
})();

// Blender-rendered top-down ground clutter sprites (see the "Ground
// clutter" block below). Rendered square with a fixed camera margin around
// each object's own bbox, so the visible silhouette only fills part of the
// frame — this constant scales the display size back up so the actual rock/
// flower reads at the intended size, with transparent padding beyond it.
const _CLUTTER_IMG_MARGIN = 1.35;
const _clutterRockSprite = new Image();
_clutterRockSprite.loaded = false;
_clutterRockSprite.onload = () => { _clutterRockSprite.loaded = true; };
_clutterRockSprite.src = 'img/clutter_rock_a.png';
// Order matches the original procedural _flowerColors palette (pale/mauve/yellow/blue).
const _clutterFlowerSprites = ['a', 'b', 'c', 'd'].map(k => {
  const img = new Image();
  img.loaded = false;
  img.onload = () => { img.loaded = true; };
  img.src = `img/clutter_flower_${k}.png`;
  return img;
});

// Raw mouse screen position — updated by mousemove, used for cursor lantern
  let _cursorScreenX = -9999, _cursorScreenY = -9999;

// Cursor flashlight. Toggled with F (View + X on a controller) and
// remembered between sessions.
let _lanternOn = true;
try { _lanternOn = localStorage.getItem('gw_flashlight') !== '0'; } catch (_e) {}
function setFlashlight(on) {
  _lanternOn = !!on;
  try { localStorage.setItem('gw_flashlight', _lanternOn ? '1' : '0'); } catch (_e) {}
}

window.addEventListener('mousemove', e => { _cursorScreenX = e.clientX; _cursorScreenY = e.clientY; }, { passive: true });

window.addEventListener('keydown', e => {
  if (e.key !== 'f' && e.key !== 'F') return;
  if (e.target?.matches?.('input, textarea') || e.target?.isContentEditable) return;  // typing a city name
  setFlashlight(!_lanternOn);
});

// Scale 1×1 sprite renderers up to multi-tile footprints
  function dispatchScaledRender(e, px, py, t, fn) {
    if ((e.width > 1 || e.height > 1) && (e.col * TILE !== px || e.row * TILE !== py)) return;
    const sx = e.width || 1, sy = e.height || 1;
    if (sx === 1 && sy === 1) { fn(e, px, py, t); return; }
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(sx, sy);
    fn(e, 0, 0, t);
    ctx.restore();
  }

function dispatchScaledRenderGhost(e, px, py, t, fn) {
    const sx = e.width || 1, sy = e.height || 1;
    if (sx === 1 && sy === 1) { fn(e, px, py, t); return; }
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(sx, sy);
    // Multi-tile render functions early-return unless called at their own
    // anchor tile (e.col*TILE === px) — a guard against double-drawing when
    // the main loop calls them once per occupied tile. Here fn is always
    // called at local (0,0) after the translate above, so temporarily zero
    // the entity's col/row to satisfy that guard regardless of where the
    // ghost is actually being dragged to.
    const _col = e.col, _row = e.row;
    e.col = 0; e.row = 0;
    fn(e, 0, 0, t);
    e.col = _col; e.row = _row;
    ctx.restore();
  }

// Like dispatchScaledRenderGhost, but for render functions that already
// compute their own multi-tile pixel size internally (e.g. `TILE * e.width`)
// rather than being authored in 1×1 units for ctx.scale to stretch. Applying
// ctx.scale(sx, sy) on top of that would double the footprint, so this just
// satisfies the anchor-tile guard and lets fn size itself.
function dispatchFootprintRenderGhost(e, px, py, t, fn) {
    ctx.save();
    ctx.translate(px, py);
    const _col = e.col, _row = e.row;
    e.col = 0; e.row = 0;
    fn(e, 0, 0, t);
    e.col = _col; e.row = _row;
    ctx.restore();
  }

const canvas = document.getElementById('canvas');

// `let`, not `const`: every render_* function draws through this shared
// binding, and the building sprite cache (render_main_loop.js) points it at
// an offscreen canvas for the duration of one building's draw. Only the
// sprite cache may reassign it, and it always puts it back.
let ctx = canvas.getContext('2d');

// ── Resolution scale ───────────────────────────────────────────────
// How many real device pixels the world is rasterised into, as a
// fraction of the canvas element's CSS size. Every other file goes on
// working in CSS ("logical") pixels: the base transform of the main
// context is scale(RENDER_SCALE) rather than identity (see
// Camera.applyTransform / Camera.resetTransform), so a frame authored
// at 1920 logical px lands on 960 device px at 0.5 and the browser
// stretches the finished bitmap back over the full-size element.
//
// Why this helps where the quality levels don't: those stop *issuing*
// draw calls, but the calls that remain still fill a full-screen
// surface. On integrated graphics the bottleneck is fill rate — the GPU
// rasterising thousands of anti-aliased paths over 1920x1080 — so
// halving the surface nearly halves the cost of the whole frame no
// matter how much is on screen. The background cache is scaled with it
// (its three margin-sized canvases are by far the largest backing store
// the game holds), which cuts its rebuild cost and its memory footprint
// with the square of the scale.
const RENDER_SCALE_KEY = 'gw_render_scale';
const RENDER_SCALES    = [1, 0.85, 0.75, 0.6, 0.5];
let RENDER_SCALE = 1;
try {
  const _rs = parseFloat(localStorage.getItem(RENDER_SCALE_KEY));
  if (RENDER_SCALES.includes(_rs)) RENDER_SCALE = _rs;
} catch (_) {}

/* ── Static / animated sprite split ──────────────────────────────────
   A building sprite is mostly masonry that never moves, plus a handful of
   lit panes, turning vents and blinking lamps that do. Drawn as one pass,
   the whole sprite has to be re-issued every frame for the sake of those
   few parts — which is what makes a screenful of buildings unaffordable
   (see the cost note on BuildingSpriteCache in render_main_loop.js).

   A renderer that opts in draws in three passes instead, selected by the
   phase below:

     'under'  — what belongs beneath the building: its ground glow. Drawn
                live, before the cached bitmap is blitted over it.
     'static' — the masonry. Baked into the bitmap once, and redrawn only
                when the entity's own state changes it (RenderSplit spec's
                key()), not on a timer.
     'over'   — only the moving parts, drawn live on top of the bitmap
                every frame.

   'all' runs every pass in one go, which is what any caller that hasn't
   opted into the split gets: placement ghosts, blueprint previews, and
   High graphics quality, where sprites are never cached at all.

   The rules a split renderer has to follow, in order for the three passes
   to compose back into exactly the single-pass image:

     • Every element is drawn exactly ONCE across the three passes. Never
       draw the same thing in two of them: compositing an antialiased edge
       twice darkens it, and compositing a translucent fill twice doubles
       it, so a "bake it and repeat it live" element does not come back
       pixel-identical.
     • An animated element goes in 'over'.
     • Any static element that OVERLAPS an animated one and is drawn after
       it MOVES to 'over' as well, keeping its original order there. That
       can pull a small amount of masonry into the live pass, which is
       fine; what it must not do is cascade. Where it would — where the
       thing on top is something large like the building body — leave the
       element underneath static instead and accept that it is frozen.
     • Everything else is 'static'.

   compose(under, bitmap, over) is pixel-compared against a plain 'all'
   render in the dev console to check a conversion — see RenderSplit.verify.  */
const SplitPhase = {
  cur: 'all',
  wantUnder()  { return this.cur === 'under'  || this.cur === 'all'; },
  wantStatic() { return this.cur === 'static' || this.cur === 'all'; },
  wantOver()   { return this.cur === 'over'   || this.cur === 'all'; },
  // Run fn with only one pass enabled, always restoring the phase.
  run(phase, fn) {
    const prev = this.cur;
    this.cur = phase;
    try { fn(); } finally { this.cur = prev; }
  },
};

// Entity types with a static/animated split authored for them. Registered
// from the render_* file that owns the renderer; read by the sprite cache.
const RenderSplit = {
  _byType: new Map(),
  register(type, spec) { this._byType.set(type, spec); },
  // The spec for this entity, or null when it has no split (or one that
  // doesn't cover this particular subtype yet — conversion is per subtype,
  // and anything unconverted simply keeps the old all-in-one behaviour).
  for(e) {
    const spec = this._byType.get(e.type);
    return spec && (!spec.applies || spec.applies(e)) ? spec : null;
  },
};

const RenderScale = {
  get()     { return RENDER_SCALE; },
  options() { return RENDER_SCALES.slice(); },
  label(v)  { return Math.round((v === undefined ? RENDER_SCALE : v) * 100) + '%'; },
  // Applies immediately: every cached bitmap in the renderer was
  // rasterised at the old scale, so they all have to go.
  set(v) {
    const n = RENDER_SCALES.includes(v) ? v : 1;
    if (n === RENDER_SCALE) return RENDER_SCALE;
    RENDER_SCALE = n;
    try { localStorage.setItem(RENDER_SCALE_KEY, String(n)); } catch (_) {}
    resize();   // re-sizes the canvas + background caches and drops them
    if (typeof BuildingSpriteCache !== 'undefined') BuildingSpriteCache.clear();
    return RENDER_SCALE;
  },
};

// ── Cached radial "glow halo" gradients (perf) ──────────────────────
// The most common per-entity gradient idiom across every render_*.js file
// is: pulsing-alpha radial gradient centered on the entity, faded to
// transparent, filled as a circle at the same center/radius. Every visible
// instance of every powered building was recreating its own CanvasGradient
// object for this every single frame, even though — for a given entity
// type/tier — the radius and color stops never change, only globalAlpha
// (which is applied at fill time, not baked into the gradient) and the
// entity's position.
//
// CanvasGradient coordinates are interpreted in whatever transform is
// active at FILL time, not baked in at creation time (verified: a gradient
// created under one transform renders correctly filled under a different
// one later) — so a gradient built once with local coordinates centered on
// the origin can be translated to any entity's position and reused
// indefinitely, across frames and regardless of camera pan/zoom. This
// cache keys on radius + color stops (the only things that actually vary
// between distinct calls) so every entity type/tier gets its own gradient
// object built once and reused by every instance and every frame after.
const _glowHaloCache = new Map();
function drawGlowHalo(cx, cy, r, stops, alpha) {
  let key = r;
  for (let i = 0; i < stops.length; i++) key += '|' + stops[i][0] + ':' + stops[i][1];
  let g = _glowHaloCache.get(key);
  if (!g) {
    g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    _glowHaloCache.set(key, g);
  }
  ctx.save();
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.translate(cx, cy);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Background layer cache (Step 1 perf optimisation) ──────────────
  // Ground noise texture + zone cobblestone overlay are static between
  // camera moves / zoom changes / zone edits / day-night transitions —
  // they were previously recomputed and redrawn from scratch every frame
  // at 60fps regardless. Cache the rendered result to an offscreen canvas
  // and only redraw it when something that actually affects it changes;
  // otherwise just blit the cached bitmap. No visual or gameplay change.
  //
  // The cache is rendered BG_MARGIN screen-px larger than the viewport on
  // every side. While panning, we just blit the existing bitmap at an
  // offset (cheap) until the viewport would scroll outside the margin —
  // only then do we pay for a full noise/cobblestone re-render. Previously
  // ANY camera movement (even 1px) invalidated the cache every frame,
  // which is what made panning so much more expensive than sitting still.
  //
  // 480 -> 800: fast dragging/flinging the camera has no speed cap (see
  // Camera.panByScreen), so a quick drag gesture could move the viewport
  // by several hundred px in a single frame and immediately bust a
  // smaller margin — forcing a redraw on nearly every frame of a fast
  // pan. A bigger margin absorbs that before it needs to pay for one.
  // `let`, not `const`: this is the single biggest consumer of canvas backing
  // store in the game. At 1080p a margin of 800 makes each of the three bg
  // canvases 3520x2680 (~37.7MB) — 4.5x the screen area. Browsers drop 2D
  // canvases out of GPU acceleration under memory pressure and fall back to
  // software rasterisation, which is the leading suspect for the laptop's
  // "script time is fine but the screen shows 4fps" profile. Tunable at
  // runtime via RenderSystem.setBgMargin() so it can be A/B'd on the machine
  // that actually reproduces the problem.
  let BG_MARGIN = 800; // screen px of slack in each direction before re-render
  // Two canvases, ping-ponged: `bgCache` is the currently-displayed bitmap,
  // `bgScratch` is where incremental work happens (strip scrolls, time-sliced
  // rebuild jobs). Swapped via _bgSwap() when scratch is complete.
  let bgCache = document.createElement('canvas');

let bgCtx   = bgCache.getContext('2d');

let bgScratch    = document.createElement('canvas');

let bgScratchCtx = bgScratch.getContext('2d');

// Cross-fade snapshot: when a full rebuild (bgJobStep) swaps in a new
// bitmap — most commonly the grass-density LOD settling to a new zoom
// level — the old bitmap used to vanish in a single frame, reading as an
// obvious "pop" in blade/tuft density. Instead we snapshot the outgoing
// bitmap (plus the world anchor/zoom it was baked at) just before the
// swap, then blit it fading out on top of the new one for BG_FADE_MS —
// same stretch math as the mid-zoom preview blit, so it stays aligned
// even if the zoom changed underneath it.
const BG_FADE_MS = 220;
let bgFade = document.createElement('canvas');

let bgFadeCtx = bgFade.getContext('2d');

let _bgFadeActive = false;
let _bgFadeStart = 0;
let _bgFadeLeft, _bgFadeTop, _bgFadeZoom;

// ── Day/night keyframes for the ground cache ─────────────────────────
// Darkness is baked into the ground bitmap in a dozen places (fade toward
// the sky, stone shading, grid colour), so any change of it means a full
// rebuild of a cache 4-5x the size of the screen: ~180ms of work at 1080p
// on a fast desktop, spread over frames in 5ms slices. It used to be
// quantised in 1/50 steps, which at dawn (1.0 -> 0.05 over 100 real
// seconds) asked for a rebuild every ~2s and at dusk every ~1s — and every
// new request restarted the rebuild in flight. On a laptop, where one takes
// longer than that, dawn and dusk were a solid run of rebuilds that never
// finished: 5ms spent every frame, and the ground not visibly changing.
//
// Now the cache is only ever baked at one of eleven keyframes, and between
// two of them the ground is drawn as an exact blend of the two bitmaps (see
// the dark-lerp below) — continuous to the eye, ten rebuilds per transition
// instead of ~47, and each one allowed to finish. The two ends are exactly
// the values the old quantisation settled on at noon (0.06 — the 1/50 step
// nearest DayNight's 0.05 plateau) and at night (1.0), so the steady day
// and night ground is pixel-for-pixel what it was.
const BG_DARK_LO    = 0.06;
const BG_DARK_HI    = 1;
const BG_DARK_STEPS = 10;
const BG_DARK_STEP  = (BG_DARK_HI - BG_DARK_LO) / BG_DARK_STEPS;
let _bgLiveDarkPrev = null, _bgDarkDir = 0;

// The keyframe the cache should be baked at for live darkness d: the one d
// is heading TOWARD, so the next bitmap is ready by the time it's needed
// rather than a keyframe behind. On a keyframe exactly (the day and night
// plateaus, or a pause), that keyframe.
function bgDarkKeyframe(d) {
  if (_bgLiveDarkPrev !== null && Math.abs(d - _bgLiveDarkPrev) > 1e-9)
    _bgDarkDir = Math.sign(d - _bgLiveDarkPrev);
  _bgLiveDarkPrev = d;
  const i = (d - BG_DARK_LO) / BG_DARK_STEP;
  const ri = Math.round(i);
  let k = Math.abs(i - ri) < 1e-6 ? ri
        : _bgDarkDir < 0 ? Math.floor(i) : _bgDarkDir > 0 ? Math.ceil(i) : ri;
  k = Math.max(0, Math.min(BG_DARK_STEPS, k));
  return +(BG_DARK_LO + k * BG_DARK_STEP).toFixed(6);
}

// 'time': the short cross-fade after a zoom rebuild (bgFade holds the old
// bitmap with the sky baked in, faded out over BG_FADE_MS).
// 'dark': a keyframe-to-keyframe blend. bgFade holds the PREVIOUS keyframe's
// bitmap exactly as it was — translucent, no sky — and the two are mixed by
// how far live darkness has travelled from that keyframe to the new one.
let _bgFadeMode = 'time';
let _bgFadeFromDark = 0, _bgFadeToDark = 0;

// Where a dark blend is mixed each frame: the two bitmaps are ADDED here at
// weights (1-f) and f with 'lighter', which on the canvas's premultiplied
// colour is an exact linear blend — including alpha — so the mix can then be
// laid over the live sky just as a single cached layer would be. Drawing
// one translucent layer over the other would not be a blend at all.
// Viewport-sized, allocated only while a blend is running.
let bgMix = document.createElement('canvas');
let bgMixCtx = bgMix.getContext('2d');

function _bgStartDarkLerp(fromDark, toDark) {
  bgFade.width = bgCache.width;
  bgFade.height = bgCache.height;
  bgFadeCtx.setTransform(1, 0, 0, 1, 0, 0);
  bgFadeCtx.globalAlpha = 1;
  bgFadeCtx.globalCompositeOperation = 'source-over';
  bgFadeCtx.clearRect(0, 0, bgFade.width, bgFade.height);
  bgFadeCtx.drawImage(bgCache, 0, 0);
  _bgFadeLeft = _bgWorldLeft; _bgFadeTop = _bgWorldTop; _bgFadeZoom = _bgZoom;
  _bgFadeFromDark = fromDark; _bgFadeToDark = toDark;
  _bgFadeMode = 'dark';
  _bgFadeActive = true;
}

function _bgStartFade() {
  _bgFadeMode = 'time';
  bgFade.width = bgCache.width;
  bgFade.height = bgCache.height;
  bgFadeCtx.setTransform(1, 0, 0, 1, 0, 0);
  // The cache layer itself is only ~0.88 alpha (see drawStaticBackgroundLayer)
  // so it reads correctly when composited once over the sky. Snapshotting it
  // as-is and then compositing it *again* over an already-sky-composited new
  // frame stacks two translucent layers, which isn't a linear blend — it
  // briefly swaps out sky-bleed for extra grass colour and reads as a flash.
  // Baking the sky in here up front makes this a flat, fully-opaque bitmap,
  // so fading it out over the new frame is a clean, monotonic crossfade.
  bgFadeCtx.fillStyle = DayNight.skyColor();
  bgFadeCtx.fillRect(0, 0, bgFade.width, bgFade.height);
  bgFadeCtx.drawImage(bgCache, 0, 0);
  _bgFadeLeft = _bgWorldLeft; _bgFadeTop = _bgWorldTop; _bgFadeZoom = _bgZoom;
  _bgFadeStart = performance.now();
  _bgFadeActive = true;
}

function _bgSwap() {
    const c = bgCache, x = bgCtx;
    bgCache = bgScratch; bgCtx = bgScratchCtx;
    bgScratch = c; bgScratchCtx = x;
  }

// In-progress time-sliced background rebuild (see bgJobStart/bgJobStep at
// the bottom of this file). Non-null while a rebuild is being spread across
// frames; the stale bitmap keeps displaying until the job swaps in.
let _bgJob = null;

let _bgValid  = false;

let _bgWorldLeft, _bgWorldTop; // world-space coords the cache's pixel (0,0) represents
let _bgZoom, _bgDark, _bgZoneVer, _bgW, _bgH;

// Zoom-settle tracking (see render_main_loop.js) — lets rapid scroll-wheel
// zooming show a cheap stretched preview of the existing background
// bitmap instead of paying for a full noise/cobblestone re-render on
// every single frame of the zoom gesture.
let _lastLiveZoom = null;
let _zoomSettleAt = 0;

// Resize: always keep canvas buffer size == canvas CSS size.
  // Setting style.width = buffer width prevents stretching when
  // the window grows faster than the game loop can redraw.
  let _rafResize = null;

function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const rs = RENDER_SCALE;
    // Backing store in device px, CSS box always the full window — the
    // element stretches the smaller bitmap back up for free.
    canvas.width        = Math.max(1, Math.round(w * rs));
    canvas.height       = Math.max(1, Math.round(h * rs));
    canvas.style.width  = w + 'px';
    canvas.style.height = h + 'px';
    bgCache.width  = Math.max(1, Math.round((w + BG_MARGIN * 2) * rs));
    bgCache.height = Math.max(1, Math.round((h + BG_MARGIN * 2) * rs));
    bgScratch.width  = bgCache.width;
    bgScratch.height = bgCache.height;
    _bgJob   = null;  // any in-flight rebuild targets the old size — discard
    _bgValid = false; // size changed — force a redraw of the cache next frame
    _bgFadeActive = false; // stale anchor/size — drop any in-progress cross-fade
    _bgFadeRelease();
  }

  // The fade snapshot is only needed for BG_FADE_MS at a time, but once sized
  // it holds a full bgCache-sized buffer forever. Hand it back between fades.
  function _bgFadeRelease() {
    if (bgFade.width > 1) { bgFade.width = 0; bgFade.height = 0; }
    if (bgMix.width > 1)  { bgMix.width = 0;  bgMix.height = 0; }
  }

  function setBgMargin(px) {
    BG_MARGIN = Math.max(0, px | 0);
    resize();
    return BG_MARGIN;
  }

  function canvasMemoryMB() {
    const mb = (c) => (c.width * c.height * 4) / 1048576;
    return {
      bgMargin: BG_MARGIN,
      renderScale: RENDER_SCALE,
      bgCache: +mb(bgCache).toFixed(1),
      bgScratch: +mb(bgScratch).toFixed(1),
      bgFade: +mb(bgFade).toFixed(1),
      main: +mb(canvas).toFixed(1),
      total: +(mb(bgCache) + mb(bgScratch) + mb(bgFade) + mb(canvas)).toFixed(1),
    };
  }

function onResize() {
    // Immediate resize so CSS size never lags behind window size
    resize();
    // Also schedule one more resize on next frame in case devicePixelRatio changed
    if (_rafResize) cancelAnimationFrame(_rafResize);
    _rafResize = requestAnimationFrame(resize);
  }

resize();

window.addEventListener('resize', onResize);

// Perf diagnostics: tune the background cache margin and read back how much
// canvas backing store the renderer is holding. Console-driven on purpose —
// this is for A/B'ing on a machine that reproduces the lag, not a game option.
RenderSystem.setBgMargin = setBgMargin;
RenderSystem.renderScale = () => RENDER_SCALE;
RenderSystem.canvasMemoryMB = canvasMemoryMB;

// ── Draw helpers ─────────────────────────────────────────────
  function drawRoundRect(x, y, w, h, r, fill, stroke, strokeW = 1) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill)   { ctx.fillStyle   = fill;   ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = strokeW; ctx.stroke(); }
  }

let _wireHighlightNetId = -1;

// ── Ghost cursor (placement preview) ────────────────────────
  // Generic ghost: the object's real sprite, drawn through the same
  // renderEntityAt the map uses, from a preview entity cached per type +
  // facing (so its baked contact shadow isn't rebuilt every frame). Used for
  // types that used to draw a flat near-black block — or nothing at all.
  const _ghostStubs = new Map();
  function _ghostSprite(type, col, row, x, y, rotation) {
    const key = type + ':' + (rotation & 3);
    let e = _ghostStubs.get(key);
    if (!e) {
      try { e = new Entity(type, col, row); } catch (_) { return false; }
      if (e.def === EntityDefs[type]) e.def = { ...EntityDefs[type] };
      e._rotation = rotation & 3;
      e.powered = false;
      e._ghost = true;
      e._bpPreview = true;
      _ghostStubs.set(key, e);
    }
    e.col = col; e.row = row;
    try { renderEntityAt(e, x, y, 0); return true; }
    catch (_) {
      const d = EntityDefs[type] || {};
      ctx.fillStyle = d.glowColor || '#40c0ff';
      ctx.fillRect(x, y, (d.width || 1) * TILE, (d.height || 1) * TILE);
      return false;
    }
  }
  const _GENERIC_GHOST = new Set([T.SOLAR, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5, T.HOUSE, T.SOLAR2, T.SOLAR3,
                                  T.PUMPJACK, T.MK4RESEARCH, T.MK5RESEARCH, T.COALMINE2, T.POWERTOWER,
                                  T.LIGHTNINGROD, T.LIGHTNINGROD2, T.LIGHTNINGROD3,
                                  T.LAMP, T.CAMERA, T.POLE]);   // were stick-figure line drawings

  function renderGhost(col, row, type, canPlace, rotation = 0, shaftOrientation = 'h') {
    // The fishing rod draws itself (FishingSystem.renderWorld): no tile
    // ghost, no red "can't place" tint or night outline under it.
    if (type === T.FISHINGPOLE) return;
    if (!placementTurns(type)) rotation = 0;   // built one way round only (see tryPlace)
    if (!GridManager.inBounds(col, row)) return;
    const { x, y } = GridManager.tileToWorld(col, row);
    // Boost ghost visibility at night
    const _dark = DayNight.darkness();
    const _nightBoost = _dark * 0.4;
    const alpha = canPlace ? Math.min(0.85, 0.45 + _nightBoost) : Math.min(0.5, 0.18 + _nightBoost);

    ctx.save();
    ctx.globalAlpha = alpha;

    if (_GENERIC_GHOST.has(type)) {
      _ghostSprite(type, col, row, x, y, rotation);
    } else if (type === T.SUBSTATION) {
      const pad = 4;
      drawRoundRect(x+pad, y+pad, TILE*2-pad*2, TILE*2-pad*2, 4, '#060e18', null);
    } else if (type === T.SUBSTATION2) {
      const pad = 5;
      drawRoundRect(x+pad, y+pad, TILE*3-pad*2, TILE*3-pad*2, 6, '#070e20', null);
    } else if (type === T.SUBSTATION3) {
      const pad = 6;
      drawRoundRect(x+pad, y+pad, TILE*4-pad*2, TILE*4-pad*2, 8, '#060c24', null);
    } else if (type === T.SUBSTATION4) {
      const pad = 8;
      drawRoundRect(x+pad, y+pad, TILE*6-pad*2, TILE*6-pad*2, 12, '#070b18', null);
    } else if (type === T.SUBSTATION5) {
      const pad = 8;
      drawRoundRect(x+pad, y+pad, TILE*8-pad*2, TILE*8-pad*2, 16, '#0a0a12', null);
    } else if (type === T.TRUCK || type === T.HAULER) {
      const tw = TILE, th = TILE * 3;
      const pad = 3;
      const cabH = th / 3;
      ctx.save();
      ctx.translate(x + tw/2, y + th/2);
      ctx.rotate((rotation % 4) * Math.PI / 2);
      ctx.translate(-(x + tw/2), -(y + th/2));
      drawRoundRect(x+pad, y+pad, tw-pad*2, cabH-2, 4, '#3a6e28', null);
      ctx.fillStyle = 'rgba(160,220,255,0.5)';
      ctx.fillRect(x+pad+4, y+pad+4, tw-pad*2-8, cabH*0.38);
      const cargoTop = y + pad + cabH;
      const segH = (th - pad - cabH) / 3;
      for (let i = 0; i < 3; i++) {
        const sy = cargoTop + i * segH;
        ctx.fillStyle = i % 2 === 0 ? '#7a5030' : '#6e4828';
        ctx.beginPath(); ctx.roundRect(x+pad+1, sy+1, tw-pad*2-2, segH-2, 3); ctx.fill();
        if (i < 2) { ctx.fillStyle = '#221810'; ctx.fillRect(x+pad, sy+segH-1.5, tw-pad*2, 3); }
      }
      ctx.strokeStyle = '#80e040'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x+pad, y+pad, tw-pad*2, th-pad*2, 5); ctx.stroke();
      ctx.restore();
    } else if (type === T.PATHTOOL) {
      // Ghost: yellow dot at cursor tile centre
      const cx = x + TILE / 2, cy = y + TILE / 2;
      ctx.strokeStyle = '#f0c030'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(240,192,48,0.3)';
      ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
    } else if (type === T.FISHINGPOLE) {
      // Intentionally empty — the rod now follows the raw cursor position
      // rather than snapping to a tile, so all of its rendering (idle
      // preview, charge-direction line, cast throw, rope physics) lives
      // in FishingSystem.renderWorld(), called every frame regardless of
      // this tile-based ghost system.
    } else if (type === T.ROAD) {
      const pad = 3;
      const horizontal = (rotation % 2) === 1;
      drawRoundRect(x+pad, y+pad, TILE*6-pad*2, TILE*6-pad*2, 4, '#222222', null);
      ctx.strokeStyle = '#f0d030'; ctx.lineWidth = 2; ctx.setLineDash([6,4]);
      ctx.beginPath();
      if (!horizontal) {
        ctx.moveTo(x+TILE*3, y+pad+4); ctx.lineTo(x+TILE*3, y+TILE*6-pad-4);
      } else {
        ctx.moveTo(x+pad+4, y+TILE*3); ctx.lineTo(x+TILE*6-pad-4, y+TILE*3);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (type === T.BRIDGE) {
      // The real deck, so the ghost already shows how it will join the run:
      // every piece the click will lay, bank to bank (WaterBuild.bridgeRun).
      const _pcs = WaterBuild.bridgeRun(col, row, rotation).pieces;
      for (const p of _pcs)
        renderBridge({ col: p.col, row: p.row, width: 6, height: 6, _rotation: rotation % 2, _bridge: true },
                     x + (p.col - col) * TILE, y + (p.row - row) * TILE, performance.now() / 1000);
    } else if (type === T.HOUSE || type === T.SOLAR2 || type === T.WIND || type === T.WIND2 || type === T.WIND3 || type === T.MONITOR) {
      const def = EntityDefs[type];
      const fw  = (def?.width  || 1) * TILE;
      const fh  = (def?.height || 1) * TILE;
      const pad = 4;
      if (type === T.HOUSE) {
        drawRoundRect(x+pad, y+pad+8, fw-pad*2, fh-pad*2-8, 2, '#14100a', null);
        ctx.beginPath();
        ctx.moveTo(x+pad-1, y+pad+8); ctx.lineTo(x+fw/2, y+pad-1); ctx.lineTo(x+fw-pad+1, y+pad+8);
        ctx.closePath(); ctx.fillStyle = '#1e1800'; ctx.fill();
      } else if (type === T.SOLAR2) {
        drawRoundRect(x+pad, y+pad, fw-pad*2, fh-pad*2, 2, '#060e20', null);
      } else if (type === T.WIND) {
        // Real sprite at native size (the placed turbine goes through
        // _commNative, which lands on the same function).
        _renderWindMk1({ type, powered: false, width: def?.width || 2, height: def?.height || 2 }, x, y, fw, fh, 0);
      } else if (type === T.WIND2) {
        _renderWindMk2({ type, powered: false, width: def?.width || 3, height: def?.height || 3 }, x, y, fw, fh, 0);
      } else if (type === T.WIND3) {
        _renderWindMk3({ type, powered: false, width: def?.width || 4, height: def?.height || 4, def }, x, y, fw, fh, 0);
      } else if (type === T.MONITOR) {
        // Draw the real sprite rather than a filler block: the station is a
        // slim signpost (footing, pole, raised head unit, antenna), so a solid
        // 2x2 rectangle badly misrepresented what was about to be placed.
        // renderMonitor is authored in 1x1 TILE units and scaled up by
        // dispatchScaledRender when placed, so mirror that transform here to
        // get a silhouette that matches exactly. powered:false keeps the ghost
        // in its unlit palette and skips the glow halo.
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(def?.width || 2, def?.height || 2);
        renderMonitor({ powered: false, reliability: 100 }, 0, 0, 0);
        ctx.restore();
      }
    } else if (type === T.MONITOR2) {
      renderMonitor2({ type, powered: false, width: 4, height: 4, _ghost: true }, x, y, 0);
    } else if (type === T.ENGOFFICE) {
      renderEngOffice({ type, powered: false, width: 10, height: 8, _ghost: true }, x, y, 0);
    } else if (type === T.BEACON) {
      // Real sprite rather than a filler block — the beacon is an open lattice
      // mast, so a solid rectangle would badly misrepresent its footprint.
      // powered:false keeps the ghost unlit and skips the glow/pulse passes.
      const bDef = EntityDefs[T.BEACON];
      renderBeacon({ powered: false, reliability: 100,
                     width: bDef.width, height: bDef.height }, x, y, 0);
    } else if (type === T.BATTERY) {
      renderBattery({ def: EntityDefs[T.BATTERY], charge: 0 }, x, y, 0);
    } else if (type === T.EVCHARGER) {
      const evDef = EntityDefs[T.EVCHARGER];
      renderEVCharger({ type, col, row, width: evDef.width, height: evDef.height, powered: false }, x, y, 0);
    } else if (type === T.PROTECTOR) {
      renderProtector({ powered: false }, x, y, 0);
    } else if (type === T.PROTECTOR2) {
      dispatchFootprintRenderGhost({ powered: false }, x, y, 0, renderProtector2);
    } else if (type === T.PROTECTOR3) {
      dispatchFootprintRenderGhost({ powered: false }, x, y, 0, renderProtector3);
    } else if (type === T.CIRCUITSWITCH) {
      // The real breaker compound, closed and with an empty roster, rather
      // than whatever fallback block a 4×4 would otherwise get.
      const csDef = EntityDefs[T.CIRCUITSWITCH];
      renderCircuitSwitch({ type, col, row, width: csDef?.width || 4, height: csDef?.height || 4, _members: [] }, x, y, 0);
    } else if (type === T.CIRCUITSWITCH2) {
      const cs2Def = EntityDefs[T.CIRCUITSWITCH2];
      renderCircuitSwitch2({ type, col, row, width: cs2Def?.width || 6, height: cs2Def?.height || 5, _members: [] }, x, y, 0);
    } else if (type === T.GOVERNOR) {
      // The real cabinet, so the preview already shows conduit links to any
      // generator it would attach to at this spot.
      renderGovernor({ type, powered: false, col, row, width: 2, height: 2 }, x, y, 0);
    } else if (type === T.CARBONCAPTURE) {
      renderCarbonCapture({ type, powered: false, col, row, width: EntityDefs[T.CARBONCAPTURE].width, height: EntityDefs[T.CARBONCAPTURE].height, _ghost: true }, x, y, 0);
    } else if (type === T.RESEARCH) {
      // The real stations, unpowered, so the ghost shows what gets built.
      renderResearch({ type, powered: false, col, row, width: 1, height: 1 }, x, y, 0);
    } else if (type === T.RESEARCH2) {
      renderResearch2({ type, powered: false, col, row, width: 2, height: 2 }, x, y, 0);
    } else if (type === T.RESEARCH3) {
      renderResearch3({ type, powered: false, col, row, width: 3, height: 3 }, x, y, 0);
    } else if (type === T.SURVEY) {
      // Draw the real rig rather than a placeholder box + dish, so the ghost
      // matches what actually gets placed. renderSurvey sizes itself from
      // e.width/e.height, so a stub entity carrying the def's footprint is
      // all it needs. powered:false keeps it unlit and skips the glow halo.
      const _d = EntityDefs[T.SURVEY];
      renderSurvey({
        col: col, row: row,
        width:  _d?.width  || 4,
        height: _d?.height || 4,
        powered: false, _scanning: false, _scanProgress: 0, _scanDuration: 60,
      }, x, y, 0);
    } else if (type === T.SURVEY2) {
      const _d = EntityDefs[T.SURVEY2];
      renderSurvey2({
        type, col, row,
        width:  _d?.width  || 6,
        height: _d?.height || 6,
        powered: false, _scanning: false, _scanSlots: [null, null], _ghost: true,
      }, x, y, 0);
    } else if (type === T.WATEREXTRACTOR) {
      renderWaterExtractor({ type, powered: false, col, row, width: 4, height: 4 }, x, y, 0);
    } else if (type === T.PIPE) {
      ctx.fillStyle='#0a2020'; ctx.fillRect(x+TILE/2-4,y+TILE/2-4,8,8);
    } else if (type === T.UNDERGNDCONVEYOR) {
      renderUndergndBelt({ _udgAxis: InputManager.state.undergndBeltAxis }, x, y, 0);
    } else if (type === T.CONVEYORSPLITTER) {
      const _s = InputManager.state.splitter;
      renderSplitterHousing({ _splitMode: _s.mode, _splitSide: _s.side, _splitRatio: _s.ratio }, x + TILE/2, y + TILE/2, performance.now() / 1000);
    } else if (type === T.UNDERGNDPIPE) {
      // The mouth as it will be built (renderUndergndPipe): the valve-pit pad
      // and the bolted bore, with a dashed line along the axis the tunnel runs.
      const S = TILE / 16, mx = x + TILE / 2, my = y + TILE / 2, pal = PIPE_PALETTE.dry;
      _udgPad(x, y, S);
      ctx.strokeStyle = '#1880a0'; ctx.lineWidth = 1.4; ctx.setLineDash([2 * S, 1.6 * S]);
      ctx.beginPath();
      if (InputManager.state.undergndPipeAxis === 'v') { ctx.moveTo(mx, y + 2); ctx.lineTo(mx, y + TILE - 2); }
      else                                               { ctx.moveTo(x + 2, my); ctx.lineTo(x + TILE - 2, my); }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = pal.flange; ctx.strokeStyle = pal.rim; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(mx, my, 8.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#050a0c'; ctx.beginPath(); ctx.arc(mx, my, 4.5, 0, Math.PI * 2); ctx.fill();
    } else if (type === T.HYDROGENERATOR) {
      // Real sprite at the rotation-swapped footprint, input side from the
      // same N/E/S/W mapping tryPlace uses.
      const _rot = rotation % 4;
      const hd = EntityDefs[T.HYDROGENERATOR];
      const [_dc, _dr] = [[0,-1],[1,0],[0,1],[-1,0]][_rot];
      renderHydroGenerator({ type, powered: false, col, row, def: hd,
        width: (_rot === 1 || _rot === 3) ? hd.height : hd.width,
        height: (_rot === 1 || _rot === 3) ? hd.width : hd.height,
        _inSideDc: _dc, _inSideDr: _dr }, x, y, 0);
    } else if (type === T.GEOWELL) {
      // Real sprite, with the output-port spur on the placement rotation.
      renderGeoWell({ type, powered: false, col, row,
        width:  EntityDefs[T.GEOWELL].width  || 3,
        height: EntityDefs[T.GEOWELL].height || 2,   // footprint — the sprite uses visualHeight
        _rotation: (InputManager.state.placementRotation || 0) % 4 }, x, y, 0);
    } else if (type === T.GEOTURBINE) {
      const gd = EntityDefs[T.GEOTURBINE];
      renderGeoTurbine({ type, col, row, width: gd.width || 5, height: gd.height || 4, def: gd }, x, y, 0);
    } else if (type === T.COALMINE) {
      // The real sprite, at the size this deposit will give the mine
      // (ghostAnchor carries it — see _coalMineFootprint in input_manager.js).
      const _ga = InputManager.state.ghostAnchor;
      const _hasFp = _ga && _ga.tool === T.COALMINE && _ga.w;
      renderCoalMine({ type, col, row,
        width:  _hasFp ? _ga.w : (EntityDefs[T.COALMINE].width  || 4),
        height: _hasFp ? _ga.h : (EntityDefs[T.COALMINE].height || 4),
        powered: false, _ghost: true, _rotation: InputManager.state.placementRotation || 0 }, x, y, 0);
    } else if (type === T.COALMINE2) {
      // No branch here meant a valid MK2 placement drew nothing at all — the
      // only visible feedback was the red "can't place" tint below.
      const tw = TILE*(EntityDefs[T.COALMINE2].width || 4), th = TILE*(EntityDefs[T.COALMINE2].height || 4);
      drawRoundRect(x+4, y+4, tw-8, th-8, 4, '#101418', null);
      ctx.strokeStyle = '#8aa0b4'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x+6, y+6, tw-12, th-12);
      // Headframe tower + twin sheaves, echoing the MK2 sprite
      const hx = x+tw*0.56, hw = tw*0.22, top = y+th*0.12, bot = y+th*0.68;
      ctx.strokeRect(hx, top, hw, bot-top);
      ctx.beginPath(); ctx.moveTo(hx, top); ctx.lineTo(hx+hw, bot); ctx.moveTo(hx+hw, top); ctx.lineTo(hx, bot); ctx.stroke();
      ctx.beginPath(); ctx.arc(hx+hw*0.27, top-2, 5, 0, Math.PI*2); ctx.arc(hx+hw*0.73, top-2, 5, 0, Math.PI*2); ctx.stroke();
      ctx.fillStyle = 'rgba(224,176,32,0.45)';
      ctx.fillRect(x+tw*0.06, y+th*0.22, tw*0.4, th*0.28);
      _coalMineOutStub({ type, col, row, width: tw/TILE, height: th/TILE, _rotation: InputManager.state.placementRotation || 0 }, x, y, tw, th, 0, false);
    } else if (type === T.PUMPJACK) {
      const tw = TILE*3, th = TILE*3;
      drawRoundRect(x+4, y+4, tw-8, th-8, 4, '#0c0e10', null);
      ctx.strokeStyle = '#d0a030'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      const cx2 = x+tw/2, baseY = y+th*0.72, postMid = y+th*0.42;
      ctx.beginPath();
      ctx.moveTo(cx2 - tw*0.28, baseY); ctx.lineTo(cx2, postMid);
      ctx.moveTo(cx2 + tw*0.28, baseY); ctx.lineTo(cx2, postMid);
      ctx.moveTo(cx2, postMid); ctx.lineTo(cx2, y+th*0.18);
      ctx.stroke();
      ctx.fillStyle = 'rgba(208,160,48,0.4)';
      ctx.beginPath(); ctx.ellipse(cx2, y+th*0.76, tw*0.26, th*0.08, 0, 0, Math.PI*2); ctx.fill();
    } else if (type === T.PUMPJACK2) {
      // Real sprite, unpowered — the ghost snaps to the deposit-centred
      // footprint (see _pumpJackFootprint in input_manager.js).
      const _ga = InputManager.state.ghostAnchor;
      const _hasFp = _ga && _ga.tool === T.PUMPJACK2 && _ga.w;
      renderPumpJackMK2({ type, col, row,
        width:  _hasFp ? _ga.w : (EntityDefs[T.PUMPJACK2].width  || 4),
        height: _hasFp ? _ga.h : (EntityDefs[T.PUMPJACK2].height || 4),
        powered: false, _pressure: 1, _ghost: true }, x, y, 0);
    } else if (type === T.URANIUMMINE || type === T.SULFURMINE || type === T.SULFURMINE2 || type === T.RAREEARTHMINE) {
      // Real sprite, unpowered, so the ghost previews exactly what gets
      // built (same approach as the waste facilities below).
      const mDef = EntityDefs[type];
      // An MK2 sulfur mine over an MK1 takes the MK1's facing (ghostAnchor.rot).
      const _ga = InputManager.state.ghostAnchor;
      const mStub = { type, powered: false, col, row, width: mDef.width, height: mDef.height,
                      _rotation: (_ga && _ga.tool === type && _ga.rot !== undefined) ? _ga.rot : (InputManager.state.placementRotation || 0) };
      if (type === T.URANIUMMINE)        renderUraniumMine(mStub, x, y, 0);
      else if (type === T.RAREEARTHMINE) renderRareEarthMine(mStub, x, y, 0);
      else                               renderSulfurMine(mStub, x, y, 0);
    } else if (type === T.CHEMICALPLANT || type === T.FUELPLANT || type === T.LEACHPLANT || type === T.SCMILL || type === T.COREWORKS || type === T.COKEOVEN || type === T.GRAPHITEFURNACE || type === T.NUCLEARREACTOR
            || type === T.LITHIUMMINE || type === T.LITHIUMPROCESSPLANT || type === T.REPROCESSOR || type === T.SPENTFUELPOOL || type === T.MOXPLANT || type === T.ADVREACTOR || type === T.DRONEPORT || type === T.DRONECHARGER || type === T.COOLINGTOWER || type === T.COOLINGTOWER2
            || type === T.STEAMTURBINE || type === T.STEAMTURBINE2 || type === T.ELECTROLYZER || type === T.HABERBOSCH
            || type === T.ATMOSCOLLECTOR || type === T.WASHTOWER || type === T.FUSIONFUELPLANT
            || type === T.HULKINGFUSIONREACTOR || type === T.ADVFUSIONREACTOR || type === T.MHDRING
            || type === T.HELIUMWELL || type === T.HELIUMWELL2 || type === T.CRYOPLANT || type === T.HE3SEPARATOR || type === T.TRITIUMBREEDER || type === T.GASSTORAGE) {
      // Real sprite, unpowered — rotatable plants carry the placement
      // rotation so their stubs preview on the faces they'll use.
      const pDef = EntityDefs[type];
      // Footprint swapped for 90°/270° exactly as tryPlace builds the plants
      // it rotates — the sprites read e.width/height as the rotated
      // footprint. (The Chemical Plant is fixed at its default facing, and
      // the rest here don't take a rotation at all.)
      const _swap = (rotation % 2) === 1 && [T.FUELPLANT, T.NUCLEARREACTOR, T.ELECTROLYZER, T.LITHIUMPROCESSPLANT, T.REPROCESSOR, T.SPENTFUELPOOL, T.MOXPLANT,
        T.ATMOSCOLLECTOR, T.HABERBOSCH, T.WASHTOWER, T.FUSIONFUELPLANT, T.HULKINGFUSIONREACTOR, T.ADVFUSIONREACTOR, T.MHDRING, T.CRYOPLANT, T.HE3SEPARATOR, T.TRITIUMBREEDER].includes(type);
      const pStub = { type, powered: false, col, row,
                      width: _swap ? pDef.height : pDef.width, height: _swap ? pDef.width : pDef.height,
                      _rotation: type === T.CHEMICALPLANT ? 0 : rotation };   // Chemical Plant doesn't rotate
      if      (type === T.CHEMICALPLANT)       renderChemicalPlant(pStub, x, y, 0);
      else if (type === T.FUELPLANT)           renderFuelPlant(pStub, x, y, 0);
      else if (type === T.LEACHPLANT)          renderLeachPlant(pStub, x, y, 0);
      else if (type === T.COKEOVEN)            renderCokeOven(pStub, x, y, 0);
      else if (type === T.GRAPHITEFURNACE)     renderGraphiteFurnace(pStub, x, y, 0);
      else if (type === T.SCMILL)              renderSuperconductorMill(pStub, x, y, 0);
      else if (type === T.COREWORKS)           renderCoreWorks(pStub, x, y, 0);
      else if (type === T.NUCLEARREACTOR)      renderNuclearReactor(pStub, x, y, 0);
      else if (type === T.LITHIUMMINE)         renderLithiumMine(pStub, x, y, 0);
      else if (type === T.LITHIUMPROCESSPLANT) renderLithiumProcessPlant(pStub, x, y, 0);
      else if (type === T.REPROCESSOR)         renderReprocessingPlant(pStub, x, y, 0);
      else if (type === T.MOXPLANT)            renderMoxPlant(pStub, x, y, 0);
      else if (type === T.DRONEPORT || type === T.DRONECHARGER) {
        if (type === T.DRONECHARGER) renderDroneCharger(pStub, x, y, 0); else
        renderDronePort(pStub, x, y, 0);
        // The coverage preview is planning information, not part of the
        // ghost sprite: draw it at full strength rather than inheriting the
        // ghost's faded alpha (0.18 on an invalid spot), which hid it.
        const _ga = ctx.globalAlpha; ctx.globalAlpha = 1;
        renderDronePortRange(pStub, x, y);
        ctx.globalAlpha = _ga;
      }
      else if (type === T.ADVREACTOR)          renderAdvancedReactor(pStub, x, y, 0);
      else if (type === T.SPENTFUELPOOL)       renderSpentFuelPool(pStub, x, y, 0);
      else if (type === T.COOLINGTOWER)        renderCoolingTower(pStub, x, y, 0);
      else if (type === T.COOLINGTOWER2)       renderCryoCoolingTower(pStub, x, y, 0);
      else if (type === T.STEAMTURBINE)        renderSteamTurbine(pStub, x, y, 0);
      else if (type === T.STEAMTURBINE2)       renderSteamTurbine2(pStub, x, y, 0);
      else if (type === T.ELECTROLYZER)        renderElectrolyzer(pStub, x, y, 0);
      else if (type === T.HABERBOSCH)          renderHaberBosch(pStub, x, y, 0);
      else if (type === T.ATMOSCOLLECTOR)      renderAtmosphereCollector(pStub, x, y, 0);
      else if (type === T.WASHTOWER)           renderIsotopicWashTower(pStub, x, y, 0);
      else if (type === T.FUSIONFUELPLANT)     renderFusionFuelPlant(pStub, x, y, 0);
      else if (type === T.HULKINGFUSIONREACTOR) renderHulkingFusionReactor(pStub, x, y, 0);
      else if (type === T.ADVFUSIONREACTOR)    renderAdvancedFusionReactor(pStub, x, y, 0);
      else if (type === T.HELIUMWELL)          renderHeliumWell(pStub, x, y, 0);
      else if (type === T.HELIUMWELL2)         renderHeliumWell2(pStub, x, y, 0);
      else if (type === T.CRYOPLANT)           renderCryoPlant(pStub, x, y, 0);
      else if (type === T.HE3SEPARATOR)        renderHe3Separator(pStub, x, y, 0);
      else if (type === T.TRITIUMBREEDER)      renderTritiumBreeder(pStub, x, y, 0);
      else if (type === T.GASSTORAGE)          renderGasStorage(pStub, x, y, 0);
      else                                     renderMHDDeceleratorRing(pStub, x, y, 0);
    } else if (type === T.MK4RESEARCH) {
      const tw = TILE*4, th = TILE*4;
      drawRoundRect(x+4, y+4, tw-8, th-8, 5, '#160424', null);
      ctx.strokeStyle = '#ff60d0'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x+6, y+6, tw-12, th-12);
      ctx.fillStyle = 'rgba(255,96,208,0.4)';
      ctx.beginPath(); ctx.arc(x+tw/2, y+th/2, 6, 0, Math.PI*2); ctx.fill();
    } else if (type === T.MK5RESEARCH) {
      const tw = TILE*5, th = TILE*5;
      drawRoundRect(x+4, y+4, tw-8, th-8, 5, '#1c0e02', null);
      ctx.strokeStyle = '#ffb43c'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x+6, y+6, tw-12, th-12);
      ctx.fillStyle = 'rgba(255,180,60,0.4)';
      ctx.beginPath(); ctx.arc(x+tw/2, y+th/2, 7, 0, Math.PI*2); ctx.fill();
    } else if (type === T.FUELGEN) {
      // Preview the real (idle) model at its real footprint instead of a
      // placeholder box, so the ghost matches what actually gets placed.
      const def = EntityDefs[T.FUELGEN];
      renderFuelGenerator({ type, col, row, width: def.width, height: def.height, def, _ghost: true },
                          x, y, performance.now() / 1000);
    } else if (type === T.CONVEYOR) {
      ctx.fillStyle = '#1a1208';
      ctx.fillRect(x+2, y+2, TILE-4, TILE-4);
      ctx.strokeStyle = '#c08030'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x+4, y+TILE/2); ctx.lineTo(x+TILE-4, y+TILE/2); ctx.stroke();
      ctx.fillStyle = '#c08030'; ctx.beginPath(); ctx.arc(x+TILE/2, y+TILE/2, 3, 0, Math.PI*2); ctx.fill();
    } else if (type === T.COALGENERATOR) {
      // Real sprite at the rotation-swapped footprint the placement will use.
      const rot = rotation;
      const defW = EntityDefs[T.COALGENERATOR].width, defH = EntityDefs[T.COALGENERATOR].height;
      const tW = (rot===1||rot===3) ? defH : defW;
      const tH = (rot===1||rot===3) ? defW : defH;
      renderCoalGenerator({ type, powered: false, col, row, width: tW, height: tH }, x, y, 0);
    } else if (type === T.WIRE) {
      const s = 5;
      ctx.fillStyle = '#00d4ff';
      ctx.fillRect(x + TILE / 2 - s, y + TILE / 2 - s, s * 2, s * 2);
    } else if (type === T.BIOFUELGEN) {
      renderBiofuelGen({ type, col, row, _biofuel: 0 }, x, y, 0);
    } else if (type === T.OILSTORAGE || type === T.REFINERY) {
      // Real sprite, unpowered, so the ghost previews exactly what gets built.
      // Ghost carries placementRotation so R flips the tank stubs left ↔ right.
      const oDef = EntityDefs[type];
      const oStub = { type, powered: false, col, row, width: oDef.width, height: oDef.height,
                      _rotation: InputManager.state.placementRotation || 0 };
      if (type === T.OILSTORAGE) renderOilStorage(oStub, x, y, 0);
      else                       renderRefinery(oStub, x, y, 0);
    } else if (type === T.SOLIDSTORAGE) {
      const sDef = EntityDefs[T.SOLIDSTORAGE];
      renderSolidStorage({ type, col, row, width: sDef.width, height: sDef.height, _stored: 0, _ghost: true, _rotation: rotation }, x, y, 0);
    } else if (type === T.CELLTOWER) {
      // Real sprite, unpowered, so the ghost previews exactly what gets built.
      renderCellTower({ type, powered: false, reliability: 100, col, row, width: 4, height: 4 }, x, y, 0);
    } else if (type === T.FIBERHUB) {
      // Same idiom as the cell tower above. renderFiberHub is authored in
      // absolute footprint units (not a 1×1 sprite scaled up), so it takes the
      // hover origin directly. Without this branch the hub fell through the
      // whole chain and drew nothing at all, leaving an invisible cursor over
      // its 5×5 pad.
      const fhDef = EntityDefs[T.FIBERHUB];
      renderFiberHub({ type, powered: false, reliability: 100, col, row,
                       width: fhDef?.width || 5, height: fhDef?.height || 5 }, x, y, 0);
    } else if (type === T.POWERTOWER) {
      const W = TILE*2, H = TILE*2, cx = x+W/2;
      ctx.strokeStyle = '#2060a0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, y+H*0.88); ctx.lineTo(cx, y+H*0.06); ctx.stroke();
      [[0.18, W*0.42],[0.42, W*0.30]].forEach(([fy, aw]) => {
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx-aw, y+H*fy); ctx.lineTo(cx+aw, y+H*fy); ctx.stroke();
      });
    } else if (type === T.GASSTATION || type === T.COALWASTE
            || type === T.OILWASTE   || type === T.NUCLEARWASTE) {
      // Real sprite rather than a hand-drawn stand-in. These are the biggest
      // things the player places (6×5 up to 13×11) and they're all tanks,
      // stacks and pits, so a filler rectangle says nothing about what ends
      // up where — and without a branch here at all they drew NOTHING,
      // leaving an invisible cursor over a 63-tile footprint. Each renderer
      // is authored in absolute TILE units and takes (entity, px, py, t) —
      // the same call the placed building gets in render_main_loop — so
      // handing it the hover origin gives a silhouette matching the footprint
      // exactly. powered:false keeps the ghost unlit and skips the glow and
      // animation passes; the zeroed tank/waste fields make the gauges read
      // as the brand-new, unconnected building this is about to become.
      const gDef = EntityDefs[type];
      const gStub = { powered: false, reliability: 100, col, row,
                      width: gDef.width, height: gDef.height,
                      _fuelStored: 0, _fuelConnected: false, _wasteStored: 0 };
      if      (type === T.GASSTATION) renderGasStation(gStub, x, y, 0);
      else if (type === T.COALWASTE)  renderCoalWasteFacility(gStub, x, y, 0);
      else if (type === T.OILWASTE)   renderOilWasteFacility(gStub, x, y, 0);
      else                            renderNuclearWasteFacility(gStub, x, y, 0);
    } else if (type === T.SHAFT) {
      const horizontal = shaftOrientation !== 'v';
      renderShaft({ type, col, row, _orientation: horizontal ? 'h' : 'v',
        width: horizontal ? 3 : 1, height: horizontal ? 1 : 3 }, x, y, 0);
    } else if (type === T.DAM) {
      // Real dam sprite across the river span under the cursor — mirrors
      // ReservoirSystem.findRiverSpan(), the same lookup tryPlace() uses to
      // build the dam, so the ghost matches exactly what clicking creates.
      // Odd placementRotation → downstream bank (sprite face flipped).
      const span = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.findRiverSpan(col, row) : null;
      if (span && span.tiles.length >= 2) {
        const cs = span.tiles.map(t => t.c), rs = span.tiles.map(t => t.r);
        const minC = Math.min(...cs), minR = Math.min(...rs);
        const width  = Math.max(...cs) - minC + 1;
        const height = Math.max(...rs) - minR + 1;
        const { x: dx, y: dy } = GridManager.tileToWorld(minC, minR);
        const side = ((InputManager.state.placementRotation || 0) % 2) === 1 ? 'downstream' : 'upstream';
        renderDam({ type, col: minC, row: minR, width, height,
          _flowDc: span.flowDc, _flowDr: span.flowDr,
          _reservoirSide: side, _reservoirId: undefined }, dx, dy, 0);
      } else {
        // No river tile here — small marker so the cursor isn't invisible.
        ctx.fillStyle = 'rgba(160,192,224,0.5)';
        ctx.beginPath(); ctx.arc(x + TILE/2, y + TILE/2, 6, 0, Math.PI*2); ctx.fill();
      }
    } else if (type === T.HYDROTURBINE) {
      // Real sprite, facing the reservoir under the cursor, with the drive
      // shaft output on the side R has turned it to (buildTurbine's rule).
      const td = EntityDefs[T.HYDROTURBINE], tw = td.width || 5, th = td.height || 5;
      let res = null;
      for (let r = row; r < row + th && !res; r++)
        for (let c = col; c < col + tw && !res; c++) {
          const w = GridManager.inBounds(c, r) ? GridManager.getEntity(c, r) : null;
          if (w && w.type === T.WATER && w._reservoirId !== undefined) res = ReservoirSystem.getReservoir(w._reservoirId) || null;
        }
      const fdc = res ? res.flowDc : 0, fdr = res ? res.flowDr : 1;
      const out = ReservoirSystem.turbineOutSide(fdr, rotation);
      renderHydroTurbine({ type, col, row, width: tw, height: th, def: td, powered: false, _ghost: true,
        _flowDc: fdc, _flowDr: fdr, _outSideDc: out.dc, _outSideDr: out.dr }, x, y, 0);
    } else if (EntityDefs[type]) {
      // Anything without its own branch above used to draw nothing at all.
      _ghostSprite(type, col, row, x, y, rotation);
    }

    ctx.restore();

    // Footprint size for the effects below — shaft footprint depends on the
    // current placement orientation, not the (fixed) EntityDefs width/height.
    const _footprint = (() => {
      if (type === T.SHAFT) {
        const horizontal = shaftOrientation !== 'v';
        return { fw: (horizontal ? 3 : 1) * TILE, fh: (horizontal ? 1 : 3) * TILE };
      }
      // A Coal Mine MK1's size depends on the deposit under the cursor.
      if (type === T.COALMINE) {
        const ga = InputManager.state.ghostAnchor;
        if (ga && ga.tool === T.COALMINE && ga.w) return { fw: ga.w * TILE, fh: ga.h * TILE };
      }
      const def = EntityDefs[type];
      return { fw: (def?.width || 1) * TILE, fh: (def?.height || 1) * TILE };
    })();

    // Night glow — cyan outline to make ghost pop in darkness
    if (_dark > 0.3) {
      const { fw, fh } = _footprint;
      ctx.save();
      ctx.globalAlpha = _dark * 0.5;
      ctx.strokeStyle = '#40d4ff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x+1, y+1, fw-2, fh-2);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Red tint if can't place — cover full footprint
    if (!canPlace) {
      const { fw, fh } = _footprint;
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(x, y, fw, fh);
      ctx.restore();
    }
  }

// Shore bank gradients — the land-side complement to the water-side
// shoreline feather in renderWater() (render_world_civic.js). Without this,
// grass ends in a hard cutout and water begins immediately at full opacity
// right next to it, which reads as water sitting on top of a flat grass
// plane rather than ground sloping down into it. A damp "wet sand/mud" band
// hugging the water's edge, fading back into normal grass over a few
// pixels, gives the shoreline actual depth. Built once (colour stops never
// change) and reused every tile via ctx.translate(), same technique as the
// water-side gradients just below this file's water code.
//
// The first ~45% of the band is FULLY OPAQUE (alpha 1) rather than a
// translucent tint — real mud/sand at a waterline doesn't have grass
// growing through it, but a translucent overlay still let the grass blade
// pattern show through underneath. Only the outer portion, past the solid
// mud/sand zone, fades translucently back into visible grass.
const _BANK_DEPTH = 20;
function _buildBankGradient(x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0,    'rgba(14,16,11,1)');     // near-black damp soil right at the waterline — solid, no grass
  g.addColorStop(0.45, 'rgba(58,52,35,1)');     // wet sand — still solid
  g.addColorStop(0.75, 'rgba(84,74,46,0.4)');   // transition zone fading out
  g.addColorStop(1,    'rgba(84,74,46,0)');     // fully faded, revealing normal grass
  return g;
}
const _bankGradTop    = _buildBankGradient(0, 0, 0, _BANK_DEPTH);
const _bankGradBottom = _buildBankGradient(0, TILE, 0, TILE - _BANK_DEPTH);
const _bankGradLeft   = _buildBankGradient(0, 0, _BANK_DEPTH, 0);
const _bankGradRight  = _buildBankGradient(TILE, 0, TILE - _BANK_DEPTH, 0);

// Pavement edge gradients — the same idea applied to cobblestone/paved
// zone boundaries: a gravel/dirt band where broken pavement meets grass,
// instead of grass running right up to (and showing through) the zone's
// edge. Same opaque-inner / translucent-outer shape as the shore bank
// above, just toned as dry gravel/dirt rather than wet mud/sand.
const _PAVEMENT_EDGE_DEPTH = 12;
function _buildPavementEdgeGradient(x0, y0, x1, y1) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0,    'rgba(46,42,36,1)');     // dark dirt/gravel right at the pavement lip — solid, no grass
  g.addColorStop(0.4,  'rgba(66,60,48,1)');     // dry gravel — still solid
  g.addColorStop(0.75, 'rgba(70,64,50,0.35)');  // transition zone fading out
  g.addColorStop(1,    'rgba(70,64,50,0)');     // fully faded, revealing normal grass
  return g;
}
const _pavGradTop    = _buildPavementEdgeGradient(0, 0, 0, _PAVEMENT_EDGE_DEPTH);
const _pavGradBottom = _buildPavementEdgeGradient(0, TILE, 0, TILE - _PAVEMENT_EDGE_DEPTH);
const _pavGradLeft   = _buildPavementEdgeGradient(0, 0, _PAVEMENT_EDGE_DEPTH, 0);
const _pavGradRight  = _buildPavementEdgeGradient(TILE, 0, TILE - _PAVEMENT_EDGE_DEPTH, 0);

// ── Zone quay wall ───────────────────────────────────────────────────
// Where a paved zone runs straight into water the pavement used to stop
// dead at the tile boundary, with water starting at full opacity right
// beside it — the zone read as a hole punched in the lake rather than a
// waterfront. Grass gets a mud bank for exactly this reason (_bankGrad*
// above), but the zone cobblestone is painted over that bank, so the
// paved side needs an edge of its own: a concrete quay. Dark wet stone at
// the waterline, a capstone band with expansion joints, a shadow line
// where the cap meets the pavement, and mooring bollards here and there.
//
// It all sits INSIDE the land tile — water tiles repaint themselves
// opaque every frame (renderWater), so anything drawn on the water side
// of the boundary would simply be painted over.
const _QUAY_WET = 3;    // dark wet stone at the waterline ends here
const _QUAY_CAP = 10;   // capstone band ends here
const _QUAY_LIP = 12;   // shadow line onto the pavement ends here

// Bands and joints are written straight into world-space Path2Ds (one per
// tone, filled once for the whole redraw) rather than drawn through a
// per-edge rotate/translate — a save/rotate/restore for every shore edge
// of every waterfront tile is exactly the kind of per-tile canvas state
// churn the rest of this layer goes out of its way to avoid.
// dir: 0=water above, 1=below, 2=left, 3=right.
function _quayBand(p, x, y, dir, a, b) {
  const d = b - a;
  if (dir === 0)      p.rect(x, y + a, TILE, d);
  else if (dir === 1) p.rect(x, y + TILE - b, TILE, d);
  else if (dir === 2) p.rect(x + a, y, d, TILE);
  else                p.rect(x + TILE - b, y, d, TILE);
}
function _quaySeam(p, x, y, dir, along, a, b) {
  const d = b - a;
  if (dir === 0)      p.rect(x + along, y + a, 1.2, d);
  else if (dir === 1) p.rect(x + along, y + TILE - b, 1.2, d);
  else if (dir === 2) p.rect(x + a, y + along, d, 1.2);
  else                p.rect(x + TILE - b, y + along, d, 1.2);
}

// Zones whose waterfront is a quay wall. An industrial yard is packed
// gravel, so its shore stays a natural bank (WaterLook's ZONE_KEYS match).
const QUAY_ZONE_KEYS = ['residential', 'commercial', 'government'];
function drawZoneQuays(g, cStart, cEnd, rStart, rEnd, shade, dark) {
  if (typeof ZoneSystem === 'undefined' || typeof WaterSystem === 'undefined') return;
  const wet = new Path2D(), cap = new Path2D(), hi = new Path2D();
  const lip = new Path2D(), seams = new Path2D();
  const bollards = [];
  // Zone rects can overlap (different zone types, or two rects of the same
  // type grown into each other), and a tile drawn twice would composite the
  // translucent highlight/shadow bands twice — so each tile is edged once.
  const seen = new Set();
  let any = false;
  for (const key of QUAY_ZONE_KEYS) {
    const rects = ZoneSystem.getZoneRects(key);
    if (!rects || rects.length === 0) continue;
    for (const rect of rects) {
      // PAD=1 — matches the paved footprint in the zone-fill block.
      const c0 = Math.max(rect.minC - 1, cStart), c1 = Math.min(rect.maxC + 1, cEnd - 1);
      const r0 = Math.max(rect.minR - 1, rStart), r1 = Math.min(rect.maxR + 1, rEnd - 1);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const tk = c * 10000 + r;
        if (seen.has(tk)) continue;
        seen.add(tk);
        if (WaterSystem.isWater(c, r)) continue;
        const x = c * TILE, y = r * TILE;
        for (let dir = 0; dir < 4; dir++) {
          const nc = c + (dir === 2 ? -1 : dir === 3 ? 1 : 0);
          const nr = r + (dir === 0 ? -1 : dir === 1 ? 1 : 0);
          if (!WaterSystem.isWater(nc, nr)) continue;
          any = true;
          _quayBand(wet, x, y, dir, 0, _QUAY_WET);
          _quayBand(cap, x, y, dir, _QUAY_WET, _QUAY_CAP);
          _quayBand(hi,  x, y, dir, _QUAY_WET, _QUAY_WET + 1.4);
          _quayBand(lip, x, y, dir, _QUAY_CAP, _QUAY_LIP);
          // Expansion joints across the capstone, jittered per tile so the
          // wall doesn't read as one repeating stamp along a long shore.
          for (let k = 0; k < 3; k++) {
            const along = 5 + k * 12 + _nbHash(c, r, 810 + k + dir * 4) * 4;
            _quaySeam(seams, x, y, dir, along, _QUAY_WET, _QUAY_CAP);
          }
          if (_nbHash(c, r, 830 + dir) < 0.3) {
            const along = 11 + _nbHash(c, r, 840 + dir) * (TILE - 22);
            const off = (_QUAY_WET + _QUAY_CAP) / 2;
            bollards.push(dir === 0 ? [x + along, y + off]
                        : dir === 1 ? [x + along, y + TILE - off]
                        : dir === 2 ? [x + off, y + along]
                        :             [x + TILE - off, y + along]);
          }
        }
      }
    }
  }
  if (!any) return;

  const col = (R, G, B, a) => `rgba(${Math.round(R*shade)},${Math.round(G*shade)},${Math.round(B*shade)},${a === undefined ? 1 : a})`;
  g.fillStyle = col(26, 30, 32);        g.fill(wet);    // wet stone at the waterline
  g.fillStyle = col(122, 122, 116);     g.fill(cap);    // capstone
  g.fillStyle = col(168, 168, 158, 0.75); g.fill(hi);   // sunlit lip of the cap
  g.fillStyle = col(78, 78, 72, 0.8);   g.fill(seams);  // expansion joints
  g.fillStyle = 'rgba(0,0,0,0.3)';      g.fill(lip);    // cap's shadow on the pavement

  for (const [bx, by] of bollards) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.ellipse(bx + 1.4, by + 1.4, 3.2, 2.6, 0, 0, Math.PI*2); g.fill();
    g.fillStyle = col(52, 54, 56);
    g.beginPath(); g.arc(bx, by, 3, 0, Math.PI*2); g.fill();
    g.fillStyle = dark > 0.35 ? col(96, 98, 96) : col(146, 148, 142);
    g.beginPath(); g.arc(bx - 0.5, by - 0.6, 1.7, 0, Math.PI*2); g.fill();
  }
}

// ── Zone ground: residential, commercial, industrial, government ────
// Every zone type paves its own ground around the buildings actually
// standing in it, all from one shared layout plan (_zoneGroundPlan):
//   1. a route loops the zone's padding ring;
//   2. every building gets a front route on the row below its footprint,
//      paved across the open tiles either side so a row of buildings shares
//      one street (skipping tiles a route directly above already serves, so
//      stacked buildings don't produce parallel ladder-like walks);
//   3. fully open columns become cross streets, at least 4 tiles apart so an
//      empty stretch isn't paved solid;
//   4. any front street still cut off gets a connector run up or down to the
//      nearest route.
// The residential zone draws that network as sidewalks through a mown lawn
// with gardens and street trees; commercial as asphalt streets with
// shopfront pavements, parking bays and a planted plaza; industrial as haul
// roads with loading aprons and storage yards inside a security fence;
// government as a formal civic quarter: limestone promenades and
// forecourts, grand steps, hedged lawns with statues, parterres, fountains
// and flags, inside a wrought-iron railing.
//
// Plans are cached on ZoneSystem's version, which is also what invalidates
// this background layer, so the layout re-routes whenever a building is
// added, moved or removed. Everything else is keyed off world tile
// coordinates, so separately rendered cache bands/strips butt together
// seamlessly like the rest of this layer.
function _nbHash(c, r, salt) {
  let h = (c * 668265263 + r * 374761393 + salt * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const _zonePlanCache = new Map();
function _zoneGroundPlan(zoneKey, rect) {
  const key = zoneKey + ':' + ZoneSystem.getVersion() + ':' + rect.minC + ',' + rect.minR + ',' + rect.maxC + ',' + rect.maxR;
  const hit = _zonePlanCache.get(key);
  if (hit) return hit;
  if (_zonePlanCache.size > 96) _zonePlanCache.clear();

  const c0 = rect.minC - 1, c1 = rect.maxC + 1, r0 = rect.minR - 1, r1 = rect.maxR + 1;
  const w = c1 - c0 + 1, h = r1 - r0 + 1;
  const I = (c, r) => (r - r0) * w + (c - c0);
  const inside = (c, r) => c >= c0 && c <= c1 && r >= r0 && r <= r1;
  const blocked = new Uint8Array(w * h), path = new Uint8Array(w * h), front = new Uint8Array(w * h);

  // Buildings (not trees, not power poles and other small player kit that
  // doesn't touch the zone version) and water block a route.
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (WaterSystem.isWater(c, r)) { blocked[I(c, r)] = 1; continue; }
    const e = GridManager.getEntity(c, r);
    if (e && !GridManager.isVegetation(e) && (e.fromRequest || (e.width || 1) > 1 || (e.height || 1) > 1)) blocked[I(c, r)] = 1;
  }
  const free = (c, r) => inside(c, r) && !blocked[I(c, r)];

  // 1. Perimeter loop
  for (let c = c0; c <= c1; c++) { if (free(c, r0)) path[I(c, r0)] = 1; if (free(c, r1)) path[I(c, r1)] = 1; }
  for (let r = r0; r <= r1; r++) { if (free(c0, r)) path[I(c0, r)] = 1; if (free(c1, r)) path[I(c1, r)] = 1; }

  // 2. Front routes, and the street along each front row
  const frontRows = new Set();
  for (let r = rect.minR; r <= rect.maxR; r++) for (let c = rect.minC; c <= rect.maxC; c++) {
    const e = GridManager.getEntity(c, r);
    if (!e || e.col !== c || e.row !== r || !blocked[I(c, r)]) continue;
    const fr = r + (e.height || 1);
    for (let k = 0; k < (e.width || 1); k++) if (free(c + k, fr)) { front[I(c + k, fr)] = 1; frontRows.add(fr); }
  }
  const runs = [];
  for (const R of [...frontRows].sort((a, b) => a - b)) {
    if (R <= r0 || R >= r1) continue;   // already on the perimeter loop
    // Same for the bottom leg of the perimeter loop directly below: the
    // buildings on this row already front straight onto it.
    const open = (c) => free(c, R) && !path[I(c, R - 1)] && !(R + 1 === r1 && path[I(c, r1)]);
    for (let s = c0; s <= c1;) {
      if (!open(s)) { s++; continue; }
      let e2 = s, serves = false;
      while (e2 <= c1 && open(e2)) { if (front[I(e2, R)]) serves = true; e2++; }
      if (serves) { for (let c = s; c < e2; c++) path[I(c, R)] = 1; runs.push([R, s, e2 - 1]); }
      s = e2;
    }
  }

  // 3. Cross streets down open columns, at least 4 tiles apart
  let lastCross = c0;
  for (let c = c0 + 1; c < c1; c++) {
    if (c - lastCross < 4 || c1 - c < 3) continue;
    let open = true;
    for (let r = r0; r <= r1 && open; r++) if (!free(c, r)) open = false;
    if (!open) continue;
    for (let r = r0; r <= r1; r++) path[I(c, r)] = 1;
    lastCross = c;
  }

  // 3b. Close the blocks: the zone's street lattice (neighbourhood_plan.js)
  // has a cross street at set columns of each band of blocks. Where one
  // runs between two streets that are already paved — open ground all the
  // way, no longer than a block is deep — it's paved too, so a filled-in
  // neighbourhood reads as blocks with streets round them rather than long
  // rows with nothing crossing them.
  const lat = typeof NeighbourhoodPlan !== 'undefined' ? NeighbourhoodPlan.latticeForZone(zoneKey, rect) : null;
  if (lat) {
    for (let R = r0 + 1; R <= r1; R++) {
      if (!lat.isStreetRow(R) && R !== r1) continue;
      for (let c = c0 + 1; c < c1; c++) {
        if (!path[I(c, R)] || !lat.isCross(c, R - 1)) continue;
        const cells = [];
        let r = R - 1;
        for (; r >= r0 && cells.length < lat.P; r--) {
          if (path[I(c, r)]) break;
          if (!free(c, r)) break;
          cells.push(r);
        }
        if (!cells.length) continue;
        // Reaching the next street makes a through street. Stopping short of
        // it (ground built on, or the zone edge) still leaves a short close
        // off the street below, if there are buildings on both sides of it
        // to serve — a cul-de-sac between two blocks.
        if (r < r0 || !path[I(c, r)]) {
          const flank = (cc) => cells.some(rr => inside(cc, rr) && blocked[I(cc, rr)]);
          if (cells.length < 2 || !flank(c - 1) || !flank(c + 1)) continue;
          if (cells.length >= lat.P) cells.length = lat.P - 1;
        }
        for (const rr of cells) path[I(c, rr)] = 1;
      }
    }
  }

  // 4. Connect any front street that doesn't reach the rest of the network
  for (const [R, s, e2] of runs) {
    if (s === c0 || e2 === c1) continue;
    let linked = false;
    for (let c = s; c <= e2 && !linked; c++) {
      if ((inside(c, R - 1) && path[I(c, R - 1)]) || (inside(c, R + 1) && path[I(c, R + 1)])) linked = true;
    }
    if (linked) continue;
    const mid = (s + e2) >> 1;
    const order = [];
    for (let d = 0; d <= e2 - s; d++) { if (mid + d <= e2) order.push(mid + d); if (d && mid - d >= s) order.push(mid - d); }
    outer: for (const c of order) {
      for (const dir of [1, -1]) {
        const cells = [];
        for (let r = R + dir; inside(c, r); r += dir) {
          if (!free(c, r)) break;
          if (path[I(c, r)]) { for (const rr of cells) path[I(c, rr)] = 1; break outer; }
          cells.push(r);
        }
      }
    }
  }

  // 5. Tunnel portals (streets only — sidewalks and promenades just stop):
  // every straight run of road that reaches the zone's edge carries on out
  // of it into a tunnel, where the ground beyond is clear — not water, a
  // building, another zone or a road.
  const portals = [], portalAt = new Set();
  if (zoneKey === 'commercial' || zoneKey === 'industrial') {
    _ensureConnectorNetwork();
    const P = (c, r) => inside(c, r) && path[I(c, r)] === 1;
    const add = (c, r, side, oc, or, x, y, ang) => {
      if (oc < 0 || oc >= COLS || or < 0 || or >= ROWS) return;
      if (WaterSystem.isWater(oc, or) || _connectorTiles.has(oc + ',' + or) || _insideAnyZonePad(oc, or)) return;
      const e = GridManager.getEntity(oc, or);
      if (e && !GridManager.isVegetation(e)) return;
      portals.push({ c, r, side, oc, or, x, y, ang });
      portalAt.add(oc + ',' + or);
    };
    const T = TILE;
    for (let r = r0; r <= r1; r++) {
      if (P(c0, r) && P(c0 + 1, r)) add(c0, r, 'W', c0 - 1, r, c0*T, r*T + T/2, Math.PI);
      if (P(c1, r) && P(c1 - 1, r)) add(c1, r, 'E', c1 + 1, r, (c1 + 1)*T, r*T + T/2, 0);
    }
    for (let c = c0; c <= c1; c++) {
      if (P(c, r0) && P(c, r0 + 1)) add(c, r0, 'N', c, r0 - 1, c*T + T/2, r0*T, -Math.PI/2);
      if (P(c, r1) && P(c, r1 - 1)) add(c, r1, 'S', c, r1 + 1, c*T + T/2, (r1 + 1)*T, Math.PI/2);
    }
  }

  const plan = { c0, c1, r0, r1, w, path, front, blocked, portals, portalAt };
  _zonePlanCache.set(key, plan);
  return plan;
}

// ── Inter-zone connector roads ───────────────────────────────────────
// Thin asphalt streets linking each zone (residential/commercial/
// industrial/government, whichever exist) to its nearest neighbours, so
// a settlement reads as one connected town instead of separate paved
// islands. Purely a background-layer decoration recomputed from
// ZoneSystem's rects and cached on its version counter — same pattern
// as the zone ground plans above. No grid entities are created, so this
// never affects placement, trucks or pathing, and it reappears for free
// after loading a save since it derives entirely from the (already
// persisted) zone rects plus a version bump that loadState already does.
let _connectorVer = -1;
// "c,r" -> bitmask of sides where the road runs into a zone's paved ring
// (1=N 2=S 4=W 8=E), so those sides join the zone instead of getting a kerb.
let _connectorTiles = new Map();

function _zoneAllRects() {
  const list = [];
  for (const key of ['residential', 'commercial', 'industrial', 'government'])
    for (const rect of ZoneSystem.getZoneRects(key)) list.push(rect);
  return list;
}

function _insideAnyZonePad(c, r) {
  for (const key of ['residential', 'commercial', 'industrial', 'government'])
    for (const rect of ZoneSystem.getZoneRects(key))
      if (c >= rect.minC - 1 && c <= rect.maxC + 1 && r >= rect.minR - 1 && r <= rect.maxR + 1) return true;
  return false;
}

// Which kind of zone's paved ring (rect + 1 tile pad) covers a tile, or null.
function _zonePadKeyAt(c, r) {
  for (const key of ['residential', 'commercial', 'industrial', 'government'])
    for (const rect of ZoneSystem.getZoneRects(key))
      if (c >= rect.minC - 1 && c <= rect.maxC + 1 && r >= rect.minR - 1 && r <= rect.maxR + 1) return key;
  return null;
}

function _connectorBlocked(c, r) {
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return true;
  if (typeof WaterSystem !== 'undefined' && WaterSystem.isWater(c, r)) return true;
  return _insideAnyZonePad(c, r);
}

// Tiles of the road from zone A's paved ring (rect + 1 tile pad) to B's.
// Road ends sit on the tile directly outside each ring, so they butt
// straight onto the zone. Zones sharing a row span (or column span) get
// one straight road through the middle of the shared span; diagonal
// neighbours get a single bend, leaving A from the side facing B and
// entering B from the side facing A.
function _connectorRoute(A, B) {
  const pts = [];
  const run = (c0, r0, c1, r1) => {
    if (c0 > c1) [c0, c1] = [c1, c0];
    if (r0 > r1) [r0, r1] = [r1, r0];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) pts.push({ c, r });
  };
  const rowLo = Math.max(A.minR, B.minR), rowHi = Math.min(A.maxR, B.maxR);
  const colLo = Math.max(A.minC, B.minC), colHi = Math.min(A.maxC, B.maxC);

  if (rowLo <= rowHi) {
    const r = (rowLo + rowHi) >> 1;
    if (B.minC - 2 >= A.maxC + 2) run(A.maxC + 2, r, B.minC - 2, r);
    else if (A.minC - 2 >= B.maxC + 2) run(B.maxC + 2, r, A.minC - 2, r);
    return pts;
  }
  if (colLo <= colHi) {
    const c = (colLo + colHi) >> 1;
    if (B.minR - 2 >= A.maxR + 2) run(c, A.maxR + 2, c, B.minR - 2);
    else if (A.minR - 2 >= B.maxR + 2) run(c, B.maxR + 2, c, A.minR - 2);
    return pts;
  }

  const right = B.minC > A.maxC, below = B.minR > A.maxR;
  // Horizontal out of A, bend, vertical into B
  const hv = [];
  {
    const r = below ? A.maxR : A.minR;
    const cEnd = right ? B.minC : B.maxC;
    const rEnd = below ? B.minR - 2 : B.maxR + 2;
    const save = pts.length;
    run(right ? A.maxC + 2 : A.minC - 2, r, cEnd, r);
    if (below ? r + 1 <= rEnd : r - 1 >= rEnd) run(cEnd, below ? r + 1 : r - 1, cEnd, rEnd);
    hv.push(...pts.splice(save));
  }
  // Vertical out of A, bend, horizontal into B
  const vh = [];
  {
    const c = right ? A.maxC : A.minC;
    const rEnd = below ? B.minR : B.maxR;
    const cEnd = right ? B.minC - 2 : B.maxC + 2;
    const save = pts.length;
    run(c, below ? A.maxR + 2 : A.minR - 2, c, rEnd);
    if (right ? c + 1 <= cEnd : c - 1 >= cEnd) run(right ? c + 1 : c - 1, rEnd, cEnd, rEnd);
    vh.push(...pts.splice(save));
  }
  const cost = (route) => route.reduce((s, p) => s + (_connectorBlocked(p.c, p.r) ? 1 : 0), 0);
  return cost(vh) < cost(hv) ? vh : hv;
}

// Spanning tree (Prim's) over all zone rects by edge-to-edge gap, then one
// road per tree edge. Rebuilt only when ZoneSystem's version changes (see
// _ensureConnectorNetwork), so this cost is paid once per zone edit.
function _rebuildConnectorNetwork() {
  _connectorTiles = new Map();
  const rects = _zoneAllRects();
  const n = rects.length;
  if (n < 2) return;
  const dist = (A, B) =>
    Math.max(0, B.minC - A.maxC, A.minC - B.maxC) + Math.max(0, B.minR - A.maxR, A.minR - B.maxR)
    + 0.001 * Math.hypot((A.minC + A.maxC - B.minC - B.maxC) / 2, (A.minR + A.maxR - B.minR - B.maxR) / 2);
  const inTree = new Array(n).fill(false);
  inTree[0] = true;
  for (let added = 1; added < n; added++) {
    let bi = -1, bj = -1, bd = Infinity;
    for (let i = 0; i < n; i++) if (inTree[i]) {
      for (let j = 0; j < n; j++) if (!inTree[j]) {
        const d = dist(rects[i], rects[j]);
        if (d < bd) { bd = d; bi = i; bj = j; }
      }
    }
    if (bj === -1) break;
    inTree[bj] = true;
    for (const p of _connectorRoute(rects[bi], rects[bj])) {
      if (!_connectorBlocked(p.c, p.r)) _connectorTiles.set(p.c + ',' + p.r, 0);
    }
  }

  // Sides that run into a zone's paved ring. Only tiles with fewer than two
  // road neighbours (road ends) join, so a road passing alongside some other
  // zone keeps its kerb instead of merging into that zone's paving.
  for (const key of _connectorTiles.keys()) {
    const [c, r] = key.split(',').map(Number);
    const road = (dc, dr) => _connectorTiles.has((c + dc) + ',' + (r + dr));
    if (road(0, -1) + road(0, 1) + road(-1, 0) + road(1, 0) >= 2) continue;
    // A zone with streets (commercial, industrial) is somewhere to turn
    // onto, so the road joins it: low bits. One with only walks
    // (residential, government) is not — the road stops short in a turning
    // circle and a footpath carries on in: high bits. Both are finished off
    // by _drawConnectorMouths.
    let mask = 0;
    const side = (dc, dr, bit) => {
      const k = _zonePadKeyAt(c + dc, r + dr);
      if (k) mask |= (k === 'commercial' || k === 'industrial') ? bit : bit << 4;
    };
    side(0, -1, 1); side(0, 1, 2); side(-1, 0, 4); side(1, 0, 8);
    _connectorTiles.set(key, mask);
  }
}

function _ensureConnectorNetwork() {
  const v = ZoneSystem.getVersion();
  if (v === _connectorVer) return;
  _connectorVer = v;
  _rebuildConnectorNetwork();
}

// Where a pole or tower stands on a road between zones that runs north–south,
// how far (px, x only) to slide its sprite so it stands at the kerb. On an
// east–west road it already does — its foot is drawn at the lower edge of its
// tile, beside the carriageway — but on a north–south one the shaft came down
// the middle of the road. `reach`: the sprite's centre off the road's centre
// line, in 40-unit tile units, far enough to clear the carriageway. Goes to
// whichever kerb is the shorter move (a pole: the right). 0 everywhere else.
function verticalRoadKerbShift(e, reach) {
  if (!_connectorTiles.size) return 0;   // built by the ground pass (_ensureConnectorNetwork)
  const w = e.width || 1, h = e.height || 1;
  for (let dc = 0; dc < w; dc++) for (let dr = 0; dr < h; dr++) {
    const c = e.col + dc, r = e.row + dr;
    if (!_connectorTiles.has(c + ',' + r)) continue;
    if (!_connectorTiles.has(c + ',' + (r - 1)) && !_connectorTiles.has(c + ',' + (r + 1))) continue;
    const roadCx = (c + 0.5) * TILE, ownCx = (e.col + w / 2) * TILE, k = reach * TILE / 40;
    const right = roadCx + k - ownCx, left = roadCx - k - ownCx;
    return Math.abs(left) < Math.abs(right) ? left : right;
  }
  return 0;
}
// A street lamp put down on a zone's sidewalk, street or promenade stands on
// the verge beside it with its arm reaching out over the paving, the way a
// pole on a road between zones stands at the kerb, rather than planted in
// the middle of the walk. Returns how far (px, x only) to slide its sprite.
// renderLamp stands the pole on the tile's centre line with its foot near
// the bottom edge and the arm to the right, so: across a north–south walk
// it moves left onto the grass (right, where a path comes in from the
// west), and on an east–west walk its foot is already off the paving.
const _LAMP_ROUTE_HW = { residential: 7, commercial: 12, industrial: 12, government: 10 };
function lampVergeShift(e) {
  const c = e.col, r = e.row;
  // A road between zones: the pole's kerb check, on the arm's side.
  const road = verticalRoadKerbShift(e, 17);
  if (road) return -Math.abs(road);
  if (typeof ZoneSystem === 'undefined' || !ZoneSystem.getZoneRects) return 0;
  for (const k in _LAMP_ROUTE_HW) for (const R of (ZoneSystem.getZoneRects(k) || [])) {
    if (c < R.minC - 1 || c > R.maxC + 1 || r < R.minR - 1 || r > R.maxR + 1) continue;
    const p = _zoneGroundPlan(k, R);
    const on = (cc, rr) => (cc >= p.c0 && cc <= p.c1 && rr >= p.r0 && rr <= p.r1 && p.path[(rr - p.r0) * p.w + (cc - p.c0)] === 1)
                           || p.portalAt.has(cc + ',' + rr);
    if (!on(c, r)) continue;
    if (!on(c, r - 1) && !on(c, r + 1)) return 0;            // east–west only: already clear
    const off = _LAMP_ROUTE_HW[k] + 5;                        // half the walk, plus the base plate
    return on(c - 1, r) && !on(c + 1, r) ? off : -off;
  }
  return 0;
}

// Which sides of a connector tile the road continues through — another
// road tile, or a zone it runs into. This alone decides whether a tile is a
// straight, bend, junction or dead end, so no travel direction is tracked.
function _connectorNeighbours(c, r) {
  const join = (_connectorTiles.get(c + ',' + r) || 0) & 15;   // street joins only; footpath ends are dead ends
  const has = (dc, dr, bit) => (join & bit) !== 0 || _connectorTiles.has((c + dc) + ',' + (r + dr));
  return { N: has(0, -1, 1), S: has(0, 1, 2), W: has(-1, 0, 4), E: has(1, 0, 8), join, x: c * TILE, y: r * TILE };
}

// Draws every connector tile in a redraw band as a batched set of layers:
// gravel shoulders, a two-lane asphalt carriageway with worn tyre tracks
// and oil drip lines, edge and dashed centre markings (curving through
// bends), junction stop lines, give-way lines where a road meets a zone,
// weathering (repair patches, cracks, stains, manholes), reflector posts
// and street lamps that pool light after dark. Tile-local offsets are
// symmetric across the road, so straights and bends line up; all
// randomness is hashed off world tiles so separately drawn bands match.
function _drawConnectorRoads(g, cStart, cEnd, rStart, rEnd, shade, dark, lod) {
  const T = TILE, SH = 4;   // SH: gravel shoulder width, px
  const col = (R, G, B, a) => `rgba(${Math.round(Math.max(0, Math.min(255, R*shade)))},${Math.round(Math.max(0, Math.min(255, G*shade)))},${Math.round(Math.max(0, Math.min(255, B*shade)))},${a === undefined ? 1 : a})`;
  const gravel = new Path2D(), grit = new Path2D(), weeds = new Path2D();
  const asphalt = new Path2D(), speck = new Path2D(), speckDark = new Path2D(), patches = new Path2D(), cracks = new Path2D();
  const blotchLight = new Path2D(), blotchDark = new Path2D();
  const wear = new Path2D(), wearArc = new Path2D(), drip = new Path2D();
  const white = new Path2D(), whiteArc = new Path2D(), yellow = new Path2D(), yellowArc = new Path2D();
  const stains = [], manholes = [], posts = [], lamps = [];
  let any = false;

  for (let r = rStart; r < rEnd; r++) for (let c = cStart; c < cEnd; c++) {
    if (!_connectorTiles.has(c + ',' + r)) continue;
    any = true;
    const { N, S, W, E, join, x, y } = _connectorNeighbours(c, r);
    const cx = x + T/2, cy = y + T/2, arms = N + S + W + E;
    const h1 = _nbHash(c, r, 911), h2 = _nbHash(c, r, 912), h3 = _nbHash(c, r, 913);

    gravel.rect(x, y, T, T);
    if (lod > 0) {
      for (let k = 0; k < 8; k++) grit.rect(x + _nbHash(c, r, 920 + k) * T, y + _nbHash(c, r, 930 + k) * T, 1.3, 1.3);
      for (let k = 0; k < 16; k++) (k % 3 ? speck : speckDark).rect(x + 4 + _nbHash(c, r, 940 + k) * (T - 8), y + 4 + _nbHash(c, r, 950 + k) * (T - 8), 1.2, 1.2);
      const bx = x + _nbHash(c, r, 915) * T, by = y + _nbHash(c, r, 916) * T, br = 6 + h1 * 10;
      (h2 < 0.5 ? blotchLight : blotchDark).moveTo(bx + br, by);
      (h2 < 0.5 ? blotchLight : blotchDark).ellipse(bx, by, br, br * (0.5 + h3 * 0.5), h1 * Math.PI, 0, Math.PI*2);
    }
    const crack = (x0, y0, x1, y1, salt) => {
      let px = x0 + _nbHash(c, r, salt) * (x1 - x0), py = y0 + _nbHash(c, r, salt + 1) * (y1 - y0);
      cracks.moveTo(px, py);
      for (let k = 0; k < 5; k++) {
        px = Math.max(x0, Math.min(x1, px + (_nbHash(c, r, salt + 2 + k) - 0.5) * 14));
        py = Math.max(y0, Math.min(y1, py + (_nbHash(c, r, salt + 9 + k) - 0.5) * 14));
        cracks.lineTo(px, py);
      }
    };

    if (arms === 2 && ((W && E) || (N && S))) {
      // Straight: `o`/`w` measure across the road, `a`/`len` along it
      const horiz = W && E;
      const add = (p, o, w, a = 0, len = T) => horiz ? p.rect(x + a, y + o, len, w) : p.rect(x + o, y + a, w, len);
      add(asphalt, SH, T - SH*2);
      add(wear, 9, 3); add(wear, 28, 3);
      add(drip, 13.5, 1.5); add(drip, 25, 1.5);
      add(white, SH + 1.5, 1.2); add(white, T - SH - 2.7, 1.2);
      const startJoin = join & (horiz ? 4 : 1), endJoin = join & (horiz ? 8 : 2);
      if (!startJoin && !endJoin) { add(yellow, T/2 - 0.8, 1.6, 2, 12); add(yellow, T/2 - 0.8, 1.6, 22, 12); }
      else add(yellow, T/2 - 0.8, 1.6, startJoin ? 14 : 6, 20);
      // Give-way line where the road opens into a zone
      for (const [on, a] of [[startJoin, 2.5], [endJoin, T - 4.5]]) {
        if (!on) continue;
        for (let k = 0; k < 5; k++) add(white, SH + 2.5 + k*6.4, 3.4, a, 2);
      }
      if (h1 < 0.16) add(patches, h2 < 0.5 ? SH + 3 : T/2 + 1, T/2 - SH - 4, 4 + h2*14, 10 + h3*10);
      if (h2 < 0.3) crack(x + 7, y + 7, x + T - 7, y + T - 7, 960);
      if (h3 < 0.18) stains.push([horiz ? x + 8 + h1*24 : x + (h2 < 0.5 ? 13.5 : 26.5), horiz ? y + (h2 < 0.5 ? 13.5 : 26.5) : y + 8 + h1*24, horiz]);
      if (h3 > 0.94) manholes.push([horiz ? x + 12 + h1*16 : x + 20, horiz ? y + 20 : y + 12 + h1*16]);
      const along = horiz ? c : r;
      if (lod > 0 && along % 3 === 0) {
        posts.push(horiz ? [cx, y + 1.8] : [x + 1.8, cy]);
        posts.push(horiz ? [cx, y + T - 1.8] : [x + T - 1.8, cy]);
      }
      if (along % 8 === 4) {
        const far = along % 16 === 4;
        lamps.push(horiz ? [x + 10, far ? y + 2 : y + T - 2] : [far ? x + 2 : x + T - 2, y + 10]);
      }
      if (lod > 0) {
        for (const side of [0, 1]) {
          if (_nbHash(c, r, 970 + side) > 0.45) continue;
          const a = 6 + _nbHash(c, r, 972 + side) * 28, base = side ? T : 0, dir = side ? -1 : 1;
          for (let k = -1; k <= 1; k++) {
            if (horiz) { weeds.moveTo(x + a + k*1.8, y + base); weeds.lineTo(x + a + k*2.6, y + base + dir*3.2); }
            else       { weeds.moveTo(x + base, y + a + k*1.8); weeds.lineTo(x + base + dir*3.2, y + a + k*2.6); }
          }
        }
      }
    } else if (arms === 2) {
      // Bend: arcs centred on the tile corner shared by both arms
      const px = E ? x + T : x, py = S ? y + T : y;
      const a0 = px === x ? (py === y ? 0 : 1.5*Math.PI) : (py === y ? 0.5*Math.PI : Math.PI);
      const a1 = a0 + Math.PI/2;
      const ring = (p, rad) => { p.moveTo(px + Math.cos(a0)*rad, py + Math.sin(a0)*rad); p.arc(px, py, rad, a0, a1); };
      asphalt.moveTo(px + Math.cos(a0)*(T - SH), py + Math.sin(a0)*(T - SH));
      asphalt.arc(px, py, T - SH, a0, a1);
      asphalt.arc(px, py, SH, a1, a0, true);
      asphalt.closePath();
      ring(wearArc, 10.5); ring(wearArc, 29.5);
      ring(whiteArc, SH + 2.1); ring(whiteArc, T - SH - 2.1);
      ring(yellowArc, T/2);
      lamps.push([px === x ? x + T - 4 : x + 4, py === y ? y + T - 4 : y + 4]);
      if (lod > 0) for (const [ox, oy] of [[0.72, 0.9], [0.9, 0.72]]) {
        posts.push([px + (px === x ? 1 : -1) * ox * T, py + (py === y ? 1 : -1) * oy * T]);
      }
    } else if (arms >= 3) {
      // Junction: open box, stop line on the minor arm(s)
      const l = W ? 0 : SH, t = N ? 0 : SH, rr = E ? 0 : SH, b = S ? 0 : SH;
      asphalt.rect(x + l, y + t, T - l - rr, T - t - b);
      if (!N) white.rect(x, y + SH + 1.5, T, 1.2);
      if (!S) white.rect(x, y + T - SH - 2.7, T, 1.2);
      if (!W) white.rect(x + SH + 1.5, y, 1.2, T);
      if (!E) white.rect(x + T - SH - 2.7, y, 1.2, T);
      if (N && !S) white.rect(x + SH, y + 1, T/2 - SH, 2.4);
      if (S && !N) white.rect(cx, y + T - 3.4, T/2 - SH, 2.4);
      if (W && !E) white.rect(x + 1, cy, 2.4, T/2 - SH);
      if (E && !W) white.rect(x + T - 3.4, y + SH, 2.4, T/2 - SH);
      manholes.push([cx + (h1 - 0.5) * 8, cy + (h2 - 0.5) * 8]);
      lamps.push([!W ? x + 2 : x + T - 2, !N ? y + 2 : y + T - 2]);
      if (h3 < 0.4) crack(x + 8, y + 8, x + T - 8, y + T - 8, 980);
    } else {
      // Dead end (water gap or lone tile): turning circle
      asphalt.moveTo(cx + T/2 - SH, cy); asphalt.arc(cx, cy, T/2 - SH, 0, Math.PI*2);
      if (N) asphalt.rect(x + SH, y, T - SH*2, T/2);
      if (S) asphalt.rect(x + SH, cy, T - SH*2, T/2);
      if (W) asphalt.rect(x, y + SH, T/2, T - SH*2);
      if (E) asphalt.rect(cx, y + SH, T/2, T - SH*2);
      whiteArc.moveTo(cx + T/2 - SH - 2.1, cy); whiteArc.arc(cx, cy, T/2 - SH - 2.1, 0, Math.PI*2);
    }
  }
  if (!any) return;

  // Shoulders
  g.fillStyle = col(96, 90, 76); g.fill(gravel);
  g.fillStyle = col(136, 128, 112, 0.8); g.fill(grit);
  g.strokeStyle = col(74, 104, 50, 0.85); g.lineWidth = 1; g.stroke(weeds);

  // Carriageway, with weathering clipped to the asphalt
  g.fillStyle = col(50, 51, 54); g.fill(asphalt);
  g.save();
  g.clip(asphalt);
  g.fillStyle = col(62, 62, 64, 0.35); g.fill(blotchLight);
  g.fillStyle = col(36, 36, 38, 0.35); g.fill(blotchDark);
  g.fillStyle = col(104, 102, 98, 0.55); g.fill(speck);
  g.fillStyle = col(28, 28, 30, 0.6); g.fill(speckDark);
  g.fillStyle = col(74, 74, 76, 0.5); g.fill(wear);
  g.strokeStyle = col(74, 74, 76, 0.5); g.lineWidth = 3; g.stroke(wearArc);
  g.fillStyle = 'rgba(0,0,0,0.16)'; g.fill(drip);
  g.fillStyle = col(38, 39, 42); g.fill(patches);
  g.strokeStyle = col(26, 26, 28, 0.7); g.lineWidth = 1; g.stroke(patches);
  g.strokeStyle = col(24, 24, 26, 0.75); g.lineWidth = 0.9; g.stroke(cracks);
  for (const [sx, sy, horiz] of stains) {
    g.fillStyle = 'rgba(8,8,10,0.26)';
    g.beginPath(); g.ellipse(sx, sy, horiz ? 5 : 3, horiz ? 3 : 5, 0, 0, Math.PI*2); g.fill();
    g.fillStyle = 'rgba(8,8,10,0.2)';
    g.beginPath(); g.ellipse(sx + 2, sy + 1, 2, 1.5, 0, 0, Math.PI*2); g.fill();
  }
  g.restore();

  // Markings
  g.fillStyle = col(226, 224, 214, 0.85); g.fill(white);
  g.strokeStyle = col(226, 224, 214, 0.85); g.lineWidth = 1.2; g.stroke(whiteArc);
  g.fillStyle = col(230, 186, 56, 0.9); g.fill(yellow);
  g.strokeStyle = col(230, 186, 56, 0.9); g.lineWidth = 1.6;
  g.setLineDash([10, 8]); g.stroke(yellowArc); g.setLineDash([]);

  // Manhole covers
  for (const [mx, my] of manholes) {
    g.fillStyle = col(70, 70, 72); g.beginPath(); g.arc(mx, my, 4.5, 0, Math.PI*2); g.fill();
    g.strokeStyle = col(116, 114, 108); g.lineWidth = 1; g.stroke();
    g.strokeStyle = col(46, 46, 48); g.lineWidth = 0.7; g.beginPath();
    g.moveTo(mx - 3, my - 1.2); g.lineTo(mx + 3, my - 1.2); g.moveTo(mx - 3, my + 1.2); g.lineTo(mx + 3, my + 1.2);
    g.stroke();
  }

  // Reflector posts
  for (const [px, py] of posts) {
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(px - 0.3, py - 0.3, 2.4, 2.4);
    g.fillStyle = col(236, 236, 228); g.fillRect(px - 1, py - 1, 2, 2);
    g.fillStyle = dark > 0.2 ? 'rgb(255,120,60)' : col(200, 70, 40); g.fillRect(px - 0.6, py - 0.6, 1.2, 1.2);
  }

  _drawLamps(g, lamps, col, dark, '255,206,140', 40, 0.5, false);
}

// Where a connector road reaches a zone, so the two meet instead of the road
// just stopping at the kerb. Onto a zone with streets it opens as a side
// road does: the kerbs sweep out into the ring street, the pavement is cut
// through, and a zebra crossing carries the pavement over the mouth. At a
// zone with only walks the road has already ended in a turning circle (see
// _rebuildConnectorNetwork); here a footpath runs from it to the zone's
// perimeter walk. All of it lies on the zone's ring rather than the road
// tile, so this scans one tile beyond the redraw band and clips to it.
function _drawConnectorMouths(g, cStart, cEnd, rStart, rEnd, shade) {
  const T = TILE, SH = 4, HWR = T/2 - SH;   // HWR: half the carriageway, px
  const col = (R, G, B, a) => `rgba(${Math.round(R*shade)},${Math.round(G*shade)},${Math.round(B*shade)},${a === undefined ? 1 : a})`;
  const mouth = { commercial: new Path2D(), industrial: new Path2D() };
  const walk = { residential: new Path2D(), government: new Path2D() };
  const kerb = new Path2D(), zebra = new Path2D(), walkEdge = new Path2D();
  let any = false;
  for (let r = rStart - 1; r <= rEnd; r++) for (let c = cStart - 1; c <= cEnd; c++) {
    const v = _connectorTiles.get(c + ',' + r);
    if (!v) continue;
    for (const [bit, dx, dy] of [[1, 0, -1], [2, 0, 1], [4, -1, 0], [8, 1, 0]]) {
      if (!((v | (v >> 4)) & bit)) continue;
      const key = _zonePadKeyAt(c + dx, r + dy);
      if (!key) continue;
      any = true;
      // (u, w): u px past the tile edge into the zone, w px across the road
      const ex = c*T + T/2 + dx*T/2, ey = r*T + T/2 + dy*T/2;
      const X = (u, w) => ex + dx*u - dy*w, Y = (u, w) => ey + dy*u + dx*w;
      const box = (p, u0, w0, u1, w1) => p.rect(Math.min(X(u0, w0), X(u1, w1)), Math.min(Y(u0, w0), Y(u1, w1)), Math.abs(X(u1, w1) - X(u0, w0)), Math.abs(Y(u1, w1) - Y(u0, w0)));
      if (v & bit) {
        // d: the pavement between the pad edge and the ring street; F: how
        // far each kerb sweeps out along it
        const d = T/2 - 12, F = 7, M = mouth[key];
        M.moveTo(X(-0.5, -HWR), Y(-0.5, -HWR));
        M.quadraticCurveTo(X(d - 1, -HWR), Y(d - 1, -HWR), X(d - 1, -HWR - F), Y(d - 1, -HWR - F));
        M.lineTo(X(d + 1.5, -HWR - F), Y(d + 1.5, -HWR - F)); M.lineTo(X(d + 1.5, HWR + F), Y(d + 1.5, HWR + F));
        M.lineTo(X(d - 1, HWR + F), Y(d - 1, HWR + F));
        M.quadraticCurveTo(X(d - 1, HWR), Y(d - 1, HWR), X(-0.5, HWR), Y(-0.5, HWR));
        M.closePath();
        for (const sgn of [-1, 1]) {
          kerb.moveTo(X(-0.5, sgn*HWR), Y(-0.5, sgn*HWR));
          kerb.quadraticCurveTo(X(d - 1, sgn*HWR), Y(d - 1, sgn*HWR), X(d - 1, sgn*(HWR + F)), Y(d - 1, sgn*(HWR + F)));
        }
        for (let k = 0; k < 7; k++) box(zebra, 1.5, -13.7 + k*4.2, d - 1.5, -11.5 + k*4.2);
      } else {
        const hw = key === 'government' ? 10 : 7;   // the zone's own walk width
        box(walk[key], -SH - 1, -hw, T/2 - hw + 0.5, hw);
        for (const sgn of [-1, 1]) { walkEdge.moveTo(X(-SH, sgn*hw), Y(-SH, sgn*hw)); walkEdge.lineTo(X(T/2 - hw, sgn*hw), Y(T/2 - hw, sgn*hw)); }
      }
    }
  }
  if (!any) return;
  g.save();
  g.beginPath(); g.rect(cStart*T, rStart*T, (cEnd - cStart)*T, (rEnd - rStart)*T); g.clip();
  g.fillStyle = col(58, 60, 64); g.fill(mouth.commercial);
  g.fillStyle = col(50, 50, 52); g.fill(mouth.industrial);
  g.fillStyle = col(236, 234, 224, 0.8); g.fill(zebra);
  g.strokeStyle = col(214, 210, 198); g.lineWidth = 1.5; g.stroke(kerb);
  g.fillStyle = col(166, 160, 146); g.fill(walk.residential);
  g.fillStyle = col(190, 182, 162); g.fill(walk.government);
  g.strokeStyle = col(206, 202, 190, 0.9); g.lineWidth = 1.2; g.stroke(walkEdge);
  g.restore();
}

// Whether tile (c, r) carries a residential sidewalk — lets a house run its
// garden path down to the walk outside its door.
function nbIsSidewalk(c, r) {
  if (typeof ZoneSystem === 'undefined') return false;
  for (const rect of ZoneSystem.getZoneRects('residential')) {
    if (c < rect.minC - 1 || c > rect.maxC + 1 || r < rect.minR - 1 || r > rect.maxR + 1) continue;
    const p = _zoneGroundPlan('residential', rect);
    return p.path[(r - p.r0) * p.w + (c - p.c0)] === 1;
  }
  return false;
}

// Whether the house anchored at (c, r) stands on a residential lot (see
// _nbLots), and if so whether the lot has its own driveway. The house sprite
// uses it to leave the drive and car to the lot instead of drawing its
// own on the front lawn.
function nbHouseLot(c, r) {
  if (typeof ZoneSystem === 'undefined') return null;
  for (const rect of ZoneSystem.getZoneRects('residential')) {
    if (c < rect.minC - 1 || c > rect.maxC + 1 || r < rect.minR - 1 || r > rect.maxR + 1) continue;
    const L = _nbLots(_zoneGroundPlan('residential', rect));
    if (!L.byHouse) {   // built once per lot layout; this runs per house per frame
      L.byHouse = new Map(L.houses.map(H => [H.c + ',' + H.r, { hasDrive: false }]));
      for (const D of L.drive.values()) { const H = L.houses[D.id]; L.byHouse.get(H.c + ',' + H.r).hasDrive = true; }
    }
    return L.byHouse.get(c + ',' + r) || null;
  }
  return null;
}

// ── Shared drawing helpers ──────────────────────────────────────────
function _zoneGroundCtx(zoneKey, rect, cc0, cc1, rr0, rr1, shade) {
  const plan = _zoneGroundPlan(zoneKey, rect);
  const { c0, c1, r0, r1, w, path, blocked, front } = plan;
  const inZone = (c, r) => c >= c0 && c <= c1 && r >= r0 && r <= r1;
  return {
    plan, c0, c1, r0, r1,
    isPath:  (c, r) => inZone(c, r) && path[(r - r0) * w + (c - c0)] === 1,
    isOpen:  (c, r) => inZone(c, r) && !blocked[(r - r0) * w + (c - c0)] && !path[(r - r0) * w + (c - c0)],
    isFront: (c, r) => inZone(c, r) && front[(r - r0) * w + (c - c0)] === 1,
    isBlocked: (c, r) => inZone(c, r) && blocked[(r - r0) * w + (c - c0)] === 1,
    // the tile just outside the zone where a street runs into a tunnel
    isPortal: (c, r) => plan.portalAt.has(c + ',' + r),
    col: (R, G, B, a) => `rgba(${Math.round(Math.max(0, Math.min(255, R*shade)))},${Math.round(Math.max(0, Math.min(255, G*shade)))},${Math.round(Math.max(0, Math.min(255, B*shade)))},${a === undefined ? 1 : a})`,
    // Tile loops for features cover the redraw range plus one tile, clamped
    // to the zone, so anything straddling a band edge is drawn by both bands.
    lc0: Math.max(c0, cc0 - 1), lc1: Math.min(c1, cc1 + 1),
    lr0: Math.max(r0, rr0 - 1), lr1: Math.min(r1, rr1 + 1),
  };
}
function _circlePath(p, x, y, rad) { p.moveTo(x + rad, y); p.arc(x, y, rad, 0, Math.PI*2); }
// Base surface: one opaque fill per tone bucket over the redraw range.
function _zoneFillTones(g, cc0, cc1, rr0, rr1, salt, toneFn) {
  const tones = new Map();
  for (let r = rr0; r <= rr1; r++) for (let c = cc0; c <= cc1; c++) {
    const key = toneFn(c, r, _nbHash(c, r, salt));
    let p = tones.get(key); if (!p) { p = new Path2D(); tones.set(key, p); }
    p.rect(c*TILE, r*TILE, TILE, TILE);
  }
  return tones;
}
// A route tile's band, joined toward each neighbouring route tile.
function _bandRects(p, x, y, hw, N, S, W, E) {
  const cx = x + TILE/2, cy = y + TILE/2, arm = TILE/2 - hw;
  p.rect(cx - hw, cy - hw, hw*2, hw*2);
  if (N) p.rect(cx - hw, y, hw*2, arm);
  if (S) p.rect(cx - hw, cy + hw, hw*2, arm);
  if (W) p.rect(x, cy - hw, arm, hw*2);
  if (E) p.rect(cx + hw, cy - hw, arm, hw*2);
}
// Edge lines wherever a route band meets the ground beside it.
function _bandEdges(p, x, y, hw, N, S, W, E) {
  const cx = x + TILE/2, cy = y + TILE/2;
  const seg = (x1, y1, x2, y2) => { p.moveTo(x1, y1); p.lineTo(x2, y2); };
  const L = W ? x : cx - hw, R = E ? x + TILE : cx + hw, Tp = N ? y : cy - hw, B = S ? y + TILE : cy + hw;
  if (W) seg(L, cy - hw, cx - hw, cy - hw);
  if (!N) seg(cx - hw, cy - hw, cx + hw, cy - hw);
  if (E) seg(cx + hw, cy - hw, R, cy - hw);
  if (W) seg(L, cy + hw, cx - hw, cy + hw);
  if (!S) seg(cx - hw, cy + hw, cx + hw, cy + hw);
  if (E) seg(cx + hw, cy + hw, R, cy + hw);
  if (N) seg(cx - hw, Tp, cx - hw, cy - hw);
  if (!W) seg(cx - hw, cy - hw, cx - hw, cy + hw);
  if (S) seg(cx - hw, cy + hw, cx - hw, B);
  if (N) seg(cx + hw, Tp, cx + hw, cy - hw);
  if (!E) seg(cx + hw, cy - hw, cx + hw, cy + hw);
  if (S) seg(cx + hw, cy + hw, cx + hw, B);
}
function _forRouteTiles(Z, fn) {
  for (let r = Z.lr0; r <= Z.lr1; r++) for (let c = Z.lc0; c <= Z.lc1; c++) {
    if (!Z.isPath(c, r)) continue;
    // a street running out to a tunnel portal keeps going to the zone edge
    const on = (cc, rr) => Z.isPath(cc, rr) || Z.isPortal(cc, rr);
    fn(c, r, c*TILE, r*TILE, on(c, r - 1), on(c, r + 1), on(c - 1, r), on(c + 1, r));
  }
}
// Round deciduous canopies: shadow, darker rim, lobes, highlight.
function _drawCanopies(g, trees, col, dark) {
  if (!trees.length) return;
  const shadows = new Path2D();
  for (const [x, y, rad] of trees) { shadows.moveTo(x + 3 + rad, y + 4); shadows.ellipse(x + 3, y + 4, rad, rad*0.8, 0, 0, Math.PI*2); }
  g.fillStyle = `rgba(0,0,0,${(0.26 * (1 - dark*0.5)).toFixed(3)})`; g.fill(shadows);
  // These are baked into the ground layer, so they follow the seasons by
  // being repainted: the ground cache's key carries Seasons.foliageStep().
  // Each canopy turns, drops and regrows on its own cue (from its hv), in
  // step with the tree sprites (render_world_civic.js _seasonState).
  const fol = typeof Seasons !== 'undefined' ? Seasons.foliage() : null;
  const AUTUMN = [[204, 156, 44], [204, 104, 32], [172, 44, 30]];
  for (const [x, y, rad, hv] of trees) {
    const cue = (hv * 37.71) % 1, tint = Math.floor(((hv * 91.37) % 1) * 3) % 3;
    if (fol && fol.bare > cue) {
      // bare: a faint haze of twigs round the trunk
      g.fillStyle = col(104, 90, 78, 0.3);
      g.beginPath(); g.arc(x, y, rad * 0.9, 0, Math.PI*2); g.fill();
      g.strokeStyle = col(74, 60, 50, 0.7); g.lineWidth = Math.max(0.6, rad * 0.09);
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = k * 1.047 + hv * 6; g.moveTo(x, y); g.lineTo(x + Math.cos(a) * rad * 0.8, y + Math.sin(a) * rad * 0.8); }
      g.stroke();
      g.fillStyle = col(70, 54, 42); g.beginPath(); g.arc(x, y, Math.max(1, rad * 0.16), 0, Math.PI*2); g.fill();
      continue;
    }
    // In spring the blossoming share grows from the few always in flower to
    // about two in five, pink and white (Seasons.foliage().blossom).
    const bloom = fol ? 0.08 + 0.32 * (fol.blossom || 0) : 0.08;
    const base = fol && fol.turned > cue ? AUTUMN[tint]
               : hv < 0.08 ? [196, 128, 150]     // blossom
               : hv < bloom ? (tint ? [214, 150, 176] : [226, 214, 220])   // spring blossom, pink or white
               : hv < 0.14 ? [176, 110, 48]      // turning early
               : hv < 0.5  ? [46, 88, 38]
               : hv < 0.8  ? [58, 100, 40]
               :             [72, 98, 36];
    g.fillStyle = col(base[0]*0.72, base[1]*0.72, base[2]*0.72);
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI*2); g.fill();
    g.fillStyle = col(base[0], base[1], base[2]);
    g.beginPath();
    for (let k = 0; k < 4; k++) { const a = k*Math.PI/2 + hv*6; _circlePath(g, x + Math.cos(a)*rad*0.38, y + Math.sin(a)*rad*0.38, rad*0.6); }
    g.fill();
    g.fillStyle = col(base[0] + 40, base[1] + 40, base[2] + 30, 0.5);
    g.beginPath(); g.arc(x - rad*0.3, y - rad*0.35, rad*0.36, 0, Math.PI*2); g.fill();
  }
}
// Lamp posts / light masts, pooling light on the ground after dark.
function _drawLamps(g, lamps, col, dark, rgb, radius, strength, mast) {
  for (const [x, y] of lamps) {
    if (dark > 0.2) {
      const rg = g.createRadialGradient(x, y, 0, x, y, radius);
      rg.addColorStop(0, `rgba(${rgb},${(strength * dark).toFixed(3)})`);
      rg.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = rg; g.fillRect(x - radius, y - radius, radius*2, radius*2);
    }
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(x + 1.5, y + 1.5, mast ? 3.2 : 2.6, 0, Math.PI*2); g.fill();
    g.fillStyle = col(40, 40, 44);
    if (mast) g.fillRect(x - 2.6, y - 2.6, 5.2, 5.2); else { g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI*2); g.fill(); }
    g.fillStyle = dark > 0.2 ? `rgb(${rgb})` : col(150, 150, 140);
    if (mast) { g.fillRect(x - 4.5, y - 1, 2.4, 2); g.fillRect(x + 2.1, y - 1, 2.4, 2); }
    else { g.beginPath(); g.arc(x, y, 1.4, 0, Math.PI*2); g.fill(); }
  }
}
// Junctions and corners get a light; straights occasionally.
function _routeLightSpot(c, r, x, y, hw, N, S, W, E, lamps, straightChance) {
  const arms = N + S + W + E;
  const corner = arms === 2 && !(N && S) && !(W && E);
  if (arms >= 3 || corner || (arms === 2 && _nbHash(c, r, 70) < straightChance)) {
    const sx = (E && !W) ? -1 : 1, sy = (S && !N) ? -1 : 1;
    lamps.push([x + TILE/2 + sx*(hw + 3), y + TILE/2 + sy*(hw + 3)]);
  }
}

// ── Tunnel portals ───────────────────────────────────────────────────
// Where a zone street runs out at the zone's edge, it carries on into a
// tunnel: a short apron between concrete wingwalls, a stone headwall with
// an arched mouth, and a grassy mound over the bore. Drawn in a local
// frame — origin on the road's centre line where it leaves the paving, +x
// out of the zone — in units where the road is 2·hw wide; `scale` maps
// units to the caller's pixels (the old city's roads are much wider).
// Traffic uses fade()/CLIP to drive in: vehicles darken through the mouth
// and are clipped at the headwall, so they vanish under the hill.
const TunnelPortal = {
  HD: 12,        // apron length: road end → headwall face (units)
  CLIP: 13,      // vehicles are hidden beyond this (units)
  EXT: 30,       // how far past the road end traffic runs before looping (units)
  // Visibility of a vehicle whose centre is `e` units past the road end.
  fade(e) { return Math.max(0, Math.min(1, (this.HD + 6 - e) / 13)); },
  // Headwall lamp positions, local units.
  lamps(hw) { return [[this.HD + 4, -(hw + 6)], [this.HD + 4, hw + 6]]; },
  paint(g, x, y, ang, o) {
    const hw = o.hw, HD = this.HD, sh = o.shade == null ? 1 : o.shade;
    const col = (R, G, B, a) => `rgba(${Math.round(Math.min(255, R*sh))},${Math.round(Math.min(255, G*sh))},${Math.round(Math.min(255, B*sh))},${a === undefined ? 1 : a})`;
    const [gr, gg, gb] = o.grass || [78, 106, 54];
    const [ar, ag, ab] = o.road || [58, 60, 64];
    g.save();
    g.translate(x, y); g.rotate(ang); if (o.scale && o.scale !== 1) g.scale(o.scale, o.scale);
    // shadows fall down-right on screen whichever way the portal faces
    const cs = Math.cos(ang), sn = Math.sin(ang);
    const sx = 3*cs + 4*sn, sy = -3*sn + 4*cs;
    const RY = hw + 15, RX = 26;

    // Mound over the bore: shadow, grass, a darker rim and a lit crest.
    const mound = (p, dx, dy) => { p.moveTo(HD - 1 + dx, -RY + dy); p.ellipse(HD + dx, dy, RX, RY, 0, -Math.PI/2, Math.PI/2); p.closePath(); };
    const shadow = new Path2D(); mound(shadow, sx, sy);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fill(shadow);
    const hill = new Path2D(); mound(hill, 0, 0);
    g.fillStyle = col(gr*0.82, gg*0.82, gb*0.82); g.fill(hill);
    const crest = g.createRadialGradient(HD + 9, -4, 2, HD + 9, -4, RY);
    crest.addColorStop(0, col(gr*1.18, gg*1.16, gb*1.1)); crest.addColorStop(1, col(gr, gg, gb, 0));
    g.save(); g.clip(hill); g.fillStyle = crest; g.fillRect(HD - 2, -RY, RX + 2, RY*2); g.restore();
    g.strokeStyle = col(gr*0.6, gg*0.6, gb*0.6, 0.7); g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(HD, 0, RX, RY, 0, -Math.PI/2, Math.PI/2); g.stroke();
    // a few shrubs on the bank
    const hs = o.seed || 0;
    for (let k = 0; k < 4; k++) {
      const u = _nbHash(hs, k, 51), v = _nbHash(hs, k, 52);
      const bx = HD + 12 + u*10, by = (v - 0.5) * (RY*1.4), br = 2.2 + _nbHash(hs, k, 53)*1.8;
      if ((bx - HD)**2 / (RX*RX) + by*by / (RY*RY) > 0.8) continue;
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.arc(bx + sx*0.4, by + sy*0.4, br, 0, Math.PI*2); g.fill();
      g.fillStyle = col(gr*0.62, gg*0.72, gb*0.55); g.beginPath(); g.arc(bx, by, br, 0, Math.PI*2); g.fill();
      g.fillStyle = col(gr*0.95, gg*1.05, gb*0.8, 0.8); g.beginPath(); g.arc(bx - br*0.3, by - br*0.3, br*0.45, 0, Math.PI*2); g.fill();
    }

    // Wingwalls flaring out from the apron to the headwall
    for (const d of [-1, 1]) {
      g.fillStyle = col(128, 124, 116);
      g.beginPath();
      g.moveTo(-1, d*(hw + 0.5)); g.lineTo(-1, d*(hw + 3)); g.lineTo(HD, d*(hw + 9)); g.lineTo(HD, d*(hw + 0.5));
      g.closePath(); g.fill();
      g.strokeStyle = col(176, 172, 162); g.lineWidth = 1;
      g.beginPath(); g.moveTo(-1, d*(hw + 1)); g.lineTo(HD, d*(hw + 1)); g.stroke();
    }
    // Apron: the road carrying on to the mouth
    g.fillStyle = col(ar, ag, ab); g.fillRect(-1, -hw, HD + 2, hw*2);
    // Headwall across the bore, with its face toward the road in shadow
    g.fillStyle = col(150, 146, 136); g.fillRect(HD, -(hw + 9), 8, (hw + 9)*2);
    g.fillStyle = col(98, 94, 88); g.fillRect(HD, -(hw + 9), 1.6, (hw + 9)*2);
    g.fillStyle = col(184, 180, 170); g.fillRect(HD + 7, -(hw + 9), 1, (hw + 9)*2);
    g.strokeStyle = col(112, 108, 100, 0.55); g.lineWidth = 0.6;
    g.beginPath();
    for (let k = -(hw + 9) + 5; k < hw + 9; k += 5) { g.moveTo(HD + 1.6, k); g.lineTo(HD + 7, k); }
    g.stroke();
    // Arched mouth: a ring of voussoirs, then the dark bore fading in from
    // the apron.
    g.strokeStyle = col(176, 172, 160); g.lineWidth = 3;
    g.beginPath(); g.ellipse(HD, 0, 6.5, hw + 1.5, 0, -Math.PI/2, Math.PI/2); g.stroke();
    g.strokeStyle = col(110, 106, 98, 0.8); g.lineWidth = 0.7;
    g.beginPath();
    for (let k = 1; k < 8; k++) {
      const a = -Math.PI/2 + k * Math.PI / 8;
      g.moveTo(HD + Math.cos(a)*5, Math.sin(a)*(hw)); g.lineTo(HD + Math.cos(a)*8, Math.sin(a)*(hw + 3));
    }
    g.stroke();
    const bore = new Path2D();
    bore.moveTo(HD - 8, -(hw - 1)); bore.lineTo(HD, -(hw - 1));
    bore.ellipse(HD, 0, 5, hw - 1, 0, -Math.PI/2, Math.PI/2);
    bore.lineTo(HD - 8, hw - 1); bore.closePath();
    const dk = g.createLinearGradient(HD - 8, 0, HD + 4, 0);
    dk.addColorStop(0, 'rgba(6,6,8,0)'); dk.addColorStop(0.55, 'rgba(6,6,8,0.82)'); dk.addColorStop(1, 'rgba(4,4,6,0.97)');
    g.fillStyle = dk; g.fill(bore);
    // sodium lights inside the mouth
    if ((o.dark || 0) > 0.2) {
      g.fillStyle = `rgba(255,170,70,${(0.5 + 0.4*o.dark).toFixed(2)})`;
      for (const d of [-1, 1]) for (const k of [0, 1]) g.fillRect(HD - 2 + k*3.5, d*(hw - 2.5) - 0.7, 2, 1.4);
    }
    g.restore();
  },
  // Local frame → world, for lamps and clip lines.
  toWorld(x, y, ang, lx, ly, scale = 1) {
    const c = Math.cos(ang), s = Math.sin(ang);
    return [x + (lx*c - ly*s)*scale, y + (lx*s + ly*c)*scale];
  },
};

// ── Zone verges ──────────────────────────────────────────────────────
// A ring one tile wide just outside every zone's paved ground, so a zone
// doesn't stop dead in a hard rectangle against the wild grass: a mown
// strip along the edge, and planting in the zone's own style — shrub
// clumps round a neighbourhood, evenly spaced street trees round the
// shops, a dense screening belt round the industrial yards, a clipped
// hedge round the civic quarter. Skips water, anything built, connector
// roads, tunnel mouths and other zones. Drawn into the ground layer, so
// it's cached with the rest of it.
const _VERGE_STYLE = {
  residential: { shrubs: 0.75, tree: 0.3,  treeEvery: 0, hedge: false, dense: false },
  commercial:  { shrubs: 0.35, tree: 0,    treeEvery: 2, hedge: false, dense: false },
  industrial:  { shrubs: 1,    tree: 0.5,  treeEvery: 0, hedge: false, dense: true },
  government:  { shrubs: 0,    tree: 0.25, treeEvery: 0, hedge: true,  dense: false },
};
// Wires and thin posts stand in the verge rather than replacing it; without
// this a pole on the zone's edge cut a hole in the strip.
const _VERGE_THROUGH = new Set([T.WIRE, T.POLE, T.LAMP, T.CAMERA, T.UNDERGNDPIPE]);
function _drawZoneVerges(g, cStart, cEnd, rStart, rEnd, shade, dark, lod) {
  const T = TILE;
  const col = (R, G, B, a) => `rgba(${Math.round(Math.min(255, R*shade))},${Math.round(Math.min(255, G*shade))},${Math.round(Math.min(255, B*shade))},${a === undefined ? 1 : a})`;
  const mown = new Path2D(), fade = new Path2D(), shrubs = new Path2D(), shrubHi = new Path2D(), hedge = new Path2D();
  const trees = [];
  let any = false;
  for (const key of ['residential', 'commercial', 'industrial', 'government']) {
    const S = _VERGE_STYLE[key];
    for (const rect of ZoneSystem.getZoneRects(key)) {
      const z0 = rect.minC - 1, z1 = rect.maxC + 1, w0 = rect.minR - 1, w1 = rect.maxR + 1;   // paved extent
      if (z1 + 2 < cStart || z0 - 2 > cEnd || w1 + 2 < rStart || w0 - 2 > rEnd) continue;
      const plan = (key === 'commercial' || key === 'industrial') ? _zoneGroundPlan(key, rect) : null;
      for (let r = w0 - 1; r <= w1 + 1; r++) for (let c = z0 - 1; c <= z1 + 1; c++) {
        if (c >= z0 && c <= z1 && r >= w0 && r <= w1) { c = z1; continue; }   // jump the interior
        if (c < cStart - 1 || c > cEnd + 1 || r < rStart - 1 || r > rEnd + 1) continue;
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        if (WaterSystem.isWater(c, r) || _connectorTiles.has(c + ',' + r) || _insideAnyZonePad(c, r)) continue;
        if (plan && plan.portalAt.has(c + ',' + r)) continue;
        const e = GridManager.getEntity(c, r);
        if (e && !GridManager.isVegetation(e) && !_VERGE_THROUGH.has(e.type)) continue;
        any = true;
        const x = c*T, y = r*T;
        // which side(s) of this tile face the zone
        const N = r === w1 + 1, S2 = r === w0 - 1, W = c === z1 + 1, E = c === z0 - 1;
        const strip = 13;
        const corner = (S2 || N) && (E || W);
        if (corner) {
          // just the square where the two side strips meet
          const sx = E ? x + T - strip : x, sy = S2 ? y + T - strip : y;
          mown.rect(sx, sy, strip, strip);
          fade.rect(E ? sx - 6 : sx + strip, S2 ? sy - 6 : sy, 6, strip + 6);
          fade.rect(sx, S2 ? sy - 6 : sy + strip, strip, 6);
        } else {
          if (S2) { mown.rect(x, y + T - strip, T, strip); fade.rect(x, y + T - strip - 6, T, 6); }
          if (N)  { mown.rect(x, y, T, strip);             fade.rect(x, y + strip, T, 6); }
          if (E)  { mown.rect(x + T - strip, y, strip, T); fade.rect(x + T - strip - 6, y, 6, T); }
          if (W)  { mown.rect(x, y, strip, T);             fade.rect(x + strip, y, 6, T); }
        }
        // planting sits just beyond the mown strip, along the zone's side
        const hv = _nbHash(c, r, 520);
        const along = (u) => S2 ? [x + u*T, y + T - strip - 4] : N ? [x + u*T, y + strip + 4] : E ? [x + T - strip - 4, y + u*T] : [x + strip + 4, y + u*T];
        if (S.hedge && !corner) {
          const [hx, hy] = along(0), horiz = S2 || N;
          if (horiz) hedge.rect(hx, hy - 3, T, 6); else hedge.rect(hx - 3, hy, 6, T);
        }
        if (lod > 0 && S.shrubs > 0 && hv < S.shrubs) {
          const n = S.dense ? 4 : 2 + Math.floor(_nbHash(c, r, 521) * 2);
          for (let k = 0; k < n; k++) {
            const [sx, sy] = along(0.12 + (k + _nbHash(c, r, 522 + k)*0.6) / n * 0.8);
            const rad = (S.dense ? 4.5 : 3.4) + _nbHash(c, r, 530 + k)*2;
            _circlePath(shrubs, sx, sy, rad);
            _circlePath(shrubHi, sx - rad*0.3, sy - rad*0.3, rad*0.45);
          }
        }
        const spaced = S.treeEvery && ((S2 || N) ? c : r) % S.treeEvery === 0;
        if (!corner && (spaced || (S.tree && _nbHash(c, r, 523) < S.tree))) {
          const [tx, ty] = along(0.5 + (spaced ? 0 : (_nbHash(c, r, 524) - 0.5)*0.4));
          const out = 6;   // nudged outward, away from the zone
          trees.push([tx + (E ? -out : W ? out : 0), ty + (S2 ? -out : N ? out : 0), (S.dense ? 10 : 9) + _nbHash(c, r, 525)*3, _nbHash(c, r, 526)]);
        }
      }
    }
  }
  if (!any) return;
  g.save();
  g.beginPath(); g.rect(cStart*T, rStart*T, (cEnd - cStart)*T, (rEnd - rStart)*T); g.clip();
  g.fillStyle = col(78, 108, 54, 0.3); g.fill(fade);
  g.fillStyle = col(80, 112, 56, 0.8); g.fill(mown);
  g.fillStyle = 'rgba(0,0,0,0.22)'; g.save(); g.translate(1.5, 2); g.fill(hedge); g.fill(shrubs); g.restore();
  g.fillStyle = col(46, 86, 40); g.fill(hedge);
  g.save(); g.translate(-0.8, -1); g.fillStyle = col(70, 116, 54, 0.7); g.fill(hedge); g.restore();
  g.fillStyle = col(44, 82, 38); g.fill(shrubs);
  g.fillStyle = col(74, 118, 56, 0.8); g.fill(shrubHi);
  _drawCanopies(g, trees, col, dark);
  g.restore();
}

// ── Zone lights after dark ───────────────────────────────────────────
// Glows added on top of the night overlay (render_main_loop.js pass 8b), so
// they actually read as light instead of being dimmed with everything else:
// street lamps in every zone, porch lights on houses, shopfronts spilling
// light onto the pavement (warm for food and drink, cool for the rest) and
// sodium floodlights over the industrial loading aprons. Buildings only
// light up while powered. Positions come from each zone's plan and are
// cached with it; per frame it's a handful of pre-rendered glow blits.
const ZoneLights = (() => {
  const _sprites = new Map();   // 'r,g,b' → 64px radial glow canvas
  function sprite(rgb) {
    let s = _sprites.get(rgb);
    if (s) return s;
    s = document.createElement('canvas'); s.width = s.height = 64;
    const x = s.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.3, `rgba(${rgb},0.4)`); gr.addColorStop(0.65, `rgba(${rgb},0.1)`); gr.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    _sprites.set(rgb, s);
    return s;
  }
  const LAMP = { residential: [7, 0.12, '255,206,130', 24], commercial: [12, 0.2, '255,226,180', 26], industrial: [12, 0.08, '255,178,90', 38] };
  const _cache = new WeakMap();   // plan → light list
  function lightsFor(key, rect) {
    const plan = _zoneGroundPlan(key, rect);
    let L = _cache.get(plan);
    if (L) return L;
    L = [];   // [x, y, rx, ry, rgb, strength, entity|null]
    const [HW, chance, rgb, rad] = LAMP[key];
    const Z = _zoneGroundCtx(key, rect, plan.c0, plan.c1, plan.r0, plan.r1, 1);
    const lamps = [];
    _forRouteTiles(Z, (c, r, x, y, N, S, W, E) => _routeLightSpot(c, r, x, y, HW, N, S, W, E, lamps, chance));
    for (const [x, y] of lamps) L.push([x, y, rad, rad, rgb, 0.2, null]);
    for (let r = plan.r0; r <= plan.r1; r++) for (let c = plan.c0; c <= plan.c1; c++) {
      const e = GridManager.getEntity(c, r);
      if (!e || e.col !== c || e.row !== r || !e.fromRequest) continue;
      const w = e.width || 1, h = e.height || 1, fx = (c + w/2)*TILE, fy = (r + h)*TILE;
      if (key === 'residential' && e.type === T.HOUSE) L.push([fx, fy - 3, 16, 12, '255,206,130', 0.5, e]);
      else if (key === 'commercial' && e.type === T.COMMERCIAL) {
        const food = _COM_FOOD.has(e.commercialSubtype || '');
        L.push([fx, fy + 6, w*TILE*0.55, 22, food ? '255,184,100' : '190,220,255', 0.62, e]);
      } else if (key === 'industrial' && e.type === T.INDUSTRIAL) {
        L.push([fx, fy + 8, Math.max(40, w*TILE*0.45), 34, '255,176,84', 0.4, e]);
      }
    }
    _cache.set(plan, L);
    return L;
  }
  function render(ctx, dark, cStart, cEnd, rStart, rEnd) {
    if (dark < 0.2 || typeof ZoneSystem === 'undefined') return;
    const k = Math.min(1, (dark - 0.2) / 0.5);
    const x0 = cStart*TILE, x1 = cEnd*TILE, y0 = rStart*TILE, y1 = rEnd*TILE;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const key of ['residential', 'commercial', 'industrial']) {
      for (const rect of ZoneSystem.getZoneRects(key)) {
        if ((rect.maxC + 2)*TILE < x0 || (rect.minC - 2)*TILE > x1 || (rect.maxR + 2)*TILE < y0 || (rect.minR - 2)*TILE > y1) continue;
        for (const [x, y, rx, ry, rgb, s, e] of lightsFor(key, rect)) {
          if (x + rx < x0 || x - rx > x1 || y + ry < y0 || y - ry > y1) continue;
          if (e && !e.powered) continue;
          ctx.globalAlpha = s * k;
          ctx.drawImage(sprite(rgb), x - rx, y - ry, rx*2, ry*2);
        }
      }
    }
    ctx.restore();
  }
  return { render };
})();

// Portals on every zone's plan in range, clipped to the redraw area so
// cache strips butt together. Lamps go in the ground too: this layer is
// redrawn at each day-night step, like the zones' own street lights.
function _drawZonePortals(g, cStart, cEnd, rStart, rEnd, shade, dark) {
  let clipped = false;
  for (const key of ['commercial', 'industrial']) {
    for (const rect of ZoneSystem.getZoneRects(key)) {
      if (rect.maxC + 3 < cStart || rect.minC - 3 > cEnd || rect.maxR + 3 < rStart || rect.minR - 3 > rEnd) continue;
      const plan = _zoneGroundPlan(key, rect);
      for (const P of plan.portals) {
        if (P.oc + 1 < cStart || P.oc - 1 >= cEnd || P.or + 1 < rStart || P.or - 1 >= rEnd) continue;
        if (!clipped) {
          g.save(); g.beginPath(); g.rect(cStart*TILE, rStart*TILE, (cEnd - cStart)*TILE, (rEnd - rStart)*TILE); g.clip();
          clipped = true;
        }
        TunnelPortal.paint(g, P.x, P.y, P.ang, { hw: 12, shade, dark, road: key === 'industrial' ? [50, 50, 52] : [58, 60, 64], seed: P.oc * 131 + P.or });
        const col = (R, G, B, a) => `rgba(${Math.round(R*shade)},${Math.round(G*shade)},${Math.round(B*shade)},${a === undefined ? 1 : a})`;
        _drawLamps(g, TunnelPortal.lamps(12).map(([lx, ly]) => TunnelPortal.toWorld(P.x, P.y, P.ang, lx, ly)), col, dark, '255,196,120', 26, 0.26, false);
      }
    }
  }
  if (clipped) g.restore();
}

// ── Residential lots ─────────────────────────────────────────────────
// Each house claims a rectangle of lawn as its own lot: up to LOT_SIDE
// tiles either side of it and LOT_BACK tiles behind (houses face the
// sidewalk on the row below), split halfway with any neighbour, and never
// across a sidewalk — a lot only takes lawn in a block (a patch of open
// tiles bounded by walks and buildings) the house itself touches. Lawn too
// far from any house stays shared green. Each lot gets a boundary style
// (hedge, white picket or timber fence) and, where a side tile beside the
// house opens onto the sidewalk below, a driveway. Cached per plan, so it
// re-lays with the zone whenever a building changes.
const _nbLotCache = new WeakMap();
// Back-garden features by household wealth: how many (min, max) and from
// what. `first` is always included.
const _NB_GARDEN = {
  budget:  { n: [1, 2], kinds: ['washline', 'vegbeds', 'shed', 'swing', 'washline'] },
  mid:     { n: [2, 2], kinds: ['patio', 'shed', 'trampoline', 'swing', 'vegbeds', 'bbq', 'washline', 'paddling'] },
  premium: { n: [2, 3], kinds: ['patio', 'paddling', 'trampoline', 'bbq', 'shed', 'hottub', 'swing'] },
  luxury:  { n: [2, 3], kinds: ['patio', 'hottub', 'bbq', 'trampoline'], first: 'patio' },
};
const _NB_NEAR = new Set(['patio', 'hottub', 'bbq', 'paddling']);
const _NB_FAR  = new Set(['shed', 'vegbeds', 'washline']);
function _nbLots(plan) {
  let L = _nbLotCache.get(plan);
  if (L) return L;
  const { c0, c1, r0, r1, w, path, blocked } = plan;
  const LOT_SIDE = 2, LOT_BACK = 3;
  const n = w * (r1 - r0 + 1);
  const I = (c, r) => (r - r0) * w + (c - c0);
  const inside = (c, r) => c >= c0 && c <= c1 && r >= r0 && r <= r1;
  const open = (c, r) => inside(c, r) && !blocked[I(c, r)] && !path[I(c, r)];
  const owner = new Int32Array(n).fill(-1);
  const houses = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const e = GridManager.getEntity(c, r);
    if (!e || e.col !== c || e.row !== r || e.type !== T.HOUSE || !e.fromRequest) continue;
    houses.push({ c, r, w: e.width || 1, h: e.height || 1, style: _nbHash(c, r, 400), tint: _nbHash(c, r, 401),
                  tier: e.houseWealthTier || 'mid' });
  }
  // Blocks of open lawn
  const block = new Int32Array(n).fill(-1);
  let nb = 0;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (!open(c, r) || block[I(c, r)] >= 0) continue;
    const stack = [[c, r]]; block[I(c, r)] = nb;
    while (stack.length) {
      const [x, y] = stack.pop();
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nx = x + dx, ny = y + dy;
        if (open(nx, ny) && block[I(nx, ny)] < 0) { block[I(nx, ny)] = nb; stack.push([nx, ny]); }
      }
    }
    nb++;
  }
  houses.forEach((H, id) => {
    H.blocks = new Set();
    for (let r = H.r - 1; r <= H.r + H.h; r++) for (let c = H.c - 1; c <= H.c + H.w; c++) {
      if (inside(c, r) && block[I(c, r)] >= 0) H.blocks.add(block[I(c, r)]);
    }
    for (let r = H.r; r < H.r + H.h; r++) for (let c = H.c; c < H.c + H.w; c++) if (inside(c, r)) owner[I(c, r)] = id;
  });
  const blockHouses = Array.from({ length: nb }, () => []);
  houses.forEach((H, id) => { for (const b of H.blocks) blockHouses[b].push(id); });
  // Each lawn tile goes to the closest house it sits beside or behind —
  // sideways distance first, so neighbours split down a straight line; on an
  // exact tie the house further left / higher up keeps it.
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const k = I(c, r);
    if (block[k] < 0) continue;
    let best = -1, bestScore = Infinity;
    for (const id of blockHouses[block[k]]) {   // in house order, so ties keep the first
      const H = houses[id];
      const dc = Math.max(0, H.c - c, c - (H.c + H.w - 1));
      const back = H.r - r;   // >0: behind the house
      if (dc > LOT_SIDE || back > LOT_BACK || r > H.r + H.h - 1) continue;
      const score = dc * 10 + Math.max(0, back);
      if (score < bestScore) { bestScore = score; best = id; }
    }
    owner[k] = best;
  }
  // Driveway: the lot tile beside the house's bottom row whose tile below is
  // sidewalk. The side is picked per house; the other side is the fallback.
  const drive = new Map();   // tile index → { id, car }
  houses.forEach((H, id) => {
    const row = H.r + H.h - 1;
    const sides = _nbHash(H.c, H.r, 402) < 0.5 ? [H.c + H.w, H.c - 1] : [H.c - 1, H.c + H.w];
    for (const c of sides) {
      if (!inside(c, row) || !inside(c, row + 1)) continue;
      const k = I(c, row);
      if (owner[k] !== id || drive.has(k) || !path[I(c, row + 1)]) continue;
      drive.set(k, { id, car: _nbHash(H.c, H.r, 403) < 0.65, carHue: _nbHash(H.c, H.r, 404) });
      break;
    }
  });
  // Back gardens: a few features per lot, picked from the household's
  // wealth tier and laid out on the lot's own tiles behind the house (or
  // beside it, for a lot with no back garden) — the things used from the
  // house (patio, hot tub, barbecue) close to it, sheds, veg beds and the
  // washing line at the far end, play kit in between. One tile each.
  const feat = new Map();   // tile index → { kind, id, hv }
  houses.forEach((H, id) => {
    const spec = _NB_GARDEN[H.tier] || _NB_GARDEN.mid;
    const cand = [];
    for (let r = H.r - LOT_BACK; r < H.r + H.h; r++) for (let c = H.c - LOT_SIDE; c < H.c + H.w + LOT_SIDE; c++) {
      if (!inside(c, r)) continue;
      const k = I(c, r);
      if (owner[k] !== id || block[k] < 0 || drive.has(k)) continue;
      cand.push({ c, r, back: H.r - r, dc: Math.max(0, H.c - c, c - (H.c + H.w - 1)) });
    }
    const spots = cand.some(t => t.back > 0) ? cand.filter(t => t.back > 0) : cand;
    if (!spots.length) return;
    const used = new Set();
    const n =spec.n[0] + (_nbHash(H.c, H.r, 410) < 0.5 ? 0 : spec.n[1] - spec.n[0]);
    const kinds = spec.kinds.map((k, i) => [k, _nbHash(H.c, H.r, 420 + i)]).sort((a, b) => a[1] - b[1]).map(a => a[0]);
    if (spec.first) kinds.unshift(spec.first);
    for (const kind of [...new Set(kinds)].slice(0, n)) {
      const near = _NB_NEAR.has(kind), far = _NB_FAR.has(kind);
      const list = spots.filter(t => !used.has(I(t.c, t.r))).sort(
        near ? (a, b) => a.back - b.back || a.dc - b.dc
      : far  ? (a, b) => b.back - a.back || b.dc - a.dc
      :        (a, b) => Math.abs(a.back - 2) - Math.abs(b.back - 2) || a.dc - b.dc);
      if (!list.length) break;
      const t = list[0];
      used.add(I(t.c, t.r));
      feat.set(I(t.c, t.r), { kind, id, hv: _nbHash(t.c, t.r, 430) });
    }
    // A flower border along the back fence, and a tree in the far corner.
    H.border = H.tier !== 'budget' && _nbHash(H.c, H.r, 411) < 0.65;
    const rest = spots.filter(t => !used.has(I(t.c, t.r)));
    if (rest.length && _nbHash(H.c, H.r, 412) < 0.6) {
      const t = rest.sort((a, b) => b.back - a.back || b.dc - a.dc)[0];
      feat.set(I(t.c, t.r), { kind: 'tree', id, hv: _nbHash(t.c, t.r, 431), dir: Math.sign(t.c - H.c) });
    }
  });
  L = { owner, houses, drive, feat, I };
  _nbLotCache.set(plan, L);
  return L;
}

// Lot boundaries: round every lot's sides and back, against shared lawn,
// another lot or a side/back sidewalk — but never across the front (the
// edge onto the sidewalk below the house, so front gardens and driveways
// open onto the street) and never against a building wall. A shared edge
// is drawn once, in the style of the lower-numbered lot.
function _drawLotBoundaries(g, Z, lots, ownerAt, col) {
  const T = TILE;
  const segs = [[], [], []];   // hedge, picket, timber
  for (let r = Z.lr0; r <= Z.lr1; r++) for (let c = Z.lc0; c <= Z.lc1; c++) {
    const o = ownerAt(c, r);
    if (o < 0 || Z.isBlocked(c, r) || Z.isPath(c, r)) continue;
    const H = lots.houses[o], sv = H.style;
    const style = sv < 0.45 ? 0 : sv < 0.75 ? 1 : 2;
    const frontRow = H.r + H.h - 1;
    const x = c*T, y = r*T;
    for (const [dc, dr, x1, y1, x2, y2] of [[0, -1, x, y, x + T, y], [0, 1, x, y + T, x + T, y + T],
                                            [-1, 0, x, y, x, y + T], [1, 0, x + T, y, x + T, y + T]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < Z.c0 || nc > Z.c1 || nr < Z.r0 || nr > Z.r1) continue;
      const no = ownerAt(nc, nr);
      if (no === o || Z.isBlocked(nc, nr) || Z.isPortal(nc, nr)) continue;
      if (Z.isPath(nc, nr) && dr === 1 && r === frontRow) continue;   // open front
      if (no >= 0 && no < o) continue;   // the other lot draws this one
      segs[style].push([x1, y1, x2, y2]);
    }
  }
  const line = (list) => { const p = new Path2D(); for (const [a, b, c2, d] of list) { p.moveTo(a, b); p.lineTo(c2, d); } return p; };
  const posts = (list, step, size) => {
    const p = new Path2D();
    for (const [a, b, c2, d] of list) {
      const len = Math.hypot(c2 - a, d - b), n = Math.max(1, Math.round(len / step));
      for (let k = 0; k <= n; k++) { const u = k / n; p.rect(a + (c2 - a)*u - size/2, b + (d - b)*u - size/2, size, size); }
    }
    return p;
  };
  g.save();
  g.lineCap = 'round';
  // Hedges: a clipped box hedge, shadowed, with a lit top
  if (segs[0].length) {
    const p = line(segs[0]);
    g.save(); g.translate(1.6, 2); g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 7; g.stroke(p); g.restore();
    g.strokeStyle = col(34, 70, 30); g.lineWidth = 7; g.stroke(p);
    g.save(); g.translate(-0.8, -1); g.strokeStyle = col(58, 102, 44); g.lineWidth = 4; g.stroke(p); g.restore();
    const buds = new Path2D();
    for (const [a, b, c2, d] of segs[0]) for (let k = 1; k < 6; k++) {
      const u = k / 6, hx = a + (c2 - a)*u, hy = b + (d - b)*u;
      if (_nbHash(Math.round(hx), Math.round(hy), 405) < 0.5) _circlePath(buds, hx - 0.8 + (_nbHash(Math.round(hx), Math.round(hy), 406) - 0.5)*2, hy - 1, 1.3);
    }
    g.fillStyle = col(84, 132, 60, 0.85); g.fill(buds);
  }
  g.lineCap = 'butt';
  // White picket fence
  if (segs[1].length) {
    const p = line(segs[1]);
    g.save(); g.translate(1.2, 1.6); g.strokeStyle = g.fillStyle = 'rgba(0,0,0,0.24)'; g.lineWidth = 1.6; g.stroke(p); g.fill(posts(segs[1], 4, 1.8)); g.restore();
    g.strokeStyle = col(226, 224, 214); g.lineWidth = 1.2; g.stroke(p);
    g.fillStyle = col(244, 242, 234); g.fill(posts(segs[1], 4, 2));
  }
  // Timber panel fence
  if (segs[2].length) {
    const p = line(segs[2]);
    g.save(); g.translate(1.4, 1.8); g.strokeStyle = 'rgba(0,0,0,0.26)'; g.lineWidth = 2.6; g.stroke(p); g.restore();
    g.strokeStyle = col(132, 92, 58); g.lineWidth = 2.4; g.stroke(p);
    g.strokeStyle = col(166, 122, 80, 0.8); g.lineWidth = 0.8; g.stroke(p);
    g.fillStyle = col(98, 66, 40); g.fill(posts(segs[2], 13, 3.2));
  }
  g.restore();
}

// One back-garden feature, top-down, in the tile at (x, y).
function _drawGardenFeature(g, kind, x, y, hv, col, dark, lod) {
  const T = TILE;
  const shadow = (fn) => { g.save(); g.translate(1.6, 2); g.fillStyle = 'rgba(0,0,0,0.24)'; fn(); g.restore(); };
  const rr = (rx, ry, w, h, rad) => { g.beginPath(); g.roundRect(rx, ry, w, h, rad); g.fill(); };
  const circ = (cx, cy, rad) => { g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI*2); g.fill(); };
  const UMB = [[210, 60, 50], [240, 190, 60], [60, 130, 170], [240, 240, 232], [70, 140, 90]];
  switch (kind) {
    case 'patio': {
      g.fillStyle = col(192, 184, 168); g.fillRect(x + 5, y + 7, 30, 26);
      g.strokeStyle = col(150, 142, 128, 0.7); g.lineWidth = 0.8;
      g.beginPath();
      for (const dx of [10, 20]) { g.moveTo(x + 5 + dx, y + 7); g.lineTo(x + 5 + dx, y + 33); }
      g.moveTo(x + 5, y + 20); g.lineTo(x + 35, y + 20);
      g.stroke();
      g.fillStyle = col(64, 64, 68);
      for (const [dx, dy] of [[-8, 0], [8, 0], [0, -8], [0, 8]]) g.fillRect(x + 20 + dx - 2, y + 20 + dy - 2, 4, 4);
      shadow(() => circ(x + 20, y + 20, 5));
      g.fillStyle = col(236, 236, 230); circ(x + 20, y + 20, 5);
      if (hv < 0.55) {   // parasol
        const P = UMB[Math.floor(hv * 9) % UMB.length];
        shadow(() => circ(x + 20, y + 20, 10));
        for (let k = 0; k < 8; k++) {
          g.fillStyle = k % 2 ? col(P[0], P[1], P[2]) : col(P[0]*0.8 + 40, P[1]*0.8 + 40, P[2]*0.8 + 40);
          g.beginPath(); g.moveTo(x + 20, y + 20); g.arc(x + 20, y + 20, 10, k*Math.PI/4, (k + 1)*Math.PI/4); g.fill();
        }
      }
      break;
    }
    case 'paddling': {
      const ring = hv < 0.5 ? [236, 196, 60] : [222, 84, 84];
      shadow(() => circ(x + 20, y + 20, 10));
      g.fillStyle = col(ring[0], ring[1], ring[2]); circ(x + 20, y + 20, 10);
      g.fillStyle = col(84, 184, 222); circ(x + 20, y + 20, 7.5);
      g.fillStyle = 'rgba(255,255,255,0.35)'; circ(x + 17.5, y + 17.5, 2.2);
      break;
    }
    case 'hottub': {
      shadow(() => rr(x + 11, y + 11, 18, 18, 4));
      g.fillStyle = col(126, 86, 56); rr(x + 11, y + 11, 18, 18, 4);
      g.fillStyle = col(84, 186, 206); rr(x + 13.5, y + 13.5, 13, 13, 3);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      for (let k = 0; k < 5; k++) circ(x + 15 + _nbHash(k, Math.round(hv*100), 432)*10, y + 15 + _nbHash(k, Math.round(hv*100), 433)*10, 0.8);
      break;
    }
    case 'shed': {
      const roof = hv < 0.33 ? [72, 98, 74] : hv < 0.66 ? [124, 88, 60] : [108, 112, 118];
      const sx = x + 9, sy = y + 10;
      shadow(() => g.fillRect(sx, sy, 22, 16));
      g.fillStyle = col(roof[0], roof[1], roof[2]); g.fillRect(sx, sy, 22, 8);
      g.fillStyle = col(roof[0]*0.78, roof[1]*0.78, roof[2]*0.78); g.fillRect(sx, sy + 8, 22, 8);
      g.fillStyle = col(roof[0]*1.15 + 10, roof[1]*1.15 + 10, roof[2]*1.15 + 10); g.fillRect(sx, sy + 7.4, 22, 1.2);
      g.strokeStyle = col(roof[0]*0.55, roof[1]*0.55, roof[2]*0.55, 0.6); g.lineWidth = 0.6;
      g.beginPath(); for (let k = 4; k < 22; k += 4) { g.moveTo(sx + k, sy); g.lineTo(sx + k, sy + 16); } g.stroke();
      break;
    }
    case 'trampoline': {
      const rim = hv < 0.5 ? [44, 112, 190] : [60, 150, 80];
      g.fillStyle = 'rgba(0,0,0,0.24)'; g.beginPath(); g.ellipse(x + 22, y + 22, 12, 11, 0, 0, Math.PI*2); g.fill();
      g.fillStyle = col(rim[0], rim[1], rim[2]); circ(x + 20, y + 20, 12);
      g.fillStyle = col(28, 28, 32); circ(x + 20, y + 20, 9.5);
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 0.8;
      g.beginPath(); g.arc(x + 20, y + 20, 6, 0, Math.PI*2); g.stroke();
      break;
    }
    case 'washline': {
      const ly = y + 18;
      g.fillStyle = col(70, 70, 74);
      shadow(() => { g.fillRect(x + 5, ly - 1.5, 3, 3); g.fillRect(x + 32, ly - 1.5, 3, 3); });
      g.fillRect(x + 5, ly - 1.5, 3, 3); g.fillRect(x + 32, ly - 1.5, 3, 3);
      g.strokeStyle = col(200, 200, 196, 0.9); g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(x + 6.5, ly); g.lineTo(x + 33.5, ly); g.stroke();
      const CL = [[226, 80, 80], [240, 240, 236], [70, 120, 200], [240, 196, 60], [150, 90, 180], [90, 170, 120]];
      for (let k = 0; k < 5; k++) {
        const P = CL[Math.floor((hv*10 + k*1.7)) % CL.length], cx = x + 9 + k*5;
        g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(cx + 1, ly + 1.5, 3.4, 5.5);
        g.fillStyle = col(P[0], P[1], P[2]); g.fillRect(cx, ly + 0.5, 3.4, 5 + (k % 2));
      }
      break;
    }
    case 'vegbeds': {
      for (const by of [y + 8, y + 22]) {
        g.fillStyle = col(126, 94, 62); g.fillRect(x + 5, by, 30, 10);
        g.fillStyle = col(86, 60, 40);  g.fillRect(x + 6.5, by + 1.5, 27, 7);
      }
      g.fillStyle = col(84, 150, 62);
      for (const by of [y + 13, y + 27]) for (let k = 0; k < 7; k++) circ(x + 9 + k*3.8, by, 1.5);
      if (lod > 0 && hv < 0.4) { g.fillStyle = col(232, 130, 40); circ(x + 13, y + 27, 1.6); circ(x + 25, y + 27, 1.6); }
      break;
    }
    case 'swing': {
      const fc = hv < 0.5 ? [196, 64, 52] : [60, 120, 190];
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(x + 8.6, y + 14.8); g.lineTo(x + 30.6, y + 14.8); g.stroke();
      g.strokeStyle = col(fc[0], fc[1], fc[2]); g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(x + 7, y + 13); g.lineTo(x + 29, y + 13);
      for (const ex of [x + 7, x + 29]) { g.moveTo(ex, y + 13); g.lineTo(ex - 3, y + 9); g.moveTo(ex, y + 13); g.lineTo(ex - 3, y + 17); }
      g.stroke();
      g.fillStyle = col(50, 50, 54); g.fillRect(x + 12, y + 16, 5, 2.4); g.fillRect(x + 21, y + 16, 5, 2.4);
      g.fillStyle = col(240, 196, 60); g.fillRect(x + 28, y + 22, 6, 13);   // slide
      g.fillStyle = col(214, 168, 40); g.fillRect(x + 30, y + 22, 2, 13);
      break;
    }
    case 'bbq': {
      g.fillStyle = col(184, 176, 160); g.fillRect(x + 7, y + 9, 26, 22);
      g.fillStyle = col(70, 70, 74);
      for (const [dx, dy] of [[11, 26], [27, 26]]) g.fillRect(x + dx - 2, y + dy - 2, 4, 4);
      shadow(() => circ(x + 15, y + 17, 4.5));
      g.fillStyle = col(30, 30, 34); circ(x + 15, y + 17, 4.5);
      g.strokeStyle = col(110, 110, 114); g.lineWidth = 0.6;
      g.beginPath(); for (const d of [-2, 0, 2]) { g.moveTo(x + 12, y + 17 + d); g.lineTo(x + 18, y + 17 + d); } g.stroke();
      if (dark > 0.3) { g.fillStyle = 'rgba(255,120,40,0.7)'; circ(x + 15, y + 17, 1.6); }
      g.fillStyle = col(150, 108, 70); g.fillRect(x + 22, y + 13, 9, 9);   // side table
      break;
    }
  }
}

// ── Residential: sidewalks through a mown lawn ───────────────────────
function drawNeighbourhoodGround(g, rect, cc0, cc1, rr0, rr1, shade, dark, lod) {
  const T = TILE, HW = 7;   // HW: half the sidewalk width, px
  const Z = _zoneGroundCtx('residential', rect, cc0, cc1, rr0, rr1, shade);
  const { col, isPath, isOpen } = Z;

  // Lawn, with faint mowing stripes down the columns
  const lawn = _zoneFillTones(g, cc0, cc1, rr0, rr1, 1, (c, r, hv) => Math.floor(hv * 3) * 2 + (((c % 2) + 2) % 2));
  for (const [key, p] of lawn) {
    const k = key >> 1, st = key & 1 ? 2.5 : 0;
    g.fillStyle = col(60 + k*1.5 + st, 100 + k*2 + st, 43 + k + st*0.5);
    g.fill(p);
  }

  // Lots: each house's lawn is a shade apart from its neighbours'
  const lots = _nbLots(Z.plan);
  const ownerAt = (c, r) => (c < Z.c0 || c > Z.c1 || r < Z.r0 || r > Z.r1) ? -1 : lots.owner[lots.I(c, r)];
  {
    const lighter = new Path2D(), darker = new Path2D();
    for (let r = rr0; r <= rr1; r++) for (let c = cc0; c <= cc1; c++) {
      const o = ownerAt(c, r);
      if (o < 0 || !isOpen(c, r)) continue;
      const tv = lots.houses[o].tint;
      if (tv < 0.4) darker.rect(c*T, r*T, T, T); else if (tv > 0.6) lighter.rect(c*T, r*T, T, T);
    }
    g.fillStyle = 'rgba(0,0,0,0.055)'; g.fill(darker);
    g.fillStyle = 'rgba(255,255,200,0.04)'; g.fill(lighter);
  }

  g.strokeStyle = col(140, 136, 122, 0.85); g.lineWidth = 2;
  g.strokeRect(Z.c0*T + 1, Z.r0*T + 1, (Z.c1 - Z.c0 + 1)*T - 2, (Z.r1 - Z.r0 + 1)*T - 2);

  // Clover and daisy flecks
  if (lod > 0) {
    const daisies = new Path2D(), clover = new Path2D();
    for (let r = rr0; r <= rr1; r++) for (let c = cc0; c <= cc1; c++) {
      for (let k = 0; k < 3; k++) {
        const hv = _nbHash(c, r, 30 + k);
        if (hv > 0.45) continue;
        const x = c*T + 4 + _nbHash(c, r, 40 + k)*(T - 8), y = r*T + 4 + _nbHash(c, r, 50 + k)*(T - 8);
        _circlePath(hv < 0.15 ? daisies : clover, x, y, hv < 0.15 ? 1 : 1.6);
      }
    }
    g.fillStyle = col(232, 230, 210, 0.75 * lod); g.fill(daisies);
    g.fillStyle = col(84, 132, 58, 0.6 * lod);    g.fill(clover);
  }

  // Sidewalks
  const slabs = new Path2D(), joints = new Path2D(), kerbs = new Path2D();
  const lamps = [], trees = [];
  _forRouteTiles(Z, (c, r, x, y, N, S, W, E) => {
    const cx = x + T/2, cy = y + T/2;
    _bandRects(slabs, x, y, HW, N, S, W, E);
    _bandEdges(kerbs, x, y, HW, N, S, W, E);
    const jl = (x1, y1, x2, y2) => { joints.moveTo(x1, y1); joints.lineTo(x2, y2); };
    if (N) jl(cx - HW, cy - HW, cx + HW, cy - HW);
    if (S) { jl(cx - HW, cy + HW, cx + HW, cy + HW); jl(cx - HW, y + T, cx + HW, y + T); }
    if (W) jl(cx - HW, cy - HW, cx - HW, cy + HW);
    if (E) { jl(cx + HW, cy - HW, cx + HW, cy + HW); jl(x + T, cy - HW, x + T, cy + HW); }
    _routeLightSpot(c, r, x, y, HW, N, S, W, E, lamps, 0.12);
  });
  g.fillStyle = col(166, 160, 146); g.fill(slabs);
  g.strokeStyle = col(116, 110, 98, 0.6); g.lineWidth = 1; g.stroke(joints);
  g.strokeStyle = col(206, 202, 190, 0.9); g.lineWidth = 1.2; g.stroke(kerbs);

  // Driveways: a concrete strip down the side of the house, across the
  // verge into the sidewalk, with the family car on it most of the time.
  const DW = 9;   // half the driveway width, px
  const isDrive = (c, r) => ownerAt(c, r) >= 0 && lots.drive.has(lots.I(c, r));
  {
    const slab = new Path2D(), edge = new Path2D(), cars = [];
    for (let r = Z.lr0; r <= Z.lr1; r++) for (let c = Z.lc0; c <= Z.lc1; c++) {
      if (!isDrive(c, r)) continue;
      const D = lots.drive.get(lots.I(c, r));
      const x = c*T, y = r*T, cx = x + T/2;
      const top = y + 5, bot = (r + 1)*T + T/2 - HW;   // stops at the sidewalk's near edge
      slab.rect(cx - DW, top, DW*2, bot - top);
      edge.moveTo(cx - DW, top); edge.lineTo(cx - DW, bot);
      edge.moveTo(cx + DW, top); edge.lineTo(cx + DW, bot);
      edge.moveTo(cx - DW, top); edge.lineTo(cx + DW, top);
      if (D.car) cars.push([cx, y + T/2 + 1, D.carHue]);
    }
    g.fillStyle = col(150, 146, 136); g.fill(slab);
    g.strokeStyle = col(118, 112, 100, 0.8); g.lineWidth = 1; g.stroke(edge);
    // expansion joints
    const j = new Path2D();
    for (let r = Z.lr0; r <= Z.lr1; r++) for (let c = Z.lc0; c <= Z.lc1; c++) {
      if (!isDrive(c, r)) continue;
      const cx = c*T + T/2;
      for (const yy of [r*T + 18, r*T + 32]) { j.moveTo(cx - DW, yy); j.lineTo(cx + DW, yy); }
    }
    g.strokeStyle = col(124, 118, 106, 0.5); g.lineWidth = 0.8; g.stroke(j);
    const CAR = [[196, 48, 40], [232, 232, 228], [36, 40, 48], [52, 92, 170], [140, 144, 150], [200, 160, 50], [60, 110, 80], [120, 40, 52]];
    for (const [x, y, hv] of cars) {
      const P = CAR[Math.floor(hv * CAR.length) % CAR.length];
      const cw = 10, ch = 19;
      g.fillStyle = 'rgba(0,0,0,0.32)'; g.beginPath(); g.roundRect(x - cw/2 + 1.8, y - ch/2 + 2, cw, ch, 3); g.fill();
      g.fillStyle = col(P[0], P[1], P[2]);
      g.beginPath(); g.roundRect(x - cw/2, y - ch/2, cw, ch, 3); g.fill();
      g.fillStyle = col(P[0]*0.78, P[1]*0.78, P[2]*0.78);   // roof
      g.beginPath(); g.roundRect(x - cw/2 + 1.6, y - 2.5, cw - 3.2, 7, 1.5); g.fill();
      g.fillStyle = col(36, 48, 62);                         // windscreen + rear window (nose to the street)
      g.fillRect(x - cw/2 + 1.6, y + 4.6, cw - 3.2, 2.6);
      g.fillRect(x - cw/2 + 1.8, y - 4.8, cw - 3.6, 1.8);
      g.fillStyle = dark > 0.35 ? 'rgba(255,236,170,0.9)' : col(236, 232, 210);
      g.fillRect(x - cw/2 + 1, y + ch/2 - 1.4, 2, 1.2); g.fillRect(x + cw/2 - 3, y + ch/2 - 1.4, 2, 1.2);
    }
  }

  // Verge trees and garden details on the open lawn
  const beds = [], baths = [], shrubs = new Path2D(), stones = new Path2D();
  const garden = [], border = new Path2D(), blooms = [];
  for (let r = Z.lr0; r <= Z.lr1; r++) for (let c = Z.lc0; c <= Z.lc1; c++) {
    if (!isOpen(c, r) || isDrive(c, r)) continue;
    const x = c*T, y = r*T;
    const o = ownerAt(c, r);
    const F = o >= 0 ? lots.feat.get(lots.I(c, r)) : null;
    if (o >= 0) {
      const H = lots.houses[o];
      // flower border along the back fence
      if (H.border && r < H.r && ownerAt(c, r - 1) !== o) {
        border.rect(x + 1, y + 2, T - 2, 5);
        for (let k = 0; k < 6; k++) blooms.push([x + 4 + k*6 + _nbHash(c, r, 440 + k)*2, y + 4.5, _nbHash(c, r, 450 + k)]);
      }
      if (F) {
        if (F.kind === 'tree') trees.push([x + T/2 + (F.dir || 0)*6, y + 13, 9 + F.hv*3, F.hv]);
        else garden.push([F.kind, x, y, F.hv]);
        continue;
      }
    }
    const pN = isPath(c, r - 1), pS = isPath(c, r + 1), pW = isPath(c - 1, r), pE = isPath(c + 1, r);
    if ((pN || pS || pW || pE) && _nbHash(c, r, 60) < 0.3) {
      const ox = pW && !pE ? 6 : pE && !pW ? -6 : 0, oy = pN && !pS ? 6 : pS && !pN ? -6 : 0;
      trees.push([x + T/2 + ox + (_nbHash(c, r, 61) - 0.5)*6, y + T/2 + oy + (_nbHash(c, r, 62) - 0.5)*6, 8 + _nbHash(c, r, 63)*4, _nbHash(c, r, 64)]);
      continue;
    }
    // Inside a lot the garden is laid out above; random decor is for the shared green.
    if (lod <= 0 || o >= 0) continue;
    const hv = _nbHash(c, r, 20), jx = _nbHash(c, r, 21), jy = _nbHash(c, r, 22);
    if (hv < 0.06) {
      beds.push([x + 10 + jx*20, y + 12 + jy*16, _nbHash(c, r, 23)]);
    } else if (hv < 0.11) {
      for (let k = 0; k < 3; k++) _circlePath(shrubs, x + 12 + jx*14 + k*5, y + 14 + jy*12 + (k % 2)*3, 4 + _nbHash(c, r, 24 + k)*2.5);
    } else if (hv < 0.15) {
      for (let k = 0; k < 4; k++) {
        const sx = x + 7 + k*8, sy = y + 8 + k*8 + (jx - 0.5)*4;
        stones.moveTo(sx + 3.5, sy); stones.ellipse(sx, sy, 3.5, 2.6, 0, 0, Math.PI*2);
      }
    } else if (hv < 0.18) {
      trees.push([x + 12 + jx*16, y + 14 + jy*14, 7 + jy*3, _nbHash(c, r, 25)]);
    } else if (hv < 0.195) {
      baths.push([x + 14 + jx*12, y + 14 + jy*12]);
    }
  }
  if (lod > 0) {
    g.fillStyle = col(120, 116, 106); g.fill(stones);
    const pal = [[226, 90, 138], [240, 196, 48], [244, 240, 240], [176, 112, 224], [232, 112, 64]];
    for (const [x, y, hv] of beds) {
      g.fillStyle = col(78, 54, 36);
      g.beginPath(); g.ellipse(x, y, 11, 6, 0, 0, Math.PI*2); g.fill();
      for (let k = 0; k < 9; k++) {
        const a = k * 2.4, rad = 2 + (k % 3) * 2.6;
        const P = pal[(k + Math.floor(hv * 5)) % pal.length];
        g.fillStyle = col(P[0], P[1], P[2]);
        g.beginPath(); g.arc(x + Math.cos(a)*rad*1.6, y + Math.sin(a)*rad*0.8, 1.5, 0, Math.PI*2); g.fill();
      }
    }
    for (const [x, y] of baths) {
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(x + 2, y + 2, 4.5, 0, Math.PI*2); g.fill();
      g.fillStyle = col(176, 172, 162); g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI*2); g.fill();
      g.fillStyle = col(96, 160, 200);  g.beginPath(); g.arc(x, y, 3, 0, Math.PI*2); g.fill();
    }
    g.fillStyle = col(36, 72, 32); g.fill(shrubs);
  }
  // Back gardens
  g.fillStyle = col(86, 60, 40); g.fill(border);
  if (lod > 0) {
    const pal = [[226, 90, 138], [240, 196, 48], [244, 240, 240], [176, 112, 224], [232, 112, 64]];
    for (const [bx, by, hv] of blooms) {
      const P = pal[Math.floor(hv * pal.length) % pal.length];
      g.fillStyle = col(62, 112, 46); g.beginPath(); g.arc(bx, by + 0.6, 2.2, 0, Math.PI*2); g.fill();
      g.fillStyle = col(P[0], P[1], P[2]); g.beginPath(); g.arc(bx, by, 1.3, 0, Math.PI*2); g.fill();
    }
  }
  for (const [kind, x, y, hv] of garden) _drawGardenFeature(g, kind, x, y, hv, col, dark, lod);
  _drawLotBoundaries(g, Z, lots, ownerAt, col);
  _drawCanopies(g, trees, col, dark);
  _drawLamps(g, lamps, col, dark, '255,214,140', 26, 0.42, false);
}

// ── Commercial layout ────────────────────────────────────────────────
// What each patch of open ground in a commercial zone is for, from the
// businesses around it: parking only within reach of a business people
// drive to (a grocery, a mall, a car dealer...), a café terrace outside
// anywhere that serves food and drink, and a planted pocket plaza
// everywhere else. Shopfronts get an awning in the business's own colour.
// Cached per plan, like the residential lots.
const _COM_PARKING = new Set(['grocery', 'mall', 'galleria','cardealer', 'truckstop', 'autorepair', 'stadium', 'convention', 'hotel', 'motel', 'resorthotel',
  'venue', 'amusementpark', 'waterpark', 'holoarena', 'bowling', 'gym', 'marina', 'thunderridge', 'coldstorage', 'datacenter', 'savingsloan', 'icerink', 'hotsprings', 'cannery', 'nursery', 'superclub']);
const _COM_FOOD = new Set(['cafe', 'restaurant', 'fastfood', 'donutshop', 'hotdog', 'pizzeria', 'bakery', 'kakery', 'finedining', 'supperclub', 'nightclub', 'jazzbar', 'disco']);
const _COM_AWNING = new Set([..._COM_FOOD, 'clothing', 'pharmacy', 'grocery', 'gym', 'bowling', 'clinic', 'bank', 'savingsloan', 'boutiquehotel', 'lawoffice', 'library']);
const _COM_AWNING_COLS = [[196, 52, 44], [36, 112, 72], [40, 84, 160], [214, 150, 36], [120, 52, 120], [24, 120, 130], [176, 70, 100]];
const _comLayoutCache = new WeakMap();
function _comLayout(plan) {
  let L = _comLayoutCache.get(plan);
  if (L) return L;
  const { c0, c1, r0, r1, w } = plan;
  const I = (c, r) => (r - r0) * w + (c - c0);
  const bldgs = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const e = GridManager.getEntity(c, r);
    if (!e || e.col !== c || e.row !== r || e.type !== T.COMMERCIAL || !e.fromRequest) continue;
    const sub = e.commercialSubtype || '';
    bldgs.push({ e, c, r, w: e.width || 1, h: e.height || 1, sub,
                 food: _COM_FOOD.has(sub), parking: _COM_PARKING.has(sub), awning: _COM_AWNING.has(sub),
                 hue: _COM_AWNING_COLS[Math.floor(_nbHash(c, r, 500) * _COM_AWNING_COLS.length) % _COM_AWNING_COLS.length] });
  }
  // Chebyshev distance from a tile to a building's footprint
  const dist = (B, c, r) => Math.max(0, B.c - c, c - (B.c + B.w - 1), B.r - r, r - (B.r + B.h - 1));
  const kind = new Uint8Array(w * (r1 - r0 + 1));   // 0 plaza, 1 parking, 2 terrace
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    let k = 0;
    for (const B of bldgs) {
      const d = dist(B, c, r);
      if (B.food && d <= 1) { k = 2; break; }
      if (B.parking && d <= 1) k = 1;
    }
    kind[I(c, r)] = k;
  }
  // Which building a front tile belongs to
  const frontOf = new Map();
  bldgs.forEach((B, i) => { for (let k = 0; k < B.w; k++) frontOf.set(I(B.c + k, B.r + B.h), i); });
  L = { bldgs, kind, frontOf, I, inside: (c, r) => c >= c0 && c <= c1 && r >= r0 && r <= r1 };
  _comLayoutCache.set(plan, L);
  return L;
}

// ── Commercial: streets, shopfront pavements, parking and a plaza ────
function drawCommercialGround(g, rect, cc0, cc1, rr0, rr1, shade, dark, lod) {
  const T = TILE, HW = 12;   // HW: half the street width, px
  const Z = _zoneGroundCtx('commercial', rect, cc0, cc1, rr0, rr1, shade);
  const { col, isPath, isOpen, isFront } = Z;

  // Plaza: warm concrete slabs in a few tones, half-tile joints
  const tones = _zoneFillTones(g, cc0, cc1, rr0, rr1, 2, (c, r, hv) => Math.floor(hv * 3));
  for (const [k, p] of tones) { g.fillStyle = col(150 + k*5, 144 + k*5, 132 + k*4); g.fill(p); }
  {
    const j = new Path2D();
    for (let x = cc0*T; x <= (cc1 + 1)*T; x += T/2) { j.moveTo(x, rr0*T); j.lineTo(x, (rr1 + 1)*T); }
    for (let y = rr0*T; y <= (rr1 + 1)*T; y += T/2) { j.moveTo(cc0*T, y); j.lineTo((cc1 + 1)*T, y); }
    g.strokeStyle = col(116, 110, 100, 0.45); g.lineWidth = 1; g.stroke(j);
  }
  g.strokeStyle = col(206, 202, 192, 0.9); g.lineWidth = 2;
  g.strokeRect(Z.c0*T + 1, Z.r0*T + 1, (Z.c1 - Z.c0 + 1)*T - 2, (Z.r1 - Z.r0 + 1)*T - 2);

  // Streets: lane dashes on straights, zebra crossings into junctions
  const asphalt = new Path2D(), kerbs = new Path2D(), paint = new Path2D();
  const lamps = [], loading = [], busStops = [];
  const CLr = _comLayout(Z.plan);
  _forRouteTiles(Z, (c, r, x, y, N, S, W, E) => {
    const cx = x + T/2, cy = y + T/2, arm = T/2 - HW;
    _bandRects(asphalt, x, y, HW, N, S, W, E);
    _bandEdges(kerbs, x, y, HW, N, S, W, E);
    const arms = N + S + W + E;
    if (arms === 2 && W && E) { paint.rect(x + 4, cy - 0.7, 11, 1.4); paint.rect(x + 25, cy - 0.7, 11, 1.4); }
    else if (arms === 2 && N && S) { paint.rect(cx - 0.7, y + 4, 1.4, 11); paint.rect(cx - 0.7, y + 25, 1.4, 11); }
    if (arms >= 3) {
      for (let k = 0; k < 5; k++) {
        const o = -HW + 2.5 + k*4.2;
        if (N) paint.rect(cx + o, y + 1, 2.2, arm - 2);
        if (S) paint.rect(cx + o, cy + HW + 1, 2.2, arm - 2);
        if (W) paint.rect(x + 1, cy + o, arm - 2, 2.2);
        if (E) paint.rect(cx + HW + 1, cy + o, arm - 2, 2.2);
      }
    }
    _routeLightSpot(c, r, x, y, HW, N, S, W, E, lamps, 0.2);
    // Loading bays outside the businesses deliveries come to; the odd bus
    // stop along a straight stretch, its shelter on the pavement edge.
    if (arms === 2 && W && E) {
      const bi = CLr.inside(c, r) ? CLr.frontOf.get(CLr.I(c, r)) : undefined;
      if (bi !== undefined && CLr.bldgs[bi].parking && _nbHash(c, r, 511) < 0.6) loading.push([x, cy]);
      else if (bi === undefined && !isFront(c, r) && _nbHash(c, r, 510) < 0.07) busStops.push([x, y, cy]);
    }
  });
  g.fillStyle = col(58, 60, 64); g.fill(asphalt);
  g.fillStyle = col(236, 234, 224, 0.8); g.fill(paint);
  g.strokeStyle = col(214, 210, 198); g.lineWidth = 1.5; g.stroke(kerbs);
  for (const [x, cy] of loading) {
    const bx = x + 4, by = cy - HW + 2, bw = T - 8, bh = HW - 4;
    g.save(); g.beginPath(); g.rect(bx, by, bw, bh); g.clip();
    g.strokeStyle = col(226, 184, 44, 0.75); g.lineWidth = 1;
    g.beginPath(); for (let k = -bh; k < bw; k += 4) { g.moveTo(bx + k, by + bh); g.lineTo(bx + k + bh, by); } g.stroke();
    g.restore();
    g.strokeStyle = col(226, 184, 44); g.lineWidth = 1.2; g.strokeRect(bx, by, bw, bh);
  }
  for (const [x, y, cy] of busStops) {
    g.strokeStyle = col(226, 184, 44); g.lineWidth = 1.2; g.strokeRect(x + 2, cy - HW + 2, T - 4, HW - 4);
    g.fillStyle = col(226, 184, 44); g.font = 'bold 5px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('BUS', x + T/2, cy - HW/2);
    // shelter: glass box with a dark roof edge and a bench
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 9.5, y + 1.5, 22, 6);
    g.fillStyle = col(150, 190, 206, 0.75); g.fillRect(x + 8, y + 0.5, 22, 6);
    g.fillStyle = col(52, 56, 62); g.fillRect(x + 8, y + 0.5, 22, 1.6);
    g.fillStyle = col(128, 88, 54); g.fillRect(x + 11, y + 3.5, 16, 1.6);
  }

  // Shopfront pavement: a brick strip along the front of every building
  {
    const brick = new Path2D(), bj = new Path2D();
    for (let r = Z.lr0; r <= Z.lr1; r++) for (let c = Z.lc0; c <= Z.lc1; c++) {
      if (!isFront(c, r)) continue;
      const x = c*T, y = r*T, d = isPath(c, r) ? T/2 - HW : 12;
      brick.rect(x, y, T, d);
      for (let row = 0; row * 4 < d; row++) {
        bj.moveTo(x, y + row*4); bj.lineTo(x + T, y + row*4);
        for (let bx = x + (row % 2 ? 4 : 0); bx < x + T; bx += 8) { bj.moveTo(bx, y + row*4); bj.lineTo(bx, Math.min(y + d, y + row*4 + 4)); }
      }
    }
    g.fillStyle = col(156, 82, 60); g.fill(brick);
    g.strokeStyle = col(98, 50, 38, 0.55); g.lineWidth = 0.8; g.stroke(bj);
  }

  // Shopfronts: a striped awning in the business's colour along the front,
  // a pair of door planters and, now and then, an A-frame board.
  {
    const CLs = _comLayout(Z.plan);
    for (const B of CLs.bldgs) {
      if (!B.awning) continue;
      const fy = (B.r + B.h)*T;   // the building's front edge
      if (B.r + B.h < Z.lr0 || B.r + B.h > Z.lr1 + 1 || B.c > Z.lc1 + 1 || B.c + B.w < Z.lc0 - 1) continue;
      const ax0 = B.c*T + 4, ax1 = (B.c + B.w)*T - 4, AD = 6;
      const [hr, hg, hb] = B.hue;
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(ax0 + 1, fy + 2, ax1 - ax0, AD);
      for (let x = ax0, k = 0; x < ax1; x += 5, k++) {
        g.fillStyle = k % 2 ? col(238, 234, 222) : col(hr, hg, hb);
        g.fillRect(x, fy, Math.min(5, ax1 - x), AD);
      }
      // scalloped valance
      g.fillStyle = col(hr*0.8, hg*0.8, hb*0.8);
      g.beginPath();
      for (let x = ax0 + 2.5; x < ax1; x += 5) { g.moveTo(x + 2.5, fy + AD); g.arc(x, fy + AD, 2.5, 0, Math.PI); }
      g.fill();
      // no room for them where the street runs right along the shopfront
      if (lod <= 0 || isPath(B.c, B.r + B.h) || isPath(B.c + B.w - 1, B.r + B.h)) continue;
      // door planters either side, a board out front for food and drink
      for (const px of [ax0 + 2, ax1 - 9]) {
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + 1, fy + AD + 3, 7, 6);
        g.fillStyle = col(70, 70, 74); g.fillRect(px, fy + AD + 2, 7, 6);
        g.fillStyle = col(56, 104, 46); g.beginPath(); g.arc(px + 3.5, fy + AD + 3.5, 3.6, 0, Math.PI*2); g.fill();
      }
      if (B.food || _nbHash(B.c, B.r, 501) < 0.3) {
        const sx = B.c*T + T/2 + (_nbHash(B.c, B.r, 502) - 0.5)*12, sy = fy + AD + 3;
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(sx + 1, sy + 1, 6, 5);
        g.fillStyle = col(40, 40, 42); g.fillRect(sx, sy, 6, 5);
        g.fillStyle = col(230, 228, 216); g.fillRect(sx + 1, sy + 1, 4, 1); g.fillRect(sx + 1, sy + 3, 3, 0.8);
      }
    }
  }

  // Open ground: parking only near businesses people drive to, café
  // terraces outside food and drink, a planted pocket plaza elsewhere
  const CL = _comLayout(Z.plan);
  const kindAt = (c, r) => CL.inside(c, r) ? CL.kind[CL.I(c, r)] : 0;
  const bays = new Path2D(), bayLines = new Path2D();
  const cars = [], planters = [], benches = [], umbrellas = [], fountains = [], racks = new Path2D();
  const decks = new Path2D(), deckSeams = new Path2D(), lawns = new Path2D();
  for (let r = Z.lr0; r <= Z.lr1; r++) for (let c = Z.lc0; c <= Z.lc1; c++) {
    if (!isOpen(c, r) || isFront(c, r)) continue;
    const x = c*T, y = r*T;
    const pN = isPath(c, r - 1), pS = isPath(c, r + 1), pW = isPath(c - 1, r), pE = isPath(c + 1, r);
    const kind = kindAt(c, r);
    if (kind === 2) {   // café terrace: timber deck, two tables under parasols
      decks.rect(x + 2, y + 2, T - 4, T - 4);
      for (let k = 6; k < T - 2; k += 4) { deckSeams.moveTo(x + 2, y + k); deckSeams.lineTo(x + T - 2, y + k); }
      umbrellas.push([x + 12, y + 13, _nbHash(c, r, 85)], [x + 28, y + 27, _nbHash(c, r, 86)]);
      continue;
    }
    if (kind === 1 && (pN || pS || pW || pE) && _nbHash(c, r, 80) < 0.85) {
      bays.rect(x + 1, y + 1, T - 2, T - 2);
      const vertical = pN || pS;   // street above/below: stalls run up/down the tile
      for (let k = 0; k <= 4; k++) {
        if (vertical) bayLines.rect(x + 2 + k*9, y + (pN ? 3 : 9), 1.2, 28);
        else          bayLines.rect(x + (pW ? 3 : 9), y + 2 + k*9, 28, 1.2);
      }
      for (let k = 0; k < 4; k++) {
        if (_nbHash(c, r, 90 + k) < 0.55) {
          cars.push(vertical ? [x + 6.5 + k*9, y + 20, true, _nbHash(c, r, 95 + k)] : [x + 20, y + 6.5 + k*9, false, _nbHash(c, r, 95 + k)]);
        }
      }
      continue;
    }
    if (lod <= 0) continue;
    const hv = _nbHash(c, r, 81), jx = _nbHash(c, r, 82), jy = _nbHash(c, r, 83);
    if (hv < 0.24)       planters.push([x + 13 + jx*14, y + 13 + jy*14, _nbHash(c, r, 84)]);
    else if (hv < 0.36)  { lawns.rect(x + 5, y + 5, T - 10, T - 10); planters.push([x + T/2, y + T/2, _nbHash(c, r, 87), true]); benches.push([x + 6, y + T - 9, false]); }
    else if (hv < 0.48)  benches.push([x + 8 + jx*16, y + 10 + jy*18, jx > 0.5]);
    else if (hv < 0.51)  fountains.push([x + T/2, y + T/2]);
    else if (hv < 0.58)  { for (let k = 0; k < 4; k++) { racks.moveTo(x + 10 + k*5 + 2, y + 22); racks.arc(x + 10 + k*5, y + 22, 2, 0, Math.PI, true); } }
  }
  // terraces
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.save(); g.translate(1.2, 1.5); g.fill(decks); g.restore();
  g.fillStyle = col(150, 108, 70); g.fill(decks);
  g.strokeStyle = col(112, 78, 48, 0.7); g.lineWidth = 0.8; g.stroke(deckSeams);
  g.strokeStyle = col(96, 66, 40); g.lineWidth = 1.2; g.stroke(decks);
  // pocket-plaza lawns
  g.fillStyle = col(150, 146, 136); g.save(); g.translate(-1, -1); g.fill(lawns); g.restore();
  g.fillStyle = col(72, 112, 52); g.fill(lawns);
  g.fillStyle = col(62, 64, 68); g.fill(bays);
  g.fillStyle = col(232, 232, 224, 0.75); g.fill(bayLines);
  const CAR = [[196, 48, 40], [232, 232, 228], [36, 40, 48], [52, 92, 170], [140, 144, 150], [200, 160, 50], [60, 110, 80]];
  for (const [x, y, vertical, hv] of cars) {
    const P = CAR[Math.floor(hv * CAR.length) % CAR.length];
    const w = vertical ? 7 : 15, h = vertical ? 15 : 7;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - w/2 + 1.5, y - h/2 + 1.5, w, h);
    g.fillStyle = col(P[0], P[1], P[2]);
    g.beginPath(); g.roundRect(x - w/2, y - h/2, w, h, 2); g.fill();
    g.fillStyle = col(30, 40, 52);
    if (vertical) { g.fillRect(x - 2.6, y - 4.5, 5.2, 2.6); g.fillRect(x - 2.6, y + 2.8, 5.2, 1.8); }
    else          { g.fillRect(x - 4.5, y - 2.6, 2.6, 5.2); g.fillRect(x + 2.8, y - 2.6, 1.8, 5.2); }
  }
  if (lod > 0) {
    const trees = [];
    for (const [x, y, hv, inLawn] of planters) {
      if (!inLawn) {
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 7, y - 5, 16, 14);
        g.fillStyle = col(176, 172, 162); g.fillRect(x - 8, y - 8, 16, 16);
        g.fillStyle = col(74, 54, 38);    g.fillRect(x - 6, y - 6, 12, 12);
      }
      trees.push([x, y, inLawn ? 10.5 : 8.5, 0.2 + hv*0.8]);
    }
    for (const [x, y, vert] of benches) {
      g.fillStyle = 'rgba(0,0,0,0.25)'; if (vert) g.fillRect(x + 1.5, y + 1.5, 5, 15); else g.fillRect(x + 1.5, y + 1.5, 15, 5);
      g.fillStyle = col(128, 88, 54);   if (vert) g.fillRect(x, y, 5, 15); else g.fillRect(x, y, 15, 5);
      g.fillStyle = col(96, 64, 40);    if (vert) g.fillRect(x + 2.2, y, 0.8, 15); else g.fillRect(x, y + 2.2, 15, 0.8);
    }
    const UMB = [[210, 60, 50], [240, 190, 60], [60, 130, 170], [240, 240, 232], [70, 140, 90]];
    for (const [x, y, hv] of umbrellas) {
      const P = UMB[Math.floor(hv * UMB.length) % UMB.length];
      for (const [ox, oy] of [[-6, 4], [6, 4], [0, -6]]) { g.fillStyle = col(90, 70, 50); g.beginPath(); g.arc(x + ox, y + oy + 6, 1.5, 0, Math.PI*2); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(x + 2.5, y + 3, 9, 0, Math.PI*2); g.fill();
      for (let k = 0; k < 8; k++) {
        g.fillStyle = k % 2 ? col(P[0], P[1], P[2]) : col(Math.min(255, P[0] + 30), Math.min(255, P[1] + 30), Math.min(255, P[2] + 30));
        g.beginPath(); g.moveTo(x, y); g.arc(x, y, 9, k*Math.PI/4, (k + 1)*Math.PI/4); g.closePath(); g.fill();
      }
    }
    for (const [x, y] of fountains) {
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(x + 2, y + 2, 14, 0, Math.PI*2); g.fill();
      g.fillStyle = col(190, 186, 176); g.beginPath(); g.arc(x, y, 14, 0, Math.PI*2); g.fill();
      g.fillStyle = dark > 0.2 ? `rgba(90,190,240,${0.85})` : col(84, 156, 204); g.beginPath(); g.arc(x, y, 11, 0, Math.PI*2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 6.5, 0, Math.PI*2); g.stroke();
      g.fillStyle = col(200, 196, 186); g.beginPath(); g.arc(x, y, 3, 0, Math.PI*2); g.fill();
    }
    g.strokeStyle = col(60, 62, 66); g.lineWidth = 1; g.stroke(racks);
    _drawCanopies(g, trees, col, dark);
  }
  _drawLamps(g, lamps, col, dark, '225,238,255', 30, 0.4, false);
}

// The industrial buildings standing in a yard, and the pipe racks run
// between neighbours (side by side or one above the other, up to 5 tiles
// apart with a shared stretch of wall and nothing else built in between).
const _indLayoutCache = new WeakMap();
function _indLayout(plan) {
  let L = _indLayoutCache.get(plan);
  if (L) return L;
  const { c0, c1, r0, r1 } = plan;
  const B = [];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const e = GridManager.getEntity(c, r);
    if (e && e.col === c && e.row === r && e.type === T.INDUSTRIAL && e.fromRequest) B.push({ c, r, w: e.width || 1, h: e.height || 1 });
  }
  const clear = (ca, cb, ra, rb) => {   // no building inside the corridor
    for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) {
      const e = GridManager.getEntity(c, r);
      if (e && !GridManager.isVegetation(e) && (e.width > 1 || e.height > 1 || e.fromRequest)) return false;
    }
    return true;
  };
  const racks = [];   // [horizontal, x0, x1 | y0, y1, fixed]
  for (let i = 0; i < B.length; i++) for (let j = 0; j < B.length; j++) {
    if (i === j) continue;
    const a = B[i], b = B[j];
    const gapC = b.c - (a.c + a.w), lo = Math.max(a.r, b.r), hi = Math.min(a.r + a.h, b.r + b.h) - 1;
    if (gapC >= 1 && gapC <= 5 && hi >= lo && clear(a.c + a.w, b.c - 1, lo, hi)) {
      racks.push([true, (a.c + a.w)*TILE, b.c*TILE, ((lo + hi + 1)/2)*TILE]);
    }
    const gapR = b.r - (a.r + a.h), lo2 = Math.max(a.c, b.c), hi2 = Math.min(a.c + a.w, b.c + b.w) - 1;
    if (gapR >= 1 && gapR <= 5 && hi2 >= lo2 && clear(lo2, hi2, a.r + a.h, b.r - 1)) {
      racks.push([false, (a.r + a.h)*TILE, b.r*TILE, ((lo2 + hi2 + 1)/2)*TILE]);
    }
  }
  const near = (c, r) => B.some(q => Math.max(q.c - c, c - (q.c + q.w - 1), q.r - r, r - (q.r + q.h - 1)) <= 1);
  L = { B, racks, near };
  _indLayoutCache.set(plan, L);
  return L;
}
function _drawPipeRacks(g, racks, col) {
  const PIPES = [[-4, [150, 154, 158], 2.4], [0, [176, 104, 60], 2.2], [4, [206, 210, 214], 2.8]];   // steel, rust, lagged
  for (const [horiz, a0, a1, f] of racks) {
    const len = a1 - a0;
    g.fillStyle = 'rgba(0,0,0,0.24)';
    if (horiz) g.fillRect(a0, f - 5 + 3, len, 12); else g.fillRect(f - 5 + 3, a0, 12, len);
    g.fillStyle = col(70, 74, 78);   // steel bents
    for (let p = a0 + 4; p < a1 - 2; p += 14) { if (horiz) g.fillRect(p, f - 7, 2.6, 14); else g.fillRect(f - 7, p, 14, 2.6); }
    for (const [o, P, wd] of PIPES) {
      g.strokeStyle = col(P[0], P[1], P[2]); g.lineWidth = wd;
      g.beginPath(); if (horiz) { g.moveTo(a0, f + o); g.lineTo(a1, f + o); } else { g.moveTo(f + o, a0); g.lineTo(f + o, a1); } g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 0.6;
      g.beginPath(); if (horiz) { g.moveTo(a0, f + o - wd*0.3); g.lineTo(a1, f + o - wd*0.3); } else { g.moveTo(f + o - wd*0.3, a0); g.lineTo(f + o - wd*0.3, a1); } g.stroke();
    }
  }
}

// ── Industrial: a fenced yard with haul roads, aprons and storage ────
function drawIndustrialGround(g, rect, cc0, cc1, rr0, rr1, shade, dark, lod) {
  const T = TILE, HW = 12;   // HW: half the haul-road width, px
  const Z = _zoneGroundCtx('industrial', rect, cc0, cc1, rr0, rr1, shade);
  const { col, isPath, isOpen, isFront } = Z;

  // Yard surface: packed gravel with poured concrete slabs here and there
  const surf = _zoneFillTones(g, cc0, cc1, rr0, rr1, 3, (c, r, hv) => (hv < 0.35 ? 10 : 0) + Math.floor(_nbHash(c, r, 4) * 3));
  const seams = new Path2D();
  for (const [key, p] of surf) {
    const k = key % 10;
    g.fillStyle = key >= 10 ? col(112 + k*5, 110 + k*5, 104 + k*4) : col(90 + k*6, 84 + k*5, 72 + k*4);
    g.fill(p);
  }
  for (let r = rr0; r <= rr1; r++) for (let c = cc0; c <= cc1; c++) {
    if (_nbHash(c, r, 3) >= 0.35) continue;
    const x = c*T, y = r*T;
    seams.rect(x + 0.5, y + 0.5, T - 1, T - 1);
    seams.moveTo(x + T/2, y); seams.lineTo(x + T/2, y + T);
    seams.moveTo(x, y + T/2); seams.lineTo(x + T, y + T/2);
  }
  g.strokeStyle = col(66, 64, 58, 0.5); g.lineWidth = 1; g.stroke(seams);
  if (lod > 0) {
    const dk = new Path2D(), lt = new Path2D(), stains = new Path2D(), cracks = new Path2D();
    for (let r = rr0; r <= rr1; r++) for (let c = cc0; c <= cc1; c++) {
      const x = c*T, y = r*T;
      for (let k = 0; k < 6; k++) {
        const px = x + 2 + _nbHash(c, r, 110 + k)*(T - 4), py = y + 2 + _nbHash(c, r, 120 + k)*(T - 4);
        _circlePath(k % 2 ? dk : lt, px, py, 0.9);
      }
      const hv = _nbHash(c, r, 130);
      if (hv < 0.12) { const sx = x + 8 + _nbHash(c, r, 131)*24, sy = y + 8 + _nbHash(c, r, 132)*24; stains.moveTo(sx + 7, sy); stains.ellipse(sx, sy, 7, 4.5, _nbHash(c, r, 133)*3, 0, Math.PI*2); }
      else if (hv < 0.2) {
        let px = x + 4 + _nbHash(c, r, 134)*10, py = y + 6 + _nbHash(c, r, 135)*28;
        cracks.moveTo(px, py);
        for (let k = 0; k < 4; k++) { px += 6 + _nbHash(c, r, 136 + k)*4; py += (_nbHash(c, r, 140 + k) - 0.5)*8; cracks.lineTo(px, py); }
      }
    }
    g.fillStyle = col(60, 56, 50, 0.6);  g.fill(dk);
    g.fillStyle = col(150, 144, 130, 0.5); g.fill(lt);
    g.fillStyle = 'rgba(20,18,16,0.35)'; g.fill(stains);
    g.strokeStyle = col(50, 48, 44, 0.6); g.lineWidth = 0.8; g.stroke(cracks);
  }

  // Haul roads: yellow edge lines, tyre tracks, hatched junction boxes
  const asphalt = new Path2D(), edges = new Path2D(), tracks = new Path2D(), hatch = new Path2D();
  const masts = [];
  _forRouteTiles(Z, (c, r, x, y, N, S, W, E) => {
    const cx = x + T/2, cy = y + T/2;
    _bandRects(asphalt, x, y, HW, N, S, W, E);
    _bandEdges(edges, x, y, HW, N, S, W, E);
    const arms = N + S + W + E;
    if (arms === 2 && W && E) { for (const o of [-5, 5]) { tracks.moveTo(x, cy + o); tracks.lineTo(x + T, cy + o); } }
    else if (arms === 2 && N && S) { for (const o of [-5, 5]) { tracks.moveTo(cx + o, y); tracks.lineTo(cx + o, y + T); } }
    if (arms >= 3) {
      for (let k = -2; k <= 2; k++) {
        const o = k * 5;
        const a = Math.max(-HW + 2, o - (HW - 2)), b = Math.min(HW - 2, o + (HW - 2));
        hatch.moveTo(cx + a, cy + a - o); hatch.lineTo(cx + b, cy + b - o);
      }
      hatch.rect(cx - HW + 2, cy - HW + 2, (HW - 2)*2, (HW - 2)*2);
    }
    _routeLightSpot(c, r, x, y, HW, N, S, W, E, masts, 0.08);
  });
  g.fillStyle = col(50, 50, 52); g.fill(asphalt);
  g.strokeStyle = col(30, 30, 32, 0.45); g.lineWidth = 2; g.stroke(tracks);
  g.strokeStyle = col(220, 176, 44, 0.9); g.lineWidth = 1.4; g.stroke(edges);
  g.strokeStyle = col(220, 176, 44, 0.7); g.lineWidth = 1.2; g.stroke(hatch);

  // Loading aprons: hazard stripes and bollards along each building front
  {
    const yellow = new Path2D(), black = new Path2D(), bollards = new Path2D();
    for (let r = Z.lr0; r <= Z.lr1; r++) for (let c = Z.lc0; c <= Z.lc1; c++) {
      if (!isFront(c, r)) continue;
      const x = c*T, y = r*T;
      yellow.rect(x, y, T, 5);
      for (let k = 0; k < T; k += 6) { black.moveTo(x + k, y + 5); black.lineTo(x + k + 3, y + 5); black.lineTo(x + k + 6, y); black.lineTo(x + k + 3, y); black.closePath(); }
      _circlePath(bollards, x + 4, y + 9, 1.8); _circlePath(bollards, x + T - 4, y + 9, 1.8);
    }
    g.fillStyle = col(226, 180, 40); g.fill(yellow);
    g.save(); g.clip(yellow); g.fillStyle = col(30, 30, 30); g.fill(black); g.restore();
    g.fillStyle = col(236, 190, 40); g.fill(bollards);
  }

  // Open ground: storage stacked up beside the buildings it belongs to
  // (and only now and then out along a road), yard clutter elsewhere
  const IL = _indLayout(Z.plan);
  for (let r = Z.lr0; r <= Z.lr1; r++) for (let c = Z.lc0; c <= Z.lc1; c++) {
    if (!isOpen(c, r) || isFront(c, r)) continue;
    const x = c*T, y = r*T;
    const pN = isPath(c, r - 1), pS = isPath(c, r + 1), pW = isPath(c - 1, r), pE = isPath(c + 1, r);
    const hv = _nbHash(c, r, 150), kind = _nbHash(c, r, 151);
    const byBuilding = IL.near(c, r);
    if (byBuilding ? hv < 0.8 : ((pN || pS || pW || pE) && hv < 0.15)) {
      const along = pN || pS;   // lay long things parallel to the road beside them
      if (kind < 0.3) {
        const CON = [[176, 64, 48], [48, 96, 150], [60, 120, 80], [200, 140, 40], [120, 120, 124]];
        const P = CON[Math.floor(_nbHash(c, r, 152) * CON.length) % CON.length];
        const w = along ? 34 : 13, h = along ? 13 : 34;
        const bx = x + (T - w)/2, by = y + (T - h)/2;
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(bx + 2.5, by + 3, w, h);
        g.fillStyle = col(P[0], P[1], P[2]); g.fillRect(bx, by, w, h);
        g.strokeStyle = col(P[0]*0.7, P[1]*0.7, P[2]*0.7, 0.8); g.lineWidth = 0.7;
        g.beginPath();
        if (along) for (let k = bx + 2; k < bx + w; k += 2.2) { g.moveTo(k, by); g.lineTo(k, by + h); }
        else       for (let k = by + 2; k < by + h; k += 2.2) { g.moveTo(bx, k); g.lineTo(bx + w, k); }
        g.stroke();
        if (_nbHash(c, r, 153) < 0.4) {   // a second container stacked on top
          g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(bx + 1, by + 1, w - 2, h - 2);
          const Q = CON[Math.floor(_nbHash(c, r, 154) * CON.length) % CON.length];
          g.fillStyle = col(Q[0], Q[1], Q[2]); g.fillRect(bx - 1.5, by - 2, w, h);
        }
      } else if (kind < 0.55) {
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          if (_nbHash(c, r, 160 + i*2 + j) < 0.2) continue;
          const px = x + 7 + i*14, py = y + 7 + j*14;
          g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(px + 1.5, py + 2, 12, 12);
          const crate = _nbHash(c, r, 170 + i*2 + j) < 0.4;
          g.fillStyle = crate ? col(122, 90, 56) : col(158, 120, 76); g.fillRect(px, py, 12, 12);
          g.strokeStyle = col(92, 66, 40, 0.8); g.lineWidth = 0.7; g.beginPath();
          if (crate) { g.moveTo(px, py); g.lineTo(px + 12, py + 12); g.moveTo(px + 12, py); g.lineTo(px, py + 12); g.rect(px + 0.5, py + 0.5, 11, 11); }
          else for (let k = 2; k < 12; k += 3.3) { g.moveTo(px, py + k); g.lineTo(px + 12, py + k); }
          g.stroke();
        }
      } else if (kind < 0.8) {
        const DRUM = [[48, 96, 170], [180, 50, 40], [220, 180, 40], [70, 120, 70]];
        const P = DRUM[Math.floor(_nbHash(c, r, 175) * DRUM.length) % DRUM.length];
        for (let k = 0; k < 7; k++) {
          const px = x + 10 + (k % 3)*8 + (k >= 3 ? 4 : 0), py = y + 12 + Math.floor(k / 3)*8;
          if (py > y + 34) break;
          g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(px + 1.2, py + 1.5, 3.4, 0, Math.PI*2); g.fill();
          g.fillStyle = col(P[0], P[1], P[2]); g.beginPath(); g.arc(px, py, 3.4, 0, Math.PI*2); g.fill();
          g.strokeStyle = col(P[0]*0.6, P[1]*0.6, P[2]*0.6); g.lineWidth = 0.6; g.beginPath(); g.arc(px, py, 2.2, 0, Math.PI*2); g.stroke();
        }
      } else {
        // pipe stack, laid along the road
        for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row; k++) {
          const px = along ? x + 6 + row*2.6 + k*5.2 : x + 20 + (row - 1)*5, py = along ? y + 26 - row*5 : y + 6 + row*2.6 + k*5.2;
          if (along) { g.fillStyle = col(130, 134, 138); g.fillRect(px - 2.4, y + 10, 4.8, 22); }
          else       { g.fillStyle = col(130, 134, 138); g.fillRect(x + 9, py - 2.4, 22, 4.8); }
          g.fillStyle = col(96, 100, 104); g.beginPath(); g.arc(along ? px : x + 9, along ? y + 10 : py, 2.4, 0, Math.PI*2); g.fill();
          g.fillStyle = col(40, 42, 44); g.beginPath(); g.arc(along ? px : x + 9, along ? y + 10 : py, 1.2, 0, Math.PI*2); g.fill();
        }
      }
      continue;
    }
    if (lod <= 0) continue;
    if (kind < 0.1) {
      g.fillStyle = col(70, 84, 92, 0.7); g.beginPath(); g.ellipse(x + 20, y + 22, 12, 6, _nbHash(c, r, 180), 0, Math.PI*2); g.fill();
      g.fillStyle = 'rgba(200,220,235,0.25)'; g.beginPath(); g.ellipse(x + 17, y + 20, 5, 1.8, _nbHash(c, r, 180), 0, Math.PI*2); g.fill();
    } else if (kind < 0.24) {
      const weeds = new Path2D();
      for (let k = 0; k < 5; k++) _circlePath(weeds, x + 8 + _nbHash(c, r, 181 + k)*24, y + 8 + _nbHash(c, r, 186 + k)*24, 1.6 + _nbHash(c, r, 191 + k)*1.4);
      g.fillStyle = col(84, 108, 52, 0.85); g.fill(weeds);
    } else if (kind < 0.32) {
      const gx = x + 20, gy = y + 22;
      const rg = g.createRadialGradient(gx - 3, gy - 3, 1, gx, gy, 13);
      rg.addColorStop(0, col(188, 164, 118)); rg.addColorStop(1, col(120, 104, 76, 0.2));
      g.fillStyle = rg; g.beginPath(); g.ellipse(gx, gy, 13, 10, 0, 0, Math.PI*2); g.fill();
    } else if (kind < 0.4) {
      for (let k = 0; k < 6; k++) {
        const px = x + 10 + _nbHash(c, r, 200 + k)*20, py = y + 10 + _nbHash(c, r, 210 + k)*20, s = 2 + _nbHash(c, r, 220 + k)*3;
        g.fillStyle = _nbHash(c, r, 230 + k) < 0.5 ? col(128, 122, 112) : col(92, 86, 78);
        g.beginPath(); g.moveTo(px - s, py); g.lineTo(px - s*0.3, py - s*0.8); g.lineTo(px + s, py - s*0.2); g.lineTo(px + s*0.4, py + s*0.7); g.closePath(); g.fill();
      }
    }
  }

  _drawPipeRacks(g, IL.racks, col);

  // Security fence round the yard, with a gate on each side
  {
    const x0 = Z.c0*T + 2, y0 = Z.r0*T + 2, x1 = (Z.c1 + 1)*T - 2, y1 = (Z.r1 + 1)*T - 2;
    const mesh = new Path2D(), posts = new Path2D(), gates = [];
    const gateAt = (a0, a1, salt) => { const n = Math.max(1, Math.floor((a1 - a0) / T) - 2); return a0 + T*(1 + Math.floor(_nbHash(Z.c0, Z.r0, salt) * n)) + 6; };
    const side = (horizontal, fixed, a0, a1, salt, portalSide) => {
      // open gaps where a haul road leaves for a tunnel
      const gaps = Z.plan.portals.filter(p => p.side === portalSide)
        .map(p => { const m = horizontal ? p.x : p.y; return [m - HW - 2, m + HW + 2]; });
      let g0 = gateAt(a0, a1, salt), g1 = g0 + 28;
      // no barrier arm across a tunnel road
      if (gaps.some(([q0, q1]) => q0 < g1 + 4 && q1 > g0 - 4)) g0 = g1 = a0;
      else gates.push([horizontal, fixed, g0, g1]);
      const run = (b0, b1) => {
        for (const [q0, q1] of gaps) {
          if (q1 <= b0 || q0 >= b1) continue;
          run0(b0, q0); b0 = q1;
        }
        run0(b0, b1);
      };
      const run0 = (b0, b1) => {
        if (b1 <= b0) return;
        if (horizontal) { mesh.moveTo(b0, fixed); mesh.lineTo(b1, fixed); for (let p = b0; p <= b1; p += 20) posts.rect(p - 1.2, fixed - 1.2, 2.4, 2.4); }
        else            { mesh.moveTo(fixed, b0); mesh.lineTo(fixed, b1); for (let p = b0; p <= b1; p += 20) posts.rect(fixed - 1.2, p - 1.2, 2.4, 2.4); }
      };
      run(a0, g0); run(g1, a1);
    };
    side(true, y0, x0, x1, 240, 'N'); side(true, y1, x0, x1, 241, 'S');
    side(false, x0, y0, y1, 242, 'W'); side(false, x1, y0, y1, 243, 'E');
    g.strokeStyle = col(160, 164, 166, 0.7); g.lineWidth = 1.2; g.stroke(mesh);
    g.strokeStyle = col(160, 164, 166, 0.25); g.lineWidth = 3; g.stroke(mesh);
    g.fillStyle = col(70, 72, 74); g.fill(posts);
    for (const [horizontal, fixed, g0, g1] of gates) {
      // striped barrier arm across the gap, pivot post at one end
      const len = g1 - g0;
      for (let k = 0; k < 4; k++) {
        g.fillStyle = k % 2 ? col(236, 236, 230) : col(200, 40, 36);
        if (horizontal) g.fillRect(g0 + k*len/4, fixed - 1, len/4, 2); else g.fillRect(fixed - 1, g0 + k*len/4, 2, len/4);
      }
      g.fillStyle = col(60, 62, 64);
      if (horizontal) g.fillRect(g0 - 2.5, fixed - 2.5, 5, 5); else g.fillRect(fixed - 2.5, g0 - 2.5, 5, 5);
    }
  }
  _drawLamps(g, masts, col, dark, '255,184,96', 38, 0.34, true);   // sodium floodlights
}

// ── Government: a formal civic quarter ───────────────────────────────
function drawGovernmentGround(g, rect, cc0, cc1, rr0, rr1, shade, dark, lod) {
  const T = TILE, HW = 10;   // HW: half the promenade width, px
  const Z = _zoneGroundCtx('government', rect, cc0, cc1, rr0, rr1, shade);
  const { col, isPath, isOpen, isFront, isBlocked } = Z;
  // Open tiles touching a civic building are paved as its forecourt.
  const isForecourt = (c, r) => isOpen(c, r) && (isBlocked(c, r - 1) || isBlocked(c, r + 1) || isBlocked(c - 1, r) || isBlocked(c + 1, r));

  // Formal lawn, checkered like a mown croquet lawn
  const lawn = _zoneFillTones(g, cc0, cc1, rr0, rr1, 5, (c, r) => ((((c + r) % 2) + 2) % 2));
  for (const [k, p] of lawn) { g.fillStyle = k ? col(54, 96, 42) : col(60, 104, 46); g.fill(p); }

  // Forecourts: limestone slabs with half-tile joints
  {
    const slabs = new Path2D(), joints = new Path2D();
    for (let r = Z.lr0; r <= Z.lr1; r++) for (let c = Z.lc0; c <= Z.lc1; c++) {
      if (!isForecourt(c, r) && !isFront(c, r)) continue;
      const x = c*T, y = r*T;
      slabs.rect(x, y, T, T);
      joints.moveTo(x + T/2, y); joints.lineTo(x + T/2, y + T);
      joints.moveTo(x, y + T/2); joints.lineTo(x + T, y + T/2);
      joints.rect(x, y, T, T);
    }
    g.fillStyle = col(190, 182, 162); g.fill(slabs);
    g.strokeStyle = col(150, 142, 124, 0.55); g.lineWidth = 1; g.stroke(joints);
  }

  // Promenades: limestone with a granite border and an inlaid accent line
  const stone = new Path2D(), border = new Path2D(), inlay = new Path2D(), roses = [];
  const lamps = [];
  _forRouteTiles(Z, (c, r, x, y, N, S, W, E) => {
    _bandRects(stone, x, y, HW, N, S, W, E);
    _bandEdges(border, x, y, HW, N, S, W, E);
    _bandEdges(inlay, x, y, HW - 3.5, N, S, W, E);
    if (N + S + W + E >= 3) roses.push([x + T/2, y + T/2]);
    _routeLightSpot(c, r, x, y, HW, N, S, W, E, lamps, 0.25);
  });
  g.fillStyle = col(204, 196, 176); g.fill(stone);
  g.strokeStyle = col(150, 140, 120, 0.7); g.lineWidth = 0.8; g.stroke(inlay);
  g.strokeStyle = col(112, 108, 102); g.lineWidth = 2; g.stroke(border);
  for (const [x, y] of roses) {   // compass-rose inlay at junctions
    g.fillStyle = col(150, 140, 120, 0.8); g.beginPath(); g.arc(x, y, 7, 0, Math.PI*2); g.fill();
    g.fillStyle = col(214, 206, 186);
    g.beginPath(); g.moveTo(x, y - 6.5); g.lineTo(x + 2, y); g.lineTo(x, y + 6.5); g.lineTo(x - 2, y); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(x - 6.5, y); g.lineTo(x, y - 2); g.lineTo(x + 6.5, y); g.lineTo(x, y + 2); g.closePath(); g.fill();
  }

  // Grand steps across every building front
  {
    const tread = new Path2D(), riser = new Path2D();
    for (let r = Z.lr0; r <= Z.lr1; r++) for (let c = Z.lc0; c <= Z.lc1; c++) {
      if (!isFront(c, r)) continue;
      const x = c*T, y = r*T, d = isPath(c, r) ? T/2 - HW : 14;
      tread.rect(x, y, T, d);
      for (let k = 3.5; k < d; k += 3.5) { riser.moveTo(x, y + k); riser.lineTo(x + T, y + k); }
    }
    g.fillStyle = col(218, 212, 196); g.fill(tread);
    g.strokeStyle = col(140, 134, 120, 0.7); g.lineWidth = 1; g.stroke(riser);
  }

  // Lawns: clipped hedges along their paved edges, and civic features
  const hedges = new Path2D(), trees = [], features = [];
  for (let r = Z.lr0; r <= Z.lr1; r++) for (let c = Z.lc0; c <= Z.lc1; c++) {
    if (isForecourt(c, r)) {
      if (lod > 0 && _nbHash(c, r, 300) < 0.22) features.push(['flags', c*T, r*T, _nbHash(c, r, 301)]);
      continue;
    }
    if (!isOpen(c, r)) continue;
    const x = c*T, y = r*T;
    const paved = (cc, rr) => isPath(cc, rr) || isForecourt(cc, rr) || isFront(cc, rr);
    if (paved(c, r - 1)) hedges.rect(x + 1, y + 1, T - 2, 4);
    if (paved(c, r + 1)) hedges.rect(x + 1, y + T - 5, T - 2, 4);
    if (paved(c - 1, r)) hedges.rect(x + 1, y + 1, 4, T - 2);
    if (paved(c + 1, r)) hedges.rect(x + T - 5, y + 1, 4, T - 2);
    const hv = _nbHash(c, r, 310);
    if ((isPath(c, r - 1) || isPath(c, r + 1) || isPath(c - 1, r) || isPath(c + 1, r)) && hv < 0.35) {
      features.push(['planter', x + T/2, y + T/2]);
      trees.push([x + T/2, y + T/2, 10, 0.2 + _nbHash(c, r, 311)*0.8]);
    } else if (lod > 0) {
      if (hv < 0.47)      features.push(['statue', x + T/2, y + T/2, _nbHash(c, r, 312)]);
      else if (hv < 0.62) features.push(['parterre', x, y, _nbHash(c, r, 313)]);
      else if (hv < 0.68) features.push(['fountain', x + T/2, y + T/2]);
      else if (hv < 0.78) features.push(['bench', x + 12, y + 18]);
    }
  }
  g.fillStyle = col(34, 70, 34); g.fill(hedges);
  for (const [kind, x, y, hv] of features) {
    if (kind === 'planter') {
      g.fillStyle = col(176, 170, 156); g.beginPath(); g.arc(x, y, 9, 0, Math.PI*2); g.fill();
      g.fillStyle = col(70, 52, 38);    g.beginPath(); g.arc(x, y, 6.5, 0, Math.PI*2); g.fill();
    } else if (kind === 'statue') {
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 6, y - 4, 16, 16);
      g.fillStyle = col(196, 190, 176); g.fillRect(x - 8, y - 8, 16, 16);
      g.fillStyle = col(160, 154, 140); g.fillRect(x - 5.5, y - 5.5, 11, 11);
      g.fillStyle = hv < 0.5 ? col(84, 110, 92) : col(222, 218, 206);   // weathered bronze or marble
      g.beginPath(); g.arc(x, y, 3.8, 0, Math.PI*2); g.fill();
      g.beginPath(); g.arc(x + 1.5, y - 3.5, 1.9, 0, Math.PI*2); g.fill();
    } else if (kind === 'parterre') {
      const knot = new Path2D();
      knot.rect(x + 7, y + 7, 26, 26);
      knot.moveTo(x + 20, y + 7); knot.lineTo(x + 20, y + 33);
      knot.moveTo(x + 7, y + 20); knot.lineTo(x + 33, y + 20);
      knot.moveTo(x + 27, y + 20); knot.arc(x + 20, y + 20, 7, 0, Math.PI*2);
      g.strokeStyle = col(34, 72, 34); g.lineWidth = 2.6; g.stroke(knot);
      const P = hv < 0.33 ? [200, 60, 70] : hv < 0.66 ? [236, 200, 70] : [150, 100, 200];
      g.fillStyle = col(P[0], P[1], P[2]);
      for (const [ox, oy] of [[13.5, 13.5], [26.5, 13.5], [13.5, 26.5], [26.5, 26.5]]) { g.beginPath(); g.arc(x + ox, y + oy, 2.6, 0, Math.PI*2); g.fill(); }
    } else if (kind === 'fountain') {
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(x + 2, y + 2, 15, 0, Math.PI*2); g.fill();
      g.fillStyle = col(200, 194, 180); g.beginPath(); g.arc(x, y, 15, 0, Math.PI*2); g.fill();
      g.fillStyle = dark > 0.2 ? 'rgba(90,190,240,0.85)' : col(84, 156, 204); g.beginPath(); g.arc(x, y, 12, 0, Math.PI*2); g.fill();
      g.fillStyle = col(200, 194, 180); g.beginPath(); g.arc(x, y, 5, 0, Math.PI*2); g.fill();
      g.fillStyle = dark > 0.2 ? 'rgba(120,210,250,0.9)' : col(110, 180, 220); g.beginPath(); g.arc(x, y, 3, 0, Math.PI*2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 8.5, 0, Math.PI*2); g.stroke();
    } else if (kind === 'bench') {
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 1.5, y + 1.5, 16, 5);
      g.fillStyle = col(56, 58, 60);    g.fillRect(x, y, 16, 5);
      g.fillStyle = col(120, 86, 54);   g.fillRect(x + 1, y + 1, 14, 3);
    } else if (kind === 'flags') {
      const FL = [[40, 70, 150], [200, 50, 45], [236, 236, 230], [60, 130, 80], [230, 180, 50]];
      for (let k = 0; k < 3; k++) {
        const px = x + 10 + k*10, py = y + 30;
        const P = FL[(k + Math.floor(hv * FL.length)) % FL.length];
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(px + 1, py + 1, 1.8, 0, Math.PI*2); g.fill();
        g.fillStyle = col(90, 92, 96); g.beginPath(); g.arc(px, py, 1.6, 0, Math.PI*2); g.fill();
        g.strokeStyle = col(110, 112, 116); g.lineWidth = 1; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - 22); g.stroke();
        g.fillStyle = col(P[0], P[1], P[2]);
        g.beginPath(); g.moveTo(px, py - 22); g.quadraticCurveTo(px + 4, py - 23.5, px + 8, py - 21.5); g.lineTo(px + 8, py - 16.5); g.quadraticCurveTo(px + 4, py - 18.5, px, py - 17); g.closePath(); g.fill();
      }
    }
  }
  _drawCanopies(g, trees, col, dark);

  // Wrought-iron railing round the quarter, stone pillars at intervals
  {
    const x0 = Z.c0*T + 2, y0 = Z.r0*T + 2, x1 = (Z.c1 + 1)*T - 2, y1 = (Z.r1 + 1)*T - 2;
    const rail = new Path2D(), finials = new Path2D();
    rail.rect(x0, y0, x1 - x0, y1 - y0);
    for (let x = x0 + 4; x < x1; x += 4) { _circlePath(finials, x, y0, 0.9); _circlePath(finials, x, y1, 0.9); }
    for (let y = y0 + 4; y < y1; y += 4) { _circlePath(finials, x0, y, 0.9); _circlePath(finials, x1, y, 0.9); }
    g.strokeStyle = col(34, 36, 40); g.lineWidth = 1.6; g.stroke(rail);
    g.fillStyle = col(34, 36, 40); g.fill(finials);
    const pillars = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
    for (let x = x0 + T*3; x < x1 - T; x += T*3) pillars.push([x, y0], [x, y1]);
    for (let y = y0 + T*3; y < y1 - T; y += T*3) pillars.push([x0, y], [x1, y]);
    for (const [x, y] of pillars) {
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - 2.5, y - 2.5, 7, 7);
      g.fillStyle = col(196, 188, 170); g.fillRect(x - 3.5, y - 3.5, 7, 7);
      g.fillStyle = col(160, 152, 134); g.fillRect(x - 2, y - 2, 4, 4);
    }
  }
  _drawLamps(g, lamps, col, dark, '255,220,150', 28, 0.42, false);
}

// Draws the ground-noise texture, grid lines, and zone cobblestone overlay
  // onto whichever ctx is passed in. Pulled out unchanged from the old
  // inline render() code so it can target either the live canvas or the
  // offscreen background cache — same pixels, same logic, just callable.
  function drawStaticBackgroundLayer(targetCtx, cStart, cEnd, rStart, rEnd, _dark, zoom) {
    const _alpha = 0.88 - _dark * 0.3;
    // Simple value noise — sample on a coarse grid and interpolate
    function _vnoise(cx, cy, scale) {
      const SCALE = scale || 18; // larger = bigger patches
      const fx = cx / SCALE, fy = cy / SCALE;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const ux = fx - ix, uy = fy - iy;
      // Smooth step
      const sx = ux*ux*(3-2*ux), sy = uy*uy*(3-2*uy);
      function _rnd(gx, gy) {
        let h = (gx * 1619 + gy * 31337 + 12345) & 0x7fffffff;
        h = ((h >> 16) ^ h) * 0x45d9f3b | 0;
        h = ((h >> 16) ^ h) & 0x7fffffff;
        return h / 0x7fffffff;
      }
      return _rnd(ix,iy)*(1-sx)*(1-sy) + _rnd(ix+1,iy)*sx*(1-sy)
           + _rnd(ix,iy+1)*(1-sx)*sy   + _rnd(ix+1,iy+1)*sx*sy;
    }
    // Ground-cover mask strengths for a tile: [clover, straw, wildflowers],
    // each 0 (absent) .. 1 (patch core). Straw and wildflowers are biased by
    // the same meadow-region noise as the base colour so dry golden regions
    // actually grow straw and flowers, and lush regions grow clover.
    function _groundCover(c, r) {
      const tileKey = c * 10000 + r;
      let v = _groundCoverCache.get(tileKey);
      if (v) return v;
      const nRegion = _vnoise(c * 0.45 + 5000, r * 0.45 + 5000, 20);
      const nClover = _vnoise(c * 0.9 + 7000, r * 0.9 + 7000, 8) + (0.45 - nRegion) * 0.35;
      const nStraw  = _vnoise(c * 0.8 + 8000, r * 0.8 + 8000, 9) + (nRegion - 0.5) * 0.6;
      const nFlower = _vnoise(c * 0.7 + 9000, r * 0.7 + 9000, 7) + (nRegion - 0.45) * 0.3;
      v = [
        Math.max(0, Math.min(1, (nClover - 0.62) / 0.18)),
        Math.max(0, Math.min(1, (nStraw  - 0.66) / 0.18)),
        Math.max(0, Math.min(1, (nFlower - 0.66) / 0.16)),
      ];
      _groundCoverCache.set(tileKey, v);
      return v;
    }
    // Anchor colors for continuous grass shading (shadow -> highlight),
    // plus a warm olive tone blended into brighter patches — replaces the
    // old flat 6-color bucket fill with smooth interpolation.
    //
    // These are deliberately a NARROW, slightly dark band. The earlier
    // anchors spanned roughly luminance 20-90, which is wider than the
    // luminance range the building sprites themselves occupy (~20-60) --
    // so a given wall was as likely to be lighter than the grass behind
    // it as darker, and entities read as flat decals painted on the
    // terrain rather than objects standing on it. Compressing the ground
    // into ~26-67 and pulling the saturation down keeps the background
    // the quietest thing on screen, which is what lets the sprites own
    // detail register instead of competing with ground mottling.
    const _GRASS_DARK  = [16, 30, 16];
    const _GRASS_LIGHT = [44, 70, 28];
    const _GRASS_WARM  = [70, 70, 34];  // dry, sun-bleached yellow-olive patches
    const _GRASS_COOL  = [26, 56, 44];  // damp, blue-green patches
    const _GRASS_DIRT  = [58, 44, 30];  // bare-earth/brown patches
    const _GRASS_MEADOW = [76, 70, 36]; // regional golden dry meadow
    const _GRASS_LUSH   = [24, 60, 22]; // regional deep, saturated green
    if (SIMPLE_GROUND_MODE) {
      const _grassT0 = performance.now();
      targetCtx.fillStyle = `rgba(40,64,26,${_alpha})`;
      targetCtx.fillRect(cStart * TILE, rStart * TILE, (cEnd - cStart) * TILE, (rEnd - rStart) * TILE);
      PerfMonitor.record('BG base grass', performance.now() - _grassT0);
    } else {
      const _grassT0 = performance.now();
      // PERF: this used to be one targetCtx.fillStyle assignment + one
      // fillRect() call per tile — for a full margin-sized redraw that's
      // thousands of individual canvas calls, and critically, EVERY
      // fillStyle assignment forces the browser to re-parse a CSS colour
      // string, which isn't free at this scale. The colour here is a
      // smooth continuous gradient (4 blended noise samples), so exact
      // per-tile colours are all different — but quantising each channel
      // to steps of 4 collapses that down to a small, reusable set of
      // colour buckets (visually seamless; a gradient this smooth can't
      // show 4-unit banding at TILE=40px), batched into one Path2D of
      // rects per bucket and filled once. Alpha is already constant for
      // the whole redraw, so it doesn't need to be part of the bucket key.
      const grassGroups = new Map(); // "r,g,b" -> Path2D
      for (let r = rStart; r < rEnd; r++) {
        for (let c = cStart; c < cEnd; c++) {
          // Water tiles are always painted opaque over this layer every
          // frame by renderWaterBaseFill/renderWater (render_world_civic.js)
          // — this noise sampling + fill is invisible for them, pure waste.
          // Skipping it matters most exactly where it used to hurt: a
          // redraw region over a big lake/river was spending real time
          // computing grass detail that gets instantly painted over, and
          // (for the pan-drift strip redraw in bgScrollTo, which is
          // synchronous — see render_core.js) that cost landed directly in
          // a pan frame whenever the camera moved near water.
          if (WaterSystem.isWater(c, r)) continue;
          const tileKey = c * 10000 + r;
          let key = _grassBucketCache.get(tileKey);
          if (key === undefined) {
            const nBase   = _vnoise(c + 100, r + 100, 20);
            const nDetail = _vnoise(c * 3.1 + 400, r * 3.1 + 400, 7);
            const nHue    = _vnoise(c * 1.7 + 900, r * 1.7 + 900, 26);

            const t = Math.min(1, Math.max(0, nBase * 0.7 + nDetail * 0.3));
            let R = _GRASS_DARK[0] + (_GRASS_LIGHT[0] - _GRASS_DARK[0]) * t;
            let G = _GRASS_DARK[1] + (_GRASS_LIGHT[1] - _GRASS_DARK[1]) * t;
            let B = _GRASS_DARK[2] + (_GRASS_LIGHT[2] - _GRASS_DARK[2]) * t;

            // Meadow regions — very low-frequency noise (~45-tile features)
            // so whole stretches of map lean lush, golden-dry or mossy. The
            // other noise channels all vary within ~20 tiles, which averages
            // out to the same uniform green at normal play zoom; this is what
            // makes one part of the map look like a different field.
            const nRegion = _vnoise(c * 0.45 + 5000, r * 0.45 + 5000, 20);
            if (nRegion > 0.6) {
              const w = Math.min(1, (nRegion - 0.58) / 0.22) * 0.72;
              R += (_GRASS_MEADOW[0] - R) * w;
              G += (_GRASS_MEADOW[1] - G) * w;
              B += (_GRASS_MEADOW[2] - B) * w;
            } else if (nRegion < 0.38) {
              const w = Math.min(1, (0.4 - nRegion) / 0.22) * 0.65;
              R += (_GRASS_LUSH[0] - R) * w;
              G += (_GRASS_LUSH[1] - G) * w;
              B += (_GRASS_LUSH[2] - B) * w;
            }

            if (nHue > 0.55) {
              const w = (nHue - 0.55) / 0.45 * 0.55;
              R += (_GRASS_WARM[0] - R) * w;
              G += (_GRASS_WARM[1] - G) * w;
              B += (_GRASS_WARM[2] - B) * w;
            } else if (nHue < 0.35) {
              const w = (0.35 - nHue) / 0.35 * 0.5;
              R += (_GRASS_COOL[0] - R) * w;
              G += (_GRASS_COOL[1] - G) * w;
              B += (_GRASS_COOL[2] - B) * w;
            }

            // Soft, large-scale shade blotches — separate low-frequency noise
            // so dark patches read as irregular shade rather than more mottling
            const nShadow = _vnoise(c * 0.9 + 1500, r * 0.9 + 1500, 34);
            if (nShadow < 0.4) {
              // 0.32 (was 0.5): the blotches used to bottom out near black, which
              // put a chunk of the terrain BELOW the darkest building colours
              // and inverted the figure-ground relationship in those patches.
              const shadowAmt = (0.4 - nShadow) / 0.4 * 0.32;
              R *= (1 - shadowAmt);
              G *= (1 - shadowAmt);
              B *= (1 - shadowAmt);
            }

            // Bare-earth/dirt patches — sparse, large, low-frequency noise so
            // they read as distinct worn-ground blotches rather than a tint
            const nDirt = _vnoise(c * 0.55 + 2600, r * 0.55 + 2600, 40);
            if (nDirt > 0.62) {
              const dirtAmt = Math.min(1, (nDirt - 0.62) / 0.18) * 0.7;
              R += (_GRASS_DIRT[0] - R) * dirtAmt;
              G += (_GRASS_DIRT[1] - G) * dirtAmt;
              B += (_GRASS_DIRT[2] - B) * dirtAmt;
            }

            const qR = Math.round(R / 4) * 4, qG = Math.round(G / 4) * 4, qB = Math.round(B / 4) * 4;
            key = qR + ',' + qG + ',' + qB;
            _grassBucketCache.set(tileKey, key);
          }
          let group = grassGroups.get(key);
          if (!group) { group = new Path2D(); grassGroups.set(key, group); }
          group.rect(c * TILE, r * TILE, TILE, TILE);
        }
      }

      for (const [key, path] of grassGroups) {
        targetCtx.fillStyle = `rgba(${key},${_alpha})`;
        targetCtx.fill(path);
      }
      PerfMonitor.record('BG base grass', performance.now() - _grassT0);
    }

    // Grass micro-texture — two pre-baked, tileable blade-speckle patterns
    // (see js/ground_textures.js) composited over the whole redraw region.
    // This replaces an earlier per-tile Path2D blade system (hundreds of
    // individual quadratic curves rebuilt on every cache redraw) that
    // caused panning/zoom stutter. A CanvasPattern fill is O(area) — same
    // cost class as the flat fill above — so two layers stay cheap inside
    // both the time-sliced job path and the rare synchronous full-cache
    // redraw (first load / resize).
    //
    // One layer alone repeats every ~3 tiles, which is close enough that
    // the stamp is obvious (identical blade layout every 3x3-ish block).
    // Layering a second, differently-sized/seeded pattern (rotated 37°,
    // baked into its own transform once at load — see ground_textures.js)
    // means the combined result only repeats at the two periods' lowest
    // common multiple, thousands of world px away — far past anything
    // visible on screen at once, so it reads as continuous variation
    // instead of a stamped grid.
    //
    // LOD: fades out smoothly between zoom 0.35–1.3 instead of a hard
    // on/off cutoff. A hard cutoff meant grass could visibly "pop" in or
    // out the instant a redraw happened to land on the wrong side of the
    // threshold; ramping the alpha instead means it fades away gradually
    // as you zoom out (and back in), which reads as natural instead of a
    // glitch. Below 0.35 it's fully skipped — same perf benefit as before
    // for the low-zoom worst case, where a redraw covers the most tiles.
    // Range widened (was 0.35–0.65) and eased with smoothstep — the photo
    // grass texture reads busier than the old thin blade-dash pattern, so
    // the same fade compressed into a couple of scroll-wheel clicks looked
    // like an abrupt pop rather than a gradual fade.
    const _grassT = Math.max(0, Math.min(1, (zoom - 0.35) / 0.95));
    const _grassLOD = SIMPLE_GROUND_MODE ? 0 : _grassT * _grassT * (3 - 2 * _grassT);

    if (_grassLOD > 0) {
      const _gx = cStart * TILE, _gy = rStart * TILE, _gw = (cEnd - cStart) * TILE, _gh = (rEnd - rStart) * TILE;
      targetCtx.save();
      targetCtx.globalAlpha = _grassLOD * (0.62 - _dark * 0.27);
      targetCtx.fillStyle = GroundTextures.grassPatternA;
      targetCtx.fillRect(_gx, _gy, _gw, _gh);
      targetCtx.globalAlpha = _grassLOD * (0.5 - _dark * 0.22);
      targetCtx.fillStyle = GroundTextures.grassPatternB;
      targetCtx.fillRect(_gx, _gy, _gw, _gh);
      // Photo-real Blender layer, composited on top of the procedural
      // dashes rather than replacing them — crisp zoom-independent dashes
      // for the base texture, photo layer adds depth/mottling on top.
      if (GroundTextures.photoGrassPatternA) {
        targetCtx.globalAlpha = _grassLOD * (0.4 - _dark * 0.18);
        targetCtx.fillStyle = GroundTextures.photoGrassPatternA;
        targetCtx.fillRect(_gx, _gy, _gw, _gh);
      }
      if (GroundTextures.photoGrassPatternB) {
        targetCtx.globalAlpha = _grassLOD * (0.32 - _dark * 0.14);
        targetCtx.fillStyle = GroundTextures.photoGrassPatternB;
        targetCtx.fillRect(_gx, _gy, _gw, _gh);
      }

      // Ground-cover patches — clover drifts and dry straw stands, each
      // masked by its own noise field so they appear in irregular clumps
      // rather than everywhere. The mask is a union of overlapping circles
      // (one per qualifying tile, radius scaled by mask strength) so patch
      // edges taper organically instead of following the tile grid. Built
      // only on a background rebake, one pattern fill per cover type.
      const cloverMask = new Path2D(), strawMask = new Path2D();
      let hasClover = false, hasStraw = false;
      for (let r = rStart; r < rEnd; r++) {
        for (let c = cStart; c < cEnd; c++) {
          if (WaterSystem.isWater(c, r)) continue;
          const cover = _groundCover(c, r);
          const cx = (c + 0.5) * TILE, cy = (r + 0.5) * TILE;
          if (cover[0] > 0) {
            const rad = TILE * (0.35 + cover[0] * 0.5);
            cloverMask.moveTo(cx + rad, cy); cloverMask.arc(cx, cy, rad, 0, Math.PI * 2);
            hasClover = true;
          }
          if (cover[1] > 0) {
            const rad = TILE * (0.35 + cover[1] * 0.5);
            strawMask.moveTo(cx + rad, cy); strawMask.arc(cx, cy, rad, 0, Math.PI * 2);
            hasStraw = true;
          }
        }
      }
      if (hasClover) {
        targetCtx.globalAlpha = _grassLOD * (0.6 - _dark * 0.25);
        targetCtx.fillStyle = GroundTextures.cloverPattern;
        targetCtx.fill(cloverMask);
      }
      if (hasStraw) {
        targetCtx.globalAlpha = _grassLOD * (0.42 - _dark * 0.18);
        targetCtx.fillStyle = GroundTextures.strawPattern;
        targetCtx.fill(strawMask);
      }
      targetCtx.restore();
    }

    // ── Terrain relief ─────────────────────────────────────────────
    // Hill shade, altitude tint and contour lines (terrain_system.js),
    // over the grass and under everything drawn on the ground.
    TerrainSystem.drawRelief(targetCtx, cStart, cEnd, rStart, rEnd, _dark, zoom);

    // ── Geothermal barren ground ──────────────────────────────────
    // Drawn after the grass texture (so it covers the blades) and before
    // the clutter pass (so clutter can be filtered out of it below).
    // Built up the way a real hydrothermal field is zoned: a fringe of
    // heat-killed straw grass, dusty tan soil, silica sinter crusts and
    // iron/sulphur staining, rust-orange runoff channels fanning out from
    // the vent, crazed mud around them, and weathered rock scattered over it
    // all. Everything is deterministic per deposit, and it all lives in the
    // cached background bitmap, so none of it costs anything per frame.
    const _geoFields = GeoField.visible(cStart, cEnd, rStart, rEnd);
    for (const _ge of _geoFields) {
      const f = GeoField.fieldFor(_ge);
      const H = n => GeoField.hash(_ge.col, _ge.row, n);
      const Rt = f.R / TILE;                       // radius in tiles (8–20)
      const tc = targetCtx;
      // A smooth, lumpy closed blob around (x, y) — curves through the
      // midpoints of noisy vertices, so nothing reads as an ellipse or polygon.
      const blob = (x, y, r, seed, nv, rough, squash, rot) => {
        const pts = [];
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
      };
      const polar = (a, rr) => [f.cx + Math.cos(a) * rr, f.cy + Math.sin(a) * rr];

      // Dying-grass fringe — a straw-yellow band bleeding out past the soil
      let g = tc.createRadialGradient(f.cx, f.cy, f.R * 0.55, f.cx, f.cy, f.R * 1.12);
      g.addColorStop(0,    'rgba(150,128,72,0)');
      g.addColorStop(0.55, 'rgba(150,128,72,0.30)');
      g.addColorStop(0.82, 'rgba(138,122,66,0.22)');
      g.addColorStop(1,    'rgba(128,118,64,0)');
      tc.fillStyle = g;
      tc.fill(GeoField.pathFor(f, 1.12));

      // Base soil — dusty tan at the edge, darker and cooked toward the vent
      g = tc.createRadialGradient(f.cx, f.cy, 0, f.cx, f.cy, f.R);
      g.addColorStop(0,    'rgba(70,56,42,0.98)');
      g.addColorStop(0.25, 'rgba(96,80,60,0.97)');
      g.addColorStop(0.6,  'rgba(112,96,72,0.94)');
      g.addColorStop(0.86, 'rgba(110,96,70,0.55)');
      g.addColorStop(1,    'rgba(106,94,68,0)');
      tc.fillStyle = g;
      tc.fill(GeoField.pathFor(f, 1.0));

      tc.save();
      tc.clip(GeoField.pathFor(f, 0.97));

      // Broad tonal variation — ash grey, pale silica, ochre and iron stain
      const TONES = ['rgba(92,88,82,0.16)', 'rgba(196,186,160,0.13)', 'rgba(164,124,58,0.13)',
                     'rgba(132,70,38,0.12)', 'rgba(58,46,36,0.16)'];
      const nBlob = 10 + Math.round(Rt * 1.2);
      for (let i = 0; i < nBlob; i++) {
        const [bx, by] = polar(H(1500 + i) * Math.PI * 2, Math.sqrt(H(1600 + i)) * f.R * 0.82);
        blob(bx, by, f.R * (0.08 + H(1700 + i) * 0.16), 5000 + i * 16, 11, 0.7, 0.55 + H(1800 + i) * 0.45, H(1900 + i) * 6.3);
        tc.fillStyle = TONES[Math.floor(H(2000 + i) * TONES.length)];
        tc.fill();
      }

      // Silica sinter crusts — pale, cracked plates in the inner half
      const nSinter = 5 + Math.round(Rt * 0.5);
      for (let i = 0; i < nSinter; i++) {
        const [bx, by] = polar(H(2100 + i) * Math.PI * 2, f.R * (0.10 + H(2200 + i) * 0.42));
        const br = TILE * (0.8 + H(2300 + i) * 1.8);
        blob(bx, by, br, 6000 + i * 16, 12, 0.8, 0.6 + H(2400 + i) * 0.4, H(2500 + i) * 6.3);
        tc.fillStyle = 'rgba(196,188,166,0.17)'; tc.fill();
        tc.strokeStyle = 'rgba(222,216,196,0.12)'; tc.lineWidth = 1; tc.stroke();
        blob(bx - br * 0.12, by - br * 0.1, br * 0.6, 6500 + i * 16, 9, 0.8, 0.8, H(2600 + i) * 6.3);
        tc.fillStyle = 'rgba(216,210,190,0.10)'; tc.fill();
      }

      // Runoff channels — meandering from the vent, rust halo, ochre bed,
      // a dark wet thread down the middle
      const nRun = 3 + Math.floor(H(2700) * 3);
      for (let i = 0; i < nRun; i++) {
        let a = (i / nRun) * Math.PI * 2 + H(2710 + i) * 1.2;
        let rr = f.R * 0.05;
        const len = f.R * (0.45 + H(2720 + i) * 0.45);
        const pts = [polar(a, rr)];
        const steps = 22;
        for (let k = 0; k < steps; k++) {
          a += (H(2800 + i * 30 + k) - 0.5) * 0.12;
          rr += len / steps;
          const wob = (H(3500 + i * 30 + k) - 0.5) * TILE * 0.18;
          const [x, y] = polar(a, rr);
          pts.push([x + Math.cos(a + 1.57) * wob, y + Math.sin(a + 1.57) * wob]);
        }
        tc.lineCap = 'round'; tc.lineJoin = 'round';
        for (const [wd, col] of [[1.6, 'rgba(120,70,40,0.10)'], [0.8, 'rgba(146,88,48,0.16)'],
                                  [0.4, 'rgba(172,128,72,0.20)'], [0.12, 'rgba(44,44,44,0.26)']]) {
          // Channels taper as they spread out: draw in three thinning spans
          for (let s = 0; s < 3; s++) {
            const a0 = Math.floor(s * steps / 3), a1 = Math.floor((s + 1) * steps / 3);
            tc.strokeStyle = col; tc.lineWidth = TILE * wd * (1 - s * 0.28);
            tc.beginPath(); tc.moveTo(pts[a0][0], pts[a0][1]);
            for (let k = a0 + 1; k <= a1; k++) tc.lineTo(pts[k][0], pts[k][1]);
            tc.stroke();
          }
        }
      }

      if (_grassLOD > 0) {
        // Grain — fine speckle so the soil has texture up close
        const nGrain = Math.min(2600, Math.round(Rt * Rt * 6));
        for (let i = 0; i < nGrain; i++) {
          const [sx, sy] = polar(H(10000 + i) * Math.PI * 2, Math.sqrt(H(20000 + i)) * f.R * 0.95);
          const tone = H(30000 + i);
          tc.fillStyle = tone > 0.7 ? 'rgba(190,176,148,0.30)' : tone > 0.35 ? 'rgba(52,42,32,0.30)' : 'rgba(128,108,80,0.28)';
          const s = 0.8 + H(40000 + i) * 1.6;
          tc.fillRect(sx, sy, s, s);
        }

        // Crazed mud — clusters of short, branching crack walks
        tc.lineCap = 'round';
        const nClus = 4 + Math.round(Rt * 0.4);
        for (let ci = 0; ci < nClus; ci++) {
          const [ox, oy] = polar(H(4000 + ci) * Math.PI * 2, f.R * (0.15 + H(4100 + ci) * 0.55));
          const walks = 9;
          for (let w = 0; w < walks; w++) {
            let x = ox + (H(4200 + ci * 20 + w) - 0.5) * TILE * 3.2;
            let y = oy + (H(4300 + ci * 20 + w) - 0.5) * TILE * 3.2;
            let a = H(4400 + ci * 20 + w) * Math.PI * 2;
            tc.beginPath(); tc.moveTo(x, y);
            for (let k = 0; k < 6; k++) {
              a += (H(4500 + ci * 120 + w * 6 + k) - 0.5) * 1.6;
              x += Math.cos(a) * TILE * 0.28; y += Math.sin(a) * TILE * 0.28;
              tc.lineTo(x, y);
            }
            tc.strokeStyle = 'rgba(30,22,16,0.42)'; tc.lineWidth = 0.9; tc.stroke();
          }
        }

        // Fumarole scars — small sulphur-crusted holes, cold now in the bake
        const nFum = 3 + Math.floor(H(4900) * 4);
        for (let i = 0; i < nFum; i++) {
          const [vx, vy] = polar(H(4910 + i) * Math.PI * 2, f.R * (0.18 + H(4920 + i) * 0.4));
          const vr = TILE * (0.14 + H(4930 + i) * 0.12);
          g = tc.createRadialGradient(vx, vy, 0, vx, vy, vr * 3.2);
          g.addColorStop(0, 'rgba(214,190,72,0.55)'); g.addColorStop(0.45, 'rgba(196,164,70,0.28)'); g.addColorStop(1, 'rgba(180,150,70,0)');
          tc.fillStyle = g; tc.beginPath(); tc.arc(vx, vy, vr * 3.2, 0, Math.PI * 2); tc.fill();
          for (let k = 0; k < 10; k++) {
            const aa = H(4940 + i * 12 + k) * Math.PI * 2, dd = vr * (1.1 + H(5100 + i * 12 + k) * 1.6);
            tc.fillStyle = 'rgba(236,212,90,0.55)';
            tc.fillRect(vx + Math.cos(aa) * dd, vy + Math.sin(aa) * dd, 1.6, 1.6);
          }
          tc.fillStyle = '#1a1410'; tc.beginPath(); tc.ellipse(vx, vy, vr, vr * 0.7, H(4950 + i) * 3, 0, Math.PI * 2); tc.fill();
        }

        // Rock — irregular, lit from the upper left, with contact shadows.
        // Weighted outward: the vent area is mostly crust and mud.
        const nStone = Math.round(24 + Rt * 3.2);
        for (let i = 0; i < nStone; i++) {
          const a = H(100 + i) * Math.PI * 2;
          const rr = Math.pow(H(300 + i), 0.45) * f.R * 0.93;
          const [sx, sy] = polar(a, rr);
          const big = H(600 + i) > 0.9;
          const sz = TILE * (big ? 0.28 + H(500 + i) * 0.22 : 0.06 + H(500 + i) * 0.14);
          const nv = 6;
          const pts = [];
          for (let k = 0; k < nv; k++) {
            const ang = (k / nv) * Math.PI * 2 + H(800 + i) * 1.0;
            const d = sz * (0.7 + H(1000 + i * 7 + k) * 0.5);
            pts.push([sx + Math.cos(ang) * d, sy + Math.sin(ang) * d * 0.8]);
          }
          const poly = (dx, dy) => { tc.beginPath(); pts.forEach(([x, y], k) => k ? tc.lineTo(x + dx, y + dy) : tc.moveTo(x + dx, y + dy)); tc.closePath(); };
          poly(sz * 0.25, sz * 0.3); tc.fillStyle = 'rgba(20,14,10,0.35)'; tc.fill();
          const tone = H(700 + i);
          const base = tone > 0.66 ? [124, 114, 100] : tone > 0.33 ? [96, 86, 74] : [70, 62, 54];
          poly(0, 0); tc.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; tc.fill();
          // Lit facet
          tc.beginPath(); tc.moveTo(pts[3][0], pts[3][1]); tc.lineTo(pts[4][0], pts[4][1]); tc.lineTo(pts[5][0], pts[5][1]); tc.lineTo(sx, sy); tc.closePath();
          tc.fillStyle = `rgba(${base[0] + 60},${base[1] + 56},${base[2] + 50},0.45)`; tc.fill();
          // Shaded facet
          tc.beginPath(); tc.moveTo(pts[0][0], pts[0][1]); tc.lineTo(pts[1][0], pts[1][1]); tc.lineTo(sx, sy); tc.closePath();
          tc.fillStyle = 'rgba(0,0,0,0.18)'; tc.fill();
        }
      }
      tc.restore();

      // Dead grass tufts along the fringe (outside the soil clip)
      if (_grassLOD > 0) {
        tc.lineCap = 'round';
        const nTuft = Math.round(Rt * 9);
        for (let i = 0; i < nTuft; i++) {
          const a = H(7000 + i) * Math.PI * 2;
          const idx = Math.round(a / (Math.PI * 2) * 18) % 18;
          const [tx, ty] = polar(a, f.R * f.jit[idx] * (0.8 + H(7100 + i) * 0.28));
          tc.strokeStyle = H(7200 + i) > 0.5 ? 'rgba(176,156,96,0.75)' : 'rgba(138,120,70,0.75)';
          tc.lineWidth = 1;
          tc.beginPath();
          for (let k = 0; k < 4; k++) {
            const ba = -Math.PI / 2 + (k - 1.5) * 0.35 + (H(7300 + i * 4 + k) - 0.5) * 0.4;
            const bl = TILE * (0.12 + H(7400 + i * 4 + k) * 0.14);
            tc.moveTo(tx, ty); tc.lineTo(tx + Math.cos(ba) * bl, ty + Math.sin(ba) * bl);
          }
          tc.stroke();
        }
      }
    }

    // Ground clutter — sparse rocks, tiny flower clusters, and fallen-leaf
    // flecks, echoing the reference. Independent hash channel (salt 100+)
    // so placement doesn't correlate with the tuft pass above.
    //
    // Rocks and flowers use Blender-rendered top-down photo sprites (see
    // _clutterRockSprite/_clutterFlowerSprites below) instead of vector
    // fills — a drawImage() blit is at least as cheap as the ellipse/arc
    // tessellation it replaces, and this whole block only runs when the
    // ground buffer is rebaked (pan/zoom/dark-bucket change), not every
    // frame, so per-instance draw calls are not a hot path. Leaf debris
    // stays procedural (batched into one path/fill like before) since it
    // wasn't part of the asset swap.
    //
    // LOD: same smooth zoom fade as the blade pattern above (see _grassLOD), same reasoning.
    if (_grassLOD > 0) {
      function _tileHash2(c, r, salt) {
        let h = (c * 668265263 + r * 374761393 + salt * 2147483647) | 0;
        h = (h ^ (h >>> 13)) * 1274126177 | 0;
        h = (h ^ (h >>> 16)) >>> 0;
        return h / 4294967295;
      }
      const leafPath = new Path2D();
      const clutterAlpha = (1 - _dark * 0.45) * _grassLOD;
      const _meadowDraws = [];       // flat [img, x, y, size, ...] — flowers, plants
      const _meadowGroundDraws = []; // same layout — dirt, pebbles (drawn underneath)

      for (let r = rStart; r < rEnd; r++) {
        for (let c = cStart; c < cEnd; c++) {
          // Same reasoning as the grass-base skip above — clutter placed on
          // a water tile would be painted over and never seen.
          if (WaterSystem.isWater(c, r)) continue;

          // Wildflower meadows — clustered by the flower mask instead of an
          // even scatter, so some fields bloom and most don't. Pre-baked
          // flower sprites (see GroundTextures.flowerSprites), collected here
          // and blitted after the loop under a single globalAlpha.
          const flowerAmt = _groundCover(c, r)[2];
          if (flowerAmt > 0 && _tileHash2(c, r, 300) < flowerAmt * 0.28 &&
              !(_geoFields.length && GeoField.covers(_geoFields.map(GeoField.fieldFor), c, r))) {
            const GT = GroundTextures;
            const species = GT.flowerSprites;
            const dom = Math.floor(_tileHash2(c, r, 301) * species.length);
            const n = _tileHash2(c, r, 302) < 0.2 ? 2 : 1;
            for (let k = 0; k < n; k++) {
              const fx = c * TILE + (0.15 + _tileHash2(c, r, 310 + k) * 0.7) * TILE;
              const fy = r * TILE + (0.15 + _tileHash2(c, r, 320 + k) * 0.7) * TILE;
              const variant = _tileHash2(c, r, 360 + k);
              // Only about half the meadow items are flowers; the rest are
              // leafy plants, worn dirt and pebbles so fields read as mixed
              // ground cover rather than a carpet of blooms. Dirt/pebbles go
              // in a separate list drawn first so plants sit on top of them.
              const kind = _tileHash2(c, r, 370 + k);
              let img, size, list = _meadowDraws;
              if (kind < 0.5) {
                // Mostly one dominant species per tile, occasionally a stray
                const sp = _tileHash2(c, r, 330 + k) < 0.8 ? dom
                         : Math.floor(_tileHash2(c, r, 350 + k) * species.length);
                img = species[sp][variant < 0.5 ? 0 : 1];
                size = TILE * (0.5 + _tileHash2(c, r, 340 + k) * 0.18);
              } else if (kind < 0.76) {
                img = GT.plantSprites[Math.floor(variant * GT.plantSprites.length)];
                size = TILE * (0.55 + _tileHash2(c, r, 340 + k) * 0.25);
              } else if (kind < 0.9) {
                img = GT.dirtSprites[variant < 0.5 ? 0 : 1];
                size = TILE * (0.8 + _tileHash2(c, r, 340 + k) * 0.4);
                list = _meadowGroundDraws;
              } else {
                img = GT.pebbleSprites[variant < 0.5 ? 0 : 1];
                size = TILE * (0.45 + _tileHash2(c, r, 340 + k) * 0.2);
                list = _meadowGroundDraws;
              }
              list.push(img, fx - size / 2, fy - size / 2, size);
            }
          }

          const roll = _tileHash2(c, r, 100);
          if (roll > 0.016) continue; // ~1.6% of tiles get a clutter doodad (halved twice from 6.3%)
          // Nothing green grows on a geothermal barren — rocks still do.
          if (roll >= 0.0055 && _geoFields.length && GeoField.covers(_geoFields.map(GeoField.fieldFor), c, r)) continue;
          const dx = c * TILE + _tileHash2(c, r, 101) * TILE * 0.6 + TILE * 0.2;
          const dy = r * TILE + _tileHash2(c, r, 102) * TILE * 0.6 + TILE * 0.2;

          if (roll < 0.0055) {
            // Small rock — Blender photo sprite, centred on dx/dy (the
            // render's camera was framed on the rock's own bbox centre).
            const rw = TILE * (0.07 + _tileHash2(c, r, 103) * 0.05);
            const rot = _tileHash2(c, r, 108) * Math.PI * 2;
            if (_clutterRockSprite.loaded) {
              const disp = rw * 2 * _CLUTTER_IMG_MARGIN;
              targetCtx.save();
              targetCtx.globalAlpha = clutterAlpha;
              targetCtx.translate(dx, dy);
              targetCtx.rotate(rot);
              targetCtx.drawImage(_clutterRockSprite, -disp / 2, -disp / 2, disp, disp);
              targetCtx.restore();
            }
          } else if (roll < 0.0115) {
            // Tiny flower — Blender photo sprite, one of 4 colour variants
            // matching the original procedural palette.
            const colorIdx = Math.floor(_tileHash2(c, r, 104) * _clutterFlowerSprites.length);
            const sprite = _clutterFlowerSprites[colorIdx];
            const rot = _tileHash2(c, r, 105) * Math.PI * 2;
            const fw = TILE * (0.16 + _tileHash2(c, r, 107) * 0.05);
            if (sprite.loaded) {
              const disp = fw * _CLUTTER_IMG_MARGIN;
              targetCtx.save();
              targetCtx.globalAlpha = clutterAlpha;
              targetCtx.translate(dx, dy);
              targetCtx.rotate(rot);
              targetCtx.drawImage(sprite, -disp / 2, -disp / 2, disp, disp);
              targetCtx.restore();
            }
          } else {
            // Fallen leaf / debris fleck
            // (moveTo to the rotated ellipse's own start point — see note above)
            const lw = TILE * 0.055, lrot = _tileHash2(c, r, 106) * Math.PI;
            leafPath.moveTo(dx + lw * Math.cos(lrot), dy + lw * Math.sin(lrot));
            leafPath.ellipse(dx, dy, lw, TILE * 0.03, lrot, 0, Math.PI * 2);
          }
        }
      }

      targetCtx.fillStyle = `rgba(118,78,38,${(0.7 * (1 - _dark * 0.4) * _grassLOD).toFixed(2)})`;
      targetCtx.fill(leafPath);

      if (_meadowDraws.length || _meadowGroundDraws.length) {
        const _prevA = targetCtx.globalAlpha;
        targetCtx.globalAlpha = 0.92 * (1 - _dark * 0.5) * _grassLOD;
        for (const list of [_meadowGroundDraws, _meadowDraws]) {
          for (let i = 0; i < list.length; i += 4) {
            const s = list[i + 3];
            targetCtx.drawImage(list[i], list[i + 1], list[i + 2], s, s);
          }
        }
        targetCtx.globalAlpha = _prevA;
      }
    }

    // Shore bank — wet sand/mud band on land tiles bordering water (see
    // _bankGrad* above). Mirrors the water-side shore feather in
    // renderWater() from the other side of the boundary, so the two
    // together read as ground sloping down into water instead of a hard
    // grass/water cutout. Only tiles actually touching water pay for the
    // draw calls; every other land tile pays for up to 4 cheap Set lookups.
    // The baked water look (water_look.js) draws its own bank along its own
    // shoreline; this square one would show through it as steps.
    if (!(typeof WaterLook !== 'undefined' && WaterLook.enabled)) {
      const _bankT0 = performance.now();
      targetCtx.save();
      targetCtx.globalAlpha = 1 - _dark * 0.35;
      for (let r = rStart; r < rEnd; r++) {
        for (let c = cStart; c < cEnd; c++) {
          if (WaterSystem.isWater(c, r)) continue;
          let mask = 0;
          if (WaterSystem.isWater(c, r - 1)) mask |= 1;
          if (WaterSystem.isWater(c, r + 1)) mask |= 2;
          if (WaterSystem.isWater(c - 1, r)) mask |= 4;
          if (WaterSystem.isWater(c + 1, r)) mask |= 8;
          if (!mask) continue;
          targetCtx.save();
          targetCtx.translate(c * TILE, r * TILE);
          if (mask & 1) { targetCtx.fillStyle = _bankGradTop;    targetCtx.fillRect(0, 0, TILE, _BANK_DEPTH); }
          if (mask & 2) { targetCtx.fillStyle = _bankGradBottom; targetCtx.fillRect(0, TILE - _BANK_DEPTH, TILE, _BANK_DEPTH); }
          if (mask & 4) { targetCtx.fillStyle = _bankGradLeft;   targetCtx.fillRect(0, 0, _BANK_DEPTH, TILE); }
          if (mask & 8) { targetCtx.fillStyle = _bankGradRight;  targetCtx.fillRect(TILE - _BANK_DEPTH, 0, _BANK_DEPTH, TILE); }
          targetCtx.restore();
        }
      }
      targetCtx.restore();
      PerfMonitor.record('BG shore bank', performance.now() - _bankT0);
    }

    // Pavement edge — gravel/dirt band on grass tiles bordering a
    // cobblestone zone (see _pavGrad* above), same idea as the shore bank
    // just above. Zones are axis-aligned rectangles (unlike water's
    // irregular shorelines), so instead of scanning every land tile in the
    // redraw range, this walks only the thin ring of tiles just outside
    // each zone's paved footprint — cost scales with zone perimeter, not
    // redraw area.
    {
      const _pavT0 = performance.now();
      targetCtx.save();
      targetCtx.globalAlpha = 1 - _dark * 0.35;
      const _drawPavRing = (c, r, dir) => {
        if (c < cStart || c >= cEnd || r < rStart || r >= rEnd) return;
        if (WaterSystem.isWater(c, r) || ZoneSystem.getZoneAt(c, r)) return;
        targetCtx.save();
        targetCtx.translate(c * TILE, r * TILE);
        if (dir === 'bottom')      { targetCtx.fillStyle = _pavGradBottom; targetCtx.fillRect(0, TILE - _PAVEMENT_EDGE_DEPTH, TILE, _PAVEMENT_EDGE_DEPTH); }
        else if (dir === 'top')    { targetCtx.fillStyle = _pavGradTop;    targetCtx.fillRect(0, 0, TILE, _PAVEMENT_EDGE_DEPTH); }
        else if (dir === 'right')  { targetCtx.fillStyle = _pavGradRight;  targetCtx.fillRect(TILE - _PAVEMENT_EDGE_DEPTH, 0, _PAVEMENT_EDGE_DEPTH, TILE); }
        else if (dir === 'left')   { targetCtx.fillStyle = _pavGradLeft;   targetCtx.fillRect(0, 0, _PAVEMENT_EDGE_DEPTH, TILE); }
        targetCtx.restore();
      };
      // Only industrial yards keep this apron. Residential, commercial and
      // government ground each finish in their own kerb, paving or railing
      // (see the zone-ground renderers), and a gravel/dirt band outside that
      // reads as a building site rather than a street or civic quarter.
      for (const key of ['industrial']) {
        const rects = ZoneSystem.getZoneRects(key);
        if (!rects || rects.length === 0) continue;
        for (const rect of rects) {
          // Matches the cobblestone PAD=1 in the zone-fill block below —
          // the actual paved footprint extends 1 tile beyond the rect.
          const pc0 = rect.minC - 1, pc1 = rect.maxC + 1;
          const pr0 = rect.minR - 1, pr1 = rect.maxR + 1;
          for (let c = pc0; c <= pc1; c++) {
            _drawPavRing(c, pr0 - 1, 'bottom'); // ring tile above zone — pavement is below it
            _drawPavRing(c, pr1 + 1, 'top');    // ring tile below zone — pavement is above it
          }
          for (let r = pr0; r <= pr1; r++) {
            _drawPavRing(pc0 - 1, r, 'right');  // ring tile left of zone — pavement is to its right
            _drawPavRing(pc1 + 1, r, 'left');   // ring tile right of zone — pavement is to its left
          }
        }
      }
      targetCtx.restore();
      PerfMonitor.record('BG pavement edge', performance.now() - _pavT0);
    }

    // Skip grid lines at low zoom — invisible anyway and very expensive over full grid
    if (Camera.zoom >= 0.25) {
      const _gridT0 = performance.now();
      targetCtx.save();
      targetCtx.globalAlpha *= 0.2; // dimmer grid lines
      targetCtx.strokeStyle = DayNight.gridColor(_dark);   // the bitmap's own keyframe
      targetCtx.lineWidth   = 1.5 / Camera.zoom;
      // Batched into one path + one stroke() instead of one beginPath()+
      // stroke() per line (was up to ~150+ separate stroke calls for a
      // full margin-sized redraw).
      const gridPath = new Path2D();
      for (let c = cStart; c <= cEnd; c++) {
        gridPath.moveTo(c * TILE, rStart * TILE);
        gridPath.lineTo(c * TILE, rEnd   * TILE);
      }
      for (let r = rStart; r <= rEnd; r++) {
        gridPath.moveTo(cStart * TILE, r * TILE);
        gridPath.lineTo(cEnd   * TILE, r * TILE);
      }
      targetCtx.stroke(gridPath);
      targetCtx.restore();
      PerfMonitor.record('BG grid lines', performance.now() - _gridT0);
    }

    // Zone overlays — drawn before entities, in world space
    // Zone cobblestone fills — draw before entities, after ground
    {
      const _stoneT0 = performance.now();
      // Day/night shade multiplier applied directly to stone RGB — NOT to
      // fillStyle alpha. The stone fills (and the grout base fill below)
      // must stay fully opaque: this layer sits on top of the ground/grass
      // texture, and any alpha < 1 here lets that texture visibly bleed
      // through the "solid" cobblestone, which reads as a translucency bug
      // once the ground has real detail instead of a near-flat colour.
      const _shade = 1 - _dark * 0.24;
      const _ZONE_PALETTE = {
        residential: [[56,52,44],[46,42,34],[62,58,48],[50,46,38],[52,48,40],[60,54,44],[44,40,32],[58,52,42]],
        commercial:  [[48,54,54],[38,44,46],[54,60,58],[44,50,52],[46,52,54],[52,58,56],[40,46,48],[50,56,54]],
        industrial:  [[52,48,42],[42,38,32],[58,52,44],[46,42,36],[48,44,38],[56,50,42],[40,36,30],[54,48,40]],
        government:  [[44,48,40],[34,38,30],[50,54,44],[40,44,36],[42,46,38],[48,52,42],[36,40,32],[46,50,40]],
      };
      const PAD = 1;
      // Helper: draw one cobblestone. Base fill is fully opaque; only the
      // highlight/shadow/fleck sheen overlays (which composite against the
      // now-opaque stone below them, not the ground) use partial alpha.
      function _drawStone(bx, by, sw, sh, R, G, B, mg, h1, h2) {
        const Rj = Math.min(255,Math.max(0,Math.round((R+((h2%25)-12))*_shade)));
        const Gj = Math.min(255,Math.max(0,Math.round((G+((h2%25)-12))*_shade)));
        const Bj = Math.min(255,Math.max(0,Math.round((B+((h2%25)-12))*_shade)));
        targetCtx.fillStyle = `rgb(${Rj},${Gj},${Bj})`;
        targetCtx.fillRect(bx+mg, by+mg, sw-mg*2, sh-mg*2);
        const hl = 10+(h1%18);
        targetCtx.fillStyle = `rgba(${Math.min(255,Rj+hl)},${Math.min(255,Gj+hl)},${Math.min(255,Bj+hl)},0.5)`;
        targetCtx.fillRect(bx+mg, by+mg, sw-mg*2, 1.5);
        targetCtx.fillRect(bx+mg, by+mg, 1.5, sh-mg*2);
        const sd = 10+(h2%14);
        targetCtx.fillStyle = `rgba(${Math.max(0,Rj-sd)},${Math.max(0,Gj-sd)},${Math.max(0,Bj-sd)},0.7)`;
        targetCtx.fillRect(bx+mg, by+sh-mg-1.5, sw-mg*2, 1.5);
        targetCtx.fillRect(bx+sw-mg-1.5, by+mg, 1.5, sh-mg*2);
        if (h1%11===0) {
          targetCtx.fillStyle=`rgba(${Math.max(0,Rj-20)},${Math.max(0,Gj-18)},${Math.max(0,Bj-16)},0.4)`;
          targetCtx.fillRect(bx+mg+(h2%(sw-mg*4|1)), by+mg+(h1%(sh-mg*4|1)), 2+h2%3, 1);
        }
      }

      for (const [key, palette] of Object.entries(_ZONE_PALETTE)) {
        const rects = ZoneSystem.getZoneRects(key);
        if (!rects || rects.length === 0) continue;
        for (const rect of rects) {
          const c0 = rect.minC - PAD, c1 = rect.maxC + PAD;
          const r0 = rect.minR - PAD, r1 = rect.maxR + PAD;
          const rr0 = Math.max(r0, rStart), rr1 = Math.min(r1, rEnd);
          const cc0 = Math.max(c0, cStart), cc1 = Math.min(c1, cEnd);
          if (cc0 > cc1 || rr0 > rr1) continue; // zone rect doesn't overlap the redraw area at all

          // Work in pixel space within zone bounds
          const px0 = c0 * TILE, py0 = r0 * TILE;
          const pxMax = (c1+1) * TILE, pyMax = (r1+1) * TILE;

          // PERF: this used to be save()+beginPath()+rect()+clip()+restore()
          // — one of the most expensive things Canvas2D can do — for EVERY
          // SINGLE cobblestone (hundreds per zone). The clip region is the
          // exact same rect for every stone in this zone, so it only needs
          // to be set up once per zone-rect, not once per stone.
          targetCtx.save();
          targetCtx.beginPath();
          targetCtx.rect(cc0*TILE, rr0*TILE, (cc1-cc0+1)*TILE, (rr1-rr0+1)*TILE);
          targetCtx.clip();

          const _groundFn = key === 'residential' ? drawNeighbourhoodGround
                          : key === 'commercial'  ? drawCommercialGround
                          : key === 'industrial'  ? drawIndustrialGround
                          : key === 'government'  ? drawGovernmentGround
                          : null;
          if (_groundFn) {
            _groundFn(targetCtx, rect, cc0, cc1, rr0, rr1, _shade, _dark, _grassLOD);
            targetCtx.restore();
            continue;
          }

          // Opaque grout base fill — the stones below are laid out with
          // small gaps between them (mortar joints) that no stone actually
          // paints. Without this, those gaps (and every stone edge) show
          // whatever's on the ground layer underneath. One solid fillRect
          // over the whole clipped zone rect, using the palette's darkest
          // tone, guarantees the zone reads as fully paved.
          const [gR, gG, gB] = palette[1];
          targetCtx.fillStyle = `rgb(${Math.round(gR*_shade*0.85)},${Math.round(gG*_shade*0.85)},${Math.round(gB*_shade*0.85)})`;
          targetCtx.fillRect(cc0*TILE, rr0*TILE, (cc1-cc0+1)*TILE, (rr1-rr0+1)*TILE);

          // Layout: rows of stones with varying heights and brick offsets
          let py = py0;
          let rowIdx = 0;
          while (py < pyMax) {
            const rowH = Math.round(TILE * (0.55 + ((rowIdx*7919+py)%100)/200)); // 55–105% tile height
            const rowSeed = (rowIdx * 3517 + rect.minC * 1234) >>> 0;
            // Alternate between offset patterns
            const pattern = rowSeed % 3; // 0=brick, 1=random, 2=square
            const brickOffset = pattern === 0 ? (rowIdx % 2) * Math.round(TILE * 0.5)
                              : pattern === 1 ? (rowSeed % Math.round(TILE * 0.6))
                              : 0;
            let px = px0 - brickOffset;
            let colIdx = 0;
            while (px < pxMax) {
              const h1 = ((colIdx * 2017 + rowIdx * 3517) * 1234567) >>> 0;
              const h2 = ((colIdx * 7919 + rowIdx * 6271) * 9876543) >>> 0;
              // Vary stone width
              const stoneW = Math.round(TILE * (0.5 + (h1 % 100) / 150));
              const [R,G,B] = palette[h1 % palette.length];
              const mg = 1 + (h2%3)*0.5;
              // Only draw if overlaps visible area (cheap bounds check —
              // the clip above still catches partial overlaps correctly,
              // this just skips stones that are entirely outside it)
              if (px + stoneW > cc0*TILE && px < (cc1+1)*TILE && py + rowH > rr0*TILE && py < (rr1+1)*TILE) {
                _drawStone(px, py, stoneW, rowH, R,G,B, mg, h1, h2);
              }
              px += stoneW;
              colIdx++;
            }
            py += rowH;
            rowIdx++;
          }

          targetCtx.restore();
        }
      }
      PerfMonitor.record('Zone cobblestone', performance.now() - _stoneT0);
    }

    // Verges round every zone, under the connector roads that cross them
    {
      const _vT0 = performance.now();
      _ensureConnectorNetwork();
      _drawZoneVerges(targetCtx, cStart, cEnd, rStart, rEnd, 1 - _dark * 0.24, _dark, _grassLOD);
      PerfMonitor.record('Zone verges', performance.now() - _vT0);
    }

    // Inter-zone connector roads — thin streets linking zones together
    {
      const _connT0 = performance.now();
      _ensureConnectorNetwork();
      if (_connectorTiles.size) {
        _drawConnectorRoads(targetCtx, cStart, cEnd, rStart, rEnd, 1 - _dark * 0.24, _dark, _grassLOD);
        _drawConnectorMouths(targetCtx, cStart, cEnd, rStart, rEnd, 1 - _dark * 0.24);
      }
      PerfMonitor.record('Zone connector roads', performance.now() - _connT0);
    }

    // Tunnel portals where zone streets run out at the zone edge
    {
      const _portT0 = performance.now();
      _drawZonePortals(targetCtx, cStart, cEnd, rStart, rEnd, 1 - _dark * 0.24, _dark);
      PerfMonitor.record('Zone tunnel portals', performance.now() - _portT0);
    }

    // Waterfront quay — concrete edge wherever paved zone ground meets
    // water. Last of the zone layers so it sits over the ground, the
    // cobblestone and any connector road running along the shore.
    {
      const _quayT0 = performance.now();
      drawZoneQuays(targetCtx, cStart, cEnd, rStart, rEnd, 1 - _dark * 0.24, _dark);
      PerfMonitor.record('Zone quay wall', performance.now() - _quayT0);
    }
  }

// ═══════════════════════════════════════════════════════════════════
// Incremental background cache (stutter fix)
//
// The old scheme regenerated the ENTIRE margin-sized cache in a single
// synchronous frame whenever the viewport escaped the margin, a zoom
// gesture settled, or the day-night step / zone version changed. That
// one call — thousands of noise-sampled grass tiles + cobblestones +
// grid lines — was the recurring 40-80ms hitch while panning/zooming.
//
// Replacement:
//   1. bgScrollTo()  — pan upkeep. Re-anchors the cache continuously:
//      copies the still-valid overlap (one drawImage) and renders only
//      the thin newly-exposed strips. Runs every time the camera drifts
//      ~96px from the cache's ideal anchor, so each strip is tiny
//      (~1-3ms) instead of one giant redraw every few seconds.
//   2. bgJobStart()/bgJobStep() — full rebuilds (zoom settled, darkness
//      step, zone edit) rendered into bgScratch in row bands under a
//      per-frame time budget while the stale bitmap keeps displaying;
//      swapped in atomically when complete.
//
// Correctness notes:
//   • All background content is deterministic per world tile, so
//     adjacent passes rendered at different times produce identical
//     pixels — strips/bands butt together seamlessly.
//   • Every band/strip is clipped EXACTLY to its pixel region and the
//     tile range is expanded by 1 so shapes straddling a boundary
//     (cobblestones, grid strokes) are drawn in both passes, each
//     clipped complementarily. Without the exact clip, translucent
//     fills would double-composite in the overlap and show seams.
//   • Strip shifts are rounded to integer cache pixels so repeated
//     self-copies never accumulate sub-pixel blur.
// ═══════════════════════════════════════════════════════════════════

const BG_JOB_BUDGET_MS   = 5;   // per-frame budget for rebuild jobs
const BG_JOB_BAND_ROWS   = 4;   // tile rows rendered per band
const BG_SCROLL_DRIFT_PX = 96;  // re-anchor once camera drifts this far

// Draw all background content overlapping a world-space rect into
// targetCtx, clipped exactly to that rect.
function _bgBandDraw(targetCtx, worldLeft, worldTop, zoom, dark, wx0, wy0, wx1, wy1) {
  const cS = Math.max(0, Math.floor(wx0 / TILE) - 1);
  const cE = Math.min(COLS, Math.ceil(wx1 / TILE) + 1);
  const rS = Math.max(0, Math.floor(wy0 / TILE) - 1);
  const rE = Math.min(ROWS, Math.ceil(wy1 / TILE) + 1);
  if (cS >= cE || rS >= rE) return;
  targetCtx.save();
  // `zoom` stays the camera's own zoom (drawStaticBackgroundLayer reads it
  // for grass/clutter LOD, which should not change with resolution); only
  // the transform carries the extra render-scale factor.
  const cz = zoom * RENDER_SCALE;
  targetCtx.setTransform(cz, 0, 0, cz, -worldLeft * cz, -worldTop * cz);
  targetCtx.beginPath();
  targetCtx.rect(wx0, wy0, wx1 - wx0, wy1 - wy0);
  targetCtx.clip();
  drawStaticBackgroundLayer(targetCtx, cS, cE, rS, rE, dark, zoom);
  targetCtx.restore();
}

// Cap on how far a single bgScrollTo() call will actually redraw — see the
// clamp below for why.
const BG_SCROLL_STEP_CAP_PX = 220;

// Pan upkeep: shift the displayed cache toward the camera's ideal anchor,
// copying the overlap and rendering only the exposed strips. Uses the
// cache's own baked params (_bgDark) so it stays consistent with the
// pixels it's extending. Cost is proportional to how far the camera moved
// since the last call — normally cheap (a smooth drag/pan moves the camera
// tens of px between frames), but a fast mouse-flick pan (worse, one
// compounded by an already-low frame rate — a slow frame covers more real
// time, so the *next* frame's camera delta is bigger too, a vicious cycle)
// can hand this a shift of several hundred px in one call, which redraws a
// proportionally huge strip of procedural ground/grass-tuft/clutter detail
// synchronously, with no time budget — unlike bgJobStep's sibling rebuild
// path, which is deliberately sliced to BG_JOB_BUDGET_MS per frame for
// exactly this reason. That uncapped strip redraw was measured spiking a
// single frame to 70ms+ during fast zoomed-out panning.
//
// Clamp the shift actually applied per call to BG_SCROLL_STEP_CAP_PX. The
// cache carries BG_MARGIN (800px) of slack in every direction specifically
// so the displayed bitmap can lag behind the camera's ideal anchor without
// showing a gap — a capped step leaves this call's anchor short of ideal,
// but next frame's drift check (which fires every frame regardless) sees
// the remaining drift and calls this again, closing the gap over a couple
// of frames instead of paying for it all at once. Only skip the clamp when
// the jump is big enough that even one capped step wouldn't leave the usual
// margin headroom (a rare huge single-frame jump — window resize, a massive
// lag spike, a teleport) — there, catching up in one shot like before is
// safer than risking the margin running out and showing the sky through a
// gap (the exact "pop-out" bug the surrounding margin-safety logic exists
// to prevent).
function bgScrollTo() {
  const zoom = _bgZoom;
  // Cache pixels are device pixels, so every world<->cache conversion here
  // goes through cz; the thresholds below are converted with it too, so a
  // given scale caps the same *logical* distance per step at any resolution.
  const cz = zoom * RENDER_SCALE;
  const marginC = BG_MARGIN * RENDER_SCALE;
  const capC    = BG_SCROLL_STEP_CAP_PX * RENDER_SCALE;
  const idealLeft = Camera.x - BG_MARGIN / zoom;
  const idealTop  = Camera.y - BG_MARGIN / zoom;
  // Integer-pixel shift of the old content within the cache
  let shiftX = Math.round((_bgWorldLeft - idealLeft) * cz);
  let shiftY = Math.round((_bgWorldTop  - idealTop)  * cz);
  if (shiftX === 0 && shiftY === 0) return;
  if (Math.abs(shiftX) > capC && Math.abs(shiftX) < marginC + capC)
    shiftX = Math.sign(shiftX) * capC;
  if (Math.abs(shiftY) > capC && Math.abs(shiftY) < marginC + capC)
    shiftY = Math.sign(shiftY) * capC;
  const _t0 = performance.now();
  const newLeft = _bgWorldLeft - shiftX / cz;
  const newTop  = _bgWorldTop  - shiftY / cz;
  const Wc = bgScratch.width, Hc = bgScratch.height;

  bgScratchCtx.setTransform(1, 0, 0, 1, 0, 0);
  bgScratchCtx.clearRect(0, 0, Wc, Hc);
  bgScratchCtx.drawImage(bgCache, shiftX, shiftY);

  // Exposed vertical strip (full height)
  let sx0 = null, sx1 = null;
  if (shiftX < 0)      { sx0 = Math.max(0, Wc + shiftX); sx1 = Wc; }
  else if (shiftX > 0) { sx0 = 0; sx1 = Math.min(Wc, shiftX); }
  if (sx0 !== null && sx1 > sx0) {
    _bgBandDraw(bgScratchCtx, newLeft, newTop, zoom, _bgDark,
      newLeft + sx0 / cz, newTop,
      newLeft + sx1 / cz, newTop + Hc / cz);
  }
  // Exposed horizontal strip — excluding the vertical strip's columns so
  // no pixel is composited twice
  if (shiftY !== 0) {
    const sy0 = shiftY < 0 ? Math.max(0, Hc + shiftY) : 0;
    const sy1 = shiftY < 0 ? Hc : Math.min(Hc, shiftY);
    const rx0 = (sx0 !== null && shiftX > 0) ? sx1 : 0;
    const rx1 = (sx0 !== null && shiftX < 0) ? sx0 : Wc;
    if (sy1 > sy0 && rx1 > rx0) {
      _bgBandDraw(bgScratchCtx, newLeft, newTop, zoom, _bgDark,
        newLeft + rx0 / cz, newTop + sy0 / cz,
        newLeft + rx1 / cz, newTop + sy1 / cz);
    }
  }

  _bgSwap();
  _bgWorldLeft = newLeft;
  _bgWorldTop  = newTop;
  PerfMonitor.record('BG strip scroll', performance.now() - _t0);
}

// Begin a time-sliced full rebuild targeting the current camera anchor.
function bgJobStart(zoom, dark, zoneVer, W, H) {
  const worldLeft = Camera.x - BG_MARGIN / zoom;
  const worldTop  = Camera.y - BG_MARGIN / zoom;
  bgScratchCtx.setTransform(1, 0, 0, 1, 0, 0);
  bgScratchCtx.clearRect(0, 0, bgScratch.width, bgScratch.height);
  const rS = Math.max(0, Math.floor(worldTop / TILE) - 1);
  const rE = Math.min(ROWS, Math.ceil((worldTop + bgScratch.height / (zoom * RENDER_SCALE)) / TILE) + 1);
  _bgJob = { worldLeft, worldTop, zoom, dark, zoneVer, W, H, rE, nextR: rS };
}

// Advance the rebuild within a time budget; swap in when complete.
function bgJobStep(budgetMs) {
  if (!_bgJob) return;
  const t0 = performance.now();
  const j = _bgJob;
  const wx0 = j.worldLeft;
  const wx1 = j.worldLeft + bgScratch.width / (j.zoom * RENDER_SCALE);
  while (j.nextR < j.rE && performance.now() - t0 < budgetMs) {
    const bandR0 = j.nextR;
    const bandR1 = Math.min(j.rE, bandR0 + BG_JOB_BAND_ROWS);
    _bgBandDraw(bgScratchCtx, j.worldLeft, j.worldTop, j.zoom, j.dark,
      wx0, bandR0 * TILE, wx1, bandR1 * TILE);
    j.nextR = bandR1;
  }
  PerfMonitor.record('BG job chunk', performance.now() - t0);
  if (j.nextR >= j.rE) {
    // A rebuild that changed nothing but the lighting blends in with the
    // live darkness (see the dark-lerp); anything else — a settled zoom, a
    // zone edit — keeps the short timed cross-fade.
    const darkOnly = _bgValid && j.dark !== _bgDark && j.zoom === _bgZoom &&
                     j.zoneVer === _bgZoneVer && j.W === _bgW && j.H === _bgH;
    if (darkOnly) _bgStartDarkLerp(_bgDark, j.dark);
    else _bgStartFade();
    _bgSwap();
    _bgWorldLeft = j.worldLeft; _bgWorldTop = j.worldTop;
    _bgZoom = j.zoom; _bgDark = j.dark; _bgZoneVer = j.zoneVer;
    _bgW = j.W; _bgH = j.H;
    _bgValid = true;
    _bgJob = null;
  }
}
