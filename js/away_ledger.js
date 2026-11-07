/* ═══════════════════════════════════════════════════════════════════
   AWAY LEDGER
   ─────────────────────────────────────────────────────────────────
   The player's city keeps producing while they are away on a contract.

   Only one world can be on the grid, and the home city is frozen whole
   while a job site stands on it (contract_system.js snapshotWorld): its
   machines do not tick. Re-running a day of home sim on the way back would
   take minutes on a big city and fire storms and meltdowns nobody saw, so
   the trip is accounted for the way the money already is: by rate.

   While the player is home, every few seconds of sim time the ledger
   samples
     • every storage: a Storage Container's stock, a Liquid Storage Tank's,
       a Gas Holder's;
     • every deposit a mine or jack is drawing down (coal, ore, oil);
     • every running production total the unlocks and achievements count
       (coal mined, coke made, plutonium separated, …: the same list a save
       writes).
   On leaving home the last LEDGER_WINDOW of samples becomes a rate per
   second for each. While away, the seconds are counted (the same sim dt
   the site runs on). Back home, each one moves on by rate × seconds:
   stores held between empty and full, deposits never below empty or
   above what they were, totals only up. A store whose kind changed inside
   the window (a container emptied and refilled with something else) is
   left alone. Survey scans run on by the seconds away, and report on arrival.
   ═══════════════════════════════════════════════════════════════════ */
const AwayLedger = (() => {
  const SAMPLE_SECS   = 5;     // sim seconds between samples at home
  const LEDGER_HOURS  = 3;     // game hours of samples a rate is measured over
  const MIN_WINDOW    = 20;    // sim seconds of samples needed before any rate is trusted

  // The production totals, as [get, set] pairs. Built on use: every module
  // here loads before the first sample is taken, but not before this file.
  // Modules are top-level consts, which are global but not on `window`.
  const g = (n) => { try { return Function(`return typeof ${n} !== 'undefined' ? ${n} : undefined`)(); } catch (_e) { return undefined; } };
  function totals() {
    const out = [];
    const add = (mod, get, set) => {
      const M = g(mod);
      if (!M || typeof M[get] !== 'function' || typeof M[set] !== 'function') return;
      out.push({ key: mod + '.' + get, get: () => +M[get]() || 0, set: (v) => M[set](v) });
    };
    add('CoalSystem', 'getTotalMined', 'loadTotalMined');
    add('SulfurSystem', 'getTotalMined', 'loadMined');
    add('UraniumSystem', 'getTotalMined', 'loadMined');
    add('LithiumSystem', 'getTotalMined', 'loadMined');
    add('RareEarthSystem', 'getTotalMined', 'loadMined');
    add('HeliumSystem', 'getTotalExtracted', 'loadExtracted');
    add('BiofuelSystem', 'getTotalCollected', 'loadTotalCollected');
    add('GeothermalSystem', 'getTotalSteam', 'loadTotalSteam');
    add('ChemicalSystem', 'getTotalAcidProduced', 'loadTotalAcidProduced');
    add('ElectrolyzerSystem', 'getTotalHydrogenProduced', 'loadTotalHydrogenProduced');
    add('FuelPlantSystem', 'getTotalRods', 'loadTotalRods');
    add('NuclearSystem', 'getTotalSpentFuel', 'loadTotalSpentFuel');
    add('NuclearSystem', 'getTotalGraphiteBurned', 'loadTotalGraphiteBurned');
    add('ReprocessingSystem', 'getTotalPlutonium', 'loadTotalPlutonium');
    add('ReprocessingSystem', 'getTotalSpentFuelConsumed', 'loadTotalSpentFuelConsumed');
    add('MoxPlantSystem', 'getTotalMox', 'loadTotalMox');
    add('LithiumProcessPlantSystem', 'getTotalCompoundProduced', 'loadTotalCompoundProduced');
    add('AtmosphereCollectorSystem', 'getTotalNitrogenProduced', 'loadTotalNitrogenProduced');
    add('HaberBoschSystem', 'getTotalAmmoniaProduced', 'loadTotalAmmoniaProduced');
    add('IsotopicWashTowerSystem', 'getTotalDeuteriumProduced', 'loadTotalDeuteriumProduced');
    add('FusionFuelPlantSystem', 'getTotalPlasmaProduced', 'loadTotalPlasmaProduced');
    add('FusionFuelPlantSystem', 'getTotalHe3PelletsProduced', 'loadTotalHe3PelletsProduced');
    add('AdvancedFusionReactorSystem', 'getTotalPelletsBurned', 'loadTotalPelletsBurned');
    add('HulkingFusionReactorSystem', 'getTotalPelletsBurned', 'loadTotalPelletsBurned');
    add('HulkingFusionReactorSystem', 'getTotalHighBetaProduced', 'loadTotalHighBetaProduced');
    add('HulkingFusionReactorSystem', 'getTotalSteamRaised', 'loadTotalSteamRaised');
    add('MHDDeceleratorRingSystem', 'getTotalPower', 'loadTotalPower');
    add('LeachPlantSystem', 'getTotalOxide', 'loadTotalOxide');
    add('SuperconductorMillSystem', 'getTotalTape', 'loadTotalTape');
    add('CokeOvenSystem', 'getTotalCoke', 'loadTotalCoke');
    add('CokeOvenSystem', 'getTotalGas', 'loadTotalGas');
    add('GraphiteFurnaceSystem', 'getTotalGraphite', 'loadTotalGraphite');
    add('CryoPlantSystem', 'getTotalLiquefied', 'loadTotalLiquefied');
    add('He3SeparatorSystem', 'getTotalHe3Produced', 'loadTotalHe3Produced');
    add('TritiumBreederSystem', 'getTotalTritiumBred', 'loadTotalTritiumBred');
    add('OilSystem', 'getTotalCrude', 'loadTotalCrude');
    add('OilSystem', 'getTotalFuelOil', 'loadTotalFuelOil');
    add('OilSystem', 'getTotalLpg', 'loadTotalLpg');
    add('HydroSystem', 'getTotalWaterExtracted', 'loadTotalWater');
    return out;
  }

  // The stores and deposits on the home map, as
  //   { host, obj, field, kind, amt, cap, deposit }.
  // `obj[field]` is what changes; `host` is the entity standing on the map
  // that it belongs to (a store is its own host; a deposit, buried under the
  // mine or jack drawing it, is reached through that). `kind` is what is in
  // a store: one whose kind changes between samples is not given a rate.
  // Deposits only ever fall.
  const DEPOSIT_FIELDS = ['coalAmount', '_oreAmount', '_pressure'];
  const MINE_TYPES = () => [T.COALMINE, T.COALMINE2, T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2,
    T.LITHIUMMINE, T.RAREEARTHMINE, T.PUMPJACK, T.PUMPJACK2].filter(Boolean);
  function stores() {
    const out = [];
    const solidCap = (typeof SolidStorageSystem !== 'undefined' && SolidStorageSystem.CAPACITY) || 1000;
    for (const e of EntityRegistry.getByType(T.SOLIDSTORAGE)) {
      if (e._clientOwned) continue;
      out.push({ host: e, obj: e, field: '_stored', kind: e._solidType || null, amt: e._stored || 0, cap: solidCap });
    }
    for (const e of EntityRegistry.getByType(T.OILSTORAGE)) {
      out.push({ host: e, obj: e, field: '_crude', kind: e._liquidType || null, amt: e._crude || 0, cap: 1000 });
    }
    if (typeof GasStorageSystem !== 'undefined') {
      const gasCap = GasStorageSystem.capacity ? GasStorageSystem.capacity() : 5000;
      for (const e of EntityRegistry.getByType(T.GASSTORAGE)) {
        const K = e._gasType && GasStorageSystem.KINDS[e._gasType];
        if (!K) continue;
        out.push({ host: e, obj: e, field: K.field, kind: e._gasType, amt: e[K.field] || 0, cap: gasCap });
      }
    }
    const seen = new Set();
    for (const type of MINE_TYPES()) {
      for (const m of EntityRegistry.getByType(type)) {
        const dep = m._linkedDeposit;
        if (!dep || seen.has(dep)) continue;
        const field = DEPOSIT_FIELDS.find(f => typeof dep[f] === 'number');
        if (!field) continue;
        seen.add(dep);
        out.push({ host: m, obj: dep, field, kind: 'deposit', amt: dep[field], cap: dep[field], deposit: true });
      }
    }
    return out;
  }
  const onMap = (e) => !!e && GridManager.getEntity(e.col, e.row) === e;
  const stations = () => [...EntityRegistry.getByType(T.SURVEY), ...EntityRegistry.getByType(T.SURVEY2)];

  let _tot = null;                 // the totals list, built on first use
  let samples = [];                // [{ t, tot: number[], st: Map(obj -> store) }]
  let clock = 0, sinceSample = SAMPLE_SECS;
  // Set on leaving home; applied and cleared on the way back.
  let pending = null;              // { secs, tot: [{key, rate}], st: [{host, obj, field, kind, rate, cap, deposit}] }

  function _snap() {
    if (!_tot) _tot = totals();
    const st = new Map();
    for (const s of stores()) st.set(s.obj, s);
    return { t: clock, tot: _tot.map(x => x.get()), st };
  }
  // What a store holds now ('deposit' for a deposit).
  function kindOf(r) {
    if (r.deposit) return 'deposit';
    const e = r.obj;
    return r.field === '_stored' ? (e._solidType || null) : r.field === '_crude' ? (e._liquidType || null) : (e._gasType || null);
  }

  // While home: one sample every SAMPLE_SECS of sim time, LEDGER_HOURS kept.
  function sample(dt) {
    if (!(dt > 0)) return;
    clock += dt; sinceSample += dt;
    if (sinceSample < SAMPLE_SECS) return;
    sinceSample = 0;
    samples.push(_snap());
    const keep = LEDGER_HOURS * ((typeof DayNight !== 'undefined' && DayNight.secondsPerGameHour?.()) || 50);
    while (samples.length > 2 && clock - samples[0].t > keep) samples.shift();
  }

  // Leaving home: turn the window into rates. The home city is still on the
  // grid when this runs.
  function depart() {
    // Survey scans need no rate, only the seconds, so a trip is always counted
    // however soon after arriving home it starts. A station with no power as
    // the player leaves stays stalled, as it would have at home.
    const noScan = stations().filter(e => !e.powered).map(e => [e.col, e.row]);
    pending = { secs: 0, tot: [], st: [], noScan };
    if (!samples.length) return;
    const now = _snap(), first = samples[0];
    const span = now.t - first.t;
    samples = []; sinceSample = SAMPLE_SECS;
    if (span < MIN_WINDOW) return;
    const tot = [];
    _tot.forEach((x, i) => {
      const rate = (now.tot[i] - first.tot[i]) / span;
      if (rate > 0) tot.push({ key: x.key, rate });
    });
    const st = [];
    for (const [obj, s] of now.st) {
      const was = first.st.get(obj);
      if (!was || was.kind !== s.kind || was.field !== s.field) continue;
      const rate = (s.amt - was.amt) / span;
      if (!rate) continue;
      if (s.deposit && rate > 0) continue;   // deposits are only drawn down
      st.push({ host: s.host, obj, field: s.field, kind: s.kind, rate, cap: s.cap, deposit: !!s.deposit });
    }
    pending = { secs: 0, tot, st, noScan };
  }

  // While away: count the trip.
  function away(dt) { if (pending && dt > 0) pending.secs += dt; }

  // Back home (the home city on the grid again): move everything on.
  // Returns a short summary for the caller, or null if nothing moved.
  function arrive() {
    const p = pending;
    pending = null;
    samples = []; sinceSample = SAMPLE_SECS;
    if (!p || !(p.secs > 0)) return null;
    if (!_tot) _tot = totals();
    let moved = 0;
    const noScan = new Set((p.noScan || []).map(([c, r]) => c + ',' + r));
    for (const e of stations()) {
      if (noScan.has(e.col + ',' + e.row)) continue;
      CoalSystem.catchUpScans(e, p.secs);
    }
    for (const r of p.tot) {
      const x = _tot.find(t => t.key === r.key);
      if (!x) continue;
      x.set(x.get() + r.rate * p.secs);
      moved++;
    }
    for (const r of p.st) {
      if (!onMap(r.host)) continue;          // demolished since (it can't be, home is frozen, but a load can lose it)
      const e = r.obj;
      // Still holding what it held when the rate was measured (or empty).
      if (kindOf(r) !== r.kind && (e[r.field] || 0) > 0.001) continue;
      const v = Math.max(0, Math.min(r.cap, (e[r.field] || 0) + r.rate * p.secs));
      e[r.field] = v;
      // A store that filled from empty takes on the kind it was filling with.
      if (!r.deposit && v > 0 && r.kind) {
        if (r.field === '_stored' && !e._solidType) e._solidType = r.kind;
        else if (r.field === '_crude' && !e._liquidType) e._liquidType = r.kind;
        else if (r.field !== '_stored' && r.field !== '_crude' && !e._gasType) e._gasType = r.kind;
      }
      moved++;
    }
    return moved ? { secs: p.secs, moved } : null;
  }

  // A trip in progress survives a save made on site: the rates and the
  // seconds so far. Stores are written by their host's tile (the home
  // entities are rebuilt from the save, so object references don't carry
  // over); a deposit is found again through its mine's _linkedDeposit.
  function serialise() {
    if (!pending) return null;
    return {
      secs: pending.secs,
      tot: pending.tot,
      noScan: pending.noScan,
      st: pending.st.map(r => ({ c: r.host.col, r: r.host.row, type: r.host.type, field: r.field, kind: r.kind, rate: r.rate, cap: r.cap, deposit: r.deposit })),
    };
  }
  // Called with the home city on the grid (the load puts it there first).
  function load(d) {
    pending = null; samples = []; sinceSample = SAMPLE_SECS;
    if (!d) return;
    const st = [];
    for (const s of d.st || []) {
      const host = GridManager.getEntity(s.c, s.r);
      if (!host || host.type !== s.type) continue;
      const obj = s.deposit ? host._linkedDeposit : host;
      if (!obj) continue;
      st.push({ host, obj, field: s.field, kind: s.kind, rate: s.rate, cap: s.cap, deposit: !!s.deposit });
    }
    pending = { secs: d.secs || 0, tot: d.tot || [], st, noScan: d.noScan || [] };
  }
  function hasPending() { return !!pending; }

  return { sample, depart, away, arrive, serialise, load, hasPending,
           debug: () => ({ samples: samples.length, clock, pending }) };
})();
