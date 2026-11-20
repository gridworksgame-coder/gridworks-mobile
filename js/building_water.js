/* ═══════════════════════════════════════════════════════════════════
   BUILDING WATER
   ─────────────────────────────────────────────────────────────────
   One look for the water drawn inside buildings: swimming pools,
   fountains, reflecting pools, park and garden ponds, cooling and
   settling basins, clarifiers, reservoirs, fuel pools. The building
   paints its own flat water colour first, as it always has; BldWater.draw
   then lays over that same shape, keeping its colour:

     • depth: the middle sinks darker, and the wall on the sun's side
       (upper left, as everywhere in the game) shades the water under it
       while the far wall catches a pale line;
     • caustics: a fine network of light on the floor, two copies sliding
       across each other so it wobbles (none in murky water);
     • ripples: short crests drifting across;
     • by day, sun glints twinkling; after dark, warm and cool sparkles of
       the city's lights, the reflections of any lamps the building names,
       and (lit pools) an underwater glow with the caustics lit up.

   The patterns are built in code (no images: nothing taints a canvas read
   back over file://), 256 px and power-of-two, baked once in idle time.
   Until they exist only the depth shading is drawn. Zoomed out past
   ZOOM_FINE only the depth is drawn: the rest would be sub-pixel noise.

   Usage, right after the building fills its water:
     BldWater.draw(ctx, shape, x, y, w, h, t, opts)
       shape  'rect' | 'ell' (the ellipse inscribed in the box) | 'rr'
              (rounded box, opts.r) | 'path' (the current path, as just
              filled) | a Path2D
       x,y,w,h  the water's bounding box, in the building's (world) units
       t      seconds, the building's animation clock
       opts   depth 0-1 (0.6), murky (no caustics), evenodd (a ring: the
              path or Path2D is clipped even-odd), still (nothing moves:
              unpowered, covered), glow 'r,g,b' (underwater lights, used at
              night), lights [[x, y, 'r,g,b'], ...] (lamps reflected after
              dark), a (overall strength, 1)
   ═══════════════════════════════════════════════════════════════════ */
var BldWater = (() => {     // var: re-evaluable by dev tools
  const SZ = 256;               // pattern texels; one repeat is SZ * TEX world px
  const TEX = 0.5;              // world px per texel: fine enough to stay crisp zoomed in
  const ZOOM_FINE = 0.45;       // below this only the depth shading
  let caus = null, ripple = null, glint = null, warm = null;
  let started = false;

  // ── Baking ───────────────────────────────────────────────────────
  // A tileable cellular (Worley F2-F1) field: thin bright lines where two
  // cells meet, which is what light focused by a rippled surface looks
  // like on a pool floor. 12×12 jittered cells, about 10 world px across.
  function bakeCaustics(done) {
    const N = 12, cell = SZ / N;
    let seed = 0x5EA7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    const px = new Float32Array(N * N), py = new Float32Array(N * N);
    for (let i = 0; i < N * N; i++) { px[i] = (i % N + 0.15 + rnd() * 0.7) * cell; py[i] = (Math.floor(i / N) + 0.15 + rnd() * 0.7) * cell; }
    const c = document.createElement('canvas'); c.width = c.height = SZ;
    const g = c.getContext('2d');
    const img = g.createImageData(SZ, SZ), d = img.data;
    let y = 0;
    const slice = (deadline) => {
      const until = performance.now() + Math.max(2, Math.min(6, deadline && deadline.timeRemaining ? deadline.timeRemaining() : 4));
      const TAU = Math.PI * 2;
      while (y < SZ && performance.now() < until) {
        for (let x = 0; x < SZ; x++) {
          // Warp the lookup with waves that repeat over the tile, so the
          // cell walls wander instead of running dead straight.
          let sx = x + 4.2 * Math.sin(TAU * y / 64 + 1.3) + 2.2 * Math.sin(TAU * (x + y) / 128);
          let sy = y + 4.2 * Math.sin(TAU * x / 64 + 0.4) + 2.2 * Math.sin(TAU * (x - y) / 128 + 2.1);
          sx = ((sx % SZ) + SZ) % SZ; sy = ((sy % SZ) + SZ) % SZ;
          const cx = Math.floor(sx / cell), cy = Math.floor(sy / cell);
          let f1 = 1e9, f2 = 1e9;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
            const gx = cx + i, gy = cy + j;
            const k = ((gy + N) % N) * N + ((gx + N) % N);
            const dx = px[k] + (gx < 0 ? -SZ : gx >= N ? SZ : 0) - sx;
            const dy = py[k] + (gy < 0 ? -SZ : gy >= N ? SZ : 0) - sy;
            const dd = dx * dx + dy * dy;
            if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
          }
          const e = Math.sqrt(f2) - Math.sqrt(f1);          // 0 on a cell edge
          let v = 1 - e / 3.6; v = v < 0 ? 0 : v * v;
          const o = (y * SZ + x) * 4;
          d[o] = 225; d[o + 1] = 248; d[o + 2] = 255; d[o + 3] = Math.round(v * 230);
        }
        y++;
      }
      if (y < SZ) { idle(slice); return; }
      g.putImageData(img, 0, 0);
      done(c);
    };
    idle(slice);
  }
  // Short wave crests, a pale top with a shadow under it; drawn at every
  // wrap offset so the tile repeats without a seam.
  function bakeRipples() {
    const c = document.createElement('canvas'); c.width = c.height = SZ;
    const g = c.getContext('2d');
    let seed = 0xB0A7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    g.lineCap = 'round';
    for (let i = 0; i < 150; i++) {
      const x = rnd() * SZ, y = rnd() * SZ, len = 5 + rnd() * 12, bow = 1 + rnd() * 1.6, a = 0.12 + rnd() * 0.2;
      for (const ox of [-SZ, 0, SZ]) for (const oy of [-SZ, 0, SZ]) {
        const X = x + ox, Y = y + oy;
        if (X + len < 0 || X - len > SZ || Y + 4 < 0 || Y - 4 > SZ) continue;
        g.strokeStyle = `rgba(0,20,40,${(a * 0.8).toFixed(3)})`; g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(X - len, Y + 1.2); g.quadraticCurveTo(X, Y + 1.2 - bow * 2, X + len, Y + 1.2); g.stroke();
        g.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`; g.lineWidth = 1;
        g.beginPath(); g.moveTo(X - len, Y); g.quadraticCurveTo(X, Y - bow * 2, X + len, Y); g.stroke();
      }
    }
    return c;
  }
  // Small sparkles: flat diamonds with a bright core, in the colour given.
  function bakeGlints(rgb, sd) {
    const c = document.createElement('canvas'); c.width = c.height = SZ;
    const g = c.getContext('2d');
    let seed = sd;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 70; i++) {
      const x = rnd() * SZ, y = rnd() * SZ, s = 1.5 + rnd() * 3.5, a = 0.45 + rnd() * 0.55;
      for (const ox of [-SZ, 0, SZ]) for (const oy of [-SZ, 0, SZ]) {
        const X = x + ox, Y = y + oy;
        if (X + s < 0 || X - s > SZ || Y + s < 0 || Y - s > SZ) continue;
        g.fillStyle = `rgba(${rgb},${(a * 0.5).toFixed(3)})`;
        g.beginPath(); g.moveTo(X - s * 1.6, Y); g.lineTo(X, Y - s * 0.4); g.lineTo(X + s * 1.6, Y); g.lineTo(X, Y + s * 0.4); g.closePath(); g.fill();
        g.fillStyle = `rgba(255,255,250,${a.toFixed(3)})`;
        g.fillRect(X - s * 0.45, Y - 0.5, s * 0.9, 1);
      }
    }
    return c;
  }
  function idle(fn) {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(fn, { timeout: 500 });
    else setTimeout(() => fn(null), 30);
  }
  // Patterns are made on the context that asks (any 2D context will do;
  // a CanvasPattern is not tied to the canvas it is used on).
  let pats = null;
  function patterns(g) {
    if (pats) return pats;
    if (!started) {
      started = true;
      idle(() => { ripple = bakeRipples(); glint = bakeGlints('255,250,225', 0x61AB); warm = bakeGlints('255,200,120', 0x7A11);
        bakeCaustics(cv => { caus = cv; }); });
    }
    if (!caus || !ripple) return null;
    pats = {
      caus: g.createPattern(caus, 'repeat'), ripple: g.createPattern(ripple, 'repeat'),
      glint: g.createPattern(glint, 'repeat'), warm: g.createPattern(warm, 'repeat'),
    };
    return pats;
  }

  // ── Drawing ──────────────────────────────────────────────────────
  function shapePath(g, shape, x, y, w, h, r) {
    g.beginPath();
    if (shape === 'ell') g.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else if (shape === 'rr' && g.roundRect) g.roundRect(x, y, w, h, Math.min(r || 0, w / 2, h / 2));
    else g.rect(x, y, w, h);
  }
  // One pattern layer over the clipped box, offset by (ox, oy) world px.
  // sc: the pattern's size against the usual (a second layer at another
  // size keeps two copies from lining up).
  function layer(g, pat, x, y, w, h, ox, oy, alpha, sc) {
    if (alpha <= 0.004) return;
    const tex = TEX * (sc || 1), rep = SZ * tex;
    ox = ((ox % rep) + rep) % rep; oy = ((oy % rep) + rep) % rep;
    g.save();
    g.globalAlpha = alpha;
    g.translate(x - ox, y - oy); g.scale(tex, tex);
    g.fillStyle = pat;
    g.fillRect(0, 0, (w + ox) / tex + 1, (h + oy) / tex + 1);
    g.restore();
  }

  function draw(g, shape, x, y, w, h, t, o) {
    if (!(w > 0 && h > 0)) return;
    o = o || {};
    const z = typeof Camera !== 'undefined' ? Camera.zoom : 1;
    const dk = typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;
    const A = o.a === undefined ? 1 : o.a;
    const still = !!o.still;
    const tt = still ? 0 : (t || 0);
    // Split buildings: the static pass is baked and held, so draw it at rest.
    const baked = typeof SplitPhase !== 'undefined' && SplitPhase.cur === 'static';
    const T = baked ? 0 : tt;
    const m = Math.min(w, h);

    g.save();
    if (shape === 'path') g.clip(o.evenodd ? 'evenodd' : 'nonzero');
    else if (typeof shape === 'object' && shape) g.clip(shape, o.evenodd ? 'evenodd' : 'nonzero');
    else { shapePath(g, shape, x, y, w, h, o.r); g.clip(); }

    // Depth: a darker middle, shade under the sun-side wall, a pale far rim.
    const dep = (o.depth === undefined ? 0.6 : o.depth) * A;
    const cx = x + w / 2, cy = y + h / 2;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.62);
    rg.addColorStop(0, `rgba(0,14,34,${(0.3 * dep).toFixed(3)})`);
    rg.addColorStop(0.55, `rgba(0,14,34,${(0.12 * dep).toFixed(3)})`);
    rg.addColorStop(1, 'rgba(0,14,34,0)');
    g.fillStyle = rg; g.fillRect(x, y, w, h);
    const band = Math.max(1, Math.min(m * 0.2, 7));
    let lg = g.createLinearGradient(0, y, 0, y + band);
    lg.addColorStop(0, `rgba(0,10,25,${(0.42 * dep).toFixed(3)})`); lg.addColorStop(1, 'rgba(0,10,25,0)');
    g.fillStyle = lg; g.fillRect(x, y, w, band);
    lg = g.createLinearGradient(x, 0, x + band, 0);
    lg.addColorStop(0, `rgba(0,10,25,${(0.3 * dep).toFixed(3)})`); lg.addColorStop(1, 'rgba(0,10,25,0)');
    g.fillStyle = lg; g.fillRect(x, y, band, h);
    lg = g.createLinearGradient(0, y + h - band * 0.6, 0, y + h);
    lg.addColorStop(0, 'rgba(230,250,255,0)'); lg.addColorStop(1, `rgba(230,250,255,${(0.22 * dep * (1 - dk * 0.7)).toFixed(3)})`);
    g.fillStyle = lg; g.fillRect(x, y + h - band * 0.6, w, band * 0.6);

    const P = z >= ZOOM_FINE && m * z > 3 ? patterns(g) : null;
    if (P) {
      const glow = o.glow && dk > 0.15 ? o.glow : null;
      // Caustics: bright by day, gone at night unless the pool is lit.
      if (!o.murky) {
        let ca = 0.42 * (1 - dk * 0.85);
        if (glow) ca = Math.max(ca, 0.42 * dk);
        ca *= A;
        if (glow) { g.save(); g.globalCompositeOperation = 'lighter'; }
        // A second copy at another size, drifting the other way, makes the
        // net wobble; on a pool only a few pixels across one is enough.
        const two = m * z >= 24;
        layer(g, P.caus, x, y, w, h, T * 3.1, T * 1.7, ca * (two ? 0.6 : 0.8));
        if (two) layer(g, P.caus, x, y, w, h, -T * 2.3 + 37, T * 2.6 + 81, ca * 0.45, 1.37);
        if (glow) g.restore();
      }
      // Underwater lights after dark.
      if (glow) {
        const gg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.6);
        gg.addColorStop(0, `rgba(${glow},${(0.35 * dk * A).toFixed(3)})`); gg.addColorStop(1, `rgba(${glow},${(0.1 * dk * A).toFixed(3)})`);
        g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gg; g.fillRect(x, y, w, h); g.restore();
      }
      // Ripples drifting across (fainter on murky or still water).
      if (!still) layer(g, P.ripple, x, y, w, h, T * 4.5, T * 1.2, (o.murky ? 0.5 : 0.7) * (1 - dk * 0.5) * A);
      else layer(g, P.ripple, x, y, w, h, 0, 0, 0.25 * A);
      // Sun glints by day; the city's lights after dark. One layer that
      // fades in and out, jumping to a new spot each time it is dark, so
      // sparkles come and go instead of sliding.
      if (!still && !baked) {
        const ph = T * 0.7 + (x + y) * 0.013, cyc = Math.floor(ph), pulse = Math.sin(Math.PI * (ph - cyc));
        const ox = cyc * 61 + T * 1.5, oy = cyc * 47;
        const day = (1 - dk) * A, nite = dk * A;
        if (day > 0.05) layer(g, P.glint, x, y, w, h, ox, oy, 0.9 * day * pulse);
        if (nite > 0.05) layer(g, P.warm, x, y, w, h, ox + 19, oy + 93, 0.55 * nite * pulse);
      }
    }
    // Lamps reflected after dark: a soft shimmering streak below each one.
    if (o.lights && dk > 0.2 && z >= 0.3) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const [lx, ly, rgb] of o.lights) {
        const len = Math.max(6, Math.min(h * 0.9, 40)), wd = Math.max(1.5, Math.min(w * 0.06, 5));
        const top = Math.max(y, ly);
        const sg = g.createLinearGradient(0, top, 0, top + len);
        sg.addColorStop(0, `rgba(${rgb},${(0.55 * dk * A).toFixed(3)})`); sg.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = sg;
        for (let k = 0; k < 5; k++) {
          const yy = top + k * len / 5, sx = Math.sin(T * 3 + k * 1.7 + lx) * wd * 0.4;
          g.fillRect(lx - wd / 2 + sx, yy, wd * (1 - k * 0.12), len / 5 * 0.7);
        }
      }
      g.restore();
    }
    g.restore();
  }

  return { draw, _state: () => ({ caus: !!caus, ripple: !!ripple, pats: !!pats }) };
})();
