/* ═══════════════════════════════════════════════════════════════════
   FUSION FUEL PLANT SYSTEM
   Freezes fusion fuel into pellets for the reactor's pellet injector —
   real tokamaks are fuelled by firing frozen pellets into the plasma.
   Two fuels, made side by side (the split):
     D-T   — Deuterium Gas (pipe, from Isotopic Wash Tower) + Tritium (pipe,
             bred in the Fusion Reactor's lithium blanket, TRITIUM OUT).
             The reactor can't breed tritium until it's burning tritium, so
             the loop is started by a Tritium Breeding Facility
             (tritium_breeder_system.js), piped to the same TRITIUM IN.
             Out of PELLETS OUT, for the Fusion Reactor.
     D-He3 — Deuterium Gas + Helium-3 (pipe, from a Helium-3 Separator or a
             Gas Holder). Opens once the separator is unlocked. D-T is made
             first; D-He3 gets what's left of the plant's rate, capped at a
             quarter of it. Out of D-He3 OUT, for the Advanced Fusion
             Reactor; a separate cargo ('he3pellets') so the two never mix.
   Plants from before the split that were set to D-He3 keep running the old
   way (tickLegacyDhe3) until switched over from the panel.
   Deuterium input mirrors HaberBoschSystem.findGasSource; the tritium and
   helium-3 inputs are the same pipe BFS, ending on a producer whose outlet
   stub the walk reached.
   ═══════════════════════════════════════════════════════════════════ */

// Fuel plants in saves from before the D-T / D-He3 split made pellets from
// deuterium + lithium compound and fed an MHD Ring. They load in D-He3 mode
// with this much stored helium-3 (seconds of sim time), so a running MHD
// setup keeps running while the player builds a Helium-3 Separator or
// switches to D-T with Steam Turbines.
const FUSION_LEGACY_HE3_SECONDS = 3600;

const FusionFuelPlantSystem = (() => {
  let totalPlasmaProduced = 0;       // D-T pellets (and legacy D-He3 ones off the main output)
  let totalHe3PelletsProduced = 0;   // D-He3 pellets off the split's D-He3 OUT

  // Footprint is 24×22 (12×11, and 7×6 before that - the resizes — plants already in a save
  // keep their saved size). Each stub sits mid-face on its own face,
  // measured on the entity's actual (possibly axis-swapped) footprint.
  // TRITIUM IN is where the Lithium Compound belt used to arrive, so an
  // existing plant's port stays put; HE-3 IN takes the face opposite D₂ IN.
  // rot 0: tritium IN left  (col-1), D₂ IN top    (row-1), pellets OUT right  (col+w), He-3 IN bottom (row+h)
  // rot 1: tritium IN top   (row-1), D₂ IN right  (col+w), pellets OUT bottom (row+h), He-3 IN left   (col-1)
  // rot 2: tritium IN right (col+w), D₂ IN bottom (row+h), pellets OUT left   (col-1), He-3 IN top    (row-1)
  // rot 3: tritium IN bottom(row+h), D₂ IN left   (col-1), pellets OUT top    (row-1), He-3 IN right  (col+w)
  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || 24, h = e.height || 22;
    const midW = Math.floor(w / 2);
    const midH = Math.floor(h / 2);
    const L = { c: e.col - 1,    r: e.row + midH };
    const R = { c: e.col + w,    r: e.row + midH };
    const U = { c: e.col + midW, r: e.row - 1 };
    const D = { c: e.col + midW, r: e.row + h };
    const [tritiumIn, deuteriumIn, plasmaOut, he3In] =
        rot === 1 ? [U, R, D, L]
      : rot === 2 ? [R, D, L, U]
      : rot === 3 ? [D, L, U, R]
      :             [L, U, R, D];
    // D-He3 PELLETS OUT shares the pellets face, four tiles along from
    // PELLETS OUT toward the HE-3 IN face (the split's second output).
    const off = 4;
    const he3PelletOut =
        rot === 1 ? { c: plasmaOut.c - off, r: plasmaOut.r }
      : rot === 2 ? { c: plasmaOut.c,       r: plasmaOut.r - off }
      : rot === 3 ? { c: plasmaOut.c + off, r: plasmaOut.r }
      :             { c: plasmaOut.c,       r: plasmaOut.r + off };
    return { tritiumIn, deuteriumIn, plasmaOut, he3In, he3PelletOut };
  }

  // Every deuterium source on the D₂ IN line — Wash Towers through their
  // OUT, Gas Holders through their GAS OUT — pooled into one object whose
  // `_deuterium` reads the total and, when spent, draws the live towers first
  // and the holders last (the same order tritium is drawn in). It used to stop
  // at the first source the walk reached, so a holder on the same line as a
  // tower sat full and untouched while the plant ran short on the tower's
  // 2.1/s alone.
  function findDeuteriumSource(e) {
    const { deuteriumIn } = getStubs(e);
    // None until the gas has visibly run down the line to D₂ IN.
    if (!pipeArrivedAt(deuteriumIn.c, deuteriumIn.r, 'deuterium')) return { found: false };
    const run = pipeRun(deuteriumIn.c, deuteriumIn.r, 'deuterium');
    const towers = [], holders = [];
    for (let j = 0; j < run.pn; j++) {
      const nb = run.pe[j], c = run.ptc[j], r = run.ptr[j];
      // Deliberately does NOT require nb.powered — same reasoning as
      // MHDDeceleratorRingSystem.hasHighBetaPipe: a momentary brownout
      // on the Wash Tower's own network segment (or its powered flag
      // simply being frozen while the game is paused, since
      // PowerNetwork.tick doesn't run then) shouldn't block drawing an
      // already-banked deuterium buffer it's sitting on. Its own tick()
      // already gates NEW production on powered; this only gates access
      // to gas already produced.
      if (nb.type === T.WASHTOWER && (nb._deuterium || 0) > 0
          && atOutPort(IsotopicWashTowerSystem.getStubs(nb).deuteriumOut, c, r)) { if (!towers.includes(nb)) towers.push(nb); continue; }
      if (GasStorageSystem.isSourceOf(nb, 'deuterium', c, r)) { if (!holders.includes(nb)) holders.push(nb); }
    }
    const all = [...towers, ...holders];
    if (!all.length) return { found: false };
    if (all.length === 1) return { found: true, source: all[0] };
    return { found: true, source: {
      get _deuterium() { return all.reduce((a, s) => a + (s._deuterium || 0), 0); },
      set _deuterium(v) {
        let take = this._deuterium - Math.max(0, v);
        for (const s of all) {
          if (take <= 0) break;
          const t = Math.min(take, s._deuterium || 0);
          s._deuterium = (s._deuterium || 0) - t;
          take -= t;
        }
      },
    } };
  }

  // Walk a pipe network of `fluid` from `stub` to a building of `type` whose
  // outlet (outStub(building)) is the tile the walk arrived from. Returns
  // every such building — tritium can come back from more than one reactor.
  function findPipedSources(stub, fluid, type, outStub) {
    // None until the gas has visibly run down the line to this IN.
    if (!pipeArrivedAt(stub.c, stub.r, fluid)) return [];
    const run = pipeRun(stub.c, stub.r, fluid);
    const sources = [];
    for (let j = 0; j < run.pn; j++) {
      const nb = run.pe[j];
      if (nb.type !== type) continue;
      const out = outStub(nb);
      if (out && out.c === run.ptc[j] && out.r === run.ptr[j] && !sources.includes(nb)) sources.push(nb);
    }
    return sources;
  }

  // Top up an on-site buffer from piped sources, taking from each in turn.
  function pullFrom(sources, field, room) {
    let got = 0;
    for (const s of sources) {
      if (room - got <= 0) break;
      const take = Math.min(room - got, s[field] || 0);
      if (take > 0) { s[field] -= take; got += take; }
    }
    return got;
  }

  // Clear both pellet-belt flags — called once per tick, right before the
  // per-plant tick loop below recomputes them.
  function clearPlasmaConveyorFlags() {
    for (const e of EntityRegistry.getByType(T.CONVEYOR)) { e._isPlasmaFuelConveyor = false; e._isHe3PelletConveyor = false; }
  }

  // Flag the belt run off an OUT stub as carrying this kind of pellet, with
  // its flow direction for the belt renderer.
  // The walk is the kept belt run (beltRun, resource_helpers.js): the same
  // breadth-first flood from the stub, so the same tiles and the same tile
  // each was reached from, without re-walking the belt every tick.
  function markBelt(e, out, flag, rate) {
    const midW = Math.floor((e.width || 24) / 2), midH = Math.floor((e.height || 22) / 2);
    const run = beltRun(out.c, out.r);
    let any = false;
    for (let i = 0; i < run.n; i++) {
      if (!run.belt[i]) continue;
      const tile = run.ent[i], c = run.c[i], r = run.r[i], p = run.par[i];
      tile[flag] = true;
      tile._flowDC = Math.sign(c - (p < 0 ? e.col + midW : run.c[p]));
      tile._flowDR = Math.sign(r - (p < 0 ? e.row + midH : run.r[p]));
      tile._flowRate = rate;
      any = true;
    }
    return any;
  }

  // Plants from before the split that were set to D-He3 keep working the old
  // way until the player switches them over (setFuelMode 'dt'): every pellet
  // is D-He3, out of the main PELLETS OUT, from helium-3 or the stock of it a
  // pre-split save was loaded with. Their belts still feed an MHD setup, so
  // turning them over silently would have stopped it.
  function tickLegacyDhe3(e, def, dt, deuteriumResult) {
    const cap = def.plasmaCapacity || 400;
    if (!e.powered || !e._hasDeuterium || !e._hasHe3) return;
    if (e._plasma >= cap || e._idleFull || dt <= 0) { e._generating = true; return; }
    const deuteriumNeed  = def.deuteriumPerSec * dt;
    const deuteriumRatio = Math.min(1, (deuteriumResult.source._deuterium || 0) / deuteriumNeed);
    const partnerNeed    = (def.he3PerSec || 1) * dt;
    const partnerRatio   = e._legacyHe3 > 0 ? 1 : Math.min(1, (e._he3 || 0) / partnerNeed);
    const ratio = Math.min(deuteriumRatio, partnerRatio);
    e._runRate = (e._runRate ?? ratio) + (ratio - (e._runRate ?? ratio)) * Math.min(1, dt * 0.5);
    e._limitedBy = ratio >= 0.995 ? null : deuteriumRatio <= partnerRatio ? 'deuterium' : 'helium-3';
    if (ratio <= 0) return;
    deuteriumResult.source._deuterium -= deuteriumNeed * ratio;
    if (!(e._legacyHe3 > 0)) e._he3 = Math.max(0, e._he3 - partnerNeed * ratio);
    const produced = def.plasmaPerSec * dt * ratio;
    e._plasma = Math.min(cap, e._plasma + produced);
    BeltCargo.produced(e, 'pellets', produced);
    e._generating = true;
    totalPlasmaProduced += produced;
  }

  function _plantName(e) {
    return (EntityDefs[T.FUSIONFUELPLANT].label || 'Fusion Fuel Plant') + (e._num !== undefined ? ` #${e._num}` : '');
  }
  const _legacyTag = (e) => `legacyhe3-${e.col},${e.row}`;

  // Old-save grace period for D-He3 fuel — counts down, warns once when
  // first seen (each load re-arms it) and again with five minutes left,
  // and stops mattering once a separator is actually supplying helium-3.
  function tickLegacyHe3(e, dt) {
    if (!(e._legacyHe3 > 0)) return;
    e._legacyHe3 = Math.max(0, e._legacyHe3 - dt);
    // Stands down once a separator is actually delivering (not merely because
    // the legacy stock itself counts as helium-3 on hand), or off D-He3.
    const supplied = e._he3Linked && (e._he3 || 0) > 0;
    if (supplied || e._fuelMode !== 'dhe3') { NotificationStack.dismissTag(_legacyTag(e)); return; }
    const low = e._legacyHe3 <= 300;
    if (e._legacyHe3Warned && (!low || e._legacyHe3WarnedLow)) return;
    e._legacyHe3Warned = true;
    if (low) e._legacyHe3WarnedLow = true;
    const mins = Math.max(1, Math.ceil(e._legacyHe3 / 60));
    NotificationStack.dismissTag(_legacyTag(e));
    NotificationStack.push({
      icon: '⚛', title: low ? 'Helium-3 stock running out' : 'Fusion fuel has changed',
      message: `${_plantName(e)} is making D-He3 pellets from stored helium-3; about ${mins} min left. `
             + 'Build a Helium-3 Separator on your helium gas and pipe it to HE-3 IN to keep the MHD Ring running, '
             + 'or switch the plant to D-T fuel and run the reactor\'s steam into Steam Turbines.',
      color: low ? '#ff5040' : '#ffb040', border: low ? '#a02010' : '#a05010', tag: _legacyTag(e), glow: low,
      onClick: () => {
        Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE);
        EntityInfoPanel.open(e);
      },
    });
  }

  return {
    clearPlasmaConveyorFlags,
    getStubs,

    // Switching fuel flushes the pellet hopper — the two pellet types don't mix.
    setFuelMode(e, mode) {
      if (mode !== 'dt' && mode !== 'dhe3') return;
      if ((e._fuelMode || 'dt') === mode) return;
      const flushed = Math.floor(e._plasma || 0);
      e._fuelMode = mode;
      e._plasma = 0;
      showToast(`⚛ ${_plantName(e)} switched to ${mode === 'dt' ? 'split output (D-T + D-He3)' : 'D-He3 fuel'}${flushed ? `: ${flushed} old pellets flushed` : ''}`,
                '#70f0ff', '#04141c', '#206070');
      SFX.click?.();
    },

    tick(e, dt) {
      const def = EntityDefs[T.FUSIONFUELPLANT];
      if (!def) return;

      const cap = def.plasmaCapacity || 400;
      e._plasma = e._plasma || 0;
      // On a contract job site the plant makes all-D-He3 out of its main
      // output, the pre-split way: the full-chain fusion job runs MHD Rings
      // through the Fusion Reactor (allowed D-He3 on site), has no tritium,
      // and its sites are too small for an Advanced Fusion Reactor.
      // (Since job sites took up the home fuel rule that means only a fusion
      // job accepted before they did, ContractSystem.legacyFusionJob; on any
      // other site the plant is D-T, as at home.)
      // Demo: the Star Power scenario is the same chain (no tritium, MHD Rings), so it runs this way too.
      const onSite = (typeof ContractSystem !== 'undefined' && !!ContractSystem.legacyFusionJob && ContractSystem.legacyFusionJob())
        || (typeof ScenarioSystem !== 'undefined' && ScenarioSystem.active());
      if (onSite) e._fuelMode = 'dhe3';
      else if (e._fuelMode !== 'dhe3') e._fuelMode = 'dt';
      const mode = e._fuelMode;

      const st = getStubs(e);
      const deuteriumResult = findDeuteriumSource(e);
      e._hasDeuterium = deuteriumResult.found;

      // Tritium back from the reactor(s) and/or bred by Tritium Breeding
      // Facilities, helium-3 from separator(s). Both top up on-site buffers,
      // so a short supply gap is covered. Reactors are drawn first: once the
      // blanket is running, the breeders' buffers back up and they idle.
      const reactors = findPipedSources(st.tritiumIn, 'tritium', T.HULKINGFUSIONREACTOR,
                                        r => HulkingFusionReactorSystem.getStubs(r).tritiumOut);
      const breeders = findPipedSources(st.tritiumIn, 'tritium', T.TRITIUMBREEDER,
                                        b => TritiumBreederSystem.getStubs(b).tritiumOut);
      // Gas Holders banking tritium, reached through their GAS OUT. Drawn
      // last, so a holder is the buffer that covers a gap in live supply.
      const holders  = findPipedSources(st.tritiumIn, 'tritium', T.GASSTORAGE,
                                        g => GasStorageSystem.isSourceOf(g, 'tritium') ? GasStorageSystem.getStubs(g).gasOut : null);
      const seps     = findPipedSources(st.he3In, 'helium3', T.HE3SEPARATOR,
                                        s => He3SeparatorSystem.getStubs(s).he3Out);
      const he3Holders = findPipedSources(st.he3In, 'helium3', T.GASSTORAGE,
                                        g => GasStorageSystem.isSourceOf(g, 'helium3') ? GasStorageSystem.getStubs(g).gasOut : null);
      e._tritiumLinked = reactors.length > 0 || breeders.length > 0 || holders.length > 0;
      e._tritiumFromBreeder = breeders.length > 0;
      e._tritiumFromHolder  = holders.length > 0 && !reactors.length && !breeders.length;
      e._he3Linked     = seps.length > 0 || he3Holders.length > 0;
      e._he3FromHolder = he3Holders.length > 0 && !seps.length;
      const tCap = def.tritiumCapacity || 400, hCap = def.he3Capacity || 300;
      e._tritium = Math.min(tCap, (e._tritium || 0) + pullFrom([...reactors, ...breeders, ...holders], '_tritium', tCap - (e._tritium || 0)));
      e._he3     = Math.min(hCap, (e._he3 || 0)     + pullFrom([...seps, ...he3Holders], '_he3', hCap - (e._he3 || 0)));
      e._hasTritium = e._tritium > 0;
      e._hasHe3     = e._he3 > 0 || e._legacyHe3 > 0;
      tickLegacyHe3(e, dt);

      // Mark both pellet output belts unconditionally — same convention as
      // LithiumProcessPlantSystem's compoundOut marking. D-T on PELLETS OUT
      // (_isPlasmaFuelConveyor), D-He3 on D-He3 OUT (_isHe3PelletConveyor):
      // Storage Containers tell the two kinds apart by these flags, the way
      // they tell the Reprocessing Plant's two products apart.
      e._plasmaConveyorOut = markBelt(e, st.plasmaOut, '_isPlasmaFuelConveyor', def.plasmaPerSec);
      e._he3PelletConveyorOut = markBelt(e, st.he3PelletOut, '_isHe3PelletConveyor', def.plasmaPerSec * (def.he3PelletShare || 0.25));

      e._generating = false;
      e._he3LineOpen = false;
      if (mode === 'dhe3') { tickLegacyDhe3(e, def, dt, deuteriumResult); return; }

      // ── Split production ──────────────────────────────────────────
      // Two lines share the plant's pellet rate and its deuterium:
      //   D-T   — with tritium on TRITIUM IN.
      //   D-He3 — opens once the Helium-3 Separator is unlocked, with helium-3
      //           on HE-3 IN. Never more than he3PelletShare of the plant's
      //           rate.
      // D-He3 used to go first with a fixed quarter, which left D-T 0.469/s
      // against a Fusion Reactor's 0.5/s: opening the D-He3 line dropped a
      // running reactor to 94% burn and one of its five MK2 turbines with it,
      // and on short deuterium D-He3 took nearly all of it. Now the reactor
      // keeps its pellets and D-He3 runs on the surplus (the rate left once
      // the D-T buffer and the reactor's core are full).
      // That let anything that takes every pellet (a Storage Container on
      // PELLETS OUT) hold D-T at the full rate and the D-He3 line at nothing.
      // So D-He3 now takes its share first, and D-T gets first call only
      // while a Fusion Reactor fed by this plant is below its core reserve
      // (it stamps _dtReactorShortAt). D-He3's share leaves D-T 0.55/s,
      // more than one reactor burns, so a stocked reactor never goes short.
      // A line whose buffer is full, or whose partner fuel is missing, stops
      // on its own and the other carries on, so a full container on one
      // output never stalls the plant. D-He3 never exceeds its share, so
      // helium-3 alone can't run the plant as a D-He3 factory.
      const hpCap = def.he3PelletCapacity || 200;
      e._he3Pellets = Math.min(hpCap, e._he3Pellets || 0);
      const he3Unlocked = typeof Progression === 'undefined' || Progression.isUnlocked(T.HE3SEPARATOR);
      const he3Ready = he3Unlocked && (e._he3 || 0) > 0;
      const dtRoom = e._plasma < cap, heRoom = e._he3Pellets < hpCap;
      e._he3LineOpen = he3Unlocked;
      const canDT = e._hasTritium && dtRoom, canHe = he3Ready && heRoom;
      if (!e.powered || !e._hasDeuterium || (!canDT && !canHe)) {
        if (e.powered && e._hasDeuterium && (e._hasTritium || he3Ready)) e._generating = true;   // buffers full: standing by
        return;
      }
      if (e._idleFull) { e._generating = true; return; }
      if (dt <= 0) { e._generating = true; return; }

      const rate  = def.plasmaPerSec || 0.625;
      const dPer  = (def.deuteriumPerSec || 5) / rate;     // deuterium per pellet (both fuels)
      const tPer  = (def.tritiumPerSec || 5) / rate;       // tritium per D-T pellet
      const hPer  = (def.he3PerSec || 1) / rate;           // helium-3 per D-He3 pellet
      const src   = deuteriumResult.source;
      let dLeft   = src._deuterium || 0;

      // Each line makes what it can within `limit` pellets this tick.
      const makeDT = (limit) => {
        if (!canDT) return 0;
        const n = Math.max(0, Math.min(limit, (e._tritium || 0) / tPer, dLeft / dPer, cap - e._plasma));
        e._tritium -= n * tPer;
        dLeft      -= n * dPer;
        e._plasma  += n;
        if (n > 0) BeltCargo.produced(e, 'pellets', n);
        totalPlasmaProduced += n;
        return n;
      };
      const makeHe = (limit) => {
        if (!canHe) return 0;
        const n = Math.max(0, Math.min(limit, (e._he3 || 0) / hPer, dLeft / dPer, hpCap - e._he3Pellets));
        e._he3 -= n * hPer;
        dLeft  -= n * dPer;
        e._he3Pellets += n;
        if (n > 0) BeltCargo.produced(e, 'he3pellets', n);
        totalHe3PelletsProduced += n;
        return n;
      };
      const heShare = rate * (def.he3PelletShare || 0.25) * dt;
      e._dtFirst = typeof DayNight !== 'undefined' && DayNight.getElapsed() - (e._dtReactorShortAt ?? -1e9) < 2;
      let dtMade, heMade;
      if (e._dtFirst) { dtMade = makeDT(rate * dt); heMade = makeHe(Math.min(heShare, rate * dt - dtMade)); }
      else            { heMade = makeHe(heShare);   dtMade = makeDT(rate * dt - heMade); }
      src._deuterium = Math.max(0, dLeft);

      // For the info panel: how hard the plant is running against its full
      // rate, smoothed, and which input is holding it back.
      const ratio = (heMade + dtMade) / (rate * dt);
      e._runRate = (e._runRate ?? ratio) + (ratio - (e._runRate ?? ratio)) * Math.min(1, dt * 0.5);
      e._dtRate  = (e._dtRate  ?? 0) + (dtMade / dt - (e._dtRate  ?? 0)) * Math.min(1, dt * 0.5);
      e._heRate  = (e._heRate  ?? 0) + (heMade / dt - (e._heRate  ?? 0)) * Math.min(1, dt * 0.5);
      const dShort = (src._deuterium || 0) < 0.001 && ratio < 0.995;
      const tShort = canDT && (e._tritium || 0) < 0.001 && dtMade < rate * dt - 1e-6;
      e._limitedBy = ratio >= 0.995 ? null : dShort ? 'deuterium' : tShort ? 'tritium' : null;
      e._generating = heMade + dtMade > 0;
    },
    getTotalPlasmaProduced() { return totalPlasmaProduced; },
    loadTotalPlasmaProduced(v) { if (v !== undefined) totalPlasmaProduced = v; },
    getTotalHe3PelletsProduced() { return totalHe3PelletsProduced; },
    loadTotalHe3PelletsProduced(v) { if (v !== undefined) totalHe3PelletsProduced = v; },
    LEGACY_HE3_SECONDS: FUSION_LEGACY_HE3_SECONDS,
  };
})();
