/* ═══════════════════════════════════════════════════════════════════
   HULKING FUSION REACTOR + MHD DECELERATOR RING
   End-game fusion power chain, final stage. The reactor burns fuel
   pellets (conveyor, from Fusion Fuel Plant) in one of two ways:
     D-T   — ~80% of the energy leaves in neutrons, caught by the lithium
             breeding blanket (Li COMPOUND IN, Lithium Compound): the heat is
             raised as steam for Steam Turbines, and the lithium becomes
             tritium (TRITIUM OUT, back to the Fuel Plant).
     D-He3 — aneutronic: the energy leaves as charged particles, piped as an
             ion stream (buffered) to the MHD Decelerator Ring, which turns
             them straight into +4 MW. The late-game prize.
   Mirrors NuclearSystem/SteamTurbineSystem's two-stage generator shape
   (see nuclear_chain_systems.js): the reactor is a power CONSUMER, and the
   turbines / ring are the grid generators drawing on it by pipe.

   Superconducting magnets: the reactor only runs while its magnets are
   held at 4.5 K by liquid helium from a Cryo Plant (helium_systems.js),
   piped into LHe IN. Lose the cooling and the magnets warm; at 9 K they
   QUENCH — the plasma dies, most of the helium charge is vented, the
   magnets jump to ~90 K and have to be cooled back down, and the startup
   surge has to be paid again. Helium-4 fusion ash leaves via HE ASH OUT
   and can be piped back to the Cryo Plant to cut the wells' workload.
   ═══════════════════════════════════════════════════════════════════ */

// Magnet temperatures, kelvin.
const FUSION_MAGNET_OPERATING_K    = 4.5;  // where liquid helium holds them
const FUSION_MAGNET_READY_K        = 5.0;  // cold enough to energise
const FUSION_MAGNET_QUENCH_K       = 9.0;  // NbTi loses superconductivity — quench
const FUSION_MAGNET_AMBIENT_K      = 300;  // a warm, never-cooled magnet
const FUSION_MAGNET_QUENCH_SPIKE_K = 90;   // where a quench leaves them
// Cooling is fast while warm and slows as it nears 4.5 K: 0.5 K/s plus 2%
// of the distance left — ~75s back down after a quench, ~2 min from warm.
// Warming without cooling is a steady 0.1 K/s: 45s from 4.5 K to a quench.
const FUSION_MAGNET_WARM_RATE      = 0.1;
// Below this share of the helium charge there isn't enough liquid in the
// cryostat to hold the coils cold, even with a Cryo Plant running.
const FUSION_MIN_CHARGE_FRAC       = 0.5;
// Reactors in saves from before magnets existed ran with no helium chain at
// all. They load cold and fully charged with this much stored coolant
// (seconds of sim time) so the update doesn't quench them on load — time
// for the player to scan for helium and build a Cryo Plant.
const FUSION_LEGACY_COOLANT_SECONDS = 3600;

// ─── Hulking Fusion Reactor System ────────────────────────────────
const HulkingFusionReactorSystem = (() => {
  let totalHighBetaProduced = 0;
  let totalPelletsBurned    = 0;   // gates the Helium-3 Separator
  let totalSteamRaised      = 0;

  // Footprint is 30×30 (15×15, and 8×8 before that - the resizes) — reactors already in a save
  // keep their saved size). plasmaIn (conveyor) and highBetaOut (pipe) sit
  // mid-face on opposite faces, rotated together — same convention as
  // FusionFuelPlantSystem.getStubs().
  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || 30, h = e.height || 30;
    const mid = Math.floor(w / 2);
    let plasmaIn, highBetaOut;
    if (rot === 0) {
      plasmaIn    = { c: e.col - 1,   r: e.row + mid };
      highBetaOut = { c: e.col + w,   r: e.row + mid };
    } else if (rot === 1) {
      plasmaIn    = { c: e.col + mid, r: e.row - 1 };
      highBetaOut = { c: e.col + mid, r: e.row + h };
    } else if (rot === 2) {
      plasmaIn    = { c: e.col + w,   r: e.row + mid };
      highBetaOut = { c: e.col - 1,   r: e.row + mid };
    } else {
      plasmaIn    = { c: e.col + mid, r: e.row + h };
      highBetaOut = { c: e.col + mid, r: e.row - 1 };
    }
    // The rest, in the unrotated frame, mapped with the same transpose /
    // mirror / quarter-turn convention as _plantFrame — which the two
    // mid-face stubs above also follow:
    //   top face    — LHe IN (left of centre), Li COMPOUND IN belt (right of centre)
    //   bottom face — TRITIUM OUT (left of centre), HE ASH OUT (right of centre)
    const lw = rot % 2 ? h : w, lh = rot % 2 ? w : h;
    const local = (x, y) =>
        rot === 1 ? { c: e.col + y,          r: e.row + x }
      : rot === 2 ? { c: e.col + lw - 1 - x, r: e.row + y }
      : rot === 3 ? { c: e.col + y,          r: e.row + lw - 1 - x }
      :             { c: e.col + x,          r: e.row + y };
    const cryoIn     = local(3, -1);
    const blanketIn  = local(lw - 4, -1);
    const tritiumOut = local(3, lh);
    const ashOut     = local(lw - 4, lh);
    // highBetaOut is the reactor's main outlet: steam on D-T fuel, the ion
    // stream on D-He3. The name stays for the pipe renderer and old code.
    return { plasmaIn, highBetaOut, powerOut: highBetaOut, cryoIn, blanketIn, tritiumOut, ashOut };
  }

  // Lithium Compound feeding the breeding blanket — conveyor BFS from
  // Li COMPOUND IN back to a Lithium Processing Plant with compound banked
  // (the same walk FusionFuelPlantSystem used when compound went there).
  // Returns { source, field } — a Processing Plant's compound buffer, or a
  // Storage Container banking compound (its OUT belt is flagged the same way,
  // so this walk reaches it).
  // Every such source on the belt, nearest first: the blanket draws on the
  // first whose stream has reached it and moves on to the next for what is
  // left (the Tritium Breeding Facility does the same), so one plant with a
  // little compound banked whose sacks never get through can't starve it.
  function findBlanketSources(e) {
    const { blanketIn } = getStubs(e);
    const run = beltRun(blanketIn.c, blanketIn.r, '_isLithiumCompoundConveyor');
    const out = [];
    for (let _i = 0; _i < run.n; _i++) {
      const ent = run.ent[_i], _p = run.par[_i];
      const pc = _p < 0 ? null : run.c[_p], pr = _p < 0 ? null : run.r[_p];
      if (out.some(s => s.source === ent)) continue;
      if (ent.type === T.LITHIUMPROCESSPLANT && (ent._compound || 0) > 0
          && arrivedByPort(LithiumProcessPlantSystem.getStubs(ent).compoundOut, pc, pr)) out.push({ source: ent, field: '_compound' });
      else if (SolidStorageSystem.isSourceOf(ent, 'compound', pc, pr)) out.push({ source: ent, field: '_stored' });
    }
    return out;
  }

  // Flag pipes from a stub as carrying `fluid` — the shared marking walk
  // for STEAM and TRITIUM out.
  function markPipes(stub, fluid, flag, rate) {
    const run = pipeRun(stub.c, stub.r, fluid);
    for (let i = 0; i < run.n; i++) {
      const p = run.pipe[i];
      p[flag] = true;
      if (rate !== undefined) p._flowRate = rate;
    }
    return run.n > 0;
  }

  function clearTritiumPipeFlags() {
    for (const p of allPipes()) p._tritiumActive = false;
  }

  // Every Cryo Plant on the LHe IN pipe network — BFS over liquid-helium
  // pipe, collecting each plant whose LHe OUT stub is the tile the walk
  // arrived from. All of them, not the first: a spare plant on the same line
  // is the obvious redundancy to build, and it has to actually cover for one
  // that trips. Not gated on power: whether a plant is cooling is the
  // caller's question (plant._running).
  function findCryoPlants(e) {
    const { cryoIn } = getStubs(e);
    // None until the liquid helium has visibly run down the line to LHe IN.
    // Only for the first fill: once the cryostat holds helium, a line that
    // runs dry (the plants out of gas) still has its plants refrigerating,
    // and the charge carries the magnets until it falls below
    // FUSION_MIN_CHARGE_FRAC. Dropping them here cut cooling at once, with
    // the cryostat still nearly full.
    if (!(e._heCharge > 0) && !pipeArrivedAt(cryoIn.c, cryoIn.r, 'liquidhe')) return [];
    const run = pipeRun(cryoIn.c, cryoIn.r, 'liquidhe');
    const plants = [];
    for (let j = 0; j < run.pn; j++) {
      const nb = run.pe[j];
      if (nb.type !== T.CRYOPLANT) continue;
      const out = CryoPlantSystem.getStubs(nb).liquidOut;
      if (out.c === run.ptc[j] && out.r === run.ptr[j] && !plants.includes(nb)) plants.push(nb);
    }
    return plants;
  }

  function _reactorName(e) {
    return (EntityDefs[T.HULKINGFUSIONREACTOR].label || 'Fusion Reactor') + (e._num !== undefined ? ` #${e._num}` : '');
  }
  const _quenchTag = (e) => `quench-${e.col},${e.row}`;
  const _legacyTag = (e) => `legacycoolant-${e.col},${e.row}`;
  const _surgeTag  = (e) => `surgefail-${e.col},${e.row}`;

  function quench(e, def) {
    const cap = def.heliumChargeCap || 400;
    const vented = (e._heCharge || 0) * (def.quenchVentFrac ?? 0.6);
    e._heCharge    = Math.max(0, (e._heCharge || 0) - vented);
    e._magnetK     = Math.max(e._magnetK || 0, FUSION_MAGNET_QUENCH_SPIKE_K);
    e._started     = false;
    e._generating  = false;
    e._quenchVent  = 4;                       // seconds of vent plume on the sprite
    e._quenchCount = (e._quenchCount || 0) + 1;
    e._surgeProgress = 0;
    if (typeof FieldCoreSystem !== 'undefined') FieldCoreSystem.quench(e);   // its Field Cores quench with it
    const name = _reactorName(e);
    NotificationStack.dismissTag(_legacyTag(e));
    NotificationStack.push({
      icon: '🧲', title: 'Magnet quench',
      message: `${name}'s magnets warmed past ${FUSION_MAGNET_QUENCH_K} K and quenched. The plasma is out and ${Math.round(vented)} of ${cap} u of liquid helium blew out of the vent. `
             + 'A running Cryo Plant has to cool them back to 4.5 K and refill the charge before the startup surge can relight it.',
      color: '#ff5040', border: '#a02010', tag: _quenchTag(e), glow: true,
      onClick: () => {
        Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE);
        EntityInfoPanel.open(e);
      },
    });
  }

  // Magnet cooling, helium charge and quench — runs before the burn so a
  // reactor that quenches this tick doesn't also produce.
  function tickMagnets(e, def, dt) {
    const cap = def.heliumChargeCap || 400;
    // A reactor placed fresh starts warm and empty; one loaded from a save
    // made before magnets existed is marked legacy by the loader (save.js).
    if (e._magnetK === undefined)  e._magnetK  = FUSION_MAGNET_AMBIENT_K;
    if (e._heCharge === undefined) e._heCharge = 0;

    const plants = findCryoPlants(e);
    e._cryoLinked  = plants.length > 0;
    e._cryoRunning = plants.some(p => p._running);
    e._cryoPlants  = plants.length;
    if (e._quenchVent > 0) e._quenchVent = Math.max(0, e._quenchVent - dt);
    if (dt <= 0) return;

    // Top the cryostat up from the plants' liquid buffers, fullest first.
    let room = Math.min(cap - e._heCharge, (def.heliumFillPerSec || 20) * dt);
    for (const p of plants.slice().sort((a, b) => (b._liquidHe || 0) - (a._liquidHe || 0))) {
      if (room <= 0) break;
      const take = Math.min(room, p._liquidHe || 0);
      if (take > 0) { p._liquidHe -= take; e._heCharge += take; room -= take; }
    }
    // Energised magnets boil helium off continuously; installed Field Cores
    // are cold magnets too, running or not.
    if (e._started) e._heCharge = Math.max(0, e._heCharge - (def.heliumBoilOff || 1) * dt);
    if (typeof FieldCoreSystem !== 'undefined') e._heCharge = Math.max(0, e._heCharge - FieldCoreSystem.boilOff(e) * dt);

    if (e._legacyCoolant > 0) {
      e._legacyCoolant = Math.max(0, e._legacyCoolant - dt);
      // The only notice an existing player gets that their reactor now needs
      // a helium chain — once when the stored coolant is first seen (each
      // load re-arms it), again with five minutes left. Superseded by the
      // plant taking over, since then the countdown no longer matters.
      if (e._cryoRunning) NotificationStack.dismissTag(_legacyTag(e));
      else if (!e._legacyWarned || (!e._legacyWarnedLow && e._legacyCoolant <= 300)) {
        const low = e._legacyCoolant <= 300;
        e._legacyWarned = true;
        if (low) e._legacyWarnedLow = true;
        const mins = Math.max(1, Math.ceil(e._legacyCoolant / 60));
        NotificationStack.dismissTag(_legacyTag(e));
        NotificationStack.push({
          icon: '🧲', title: low ? 'Magnet coolant running out' : 'Fusion magnets need helium',
          message: `${_reactorName(e)} is running on stored liquid helium; about ${mins} min left. `
                 + 'Scan for a helium gas field, build a Helium Well and a Cryo Plant, and pipe LHe OUT into the reactor\'s LHe IN before it runs dry, or the magnets will quench.',
          color: low ? '#ff5040' : '#ffb040', border: low ? '#a02010' : '#a05010', tag: _legacyTag(e), glow: low,
          onClick: () => {
            Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE);
            EntityInfoPanel.open(e);
          },
        });
      }
    }
    const legacy = e._legacyCoolant > 0;
    e._coolingOK = legacy || (e._cryoRunning && e._heCharge >= cap * FUSION_MIN_CHARGE_FRAC);

    if (e._coolingOK) {
      const rate = 0.5 + 0.02 * (e._magnetK - FUSION_MAGNET_OPERATING_K);
      e._magnetK = Math.max(FUSION_MAGNET_OPERATING_K, e._magnetK - rate * dt);
    } else {
      e._magnetK = Math.min(FUSION_MAGNET_AMBIENT_K, e._magnetK + FUSION_MAGNET_WARM_RATE * dt);
    }

    if (e._started && e._magnetK >= FUSION_MAGNET_QUENCH_K) quench(e, def);
  }

  // Cold enough and charged enough to energise. Legacy coolant stands in
  // for a full charge.
  function magnetsReady(e, def) {
    const cap = def.heliumChargeCap || 400;
    return (e._magnetK ?? FUSION_MAGNET_AMBIENT_K) <= FUSION_MAGNET_READY_K
        && (e._legacyCoolant > 0 || (e._heCharge || 0) >= cap * 0.95);
  }

  // BFS through conveyors carrying Plasma Fuel Cells (the same
  // _isPlasmaFuelConveyor flag FusionFuelPlantSystem stamps on its own
  // output belt) back to a Fusion Fuel Plant with plasma to give.
  function findPlasmaSource(e) {
    const { plasmaIn } = getStubs(e);
    // The Fuel Plant at the head of the belt, stocked or not — kept so the
    // panel can say WHY pellets are short (FusionFuelPlant's own limits).
    // Every stocked source on the belt, nearest first (`sources`): the nearest
    // plant often holds only a tick's worth, and stopping at it left plants
    // further down the line sitting full while the core starved.
    // `feeds`: every plant and pellet bin on the belt, stocked or not, nearest
    // first. The reactor claims its BeltShare of each one every tick, so a
    // plant another reactor ticking first has just emptied still splits what
    // it makes next between all of them. Claiming only on the nearest plant
    // let the first reactor to tick take the whole of every plant further
    // along and bank it in its core, while the others starved on the same belt.
    let plant = null;
    const sources = [], feeds = [];
    const run = beltRun(plasmaIn.c, plasmaIn.r, '_isPlasmaFuelConveyor');
    for (let _i = 0; _i < run.n; _i++) {
      const ent = run.ent[_i], _p = run.par[_i];
      const pc = _p < 0 ? null : run.c[_p], pr = _p < 0 ? null : run.r[_p];
      if (feeds.some(s => s.source === ent)) continue;
      // Deliberately does NOT require ent.powered — same reasoning as
      // MHDDeceleratorRingSystem.hasHighBetaPipe and FusionFuelPlantSystem's
      // own source lookups: an already-banked plasma buffer should still be
      // drawable even if the Fuel Plant's control power is momentarily out
      // or its powered flag is frozen while paused.
      if (ent.type === T.FUSIONFUELPLANT && arrivedByPort(FusionFuelPlantSystem.getStubs(ent).plasmaOut, pc, pr)) {
        plant = plant || ent;
        feeds.push({ source: ent, field: '_plasma' });
        if ((ent._plasma || 0) > 0) sources.push({ source: ent, field: '_plasma' });
        continue;
      }
      // Pellets banked in a Storage Container feed the reactor the same way.
      if (SolidStorageSystem.isSourceOf(ent, 'pellets', pc, pr)) {
        feeds.push({ source: ent, field: '_stored' });
        if ((ent._stored || 0) > 0) sources.push({ source: ent, field: '_stored' });
      }
    }
    if (sources.length) return { found: true, ...sources[0], sources, feeds, plant };
    return { found: false, feeds, plant };
  }

  // What a reactor's core asks its belt for this tick (its BeltShare claim).
  // Below CORE_RESERVE_SECS of burn it loads as fast as it can; above that it
  // asks only for what it burns, so a reactor topping up a reserve never
  // outbids one on the same belt that is running short, and the Fuel Plants
  // settle to making what is burned. A reactor filling its core used to claim
  // ten times its burn: at a fork that took half the belt while the reactors
  // on the other branch ran at part burn, and it kept every plant on the
  // belt running flat out (and through the Wash Towers' deuterium) to fill
  // cores of 300. A core banked above the reserve, from a save, is kept.
  const CORE_RESERVE_SECS = 60;
  function coreWant(e, def, coreCap, dt) {
    const fill = Math.min(coreCap - e._corePellets, (def.coreLoadPerSec || 5) * dt);
    const burn = def.plasmaPerSec || 0.5;
    return e._corePellets < burn * CORE_RESERVE_SECS ? fill : Math.min(fill, burn * dt);
  }

  // Clear high-beta flags for all pipes — called once per tick, right before
  // the reactors re-mark them. Nothing cleared them before, so a pipe that
  // had ever carried High-Beta stayed claimed for it after the reactor was
  // demolished or the pipe was rerouted, refusing every other fluid.
  function clearHighBetaPipeFlags() {
    for (const p of allPipes()) { p._highBetaActive = false; p._highBetaFlow = false; }
  }

  // Mark pipes carrying High-Beta Plasma from the OUT stub — same BFS
  // marking pattern as NuclearSystem.markSteamPipes. Runs unconditionally
  // every tick (even when starved) so a piped MHD Ring can always find its
  // source when the reactor starts producing again.
  // `_highBetaFlow` (what the pipes draw) only while the plasma is streaming.
  function markHighBetaPipe(e) {
    const { highBetaOut } = getStubs(e);
    const flowing = !!e._started && (!!e._generating || (e._highBeta || 0) > 1);
    const run = pipeRun(highBetaOut.c, highBetaOut.r, 'highbeta');
    for (let i = 0; i < run.n; i++) { run.pipe[i]._highBetaActive = true; if (flowing) run.pipe[i]._highBetaFlow = true; }
  }

  // ── Fleet bonus ──────────────────────────────────────────────────
  // Running reactors on one network share cooling, magnet supply and operating
  // know-how: each one after the first adds FLEET_BONUS_PER to every running
  // reactor's conversion output (MHD Ring / Steam Turbine), up to FLEET_BONUS_CAP.
  // Only reactors that are actually burning count, and the multiplier eases
  // toward its target so one quench doesn't snap every other reactor's output.
  const FLEET_BONUS_PER = 0.10;
  const FLEET_BONUS_CAP = 0.50;
  const FLEET_EASE_SECS = 5;

  function updateMultipliers(dt) {
    const running = new Map();   // networkId -> running reactor count
    let lone = 0;
    const all = EntityRegistry.getByType(T.HULKINGFUSIONREACTOR);
    for (const e of all) {
      if (!e._generating) continue;
      if (e.networkId >= 0) running.set(e.networkId, (running.get(e.networkId) || 0) + 1);
      else lone++;
    }
    for (const e of all) {
      const n = e._generating ? (e.networkId >= 0 ? running.get(e.networkId) : Math.max(1, lone)) : 1;
      e._fleetCount = e._generating ? n : 0;
      const target = 1 + Math.min(FLEET_BONUS_CAP, FLEET_BONUS_PER * Math.max(0, n - 1));
      const cur = e._fusionMult || 1;
      e._fusionMult = dt > 0 ? cur + (target - cur) * Math.min(1, dt / FLEET_EASE_SECS) : cur;
    }
  }

  return {
    updateMultipliers,
    // Fleet bonus plus Field Cores (FieldCoreSystem), added rather than
    // multiplied so the top end can't run away. Both reactor types: an
    // Advanced Fusion Reactor has no fleet bonus, so it reads 1 + its cores.
    getMultiplier(e) {
      return ((e && e._fusionMult) || 1) + (typeof FieldCoreSystem !== 'undefined' ? FieldCoreSystem.effectiveBoost(e) : 0);
    },
    getFleetMultiplier(e) { return (e && e._fusionMult) || 1; },
    FLEET_BONUS_PER, FLEET_BONUS_CAP,
    tick(e, dt) {
      const def = EntityDefs[T.HULKINGFUSIONREACTOR];
      if (!def) return;

      const cap = def.highBetaCapacity || 1000;
      e._highBeta = e._highBeta || 0;

      let plasmaResult = findPlasmaSource(e);
      // The burn follows whatever the feeding Fuel Plant is making; with no
      // plant connected the reactor remembers its last fuel.
      // A Storage Container records which fuel its pellets are (_pelletMode).
      // Since the split the Fusion Reactor is D-T only, at home and on a
      // contract job site alike: D-He3 belongs to the Advanced Fusion Reactor.
      // Two exceptions keep existing setups running: a reactor loaded from a
      // pre-split save while burning D-He3 (_legacyDhe3, set by the loader),
      // and a fusion job accepted before job sites followed the home rule
      // (ContractSystem.legacyFusionJob: it asks for MHD Rings off this
      // reactor, so the client's pellets burn as D-He3 whatever the bin says).
      const legacyJob = (typeof ContractSystem !== 'undefined' && !!ContractSystem.legacyFusionJob && ContractSystem.legacyFusionJob())
        || (typeof ScenarioSystem !== 'undefined' && ScenarioSystem.active());   // demo: Star Power runs MHD Rings the same way
      const allowDhe3 = !!e._legacyDhe3 || legacyJob;
      e._wrongFuel = false;
      if (plasmaResult.found) {
        const src = plasmaResult.source;
        const mode = legacyJob && src.type === T.SOLIDSTORAGE ? 'dhe3'
                   : src.type === T.SOLIDSTORAGE ? src._pelletMode : src._fuelMode;
        if (mode === 'dhe3' && !allowDhe3) { e._wrongFuel = true; plasmaResult = { found: false, plant: plasmaResult.plant }; }
        else e._fuelMode = mode === 'dhe3' ? 'dhe3' : 'dt';
      }
      if (!plasmaResult.found && (e._fuelMode !== 'dhe3' || !allowDhe3)) e._fuelMode = 'dt';

      // Pellet core: like a fission core's rod buffer, the reactor loads
      // pellets off its PLASMA IN belt into a store of its own and burns from
      // that, so a gap in supply runs it down over minutes instead of
      // stopping it dead. One fuel at a time — a core still holding one kind
      // doesn't load the other until it has burned out.
      const coreCap = def.pelletCoreCapacity || 0;
      e._corePellets = Math.max(0, Math.min(coreCap, e._corePellets || 0));
      if (e._corePellets <= 0.001) { e._corePellets = 0; e._coreMode = null; }
      const canLoad = plasmaResult.found && (!e._coreMode || e._coreMode === e._fuelMode);
      if (e._coreMode) e._fuelMode = e._coreMode;
      e._pelletFeed = plasmaResult.found;
      e._feedPlant  = plasmaResult.plant || null;   // for the panel's "why short" line
      // A D-T core below its reserve tells every Fuel Plant on its belt, which
      // then gives D-T first call on its rate ahead of the D-He3 line
      // (FusionFuelPlantSystem). Stamped with the game clock, so it lapses
      // once the core is stocked again or the reactor goes.
      if (e._fuelMode !== 'dhe3' && e._corePellets < (def.plasmaPerSec || 0.5) * CORE_RESERVE_SECS && typeof DayNight !== 'undefined') {
        for (const { source: src } of plasmaResult.feeds || []) if (src.type === T.FUSIONFUELPLANT) src._dtReactorShortAt = DayNight.getElapsed();
      }
      if (canLoad && dt > 0 && e._corePellets < coreCap) {
        let want = coreWant(e, def, coreCap, dt);
        // Down the line, nearest source first, only sources of the fuel the
        // core is loading.
        const modeOf = s => (legacyJob && s.type === T.SOLIDSTORAGE) ? 'dhe3' : s.type === T.SOLIDSTORAGE ? (s._pelletMode || 'dt') : (s._fuelMode === 'dhe3' ? 'dhe3' : 'dt');
        // Every feed, empty ones too, so the share of each is claimed.
        for (const { source: src, field } of plasmaResult.feeds || plasmaResult.sources || [plasmaResult]) {
          if (want <= 1e-9) break;
          if (modeOf(src) !== e._fuelMode) continue;
          // Nothing arrives until the pellets have had time to travel the belt.
          // The share is claimed whether or not they have arrived (BeltShare).
          const share = BeltShare.cap(src, e, src[field] || 0, want, 'pellets');
          const got = BeltCargo.reach(src, e, 'pellets') ? Math.min(src[field] || 0, want, share) : 0;
          if (got <= 0) continue;
          src[field] -= got;
          BeltCargo.moved(src, e, 'pellets', got);
          if (field === '_stored' && src._stored <= 0.001) { src._stored = 0; src._solidType = null; }
          e._corePellets += got;
          e._coreMode = e._fuelMode;
          want -= got;
        }
      }
      // Plants with nothing in their hoppers this instant are still this
      // reactor's plants: claim a share of what each makes next. Without this
      // a second reactor on the belt, ticking first, emptied them every tick
      // and this one never got a pellet.
      else if (dt > 0 && !plasmaResult.found && !e._wrongFuel && e._corePellets < coreCap) {
        const want = coreWant(e, def, coreCap, dt);
        for (const { source: src, field } of plasmaResult.feeds || []) {
          const mode = src.type === T.SOLIDSTORAGE ? (src._pelletMode || 'dt') : (src._fuelMode === 'dhe3' ? 'dhe3' : 'dt');
          if (e._coreMode && e._coreMode !== mode) continue;
          BeltShare.cap(src, e, src[field] || 0, want, 'pellets');
        }
      }
      const hasFuel = e._corePellets > 0.001;
      e._hasPlasma = hasFuel;
      const isDT = e._fuelMode === 'dt';

      if (e._started === undefined) e._started = false;
      tickMagnets(e, def, dt);

      // Bred tritium goes back to the Fuel Plant whenever there's some banked
      // — or while breeding, since the plant empties the store every tick
      // (_breeding is last tick's, set in the D-T burn below).
      const tCap = def.tritiumCapacity || 500;
      e._tritium = Math.min(tCap, e._tritium || 0);
      e._tritiumPipeOut = (e._tritium > 0 || !!e._breeding) && markPipes(getStubs(e).tritiumOut, 'tritium', '_tritiumActive', def.tritiumBredPerSec);
      e._breeding = false;
      const blankets = findBlanketSources(e);
      e._hasBlanket = blankets.length > 0;
      // A belt is on Li COMPOUND IN but it's a mine's ore line, not a Processing
      // Plant's output: the commonest way to end up with nothing arriving.
      {
        const bt = e._hasBlanket ? null : GridManager.getEntity(getStubs(e).blanketIn.c, getStubs(e).blanketIn.r);
        e._blanketOreBelt = !!(bt && isConveyorTile(bt) && bt._isLithiumConveyor && !bt._isLithiumCompoundConveyor);
      }

      // Ash leaves whenever there's some banked, like the High-Beta outlet —
      // or while burning, since a Cryo Plant on the line drains the buffer
      // to zero between ticks.
      const ashCap = def.heliumAshCapacity || 200;
      e._heAsh = Math.min(ashCap, e._heAsh || 0);
      e._ashPipeOut = (e._heAsh > 0 || e._started) && HeliumSystem.markHeliumPipes(getStubs(e).ashOut, def.heliumAshPerSec);

      // Startup surge: once the magnets are cold and charged and there's fuel,
      // the reactor demands a 5 MW surge and has to hold it for
      // startupSurgeSeconds before dropping to its steady draw. A reactor
      // still cooling down idles on its normal draw. e._activePowerInput is
      // the same override field DemandCurves uses in power_network.js
      // (`e._activePowerInput ?? e.def.powerInput`) — undefined falls back to
      // the def's powerInput. The network was solved against LAST tick's
      // demand, so a tick of surge only counts if it was already demanded.
      // If the grid can't carry it, the shortfall blacks out the WHOLE
      // network component — so the reactor stands down for
      // startupRetrySeconds instead of holding the city dark indefinitely.
      // On a contract job site the client supplies a small ignition pulse
      // instead of the full grid surge: the site's own generation could never
      // carry 5 MW before anything is running, and the job's starter plant is
      // sized to cover this.
      const onSite = (typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite && ContractSystem.isAtSite())
        || (typeof ScenarioSystem !== 'undefined' && ScenarioSystem.active());   // demo scenarios get the same small pulse
      const surge = onSite ? Math.min(200, def.startupSurge || 5000) : (def.startupSurge || 5000);
      e._surgeKW = surge;
      const surgeSecs = def.startupSurgeSeconds || 5;
      const surgeWasDemanded = e._activePowerInput === surge;
      const ready = magnetsReady(e, def);
      e._magnetsReady = ready;
      if (e._surgeCooldown > 0) e._surgeCooldown = Math.max(0, e._surgeCooldown - dt);
      if (!e._started && surgeWasDemanded) {
        if (!e.powered && dt > 0) {
          e._surgeProgress = 0;
          e._surgeCooldown = def.startupRetrySeconds || 20;
          NotificationStack.dismissTag(_surgeTag(e));
          NotificationStack.push({
            icon: '⚡', title: 'Fusion startup failed',
            message: `The grid couldn't carry ${_reactorName(e)}'s ${formatPower(surge)} startup surge, and the shortfall blacked out its network. `
                   + `It will try again in ${e._surgeCooldown}s; add generation or charged batteries to that network first.`,
            color: '#ffb040', border: '#a05010', tag: _surgeTag(e),
            onClick: () => {
              Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE);
              EntityInfoPanel.open(e);
            },
          });
        } else if (ready && hasFuel) {
          e._surgeProgress = (e._surgeProgress || 0) + dt;
        } else {
          e._surgeProgress = 0;
        }
      }
      const wantSurge = !e._started && ready && hasFuel
                     && !(e._surgeCooldown > 0) && (e._surgeProgress || 0) < surgeSecs;
      e._activePowerInput = wantSurge ? surge : undefined;

      // The main outlet carries the ion stream only on D-He3 — on D-T it's
      // steam, marked below once there's steam to send.
      if (!isDT) markHighBetaPipe(e);
      const markSteam = () => { if (isDT && e._steamGenerating) markPipes(getStubs(e).powerOut, 'steam', '_steamActive'); };

      e._generating = false;
      if (!e.powered || !hasFuel) { e._steamGenerating = false; e._steamOutput = 0; return; }

      // The surge was demanded and met — drop to the steady draw from here on.
      if (!e._started) {
        e._steamGenerating = false; e._steamOutput = 0;
        if (!ready || (e._surgeProgress || 0) < surgeSecs) return;
        e._started = true;
        e._surgeProgress = 0;
        e._activePowerInput = undefined;
        NotificationStack.dismissTag(_surgeTag(e));
        NotificationStack.dismissTag(_quenchTag(e));
      }

      // Only the D-He3 ion stream is buffered, so only it can back up.
      if (!isDT && (e._highBeta >= cap || e._idleFull)) { e._generating = true; e._steamGenerating = false; e._steamOutput = 0; return; }

      // Burn from the core — proportionally, so a core running on empty
      // (topped up only as fast as pellets arrive) burns at the supply rate
      // instead of flickering STANDBY/GENERATING.
      const avail = e._corePellets;

      // Frozen while paused (dt === 0) — otherwise "plasmaNeed = plasmaPerSec*0
      // = 0" forces taken to 0 regardless of how much plasma is actually
      // available, reporting the reactor as off every single time the game
      // is paused (mirrors OilSystem.tickFuelGenerator's identical dt<=0 guard).
      if (dt <= 0) { e._generating = avail > 0; markSteam(); return; }

      const plasmaNeed = def.plasmaPerSec * dt;
      const taken = Math.min(avail, plasmaNeed);
      if (taken <= 0) { e._steamGenerating = false; e._steamOutput = 0; return; }

      e._corePellets -= taken;
      totalPelletsBurned += taken;
      const ratio = taken / plasmaNeed;
      // Field Cores burn extra on top of the base burn; the boost runs only
      // on what of that extra the core actually has (FieldCoreSystem.noteFuel).
      if (typeof FieldCoreSystem !== 'undefined') {
        const extraNeed = plasmaNeed * (FieldCoreSystem.fuelFactor(e) - 1);
        if (extraNeed > 0) {
          const extra = Math.min(e._corePellets, extraNeed);
          e._corePellets -= extra;
          totalPelletsBurned += extra;
          FieldCoreSystem.noteFuel(e, extra, extraNeed, dt);
        }
      }
      // Share of full burn, smoothed for the info panel (the per-tick ratio
      // jitters with the belt), along with the blanket's share below.
      e._burnRatio = (e._burnRatio ?? ratio) + (ratio - (e._burnRatio ?? ratio)) * Math.min(1, dt * 0.5);
      e._heAsh    = Math.min(ashCap, e._heAsh + (def.heliumAshPerSec || 0) * dt * ratio);
      e._generating = true;

      if (isDT) {
        // Neutrons → blanket: heat for steam, and tritium out of the lithium.
        // Steam doesn't need the blanket's lithium (the blanket structure
        // still catches the heat); breeding does.
        let blanketRatio = 0;
        if (blankets.length) {
          const need = (def.blanketPerSec || 2) * dt * ratio;
          let got = 0;
          for (const b of blankets) {
            if (got >= need) break;
            if (!BeltCargo.reach(b.source, e, 'compound')) continue;   // sacks still on their way
            const have = b.source[b.field] || 0;
            const take = Math.min(need - got, have, BeltShare.cap(b.source, e, have, need - got, 'compound'));
            if (take <= 0) continue;
            b.source[b.field] -= take;
            BeltCargo.moved(b.source, e, 'compound', take);
            if (b.field === '_stored' && b.source._stored <= 0.001) { b.source._stored = 0; b.source._solidType = null; }
            got += take;
          }
          blanketRatio = need > 0 ? got / need : 0;
        }
        e._blanketRatio = blanketRatio;
        e._breeding = blanketRatio > 0;
        e._tritium = Math.min(tCap, e._tritium + (def.tritiumBredPerSec || 4.4) * dt * ratio * blanketRatio);
        e._steamOutput = Math.round((def.steamOutput || 800) * ratio * WeatherEventSystem.getMagnetMult(e.networkId));
        e._steamGenerating = e._steamOutput > 0;
        totalSteamRaised += e._steamOutput * dt;
        markSteam();
      } else {
        e._steamGenerating = false; e._steamOutput = 0; e._blanketRatio = 0;
        const produced = def.highBetaPerSec * dt * ratio;
        e._highBeta = Math.min(cap, e._highBeta + produced);
        totalHighBetaProduced += produced;
      }
    },
    getTotalPelletsBurned() { return totalPelletsBurned; },
    loadTotalPelletsBurned(v) { if (v !== undefined) totalPelletsBurned = v; },
    getTotalSteamRaised() { return totalSteamRaised; },
    loadTotalSteamRaised(v) { if (v !== undefined) totalSteamRaised = v; },
    clearTritiumPipeFlags,
    getTotalHighBetaProduced() { return totalHighBetaProduced; },
    loadTotalHighBetaProduced(v) { if (v !== undefined) totalHighBetaProduced = v; },
    getStubs,
    clearHighBetaPipeFlags,
    magnetsReady(e) { return magnetsReady(e, EntityDefs[T.HULKINGFUSIONREACTOR]); },
    OPERATING_K: FUSION_MAGNET_OPERATING_K,
    READY_K:     FUSION_MAGNET_READY_K,
    QUENCH_K:    FUSION_MAGNET_QUENCH_K,
    MIN_CHARGE_FRAC: FUSION_MIN_CHARGE_FRAC,
    LEGACY_COOLANT_SECONDS: FUSION_LEGACY_COOLANT_SECONDS,
  };
})();


// ─── MHD Decelerator Ring System ──────────────────────────────────
// Converts High-Beta Plasma from a physically pipe-connected Hulking
// Fusion Reactor into grid electricity. Needs BOTH a piped connection to a
// reactor with plasma to give, and its own wire/pole adjacency — same
// deadlock-avoidance shape as SteamTurbineSystem (the ring IS the supply
// for its own network, so gating on e.powered would never turn it on).
const MHDDeceleratorRingSystem = (() => {
  let totalPowerGenerated = 0;

  // Footprint is 38×14 (19×7, and 12×4 before that - the resizes — rings already in a save
  // keep their saved size). HIGH-BETA IN sits at the inlet end of the duct,
  // on the duct's axis. The sprite (renderMHDDeceleratorRing) is drawn in
  // its unrotated frame and then turned, so at 90°/270° the inlet lands on
  // the top/bottom face in the column the turned axis passes through: rot 1
  // turns the frame clockwise (col+w-1-axis), rot 3 counter-clockwise
  // (col+axis). These used the long-axis midpoint before, which put the
  // stub off the side of the axis-swapped footprint.
  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || 38, h = e.height || 14;
    const axis = Math.floor(Math.min(w, h) / 2);
    let highBetaIn;
    if (rot === 0)      highBetaIn = { c: e.col - 1,            r: e.row + axis };
    else if (rot === 1) highBetaIn = { c: e.col + w - 1 - axis, r: e.row - 1 };
    else if (rot === 2) highBetaIn = { c: e.col + w,            r: e.row + axis };
    else                highBetaIn = { c: e.col + axis,         r: e.row + h };
    return { highBetaIn };
  }

  // Deliberately does NOT require the reactor's own e.powered here — the MHD
  // Ring is that reactor's own electrical supply on a shared network, so
  // "reactor needs power, but its power comes from the ring, which needs the
  // reactor to already have power" is a real deadlock (confirmed by direct
  // reproduction): any momentary network brownout drops reactor.powered to
  // false, which would make the ring see "not connected" and refuse to draw
  // the ALREADY-BANKED highBeta buffer it's sitting on, permanently latching
  // both off until some unrelated generator recovers the network on its own.
  // A buffered fuel tank should still be drainable through a physical pipe
  // even while the tank's own control power is briefly out — the reactor's
  // own tick() already correctly gates NEW production on e.powered; this
  // check only gates access to fuel already produced.
  function hasHighBetaPipe(e) {
    const { highBetaIn } = getStubs(e);
    // Not until the plasma has visibly run down the line to HIGH-BETA IN.
    if (!pipeArrivedAt(highBetaIn.c, highBetaIn.r, 'highbeta')) return { found: false };
    const run = pipeRun(highBetaIn.c, highBetaIn.r, 'highbeta');
    for (let j = 0; j < run.pn; j++) {
      const nb = run.pe[j], c = run.ptc[j], r = run.ptr[j];
      if (nb.type === T.HULKINGFUSIONREACTOR && (nb._highBeta || 0) > 0
          && atOutPort(HulkingFusionReactorSystem.getStubs(nb).highBetaOut, c, r)) return { found: true, source: nb };
      // The Advanced Fusion Reactor streams ions out of either ION OUT.
      if (nb.type === T.ADVFUSIONREACTOR && (nb._highBeta || 0) > 0) {
        const s = AdvancedFusionReactorSystem.getStubs(nb);
        if (atOutPort(s.ionOutA, c, r) || atOutPort(s.ionOutB, c, r)) return { found: true, source: nb };
      }
    }
    return { found: false };
  }

  function hasWireConnection(e) {
    for (const n of GridManager.getNeighbours(e.col, e.row)) {
      const nb = n.entity;
      // A wire still counts when a pipe or belt has been laid over it: the
      // tile then reads as the pipe, with the wire carried underneath.
      if (nb && (nb.type === T.WIRE || nb.type === T.POLE || nb._underWire)) return true;
    }
    return false;
  }

  return {
    tick(e, dt) {
      const def = EntityDefs[T.MHDRING];
      if (!def) return;

      const pipeResult = hasHighBetaPipe(e);
      e._highBetaConnected = pipeResult.found;
      e._hasPower           = hasWireConnection(e);

      if (!pipeResult.found || !e._hasPower || e._lightningDamaged) {
        e._generating    = false;
        e._currentOutput = 0;
        return;
      }

      const reactor = pipeResult.source;
      const avail   = reactor._highBeta || 0;

      // Frozen while paused (dt === 0) — otherwise draw below computes to 0
      // and the ratio ternary (draw > 0 ? ... : 1) would force ratio to 1
      // regardless of avail, reporting full output even with an empty
      // buffer (mirrors HulkingFusionReactorSystem's own dt<=0 guard).
      if (dt <= 0) {
        e._generating    = avail > 0;
        e._currentOutput = e._generating ? def.powerOutput * HulkingFusionReactorSystem.getMultiplier(reactor) * WeatherEventSystem.getMagnetMult(e.networkId) : 0;
        return;
      }

      const draw = (def.highBetaDraw || 1000) * dt;

      // Proportional draw/output — same reasoning as HulkingFusionReactorSystem's
      // plasma intake: an all-or-nothing "buffer must already hold a full
      // tick's worth or output nothing" cliff flickers between full output
      // and zero even when the reactor is genuinely supplying a healthy
      // average. Scale output down instead of cutting it off entirely.
      const ratio = draw > 0 ? Math.min(1, avail / draw) : 1;
      if (ratio <= 0) {
        e._generating    = false;
        e._currentOutput = 0;
        return;
      }

      reactor._highBeta -= draw * ratio;
      e._generating    = true;
      e._currentOutput = def.powerOutput * ratio * HulkingFusionReactorSystem.getMultiplier(reactor) * WeatherEventSystem.getMagnetMult(e.networkId);
      totalPowerGenerated += e._currentOutput * dt;
    },

    isGenerating(e) { return !!(e._generating); },
    getTotalPower()  { return totalPowerGenerated; },
    loadTotalPower(v) { if (v !== undefined) totalPowerGenerated = v; },
    getStubs,
  };
})();
