/* ═══════════════════════════════════════════════════════════════════
   TRUCK DISPATCH SYSTEM
   Lets a player queue up real destinations (existing waste facilities /
   gas stations) for a truck and have it auto-route to each one in turn,
   optionally looping the queue forever. Destinations are stored as
   lightweight descriptors (not entity references) so save/load and
   demolished/relocated buildings are handled cleanly — the live entity
   is looked up fresh every time a leg starts.
   ═══════════════════════════════════════════════════════════════════ */
const TruckDispatchSystem = (() => {
  // If a truck keeps needing to back out on the SAME leg this many times in a
  // row, stop trying — likely a genuinely unreachable destination rather than
  // a one-off bad corner, and repeatedly backing out/rerouting forever would
  // just loop silently instead of surfacing the problem to the player.
  // Each reroute heads for a different approach tile than the ones already
  // failed (see _failedApproaches), so this is roughly "sides of the building
  // to try" — enough to go all the way round a typical footprint.
  const MAX_REROUTE_ATTEMPTS = 6;

  // Consecutive dispatch ticks (10Hz) a truck must sit at an "already there"
  // stop with no haul/refuel active before the leg counts as done — mirrors
  // ARRIVAL_GRACE_SECONDS in truck.js for the normal drive-there case. Without
  // this, a truck that starts a leg already next to its destination would get
  // _legDone set instantly, and this system could advance to the next leg
  // before HaulSystem/GasStationSystem (which only check proximity once per
  // logic tick) ever got a chance to notice it and start loading/unloading/
  // refueling at all.
  const ARRIVAL_GRACE_TICKS = 4;
  // Ticks a leg may sit with nothing driving it before it is restarted
  // (see the stalled-leg check in tick()). Several times the grace window,
  // so a leg between two of its own steps is never mistaken for one.
  const STALL_TICKS = 20;

  // Dispatch failures are worth a toast when the player built the queue by
  // hand — they chose that destination and need to know it didn't work. Under
  // AutoHaulSystem nobody chose anything: the planner picks a target, and a
  // failure just means it should pick a different one, which it does on its
  // next pass (it blacklists the target that failed). Toasting those would
  // narrate the planner's every dead end at the player.
  function _toast(trk, msg, colour, bg, border) {
    if (trk && trk._autoHaulEnabled) return;
    showToast(msg, colour, bg, border);
  }

  // EntityRegistry.getByType returns a Set, not an array — no .length/[0].
  function _firstOfType(type) {
    for (const e of EntityRegistry.getByType(type)) return e;
    return null;
  }

  function _resolveDescriptor(desc) {
    if (!desc) return null;
    if (desc.kind === 'facility') {
      return _firstOfType(desc.facilityType);
    }
    if (desc.kind === 'source') {
      const ent = GridManager.getEntity(desc.col, desc.row);
      return (ent && ent.type === desc.sourceType) ? ent : null;
    }
    if (desc.kind === 'gasstation') {
      const ent = GridManager.getEntity(desc.col, desc.row);
      return (ent && ent.type === T.GASSTATION) ? ent : null;
    }
    // A Hauler taking fuel to a stranded truck (AutoHaulSystem). The truck
    // is held on the descriptor unsaved, so after a reload this resolves to
    // nothing and the planner simply picks the run again.
    if (desc.kind === 'truck') {
      const t = desc.truck;
      return t && EntityRegistry.getByType(T.TRUCK).has(t) ? truckFootprint(t) : null;
    }
    return null;
  }

  // ── Fuel planning ─────────────────────────────────────────────
  // Shared with AutoHaulSystem. Estimates are straight-line, so ROUTE_FACTOR
  // pads them for roads that wind and FUEL_MARGIN on top for idling at a
  // stop; a truck stranded mid-map costs far more than an early top-up.
  const ROUTE_FACTOR   = 1.4;
  const FUEL_MARGIN    = 1.25;
  const LOW_FUEL_FRAC  = 0.3;     // always refuel below this, whatever's next
  const PATROL_SPEED_PX = 352;    // TruckSystem's SPEED

  const _fuelCap = (trk) => truckSpec(trk).fuelCapacity || 100;
  const _fuelNow = (trk) => trk._fuel !== undefined ? trk._fuel : _fuelCap(trk);
  const _centre  = (e) => [e.col + (e.width || 1) / 2, e.row + (e.height || 1) / 2];
  function _tilesBetween(a, b) {
    const [ax, ay] = _centre(a), [bx, by] = _centre(b);
    return Math.hypot(ax - bx, ay - by);
  }
  // Fuel to drive `tiles` straight-line tiles, padded for the real route.
  function _fuelForTiles(tiles, trk) {
    const spec = truckSpec(trk), perSec = spec.fuelPerSec || 0.08;
    return (tiles * ROUTE_FACTOR * TILE / (PATROL_SPEED_PX * (spec.speedMult || 1))) * perSec * FUEL_MARGIN;
  }
  // Nearest powered gas station that actually has fuel to give. `skip` lets
  // a caller exclude stations it has already given up on.
  function _nearestStation(from, skip) {
    let best = null, bestD = Infinity;
    for (const stn of EntityRegistry.getByType(T.GASSTATION)) {
      if (!stn.powered || (stn._fuelStored || 0) <= 0) continue;
      if (skip && skip(stn)) continue;
      const d = _tilesBetween(from, stn);
      if (d < bestD) { bestD = d; best = stn; }
    }
    return best;
  }

  // Can this truck drive to `ent` from where it stands? Cached per start
  // tile and destination until something is built or pulled down, since the
  // station pick below asks on every plan.
  const _reachCache = new Map();
  let _reachTopo = -1;
  function _canReach(trk, ent) {
    if (typeof TruckRouting === 'undefined') return true;
    const topo = EntityRegistry.getDriveVersion();
    if (topo !== _reachTopo) { _reachCache.clear(); _reachTopo = topo; }
    TruckSystem.initWorldPos(trk);
    const fx = trk._wx + TILE / 2, fy = trk._wy + TILE * 1.5;
    const key = `${Math.floor(fx / TILE)},${Math.floor(fy / TILE)}>${ent.col},${ent.row}`;
    let ok = _reachCache.get(key);
    if (ok === undefined) {
      ok = TruckRouting.landReachable ? TruckRouting.landReachable(fx, fy, ent) : !!TruckRouting.findPath(fx, fy, ent, null, null);
      if (_reachCache.size > 2000) _reachCache.clear();
      _reachCache.set(key, ok);
    }
    return ok;
  }
  // The nearest stocked station the truck can actually drive to. Ranked by
  // straight-line distance alone, a station just over the river beat a
  // reachable one up the road: the truck was sent there, found no route and
  // raised a "can't reach" card with fuel in reach all along. Only the
  // closest few are route-checked; if none of them is reachable the nearest
  // is returned anyway, so the leg fails and the card says why.
  const REACH_CHECKS = 5;
  function _reachableStation(trk, skip) {
    const cands = [];
    for (const stn of EntityRegistry.getByType(T.GASSTATION)) {
      if (!stn.powered || (stn._fuelStored || 0) <= 0) continue;
      if (skip && skip(stn)) continue;
      cands.push([_tilesBetween(trk, stn), stn]);
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(REACH_CHECKS, cands.length); i++)
      if (_canReach(trk, cands[i][1])) return cands[i][1];
    return cands[0][1];
  }
  // Should the truck refuel before heading to `next`? True when the tank is
  // low outright, or when it can't cover the drive to `next` AND on from
  // there to the nearest station — checking only the first hop is what let
  // trucks reach a far stop and then strand on the way back.
  function _needsFuelBefore(trk, next) {
    const fuel = _fuelNow(trk);
    if (fuel < _fuelCap(trk) * LOW_FUEL_FRAC) return true;
    if (!next) return false;
    const onward = _nearestStation(next);
    const tiles  = _tilesBetween(trk, next) + (onward ? _tilesBetween(next, onward) : 0);
    return fuel < _fuelForTiles(tiles, trk);
  }

  // Manual patrol queues: before a leg starts, detour to a gas station if the
  // tank won't safely cover it. The detour is a one-off leg (_detourDesc)
  // that doesn't touch the player's queue; once refuelled, the queue resumes
  // at the stop it was about to head for. AutoHaulSystem does its own fuel
  // planning, so its trucks are left alone.
  function _maybeFuelDetour(trk) {
    if (trk._autoHaulEnabled || trk._detourDesc) return false;
    const queue = trk._destQueue || [];
    const desc  = queue[trk._queueIdx];
    if (!desc || desc.kind === 'gasstation') return false;   // already heading to fuel
    const next = _resolveDescriptor(desc);
    if (!next || !_needsFuelBefore(trk, next)) return false;
    const skipBad = (s) => trk._badStation && trk._badStation.key === `${s.col},${s.row}` && Date.now() < trk._badStation.until;
    const stn = _reachableStation(trk, skipBad);
    if (!stn) {
      if (Date.now() - (trk._noStationNag || 0) > 90000) {
        trk._noStationNag = Date.now();
        _toast(trk, '⛽ Truck is low on fuel and no powered gas station has any to give', '#ffb040', '#180c00', '#604010');
      }
      return false;
    }
    trk._detourDesc = { kind: 'gasstation', col: stn.col, row: stn.row };
    trk._detourFuelBefore = _fuelNow(trk);
    _startLeg(trk);
    if (trk._autoDispatch) return true;
    // Couldn't route to the station — carry on with the queue rather than stop.
    trk._detourDesc = null;
    return false;
  }

  function _labelFor(desc) {
    if (!desc) return 'destination';
    if (desc.kind === 'facility') return EntityDefs[desc.facilityType]?.label || 'Waste Facility';
    if (desc.kind === 'truck') return desc.truck ? `stranded ${TruckSystem.displayName(desc.truck)}` : 'stranded truck';
    // A resolved source/gas station entity carries a stable _num — numbering
    // it (like the auto-haul planner's status text does) is what lets the
    // player tell "Source Building" apart from "Source Building #2" when a
    // queue or status line names one specifically.
    const ent = _resolveDescriptor(desc);
    const num = (ent && ent._num !== undefined && typeof NUMBERED_ENTITY_TYPES !== 'undefined'
                 && NUMBERED_ENTITY_TYPES.has(ent.type)) ? ` #${ent._num}` : '';
    if (desc.kind === 'source') return (EntityDefs[desc.sourceType]?.label || 'Source Building') + num;
    return 'Gas Station' + num;
  }

  // What a truck is doing right now, in plain language — used by both the
  // per-truck panel and the roster list so a manually-driven truck reads as
  // clearly as an automated one. Returns null when there's nothing more
  // specific to say than the caller's own idle/patrol fallback.
  function _statusText(trk) {
    if (trk._refuelTarget) {
      const num = (trk._refuelTarget._num !== undefined && typeof NUMBERED_ENTITY_TYPES !== 'undefined'
                   && NUMBERED_ENTITY_TYPES.has(trk._refuelTarget.type)) ? ` #${trk._refuelTarget._num}` : '';
      return `Refueling at Gas Station${num}`;
    }
    if (trk._haulState === 'loading')   return `Loading at ${_labelFor(trk._destQueue && trk._destQueue[trk._queueIdx])}`;
    if (trk._haulState === 'unloading') return `Unloading at ${_labelFor(trk._destQueue && trk._destQueue[trk._queueIdx])}`;
    if (trk._haulState === 'fuelling')  return `Refuelling ${_labelFor(trk._destQueue && trk._destQueue[trk._queueIdx])}`;
    if (trk._autoDispatch) {
      const desc = trk._detourDesc || (trk._destQueue && trk._destQueue[trk._queueIdx]);
      return `Heading to ${_labelFor(desc)}`;
    }
    return null;
  }

  // Attempts to start the leg at trk._queueIdx. If that destination no
  // longer exists, removes it from the queue and moves on (respecting loop)
  // looking for a valid one, up to one full pass — gives up (stops dispatch)
  // if nothing in the queue resolves or no route can be found to anything.
  // Dispatch is over for this truck, and it stands where it is. Clearing
  // _autoDispatch alone left it rolling on the route of its LAST leg, which
  // truck.js then reads as a round-and-round patrol: from the end of it the
  // truck turned for the first waypoint in a straight line, through whatever
  // stood between. A Waste Truck that had just unloaded drove at a row of
  // wind turbines that way, trying to get back to the generator it came from.
  function _halt(trk) {
    trk._autoDispatch = false;
    if (trk._patrolling) TruckSystem.stopPatrol(trk);
  }

  // A truck with no route to where it was sent, because the destination is
  // across water with no bridge: a card that says so, whoever built the
  // queue. The auto-haul planner just quietly picked another target, so a
  // generator over the river filled with ash with no word of why the
  // trucks never came. One card per destination, not raised again for a
  // few minutes after it is dismissed. True when water was the reason.
  const _waterNagAt = new Map();   // destination key -> Date.now() last raised
  const WATER_NAG_MS = 5 * 60 * 1000;
  // Cards up now: key -> { entity, wx, wy, tag }, where the truck was when
  // it found no way over. Rechecked whenever something is built or pulled
  // down (_recheckWater), and taken down once there is a route after all.
  const _waterCards = new Map();
  let _waterTopo = -1, _waterCheckAt = 0;
  // Solved: the card goes, and a fresh cut-off later may say so at once.
  // Dismissed by the player: only forgotten here, so the cooldown holds.
  function _clearWater(key, solved = true) {
    const card = _waterCards.get(key);
    if (!card) return;
    _waterCards.delete(key);
    if (!solved) return;
    _waterNagAt.delete(key);
    if (typeof NotificationStack !== 'undefined') NotificationStack.dismissTag(card.tag);
  }
  function _recheckWater() {
    if (!_waterCards.size) return;
    const now = Date.now(), topo = EntityRegistry.getDriveVersion();
    if (topo === _waterTopo || now - _waterCheckAt < 1000) return;
    _waterTopo = topo; _waterCheckAt = now;
    for (const [key, card] of [..._waterCards]) {
      const gone = !EntityRegistry.all().has(card.entity);
      const dismissed = typeof NotificationStack !== 'undefined' && !NotificationStack.hasTag(card.tag);
      if (dismissed) _clearWater(key, false);
      else if (gone || TruckRouting.findPath(card.wx, card.wy, card.entity, null, null)) _clearWater(key);
      else if (EntityRegistry.getByType(T.TRUCK).has(card.trk) && _servedElsewhere(card.trk, card.entity, card.desc)) _clearWater(key);
    }
  }
  // Is a bridge actually needed? Only asked for Auto Dispatch trucks: a
  // queue the player built by hand named that stop, so they need to hear
  // it can't be reached. The planner, though, only needs SOME way to get
  // the job done: a refuel is fine if another stocked station is in this
  // truck's reach, and a waste source is fine if another truck of the same
  // kind can get to it (it will be collected from that side).
  function _servedElsewhere(trk, entity, desc) {
    if (!trk._autoHaulEnabled || !desc) return false;
    if (desc.kind === 'gasstation') {
      for (const stn of EntityRegistry.getByType(T.GASSTATION))
        if (stn !== entity && stn.powered && (stn._fuelStored || 0) > 0 && _canReach(trk, stn)) return true;
      return false;
    }
    if (desc.kind === 'source') {
      let n = 0;
      for (const other of EntityRegistry.getByType(T.TRUCK)) {
        if (other === trk || !!other._hauler !== !!trk._hauler) continue;
        if (++n > 8) break;
        if (_canReach(other, entity)) return true;
      }
    }
    return false;
  }
  function _waterNotice(trk, entity, desc, fromWx, fromWy) {
    if (entity.type === T.TRUCK || typeof TruckRouting === 'undefined' || !TruckRouting.acrossWater) return false;
    if (!TruckRouting.acrossWater(fromWx, fromWy, entity)) return false;
    if (_servedElsewhere(trk, entity, desc)) return true;   // water was the reason, but there's a way round
    if (typeof NotificationStack === 'undefined') return true;
    const key = `${entity.col},${entity.row}`, tag = 'truck-water-' + key;
    const label = _labelFor(desc), who = trk._hauler ? 'Hauler' : 'Waste truck';
    const message = `${label} is across water with no bridge to it. Build a Bridge so trucks can drive over: click to jump there`;
    if (NotificationStack.hasTag(tag)) { NotificationStack.updateTag(tag, { message }); return true; }
    if (Date.now() - (_waterNagAt.get(key) || 0) < WATER_NAG_MS) return true;
    _waterNagAt.set(key, Date.now());
    _waterCards.set(key, { entity, wx: fromWx, wy: fromWy, tag, trk, desc });
    _waterTopo = EntityRegistry.getDriveVersion();
    NotificationStack.push({
      icon: '🌉', title: `${who} can't reach ${label}`, message, tag, color: '#60c8ff', border: '#1a4a70',
      onClick: () => Camera.recentreOn((entity.col + (entity.width || 1) / 2) * TILE, (entity.row + (entity.height || 1) / 2) * TILE),
    });
    return true;
  }

  // Spots this truck wedged on lately (truck.js records them when it backs
  // out), for the router to route round. Expired ones are dropped here.
  function _wedges(trk) {
    if (!trk._wedges || !trk._wedges.length) return null;
    const now = Date.now();
    trk._wedges = trk._wedges.filter(w => w.until > now);
    return trk._wedges.length ? trk._wedges : null;
  }

  function _startLeg(trk) {
    // A refuel detour takes priority over the queue. If the station has gone
    // (demolished, or no route to it), drop the detour and fall through.
    if (trk._detourDesc) {
      const stn = _resolveDescriptor(trk._detourDesc);
      if (stn) {
        TruckSystem.initWorldPos(trk);
        const path = TruckRouting.findPath(trk._wx + TILE / 2, trk._wy + TILE * 1.5, stn, trk._failedApproaches, _wedges(trk));
        if (path && path.length === 0) {
          trk._autoDispatch = true; trk._legDone = false;
          trk._awaitingArrivalGrace = true; trk._arrivalGraceTicks = 0;
          return;
        }
        if (path && path.length >= 2) {
          TruckSystem.setPath(trk, path);
          const goal = path[path.length - 1];
          trk._legGoalKey = `${Math.floor(goal.wx / TILE)},${Math.floor(goal.wy / TILE)}`;
          trk._autoDispatch = true; trk._legDone = false; trk._awaitingArrivalGrace = false;
          TruckSystem.startPatrol(trk);
          return;
        }
      }
      trk._detourDesc = null;
    }

    const queue = trk._destQueue || [];
    if (!queue.length) { trk._autoDispatch = false; return; }

    const maxTries = queue.length;
    for (let tries = 0; tries < maxTries; tries++) {
      if (trk._queueIdx < 0 || trk._queueIdx >= queue.length) trk._queueIdx = 0;
      const desc = queue[trk._queueIdx];
      const entity = _resolveDescriptor(desc);
      if (!entity) {
        _toast(trk, `⚠ ${_labelFor(desc)} no longer exists; removed from queue`, '#ff8060', '#180800', '#602010');
        queue.splice(trk._queueIdx, 1);   // _queueIdx now points at the next stop
        if (trk._queueIdx >= queue.length) {
          if (!trk._queueLoop) { trk._autoDispatch = false; return; }
          trk._queueIdx = 0;
        }
        continue;
      }

      TruckSystem.initWorldPos(trk);
      const fromWx = trk._wx + TILE / 2, fromWy = trk._wy + TILE * 1.5;
      const path = TruckRouting.findPath(fromWx, fromWy, entity, trk._failedApproaches, _wedges(trk));
      if (path && path.length === 0) {
        // Already sitting right next to this destination (e.g. just
        // finished the previous leg nearby) — nothing to drive. Don't mark
        // the leg complete instantly, though (see ARRIVAL_GRACE_TICKS) —
        // wait for it via the same grace-window handling tick() applies below.
        trk._autoDispatch = true;
        trk._legDone = false;
        trk._awaitingArrivalGrace = true;
        trk._arrivalGraceTicks = 0;
        return;
      }
      if (!path || path.length < 2) {
        if (!_waterNotice(trk, entity, desc, fromWx, fromWy))
          _toast(trk, `⚠ No route found to ${_labelFor(desc)}`, '#ff6040', '#180800', '#602010');
        _halt(trk);
        return;
      }

      _clearWater(`${entity.col},${entity.row}`);   // a route there after all
      TruckSystem.setPath(trk, path);
      const goal = path[path.length - 1];
      trk._legGoalKey = `${Math.floor(goal.wx / TILE)},${Math.floor(goal.wy / TILE)}`;
      trk._autoDispatch = true;
      trk._legDone = false;
      trk._awaitingArrivalGrace = false; // clear any stale grace-wait from a leg this one is replacing
      TruckSystem.startPatrol(trk);
      return;
    }
    // Nothing in the queue resolved to a live entity.
    _halt(trk);
    _toast(trk, '⚠ No valid destinations left in queue', '#ff6040', '#180800', '#602010');
  }

  return {
    needsFuelBefore: _needsFuelBefore,
    nearestStation:  _nearestStation,
    reachableStation: _reachableStation,
    isRefuelDetour:  (trk) => !!trk._detourDesc,
    labelFor:        _labelFor,
    statusText:      _statusText,

    // Called from the panel's START button when a queue exists and dispatch
    // isn't already running — (re)starts from the front of the queue.
    //
    // `avoidApproaches` is an optional list of "col,row" approach tiles to
    // treat as already-failed on the first leg, so a caller retrying a
    // destination can ask for a different side of the building than the one
    // that just didn't work out. AutoHaulSystem uses this when a truck parks
    // a hair outside HaulSystem's load/unload buffer: the route "succeeded",
    // so the normal stuck/reroute path never fires, but the leg still
    // achieved nothing and simply repeating it would park in the same spot.
    beginQueue(trk, avoidApproaches) {
      if (!trk._destQueue || !trk._destQueue.length) return;
      trk._queueIdx = 0;
      trk._rerouteAttempts = 0;
      trk._failedApproaches = (avoidApproaches && avoidApproaches.length) ? avoidApproaches.slice() : null;
      trk._detourDesc = null;
      if (!_maybeFuelDetour(trk)) _startLeg(trk);
    },

    // Called from the panel's per-row "play" button — immediately redirects
    // the truck to the chosen queue entry, overriding whatever leg it was
    // on (or whether dispatch was even running yet). Clears any in-progress
    // recovery/reroute state from the leg it was abandoning so a stuck-strike
    // count from the old destination doesn't carry over to the new one.
    jumpTo(trk, index) {
      if (!trk._destQueue || index < 0 || index >= trk._destQueue.length) return;
      trk._queueIdx = index;
      trk._rerouteAttempts = 0;
      trk._failedApproaches = null;
      trk._detourDesc = null;   // the player picked this stop — go straight there
      trk._needsReroute = false;
      trk._recoverTimer = 0;
      trk._legDone = false;
      _startLeg(trk);
    },

    // Called once per logic tick for every truck.
    tick() {
      _recheckWater();
      for (const trk of EntityRegistry.getByType(T.TRUCK)) {
        if (!trk._autoDispatch) { trk._legFuelling = false; continue; }

        // A leg to a gas station is over once the refuel is. Left to run,
        // it still drove the last tile or two to its parking spot first, and
        // the panel read "Heading to Gas Station" for the station the truck
        // was standing at with a full tank.
        const fuelling = !!trk._refuelTarget;
        if (trk._legFuelling && !fuelling) {
          const desc = trk._detourDesc || (trk._destQueue && trk._destQueue[trk._queueIdx]);
          if (desc && desc.kind === 'gasstation') {
            if (trk._patrolling) TruckSystem.stopPatrol(trk);
            trk._arrivalGraceTimer = 0;
            trk._awaitingArrivalGrace = false;
            trk._needsReroute = false;
            trk._legDone = true;
          }
        }
        trk._legFuelling = fuelling;

        // A leg with nothing moving it on: on a trip, but not driving, not
        // counting down its arrival grace, not loading, unloading or
        // refuelling, not backing out of a jam, with no finish flagged. Only
        // a save can leave a truck like that: _awaitingArrivalGrace isn't
        // kept, so a truck saved in the moment after it parked at its stop
        // came back still "on its way there" and stood beside it for good,
        // and its planner, which waits for the leg to end, never got it
        // back. Restarting the leg from where it stands settles it: a truck
        // already at its stop finishes there, one short of it drives on.
        const stalled = !trk._patrolling && !trk._awaitingArrivalGrace && !trk._legDone && !trk._needsReroute
          && !(trk._recoverTimer > 0) && !trk._haulState && !trk._refuelTarget && !trk._fuelledBy
          && !TruckSystem.isDriven(trk) && !(typeof truckStranded === 'function' && truckStranded(trk));
        trk._stallTicks = stalled ? (trk._stallTicks || 0) + 1 : 0;
        if (trk._stallTicks >= STALL_TICKS) {
          trk._stallTicks = 0;
          if (trk._detourDesc || (trk._destQueue && trk._destQueue.length)) { _startLeg(trk); continue; }
          trk._autoDispatch = false;
          continue;
        }

        if (trk._awaitingArrivalGrace) {
          // Reset (not just pause) the count while a load/unload/refuel is
          // actually active — it needs a fresh grace window afterward too,
          // same reasoning as truck.js's ARRIVAL_GRACE_SECONDS: don't let a
          // count that was already ticking up before hauling started cause
          // this to complete the instant hauling ends.
          if (trk._haulState || trk._refuelTarget) { trk._arrivalGraceTicks = 0; continue; }
          trk._arrivalGraceTicks = (trk._arrivalGraceTicks || 0) + 1;
          if (trk._arrivalGraceTicks < ARRIVAL_GRACE_TICKS) continue;
          trk._awaitingArrivalGrace = false;
          trk._arrivalGraceTicks = 0;
          trk._legDone = true;
        }

        // The truck backed out of a collision on its current leg — recompute
        // a fresh route to the SAME destination from wherever it ended up.
        // Checked before _legDone since a stuck truck never actually reaches
        // its waypoint (it backs out first), so the two never fire together.
        if (trk._needsReroute && !(trk._recoverTimer > 0)) {
          trk._needsReroute = false;
          trk._rerouteAttempts = (trk._rerouteAttempts || 0) + 1;
          // Remember where it was trying to get to, so the new route aims
          // for a different side instead of wedging in the same spot again.
          if (trk._legGoalKey) {
            trk._failedApproaches = trk._failedApproaches || [];
            if (!trk._failedApproaches.includes(trk._legGoalKey)) trk._failedApproaches.push(trk._legGoalKey);
          }
          if (trk._rerouteAttempts > MAX_REROUTE_ATTEMPTS) {
            _halt(trk);
            _toast(trk, '⚠ Truck kept getting stuck; dispatch cancelled', '#ff6040', '#180800', '#602010');
            continue;
          }
          _startLeg(trk);
          continue;
        }

        if (!trk._legDone) continue;
        trk._legDone = false;
        trk._rerouteAttempts = 0;
        trk._failedApproaches = null;
        const queue = trk._destQueue || [];
        if (!queue.length) { trk._autoDispatch = false; trk._detourDesc = null; continue; }

        // Back from a refuel detour — resume the stop it was about to head
        // for, without advancing past it.
        if (trk._detourDesc) {
          // Parked but never refuelled (came in at a bad angle, station ran
          // dry first…) — skip that station for a while, or the very next
          // leg's fuel check would send it straight back, forever.
          if (_fuelNow(trk) <= (trk._detourFuelBefore || 0) + 0.5) {
            trk._badStation = { key: `${trk._detourDesc.col},${trk._detourDesc.row}`, until: Date.now() + 45000 };
          }
          trk._detourDesc = null;
          _startLeg(trk);
          continue;
        }

        trk._queueIdx++;
        if (trk._queueIdx >= queue.length) {
          if (trk._queueLoop) {
            trk._queueIdx = 0;
          } else {
            trk._autoDispatch = false;
            continue;
          }
        }
        if (!_maybeFuelDetour(trk)) _startLeg(trk);
      }
    },
  };
})();
