/* ═══════════════════════════════════════════════════════════════════
   TRUCK SYSTEM
   Trucks are 1×3 entities that can be driven in world-space with WASD.
   Movement is pixel-smooth; internally we track wx/wy world coords,
   vx/vy velocity, and angle (radians, 0=up). The grid col/row follows
   the world position each frame so the entity stays grid-aware.
   ═══════════════════════════════════════════════════════════════════ */
const TruckSystem = (() => {
  const SPEED        = 352;   // patrol-only top speed (was 282; +25%). truck_dispatch.js PATROL_SPEED_PX mirrors it
  const ACCEL        = 2400;
  const FRICTION     = 0.82;
  const TURN_SPEED   = 6;
  // ── Patrol driving (see _buildTrack and _tickPatrol) ──
  // A patrol truck doesn't aim at its next waypoint; it follows a track laid
  // over the waypoints with every corner rounded into an arc, steering at a
  // point a little way ahead along it and braking for each bend before it
  // gets there. Speeds are px/s, accelerations px/s².
  const PATROL_CREEP      = 30;          // floor while working round a tight spot
  const PATROL_GRIP       = 10;          // s⁻¹ — how fast sideways slide bleeds off
  const PATROL_ACCEL      = 312;         // pulling away empty (fades toward SPEED); was 250, +25% with SPEED so cruise takes as long to reach
  const PATROL_LOAD_DRAG  = 0.35;        // share of that pull a full bed takes away
  const PATROL_BRAKE      = 340;         // service braking the whole track is planned around
  const PATROL_BRAKE_HARD = 720;         // for a truck in the way
  const PATROL_BRAKE_DOCK = 1000;        // pulling up where it has started to load, unload or refuel
  const CORNER_GRIP       = 340;         // sideways g a truck will take a bend at: v² / r
  const TURN_RADIUS_MIN   = TILE * 1.3;  // tightest circle on ordinary steering lock
  // Below that radius the truck has to shuffle round: crawling, it may yaw
  // up to PIVOT_YAW, fading out by PATROL_CREEP + PIVOT_FADE. It still has
  // to be rolling to turn at all, so nothing spins on the spot.
  const PIVOT_YAW         = 1.8;         // rad/s
  const PIVOT_FADE        = 60;          // px/s
  const STEER_WIND        = 0.4;         // seconds to wind the wheel from straight to full lock
  const FILLET_MAX        = TILE * 3;    // furthest back from a corner a turn may begin
  const FILLET_RADIUS     = TILE * 4.5;  // no bend needs to be gentler than this
  const FILLET_PAD        = TILE * 0.2;  // clearance a rounded corner must keep from anything solid
  const HARD_TURN         = 0.45;        // rad — an unrounded corner sharper than this is driven up to, then turned
  const CURVE_WINDOW      = TILE * 2.5;  // heading change is averaged over this to price a bend
  const LOOK_TIME         = 0.45;        // steer at where the track is this many seconds ahead…
  const LOOK_MIN          = TILE * 1.1;  // …but never nearer than this
  const LOOK_MAX          = TILE * 3.2;  // …or further
  const SIGNAL_AHEAD      = TILE * 5;    // indicators come on this far before a turn
  // Heading changes pivot about a point this far behind the body centre
  // (toward the tandem rear axles), so the cab swings out and the bed
  // tracks inside the turn like a real rigid truck, instead of the whole
  // body rotating about its middle.
  const PATROL_PIVOT_BACK = 22; // px (rear axle sits ~37px back)
  const DRIVE_PIVOT_BACK  = 30; // px — player driving follows the axle more closely

  // ── Player-driven physics (weighty, momentum-based — see _moveTruck) ──
  const MAX_SPEED_FWD  = 938;   // top forward speed, px/s
  const MAX_SPEED_REV  = 344;   // top reverse speed, px/s — trucks back up slowly
  const ENGINE_FORCE   = 900;   // forward thrust, px/s² at low speed (tapers near top speed)
  const BRAKE_FORCE    = 1600;  // deceleration when braking, stronger than the engine
  const ROLL_RESIST    = 1.1;   // linear rolling-resistance decay rate (s⁻¹)
  const DRAG_COEF      = 0.0021;// quadratic air-drag coefficient, bites harder at high speed
  const LATERAL_GRIP   = 5.5;   // how fast sideways slip bleeds off — lower = more drift/slide
  const STEER_RATE     = 2.3;   // max turn rate, rad/s, reached once at FULL_TURN_SPEED
  const FULL_TURN_SPEED= 260;   // speed at which steering reaches full rate
  const MIN_TURN_SPEED = 6;     // below this, steering has no effect (no spinning while parked)

  // ── Stuck detection / back-out (patrol trucks only) ──
  // The truck's collision box (_resolveCollision) is a fixed, axis-aligned
  // rectangle that doesn't rotate with the sprite, so a route that shaves a
  // corner too closely — or a genuinely bad approach angle — can wedge the
  // truck against a building with nothing to un-stick it. If a patrolling
  // truck isn't actually making progress toward its waypoint for a couple of
  // checks in a row, back it straight up for a moment; that alone usually
  // clears the corner, and TruckDispatchSystem watches _needsReroute to
  // recompute a fresh route afterward for auto-dispatched trucks.
  const STUCK_CHECK_INTERVAL  = 1.0;      // seconds between progress checks
  const STUCK_MIN_PROGRESS    = TILE * 0.6; // must cover at least this far between checks
  const STUCK_STRIKES_TRIGGER = 2;        // consecutive failed checks before backing out
  const RECOVER_DURATION      = 1.1;      // seconds spent reversing
  const REVERSE_ACCEL         = ACCEL * 0.6;
  const REVERSE_MAX_SPEED     = SPEED * 0.5;
  // Backing out on its own doesn't need the player's attention — it usually
  // clears the corner in one go. Only surface a toast once a truck has been
  // stuck-and-recovering for a while with no real progress in between, since
  // that's the case where something's actually gone wrong and might need
  // manual intervention (redirecting it, clearing an obstacle, etc.).
  const STUCK_TOAST_THRESHOLD = 15; // seconds of cumulative stuck time before it's worth a toast
  // Stuck for this long in one episode, backing out and all, and the truck is
  // moved to the nearest clear ground (see _nearestClear) rather than left to
  // keep reversing into the same corner.
  const STUCK_WORK_FREE_AFTER = 9;

  // How long a truck will sit yielding to another truck before treating it as
  // a genuine standoff rather than a brief right-of-way wait. Trucks pass
  // through each other physically (T.TRUCK is in PASSTHROUGH below), so if
  // the other truck is ALSO stopped (e.g. finishing a haul, or itself
  // yielding back, or three of them each waiting on the next), neither one
  // clears on its own and they'd otherwise face off forever. Backing out and
  // coming forward again only walks straight back into the same wait, so the
  // truck that has waited this long is waved through instead: it stops
  // yielding for YIELD_PASS_SECONDS, long enough to drive clear of whatever
  // it was waiting on. No truck can be held for longer than the timeout.
  const YIELD_STANDOFF_TIMEOUT = 4.0; // seconds of continuous yielding before pushing on
  const YIELD_PASS_SECONDS     = 3.0; // right of way granted once that runs out

  // How long an auto-dispatched truck sits at its final waypoint with no
  // haul/refuel active before the leg is actually considered done. Patrol
  // movement runs every render substep, but HaulSystem/GasStationSystem only
  // check proximity once per fixed-rate logic tick — without this grace
  // window, arrival could get flagged and TruckDispatchSystem could advance
  // to the next leg before those slower systems ever got a chance to notice
  // the truck was there and start loading/unloading/refueling at all.
  const ARRIVAL_GRACE_SECONDS = 0.35;

  let _driven          = null;
  // Truck the camera is following because the player hit Focus in the patrol
  // panel, plus the Camera.manualPanSeq() reading taken when focus was set —
  // the moment that counter moves, the player has grabbed the camera and the
  // follow lets go rather than yanking the view back every frame.
  let _focused         = null;
  let _focusPanSeq     = 0;
  let _lastClickEntity = null;
  let _lastClickTime   = 0;
  const DBLCLICK_MS    = 350;

  // ── Truck-to-truck collision avoidance (patrol trucks only) ──
  // Trucks pass through each other physically (T.TRUCK is in PASSTHROUGH
  // below), so without this two patrol routes crossing would just have
  // trucks silently drive through one another. Instead, a patrol truck
  // that's about to close in on another truck within TRUCK_AVOID_RADIUS
  // eases off as the gap closes and holds FOLLOW_GAP behind it (see
  // _yieldCap), rather than running up to it and stamping on the brakes.
  const TRUCK_AVOID_RADIUS = TILE * 6;
  const FOLLOW_GAP         = TILE * 4.2;  // centre to centre: a truck length and a bit
  const YIELD_STOPPED      = 12;          // px/s — held below this, the truck counts as stopped and waiting
  // cos() of the half-angle of the forward "ahead" cone — wide enough to
  // catch merging/crossing paths, not just a truck dead ahead.
  const TRUCK_AHEAD_DOT    = 0.15;
  let _nextTruckId = 1;

  // Tightest curvature (1/px) the truck can hold at a rolling speed.
  function _steerCap(v) {
    const pivot = PIVOT_YAW * Math.max(0, Math.min(1, 1 - (v - PATROL_CREEP) / PIVOT_FADE)) / Math.max(v, PATROL_CREEP);
    return Math.max(1 / TURN_RADIUS_MIN, pivot);
  }

  // Fastest speed at which curvature k can still be held (the inverse of
  // _steerCap): anything within ordinary lock is not limited here.
  function _fitSpeed(k) {
    if (k <= 1 / TURN_RADIUS_MIN) return Infinity;
    return Math.max(PATROL_CREEP, PIVOT_YAW * (1 + PATROL_CREEP / PIVOT_FADE) / (k + PIVOT_YAW / PIVOT_FADE));
  }

  // Would the truck's collision box, centred on world point (cx, cy) and
  // grown by pad, be touching anything _resolveCollision treats as solid?
  function _boxSolid(cx, cy, pad) {
    const x0 = cx - TILE / 2 - pad, x1 = cx + TILE / 2 + pad;
    const y0 = cy - TILE * 1.5 - pad, y1 = cy + TILE * 1.5 + pad;
    if (x0 < 0 || y0 < 0 || x1 > COLS * TILE || y1 > ROWS * TILE) return true;
    const c0 = Math.floor(x0 / TILE), c1 = Math.floor(x1 / TILE);
    const r0 = Math.floor(y0 / TILE), r1 = Math.floor(y1 / TILE);
    for (const o of EntityRegistry.getInTileRect(c0, r0, c1, r1)) {
      if (o._bridge) {
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (WaterBuild.railAt(o, c, r)) return true;
        continue;
      }
      if (PASSTHROUGH.has(o.type)) continue;
      const ox = o.col * TILE, oy = o.row * TILE;
      if (x1 > ox && x0 < ox + (o.width || 1) * TILE && y1 > oy && y0 < oy + (o.height || 1) * TILE) return true;
    }
    return false;
  }

  // ── The track ──
  // e._path is the route as given: a handful of waypoints joined by straight
  // legs. Driven as-is that means running flat out at a point, stopping,
  // swivelling and setting off again. The track is the same route with each
  // corner swapped for an arc that leaves the leg early and joins the next
  // one late, as wide as the legs and whatever stands nearby allow. A corner
  // with no room for one stays a point (`hard`) and is driven the old way:
  // right up to it, then round.
  //
  // Each track point carries which waypoint the stretch after it is heading
  // for (so e._patrolIdx still means what it always did), how much the
  // heading swings there, and vcap: the most the truck may be doing as it
  // passes, already allowing for having to brake for whatever comes next.
  //
  // A dispatch leg is driven once and stops at its end; a hand-drawn or
  // saved patrol goes round and round, so its track closes on itself.
  function _buildTrack(e) {
    const W = e._path, n = W.length, cyclic = !e._autoDispatch;
    const px = [], py = [], wp = [], turn = [], hard = [], lim = [];
    const put = (x, y, w, t, h, l) => { px.push(x); py.push(y); wp.push(w); turn.push(t); hard.push(h); lim.push(l); };

    for (let i = 0; i < n; i++) {
      const b = W[i], next = (i + 1) % n;
      if (!cyclic && (i === 0 || i === n - 1)) { put(b.wx, b.wy, i === 0 ? 1 : i, 0, false, Infinity); continue; }
      const a = W[(i - 1 + n) % n], c = W[next];
      const l1 = Math.hypot(b.wx - a.wx, b.wy - a.wy), l2 = Math.hypot(c.wx - b.wx, c.wy - b.wy);
      if (l1 < 1 || l2 < 1) { put(b.wx, b.wy, next, 0, false, Infinity); continue; }
      const u1x = (b.wx - a.wx) / l1, u1y = (b.wy - a.wy) / l1;
      const u2x = (c.wx - b.wx) / l2, u2y = (c.wy - b.wy) / l2;
      const cross = u1x * u2y - u1y * u2x;
      const theta = Math.atan2(Math.abs(cross), u1x * u2x + u1y * u2y);   // how far the route swings here
      const sgn = cross >= 0 ? 1 : -1;                                    // + = to the right
      if (theta < 0.05) { put(b.wx, b.wy, next, sgn * theta, false, Infinity); continue; }

      // Round it: back off d along each leg and join the two points with an arc.
      let placed = false;
      if (theta < 2.6) {
        const tanH = Math.tan(theta / 2);
        let d = Math.min(FILLET_MAX, l1 * 0.45, l2 * 0.45, FILLET_RADIUS * tanH);
        for (; d >= TILE * 0.4 && !placed; d *= 0.5) {
          const R = d / tanH;
          const ox = b.wx - u1x * d - sgn * u1y * R, oy = b.wy - u1y * d + sgn * u1x * R;   // arc centre
          const a0 = Math.atan2(b.wy - u1y * d - oy, b.wx - u1x * d - ox);
          const m = Math.max(2, Math.min(16, Math.ceil(theta * R / (TILE * 0.5))));
          const pts = [];
          let clear = true;
          for (let j = 0; j <= m && clear; j++) {
            const an = a0 + sgn * theta * j / m;
            const x = ox + Math.cos(an) * R, y = oy + Math.sin(an) * R;
            if (_boxSolid(x, y, FILLET_PAD)) clear = false; else pts.push(x, y);
          }
          if (!clear) continue;
          const tight = _fitSpeed(1.2 / R);
          for (let j = 0; j <= m; j++) put(pts[j * 2], pts[j * 2 + 1], j * 2 < m ? i : next, sgn * theta / (m + 1), false, tight);
          placed = true;
        }
      }
      if (!placed) {
        const isHard = theta > HARD_TURN;
        put(b.wx, b.wy, next, sgn * theta, isHard, isHard ? (theta > 1.05 ? 38 : 85) : Infinity);
      }
    }

    const N = px.length, segs = cyclic ? N : N - 1;
    const len = new Float32Array(N), cum = new Float32Array(N + 1);
    for (let k = 0; k < segs; k++) {
      const j = (k + 1) % N;
      len[k] = Math.hypot(px[j] - px[k], py[j] - py[k]);
      cum[k + 1] = cum[k] + len[k];
    }
    const total = cum[segs];

    // Price each point by how much the heading swings around it. Summing the
    // signed turns over a window, rather than reading each kink on its own,
    // lets a wobbly hand-drawn line that is straight on the whole be driven
    // as one.
    const half = CURVE_WINDOW / 2;
    for (let k = 0; k < N; k++) {
      let sum = turn[k];
      for (let dir = -1; dir <= 1; dir += 2) {
        let j = k, dist = 0;
        for (let guard = 0; guard < N; guard++) {
          const from = dir > 0 ? j : j - 1;
          if (!cyclic && (from < 0 || from >= segs)) break;
          dist += len[(from + N) % N];
          if (dist > half) break;
          j = (j + dir + N) % N;
          if (j === k) break;
          sum += turn[j];
        }
      }
      const kEff = Math.abs(sum) / CURVE_WINDOW;
      if (kEff > 1e-5) lim[k] = Math.min(lim[k], Math.max(PATROL_CREEP, Math.sqrt(CORNER_GRIP / kEff)));
    }

    // Walk it backwards so every point also knows about the braking still to
    // come: no faster here than can be shed by the next slow point.
    const vcap = new Float32Array(N);
    for (let k = 0; k < N; k++) vcap[k] = Math.min(lim[k], 1e4);
    if (!cyclic) vcap[N - 1] = 0;
    for (let pass = 0; pass < (cyclic ? 2 : 1); pass++) {
      for (let k = segs - 1; k >= 0; k--) {
        const j = (k + 1) % N;
        vcap[k] = Math.min(vcap[k], Math.sqrt(vcap[j] * vcap[j] + 2 * PATROL_BRAKE * len[k]));
      }
    }

    const tr = { src: W, n, cyclic, N, segs, px, py, wp, turn, hard, lim, vcap, len, cum, total };
    // Pick up the track where the truck is: on the stretch heading for the
    // waypoint it was already making for, if there is one.
    const cx = e._wx + TILE / 2, cy = e._wy + TILE * 1.5;
    let best = 0, bestD = Infinity, bestOwn = false;
    for (let k = 0; k < segs; k++) {
      const own = wp[k] === e._patrolIdx;
      if (bestOwn && !own) continue;
      const d = _segDist(tr, k, cx, cy).d2;
      if ((own && !bestOwn) || d < bestD) { best = k; bestD = d; bestOwn = own; }
    }
    e._trkK = best;
    e._trk = tr;
    return tr;
  }

  // Squared distance from (x, y) to track segment k, and how far along it (0..1).
  const _seg = { d2: 0, t: 0 };
  function _segDist(tr, k, x, y) {
    const j = (k + 1) % tr.N;
    const ax = tr.px[k], ay = tr.py[k], dx = tr.px[j] - ax, dy = tr.py[j] - ay;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 1e-6 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    const ex = x - ax - dx * t, ey = y - ay - dy * t;
    _seg.d2 = ex * ex + ey * ey; _seg.t = t;
    return _seg;
  }

  // Move e._trkK on to whichever stretch of track the truck is now beside,
  // only ever forwards and only a little way, so a route that doubles back
  // past itself isn't skipped. A hard corner is passed by getting to it.
  // Returns how far along that stretch the truck is (0..1).
  function _trackAdvance(tr, e, cx, cy) {
    let k = e._trkK;
    if (!(k >= 0 && k < tr.segs)) k = e._trkK = 0;
    let s = _segDist(tr, k, cx, cy), bestD = s.d2, bestT = s.t;
    let j = k, ahead = -s.t * tr.len[k];
    for (let i = 0; i < 16; i++) {
      if (!tr.cyclic && j + 1 >= tr.segs) break;
      const v = (j + 1) % tr.N, nj = (j + 1) % tr.segs;
      ahead += tr.len[j];
      if (tr.hard[v]) {
        if (Math.hypot(cx - tr.px[v], cy - tr.py[v]) > TILE * 0.5) break;
        s = _segDist(tr, nj, cx, cy);
        k = nj; bestD = s.d2; bestT = s.t;
      } else {
        if (ahead > TILE * 2.5) break;
        s = _segDist(tr, nj, cx, cy);
        if (s.d2 < bestD - 0.01) { k = nj; bestD = s.d2; bestT = s.t; }
      }
      j = nj;
    }
    e._trkK = k;
    return bestT;
  }

  // The point `dist` px further along the track from (segment k, fraction
  // t), held at a hard corner or the end of the line if one comes first.
  // Also sums the turning over the next SIGNAL_AHEAD, for the indicators.
  const _look = { x: 0, y: 0, dx: 0, dy: 0, turn: 0 };
  function _trackAhead(tr, k, t, dist) {
    let j = k, left = dist, run = -t * tr.len[k], found = false, sum = 0;
    for (let i = 0; i < 64; i++) {
      const v = (j + 1) % tr.N, L = tr.len[j], from = i === 0 ? t * L : 0;
      const last = !tr.cyclic && j + 1 >= tr.segs;
      if (!found) {
        if (left <= L - from || last || tr.hard[v] || i === 63) {
          const f = L > 1e-6 ? Math.min(1, (from + left) / L) : 1;
          _look.x = tr.px[j] + (tr.px[v] - tr.px[j]) * f; _look.y = tr.py[j] + (tr.py[v] - tr.py[j]) * f;
          _look.dx = L > 1e-6 ? (tr.px[v] - tr.px[j]) / L : 0; _look.dy = L > 1e-6 ? (tr.py[v] - tr.py[j]) / L : 0;
          found = true;
        } else left -= L - from;
      }
      run += L;
      if (last || (found && run > SIGNAL_AHEAD)) break;
      sum += tr.turn[v];
      j = (j + 1) % tr.segs;
    }
    _look.turn = sum;
    return _look;
  }

  // After the heading moves from prevAngle to e._angle, shift the body so
  // the point `back` px behind its centre stays put (see PATROL_PIVOT_BACK).
  function _pivotAboutRear(e, prevAngle, back) {
    if (e._angle === prevAngle) return;
    e._wx += back * (Math.sin(e._angle) - Math.sin(prevAngle));
    e._wy -= back * (Math.cos(e._angle) - Math.cos(prevAngle));
  }

  // Purely cosmetic motion state, derived from how the truck actually moved
  // since the last frame it was drawn (so it works the same for driving,
  // patrols, backing out and being yanked by collisions):
  //   _visSteer  front-wheel angle implied by yaw rate over speed (bicycle model)
  //   _visLean   body roll to the outside of a turn (lateral g)
  //   _visPitch  nose dive under braking / squat pulling away (longitudinal g)
  //   _visOdo    distance rolled, to scroll the tyre treads
  //   _fx        exhaust smoke and wheel dust left behind in the world
  // Lean and pitch ride on a spring with not quite enough damping, so the
  // body rocks once and settles when the truck pulls up or straightens out
  // rather than gliding to a perfectly level stop.
  const VIS_WHEELBASE = 78;     // px, steer axle to tandem centre
  const VIS_SPRING    = 120;    // s⁻² — body-on-suspension stiffness (about 1.7 Hz)
  const VIS_DAMP      = 8.5;    // s⁻¹
  const FX_MAX        = 36;     // particles per truck
  function _updateMotionVisuals(e, t) {
    const fx = Math.sin(e._angle), fy = -Math.cos(e._angle);
    const fwd = (e._vx || 0) * fx + (e._vy || 0) * fy;
    const dt = e._visT === undefined ? 0 : t - e._visT;
    e._visT = t;
    if (!(dt > 0 && dt < 0.25)) {           // paused, first frame, or a long hitch
      e._visAngle = e._angle; e._visFwd = fwd;
      if (e._visSteer === undefined) { e._visSteer = 0; e._visLean = 0; e._visPitch = 0; e._visOdo = 0; }
      return;
    }
    let dA = e._angle - (e._visAngle ?? e._angle);
    while (dA >  Math.PI) dA -= Math.PI * 2;
    while (dA < -Math.PI) dA += Math.PI * 2;
    const yaw = dA / dt;
    const longG = (fwd - (e._visFwd ?? fwd)) / dt;
    e._visAngle = e._angle; e._visFwd = fwd;
    e._visOdo = ((e._visOdo || 0) + fwd * dt) % 1000;

    const speed = Math.abs(fwd);
    const steerTarget = speed > 4
      ? Math.max(-0.55, Math.min(0.55, Math.atan(yaw * VIS_WHEELBASE / Math.max(speed, 30)) * Math.sign(fwd || 1)))
      : (e._visSteer || 0);                  // parked: wheels stay where they were left
    e._visSteer = (e._visSteer || 0) + (steerTarget - (e._visSteer || 0)) * (1 - Math.exp(-10 * dt));
    const leanTarget  = Math.max(-1.3, Math.min(1.3, (yaw * fwd) / CORNER_GRIP));
    const pitchTarget = Math.max(-1.3, Math.min(1.3, -longG / 420));
    const h = dt / 2;
    for (let i = 0; i < 2; i++) {
      e._visLeanV  = (e._visLeanV  || 0) + (VIS_SPRING * (leanTarget  - (e._visLean  || 0)) - VIS_DAMP * (e._visLeanV  || 0)) * h;
      e._visLean   = Math.max(-1.6, Math.min(1.6, (e._visLean  || 0) + e._visLeanV * h));
      e._visPitchV = (e._visPitchV || 0) + (VIS_SPRING * (pitchTarget - (e._visPitch || 0)) - VIS_DAMP * (e._visPitchV || 0)) * h;
      e._visPitch  = Math.max(-1.6, Math.min(1.6, (e._visPitch || 0) + e._visPitchV * h));
    }

    // ── Smoke and dust ──
    // Left where they were made rather than carried along with the truck:
    // a trail falling behind is what tells the eye it's actually moving.
    const fxs = e._fx || (e._fx = []);
    for (let i = fxs.length - 1; i >= 0; i--) {
      const q = fxs[i];
      q.a += dt;
      if (q.a >= q.l) { fxs[i] = fxs[fxs.length - 1]; fxs.pop(); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      q.vx *= 1 - Math.min(1, 2.5 * dt); q.vy *= 1 - Math.min(1, 2.5 * dt);
    }
    if (typeof GfxQuality !== 'undefined' && GfxQuality.level && GfxQuality.level() === 0) return;
    const driven = _driven === e;
    const running = (driven || e._patrolling || e._haulState || e._refuelTarget) && (e._fuel ?? 1) > 0;
    if (!running) return;
    const cx = e._wx + TILE / 2, cy = e._wy + TILE * 1.5;
    const ca = Math.cos(e._angle), sa = Math.sin(e._angle);
    const emit = (lx, ly, q) => {
      if (fxs.length >= FX_MAX) return;
      q.x = cx + lx * ca - ly * sa; q.y = cy + lx * sa + ly * ca; q.a = 0;
      fxs.push(q);
    };
    // Exhaust: a lazy puff at idle, a thick dark plume while it's pulling.
    const throttle = (driven || e._patrolling) ? (e._throttle || 0) : 0;
    e._fxSmoke = (e._fxSmoke || 0) + (2.5 + 16 * throttle) * dt;
    while (e._fxSmoke >= 1) {
      e._fxSmoke -= 1;
      const side = Math.random() < 0.5 ? -1 : 1;
      emit(side * 15, -28.5, {
        k: 0, l: 0.7 + Math.random() * 0.6 + throttle * 0.4, r: 1.6 + throttle * 1.4, g: 4 + throttle * 7, s: throttle,
        vx: (e._vx || 0) * 0.25 + (Math.random() - 0.5) * 14 + 6, vy: (e._vy || 0) * 0.25 + (Math.random() - 0.5) * 14 - 5,
      });
    }
    // Dust off the back wheels, away from a road.
    if (speed > 60) {
      if (!(t - e._fxRoadT < 0.3)) {
        e._fxRoadT = t;
        const c = Math.floor(cx / TILE), r = Math.floor(cy / TILE);
        e._fxOffRoad = true;
        for (const o of EntityRegistry.getInTileRect(c, r, c, r)) if (o.type === T.ROAD) { e._fxOffRoad = false; break; }
      }
      if (e._fxOffRoad) {
        e._fxDust = (e._fxDust || 0) + Math.min(9, speed / 28) * dt;
        while (e._fxDust >= 1) {
          e._fxDust -= 1;
          emit((Math.random() < 0.5 ? -1 : 1) * 16, 34 + Math.random() * 16, {
            k: 1, l: 0.6 + Math.random() * 0.5, r: 2.2, g: 9 + speed * 0.02, s: Math.min(1, speed / 280),
            vx: (e._vx || 0) * 0.12 + (Math.random() - 0.5) * 16, vy: (e._vy || 0) * 0.12 + (Math.random() - 0.5) * 16,
          });
        }
      }
    }
  }

  // kind 1 = dust (drawn under the truck), kind 0 = exhaust (over it).
  function _drawFx(ctx, cam, e, kind) {
    const fxs = e._fx;
    if (!fxs || !fxs.length) return;
    const z = cam.zoom;
    for (const q of fxs) {
      if (q.k !== kind) continue;
      const u = q.a / q.l;
      const alpha = (kind ? 0.2 + 0.12 * q.s : 0.2 + 0.2 * q.s) * (1 - u) * Math.min(1, q.a * 12);
      const shade = kind ? '168,146,110' : q.s > 0.5 ? '58,56,54' : '120,120,120';
      ctx.fillStyle = `rgba(${shade},${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc((q.x - cam.x) * z, (q.y - cam.y) * z, (q.r + q.g * u) * z, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function _truckCenter(e) {
    return { x: e._wx + TILE / 2, y: e._wy + TILE * 1.5 };
  }

  // True if world point (ax, ay) is within range and inside truck b's
  // forward-facing cone — i.e. b is on a collision course toward it.
  function _isAheadOf(b, ax, ay) {
    const c = _truckCenter(b);
    const dx = ax - c.x, dy = ay - c.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > TRUCK_AVOID_RADIUS || dist < 1) return false;
    const fwdX = Math.sin(b._angle), fwdY = -Math.cos(b._angle);
    return (dx * fwdX + dy * fwdY) / dist > TRUCK_AHEAD_DOT;
  }

  // How fast patrol truck `e` may go given the trucks ahead of it: Infinity
  // with a clear road, down to 0 at FOLLOW_GAP behind one it has to give way
  // to. Following a truck going the same way, it settles to that truck's
  // speed and keeps the gap, instead of stop-starting along behind it.
  // Deterministic per pair so a conflict never leaves both trucks frozen
  // or both barreling through each other:
  //   - e always yields to the player-driven truck
  //   - "one-way" conflicts (e is closing in on a truck that doesn't see e
  //     as ahead of IT — approaching from behind or the side) — e yields
  //   - head-on conflicts (each sees the other ahead) — the later-spawned
  //     truck (higher _tid) yields, so priority is stable frame to frame
  // A truck that is stopped and has no reason to move off: parked or
  // standing by between jobs, part-way through a load, unload or refuel, or
  // out of fuel. Waiting for one of these to clear the way is waiting for
  // nothing (an idle Hauler sits beside the very storage the next one is
  // heading for), so patrol trucks drive past them rather than brake.
  function _holdingStill(o) {
    if (TruckSystem.isDriven(o)) return false;
    return !o._patrolling || !!o._haulState || !!o._refuelTarget || (o._fuel ?? 1) <= 0 || _beingFuelled(o);
  }
  // A Hauler is pumping fuel into this truck where it ran dry (HaulSystem).
  // Read off the Hauler, so a Hauler scrapped mid-pump can't leave it frozen.
  function _beingFuelled(o) {
    const h = o._fuelledBy;
    return !!h && h._haulState === 'fuelling' && h._haulTarget === o;
  }

  function _yieldCap(e) {
    if (e._tid === undefined) e._tid = _nextTruckId++;
    const ec = _truckCenter(e);
    const eh = { x: Math.sin(e._angle), y: -Math.cos(e._angle) };
    let cap = Infinity;
    for (const other of EntityRegistry.getByType(T.TRUCK)) {
      if (other === e) continue;
      if (_holdingStill(other)) continue;
      _initWorldPos(other);
      const oc = _truckCenter(other);
      if (!_isAheadOf(e, oc.x, oc.y)) continue;

      if (!TruckSystem.isDriven(other)) {
        if (other._tid === undefined) other._tid = _nextTruckId++;
        if (_isAheadOf(other, ec.x, ec.y)) {
          // Oncoming (near-opposite headings): neither stops — both keep right
          // and pass (_avoidOffset). Stopping one here just parked it in the
          // other's path, which then drove straight through it.
          if (eh.x * Math.sin(other._angle) + eh.y * -Math.cos(other._angle) < -0.5) continue;
          if (e._tid < other._tid) continue;
        }
      }
      const gap = Math.hypot(oc.x - ec.x, oc.y - ec.y) - FOLLOW_GAP;
      const lead = Math.max(0, (other._vx || 0) * eh.x + (other._vy || 0) * eh.y);   // how fast it is drawing away
      cap = Math.min(cap, gap <= 0 ? lead * 0.8 : lead + Math.sqrt(2 * PATROL_BRAKE_HARD * gap));
    }
    return cap;
  }

  // ── Steering round other trucks ──
  // Braking (above) handles following and crossing. Two cases need the
  // truck to steer instead: an oncoming truck on the same line (both keep
  // RIGHT, so they agree on a side without talking), and a truck standing
  // in the way — parked, loading, or stopped to yield (pass on whichever
  // side it is already further from). Measured against the direction to
  // the current waypoint (dir), not the truck's heading, so the swerve
  // doesn't feed back into itself. Returns the sideways shift still needed
  // (px, + = right of dir) and whether to ease off.
  const AVOID_LOOKAHEAD = TILE * 8;     // how far ahead an obstacle is noticed
  const AVOID_CLEAR     = TILE * 1.7;   // centre-to-centre gap to pass with (trucks are 1 tile wide)
  const AVOID_MAX       = TILE * 2.5;   // never swerve further than this off the line
  function _avoidOffset(e, cx, cy, dirX, dirY, distToTarget) {
    const rX = -dirY, rY = dirX;        // right of dir (screen y points down)
    let best = null;
    for (const o of EntityRegistry.getByType(T.TRUCK)) {
      if (o === e) continue;
      _initWorldPos(o);
      const oc = _truckCenter(o);
      const relX = oc.x - cx, relY = oc.y - cy;
      const along = relX * dirX + relY * dirY;
      if (along <= TILE * 0.5 || along > AVOID_LOOKAHEAD) continue;
      // A truck parked at the very stop this one is heading for is where
      // it's going, not something to drive round.
      if (along > distToTarget - TILE * 2) continue;
      const lat = relX * rX + relY * rY;
      if (Math.abs(lat) >= AVOID_CLEAR) continue;
      const oSpd = Math.hypot(o._vx || 0, o._vy || 0);
      const oDot = dirX * Math.sin(o._angle) + dirY * -Math.cos(o._angle);
      const oncoming = oSpd > 20 && oDot < -0.3;
      const standing = oSpd <= 20 || _holdingStill(o) || o._truckYielding;
      if (!oncoming && !standing) continue;   // moving the same way or across: braking handles it
      // Shift so the other ends up AVOID_CLEAR to one side. Oncoming: always
      // pass it on our left (we move right). Standing: go round the near side.
      const off = oncoming || lat < 0 ? lat + AVOID_CLEAR : lat - AVOID_CLEAR;
      if (!best || along < best.along) best = { along, off, oncoming };
    }
    if (!best) return null;
    return { off: Math.max(-AVOID_MAX, Math.min(AVOID_MAX, best.off)), slow: best.oncoming && best.along < TILE * 5 };
  }

  // ── Parking bays ──
  // Two trucks sent to the same stop (two Waste Trucks to one facility, two
  // Haulers to one store) used to park on the same spot, one exactly on top
  // of the other: the avoidance above deliberately ignores a truck standing
  // at the stop this one is making for. Now, closing on its stop, a truck
  // that finds another already standing there takes the nearest free bay
  // beside it instead: the stop moved sideways (across the line it came in
  // on), a truck's width and a bit at a time, to a spot no other truck holds
  // and its box fits. Docking is by proximity to the building (HaulSystem),
  // so a bay beside the first truck is as good a place to load as the first.
  const BAY_STEP  = TILE * 1.35;   // centre to centre, side by side
  const BAY_CLAIM = TILE * 6;      // how far out it looks at its stop
  const BAY_HELD  = TILE * 1.2;    // another truck this near a spot holds it
  function _bayHeld(e, x, y) {
    for (const o of EntityRegistry.getByType(T.TRUCK)) {
      if (o === e) continue;
      _initWorldPos(o);
      const c = _truckCenter(o);
      if (Math.hypot(c.x - x, c.y - y) >= BAY_HELD) continue;
      // Standing there, or itself pulling up to that very spot.
      const spd = Math.hypot(o._vx || 0, o._vy || 0);
      if (spd < 25 || _holdingStill(o)) return true;
    }
    // ...or the stop another truck is making for.
    for (const o of EntityRegistry.getByType(T.TRUCK)) {
      if (o === e || !o._patrolling || !o._autoDispatch || !o._path || o._path.length < 2) continue;
      const g = o._path[o._path.length - 1];
      if (Math.hypot(g.wx - x, g.wy - y) < BAY_HELD && _truckDistTo(o, g) < Math.hypot(_truckCenter(e).x - x, _truckCenter(e).y - y)) return true;
    }
    return false;
  }
  const _truckDistTo = (o, g) => { const c = _truckCenter(o); return Math.hypot(c.x - g.wx, c.y - g.wy); };
  function _claimBay(e) {
    const n = e._path.length, end = e._path[n - 1], prev = e._path[n - 2];
    if (!_bayHeld(e, end.wx, end.wy)) return;
    let dx = end.wx - prev.wx, dy = end.wy - prev.wy;
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const px = -dy, py = dx;                      // across the line it came in on
    const home = e._bayHome || end;               // the stop it was sent to, before any bay
    for (const k of [1, -1, 2, -2, 3, -3, 4, -4]) {
      const x = home.wx + px * BAY_STEP * k, y = home.wy + py * BAY_STEP * k;
      if (x < TILE || y < TILE * 2 || x > (COLS - 1) * TILE || y > (ROWS - 2) * TILE) continue;
      if (_bayHeld(e, x, y)) continue;
      if (_embeddedAt(e, x - TILE / 2, y - TILE * 1.5)) continue;
      e._bayHome = home;
      e._path = e._path.slice(0, -1).concat([{ ...end, wx: x, wy: y }]);
      return;
    }
  }

  // ── Never on top of each other ──
  // Whatever the steering does, two trucks are never left overlapping: after
  // every step, any pair whose bodies (a truck-length capsule each) are
  // closer than a truck's width is pushed apart along the line between them.
  // A truck standing still (parked, loading, refuelling) holds its ground and
  // the moving one is shifted; two moving trucks share it. A shift that would
  // put a truck into a building is undone by the building collision after it.
  const SEP_R = TILE * 0.55, SEP_HALF = TILE * 1.1;   // capsule radius and half-length
  function _capsule(o) {
    const c = _truckCenter(o), fx = Math.sin(o._angle || 0), fy = -Math.cos(o._angle || 0);
    return { ax: c.x - fx * SEP_HALF, ay: c.y - fy * SEP_HALF, bx: c.x + fx * SEP_HALF, by: c.y + fy * SEP_HALF };
  }
  // Closest points between segments p1-q1 and p2-q2 (Ericson's method).
  function _segSeg(a, b) {
    const d1x = a.bx - a.ax, d1y = a.by - a.ay, d2x = b.bx - b.ax, d2y = b.by - b.ay;
    const rx = a.ax - b.ax, ry = a.ay - b.ay;
    const A = d1x * d1x + d1y * d1y, E = d2x * d2x + d2y * d2y, F = d2x * rx + d2y * ry;
    const C = d1x * rx + d1y * ry, B = d1x * d2x + d1y * d2y, den = A * E - B * B;
    let s = den > 1e-6 ? Math.max(0, Math.min(1, (B * F - C * E) / den)) : 0;
    let t = (B * s + F) / E;
    if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -C / A)); }
    else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (B - C) / A)); }
    return { x1: a.ax + d1x * s, y1: a.ay + d1y * s, x2: b.ax + d2x * t, y2: b.ay + d2y * t };
  }
  function _separateTrucks() {
    const list = [...EntityRegistry.getByType(T.TRUCK)];
    if (list.length < 2) return;
    const before = new Map();
    for (const o of list) { _initWorldPos(o); before.set(o, [o._wx, o._wy, o.col, o.row]); }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const ca = _truckCenter(a), cb = _truckCenter(b);
        if (Math.abs(ca.x - cb.x) > TILE * 3.5 || Math.abs(ca.y - cb.y) > TILE * 3.5) continue;
        const p = _segSeg(_capsule(a), _capsule(b));
        let nx = p.x1 - p.x2, ny = p.y1 - p.y2, dist = Math.hypot(nx, ny);
        const need = SEP_R * 2 - dist;
        if (need <= 0) continue;
        if (dist < 0.01) {                                    // exactly on top: part them sideways
          nx = Math.cos(a._angle || 0); ny = Math.sin(a._angle || 0); dist = 1;
          if (a._tid !== undefined && b._tid !== undefined && a._tid < b._tid) { nx = -nx; ny = -ny; }
        } else { nx /= dist; ny /= dist; }
        const aStill = _holdingStill(a) && !TruckSystem.isDriven(a), bStill = _holdingStill(b) && !TruckSystem.isDriven(b);
        const ka = aStill && !bStill ? 0 : !aStill && bStill ? 1 : 0.5, kb = 1 - ka;
        a._wx += nx * need * ka; a._wy += ny * need * ka;
        b._wx -= nx * need * kb; b._wy -= ny * need * kb;
        // Take the speed out of the push, so they don't keep driving in.
        for (const [o, s] of [[a, 1], [b, -1]]) {
          const vn = (o._vx || 0) * nx * s + (o._vy || 0) * ny * s;
          if (vn < 0) { o._vx -= nx * s * vn; o._vy -= ny * s * vn; }
        }
      }
    }
    // Only the trucks actually shifted: back out of any building it put them
    // in, and onto their new tile (patrolling trucks aren't stamped on the
    // grid; a parked or driven one is, and is re-stamped like any move).
    for (const o of list) {
      const [wx, wy, pc, pr] = before.get(o);
      if (Math.abs(o._wx - wx) < 0.01 && Math.abs(o._wy - wy) < 0.01) continue;
      _resolveCollision(o);
      o._wx = Math.max(0, Math.min((COLS - 1) * TILE, o._wx));
      o._wy = Math.max(0, Math.min((ROWS - 1) * TILE, o._wy));
      _restampAfterMove(o, pc, pr, !!o._patrolling && !TruckSystem.isDriven(o));
    }
  }

  // ── Following a truck with the camera ──
  // Easing the view toward the truck's position leaves it trailing by
  // speed / rate, and how far it trails depends on the length of each frame
  // — so every uneven frame moved the truck on screen, a couple of pixels
  // at cruise, which read as the truck shaking. Instead the view rides
  // along at the truck's own velocity (no trail to vary) and only the
  // difference left over is eased out: steering corrections, the swing
  // of the body about its back axle, a shove from a collision. On top of
  // that it leans a little way ahead of the truck, so there is more road
  // in view in front than behind; the lean swings round slowly in a bend.
  const FOLLOW_LEAD      = 0.15;   // seconds of travel the view looks ahead
  const FOLLOW_LEAD_RATE = 1.6;    // s⁻¹ — how fast the lead settles
  const _fol = { e: null, x: 0, y: 0, lx: 0, ly: 0 };
  function _followCam(e, dt, simDt, rate) {
    const cx = e._wx + TILE / 2, cy = e._wy + TILE * 1.5;
    const moving = _driven === e || !!e._patrolling;
    const vx = moving ? (e._vx || 0) : 0, vy = moving ? (e._vy || 0) : 0;
    if (_fol.e !== e) {
      // Start from where the view already is, so picking a truck glides to it.
      _fol.e = e; _fol.lx = 0; _fol.ly = 0;
      _fol.x = Camera.x + window.innerWidth / Camera.zoom / 2;
      _fol.y = Camera.y + window.innerHeight / Camera.zoom / 2;
    }
    _fol.x += vx * simDt; _fol.y += vy * simDt;
    const a = 1 - Math.exp(-rate * dt);
    _fol.x += (cx - _fol.x) * a; _fol.y += (cy - _fol.y) * a;
    const b = 1 - Math.exp(-FOLLOW_LEAD_RATE * dt);
    _fol.lx += (vx * FOLLOW_LEAD - _fol.lx) * b; _fol.ly += (vy * FOLLOW_LEAD - _fol.ly) * b;
    Camera.panTo(_fol.x + _fol.lx, _fol.y + _fol.ly, dt, 1e4);
  }

  // Private key set — registered on document so it always captures regardless
  // of focus state, and is not shared with camera pan logic.
  const _keys = new Set();
  document.addEventListener('keydown', e => _keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  // A release always lets go, even under a cinematic that swallows keys
  // (see InputManager's heldKeys), and so does losing focus.
  window.addEventListener('keyup', e => _keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key), true);
  window.addEventListener('blur', () => _keys.clear());

  // FRICTION (0.82) was tuned assuming one multiply per 0.1s logic tick.
  // _tickPatrol now runs in variable-size substeps (0.016/0.05/0.1s
  // depending on time scale — see frameTick), so a flat per-step multiply
  // would decay velocity at a different real-world rate depending on step
  // size, causing patrol trucks to feel jerky/inconsistent as time scale
  // changes. This rescales the decay to whatever dt is actually passed in,
  // so the effective friction-per-second stays constant.
  function _frictionFactor(dt) {
    return Math.pow(FRICTION, dt / 0.1);
  }

  function _initWorldPos(e) {
    if (e._wx    === undefined) e._wx    = e.col * TILE;
    if (e._wy    === undefined) e._wy    = e.row * TILE;
    if (e._angle === undefined) e._angle = 0;
    if (e._vx    === undefined) e._vx    = 0;
    if (e._vy    === undefined) e._vy    = 0;
  }

  // Types the truck passes through without collision (wires, poles, lamps, roads, trucks, pipes, conveyors)
  const PASSTHROUGH = new Set([T.WIRE, T.POLE, T.LAMP, T.ROAD, T.TRUCK, T.POWERTOWER, T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR, T.PROTECTOR, T.TREE, T.BUSH]);

  // Subset of PASSTHROUGH that's skipped when re-stamping the grid at the truck's
  // new tile (avoids neighbour-recalc flicker on purely cosmetic types). Pipes/
  // conveyors are deliberately NOT in this set — flow/BFS systems read the grid
  // directly, so they must stay the recorded occupant even while a truck drives
  // over them, or fluid/material flow cuts out under the truck.
  const GRID_RESTAMP_SKIP = new Set([T.WIRE, T.POLE, T.LAMP, T.ROAD, T.TRUCK, T.POWERTOWER]);

  // The box a truck collides with: its type's own footprint (1×3), standing
  // at _wx/_wy with the sprite's pivot in the middle of it. NOT e.width and
  // e.height, which record how the truck was turned when it was put down: a
  // truck placed facing east is 3×1 there, and one that had been through a
  // save was 3×3 (the load restored the width and left the height at the
  // type's 3), a box that hung two tiles out to the east of the truck. Two
  // Waste Trucks with that box drove in beside a row of generators, into
  // gaps a truck fits and the box did not, and never came out.
  const _boxW = e => (truckSpec(e).width  || 1) * TILE;
  const _boxH = e => (truckSpec(e).height || 3) * TILE;

  // Trees/bushes don't just let the truck pass through — they get flattened.
  // Checked every frame the truck moves; any overlapping tree/bush is removed outright.
  function _runOverVegetation(e) {
    const tw = _boxW(e);
    const th = _boxH(e);
    const c0 = Math.floor(e._wx / TILE), c1 = Math.floor((e._wx + tw) / TILE);
    const r0 = Math.floor(e._wy / TILE), r1 = Math.floor((e._wy + th) / TILE);
    for (const other of EntityRegistry.getInTileRect(c0, r0, c1, r1)) {
      if (other.type !== T.TREE && other.type !== T.BUSH) continue;
      const ow = (other.width  || 1) * TILE;
      const oh = (other.height || 1) * TILE;
      const ox = other.col * TILE;
      const oy = other.row * TILE;
      if (e._wx + tw <= ox || ox + ow <= e._wx || e._wy + th <= oy || oy + oh <= e._wy) continue;
      GridManager.removeEntityFootprint(other);
      EntityRegistry.remove(other);
    }
  }

  // Resolve AABB collisions between the truck and all solid entities.
  // Mutates e._wx, e._wy, e._vx, e._vy in place.
  // Everything solid the truck's box would touch with its corner at (wx, wy).
  function _solidsAt(e, wx, wy) {
    const tw = _boxW(e), th = _boxH(e);
    const c0 = Math.floor(wx / TILE), c1 = Math.floor((wx + tw) / TILE);
    const r0 = Math.floor(wy / TILE), r1 = Math.floor((wy + th) / TILE);

    // A bridge is a road, so it's passed through, but its outer edge tiles
    // are truss and parapet (WaterBuild.railAt): solid, one tile at a time.
    const _rails = [];
    for (const other of EntityRegistry.getInTileRect(c0, r0, c1, r1)) {
      if (other === e) continue;
      if (other._bridge) {
        for (let rr = r0; rr <= r1; rr++) for (let cc = c0; cc <= c1; cc++)
          if (WaterBuild.railAt(other, cc, rr)) _rails.push({ col: cc, row: rr, width: 1, height: 1 });
        continue;
      }
      if (PASSTHROUGH.has(other.type)) continue;
      _rails.push(other);
    }
    return _rails;
  }

  // Is the box, with its corner at (wx, wy), inside something solid?
  function _embeddedAt(e, wx, wy) {
    const tw = _boxW(e), th = _boxH(e), EPS = 0.5;
    for (const o of _solidsAt(e, wx, wy)) {
      const ox = o.col * TILE, oy = o.row * TILE, ow = (o.width || 1) * TILE, oh = (o.height || 1) * TILE;
      if (wx + tw > ox + EPS && ox + ow > wx + EPS && wy + th > oy + EPS && oy + oh > wy + EPS) return true;
    }
    return false;
  }

  // The nearest spot the box stands clear of everything, searched outward a
  // quarter-tile at a time to four tiles. For a truck that is INSIDE
  // something (a building put down on it, a box that changed size under
  // it, a gap it was pushed into): _resolveCollision can only shove it out
  // of one thing at a time, and between two it is shoved back and forth
  // forever. Returns { x, y } or null.
  function _nearestClear(e) {
    const STEP = TILE / 4, MAX = 16;
    for (let ring = 1; ring <= MAX; ring++) {
      let best = null, bd = Infinity;
      for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = e._wx + dx * STEP, y = e._wy + dy * STEP;
        if (x < 0 || y < 0 || x > (COLS - 1) * TILE || y > (ROWS - 1) * TILE) continue;
        const d = dx * dx + dy * dy;
        if (d < bd && !_embeddedAt(e, x, y)) { bd = d; best = { x, y }; }
      }
      if (best) return best;
    }
    return null;
  }

  const CORNER_SLIP = TILE * 0.3;   // px of overlap with a corner the box slides off rather than stops at
  function _resolveCollision(e) {
    const tw = _boxW(e);
    const th = _boxH(e);
    const _rails = _solidsAt(e, e._wx, e._wy);
    for (const other of _rails) {
      const ow = (other.width  || 1) * TILE;
      const oh = (other.height || 1) * TILE;
      const ox = other.col * TILE;
      const oy = other.row * TILE;

      // AABB overlap test
      const overlapX = (e._wx + tw) - ox;
      const overlapX2 = (ox + ow) - e._wx;
      const overlapY = (e._wy + th) - oy;
      const overlapY2 = (oy + oh) - e._wy;

      if (overlapX <= 0 || overlapX2 <= 0 || overlapY <= 0 || overlapY2 <= 0) continue;

      // Resolve along the axis of least penetration
      const minX = Math.min(overlapX, overlapX2);
      const minY = Math.min(overlapY, overlapY2);

      // Except when the box only grazes a corner while driving past it:
      // then slide off sideways instead of being stopped dead. A route
      // that runs flush along a building leaves the box no room for the
      // few pixels it wanders off the line, and a truck heading east under
      // a Gas Station's corner was pushed straight back every frame, 8 px
      // into the station's bottom row, rerouted onto the same line every
      // few seconds and never got past.
      let pushX = minX < minY;
      if (pushX && minY <= CORNER_SLIP && Math.abs(e._vx) > Math.abs(e._vy)) pushX = false;
      else if (!pushX && minX <= CORNER_SLIP && Math.abs(e._vy) > Math.abs(e._vx)) pushX = true;

      if (pushX) {
        // Push out horizontally
        if (overlapX < overlapX2) {
          e._wx -= overlapX;
        } else {
          e._wx += overlapX2;
        }
        e._vx *= -0.25; // bounce/dampen
      } else {
        // Push out vertically
        if (overlapY < overlapY2) {
          e._wy -= overlapY;
        } else {
          e._wy += overlapY2;
        }
        e._vy *= -0.25;
      }
    }
  }

  // Hands every tile still stamped with this truck back to whatever lies
  // under it (a wire, a road, a pipe), or leaves it empty. Keeps the truck
  // registered, unlike GridManager.removeEntityFootprint.
  function _releaseTiles(e) {
    const w = e.width || 1, h = e.height || 1;
    for (let r = e.row; r < e.row + h; r++)
      for (let c = e.col; c < e.col + w; c++) {
        if (!GridManager.inBounds(c, r) || GridManager.tiles[r][c] !== e) continue;
        GridManager.tiles[r][c] = null;
        for (const o of EntityRegistry.getInTileRect(c, r, c, r)) {
          if (o === e || o.type === T.TRUCK) continue;
          if (c >= o.col && c < o.col + (o.width || 1) && r >= o.row && r < o.row + (o.height || 1)) { GridManager.tiles[r][c] = o; break; }
        }
      }
  }

  // Shared grid-restamp dance used after any move that might cross a tile
  // boundary — pulled out of _moveTruck/_tickPatrol/_driveReverse since all
  // three needed the identical old-tile-restore / new-tile-claim sequence.
  function _restampAfterMove(e, prevCol, prevRow, skipGrid) {
    const newCol = Math.max(0, Math.min(COLS-1, Math.floor(e._wx / TILE)));
    const newRow = Math.max(0, Math.min(ROWS-1, Math.floor(e._wy / TILE)));
    if (skipGrid || (newCol === prevCol && newRow === prevRow)) {
      e.col = newCol; e.row = newRow;
      return;
    }
    GridManager.removeEntityFootprint(e);   // e.col/e.row still point at OLD tile here — correct
    // Restore ALL entities at old position (fixes disappearing wires/poles on departure).
    // Spatial cell-index lookup (see EntityRegistry.getInTileRect in core.js)
    // instead of scanning every entity in the city — the index tracks each
    // entity's own footprint independent of GridManager.tiles, so it still
    // finds wires/poles the truck's tiles-array write orphaned.
    const _ew = e.width || 1, _eh = e.height || 1;
    for (const _oth of EntityRegistry.getInTileRect(prevCol, prevRow, prevCol + _ew - 1, prevRow + _eh - 1)) {
      if (_oth === e) continue;
      const _ow = _oth.width || 1, _oh = _oth.height || 1;
      const _overlapC = prevCol < _oth.col + _ow && prevCol + _ew > _oth.col;
      const _overlapR = prevRow < _oth.row + _oh && prevRow + _eh > _oth.row;
      if (_overlapC && _overlapR) GridManager.setEntityFootprint(_oth);
    }
    e.col = newCol; e.row = newRow;         // now safe to move to the new tile
    GridManager.setEntityFootprint(e);
    // Restore only solid entities at new position — cosmetic passthrough entities
    // (wires/poles) are left as-is to avoid visual neighbor recalc artifacts, but
    // pipes/conveyors ARE restamped so flow/BFS systems still see them under the truck.
    for (const _oth of EntityRegistry.getInTileRect(e.col, e.row, e.col + _ew - 1, e.row + _eh - 1)) {
      if (_oth === e || GRID_RESTAMP_SKIP.has(_oth.type)) continue;
      const _ow = _oth.width || 1, _oh = _oth.height || 1;
      const _overlapC = e.col < _oth.col + _ow && e.col + _ew > _oth.col;
      const _overlapR = e.row < _oth.row + _oh && e.row + _eh > _oth.row;
      if (_overlapC && _overlapR) GridManager.setEntityFootprint(_oth);
    }
  }

  // Drains truck fuel while it's being driven/patrolling; returns false once
  // empty so movement code can withhold acceleration (truck coasts to a stop
  // via friction instead of just cutting dead).
  function _driveFuelGate(e, dt) {
    if (e._fuel === undefined) e._fuel = truckSpec(e).fuelCapacity || 100;
    if (e._fuel > 0) {
      const rate = truckSpec(e).fuelPerSec || 2;
      e._fuel = Math.max(0, e._fuel - rate * dt);
    }
    return e._fuel > 0;
  }

  function _moveTruck(e, dt) {
    const hasFuel = _driveFuelGate(e, dt);
    if (dt <= 0) return;
    if (e._fwdSpeed === undefined) e._fwdSpeed = 0; // signed speed along the truck's own facing

    let throttle = 0, brakeRev = 0, steer = 0;
    if (hasFuel) {
      if (_keys.has('w') || _keys.has('W') || _keys.has('ArrowUp'))    throttle = 1;
      if (_keys.has('s') || _keys.has('S') || _keys.has('ArrowDown'))  brakeRev = 1;
      if (_keys.has('a') || _keys.has('A') || _keys.has('ArrowLeft'))  steer -= 1;
      if (_keys.has('d') || _keys.has('D') || _keys.has('ArrowRight')) steer += 1;
    }

    // Facing (forward) and right vectors from current heading — angle 0 = up.
    const fwdX = Math.sin(e._angle), fwdY = -Math.cos(e._angle);
    const rightX = -fwdY, rightY = fwdX;

    // Decompose existing world-space velocity into forward/lateral (slip) components.
    let fwdSpeed = e._vx * fwdX + e._vy * fwdY;
    let latSpeed = e._vx * rightX + e._vy * rightY;

    // ── Longitudinal forces ──
    let longAccel = 0;
    if (throttle) {
      // Torque curve: strong off the line, tapers off approaching top speed —
      // gives the truck a heavy, gradual build-up instead of snapping to max.
      // A climb takes a share of the pull, so the truck settles to a lower
      // speed on a hill rather than being clamped down (terrain_system.js).
      const speedFrac = Math.max(0, Math.min(1, fwdSpeed / MAX_SPEED_FWD));
      const climb = TerrainSystem.climbFactor(e._wx + TILE / 2, e._wy + TILE * 1.5, fwdX, fwdY);
      longAccel += ENGINE_FORCE * climb * (1 - speedFrac * 0.85);
    }
    if (brakeRev) {
      if (fwdSpeed > 15) {
        longAccel -= BRAKE_FORCE; // braking while still rolling forward
      } else {
        // Reverse gear — slower and less powerful than driving forward.
        const revFrac = Math.max(0, Math.min(1, -fwdSpeed / MAX_SPEED_REV));
        longAccel -= ENGINE_FORCE * 0.55 * (1 - revFrac * 0.85);
      }
    }
    fwdSpeed += longAccel * dt;

    // Rolling resistance (frame-rate independent exponential decay) + quadratic
    // air drag that bites harder the faster you're going — natural coast-down.
    fwdSpeed *= Math.exp(-ROLL_RESIST * dt);
    fwdSpeed -= Math.sign(fwdSpeed) * DRAG_COEF * fwdSpeed * fwdSpeed * dt;
    fwdSpeed = Math.max(-MAX_SPEED_REV, Math.min(MAX_SPEED_FWD, fwdSpeed));
    if (!throttle && !brakeRev && Math.abs(fwdSpeed) < 3) fwdSpeed = 0;

    // Lateral tire grip — sideways slip bleeds off toward zero rather than
    // vanishing instantly, so hard turns at speed carry a touch of real drift
    // before the tires "catch" and pull the truck back in line.
    latSpeed *= Math.exp(-LATERAL_GRIP * dt);

    // Steering: turn rate ramps up with speed (crawling barely turns, cruising
    // turns fully) and reverses sense in reverse gear, like backing up a real truck.
    if (steer !== 0 && Math.abs(fwdSpeed) > MIN_TURN_SPEED) {
      const speedFactor = Math.min(1, Math.abs(fwdSpeed) / FULL_TURN_SPEED);
      const gearDir = fwdSpeed >= 0 ? 1 : -1;
      const prevAngle = e._angle;
      e._angle += gearDir * steer * STEER_RATE * speedFactor * dt;
      _pivotAboutRear(e, prevAngle, DRIVE_PIVOT_BACK);
    }
    e._braking = !!brakeRev && fwdSpeed > 15;
    e._signal = Math.abs(fwdSpeed) > MIN_TURN_SPEED ? steer : 0;
    e._throttle = throttle ? 1 - 0.6 * Math.max(0, Math.min(1, fwdSpeed / MAX_SPEED_FWD)) : (brakeRev && !e._braking) ? 0.6 : 0;

    e._fwdSpeed = fwdSpeed;

    // Recompose world-space velocity from the (possibly just-turned) heading.
    const fwdX2 = Math.sin(e._angle), fwdY2 = -Math.cos(e._angle);
    const rightX2 = -fwdY2, rightY2 = fwdX2;
    e._vx = fwdSpeed * fwdX2 + latSpeed * rightX2;
    e._vy = fwdSpeed * fwdY2 + latSpeed * rightY2;

    const prevCol = e.col, prevRow = e.row;
    e._wx += e._vx * dt;
    e._wy += e._vy * dt;
    e._wx = Math.max(0, Math.min((COLS-1)*TILE, e._wx));
    e._wy = Math.max(0, Math.min((ROWS-1)*TILE, e._wy));
    _resolveCollision(e);
    e._wx = Math.max(0, Math.min((COLS-1)*TILE, e._wx));
    e._wy = Math.max(0, Math.min((ROWS-1)*TILE, e._wy));
    _runOverVegetation(e);

    _restampAfterMove(e, prevCol, prevRow, false);
  }

  // Backs the truck straight out along its current facing — no waypoint
  // steering at all — used to un-wedge it from a collision (see the stuck-
  // detection block in _tickPatrol below). Slower and simpler than normal
  // patrol driving since all it needs to do is clear the obstacle, not
  // navigate anywhere in particular.
  function _driveReverse(e, dt, skipGrid) {
    // Defense-in-depth: the stuck-detection check in _tickPatrol already
    // skips triggering recovery while out of fuel, but guard here too in
    // case fuel runs out mid-reversal — no fuel means no thrust, forward or
    // back, same as normal driving.
    const hasFuel = _driveFuelGate(e, dt);
    const ax = hasFuel ? -Math.sin(e._angle) * REVERSE_ACCEL : 0;
    const ay = hasFuel ?  Math.cos(e._angle) * REVERSE_ACCEL : 0;
    e._vx += ax * dt;
    e._vy += ay * dt;
    const fric = _frictionFactor(dt);
    e._vx *= fric; e._vy *= fric;
    const spd = Math.sqrt(e._vx*e._vx + e._vy*e._vy);
    if (spd > REVERSE_MAX_SPEED) { e._vx = e._vx/spd*REVERSE_MAX_SPEED; e._vy = e._vy/spd*REVERSE_MAX_SPEED; }

    const prevCol = e.col, prevRow = e.row;
    e._wx += e._vx * dt;
    e._wy += e._vy * dt;
    e._wx = Math.max(0, Math.min((COLS-1)*TILE, e._wx));
    e._wy = Math.max(0, Math.min((ROWS-1)*TILE, e._wy));
    _resolveCollision(e);
    e._wx = Math.max(0, Math.min((COLS-1)*TILE, e._wx));
    e._wy = Math.max(0, Math.min((ROWS-1)*TILE, e._wy));
    _runOverVegetation(e);
    _restampAfterMove(e, prevCol, prevRow, skipGrid);
  }

  return {
    frameTick(dt, keys) {
      const ts = (typeof DevMode !== 'undefined' && DevMode.timeScale != null) ? DevMode.timeScale : 1;
      const scaledDt = dt * ts;
      if (_driven) {
        _moveTruck(_driven, ts === 0 ? 0 : dt);
        _followCam(_driven, dt, ts === 0 ? 0 : dt, 8);
      }
      const safeDt = (isFinite(scaledDt) && scaledDt > 0) ? Math.min(scaledDt, 0.5) : 0;
      for (const trk of EntityRegistry.getByType(T.TRUCK)) {
        if (trk === _driven) continue;
        if (!trk._patrolling) continue;
        // At high time scales use fewer, larger steps to keep CPU budget sane.
        // Physics stays stable because SPEED/ACCEL are well-behaved at 50ms steps.
        const _maxStep = ts <= 2 ? 0.016 : ts <= 5 ? 0.05 : 0.1;
        const _maxSteps = Math.ceil(safeDt / _maxStep) + 1;
        let rem = safeDt;
        let steps = 0;
        while (rem > 0.0001 && steps < _maxSteps) {
          const step = Math.min(rem, _maxStep);
          TruckSystem._tickPatrol(trk, step, true);
          rem -= step;
          steps++;
        }
        trk.col = Math.max(0, Math.min(COLS-1, Math.floor(trk._wx / TILE)));
        trk.row = Math.max(0, Math.min(ROWS-1, Math.floor(trk._wy / TILE)));
      }
      // No two trucks left overlapping (see _separateTrucks). Only while time
      // runs: a paused game holds everything where it is.
      if (safeDt > 0 || (_driven && ts !== 0)) _separateTrucks();
      if (!_driven && _focused) {
        // Patrol-panel Focus. Driving does its own follow above, so this only
        // runs when nothing is being driven. Focus is dropped — rather than
        // fought with — if the truck is gone from the map (the camera would
        // otherwise stay pinned to wherever it died) or the player has panned.
        //
        // Runs AFTER the patrol step so the camera chases where the truck is
        // this frame, not where it was last frame (a one-frame lag that
        // varied with frame time and read as jitter). See _followCam.
        if (!EntityRegistry.getByType(T.TRUCK).has(_focused)
            || Camera.manualPanSeq() !== _focusPanSeq) {
          _focused = null;
        } else {
          _initWorldPos(_focused);
          _followCam(_focused, dt, safeDt, 4);
        }
      }
      if (!_driven && !_focused) _fol.e = null;
    },

    handleClick(entity) {
      if (!entity || entity.type !== T.TRUCK) return false;
      const now = performance.now();
      if (_lastClickEntity === entity && now - _lastClickTime < DBLCLICK_MS) {
        if (_driven === entity) {
          _driven = null;
          showToast('🚛 Truck parked', '#60a020', '#080e00', '#204010');
        } else {
          _initWorldPos(entity);
          _driven = entity;
          showToast((window.GW_MOBILE ? '🚛 Driving: use the pads · double-tap the truck to park' : '🚛 Driving: WASD to move · double-click to park'), '#80c040', '#080e00', '#204010');
        }
        _lastClickEntity = null; _lastClickTime = 0;
        return true;
      }
      _lastClickEntity = entity; _lastClickTime = now;
      return false;
    },

    isDriven(e)  { return _driven === e; },
    getDriven()  { return _driven; },
    stopDriving(){ _driven = null; },

    // Camera follow, driven by the patrol panel's Focus button. Re-reading
    // manualPanSeq here is what makes a fresh Focus click stick after an
    // earlier follow was released by a pan.
    setFocus(e) {
      _focused = e || null;
      _focusPanSeq = Camera.manualPanSeq();
      // Snap to the truck once, right now, instead of waiting for the
      // per-frame follow in frameTick() — that is skipped entirely while the
      // game is paused (game_loop.js gates it on DevMode.timeScale), so
      // pausing, then hitting Focus, used to look like the button did
      // nothing at all. recentreOn() eases from Camera.keyboardTick(), which
      // the loop runs unconditionally, so the view arrives either way.
      // jumpTo() cuts rather than eases: Focus is "show me this truck",
      // not a fly-over of everything between here and there.
      if (_focused) {
        _initWorldPos(_focused);
        Camera.jumpTo(_focused._wx + TILE / 2, _focused._wy + TILE * 1.5);
      }
    },
    clearFocus()  { _focused = null; },
    isFocused(e)  { return !!e && _focused === e; },
    getFocused()  { return _focused; },
    initWorldPos: _initWorldPos,

    // Sets a truck down somewhere else: dropped there by a drag, or put back
    // by undoing one. Tiles it was stamped on go back to whatever lies under
    // them (a truck driven by hand claims the tiles it stops on, see
    // _restampAfterMove), but it stays registered and isn't stamped where it
    // lands. GridManager.removeEntityFootprint hands the tiles back too, but
    // it also unregisters the truck: the drop used to call it and nothing
    // after, so every truck dragged anywhere was deleted outright, its panel
    // left open on nothing. Not unregistering also keeps the truck's place in
    // the fleet, and with it its "Hauler N" number.
    relocate(e, col, row) {
      _releaseTiles(e);
      e.col = Math.max(0, Math.min(COLS - 1, col));
      e.row = Math.max(0, Math.min(ROWS - 1, row));
      e._wx = e.col * TILE; e._wy = e.row * TILE;
      e._vx = 0; e._vy = 0; e._fwdSpeed = 0;
      e._trk = null;   // re-lay the track from where it now stands
    },
    // Exposed for TruckRouting — a route's obstacle grid must treat exactly
    // the same set of types as drivable-through that actual truck movement does.
    isPassthrough(type) { return PASSTHROUGH.has(type); },

    setPath(e, waypoints) {
      // Decimate: keep only waypoints at least 1 tile apart
      const MIN_DIST = TILE;
      const decimated = [waypoints[0]];
      for (let i = 1; i < waypoints.length; i++) {
        const last = decimated[decimated.length - 1];
        const dx = waypoints[i].wx - last.wx;
        const dy = waypoints[i].wy - last.wy;
        if (Math.sqrt(dx*dx + dy*dy) >= MIN_DIST) decimated.push(waypoints[i]);
      }
      e._path       = decimated;
      e._patrolIdx  = 0;
      e._patrolling = false;
      e._bayHome    = null;   // a new stop: any bay taken at the last one doesn't apply
    },

    clearPath(e) {
      e._path       = null;
      e._patrolIdx  = 0;
      e._patrolling = false;
    },

    startPatrol(e) {
      if (!e._path || e._path.length < 2) return;
      if (_driven === e) _driven = null;
      // A patrol runs off the grid (skipGrid), so tiles this truck claimed
      // when it was last driven by hand would never be handed back.
      _releaseTiles(e);
      e._patrolling = true;
      // Resume from wherever the truck left off (stopPatrol doesn't touch
      // _patrolIdx). Only reset to the start if there's no valid index yet —
      // i.e. this is a fresh path or the index somehow fell out of range.
      if (e._patrolIdx == null || e._patrolIdx < 0 || e._patrolIdx >= e._path.length) {
        e._patrolIdx = 0;
      }
    },

    // Stopped where it stands: a truck that isn't being stepped doesn't move,
    // so it mustn't keep a speed for the lights and engine note to read.
    stopPatrol(e)   { e._patrolling = false; e._signal = 0; e._vx = 0; e._vy = 0; },

    // Trucks aren't in NUMBERED_ENTITY_TYPES (they move, so a stable _num
    // tied to a grid slot would be misleading), but the UI still needs to
    // tell one from another. A name the player typed wins; otherwise they're
    // numbered by registry order, which is what the Trucks roster has always
    // displayed — this is the single source of truth so the roster and the
    // patrol panel can't disagree.
    //
    // The fallback number is positional, so it can shift when a truck is
    // added, removed or the registry is rebuilt on load. That's exactly why
    // naming exists: a named truck keeps its name across all of that.
    displayName(e) {
      if (e && e._name) return e._name;
      // Trucks and Haulers are numbered separately, each in its own run.
      const hauler = !!(e && e._hauler), word = hauler ? 'Hauler' : 'Waste Truck';
      let i = 1;
      for (const trk of EntityRegistry.getByType(T.TRUCK)) {
        if (!!trk._hauler !== hauler) continue;
        if (trk === e) return `${word} ${i}`;
        i++;
      }
      return word;
    },

    // Longest name the UI can show without the panel header wrapping.
    MAX_NAME_LEN: 24,

    // Sets a truck's name. Blank (or whitespace-only) clears it, which puts
    // the truck back on the positional "Waste Truck N" fallback rather than
    // leaving it with an empty label.
    setName(e, name) {
      if (!e) return;
      const clean = String(name == null ? '' : name).trim().slice(0, this.MAX_NAME_LEN);
      if (clean) e._name = clean;
      else delete e._name;
    },
    isPatrolling(e) { return !!e._patrolling; },
    hasPath(e)      { return !!(e._path && e._path.length >= 2); },

    _tickPatrol(e, dt, skipGrid = false) {
      if (!e._patrolling || !e._path || e._path.length < 2) return;
      _initWorldPos(e);

      // Guard: clamp patrolIdx in case it's out of range after load
      if (e._patrolIdx < 0 || e._patrolIdx >= e._path.length) e._patrolIdx = 0;

      // Guard: abort if truck position is NaN
      if (!isFinite(e._wx) || !isFinite(e._wy)) {
        console.error('[truck] NaN position: resetting');
        e._wx = e.col * TILE; e._wy = e.row * TILE;
        e._vx = 0; e._vy = 0;
        return;
      }

      // Recovering from a stuck collision — reverse straight out, ignoring
      // waypoint steering entirely until the timer runs out. Once it clears,
      // _needsReroute stays set for TruckDispatchSystem to notice and
      // recompute a fresh route for auto-dispatched trucks; manual/saved
      // patrols just resume steering toward the same waypoint they had.
      if (e._recoverTimer > 0) {
        _driveReverse(e, dt, skipGrid);
        e._recoverTimer -= dt;
        if (e._recoverTimer <= 0) {
          e._recoverTimer = 0;
          e._stuckStrikes = 0;
          e._stuckCheckPos = null;
          e._trk = null;   // re-lay the track: whatever it hit may be new
        }
        return;
      }

      // Lay the track over the waypoints (see _buildTrack), again whenever
      // the path is replaced or edited, or the truck switches between a
      // one-way dispatch leg and a round-and-round patrol.
      let tr = e._trk;
      if (!tr || tr.src !== e._path || tr.n !== e._path.length || tr.cyclic !== !e._autoDispatch) {
        for (const w of e._path) {
          if (!w || !isFinite(w.wx) || !isFinite(w.wy)) {
            console.error('[truck] bad waypoint in path', w);
            e._patrolling = false;
            return;
          }
        }
        tr = _buildTrack(e);
      }

      // Everything is measured from the truck's rendered CENTER (e._wx/e._wy
      // is its top-left corner — renderTruck's rotation pivot, and the point
      // waypoints were actually clicked at, sit at +TILE/2, +TILE*1.5 from
      // there), so the body tracks the drawn path line rather than running
      // a tile and a half to one side of it.
      const _cx = e._wx + TILE / 2, _cy = e._wy + TILE * 1.5;
      const tAlong = _trackAdvance(tr, e, _cx, _cy);
      const k = e._trkK, kn = (k + 1) % tr.N;
      e._patrolIdx = tr.wp[k];

      // Pulled up for a load/unload/refuel — brake to a stand and stay
      // there until HaulSystem/GasStationSystem clears the flag, which
      // happens once cargo is full, the source/station is emptied, or the
      // truck is no longer in range.
      // Also while a Hauler is pumping fuel into it where it ran dry.
      const docked = !!(e._haulState || e._refuelTarget) || _beingFuelled(e);

      // Only a dispatch leg actually stops at its last waypoint — a manual or
      // saved-path patrol wraps round to waypoint 0 and drives straight on.
      const stopsHere = !tr.cyclic && e._patrolIdx === tr.n - 1;
      const _end = tr.src[tr.n - 1];
      // Closing on its stop with another truck already standing there: take
      // the free bay beside it (see _claimBay). The path changes, and the
      // next step lays the track again over the new stop.
      if (stopsHere && !docked && Math.hypot(_end.wx - _cx, _end.wy - _cy) < BAY_CLAIM) {
        _claimBay(e);
        if (e._path !== tr.src) { e._trk = null; return; }
      }
      const dist = stopsHere ? Math.hypot(_end.wx - _cx, _end.wy - _cy) : Infinity;
      const ARRIVE_RADIUS = TILE * 0.5;
      // Sitting on the final waypoint waiting out the arrival grace window —
      // hold heading rather than hunting for a point a few pixels away.
      const settling = stopsHere && dist < ARRIVE_RADIUS;

      // Other trucks ahead: ease off and keep a gap (see _yieldCap). Held
      // to a stand for long enough, the truck is waved through instead.
      if (e._yieldPassTimer > 0) e._yieldPassTimer -= dt;
      let yieldCap = Infinity;
      if (!docked && !(e._yieldPassTimer > 0)) yieldCap = _yieldCap(e);
      if (yieldCap < YIELD_STOPPED) {
        e._truckYielding = true;
        e._yieldStandoffTimer = (e._yieldStandoffTimer || 0) + dt;
        if (e._yieldStandoffTimer >= YIELD_STANDOFF_TIMEOUT) {
          // Waited long enough: take the right of way (see
          // YIELD_STANDOFF_TIMEOUT). Deliberately not _needsReroute, which
          // counts toward TruckDispatchSystem's MAX_REROUTE_ATTEMPTS and can
          // cancel the whole dispatch; this is another truck, not terrain.
          e._yieldStandoffTimer = 0;
          e._truckYielding = false;
          e._yieldPassTimer = YIELD_PASS_SECONDS;
          yieldCap = Infinity;
        }
      } else {
        e._truckYielding = false;
        e._yieldStandoffTimer = 0;
      }

      // Stuck detection — a truck that's actually trying to drive (not
      // docked, not held up behind another truck) but hasn't covered
      // meaningful ground in a couple of checks is wedged against something,
      // most likely a corner its fixed-size collision box clipped. Back it
      // out rather than let it sit there forever. Skipped entirely while out
      // of fuel: sitting still with an empty tank is expected (see
      // _driveFuelGate below), not evidence of being wedged, and there's no
      // fuel to actually reverse with anyway — reset the tracking instead so
      // a fresh baseline starts once it can move again, rather than
      // comparing against a position from long before.
      if (docked || settling || yieldCap < 60 || (e._fuel ?? 1) <= 0) {
        e._stuckTimer = 0;
        e._stuckStrikes = 0;
        e._stuckCheckPos = null;
      } else {
        if (e._stuckCheckPos == null) { e._stuckCheckPos = { x: e._wx, y: e._wy }; e._stuckPrevPos = null; }
        e._stuckTimer = (e._stuckTimer || 0) + dt;
        if (e._stuckTimer >= STUCK_CHECK_INTERVAL - 1e-6) {
          // Progress is measured from the last check AND the one before: a
          // truck being shoved a tile back and forth between two obstacles
          // is always a tile from where it was a second ago, and back where
          // it was the second before that. Measured against the last check
          // alone, it read as moving and was never backed out.
          let moved = Math.hypot(e._wx - e._stuckCheckPos.x, e._wy - e._stuckCheckPos.y);
          if (e._stuckPrevPos) moved = Math.min(moved, Math.hypot(e._wx - e._stuckPrevPos.x, e._wy - e._stuckPrevPos.y));
          e._stuckPrevPos = e._stuckCheckPos;
          if (moved < STUCK_MIN_PROGRESS) {
            e._stuckStrikes = (e._stuckStrikes || 0) + 1;
          } else {
            // Real progress — the truck isn't stuck anymore, so the next
            // time it does get stuck is a fresh episode for toast purposes.
            e._stuckStrikes = 0;
            e._stuckEpisodeElapsed = 0;
            e._stuckToastShown = false;
          }
          e._stuckCheckPos = { x: e._wx, y: e._wy };
          e._stuckTimer = 0;
          if (e._stuckStrikes >= STUCK_STRIKES_TRIGGER) {
            e._stuckStrikes = 0;
            e._needsReroute = true;
            // Remember where (TruckRouting.findPath's `wedges`), so the reroute
            // and the retries after it route round this spot instead of
            // straight back into it. Kept for two minutes, eight at most.
            // Never on a bridge: a crossing is where the road goes, and a
            // truck held up on one (another truck coming over) only needs to
            // wait its turn. Marked, it sent the reroute miles round to
            // another crossing, or, with no other, had no way over at all.
            {
              const wc = Math.floor((e._wx + TILE / 2) / TILE), wr = Math.floor((e._wy + TILE * 1.5) / TILE), now = Date.now();
              const onBridge = !!GridManager.getEntity(wc, wr)?._bridge;
              e._wedges = (e._wedges || []).filter(w => w.until > now && !(w.c === wc && w.r === wr)).slice(-7);
              if (!onBridge) e._wedges.push({ c: wc, r: wr, until: now + 120000 });
            }
            // Inside something, or wedged for long enough that backing up
            // is plainly not working: reversing only grinds along whatever
            // has it. Work it free to the nearest clear ground instead, and
            // let the new route start from there. Otherwise back out.
            const free = (_embeddedAt(e, e._wx, e._wy) || (e._stuckEpisodeElapsed || 0) >= STUCK_WORK_FREE_AFTER) ? _nearestClear(e) : null;
            if (free && (free.x !== e._wx || free.y !== e._wy)) {
              e._wx = free.x; e._wy = free.y; e._vx = 0; e._vy = 0;
              e._stuckCheckPos = null;
              e._trk = null;
              e.col = Math.max(0, Math.min(COLS - 1, Math.floor(e._wx / TILE)));
              e.row = Math.max(0, Math.min(ROWS - 1, Math.floor(e._wy / TILE)));
            } else {
              e._recoverTimer = RECOVER_DURATION;
            }
            // Backing out on its own is routine — only bother the player
            // once the SAME stuck episode has eaten enough cumulative time
            // (repeated stuck/recover cycles with no real progress between
            // them) to suggest it's not just clearing a corner.
            e._stuckEpisodeElapsed = (e._stuckEpisodeElapsed || 0) + STUCK_CHECK_INTERVAL * STUCK_STRIKES_TRIGGER + RECOVER_DURATION;
            if (!e._stuckToastShown && e._stuckEpisodeElapsed >= STUCK_TOAST_THRESHOLD) {
              e._stuckToastShown = true;
              showToast('🚛 Truck stuck for a while; still trying to back out…', '#ff8060', '#180800', '#602010');
            }
            return;
          }
        }
      }

      // Fuel only burns while it's trying to drive. Withheld thrust lets it
      // coast to a stop instead of just cutting dead.
      let hasFuel = (e._fuel ?? 1) > 0;
      if (!docked) {
        hasFuel = _driveFuelGate(e, dt);
        if (!hasFuel) {
          // One-shot toast per depletion — _fuelStopNotified resets itself
          // once the truck gets refueled (GasStationSystem raises _fuel back
          // above 0), so running dry again later re-notifies.
          if (!e._fuelStopNotified) {
            e._fuelStopNotified = true;
            showToast(`⛽ ${e._cargoLabel ? e._cargoLabel + ' truck' : 'Truck'} ran out of fuel; patrol paused until refueled`, '#ff6040', '#180800', '#602010');
          }
        } else {
          e._fuelStopNotified = false;
        }
      }

      const rolling = Math.max(0, e._vx * Math.sin(e._angle) - e._vy * Math.cos(e._angle));
      let targetSpd = 0, signal = 0;
      if (!docked && !settling) {
        // ── Steer ──
        // Aim at the track a little way ahead (further the faster it's
        // going), so the truck is already turning in as a bend arrives and
        // unwinds out of it, instead of reacting once it's on top of it.
        const g = _trackAhead(tr, k, tAlong, Math.max(LOOK_MIN, Math.min(LOOK_MAX, rolling * LOOK_TIME)));
        let gx = g.x - _cx, gy = g.y - _cy;
        if (Math.abs(g.turn) > 0.5) signal = g.turn > 0 ? 1 : -1;
        // Swerve round other trucks (see _avoidOffset): shift the aim point
        // sideways by what's still needed. The shift eases in and out so the
        // truck drifts across rather than jinking, and once clear it steers
        // back onto the line by itself.
        let avoidSlow = false;
        const gd0 = Math.hypot(gx, gy);
        if (gd0 > TILE) {
          const dirX = gx / gd0, dirY = gy / gd0;
          const remaining = tr.cyclic ? Infinity : tr.total - tr.cum[k] - tAlong * tr.len[k];
          const av = _avoidOffset(e, _cx, _cy, dirX, dirY, remaining);
          const want = av ? av.off : 0;
          e._avoidOff = (e._avoidOff || 0) + (want - (e._avoidOff || 0)) * Math.min(1, dt * 4);
          if (Math.abs(e._avoidOff) > 1) {
            const look = Math.max(gd0, TILE * 2.5);
            gx = dirX * look - dirY * e._avoidOff;
            gy = dirY * look + dirX * e._avoidOff;
          }
          avoidSlow = !!(av && av.slow);
        } else {
          e._avoidOff = 0;
        }
        // The curve through the aim point is what the steering asks for; the
        // wheel takes time to wind on and off, there's only so much lock,
        // and the truck turns by rolling round that curve — so the heading
        // swings through a bend rather than snapping to face the next leg.
        const gd = Math.hypot(gx, gy);
        let da = Math.atan2(gx, -gy) - e._angle;
        while (da >  Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        const kRaw = Math.abs(da) > Math.PI / 2 ? Math.sign(da) : 2 * Math.sin(da) / Math.max(gd, 8);
        const lock = _steerCap(rolling);
        const wind = lock / STEER_WIND * dt;
        let ks = e._steerK || 0;
        ks = Math.max(ks - wind, Math.min(ks + wind, kRaw));
        ks = Math.max(-lock, Math.min(lock, ks));
        e._steerK = ks;
        let yaw = Math.max(rolling, PATROL_CREEP * 0.5) * ks;
        // never overshoot the heading within one step
        if (Math.abs(yaw * dt) > Math.abs(da)) yaw = da / Math.max(dt, 1e-6);
        if (rolling * Math.abs(ks) > 0.25) signal = ks > 0 ? 1 : -1;
        const prevAngle = e._angle;
        e._angle += yaw * dt;
        _pivotAboutRear(e, prevAngle, PATROL_PIVOT_BACK);
        const headingErr = Math.abs(da - yaw * dt);   // what's still left to turn after this step

        // ── Speed ──
        // The lowest of:
        //  • cruise, which drops on a climb — less on a graded road
        //    (terrain_system.js);
        //  • the track's plan: what the bend it's in allows, and what it
        //    can still shed by the next slow point at service braking;
        //  • arrival — on the final stretch, brake over a real stopping
        //    distance so the truck comes to rest inside the arrival radius
        //    instead of rolling through it and looping back;
        //  • the curve it's actually being asked to steer right now, which
        //    is tighter than the plan when it's off the line or swerving;
        //  • facing away (more than 90° off) — creep and swing round rather
        //    than carving a wide arc.
        targetSpd = SPEED * (truckSpec(e).speedMult || 1) * TerrainSystem.climbFactor(_cx, _cy, Math.sin(e._angle), -Math.cos(e._angle))
                  * WeatherEventSystem.getTravelMult();   // fog, a dust storm: slower where you can't see
        const toNext = (1 - tAlong) * tr.len[k];
        targetSpd = Math.min(targetSpd, Math.max(tr.hard[k] ? Infinity : tr.lim[k], tr.hard[kn] ? Infinity : tr.lim[kn]), Math.sqrt(tr.vcap[kn] * tr.vcap[kn] + 2 * PATROL_BRAKE * toNext));
        if (stopsHere) targetSpd = Math.min(targetSpd, Math.sqrt(2 * PATROL_BRAKE * Math.max(0, dist - ARRIVE_RADIUS * 0.6)));
        // Ease off while passing an oncoming truck.
        if (avoidSlow) targetSpd *= 0.6;
        const kAbs = Math.abs(kRaw);
        if (kAbs > 1e-4) targetSpd = Math.min(targetSpd, Math.sqrt(CORNER_GRIP / kAbs), _fitSpeed(kAbs));
        if (headingErr > Math.PI / 2) targetSpd = PATROL_CREEP;
        targetSpd = Math.min(Math.max(targetSpd, PATROL_CREEP), yieldCap);
      }
      e._signal = signal;

      // Speed along the heading: a loaded truck pulls away with a torque
      // curve that fades toward top speed (and the fuller the bed, the less
      // of it there is), and sheds speed through the brakes at a finite
      // rate instead of the velocity being clamped straight down.
      const hx = Math.sin(e._angle), hy = -Math.cos(e._angle);
      let along = e._vx * hx + e._vy * hy;
      let lat   = e._vx * hy - e._vy * hx;
      const was = along;
      if (along > targetSpd) {
        const rate = docked ? PATROL_BRAKE_DOCK : yieldCap <= targetSpd ? PATROL_BRAKE_HARD : PATROL_BRAKE * 1.15;
        along = Math.max(targetSpd, along - rate * dt);
      } else if (hasFuel && targetSpd > 0) {
        const fill = Math.max(0, Math.min(1, (e._cargoAmount || 0) / truckCargoCap(e, e._cargoKind)));
        const pull = PATROL_ACCEL * (1 - PATROL_LOAD_DRAG * fill) * (1 - 0.6 * Math.max(0, Math.min(1, along / SPEED)));
        along = Math.min(targetSpd, along + pull * dt);
      } else {
        along *= _frictionFactor(dt);
        if (Math.abs(along) < 0.5) along = 0;
      }
      // Brake lights: on for real braking, and held a moment so they don't
      // flicker while the truck feathers its speed through a bend.
      if (was > 8 && (was - along) / Math.max(dt, 1e-6) > 90) e._brakeHold = 0.3;
      else if (e._brakeHold > 0) e._brakeHold -= dt;
      e._braking = e._brakeHold > 0;
      // What the engine is being asked for, 0..1 — exhaust and engine note.
      e._throttle = along > was + 0.01 ? 1 - 0.6 * Math.max(0, Math.min(1, along / SPEED)) : along > 20 && along >= was ? 0.25 : 0;
      // Tyres grip: bleed off sideways slide so the truck travels the way
      // it's pointing rather than skating out wide on the old momentum.
      lat *= Math.exp(-PATROL_GRIP * dt);
      if (docked && Math.abs(lat) < 0.5) lat = 0;
      e._vx = along * hx + lat * hy;
      e._vy = along * hy - lat * hx;

      if (e._vx !== 0 || e._vy !== 0) {
        const _prevCol = e.col, _prevRow = e.row;
        e._wx += e._vx * dt;
        e._wy += e._vy * dt;
        e._wx = Math.max(0, Math.min((COLS-1)*TILE, e._wx));
        e._wy = Math.max(0, Math.min((ROWS-1)*TILE, e._wy));
        _resolveCollision(e);
        e._wx = Math.max(0, Math.min((COLS-1)*TILE, e._wx));
        e._wy = Math.max(0, Math.min((ROWS-1)*TILE, e._wy));
        _runOverVegetation(e);
        _restampAfterMove(e, _prevCol, _prevRow, skipGrid);
      }

      if (settling && !docked) {
        // Auto-dispatched legs are one-way — stop here instead of
        // wrapping back to waypoint 0 (which is what manual/saved-path
        // cyclic patrols want). Don't declare the leg done the instant
        // we're physically close enough, though — sit tight for a short
        // grace window first (see ARRIVAL_GRACE_SECONDS) so HaulSystem/
        // GasStationSystem get a real chance to notice and start loading/
        // unloading/refueling before TruckDispatchSystem moves on. The
        // docked check above already holds the truck for the actual
        // duration of a load/unload/refuel once one starts.
        e._arrivalGraceTimer = (e._arrivalGraceTimer || 0) + dt;
        if (e._arrivalGraceTimer >= ARRIVAL_GRACE_SECONDS) {
          e._arrivalGraceTimer = 0;
          e._patrolling = false;
          e._legDone = true;
        }
      }
    },

    renderTruck(ctx, cam, e, t) {
      _initWorldPos(e);

      // World → screen (camera uses top-left origin, no centering offset needed)
      const screenX = (e._wx - cam.x) * cam.zoom;
      const screenY = (e._wy - cam.y) * cam.zoom;
      const z = cam.zoom;
      _updateMotionVisuals(e, t);

      _drawFx(ctx, cam, e, 1);
      ctx.save();
      ctx.translate(screenX + TILE*z/2, screenY + TILE*3*z/2);
      ctx.rotate(e._angle);
      TruckSystem.drawTruckBody(ctx, e, t, z);
      ctx.restore();
      _drawFx(ctx, cam, e, 0);
    },

    // Draws the truck centred on the current origin, nose toward -y, at
    // scale z (screen px per world px). renderTruck calls it in screen space;
    // the drag preview calls it with z = 1 inside the world transform, so a
    // truck being moved looks exactly like the one on the road.
    //
    // A cab-over hauler with a steel tipper bed. What's in the bed is what
    // it's actually carrying, at its real fill level: an ash heap for coal
    // waste, sealed drums for oil waste, yellow containment casks for
    // nuclear waste. The amber beacon turns while it's loading, unloading
    // or refuelling; headlights come on after dark (and whenever you're
    // driving it), brake lights while it yields, reversing lights while it
    // backs out of a jam, and a red lamp on the cab roof warns of low fuel.
    // Indicators flash ahead of a turn, and together while it backs up.
    drawTruckBody(ctx, e, t, z) {
      const driven = _driven === e;
      const w = TILE * z, h = TILE * 3 * z;
      const hw = w / 2, hh = h / 2;
      const P = (v) => v * z;                      // world px → draw units
      const dark = (typeof DayNight !== 'undefined') ? DayNight.darkness() : 0;
      const busy = e._haulState === 'loading' || e._haulState === 'unloading' || e._haulState === 'fuelling' || !!e._refuelTarget;
      const cap  = truckCargoCap(e, e._cargoKind);
      const fill = Math.max(0, Math.min(1, (e._cargoAmount || 0) / cap));
      const fuelCap = truckSpec(e).fuelCapacity || 100;
      const lowFuel = e._fuel !== undefined && e._fuel / fuelCap < 0.2;
      const rr = (x, y, ww, hh2, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(x, y, ww, hh2, r); ctx.fill(); };
      const disc = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill(); };

      // Light from the screen's top-left, turned into the truck's own frame
      // (the truck rotates under it), so highlights and shadows stay put in
      // the world as it turns. (lx, ly) points from the truck to the light.
      const ang = e._angle || 0, ca = Math.cos(ang), sa = Math.sin(ang);
      const lx = -0.6 * ca - 0.8 * sa, ly = 0.6 * sa - 0.8 * ca;
      // Volume across a flat fill: brighter on the side facing the light,
      // darker on the far side.
      const shade = (x, y, ww, hh2, r, hi, lo) => {
        const cx = x + ww / 2, cy = y + hh2 / 2;
        const g = ctx.createLinearGradient(cx + lx * ww / 2, cy + ly * hh2 / 2, cx - lx * ww / 2, cy - ly * hh2 / 2);
        g.addColorStop(0, `rgba(255,255,255,${hi})`); g.addColorStop(0.42, 'rgba(255,255,255,0)');
        g.addColorStop(0.58, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${lo})`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, ww, hh2, r); ctx.fill();
      };
      // A bevel round a raised panel: a light edge on the lit side, a dark
      // one opposite (the outline, shifted and clipped to the shape).
      const bevel = (x, y, ww, hh2, r, a = 1, d = P(1.1), lw = P(1.8)) => {
        ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, ww, hh2, r); ctx.clip();
        ctx.lineWidth = lw;
        ctx.strokeStyle = `rgba(255,255,255,${0.42 * a})`;
        ctx.beginPath(); ctx.roundRect(x - lx * d, y - ly * d, ww, hh2, r); ctx.stroke();
        ctx.strokeStyle = `rgba(0,0,0,${0.5 * a})`;
        ctx.beginPath(); ctx.roundRect(x + lx * d, y + ly * d, ww, hh2, r); ctx.stroke();
        ctx.restore();
      };
      // Inside a walled box (the bed), the opposite: the wall nearest the
      // light shades the floor beside it, and the far wall's inner face is lit.
      const sunken = (x, y, ww, hh2, r) => {
        ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, ww, hh2, r); ctx.clip();
        ctx.lineWidth = P(6);
        ctx.strokeStyle = 'rgba(0,0,0,0.42)';
        ctx.beginPath(); ctx.roundRect(x - lx * P(3), y - ly * P(3), ww, hh2, r); ctx.stroke();
        ctx.lineWidth = P(2.4);
        ctx.strokeStyle = 'rgba(255,255,255,0.16)';
        ctx.beginPath(); ctx.roundRect(x + lx * P(1.2), y + ly * P(1.2), ww, hh2, r); ctx.stroke();
        ctx.restore();
      };

      // Paint: the cab keeps the company green, brighter while driven
      // (a Hauler is blue, so the two fleets can be told apart on the road)
      const CAB   = e._hauler ? (driven ? '#3080b8' : '#286a9c') : driven ? '#3f8a30' : '#35722a';
      const CAB_H = e._hauler ? (driven ? '#5aa8de' : '#4890c4') : driven ? '#62b448' : '#4f9a3c';
      const CAB_S = e._hauler ? (driven ? '#1e5680' : '#1a4a70') : driven ? '#2a5e20' : '#24501c';

      // ── Shadow ───────────────────────────────────────────────────────
      const lean  = e._visLean  || 0;
      const pitch = e._visPitch || 0;
      const steerA = e._visSteer || 0;
      const odo = e._visOdo || 0;
      {
        const sx = -lx * P(7) - P(0.8) * lean, sy = -ly * P(7) - P(0.8) * pitch;
        ctx.fillStyle = 'rgba(0,0,0,0.13)';
        ctx.beginPath(); ctx.roundRect(-hw + sx - P(1.5), -hh + sy - P(1), w + P(3), h + P(2), P(8)); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.24)';
        ctx.beginPath(); ctx.roundRect(-hw + sx * 0.6 + P(1), -hh + sy * 0.6 + P(1.5), w - P(2), h - P(3), P(6)); ctx.fill();
      }

      // ── Headlight beams (under everything) ──────────────────────────
      // Always on, and they behave like the cursor lantern: an additive
      // ('lighter') warm throw whose strength follows darkness, so by day
      // it's a faint wash just ahead of the bumper and after dark a bright
      // cone lighting the road. Driving the truck yourself adds a little.
      const beams = driven || dark > 0.35;
      const beamStrength = Math.min(1, 0.08 + dark * 0.8 + (driven ? 0.12 : 0));
      {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const reach = P(34 + 40 * dark);
        for (const sx of [-1, 1]) {
          const ox = sx * P(11), oy = -hh + P(3);
          const g = ctx.createRadialGradient(ox, oy, P(1), ox, oy, reach);
          g.addColorStop(0,    `rgba(255,236,190,${(0.55 * beamStrength).toFixed(3)})`);
          g.addColorStop(0.35, `rgba(255,220,160,${(0.26 * beamStrength).toFixed(3)})`);
          g.addColorStop(0.75, `rgba(255,200,130,${(0.08 * beamStrength).toFixed(3)})`);
          g.addColorStop(1,    'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(ox - sx*P(1.5), oy);
          ctx.lineTo(ox + sx*P(3) - P(15) - reach*0.12, oy - reach);
          ctx.lineTo(ox + sx*P(3) + P(15) + reach*0.12, oy - reach);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }

      // ── Wheels: steer axle under the cab, tandem drive axles at the rear ──
      // Treads scroll with distance rolled; the steer axle turns with the
      // wheel angle the truck's actual path implies.
      const treadOff = ((-odo % 2) + 2) % 2;
      const tyre = (y, steer) => {
        for (const sx of [-1, 1]) {
          const x = sx > 0 ? hw - P(4.6) : -hw - P(0.4);
          if (steer) {
            ctx.save();
            ctx.translate(x + P(2.5), y + P(5)); ctx.rotate(steer); ctx.translate(-x - P(2.5), -y - P(5));
          }
          rr(x, y, P(5), P(10), P(2), '#141210');
          ctx.fillStyle = '#2c2a26';
          for (let k = 0; k < 5; k++) {
            const ty = y + P(k*2 + treadOff) - P(0.3);
            if (ty > y + P(0.8) && ty < y + P(9)) ctx.fillRect(x + P(0.6), ty, P(3.8), P(0.6));      // tread
          }
          shade(x, y, P(5), P(10), P(2), 0.16, 0.45);                                                 // sidewall
          rr(x + P(1.4), y + P(3.4), P(2.2), P(3.2), P(0.8), '#8a8a84');                              // hub
          disc(x + P(2.5) + lx * P(0.6), y + P(5) + ly * P(0.8), P(0.6), 'rgba(255,255,255,0.55)');
          if (steer) ctx.restore();
        }
      };
      tyre(-hh + P(14), steerA);
      tyre(-hh + P(78)); tyre(-hh + P(92)); tyre(-hh + P(106));

      // Everything above the axles rides on the suspension — it rolls to
      // the outside of a turn and dives/squats with braking and throttle.
      // On top of that the engine shakes it: a fast shiver at idle that
      // smooths out as it gets rolling, when the road takes over.
      const moving = driven || !!e._patrolling;
      const rolling = Math.min(1, Math.abs(e._visFwd || 0) / 280);
      const running = (moving || busy) && (e._fuel ?? 1) > 0;
      // Both are kept slow enough for the frame rate to draw: a buzz faster
      // than that doesn't blur, it flickers.
      const idle = running ? Math.max(0, 1 - rolling * 4) : 0;
      const shakeX = P(0.16) * idle * Math.sin(t * 44 + (e._tid || 0));
      const shakeY = P(0.12) * idle * Math.sin(t * 31) + P(0.22) * rolling * Math.sin(odo * 0.0691) * Math.sin(odo * 0.0251);
      ctx.save();
      ctx.translate(-P(2.1) * lean + shakeX, -P(1.9) * pitch + shakeY);   // +lean = turning right, +pitch = braking

      // ── Chassis rails and side fuel tanks ───────────────────────────
      rr(-P(9), -hh + P(30), P(18), P(86), P(2), '#26221e');
      for (const sx of [-1, 1]) {
        const x = sx > 0 ? hw - P(8) : -hw + P(1.5);
        const g = ctx.createLinearGradient(0, -hh + P(34), 0, -hh + P(46));
        g.addColorStop(0, '#7a7e82'); g.addColorStop(0.45, '#dfe3e6'); g.addColorStop(1, '#6a6e72');
        ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, -hh + P(34), P(6.5), P(12), P(3)); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, -hh + P(37.5), P(6.5), P(0.6)); ctx.fillRect(x, -hh + P(42.5), P(6.5), P(0.6));
      }

      // ── Cab ──────────────────────────────────────────────────────────
      // On its own mounts, so it moves a little further than the bed does.
      ctx.save();
      ctx.translate(-P(0.8) * lean, -P(0.7) * pitch);
      // bumper
      rr(-hw + P(2), -hh + P(0.5), w - P(4), P(4), P(2), '#2a2a2c');
      rr(-hw + P(3), -hh + P(1.2), w - P(6), P(1.2), P(0.6), '#8a8e92');
      // body with a rounded nose
      ctx.fillStyle = CAB;
      ctx.beginPath(); ctx.roundRect(-hw + P(2.5), -hh + P(3.5), w - P(5), P(27), [P(7), P(7), P(3), P(3)]); ctx.fill();
      // side shading and a roof highlight to give it volume
      const cg = ctx.createLinearGradient(-hw, 0, hw, 0);
      cg.addColorStop(0, 'rgba(0,0,0,0.28)'); cg.addColorStop(0.3, 'rgba(0,0,0,0)'); cg.addColorStop(0.7, 'rgba(0,0,0,0)'); cg.addColorStop(1, 'rgba(0,0,0,0.3)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.roundRect(-hw + P(2.5), -hh + P(3.5), w - P(5), P(27), [P(7), P(7), P(3), P(3)]); ctx.fill();
      shade(-hw + P(2.5), -hh + P(3.5), w - P(5), P(27), [P(7), P(7), P(3), P(3)], 0.22, 0.38);
      bevel(-hw + P(2.5), -hh + P(3.5), w - P(5), P(27), [P(7), P(7), P(3), P(3)], 1);
      // chrome grille and headlights
      rr(-P(8), -hh + P(4), P(16), P(4.2), P(1), '#c8ccd0');
      ctx.fillStyle = '#3a3c40';
      for (let k = -6.5; k < 7; k += 2.2) ctx.fillRect(P(k), -hh + P(4.6), P(1.1), P(3));
      const lampC = beams ? '#fff6c8' : '#d8dcc8';
      rr(-hw + P(3.5), -hh + P(4), P(5.5), P(3.4), P(1.2), lampC);
      rr(hw - P(9), -hh + P(4), P(5.5), P(3.4), P(1.2), lampC);
      // turn signals
      const reversing = (e._recoverTimer || 0) > 0 || (driven && (e._fwdSpeed || 0) < -5);
      const flash = (t % 0.7) < 0.38;
      const signal = !moving ? 0 : (e._signal || 0);
      const lit = (sx) => flash && (reversing || signal === sx);
      for (const sx of [-1, 1]) {
        if (lit(sx)) disc(sx * (hw - P(4.5)), -hh + P(9.5), P(3.2), 'rgba(255,170,40,0.3)');
        disc(sx * (hw - P(4.5)), -hh + P(9.5), lit(sx) ? P(1.3) : P(0.9), lit(sx) ? '#ffd060' : '#e8a030');
      }
      // windscreen, split, with wipers and glare
      {
        const g = ctx.createLinearGradient(0, -hh + P(10.5), 0, -hh + P(17));
        if (dark > 0.4) { g.addColorStop(0, '#2a3a4c'); g.addColorStop(1, '#10161e'); }
        else { g.addColorStop(0, '#d4ecf8'); g.addColorStop(0.45, '#8fc0dc'); g.addColorStop(1, '#4a7a98'); }
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(-hw + P(5), -hh + P(10.5), w - P(10), P(6.5), P(2)); ctx.fill();
        bevel(-hw + P(5), -hh + P(10.5), w - P(10), P(6.5), P(2), 0.7, P(0.7), P(1.2));
      }
      ctx.fillStyle = CAB_S; ctx.fillRect(-P(0.5), -hh + P(10.5), P(1), P(6.5));
      ctx.strokeStyle = '#1c1c1e'; ctx.lineWidth = P(0.5);
      ctx.beginPath(); ctx.moveTo(-P(10), -hh + P(16.5)); ctx.lineTo(-P(4), -hh + P(12)); ctx.moveTo(P(2), -hh + P(16.5)); ctx.lineTo(P(8), -hh + P(12)); ctx.stroke();
      if (dark <= 0.4) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-hw + P(6.5), -hh + P(11.3), P(6), P(1.2)); }
      // sun visor and roof with amber marker lights
      rr(-hw + P(4), -hh + P(17), w - P(8), P(2.2), P(1), CAB_S);
      rr(-hw + P(5), -hh + P(19.5), w - P(10), P(9.5), P(2), CAB_H);
      shade(-hw + P(5), -hh + P(19.5), w - P(10), P(9.5), P(2), 0.3, 0.3);
      bevel(-hw + P(5), -hh + P(19.5), w - P(10), P(9.5), P(2), 1.1);
      // a soft gloss streak along the lit side of the roof
      ctx.save(); ctx.beginPath(); ctx.roundRect(-hw + P(5), -hh + P(19.5), w - P(10), P(9.5), P(2)); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath(); ctx.ellipse(lx * P(7), -hh + P(24.2) + ly * P(2.5), P(6), P(1.6), 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(-hw + P(5), -hh + P(24), w - P(10), P(0.6));
      for (const mx of [-6, -2, 2, 6]) disc(P(mx), -hh + P(18.1), P(0.7), dark > 0.35 ? '#ffb040' : '#c8902c');
      // amber beacon: spins while working
      if (busy) {
        const a = t * 7;
        ctx.save(); ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#ffb030';
        ctx.beginPath(); ctx.moveTo(0, -hh + P(23)); ctx.arc(0, -hh + P(23), P(14), a, a + 0.7); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, -hh + P(23)); ctx.arc(0, -hh + P(23), P(14), a + Math.PI, a + Math.PI + 0.7); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      disc(0, -hh + P(23), P(2), busy ? `rgba(255,${170 + Math.round(60*Math.sin(t*14))},40,1)` : '#8a5a20');
      // low-fuel lamp
      if (lowFuel) disc(-hw + P(8), -hh + P(26.5), P(1.2), Math.sin(t*8) > 0 ? '#ff3020' : '#5a1a14');
      // mirrors on arms
      for (const sx of [-1, 1]) {
        ctx.strokeStyle = '#1c1c1e'; ctx.lineWidth = P(0.7);
        ctx.beginPath(); ctx.moveTo(sx*(hw - P(3)), -hh + P(12)); ctx.lineTo(sx*(hw + P(2)), -hh + P(13)); ctx.stroke();
        rr(sx > 0 ? hw + P(1) : -hw - P(3.4), -hh + P(11.5), P(2.4), P(4.5), P(0.8), '#2a2a2c');
      }
      // chrome exhaust stacks behind the cab
      for (const sx of [-1, 1]) {
        const x = sx*(hw - P(5));
        disc(x, -hh + P(31.5), P(2.1), '#b8bcc0');
        disc(x, -hh + P(31.5), P(1.1), '#2a2a2c');
        disc(x + lx * P(1.3), -hh + P(31.5) + ly * P(1.3), P(0.55), 'rgba(255,255,255,0.8)');
      }
      ctx.restore();   // cab mounts

      // ── Tipper bed ───────────────────────────────────────────────────
      const bx = -hw + P(2), by = -hh + P(35), bw = w - P(4), bh = P(80);
      rr(-hw + P(3), -hh + P(30.5), w - P(6), P(5), P(1), 'rgba(0,0,0,0.38)');   // deep gap behind the cab
      // hydraulic ram between cab and bed (extends while unloading)
      const ram = e._haulState === 'unloading' ? P(1.5) + P(1.5)*Math.sin(t*3) : 0;
      rr(-P(2), -hh + P(31) - ram, P(4), P(5) + ram, P(1), '#5a5e62');
      // steel body with a darker floor inside
      rr(bx, by, bw, bh, P(3), '#6e7478');
      shade(bx, by, bw, bh, P(3), 0.2, 0.3);
      bevel(bx, by, bw, bh, P(3), 1.1);
      rr(bx + P(2.5), by + P(2.5), bw - P(5), bh - P(5), P(2), '#3e4246');
      // ribs across the floor
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let k = 1; k < 8; k++) ctx.fillRect(bx + P(2.5), by + k*P(10), bw - P(5), P(0.8));
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let k = 1; k < 8; k++) ctx.fillRect(bx + P(2.5), by + k*P(10) + P(0.8), bw - P(5), P(0.5));
      sunken(bx + P(2.5), by + P(2.5), bw - P(5), bh - P(5), P(2));

      // load, by what it is
      const inner = { x: bx + P(3.5), y: by + P(3.5), w: bw - P(7), h: bh - P(7) };
      const kind = e._cargoFacility === T.OILWASTE ? 'oil'
                 : e._cargoFacility === T.NUCLEARWASTE ? 'nuclear'
                 : e._cargoFacility ? 'ash' : null;
      if (e._hauler) {
        // The Hauler's bed shows what it is carrying: a heap of ore in the
        // ore's own colour, or a tank with a sight glass for a liquid.
        const ck = e._cargoKind;
        const LIQ = { oil: '#1c1814', fuel: '#c8902c', water: '#3a8ad8', acid: '#9ad848' };
        const ORE = { coal: ['#151517', '#3c3c42'], uranium: ['#2e4a22', '#7ab84a'], sulfur: ['#8a7414', '#f0d840'], lithium: ['#6a7a88', '#d4e0ea'],
                      compound: ['#6a5a84', '#d8c8f4'], rods: ['#2a3a2c', '#8ad890'], pellets: ['#4a2c5a', '#cc94ec'] };
        rr(bx, by, P(2.4), bh, P(1), CAB); rr(bx + bw - P(2.4), by, P(2.4), bh, P(1), CAB);   // painted side rails
        if (ck && fill > 0.01 && LIQ[ck]) {
          const g = ctx.createLinearGradient(inner.x, 0, inner.x + inner.w, 0);
          g.addColorStop(0, '#5e6874'); g.addColorStop(0.45, '#e6ecf0'); g.addColorStop(1, '#5a646e');
          ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(inner.x, inner.y, inner.w, inner.h, P(8)); ctx.fill();
          shade(inner.x, inner.y, inner.w, inner.h, P(8), 0.25, 0.35);
          bevel(inner.x, inner.y, inner.w, inner.h, P(8), 0.9);
          for (let k = 1; k < 5; k++) {
            const ry = inner.y + k * inner.h / 5;
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(inner.x, ry, inner.w, P(0.9));
            ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(inner.x, ry - P(0.7), inner.w, P(0.6));
          }
          for (let k = 0; k < 3; k++) { disc(0, inner.y + inner.h * (0.2 + k * 0.3), P(3.2), '#3a4048'); disc(0, inner.y + inner.h * (0.2 + k * 0.3), P(2), '#8a94a0'); }
          // sight glass down one side, filled to the real level
          const sx0 = inner.x + P(3), sy0 = inner.y + P(8), sh = inner.h - P(16);
          rr(sx0, sy0, P(2.6), sh, P(1.2), '#12161a');
          rr(sx0 + P(0.5), sy0 + sh * (1 - fill), P(1.6), sh * fill, P(0.8), LIQ[ck]);
        } else if (ck && fill > 0.01) {
          const col = ORE[ck] || ['#4a4640', '#9a948a'];
          const len = inner.h * (0.25 + 0.75 * fill), top = inner.y + inner.h - len;
          const g = ctx.createLinearGradient(inner.x, 0, inner.x + inner.w, 0);
          g.addColorStop(0, col[0]); g.addColorStop(0.5, col[1]); g.addColorStop(1, col[0]);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(inner.x, inner.y + inner.h);
          ctx.lineTo(inner.x, top + P(8));
          ctx.quadraticCurveTo(inner.x + inner.w * 0.5, top - P(4), inner.x + inner.w, top + P(8));
          ctx.lineTo(inner.x + inner.w, inner.y + inner.h);
          ctx.closePath(); ctx.fill();
          // the mound catches the light on one flank and falls into shade on the other
          ctx.save(); ctx.clip(); shade(inner.x, top - P(4), inner.w, len + P(4), 0, 0.28, 0.5); ctx.restore();
          ctx.fillStyle = 'rgba(255,255,255,0.28)';
          for (let k = 0; k < 16; k++) {
            const hx = inner.x + P(2) + ((k * 37) % 97) / 97 * (inner.w - P(4));
            const hy = top + P(6) + ((k * 53) % 89) / 89 * Math.max(0, len - P(10));
            ctx.fillRect(hx, hy, P(1.3), P(1));
          }
        }
      } else if (kind && fill > 0.01) {
        if (kind === 'ash') {
          // a heap that fills from the back of the bed forward
          const len = inner.h * (0.25 + 0.75*fill);
          const top = inner.y + inner.h - len;
          const g = ctx.createLinearGradient(inner.x, 0, inner.x + inner.w, 0);
          g.addColorStop(0, '#2a2826'); g.addColorStop(0.5, '#5a5652'); g.addColorStop(1, '#2a2826');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(inner.x, inner.y + inner.h);
          ctx.lineTo(inner.x, top + P(8));
          ctx.quadraticCurveTo(inner.x + inner.w*0.5, top - P(4), inner.x + inner.w, top + P(8));
          ctx.lineTo(inner.x + inner.w, inner.y + inner.h);
          ctx.closePath(); ctx.fill();
          // the mound catches the light on one flank and falls into shade on the other
          ctx.save(); ctx.clip(); shade(inner.x, top - P(4), inner.w, len + P(4), 0, 0.28, 0.5); ctx.restore();
          ctx.fillStyle = 'rgba(150,146,140,0.5)';
          for (let k = 0; k < 14; k++) {
            const hx = inner.x + P(2) + ((k*37) % 97)/97 * (inner.w - P(4));
            const hy = top + P(6) + ((k*53) % 89)/89 * (len - P(10));
            ctx.fillRect(hx, hy, P(1.2), P(0.9));
          }
        } else {
          // drums or casks stacked from the back, two abreast
          const slots = kind === 'oil' ? 14 : 8;
          const n = Math.max(1, Math.round(slots * fill));
          const rows = kind === 'oil' ? 7 : 4, step = inner.h / rows;
          const r = kind === 'oil' ? P(5.2) : P(6.8);
          for (let i = 0; i < n; i++) {
            const row = rows - 1 - Math.floor(i / 2), col = i % 2;
            const cx = inner.x + inner.w*(col ? 0.72 : 0.28), cy = inner.y + step*(row + 0.5);
            disc(cx + P(0.8), cy + P(1), r, 'rgba(0,0,0,0.35)');
            if (kind === 'oil') {
              disc(cx, cy, r, (i % 3 === 2) ? '#8a2a20' : '#1e2024');
              ctx.strokeStyle = '#8a8e92'; ctx.lineWidth = P(0.6);
              ctx.beginPath(); ctx.arc(cx, cy, r*0.72, 0, Math.PI*2); ctx.stroke();
              disc(cx + r*0.35, cy - r*0.3, P(0.9), '#6a6e72');     // bung
            } else {
              disc(cx, cy, r, '#e0b820');
              disc(cx, cy, r*0.8, '#f0cc30');
              ctx.fillStyle = '#1a1a1a';                           // trefoil
              for (let k = 0; k < 3; k++) {
                const a0 = -Math.PI/2 + k*2*Math.PI/3 - 0.45;
                ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r*0.62, a0, a0 + 0.9); ctx.closePath(); ctx.fill();
              }
              disc(cx, cy, r*0.18, '#f0cc30'); disc(cx, cy, r*0.1, '#1a1a1a');
            }
          }
        }
      }
      // The cab stands taller than the bed, so it throws a shadow back over
      // whatever part of the bed lies away from the light.
      if (-ly > 0.05) {
        ctx.save();
        ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, P(3)); ctx.clip();
        ctx.fillStyle = 'rgba(0,0,0,0.26)';
        ctx.beginPath(); ctx.roundRect(-hw + P(2.5) - lx * P(9), -hh + P(3.5) - ly * P(12), w - P(5), P(27), P(4)); ctx.fill();
        ctx.restore();
      }
      // tailgate hinge rail, and the label of what it's hauling
      rr(bx, by + bh - P(3), bw, P(3), P(1), '#565c60');
      if (kind && fill > 0.01 && z > 0.6) {
        ctx.fillStyle = kind === 'nuclear' ? '#e0b820' : kind === 'oil' ? '#c84a30' : '#b8b4ac';
        ctx.beginPath(); ctx.moveTo(-hw + P(4), by + P(6)); ctx.lineTo(-hw + P(7), by + P(3)); ctx.lineTo(-hw + P(10), by + P(6)); ctx.lineTo(-hw + P(7), by + P(9)); ctx.closePath(); ctx.fill();   // hazard diamond
      }

      // ── Rear: hazard bumper, plate, lamps ───────────────────────────
      const bumpY = hh - P(4.5);
      rr(-hw + P(2), bumpY, w - P(4), P(4.5), P(2), '#1c1712');
      ctx.save();
      ctx.beginPath(); ctx.roundRect(-hw + P(2), bumpY, w - P(4), P(4.5), P(2)); ctx.clip();
      ctx.fillStyle = '#e0b020';
      for (let sx = -hw - P(4); sx < hw + P(4); sx += P(4)) {
        ctx.beginPath(); ctx.moveTo(sx, bumpY + P(4.5)); ctx.lineTo(sx + P(2), bumpY); ctx.lineTo(sx + P(3.2), bumpY); ctx.lineTo(sx + P(1.2), bumpY + P(4.5)); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      bevel(-hw + P(2), bumpY, w - P(4), P(4.5), P(2), 0.8, P(0.8), P(1.2));
      rr(-P(3.5), hh - P(3.6), P(7), P(2.8), P(0.6), '#d8d2c0');
      const braking = !!e._truckYielding || (!!e._braking && (driven || !!e._patrolling));
      for (const sx of [-1, 1]) {
        const x = sx > 0 ? hw - P(5.5) : -hw + P(2.5);
        if (lit(sx)) {
          disc(sx * (hw - P(2.6)), bumpY - P(1.5), P(3.4), 'rgba(255,170,40,0.3)');
          disc(sx * (hw - P(2.6)), bumpY - P(1.5), P(1.2), '#ffd060');
        }
        rr(x, bumpY - P(2.6), P(3), P(2.2), P(0.8), braking ? `rgba(255,40,24,${0.75 + 0.25*Math.sin(t*10)})` : (dark > 0.35 ? '#a0201a' : '#5a1a14'));
        if (reversing) rr(x + (sx > 0 ? -P(3.2) : P(3.2)), bumpY - P(2.6), P(2.6), P(2.2), P(0.8), '#f4f4ee');
      }
      if (braking || reversing) {
        ctx.save(); ctx.globalAlpha = 0.25;
        const g = ctx.createRadialGradient(0, hh, 0, 0, hh, P(18));
        g.addColorStop(0, reversing ? '#ffffff' : '#ff3020'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(-P(18), hh - P(4), P(36), P(20));
        ctx.restore();
      }

      ctx.restore();   // suspension

      // ── Outline and drive indicator ─────────────────────────────────
      // The same thin dark outline whoever is at the wheel: the DRIVE tag
      // ahead of the cab is enough to say the player has it.
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1*z;
      ctx.beginPath(); ctx.roundRect(-hw + P(1), -hh + P(1), w - P(2), h - P(2), P(5)); ctx.stroke();
      if (driven) {
        ctx.font = `bold ${Math.max(6, Math.round(8*z))}px Courier New`;
        ctx.fillStyle = `rgba(140,220,60,${0.85 + 0.15*Math.sin(t*3)})`;
        ctx.textAlign = 'center';
        ctx.fillText('DRIVE', 0, -hh - P(5));
        ctx.textAlign = 'left';
      }
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   MAIN GAME LOOP
   Fixed-timestep logic tick (100ms / 10Hz) + uncapped render.
   Why separate tick from render?
   — Power network runs at a stable rate regardless of frame rate.
   — Render is smooth (60fps+) for animations.
   ═══════════════════════════════════════════════════════════════════ */
