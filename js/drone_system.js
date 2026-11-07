/* ═══════════════════════════════════════════════════════════════════
   DRONE SYSTEM
   Drone Ports and the fleet that flies out of them.

   The late-MK4 answer to "something is broken and I am not standing next
   to it". A port hosts `def.drones` drones; they fly straight lines — no
   roads, no fuel stops — dog-legging only to stay inside their coverage,
   which is the whole reason they are worth what they cost.

   What keeps them from obsoleting the truck fleet:

     • RANGE. A drone only works inside its port's coverage square, or the
       network that square joins where it touches another port's. Trucks go
       anywhere a road goes; drones cover the ground you built ports on,
       and battery still bounds how far across a network one port reaches.
       Long haul stays a truck job.
     • POWER, not fuel. Ports draw from the grid, and every drone away
       from its pad adds more on top. The fleet that fixes your grid is
       paid for by that grid, so a brownout grounds it exactly when it is
       most wanted.
     • BATTERY. A drone carries `def.battery` seconds of flight and turns
       for home while it still has the range to get there, so distant work
       costs proportionally more airtime.
     • WEATHER. A rainstorm, gale or blizzard slows the fleet to half speed
       or less, bucking the wind (slowedBy). The storm that breaks your city
       is not the moment the fleet saves it quickly, which is what keeps
       lightning a threat rather than an inconvenience.

   Drones are NOT entities. They live in `port._drones` as plain objects
   with a world position, because a hundred of them on the grid would mean
   a hundred registry members, footprint churn and pathing for something
   that never occupies a tile. The renderer draws them off this state.
   ═══════════════════════════════════════════════════════════════════ */

const DroneSystem = (() => {

  // Job kinds. The dispatcher and the drone state machine are kind-agnostic:
  // every kind supplies a finder, a validity check and a performJob branch,
  // and flight, battery, range, claims and rendering are all shared.
  const JOB_REPAIR = 'repair';
  const JOB_WASTE  = 'waste';
  const JOB_WIRE   = 'wire';
  const JOB_CARGO  = 'cargo';
  const JOB_CORE   = 'core';    // Field Core swaps between a Core Works and a fusion reactor (FieldCoreSystem)

  // -- The waste band ----------------------------------------------
  // This is what keeps a waste run from turning the fleet into a truck
  // replacement, and it matters far more than the payload figure does. A
  // source only becomes a drone job once it is nearly stopped, and the fleet
  // then shaves it down and STANDS OFF until it climbs back up again. Drones
  // buy a source time; they never clear it. The waste still has to be trucked.
  //
  // Stated as hysteresis rather than one threshold for the same reason
  // checkWasteBuildup() uses a warn/re-arm pair: with a single number, a
  // buffer parked exactly on it re-triggers every tick.
  const WASTE_DISPATCH_PCT   = 85;   // at or above this, the fleet starts shaving
  const WASTE_STAND_DOWN_PCT = 70;   // below this it stops, until 85 comes round again

  // Anything bound for the Nuclear Waste Processing Facility flies shielded:
  // smaller payload, longer on station, more draw in the air. Derived from
  // WASTE_CFG rather than listed here, so a future hot stream is hot by
  // virtue of where it goes rather than by being remembered about.
  const isHot = (cfg) => cfg.facilityType === T.NUCLEARWASTE;

  // -- Line servicing ----------------------------------------------
  // Real utility drones fly line inspection, thermal imaging and live-line
  // insulator washing. What they cannot do is re-string a conductor, so a
  // sweep MITIGATES a loaded line rather than fixing it: it cuts the
  // yellow-band fault roll (see WIRE_SERVICE_SUPPRESS in power_network.js)
  // and does nothing at all above the rating. Surge Protectors raise the
  // rating; that is still the only real answer to a congested grid.
  //
  // The band is the yellow one, exactly: at or above 0.8 there is a fault
  // roll worth suppressing, and at or above 1.0 the line fails outright
  // every tick no matter who is hovering over it. Sending a drone to a
  // redlined span would be pure theatre, so the dispatcher will not do it.
  const WIRE_MIN_STRESS = 0.8;
  const WIRE_MAX_STRESS = 1.0;

  // Only re-fly a span once most of its protection has run out, so the
  // fleet is not permanently circling one stretch of line topping it up.
  const WIRE_REFRESH_AT = 0.35;

  // Ceiling on how many drones a port will put on line servicing at once.
  // A sweep covers a whole span, so ten drones would be servicing the same
  // run of wire ten times over -- three is plenty to work a congested
  // district without the fleet tripping over itself.
  //
  // This is only the CEILING. The real limiter is canAbsorbSortie() below,
  // because the binding constraint is not how many drones look busy, it is
  // that the fleet is itself a load on the grid it is servicing.
  const WIRE_MAX_CONCURRENT = 3;

  // Will launching one more drone push the span it is being sent to over
  // its own rating?
  //
  // This is the whole problem with line servicing in one function. Every
  // sortie ends with the drone back on its pad drawing chargeDraw to refill
  // (in the air it only adds a telemetry trickle), and if the port is on the
  // network it is servicing, that draw lands on the very conductors the
  // sortie exists to protect -- usually while they are still stressed. On a big grid three drones are a rounding error. On a small
  // one -- a port that IS most of its network's demand -- even one sortie
  // can shove a span from the yellow band clean past 1.0 and burn the line,
  // which is the exact opposite of the job.
  //
  // So the fleet checks the bill before it takes off. A port on a different
  // network than the span pays nothing, which is correct: the draw lands
  // somewhere else entirely.
  // `pending` is how many sorties this port has already committed that the
  // span's load may not show yet. It matters because every idle drone is
  // dispatched in the SAME per-drone loop, one tick before PowerNetwork
  // recomputes: read the raw load and all three read the same pre-launch
  // figure, each concludes there is room, and all three take off together.
  // That is precisely the pile-on this function exists to prevent.
  //
  // Counting them is deliberately conservative -- a drone launched on an
  // earlier tick IS already in `load`, so it gets counted twice. The error
  // is bounded by WIRE_MAX_CONCURRENT * chargeDraw (90 kW), which is noise on
  // any grid big enough for three sorties to be reasonable, and on a grid
  // too small for them the bias errs towards not burning the line.
  function canAbsorbSortie(port, span, pending) {
    if (port.networkId < 0 || port.networkId !== span.networkId) return true;
    const cap = span._effectiveThreshold || 0;
    if (cap <= 0) return true;
    const added = (def().chargeDraw || 30) * (1 + (pending || 0));
    return ((span.load || 0) + added) / cap < WIRE_MAX_STRESS;
  }

  // Stress for a wire or pole, off the two fields applyWireLoads() stamps
  // on every conductor. Network-wide by construction: every conductor on a
  // component shares one load and one effective threshold.
  function wireStress(e) {
    const cap = e._effectiveThreshold || 0;
    return cap > 0 ? (e.load || 0) / cap : 0;
  }

  // Seconds a drone hovers on station before its job actually starts —
  // enough for the arrival to read as an arrival rather than a teleport.
  const ARRIVE_HOVER = 0.6;

  // ── Launch and recovery ─────────────────────────────────────────
  // A drone does not blink into the air. It spools up on its own pad,
  // climbs, and only then departs; coming back it flies to that same pad
  // and settles onto it. The two seconds this costs are the two seconds
  // that make the port look like it is operating aircraft.
  const LAUNCH_SECS = 1.2;
  const LAND_SECS   = 1.1;

  // Charging draw is flat until the battery is this close to full, then
  // eases off to nothing -- so a pad topping up the last few percent costs
  // a trickle, and the big load is a drone that came home nearly empty.
  const CHARGE_TAPER = 0.2;

  // Touchdown pad positions as fractions of the footprint. Declared HERE
  // rather than in the renderer because the sim is what decides where a
  // drone physically sits -- the sprite follows it. One source of truth, or
  // the art and the flight paths drift apart the first time either moves.
  const PADS = [
    [0.335, 0.135], [0.50, 0.135], [0.665, 0.135],
    [0.295, 0.395],                [0.705, 0.395],
    [0.295, 0.605],                [0.705, 0.605],
    [0.335, 0.865], [0.50, 0.865], [0.665, 0.865],
  ];

  // World position of drone `i`'s pad.
  function padPos(port, i) {
    const p = PADS[i % PADS.length];
    return { x: (port.col + (port.width  || 1) * p[0]) * TILE,
             y: (port.row + (port.height || 1) * p[1]) * TILE };
  }

  function def() { return EntityDefs[T.DRONEPORT] || {}; }

  // ── Drone Charging Ports ────────────────────────────────────────
  // A charging port has no fleet. It is a relay: it adds its own (smaller)
  // square to whatever network it touches, and drones crossing that network
  // set down on one of its five pads to top up, exactly as they hover beside
  // a Drone Port on a long run. Five pads means five drones at once; a sixth
  // holds off the deck until one lifts. "Station" below means either kind.
  const isCharger = (e) => !!e && e.type === T.DRONECHARGER;
  const isStation = (e) => !!e && (EntityRegistry.getByType(T.DRONEPORT).has(e) || EntityRegistry.getByType(T.DRONECHARGER).has(e));
  const stations  = () => [...EntityRegistry.getByType(T.DRONEPORT), ...EntityRegistry.getByType(T.DRONECHARGER)];
  // Pad positions as fractions of the footprint: a ring of five round the
  // charging mast. Declared here for the same reason PADS is.
  const CHARGER_PADS = [[0.5, 0.18], [0.804, 0.401], [0.688, 0.759], [0.312, 0.759], [0.196, 0.401]];
  function chargerPadPos(st, i) {
    const p = CHARGER_PADS[i % CHARGER_PADS.length];
    return { x: (st.col + (st.width || 1) * p[0]) * TILE, y: (st.row + (st.height || 1) * p[1]) * TILE };
  }
  // A drone holds a pad for one visit: the claim is tied to the route
  // waypoint it was made for, so a route that is dropped or rebuilt (a port
  // moved, the job gone) lets go of the pad without anything having to clear it.
  const padHeld = (o, st) => o._padSt === st && o._padIdx >= 0 && !!o.path && o.path[0] === o._padWp;
  function claimPad(st, d, wp) {
    if (d._padWp === wp && d._padSt === st && d._padIdx >= 0) return d._padIdx;
    const taken = CHARGER_PADS.map(() => false);
    for (const p of EntityRegistry.getByType(T.DRONEPORT))
      for (const o of (p._drones || [])) if (o !== d && padHeld(o, st)) taken[o._padIdx] = true;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < taken.length; i++) {
      if (taken[i]) continue;
      const q = chargerPadPos(st, i), dist = Math.hypot(q.x - d.x, q.y - d.y);
      if (dist < bestD) { bestD = dist; best = i; }
    }
    if (best >= 0) { d._padSt = st; d._padIdx = best; d._padWp = wp; }
    return best;
  }
  // The drone on each of a charging port's pads (null where it is empty),
  // for the sprite and the info panel.
  function chargerPads(st) {
    const out = CHARGER_PADS.map(() => null);
    for (const p of EntityRegistry.getByType(T.DRONEPORT))
      for (const o of (p._drones || [])) if (padHeld(o, st)) out[o._padIdx] = o;
    return out;
  }

  // Centre of a footprint, in world pixels.
  function centreOf(e) {
    return { x: (e.col + (e.width  || 1) / 2) * TILE,
             y: (e.row + (e.height || 1) / 2) * TILE };
  }

  // Slowed while a storm is running: the Rainstorm (lightning, high wind),
  // the dry Storm (high wind) and the Blizzard. The fleet keeps flying
  // through the thing that breaks the city, only slower.
  //
  // Keyed on the storm's own effects, not on rain. It used to read
  // RainSystem.isActive(), which is also true in a light Rainfall (no wind,
  // no lightning) and false in a dry Storm.
  //
  // Keyed on the weather event itself (a blizzard is the winter rainstorm,
  // whiteout and gale), not on the wind streaks and lightning that draw it:
  // those are presentation, they fade out for a moment after the event has
  // ended, and the panels name the weather from this, so it has to be the
  // weather the rest of the game says is happening. On a contract site there
  // is no event, only the site's own sky (WeatherEventSystem's override).
  // The fleet is never grounded: in a storm it flies slower, bucking the
  // wind, at `speed` of its cruise (stormCrawl). A slower drone draws less
  // as well, so range holds and no job drops out of reach; work just takes
  // longer, which is what makes the storm cost something.
  const STORM_WEATHER = {
    rainstorm: { name: 'Rainstorm', icon: '🌧', speed: 0.6 },
    storm:     { name: 'Gale',      icon: '💨', speed: 0.5 },
    blizzard:  { name: 'Blizzard',  icon: '🌬', speed: 0.45 },
  };
  function slowedBy() {
    if (typeof WeatherEventSystem === 'undefined') return null;
    const site = WeatherEventSystem.getVisualOverride ? WeatherEventSystem.getVisualOverride() : null;
    const type = site !== null && site !== undefined ? site : (WeatherEventSystem.getActiveEvent() || {}).type;
    return STORM_WEATHER[type] || null;
  }

  // Heat and cold don't ground the fleet, they work on its batteries. A cold
  // snap cuts what a cell will hold, so every drone's range shrinks and jobs
  // at the edge of coverage drop out of reach; charging is slower too. A heat
  // wave makes the pads throttle charging to keep the packs cool, so each
  // drone spends twice as long on the deck between sorties, and costs a
  // little range as well. Both lift the moment the weather does.
  const WEATHER_FLEET = {
    coldsnap: { battery: 0.7,  charge: 0.75, note: 'Cold snap: batteries hold 30% less, so range is shorter and far jobs wait' },
    heatwave: { battery: 0.85, charge: 0.5,  note: 'Heat wave: pads charge at half speed and range is a little shorter' },
  };
  function weatherEffect() {
    const ev = typeof WeatherEventSystem !== 'undefined' && WeatherEventSystem.getActiveEvent ? WeatherEventSystem.getActiveEvent() : null;
    return (ev && WEATHER_FLEET[ev.type]) || null;
  }
  // Seconds of flight in a full battery, and seconds to refill one, right now.
  // Cruise speed right now: slower in fog or a dust storm, where the pilot
  // (or the autopilot's cameras) can't see far, and crawling in a geomagnetic
  // storm, with navigation unreliable. That one stretches the battery by the
  // same factor (a drone at a crawl draws less), so range holds: jobs take
  // longer but none drop out of reach, which would amount to grounding.
  // A rainstorm, gale or blizzard slows it the same way (slowedBy).
  const stormCrawl = () => (typeof WeatherEventSystem !== 'undefined' && WeatherEventSystem.getDroneMult ? WeatherEventSystem.getDroneMult() : 1)
                         * ((slowedBy() || {}).speed || 1);
  const flySpeed = () => (def().speed || 620) * stormCrawl() * (typeof WeatherEventSystem !== 'undefined' && WeatherEventSystem.getTravelMult ? WeatherEventSystem.getTravelMult() : 1);
  const batteryCap = () => (def().battery || 66) * ((weatherEffect() || {}).battery || 1) / stormCrawl();
  const chargeSecs = () => (def().rechargeSecs || 12) / ((weatherEffect() || {}).charge || 1);

  // ── Fleet ────────────────────────────────────────────────────────
  // Built lazily so a port restored from a save, or one placed mid-tick,
  // gets its fleet without a separate construction path.
  function fleet(port) {
    if (isCharger(port)) return [];          // a charging port has no drones of its own
    const n = def().drones || 10;
    if (!port._drones || port._drones.length !== n) {
      port._drones = Array.from({ length: n }, (_, i) => {
        const p = padPos(port, i);
        return {
          i,
          x: p.x, y: p.y,    // world position, parked on its own pad
          state: 'idle',     // idle | launch | out | working | home | land
          battery: 1,        // 0..1 of def.battery seconds
          job: null,         // { kind, target }
          hover: 0,          // seconds hovered on station
          angle: 0,          // heading, for the renderer
          bob: Math.random() * Math.PI * 2,
          alt: 0,            // 0 = on the pad, 1 = at cruise. Drives the sprite.
          spin: 0,           // rotor speed, 0..1 -- spools up before the climb
          v: 0,              // current speed px/s -- ramped, never snapped
          lean: 0,           // -1..1 nose-down under accel, nose-up braking
          roll: 0,           // -1..1 bank through a turn
        };
      });
    }
    // A parked drone belongs on its pad, wherever the pad now is. A port can
    // be dragged to a new spot (or put back by undo) while the game is
    // paused, when frameTick is not running to move the fleet with it, and
    // the renderer comes through here: so this is where they follow.
    if (port._fleetCol !== port.col || port._fleetRow !== port.row) {
      port._fleetCol = port.col; port._fleetRow = port.row;
      for (const d of port._drones) if (d.state === 'idle') { const p = padPos(port, d.i); d.x = p.x; d.y = p.y; }
    }
    return port._drones;
  }

  // Anything not sitting on its pad is "out": it is drawing flight power and
  // it is not available for tasking. That deliberately includes the launch
  // and recovery legs -- a drone spooling up on the pad is already committed.
  const isOut = (d) => d.state !== 'idle';

  // ── Coverage networks ────────────────────────────────────────────
  // Every port covers a SQUARE reaching `def.radius` tiles from its centre
  // in each direction. Ports whose squares touch or overlap join into one
  // network, and a network is one airspace: any of its drones can work
  // anywhere inside the union of its squares.
  //
  // Squares rather than circles because squares make "fly through the
  // network" cheap to guarantee. A square is convex and the overlap of two
  // squares is a rectangle, so a path that goes square to square via a
  // point in each overlap never leaves the network -- see route().
  //
  // Rebuilt only when the set of ports moves (signature below), because
  // this is read inside per-entity job scans.
  let _netSig = '', _netOf = new Map(), _nets = [];
  const _pendingCache = new WeakMap();   // network -> { t, list }, see pending()

  function squareOf(port) {
    const c = centreOf(port), R = ((EntityDefs[port.type] || def()).radius || 110) * TILE;
    return { port, l: c.x - R, t: c.y - R, r: c.x + R, b: c.y + R };
  }
  const sqHas = (s, x, y) => x >= s.l && x <= s.r && y >= s.t && y <= s.b;
  const sqTouch = (a, b) => a.l <= b.r && b.l <= a.r && a.t <= b.b && b.t <= a.b;

  // Group ports into networks: connected components of touching squares.
  // Exposed so the renderers (and the placement ghost, which is not in the
  // registry) draw exactly the areas the dispatcher uses.
  function buildNetworks(ports) {
    const sqs = ports.map(squareOf);
    const seen = new Set(), nets = [];
    for (const s of sqs) {
      if (seen.has(s)) continue;
      const net = { squares: [] };
      const stack = [s]; seen.add(s);
      while (stack.length) {
        const a = stack.pop();
        net.squares.push(a);
        for (const b of sqs) if (!seen.has(b) && sqTouch(a, b)) { seen.add(b); stack.push(b); }
      }
      // Adjacency, for routing. Networks are a handful of ports at most.
      for (const a of net.squares) a.adj = net.squares.filter(b => b !== a && sqTouch(a, b));
      nets.push(net);
    }
    return nets;
  }

  function refreshNetworks() {
    const ports = stations();
    const sig = ports.map(p => (isCharger(p) ? 'c' : '') + p.col + ',' + p.row).join('|');
    if (sig === _netSig) return;
    _netSig = sig;
    // A port was moved, built or removed, so every route planned before now
    // may end at a pad (or stop to charge at a port) that is somewhere else.
    // A drone already on its way home used to fly to where its port had
    // been, arrive over empty ground, and blink across the map to its pad on
    // touchdown. Dropping the routes makes each drone in the air plan again
    // from where it is, to where its port and its job are now.
    for (const p of ports) for (const d of (p._drones || [])) { d.path = null; d._chargingAt = null; }
    _nets = buildNetworks(ports);
    _netOf = new Map();
    for (const n of _nets) for (const s of n.squares) _netOf.set(s.port, n);
  }

  // refreshNetworks() runs once at the top of tick() and frameTick(), not
  // here: this is called per drone per frame. A port placed since then is
  // simply a network of one until the next refresh.
  function netOf(port) { return _netOf.get(port) || buildNetworks([port])[0]; }

  // Is a target inside the network? Judged on the target's CENTRE, because
  // that is where the drone actually flies to -- a building only clipped by
  // the edge would put the last few metres of the flight outside coverage.
  function inNet(net, target) {
    const c = centreOf(target);
    for (const s of net.squares) if (sqHas(s, c.x, c.y)) return true;
    return false;
  }

  // Waypoints from `from` to `to` that stay inside the network, ending at
  // `to`; null if `to` is outside it.
  //
  // Breadth-first over touching squares, then one waypoint per square
  // boundary crossed: the point in the two squares' overlap nearest `to`.
  // Every leg then starts and ends inside one square, and a square is
  // convex, so no leg can cut a corner of the network. Clamping towards the
  // destination keeps the path as straight as the geometry allows -- two
  // ports side by side still fly direct.
  //
  // Battery swaps: with `swaps` set, the route also stops at the port of
  // every square it enters after the first (a powered one; never `home`,
  // which the drone is flying back to anyway). A stop is a waypoint with
  // `swap: port`: the drone hovers over the gantry, takes a fresh battery,
  // and carries on (followPath). Squares in a network always overlap, so
  // the hop from one swap to the next is short — that is what lets a drone
  // work the whole network rather than just as far as one charge reaches.
  function route(net, from, to, swaps, home) {
    const starts = net.squares.filter(s => sqHas(s, from.x, from.y));
    const ends   = new Set(net.squares.filter(s => sqHas(s, to.x, to.y)));
    if (!ends.size) return null;
    // Anything outside the network (a port demolished under it mid-flight)
    // just flies straight; stranding it helps nobody.
    if (!starts.length || starts.some(s => ends.has(s))) return [to];
    const prev = new Map(starts.map(s => [s, null]));
    const queue = [...starts];
    let hit = null;
    while (queue.length && !hit) {
      const a = queue.shift();
      for (const b of a.adj) {
        if (prev.has(b)) continue;
        prev.set(b, a);
        if (ends.has(b)) { hit = b; break; }
        queue.push(b);
      }
    }
    if (!hit) return [to];
    const chain = [];
    for (let s = hit; s; s = prev.get(s)) chain.unshift(s);
    const pts = [];
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = chain[i], b = chain[i + 1];
      pts.push({
        x: Math.max(Math.max(a.l, b.l), Math.min(to.x, Math.min(a.r, b.r))),
        y: Math.max(Math.max(a.t, b.t), Math.min(to.y, Math.min(a.b, b.b))),
      });
      // The port sits inside its own square, as does the next overlap
      // point, so detouring over it keeps every leg inside coverage.
      if (swaps && b.port && b.port !== home && b.port.powered) {
        const pc = centreOf(b.port);
        pts.push({ x: pc.x, y: pc.y, swap: b.port });   // followPath offsets the hover spot per drone
      }
    }
    pts.push(to);
    return pts;
  }

  function routeLen(net, from, to) {
    const pts = route(net, from, to) || [to];
    let len = 0, px = from.x, py = from.y;
    for (const p of pts) { len += Math.hypot(p.x - px, p.y - py); px = p.x; py = p.y; }
    return len;
  }

  // At a charge stop the drone hovers off to one side of the port and tops
  // up from it at the pad rate (rechargeSecs from empty), then carries on.
  // The port pays for it: see applyDraw's `_chargingAt`.
  const STOP_OFFSET = 4.5;   // hover about this many tiles out from the port centre (its deck edge), spread by drone index
  // Reserve kept when deciding to fly past a charge stop: the same 25% the
  // hop home keeps (canMakeRoundTrip), plus a few seconds for the braking
  // and climbing that straight-line distance over cruise speed leaves out.
  const SWAP_SKIP_MARGIN = 1.25;
  const SWAP_SKIP_SLACK  = 3;

  // Leave a job to a nearer port in the same network that has a drone on
  // the pad ready to fly it. Without this, whichever port the game loop
  // happens to tick first would take every job in the network, however far
  // across it the work was.
  //
  // `cargo`: only a port that can still launch a cargo run counts. Every
  // port holds drones back from cargo (cargoMaxConcurrent), so the port
  // nearest a source always has a couple idle on its pad -- and without
  // this they would block every other port in the chain from hauling,
  // capping a whole network's cargo at one port's share.
  function nearerPortFree(net, port, target, cargo) {
    const c = centreOf(target), own = centreOf(port);
    const mine = Math.hypot(c.x - own.x, c.y - own.y);
    for (const s of net.squares) {
      const p = s.port;
      if (p === port || !p.powered || isCharger(p)) continue;
      const pc = centreOf(p);
      if (Math.hypot(c.x - pc.x, c.y - pc.y) >= mine) continue;
      if (cargo && cargoOut(p) >= (def().cargoMaxConcurrent || 8)) continue;
      if (fleet(p).some(d => d.state === 'idle' && d.battery >= 0.35)) return true;
    }
    return false;
  }

  // Drones of this port on cargo runs, chained ones included.
  const cargoOut = (port) => fleet(port).filter(o => isOut(o) && o.job && o.job.kind === JOB_CARGO).length;

  // Outline of a network's coverage as world-pixel line segments: only the
  // outer boundary of the union, so overlapping squares read as one area.
  // Grid over every square edge, cells marked covered, then an edge wherever
  // covered meets uncovered, merged into runs so the dashes stay unbroken.
  function outline(net) {
    const xs = [...new Set(net.squares.flatMap(s => [s.l, s.r]))].sort((a, b) => a - b);
    const ys = [...new Set(net.squares.flatMap(s => [s.t, s.b]))].sort((a, b) => a - b);
    const nx = xs.length - 1, ny = ys.length - 1;
    const cov = (i, j) => {
      if (i < 0 || j < 0 || i >= nx || j >= ny) return false;
      const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      return net.squares.some(s => sqHas(s, cx, cy));
    };
    const segs = [];
    // Horizontal edges along each y line, then vertical along each x line.
    for (let j = 0; j <= ny; j++) {
      let run = null;
      for (let i = 0; i < nx; i++) {
        const edge = cov(i, j - 1) !== cov(i, j);
        if (edge && run === null) run = xs[i];
        if (!edge && run !== null) { segs.push([run, ys[j], xs[i], ys[j]]); run = null; }
      }
      if (run !== null) segs.push([run, ys[j], xs[nx], ys[j]]);
    }
    for (let i = 0; i <= nx; i++) {
      let run = null;
      for (let j = 0; j < ny; j++) {
        const edge = cov(i - 1, j) !== cov(i, j);
        if (edge && run === null) run = ys[j];
        if (!edge && run !== null) { segs.push([xs[i], run, xs[i], ys[j]]); run = null; }
      }
      if (run !== null) segs.push([xs[i], run, xs[i], ys[ny]]);
    }
    return segs;
  }

  // Can this drone fly every stop in `stops`, in order, and still get home
  // on what is left? Checked before committing, so a drone never strands
  // itself somewhere it has to be written off from.
  //
  // Takes a list rather than one target because a waste run is two legs:
  // source, then facility, then the pad. Checking only source-to-pad would
  // dispatch drones that cannot actually finish the job they were sent on.
  // `stationSecs` is time spent hovering rather than cruising -- loading and
  // unloading -- which a long hot run makes too large to hide in the reserve.
  // Distances are ROUTED ones (see route()): a job across the network costs
  // the dog-leg through the overlaps, not the straight line that would
  // leave coverage.
  //
  // The route stops to charge at the ports it passes (route()'s swaps), so
  // what has to fit in a battery is each HOP between charge stops, not the
  // whole trip: the first hop on what the drone has now, every later one on
  // a full charge. Across a network that means any job inside it is
  // reachable, which is the point of chaining ports.
  function canMakeRoundTrip(port, d, stops, stationSecs, net) {
    const speed = flySpeed();
    const cap   = batteryCap();
    net = net || netOf(port);
    const perStop = (stationSecs || 0) / Math.max(1, stops.length);
    // Every sortie pays for exactly one climb (first hop) and one descent (last).
    let budget = d.battery * cap, secs = LAUNCH_SECS;
    let from = { x: d.x, y: d.y };
    // A 25% reserve on the hop home: a drone that lands with literally
    // nothing left reads as a bug. A hop that ends at a charge stop only
    // keeps 10% — the refill there is certain, and if the flight runs long
    // anyway, needsCharge() sends the drone to the nearest port early.
    const legs = [...stops.map(s => ({ to: centreOf(s), station: perStop })), { to: centreOf(port), station: LAND_SECS, home: true }];
    for (const leg of legs) {
      const pts = route(net, from, leg.to, true, port) || [leg.to];
      let px = from.x, py = from.y;
      for (const p of pts) {
        secs += Math.hypot(p.x - px, p.y - py) / speed;
        px = p.x; py = p.y;
        if (p.swap) {
          if (secs * 1.1 > budget) return false;
          budget = cap; secs = 0;             // topped up to full at the stop
        }
      }
      secs += leg.station;
      from = leg.to;
    }
    return secs * 1.25 <= budget;
  }

  // Can the drone still reach somewhere to charge? The nearest powered port
  // in its network (its own included), with the same 20% margin the return
  // check always had. Returns null when it's fine, else the port to make for.
  function needsCharge(port, d) {
    const speed = flySpeed();
    const cap   = batteryCap();
    const net = netOf(port);
    let best = port, bestLen = routeLen(net, d, centreOf(port));
    for (const s of net.squares) {
      if (s.port === port || !s.port.powered) continue;
      const len = routeLen(net, d, centreOf(s.port));
      if (len < bestLen) { best = s.port; bestLen = len; }
    }
    return d.battery * cap <= (bestLen / speed) * 1.2 ? best : null;
  }

  // ── Jobs ─────────────────────────────────────────────────────────
  //
  // A repair job is claimed by exactly one drone. `_droneClaim` is stamped
  // on the target rather than tracked in a list here, so a building that
  // is demolished, repaired by hand or blown up mid-flight takes its claim
  // with it and the drone simply finds the job gone on arrival.
  // Every damaged building, gathered once per logic tick (tickServices
  // drops the list) instead of once per idle drone: this was a walk of the
  // whole registry -- trees and water included -- for each of up to ten
  // drones at each port, ten times a second.
  let _repairList = null;
  function repairCandidates() {
    if (_repairList) return _repairList;
    _repairList = [];
    // active(): every entity but water, trees and bushes, which lightning
    // and fire never damage (LightningDamageSystem's excluded list) and
    // which are over half of all() on a grown map.
    for (const o of EntityRegistry.active()) if (o._lightningDamaged && !o._irreparable) _repairList.push(o);
    return _repairList;
  }

  // Is this building spoken for by some other drone? A claim whose drone no
  // longer has a port (the port was removed mid-sortie) is nobody's.
  function claimedByOther(o, d) {
    const c = o._droneClaim;
    if (!c || c === d) return false;
    return !!(c.job && c.job.port && EntityRegistry.getByType(T.DRONEPORT).has(c.job.port));
  }

  // How much faster a building's repair runs right now: 1, or 1 + the
  // port's repairBoost while a drone is on station working on it. Read by
  // LightningDamageSystem's repair clock.
  function repairBoost(e) {
    const d = e && e._droneClaim;
    if (!d || d.state !== 'working' || !d.job || d.job.kind !== JOB_REPAIR || d.job.target !== e || !d.job.onSite) return 1;
    if (!d.job.port || !EntityRegistry.getByType(T.DRONEPORT).has(d.job.port)) return 1;
    return 1 + (def().repairBoost ?? 0.6);
  }

  function findRepairJob(port, d, net) {
    if (typeof LightningDamageSystem === 'undefined') return null;
    let best = null, bestDist = Infinity;
    for (const o of repairCandidates()) {
      if (!o._lightningDamaged || o._irreparable) continue;
      // A repair already under way (the player started it, or a drone that
      // has since left) is still a job: the drone goes and speeds it up.
      if (claimedByOther(o, d)) continue;
      if (!inNet(net, o)) continue;
      const c = centreOf(o);
      const dist = Math.hypot(c.x - d.x, c.y - d.y);
      if (dist >= bestDist || nearerPortFree(net, port, o)) continue;
      if (canMakeRoundTrip(port, d, [o], ARRIVE_HOVER, net)) { best = o; bestDist = dist; }
    }
    return best;
  }

  // -- Waste runs ---------------------------------------------------
  //
  // Scoped to keeping a source off its hard stop, not to replacing the truck
  // fleet. Three things enforce that, and the band above does most of it:
  //
  //   - The band. A source is only eligible at 85% and the fleet stands off
  //     below 70%, so drones shave the top of a buffer and then stop, no
  //     matter how many ports get built.
  //   - One drone per source, via the same `_droneClaim` stamp repairs use,
  //     held for the WHOLE sortie so a source is never swarmed.
  //   - The facility has to be in the PORT's radius too. If the waste
  //     facility is across the map there is no drone job at all, which keeps
  //     long haul a truck problem by construction rather than by tuning.
  const payloadFor  = (cfg) => isHot(cfg) ? (def().wastePayloadHot  || 7)
                                          : (def().wastePayload     || 20);
  const loadSecsFor = (cfg) => isHot(cfg) ? (def().wasteLoadSecsHot || 4)
                                          : (def().wasteLoadSecs    || 2.5);

  // Room left in a facility, in units. Uses the same figure HaulSystem does,
  // so a drone and a truck call a facility full at the same moment.
  function facilityRoom(fac) {
    const fd = EntityDefs[fac.type] || {};
    return (fd.storageCapacity || 300) - (fac._wasteStored || 0);
  }

  // Nearest facility of the right kind, inside the port's NETWORK, with room.
  function findFacility(port, cfg) {
    let best = null, bestDist = Infinity;
    const c = centreOf(port), net = netOf(port);
    for (const f of EntityRegistry.getByType(cfg.facilityType)) {
      if (facilityRoom(f) <= 0.5) continue;
      if (!inNet(net, f)) continue;
      const fc = centreOf(f);
      const dist = Math.hypot(fc.x - c.x, fc.y - c.y);
      if (dist < bestDist) { best = f; bestDist = dist; }
    }
    return best;
  }

  // The hysteresis latch, read and updated in the same pass so it can never
  // go stale. Not saved: a reload re-arms at 85%, the same way
  // checkWasteBuildup's own warning latch re-warns once.
  function shaving(src, cfg) {
    const cap = cfg.cap() || 100;
    const pct = ((src[cfg.field] || 0) / cap) * 100;
    if (pct >= WASTE_DISPATCH_PCT)       src._droneShaving = true;
    else if (pct < WASTE_STAND_DOWN_PCT) src._droneShaving = false;
    return !!src._droneShaving;
  }

  function findWasteJob(port, d, net) {
    if (typeof WASTE_CFG === 'undefined' || typeof WASTE_SOURCES === 'undefined') return null;
    let best = null, bestDist = Infinity, bestCfg = null, bestFac = null;
    for (const srcType of WASTE_SOURCES) {
      const cfg = WASTE_CFG[srcType];
      if (!cfg) continue;
      // Looked up once per waste stream rather than once per source: with no
      // facility in range, every source of that kind is unreachable anyway.
      let fac = null, looked = false;
      for (const src of EntityRegistry.getByType(srcType)) {
        if (src._droneClaim && src._droneClaim !== d) continue;
        if (haulBlocked(src)) continue;
        if (!inNet(net, src)) continue;
        if (!shaving(src, cfg)) continue;
        if (nearerPortFree(net, port, src)) continue;
        if (!looked) { fac = findFacility(port, cfg); looked = true; }
        if (!fac) break;
        // Both hovers, both ways: a hot run spends 8s on station out of a
        // 66s battery, far too much to leave to the 25% reserve.
        const station = loadSecsFor(cfg) * 2 + ARRIVE_HOVER * 2;
        if (!canMakeRoundTrip(port, d, [src, fac], station, net)) continue;
        const c = centreOf(src);
        const dist = Math.hypot(c.x - d.x, c.y - d.y);
        if (dist < bestDist) { best = src; bestDist = dist; bestCfg = cfg; bestFac = fac; }
      }
    }
    if (!best) return null;
    return { kind: JOB_WASTE, target: best, claim: best, cfg: bestCfg, fac: bestFac,
             hot: isHot(bestCfg), leg: 'pickup', port, amount: 0, src: null };
  }

  // -- Line servicing: the serviced-span register ------------------
  //
  // Held here rather than as a timestamp on each conductor so the clock runs
  // in SIM seconds. The drone fleet is ticked with the scaled simDt, so a
  // Date.now() deadline would quietly shorten every sweep the moment the
  // player hits fast-forward, and the buff would not match the flying that
  // earned it.
  const _serviced = new Map();   // conductor -> sim-seconds of protection left

  function markServiced(e, secs) {
    _serviced.set(e, Math.max(secs, _serviced.get(e) || 0));
    e._wireServiced = true;      // what power_network's fault roll reads
  }

  function serviceLeft(e) { return _serviced.get(e) || 0; }

  // Candidate conductors, rebuilt on an interval rather than per drone.
  // A built-up city's wire count dwarfs every other entity type combined
  // (power_network says as much), and this would otherwise be a full scan
  // of it per idle drone per tick per port. Half a second of staleness in
  // picking which span to fly to is invisible; the scan cost is not.
  const WIRE_SCAN_INTERVAL = 0.5;
  let _wireScanIn = 0, _wireCandidates = [];

  function rescanWires(dt) {
    _wireScanIn -= dt;
    if (_wireScanIn > 0) return;
    _wireScanIn = WIRE_SCAN_INTERVAL;
    _wireCandidates.length = 0;
    const D = def();
    const dur = D.wireServiceDuration || 120;
    for (const type of [T.WIRE, T.POLE]) {
      for (const e of EntityRegistry.getByType(type)) {
        const s = wireStress(e);
        if (s < WIRE_MIN_STRESS || s >= WIRE_MAX_STRESS) continue;
        if (serviceLeft(e) > dur * WIRE_REFRESH_AT) continue;
        _wireCandidates.push(e);
      }
    }
  }

  // Ticked once a frame from the game loop, not per port: the register is
  // fleet-wide, and a span serviced by one port's drone is serviced.
  function tickServices(dt) {
    _repairList = null;
    if (dt > 0) {
      for (const [e, left] of _serviced) {
        const n = left - dt;
        if (n <= 0) { _serviced.delete(e); e._wireServiced = false; }
        else _serviced.set(e, n);
      }
    }
    rescanWires(dt);
  }

  function findWireJob(port, d, net) {
    if (!_wireCandidates.length) return null;

    // Already-committed sweeps. This port's own cap how many it flies at
    // once; every sweep in the NETWORK keeps a second drone off a span the
    // first one is about to cover, whichever port it came from.
    const inFlight = [], netFlight = [];
    for (const s of net.squares) {
      if (isCharger(s.port)) continue;
      for (const o of fleet(s.port)) {
        if (o === d || !isOut(o) || !o.job || o.job.kind !== JOB_WIRE) continue;
        netFlight.push(o.job.target);
        if (s.port === port) inFlight.push(o.job.target);
      }
    }
    if (inFlight.length >= WIRE_MAX_CONCURRENT) return null;

    const radius = (def().wireServiceRadius || 6) * TILE;
    let best = null, bestDist = Infinity;
    for (const e of _wireCandidates) {
      if (e._droneClaim && e._droneClaim !== d) continue;
      if (!GridManager.getEntity(e.col, e.row)) continue;
      if (!inNet(net, e)) continue;
      const c = centreOf(e);
      // Skip anything another drone's sweep will already cover -- two drones
      // hovering over the same run of wire is two drones doing one job.
      let covered = false;
      for (const t of netFlight) {
        const tc = centreOf(t);
        if (Math.hypot(tc.x - c.x, tc.y - c.y) <= radius) { covered = true; break; }
      }
      if (covered) continue;
      // The fleet is a load on the grid it services -- don't launch a sortie
      // that would redline the span it is being sent to protect.
      if (!canAbsorbSortie(port, e, inFlight.length)) continue;
      const dist = Math.hypot(c.x - d.x, c.y - d.y);
      if (dist >= bestDist) continue;
      if (nearerPortFree(net, port, e)) continue;
      if (!canMakeRoundTrip(port, d, [e], ARRIVE_HOVER + (def().wireServiceSecs || 3), net)) continue;
      best = e; bestDist = dist;
    }
    if (!best) return null;
    return { kind: JOB_WIRE, target: best, claim: best };
  }

  // -- Cargo runs --------------------------------------------------
  //
  // Solids, liquids and gases flown from where they are made to a storage
  // vessel the player has flagged for drone supply (`_droneSupply = kind`
  // on a Storage Container, Liquid Storage Tank or Gas Holder). The vessel
  // is the destination rather than the consumer itself because every
  // consumer in the game already finds a vessel on its input belt or pipe
  // and draws from it exactly as it would from the producer -- so a drone-
  // fed bin beside a plant feeds that plant with no per-consumer code, and
  // the vessel doubles as the buffer between sorties.
  //
  // Same reservation model as waste: nothing leaves the source at pickup,
  // the whole transfer happens in one step at delivery, so a demolished
  // vessel, a storm or a reload can never destroy units in a drone's hold.
  //
  // A producer keeps no reserve from the fleet (it used to be 20% of its
  // buffer: 100 rods sat at a Fuel Plant beside two empty bins). Whatever draws
  // straight off a producer takes a little every tick, while a drone only
  // comes once a load's minimum has piled up (cargoMinLoad), so a line that is
  // using all the output leaves nothing for a drone to fly for. An unflagged
  // vessel holding the kind is a source too (mine -> belt -> bin -> drone).
  const CARGO_LAUNCH_GAP   = 1.5;
  const CARGO_EVEN_MARGIN  = 0.05;   // share of a vessel (see findCargoJob)

  // Which pellet fuel a Storage Container's reactor burns: 'dt' if its belt
  // runs to a Fusion Reactor's PELLETS IN, 'dhe3' for an Advanced Fusion
  // Reactor's, null if it feeds neither or both. Worked out once a tick.
  // (An empty bin flagged for pellets used to take either fuel. On a job
  // site with the client's D-He3 store standing unflagged, a Hauler filled
  // the bin on a Fusion Reactor's belt with D-He3, which that reactor will
  // not burn and which then kept the D-T pellets out of the bin.)
  let _pfTick = -1, _pfMap = null;
  function pelletFuelWanted(bin) {
    if (_pfTick !== SIM_TICK_ID || !_pfMap) {
      _pfTick = SIM_TICK_ID; _pfMap = new Map();
      const note = (type, sys, fuel) => {
        if (type === undefined || typeof sys === 'undefined' || !sys || !sys.getStubs) return;
        for (const r of EntityRegistry.getByType(type)) {
          const st = sys.getStubs(r).plasmaIn;
          if (!st) continue;
          const run = beltRun(st.c, st.r);
          for (let i = 0; i < run.n; i++) {
            const e = run.ent[i];
            if (!e || e.type !== T.SOLIDSTORAGE) continue;
            _pfMap.set(e, _pfMap.has(e) && _pfMap.get(e) !== fuel ? null : fuel);
          }
        }
      };
      note(T.HULKINGFUSIONREACTOR, typeof HulkingFusionReactorSystem !== 'undefined' ? HulkingFusionReactorSystem : null, 'dt');
      note(T.ADVFUSIONREACTOR, typeof AdvancedFusionReactorSystem !== 'undefined' ? AdvancedFusionReactorSystem : null, 'dhe3');
    }
    return _pfMap.get(bin) || null;
  }

  // Phase -> the vessel that stores it.
  const VESSELS = {
    solid: {
      type: () => T.SOLIDSTORAGE,
      held: (e) => ((e._stored || 0) > 0.001 ? e._solidType : null),
      amount: (e) => e._stored || 0,
      room(e, k, meta) {
        if (!SolidStorageSystem.online(e)) return 0;
        const h = VESSELS.solid.held(e);
        if (h && h !== k) return 0;
        // Pellets come in two fuels that must not mix in one bin.
        if (h === 'pellets' && meta && (e._pelletMode || 'dt') !== meta) return 0;
        // "Fuel Pellets" is D-T: D-He3 has its own flag and its own cargo.
        if (k === 'pellets' && meta === 'dhe3') return 0;
        // ...and a bin on a reactor's belt takes only the fuel it burns.
        if (k === 'pellets' && meta) { const want = pelletFuelWanted(e); if (want && want !== meta) return 0; }
        return SolidStorageSystem.space(e);
      },
      put(e, k, amt, meta) {
        const took = SolidStorageSystem.deposit(e, amt, k);
        if (took > 0 && k === 'pellets' && meta) e._pelletMode = meta;
        return took;
      },
      take(e, amt) { e._stored = Math.max(0, (e._stored || 0) - amt); },
    },
    liquid: {
      type: () => T.OILSTORAGE,
      held: (e) => ((e._crude || 0) > 0.001 ? e._liquidType : null),
      amount: (e) => e._crude || 0,
      room(e, k) {
        if (!OilSystem.tankOnline(e) || e._draining) return 0;
        const h = VESSELS.liquid.held(e);
        if (h && h !== k) return 0;
        return Math.max(0, OilSystem.getTankCapacity() - (e._crude || 0));
      },
      put(e, k, amt) {
        const took = Math.min(amt, VESSELS.liquid.room(e, k));
        if (took <= 0) return 0;
        e._crude = (e._crude || 0) + took;
        e._liquidType = k;
        return took;
      },
      take(e, amt) { e._crude = Math.max(0, (e._crude || 0) - amt); },
    },
    gas: {
      type: () => T.GASSTORAGE,
      held: (e) => (GasStorageSystem.stored(e) > 0.001 ? e._gasType : null),
      amount: (e) => GasStorageSystem.stored(e),
      room(e, k) {
        if (!GasStorageSystem.online(e) || e._draining) return 0;
        const h = VESSELS.gas.held(e);
        if (h && h !== k) return 0;
        return Math.max(0, GasStorageSystem.capacity() - GasStorageSystem.stored(e));
      },
      put(e, k, amt) {
        const took = Math.min(amt, VESSELS.gas.room(e, k));
        if (took <= 0) return 0;
        // An emptied holder may still name its old gas; clear that residue
        // before relabelling, so nothing stale rides along in the old field.
        if (e._gasType && e._gasType !== k) e[GasStorageSystem.KINDS[e._gasType].field] = 0;
        const f = GasStorageSystem.KINDS[k].field;
        e[f] = (e[f] || 0) + took;
        e._gasType = k;
        return took;
      },
      take(e, amt) {
        const K = e._gasType && GasStorageSystem.KINDS[e._gasType];
        if (K) e[K.field] = Math.max(0, (e[K.field] || 0) - amt);
      },
    },
  };

  // Every drone-haulable kind: its phase, label and producers. `avail` is
  // the surplus a drone may take; `take` removes it. Built lazily -- the
  // storage systems' tables and T are not all defined when this file loads.
  let _cargo = null;
  function cargoKinds() {
    if (_cargo) return _cargo;
    const C = {};
    const buffered = (types, field) => ({
      types,
      avail: (s) => s[field] || 0,
      take:  (s, a) => { s[field] = Math.max(0, (s[field] || 0) - a); },
    });
    // Solids. Coal is pushed by mines rather than listed in the bin's table.
    C.coal = { phase: 'solid', label: 'Coal',
               ...buffered([T.COALMINE, T.COALMINE2], '_coalBuffer') };
    for (const k in SolidStorageSystem.KINDS) {
      const K = SolidStorageSystem.KINDS[k];
      C[k] = { phase: 'solid', label: SolidStorageSystem.label(k) || k,
               ...buffered([K.type()], K.field) };
    }
    // Liquids -- the tank's own four fluid labels.
    C.oil = { phase: 'liquid', label: 'Crude Oil', types: [T.PUMPJACK, T.PUMPJACK2],
              // Crude sits on the jack's deposit until it is piped away.
              avail: (s) => (s._linkedDeposit && s._linkedDeposit._crudeBuffer) || 0,
              take:  (s, a) => { const d = s._linkedDeposit; if (d) d._crudeBuffer = Math.max(0, (d._crudeBuffer || 0) - a); } };
    // An extractor holds no buffer: water is there whenever it has power.
    C.water = { phase: 'liquid', label: 'Water', types: [T.WATEREXTRACTOR],
                avail: (s) => (s.powered ? Infinity : 0), take: () => {} };
    C.acid = { phase: 'liquid', label: 'Sulfuric Acid',
               ...buffered([T.CHEMICALPLANT], '_acid') };
    C.fuel = { phase: 'liquid', label: 'Fuel Oil',
               ...buffered([T.REFINERY], '_fuelOil') };
    // Gases. A gas can have more than one producer (tritium: the breeder and
    // the reactor).
    for (const k in GasStorageSystem.KINDS) {
      const K = GasStorageSystem.KINDS[k];
      const prods = GasStorageSystem.producersOf(K);
      C[k] = { phase: 'gas', label: K.label, ...buffered(prods.map(p => p.type()), K.field) };
    }
    return (_cargo = C);
  }

  const cargoPayload = (kind) => {
    const D = def(), ph = cargoKinds()[kind].phase;
    return ph === 'gas' ? (D.cargoPayloadGas || 415)
         : ph === 'liquid' ? (D.cargoPayloadLiquid || 166) : (D.cargoPayloadSolid || 133);
  };
  // The least a source must have spare before a drone will fly for it. A share
  // of the load, smaller for solids and liquids since their loads doubled: at
  // the old share a Fuel Plant with 28 rods spare stood idle beside empty bins.
  const cargoMinLoad = (kind, room) => Math.min(cargoPayload(kind), room) * (cargoKinds()[kind].phase === 'gas' ? 0.4 : 0.2);
  // A reactor about to starve: a Storage Container on a fusion reactor's
  // PELLETS IN holding (with what is already in the air for it) less than a
  // load is topped up as soon as a few pellets are spare, not when a fifth of
  // a load has piled up at the plant. On a line that only just keeps up the
  // reactor was running its bin dry while the next load waited to be big
  // enough, and stopping and starting between drones that sat idle.
  const TOPUP_MIN = 4;
  function minLoadFor(kind, dest, room) {
    const base = cargoMinLoad(kind, room);
    if ((kind !== 'pellets' && kind !== 'he3pellets') || !dest || dest.type !== T.SOLIDSTORAGE || !pelletFuelWanted(dest)) return base;
    const held = (dest._stored || 0) + inboundTo(dest);
    return held < cargoPayload(kind) ? Math.min(base, TOPUP_MIN) : base;
  }

  // A source is a producer of the kind, or an UNFLAGGED vessel holding it.
  // Flagged vessels are never sources, which is what stops two drone-fed
  // bins passing the same stock back and forth forever.
  const isVessel = (s) => Object.values(VESSELS).some(V => V.type() === s.type);
  function srcAvail(kind, s) {
    if (isVessel(s)) return VESSELS[cargoKinds()[kind].phase].amount(s);
    return cargoKinds()[kind].avail(s);
  }
  function srcTake(kind, s, amt) {
    if (isVessel(s)) VESSELS[cargoKinds()[kind].phase].take(s, amt);
    else cargoKinds()[kind].take(s, amt);
  }
  // Which pellet fuel a source is handing over (null for anything else).
  function pelletMeta(kind, s) {
    if (kind !== 'pellets') return null;
    if (s.type === T.SOLIDSTORAGE) return s._pelletMode || 'dt';
    return s._fuelMode === 'dhe3' ? 'dhe3' : 'dt';
  }
  // What an unflagged vessel counts as holding, for anyone looking for a
  // source. A bin of pellets marked D-He3 (how a client's D-He3 store is
  // written, and bins from before the two fuels were separate cargoes) is
  // D-He3 Fuel Pellets, not Fuel Pellets.
  // (It used to answer to "Fuel Pellets", so a bin flagged for those, the
  // D-T a Fusion Reactor burns, was filled from the client's D-He3 store.)
  function sourceKind(V, v) {
    const h = V.held(v);
    return h === 'pellets' && (v._pelletMode || 'dt') === 'dhe3' ? 'he3pellets' : h;
  }
  function* cargoSources(kind) {
    const K = cargoKinds()[kind], V = VESSELS[K.phase];
    for (const t of K.types) yield* EntityRegistry.getByType(t);
    // On a job where the crew makes its own fuel "nothing is supplied": the
    // client's stores are not there to be hauled from.
    const noClient = typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite && ContractSystem.isAtSite()
                  && ContractSystem.ownFuelJob && ContractSystem.ownFuelJob();
    for (const v of EntityRegistry.getByType(V.type())) {
      if (v._droneSupply || v._truckSupply) continue;
      if (noClient && v._clientOwned) continue;
      if (sourceKind(V, v) === kind) yield v;
    }
  }

  // Units already committed to a vessel by drones in the air, so five idle
  // drones do not all launch to fill the same last 40 units of room.
  function inboundTo(dest) {
    let n = 0;
    for (const p of EntityRegistry.getByType(T.DRONEPORT)) {
      for (const o of (p._drones || [])) {
        const j = o.job;
        if (j && j.kind === JOB_CARGO && j.dest === dest)
          n += j.leg === 'deliver' ? j.amount : cargoPayload(j.cargo);
      }
    }
    return n;
  }

  // Units already spoken for at a source by drones in the air. Cargo runs
  // do NOT claim their source the way repairs and waste do -- several
  // drones may work one producer at once, back to back -- so this is what
  // keeps them from all being promised the same stock.
  function reservedFrom(src) {
    let n = 0;
    for (const p of EntityRegistry.getByType(T.DRONEPORT)) {
      for (const o of (p._drones || [])) {
        const j = o.job;
        if (!j || j.kind !== JOB_CARGO) continue;
        if (j.leg === 'deliver' ? j.src === src : j.target === src)
          n += j.leg === 'deliver' ? j.amount : cargoPayload(j.cargo);
      }
    }
    return n;
  }

  // `chained`: the drone is already in the air, just back from a delivery,
  // and is looking for its next run from where it is rather than flying
  // home empty first. It skips the launch gap (it is not launching) and
  // the nearer-port check (it is closer to the work than any pad).
  function findCargoJob(port, d, net, chained) {
    // Cheap early-out: nothing flagged anywhere means no cargo work at all.
    const dests = [];
    for (const ph in VESSELS)
      for (const v of EntityRegistry.getByType(VESSELS[ph].type()))
        if (v._droneSupply && cargoKinds()[v._droneSupply] && inNet(net, v)) dests.push(v);
    if (!dests.length) return null;

    // One cargo launch per port every CARGO_LAUNCH_GAP seconds, so drones
    // sharing a run stream out one after another instead of as one clump.
    if (!chained && (port._cargoCooldown || 0) > 0) return null;
    const cap = def().cargoMaxConcurrent || 8;
    if (fleet(port).filter(o => o !== d && isOut(o) && o.job && o.job.kind === JOB_CARGO).length >= cap) return null;

    const station = (def().cargoLoadSecs || 2) * 2 + ARRIVE_HOVER * 2;
    let best = null, bestCost = Infinity;
    // Vessels asking for the same cargo fill evenly: one more than
    // CARGO_EVEN_MARGIN fuller than the emptiest waits its turn. Scarce cargo
    // used to go to whichever was nearest, so with one Fuel Plant's rods a
    // second bin stood empty until the near one was a sixth full. Second pass,
    // no such turn: a vessel no drone can reach never holds up the rest.
    const fillOf = (dest, V, room, inbound) => {
      const held = V.amount(dest);
      return Math.max(0, Math.min(1, (held + inbound) / Math.max(1, held + inbound + room)));
    };
    const emptiest = {};
    for (const dest of dests) {
      const kind = dest._droneSupply, V = VESSELS[cargoKinds()[kind].phase];
      const inbound = inboundTo(dest), room = V.room(dest, kind, null) - inbound;
      if (room < cargoPayload(kind) * 0.5) continue;
      emptiest[kind] = Math.min(emptiest[kind] ?? 1, fillOf(dest, V, room, inbound));
    }
    for (const evenly of [true, false]) {
      for (const dest of dests) {
        const kind = dest._droneSupply, V = VESSELS[cargoKinds()[kind].phase];
        const payload = cargoPayload(kind);
        const inbound = inboundTo(dest);
        const room = V.room(dest, kind, null) - inbound;
        if (room < payload * 0.5) continue;              // tops up; does not chase the last few units
        // The emptier the vessel (counting what is already in the air for it),
        // the nearer its run looks. On distance alone the shortest run always
        // won, and a vessel on a long one got nothing for as long as any short
        // run still had room: a helium holder 400 tiles from its well stood
        // empty behind a fleet flying lithium next door, with 4,000 units of
        // helium waiting at the well, until every Fusion Reactor it cooled had
        // quenched. Squared, so a vessel with a few loads coming stops pulling.
        const fill = fillOf(dest, V, room, inbound);
        if (evenly && fill > emptiest[kind] + CARGO_EVEN_MARGIN) continue;
        const pull = 0.02 + fill * fill;
        const dc = centreOf(dest);
        for (const src of cargoSources(kind)) {
          if (src === dest) continue;
          if (src._lightningDamaged) continue;
          if (srcAvail(kind, src) - reservedFrom(src) < minLoadFor(kind, dest, room)) continue;
          const meta = pelletMeta(kind, src);
          if (meta && V.room(dest, kind, meta) <= 0) continue;
          if (!inNet(net, src)) continue;
          const sc = centreOf(src);
          // Whole-trip distance, so a close source with a far delivery does
          // not beat a slightly further one sitting next to the vessel.
          const cost = (Math.hypot(sc.x - d.x, sc.y - d.y) + Math.hypot(dc.x - sc.x, dc.y - sc.y)) * pull;
          if (cost >= bestCost) continue;
          if (!chained && nearerPortFree(net, port, src, true)) continue;
          if (!canMakeRoundTrip(port, d, [src, dest], station, net)) continue;
          best = { src, dest, kind }; bestCost = cost;
        }
      }
      if (best) break;
    }
    if (!best) return null;
    return { kind: JOB_CARGO, target: best.src, claim: null, dest: best.dest,
             cargo: best.kind, phase: cargoKinds()[best.kind].phase,
             leg: 'pickup', amount: 0, src: null, meta: null, port };
  }

  // Priority: a building that is already off, then a line that is about to
  // take the whole network down with it, then a source that is about to
  // stop, then routine supply. A burnout costs more than a stall, which is
  // why wire beats waste; cargo is logistics, so it only ever gets the
  // drones nothing more urgent wanted.
  function findJob(port, d) {
    const net = netOf(port);
    const r = findRepairJob(port, d, net);
    if (r) return { kind: JOB_REPAIR, target: r, claim: r, port };
    const w = findWireJob(port, d, net);
    if (w) return w;
    const h = findWasteJob(port, d, net);
    if (h) return h;
    const fc = findCoreJob(port, d, net);
    if (fc) return fc;
    return findCargoJob(port, d, net);
  }

  // -- Field Core swaps ----------------------------------------------
  //
  // One core per sortie, one carrier per reactor (the claim, held all
  // sortie; FieldCoreSystem.truckOn keeps Haulers off it too). The waste
  // run's rule holds: a core is reserved at pickup and moved at delivery,
  // so a storm, a demolished port or a reload leaves it where it was.
  //   collect: reactor (spent core in its outgoing bay) → Core Works
  //   deliver: Core Works (a charged core) → reactor, and if that swaps a
  //            low core out, on to a Core Works with it (leg 'return')
  // The outgoing bay is emptied first: a full one is what blocks a swap.
  // Both ends have to be in the network, like a waste run's facility.
  const CORE_HOVER = 2;   // latching a core in or out
  const coreHosts = () => [...EntityRegistry.getByType(T.HULKINGFUSIONREACTOR), ...EntityRegistry.getByType(T.ADVFUSIONREACTOR)];
  function nearestTo(list, e) {
    const c = centreOf(e);
    let best = null, bestD = Infinity;
    for (const o of list) { const oc = centreOf(o), dd = Math.hypot(oc.x - c.x, oc.y - c.y); if (dd < bestD) { bestD = dd; best = o; } }
    return best;
  }
  function findCoreJob(port, d, net) {
    if (typeof FieldCoreSystem === 'undefined' || typeof CoreWorksSystem === 'undefined') return null;
    const works = [...EntityRegistry.getByType(T.COREWORKS)].filter(w => inNet(net, w));
    if (!works.length) return null;
    let best = null, bestDist = Infinity;
    for (const r of coreHosts()) {
      const collect = FieldCoreSystem.collectable(r), deliver = FieldCoreSystem.deliverable(r) > 0;
      if (!collect && !deliver) continue;
      if (!inNet(net, r) || claimedByOther(r, d) || FieldCoreSystem.truckOn(r)) continue;
      const c = centreOf(r), dist = Math.hypot(c.x - d.x, c.y - d.y);
      if (dist >= bestDist || nearerPortFree(net, port, r)) continue;
      let job = null;
      if (collect) {
        const w = nearestTo(works.filter(w => CoreWorksSystem.emptyBays(w) > 0), r);
        if (w && canMakeRoundTrip(port, d, [r, w], CORE_HOVER * 2, net))
          job = { kind: JOB_CORE, mode: 'collect', leg: 'pickup', target: r, claim: r, reactor: r, works: w, port };
      } else {
        const w = nearestTo(works.filter(w => FieldCoreSystem.freeCharged(w).length > 0), r);
        if (w && canMakeRoundTrip(port, d, [w, r, w], CORE_HOVER * 3, net))
          job = { kind: JOB_CORE, mode: 'deliver', leg: 'pickup', target: w, claim: r, reactor: r, works: w, port };
      }
      if (job) { best = job; bestDist = dist; }
    }
    if (best && best.mode === 'deliver') {
      best.coreId = FieldCoreSystem.reserveBay(best.works, d);
      if (!best.coreId) return null;
    }
    return best;
  }

  // Seconds on station for this job's current leg.
  function hoverFor(job) {
    if (job && job.kind === JOB_WASTE) return ARRIVE_HOVER + loadSecsFor(job.cfg);
    if (job && job.kind === JOB_WIRE)  return ARRIVE_HOVER + (def().wireServiceSecs || 3);
    if (job && job.kind === JOB_CARGO) return ARRIVE_HOVER + (def().cargoLoadSecs || 2);
    if (job && job.kind === JOB_CORE)  return ARRIVE_HOVER + CORE_HOVER;
    return ARRIVE_HOVER;
  }

  // The job is still worth flying to. Re-checked on arrival because the
  // world moves while a drone is in the air.
  function jobStillValid(job) {
    const t = job && job.target;
    if (!t || !GridManager.getEntity(t.col, t.row)) return false;
    if (job.kind === JOB_REPAIR) {
      // Valid for as long as the building is damaged: the drone stays on it
      // through the whole repair, whoever started it.
      return !!t._lightningDamaged && !t._irreparable;
    }
    if (job.kind === JOB_WIRE) {
      // Deliberately NOT re-checked against the band. Instantaneous stress
      // on a loaded network flaps hard tick to tick: a conductor that trips
      // is dropped from the connectivity BFS, so the whole component's
      // demand reads 0 for a tick, then reforms and reads full again. Gating
      // a committed sortie on that would abort it constantly, and each abort
      // drops the fleet's own draw, which lowers the stress, which
      // re-dispatches -- a flap that burns battery and services nothing.
      //
      // So the band is a DISPATCH decision only. Once a drone is on its way
      // the sweep is cheap and harmless: if the network recovered while it
      // was in the air, the sortie is wasted, and that is a far better
      // failure than the fleet oscillating over a line it never services.
      // The target still existing is checked above, which is all that
      // actually matters here.
      return true;
    }
    if (job.kind === JOB_WASTE) {
      if (job.leg === 'pickup') return (t[job.cfg.field] || 0) >= 1;
      // Delivery leg: the target is the facility. The source is re-checked
      // at the moment of transfer rather than here, because a source that
      // drained to nothing mid-flight is not a reason to abort -- it just
      // means there is less to hand over.
      return facilityRoom(t) > 0.5;
    }
    if (job.kind === JOB_CARGO) {
      const V = VESSELS[job.phase];
      if (job.leg === 'pickup') {
        // The vessel may have been demolished or unflagged while in the air.
        const dst = job.dest;
        if (!dst || !GridManager.getEntity(dst.col, dst.row) || dst._droneSupply !== job.cargo) return false;
        return srcAvail(job.cargo, t) >= 1 && V.room(dst, job.cargo, null) > 0.5;
      }
      // Delivery: a load already reserved is delivered even if the player
      // unflagged the vessel meanwhile -- only room matters now.
      return V.room(t, job.cargo, job.meta) > 0.5;
    }
    if (job.kind === JOB_CORE) {
      const r = job.reactor;
      if (!r || !GridManager.getEntity(r.col, r.row)) return false;
      if (job.mode === 'collect' && job.leg === 'pickup') return FieldCoreSystem.collectable(r);
      if (job.leg === 'return') return FieldCoreSystem.collectable(r) && CoreWorksSystem.emptyBays(t) > 0;
      // Delivering: the reserved core is still on its shelf and the reactor
      // still has room for it.
      return FieldCoreSystem.holds(job.works, job.coreId) && FieldCoreSystem.deliverable(r) > 0;
    }
    return false;
  }

  // The job is still inside this drone's network. Coverage is checked at
  // dispatch, but a network can shrink while a drone is in the air (a port
  // demolished or moved), and a route already planned would otherwise be
  // flown to its end straight out of coverage. On a pickup leg the drop-off
  // counts too: there is no point collecting what cannot be delivered.
  function jobInNet(net, job) {
    if (!inNet(net, job.target)) return false;
    const coreDrop = job.kind === JOB_CORE ? (job.mode === 'deliver' ? job.reactor : job.works) : null;
    const drop = job.leg === 'pickup' ? (job.dest || job.fac || coreDrop) : null;
    return !drop || inNet(net, drop);
  }

  // Do the work. Repairs run on LightningDamageSystem's own clock, so a
  // drone repair and a hand-dispatched one are the same repair, not two
  // implementations that can drift apart: the drone pays the bill and
  // starts it if nobody has, then STAYS on the building until it is fixed,
  // and while it is there the clock runs faster (repairBoost). 'stay' is
  // that: hold station, the job is not finished yet.
  // Returns true (done, go home), false (abandon, go home) or 'continue'
  // (the job has retargeted itself and wants another leg). That continuation
  // is what lets a two-leg waste run share the one-leg state machine.
  function performJob(job) {
    const t = job.target;
    if (job.kind === JOB_REPAIR) {
      if (!LightningDamageSystem.isRepairing(t)) {
        const cost = LightningDamageSystem.repairCost(t);
        if (!Economy.canAfford(cost)) return false;
        Economy.spend(cost);
        t._repairTotal     = LightningDamageSystem.repairSeconds(t);
        t._repairRemaining = t._repairTotal;
        t._repairByDrone   = true;
      }
      job.onSite = true;
      return 'stay';
    }

    // A sweep covers a SPAN, not one tile. Stress is a property of the whole
    // network -- every conductor on it shares a load and rolls for failure
    // independently -- so protecting a single wire out of hundreds would be
    // statistically invisible. Covering the run of line the drone is hovering
    // over is both what a real inspection sweep does and what makes a sortie
    // worth flying. It is still only a span: the rest of the network is on
    // its own, which is why this never becomes a fix.
    if (job.kind === JOB_WIRE) {
      const D = def();
      const radius = (D.wireServiceRadius || 6) * TILE;
      const dur    = D.wireServiceDuration || 120;
      const c = centreOf(t);
      let n = 0;
      for (const type of [T.WIRE, T.POLE]) {
        for (const o of EntityRegistry.getByType(type)) {
          const oc = centreOf(o);
          if (Math.hypot(oc.x - c.x, oc.y - c.y) > radius) continue;
          markServiced(o, dur);
          n++;
        }
      }
      job.spans = n;
      return n > 0;
    }

    if (job.kind === JOB_WASTE) {
      const cfg = job.cfg;

      // -- Pickup: nothing actually moves yet --
      // The waste is RESERVED, not removed. The whole transfer happens in one
      // step when the drone reaches the facility, so there is never a moment
      // where units exist only inside a drone. A facility demolished
      // mid-flight, a deleted port, a storm, a save and reload: every one of
      // those simply drops the reservation, and the source keeps its waste.
      // Decrementing here would look better -- the gauge would fall as the
      // drone lifts off -- but it needs a rollback path, and any rollback
      // that clamps back to cap() can silently destroy units. That is exactly
      // the loophole wasteBlocksRemoval() exists to close, so it stays closed.
      if (job.leg === 'pickup') {
        const avail = job.target[cfg.field] || 0;
        const amt   = Math.min(payloadFor(cfg), avail);
        if (amt < 1) return false;
        const fac = findFacility(job.port, cfg);
        if (!fac) return false;
        job.src    = job.target;
        job.amount = amt;
        job.target = fac;          // the claim stays on the source all sortie
        job.leg    = 'deliver';
        return 'continue';
      }

      // -- Delivery: the one atomic transfer --
      const src = job.src, fac = job.target;
      if (!src || !GridManager.getEntity(src.col, src.row)) return false;
      if (!GridManager.getEntity(fac.col, fac.row)) return false;
      // Re-clamped at both ends: the source may have been trucked down and
      // the facility filled up while the drone was in the air.
      const amt = Math.max(0, Math.min(job.amount, src[cfg.field] || 0, facilityRoom(fac)));
      if (amt <= 0) return false;
      src[cfg.field]   = (src[cfg.field] || 0) - amt;
      fac._wasteStored = (fac._wasteStored || 0) + amt;
      job.amount = 0;
      return true;
    }

    if (job.kind === JOB_CARGO) {
      const V = VESSELS[job.phase];
      // -- Pickup: reserve only, exactly like a waste run --
      if (job.leg === 'pickup') {
        const src = job.target;
        const meta = pelletMeta(job.cargo, src);
        const amt = Math.min(cargoPayload(job.cargo), srcAvail(job.cargo, src),
                             V.room(job.dest, job.cargo, meta));
        if (amt < 1) return false;
        job.src = src; job.amount = amt; job.meta = meta;
        job.target = job.dest;     // the claim stays on the source all sortie
        job.leg = 'deliver';
        return 'continue';
      }
      // -- Delivery: the one atomic transfer, re-clamped at both ends --
      const src = job.src, dst = job.target;
      if (!src || !GridManager.getEntity(src.col, src.row)) return false;
      const amt = Math.min(job.amount, srcAvail(job.cargo, src));
      if (!(amt > 0)) return false;
      const took = V.put(dst, job.cargo, amt, job.meta);
      if (took <= 0) return false;
      srcTake(job.cargo, src, took);
      job.amount = 0;
      if (job.port) job.port._cargoDelivered = (job.port._cargoDelivered || 0) + took;
      return true;
    }

    if (job.kind === JOB_CORE) {
      const r = job.reactor;
      // -- Pickup: reserve only. A deliver's core stays on its shelf, a
      // collect's in the reactor's outgoing bay, until the drop-off. --
      if (job.leg === 'pickup') {
        if (job.mode === 'deliver') { job.target = r; job.leg = 'deliver'; return 'continue'; }
        job.target = job.works; job.leg = 'return';
        return 'continue';
      }
      // -- Delivery into the reactor: the one atomic move off the shelf --
      if (job.leg === 'deliver') {
        if (!FieldCoreSystem.deliver(job.works, job.coreId, r)) return false;
        job.coreId = null;
        if (!FieldCoreSystem.collectable(r)) return true;
        // It swapped a low core out: take that one back too, to the nearest
        // works with a free bay (the one the new core came from has one now).
        const works = [...EntityRegistry.getByType(T.COREWORKS)].filter(w => CoreWorksSystem.emptyBays(w) > 0 && inNet(netOf(job.port), w));
        const w = works.includes(job.works) ? job.works : nearestTo(works, r);
        if (!w) return true;            // left in the outgoing bay for the next carrier
        job.works = w; job.target = w; job.leg = 'return';
        return 'continue';
      }
      // -- Return: the spent core moves from the outgoing bay to the shelf --
      return FieldCoreSystem.collect(r, job.target);
    }
    return false;
  }

  // Turns a drone's saved job back into a live one, once the world is loaded.
  // Every reference has to find the same kind of building on the same tile,
  // and the job has to still make sense for its leg; anything less and the
  // drone just carries on home with no job, as it always did after a load.
  function resolveSaved(port, d) {
    const rec = d._savedJob, state = d._savedState;
    d._savedJob = null; d._savedState = null;
    if (!rec) return;
    const at = (r) => { if (!r) return null; const e = GridManager.getEntity(r.col, r.row); return e && e.type === r.type ? e : null; };
    const job = { kind: rec.kind, leg: rec.leg, amount: rec.amount || 0, cargo: rec.cargo, phase: rec.phase, meta: rec.meta || null,
                  hot: !!rec.hot, port, target: at(rec.target), claim: at(rec.claim), src: at(rec.src), dest: at(rec.dest), fac: at(rec.fac) };
    let ok = !!job.target && ['launch', 'out', 'working', 'home', 'land'].includes(state);
    if (ok && job.kind === JOB_WASTE) {
      job.cfg = typeof WASTE_CFG !== 'undefined' ? WASTE_CFG[rec.cfgType] : null;
      ok = !!job.cfg && (job.leg !== 'deliver' || !!job.src);
    } else if (ok && job.kind === JOB_CARGO) {
      ok = !!job.dest && !!cargoKinds()[job.cargo] && !!VESSELS[job.phase] && (job.leg !== 'deliver' || !!job.src);
    } else if (ok && job.kind === JOB_CORE) {
      job.mode = rec.mode; job.reactor = at(rec.reactor); job.works = at(rec.works); job.coreId = rec.coreId || null;
      job.claim = job.reactor;
      ok = typeof FieldCoreSystem !== 'undefined' && !!job.reactor && !!job.works
        && (!job.coreId || FieldCoreSystem.reserveById(job.works, job.coreId, d));
    } else if (ok) {
      ok = job.kind === JOB_REPAIR || job.kind === JOB_WIRE;
      job.claim = job.claim || job.target;
    }
    // A drone that was already heading in keeps doing that; its sortie is over.
    if (!ok || state === 'home' || state === 'land') return;
    if (job.claim) { if (job.claim._droneClaim && job.claim._droneClaim !== d) return; job.claim._droneClaim = d; }
    d.job = job;
    d.state = state;
    d.path = null;       // re-routed from where it is now
  }

  // Claims are cleared from both `claim` (held across a whole sortie) and
  // `target` (which moves between legs), so neither can be left stamped on
  // a building by a drone that has already gone home.
  function release(d) {
    const j = d.job;
    if (j) {
      if (j.claim  && j.claim._droneClaim  === d) j.claim._droneClaim  = null;
      if (j.target && j.target._droneClaim === d) j.target._droneClaim = null;
    }
    d.job = null;
    d.path = null;   // whatever it flies next is a new route
    d._chargingAt = null;
  }

  // ── Spacing ──────────────────────────────────────────────────────
  // Where over a target this drone hovers. Every drone used to fly to the
  // exact centre, so several on one job stacked into a single sprite. Each
  // now gets its own slot on a golden-angle spiral around the centre,
  // keyed on port + drone index so the slot is stable for the whole sortie,
  // and scaled to the footprint so big buildings spread them wider.
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  function stationPoint(port, d, target) {
    const c = centreOf(target);
    const slot = d.i + ((port.col * 7 + port.row * 13) % 10);
    const half = Math.min(target.width || 1, target.height || 1) * TILE / 2;
    const ring = Math.max(TILE * 0.9, half * 0.6);
    const rad  = ring * (0.45 + 0.55 * ((slot % 4) / 3));
    const a = slot * GOLDEN;
    return { x: c.x + Math.cos(a) * rad, y: c.y + Math.sin(a) * rad };
  }

  // Soft separation between airborne drones, every frame. The slots above
  // spread them at the job; this keeps them apart on the way there and back,
  // where drones launched close together share most of a route. A gentle
  // positional nudge, not a steering rewrite: flyTo re-aims from wherever
  // the drone ends up, so the path is unaffected beyond the sidestep.
  // Launch and landing are excluded -- those are pinned to the pad.
  const SEP_DIST = 30;   // px between drone centres, about one airframe span
  function separate(dt) {
    const air = [];
    for (const port of EntityRegistry.getByType(T.DRONEPORT))
      for (const d of (port._drones || []))
        if (d.state === 'out' || d.state === 'working' || d.state === 'home') air.push(d);
    if (air.length < 2) return;
    // A drone on final approach to its station or pad is left alone: two
    // drones bound for neighbouring pads would otherwise shove each other off
    // their marks forever and never land. The other one yields fully.
    const settling = (d) => {
      if (d.state === 'working' || !d.path || !d.path.length) return false;
      const e = d.path[d.path.length - 1];
      return Math.hypot(e.x - d.x, e.y - d.y) < SEP_DIST * 1.5;
    };
    const k = Math.min(1, dt * 6);
    for (let i = 0; i < air.length; i++) {
      const a = air[i];
      for (let j = i + 1; j < air.length; j++) {
        const b = air[j];
        const sa = settling(a), sb = settling(b);
        if (sa && sb) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= SEP_DIST) continue;
        if (dist < 0.01) { const ang = (a.i - b.i) || 1; dx = Math.cos(ang); dy = Math.sin(ang); }
        else { dx /= dist; dy /= dist; }
        const push = (SEP_DIST - dist) * 0.5 * k;
        const pa = sa ? 0 : sb ? 2 : 1, pb = sb ? 0 : sa ? 2 : 1;
        a.x -= dx * push * pa; a.y -= dy * push * pa;
        b.x += dx * push * pb; b.y += dy * push * pb;
      }
    }
  }

  // ── Per-drone tick ───────────────────────────────────────────────
  function tickDrone(port, d, dt) {
    const D = def();
    const speed = flySpeed();
    const cap   = batteryCap();
    const c = centreOf(port);

    // Fly toward a point; true once arrived.
    //
    // Speed is RAMPED rather than set. The target speed is whatever can
    // still be shed before arrival -- v = sqrt(2*a*s) is just the stopping
    // distance solved for v -- so the drone runs at cruise down the middle
    // of a leg and is already slowing as it comes up on its mark, instead of
    // travelling at a flat rate and stopping dead the instant it touches it.
    // Heading is rate-limited too, so it swings onto a new course rather
    // than snapping to it.
    const accel = D.accel    || 780;
    const decel = D.decel    || 620;
    const turn  = D.turnRate || 4.5;
    // `beyond` is how much route is left AFTER this point. A waypoint is
    // somewhere to pass through, not stop at: the brake curve is worked out
    // on the whole remaining route, so the drone carries its speed through
    // a corner and only slows for the real destination.
    const flyTo = (tx, ty, beyond) => {
      const dx = tx - d.x, dy = ty - d.y;
      const dist = Math.hypot(dx, dy);
      if (d.v === undefined) d.v = 0;
      if (beyond > 0 && dist < Math.max(2, d.v * dt)) { d.x = tx; d.y = ty; return true; }
      // Arrive on distance ALONE. This used to also require the drone to
      // have slowed below a threshold, "so the last few pixels are a settle
      // rather than a snap" -- but a step is clamped to the remaining
      // distance, so a drone that lands exactly on its mark while still
      // carrying speed fell through to the next frame with dist === 0, and
      // dx/dist made its position NaN. A NaN drone freezes mid-air forever
      // and never releases its claim. The deceleration curve above already
      // does all the smoothing; the final pixel does not need a second
      // opinion, and must never be able to divide by zero.
      if (dist < 2) { d.x = tx; d.y = ty; d.v = 0; return true; }

      const want = Math.min(speed, Math.sqrt(2 * decel * Math.max(0, dist + (beyond || 0))));
      const vPrev = d.v;
      d.v = want > d.v ? Math.min(want, d.v + accel * dt)
                       : Math.max(want, d.v - decel * dt);

      // Attitude, for the sprite. A multirotor accelerates by tilting, so
      // the tilt IS the acceleration -- pitch tracks dv/dt and roll tracks
      // how hard it is turning. Both are eased towards their target rather
      // than set, so the airframe rocks back level instead of snapping.
      const tgtLean = Math.max(-1, Math.min(1, ((d.v - vPrev) / dt) / accel));
      d.lean = (d.lean || 0) + (tgtLean - (d.lean || 0)) * Math.min(1, dt * 6);

      const step = Math.min(dist, d.v * dt);
      d.x += (dx / dist) * step;
      d.y += (dy / dist) * step;

      // Ease onto the new heading at a limited turn rate, taking the short
      // way round so a drone crossing the +/-PI seam does not spin a full
      // circle to get there.
      const aim = Math.atan2(dy, dx);
      let da = aim - d.angle;
      while (da >  Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const swing = Math.max(-turn * dt, Math.min(turn * dt, da));
      d.angle += swing;
      const tgtRoll = Math.max(-1, Math.min(1, (swing / dt) / turn));
      d.roll = (d.roll || 0) + (tgtRoll - (d.roll || 0)) * Math.min(1, dt * 6);

      // Battery is spent per second of flight, so it tracks the eased speed
      // rather than the distance covered.
      d.battery = Math.max(0, d.battery - dt / cap);
      return false;
    };

    // Follow d.path (built by route(), so it never leaves the network) to
    // its end; true once the last point is reached.
    // Drop charge stops the battery does not need. A stop is skipped only
    // when what is left in the pack covers the route, with the drop itself
    // left out, as far as the stop AFTER it; so the drone always reaches a
    // charge point. The last stop before the end of an outbound leg is kept:
    // canMakeRoundTrip planned the next leg from a full charge there. On
    // the way home the pad charges it anyway, so that one can go too.
    const skipSwaps = () => {
      if (d._chargingAt) return;
      for (;;) {
        const i = d.path.findIndex(p => p.swap);
        if (i < 0) return;
        let j = d.path.findIndex((p, k) => k > i && p.swap);
        if (j < 0) { if (d.state !== 'home') return; j = d.path.length - 1; }
        let len = 0, px = d.x, py = d.y;
        for (let k = 0; k <= j; k++) {
          if (k === i) continue;
          len += Math.hypot(d.path[k].x - px, d.path[k].y - py);
          px = d.path[k].x; py = d.path[k].y;
        }
        if ((len / speed) * SWAP_SKIP_MARGIN + SWAP_SKIP_SLACK > d.battery * cap) return;
        d.path.splice(i, 1);
      }
    };

    const followPath = () => {
      skipSwaps();
      const wp = d.path[0];
      // Climbing back to cruise after a stop on a charging port's pad.
      if (!d._chargingAt && d.alt < 1) d.alt = Math.min(1, d.alt + dt * 1.6);
      if (wp.swap) {
        // Charge stop: pull up beside the port, hover and top up from it.
        // A port that has lost power since the route was planned can't
        // charge anyone, so it is simply flown past.
        if (!wp.swap.powered || !isStation(wp.swap)) {
          d._chargingAt = null; d.path.shift();
          if (!d.path.length) { d.path = null; return 'charged'; }
          return false;
        }
        const a = (d.i || 0) * 0.63 + 0.4, off = STOP_OFFSET * TILE * (1 + ((d.i || 0) % 3) * 0.25);
        let hx = wp.x + Math.cos(a) * off, hy = wp.y + Math.sin(a) * off;
        // A charging port: make for a free pad and settle low over it. With
        // all five taken the drone holds off the deck (the spot above) and
        // takes the first pad to come free.
        const onPad = isCharger(wp.swap);
        let pad = -1;
        if (onPad) {
          pad = claimPad(wp.swap, d, wp);
          if (pad >= 0) { const q = chargerPadPos(wp.swap, pad); hx = q.x; hy = q.y; }
        }
        if (!d._chargingAt) {
          if (!flyTo(hx, hy, 0)) return false;
          if (onPad && pad < 0) { d.v = 0; return false; }
          d._chargingAt = wp.swap;
        }
        if (onPad) { d.x = hx; d.y = hy; d.alt = Math.max(0.28, d.alt - dt * 1.5); }
        d.v = 0;
        d.lean *= Math.max(0, 1 - dt * 4);
        d.roll *= Math.max(0, 1 - dt * 4);
        d.battery = Math.min(1, d.battery + dt / chargeSecs());
        if (d.battery < 1) return false;
        d._chargingAt = null;
        d.path.shift();
        if (d.path.length) return false;
        // A detour that was only a charge stop: the caller rebuilds its
        // route from here rather than treating this as the destination.
        d.path = null;
        return 'charged';
      }
      // Brake for the real stop: the end of the path, or the next charge stop.
      let beyond = 0;
      for (let i = 1; i < d.path.length; i++) {
        beyond += Math.hypot(d.path[i].x - d.path[i - 1].x, d.path[i].y - d.path[i - 1].y);
        if (d.path[i].swap) break;
      }
      if (!flyTo(wp.x, wp.y, beyond)) return false;
      d.path.shift();
      if (d.path.length) return false;
      d.path = null;
      return true;
    };

    switch (d.state) {
      case 'idle': {
        // On the pad, charging. Finding work is NOT done here: this runs
        // every render frame, and findRepairJob scans the whole entity
        // registry. Dispatch lives on the logic tick instead -- see
        // dispatchPort() -- so the expensive search happens 10 times a
        // second while the flying happens 60.
        if (d.battery < 1) d.battery = Math.min(1, d.battery + dt / chargeSecs());
        return;
      }
      case 'launch': {
        // Spool up, then climb off the pad. The job is not re-checked here:
        // it was valid a moment ago, the drone has not gone anywhere, and
        // aborting mid-climb would look like a stutter rather than a
        // decision. 'out' re-checks it on the very next tick anyway.
        const p = padPos(port, d.i);
        d.x = p.x; d.y = p.y;
        d.hover += dt;
        d.v = 0;                                   // leaves the pad from rest
        d.lean *= Math.max(0, 1 - dt * 5);         // sits level on the deck
        d.roll *= Math.max(0, 1 - dt * 5);
        const f = Math.min(1, d.hover / LAUNCH_SECS);
        d.spin = Math.min(1, f * 1.6);             // rotors lead the climb
        // Smoothstep so it unsticks gently and eases into the hover at the
        // top rather than rising at a constant rate and stopping flat.
        const fc = Math.max(0, (f - 0.35) / 0.65);
        d.alt = fc * fc * (3 - 2 * fc);
        d.battery = Math.max(0, d.battery - (dt * 0.5) / cap);
        if (f >= 1) { d.alt = 1; d.spin = 1; d.state = 'out'; d.hover = 0; }
        return;
      }
      case 'land': {
        // Settle onto the pad, rotors winding down as the weight comes on.
        const p = padPos(port, d.i);
        d.x = p.x; d.y = p.y;
        d.hover += dt;
        d.v = 0;
        d.lean *= Math.max(0, 1 - dt * 5);         // levels out for touchdown
        d.roll *= Math.max(0, 1 - dt * 5);
        const f = Math.min(1, d.hover / LAND_SECS);
        // Descends quickly, then flares: most of the height is lost early and
        // the last of it bleeds off slowly, which is how a rotorcraft sets
        // down and reads far better than a constant sink rate.
        const fd = Math.min(1, f / 0.75);
        d.alt  = 1 - (fd * fd * (3 - 2 * fd));
        d.spin = Math.max(0, 1 - Math.max(0, (f - 0.55) / 0.45));
        if (f >= 1) { d.alt = 0; d.spin = 0; d.state = 'idle'; d.hover = 0; }
        return;
      }
      case 'out': {
        if (!jobStillValid(d.job) || !jobInNet(netOf(port), d.job)) { release(d); d.state = 'home'; return; }
        // Turn for home if the battery can no longer cover the return leg.
        // Checked every tick, not just at dispatch: a job that grew (a
        // second strike on the way) must not strand the drone.
        // Running low: make for the nearest port to charge, then carry on
        // with the job (the route is rebuilt from wherever it tops up). If
        // the nearest port is its own, it just goes home.
        if (!d._chargingAt && !(d.path && d.path[0] && d.path[0].swap)) {
          const at = needsCharge(port, d);
          if (at === port) { release(d); d.state = 'home'; return; }
          if (at) { const pc = centreOf(at); d.path = [{ x: pc.x, y: pc.y, swap: at }]; }
        }
        if (!d.path) {
          d.path = route(netOf(port), d, stationPoint(port, d, d.job.target), true, port);
          // The network shrank under it (a port demolished) and the job is
          // no longer inside it -- not a drone job any more.
          if (!d.path) { release(d); d.state = 'home'; return; }
        }
        const arrived = followPath();
        if (arrived === true) { d.state = 'working'; d.hover = 0; }
        return;
      }
      case 'working': {
        d.v = 0;
        d.lean *= Math.max(0, 1 - dt * 4);         // settles level on station
        d.roll *= Math.max(0, 1 - dt * 4);
        // A drone set down on a repair is not burning battery: a repair can
        // take minutes, far longer than it could hover.
        if (!d.job.onSite) d.battery = Math.max(0, d.battery - (dt * 0.4) / cap);   // station-keeping costs less than cruise
        d.hover += dt;
        if (d.hover < hoverFor(d.job)) return;
        // (For a repair this is also how it ends: the building is no longer damaged.)
        if (!jobStillValid(d.job)) { release(d); d.state = 'home'; return; }
        const done = performJob(d.job);
        if (done === 'stay') return;
        // 'continue' means the job retargeted itself -- a loaded waste drone
        // now heading for the facility. Back into the same fly loop, no new
        // state, no second copy of the flight code.
        if (done === 'continue') { d.state = 'out'; d.hover = 0; d.path = null; return; }
        // A finished cargo run goes straight on to the next one from here,
        // if there is one it can fly, instead of going home empty to be
        // dispatched again. Only cargo chains: repairs, waste and line work
        // are left to drones on their pads, which the dispatcher already
        // picks by distance.
        const wasCargo = done === true && d.job.kind === JOB_CARGO;
        release(d);
        if (wasCargo && port.powered) {
          const next = findCargoJob(port, d, netOf(port), true);
          if (next) { d.job = next; d.state = 'out'; d.hover = 0; return; }
        }
        // true (finished) or false (not worth doing, or unaffordable): either
        // way the drone goes home rather than hovering over it forever.
        d.state = 'home';
        return;
      }
      case 'home': {
        // Back to this drone's OWN pad, not the middle of the building --
        // that is what makes the deck read as ten aircraft with ten berths
        // rather than one hole they all disappear into.
        if (!d.path) d.path = route(netOf(port), d, padPos(port, d.i), true, port) || [padPos(port, d.i)];
        if (followPath() === true) { d.state = 'land'; d.hover = 0; }
        return;
      }
    }
  }

  return {
    // Power draw for this port THIS tick. Drones fly on their own batteries,
    // so the grid pays when they come home to refill, not while they're out:
    //   base (tower, lights, uplink)
    //   + chargeDraw per drone charging on its pad, tapering off over the
    //     last CHARGE_TAPER of the battery the way a real charger does
    //   + flightDraw per drone aloft (telemetry only)
    //   + hotFlightDraw per drone carrying a shielded cask
    // A standby port with a full fleet sits at its base; a wave of drones
    // landing low is the spike. PowerNetwork reads `_activePowerInput` in
    // preference to the def, the same way the beacon's sweep draw works.
    applyDraw(port) {
      const D = def();
      const drones = fleet(port);
      const out = drones.filter(isOut).length;
      // A drone carrying a shielded cask draws more than one carrying a
      // camera -- and it draws it from the grid the reactor is feeding.
      // A Field Core flies shielded both ways: charged out, spent back.
      const shielded = (j) => j && ((j.hot && j.leg === 'deliver')
                               || (j.kind === JOB_CORE && j.leg !== 'pickup'));
      const hot = drones.filter(d => isOut(d) && shielded(d.job)).length;
      let charge = 0;
      const chargeW = (b) => (D.chargeDraw || 30) * Math.min(1, (1 - b) / CHARGE_TAPER);
      for (const d of drones) {
        if (d.state === 'idle' && d.battery < 1) charge += chargeW(d.battery);
      }
      // Drones from any port stopping here on a long run to top up.
      let visiting = 0;
      for (const p of EntityRegistry.getByType(T.DRONEPORT)) {
        for (const d of (p._drones || [])) {
          if (d._chargingAt === port && d.battery < 1) { charge += chargeW(d.battery); visiting++; }
        }
      }
      port._visitingChargers = visiting;
      port._dronesOut   = out;
      port._hotRuns     = hot;
      port._chargeDraw  = charge;
      port._activePowerInput = (D.powerInput || 40)
                             + charge
                             + out * (D.flightDraw || 3)
                             + hot * (D.hotFlightDraw || 12);
    },

    // ── Logic tick (10Hz) ─────────────────────────────────────────
    // Power accounting, the weather flag, and DISPATCH. Deliberately not
    // movement: at 100ms per step a drone cruising at 620 px/s jumps 62
    // pixels between frames, which is exactly the stutter that made the
    // fleet look like it was teleporting. Flying happens in frameTick.
    // A charging port's logic tick: nothing to dispatch, only the bill. Its
    // base draw, plus chargeDraw for every drone topping up on its pads.
    tickCharger(st) {
      refreshNetworks();
      const D = def();
      let charge = 0, visiting = 0;
      for (const p of EntityRegistry.getByType(T.DRONEPORT)) {
        for (const d of (p._drones || [])) {
          if (d._chargingAt === st && d.battery < 1) { charge += (D.chargeDraw || 30) * Math.min(1, (1 - d.battery) / CHARGE_TAPER); visiting++; }
        }
      }
      st._visitingChargers = visiting;
      st._chargeDraw = charge;
      st._activePowerInput = ((EntityDefs[T.DRONECHARGER] || {}).powerInput || 10) + charge;
    },

    tick(port, dt) {
      refreshNetworks();
      const drones = fleet(port);
      DroneSystem.applyDraw(port);
      if (dt <= 0) return;
      port._cargoCooldown = Math.max(0, (port._cargoCooldown || 0) - dt);
      for (const d of drones) if (d._savedJob) resolveSaved(port, d);
      if (!port.powered) return;
      for (const d of drones) {
        if (d.state !== 'idle' || d.battery < 0.35) continue;
        const job = findJob(port, d);
        if (!job) continue;
        if (job.claim) job.claim._droneClaim = d;
        if (job.kind === JOB_CARGO) port._cargoCooldown = CARGO_LAUNCH_GAP;
        d.job   = job;
        d.state = 'launch';
        d.hover = 0;
      }
    },

    // ── Frame tick (every rendered frame) ─────────────────────────
    // All movement and the whole per-drone state machine, on real frame
    // time scaled by the game speed -- the same contract TruckSystem's
    // frameTick uses, and the reason trucks look smooth. Job hunting is
    // NOT here; it would mean a full registry scan per idle drone per
    // frame, which is the one thing that could not be afforded at 60Hz.
    frameTick(dt) {
      const ts  = (typeof DevMode !== 'undefined' && DevMode.timeScale != null) ? DevMode.timeScale : 1;
      const sdt = Math.min((dt || 0) * ts, 0.25);   // clamped so an alt-tab stall cannot teleport the fleet
      if (!(sdt > 0)) return;
      refreshNetworks();
      for (const port of EntityRegistry.getByType(T.DRONEPORT)) {
        for (const d of fleet(port)) {
          if (d._savedJob) resolveSaved(port, d);
          d.bob += sdt * 3;
          // A parked drone sits on its pad, wherever the port is NOW. Ports
          // can be dragged to a new spot, and nothing else moves a drone that
          // is not flying -- the whole parked fleet used to stay behind on
          // the old site, over whatever got built there afterwards. Done
          // before the unpowered skip below, so a dark port's fleet follows too.
          if (d.state === 'idle') { const p = padPos(port, d.i); d.x = p.x; d.y = p.y; }
          // An unpowered port still lets what is in the air come home — the
          // drones have their own batteries, and leaving ten of them frozen
          // mid-flight over the city because the wire went down reads as a
          // bug rather than as a consequence.
          if (!port.powered && d.state === 'idle') continue;
          tickDrone(port, d, sdt);
        }
      }
      separate(sdt);
    },

    // Drop a port's claims when it is removed, so a building it was flying
    // to does not stay claimed by a fleet that no longer exists.
    releaseAll(port) {
      for (const d of (port._drones || [])) release(d);
      port._drones = null;
    },

    fleet,
    isOut,
    repairBoost,
    // The renderer draws the pads from this, so the art and the flight paths
    // cannot disagree about where a drone lives.
    PADS,
    padPos,
    radiusPx: (e) => (((e && EntityDefs[e.type]) || def()).radius || 110) * TILE,
    // Drone Ports and Drone Charging Ports together: everything that adds a
    // square to a network.
    stations, isStation, isCharger,
    CHARGER_PADS, chargerPadPos, chargerPads,
    // Coverage networks, for the renderers. networkOf() refreshes first
    // because a panel or map can ask between ticks. networksFor() takes an
    // explicit port list so the placement ghost -- not in the registry yet --
    // can preview the network it would join.
    networks: () => { refreshNetworks(); return _nets; },
    networkOf: (port) => { refreshNetworks(); return netOf(port); },
    networksFor: buildNetworks,
    covers: inNet,
    outline,
    // { name, icon, speed } of the storm slowing the fleet, or null.
    slowedBy,
    weatherEffect,
    // The cargo tables, for the Hauler (truck_auto_haul.js): what can be
    // hauled, who makes it, how much is surplus, and how to put it in a vessel.
    cargo: { kinds: cargoKinds, vessels: VESSELS, sources: cargoSources, avail: srcAvail, take: srcTake, pelletMeta, isVessel },
    // Ticked once a frame from the game loop: the serviced-span register is
    // fleet-wide, not per port.
    tickServices,
    servicedSpans: () => _serviced.size,
    serviceLeft,
    // Cargo supply, for the vessel info panels: the kinds a vessel of this
    // type can be flagged to receive, and a label for one.
    cargoOptions(vesselType) {
      const ph = Object.keys(VESSELS).find(k => VESSELS[k].type() === vesselType);
      if (!ph) return [];
      const C = cargoKinds();
      return Object.keys(C).filter(k => C[k].phase === ph).map(k => ({ kind: k, label: C[k].label }));
    },
    cargoLabel: (k) => (cargoKinds()[k] || {}).label || k,
    cargoInbound: inboundTo,
    // Fleet summary for the info panel.
    status(port) {
      const drones = fleet(port);
      const out = drones.filter(isOut).length;
      // A dark port's pads do not charge (frameTick skips its parked drones).
      const charging = port.powered ? drones.filter(d => d.state === 'idle' && d.battery < 1).length : 0;
      const avg = drones.reduce((s, d) => s + d.battery, 0) / (drones.length || 1);
      const repairing = drones.filter(d => isOut(d) && d.job && d.job.kind === JOB_REPAIR).length;
      const hauling   = drones.filter(d => isOut(d) && d.job && d.job.kind === JOB_WASTE).length;
      const servicing = drones.filter(d => isOut(d) && d.job && d.job.kind === JOB_WIRE).length;
      const cargo     = drones.filter(d => isOut(d) && d.job && d.job.kind === JOB_CARGO).length;
      const cores     = drones.filter(d => isOut(d) && d.job && d.job.kind === JOB_CORE).length;
      // Units reserved but not yet handed over, on waste and cargo runs alike
      // (both reserve at pickup and move everything at the drop-off). Nothing
      // has left a source buffer yet -- this is work in progress, not cargo
      // in a hold.
      const reserved  = drones.reduce((s, d) =>
        s + ((isOut(d) && d.job && (d.job.kind === JOB_WASTE || d.job.kind === JOB_CARGO) && d.job.leg === 'deliver') ? d.job.amount || 0 : 0), 0);
      // Out with no job: the sortie is over and it is flying home.
      const returning = out - repairing - hauling - servicing - cargo - cores;
      return { total: drones.length, out, charging, idle: drones.length - out,
               avgBattery: avg, repairing, hauling, servicing, reserved, cargo, cores, returning,
               delivered: port._cargoDelivered || 0 };
    },
    // One entry per drone that is out on a job, for the fleet roster. A waste
    // or cargo run names both ends whichever leg it is on: `target` moves
    // from the source to the drop-off at pickup, so the pair is read off the
    // leg here rather than by every caller. `target` is where the drone is
    // flying right now. A drone heading home has no job and is not listed.
    jobs(port) {
      const list = [];
      for (const d of fleet(port)) {
        const info = DroneSystem.jobOf(d);
        if (info) list.push(info);
      }
      return list;
    },
    // The same entry for a single drone (null when it has no job out).
    jobOf(d) {
      const j = d.job;
      if (!j || !isOut(d)) return null;
      if (j.kind === JOB_CORE) {
        // From the shelf to the reactor, or the reactor back to the shelf.
        const toReactor = j.mode === 'deliver' && j.leg !== 'return';
        return { kind: j.kind, state: d.state, loaded: j.leg !== 'pickup', target: j.target,
                 from: toReactor ? j.works : j.reactor, to: toReactor ? j.reactor : j.works,
                 cargo: toReactor ? 'Field Core' : 'Spent Field Core', amount: 0, hot: false, charging: !!d._chargingAt };
      }
      const twoLeg = j.kind === JOB_WASTE || j.kind === JOB_CARGO;
      const loaded = twoLeg && j.leg === 'deliver';
      return {
        kind: j.kind, state: d.state, loaded,
        target: j.target,
        from: twoLeg ? (loaded ? j.src : j.target) : null,
        to:   twoLeg ? (loaded ? j.target : (j.kind === JOB_CARGO ? j.dest : j.fac)) : null,
        cargo: j.kind === JOB_CARGO ? DroneSystem.cargoLabel(j.cargo) : null,
        amount: loaded ? j.amount : 0,
        hot: !!j.hot,
        charging: !!d._chargingAt,
      };
    },
    // The drone in the air nearest world point (wx, wy), within `r` px, as
    // { port, d } -- for clicking on one. Parked drones belong to their port's
    // own panel, so only drones that are out count.
    droneAt(wx, wy, r = TILE * 1.4) {
      let best = null, bestD = r;
      for (const port of EntityRegistry.getByType(T.DRONEPORT)) {
        for (const d of fleet(port)) {
          if (!isOut(d)) continue;
          const dist = Math.hypot(d.x - wx, d.y - wy);
          if (dist < bestD) { bestD = dist; best = { port, d }; }
        }
      }
      return best;
    },
    // Work inside `port`'s network that NO drone has taken, each with the
    // reason it is still waiting, for the fleet roster. This mirrors the
    // finders' own tests rather than calling them: a finder answers "is there
    // a job for this drone", and says nothing about why there is not.
    // Line servicing is left out -- its candidates are whole runs of wire.
    // Cached per network for half a second: the repair pass is a full
    // registry scan, and the roster asks once per open row per tick.
    pending(port) {
      refreshNetworks();
      const net = netOf(port), now = performance.now();
      // Why work that could be flown is not: a drone free up, unless the
      // power means none will launch however long it waits.
      const live = net.squares.some(s => s.port && s.port.type === T.DRONEPORT && s.port.powered);
      const wait = !live ? 'no powered Drone Port in network'
                 : 'waiting for a free drone';
      const hit = _pendingCache.get(net);
      if (hit && now - hit.t < 500 && hit.wait === wait) return hit.list;
      const list = [];

      if (typeof LightningDamageSystem !== 'undefined') {
        for (const o of EntityRegistry.all()) {
          if (!o._lightningDamaged || o._irreparable || o._droneClaim) continue;
          if (LightningDamageSystem.isRepairing(o) || !inNet(net, o)) continue;
          list.push({ kind: JOB_REPAIR, target: o,
                      why: Economy.canAfford(LightningDamageSystem.repairCost(o)) ? wait : 'cannot afford the repair' });
        }
      }

      if (typeof WASTE_CFG !== 'undefined' && typeof WASTE_SOURCES !== 'undefined') {
        for (const srcType of WASTE_SOURCES) {
          const cfg = WASTE_CFG[srcType];
          if (!cfg) continue;
          for (const src of EntityRegistry.getByType(srcType)) {
            if (!src._droneShaving || src._droneClaim || haulBlocked(src) || !inNet(net, src)) continue;
            list.push({ kind: JOB_WASTE, target: src, hot: isHot(cfg),
                        why: findFacility(port, cfg) ? wait : 'no waste facility with room in network' });
          }
        }
      }

      for (const ph in VESSELS) {
        const V = VESSELS[ph];
        for (const v of EntityRegistry.getByType(V.type())) {
          const kind = v._droneSupply;
          if (!kind || !cargoKinds()[kind] || !inNet(net, v)) continue;
          if (inboundTo(v) > 0) continue;                       // already being flown
          const payload = cargoPayload(kind), room = V.room(v, kind, null);
          if (room < payload * 0.5) continue;                   // full enough: not asking
          let inRange = 0, stocked = 0;
          for (const src of cargoSources(kind)) {
            if (src === v || !inNet(net, src)) continue;
            inRange++;
            if (!src._lightningDamaged && srcAvail(kind, src) - reservedFrom(src) >= minLoadFor(kind, v, room)) stocked++;
          }
          list.push({ kind: JOB_CARGO, target: v, cargo: DroneSystem.cargoLabel(kind),
                      why: !inRange ? `no ${DroneSystem.cargoLabel(kind)} source in network`
                         : !stocked ? 'sources have no surplus to spare'
                         : wait });
        }
      }
      if (typeof FieldCoreSystem !== 'undefined') {
        const works = [...EntityRegistry.getByType(T.COREWORKS)].filter(w => inNet(net, w));
        for (const r of coreHosts()) {
          if (!inNet(net, r) || r._droneClaim || FieldCoreSystem.truckOn(r)) continue;
          const collect = FieldCoreSystem.collectable(r), deliver = FieldCoreSystem.deliverable(r) > 0;
          if (!collect && !deliver) continue;
          list.push({ kind: JOB_CORE, target: r, cargo: collect ? 'Spent Field Core' : 'Field Core',
                      why: !works.length ? 'no Core Works in network'
                         : collect ? (works.some(w => CoreWorksSystem.emptyBays(w) > 0) ? wait : 'every Core Works bay is full')
                         : (works.some(w => FieldCoreSystem.freeCharged(w).length > 0) ? wait : 'no charged core on any shelf') });
        }
      }
      _pendingCache.set(net, { t: now, list, wait });
      return list;
    },
    // Saved per port: where each drone is, what it is doing, and the job it
    // is on. A job holds entity references, which cannot be written to a
    // save, so each is stored as { type, col, row } and looked up again on
    // load (see resolveSaved). A drone whose job no longer checks out, or a
    // save from before jobs were kept, comes back as 'home': it flies to its
    // pad, lands, and the dispatcher finds it work on the next tick.
    serialiseFleet(port) {
      const ref = (e) => (e && e.type ? { type: e.type, col: e.col, row: e.row } : undefined);
      return (port._drones || []).map(d => {
        const rec = { x: Math.round(d.x), y: Math.round(d.y), state: d.state || 'idle', battery: +d.battery.toFixed(3) };
        if (d._savedJob) { rec.job = d._savedJob; rec.state = d._savedState || 'home'; return rec; }   // saved again before it was resolved
        if (rec.state === 'idle') return rec;
        rec.alt = +(d.alt || 0).toFixed(2); rec.spin = +(d.spin || 0).toFixed(2); rec.hover = +(d.hover || 0).toFixed(2);
        const j = d.job;
        if (!j) { rec.state = 'home'; return rec; }
        rec.job = {
          kind: j.kind, leg: j.leg, amount: j.amount || 0, cargo: j.cargo, phase: j.phase, meta: j.meta || undefined, hot: j.hot || undefined,
          target: ref(j.target), claim: ref(j.claim), src: ref(j.src), dest: ref(j.dest), fac: ref(j.fac),
          cfgType: j.cfg && typeof WASTE_CFG !== 'undefined' ? Object.keys(WASTE_CFG).find(k => WASTE_CFG[k] === j.cfg) : undefined,
          mode: j.mode, reactor: ref(j.reactor), works: ref(j.works), coreId: j.coreId || undefined,
        };
        return rec;
      });
    },
    loadFleet(port, recs) {
      if (!Array.isArray(recs) || !recs.length) return;
      const drones = fleet(port);
      recs.slice(0, drones.length).forEach((r, i) => {
        const d = drones[i];
        // A saved job is held until the whole world is back on the grid (the
        // port loads before most of what its drones were flying to); until
        // then the drone is simply on its way home.
        d._savedJob = r.job || null;
        d._savedState = r.job ? r.state : null;
        d.state = r.state === 'idle' ? 'idle' : 'home';
        // Parked drones go on their pads, not their saved coordinates: saves
        // made after a port was moved hold the OLD site, and frameTick does
        // not run while the game is paused to put them right.
        const pad = padPos(port, i);
        const parked = d.state === 'idle';
        d.x = parked ? pad.x : r.x;
        d.y = parked ? pad.y : r.y;
        d.battery = r.battery !== undefined ? r.battery : 1;
        // Parked drones sit on the deck; anything else reloads at the height
        // it was saved at (cruise, for a save that carries none).
        d.alt  = parked ? 0 : (r.alt  !== undefined ? r.alt  : 1);
        d.spin = parked ? 0 : (r.spin !== undefined ? r.spin : 1);
        d.hover = parked ? 0 : (r.hover || 0);
        d.v    = 0;      // a restored drone accelerates from rest
      });
    },
  };
})();
