/* ═══════════════════════════════════════════════════════════════════
   RENDER: MAIN LOOP
   The per-frame render() entry point — camera transform, pipe network
   highlight BFS, and the big switch(entity.type) dispatch to every
   render_* function across the other render files.
   ═══════════════════════════════════════════════════════════════════ */

// Set of pipe-connectable types for the hover-highlight BFS — static, hoisted
// out of the render loop (was a fresh 19-entry Set allocated every frame
// regardless of whether anything pipe-related was even hovered).
const _PIPE_CONNECTABLE = new Set([T.PIPE, T.UNDERGNDPIPE, T.WATEREXTRACTOR, T.HYDROGENERATOR,
  T.COALGENERATOR, T.CHEMICALPLANT, T.COOLINGTOWER, T.COOLINGTOWER2, T.NUCLEARREACTOR, T.STEAMTURBINE, T.STEAMTURBINE2,
  T.PUMPJACK, T.PUMPJACK2, T.OILSTORAGE, T.REFINERY, T.FUELGEN, T.CONVEYOR, T.WIRE, T.ELECTROLYZER, T.LITHIUMPROCESSPLANT, T.REPROCESSOR, T.SPENTFUELPOOL, T.MOXPLANT, T.ADVREACTOR,
  T.ATMOSCOLLECTOR, T.HABERBOSCH, T.WASHTOWER, T.FUSIONFUELPLANT, T.HULKINGFUSIONREACTOR, T.ADVFUSIONREACTOR, T.MHDRING,
  T.HELIUMWELL, T.HELIUMWELL2, T.CRYOPLANT, T.HE3SEPARATOR, T.TRITIUMBREEDER, T.GASSTORAGE, T.LEACHPLANT, T.SCMILL, T.COKEOVEN, T.GRAPHITEFURNACE]);

// PARK_TYPES itself is declared in park_request_system.js, which loads AFTER
// this file (see index.html script order) — build the Set lazily on first
// use inside the render loop rather than at this file's top level.
let _parkTypesSet = null;

// Pipe entities actually flagged `_pipeHighlight = true` last frame — lets
// the highlight-clear step below reset just these instead of scanning every
// PIPE/UNDERGNDPIPE/CONVEYOR/WIRE in the city every frame (see usage below).
let _prevPipeHighlighted = [];
// Same idea for conveyor belts flagged `_conveyorHighlight`.
let _prevConveyorHighlighted = [];

// Buildings that have been dark long enough for OutageWatch to flag them,
// collected during the main tile loop and drawn afterwards so no later
// building paints over a marker (same reason the fire/plume pass is
// deferred). Reused between frames — never reallocated.
let _outageMarked = [];

// Marker over a building that has had no power for hours: a pulsing amber
// dashed ring around its footprint and a struck-through plug badge in its
// top-right corner. Drawn in world space, so widths are divided by the
// camera zoom to stay a constant thickness on screen.
function _drawOutageMark(e, x, y, t) {
  const w = (e.width || 1) * TILE, h = (e.height || 1) * TILE;
  const pulse = 0.55 + 0.45 * Math.sin(t * 3);
  const z = Camera.zoom || 1;
  ctx.save();
  ctx.strokeStyle = `rgba(255,176,64,${(0.35 + 0.45 * pulse).toFixed(3)})`;
  ctx.lineWidth = 2 / z;
  ctx.setLineDash([6 / z, 4 / z]);
  ctx.lineDashOffset = -t * 12;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.setLineDash([]);
  // Badge — sized in screen px so it stays readable at any zoom, but never
  // wider than the building it sits on.
  const bs = Math.min(Math.max(10 / z, 7), Math.min(w, h) * 0.5);
  const bx = x + w - bs - 2 / z, by = y + 2 / z;
  ctx.fillStyle = `rgba(20,12,0,${(0.55 + 0.3 * pulse).toFixed(3)})`;
  ctx.strokeStyle = `rgba(255,176,64,${(0.5 + 0.5 * pulse).toFixed(3)})`;
  ctx.lineWidth = 1.2 / z;
  ctx.beginPath(); ctx.roundRect(bx, by, bs, bs, bs * 0.25); ctx.fill(); ctx.stroke();
  // A little plug with its prongs, then a slash through it.
  ctx.strokeStyle = `rgba(255,208,120,${(0.6 + 0.4 * pulse).toFixed(3)})`;
  ctx.lineWidth = Math.max(1 / z, bs * 0.1);
  ctx.beginPath();
  ctx.moveTo(bx + bs * 0.34, by + bs * 0.24); ctx.lineTo(bx + bs * 0.34, by + bs * 0.46);
  ctx.moveTo(bx + bs * 0.62, by + bs * 0.24); ctx.lineTo(bx + bs * 0.62, by + bs * 0.46);
  ctx.moveTo(bx + bs * 0.24, by + bs * 0.5);  ctx.lineTo(bx + bs * 0.72, by + bs * 0.5);
  ctx.moveTo(bx + bs * 0.48, by + bs * 0.5);  ctx.lineTo(bx + bs * 0.48, by + bs * 0.74);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255,80,50,${(0.65 + 0.35 * pulse).toFixed(3)})`;
  ctx.beginPath();
  ctx.moveTo(bx + bs * 0.2, by + bs * 0.8); ctx.lineTo(bx + bs * 0.8, by + bs * 0.2);
  ctx.stroke();
  ctx.restore();
}

// Hoisted out of the per-frame sun/moon glow block below — was a fresh
// closure allocated every frame.
function _hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a.toFixed(4)})`;
}

/* Dev check for a static/animated conversion (see SplitPhase in
   render_core.js). Draws the entity twice into offscreen canvases — once as
   one ordinary pass, once as under + static + over composed in order — and
   reports how many pixels differ, over a spread of animation times. A
   correct conversion reports 0.

   The two layers are composed into the same canvas rather than going through
   a real cached bitmap, deliberately: this is a test of the split's ordering
   and double-composite rules, not of bitmap resampling.

   From the dev console:
     RenderSplit.verify(EntityRegistry.getByType(T.INDUSTRIAL)[0])            */
RenderSplit.verify = function (e, samples = 6, scale = 2, tol = 2) {
  const spec = RenderSplit.for(e);
  if (!spec) return { error: 'no split registered for this entity/subtype' };
  const W = ((e.width || 1) + 2) * TILE, H = ((e.height || 1) + 2) * TILE;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = Math.ceil(W * scale); c.height = Math.ceil(H * scale);
    const g = c.getContext('2d');
    GfxQuality.muteBlur(g);
    return { c, g };
  };
  const one = mk(), split = mk();
  const X = e.col * TILE, Y = e.row * TILE;     // multi-tile renderers insist
  const ox = TILE, oy = TILE;                   // on their own anchor
  const place = (g) => {
    g.setTransform(scale, 0, 0, scale, (ox - X) * scale, (oy - Y) * scale);
    g.clearRect(X - ox, Y - oy, W, H);
  };
  const main = ctx;
  let diff = 0, maxDelta = 0, worstT = null;
  try {
    for (let i = 0; i < samples; i++) {
      const t = i * 1.7 + 0.31;
      place(one.g); place(split.g);
      ctx = one.g;
      SplitPhase.run('all', () => renderEntityAt(e, X, Y, t));
      ctx = split.g;
      if (spec.under) SplitPhase.run('under', () => spec.under(e, X, Y, t));
      SplitPhase.run('static', () => renderEntityAt(e, X, Y, t));
      SplitPhase.run('over',   () => renderEntityAt(e, X, Y, t));
      ctx = main;
      const A = one.g.getImageData(0, 0, one.c.width, one.c.height).data;
      const B = split.g.getImageData(0, 0, split.c.width, split.c.height).data;
      let sampleDiff = 0;
      for (let k = 0; k < A.length; k += 4) {
        const d = Math.max(Math.abs(A[k] - B[k]), Math.abs(A[k+1] - B[k+1]),
                           Math.abs(A[k+2] - B[k+2]), Math.abs(A[k+3] - B[k+3]));
        if (d > maxDelta) maxDelta = d;
        if (d > tol) sampleDiff++;
      }
      if (sampleDiff > diff) { diff = sampleDiff; worstT = t; }
    }
  } finally { ctx = main; }
  return { sub: e.commercialSubtype || e.businessName || '(default)',
           powered: !!e.powered, pixels: one.c.width * one.c.height,
           differing: diff, maxChannelDelta: maxDelta, worstT, tol };
};

// ── Building sprite cache (medium / low graphics quality) ────────────
// Zone buildings are the most detailed sprites in the game — hundreds of
// paths, gradients and clips apiece — and a city has hundreds of them, all
// redrawn every frame. On integrated graphics that's more than the GPU can
// rasterise at an interactive rate. Below high quality each one is instead
// drawn into its own offscreen bitmap (swapping the shared `ctx` binding for
// the duration of the draw, so the renderers need no changes) and blitted
// with a single drawImage. Bitmaps refresh on a short interval — their
// animation runs at that rate — within a per-frame time budget, and
// immediately-visible zoom changes stretch the old bitmap until its turn.
//
// Measured on a test city (400 zone buildings on screen, desktop): drawing
// them live costs ~186ms a frame and issues ~365,000 canvas calls; blitting
// them from this cache costs ~11.5ms and ~1,800 calls. Only about half of
// that 186ms is rasterising — a third is the renderers' own JavaScript — so
// it is not something a smaller canvas or a faster GPU can fix. Not drawing
// them every frame is the only lever there is.
//
// Hence the policy in useCache(): live drawing is *affordable* only while
// few buildings are on screen, so that is exactly when it is used. The cost
// of one live building is measured as the game runs (so a slow laptop and a
// fast desktop each get their own honest answer) and multiplied by how many
// are visible; while that product fits LIVE_BUDGET_MS every building is
// drawn live and animates perfectly smoothly, and once it doesn't the whole
// screen switches to bitmaps together — never some buildings animating and
// their neighbours not. Zoomed in on a few buildings you get full live
// animation; panned out over a city you get a frame rate.
const BuildingSpriteCache = (() => {
  // Overhang captured around the footprint, in tiles — what the sprites
  // actually paint outside their own tiles (shadows, awnings, garden
  // spill). Measured at under 0.4 tile on every side across the house,
  // commercial and industrial pools; one tile leaves headroom.
  const MX = 1, MTOP = 1, MBOT = 1;
  // Sprites measured painting more than a tile past their footprint (coal
  // mine 2's spoil heap 1.5, the refinery's flare 1.2, coal waste and the
  // sulfur mine's headframe just over 1) get a two-tile margin instead.
  let _wide = null;
  function _margin(type) {
    if (!_wide) _wide = new Set([T.COALMINE2, T.REFINERY, T.COALWASTE, T.SULFURMINE, T.SULFURMINE2]);
    return _wide.has(type) ? 2 : MX;
  }
  const MAX_DIM = 2048;
  const entries = new Map();   // entity -> { cv, cx, zoom, scale, at, seen }
  let _types = null;
  let refreshes = 0, spentMs = 0, lastSweep = 0;

  // ── Live-vs-cached policy ──────────────────────────────────────────
  // How much of a frame the eligible buildings may spend being drawn live.
  // The rest of a frame (ground blit, wires, roads, zone life, overlays)
  // measured ~11ms on the test city, so this leaves a 60fps frame intact on
  // a machine that can hold one at all, and degrades honestly on one that
  // can't — _liveMsPer is measured, not assumed.
  const SPLIT_BACKSTOP_MS = 4000;   // see _refreshPass
  // Re-baking bitmaps is what the frozen tier spends its time on: measured on
  // a built-up city it was ~16 bakes and ~6,000 of the frame's ~10,000 canvas
  // calls, every frame, to keep buildings animating at up to 16 fps. On
  // integrated graphics each of those calls costs several times in the GPU
  // process what it costs here, so the budget is kept small and no bitmap is
  // re-baked more often than MIN_REFRESH_MS (about 7 fps of animation — the
  // frozen tier is only in use when live drawing is unaffordable anyway).
  // Raise REFRESH_BUDGET_* / lower MIN_REFRESH_MS for smoother bitmap
  // animation at the cost of frame rate.
  const MIN_REFRESH_MS      = 140;
  const REFRESH_BUDGET_MED  = 4;    // ms of baking per frame, medium quality
  const REFRESH_BUDGET_HIGH = 3;    // ...and otherwise
  // ...and never more than this many bakes a frame, however cheap the bakes
  // look from here. The budgets above are script time, and the script is
  // the small end of a bake: each new bitmap is then rasterised and handed
  // to the GPU outside any timer this file has. A zoomed-out city measured
  // ~15 bakes a frame against the time budget alone (every building on
  // screen redrawn about seven times a second), as many canvas calls in the
  // bakes as the whole visible frame. Five holds a full screen to a few
  // refreshes a second, plenty for sprites a few dozen pixels across.
  const REFRESH_MAX_PER_FRAME = 5;
  const LIVE_BUDGET_MS = 8;
  const LIVE_RESUME    = 0.6;   // hysteresis: re-enter live at 60% of budget
  const TRIAL_GAP_MS   = 2000;  // how often a cached frame may re-test live
  // Three tiers, best-first, and the frame takes the best one it can pay
  // for — all measured on the machine it is running on, never assumed:
  //
  //   'live'   every building redrawn in full, every frame. Perfect, and
  //            affordable only when few are on screen.
  //   'split'  buildings whose renderer has a static/animated split (see
  //            SplitPhase in render_core.js) blit their masonry from a
  //            bitmap and redraw just their moving parts live, so they
  //            still animate at the frame rate for a fraction of the cost.
  //   'frozen' pure bitmaps, refreshed a few at a time under a budget.
  //            Cheapest by far, and the animation runs at that refresh
  //            rate rather than the frame rate.
  //
  // Starts frozen and only climbs off a measurement it has taken itself.
  // Starting live instead would mean the game's very first frame drew a
  // whole city with every renderer cold — seconds, on a laptop — and would
  // calibrate the estimates off that worst-of-all frames.
  let _tier      = 'frozen';    // 'live' | 'split' | 'frozen'
  let _trial     = false;       // draw this one frame live, to measure it
  let _lastTrial = 0;
  let _splitMsPer  = 0;         // EMA, ms for one building's animated overlay
  let _splitSeen   = 0;         // split-capable buildings drawn this frame
  let _splitMs     = 0;         // what their overlays cost this frame
  let _liveMsPer = 0;           // EMA, ms to draw one eligible building live
  let _visible   = 0;           // eligible buildings drawn last frame
  let _bakeMsPer = 0.5;         // EMA, ms to bake one bitmap
  let _zoomNow   = 1;           // world scale this frame is drawn at
  let _cacheOff  = false;       // High quality / explicitly live-only
  // High quality has stopped being able to afford live drawing — see the
  // note on useCache. Latched with hysteresis so a view sitting on the
  // threshold doesn't flip between live and bitmaps every frame.
  let _hiOverload = false;
  // What high quality will pay for live buildings before giving up on them.
  // Deliberately looser than LIVE_BUDGET_MS: the player asked for the
  // expensive setting, so it overruns a 60fps frame for a while before the
  // bitmaps come out.
  const HI_LIVE_CEILING_MS = LIVE_BUDGET_MS * 2;

  // Whether this frame's eligible buildings come from bitmaps.
  //   High quality      — normally never: cached sprites are baked with
  //                       shadow blur muted, so they are not pixel-identical
  //                       there. The exception is when live drawing has
  //                       stopped fitting in a frame at all, which is what
  //                       zooming right out does to a built city — each
  //                       eligible building costs ~0.17ms live at minimum
  //                       zoom, so a few hundred of them on screen is a
  //                       30fps frame and a thousand is a 150ms one. Holding
  //                       "high" there bought a blur difference invisible at
  //                       that zoom (the sprites are a dozen px across) at
  //                       the price of the frame rate, and — because auto
  //                       quality steps on frame interval — could sit there
  //                       indefinitely. So high quality falls through to the
  //                       same measured tier policy as everything else once
  //                       its own estimate says live no longer fits, and
  //                       climbs back out the moment it does (the periodic
  //                       live trial below keeps that estimate honest).
  //   Smooth anim. off  — always, the player asked for it outright.
  //   otherwise         — whenever live drawing no longer fits the budget.
  //   High quality, zoomed out past HI_CACHE_ZOOM — through the same tier
  //                       policy, whatever its own estimate says: what high
  //                       buys over a bitmap (blur, frame-rate animation)
  //                       can't be seen on sprites a few dozen pixels
  //                       across, and its live estimate is the script's
  //                       time alone. On integrated graphics the browser's
  //                       GPU process pays about three times that again, so
  //                       a zoomed-out city at high quality ran at ~33fps
  //                       with the estimate still reading comfortably
  //                       under budget.
  const HI_CACHE_ZOOM = 0.5;
  // Pinned (the Advanced Reactor's sequence, ApocalypseSystem): bitmaps
  // only, the frozen tier, no live trials, no sweep. That sequence hard-cuts
  // the camera across the city every few seconds, and each cut used to land
  // on a screenful of buildings with no bitmap (baked there and then, budget
  // or no budget) or on a live trial frame: 0.5-1.8s hitches. Pinned, the
  // sequence bakes ahead of the front with prebake() and every cut is a blit.
  let _pinned = false;
  function setPinned(on) {
    on = !!on;
    if (on === _pinned) return;
    _pinned = on;
    if (on) { if (_tier === 'split') clear(); _tier = 'frozen'; _trial = false; }
  }
  function useCache(lv) {
    // Self-correcting: however the sequence ended (or was left), the pin
    // never outlives it.
    if (_pinned && !(typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.isActive())) setPinned(false);
    if (_pinned) { _cacheOff = false; return true; }
    _cacheOff = lv >= 2 && !_hiOverload && Camera.zoom >= HI_CACHE_ZOOM;
    if (_cacheOff) return false;
    if (!GfxQuality.smoothBuildings()) return true;
    return _tier !== 'live' && !_trial;
  }

  // Whether split sprites redraw their moving parts live this frame. Turning
  // "Smooth Building Animation" off asks for the cheapest thing there is, so
  // it pins the frozen tier.
  function useSplit() { return _tier === 'split' && GfxQuality.smoothBuildings(); }

  // A split sprite whose moving parts must run live in every tier (blades that
  // would otherwise tick over at the refresh rate) - still honouring the
  // "Smooth Building Animation" switch, which asks for the cheapest draw.
  function _splitLive(split) { return !!split && (useSplit() || (!!split.alwaysLive && GfxQuality.smoothBuildings())); }

  // How stale a bitmap may get before it is re-baked. Asking for a shorter
  // interval than the cache can actually cycle through just starves the
  // buildings at the bottom of the screen, so this is derived from what the
  // per-frame bake budget can really get round: a handful of buildings on
  // screen refresh nearly every frame, a cityful backs off gracefully.
  function _interval(budgetMs) {
    const perFrame = Math.max(1, Math.min(REFRESH_MAX_PER_FRAME, budgetMs / Math.max(0.01, _bakeMsPer)));
    const cycleMs  = (Math.max(1, _visible) / perFrame) * 16.7;
    return Math.max(MIN_REFRESH_MS, Math.min(600, cycleMs));
  }

  function stats() {
    return { mode: _trial ? 'live (trial)' : _tier, visible: _visible,
             split: _splitSeen,
             liveMsPer: +_liveMsPer.toFixed(3), splitMsPer: +_splitMsPer.toFixed(3),
             bakeMsPer: +_bakeMsPer.toFixed(3),
             estLiveMs: +(_visible * _liveMsPer).toFixed(1),
             estSplitMs: +(_splitSeen * _splitMsPer).toFixed(1),
             cached: entries.size, why: { ..._why } };
  }

  function eligible(type) {
    if (!_types) {
      _types = new Set([T.HOUSE, T.COMMERCIAL, T.INDUSTRIAL, T.GOVBUILDING,
        T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB, T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ,
        ...(typeof PARK_TYPES !== 'undefined' ? PARK_TYPES : []),
        // Everything else that stands still and costs real time to draw:
        // plants, mines, research labs and resource deposits. Measured
        // 0.2-3ms a draw each (the steam turbine issues ~6,500 strokes), and
        // deposits are scattered across the whole map. They go through the
        // same live/split/frozen policy as zone buildings, so they are still
        // drawn live every frame whenever the frame can afford it. Left out:
        // anything that moves or joins its neighbours (trucks, wires, roads,
        // pipes, conveyors, shafts), poles (wire sockets land on them),
        // vegetation (already sprite-blitted) and the sub-0.2ms sprites a
        // bitmap wouldn't save anything on.
        T.STEAMTURBINE, T.STEAMTURBINE2, T.MHDRING, T.ADVREACTOR, T.HULKINGFUSIONREACTOR, T.ADVFUSIONREACTOR,
        T.REPROCESSOR, T.LITHIUMPROCESSPLANT, T.REFINERY, T.COOLINGTOWER,
        T.COOLINGTOWER2, T.FIBERHUB, T.FUELGEN, T.NUCLEARREACTOR, T.GASSTATION,
        T.MOXPLANT, T.COALGENERATOR, T.WATEREXTRACTOR, T.SPENTFUELPOOL,
        T.MK4RESEARCH, T.MK5RESEARCH, T.RESEARCH2, T.RESEARCH3, T.HABERBOSCH,
        T.WASHTOWER, T.FUSIONFUELPLANT, T.EVCHARGER, T.SURVEY, T.SURVEY2, T.SULFURMINE, T.SULFURMINE2,
        T.PUMPJACK, T.PUMPJACK2, T.COALMINE, T.COALMINE2, T.FUELPLANT,
        T.BEACON, T.DRONEPORT, T.ATMOSCOLLECTOR, T.HE3SEPARATOR, T.TRITIUMBREEDER, T.BATTERY,
        T.URANIUMMINE, T.LITHIUMMINE, T.HELIUMWELL, T.HELIUMWELL2, T.OILSTORAGE,
        T.SOLIDSTORAGE, T.GASSTORAGE, T.CHEMICALPLANT, T.HYDROGENERATOR, T.COALWASTE,
        T.OILWASTE, T.NUCLEARWASTE, T.ELECTROLYZER, T.CRYOPLANT, T.CELLTOWER,
        T.CIRCUITSWITCH, T.CIRCUITSWITCH2, T.GEOTURBINE, T.LIGHTNINGROD2, T.LIGHTNINGROD3, T.HYDROTURBINE,
        T.CARBONCAPTURE,
        T.GEODEPOSIT, T.LITHIUMDEPOSIT, T.SULFURDEPOSIT, T.URANIUMDEPOSIT,
        T.OILDEPOSIT, T.HELIUMDEPOSIT,
        T.WIND3, T.SOLAR3,
        // The Field Core chain, which came after this list was drawn up: a
        // Leach Plant measured ~0.5ms a draw, and was drawn live every frame
        // at any zoom however many were on screen.
        T.RAREEARTHDEPOSIT, T.RAREEARTHMINE, T.LEACHPLANT, T.SCMILL, T.COREWORKS, T.COKEOVEN, T.GRAPHITEFURNACE,
      ].filter(v => v !== undefined));
    }
    return _types.has(type);
  }

  // Whether the view moved since last frame. Blitting a cached sprite at a
  // rounded screen position keeps it crisp, but it also quantises its
  // position: while the camera pans, each building hops a whole pixel at a
  // time, crosses its rounding threshold on a different frame from its
  // neighbours, and swims against the ground/roads/figures underneath — all
  // of which move at subpixel precision. That reads as the buildings shaking.
  // So round only when the view is still (crisp, and a static position can't
  // jitter); draw at the exact position while it moves, where the bilinear
  // softness of a fractional blit is imperceptible but the hopping is not.
  let _viewMoving = false, _prevE = null, _prevF = null, _prevA = null;

  function beginFrame(m) {
    refreshes = 0; spentMs = 0; _splitSeen = 0; _splitMs = 0;
    if (m) _zoomNow = m.a;
    if (m) {
      _viewMoving = _prevE !== null &&
        (Math.abs(m.e - _prevE) > 0.01 || Math.abs(m.f - _prevF) > 0.01 ||
         Math.abs(m.a - _prevA) > 1e-6);
      _prevE = m.e; _prevF = m.f; _prevA = m.a;
    } else {
      _viewMoving = false; _prevE = _prevF = _prevA = null;
    }
  }

  // eligibleSeen: how many cache-eligible buildings this frame drew (either
  // way); liveMs: how long the ones drawn live actually took. The EMA is
  // only fed while drawing live, which is the only time there is anything
  // to measure — in cached mode it holds the last honest reading and is
  // what decides when live drawing becomes affordable again.
  function endFrame(now, eligibleSeen, liveMs, lv) {
    if (!_cacheOff && _tier !== 'live') _refreshPass(now, lv === 1 ? REFRESH_BUDGET_MED : REFRESH_BUDGET_HIGH);
    PerfMonitor.record('Sprite refreshes', refreshes);
    // Pinned: hold the frozen tier, no trials and no sweep (see setPinned).
    if (_pinned) { if (eligibleSeen !== undefined) _visible = eligibleSeen; return; }
    if (eligibleSeen !== undefined) {
      _visible = eligibleSeen;
      if (liveMs > 0 && eligibleSeen > 0) {
        const per = liveMs / eligibleSeen;
        _liveMsPer = _liveMsPer ? _liveMsPer + (per - _liveMsPer) * 0.25 : per;
      }
      if (_splitMs > 0 && _splitSeen > 0) {
        const per = _splitMs / _splitSeen;
        _splitMsPer = _splitMsPer ? _splitMsPer + (per - _splitMsPer) * 0.25 : per;
      }

      // Pick the best tier the budget will carry. Hysteresis is applied by
      // asking for a little more headroom to climb than to stay, so a view
      // sitting exactly on a threshold doesn't flip every frame.
      const estLive  = _visible * _liveMsPer;
      const estSplit = _splitSeen ? _splitSeen * _splitMsPer : _visible * _splitMsPer;
      const prev = _tier;
      // High quality's own live/bitmaps latch. Same estimate the tier choice
      // below runs on, just held to a looser ceiling and with hysteresis on
      // both edges so it can't chatter.
      if (_liveMsPer && estLive > 0) {
        if (estLive > HI_LIVE_CEILING_MS) _hiOverload = true;
        else if (estLive <= HI_LIVE_CEILING_MS * LIVE_RESUME) _hiOverload = false;
      }
      // Live has to clear a stricter bar to climb to, because its estimate
      // comes from a single trial frame and is the volatile one. The split
      // estimate is measured continuously while the tier is in use, so it
      // climbs at the plain budget and only drops once well past it — and
      // the cost it is being judged on is an overlay on top of a frozen
      // frame that already measured a couple of ms, not a whole frame.
      if (_liveMsPer && estLive > 0 &&
          estLive <= LIVE_BUDGET_MS * (_tier === 'live' ? 1 : LIVE_RESUME)) _tier = 'live';
      else if (!_splitMsPer ||
               estSplit <= LIVE_BUDGET_MS * (_tier === 'split' ? 1.25 : 1)) _tier = 'split';
      else _tier = 'frozen';
      // A bitmap baked for one tier is not the bitmap the other wants: the
      // split tier bakes masonry only, the frozen tier bakes the whole
      // sprite. Swapping tiers therefore invalidates every bitmap.
      if ((prev === 'split') !== (_tier === 'split')) clear();

      // Re-testing live. Once on bitmaps there is nothing left to measure,
      // so a stale estimate would strand the renderer in cached mode for
      // good — including after the player zooms right in on a handful of
      // buildings, which is exactly when live animation is both wanted and
      // affordable. The bake cost is measured every frame and is the same
      // renderers doing the same work, so it makes a serviceable proxy for
      // deciding when live is close enough to be worth one frame's honest
      // measurement; the real number then decides. Worst case that costs a
      // single slow frame every couple of seconds, and only inside the
      // narrow band where the answer is genuinely in doubt.
      _trial = false;
      // Deliberately generous against the proxy — it is only good to
      // within about a factor of two, and the cost of trying and being
      // wrong is one frame, while the cost of never trying is that live
      // animation is unreachable however far the player zooms in.
      if (_tier !== 'live' && _visible > 0 &&
          _visible * _bakeMsPer < LIVE_BUDGET_MS * 2 &&
          now - _lastTrial > TRIAL_GAP_MS) {
        _trial = true;
        _lastTrial = now;
      }
      PerfMonitor.record('Buildings live-drawn', _tier === 'live' ? _visible : 0);
    }
    if (_cacheOff) { clear(); return; }
    if (now - lastSweep < 2000) return;
    lastSweep = now;
    for (const [e, en] of entries) {
      if (now - en.seen > 4000) { en.cv.width = en.cv.height = 0; entries.delete(e); }
    }
  }

  function clear() {
    if (!entries.size) return;
    for (const en of entries.values()) en.cv.width = en.cv.height = 0;
    entries.clear();
  }

  // Render one building into its own bitmap. Swaps the shared `ctx` for the
  // offscreen context so the entity renderers need no knowledge of any of
  // this, and always puts it back.
  function _bake(e, en, x, y, t, zoom, now, interval) {
    const mg = _margin(e.type);
    const wx0 = x - mg * TILE, wy0 = y - mg * TILE;
    const ww = ((e.width || 1) + mg * 2) * TILE, wh = ((e.height || 1) + mg * 2) * TILE;
    const z = Math.min(zoom, MAX_DIM / Math.max(ww, wh));
    const pw = Math.ceil(ww * z), ph = Math.ceil(wh * z);
    if (en.cv.width !== pw || en.cv.height !== ph) { en.cv.width = pw; en.cv.height = ph; }
    const g = en.cx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, pw, ph);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.setTransform(z, 0, 0, z, -wx0 * z, -wy0 * z);
    const main = ctx;
    ctx = g;
    try {
      if (_splitLive(en.split)) SplitPhase.run('static', () => renderEntityAt(e, x, y, t));
      else renderEntityAt(e, x, y, t);
    } finally { ctx = main; }
    // A first bake lands at a random point in the interval so a screenful of
    // new bitmaps doesn't all come due on the same frame.
    en.at = en.at ? now : now - Math.random() * interval;
    en.zoom = zoom; en.scale = z;
    refreshes++;
  }

  // Keeping the bitmaps up to date, as its own budgeted pass over the
  // entries rather than something draw() does as it walks the screen.
  //
  // Doing it in draw() meant the refresh budget was handed out in row-major
  // screen order, so the buildings at the top of the screen took it every
  // frame and the ones below them could wait indefinitely — and the slower
  // the machine, the worse it got, because longer frames make everything
  // come due again sooner. The starvation was therefore worst exactly where
  // it hurt most. Sorting the due list by when each bitmap was last baked
  // spends the same budget on whatever has actually gone stalest, wherever
  // it happens to be on screen.
  const _due = [];
  // Why bitmaps came due, summed since the last stats() read (diagnostic only).
  const _why = { zoom: 0, key: 0, backstop: 0, interval: 0, frames: 0, zoomNow: 0, lastZoomEntry: 0 };
  function _refreshPass(now, budgetMs) {
    const interval = _interval(budgetMs);
    _due.length = 0;
    for (const en of entries.values()) {
      if (en.seen !== now) continue;                  // not on screen this frame
      if (en.zoom !== _zoomNow) { _why.zoom++; _why.zoomNow = _zoomNow; _why.lastZoomEntry = en.zoom; _due.push(en); continue; }
      if (en.split) {
        // The baked layer of a split sprite holds nothing that moves, so it
        // only needs redrawing when the entity's own state changes what it
        // looks like. The long interval is a backstop against some piece of
        // state the spec's key() doesn't know to watch, not the mechanism.
        const k = en.split.key(en.e);
        if (k !== en.key) { _why.key++; en.key = k; _due.push(en); }
        else if (now - en.at > SPLIT_BACKSTOP_MS) { _why.backstop++; en.key = k; _due.push(en); }
        continue;
      }
      if (now - en.at > interval) { _why.interval++; _due.push(en); }
    }
    _why.frames++;
    if (!_due.length) return;
    _due.sort((a, b) => a.at - b.at);                 // least recently baked first
    let spent = 0;
    for (let i = 0; i < _due.length && i < REFRESH_MAX_PER_FRAME && spent < budgetMs; i++) {
      const en = _due[i];
      const t0 = performance.now();
      _bake(en.e, en, en.x, en.y, en.t, _zoomNow, now, interval);
      const ms = performance.now() - t0;
      _bakeMsPer += (ms - _bakeMsPer) * 0.1;
      spent += ms;
    }
    spentMs = spent;
  }

  // Bake a building's bitmap ahead of it coming on screen, at `zoom`. False
  // if it already has one. Paced by the caller (ApocalypseSystem spends a
  // few ms a frame on it); off screen it is never swept while pinned.
  function prebake(e, zoom) {
    if (!e || entries.has(e) || !eligible(e.type)) return false;
    const { x, y } = GridManager.tileToWorld(e.col, e.row);
    const cv = document.createElement('canvas');
    const split = RenderSplit.for(e);
    const en = { cv, cx: cv.getContext('2d'), zoom: 0, scale: 1, at: 0, seen: 0,
                 e, x, y, t: (typeof GameLoop !== 'undefined' && GameLoop.animT ? GameLoop.animT() : 0) || 0,
                 split, key: split ? split.key(e) : null };
    GfxQuality.muteBlur(en.cx);
    const now = performance.now();
    // Off the frame, so a renderer that leans on per-frame state can fail
    // here; it is then left to draw() to bake on screen, as before.
    try { _bake(e, en, x, y, en.t, zoom, now, _interval(REFRESH_BUDGET_MED)); }
    catch (_err) { cv.width = cv.height = 0; return false; }
    entries.set(e, en);
    _bakeMsPer += ((performance.now() - now) - _bakeMsPer) * 0.1;
    return true;
  }

  // m: the world transform in effect; W/H: canvas size in pixels.
  function draw(e, x, y, t, now, lv, m, W, H) {
    const mg = _margin(e.type);
    const wx0 = x - mg * TILE, wy0 = y - mg * TILE;
    const ww = ((e.width || 1) + mg * 2) * TILE, wh = ((e.height || 1) + mg * 2) * TILE;
    const sx = m.a * wx0 + m.e, sy = m.d * wy0 + m.f;
    if (sx > W || sy > H || sx + ww * m.a < 0 || sy + wh * m.d < 0) return;   // entirely off screen

    const zoom = m.a;
    let en = entries.get(e);
    if (!en) {
      // No bitmap yet: bake it now, budget or no budget. That is what makes
      // the frame this cache switches on cheaper than the frame before it
      // rather than a hitch — one bake measured ~0.32ms against ~1.4ms to
      // draw the same building live, since it goes into a small offscreen
      // bitmap with blur muted and skips the main canvas's compositing.
      // Deferring it would only pay the dearer price instead.
      const cv = document.createElement('canvas');
      const split = RenderSplit.for(e);
      en = { cv, cx: cv.getContext('2d'), zoom: 0, scale: 1, at: 0, seen: 0,
             e, x, y, t, split, key: split ? split.key(e) : null };
      GfxQuality.muteBlur(en.cx);
      entries.set(e, en);
      const t0 = performance.now();
      _bake(e, en, x, y, t, zoom, now, _interval(lv === 1 ? REFRESH_BUDGET_MED : REFRESH_BUDGET_HIGH));
      _bakeMsPer += ((performance.now() - t0) - _bakeMsPer) * 0.1;
    }
    // Where and when to redraw this building when its turn comes round.
    en.x = x; en.y = y; en.t = t;
    en.seen = now;

    // The part of a split sprite that belongs beneath the building, drawn
    // live before the bitmap goes over it.
    if (en.split && en.split.under) en.split.under(e, x, y, t);

    if (en.scale === zoom) {
      // 1:1 blit. Pixel-aligned when the view is still (crisp); exact while
      // it moves, so the sprite tracks the terrain instead of hopping — see
      // _viewMoving above.
      ctx.setTransform(1, 0, 0, 1,
                       _viewMoving ? sx : Math.round(sx),
                       _viewMoving ? sy : Math.round(sy));
      ctx.drawImage(en.cv, 0, 0);
      ctx.setTransform(m);
    } else {
      ctx.drawImage(en.cv, wx0, wy0, en.cv.width / en.scale, en.cv.height / en.scale);
    }

    // ...and the moving parts, live on top. This is the whole point of the
    // split: a cached building that still animates at the frame rate.
    if (_splitLive(en.split)) {
      const _ot0 = performance.now();
      SplitPhase.run('over', () => renderEntityAt(e, x, y, t));
      _splitMs += performance.now() - _ot0;
      _splitSeen++;
    }
  }

  return { eligible, draw, beginFrame, endFrame, clear, useCache, stats, setPinned, prebake };
})();

// ── Fixture sprite cache (zoomed out) ────────────────────────────────
// The grid's small stand-still kit — poles, pylons, surge protectors,
// substations and solar arrays — drawn from bitmaps once the camera is out
// past the zoom where each one's renderer drops its moving detail.
//
// These were the bulk of a zoomed-out frame in a built-up city: a surge
// protector MK2 is ~140 canvas calls, a solar array MK2 ~130 (every PV cell
// is its own fillRect), a substation ~30, a pole or pylon ~20, all redrawn
// every frame for sprites a couple of dozen pixels across. On integrated
// graphics a canvas call costs Chrome's GPU process roughly three times what
// it costs the game's own JavaScript, and that process — not the game's
// script — was what held a dense city at ~30fps and kept a CPU core pinned.
//
// Below each type's threshold (`maxZoom`, the same zoom its renderer gates
// its glows, spinning parts and other animation on) what is left to see
// only changes with the entity's state, so each is baked once into its own
// small bitmap and re-baked when its key() changes (power, load, charge,
// the readout), when the zoom settles somewhere new, on its own slow
// refreshMs where a little life is left (a breaker's arc, a cell flicker),
// and on a long backstop for anything a key misses. key() returning null
// draws the entity live instead: anything transient or that animates
// at every zoom (a failed pole arcing, a hovered network's highlight, a
// footing in water whose ripples are drawn with it).
//
// Some go on being cached closer in (`nearZoom`, up to which they re-bake
// every `nearRefreshMs`): where all their renderer adds over maxZoom is slow
// glows and pulses — a pole's insulators, a pylon's beacon, a solar array's
// cell shimmer — five fresh bitmaps a second can't be told from sixty
// frames, at a twelfth of the canvas calls. Anything that spins or travels
// (a substation's ring, a turbine) is left live up close.
//
// Unlike BuildingSpriteCache this has no live/cached tiers: below its
// threshold a fixture's live draw shows nothing the bitmap does not, so
// there is nothing to buy back by drawing it live. A fixture with no
// bitmap yet is drawn live until its turn to bake comes round (a few a
// frame), so panning into a new district never stalls on a burst of bakes.
const FixtureCache = (() => {
  // type -> { maxZoom, margin, key(e), minMs, refreshMs, nearZoom, nearRefreshMs }
  const specs = new Map();
  const entries = new Map();   // entity -> { cv, g, key, zoom, at, seen }
  const BAKES_PER_FRAME = 8;
  const BACKSTOP_MS = 8000;
  const ZOOM_SETTLE_MS = 160;  // as the ground cache: stretch while the zoom is moving
  let maxZoomAny = 0;
  let baked = 0, lastSweep = 0, frameZoom = 0, zoomMovedAt = -Infinity;
  let viewMoving = false, prevE = null, prevF = null, prevA = null;

  function register(type, spec) {
    if (type === undefined) return;
    specs.set(type, spec);
    maxZoomAny = Math.max(maxZoomAny, spec.nearZoom || spec.maxZoom);
  }

  // Whether any fixture can come from a bitmap at this zoom (one check a
  // frame, so a zoomed-in frame pays nothing for this at all). maxZoom is
  // inclusive: the renderers switch their detail on at `zoom > threshold`.
  function active() { return Camera.zoom <= maxZoomAny; }

  function beginFrame(m, now) {
    baked = 0;
    if (m.a !== frameZoom) { frameZoom = m.a; zoomMovedAt = now; }
    // Rounded blits only while the view is still, as BuildingSpriteCache
    // (see _viewMoving there): exact positions while it moves.
    viewMoving = prevE !== null && (Math.abs(m.e - prevE) > 0.01 || Math.abs(m.f - prevF) > 0.01 || Math.abs(m.a - prevA) > 1e-6);
    prevE = m.e; prevF = m.f; prevA = m.a;
  }

  function _bake(e, en, x, y, t, wx0, wy0, ww, wh, z, key, now, refreshMs) {
    const pw = Math.max(1, Math.ceil(ww * z)), ph = Math.max(1, Math.ceil(wh * z));
    if (en.cv.width !== pw || en.cv.height !== ph) { en.cv.width = pw; en.cv.height = ph; }
    const g = en.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, pw, ph);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.setTransform(z, 0, 0, z, -wx0 * z, -wy0 * z);
    const main = ctx;
    ctx = g;
    try { renderEntityAt(e, x, y, t); }
    finally { ctx = main; }
    // A first bake lands at a random point in its refresh interval, so a
    // screenful baked together doesn't all come due again on one frame.
    en.at = en.zoom === 0 && refreshMs ? now - Math.random() * refreshMs : now;
    en.key = key; en.zoom = z;
    baked++;
  }

  // True if the entity was drawn from (or is off screen for) its bitmap;
  // false hands it back to the caller to draw live.
  function draw(e, x, y, t, now, m, W, H) {
    const spec = specs.get(e.type);
    if (!spec) return false;
    const near = Camera.zoom > spec.maxZoom;
    if (near && !(spec.nearZoom && Camera.zoom <= spec.nearZoom)) return false;
    const refreshMs = near ? spec.nearRefreshMs : spec.refreshMs;
    const key = spec.key(e);
    if (key === null) return false;
    const mg = spec.margin || 1;
    const wx0 = x - mg * TILE, wy0 = y - mg * TILE;
    const ww = ((e.width || 1) + mg * 2) * TILE, wh = ((e.height || 1) + mg * 2) * TILE;
    const sx = m.a * wx0 + m.e, sy = m.d * wy0 + m.f;
    if (sx > W || sy > H || sx + ww * m.a < 0 || sy + wh * m.d < 0) return true;
    const z = m.a;
    let en = entries.get(e);
    if (!en) {
      if (baked >= BAKES_PER_FRAME) return false;
      const cv = document.createElement('canvas');
      en = { cv, g: cv.getContext('2d'), key: null, zoom: 0, at: 0, seen: 0 };
      entries.set(e, en);
      _bake(e, en, x, y, t, wx0, wy0, ww, wh, z, key, now, refreshMs);
    } else if (baked < BAKES_PER_FRAME) {
      const settled = now - zoomMovedAt >= ZOOM_SETTLE_MS;
      if ((en.zoom !== z && settled) ||
          (en.key !== key && now - en.at >= Math.min(spec.minMs || 0, refreshMs || Infinity)) ||
          (refreshMs && now - en.at >= refreshMs) ||
          now - en.at >= BACKSTOP_MS) {
        _bake(e, en, x, y, t, wx0, wy0, ww, wh, z, key, now, refreshMs);
      }
    }
    en.seen = now;
    if (en.zoom === z) {
      ctx.setTransform(1, 0, 0, 1, viewMoving ? sx : Math.round(sx), viewMoving ? sy : Math.round(sy));
      ctx.drawImage(en.cv, 0, 0);
      ctx.setTransform(m);
    } else {
      ctx.drawImage(en.cv, wx0, wy0, ww, wh);   // stretched until the zoom settles
    }
    return true;
  }

  function endFrame(now) {
    if (now - lastSweep < 2000) return;
    lastSweep = now;
    for (const [e, en] of entries) {
      if (now - en.seen > 4000) { en.cv.width = en.cv.height = 0; entries.delete(e); }
    }
  }

  function clear() {
    for (const en of entries.values()) en.cv.width = en.cv.height = 0;
    entries.clear();
  }

  return { register, active, beginFrame, draw, endFrame, clear,
           stats: () => ({ cached: entries.size, bakedLastFrame: baked }) };
})();

// What each fixture's bitmap depends on below its maxZoom, read off its
// renderer (render_grid_electric.js / render_oil_nuclear.js). The kerb
// shifts are where the main switch slides poles and pylons standing on a
// road between zones; the sprite is baked with the shift in it.
{
  const kerb = (e, reach) => typeof poleKerbShift === 'function' ? poleKerbShift(e, reach) : 0;
  const hovered = e => _wireHighlightNetId >= 0 && e.networkId === _wireHighlightNetId;
  // Poles: glows and insulator pulses are detail-only (zoom > 0.5), and slow
  // enough to re-bake. A failed pole arcs and smokes, an out-of-range one
  // blinks its tag, and one in a lake has its water drawn with it: those stay
  // live.
  FixtureCache.register(T.POLE, {
    maxZoom: 0.5, nearZoom: 1.6, nearRefreshMs: 200,
    key: e => (e.failed || e.outOfRange || e._underWater) ? null : (e.powered ? '1|' : '0|') + kerb(e, 17),
  });
  // Pylons: below 0.5 only legs, arms and footings are drawn; closer, the
  // lattice, the insulator glow and the beacon. Lightning damage sparks and
  // smokes; footings in water bring their water tiles.
  FixtureCache.register(T.POWERTOWER, {
    maxZoom: 0.5, nearZoom: 1.6, nearRefreshMs: 200,
    key: e => (e._lightningDamaged || e._waterFooting) ? null : (e.powered ? '1|' : '0|') + kerb(e, 35),
  });
  // Surge protectors: the load meter and lamps follow the load (which moves
  // every tick, hence minMs); the arcs and the status beacon keep a little
  // life at refreshMs. The MK3's glow reaches past a one-tile margin.
  const protector = (dflt, margin) => ({
    maxZoom: 0.5, minMs: 400, refreshMs: 400, nearZoom: 1.6, nearRefreshMs: 150, margin,
    key: e => {
      const pct = Math.min(1, (e.load || 0) / (e._effectiveThreshold || dflt));
      return (e.powered ? '1|' : '0|') + Math.round(pct * 20);
    },
  });
  FixtureCache.register(T.PROTECTOR,  protector(85, 1));
  FixtureCache.register(T.PROTECTOR2, protector(250, 1));
  FixtureCache.register(T.PROTECTOR3, protector(85 * 360, 2));
  // Substations: charge (its % label), charging/discharging and power. The
  // bushings, busbar arcs, fans and ring windings are all at 'mid' zoom and up.
  const substation = maxZoom => ({
    maxZoom, refreshMs: 500,
    key: e => {
      const pct = e.def.capacity > 0 ? Math.max(0, Math.min(1, e.charge / e.def.capacity)) : 0;
      return (e.powered ? 'p' : '-') + (e.charging ? 'c' : '-') + Math.round(pct * 100);
    },
  });
  FixtureCache.register(T.SUBSTATION,  substation(0.42));
  FixtureCache.register(T.SUBSTATION2, substation(0.42));
  FixtureCache.register(T.SUBSTATION3, substation(0.42));
  FixtureCache.register(T.SUBSTATION4, substation(0.38));
  FixtureCache.register(T.SUBSTATION5, substation(0.34));
  // Solar arrays: output (the cell tint and the readout over the array, a
  // few pixels high out here, which moves with every passing cloud: hence
  // minMs) and dust. The cell shimmer and the inverter lamp run at
  // refreshMs. A hovered network's pulsing outline is drawn live. The MK2's
  // glow (zoom > 0.5) reaches past a one-tile margin.
  const solar = margin => ({
    maxZoom: 0.6, minMs: 1500, refreshMs: 1500, nearZoom: 1.6, nearRefreshMs: 200, margin,
    key: e => {
      if (hovered(e)) return null;
      const lvl = e.def.peakOutput > 0 ? Math.min(1, e.def.powerOutput / e.def.peakOutput) : 0;
      return Math.round(lvl * 40) + '|' + Math.round((e.dust || 0) * 20) + '|' + (lvl > 0.01 ? formatPower(e.def.powerOutput, 1) : '');
    },
  });
  FixtureCache.register(T.SOLAR,  solar(1));
  FixtureCache.register(T.SOLAR2, solar(2));
}

// ── Global contact shadow ────────────────────────────────────────────
// One soft shadow under every solid entity, shaped from the sprite's own
// silhouette rather than from its footprint box.
//
// This is the figure/ground separation pass. The sprites' own colours sit
// in roughly the same luminance band as the terrain, so without a
// consistent dark pool beneath them they read as decals painted onto the
// grass rather than objects standing on it.
//
// The silhouette is taken by rendering the entity once into an offscreen
// canvas, flattening whatever it painted to solid black with a 'source-in'
// fill, and softening the result — so a tower, a chimney, a vent stack or
// a pitched roofline throws a shadow of that shape, with no per-type
// artwork. The corollary is that a sprite which paints an opaque
// full-footprint slab (a house drawing its whole lot of lawn, say) still
// gets a square shadow, because square is genuinely what it paints;
// narrowing those means editing the sprite, not this pass.
//
// Because it runs inside renderEntityAt, it is captured by
// BuildingSpriteCache and appears in the blueprint preview — which is what
// we want: every view grounds its entities the same way.
//
// PERF: the silhouette is baked once per entity and never refreshed — an
// animating sprite's moving parts are small and the result is blurred, so
// the shape is effectively static, which makes this far cheaper than
// BuildingSpriteCache's 150–400ms refresh cycle. It bakes at roughly a
// third of world resolution (SCALE) because a blurred black shape carries
// no detail worth storing, and it is stretched back to world size on
// draw, which also makes it zoom-independent: one drawImage per entity per
// frame, no rebake when the camera moves. Cached in a WeakMap so a
// demolished entity's bitmap is collected with it. ctx.shadowBlur is not
// usable here — GfxQuality mutes it outright below high quality
// (gfx_quality.js) — hence the ctx.filter bake.
const ContactShadow = (() => {
  const OVERHANG = TILE;   // world px captured beyond the footprint, matching
                           // BuildingSpriteCache's measured sprite spill
  const BLUR     = 4.0;    // world px of gaussian softening. Tightened a
                           // little alongside the alpha lift below: spreading
                           // the same ink over less area is what keeps the
                           // core of the pool dark instead of just making a
                           // wider grey smear.
  const DROP     = 6;      // world px offset down-right, matching the offset
                           // the existing hand-drawn cast shadows already use
  const SCALE    = 0.35;   // silhouette px per world px
  const ALPHA    = 0.52;   // peak opacity in full daylight

  let baking = false;                // re-entry guard: the bake calls back
                                     // into renderEntityAt, which calls us
  let scratch = null, scratchCx = null;
  const cache = new WeakMap();       // entity -> canvas, or null for "nothing drawn"

  function ensureScratch(w, h) {
    if (!scratch) {
      scratch = document.createElement('canvas');
      scratchCx = scratch.getContext('2d');
      GfxQuality.muteBlur(scratchCx);
    }
    if (scratch.width < w || scratch.height < h) {
      scratch.width  = Math.max(scratch.width,  w);
      scratch.height = Math.max(scratch.height, h);
    }
    return scratchCx;
  }

  function bake(e, x, y, t, pw, ph, wx0, wy0) {
    const g = ensureScratch(pw, ph);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, scratch.width, scratch.height);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    g.setTransform(SCALE, 0, 0, SCALE, -wx0 * SCALE, -wy0 * SCALE);

    const main = ctx;
    baking = true;
    ctx = g;
    try {
      // Always the whole sprite: the shadow is cast by the building, not by
      // whichever layer of it happens to be drawing when this first runs.
      SplitPhase.run('all', () => renderEntityAt(e, x, y, t));
    } catch (_) {
      // A renderer that doesn't survive being drawn into a foreign context
      // shouldn't take the frame down with it — that entity just goes
      // without a shadow.
      return null;
    } finally {
      ctx = main;
      baking = false;
    }

    // Flatten whatever was painted into a flat black silhouette.
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#000';
    g.fillRect(0, 0, pw, ph);
    g.globalCompositeOperation = 'source-over';

    // Soften it into the entity's own keeper bitmap. Blur is specified at
    // silhouette resolution so that it comes out to BLUR world px once the
    // bitmap is stretched back up on draw.
    const out = document.createElement('canvas');
    out.width = pw; out.height = ph;
    const o = out.getContext('2d');
    try { o.filter = `blur(${(BLUR * SCALE).toFixed(2)}px)`; } catch (_) {}
    o.drawImage(scratch, 0, 0, pw, ph, 0, 0, pw, ph);
    return out;
  }

  // Entities that must NOT get a shadow: things that are part of the ground
  // rather than standing on it (roads, deposits, water), things that move
  // (trucks — the bake is position-locked), and the handful that already
  // draw a purpose-built ground shadow of their own.
  const SKIP = new Set([
    T.WIRE, T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR, T.SHAFT, T.ROAD,
    T.WATER, T.DAM, T.HYDROTURBINE,
    T.GEODEPOSIT, T.COALDEPOSIT, T.OILDEPOSIT, T.URANIUMDEPOSIT,
    T.SULFURDEPOSIT, T.LITHIUMDEPOSIT, T.HELIUMDEPOSIT, T.RAREEARTHDEPOSIT, T.AQUIFER,
    T.TREE, T.BUSH,          // own canopy shadows (render_core.js)
    T.TRUCK,
    T.POLE, T.LAMP, T.CAMERA, T.EVCHARGER,   // thin posts with own footings
    T.WIND, T.WIND2, T.WIND3, // own swept-blade ground shadow
    // Parks are ground-level plazas laid into the terrain, not massing
    // sitting on top of it.
    T.SMALLPARK, T.COMMUNITYGARDEN, T.TREEDSTREET,
    T.BASKETBALLCOURT, T.FARMERSMARKET, T.FOUNTAIN,
    T.SPLASHPAD, T.BASEBALLFIELD, T.PLAYGROUND,
    T.ALLOTMENTS, T.DOGPARK, T.COMMUNITYCENTER, T.GREENHOUSE, T.FARM,
  ]);

  // Off for the length of fn(): see WireReach, which reads its drawing back.
  let suspended = false;
  function without(fn) {
    const prev = suspended;
    suspended = true;
    try { return fn(); } finally { suspended = prev; }
  }

  function draw(e, x, y, t) {
    if (baking || suspended || SKIP.has(e.type)) return;
    const ww = (e.width  || 1) * TILE + OVERHANG * 2;
    const wh = (e.height || 1) * TILE + OVERHANG * 2;
    // Baked once, but for the shape it had then: a building turned where it
    // stands is a different silhouette. (A Liquid Storage Tank flipped with R
    // slides its shell across to the other side of its plot, and went on
    // casting the shadow of where it used to be.)
    const shape = (e.width || 1) + 'x' + (e.height || 1) + 'r' + (e._rotation || 0);
    let rec = cache.get(e);
    if (rec === undefined || rec.shape !== shape) {
      rec = { shape, pad: bake(e, x, y, t, Math.ceil(ww * SCALE), Math.ceil(wh * SCALE),
                               x - OVERHANG, y - OVERHANG) };
      cache.set(e, rec);
    }
    const pad = rec.pad;
    if (!pad) return;
    // Softened at night: a black pool over already-dark ground just reads
    // as mud, and the night overlay is doing the separation work by then.
    // The fade is shallower than the daylight lift, so full dark still lands
    // a touch above where it used to rather than scaling up with it — the
    // "reads as mud" problem gets worse, not better, as the ground darkens.
    const a = ALPHA * (1 - DayNight.darkness() * 0.68);
    const prev = ctx.globalAlpha;
    ctx.globalAlpha = prev * a;
    ctx.drawImage(pad, x - OVERHANG + DROP, y - OVERHANG + DROP, ww, wh);
    ctx.globalAlpha = prev;
  }

  // True while the shadow is baking or switched off for a read-back
  // (WireReach): SiteYard stays out of both, so the shadow is cast by the
  // plant standing on its pad, not by the pad, and cables still run in to
  // the plant itself.
  function busy() { return baking || suspended; }

  return { draw, without, busy, clear() { scratch = null; scratchCx = null; } };
})();

// Main render entry point called each frame
// Draws one entity's sprite at world position (x, y) — the per-type
// dispatch for the main entity pass, pulled out so other views (the
// blueprint save preview) draw exactly what the map does. Wires and
// roads aren't dispatched here: the main loop draws them in their own
// passes before this one.
// Largest width / height of any placeable footprint (entity defs and
// commercial / industrial / residential subtypes), computed once. Used as the
// render overdraw margin so big buildings don't cull while still on screen.
// How many tiles past its own footprint a small (4x4 or under) entity can
// paint — the main entity loop draws one only while it is within that of the
// screen. Pipes, belts and water stay inside their tile; a tree's canopy and
// shadow spill about a tile. Anything not listed gets the six tiles every
// side used to get from the loop's old fixed overdraw.
let _cullSlackTable = null;
function _cullSlack(type) {
  if (!_cullSlackTable) {
    _cullSlackTable = new Map();
    for (const [k, s] of [['PIPE', 1], ['UNDERGNDPIPE', 1], ['CONVEYOR', 1], ['WATER', 1], ['BUSH', 2], ['TREE', 3]])
      if (T[k] !== undefined) _cullSlackTable.set(T[k], s);
  }
  const s = _cullSlackTable.get(type);
  return s === undefined ? 6 : s;
}

let _maxFootprintCache = null;
function _maxFootprint() {
  if (_maxFootprintCache) return _maxFootprintCache;
  let w = 1, h = 1;
  for (const d of Object.values(EntityDefs)) { if (d && d.width > w) w = d.width; if (d && d.height > h) h = d.height; }
  if (typeof SubtypeFootprints !== 'undefined') for (const f of Object.values(SubtypeFootprints)) { if (f.width > w) w = f.width; if (f.height > h) h = f.height; }
  return (_maxFootprintCache = { w, h });
}

function renderEntityAt(e, x, y, t) {
  // Nuked buildings are drawn as ruins in place of their sprite.
  if (e._irreparable) { LightningDamageSystem.renderRuin(ctx, e, x, y, t); return; }
  const et = e.type;
  // Grounding pool first, under everything the type dispatch draws. Baked:
  // it is one drawImage, but one drawImage per building per frame measured
  // ~15ms across a screenful, which is most of what a live 'under' pass
  // costs and more than the whole animated overlay.
  // A plant's site yard (render_site_yard.js) goes under even that: the pad
  // is the ground the plant and its shadow stand on.
  if (SplitPhase.wantStatic()) {
    if (SiteYard.has(et)) SiteYard.draw(e, x, y, t);
    ContactShadow.draw(e, x, y, t);
  }
  // Buildings that grew so the people and vehicles drawn on them stand at
  // the same size as the ones out on the streets (ArtFootprints,
  // entity_defs.js): their art is still drawn for the footprint it was
  // made for, and scaled up here to fill the one the building takes now.
  // The sprite sees its old width/height for the duration of the draw.
  const art = artScaleFor(e);
  if (!art) { _renderEntitySprite(e, x, y, t); return; }
  const w0 = e.width, h0 = e.height;
  e.width = art.w; e.height = art.h;
  ctx.save();
  ctx.translate(x, y); ctx.scale(art.kx, art.ky); ctx.translate(-x, -y);
  try { _renderEntitySprite(e, x, y, t); }
  finally { ctx.restore(); e.width = w0; e.height = h0; }
}

function _renderEntitySprite(e, x, y, t) {
  const et = e.type;
  switch (et) {
    case T.SOLAR:
      renderSolar(e, x, y, t);
      break;
    case T.RESEARCH:
      renderResearch(e, x, y, t);
      if (Progression.anyReadyForMk1()) {
        const _pulse = 0.7 + 0.3 * Math.sin(t * 5);
        ctx.save(); ctx.globalAlpha = _pulse;
        ctx.fillStyle = '#ffee00';
        ctx.beginPath(); ctx.arc(x+TILE-5, y+5, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
        ctx.fillText('!', x+TILE-5, y+8); ctx.textAlign = 'left';
        ctx.restore();
      }
      if (InspectionPanel.isOpen() && InspectionPanel.target === e) {
        ctx.save();
        ctx.strokeStyle = '#b060ff';
        ctx.lineWidth   = 2 / Camera.zoom;
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 4);
        const fw = (e.width  || 1) * TILE;
        const fh = (e.height || 1) * TILE;
        ctx.strokeRect(x + 1, y + 1, fw - 2, fh - 2);
        ctx.restore();
      }
      break;
    case T.RESEARCH2:
      renderResearch2(e, x, y, t);
      if (Progression.anyReadyForMk2()) {
        const _pulse = 0.7 + 0.3 * Math.sin(t * 5);
        ctx.save(); ctx.globalAlpha = _pulse;
        ctx.fillStyle = '#ffee00';
        ctx.beginPath(); ctx.arc(x+TILE*2-5, y+5, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
        ctx.fillText('!', x+TILE*2-5, y+8); ctx.textAlign = 'left';
        ctx.restore();
      }
      break;
    case T.RESEARCH3:
      renderResearch3(e, x, y, t);
      if (Progression.anyReadyForMk3()) {
        const _pulse = 0.7 + 0.3 * Math.sin(t * 5);
        ctx.save(); ctx.globalAlpha = _pulse;
        ctx.fillStyle = '#ffee00';
        ctx.beginPath(); ctx.arc(x+TILE*3-5, y+5, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
        ctx.fillText('!', x+TILE*3-5, y+8); ctx.textAlign = 'left';
        ctx.restore();
      }
      break;
    case T.MK4RESEARCH:
      renderMk4Research(e, x, y, t);
      if (Progression.anyReadyForMk4()) {
        const _pulse = 0.7 + 0.3 * Math.sin(t * 5);
        ctx.save(); ctx.globalAlpha = _pulse;
        ctx.fillStyle = '#ffee00';
        ctx.beginPath(); ctx.arc(x+TILE*4-5, y+5, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
        ctx.fillText('!', x+TILE*4-5, y+8); ctx.textAlign = 'left';
        ctx.restore();
      }
      if (InspectionPanel.isOpen() && InspectionPanel.target === e) {
        ctx.save();
        ctx.strokeStyle = '#ff60d0';
        ctx.lineWidth   = 2 / Camera.zoom;
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 4);
        const fw = (e.width  || 1) * TILE;
        const fh = (e.height || 1) * TILE;
        ctx.strokeRect(x + 1, y + 1, fw - 2, fh - 2);
        ctx.restore();
      }
      break;
    case T.MK5RESEARCH:
      renderMk5Research(e, x, y, t);
      if (Progression.anyReadyForMk5()) {
        const _pulse = 0.7 + 0.3 * Math.sin(t * 5);
        ctx.save(); ctx.globalAlpha = _pulse;
        ctx.fillStyle = '#ffee00';
        ctx.beginPath(); ctx.arc(x+TILE*5-5, y+5, 5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
        ctx.fillText('!', x+TILE*5-5, y+8); ctx.textAlign = 'left';
        ctx.restore();
      }
      if (InspectionPanel.isOpen() && InspectionPanel.target === e) {
        ctx.save();
        ctx.strokeStyle = '#ffb43c';
        ctx.lineWidth   = 2 / Camera.zoom;
        ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 4);
        const fw = (e.width  || 1) * TILE;
        const fh = (e.height || 1) * TILE;
        ctx.strokeRect(x + 1, y + 1, fw - 2, fh - 2);
        ctx.restore();
      }
      break;
    case T.MONITOR:         dispatchScaledRender(e, x, y, t, renderMonitor); break;
    case T.MONITOR2:        renderMonitor2(e, x, y, t); break;
    case T.ENGOFFICE:       renderEngOffice(e, x, y, t); break;
    case T.BEACON:          renderBeacon(e, x, y, t); break;
    case T.SOLAR2:          renderSolar2(e, x, y, t); break;
    case T.SOLAR3:          renderSolar3(e, x, y, t); break;
    case T.WIND:            dispatchScaledRender(e, x, y, t, renderWind); break;
    case T.WIND2:           dispatchScaledRender(e, x, y, t, renderWind2); break;
    case T.WIND3:           dispatchScaledRender(e, x, y, t, renderWind3); break;
    case T.BATTERY:         renderBattery(e, x, y, t); break;
    case T.SURVEY:          renderSurvey(e, x, y, t); break;
    case T.SURVEY2:         renderSurvey2(e, x, y, t); break;
    case T.AQUIFER:         renderAquifer(e, x, y, t); break;
    case T.WATEREXTRACTOR:
      // Water under the barge: renderWaterBaseFill paints the plain fill;
      // this adds shoreline edges and self-paints any reservoir tiles.
      if (e._savedWaterTiles) for (const { c: wc, r: wr, tile } of e._savedWaterTiles) {
        if (tile && tile.type === T.WATER) renderWater(tile, wc * TILE, wr * TILE, t, true);
      }
      renderWaterExtractor(e, x, y, t);
      break;
    case T.PIPE:            if (e._underWater) renderWater(e._underWater, x, y, t); renderPipe(e, x, y, t); break;
    case T.UNDERGNDPIPE:    renderUndergndPipe(e, x, y, t); break;
    case T.HYDROGENERATOR:  renderHydroGenerator(e, x, y, t); break;
    case T.DAM:             renderDam(e, x, y, t); break;
    case T.HYDROTURBINE:    renderHydroTurbine(e, x, y, t); break;
    case T.SHAFT:
      // The shaft claims its tiles in the grid, so renderWaterBaseFill skips
      // them and the thin sprite left the water under it looking gone.
      // Paint the live water it bridges first, as pipes/wires over water do.
      if (e._waterTiles) for (const w of e._waterTiles) {
        if (w.entity instanceof Entity && w.entity.type === T.WATER) renderWater(w.entity, w.c * TILE, w.r * TILE, t);
      }
      renderShaft(e, x, y, t);
      break;
    case T.GEODEPOSIT:      renderGeoDeposit(e, x, y, t); break;
    case T.GEOWELL:         renderGeoWell(e, x, y, t); break;
    case T.GEOTURBINE:      renderGeoTurbine(e, x, y, t); break;
    case T.COALDEPOSIT:     renderCoalDeposit(e, x, y, t); break;
    case T.OILDEPOSIT:      renderOilDeposit(e, x, y, t); break;
    case T.URANIUMDEPOSIT:  renderUraniumDeposit(e, x, y, t); break;
    case T.SULFURDEPOSIT:   renderSulfurDeposit(e, x, y, t); break;
    case T.LITHIUMDEPOSIT:  renderLithiumDeposit(e, x, y, t); break;
    case T.HELIUMDEPOSIT:   renderHeliumDeposit(e, x, y, t); break;
    case T.RAREEARTHDEPOSIT: renderRareEarthDeposit(e, x, y, t); break;
    case T.PUMPJACK:        renderPumpJack(e, x, y, t); break;
    case T.PUMPJACK2:       renderPumpJackMK2(e, x, y, t); break;
    case T.OILSTORAGE:      renderOilStorage(e, x, y, t); break;
    case T.SOLIDSTORAGE:    renderSolidStorage(e, x, y, t); break;
    case T.REFINERY:        renderRefinery(e, x, y, t); break;
    case T.COALMINE:        renderCoalMine(e, x, y, t); break;
    case T.COALMINE2:       renderCoalMine(e, x, y, t); break;
    case T.URANIUMMINE:     renderUraniumMine(e, x, y, t); break;
    case T.SULFURMINE:
    case T.SULFURMINE2:     renderSulfurMine(e, x, y, t); break;
    case T.LITHIUMMINE:     renderLithiumMine(e, x, y, t); break;
    case T.RAREEARTHMINE:   renderRareEarthMine(e, x, y, t); break;
    case T.CHEMICALPLANT:   renderChemicalPlant(e, x, y, t); break;
    case T.FUELPLANT:       renderFuelPlant(e, x, y, t); break;
    case T.LEACHPLANT:      renderLeachPlant(e, x, y, t); break;
    case T.COKEOVEN:        renderCokeOven(e, x, y, t); break;
    case T.GRAPHITEFURNACE: renderGraphiteFurnace(e, x, y, t); break;
    case T.SCMILL:          renderSuperconductorMill(e, x, y, t); break;
    case T.COREWORKS:       renderCoreWorks(e, x, y, t); break;
    case T.NUCLEARREACTOR:  renderNuclearReactor(e, x, y, t); break;
    case T.COOLINGTOWER:    renderCoolingTower(e, x, y, t); break;
    case T.COOLINGTOWER2:   renderCryoCoolingTower(e, x, y, t); break;
    case T.STEAMTURBINE:    renderSteamTurbine(e, x, y, t); break;
    case T.STEAMTURBINE2:   renderSteamTurbine2(e, x, y, t); break;
    case T.ELECTROLYZER:    renderElectrolyzer(e, x, y, t); break;
    case T.LITHIUMPROCESSPLANT: renderLithiumProcessPlant(e, x, y, t); break;
    case T.REPROCESSOR:         renderReprocessingPlant(e, x, y, t); break;
    case T.MOXPLANT:            renderMoxPlant(e, x, y, t); break;
    // Its coverage ring is drawn in its own pass after the entity loop, not
    // here: the port is sprite-cached, so a ring drawn from this call would
    // be baked into (and clipped to) the bitmap.
    case T.DRONEPORT:       renderDronePort(e, x, y, t); break;
    case T.DRONECHARGER:    renderDroneCharger(e, x, y, t); break;
    // The Advanced Reactor shares the reactor sprite, told apart by its accent.
    case T.ADVREACTOR:          renderAdvancedReactor(e, x, y, t); break;
    case T.SPENTFUELPOOL:       renderSpentFuelPool(e, x, y, t); break;
    case T.ATMOSCOLLECTOR:  renderAtmosphereCollector(e, x, y, t); break;
    case T.HABERBOSCH:      renderHaberBosch(e, x, y, t); break;
    case T.WASHTOWER:       renderIsotopicWashTower(e, x, y, t); break;
    case T.FUSIONFUELPLANT: renderFusionFuelPlant(e, x, y, t); break;
    case T.HULKINGFUSIONREACTOR: renderHulkingFusionReactor(e, x, y, t); break;
    case T.ADVFUSIONREACTOR: renderAdvancedFusionReactor(e, x, y, t); break;
    case T.MHDRING:         renderMHDDeceleratorRing(e, x, y, t); break;
    case T.HELIUMWELL:      renderHeliumWell(e, x, y, t); break;
    case T.HELIUMWELL2:     renderHeliumWell2(e, x, y, t); break;
    case T.CRYOPLANT:       renderCryoPlant(e, x, y, t); break;
    case T.HE3SEPARATOR:    renderHe3Separator(e, x, y, t); break;
    case T.TRITIUMBREEDER:  renderTritiumBreeder(e, x, y, t); break;
    case T.GASSTORAGE:      renderGasStorage(e, x, y, t); break;
    case T.CONVEYOR:        if (e._underWater) renderWater(e._underWater, x, y, t); renderConveyor(e, x, y, t); break;
    case T.UNDERGNDCONVEYOR: renderUndergndBelt(e, x, y, t); break;
    case T.COALGENERATOR:   renderCoalGenerator(e, x, y, t); break;
    case T.COALWASTE:       renderCoalWasteFacility(e, x, y, t); break;
    case T.OILWASTE:        renderOilWasteFacility(e, x, y, t); break;
    case T.NUCLEARWASTE:    renderNuclearWasteFacility(e, x, y, t); break;
    case T.FUELGEN:         renderFuelGenerator(e, x, y, t); break;
    case T.GASSTATION:      renderGasStation(e, x, y, t); break;
    case T.COMMERCIAL:
      if (e.width === 1 && e.height === 1) renderCommercial(e, x, y, t);
      else dispatchScaledRender(e, x, y, t, renderCommercial);
      break;
    case T.INDUSTRIAL:      dispatchScaledRender(e, x, y, t, renderIndustrial); break;
    case T.LAMP:            renderLamp(e, x + lampVergeShift(e), y, t); break;   // on the verge, not mid-walk
    case T.CAMERA:          renderCamera(e, x, y, t); break;
    case T.EVCHARGER:       renderEVCharger(e, x, y, t); break;
    case T.SUBSTATION:      renderSubstation(e, x, y, t); break;
    case T.SUBSTATION2:     renderSubstation2(e, x, y, t); break;
    case T.SUBSTATION3:     renderSubstation3(e, x, y, t); break;
    case T.SUBSTATION4:     renderSubstation4(e, x, y, t); break;
    case T.SUBSTATION5:     renderSubstation5(e, x, y, t); break;
    // Poles and towers on a north–south road between zones stand at its kerb
    // (verticalRoadKerbShift, render_core.js), not down the middle; on a
    // commercial or industrial zone's own street, at its kerb too (zoneStreetKerbShift).
    case T.POLE:            if (e._underWater) renderWater(e._underWater, x, y, t); renderPole(e, x + poleKerbShift(e, 17), y, t); break;
    case T.PROTECTOR:       renderProtector(e, x, y, t); break;
    case T.PROTECTOR2:      renderProtector2(e, x, y, t); break;
    case T.PROTECTOR3:      renderProtector3(e, x, y, t); break;
    case T.GOVERNOR:        renderGovernor(e, x, y, t); break;
    case T.CARBONCAPTURE:   renderCarbonCapture(e, x, y, t); break;
    case T.CIRCUITSWITCH:   renderCircuitSwitch(e, x, y, t); break;
    case T.CIRCUITSWITCH2:  renderCircuitSwitch2(e, x, y, t); break;
    case T.CELLTOWER:       renderCellTower(e, x, y, t); break;
    case T.FIBERHUB:        renderFiberHub(e, x, y, t); break;
    case T.ROAD:
      // Rendered in a dedicated pass below (via EntityRegistry, not
      // grid lookup) — a truck driving over the anchor tile would
      // otherwise make GridManager.getEntity() return the truck
      // instead of the road at the one cell this draw depended on,
      // blinking the whole 6×6 road out until the truck moved off it.
      break;
    case T.POWERTOWER:
      // Stood in a lake on footings (water_build.js): paint the water it
      // claims first, as the shaft does.
      if (e._waterFooting && e._waterTiles) for (const w of e._waterTiles) {
        if (w.entity instanceof Entity && w.entity.type === T.WATER) renderWater(w.entity, w.c * TILE, w.r * TILE, t);
      }
      renderPowerTower(e, x + poleKerbShift(e, 35), y, t);
      break;
    case T.LIGHTNINGROD:    renderLightningRod(e, x, y, t); break;
    case T.LIGHTNINGROD2:   renderLightningRod2(e, x, y, t); break;
    case T.LIGHTNINGROD3:   renderLightningRod3(e, x, y, t); break;
    case T.TOWNHALL:
    case T.CIVICCENTER:
    case T.COURTHOUSE:
    case T.EMS:
    case T.HOSPITAL:
    case T.UNIVERSITY:
    case T.TRANSPORTHUB:
    case T.NATIONALGOV:
    case T.FUSIONLAB:
    case T.AIRPORT:
    case T.MILITARYBASE:
    case T.LAUNCHCOMPLEX:
    case T.NATIONALGRID:
    case T.COMPANYHQ:
      renderGovCivic(e, x, y, t); break;
    case T.GOVBUILDING:     renderGovBuilding(e, x, y, t); break;
    case T.WATER:           renderWater(e, x, y, t, true); break;
    case T.TRUCK:           break; // rendered via TruckSystem.renderTruck after main pass
    case T.TREE:            renderTree(e, x, y, t); break;
    case T.BUSH:            renderBush(e, x, y, t); break;
    case T.BIOFUELGEN:      renderBiofuelGen(e, x, y, t); break;
    case T.HOUSE:           renderHouse(e, x, y, t); break;
    default:
      // PARK_TYPES is an array — switch can't dispatch on it directly.
      // Hit this case for any unrecognized type; check parks here.
      if (!_parkTypesSet) _parkTypesSet = new Set(PARK_TYPES);
      if (_parkTypesSet.has(et)) renderPark(e, x, y, t);
      break;
  }
}

RenderSystem.render = function (t, inputState) {
  if (typeof _armPipesOverBelts === 'function') _armPipesOverBelts();
      _wireHighlightNetId = inputState.hoverNetworkId;

      // Pipe network highlight — BFS from hovered pipe/undergndpipe tile each frame
      {
        const hc = inputState.hoverCol, hr = inputState.hoverRow;
        const hovered = (hc != null && hr != null) ? GridManager.getEntity(hc, hr) : null;
        const isHighlightPipe = (e) => e && (e.type === T.PIPE || e.type === T.UNDERGNDPIPE ||
          ((e.type === T.CONVEYOR || e.type === T.WIRE) && !!e._underPipe));
        const PIPE_CONNECTABLE = _PIPE_CONNECTABLE;
        // Clear only what was actually highlighted last frame. This used to
        // scan every PIPE/UNDERGNDPIPE/CONVEYOR/WIRE entity in the entire
        // city, every single frame, regardless of whether anything
        // pipe-related was even hovered — WIRE in particular can number in
        // the thousands in a built-up city, so this was a real per-frame
        // cost that grew with city size. The BFS below only ever highlights
        // a small connected component, so tracking just that set (populated
        // as we go, below) makes the clear step exact and cheap instead.
        for (const e of _prevPipeHighlighted) e._pipeHighlight = false;
        _prevPipeHighlighted.length = 0;
        if (hovered && isHighlightPipe(hovered)) {
          const hoveredPipeEnt = getPipe(hovered) || hovered;
          const hoverFluid = pipeCurrentFluid(hoveredPipeEnt);
          const visited = new Set();
          const queue = [{ c: hc, r: hr }];
          while (queue.length) {
            const { c, r } = queue.shift();
            const key = `${c},${r}`;
            if (visited.has(key)) continue;
            visited.add(key);
            const tile = GridManager.getEntity(c, r);
            if (!tile || !isHighlightPipe(tile)) continue;
            // Set highlight on the actual pipe entity (unwrap stacking)
            const pipeEnt = (tile.type === T.PIPE || tile.type === T.UNDERGNDPIPE) ? tile : tile._underPipe;
            if (pipeEnt && !pipeEnt._pipeHighlight) { pipeEnt._pipeHighlight = true; _prevPipeHighlighted.push(pipeEnt); }
            for (const [nc, nr] of pipeBfsCoords(c, r, hoverFluid)) {
              if (!GridManager.inBounds(nc, nr) || visited.has(`${nc},${nr}`)) continue;
              const nb = GridManager.getEntity(nc, nr);
              if (nb && PIPE_CONNECTABLE.has(nb.type)) queue.push({ c: nc, r: nr });
            }
          }
        }
      }

      // Conveyor network highlight — flood-fill every belt tile joined to the
      // hovered one, including belts buried under a pipe crossing.
      {
        const hc = inputState.hoverCol, hr = inputState.hoverRow;
        const hovered = (hc != null && hr != null) ? GridManager.getEntity(hc, hr) : null;
        for (const e of _prevConveyorHighlighted) e._conveyorHighlight = false;
        _prevConveyorHighlighted.length = 0;
        if (isConveyorTile(hovered)) {
          const visited = new Set([`${hc},${hr}`]);
          const queue = [[hc, hr]];
          while (queue.length) {
            const [c, r] = queue.shift();
            const tile = GridManager.getEntity(c, r);
            const belt = tile.type === T.CONVEYOR ? tile : tile._underConveyor;
            belt._conveyorHighlight = true;
            _prevConveyorHighlighted.push(belt);
            for (const [dc, dr] of beltSteps(c, r)) {
              const nc = c + dc, nr = r + dr, key = `${nc},${nr}`;
              if (visited.has(key) || !isConveyorTile(GridManager.getEntity(nc, nr))) continue;
              visited.add(key);
              queue.push([nc, nr]);
            }
          }
        }
      }
      // W/H are the viewport in CSS pixels — the space every renderer in
      // here draws in. The canvas backing store is RENDER_SCALE of that
      // (render_core.js); DW/DH are those real device pixels, needed only
      // where something works in the backing store's own coordinates.
      const _rs = RenderScale.get();
      // From the window, not canvas.width / _rs: the backing store is
      // rounded to whole device pixels, so dividing it back out can land a
      // fraction short of the viewport and leave an unpainted sliver down
      // the right/bottom edge of the sky fill.
      // Falling back to the backing store keeps the last good size if the
      // window ever reports zero (a hidden/unpainted tab does) — reading 0
      // here would collapse the visible tile range and draw nothing.
      const W = window.innerWidth  || canvas.width  / _rs;
      const H = window.innerHeight || canvas.height / _rs;
      const DW = canvas.width, DH = canvas.height;
      let _entMs = 0, _vegMs = 0; // perf instrumentation accumulators (diagnostic only)

      Camera.resetTransform(ctx);   // base transform carries the render scale
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = DayNight.skyColor();
      ctx.fillRect(0, 0, W, H);

      // 2. Apply camera transform — all world drawing goes between here and resetTransform
      Camera.applyTransform(ctx);

      // 2a. The country past the city limits (world_backdrop.js) — under
      // the clouds, and outside the map so the ground layer never covers it.
      WorldBackdrop.render(ctx, W, H);

      // 3. Grid lines (only draw visible range for perf)
      const wTopLeft     = Camera.screenToWorld(0, 0);
      const wBottomRight = Camera.screenToWorld(W, H);
      // Overdraw margin: a multi-tile entity is drawn from its anchor (top-left)
      // tile, so one whose anchor has scrolled off the top or left edge still
      // covers the screen and must be drawn. That margin has to reach back the
      // largest footprint in the game — it was a fixed 6, so anything bigger
      // (the 10×8 Amusement Park, 12×8 Transport Hub, 13×11 waste site…)
      // popped out of existence as you panned away from its corner. Right and
      // bottom only need the old small buffer: an anchor past those edges
      // can't put anything on screen.
      const OVERDRAW = 6;
      const OVERDRAW_W = Math.max(OVERDRAW, _maxFootprint().w);
      const OVERDRAW_H = Math.max(OVERDRAW, _maxFootprint().h);
      const cStart = Math.max(0, Math.floor(wTopLeft.x / TILE) - OVERDRAW_W);
      const cEnd   = Math.min(COLS, Math.ceil(wBottomRight.x / TILE) + OVERDRAW);
      const rStart = Math.max(0, Math.floor(wTopLeft.y / TILE) - OVERDRAW_H);
      const rEnd   = Math.min(ROWS, Math.ceil(wBottomRight.y / TILE) + OVERDRAW);

      // The loop range above is deliberately generous: it has to reach back
      // far enough that a 13x11 entity whose anchor tile has scrolled off
      // the top-left corner still gets drawn. Applied to every entity that
      // means a screenful of 32x18 tiles walks ~50x35 of them, and on a
      // dense residential block that is three buildings fully rendered for
      // every one the player can see — the single largest avoidable cost in
      // the frame, since zone buildings are also the most expensive thing
      // in it.
      //
      // So entities also get culled against the real viewport, with two
      // tiles of slack for what a sprite paints outside its own footprint
      // (BuildingSpriteCache measured that overhang at under half a tile on
      // every side across the house, commercial and industrial pools, and
      // budgets one tile for it). Only cache-eligible buildings are culled
      // this way: they are the ones whose overhang is known, they are what
      // the cost is made of, and anything else keeps exactly the coverage
      // it had before.
      const VIS_SLACK = 2;
      const viewC0 = Math.floor(wTopLeft.x / TILE), viewC1 = Math.ceil(wBottomRight.x / TILE);
      const viewR0 = Math.floor(wTopLeft.y / TILE), viewR1 = Math.ceil(wBottomRight.y / TILE);
      const vcS = Math.floor(wTopLeft.x / TILE)     - VIS_SLACK;
      const vcE = Math.ceil(wBottomRight.x / TILE)  + VIS_SLACK;
      const vrS = Math.floor(wTopLeft.y / TILE)     - VIS_SLACK;
      const vrE = Math.ceil(wBottomRight.y / TILE)  + VIS_SLACK;

      // Ground tiles + grid lines + zone cobblestone — cached (Step 1),
      // now with a margin buffer (Step 2) and a zoom-settle debounce
      // (Step 3). Redrawn only when the viewport would scroll outside the
      // cached margin, zoom has settled after changing, day-night/zone
      // data changed, or canvas size changed. A plain pan just blits the
      // existing bitmap at a screen-space offset; an in-progress zoom
      // gesture blits a *scaled* stretch of the existing bitmap instead of
      // paying for a full noise/cobblestone re-render on every frame of
      // the gesture — that recompute only happens once zoom stops moving.
      {
        // Quantised to 0.02 steps (was 0.005) — at 0.005, the ~100-115
        // real-second dawn/dusk ramp crosses a step roughly every half
        // second, which means a full background cache redraw (noise +
        // grass tufts + clutter) firing about twice a second throughout
        // dawn and dusk. That was already borderline before the tuft/
        // clutter detail existed; now that each redraw does real work,
        // it reads as "freezing every couple of seconds". 0.02 steps is
        // still visually smooth (50 steps across the full dark range)
        // but redraws ~4x less often during a lighting transition.
        // Keyframed, not stepped — see BG_DARK_* in render_core.js. What
        // lies between keyframes is drawn as a blend, below.
        const _liveDark = DayNight.darkness();
        const _dark    = bgDarkKeyframe(_liveDark);
        // Background-cache key. Zone edits are not the only thing baked into
        // that bitmap any more: geothermal barren ground is too, so a survey
        // that reveals new deposits has to invalidate it as well or the new
        // deposits sit on untouched grass until some unrelated repaint. Only
        // ever compared with !==, so a composite key is fine.
        // ...and the season: the canopies painted into zone ground turn,
        // drop and regrow in a handful of steps (Seasons.foliageStep).
        const _zoneVer = ZoneSystem.getVersion() + ':' + GeoField.version() + ':' + TerrainSystem.version() + (TerrainSystem.active() ? 'a' : 'x') + ':' + Seasons.foliageStep();
        const _zoom = Camera.zoom;

        const ZOOM_SETTLE_MS = 160;
        if (_lastLiveZoom === null) _lastLiveZoom = _zoom;
        if (_zoom !== _lastLiveZoom) { _zoomSettleAt = performance.now() + ZOOM_SETTLE_MS; _lastLiveZoom = _zoom; }
        const _zoomSettled = performance.now() >= _zoomSettleAt;

        // Does the cached bitmap's own baked-in zoom still match live zoom?
        // If not, we're mid zoom-gesture — the panning offset math below
        // doesn't apply (a stale-zoom bitmap needs scaling, not just an
        // offset), so pan upkeep is skipped until zoom matches again.
        const _zoomMatches = _bgValid && _zoom === _bgZoom;

        // A fast zoom-OUT burst can shrink the stretched preview below the
        // size of the actual screen before the settle timer fires, leaving
        // visible gaps at the edges. This is rare (only mid-gesture, before
        // settle) and the zoom is still changing every frame at this point,
        // so a time-sliced job here would just restart from scratch every
        // frame and never finish — worse than the hitch it replaces, and
        // the actual bug behind the reported color pop-outs. Handle it the
        // original way instead: one immediate synchronous redraw. Rare
        // enough (only on hard zoom-out flicks) that the occasional hitch
        // here is an acceptable trade for never showing a gap.
        let _stretchGap = false;
        if (_bgValid && !_zoomMatches) {
          const _previewScale = _zoom / _bgZoom;
          // bgCache is sized in device px; this test is in CSS px.
          const _previewW = bgCache.width  * _previewScale / _rs;
          const _previewH = bgCache.height * _previewScale / _rs;
          const _previewX = (_bgWorldLeft - Camera.x) * _zoom;
          const _previewY = (_bgWorldTop  - Camera.y) * _zoom;
          _stretchGap = _previewX > 0 || _previewY > 0 || _previewX + _previewW < W || _previewY + _previewH < H;
        }

        const _staleNonZoom = _dark !== _bgDark || _zoneVer !== _bgZoneVer || W !== _bgW || H !== _bgH;

        // Margin safety: if the camera has drifted far enough that the
        // currently-displayed cache (at matching zoom) no longer safely
        // covers the viewport, this takes priority over any in-progress
        // rebuild job — a job that's mid-flight targets whatever anchor it
        // started at and doesn't track further camera movement, so without
        // this the cache could silently drift out of coverage while a job
        // runs, showing the sky colour through the gap (the pop-out). If a
        // job is running, cancel it (cheap — it hasn't swapped in yet) and
        // let the cheap strip-scroll fix coverage immediately; anything the
        // job needed to accomplish (darkness/zone update) gets re-requested
        // below on the next check.
        let _didScroll = false;
        if (_bgValid && _zoom === _bgZoom) {
          const _driftX = Math.abs((_bgWorldLeft - Camera.x) * _zoom + BG_MARGIN);
          const _driftY = Math.abs((_bgWorldTop  - Camera.y) * _zoom + BG_MARGIN);
          if (Math.max(_driftX, _driftY) > BG_SCROLL_DRIFT_PX) {
            _bgJob = null;
            bgScrollTo();
            _didScroll = true;
          }
        }

        if (!_bgValid) {
          // First frame / after resize — nothing valid to display, so pay
          // for one synchronous full render (one-off, not a gameplay hitch).
          const _bgT0 = performance.now();
          _bgJob = null;
          _bgWorldLeft = Camera.x - BG_MARGIN / _zoom;
          _bgWorldTop  = Camera.y - BG_MARGIN / _zoom;
          bgCtx.setTransform(1, 0, 0, 1, 0, 0);
          bgCtx.clearRect(0, 0, bgCache.width, bgCache.height);
          _bgBandDraw(bgCtx, _bgWorldLeft, _bgWorldTop, _zoom, _dark,
            _bgWorldLeft, _bgWorldTop,
            _bgWorldLeft + bgCache.width / (_zoom * _rs),
            _bgWorldTop  + bgCache.height / (_zoom * _rs));
          _bgZoom = _zoom; _bgDark = _dark; _bgZoneVer = _zoneVer; _bgW = W; _bgH = H;
          _bgValid = true;
          PerfMonitor.record('BG cache redraw', performance.now() - _bgT0);
        } else if (_stretchGap) {
          // Overflow case — see note above. Used to pay for one immediate
          // *synchronous* full redraw here (uncapped — the rest of this
          // system caps rebuild work at BG_JOB_BUDGET_MS per frame). A
          // scroll-wheel zoom gesture fires many zoom-delta steps in quick
          // succession, so this branch could re-trigger on every step of
          // the gesture, each paying the full uncapped redraw cost — that
          // reads as the whole game freezing while zooming, which is far
          // worse than the brief visible seam this trade was meant to
          // avoid. Route through the same time-sliced job path as the
          // settled-zoom rebuild instead: the stretched (possibly gapped)
          // preview keeps displaying for the few frames the job takes to
          // catch up, same as any other in-flight rebuild.
          // Note: unlike the settled-zoom branch below, this deliberately
          // does NOT restart merely because _zoom ticked again — a fast
          // zoom-out scroll gesture changes _zoom almost every frame, and
          // restarting on every tick reset nextR back to the top each time,
          // so the job never reached completion/swap and the gap-fill
          // colour stayed on screen for the whole gesture instead of the
          // few frames it was meant to. Letting the in-flight job run to
          // completion (even though its target zoom is already a frame or
          // two stale by the time it swaps in) closes the gap quickly; the
          // next frame's still-open gap just starts another job against
          // the newer zoom. Only dark/zone/size changes — which don't
          // fire every frame — still restart it immediately.
          if (!_bgJob || _bgJob.zoneVer !== _zoneVer || _bgJob.W !== W || _bgJob.H !== H) {
            bgJobStart(_zoom, _dark, _zoneVer, W, H);
          }
        } else if (!_didScroll && (_staleNonZoom || (!_zoomMatches && _zoomSettled))) {
          // Full rebuild needed (darkness step, zone edit, settled zoom) —
          // start/refresh a time-sliced job. The stale bitmap keeps
          // displaying (offset or stretched) until the job swaps in.
          // Only fires once zoom has actually settled (or isn't the cause
          // at all) — starting this mid-gesture on a still-changing zoom
          // was the other half of the pop-out bug: the job's target never
          // matched the live zoom for more than a frame, so it restarted
          // from scratch continuously and never completed.
          // Darkness is deliberately NOT a reason to restart a job in
          // flight. It used to be, and at dusk a new step arrived faster
          // than a laptop could finish a rebuild, so none ever finished.
          // A job that completes one keyframe behind is swapped in and the
          // very next frame's staleness check starts the next one.
          if (!_bgJob || _bgJob.zoom !== _zoom ||
              _bgJob.zoneVer !== _zoneVer || _bgJob.W !== W || _bgJob.H !== H) {
            bgJobStart(_zoom, _dark, _zoneVer, W, H);
          }
        }

        // While a full-screen gap is showing (fast zoom-out outrunning the
        // stretched preview), finish the rebuild in this single frame
        // instead of trickling it in over several — a short, rare hitch
        // reads far better than multiple frames of flat gap-fill colour
        // where the ground should be. Safe to pay the full cost here (the
        // old failure mode was this retriggering every frame of the
        // gesture — that's fixed above by no longer restarting the job on
        // every zoom tick, so this now runs to completion once and holds.
        //
        // Not under the Advanced Reactor's sequence, though: its camera cuts
        // and zooms across the map by design, and on a big city one finished
        // rebuild was a multi-second frame (3s on the detonation itself).
        // There the job gets a bigger slice a frame and the gap shows for the
        // few frames it takes, mostly under the white-out and the grade.
        const _apocBg = typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.isActive();
        if (_bgJob) bgJobStep(_apocBg ? BG_JOB_BUDGET_MS * 4 : _stretchGap ? Infinity : BG_JOB_BUDGET_MS);

        ctx.save();
        Camera.resetTransform(ctx);
        // The cache is rasterised at the same device resolution as the main
        // canvas, so it is blitted under an identity transform: a true 1:1
        // copy, with the offset rounded on the device grid it actually lands
        // on rather than on the logical one.
        // Keyframe blend (see _bgStartDarkLerp): f is how far live darkness
        // has travelled from the previous keyframe's bitmap to the current
        // one. It ends — and the ordinary blit takes over — once darkness
        // arrives, or if the old bitmap no longer covers the screen (a long
        // pan mid-dawn; the two keyframes are close enough that dropping to
        // the nearer one then is not visible).
        let _mixF = -1;
        if (_bgFadeActive && _bgFadeMode === 'dark') {
          const _span = _bgFadeToDark - _bgFadeFromDark;
          _mixF = _span ? (_liveDark - _bgFadeFromDark) / _span : 1;
          const _fs = _zoom / _bgFadeZoom;
          const _fx = (_bgFadeLeft - Camera.x) * _zoom * _rs, _fy = (_bgFadeTop - Camera.y) * _zoom * _rs;
          const _covers = _fx <= 0 && _fy <= 0 &&
                          _fx + bgFade.width * _fs >= DW && _fy + bgFade.height * _fs >= DH;
          if (_mixF >= 1 || !_covers) {
            _bgFadeActive = false; _bgFadeRelease(); _mixF = -1;
          } else if (_mixF < 0) _mixF = 0;
        }

        if (_mixF >= 0 && _zoom === _bgZoom) {
          if (bgMix.width !== DW || bgMix.height !== DH) { bgMix.width = DW; bgMix.height = DH; }
          const g = bgMixCtx;
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = 1;
          g.clearRect(0, 0, DW, DH);
          g.globalCompositeOperation = 'lighter';
          g.globalAlpha = 1 - _mixF;
          {
            const _fs = _zoom / _bgFadeZoom;
            g.drawImage(bgFade, 0, 0, bgFade.width, bgFade.height,
                        Math.round((_bgFadeLeft - Camera.x) * _zoom * _rs),
                        Math.round((_bgFadeTop  - Camera.y) * _zoom * _rs),
                        Math.round(bgFade.width * _fs), Math.round(bgFade.height * _fs));
          }
          g.globalAlpha = _mixF;
          g.drawImage(bgCache,
                      Math.round((_bgWorldLeft - Camera.x) * _zoom * _rs),
                      Math.round((_bgWorldTop  - Camera.y) * _zoom * _rs));
          g.globalCompositeOperation = 'source-over';
          g.globalAlpha = 1;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(bgMix, 0, 0);
          PerfMonitor.record('BG keyframe blend', 1);
        } else if (_zoom === _bgZoom) {
          const _blitX = Math.round((_bgWorldLeft - Camera.x) * _zoom * _rs);
          const _blitY = Math.round((_bgWorldTop  - Camera.y) * _zoom * _rs);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(bgCache, _blitX, _blitY);
        } else {
          // Mid zoom-gesture, redraw deferred until it settles — stretch
          // the stale bitmap to approximate the new scale. One scaled
          // drawImage call instead of a full re-render; briefly a little
          // soft/imprecise, which is imperceptible during a fast zoom.
          const _scale = _zoom / _bgZoom;
          const _destX = Math.round((_bgWorldLeft - Camera.x) * _zoom * _rs);
          const _destY = Math.round((_bgWorldTop  - Camera.y) * _zoom * _rs);
          const _destW = Math.round(bgCache.width  * _scale);
          const _destH = Math.round(bgCache.height * _scale);
          // If the stretched preview won't fully cover the canvas (fast
          // zoom-out flick — see _stretchGap above), the exposed area is
          // otherwise left transparent by the clearRect at the top of this
          // frame and shows through to the page background (near-black) —
          // a black flash for the few frames until the deferred rebuild job
          // (started above) catches up. Cheap flat fill first so the gap
          // reads as ground colour instead.
          if (_stretchGap) {
            ctx.fillStyle = '#2e501a';
            ctx.fillRect(0, 0, W, H);     // still CSS px — transform not yet reset
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(bgCache, 0, 0, bgCache.width, bgCache.height, _destX, _destY, _destW, _destH);
        }
        // Cross-fade the previous bitmap out on top of the new one (see
        // _bgStartFade in render_core.js) so a rebuild swap — most often
        // grass LOD density settling to a new zoom level — reads as a
        // smooth blend instead of an instant pop.
        if (_bgFadeActive && _bgFadeMode === 'time') {
          const _fadeElapsed = performance.now() - _bgFadeStart;
          const _fadeAlpha = 1 - _fadeElapsed / BG_FADE_MS;
          if (_fadeAlpha <= 0) {
            _bgFadeActive = false;
            _bgFadeRelease();   // hand the snapshot's buffer back until next fade
          } else {
            ctx.globalAlpha = _fadeAlpha;
            const _fScale = _zoom / _bgFadeZoom;
            const _fDestX = Math.round((_bgFadeLeft - Camera.x) * _zoom * _rs);
            const _fDestY = Math.round((_bgFadeTop  - Camera.y) * _zoom * _rs);
            const _fDestW = Math.round(bgFade.width  * _fScale);
            const _fDestH = Math.round(bgFade.height * _fScale);
            ctx.drawImage(bgFade, 0, 0, bgFade.width, bgFade.height, _fDestX, _fDestY, _fDestW, _fDestH);
            ctx.globalAlpha = 1;
          }
        }
        ctx.restore();
      }
      ZoneSystem.render(ctx, t, inputState.hoverCol, inputState.hoverRow);

      // 3b. Cold snap frost — subtle patchy ground whitening, drawn above
      // the ground/zone layer and below entities so buildings/wires read
      // clearly on top of it.
      FrostSystem.render(ctx);
      if (typeof SnowTracks !== 'undefined') SnowTracks.render(ctx);   // wheel ruts the trucks leave in it
      // A job site's work zones: on the ground, over the snow (which used
      // to bury them) and under every entity, so the zone's blue colours
      // the ground and never what stands on it.
      if (typeof ContractSystem !== 'undefined') ContractSystem.renderOverlay(ctx, t);
      // Permanent nuclear blast scars — on the ground, under every entity.
      LightningDamageSystem.renderScars(ctx);
      // Rain puddles on open ground and roads (puddle_system.js), under every entity.
      if (typeof PuddleSystem !== 'undefined') PuddleSystem.render(ctx);


      // 3c. Water base fill — batched into one Path2D + one fill() call for
      // every plain (non-reservoir) water tile in view, instead of paying a
      // separate ctx.fillRect() per tile inside the main entity loop below.
      // Measured ~2.3ms/frame of real script time over a large lake vs
      // ~0.1ms over plain grass — canvas draw-call overhead adds up even
      // though each individual fillRect is cheap. Reservoirs are excluded
      // (fill level varies per-tile) and still painted inside renderWater().
      // renderWater() skips its own base fill for T.WATER tiles reached via
      // the normal dispatch below (see the `skipFill` param) since this
      // pass already painted them; the rarer wire/pipe-over-water calls
      // elsewhere don't pass skipFill and still self-paint.
      // Over the view plus a few tiles for the banks and foam, not the
      // entity loop's overdraw range: that reaches 64 columns left and 48
      // rows up (for the biggest building's anchor), and every water tile
      // and baked water chunk in that band was being walked and drawn.
      const WATER_SLACK = 3;
      const wcS = Math.max(0, viewC0 - WATER_SLACK), wcE = Math.min(COLS, viewC1 + WATER_SLACK);
      const wrS = Math.max(0, viewR0 - WATER_SLACK), wrE = Math.min(ROWS, viewR1 + WATER_SLACK);
      renderWaterBaseFill(wcS, wcE, wrS, wrE, t);
      // After the apocalypse: lakes burned off to dry beds, under the ruins.
      if (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.isOver()) ApocalypseSystem.renderDryBed(ctx, wcS, wcE, wrS, wrE);

      // 4b. Roads — dedicated pass, driven by EntityRegistry rather than a
      // grid lookup. A road's whole 6×6 sprite is a single draw call keyed
      // off its own (col,row), so it can't depend on GridManager still
      // pointing at the road there — a truck (or anything else briefly
      // occupying the anchor tile) would otherwise blank the whole thing out.
      { const _t0 = performance.now();
      for (const _road of EntityRegistry.getByType(T.ROAD)) {
        if (_road.col + _road.width  < cStart || _road.col > cEnd) continue;
        if (_road.row + _road.height < rStart || _road.row > rEnd) continue;
        const { x: _rx, y: _ry } = GridManager.tileToWorld(_road.col, _road.row);
        renderRoad(_road, _rx, _ry, t);
      }
      // Ambient traffic driving between the zones on the built roads (gone
      // where the apocalypse's front has passed: ApocalypseSystem.clipLiving).
      if (typeof ZoneLife !== 'undefined') {
        ctx.save();
        if (typeof ApocalypseSystem === 'undefined' || ApocalypseSystem.clipLiving(ctx)) ZoneLife.renderRoads(ctx, t, cStart, cEnd, rStart, rEnd);
        ctx.restore();
      }
      _entMs += performance.now() - _t0; }

      // 4c. Zone life — people and vehicles out on each zone's sidewalks,
      // streets, haul roads and promenades (zone_life.js). Drawn over the
      // ground and under buildings, so a figure passing behind a sprite that
      // overhangs its footprint is tucked beneath it rather than on top.
      // Houses' garden paths onto the sidewalk go down first, under the people.
      renderHouseFrontWalks(cStart, cEnd, rStart, rEnd);
      // People, vehicles and animals are gone wherever the apocalypse's front
      // has passed, and everywhere once it is over (ApocalypseSystem.clipLiving).
      ctx.save();
      const _living = typeof ApocalypseSystem === 'undefined' || ApocalypseSystem.clipLiving(ctx);
      if (_living && typeof ZoneLife !== 'undefined') {
        const _t0 = performance.now();
        ZoneLife.render(ctx, t, cStart, cEnd, rStart, rEnd);
        PerfMonitor.record('Zone life', performance.now() - _t0);
        // What's going on at the buildings themselves: arrivals, gardens,
        // terraces, deliveries, shift changes (zone_moments.js).
        if (typeof ZoneMoments !== 'undefined') {
          const _t1 = performance.now();
          ZoneMoments.render(ctx, t);
          PerfMonitor.record('Zone moments', performance.now() - _t1);
        }
        _entMs += performance.now() - _t0;
      }
      // 4c2. Wildlife out on the open land and water (weather_state.js) —
      // on the ground pass too, so trees and buildings overhang them.
      if (_living) Wildlife.render(ctx, t);
      ctx.restore();

      // 4d. Wires — before the buildings (so generators/consumers draw on
      // top) but after the roads, traffic and zone life: a cable is strung
      // overhead, so people and cars pass under it, not across it.
      { const _t0 = performance.now();
      // Batched a block of tiles at a time — see renderWirePass. Culled to
      // the real viewport plus three tiles rather than the entity loop's
      // overdraw ring (which exists for 13-tile buildings): a wire paints a
      // few px past its own tile, and a cable run into a building reaches at
      // most 2.5 tiles (WireReach).
      renderWirePass(Math.max(cStart, vcS - 1), Math.min(cEnd, vcE + 1),
                     Math.max(rStart, vrS - 1), Math.min(rEnd, vrE + 1), t);
      _entMs += performance.now() - _t0; }

      // 5. Entities — generators and consumers
      //
      // PERF: This loop is the hottest path in the renderer. The previous
      // version ran a cascade of ~35 `if (e.type === T.X)` checks (chained
      // ifs, not else-ifs) for every visible tile. A multi-tile entity
      // (e.g. a 6×6 ROAD) was visited once per occupied tile — 36 full
      // cascade traversals just to identify a single road, even though
      // only the anchor tile actually drew anything.
      //
      // Two changes:
      //   1. Single early-out for non-anchor tiles of multi-tile entities.
      //      Collapses 36 cascade traversals into 1 for that ROAD. The
      //      old per-branch `if (e.col===c && e.row===r)` guards become
      //      redundant (harmless) but the cascade work is gone.
      //      Exception: ROAD has its own anchor-relative tiling logic that
      //      needs every tile visited — handled explicitly below.
      //   2. The remaining cascade is a `switch` so V8/SpiderMonkey can
      //      lay it out as a jump table instead of N sequential compares.
      //
      // No visual change — every code path from the original cascade is
      // preserved with identical guards and call order.
      { const _t0 = performance.now();
      // Zone buildings are the frame's dominant cost by a wide margin, so
      // BuildingSpriteCache decides per frame whether they are drawn live
      // or blitted from bitmaps — see the policy note on the cache itself.
      // The counters below are what that decision is made from: how many
      // eligible buildings were on screen, and what the live ones cost.
      const _gfxLv = GfxQuality.level();
      const _useSprites = BuildingSpriteCache.useCache(_gfxLv);
      const _worldM = ctx.getTransform();
      const _frameNow = performance.now();
      const _markOutages = typeof OutageWatch !== 'undefined' && OutageWatch.anyFlagged();
      let _eligibleSeen = 0, _liveBuildingMs = 0;
      _outageMarked.length = 0;
      BuildingSpriteCache.beginFrame(_worldM);
      // Poles, pylons, protectors, substations and solar arrays from
      // bitmaps once zoomed out past their animated detail (FixtureCache).
      const _fixtures = FixtureCache.active();
      if (_fixtures) FixtureCache.beginFrame(_worldM, _frameNow);
      // Belt and pipe tiles at the far zoom: the plain ones in a row between
      // two other things drawn go down as one pre-drawn run, at the point the
      // first of them would have (BeltPipeRows, render_mining_conveyor.js).
      const _bpRows = typeof BeltPipeRows === 'undefined' ? null
        : BeltPipeRows.begin(_worldM, cStart, cEnd, rStart, rEnd, viewC0, viewC1, viewR0, viewR1, t,
                             _prevPipeHighlighted.length > 0 || _prevConveyorHighlighted.length > 0);
      for (let r = rStart; r < rEnd; r++) {
        for (let c = cStart; c < cEnd; c++) {
          const e = GridManager.getEntity(c, r);
          if (!e || e.type === T.WIRE) continue;
          const et = e.type;
          // Anchor early-out: for multi-tile entities, only the anchor tile
          // needs to enter the dispatch. Skip the cascade entirely for the
          // 35 other tiles of a 6×6 entity. ROAD used to need an exception
          // here (its draw was keyed off this loop's per-tile scan), but it's
          // now rendered in its own dedicated pass below, so the normal
          // early-out applies to it same as everything else.
          const multi = (e.width > 1 || e.height > 1);
          if (multi && (e.col !== c || e.row !== r)) continue;
          // Small things off the screen. The loop reaches back far enough
          // for the biggest building's anchor (the National Grid, 64x48
          // tiles), and every pipe, belt, tree and tower in that band above
          // and left of the screen used to be drawn each frame, unseen: at
          // close zoom many times as many tiles as are actually on screen.
          // Each is kept while it is within its own overhang (_cullSlack) of
          // the screen. Big buildings keep the loop's full coverage.
          if ((e.width || 1) <= 4 && (e.height || 1) <= 4) {
            const s = _cullSlack(et);
            if (c + (e.width || 1) + s <= viewC0 || c - s >= viewC1 ||
                r + (e.height || 1) + s <= viewR0 || r - s >= viewR1) continue;
          }
          const { x, y } = GridManager.tileToWorld(c, r);
          if (_bpRows !== null) {
            if ((et === T.CONVEYOR || et === T.PIPE) && !e._irreparable && _bpRows.take(e, x, y)) {
              if (_markOutages && OutageWatch.isFlagged(e)) _outageMarked.push(e, x, y);
              continue;
            }
            _bpRows.flush();
          }

          if (et === T.TREE || et === T.BUSH) {
            const _vt0 = performance.now();
            renderEntityAt(e, x, y, t);
            _vegMs += performance.now() - _vt0;
          } else if (e._irreparable) {
            LightningDamageSystem.renderRuin(ctx, e, x, y, t);
          } else if (e._constructing) {
            // A building site, drawn live (never baked): it changes every
            // frame and there are only ever a handful of them.
            if (e.col + (e.width || 1) <= vcS || e.col >= vcE ||
                e.row + (e.height || 1) <= vrS || e.row >= vrE) continue;
            ConstructionSystem.render(ctx, e, x, y, t);
          } else if (BuildingSpriteCache.eligible(et)) {
            if (e.col + (e.width || 1) <= vcS || e.col >= vcE ||
                e.row + (e.height || 1) <= vrS || e.row >= vrE) continue;
            _eligibleSeen++;
            if (_useSprites) {
              // DW/DH, not W/H: _worldM (and therefore the sprite's screen
              // position inside draw()) is in device pixels.
              BuildingSpriteCache.draw(e, x, y, t, _frameNow, _gfxLv, _worldM, DW, DH);
            } else {
              // Timed so the policy knows what live drawing actually costs
              // on this machine, with this city, at this zoom.
              const _bt0 = performance.now();
              renderEntityAt(e, x, y, t);
              _liveBuildingMs += performance.now() - _bt0;
            }
          } else if (!_fixtures || !FixtureCache.draw(e, x, y, t, _frameNow, _worldM, DW, DH)) {
            renderEntityAt(e, x, y, t);
          }

          // Deferred so a building drawn later in this row-major loop can't
          // paint over the marker. Never baked into a cached sprite either —
          // the flag changes while the bitmap would not.
          if (_markOutages && OutageWatch.isFlagged(e)) _outageMarked.push(e, x, y);
        }
        if (_bpRows !== null) _bpRows.flush();
      }
      if (_bpRows !== null) _bpRows.end();
      BuildingSpriteCache.endFrame(_frameNow, _eligibleSeen, _liveBuildingMs, _gfxLv);
      FixtureCache.endFrame(_frameNow);
      _entMs += performance.now() - _t0; }

      // 5a. Water caustics — DISABLED. Even batched to one pattern+'lighter'
      // fill pair per frame (see renderWaterCaustics in render_world_civic.js),
      // that operation combo still pushed the browser off its fast
      // GPU-accelerated canvas path whenever a large water body was on
      // screen, tanking FPS from 50-60 down to 20-30 while the JS-side
      // render timer barely moved (a paint/compositor cost, not a script
      // cost). Tried at 100%, 33%, and 25% intensity — all still triggered
      // the same slow path, since the cost is per-occurrence of the
      // pattern+'lighter' combo, not proportional to alpha. Cut entirely.
      // renderWaterCaustics(cStart, cEnd, rStart, rEnd, t);

      // Current streaks, shore foam, glints, lily pads and waterfalls —
      // batched, see renderWaterEffects in render_world_civic.js.
      // Not once the apocalypse is over: the water is on fire or dried out.
      if (!(typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.isOver())) renderWaterEffects(wcS, wcE, wrS, wrE, t);

      // 5b. Water Extractor pipe-output stubs — deferred until after every
      // tile in the main loop above has painted (see renderWaterExtractorStub
      // for why: the stub extends into a neighbouring tile that's often
      // plain lake water, and that water tile can be scanned/painted AFTER
      // the extractor within the row-major loop above, covering the stub).
      for (const _we of EntityRegistry.getByType(T.WATEREXTRACTOR)) {
        if (_we.col + _we.width  < cStart || _we.col > cEnd) continue;
        if (_we.row + _we.height < rStart || _we.row > rEnd) continue;
        const { x: _wex, y: _wey } = GridManager.tileToWorld(_we.col, _we.row);
        renderWaterExtractorStub(_we, _wex, _wey, t);
      }

      // 5b0. Long-outage markers, over every building painted above.
      for (let _oi = 0; _oi < _outageMarked.length; _oi += 3) {
        _drawOutageMark(_outageMarked[_oi], _outageMarked[_oi + 1], _outageMarked[_oi + 2], t);
      }
      _outageMarked.length = 0;

      // 5b0a. A building site's handover dust, over the finished building.
      ConstructionSystem.renderFinishFx(ctx, t);

      // 5b1. Drone network outline, only while a port's panel is open — a
      // permanent 220-tile square per port would be map clutter in a city
      // with several. Drawn here rather than from the port's own renderer
      // because the port goes through BuildingSpriteCache, and because a
      // ring drawn mid-loop would be painted over by later buildings. Not
      // culled on the port's footprint: the ring reaches far past it.
      if (typeof EntityInfoPanel !== 'undefined' && EntityInfoPanel.isOpen()) {
        const _dp = EntityInfoPanel.target;
        if (_dp && (_dp.type === T.DRONEPORT || _dp.type === T.DRONECHARGER)) {
          const { x: _dpx, y: _dpy } = GridManager.tileToWorld(_dp.col, _dp.row);
          renderDronePortRange(_dp, _dpx, _dpy);
        }
      }

      // 5b'. Wire sockets — the plate where a cable enters a building, queued
      // by the wire pass but drawn now so the building doesn't paint over it.
      _renderWireTerminals();
      // Everything riding the belts — after every belt tile, so none paints
      // over an item crossing onto it (see belt_cargo_system.js).
      BeltCargo.render(t);
      // Pipes crossing over belts, on top of the cargo passing under them.
      if (typeof renderPipesOverBelts === 'function') renderPipesOverBelts(t);

      if (typeof ContractSystem !== 'undefined') ContractSystem.renderGrade(ctx);
      if (typeof ScenarioSystem !== 'undefined' && ScenarioSystem.renderGrade) ScenarioSystem.renderGrade(ctx);   // a scenario's own climate

      // 5c. Lightning fires — deferred until every tile above has painted.
      // Drawn inline these were sliced apart by whatever the row-major loop
      // rendered next: a smoke column rising four tiles is painted over by
      // the buildings below and right of the fire. Deferring puts the whole
      // plume on top of the finished scene.
      LightningDamageSystem.renderAllFires(ctx, t, cStart, cEnd, rStart, rEnd);
      // Cooling tower steam, deferred for the same reason (render_oil_nuclear.js).
      CoolingTowerPlume.renderAll(ctx, t, cStart, cEnd, rStart, rEnd);

      // 5c2. Snow on roofs and lawns (weather_state.js): over the buildings,
      // under the smog, the weather and the night.
      BuildingSnow.render(ctx, cStart, cEnd, rStart, rEnd);
      // 5c2b. A calendar event's bunting over the buildings taking part (seasonal_event_fx.js).
      if (typeof SeasonalEventFx !== 'undefined') SeasonalEventFx.renderDay(ctx, t, cStart, cEnd, rStart, rEnd);

      // 5c3. Cloud shadows (cloud_shadows.js): the sky's shade across the
      // ground and everything standing on it.
      CloudShadows.render(ctx);

      // 5d. Smog haze over the finished scene (pollution_system.js).
      if (typeof PollutionSystem !== 'undefined') PollutionSystem.render(ctx);

      // 5e. Heat wave: warm wash and shimmer over the finished scene (weather_state.js).
      HeatSystem.render(ctx, t);
      DustSystem.render(ctx, t);   // a dust storm's haze and billows
      FogSystem.render(ctx, t);    // and fog
      SmokeSystem.render(ctx, t);  // and wildfire smoke
      FrostSystem.renderWash(ctx);   // and winter's cold one

      // 5f. Butterflies and dragonflies low over the ground (small_fliers.js),
      // then the odd flock of birds passing over (weather_state.js).
      if (typeof SmallFliers !== 'undefined') SmallFliers.render(ctx, t);
      BirdFlocks.render(ctx, t);

      // 5g. Select tool: outlines on the selection, and the group's ghost at
      // its drop spot while it is being carried (input_manager.js).
      if (inputState.selection && inputState.selection.size) InputManager.renderSelection(t);

      // 6. Drag-move overlay — full entity render at hover tile + dim origin
      if (inputState.dragEntity) {
        const de  = inputState.dragEntity;
        const hc  = inputState.hoverCol;
        const hr  = inputState.hoverRow;
        const { x: ox, y: oy } = GridManager.tileToWorld(de.col, de.row);

        // Dim the origin footprint
        ctx.save();
        ctx.globalAlpha = 0.25;
        ctx.fillStyle   = '#000810';
        ctx.fillRect(ox, oy, de.width * TILE, de.height * TILE);
        ctx.restore();

        // Draw entity at hover tile (full render, slightly transparent)
        // Use drag offset so the entity follows the grab point correctly
        const destAnchorC = hc - (inputState.dragOffsetC || 0);
        const destAnchorR = hr - (inputState.dragOffsetR || 0);
        const { x: hx, y: hy } = GridManager.tileToWorld(destAnchorC, destAnchorR);
        const dw = (de.width  || 1) * TILE;
        const dh = (de.height || 1) * TILE;

        // Check if destination is free — ignoring the entity's own current footprint
        let destFree = GridManager.inBounds(destAnchorC, destAnchorR);
        if (destFree && de.type === T.HYDROTURBINE) {
          // Needs (mostly) reservoir water under it, not empty land — the
          // generic empty/vegetation check below would always read this as
          // blocked, same rule as the mousemove canDrop calc in input_manager.js.
          destFree = (destAnchorC === de.col && destAnchorR === de.row)
            || (typeof ReservoirSystem !== 'undefined' && ReservoirSystem.canBuildTurbine(destAnchorC, destAnchorR, de).ok);
        } else if (destFree && de.type === T.WATEREXTRACTOR) {
          destFree = GridManager.canDropExtractor(de, destAnchorC, destAnchorR);   // open lake, not empty land
        } else if (destFree) {
          // Empty, the entity's own tiles, vegetation (destroyed on the
          // drop) or plain wire (taken up on the drop): the same rule as
          // the drop itself in input_manager.js.
          destFree = de.type === T.TRUCK || GridManager.canDropMoved(de, destAnchorC, destAnchorR, inputState.dragAbsorbWires, inputState.dragOwnLines, inputState.dragFill);
        }

        if (GridManager.inBounds(destAnchorC, destAnchorR)) {
          ctx.save();
          ctx.globalAlpha = destFree ? 0.85 : 0.4;
          // Every building draws through the same dispatch the map uses,
          // standing at the drop spot for the length of the draw — the way
          // the Select tool's group ghost does (InputManager.renderSelection).
          // This used to be a list of types kept by hand, and anything left
          // off it (the Field Core plants, the mines, the pump jacks, the
          // geothermal well, the lightning rods...) drew nothing at all at the
          // cursor while it was being carried. At the drop spot its stub
          // lookups answer for where it would land, so the preview shows what
          // it would plug into there.
          if (de.type === T.WIRE) renderWire(de, hx, hy, t);   // its own pass on the map, not renderEntityAt
          else if (de.type !== T.TRUCK) {
            const _c = de.col, _r = de.row;
            de.col = destAnchorC; de.row = destAnchorR;
            try { renderEntityAt(de, hx, hy, t); }
            catch (_err) { ctx.fillStyle = '#40c0ff'; ctx.fillRect(hx, hy, dw, dh); }
            finally { de.col = _c; de.row = _r; }
          }
          if (de.type === T.TRUCK) {
            // TruckSystem.renderTruck works in screen space (it runs after
            // Camera.resetTransform() and does its own cam.x/cam.y/cam.zoom
            // math), but this block is still inside the world transform —
            // so draw the same body through drawTruckBody at scale 1 instead,
            // centred on the footprint and rotated to the dragged truck's
            // actual current angle.
            ctx.save();
            ctx.translate(hx + TILE/2, hy + TILE*1.5);
            ctx.rotate(de._angle || 0);
            TruckSystem.drawTruckBody(ctx, de, t, 1);
            ctx.strokeStyle = '#80e040'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.roundRect(-TILE/2 + 2, -TILE*1.5 + 2, TILE - 4, TILE*3 - 4, 5); ctx.stroke();
            ctx.restore();
          }
          ctx.restore();

          // Red tint on invalid dest — cover full footprint
          if (!destFree) {
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.fillStyle   = '#ff2200';
            ctx.fillRect(hx, hy, dw, dh);
            ctx.restore();
          }
        }
      } else if (inputState.selectedTool && inputState.selectedTool !== 'delete') {
        // Coverage overlay when placing a house
        if (inputState.selectedTool === T.HOUSE) {
          for (let r2 = rStart; r2 < rEnd; r2++) {
            for (let c2 = cStart; c2 < cEnd; c2++) {
              const sub = GridManager.getEntity(c2, r2);
              if (!sub || sub.type !== T.SUBSTATION || sub.col !== c2 || sub.row !== r2) continue;
              const scx = (sub.col + 1) * TILE, scy = (sub.row + 1) * TILE;
              const range = sub.def.coverageRange * TILE;
              ctx.save();
              ctx.globalAlpha = 0.07;
              ctx.fillStyle   = '#40a0ff';
              ctx.beginPath(); ctx.arc(scx, scy, range, 0, Math.PI * 2); ctx.fill();
              ctx.globalAlpha = 0.12;
              ctx.strokeStyle = '#40a0ff';
              ctx.lineWidth   = 1 / Camera.zoom;
              ctx.setLineDash([3 / Camera.zoom, 5 / Camera.zoom]);
              ctx.beginPath(); ctx.arc(scx, scy, range, 0, Math.PI * 2); ctx.stroke();
              ctx.setLineDash([]);
              ctx.restore();
            }
          }
        }
        // Deposit-anchored tools (mines, wells) snap to the deposit they'll
        // actually be built on — see ghostAnchor in input_manager.js.
        const _ga = inputState.ghostAnchor && inputState.ghostAnchor.tool === inputState.selectedTool ? inputState.ghostAnchor : null;
        // Placing a Lightning Rod: show the zone it would protect and which
        // buildings fall inside it, before the money is spent.
        const _st = inputState.selectedTool;
        if (_st === T.LIGHTNINGROD || _st === T.LIGHTNINGROD2 || _st === T.LIGHTNINGROD3) {
          const _d = EntityDefs[_st];
          _drawRodZone({ col: _ga ? _ga.col : inputState.hoverCol, row: _ga ? _ga.row : inputState.hoverRow,
                         width: _d.width || 1, height: _d.height || 1 }, _d.protectRange ?? 7, t, null);
        }
        renderGhost(
          _ga ? _ga.col : inputState.hoverCol,
          _ga ? _ga.row : inputState.hoverRow,
          inputState.selectedTool,
          inputState.canPlace,
          inputState.placementRotation || 0,
          inputState.shaftOrientation || 'h'
        );
        // Wind / strike / dam-head read-out for the spot under the ghost.
        TerrainSystem.drawPlacementTag(ctx, inputState.selectedTool,
          _ga ? _ga.col : inputState.hoverCol, _ga ? _ga.row : inputState.hoverRow);
        // Over water: the fill charge, or what a bridge piece costs.
        WaterBuild.drawPlacementTag(ctx, inputState.selectedTool,
          inputState.hoverCol, inputState.hoverRow, inputState.placementRotation || 0);
        // Live path preview for PATHTOOL — confirmed waypoints + rubber-band line to cursor
        if (inputState.selectedTool === T.PATHTOOL && inputState._pathPreview && inputState._pathPreview.length >= 1) {
          const _prev = inputState._pathPreview;
          const _cur  = inputState._pathCursor;
          const z = Camera.zoom;
          ctx.save();
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          // Camera transform is already applied — draw in world coords directly

          // Confirmed segments
          if (_prev.length >= 2) {
            ctx.strokeStyle = 'rgba(240,192,48,0.9)';
            ctx.lineWidth = 2.5 / z;
            ctx.setLineDash([]);
            ctx.beginPath();
            for (let _pi = 0; _pi < _prev.length; _pi++) {
              if (_pi === 0) ctx.moveTo(_prev[_pi].wx, _prev[_pi].wy);
              else           ctx.lineTo(_prev[_pi].wx, _prev[_pi].wy);
            }
            ctx.stroke();
          }

          // Rubber-band line from last waypoint to cursor
          if (_cur) {
            const _last = _prev[_prev.length - 1];
            ctx.strokeStyle = 'rgba(240,192,48,0.45)';
            ctx.lineWidth = 2 / z;
            ctx.setLineDash([5 / z, 4 / z]);
            ctx.beginPath();
            ctx.moveTo(_last.wx, _last.wy);
            ctx.lineTo(_cur.wx,  _cur.wy);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Waypoint dots — first is bigger (anchor)
          for (let _pi = 0; _pi < _prev.length; _pi++) {
            ctx.beginPath(); ctx.arc(_prev[_pi].wx, _prev[_pi].wy, (_pi === 0 ? 5 : 3.5) / z, 0, Math.PI*2);
            ctx.fillStyle = _pi === 0 ? '#ffe060' : '#f0c030'; ctx.fill();
            ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1 / z; ctx.stroke();
          }
          // Cursor dot — turns green and rings the start point once the
          // cursor is close enough to snap-close the loop there.
          if (_cur) {
            ctx.beginPath(); ctx.arc(_cur.wx, _cur.wy, 3 / z, 0, Math.PI*2);
            ctx.fillStyle = _cur.closing ? 'rgba(80,224,120,0.9)' : 'rgba(240,192,48,0.5)';
            ctx.fill();
            if (_cur.closing) {
              ctx.beginPath(); ctx.arc(_prev[0].wx, _prev[0].wy, 8 / z, 0, Math.PI*2);
              ctx.strokeStyle = 'rgba(80,224,120,0.9)'; ctx.lineWidth = 2 / z; ctx.stroke();
            }
          }
          ctx.restore();
        }
      } else if (inputState.selectedTool === 'delete') {
        const { hoverCol: c, hoverRow: r } = inputState;
        if (GridManager.inBounds(c, r)) {
          const { x, y } = GridManager.tileToWorld(c, r);
          ctx.save();
          ctx.globalAlpha = 0.3;
          ctx.fillStyle   = '#ff4444';
          ctx.fillRect(x, y, TILE, TILE);
          ctx.restore();
        }
      } else if (BlueprintSystem.isStamping()) {
        // 6c. Blueprint stamp ghost — each copied object's real sprite,
        // faded, with a red wash where its tiles aren't free (see
        // BlueprintSystem.renderStampGhost). It used to be one flat block per
        // object in its map colour, which for most buildings is near-black.
        BlueprintSystem.renderStampGhost(inputState.hoverCol, inputState.hoverRow, t);
      }

      // 6b. Fishing line/bobber — drawn independently of the ghost cursor so
      // a cast line stays visible on the map even if the pole tool gets
      // deselected while waiting for a bite.
      if (typeof FishingSystem !== 'undefined') FishingSystem.renderWorld(ctx);

      // 7a. Substation self-selection highlight
      if (inputState.selectedSubstation) {
        const sub = inputState.selectedSubstation;
        if (GridManager.getEntity(sub.col, sub.row) === sub) {
          ctx.save();
          const pct = sub.def.capacity > 0 ? Math.round(((sub.charge||0)/sub.def.capacity)*100) : 0;  // 0-100
          ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t*4);
          ctx.strokeStyle = '#60c0ff';
          ctx.lineWidth   = 2/Camera.zoom;
          ctx.strokeRect(sub.col*TILE+2, sub.row*TILE+2, sub.width*TILE-4, sub.height*TILE-4);
          ctx.globalAlpha = 0.7;
          ctx.fillStyle   = '#60c0ff';
          ctx.font        = `${Math.round(10/Camera.zoom)}px Courier New`;
          ctx.textAlign   = 'center';
          ctx.fillText(`${pct}% charged`, (sub.col+1)*TILE, (sub.row+2)*TILE + 6/Camera.zoom);
          ctx.textAlign   = 'left';
          ctx.restore();
        } else {
          inputState.selectedSubstation = null;
        }
      }

      // 7a2. Lightning Rod protection radius (see _drawRodZone).
      if (inputState.selectedLightningRod) {
        const rod = inputState.selectedLightningRod;
        if (GridManager.getEntity(rod.col, rod.row) === rod) {
          _drawRodZone(rod, rod.def.protectRange ?? 7, t, rod);
        } else {
          inputState.selectedLightningRod = null;
        }
      }

      // 7a3. Carbon Capture Plant: its capture radius while its panel is open.
      if (typeof EntityInfoPanel !== 'undefined' && EntityInfoPanel.isOpen()) {
        const cc = EntityInfoPanel.target;
        if (cc && cc.type === T.CARBONCAPTURE && GridManager.getEntity(cc.col, cc.row) === cc)
          _drawCaptureRadius((cc.col + (cc.width || 1) / 2) * TILE, (cc.row + (cc.height || 1) / 2) * TILE);
      }

      // 7b. House-selection highlight removed

      // 7c/7d. Placement option pins — A / B / C. Shared by pending property
      // requests and the RelocatePicker. They used to be small pins with an
      // 18%-alpha halo that were easy to miss, especially zoomed out; now
      // each one has a strong pulsing glow, an expanding ripple, a glowing
      // outline of the footprint it proposes, and a minimum on-screen size.
      const _drawPlacementPin = (loc, i, color, fw, fh) => {
        const z     = Camera.zoom;
        const label = 'ABCDEFG'[i] || String(i + 1);
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i * 0.9);
        const pinSize = Math.max(TILE * 0.7, 26 / z);          // never smaller than ~26 px on screen
        const wx = (loc.col + 0.5) * TILE, wy = (loc.row + 0.5) * TILE;
        const headY = wy - pinSize * 0.55;
        ctx.save();

        // Footprint the option would occupy — a glowing dashed outline + tint.
        if (fw && fh) {
          const fx = loc.col * TILE, fy = loc.row * TILE, fwpx = fw * TILE, fhpx = fh * TILE;
          ctx.globalAlpha = 0.10 + 0.08 * pulse;
          ctx.fillStyle = color;
          ctx.fillRect(fx, fy, fwpx, fhpx);
          ctx.globalAlpha = 0.75 + 0.25 * pulse;
          ctx.shadowColor = color; ctx.shadowBlur = 14;
          ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, 2.5 / z);
          ctx.setLineDash([8 / z, 5 / z]); ctx.lineDashOffset = -t * 20 / z;
          ctx.strokeRect(fx + 1, fy + 1, fwpx - 2, fhpx - 2);
          ctx.setLineDash([]);
        }

        // Big soft glow behind the pin.
        ctx.shadowBlur = 0;
        const gr = pinSize * (2.2 + 0.5 * pulse);
        const g = ctx.createRadialGradient(wx, headY, 0, wx, headY, gr);
        g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.35 + 0.25 * pulse;
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(wx, headY, gr, 0, Math.PI * 2); ctx.fill();

        // Ripple ring expanding out from the pin.
        const rp = (t * 0.7 + i * 0.33) % 1;
        ctx.globalAlpha = 0.7 * (1 - rp);
        ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, 2 / z);
        ctx.beginPath(); ctx.arc(wx, headY, pinSize * (0.5 + rp * 2.2), 0, Math.PI * 2); ctx.stroke();

        // Pin body, glowing.
        ctx.globalAlpha = 1;
        ctx.shadowColor = color; ctx.shadowBlur = 18 + 10 * pulse;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(wx, headY, pinSize * 0.45, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(wx - pinSize * 0.3, headY + pinSize * 0.12);
        ctx.lineTo(wx, wy + pinSize * 0.25);
        ctx.lineTo(wx + pinSize * 0.3, headY + pinSize * 0.12);
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;

        // Letter inside the pin head.
        ctx.fillStyle = '#070a0d';
        ctx.beginPath(); ctx.arc(wx, headY, pinSize * 0.32, 0, Math.PI * 2); ctx.fill();
        ctx.font = `bold ${Math.round(pinSize * 0.42)}px Arial, sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = color; ctx.shadowBlur = 8;
        ctx.fillStyle = color;
        ctx.fillText(label, wx, headY + pinSize * 0.02);
        ctx.restore();
      };

      // Drawn later, AFTER the night overlay (step 8b), so they glow at full
      // brightness at dusk and night instead of being dimmed with the world.
      const _drawAllPlacementPins = () => {
        const activeReq = HouseRequestSystem.getActivePendingRequest();
        if (activeReq && activeReq.locations && activeReq.locations.length) {
          const PIN_COLOR = activeReq.isIndustrial ? '#ff8040'
                          : activeReq.isCommercial ? '#f0c040'
                          : '#00d4ff';
          // The footprint accept() will build: the subtype's, unless the
          // request carries its own. Only residential requests carry one, so
          // reading _width alone outlined every shop and factory as one tile.
          const fp = entityFootprint(activeReq.isIndustrial ? T.INDUSTRIAL : activeReq.isCommercial ? T.COMMERCIAL : T.HOUSE, activeReq.subtype);
          const fw = activeReq._width > 1 ? activeReq._width : fp.width, fh = activeReq._height > 1 ? activeReq._height : fp.height;
          activeReq.locations.forEach((loc, i) => _drawPlacementPin(loc, i, PIN_COLOR, fw || 1, fh || 1));
        }
        if (RelocatePicker.active) {
          const ent = RelocatePicker.entity;
          RelocatePicker.locations.forEach((loc, i) =>
            _drawPlacementPin(loc, i, '#f0c040', ent ? (ent.width || 1) : 1, ent ? (ent.height || 1) : 1));
        }
      };

      // 7e. Amenity request markers (street lamp / security camera). Drawn
      // in 8b, above the night overlay, so an ask made after dark is as easy
      // to find as one made at noon — see _drawAmenityRequestMarkers.

      // Lightning strikes land in world space so a bolt hitting a building
      // the player happens to be looking at is drawn on that building.
      // Must stay inside the camera transform (above resetTransform).
      LightningDamageSystem.renderStrikes(ctx, t);
      // Meltdown danger zones + countdowns over critical generators.
      MeltdownSystem.render(ctx, t);
      // Shock front, fallout haze and per-building fireballs — world space,
      // so they sit on the map rather than on the lens.
      if (typeof ApocalypseSystem !== 'undefined') ApocalypseSystem.renderWorld(ctx, t);
      // Operation Hyperion's reserved site, before the station stands.
      if (typeof NationalProject !== 'undefined') NationalProject.renderWorld(ctx, t);

      Camera.resetTransform(ctx);
    Particles.render(ctx, Camera);

      // 8. Night overlay — two-pass approach:
      //    Pass A (heavy): darkens the sky/background strongly
      //    Pass B (light):  gently dims entities; capped so sprites stay legible
      const dark = DayNight.darkness();
      if (dark > 0.01) {
        ctx.save();
        ctx.globalAlpha = dark * 0.60;
        ctx.fillStyle   = '#010306';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      // 8b. Placement option pins (A / B / C) and amenity request markers —
      // above the night overlay.
      Camera.applyTransform(ctx);
      ZoneLights.render(ctx, dark, cStart, cEnd, rStart, rEnd);   // zone street, porch, shop and yard lights
      SiteYard.renderNight(ctx, dark, cStart, cEnd, rStart, rEnd);   // plant yard floodlights (render_site_yard.js)
      if (typeof SeasonalEventFx !== 'undefined') SeasonalEventFx.renderNight(ctx, dark, t, cStart, cEnd, rStart, rEnd);   // festival lights, stage beams, pledge markers
      if (typeof SmallFliers !== 'undefined') SmallFliers.renderNight(ctx);   // fireflies glowing, bats against the dusk
      if (typeof ContractSystem !== 'undefined') ContractSystem.renderLabels(ctx);   // job-site zone names
      _drawAllPlacementPins();
      _drawAmenityRequestMarkers(ctx, t);
      _drawZoneRequestMarkers(ctx, t);
      WorldBackdrop.renderLights(ctx, t);   // neighbouring towns after dark
      AuroraSystem.renderSparks(ctx, t, cStart, cEnd, rStart, rEnd);   // a geomagnetic storm arcing across substations
      Camera.resetTransform(ctx);
      // 8c. The aurora, over the darkened city (weather_state.js).
      AuroraSystem.renderSky(ctx, t, W, H);

      // 9. Cursor lantern — soft radial light that follows the mouse at night
      if (dark > 0.05 && _lanternOn && _cursorScreenX > -9000) {
        const _r1 = TILE * Camera.zoom * 2;
        const _r2 = TILE * Camera.zoom * 36;
        const _lanternAlpha = dark * 0.55;
        const _grd = ctx.createRadialGradient(_cursorScreenX, _cursorScreenY, _r1, _cursorScreenX, _cursorScreenY, _r2);
        _grd.addColorStop(0,   `rgba(255,220,150,${(_lanternAlpha * 0.28).toFixed(3)})`);
        _grd.addColorStop(0.3, `rgba(255,190,100,${(_lanternAlpha * 0.14).toFixed(3)})`);
        _grd.addColorStop(0.7, `rgba(200,150,60,${(_lanternAlpha * 0.05).toFixed(3)})`);
        _grd.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = _grd;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      // (Entity night outlines used to be drawn here: a per-type footprint
      // box, stroked over the darkness overlay so assets stayed locatable
      // at midnight. It was removed — the boxes read as stray squares
      // appearing around buildings after dark, and the list of types opted
      // out of it had been growing one entity at a time. The full-viewport
      // tile scan that drove it went with it.)

      // 10. Sun/moon ambient glow — top edge of viewport
      {
        const h     = DayNight.hour();
        const isSun = h >= 5 && h < 19;
        const glowT = isSun
          ? Math.sin((h - 5) / 14 * Math.PI)
          : Math.sin(((h < 5 ? h + 24 : h) - 19) / 10 * Math.PI);
        const alpha = glowT * (isSun ? 0.22 : 0.09) * (1 - dark * 0.3);
        const hxCol = isSun ? '#ffe8a0' : '#a0c0ff';
        if (alpha > 0.005) {
          const grd = ctx.createLinearGradient(0, 0, 0, H * 0.45);
          grd.addColorStop(0, _hexToRgba(hxCol, alpha));
          grd.addColorStop(1, _hexToRgba(hxCol, 0));
          ctx.fillStyle = grd;
          ctx.fillRect(0, 0, W, H * 0.45);
        }
      }

      // Perf instrumentation (diagnostic only — no behaviour change)
      PerfMonitor.record('Vegetation rendering', _vegMs);
      PerfMonitor.record('Entity rendering', _entMs - _vegMs);

      // ── Drone fleet pass ──────────────────────────────────────────────
      // Drones are not entities and hold no tile, so they are not dispatched
      // by the tile loop above. Drawn here, over the buildings they fly
      // across and under the UI overlays.
      // Gone where the apocalypse's front has passed, like the people.
      if (typeof renderDroneFleets === 'function') {
        ctx.save();
        if (typeof ApocalypseSystem === 'undefined' || ApocalypseSystem.clipLiving(ctx)) renderDroneFleets(t);
        ctx.restore();
      }
      if (typeof renderMeridianLines === 'function') renderMeridianLines(t);     // Hyperion's national lines, off past the station's edge
      if (typeof renderAirportFlights === 'function') renderAirportFlights(t);   // airliner climb-out over the city
      if (typeof renderSpaceLaunches === 'function') renderSpaceLaunches(t);     // a rocket climbing out from the launch complex

      // ── Truck world-space render pass ─────────────────────────────────
      // Trucks move in pixel/world coordinates and rotate freely, so they
      // are NOT drawn in the tile loop above. Instead we render all trucks
      // here, on top of tiles but before UI overlays.
      for (const _trk of EntityRegistry.getByType(T.TRUCK)) {
        // Viewport cull — renderTruck is dozens of gradient/roundRect draw
        // calls per truck with no cheaper LOD tier, and this loop used to
        // call it for every truck in the city regardless of whether it was
        // anywhere near the visible screen. Haul trucks (mining, gas
        // station, blueprint convoys) can add up fast in a built-up city,
        // so a busy save could be paying full render cost for trucks
        // nowhere near the camera. Margin covers the truck's own footprint
        // (TILE wide × TILE*3 tall, rotates freely) at any zoom.
        const _twx = _trk._wx !== undefined ? _trk._wx : _trk.col * TILE;
        const _twy = _trk._wy !== undefined ? _trk._wy : _trk.row * TILE;
        const _tsx = (_twx - Camera.x) * Camera.zoom;
        const _tsy = (_twy - Camera.y) * Camera.zoom;
        const _tMargin = TILE * 3 * Camera.zoom + 40;
        const _truckOnScreen = _tsx > -_tMargin && _tsx < W + _tMargin && _tsy > -_tMargin && _tsy < H + _tMargin;
        if (_truckOnScreen) TruckSystem.renderTruck(ctx, Camera, _trk, t);
        // Draw patrol path if truck has one — but only while a truck panel
        // is actually open (the global roster, or this specific truck's
        // own edit panel). Otherwise the dashed line + numbered waypoints
        // are permanent map clutter for every hauling truck at all times.
        const _pathVisible =
          (typeof TruckStatusPanel !== 'undefined' && TruckStatusPanel.isOpen()) ||
          (TruckPatrolPanel.isOpen() && TruckPatrolPanel.target() === _trk);
        if (_pathVisible && TruckSystem.hasPath(_trk) && _trk._path.length >= 2) {
          const z = Camera.zoom;
          const patrolling = TruckSystem.isPatrolling(_trk);
          ctx.save();
          ctx.setLineDash([6, 4]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = patrolling
            ? `rgba(140,220,60,${0.6 + 0.3 * Math.sin(t * 3)})`
            : 'rgba(240,192,48,0.55)';
          ctx.beginPath();
          for (let _pi = 0; _pi < _trk._path.length; _pi++) {
            const _wp = _trk._path[_pi];
            const _sx = (_wp.wx - Camera.x) * z;
            const _sy = (_wp.wy - Camera.y) * z;
            if (_pi === 0) ctx.moveTo(_sx, _sy); else ctx.lineTo(_sx, _sy);
          }
          // Close loop back to start
          const _wp0 = _trk._path[0];
          ctx.lineTo((_wp0.wx - Camera.x) * z, (_wp0.wy - Camera.y) * z);
          ctx.stroke();
          ctx.setLineDash([]);
          // Draw waypoint dots, numbered in placement order so it's clear
          // which dot corresponds to which entry in the patrol panel's
          // waypoint-edit list.
          for (let _pi = 0; _pi < _trk._path.length; _pi++) {
            const _wp = _trk._path[_pi];
            const _sx = (_wp.wx - Camera.x) * z;
            const _sy = (_wp.wy - Camera.y) * z;
            const isNext = patrolling && _pi === _trk._patrolIdx;
            ctx.beginPath(); ctx.arc(_sx, _sy, isNext ? 5 : 3, 0, Math.PI * 2);
            ctx.fillStyle = isNext ? '#80e040' : (patrolling ? 'rgba(140,220,60,0.8)' : '#f0c030');
            ctx.fill();
            ctx.font = 'bold 10px Courier New';
            ctx.textAlign = 'center';
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = 'rgba(10,16,4,0.9)';
            ctx.strokeText(String(_pi + 1), _sx, _sy - (isNext ? 9 : 7));
            ctx.fillStyle = '#e0f0a0';
            ctx.fillText(String(_pi + 1), _sx, _sy - (isNext ? 9 : 7));
          }
          ctx.restore();
        }
      }

      // Bridge overhead steel (sway bracing, portal beams) goes over the
      // trucks just drawn, so they read as driving underneath it. Trucks
      // draw in screen space; this goes back into the camera transform.
      if (EntityRegistry.getByType(T.ROAD).size) {
        ctx.save();
        Camera.applyTransform(ctx);
        for (const _br of EntityRegistry.getByType(T.ROAD)) {
          if (!_br._bridge || _br._irreparable) continue;
          if (_br.col + _br.width < cStart || _br.col > cEnd || _br.row + _br.height < rStart || _br.row > rEnd) continue;
          const { x: _bx, y: _by } = GridManager.tileToWorld(_br.col, _br.row);
          renderBridge(_br, _bx, _by, t, 'over');
        }
        ctx.restore();
      }

      // ── Saved (unassigned) path pass ───────────────────────────────────
      // Paths drawn with no truck present live in SavedPathSystem rather
      // than on a truck entity, so without this they'd render only while
      // actively being drawn and then vanish the instant they're confirmed.
      // Dimmer/cooler-toned than a truck's own path so the two read as
      // distinct at a glance once a saved path gets assigned.
      if (typeof SavedPathSystem !== 'undefined') {
        const z = Camera.zoom;
        for (const _sp of SavedPathSystem.all()) {
          if (_sp.waypoints.length < 2) continue;
          ctx.save();
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = 'rgba(80,170,220,0.5)';
          ctx.beginPath();
          for (let _pi = 0; _pi < _sp.waypoints.length; _pi++) {
            const _wp = _sp.waypoints[_pi];
            const _sx = (_wp.wx - Camera.x) * z;
            const _sy = (_wp.wy - Camera.y) * z;
            if (_pi === 0) ctx.moveTo(_sx, _sy); else ctx.lineTo(_sx, _sy);
          }
          const _wp0 = _sp.waypoints[0];
          ctx.lineTo((_wp0.wx - Camera.x) * z, (_wp0.wy - Camera.y) * z);
          ctx.stroke();
          ctx.setLineDash([]);
          for (let _pi = 0; _pi < _sp.waypoints.length; _pi++) {
            const _wp = _sp.waypoints[_pi];
            const _sx = (_wp.wx - Camera.x) * z, _sy = (_wp.wy - Camera.y) * z;
            ctx.beginPath();
            ctx.arc(_sx, _sy, 3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(80,170,220,0.7)';
            ctx.fill();
            ctx.font = 'bold 10px Courier New';
            ctx.textAlign = 'center';
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = 'rgba(4,10,16,0.9)';
            ctx.strokeText(String(_pi + 1), _sx, _sy - 7);
            ctx.fillStyle = '#c0e8ff';
            ctx.fillText(String(_pi + 1), _sx, _sy - 7);
          }
          // Name label at the start point
          const _lx = (_wp0.wx - Camera.x) * z, _ly = (_wp0.wy - Camera.y) * z;
          ctx.font = '11px sans-serif';
          ctx.fillStyle = 'rgba(140,200,240,0.85)';
          ctx.fillText(_sp.name, _lx + 8, _ly - 8);
          ctx.restore();
        }
      }

      // Operation Hyperion's draw while The Line or the final day is live: charge running
      // in along the lines, the pillar on the spire. Light, so over the
      // night overlay; under the banners.
      if (typeof NationalProject !== 'undefined' && NationalProject.renderLive) {
        Camera.resetTransform(ctx);
        NationalProject.renderLive(ctx, W, H);
      }
      if (typeof ContractSystem !== 'undefined') {
        Camera.resetTransform(ctx);
        ContractSystem.renderBanner(ctx, W, H);
      }

      // Last thing on the frame: the white-out, the toxic colour grade, the
      // ash and the letterbox go over every other overlay including the HUD
      // ones above.
      if (typeof ApocalypseSystem !== 'undefined') {
        Camera.resetTransform(ctx);
        ApocalypseSystem.renderScreen(ctx, W, H, t);
      }
      // Operation Hyperion's fireworks, for the hours after the grid is
      // completed. Up here, over the night overlay: they are light.
      if (typeof NationalProject !== 'undefined' && NationalProject.renderFireworks) {
        Camera.resetTransform(ctx);
        NationalProject.renderFireworks(ctx, W, H);
      }

      TruckPatrolPanel.tick();
      SavedPathPanel.tick();
      RefineryPanel?.tick?.();
      FuelGenPanel?.tick?.();
      CoalGenPanel?.tick?.();
    };

// Lightning Rod protection zone, for a placed rod the player has selected or
// for the placement ghost (placed = null). Coverage is measured
// footprint-EDGE to footprint-EDGE (LightningDamageSystem.edgeDist), so the
// true covered region is the footprint inflated by the range on every side
// with rounded corners — not a circle centred on the rod, which would lie
// about which buildings are protected. Every building inside gets outlined,
// so "covered" is something the player can see rather than infer.
function _drawRodZone(fp, range, t, placed) {
  const R  = range * TILE;
  const x0 = fp.col * TILE, y0 = fp.row * TILE;
  const x1 = x0 + (fp.width  || 1) * TILE;
  const y1 = y0 + (fp.height || 1) * TILE;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.5);

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0 - R);
  ctx.lineTo(x1, y0 - R);
  ctx.arc(x1, y0, R, -Math.PI / 2, 0);
  ctx.lineTo(x1 + R, y1);
  ctx.arc(x1, y1, R, 0, Math.PI / 2);
  ctx.lineTo(x0, y1 + R);
  ctx.arc(x0, y1, R, Math.PI / 2, Math.PI);
  ctx.lineTo(x0 - R, y0);
  ctx.arc(x0, y0, R, Math.PI, Math.PI * 1.5);
  ctx.closePath();
  ctx.fillStyle = `rgba(120,200,255,${0.06 + pulse * 0.04})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(160,215,255,${0.55 + pulse * 0.35})`;
  ctx.lineWidth   = 2 / Camera.zoom;
  ctx.setLineDash([8 / Camera.zoom, 6 / Camera.zoom]);
  ctx.stroke();
  ctx.setLineDash([]);

  let covered = 0;
  const seen = new Set();
  for (const e of EntityRegistry.all()) {
    if (seen.has(e) || e === placed || !LightningDamageSystem.isStrikeable(e)) continue;
    seen.add(e);
    if (LightningDamageSystem.edgeDist(fp, e) > range) continue;
    covered++;
    ctx.globalAlpha = 0.5 + pulse * 0.3;
    ctx.strokeStyle = '#a0d8ff';
    ctx.lineWidth   = 1.5 / Camera.zoom;
    ctx.strokeRect(e.col * TILE + 1, e.row * TILE + 1,
                   (e.width || 1) * TILE - 2, (e.height || 1) * TILE - 2);
  }

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#a0d8ff';
  ctx.font      = `${Math.round(10 / Camera.zoom)}px Courier New`;
  ctx.textAlign = 'center';
  ctx.fillText(`${range} tile protection · ${covered} ${placed ? 'covered' : 'would be covered'}`,
               (x0 + x1) / 2, y1 + 12 / Camera.zoom);
  ctx.textAlign = 'left';
  ctx.restore();
}

// ── Amenity request markers ──────────────────────────────────────────
// A property asking for a street lamp or security camera gets:
//   • a pulsing outline around its own footprint, so it's obvious which
//     building is asking;
//   • a dashed "place it in here" area — every tile within the request's
//     fulfil radius of the footprint — so the player knows where the lamp
//     or camera has to go;
//   • a speech-bubble badge above the roof with the icon and what's wanted,
//     kept a readable size on screen at any zoom, turning orange with a "!"
//     once the wait starts costing satisfaction.
// Called inside the world transform, after the night overlay.
function _drawAmenityRequestMarkers(ctx, t) {
  if (typeof AmenityRequestSystem === 'undefined') return;
  const reqs = AmenityRequestSystem.getActive();
  if (!reqs.length) return;
  const Rt = AmenityRequestSystem.FULFIL_RADIUS || 3;
  const z = Camera.zoom;
  const inv = 1 / Math.max(0.2, z);            // world px per screen px
  const pulse = 0.5 + 0.5 * Math.sin(t * 4);
  const TAU = Math.PI * 2;

  for (const req of reqs) {
    if (req.fulfilled || req.expired) continue;
    const e = req.entity;
    const x0 = e.col * TILE, y0 = e.row * TILE;
    const ew = (e.width || 1) * TILE, eh = (e.height || 1) * TILE;
    const cx = x0 + ew / 2;
    const urgent = !!req.penaltyActive;
    const isCamera = req.amenityType === T.CAMERA;
    const rgb = urgent ? '255,128,64' : '240,208,64';
    const col = `rgb(${rgb})`;

    ctx.save();

    // ── Where it can go: tiles within the fulfil radius ──────────────
    const pad = Rt * TILE + TILE * 0.5;
    ctx.beginPath();
    ctx.roundRect(x0 - pad, y0 - pad, ew + pad * 2, eh + pad * 2, pad);
    ctx.fillStyle = `rgba(${rgb},${0.06 + 0.04 * pulse})`;
    ctx.fill();
    ctx.setLineDash([8 * inv, 6 * inv]);
    ctx.lineDashOffset = -t * 20 * inv;
    ctx.lineWidth = 2 * inv;
    ctx.strokeStyle = `rgba(${rgb},0.75)`;
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Which building is asking ─────────────────────────────────────
    const grow = (2 + 3 * pulse) * inv;
    ctx.lineWidth = 3 * inv;
    ctx.strokeStyle = `rgba(${rgb},${0.55 + 0.45 * pulse})`;
    ctx.beginPath(); ctx.roundRect(x0 - grow, y0 - grow, ew + grow * 2, eh + grow * 2, 6 * inv); ctx.stroke();

    // ── Speech-bubble badge above the roof ───────────────────────────
    const bob = Math.sin(t * 3) * 3 * inv;
    const bw = 132 * inv, bh = 34 * inv, tail = 10 * inv;
    const by = y0 - 14 * inv - tail - bh + bob;   // top of the bubble
    const bx = cx - bw / 2;
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 8 * inv; ctx.shadowOffsetY = 2 * inv;
    ctx.fillStyle = 'rgba(14,14,18,0.94)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8 * inv);
    ctx.moveTo(cx - tail, by + bh - 0.5 * inv);
    ctx.lineTo(cx, by + bh + tail);
    ctx.lineTo(cx + tail, by + bh - 0.5 * inv);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2 * inv; ctx.strokeStyle = col;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8 * inv); ctx.stroke();

    // Icon disc
    const ix = bx + 18 * inv, iy = by + bh / 2, ir = 12 * inv;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#141418'; ctx.fillStyle = '#141418';
    ctx.lineWidth = 2 * inv; ctx.lineCap = 'round';
    if (isCamera) {
      ctx.fillRect(ix - 6 * inv, iy - 4 * inv, 10 * inv, 7 * inv);          // body
      ctx.beginPath(); ctx.moveTo(ix + 4 * inv, iy - 1 * inv);              // lens hood
      ctx.lineTo(ix + 8 * inv, iy - 4 * inv); ctx.lineTo(ix + 8 * inv, iy + 3 * inv); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(ix - 3 * inv, iy + 3 * inv); ctx.lineTo(ix - 3 * inv, iy + 8 * inv); ctx.stroke();   // mount
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ix - 3 * inv, iy - 0.5 * inv, 1.6 * inv, 0, TAU); ctx.fill();   // tally light
    } else {
      ctx.beginPath(); ctx.moveTo(ix - 3 * inv, iy + 8 * inv); ctx.lineTo(ix - 3 * inv, iy - 5 * inv);   // pole
      ctx.lineTo(ix + 4 * inv, iy - 7 * inv); ctx.stroke();                                             // arm
      ctx.beginPath(); ctx.arc(ix + 4 * inv, iy - 4 * inv, 2.6 * inv, 0, TAU); ctx.fill();               // lamp head
      ctx.lineWidth = 1.2 * inv;
      for (const a of [0.9, 1.57, 2.25]) {                                                               // light rays
        ctx.beginPath();
        ctx.moveTo(ix + 4 * inv + Math.cos(a) * 4.5 * inv, iy - 4 * inv + Math.sin(a) * 4.5 * inv);
        ctx.lineTo(ix + 4 * inv + Math.cos(a) * 7.5 * inv, iy - 4 * inv + Math.sin(a) * 7.5 * inv);
        ctx.stroke();
      }
    }

    // Label
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = col;
    ctx.font = `bold ${11 * inv}px Courier New`;
    ctx.fillText(urgent ? 'STILL WAITING!' : 'WANTS A', bx + 36 * inv, by + 11 * inv);
    ctx.fillStyle = '#f4f0e0';
    ctx.font = `bold ${12 * inv}px Courier New`;
    ctx.fillText(isCamera ? 'SECURITY CAM' : 'STREET LAMP', bx + 36 * inv, by + 24 * inv);

    // Urgent "!" tab on the bubble's corner
    if (urgent) {
      const ex = bx + bw - 2 * inv, ey = by + 2 * inv, er = (8 + 1.5 * pulse) * inv;
      ctx.fillStyle = '#ff5030';
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = `bold ${12 * inv}px Courier New`;
      ctx.fillText('!', ex, ey + 0.5 * inv);
    }

    ctx.restore();
  }
}

// ── Zone request markers ─────────────────────────────────────────────
// A zone asking for a Cell Tower, Fiber Hub or EV Charging Station gets the
// same treatment a connection request's plots do:
//   • the asking zone, outlined faintly, so it's clear whose request it is;
//   • the spot the request marks (ZoneRequestSystem picks a free footprint
//     in or beside the zone): the footprint, pulsing, with a dashed edge;
//   • a speech-bubble badge above the spot naming what goes there, a
//     readable size at any zoom, orange with a "!" once ignoring it costs
//     satisfaction.
// A request whose spot was just built over has none until the next scan
// finds another; the badge then sits over the zone instead.
// Called inside the world transform, after the night overlay.
function _drawZoneRequestMarkers(ctx, t) {
  if (typeof ZoneRequestSystem === 'undefined' || !ZoneRequestSystem.markers) return;
  if (typeof ContractSystem !== 'undefined' && ContractSystem.isAway()) return;   // home's zones, not the site's
  const marks = ZoneRequestSystem.markers();
  if (!marks.length) return;
  const inv = 1 / Math.max(0.2, Camera.zoom);   // world px per screen px
  const pulse = 0.5 + 0.5 * Math.sin(t * 4);
  const hex = (h) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');

  for (const m of marks) {
    const rgb = m.urgent ? '255,128,64' : hex(m.color);
    const col = `rgb(${rgb})`;
    const z = m.rect;
    ctx.save();

    // ── The asking zone ──────────────────────────────────────────────
    ctx.setLineDash([10 * inv, 8 * inv]);
    ctx.lineWidth = 1.5 * inv;
    ctx.strokeStyle = `rgba(${rgb},0.45)`;
    ctx.strokeRect(z.minC * TILE, z.minR * TILE, (z.maxC - z.minC + 1) * TILE, (z.maxR - z.minR + 1) * TILE);
    ctx.setLineDash([]);

    // ── The spot ─────────────────────────────────────────────────────
    let ax, ay;   // where the badge's tail points
    if (m.spot) {
      const x0 = m.spot.col * TILE, y0 = m.spot.row * TILE, w = m.w * TILE, h = m.h * TILE;
      ctx.fillStyle = `rgba(${rgb},${0.16 + 0.12 * pulse})`;
      ctx.fillRect(x0, y0, w, h);
      ctx.setLineDash([8 * inv, 6 * inv]);
      ctx.lineDashOffset = -t * 20 * inv;
      ctx.lineWidth = 2.5 * inv;
      ctx.strokeStyle = `rgba(${rgb},${0.7 + 0.3 * pulse})`;
      ctx.strokeRect(x0, y0, w, h);
      ctx.setLineDash([]);
      // An outgoing ring, so the spot catches the eye zoomed out.
      const p = (t * 0.7) % 1;
      ctx.lineWidth = 2 * inv;
      ctx.strokeStyle = `rgba(${rgb},${(0.6 * (1 - p)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(x0 + w / 2, y0 + h / 2, Math.max(w, h) / 2 + (6 + p * 26) * inv, 0, Math.PI * 2); ctx.stroke();
      ax = x0 + w / 2; ay = y0;
    } else {
      ax = (z.minC + z.maxC + 1) / 2 * TILE; ay = z.minR * TILE;
    }

    // ── Badge ────────────────────────────────────────────────────────
    const label = (EntityDefs[m.itemType]?.label || 'Item').toUpperCase();
    ctx.font = `bold ${12 * inv}px Courier New`;
    const bw = Math.max(132 * inv, ctx.measureText(label).width + 50 * inv), bh = 34 * inv, tail = 10 * inv;
    const bob = Math.sin(t * 3) * 3 * inv;
    const by = ay - 12 * inv - tail - bh + bob, bx = ax - bw / 2;
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 8 * inv; ctx.shadowOffsetY = 2 * inv;
    ctx.fillStyle = 'rgba(14,14,18,0.94)';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 8 * inv);
    ctx.moveTo(ax - tail, by + bh - 0.5 * inv);
    ctx.lineTo(ax, by + bh + tail);
    ctx.lineTo(ax + tail, by + bh - 0.5 * inv);
    ctx.closePath();
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 2 * inv; ctx.strokeStyle = col;
    ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, 8 * inv); ctx.stroke();
    // Icon
    const ix = bx + 18 * inv, iy = by + bh / 2;
    ctx.fillStyle = '#222630'; ctx.strokeStyle = col; ctx.lineWidth = 1.5 * inv;
    ctx.beginPath(); ctx.arc(ix, iy, 12 * inv, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = `${14 * inv}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.icon, ix, iy + 1 * inv);
    // Label
    ctx.textAlign = 'left';
    ctx.fillStyle = col;
    ctx.font = `bold ${11 * inv}px Courier New`;
    ctx.fillText(m.urgent ? 'STILL WAITING!' : m.spot ? 'BUILD HERE' : 'ZONE WANTS A', bx + 36 * inv, by + 11 * inv);
    ctx.fillStyle = '#f4f0e0';
    ctx.font = `bold ${12 * inv}px Courier New`;
    ctx.fillText(label, bx + 36 * inv, by + 24 * inv);
    if (m.urgent) {
      const ex = bx + bw - 2 * inv, ey = by + 2 * inv, er = (8 + 1.5 * pulse) * inv;
      ctx.fillStyle = '#ff5030';
      ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.font = `bold ${12 * inv}px Courier New`;
      ctx.fillText('!', ex, ey + 0.5 * inv);
    }
    ctx.restore();
  }
}
