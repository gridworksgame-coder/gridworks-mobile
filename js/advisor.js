/* ═══════════════════════════════════════════════════════════════════
   ENGINEERING AUDIT
   A paid, on-demand survey of the whole grid. Where the Grid Analyzer
   explains one power network, this follows every pipe and every power
   line: it looks for the faults that are invisible from the surface (an
   inlet whose line is carrying the wrong fluid, an outlet that reaches
   nothing, a fluid that stops at a dead pipe, a holder plumbed backwards,
   a reactor with no cooling, a plant held back by one input, a building
   no wire reaches or a network shedding load) and writes each one up as
   what is wrong, why it matters, and numbered steps to put it right, with
   the tile coordinates to go to. Clicking a coordinate jumps there.

   Sold by the Engineering Office (T.ENGOFFICE, unlocked once 3 Nuclear
   Reactors have run at once): the audit button only shows while one stands, and an audit
   can only be commissioned while it has power. Each audit costs AUDIT_FEE,
   takes between ten minutes and an hour and a half of game time depending on how
   much there is to find, and is a snapshot: it does not pick up new
   problems as the world changes, and a fresh one is paid for again. That is
   deliberate. What it does do is cross items off: while a report is up the
   checks are quietly re-run (watchResolved), and a finding that no longer
   turns up, because the player fixed it, drops off the list.
   Working out why a chain is underperforming is part of the game; this is
   the consultant you pay when you would rather have the answer. The job in
   progress and the last report are saved with the world.

   Every check is a function in RULES that pushes findings; one that throws
   is skipped, so a single bad rule cannot take the report down with it.
   ═══════════════════════════════════════════════════════════════════ */

const Advisor = (() => {
  const AUDIT_FEE = 25000;
  let report = null;   // { day, time, findings: [{ sev, title, why, steps[], at }] }

  // ── Small helpers ───────────────────────────────────────────────
  const esc = (s) => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const nameOf = (e) => (EntityDefs[e.type]?.label || e.type) + (e._num !== undefined ? ` #${e._num}` : '');
  const centre = (e) => ({ c: Math.floor(e.col + (e.width || 1) / 2), r: Math.floor(e.row + (e.height || 1) / 2) });
  // A coordinate the player can click. Kept as a marker in the step text
  // and turned into a button when the panel is drawn.
  const loc = (c, r) => `⟦${Math.round(c)},${Math.round(r)}⟧`;
  const locOf = (e) => { const p = centre(e); return loc(p.c, p.r); };
  const num = (v, d = 0) => Number(v).toLocaleString(undefined, { maximumFractionDigits: d });
  const mins = (s) => s >= 90 ? `${Math.round(s / 60)} min` : `${Math.max(1, Math.round(s))} s`;
  const all = (type) => (type === undefined ? [] : [...EntityRegistry.getByType(type)]);
  const sys = (name) => { try { return (0, eval)(name); } catch (_e) { return null; } };
  const stubOf = (e, sysName, stub) => { const S = sys(sysName); return S && S.getStubs ? S.getStubs(e)[stub] : null; };

  // The pipe run on a stub: its tiles, and every building port it touches
  // ({ e, role: 'in' | 'out', c, r }, the tile being the pipe at the port).
  function runFrom(stub) {
    const out = { tiles: [], ports: [], piped: false };
    if (!stub || !GridManager.inBounds(stub.c, stub.r)) return out;
    if (!getPipe(GridManager.getEntity(stub.c, stub.r))) return out;
    out.piped = true;
    const seen = new Set(), queue = [[stub.c, stub.r]];
    for (let head = 0; head < queue.length && head < 6000; head++) {
      const [c, r] = queue[head];
      const key = c + ',' + r;
      if (seen.has(key)) continue;
      seen.add(key);
      out.tiles.push([c, r]);
      for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nc = c + dc, nr = r + dr;
        if (!GridManager.inBounds(nc, nr)) continue;
        const nb = GridManager.getEntity(nc, nr);
        if (!nb || getPipe(nb)) continue;
        const role = pipePortRole(nb, c, r);
        if (role && !out.ports.some(p => p.e === nb && p.role === role)) out.ports.push({ e: nb, role, c, r });
      }
      for (const [nc, nr] of pipeBfsCoords(c, r)) {
        if (GridManager.inBounds(nc, nr) && !seen.has(nc + ',' + nr) && getPipe(GridManager.getEntity(nc, nr))) queue.push([nc, nr]);
      }
    }
    return out;
  }

  // Closest pair of tiles between two sets: { a, b, dist } (Manhattan).
  function nearest(A, B) {
    let best = null;
    for (const a of A) for (const b of B) {
      const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
      if (!best || d < best.dist) best = { a, b, dist: d };
    }
    return best;
  }

  // ── What makes what, and where it is wanted ──────────────────────
  // Every pipe outlet worth auditing: the buffer behind it and the fluid.
  const OUTLETS = () => [
    { type: T.WASHTOWER,            sys: 'IsotopicWashTowerSystem',    stub: 'deuteriumOut', field: '_deuterium', fluid: 'deuterium', what: 'deuterium' },
    { type: T.HELIUMWELL,           sys: 'HeliumSystem',               stub: 'heliumOut',    field: '_helium',    fluid: 'helium',    what: 'helium' },
    { type: T.HELIUMWELL2,          sys: 'HeliumSystem',               stub: 'heliumOut',    field: '_helium',    fluid: 'helium',    what: 'helium' },
    { type: T.HE3SEPARATOR,         sys: 'He3SeparatorSystem',         stub: 'he3Out',       field: '_he3',       fluid: 'helium3',   what: 'helium-3' },
    { type: T.TRITIUMBREEDER,       sys: 'TritiumBreederSystem',       stub: 'tritiumOut',   field: '_tritium',   fluid: 'tritium',   what: 'tritium' },
    { type: T.HULKINGFUSIONREACTOR, sys: 'HulkingFusionReactorSystem', stub: 'tritiumOut',   field: '_tritium',   fluid: 'tritium',   what: 'bred tritium' },
    { type: T.HULKINGFUSIONREACTOR, sys: 'HulkingFusionReactorSystem', stub: 'ashOut',       field: '_heAsh',     fluid: 'helium',    what: 'helium ash', ash: true },
    { type: T.CRYOPLANT,            sys: 'CryoPlantSystem',            stub: 'liquidOut',    field: '_liquidHe',  fluid: 'liquidhe',  what: 'liquid helium' },
    { type: T.ELECTROLYZER,         sys: 'ElectrolyzerSystem',         stub: 'hydrogenStub', field: '_hydrogen',  fluid: 'hydrogen',  what: 'hydrogen' },
    { type: T.ATMOSCOLLECTOR,       sys: 'AtmosphereCollectorSystem',  stub: 'nitrogenStub', field: '_nitrogen',  fluid: 'nitrogen',  what: 'nitrogen' },
    { type: T.HABERBOSCH,           sys: 'HaberBoschSystem',           stub: 'ammoniaOut',   field: '_ammonia',   fluid: 'ammonia',   what: 'ammonia' },
  ];
  // Where each fluid is meant to end up (the first listed is preferred).
  const INLETS = () => ({
    deuterium: [[T.FUSIONFUELPLANT, 'FusionFuelPlantSystem', 'deuteriumIn', 'D₂ IN']],
    tritium:   [[T.FUSIONFUELPLANT, 'FusionFuelPlantSystem', 'tritiumIn', 'TRITIUM IN']],
    helium3:   [[T.FUSIONFUELPLANT, 'FusionFuelPlantSystem', 'he3In', 'HE-3 IN']],
    helium:    [[T.CRYOPLANT, 'CryoPlantSystem', 'heliumIn', 'HE IN']],
    liquidhe:  [[T.HULKINGFUSIONREACTOR, 'HulkingFusionReactorSystem', 'cryoIn', 'LHe IN']],
    hydrogen:  [[T.HABERBOSCH, 'HaberBoschSystem', 'hydrogenIn', 'HYDROGEN IN']],
    nitrogen:  [[T.HABERBOSCH, 'HaberBoschSystem', 'nitrogenIn', 'NITROGEN IN']],
    ammonia:   [[T.WASHTOWER, 'IsotopicWashTowerSystem', 'ammoniaIn', 'AMMONIA IN']],
  });

  // ── Every fluid, every port ───────────────────────────────────────
  // What each piped inlet takes, by building and stub (see _PIPE_PORTS in
  // resource_helpers.js for the stubs themselves). A function decides per
  // building, returning null where the port is not needed right now.
  const IN_FLUID = () => ({
    [T.STEAMTURBINE]:        { steamIn: 'steam' },
    [T.COOLINGTOWER]:        { hotIn: 'water' },
    [T.ELECTROLYZER]:        { waterStub: 'water' },
    [T.HABERBOSCH]:          { nitrogenIn: 'nitrogen', hydrogenIn: 'hydrogen' },
    [T.WASHTOWER]:           { waterIn: 'water', ammoniaIn: 'ammonia' },
    [T.FUSIONFUELPLANT]:     { deuteriumIn: 'deuterium', tritiumIn: e => e._fuelMode === 'dhe3' ? null : 'tritium' },
    [T.MHDRING]:             { highBetaIn: 'highbeta' },
    [T.CRYOPLANT]:           { heliumIn: 'helium' },
    [T.HE3SEPARATOR]:        { heliumIn: 'helium' },
    [T.LITHIUMPROCESSPLANT]: { waterIn: 'water' },
    [T.REPROCESSOR]:         { waterIn: 'water' },
    [T.SCMILL]:              { hydrogenIn: 'hydrogen', nitrogenIn: 'nitrogen' },
  });
  // What each piped outlet sends.
  const OUT_FLUID = () => ({
    [T.NUCLEARREACTOR]:       { steamOut: 'steam' },
    [T.ADVREACTOR]:           { steamOut: 'steam' },
    [T.COOLINGTOWER]:         { coldOut: 'cool' },
    [T.COOLINGTOWER2]:        { coldOut: 'cryocool' },
    [T.ELECTROLYZER]:         { hydrogenStub: 'hydrogen' },
    [T.COKEOVEN]:             { gasOut: 'hydrogen' },
    [T.ATMOSCOLLECTOR]:       { nitrogenStub: 'nitrogen' },
    [T.HABERBOSCH]:           { ammoniaOut: 'ammonia' },
    [T.WASHTOWER]:            { deuteriumOut: 'deuterium' },
    [T.HULKINGFUSIONREACTOR]: { tritiumOut: 'tritium', ashOut: 'helium',
                                highBetaOut: e => (e._coreMode || e._fuelMode) === 'dhe3' ? 'highbeta' : 'steam',
                                powerOut:    e => (e._coreMode || e._fuelMode) === 'dhe3' ? 'highbeta' : 'steam' },
    [T.HELIUMWELL]:           { heliumOut: 'helium' },
    [T.HELIUMWELL2]:          { heliumOut: 'helium' },
    [T.CRYOPLANT]:            { liquidOut: 'liquidhe' },
    [T.HE3SEPARATOR]:         { he3Out: 'helium3' },
    [T.TRITIUMBREEDER]:       { tritiumOut: 'tritium' },
    [T.GASSTORAGE]:           { gasOut: e => e._gasType || null },
  });
  const FLUID_NAMES = { water: 'water', steam: 'steam', cool: 'cooled water', cryocool: 'cryo-cooled water', hydrogen: 'hydrogen',
    nitrogen: 'nitrogen', ammonia: 'ammonia', deuterium: 'deuterium', tritium: 'tritium', helium: 'helium', helium3: 'helium-3',
    liquidhe: 'liquid helium', highbeta: 'high-beta plasma', acid: 'acid', oil: 'crude oil', fueloil: 'fuel oil', lpg: 'LPG' };
  const fluidName = (f) => FLUID_NAMES[f] || f;
  // Who makes each fluid, for "nothing on the map makes it yet".
  const MAKER = { water: 'Water Extractor', steam: 'reactor', cool: 'Cooling Tower', hydrogen: 'Electrolyzer', nitrogen: 'Atmosphere Collector',
    ammonia: 'Haber-Bosch Complex', deuterium: 'Isotopic Wash Tower', tritium: 'Tritium Breeding Facility', helium: 'Helium Well',
    helium3: 'Helium-3 Separator', liquidhe: 'Cryo Plant', highbeta: 'Fusion Reactor on D-He3' };
  const PORT_LABELS = { waterStub: 'WATER IN', hotIn: 'H₂O IN', steamIn: 'STEAM IN', he3In: 'HE-3 IN', deuteriumIn: 'D₂ IN', highBetaIn: 'HIGH-BETA IN' };
  const portLabel = (stub) => PORT_LABELS[stub] || stub.replace(/In$/, '').replace(/([A-Z])/g, ' $1').toUpperCase() + ' IN';
  // Buildings whose stopping takes power or fuel down with it.
  const IMPORTANT_IN = new Set([T.FUSIONFUELPLANT, T.HULKINGFUSIONREACTOR, T.CRYOPLANT, T.WASHTOWER, T.STEAMTURBINE,
                                T.NUCLEARREACTOR, T.ADVREACTOR, T.COOLINGTOWER, T.COOLINGTOWER2]);
  const NO_POWER_CHECK = new Set([T.WIRE, T.POLE, T.POWERTOWER].filter(Boolean));
  const CUSTOMER_TYPES = new Set([T.HOUSE, T.CABIN, T.COMMERCIAL, T.INDUSTRIAL, T.GOVBUILDING, T.CELLTOWER, T.FIBERHUB, T.TOWNHALL,
    T.CIVICCENTER, T.COURTHOUSE, T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB, T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT,
    T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ].filter(Boolean));

  const pipeAt = (c, r) => GridManager.inBounds(c, r) ? getPipe(GridManager.getEntity(c, r)) : null;
  const fluidAt = (c, r) => { const p = pipeAt(c, r); return p ? pipeCurrentFluid(p) : null; };
  // The fluid a port on a run belongs to (runFrom's ports carry the pipe
  // tile at the port as c, r).
  function portFluid(p) {
    if (p.e.type === T.WATEREXTRACTOR) return p.role === 'out' ? 'water' : null;
    const table = (p.role === 'out' ? OUT_FLUID() : IN_FLUID())[p.e.type];
    const P = _PIPE_PORTS[p.e.type], S = P && sys(P[0]);
    if (!table || !S || !S.getStubs) return null;
    const stubs = S.getStubs(p.e);
    for (const [name, want] of Object.entries(table)) {
      const s = stubs[name];
      if (s && s.c === p.c && s.r === p.r) return typeof want === 'function' ? want(p.e) : want;
    }
    return null;
  }
  const portCarries = (p, f) => fluidAt(p.c, p.r) === f;

  // Every pipe tile carrying a fluid, gathered once per audit pass.
  let carryCache = null;
  function pipesCarrying(f) {
    if (!carryCache) {
      carryCache = new Map();
      const addTile = (e) => {
        const p = getPipe(e); if (!p) return;
        const fl = pipeCurrentFluid(p); if (!fl) return;
        if (!carryCache.has(fl)) carryCache.set(fl, []);
        carryCache.get(fl).push([e.col, e.row]);
      };
      for (const t of [T.PIPE, T.UNDERGNDPIPE]) for (const e of all(t)) addTile(e);
      for (const t of [T.WIRE, T.CONVEYOR]) for (const e of all(t)) if (e._underPipe) addTile(e);
    }
    return carryCache.get(f) || [];
  }
  // Thin a long tile list for distance checks: every Nth tile is plenty.
  const thin = (a, n) => a.length <= n ? a : a.filter((_, i) => i % Math.ceil(a.length / n) === 0);

  // "Lay pipe from here to there" for a line that needs fluid f.
  function routeSteps(f, fromTiles, label, onLine) {
    const mine = new Set(fromTiles.map(t => t[0] + ',' + t[1]));
    const carrying = pipesCarrying(f).filter(t => !mine.has(t[0] + ',' + t[1]));
    const n = carrying.length ? nearest(thin(fromTiles, 200), thin(carrying, 4000)) : null;
    if (n) return [`Connect ${onLine ? 'this line' : label} at ${loc(n.a[0], n.a[1])} to the ${fluidName(f)} pipe at ${loc(n.b[0], n.b[1])}: ${n.dist > 1 ? `lay ${num(n.dist - 1)} tile${n.dist - 1 === 1 ? '' : 's'} of pipe between them` : 'drag a pipe from one onto the other'}. Keep it away from pipes carrying anything else, or they merge.`];
    const maker = MAKER[f];
    return [maker ? `Nothing is sending ${fluidName(f)} yet. Build a ${maker} (or get yours running) and pipe its outlet to ${label}.` : `Pipe a source of ${fluidName(f)} to ${label}.`];
  }

  // Why a producer on a line is putting nothing out.
  function idleReason(e, f) {
    if (!e.powered && !(e.type === T.GASSTORAGE)) return 'it has no power (see the power entries).';
    if (e._lightningDamaged) return 'it is damaged; repair it.';
    if (e.type === T.GASSTORAGE) {
      const have = GasStorageSystem.stored(e);
      return have <= 0.5 ? `it is empty. Nothing refills it: pipe a ${MAKER[f] || 'source'} into its GAS IN, or set its Drone or Truck Supply.` : 'it holds gas but is not releasing it; check its GAS OUT is the end on this line.';
    }
    if (e.type === T.HULKINGFUSIONREACTOR && !e._started) return 'it is not lit. A start needs a 5 MW surge from the rest of the grid; see its own entry.';
    if (e.type === T.NUCLEARREACTOR || e.type === T.ADVREACTOR) {
      if (e._generating) return 'it is running, so this line may be split from its outlet; check the pipe at its STEAM OUT.';
      const why = fissionStopped(e);
      if (why && why.kind === 'crew') return `${why.short}.`;
      return why ? `${why.short}. See its own entry.` : 'it is not burning; open it for its status.';
    }
    if (e.type === T.WATEREXTRACTOR) return e._lakeConnected === false ? 'it is not over water.' : 'it is not pumping; open it to see why.';
    if (e._idleFull) return 'it is full and waiting because its output has nowhere to go. Check this line reaches its outlet.';
    // Its own inputs: any _hasX / _xConnected flag that is false.
    const missing = Object.keys(e).filter(k => (/^_has[A-Z]/.test(k) || /Connected$/.test(k)) && e[k] === false)
      .map(k => k.replace(/^_has/, '').replace(/^_/, '').replace(/Connected$/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase());
    if (missing.length) return `it is missing its own input${missing.length > 1 ? 's' : ''}: ${missing.join(', ')} (see its own entry).`;
    return 'it is not producing; open it for its status.';
  }

  // What the Helium Wells make against what the Fusion Reactors' magnets
  // take, for every reactor that has a Cryo Plant. `ashBack` is read off the
  // pipes (is the reactor an outlet on a Cryo Plant's HE IN line), not off
  // the reactor's own flag, which drops while it is down.
  // Advanced Fusion Reactors count too: their magnets boil off 6/s on the same
  // Cryo Plants. boilOf / ashOf / capOf answer per reactor; boil / ash are
  // the Fusion Reactor's, for the wording. wellRate is an MK1's; `made` sums
  // each working well's own rate (an MK2 makes three times as much).
  const _boilDef = (r) => EntityDefs[r.type] || {};
  // Installed Field Cores boil off on the same charge.
  const boilOf = (r) => (_boilDef(r).heliumBoilOff || (r.type === T.ADVFUSIONREACTOR ? 6 : 1))
    + (typeof FieldCoreSystem !== 'undefined' ? FieldCoreSystem.boilOff(r) : 0);
  const _heSeen = new WeakMap();   // reactor → helium charge when cryoCapacity last looked
  const ashOf  = (r) => _boilDef(r).heliumAshPerSec || (r.type === T.ADVFUSIONREACTOR ? 0.8 : 0.4);
  const capOf  = (r) => _boilDef(r).heliumChargeCap || (r.type === T.ADVFUSIONREACTOR ? 2400 : 400);
  const ashStubOf = (r) => (r.type === T.ADVFUSIONREACTOR ? AdvancedFusionReactorSystem : HulkingFusionReactorSystem).getStubs(r).ashOut;
  const isFusion = (e) => e.type === T.HULKINGFUSIONREACTOR || e.type === T.ADVFUSIONREACTOR;
  function heliumAccount() {
    const rdef = EntityDefs[T.HULKINGFUSIONREACTOR], wdef = EntityDefs[T.HELIUMWELL];
    const boil = rdef.heliumBoilOff || 1, ash = rdef.heliumAshPerSec || 0.4, wellRate = wdef.heliumPerSec || 2;
    const reactors = all(T.HULKINGFUSIONREACTOR).filter(r => r._cryoLinked && !((r._legacyCoolant || 0) > 0))
      .concat(all(T.ADVFUSIONREACTOR).filter(r => r._cryoLinked));
    const ashBack = new Set();
    for (const c of all(T.CRYOPLANT))
      for (const q of runFrom(CryoPlantSystem.getStubs(c).heliumIn).ports) if (q.role === 'out' && isFusion(q.e)) ashBack.add(q.e);
    const wells = HeliumSystem.allWells(), up = wells.filter(w => w.powered && !w._oreDepleted);
    const useOf = (r) => boilOf(r) - (ashBack.has(r) ? ashOf(r) : 0);
    const needAll = reactors.reduce((n, r) => n + useOf(r), 0);
    const made = up.reduce((n, w) => n + HeliumSystem.wellRate(w), 0);
    return { reactors, ashBack, wells, up, made, useOf, needAll, boil, ash, wellRate, short: reactors.length > 0 && made < needAll * 1.2 };
  }
  // A stretch of game time, in days once it runs to days.
  const longSpan = (sec) => { const h = sec / DayNight.secondsPerGameHour(); return h >= 48 ? `${Math.round(h / 24)} days` : gameSpan(sec); };

  // Why a powered fission reactor is not burning, in the order the reactor
  // itself checks (NuclearSystem.tick): { short, kind } or null if it is.
  function fissionStopped(e) {
    if (e._generating || e._detonated) return null;
    const def = EntityDefs[e.type] || {}, mox = e.type === T.ADVREACTOR;
    if (!e.powered) return { kind: 'power', short: 'it has no power' };
    if (e._crewHeld && !((e._rodBuffer || 0) > 0.01)) return { kind: 'crew', short: e._crewHeld === 'cooling'
      ? 'your crew is holding its fuel until its cooling is running'
      : 'your crew is holding its fuel until every piece of the build is up' };
    if (!((e._rodBuffer || 0) > 0.01) && !e._hasRods) return { kind: 'rods', short: `no ${mox ? 'MOX fuel' : 'fuel'} rods are reaching it` };
    if ((e._spentFuel || 0) >= (def.spentFuelCapacity || 100) - 0.01) return { kind: 'spent', short: 'its spent fuel store is full' };
    // A belt on ROD IN is not enough: the plant at the other end can be empty.
    if (!((e._rodBuffer || 0) > 0.01)) return { kind: 'rods', short: `its rod belt is connected but no ${mox ? 'MOX fuel' : 'fuel'} rods are arriving` };
    if (e._cooled === false) return { kind: 'cooling', short: 'it is not being cooled' };
    return null;
  }

  // Why a rod maker (Fuel Processing Plant, or MOX Plant) is making nothing,
  // followed back up its own supply: steps, worst first. For a Fuel Plant
  // that means the sulfuric acid (Chemical Plant ← Sulfur Mine + water) and
  // the uranium (Uranium Mine), since "open it" is no help when the plant it
  // needs was never built.
  function rodMakerSteps(m) {
    const at = `${esc(nameOf(m))} at ${locOf(m)}`;
    if (!m.powered) return [`${at} has no power (see the power entries).`];
    if (m._lightningDamaged) return [`${at} is damaged; repair it.`];
    if (m.type !== T.FUELPLANT) {
      const missing = Object.keys(m).filter(k => /^_has[A-Z]/.test(k) && m[k] === false).map(k => k.slice(4).replace(/([A-Z])/g, ' $1').trim().toLowerCase());
      return [missing.length ? `${at} is missing ${missing.join(' and ')}; open it to see where that comes from.` : `${at} is making nothing; open it for its status.`];
    }
    const steps = [];
    if (m._hasAcid === false) {
      const chems = all(T.CHEMICALPLANT);
      if (!chems.length) {
        const mines = [...all(T.SULFURMINE), ...all(T.SULFURMINE2)], free = all(T.SULFURDEPOSIT).find(d => !d._hasMine && !(d._oreAmount <= 0));
        steps.push(`${at} has no sulfuric acid, and there is no Chemical Plant on the map to make it. Build one and pipe its ACID OUT to this plant's acid inlet.`);
        steps.push(`The Chemical Plant needs sulfur by belt and water by pipe. ` + (mines.length
          ? `Belt sulfur to it from ${esc(nameOf(mines[0]))} at ${locOf(mines[0])}.`
          : free ? `There is no Sulfur Mine either: build one on the sulfur deposit at ${locOf(free)} and belt it across.`
                 : `There is no Sulfur Mine and no known sulfur deposit: survey for one, then mine it.`));
      } else {
        for (const c of chems.slice(0, 2)) {
          const cat = `${esc(nameOf(c))} at ${locOf(c)}`;
          if (!c.powered) steps.push(`${at} has no sulfuric acid: ${cat} has no power.`);
          else if (!c._sulfurConveyor) steps.push(`${at} has no sulfuric acid: ${cat} has no sulfur coming in. Belt sulfur to it from a Sulfur Mine.`);
          else if (!c._waterConnected) steps.push(`${at} has no sulfuric acid: ${cat} has no water. Pipe a Water Extractor to it.`);
          else if (!((c._acid || 0) > 0.5)) steps.push(`${at} has no sulfuric acid: ${cat} has its inputs but is making none yet; check the Sulfur Mine on its belt is digging.`);
          else steps.push(`${at} has no sulfuric acid, though ${cat} is holding ${num(c._acid)}. Its ACID OUT is not piped to this plant: join the two.`);
        }
      }
    }
    if (m._hasUranium === false) {
      const um = all(T.URANIUMMINE);
      steps.push(um.length ? `${at} has no uranium ore. Belt it from ${esc(nameOf(um[0]))} at ${locOf(um[0])}, or a Storage Container holding uranium.`
                           : `${at} has no uranium ore and there is no Uranium Mine. Build one on a uranium deposit and belt it here.`);
    }
    if (!steps.length) steps.push(`${at} has its inputs but no rods yet. If it stays at zero, open it.`);
    return steps;
  }

  // The way along the pipe from one tile to another, as its corners: where
  // the route turns, plus both ends. Empty if they are not joined.
  function pathCorners(from, to) { return cornersOf(pathTiles(from, to)); }
  // Distance along the pipe from the nearest seed tile, for every tile joined to one.
  function pipeDist(seeds) {
    const d = new Map(), queue = [];
    for (const [c, r] of seeds) { d.set(c + ',' + r, 0); queue.push([c, r]); }
    for (let head = 0; head < queue.length && head < 12000; head++) {
      const [c, r] = queue[head], k0 = d.get(c + ',' + r);
      for (const [nc, nr] of pipeBfsCoords(c, r)) {
        const k = nc + ',' + nr;
        if (d.has(k) || !pipeAt(nc, nr)) continue;
        d.set(k, k0 + 1); queue.push([nc, nr]);
      }
    }
    return d;
  }
  function pathTiles(from, to) {
    const key = (c, r) => c + ',' + r, parent = new Map([[key(from[0], from[1]), null]]);
    const queue = [from];
    for (let head = 0; head < queue.length && head < 8000; head++) {
      const [c, r] = queue[head];
      if (c === to[0] && r === to[1]) break;
      for (const [nc, nr] of pipeBfsCoords(c, r)) {
        const k = key(nc, nr);
        if (parent.has(k) || !pipeAt(nc, nr)) continue;
        parent.set(k, [c, r]); queue.push([nc, nr]);
      }
    }
    if (!parent.has(key(to[0], to[1]))) return [];
    const path = [];
    for (let t = to; t; t = parent.get(key(t[0], t[1]))) path.push(t);
    return path.reverse();
  }
  function cornersOf(path) {
    if (!path.length) return [];
    const corners = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const a = path[i - 1], b = path[i], c = path[i + 1];
      if ((b[0] - a[0]) !== (c[0] - b[0]) || (b[1] - a[1]) !== (c[1] - b[1])) corners.push(b);
    }
    corners.push(path[path.length - 1]);
    return corners.length > 7 ? [...corners.slice(0, 4), ...corners.slice(-3)] : corners;
  }

  // From each live source, follow the tiles carrying f and note where it
  // stops: the last tile that has it and the next pipe that does not.
  function whereItStops(live, f) {
    const out = [], seen = new Set();
    const queue = live.map(p => [p.c, p.r]);
    for (let head = 0; head < queue.length && head < 6000; head++) {
      const [c, r] = queue[head];
      const k = c + ',' + r;
      if (seen.has(k)) continue;
      seen.add(k);
      for (const [nc, nr] of pipeBfsCoords(c, r)) {
        if (seen.has(nc + ',' + nr) || !pipeAt(nc, nr)) continue;
        const fl = fluidAt(nc, nr);
        if (fl === f) queue.push([nc, nr]);
        else if (!out.some(s => s.to[0] === nc && s.to[1] === nr)) out.push({ from: [c, r], to: [nc, nr], toFluid: fl });
      }
    }
    return out;
  }

  // "Lay pipe from A to B" for a fluid that has nowhere to go: the nearest
  // point on the line already feeding a consumer of it (or the consumer's
  // own inlet, if that has no pipe yet). Returns steps, or null.
  function routeTo(fluid, fromTiles, skipEntity) {
    let best = null;
    for (const [type, sysName, stub, portLabel] of INLETS()[fluid] || []) {
      for (const cons of all(type)) {
        if (cons === skipEntity) continue;
        const s = stubOf(cons, sysName, stub);
        if (!s) continue;
        const run = runFrom(s);
        const n = nearest(fromTiles, run.piped ? run.tiles : [[s.c, s.r]]);
        if (n && (!best || n.dist < best.n.dist)) best = { n, cons, portLabel, piped: run.piped };
      }
    }
    if (!best) return null;
    const { n, cons, portLabel, piped } = best;
    return [
      `Lay pipe from ${loc(n.a[0], n.a[1])} to ${loc(n.b[0], n.b[1])}, about ${num(n.dist)} tiles. ` +
      (piped ? `That joins the line already running into ${esc(nameOf(cons))}'s ${portLabel}.` : `That is ${esc(nameOf(cons))}'s ${portLabel} port.`),
      'If another pipe line is in the way, cross it with a pair of Underground Pipes.',
    ];
  }

  // Is the oil side's power actually wanted? Fuel Generators are the early
  // game's plant, and a grid that has moved on to reactors leaves them (and
  // the refineries behind them) standing idle on purpose. Their findings are
  // only worth reporting when the grid is shedding load, is running with
  // little to spare, or could not relight a fusion reactor without them.
  let relightShort = false;   // set by restartMargin, read by the oil rules after it
  function fuelPowerWanted() {
    if (relightShort) return true;
    for (const e of EntityRegistry.all()) if (e._insufficient && !e.powered) return true;
    const st = PowerNetwork.stats || {};
    const gen = st.totalGenerated || 0, used = st.totalConsumed || 0;
    return gen - used < used * 0.1;
  }

  // ── The checks ───────────────────────────────────────────────────
  // ── Advanced Fusion Reactor outages ─────────────────────────────
  // An audit is a snapshot: a reactor that stops for a few minutes and comes
  // back between drone loads, or drops out with its grid at the evening peak,
  // looks fine whenever the report is drawn up, and an item about it came off
  // the list as "resolved" the moment it was running again. So every lit
  // Advanced Fusion Reactor is watched all the time, and each stop is logged
  // with what was wrong at that moment, kept for OUT_KEEP_H game hours and
  // saved with the world. The advOutages rule reports from the log.
  const OUT_KEEP_H = 24, OUT_MIN_SECS = 15;   // shorter stops are a delivery a moment late
  const _outLog = new Map();                   // "col,row" -> { running, cur: {at, why} | null, log: [{at, end, why}] }
  function _afrStopWhy(a) {
    if (!a.powered) return { why: 'power' };
    if (a._coolStarved || a._coolingOK === false) return { why: 'cooling' };
    if (a._magnetsReady === false) return { why: 'magnets' };
    if (!a._pelletLinked) return { why: 'nolink' };
    return { why: 'pellets' };
  }
  function trackOutages(now) {
    if (typeof T === 'undefined' || T.ADVFUSIONREACTOR === undefined) return;
    if (typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite && ContractSystem.isAtSite()) return;   // home's reactor is not on the map
    const cap = (EntityDefs[T.ADVFUSIONREACTOR] || {}).highBetaCapacity || 120000;
    for (const a of all(T.ADVFUSIONREACTOR)) {
      const k = a.col + ',' + a.row;
      let st = _outLog.get(k);
      if (!st) _outLog.set(k, st = { running: true, cur: null, log: [] });
      if (!a._started) { st.running = false; st.cur = null; continue; }   // never lit: not an outage
      const running = !!a._generating || !!a._idleFull || (a._highBeta || 0) >= cap * 0.99;
      if (st.running && !running) st.cur = { at: now, ..._afrStopWhy(a) };
      else if (!st.running && running && st.cur) {
        if (now - st.cur.at >= OUT_MIN_SECS) st.log.push({ ...st.cur, end: now });
        st.cur = null;
      }
      st.running = running;
      const keep = OUT_KEEP_H * DayNight.secondsPerGameHour();
      while (st.log.length && now - st.log[0].end > keep) st.log.shift();
      if (st.log.length > 60) st.log.splice(0, st.log.length - 60);
    }
  }

  const RULES = [

    // An outlet with stock behind it that reaches no consumer at all.
    function deadEndOutlets(add) {
      for (const o of OUTLETS()) {
        for (const e of all(o.type)) {
          const have = e[o.field] || 0;
          if (have < 1) continue;
          const stub = stubOf(e, o.sys, o.stub);
          if (!stub) continue;
          const run = runFrom(stub);
          if (run.ports.some(p => p.role === 'in' && p.e !== e)) continue;
          const steps = routeTo(o.fluid, run.piped ? run.tiles : [[stub.c, stub.r]], e)
            || [`Nothing uses ${o.what} yet. Build what needs it, then pipe this outlet at ${loc(stub.c, stub.r)} to it.`];
          add({
            key: o.stub,
            sev: o.ash ? 2 : 3,
            title: run.piped ? `${nameOf(e)}: connect its ${o.what} line to something that uses it` : `${nameOf(e)}: pipe its ${o.what} outlet`,
            why: o.ash
              ? `${num(have)} helium ash is going unused. Sent back to a Cryo Plant, it cuts the helium the magnets use.`
              : `It has ${num(have)} ${o.what} and nowhere to send it, so whatever needs it is going without.`,
            steps, at: e,
          });
        }
      }
    },

    // Fusion Fuel Plant held back by one of its feeds.
    function fuelPlantShort(add) {
      const reactors = all(T.HULKINGFUSIONREACTOR).length;
      const fdef = EntityDefs[T.FUSIONFUELPLANT], rdef = EntityDefs[T.HULKINGFUSIONREACTOR], wdef = EntityDefs[T.WASHTOWER];
      for (const e of all(T.FUSIONFUELPLANT)) {
        if (!e.powered || e._fuelMode === 'dhe3') continue;
        const stub = stubOf(e, 'FusionFuelPlantSystem', 'deuteriumIn');
        // Towers on the line, directly or through any Gas Holder on it. A
        // holder that vehicles restock could be fed by any tower.
        const towers = all(T.WASHTOWER), feeding = new Set(), holders = new Set();
        const frontier = [runFrom(stub)];
        for (let i = 0; i < frontier.length; i++) {
          for (const p of frontier[i].ports) {
            if (p.role !== 'out') continue;
            if (p.e.type === T.WASHTOWER) feeding.add(p.e);
            else if (p.e.type === T.GASSTORAGE && p.e._gasType === 'deuterium' && !holders.has(p.e)) {
              holders.add(p.e);
              frontier.push(runFrom(GasStorageSystem.getStubs(p.e).gasIn));
              if (p.e._truckSupply === 'deuterium' || p.e._droneSupply === 'deuterium') towers.forEach(t => feeding.add(t));
            }
          }
        }
        const working = [...feeding].filter(t => t.powered && t._waterConnected && t._hasAmmonia);
        const stock = [...holders].reduce((n, g) => n + GasStorageSystem.stored(g), 0);
        const rate = wdef.deuteriumPerSec || 1.51;
        const need = reactors * (rdef.plasmaPerSec || 0.5) * ((fdef.deuteriumPerSec || 5) / (fdef.plasmaPerSec || 0.625));
        // With no reactor yet, one tower or a banked stock is plenty to make pellets on.
        const want = reactors ? Math.ceil(need / rate - 0.01) : 1;
        if (working.length >= want || (!reactors && stock > 0)) continue;
        const towersNoun = n => `Isotopic Wash Tower${n === 1 ? '' : 's'}`;
        const steps = [];
        const loose = towers.length - feeding.size, stalled = feeding.size - working.length, build = want - towers.length;
        if (loose > 0) steps.push(`Connect your ${loose === 1 ? 'unconnected ' + towersNoun(1) : loose + ' unconnected ' + towersNoun(loose)} to D₂ IN at ${loc(stub.c, stub.r)}.`);
        if (stalled > 0) steps.push(`Get ${stalled === 1 ? 'the connected tower' : `the ${stalled} connected towers`} running: check power, water and ammonia.`);
        if (build > 0) steps.push(`Build ${build} more ${towersNoun(build)} and connect ${build === 1 ? 'it' : 'them'} to the same line.`);
        const needs = reactors === 1 ? `One Fusion Reactor needs ${want} ${towersNoun(want)}` : `${reactors} Fusion Reactors need ${want} ${towersNoun(want)}`;
        const has = `this plant has ${working.length} running`;
        const pct = Math.round(Math.min(1, working.length * rate / (need || 1)) * 100);
        add({
          sev: stock > 0 ? 2 : 3, title: `${nameOf(e)} needs more deuterium`,
          why: !reactors ? 'It has no deuterium and no running Isotopic Wash Tower, so it can\'t make pellets.'
             : stock > 0 ? `${needs} and ${has}. Its ${num(stock)} banked deuterium lasts about ${mins(stock / (need - working.length * rate))}, then reactor power drops to about ${pct}%.`
             : `${needs} and ${has}, so reactor power is held to about ${pct}%.`,
          steps, at: e,
        });
      }
    },

    // Fusion Fuel Plant held back by tritium: who feeds TRITIUM IN, and what
    // banked tritium is sitting off that line.
    function fuelPlantTritium(add) {
      const fdef = EntityDefs[T.FUSIONFUELPLANT], bdef = EntityDefs[T.TRITIUMBREEDER], rdef = EntityDefs[T.HULKINGFUSIONREACTOR];
      for (const e of all(T.FUSIONFUELPLANT)) {
        if (!e.powered || e._fuelMode === 'dhe3' || e._limitedBy !== 'tritium') continue;
        const stub = stubOf(e, 'FusionFuelPlantSystem', 'tritiumIn');
        const run = runFrom(stub);
        const feeds = run.ports.filter(p => p.role === 'out' && p.e !== e).map(p => p.e);
        const breeders = feeds.filter(f => f.type === T.TRITIUMBREEDER);
        const need = fdef.tritiumPerSec || 5, per = bdef.tritiumPerSec || 1;
        const steps = [];
        // The reactor's own blanket is the supply that keeps up: at full burn
        // it breeds about as much tritium as the plant needs. Breeders and
        // holders alone only top that up.
        for (const r of all(T.HULKINGFUSIONREACTOR)) {
          const rs = HulkingFusionReactorSystem.getStubs(r);
          const bred = rdef.tritiumBredPerSec || 4.4;
          const burns = (rdef.plasmaPerSec || 0.5) * need / (fdef.plasmaPerSec || 0.625);   // tritium its pellets take at full burn
          if (!r._hasBlanket) {
            steps.push(`Belt lithium compound into ${esc(nameOf(r))}'s Li COMPOUND IN at ${loc(rs.blanketIn.c, rs.blanketIn.r)}. At full burn it then breeds ${bred >= burns ? 'enough tritium for its own pellets' : 'most of the tritium its pellets need'}.`);
            if (!feeds.includes(r)) steps.push(`Then pipe its TRITIUM OUT at ${loc(rs.tritiumOut.c, rs.tritiumOut.r)} to this plant's TRITIUM IN at ${loc(stub.c, stub.r)}.`);
          } else if (!feeds.includes(r)) {
            steps.push(`Pipe ${esc(nameOf(r))}'s TRITIUM OUT at ${loc(rs.tritiumOut.c, rs.tritiumOut.r)} to this plant's TRITIUM IN at ${loc(stub.c, stub.r)}.`);
          }
        }
        // Banked tritium that is not on this line, the biggest first.
        const banked = all(T.GASSTORAGE).filter(g => g._gasType === 'tritium' && !feeds.includes(g) && GasStorageSystem.stored(g) >= 50)
          .sort((a, b) => GasStorageSystem.stored(b) - GasStorageSystem.stored(a));
        // A holder on this line that is filled by Hauler or drone, and empty:
        // the tritium exists, it has not been carried here.
        const ferried = feeds.filter(f => f.type === T.GASSTORAGE && (f._truckSupply === 'tritium' || f._droneSupply === 'tritium') && GasStorageSystem.stored(f) < 50);
        for (const g of ferried) {
          const by = g._truckSupply === 'tritium' ? (g._droneSupply === 'tritium' ? 'Haulers and drones' : 'Haulers') : 'drones';
          steps.push(`${esc(nameOf(g))} at ${locOf(g)} feeds this line, relies on ${by}, and is empty. ` + (banked.length
            ? `Tritium is waiting in ${esc(nameOf(banked[0]))} at ${locOf(banked[0])} (${num(GasStorageSystem.stored(banked[0]))}). ` +
              (g._truckSupply === 'tritium' ? "Add a Hauler, or also set this holder's Drone Supply to Tritium." : 'Check a Drone Port covers both holders.')
            : 'No tritium is banked anywhere to carry, so fix the supply first.'));
        }
        for (const g of (ferried.length ? [] : banked.slice(0, 3))) {
          const out = GasStorageSystem.getStubs(g).gasOut;
          steps.push(`Pipe GAS OUT of ${esc(nameOf(g))} at ${loc(out.c, out.r)} into TRITIUM IN. Its ${num(GasStorageSystem.stored(g))} tritium runs the plant until it is empty, so it is a top-up, not a supply.`);
        }
        const idle = all(T.TRITIUMBREEDER).filter(b => !breeders.includes(b));
        for (const b of idle.slice(0, 2)) steps.push(`Connect ${esc(nameOf(b))} at ${locOf(b)}: pipe its TRITIUM OUT here, or into a Gas Holder whose GAS OUT is here.`);
        if (!steps.length) {
          const short = Math.ceil(need / per) - breeders.length;
          steps.push(short > 0
            ? `Add ${short} more Tritium Breeding Facilit${short > 1 ? 'ies' : 'y'} on this line, or belt lithium compound into the Fusion Reactor's blanket so it breeds its own.`
            : `Check the TRITIUM IN line at ${loc(stub.c, stub.r)} for a gap.`);
        }
        add({
          sev: 3, title: `${nameOf(e)} needs more tritium`,
          why: `It is running at about ${Math.round((e._runRate || 0) * 100)}%, and every reactor it feeds burns at the same level.`,
          steps, at: e,
        });
      }
    },

    // A Gas Holder plumbed the wrong way round on a consumer's feed: its GAS
    // IN is on the line, so it fills from what the consumer should get, and
    // its GAS OUT reaches nothing, so none of it comes back. The consumer
    // runs in bursts. And one whose GAS OUT does feed a consumer but that
    // nothing refills.
    function holderPlumbing(add) {
      const inlets = INLETS();
      for (const g of all(T.GASSTORAGE)) {
        const fluid = g._gasType;
        if (!fluid || !inlets[fluid]) continue;
        const types = inlets[fluid].map(x => x[0]);
        const stubs = GasStorageSystem.getStubs(g);
        const runIn = runFrom(stubs.gasIn), runOut = runFrom(stubs.gasOut);
        const takerIn  = runIn.ports.find(p => p.role === 'in' && p.e !== g && types.includes(p.e.type));
        const takerOut = runOut.ports.find(p => p.role === 'in' && p.e !== g && types.includes(p.e.type));
        const what = fluid === 'helium3' ? 'helium-3' : fluid;
        if (takerIn && !takerOut) {
          add({
            key: 'backwards', sev: 3,
            title: `${nameOf(g)} is piped backwards`,
            why: `Its GAS IN is on the line feeding ${esc(nameOf(takerIn.e))}, so it takes ${what} meant for that building, and its GAS OUT goes nowhere.`,
            steps: [`Swap it: connect GAS OUT at ${loc(stubs.gasOut.c, stubs.gasOut.r)} to the line into ${esc(nameOf(takerIn.e))} at ${locOf(takerIn.e)}, and GAS IN at ${loc(stubs.gasIn.c, stubs.gasIn.r)} to the producer.`],
            at: g,
          });
        } else if (takerOut && fluid !== 'helium' && GasStorageSystem.stored(g) < 50
                   && !runIn.ports.some(p => p.role === 'out' && p.e !== g) && !g._droneSupply && !g._truckSupply) {
          add({
            key: 'unfed', sev: 2,
            title: `Nothing refills ${nameOf(g)}`,
            why: `It feeds ${esc(nameOf(takerOut.e))}, but nothing refills it, and it is down to ${num(GasStorageSystem.stored(g))}.`,
            steps: [`Pipe a ${what} producer into its GAS IN at ${loc(stubs.gasIn.c, stubs.gasIn.r)}, or set its Drone Supply or Truck Supply to ${what}.`],
            at: g,
          });
        }
      }
    },

    // ── Every pipe inlet on the grid ─────────────────────────────────
    // For each building that takes a fluid by pipe: is that fluid actually
    // at its inlet? If not, follow the line and say why, the way you would
    // standing over it: no pipe at all; the line is joined to something
    // pushing a different fluid into it; its sources are off or empty; or
    // they are running and the fluid stops partway (a break or a dead
    // crossing). Buildings on the same line are reported together.
    function inletLines(add) {
      const groups = new Map();
      for (const [type, ports] of Object.entries(IN_FLUID())) {
        const P = _PIPE_PORTS[type];
        const S = P && sys(P[0]);
        if (!S || !S.getStubs) continue;
        for (const e of all(type)) {
          if (!e.powered || e._lightningDamaged || e._clientOwned) continue;   // unpowered: see the power entries
          const stubs = S.getStubs(e);
          for (const [stubName, want] of Object.entries(ports)) {
            const fluid = typeof want === 'function' ? want(e) : want;
            const stub = stubs[stubName];
            if (!fluid || !stub) continue;
            const pipe = GridManager.inBounds(stub.c, stub.r) ? getPipe(GridManager.getEntity(stub.c, stub.r)) : null;
            const cur = pipe ? pipeCurrentFluid(pipe) : null;
            if (cur === fluid) continue;
            const label = portLabel(stubName);
            if (!pipe) {
              groups.set(`np:${e.col},${e.row}:${stubName}`, { kind: 'nopipe', fluid, label, stub, members: [e], run: null, cur: null });
              continue;
            }
            const run = runFrom(stub);
            const runKey = run.tiles.reduce((m, t) => { const k = t[1] * 100000 + t[0]; return k < m ? k : m; }, Infinity);
            const key = `ln:${fluid}:${runKey}`;
            const g = groups.get(key);
            if (g) { if (!g.members.includes(e)) g.members.push(e); continue; }
            groups.set(key, { kind: 'line', fluid, label, stub, members: [e], run, cur });
          }
        }
      }
      for (const [key, g] of groups) {
        const e = g.members[0], f = g.fluid, what = fluidName(f);
        const sameType = g.members.every(m => m.type === e.type);
        const who = g.members.length === 1 ? esc(nameOf(e))
          : sameType ? `${g.members.length} × ${esc(EntityDefs[e.type]?.label || e.type)}` : `${g.members.length} buildings`;
        const firstFew = g.members.length > 1 ? ` (${g.members.slice(0, 4).map(locOf).join(', ')}${g.members.length > 4 ? ', ...' : ''})` : '';
        const sev = IMPORTANT_IN.has(e.type) ? 3 : 2;
        if (g.kind === 'nopipe' && e.type === T.HE3SEPARATOR && heliumAccount().short) {
          const A = heliumAccount(), sdef = EntityDefs[T.HE3SEPARATOR];
          const banked = all(T.GASSTORAGE).filter(h => h._gasType === 'helium3').reduce((n, h) => n + GasStorageSystem.stored(h), 0);
          add({ key, sev: 1, title: `${who}: leave it disconnected for now`,
            why: `It would take helium your reactors' magnets need, and your wells can't cover both.`,
            steps: [`Reconnect HELIUM IN at ${loc(g.stub.c, g.stub.r)} once you have about ${Math.ceil((A.needAll * 1.2 + (sdef.heliumPerSec || 3)) / A.wellRate)} Helium Wells' worth of helium.${banked >= 50 ? ` You have ${num(banked)} helium-3 banked to run on until then.` : ''}`], at: e });
          continue;
        }
        if (g.kind === 'nopipe') {
          add({ key, sev, title: `${who}: connect a pipe to ${g.label}`,
            why: `It needs ${what} at ${loc(g.stub.c, g.stub.r)} and can't run without it.`,
            steps: routeSteps(f, [[g.stub.c, g.stub.r]], g.label), at: e });
          continue;
        }
        const ports = g.run.ports.map(p => ({ ...p, fluid: portFluid(p) }));
        const sources = ports.filter(p => p.role === 'out' && p.fluid === f && p.e !== e);
        const live = sources.filter(p => portCarries(p, f));
        // 1. The line carries the wrong fluid: name what is pushing it in.
        if (g.cur && g.cur !== f) {
          const foreign = ports.filter(p => p.role === 'out' && portCarries(p, g.cur));
          // Follow the foreign fluid from its outlet to the inlet, and cut it
          // at the first pipe past the outlet. What is still joined to the
          // inlets after that cut is this line's own, and gets a supply.
          const cuts = new Set();
          const steps = foreign.slice(0, 3).map(p => {
            const full = pathTiles([p.c, p.r], [g.stub.c, g.stub.r]);
            const path = cornersOf(full);
            const cut = full.length >= 2 ? full[1] : null;
            if (cut) cuts.add(cut[0] + ',' + cut[1]);
            return (cut ? `Delete the pipe at ${loc(cut[0], cut[1])} to cut off ` : 'Cut the pipe to this line from ') + `${esc(nameOf(p.e))} at ${locOf(p.e)}, which is pushing ${fluidName(g.cur)} in through its outlet at ${loc(p.c, p.r)}.` +
              (path.length > 2 ? ` Its route: ${path.slice(1, -1).map(t => loc(t[0], t[1])).join(' → ')}.` : '');
          });
          if (!foreign.length) steps.push(`Follow the pipe from ${loc(g.stub.c, g.stub.r)} and cut it where it joins a ${fluidName(g.cur)} line.`);
          if (!sources.length) {
            const own = [];
            const seen = new Set(cuts), queue = g.members.map(m => {
              const st = sys(_PIPE_PORTS[m.type][0]).getStubs(m);
              return Object.values(st).find(s => s && fluidAt(s.c, s.r) === g.cur && g.run.tiles.some(t => t[0] === s.c && t[1] === s.r)) || null;
            }).filter(Boolean).map(s => [s.c, s.r]);
            for (let head = 0; head < queue.length && head < 8000; head++) {
              const [c, r] = queue[head], k = c + ',' + r;
              if (seen.has(k) || !pipeAt(c, r)) continue;
              seen.add(k); own.push([c, r]);
              for (const [nc, nr] of pipeBfsCoords(c, r)) queue.push([nc, nr]);
            }
            steps.push(...routeSteps(f, own.length ? own : [[g.stub.c, g.stub.r]], g.label, true).map(s => 'Then give it a supply: ' + s[0].toLowerCase() + s.slice(1)));
          } else steps.push(`Once it is cut off, ${what} from ${esc(nameOf(sources[0].e))} at ${locOf(sources[0].e)} takes the line over.`);
          add({ key, sev, title: `${who}: the ${what} line has ${fluidName(g.cur)} in it`,
            why: `This line${firstFew} is joined to a ${fluidName(g.cur)} source. A pipe carries one fluid at a time, so no ${what} can get in.`,
            steps, at: e });
          continue;
        }
        // 2. No source of the fluid anywhere on the line.
        if (!sources.length) {
          add({ key, sev, title: `${who}: the ${what} line has no source`,
            why: `The pipe at ${g.label} ${loc(g.stub.c, g.stub.r)}${firstFew} isn't connected to anything that makes or stores ${what}.`,
            steps: routeSteps(f, g.run.tiles, g.label, true), at: e });
          continue;
        }
        // 3. Sources are on the line but none is putting anything out.
        if (!live.length) {
          add({ key, sev, title: `${who}: nothing is coming down the ${what} line`,
            why: `${sources.length > 1 ? `${sources.length} sources are` : 'A source is'} connected, but none is sending any ${what}.`,
            steps: sources.slice(0, 3).map(p => `${esc(nameOf(p.e))} at ${locOf(p.e)}: ${idleReason(p.e, f)}`), at: e });
          continue;
        }
        // 4. A source is sending, yet it does not arrive: find where it stops.
        const stops = whereItStops(live, f);
        add({ key, sev, title: `${who}: ${what} is not getting through`,
          why: `${esc(nameOf(live[0].e))} at ${locOf(live[0].e)} is sending it, but it stops before reaching ${g.label} at ${loc(g.stub.c, g.stub.r)}.`,
          steps: stops.length
            ? stops.slice(0, 2).map(s => `It stops at ${loc(s.from[0], s.from[1])}: the next pipe, at ${loc(s.to[0], s.to[1])}, ${s.toFluid ? `carries ${fluidName(s.toFluid)}. Two fluids can't share a pipe, so separate them there.` : 'carries nothing. Drag a fresh pipe across that tile.'}`)
            : [`Walk the pipe from ${loc(live[0].c, live[0].r)} toward ${loc(g.stub.c, g.stub.r)} and re-lay any tile that is not lit.`],
          at: e });
      }
    },

    // ── Reactor cooling ──────────────────────────────────────────────
    function reactorCooling(add) {
      for (const type of [T.NUCLEARREACTOR, T.ADVREACTOR]) for (const e of all(type)) {
        if (e._detonated || e._cooled) continue;
        if (!e._generating && !((e._coreHeat || 0) > 0)) continue;
        const stub = stubOf(e, 'NuclearSystem', 'coolIn');
        const heat = Math.round((e._coreHeat || 0) * 100);
        const run = runFrom(stub);
        const towers = run.ports.filter(p => p.role === 'out' && (p.e.type === T.COOLINGTOWER || p.e.type === T.COOLINGTOWER2)).map(p => p.e);
        const steps = [];
        if (!run.piped) steps.push(`Pipe a Cooling Tower's COLD OUT to its COOL IN at ${loc(stub.c, stub.r)}.`);
        else if (!towers.length) steps.push(`The pipe at COOL IN ${loc(stub.c, stub.r)} reaches no Cooling Tower. Join it to a tower's COLD OUT.`);
        for (const t of towers.slice(0, 3)) {
          const why = !t.powered ? 'has no power (see the power entries)'
            : t._pumpTripped ? 'has tripped its pumps; it restarts once its water and power are steady'
            : (t.type === T.COOLINGTOWER && !t._hasWater) ? (t._waterShort ? 'is plumbed for water but the extractors on its line are spread too thin' : 'is getting no water at its H₂O IN (see its own entry)')
            : (t.type === T.COOLINGTOWER2 && !t._hasCoolWater) ? 'is getting no cooled water'
            : (t._coolLeft === 0 || t._coolShort) ? 'is already giving all it can to other reactors on its line' : null;
          if (why) steps.push(`${esc(nameOf(t))} at ${locOf(t)} ${why}.`);
        }
        if (!steps.length) steps.push("Add another Cooling Tower on the same COOL IN line: its towers are running but can't keep up.");
        add({ sev: 3, title: `${nameOf(e)} is not being cooled`,
          why: e._generating
            ? `Its core is at ${heat}% and rising. At 100% it goes critical, and cutting its fuel won't stop the heat right away.`
            : `Its core is still at ${heat}%, and nothing is cooling it.`,
          steps, at: e });
      }
    },

    // ── A fission reactor that has stopped burning ───────────────────
    // Not cooling (reactorCooling has that): a full spent fuel store, or no
    // rods. Either one idles every turbine on its steam, and from the
    // turbines' side all that shows is an empty steam line.
    function reactorStopped(add) {
      for (const type of [T.NUCLEARREACTOR, T.ADVREACTOR]) for (const e of all(type)) {
        const why = fissionStopped(e);
        if (!why || (why.kind !== 'spent' && why.kind !== 'rods')) continue;
        const def = EntityDefs[type], mox = type === T.ADVREACTOR, stubs = NuclearSystem.getStubs(e);
        const idle = runFrom(stubs.steamOut).ports.filter(p => p.role === 'in' && (p.e.type === T.STEAMTURBINE || p.e.type === T.STEAMTURBINE2)).length;
        const lost = idle ? ` ${idle} Steam Turbine${idle > 1 ? 's are' : ' is'} standing idle on its steam.` : '';
        const steps = [];
        if (why.kind === 'spent') {
          const cap = def.spentFuelCapacity || 100;
          const pools = all(T.SPENTFUELPOOL);
          const fac = all(T.NUCLEARWASTE);
          if (e._wasteOut && !e._feedsPool) {
            steps.push(`Follow the belt from WASTE OUT at ${loc(stubs.wasteOut.c, stubs.wasteOut.r)} and connect it to a Spent Fuel Pool with room.`);
          } else if (!e._wasteOut) {
            steps.push(pools.length
              ? `Belt its WASTE OUT at ${loc(stubs.wasteOut.c, stubs.wasteOut.r)} to a Spent Fuel Pool (the nearest is ${esc(nameOf(pools[0]))} at ${locOf(pools[0])}).`
              : `Build a Spent Fuel Pool and belt WASTE OUT at ${loc(stubs.wasteOut.c, stubs.wasteOut.r)} into it.`);
          } else {
            steps.push('Its belt reaches a Spent Fuel Pool, but the pool is full or has no power.');
          }
          for (const pl of pools.slice(0, 2)) {
            if (!pl.powered) steps.push(`${esc(nameOf(pl))} at ${locOf(pl)} has no power.`);
            else if ((pl._fillPct || 0) >= 98) steps.push(`${esc(nameOf(pl))} at ${locOf(pl)} is full. Belt its cooled fuel to a Reprocessing Plant, or build a second pool.`);
          }
          steps.push(fac.length
            ? `Or put a Waste Truck on Auto-dispatch to haul spent fuel to ${esc(nameOf(fac[0]))} at ${locOf(fac[0])} (only if the reactor isn't belted to a pool).`
            : 'Or build a Nuclear Waste Processing Facility and put a Waste Truck on Auto-dispatch.');
          steps.push('It restarts by itself once some spent fuel is gone.');
          add({ sev: 3, key: 'spent', title: `${nameOf(e)} has stopped: its spent fuel store is full`,
            why: `It won't burn any more until spent fuel is taken away.${lost}`,
            steps, at: e });
        } else {
          const makers = all(mox ? T.MOXPLANT : T.FUELPLANT), what = mox ? 'MOX rods' : 'fuel rods', maker = mox ? 'MOX Plant' : 'Fuel Plant';
          const empty = makers.filter(m => !((m[mox ? '_mox' : '_rods'] || 0) > 0.5));
          if (!e._hasRods) steps.push(`Check a belt from a ${maker} (or a Storage Container of ${what}) reaches ROD IN at ${loc(stubs.rodIn.c, stubs.rodIn.r)}.`);
          if (!makers.length) steps.push(`Build a ${maker} and belt its output here.`);
          // Its belt reaches a maker, so follow the maker's own supply back.
          else for (const m of (empty.length ? empty : makers).slice(0, 2)) steps.push(...rodMakerSteps(m));
          const turbineMW = idle * ((EntityDefs[T.STEAMTURBINE] || {}).powerOutput || 0) / 1000;
          add({ sev: 3, key: 'rods', title: `${nameOf(e)} has stopped: no ${what}`,
            why: (e._hasRods
              ? `Its belt is connected, but the ${maker}${makers.length > 1 ? 's have' : ' has'} no rods to send.`
              : 'Nothing is arriving at ROD IN.') + lost + (turbineMW > 0 ? ` That is about ${num(turbineMW, 1)} MW lost.` : ''),
            steps, at: e });
        }
      }
    },

    // ── Fusion Reactor burning below full ────────────────────────────
    function fusionBurn(add) {
      const rdef = EntityDefs[T.HULKINGFUSIONREACTOR];
      for (const e of all(T.HULKINGFUSIONREACTOR)) {
        if (!e._generating || !e.powered) continue;
        const burn = e._burnRatio ?? 1;
        if (burn >= 0.9) continue;
        const plants = all(T.FUSIONFUELPLANT).filter(p => p.powered);
        const limited = plants.find(p => p._limitedBy);
        const pin = HulkingFusionReactorSystem.getStubs(e).plasmaIn;
        const steps = [];
        // Several reactors on one plant's belt: the pellets are shared out
        // evenly, and one plant does not make enough for two.
        const plant = e._feedPlant;
        const sharing = plant ? all(T.HULKINGFUSIONREACTOR).filter(r => r._feedPlant === plant && r.powered && r._started) : [];
        const made = EntityDefs[T.FUSIONFUELPLANT].plasmaPerSec || 0.625, each = rdef.plasmaPerSec || 0.5;
        if (sharing.length > 1) {
          steps.push(`Build ${sharing.length > 2 ? 'more Fusion Fuel Plants' : 'a second Fusion Fuel Plant'} and belt ${sharing.length > 2 ? 'their' : 'its'} PELLETS OUT to PELLETS IN at ${loc(pin.c, pin.r)}. ${esc(nameOf(plant))} at ${locOf(plant)} feeds ${sharing.length} reactors, and one plant fully fuels only one.`);
        }
        // A reactor that is down still loads its core, and takes a full share
        // of the belt while it does.
        const coreCap = rdef.pelletCoreCapacity || 300;
        const loading = plant ? all(T.HULKINGFUSIONREACTOR).filter(r => r !== e && r._feedPlant === plant && !r._started && r._pelletFeed && (r._corePellets || 0) < coreCap - 1) : [];
        for (const r of loading) steps.push(`${esc(nameOf(r))} at ${locOf(r)} isn't lit but is filling its core off the same belt (${num(r._corePellets || 0)} of ${num(coreCap)}). That stops by itself when its core is full.`);
        // The other kind of pellet, in case it looks like a surplus.
        const wrong = all(T.SOLIDSTORAGE).filter(b => b._solidType === 'he3pellets' && (b._stored || 0) >= 20).sort((a, b) => (b._stored || 0) - (a._stored || 0));
        if (wrong.length && (e._coreMode || e._fuelMode) !== 'dhe3') steps.push(`The ${num(wrong.reduce((n, b) => n + (b._stored || 0), 0))} pellets in ${esc(nameOf(wrong[0]))} at ${locOf(wrong[0])} are D-He3. This reactor only burns D-T, so they won't help.`);
        if (limited) steps.push(`Fix ${esc(nameOf(limited))} at ${locOf(limited)} first: it is at ${Math.round((limited._runRate || 0) * 100)}%, short of ${limited._limitedBy}. See its own entry.`);
        else if (sharing.length > 1) { /* said above */ }
        else if (!plants.length) steps.push(`No Fusion Fuel Plant is running. Belt pellets from one to PELLETS IN at ${loc(pin.c, pin.r)}.`);
        else steps.push(`The plant isn't short of anything, so pellets aren't all arriving. Check the belt from its PELLETS OUT to PELLETS IN at ${loc(pin.c, pin.r)} for a gap, or for anything else sharing it.`);
        add({ sev: 3, title: `${nameOf(e)} is running at ${Math.round(burn * 100)}%`,
          why: `It isn't getting enough pellets, so its steam and turbines are down to the same level.`,
          steps, at: e });
      }
    },

    // ── Power: everything on the grid that should be lit and is not ──
    // Grouped by why: never reached by a wire, on a network that is short of
    // generation (it sheds load), or on a line that is dead.
    function unpowered(add) {
      const reach = [], shed = new Map(), dark = [];
      let customers = 0;
      for (const [type, def] of Object.entries(EntityDefs)) {
        if (!(def && def.powerInput > 0) || NO_POWER_CHECK.has(type)) continue;
        for (const e of all(type)) {
          if (e.powered || e._lightningDamaged || e._detonated || e._clientOwned) continue;
          if (CUSTOMER_TYPES.has(type)) { customers++; continue; }
          if (e.outOfRange) reach.push(e);
          else if (e._insufficient) { const k = e.networkId ?? -1; if (!shed.has(k)) shed.set(k, []); shed.get(k).push(e); }
          else dark.push(e);
        }
      }
      const list = (a) => a.slice(0, 6).map(e => `${esc(nameOf(e))} ${locOf(e)}`).join(', ') + (a.length > 6 ? ` and ${a.length - 6} more` : '');
      const sevOf = (a) => a.some(e => IMPORTANT_IN.has(e.type) || e.type === T.WATEREXTRACTOR || e.type === T.COOLINGTOWER || e.type === T.CRYOPLANT) ? 3 : 2;
      if (reach.length) add({ key: 'all', sev: sevOf(reach),
        title: `${reach.length} building${reach.length > 1 ? 's aren\'t' : ' isn\'t'} connected to power`,
        why: `No wire reaches ${reach.length > 1 ? 'them' : 'it'}: ${list(reach)}.`,
        steps: ['Run a wire from the nearest live pole or tower to each one. On a long run, put a pole partway.'],
        at: reach[0] });
      for (const [net, a] of shed) {
        const demand = PowerNetwork.getNetworkDemand ? PowerNetwork.getNetworkDemand(net) : 0;
        add({ key: 'shed', sev: sevOf(a),
          title: `Not enough power: ${a.length} building${a.length > 1 ? 's' : ''} switched off`,
          why: `This network needs ${num(demand)} kW and can't make it, so these are off: ${list(a)}.${a.some(x => x.type === T.WATEREXTRACTOR || x.type === T.COOLINGTOWER) ? ' That includes water or cooling, which reactors need.' : ''}`,
          steps: ['Bring a generator back, build another, or connect this network to one with spare power. Charged batteries cover a short gap.',
                  'If a big generator just stopped, fix its entry here first.',
                  'Click any wire on the network to see its supply and demand in the Grid Analyzer.'],
          at: a[0] });
      }
      if (dark.length) add({ key: 'dark', sev: sevOf(dark),
        title: `${dark.length} building${dark.length > 1 ? 's are' : ' is'} on a dead line`,
        why: `${dark.length > 1 ? 'They are' : 'It is'} wired, but nothing on the line is generating, or a span has tripped: ${list(dark)}.`,
        steps: ['Follow the wire back toward the generators until it goes dark, then re-lay that span or wait for it to re-close.',
                'If several in one area are out, fix the first dead span and the rest come back.'],
        at: dark[0] });
      if (customers >= 5) add({ key: 'cust', sev: 1,
        title: `${customers} customer buildings are without power`,
        why: 'Dark homes and businesses cost you satisfaction and income.',
        steps: ["Fix the entries above first; they're usually the cause. The Grid Analyzer shows where supply falls short."],
        at: null });
    },

    // Helium: how long the magnets have, and what is taking the gas.
    // What the wells make against what every reactor's magnets take. One
    // well covers three reactors on paper and leaves nothing over, and it is
    // the "over" that refills a charge after a quench and covers the wait
    // between deliveries: each reactor's own entry then reads as bad luck
    // when the cause is the same shortage.
    function heliumSupply(add) {
      const { reactors, ashBack, wells, up, made, useOf, needAll, boil, ash, wellRate } = heliumAccount();
      if (!reactors.length) return;
      const running = reactors.filter(r => r._started), down = reactors.filter(r => !r._started);
      const spare = made - running.reduce((n, r) => n + useOf(r), 0);
      const refill = down.reduce((n, r) => n + Math.max(0, capOf(r) * 0.95 - (r._heCharge || 0)), 0);
      const want = needAll * 1.2;   // a fifth over: what recharges a quenched reactor in reasonable time
      if (made >= want) return;
      const n = reactors.length, more = Math.max(1, Math.ceil((want - made) / wellRate - 0.01));
      const free = all(T.HELIUMDEPOSIT).filter(d => !(d._oreAmount <= 0) && !wells.some(w => w._linkedDeposit === d));
      const steps = [];
      // MK2 first when it's open: it goes on a field you already hold, and
      // fields are the scarce thing.
      const mk2 = Progression.isUnlocked(T.HELIUMWELL2), m2def = EntityDefs[T.HELIUMWELL2];
      const mk2Rate = m2def.heliumPerSec || 6, gain = mk2Rate - wellRate;
      const mk1 = up.filter(w => w.type === T.HELIUMWELL);
      if (mk2 && mk1.length) {
        const k = Math.min(mk1.length, Math.max(1, Math.ceil((want - made) / gain - 0.01)));
        steps.push(`Replace ${k === mk1.length && k > 1 ? `all ${k}` : k} of your Helium Wells with a Helium Well MK2 (${num(mk2Rate / wellRate)}× the helium, ${formatMoney(m2def.cost)} each). ` +
          `Build it right over the old well. It drains the field faster too.`);
      }
      const after = made + (mk2 ? mk1.length * gain : 0);
      if (after < want) {
        const per = mk2 ? mk2Rate : wellRate;
        const extra = Math.max(1, Math.ceil((want - after) / per - 0.01));
        steps.push(`Build ${mk2 ? extra : more} more Helium Well${mk2 ? ' MK2' : ''}${(mk2 ? extra : more) > 1 ? 's' : ''} ` +
          (free.length ? `on the helium gas field at ${locOf(free[0])}` : 'on a new helium gas field (every field you know of has a well, so run a Helium Scan)') +
          ', and send the helium to your Cryo Plants.');
      }
      const recycle = reactors.filter(r => !ashBack.has(r));
      for (const r of recycle.slice(0, 3)) { const s = ashStubOf(r); steps.push(`Pipe ${esc(nameOf(r))}'s HE ASH OUT at ${loc(s.c, s.r)} into the Cryo Plants' HE IN line. That cuts how much helium it uses.`); }
      steps.push(made >= needAll
        ? `Until then all ${n} can run, but with nothing spare to recover from a quench.`
        : `Until then you have enough helium for about ${Math.max(0, Math.floor(made / (needAll / n) + 0.01))} of your ${n} reactors. The others will quench.`);
      const mult = (typeof HELIUM_ORE_LIFE_MULT !== 'undefined' ? HELIUM_ORE_LIFE_MULT : 1.5) * (typeof Difficulty !== 'undefined' ? Difficulty.depositMult() : 1);
      const low = up.filter(w => w._linkedDeposit && w._linkedDeposit._oreMax > 0).sort((a, b) => a._linkedDeposit._oreAmount - b._linkedDeposit._oreAmount)[0];
      if (low) {
        const d = low._linkedDeposit;
        steps.push(`${esc(nameOf(low))} at ${locOf(low)} has ${Math.round(d._oreAmount / d._oreMax * 100)}% of its field left, about ${longSpan(d._oreAmount * mult / HeliumSystem.wellRate(low))}. Have a replacement running before then.`);
      }
      add({
        sev: (down.length || made < needAll) ? 3 : 2, key: 'all',
        title: (() => { const what = reactors.some(r => r.type === T.ADVFUSIONREACTOR) ? 'reactors' : 'Fusion Reactors';
          return made < needAll ? `Helium: ${n} ${what} need more wells` : `Helium: ${n} ${what} have nothing spare`; })(),
        why: `Your ${n} reactor${n > 1 ? 's need' : ' needs'} the helium of about ${Math.ceil(want / wellRate)} Helium Wells, and you're making the helium of about ${num(made / wellRate, 1)}` +
             `${wells.length > up.length ? ` (${wells.length - up.length} more ${wells.length - up.length > 1 ? 'are' : 'is'} unpowered or on an empty field)` : ''}. ` +
             (made >= needAll ? 'That runs them, but leaves almost nothing to refill a charge after a quench.' : 'Some will run out and quench.') +
             (down.length ? ` ${down.length} ${down.length > 1 ? 'are' : 'is'} down and need${down.length > 1 ? '' : 's'} ${num(refill)} more helium to relight` +
               (spare > 0.05 ? `, about ${longSpan(refill / spare)} at this rate.` : ', and none is spare.') : ''),
        steps, at: down[0] || reactors[0],
      });
    },

    function heliumBudget(add) {
      const rdef = EntityDefs[T.HULKINGFUSIONREACTOR], wdef = EntityDefs[T.HELIUMWELL], sdef = EntityDefs[T.HE3SEPARATOR];
      const wellRate = wdef.heliumPerSec || 2;
      const cryoOf = new Map();   // reactor → the Cryo Plants on its LHe IN
      for (const r of all(T.HULKINGFUSIONREACTOR))
        cryoOf.set(r, runFrom(HulkingFusionReactorSystem.getStubs(r).cryoIn).ports.filter(p => p.role === 'out' && p.e.type === T.CRYOPLANT).map(p => p.e));
      const wellsMake = HeliumSystem.allWells().filter(w => w.powered && !w._oreDepleted).reduce((n, w) => n + HeliumSystem.wellRate(w), 0);
      for (const e of all(T.HULKINGFUSIONREACTOR)) {
        const stubs = HulkingFusionReactorSystem.getStubs(e);
        const cap = rdef.heliumChargeCap || 400;
        const plants = cryoOf.get(e) || [];
        if (!plants.length) {
          if ((e._legacyCoolant || 0) > 0) continue;
          add({
            sev: 3, title: `${nameOf(e)} has no Cryo Plant on LHe IN`,
            why: 'Its magnets need liquid helium to stay cold. Without it they warm up and quench.',
            steps: all(T.CRYOPLANT).length
              ? [`Pipe a Cryo Plant's LHe OUT to this reactor's LHe IN at ${loc(stubs.cryoIn.c, stubs.cryoIn.r)}.`]
              : [`Build a Cryo Plant, feed it helium, and pipe its LHe OUT to LHe IN at ${loc(stubs.cryoIn.c, stubs.cryoIn.r)}.`],
            at: e,
          });
          continue;
        }
        // Everything standing between the magnets and a quench, and what refills it.
        let stock = Math.max(0, (e._heCharge || 0) - cap * 0.5), inflow = 0, ashBack = false;
        const holders = [];
        for (const p of plants) {
          stock += p._liquidHe || 0;
          for (const s of runFrom(CryoPlantSystem.getStubs(p).heliumIn).ports) {
            if (s.role !== 'out') continue;
            if (s.e.type === T.GASSTORAGE && (s.e._gasType === 'helium' || !s.e._gasType)) { stock += GasStorageSystem.stored(s.e); inflow += s.e._inRate || 0; if (!holders.includes(s.e)) holders.push(s.e); }
            else if (isHeliumWell(s.e)) { stock += s.e._helium || 0; if (s.e.powered) inflow += HeliumSystem.wellRate(s.e); }
            else if (s.e === e) ashBack = true;
          }
        }
        // A holder kept filled by drones or Haulers gets its helium in loads:
        // nothing comes in between them, so its own fill rate reads zero most
        // of the time. What it really receives is what the wells make.
        const supplied = holders.find(h => h._droneSupply === 'helium' || h._truckSupply === 'helium');
        let ferry = null;
        if (supplied) {
          const inbound = (supplied._droneSupply === 'helium' && typeof DroneSystem !== 'undefined' && DroneSystem.cargoInbound ? DroneSystem.cargoInbound(supplied) : 0) || 0;
          const waiting = all(T.GASSTORAGE).filter(g => g !== supplied && g._gasType === 'helium' && !holders.includes(g) && GasStorageSystem.stored(g) >= 1)
            .sort((a, b) => GasStorageSystem.stored(b) - GasStorageSystem.stored(a));
          ferry = { inbound, waiting };
          inflow = Math.max(inflow, wellsMake);
        }
        // The same plants serve every reactor piped to them, so the supply is split.
        const sharers = all(T.HULKINGFUSIONREACTOR).filter(r => (cryoOf.get(r) || []).some(p => plants.includes(p))).length || 1;
        inflow /= sharers;
        // Field Cores boil off on the same line, running or not.
        const coreBoil = typeof FieldCoreSystem !== 'undefined' ? FieldCoreSystem.boilOff(e) : 0;
        const use = (rdef.heliumBoilOff || 1) + coreBoil - (ashBack ? (rdef.heliumAshPerSec || 0.4) : 0);
        const net = use - inflow;
        // Running: only worth a finding if the helium in hand will not last.
        // Down (quenched, or never lit): say what it is waiting for.
        const down = !e._started;
        const left = net > 0.05 ? stock / net : Infinity;
        if (!down && left > 3600) continue;
        if (down && e._magnetsReady) continue;

        const steps = [];
        // Is a He-3 Separator taking the wells' output?
        const dhe3 = all(T.FUSIONFUELPLANT).some(f => f._fuelMode === 'dhe3') || all(T.HULKINGFUSIONREACTOR).some(r => r._fuelMode === 'dhe3');
        for (const w of HeliumSystem.allWells()) {
          const seen = new Set([w]), frontier = [runFrom(HeliumSystem.getStubs(w).heliumOut)];
          let sep = null, reachesCryo = false;
          while (frontier.length) {
            const run = frontier.pop();
            for (const p of run.ports) {
              if (p.role !== 'in' || seen.has(p.e)) continue;
              seen.add(p.e);
              if (p.e.type === T.HE3SEPARATOR) sep = sep || p;
              else if (p.e.type === T.CRYOPLANT) reachesCryo = true;
              else if (p.e.type === T.GASSTORAGE) frontier.push(runFrom(GasStorageSystem.getStubs(p.e).gasOut));
            }
          }
          if (sep && !reachesCryo) {
            steps.push(`${esc(nameOf(sep.e))} at ${locOf(sep.e)} takes all the helium from ${esc(nameOf(w))}, so none reaches the Cryo Plant. ` +
              (dhe3 ? 'You need it for D-He3, so build another Helium Well for the Cryo Plant.'
                    : `You aren't burning D-He3, so delete the pipe at its HELIUM IN, ${loc(sep.c, sep.r)}.`));
          }
        }
        if (!ashBack) {
          const ashRun = runFrom(stubs.ashOut);
          const heIn = plants.map(p => runFrom(CryoPlantSystem.getStubs(p).heliumIn)).find(r => r.piped);
          const n = heIn && nearest(ashRun.piped ? ashRun.tiles : [[stubs.ashOut.c, stubs.ashOut.r]], heIn.tiles);
          steps.push(n ? `Pipe the reactor's HE ASH OUT back to the Cryo Plant: from ${loc(n.a[0], n.a[1])} to ${loc(n.b[0], n.b[1])}, about ${num(n.dist)} tiles. That cuts the helium its magnets use.`
                       : `Pipe the reactor's HE ASH OUT at ${loc(stubs.ashOut.c, stubs.ashOut.r)} to the Cryo Plant's HE IN. That cuts the helium its magnets use.`);
        }
        if (supplied) {
          const by = supplied._droneSupply === 'helium' ? 'drones' : 'Haulers', w0 = ferry.waiting[0];
          steps.push(`The Cryo Plant's helium comes through ${esc(nameOf(supplied))} at ${locOf(supplied)}, filled by ${by} one load at a time. It holds ${num(GasStorageSystem.stored(supplied))} now` +
            (ferry.inbound > 0 ? `, with ${num(ferry.inbound)} on the way` : (supplied._droneSupply === 'helium' ? ', and nothing is on the way' : '')) +
            (w0 ? `; ${num(GasStorageSystem.stored(w0))} more is waiting in ${esc(nameOf(w0))} at ${locOf(w0)}.` : '.'));
          if (!ferry.inbound && !w0) steps.push('Nothing is waiting to be carried, so the real shortage is the wells. See the helium supply entry.');
          else if (!ferry.inbound && w0) steps.push(`Helium is waiting but not moving. Check a powered Drone Port covers both holders, or set ${esc(nameOf(supplied))}'s Truck Supply to Helium.`);
        }
        else if (holders.length) steps.push(`Nothing refills ${esc(nameOf(holders[0]))} at ${locOf(holders[0])}. Pipe a Helium Well into its GAS IN, or set its Drone Supply or Truck Supply to Helium.`);
        else steps.push('Pipe a Helium Well, or a Gas Holder kept supplied with helium, into the Cryo Plant\'s HE IN.');
        if (coreBoil > 0) {
          const n = Math.round(coreBoil / (FieldCoreSystem.BOIL_PER_CORE || 1.5));
          steps.push(`Its ${n} Field Core${n > 1 ? 's' : ''} add to the helium it uses, and a quench is costly for them too. Find more helium or set fewer core slots in its panel.`);
        }
        if (down) {
          const want = Math.ceil(cap * 0.95), arriving = inflow >= 0.05, more = Math.max(0, want - (e._heCharge || 0));
          add({
            sev: 3,
            title: `${nameOf(e)} is down: waiting on helium`,
            why: arriving ? `It relights by itself once it has ${num(more)} more liquid helium and its magnets are cold. At the current supply that takes about ${longSpan(more / inflow)}${sharers > 1 ? ` (${sharers} reactors share it)` : ''}.`
                          : `It needs ${num(more)} more liquid helium to relight, and none is reaching the Cryo Plant.`,
            steps: arriving
              ? steps.filter(t => t.startsWith('The Cryo Plant')).concat(['To speed this up, see the helium supply entry.',
                 `Relighting pulls a ${num((rdef.startupSurge || 5000) / 1000)} MW surge for ${rdef.startupSurgeSeconds || 5} seconds. If the grid can't carry it, the network blacks out and it retries every ${rdef.startupRetrySeconds || 20} seconds.`])
              : steps.concat([`Once helium flows it needs a couple of minutes to cool, then a ${num((rdef.startupSurge || 5000) / 1000)} MW surge to relight.`]),
            at: e,
          });
          continue;
        }
        add({
          sev: left < 1200 ? 3 : 2,
          title: `${nameOf(e)}: helium runs out in about ${mins(left)}`,
          why: `Its magnets use helium faster than it arrives. When it runs out they quench, the reactor stops, and relighting takes a ${num((rdef.startupSurge || 5000) / 1000)} MW surge.`,
          steps, at: e,
        });
      }
    },

    // Could the grid relight the reactor if it went out?
    function restartMargin(add) {
      const rdef = EntityDefs[T.HULKINGFUSIONREACTOR];
      const st = PowerNetwork.stats || {};
      const gen = st.totalGenerated || 0, used = st.totalConsumed || 0;
      if (!(gen > 0)) return;
      for (const e of all(T.HULKINGFUSIONREACTOR)) {
        if (!e._started) continue;
        const run = runFrom(HulkingFusionReactorSystem.getStubs(e).powerOut);
        let fusion = 0;
        const counted = new Set();
        for (const [c, r] of run.tiles) for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const nb = GridManager.inBounds(c + dc, r + dr) ? GridManager.getEntity(c + dc, r + dr) : null;
          if (!nb || counted.has(nb) || (nb.type !== T.STEAMTURBINE && nb.type !== T.STEAMTURBINE2)) continue;
          counted.add(nb);
          if (nb._generating) fusion += nb._currentOutput || 0;
        }
        if (!(fusion > 0)) continue;
        const without = gen - fusion - used;
        const surge = rdef.startupSurge || 5000;
        if (without >= surge) continue;
        const idleGens = all(T.FUELGEN).filter(g => g._fgState === 'nopipe' || g._fgState === 'nofuel');
        const idle = idleGens.length;
        const steps = [`Add about ${num(Math.ceil((surge - without) / 100) * 100)} kW of generation that doesn't depend on this reactor, or charged storage covering ${num(surge / 1000)} MW for ${rdef.startupSurgeSeconds || 5} seconds.`];
        relightShort = true;
        if (idle) steps.push(`${idle} Fuel Generator${idle > 1 ? 's have' : ' has'} no fuel. Fuelled, ${idle > 1 ? 'they' : 'it'} would add up to ${num(idle * (EntityDefs[T.FUELGEN].powerOutput || 165))} kW (see the entry below).`);
        add({
          sev: without < 0 ? 2 : 1,
          title: `The grid couldn't relight ${nameOf(e)}`,
          why: `If it ever stops, the rest of the grid is ${without < 0 ? `${num(-without)} kW short of demand` : `only ${num(without)} kW over demand`}, and a relight needs ${num(surge)} kW. It would stay down, and each failed attempt blacks out its network.`,
          steps, at: e,
        });
      }
    },

    // ── Advanced Fusion Reactor short of D-He3 pellets ───────────────
    // Fusion Fuel Plants make D-T first and send D-He3 only from what is
    // left, at most a quarter of their rate (0.156/s), so one reactor at
    // 0.4/s needs three plants' D-He3 lines, and a D-He3 OUT with no belt on
    // it sits full and gives nothing.
    function advFuel(add) {
      const fd = EntityDefs[T.FUSIONFUELPLANT] || {}, each = (fd.plasmaPerSec || 0.625) * (fd.he3PelletShare || 0.25);
      const adef = EntityDefs[T.ADVFUSIONREACTOR] || {}, need = adef.plasmaPerSec || 0.4, ring = EntityDefs[T.MHDRING] || {};
      const F = typeof FieldCoreSystem !== 'undefined' ? FieldCoreSystem : null;
      for (const a of all(T.ADVFUSIONREACTOR)) {
        if (!a._started || !a.powered) continue;
        const idle = a._idleFull || (a._highBeta || 0) >= (adef.highBetaCapacity || 120000) * 0.99;
        const burn = Math.max(0, Math.min(1, a._burnRatio ?? 0));
        // What it burns with its Field Cores, against what the plants make.
        // Running at full off a Storage Container's stock it reads 100% right
        // up to the moment the stock runs out, then stops until a drone or the
        // belt brings more: so a reactor burning faster than its plants make
        // is reported while it still looks fine, with how long the stock lasts.
        const cores = F ? F.liveCount?.(a) ?? (Array.isArray(a._cores) ? a._cores.filter(c => (c.charge || 0) > 0).length : 0) : 0;
        // Over time it only burns as much as its MHD Rings draw off: with a
        // full ion buffer it idles. So the pellets it needs on average are the
        // full burn times the share of its ion stream the rings take.
        const rings = new Set(); const st = AdvancedFusionReactorSystem.getStubs(a);
        for (const sx of [st.ionOutA, st.ionOutB]) for (const p of runFrom(sx).ports) if (p.e.type === T.MHDRING) rings.add(p.e);
        const ionMade = (adef.highBetaPerSec || 4800) * (a._coolFactor ?? 1);
        const duty = rings.size ? Math.min(1, rings.size * (ring.highBetaDraw || 1000) / Math.max(1, ionMade)) : 1;
        const fullBurn = need * (F ? F.fuelFactor(a) : 1), needF = fullBurn * duty;
        const plants0 = all(T.FUSIONFUELPLANT);
        const supply = plants0.reduce((n, p) => n + (p.powered && p._hasHe3 && p._he3LineOpen !== false
          ? Math.max(p._heRate || 0, (p._he3Pellets || 0) >= (fd.he3PelletCapacity || 50) * 0.9 ? each : 0) : 0), 0);
        // Checked whatever the reactor is doing right now: between empty bins
        // it is back at full burn, or idling on a full ion buffer, and the
        // finding came off the report (as fixed) while nothing had changed.
        const short = supply < needF * 0.97;
        // The Storage Container on its PELLETS IN, if one feeds it.
        const stub0 = st.plasmaIn;
        let bin = null;
        { const run = beltRun(stub0.c, stub0.r);
          for (let i = 0; i < run.n && !bin; i++) {
            const b = run.ent[i];
            if (b && b.type === T.SOLIDSTORAGE && (b._solidType === 'he3pellets' || b._droneSupply === 'he3pellets')) bin = b;
          }
          if (!bin) { const b = GridManager.getEntity(stub0.c - 1, stub0.r); if (b && b.type === T.SOLIDSTORAGE) bin = b; } }
        // Enough on average, but only just, and brought by drone: loads land
        // every half minute or so and the reactor burns its full rate while
        // it runs, so a bin that never builds a stock runs dry between loads
        // and the reactor stops and starts. More supply lets the bin fill.
        const payload = (typeof EntityDefs !== 'undefined' && EntityDefs[T.DRONEPORT] && EntityDefs[T.DRONEPORT].cargoPayloadSolid) || 133;
        if (!short && bin && bin._droneSupply && supply < needF * 1.15 && (bin._stored || 0) < payload * 2) {
          const tsteps = [];
          const room = Math.max(1, Math.ceil((needF * 1.25 - supply) / each - 0.01));
          tsteps.push(`Build ${room} more Fusion Fuel Plant${room > 1 ? 's' : ''} with deuterium and helium-3 piped in. With the extra, ${esc(nameOf(bin))} fills up between loads and carries the reactor over the gaps.`);
          tsteps.push(`Or belt the Fuel Plants' D-He3 OUT straight to PELLETS IN at ${loc(stub0.c, stub0.r)}: a belt brings pellets steadily rather than a load at a time.`);
          if (F && cores > 0) {
            let b = 0; for (let i = 0; i < cores - 1; i++) b += (F.BOOST || [0.5, 0.3, 0.2])[i];
            const burnN = need * (1 + (F.FUEL_PER_BOOST || 0.35) * b) * duty;
            tsteps.push(`Or run ${cores - 1 ? cores - 1 : 'no'} Field Core${cores - 1 === 1 ? '' : 's'} instead of ${cores}: it then needs ${num(burnN, 2)}/s.`);
          }
          add({ sev: 1, key: 'thin', title: `${nameOf(a)} only just gets enough D-He3 pellets: it stops and starts between drone loads`,
            why: `It needs ${num(needF, 2)} pellets/s on average${rings.size ? ` for its ${rings.size} MHD Ring${rings.size === 1 ? '' : 's'}` : ''} (${num(fullBurn, 2)}/s while it runs) and the Fuel Plants make ${num(supply, 2)}/s. Drones bring them to ${esc(nameOf(bin))} at ${locOf(bin)} a load at a time, and with so little to spare it never builds a stock (${num(bin._stored || 0)} in it), so it runs dry before each next load lands.`,
            steps: tsteps, at: a });
          continue;
        }
        if (!short && (burn >= 0.95 || idle)) continue;
        const plants = plants0, fed = plants.filter(p => p._he3PelletConveyorOut);
        const unbelted = plants.filter(p => p._he3LineOpen && !p._he3PelletConveyorOut);
        const stub = AdvancedFusionReactorSystem.getStubs(a).plasmaIn;
        const steps = [];
        if (!a._pelletLinked) steps.push(`Belt D-He3 pellets to PELLETS IN at ${loc(stub.c, stub.r)} from a Fusion Fuel Plant's D-He3 OUT or a Storage Container.`);
        for (const p of unbelted.slice(0, 3)) { const o = FusionFuelPlantSystem.getStubs(p).he3PelletOut; steps.push(`Belt D-He3 OUT at ${loc(o.c, o.r)} on ${esc(nameOf(p))} (${locOf(p)}) into the line to PELLETS IN.`); }
        // The split: D-T first, D-He3 from what is left (at most a quarter of
        // the rate). Fusion Reactors take D-T from the first stocked plant on
        // their belt, so those plants give no D-He3: only plants with rate to
        // spare count, and the answer to too few is more plants.
        const allDT = fed.filter(p => (p._dtRate || 0) > each * 3 && (p._heRate || 0) < 0.01);
        // Making D-He3, or able to: one sitting full is only waiting on the belt.
        const making = fed.filter(p => (p._heRate || 0) > 0.01 || ((p._he3Pellets || 0) >= (fd.he3PelletCapacity || 50) * 0.9 && (p._dtRate || 0) < each * 3));
        // Plants short of their full D-He3 (D-T comes first) count for what
        // they make, so the shortfall decides how many more are needed.
        const more = short ? Math.max(1, Math.ceil((needF - supply) / each - 0.01)) : Math.max(0, Math.ceil(needF / each - 0.01) - making.length);
        if (more) steps.push(`Build ${more} more Fusion Fuel Plant${more > 1 ? 's' : ''} with deuterium and helium-3 piped in, and get its D-He3 OUT to PELLETS IN at ${loc(stub.c, stub.r)}. This reactor needs ${num(needF, 2)} pellets/s${cores ? ` with its ${cores} Field Core${cores === 1 ? '' : 's'}` : ''}, and ${making.length} plant${making.length === 1 ? ' is' : 's are'} making ${num(supply, 2)}/s of it.`);
        // Fewer Field Cores: the fewest that brings the burn inside the supply.
        if (F && cores > 0 && short) {
          for (let n = cores - 1; n >= 0; n--) {
            let b = 0; for (let i = 0; i < n; i++) b += (F.BOOST || [0.5, 0.3, 0.2])[i];
            const burnN = need * (1 + (F.FUEL_PER_BOOST || 0.35) * b) * duty;
            if (burnN <= supply) { steps.push(`Or run ${n ? n : 'no'} Field Core${n === 1 ? '' : 's'} instead of ${cores} (set it in the reactor's panel): it then needs ${num(burnN, 2)}/s, inside what the plants make.`); break; }
          }
        }
        if (allDT.length) steps.push(`${allDT.map(p => `${esc(nameOf(p))} at ${locOf(p)}`).join(' and ')} ${allDT.length > 1 ? 'make' : 'makes'} only D-T for the Fusion Reactors, so ${allDT.length > 1 ? 'they give' : 'it gives'} no D-He3. That is normal.`);
        for (const p of fed.slice(0, 3)) {
          if (allDT.includes(p)) continue;
          if (!p.powered) steps.push(`${esc(nameOf(p))} at ${locOf(p)} has no power.`);
          else if (!p._hasHe3) steps.push(`Pipe helium-3 to HE-3 IN on ${esc(nameOf(p))} at ${locOf(p)}.`);
          else if ((p._heRate || 0) < each * 0.6 && (p._dtRate || 0) > 0.05) steps.push(`${esc(nameOf(p))} at ${locOf(p)} makes little D-He3 because D-T comes first.`);
        }
        const mw = Math.min(rings.size * (ring.powerOutput || 4000), (adef.highBetaPerSec || 4800) / (ring.highBetaDraw || 1000) * (ring.powerOutput || 4000)) * (1 - burn) / 1000;
        // The stock it is living off, if a Storage Container feeds it.
        let stockWhy = '';
        if (short && (burn >= 0.95 || idle)) {
          const run = beltRun(stub.c, stub.r);
          let bin = null;
          for (let i = 0; i < run.n && !bin; i++) {
            const b = run.ent[i];
            if (b && b.type === T.SOLIDSTORAGE && (b._solidType === 'he3pellets' || b._droneSupply === 'he3pellets')) bin = b;
          }
          if (!bin) { const b = GridManager.getEntity(stub.c - 1, stub.r); if (b && b.type === T.SOLIDSTORAGE) bin = b; }
          const left = bin ? (bin._stored || 0) / Math.max(0.01, needF - supply) : 0;
          stockWhy = bin
            ? `It needs ${num(needF, 2)} D-He3 pellets/s${rings.size ? ` to keep its ${rings.size} MHD Ring${rings.size === 1 ? '' : 's'} fed` : ''} and the Fuel Plants make ${num(supply, 2)}/s, so it is running down ${esc(nameOf(bin))} at ${locOf(bin)} (${num(bin._stored || 0)} left, about ${mins(left)}). When that is empty it stops and starts as each load arrives.`
            : `It needs ${num(needF, 2)} D-He3 pellets/s${rings.size ? ` to keep its ${rings.size} MHD Ring${rings.size === 1 ? '' : 's'} fed` : ''} and the Fuel Plants make ${num(supply, 2)}/s, so it stops and starts as pellets arrive.`;
        }
        add({ sev: burn < 0.6 ? 3 : 2, title: short && (burn >= 0.95 || idle)
            ? `${nameOf(a)} burns D-He3 pellets faster than they are made: it will keep shutting down`
            : `${nameOf(a)} is running at ${Math.round(burn * 100)}%: needs more D-He3 pellets`,
          why: (stockWhy ? stockWhy + ' ' : '') + 'Its MHD Rings run at the same level.' + (mw >= 0.5 && burn < 0.95 ? ` That is about ${num(mw, 1)} MW lost.` : ''),
          steps: steps.length ? steps : ['Open the reactor: its Pellets Short row reads the Fuel Plants feeding it.'], at: a });
      }
    },

    // ── Advanced Fusion Reactor: the stops it has had ────────────────
    // From the outage log (trackOutages): how often it went offline over
    // the last day, for how long, why each time, and what fixes the cause.
    // It stays on the report until a whole day passes without one.
    function advOutages(add) {
      const now = DayNight.getElapsed(), hr = DayNight.secondsPerGameHour();
      const fd = EntityDefs[T.FUSIONFUELPLANT] || {}, each = (fd.plasmaPerSec || 0.625) * (fd.he3PelletShare || 0.25);
      const adef = EntityDefs[T.ADVFUSIONREACTOR] || {}, ring = EntityDefs[T.MHDRING] || {};
      const F = typeof FieldCoreSystem !== 'undefined' ? FieldCoreSystem : null;
      for (const a of all(T.ADVFUSIONREACTOR)) {
        const st = _outLog.get(a.col + ',' + a.row);
        if (!st) continue;
        const stops = st.log.slice();
        if (st.cur && now - st.cur.at >= OUT_MIN_SECS) stops.push({ ...st.cur, end: now, ongoing: true });
        if (!stops.length) continue;
        const total = stops.reduce((n, o) => n + (o.end - o.at), 0);
        const longest = stops.reduce((m, o) => Math.max(m, o.end - o.at), 0);
        const counts = {};
        for (const o of stops) counts[o.why] = (counts[o.why] || 0) + 1;
        const label = { pellets: 'out of D-He3 pellets', nolink: 'no pellet line to it', power: 'its grid ran out of power', cooling: 'short of cooling', magnets: 'its magnets were short of liquid helium' };
        const whyList = Object.entries(counts).sort((x, y) => y[1] - x[1]).map(([w, n]) => `${label[w] || w} (${n}×)`).join(', ');
        const stamp = (o) => { const t = ((o.at / hr) % 24 + 24) % 24; return `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.floor((t % 1) * 60)).padStart(2, '0')}`; };
        const steps = [];
        const rings = new Set(); const rs = AdvancedFusionReactorSystem.getStubs(a);
        for (const sx of [rs.ionOutA, rs.ionOutB]) for (const p of runFrom(sx).ports) if (p.e.type === T.MHDRING) rings.add(p.e);
        if (counts.pellets || counts.nolink) {
          const ionMade = (adef.highBetaPerSec || 4800) * (a._coolFactor ?? 1);
          const duty = rings.size ? Math.min(1, rings.size * (ring.highBetaDraw || 1000) / Math.max(1, ionMade)) : 1;
          const base = adef.plasmaPerSec || 0.4, full = base * (F ? F.fuelFactor(a) : 1), needAvg = full * duty;
          const supply = all(T.FUSIONFUELPLANT).reduce((n, p) => n + (p.powered && p._hasHe3 && p._he3LineOpen !== false
            ? Math.max(p._heRate || 0, (p._he3Pellets || 0) >= (fd.he3PelletCapacity || 50) * 0.9 ? each : 0) : 0), 0);
          if (counts.nolink) steps.push(`Belt D-He3 pellets to PELLETS IN at ${loc(rs.plasmaIn.c, rs.plasmaIn.r)}, from a Fusion Fuel Plant's D-He3 OUT or a Storage Container they are delivered to.`);
          if (supply < needAvg * 1.25) {
            const more = Math.max(1, Math.ceil((needAvg * 1.25 - supply) / each - 0.01));
            steps.push(`It needs ${num(needAvg, 2)} D-He3 pellets/s on average (${num(full, 2)}/s while it burns) and the Fuel Plants make ${num(supply, 2)}/s. Build ${more} more Fusion Fuel Plant${more > 1 ? 's' : ''} with deuterium and helium-3 piped in, so its pellet store can fill and carry it over the gaps.`);
          } else {
            steps.push(`The Fuel Plants now make ${num(supply, 2)}/s against the ${num(needAvg, 2)}/s it needs, so if it was short before, that is covered now. If it keeps stopping for pellets, they are being held up on the way: a belt straight from the plants' D-He3 OUT brings them steadily rather than a drone load at a time.`);
          }
        }
        if (counts.power) steps.push(`It lost its own power ${counts.power}×: the network it is on ran short, and without power for its magnets and injectors it stops, taking its MHD Rings with it. Add generation or storage to that network so it holds through your tightest hour (the Grid panel's history shows when that is).`);
        if (counts.cooling) steps.push(`Its cooling ran short ${counts.cooling}×. Add Cooling Towers MK2 on the line to COOLANT IN at ${loc(rs.coolantIn.c, rs.coolantIn.r)}.`);
        if (counts.magnets) steps.push(`Its magnets ran short of liquid helium ${counts.magnets}×. Add Cryo Plants, and the helium to feed them, on the line to CRYO IN at ${loc(rs.cryoIn.c, rs.cryoIn.r)}.`);
        const last = stops[stops.length - 1];
        add({ sev: stops.length >= 3 || counts.power ? 3 : 2, key: 'outages',
          title: `${nameOf(a)} went offline ${stops.length} time${stops.length === 1 ? '' : 's'} in the last day (${mins(total)} in all)`,
          why: `Each time: ${whyList}. The longest was ${mins(longest)}; the last began at ${stamp(last)}${last.ongoing ? ' and it is still down' : ''}.`
             + (rings.size ? ` Its ${rings.size} MHD Ring${rings.size === 1 ? '' : 's'} go down with it once its ion stream runs out.` : ''),
          steps, at: a });
      }
    },

    // ── Cryo Plants: can they liquefy what the magnets boil off? ─────
    // The ash comes back as gas, so it goes through the plants too: the
    // plants have to liquefy the magnets' whole boil-off, not just what the
    // wells make. When they can't, every plant sits empty, gas backs up at
    // the wells, and the charges with the least priority (the Advanced
    // Fusion Reactor's, which fills last) slide towards the line where
    // cooling stops. More wells don't help; more plants do.
    function cryoCapacity(add) {
      const plants = all(T.CRYOPLANT).filter(p => p.powered && !p._lightningDamaged);
      const reactors = all(T.HULKINGFUSIONREACTOR).filter(r => r._cryoLinked && !((r._legacyCoolant || 0) > 0))
        .concat(all(T.ADVFUSIONREACTOR).filter(r => r._cryoLinked));
      const lit = reactors.filter(r => r._started);
      if (!plants.length || !lit.length) return;
      const per = EntityDefs[T.CRYOPLANT].heliumPerSec || 3, liq = plants.length * per;
      const boil = lit.reduce((s, r) => s + boilOf(r), 0);
      const dry = plants.every(p => (p._liquidHe || 0) < 25);
      const low = lit.filter(r => (r._heCharge || 0) < capOf(r) * 0.75).sort((a, b) => (a._heCharge / capOf(a)) - (b._heCharge / capOf(b)));
      // Dry plants and a low charge are also what refilling looks like: with
      // plants to spare the reactors take every drop as it is made, so the
      // plants read empty while the charge climbs. Only a charge that has
      // fallen since the last check says the plants aren't keeping up.
      const sliding = low.filter(r => _heSeen.has(r) && (r._heCharge || 0) < _heSeen.get(r) - 0.01);
      for (const r of lit) _heSeen.set(r, r._heCharge || 0);
      // A full tank only says gas is plentiful while the wells keep it full:
      // one draining with nothing coming in runs the plants dry soon. And
      // plants sitting dry with gas short is heliumSupply's finding, not a
      // call for more plants.
      const { short } = heliumAccount();
      if (liq >= boil * 1.15 && !(dry && sliding.length && !short)) return;
      const wells = HeliumSystem.allWells();
      const backedUp = wells.filter(w => (w._helium || 0) >= (EntityDefs[w.type].heliumCapacity || 1000) * 0.5);
      const banked = all(T.GASSTORAGE).filter(g => g._gasType === 'helium').reduce((n, g) => n + GasStorageSystem.stored(g), 0);
      const more = Math.max(1, Math.ceil((boil * 1.25 - liq) / per));
      const worst = low[0], wfrac = worst ? (worst._heCharge || 0) / capOf(worst) : 1;
      const p0 = plants[0], s0 = CryoPlantSystem.getStubs(p0);
      const need = Math.ceil(boil * 1.25 / per);
      // Enough plants on paper and a charge still falling: more plants isn't
      // the answer, so don't ask for them.
      if (plants.length >= need && worst) {
        const rs = (worst.type === T.ADVFUSIONREACTOR ? AdvancedFusionReactorSystem : HulkingFusionReactorSystem).getStubs(worst);
        add({
          sev: wfrac < 0.65 ? 3 : 2, key: 'all',
          title: `${nameOf(worst)}: helium charge falling`,
          why: `Your ${plants.length} Cryo Plants make enough liquid helium for your reactors, but ${nameOf(worst)}'s charge is at ${Math.round(wfrac * 100)}% and still falling, so not all of it is reaching it. ` +
               `Below 50% its magnets quench${worst.type === T.ADVFUSIONREACTOR ? ' and it arcs over nearby buildings' : ''}.`,
          steps: [
            `Check every Cryo Plant's LHe OUT is on the same line as this reactor's LHe IN at ${loc(rs.cryoIn.c, rs.cryoIn.r)}.`,
            'Check none of the plants keep tripping. They trip in an outage, so put them on a network that stays up.',
          ],
          at: worst,
        });
        return;
      }
      add({
        sev: wfrac < 0.65 ? 3 : 2, key: 'all',
        title: `Build ${more} more Cryo Plant${more > 1 ? 's' : ''}`,
        why: `Your reactors need ${num(need)} Cryo Plant${need > 1 ? 's' : ''} to stay cold and refill after a quench, and you have ${plants.length} running.` +
             (short ? ' You\'re short of helium gas too, so build the wells as well.'
               : backedUp.length || banked > 500 ? ' Gas is not the problem, so more wells won\'t help.' : '') +
             (worst ? ` ${nameOf(worst)}'s helium charge is at ${Math.round(wfrac * 100)}%. Below 50% its magnets quench${worst.type === T.ADVFUSIONREACTOR ? ' and it arcs over nearby buildings' : ''}.` : ''),
        steps: [
          `Connect HE IN to the same helium line as ${esc(nameOf(p0))} (its HE IN is at ${loc(s0.heliumIn.c, s0.heliumIn.r)}), and LHe OUT to the same line as its LHe OUT at ${loc(s0.liquidOut.c, s0.liquidOut.r)}.`,
          'Put them on a network that stays up: they trip in an outage.',
        ],
        at: worst || p0,
      });
    },

    // ── Operation Hyperion: will the grid carry the next stage? ─────────
    // Stage IV ties in a 20 MW load around the clock and stage V a 30 MW
    // one. The station loses power the moment its network can't carry it,
    // and every outage costs an hour. Judged on the city's tightest spare
    // over the last day (Grid Analyzer samples: generation not counting
    // storage, less demand not counting the station's own draw), so it holds
    // at the evening peak, not just now. Then the power to be had: what is
    // standing idle and why, and what stage V will not allow.
    function meridianPower(add) {
      if (typeof NationalProject === 'undefined') return;
      const v = NationalProject.visual(), st = all(T.NATIONALGRID)[0];
      if (!st || !v || v.complete || !(v.stage >= 0 && v.stage <= 3)) return;
      const EXP = NationalProject.EXPORT_KW || 20000, FIN = NationalProject.FINAL_EXPORT_KW || 30000;
      // [label, kW, severity if short]: what comes next, and stage V beyond it.
      // (v.stage is the station's old numbering: 2 is The Line, Stage IV.)
      const goals = v.stage <= 1 ? [['IV', EXP, v.stage === 1 ? 3 : 2], ['V', FIN, 1]] : v.stage === 2 ? [['IV', EXP, 3], ['V', FIN, 2]] : [['V', FIN, 3]];
      const net = st.networkId, s = PowerNetwork.stats || {};
      const gN = (s.genSources || []).find(n => n.netId === net), cN = (s.conSources || []).find(n => n.netId === net);
      if (!gN && !cN) return;
      const hourLen = DayNight.secondsPerGameHour();
      const merAt = (t) => NationalProject.demandKW((((t / hourLen) % 24) + 24) % 24);
      const storeOut = (g) => (g && g.sources && g.sources.get ? (g.sources.get('storage') || {}).w || 0 : 0);
      const spareNow = ((gN ? gN.supply : 0) - storeOut(gN)) - ((cN ? cN.demand : 0) - (st.powered ? merAt(DayNight.getElapsed()) : 0));
      const h = typeof GridAnalyzer !== 'undefined' && GridAnalyzer.samples ? GridAnalyzer.samples(net, 24) : null;
      let spare = spareNow, at = null, from = 'now';
      if (h && h.covered >= 12) {
        spare = Infinity;
        for (let k = 0; k < h.t.length; k++) {
          const sk = (h.g[k] - (h.o[k] || 0)) - (h.c[k] - merAt(h.t[k]));
          if (sk < spare) { spare = sk; at = h.t[k]; }
        }
        from = 'day';
      } else spare = spareNow * 0.8;               // under half a day on record: allow for the evening peak
      // A tenth over: anything less is on paper only, and the first cloud,
      // new customer or tripped turbine drops the station.
      const short = goals.filter(([, kW]) => spare < kW * 1.1);
      if (!short.length) return;
      const [label, kW, sev] = short[0];
      const gap = kW * 1.1 - spare;
      const atClock = at !== null ? (() => { const hh = (((at / hourLen) % 24) + 24) % 24; return `${String(Math.floor(hh)).padStart(2, '0')}:${String(Math.floor((hh % 1) * 60)).padStart(2, '0')}`; })() : null;

      // Power to be had, biggest first: [kW, text].
      const gains = [];
      const turb = EntityDefs[T.STEAMTURBINE] || {}, turb2 = EntityDefs[T.STEAMTURBINE2] || {};
      for (const type of [T.NUCLEARREACTOR, T.ADVREACTOR]) for (const e of all(type)) {
        const why = fissionStopped(e);
        if (!why) continue;
        const tb = runFrom(NuclearSystem.getStubs(e).steamOut).ports.filter(p => p.role === 'in' && (p.e.type === T.STEAMTURBINE || p.e.type === T.STEAMTURBINE2)).map(p => p.e);
        const kw = tb.reduce((n, t) => n + ((t.type === T.STEAMTURBINE2 ? turb2 : turb).powerOutput || 0), 0);
        if (kw > 0) gains.push([kw, `Restart ${esc(nameOf(e))} at ${locOf(e)} for ${num(kw / 1000, 1)} MW: ${why.short}. See its own entry.`]);
      }
      for (const e of all(T.HULKINGFUSIONREACTOR)) {
        const tb = runFrom(HulkingFusionReactorSystem.getStubs(e).powerOut).ports.filter(p => p.role === 'in' && (p.e.type === T.STEAMTURBINE || p.e.type === T.STEAMTURBINE2)).map(p => p.e);
        const lost = tb.reduce((n, t) => n + Math.max(0, (t.def?.powerOutput || (t.type === T.STEAMTURBINE2 ? turb2 : turb).powerOutput || 0) - (t._generating ? (t._currentOutput || 0) : 0)), 0);
        if (lost >= 500) gains.push([lost, `Get ${esc(nameOf(e))} to full power for ${num(lost / 1000, 1)} MW: it is ${e._started ? 'not running at full rate (usually pellets; see its own entry)' : 'not lit'}.`]);
      }
      const ring = EntityDefs[T.MHDRING] || {}, adef = EntityDefs[T.ADVFUSIONREACTOR] || {};
      for (const a of all(T.ADVFUSIONREACTOR)) {
        const st2 = AdvancedFusionReactorSystem.getStubs(a), seen = new Set();
        for (const stub of [st2.ionOutA, st2.ionOutB]) for (const p of runFrom(stub).ports) if (p.e.type === T.MHDRING) seen.add(p.e);
        const n = seen.size, cap = (adef.highBetaPerSec || 4800) / (ring.highBetaDraw || 1000), full = Math.min(n, cap) * (ring.powerOutput || 4000);
        const best = cap * (ring.powerOutput || 4000);
        const burnA = Math.max(0, Math.min(1, a._burnRatio ?? 1));
        if (a._started && burnA < 0.95) gains.push([full * (1 - burnA), `Get ${esc(nameOf(a))} more D-He3 pellets for ${num(full * (1 - burnA) / 1000, 1)} MW: it is at ${Math.round(burnA * 100)}% (see its own entry).`]);
        if (!a._cooled && a._started) gains.push([full * (1 - (adef.uncooledOutputFrac ?? 0.3)), `Give ${esc(nameOf(a))} two Cryogenic Cooling Towers on CRYO IN: without enough coolant its MHD Rings run at ${Math.round((adef.uncooledOutputFrac ?? 0.3) * 100)}%.`]);
        if (best - full >= 1000) gains.push([best - full, `Add an MHD Ring to ${esc(nameOf(a))} (it has ${n}) and pipe it to ION OUT A or B, for up to ${num(best / 1000, 1)} MW in all.`]);
      }
      const fg = all(T.FUELGEN), fdef = EntityDefs[T.FUELGEN] || {};
      const fLost = fg.filter(g => ['starved', 'nofuel', 'nopipe'].includes(g._fgState)).reduce((n, g) => n + Math.max(0, (fdef.powerOutput || 0) - (g._fgState === 'starved' ? (g.def?.powerOutput || 0) : 0)), 0);
      if (fLost >= 300 && label === 'IV') gains.push([fLost, `Fuel your Fuel Generators for ${num(fLost / 1000, 1)} MW (see the fuel entries). Stage V bans them, so this only helps for stage IV.`]);
      gains.sort((a, b) => b[0] - a[0]);

      const steps = gains.slice(0, 5).map(g => g[1]);
      const fossil = [T.COALGENERATOR, T.FUELGEN].reduce((n, t) => n + all(t).filter(g => g._generating !== false && g.powered !== false).reduce((m, g) => m + (g._currentOutput || g.def?.powerOutput || 0), 0), 0);
      if (goals.some(g => g[0] === 'V') && fossil >= 200)
        steps.push(`Replace your coal and oil generators (about ${num(fossil / 1000, 1)} MW) before stage V, which bans them.`);
      const found = gains.reduce((n, g) => n + g[0], 0);
      if (found < gap) steps.push(`Build about ${num(Math.ceil((gap - found) / 1000))} MW more${found > 0 ? ' on top of that' : ''}. A second Advanced Fusion Reactor with four or five MHD Rings gives 16 to 19 MW.`);
      steps.push("Batteries won't carry it: the stage runs for days, so it needs generation.");
      if (NationalProject.standby && NationalProject.standby())
        steps.push(`Nothing is lost while you build: Hyperion waits until you press INITIATE STAGE ${label} in the dossier.`);

      add({
        sev, key: 'all', at: st,
        title: spare >= kW
          ? `Hyperion stage ${label}: you need about ${num(Math.ceil(gap / 1000))} MW more to hold it safely`
          : `Hyperion stage ${label}: you need about ${num(Math.ceil(gap / 1000))} MW more`,
        why: `Stage ${label} draws ${num(kW / 1000)} MW around the clock. ` +
             (from === 'day' ? `At your tightest hour${atClock ? `, about ${atClock},` : ''} you had ${num(Math.max(0, spare) / 1000, 1)} MW spare, not counting storage. `
                             : `You have about ${num(Math.max(0, spare) / 1000, 1)} MW spare, allowing for the evening peak. `) +
             'Each outage costs an hour of progress.' +
             (short.length > 1 ? ` Stage ${short[1][0]} will need ${num(short[1][1] / 1000)} MW.` : ''),
        steps,
      });
    },

    // A refinery sitting full because nothing is on the end of its FUEL OUT.
    // (OilSystem.tickRefinery counts what the outlet line reaches.)
    // Left alone when nothing wants the fuel: a refinery parked full is only a
    // fault if the grid needs its generators, or its LPG line has stopped with it.
    function refineryDeadEnd(add) {
      const gens = all(T.FUELGEN);
      const wanted = fuelPowerWanted();
      // every pipe tile already on a line that feeds a generator
      let fed = null;
      const fedTiles = () => {
        if (fed) return fed;
        fed = []; const seen = new Set();
        for (const g of gens) {
          const run = runFrom({ c: g.col - 1, r: g.row + Math.floor((g.height || 5) / 2) });
          for (const tl of run.tiles) { const k = tl[0] + ',' + tl[1]; if (!seen.has(k)) { seen.add(k); fed.push(tl); } }
        }
        return fed;
      };
      for (const e of all(T.REFINERY)) {
        if (!e.powered || !((e._fuelOil || 0) >= 50) || e._fuelConsumers !== 0) continue;
        if (!wanted && !e._lpgPiped) continue;
        const out = refineryFuelOut(e), run = runFrom(out);
        const mine = new Set(run.tiles.map(tl => tl[0] + ',' + tl[1]));
        const n = nearest(run.piped ? run.tiles : [[out.c, out.r]], fedTiles().filter(tl => !mine.has(tl[0] + ',' + tl[1])));
        const short = gens.filter(g => g._fgState === 'starved' || g._fgState === 'nofuel').length;
        add({
          sev: 2,
          title: run.piped ? `${nameOf(e)}: connect its fuel line to a generator` : `${nameOf(e)}: pipe its fuel outlet`,
          why: `It has ${num(e._fuelOil)} fuel oil and ${e._refStatus === 'full' ? 'has stopped refining because it is full' : 'nowhere to send it'}. Fuel only leaves through FUEL OUT at ${loc(out.c, out.r)}.` +
               (short ? ` ${short} Fuel Generator${short > 1 ? 's are' : ' is'} running short.` : ''),
          steps: n
            ? [`Join ${loc(n.a[0], n.a[1])} to ${loc(n.b[0], n.b[1])}: ${n.dist > 1 ? `lay ${num(n.dist - 1)} tile${n.dist - 1 === 1 ? '' : 's'} of pipe between them` : 'drag a pipe from one onto the other'}. That puts it on the line feeding your generators.`,
               'It starts refining again by itself once it empties a little.']
            : [`Pipe FUEL OUT at ${loc(out.c, out.r)} to the fuel inlet on the middle of a Fuel Generator's left side, or to a Gas Station.`],
          at: e,
        });
      }
    },

    // Fuel Generators: judged by the engine's own state, never by the tank.
    // An engine burns fuel as it arrives, so one that is under-supplied sits
    // at an empty tank while running, and "tank is 0" says nothing by itself.
    // Idle or short engines are not a fault on a grid that does not need them.
    function fuelGens(add) {
      const gens = all(T.FUELGEN).filter(g => !g._lightningDamaged);
      if (!gens.length || !fuelPowerWanted()) return;
      const def = EntityDefs[T.FUELGEN], rdef = EntityDefs[T.REFINERY];
      const rated = (g) => def.powerOutput * ((def.throttleModes[g._fgThrottle] || def.throttleModes.normal).output || 1);
      // A generator takes fuel at one tile: the middle of its left face.
      const inlet = (g) => ({ c: g.col - 1, r: g.row + Math.floor((g.height || 5) / 2) });
      const unpiped = gens.filter(g => g._fgState === 'nopipe');
      const dry     = gens.filter(g => g._fgState === 'nofuel');
      const starved = gens.filter(g => g._fgState === 'starved');

      if (starved.length) {
        const making = starved.reduce((a, g) => a + (g.def?.powerOutput || 0), 0), could = starved.reduce((a, g) => a + rated(g), 0);
        add({
          key: 'starved',
          sev: 1, title: `${starved.length} Fuel Generator${starved.length > 1 ? 's are' : ' is'} running short of fuel`,
          why: `${starved.length > 1 ? 'They are' : 'It is'} making ${num(making)} kW of a possible ${num(could)} kW. First few: ${starved.slice(0, 4).map(locOf).join(', ')}.`,
          steps: [`Add a Refinery with its own crude to the line. One Refinery fuels about ${Math.floor((rdef.fuelPerSec || 2.2) / (def.throttleModes.normal.fuel || 1))} generators at Normal, and Gas Stations share it too.`,
                  'Check its refineries get enough crude: a weak Pump Jack or low deposit means less fuel.',
                  'Or set some engines to ECO in their panel: 60% of the power for 45% of the fuel.'],
          at: starved[0],
        });
      }
      if (dry.length) {
        add({
          key: 'dry',
          sev: 1, title: `${dry.length} Fuel Generator${dry.length > 1 ? 's are' : ' is'} piped but getting no fuel`,
          why: `That is ${num(dry.reduce((a, g) => a + rated(g), 0))} kW standing idle. First few: ${dry.slice(0, 4).map(locOf).join(', ')}.`,
          steps: ['Open the Refinery on that line: it needs power and crude oil to make fuel.',
                  'If its crude has stopped, check the Pump Jack feeding it and the oil deposit under that.'],
          at: dry[0],
        });
      }
      if (unpiped.length) {
        const refs = all(T.REFINERY).filter(r => (r._fuelOil || 0) >= 50);
        let best = null;
        for (const g of unpiped) for (const r of refs) {
          const out = refineryFuelOut(r), inl = inlet(g);
          if (!out) continue;
          const d = Math.abs(inl.c - out.c) + Math.abs(inl.r - out.r);
          if (!best || d < best.d) best = { g, r, d, out, inl };
        }
        add({
          key: 'unpiped',
          sev: 1, title: `${unpiped.length} Fuel Generator${unpiped.length > 1 ? 's have' : ' has'} no fuel line`,
          why: `That is ${num(unpiped.reduce((a, g) => a + rated(g), 0))} kW standing idle. First few: ${unpiped.slice(0, 4).map(locOf).join(', ')}.`,
          steps: best
            ? [`Pipe FUEL OUT on ${esc(nameOf(best.r))} at ${loc(best.out.c, best.out.r)} to the fuel inlet of ${esc(nameOf(best.g))} at ${loc(best.inl.c, best.inl.r)}, about ${num(best.d)} tiles.`,
               'Each generator takes fuel at one tile, the middle of its left side. Branch the pipe to each one.']
            : ['Get crude to a Refinery (Pump Jack, then pipe), then pipe its FUEL OUT to the inlet on the middle of each generator\'s left side.'],
          at: unpiped[0],
        });
      }
    },

    // Field Cores (docs/FIELD_CORE_SPEC.md): a reactor whose cores no carrier
    // can reach, one set for cores nobody has charged, a boost going without
    // its extra fuel, and a Leach Plant stopped on its thorium tailings.
    function fieldCores(add) {
      if (typeof FieldCoreSystem === 'undefined') return;
      const F = FieldCoreSystem;
      const works = all(T.COREWORKS);
      const nets = typeof DroneSystem !== 'undefined' && DroneSystem.networks
        ? DroneSystem.networks().filter(n => n.squares.some(s => s.port && s.port.type === T.DRONEPORT)) : [];
      const linked = (a, list) => nets.some(n => DroneSystem.covers(n, a) && list.some(b => DroneSystem.covers(n, b)));
      const haulers = all(T.TRUCK).filter(t => t._hauler);
      const spare = F.chargedAnywhere();
      const wdef = EntityDefs[T.COREWORKS] || {};
      for (const e of [...all(T.HULKINGFUSIONREACTOR), ...all(T.ADVFUSIONREACTOR)]) {
        const want = F.wanted(e), live = F.liveCount(e), lit = !!(e._started || e._generating);
        const s = (n) => (n === 1 ? '' : 's');
        if (!want && !F.cores(e).length && !e._coreOut) continue;

        if (!works.length) {
          add({ sev: 2, key: 'noworks', title: `${nameOf(e)} is set for ${want} Field Core${s(want)} but there is no Core Works`,
            why: 'Cores are made and charged at a Core Works. Without one, the slots stay empty.',
            steps: ['Build a Core Works (unlocked at Hyperion Stage IV) and belt HTS tape from a Superconductor Mill to its TAPE IN.',
                    'Then put it and this reactor under one Drone Port network, or run a Hauler; either carries the cores both ways.'],
            at: e });
          continue;
        }
        if ((want > live || e._coreOut) && !linked(e, works) && !haulers.length) {
          add({ sev: 2, key: 'carrier', title: `${nameOf(e)}: nothing can carry its Field Cores`,
            why: `${e._coreOut ? 'A spent core is waiting in its outgoing bay, which blocks every swap until it is taken home. ' : ''}` +
                 `It has ${live} live core${s(live)} of the ${want} it is set for. No Drone Port network covers both it and a Core Works, and there is no Hauler.`,
            steps: [`Place a Drone Port whose square covers both this reactor (${locOf(e)}) and ${esc(nameOf(works[0]))} at ${locOf(works[0])}, or a chain of ports whose squares touch between them.`,
                    'Or set a truck to Hauler: it fetches charged cores four at a time and brings the spent ones back.'],
            at: e });
          continue;
        }
        if (want > live && lit && spare === 0 && !e._droneClaim && !F.truckOn(e)) {
          const charging = works.filter(w => CoreWorksSystem.bays(w).some(c => c.state === 'charging'));
          const steps = [];
          for (const w of works.slice(0, 2)) {
            if (!w.powered) steps.push(`${esc(nameOf(w))} at ${locOf(w)} has no power.`);
            else if (w._waitingFor) steps.push(`${esc(nameOf(w))} at ${locOf(w)} is waiting on HTS tape: it has ${num(w._tapeStock || 0)} of the ${num(w._waitingFor)} the next core needs. ${w._hasTape ? 'Its tape belt is not keeping up; a second Superconductor Mill doubles it.' : `Belt tape from a Superconductor Mill to its TAPE IN.`}`);
            else if (charging.includes(w) && !w._window) steps.push(`${esc(nameOf(w))} at ${locOf(w)} is on Off-Peak Charging, so it only charges from 22:00 to 06:00. Turn Off-Peak Charging off in its panel to charge around the clock.`);
            else if (!charging.includes(w) && w._buildCores === false) steps.push(`${esc(nameOf(w))} at ${locOf(w)} is not winding new cores. Turn Wind New Cores on in its panel if you want more in service.`);
          }
          steps.push(`One Core Works keeps about ${num(Math.floor(24 / (wdef.chargeHours || 4)))} cores going, so build another if you want more.`);
          add({ sev: 1, key: 'coredry', title: `${nameOf(e)} has ${live} of ${want} Field Core${s(want)} and none are charged`,
            why: `No charged core is on any Core Works shelf or Hauler, so the empty slot${s(want - live)} wait${want - live === 1 ? 's' : ''}. ${charging.length ? `${charging.length} Core Works ${charging.length === 1 ? 'has' : 'have'} one on charge.` : 'Nothing is on charge.'}`,
            steps, at: e });
        }
        const b = F.boost(e), k = e._coreFuelK ?? 1;
        if (b > 0 && e._started && k < 0.9) {
          const extra = (F.FUEL_PER_BOOST || 0.35) * b;
          add({ sev: 2, key: 'corefuel', title: `${nameOf(e)}'s Field Cores are short of fuel: boost at ${Math.round(k * 100)}%`,
            why: `Its ${live} core${s(live)} need${live === 1 ? 's' : ''} ${Math.round(extra * 100)}% more pellets for the full +${Math.round(b * 100)}% boost. It is short, so it gets ${Math.round(k * 100)}% of the boost. Its base output is fine.`,
            steps: [e.type === T.ADVFUSIONREACTOR
                      ? 'Get it more D-He3 pellets: add a Fusion Fuel Plant on the same line, or more helium-3 and deuterium to the one you have.'
                      : 'Get it more pellets: add a Fusion Fuel Plant on the same line, or more deuterium and tritium to the one you have.',
                    'Or set fewer core slots in its panel. The first core gives the most.'],
            at: e });
        }
      }

      const ldef = EntityDefs[T.LEACHPLANT] || {};
      const facs = all(T.NUCLEARWASTE);
      for (const p of all(T.LEACHPLANT)) {
        const cap = ldef.tailingsCapacity || 100, tail = p._tailings || 0;
        if (tail < cap * 0.85) continue;
        const stopped = p._blockedBy === 'Thorium tailings';
        add({ sev: stopped ? 3 : 2, key: 'tailings',
          title: stopped ? `${nameOf(p)} has stopped: its thorium tailings are full` : `${nameOf(p)}'s thorium tailings are nearly full`,
          why: `It holds ${num(tail)} of ${num(cap)} tailings, and it stops when the store is full.`,
          steps: [facs.length
                    ? `Have it hauled to ${esc(nameOf(facs[0]))} at ${locOf(facs[0])}: a Waste Truck on Auto-dispatch collects it, or a Drone Port covering both buildings flies it over by itself.`
                    : 'Build a Nuclear Waste Processing Facility, then put a Waste Truck on Auto-dispatch or cover both buildings with a Drone Port.',
                  'It restarts by itself as soon as the store drops.'],
          at: p });
      }
    },

  ];

  // Every finding carries a key naming the problem rather than describing
  // it: the rule, plus the building it is about (or the rule's own key for
  // one that raises several per building, or one for a whole group). Titles
  // can't serve, they carry live numbers. watchResolved matches on it.
  function runRules() {
    const findings = [];
    carryCache = null;
    relightShort = false;
    for (const rule of RULES) {
      const add = (f) => findings.push({
        ...f,
        _wasPowered: !!(f.at && f.at.powered),
        key: `${rule.name}:${f.key ?? ''}:${f.at && !['all', 'starved', 'dry', 'unpiped', 'dark', 'cust'].includes(f.key) ? `${f.at.col},${f.at.row}` : ''}`,
      });
      try { rule(add); } catch (err) { console.warn('[Advisor] rule failed:', rule.name, err); }
    }
    findings.sort((a, b) => b.sev - a.sev);
    return findings;
  }
  function audit() {
    report = { day: DayNight.day(), time: DayNight.timeString(), elapsed: DayNight.getElapsed(), findings: runRules(), resolved: 0 };
    return report;
  }

  // ── Crossing items off ───────────────────────────────────────────
  // Every RECHECK_MS of real time while a report has findings, the checks
  // run again. A finding missing from RESOLVE_MISSES runs in a row has been
  // fixed and comes off the list (the second miss guards against a state
  // that blinks for a tick, a generator between fuel deliveries, say). The
  // checks find new problems too, but those are not added: spotting them is
  // what a new audit is for. Findings from saves made before keys existed
  // have no key, so they stay until the next audit.
  //
  // Only a problem that is completely gone counts. Group findings ("3 Fuel
  // Generators have no fuel line") keep their key while any member is still
  // affected, and "short of" findings stay until the shortfall is met, so a
  // partial fix leaves the item up. Several checks skip a building that has
  // no power, so a building that was powered when the audit found it and has
  // gone dark since is held on the list rather than read as fixed. One that
  // has been demolished takes its finding with it.
  const stillBlocked = (f) => f.at && f._wasPowered && !f.at.powered &&
                              EntityRegistry.getByType(f.at.type).has(f.at);
  const RECHECK_MS = 3000, RESOLVE_MISSES = 2;
  let lastCheck = 0;
  function watchResolved() {
    if (!report || !report.findings.length) return;
    const now = performance.now();
    if (now - lastCheck < RECHECK_MS) return;
    lastCheck = now;
    const live = new Set(runRules().map(f => f.key));
    const gone = [];
    for (const f of report.findings) {
      if (!f.key) continue;
      if (live.has(f.key) || stillBlocked(f)) { f._misses = 0; continue; }
      f._misses = (f._misses || 0) + 1;
      if (f._misses >= RESOLVE_MISSES) gone.push(f);
    }
    if (!gone.length) return;
    report.findings = report.findings.filter(f => !gone.includes(f));
    report.resolved = (report.resolved || 0) + gone.length;
    for (const f of gone) showToast(`✓ Audit item resolved: ${f.title}`, '#60e0a0', '#04140c', '#1a5a3a');
    if (isOpen()) render();
  }

  // ── The job: an audit takes time ─────────────────────────────────
  // Commissioning one sends the engineers out. How long they are gone
  // depends on how much they find to write up: a quick look at the grid on
  // the day sizes the job, from JOB_MIN_MIN game minutes for a clean bill
  // to JOB_MAX_MIN for a grid with a lot wrong. The report itself is drawn
  // up when they get back, so it describes the grid as it is then, fixes
  // made in the meantime included. The clock only runs while the office is
  // standing and powered. The job and the last report are saved.
  const JOB_MIN_MIN = 10, JOB_MAX_MIN = 90;
  const JOB_WEIGHT_MIN = { 3: 20, 2: 13, 1: 6 };    // added per finding, by severity
  let job = null;            // { total, left } in game seconds
  let lastElapsed = null;
  let unseen = false;        // a report has come in that the player has not opened
  const HOUR = () => DayNight.secondsPerGameHour();
  const gameSpan = (sec) => {
    const m = Math.max(1, Math.round(sec / HOUR() * 60)), h = Math.floor(m / 60);
    return h ? (m % 60 ? `${h} h ${m % 60} min` : `${h} h`) : `${m} min`;
  };
  function sizeJob(findings) {
    let m = JOB_MIN_MIN;
    for (const f of findings) m += JOB_WEIGHT_MIN[f.sev] || 0;
    return Math.min(JOB_MAX_MIN, m) / 60 * HOUR();
  }
  function commission() {
    const total = sizeJob(runRules());
    job = { total, left: total };
    lastElapsed = DayNight.getElapsed();
  }
  function deliver() {
    job = null;
    audit();
    const n = report.findings.length;
    unseen = !isOpen();
    if (isOpen()) { render(); const b = document.getElementById('advisor-body'); if (b) b.scrollTop = 0; }
    showToast(`🧭 Engineering audit delivered: ${n} finding${n === 1 ? '' : 's'}`, '#7ad8ff', '#04141c', '#1a4a66');
    try {
      NotificationStack.dismissTag('advisor-ready');
      NotificationStack.push({
        icon: '🧭', title: 'Engineering audit ready',
        message: n ? `${n} finding${n === 1 ? '' : 's'}: click to read the report` : 'Nothing found: click to read the report',
        color: '#7ad8ff', border: '#1a4a66', tag: 'advisor-ready', onClick: () => open(),
      });
    } catch (_e) {}
  }
  // For the office's own panel: what the engineers are doing, or null.
  function jobText() {
    if (!job) return null;
    return office()?.powered ? `${gameSpan(job.left)} left of ${gameSpan(job.total)}` : `On hold with ${gameSpan(job.left)} left: the office has no power`;
  }

  // ── Panel ────────────────────────────────────────────────────────
  // The office that sells it: standing (a lightning-struck wreck does not
  // count) for the button to show, and powered to take a new commission.
  const office   = () => { for (const e of EntityRegistry.getByType(T.ENGOFFICE)) if (!e._lightningDamaged) return e; return null; };
  const unlocked = () => typeof EntityRegistry !== 'undefined' && !!office();
  const panel = () => document.getElementById('advisor-panel');
  const isOpen = () => !!panel()?.classList.contains('visible');

  // Step text → HTML, with each coordinate marker made a jump button.
  const html = (s) => s.replace(/⟦(-?\d+),(-?\d+)⟧/g, (_m, c, r) => `<button class="adv-loc" data-c="${c}" data-r="${r}" title="Jump there">(${c}, ${r})</button>`);

  function render() {
    const body = document.getElementById('advisor-body');
    if (!body) return;
    const fee = formatMoney(AUDIT_FEE);
    const SEV = { 3: ['URGENT', '#ff6a50'], 2: ['FIX SOON', '#ffb040'], 1: ['WORTH DOING', '#7ad8ff'] };
    let out = '';
    if (job) {
      out += `<div class="adv-job">
        <div class="adv-job-title">ENGINEERS ON SITE</div>
        <div class="adv-job-bar"><div id="adv-job-fill" style="width:${(100 * (1 - job.left / job.total)).toFixed(1)}%"></div></div>
        <div class="adv-job-left" id="adv-job-left">${esc(jobText())}</div>
        <div class="adv-job-note">The more they find, the longer the write-up takes. The report covers the grid as it stands when they finish.</div>
      </div>`;
    }
    if (!report) {
      if (!job) out += `<div class="adv-intro">An engineer walks every pipe and power line on your grid and reports what is holding it back: what is wrong, why it matters, and the steps to fix it, with the tiles to go to.<br><br>An audit costs ${fee} and takes between ${gameSpan(JOB_MIN_MIN / 60 * HOUR())} and ${gameSpan(JOB_MAX_MIN / 60 * HOUR())} of game time, depending on how much there is to write up.</div>`;
    } else {
      const fixed = report.resolved || 0;
      out += `<div class="adv-stamp">${job ? 'Previous audit' : 'Audit'} of Day ${report.day}, ${esc(report.time)}.` +
             (fixed ? ` ${fixed} item${fixed === 1 ? '' : 's'} resolved since; fixed items drop off the list.` : ' Items drop off the list as you fix them; new problems need a new audit.') + `</div>`;
      if (!report.findings.length) out += fixed
        ? '<div class="adv-intro">Every finding in this audit has been resolved. Commission a new one to check for anything that has come up since.</div>'
        : '<div class="adv-intro">Nothing found. Every outlet reaches a consumer, the fuel plant is fed, and the magnets have helium coming in.</div>';
      report.findings.forEach((f, i) => {
        const [label, col] = SEV[f.sev] || SEV[1];
        out += `<div class="adv-card" style="border-left-color:${col}">
          <div class="adv-sev" style="color:${col}">${label}</div>
          <div class="adv-title">${i + 1}. ${esc(f.title)}</div>
          <div class="adv-why">${html(f.why)}</div>
          <ol class="adv-steps">${f.steps.map(s => `<li>${html(s)}</li>`).join('')}</ol>
        </div>`;
      });
    }
    if (!job) out += `<button id="advisor-run" class="adv-run">${report ? 'NEW AUDIT' : 'COMMISSION AUDIT'} · ${fee}</button>`;
    body.innerHTML = out;
  }

  function seen() {
    unseen = false;
    try { NotificationStack.dismissTag('advisor-ready'); } catch (_e) {}
  }

  function init() {
    const btn = document.getElementById('btn-advisor'), p = panel();
    if (!btn || !p) return;
    btn.addEventListener('click', () => {
      SFX.click();
      if (typeof closeOtherTopPanels === 'function') closeOtherTopPanels('advisor-panel');
      const nowOpen = p.classList.toggle('visible');
      btn.classList.toggle('open', nowOpen);
      if (nowOpen) { seen(); render(); }
    });
    document.getElementById('advisor-close')?.addEventListener('click', () => { p.classList.remove('visible'); btn.classList.remove('open'); });
    p.addEventListener('click', (ev) => {
      const jump = ev.target.closest('.adv-loc');
      if (jump) {
        SFX.click();
        const c = +jump.dataset.c, r = +jump.dataset.r;
        Camera.cut(() => Camera.recentreOn((c + 0.5) * TILE, (r + 0.5) * TILE));
        return;
      }
      if (ev.target.closest('#advisor-run')) {
        if (job) return;
        if (!office()?.powered) { showToast('⚠ The Engineering Office has no power: it cannot take a commission', '#ff8040', '#180a00', '#804020'); return; }
        if (!Economy.canAfford(AUDIT_FEE)) { showToast(`⚠ Not enough money for an audit (${formatMoney(AUDIT_FEE)})`, '#ff8040', '#180a00', '#804020'); return; }
        Economy.spend(AUDIT_FEE);
        SFX.click();
        commission();
        render();
        document.getElementById('advisor-body').scrollTop = 0;
        showToast(`🧭 Audit commissioned: the engineers expect to take about ${gameSpan(job.total)}`, '#7ad8ff', '#04141c', '#1a4a66');
      }
    });
  }

  // Open the panel (from the office's own info panel, or the ready card).
  function open() {
    const btn = document.getElementById('btn-advisor'), p = panel();
    if (!p || !unlocked()) return;
    if (typeof closeOtherTopPanels === 'function') closeOtherTopPanels('advisor-panel');
    p.classList.add('visible');
    btn?.classList.add('open');
    seen();
    render();
  }

  return {
    AUDIT_FEE, init, audit, render, isOpen, unlocked, open, jobText,
    getReport: () => report,
    getJob: () => job,
    // Called every logic tick: runs the job's clock, and shows, hides and
    // badges the button.
    tick() {
      const now = DayNight.getElapsed();
      const d = lastElapsed === null ? 0 : now - lastElapsed;
      lastElapsed = now;
      // A report from later than "now" belongs to a save that has since been
      // reloaded to an earlier point: it describes a world that is gone.
      if (report && now < report.elapsed - 1) { report = null; if (isOpen()) render(); }
      if (job && d > 0 && d < 600 && office()?.powered) {
        job.left -= d;
        if (job.left <= 0) deliver();
      }
      try { trackOutages(now); } catch (_e) {}
      watchResolved();
      const btn = document.getElementById('btn-advisor');
      if (!btn) return;
      const on = unlocked();
      btn.classList.toggle('unlocked', on);
      btn.classList.toggle('has-new', unseen);
      btn.classList.toggle('working', !!job);
      if (!on && isOpen()) { panel().classList.remove('visible'); btn.classList.remove('open'); }
      // The open panel's progress, without rebuilding it (a rebuild under
      // the cursor swallows clicks on the coordinate buttons).
      if (job && isOpen()) {
        const fill = document.getElementById('adv-job-fill'), left = document.getElementById('adv-job-left');
        if (fill) fill.style.width = `${(100 * (1 - job.left / job.total)).toFixed(1)}%`;
        if (left) left.textContent = jobText();
      }
    },
    // Saved with the world: a job in progress (the fee is already paid) and
    // the last report, as text.
    serialise() {
      return {
        job: job ? { total: job.total, left: job.left } : null,
        outages: [..._outLog].filter(([, st]) => st.log.length || st.cur).map(([k, st]) => ({ k, log: st.log, cur: st.cur })),
        report: report ? { day: report.day, time: report.time, elapsed: report.elapsed, resolved: report.resolved || 0,
                           findings: report.findings.map(f => ({ key: f.key, sev: f.sev, title: f.title, why: f.why, steps: f.steps })) } : null,
      };
    },
    loadState(s) {
      job = s && s.job && s.job.total > 0 ? { total: s.job.total, left: Math.max(0, Math.min(s.job.total, s.job.left)) } : null;
      report = s && s.report && Array.isArray(s.report.findings) ? s.report : null;
      _outLog.clear();
      for (const o of (s && Array.isArray(s.outages) ? s.outages : [])) _outLog.set(o.k, { running: !o.cur, cur: o.cur || null, log: Array.isArray(o.log) ? o.log : [] });
      lastElapsed = null;
      unseen = false;
      if (isOpen()) render();
    },
    reset() { report = null; job = null; unseen = false; _outLog.clear(); if (isOpen()) render(); },
  };
})();
