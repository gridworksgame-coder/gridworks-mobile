/* ═══════════════════════════════════════════════════════════════════
   RENDER: ELECTRICAL GRID
   Generators, wires, substations, poles, solar, wind, batteries,
   and grid-attached amenities (monitors, cameras, EV chargers, lamps).
   ═══════════════════════════════════════════════════════════════════ */

// ── Entity renderers ──────────────────────────────────────────

// updated each frame before tile rendering

  function renderWireSpark(e, px, py, t) {
    if (!e._weatherFailed) return;
    const cx = px + TILE/2, cy = py + TILE/2;
    // Persistent red glow
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 12 + e.col + e.row);
    ctx.fillStyle = '#ff2000';
    ctx.beginPath(); ctx.arc(cx, cy, TILE * 0.45, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    // Animated spark bursts — deterministic position using stable hash + time
    const sparks = [
      { ox: Math.sin(t*9 + e.col) * 5, oy: Math.cos(t*7 + e.row) * 5 },
      { ox: Math.cos(t*11 + e.row) * 4, oy: Math.sin(t*13 + e.col) * 4 },
      { ox: Math.sin(t*6 + e.col*0.5) * 6, oy: Math.cos(t*8 + e.row*0.5) * 3 },
    ];
    ctx.save();
    sparks.forEach((s, i) => {
      const alpha = 0.6 + 0.4 * Math.sin(t * 10 + i * 2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = i === 0 ? '#ffcc00' : '#ff6600';
      ctx.beginPath(); ctx.arc(cx + s.ox, cy + s.oy, 2.5, 0, Math.PI*2); ctx.fill();
    });
    ctx.restore();
    // ⚡ text indicator
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#ffdd00';
    ctx.font = `bold ${Math.round(TILE * 0.5)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('⚡', cx, cy - TILE * 0.4);
    ctx.textAlign = 'left';
    ctx.restore();
  }

// Unpowered parks never take a wire connection — they draw no power (see
// isPark in power_network.js, which also keeps them off the network
// entirely). Without this, a wire beside a park sprouted a stub into it and
// the park looked wired up. POWERED_PARK_TYPES (Splash Pad, Lit Baseball
// Diamond, Community Center) DO join the grid, so wires connect to those as
// normal — same exclusion power_network.js makes. PARK_TYPES loads after
// this file, so the set is built lazily.
let _wireParkSet = null;
function _wireSkipsNeighbour(n) {
  const type = n.type;
  // Water never conducts (canConnect in power_network.js rejects it), so a
  // wire along a shoreline mustn't sprout stubs into the lake. A wire laid
  // ACROSS water is a WIRE tile itself and still joins up normally.
  if (type === T.TREE || type === T.BUSH || type === T.TRUCK || type === T.WATER) return true;
  // Pipes carry water, not current. A pipe merely running alongside a wire was
  // sprouting a stub into it, which read as the two networks being joined. The
  // one exception is a pipe the player has run a wire THROUGH (_underWire) —
  // power_network.js genuinely conducts across those tiles, so the wire has to
  // look continuous there.
  if ((type === T.PIPE || type === T.UNDERGNDPIPE) && !n._underWire) return true;
  // Same for conveyor belts: they carry materials, not current, so a wire
  // running beside one mustn't sprout stubs into it — unless the belt was
  // laid over a wire (_underWire), which power_network.js does conduct.
  if (type === T.CONVEYOR && !n._underWire) return true;
  if (!_wireParkSet) {
    _wireParkSet = new Set(typeof PARK_TYPES !== 'undefined' ? PARK_TYPES : []);
    if (typeof POWERED_PARK_TYPES !== 'undefined') for (const t of POWERED_PARK_TYPES) _wireParkSet.delete(t);
  }
  return _wireParkSet.has(type);
}

// Neighbours a wire runs INTO rather than being plugged into a building:
// other cable, and the pipe / belt / road tiles a wire can be laid through.
const _WIRE_NO_TERMINAL = new Set([T.WIRE, T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR, T.ROAD]);

// ── Wire reach ──────────────────────────────────────────────────
// A lot of buildings are drawn smaller than their footprint (a yard, a
// setback, a round tank in a square plot), so a cable that stopped at the
// footprint edge was left hanging in the air short of the wall. This finds
// how far past the edge the building's art actually starts: the building is
// drawn once off-screen (static pass only — no glows, smoke or overlays),
// and from the cable's entry point we step inward until we hit solid paint.
// The cable and its wall socket are then carried that far in.
//
// Measured per building, lazily, the first time a wire meets it; re-measured
// if it changes size, rotation, subtype or state, or every REMEASURE_MS in
// case its art changed some other way (upgrades, damage, lit windows).
const WireReach = (() => {
  // Never run a cable further in than this. Was 2.5 tiles, and only ever half
  // way across: a cable meeting a big plot where its art is set well back
  // (the school's lawns either side of its wings, ~5 tiles in) stopped dead
  // at the plot edge, short of the building.
  const MAX_DEPTH    = TILE * 8;
  const SOLID_ALPHA  = 200;         // skip shadows, glows and haze
  const REMEASURE_MS = 20000;
  const SIG_CHECK_MS = 250;
  const MARGIN = 4;
  const _cache = new WeakMap();     // entity -> { sig, at, img, w, h, depths: Map }
  let _cv = null, _cx = null;
  // A building bigger than this (in image px) is drawn scaled down to it.
  // Drawing and reading back the whole sprite of something the size of the
  // National Grid (2,500 x 1,900 px) at full size was a 50-120ms hitch, and
  // drawing it a strip per cable cost nearly that per cable. A few px of
  // precision is all a cable end needs.
  const WHOLE_MAX_PX = 320 * 320;

  const _sig = (e) => `${e.type}|${e.col}|${e.row}|${e.width}|${e.height}|${e._rotation || 0}|${e.subtype || e.commercialSubtype || e._subtype || ''}|${e._lightningDamaged ? 1 : 0}|${e._irreparable ? 1 : 0}|${e._underConstruction ? 1 : 0}`;

  // The building drawn (static pass) into the scratch canvas: a w x h image
  // whose (0,0) is MARGIN px above-left of the footprint, at scale `sc`.
  // Returns its pixels, or null if the renderer threw.
  function _draw(e, px, py, sw, sh, sc) {
    if (!_cv) { _cv = document.createElement('canvas'); _cx = _cv.getContext('2d', { willReadFrequently: true }); }
    if (_cv.width < sw || _cv.height < sh) { _cv.width = Math.max(_cv.width, sw); _cv.height = Math.max(_cv.height, sh); }
    // Drawn at two moments, and only paint in both counts. Plenty of
    // buildings have no static/animated split, so their birds, butterflies,
    // people and swinging signs come through the 'static' pass too; caught
    // mid-flight over the lawn, one used to stop a cable dead on the grass.
    const a = _drawAt(e, px, py, sw, sh, sc, 0);
    if (!a) return null;
    const b = _drawAt(e, px, py, sw, sh, sc, 7.3);
    if (b) for (let i = 3; i < a.length; i += 4) if (b[i] < a[i]) a[i] = b[i];
    return a;
  }
  function _drawAt(e, px, py, sw, sh, sc, t) {
    _cx.setTransform(1, 0, 0, 1, 0, 0);
    _cx.clearRect(0, 0, _cv.width, _cv.height);
    // Drawn at its real world position (so anything the renderer derives
    // from position is unchanged), shifted into the scratch canvas.
    _cx.setTransform(sc, 0, 0, sc, sc * (MARGIN - px), sc * (MARGIN - py));
    const saved = ctx;
    // As it looks wired up and content: the status dots a struggling
    // customer shows in its corner and the NO POWER plate are overlays, not
    // building, and a cable used to stop on the dots out over the lawn.
    const keep = { powered: e.powered, reliability: e.reliability, satisfaction: e.satisfaction };
    e.powered = true; e.reliability = 100; e.satisfaction = 100;
    try {
      ctx = _cx;
      // Without its contact shadow. That is a bitmap held on the GPU, and
      // drawing it into this CPU canvas made the read-back below wait on the
      // GPU — ~15ms a building, which was the whole cost of a measurement.
      // It is at most half opaque, so it is never "solid" paint on its own.
      const draw = () => SplitPhase.run('static', () => renderEntityAt(e, px, py, t));
      if (typeof ContactShadow !== 'undefined' && ContactShadow.without) ContactShadow.without(draw); else draw();
    } catch (_e) {
      return null;
    } finally {
      ctx = saved;
      e.powered = keep.powered; e.reliability = keep.reliability; e.satisfaction = keep.satisfaction;
    }
    return _cx.getImageData(0, 0, sw, sh).data;
  }

  // Each building is drawn once, whole, and every cable into it reads that
  // image; a big one at a reduced scale (WHOLE_MAX_PX).
  function _measure(e) {
    const w = (e.width || 1) * TILE + MARGIN * 2, h = (e.height || 1) * TILE + MARGIN * 2;
    const { x: px, y: py } = GridManager.tileToWorld(e.col, e.row);
    const sc = w * h > WHOLE_MAX_PX ? Math.sqrt(WHOLE_MAX_PX / (w * h)) : 1;
    const sw = Math.ceil(w * sc), sh = Math.ceil(h * sc);
    const data = _draw(e, px, py, sw, sh, sc);
    return data ? { data, sw, sh, sc, w, h, px, py } : null;
  }

  // How far sideways the cable may turn to find the building when nothing
  // lies straight ahead of it.
  const MAX_SIDE = TILE * 4;
  const NO_REACH = { d: 0, l: 0 };

  // Where a cable from footprint edge point (sx, sy), heading (dc, dr) into
  // building `n`, meets its first solid paint: { d, l } — d pixels straight
  // in, then l pixels sideways (along (-dr, dc); negative the other way).
  // l is 0 when the art lies straight ahead, which is nearly always. Where
  // nothing does (the cable enters by a lawn, a car park or a corner the art
  // doesn't fill), it runs in and turns along to the nearest paint, so it
  // still ends on the building rather than hanging at the plot line.
  // { 0, 0 } when nothing solid lies within reach at all.
  function reach(n, sx, sy, dc, dr) {
    // A ruin has no wall to run a cable to: it stops at the plot line. And
    // while the Advanced Reactor's sequence runs nothing is measured at all:
    // each measurement is two off-screen draws and a GPU read-back, and that
    // sequence ruins every building and cuts the camera to unmeasured streets
    // every few seconds (0.5-1.2s hitches). A building measured before keeps
    // its cable; one first met mid-sequence stops at the plot line.
    if (n._irreparable) return NO_REACH;
    const frozen = typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.hasEnded();
    let c = _cache.get(n);
    if (frozen && !c) return NO_REACH;
    const now = performance.now();
    // This runs for every wire-to-building join on screen, every frame. The
    // signature is a string build, so it is only re-checked every SIG_CHECK_MS
    // (a building that changes state has its cable catch up a moment later).
    if (!frozen && (!c || now - c.sigAt > SIG_CHECK_MS)) {
      const sig = _sig(n);
      if (!c || c.sig !== sig || now - c.at > REMEASURE_MS) {
        const m = _measure(n);
        c = { sig, at: now, sigAt: now, m, depths: new Map() };
        _cache.set(n, c);
      } else c.sigAt = now;
    }
    if (!c.m) return NO_REACH;
    // Numeric key (world coords are < 2^17): no string built per lookup.
    const k = (sx * 131072 + sy) * 4 + (dr < 0 ? 0 : dr > 0 ? 1 : dc < 0 ? 2 : 3);
    let d = c.depths.get(k);
    if (d !== undefined) return d;
    // Across the whole plot if need be: anything solid on the way is the
    // building the cable is plugged into.
    const extent = (dc !== 0 ? (n.width || 1) : (n.height || 1)) * TILE;
    const lim = Math.min(MAX_DEPTH, extent - 1);
    const x0 = sx - c.m.px + MARGIN, y0 = sy - c.m.py + MARGIN;
    const { data, sw, sh, sc } = c.m;
    const solid = (x, y) => {
      x = Math.round(x * sc); y = Math.round(y * sc);
      if (x < 0 || y < 0 || x >= sw || y >= sh) return false;
      return data[(y * sw + x) * 4 + 3] >= SOLID_ALPHA;
    };
    const qx = -dr, qy = dc;                         // across the cable
    d = null;
    for (let s = 0; s <= lim; s += 1) {
      const x = x0 + dc * s, y = y0 + dr * s;
      if (solid(x, y) || solid(x + qx * 1.5, y + qy * 1.5) || solid(x - qx * 1.5, y - qy * 1.5)) { d = { d: s, l: 0 }; break; }
    }
    // The nearest paint by cable length, in then across, up to `deep` in and
    // `side` either way, beating `straight` (a straight run already found)
    // by BEND_GAIN or not at all. Searched by growing length, so the first
    // hit is the shortest run, and the legs before it are clear by
    // construction. Kept inside the plot, and at least a few px in so the
    // turn clears the plot line.
    const along = dc !== 0 ? (n.height || 1) * TILE : (n.width || 1) * TILE;
    const pos = dc !== 0 ? y0 - MARGIN : x0 - MARGIN;            // cable's place along the edge
    // (-dr, dc) runs toward -x/-y for some headings; flip so +l always
    // means +along the edge.
    const flip = (qx + qy) < 0 ? -1 : 1;
    const BEND_GAIN = TILE / 2;                      // a turn has to save this much cable
    const bend = (isSolid, deep, side, step, straight) => {
      const loL = -Math.min(side, pos - 2), hiL = Math.min(side, along - pos - 2);
      for (let len = 4; len <= deep + side; len += step) {
        for (let s = 4; s <= Math.min(deep, len); s += step) {
          const a = len - s;
          for (const l of a ? [a, -a] : [0]) {
            if (l < loL || l > hiL) continue;
            if (isSolid(x0 + dc * s + qx * l * flip, y0 + dr * s + qy * l * flip)) {
              const hit = { d: s, l: l * flip };
              return straight && s + a + BEND_GAIN >= straight.d ? straight : hit;
            }
          }
        }
        if (straight && len + BEND_GAIN >= straight.d) return straight;   // can't beat it now
      }
      return straight;
    };
    // Nothing straight ahead, or only far in across open ground (a clock
    // tower 5 tiles back while the roof beside it is just round the corner):
    // turn along to the nearest paint if that is clearly shorter.
    if (!d || d.d > TILE) d = bend(solid, lim, MAX_SIDE, 2, d);
    // Still nothing: a very large plot with its art far from this side (the
    // Mass Driver's open ground). Search the whole plot, coarser.
    if (!d) d = bend(solid, extent - 1, along, 4, null);
    if (!d) d = NO_REACH;                            // nothing there: stay at the edge
    c.depths.set(k, d);
    return d;
  }
  // Just the straight-in depth, for a caller with no use for the turn.
  const depth = (n, sx, sy, dc, dr) => reach(n, sx, sy, dc, dr).d;

  return { depth, reach };
})();

// Sockets queued by renderWire this frame, flat as [x, y, dc, dr, led, ...].
// Cleared by _renderWireTerminals once drawn, and at the start of the wire
// pass so anything queued by a late overlay draw can't carry over a frame.
const _wireTerminals = [];

// Where a cable enters a building: a rubber strain-relief boot on the cable,
// a gland nut, and a small screwed wall plate with a status LED straddling
// the building's edge — so the wire reads as plugged into the building
// instead of just stopping at it. Drawn after the building pass (see
// render_main_loop.js), oriented so +x points into the building.
function _renderWireTerminals() {
  const q = _wireTerminals;
  if (!q.length) return;
  // Every socket is the same dozen shapes turned one of four ways, so the
  // shapes are placed by hand (no per-socket transform) into one path per
  // colour and each colour is filled once per batch. Batches are kept short:
  // the queue is in block order, so a batch stays in one part of the screen.
  for (let i = 0; i < q.length; i += _WT_BATCH * 5) _renderWireTerminalBatch(q, i, Math.min(q.length, i + _WT_BATCH * 5));
  q.length = 0;
}

const _WT_BATCH = 48;
const _wtLeds = new Map();       // LED colour -> { dot, halo } for the batch being built

// A socket-local rectangle (+x pointing into the building), placed in the world.
function _wtRect(p, x, y, dc, dr, lx, ly, w, h, rad) {
  const x1 = x + dc * lx - dr * ly,             y1 = y + dr * lx + dc * ly;
  const x2 = x + dc * (lx + w) - dr * (ly + h), y2 = y + dr * (lx + w) + dc * (ly + h);
  const rx = Math.min(x1, x2), ry = Math.min(y1, y2), rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
  if (rad) p.roundRect(rx, ry, rw, rh, rad); else p.rect(rx, ry, rw, rh);
}
function _wtDot(p, x, y, dc, dr, lx, ly, rad) {
  const wx = x + dc * lx - dr * ly, wy = y + dr * lx + dc * ly;
  p.moveTo(wx + rad, wy); p.arc(wx, wy, rad, 0, Math.PI * 2);
}

function _renderWireTerminalBatch(q, from, to) {
  const shadow = new Path2D(), boot = new Path2D(), nut = new Path2D(), nutShade = new Path2D(),
        plate = new Path2D(), shine = new Path2D(), screws = new Path2D();
  const leds = _wtLeds;
  for (let i = from; i < to; i += 5) {
    const x = q[i], y = q[i + 1], dc = q[i + 2], dr = q[i + 3], led = q[i + 4];
    // Kept small — only a touch wider than the 4.2px cable sheath, so it
    // reads as a fitting on the wall rather than a box stuck on the end.
    _wtRect(shadow, x, y, dc, dr, -2.6, -2.2, 5.8, 6, 0.8);                // drop shadow
    // strain-relief boot, tapering onto the cable
    boot.moveTo(x + dc * -3.6 - dr * -2.3, y + dr * -3.6 + dc * -2.3);
    boot.lineTo(x + dc * -1.3 - dr * -2.8, y + dr * -1.3 + dc * -2.8);
    boot.lineTo(x + dc * -1.3 - dr *  2.8, y + dr * -1.3 + dc *  2.8);
    boot.lineTo(x + dc * -3.6 - dr *  2.3, y + dr * -3.6 + dc *  2.3);
    boot.closePath();
    _wtRect(nut, x, y, dc, dr, -1.4, -3, 1.1, 6, 0);                       // gland nut
    _wtRect(nutShade, x, y, dc, dr, -1.4, 1.2, 1.1, 1.8, 0);
    _wtRect(plate, x, y, dc, dr, -0.4, -3.4, 3.4, 6.8, 0.7);               // wall plate straddling the edge
    _wtRect(shine, x, y, dc, dr, -0.1, -3.1, 2.8, 0.6, 0);
    _wtDot(screws, x, y, dc, dr, 1.3, -2.3, 0.5);
    _wtDot(screws, x, y, dc, dr, 1.3,  2.3, 0.5);
    // status LED
    const key = led || '';
    let L = leds.get(key);
    if (!L) { L = { dot: new Path2D(), halo: led ? new Path2D() : null }; leds.set(key, L); }
    _wtDot(L.dot, x, y, dc, dr, 1.3, 0, 0.8);
    if (led) _wtDot(L.halo, x, y, dc, dr, 1.3, 0, 1.8);
  }
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';  ctx.fill(shadow);
  ctx.fillStyle = '#15181b';          ctx.fill(boot);
  ctx.fillStyle = '#7a828a';          ctx.fill(nut);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill(nutShade);
  ctx.fillStyle = '#3c434b';          ctx.fill(plate);
  ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 0.6; ctx.stroke(plate);
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill(shine);
  ctx.fillStyle = '#9aa2aa';          ctx.fill(screws);
  for (const [key, L] of leds) {
    ctx.fillStyle = key || '#2a2e32'; ctx.fill(L.dot);
    if (L.halo) { ctx.globalAlpha = 0.3; ctx.fill(L.halo); ctx.globalAlpha = 1; }
  }
  ctx.restore();
  leds.clear();
}

// A wire's look from its state: core colour, glow, width and LED. One object,
// reused — read what you need before the next call.
const _wireStateOut = { loadPct: 0, core: '', glowRGB: null, coreW: 1.7, ledC: '', faulted: false, stranded: false };
function _wireState(e, t) {
  // State colour of the core
  // Mirrors the stress at which PowerNetwork begins rolling for wire
  // failure. Kept in step with that band — if one moves, move both.
  const WIRE_RISK_STRESS = 0.8;
  const _thr = e._effectiveThreshold || EntityDefs[T.WIRE].throughput;
  const loadPct = Math.min(1, (e.load || 0) / _thr);
  let core, glowRGB = null, coreW = 1.7, ledC;
  // Tripped on overload, or opened by storm / fire damage: red either way,
  // and red first — the info panel reports a fault ahead of OUT OF RANGE,
  // so the cable does too. (.failed alone used to fall through to the
  // dull "dead" copper, or to amber if the span was also out of range.)
  const faulted = !!(e.overloaded || e.failed || e._weatherFailed);
  const stranded = e.outOfRange && !faulted;
  if (faulted) {
    const flicker = 0.6 + 0.4 * Math.sin(t * 18 + e.col * 3.7);
    core = `rgba(255,70,60,${flicker})`; glowRGB = '255,70,60'; coreW = 2.3; ledC = '#ff4444';
  } else if (stranded) {
    const flicker = 0.55 + 0.3 * Math.sin(t * 6 + e.col * 2.1);
    core = `rgba(224,150,30,${flicker})`; ledC = '#e0961e';
  } else if (e.powered) {
    // Colour bands follow the SIM's failure bands (PowerNetwork _applyLoad),
    // not an arbitrary half-way split. A wire at stress <= 0.8 can never
    // fail there, so it has no business looking alarming: the whole safe
    // band stays green and only drifts yellow as it nears 0.8. The old ramp
    // went amber at 0.50 and red at 1.00, which painted provably-safe lines
    // as a warning — a grid sitting at 0.48 with a dozen protectors on it
    // read as a problem the player could do nothing about, because there
    // was no problem.
    let r, g, b;
    if (loadPct < WIRE_RISK_STRESS) {
      // Safe band. Eased so it holds green through the lower half rather
      // than sliding to yellow the moment load is non-trivial.
      const k = Math.pow(loadPct / WIRE_RISK_STRESS, 1.6);
      r = Math.round(k * 235); g = 210; b = Math.round((1 - k) * 120);
      // Deep headroom. Green alone can't tell a lightly loaded wire from a
      // nearly idle one, so once load is under a quarter of capacity the hue
      // drifts to a cool teal. That makes each Surge Protector tier readable:
      // MK1 gets a wire to plain green, MK2/MK3 push it toward teal.
      const HEADROOM_LOAD = 0.25;
      if (loadPct < HEADROOM_LOAD) {
        const h = Math.pow(1 - loadPct / HEADROOM_LOAD, 1.3);
        r = Math.round(r * (1 - h) + 30 * h);
        g = Math.round(g * (1 - h) + 205 * h);
        b = Math.round(b * (1 - h) + 215 * h);
      }
    } else {
      // At-risk band (0.8 -> 1.0): exactly where _applyLoad starts rolling
      // for failure. Orange into red across it, and fully red by 0.95: a
      // linear amber->red over the whole band left a line that was already
      // burning spans out (at 0.85-0.9, say) looking merely yellow.
      const k = Math.min(1, (loadPct - WIRE_RISK_STRESS) / 0.15);
      r = 255; g = Math.round(150 * (1 - k)); b = 0;
    }
    core = `rgb(${r},${g},${b})`; glowRGB = `${r},${g},${b}`; ledC = core;
  } else {
    core = '#7a6048'; ledC = '#3a3a3a';
  }
  const o = _wireStateOut;
  o.loadPct = loadPct; o.core = core; o.glowRGB = glowRGB; o.coreW = coreW;
  o.ledC = ledC; o.faulted = faulted; o.stranded = stranded;
  return o;
}

// A wire with nothing on any side (drawn as a coiled spool) is almost always
// a stray click: it sits on a network of its own and is easy to lose in the
// grass. Mark it with a bright pulsing beacon that keeps the same size on
// screen at any zoom, so it can be found and deleted.
function _loneWireBeacon(cx, cy, t) {
  const z = Math.max(0.05, Camera.zoom || 1), px1 = 1 / z;
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  const R = Math.max(12, 20 * px1);               // ring radius, about 20 px on screen
  ctx.save();
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 2.2);
  g.addColorStop(0, `rgba(255,245,170,${(0.85 + 0.15 * pulse).toFixed(3)})`);
  g.addColorStop(0.35, `rgba(255,200,50,${(0.5 + 0.2 * pulse).toFixed(3)})`);
  g.addColorStop(1, 'rgba(255,170,20,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, R * 2.2, 0, Math.PI * 2); ctx.fill();
  const ringR = R + pulse * 5 * px1;
  ctx.lineWidth = 4 * px1;
  ctx.strokeStyle = 'rgba(20,14,0,0.7)';
  ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 2.5 * px1;
  ctx.strokeStyle = '#fff3a0';
  ctx.beginPath(); ctx.arc(cx, cy, ringR, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}

function renderWire(e, px, py, t) {
    // Wire — an insulated power cable. A dark rubber sheath carries a core
    // whose colour is the wire's state: green→yellow→red with load when
    // energised, a dashed amber when out of range, a red flicker (with
    // sparks at the joint) when overloaded, dull copper when dead. Pulses of
    // current run along live cable, quicker as the load climbs. Straight
    // runs get a cable tie every other tile; corners, ends and branches get
    // a connector box with a status LED; a wire with nothing to connect to
    // is drawn as a coiled spool.
    //
    // All of a tile's segments share one path, so each layer (glow, shadow,
    // sheath, core, pulses) is a single stroke per wire — fewer draw calls
    // than stroking every direction separately. Glow, shadow and pulses are
    // skipped below zoom 0.5, where they're invisible and wires number in
    // the thousands.
    const cx = px + TILE / 2;
    const cy = py + TILE / 2;
    const detail = Camera.zoom > 0.5;

    // If pipe is under this wire: draw wire dimmed, then pipe on top at full opacity
    if (e._underPipe) ctx.save(), ctx.globalAlpha = 0.45;

    const dirs = [
      { dc: 0, dr: -1, sx: cx, sy: py },
      { dc: 0, dr:  1, sx: cx, sy: py + TILE },
      { dc:-1, dr:  0, sx: px,        sy: cy },
      { dc: 1, dr:  0, sx: px + TILE, sy: cy },
    ];
    const segs = [];
    const terminals = [];
    for (const d of dirs) {
      const neighbour = GridManager.getEntity(e.col + d.dc, e.row + d.dr);
      if (!neighbour || _wireSkipsNeighbour(neighbour)) continue;
      if (!_WIRE_NO_TERMINAL.has(neighbour.type)) {
        // Plugged into a building: run on past the footprint edge to where
        // its art actually starts, turning along to it if it isn't straight
        // ahead (see WireReach).
        const rc = WireReach.reach(neighbour, d.sx, d.sy, d.dc, d.dr);
        let t2 = d;
        if (rc.l) {
          const kx = d.sx + d.dc * rc.d, ky = d.sy + d.dr * rc.d, sg = Math.sign(rc.l);
          t2 = { ...d, kx, ky, sx: kx - d.dr * rc.l, sy: ky + d.dc * rc.l, tdc: -d.dr * sg, tdr: d.dc * sg };
        } else if (rc.d) t2 = { ...d, sx: d.sx + d.dc * rc.d, sy: d.sy + d.dr * rc.d };
        segs.push(t2); terminals.push(t2);
      } else segs.push(d);
    }
    const path = new Path2D();
    for (const d of segs) { path.moveTo(d.sx, d.sy); if (d.kx !== undefined) path.lineTo(d.kx, d.ky); path.lineTo(cx, cy); }

    // State colour of the core (shared with the batched wire pass).
    const _st = _wireState(e, t);
    const loadPct = _st.loadPct, core = _st.core, glowRGB = _st.glowRGB, coreW = _st.coreW,
          ledC = _st.ledC, faulted = _st.faulted, stranded = _st.stranded;

    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    if (segs.length) {
      if (glowRGB && detail) {
        ctx.strokeStyle = `rgba(${glowRGB},${(0.13 + 0.05 * Math.sin(t * 4)).toFixed(3)})`;
        ctx.lineWidth = 8; ctx.stroke(path);
      }
      if (detail) {
        ctx.save(); ctx.translate(1.2, 1.8);
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 4.4; ctx.stroke(path);
        ctx.restore();
      }
      ctx.strokeStyle = '#1c2024'; ctx.lineWidth = 4.2; ctx.stroke(path);            // sheath
      if (detail) { ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.save(); ctx.translate(-0.9, -0.9); ctx.stroke(path); ctx.restore(); }
      if (stranded) ctx.setLineDash([4, 3]);
      ctx.strokeStyle = core; ctx.lineWidth = coreW; ctx.stroke(path);             // core
      ctx.setLineDash([]);
      if (e.powered && !e.outOfRange && !faulted && detail) {                       // current pulses
        ctx.setLineDash([2, 10]);
        ctx.lineDashOffset = -(t * (12 + 36 * loadPct));
        ctx.strokeStyle = `rgba(255,255,255,${(0.45 + 0.35 * loadPct).toFixed(3)})`;
        ctx.lineWidth = 1.1; ctx.stroke(path);
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
      }
    }

    // Joint detail
    const arms = segs.length;
    const straight = arms === 2 && ((segs[0].dc === 0) === (segs[1].dc === 0));
    if (!arms) {
      // coiled spool of cable
      ctx.fillStyle = '#1c2024'; ctx.beginPath(); ctx.arc(cx, cy, 6.5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = core; ctx.lineWidth = 1.3;
      for (const r of [4.6, 2.6]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0.3, Math.PI * 1.85); ctx.stroke(); }
      ctx.fillStyle = '#5a5e62'; ctx.beginPath(); ctx.arc(cx, cy, 1, 0, Math.PI * 2); ctx.fill();
      _loneWireBeacon(cx, cy, t);
    } else if (straight) {
      if (detail && ((e.col + e.row) % 2 === 0)) {                                   // cable tie
        ctx.fillStyle = '#3c4148';
        if (segs[0].dc === 0) ctx.fillRect(cx - 3.2, cy - 1, 6.4, 2); else ctx.fillRect(cx - 1, cy - 3.2, 2, 6.4);
      }
    } else {
      // connector box with a status LED
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(cx - 3.8, cy - 3.2, 9, 9, 1.8); ctx.fill();
      ctx.fillStyle = '#2c3138'; ctx.beginPath(); ctx.roundRect(cx - 4.5, cy - 4.5, 9, 9, 1.8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 0.8; ctx.stroke();
      if ((e.powered || e.outOfRange || faulted) && detail) {
        ctx.fillStyle = faulted ? 'rgba(255,70,60,0.35)' : 'rgba(255,255,255,0.12)';
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = ledC; ctx.beginPath(); ctx.arc(cx, cy, 1.8, 0, Math.PI * 2); ctx.fill();
    }

    // Overload sparks at the joint
    if (faulted && detail && Math.sin(t * 21 + e.col) * Math.sin(t * 33 + e.row) > 0) {
      ctx.strokeStyle = 'rgba(255,230,150,0.95)'; ctx.lineWidth = 0.8; ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = t * 11 + k * 1.57 + e.col;
        ctx.moveTo(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3);
        ctx.lineTo(cx + Math.cos(a + 0.3) * 7, cy + Math.sin(a + 0.3) * 7);
      }
      ctx.stroke();
    }
    ctx.restore();

    // Where the cable meets a building, queue a socket for _renderWireTerminals
    // — it has to paint after the building pass or the building covers it.
    if (Camera.zoom > 0.35) {
      const lit = faulted || (!!e.powered && !e.outOfRange);
      for (const d of terminals) _wireTerminals.push(d.sx, d.sy, d.tdc ?? d.dc, d.tdr ?? d.dr, lit ? ledC : null);
    }

    // Network highlight — brighten all wires on hovered network
    if (_wireHighlightNetId >= 0 && e.networkId === _wireHighlightNetId && segs.length) {
      ctx.save();
      ctx.globalAlpha = 0.28 + 0.08 * Math.sin(t * 4);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 6;
      ctx.lineCap     = 'round';
      ctx.stroke(path);
      ctx.restore();
    }

    // Restore alpha and draw pipe on top at full opacity
    if (e._underPipe) {
      ctx.restore();
      const pipe = e._underPipe;
      pipe.col = e.col; pipe.row = e.row;
      renderPipe(pipe, px, py, t);
    }
  }

// ── Batched wire pass ───────────────────────────────────────────
// The main loop's wire pass. Draws exactly what renderWire draws, but a block
// of tiles at a time: every wire in the block shares one path per layer
// (shadow, sheath, highlight) and one per state (glow, core, pulses), so a
// block costs a handful of strokes instead of six per wire. Measured on a
// built-up city, wires were over a third of the whole frame — nearly all of
// it the per-call cost of ~1,100 tiny strokes, not the pixels they covered.
//
// Blocks rather than one path for the whole screen: a single path spanning
// the view is rasterised as one screen-sized shape, which is slower than the
// calls it replaces. Blocks are aligned to the world, so nothing shifts as
// the camera pans.
//
// A wire with a pipe laid over it (drawn dimmed, pipe on top) still goes
// through renderWire, after the blocks.
const _WP_DC = [0, 0, -1, 1], _WP_DR = [-1, 1, 0, 0];
const _wpGroups = new Map();     // state key -> { path, core, ... } for the block being built
const _wpSlow = [];              // [e, px, py, ...] wires left to renderWire
const _wpSpools = [];            // [cx, cy, core, ...] wires with nothing to connect to
const _wpWeather = [];           // [e, px, py, ...] storm-failed wires, for renderWireSpark
const _wpEnd = new Float64Array(8);   // this tile's arm end points: N, S, W, E as x,y pairs

function renderWirePass(cStart, cEnd, rStart, rEnd, t) {
  _wireTerminals.length = 0;
  _wpSlow.length = 0;
  const zoom = Camera.zoom;
  const detail = zoom > 0.5, sockets = zoom > 0.35;
  // About 500 screen px a side, whatever the zoom (measured: bigger blocks
  // are cheaper still, up to roughly this size).
  let B = 4;
  while (B < 64 && B * TILE * zoom < 500) B *= 2;
  const bc0 = Math.floor(cStart / B) * B, br0 = Math.floor(rStart / B) * B;
  for (let br = br0; br < rEnd; br += B) {
    for (let bc = bc0; bc < cEnd; bc += B) {
      _renderWireBlock(Math.max(bc, cStart), Math.min(bc + B, cEnd),
                       Math.max(br, rStart), Math.min(br + B, rEnd), t, detail, sockets);
    }
  }
  for (let i = 0; i < _wpSlow.length; i += 3) {
    const e = _wpSlow[i];
    renderWire(e, _wpSlow[i + 1], _wpSlow[i + 2], t);
    if (e._weatherFailed) renderWireSpark(e, _wpSlow[i + 1], _wpSlow[i + 2], t);
  }
  _wpSlow.length = 0;
}

function _renderWireBlock(c0, c1, r0, r1, t, detail, sockets) {
  const groups = _wpGroups;
  const hiNet = _wireHighlightNetId;
  const baseThr = EntityDefs[T.WIRE].throughput;
  const half = TILE / 2;
  let all = null, hi = null, boxSh = null, box = null, haloHot = null, haloLit = null, ties = null, sparks = null;
  _wpSpools.length = 0; _wpWeather.length = 0;

  for (let r = r0; r < r1; r++) {
    for (let c = c0; c < c1; c++) {
      const e = GridManager.getEntity(c, r);
      if (!e || e.type !== T.WIRE) continue;
      const px = c * TILE, py = r * TILE;
      if (e._underWater) renderWater(e._underWater, px, py, t);
      if (e._underPipe) { _wpSlow.push(e, px, py); continue; }
      if (e._weatherFailed) _wpWeather.push(e, px, py);
      const cx = px + half, cy = py + half;

      // Wires that look the same share a group. The flickers are keyed off
      // the column, so faulted / stranded wires group per column.
      const faulted = !!(e.overloaded || e.failed || e._weatherFailed);
      const key = faulted ? 'f' + e.col
                : e.outOfRange ? 's' + e.col
                : e.powered ? Math.min(1, (e.load || 0) / (e._effectiveThreshold || baseThr))
                : 'd';
      let g = groups.get(key);
      if (!g) {
        const s = _wireState(e, t);
        g = { path: new Path2D(), core: s.core, glowRGB: s.glowRGB, coreW: s.coreW, ledC: s.ledC,
              stranded: s.stranded, pulse: !!e.powered && !e.outOfRange && !faulted,
              pulsePath: null, loadPct: s.loadPct, led: null };
        groups.set(key, g);
      }
      if (!all) all = new Path2D();
      const isHi = hiNet >= 0 && e.networkId === hiNet;
      const lit = faulted || (!!e.powered && !e.outOfRange);

      // Arms are collected first so a wire running straight through the tile
      // goes into the shared paths as ONE segment, not two halves meeting at
      // the centre — same pixels, half the geometry to stroke on every layer.
      // The current pulses keep the halves (each dash pattern starts at the
      // tile edge and runs to the centre).
      const pp = (detail && g.pulse) ? (g.pulsePath || (g.pulsePath = new Path2D())) : null;
      let arms = 0, vert = 0, mask = 0;
      for (let i = 0; i < 4; i++) {
        const dc = _WP_DC[i], dr = _WP_DR[i];
        const n = GridManager.getEntity(c + dc, r + dr);
        if (!n || _wireSkipsNeighbour(n)) continue;
        let sx = i < 2 ? cx : (i === 2 ? px : px + TILE);
        let sy = i === 0 ? py : (i === 1 ? py + TILE : cy);
        if (!_WIRE_NO_TERMINAL.has(n.type)) {
          // Plugged into a building: run on to where its art starts, turning
          // along to it if it isn't straight ahead (WireReach). The turned
          // leg is its own segment; the arm itself ends at the turn.
          const rc = WireReach.reach(n, sx, sy, dc, dr);
          sx += dc * rc.d; sy += dr * rc.d;
          if (rc.l) {
            const ex = sx - dr * rc.l, ey = sy + dc * rc.l, sg = Math.sign(rc.l);
            all = all || new Path2D();
            all.moveTo(sx, sy); all.lineTo(ex, ey); g.path.moveTo(sx, sy); g.path.lineTo(ex, ey);
            if (pp) { pp.moveTo(sx, sy); pp.lineTo(ex, ey); }
            if (isHi) { if (!hi) hi = new Path2D(); hi.moveTo(sx, sy); hi.lineTo(ex, ey); }
            if (sockets) _wireTerminals.push(ex, ey, -dr * sg, dc * sg, lit ? g.ledC : null);
          } else if (sockets) _wireTerminals.push(sx, sy, dc, dr, lit ? g.ledC : null);
        }
        _wpEnd[i * 2] = sx; _wpEnd[i * 2 + 1] = sy;
        mask |= 1 << i;
        if (pp) { pp.moveTo(sx, sy); pp.lineTo(cx, cy); }
        if (isHi) { if (!hi) hi = new Path2D(); hi.moveTo(sx, sy); hi.lineTo(cx, cy); }
        arms++; if (i < 2) vert++;
      }
      const E = _wpEnd, gp = g.path;
      if ((mask & 3) === 3) { all.moveTo(E[0], E[1]); all.lineTo(E[2], E[3]); gp.moveTo(E[0], E[1]); gp.lineTo(E[2], E[3]); }
      else if (mask & 1)    { all.moveTo(E[0], E[1]); all.lineTo(cx, cy);     gp.moveTo(E[0], E[1]); gp.lineTo(cx, cy); }
      else if (mask & 2)    { all.moveTo(E[2], E[3]); all.lineTo(cx, cy);     gp.moveTo(E[2], E[3]); gp.lineTo(cx, cy); }
      if ((mask & 12) === 12) { all.moveTo(E[4], E[5]); all.lineTo(E[6], E[7]); gp.moveTo(E[4], E[5]); gp.lineTo(E[6], E[7]); }
      else if (mask & 4)      { all.moveTo(E[4], E[5]); all.lineTo(cx, cy);     gp.moveTo(E[4], E[5]); gp.lineTo(cx, cy); }
      else if (mask & 8)      { all.moveTo(E[6], E[7]); all.lineTo(cx, cy);     gp.moveTo(E[6], E[7]); gp.lineTo(cx, cy); }

      // Joint detail
      if (!arms) {
        _wpSpools.push(cx, cy, g.core);
      } else if (arms === 2 && vert !== 1) {
        if (detail && ((e.col + e.row) % 2 === 0)) {                               // cable tie
          if (!ties) ties = new Path2D();
          if (vert === 2) ties.rect(cx - 3.2, cy - 1, 6.4, 2); else ties.rect(cx - 1, cy - 3.2, 2, 6.4);
        }
      } else {
        // connector box with a status LED
        if (!box) { box = new Path2D(); boxSh = new Path2D(); }
        boxSh.roundRect(cx - 3.8, cy - 3.2, 9, 9, 1.8);
        box.roundRect(cx - 4.5, cy - 4.5, 9, 9, 1.8);
        if ((e.powered || e.outOfRange || faulted) && detail) {
          if (faulted) { if (!haloHot) haloHot = new Path2D(); haloHot.moveTo(cx + 4, cy); haloHot.arc(cx, cy, 4, 0, Math.PI * 2); }
          else         { if (!haloLit) haloLit = new Path2D(); haloLit.moveTo(cx + 4, cy); haloLit.arc(cx, cy, 4, 0, Math.PI * 2); }
        }
        if (!g.led) g.led = new Path2D();
        g.led.moveTo(cx + 1.8, cy); g.led.arc(cx, cy, 1.8, 0, Math.PI * 2);
      }

      // Overload sparks at the joint
      if (faulted && detail && Math.sin(t * 21 + e.col) * Math.sin(t * 33 + e.row) > 0) {
        if (!sparks) sparks = new Path2D();
        for (let k = 0; k < 4; k++) {
          const a = t * 11 + k * 1.57 + e.col;
          sparks.moveTo(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3);
          sparks.lineTo(cx + Math.cos(a + 0.3) * 7, cy + Math.sin(a + 0.3) * 7);
        }
      }
    }
  }
  if (!all) return;

  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (detail) {
    const ga = (0.13 + 0.05 * Math.sin(t * 4)).toFixed(3);
    ctx.lineWidth = 8;
    for (const g of groups.values()) {
      if (!g.glowRGB) continue;
      ctx.strokeStyle = `rgba(${g.glowRGB},${ga})`; ctx.stroke(g.path);
    }
    ctx.save(); ctx.translate(1.2, 1.8);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 4.4; ctx.stroke(all);
    ctx.restore();
  }
  ctx.strokeStyle = '#1c2024'; ctx.lineWidth = 4.2; ctx.stroke(all);                // sheath
  if (detail) { ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.save(); ctx.translate(-0.9, -0.9); ctx.stroke(all); ctx.restore(); }
  for (const g of groups.values()) {                                                // core
    if (g.stranded) ctx.setLineDash([4, 3]);
    ctx.strokeStyle = g.core; ctx.lineWidth = g.coreW; ctx.stroke(g.path);
    if (g.stranded) ctx.setLineDash([]);
  }
  if (detail) {                                                                     // current pulses
    let dashed = false;
    for (const g of groups.values()) {
      if (!g.pulsePath) continue;
      if (!dashed) { ctx.setLineDash([2, 10]); ctx.lineWidth = 1.1; dashed = true; }
      ctx.lineDashOffset = -(t * (12 + 36 * g.loadPct));
      ctx.strokeStyle = `rgba(255,255,255,${(0.45 + 0.35 * g.loadPct).toFixed(3)})`;
      ctx.stroke(g.pulsePath);
    }
    if (dashed) { ctx.setLineDash([]); ctx.lineDashOffset = 0; }
  }

  // Joints
  for (let i = 0; i < _wpSpools.length; i += 3) _loneWireBeacon(_wpSpools[i], _wpSpools[i + 1], t);
  for (let i = 0; i < _wpSpools.length; i += 3) {                                   // coiled spool of cable
    const cx = _wpSpools[i], cy = _wpSpools[i + 1];
    ctx.fillStyle = '#1c2024'; ctx.beginPath(); ctx.arc(cx, cy, 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = _wpSpools[i + 2]; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(cx, cy, 4.6, 0.3, Math.PI * 1.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, 2.6, 0.3, Math.PI * 1.85); ctx.stroke();
    ctx.fillStyle = '#5a5e62'; ctx.beginPath(); ctx.arc(cx, cy, 1, 0, Math.PI * 2); ctx.fill();
  }
  if (ties) { ctx.fillStyle = '#3c4148'; ctx.fill(ties); }
  if (box) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill(boxSh);
    ctx.fillStyle = '#2c3138'; ctx.fill(box);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 0.8; ctx.stroke(box);
    if (haloHot) { ctx.fillStyle = 'rgba(255,70,60,0.35)'; ctx.fill(haloHot); }
    if (haloLit) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill(haloLit); }
    for (const g of groups.values()) if (g.led) { ctx.fillStyle = g.ledC; ctx.fill(g.led); }
  }
  if (sparks) { ctx.strokeStyle = 'rgba(255,230,150,0.95)'; ctx.lineWidth = 0.8; ctx.stroke(sparks); }
  ctx.restore();
  groups.clear();

  // Network highlight — brighten all wires on the hovered network
  if (hi) {
    ctx.save();
    ctx.globalAlpha = 0.28 + 0.08 * Math.sin(t * 4);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 6;
    ctx.lineCap     = 'round';
    ctx.stroke(hi);
    ctx.restore();
  }
  for (let i = 0; i < _wpWeather.length; i += 3) renderWireSpark(_wpWeather[i], _wpWeather[i + 1], _wpWeather[i + 2], t);
}

// Draws the same pulsing-white network highlight used on wires, but as
  // an outline around a generator's full footprint. Called from each
  // generator render function; only draws when this entity's networkId
  // matches whichever wire network is currently hovered.
  function drawNetworkHighlight(e, px, py, t) {
    if (_wireHighlightNetId < 0 || e.networkId !== _wireHighlightNetId) return;
    const w = (e.width  || 1) * TILE;
    const h = (e.height || 1) * TILE;
    ctx.save();
    ctx.globalAlpha = 0.28 + 0.08 * Math.sin(t * 4);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.strokeRect(px + 1.5, py + 1.5, w - 3, h - 3);
    ctx.restore();
  }

// One fixed-tilt PV module seen from above: ground shadow and rear legs,
// silver frame, a cell grid with busbars, and a sky sheen that brightens
// with output. Shared by the MK1 and MK2 so the tiers read as one family.
function _drawPvModule(x, y, w, h, cols, rows, lvl, t, fine, dust = 0) {
  const lit = lvl > 0.05;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(x + 3, y + 4, w, h);
  ctx.fillStyle = '#4a5258';                                   // rear legs
  ctx.fillRect(x + w * 0.15, y + h - 1, 2, 4);
  ctx.fillRect(x + w * 0.85 - 2, y + h - 1, 2, 4);
  ctx.fillStyle = '#9aa4ac'; ctx.fillRect(x, y, w, h);         // frame
  ctx.fillStyle = '#c4ccd2'; ctx.fillRect(x, y, w, 1);
  const ix = x + 1.5, iy = y + 1.5, iw = w - 3, ih = h - 3;
  const g = ctx.createLinearGradient(0, iy, 0, iy + ih);
  g.addColorStop(0, lit ? '#1f5fae' : '#142a4a');
  g.addColorStop(1, lit ? '#0a2148' : '#08142a');
  ctx.fillStyle = g; ctx.fillRect(ix, iy, iw, ih);
  const cw = iw / cols, ch = ih / rows;
  if (lit) {
    // Cells shimmer faintly, each a step out of phase with its neighbour.
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      const a = 0.08 + 0.22 * lvl * (0.75 + 0.25 * Math.sin(t * 1.6 + c * 0.7 + r * 1.3));
      ctx.fillStyle = `rgba(110,190,255,${a})`;
      ctx.fillRect(ix + c * cw + 0.6, iy + r * ch + 0.6, cw - 1.2, ch - 1.2);
    }
  }
  ctx.strokeStyle = '#04101e'; ctx.lineWidth = 0.7;            // cell gaps
  ctx.beginPath();
  for (let c = 1; c < cols; c++) { ctx.moveTo(ix + c * cw, iy); ctx.lineTo(ix + c * cw, iy + ih); }
  for (let r = 1; r < rows; r++) { ctx.moveTo(ix, iy + r * ch); ctx.lineTo(ix + iw, iy + r * ch); }
  ctx.stroke();
  if (fine) {
    ctx.strokeStyle = lit ? 'rgba(220,228,236,0.35)' : 'rgba(170,180,190,0.15)'; ctx.lineWidth = 0.35;
    ctx.beginPath();
    for (let r = 0; r < rows; r++) for (const f of [0.35, 0.65]) {
      const yy = iy + r * ch + ch * f; ctx.moveTo(ix, yy); ctx.lineTo(ix + iw, yy);
    }
    ctx.stroke();
    const sh = ctx.createLinearGradient(ix, iy, ix + iw * 0.5, iy + ih);
    sh.addColorStop(0, `rgba(200,235,255,${lit ? 0.12 + 0.12 * lvl : 0.05})`);
    sh.addColorStop(1, 'rgba(200,235,255,0)');
    ctx.fillStyle = sh; ctx.fillRect(ix, iy, iw, ih);
  }
  // A dust storm's film (e.dust, power_network.js): a sandy wash over the
  // glass, heavier toward the lower edge where it drifts, and specks of grit.
  if (dust > 0.01) {
    const dg = ctx.createLinearGradient(0, iy, 0, iy + ih);
    dg.addColorStop(0, `rgba(176,140,90,${(0.35 * dust).toFixed(3)})`);
    dg.addColorStop(1, `rgba(170,128,76,${(0.6 * dust).toFixed(3)})`);
    ctx.fillStyle = dg; ctx.fillRect(ix, iy, iw, ih);
    if (fine) {
      ctx.fillStyle = `rgba(206,172,120,${(0.7 * dust).toFixed(3)})`;
      for (let k = 0; k < Math.round(cols * rows * 1.5 * dust); k++) {
        const hx = Math.sin(k * 12.9898 + x * 0.37) * 43758.5453, hy = Math.sin(k * 78.233 + y * 0.53) * 24634.6345;
        ctx.fillRect(ix + (hx - Math.floor(hx)) * (iw - 1), iy + (hy - Math.floor(hy)) * (ih - 1), 0.8, 0.8);
      }
    }
  }
}

function _drawSolarReadout(e, cx, y, lvl, size) {
  if (lvl <= 0.01) return;
  ctx.font      = `${size}px Courier New`;
  ctx.fillStyle = 'rgba(128,200,255,0.85)';
  ctx.textAlign = 'center';
  ctx.fillText(`${formatPower(e.def.powerOutput, 1)}`, cx, y);
  ctx.textAlign = 'left';
}

function renderSolar(e, px, py, t) {
    // 2×1: a single landscape module on a ground rack, junction box and
    // a short DC lead running off its east end.
    const W   = TILE * 2, H = TILE * 1;
    const lvl = e.def.peakOutput > 0 ? Math.min(1, e.def.powerOutput / e.def.peakOutput) : 0;
    const fine = Camera.zoom > 0.45;

    ctx.fillStyle = 'rgba(70,80,50,0.25)';                      // trampled pad
    ctx.fillRect(px + 2, py + 3, W - 4, H - 6);
    const mx = px + 5, my = py + 6, mw = W - 16, mh = H - 14;
    _drawPvModule(mx, my, mw, mh, 6, 3, lvl, t, fine, e.dust || 0);

    // Junction box + cable stub off the right edge.
    ctx.fillStyle = '#1d2226'; ctx.fillRect(mx + mw + 1, py + H / 2 - 3, 5, 6);
    ctx.fillStyle = lvl > 0.05 ? '#5fd07a' : '#3a4a40';
    ctx.fillRect(mx + mw + 2.5, py + H / 2 - 1.5, 2, 1.2);
    ctx.fillStyle = '#c86a20'; ctx.fillRect(mx + mw + 6, py + H / 2 + 1, 3, 1);

    _drawSolarReadout(e, px + W / 2, py + 5, lvl, 6);
    drawNetworkHighlight(e, px, py, t);
  }

// renderBattery moved to new Battery Block renderer below


  /* ── Substations ──────────────────────────────────────────────────────
     Both tiers draw the same yard and differ only in scale and equipment
     count, so a MK2 reads as "more substation" rather than an unrelated
     building. Top-down, matching the rest of the grid art:

       · fenced gravel pad with a hazard-striped access strip
       · transformer tanks with radiator fins down each flank, the oil
         level standing in for state of charge — the tank fills as it banks
       · three-phase bushings on the tank lids, stems up to a busbar that
         brightens with charge and arcs while actively charging
       · MK2 adds a second tank, a control cabinet, and forced-air cooling
         fans that spin faster the harder the bank is working

     The old sprite was a rounded box, two outline circles and a lightning
     bolt — near-identical between tiers apart from a slightly taller bolt
     — so a developed grid read as a field of blue boxes. Everything here
     is driven off `pct` and `e.charging`, so the sprite now shows at a
     glance what previously took a click on the building to find out.
     ─────────────────────────────────────────────────────────────────── */
  function drawSubstationYard(e, px, py, t, cfg) {
    const W    = TILE * cfg.tiles;
    const cx   = px + W / 2, cy = py + W / 2;
    const pct  = e.def.capacity > 0
               ? Math.max(0, Math.min(1, e.charge / e.def.capacity)) : 0;
    const hot  = pct > 0.05;
    const zoom = Camera.zoom;
    // LOD, in the same spirit as the rest of this file: a developed city
    // can hold dozens of these, and the fins/fence/gravel are invisible
    // long before they stop costing draw calls.
    const detail = zoom > 0.6;    // fins, fence, gravel, ribs, hazard stripe
    const mid    = zoom > 0.42;   // bushings, busbar, fans

    const A    = cfg.accent;
    const acc  = (a) => `rgba(${A[0]},${A[1]},${A[2]},${a})`;
    const live = (a) => hot ? acc(a) : cfg.dim;

    // Outer glow when charged
    if (hot && zoom > 0.5) {
      drawGlowHalo(cx, cy, W * cfg.haloScale, [[0, cfg.haloColor], [1, 'transparent']],
                   pct * cfg.haloAlpha + 0.05 * Math.sin(t * 2));
    }

    // ── Pad ──
    const pad = W * 0.055;
    drawRoundRect(px + pad, py + pad, W - pad * 2, W - pad * 2, W * 0.06,
                  cfg.padFill, live(0.5 + 0.3 * pct), cfg.tiles === 2 ? 2 : 2.5);

    // Gravel. Seeded off the tile so it is stable frame to frame — a
    // Math.random() here would make every pad crawl.
    if (detail) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      let seed = ((e.col * 73856093) ^ (e.row * 19349663)) & 0x7fffffff;
      const span = W - pad * 2 - 4;
      for (let i = 0; i < cfg.tiles * 8; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const gx = px + pad + 2 + (seed % 997) / 997 * span;
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const gy = py + pad + 2 + (seed % 997) / 997 * span;
        ctx.fillRect(gx, gy, 1, 1);
      }
    }

    // ── Perimeter fence ──
    const fi = pad + W * 0.035;
    if (detail) {
      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = hot ? acc(0.26) : 'rgba(120,140,170,0.2)';
      ctx.lineWidth   = 1;
      ctx.strokeRect(px + fi, py + fi, W - fi * 2, W - fi * 2);
      ctx.restore();
      ctx.fillStyle = hot ? acc(0.45) : 'rgba(130,150,180,0.35)';
      const ps = Math.max(1.5, W * 0.022);
      for (const corner of [[px + fi, py + fi], [px + W - fi, py + fi],
                            [px + fi, py + W - fi], [px + W - fi, py + W - fi]]) {
        ctx.fillRect(corner[0] - ps / 2, corner[1] - ps / 2, ps, ps);
      }
    }

    // ── Transformer tanks ──
    const tankTop = py + W * 0.37;
    const tankH   = W * 0.33;
    const tankW   = cfg.tanks === 1 ? W * 0.46 : W * 0.30;
    const gap     = W * 0.09;
    const totalW  = cfg.tanks * tankW + (cfg.tanks - 1) * gap;
    const tanks   = [];
    for (let i = 0; i < cfg.tanks; i++) tanks.push(cx - totalW / 2 + i * (tankW + gap));

    for (const tx of tanks) {
      drawRoundRect(tx, tankTop, tankW, tankH, W * 0.02, '#0a1526', live(0.55), 1.5);

      // Oil level == state of charge. This is the point of the redesign:
      // the charge bar used to be a strip bolted to the bottom of the box,
      // which told you nothing about what the building actually was.
      const fillH = (tankH - 3) * pct;
      if (fillH > 0.5) {
        const pulse = e.charging ? 0.75 + 0.25 * Math.sin(t * 8) : 1;
        const top   = tankTop + tankH - 1.5 - fillH;
        const og    = ctx.createLinearGradient(0, top, 0, top + fillH);
        og.addColorStop(0, acc(0.5 * pulse));
        og.addColorStop(1, acc(0.26 * pulse));
        ctx.fillStyle = og;
        ctx.fillRect(tx + 1.5, top, tankW - 3, fillH);
        ctx.fillStyle = acc(0.9 * pulse);   // meniscus
        ctx.fillRect(tx + 1.5, top, tankW - 3, 1.2);
      }

      // Radiator fins down both flanks
      if (detail) {
        ctx.strokeStyle = live(0.5);
        ctx.lineWidth   = 1.2;
        ctx.beginPath();
        const finN = cfg.tiles === 2 ? 5 : 7;
        for (let i = 1; i <= finN; i++) {
          const fy = tankTop + (tankH / (finN + 1)) * i;
          ctx.moveTo(tx - W * 0.042, fy);   ctx.lineTo(tx, fy);
          ctx.moveTo(tx + tankW, fy);       ctx.lineTo(tx + tankW + W * 0.042, fy);
        }
        ctx.stroke();
      }

      ctx.fillStyle = live(0.22);           // lid
      ctx.fillRect(tx, tankTop - 1.5, tankW, 2.5);
    }

    // ── Bushings + busbar ──
    const busY = py + W * 0.27;
    if (mid) {
      const br = Math.max(1.4, W * 0.026);
      const posts = [];
      for (const tx of tanks) for (let i = 0; i < 3; i++) posts.push(tx + tankW * (0.22 + 0.28 * i));

      ctx.strokeStyle = live(0.5);
      ctx.lineWidth   = Math.max(1, W * 0.012);
      ctx.beginPath();
      ctx.moveTo(posts[0], busY); ctx.lineTo(posts[posts.length - 1], busY);
      ctx.stroke();

      for (const bxp of posts) {
        ctx.strokeStyle = live(0.5);
        ctx.beginPath(); ctx.moveTo(bxp, busY); ctx.lineTo(bxp, tankTop - 1); ctx.stroke();
        if (detail) {                        // insulator ribs
          ctx.strokeStyle = live(0.3);
          ctx.lineWidth   = 1;
          for (let k = 1; k <= 2; k++) {
            const ry = busY + (tankTop - busY) * (k / 3);
            ctx.beginPath(); ctx.moveTo(bxp - br, ry); ctx.lineTo(bxp + br, ry); ctx.stroke();
          }
          ctx.lineWidth = Math.max(1, W * 0.012);
        }
        ctx.fillStyle = hot ? acc(0.5 + 0.45 * pct) : cfg.dim;
        ctx.beginPath(); ctx.arc(bxp, busY, br, 0, Math.PI * 2); ctx.fill();
      }

      // Arc across the bus while actively banking surplus
      if (e.charging && pct > 0.02 && detail) {
        const a0 = posts[0], a1 = posts[posts.length - 1];
        ctx.strokeStyle = 'rgba(190,235,255,' + (0.3 + 0.4 * Math.abs(Math.sin(t * 14))) + ')';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(a0, busY);
        for (let i = 1; i <= 6; i++) {
          const f = i / 6;
          ctx.lineTo(a0 + (a1 - a0) * f,
                     busY + Math.sin(t * 22 + i * 2.1) * W * 0.018 * (1 - Math.abs(f - 0.5) * 2));
        }
        ctx.stroke();
      }
    }

    // ── Forced-air cooling (MK2) ──
    if (cfg.fans && mid) {
      const fy   = py + W * 0.80;
      const fr   = W * 0.055;
      // Spins off how full it is, faster again while charging, so a bank
      // under load is visibly working from across the map.
      const spin = t * (0.6 + 3.4 * pct) * (e.charging ? 1.6 : 1);
      for (const fx of [cx - W * 0.20, cx + W * 0.20]) {
        ctx.strokeStyle = live(0.4); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(fx, fy, fr, 0, Math.PI * 2); ctx.stroke();
        ctx.save();
        ctx.translate(fx, fy); ctx.rotate(spin);
        ctx.strokeStyle = hot ? acc(0.55) : cfg.dim; ctx.lineWidth = 1.6;
        for (let b = 0; b < 3; b++) {
          ctx.rotate((Math.PI * 2) / 3);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(fr * 0.8, fr * 0.35); ctx.stroke();
        }
        ctx.restore();
      }
    }

    // ── Control cabinet (MK2) ──
    if (cfg.cabinet && mid) {
      const cw = W * 0.12, ch = W * 0.095, cyy = py + W * 0.80 - ch / 2;
      drawRoundRect(cx - cw / 2, cyy, cw, ch, 1.5, '#0a1526', live(0.4), 1);
      ctx.fillStyle = hot ? acc(0.5 + 0.5 * Math.abs(Math.sin(t * 3))) : 'rgba(120,140,170,0.3)';
      ctx.fillRect(cx - cw / 2 + 2, cyy + 2, 1.8, 1.8);
    }

    // ── Hazard-striped access strip along the near edge ──
    if (detail) {
      const hh  = W * 0.035;
      const hy  = py + W - pad - hh - W * 0.02;
      const hx0 = px + pad + W * 0.06, hw = W - pad * 2 - W * 0.12;
      ctx.save();
      ctx.beginPath(); ctx.rect(hx0, hy, hw, hh); ctx.clip();
      ctx.strokeStyle = hot ? 'rgba(230,180,60,0.32)' : 'rgba(150,140,110,0.16)';
      ctx.lineWidth   = 2;
      for (let sx = hx0 - hh; sx < hx0 + hw + hh; sx += 5) {
        ctx.beginPath(); ctx.moveTo(sx, hy + hh); ctx.lineTo(sx + hh, hy); ctx.stroke();
      }
      ctx.restore();
    }

    // ── Stencilled labels ──
    ctx.textAlign = 'center';
    if (cfg.label) {
      ctx.font      = 'bold 7px Courier New';
      ctx.fillStyle = hot ? acc(0.6 + 0.3 * pct) : 'rgba(120,150,190,0.45)';
      ctx.fillText(cfg.label, cx, py + W * 0.125);
    }
    ctx.font      = (cfg.tiles === 2 ? 8 : 9) + 'px Courier New';
    ctx.fillStyle = hot ? acc(0.7 + 0.3 * pct) : 'rgba(120,150,190,0.5)';
    ctx.fillText(Math.round(pct * 100) + '%', cx, py + W * (cfg.label ? 0.22 : 0.17));
    ctx.textAlign = 'left';
  }

  function renderSubstation(e, px, py, t) {
    // Only render from anchor tile
    if (e.col * TILE !== px || e.row * TILE !== py) return;
    drawSubstationYard(e, px, py, t, {
      tiles: 2, tanks: 1, fans: false, cabinet: false, label: null,
      accent: [64, 160, 255], dim: 'rgba(128,146,170,0.7)', padFill: '#060e18',
      haloColor: '#40a0ff', haloScale: 0.80, haloAlpha: 0.25,
    });
  }

function renderSubstation2(e, px, py, t) {
    if (e.col * TILE !== px || e.row * TILE !== py) return;
    drawSubstationYard(e, px, py, t, {
      tiles: 3, tanks: 2, fans: true, cabinet: true, label: 'MK2',
      accent: [90, 190, 255], dim: 'rgba(138,158,186,0.75)', padFill: '#070e20',
      haloColor: '#60c0ff', haloScale: 0.85, haloAlpha: 0.30,
    });
  }

/* Substation MK3 — a 4×4 grid-scale storage yard. Where MK1/MK2 are oil
   transformer yards, MK3 is built around a superconducting magnetic storage
   ring: a cryostat torus whose coil windings rotate faster with charge and
   a core that brightens as it banks. Four capacitor banks sit in the
   corners (cell stacks light up bottom-to-top with charge) and feed the
   ring through conduits whose pulses run inward while charging and outward
   while discharging, so the direction of flow reads from across the map. */
function renderSubstation3(e, px, py, t) {
    if (e.col * TILE !== px || e.row * TILE !== py) return;
    const W    = TILE * 4;
    const cx   = px + W / 2, cy = py + W / 2;
    const pct  = e.def.capacity > 0 ? Math.max(0, Math.min(1, e.charge / e.def.capacity)) : 0;
    const hot  = pct > 0.05;
    const zoom = Camera.zoom;
    const detail = zoom > 0.6;
    const mid    = zoom > 0.42;
    const charging    = !!e.charging && e.powered;
    const discharging = e.powered && !e.charging && pct > 0.02 && pct < 0.99;
    const acc  = (a) => `rgba(128,224,255,${a})`;
    const vio  = (a) => `rgba(170,140,255,${a})`;
    const dim  = 'rgba(140,160,190,0.7)';
    const live = (a) => hot ? acc(a) : dim;

    if (hot && zoom > 0.5) {
      drawGlowHalo(cx, cy, W * 0.8, [[0, '#80e0ff'], [0.55, 'rgba(140,110,255,0.35)'], [1, 'transparent']],
                   pct * 0.32 + 0.05 * Math.sin(t * 1.7));
    }

    // ── Pad: double-walled plinth ──
    const pad = W * 0.045;
    drawRoundRect(px + pad, py + pad, W - pad * 2, W - pad * 2, W * 0.05, '#050a1c', live(0.55 + 0.3 * pct), 3);
    if (detail) {
      drawRoundRect(px + pad + 5, py + pad + 5, W - pad * 2 - 10, W - pad * 2 - 10, W * 0.04, null,
                    hot ? vio(0.18 + 0.12 * pct) : 'rgba(120,140,170,0.15)', 1);
      // Floor grid plates
      ctx.strokeStyle = 'rgba(255,255,255,0.035)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 8; i++) {
        const g = px + pad + (W - pad * 2) * i / 8;
        ctx.moveTo(g, py + pad + 6); ctx.lineTo(g, py + W - pad - 6);
        const h = py + pad + (W - pad * 2) * i / 8;
        ctx.moveTo(px + pad + 6, h); ctx.lineTo(px + W - pad - 6, h);
      }
      ctx.stroke();
    }

    // ── Corner capacitor banks ──
    const bw = W * 0.17, bh = W * 0.2;
    const inset = W * 0.1;
    const banks = [
      [px + inset,             py + inset],
      [px + W - inset - bw,    py + inset],
      [px + inset,             py + W - inset - bh],
      [px + W - inset - bw,    py + W - inset - bh],
    ];
    const ringR = W * 0.2;

    // Conduits first so banks and ring sit on top of them
    if (mid) {
      for (let i = 0; i < 4; i++) {
        const bx = banks[i][0] + bw / 2, by = banks[i][1] + bh / 2;
        const dx = cx - bx, dy = cy - by, len = Math.hypot(dx, dy);
        const ex = cx - dx / len * ringR, ey = cy - dy / len * ringR;
        ctx.strokeStyle = hot ? acc(0.22) : 'rgba(120,140,170,0.25)';
        ctx.lineWidth = W * 0.03;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.strokeStyle = live(0.5);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
        if ((charging || discharging) && detail) {
          for (let k = 0; k < 3; k++) {
            let f = (t * 0.9 + k / 3 + i * 0.13) % 1;
            if (discharging) f = 1 - f;
            ctx.fillStyle = charging ? acc(0.95) : vio(0.95);
            ctx.beginPath(); ctx.arc(bx + (ex - bx) * f, by + (ey - by) * f, 1.8, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }

    for (let i = 0; i < 4; i++) {
      const [bx, by] = banks[i];
      drawRoundRect(bx, by, bw, bh, 3, '#0a1430', live(0.6), 1.5);
      const cells = 5, cg = 1.5;
      const ch = (bh - 6 - cg * (cells - 1)) / cells;
      const lit = pct * cells;
      for (let c = 0; c < cells; c++) {
        const cyy = by + bh - 3 - ch - c * (ch + cg);
        const on = Math.max(0, Math.min(1, lit - c));
        ctx.fillStyle = on > 0
          ? acc((0.25 + 0.6 * on) * (charging ? 0.8 + 0.2 * Math.sin(t * 6 + c + i) : 1))
          : 'rgba(40,55,80,0.6)';
        ctx.fillRect(bx + 3, cyy, bw - 6, ch);
      }
      if (detail) {                              // terminal caps
        ctx.fillStyle = live(0.7);
        ctx.fillRect(bx + bw * 0.22, by - 2, 3, 2.5);
        ctx.fillRect(bx + bw * 0.72, by - 2, 3, 2.5);
      }
    }

    // ── SMES ring ──
    // Cryostat shell
    ctx.fillStyle = '#081028';
    ctx.beginPath(); ctx.arc(cx, cy, ringR + W * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = live(0.6);
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, ringR + W * 0.035, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#030614';
    ctx.beginPath(); ctx.arc(cx, cy, ringR - W * 0.035, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = live(0.45);
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, ringR - W * 0.035, 0, Math.PI * 2); ctx.stroke();

    // Coil windings — rotate with charge, faster while charging
    if (mid) {
      const spin = t * (0.3 + 2.2 * pct) * (charging ? 1.8 : discharging ? -1.2 : 1);
      const n = detail ? 24 : 12;
      ctx.lineWidth = detail ? 1.6 : 2;
      for (let k = 0; k < n; k++) {
        const a = spin + k * Math.PI * 2 / n;
        const glow = hot ? 0.3 + 0.55 * pct * (0.6 + 0.4 * Math.sin(a * 3 + t * 4)) : 0;
        ctx.strokeStyle = hot ? (k % 2 ? acc(glow) : vio(glow)) : 'rgba(120,140,170,0.35)';
        const r0 = ringR - W * 0.028, r1 = ringR + W * 0.028;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a + 0.08) * r1, cy + Math.sin(a + 0.08) * r1);
        ctx.stroke();
      }
    }

    // Core
    const coreR = W * 0.075;
    if (hot) {
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, ringR - W * 0.04);
      const breathe = 0.85 + 0.15 * Math.sin(t * 2.4);
      cg.addColorStop(0,   `rgba(230,250,255,${(0.35 + 0.6 * pct) * breathe})`);
      cg.addColorStop(0.3, acc((0.2 + 0.45 * pct) * breathe));
      cg.addColorStop(0.7, vio(0.12 * pct));
      cg.addColorStop(1,   'rgba(0,0,0,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(cx, cy, ringR - W * 0.04, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = live(0.7);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, coreR, 0, Math.PI * 2); ctx.stroke();

    // Orbiting plasma motes — more of them the fuller it is
    if (hot && detail) {
      const motes = 2 + Math.round(pct * 6);
      for (let k = 0; k < motes; k++) {
        const a  = t * (1.2 + k * 0.17) * (k % 2 ? -1 : 1) + k * 1.3;
        const rr = coreR + (ringR - W * 0.05 - coreR) * (0.35 + 0.5 * ((k * 0.37) % 1));
        ctx.fillStyle = k % 2 ? vio(0.85) : acc(0.9);
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.9, 1.4, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Arcs from the ring into the core while banking surplus
    if (charging && pct > 0.02 && detail) {
      ctx.strokeStyle = `rgba(210,245,255,${0.35 + 0.45 * Math.abs(Math.sin(t * 13))})`;
      ctx.lineWidth = 1;
      for (let k = 0; k < 3; k++) {
        const a  = t * 2.3 + k * 2.094 + Math.sin(t * 17 + k) * 0.3;
        const x0 = cx + Math.cos(a) * (ringR - W * 0.035), y0 = cy + Math.sin(a) * (ringR - W * 0.035);
        const x1 = cx + Math.cos(a) * coreR, y1 = cy + Math.sin(a) * coreR;
        ctx.beginPath(); ctx.moveTo(x0, y0);
        for (let s = 1; s <= 4; s++) {
          const f = s / 5, j = Math.sin(t * 29 + s * 2.3 + k) * W * 0.012;
          ctx.lineTo(x0 + (x1 - x0) * f - Math.sin(a) * j, y0 + (y1 - y0) * f + Math.cos(a) * j);
        }
        ctx.lineTo(x1, y1); ctx.stroke();
      }
    }

    // ── Status beacons on the fence line ──
    if (detail) {
      const blink = Math.sin(t * 3) > 0;
      const col = !e.powered ? 'rgba(255,70,50,' : charging ? 'rgba(80,255,160,' : discharging ? 'rgba(255,190,60,' : 'rgba(128,224,255,';
      for (const [bxp, byp] of [[cx, py + pad + 4], [cx, py + W - pad - 4], [px + pad + 4, cy], [px + W - pad - 4, cy]]) {
        ctx.fillStyle = col + (blink ? 0.95 : 0.35) + ')';
        ctx.fillRect(bxp - 1.5, byp - 1.5, 3, 3);
      }
    }

    // ── Labels ──
    ctx.textAlign = 'center';
    ctx.font      = 'bold 8px Courier New';
    ctx.fillStyle = hot ? acc(0.6 + 0.3 * pct) : 'rgba(120,150,190,0.45)';
    ctx.fillText('MK3', cx, py + W * 0.12);
    ctx.font      = 'bold 9px Courier New';
    ctx.fillStyle = hot ? 'rgba(230,250,255,0.9)' : 'rgba(120,150,190,0.5)';
    ctx.fillText(Math.round(pct * 100) + '%', cx, cy + 3);
    ctx.textAlign = 'left';
  }

function renderPowerTower(e, px, py, t) {
    // Power Tower — a steel lattice transmission pylon standing in its 2×2
    // plot: tapered legs on concrete footings, X-braced lattice panels, two
    // crossarms with hanging insulator strings, an earth-wire peak with a
    // red aviation beacon, an anti-climb band and a danger plate. Off, it
    // reads as galvanised grey steel; energised, the steel takes a cool tint
    // and the insulator strings glow (with a faint corona after dark). A
    // tower knocked out by lightning is scorched black at the top with a
    // buckled arm, sparking and smoking.
    //
    // LOD: below zoom 0.5 only the legs, arms and base are drawn — towers
    // routinely number in the hundreds in a developed city, and the lattice,
    // strings and beacon are invisible at that scale anyway.
    const W = TILE*2, u = W / 80;
    const X = (v) => px + v*u, Y = (v) => py + v*u;
    const on = e.powered, damaged = !!e._lightningDamaged;
    const live = on && !damaged;
    const detail = Camera.zoom > 0.5;
    const dark = DayNight.darkness();
    const STEEL    = live ? '#a9c0d2' : damaged ? '#6a6660' : '#8f9cab';
    const STEEL_DK = live ? '#6e889c' : damaged ? '#3e3a36' : '#66727f';
    const line = (x1, y1, x2, y2, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w*u; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    // Leg x at height y: legs run from the footings (25.5 / 54.5, y 74) up to the waist (36 / 44, y 12)
    const legX = (y, s) => s < 0 ? 25.5 + (74 - y) / 62 * 10.5 : 54.5 - (74 - y) / 62 * 10.5;

    ctx.save();
    ctx.lineCap = 'round';

    // Shadow and footings. A footing standing in water (water_build.js) is
    // a round concrete pier instead, the water lapping at it in rings.
    const _wet = (fx) => !!e._waterFooting && (e._waterTiles || []).some(w => w.c === e.col + (fx < 40 ? 0 : 1) && w.r === e.row + 1);
    ctx.fillStyle = e._waterFooting ? 'rgba(0,20,40,0.22)' : 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(X(43.5), Y(76), 22*u, 3.5*u, 0, 0, Math.PI*2); ctx.fill();
    for (const fx of [25.5, 54.5]) {
      if (_wet(fx)) {
        if (detail) for (let k = 0; k < 2; k++) {
          const f = (t*0.35 + k*0.5 + (fx > 40 ? 0.25 : 0)) % 1;
          ctx.strokeStyle = `rgba(220,240,255,${(0.45*(1 - f)).toFixed(3)})`;
          ctx.lineWidth = 0.6*u;
          ctx.beginPath(); ctx.ellipse(X(fx), Y(76.6), (6 + f*7)*u, (2 + f*2.4)*u, 0, 0, Math.PI*2); ctx.stroke();
        }
        ctx.fillStyle = '#8c8e8a';                              // pier side, down to the waterline
        ctx.beginPath(); ctx.ellipse(X(fx), Y(76.6), 5*u, 1.7*u, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillRect(X(fx - 5), Y(73.4), 10*u, 3.2*u);
        ctx.fillStyle = '#b4b6b0';                              // pier top
        ctx.beginPath(); ctx.ellipse(X(fx), Y(73.4), 5*u, 1.7*u, 0, 0, Math.PI*2); ctx.fill();
        if (detail) { ctx.fillStyle = 'rgba(40,70,60,0.45)'; ctx.fillRect(X(fx - 5), Y(75.6), 10*u, 0.8*u); }   // wet, weedy band
        continue;
      }
      ctx.fillStyle = '#9a968c'; ctx.fillRect(X(fx - 4), Y(72.8), 8*u, 4.2*u);
      ctx.fillStyle = '#7a766c'; ctx.fillRect(X(fx - 4), Y(76), 8*u, 1*u);
    }

    // Lattice panels between the legs (detail only)
    const levels = [73, 63, 53, 44, 36, 28, 20, 12];
    if (detail) {
      ctx.strokeStyle = STEEL_DK; ctx.lineWidth = 0.62*u; ctx.beginPath();
      for (let i = 0; i < levels.length - 1; i++) {
        const y0 = levels[i], y1 = levels[i + 1];
        ctx.moveTo(X(legX(y0, -1)), Y(y0)); ctx.lineTo(X(legX(y1, 1)), Y(y1));
        ctx.moveTo(X(legX(y0, 1)), Y(y0));  ctx.lineTo(X(legX(y1, -1)), Y(y1));
        ctx.moveTo(X(legX(y1, -1)), Y(y1)); ctx.lineTo(X(legX(y1, 1)), Y(y1));
      }
      ctx.stroke();
    }

    // Legs
    line(25.5, 74, 36, 12, STEEL, 2.05);
    line(54.5, 74, 44, 12, STEEL, 2.05);
    line(36, 12, 40, 3, STEEL, 1.4);
    line(44, 12, 40, 3, STEEL, 1.4);
    if (detail) {
      line(26.3, 74, 36.7, 12, 'rgba(255,255,255,0.25)', 0.5);
      // anti-climb band with barbs
      const by = 59;
      line(legX(by, -1) - 1, by, legX(by, 1) + 1, by, STEEL_DK, 1.1);
      ctx.strokeStyle = STEEL_DK; ctx.lineWidth = 0.48*u; ctx.beginPath();
      for (let x = legX(by, -1); x <= legX(by, 1); x += 2.1) { ctx.moveTo(X(x), Y(by)); ctx.lineTo(X(x + 0.95), Y(by - 1.55)); }
      ctx.stroke();
      // danger plate
      ctx.fillStyle = '#f2f0e8'; ctx.fillRect(X(37), Y(63.5), 6.1*u, 5*u);
      ctx.fillStyle = '#c82a20';
      ctx.beginPath(); ctx.moveTo(X(40.5), Y(64.2)); ctx.lineTo(X(38.6), Y(66.3)); ctx.lineTo(X(40), Y(66.3)); ctx.lineTo(X(39.3), Y(67.9)); ctx.lineTo(X(41.55), Y(65.6)); ctx.lineTo(X(40.15), Y(65.6)); ctx.closePath(); ctx.fill();
    }

    // Crossarms — triangular trusses; a lightning-struck tower's upper arm buckles
    const arm = (y, span, droop) => {
      const lx = 40 - span, rx = 40 + span;
      line(legX(y, -1), y - 1.75, lx, y, STEEL, 1.4);
      line(legX(y, 1), y - 1.75, rx, y + droop, STEEL, 1.4);
      line(legX(y, -1), y + 2.75, lx, y, STEEL_DK, 0.95);
      line(legX(y, 1), y + 2.75, rx, y + droop, STEEL_DK, 0.95);
      return [[lx, y], [rx, y + droop]];
    };
    const tips = [...arm(16, 28.5, damaged ? 5.5 : 0), ...arm(33.5, 22, 0)];

    // Insulator strings with conductor clamps
    if (detail) {
      tips.forEach(([tx, ty], i) => {
        const len = 7.75;
        if (live && dark > 0.3) {
          ctx.fillStyle = `rgba(140,200,255,${0.16 + 0.08*Math.sin(t*4 + i)})`;
          ctx.beginPath(); ctx.arc(X(tx), Y(ty + len*0.6), 4.25*u, 0, Math.PI*2); ctx.fill();
        }
        line(tx, ty, tx, ty + len, '#4a4e52', 0.48);
        for (let k = 0; k < 4; k++) {
          ctx.fillStyle = live ? `rgba(150,215,255,${0.8 + 0.15*Math.sin(t*3 + i + k)})` : damaged && i === 1 ? '#3a3530' : '#b8c0bc';
          ctx.beginPath(); ctx.ellipse(X(tx), Y(ty + 1.55 + k*1.75), 1.55*u, 0.65*u, 0, 0, Math.PI*2); ctx.fill();
        }
        ctx.fillStyle = '#5a5e62'; ctx.fillRect(X(tx - 0.95), Y(ty + len - 0.4), 1.9*u, 1.35*u);
      });
    }

    // Aviation beacon on the earth-wire peak
    if (detail) {
      ctx.fillStyle = '#3a3e42'; ctx.fillRect(X(39.05), Y(1.55), 1.9*u, 1.9*u);
      if (on && !damaged) {
        const blink = Math.sin(t*2.8) > 0.2;
        if (blink) {
          ctx.fillStyle = 'rgba(255,60,40,0.35)'; ctx.beginPath(); ctx.arc(X(40), Y(1.5), 3.8*u, 0, Math.PI*2); ctx.fill();
        }
        ctx.fillStyle = blink ? '#ff4030' : '#7a2018'; ctx.beginPath(); ctx.arc(X(40), Y(1.5), 1.3*u, 0, Math.PI*2); ctx.fill();
      }
    }

    // Lightning damage: scorch, sparks at the buckled arm, smoke
    if (damaged) {
      const sg = ctx.createRadialGradient(X(40), Y(12), 0, X(40), Y(12), 14.5*u);
      sg.addColorStop(0, 'rgba(20,16,12,0.6)'); sg.addColorStop(1, 'rgba(20,16,12,0)');
      ctx.fillStyle = sg; ctx.fillRect(X(25.5), Y(-2.5), 29*u, 29*u);
      const [sx, sy] = tips[1];
      if (Math.sin(t*19) * Math.sin(t*31) > -0.1) {
        ctx.strokeStyle = 'rgba(255,220,140,0.95)'; ctx.lineWidth = 0.65*u; ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = t*8 + k*1.6;
          ctx.moveTo(X(sx), Y(sy)); ctx.lineTo(X(sx + Math.cos(a)*3.75), Y(sy + Math.sin(a)*3.75));
        }
        ctx.stroke();
      }
      for (let k = 0; k < 4; k++) {
        const f = (t*0.35 + k/4) % 1;
        ctx.fillStyle = `rgba(80,78,76,${0.4*(1 - f)})`;
        ctx.beginPath(); ctx.arc(X(40 + f*7.5 + Math.sin(t + k)*2), Y(10 - f*17), (1.9 + f*4.75)*u, 0, Math.PI*2); ctx.fill();
      }
    }

    ctx.restore();
  }

// ── Monitoring Station MK2 (4×4) ─────────────────────────────────────────
// The grid operations centre, authored natively at 160×160 units. A low
// control building on a paved pad, its glazed front under an entrance
// canopy in the MK2's orange. On the roof: a video wall plotting live
// supply against demand for the whole grid, with a bar readout beside the
// plot; a rack of status modules, one per power network, each with a lamp
// (red for one short of power) and a load bar; and the rooftop plant. A
// fenced comms compound on the east side holds the tracking dish, a tapered
// lattice mast with a beacon and microwave drums, and the equipment
// cabinets, cabled across to the building.
function renderMonitor2(e, px, py, t) {
  if (!e._ghost && (e.col * TILE !== px || e.row * TILE !== py)) return;
  const K = _nKit(px, py), { S, X, Y, R, RR, dot, ell, poly, ln, text, glow } = K;
  const on = !!e.powered, night = DayNight.darkness() > 0.3;
  const detail = Camera.zoom > 0.35, fine = Camera.zoom > 0.7;
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const teal = '64,255,204';
  const orange = L('#f08a2c', '#a85a20', '#4a3422');
  const s = PowerNetwork.stats;

  // ── Grounds: lawn, the paved pad, the path up to the door ──
  RR(2, 2, 156, 156, 7, L('#6f8a58', '#1e2a1a', '#262c22'));
  RR(5, 5, 150, 140, 5, L('#979f99', '#2c3232', '#2a2e2c'));
  if (detail) {
    ctx.strokeStyle = L('rgba(0,0,0,0.10)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0.2)'); ctx.lineWidth = 0.6 * S; ctx.beginPath();
    for (let x = 17; x < 155; x += 12) { ctx.moveTo(X(x), Y(5)); ctx.lineTo(X(x), Y(145)); }
    for (let y = 17; y < 145; y += 12) { ctx.moveTo(X(5), Y(y)); ctx.lineTo(X(155), Y(y)); }
    ctx.stroke();
  }
  R(52, 140, 20, 18, L('#bfc5c0', '#363c3c', '#2e3232'));                                   // path
  for (const [x, y, r] of [[10, 151, 5], [19, 153, 4], [148, 151, 5], [139, 153, 4], [96, 152, 4.5]]) {
    dot(x + 1, y + 1.5, r, 'rgba(0,0,0,0.25)'); dot(x, y, r, L('#3f6a34', '#14240f', '#1c2418')); if (detail) dot(x - r * 0.3, y - r * 0.3, r * 0.5, L('#5a8a46', '#1d3216', '#222c1e'));
  }
  // the sign by the path
  R(29, 150, 1.5, 6, L('#5a6060', '#2a2e2e', '#222626')); R(46, 150, 1.5, 6, L('#5a6060', '#2a2e2e', '#222626'));
  RR(26, 144, 24, 8, 1.5, L('#20302e', '#0e1716', '#141818'));
  R(26, 144, 24, 1.6, orange);
  if (detail) text('GRID OPS', 38, 148.6, 4, L('#e6f2ee', '#8fd8c4', '#3c4644'), 'Arial, sans-serif');

  // ── The building ──
  RR(14, 20, 104, 122, 4, 'rgba(0,0,0,0.30)');                                             // cast shadow
  RR(8, 14, 104, 122, 4, L('#d9e0de', '#3a4646', '#262c2c'));                               // parapet
  RR(12, 18, 96, 104, 2, L('#3c5552', '#152422', '#171e1e'));                               // roof deck
  if (detail) {
    ctx.strokeStyle = L('rgba(0,0,0,0.14)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0.02)'); ctx.lineWidth = 0.8 * S; ctx.beginPath();
    for (let x = 28; x < 108; x += 16) { ctx.moveTo(X(x), Y(18)); ctx.lineTo(X(x), Y(122)); }
    ctx.stroke();
  }
  // glazed south front and the entrance canopy
  R(8, 122, 104, 14, L('#1d3533', '#0b1716', '#101414'));
  if (detail) for (let k = 0; k < 10; k++) {
    if (k === 4 || k === 5) continue;                                                       // the doors, under the canopy
    const x = 11 + k * 10;
    R(x, 124.5, 8, 9, on ? (night ? 'rgba(170,255,232,0.85)' : 'rgba(120,186,196,0.85)') : '#161c1c');
    if (on && !night) R(x, 124.5, 3, 9, 'rgba(255,255,255,0.18)');
  }
  R(8, 134, 104, 2, orange);                                                                // the trim that marks it as the MK2
  RR(48, 126, 28, 16, 1.5, 'rgba(0,0,0,0.28)');
  RR(46, 122, 28, 16, 1.5, L('#eef2f0', '#4a5654', '#2c3232'));
  R(46, 136, 28, 2, orange);
  R(53, 138, 14, 2, L('#1d3533', '#0b1716', '#101414'));
  if (on && night) { glow(60, 140, 16, '255,230,170', 0.35); glow(60, 150, 10, '255,230,170', 0.2); }

  // ── The video wall: plot of supply against demand, bar readout beside it ──
  R(18, 72, 86, 5, 'rgba(0,0,0,0.30)');                                                     // its shadow on the deck
  RR(16, 22, 88, 52, 2.5, L('#1a2424', '#0a1010', '#0c0e0e'));
  R(16, 22, 88, 4, orange);
  if (fine) text('GRID · SUPPLY / DEMAND', 60, 24.1, 2.6, L('#1a0e04', '#1a0e04', '#1a1410'), 'Arial, sans-serif');
  RR(19, 28, 82, 43, 1.5, '#03110d');
  if (on) {
    const g = s.totalGenerated || 0, c = s.totalConsumed || 0;
    e._monHist = e._monHist || [];
    if (!e._monHistT || t - e._monHistT > 0.5 || t < e._monHistT) { e._monHistT = t; e._monHist.push([g, c]); if (e._monHist.length > 32) e._monHist.shift(); }
    let top = 1; for (const [a, b] of e._monHist) top = Math.max(top, a, b);
    top *= 1.1;
    ctx.save(); ctx.beginPath(); ctx.rect(X(20), Y(29), 64 * S, 41 * S); ctx.clip();
    if (detail) { ctx.strokeStyle = `rgba(${teal},0.13)`; ctx.lineWidth = 0.6 * S; ctx.beginPath();
      for (let k = 1; k < 4; k++) { ctx.moveTo(X(20), Y(29 + k * 10)); ctx.lineTo(X(84), Y(29 + k * 10)); }
      for (let k = 1; k < 6; k++) { ctx.moveTo(X(20 + k * 11), Y(29)); ctx.lineTo(X(20 + k * 11), Y(70)); } ctx.stroke(); }
    const px_ = k => 22 + k * 2, py_ = v => 68 - 37 * v / top, hist = e._monHist;
    if (hist.length > 1) {                                                                  // supply, filled
      ctx.fillStyle = 'rgba(240,192,64,0.16)'; ctx.beginPath(); ctx.moveTo(X(px_(0)), Y(70));
      hist.forEach((v, k) => ctx.lineTo(X(px_(k)), Y(py_(v[0]))));
      ctx.lineTo(X(px_(hist.length - 1)), Y(70)); ctx.closePath(); ctx.fill();
    }
    const trace = (idx, col) => { ctx.strokeStyle = col; ctx.lineWidth = 1.5 * S; ctx.lineJoin = 'round'; ctx.beginPath();
      hist.forEach((v, k) => { const x = px_(k), y = py_(v[idx]); k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)); }); ctx.stroke(); };
    trace(0, '#f0c040'); trace(1, '#ff9070');
    const last = hist[hist.length - 1];
    dot(px_(hist.length - 1), py_(last[0]), 1.6, '#ffe080'); dot(px_(hist.length - 1), py_(last[1]), 1.6, '#ffb090');
    ctx.restore();
    // readout: supply and demand bars
    R(85, 29, 0.6, 41, `rgba(${teal},0.25)`);
    const bar = (x, v, col) => { const h = 37 * Math.min(1, v / top); R(x, 31, 5, 37, 'rgba(255,255,255,0.05)'); R(x, 68 - h, 5, h, col); };
    bar(88, g, '#f0c040'); bar(94.5, c, '#ff9070');
    if (g < c - 0.05 && Math.sin(t * 6) > 0) R(19, 28, 82, 43, 'rgba(255,60,40,0.22)');    // the whole grid is short
    glow(60, 50, 56, teal, night ? 0.22 : 0.08);
  }
  // the wall's two legs
  R(26, 74, 3, 3, L('#5a6666', '#222a2a', '#1a1e1e')); R(91, 74, 3, 3, L('#5a6666', '#222a2a', '#1a1e1e'));

  // ── Status rack: one module per power network ──
  RR(16, 82, 62, 34, 2, L('#1a2c2a', '#0a1514', '#0e1212'));
  if (detail) text('NETWORKS', 47, 86.2, 4, L('#8ad0c0', '#4a8a7c', '#2c3a38'), 'Arial, sans-serif');
  {
    const order = typeof _gridNetworkOrder === 'function' ? _gridNetworkOrder(s) : [];
    for (let k = 0; k < 8; k++) {
      const id = order[k], x = 18.5 + k * 7.3;
      RR(x, 90, 6.4, 23, 1, L('#253a38', '#101c1b', '#141a1a'));
      let col = '#1c2626', load = 0, short = false;
      if (on && id !== undefined) {
        const gs = (s.genSources || []).find(n => n.netId === id), cs = (s.conSources || []).find(n => n.netId === id);
        const sup = gs ? gs.supply : 0, dem = cs ? cs.demand : 0;
        short = sup < dem - 0.05; load = sup > 0 ? Math.min(1, dem / sup) : (dem > 0 ? 1 : 0);
        col = short ? (Math.sin(t * 6) > 0 ? '#ff5040' : '#601810') : '#50e890';
        if (detail) glow(x + 3.2, 94, 8, short ? '255,80,64' : '80,232,144', 0.45);
      }
      dot(x + 3.2, 94, 2.2, col);
      if (detail) {
        R(x + 1.7, 99, 3, 12, '#071010');
        if (load > 0) R(x + 1.7, 111 - 12 * load, 3, 12 * load, short ? '#ff6a50' : load > 0.85 ? '#ffd040' : `rgba(${teal},0.8)`);
      }
    }
  }

  // ── Rooftop plant ──
  for (const y of [82, 101]) {
    RR(83, y + 2, 22, 16, 2, 'rgba(0,0,0,0.25)');
    RR(81, y, 22, 16, 2, L('#9aa6a4', '#323e3c', '#242a2a'));
    for (let k = 0; k < 2; k++) {
      const fx = 87 + k * 10, fy = y + 8;
      dot(fx, fy, 4.2, L('#2c3a3a', '#101818', '#0e1212'));
      if (detail) { ctx.save(); ctx.translate(X(fx), Y(fy)); ctx.rotate(on ? t * 6 + k + y : k); ctx.fillStyle = L('#c9d2d2', '#56625f', '#2c3232');
        ctx.fillRect(-3.6 * S, -0.6 * S, 7.2 * S, 1.2 * S); ctx.fillRect(-0.6 * S, -3.6 * S, 1.2 * S, 7.2 * S); ctx.restore(); }
    }
  }

  // ── Comms compound, east side ──
  RR(118, 8, 36, 132, 2, L('#8f9690', '#262c2a', '#242826'));                               // gravel
  if (detail) {
    ctx.strokeStyle = L('#5a6262', '#3a4242', '#2a2e2e'); ctx.lineWidth = 0.8 * S; ctx.setLineDash([2 * S, 1.4 * S]);
    ctx.strokeRect(X(118), Y(8), 36 * S, 132 * S); ctx.setLineDash([]);
  }
  // cable tray from the cabinets to the building
  R(108, 118, 12, 4, L('#4a5454', '#1c2424', '#1a1e1e'));
  if (detail) for (let x = 109; x < 120; x += 2.5) R(x, 118, 0.8, 4, L('#7a8686', '#2c3434', '#242828'));
  // equipment cabinets
  for (const y of [112, 126]) {
    R(124, y + 2, 26, 10, 'rgba(0,0,0,0.25)');
    RR(122, y, 26, 10, 1, L('#d4dad8', '#3e4a48', '#2a3030'));
    if (detail) { ln(130.5, y + 1, 130.5, y + 9, L('#9aa4a2', '#2a3434', '#202424'), 0.6); ln(139, y + 1, 139, y + 9, L('#9aa4a2', '#2a3434', '#202424'), 0.6); }
    dot(145, y + 3, 1, on ? (Math.sin(t * 4 + y) > 0 ? '#50e890' : '#1e5a3a') : '#1c2626');
  }

  // tracking dish on its plinth
  {
    const cx = 136, cy = 32, az = on ? t * 0.35 : 0.6;
    RR(122, 18, 28, 28, 3, L('#aab2ae', '#3a4442', '#262c2a'));
    ell(cx + 5, cy + 6, 15, 11, 'rgba(0,0,0,0.28)', az);
    ell(cx, cy, 15, 11, L('#eef2f2', '#5c6866', '#2e3434'), az);
    ell(cx + Math.cos(az) * 1.5, cy + Math.sin(az) * 1.5, 11.5, 8, L('#c9d2d2', '#434e4c', '#252a2a'), az);
    const fx = cx + Math.cos(az) * 5, fy = cy + Math.sin(az) * 5;                            // feed horn, out toward where it points
    ctx.strokeStyle = L('#6a7a7a', '#8aa29c', '#3a4240'); ctx.lineWidth = 1 * S; ctx.beginPath();
    for (const a of [az + 2.1, az - 2.1, az + Math.PI]) {
      ctx.moveTo(X(cx + Math.cos(a) * 13 * (Math.abs(Math.sin(a - az)) > 0.5 ? 0.75 : 1)), Y(cy + Math.sin(a) * 10)); ctx.lineTo(X(fx), Y(fy));
    }
    ctx.stroke();
    dot(fx, fy, 2.4, on ? `rgba(${teal},0.95)` : '#2a3432');
    if (on && detail) glow(fx, fy, 7, teal, night ? 0.5 : 0.25);
  }

  // lattice mast, seen from above: tapered legs, bracing, drums, beacon
  {
    const cx = 136, cy = 78;
    R(127, 71, 24, 22, 'rgba(0,0,0,0.22)');                                                  // its shadow
    const sq = (h, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w * S; ctx.strokeRect(X(cx - h), Y(cy - h), 2 * h * S, 2 * h * S); };
    const steel = L('#8a9494', '#4a5656', '#2e3434');
    ctx.strokeStyle = steel; ctx.lineWidth = 1.2 * S; ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(X(cx + sx * 12), Y(cy + sy * 12)); ctx.lineTo(X(cx + sx * 2.5), Y(cy + sy * 2.5)); }
    ctx.stroke();
    sq(12, steel, 1.4);
    if (detail) {
      sq(8, steel, 0.9); sq(4.5, steel, 0.8);
      ctx.strokeStyle = steel; ctx.lineWidth = 0.6 * S; ctx.beginPath();                    // cross-bracing on the outer faces
      for (const [x1, y1, x2, y2] of [[-12, -12, 12, -8], [12, -12, -12, -8], [-12, 12, 12, 8], [12, 12, -12, 8], [-12, -12, -8, 12], [-12, 12, -8, -12], [12, -12, 8, 12], [12, 12, 8, -12]]) {
        ctx.moveTo(X(cx + x1), Y(cy + y1)); ctx.lineTo(X(cx + x2), Y(cy + y2));
      }
      ctx.stroke();
    }
    sq(2.5, orange, 1.2);
    for (const [dx, dy] of [[9, -3], [-9, 4]]) { dot(cx + dx, cy + dy, 3, L('#e8ecec', '#56625f', '#2c3232')); dot(cx + dx, cy + dy, 1.8, L('#b8c2c2', '#3c4846', '#242a2a')); }
    const blink = on && Math.sin(t * 3) > 0.2;
    dot(cx, cy, 2.6, blink ? '#ff4030' : '#5a1e1a');
    if (blink) glow(cx, cy, 15, '255,64,48', 0.55);
  }

  if (on && night) glow(60, 70, 100, teal, 0.08);
  if (!on && !e._ghost) text('NO POWER', 60, 8, 9, 'rgba(255,90,70,0.9)', 'Courier New, monospace');
}


/* Substation MK4 — "Aegis" 6×6 storage citadel. A hex-plated plinth
   carrying a big superconducting ring round a plasma core that runs cyan →
   violet → white as it banks, with a tilted gyroscope ring turning the other
   way. Four Tesla capacitor spires stand at the corners; while charging,
   arcs jump between neighbouring spires and down into the core. Busbars
   carry pulses inward while charging and outward (amber) while discharging,
   cryo vents breathe frost off the ring's coolant loop, and a holographic
   arc gauge round the ring shows the charge. 240×240 units (_nKit). */
function renderSubstation4(e, px, py, t) {
    if (e.col * TILE !== px || e.row * TILE !== py) return;
    const K = _nKit(px, py), { S, X, Y, R, RR, dot, ell, poly, ln, text } = K;
    const pct  = e.def.capacity > 0 ? Math.max(0, Math.min(1, e.charge / e.def.capacity)) : 0;
    const on   = e.powered && !e._lightningDamaged;
    const hot  = on && pct > 0.03;
    const zoom = Camera.zoom, detail = zoom > 0.55, mid = zoom > 0.38;
    const charging    = on && !!e.charging;
    const discharging = on && !e.charging && pct > 0.02 && pct < 0.99;
    const CX = 120, CY = 118;
    // core colour: cyan when low, violet through the middle, white-hot when full
    const coreRGB = pct < 0.5
      ? [Math.round(90 + 160 * pct), Math.round(220 - 100 * pct), 255]
      : [Math.round(170 + 85 * (pct - 0.5) * 2), Math.round(170 + 85 * (pct - 0.5) * 2), 255];
    const core = (a) => `rgba(${coreRGB[0]},${coreRGB[1]},${coreRGB[2]},${a})`;
    const cyan = (a) => `rgba(110,230,255,${a})`;
    const amber = (a) => `rgba(255,190,90,${a})`;
    const dimC = 'rgba(120,135,160,0.55)';
    const flow = charging ? cyan : discharging ? amber : (a) => `rgba(150,170,210,${a * 0.6})`;

    // seeded jitter for arcs, re-rolled a dozen times a second
    const jit = (k) => { const v = Math.sin(k * 91.7 + Math.floor(t * 12) * 13.3 + e.col * 7.1 + e.row * 3.7) * 43758.5453; return v - Math.floor(v); };
    const arc = (x1, y1, x2, y2, seed, rgb, a, w) => {
      const n = 7, nx = -(y2 - y1), ny = x2 - x1, nl = Math.hypot(nx, ny) || 1;
      const pts = [[x1, y1]];
      for (let i = 1; i < n; i++) {
        const u = i / n, off = (jit(seed + i) - 0.5) * 14 * Math.sin(u * Math.PI);
        pts.push([x1 + (x2 - x1) * u + nx / nl * off, y1 + (y2 - y1) * u + ny / nl * off]);
      }
      pts.push([x2, y2]);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
      for (const [lw, al] of [[w * 3.2, a * 0.25], [w, a]]) {
        ctx.strokeStyle = `rgba(${rgb},${al})`; ctx.lineWidth = lw * S; ctx.beginPath();
        pts.forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)));
        ctx.stroke();
      }
      ctx.restore();
    };

    ctx.save();
    if (hot && zoom > 0.35) _lgAdd(K, CX, CY, 150, `${coreRGB.join(',')}`, 0.12 + 0.22 * pct + 0.04 * Math.sin(t * 1.6));

    // ── Plinth: chamfered slab, glowing trim, hex deck plates ──
    const ch = 16;
    poly([[8 + ch, 8], [232 - ch, 8], [232, 8 + ch], [232, 232 - ch], [232 - ch, 232], [8 + ch, 232], [8, 232 - ch], [8, 8 + ch]], '#070b18');
    poly([[14 + ch, 14], [226 - ch, 14], [226, 14 + ch], [226, 226 - ch], [226 - ch, 226], [14 + ch, 226], [14, 226 - ch], [14, 14 + ch]], '#0b1226');
    ctx.strokeStyle = hot ? core(0.55 + 0.3 * pct) : dimC; ctx.lineWidth = 1.6 * S;
    ctx.beginPath();
    [[8 + ch, 8], [232 - ch, 8], [232, 8 + ch], [232, 232 - ch], [232 - ch, 232], [8 + ch, 232], [8, 232 - ch], [8, 8 + ch]].forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)));
    ctx.closePath(); ctx.stroke();
    if (detail) {
      ctx.strokeStyle = 'rgba(140,180,255,0.07)'; ctx.lineWidth = 0.8 * S;
      const hr = 9, hw = hr * Math.sqrt(3);
      ctx.beginPath();
      for (let row = 0; row < 15; row++) for (let col = 0; col < 13; col++) {
        const hx = 22 + col * hw + (row % 2) * hw / 2, hy = 22 + row * hr * 1.5;
        if (hx > 220 || hy > 220) continue;
        for (let k = 0; k < 6; k++) {
          const a0 = Math.PI / 6 + k * Math.PI / 3, a1 = a0 + Math.PI / 3;
          ctx.moveTo(X(hx + Math.cos(a0) * hr), Y(hy + Math.sin(a0) * hr)); ctx.lineTo(X(hx + Math.cos(a1) * hr), Y(hy + Math.sin(a1) * hr));
        }
      }
      ctx.stroke();
      // corner chevrons
      for (const [x, y, sx, sy] of [[18, 18, 1, 1], [222, 18, -1, 1], [18, 222, 1, -1], [222, 222, -1, -1]]) {
        ln(x, y + sy * 10, x, y, '#f0c030', 1.2); ln(x, y, x + sx * 10, y, '#f0c030', 1.2);
      }
    }

    // ── Spires (positions) and busbars into the ring ──
    const SP = [[40, 40], [200, 40], [40, 196], [200, 196]];
    const ringRx = 62, ringRy = 50;
    if (mid) for (let i = 0; i < 4; i++) {
      const [sx, sy] = SP[i], dx = CX - sx, dy = CY - sy, L = Math.hypot(dx, dy);
      const ex = CX - dx / L * ringRx * 0.95, ey = CY - dy / L * ringRy * 0.95;
      ln(sx, sy + 6, ex, ey, '#1a2438', 6);
      ln(sx, sy + 6, ex, ey, hot ? flow(0.45) : dimC, 1.4);
      if ((charging || discharging) && detail) for (let k = 0; k < 4; k++) {
        let f = (t * 0.8 + k / 4 + i * 0.17) % 1; if (discharging) f = 1 - f;
        const qx = sx + (ex - sx) * f, qy = sy + 6 + (ey - sy - 6) * f;
        dot(qx, qy, 2, flow(0.95)); if (zoom > 0.7) _lgAdd(K, qx, qy, 6, charging ? '110,230,255' : '255,190,90', 0.35);
      }
    }

    // ── Coolant loop and cryo vents ──
    ctx.strokeStyle = on ? 'rgba(170,230,255,0.35)' : 'rgba(120,135,160,0.25)'; ctx.lineWidth = 3 * S;
    ctx.beginPath(); ctx.ellipse(X(CX), Y(CY + 4), (ringRx + 16) * S, (ringRy + 14) * S, 0, 0, Math.PI * 2); ctx.stroke();
    for (const [vx, vy] of [[CX - ringRx - 16, CY + 4], [CX + ringRx + 16, CY + 4]]) {
      RR(vx - 7, vy - 6, 14, 12, 3, '#18233a'); R(vx - 5, vy - 2, 10, 1.2, on ? cyan(0.7) : dimC);
      if (on && detail) for (let p = 0; p < 4; p++) {
        const q = (t * 0.35 + p / 4 + (vx > CX ? 0.5 : 0)) % 1;
        ell(vx + Math.sin(q * 6 + p) * 3, vy - 8 - q * 26, 3 + q * 7, 2 + q * 4, `rgba(220,245,255,${(0.28 * (1 - q)).toFixed(3)})`);
      }
    }

    // ── The ring: cryostat torus with rotating coil segments ──
    const spin = t * (0.3 + 2.2 * pct) * (discharging ? -1 : 1);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#1b2640'; ctx.lineWidth = 18 * S;
    ctx.beginPath(); ctx.ellipse(X(CX), Y(CY), ringRx * S, ringRy * S, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#2c3a5c'; ctx.lineWidth = 12 * S;
    ctx.beginPath(); ctx.ellipse(X(CX), Y(CY - 2), ringRx * S, ringRy * S, 0, Math.PI, Math.PI * 2); ctx.stroke();
    const segs = 28;
    for (let k = 0; k < segs; k++) {
      const a = spin + k * Math.PI * 2 / segs;
      const x0 = CX + Math.cos(a) * (ringRx - 7), y0 = CY + Math.sin(a) * (ringRy - 6);
      const x1 = CX + Math.cos(a) * (ringRx + 7), y1 = CY + Math.sin(a) * (ringRy + 6);
      const lit = hot && ((k + Math.floor(t * 6)) % 7 === 0);
      ln(x0, y0, x1, y1, lit ? core(0.95) : hot ? core(0.35 + 0.3 * pct) : 'rgba(110,125,150,0.45)', 2.2);
    }
    ctx.strokeStyle = hot ? core(0.7) : dimC; ctx.lineWidth = 1.2 * S;
    ctx.beginPath(); ctx.ellipse(X(CX), Y(CY), (ringRx - 9) * S, (ringRy - 8) * S, 0, 0, Math.PI * 2); ctx.stroke();

    // holographic charge gauge round the outside of the ring
    if (mid) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(120,140,190,0.18)'; ctx.lineWidth = 3 * S;
      ctx.beginPath(); ctx.ellipse(X(CX), Y(CY), (ringRx + 26) * S, (ringRy + 24) * S, 0, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
      if (pct > 0.005) {
        ctx.strokeStyle = hot ? core(0.85) : dimC;
        ctx.beginPath(); ctx.ellipse(X(CX), Y(CY), (ringRx + 26) * S, (ringRy + 24) * S, 0, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * pct)); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }

    // ── Gyroscope ring: tilted, counter-rotating ──
    {
      const tilt = Math.sin(t * 0.4) * 0.25 + 0.6, rot = -t * (0.2 + 0.9 * pct);
      ctx.save(); ctx.translate(X(CX), Y(CY)); ctx.rotate(rot);
      ctx.strokeStyle = hot ? core(0.55) : 'rgba(130,145,175,0.4)'; ctx.lineWidth = 2.4 * S;
      ctx.beginPath(); ctx.ellipse(0, 0, 36 * S, 36 * tilt * S, 0, 0, Math.PI * 2); ctx.stroke();
      if (hot) {                                       // a spark riding the gyro ring
        const a = t * 3;
        ctx.fillStyle = core(1); ctx.beginPath();
        ctx.arc(Math.cos(a) * 36 * S, Math.sin(a) * 36 * tilt * S, 2.2 * S, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    // ── Plasma core ──
    {
      const pulse = 1 + 0.08 * Math.sin(t * 3.1) * (hot ? 1 : 0);
      const r = (12 + 10 * pct) * pulse;
      if (hot) _lgAdd(K, CX, CY, r * 3.2, coreRGB.join(','), 0.35 + 0.4 * pct);
      const g = ctx.createRadialGradient(X(CX - r * 0.3), Y(CY - r * 0.3), 0, X(CX), Y(CY), r * S);
      g.addColorStop(0, hot ? '#ffffff' : '#5a6478'); g.addColorStop(0.45, hot ? core(0.95) : '#3a4458'); g.addColorStop(1, hot ? core(0.25) : '#1a2030');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(CX), Y(CY), r * S, 0, Math.PI * 2); ctx.fill();
      // containment cage
      ctx.strokeStyle = hot ? 'rgba(255,255,255,0.45)' : 'rgba(150,160,180,0.35)'; ctx.lineWidth = 0.8 * S;
      for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(X(CX), Y(CY), (r + 4) * S, (r + 4) * S * Math.abs(Math.cos(t * 0.7 + k * 1.05)), 0, 0, Math.PI * 2); ctx.stroke(); }
      // filaments from core to ring while energy is moving
      if ((charging || discharging) && detail) for (let k = 0; k < 3; k++) {
        const a = jit(500 + k) * Math.PI * 2;
        arc(CX + Math.cos(a) * r, CY + Math.sin(a) * r, CX + Math.cos(a) * (ringRx - 10), CY + Math.sin(a) * (ringRy - 9), 600 + k * 10, charging ? '150,235,255' : '255,200,120', 0.8, 0.9);
      }
    }

    // ── Tesla capacitor spires ──
    const spire = (sx, sy, i) => {
      ell(sx + 3, sy + 22, 15, 5, 'rgba(0,0,0,0.35)');
      RR(sx - 13, sy + 8, 26, 14, 3, '#141c30'); R(sx - 11, sy + 10, 22, 1.2, hot ? flow(0.6) : dimC);
      poly([[sx - 8, sy + 10], [sx + 8, sy + 10], [sx + 4, sy - 24], [sx - 4, sy - 24]], '#26324e');
      poly([[sx + 1, sy + 10], [sx + 8, sy + 10], [sx + 4, sy - 24], [sx + 1, sy - 24]], 'rgba(0,0,0,0.25)');
      // cell LEDs, bottom to top with charge
      const cells = 7;
      for (let c = 0; c < cells; c++) {
        const lit = hot && (c + 0.5) / cells <= pct;
        const yy = sy + 6 - c * 4.4, hw = 6 - c * 0.5;
        R(sx - hw, yy, hw * 2, 2, lit ? core(0.95) : 'rgba(60,72,96,0.9)');
      }
      // toroid cap
      ell(sx, sy - 26, 13, 5.5, '#3a4a6e'); ell(sx, sy - 27, 13, 4.5, hot ? core(0.35 + 0.4 * pct) : '#4a5878');
      ell(sx, sy - 27, 6, 2, '#0b1226');
      if (hot) _lgAdd(K, sx, sy - 27, 18, coreRGB.join(','), 0.2 + 0.35 * pct);
      // a beacon blinking in turn round the four
      const bl = on && Math.floor(t * 2) % 4 === i;
      dot(sx, sy - 33, 1.4, bl ? '#ff5040' : '#5a2a24');
      if (bl) _lgAdd(K, sx, sy - 33, 8, '255,80,64', 0.6);
    };
    for (let i = 0; i < 4; i++) spire(SP[i][0], SP[i][1], i);

    // spire-to-spire arcs while charging, and the odd strike down to the core
    if (charging && mid) {
      const pairs = [[0, 1], [1, 3], [3, 2], [2, 0]];
      for (let p = 0; p < 4; p++) {
        if (jit(40 + p) > 0.45) continue;
        const [a, b] = pairs[p];
        arc(SP[a][0], SP[a][1] - 27, SP[b][0], SP[b][1] - 27, 100 + p * 13, '160,235,255', 0.85, 1.1);
      }
      const k = Math.floor(jit(77) * 4);
      if (jit(78) > 0.6) arc(SP[k][0], SP[k][1] - 27, CX, CY, 300, '190,220,255', 0.9, 1.2);
    }

    // ── Control kiosk and label ──
    RR(96, 204, 48, 16, 3, '#121a2e');
    R(99, 207, 42, 10, on ? '#08202c' : '#101418');
    if (on && detail) {
      for (let b = 0; b < 8; b++) {
        const hgt = 2 + 6 * Math.abs(Math.sin(t * 2 + b * 0.8)) * (0.3 + 0.7 * pct);
        R(101 + b * 5, 216 - hgt, 3, hgt, charging ? cyan(0.85) : discharging ? amber(0.85) : 'rgba(120,200,160,0.7)');
      }
    }
    if (detail) {
      text('AEGIS MK4', CX, 24, 7, hot ? core(0.9) : 'rgba(150,165,190,0.7)', '"JetBrains Mono", "Courier New", monospace');
      text(`${Math.round(pct * 100)}%`, CX, CY + ringRy + 34, 7, hot ? core(0.95) : 'rgba(150,165,190,0.7)', '"JetBrains Mono", "Courier New", monospace');
    }
    if (!on && detail) {
      RR(CX - 48, CY - 9, 96, 18, 3, 'rgba(14,10,14,0.82)');
      text(e._lightningDamaged ? 'STRUCK: OFFLINE' : 'OFFLINE', CX, CY, 8, 'rgba(255,90,70,0.95)', '"Courier New", monospace');
    }
    ctx.restore();
}


/* Substation MK5 — "Helios" 8×8 stellar vault. The fusion-age store keeps
   its energy as a captive miniature star: a plasma sun held in an
   armillary of three magnetic rings turning on different axes, faster as
   it banks. Eight capacitor monoliths stand round it in a circle, their
   crystal heads filling with charge; while charging, plasma streams pour
   from the monoliths into the star, and while discharging they flow back
   out (amber) along radial floor channels to the edge. The star grows,
   brightens and throws prominences as it fills. 320×320 units (_nKit). */
function renderSubstation5(e, px, py, t) {
    if (e.col * TILE !== px || e.row * TILE !== py) return;
    const K = _nKit(px, py), { S, X, Y, R, RR, dot, ell, poly, ln, text } = K;
    const pct  = e.def.capacity > 0 ? Math.max(0, Math.min(1, e.charge / e.def.capacity)) : 0;
    const on   = e.powered && !e._lightningDamaged;
    const hot  = on && pct > 0.03;
    const zoom = Camera.zoom, detail = zoom > 0.5, mid = zoom > 0.34;
    const charging    = on && !!e.charging;
    const discharging = on && !e.charging && pct > 0.02 && pct < 0.99;
    const CX = 160, CY = 156;
    // star colour: deep orange when low, gold through the middle, white-hot full
    const sun = pct < 0.5
      ? [255, Math.round(120 + 160 * pct), Math.round(40 + 60 * pct)]
      : [255, Math.round(200 + 55 * (pct - 0.5) * 2), Math.round(70 + 170 * (pct - 0.5) * 2)];
    const SUN = sun.join(',');
    const sunA = (a) => `rgba(${SUN},${a})`;
    const gold = (a) => `rgba(255,214,120,${a})`;
    const amber = (a) => `rgba(255,150,60,${a})`;
    const dimC = 'rgba(130,130,150,0.5)';
    const jit = (k) => { const v = Math.sin(k * 71.3 + Math.floor(t * 10) * 17.9 + e.col * 5.3 + e.row * 2.9) * 43758.5453; return v - Math.floor(v); };

    ctx.save();
    if (hot && zoom > 0.3) _lgAdd(K, CX, CY, 210, SUN, 0.1 + 0.25 * pct + 0.04 * Math.sin(t * 1.3));

    // ── Plinth: octagonal slab, gilded trim, concentric deck rings ──
    const oct = (r, cx, cy) => { const p = []; for (let k = 0; k < 8; k++) { const a = Math.PI / 8 + k * Math.PI / 4; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; };
    poly(oct(166, 160, 160), '#0a0a12');
    poly(oct(156, 160, 160), '#12121e');
    ctx.strokeStyle = hot ? gold(0.55 + 0.3 * pct) : dimC; ctx.lineWidth = 1.8 * S;
    ctx.beginPath(); oct(166, 160, 160).forEach(([x, y], i) => i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))); ctx.closePath(); ctx.stroke();
    if (detail) {
      ctx.strokeStyle = 'rgba(255,220,150,0.06)'; ctx.lineWidth = 0.8 * S;
      for (const r of [40, 72, 104, 136]) { ctx.beginPath(); ctx.ellipse(X(CX), Y(CY), r * S, r * 0.86 * S, 0, 0, Math.PI * 2); ctx.stroke(); }
    }

    // ── Monolith ring positions, radial channels into the star ──
    const MON = [];
    for (let k = 0; k < 8; k++) { const a = -Math.PI / 2 + k * Math.PI / 4; MON.push([CX + Math.cos(a) * 118, CY + Math.sin(a) * 104, a]); }
    if (mid) for (let k = 0; k < 8; k++) {
      const [mx, my, a] = MON[k];
      const ex = CX + Math.cos(a) * 40, ey = CY + Math.sin(a) * 34;
      ln(mx, my + 8, ex, ey, '#1c1a28', 5);
      ln(mx, my + 8, ex, ey, hot ? (discharging ? amber(0.5) : gold(0.45)) : dimC, 1.2);
      if ((charging || discharging) && detail) for (let q = 0; q < 3; q++) {
        let f = (t * 0.7 + q / 3 + k * 0.11) % 1; if (discharging) f = 1 - f;
        const qx = mx + (ex - mx) * f, qy = my + 8 + (ey - my - 8) * f;
        dot(qx, qy, 1.8, charging ? gold(0.95) : amber(0.95));
        if (zoom > 0.65) _lgAdd(K, qx, qy, 6, charging ? '255,214,120' : '255,150,60', 0.35);
      }
    }

    // ── The star, behind its armillary ──
    const pulse = 1 + 0.06 * Math.sin(t * 2.3) * (hot ? 1 : 0);
    const SR = (16 + 18 * pct) * pulse;
    if (hot) {
      _lgAdd(K, CX, CY, SR * 3.4, SUN, 0.3 + 0.45 * pct);
      // corona flicker
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8 + t * 0.2, len = SR * (1.25 + 0.35 * jit(k));
        ln(CX + Math.cos(a) * SR * 0.9, CY + Math.sin(a) * SR * 0.9, CX + Math.cos(a) * len, CY + Math.sin(a) * len, sunA(0.18 + 0.2 * pct), 2.4);
      }
      ctx.restore();
    }
    {
      const g = ctx.createRadialGradient(X(CX - SR * 0.25), Y(CY - SR * 0.25), 0, X(CX), Y(CY), SR * S);
      g.addColorStop(0, hot ? '#ffffff' : '#6a6470'); g.addColorStop(0.5, hot ? sunA(1) : '#3e3a46'); g.addColorStop(1, hot ? sunA(0.55) : '#1e1c24');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X(CX), Y(CY), SR * S, 0, Math.PI * 2); ctx.fill();
      if (hot && detail) {
        // granulation and a prominence looping off the limb
        for (let k = 0; k < 10; k++) { const a = jit(200 + k) * Math.PI * 2, r = jit(220 + k) * SR * 0.7; dot(CX + Math.cos(a) * r, CY + Math.sin(a) * r, 1.4, 'rgba(255,255,230,0.35)'); }
        const pa = t * 0.15, px0 = CX + Math.cos(pa) * SR, py0 = CY + Math.sin(pa) * SR;
        const px1 = CX + Math.cos(pa + 0.6) * SR, py1 = CY + Math.sin(pa + 0.6) * SR;
        const cpx = CX + Math.cos(pa + 0.3) * SR * (1.7 + 0.2 * Math.sin(t * 1.7)), cpy = CY + Math.sin(pa + 0.3) * SR * (1.7 + 0.2 * Math.sin(t * 1.7));
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = sunA(0.7); ctx.lineWidth = 2.2 * S; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(X(px0), Y(py0)); ctx.quadraticCurveTo(X(cpx), Y(cpy), X(px1), Y(py1)); ctx.stroke();
        ctx.restore(); ctx.lineCap = 'butt';
      }
    }

    // ── Armillary: three rings on different axes ──
    const speed = 0.25 + 1.8 * pct;
    const ring = (rx, ry, rot, col, w, beads) => {
      ctx.save(); ctx.translate(X(CX), Y(CY)); ctx.rotate(rot);
      ctx.strokeStyle = col; ctx.lineWidth = w * S;
      ctx.beginPath(); ctx.ellipse(0, 0, rx * S, Math.max(0.5, Math.abs(ry)) * S, 0, 0, Math.PI * 2); ctx.stroke();
      if (beads && hot) for (let b = 0; b < beads; b++) {
        const a = t * speed * 2 + b * Math.PI * 2 / beads;
        ctx.fillStyle = sunA(1); ctx.beginPath(); ctx.arc(Math.cos(a) * rx * S, Math.sin(a) * ry * S, 2 * S, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    };
    const rc = (a) => hot ? gold(a) : 'rgba(140,140,160,0.45)';
    ring(58, 58 * Math.cos(t * speed * 0.5), 0.3, rc(0.75), 3, 3);
    ring(64, 64 * Math.cos(t * speed * 0.37 + 1.3), -0.9, rc(0.6), 2.4, 2);
    ring(70, 22, t * speed * 0.2, rc(0.5), 2, 4);

    // holographic gauge: an arc round the armillary
    if (mid) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(200,180,140,0.16)'; ctx.lineWidth = 3.2 * S;
      ctx.beginPath(); ctx.ellipse(X(CX), Y(CY), 84 * S, 76 * S, 0, Math.PI * 0.7, Math.PI * 2.3); ctx.stroke();
      if (pct > 0.005) {
        ctx.strokeStyle = hot ? sunA(0.9) : dimC;
        ctx.beginPath(); ctx.ellipse(X(CX), Y(CY), 84 * S, 76 * S, 0, Math.PI * 0.7, Math.PI * (0.7 + 1.6 * pct)); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }

    // ── Monoliths: dark obelisks with crystal heads ──
    const order = MON.map((m, k) => k).sort((a, b) => MON[a][1] - MON[b][1]);   // back to front
    for (const k of order) {
      const [mx, my] = MON[k];
      ell(mx + 2, my + 16, 11, 3.6, 'rgba(0,0,0,0.4)');
      RR(mx - 9, my + 8, 18, 9, 2, '#1a1824');
      poly([[mx - 6, my + 10], [mx + 6, my + 10], [mx + 4, my - 16], [mx - 4, my - 16]], '#24222f');
      poly([[mx + 1, my + 10], [mx + 6, my + 10], [mx + 4, my - 16], [mx + 1, my - 16]], 'rgba(0,0,0,0.3)');
      // charge rune slots
      for (let c = 0; c < 5; c++) {
        const lit = hot && (c + 0.5) / 5 <= pct;
        R(mx - 2.5, my + 6 - c * 4.4, 5, 1.8, lit ? sunA(0.95) : 'rgba(60,58,72,0.9)');
      }
      // crystal head
      poly([[mx, my - 30], [mx + 6, my - 20], [mx, my - 15], [mx - 6, my - 20]], hot ? sunA(0.55 + 0.4 * pct) : '#4a4658');
      poly([[mx, my - 30], [mx + 6, my - 20], [mx, my - 15]], hot ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.08)');
      if (hot) _lgAdd(K, mx, my - 22, 16, SUN, 0.2 + 0.35 * pct);
    }

    // plasma streams from the crystals into the star while charging
    if (charging && detail) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 8; k++) {
        if (jit(400 + k) > 0.55) continue;
        const [mx, my] = MON[k], sx = mx, sy = my - 22;
        const bend = (jit(410 + k) - 0.5) * 30;
        for (const [w, a] of [[5, 0.18], [1.6, 0.8]]) {
          ctx.strokeStyle = gold(a); ctx.lineWidth = w * S; ctx.beginPath();
          ctx.moveTo(X(sx), Y(sy)); ctx.quadraticCurveTo(X((sx + CX) / 2 + bend), Y((sy + CY) / 2 - 10), X(CX), Y(CY)); ctx.stroke();
        }
      }
      ctx.restore();
    }

    // ── Control dais and label ──
    RR(124, 276, 72, 20, 3, '#16141e');
    R(127, 279, 66, 14, on ? '#1e1408' : '#121216');
    if (on && detail) for (let b = 0; b < 12; b++) {
      const hgt = 2 + 9 * Math.abs(Math.sin(t * 1.8 + b * 0.7)) * (0.3 + 0.7 * pct);
      R(129 + b * 5.3, 292 - hgt, 3.4, hgt, charging ? gold(0.85) : discharging ? amber(0.85) : 'rgba(200,190,140,0.6)');
    }
    if (detail) {
      text('HELIOS MK5', CX, 20, 8, hot ? sunA(0.95) : 'rgba(160,155,170,0.7)', '"JetBrains Mono", "Courier New", monospace');
      text(`${Math.round(pct * 100)}%`, CX, CY + 92, 8, hot ? sunA(0.95) : 'rgba(160,155,170,0.7)', '"JetBrains Mono", "Courier New", monospace');
    }
    if (!on && detail) {
      RR(CX - 56, CY - 10, 112, 20, 3, 'rgba(14,10,14,0.82)');
      text(e._lightningDamaged ? 'STRUCK: OFFLINE' : 'OFFLINE', CX, CY, 9, 'rgba(255,90,70,0.95)', '"Courier New", monospace');
    }
    ctx.restore();
}

// ── Engineering Office (10×8) ────────────────────────────────────────────
// Where the Engineering Audit is bought (advisor.js), authored natively at
// 400×320 units and seen from above like the other stations. A campus round
// a glass-domed situation room: under the dome a holographic model of the
// network turns on its table, nodes joined by pipe runs, a scan line
// sweeping it and whichever node is at fault ringed in red, with engineers
// at a ring of consoles. East of it the drawing wing, its roof one big plan
// table where three pipe runs draw themselves in; below that the drone
// deck, three pads and a hangar, the inspection drones lifting off in turn
// to lap the site and set down again. A radar mast and a dish on the north
// side, survey trucks in the bay to the south-west, a forecourt and sign.
function renderEngOffice(e, px, py, t) {
  if (!e._ghost && (e.col * TILE !== px || e.row * TILE !== py)) return;
  const K = _nKit(px, py), { S, X, Y, R, RR, dot, ell, ln, text, glow } = K;
  const on = !!e.powered, night = DayNight.darkness() > 0.3;
  const detail = Camera.zoom > 0.35;
  const L = (d, n, o) => on ? (night ? n : d) : o;
  const blue = '122,216,255';
  const WHITE = L('#e6eaee', '#414a55', '#272b30'), DECK = L('#2b3d52', '#131b27', '#171b20');
  const STEEL = L('#8a96a2', '#3a424c', '#262a2e');
  const ring = (x, y, r, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w * S; ctx.beginPath(); ctx.arc(X(x), Y(y), r * S, 0, Math.PI * 2); ctx.stroke(); };

  // ── Site: paved pad, kerb, lane markings, planting ──
  RR(4, 4, 392, 312, 8, L('#4a535d', '#1b2129', '#17191c'));
  ctx.strokeStyle = L('#7a848e', '#323a44', '#24272b'); ctx.lineWidth = 2 * S; ctx.strokeRect(X(8), Y(8), 384 * S, 304 * S);
  if (detail) {
    for (let x = 24; x < 390; x += 24) R(x, 8, 0.6, 304, 'rgba(0,0,0,0.07)');
    for (let y = 24; y < 312; y += 24) R(8, y, 384, 0.6, 'rgba(0,0,0,0.07)');
    for (const [tx, ty] of [[22, 150], [22, 196], [236, 22], [386, 158], [136, 300], [164, 300], [224, 300]]) {
      dot(tx + 1.5, ty + 2, 8, 'rgba(0,0,0,0.2)'); dot(tx, ty, 8, L('#3e7a3c', '#1c3a22', '#182018')); dot(tx - 2.5, ty - 2.5, 4, L('#62a652', '#2a4c2c', '#1c261c'));
    }
  }

  // ── Drawing wing (east): the roof is a plan table ──
  RR(262, 34, 128, 122, 5, 'rgba(0,0,0,0.3)');
  RR(256, 28, 128, 122, 5, WHITE);
  RR(262, 34, 116, 110, 3, DECK);
  RR(268, 40, 104, 76, 3, L('#101820', '#080c12', '#0a0c0e'));
  RR(271, 43, 98, 70, 2, on ? '#06223a' : '#0a1016');
  if (on) {
    ctx.save(); ctx.beginPath(); ctx.rect(X(271), Y(43), 98 * S, 70 * S); ctx.clip();
    if (detail) { ctx.strokeStyle = `rgba(${blue},0.13)`; ctx.lineWidth = 0.6 * S; ctx.beginPath();
      for (let k = 1; k < 7; k++) { ctx.moveTo(X(271), Y(43 + k * 10)); ctx.lineTo(X(369), Y(43 + k * 10)); }
      for (let k = 1; k < 10; k++) { ctx.moveTo(X(271 + k * 9.8), Y(43)); ctx.lineTo(X(271 + k * 9.8), Y(113)); } ctx.stroke(); }
    // three runs draw in one after another over a 12 s loop, then a fault is ringed
    const RUNS = [
      [[278, 104], [278, 60], [304, 60], [304, 84], [330, 84]],
      [[330, 84], [330, 54], [362, 54]],
      [[304, 84], [304, 104], [350, 104], [350, 74], [362, 74]],
    ];
    const u = (t / 12) % 1;
    ctx.lineJoin = 'round'; ctx.lineWidth = 2.2 * S;
    RUNS.forEach((pts, i) => {
      const f = Math.max(0, Math.min(1, (u - i * 0.18) / 0.2));
      if (f <= 0) return;
      let total = 0; for (let k = 1; k < pts.length; k++) total += Math.abs(pts[k][0] - pts[k-1][0]) + Math.abs(pts[k][1] - pts[k-1][1]);
      let left = f * total;
      ctx.strokeStyle = [`rgba(${blue},0.95)`, 'rgba(255,216,96,0.95)', 'rgba(120,255,170,0.95)'][i];
      ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
      for (let k = 1; k < pts.length && left > 0; k++) {
        const len = Math.abs(pts[k][0] - pts[k-1][0]) + Math.abs(pts[k][1] - pts[k-1][1]), g = Math.min(1, left / len);
        ctx.lineTo(X(pts[k-1][0] + (pts[k][0] - pts[k-1][0]) * g), Y(pts[k-1][1] + (pts[k][1] - pts[k-1][1]) * g));
        left -= len;
      }
      ctx.stroke();
    });
    const NODES = [[278, 104], [304, 60], [330, 84], [362, 54], [350, 104], [362, 74]];
    for (const [nx, ny] of NODES) R(nx - 3.5, ny - 3.5, 7, 7, `rgba(${blue},0.9)`);
    if (u > 0.62) {
      const [fx, fy] = NODES[1 + Math.floor(t / 12) % (NODES.length - 1)];
      const p = 0.5 + 0.5 * Math.sin(t * 7);
      ring(fx, fy, 8 + p * 3, `rgba(255,90,72,${(0.55 + 0.45 * p).toFixed(2)})`, 1.8);
    }
    ctx.restore();
    glow(320, 78, 80, blue, night ? 0.24 : 0.09);
  }
  R(266, 37, 108, 4, L('#f4f6f8', '#5a646e', '#2e3237'));                                   // canopy edge
  // roof plant along the south edge of the wing
  for (let k = 0; k < 4; k++) {
    RR(270 + k * 26, 124, 20, 14, 2, STEEL);
    if (detail) { dot(280 + k * 26, 131, 4.6, L('#20303c', '#0e161c', '#101418'));
      ctx.save(); ctx.translate(X(280 + k * 26), Y(131)); ctx.rotate(on ? t * 7 + k : k); ctx.fillStyle = L('#c9d2da', '#5a646e', '#2c3036'); ctx.fillRect(-4 * S, -0.7 * S, 8 * S, 1.4 * S); ctx.fillRect(-0.7 * S, -4 * S, 1.4 * S, 8 * S); ctx.restore(); }
  }

  // ── Link bridge from the dome to the wing ──
  R(226, 96, 34, 16, 'rgba(0,0,0,0.25)'); R(224, 92, 36, 16, WHITE); R(226, 95, 32, 10, on ? (night ? 'rgba(190,232,255,0.8)' : 'rgba(120,180,220,0.75)') : '#15181c');

  // ── The situation room: a glass dome over the holo table ──
  const CX = 140, CY = 140, RO = 100;
  dot(CX + 7, CY + 9, RO, 'rgba(0,0,0,0.3)');
  dot(CX, CY, RO, WHITE);
  dot(CX, CY, RO - 10, L('#b8c2cc', '#2e3640', '#202428'));
  dot(CX, CY, RO - 16, on ? (night ? '#04121e' : '#0b2032') : '#0c1014');                  // the glass, looking down into the room
  if (on) {
    // floor rings and the console circle
    ring(CX, CY, 70, `rgba(${blue},0.22)`, 1); ring(CX, CY, 50, `rgba(${blue},0.16)`, 0.8);
    if (detail) for (let k = 0; k < 10; k++) {
      const a = k * Math.PI / 5 + 0.3, x = CX + Math.cos(a) * 70, y = CY + Math.sin(a) * 70;
      ctx.save(); ctx.translate(X(x), Y(y)); ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = '#16283a'; ctx.fillRect(-8 * S, -3 * S, 16 * S, 6 * S);
      ctx.fillStyle = `rgba(${blue},${(0.55 + 0.4 * Math.sin(t * 2 + k * 1.7)).toFixed(2)})`; ctx.fillRect(-6 * S, -2 * S, 12 * S, 2.4 * S);
      ctx.restore();
      dot(CX + Math.cos(a) * 60, CY + Math.sin(a) * 60, 2.4, k % 3 ? '#f4f8fa' : '#ffd070');   // an engineer at each desk
    }
    // the model: nodes on two orbits, joined up, turning slowly
    const spin = t * 0.22, N = [];
    for (let k = 0; k < 5; k++) { const a = spin + k * Math.PI * 2 / 5; N.push([CX + Math.cos(a) * 36, CY + Math.sin(a) * 36]); }
    for (let k = 0; k < 3; k++) { const a = -spin * 1.6 + k * Math.PI * 2 / 3; N.push([CX + Math.cos(a) * 15, CY + Math.sin(a) * 15]); }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${blue},0.75)`; ctx.lineWidth = 1.8 * S; ctx.beginPath();
    for (let k = 0; k < 5; k++) { ctx.moveTo(X(N[k][0]), Y(N[k][1])); ctx.lineTo(X(N[(k + 1) % 5][0]), Y(N[(k + 1) % 5][1])); ctx.moveTo(X(N[k][0]), Y(N[k][1])); ctx.lineTo(X(N[5 + k % 3][0]), Y(N[5 + k % 3][1])); }
    ctx.stroke();
    // flow pulses running along the outer loop
    for (let k = 0; k < 5; k++) { const f = (t * 0.5 + k * 0.37) % 1, a = N[k], b = N[(k + 1) % 5]; dot(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 2, 'rgba(255,255,255,0.9)'); }
    // scan sweep
    const sw = t * 1.4;
    const sg = ctx.createRadialGradient(X(CX), Y(CY), 0, X(CX), Y(CY), 48 * S);
    sg.addColorStop(0, `rgba(${blue},0.34)`); sg.addColorStop(1, `rgba(${blue},0)`);
    ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(X(CX), Y(CY)); ctx.arc(X(CX), Y(CY), 48 * S, sw - 0.5, sw); ctx.closePath(); ctx.fill();
    ctx.restore();
    const bad = Math.floor(t / 10) % 5;
    N.forEach(([nx, ny], k) => { dot(nx, ny, k < 5 ? 5 : 3.6, k === bad ? '#ff5a48' : `rgba(${blue},0.95)`); dot(nx - 1, ny - 1, 1.4, 'rgba(255,255,255,0.8)'); });
    { const p = 0.5 + 0.5 * Math.sin(t * 6); ring(N[bad][0], N[bad][1], 9 + p * 4, `rgba(255,90,72,${(0.4 + 0.5 * p).toFixed(2)})`, 1.6); }
    dot(CX, CY, 4, '#eaffff');
    glow(CX, CY, 90, blue, night ? 0.4 : 0.16);
  }
  // dome ribs, the ring beam and a highlight on the glass
  ctx.strokeStyle = L('rgba(240,246,250,0.55)', 'rgba(150,180,210,0.28)', 'rgba(80,84,90,0.5)'); ctx.lineWidth = 1.4 * S; ctx.beginPath();
  for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; ctx.moveTo(X(CX + Math.cos(a) * 22), Y(CY + Math.sin(a) * 22)); ctx.lineTo(X(CX + Math.cos(a) * (RO - 16)), Y(CY + Math.sin(a) * (RO - 16))); }
  ctx.stroke();
  ring(CX, CY, 22, L('rgba(240,246,250,0.7)', 'rgba(150,180,210,0.35)', 'rgba(80,84,90,0.5)'), 1.4);
  ring(CX, CY, RO - 16, L('#f4f6f8', '#6a7682', '#34383d'), 2.4);
  if (on && !night) { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 5 * S; ctx.beginPath(); ctx.arc(X(CX), Y(CY), (RO - 28) * S, Math.PI * 1.08, Math.PI * 1.42); ctx.stroke(); }
  // blue marker lights round the parapet
  if (on) for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, b = 0.4 + 0.6 * Math.max(0, Math.sin(t * 2.4 - k * 0.8)); dot(CX + Math.cos(a) * (RO - 5), CY + Math.sin(a) * (RO - 5), 1.6, `rgba(${blue},${b.toFixed(2)})`); }

  // ── Radar mast and dish (north) ──
  R(226, 26, 22, 22, L('#3a4c60', '#182230', '#1a1e24'));
  ctx.strokeStyle = L('#3a8ad8', '#2a5a94', '#1c2a3a'); ctx.lineWidth = 1.6 * S;
  ctx.strokeRect(X(228), Y(28), 18 * S, 18 * S);
  ctx.beginPath(); ctx.moveTo(X(228), Y(28)); ctx.lineTo(X(246), Y(46)); ctx.moveTo(X(246), Y(28)); ctx.lineTo(X(228), Y(46)); ctx.stroke();
  ctx.save(); ctx.translate(X(237), Y(37)); ctx.rotate(on ? t * 1.6 : 0.5); ctx.fillStyle = L('#e8eef4', '#9aa8b6', '#40464e'); ctx.fillRect(-15 * S, -1.6 * S, 30 * S, 3.2 * S); ctx.restore();
  { const bl = on && Math.sin(t * 3) > 0.2; dot(237, 37, 3, bl ? '#ff4030' : '#5a1e1a'); if (bl) glow(237, 37, 16, '255,64,48', 0.5); }
  ell(40, 44, 22, 9, 'rgba(0,0,0,0.25)');
  dot(36, 38, 21, L('#eef2f6', '#5c6670', '#2e3238')); dot(36, 38, 16.5, L('#c9d2da', '#434c56', '#25292e'));
  ctx.save(); ctx.translate(X(36), Y(38)); ctx.rotate(on ? Math.sin(t * 0.3) * 0.8 : 0.4);
  ctx.strokeStyle = L('#5a6672', '#8a9aaa', '#3a4048'); ctx.lineWidth = 2 * S; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(13 * S, -13 * S); ctx.stroke();
  ctx.fillStyle = on ? `rgba(${blue},0.9)` : '#2a3038'; ctx.beginPath(); ctx.arc(13 * S, -13 * S, 3 * S, 0, Math.PI * 2); ctx.fill(); ctx.restore();

  // ── Drone deck (south-east): hangar and three pads ──
  RR(262, 170, 128, 136, 5, 'rgba(0,0,0,0.3)');
  RR(256, 164, 128, 136, 5, L('#39444f', '#151b23', '#181b1f'));
  RR(262, 252, 116, 42, 3, WHITE); R(262, 252, 116, 6, STEEL);
  for (let k = 0; k < 3; k++) R(268 + k * 38, 262, 28, 28, on ? (night ? '#ffe2a0' : '#1c2630') : '#101214');   // hangar doors
  const PADS = [[282, 208], [320, 208], [358, 208]];
  for (const [ppx, ppy] of PADS) {
    dot(ppx, ppy, 17, L('#28323c', '#0f141b', '#121518'));
    ring(ppx, ppy, 13, L('rgba(240,244,248,0.85)', 'rgba(150,170,190,0.5)', 'rgba(70,74,80,0.6)'), 1.3);
    if (on && detail) for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; dot(ppx + Math.cos(a) * 16, ppy + Math.sin(a) * 16, 1.1, night ? '#60ff90' : '#3a7a48'); }
  }
  if (detail) text('DRONE DECK', 320, 178, 6, L('#9fb4c8', '#5a6e84', '#2e343c'), 'Arial, sans-serif');

  // ── Survey trucks in the bay (south-west), forecourt and sign ──
  RR(18, 256, 92, 48, 3, L('#39444f', '#151b23', '#181b1f'));
  for (let k = 0; k < 3; k++) {
    const vx = 24 + k * 29, vy = 262;
    if (detail) R(vx - 3, 258, 0.8, 44, 'rgba(255,255,255,0.3)');
    RR(vx + 2, vy + 2, 20, 36, 3, 'rgba(0,0,0,0.3)');
    RR(vx, vy, 20, 36, 3, L('#f4f6f8', '#8a96a4', '#34383e'));
    R(vx, vy + 14, 20, 3, L('#3a8ad8', '#2a5a94', '#1c2a3a'));
    R(vx + 2, vy + 3, 16, 7, L('#1e2c3a', '#5a86a8', '#14181c'));
    if (on) R(vx + 6, vy + 0.5, 8, 2, Math.sin(t * 5 + k * 2) > 0.5 ? '#ffb020' : '#6a4a10');
  }
  R(132, 238, 16, 46, L('#c8ccd2', '#3e4650', '#262a2e'));                                  // walk from the dome's south door
  RR(96, 286, 150, 20, 3, L('#f4f6f8', '#0a1622', '#16181a'));
  R(96, 286, 5, 20, L('#3a8ad8', '#3a8ad8', '#1c2a3a'));
  text('ENGINEERING OFFICE', 174, 296.5, 10.5, L('#16406a', '#9be4ff', '#2a3038'));
  if (on && night) glow(172, 296, 90, blue, 0.14);

  // ── Inspection drones: each lifts off in turn, laps the site, sets down ──
  for (let k = 0; k < PADS.length; k++) {
    const [ppx, ppy] = PADS[k];
    const u = on ? ((t + k * 13) / 39) % 1 : 0;
    const air = u > 0.55 ? Math.min(1, (u - 0.55) / 0.05, (1 - u) / 0.05) : 0;
    const a = (u - 0.55) / 0.45 * Math.PI * 2;
    // out along an ellipse that passes back through its own pad
    const rx = 150 + k * 14, ry = 86 + k * 10;
    const dx = ppx + (Math.cos(a) - 1) * rx * air, dy = ppy - Math.sin(a) * ry * air - 60 * air * Math.sin(a / 2);
    const sc = 1 + air * 0.4, live = air > 0 || u > 0.5;
    if (air > 0) ell(dx + 5 * air, dy + 9 * air, 9, 4, 'rgba(0,0,0,0.25)');
    ctx.save(); ctx.translate(X(dx), Y(dy)); ctx.scale(sc, sc);
    ctx.strokeStyle = L('#2a3440', '#8aa0b4', '#3a4048'); ctx.lineWidth = 1.8 * S;
    ctx.beginPath(); ctx.moveTo(-7 * S, -7 * S); ctx.lineTo(7 * S, 7 * S); ctx.moveTo(7 * S, -7 * S); ctx.lineTo(-7 * S, 7 * S); ctx.stroke();
    ctx.fillStyle = L('#e8eef4', '#b8c8d8', '#4a5058'); ctx.fillRect(-3.2 * S, -3.2 * S, 6.4 * S, 6.4 * S);
    for (const [qx, qy] of [[-7, -7], [7, -7], [-7, 7], [7, 7]]) {
      ctx.fillStyle = on ? `rgba(${blue},${live ? 0.32 : 0.75})` : '#2a3038';
      ctx.beginPath(); ctx.arc(qx * S, qy * S, (live ? 4.8 : 2.6) * S, 0, Math.PI * 2); ctx.fill();
    }
    if (on) { ctx.fillStyle = Math.sin(t * 8 + k) > 0 ? '#ff4030' : '#5a1e1a'; ctx.beginPath(); ctx.arc(0, 0, 1.3 * S, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    if (on && night && air > 0) glow(dx, dy + 6, 18, '255,250,220', 0.3);
  }

  if (on && night) glow(200, 160, 230, blue, 0.07);
  if (!on && !e._ghost) text('NO POWER', 140, 140, 14, 'rgba(255,90,70,0.9)', 'Courier New, monospace');
}

function renderMonitor(e, px, py, t) {
    // Monitoring Station (authored as a 1×1 sprite, scaled to its footprint):
    // a telemetry mast on a bolted concrete plinth. A braced lattice mast
    // carries a weatherproof head cabinet whose bezelled screen shows a
    // scrolling generated-vs-consumed history with a net-load trace, plus a
    // status LED row; above it a small parabolic dish and a whip antenna
    // with a blinking beacon and a junction box at the base.
    const cx  = px + TILE / 2;
    const on  = e.powered;
    const detail = Camera.zoom > 0.5;
    const teal = '#40ffcc';

    // ── Concrete plinth with anchor bolts and a junction box ──
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(cx + 2, py + TILE - 3, 12, 3.2, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = on ? '#2c3c3c' : '#1a2424';
    ctx.beginPath(); ctx.moveTo(cx - 10, py + TILE - 3); ctx.lineTo(cx + 10, py + TILE - 3); ctx.lineTo(cx + 7, py + TILE - 8); ctx.lineTo(cx - 7, py + TILE - 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = on ? '#3a4e4e' : '#222e2e';
    ctx.fillRect(cx - 7, py + TILE - 8, 14, 1.5);
    ctx.fillStyle = '#8a9a9a';
    [-7.5, 7.5].forEach(bxo => { ctx.beginPath(); ctx.arc(cx + bxo, py + TILE - 4.6, 0.9, 0, Math.PI*2); ctx.fill(); });
    ctx.fillStyle = '#1e2a28'; ctx.fillRect(cx + 4, py + TILE - 13, 5, 6);
    ctx.strokeStyle = '#0a1210'; ctx.lineWidth = 0.6; ctx.strokeRect(cx + 4, py + TILE - 13, 5, 6);
    ctx.fillStyle = on ? teal : '#2a4a44'; ctx.fillRect(cx + 5.2, py + TILE - 11.4, 1.2, 1.2);

    // ── Lattice mast ──
    const headCY = py + TILE * 0.30;
    const mastTop = headCY + 8, mastBot = py + TILE - 8;
    ctx.strokeStyle = on ? '#3a6a6a' : '#1e3030'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - 2.2, mastBot); ctx.lineTo(cx - 1.2, mastTop); ctx.moveTo(cx + 2.2, mastBot); ctx.lineTo(cx + 1.2, mastTop); ctx.stroke();
    ctx.strokeStyle = on ? '#2a5252' : '#182626'; ctx.lineWidth = 0.7;
    const braces = 5;
    for (let q = 0; q < braces; q++) {
      const y0 = mastBot + (mastTop - mastBot) * q / braces, y1 = mastBot + (mastTop - mastBot) * (q + 1) / braces;
      ctx.beginPath(); ctx.moveTo(cx - 2.2, y0); ctx.lineTo(cx + 2.2, y1); ctx.moveTo(cx + 2.2, y0); ctx.lineTo(cx - 2.2, y1); ctx.stroke();
    }

    if (on && detail) {
      drawGlowHalo(cx, headCY, TILE * 0.75, [[0, teal], [1, 'transparent']], 0.20 + 0.06 * Math.sin(t * 2));
    }

    // ── Weatherproof head cabinet ──
    const bodyW = TILE - 8, bodyH = TILE * 0.44;
    const bx = cx - bodyW / 2, by = headCY - bodyH / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.roundRect(bx + 1.5, by + 2, bodyW, bodyH, 3); ctx.fill();
    const cg = ctx.createLinearGradient(0, by, 0, by + bodyH);
    cg.addColorStop(0, on ? '#2a4646' : '#182626'); cg.addColorStop(1, on ? '#0c1a1a' : '#08100f');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.roundRect(bx, by, bodyW, bodyH, 3); ctx.fill();
    ctx.strokeStyle = on ? `rgba(64,255,200,${0.5 + 0.2*Math.sin(t*3)})` : '#1a3030'; ctx.lineWidth = 1.2; ctx.stroke();
    // corner rivets and a rain hood along the top
    ctx.fillStyle = on ? '#7ac0b0' : '#3a5450';
    [[bx + 2, by + 2], [bx + bodyW - 2, by + 2], [bx + 2, by + bodyH - 2], [bx + bodyW - 2, by + bodyH - 2]].forEach(([rx, ry]) => { ctx.beginPath(); ctx.arc(rx, ry, 0.6, 0, Math.PI*2); ctx.fill(); });
    ctx.fillStyle = on ? '#3a6262' : '#1e3232';
    ctx.beginPath(); ctx.moveTo(bx - 1, by + 0.5); ctx.lineTo(bx + bodyW + 1, by + 0.5); ctx.lineTo(bx + bodyW - 1, by - 2.4); ctx.lineTo(bx + 1, by - 2.4); ctx.closePath(); ctx.fill();

    // ── Screen ──
    const sx = bx + 3.5, sy = by + 3.5;
    const sw = bodyW - 7, sh = bodyH - 10;
    ctx.fillStyle = '#02100c';
    ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 1.5); ctx.fill();

    if (on) {
      ctx.save(); ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 1.5); ctx.clip();
      // faint graticule
      ctx.strokeStyle = 'rgba(64,255,200,0.10)'; ctx.lineWidth = 0.4;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(sx, sy + sh*i/4); ctx.lineTo(sx + sw, sy + sh*i/4); ctx.stroke(); }
      for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(sx + sw*i/6, sy); ctx.lineTo(sx + sw*i/6, sy + sh); ctx.stroke(); }
      // scrolling generated-vs-consumed history (unchanged data model)
      const gen = PowerNetwork.stats.totalGenerated;
      const con = PowerNetwork.stats.totalConsumed;
      e._monHist = e._monHist || [];
      e._monHistT = e._monHistT || 0;
      if (t - e._monHistT > 0.4) {
        e._monHistT = t;
        e._monHist.push({ gen, con });
        if (e._monHist.length > 7) e._monHist.shift();
      }
      const hist = e._monHist.length ? e._monHist : [{ gen, con }];
      const maxV = Math.max(1, ...hist.map(h => Math.max(h.gen, h.con)));
      const barMaxH = sh - 3;
      const slotW = sw / hist.length;
      const barW = Math.max(1, slotW / 2 - 0.8);
      hist.forEach((h, i) => {
        const slotX = sx + i * slotW;
        const gh = Math.round((h.gen / maxV) * barMaxH);
        ctx.fillStyle = `rgba(0,200,255,${0.55 + 0.2*Math.sin(t*4)})`;
        ctx.fillRect(slotX, sy + sh - 1.5 - gh, barW, gh);
        const ch2 = Math.round((h.con / maxV) * barMaxH);
        ctx.fillStyle = `rgba(255,180,40,${0.55 + 0.2*Math.sin(t*4+1)})`;
        ctx.fillRect(slotX + barW + 0.8, sy + sh - 1.5 - ch2, barW, ch2);
      });
      // net-load trace over the bars
      if (hist.length > 1) {
        ctx.strokeStyle = 'rgba(200,255,240,0.85)'; ctx.lineWidth = 0.7; ctx.lineJoin = 'round';
        ctx.beginPath();
        hist.forEach((h, i) => {
          const lx = sx + i * slotW + slotW / 2;
          const ly = sy + sh - 1.5 - ((h.gen - h.con + maxV) / (2 * maxV)) * barMaxH;
          i ? ctx.lineTo(lx, ly) : ctx.moveTo(lx, ly);
        });
        ctx.stroke();
      }
      // sweeping scan line
      const scan = (t * 0.7) % 1;
      const sg2 = ctx.createLinearGradient(sx + sw * scan - 4, 0, sx + sw * scan + 1, 0);
      sg2.addColorStop(0, 'rgba(64,255,200,0)'); sg2.addColorStop(1, 'rgba(64,255,200,0.30)');
      ctx.fillStyle = sg2; ctx.fillRect(sx + sw * scan - 4, sy, 5, sh);
      // scanlines
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let i = 0; i < sh; i += 2.5) ctx.fillRect(sx, sy + i, sw, 0.8);
      ctx.restore();
    }
    // glass glare
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.moveTo(sx + 1, sy + 1); ctx.lineTo(sx + sw * 0.42, sy + 1); ctx.lineTo(sx + 1, sy + sh * 0.65); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = on ? 'rgba(64,255,200,0.4)' : 'rgba(40,80,72,0.5)'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.roundRect(sx, sy, sw, sh, 1.5); ctx.stroke();

    // Status LED row under the screen: link, power, data
    const ledY = by + bodyH - 3;
    [[teal, true], ['#60a0ff', on && Math.sin(t*6) > 0], ['#ffc040', on && Math.sin(t*2.4) > 0.3]].forEach(([col, lit], i) => {
      ctx.fillStyle = on && lit ? col : '#16262a';
      ctx.beginPath(); ctx.arc(bx + 5 + i * 3.6, ledY, 0.9, 0, Math.PI*2); ctx.fill();
    });
    // vent slots at the cabinet's right
    ctx.strokeStyle = on ? 'rgba(10,30,26,0.9)' : 'rgba(6,16,14,0.9)'; ctx.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(bx + bodyW - 9, ledY - 1 + i * 0.9 - 0.9); ctx.lineTo(bx + bodyW - 3, ledY - 1 + i * 0.9 - 0.9); ctx.stroke(); }

    // ── Small parabolic dish on a side arm ──
    const dishX = bx - 1, dishY = by - 4;
    ctx.strokeStyle = on ? '#3a6060' : '#1a2828'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(bx + 4, by - 2.4); ctx.lineTo(dishX + 2, dishY + 1); ctx.stroke();
    ctx.save(); ctx.translate(dishX, dishY); ctx.rotate(-0.5);
    const dg = ctx.createLinearGradient(-5, 0, 5, 0);
    dg.addColorStop(0, on ? '#e8f4f0' : '#8a9a96'); dg.addColorStop(1, on ? '#6a8a84' : '#3a4a46');
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.1, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#1e302c'; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.strokeStyle = '#1e302c'; ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(3.4, -3.2); ctx.stroke();
    ctx.fillStyle = on ? '#ffcf60' : '#4a4030'; ctx.beginPath(); ctx.arc(3.4, -3.2, 0.9, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // ── Whip antenna with a pulsing transmit ring and blinking beacon ──
    ctx.strokeStyle = on ? '#4a7a7a' : '#1a2828';
    ctx.lineWidth = 1.1; ctx.lineCap = 'round';
    const antX = bx + bodyW - 4, antTopY = by - 10;
    ctx.beginPath(); ctx.moveTo(antX, by - 2); ctx.lineTo(antX, antTopY); ctx.stroke();
    ctx.fillStyle = on ? '#7ab0b0' : '#2a4040';
    [by - 5, by - 8].forEach(ay => { ctx.fillRect(antX - 1.4, ay, 2.8, 0.7); });
    ctx.beginPath();
    ctx.fillStyle = on ? `rgba(255,90,90,${0.5 + 0.5*Math.max(0, Math.sin(t*3))})` : '#402020';
    ctx.arc(antX, antTopY, 1.6, 0, Math.PI*2); ctx.fill();
    if (on && detail) {
      const rp = (t * 0.9) % 1;
      ctx.strokeStyle = `rgba(64,255,200,${0.5*(1 - rp)})`; ctx.lineWidth = 0.7;
      ctx.beginPath(); ctx.arc(antX, antTopY, 2 + rp * 8, -2.6, -0.5); ctx.stroke();
      ctx.beginPath(); ctx.arc(antX, antTopY, 2 + rp * 8, Math.PI + 0.5, Math.PI + 2.6 - Math.PI); ctx.stroke();
    }

    // Reliability warning dot
    if ((e.reliability !== undefined) && e.reliability < 80) {
      ctx.save();
      ctx.fillStyle = e.reliability < 50 ? '#ff4444' : '#f0a020';
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(bx + bodyW - 6, by + bodyH - 3, 2.6, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

// Communications Beacon — 2×3. Authored directly in footprint pixels rather
// than as a 1×1 sprite scaled by dispatchScaledRender: the footprint is
// non-square, so a uniform-sprite scale of (2, 3) would stretch the dish into
// an ellipse and thicken the mast horizontally but not vertically.
function renderBeacon(e, px, py, t) {
    // Communications Beacon — 5×6, authored in a 40-unit tile (200×240).
    // A red-and-white banded lattice tower with a caged ladder and two railed
    // platforms. The lower platform carries a big tracking dish that slews
    // across the sky while the beacon sweeps for contract work and parks
    // pointing straight up when idle; the head carries a rotating beacon, whip
    // antennas and the aviation light. At the foot: an operations cabin whose
    // window shows a radar scope sweeping, an equipment cabinet, the cable
    // tray across to the tower and guy wires out to anchor blocks.
    //
    // Multi-tile guard — the main loop early-outs on non-anchor tiles, but the
    // drag-ghost path calls this directly at an arbitrary hover position.
    const _def = EntityDefs[T.BEACON];
    const fw = (e.width  || _def.width)  * TILE;
    const fh = (e.height || _def.height) * TILE;
    const cx = px + fw / 2;
    const u  = TILE / 40;
    const X = (v) => px + v*u, Y = (v) => py + v*u;

    // `on` drives every lit part of this thing: the transmit rings, the
    // spinning beacon, the slewing dish, the scope, the cabinet LEDs and the
    // brighter steel. It used to mean "wired to a live network", which was
    // the same as "working" back when the beacon drew its 6 kW around the
    // clock. It is not any more — an idle beacon draws nothing and does
    // nothing, so a permanently pulsing mast was advertising work it was not
    // doing.
    //
    // A sweep that has been started but has lost power counts as off too:
    // it is stalled, not transmitting (the search clock is paused in
    // contract_system.js's tickOffers for exactly that reason).
    const _cs = typeof ContractSystem !== 'undefined' ? ContractSystem : null;
    const sweeping = !!(_cs && _cs.isSearching && _cs.isSearching());
    const on = e.powered && sweeping;
    const lit = !!e.powered;                    // wired to a live network, sweeping or not
    const detail = Camera.zoom > 0.5;
    const dark = typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;
    const C = (a, b) => lit ? a : b;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w*u, h*u); };
    const L = (x1, y1, x2, y2, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w*u; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    const E = (x, y, rx, ry, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(X(x), Y(y), rx*u, ry*u, 0, 0, Math.PI*2); ctx.fill(); };

    const MX = 100, BASE = 212, TOPY = 58;
    const half = (y) => 30 - 22 * (BASE - y) / (BASE - TOPY);   // leg half-spread

    ctx.save();
    ctx.lineCap = 'round';

    // ── Compound ───────────────────────────────────────────────────────
    ctx.fillStyle = C('#343a42', '#23272d');
    ctx.beginPath(); ctx.roundRect(X(8), Y(150), 184*u, 82*u, 5*u); ctx.fill();
    if (detail) for (let k = 0; k < 80; k++) {
      R(12 + (k*67) % 176, 154 + (k*29) % 74, 1.2, 1.2, k % 3 ? 'rgba(160,170,180,0.14)' : 'rgba(8,10,12,0.25)');
    }
    // Guy anchors and wires
    for (const ax of [16, 184]) {
      R(ax - 5, 222, 10, 6, C('#8a8a84', '#4a4a46'));
      R(ax - 5, 222, 10, 1.6, C('#a8a8a0', '#5a5a56'));
      if (detail) {
        L(ax, 223, MX + Math.sign(ax - MX)*half(80), 80, C('rgba(200,210,220,0.28)', 'rgba(120,130,140,0.14)'), 0.5);
        L(ax, 223, MX + Math.sign(ax - MX)*half(130), 130, C('rgba(200,210,220,0.22)', 'rgba(120,130,140,0.12)'), 0.5);
      }
    }

    // ── Operations cabin with a radar scope in the window ──────────────
    R(18, 222, 56, 3, 'rgba(0,0,0,0.28)');
    R(16, 180, 56, 42, C('#d8dcd4', '#6a6c68'));
    for (const sx of [30, 44, 58]) L(sx, 181, sx, 222, 'rgba(0,0,0,0.12)', 0.4);
    R(14, 175, 60, 6, C('#56606a', '#343a40'));                        // roof
    R(14, 180, 60, 1.2, C('#3a424a', '#22262a'));
    R(24, 172, 12, 4, C('#8a9298', '#4a4e52'));                        // rooftop A/C
    R(22, 188, 24, 16, '#0c1216');                                     // window
    {
      const sx = 34, sy = 196, sr = 6.2;
      E(sx, sy, sr, sr, on ? '#06220e' : C('#0c1a12', '#0a0e0c'));
      ctx.strokeStyle = on ? 'rgba(80,255,130,0.5)' : C('rgba(60,140,90,0.35)', 'rgba(40,60,50,0.3)');
      ctx.lineWidth = 0.5*u;
      ctx.beginPath(); ctx.ellipse(X(sx), Y(sy), sr*0.55*u, sr*0.55*u, 0, 0, Math.PI*2); ctx.stroke();
      if (on) {
        const a = t*2.2;
        for (let k = 0; k < 6; k++) {                                  // fading sweep trail
          const ak = a - k*0.12;
          L(sx, sy, sx + Math.cos(ak)*sr, sy + Math.sin(ak)*sr, `rgba(90,255,140,${(0.8 - k*0.13).toFixed(2)})`, 0.7);
        }
        const blip = (Math.floor(t*0.5) * 2.4) % (Math.PI*2);          // a contact that lights as the sweep passes
        const since = ((a - blip) % (Math.PI*2) + Math.PI*2) % (Math.PI*2);
        if (since < 1.5) E(sx + Math.cos(blip)*sr*0.7, sy + Math.sin(blip)*sr*0.7, 0.9, 0.9, `rgba(255,220,120,${(1 - since/1.5).toFixed(2)})`);
      }
    }
    R(47, 186, 18, 36, C('#5a6a7a', '#343c44'));                       // door
    R(62, 203, 1.4, 1.4, C('#dde2e6', '#6a6e72'));
    R(49, 182, 14, 2.5, lit && dark > 0.3 ? '#fff2c0' : C('#5a5e62', '#3a3c3e'));   // door light
    ctx.font = `bold ${Math.max(3, 4*u)}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C('#3a5878', 'rgba(50,56,62,0.9)');
    ctx.fillText('COMMS', X(34), Y(211));
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // ── Equipment cabinet ──────────────────────────────────────────────
    R(142, 220, 38, 3, 'rgba(0,0,0,0.28)');
    R(140, 190, 36, 30, C('#56606c', '#343a42'));
    L(158, 191, 158, 219, 'rgba(0,0,0,0.25)', 0.5);
    for (let v = 0; v < 4; v++) L(162, 198 + v*3.5, 172, 198 + v*3.5, 'rgba(0,0,0,0.25)', 0.5);
    R(143, 195, 12, 5, '#101820');
    for (let i = 0; i < 3; i++) {
      R(144.4 + i*3.8, 196.6, 2.2, 2, on ? `rgba(90,200,255,${(0.25 + 0.6*Math.abs(Math.sin(t*3 + i*1.1))).toFixed(2)})` : C('#1f3a2a', '#1a1e22'));
    }

    // ── Cable tray across to the tower ─────────────────────────────────
    L(72, 184, MX - half(184) + 2, 184, C('#8a949c', '#4a5056'), 1);
    L(72, 188, MX - half(188) + 2, 188, C('#8a949c', '#4a5056'), 1);
    for (let rx = 75; rx < MX - half(186); rx += 4) L(rx, 184, rx, 188, C('#6a747c', '#3a3e42'), 0.5);
    L(176, 205, MX + half(205) - 2, 205, '#15191d', 1.2);

    // ── Lattice tower ──────────────────────────────────────────────────
    R(MX - 36, BASE - 1, 72, 7, C('#8a8a84', '#4e4e4a'));               // footing
    R(MX - 36, BASE - 1, 72, 2, C('#a8a8a0', '#5e5e5a'));
    const SEG = 7;
    const segY = (i) => BASE - (BASE - TOPY) * i / SEG;
    for (let i = 0; i < SEG; i++) {
      const y0 = segY(i), y1 = segY(i + 1), h0 = half(y0), h1 = half(y1);
      const band = i % 2 ? C('#e8e8e2', '#77776f') : C('#d8492e', '#6a2a20');
      L(MX - h0, y0, MX - h1, y1, band, 2.6);                        // legs
      L(MX + h0, y0, MX + h1, y1, band, 2.6);
      const brace = C('rgba(200,206,212,0.8)', 'rgba(110,116,122,0.7)');
      L(MX - h0, y0, MX + h1, y1, brace, 0.8);                       // X bracing
      L(MX + h0, y0, MX - h1, y1, brace, 0.8);
      L(MX - h1, y1, MX + h1, y1, brace, 0.9);                       // rung
    }
    // Caged ladder up the centre
    L(MX - 2, BASE - 2, MX - 2, TOPY + 2, C('#9aa2a8', '#50565c'), 0.6);
    L(MX + 2, BASE - 2, MX + 2, TOPY + 2, C('#9aa2a8', '#50565c'), 0.6);
    if (detail) for (let y = BASE - 5; y > TOPY + 4; y -= 4) L(MX - 2, y, MX + 2, y, C('#8a9298', '#44484c'), 0.45);
    // Railed platforms
    for (const py0 of [150, 104]) {
      const hw = half(py0) + 7;
      R(MX - hw, py0, hw*2, 2.4, C('#6c747c', '#3a3e42'));
      L(MX - hw, py0 - 4, MX + hw, py0 - 4, C('#e0b020', '#5a4a14'), 0.6);
      for (let k = 0; k <= 4; k++) L(MX - hw + k*hw/2, py0, MX - hw + k*hw/2, py0 - 4, C('#e0b020', '#5a4a14'), 0.5);
    }

    // ── Tracking dish on the lower platform ────────────────────────────
    {
      const DX = MX - half(150) - 14, DY = 138;
      // Elevation angle: slewing across the sky during a sweep, parked straight up otherwise.
      const aim = on ? -2.09 + 0.4*Math.sin(t*0.3) + 0.12*Math.sin(t*0.83) : -Math.PI/2;   // up and out to the left
      R(DX - 3, DY + 2, 6, 10, C('#6c747c', '#3a3e42'));                // pedestal
      L(DX + 3, 148, MX - half(148), 148, C('#6c747c', '#3a3e42'), 1.4);
      ctx.save();
      ctx.translate(X(DX), Y(DY)); ctx.rotate(aim + Math.PI/2);
      // Local frame: dish faces -y. Rim edge-on-ish ellipse, reflector, feed struts, horn.
      const rim = 26, depth = 7;
      ctx.fillStyle = C('#b8c0c8', '#5a6068');
      ctx.beginPath(); ctx.ellipse(0, 0, rim*u, depth*u, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = C('#eef1f3', '#7a8088');
      ctx.beginPath(); ctx.ellipse(0, -1.4*u, (rim - 2.5)*u, (depth - 2)*u, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.10)';
      ctx.beginPath(); ctx.ellipse(0, 0.8*u, (rim - 3)*u, (depth - 3.5)*u, 0, 0, Math.PI); ctx.fill();
      ctx.strokeStyle = C('#8a9298', '#4a4e52'); ctx.lineWidth = 0.7*u;
      ctx.beginPath();
      ctx.moveTo(-rim*0.8*u, -1*u); ctx.lineTo(0, -22*u);
      ctx.moveTo( rim*0.8*u, -1*u); ctx.lineTo(0, -22*u);
      ctx.moveTo(0, -4*u);          ctx.lineTo(0, -22*u);
      ctx.stroke();
      ctx.fillStyle = C('#dfe4e8', '#6a7076');
      ctx.fillRect(-2*u, -25*u, 4*u, 4*u);
      if (on) { ctx.fillStyle = 'rgba(140,210,255,0.9)'; ctx.fillRect(-1*u, -26*u, 2*u, 1.4*u); }
      // Uplink pulses leaving the feed along the dish's boresight
      if (on && Camera.zoom > 0.4) {
        for (let k = 0; k < 3; k++) {
          const ph = (t*0.5 + k/3) % 1;
          ctx.strokeStyle = `rgba(90,168,255,${((1 - ph)*0.5).toFixed(3)})`;
          ctx.lineWidth = 1.3*u;
          ctx.beginPath(); ctx.arc(0, -24*u, (6 + ph*70)*u, -Math.PI/2 - 0.35, -Math.PI/2 + 0.35); ctx.stroke();
        }
      }
      ctx.restore();
    }

    // ── Head: equipment box, rotating beacon, whips, aviation light ────
    R(MX - 12, 44, 24, 16, C('#1c2a3c', '#121a24'));
    ctx.strokeStyle = on ? `rgba(90,168,255,${(0.45 + 0.25*Math.sin(t*2.4)).toFixed(3)})` : C('#3a4a5c', '#1c2836');
    ctx.lineWidth = 1*u; ctx.strokeRect(X(MX - 12), Y(44), 24*u, 16*u);
    for (let k = 0; k < 4; k++) R(MX - 9 + k*5, 49, 3, 1.4, on && Math.sin(t*4 + k*1.6) > 0 ? '#5ad0ff' : C('#24384c', '#18222c'));
    R(MX - 5, 36, 10, 8, C('#c8d0d8', '#5a626a'));                     // beacon housing
    {
      // The lamp lives on ONE fixed end of the arm and is carried round with
      // it. This used to put the bright lamp on whichever end was facing the
      // viewer, which swapped ends the instant the arm reached full extension
      // — the lamp teleported across every half turn and read as the rotation
      // resetting. Now its size, brightness and glow follow sin(spin), so it
      // swells as it swings toward us and fades as it goes round the back.
      const spin = on ? t*3.2 : 0.9, reach = 15*Math.cos(spin);
      const armY = 34;
      const face = Math.sin(spin);                 // +1 facing the viewer, -1 behind the mast
      const near = (face + 1) / 2;                 // 0..1
      const lampX = MX + reach, tailX = MX - reach;
      const lamp = () => {
        if (on && detail) drawGlowHalo(X(lampX), Y(armY), TILE*0.35, [[0, '#7ac8ff'], [1, 'transparent']], 0.05 + 0.65*near*near);
        const r = 1.7 + 0.9*near;
        E(lampX, armY, r, r, on ? `rgba(191,230,255,${(0.45 + 0.55*near).toFixed(3)})` : C('#6a8aa8', '#3a4652'));
      };
      if (face < 0) lamp();                        // round the back: arm passes in front of it
      L(tailX, armY, lampX, armY, C('#dfe6ec', '#6a7078'), 2.2);
      E(tailX, armY, 1.5, 1.5, C('#8a96a2', '#3a4048'));                 // counterweight
      if (face >= 0) lamp();
    }
    L(MX - 8, 44, MX - 15, 16, C('#b0b8c0', '#555b61'), 0.7);            // whips
    L(MX + 8, 44, MX + 13, 20, C('#b0b8c0', '#555b61'), 0.7);
    L(MX, 34, MX, 10, C('#b0b8c0', '#555b61'), 0.9);
    const blink = Math.pow(Math.max(0, Math.sin(t*1.5)), 3);
    if (on && blink > 0.02 && detail) drawGlowHalo(X(MX), Y(9), 9, [[0, '#ff5a5a'], [1, 'transparent']], blink*0.55);
    E(MX, 9, 2, 2, on ? `rgba(255,90,90,${(0.35 + 0.65*blink).toFixed(3)})` : '#3a2028');

    // ── Contracts-waiting cue ──────────────────────────────────────
    //
    // Amber against the beacon's blue, so it reads as "something here for
    // you" rather than as part of the structure. Deliberately restrained:
    // a slow breath on a small tag, not a bouncing marker. Hidden while a
    // contract is in progress — the checklist is the signal then, and a
    // beacon still waving at the player would be noise.
    // Keyed off power rather than `on`: an idle mast with offers on the
    // board is precisely when this tag has something to say.
    const waiting = (e.powered && _cs && !_cs.hasContract() && _cs.getOffers)
      ? _cs.getOffers().length : 0;

    if (waiting > 0 && Camera.zoom > 0.35) {
      const bob    = Math.sin(t * 1.5) * (fh * 0.012);
      const breath = 0.5 + 0.5 * Math.sin(t * 1.5);
      const label  = waiting > 1 ? `${waiting} CONTRACTS` : '1 CONTRACT';
      const tagH   = fh * 0.072;
      const font   = Math.max(6, Math.round(tagH * 0.60));

      // Size the pill to its text rather than to the footprint: a fixed
      // width fits "1 CONTRACT" and clips "4 CONTRACTS".
      ctx.save();
      ctx.font = `${font}px monospace`;
      const textW = ctx.measureText(label).width;
      const tagW  = textW + tagH * 1.1;
      const tagX  = cx - tagW / 2;
      // Sits clear above the mast head so it never collides with the
      // warning lamp or the dish.
      const tagY  = py - fh * 0.06 + bob;

      if (Camera.zoom > 0.5) {
        drawGlowHalo(cx, tagY + tagH / 2, tagW * 0.95,
                     [[0, '#ffc850'], [1, 'transparent']], 0.10 + breath * 0.12);
      }

      drawRoundRect(tagX, tagY, tagW, tagH, tagH * 0.34, 'rgba(24,16,4,0.92)',
                    `rgba(255,200,80,${0.5 + breath * 0.35})`, 1.3);

      ctx.fillStyle = `rgba(255,214,120,${0.85 + breath * 0.15})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, cx, tagY + tagH * 0.55);
      ctx.restore();
    }

    // Reliability warning dot — matches the convention used by the other
    // powered stations (see renderMonitor).
    if ((e.reliability !== undefined) && e.reliability < 80) {
      ctx.save();
      ctx.fillStyle = e.reliability < 50 ? '#ff4444' : '#f0a020';
      ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.arc(cx + fw * 0.34, py + fh * 0.30, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

function renderCamera(e, px, py, t) {
    // Security Camera — a steel CCTV pole on a bolted base plate with a
    // junction box and CCTV warning plate, and a bracket arm carrying a
    // bullet camera under its sunshield. Powered, the camera slowly pans
    // back and forth (shown as the housing foreshortening and the lens face
    // turning toward the viewer), its REC LED blinks, and a faint viewing
    // cone sweeps the ground — brighter after dark, when the IR ring round
    // the lens glows too. Unpowered it droops on its mount, dark.
    // Authored in a 40-unit tile, matching renderLamp.
    const u = TILE / 40;
    const X = (v) => px + v*u, Y = (v) => py + v*u;
    const on = e.powered;
    const dark = DayNight.darkness();
    const detail = Camera.zoom > 0.5;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w*u, h*u); };
    const phase = (e.col || 0)*1.7 + (e.row || 0)*0.9;   // cameras don't pan in lockstep

    // Pan (-1..1, eased so it dwells at each end like a real patrol) and tilt
    const sweep = Math.sin(t*0.45 + phase);
    const pan   = on ? Math.sign(sweep)*Math.pow(Math.abs(sweep), 0.6) : 0.15;
    const tilt  = on ? 0.32 + 0.05*Math.sin(t*0.3 + phase) : 0.75;
    const PX = 25.2, PY = 12.6;                            // pan-tilt head pivot
    const face = Math.abs(pan);                            // 0 = side-on, 1 = turned most toward viewer
    const L = 10.5*(1 - 0.35*face);                        // foreshortened housing length
    const LX = PX + Math.cos(tilt)*(L - 1.5), LY = PY + Math.sin(tilt)*(L - 1.5);   // lens centre

    ctx.save();
    ctx.lineCap = 'round';

    // Viewing cone sweeping the ground
    if (on && detail) {
      const s = 0.35 + 0.65*dark;
      const gx = 31 + pan*5, gy = 34.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cone = ctx.createLinearGradient(X(LX), Y(LY), X(gx), Y(gy));
      cone.addColorStop(0, `rgba(170,200,255,${(0.2*s).toFixed(3)})`);
      cone.addColorStop(1, `rgba(170,200,255,${(0.05*s).toFixed(3)})`);
      ctx.fillStyle = cone;
      ctx.beginPath();
      ctx.moveTo(X(LX - 0.8), Y(LY - 0.8)); ctx.lineTo(X(LX + 0.8), Y(LY + 0.6));
      ctx.lineTo(X(gx + 7), Y(gy)); ctx.lineTo(X(gx - 7), Y(gy));
      ctx.closePath(); ctx.fill();
      const spot = ctx.createRadialGradient(X(gx), Y(gy), 0, X(gx), Y(gy), 8*u);
      spot.addColorStop(0, `rgba(180,210,255,${(0.22*s).toFixed(3)})`);
      spot.addColorStop(1, 'rgba(180,210,255,0)');
      ctx.fillStyle = spot;
      ctx.beginPath(); ctx.ellipse(X(gx), Y(gy), 8*u, 2.6*u, 0, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // Shadow, footing and base plate
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(X(22), Y(37.3), 6.5*u, 1.6*u, 0, 0, Math.PI*2); ctx.fill();
    R(15.8, 35.2, 8.4, 1.8, '#8e918c');
    R(16.6, 34.4, 6.8, 1.2, '#5e6368');
    if (detail) { R(17.1, 34.7, 0.8, 0.7, '#2e3236'); R(22.1, 34.7, 0.8, 0.7, '#2e3236'); }

    // Tapered powder-coated steel pole
    const pg = ctx.createLinearGradient(X(18.6), 0, X(21.4), 0);
    pg.addColorStop(0, '#3a4046'); pg.addColorStop(0.45, '#8e979e'); pg.addColorStop(1, '#343a40');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.moveTo(X(18.8), Y(34.5)); ctx.lineTo(X(19.4), Y(11.5)); ctx.lineTo(X(20.6), Y(11.5)); ctx.lineTo(X(21.2), Y(34.5)); ctx.closePath(); ctx.fill();
    R(19.1, 11, 1.8, 1, '#4a5056');   // pole cap

    // Power/data cable up the pole to the camera
    ctx.strokeStyle = '#1a1c1e'; ctx.lineWidth = 0.5*u;
    ctx.beginPath(); ctx.moveTo(X(21.1), Y(22)); ctx.lineTo(X(21), Y(13)); ctx.quadraticCurveTo(X(22.5), Y(11.5), X(PX - 0.5), Y(PY)); ctx.stroke();

    // Junction box with a power LED
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(X(20.6), Y(22.6), 4.2*u, 6*u);
    R(20.2, 22, 4.2, 6, '#b8bcb8');
    R(20.2, 22, 4.2, 0.8, '#d4d8d4');
    if (detail) {
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.3*u;
      ctx.strokeRect(X(20.7), Y(23.2), 3.2*u, 4.2*u);
      ctx.fillStyle = on ? '#46e07a' : '#2e3a32';
      ctx.beginPath(); ctx.arc(X(23.3), Y(23.9), 0.45*u, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#2a2c2e'; ctx.lineWidth = 0.6*u;                      // conduit down to the footing
      ctx.beginPath(); ctx.moveTo(X(21.2), Y(28)); ctx.lineTo(X(21.2), Y(34.4)); ctx.stroke();
    }

    // CCTV warning plate
    R(15.6, 16, 3.4, 4.4, '#e8c22a');
    if (detail) {
      ctx.strokeStyle = '#1e1e1e'; ctx.lineWidth = 0.25*u; ctx.strokeRect(X(15.8), Y(16.2), 3*u, 4*u);
      ctx.fillStyle = '#1e1e1e';
      ctx.fillRect(X(16.3), Y(17.4), 1.6*u, 1.1*u);                              // tiny camera glyph
      ctx.beginPath(); ctx.moveTo(X(17.9), Y(17.95)); ctx.lineTo(X(18.6), Y(17.3)); ctx.lineTo(X(18.6), Y(18.6)); ctx.closePath(); ctx.fill();
      R(16.2, 19.2, 2.2, 0.4, '#1e1e1e');
    }

    // Bracket arm out to the pan-tilt head
    ctx.strokeStyle = '#6a7278'; ctx.lineWidth = 1.2*u;
    ctx.beginPath(); ctx.moveTo(X(20.4), Y(13)); ctx.lineTo(X(PX), Y(12.2)); ctx.stroke();
    ctx.strokeStyle = '#555c62'; ctx.lineWidth = 0.6*u;
    ctx.beginPath(); ctx.moveTo(X(20.4), Y(15.5)); ctx.lineTo(X(PX - 2), Y(12.6)); ctx.stroke();   // brace
    ctx.fillStyle = '#3e4449';
    ctx.beginPath(); ctx.arc(X(PX), Y(PY), 1.3*u, 0, Math.PI*2); ctx.fill();

    // Bullet camera, in the head's tilted frame. Panning toward/away from
    // the viewer shortens the housing and opens up the lens face.
    ctx.save();
    ctx.translate(X(PX), Y(PY));
    ctx.rotate(tilt);
    // Housing
    const hg = ctx.createLinearGradient(0, -2.6*u, 0, 2.2*u);
    hg.addColorStop(0, on ? '#f2f4f4' : '#9a9e9e'); hg.addColorStop(0.6, on ? '#c9cfd2' : '#707676'); hg.addColorStop(1, on ? '#8e979c' : '#4e5456');
    ctx.fillStyle = hg;
    ctx.beginPath(); ctx.roundRect(-1.5*u, -2.2*u, L*u, 4.4*u, 1.3*u); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.3*u; ctx.stroke();
    // Sunshield hood, overhanging the front
    ctx.fillStyle = on ? '#e4e8e8' : '#8a8e8e';
    ctx.beginPath();
    ctx.moveTo(-2*u, -2.6*u); ctx.lineTo((L + 0.8)*u, -2.9*u); ctx.lineTo((L + 0.8)*u, -2*u); ctx.lineTo(-2*u, -1.8*u);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-1.5*u, -1.8*u, L*u, 0.5*u);
    // Front bezel + lens (ellipse widens as the lens turns toward the viewer)
    const fx = (L - 1.5)*u, lw = (0.8 + 1.5*face)*u;
    ctx.fillStyle = '#1c1f22';
    ctx.beginPath(); ctx.ellipse(fx, 0, lw, 2.1*u, 0, 0, Math.PI*2); ctx.fill();
    if (on && dark > 0.35) {                         // IR illuminator ring
      ctx.fillStyle = `rgba(255,60,50,${(0.35 + 0.35*dark).toFixed(3)})`;
      for (let k = 0; k < 6; k++) {
        const a = k*Math.PI/3;
        ctx.beginPath(); ctx.arc(fx + Math.cos(a)*lw*0.72, Math.sin(a)*1.5*u, 0.3*u, 0, Math.PI*2); ctx.fill();
      }
    }
    const lg = ctx.createRadialGradient(fx - lw*0.25, -0.5*u, 0, fx, 0, 1.2*u);
    lg.addColorStop(0, on ? '#9ad0ff' : '#3a4450'); lg.addColorStop(1, on ? '#102a48' : '#101418');
    ctx.fillStyle = lg;
    ctx.beginPath(); ctx.ellipse(fx, 0, Math.max(0.5*u, lw*0.55), 1.15*u, 0, 0, Math.PI*2); ctx.fill();
    if (on) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath(); ctx.arc(fx - lw*0.2, -0.45*u, 0.28*u, 0, Math.PI*2); ctx.fill();
    }
    // REC LED on the housing's rear
    if (on) {
      const rec = Math.sin(t*3.2 + phase) > -0.3;
      ctx.fillStyle = rec ? '#ff3a30' : '#4a1a18';
      ctx.beginPath(); ctx.arc(1*u, -0.6*u, 0.5*u, 0, Math.PI*2); ctx.fill();
      if (rec && detail) {
        ctx.fillStyle = 'rgba(255,60,50,0.3)';
        ctx.beginPath(); ctx.arc(1*u, -0.6*u, 1.3*u, 0, Math.PI*2); ctx.fill();
      }
    }
    ctx.restore();

    ctx.restore();
  }

// EV Charging Station — a 5×4 charging plaza. A cantilevered solar canopy
// (dark PV modules on an aluminium frame, lit green fascia with a bolt
// sign) shelters four bays; each bay has a slim dispenser pillar with a
// status ring, a screen and a holstered cable, and cars roll in, plug in and
// drive off on their own slow schedule. A plugged-in car gets a pulsing
// cable, a ground glow, and a charge bar. Down the right side is the
// equipment yard: a pad-mount transformer, a battery buffer cabinet whose
// LEDs climb while a car is charging, and a totem sign on the corner.
// Chargers built before the resize are still 1×1 and keep the post sprite.
function renderEVCharger(e, px, py, t) {
  const W = (e.width || 1) * TILE, H = (e.height || 1) * TILE;
  if (W < TILE * 3) return _renderEVChargerPost(e, px, py, t);
  const on = !!e.powered;
  const S = TILE / 40;
  const detail = Camera.zoom > 0.5;
  const accent = '#40ff80';
  const seed = (e.col * 73856093) ^ (e.row * 19349663);
  const rnd = (n) => { const x = Math.sin(seed * 0.0001 + n * 12.9898) * 43758.5453; return x - Math.floor(x); };
  ctx.save();

  // ── Plaza slab: pale concrete apron with a kerb, dark asphalt inset ──
  ctx.fillStyle = 'rgba(0,0,0,0.26)';
  ctx.beginPath(); ctx.roundRect(px + 3*S, py + 4*S, W - 4*S, H - 4*S, 4*S); ctx.fill();
  ctx.fillStyle = '#9a9ea0';
  ctx.beginPath(); ctx.roundRect(px + 1*S, py + 1*S, W - 2*S, H - 2*S, 4*S); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 0.6*S;
  for (let q = 1; q < 10; q++) { const gx = px + W*q/10; ctx.beginPath(); ctx.moveTo(gx, py + 2*S); ctx.lineTo(gx, py + H - 2*S); ctx.stroke(); }
  const asph = ctx.createLinearGradient(0, py, 0, py + H);
  asph.addColorStop(0, '#2e3236'); asph.addColorStop(1, '#25292d');
  ctx.fillStyle = asph;
  const bayAreaX = px + 4*S, bayAreaW = W*0.735;
  ctx.beginPath(); ctx.roundRect(bayAreaX, py + 4*S, bayAreaW, H - 8*S, 3*S); ctx.fill();
  // LED kerb strip along the bay area's lower lip
  ctx.fillStyle = on ? 'rgba(64,255,128,0.75)' : 'rgba(40,90,60,0.6)';
  ctx.fillRect(bayAreaX + 3*S, py + H - 6.5*S, bayAreaW - 6*S, 1.2*S);

  // ── Bays ──
  const NB = 4;
  const bayX0 = bayAreaX + 3*S, bayW = (bayAreaW - 6*S) / NB;
  const canopyY0 = py + H*0.06, canopyY1 = py + H*0.37;
  const bayY0 = py + H*0.44, bayY1 = py + H - 8*S;
  const pedY = canopyY1 + 3*S;
  const CYCLE = 38;
  const bays = [];
  for (let b = 0; b < NB; b++) {
    const phase = t / CYCLE + rnd(b + 1);
    const win = Math.floor(phase), frac = phase - win;
    const occupied = rnd(b * 7 + win * 3.1) > 0.3;
    bays.push({ occupied, frac, hue: Math.floor(rnd(b * 11 + win * 5.7) * 360) });
  }
  // painted bays: white lines, a green EV stencil, wheel stops
  for (let b = 0; b <= NB; b++) {
    const lx = bayX0 + b*bayW;
    ctx.strokeStyle = 'rgba(235,238,240,0.7)'; ctx.lineWidth = 1.3*S;
    ctx.beginPath(); ctx.moveTo(lx, bayY0); ctx.lineTo(lx, bayY1); ctx.stroke();
  }
  for (let b = 0; b < NB; b++) {
    const bx = bayX0 + b*bayW + bayW/2;
    ctx.fillStyle = 'rgba(64,255,128,0.20)';
    ctx.beginPath(); ctx.roundRect(bx - bayW*0.36, bayY0 + 3*S, bayW*0.72, bayY1 - bayY0 - 8*S, 2*S); ctx.fill();
    ctx.fillStyle = on ? 'rgba(64,255,128,0.55)' : 'rgba(64,200,110,0.3)';
    const by = (bayY0 + bayY1) / 2 + 3*S;
    ctx.beginPath(); ctx.moveTo(bx + 1.5*S, by - 6*S); ctx.lineTo(bx - 3*S, by + 0.5*S); ctx.lineTo(bx - 0.2*S, by + 0.5*S);
    ctx.lineTo(bx - 1.6*S, by + 6*S); ctx.lineTo(bx + 3*S, by - 1*S); ctx.lineTo(bx + 0.2*S, by - 1*S); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5a5e60'; ctx.fillRect(bx - bayW*0.28, bayY0 + 2*S, bayW*0.56, 2*S);
  }

  // ── Cars: top-down, arriving from the lower edge ──
  const drawCar = (cx, cy, cw, ch, hue, chg) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.roundRect(cx - cw/2 + 2*S, cy - ch/2 + 2.5*S, cw, ch, 4*S); ctx.fill();
    if (chg) {
      const gg = ctx.createRadialGradient(cx, cy, 2*S, cx, cy, cw*0.9);
      gg.addColorStop(0, 'rgba(64,255,128,0.35)'); gg.addColorStop(1, 'rgba(64,255,128,0)');
      ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(cx, cy, cw*0.9, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = '#101214';
    [[-1, -0.30], [1, -0.30], [-1, 0.30], [1, 0.30]].forEach(([sx, sy]) => ctx.fillRect(cx + sx*cw*0.5 - (sx > 0 ? 0.4*S : 1.8*S), cy + sy*ch - 2.6*S, 2.2*S, 5.2*S));
    const bg = ctx.createLinearGradient(cx - cw/2, 0, cx + cw/2, 0);
    bg.addColorStop(0, `hsl(${hue},55%,62%)`); bg.addColorStop(0.5, `hsl(${hue},55%,46%)`); bg.addColorStop(1, `hsl(${hue},50%,30%)`);
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(cx - cw/2, cy - ch/2, cw, ch, 4.5*S); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.7*S; ctx.stroke();
    ctx.fillStyle = '#12202a';   // windscreen, roof glass, rear glass
    ctx.beginPath(); ctx.roundRect(cx - cw*0.36, cy - ch*0.36, cw*0.72, ch*0.20, 1.6*S); ctx.fill();
    ctx.beginPath(); ctx.roundRect(cx - cw*0.36, cy + ch*0.20, cw*0.72, ch*0.16, 1.6*S); ctx.fill();
    ctx.fillStyle = `hsl(${hue},45%,38%)`; ctx.fillRect(cx - cw*0.34, cy - ch*0.14, cw*0.68, ch*0.30);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(cx - cw*0.30, cy - ch*0.12, cw*0.14, ch*0.26);
    ctx.fillStyle = '#fff4c8'; ctx.fillRect(cx - cw*0.40, cy - ch*0.49, cw*0.20, 1.6*S); ctx.fillRect(cx + cw*0.20, cy - ch*0.49, cw*0.20, 1.6*S);
    ctx.fillStyle = '#c02818'; ctx.fillRect(cx - cw*0.40, cy + ch*0.46, cw*0.20, 1.4*S); ctx.fillRect(cx + cw*0.20, cy + ch*0.46, cw*0.20, 1.4*S);
  };
  const carW = bayW*0.60, carH = (bayY1 - bayY0)*0.66;
  const chargingCars = [];
  ctx.save(); ctx.beginPath(); ctx.rect(bayAreaX, py + 4*S, bayAreaW, H - 8*S); ctx.clip();   // cars enter and leave inside the plaza
  bays.forEach((bay, b) => {
    if (!bay.occupied) return;
    const f = bay.frac;
    let cy, charging = false;
    const parkY = (bayY0 + bayY1) / 2 + 2*S;
    if (f < 0.10)      { cy = parkY + (1 - f/0.10) * (H*0.5); }
    else if (f > 0.90) { cy = parkY + ((f - 0.90)/0.10) * (H*0.5); }
    else               { cy = parkY; charging = true; }
    const cx = bayX0 + b*bayW + bayW/2;
    drawCar(cx, cy, carW, carH, bay.hue, charging && on);
    if (charging) chargingCars.push({ b, cx, cy, prog: (f - 0.10)/0.80 });
  });
  ctx.restore();

  // ── Dispenser pillars between/beside bays, with cables to charging cars ──
  for (let b = 0; b < NB; b++) {
    const px2 = bayX0 + b*bayW + bayW/2;
    const dY = pedY, dh = 12*S, dw = 5.4*S;
    const ch = chargingCars.find(c => c.b === b);
    // cable to the car's charge port
    ctx.strokeStyle = '#0e1012'; ctx.lineWidth = 1.6*S; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px2, dY + dh);
    if (ch) {
      ctx.quadraticCurveTo(px2 + 6*S, dY + dh + 6*S, px2 + carW*0.22, ch.cy - carH*0.42);
    } else {
      ctx.quadraticCurveTo(px2 - 3*S, dY + dh + 4*S, px2 - 1*S, dY + dh + 2*S);
    }
    ctx.stroke();
    if (ch && on) {
      ctx.strokeStyle = `rgba(64,255,128,${0.55 + 0.35*Math.sin(t*6 - b)})`; ctx.lineWidth = 0.9*S; ctx.setLineDash([2*S, 2.5*S]); ctx.lineDashOffset = -t*10*S;
      ctx.beginPath(); ctx.moveTo(px2, dY + dh); ctx.quadraticCurveTo(px2 + 6*S, dY + dh + 6*S, px2 + carW*0.22, ch.cy - carH*0.42); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
    // pillar body
    ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.beginPath(); ctx.roundRect(px2 - dw/2 + 1.6*S, dY + 1.8*S, dw, dh, 1.6*S); ctx.fill();
    const pg = ctx.createLinearGradient(px2 - dw/2, 0, px2 + dw/2, 0);
    pg.addColorStop(0, '#eef2f0'); pg.addColorStop(0.55, '#c4cac8'); pg.addColorStop(1, '#7a8280');
    ctx.fillStyle = pg; ctx.beginPath(); ctx.roundRect(px2 - dw/2, dY, dw, dh, 1.6*S); ctx.fill();
    ctx.strokeStyle = '#3a403e'; ctx.lineWidth = 0.6*S; ctx.stroke();
    // screen
    ctx.fillStyle = '#0a1210'; ctx.fillRect(px2 - dw*0.34, dY + 1.6*S, dw*0.68, 3.6*S);
    if (on) {
      ctx.fillStyle = ch ? accent : '#5ac8ff';
      ctx.fillRect(px2 - dw*0.28, dY + 2.4*S, dw*0.56*(ch ? Math.min(1, 0.15 + ch.prog) : 0.35), 1.2*S);
    }
    // status ring: idle green, charging pulses blue-green
    const rc = !on ? '#3a3a3a' : ch ? `hsl(${150 + 30*Math.sin(t*4 - b)},90%,60%)` : '#40ff80';
    ctx.strokeStyle = rc; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.arc(px2, dY + 8*S, dw*0.30, 0, Math.PI*2); ctx.stroke();
    if (on) { ctx.globalAlpha = 0.28; ctx.beginPath(); ctx.arc(px2, dY + 8*S, dw*0.62, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
    // cable holster
    ctx.fillStyle = '#1a1e1c'; ctx.fillRect(px2 + dw*0.32, dY + 5.6*S, 1.6*S, 3.2*S);
  }

  // charge readout above each charging car
  chargingCars.forEach(({ cx, cy, prog }) => {
    if (!on || !detail) return;
    ctx.fillStyle = 'rgba(8,18,12,0.85)'; ctx.beginPath(); ctx.roundRect(cx - carW*0.30, cy - 2*S, carW*0.60, 4*S, 1.4*S); ctx.fill();
    ctx.fillStyle = accent; ctx.beginPath(); ctx.roundRect(cx - carW*0.27, cy - 1*S, carW*0.54*Math.min(1, 0.1 + prog), 2*S, 1*S); ctx.fill();
  });

  // ── Solar canopy: cantilevered PV roof over the bays ──
  const cX0 = px + 3*S, cX1 = bayAreaX + bayAreaW - 1*S;
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath(); ctx.roundRect(cX0 + 2.5*S, canopyY0 + 3.5*S, cX1 - cX0, canopyY1 - canopyY0, 3*S); ctx.fill();
  ctx.fillStyle = '#c4cccc';   // frame
  ctx.beginPath(); ctx.roundRect(cX0, canopyY0, cX1 - cX0, canopyY1 - canopyY0, 3*S); ctx.fill();
  const modCols = 8, modRows = 2;
  const mX0 = cX0 + 2*S, mY0 = canopyY0 + 2*S, mW = (cX1 - cX0 - 4*S) / modCols, mH = (canopyY1 - canopyY0 - 9*S) / modRows;
  for (let r = 0; r < modRows; r++) for (let c = 0; c < modCols; c++) {
    const mx = mX0 + c*mW, my = mY0 + r*mH;
    const pgm = ctx.createLinearGradient(mx, my, mx + mW, my + mH);
    pgm.addColorStop(0, on ? '#24407a' : '#1a2a4a'); pgm.addColorStop(1, on ? '#0e1c40' : '#0c1428');
    ctx.fillStyle = pgm; ctx.fillRect(mx + 0.5*S, my + 0.5*S, mW - 1*S, mH - 1*S);
    if (detail) {
      ctx.strokeStyle = 'rgba(160,190,255,0.22)'; ctx.lineWidth = 0.4*S;
      for (let q = 1; q < 4; q++) { ctx.beginPath(); ctx.moveTo(mx + mW*q/4, my + 0.5*S); ctx.lineTo(mx + mW*q/4, my + mH - 0.5*S); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(mx + 0.5*S, my + mH/2); ctx.lineTo(mx + mW - 0.5*S, my + mH/2); ctx.stroke();
    }
  }
  // glossy sweep across the array
  ctx.save(); ctx.beginPath(); ctx.rect(mX0, mY0, cX1 - cX0 - 4*S, modRows*mH); ctx.clip();
  const sweep = ((t*0.05) % 1.6) - 0.3;
  const sg = ctx.createLinearGradient(mX0 + sweep*(cX1 - cX0) - 14*S, 0, mX0 + sweep*(cX1 - cX0) + 14*S, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, on ? 'rgba(200,225,255,0.22)' : 'rgba(200,225,255,0.10)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg; ctx.fillRect(mX0, mY0, cX1 - cX0 - 4*S, modRows*mH);
  ctx.restore();
  // fascia: green LED band with the bolt sign
  const fY = canopyY1 - 6.5*S;
  ctx.fillStyle = '#1c2a22'; ctx.fillRect(cX0 + 1*S, fY, cX1 - cX0 - 2*S, 5.5*S);
  ctx.fillStyle = on ? 'rgba(64,255,128,0.85)' : 'rgba(40,100,66,0.6)'; ctx.fillRect(cX0 + 1*S, fY + 4.4*S, cX1 - cX0 - 2*S, 1.1*S);
  const sx0 = (cX0 + cX1)/2;
  ctx.fillStyle = on ? accent : '#3a7a52';
  ctx.beginPath(); ctx.moveTo(sx0 + 1.6*S, fY + 0.4*S); ctx.lineTo(sx0 - 2.6*S, fY + 3.1*S); ctx.lineTo(sx0 - 0.2*S, fY + 3.1*S);
  ctx.lineTo(sx0 - 1.6*S, fY + 5.2*S); ctx.lineTo(sx0 + 2.6*S, fY + 2.4*S); ctx.lineTo(sx0 + 0.2*S, fY + 2.4*S); ctx.closePath(); ctx.fill();
  // support columns
  ctx.fillStyle = '#9aa2a2';
  [cX0 + 4*S, cX1 - 5*S].forEach(cxp => { ctx.fillRect(cxp - 1.2*S, canopyY1, 2.4*S, 4*S); });
  // under-canopy light spill onto the pillars
  if (on) {
    const lg = ctx.createLinearGradient(0, canopyY1, 0, canopyY1 + 12*S);
    lg.addColorStop(0, 'rgba(210,255,225,0.28)'); lg.addColorStop(1, 'rgba(210,255,225,0)');
    ctx.fillStyle = lg; ctx.fillRect(cX0 + 2*S, canopyY1, cX1 - cX0 - 4*S, 12*S);
  }

  // ── Equipment yard (right): transformer, battery buffer, totem ──
  const yX = px + W*0.775, yW = W*0.20;
  // transformer: pad-mount cabinet with cooling fins and a hazard sign
  const trY = py + H*0.09, trH = H*0.26;
  ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(yX + 2*S, trY + 2.5*S, yW, trH);
  const trg = ctx.createLinearGradient(yX, 0, yX + yW, 0);
  trg.addColorStop(0, '#5f7a68'); trg.addColorStop(1, '#354a3c');
  ctx.fillStyle = trg; ctx.beginPath(); ctx.roundRect(yX, trY, yW, trH, 2*S); ctx.fill();
  ctx.strokeStyle = '#1a261e'; ctx.lineWidth = 0.7*S; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.7*S;
  for (let q = 1; q < 6; q++) { const fx = yX + yW*q/6; ctx.beginPath(); ctx.moveTo(fx, trY + 2*S); ctx.lineTo(fx, trY + trH - 5*S); ctx.stroke(); }
  ctx.fillStyle = '#f0c020'; ctx.beginPath(); ctx.moveTo(yX + yW/2, trY + trH - 4.6*S); ctx.lineTo(yX + yW/2 + 2.2*S, trY + trH - 0.8*S); ctx.lineTo(yX + yW/2 - 2.2*S, trY + trH - 0.8*S); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#1a1a10'; ctx.fillRect(yX + yW/2 - 0.3*S, trY + trH - 3.6*S, 0.6*S, 1.6*S);
  if (on && detail) { ctx.fillStyle = `rgba(160,220,255,${0.4 + 0.3*Math.sin(t*50)})`; ctx.fillRect(yX + 2*S, trY + 1.5*S, 1.4*S, 1.4*S); }
  // battery buffer cabinet with charge-level LEDs
  const bfY = py + H*0.42, bfH = H*0.36;
  ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(yX + 2*S, bfY + 2.5*S, yW, bfH);
  const bfg = ctx.createLinearGradient(yX, 0, yX + yW, 0);
  bfg.addColorStop(0, '#f0f4f2'); bfg.addColorStop(1, '#9aa4a0');
  ctx.fillStyle = bfg; ctx.beginPath(); ctx.roundRect(yX, bfY, yW, bfH, 2*S); ctx.fill();
  ctx.strokeStyle = '#4a5450'; ctx.lineWidth = 0.7*S; ctx.stroke();
  ctx.fillStyle = '#0e1612'; ctx.fillRect(yX + 2*S, bfY + 2*S, yW - 4*S, bfH - 12*S);
  const level = on ? 0.55 + 0.25*Math.sin(t*0.4) + (chargingCars.length ? -0.12 : 0.12) : 0.2;
  const nLed = 8;
  for (let q = 0; q < nLed; q++) {
    const lit = (q + 1) / nLed <= level;
    ctx.fillStyle = lit ? (q > 5 ? '#ffd040' : accent) : '#1e2e26';
    ctx.fillRect(yX + 3.2*S, bfY + bfH - 12*S - q*((bfH - 15*S)/nLed), yW - 6.4*S, ((bfH - 15*S)/nLed) - 0.9*S);
  }
  ctx.fillStyle = '#2a3a30'; ctx.fillRect(yX + yW/2 - 2*S, bfY + bfH - 8*S, 4*S, 1.2*S); ctx.fillRect(yX + yW/2 - 1*S, bfY + bfH - 9.6*S, 2*S, 1.6*S);   // battery glyph
  // conduit tying the yard to the canopy
  ctx.strokeStyle = '#2a2e2c'; ctx.lineWidth = 1.6*S;
  ctx.beginPath(); ctx.moveTo(yX, trY + trH*0.5); ctx.lineTo(cX1, trY + trH*0.5); ctx.stroke();
  ctx.strokeStyle = on ? `rgba(64,255,128,${0.35 + 0.25*Math.sin(t*5)})` : 'rgba(60,110,80,0.4)'; ctx.lineWidth = 0.7*S;
  ctx.beginPath(); ctx.moveTo(yX, trY + trH*0.5); ctx.lineTo(cX1, trY + trH*0.5); ctx.stroke();
  // totem sign on the corner: pole, green disc, bolt
  const tX = px + W - 9*S, tY = py + H - 12*S;
  ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.beginPath(); ctx.ellipse(tX + 2*S, tY + 6*S, 4*S, 1.6*S, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#3a3e3c'; ctx.fillRect(tX - 0.8*S, tY - 1*S, 1.6*S, 7*S);
  if (on && detail) drawGlowHalo(tX, tY - 3*S, 10*S, [[0, '#40ff80'], [1, 'transparent']], 0.22 + 0.08*Math.sin(t*2));
  ctx.fillStyle = '#0c1a12'; ctx.beginPath(); ctx.arc(tX, tY - 3*S, 5*S, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = on ? accent : '#2a5a3a'; ctx.lineWidth = 1*S; ctx.stroke();
  ctx.fillStyle = on ? accent : '#2a7a4a';
  ctx.beginPath(); ctx.moveTo(tX + 1*S, tY - 6.6*S); ctx.lineTo(tX - 2*S, tY - 2.6*S); ctx.lineTo(tX - 0.2*S, tY - 2.6*S);
  ctx.lineTo(tX - 1*S, tY + 0.6*S); ctx.lineTo(tX + 2*S, tY - 3.4*S); ctx.lineTo(tX + 0.2*S, tY - 3.4*S); ctx.closePath(); ctx.fill();
  // planter beside the totem
  ctx.fillStyle = '#4a6a3a'; ctx.beginPath(); ctx.arc(px + W*0.80, py + H - 9*S, 3.4*S, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#6a9a48'; ctx.beginPath(); ctx.arc(px + W*0.80 - 0.8*S, py + H - 9.8*S, 2.2*S, 0, Math.PI*2); ctx.fill();

  ctx.restore();
}

// The original 1×1 post, kept for chargers built before the forecourt resize.
function _renderEVChargerPost(e, px, py, t) {
    const cx = px+TILE/2, cy = py+TILE/2;
    const on = e.powered;
    const col = on ? `rgba(64,255,128,${0.6+0.2*Math.sin(t*2)})` : '#1a2a1a';

    if (on) {
      if (Camera.zoom > 0.5) {  // LOD: skip glow gradient when zoomed out — imperceptible at this scale, but costly to paint for every visible entity
      drawGlowHalo(cx, cy, TILE*0.9, [[0,'#40ff80'],[1,'transparent']], 0.2+0.06*Math.sin(t*3));
      }
    }

    // Station body
    const pad = 6;
    drawRoundRect(px+pad, py+pad, TILE-pad*2, TILE-pad*2, 3, '#080e08', on ? `rgba(64,255,128,${0.5+0.2*Math.sin(t*3)})` : '#1a2a1a', 1.5);

    // Lightning symbol
    ctx.fillStyle = on ? `rgba(64,255,128,${0.7+0.3*Math.sin(t*4)})` : '#1a2a1a';
    ctx.beginPath();
    ctx.moveTo(cx+3, py+pad+4); ctx.lineTo(cx-3, cy); ctx.lineTo(cx+1, cy);
    ctx.lineTo(cx-3, py+TILE-pad-4); ctx.lineTo(cx+3, cy); ctx.lineTo(cx-1, cy);
    ctx.closePath(); ctx.fill();

    // Cable
    ctx.strokeStyle = on ? '#30c060' : '#1a2a1a';
    ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px+TILE-pad, cy); ctx.lineTo(px+TILE, cy); ctx.stroke();

    // Status indicator
    ctx.fillStyle = on ? '#40ff80' : '#1a2a1a';
    ctx.font = '6px Courier New'; ctx.textAlign = 'center';
    ctx.fillText(on ? 'READY' : 'OFF', cx, py+pad-1);
    ctx.textAlign = 'left';
  }

function renderLamp(e, px, py, t) {
    // Street Light — a galvanised steel pole on a bolted base plate, with a
    // curved mast arm carrying a cobra-head luminaire and its photocell. It
    // only lights dusk to dawn (DemandCurves) and only when powered; lit, the
    // lens glows and a warm pool of light spreads on the ground beneath it,
    // blended additively and stronger the darker it gets — the same way the
    // cursor lantern behaves — with a couple of moths circling after dark.
    // Authored in a 40-unit tile.
    const u = TILE / 40;
    const X = (v) => px + v*u, Y = (v) => py + v*u;
    const lampDemand = DemandCurves.get(T.LAMP, null, DayNight.hour());
    const isOn = e.powered && lampDemand > 0;
    const dark = DayNight.darkness();
    const detail = Camera.zoom > 0.5;
    const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w*u, h*u); };
    const LX = 31, LY = 9;                          // lens centre

    ctx.save();
    ctx.lineCap = 'round';

    // Light pool and cone on the ground
    if (isOn && detail) {
      const s = 0.3 + 0.7 * dark;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cone = ctx.createLinearGradient(0, Y(LY), 0, Y(35));
      cone.addColorStop(0, `rgba(255,224,160,${(0.26*s).toFixed(3)})`);
      cone.addColorStop(1, 'rgba(255,224,160,0)');
      ctx.fillStyle = cone;
      ctx.beginPath(); ctx.moveTo(X(LX - 3), Y(LY + 1)); ctx.lineTo(X(LX + 3), Y(LY + 1)); ctx.lineTo(X(LX + 12), Y(35)); ctx.lineTo(X(LX - 20), Y(35)); ctx.closePath(); ctx.fill();
      const pool = ctx.createRadialGradient(X(27), Y(34), 0, X(27), Y(34), 22*u);
      pool.addColorStop(0, `rgba(255,214,150,${(0.5*s).toFixed(3)})`);
      pool.addColorStop(0.55, `rgba(255,200,130,${(0.18*s).toFixed(3)})`);
      pool.addColorStop(1, 'rgba(255,200,130,0)');
      ctx.fillStyle = pool;
      ctx.beginPath(); ctx.ellipse(X(27), Y(34), 22*u, 9*u, 0, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    // Shadow and base plate
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(X(22.5), Y(37.3), 6*u, 1.6*u, 0, 0, Math.PI*2); ctx.fill();
    R(16.5, 34.6, 7, 2.4, '#6a6e72');
    R(17.4, 33.6, 5.2, 1.2, '#8a8e92');
    if (detail) { R(17, 35.2, 0.9, 0.9, '#3a3e42'); R(22.1, 35.2, 0.9, 0.9, '#3a3e42'); }

    // Tapered galvanised pole with an access door
    const pg = ctx.createLinearGradient(X(18.4), 0, X(21.6), 0);
    pg.addColorStop(0, '#5e646a'); pg.addColorStop(0.45, '#c2c8cc'); pg.addColorStop(1, '#565c62');
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.moveTo(X(18.6), Y(34)); ctx.lineTo(X(19.3), Y(9.5)); ctx.lineTo(X(20.7), Y(9.5)); ctx.lineTo(X(21.4), Y(34)); ctx.closePath(); ctx.fill();
    if (detail) { R(19.3, 26.5, 1.4, 3.2, '#6e757b'); R(19.5, 27.6, 1, 0.4, '#3a3e42'); }

    // Curved mast arm
    ctx.strokeStyle = '#8a9096'; ctx.lineWidth = 1.3*u;
    ctx.beginPath(); ctx.moveTo(X(20), Y(11)); ctx.quadraticCurveTo(X(21), Y(5.5), X(27.5), Y(7.2)); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 0.4*u;
    ctx.beginPath(); ctx.moveTo(X(19.8), Y(10.5)); ctx.quadraticCurveTo(X(20.8), Y(5.2), X(27.3), Y(6.7)); ctx.stroke();

    // Cobra-head luminaire, photocell, lens
    if (isOn && detail) drawGlowHalo(X(LX), Y(LY + 0.5), TILE*0.32, [[0, '#fff2c8'], [1, 'transparent']], 0.55 + 0.1*Math.sin(t*1.5));
    ctx.fillStyle = '#7c8288';
    ctx.beginPath(); ctx.ellipse(X(31), Y(8), 5.4*u, 2.2*u, -0.08, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.ellipse(X(30), Y(7.1), 3.4*u, 0.8*u, -0.08, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = isOn ? `rgba(255,243,200,${(0.9 + 0.1*Math.sin(t*2)).toFixed(3)})` : '#3c4046';
    ctx.beginPath(); ctx.ellipse(X(LX + 0.4), Y(LY), 3.8*u, 1.1*u, -0.08, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#2a2c30';
    ctx.beginPath(); ctx.arc(X(30.5), Y(5.8), 0.8*u, 0, Math.PI*2); ctx.fill();

    // Moths round the light after dark
    if (isOn && detail && dark > 0.5) {
      ctx.fillStyle = 'rgba(240,230,210,0.85)';
      for (let k = 0; k < 2; k++) {
        const a = t*(3.1 + k*1.3) + k*2.1 + (e.col||0);
        ctx.beginPath(); ctx.arc(X(LX + Math.cos(a)*4.5), Y(LY + 3 + Math.sin(a*1.4)*2.2), 0.55*u, 0, Math.PI*2); ctx.fill();
      }
    }

    ctx.restore();
  }

function renderPole(e, px, py, t) {
    // Power Pole — a creosoted timber utility pole: tapered shaft with
    // step bolts and an ID tag, a crossarm on diagonal braces carrying three
    // glass insulators, and on some poles a transformer can or a guy wire
    // (picked from the tile, so a line of poles isn't identical). The
    // insulators glow when the pole is carrying power; a failed pole arcs
    // and smokes at the crossarm; a pole out of wire range blinks its tag
    // amber. Authored in a 40-unit tile.
    const u  = TILE / 40;
    const X  = (v) => px + v*u, Y = (v) => py + v*u;
    const on = e.powered, failed = !!e.failed, stranded = !!e.outOfRange;
    const detail = Camera.zoom > 0.5;
    const hash = (k) => { const v = Math.sin((e.col||0)*12.9898 + (e.row||0)*78.233 + k*37.719)*43758.5453; return v - Math.floor(v); };
    const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w*u, h*u); };
    const line = (x1, y1, x2, y2, c, w) => { ctx.strokeStyle = c; ctx.lineWidth = w*u; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };

    ctx.save();
    ctx.lineCap = 'round';

    if (on && !failed && detail) {
      drawGlowHalo(X(20), Y(9), TILE*0.5, [[0, '#a8f0a0'], [1, 'transparent']], 0.10 + 0.05*Math.sin(t*2));
    }

    const inWater = !!e._underWater;
    if (inWater) {
      // Stood in a lake or river: a round concrete pier, the water lapping
      // at it in rings that spread and fade (water_build.js).
      if (detail) {
        for (let k = 0; k < 2; k++) {
          const f = (t*0.35 + k*0.5) % 1;
          ctx.strokeStyle = `rgba(220,240,255,${(0.45*(1 - f)).toFixed(3)})`;
          ctx.lineWidth = 0.6*u;
          ctx.beginPath(); ctx.ellipse(X(20), Y(36.4), (5.4 + f*7)*u, (1.9 + f*2.4)*u, 0, 0, Math.PI*2); ctx.stroke();
        }
      }
      ctx.fillStyle = 'rgba(0,20,40,0.30)';
      ctx.beginPath(); ctx.ellipse(X(21), Y(36.8), 5.6*u, 1.9*u, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#8c8e8a';                              // pier side, down to the waterline
      ctx.beginPath(); ctx.ellipse(X(20), Y(36.2), 4.4*u, 1.5*u, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillRect(X(15.6), Y(33.9), 8.8*u, 2.3*u);
      ctx.fillStyle = '#b4b6b0';                              // pier top
      ctx.beginPath(); ctx.ellipse(X(20), Y(33.9), 4.4*u, 1.5*u, 0, 0, Math.PI*2); ctx.fill();
      if (detail) {
        ctx.fillStyle = 'rgba(40,70,60,0.45)';                // wet, weedy band at the waterline
        ctx.fillRect(X(15.6), Y(35.4), 8.8*u, 0.8*u);
      }
    } else {
      // Ground shadow and the tamped earth round the footing
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(X(23), Y(37.4), 7.5*u, 2*u, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#6a5a44';
      ctx.beginPath(); ctx.ellipse(X(20), Y(36.6), 4.4*u, 1.5*u, 0, 0, Math.PI*2); ctx.fill();
    }

    // Guy wire to a ground anchor, with a yellow guard sleeve (none in water)
    const guyed = !inWater && hash(1) < 0.45;
    const side  = hash(2) < 0.5 ? -1 : 1;
    if (guyed && detail) {
      line(20 + side, 12, 20 + side*15, 37, '#8a8e90', 0.6);
      line(20 + side*12.6, 31.2, 20 + side*15, 37, '#e8c020', 1.6);
      ctx.fillStyle = '#5a5e60'; ctx.beginPath(); ctx.arc(X(20 + side*15), Y(37), 1*u, 0, Math.PI*2); ctx.fill();
    }

    // An unpowered pole is drawn in lighter, greyer weathered timber, so a
    // dead pole can be told apart; at night renderUnpoweredPolesNight() gives
    // it a faint soft glow over the dark so it can still be found.
    const foot = inWater ? 34 : 37;                         // stands on the pier top in water
    const dead = !on && !e._iconThumb;

    // Tapered timber shaft
    const sg = ctx.createLinearGradient(X(18), 0, X(22), 0);
    if (dead) { sg.addColorStop(0, '#665c4e'); sg.addColorStop(0.45, '#958a78'); sg.addColorStop(1, '#584f43'); }
    else      { sg.addColorStop(0, '#4a3624'); sg.addColorStop(0.45, '#7e603f'); sg.addColorStop(1, '#3a2b1c'); }
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.moveTo(X(18.1), Y(foot)); ctx.lineTo(X(18.9), Y(4.5)); ctx.lineTo(X(21.1), Y(4.5)); ctx.lineTo(X(21.9), Y(foot)); ctx.closePath(); ctx.fill();
    if (detail) {
      line(19.7, 8, 19.5, 34, 'rgba(30,20,12,0.35)', 0.35);
      line(20.7, 11, 20.8, 30, 'rgba(160,120,80,0.25)', 0.3);
      // step bolts, alternating sides
      for (let y = 17, k = 0; y < 32; y += 3.5, k++) rect(k % 2 ? 21.6 : 17.3, y, 1.1, 0.6, '#9a9a96');
    }
    rect(18.6, 3.8, 2.8, 1.2, '#2e2e30');                 // pole cap

    // ID tag — blinks amber when the pole is out of wire range
    const tagWarn = stranded && Math.sin(t*6) > 0;
    rect(18.9, 25, 2.2, 2.6, tagWarn ? '#f0a020' : '#d8d4c0');
    if (detail && !tagWarn) rect(19.3, 25.8, 1.4, 0.4, '#5a5a5a');

    // Crossarm on diagonal braces
    rect(7, 9.6, 26, 2.4, dead ? '#7e7464' : '#5e4832');
    rect(7, 11.4, 26, 0.6, 'rgba(0,0,0,0.3)');
    line(12, 12, 19, 17, '#4a3a2a', 0.8);
    line(28, 12, 21, 17, '#4a3a2a', 0.8);

    // Transformer can on some poles
    if (hash(3) < 0.4) {
      const tx = side > 0 ? 22 : 12.8;
      const tg = ctx.createLinearGradient(X(tx), 0, X(tx + 5.2), 0);
      tg.addColorStop(0, '#6a7074'); tg.addColorStop(0.5, '#a8b0b4'); tg.addColorStop(1, '#5a6064');
      ctx.fillStyle = tg; ctx.beginPath(); ctx.roundRect(X(tx), Y(16.5), 5.2*u, 8*u, 1*u); ctx.fill();
      rect(tx - 0.3, 16, 5.8, 1, '#4a5054');
      rect(tx + 1.2, 14.8, 0.9, 1.4, '#c8d8d0');
      rect(tx + 3.1, 14.8, 0.9, 1.4, '#c8d8d0');
      if (detail) rect(tx + 1, 20, 3.2, 1.2, '#e8c020');  // rating band
    }

    // Glass insulators on pins
    for (let i = 0; i < 3; i++) {
      const ix = 9.5 + i*10.5;
      line(ix, 9.6, ix, 7.8, '#3a3a3a', 0.6);
      if (on && !failed && detail) {
        ctx.fillStyle = `rgba(170,255,170,${0.22 + 0.16*Math.sin(t*3 + i)})`;
        ctx.beginPath(); ctx.arc(X(ix), Y(6.8), 3.4*u, 0, Math.PI*2); ctx.fill();
      }
      ctx.fillStyle = on && !failed ? '#7fd29a' : '#5f8f78';
      ctx.beginPath(); ctx.ellipse(X(ix), Y(7.3), 2.2*u, 1.1*u, 0, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(X(ix), Y(5.9), 1.4*u, 1.2*u, 0, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.ellipse(X(ix - 0.6), Y(5.6), 0.5*u, 0.4*u, 0, 0, Math.PI*2); ctx.fill();
    }

    // Failed: arcing at the crossarm, with a thin trail of smoke
    if (failed) {
      const flick = Math.sin(t*23) * Math.sin(t*37);
      if (flick > -0.2) {
        ctx.strokeStyle = `rgba(255,${200 + Math.round(55*flick)},120,0.95)`; ctx.lineWidth = 0.7*u;
        for (let k = 0; k < 4; k++) {
          const a = t*9 + k*1.7, r0 = 1.5, r1 = 4 + 2*Math.sin(t*13 + k);
          ctx.beginPath();
          ctx.moveTo(X(20 + Math.cos(a)*r0), Y(8 + Math.sin(a)*r0));
          ctx.lineTo(X(20 + Math.cos(a + 0.4)*(r0 + r1)*0.6), Y(8 + Math.sin(a + 0.4)*(r0 + r1)*0.6));
          ctx.lineTo(X(20 + Math.cos(a)*r1), Y(8 + Math.sin(a)*r1));
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(255,240,200,0.9)'; ctx.beginPath(); ctx.arc(X(20), Y(8), 1.3*u, 0, Math.PI*2); ctx.fill();
      }
      for (let k = 0; k < 3; k++) {
        const f = (t*0.5 + k/3) % 1;
        ctx.fillStyle = `rgba(90,90,95,${0.35*(1 - f)})`;
        ctx.beginPath(); ctx.arc(X(20 + f*4), Y(6 - f*10), (1 + f*3)*u, 0, Math.PI*2); ctx.fill();
      }
    }

    ctx.restore();
  }

// A pole's own shape (shaft and crossarm, tile units as renderPole), filled
// with a soft blur round it: a faint glow, not an outline.
function _poleGlow(X, Y, u, foot, colour) {
  ctx.save();
  ctx.fillStyle = colour;
  ctx.shadowColor = colour;
  ctx.shadowBlur = Math.max(2, 5 * u * Camera.zoom);   // screen px: stays soft zoomed out
  ctx.beginPath();
  ctx.moveTo(X(18.1), Y(foot)); ctx.lineTo(X(18.9), Y(4.5)); ctx.lineTo(X(21.1), Y(4.5)); ctx.lineTo(X(21.9), Y(foot)); ctx.closePath();
  ctx.rect(X(7), Y(9.6), 26 * u, 2.4 * u);
  ctx.fill();
  ctx.restore();
}

// After the night overlay (render_main_loop.js): every unpowered pole on
// screen gets a faint soft glow over the dark, so a dead pole can still be
// found at night, zoomed in or out. Fades in with the dark.
function renderUnpoweredPolesNight(ctx, dark, cStart, cEnd, rStart, rEnd) {
  if (dark <= 0.05 || typeof T === 'undefined' || !T.POLE) return;
  const a = Math.min(0.22, dark * 0.3);
  const u = TILE / 40;
  for (const e of EntityRegistry.getByType(T.POLE)) {
    if (e.powered || e.col < cStart - 1 || e.col > cEnd + 1 || e.row < rStart - 1 || e.row > rEnd + 1) continue;
    const px = e.col * TILE + (typeof poleKerbShift === 'function' ? poleKerbShift(e, 17) : 0), py = e.row * TILE;
    _poleGlow(v => px + v * u, v => py + v * u, u, e._underWater ? 34 : 37, `rgba(215,208,190,${a.toFixed(3)})`);
  }
}

function renderSolar2(e, px, py, t) {
    // Render natively at 2×2 tile size — don't rely on canvas scaling
    const W   = TILE * 3, H = TILE * 2;
    const cx  = px + W / 2, cy = py + H / 2;
    const pad = 8;
    const lvl = e.def.peakOutput > 0 ? e.def.powerOutput / e.def.peakOutput : 0;

    if (lvl > 0.05) {
      if (Camera.zoom > 0.5) {  // LOD: skip glow gradient when zoomed out — imperceptible at this scale, but costly to paint for every visible entity
      drawGlowHalo(cx, cy, W * 0.8, [[0, '#80c8ff'], [1, 'transparent']], lvl * 0.5);
      }
    }

    // 3×2: a gravel pad with two racked rows of two modules each, a
    // string inverter on the east side, and DC runs from each row into it.
    const fine = Camera.zoom > 0.45;
    const on   = lvl > 0.05;
    ctx.fillStyle = '#2a2b24'; ctx.fillRect(px + 3, py + 3, W - 6, H - 6);
    if (fine) {
      ctx.setLineDash([2, 3]); ctx.strokeStyle = 'rgba(200,204,196,0.3)'; ctx.lineWidth = 1;
      ctx.strokeRect(px + 4.5, py + 4.5, W - 9, H - 9); ctx.setLineDash([]);
    }

    const invW = 14, rowX = px + pad, rowW = W - pad * 2 - invW - 6;
    const rowH = (H - pad * 2 - 10) / 2, modW = (rowW - 3) / 2;
    const invX = rowX + rowW + 6;
    for (let r = 0; r < 2; r++) {
      const ry = py + pad + r * (rowH + 10);
      for (let m = 0; m < 2; m++) _drawPvModule(rowX + m * (modW + 3), ry, modW, rowH, 6, 4, lvl, t, fine, e.dust || 0);
      ctx.fillStyle = '#c86a20';                               // DC run to inverter
      ctx.fillRect(rowX + rowW + 1, ry + rowH / 2, invX - rowX - rowW - 1, 1.2);
    }

    // String inverter cabinet with a status LED and cooling fins.
    const invY = py + pad + 2, invH = H - pad * 2 - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(invX + 2, invY + 3, invW, invH);
    ctx.fillStyle = '#c8ccc8'; ctx.fillRect(invX, invY, invW, invH);
    ctx.fillStyle = '#e4e8e4'; ctx.fillRect(invX, invY, invW, 2);
    if (fine) {
      ctx.fillStyle = '#9aa09a';
      for (let k = 0; k < 6; k++) ctx.fillRect(invX + 2, invY + invH * 0.45 + k * 3.2, invW - 4, 1);
    }
    ctx.fillStyle = on ? `rgba(95,220,120,${0.7 + 0.3 * Math.sin(t * 3)})` : '#4a5a50';
    ctx.fillRect(invX + invW / 2 - 1.5, invY + 6, 3, 3);

    _drawSolarReadout(e, cx, py + pad - 2, lvl, 7);
    drawNetworkHighlight(e, px, py, t);
  }

// ── Solar Array (6×4) ──
// Authored natively at footprint size and called once at the anchor, like
// the MK2. Three single-axis tracker rows turn with the sun through the day
// and stow flat overnight; the molten-salt tank fills, glows and shimmers
// with stored heat; wash robots ride the rows while the array can feed them.
// Layout in local px (240×160): rows x 12–156, robot docks 156–166, heat
// header x 172, tank centred x 206, inverter skid under the tank.
const _S3 = { rx: 12, rw: 144, rd: 34, rows: [12, 56, 100], hx: 172, tx: 206, tr: 21, tTop: 30, tBot: 108 };

// Tracker angle in radians: −0.95 (facing east at dawn) … +0.95 (west at
// dusk), easing back to 0 (stowed flat) through the last of dusk.
function _solar3Tilt() {
  const dark = DayNight.darkness();
  if (dark >= 0.97) return 0;
  const a = Math.max(-1, Math.min(1, (DayNight.hour() - 12.75) / 6));
  return a * 0.95 * (1 - Math.max(0, dark - 0.6) / 0.37);
}
// Quantised, so the baked bitmap is only rebuilt when the rows visibly turn.
function _solar3TiltQ() { return Math.round(_solar3Tilt() * 20) / 20; }
// Visible half-depth of a row at a tilt (it foreshortens as it turns).
function _s3Half(tilt) { return _S3.rd * 0.5 * Math.max(0.4, Math.cos(tilt)); }

function _s3Row(x, y, w, d, tilt, lit, fine) {
  const s = Math.sin(tilt), half = _s3Half(tilt), cy = y + d * 0.5;
  // Ground shadow, thrown away from the sun.
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(x + 3, cy - half + 4 - s * 6, w, half * 2);
  // Torque tube stubs and the slew drive at the west end.
  ctx.fillStyle = '#5c646a';
  ctx.fillRect(x - 6, cy - 1.5, 6, 3); ctx.fillRect(x + w, cy - 1.5, 4, 3);
  ctx.fillStyle = '#2e3438'; ctx.fillRect(x - 10, cy - 4.5, 6, 9);
  ctx.fillStyle = '#454d54'; ctx.fillRect(x - 10, cy - 4.5, 6, 1.6);
  ctx.strokeStyle = '#7a848c'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.arc(x - 7, cy, 2.6, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#596269'; ctx.fillRect(x - 11.5, cy + 1.5, 2.5, 3.5);   // drive motor
  // Pier footings under the tube, peeking out past the glass.
  ctx.fillStyle = 'rgba(150,150,140,0.55)';
  for (let k = 0; k <= 3; k++) ctx.fillRect(x + k * (w / 3) - 2, cy + half + 0.5 + Math.max(0, s) * 4, 4, 2);
  // Frame edge on the side that tips up toward the viewer.
  const edge = Math.abs(s) * 4;
  if (edge > 0.3) {
    ctx.fillStyle = '#8e989f';
    if (s > 0) ctx.fillRect(x, cy + half, w, edge);
    else       ctx.fillRect(x, cy - half - edge, w, edge);
  }
  // Panel face: brighter on the edge that faces the sun.
  const g = ctx.createLinearGradient(0, cy - half, 0, cy + half);
  const hi = lit ? '#2f78d0' : '#183a68', lo = lit ? '#0b2552' : '#081a34';
  g.addColorStop(0, s <= 0 ? hi : lo); g.addColorStop(1, s <= 0 ? lo : hi);
  ctx.fillStyle = g; ctx.fillRect(x, cy - half, w, half * 2);
  const mods = 6, mw = w / mods;
  // Each module catches the sky a little differently, with a soft sheen
  // across its upper corner.
  for (let m = 0; m < mods; m++) {
    const mx = x + m * mw;
    ctx.fillStyle = (m % 2) ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
    ctx.fillRect(mx, cy - half, mw, half * 2);
    if (fine) {
      const sh = ctx.createLinearGradient(mx, cy - half, mx + mw * 0.6, cy + half * 0.4);
      sh.addColorStop(0, lit ? 'rgba(190,230,255,0.20)' : 'rgba(150,180,220,0.08)'); sh.addColorStop(1, 'rgba(190,230,255,0)');
      ctx.fillStyle = sh; ctx.fillRect(mx, cy - half, mw, half * 2);
    }
  }
  if (fine) {
    ctx.strokeStyle = lit ? 'rgba(150,210,255,0.22)' : 'rgba(120,160,210,0.12)'; ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let k = 1; k < 4; k++) { const yy = cy - half + (half * 2) * k / 4; ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); }
    for (let m = 0; m < mods; m++) for (let k = 1; k < 4; k++) {
      const xx = x + m * mw + mw * k / 4; ctx.moveTo(xx, cy - half); ctx.lineTo(xx, cy + half);
    }
    ctx.stroke();
  }
  if (fine) {
    // Silver busbars, two per module.
    ctx.strokeStyle = lit ? 'rgba(220,228,236,0.38)' : 'rgba(170,180,190,0.18)'; ctx.lineWidth = 0.4;
    ctx.beginPath();
    for (let m = 0; m < mods; m++) for (const f of [0.33, 0.67]) {
      const xx = x + m * mw + mw * f; ctx.moveTo(xx, cy - half + 1); ctx.lineTo(xx, cy + half - 1);
    }
    ctx.stroke();
  }
  ctx.fillStyle = '#04101e';
  for (let m = 1; m < mods; m++) ctx.fillRect(x + m * mw - 0.8, cy - half, 1.6, half * 2);
  ctx.strokeStyle = '#c9a050'; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, cy - half + 0.5, w - 1, half * 2 - 1);
  // Inner frame bevel.
  ctx.strokeStyle = 'rgba(255,230,170,0.25)'; ctx.lineWidth = 0.5;
  ctx.strokeRect(x + 1.5, cy - half + 1.5, w - 3, half * 2 - 3);
  // Junction boxes on the tube between modules.
  ctx.fillStyle = '#1a1f24';
  for (let m = 1; m < mods; m += 2) ctx.fillRect(x + m * mw - 2, cy - 1.2, 4, 2.4);
}

function renderSolar3(e, px, py, t) {
  const W = TILE * 6, H = TILE * 4;
  const d    = e.def;
  const live = !e._ghost;
  const lvl  = d.peakOutput > 0 ? Math.min(1, d.powerOutput / d.peakOutput) : 0;
  const lit  = lvl > 0.05;
  const sPct = d.saltCapacity > 0 ? Math.min(1, (e._saltKWh || 0) / d.saltCapacity) : 0;
  const flow = e._saltFlow || 0;
  const dark = DayNight.darkness();
  const tilt = _solar3TiltQ();
  const fine = Camera.zoom > 0.4;
  const Sp = SplitPhase.wantStatic(), Ap = SplitPhase.wantOver(), Up = SplitPhase.wantUnder();
  const X = v => px + v, Y = v => py + v;
  const { rx, rw, rd, rows, hx, tx, tr, tTop, tBot } = _S3;

  // ── Under: daylight bloom off the glass, and the tank's heat at night ──
  if (Up && live && Camera.zoom > 0.5) {
    if (lit) drawGlowHalo(X(rx + rw / 2), Y(H / 2), W * 0.55, [[0, '#80c8ff'], [1, 'transparent']], lvl * 0.35);
    if (sPct > 0.05 && dark > 0.4) drawGlowHalo(X(tx), Y((tTop + tBot) / 2), tr * 3, [[0, '#ff8a30'], [1, 'transparent']], sPct * 0.45 * dark);
  }

  // ── Static: pad, fence, road, rows, pipework, tank, skid ──
  if (Sp) {
    ctx.fillStyle = '#26271f'; ctx.fillRect(X(2), Y(2), W - 4, H - 4);
    ctx.fillStyle = 'rgba(255,255,240,0.05)';
    for (let k = 0; k < 70; k++) {
      const sx = (k * 97.3) % (W - 8), sy = (k * 53.7 + k * k * 0.31) % (H - 8);
      ctx.fillRect(X(4 + sx), Y(4 + sy), 1.2, 1.2);
    }
    // Service road along the bottom, under the readout.
    ctx.fillStyle = '#1c1d19'; ctx.fillRect(X(6), Y(143), 170, 13);
    ctx.strokeStyle = 'rgba(230,200,90,0.45)'; ctx.lineWidth = 1; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.moveTo(X(10), Y(149.5)); ctx.lineTo(X(172), Y(149.5)); ctx.stroke();
    ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(200,204,196,0.4)';
    ctx.strokeRect(X(3.5), Y(3.5), W - 7, H - 7);
    ctx.setLineDash([]);

    // Cable trenches between the rows: concrete lid, orange DC runs.
    for (const ty of [rows[0] + rd + 5, rows[1] + rd + 5]) {
      ctx.fillStyle = '#3a3a34'; ctx.fillRect(X(rx - 2), Y(ty - 1.5), rw + 14, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); for (let xx = rx; xx < rx + rw + 12; xx += 12) { ctx.moveTo(X(xx), Y(ty - 1.5)); ctx.lineTo(X(xx), Y(ty + 1.5)); } ctx.stroke();
      ctx.fillStyle = '#c86a20'; ctx.fillRect(X(rx + rw + 4), Y(ty - 0.6), 8, 1.2);
    }
    for (let r = 0; r < 3; r++) _s3Row(X(rx), Y(rows[r]), rw, rd, tilt, lit, fine);

    // Robot docks at the east end of each row.
    for (let r = 0; r < 3; r++) {
      const cy = rows[r] + rd / 2;
      ctx.fillStyle = '#3a4046'; ctx.fillRect(X(158), Y(cy - 9), 9, 18);
      ctx.fillStyle = '#4e565e'; ctx.fillRect(X(158), Y(cy - 9), 9, 3);
      ctx.fillStyle = '#d8a848'; ctx.fillRect(X(158), Y(cy + 7), 9, 1.2);
    }

    // Heat header: a feeder off every row into the vertical main, then into the tank.
    ctx.lineCap = 'round';
    for (const [col, lw] of [['#2a221c', 5], ['#8a7058', 3]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw;
      ctx.beginPath();
      for (let r = 0; r < 3; r++) { const cy = rows[r] + rd / 2; ctx.moveTo(X(167), Y(cy)); ctx.lineTo(X(hx), Y(cy)); }
      ctx.moveTo(X(hx), Y(rows[0] + rd / 2)); ctx.lineTo(X(hx), Y(rows[2] + rd / 2));
      ctx.moveTo(X(hx), Y(70)); ctx.lineTo(X(tx - tr), Y(70));
      // tank → inverter
      ctx.moveTo(X(tx + 8), Y(tBot + 4)); ctx.lineTo(X(tx + 8), Y(126));
      ctx.stroke();
    }
    ctx.lineCap = 'butt';

    // Molten-salt tank: insulated drum with gold cladding bands.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(X(tx + 5), Y(tBot + 3), tr + 3, 7, 0, 0, Math.PI * 2); ctx.fill();
    const bg = ctx.createLinearGradient(X(tx - tr), 0, X(tx + tr), 0);
    bg.addColorStop(0, '#4a3a2e'); bg.addColorStop(0.35, '#a8927a'); bg.addColorStop(0.7, '#6a5644'); bg.addColorStop(1, '#2e241c');
    ctx.fillStyle = bg;
    ctx.fillRect(X(tx - tr), Y(tTop), tr * 2, tBot - tTop);
    ctx.beginPath(); ctx.ellipse(X(tx), Y(tBot), tr, 6, 0, 0, Math.PI); ctx.fill();
    ctx.fillStyle = 'rgba(224,176,80,0.6)';
    for (const by of [tTop + 16, tTop + 40, tTop + 64]) ctx.fillRect(X(tx - tr), Y(by), tr * 2, 2);
    const rg = ctx.createLinearGradient(0, Y(tTop - 7), 0, Y(tTop + 7));
    rg.addColorStop(0, '#c2b098'); rg.addColorStop(1, '#6e5c4a');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.ellipse(X(tx), Y(tTop), tr, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,22,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
    // Roof vent stack and the ladder up the east side.
    ctx.fillStyle = '#3c3a38'; ctx.fillRect(X(tx - 3.5), Y(tTop - 12), 7, 12);
    ctx.fillStyle = '#5a5654'; ctx.fillRect(X(tx - 4.5), Y(tTop - 13), 9, 2.5);
    ctx.strokeStyle = 'rgba(30,24,20,0.7)'; ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(X(tx + tr - 6), Y(tTop + 4)); ctx.lineTo(X(tx + tr - 6), Y(tBot));
    ctx.moveTo(X(tx + tr - 2), Y(tTop + 4)); ctx.lineTo(X(tx + tr - 2), Y(tBot));
    for (let yy = tTop + 8; yy < tBot; yy += 5) { ctx.moveTo(X(tx + tr - 6), Y(yy)); ctx.lineTo(X(tx + tr - 2), Y(yy)); }
    ctx.stroke();
    // Rivet lines along the cladding bands.
    if (fine) {
      ctx.fillStyle = 'rgba(30,22,16,0.55)';
      for (const by of [tTop + 16, tTop + 40, tTop + 64]) for (let xx = tx - tr + 3; xx < tx + tr - 2; xx += 4) ctx.fillRect(X(xx), Y(by + 0.6), 0.9, 0.9);
    }
    // Hazard-striped plinth ring.
    ctx.save();
    ctx.beginPath(); ctx.rect(X(tx - tr), Y(tBot - 5), tr * 2, 5); ctx.clip();
    ctx.fillStyle = '#d8b030'; ctx.fillRect(X(tx - tr), Y(tBot - 5), tr * 2, 5);
    ctx.fillStyle = '#1c1a16';
    for (let xx = -8; xx < tr * 2 + 8; xx += 6) {
      ctx.beginPath(); ctx.moveTo(X(tx - tr + xx), Y(tBot)); ctx.lineTo(X(tx - tr + xx + 3), Y(tBot)); ctx.lineTo(X(tx - tr + xx + 8), Y(tBot - 5)); ctx.lineTo(X(tx - tr + xx + 5), Y(tBot - 5)); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // Inlet flange, isolation valve wheel and the nameplate.
    ctx.fillStyle = '#5a5048'; ctx.fillRect(X(tx - tr - 2), Y(66), 4, 8);
    ctx.strokeStyle = '#c03028'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(X(tx - tr - 7), Y(62), 2.6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(tx - tr - 9.6), Y(62)); ctx.lineTo(X(tx - tr - 4.4), Y(62)); ctx.moveTo(X(tx - tr - 7), Y(59.4)); ctx.lineTo(X(tx - tr - 7), Y(64.6)); ctx.stroke();
    ctx.fillStyle = '#d8d0b8'; ctx.fillRect(X(tx + 1), Y(tTop + 44), 12, 7);
    if (fine) {
      ctx.fillStyle = '#3a2a1a'; ctx.font = 'bold 3.2px Courier New'; ctx.textAlign = 'center';
      ctx.fillText('NaNO3', X(tx + 7), Y(tTop + 47.2)); ctx.fillText('565°C', X(tx + 7), Y(tTop + 50.4));
      ctx.textAlign = 'left';
    }
    // Circulation pump on the inlet (its impeller turns live).
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(X(176), Y(76), 9, 4);
    ctx.fillStyle = '#4a5258'; ctx.beginPath(); ctx.roundRect(X(175), Y(65), 9, 11, 1.5); ctx.fill();
    ctx.fillStyle = '#2a3034'; ctx.beginPath(); ctx.arc(X(179.5), Y(70.5), 3.2, 0, Math.PI * 2); ctx.fill();
    // Tracker weather mast: pyranometer dome + anemometer post.
    ctx.strokeStyle = '#8a9298'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(X(180), Y(20)); ctx.lineTo(X(180), Y(7)); ctx.moveTo(X(177), Y(11)); ctx.lineTo(X(183), Y(11)); ctx.stroke();
    ctx.fillStyle = '#e8eef2'; ctx.beginPath(); ctx.arc(X(177), Y(10.5), 1.4, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#3a4044'; ctx.fillRect(X(178.5), Y(18), 3, 3);
    // Sight gauge slot (its glowing level is live).
    ctx.fillStyle = '#120c08';
    ctx.beginPath(); ctx.roundRect(X(tx - 9), Y(tTop + 10), 8, tBot - tTop - 18, 2); ctx.fill();

    // Inverter / transformer skid.
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(X(186), Y(128), 46, 26);
    ctx.fillStyle = '#3c4448'; ctx.fillRect(X(184), Y(125), 46, 26);
    ctx.fillStyle = '#56626a'; ctx.fillRect(X(184), Y(125), 46, 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) { const xx = 188 + k * 3; ctx.moveTo(X(xx), Y(132)); ctx.lineTo(X(xx), Y(147)); }
    ctx.stroke();
    ctx.fillStyle = '#c8ccc4';
    for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(X(212 + k * 6), Y(124), 1.8, 0, Math.PI * 2); ctx.fill(); }
    // Radiator fins down the east side.
    ctx.fillStyle = '#2c3236';
    for (let k = 0; k < 5; k++) ctx.fillRect(X(230), Y(128 + k * 4.5), 3, 2.6);
    // HV warning sign.
    ctx.fillStyle = '#f0c020';
    ctx.beginPath(); ctx.moveTo(X(200), Y(133)); ctx.lineTo(X(204), Y(140)); ctx.lineTo(X(196), Y(140)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(X(199.6), Y(135), 0.8, 3); ctx.fillRect(X(199.6), Y(138.6), 0.8, 0.8);
    // Export cable out to the boundary.
    ctx.strokeStyle = '#1e2226'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(207), Y(151)); ctx.lineTo(X(207), Y(156)); ctx.lineTo(X(238), Y(156)); ctx.stroke();
  }

  if (!Ap) return;

  // ── Over: everything that moves or tracks live state ──
  // Sun glint sweeping across the glass.
  if (live && lit && fine) {
    const half = _s3Half(tilt);
    ctx.save();
    ctx.beginPath();
    for (let r = 0; r < 3; r++) { const cy = rows[r] + rd / 2; ctx.rect(X(rx), Y(cy - half), rw, half * 2); }
    ctx.clip();
    const gx = X(rx + (((t * 0.06) % 1.6) - 0.3) * rw);
    const gg = ctx.createLinearGradient(gx - 26, 0, gx + 26, 0);
    gg.addColorStop(0, 'rgba(200,235,255,0)'); gg.addColorStop(0.5, `rgba(220,245,255,${(0.28 * lvl).toFixed(3)})`); gg.addColorStop(1, 'rgba(200,235,255,0)');
    ctx.fillStyle = gg;
    ctx.beginPath(); ctx.moveTo(gx - 26, Y(0)); ctx.lineTo(gx + 26, Y(0)); ctx.lineTo(gx - 4, Y(H)); ctx.lineTo(gx - 56, Y(H)); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // Wash robots: a gantry per row, shuttling while they have power.
  {
    const half = _s3Half(tilt);
    for (let r = 0; r < 3; r++) {
      const cy = rows[r] + rd / 2;
      const running = live && e._washing;
      const ph  = t * 0.16 + r * 2.1;
      const pos = running ? 0.5 + 0.5 * Math.sin(ph) : 1;
      const dir = Math.cos(ph) >= 0 ? 1 : -1;
      const bx  = X(rx + 4 + pos * (rw + 2 - 12));
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx + 2, Y(cy - half - 1) + 3, 8, half * 2 + 2);
      ctx.fillStyle = '#dfe4e8'; ctx.fillRect(bx, Y(cy - half - 2), 8, half * 2 + 4);
      ctx.fillStyle = '#9aa4ac'; ctx.fillRect(bx, Y(cy - half - 2), 8, 3);
      ctx.fillRect(bx, Y(cy + half - 1), 8, 3);
      // Rail wheels at each end and the little panel that tops it up.
      ctx.fillStyle = '#2a2e32';
      for (const wy of [cy - half - 2.5, cy + half + 1.5]) { ctx.fillRect(bx - 0.8, Y(wy), 2, 1.6); ctx.fillRect(bx + 6.8, Y(wy), 2, 1.6); }
      ctx.fillStyle = '#1d4c8a'; ctx.fillRect(bx + 1.5, Y(cy - 3), 5, 6);
      ctx.strokeStyle = 'rgba(160,210,255,0.5)'; ctx.lineWidth = 0.4; ctx.strokeRect(bx + 1.5, Y(cy - 3), 5, 6);
      if (running) {
        // Spinning brush roller: stripes scroll down the roller.
        ctx.strokeStyle = 'rgba(40,120,200,0.8)'; ctx.lineWidth = 1;
        ctx.beginPath();
        const off = (t * 30) % 5;
        for (let yy = -half + off; yy < half; yy += 5) { ctx.moveTo(bx + 1.5, Y(cy + yy)); ctx.lineTo(bx + 6.5, Y(cy + yy + 2)); }
        ctx.stroke();
        // Rinse spray trailing behind it.
        if (fine) for (let k = 0; k < 5; k++) {
          const f = ((t * 1.6 + k / 5) % 1);
          ctx.fillStyle = `rgba(150,220,255,${(0.7 * (1 - f)).toFixed(2)})`;
          ctx.fillRect(bx + 4 - dir * (6 + f * 10), Y(cy - half + ((k * 37) % 10) / 10 * half * 2), 1.4, 1.4);
        }
        ctx.fillStyle = `rgba(80,220,255,${(0.5 + 0.5 * Math.sin(t * 6 + r)).toFixed(2)})`;
      } else {
        ctx.fillStyle = '#4a5258';
      }
      ctx.beginPath(); ctx.arc(bx + 4, Y(cy - half - 0.5), 1.3, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Pump impeller, spinning while heat is moving through it.
  {
    const spin = live && Math.abs(flow) > 0.5 ? t * 9 : 0.4;
    ctx.strokeStyle = '#9aa6ac'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let b = 0; b < 3; b++) { const a = spin + b * Math.PI * 2 / 3; ctx.moveTo(X(179.5), Y(70.5)); ctx.lineTo(X(179.5 + Math.cos(a) * 2.6), Y(70.5 + Math.sin(a) * 2.6)); }
    ctx.stroke();
    // Anemometer cups on the weather mast.
    const anA = live ? t * (2 + WindState.speed * 10) : 0;
    ctx.fillStyle = '#2e3236';
    for (let c = 0; c < 3; c++) { const a = anA + c * Math.PI * 2 / 3; ctx.beginPath(); ctx.arc(X(183 + Math.cos(a) * 2.2), Y(7 + Math.sin(a) * 0.9), 0.8, 0, Math.PI * 2); ctx.fill(); }
    // Slew-drive status LEDs: green while tracking, amber when stowed.
    if (live) {
      const tracking = Math.abs(tilt) > 0.02;
      ctx.fillStyle = tracking ? `rgba(90,255,140,${(0.55 + 0.45 * Math.sin(t * 3)).toFixed(2)})` : 'rgba(255,170,50,0.75)';
      for (let r = 0; r < 3; r++) ctx.fillRect(X(rx - 8), Y(rows[r] + rd / 2 - 3.6), 1.4, 1.4);
    }
  }

  // Heat pulses in the pipework: into the tank while charging, out to the
  // inverter while the tank carries the array.
  if (live && Math.abs(flow) > 0.5) {
    const charging = flow > 0;
    ctx.fillStyle = charging ? 'rgba(255,214,110,0.9)' : 'rgba(255,128,40,0.95)';
    for (let k = 0; k < 4; k++) {
      const f = (t * 0.5 + k / 4) % 1;
      let x, y;
      if (charging) {
        const r = k % 3, cy = rows[r] + rd / 2;
        if (f < 0.5) { x = 167 + (hx - 167) * (f / 0.5); y = cy; }
        else { x = hx + (tx - tr - hx) * ((f - 0.5) / 0.5); y = 70; }
      } else { x = tx + 8; y = tBot + 4 + (126 - tBot - 4) * f; }
      ctx.beginPath(); ctx.arc(X(x), Y(y), 1.6, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Sight gauge: molten salt level, brighter the hotter the tank.
  {
    const gTop = tTop + 11, gH = tBot - tTop - 20, lvH = gH * sPct;
    if (lvH > 0.5) {
      const sg = ctx.createLinearGradient(0, Y(gTop + gH - lvH), 0, Y(gTop + gH));
      sg.addColorStop(0, '#ffe080'); sg.addColorStop(0.3, '#ff9a30'); sg.addColorStop(1, '#c0400c');
      ctx.fillStyle = sg; ctx.fillRect(X(tx - 8), Y(gTop + gH - lvH), 6, lvH);
      ctx.fillStyle = `rgba(255,240,180,${(0.45 + 0.35 * Math.sin(t * 3)).toFixed(2)})`;
      ctx.fillRect(X(tx - 8), Y(gTop + gH - lvH), 6, 1.2);
    }
  }

  // Heat shimmer off the vent stack once the tank is warm.
  if (live && sPct > 0.08 && fine) {
    for (let k = 0; k < 3; k++) {
      const f = (t * 0.35 + k / 3) % 1;
      ctx.fillStyle = `rgba(255,${170 + Math.round(60 * f)},110,${(0.28 * sPct * (1 - f)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(X(tx + Math.sin(t * 2 + k) * 2.5), Y(tTop - 14 - f * 16), 2.5 + f * 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Inverter status lamps: green on sun, amber on stored heat.
  if (live) {
    const onSalt = flow < -0.5;
    for (let k = 0; k < 3; k++) {
      const a = lvl > 0.01 ? 0.5 + 0.5 * Math.sin(t * 4 + k * 1.3) : 0.15;
      ctx.fillStyle = onSalt ? `rgba(255,170,40,${a.toFixed(2)})` : `rgba(90,255,140,${a.toFixed(2)})`;
      ctx.fillRect(X(206 + k * 6), Y(136), 3, 3);
    }
    // Amber dock beacons after dark.
    if (dark > 0.5) {
      const b = 0.5 + 0.5 * Math.sin(t * 2.4);
      ctx.fillStyle = `rgba(255,180,60,${(0.35 + 0.6 * b).toFixed(2)})`;
      for (let r = 0; r < 3; r++) { ctx.beginPath(); ctx.arc(X(162.5), Y(rows[r] + rd / 2 - 6), 1.3, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  if (live && lvl > 0.01) {
    ctx.font = 'bold 8px Courier New'; ctx.textAlign = 'center';
    ctx.lineWidth = 2.4; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round';
    const txt = formatPower(d.powerOutput, 1) + (flow < -0.5 ? ' · SALT' : '');
    ctx.strokeText(txt, X(90), Y(153)); ctx.fillStyle = flow < -0.5 ? '#ffc070' : '#9ad8ff'; ctx.fillText(txt, X(90), Y(153));
    ctx.textAlign = 'left';
  }
  drawNetworkHighlight(e, px, py, t);
}

/* Static/animated split for the Solar Array (see SplitPhase in
   render_core.js). Pad, rows, pipework, tank and skid are baked, keyed on the
   tracker angle (quantised) and whether the glass is lit; the glint, robots,
   heat pulses, gauge, shimmer, lamps and readout stay live. */
RenderSplit.register(T.SOLAR3, {
  alwaysLive: true,
  key(e) {
    const lit = e.def.peakOutput > 0 && e.def.powerOutput / e.def.peakOutput > 0.05;
    return _solar3TiltQ() + ':' + (lit ? 1 : 0) + ':' + (Camera.zoom > 0.4 ? 'f' : 'c');
  },
  // Straight to the sprite, not renderEntityAt: that also draws the baked
  // contact shadow, which the static pass already has.
  under(e, x, y, t) { SplitPhase.run('under', () => renderSolar3(e, x, y, t)); },
});

// Wind turbines are dispatched through dispatchScaledRender (authored 1×1),
// so both entry points hand off to native-size renderers via _commNative.
function renderWind(e, px, py, t)  { _commNative(e, px, py, t, _renderWindMk1); }
function renderWind2(e, px, py, t) { _commNative(e, px, py, t, _renderWindMk2); }
function renderWind3(e, px, py, t) { _commNative(e, px, py, t, _renderWindMk3); }

// The cinematics (the intro, the Hyperion finale and its stage scenes, the
// HQ unveiling) hold the sim at speed 0 while the camera tours the city, but
// they are not a pause: the blades keep turning through them at 1x, as the
// game loop keeps particles moving (_cineRunning in game_loop.js).
function _windCine() {
  return (typeof NationalProject !== 'undefined' && NationalProject.isActive())
      || (typeof IntroCinematic !== 'undefined' && IntroCinematic.isActive())
      || (typeof CompanyHQ !== 'undefined' && CompanyHQ.isActive())
      || document.body.classList.contains('np-draw');
}
// Blade physics — real-clock easing toward a wind-speed target, slower to
// decelerate than accelerate for natural gusts, but snapping instantly when
// the player changes game speed (a sim-speed change, not a physical event).
function _windBladeAngle(e, spd, mult, minSpd, inertiaDown, inertiaUp) {
  const _now2  = performance.now() / 1000;
  const _paused = DevMode.timeScale === 0 && !_windCine();
  const dt2    = (e._lastRealT && !_paused) ? Math.min(_now2 - e._lastRealT, 0.1) : 0;
  e._lastRealT = _now2;
  const ts     = DevMode.timeScale || 1;
  const radsec = (!_paused && e.powered) ? Math.max(minSpd, spd * mult) * Math.min(ts, 10) : 0;
  e._bladeSpd  = e._bladeSpd ?? radsec;
  const _tsChanged = e._lastTs !== undefined && e._lastTs !== ts;
  e._lastTs = ts;
  if (_tsChanged) {
    e._bladeSpd = radsec;
  } else if (!_paused) {
    const inertia = e._bladeSpd > radsec ? inertiaDown : inertiaUp;
    e._bladeSpd += (radsec - e._bladeSpd) * Math.min(1, dt2 * inertia);
  }
  if (!_paused) e._bladeAng = ((e._bladeAng ?? 0) + e._bladeSpd * dt2) % (Math.PI * 2);
  return e._bladeAng ?? 0;
}

function _windBlade(len, root, S, on, bands) {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(-root*0.5, 2*S);
    ctx.quadraticCurveTo(-root*1.15, -len*0.30, -root*0.22, -len);
    ctx.lineTo(root*0.12, -len);
    ctx.quadraticCurveTo(root*0.75, -len*0.35, root*0.5, 2*S);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(-root, 0, root, 0);
  g.addColorStop(0, on ? '#ffffff' : '#9aa0a0'); g.addColorStop(1, on ? '#c4ccd0' : '#6a7070');
  ctx.fillStyle = g; path(); ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.fillStyle = on ? '#d83a2a' : '#7a4a44';
  ctx.fillRect(-root*2, -len, root*4, len*0.12);
  if (bands) ctx.fillRect(-root*2, -len*0.78, root*4, len*0.07);
  ctx.restore();
  ctx.strokeStyle = on ? 'rgba(120,130,140,0.6)' : 'rgba(40,44,44,0.6)'; ctx.lineWidth = 0.6*S; path(); ctx.stroke();
}

// Rime on a blade (TurbineIcing), drawn in the blade's own frame after the
// blade: a white crust along the leading edge that thickens with the ice,
// and icicles off it once it is heavy. MK3 heated blades show a warm line
// along the edge while their heaters run. k = [root x, control x, control y,
// tip x] of the leading-edge curve as fractions of root/len, matching the
// blade's path; y0 is where that curve starts at the root.
function _windBladeIce(len, root, S, ice, k, y0, heating) {
  const [rx, cx, cy, tx] = k;
  const P0 = [-root*rx, y0], C = [-root*cx, -len*cy], P2 = [-root*tx, -len];
  if (heating) {
    ctx.strokeStyle = 'rgba(255,140,60,0.8)'; ctx.lineWidth = 1.1*S;
    ctx.beginPath(); ctx.moveTo(P0[0] + 0.6*S, P0[1]); ctx.quadraticCurveTo(C[0] + 0.6*S, C[1], P2[0] + 0.3*S, P2[1] + 2*S); ctx.stroke();
  }
  if (ice < 0.02) return;
  // Icy blue-white with a darker rim, so it reads on white blades as well
  // as on an MK3's dark ones.
  const th = root * (0.3 + 0.7*ice);
  ctx.beginPath();
  ctx.moveTo(P0[0] - 0.4*S, P0[1]); ctx.quadraticCurveTo(C[0] - 0.8*S*ice, C[1], P2[0] - 0.3*S, P2[1]);
  ctx.lineTo(P2[0] + th*0.4, P2[1]);
  ctx.quadraticCurveTo(C[0] + th, C[1], P0[0] + th, P0[1]);
  ctx.closePath();
  ctx.fillStyle = `rgba(196,226,248,${(0.5 + 0.45*ice).toFixed(2)})`; ctx.fill();
  ctx.strokeStyle = `rgba(90,140,180,${(0.45 + 0.4*ice).toFixed(2)})`; ctx.lineWidth = 0.6*S; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 0.5*S;
  ctx.beginPath(); ctx.moveTo(P0[0], P0[1]); ctx.quadraticCurveTo(C[0] - 0.4*S*ice, C[1], P2[0], P2[1]); ctx.stroke();
  if (ice > 0.45) {
    ctx.fillStyle = 'rgba(214,236,252,0.95)'; ctx.strokeStyle = 'rgba(90,140,180,0.6)'; ctx.lineWidth = 0.4*S;
    const L = (1.2 + 3.5*(ice - 0.45)/0.55)*S;
    for (const f of [0.3, 0.5, 0.68, 0.85]) {
      const a = (1 - f)*(1 - f), b = 2*(1 - f)*f, c = f*f;
      const x = a*P0[0] + b*C[0] + c*P2[0], y = a*P0[1] + b*C[1] + c*P2[1];
      ctx.beginPath(); ctx.moveTo(x, y - 0.8*S); ctx.lineTo(x - L, y + 0.2*S); ctx.lineTo(x, y + 0.8*S); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
}

// Frost settled on a nacelle's roof (TurbineIcing).
function _windNacelleIce(x, y, w, r, S, ice) {
  if (ice < 0.02) return;
  ctx.beginPath(); ctx.roundRect(x, y - 0.6*S, w, (1 + 1.8*ice)*S, [r, r, S, S]);
  ctx.fillStyle = `rgba(200,228,248,${(0.45 + 0.5*ice).toFixed(2)})`; ctx.fill();
  ctx.strokeStyle = `rgba(90,140,180,${(0.3 + 0.4*ice).toFixed(2)})`; ctx.lineWidth = 0.5*S; ctx.stroke();
}

// The output readout under a turbine, or ICED while the ice has stopped it.
function _windReadout(e, x, y, S, size, col) {
  ctx.font = `bold ${Math.max(5, size*S)}px Courier New`; ctx.textAlign = 'center';
  ctx.lineWidth = 2.2*S; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineJoin = 'round';
  const iced = e._iceStopped;
  const txt = iced ? '❄ ICED' : `${formatPower(e.def.powerOutput || 0, 1)}`;
  ctx.strokeText(txt, x, y); ctx.fillStyle = iced ? '#cfe6ff' : col; ctx.fillText(txt, x, y);
}

function _windGroundShadow(hubX, hubY, baseX, baseY, ang, blades, len, S) {
  const dx = 16*S, flat = 0.32;
  const shX = baseX + dx, shY = baseY - 2*S;
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 3*S; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(baseX, baseY); ctx.lineTo(shX, shY); ctx.stroke();
  ctx.lineWidth = 2.2*S;
  for (let b = 0; b < blades; b++) {
    const a = ang + b*Math.PI*2/blades;
    ctx.beginPath(); ctx.moveTo(shX, shY);
    ctx.lineTo(shX + Math.sin(a)*len, shY - Math.cos(a)*len*flat);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

// ── Wind Turbine MK1 (2×2) ──
function _renderWindMk1(e, px, py, W, H, t) {
  const S = TILE / 40, on = e.powered;
  const spd = WindState.speed, ice = e._ice || 0, spin = TurbineIcing.spinMult(e);
  const ang = _windBladeAngle(e, spd*spin, 2.2, 0.3*spin, 0.4, 2.0);
  const hubX = px + W*0.5, hubY = py + H*0.30, baseY = py + H*0.90;
  const len = W*0.40;
  ctx.save();

  _windGroundShadow(hubX, hubY, hubX, baseY, ang, 3, len*0.8, S);
  // footing
  ctx.fillStyle = '#9a968c'; ctx.beginPath(); ctx.ellipse(hubX, baseY, 7*S, 2.5*S, 0, 0, Math.PI*2); ctx.fill();
  // tower
  const tg = ctx.createLinearGradient(hubX - 3*S, 0, hubX + 3*S, 0);
  tg.addColorStop(0, on ? '#f4f6f6' : '#9aa0a0'); tg.addColorStop(1, on ? '#a8b0b4' : '#5a6060');
  ctx.fillStyle = tg;
  ctx.beginPath(); ctx.moveTo(hubX - 3*S, baseY); ctx.lineTo(hubX + 3*S, baseY); ctx.lineTo(hubX + 1.6*S, hubY); ctx.lineTo(hubX - 1.6*S, hubY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = on ? '#6a7478' : '#3a4044'; ctx.fillRect(hubX - 1*S, baseY - 5*S, 2*S, 3.5*S);
  // nacelle
  ctx.fillStyle = on ? '#e8ecee' : '#7a8080'; ctx.strokeStyle = 'rgba(60,70,76,0.6)'; ctx.lineWidth = 0.6*S;
  ctx.beginPath(); ctx.roundRect(hubX - 3*S, hubY - 3*S, 11*S, 6*S, 2.5*S); ctx.fill(); ctx.stroke();
  _windNacelleIce(hubX - 3*S, hubY - 3*S, 11*S, 2.5*S, S, ice);
  // blades
  for (let b = 0; b < 3; b++) {
    ctx.save(); ctx.translate(hubX, hubY); ctx.rotate(ang + b*Math.PI*2/3);
    _windBlade(len, 3.6*S, S, on, false);
    if (ice > 0.02) _windBladeIce(len, 3.6*S, S, ice, [0.5, 1.15, 0.30, 0.22], 2*S, false);
    ctx.restore();
  }
  // hub
  const hg = ctx.createRadialGradient(hubX - 1*S, hubY - 1*S, 0.5, hubX, hubY, 3.2*S);
  hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, on ? '#98a2a8' : '#5a6060');
  ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hubX, hubY, 3.2*S, 0, Math.PI*2); ctx.fill();

  if (on) _windReadout(e, hubX, py + H - 1*S, S, 6, '#9affc4');
  drawNetworkHighlight(e, px, py, t);
  ctx.restore();
}

// ── Wind Turbine MK2 (3×3) ──
function _renderWindMk2(e, px, py, W, H, t) {
  const S = TILE / 40, on = e.powered;
  const spd = WindState.speed, ice = e._ice || 0, spin = TurbineIcing.spinMult(e);
  const ang = _windBladeAngle(e, spd*spin, 1.8, 0.25*spin, 0.35, 1.7);
  const hubX = px + W*0.5, hubY = py + H*0.25, baseY = py + H*0.90;
  const len = W*0.42;
  ctx.save();

  _windGroundShadow(hubX, hubY, hubX, baseY, ang, 3, len*0.8, S);
  // transformer box + footing
  ctx.fillStyle = '#9a968c'; ctx.beginPath(); ctx.ellipse(hubX, baseY, 11*S, 3.5*S, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(hubX + 8*S, baseY - 6*S, 11*S, 8*S);
  ctx.fillStyle = on ? '#6a7a70' : '#3a4440'; ctx.fillRect(hubX + 6*S, baseY - 8*S, 11*S, 8*S);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.6*S;
  for (let x = hubX + 8*S; x < hubX + 16*S; x += 2*S) { ctx.beginPath(); ctx.moveTo(x, baseY - 7*S); ctx.lineTo(x, baseY - 1*S); ctx.stroke(); }
  ctx.fillStyle = on ? '#ffd040' : '#6a5a20'; ctx.fillRect(hubX + 10*S, baseY - 6*S, 3*S, 2.5*S);
  // tower
  const tg = ctx.createLinearGradient(hubX - 4.5*S, 0, hubX + 4.5*S, 0);
  tg.addColorStop(0, on ? '#f6f8f8' : '#9aa0a0'); tg.addColorStop(0.5, on ? '#e2e8ea' : '#80888a'); tg.addColorStop(1, on ? '#98a2a8' : '#505858');
  ctx.fillStyle = tg;
  ctx.beginPath(); ctx.moveTo(hubX - 4.5*S, baseY); ctx.lineTo(hubX + 4.5*S, baseY); ctx.lineTo(hubX + 2.2*S, hubY); ctx.lineTo(hubX - 2.2*S, hubY); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(80,90,96,0.35)'; ctx.lineWidth = 0.6*S;
  [0.35, 0.65].forEach(f => { const y = baseY + (hubY - baseY)*f, hw = 4.5*S + (2.2*S - 4.5*S)*f; ctx.beginPath(); ctx.moveTo(hubX - hw, y); ctx.lineTo(hubX + hw, y); ctx.stroke(); });
  ctx.fillStyle = on ? '#6a7478' : '#3a4044'; ctx.fillRect(hubX - 1.5*S, baseY - 7*S, 3*S, 5*S);
  // nacelle
  ctx.fillStyle = on ? '#eef2f4' : '#7a8080'; ctx.strokeStyle = 'rgba(60,70,76,0.6)'; ctx.lineWidth = 0.7*S;
  ctx.beginPath(); ctx.roundRect(hubX - 4*S, hubY - 4.5*S, 17*S, 9*S, 3.5*S); ctx.fill(); ctx.stroke();
  _windNacelleIce(hubX - 4*S, hubY - 4.5*S, 17*S, 3.5*S, S, ice);
  ctx.fillStyle = on ? '#40c8e8' : '#3a5a64'; ctx.fillRect(hubX + 2*S, hubY - 0.5*S, 10*S, 1.8*S);
  ctx.strokeStyle = 'rgba(80,90,96,0.4)'; ctx.lineWidth = 0.5*S;
  for (let x = hubX + 4*S; x < hubX + 12*S; x += 2*S) { ctx.beginPath(); ctx.moveTo(x, hubY - 3.5*S); ctx.lineTo(x, hubY - 1.5*S); ctx.stroke(); }
  // anemometer
  const anX = hubX + 10*S, anY = hubY - 8*S;
  ctx.strokeStyle = '#5a6064'; ctx.lineWidth = 0.7*S; ctx.beginPath(); ctx.moveTo(anX, hubY - 4.5*S); ctx.lineTo(anX, anY); ctx.stroke();
  const anA = on ? t*spd*12 : 0;
  for (let c = 0; c < 3; c++) {
    const a = anA + c*Math.PI*2/3;
    ctx.fillStyle = '#3a3e42'; ctx.beginPath(); ctx.arc(anX + Math.cos(a)*2.5*S, anY + Math.sin(a)*1*S, 0.9*S, 0, Math.PI*2); ctx.fill();
  }
  // aviation light
  const blink = 0.5 + 0.5*Math.sin(t*2.3);
  ctx.fillStyle = `rgba(255,50,40,${on ? 0.3 + 0.7*blink : 0.15})`;
  ctx.beginPath(); ctx.arc(hubX + 6*S, hubY - 5.5*S, 1.3*S, 0, Math.PI*2); ctx.fill();
  if (on && blink > 0.8) { ctx.fillStyle = 'rgba(255,60,40,0.25)'; ctx.beginPath(); ctx.arc(hubX + 6*S, hubY - 5.5*S, 5*S, 0, Math.PI*2); ctx.fill(); }
  // blades
  for (let b = 0; b < 3; b++) {
    ctx.save(); ctx.translate(hubX, hubY); ctx.rotate(ang + b*Math.PI*2/3);
    _windBlade(len, 4.6*S, S, on, true);
    if (ice > 0.02) _windBladeIce(len, 4.6*S, S, ice, [0.5, 1.15, 0.30, 0.22], 2*S, false);
    ctx.restore();
  }
  // hub spinner
  const hg = ctx.createRadialGradient(hubX - 1.5*S, hubY - 1.5*S, 0.5, hubX, hubY, 4.4*S);
  hg.addColorStop(0, '#ffffff'); hg.addColorStop(1, on ? '#90a0a8' : '#5a6060');
  ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hubX, hubY, 4.4*S, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = on ? '#40c8e8' : '#3a5a64'; ctx.beginPath(); ctx.arc(hubX, hubY, 1.3*S, 0, Math.PI*2); ctx.fill();

  if (on) _windReadout(e, hubX, py + H - 1*S, S, 6.5, '#8ae8ff');
  drawNetworkHighlight(e, px, py, t);
  ctx.restore();
}

function renderBattery(e, px, py, t) {
    if (e.col !== e.col) return;
    // Battery Block — 1×2 grid-scale lithium cabinet on a concrete pad.
    // Authored on a 40×80 grid (S = TILE/40). The front window is a tall
    // cell stack that fills from the bottom with charge, coloured by level;
    // a bright band sweeps up it while charging.
    const S = TILE / 40, W = TILE, H = TILE * 2;
    const X = v => px + v * S, Y = v => py + v * S;
    const rr = (x, y, w, h, r, fill, stroke, lw) => {
      ctx.beginPath(); ctx.roundRect(X(x), Y(y), w * S, h * S, r * S);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = (lw || 1) * S; ctx.stroke(); }
    };
    const cap = (e.def && e.def.capacity) || 0;
    const pct = cap > 0 ? Math.max(0, Math.min(1, (e.charge || 0) / cap)) : 0;
    const charging = !!e.charging;
    const live = pct > 0.02;
    const lc = pct > 0.5 ? [110, 240, 90] : pct > 0.2 ? [245, 205, 60] : [255, 105, 70];
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    ctx.save();

    if (live && Camera.zoom > 0.5) {  // LOD: skip glow gradient when zoomed out
      drawGlowHalo(X(20), Y(36), TILE * 1.05, [[0, rgba(lc, 1)], [1, 'transparent']],
        pct * 0.12 + (charging ? 0.07 + 0.04 * Math.sin(t * 4) : 0.02));
    }

    // ── Concrete pad ──
    rr(3.5, 6, 35, 73, 3, 'rgba(0,0,0,0.28)');
    rr(2, 4, 36, 73, 3, '#8b8f95', '#6c7076', 1);
    ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(X(3), Y(5), 34 * S, 1.2 * S);
    // Hazard stripes along the front apron
    ctx.save();
    ctx.beginPath(); ctx.rect(X(4), Y(70.5), 32 * S, 5 * S); ctx.clip();
    ctx.fillStyle = '#1c1c1c'; ctx.fillRect(X(4), Y(70.5), 32 * S, 5 * S);
    ctx.fillStyle = '#e8b818';
    for (let i = -1; i < 9; i++) {
      const sx = 4 + i * 4.5;
      ctx.beginPath();
      ctx.moveTo(X(sx), Y(75.5)); ctx.lineTo(X(sx + 2.4), Y(75.5));
      ctx.lineTo(X(sx + 7.4), Y(70.5)); ctx.lineTo(X(sx + 5), Y(70.5)); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // Anchor bolts
    ctx.fillStyle = '#5a5e64';
    for (const [bx, by] of [[4.5, 6.5], [35.5, 6.5]]) { ctx.beginPath(); ctx.arc(X(bx), Y(by), 1 * S, 0, Math.PI * 2); ctx.fill(); }

    // ── Plinth + cabinet ──
    rr(4.5, 64, 31, 6, 1, '#2a3038');
    const g = ctx.createLinearGradient(X(5), 0, X(35), 0);
    g.addColorStop(0, '#34404c'); g.addColorStop(0.35, '#5a6a7c'); g.addColorStop(0.7, '#475566'); g.addColorStop(1, '#2c3642');
    rr(5, 10, 30, 56, 2.5, g, '#161d24', 1);
    // Roof cap with vent louvers
    rr(4, 8, 32, 5, 1.5, '#6e7d8c', '#262e36', 0.8);
    ctx.strokeStyle = 'rgba(20,26,32,0.8)'; ctx.lineWidth = 0.8 * S;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(X(9 + i * 5.5), Y(10.5)); ctx.lineTo(X(12 + i * 5.5), Y(10.5)); ctx.stroke(); }
    // Terminals: + (red) and − (black)
    for (const [tx, col, capc] of [[12, '#c83a30', '#ff6a58'], [28, '#23272c', '#5a6068']]) {
      rr(tx - 2.5, 4.5, 5, 4, 1, '#9aa2aa', '#3a4048', 0.6);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(tx), Y(4.5), 2.3 * S, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = capc; ctx.beginPath(); ctx.arc(X(tx - 0.7), Y(3.8), 0.7 * S, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#fff'; ctx.font = `bold ${3.4 * S}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('+', X(12), Y(4.7)); ctx.fillText('-', X(28), Y(4.7));

    // Side handle rail
    rr(6.3, 20, 1.6, 22, 0.8, '#1f272f');
    ctx.fillStyle = '#8894a0'; ctx.fillRect(X(6.6), Y(22), 1 * S, 18 * S);

    // ── Cell stack window ──
    const wx = 10, wy = 15, ww = 20, wh = 37, n = 8, gap = 0.9;
    rr(wx - 1.2, wy - 1.2, ww + 2.4, wh + 2.4, 1.6, '#12181e', '#0a0e12', 0.8);
    rr(wx, wy, ww, wh, 1, '#07100a');
    const segH = (wh - gap * (n + 1)) / n;
    const fillN = pct * n;
    for (let i = 0; i < n; i++) {
      const sy = wy + wh - gap - (i + 1) * segH - i * gap;
      const f = Math.max(0, Math.min(1, fillN - i));
      rr(wx + gap, sy, ww - gap * 2, segH, 0.6, '#0f1c12');
      if (f > 0) {
        const a = f < 1 ? 0.35 + 0.5 * f : 0.9;
        const sg = ctx.createLinearGradient(X(wx), 0, X(wx + ww), 0);
        sg.addColorStop(0, rgba(lc, a)); sg.addColorStop(0.3, rgba(lc.map(v => Math.min(255, v + 60)), a)); sg.addColorStop(1, rgba(lc.map(v => Math.round(v * 0.6)), a));
        rr(wx + gap, sy, ww - gap * 2, segH, 0.6, sg);
        ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(X(wx + gap + 1), Y(sy + 0.5), (ww - gap * 2 - 2) * S, 0.7 * S);
      }
    }
    if (charging && live) {
      const litH = Math.max(segH, (wh - gap * 2) * pct);
      const by = wy + wh - gap - ((t * 0.7) % 1) * litH;
      const bg = ctx.createLinearGradient(0, Y(by - 3), 0, Y(by + 3));
      bg.addColorStop(0, 'rgba(255,255,255,0)'); bg.addColorStop(0.5, 'rgba(235,255,220,0.55)'); bg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = bg; ctx.fillRect(X(wx + gap), Y(by - 3), (ww - gap * 2) * S, 6 * S);
    }
    // Glass sheen
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath(); ctx.moveTo(X(wx), Y(wy)); ctx.lineTo(X(wx + 8), Y(wy)); ctx.lineTo(X(wx), Y(wy + 16)); ctx.closePath(); ctx.fill();

    // Status LEDs (right rail): power, charging, low
    const leds = [
      [20, live ? '#60ff70' : '#1d2a20', live],
      [25, charging ? (Math.sin(t * 6) > 0 ? '#ffd040' : '#6a5010') : '#2a2614', charging],
      [30, pct < 0.15 ? (Math.sin(t * 5) > 0 ? '#ff4a3a' : '#5a1810') : '#2a1614', pct < 0.15],
    ];
    for (const [ly, col, on] of leds) {
      ctx.fillStyle = '#0c1014'; ctx.beginPath(); ctx.arc(X(32.5), Y(ly), 1.5 * S, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(X(32.5), Y(ly), 1 * S, 0, Math.PI * 2); ctx.fill();
      if (on) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(X(32.2), Y(ly - 0.3), 0.35 * S, 0, Math.PI * 2); ctx.fill(); }
    }
    // Vent grille (right rail, lower)
    ctx.strokeStyle = 'rgba(10,14,18,0.8)'; ctx.lineWidth = 0.7 * S;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(X(31.3), Y(38 + i * 2.2)); ctx.lineTo(X(33.8), Y(38 + i * 2.2)); ctx.stroke(); }

    // ── LCD readout ──
    rr(9, 55, 22, 7.5, 1, '#0a1610', '#050a07', 0.8);
    ctx.fillStyle = live ? rgba(lc, 0.95) : '#2a3a2e';
    ctx.font = `bold ${5.6 * S}px monospace`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(`${Math.round(pct * 100)}%`, X(29.8), Y(58.9));
    if (charging && Math.sin(t * 8) > -0.3) {
      ctx.fillStyle = '#ffe060';
      ctx.beginPath();
      ctx.moveTo(X(13.2), Y(55.9)); ctx.lineTo(X(10.8), Y(59.2)); ctx.lineTo(X(12.4), Y(59.2));
      ctx.lineTo(X(11.4), Y(61.8)); ctx.lineTo(X(14.2), Y(58.2)); ctx.lineTo(X(12.6), Y(58.2)); ctx.closePath(); ctx.fill();
    }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();

    // Selection ring
    if (InspectionPanel.isOpen() && InspectionPanel.target === e) {
      ctx.save(); ctx.strokeStyle = '#a0ff60'; ctx.lineWidth = 2 / Camera.zoom;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 4);
      ctx.strokeRect(px + 1, py + 1, W - 2, H - 2); ctx.restore();
    }
  }

// ═══════════════════════════════════════════════════════════════════
// LIGHTNING ROD — 3 wide × 4 tall
// A grounded lattice mast: concrete pad, tapering steel tower, guy
// wires, and a copper spike that ionises faintly in bad weather. Glows
// blue for a couple of seconds after it intercepts a strike
// (_rodGlowUntil, stamped by LightningDamageSystem).
// ═══════════════════════════════════════════════════════════════════
function renderLightningRod(e, px, py, t) {
  // Derived from the footprint rather than hardcoded, so resizing the
  // entity in entity_defs.js rescales the whole mast automatically.
  const W = (e.width || 3) * TILE, H = (e.height || 4) * TILE;
  const cx = px + W / 2;
  const baseY = py + H * 0.92;
  const tipY  = py + H * 0.05;

  // Charged while a rainstorm is overhead — the tip picks up corona.
  const stormy = (typeof LightningSystem !== 'undefined') && LightningSystem.isActive();
  const hot    = !!(e._rodGlowUntil && performance.now() < e._rodGlowUntil);
  // Fraction of peak the rod is still pushing into the grid, 0-1. Keeps the
  // mast visibly energised for the whole decay, not just the 2.5 s flash,
  // so a discharging rod reads as doing something from across the map.
  const surge = (typeof LightningDamageSystem !== 'undefined')
    ? LightningDamageSystem.surgeWatts(e) / (e.def?.surgeMax || 18) : 0;
  const pulse  = 0.5 + 0.5 * Math.sin(t * 3.2);

  // Concrete footing
  ctx.fillStyle = '#3a3a40';
  ctx.fillRect(cx - W * 0.28, baseY - 3, W * 0.56, TILE * 0.28);
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(cx - W * 0.28, baseY + TILE * 0.16, W * 0.56, 3);

  const _detailed = Camera.zoom > 0.5;

  // Tapering lattice mast — two legs converging on the tip
  const legSpread = W * 0.22;
  ctx.strokeStyle = hot ? 'rgba(150,215,255,0.95)'
                  : surge > 0.01 ? `rgba(${Math.round(138 + 20*surge)},${Math.round(151 + 60*surge)},${Math.round(166 + 85*surge)},0.95)`
                  : '#8a97a6';
  ctx.lineWidth   = 2.4;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - legSpread, baseY); ctx.lineTo(cx - W * 0.03, tipY + TILE * 0.3);
  ctx.moveTo(cx + legSpread, baseY); ctx.lineTo(cx + W * 0.03, tipY + TILE * 0.3);
  ctx.stroke();

  if (_detailed) {
    // Cross-bracing — X's up the mast, narrowing with the taper
    ctx.strokeStyle = hot ? 'rgba(130,200,255,0.6)' : 'rgba(125,140,158,0.75)';
    ctx.lineWidth = 1;
    const rungs = 7;
    for (let i = 0; i < rungs; i++) {
      const u0 = i / rungs, u1 = (i + 1) / rungs;
      const y0 = baseY + (tipY + TILE * 0.3 - baseY) * u0;
      const y1 = baseY + (tipY + TILE * 0.3 - baseY) * u1;
      const s0 = legSpread * (1 - u0 * 0.86);
      const s1 = legSpread * (1 - u1 * 0.86);
      ctx.beginPath();
      ctx.moveTo(cx - s0, y0); ctx.lineTo(cx + s1, y1);
      ctx.moveTo(cx + s0, y0); ctx.lineTo(cx - s1, y1);
      ctx.moveTo(cx - s1, y1); ctx.lineTo(cx + s1, y1);
      ctx.stroke();
    }

    // Guy wires anchored to the pad corners
    ctx.strokeStyle = 'rgba(120,130,145,0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(px + W * 0.08, baseY + TILE * 0.16); ctx.lineTo(cx - W * 0.05, py + H * 0.34);
    ctx.moveTo(px + W * 0.92, baseY + TILE * 0.16); ctx.lineTo(cx + W * 0.05, py + H * 0.34);
    ctx.stroke();
  }

  // Copper spike
  ctx.strokeStyle = hot ? '#dff2ff' : '#c07840';
  ctx.lineWidth   = 2.2;
  ctx.beginPath();
  ctx.moveTo(cx, tipY + TILE * 0.32); ctx.lineTo(cx, tipY);
  ctx.stroke();

  // Tip corona — always a faint bead, blooms during storms and right
  // after an interception.
  const glow = hot ? 1
             : surge > 0.01 ? Math.min(1, 0.3 + surge * (0.6 + 0.4 * pulse))
             : stormy ? 0.35 + 0.3 * pulse : 0.18;
  const gr = ctx.createRadialGradient(cx, tipY, 0, cx, tipY, TILE * (hot ? 1.1 : 0.5));
  gr.addColorStop(0, `rgba(190,235,255,${0.85 * glow})`);
  gr.addColorStop(1, 'rgba(190,235,255,0)');
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(cx, tipY, TILE * (hot ? 1.1 : 0.5), 0, Math.PI * 2); ctx.fill();

  ctx.fillStyle = hot ? '#ffffff' : '#e0a060';
  ctx.beginPath(); ctx.arc(cx, tipY, hot ? 2.6 : 1.6, 0, Math.PI * 2); ctx.fill();

  // Grounding strap down to the earth
  ctx.strokeStyle = '#6a5030';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx + legSpread, baseY);
  ctx.lineTo(cx + legSpread + 4, baseY + TILE * 0.2);
  ctx.stroke();
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// LIGHTNING ROD MK2 â€” 4 wide Ã— 5 tall
// A resonant capture tower rather than a bare grounded spike: armoured
// base bunker, four-legged tapered lattice, a mid-mast collar, a copper
// toroid coil that visibly charges, and a three-spike crown that arcs
// across itself. Every emissive element scales with live surge output,
// so a discharging MK2 is unmistakable from across the map.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function renderLightningRod2(e, px, py, t) {
  const W = (e.width || 4) * TILE, H = (e.height || 5) * TILE;
  const cx = px + W / 2;
  const baseY = py + H * 0.93;
  const tipY  = py + H * 0.04;

  const stormy = (typeof LightningSystem !== 'undefined') && LightningSystem.isActive();
  const hot    = !!(e._rodGlowUntil && performance.now() < e._rodGlowUntil);
  const surge  = (typeof LightningDamageSystem !== 'undefined')
    ? LightningDamageSystem.surgeWatts(e) / (e.def?.surgeMax || 42) : 0;
  // Overall charge level driving every emissive element, 0-1.
  const charge = hot ? 1 : Math.max(surge, stormy ? 0.28 : 0.12);
  const pulse  = 0.5 + 0.5 * Math.sin(t * 3.4);
  const fast   = 0.5 + 0.5 * Math.sin(t * 11);
  const _detailed = Camera.zoom > 0.45;

  const steel = (lift) => hot ? 'rgba(170,225,255,0.95)'
    : 'rgb(' + Math.round(122 + 40 * charge * lift) + ','
             + Math.round(136 + 80 * charge * lift) + ','
             + Math.round(154 + 100 * charge * lift) + ')';

  // â”€â”€ Base bunker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ctx.fillStyle = '#23262e';
  ctx.fillRect(cx - W * 0.34, baseY - TILE * 0.10, W * 0.68, TILE * 0.42);
  ctx.fillStyle = '#171a20';
  ctx.fillRect(cx - W * 0.34, baseY + TILE * 0.22, W * 0.68, TILE * 0.10);
  // Corner grounding bollards
  ctx.fillStyle = '#3c4048';
  for (const sx of [-0.30, 0.30]) {
    ctx.fillRect(cx + W * sx - 2.5, baseY - TILE * 0.22, 5, TILE * 0.24);
  }
  // Base status strip â€” brightens with charge
  ctx.fillStyle = 'rgba(120,220,255,' + (0.25 + 0.6 * charge * (0.6 + 0.4 * pulse)) + ')';
  ctx.fillRect(cx - W * 0.26, baseY + TILE * 0.02, W * 0.52, 2);

  // â”€â”€ Four-legged tapered lattice â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const legOut  = W * 0.24;   // outer pair at the base
  const legIn   = W * 0.11;   // inner pair â€” reads as depth
  const collarY = py + H * 0.42;
  const coilY   = py + H * 0.24;
  ctx.lineCap = 'round';
  [-legOut, -legIn, legIn, legOut].forEach(off => {
    const inner = Math.abs(off) < W * 0.15;
    ctx.strokeStyle = steel(inner ? 0.5 : 1);
    ctx.lineWidth   = inner ? 1.8 : 2.8;
    ctx.beginPath();
    ctx.moveTo(cx + off, baseY);
    ctx.lineTo(cx + off * 0.22, coilY);
    ctx.stroke();
  });

  if (_detailed) {
    // Cross-bracing between the outer legs
    ctx.strokeStyle = hot ? 'rgba(150,215,255,0.6)'
                          : 'rgba(125,142,160,' + (0.55 + 0.35 * charge) + ')';
    ctx.lineWidth = 1;
    const rungs = 8;
    for (let i = 0; i < rungs; i++) {
      const u0 = i / rungs, u1 = (i + 1) / rungs;
      const y0 = baseY + (coilY - baseY) * u0;
      const y1 = baseY + (coilY - baseY) * u1;
      const s0 = legOut * (1 - u0 * 0.78);
      const s1 = legOut * (1 - u1 * 0.78);
      ctx.beginPath();
      ctx.moveTo(cx - s0, y0); ctx.lineTo(cx + s1, y1);
      ctx.moveTo(cx + s0, y0); ctx.lineTo(cx - s1, y1);
      ctx.moveTo(cx - s1, y1); ctx.lineTo(cx + s1, y1);
      ctx.stroke();
    }

    // Mid-mast maintenance collar
    const cw = legOut * 0.62;
    ctx.fillStyle = '#2b2f38';
    ctx.fillRect(cx - cw, collarY - 3, cw * 2, 6);
    ctx.strokeStyle = steel(0.8); ctx.lineWidth = 1;
    ctx.strokeRect(cx - cw, collarY - 3, cw * 2, 6);

    // Guy wires out to the bunker corners
    ctx.strokeStyle = 'rgba(120,130,145,0.42)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.33, baseY + TILE * 0.20); ctx.lineTo(cx - W * 0.05, collarY);
    ctx.moveTo(cx + W * 0.33, baseY + TILE * 0.20); ctx.lineTo(cx + W * 0.05, collarY);
    ctx.stroke();
  }

  // â”€â”€ Resonant capture coil (toroid) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const coilR = W * 0.17;
  const coilH = TILE * 0.34;
  if (_detailed) {
    // Secondary winding below the toroid
    ctx.strokeStyle = 'rgba(190,120,60,' + (0.65 + 0.3 * charge) + ')';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const wy = coilY + coilH * 0.55 + i * 2.6;
      ctx.beginPath();
      ctx.ellipse(cx, wy, coilR * 0.52, 1.8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Toroid body
  const tg = ctx.createLinearGradient(cx - coilR, coilY, cx + coilR, coilY);
  tg.addColorStop(0, '#7a4a20');
  tg.addColorStop(0.4, hot ? '#eaf6ff'
    : 'rgb(' + Math.round(196 + 50 * charge) + ','
             + Math.round(130 + 90 * charge) + ','
             + Math.round(70 + 150 * charge) + ')');
  tg.addColorStop(1, '#5e3616');
  ctx.fillStyle = tg;
  ctx.beginPath();
  ctx.ellipse(cx, coilY, coilR, coilH * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,170,' + (0.4 + 0.5 * charge) + ')';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Charge ring racing around the toroid
  if (charge > 0.2) {
    ctx.strokeStyle = 'rgba(170,230,255,' + (0.5 * charge + 0.4 * fast * charge) + ')';
    ctx.lineWidth = 1.6;
    const a0 = (t * 2.6) % (Math.PI * 2);
    ctx.beginPath();
    ctx.ellipse(cx, coilY, coilR * 1.06, coilH * 0.56, 0, a0, a0 + 1.5);
    ctx.stroke();
  }

  // â”€â”€ Crown: three spikes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const crown = [
    { x: cx - W * 0.13, y: tipY + TILE * 0.30 },
    { x: cx,            y: tipY },
    { x: cx + W * 0.13, y: tipY + TILE * 0.30 },
  ];
  const spikeCol = hot ? '#ffffff'
    : 'rgb(' + Math.round(200 + 55 * charge) + ','
             + Math.round(130 + 110 * charge) + ','
             + Math.round(70 + 180 * charge) + ')';
  crown.forEach((s, i) => {
    ctx.strokeStyle = spikeCol;
    ctx.lineWidth = i === 1 ? 2.6 : 2;
    ctx.beginPath();
    ctx.moveTo(cx + (s.x - cx) * 0.35, coilY - coilH * 0.4);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
  });

  // Arcs crackling between the crown spikes
  if (_detailed && charge > 0.3 && fast > 0.55) {
    ctx.strokeStyle = 'rgba(200,240,255,' + (0.55 + 0.4 * charge) + ')';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = '#a0d8ff';
    ctx.shadowBlur = 8;
    for (const pair of [[0, 1], [1, 2]]) {
      const A = crown[pair[0]], B = crown[pair[1]];
      const mx = (A.x + B.x) / 2 + (Math.random() - 0.5) * 7;
      const my = (A.y + B.y) / 2 - 3 - Math.random() * 6;
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      ctx.quadraticCurveTo(mx, my, B.x, B.y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  // â”€â”€ Corona over the crown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const cr = TILE * (hot ? 1.6 : 0.55 + charge * 0.9);
  const gr = ctx.createRadialGradient(cx, tipY, 0, cx, tipY, cr);
  gr.addColorStop(0, 'rgba(190,235,255,' + (0.85 * (hot ? 1 : 0.35 + charge * 0.65)) + ')');
  gr.addColorStop(1, 'rgba(190,235,255,0)');
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(cx, tipY, cr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hot ? '#ffffff' : '#dff0ff';
  ctx.beginPath(); ctx.arc(cx, tipY, hot ? 3.2 : 2, 0, Math.PI * 2); ctx.fill();

  // Aviation warning beacon on the collar
  if (_detailed) {
    const blink = (Math.sin(t * 2.2) > 0.72) ? 1 : 0.18;
    ctx.fillStyle = 'rgba(255,60,40,' + blink + ')';
    ctx.beginPath(); ctx.arc(cx + legOut * 0.62, collarY - 5, 2, 0, Math.PI * 2); ctx.fill();
  }

  // Grounding strap to earth
  ctx.strokeStyle = '#6a5030';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(cx + legOut, baseY);
  ctx.lineTo(cx + legOut + 5, baseY + TILE * 0.26);
  ctx.stroke();
}

// ═══════════════════════════════════════════════════════════════════
// LIGHTNING ROD MK3 — 5 wide × 6 tall
// A storm spire. An octagonal pad inside a copper Faraday ground ring, a
// capacitor bank either side of the base whose cells fill with the live
// surge, four heavy lattice legs to a railed service platform, a glass
// plasma column running the height of the tower with pulses climbing it,
// twin capture toroids, and a polished electrode sphere crowned with four
// spikes and a needle. Accents are violet so it reads apart from the MK2's
// cyan at a glance. Just after a strike the whole spire flares, arcs jump
// from the lower toroid into the capacitors and a shockwave rolls out
// along the ground ring.
// ═══════════════════════════════════════════════════════════════════
function _rod3Bolt(x0, y0, x1, y1, jag, segs) {
  ctx.beginPath(); ctx.moveTo(x0, y0);
  for (let i = 1; i < segs; i++) {
    const u = i / segs;
    ctx.lineTo(x0 + (x1 - x0) * u + (Math.random() - 0.5) * jag, y0 + (y1 - y0) * u + (Math.random() - 0.5) * jag * 0.6);
  }
  ctx.lineTo(x1, y1); ctx.stroke();
}

function renderLightningRod3(e, px, py, t) {
  const W = (e.width || 5) * TILE, H = (e.height || 6) * TILE;
  const cx = px + W / 2;
  const baseY = py + H * 0.90;
  const tipY  = py + H * 0.035;
  const u = TILE / 40;

  const stormy = (typeof LightningSystem !== 'undefined') && LightningSystem.isActive();
  const now    = performance.now();
  const hot    = !!(e._rodGlowUntil && now < e._rodGlowUntil);
  const hotK   = hot ? Math.max(0, (e._rodGlowUntil - now) / 2500) : 0;   // 1 → 0 across the flash
  const surge  = (typeof LightningDamageSystem !== 'undefined')
    ? LightningDamageSystem.surgeWatts(e) / (e.def?.surgeMax || 130) : 0;
  const charge = hot ? 1 : Math.max(surge, stormy ? 0.3 : 0.12);
  const pulse  = 0.5 + 0.5 * Math.sin(t * 3.0);
  const fast   = 0.5 + 0.5 * Math.sin(t * 13);
  const dark   = (typeof DayNight !== 'undefined') ? DayNight.darkness() : 0;
  const _detailed = Camera.zoom > 0.45;
  const V = (a) => `rgba(184,160,255,${a})`;          // violet accent
  const steel = (lift) => hot ? 'rgba(215,200,255,0.95)'
    : 'rgb(' + Math.round(118 + 50 * charge * lift) + ','
             + Math.round(128 + 50 * charge * lift) + ','
             + Math.round(148 + 95 * charge * lift) + ')';

  // ── Pad + Faraday ground ring ────────────────────────────────────
  const padR = W * 0.40, padRy = TILE * 0.55;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(cx + 4 * u, baseY + 4 * u, padR, padRy, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2a2d34';
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + Math.PI / 8;
    const x = cx + Math.cos(a) * padR, y = baseY + Math.sin(a) * padRy;
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#34383f';
  ctx.beginPath(); ctx.ellipse(cx, baseY - 1 * u, padR * 0.78, padRy * 0.72, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = hot ? '#ffe0b0' : '#b87038'; ctx.lineWidth = 1.6 * u;
  ctx.beginPath(); ctx.ellipse(cx, baseY, padR * 0.92, padRy * 0.88, 0, 0, Math.PI * 2); ctx.stroke();
  if (hot) {                                                   // shockwave along the ground
    for (let k = 0; k < 2; k++) {
      const ph = ((1 - hotK) * 1.6 + k * 0.5) % 1;
      ctx.strokeStyle = V((0.8 * (1 - ph)).toFixed(3)); ctx.lineWidth = (2.4 - ph * 1.6) * u;
      ctx.beginPath(); ctx.ellipse(cx, baseY, padR * (0.9 + ph * 0.8), padRy * (0.85 + ph * 0.8), 0, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // ── Capacitor bank either side of the base ───────────────────────
  // Cells fill with the live surge; they're the visible "store" the
  // extra surge hours come from.
  const capTop = baseY - TILE * 0.95, capH = TILE * 0.78, capW = 7 * u;
  const caps = [];
  for (const side of [-1, 1]) for (let k = 0; k < 3; k++) caps.push(cx + side * (W * 0.20 + k * 10 * u));
  for (const x of caps) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(x - capW / 2 + 2 * u, capTop + 2 * u, capW, capH);
    ctx.fillStyle = '#1c1f26'; ctx.fillRect(x - capW / 2, capTop, capW, capH);
    const fill = Math.max(0.08, hot ? 1 : surge);
    const fg = ctx.createLinearGradient(0, capTop + capH, 0, capTop + capH * (1 - fill));
    fg.addColorStop(0, V(0.95)); fg.addColorStop(1, hot ? 'rgba(255,255,255,0.95)' : V(0.55));
    ctx.fillStyle = fg; ctx.fillRect(x - capW / 2 + 1.2 * u, capTop + capH * (1 - fill), capW - 2.4 * u, capH * fill - 1 * u);
    ctx.fillStyle = '#8a929c'; ctx.fillRect(x - capW / 2 - 0.6 * u, capTop - 2 * u, capW + 1.2 * u, 2.4 * u);   // terminal cap
    if (_detailed) {
      ctx.fillStyle = '#c07840'; ctx.fillRect(x - 0.8 * u, capTop - 4.5 * u, 1.6 * u, 2.6 * u);             // terminal post
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.5 * u;
      for (let r = 1; r < 4; r++) { ctx.beginPath(); ctx.moveTo(x - capW / 2, capTop + capH * r / 4); ctx.lineTo(x + capW / 2, capTop + capH * r / 4); ctx.stroke(); }
    }
  }
  if (_detailed) {                                             // bus bar tying the cells to the column
    ctx.strokeStyle = hot ? '#ffe0b0' : '#a86830'; ctx.lineWidth = 1.2 * u;
    ctx.beginPath(); ctx.moveTo(caps[2], capTop - 4 * u); ctx.lineTo(caps[5], capTop - 4 * u); ctx.stroke();
  }

  // ── Heavy four-legged lattice to the service platform ───────────
  const platY  = py + H * 0.46;
  const toroA  = py + H * 0.29;   // lower, larger toroid
  const toroB  = py + H * 0.18;   // upper, smaller toroid
  const sphY   = py + H * 0.095;
  const legOut = W * 0.27, legIn = W * 0.13;
  ctx.lineCap = 'round';
  [-legOut, -legIn, legIn, legOut].forEach(off => {
    const inner = Math.abs(off) < W * 0.2;
    ctx.strokeStyle = steel(inner ? 0.5 : 1);
    ctx.lineWidth = (inner ? 2 : 3.4) * u;
    ctx.beginPath(); ctx.moveTo(cx + off, baseY - TILE * 0.1); ctx.lineTo(cx + off * 0.34, platY); ctx.stroke();
    ctx.lineWidth = (inner ? 1.6 : 2.4) * u;
    ctx.beginPath(); ctx.moveTo(cx + off * 0.34, platY); ctx.lineTo(cx + off * 0.14, toroA + TILE * 0.2); ctx.stroke();
  });
  if (_detailed) {
    ctx.strokeStyle = hot ? 'rgba(210,190,255,0.6)' : `rgba(125,140,160,${(0.5 + 0.35 * charge).toFixed(3)})`;
    ctx.lineWidth = 1 * u;
    const brace = (yA, yB, sA, sB, n) => {
      for (let i = 0; i < n; i++) {
        const v0 = i / n, v1 = (i + 1) / n;
        const y0 = yA + (yB - yA) * v0, y1 = yA + (yB - yA) * v1;
        const s0 = sA + (sB - sA) * v0, s1 = sA + (sB - sA) * v1;
        ctx.beginPath();
        ctx.moveTo(cx - s0, y0); ctx.lineTo(cx + s1, y1);
        ctx.moveTo(cx + s0, y0); ctx.lineTo(cx - s1, y1);
        ctx.moveTo(cx - s1, y1); ctx.lineTo(cx + s1, y1);
        ctx.stroke();
      }
    };
    brace(baseY - TILE * 0.1, platY, legOut, legOut * 0.34, 7);
    brace(platY, toroA + TILE * 0.2, legOut * 0.34, legOut * 0.14, 3);
    // Guy wires from the platform out to anchor blocks on the pad
    ctx.strokeStyle = 'rgba(130,140,158,0.45)'; ctx.lineWidth = 0.8 * u;
    for (const side of [-1, 1]) {
      const ax = cx + side * padR * 0.95, ay = baseY + padRy * 0.2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(cx + side * legOut * 0.4, platY); ctx.stroke();
      ctx.fillStyle = '#3c4048'; ctx.fillRect(ax - 2.5 * u, ay - 2 * u, 5 * u, 4 * u);
    }
  }

  // ── Plasma column ────────────────────────────────────────────────
  const colW = 6 * u, colTop = sphY + 4 * u, colBot = baseY - TILE * 0.25;
  ctx.fillStyle = 'rgba(20,16,36,0.85)'; ctx.fillRect(cx - colW / 2 - 1 * u, colTop, colW + 2 * u, colBot - colTop);
  const cg = ctx.createLinearGradient(cx - colW / 2, 0, cx + colW / 2, 0);
  const ci = 0.35 + 0.65 * charge;
  cg.addColorStop(0, V((0.25 * ci).toFixed(3)));
  cg.addColorStop(0.5, hot ? 'rgba(255,255,255,0.95)' : `rgba(220,205,255,${(0.75 * ci).toFixed(3)})`);
  cg.addColorStop(1, V((0.25 * ci).toFixed(3)));
  ctx.fillStyle = cg; ctx.fillRect(cx - colW / 2, colTop, colW, colBot - colTop);
  // pulses climbing the column — faster and brighter with charge
  const nP = 4, speed = 0.25 + charge * 1.1;
  for (let k = 0; k < nP; k++) {
    const ph = (t * speed + k / nP) % 1;
    const y = colBot - ph * (colBot - colTop);
    const pg = ctx.createRadialGradient(cx, y, 0, cx, y, colW * 1.4);
    pg.addColorStop(0, `rgba(255,255,255,${(0.9 * ci).toFixed(3)})`); pg.addColorStop(1, V(0));
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(cx, y, colW * 1.4, 0, Math.PI * 2); ctx.fill();
  }
  if (_detailed) {                                             // glass bands
    ctx.fillStyle = '#5a606c';
    for (let y = colTop + 12 * u; y < colBot; y += 16 * u) ctx.fillRect(cx - colW / 2 - 1.5 * u, y, colW + 3 * u, 1.6 * u);
  }

  // ── Service platform with railing + beacons ─────────────────────
  const pw = legOut * 0.62;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cx - pw + 3 * u, platY - 2 * u, pw * 2, 7 * u);
  ctx.fillStyle = '#2b2f38'; ctx.fillRect(cx - pw, platY - 4 * u, pw * 2, 7 * u);
  ctx.strokeStyle = steel(0.8); ctx.lineWidth = 1 * u; ctx.strokeRect(cx - pw, platY - 4 * u, pw * 2, 7 * u);
  if (_detailed) {
    ctx.strokeStyle = 'rgba(200,210,220,0.55)'; ctx.lineWidth = 0.6 * u;
    ctx.beginPath(); ctx.moveTo(cx - pw, platY - 7 * u); ctx.lineTo(cx + pw, platY - 7 * u); ctx.stroke();
    for (let x = cx - pw; x <= cx + pw + 0.1; x += pw / 4) { ctx.beginPath(); ctx.moveTo(x, platY - 7 * u); ctx.lineTo(x, platY - 4 * u); ctx.stroke(); }
    ctx.fillStyle = V((0.3 + 0.6 * charge * (0.6 + 0.4 * pulse)).toFixed(3));   // status strip
    ctx.fillRect(cx - pw + 3 * u, platY - 0.5 * u, pw * 2 - 6 * u, 1.6 * u);
  }
  const blink = Math.sin(t * 2.2) > 0.7 ? 1 : 0.18;
  for (const side of [-1, 1]) {
    ctx.fillStyle = `rgba(255,60,40,${blink})`;
    ctx.beginPath(); ctx.arc(cx + side * (pw - 2 * u), platY - 8 * u, 2 * u, 0, Math.PI * 2); ctx.fill();
    if (dark > 0.3 && blink > 0.5) {
      const bg = ctx.createRadialGradient(cx + side * (pw - 2 * u), platY - 8 * u, 0, cx + side * (pw - 2 * u), platY - 8 * u, 9 * u);
      bg.addColorStop(0, 'rgba(255,60,40,0.35)'); bg.addColorStop(1, 'rgba(255,60,40,0)');
      ctx.fillStyle = bg; ctx.fillRect(cx + side * (pw - 2 * u) - 9 * u, platY - 17 * u, 18 * u, 18 * u);
    }
  }

  // ── Twin capture toroids ─────────────────────────────────────────
  const toroid = (y, r, h, spin) => {
    const tg = ctx.createLinearGradient(cx - r, y, cx + r, y);
    tg.addColorStop(0, '#6e421c');
    tg.addColorStop(0.4, hot ? '#f4eeff'
      : 'rgb(' + Math.round(196 + 40 * charge) + ',' + Math.round(128 + 80 * charge) + ',' + Math.round(72 + 170 * charge) + ')');
    tg.addColorStop(1, '#52300f');
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(cx + 3 * u, y + 4 * u, r, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = tg; ctx.beginPath(); ctx.ellipse(cx, y, r, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(255,225,180,${(0.4 + 0.5 * charge).toFixed(3)})`; ctx.lineWidth = 1 * u; ctx.stroke();
    ctx.fillStyle = 'rgba(20,16,36,0.9)'; ctx.beginPath(); ctx.ellipse(cx, y, r * 0.42, h * 0.18, 0, 0, Math.PI * 2); ctx.fill();   // bore
    if (charge > 0.2) {
      const a0 = (t * spin) % (Math.PI * 2);
      ctx.strokeStyle = V((0.45 * charge + 0.45 * fast * charge).toFixed(3)); ctx.lineWidth = 1.8 * u;
      ctx.beginPath(); ctx.ellipse(cx, y, r * 1.07, h * 0.57, 0, a0, a0 + 1.7); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, y, r * 1.07, h * 0.57, 0, a0 + Math.PI, a0 + Math.PI + 1.1); ctx.stroke();
    }
  };
  if (_detailed) {                                             // secondary winding between the toroids
    ctx.strokeStyle = `rgba(190,120,60,${(0.6 + 0.35 * charge).toFixed(3)})`; ctx.lineWidth = 1 * u;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(cx, toroB + 6 * u + i * 3 * u, W * 0.07, 1.6 * u, 0, 0, Math.PI * 2); ctx.stroke(); }
  }
  toroid(toroA, W * 0.21, TILE * 0.42, 2.2);
  toroid(toroB, W * 0.14, TILE * 0.30, -3.1);

  // ── Electrode crown: sphere, four spikes, needle ─────────────────
  const sR = 8 * u;
  const spikes = [-2, -1, 1, 2].map(k => ({ x: cx + k * W * 0.075, y: sphY - (2.5 - Math.abs(k)) * 3 * u - 6 * u }));
  const spikeCol = hot ? '#ffffff'
    : 'rgb(' + Math.round(200 + 55 * charge) + ',' + Math.round(140 + 100 * charge) + ',' + Math.round(90 + 165 * charge) + ')';
  ctx.strokeStyle = spikeCol; ctx.lineCap = 'round';
  for (const s of spikes) { ctx.lineWidth = 1.8 * u; ctx.beginPath(); ctx.moveTo(cx + (s.x - cx) * 0.3, sphY); ctx.lineTo(s.x, s.y); ctx.stroke(); }
  const sg = ctx.createRadialGradient(cx - sR * 0.35, sphY - sR * 0.35, 1 * u, cx, sphY, sR);
  sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.45, hot ? '#f0e8ff' : '#b8c2d0'); sg.addColorStop(1, hot ? '#b8a0ff' : '#4a5260');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(cx, sphY, sR, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = V((0.2 + 0.4 * charge).toFixed(3)); ctx.beginPath(); ctx.arc(cx, sphY, sR, 0, Math.PI * 2); ctx.fill();   // charge tint
  ctx.strokeStyle = spikeCol; ctx.lineWidth = 2.4 * u;
  ctx.beginPath(); ctx.moveTo(cx, sphY - sR); ctx.lineTo(cx, tipY); ctx.stroke();

  // Arcs: crown spikes to the sphere at any real charge; lower toroid down
  // into the capacitor bank while surging or just struck.
  if (_detailed && charge > 0.3) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = '#b8a0ff'; ctx.shadowBlur = 8 * u;
    ctx.strokeStyle = `rgba(225,210,255,${(0.5 + 0.45 * charge).toFixed(3)})`; ctx.lineWidth = 1.1 * u;
    if (fast > 0.5) for (const s of spikes) if (Math.random() < 0.5) _rod3Bolt(s.x, s.y, cx, sphY - sR * 0.6, 4 * u, 4);
    if ((hot || surge > 0.25) && Math.random() < (hot ? 0.9 : 0.35)) {
      const target = caps[Math.floor(Math.random() * caps.length)];
      _rod3Bolt(cx + (target < cx ? -1 : 1) * W * 0.18, toroA + 4 * u, target, capTop - 4 * u, 9 * u, 7);
    }
    ctx.restore();
  }

  // Corona over the crown — blooms with charge, flares on a strike
  const cr = TILE * (hot ? 2.2 * (0.6 + 0.4 * hotK) : 0.6 + charge * 1.1);
  const gr = ctx.createRadialGradient(cx, sphY - 4 * u, 0, cx, sphY - 4 * u, cr);
  gr.addColorStop(0, `rgba(225,210,255,${(0.85 * (hot ? 1 : 0.3 + charge * 0.7)).toFixed(3)})`);
  gr.addColorStop(1, V(0));
  ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(cx, sphY - 4 * u, cr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hot ? '#ffffff' : '#efe8ff';
  ctx.beginPath(); ctx.arc(cx, tipY, (hot ? 3.4 : 2.2) * u, 0, Math.PI * 2); ctx.fill();
  // Top beacon on the needle
  ctx.fillStyle = `rgba(255,60,40,${Math.sin(t * 2.2 + 1.2) > 0.7 ? 1 : 0.2})`;
  ctx.beginPath(); ctx.arc(cx + 3 * u, tipY + 8 * u, 1.6 * u, 0, Math.PI * 2); ctx.fill();

  // Grounding straps down both sides to the ring
  ctx.strokeStyle = '#6a5030'; ctx.lineWidth = 1.6 * u;
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + side * legOut, baseY - TILE * 0.1); ctx.lineTo(cx + side * padR * 0.92, baseY + 2 * u); ctx.stroke(); }
}

// ── Wind Turbine MK3 (4×4) ──
// A utility-scale machine rather than a bigger MK2: a tall graphite tower
// with a cyan power conduit that pulses upward in step with output, a
// service platform ringed with a railing, a long streamlined nacelle with a
// scrolling light strip and a roof hatch, three swept carbon blades with a
// glowing leading edge, tip-vortex trails in strong wind, and a humming
// transformer yard at the base. After dark the blade tips, nacelle underglow
// and conduit all light up.
function _mk3Blade(len, root, u, on, night, fine = true) {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(-root*0.55, 3*u);
    ctx.quadraticCurveTo(-root*1.25, -len*0.28, -root*0.18, -len);
    ctx.lineTo(root*0.10, -len);
    ctx.quadraticCurveTo(root*0.70, -len*0.40, root*0.55, 3*u);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(-root, 0, root, 0);
  g.addColorStop(0,   on ? '#5e6e78' : '#3e464a');
  g.addColorStop(0.45, on ? '#34404a' : '#2a3034');
  g.addColorStop(1,   on ? '#1c242a' : '#161a1c');
  ctx.fillStyle = g; path(); ctx.fill();
  // leading edge
  ctx.strokeStyle = on ? 'rgba(90,230,255,0.85)' : 'rgba(70,110,120,0.5)';
  ctx.lineWidth = 0.9*u;
  ctx.beginPath(); ctx.moveTo(-root*0.55, 2*u); ctx.quadraticCurveTo(-root*1.25, -len*0.28, -root*0.18, -len); ctx.stroke();
  // carbon weave hint and a pale tip (the weave only close up: 5% white
  // hairlines, and it was eight strokes a blade, every frame, at any zoom)
  ctx.save(); path(); ctx.clip();
  if (fine) {
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 0.5*u;
    for (let k = 1; k < 9; k++) { const y = -len*k/9; ctx.beginPath(); ctx.moveTo(-root, y); ctx.lineTo(root, y - root*0.6); ctx.stroke(); }
  }
  ctx.fillStyle = on ? '#e8f4f8' : '#7a8488';
  ctx.fillRect(-root*2, -len, root*4, len*0.07);
  ctx.restore();
  if (on && night) {
    ctx.fillStyle = 'rgba(120,240,255,0.9)';
    ctx.beginPath(); ctx.arc(-root*0.04, -len + 1.5*u, 1.4*u, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(120,240,255,0.18)';
    ctx.beginPath(); ctx.arc(-root*0.04, -len + 1.5*u, 5*u, 0, Math.PI*2); ctx.fill();
  }
}

function _renderWindMk3(e, px, py, W, H, t) {
  const u = W / 160, on = !!e.powered;
  const spd = WindState.speed, ice = e._ice || 0, spin = TurbineIcing.spinMult(e);
  // Which passes of the static/animated split this call draws (all three for an
  // ordinary one-pass render, so the guards below are transparent to it).
  const Sp = SplitPhase.wantStatic(), Ap = SplitPhase.wantOver(), Up = SplitPhase.wantUnder();
  const ang = (Up || Ap) ? _windBladeAngle(e, spd*spin, 1.35, 0.18*spin, 0.28, 1.3) : 0;
  const dark = (typeof DayNight !== 'undefined') ? DayNight.darkness() : 0;
  const night = dark > 0.35;
  const hubX = px + W*0.5, hubY = py + H*0.24, baseY = py + H*0.86;
  const len = W*0.45;
  const def = EntityDefs[T.WIND3];
  const outFrac = on && def ? Math.max(0, Math.min(1, ((e.def.powerOutput || 0) - def.baseOutput) / Math.max(1, def.maxOutput - def.baseOutput))) : 0;
  const CY = on ? '#48e0ff' : '#2e5a66';
  // LOD for the live layer, which every turbine on screen redraws every
  // frame: below this the railing posts, anemometer cups, light-strip
  // highlights, conduit pulses and blade weave are a pixel or less.
  const fine = Camera.zoom > 0.6;
  ctx.save();

  if (Up) _windGroundShadow(hubX, hubY, hubX, baseY, ang, 3, len*0.85, u*1.2);

  // ── Transformer yard ─────────────────────────────────────────────
  // gravel pad, cable trench out to the footprint edge, fenced transformer
  if (Sp) {
  ctx.fillStyle = 'rgba(120,116,106,0.55)';
  ctx.beginPath(); ctx.ellipse(hubX, baseY + 2*u, 30*u, 9*u, 0, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(30,34,32,0.5)'; ctx.fillRect(hubX - 2*u, baseY + 4*u, 4*u, py + H - baseY - 4*u);
  }
  if (Ap && on) {
    const f = (t*0.8) % 1;
    ctx.fillStyle = `rgba(72,224,255,${(0.6*(1 - f)).toFixed(2)})`;
    ctx.fillRect(hubX - 1*u, baseY + 4*u + f*(py + H - baseY - 6*u), 2*u, 3*u);
  }
  const tx = hubX + 14*u, ty = baseY - 12*u;
  if (Sp) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(tx + 2*u, ty + 2*u, 18*u, 13*u);
  ctx.fillStyle = on ? '#4e5a5e' : '#343c3e'; ctx.fillRect(tx, ty, 18*u, 13*u);
  ctx.fillStyle = on ? '#65747a' : '#40484a'; ctx.fillRect(tx, ty, 18*u, 2.4*u);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.6*u;
  for (let k = 0; k < 5; k++) { const x = tx + 2*u + k*3.2*u; ctx.beginPath(); ctx.moveTo(x, ty + 3.5*u); ctx.lineTo(x, ty + 11*u); ctx.stroke(); }
  }
  // coil bushings that glow with output
  if (Sp) for (let k = 0; k < 3; k++) {
    const bx = tx + 3.5*u + k*5.5*u, by = ty - 1*u;
    ctx.fillStyle = '#c8ccc4'; ctx.beginPath(); ctx.arc(bx, by, 1.8*u, 0, Math.PI*2); ctx.fill();
  }
  if (Ap && on) for (let k = 0; k < 3; k++) {
    const bx = tx + 3.5*u + k*5.5*u, by = ty - 1*u;
    const hum = 0.35 + 0.45*outFrac + 0.2*Math.sin(t*9 + k*2);
    ctx.fillStyle = `rgba(72,224,255,${hum.toFixed(2)})`;
    ctx.beginPath(); ctx.arc(bx, by, 1.1*u, 0, Math.PI*2); ctx.fill();
  }
  if (Sp) {
  ctx.strokeStyle = 'rgba(190,196,200,0.45)'; ctx.lineWidth = 0.5*u;
  ctx.strokeRect(tx - 3*u, ty - 5*u, 24*u, 21*u);
  }

  // ── Tower ────────────────────────────────────────────────────────
  const bw = 7*u, tw = 3*u;
  const tg = ctx.createLinearGradient(hubX - bw, 0, hubX + bw, 0);
  tg.addColorStop(0,   on ? '#d8dee2' : '#7e8488');
  tg.addColorStop(0.4, on ? '#b8c2c8' : '#666c70');
  tg.addColorStop(1,   on ? '#5c6870' : '#3a4044');
  if (Sp) {
  ctx.fillStyle = tg;
  ctx.beginPath(); ctx.moveTo(hubX - bw, baseY); ctx.lineTo(hubX + bw, baseY); ctx.lineTo(hubX + tw, hubY); ctx.lineTo(hubX - tw, hubY); ctx.closePath(); ctx.fill();
  }
  const hwAt = (f) => bw + (tw - bw)*f;                                    // half-width at height fraction f
  const yAt  = (f) => baseY + (hubY - baseY)*f;
  // livery bands
  if (Sp) {
  ctx.fillStyle = on ? '#1c3a44' : '#1e2a2e';
  for (const [f0, f1] of [[0.02, 0.10], [0.13, 0.155]]) {
    ctx.beginPath(); ctx.moveTo(hubX - hwAt(f0), yAt(f0)); ctx.lineTo(hubX + hwAt(f0), yAt(f0)); ctx.lineTo(hubX + hwAt(f1), yAt(f1)); ctx.lineTo(hubX - hwAt(f1), yAt(f1)); ctx.closePath(); ctx.fill();
  }
  }
  // power conduit: pulses travel up the tower faster at higher output
  if (Sp) {
  ctx.strokeStyle = on ? 'rgba(72,224,255,0.35)' : 'rgba(46,90,102,0.4)'; ctx.lineWidth = 1.2*u;
  ctx.beginPath(); ctx.moveTo(hubX + 1.5*u, baseY - 2*u); ctx.lineTo(hubX + 0.6*u, hubY + 4*u); ctx.stroke();
  }
  if (Ap && on && fine) {
    for (let k = 0; k < 4; k++) {
      const f = (t*(0.25 + outFrac*0.6) + k/4) % 1;
      const y = yAt(0.03 + f*0.9);
      ctx.fillStyle = `rgba(150,245,255,${(0.9*Math.sin(f*Math.PI)).toFixed(2)})`;
      ctx.beginPath(); ctx.arc(hubX + 1.5*u - 0.9*u*f, y, 1.3*u, 0, Math.PI*2); ctx.fill();
    }
  }
  // door and a lit porthole
  if (Ap) {
  ctx.fillStyle = on ? '#3a464c' : '#2a3034';
  ctx.beginPath(); ctx.roundRect(hubX - 2.4*u, baseY - 10*u, 4.8*u, 8*u, [2*u, 2*u, 0, 0]); ctx.fill();
  ctx.fillStyle = on && night ? '#ffe0a0' : '#5a6468'; ctx.beginPath(); ctx.arc(hubX, baseY - 7.5*u, 0.9*u, 0, Math.PI*2); ctx.fill();
  }
  // service platform with railing at ~58%
  if (Ap) { const f = 0.58, py2 = yAt(f), rw = hwAt(f) + 6*u;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(hubX + 1*u, py2 + 1.4*u, rw, 2.6*u, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = on ? '#8a969c' : '#4e5558'; ctx.beginPath(); ctx.ellipse(hubX, py2, rw, 2.4*u, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = on ? '#e0b030' : '#6a5a2a'; ctx.lineWidth = 0.6*u;
    ctx.beginPath(); ctx.ellipse(hubX, py2 - 2*u, rw, 2.4*u, 0, Math.PI, Math.PI*2); ctx.stroke();
    if (fine) for (let k = -2; k <= 2; k++) { const x = hubX + k*rw*0.45; ctx.beginPath(); ctx.moveTo(x, py2 - 0.2*u); ctx.lineTo(x, py2 - 2.4*u); ctx.stroke(); }
  }

  // ── Nacelle ──────────────────────────────────────────────────────
  if (Sp && on && night) {
    const ug = ctx.createRadialGradient(hubX + 6*u, hubY + 4*u, 0, hubX + 6*u, hubY + 4*u, 22*u);
    ug.addColorStop(0, 'rgba(72,224,255,0.22)'); ug.addColorStop(1, 'rgba(72,224,255,0)');
    ctx.fillStyle = ug; ctx.fillRect(hubX - 16*u, hubY - 18*u, 44*u, 44*u);
  }
  if (Sp) {
  const ng = ctx.createLinearGradient(0, hubY - 6*u, 0, hubY + 6*u);
  ng.addColorStop(0, on ? '#f2f6f8' : '#80888a'); ng.addColorStop(0.6, on ? '#c8d2d8' : '#5e6668'); ng.addColorStop(1, on ? '#7c8a92' : '#3c4244');
  ctx.fillStyle = ng; ctx.strokeStyle = 'rgba(40,50,56,0.7)'; ctx.lineWidth = 0.8*u;
  ctx.beginPath(); ctx.roundRect(hubX - 4*u, hubY - 6*u, 27*u, 12*u, [6*u, 3*u, 3*u, 6*u]); ctx.fill(); ctx.stroke();
  }
  // scrolling light strip
  if (Ap) {
  ctx.save();
  ctx.beginPath(); ctx.rect(hubX + 2*u, hubY + 0.4*u, 18*u, 2*u); ctx.clip();
  ctx.fillStyle = on ? '#12343c' : '#1e2a2e'; ctx.fillRect(hubX + 2*u, hubY + 0.4*u, 18*u, 2*u);
  if (on && fine) {
    for (let k = 0; k < 3; k++) {
      const x = hubX + 2*u + (((t*(0.5 + spd) + k/3) % 1) * 24 - 3)*u;
      const lg = ctx.createLinearGradient(x - 4*u, 0, x + 4*u, 0);
      lg.addColorStop(0, 'rgba(72,224,255,0)'); lg.addColorStop(0.5, 'rgba(160,248,255,0.95)'); lg.addColorStop(1, 'rgba(72,224,255,0)');
      ctx.fillStyle = lg; ctx.fillRect(x - 4*u, hubY + 0.4*u, 8*u, 2*u);
    }
  }
  ctx.restore();
  }
  // cooling fins and roof hatch
  if (Sp) {
  ctx.strokeStyle = 'rgba(60,72,80,0.45)'; ctx.lineWidth = 0.5*u;
  for (let x = hubX + 8*u; x < hubX + 20*u; x += 2*u) { ctx.beginPath(); ctx.moveTo(x, hubY - 4.6*u); ctx.lineTo(x, hubY - 2*u); ctx.stroke(); }
  ctx.fillStyle = on ? '#9aa6ac' : '#50585a'; ctx.fillRect(hubX + 1*u, hubY - 5*u, 5*u, 3.4*u);
  ctx.fillStyle = on ? '#e0b030' : '#6a5a2a'; ctx.fillRect(hubX + 3.1*u, hubY - 4.6*u, 0.8*u, 2.6*u); ctx.fillRect(hubX + 1.9*u, hubY - 3.7*u, 3.2*u, 0.8*u);
  }
  // frost on the roof: drawn live, as the nacelle itself is baked
  if (Ap) _windNacelleIce(hubX - 4*u, hubY - 6*u, 27*u, 6*u, u, ice);
  // anemometer and wind vane on the tail
  const anX = hubX + 19*u, anY = hubY - 11*u;
  if (Sp) { ctx.strokeStyle = '#4a5054'; ctx.lineWidth = 0.7*u; ctx.beginPath(); ctx.moveTo(anX, hubY - 6*u); ctx.lineTo(anX, anY); ctx.stroke(); }
  const anA = on ? t*spd*12 : 0;
  if (Ap && fine) {
  for (let c = 0; c < 3; c++) {
    const a = anA + c*Math.PI*2/3;
    ctx.fillStyle = '#2e3236'; ctx.beginPath(); ctx.arc(anX + Math.cos(a)*2.8*u, anY + Math.sin(a)*1.1*u, 1*u, 0, Math.PI*2); ctx.fill();
  }
  }
  // twin aviation lights, synchronised
  const blink = 0.5 + 0.5*Math.sin(t*2.1);
  if (Ap) {
  for (const lx of [hubX + 9*u, hubX + 21*u]) {
    ctx.fillStyle = `rgba(255,50,40,${on ? 0.3 + 0.7*blink : 0.15})`;
    ctx.beginPath(); ctx.arc(lx, hubY - 6.8*u, 1.4*u, 0, Math.PI*2); ctx.fill();
    if (on && blink > 0.8) { ctx.fillStyle = 'rgba(255,60,40,0.22)'; ctx.beginPath(); ctx.arc(lx, hubY - 6.8*u, 6*u, 0, Math.PI*2); ctx.fill(); }
  }
  }

  // ── Rotor ────────────────────────────────────────────────────────
  // tip-vortex trails behind each blade tip in strong wind
  if (Ap && on && spd > 0.45) {
    const a = Math.min(1, (spd - 0.45) / 0.4);
    ctx.lineCap = 'round';
    for (let b = 0; b < 3; b++) {
      const tipA = ang + b*Math.PI*2/3 - Math.PI/2;
      for (let k = 0; k < (fine ? 3 : 1); k++) {
        ctx.strokeStyle = `rgba(210,240,255,${(0.16*a*(1 - k/3)).toFixed(3)})`;
        ctx.lineWidth = (1.6 - k*0.4)*u;
        ctx.beginPath(); ctx.arc(hubX, hubY, len*(0.98 - k*0.015), tipA - 0.42 + k*0.1, tipA - 0.05); ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
  }
  if (Ap) {
  for (let b = 0; b < 3; b++) {
    ctx.save(); ctx.translate(hubX, hubY); ctx.rotate(ang + b*Math.PI*2/3);
    _mk3Blade(len, 6*u, u, on, night, fine);
    if (ice > 0.02 || e._iceHeating) _windBladeIce(len, 6*u, u, ice, [0.55, 1.25, 0.28, 0.18], 3*u, on && !!e._iceHeating);
    ctx.restore();
  }
  }
  // chrome spinner with a core ring that brightens with output
  if (Ap) {
  const hg = ctx.createRadialGradient(hubX - 2*u, hubY - 2*u, 0.5, hubX, hubY, 6*u);
  hg.addColorStop(0, '#ffffff'); hg.addColorStop(0.6, on ? '#b4c0c6' : '#6a7274'); hg.addColorStop(1, on ? '#6a7880' : '#3a4042');
  ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hubX, hubY, 6*u, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = CY; ctx.lineWidth = 1.1*u;
  ctx.globalAlpha = on ? 0.55 + 0.45*outFrac : 0.6;
  ctx.beginPath(); ctx.arc(hubX, hubY, 3.4*u, 0, Math.PI*2); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = on ? '#a8f4ff' : '#3a5a64'; ctx.beginPath(); ctx.arc(hubX, hubY, 1.5*u, 0, Math.PI*2); ctx.fill();
  if (on && night) { ctx.fillStyle = 'rgba(72,224,255,0.25)'; ctx.beginPath(); ctx.arc(hubX, hubY, 9*u, 0, Math.PI*2); ctx.fill(); }
  }

  if (Ap && on) {
    _windReadout(e, hubX, py + H - 1.5*u, u, 7.5, '#9af0ff');
    ctx.textAlign = 'left';
  }
  if (Ap) drawNetworkHighlight(e, px, py, t);
  ctx.restore();
}

/* Static/animated split for the MK3 wind turbine (see SplitPhase in
   render_core.js). The yard, tower and nacelle are baked once; the rotor,
   hub, pulses, lamps, light strip, platform and the output readout stay live,
   and the rotating blade shadow is drawn live beneath the bitmap. alwaysLive:
   the blades must turn at the frame rate even when the cache is in its
   cheapest (frozen) tier. */
RenderSplit.register(T.WIND3, {
  alwaysLive: true,
  key(e) { return (e.powered ? 1 : 0) + ':' + (DayNight.darkness() > 0.35 ? 'n' : 'd'); },
  under(e, x, y, t) {
    if (GfxQuality.smoothBuildings()) SplitPhase.run('under', () => renderEntityAt(e, x, y, t));
  },
});
