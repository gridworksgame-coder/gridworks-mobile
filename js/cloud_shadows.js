/* ═══════════════════════════════════════════════════════════════════
   CLOUD SHADOWS
   The shadow of the sky, laid over the finished map.

   There are no cloud objects. The sky is a continuous noise field that is
   cut at a level set by the weather, so what the WEATHER tab says is what
   you see on the ground:
     • the share of ground in shade (`shade`) follows the weather's status,
       not CloudState.cover alone. Cover wanders between 20% and 85% on an
       ordinary day, which is as much as rain brings, so read literally the
       map was as dark before a shower as during it. Fair weather is
       therefore scaled down to scattered cloud (6-56% shade), and anything
       actually happening sets its own sky: rain and snow close it over, a
       rainstorm or blizzard leaves the odd hole of sunlight, a heat wave
       burns it clear, and when the event ends the cloud breaks up with it.
       `shade` eases toward that over several seconds, building faster than
       it clears. (The cut level comes from the field's own measured
       quantiles, so 35% really is 35% of the map.);
     • the field is carried along WindState.dir at the wind's trend speed,
       so shadows cross the map the way the smog and the turbines say the
       wind is blowing, crawl on a still day and race in a storm;
     • its finer detail drifts at its own pace, so a cloud changes shape as
       it travels instead of sliding past like a stamp;
     • a second, higher deck of thin streaked cloud moves on its own
       heading, slower and much fainter;
     • the shade follows the sun: full at midday, softer-edged and more
       violet toward dusk, gone at night.

   The field is sampled on a coarse lattice fixed to the world (so panning
   never resamples it), written into a small bitmap a dozen or so times a
   second, and stretched over the view with 'multiply'. Between bakes the
   bitmap is slid by the drift, so the motion is smooth at any frame rate.
   ═══════════════════════════════════════════════════════════════════ */

// ─── Cloud Shadow System ──────────────────────────────────────────
const CloudShadows = (() => {
  // World px per noise cell. Low deck: the body of a cloud, its lobes, and
  // the ragged edge; WARP bends all three so the outlines curl.
  const S_BODY = 1500, S_LOBE = 620, S_EDGE = 250;
  const WARP = 980, WARP_AMT = 300;
  // High deck: long along its heading, narrow across it.
  const H_LONG = 2300, H_WIDE = 430;

  const DRIFT_MIN = 4, DRIFT_WIND = 52;   // world px/s: still air, plus this at full wind
  const HIGH_SPEED = 13;                  // world px/s the high deck moves
  const LOW_SHADE  = 0.5;                 // multiply strength under a cloud at midday
  const HIGH_SHADE = 0.13;                // and under the high streaks
  const MARGIN     = 5;                   // lattice cells baked past each edge of the view
  const TICK_MS    = 100;                 // GameLoop's logic step

  // Share of ground in shade under each kind of weather. Events are
  // WeatherEventSystem's; SITE is a contract site's own sky.
  const FAIR_MIN = 0.06, FAIR_MAX = 0.56;   // an ordinary day, from cover's low to its high
  const EVENT_SKY = { rainfall: 0.86, snowfall: 0.84, rainstorm: 0.97, blizzard: 0.97, storm: 0.9, coldsnap: 0.64, heatwave: 0.02, calm: 0.08, dust: 0.3, fog: 0.85, geomag: 0.1, icing: 0.8, smoke: 0.35 };
  const SITE_SKY  = { rain: 0.86, snow: 0.84, blizzard: 0.97, overcast: 0.74 };
  const GATHER = 0.2, BREAK = 0.09;       // per second: how fast cloud builds, and clears

  // Value noise on a wrapping NS×NS lattice of random heights.
  const NS = 256;
  const lattice = new Float32Array(NS * NS);
  function _n(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const x0 = xi & 255, x1 = (xi + 1) & 255, r0 = (yi & 255) << 8, r1 = ((yi + 1) & 255) << 8;
    const a = lattice[r0 | x0], c = lattice[r1 | x0];
    const top = a + (lattice[r0 | x1] - a) * fx;
    return top + (c + (lattice[r1 | x1] - c) * fx - top) * fy;
  }

  // Where the sky has got to. dx/dy: how far the low deck has been blown;
  // hx/hy: the high deck; t: seconds of sky time, which the detail drifts on.
  let cur  = { dx: 0, dy: 0, hx: 0, hy: 0, t: 0 };
  let prev = { ...cur };
  let tickAt = 0;
  let seed = 0, hiCos = 1, hiSin = 0;

  // The offsets one bake reads the field at (set from a sky state).
  let oAx = 0, oAy = 0, oBx = 0, oBy = 0, oCx = 0, oCy = 0, oWx = 0, oWy = 0, oHx = 0, oHy = 0;
  function _aim(s) {
    oAx = s.dx; oAy = s.dy;
    oBx = s.dx + s.t * 2.6; oBy = s.dy - s.t * 1.7;      // lobes and edge wander off the body,
    oCx = s.dx - s.t * 2.4; oCy = s.dy + s.t * 1.9;      // so the outline keeps changing
    oWx = s.dx * 0.9; oWy = s.dy * 0.9;                  // and the curl lags the wind a little
    oHx = s.hx; oHy = s.hy;
  }
  function _low(x, y) {
    const wx = (x - oWx) / WARP, wy = (y - oWy) / WARP;
    const u = (_n(wx, wy) - 0.5) * WARP_AMT, v = (_n(wx + 37.7, wy + 11.3) - 0.5) * WARP_AMT;
    return _n((x - oAx + u) / S_BODY, (y - oAy + v) / S_BODY) * 0.56
         + _n((x - oBx + u) / S_LOBE + 71.3, (y - oBy + v) / S_LOBE + 19.1) * 0.30
         + _n((x - oCx + v) / S_EDGE + 5.1, (y - oCy + u) / S_EDGE + 43.7) * 0.14;
  }
  function _high(x, y) {
    const px = x - oHx, py = y - oHy;
    const a = px * hiCos + py * hiSin, b = py * hiCos - px * hiSin;   // along and across its heading
    return _n(a / H_LONG, b / H_WIDE) * 0.65 + _n(a / (H_LONG * 0.4) + 13.3, b / (H_WIDE * 0.45) + 7.9) * 0.35;
  }

  // The low deck's heights, sorted: quant[k] is the level a share k/QN of
  // the field lies under, which is what turns a cover into a cut level.
  const QN = 4096;
  const quant = new Float32Array(QN);
  function _cutFor(cover) {
    return quant[Math.max(0, Math.min(QN - 1, Math.round((1 - cover) * (QN - 1))))];
  }

  // The sky the weather is asking for right now.
  function _wanted() {
    const cover = CloudState.cover;
    // Fair weather: cover's everyday range (0.2-0.85) as scattered cloud.
    // Above that range it is a forced overcast (the dev panel's, a site's).
    let w = FAIR_MIN + (FAIR_MAX - FAIR_MIN) * Math.max(0, Math.min(1, (cover - 0.2) / 0.65))
          + 0.4 * Math.max(0, Math.min(1, (cover - 0.85) / 0.1));
    if (typeof WeatherEventSystem !== 'undefined') {
      const ev = WeatherEventSystem.getActiveEvent(), site = WeatherEventSystem.getVisualOverride();
      const s = ev ? EVENT_SKY[ev.type] : SITE_SKY[site];
      if (s !== undefined) w = s < w && ev && ev.type === 'heatwave' ? s : Math.max(w, s);
    }
    // Rain with no event behind it (the dev panel's) still needs a sky to fall from.
    if (typeof RainSystem !== 'undefined' && RainSystem.isActive()) w = Math.max(w, 0.84);
    return Math.min(0.99, w);
  }
  let shade = null;   // share of ground in shade, eased toward _wanted(); null until first read

  let baked = null;   // what the bitmap holds: lattice rect, the sky state and light it was baked for
  function _reseed(s) {
    seed = s >>> 0;
    let a = seed;
    const rnd = () => { a = (a + 0x6D2B79F5) | 0; let q = Math.imul(a ^ (a >>> 15), 1 | a); q = (q + Math.imul(q ^ (q >>> 7), 61 | q)) ^ q; return ((q ^ (q >>> 14)) >>> 0) / 4294967296; };
    for (let i = 0; i < lattice.length; i++) lattice[i] = rnd();
    const hiDir = rnd() * Math.PI * 2;
    hiCos = Math.cos(hiDir); hiSin = Math.sin(hiDir);
    _aim(cur);
    for (let i = 0; i < QN; i++) quant[i] = _low(rnd() * 90000, rnd() * 90000);
    quant.sort();
    baked = null;
  }
  _reseed((Math.random() * 0x7fffffff) | 0);

  function tick(dt) {
    prev = cur;
    const v = DRIFT_MIN + DRIFT_WIND * WindState.trendSpeed, dir = WindState.dir;
    // The high deck sits above the surface wind: it keeps its own heading
    // and only picks up a little of the weather's pace.
    const hv = HIGH_SPEED * (0.7 + 0.6 * WindState.trendSpeed);
    cur = {
      dx: cur.dx + Math.cos(dir) * v * dt, dy: cur.dy + Math.sin(dir) * v * dt,
      hx: cur.hx + hiCos * hv * dt,        hy: cur.hy + hiSin * hv * dt,
      t:  cur.t + dt,
    };
    const want = _wanted();
    if (shade === null) shade = want;
    else shade += (want - shade) * Math.min(1, dt * (want > shade ? GATHER : BREAK));
    tickAt = performance.now();
  }

  let tex = null, tctx = null, img = null, px32 = null;
  const _smooth = v => v <= 0 ? 0 : v >= 1 ? 1 : v * v * (3 - 2 * v);

  function _bake(gx0, gy0, cols, rows, cell, sky, cover, sun, withHigh) {
    if (!tex) { tex = document.createElement('canvas'); tctx = tex.getContext('2d'); }
    if (tex.width !== cols || tex.height !== rows || !img) {
      tex.width = cols; tex.height = rows;
      img = tctx.createImageData(cols, rows);
      px32 = new Uint32Array(img.data.buffer);
    }
    _aim(sky);
    // A low sun throws a wider penumbra; an overcast sky lights the ground
    // from everywhere, so what shade there is is flatter.
    const edge = 0.05 + 0.05 * (1 - sun);
    const cut = _cutFor(cover), lo = cut - edge / 2;
    const fade = Math.pow(sun, 0.7);
    const lowK  = LOW_SHADE * fade * (1 - 0.2 * _smooth((cover - 0.6) / 0.35));
    const highK = withHigh ? HIGH_SHADE * fade : 0;
    const hCut = 0.63 - cover * 0.2;
    // Shade is sky-lit, so it is blue by day and turns violet as the sun goes.
    const dusk = 1 - sun;
    const rgb = (Math.round(150 - 10 * dusk) << 16) | (Math.round(104 - 20 * dusk) << 8) | Math.round(86 + 26 * dusk);
    let k = 0;
    for (let j = 0; j < rows; j++) {
      const y = (gy0 + j + 0.5) * cell;
      for (let i = 0; i < cols; i++) {
        const x = (gx0 + i + 0.5) * cell;
        const n = _low(x, y);
        let a = _smooth((n - lo) / edge);
        // thicker toward the middle of a cloud
        if (a > 0) a *= lowK * (0.76 + 0.24 * Math.max(0, Math.min(1, (n - cut) / 0.2)));
        if (highK > 0) a = 1 - (1 - a) * (1 - highK * _smooth((_high(x, y) - hCut) / 0.24));
        px32[k++] = ((a * 255 + 0.5) << 24) | rgb;
      }
    }
    tctx.putImageData(img, 0, 0);
  }

  // Assumes ctx has the camera transform applied, like the other weather layers.
  function render(ctx) {
    const sun = Math.max(0, 1 - DayNight.darkness());
    if (sun <= 0.03) return;
    if (shade === null) shade = _wanted();
    const cover = shade;
    const zoom = Camera.zoom;
    const lv = typeof GfxQuality !== 'undefined' ? GfxQuality.level() : 2;
    // CSS px, not backing-store px — see RENDER_SCALE in render_core.js.
    const left = Camera.x, top = Camera.y;
    const vw = window.innerWidth / zoom, vh = window.innerHeight / zoom;

    // The sky between the last two logic ticks, so it glides rather than
    // stepping ten times a second. Paused, no tick comes and it holds still.
    const f = Math.min(1, (performance.now() - tickAt) / TICK_MS);
    const sky = {
      dx: prev.dx + (cur.dx - prev.dx) * f, dy: prev.dy + (cur.dy - prev.dy) * f,
      hx: prev.hx + (cur.hx - prev.hx) * f, hy: prev.hy + (cur.hy - prev.hy) * f,
      t:  prev.t  + (cur.t  - prev.t)  * f,
    };

    // Lattice spacing: a power of two of world px, so a sample is 10-20
    // screen px (16-32 below high quality) whatever the zoom.
    let cell = 8;
    while (cell * zoom < (lv >= 2 ? 10 : 16)) cell *= 2;

    const now = performance.now();
    let stale = !baked || baked.cell !== cell || baked.lv !== lv;
    if (!stale) {
      // The bitmap rides the wind, so check where it has got to; its outer
      // ring of samples is kept off screen (smoothing clamps at the edge).
      const bx = baked.gx0 * cell + (sky.dx - baked.dx), by = baked.gy0 * cell + (sky.dy - baked.dy);
      stale = left < bx + cell || top < by + cell
           || left + vw > bx + (baked.cols - 1) * cell || top + vh > by + (baked.rows - 1) * cell
           // Re-baked for the clouds' change of shape and the light, both
           // of which move by well under a sample between bakes (the drift
           // itself is the slide above). Every 66ms this was ~200k noise
           // lookups fifteen times a second, ~3% of a frame-rate's worth of
           // main thread on its own, for no visible difference.
           || (now - baked.at > (lv >= 2 ? 200 : 300)
               && (sky.t !== baked.t || sky.dx !== baked.dx || sky.dy !== baked.dy || cover !== baked.cover || sun !== baked.sun));
    }
    if (stale) {
      const gx0 = Math.floor(left / cell) - MARGIN, gy0 = Math.floor(top / cell) - MARGIN;
      const cols = Math.ceil(vw / cell) + MARGIN * 2 + 1, rows = Math.ceil(vh / cell) + MARGIN * 2 + 1;
      _bake(gx0, gy0, cols, rows, cell, sky, cover, sun, lv >= 1);
      baked = { gx0, gy0, cols, rows, cell, lv, dx: sky.dx, dy: sky.dy, t: sky.t, cover, sun, at: now };
    }

    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tex, baked.gx0 * cell + (sky.dx - baked.dx), baked.gy0 * cell + (sky.dy - baked.dy), baked.cols * cell, baked.rows * cell);
    ctx.restore();
  }

  // The seed and how far the sky has travelled: a reload shows the same
  // clouds over the same streets.
  function serialise() {
    return { seed, dx: Math.round(cur.dx), dy: Math.round(cur.dy), hx: Math.round(cur.hx), hy: Math.round(cur.hy), t: Math.round(cur.t * 10) / 10,
             shade: shade === null ? null : Math.round(shade * 1000) / 1000 };
  }

  // An array is a save from when clouds were a list of blobs: nothing in it
  // means anything now, so that world just gets a fresh sky.
  function load(saved) {
    if (!saved || Array.isArray(saved) || !Number.isFinite(saved.seed)) return;
    const num = v => Number.isFinite(v) ? v : 0;
    cur = { dx: num(saved.dx), dy: num(saved.dy), hx: num(saved.hx), hy: num(saved.hy), t: num(saved.t) };
    prev = cur;
    shade = Number.isFinite(saved.shade) ? Math.max(0, Math.min(1, saved.shade)) : null;   // null: taken from the weather as loaded
    _reseed(saved.seed);
  }

  return { tick, render, serialise, load };
})();



// ─── Government System ────────────────────────────────────────────
