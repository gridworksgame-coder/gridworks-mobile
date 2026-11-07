/* ═══════════════════════════════════════════════════════════════════
   WASTE & COOLING SYSTEMS
   Waste facility processing and nuclear cooling tower logic.
   ═══════════════════════════════════════════════════════════════════ */

// ─── Shared source→facility config (used by WasteSystem and HaulSystem) ────
const WASTE_SOURCES = [T.COALGENERATOR, T.REFINERY, T.NUCLEARREACTOR, T.ADVREACTOR, T.REPROCESSOR, T.LEACHPLANT];

// How fast every waste stream fills, as a multiplier on the baseline rates.
// Each source fills 0→100 over a fixed number of in-game days — coal 7 at
// full ash mode, nuclear 6 at full power, oil ~8.6 — and this scales all
// three together. One knob rather than three magic numbers in three files,
// which is how they would otherwise drift apart.
const WASTE_RATE_MULT = 1.25;
// `cap` is what a full buffer reads — coal and oil write their fields as
// 0-100 fill percentages, and the reactor's spent fuel store is sized to 100
// units so one full reactor is exactly one truckload. Stated here rather than
// assumed at each call site, because the reactor's figure now comes from its
// def and can move without the haul maths silently going wrong.
const WASTE_CFG = {
  [T.COALGENERATOR]:  { facilityType: T.COALWASTE,    field: '_ashWaste',        label: 'Coal Waste Processing Facility',    cap: () => 100 },
  [T.REFINERY]:       { facilityType: T.OILWASTE,     field: '_sludgeWaste',     label: 'Oil Waste Processing Facility',     cap: () => 100 },
  [T.NUCLEARREACTOR]: { facilityType: T.NUCLEARWASTE, field: '_spentFuel',       label: 'Nuclear Waste Processing Facility', cap: () => EntityDefs[T.NUCLEARREACTOR].spentFuelCapacity || 100 },
  [T.ADVREACTOR]:     { facilityType: T.NUCLEARWASTE, field: '_spentFuel',       label: 'Nuclear Waste Processing Facility', cap: () => EntityDefs[T.ADVREACTOR].spentFuelCapacity || 100 },
  // The Reprocessing Plant's high-level waste goes to the SAME facility the
  // reactors use. That is the point of the MK4 tier: reprocessing does not
  // delete the waste problem, it concentrates it into a smaller, hotter
  // stream feeding the same trucks and the same building. Registering it
  // here is also what gives it the removal block — a plant sitting on HLW
  // can't be demolished to make that waste disappear.
  [T.REPROCESSOR]:    { facilityType: T.NUCLEARWASTE, field: '_hlw',             label: 'Nuclear Waste Processing Facility', cap: () => EntityDefs[T.REPROCESSOR].hlwCapacity || 100 },
  // The Leach Plant's thorium tailings (rare_earth_systems.js): mildly
  // radioactive, so they go where the reactors' waste goes, and register
  // here for the same reasons the HLW does — hauling and the removal block.
  // Its store is 100 units, so the units read as the 0-100 fill directly.
  [T.LEACHPLANT]:     { facilityType: T.NUCLEARWASTE, field: '_tailings',        label: 'Nuclear Waste Processing Facility', cap: () => EntityDefs[T.LEACHPLANT].tailingsCapacity || 100 },
};

// A reactor whose SPENT FUEL OUT belt reaches a Spent Fuel Pool is off-limits
// to trucks and drones. Its spent fuel is feedstock bound for reprocessing
// now, and hauling it to the waste facility would throw that away. The flag
// is re-stamped every tick by SpentFuelPoolSystem, so pulling up the belt
// hands the reactor straight back to the haulers.
function haulBlocked(src) {
  return !!(src && src._feedsPool);
}

// A waste source holding more than this share of its buffer has to be hauled
// down before it can be demolished — otherwise removing it would simply make
// the waste disappear, which is the one thing the haul chain exists to stop.
const WASTE_REMOVE_BLOCK_PCT = 25;

// A loaded truck is the same loophole on wheels: scrapping it would delete
// whatever it is carrying instead of that waste reaching a facility. Trucks
// get no tolerance band (unlike a source's 25%) because there's nothing to
// tolerate — a truck can always drive to a facility and unload, and cargo
// already settles to exactly 0 when it does (see HaulSystem).
const TRUCK_CARGO_EPSILON = 0.05;

// The removal-blocking waste level for `e` as a 0–100 percentage, or null if
// it can be removed. Every removal path — the Delete tool, drag-delete, and
// undo/redo of a placement — funnels through here, so this is the one place
// the rule has to be stated.
// Storage vessels (Storage Container, Liquid Storage Tank, Gas Holder) can
// only be removed at or below this fill: stock cannot simply vanish with the
// building, but the last fifth is let go so a bin does not have to be run
// bone dry first. Draw it down through the OUT stub (a tank also has a Drain
// button in its panel).
const CONTAINER_REMOVE_BLOCK_PCT = 20;
// What one of them is holding, as { amount, cap, label }, or null for
// anything that is not a storage vessel.
function containerContents(e) {
  if (!e) return null;
  if (e.type === T.OILSTORAGE) {
    const cap = (typeof OilSystem !== 'undefined' && OilSystem.getTankCapacity) ? OilSystem.getTankCapacity() : 500;
    const name = (typeof LIQUID_PALETTES !== 'undefined' && LIQUID_PALETTES[e._liquidType]?.name?.toLowerCase()) || 'liquid';
    return { amount: e._crude || 0, cap, label: name };
  }
  if (e.type === T.SOLIDSTORAGE) {
    const S = typeof SolidStorageSystem !== 'undefined' ? SolidStorageSystem : null;
    return { amount: e._stored || 0, cap: (S && S.CAPACITY) || 1000, label: ((S && S.label(e._solidType)) || 'ore').toLowerCase() };
  }
  if (e.type === T.GASSTORAGE) {
    const G = typeof GasStorageSystem !== 'undefined' ? GasStorageSystem : null;
    return { amount: G ? G.stored(e) : 0, cap: (G && G.capacity()) || 5000, label: ((G && G.label(e._gasType)) || 'gas').toLowerCase() };
  }
  return null;
}
// A Spent Fuel Pool still has to be emptied outright; a hair of rounding is ignored.
const TANK_EMPTY_EPSILON = 0.5;

// An overheating Nuclear Reactor can't be demolished (or moved) to dodge its
// detonation: core heat still rising, or pinned critical. It has to be
// cooled or starved of fuel rods until the heat is falling first. Returns the core heat
// %, or null once it's safe.
function reactorOverheating(e) {
  if (!e || (e.type !== T.NUCLEARREACTOR && e.type !== T.ADVREACTOR)) return null;
  const h = e._coreHeat || 0;
  if (h <= 0) return null;
  if ((e._heatRate || 0) > 0 || h >= 1) return Math.max(1, Math.round(h * 100));
  return null;
}

// A reactor that is running can't be picked up and moved: a fission core
// burning its rods, or a fusion reactor that is ignited or making power.
// Shut it down first (cut its fuel), then move it. Returns the label for the
// toast, or null when it is free to move.
function reactorWorking(e) {
  if (!e) return null;
  if (e.type === T.NUCLEARREACTOR || e.type === T.ADVREACTOR)
    return e._generating ? 'fission is running' : null;
  if (e.type === T.HULKINGFUSIONREACTOR || e.type === T.ADVFUSIONREACTOR)
    return (e._started || e._generating) ? 'the plasma is lit' : null;
  return null;
}

function wasteBlocksRemoval(e) {
  if (!e) return null;
  const _hot = reactorOverheating(e);
  if (_hot !== null) return _hot;
  const held = containerContents(e);
  if (held) {
    const pct = held.cap > 0 ? Math.min(100, (held.amount / held.cap) * 100) : 0;
    return pct > CONTAINER_REMOVE_BLOCK_PCT ? pct : null;
  }
  // A Spent Fuel Pool is the one building allowed to bank spent fuel, which
  // makes demolishing a full one the same loophole as scrapping a loaded
  // truck: several hundred units of waste would simply cease to exist. It
  // has to be belted down to a Reprocessing Plant first. Same rule as the
  // Liquid Storage Tank above — empty it, then remove it — rather than the
  // 25% tolerance a truck-hauled source gets, because there is no truck
  // that can come and take it away.
  if (e.type === T.SPENTFUELPOOL) {
    const held = (typeof SpentFuelPoolSystem !== 'undefined') ? SpentFuelPoolSystem.total(e) : 0;
    if (held <= TANK_EMPTY_EPSILON) return null;
    const cap = EntityDefs[T.SPENTFUELPOOL]?.spentFuelCapacity || 400;
    return Math.max(0.1, Math.min(100, (held / cap) * 100));
  }
  if (e.type === T.TRUCK) {
    // Field Cores aboard count as a full load: scrapping it would delete them.
    if (Array.isArray(e._coreCargo) && e._coreCargo.length) return 100;
    const amt = e._cargoAmount || 0;
    if (amt <= TRUCK_CARGO_EPSILON) return null;
    const cap = truckSpec(e).cargoCapacity || 100;
    return Math.max(0, Math.min(100, (amt / cap) * 100));
  }
  const cfg = WASTE_CFG[e.type];
  if (!cfg) return null;
  const pct = e[cfg.field] || 0;
  return pct > WASTE_REMOVE_BLOCK_PCT ? pct : null;
}

function wasteRemovalBlockedToast(e, pct) {
  if (reactorOverheating(e) !== null) {
    showToast(`☢ This reactor is OVERHEATING (core ${Math.floor(pct)}%); it can't be removed. Cool it, or cut its fuel rods, until the heat is falling.`,
              '#ff6040', '#140800', '#602010');
    return;
  }
  const _held = containerContents(e);
  if (_held) {
    const label = e.def?.label || EntityDefs[e.type]?.label || 'Container';
    const how = e.type === T.OILSTORAGE ? ' (use it up, or Drain it from its panel)' : ' (draw it down through its OUT side)';
    showToast(`⚠ ${label} is ${Math.floor(pct)}% full of ${_held.label}; get it to ${CONTAINER_REMOVE_BLOCK_PCT}% or less before removing${how}`,
              '#ff6040', '#140800', '#602010');
    return;
  }
  if (e && e.type === T.SPENTFUELPOOL) {
    const held = (typeof SpentFuelPoolSystem !== 'undefined') ? SpentFuelPoolSystem.total(e) : 0;
    showToast(`☢ This pool still holds ${Math.ceil(held)} units of spent fuel; belt it out to a Reprocessing Plant before removing it`,
              '#ff6040', '#140800', '#602010');
    return;
  }
  if (e && e.type === T.TRUCK) {
    // "Haul it below 25%" is meaningless advice for a truck — tell the player
    // what it's carrying and where that has to go instead.
    const name  = (typeof TruckSystem !== 'undefined' && TruckSystem.displayName)
      ? TruckSystem.displayName(e) : 'Waste Truck';
    const cargo = Array.isArray(e._coreCargo) && e._coreCargo.length ? `${e._coreCargo.length} Field Core${e._coreCargo.length > 1 ? 's' : ''}` : (e._cargoLabel || 'waste');
    showToast(e._hauler ? `⚠ ${name} is still carrying ${cargo}; let it deliver to a vessel asking for it before scrapping it`
                        : `⚠ ${name} is still carrying ${cargo}; unload it at a waste facility before scrapping it`,
              '#ff6040', '#140800', '#602010');
    return;
  }
  const label = e.def?.label || EntityDefs[e.type]?.label || 'Building';
  showToast(`⚠ ${label} is ${Math.floor(pct)}% full of waste; haul it below ${WASTE_REMOVE_BLOCK_PCT}% before removing`,
            '#ff6040', '#140800', '#602010');
}

const WasteSystem = (() => {
  // Per-source flag: has this waste stream ever backed up far enough to
  // matter? Once true the matching processing facility is available to build
  // (Progression reads these for its unlock checks) and stays available for
  // the rest of the run. Persisted in the save under `progression.wasteSpawned`
  // — the old key name, from when tripping this threshold auto-dropped a
  // finished facility somewhere on the map instead of handing the player the
  // build tool.
  const _triggered = {
    [T.COALGENERATOR]:  false,
    [T.REFINERY]:       false,
    [T.NUCLEARREACTOR]: false,
    [T.ADVREACTOR]:     false,
  };
  const THRESHOLD = 60;
  // The flag belongs to the FACILITY, not the source: the reactor, the
  // Advanced Reactor and the Reprocessing Plant all feed the one Nuclear
  // Waste facility. Kept per source, only the reactor's was saved, so an
  // Advanced Reactor over 60% re-announced the facility on every load.
  function _markFacility(facilityType) {
    for (const t in WASTE_CFG) if (WASTE_CFG[t].facilityType === facilityType) _triggered[t] = true;
  }
  return {
    // Called once per logic tick for every live waste source.
    checkAvailability(sourceType, src) {
      if (_triggered[sourceType]) return;
      const cfg = WASTE_CFG[sourceType];
      if ((src[cfg.field] || 0) < THRESHOLD) return;
      _markFacility(cfg.facilityType);
      if (typeof Progression !== 'undefined' && Progression.isUnlocked(cfg.facilityType)) return;
      showToast(`⚠ ${cfg.label} available to build!`, '#e0a020', '#1a1000', '#604000');
    },
    setTriggered(sourceType, val) {
      if (val && WASTE_CFG[sourceType]) _markFacility(WASTE_CFG[sourceType].facilityType);
      else _triggered[sourceType] = !!val;
    },
    isTriggered(sourceType)       { return !!_triggered[sourceType]; },
    reset() {
      _triggered[T.COALGENERATOR]  = false;
      _triggered[T.REFINERY]       = false;
      _triggered[T.NUCLEARREACTOR] = false;
      _triggered[T.ADVREACTOR]     = false;
      _triggered[T.REPROCESSOR]    = false;
      _triggered[T.LEACHPLANT]     = false;
    },
  };
})();

// ─── Haul System ────────────────────────────────────────────────────
// Trucks pick up waste from source buildings (coal generator, refinery,
// nuclear reactor) and deliver it to the matching waste facility. Pickup/
// dropoff is proximity-based against the freeform player-drawn truck
// path — no fixed dock tile required, just needs to pass near the building.
const HaulSystem = (() => {
  const PICKUP_BUFFER = TILE * 2;   // 2-tile radius from the building's sprite edge
  // A Hauler at the stop its planner (or its Send To list) sent it to gets
  // more reach. A 3-tile truck that pulls up alongside or at an angle often
  // ends just over 2 tiles from the edge, and then neither loads nor
  // unloads; re-routing to another side tended to land it at the same gap.
  // The tight 2-tile rule is there so a Hauler doesn't help itself at
  // whatever it happens to park beside — which can't happen here, since
  // Haulers only ever act on the stop they were sent to.
  const HAULER_DOCK = TILE * 3;
  const HAUL_SECONDS  = 8;          // time to fully load or fully unload a truck
  // Minimum waste available before a truck will (re-)latch onto a source.
  // A running generator keeps trickling out a little more ash every tick,
  // so an "avail > 0" check let a truck that just finished draining a
  // source (down to ~0) immediately re-target the SAME source the very
  // next tick once it had ticked back up to some tiny fraction of a unit —
  // looping loading→done→loading forever and never actually leaving,
  // since truck_dispatch's queue-advance holds off while _haulState is set.
  const MIN_PICKUP = 1;

  const _truckCenter = trk => {
    TruckSystem.initWorldPos(trk);
    return { x: trk._wx + TILE / 2, y: trk._wy + TILE * 1.5 };
  };
  // Distance from a point to the NEAREST point on a building's footprint
  // rectangle (0 if the point is already inside it). This replaces the old
  // center + max(width,height)/2 "circle" check, which under-measured the
  // buffer near corners for anything wider/taller than 1 tile: a
  // rectangle's corner sits farther from its center than half its longest
  // side, so a circle sized off that side reached the full 2-tile buffer
  // along the flat edges but fell short near the corners. That's why
  // pickup near a multi-tile building like the Refinery only "barely"
  // worked — it depended on which side/angle the truck approached from.
  // True edge distance makes the 2-tile buffer consistent all the way
  // around the footprint.
  const _edgeDist = (pt, ent) => {
    const left   = ent.col * TILE;
    const top    = ent.row * TILE;
    const right  = left + (ent.width  || 1) * TILE;
    const bottom = top  + (ent.height || 1) * TILE;
    const nx = Math.max(left, Math.min(pt.x, right));
    const ny = Math.max(top,  Math.min(pt.y, bottom));
    return Math.hypot(pt.x - nx, pt.y - ny);
  };
  const _stillAt = ent => ent && GridManager.getEntity(ent.col, ent.row) === ent;
  // Truck-to-building distance measured from the truck's whole 3-tile body,
  // not just its centre. With a centre-only check a truck parked nose-in
  // beside a facility (cab well inside the buffer, centre a fraction of a
  // tile outside it) looked docked but never loaded or unloaded. Samples
  // points along the body's long axis, rotated to the truck's heading the
  // same way the sprite is drawn (local +y → (−sin a, cos a)).
  const _truckDist = (trk, ent) => {
    const c = _truckCenter(trk);
    const a = trk._angle || 0;
    const ax = -Math.sin(a), ay = Math.cos(a);
    let best = Infinity;
    for (const d of [-1.25, -0.6, 0, 0.6, 1.25]) {
      const dist = _edgeDist({ x: c.x + ax * d * TILE, y: c.y + ay * d * TILE }, ent);
      if (dist < best) best = dist;
    }
    return best;
  };

  // ── Hauler ──────────────────────────────────────────────────────
  // The cargo truck's side of the same dock: it loads a resource from a
  // producer or an unflagged vessel and unloads it into a vessel flagged for
  // Truck Supply, at the same rate and inside the same 2-tile buffer a waste
  // run uses. It only ever acts on the stop its planner sent it to
  // (trk._haulerLeg, set by AutoHaulSystem), so a Hauler parked beside a
  // mine by chance does not start helping itself. What can be carried, who
  // makes it and how much of it is surplus all come from the drone fleet's
  // cargo tables (DroneSystem.cargo), so the two fleets follow one set of
  // rules.
  // A parked Hauler on a hand-built queue (the panel's Send To list) has no
  // planner to hand it a leg, so the stop it was sent to decides: with cargo
  // aboard it unloads into a vessel that will take it, otherwise it loads
  // what the stop makes or holds. One go per visit (_haulerStopDone), or a
  // producer trickling out another unit would re-latch it there forever.
  // Consumers a Hauler unloads straight into, with no vessel in between:
  // the Fuel Processing Plant takes acid and uranium off a truck.
  const _direct = (ent, kind) => !!ent && ent.type === T.FUELPLANT && (kind === 'acid' || kind === 'uranium')
                                 && typeof FuelPlantSystem !== 'undefined';
  const _directRoom = (ent, kind) => _direct(ent, kind) ? FuelPlantSystem.truckRoom(ent, kind) : 0;

  function tickManualStop(trk, C) {
    const desc = trk._autoDispatch && !trk._detourDesc && trk._destQueue && trk._destQueue[trk._queueIdx];
    const ent  = desc && desc.kind === 'source' ? GridManager.getEntity(desc.col, desc.row) : null;
    if (!ent || ent.type !== desc.sourceType || _truckDist(trk, ent) > HAULER_DOCK) { trk._haulerStopDone = null; return; }
    const key = `${trk._queueIdx}:${desc.col},${desc.row}`;
    if (trk._haulerStopDone === key) return;
    const kinds = C.kinds(), aboard = trk._cargoAmount > 0.01 ? trk._cargoKind : null;
    const byRoad = (k) => !!kinds[k];
    // Room for what is aboard; an empty truck has room for anything.
    const cap = aboard ? truckCargoCap(trk, aboard) : Math.max(truckCargoCap(trk), truckSpec(trk).cargoCapacityGas || 0);
    let leg = null;
    if (aboard && _direct(ent, aboard)) {
      if (_directRoom(ent, aboard) >= 1) leg = { mode: 'unload', kind: aboard, ent };
    } else if (C.isVessel(ent) && aboard) {
      // A flagged vessel only takes what it asked for.
      const ok = byRoad(aboard) && (!ent._truckSupply || ent._truckSupply === aboard)
              && C.vessels[kinds[aboard].phase].type() === ent.type
              && C.vessels[kinds[aboard].phase].room(ent, aboard, trk._cargoMeta || null) >= 1;
      if (ok) leg = { mode: 'unload', kind: aboard, ent };
    } else if (!ent._lightningDamaged && cap - trk._cargoAmount > 0.5) {
      let best = null, bestAmt = 1;
      if (C.isVessel(ent)) {
        // Flagged vessels are deliveries, never sources (see cargoSources).
        const V = Object.values(C.vessels).find(v => v.type() === ent.type);
        const held = !ent._truckSupply && !ent._droneSupply ? V.held(ent) : null;
        if (held && byRoad(held)) best = held;
      } else {
        for (const k in kinds) {
          if (!byRoad(k) || !kinds[k].types.includes(ent.type) || (aboard && aboard !== k)) continue;
          const a = C.avail(k, ent);
          if (a >= bestAmt) { bestAmt = a; best = k; }
        }
      }
      if (best && (!aboard || aboard === best) && C.avail(best, ent) >= 1 && truckCargoCap(trk, best) - trk._cargoAmount > 0.5) leg = { mode: 'load', kind: best, ent };
    }
    trk._haulerStopDone = key;
    if (!leg) return;
    trk._haulerLeg = leg;
    trk._haulState = leg.mode === 'load' ? 'loading' : 'unloading';
    trk._haulTarget = ent;
  }

  function tickHauler(trk, dt) {
    const C = typeof DroneSystem !== 'undefined' ? DroneSystem.cargo : null;
    if (!C) return;
    const leg = trk._haulerLeg;
    // One load of whatever is moving: the tube trailer's 750 for a gas.
    const cap = truckCargoCap(trk, (leg && leg.kind) || trk._cargoKind), rate = cap / HAUL_SECONDS;
    const done = () => { trk._haulState = null; trk._haulTarget = null; };
    const emptied = () => { trk._cargoAmount = 0; trk._cargoKind = null; trk._cargoMeta = null; trk._cargoLabel = null; };
    // Fuel for a stranded truck can also be pumped at a gas station (see
    // AutoHaulSystem's _planRescue), bought at the pump price.
    const station = (s) => s && s.type === T.GASSTATION;
    const availAt = (kind, s) => station(s) ? ((s.powered || s._fuelDepot) ? (s._fuelStored || 0) : 0) : C.avail(kind, s);

    if (trk._haulState === 'loading') {
      const src = trk._haulTarget, kind = leg && leg.kind;
      if (!kind || !_stillAt(src) || src._lightningDamaged || _truckDist(trk, src) > HAULER_DOCK) { done(); return; }
      if (station(src) && kind !== 'fuel') { done(); return; }
      if (trk._cargoAmount > 0.01 && trk._cargoKind && trk._cargoKind !== kind) { done(); return; }   // one kind per trip
      // ...and one pellet fuel: D-T and D-He3 pellets share a kind but must not mix.
      const srcMeta = C.pelletMeta(kind, src);
      if (trk._cargoAmount > 0.01 && srcMeta && trk._cargoMeta && srcMeta !== trk._cargoMeta) { done(); return; }
      // No more than the vessels asking for it can take. (It used to fill
      // the trailer regardless, so a 750 load went to a holder with room for
      // a few dozen and the rest rode about with nowhere to go.)
      // A run for a stranded truck takes what that truck's tank wants.
      let wanted = leg.rescue ? (leg.want || 0) : 0;
      if (!leg.rescue) {
        const K = C.kinds()[kind], V = K && C.vessels[K.phase];
        if (V) for (const v of EntityRegistry.getByType(V.type()))
          if (v._truckSupply === kind) wanted += Math.max(0, V.room(v, kind, srcMeta || null));
        // A hand-built route's own drop-offs that take it straight off the truck.
        if (!trk._autoHaulEnabled) for (const d of trk._destQueue || []) {
          const c = d && d.kind === 'source' ? GridManager.getEntity(d.col, d.row) : null;
          if (c && c.type === d.sourceType) wanted += _directRoom(c, kind);
        }
      }
      const avail = availAt(kind, src), room = Math.min(cap, wanted) - trk._cargoAmount;
      let amt = Math.max(0, Math.min(rate * dt, avail, room));
      if (amt > 0 && station(src)) {
        const cost = amt * GasStationSystem.getRefuelCost() / (EntityDefs[T.TRUCK].fuelCapacity || 100);
        if (!Economy.canAfford(cost)) { showToast('⛽ Not enough funds to buy fuel', '#ff6040', '#180800', '#602010'); done(); trk._haulerLeg = null; return; }
        Economy.spend(cost);
        src._fuelStored = avail - amt;
      }
      if (amt > 0) {
        if (!station(src)) C.take(kind, src, amt);
        trk._cargoAmount += amt;
        trk._cargoKind  = kind;
        trk._cargoMeta  = C.pelletMeta(kind, src) || trk._cargoMeta || null;
        trk._cargoLabel = (C.kinds()[kind] || {}).label || kind;
      }
      if (room - amt <= 0.01 || avail - amt <= 0.01) { done(); trk._haulerLeg = null; }
      return;
    }

    if (trk._haulState === 'unloading') {
      const dst = trk._haulTarget, kind = trk._cargoKind;
      const K = kind && C.kinds()[kind], V = K && C.vessels[K.phase];
      const direct = _direct(dst, kind);
      if ((!V && !direct) || !_stillAt(dst) || _truckDist(trk, dst) > HAULER_DOCK) { done(); return; }
      const room = direct ? _directRoom(dst, kind) : V.room(dst, kind, trk._cargoMeta || null);
      const amt  = Math.max(0, Math.min(rate * dt, trk._cargoAmount, room));
      const took = amt <= 0 ? 0 : direct ? FuelPlantSystem.truckPut(dst, kind, amt) : (V.put(dst, kind, amt, trk._cargoMeta || null) || 0);
      trk._cargoAmount -= took;
      if (trk._cargoAmount <= 0.01 || room - took <= 0.01 || took <= 0) {
        done(); trk._haulerLeg = null;
        if (trk._cargoAmount <= 0.01) emptied();
      }
      return;
    }

    // Pumping fuel into a stranded truck's tank, where it stands.
    if (trk._haulState === 'fuelling') {
      const t = trk._haulTarget;
      if (!t || !EntityRegistry.getByType(T.TRUCK).has(t) || trk._cargoKind !== 'fuel' || _truckDist(trk, truckFootprint(t)) > HAULER_DOCK) { done(); return; }
      t._fuelledBy = trk;   // holds it still till the pumping is done (truck.js)
      const room = (truckSpec(t).fuelCapacity || 100) - (t._fuel || 0);
      const amt  = Math.max(0, Math.min(rate * dt, trk._cargoAmount, room));
      t._fuel = (t._fuel || 0) + amt;
      trk._cargoAmount -= amt;
      if (trk._cargoAmount <= 0.01 || room - amt <= 0.01) {
        done(); trk._haulerLeg = null;
        if (trk._cargoAmount <= 0.01) emptied();
      }
      return;
    }

    if (!trk._autoHaulEnabled) { trk._haulerLeg = null; tickManualStop(trk, C); return; }
    if (leg && leg.mode === 'rescue') {
      const t = leg.rescue;
      if (!t || !EntityRegistry.getByType(T.TRUCK).has(t) || trk._cargoKind !== 'fuel' || trk._cargoAmount <= 0.01) { trk._haulerLeg = null; return; }
      if (_truckDist(trk, truckFootprint(t)) > HAULER_DOCK) return;
      if ((truckSpec(t).fuelCapacity || 100) - (t._fuel || 0) <= 0.5) { trk._haulerLeg = null; return; }   // someone else filled it
      trk._haulState = 'fuelling'; trk._haulTarget = t; t._fuelledBy = trk;
      return;
    }
    if (!leg || !leg.ent || !_stillAt(leg.ent) || _truckDist(trk, leg.ent) > HAULER_DOCK) return;
    // A Field Core run: the whole swap happens on arrival (FieldCoreSystem).
    if (leg.mode === 'core') {
      if (typeof FieldCoreSystem !== 'undefined') FieldCoreSystem.truckDock(trk, leg.ent);
      trk._haulerLeg = null;
      return;
    }
    if (leg.mode === 'load') {
      if (cap - trk._cargoAmount > 0.5 && availAt(leg.kind, leg.ent) >= 1) { trk._haulState = 'loading'; trk._haulTarget = leg.ent; }
    } else if (trk._cargoAmount > 0.01) {
      trk._haulState = 'unloading'; trk._haulTarget = leg.ent;
    }
  }

  return {
    // Called once per logic tick for every truck — works whether it's being
    // driven manually or running an autonomous patrol. Loading/unloading takes
    // HAUL_SECONDS to complete, with cargo building up/draining live each tick.
    tickTruck(trk, dt) {
      if (trk._cargoAmount === undefined) trk._cargoAmount = 0;
      if (trk._hauler) { tickHauler(trk, dt); return; }
      const cap  = EntityDefs[T.TRUCK].cargoCapacity || 100;
      const rate = cap / HAUL_SECONDS;   // units/sec

      // ── Currently loading ──
      if (trk._haulState === 'loading') {
        const src = trk._haulTarget, cfg = trk._haulCfg;
        if (!_stillAt(src) || _truckDist(trk, src) > PICKUP_BUFFER || haulBlocked(src)) {
          trk._haulState = null; trk._haulTarget = null; trk._haulCfg = null;
          return;
        }
        const avail = src[cfg.field] || 0;
        const room  = cap - trk._cargoAmount;
        const amt   = Math.max(0, Math.min(rate * dt, avail, room));
        src[cfg.field]    -= amt;
        trk._cargoAmount  += amt;
        trk._cargoFacility = cfg.facilityType;
        trk._cargoLabel    = cfg.label.replace(' Processing Facility', '');
        if (room - amt <= 0.01 || avail - amt <= 0.01) {
          trk._haulState = null; trk._haulTarget = null; trk._haulCfg = null;
        }
        return;
      }

      // ── Currently unloading ──
      if (trk._haulState === 'unloading') {
        const fac = trk._haulTarget;
        // Dropping cargo into storage doesn't require the facility to be
        // powered — power only gates tickFacility() actually processing
        // what's stored (see below). A facility is frequently built before
        // there's a wire anywhere near it, so requiring `fac.powered` here
        // made a truck arrive, sit through
        // its arrival grace window without ever unloading, and immediately
        // get sent to the next destination with a still-full tank.
        if (!_stillAt(fac) || _truckDist(trk, fac) > PICKUP_BUFFER) {
          trk._haulState = null; trk._haulTarget = null;
          return;
        }
        const def  = EntityDefs[fac.type];
        const room = (def.storageCapacity || 300) - (fac._wasteStored || 0);
        const amt  = Math.max(0, Math.min(rate * dt, trk._cargoAmount, room));
        fac._wasteStored   = (fac._wasteStored || 0) + amt;
        trk._cargoAmount  -= amt;        if (trk._cargoAmount <= 0.01 || room - amt <= 0.01) {
          trk._haulState = null; trk._haulTarget = null;
          if (trk._cargoAmount <= 0.01) { trk._cargoAmount = 0; trk._cargoFacility = null; trk._cargoLabel = null; }
        }
        return;
      }

      // ── Idle — look for something to start ──
      if (trk._cargoAmount <= 0) {
        for (const srcType of WASTE_SOURCES) {
          const cfg = WASTE_CFG[srcType];
          for (const src of EntityRegistry.getByType(srcType)) {
            const avail = src[cfg.field] || 0;
            if (avail < MIN_PICKUP) continue;
            if (haulBlocked(src)) continue;
            if (_truckDist(trk, src) > PICKUP_BUFFER) continue;
            trk._haulState  = 'loading';
            trk._haulTarget = src;
            trk._haulCfg    = cfg;
            return;
          }
        }
      } else {
        // Already carrying cargo — top off with more of the SAME waste type
        // before looking to unload, so a truck can fill up to capacity by
        // visiting several source buildings of the same kind (e.g. multiple
        // coal generators) rather than being stuck seeking a facility the
        // moment it picks up any amount at all.
        const room = cap - trk._cargoAmount;
        if (room > 0.01) {
          for (const srcType of WASTE_SOURCES) {
            const cfg = WASTE_CFG[srcType];
            if (cfg.facilityType !== trk._cargoFacility) continue; // only the waste type already on board
            for (const src of EntityRegistry.getByType(srcType)) {
              const avail = src[cfg.field] || 0;
              if (avail < MIN_PICKUP) continue;
              if (haulBlocked(src)) continue;
              if (_truckDist(trk, src) > PICKUP_BUFFER) continue;
              trk._haulState  = 'loading';
              trk._haulTarget = src;
              trk._haulCfg    = cfg;
              return;
            }
          }
        }
        for (const fac of EntityRegistry.getByType(trk._cargoFacility)) {
          // No power requirement — see the matching comment in the
          // "currently unloading" branch above.
          if (_truckDist(trk, fac) > PICKUP_BUFFER) continue;
          trk._haulState  = 'unloading';
          trk._haulTarget = fac;
          return;
        }
      }
    },

    // Called once per logic tick for every waste facility — slowly processes
    // stored waste away while powered.
    tickFacility(fac, dt) {
      if (!fac.powered || !fac._wasteStored) return;
      const rate = EntityDefs[fac.type].processRate || 0;
      fac._wasteStored = Math.max(0, fac._wasteStored - rate * dt);
    },

    // ── Dev/testing helper ──
    // Instantly fills a source building's waste buffer to capacity so pickup
    // can be tested without waiting for it to accumulate naturally.
    // Pass a specific entity (fills just that one) or a source type constant
    // like T.REFINERY (fills every entity of that type).
    devFillWaste(target) {
      // Duck-type instead of assuming T.* constants are numbers: if it's a
      // live entity (has a .type that's a valid waste source), fill just it;
      // otherwise treat it as a type constant and fill every entity of that type.
      const list = (target && typeof target === 'object' && WASTE_CFG[target.type])
        ? [target]
        : EntityRegistry.getByType(target);
      let filled = 0;
      for (const src of list) {
        const cfg = src && WASTE_CFG[src.type];
        if (!cfg) continue;
        src[cfg.field] = cfg.cap();
        filled++;
      }
      showToast(`🧪 Dev: filled waste on ${filled} building(s)`, '#c040ff', '#140020', '#400060');
      return filled;
    },
  };
})();

// ─── Coal Generator Connection Points ─────────────────────────────
// Fixed stub tiles for the Coal Power Generator's three external
// connections, each one tile outside its footprint (scales with e.width/
// e.height) so a conveyor/pipe placed there visually lines up with the
// sprite — same approach as CoolingTowerSystem's hotIn/coldOut stubs above.
//   • Coal IN   — conveyor bringing coal from a mine   (left face, bottom row)
//   • Water IN  — pipe bringing water for steam/cooling (bottom face, middle column)
//   • Waste OUT — conveyor carrying ash to a waste facility (bottom face, rightmost column)
// These positions are a starting guess based on footprint geometry alone —
// nudge the row/col offsets below if they don't land on the right pixels
// once you see it against the actual sprite art.
const CoalGeneratorConnections = (() => {
  function stubs(e) {
    const w = e.width  || EntityDefs[T.COALGENERATOR].width  || 3;
    const h = e.height || EntityDefs[T.COALGENERATOR].height || 4;
    return {
      coalIn:   { c: e.col - 1,                r: e.row + h - 1 }, // left face,  bottom row
      waterIn:  { c: e.col + Math.floor(w / 2), r: e.row + h     }, // bottom face, middle column
      wasteOut: { c: e.col + w,                r: e.row + h - 1 }, // right face, bottom row — exact mirror of Coal IN
    };
  }

  // Called once per tick for every Coal Power Generator — checks each stub
  // tile for the matching pipe/conveyor type and marks a connected flag.
  // Purely a connection-detection pass (mirrors CoolingTowerSystem); it
  // doesn't yet gate power output or fuel burn on any of these — that's a
  // separate decision for CoalSystem.tickGenerator once you're ready.
  function tick(e) {
    const { coalIn, waterIn, wasteOut } = stubs(e);

    const coalTile  = GridManager.inBounds(coalIn.c,   coalIn.r)   ? GridManager.getEntity(coalIn.c,   coalIn.r)   : null;
    const waterTile = GridManager.inBounds(waterIn.c,  waterIn.r)  ? GridManager.getEntity(waterIn.c,  waterIn.r)  : null;
    const wasteTile = GridManager.inBounds(wasteOut.c, wasteOut.r) ? GridManager.getEntity(wasteOut.c, wasteOut.r) : null;

    e._coalInConnected   = !!(coalTile  && coalTile.type === T.CONVEYOR);
    e._waterInConnected  = !!(waterTile && isPipe(waterTile));
    e._wasteOutConnected = !!(wasteTile && wasteTile.type === T.CONVEYOR);

    // Exposed so render code can draw a little port/nub sprite at each stub.
    e._coalInStub   = coalIn;
    e._waterInStub  = waterIn;
    e._wasteOutStub = wasteOut;
  }

  return { stubs, tick };
})();

// ─── Cooling Tower System ─────────────────────────────────────────
const CoolingTowerSystem = (() => {
  // Clear cool-active flags for all pipes — called once per tick, right
  // before the per-tower tick loop below recomputes them. Kept separate
  // from OilSystem.clearOilPipeFlags so cool pipes don't briefly read as
  // "unclaimed" while other fluids' BFS passes are still running this tick.
  function clearCoolPipeFlags() {
    for (const p of allPipes()) { p._coolActive = false; p._cryoCoolActive = false; }
  }

  // Both tower types. Every Cooling Tower is one of these — the MK1 and the
  // Cryogenic tower share this whole system, parameterised by their def.
  const TOWER_TYPES = [T.COOLINGTOWER, T.COOLINGTOWER2];
  const isTower = (e) => !!e && (e.type === T.COOLINGTOWER || e.type === T.COOLINGTOWER2);

  // H₂O IN on the left face (col-1), COLD OUT on the right face (col+w), one
  // row apart. A 9×10 MK1 has them at rows 4/5; a tower built before the
  // resize keeps its saved size and the old rows 3/4, so pipes already laid
  // to it stay connected. The Cryogenic tower centres them on its art layout
  // (layoutHeight, formerly the 19-tall footprint) — rows 8/9 — which is
  // where its sprite puts the chiller houses. That offset stays fixed when
  // the live footprint shrinks, so pipes and ports do not slide up the shell.
  // renderCoolingTower / renderCryoCoolingTower draw the ports from here.
  function getStubs(e) {
    const def = EntityDefs[e.type] || EntityDefs[T.COOLINGTOWER];
    const w = e.width || def.width || 9, h = e.height || def.height || 10;
    const r = e.type === T.COOLINGTOWER2
            ? Math.floor((def.layoutHeight || h) / 2) - 1
            : h <= 8 ? 3 : 4;
    return {
      hotIn:   { c: e.col - 1, r: e.row + r },
      coldOut: { c: e.col + w, r: e.row + r + 1 },
    };
  }

  function _towerName(e) {
    const def = EntityDefs[e.type] || EntityDefs[T.COOLINGTOWER];
    return (def.label || 'Cooling Tower') + (e._num !== undefined ? ` #${e._num}` : '');
  }
  const _tripTag = (e) => `pumptrip-${e.col},${e.row}`;
  const RESERVE_SECONDS = 60;   // how long a full basin keeps a tower running with nothing coming in
  const RESERVE_REFILL  = 20;   // seconds of supply to fill it from empty

  // Why a tower's water stopped, as far as the map can say: the nearest
  // broken wire (the usual cause: a line trips and the Water Extractors past
  // it go dark), else the nearest unpowered extractor. { text, at, wire }.
  function waterCutCause(tower) {
    const cx = tower.col + (tower.width || 1) / 2, cy = tower.row + (tower.height || 1) / 2;
    const nearest = (list) => {
      let best = null, bd = Infinity;
      for (const x of list) {
        const d = Math.hypot(x.col - cx, x.row - cy);
        if (d < bd) { bd = d; best = x; }
      }
      return best;
    };
    const wire = nearest([...EntityRegistry.getByType(T.WIRE)].filter(w => w.failed));
    if (wire) return { text: `A wire is broken at (${wire.col}, ${wire.row}): repair it to get the Water Extractors past it running again.`, at: wire, wire };
    const ex = nearest([...EntityRegistry.getByType(T.WATEREXTRACTOR)].filter(x => !x.powered));
    if (ex) return { text: `The Water Extractor at (${ex.col}, ${ex.row}) has no power.`, at: ex };
    return { text: 'Its water supply ran short.', at: tower };
  }

  // One card for every tower in service that is running on its basin, with
  // the shortest time left, pointing at the cut.
  const _onReserveSet = new Set();
  let _reserveShown = -1;
  function _reserveCard() {
    let ranDry = false;
    for (const t of [..._onReserveSet]) if (!t._onReserve || !EntityRegistry.all().has(t)) {
      _onReserveSet.delete(t);
      if (t._pipeIn && !t._hotConnected) ranDry = true;
    }
    if (!_onReserveSet.size) {
      if (_reserveShown >= 0) {
        // Ran dry: the reactors' own overheating cards (which name the cut
        // too) take over from here.
        NotificationStack.dismissTag('tower-reserve');
        if (!ranDry) showToast('✅ Cooling Tower water is flowing again', '#40c060', '#001408', '#0a4020', 'tower-reserve');
      }
      _reserveShown = -1;
      return;
    }
    let low = null;
    for (const t of _onReserveSet) if (!low || t._waterReserve < low._waterReserve) low = t;
    const secs = Math.ceil(low._waterReserve);
    if (secs === _reserveShown && NotificationStack.hasTag('tower-reserve')) return;
    _reserveShown = secs;
    const cause = waterCutCause(low);
    const n = _onReserveSet.size;
    const msg = `${n === 1 ? _towerName(low) + ' has lost its' : n + ' Cooling Towers have lost their'} water supply and ${n === 1 ? 'is' : 'are'} running on the basin: ${secs}s left before the reactors on ${n === 1 ? 'it' : 'them'} start to heat. ${cause.text}`;
    const card = {
      icon: '💧', title: 'Cooling water cut', message: msg,
      color: '#80d0ff', border: '#2060a0', tag: 'tower-reserve', glow: true, emergency: secs <= 20,
      onClick: () => {
        const c = waterCutCause(low);
        Camera.recentreOn((c.at.col + (c.at.width || 1) / 2) * TILE, (c.at.row + (c.at.height || 1) / 2) * TILE);
        if (c.wire && typeof WireInspector !== 'undefined') WireInspector.open(c.wire);
        else EntityInfoPanel.open(c.at);
      },
    };
    if (!NotificationStack.updateTag('tower-reserve', { message: msg, onClick: card.onClick })) NotificationStack.push(card);
  }
  function _weatherOutage() {
    if (typeof WeatherEventSystem !== 'undefined' && WeatherEventSystem.getActiveEvent()?.type === 'geomag') return true;
    for (const w of EntityRegistry.getByType(T.WIRE)) if (w.failed && w._weatherFailed) return true;
    return false;
  }

  function _tickPumps(e, inService, dt) {
    if (dt <= 0) return;
    const def = EntityDefs[e.type] || EntityDefs[T.COOLINGTOWER];
    const restart = def.pumpRestartSeconds || 45;
    const powered = !!e.powered;
    // A drop from powered to unpowered this tick — _wasPowered is undefined
    // on a tower's first tick (fresh build, or just loaded), so neither of
    // those ever reads as an outage.
    const outage = e._wasPowered === true && !powered;
    e._wasPowered = powered;

    // A cut the weather caused (a storm tripping lines, a geomagnetic storm
    // draining storage) doesn't trip them: they stop while it's dark and run
    // again the moment power is back. Storms cut power over and over, and
    // every cut restarting a 45s clock left reactors no way through one.
    if (outage && !_weatherOutage()) {
      if (e._pumpTripped) {
        e._pumpRestart = restart;           // knocked out again mid-restart
      } else if (Math.random() < (def.pumpTripChance ?? 0.4)) {
        e._pumpTripped = true;
        e._pumpRestart = restart;
        const name = _towerName(e);
        NotificationStack.push({
          icon: '🌀', title: 'Cooling pumps tripped',
          message: `${name} lost power and its pumps tripped. They need ${restart}s of steady power to restart`
                 + (inService ? ': any reactor it cools is OVERHEATING until then. Keep your grid stable, or cut the fuel rods to that reactor.' : '.'),
          color: '#ffb040', border: '#a05010', tag: _tripTag(e), glow: inService,
          onClick: () => {
            Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE);
            EntityInfoPanel.open(e);
          },
        });
      }
    }

    if (e._pumpTripped && powered) {
      e._pumpRestart = (e._pumpRestart ?? restart) - dt;
      if (e._pumpRestart <= 0) {
        e._pumpTripped = false;
        e._pumpRestart = 0;
        NotificationStack.dismissTag(_tripTag(e));
        showToast(`✅ ${_towerName(e)}'s pumps are running again`, '#40c060', '#001408', '#0a4020', 'pumptrip');
      }
    }
  }

  return {
    TOWER_TYPES,
    RESERVE_SECONDS,
    waterCutCause,
    isTower,
    clearCoolPipeFlags,
    getStubs,
    tick(e, dt) {
      // _active = a reactor's COOL IN run reached this tower last tick
      // (NuclearSystem.resolveCooling sets it). Held while paused, since the
      // reactor's tick returns early then and never re-marks it.
      if (dt > 0) {
        if (!e._activeThisTick) e._active = false;
        e._activeThisTick = false;
      }

      const { hotIn, coldOut } = getStubs(e);
      const hotInTile   = GridManager.getEntity(hotIn.c, hotIn.r);
      const coldOutC    = coldOut.c;
      const coldOutR    = coldOut.r;
      const coldOutTile = GridManager.getEntity(coldOutC, coldOutR);

      const hasPipeIn  = !!(hotInTile  && isPipe(hotInTile));
      const hasPipeOut = !!(coldOutTile && isPipe(coldOutTile));

      // Pump trips. A tower that suddenly loses power may trip its pumps
      // (pumpTripChance); tripped, they stay down after power returns until
      // they've run pumpRestartSeconds of powered time, and another outage
      // meanwhile starts the restart over. While tripped the tower delivers
      // no cooled water, so any reactor on it heats (NuclearSystem.resolveCooling).
      _tickPumps(e, hasPipeIn && hasPipeOut, dt);

      // Water in: H₂O IN must sit on a live network with budget to spare.
      // The MK1 draws raw network water (PowerNetwork.updatePipeConnectivity
      // sets _hasWater / _waterShort earlier this tick); the Cryogenic tower
      // instead draws already-cooled water off another tower's COLD OUT
      // (NuclearSystem.resolveCooling sets _hasCoolWater / _coolShort, in the
      // same pass that feeds reactors — it runs right after this tick loop).
      // Not gated on e.powered — that deadlocks, since the tower is powered
      // by the reactor it cools.
      e._pipeIn        = hasPipeIn;
      // Basin reserve: water held in the tower, so a cut upstream (a tripped
      // line taking its Water Extractors down, say) doesn't stop it dead. It
      // runs on the basin for RESERVE_SECONDS and tops back up while water
      // comes in. Keeping the tower going keeps its COLD OUT line full too,
      // so once the supply is back nothing has to refill on the way to the
      // reactor. A tower's first tick starts it full if it has water.
      const supplied = hasPipeIn && !!(e.type === T.COOLINGTOWER2 ? e._hasCoolWater : e._hasWater);
      if (e._waterReserve === undefined) e._waterReserve = supplied ? RESERVE_SECONDS : 0;
      if (dt > 0) {
        e._waterReserve = supplied
          ? Math.min(RESERVE_SECONDS, e._waterReserve + dt * RESERVE_SECONDS / RESERVE_REFILL)
          : Math.max(0, e._waterReserve - dt);
      }
      e._onReserve     = hasPipeIn && !supplied && e._waterReserve > 0;
      e._hotConnected  = supplied || e._onReserve;
      if (dt > 0) {
        if (e._onReserve && e._active) _onReserveSet.add(e);
        if (_onReserveSet.size || _reserveShown >= 0) _reserveCard();
      }
      e._coolConnected = hasPipeOut && !!e.powered && !e._pumpTripped;

      // Water temperature: only while a reactor is actually on the loop —
      // loop water starts at ~310°C and the tower pulls it down to ~35°C.
      // A tower with no water, or no reactor drawing on it, has no reading.
      const HOT_TEMP  = 310;
      const COLD_TEMP = 35;
      if (e._active && e._hotConnected && e._coolConnected) {
        e._waterTempOut = e._waterTempOut ?? HOT_TEMP;
        e._waterTempOut += (COLD_TEMP - e._waterTempOut) * Math.min(1, dt / 4);
      } else {
        e._waterTempOut = null;
      }

      // BFS from COLD OUT stub — MK1 marks cooled water (_coolActive); the
      // Cryogenic tower marks Cryogenic Coolant (_cryoCoolActive). Separate
      // fluids so a cryo run never merges with ordinary cool or feeds itself.
      // Only while water is actually coming IN as well: a tower with nothing
      // at its inlet produces nothing (resolveCooling won't draw on it), and
      // lighting the line anyway showed coolant flowing into a reactor that
      // was overheating for lack of it.
      if (e._coolConnected && e._hotConnected) {
        const isCryo = e.type === T.COOLINGTOWER2;
        const fluid  = isCryo ? 'cryocool' : 'cool';
        const run  = pipeRun(coldOutC, coldOutR, fluid);
        const _out = EntityDefs[e.type]?.coldOutput || 0;
        for (let i = 0; i < run.n; i++) {
          const _coolPipe = run.pipe[i];   // the pipe under a wire/belt, not the wire
          // Flow adds up per tower: several towers on one line put their
          // output on the same pipes, and each used to overwrite the rate
          // with its own output, so a 3-tower line read one tower's worth.
          // The flags are cleared every tick (clearCoolPipeFlags), so the
          // first tower to reach a pipe this tick starts its total.
          const _already = isCryo ? _coolPipe._cryoCoolActive : _coolPipe._coolActive;
          _coolPipe._flowRate = _already ? (_coolPipe._flowRate || 0) + _out : _out;
          if (isCryo) _coolPipe._cryoCoolActive = true;
          else        _coolPipe._coolActive = true;
        }
      }
    },
  };
})();
