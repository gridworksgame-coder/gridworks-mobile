/* ═══════════════════════════════════════════════════════════════════
   AUTO HAUL DISPATCH
   ─────────────────────────────────────────────────────────────────
   A late-game upgrade to the Truck Patrol panel: hand a truck a job
   ("Collect Coal Waste" / "Oil" / "Nuclear" / "All Waste") and it runs
   the whole haul loop by itself — drive to a source that's backing up,
   load, take it to the matching processing facility, unload, and detour
   to a gas station whenever the tank won't cover the next round trip.

   It does NOT re-implement driving. Every leg is handed to
   TruckDispatchSystem as a one-entry queue, so routing, reroute-on-stuck
   and the arrival grace window all behave exactly as they do for a
   hand-built queue. This module is purely the brain that decides where
   the truck should go next; truck_dispatch.js remains the legs.

   Unlocking is Progression's job, not this module's: T.AUTODISPATCH is an
   ordinary UNLOCK_DEFS entry (Research MK3 + 15 waste-producing buildings
   standing), so it goes "ready" and waits for the player to confirm it at a
   Research Station like every other unlock. This file only ever READS
   Progression.isUnlocked — it must never flip the flag itself, which is what
   made it appear on its own the moment a save with the right conditions was
   loaded.
   ═══════════════════════════════════════════════════════════════════ */

// ── Stranded trucks ─────────────────────────────────────────────
// A truck that has run its tank dry where it stands can't drive to a gas
// station, so a Hauler brings the fuel to it (AutoHaulSystem's _planRescue
// picks the run, HaulSystem pumps it across). Shared with truck_dispatch.js,
// which routes a leg to one, and waste_cooling_systems.js.
const TRUCK_DRY_FUEL = 0.5;   // fuel at or below this: stranded
function truckStranded(t) {
  return !!t && t.type === T.TRUCK && t._fuel !== undefined && t._fuel <= TRUCK_DRY_FUEL
      && !t._refuelTarget && !t._bowser && EntityRegistry.getByType(T.TRUCK).has(t);
}
// Where a truck stands, as a one-tile footprint (the tile under the middle
// of its body) that routing and the dock distance can treat like a building.
function truckFootprint(t) {
  TruckSystem.initWorldPos(t);
  return { type: T.TRUCK, col: Math.floor((t._wx + TILE / 2) / TILE), row: Math.floor((t._wy + TILE * 1.5) / TILE),
           width: 1, height: 1, truck: t };
}

const AutoHaulSystem = (() => {
  // ── Unlock ──────────────────────────────────────────────────────
  // Kept in sync with the T.AUTODISPATCH entry in progression.js, which owns
  // the actual gate; this constant is only for the panel's progress text.
  const REQUIRED_WASTE_BUILDINGS = 20;

  // ── Tuning ──────────────────────────────────────────────────────
  // A source has to be at least this full before an EMPTY truck is sent
  // out for it. This is the "85%" rule: automation exists to stop buffers
  // overflowing, not to chase every trickle of ash across the map.
  const DISPATCH_WASTE_PCT = 85;
  const DECOMMISSIONED_MIN_PCT = 0.5;   // …but a unit that will never refill is emptied to the dregs
  // Once a truck is already out with cargo aboard and room to spare, it
  // will top off at much emptier sources of the SAME waste type on its way
  // — a half-loaded trip to the facility is wasted fuel. Mirrors the
  // top-off behaviour HaulSystem already applies when a truck happens to
  // pass a source.
  const TOPOFF_WASTE_PCT = 25;
  // Cargo fraction at/above which the truck stops looking for more and
  // heads for the facility.
  const CARGO_FULL_FRAC = 0.9;
  // Fuel thresholds and trip estimates live in TruckDispatchSystem
  // (needsFuelBefore), shared with manual patrol queues.

  // Seconds between planning passes for a truck that has nothing to do.
  // Planning walks every waste source/facility, so idle trucks shouldn't
  // redo it at the full 10Hz logic rate.
  const IDLE_REPLAN_SECONDS = 2;
  // How long a destination is skipped after a leg to it made no progress
  // (no route, wedged, facility full on arrival, …). Without this the
  // planner would pick the same unreachable building forever.
  const BLACKLIST_SECONDS = 45;
  // …but not on the FIRST failure. A truck can complete a leg perfectly and
  // still park a fraction of a tile outside HaulSystem's 2-tile load/unload
  // buffer, purely because of the angle it came in at. The route succeeded,
  // so dispatch's own stuck/reroute logic never fires, yet nothing was
  // loaded or unloaded. Re-routing to a DIFFERENT approach tile fixes it,
  // so each destination gets this many attempts (each avoiding the approach
  // tiles that already failed) before it's written off.
  const MAX_APPROACH_ATTEMPTS = 3;
  // Minimum gap between two status toasts from the same truck, so a truck
  // with nowhere to go doesn't spam the notification stack.
  const NAG_SECONDS = 90;

  // Distance is worth this many "waste percent" when ranking candidate
  // sources — a source 40 tiles closer is worth about 10% more fill.
  const DIST_WEIGHT = 0.25;

  // ── Jobs ────────────────────────────────────────────────────────
  const JOBS = [
    { id: 'coal',    label: 'Collect Coal Waste',    sources: [T.COALGENERATOR] },
    { id: 'oil',     label: 'Collect Oil Waste',     sources: [T.REFINERY] },
    // Reactors, Reprocessing Plants and Leach Plants (thorium tailings) all
    // unload at the Nuclear Waste Processing Facility, so one truck can top
    // off between them.
    { id: 'nuclear', label: 'Collect Nuclear Waste', sources: [T.NUCLEARREACTOR, T.REPROCESSOR, T.LEACHPLANT] },
    { id: 'all',     label: 'Collect All Waste',     sources: WASTE_SOURCES },
  ];
  const DEFAULT_JOB = 'all';
  function _job(id) { return JOBS.find(j => j.id === id) || JOBS.find(j => j.id === DEFAULT_JOB); }

  // ── Small helpers ───────────────────────────────────────────────
  const _key = e => `${e.col},${e.row}`;
  const _cargoCap = (trk) => truckSpec(trk).cargoCapacity || 100;
  const _fuelCap  = (trk) => truckSpec(trk).fuelCapacity  || 100;

  // Coal and oil write their fields as 0–100 fill percentages; the reactor's
  // spent fuel is a unit count. WASTE_CFG.cap() states what full means for
  // each, so this reads the same either way.
  function _wastePct(src) {
    const cfg = WASTE_CFG[src.type];
    if (!cfg) return 0;
    const cap = cfg.cap() || 100;
    return Math.max(0, Math.min(100, ((src[cfg.field] || 0) / cap) * 100));
  }

  function _distTiles(trk, ent) {
    const ec = ent.col + (ent.width  || 1) / 2;
    const er = ent.row + (ent.height || 1) / 2;
    return Math.hypot(ec - trk.col, er - trk.row);
  }

  function _facilityHasRoom(fac) {
    const cap = (EntityDefs[fac.type] || {}).storageCapacity || 300;
    return (fac._wasteStored || 0) < cap - 0.5;
  }

  // ── Per-truck scratch state ─────────────────────────────────────
  // Everything lives on the truck entity so it survives the panel being
  // closed; only `_autoHaulEnabled` / `_autoHaulJob` are persisted.
  function _blacklist(trk) {
    if (!trk._autoHaulBlacklist) trk._autoHaulBlacklist = {};
    return trk._autoHaulBlacklist;
  }
  function _isBlacklisted(trk, key, now) {
    const until = _blacklist(trk)[key];
    if (until === undefined) return false;
    if (now >= until) { delete _blacklist(trk)[key]; return false; }
    return true;
  }
  function _blacklistFor(trk, key, now) {
    if (key) _blacklist(trk)[key] = now + BLACKLIST_SECONDS;
  }

  // Failed-approach bookkeeping, per destination. `_autoHaulAttempts[key]` is
  // { n, approaches } — how many times this destination has been tried and
  // the goal tiles those attempts parked at, which the retry tells dispatch
  // to steer away from.
  function _attempts(trk) {
    if (!trk._autoHaulAttempts) trk._autoHaulAttempts = {};
    return trk._autoHaulAttempts;
  }
  function _noteFailedAttempt(trk, key, goalKey, now) {
    if (!key) return;
    const rec = _attempts(trk)[key] || (_attempts(trk)[key] = { n: 0, approaches: [] });
    rec.n++;
    if (goalKey && !rec.approaches.includes(goalKey)) rec.approaches.push(goalKey);
    if (rec.n >= MAX_APPROACH_ATTEMPTS) {
      _blacklistFor(trk, key, now);
      delete _attempts(trk)[key];
    }
  }
  function _clearAttempts(trk, key) {
    if (key && trk._autoHaulAttempts) delete trk._autoHaulAttempts[key];
  }

  function _say(trk, msg, colour, bg, border, now) {
    if (now - (trk._autoHaulLastNag || -1e9) < NAG_SECONDS) return;
    trk._autoHaulLastNag = now;
    showToast(msg, colour, bg, border);
  }

  // Sources another auto truck is already on its way to. Keeps a fleet
  // from piling onto the single fullest generator while everything else
  // overflows — the whole point of running more than one truck.
  function _claimedByOthers(trk) {
    const claimed = new Set();
    for (const other of EntityRegistry.getByType(T.TRUCK)) {
      if (other === trk || !other._autoHaulEnabled) continue;
      if (other._autoHaulClaim) claimed.add(other._autoHaulClaim);
    }
    return claimed;
  }

  // ── Candidate pickers ───────────────────────────────────────────
  // Best source to pick up from, or null. `minPct` is the fill threshold
  // (85 for a fresh trip, lower when topping off), `types` the job filter.
  function _bestSource(trk, types, minPct, now) {
    const claimed = _claimedByOthers(trk);
    let best = null, bestScore = -Infinity;
    for (const srcType of types) {
      const cfg = WASTE_CFG[srcType];
      if (!cfg) continue;
      // No point collecting a waste type that has nowhere to go — the truck
      // would fill up and then circle looking for a facility that doesn't
      // exist. Skipped rather than warned here; _plan reports it once.
      let facilityExists = false;
      for (const _f of EntityRegistry.getByType(cfg.facilityType)) { facilityExists = true; break; }
      if (!facilityExists) continue;
      for (const src of EntityRegistry.getByType(srcType)) {
        const key = _key(src);
        if (claimed.has(key) || _isBlacklisted(trk, key, now)) continue;
        if (haulBlocked(src)) continue;
        const pct = _wastePct(src);
        // A decommissioned unit (a cleanup contract's) makes no more waste:
        // what is in it is all there will ever be, so it never climbs back
        // to the dispatch level. Waiting for it to left the last part of
        // every pile where it was, and the clause unfinishable by truck.
        if (pct < (src._decommissioned ? Math.min(minPct, DECOMMISSIONED_MIN_PCT) : minPct)) continue;
        const dist = _distTiles(trk, src);
        // Near-overflowing sources jump the queue: past 95% a coal
        // generator stops burning altogether, so those are urgent in a way
        // an 86% one isn't.
        const urgency = pct >= 95 ? 40 : 0;
        const score = pct + urgency - dist * DIST_WEIGHT;
        if (score > bestScore) { bestScore = score; best = src; }
      }
    }
    return best;
  }

  // Returns { fac, anyWithRoom } — `anyWithRoom` says whether a usable
  // facility existed at all, so the caller can tell "they're all full" (a
  // real problem worth telling the player about) apart from "the only one is
  // briefly blacklisted after a bad approach" (which resolves itself).
  function _facilityChoice(trk, facilityType, now) {
    let best = null, bestDist = Infinity, anyWithRoom = false;
    for (const fac of EntityRegistry.getByType(facilityType)) {
      if (!_facilityHasRoom(fac)) continue;
      anyWithRoom = true;
      if (_isBlacklisted(trk, _key(fac), now)) continue;
      const d = _distTiles(trk, fac);
      if (d < bestDist) { bestDist = d; best = fac; }
    }
    return { fac: best, anyWithRoom };
  }
  function _bestFacility(trk, facilityType, now) {
    return _facilityChoice(trk, facilityType, now).fac;
  }

  // Nearest one the truck can drive to, not merely the nearest.
  function _bestStation(trk, now) {
    return TruckDispatchSystem.reachableStation(trk, stn => _isBlacklisted(trk, _key(stn), now));
  }

  // ── The planner ─────────────────────────────────────────────────
  // Decides the truck's next leg and returns { desc, kind, entity, status }
  // or null when there's genuinely nothing worth doing right now.
  function _plan(trk, now) {
    if (trk._hauler) {
      const core = _planCore(trk, now);
      if (core) { trk._rescueFor = null; return core; }
      return _planRescue(trk, now) || _planCargo(trk, now);
    }
    const job     = _job(trk._autoHaulJob);
    const cargo   = trk._cargoAmount || 0;
    const cap     = _cargoCap(trk);
    const fuel    = trk._fuel !== undefined ? trk._fuel : _fuelCap(trk);

    // ── 1. Fuel ──
    // Work out what the truck is about to attempt, then check the tank
    // covers the drive there AND on from there to the nearest gas station
    // (TruckDispatchSystem.needsFuelBefore — shared with manual patrols).
    // Checking only the first hop let a truck reach a far source and then
    // strand on the way to anything. A low absolute tank always triggers a
    // detour even if the next hop is short, because the hop after that
    // probably isn't.
    const nextStop = cargo >= cap * CARGO_FULL_FRAC && trk._cargoFacility
      ? _bestFacility(trk, trk._cargoFacility, now)
      : _bestSource(trk, job.sources, cargo > 0 ? TOPOFF_WASTE_PCT : DISPATCH_WASTE_PCT, now);
    if (TruckDispatchSystem.needsFuelBefore(trk, nextStop)) {
      const stn = _bestStation(trk, now);
      if (stn) {
        return { kind: 'gas', entity: stn, desc: { kind: 'gasstation', col: stn.col, row: stn.row },
                 status: `Heading to Gas Station${stn._num !== undefined ? ' #' + stn._num : ''} to refuel` };
      }
      // Nowhere to refuel. Keep working while there's fuel left rather than
      // stopping dead — but say so once, because the truck WILL strand.
      _say(trk, '⛽ Auto-dispatch: no powered gas station with fuel; truck may strand',
           '#ffb040', '#180c00', '#604010', now);
      if (fuel <= 0.5) {
        return { kind: 'idle', noFuel: true, status: 'Out of fuel: no station available' };
      }
    }

    // ── 2. Deliver a full (or finished) load ──
    if (cargo > 0 && trk._cargoFacility) {
      // Top-off candidates are the intersection of "feeds the facility whose
      // cargo is already aboard" (HaulSystem refuses to mix waste types) and
      // "covered by the current job" — switching a truck to Oil mid-trip
      // shouldn't have it keep grabbing ash on the way to the ash facility.
      const topOffTypes = job.sources.filter(t => WASTE_CFG[t] && WASTE_CFG[t].facilityType === trk._cargoFacility);
      const topOff = cargo < cap * CARGO_FULL_FRAC
        ? _bestSource(trk, topOffTypes, TOPOFF_WASTE_PCT, now)
        : null;
      // Only detour for a top-off if it's genuinely on the way — a source
      // farther off than the facility itself isn't worth the fuel.
      const fac = _bestFacility(trk, trk._cargoFacility, now);
      if (topOff && (!fac || _distTiles(trk, topOff) <= _distTiles(trk, fac) * 1.25)) {
        return { kind: 'source', entity: topOff,
                 desc: { kind: 'source', sourceType: topOff.type, col: topOff.col, row: topOff.row },
                 status: `Topping off at ${_entLabel(topOff)} (${Math.round(_wastePct(topOff))}%)` };
      }
      if (fac) {
        return { kind: 'facility', entity: fac,
                 desc: { kind: 'facility', facilityType: trk._cargoFacility },
                 status: `Delivering to ${EntityDefs[trk._cargoFacility]?.label || 'facility'}` };
      }
      // Nothing to deliver to. Only nag when that's actually the player's
      // problem — a facility that's merely blacklisted for a few seconds
      // after a bad approach comes back on its own.
      const choice = _facilityChoice(trk, trk._cargoFacility, now);
      if (choice.anyWithRoom) {
        return { kind: 'idle', status: 'Holding cargo: retrying the facility shortly' };
      }
      const facLabel = EntityDefs[trk._cargoFacility]?.label || 'waste facility';
      _say(trk, `🏭 Auto-dispatch: every ${facLabel} is full; truck is holding its load`,
           '#ffb040', '#180c00', '#604010', now);
      return { kind: 'idle', status: 'Holding cargo: no facility with room' };
    }

    // ── 3. Empty truck — go collect ──
    const src = _bestSource(trk, job.sources, DISPATCH_WASTE_PCT, now);
    if (src) {
      return { kind: 'source', entity: src,
               desc: { kind: 'source', sourceType: src.type, col: src.col, row: src.row },
               status: `Collecting from ${_entLabel(src)} (${Math.round(_wastePct(src))}%)` };
    }

    // Nothing at threshold. Distinguish "all quiet" from "you never built
    // the facility this job needs", which otherwise looks identical from
    // the panel and leaves the player wondering why nothing happens.
    const missing = job.sources.filter(t => {
      const cfg = WASTE_CFG[t];
      if (!cfg) return false;
      let anySource = false;
      for (const _s of EntityRegistry.getByType(t)) { anySource = true; break; }
      if (!anySource) return false;
      // Don't nag for a facility the player can't build yet: it only unlocks
      // once that waste stream has hit 60% (WasteSystem.checkAvailability),
      // and a brand-new reactor or generator with an empty buffer has nothing
      // to haul anyway. Without this the card fired the moment the source was
      // built, telling the player to place a building the research station
      // hasn't even offered.
      if (typeof WasteSystem !== 'undefined' && !WasteSystem.isTriggered(t)) return false;
      for (const _f of EntityRegistry.getByType(cfg.facilityType)) return false;
      return true;
    });
    if (missing.length) {
      _say(trk, `🏭 Auto-dispatch: build a ${WASTE_CFG[missing[0]].label} before this job can run`,
           '#ffb040', '#180c00', '#604010', now);
      // Only "waiting" on that facility if it is all this truck could be
      // doing. With another stream it CAN haul, it is simply between loads.
      const canHaulOther = job.sources.some(t => {
        const cfg = WASTE_CFG[t];
        if (!cfg || missing.includes(t)) return false;
        for (const _f of EntityRegistry.getByType(cfg.facilityType)) return true;
        return false;
      });
      return { kind: 'idle', status: canHaulOther
        ? `Standing by: nothing above ${DISPATCH_WASTE_PCT}% (and no ${WASTE_CFG[missing[0]].label})`
        : `Waiting: no ${WASTE_CFG[missing[0]].label}` };
    }
    return { kind: 'idle', status: `Standing by: nothing above ${DISPATCH_WASTE_PCT}%` };
  }

  // ── The Hauler's planner ────────────────────────────────────────
  // Same shape as the waste planner above (fuel first, then deliver what is
  // aboard, then go and collect) but the work comes from storage vessels
  // flagged for Truck Supply instead of from waste buffers. Solids, liquids
  // and process gases (in the tube trailer, truckCargoCap) alike.
  //
  // A trip is chosen as a PAIR, a vessel with room and a source with
  // surplus of what it wants, by the whole distance truck → source →
  // vessel, so a close source with a far delivery does not beat a slightly
  // further one sitting next to the vessel.
  const HAULER_MIN_LOAD = 10;   // not worth a trip for less
  // Job sharing (the empty-truck pick below). Each other Hauler already on
  // a material multiplies that job's cost by another HAUL_SHARE_PENALTY; a
  // request no one is serving divides its cost by up to 1 + HAUL_WAIT_MAX,
  // reaching that after HAUL_WAIT_MAX × HAUL_WAIT_RAMP seconds of waiting.
  const HAUL_SHARE_PENALTY = 1.0;
  const HAUL_WAIT_RAMP     = 60;
  const HAUL_WAIT_MAX      = 3;
  // Cargo nobody asks for and no storage can take is tipped after this long.
  const HOLD_TIP_SECONDS   = 60;
  // A Hauler's refuel check before heading for `next`: a gas-station leg if
  // the tank won't cover it and the run on to a station, else null.
  function _haulerFuelFirst(trk, next, now) {
    if (!TruckDispatchSystem.needsFuelBefore(trk, next)) return null;
    const stn = _bestStation(trk, now);
    if (stn) return { kind: 'gas', entity: stn, desc: { kind: 'gasstation', col: stn.col, row: stn.row },
                      status: `Heading to Gas Station${stn._num !== undefined ? ' #' + stn._num : ''} to refuel` };
    _say(trk, '⛽ Hauler: no powered gas station with fuel; it may strand', '#ffb040', '#180c00', '#604010', now);
    const fuel = trk._fuel !== undefined ? trk._fuel : _fuelCap(trk);
    return fuel <= 0.5 ? { kind: 'idle', noFuel: true, status: 'Out of fuel: no station available' } : null;
  }

  // ── Fuel for stranded trucks ────────────────────────────────────
  // Comes before ordinary cargo: a truck stopped dry is a stopped job. The
  // fuel is Fuel Oil from a refinery or an unflagged tank, or pumped at a
  // gas station (at the pump price), carried as cargo and pumped into the
  // stranded truck's tank where it stands. One Hauler per stranded truck.
  const RESCUE_MIN_LOAD = 10;
  // A Hauler keeps its claim (_rescueFor) from the moment it plans the run
  // until it has pumped the fuel across, including the gap between loading
  // and setting off, when it has no leg at all.
  function _rescuesByOthers(trk) {
    const s = new Set();
    for (const o of EntityRegistry.getByType(T.TRUCK))
      if (o !== trk && o._hauler && o._autoHaulEnabled && o._rescueFor) s.add(o._rescueFor);
    return s;
  }
  // Fuel a stop can give a Hauler: a powered gas station's stock, or the
  // Fuel Oil surplus of a refinery or tank (HaulSystem loads the same way).
  function _fuelAt(C, s) {
    if (s.type === T.GASSTATION) return (s.powered || s._fuelDepot) ? (s._fuelStored || 0) : 0;
    return s._lightningDamaged ? 0 : C.avail('fuel', s);
  }
  function _planRescue(trk, now) {
    const prev = trk._rescueFor;
    trk._rescueFor = null;
    const C = typeof DroneSystem !== 'undefined' ? DroneSystem.cargo : null;
    if (!C || !C.kinds().fuel) return null;
    const aboard = trk._cargoAmount > 0.01 ? trk._cargoKind : null;
    if (aboard && aboard !== 'fuel') return null;   // one material per trip: deliver that first
    const taken = _rescuesByOthers(trk);
    let target = null, fp = null, bestD = Infinity;
    for (const t of EntityRegistry.getByType(T.TRUCK)) {
      if (t === trk || taken.has(t) || !truckStranded(t)) continue;
      const f = truckFootprint(t);
      if (_isBlacklisted(trk, _key(f), now)) continue;
      // The truck it is already fetching fuel for comes first.
      const d = t === prev ? -1 : _distTiles(trk, f);
      if (d < bestD) { bestD = d; target = t; fp = f; }
    }
    if (!target) return null;
    trk._rescueFor = target;
    const name = TruckSystem.displayName(target);
    const need = (truckSpec(target).fuelCapacity || 100) - (target._fuel || 0);
    if (aboard === 'fuel' && trk._cargoAmount >= Math.min(need, RESCUE_MIN_LOAD)) {
      const desc = { kind: 'truck', col: fp.col, row: fp.row };
      // The truck itself rides along unsaved: a reload just plans the run again.
      Object.defineProperty(desc, 'truck', { value: target });
      return _haulerFuelFirst(trk, fp, now) || { kind: 'rescue', entity: fp, leg: { mode: 'rescue', kind: 'fuel', rescue: target }, desc,
                                                  status: `Taking fuel to ${name}` };
    }
    // Go and fetch it: the shortest whole trip, Hauler → fuel → stranded truck.
    const want = Math.min(truckCargoCap(trk, 'fuel'), need);
    let src = null, bestCost = Infinity;
    const consider = (s) => {
      if (_isBlacklisted(trk, _key(s), now)) return;
      if (_fuelAt(C, s) < Math.min(want, RESCUE_MIN_LOAD)) return;
      const cost = _distTiles(trk, s) + Math.hypot(s.col + (s.width || 1) / 2 - fp.col - 0.5, s.row + (s.height || 1) / 2 - fp.row - 0.5);
      if (cost < bestCost) { bestCost = cost; src = s; }
    };
    for (const s of C.sources('fuel')) consider(s);
    for (const s of EntityRegistry.getByType(T.GASSTATION)) consider(s);
    if (!src) {
      trk._rescueFor = null;
      _say(trk, `⛽ Hauler: ${name} is out of fuel, but no refinery, fuel tank or gas station has any to take it`, '#ffb040', '#180c00', '#604010', now);
      return null;
    }
    return _haulerFuelFirst(trk, src, now) || { kind: 'source', entity: src,
      leg: { mode: 'load', kind: 'fuel', ent: src, rescue: target, want },
      desc: { kind: 'source', sourceType: src.type, col: src.col, row: src.row },
      status: `Collecting fuel for ${name} from ${_entLabel(src)}` };
  }

  function _planCargo(trk, now) {
    const C = typeof DroneSystem !== 'undefined' ? DroneSystem.cargo : null;
    if (!C) return { kind: 'idle', status: 'Standing by' };
    const kinds = C.kinds(), cargo = trk._cargoAmount || 0;
    const fuel  = trk._fuel !== undefined ? trk._fuel : _fuelCap(trk);
    const byRoad = (k) => !!kinds[k];
    const roomOf = (v, k, meta) => C.vessels[kinds[k].phase].room(v, k, meta || null);
    const stop   = (e) => ({ kind: 'source', sourceType: e.type, col: e.col, row: e.row });
    const dests = [];
    for (const ph of ['solid', 'liquid', 'gas'])
      for (const v of EntityRegistry.getByType(C.vessels[ph].type()))
        if (v._truckSupply && byRoad(v._truckSupply)) dests.push(v);

    const fuelFirst = (next) => _haulerFuelFirst(trk, next, now);

    // ── Deliver what is aboard ──
    // Any amount counts, down to the dregs HaulSystem still calls cargo: a
    // Hauler sent to collect with a little of something else left aboard
    // would be refused at the dock (one material per trip) and never load.
    if (cargo > 0.01 && trk._cargoKind && kinds[trk._cargoKind]) {
      const k = trk._cargoKind, label = kinds[k].label;
      let best = null, bestD = Infinity, asking = false;
      for (const v of dests) {
        if (v._truckSupply !== k) continue;
        asking = true;
        if (roomOf(v, k, trk._cargoMeta) < 1 || _isBlacklisted(trk, _key(v), now)) continue;
        const d = _distTiles(trk, v);
        if (d < bestD) { bestD = d; best = v; }
      }
      if (!best) {
        // Nothing can take this: nothing asks for it any more (its request
        // was turned off or the vessel demolished), or every vessel that
        // does is full. Rather than idle forever with it aboard, put it in
        // the nearest storage already holding this material that isn't asking
        // for anything; with nowhere at all to put it, tip it after a minute
        // so the truck can get back to work.
        // (Never an empty one. An empty container may be a production line's
        // buffer between deliveries: coal dropped in one meant for recovered
        // uranium kept the uranium out and rolled down the belt to the MOX
        // plant, and it passed for a coal source the Haulers kept coming back to.)
        // (Only the "nothing asks" case did this. A Hauler left with part of
        // a load once its vessel filled held it for good: one material per
        // trip, so it could take no other job. Three of four on a fusion job
        // stood like that with hydrogen and nitrogen aboard while the
        // tritium, compound and water runs behind them went unserved, which
        // is what kept the full vessels from ever being drawn down.)
        const V = C.vessels[kinds[k].phase];
        for (const v of EntityRegistry.getByType(V.type())) {
          if (v._truckSupply || v._droneSupply || V.held(v) !== k || roomOf(v, k, trk._cargoMeta) < 1 || _isBlacklisted(trk, _key(v), now)) continue;
          const d = _distTiles(trk, v);
          if (d < bestD) { bestD = d; best = v; }
        }
        if (!best) {
          if (trk._holdSince === undefined) trk._holdSince = now;
          if (now - trk._holdSince >= HOLD_TIP_SECONDS) {
            trk._cargoAmount = 0; trk._cargoKind = null; trk._cargoMeta = null; trk._cargoLabel = null; trk._holdSince = undefined;
            _say(trk, `🚚 Hauler tipped its ${label}: ${asking ? 'every vessel asking for it is full' : 'nothing is asking for it'} and no storage has room`, '#ffb040', '#180c00', '#604010', now);
            return { kind: 'idle', status: 'Standing by' };
          }
          return { kind: 'idle', status: `Holding ${label}: ${asking ? 'every vessel asking for it is full' : 'nothing is asking for it'} (tipping it in ${Math.ceil(HOLD_TIP_SECONDS - (now - trk._holdSince))}s)` };
        }
      }
      trk._holdSince = undefined;
      return fuelFirst(best) || { kind: 'facility', entity: best, leg: { mode: 'unload', kind: k, ent: best }, desc: stop(best),
                                  status: `${best._truckSupply ? 'Delivering' : 'Storing'} ${label} ${best._truckSupply ? 'to' : 'in'} ${_entLabel(best)}` };
    }

    // ── Empty: pick a vessel with room and a source with surplus ──
    if (!dests.length) return { kind: 'idle', status: 'Standing by: no storage is asking for Truck Supply' };
    const claimed = _claimedByOthers(trk);
    // How many other Haulers are already on each material — carrying it, or
    // sent to collect it. Each one makes that job look further away, so the
    // fleet spreads across every request instead of piling onto the nearest.
    const busy = {};
    for (const o of EntityRegistry.getByType(T.TRUCK)) {
      if (o === trk || !o._hauler || !o._autoHaulEnabled) continue;
      const ok = (o._cargoAmount > 0.01 && o._cargoKind) || (o._haulerLeg && o._haulerLeg.kind);
      if (ok) busy[ok] = (busy[ok] || 0) + 1;
    }
    let best = null, bestCost = Infinity, anyRoom = false;
    for (const d of dests) {
      const k = d._truckSupply, room = roomOf(d, k, null), cap = truckCargoCap(trk, k);
      if (room < HAULER_MIN_LOAD) { d._haulWaitSince = undefined; continue; }
      anyRoom = true;
      // A request nobody is serving gets steadily more attractive the longer
      // it waits, so a long run can't be starved by short ones for ever.
      if (busy[k]) d._haulWaitSince = undefined;
      else if (d._haulWaitSince === undefined) d._haulWaitSince = now;
      const waited = d._haulWaitSince === undefined ? 0 : now - d._haulWaitSince;
      const pull = (1 + HAUL_SHARE_PENALTY * (busy[k] || 0)) / (1 + Math.min(HAUL_WAIT_MAX, waited / HAUL_WAIT_RAMP));
      const dc = d.col + (d.width || 1) / 2, dr = d.row + (d.height || 1) / 2;
      for (const s of C.sources(k)) {
        if (s === d || s._lightningDamaged) continue;
        const key = _key(s);
        if (_isBlacklisted(trk, key, now)) continue;
        const avail = C.avail(k, s);
        if (avail < HAULER_MIN_LOAD || avail < Math.min(cap, room) * 0.3) continue;
        // Another Hauler is already on this source: only join it if there is
        // plainly enough there for both.
        if (claimed.has(key) && avail < cap * 1.5) continue;
        const meta = C.pelletMeta(k, s);
        if (meta && roomOf(d, k, meta) <= 0) continue;
        // Distance per truckload actually moved, weighted by how busy and how
        // long-waiting the request is (see `pull` above).
        const load = Math.max(0.25, Math.min(cap, avail, room) / cap);
        const cost = (_distTiles(trk, s) + Math.hypot(s.col + (s.width || 1) / 2 - dc, s.row + (s.height || 1) / 2 - dr)) / load * pull;
        if (cost < bestCost) { bestCost = cost; best = { s, k }; }
      }
    }
    if (!best) return { kind: 'idle', status: anyRoom ? 'Standing by: nothing in surplus to collect' : 'Standing by: every flagged vessel is full' };
    return fuelFirst(best.s) || { kind: 'source', entity: best.s, leg: { mode: 'load', kind: best.k, ent: best.s }, desc: stop(best.s),
                                  status: `Collecting ${kinds[best.k].label} from ${_entLabel(best.s)}` };
  }

  // Field Core runs come before cargo: a reactor waiting on a core is
  // losing power, a vessel waiting on ore is only waiting. FieldCoreSystem
  // decides the stop (a Core Works to load or return at, a reactor to
  // deliver to or collect from); the swap itself happens at the dock
  // (HaulSystem.tickHauler → FieldCoreSystem.truckDock).
  function _planCore(trk, now) {
    if (typeof FieldCoreSystem === 'undefined') return null;
    const p = FieldCoreSystem.planHauler(trk);
    if (!p) return null;
    if (TruckDispatchSystem.needsFuelBefore(trk, p.ent)) {
      const stn = _bestStation(trk, now);
      if (stn) return { kind: 'gas', entity: stn, desc: { kind: 'gasstation', col: stn.col, row: stn.row },
                        status: `Heading to Gas Station${stn._num !== undefined ? ' #' + stn._num : ''} to refuel` };
    }
    return { kind: 'core', entity: p.ent, leg: { mode: 'core', ent: p.ent },
             desc: { kind: 'source', sourceType: p.ent.type, col: p.ent.col, row: p.ent.row }, status: p.status };
  }

  function _entLabel(ent) {
    const base = EntityDefs[ent.type]?.label || 'Building';
    if (ent._num !== undefined && typeof NUMBERED_ENTITY_TYPES !== 'undefined'
        && NUMBERED_ENTITY_TYPES.has(ent.type)) return `${base} #${ent._num}`;
    return base;
  }

  // Did the leg the truck just finished actually accomplish anything? Used
  // to blacklist destinations that keep failing (unreachable, full on
  // arrival, drained by another truck first) instead of retrying forever.
  function _legMadeProgress(trk) {
    const before = trk._autoHaulSnapshot;
    if (!before) return true;
    const cargo = trk._cargoAmount || 0;
    const fuel  = trk._fuel !== undefined ? trk._fuel : _fuelCap(trk);
    if (before.kind === 'source')   return cargo > before.cargo + 0.5;
    if (before.kind === 'facility' || before.kind === 'rescue') return cargo < before.cargo - 0.5;
    if (before.kind === 'gas')      return fuel  > before.fuel  + 0.5;
    return true;
  }

  // Identifies "what the truck is currently doing" independent of any
  // narration text — a haul/refuel target, or the leg it's driving. Compared
  // tick-to-tick so a stale status string (set once when a leg/haul state
  // began) can be caught and refreshed the moment the underlying state moves
  // on, even if whatever was supposed to update it in the moment got skipped
  // (e.g. the refuel-done -> next-leg-started transition spans a couple of
  // ticks inside TruckDispatchSystem's own arrival-grace window).
  function _legKey(desc) {
    if (!desc) return 'none';
    if (desc.kind === 'facility') return `f:${desc.facilityType}`;
    return `${desc.kind}:${desc.col},${desc.row}`;
  }
  function _statusKey(trk) {
    if (trk._refuelTarget) return `refuel:${trk._refuelTarget.col},${trk._refuelTarget.row}`;
    if (trk._haulState)    return `haul:${trk._haulState}`;
    if (trk._autoDispatch) return `drive:${_legKey(trk._destQueue && trk._destQueue[trk._queueIdx])}`;
    return 'idle';
  }

  function _startLeg(trk, plan, now) {
    trk._destQueue = [plan.desc];
    trk._queueIdx  = 0;
    trk._queueLoop = false;
    trk._autoHaulClaim    = plan.entity ? _key(plan.entity) : null;
    trk._autoHaulTargetKey = trk._autoHaulClaim;
    trk._autoHaulSnapshot = {
      kind:  plan.kind,
      cargo: trk._cargoAmount || 0,
      fuel:  trk._fuel !== undefined ? trk._fuel : _fuelCap(trk),
    };
    // Which stop the Hauler may load or unload at (HaulSystem reads this).
    if (trk._hauler) trk._haulerLeg = plan.leg || null;
    const rec = _attempts(trk)[trk._autoHaulTargetKey];
    TruckDispatchSystem.beginQueue(trk, rec && rec.approaches);
    if (!trk._autoDispatch) {
      // beginQueue bailed immediately — no route, or the destination
      // vanished between planning and starting. Park that target for a
      // while and let the next pass pick something else.
      _noteFailedAttempt(trk, trk._autoHaulTargetKey, null, now);
      trk._autoHaulClaim = null;
      trk._autoHaulSnapshot = null;
      trk._autoHaulStatus = 'Rerouting…';
      trk._autoHaulStatusKey = _statusKey(trk);
      return false;
    }
    trk._autoHaulStatus = plan.status;
    trk._autoHaulStatusKey = _statusKey(trk);
    trk._autoHaulStandby = false;
    return true;
  }

  function _tickTruck(trk, now) {
    // Self-heal: if what the truck is doing has moved on since the status
    // text was last set (a new leg started, a haul/refuel finished, driving
    // resumed) but nothing here yet wrote a matching narration for it, pull
    // a live description straight from the truck's actual fields rather than
    // leaving the old text showing.
    const key = _statusKey(trk);
    if (key !== trk._autoHaulStatusKey) {
      const live = TruckDispatchSystem.statusText(trk);
      if (live) trk._autoHaulStatus = live;
      trk._autoHaulStatusKey = key;
    }

    // Let an in-progress load/unload/refuel finish untouched.
    if (trk._haulState || trk._refuelTarget) {
      if (trk._refuelTarget)              trk._autoHaulStatus = TruckDispatchSystem.statusText(trk) || 'Refueling…';
      else if (trk._haulState === 'loading')   trk._autoHaulStatus = 'Loading…';
      else if (trk._haulState === 'fuelling')  trk._autoHaulStatus = 'Refuelling a stranded truck…';
      else                                     trk._autoHaulStatus = 'Unloading…';
      return;
    }
    // A leg is still running — TruckDispatchSystem owns the truck until it
    // finishes or gives up (which clears _autoDispatch).
    if (trk._autoDispatch) return;
    // No leg running, so it should be standing. One still rolling is on the
    // route of a leg that was given up (a save can hold a truck like that):
    // left alone it loops that route as a patrol. See TruckDispatchSystem's _halt.
    if (trk._patrolling) TruckSystem.stopPatrol(trk);

    // The previous leg just ended. Judge it before planning the next one.
    if (trk._autoHaulSnapshot) {
      if (_legMadeProgress(trk)) {
        _clearAttempts(trk, trk._autoHaulTargetKey);
      } else {
        // _legGoalKey is the approach tile dispatch actually drove to; feeding
        // it back means the retry aims at a different side of the building.
        _noteFailedAttempt(trk, trk._autoHaulTargetKey, trk._legGoalKey, now);
      }
      trk._autoHaulSnapshot = null;
      trk._autoHaulClaim = null;
    }

    if (now < (trk._autoHaulNextPlan || 0)) return;

    const plan = _plan(trk, now);
    if (!plan || plan.kind === 'idle') {
      trk._autoHaulStatus = plan ? plan.status : 'Standing by';
      trk._autoHaulClaim = null;
      // Nothing to do, as opposed to stuck for want of fuel: the fuel
      // watch (GasStationSystem.tickSupply) leaves a truck on standby alone.
      trk._autoHaulStandby = !(plan && plan.noFuel);
      trk._autoHaulNextPlan = now + IDLE_REPLAN_SECONDS;
      return;
    }
    if (!_startLeg(trk, plan, now)) trk._autoHaulNextPlan = now + 1;
  }

  // Elapsed seconds, independent of pause/time-scale games — Date.now is
  // fine here since every use is a cooldown measured in real seconds.
  const _now = () => Date.now() / 1000;

  return {
    JOBS,
    DEFAULT_JOB,
    jobLabel(id) { return _job(id).label; },

    isUnlocked() { return Progression.isUnlocked(T.AUTODISPATCH); },
    reset() {
      for (const trk of EntityRegistry.getByType(T.TRUCK)) this.disable(trk);
    },

    // Waste-producing buildings currently standing — the unlock counter,
    // and what the panel shows as progress while still locked.
    wasteBuildingCount() {
      let n = 0;
      for (const t of WASTE_SOURCES) n += EntityRegistry.getByType(t).size;
      return n;
    },
    requiredBuildings() { return REQUIRED_WASTE_BUILDINGS; },
    // Human-readable reason the feature isn't available yet, or null.
    lockReason() {
      if (this.isUnlocked()) return null;
      if (!Progression.isUnlocked(T.RESEARCH3)) return 'Requires Research MK3';
      const n = this.wasteBuildingCount();
      if (n < REQUIRED_WASTE_BUILDINGS) return `${n} / ${REQUIRED_WASTE_BUILDINGS} waste-producing buildings`;
      // Conditions met — Progression has queued it and is waiting on the
      // player, so point them at the button that finishes the job.
      return 'Ready: confirm it at a Research Station';
    },

    enable(trk, jobId) {
      if (!this.isUnlocked()) return false;
      trk._autoHaulJob     = _job(jobId || trk._autoHaulJob).id;
      trk._autoHaulEnabled = true;
      trk._autoHaulBlacklist = {};
      trk._autoHaulAttempts  = {};
      trk._autoHaulSnapshot  = null;
      trk._autoHaulClaim     = null;
      trk._autoHaulNextPlan  = 0;
      trk._autoHaulLastNag   = -1e9;
      trk._autoHaulStatus    = 'Planning…';
      // The auto planner overwrites the queue every leg, so a hand-built
      // one would only flicker past. Clear it so the panel doesn't show a
      // list that isn't being used.
      trk._destQueue   = [];
      trk._autoDispatch = false;
      // A truck mid-patrol on a hand-drawn path would otherwise keep driving
      // it until the first planning pass lands. Park it now; the planner
      // issues its own path on the very next tick.
      TruckSystem.stopPatrol(trk);
      return true;
    },

    disable(trk) {
      trk._autoHaulEnabled = false;
      trk._autoHaulStatus  = null;
      trk._autoHaulClaim   = null;
      trk._autoHaulSnapshot = null;
      // Stop where it is rather than finishing a leg the player just
      // cancelled — but leave cargo/fuel alone, and leave the truck
      // drivable straight away.
      trk._autoDispatch = false;
      trk._destQueue = [];
      TruckSystem.stopPatrol(trk);
    },

    isEnabled(trk) { return !!trk._autoHaulEnabled; },
    jobOf(trk)     { return _job(trk._autoHaulJob).id; },
    setJob(trk, jobId) {
      trk._autoHaulJob = _job(jobId).id;
      trk._autoHaulBlacklist = {};
      trk._autoHaulAttempts  = {};
      // Re-plan on the next tick so a job change takes effect immediately
      // rather than after the current leg.
      if (trk._autoHaulEnabled) {
        trk._autoDispatch = false;
        trk._destQueue = [];
        trk._autoHaulSnapshot = null;
        trk._autoHaulClaim = null;
        trk._autoHaulNextPlan = 0;
        trk._autoHaulStatus = 'Planning…';
        TruckSystem.stopPatrol(trk);
      }
    },
    statusOf(trk) { return trk._autoHaulStatus || 'Standing by'; },

    // Called once per logic tick.
    // A Hauler runs itself from the moment it is placed; this is its on/off
    // switch (the panel's button). It needs no Auto-Dispatch research.
    isHauling(trk) { return !!trk._hauler && trk._haulerOn !== false; },
    setHauling(trk, on) {
      trk._haulerOn = !!on;
      if (!on) { this.disable(trk); trk._haulerLeg = null; }
    },

    tick() {
      const unlocked = this.isUnlocked();
      const now = _now();
      for (const trk of EntityRegistry.getByType(T.TRUCK)) {
        if (trk._hauler) {
          delete trk._autoHaulPendingEnable;
          if (trk._haulerOn === false) continue;
          if (!trk._autoHaulEnabled) {
            trk._autoHaulEnabled   = true;
            trk._autoHaulBlacklist = {}; trk._autoHaulAttempts = {};
            trk._autoHaulSnapshot  = null; trk._autoHaulClaim = null;
            trk._autoHaulNextPlan  = 0; trk._autoHaulLastNag = -1e9;
            trk._autoHaulStatus    = 'Planning…';
          }
          _tickTruck(trk, now);
          continue;
        }
        if (!unlocked) continue;
        // A truck restored from a save that had automation running (see
        // save.js) — re-enter it through enable() so the unsaved planner
        // scratch is rebuilt from scratch.
        if (trk._autoHaulPendingEnable) {
          delete trk._autoHaulPendingEnable;
          this.enable(trk, trk._autoHaulJob);
        }
        if (!trk._autoHaulEnabled) continue;
        _tickTruck(trk, now);
      }
    },
  };
})();
