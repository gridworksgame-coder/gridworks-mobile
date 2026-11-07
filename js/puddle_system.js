/* ═══════════════════════════════════════════════════════════════════
   PUDDLE SYSTEM
   Standing water that collects on open ground and roads while it rains,
   and dries off once it stops.

   Purely visual. Each puddle is a seeded irregular blob anchored to a
   spot in the world: it fills toward its full size the longer it rains
   (faster in a downpour), carries raindrop ripples while the rain is
   falling, and shrinks away afterwards. Snow lays no puddles, and the
   ones already down dry off faster under it (frozen and covered).

   The look: the water darkens the ground it lies on (a multiply, so it
   takes on the grass, road or dirt under it), wrapped in a ring of damp
   ground, with a dark lip at the edge, the overcast sky lying on its
   surface and a brighter crescent of sky on the far side. As it dries
   the water shrinks inside its damp stain, and the stain fades last.
   Day and night only change the sky in it. Shapes are built once per
   puddle (buildShape) and only rescaled each frame.

   Where they lie is fixed to the map, not to the camera: the world is
   cut into cells of a few tiles and each cell hashes out its own puddle
   spots, so the same storm wets the whole map evenly and panning to a
   new district finds it just as soaked as the last. (They used to be
   seeded around the view as it rained, so they all piled up wherever
   the player happened to be looking, usually City Hall, and anywhere
   else started dry.) How full each spot is follows the ground's soak,
   which is shared by the whole map. Spring Floods (seasonal_events.js)
   wakes more spots and lets them grow bigger.

   Drawn on the ground, under every entity (render_main_loop.js), so
   buildings stand in the water rather than under it.
   ═══════════════════════════════════════════════════════════════════ */

const PuddleSystem = (() => {
  const CELL     = 6;       // tiles per side of a placement cell
  // Puddle spots per cell on average (a flood wakes as many again). Was 1.1,
  // which left a soaked map pocked with them; 0.37 lays 65% fewer (fewer
  // spots crowd each other out, so the cut is a little under the ratio).
  const PER_CELL = 0.37;
  const CACHE    = 6000;    // cells' worth of spots kept before the cache is dropped and rebuilt
  // How wet the ground is, 0..1, is what everything else follows. It climbs
  // toward the rain's own intensity, so a light shower never soaks it the
  // way a downpour does, and it takes a while to get there: puddles are
  // the ground giving up, not the first drops landing.
  const SOAK_UP  = 1 / 90;  // per sim second, toward the rain level (~2 in-game hours to soak)
  const SOAK_DRY = 1 / 200; // per sim second once it stops (~4 in-game hours)
  const START    = 0.12;    // soak below which nothing pools at all
  const FILL     = 1 / 60;  // puddles widening toward their target, per sim second (~1 in-game hour)
  const DRY      = 1 / 150; // and shrinking back, per sim second
  let soak = 0;
  // How full the puddles are, map-wide: `water` eases after the soak (so
  // they fill and dry gradually), `stain` trails it down at half the pace
  // so the damp ground outlasts the water.
  let water = 0, stain = 0, floodK = 0;
  const cells = new Map();  // "cx,cy" → that cell's spots
  let worldKey = null;      // which world they belong to (home, or a job site)
  let lastNow = 0;

  // Puddles belong to the ground they formed on: the home city's do not
  // follow the crew to a job site.
  function currentWorld() {
    if (typeof ContractSystem === 'undefined' || !ContractSystem.isAway || !ContractSystem.isAway()) return 'home';
    const j = ContractSystem.getActive && ContractSystem.getActive();
    return 'site:' + (j && j.contract ? j.contract.id : '?');
  }
  const flooding = () => typeof SeasonalEvents !== 'undefined' && SeasonalEvents.fx && (SeasonalEvents.fx() || {}).id === 'springfloods';

  // How hard it is raining, 0..1. RainSystem draws every rain at the same
  // density, so the weather event is what says shower or downpour. A job
  // site's sky is a visual override ('rain') with no event behind it.
  const STRENGTH = { rainstorm: 1, rainfall: 0.4, rain: 0.6 };
  function rainStrength() {
    if (typeof WeatherEventSystem === 'undefined') return 0.6;
    const ov = WeatherEventSystem.getVisualOverride && WeatherEventSystem.getVisualOverride();
    const kind = ov || (WeatherEventSystem.getActiveEvent() || {}).type;
    return STRENGTH[kind] ?? 0.6;
  }

  // Open ground or road only: never on a building, a lake or a tree.
  function groundAt(col, row) {
    if (!GridManager.inBounds(col, row)) return false;
    const e = GridManager.getEntity(col, row);
    return !e || e.type === T.ROAD;
  }

  // A small seeded generator per cell, so a cell's spots are the same every
  // time it comes back into view (and differ per world).
  function cellRng(cx, cy) {
    let h = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(worldSalt, 83492791)) >>> 0;
    return () => {
      h = (h + 0x6D2B79F5) >>> 0;
      let v = Math.imul(h ^ (h >>> 15), 1 | h);
      v ^= v + Math.imul(v ^ (v >>> 7), 61 | v);
      return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
    };
  }
  let worldSalt = 0;

  // The puddle spots in one cell. `low` is how low-lying a spot is: low
  // spots pool in any rain, high ones only once the ground is soaked
  // through; bigger hollows sit lower, so the small ones dry first. `flood`
  // spots only wake in a Spring Flood. Whether there is open ground under
  // a spot is checked as it is drawn, so building over one dries it up.
  function cellSpots(cx, cy) {
    const key = cx + ',' + cy;
    let spots = cells.get(key);
    if (spots) return spots;
    if (cells.size > CACHE) cells.clear();
    const rnd = cellRng(cx, cy), span = CELL * TILE;
    spots = [];
    for (const flood of [false, true]) {
      // Poisson-ish count: 0, 1 or 2 most of the time, averaging PER_CELL.
      let n = 0, acc = rnd();
      while (acc > Math.exp(-PER_CELL) && n < 4) { n++; acc *= rnd(); }
      for (let i = 0; i < n; i++) {
        const x = (cx + rnd()) * span, y = (cy + rnd()) * span;
        // Mostly small, now and then a big one.
        const size = Math.pow(rnd(), 2.6);
        const r = TILE * (0.18 + size * 1.4);
        // Room for it: no crowding another spot in the cell.
        if (spots.some(p => Math.abs(p.x - x) < (p.r + r) * 0.9 && Math.abs(p.y - y) < (p.r + r) * 0.9)) { rnd(); rnd(); rnd(); rnd(); continue; }
        const low = rnd() * (1 - 0.35 * size);
        spots.push({ x, y, r0: r, r, flood, low, seed: rnd() * 1000, rot: rnd() * Math.PI, ar: 0.55 + rnd() * 0.4, wet: 0, peak: 0, shape: null });
      }
    }
    cells.set(key, spots);
    return spots;
  }

  // Open ground under the spot, and for a big one under most of it, or it
  // climbs walls.
  function spotOpen(p, r) {
    const col = Math.floor(p.x / TILE), row = Math.floor(p.y / TILE);
    if (!groundAt(col, row)) return false;
    if (r > TILE * 0.7) {
      const k = Math.ceil(r / TILE);
      for (const [dc, dr] of [[-k, 0], [k, 0], [0, -1], [0, 1]]) if (!groundAt(col + dc, row + dr)) return false;
    }
    return true;
  }

  // How full a spot of lowness `low` is at map-wide fill level `w`.
  const fillAt = (w, low) => Math.max(0, Math.min(1, (w - low * 0.6) / 0.5));

  // Wobble of the rim: a sum of a few sines, fixed per puddle.
  function rimR(p, a) {
    const s = p.seed;
    return 1 + 0.18 * Math.sin(a * 2 + s) + 0.12 * Math.sin(a * 3 + s * 1.7) + 0.08 * Math.sin(a * 5 + s * 2.3);
  }

  // Smooth closed (or open) curve through a list of [x, y] points: a
  // quadratic through each point to the midpoint of the next, the same
  // trick the old per-frame blob used.
  function smoothPath(path, pts, closed) {
    const n = pts.length;
    const mid = (i, j) => [(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2];
    if (closed) {
      const m0 = mid(0, 1);
      path.moveTo(m0[0], m0[1]);
      for (let i = 1; i <= n; i++) {
        const q = pts[i % n], m = mid(i % n, (i + 1) % n);
        path.quadraticCurveTo(q[0], q[1], m[0], m[1]);
      }
      path.closePath();
    } else {
      path.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n - 1; i++) {
        const m = mid(i, i + 1);
        path.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
      }
      path.lineTo(pts[n - 1][0], pts[n - 1][1]);
    }
  }

  // A puddle's outline never changes, only its size, so the shapes are built
  // once, at unit radius around (0, 0) with its tilt and squash baked in,
  // and drawn every frame by scaling the transform. That is two Path2Ds and
  // no trig per puddle per frame, where the old blob rebuilt 16 rim points
  // and three curves every frame.
  const RIM_N = 24;
  const LIGHT = -2.25;      // where the sky shows in the water: up and to the left, the same for every puddle
  function buildShape(p) {
    const cos = Math.cos(p.rot), sin = Math.sin(p.rot);
    const rim = [];
    for (let i = 0; i < RIM_N; i++) {
      const ang = i / RIM_N * Math.PI * 2;
      const rr = rimR(p, ang);
      const lx = Math.cos(ang) * rr, ly = Math.sin(ang) * rr * p.ar;
      rim.push([lx * cos - ly * sin, lx * sin + ly * cos]);
    }
    const body = new Path2D();
    smoothPath(body, rim, true);

    // The sky's reflection: a crescent along the up-left inner edge, between
    // the rim pulled in a little and the rim pulled in a lot (and nudged
    // toward the light), so it hugs the puddle's own wobble and can never
    // spill past its edge. The rim point facing the light anchors it.
    let best = 0, bestD = 9;
    for (let i = 0; i < RIM_N; i++) {
      let d = Math.abs(Math.atan2(rim[i][1], rim[i][0]) - LIGHT);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d < bestD) { bestD = d; best = i; }
    }
    const span = 3 + Math.floor((p.seed * 7.3) % 2);   // 3 or 4 rim points either side
    const outer = [], inner = [];
    const lx = Math.cos(LIGHT), ly = Math.sin(LIGHT);
    for (let k = -span; k <= span; k++) {
      const q = rim[(best + k + RIM_N) % RIM_N];
      // Thickest in the middle, tapering to nothing at the tips.
      const w = Math.cos(k / (span + 1) * Math.PI / 2);
      outer.push([q[0] * 0.84, q[1] * 0.84]);
      inner.unshift([q[0] * (0.84 - 0.18 * w) + lx * 0.03 * w, q[1] * (0.84 - 0.18 * w) + ly * 0.03 * w]);
    }
    const sheen = new Path2D();
    smoothPath(sheen, outer.concat(inner), true);

    // A glint: the brightest bit of sky, a small fleck inside the crescent.
    const g = rim[best];
    const glint = [g[0] * 0.66, g[1] * 0.66, 0.07 + (p.seed % 0.03)];
    p.shape = { body, sheen, glint, cos, sin };
    return p.shape;
  }

  // Colours for the frame, by how dark it is (DayNight.darkness). The water
  // itself is laid down with 'multiply', so it is the ground under it made
  // darker and cooler: grass puddles read green-brown, road puddles grey,
  // dirt puddles muddy, with nothing to keep in step with the terrain. Only
  // the sky reflection is painted, and that follows the sky: an overcast
  // white-grey by day, a dull deep blue by night (the night overlay drawn
  // later still darkens all of it with the rest of the ground).
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const rgb = (a, b, t) => `rgb(${lerp(a[0], b[0], t)},${lerp(a[1], b[1], t)},${lerp(a[2], b[2], t)})`;
  let palD = -1, pal = null;
  function palette(d) {
    if (pal && Math.abs(d - palD) < 0.01) return pal;
    palD = d;
    pal = {
      damp:  rgb([170, 158, 140], [150, 142, 132], d),   // wet ground round it: soil darkened, a little warm
      // At night the overlay already darkens it all, so the water darkens
      // the ground less and the sky in it is a dim blue rather than black;
      // otherwise a puddle after dark reads as a hole in the map.
      water: rgb([158, 170, 182], [176, 182, 196], d),   // the ground seen through the water
      deep:  rgb([182, 190, 200], [208, 212, 220], d),   // and darker again where it is deepest
      sky:   rgb([176, 192, 206], [78, 100, 136], d),    // the overcast sky lying on its surface
      skyA:  0.22 + 0.08 * d,
      sheen: rgb([236, 244, 250], [140, 166, 206], d),   // the brighter sky caught at the far edge
      sheenA: 0.30 - 0.10 * d,
      edge:  `rgba(30,26,20,${(0.38 - 0.1 * d).toFixed(3)})`,   // dark lip where water meets ground
      ring:  rgb([226, 236, 246], [150, 176, 210], d),
    };
    return pal;
  }

  function render(ctx) {
    if (typeof GridManager === 'undefined') return;
    const wk = currentWorld();
    if (wk !== worldKey) {
      worldKey = wk; cells.clear(); soak = water = stain = floodK = 0;
      worldSalt = 0; for (let i = 0; i < wk.length; i++) worldSalt = (Math.imul(worldSalt, 31) + wk.charCodeAt(i)) | 0;
    }

    // Advance on the sim clock: paused is paused, fast-forward dries faster.
    const now = performance.now() / 1000;
    const real = lastNow ? Math.min(0.1, now - lastNow) : 0;
    lastNow = now;
    const scale = (typeof DevMode !== 'undefined' && DevMode.timeScale != null) ? DevMode.timeScale : 1;
    const dt = real * scale;

    const raining = typeof RainSystem !== 'undefined' && RainSystem.isActive() && !(RainSystem.isSnow && RainSystem.isSnow());
    const snowing = typeof RainSystem !== 'undefined' && RainSystem.isSnow && RainSystem.isSnow();
    const level = raining ? rainStrength() * Math.min(1, (RainSystem.level ? RainSystem.level() : 0.9) / 0.9) : 0;
    const flood = flooding();

    const z = Camera.zoom;
    const vx0 = Camera.x, vy0 = Camera.y, vx1 = vx0 + ctx.canvas.width / z, vy1 = vy0 + ctx.canvas.height / z;

    // The ground soaks toward the rain level (a flood soaks it through) and dries when it stops.
    const goal = raining ? Math.min(1, level * (flood ? 1.6 : 1)) : 0;
    if (dt > 0) soak = soak < goal ? Math.min(goal, soak + SOAK_UP * dt * (0.5 + level))
                                   : Math.max(goal, soak - SOAK_DRY * dt * (snowing ? 2 : 1));
    const wetness = Math.max(0, (soak - START) / (1 - START));   // 0 until the ground starts to give

    // The map-wide water level eases after the soak, never jumps; the damp
    // stain follows it up at once and back down at half the pace, so it
    // outlasts the water and then fades on its own. A flood's extra spots
    // wake and settle on the same clock.
    if (dt > 0) {
      const dry = DRY * (snowing ? 3 : 1) * dt;
      water = water < wetness ? Math.min(wetness, water + FILL * dt) : Math.max(wetness, water - dry);
      stain = Math.max(water, stain - dry * 0.5);
      floodK = flood ? Math.min(1, floodK + FILL * dt) : Math.max(0, floodK - dry);
    }
    if (stain < 0.005) return;

    const t = now;
    const pl = palette(typeof DayNight !== 'undefined' ? DayNight.darkness() : 0);

    // What is in view this frame, sized once. `size` is the water, `stain`
    // the damp ground round it (as big as the water got, and lingering).
    // It widens from nothing and darkens as it fills, rather than popping in.
    // Each spot runs a little ahead of or behind the map-wide level, so a
    // street's puddles don't all fill in step.
    const vis = _vis; vis.length = 0;
    const span = CELL * TILE, mg = TILE * 3;
    const cx0 = Math.floor((vx0 - mg) / span), cx1 = Math.floor((vx1 + mg) / span);
    const cy0 = Math.floor((vy0 - mg) / span), cy1 = Math.floor((vy1 + mg) / span);
    const grow = 1 + 0.6 * floodK;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      for (const p of cellSpots(cx, cy)) {
        if (p.flood && floodK <= 0) continue;
        const k = p.flood ? floodK : 1, lag = ((p.seed % 1) - 0.5) * 0.12;
        p.wet  = fillAt(water + lag, p.low) * k;
        p.peak = fillAt(stain + lag, p.low) * k;
        if (p.wet < 0.02 && p.peak < 0.02) continue;
        p.r = p.r0 * grow;
        if (p.r * z < 3) continue;                    // a speck at this zoom
        const st = p.r * (0.15 + 0.85 * p.peak) * 1.12;
        if (p.x + st < vx0 || p.x - st > vx1 || p.y + st < vy0 || p.y - st > vy1) continue;
        if (!spotOpen(p, p.r)) continue;
        if (!p.shape) buildShape(p);
        vis.push(p);
      }
    }
    if (!vis.length) return;

    // Each puddle's cached unit shapes are drawn by putting its centre and
    // size into the camera's own transform (read once), so a fill is one
    // setTransform and one fill(Path2D), with no save/restore per puddle.
    const m = ctx.getTransform();
    const put = (x, y, s) => ctx.setTransform(m.a * s, m.b * s, m.c * s, m.d * s, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f);
    const smooth = w => w * w * (3 - 2 * w);
    ctx.save();

    // Pass 1, multiply: the ground darkened under and around the water. All
    // the multiply layers go in one pass and all the painted ones in the
    // next, so the composite mode changes twice a frame, not per puddle.
    //
    // The pass is built in a layer of its own and laid on the ground with a
    // single multiply. Every multiply fill straight onto the main canvas made
    // the browser copy the pixels under it first (its GPU path has no
    // multiply blend), a few dozen copies a frame in a downpour: a fifth of
    // the frame on integrated graphics. The layer starts white, the fills
    // multiply into it exactly as they did onto the ground, and since
    // multiplying is order-free, ground x layer is the same picture.
    const L = layered ? _layer(m, vis, ctx.canvas.width, ctx.canvas.height) : null;
    const g = L ? L.g : ctx;
    const putL = L ? (x, y, s) => g.setTransform(L.k * m.a * s, L.k * m.b * s, L.k * m.c * s, L.k * m.d * s,
                                                 L.k * (m.a * x + m.c * y + m.e - L.x0), L.k * (m.b * x + m.d * y + m.f - L.y0)) : put;
    g.globalCompositeOperation = 'multiply';
    for (const p of vis) {
      const peak = p.peak || p.wet;
      const a = smooth(p.wet);
      // Wet ground: darkest while there is water in it, then fading with the
      // stain once the water has gone.
      const da = Math.max(a, smooth(Math.min(1, peak)) * 0.6);
      // Two steps, so the wet edge fades out into dry ground instead of
      // ending on a hard line (and no gradient to build every frame).
      if (da > 0.01) {
        const sr = p.r * (0.15 + 0.85 * peak);
        g.fillStyle = pl.damp;
        putL(p.x, p.y, sr * 1.12); g.globalAlpha = 0.4 * da;  g.fill(p.shape.body);
        putL(p.x, p.y, sr * 1.05); g.globalAlpha = 0.35 * da; g.fill(p.shape.body);
      }
      if (p.wet < 0.02) continue;
      const size = p.r * (0.15 + 0.85 * p.wet);
      putL(p.x, p.y, size);
      // Shallow puddles barely tint the ground; full ones are properly dark.
      g.globalAlpha = 0.5 + 0.5 * a; g.fillStyle = pl.water; g.fill(p.shape.body);
      putL(p.x, p.y, size * 0.6);
      g.globalAlpha = 0.5 * a; g.fillStyle = pl.deep; g.fill(p.shape.body);
    }
    if (L) {
      // The whole pass onto the ground in one multiply (device pixels).
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(L.cv, 0, 0, L.w, L.h, L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0);
    }

    // Pass 2, painted: the sky lying on the water, the dark lip at its edge,
    // the brighter crescent of sky at the far side and a glint in it.
    ctx.globalCompositeOperation = 'source-over';
    const z1 = 1 / z;
    for (const p of vis) {
      if (p.wet < 0.02) continue;
      const a = smooth(p.wet);
      const size = p.r * (0.15 + 0.85 * p.wet);
      const sh = p.shape;
      put(p.x, p.y, size);
      ctx.globalAlpha = pl.skyA * a; ctx.fillStyle = pl.sky; ctx.fill(sh.body);
      // The lip: about a screen pixel wide whatever the zoom or puddle size.
      if (size * z > 4) {
        ctx.globalAlpha = a; ctx.strokeStyle = pl.edge; ctx.lineWidth = 1.1 * z1 / size; ctx.stroke(sh.body);
      }
      // Too small on screen to show a reflection: skip the detail.
      if (size * z < 6) continue;
      ctx.globalAlpha = pl.sheenA * a; ctx.fillStyle = pl.sheen; ctx.fill(sh.sheen);
      ctx.globalAlpha = Math.min(1, pl.sheenA * 1.6) * a;
      ctx.beginPath(); ctx.ellipse(sh.glint[0], sh.glint[1], sh.glint[2], sh.glint[2] * 0.5, LIGHT + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
    }

    // Raindrops landing in it: rings that spread and fade, a fresh one
    // somewhere new each cycle, and a fainter second ring inside the first.
    // Drawn in world space (circles, not squashed with the puddle), kept
    // inside the inner part of the blob so none hangs over the edge.
    if (raining) {
      ctx.setTransform(m);
      ctx.strokeStyle = pl.ring;
      ctx.lineWidth = 1.0 * z1;
      for (const p of vis) {
        const size = p.r * (0.15 + 0.85 * p.wet);
        if (p.wet < 0.02 || size < TILE * 0.22 || size * z < 8) continue;
        const a = smooth(p.wet);
        const sh = p.shape;
        // More drops in a bigger puddle and in harder rain.
        const rings = Math.max(1, Math.min(5, Math.round((size / (TILE * 0.32)) * (0.5 + level))));
        for (let k = 0; k < rings; k++) {
          // Each ring keeps its own pace and its own place in the cycle; the
          // offsets step round by the golden ratio so the rings in one
          // puddle are always spread out, never landing in step.
          const rate = 0.9 + ((p.seed * (k + 3)) % 1) * 0.6;
          const u = t * rate + ((p.seed * 0.618 + k * 0.618034) % 1) + p.seed * (k + 1);
          const ph = u % 1, cycle = Math.floor(u);
          // Where it lands, in the puddle's own frame, then tilted with it.
          const lx = Math.sin(cycle * 12.9 + p.seed + k * 3.1) * 0.5, ly = Math.cos(cycle * 7.3 + p.seed * 2 + k * 1.7) * 0.5 * p.ar;
          const x = p.x + (lx * sh.cos - ly * sh.sin) * size, y = p.y + (lx * sh.sin + ly * sh.cos) * size;
          const rr = Math.min(TILE * 0.16, size * 0.32) * ph + 0.4;
          const fade = (1 - ph) * (1 - ph) * a;
          ctx.globalAlpha = 0.7 * fade;
          ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.stroke();
          if (ph > 0.3) {
            ctx.globalAlpha = 0.35 * fade;
            ctx.beginPath(); ctx.arc(x, y, rr * 0.55, 0, Math.PI * 2); ctx.stroke();
          }
        }
      }
    }
    ctx.restore();
  }
  const _vis = [];   // reused list of what is in view this frame

  // The multiply pass's layer (see render): a software canvas (read back
  // never, but willReadFrequently keeps it off the GPU, where every multiply
  // fill into it would cost the same pixel copy it is here to save), sized
  // to the box the visible puddles' damp rings can reach, at LAYER_K of the
  // screen's resolution (the stain is soft-edged; the water's lip and sky
  // are drawn sharp on top in pass 2). Filled white, so wherever no puddle
  // lies it multiplies the ground by one: unchanged.
  let layered = true;
  const LAYER_K = 0.5;
  let _lcv = null, _lg = null;
  const _L = { cv: null, g: null, k: LAYER_K, x0: 0, y0: 0, x1: 0, y1: 0, w: 0, h: 0 };
  function _layer(m, vis, W, H) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of vis) {
      const R = p.r * 1.12 * 1.45;   // the damp ring's reach, rim wobble included
      const cx = m.a * p.x + m.c * p.y + m.e, cy = m.b * p.x + m.d * p.y + m.f;
      const rx = R * Math.abs(m.a), ry = R * Math.abs(m.d);
      if (cx - rx < x0) x0 = cx - rx;
      if (cy - ry < y0) y0 = cy - ry;
      if (cx + rx > x1) x1 = cx + rx;
      if (cy + ry > y1) y1 = cy + ry;
    }
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W, Math.ceil(x1));  y1 = Math.min(H, Math.ceil(y1));
    if (x1 <= x0 || y1 <= y0) return null;
    if (!_lcv) { _lcv = document.createElement('canvas'); _lg = _lcv.getContext('2d', { willReadFrequently: true }); }
    const w = Math.max(1, Math.ceil((x1 - x0) * LAYER_K)), h = Math.max(1, Math.ceil((y1 - y0) * LAYER_K));
    if (_lcv.width < w || _lcv.height < h) { _lcv.width = Math.max(w, _lcv.width); _lcv.height = Math.max(h, _lcv.height); }
    _lg.setTransform(1, 0, 0, 1, 0, 0);
    _lg.globalCompositeOperation = 'source-over';
    _lg.globalAlpha = 1;
    _lg.fillStyle = '#fff';
    _lg.fillRect(0, 0, w + 1, h + 1);
    // The box drawn back is exactly the layer pixels covered, so the
    // half-resolution layer lines up with the ground.
    Object.assign(_L, { cv: _lcv, g: _lg, x0, y0, x1: x0 + w / LAYER_K, y1: y0 + h / LAYER_K, w, h });
    return _L;
  }

  return {
    render,
    count: () => _vis.length,      // puddles drawn last frame
    // Dev: soak the map at once (0..1), to see or time a downpour's puddles.
    devSoak: v => { soak = water = stain = Math.max(0, Math.min(1, v)); },
    // Dev A/B: false draws the multiply pass straight onto the ground again.
    get layered() { return layered; }, set layered(v) { layered = !!v; },
    soak: () => soak,
    clear: () => { cells.clear(); water = stain = floodK = soak = 0; },
  };
})();
