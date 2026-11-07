/* ═══════════════════════════════════════════════════════════════════
   ADVANCED FUSION REACTOR SYSTEM
   The D-He3 stellarator (48×48), following HulkingFusionReactorSystem's
   shape: magnets (cooling, helium charge, quench), a startup surge, then a
   burn of D-He3 pellets (belt, PELLETS IN) into an ion stream buffered for
   the MHD Rings on ION OUT A/B. D-He3 only: D-T pellets on the belt are
   refused. Aneutronic, so no blanket and no steam. The converters' waste
   heat goes out on CRYO IN; short of Cryogenic Coolant, the ion stream
   derates to uncooledOutputFrac rather than stopping.

   Ports, in the unrotated frame, mapped with the same transpose / mirror /
   quarter-turn convention as _plantFrame and HulkingFusionReactorSystem:
     left face   — PELLETS IN (belt, D-He3 pellets), mid-face
     right face  — ION OUT A / ION OUT B (pipes to MHD Rings), at 30% / 70%
     top face    — LHe IN (30%), HE ASH OUT (70%)
     bottom face — CRYO IN (Cryogenic Coolant, from Cryogenic Cooling
                   Towers), mid-face: carries the waste heat the direct
                   converters can't turn into power
   Cooling is the price of the step up: the magnets boil off liquid helium
   six times as fast as the Fusion Reactor's (two or three Cryo Plants), and
   the converters want two Cryogenic Cooling Towers' coolant on top.

   Magnets: the same model as the Fusion Reactor's (shared FUSION_MAGNET_*
   temperatures), but its quench is far worse. These coils store vastly more
   energy, and when they lose superconductivity it all has to go somewhere:
     • they warm twice as fast without cooling (~22s to a quench, not 45s);
     • 90% of the helium charge blows out, not 60%;
     • the magnets spike to 150 K, not 90 K, so the cool-down is longer;
     • the coil leads arc: buildings within a few tiles of the reactor can
       be wrecked by the discharge, and cable close in catches fire;
     • the coils need repair before they can be cooled again: a repair bill
       and a lock-out (quenchRepairSeconds) on top of the cool-down.
   Tunable on the def (quench* fields).
   ═══════════════════════════════════════════════════════════════════ */

const AdvancedFusionReactorSystem = (() => {
  let totalQuenches = 0;

  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || 48, h = e.height || 48;
    const lw = rot % 2 ? h : w, lh = rot % 2 ? w : h;
    const local = (x, y) =>
        rot === 1 ? { c: e.col + y,          r: e.row + x }
      : rot === 2 ? { c: e.col + lw - 1 - x, r: e.row + y }
      : rot === 3 ? { c: e.col + y,          r: e.row + lw - 1 - x }
      :             { c: e.col + x,          r: e.row + y };
    return {
      plasmaIn: local(-1, Math.floor(lh / 2)),
      ionOutA:  local(lw, Math.round(lh * 0.3)),
      ionOutB:  local(lw, Math.round(lh * 0.7)),
      cryoIn:   local(Math.round(lw * 0.3), -1),
      ashOut:   local(Math.round(lw * 0.7), -1),
      coolantIn: local(Math.floor(lw / 2), lh),
    };
  }

  // Every Cryo Plant on the LHe IN liquid-helium network (all of them, so
  // a spare plant covers for one that trips). Same walk as the Fusion
  // Reactor's findCryoPlants.
  function findCryoPlants(e) {
    const { cryoIn } = getStubs(e);
    // None until the liquid helium has visibly run down the line to LHe IN.
    // First fill only, as the Fusion Reactor's: a charged cryostat keeps its
    // plants when the line runs dry.
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

  const _name = (e) => (EntityDefs[T.ADVFUSIONREACTOR].label || 'Advanced Fusion Reactor') + (e._num !== undefined ? ` #${e._num}` : '');
  const _quenchTag = (e) => `afrquench-${e.col},${e.row}`;
  const _focus = (e) => () => {
    Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE);
    EntityInfoPanel.open(e);
  };

  function quench(e, def) {
    const cap = def.heliumChargeCap || 2400;
    const vented = (e._heCharge || 0) * (def.quenchVentFrac ?? 0.9);
    e._heCharge      = Math.max(0, (e._heCharge || 0) - vented);
    e._magnetK       = Math.max(e._magnetK || 0, def.quenchSpikeK || 150);
    e._started       = false;
    e._generating    = false;
    e._surgeProgress = 0;
    e._quenchVent    = 7;                                   // seconds of vent plume + arcing on the sprite
    e._quenchCount   = (e._quenchCount || 0) + 1;
    e._coilRepair    = def.quenchRepairSeconds || 180;     // coils locked out of cooling until repaired
    totalQuenches++;
    if (typeof FieldCoreSystem !== 'undefined') FieldCoreSystem.quench(e);   // its Field Cores quench with it

    // The stored field energy dumps through the coil leads.
    const rTiles = def.quenchArcRadius || 8;
    const wrecked = (typeof LightningDamageSystem !== 'undefined' && LightningDamageSystem.quenchDischarge)
      ? LightningDamageSystem.quenchDischarge(e, rTiles) : 0;
    const bill = def.quenchRepairCost || 350000;
    if (typeof Economy !== 'undefined') Economy.spend(bill);
    if (typeof Camera !== 'undefined') Camera.shake?.(6);
    SFX.lightningExplosion?.(0.8);
    setTimeout(() => SFX.thunder?.(0.7), 400);

    NotificationStack.dismissTag(_quenchTag(e));
    NotificationStack.push({
      icon: '🧲', title: 'Stellarator quench',
      message: `${_name(e)}'s magnets warmed past ${FUSION_MAGNET_QUENCH_K} K and quenched. The plasma is out, `
             + `${Math.round(vented)} of ${cap} u of liquid helium blew out of the vents, and the coil leads arced`
             + (wrecked ? `, wrecking ${wrecked} building${wrecked === 1 ? '' : 's'} nearby.` : '.')
             + ` Coil repairs cost ${formatMoney(bill)} and take ${Math.round(e._coilRepair / 60)} min before the magnets can be cooled again.`,
      color: '#ff5040', border: '#a02010', tag: _quenchTag(e), glow: true,
      onClick: _focus(e),
    });
  }

  // Cooling, helium charge and quench. Runs every tick whether or not the
  // reactor is burning, so a freshly built one cools down and fills.
  function tickMagnets(e, def, dt) {
    const cap = def.heliumChargeCap || 2400;
    if (e._magnetK === undefined)  e._magnetK  = FUSION_MAGNET_AMBIENT_K;
    if (e._heCharge === undefined) e._heCharge = 0;

    const plants = findCryoPlants(e);
    e._cryoLinked  = plants.length > 0;
    e._cryoRunning = plants.some(p => p._running);
    e._cryoPlants  = plants.length;
    if (e._quenchVent > 0) e._quenchVent = Math.max(0, e._quenchVent - dt);
    if (dt <= 0) return;

    if (e._coilRepair > 0) e._coilRepair = Math.max(0, e._coilRepair - dt);
    const repairing = e._coilRepair > 0;

    // Top the cryostat up from the plants' buffers, fullest first. Not while
    // the coils are under repair: the cryostat is open.
    if (!repairing) {
      let room = Math.min(cap - e._heCharge, (def.heliumFillPerSec || 60) * dt);
      for (const p of plants.slice().sort((a, b) => (b._liquidHe || 0) - (a._liquidHe || 0))) {
        if (room <= 0) break;
        const take = Math.min(room, p._liquidHe || 0);
        if (take > 0) { p._liquidHe -= take; e._heCharge += take; room -= take; }
      }
    }
    if (e._started) e._heCharge = Math.max(0, e._heCharge - (def.heliumBoilOff || 6) * dt);
    // Installed Field Cores are cold magnets too, running or not.
    if (typeof FieldCoreSystem !== 'undefined') e._heCharge = Math.max(0, e._heCharge - FieldCoreSystem.boilOff(e) * dt);

    e._coolingOK = !repairing && e._cryoRunning && e._heCharge >= cap * FUSION_MIN_CHARGE_FRAC;
    if (e._coolingOK) {
      const rate = 0.5 + 0.02 * (e._magnetK - FUSION_MAGNET_OPERATING_K);
      e._magnetK = Math.max(FUSION_MAGNET_OPERATING_K, e._magnetK - rate * dt);
    } else {
      e._magnetK = Math.min(FUSION_MAGNET_AMBIENT_K, e._magnetK + (def.magnetWarmRate || 0.2) * dt);
    }

    if (e._started && e._magnetK >= FUSION_MAGNET_QUENCH_K) quench(e, def);
  }

  function magnetsReady(e, def) {
    const cap = def.heliumChargeCap || 2400;
    return !(e._coilRepair > 0)
        && (e._magnetK ?? FUSION_MAGNET_AMBIENT_K) <= FUSION_MAGNET_READY_K
        && (e._heCharge || 0) >= cap * 0.95;
  }

  // ── Fuel ─────────────────────────────────────────────────────────
  // BFS back along pellet belts from PELLETS IN to a D-He3 source:
  //   • a Fusion Fuel Plant's D-He3 OUT (the split; belt flag
  //     _isHe3PelletConveyor, buffer _he3Pellets), or a Storage Container
  //     banking 'he3pellets';
  //   • legacy: a pre-split plant still on D-He3 (its main PELLETS OUT), or
  //     a bin of 'pellets' marked D-He3.
  // A D-T source on the belt is noted (e._wrongFuel) so the panel can say
  // why it won't light, but never burned: this machine is D-He3 only. Not
  // gated on the source's power, like the Fusion Reactor's lookup: banked
  // pellets are still drawable while a plant's control power blinks.
  // Every stocked source on the belt, nearest first (`sources`), not just the
  // first: with several Fuel Plants on one line the nearest one holds only a
  // tick's worth at a time, and stopping at it left the rest sitting full
  // while the reactor ran on one plant's output.
  function findPelletSource(e) {
    const { plasmaIn } = getStubs(e);
    const visited = new Set();
    const queue = [{ c: plasmaIn.c, r: plasmaIn.r, pc: null, pr: null }];
    let wrongFuel = false;
    let empty = null;   // a plant on the belt with nothing in its hopper right now
    let linked = false; // the belt reaches a D-He3 source at all, stocked or not
    const sources = [];
    const add = (source, field, kind) => { if (!sources.some(s => s.source === source && s.field === field)) sources.push({ source, field, kind }); };
    while (queue.length) {
      const { c, r, pc, pr } = queue.shift();
      const key = `${c},${r}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const ent = GridManager.getEntity(c, r);
      if (!ent) continue;
      if (ent.type === T.FUSIONFUELPLANT) {
        const s = FusionFuelPlantSystem.getStubs(ent);
        if (arrivedByPort(s.he3PelletOut, pc, pr) || (ent._fuelMode === 'dhe3' && arrivedByPort(s.plasmaOut, pc, pr))) linked = true;
        if ((ent._he3Pellets || 0) > 0 && arrivedByPort(s.he3PelletOut, pc, pr)) { add(ent, '_he3Pellets', 'he3pellets'); continue; }
        if ((ent._plasma || 0) > 0 && arrivedByPort(s.plasmaOut, pc, pr)) {
          if (ent._fuelMode === 'dhe3') { add(ent, '_plasma', 'pellets'); continue; }
          wrongFuel = true;
        }
        if (!empty && !(ent._he3Pellets > 0) && arrivedByPort(s.he3PelletOut, pc, pr)) empty = { source: ent, field: '_he3Pellets', kind: 'he3pellets' };
        else if (!empty && !(ent._plasma > 0) && ent._fuelMode === 'dhe3' && arrivedByPort(s.plasmaOut, pc, pr)) empty = { source: ent, field: '_plasma', kind: 'pellets' };
        continue;
      }
      // A Storage Container reached through its OUT stub is this reactor's
      // supply even while it is empty: it is passing on what comes in.
      if (ent.type === T.SOLIDSTORAGE && (pc === null || SolidStorageSystem.isOut(ent, pc, pr))
          && (!ent._solidType || ent._solidType === 'he3pellets' || (ent._solidType === 'pellets' && ent._pelletMode === 'dhe3'))) linked = true;
      if (SolidStorageSystem.isSourceOf(ent, 'he3pellets', pc, pr)) { add(ent, '_stored', 'he3pellets'); continue; }
      if (SolidStorageSystem.isSourceOf(ent, 'pellets', pc, pr)) {
        if (ent._pelletMode === 'dhe3') { add(ent, '_stored', 'pellets'); continue; }
        wrongFuel = true; continue;
      }
      if (isConveyorTile(ent) && (ent._isHe3PelletConveyor || ent._isPlasmaFuelConveyor)) {
        for (const [dc, dr] of beltSteps(c, r)) queue.push({ c: c + dc, r: r + dr, pc: c, pr: r });
      }
    }
    if (sources.length) return { found: true, ...sources[0], sources, linked: true };
    return { found: false, wrongFuel, empty, linked };
  }

  // Pellets actually delivered, smoothed: the reactor takes each one the
  // moment it arrives, so on any single tick its source is usually empty and
  // "is there fuel right now" flickers. What it has received over the last
  // couple of game-seconds is what it is really running on (and what the
  // belt is showing arriving).
  const FED_GRACE = 2.5;   // game-seconds without a pellet before it counts as unfed
  function notePellets(e, def, taken, dt) {
    if (!(dt > 0)) return;
    const t = typeof DayNight !== 'undefined' ? DayNight.getElapsed() : 0;
    if (taken > 0) e._fedAt = t;
    const rate = taken / dt, k = Math.min(1, dt * 0.5);
    e._pelletRate = (e._pelletRate ?? rate) + (rate - (e._pelletRate ?? rate)) * k;
    e._burnRatio  = Math.min(1, e._pelletRate / (def.plasmaPerSec || 0.4));
  }
  const recentlyFed = (e) => e._fedAt !== undefined && typeof DayNight !== 'undefined' && DayNight.getElapsed() - e._fedAt < FED_GRACE;

  // ── Ion stream out ───────────────────────────────────────────────
  // Flags the pipes off both ION OUTs as carrying the ion stream (fluid
  // 'highbeta', the MHD Ring's). HulkingFusionReactorSystem clears every
  // pipe's flag once a tick before the reactors re-mark them, and this ticks
  // after it. Unconditional, so a piped ring finds its source again the
  // moment the reactor relights. `_highBetaFlow` is what the pipes draw:
  // ions only once the reactor is lit and streaming, so a line run to the
  // rings before startup reads empty.
  function markIonPipes(e) {
    const s = getStubs(e);
    const flowing = !!e._started && (!!e._generating || (e._highBeta || 0) > 1);
    let any = false;
    for (const stub of [s.ionOutA, s.ionOutB]) {
      const run = pipeRun(stub.c, stub.r, 'highbeta');
      for (let i = 0; i < run.n; i++) { run.pipe[i]._highBetaActive = true; if (flowing) run.pipe[i]._highBetaFlow = true; }
      if (run.n > 0) any = true;
    }
    return any;
  }

  let totalPelletsBurned = 0;
  let totalIonStream     = 0;
  const _surgeTag = (e) => `afrsurge-${e.col},${e.row}`;

  return {
    getStubs,
    magnetsReady,
    tick(e, dt) {
      const def = EntityDefs[T.ADVFUSIONREACTOR];
      if (!def) return;
      if (e._started === undefined) e._started = false;
      const cap = def.highBetaCapacity || 120000;
      e._highBeta = Math.min(cap, e._highBeta || 0);

      const fuel = findPelletSource(e);
      // Fed means pellets have really arrived lately, not that the source
      // happened to hold one this tick (see notePellets).
      e._hasPlasma    = fuel.found || recentlyFed(e);
      e._pelletLinked = fuel.found || !!fuel.linked || !!fuel.empty;
      e._wrongFuel = !fuel.found && !!fuel.wrongFuel;

      tickMagnets(e, def, dt);
      const ready = magnetsReady(e, def);
      e._magnetsReady = ready;

      // Fusion ash back to the Cryo Plants whenever there's some banked, or
      // while burning (a plant on the line empties it between ticks).
      const ashCap = def.heliumAshCapacity || 400;
      e._heAsh = Math.min(ashCap, e._heAsh || 0);
      e._ashPipeOut = (e._heAsh > 0 || e._started) && HeliumSystem.markHeliumPipes(getStubs(e).ashOut, def.heliumAshPerSec);
      e._ionPipeOut = markIonPipes(e);

      // Startup surge — the Fusion Reactor's rule (see its tick): once the
      // magnets are cold and charged and there's D-He3 fuel, demand the surge
      // and hold it startupSurgeSeconds. The network was solved against last
      // tick's demand, so a tick only counts if the surge was already
      // demanded; if the grid can't carry it the shortfall blacks out the
      // network and the reactor stands down for startupRetrySeconds. On a
      // contract job site the client supplies a small ignition pulse instead.
      const onSite = typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite && ContractSystem.isAtSite();
      const surge = onSite ? Math.min(200, def.startupSurge || 12000) : (def.startupSurge || 12000);
      e._surgeKW = surge;
      const surgeSecs = def.startupSurgeSeconds || 6;
      const surgeWasDemanded = e._activePowerInput === surge;
      if (e._surgeCooldown > 0) e._surgeCooldown = Math.max(0, e._surgeCooldown - dt);
      if (!e._started && surgeWasDemanded) {
        if (!e.powered && dt > 0) {
          e._surgeProgress = 0;
          e._surgeCooldown = def.startupRetrySeconds || 25;
          NotificationStack.dismissTag(_surgeTag(e));
          NotificationStack.push({
            icon: '⚡', title: 'Stellarator startup failed',
            message: `The grid couldn't carry ${_name(e)}'s ${formatPower(surge)} startup surge, and the shortfall blacked out its network. `
                   + `It will try again in ${e._surgeCooldown}s; add generation or charged batteries to that network first.`,
            color: '#ffb040', border: '#a05010', tag: _surgeTag(e), onClick: _focus(e),
          });
        } else if (ready && fuel.found) {
          e._surgeProgress = (e._surgeProgress || 0) + dt;
        } else {
          e._surgeProgress = 0;
        }
      }
      const wantSurge = !e._started && ready && fuel.found && !(e._surgeCooldown > 0) && (e._surgeProgress || 0) < surgeSecs;
      e._activePowerInput = wantSurge ? surge : undefined;

      e._generating = false;
      // An empty plant is still this reactor's plant: claim a share of what it
      // makes next, or a neighbour ticking first takes every pellet (BeltShare).
      if (e.powered && !fuel.found && fuel.empty && dt > 0 && e._started && !(e._highBeta >= cap || e._idleFull)) {
        BeltShare.cap(fuel.empty.source, e, 0, (def.plasmaPerSec || 0.5) * dt, fuel.empty.kind);
      }
      // Running, but nothing in the source this tick: a starved burn, not a
      // stop. It counts against the burn rate, and the reactor still reads as
      // running while pellets keep arriving.
      const running = e._started && e.powered && !(e._highBeta >= cap || e._idleFull);
      if (!e.powered || !fuel.found) {
        if (running) { notePellets(e, def, 0, dt); e._generating = recentlyFed(e); }
        return;
      }

      if (!e._started) {
        if (!ready || (e._surgeProgress || 0) < surgeSecs) return;
        e._started = true;
        e._surgeProgress = 0;
        e._activePowerInput = undefined;
        NotificationStack.dismissTag(_surgeTag(e));
      }

      // The ion stream backs up when nothing draws it: idle on standby.
      if (e._highBeta >= cap || e._idleFull) { e._generating = true; return; }
      if (dt <= 0) { e._generating = true; return; }

      // Proportional pellet draw, like the Fusion Reactor's, so a supply
      // that averages out healthy doesn't flicker the burn on and off.
      // Down the line, nearest source first, until this tick's need is met.
      // Field Cores raise the draw (FieldCoreSystem.fuelFactor); the base
      // burn is filled first, so a short supply costs the boost, not the base.
      const base = (def.plasmaPerSec || 0.5) * dt;
      const need = base * (typeof FieldCoreSystem !== 'undefined' ? FieldCoreSystem.fuelFactor(e) : 1);
      let taken = 0;
      for (const src of fuel.sources || [fuel]) {
        if (taken >= need - 1e-9) break;
        const avail = src.source[src.field] || 0;
        const kind  = src.kind || 'he3pellets';
        const share = BeltShare.cap(src.source, e, avail, need - taken, kind);   // claimed whether or not the stream has arrived
        const got   = BeltCargo.reach(src.source, e, kind) ? Math.min(avail, need - taken, share) : 0;
        if (got <= 0) continue;
        src.source[src.field] -= got;
        BeltCargo.moved(src.source, e, kind, got);
        if (src.field === '_stored' && src.source._stored <= 0.001) { src.source._stored = 0; src.source._solidType = null; }
        taken += got;
      }
      notePellets(e, def, taken, dt);
      if (taken <= 0) { e._generating = recentlyFed(e); return; }
      totalPelletsBurned += taken;
      const ratio = Math.min(1, taken / base);
      if (need > base) FieldCoreSystem.noteFuel(e, Math.max(0, taken - base), need - base, dt);
      e._heAsh = Math.min(ashCap, e._heAsh + (def.heliumAshPerSec || 0.8) * dt * ratio);
      e._generating = true;

      // The converters' waste heat goes out on CRYO IN; short of it they
      // derate rather than trip (NuclearSystem.resolveCooling sets _cooled).
      const coolFactor = e._cooled ? 1 : (def.uncooledOutputFrac ?? 0.3);
      e._coolFactor = coolFactor;
      const produced = (def.highBetaPerSec || 4800) * dt * ratio * coolFactor;
      e._highBeta = Math.min(cap, e._highBeta + produced);
      totalIonStream += produced;
    },
    getTotalQuenches()      { return totalQuenches; },
    getTotalPelletsBurned() { return totalPelletsBurned; },   // gates Hyperion stage 1
    loadTotalPelletsBurned(v) { if (v !== undefined) totalPelletsBurned = v; },
    getTotalIonStream()     { return totalIonStream; },
  };
})();
