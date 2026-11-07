/* ═══════════════════════════════════════════════════════════════════
   FIELD CORE SYSTEMS — the back half of the chain (docs/FIELD_CORE_SPEC.md)
     Rare Earth Oxide (belt) + Hydrogen + Nitrogen (pipes)
       → Superconductor Mill → HTS Tape (belt) → Core Works → Field Cores

   The Superconductor Mill is the Leach Plant's shape with gas inputs in
   place of acid: oxide on a belt, hydrogen and nitrogen by pipe from their
   producers or a Gas Holder (HaberBoschSystem's findGasSource, the same
   rule), tape out on a belt. Hydrogen is the reducing atmosphere the tape
   is grown in, nitrogen the 77 K bath it is tested in.

   The Core Works winds tape into cores and charges them. It has four
   bays; each holds nothing, a core charging, a charged core waiting for
   pickup, or a spent core waiting to be recharged. One charge runs at a
   time: a spent core is recharged first (28 tape, double if it quenched),
   otherwise a new core is wound into an empty bay (120 tape). Charging
   takes 4 in-game hours at 800 kW; the rest of the time the works idles
   at 100 kW (both through _activePowerInput, as the Survey Station does).
   With Off-Peak set it only charges between 22:00 and 06:00, so the
   charging load stays off the evening peak.

   Cores leave and come back by drone and truck in the next step (reactor
   slots and the swap job); until then charged cores wait in their bays.
   ═══════════════════════════════════════════════════════════════════ */

// The first gas source on a pipe run from `stub`: a powered producer reached
// through its own OUT stub, or a Gas Holder banking that gas. Same rule as
// HaberBoschSystem.findGasSource.
function _fcGasSource(stub, fluid, sourceType, field, outStubOf) {
  if (!pipeArrivedAt(stub.c, stub.r, fluid)) return null;   // still on its way down the line
  const run = pipeRun(stub.c, stub.r, fluid);
  for (let j = 0; j < run.pn; j++) {
    const nb = run.pe[j], c = run.ptc[j], r = run.ptr[j];
    if (nb.type === sourceType && atOutPort(outStubOf(nb), c, r) && (nb[field] || 0) > 0 && nb.powered) return nb;
    // A Coke Oven's GAS OUT is hydrogen too.
    if (fluid === 'hydrogen' && nb.type === T.COKEOVEN && atOutPort(CokeOvenSystem.getStubs(nb).gasOut, c, r)
        && (nb._hydrogen || 0) > 0 && nb.powered) return nb;
    if (GasStorageSystem.isSourceOf(nb, fluid, c, r)) return nb;
  }
  return null;
}

// Walks a belt back from `stub` to whatever feeds it one solid: producers
// of `prodType` reached at their OUT stub (`outStubOf`) or named by a belt
// tile they stamped (`flag` / `srcKey`), and Storage Containers banking it.
function _fcBeltFeed(stub, kind, prodType, outStubOf, flag, srcKey) {
  let found = false;
  const bins = [], producers = [];
  const add = p => { if (p && p.type === prodType && !producers.includes(p)) producers.push(p); };
  const run = beltRun(stub.c, stub.r);
  for (let i = 0; i < run.n; i++) {
    const ent = run.ent[i], p = run.par[i];
    const pc = p < 0 ? null : run.c[p], pr = p < 0 ? null : run.r[p];
    if (ent.type === prodType) {
      const o = outStubOf(ent);
      if (ent.powered && pc !== null && o && o.c === pc && o.r === pr) { found = true; add(ent); }
      continue;
    }
    if (SolidStorageSystem.isSourceOf(ent, kind, pc, pr)) {
      if (!bins.includes(ent)) bins.push(ent);
      found = true;
      continue;
    }
    if (isConveyorTile(ent) && ent[flag]) { found = true; add(ent[srcKey]); }
  }
  return { found, bins, producers };
}

// Draws up to `need` of `kind` for `dst`: the producers' `field` buffers
// first, then the bins. Returns what it got.
function _fcBeltDraw(feed, need, dst, kind, field) {
  let got = 0;
  for (const p of feed.producers) {
    if (got >= need) break;
    if (!BeltCargo.reach(p, dst, kind)) continue;   // still on its way along the belt
    const avail = p[field] || 0;
    const take = Math.min(avail, need - got, BeltShare.cap(p, dst, avail, need - got, kind));
    p[field] = avail - take;
    BeltCargo.moved(p, dst, kind, take);
    got += take;
  }
  if (got < need) got += SolidStorageSystem.drawFrom(feed.bins, need - got, dst, kind);
  return got;
}

// ─── Superconductor Mill ──────────────────────────────────────────
const SuperconductorMillSystem = (() => {
  let totalTapeProduced = 0;

  // All four stubs on the bottom face, no rotation (the Leach Plant's rule):
  // oxide IN on the left, the two gas pipes beside it, tape OUT on the right.
  function getStubs(e) {
    const h = e.height || 10;
    return {
      oxideIn:    { c: e.col + 1,  r: e.row + h },
      hydrogenIn: { c: e.col + 4,  r: e.row + h },
      nitrogenIn: { c: e.col + 6,  r: e.row + h },
      tapeOut:    { c: e.col + 10, r: e.row + h },
    };
  }

  const oxideFeed = (e) => _fcBeltFeed(getStubs(e).oxideIn, 'oxide', T.LEACHPLANT,
    p => LeachPlantSystem.getStubs(p).oxideOut, '_isOxideConveyor', '_oxideConveyorSource');

  return {
    tick(e, dt) {
      const def = EntityDefs[T.SCMILL];
      if (!def) return;
      if (e._tape === undefined) e._tape = 0;
      const s = getStubs(e);

      const feed = oxideFeed(e);
      const h2 = _fcGasSource(s.hydrogenIn, 'hydrogen', T.ELECTROLYZER,   '_hydrogen', p => ElectrolyzerSystem.getStubs(p).hydrogenStub);
      const n2 = _fcGasSource(s.nitrogenIn, 'nitrogen', T.ATMOSCOLLECTOR, '_nitrogen', p => AtmosphereCollectorSystem.getStubs(p).nitrogenStub);
      e._hasOxide = feed.found;
      e._hasHydrogen = !!h2;
      e._hasNitrogen = !!n2;

      // Tape belt marked unconditionally, so a Core Works or a bin down the
      // line sees the connection on a cold start.
      markOreBelt(e, s.tapeOut, e.width || 12, e.height || 10, '_isTapeConveyor', '_tapeConveyorSource', def.tapePerSec);

      if (dt <= 0) return;
      e._running = false;
      if (!e.powered || !e._hasOxide || !h2 || !n2) return;
      if (e._tape >= (def.tapeCapacity || 300) || e._idleFull) return;

      // Gases first, as far as they go, then the oxide they allow.
      const hNeed = def.hydrogenPerSec * dt, nNeed = def.nitrogenPerSec * dt;
      const gasK = Math.min(1, (h2._hydrogen || 0) / hNeed, (n2._nitrogen || 0) / nNeed);
      if (gasK <= 0) return;
      const oFull = def.oxidePerSec * dt;
      const oGot = _fcBeltDraw(feed, oFull * gasK, e, 'oxide', '_oxide');
      const ratio = oFull > 0 ? oGot / oFull : 0;
      if (ratio <= 0) return;
      h2._hydrogen = Math.max(0, (h2._hydrogen || 0) - hNeed * ratio);
      n2._nitrogen = Math.max(0, (n2._nitrogen || 0) - nNeed * ratio);

      const made = def.tapePerSec * dt * ratio;
      e._tape = Math.min(def.tapeCapacity || 300, e._tape + made);
      e._running = true;
      BeltCargo.produced(e, 'tape', made);
      totalTapeProduced += made;
    },
    clearTapeConveyorFlags() {
      for (const e of EntityRegistry.getByType(T.CONVEYOR)) { e._isTapeConveyor = false; e._tapeConveyorSource = null; }
      for (const e of EntityRegistry.getByType(T.PIPE))     e._isTapeConveyor = false;
    },
    getStubs,
    getTotalTape()   { return totalTapeProduced; },
    loadTotalTape(v) { if (v !== undefined) totalTapeProduced = v; },
  };
})();

// ─── Core Works ───────────────────────────────────────────────────
const CoreWorksSystem = (() => {
  let totalCoresBuilt = 0;
  let totalCharges = 0;

  // One stub: tape IN on the bottom face. Cores go in and out by drone and
  // truck, not by belt.
  function getStubs(e) {
    const h = e.height || 10;
    return { tapeIn: { c: e.col + 1, r: e.row + h } };
  }

  const tapeFeed = (e) => _fcBeltFeed(getStubs(e).tapeIn, 'tape', T.SCMILL,
    p => SuperconductorMillSystem.getStubs(p).tapeOut, '_isTapeConveyor', '_tapeConveyorSource');

  const chargeSecs = () => (EntityDefs[T.COREWORKS].chargeHours || 4) * DayNight.secondsPerGameHour();
  // 22:00–06:00: the window an Off-Peak works charges in.
  const offPeakNow = () => { const hr = DayNight.hour(); return hr >= 22 || hr < 6; };

  function bays(e) {
    const n = EntityDefs[T.COREWORKS].bays || 4;
    if (!Array.isArray(e._bays)) e._bays = [];
    while (e._bays.length < n) e._bays.push({ state: 'empty' });
    return e._bays;
  }
  const tapeFor = (core) => (EntityDefs[T.COREWORKS].rechargeTape || 28) * (core.quenched ? 2 : 1);

  // Start the next job if nothing is charging: a spent core first (keeping
  // the cores already in service running beats adding another), otherwise a
  // new core into an empty bay. Tape is taken when the job starts.
  function startNext(e) {
    const def = EntityDefs[T.COREWORKS];
    const b = bays(e);
    e._waitingFor = null;
    const spent = b.find(c => c.state === 'spent');
    if (spent) {
      const need = tapeFor(spent);
      if (e._tapeStock < need) { e._waitingFor = need; return null; }
      e._tapeStock -= need;
      spent.state = 'charging'; spent.t = 0; spent.charge = 0;
      return spent;
    }
    if (e._buildCores === false) return null;
    const empty = b.find(c => c.state === 'empty');
    if (!empty) return null;
    if (e._tapeStock < def.coreTape) { e._waitingFor = def.coreTape; return null; }
    e._tapeStock -= def.coreTape;
    totalCoresBuilt++;
    Object.assign(empty, { state: 'charging', id: `FC-${totalCoresBuilt}`, t: 0, charge: 0, cycles: 0, quenched: false });
    return empty;
  }

  return {
    tick(e, dt) {
      const def = EntityDefs[T.COREWORKS];
      if (!def) return;
      if (e._tapeStock === undefined) e._tapeStock = 0;
      const b = bays(e);

      const feed = tapeFeed(e);
      e._hasTape = feed.found;
      const cap = def.tapeCapacity || 300;
      if (dt > 0 && e.powered && feed.found && e._tapeStock < cap)
        e._tapeStock += _fcBeltDraw(feed, Math.min(def.tapeIntakePerSec * dt, cap - e._tapeStock), e, 'tape', '_tape');

      let job = b.find(c => c.state === 'charging');
      if (!job && dt > 0 && e.powered) job = startNext(e);
      e._window = !e._offPeak || offPeakNow();
      e._charging = !!job && e.powered && e._window;
      e._activePowerInput = e._charging ? def.powerInput : def.idleKW;
      if (!e._charging || dt <= 0) return;

      job.t = (job.t || 0) + dt;
      job.charge = Math.min(1, job.t / chargeSecs());
      if (job.charge >= 1) {
        job.state = 'charged';
        job.charge = 1;
        job.quenched = false;
        job.cycles = (job.cycles || 0) + 1;
        delete job.t;
        totalCharges++;
      }
    },

    // ── For the swap job (next step) ──
    bays,
    chargedCount(e) { return bays(e).filter(c => c.state === 'charged').length; },
    // Hands over a charged core, leaving its bay empty; null if none.
    takeCharged(e) {
      const c = bays(e).find(x => x.state === 'charged');
      if (!c) return null;
      const core = { id: c.id, charge: 1, cycles: c.cycles || 0 };
      for (const k of Object.keys(c)) delete c[k];
      c.state = 'empty';
      return core;
    },
    // Takes a core back into an empty bay; false if every bay is full. A core
    // still at full charge (a Hauler bringing back one it couldn't place)
    // goes back on the shelf charged; anything else waits to be recharged.
    acceptSpent(e, core) {
      const c = bays(e).find(x => x.state === 'empty');
      if (!c) return false;
      const full = (core.charge || 0) >= 0.999 && !core.quenched;
      Object.assign(c, { state: full ? 'charged' : 'spent', id: core.id, cycles: core.cycles || 0, quenched: !!core.quenched, charge: full ? 1 : 0 });
      return true;
    },
    // Takes the charged core `id` out of its bay (for a delivery that
    // reserved it); null if it is no longer there.
    takeById(e, id) {
      const c = bays(e).find(x => x.state === 'charged' && x.id === id);
      if (!c) return null;
      const core = { id: c.id, charge: 1, cycles: c.cycles || 0 };
      for (const k of Object.keys(c)) delete c[k];
      c.state = 'empty';
      return core;
    },
    emptyBays(e) { return bays(e).filter(c => c.state === 'empty').length; },
    chargeSecs,
    tapeFor,
    getStubs,
    getTotalCoresBuilt() { return totalCoresBuilt; },
    getTotalCharges()    { return totalCharges; },
    loadTotals(built, charges) { if (built !== undefined) totalCoresBuilt = built; if (charges !== undefined) totalCharges = charges; },
  };
})();

// ─── Field Cores in reactors ──────────────────────────────────────
// The core itself (docs/FIELD_CORE_SPEC.md §4–5). Both fusion reactors take
// up to three: the player sets how many each should run (_coreSlots), and
// drones and Haulers keep them stocked.
//   • Boost: +50% / +30% / +20% for the 1st / 2nd / 3rd live core, added to
//     the fleet bonus in HulkingFusionReactorSystem.getMultiplier, so every
//     converter the reactor feeds (MHD Rings, MK2 turbines) runs harder with
//     no extra steam or ion stream.
//   • Fuel: the reactor burns 0.35× the boost more fuel. The boost runs only
//     on fuel above the base burn (_coreFuelK), so a starved reactor loses
//     the boost first and never drops below what it makes with no core.
//   • Charge: 24 in-game hours of the reactor running.
//   • Cold: each installed core boils off 1.5 liquid helium a second on the
//     reactor's own cryo line, running or not. A reactor quench takes every
//     installed core down with it (quenched: double tape to recharge).
//   • One outgoing bay per reactor: a spent core, or one swapped out, waits
//     there for a carrier. Nothing ever exists only inside a drone: a drone
//     reserves at pickup and moves the core at delivery (DroneSystem's waste
//     rule). Haulers carry cores aboard like any other cargo.
const FieldCoreSystem = (() => {
  const BOOST          = [0.5, 0.3, 0.2];
  const FUEL_PER_BOOST = 0.35;    // +50% output costs +17.5% fuel (was 0.7: +35%)
  const LIFE_HOURS     = 24;      // in-game hours of running per charge
  const BOIL_PER_CORE  = 1.5;     // liquid helium per second per installed core
  const SWAP_AT        = 0.25;    // a core at or below this charge is swapped
  const MAX_SLOTS      = 3;
  const TRUCK_CORES    = 4;       // cores a Hauler carries

  const isHost = (e) => !!e && (e.type === T.HULKINGFUSIONREACTOR || e.type === T.ADVFUSIONREACTOR);
  const hosts  = () => [...EntityRegistry.getByType(T.HULKINGFUSIONREACTOR), ...EntityRegistry.getByType(T.ADVFUSIONREACTOR)];
  const allWorks = () => [...EntityRegistry.getByType(T.COREWORKS)];
  const cores  = (e) => (Array.isArray(e._cores) ? e._cores : (e._cores = []));
  const wanted = (e) => Math.max(0, Math.min(MAX_SLOTS, e._coreSlots || 0));
  const liveCount = (e) => cores(e).filter(c => (c.charge || 0) > 0).length;

  function boost(e) {
    if (!isHost(e) || !Array.isArray(e._cores)) return 0;
    let b = 0;
    const n = Math.min(MAX_SLOTS, liveCount(e));
    for (let i = 0; i < n; i++) b += BOOST[i];
    return b;
  }
  const fuelFactor = (e) => 1 + FUEL_PER_BOOST * boost(e);
  const effectiveBoost = (e) => boost(e) * (e._coreFuelK ?? 1);

  // Called from the reactors' burns with the extra fuel they got against the
  // extra the cores asked for; smoothed like their own burn ratio.
  function noteFuel(e, extraTaken, extraNeed, dt) {
    if (!(dt > 0) || !(extraNeed > 0)) return;
    const k = Math.max(0, Math.min(1, extraTaken / extraNeed));
    const cur = e._coreFuelK ?? 1;
    e._coreFuelK = cur + (k - cur) * Math.min(1, dt * 0.5);
  }

  const boilOff = (e) => (Array.isArray(e._cores) ? e._cores.length : 0) * BOIL_PER_CORE;

  // Moves one core to the outgoing bay if it is free and a core has to go:
  // a spent one first, else the lowest of any beyond the slots wanted.
  function settle(e) {
    if (e._coreOut) return;
    const list = cores(e);
    let i = list.findIndex(c => !((c.charge || 0) > 0));
    if (i < 0 && list.length > wanted(e)) {
      i = 0;
      for (let j = 1; j < list.length; j++) if ((list[j].charge || 0) < (list[i].charge || 0)) i = j;
    }
    if (i >= 0) e._coreOut = list.splice(i, 1)[0];
  }

  // ── Notifications ──
  const centreOn = (e) => () => {
    Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE);
    EntityInfoPanel.open(e);
  };
  const tagOf = (kind, e) => `fieldcore-${kind}-${e.col},${e.row}`;

  function quench(e) {
    if (!Array.isArray(e._cores) || !e._cores.length) return;
    const n = e._cores.length;
    for (const c of e._cores) { c.charge = 0; c.quenched = true; }
    settle(e);
    if (typeof NotificationStack === 'undefined') return;
    NotificationStack.dismissTag(tagOf('quench', e));
    NotificationStack.push({
      icon: '🧊', title: `Field Core${n > 1 ? 's' : ''} quenched`,
      message: `${n} Field Core${n > 1 ? 's' : ''} in ${label(e)} went down with its magnets and lost ${n > 1 ? 'their' : 'its'} charge. `
             + 'Carriers bring them home one at a time through the outgoing bay; a quenched core takes double tape to recharge at the Core Works.',
      color: '#7fe8ff', border: '#2a7a90', tag: tagOf('quench', e),
      onClick: centreOn(e),
    });
  }

  // A reactor running short of the cores it is set for, with no charged
  // core anywhere to send it, is worth a word once it has lasted a while
  // (a delivery a few seconds out is not news).
  const DRY_WARN_SECS = 30;
  function chargedAnywhere() {
    let n = 0;
    for (const w of allWorks()) n += CoreWorksSystem.chargedCount(w);
    for (const t of EntityRegistry.getByType(T.TRUCK)) if (Array.isArray(t._coreCargo)) n += t._coreCargo.filter(isCharged).length;
    return n;
  }
  function watchDry(e, dt, spare) {
    const dry = wanted(e) > liveCount(e) && spare === 0 && !!(e._started || e._generating);
    if (!dry) {
      if (e._fcDryWarned && typeof NotificationStack !== 'undefined') NotificationStack.dismissTag(tagOf('dry', e));
      e._fcDryT = 0; e._fcDryWarned = false;
      return;
    }
    e._fcDryT = (e._fcDryT || 0) + dt;
    if (e._fcDryWarned || e._fcDryT < DRY_WARN_SECS || typeof NotificationStack === 'undefined') return;
    e._fcDryWarned = true;
    const works = allWorks();
    const busy = (w) => CoreWorksSystem.bays(w).some(c => c.state === 'charging');
    const why = !works.length ? 'There is no Core Works to charge one.'
              : works.some(w => w._charging) ? 'A Core Works is charging one now.'
              : works.every(w => !w.powered) ? 'The Core Works has no power.'
              : works.some(w => busy(w) && !w.powered) ? 'The Core Works has a core on charge but no power.'
              : works.some(w => busy(w) && !w._window) ? 'The Core Works is on Off-Peak Charging and waits until 22:00.'
              : works.some(w => w._waitingFor) ? 'The Core Works is waiting on HTS tape.'
              : 'The Core Works has no core to charge: bring the spent ones back, or let it build new ones.';
    NotificationStack.push({
      icon: '🔋', title: 'No charged Field Core',
      message: `${label(e)} is set for ${wanted(e)} Field Core${wanted(e) > 1 ? 's' : ''} and has ${liveCount(e)} live, and no charged core is on any shelf or truck. ${why}`,
      color: '#ffd070', border: '#8a6a20', tag: tagOf('dry', e),
      onClick: centreOn(e),
    });
  }

  function tick(dt) {
    const secs = LIFE_HOURS * DayNight.secondsPerGameHour();
    let spare = null;
    for (const e of hosts()) {
      if (!wanted(e) && !(Array.isArray(e._cores) && e._cores.length) && !e._coreOut) {
        if (e._fcDryWarned) watchDry(e, dt, 1);       // slots set to 0: clear any warning
        continue;
      }
      if (dt > 0 && e._generating) for (const c of cores(e)) c.charge = Math.max(0, (c.charge || 0) - dt / secs);
      settle(e);
      if (spare === null) spare = chargedAnywhere();
      watchDry(e, dt, spare);
    }
  }

  // How many charged cores this reactor can take right now: a free slot
  // each, or one swap for a low core while the outgoing bay is clear.
  function deliverable(e) {
    if (!isHost(e)) return 0;
    const free = Math.max(0, wanted(e) - cores(e).length);
    if (free > 0) return free;
    if (e._coreOut) return 0;
    return cores(e).some(c => (c.charge || 0) <= SWAP_AT) ? 1 : 0;
  }
  const collectable = (e) => !!e._coreOut;

  // Puts `core` in; a low core it replaces goes to the outgoing bay.
  function install(e, core) {
    const list = cores(e);
    const c = { id: core.id, charge: core.charge ?? 1, cycles: core.cycles || 0, quenched: false };
    if (list.length < wanted(e)) { list.push(c); return true; }
    if (e._coreOut) return false;
    let i = -1;
    for (let j = 0; j < list.length; j++)
      if ((list[j].charge || 0) <= SWAP_AT && (i < 0 || list[j].charge < list[i].charge)) i = j;
    if (i < 0) return false;
    e._coreOut = list[i];
    list[i] = c;
    return true;
  }

  // ── Bay reservations (drones) ──
  // A drone flying to collect a charged core reserves its bay. The mark is
  // only honoured while that drone is still on that job, so a dropped job,
  // a demolished port or a reload frees the core without clearing anything.
  const resvLive = (b) => { const d = b && b._resv; return !!(d && d.job && d.job.kind === 'core' && d.job.coreId === b.id); };
  const freeCharged = (w) => CoreWorksSystem.bays(w).filter(b => b.state === 'charged' && !resvLive(b));
  function reserveBay(w, d) {
    const b = freeCharged(w)[0];
    if (!b) return null;
    b._resv = d;
    return b.id;
  }
  function reserveById(w, id, d) {
    const b = CoreWorksSystem.bays(w).find(x => x.state === 'charged' && x.id === id);
    if (b) b._resv = d;
    return !!b;
  }
  const holds = (w, id) => CoreWorksSystem.bays(w).some(b => b.state === 'charged' && b.id === id);

  // ── The two atomic transfers ──
  function deliver(w, id, r) {
    if (deliverable(r) <= 0) return false;
    const core = CoreWorksSystem.takeById(w, id);
    if (!core) return false;
    if (!install(r, core)) { CoreWorksSystem.acceptSpent(w, core); return false; }
    return true;
  }
  function collect(r, w) {
    const c = r._coreOut;
    if (!c || CoreWorksSystem.emptyBays(w) <= 0) return false;
    CoreWorksSystem.acceptSpent(w, c);
    r._coreOut = null;
    settle(r);
    return true;
  }

  // ── Haulers ──
  // A Hauler's claim on a reactor lasts while its current leg is that
  // reactor. Drones check it, and the Hauler checks drones' _droneClaim.
  const truckOn = (r) => {
    const t = r && r._coreTruck;
    return !!(t && EntityRegistry.getByType(T.TRUCK).has(t) && t._haulerLeg && t._haulerLeg.mode === 'core' && t._haulerLeg.ent === r);
  };
  const droneOn = (r) => { const d = r && r._droneClaim; return !!(d && d.job && d.job.port && EntityRegistry.getByType(T.DRONEPORT).has(d.job.port)); };
  const load = (trk) => (Array.isArray(trk._coreCargo) ? trk._coreCargo : (trk._coreCargo = []));
  const isCharged = (c) => (c.charge || 0) >= 0.999 && !c.quenched;
  const label = (e) => (EntityDefs[e.type]?.label || 'Building') + (e._num !== undefined ? ` #${e._num}` : '');
  function nearest(trk, list) {
    let best = null, bestD = Infinity;
    for (const e of list) {
      const d = Math.hypot(e.col + (e.width || 1) / 2 - trk.col, e.row + (e.height || 1) / 2 - trk.row);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }
  const openTo = (r, trk) => !droneOn(r) && (!truckOn(r) || r._coreTruck === trk);

  // The Hauler's next core leg, or null to leave it to cargo. Only while it
  // has no other cargo aboard: one kind of load per trip.
  function planHauler(trk) {
    if ((trk._cargoAmount || 0) > 0.01) return null;
    const aboard = load(trk);
    const charged = aboard.filter(isCharged).length;
    const leg = (ent, status) => { if (isHost(ent)) ent._coreTruck = trk; return { ent, status }; };
    if (charged) {
      const r = nearest(trk, hosts().filter(r => openTo(r, trk) && deliverable(r) > 0));
      if (r) return leg(r, `Delivering ${charged} Field Core${charged > 1 ? 's' : ''} to ${label(r)}`);
    }
    if (aboard.length) {
      const w = nearest(trk, allWorks().filter(w => CoreWorksSystem.emptyBays(w) > 0));
      return w ? leg(w, `Returning ${aboard.length} Field Core${aboard.length > 1 ? 's' : ''} to ${label(w)}`) : null;
    }
    if (hosts().some(r => openTo(r, trk) && deliverable(r) > 0)) {
      const w = nearest(trk, allWorks().filter(w => freeCharged(w).length > 0));
      if (w) return leg(w, `Collecting charged Field Cores from ${label(w)}`);
    }
    const r = nearest(trk, hosts().filter(r => openTo(r, trk) && collectable(r)));
    return r ? leg(r, `Collecting a spent Field Core from ${label(r)}`) : null;
  }

  // At the stop its leg named (HaulSystem.tickHauler).
  function truckDock(trk, ent) {
    const aboard = load(trk);
    if (ent.type === T.COREWORKS) {
      // Everything aboard goes in (spent to recharge, charged back on the
      // shelf), then it loads what the reactors are asking for.
      for (let i = aboard.length - 1; i >= 0; i--) if (CoreWorksSystem.acceptSpent(ent, aboard[i])) aboard.splice(i, 1);
      let want = 0;
      for (const r of hosts()) if (openTo(r, trk)) want += deliverable(r);
      for (const b of freeCharged(ent)) {
        if (want <= 0 || aboard.length >= TRUCK_CORES) break;
        const core = CoreWorksSystem.takeById(ent, b.id);
        if (core) { aboard.push(core); want--; }
      }
      return;
    }
    if (!isHost(ent)) return;
    if (ent._coreTruck === trk) ent._coreTruck = null;
    // Clear the outgoing bay first (it is what blocks a swap), then put the
    // charged cores in, pulling each one they displace straight aboard.
    const pull = () => { if (ent._coreOut && aboard.length < TRUCK_CORES) { aboard.push(ent._coreOut); ent._coreOut = null; settle(ent); } };
    pull();
    for (let i = aboard.length - 1; i >= 0; i--) {
      if (!isCharged(aboard[i]) || deliverable(ent) <= 0) continue;
      const core = aboard[i];
      aboard.splice(i, 1);
      if (!install(ent, core)) { aboard.push(core); break; }
      pull();
    }
  }

  return {
    BOOST, SWAP_AT, MAX_SLOTS, TRUCK_CORES, BOIL_PER_CORE, FUEL_PER_BOOST,
    isHost, cores, wanted, liveCount, isCharged, chargedAnywhere, boost, effectiveBoost, fuelFactor, noteFuel, boilOff, quench, tick,
    deliverable, collectable, install, deliver, collect, settle,
    freeCharged, reserveBay, reserveById, holds, truckOn, droneOn,
    planHauler, truckDock, truckCores: load,
    lifeSecs: () => LIFE_HOURS * DayNight.secondsPerGameHour(),
    setSlots(e, n) { e._coreSlots = Math.max(0, Math.min(MAX_SLOTS, n | 0)); settle(e); },
  };
})();
