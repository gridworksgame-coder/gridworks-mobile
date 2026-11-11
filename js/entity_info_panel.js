/* ═══════════════════════════════════════════════════════════════════
   ENTITY INFO PANEL
   The main click-to-inspect side panel shown for most entity types.
   ═══════════════════════════════════════════════════════════════════ */

const EntityInfoPanel = (() => {
  let target = null;

  function panel()  { return document.getElementById('entity-panel'); }
  function isOpen() { return !!target && panel().classList.contains('visible'); }

  function reposition() {
    if (!target) return;
    const { x: wx, y: wy } = GridManager.tileToWorld(target.col, target.row);
    const sx = (wx + (target.width || 1) * TILE) * Camera.zoom - Camera.x * Camera.zoom + 8;
    const sy = wy * Camera.zoom - Camera.y * Camera.zoom;
    const p  = panel();
    const pw = p.offsetWidth || 340, ph = p.offsetHeight || 220;
    let left = sx, top = sy;
    if (left + pw > window.innerWidth  - 10) left = wx * Camera.zoom - Camera.x * Camera.zoom - pw - 8;
    if (top  + ph > window.innerHeight - 10) top  = window.innerHeight - ph - 10;
    if (top  < 10) top  = 10;
    if (left < 10) left = 10;
    p.style.left = `${Math.round(left)}px`;
    p.style.top  = `${Math.round(top)}px`;
    keepPanelOnScreen(p);
  }

  // Shared by the Pipe and Underground Pipe panels — a pipe tile can only
  // ever carry whatever the currently-connected network last pushed
  // through it (flags are reset and re-marked by BFS every tick), so at
  // most one of these is true at once in normal play. Ordered roughly
  // most- to least-specialised network so a stale/overlapping flag from a
  // misconfigured layout still resolves to something sensible.
  // Shared by both Surge Protector panels. Storm fault chance is scaled by
  // PowerNetwork.faultResistance(), which is otherwise a dice roll the player
  // never sees — so state plainly what the hardware on this network buys.
  // A protector tier's standing on a network, with a safe shape when
  // PowerNetwork hasn't ticked yet (fresh load, entity placed mid-frame).
  // Same markup as buildContent's local row(). The helpers below live at
  // module scope, where that local isn't visible — calling it here threw
  // "row is not defined", which blanked (and on refresh, closed) every Surge
  // Protector panel.
  function _row(label, value, cls = '') {
    return `
      <div class="ep-row">
        <span class="ep-label">${label}</span>
        <span class="ep-value ${cls}">${value}</span>
      </div>`;
  }

  function _protection(networkId, tierKey) {
    const p = (typeof PowerNetwork !== 'undefined' && PowerNetwork.protectionInfo)
            ? PowerNetwork.protectionInfo(networkId, tierKey) : null;
    return p || { count: 0, label: tierKey.toUpperCase(), tierCap: 0, capPerUnit: 0,
                  nextCapGain: 0, tierResist: 1, resistFloor: 1, nextResistGain: 0,
                  networkCap: (EntityDefs[T.WIRE]?.throughput || 85), atCeiling: false };
  }

  // The one failure mode a surge protector gives no other sign of: it is
  // sitting somewhere that has no wire or pole, so it floods into a network
  // of its own and raises nothing. Loud, and first in the section, because
  // the symptom otherwise is simply that the player's money did nothing.
  function _strandedRow(e) {
    if (e._noConductor) {
      return [_row('\u26a0 Not on a wire network',
        'Place it touching a wire or pole \u2014 as placed it raises nothing', 'bad')];
    }
    if (e._unpoweredBay) {
      return [_row('\u26a0 Bay offline', 'Damaged \u2014 contributes nothing until repaired', 'bad')];
    }
    return [];
  }

  // What the NEXT unit of this tier actually buys: a fixed amount of wire
  // capacity (it never runs out) and a cut in storm faults that does shrink.
  // atCeiling is kept for safety but capacity no longer saturates.
  function _marginRows(info) {
    if (info.atCeiling) {
      return [_row('Next unit',
        `+${formatPower(info.nextCapGain, 0)} · storm faults already at the ${info.label} floor (−${Math.round((1 - info.resistFloor) * 100)}%)`, 'good')];
    }
    return [_row('Next unit',
      `+${formatPower(info.nextCapGain, 0)} · −${(info.nextResistGain * 100).toFixed(1)}pp faults`,
      info.nextCapGain > 25 ? 'good' : 'dim')];
  }

  function _faultRiskLabel(networkId) {
    const r = (typeof PowerNetwork !== 'undefined' && PowerNetwork.faultResistance)
            ? PowerNetwork.faultResistance(networkId) : 1;
    if (r >= 0.999) return 'unreduced';
    return `−${Math.round((1 - r) * 100)}% during storms`;
  }

  // Whether a Lightning Rod actually touches a conductor, so its surge has
  // somewhere to go. Mirrors the `_hasWire` gate PowerNetwork applies to the
  // rod's output (see the _rodSurge branch there).
  function _rodWired(e) {
    const CONDUCTORS = [T.WIRE, T.POLE, T.POWERTOWER];
    for (let r = e.row - 1; r <= e.row + (e.height || 1); r++) {
      for (let c = e.col - 1; c <= e.col + (e.width || 1); c++) {
        // Footprint interior isn't a neighbour — only the ring around it
        if (r >= e.row && r < e.row + (e.height || 1) &&
            c >= e.col && c < e.col + (e.width  || 1)) continue;
        if (!GridManager.inBounds(c, r)) continue;
        const n = GridManager.getEntity(c, r);
        if (n && CONDUCTORS.includes(n.type)) return true;
      }
    }
    return false;
  }

  function pipeMaterial(e) {
    if (e._cryoCoolActive)  return { label: 'cryogenic coolant', flowing: true, rate: e._flowRate };
    if (e._coolActive)      return { label: 'cooling water', flowing: true, rate: e._flowRate };
    if (e._steamActive)     return { label: 'steam',         flowing: true, rate: e._flowRate };
    if (e._acidActive)      return { label: 'sulfuric acid', flowing: true, rate: e._flowRate };
    if (e._hydrogenActive)  return { label: 'hydrogen gas',  flowing: true, rate: e._flowRate };
    if (e._nitrogenActive)  return { label: 'nitrogen gas',  flowing: true, rate: e._flowRate };
    if (e._ammoniaActive)   return { label: 'ammonia gas',   flowing: true, rate: e._flowRate };
    if (e._deuteriumActive) return { label: 'deuterium gas', flowing: true, rate: e._flowRate };
    if (e._highBetaActive)  return e._highBetaFlow ? { label: 'ion stream', flowing: true, rate: e._flowRate }
                                                   : { label: 'ion stream line (reactor not lit)', flowing: false };
    if (e._heliumActive)    return { label: 'helium gas',    flowing: true, rate: e._flowRate };
    if (e._liquidHeActive)  return { label: 'liquid helium', flowing: true, rate: e._flowRate };
    if (e._tritiumActive)   return { label: 'tritium',       flowing: true, rate: e._flowRate };
    if (e._he3Active)       return { label: 'helium-3',      flowing: true, rate: e._flowRate };
    if (e._lpgActive)       return { label: 'LPG (propane)', flowing: true, rate: e._flowRate };
    if (e._fuelOilActive)   return { label: 'fuel oil',      flowing: true, rate: e._flowRate };
    if (e._oilActive)       return { label: 'crude oil',     flowing: true, rate: e._flowRate };
    if (e._waterFlowActive) return { label: 'water',         flowing: true, rate: e._flowRate };
    if (e.powered)          return { label: 'water',         flowing: true, rate: e._waterFlow || 0 };
    return { label: 'nothing, not connected', flowing: false };
  }

  const _FLUID_NAMES = {
    water: 'water', cool: 'cooling water', cryocool: 'cryogenic coolant', steam: 'steam', acid: 'acid',
    hydrogen: 'hydrogen', nitrogen: 'nitrogen', ammonia: 'ammonia', deuterium: 'deuterium', highbeta: 'ion stream',
    helium: 'helium', liquidhe: 'liquid helium', tritium: 'tritium', helium3: 'helium-3', lpg: 'LPG', fueloil: 'fuel oil', oil: 'crude oil',
  };
  function fluidName(f) { return _FLUID_NAMES[f] || f; }

  // ── Line balance for fluids with no metered budget ──
  // Water and the cooling lines are allocated tick by tick (their rows come
  // from that allocation). Everything else just needs a live connection, so
  // its balance is worked out here: what the producers along the run put in
  // (their live rate where the sim keeps one, else their rated output, and
  // only while running) against what the consumers along it are rated to
  // take. `make(e)` / `take(e)` give one building's units/s, or 0 if idle.
  const _onLine = e => !!e.powered && !e._lightningDamaged;
  const _FLUID_BALANCE = {
    acid:      { make: { [T.CHEMICALPLANT]: e => _onLine(e) && e._sulfurConveyor ? EntityDefs[T.CHEMICALPLANT].acidPerSec : 0 },
                 take: { [T.FUELPLANT]: e => _onLine(e) ? EntityDefs[T.FUELPLANT].acidPerSec : 0 } },
    hydrogen:  { make: { [T.ELECTROLYZER]: e => _onLine(e) && e._waterConnected ? EntityDefs[T.ELECTROLYZER].hydrogenPerSec : 0,
                         [T.COKEOVEN]:     e => _onLine(e) && e._running ? EntityDefs[T.COKEOVEN].hydrogenPerSec : 0 },
                 take: { [T.HABERBOSCH]: e => _onLine(e) ? EntityDefs[T.HABERBOSCH].hydrogenPerSec : 0,
                         [T.SCMILL]:     e => _onLine(e) ? EntityDefs[T.SCMILL].hydrogenPerSec : 0 } },
    nitrogen:  { make: { [T.ATMOSCOLLECTOR]: e => _onLine(e) ? EntityDefs[T.ATMOSCOLLECTOR].nitrogenPerSec : 0 },
                 take: { [T.HABERBOSCH]: e => _onLine(e) ? EntityDefs[T.HABERBOSCH].nitrogenPerSec : 0 } },
    ammonia:   { make: { [T.HABERBOSCH]: e => _onLine(e) && e._hasNitrogen && e._hasHydrogen ? EntityDefs[T.HABERBOSCH].ammoniaPerSec : 0 },
                 take: {}, note: 'The Wash Tower recycles its ammonia catalyst, so it draws none down' },
    deuterium: { make: { [T.WASHTOWER]: e => _onLine(e) && e._waterConnected && e._hasAmmonia ? EntityDefs[T.WASHTOWER].deuteriumPerSec : 0 },
                 take: { [T.FUSIONFUELPLANT]: e => _onLine(e) ? EntityDefs[T.FUSIONFUELPLANT].deuteriumPerSec : 0 } },
    tritium:   { make: { [T.TRITIUMBREEDER]: e => _onLine(e) && e._breeding ? EntityDefs[T.TRITIUMBREEDER].tritiumPerSec : 0,
                         [T.HULKINGFUSIONREACTOR]: e => e._generating ? (EntityDefs[T.HULKINGFUSIONREACTOR].tritiumBredPerSec || 0) : 0 },
                 // D-T has first call on the plant's rate, D-He3 line open or not.
                 take: { [T.FUSIONFUELPLANT]: e => _onLine(e) && (e._fuelMode || 'dt') === 'dt' ? EntityDefs[T.FUSIONFUELPLANT].tritiumPerSec : 0 } },
    helium:    { make: { [T.HELIUMWELL]: e => _onLine(e) ? HeliumSystem.wellRate(e) : 0, [T.HELIUMWELL2]: e => _onLine(e) ? HeliumSystem.wellRate(e) : 0 },
                 take: { [T.CRYOPLANT]: e => _onLine(e) ? EntityDefs[T.CRYOPLANT].heliumPerSec : 0,
                         [T.HE3SEPARATOR]: e => _onLine(e) ? EntityDefs[T.HE3SEPARATOR].heliumPerSec : 0 } },
    helium3:   { make: { [T.HE3SEPARATOR]: e => _onLine(e) && e._separating ? EntityDefs[T.HE3SEPARATOR].he3PerSec : 0 },
                 // Legacy all-D-He3 plants draw the full rate; the split's D-He3 line at most a quarter of it.
                 take: { [T.FUSIONFUELPLANT]: e => !_onLine(e) ? 0 : e._fuelMode === 'dhe3' ? EntityDefs[T.FUSIONFUELPLANT].he3PerSec
                           : e._he3LineOpen ? EntityDefs[T.FUSIONFUELPLANT].he3PerSec * (EntityDefs[T.FUSIONFUELPLANT].he3PelletShare || 0.25) : 0 } },
    oil:       { make: { [T.PUMPJACK]: e => e._crudeRate || 0, [T.PUMPJACK2]: e => e._crudeRate || 0 },
                 take: { [T.REFINERY]: e => _onLine(e) ? EntityDefs[T.REFINERY].crudePerSec : 0 } },
    fueloil:   { make: { [T.REFINERY]: e => e._fuelRate || 0 },
                 take: { [T.FUELGEN]: e => {
                   if (!e._fuelled && !_onLine(e)) return 0;
                   const m = EntityDefs[T.FUELGEN].throttleModes?.[e._fgThrottle]?.fuel ?? 1;
                   return (EntityDefs[T.FUELGEN].fuelPerSecond || 1) * m;
                 } } },
    lpg:       { make: { [T.REFINERY]: e => e._lpgRate || 0 }, take: {} },
    liquidhe:  { make: { [T.CRYOPLANT]: e => _onLine(e) && e._running ? EntityDefs[T.CRYOPLANT].heliumPerSec : 0 },
                 take: {}, note: 'Fusion Reactors top up their magnet charge from this line as they need it' },
    // The Advanced Fusion Reactor streams ions out of both ION OUTs at its
    // burn and cooling (its own panel's Ion Stream row).
    highbeta:  { make: { [T.HULKINGFUSIONREACTOR]: e => e._generating && e._fuelMode === 'dhe3' ? (EntityDefs[T.HULKINGFUSIONREACTOR].highBetaPerSec || 0) : 0,
                         [T.ADVFUSIONREACTOR]: e => e._generating ? (EntityDefs[T.ADVFUSIONREACTOR].highBetaPerSec || 4800) * Math.max(0, Math.min(1, e._burnRatio ?? 0)) * (e._coolFactor ?? 1) : 0 },
                 take: { [T.MHDRING]: e => _onLine(e) ? (EntityDefs[T.MHDRING].highBetaDraw || 0) : 0 } },
    steam:     { make: { [T.NUCLEARREACTOR]: e => e._generating ? EntityDefs[T.NUCLEARREACTOR].steamOutput : 0,
                         [T.ADVREACTOR]: e => e._generating ? (e._currentOutput || EntityDefs[T.ADVREACTOR].steamOutput) : 0,
                         [T.HULKINGFUSIONREACTOR]: e => e._generating ? EntityDefs[T.HULKINGFUSIONREACTOR].steamOutput : 0 },
                 take: { [T.STEAMTURBINE]: e => _onLine(e) ? EntityDefs[T.STEAMTURBINE].steamDraw : 0,
                         [T.STEAMTURBINE2]: e => _onLine(e) ? EntityDefs[T.STEAMTURBINE2].steamDraw : 0 } },
  };
  const _fmtRate = n => (Math.abs(n) >= 10 || Number.isInteger(n) ? Math.round(n) : n.toFixed(1)).toString();
  // Steam lines read what is really happening, not rated figures. The
  // generic balance counted every running reactor at its full 300, but an
  // uncooled one makes 40% of that (and one short of rods less), and it
  // counted turbines by power rather than by whether they run, so a line
  // with idle turbines could read hundreds "spare". Steam is also not
  // pooled: a turbine needs its whole draw from ONE reactor
  // (SteamTurbineSystem.tick), so leftovers on several reactors that are
  // each under one turbine's draw can't add up to feed another.
  function steamBalanceRows(n, row) {
    const onRun = pt => !!pt && n.net.has(`${pt.c},${pt.r}`);
    const reactors = [], turbines = [];
    for (const b of n.besideEnts) {
      if (b.type === T.NUCLEARREACTOR || b.type === T.ADVREACTOR) {
        if (onRun(NuclearSystem.getStubs(b).steamOut) && !reactors.includes(b)) reactors.push(b);
      } else if (b.type === T.HULKINGFUSIONREACTOR && typeof HulkingFusionReactorSystem !== 'undefined') {
        if (onRun(HulkingFusionReactorSystem.getStubs(b).powerOut) && !reactors.includes(b)) reactors.push(b);
      } else if (b.type === T.STEAMTURBINE || b.type === T.STEAMTURBINE2) {
        if (onRun(SteamTurbineSystem.getStubs(b).steamIn) && !turbines.includes(b)) turbines.push(b);
      }
    }
    const outOf = r => r.type === T.HULKINGFUSIONREACTOR ? (r._steamGenerating ? (r._steamOutput || 0) : 0)
                                                         : (r._generating ? (r._currentOutput || 0) : 0);
    const supply  = reactors.reduce((s, r) => s + outOf(r), 0);
    const running = turbines.filter(t => t._generating);
    const drawOf  = t => (EntityDefs[t.type] || {}).steamDraw || 100;
    const drawn   = running.reduce((s, t) => s + drawOf(t), 0);
    const live    = reactors.filter(r => outOf(r) > 0).length;
    const rows = [
      row('Line Supply', `${_fmtRate(supply)} u/s from ${live} of ${reactors.length} reactor${reactors.length === 1 ? '' : 's'} running`, supply > 0 ? 'good' : 'bad'),
      row('Drawn',       `${_fmtRate(drawn)} u/s by ${running.length} of ${turbines.length} turbine${turbines.length === 1 ? '' : 's'} running`, drawn > 0 ? 'neutral' : 'dim'),
      row('Spare',       `${_fmtRate(Math.max(0, supply - drawn))} u/s`, supply - drawn > 0.5 ? 'good' : 'dim'),
    ];
    // Why reactors are short of their rating.
    for (const r of reactors) {
      if (r.type === T.HULKINGFUSIONREACTOR) continue;
      const rated = (EntityDefs[r.type] || {}).steamOutput || 300;
      const name  = (EntityDefs[r.type]?.label || 'Reactor') + (r._num !== undefined ? ` #${r._num}` : '');
      if (!r._generating) rows.push(row(`⚠ ${name}`, r._hasRods ? 'not running' : 'not running: no fuel rods reaching its ROD IN', 'bad'));
      else if (!r._cooled) rows.push(row(`⚠ ${name}`, `${_fmtRate(outOf(r))} of ${rated} u/s: no cooling water at its COOL IN, so it runs at 40%`, 'bad'));
      else if (outOf(r) < rated - 0.5) rows.push(row(`⚠ ${name}`, `${_fmtRate(outOf(r))} of ${rated} u/s: short of fuel rods`, 'bad'));
    }
    // Idle turbines while steam is left over: it's split across reactors.
    const idle = turbines.length - running.length;
    if (idle > 0 && supply - drawn > 0.5) {
      const need = turbines.length ? drawOf(turbines[0]) : 100;
      rows.push(row('⚠ Idle', `${idle} turbine${idle === 1 ? '' : 's'} idle: each needs ${need} u/s from a single reactor, and no reactor has that much left (steam from different reactors does not combine)`, 'bad'));
    }
    return rows;
  }

  // Supply / demand / spare for the run `n` (pipeNetwork's result).
  function fluidBalanceRows(n, row) {
    const fluid = n.fluid;
    // Water: the network's own metered budget, stamped on every pipe of the run.
    if (fluid === 'water') {
      const w = n.water;
      if (!w) return [];
      const spare = w.spare;
      // A building gets its full need or nothing, so while one on the line
      // goes without, what's left isn't spare: it's too little for that
      // building, and reading "Spare" in green next to a dry tower misled.
      const rows = [
        row('Line Supply', `${_fmtRate(w.supply)} u/s from ${w.sources} source${w.sources === 1 ? '' : 's'}`, w.supply > 0 ? 'good' : 'bad'),
        row('Drawn',       `${_fmtRate(w.drawn)} u/s by ${w.served} building${w.served === 1 ? '' : 's'}`, w.drawn > 0 ? 'neutral' : 'dim'),
        w.short
          ? row('Left Over', `${_fmtRate(spare)} u/s: too little for the ${w.short === 1 ? 'building' : `${w.short} buildings`} still waiting`, 'bad')
          : row('Spare',     `${_fmtRate(spare)} u/s`, spare > 0 ? 'good' : 'bad'),
      ];
      if (w.short) rows.push(row('⚠ Short', `${w.short} building${w.short === 1 ? ' is' : 's are'} plumbed in but not getting water: the line needs more supply`, 'bad'));
      return rows;
    }
    if (fluid === 'steam') return steamBalanceRows(n, row);
    const B = _FLUID_BALANCE[fluid];
    if (!B) return [];
// Storage on the run counts too. A tank or Gas Holder whose OUT stub is on
    // this run feeds it for as long as it has stock; one whose IN stub is on
    // it soaks up whatever the consumers leave. Without them a run from a
    // tank to its consumers read as "0 u/s from 0 producers, short".
    let supply = 0, demand = 0, makers = 0, takers = 0, stored = 0, holders = 0, tanks = 0;
    let feedRate = 0, feedStock = 0, feeders = 0, sinkRate = 0, sinkRoom = 0, sinks = 0;
    const onRun = pt => !!pt && n.net.has(`${pt.c},${pt.r}`);
    const vessel = (stock, room, rate, inPt, outPt) => {
      if (onRun(outPt) && stock > 0.5) { feedRate += rate; feedStock += stock; feeders++; }
      if (onRun(inPt) && room > 0.5)   { sinkRate += rate; sinkRoom += room; sinks++; }
    };
    for (const b of n.besideEnts) {
      const mk = B.make[b.type], tk = B.take[b.type];
      if (mk) { const v = mk(b) || 0; supply += v; if (v > 0) makers++; }
      if (tk) { const v = tk(b) || 0; demand += v; if (v > 0) takers++; }
      if (b.type === T.GASSTORAGE && b._gasType === fluid && typeof GasStorageSystem !== 'undefined' && GasStorageSystem.online(b)) {
        const st = GasStorageSystem.stored(b), cap = EntityDefs[T.GASSTORAGE].gasCapacity || 5000, stubs = GasStorageSystem.getStubs(b);
        stored += st; holders++;
        vessel(st, cap - st, EntityDefs[T.GASSTORAGE].outRate || 150, stubs.gasIn, stubs.gasOut);
      }
      // (a tank calls fuel oil 'fuel'; the pipes call it 'fueloil')
      if (b.type === T.OILSTORAGE && ({ fuel: 'fueloil' }[b._liquidType] || b._liquidType || 'oil') === fluid && typeof OilSystem !== 'undefined' && OilSystem.tankOnline(b)) {
        const st = b._crude || 0, cap = OilSystem.getTankCapacity(), ports = OilSystem.resolveTankPorts(b);
        stored += st; tanks++;
        vessel(st, cap - st, 8, ports && ports.in, ports && ports.out);
      }
    }
    const fmtTime = secs => {
      const hrs = secs / (typeof DayNight !== 'undefined' && DayNight.secondsPerGameHour ? DayNight.secondsPerGameHour() : 50);
      return hrs >= 48 ? `${Math.round(hrs / 24)} days` : hrs >= 1 ? `${hrs.toFixed(hrs < 10 ? 1 : 0)} in-game hours` : `${Math.max(1, Math.round(hrs * 60))} in-game minutes`;
    };
    const direct = supply - demand;                     // producers against consumers
    const cover  = Math.min(feedRate, Math.max(0, -direct));   // what storage has to make up
    const spare  = supply + feedRate - demand;          // headroom with storage counted in
    const rows = [
      row('Line Supply', `${_fmtRate(supply)} u/s from ${makers} producer${makers === 1 ? '' : 's'}`
        + (feeders ? ` + up to ${_fmtRate(feedRate)} u/s from ${feeders} storage outlet${feeders === 1 ? '' : 's'}` : ''), supply + feedRate > 0 ? 'good' : 'dim'),
      row('Demand',      `${_fmtRate(demand)} u/s by ${takers} consumer${takers === 1 ? '' : 's'}`, demand > 0 ? 'neutral' : 'dim'),
      row(spare >= -0.005 ? 'Spare' : '⚠ Short', `${_fmtRate(Math.abs(spare) < 0.005 ? 0 : Math.abs(spare))} u/s`, spare >= -0.005 ? (spare > 0.005 ? 'good' : 'dim') : 'bad'),
    ];
    if (cover > 0.005) rows.push(row('From storage', `${_fmtRate(cover)} u/s being drawn down: about ${fmtTime(feedStock / cover)} of stock left`, feedStock / cover < 600 ? 'bad' : 'neutral'));
    else if (direct > 0.005 && sinks) rows.push(row('Into storage', `${_fmtRate(Math.min(direct, sinkRate))} u/s of spare is filling ${sinks} tank${sinks === 1 ? '' : 's'}: full in about ${fmtTime(sinkRoom / Math.min(direct, sinkRate))}`, 'good'));
    else if (direct > 0.005 && (holders || tanks)) rows.push(row('Storage', 'Full or not taking from this run: the spare has nowhere to go', 'dim'));
    if (holders || tanks) {
      const where = [holders ? `${holders} Gas Holder${holders === 1 ? '' : 's'}` : '', tanks ? `${tanks} Liquid Storage Tank${tanks === 1 ? '' : 's'}` : ''].filter(Boolean).join(' + ');
      rows.push(row('In storage', `${Math.floor(stored).toLocaleString()} u in ${where}`, stored > 0 ? 'good' : 'dim'));
    }
    if (B.note) rows.push(row('Note', B.note, 'dim'));
    return rows;
  }

  // Cooling / cryogenic coolant lines: the whole run's balance, from the
  // per-line tally NuclearSystem.resolveCooling stamps on every pipe —
  // what the towers put in, what consumers drew, what's spare, and each
  // consumer on the line. A consumer gets its FULL need or nothing, so a
  // "spare" figure below someone's need is exactly why it's starved.
  function coolLineRows(e, row) {
    const line = e._coolNet;
    if (!line || typeof NuclearSystem === 'undefined' || line.gen !== NuclearSystem.coolNetGen()) return [];
    const unit  = line.fluid === 'cryocool' ? 'u/s coolant' : 'u/s';
    const tName = line.fluid === 'cryocool' ? 'Cryogenic Tower' : 'Cooling Tower';
    const spare = line.supplied - line.drawn;
    // Same rule as the water rows: with a consumer unfed, the remainder is
    // what falls short of it, not spare.
    const unfed = line.consumers.filter(c => !c.fed);
    const rows = [
      row('Line Supply', `${line.supplied} ${unit} from ${line.towers} ${tName}${line.towers === 1 ? '' : 's'}`, 'good'),
      row('Drawn',       `${line.drawn} ${unit}`, line.drawn > 0 ? 'neutral' : 'dim'),
      unfed.length
        ? row('Left Over', `${spare} ${unit}: too little for ${unfed.length === 1 ? `a consumer needing ${unfed[0].need}` : `the ${unfed.length} consumers still waiting`}`, 'bad')
        : row('Spare',     `${spare} ${unit}`, spare > 0 ? 'good' : 'dim'),
    ];
    // Oldest first — the same order the cooling pass serves them in.
    const cons = line.consumers.slice().sort((a, b) =>
      (a.entity._placedAt || 0) - (b.entity._placedAt || 0) || a.entity.col - b.entity.col || a.entity.row - b.entity.row);
    for (const c of cons) {
      const d = EntityDefs[c.entity.type];
      const name = (d.label || c.entity.type) + (c.entity._num !== undefined ? ` #${c.entity._num}` : '');
      rows.push(row(name, c.fed ? `✓ ${c.need} ${unit}` : `✗ needs ${c.need}, not enough spare`, c.fed ? 'good' : 'bad'));
    }
    return rows;
  }

  // ── Whole-network readout for a clicked pipe ──
  // Walks the connected run from the clicked tile (same adjacency rules the
  // fluid systems use, so it follows underground pairs and stops at a pipe
  // carrying a different fluid), then reports its size, the flow on it, the
  // buildings it runs alongside, and — the thing players actually get stuck
  // on — pipe ports that sit ONE tile off the line: a port only connects
  // through a pipe on the tile touching its nozzle, so a line that passes a
  // tile further out looks joined but carries nothing. Cached for half a
  // second: buildContent redraws every frame.
  let _netCache = null;
  function _pipePorts() {
    const ports = [];
    const name = (e) => (EntityDefs[e.type]?.label || e.type) + (e._num !== undefined ? ` #${e._num}` : '');
    if (typeof CoolingTowerSystem !== 'undefined') for (const type of CoolingTowerSystem.TOWER_TYPES) for (const tw of EntityRegistry.getByType(type)) {
      const s = CoolingTowerSystem.getStubs(tw), cryo = type === T.COOLINGTOWER2;
      ports.push({ owner: tw, name: name(tw), label: cryo ? 'COOL IN' : 'H₂O IN', ...s.hotIn });
      ports.push({ owner: tw, name: name(tw), label: cryo ? 'CRYO OUT' : 'COOL OUT', ...s.coldOut });
    }
    if (typeof NuclearSystem !== 'undefined') for (const type of [T.NUCLEARREACTOR, T.ADVREACTOR]) for (const re of EntityRegistry.getByType(type)) {
      const s = NuclearSystem.getStubs(re);
      ports.push({ owner: re, name: name(re), label: type === T.ADVREACTOR ? 'CRYO IN' : 'COOL IN', ...s.coolIn });
      ports.push({ owner: re, name: name(re), label: 'STEAM OUT', ...s.steamOut });
    }
    return ports;
  }
  function pipeNetwork(e) {
    const now = performance.now();
    if (_netCache && _netCache.e === e && now - _netCache.at < 500) return _netCache.data;
    const fluid = pipeCurrentFluid(getPipe(e) || e);
    const net = new Set(), queue = [[e.col, e.row]];
    let peak = 0, water = null;
    while (queue.length && net.size < 4096) {
      const [c, r] = queue.shift(), key = `${c},${r}`;
      if (net.has(key)) continue;
      const tile = GridManager.getEntity(c, r);
      if (!tile || !isPipe(tile) || !pipeAllowsFluid(tile, fluid)) continue;
      net.add(key);
      const p = getPipe(tile) || tile;
      if (Number.isFinite(p._flowRate) && pipeCurrentFluid(p)) peak = Math.max(peak, p._flowRate);
      if (!water && p._waterNet) water = p._waterNet;   // the run's metered budget (PowerNetwork)
      for (const [nc, nr] of pipeBfsCoords(c, r, fluid)) if (GridManager.inBounds(nc, nr) && !net.has(`${nc},${nr}`)) queue.push([nc, nr]);
    }
    // Buildings the run brushes against (a neighbour that isn't pipe, belt or wire).
    const beside = new Map();
    const skip = new Set([T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR, T.WIRE, T.POLE, T.POWERTOWER, T.ROAD, T.TREE, T.BUSH, T.WATER].filter(Boolean));
    for (const key of net) {
      const [c, r] = key.split(',').map(Number);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const b = GridManager.getEntity(c + dc, r + dr);
        if (b && !skip.has(b.type) && !isPipe(b)) beside.set(b, (EntityDefs[b.type]?.label || b.type) + (b._num !== undefined ? ` #${b._num}` : ''));
      }
    }
    // Ports one tile off the line: the port's own tile is empty, but a tile
    // next to it is on this network.
    const near = [];
    for (const pt of _pipePorts()) {
      const here = GridManager.getEntity(pt.c, pt.r);
      if (here && isPipe(here)) continue;                                        // already has a pipe on it
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (net.has(`${pt.c + dc},${pt.r + dr}`)) { near.push(pt); break; }
      }
    }
    // One-tile gaps: an empty tile between this run and a different pipe run
    // that could carry the same fluid, where one of the two actually ENDS at
    // the gap (a stub off a port that stops just short of the main line).
    // Two lines merely running side by side a tile apart, or a run passing a
    // line of another fluid (water beside a cooling line), isn't a gap — that
    // used to be flagged, which is how a working water main reported one.
    const gaps = [];
    const pipeNbrs = (c, r) => {   // pipe neighbours of a tile, any fluid
      let n = 0;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const t = GridManager.getEntity(c + dc, r + dr); if (t && isPipe(t)) n++; }
      return n;
    };
    for (const key of net) {
      if (gaps.length >= 3) break;
      const [c, r] = key.split(',').map(Number);
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const mid = GridManager.getEntity(c + dc, r + dr);
        if (mid || !GridManager.inBounds(c + 2 * dc, r + 2 * dr)) continue;
        const fc = c + 2 * dc, fr = r + 2 * dr;
        const far = GridManager.getEntity(fc, fr);
        if (!far || !isPipe(far) || net.has(`${fc},${fr}`)) continue;
        // A tunnel mouth pointing across the gap is another line diving
        // UNDER this one on purpose, not a run that stopped short; joining
        // them would tap one line into the other. (A dry line tunnelled under
        // a water main read as a gap beside it.)
        if (far.type === T.UNDERGNDPIPE && (far._udgAxis === 'v' ? dc === 0 : far._udgAxis === 'h' ? dr === 0 : true)) continue;
        const farFluid = pipeCurrentFluid(getPipe(far) || far);
        if (fluid ? !pipeAllowsFluid(far, fluid) || (farFluid && farFluid !== fluid) : !!farFluid) continue;
        if (pipeNbrs(c, r) > 1 && pipeNbrs(fc, fr) > 1) continue;   // neither run ends here
        // The two stubs of one building (a tank's IN and OUT a tile apart on
        // the same face): joining them would loop it back into itself.
        const bldgs = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([ax, ay]) => GridManager.getEntity(x + ax, y + ay))
          .filter(b => b && !isPipe(b) && !skip.has(b.type));
        const nearB = bldgs(c, r), farB = bldgs(fc, fr);
        if (nearB.some(b => farB.includes(b))) continue;
        gaps.push({ c: c + dc, r: r + dr });
        break;
      }
    }
    // Where a gap is, in words: the nearest named building and which way.
    const describe = (g) => {
      let best = null, bd = Infinity;
      for (let y = g.r - 6; y <= g.r + 6; y++) for (let x = g.c - 6; x <= g.c + 6; x++) {
        const b = GridManager.getEntity(x, y);
        if (!b || skip.has(b.type) || isPipe(b)) continue;
        const d = Math.abs(x - g.c) + Math.abs(y - g.r);
        if (d < bd) { bd = d; best = b; }
      }
      const dc = g.c - e.col, dr = g.r - e.row;
      const dir = (dr < -1 ? 'north' : dr > 1 ? 'south' : '') + (dc < -1 ? 'west' : dc > 1 ? 'east' : '');
      const far = Math.abs(dc) + Math.abs(dr);
      const there = far <= 1 ? 'right here' : `${far} tiles ${dir || 'away'} of this pipe`;
      return best ? `${there}, beside ${(EntityDefs[best.type]?.label || best.type)}${best._num !== undefined ? ` #${best._num}` : ''}` : there;
    };
    for (const g of gaps) g.where = describe(g);
    const data = { net, tiles: net.size, fluid, peak, water, beside: [...beside.values()], besideEnts: [...beside.keys()], near, gaps };
    _netCache = { e, at: now, data };
    return data;
  }
  function pipeNetworkRows(e, row) {
    const n = pipeNetwork(e);
    const rows = [row('Network', `${n.tiles} pipe tile${n.tiles === 1 ? '' : 's'} connected`, 'neutral')];
    // Supply / drawn / spare for the whole run where it can be worked out
    // (cooling lines get theirs from coolLineRows); otherwise the busiest flow.
    const bal = n.fluid ? fluidBalanceRows(n, row) : [];
    if (bal.length) rows.push(...bal);
    else if (n.fluid) rows.push(row('Line flow', `${Number.isInteger(n.peak) ? n.peak : n.peak.toFixed(1)} units/s at its busiest`, n.peak > 0 ? 'good' : 'dim'));
    else rows.push(row('Line flow', 'nothing: no source is feeding this run', 'bad'));
    if (n.beside.length) {
      const shown = n.beside.slice(0, 5).join(', ') + (n.beside.length > 5 ? ` +${n.beside.length - 5} more` : '');
      rows.push(row('Runs beside', shown, 'dim'));
    }
    for (const pt of n.near.slice(0, 4)) {
      rows.push(row('⚠ Not joined', `${pt.name}'s ${pt.label} is one tile off this line; lay a pipe on the tile touching its nozzle`, 'bad'));
    }
    for (const g of n.gaps) {
      rows.push(row('⚠ Gap', `This run stops one tile short of another ${n.fluid ? fluidName(n.fluid) + ' ' : ''}line ${g.where}; lay a pipe on the empty tile to join them`, 'bad'));
    }
    return rows;
  }

  // ── Measured deliveries (FlowMeter) ──
  // What a producer is REALLY handing over, per second, and to whom — so a
  // mine reads "1.13 coal/s → Coal Generator ×2 (0.56 each)", in the same
  // units the consumer's own panel uses for its draw.
  const FLOW_UNIT = { coal: 'coal/s', oil: 'crude/s' };
  const flowUnit  = kind => FLOW_UNIT[kind] || 'units/s';
  const fmtFlow   = n => n >= 100 ? Math.round(n).toString() : n >= 10 ? n.toFixed(1) : n.toFixed(2);
  const _kindName = kind => (typeof SolidStorageSystem !== 'undefined' && SolidStorageSystem.label?.(kind))
                            || ({ oil: 'Crude' }[kind]) || kind[0].toUpperCase() + kind.slice(1);
  function deliveryRows(e, row, emptyMsg) {
    if (typeof FlowMeter === 'undefined') return [];
    const flows = FlowMeter.outOf(e);
    if (!flows.length) return emptyMsg ? [row('Delivering', emptyMsg, 'dim')] : [];
    const rows = [];
    for (const f of flows) {
      const unit = flowUnit(f.kind);
      rows.push(row(flows.length > 1 ? `Delivering ${_kindName(f.kind)}` : 'Delivering', `${fmtFlow(f.total)} ${unit}`, 'good'));
      const groups = new Map();
      for (const l of f.links) {
        const name = EntityDefs[l.ent.type]?.label || l.ent.type;
        const g = groups.get(name) || { n: 0, rate: 0 };
        g.n++; g.rate += l.rate;
        groups.set(name, g);
      }
      for (const [name, g] of groups) {
        rows.push(row(`→ ${name}${g.n > 1 ? ` ×${g.n}` : ''}`,
          `${fmtFlow(g.rate)} ${unit}${g.n > 1 ? ` (${fmtFlow(g.rate / g.n)} each)` : ''}`, 'neutral'));
      }
    }
    return rows;
  }
  const _OWN_DELIVERY_ROWS = new Set([T.COALMINE, T.COALMINE2, T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2, T.LITHIUMMINE, T.RAREEARTHMINE, T.PUMPJACK, T.PUMPJACK2]);
  // What a consumer is really receiving, per kind, and from what.
  function receivingRows(e, row) {
    if (typeof FlowMeter === 'undefined') return [];
    return FlowMeter.inTo(e).map(f => {
      const names = [...new Set(f.links.map(l => EntityDefs[l.ent.type]?.label || l.ent.type))];
      return row(`${_kindName(f.kind)} In`, `${fmtFlow(f.total)} ${flowUnit(f.kind)} from ${names.join(', ')}`, 'good');
    });
  }
  // "Enough for ~2.9 Coal Generators (0.56 coal/s each)": how many of its
  // main consumer a producer's rate keeps running flat out.
  // A reactor's steam against what its turbines drew last tick
  // (SteamTurbineSystem tallies _steamUsed / _turbinesFed per source).
  function turbineDrawRow(e, out, gen, row) {
    if (!gen) return row('Turbine Draw', '—', 'dim');
    const used = e._steamUsed || 0, fed = e._turbinesFed || 0;
    const pct = out > 0 ? Math.round(used / out * 100) : 0;
    return row('Turbine Draw', `${used} / ${out} u/s (${pct}%) · ${fed} turbine${fed === 1 ? '' : 's'}`,
               fed === 0 ? 'bad' : pct >= 90 ? 'good' : 'neutral');
  }

  function supportsRow(row, rate, perConsumer, consumerLabel, unit) {
    if (!(perConsumer > 0)) return '';
    const n = rate / perConsumer;
    const nTxt = n >= 10 ? Math.floor(n).toString() : (Math.floor(n * 10) / 10).toString();
    const plural = nTxt === '1' ? consumerLabel : consumerLabel.replace(/y$/, 'ie') + 's';
    return row('Enough For', rate > 0
      ? `~${nTxt} ${plural} (${fmtFlow(perConsumer)} ${unit} each)`
      : '—', rate > 0 ? 'good' : 'dim');
  }

  // Appends "— N units/s" to a material label when a numeric rate is known.
  // Pipes/conveyors don't store an actual in-transit quantity (flow is
  // modeled as instantaneous, not buffered per-tile), so this reports the
  // nominal throughput of the connected source/consumer rather than a
  // literal "amount currently inside this tile".
  function withRate(label, rate) {
    return (rate !== undefined && rate !== null) ? `${label}: ${rate} units/s` : label;
  }

  // ── Belt: how many of its destination machines it could keep running ──
  // The line's supply — its producers at full rate, the same figure each
  // one's own "Enough For" row uses, so a line's count is the sum of its
  // mines' — over what one machine draws at its normal rate (for the Core
  // Works and the Spent Fuel Pool, which take in batches, the most they will
  // take). Belts set no limit: the sim moves whatever its producers make,
  // however many feed one belt, so neither does this. Storage Containers
  // aren't counted as consumers: they take whatever arrives.
  // Which leg of the spent fuel line a belt is on: true past a pool's
  // COOLED FUEL OUT, false between a reactor and a pool.
  function _spentFromPool(e, line) {
    if (line && line.sources.length) return line.sources.some(b => b.type === T.SPENTFUELPOOL);
    const src = e._spentFuelConveyorSource || (beltOf(e) || {})._spentFuelConveyorSource;
    return !!src && src.type === T.SPENTFUELPOOL;
  }
  function _beltFeeds(kind) {
    const D = t => EntityDefs[t] || {};
    switch (kind) {
      case 'coal':       return [[T.COALGENERATOR, D(T.COALGENERATOR).coalPerSecond], [T.COKEOVEN, D(T.COKEOVEN).coalPerSec]];
      case 'uranium':    return [[T.FUELPLANT, D(T.FUELPLANT).uraniumPerSec], [T.MOXPLANT, D(T.MOXPLANT).moxPerSec * D(T.MOXPLANT).uraniumPerUnit]];
      case 'sulfur':     return [[T.CHEMICALPLANT, D(T.CHEMICALPLANT).sulfurPerSec]];
      case 'lithium':    return [[T.LITHIUMPROCESSPLANT, D(T.LITHIUMPROCESSPLANT).orePerSec]];
      case 'compound':   return [[T.TRITIUMBREEDER, D(T.TRITIUMBREEDER).compoundPerSec], [T.HULKINGFUSIONREACTOR, D(T.HULKINGFUSIONREACTOR).blanketPerSec]];
      case 'rods':       return [[T.NUCLEARREACTOR, D(T.NUCLEARREACTOR).rodPerSec]];
      case 'mox':        return [[T.ADVREACTOR, D(T.ADVREACTOR).rodPerSec]];
      case 'spent':      return [[T.REPROCESSOR, D(T.REPROCESSOR).spentFuelPerSec], [T.SPENTFUELPOOL, D(T.SPENTFUELPOOL).intakeRate]];
      case 'pellets':    return [[T.HULKINGFUSIONREACTOR, D(T.HULKINGFUSIONREACTOR).plasmaPerSec], [T.ADVFUSIONREACTOR, D(T.ADVFUSIONREACTOR).plasmaPerSec]];
      case 'he3pellets': return [[T.ADVFUSIONREACTOR, D(T.ADVFUSIONREACTOR).plasmaPerSec]];
      case 'plutonium':  return [[T.MOXPLANT, D(T.MOXPLANT).moxPerSec * D(T.MOXPLANT).plutoniumPerUnit]];
      case 'recovered':  return [[T.MOXPLANT, D(T.MOXPLANT).moxPerSec * D(T.MOXPLANT).uraniumPerUnit]];
      case 'rareearth':  return [[T.LEACHPLANT, D(T.LEACHPLANT).orePerSec]];
      case 'oxide':      return [[T.SCMILL, D(T.SCMILL).oxidePerSec]];
      case 'tape':       return [[T.COREWORKS, D(T.COREWORKS).tapeIntakePerSec]];
      case 'coke':       return [[T.GRAPHITEFURNACE, D(T.GRAPHITEFURNACE).cokePerSec]];
      case 'graphite':   return [[T.ADVREACTOR, D(T.ADVREACTOR).graphitePerSec]];
    }
    return [];
  }
  const _fmtN = n => n >= 10 ? Math.round(n).toString() : n >= 1 ? n.toFixed(1) : n >= 0.1 ? n.toFixed(2) : (+n.toPrecision(2)).toString();
  // "Facility" → "Facilities"; names that are already plural or uncountable
  // ("Core Works", "Advanced Fuel Processing") stay as they are.
  const _plural = (label, n) => n === 1 || /(Works|Processing|s)$/.test(label) ? label
    : /[^aeiou]y$/.test(label) ? label.slice(0, -1) + 'ies' : label + 's';
  // A tile with no rate of its own (past a merge, or once the stamp has
  // lapsed with the source's stock) takes the line's: the nearest belt tile
  // along the same run that has one and has carried the same cargo.
  function _beltLineRate(e, kind) {
    // Belts under pipe crossings sit on the pipe's tile (beltOf), and
    // underground belts jump their tunnel (beltSteps), so both are followed.
    const seenKind = (c, r) => (typeof BeltCargo !== 'undefined' && BeltCargo.kindAt(c, r) || {}).kind;
    const q = [[e.col, e.row]], seen = new Set([e.col + ',' + e.row]);
    for (let i = 0; i < q.length && i < 800; i++) {
      const [c, r] = q[i];
      const t = GridManager.getEntity(c, r), b = beltOf(t);
      const rate = (t && t._flowRate) || (b && b._flowRate) || 0;
      if (i && rate > 0 && (seenKind(c, r) || kind) === kind) return rate;
      const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dc, dr]) => [c + dc, r + dr]);
      for (const [dc, dr] of beltSteps(c, r)) next.push([c + dc, r + dr]);
      for (const [nc, nr] of next) {
        const k = nc + ',' + nr;
        if (seen.has(k) || !GridManager.inBounds(nc, nr) || !beltOf(GridManager.getEntity(nc, nr))) continue;
        seen.add(k); q.push([nc, nr]);
      }
    }
    return 0;
  }
  // What one producer puts out of `kind` at full rate, units/s: the same
  // figures each system stamps on its OUT belt and each mine's own panel
  // shows (nothing from a worked-out deposit). A Storage Container is a
  // pass-through: its sustained supply is what keeps arriving at it; stock
  // it already holds is reported separately (beltFeedRows), not as a rate.
  function _beltSourceRate(src, kind) {
    const D = EntityDefs[src.type] || {};
    const dry = !!src._linkedDeposit && typeof isDepositExhausted === 'function' && isDepositExhausted(src._linkedDeposit);
    switch (src.type) {
      case T.COALMINE: case T.COALMINE2: return CoalSystem.minedPerSecond(src);
      case T.URANIUMMINE: case T.RAREEARTHMINE: return dry ? 0 : ORE_MINE_RATE;
      case T.SULFURMINE: case T.SULFURMINE2: return dry ? 0 : SulfurSystem.mineRate(src);
      case T.LITHIUMMINE: return dry ? 0 : LITHIUM_MINE_RATE;
      case T.LEACHPLANT: return D.oxidePerSec || 0;
      case T.SCMILL: return D.tapePerSec || 0;
      case T.COKEOVEN: return D.cokePerSec || 0;
      case T.GRAPHITEFURNACE: return D.graphitePerSec || 0;
      case T.FUELPLANT: return D.rodPerSec || 0;
      case T.MOXPLANT: return D.moxPerSec || 0;
      case T.LITHIUMPROCESSPLANT: return D.compoundPerSec || 0;
      case T.FUSIONFUELPLANT: return kind === 'he3pellets' ? (D.plasmaPerSec || 0) * (D.he3PelletShare || 0.25) : (D.plasmaPerSec || 0);
      case T.REPROCESSOR: return (D.spentFuelPerSec || 0) * ((kind === 'plutonium' ? D.plutoniumPerUnit : D.recoveredPerUnit) || 0);
      case T.NUCLEARREACTOR: case T.ADVREACTOR: return D.spentFuelPerSec || 0;
      case T.SPENTFUELPOOL: return D.outRate || 0;
      case T.SOLIDSTORAGE: {
        const inflow = typeof FlowMeter !== 'undefined' ? ((FlowMeter.inTo(src).find(k => k.kind === kind) || {}).total || 0) : 0;
        return inflow > 0.005 ? inflow : 0;
      }
    }
    return 0;
  }
  // The belt run `e` is on (followed by its real links: beltSteps, so a
  // belt laid alongside another isn't counted as joined to it), the
  // producers whose OUT stub is on it and the machines whose IN stub is.
  function _beltLine(e, kind) {
    const tiles = new Set([e.col + ',' + e.row]), near = new Set(), q = [[e.col, e.row]];
    for (let i = 0; i < q.length && i < 6000; i++) {
      const [c, r] = q[i];
      for (const [dc, dr] of beltSteps(c, r)) {
        const nc = c + dc, nr = r + dr, k = nc + ',' + nr;
        if (tiles.has(k) || !GridManager.inBounds(nc, nr) || !beltOf(GridManager.getEntity(nc, nr))) continue;
        tiles.add(k); q.push([nc, nr]);
      }
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = GridManager.inBounds(c + dc, r + dr) ? GridManager.getEntity(c + dc, r + dr) : null;
        if (n && !beltOf(n) && n.type !== T.TREE && n.type !== T.BUSH) near.add(n);
      }
    }
    const on = p => !!p && tiles.has(p.c + ',' + p.r);
    const takers = new Set(_beltFeeds(kind).map(([t]) => t));
    const sources = [], sinks = [];
    for (const b of near) {
      // A producer counts only for what it ships: on a belt carrying ore and
      // recovered uranium both, the mine is not a source of the second.
      const ships = b.type === T.SOLIDSTORAGE ? (!b._solidType || b._solidType === kind) : BeltCargo.srcKinds(b).includes(kind);
      if (ships && BeltCargo.srcPorts(b, kind).some(on)) sources.push(b);
      else if (takers.has(b.type) && BeltCargo.dstPorts(b, kind).some(on)) sinks.push(b);
    }
    return { sources, sinks };
  }
  // "2 Sulfur Mines and a Storage Container" from a list of buildings.
  function _countNames(list) {
    const by = new Map();
    for (const b of list) { const l = (EntityDefs[b.type] || {}).label || b.type; by.set(l, (by.get(l) || 0) + 1); }
    return [...by].map(([l, n]) => `${n} ${_plural(l, n)}`).join(', ');
  }
  function beltFeedRows(e, kind, row) {
    let feeds = _beltFeeds(kind).filter(([, per]) => per > 0);
    if (!feeds.length) return [];
    const line = typeof BeltCargo !== 'undefined' && BeltCargo.srcPorts ? _beltLine(e, kind) : { sources: [], sinks: [] };
    // Spent fuel runs in two legs: reactors → Spent Fuel Pool, then pool →
    // Reprocessing Plant (which takes only cooled fuel). Offer only the
    // consumer this leg can actually feed.
    if (kind === 'spent') {
      const fromPool = _spentFromPool(e, line);
      feeds = feeds.filter(([t]) => t === (fromPool ? T.REPROCESSOR : T.SPENTFUELPOOL));
    }
    // The line's supply: every producer on it at full rate. With none found
    // (a source the tables don't know), the rate stamped along the belt.
    let supply = line.sources.length ? line.sources.reduce((s, b) => s + _beltSourceRate(b, kind), 0)
               : (e._flowRate > 0 ? e._flowRate : _beltLineRate(e, kind));
    const rows = [];
    // Stock already banked in the line's Storage Containers: real, but it
    // runs out, so it isn't counted as a rate.
    const bins = line.sources.filter(b => b.type === T.SOLIDSTORAGE && b._solidType === kind && (b._stored || 0) > 0.5);
    const stored = bins.reduce((s, b) => s + (b._stored || 0), 0);
    if (line.sources.length) {
      const needsPower = b => ((EntityDefs[b.type] || {}).powerInput || 0) > 0;
      const unpowered = line.sources.filter(b => needsPower(b) && !b.powered).length;
      if (!(supply > 0) && stored > 0) {
        // Nothing producing, but a bin is paying out its stock: the machines
        // are still fed, so this is a warning, not a dead "0/s" in red.
        rows.push(row('Line Supply', `Nothing arriving: drawing on ${Math.round(stored)} banked in ${_countNames(bins)}`, 'warn'));
      } else {
        rows.push(row('Line Supply', `${_fmtN(supply)}/s from ${_countNames(line.sources)}`
          + (unpowered ? ` (${unpowered} unpowered: nothing until they are)` : ''), supply > 0 ? '' : 'bad'));
        if (stored > 0) rows.push(row('In Storage', `${Math.round(stored)} more banked in ${_countNames(bins)}, sent on as machines need it`, 'dim'));
      }
    }
    if (!(supply > 0)) {
      const emptyBin = line.sources.some(b => b.type === T.SOLIDSTORAGE);
      return [...rows, row('Can Feed', stored > 0 ? 'Only until the stock runs out: belt a producer into the line or the bin\'s IN stub to refill it'
                                     : emptyBin ? 'Nothing yet: its Storage Container is empty and nothing is arriving' : 'No supply on this line yet', 'dim')];
    }
    feeds.forEach(([type, per], i) => {
      const exact = supply / per, n = Math.floor(exact + 1e-6);
      const name = (EntityDefs[type] || {}).label || type;
      // Rounded down to a tenth, as the producers' own "Enough For" rows are.
      const exactTxt = exact >= 10 ? Math.floor(exact).toString() : (Math.floor(exact * 10 + 1e-6) / 10).toString();
      const val = n >= 1 ? `${n} ${_plural(name, n)} (${_fmtN(supply)}/s ÷ ${_fmtN(per)}/s each = ${exactTxt})`
                         : `1 ${name} at ${Math.round(exact * 100)}% of its rate (${_fmtN(supply)}/s of the ${_fmtN(per)}/s it takes)`;
      rows.push(row(i === 0 ? 'Can Feed' : 'Or', val, n >= 1 ? 'good' : ''));
    });
    // What is actually hooked up, against what the line can carry.
    if (line.sinks.length) {
      const [type, per] = feeds[0];
      const mine = line.sinks.filter(b => b.type === type).length;
      const over = mine > supply / per + 1e-6;
      rows.push(row('On This Line', _countNames(line.sinks) + (over ? ': more than it can keep fully fed' : ''), over ? 'bad' : 'good'));
    }
    // Coal Generators draw by throttle: what the same line runs on Eco and Overdrive.
    if (kind === 'coal') {
      const m = EntityDefs[T.COALGENERATOR].throttleModes, per = EntityDefs[T.COALGENERATOR].coalPerSecond;
      const at = k => Math.floor(supply / (per * (m[k]?.coal || 1)) + 1e-6);
      rows.push(row('By Throttle', `Eco ${at('eco')} · Normal ${at('normal')} · Overdrive ${at('overdrive')}`, 'dim'));
    }
    return rows;
  }

  // "16 units/s", or "0 units/s" when the pipe is idle. A live fluid with no
  // recorded rate (shouldn't happen) reads as an em dash rather than a fake 0.
  function flowUnits(mat) {
    if (!mat.flowing) return '0 units/s';
    const n = Number(mat.rate);
    if (!Number.isFinite(n)) return '—';
    return `${Number.isInteger(n) ? n : n.toFixed(1)} units/s`;
  }

  // The Circuit Switch's network list lives on the panel itself rather than
  // inside #ep-body. buildContent() does `body.innerHTML = ''` every frame,
  // which detaches and re-attaches anything parented there — that resets
  // scrollTop and, worse, cancels an in-progress scrollbar drag, so a long
  // list could not be scrolled at all. Parked out here it is never touched
  // by the rebuild and behaves like an ordinary scrolling list.
  let _switchListEl = null;
  function _switchListHost() {
    if (!_switchListEl) {
      _switchListEl = document.createElement('div');
      _switchListEl.id = 'ep-switch-list';
      _switchListEl.className = 'ep-section';
      const panel = document.getElementById('entity-panel');
      if (panel) panel.appendChild(_switchListEl);
    }
    return _switchListEl;
  }

  // Delegated: the Engineering Office's button, rebuilt every tick.
  document.addEventListener('mousedown', ev => {
    if (!ev.target.closest || !ev.target.closest('[data-open-advisor]')) return;
    ev.preventDefault(); ev.stopPropagation();
    SFX.click?.();
    if (typeof Advisor !== 'undefined') Advisor.open();
  }, true);

  // Delegated: the Empty button is rebuilt every tick with buildContent().
  // First click arms it, a second within 3 s pays the fee and starts the
  // drain; while a vessel is emptying the same button stops it.
  document.addEventListener('mousedown', ev => {
    if (!ev.target.closest || !ev.target.closest('[data-drain-tank]')) return;
    const e = target;
    if (!e || !StorageDrain.allowed(e)) return;
    ev.preventDefault(); ev.stopPropagation();
    const now = performance.now();
    if (e._draining) {
      StorageDrain.stop(e);
      showToast(`Emptying stopped: ${Math.ceil(StorageDrain.amount(e)).toLocaleString()} units kept`, '#e0a050', '#140c02', '#604010');
    } else if ((e._drainArmUntil || 0) > now) {
      const amt = Math.ceil(StorageDrain.amount(e)), fee = StorageDrain.fee(e);
      e._drainArmUntil = 0;
      if (StorageDrain.start(e)) showToast(`🚱 Emptying ${amt.toLocaleString()} units: ${formatMoney(fee)} paid`, '#e0a050', '#140c02', '#604010');
      else showToast(`⚠ Not enough money to empty this (${formatMoney(fee)})`, '#ff8040', '#180a00', '#804020');
    } else {
      e._drainArmUntil = now + 3000;   // confirm within 3 s
    }
    SFX.click?.();
    buildContent();
  }, true);

  // Delegated for the same reason: Drone / Truck Supply. The button opens a
  // list of everything the vessel can ask for; picking one sets it and
  // closes the list. A vessel may ask both fleets at once, but for the same
  // material — it holds one kind at a time — so picking a material for one
  // fleet moves the other fleet's request (if it has one) onto it too.
  let _supplyMenu = null;   // { e, fleet: 'drone' | 'truck' } while that list is open
  document.addEventListener('mousedown', ev => {
    const el = ev.target.closest && ev.target.closest('[data-supply-toggle],[data-supply-pick]');
    if (!el) return;
    const e = target;
    if (!e || typeof DroneSystem === 'undefined') return;
    ev.preventDefault(); ev.stopPropagation();
    if (el.hasAttribute('data-supply-toggle')) {
      const fleet = el.getAttribute('data-supply-toggle');
      const open = _supplyMenu && _supplyMenu.e === e && _supplyMenu.fleet === fleet;
      _supplyMenu = open ? null : { e, fleet };
    } else {
      const kind = el.getAttribute('data-supply-pick') || undefined;
      if (el.getAttribute('data-fleet') === 'drone') { e._droneSupply = kind; if (kind && e._truckSupply) e._truckSupply = kind; }
      else                                          { e._truckSupply = kind; if (kind && e._droneSupply) e._droneSupply = kind; }
      _supplyMenu = null;
    }
    SFX.click?.();
    buildContent();
  }, true);

  // The button plus, while open, the list of choices under it. `pal` is the
  // fleet's colours: [border, background, text] for set, unset and options.
  function supplyPicker(e, body, fleet, current, label, title, pal) {
    const open = !!(_supplyMenu && _supplyMenu.e === e && _supplyMenu.fleet === fleet);
    const b = document.createElement('button');
    b.setAttribute('data-supply-toggle', fleet);
    b.textContent = current ? `${label} SUPPLY: ${DroneSystem.cargoLabel(current).toUpperCase()} ${open ? '▴' : '▾'}` : `REQUEST ${label} SUPPLY ${open ? '▴' : '▾'}`;
    b.title = title;
    b.style.cssText = 'width:100%;margin:8px 0 2px;font-size:9px;letter-spacing:1.5px;padding:8px 0;border-radius:2px;cursor:pointer;' +
      (current ? `border:1px solid ${pal.set[0]};background:${pal.set[1]};color:${pal.set[2]};` : `border:1px solid ${pal.unset[0]};background:transparent;color:${pal.unset[2]};`);
    body.appendChild(b);
    if (!open) return;
    const list = document.createElement('div');
    list.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:3px;margin:2px 0 4px;';
    const opts = [{ kind: '', label: 'Off' }, ...DroneSystem.cargoOptions(e.type)];
    for (const o of opts) {
      const sel = (o.kind || undefined) === (current || undefined);
      const btn = document.createElement('button');
      btn.setAttribute('data-supply-pick', o.kind);
      btn.setAttribute('data-fleet', fleet);
      btn.textContent = (sel ? '● ' : '') + o.label;
      btn.style.cssText = 'font-size:9px;letter-spacing:0.5px;padding:6px 4px;border-radius:2px;cursor:pointer;text-align:left;' +
        (sel ? `border:1px solid ${pal.set[0]};background:${pal.set[1]};color:${pal.set[2]};` : `border:1px solid ${pal.unset[0]};background:rgba(0,0,0,0.25);color:${pal.unset[2]};`);
      list.appendChild(btn);
    }
    body.appendChild(list);
  }

  const beltPieceDef = (e) => EntityDefs[beltPieceType(e)] || EntityDefs[T.CONVEYOR];

  // Field Cores on a fusion reactor (FieldCoreSystem): each installed core,
  // the outgoing bay, the boost and what it costs, and the 0–3 control for
  // how many cores the reactor should run. Shown once the Core Works is
  // unlocked, since there is nothing to fill the slots before then.
  function fieldCoreBlock(e, body, section, row) {
    if (typeof FieldCoreSystem === 'undefined' || !Progression.isUnlocked(T.COREWORKS)) return;
    const F = FieldCoreSystem, list = F.cores(e), want = F.wanted(e);
    const slots = [];
    for (let i = 0; i < F.MAX_SLOTS; i++) {
      const c = list[i];
      if (c) {
        const low = (c.charge || 0) <= F.SWAP_AT;
        slots.push(row(`Core Slot ${i + 1}`, `${c.id} · ${Math.floor((c.charge || 0) * 100)}% charge${low ? ' · swap due' : ''}`, low ? 'warn' : 'good'));
      } else if (i < want) slots.push(row(`Core Slot ${i + 1}`, 'Waiting for a core', 'neutral'));
    }
    const b = F.boost(e), eff = F.effectiveBoost(e), starved = eff < b - 0.005;
    section(
      row('Field Cores', want ? `${list.length} / ${want} installed` : 'None requested: set how many below', want ? '' : 'dim'),
      ...slots,
      ...(e._coreOut ? [row('Outgoing Bay', `${e._coreOut.id}${e._coreOut.quenched ? ' (quenched)' : ''}: waiting for a drone or Hauler`, 'warn')] : []),
      ...(b > 0 ? [
        row('Core Boost',  `+${Math.round(eff * 100)}% conversion output${starved ? ` (of +${Math.round(b * 100)}%: short of fuel)` : ''}`, starved ? 'warn' : 'good'),
        row('Extra Fuel',  `+${Math.round((F.fuelFactor(e) - 1) * 100)}% pellets`, 'dim'),
      ] : []),
      ...(list.length ? [row('Core Boil-off', `+${F.boilOff(e)} u/s liquid helium`, 'dim')] : []),
    );
    const g = document.createElement('div');
    g.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:3px;margin:4px 0 6px;';
    for (let n = 0; n <= F.MAX_SLOTS; n++) {
      const btn = document.createElement('button');
      btn.setAttribute('data-core-slots', String(n));
      btn.textContent = n === 0 ? 'NO CORES' : `${n} CORE${n > 1 ? 'S' : ''}`;
      btn.title = n === 0 ? 'Run without Field Cores; any installed are collected' : `Keep ${n} Field Core${n > 1 ? 's' : ''} in this reactor (+${Math.round(F.BOOST.slice(0, n).reduce((a, x) => a + x, 0) * 100)}% output)`;
      const on = n === want;
      btn.style.cssText = 'font-size:9px;letter-spacing:1px;padding:7px 0;border-radius:2px;cursor:pointer;' +
        (on ? 'border:1px solid #5aa8d8;background:#0e2a3a;color:#9fd8ff;' : 'border:1px solid #3a4a58;background:transparent;color:#8aa0b0;');
      g.appendChild(btn);
    }
    body.appendChild(g);
  }
  document.addEventListener('mousedown', ev => {
    const el = ev.target.closest && ev.target.closest('[data-core-slots]');
    if (!el) return;
    const e = target;
    if (!e || typeof FieldCoreSystem === 'undefined' || !FieldCoreSystem.isHost(e)) return;
    ev.preventDefault(); ev.stopPropagation();
    SFX.click?.();
    FieldCoreSystem.setSlots(e, +el.getAttribute('data-core-slots'));
  }, true);

  // Delegated, like the buttons above: the Core Works' two switches.
  document.addEventListener('mousedown', ev => {
    const el = ev.target.closest && ev.target.closest('[data-coreworks-offpeak],[data-coreworks-build]');
    if (!el) return;
    const e = target;
    if (!e || e.type !== T.COREWORKS) return;
    ev.preventDefault(); ev.stopPropagation();
    SFX.click?.();
    if (el.hasAttribute('data-coreworks-offpeak')) e._offPeak = !e._offPeak;
    else e._buildCores = e._buildCores === false;
  }, true);

  // Delegated, like the buttons above: a Conveyor Splitter's mode, favoured
  // side and ratio. Whatever is picked becomes the next splitter's settings.
  document.addEventListener('mousedown', ev => {
    const el = ev.target.closest && ev.target.closest('[data-split-mode],[data-split-side],[data-split-ratio]');
    if (!el) return;
    const e = beltOf(target);   // the splitter itself, or the one under a pipe crossing
    if (!e || !e._splitter) return;
    ev.preventDefault(); ev.stopPropagation();
    if (el.hasAttribute('data-split-mode'))  e._splitMode  = el.getAttribute('data-split-mode');
    if (el.hasAttribute('data-split-side'))  e._splitSide  = +el.getAttribute('data-split-side');
    if (el.hasAttribute('data-split-ratio')) e._splitRatio = Math.min(0.9, Math.max(0.1, Math.round((e._splitRatio + +el.getAttribute('data-split-ratio')) * 10) / 10));
    e._autoSplit = false;   // set by the player: it stays, branch or no branch
    InputManager.state.splitter = splitterSettings(e);
    SFX.click?.();
    buildContent();
  }, true);

  // Mode, favoured side and ratio pickers, then each way out with what is
  // leaving by it (BeltCargo meters splitters as stock is handed over).
  function splitterBlock(e, body, section, row) {
    const mode = e._splitMode || 'even', side = e._splitSide || 0, ratio = e._splitRatio || 0.7;
    const pct = Math.round(ratio * 100);
    const what = mode === 'priority' ? `${SPLIT_SIDE_NAMES[side]} is filled first; the other ways share what is left`
               : mode === 'ratio'    ? `${SPLIT_SIDE_NAMES[side]} gets ${pct}%, the other ways share ${100 - pct}%`
               : 'Every way out gets an equal share';
    section(
      row('Split',   what),
      row('Applies', 'When there is not enough to go round. A way that needs less than its share passes the rest on.', 'dim'),
      ...(e._autoSplit ? [row('Placed', 'Automatically, where the line splits. Change a setting to keep it if the branch goes.', 'dim')] : []),
    );
    const btnCss = (on) => 'font-size:9px;letter-spacing:1px;padding:6px 4px;border-radius:2px;cursor:pointer;' +
      (on ? 'border:1px solid #c08030;background:#3a2810;color:#ffd080;' : 'border:1px solid #5a4020;background:rgba(0,0,0,0.25);color:#c09060;');
    const grid = (cols, items) => {
      const g = document.createElement('div');
      g.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:3px;margin:4px 0;`;
      for (const [attr, val, label, on, title] of items) {
        const b = document.createElement('button');
        b.setAttribute(attr, val);
        b.textContent = label;
        if (title) b.title = title;
        b.style.cssText = btnCss(on);
        g.appendChild(b);
      }
      body.appendChild(g);
    };
    grid(3, [
      ['data-split-mode', 'even',     'EVEN',     mode === 'even',     'Equal shares, as at a plain junction'],
      ['data-split-mode', 'priority', 'PRIORITY', mode === 'priority', 'The favoured way is filled first'],
      ['data-split-mode', 'ratio',    'RATIO',    mode === 'ratio',    'The favoured way gets a set share'],
    ]);
    if (mode !== 'even') {
      grid(4, SPLIT_SIDE_NAMES.map((n, i) => ['data-split-side', String(i), ['↑ N', '→ E', '↓ S', '← W'][i], i === side, `Favour the ${n.toLowerCase()} way out (hover + R turns it too)`]));
    }
    if (mode === 'ratio') {
      grid(3, [
        ['data-split-ratio', '-0.1', '− 10%', false, 'Less to the favoured way'],
        ['data-split-ratio', '0',    `${pct} / ${100 - pct}`, true, 'Favoured way / the others'],
        ['data-split-ratio', '0.1',  '+ 10%', false, 'More to the favoured way'],
      ]);
    }
    // Each side a belt or a building touches, and what has left by it lately.
    const m = e._splitMeter;
    const now = typeof DayNight !== 'undefined' ? DayNight.getElapsed() : 0;
    const fresh = m && now - m.t0 < 12;
    const ways = [];
    SPLIT_SIDES.forEach(([dc, dr], i) => {
      const n = GridManager.getEntity(e.col + dc, e.row + dr);
      if (!n) return;
      const r = fresh ? m.rate[i] : 0;
      const tag = mode !== 'even' && i === side ? ' ★' : '';
      ways.push(row(`${SPLIT_SIDE_NAMES[i]}${tag}`, r > 0.005 ? `${r.toFixed(2)} units/s out` : 'Nothing out', r > 0.005 ? 'good' : 'dim'));
    });
    if (ways.length) section(...ways);
  }

  // A vessel holds one material at a time, so even a trace of something else
  // leaves a supply flag no room: drones and Haulers never get a job for it.
  // Returns what it holds if that differs from `want`, else null.
  function supplyBlockedBy(e, want) {
    if (!want || e._draining || StorageDrain.amount(e) <= 0.001) return null;
    const held = e.type === T.GASSTORAGE ? e._gasType : e.type === T.OILSTORAGE ? e._liquidType : e._solidType;
    return held && held !== want ? held : null;
  }
  const supplyBlockedRows = (e, want, who, row) => {
    const held = supplyBlockedBy(e, want);
    if (!held) return [];
    return [row('Blocked', `Holds ${Math.ceil(StorageDrain.amount(e)).toLocaleString()} ${DroneSystem.cargoLabel(held)}: empty it before ${who} can bring ${DroneSystem.cargoLabel(want)}`, 'bad')];
  };

  // Empty Tank / Holder / Container: the row and button for StorageDrain
  // (resource_helpers.js). A vessel must be empty before it can be removed,
  // and one holding something nothing downstream takes had no other way out.
  function drainBlock(e, body, section, row) {
    if (!StorageDrain.allowed(e)) return;
    const amt = StorageDrain.amount(e), secs = Math.max(1, Math.ceil(StorageDrain.secondsLeft(e)));
    if (e._draining) section(row('Emptying', `${Math.ceil(amt).toLocaleString()} units left, ~${secs}s. Takes nothing in until done`, 'neutral'));
    // A trace is left alone, unless it is what's blocking a supply flag.
    else if (amt <= 0.5 && !supplyBlockedBy(e, e._droneSupply) && !supplyBlockedBy(e, e._truckSupply)) return;
    const armed = !e._draining && (e._drainArmUntil || 0) > performance.now();
    const fee = formatMoney(StorageDrain.fee(e));
    const noun = e.type === T.GASSTORAGE ? 'HOLDER' : e.type === T.OILSTORAGE ? 'TANK' : 'CONTAINER';
    const btn = document.createElement('button');
    btn.setAttribute('data-drain-tank', '');
    btn.textContent = e._draining ? 'STOP EMPTYING (FEE NOT RETURNED)'
      : armed ? `CLICK AGAIN: DISCARD ${Math.ceil(amt).toLocaleString()} UNITS FOR ${fee}`
      : `EMPTY ${noun} · ${fee} · ~${secs}s`;
    btn.title = 'Pays a disposal fee, then drains and discards the contents over a few seconds. Nothing comes in while it drains. It must be empty before it can be removed.';
    btn.style.cssText = 'width:100%;margin:8px 0 2px;font-size:9px;letter-spacing:1.5px;padding:8px 0;border-radius:2px;cursor:pointer;' +
      (armed || e._draining ? 'border:1px solid #a04030;background:#3a120c;color:#ff9070;'
                            : 'border:1px solid #6a4a20;background:transparent;color:#e0a050;');
    body.appendChild(btn);
  }

  // Drone Supply rows + button for a storage vessel. Only shown once a Drone
  // Port exists -- before that it is a control for something you cannot have.
  function droneSupplyBlock(e, body, section, row) {
    if (typeof DroneSystem === 'undefined') return;
    const ports = [...EntityRegistry.getByType(T.DRONEPORT)];
    if (!ports.length) return;
    const k = e._droneSupply;
    const covered = ports.some(p => {
      const n = DroneSystem.networkOf(p);
      const cx = (e.col + (e.width || 1) / 2) * TILE, cy = (e.row + (e.height || 1) / 2) * TILE;
      return n.squares.some(q => cx >= q.l && cx <= q.r && cy >= q.t && cy <= q.b);
    });
    const inbound = k ? DroneSystem.cargoInbound(e) : 0;
    section(
      row('Drone Supply', k ? DroneSystem.cargoLabel(k) : 'Off', k ? 'good' : 'dim'),
      ...supplyBlockedRows(e, k, 'drones', row),
      ...(k ? [row('Coverage', covered ? 'Inside drone coverage' : 'OUTSIDE drone coverage: no flights', covered ? 'good' : 'bad'),
               row('Inbound', inbound > 0 ? `${Math.round(inbound)} units on the way` : '—', inbound > 0 ? 'neutral' : 'dim'),
               row('Sources', 'Producers + unflagged vessels in the same drone network', 'dim')] : []),
      ...(k && DroneSystem.slowedBy() ? [row('Flights', `${DroneSystem.slowedBy().name}: deliveries slowed to ${Math.round(DroneSystem.slowedBy().speed * 100)}% speed until it clears`, 'neutral')] : []),
    );
    supplyPicker(e, body, 'drone', k, 'DRONE', 'Drones fly this resource in from producers in range.',
                 { set: ['#6040a0', '#1a1030', '#d0a0ff'], unset: ['#403060', 'transparent', '#a080d0'] });
  }

  // Truck Supply: the same flag, for Haulers (the picker above handles its
  // clicks). It can be on alongside Drone Supply, for the same material.
  // Shown on Storage Containers, Liquid Storage Tanks and Gas Holders once
  // the Hauler is unlocked (gases ride in its tube trailer).
  function truckSupplyBlock(e, body, section, row) {
    if (typeof DroneSystem === 'undefined') return;
    if (typeof Progression === 'undefined' || !Progression.isUnlocked(T.HAULER)) return;
    const k = e._truckSupply;
    let haulers = 0, inbound = 0;
    for (const trk of EntityRegistry.getByType(T.TRUCK)) {
      if (!trk._hauler) continue;
      haulers++;
      if (k && trk._cargoKind === k && (trk._cargoAmount || 0) > 0.5) inbound += trk._cargoAmount;
    }
    section(
      row('Truck Supply', k ? DroneSystem.cargoLabel(k) : 'Off', k ? 'good' : 'dim'),
      ...supplyBlockedRows(e, k, 'Haulers', row),
      ...(k ? [row('Haulers', haulers ? `${haulers} on the map` : 'None: place a Hauler to run this', haulers ? 'neutral' : 'bad'),
               row('On the road', inbound > 0 ? `${Math.round(inbound)} units aboard Haulers` : '—', inbound > 0 ? 'neutral' : 'dim'),
               row('Sources', 'Producers + unflagged storage, anywhere a road reaches', 'dim')] : []),
    );
    supplyPicker(e, body, 'truck', k, 'TRUCK', 'Haulers bring this resource in by road.',
                 { set: ['#2a70a0', '#0c1c2c', '#8cd0ff'], unset: ['#2a4860', 'transparent', '#70a8d0'] });
  }

  function buildContent() {
    if (!target || !target.def) return;
    const e = target;
    const body = document.getElementById('ep-body');
    const titleEl  = document.getElementById('ep-title');
    const statusEl = document.getElementById('ep-status');
    body.innerHTML = '';
    if (_switchListEl) _switchListEl.style.display = 'none';
    const _sb = document.getElementById('ep-scan-btns');
    if (_sb) _sb.style.display = 'none';
    const _ls = document.getElementById('ep-loan-section');
    if (_ls) _ls.style.display = 'none';

    // Weather repair button — show for any failed wire, and for any
    // building knocked out by a lightning strike (same button, different
    // cost source; see LightningDamageSystem.repairCost).
    const _repairBtn = document.getElementById('ep-repair-wire-btn');
    if (_repairBtn) {
      if (e._lightningDamaged && LightningDamageSystem.isRepairing(e)) {
        // Crew already dispatched — show progress instead of a second button.
        const _pct = Math.round(LightningDamageSystem.repairProgress(e) * 100);
        _repairBtn.style.display = 'block';
        _repairBtn.textContent = `🔧 Repairing: ${_pct}%`;
        _repairBtn.onclick = null;
        // A readout, not a control — leaving it styled as a live button is
        // why re-clicking it felt like the panel was ignoring input.
        _repairBtn.style.cursor      = 'default';
        _repairBtn.style.color       = '#e0a040';
        _repairBtn.style.borderColor = '#6a4a10';
      } else if (e._lightningDamaged && e._irreparable) {
        _repairBtn.style.display = 'none';
        _repairBtn.onclick = null;
      } else if (e._lightningDamaged) {
        const _lcost = LightningDamageSystem.repairCost(e);
        const _mins  = Math.max(1, Math.round(LightningDamageSystem.repairSeconds(e) / 60));
        _repairBtn.style.display = 'block';
        _repairBtn.style.cursor      = 'pointer';
        _repairBtn.style.color       = '#ff6030';
        _repairBtn.style.borderColor = '#804020';
        const _burn = LightningDamageSystem.genBurnLeft?.(e);
        _repairBtn.textContent = `${e._rebuildFrac > 0 ? '🏗 Rebuild' : '⚡ Repair'}: $${_lcost.toLocaleString()} · ~${_mins} min`
                               + (_burn != null ? ` · 🔥 explodes in ${Math.ceil(_burn)}s` : '');
        _repairBtn.onclick = () => {
          if (LightningDamageSystem.repair(e)) buildContent();
        };
      } else if (e._weatherFailed) {
        const _hasMonitor = hasActiveMonitor();
        const _base = Progression.isUnlocked(T.COALGENERATOR) ? 150 : 75;
        const _cost = _hasMonitor ? Math.round(_base*0.75) : _base;
        _repairBtn.style.display = 'block';
        _repairBtn.textContent = `⚡ Repair Wire: $${_cost}`;
        _repairBtn.onclick = () => {
          if (!Economy.canAfford(_cost)) { showToast('Not enough funds to repair', '#ff4040', '#140000', '#600000'); return; }
          Economy.spend(_cost);
          e._weatherFailed = false;
          e.failed = false;
          LightningDamageSystem.clearWireFire?.(e);
          PowerNetwork.recomputeWireHops();
          showToast('✅ Wire repaired', '#40c060', '#001408', '#0a4020');
          buildContent();
        };
      } else {
        _repairBtn.style.display = 'none';
        _repairBtn.onclick = null;
      }

      // "Repair all nearby" — a sibling of the single-repair button above,
      // created once on first need and then reused. A detonation puts a
      // whole block down at once, and the interesting decision is whether
      // the player can afford to put it back, not whether they can be
      // bothered to open a dozen panels.
      let _allBtn = document.getElementById('ep-repair-all-btn');
      if (!_allBtn && _repairBtn && _repairBtn.parentNode) {
        _allBtn = document.createElement('button');
        _allBtn.id = 'ep-repair-all-btn';
        _allBtn.className = _repairBtn.className;
        _allBtn.style.cssText = _repairBtn.style.cssText;
        _allBtn.style.marginTop = '5px';
        _repairBtn.parentNode.insertBefore(_allBtn, _repairBtn.nextSibling);
      }
      if (_allBtn) {
        // Read off the panel's CURRENT target each refresh, so the handler
        // can never act on a building the panel has since moved away from.
        const _near = e._lightningDamaged ? LightningDamageSystem.nearbyDamaged(e) : [];
        if (_near.length <= 1) {
          _allBtn.style.display = 'none';
          _allBtn.onclick = null;
        } else {
          const _sum = LightningDamageSystem.nearbyRepairCost(e);
          const _afford = Economy.canAfford(_sum);
          _allBtn.style.display = 'block';
          _allBtn.style.cursor  = 'pointer';
          _allBtn.style.color       = _afford ? '#e0a040' : '#8a6a3a';
          _allBtn.style.borderColor = _afford ? '#6a4a20' : '#4a3a20';
          _allBtn.textContent = `🔧 Repair all ${_near.length} nearby: $${_sum.toLocaleString()}`;
          _allBtn.onclick = () => {
            if (LightningDamageSystem.repairNearby(e) > 0) buildContent();
          };
        }
      }

      // Fusion Fuel Plant: switch fuel (D-T ↔ D-He3). Built on the same
      // persistent-button pattern.
      const _fusionBtn = (id, after) => {
        let b = document.getElementById(id);
        if (!b && _repairBtn.parentNode) {
          b = document.createElement('button');
          b.id = id;
          b.className = _repairBtn.className;
          b.style.cssText = _repairBtn.style.cssText;
          b.style.marginTop = '5px';
          _repairBtn.parentNode.insertBefore(b, (after || _repairBtn).nextSibling);
        }
        return b;
      };
      const _fuelModeBtn = _fusionBtn('ep-fuelmode-btn', _allBtn);
      const _isFFP = e.type === T.FUSIONFUELPLANT && !e._lightningDamaged;
      if (_fuelModeBtn) {
        // Since the split there's no fuel to choose: the plant makes D-T and,
        // once the separator is unlocked, D-He3 alongside it. Only a plant
        // from a pre-split save still on all-D-He3 gets a (one-way) switch.
        const _onSiteFFP = (typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite && ContractSystem.isAtSite())
          || (typeof ScenarioSystem !== 'undefined' && ScenarioSystem.active());   // demo: scenarios as well
        if (_isFFP && e._fuelMode === 'dhe3' && !_onSiteFFP) {
          _fuelModeBtn.style.display     = 'block';
          _fuelModeBtn.style.cursor      = 'pointer';
          _fuelModeBtn.style.color       = '#70f0ff';
          _fuelModeBtn.style.borderColor = '#206070';
          _fuelModeBtn.textContent = '⚛ Switch to split output (D-T + D-He3)';
          _fuelModeBtn.onclick = () => { FusionFuelPlantSystem.setFuelMode(e, 'dt'); buildContent(); };
        } else {
          _fuelModeBtn.style.display = 'none';
          _fuelModeBtn.onclick = null;
        }
      }    }

    const row = (label, value, cls='') => `
      <div class="ep-row">
        <span class="ep-label">${label}</span>
        <span class="ep-value ${cls}">${value}</span>
      </div>`;

    // A resource intake as "flowing / required", so the player always sees
    // how much the machine needs — even while the input is missing.
    const intake = (label, flowing, need, cls, unit = 'u/s') => {
      const n = +(+need).toFixed(3);
      return row(label, `${flowing ? n : 0} / ${n} ${unit}`, cls);
    };

    // What a fusion reactor's magnets take in liquid helium, and the Cryo
    // Plants that makes. Always shown, so the plants can be planned before the
    // reactor is lit. Field Cores boil off on the same line (tickMagnets).
    const cryoNeeded = (e, def) => {
      const need = def.heliumBoilOff + (typeof FieldCoreSystem !== 'undefined' ? FieldCoreSystem.boilOff(e) : 0);
      const rate = EntityDefs[T.CRYOPLANT].heliumPerSec || 3, plants = Math.ceil(need / rate);
      return row('LHe Needed', `${+need.toFixed(1)} u/s liquid helium (${plants} Cryo Plant${plants > 1 ? 's' : ''}, ${rate} u/s each)`, 'dim');
    };

    // What is waiting for an input in storage on its supply line: the
    // Storage Containers, Liquid Tanks and Gas Holders the IN stub's belt or
    // pipe reaches that hold `kinds`. The plants keep no input stock of their
    // own (they draw straight off the line each tick), so this is how much
    // of it they have to run on.
    const stored = (label, stub, ...kinds) => {
      if (!stub) return '';
      const gas = typeof GasStorageSystem !== 'undefined' ? GasStorageSystem : null;
      const solid = !['acid', 'water', 'oil', 'fuel'].includes(kinds[0]) && !(gas && gas.KINDS[kinds[0]]);
      const seen = new Set();
      let amt = 0;
      const add = (b) => {
        if (seen.has(b)) return;
        const v = b.type === T.SOLIDSTORAGE ? (kinds.includes(b._solidType) ? b._stored : 0)
                : b.type === T.OILSTORAGE  ? (kinds.includes(b._liquidType) ? b._crude : 0)
                : b.type === T.GASSTORAGE  ? (gas && kinds.includes(b._gasType) ? gas.stored(b) : 0) : 0;
        if (!(v > 0)) return;
        seen.add(b); amt += v;
      };
      try {
        if (solid) { const run = beltRun(stub.c, stub.r); for (let i = 0; i < run.n; i++) add(run.ent[i]); }
        else       { const run = pipeRun(stub.c, stub.r, kinds[0]); for (let i = 0; i < run.pn; i++) add(run.pe[i]); }
      } catch (_e) { return ''; }
      const n = seen.size;
      return row(label, n ? `${Math.floor(amt).toLocaleString()} u · ${n} ${n === 1 ? 'store' : 'stores'}` : 'none on line', amt >= 1 ? 'good' : 'dim');
    };

    const bar = (pct, color) => `
      <div class="ep-bar-wrap">
        <div class="ep-bar-fill" style="width:${Math.round(pct*100)}%;background:${color}"></div>
      </div>`;

    // Touching properties pass power to each other, so name the neighbours
    // a building is running off when it has no wire of its own.
    const viaRow = (e) => {
      if (!e.powered || typeof PowerNetwork === 'undefined' || !PowerNetwork.powerVia) return '';
      const via = PowerNetwork.powerVia(e);
      if (!via.length) return '';
      const name = (n) => n.businessName || (n.familyName ? `${n.familyName} home` : (n.def?.label || 'a building'));
      const names = via.slice(0, 2).map(name).join(', ') + (via.length > 2 ? ` +${via.length - 2}` : '');
      return row('Power via', names, 'warn');
    };

    const section = (...rows) => {
      const s = document.createElement('div');
      s.className = 'ep-section';
      s.innerHTML = rows.join('');
      body.appendChild(s);
    };

    // Blade ice from freezing fog (TurbineIcing), while there is any.
    const _windIceRows = (e) => {
      const ice = e._ice || 0, out = [];
      if (ice > 0.005 || e._iceStopped) {
        out.push(row('Blade Ice', e._iceStopped ? `${Math.round(ice*100)}%: stopped until it melts`
                                                : `${Math.round(ice*100)}%: output ×${TurbineIcing.outputMult(e).toFixed(2)}`,
                     e._iceStopped || ice > 0.4 ? 'bad' : ''));
      }
      if (e._iceHeating) out.push(row('Blade Heaters', 'On: -12% output, ice held off', ''));
      return out;
    };

    // Emissions and this plant's share of the carbon tax, for polluters whose
    // panels live here (the coal, fuel and refinery panels use PollutionSystem.panelRows).
    const _pollutionSection = (e) => {
      if (typeof PollutionSystem === 'undefined') return;
      const em = e._emission || 0, share = PollutionSystem.taxShare(e);
      section(
        row('Emissions', `${em.toFixed(1)} units${e._scrubber ? ' · scrubbed' : ''}`, em <= 0 ? 'dim' : em > 6 ? 'neutral' : 'good'),
        row('Carbon Tax Share', share > 0 ? `-$${share.toFixed(1)}/s` : 'None', share > 0 ? 'bad' : 'dim'),
        // Scrubbable plants get the same button, price and upkeep the
        // coal/fuel/refinery panels carry (PollutionSystem's delegated listener).
        PollutionSystem.scrubberHtml(e),
      );
    };

    // Cost plus the running rate, labelled by its sign. Several defs use
    // this codebase's "negative upkeep = income" idiom (see entity_defs.js),
    // and the panels rendered it literally — a Street Lamp that actually
    // earns $0.30/s displayed as "Upkeep  -$-0.3/s" in red, i.e. exactly
    // backwards. Returns both rows, so callers spread it into section().
    const costRows = (def) => {
      const earns = (def.upkeep || 0) < 0 || (def.income || 0) > 0;
      const rate  = earns ? (def.income || -def.upkeep) : (def.upkeep || 0);
      return [
        row('Cost', formatMoney(def.cost)),
        earns ? row('Income', `+$${rate}/s`, 'good')
              : row('Upkeep', `-$${rate}/s`, 'bad'),
      ];
    };

    // Generic header, overwritten by whichever branch below matches. Types
    // that normally open a specialised panel (Fuel Generator, Refinery,
    // Solar Panel, Dam, Research Station...) have no branch here, and they
    // land in this panel when a strike knocks them out — without this they
    // would inherit the title and status of whatever was inspected last.
    titleEl.textContent = e.businessName || e.def.label || 'Building';
    titleEl.style.color = '#c0d0e0';
    statusEl.textContent = e.powered ? 'POWERED' : 'OFFLINE';
    statusEl.className   = `ep-status ${e.powered ? 'good' : 'bad'}`;

    // ── Substation ───────────────────────────────────────────────
    if (e.type === T.SUBSTATION) {
      const pct      = e.def.capacity > 0 ? e.charge / e.def.capacity : 0;
      const powered  = e.powered;
      titleEl.textContent     = 'Substation MK1';
      titleEl.style.color     = '#60b0ff';
      const discharging = powered && !e.charging && e.charge > 0 && pct < 0.99;
      statusEl.textContent    = !powered ? 'OFFLINE' : pct > 0.99 ? 'STABLE' : e.charging ? 'CHARGING' : discharging ? 'DISCHARGING' : 'STANDBY';
      statusEl.className      = `ep-status ${!powered ? 'bad' : pct > 0.99 ? 'good' : e.charging ? 'good' : discharging ? 'warn' : 'neutral'}`;

      section(
        row('Charge',   `${formatWhPair(pct * EntityDefs[e.type].ratedKWh, EntityDefs[e.type].ratedKWh)}  (${Math.round(pct*100)}%)`, pct > 0.8 ? 'good' : pct > 0.3 ? '' : 'bad'),
        bar(pct, pct > 0.5 ? '#40a0ff' : '#f0a020'),
        row('Max Discharge', `${formatPower(e.def.maxOutput)}`),
      );
      section(row('Cost', formatMoney(e.def.cost)), row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'));
    }

    // ── Substation MK2 ───────────────────────────────────────────
    else if (e.type === T.SUBSTATION2) {
      const pct     = e.def.capacity > 0 ? e.charge / e.def.capacity : 0;
      const powered = e.powered;
      titleEl.textContent     = 'Substation MK2';
      titleEl.style.color     = '#80d0ff';
      const discharging = powered && !e.charging && e.charge > 0 && pct < 0.99;
      statusEl.textContent    = !powered ? 'OFFLINE' : pct > 0.99 ? 'STABLE' : e.charging ? 'CHARGING' : discharging ? 'DISCHARGING' : 'STANDBY';
      statusEl.className      = `ep-status ${!powered ? 'bad' : pct > 0.99 ? 'good' : e.charging ? 'good' : discharging ? 'warn' : 'neutral'}`;
      section(
        row('Charge',   `${formatWhPair(pct * EntityDefs[e.type].ratedKWh, EntityDefs[e.type].ratedKWh)}  (${Math.round(pct*100)}%)`, pct > 0.8 ? 'good' : pct > 0.3 ? '' : 'bad'),
        bar(pct, pct > 0.5 ? '#60c0ff' : '#f0a020'),
        row('Max Discharge', `${formatPower(e.def.maxOutput)}`),
      );
      section(row('Cost', formatMoney(e.def.cost)), row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'));
    }

    // ── Substation MK3 / MK4 / MK5 ───────────────────────────────
    else if (e.type === T.SUBSTATION3 || e.type === T.SUBSTATION4 || e.type === T.SUBSTATION5) {
      const pct     = e.def.capacity > 0 ? e.charge / e.def.capacity : 0;
      const powered = e.powered;
      titleEl.textContent     = e.def.label;
      titleEl.style.color     = e.type === T.SUBSTATION5 ? '#ffd890' : e.type === T.SUBSTATION4 ? '#c8b8ff' : '#a0e8ff';
      const discharging = powered && !e.charging && e.charge > 0 && pct < 0.99;
      statusEl.textContent    = !powered ? 'OFFLINE' : pct > 0.99 ? 'STABLE' : e.charging ? 'CHARGING' : discharging ? 'DISCHARGING' : 'STANDBY';
      statusEl.className      = `ep-status ${!powered ? 'bad' : pct > 0.99 ? 'good' : e.charging ? 'good' : discharging ? 'warn' : 'neutral'}`;
      section(
        row('Charge',   `${formatWhPair(pct * EntityDefs[e.type].ratedKWh, EntityDefs[e.type].ratedKWh)}  (${Math.round(pct*100)}%)`, pct > 0.8 ? 'good' : pct > 0.3 ? '' : 'bad'),
        bar(pct, pct > 0.5 ? '#80e0ff' : '#f0a020'),
        row('Max Discharge', `${formatPower(e.def.maxOutput)}`),
      );
      section(row('Cost', formatMoney(e.def.cost)), row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'));
    }

    // ── House ────────────────────────────────────────────────────
    else if (e.type === T.HOUSE) {
      const fee = e.dailyFee ?? e.def.income ?? 0;
      titleEl.textContent  = e.businessName || 'Residents';
      titleEl.style.color  = '#ffe080';
      statusEl.textContent = e.powered ? 'POWERED' : 'OFFLINE';
      statusEl.className   = `ep-status ${e.powered ? 'good' : 'bad'}`;

      const ds = e.demandScale || 1;
      const hHour = DayNight.hour();
      // Residential subtypes (townhouse/apartment/condo/school) have their own
      // curves — quoting the plain house curve here misreported every one of
      // them, most visibly the school, whose load peaks mid-morning rather
      // than in the evening.
      const hSub  = e.commercialSubtype || null;
      const hCur  = (DemandCurves.get(T.HOUSE, hSub, hHour) ?? 0) * ds;
      let hMin = Infinity, hPeak = 0;
      for (let h = 0; h < 24; h++) {
        const v = (DemandCurves.get(T.HOUSE, hSub, h) ?? 0) * ds;
        if (v < hMin) hMin = v;
        if (v > hPeak) hPeak = v;
      }
      section(
        row(hSub === 'school' ? 'Staff & pupils' : hSub === 'sheriff' ? 'Deputies & staff' : hSub === 'cornerstore' ? 'Owner & staff' : 'Residents',
            e._population ? `${e._population} people` : '—', 'good'),
        row('Now',        `${formatPower(hCur, 1)}`, e.powered ? '' : 'bad'),
        row('Min / Peak', `${formatPower(hMin, 1)} → ${formatPower(hPeak, 1)}`, 'dim'),
        row('Demand Tier', ds > 1.6 ? `×${ds.toFixed(2)} (luxury)` : ds > 1.2 ? `×${ds.toFixed(2)} (premium)` : ds > 0.9 ? `×${ds.toFixed(2)} (standard)` : `×${ds.toFixed(2)} (budget)`, ds > 1.6 ? 'bad' : ds > 1.2 ? 'warn' : 'dim'),
        row('Status',     e.powered ? 'Receiving power' : 'BLACKOUT', e.powered ? 'good' : 'bad'),
        viaRow(e),
        row('Reliability',  `${Math.round(e.reliability)}%`,
          e.reliability > 80 ? 'good' : e.reliability > 50 ? '' : 'bad'),
        row('Satisfaction', `${Math.round(e.satisfaction??80)}%`,
          (e.satisfaction??80) > 80 ? 'good' : (e.satisfaction??80) > 60 ? '' : 'bad'),
        row('View',         TerrainSystem.viewLabel(e), TerrainSystem.viewFor(e).pts ? 'good' : 'dim'),
        ...(typeof PollutionSystem !== 'undefined' ? (() => {
          const p = Math.round(PollutionSystem.exposureFor(e)), loc = Math.round(PollutionSystem.localExposureFor(e));
          return [row('Air Quality', p < 1 ? 'Clean' : `−${p} satisfaction cap (${loc} local smog, ${p - loc} city emissions)`, p < 1 ? 'good' : p > 25 ? 'bad' : '')];
        })() : []),
        ...(e._churnTimer > 0 ? [
          row('⚠ Churn Risk', `leaves in ${SatisfactionSystem.churnHoursLeft(e).toFixed(1)} game hours if it stays below 30%`, 'bad'),
          row('Unhappy with', SatisfactionSystem.causeText(e), 'bad'),
        ] : []),
      );
      const satFactor = (typeof SatisfactionSystem !== 'undefined' && SatisfactionSystem.factor) ? SatisfactionSystem.factor(e) : 1;
      // Read the live economy curve rather than a local copy of it — the
      // two had drifted out of sync and the panel was quoting a loss the
      // game wasn't actually applying.
      const houseBlackoutPct = Economy.outagePayPct(e.blackoutSeconds);
      const effFee = e.powered ? fee * ((e.reliability ?? 100)/100) * satFactor : fee * (houseBlackoutPct/100);
      section(
        row('Revenue',  `${formatMoney(effFee)}/s`, e.powered ? 'good' : 'warn'),
        row('',         e.powered ? `(reliability × satisfaction)` : `(${Math.round(houseBlackoutPct)}%: outage pay, falling)`, 'dim'),
      );
      section(
        row('Connection', e.powered ? 'Wire network' : 'No wire connection', e.powered ? 'good' : 'bad'),
      );
    }

    // ── Lightning Rod ────────────────────────────────────────────
    else if (e.type === T.LIGHTNINGROD || e.type === T.LIGHTNINGROD2 || e.type === T.LIGHTNINGROD3) {
      const covered = [];
      for (const _c of EntityRegistry.all()) {
        if (!LightningDamageSystem.isStrikeable(_c)) continue;
        if (LightningDamageSystem.rodsCovering(_c).some(r => r.rod === e)) covered.push(_c);
      }
      // How much this rod's own coverage area actually benefits — the
      // headline number depends on how many OTHER rods overlap, so quote
      // the best protection any covered building currently enjoys.
      let bestProt = 0;
      for (const _c of covered) bestProt = Math.max(bestProt, LightningDamageSystem.protectionAt(_c));

      const surge   = LightningDamageSystem.surgeWatts(e);
      const surging = surge > 0.05;

      titleEl.textContent  = e.def.label;
      titleEl.style.color  = '#a0d0ff';
      statusEl.textContent = surging ? 'DISCHARGING' : 'GROUNDED';
      statusEl.className   = `ep-status ${surging ? 'good' : 'neutral'}`;
      // Always a live 0-to-surgeMax meter, empty at rest. The "/ 18 kW"
      // carries the scale, so the gauge needs no prose explaining it —
      // same convention as the Substation's charge readout above.
      section(
        row('Surge Output', `${surge.toFixed(1)} / ${formatPower(e.def.surgeMax)}`, surging ? 'good' : 'dim'),
        bar(surge / e.def.surgeMax, '#60c0ff'),
      );
      section(
        row('Coverage',   `${e.def.protectRange} tile radius`),
        // "structures", not "buildings" — the set this rod actually shields
        // includes Power Towers, Substations, Batteries, Street Lamps and
        // Cameras alongside houses and plants. Poles, wires and trees are
        // absent on purpose: lightning can't single them out, so a rod does
        // nothing for them and listing them would overstate its coverage.
        row('Protecting', `${covered.length} structure${covered.length === 1 ? '' : 's'}`, covered.length ? 'good' : 'warn'),
        row('Strike Odds', bestProt > 0 ? `−${Math.round(bestProt * 100)}% in range` : '—', 'good'),
        row('', 'Overlap rods to stack protection', 'dim'),
      );
      section(
        row('Strikes Taken', `${e._strikesAbsorbed || 0}`, (e._strikesAbsorbed || 0) > 0 ? 'good' : 'dim'),
        row('', 'Rods are never damaged by strikes', 'dim'),
        // Adjacency, NOT e.powered — a rod wired into a network that happens
        // to be in deficit is still wired, and reporting "not wired" there
        // would send the player off to fix a connection that already exists.
        row('Grid Link', _rodWired(e) ? 'Wired: surge reaches the grid' : 'Not wired: surge is wasted',
            _rodWired(e) ? 'good' : 'warn'),
      );
      section(row('Cost', formatMoney(e.def.cost)), row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'));
    }

    // ── Security Camera ──────────────────────────────────────────
    else if (e.type === T.CAMERA) {
      titleEl.textContent  = 'Security Camera';
      titleEl.style.color  = '#8080ff';
      statusEl.textContent = e.powered ? 'ACTIVE' : 'OFFLINE';
      statusEl.className   = `ep-status ${e.powered ? 'good' : 'bad'}`;
      section(
        row('Power Draw',    `${formatPower(e.def.powerInput)}`),
        row('Coverage',      `${e.def.amenityRange} tile radius`),
        row('Satisfaction',  `+${e.def.satisfBoost} pts to customers in range`, 'good'),
      );
      section(...costRows(e.def));
    }
    // ── EV Charger ────────────────────────────────────────────────
    else if (e.type === T.EVCHARGER) {
      titleEl.textContent  = 'EV Charging Station';
      titleEl.style.color  = '#40ff80';
      statusEl.textContent = e.powered ? 'READY' : 'OFFLINE';
      statusEl.className   = `ep-status ${e.powered ? 'good' : 'bad'}`;
      section(
        row('Power Draw',    `${formatPower(e.def.powerInput)}`),
        row('Coverage',      `${e.def.amenityRange} tile radius`),
        row('Satisfaction',  `+${e.def.satisfBoost} pts to customers in range`, 'good'),
        viaRow(e),
      );
      section(row('Cost', formatMoney(e.def.cost)), row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'));
    }
    // ── Street Lamp ──────────────────────────────────────────────
    else if (e.type === T.LAMP) {
      titleEl.textContent  = 'Street Lamp';
      titleEl.style.color  = '#ffe090';
      statusEl.textContent = e.powered ? 'ON' : 'OFF';
      statusEl.className   = `ep-status ${e.powered ? 'good' : 'bad'}`;
      section(
        row('Power Draw',   `${formatPower(e.def.powerInput)}`),
        row('Coverage',     `${e.def.amenityRange} tile radius`),
        row('Satisfaction', `+${e.def.satisfBoost} pts to customers in range`, 'good'),
        row('Status',       e.powered ? 'On' : 'Offline: no effect', e.powered ? 'good' : 'bad'),
      );
      section(...costRows(e.def));
    }

    // ── Surge Protector ─────────────────────────────────────────────
    else if (e.type === T.PROTECTOR) {
      // Count powered protectors on this network
      // Counts come straight off PowerNetwork's per-tier tally rather than a
      // ROWS×COLS rescan here — same numbers the capacity math uses, so the
      // readout can't disagree with the wires.
      const info     = _protection(e.networkId, 'mk1');
      const netProtectors = info.count;
      const baseThr  = EntityDefs[T.WIRE].throughput;
      const effThr   = info.networkCap;
      const netLoad  = (e.networkId >= 0 ? (PowerNetwork.getNetworkDemand?.(e.networkId) || 0) : 0);
      const pct      = Math.min(1, netLoad / effThr);
      titleEl.textContent  = 'Surge Protector';
      titleEl.style.color  = '#40e0ff';
      statusEl.textContent = e.networkId >= 0 ? 'ACTIVE' : 'ISOLATED';
      statusEl.className   = `ep-status ${e.networkId >= 0 ? 'good' : 'neutral'}`;
      section(
        ..._strandedRow(e),
        row('Network Load',       `${formatPower(netLoad, 1)}`, pct > 0.85 ? 'bad' : pct > 0.5 ? 'warn' : 'good'),
        bar(pct, pct > 0.85 ? '#ff4040' : pct > 0.5 ? '#ffe040' : '#40e0ff'),
        row('Wire Threshold',     `${formatPower(effThr, 0)} (base ${formatPower(baseThr)}, +${formatPower(info.capPerUnit, 0)} per MK1)`),
        row('Protectors on net',  `${netProtectors}`, netProtectors > 0 ? 'good' : 'dim'),
        ..._marginRows(info),
        row('Storm Fault Risk',   _faultRiskLabel(e.networkId), 'good'),
        row('Power Draw',         `${formatPower(e.def.powerInput)}`),
        row('Status',             e._noConductor ? 'Isolated \u2014 no wires to raise' : 'Boosting network capacity', e._noConductor ? 'bad' : 'good'),
      );
      section(row('Cost', formatMoney(e.def.cost)), row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'));
    }

    // ── Throttle Governor ───────────────────────────────────────
    else if (e.type === T.GOVERNOR) {
      const gens   = GovernorSystem.generatorsFor(e);
      const active = GovernorSystem.isActive(e);
      titleEl.textContent  = 'Throttle Governor';
      titleEl.style.color  = '#ffb040';
      statusEl.textContent = !gens.length ? 'IDLE' : active ? 'ACTIVE' : 'UNPOWERED';
      statusEl.className   = `ep-status ${!gens.length ? 'neutral' : active ? 'good' : 'bad'}`;
      const gd = EntityDefs[T.GOVERNOR];
      section(
        row('Function', 'Eases Overdrive back before a generator melts down', 'dim'),
        row('Attached', gens.length ? `${gens.length} generator${gens.length > 1 ? 's' : ''}` : 'None: place touching a Fuel or Coal Generator', gens.length ? 'good' : 'bad'),
        ...gens.map(g => {
          const isFuel = g.type === T.FUELGEN;
          const name   = (isFuel ? 'Fuel Generator' : 'Coal Generator') + (g._num !== undefined ? ` #${g._num}` : '');
          const key    = isFuel ? g._fgThrottle : g._cgThrottle;
          const level  = Math.round((isFuel ? (g._fgHeat || 0) : (g._cgPressure || 0)) * 100);
          const trim   = g._govTrim || 0;
          const txt    = !active ? `Unprotected · ${level}% ${isFuel ? 'heat' : 'pressure'}`
                       : key !== 'overdrive' ? `Standby (${(key || 'normal').toUpperCase()})`
                       : trim > 0.02 ? `Trimming ${Math.round(trim * 100)}% · ${level}%`
                       : `Holding Overdrive · ${level}%`;
          return row(name, txt, !active ? 'bad' : trim > 0.02 ? 'neutral' : 'good');
        }),
        row('Trim band', `${Math.round(gd.trimStart * 100)}–${Math.round(gd.trimLimit * 100)}% heat / pressure`),
        row('Power Draw', `${formatPower(gd.powerInput)}`, active ? 'neutral' : 'bad'),
      );
      section(row('Cost', formatMoney(gd.cost)), row('Upkeep', `-$${gd.upkeep}/s`, 'bad'));
    }

    // ── Carbon Capture Plant ────────────────────────────────────
    else if (e.type === T.CARBONCAPTURE) {
      const cd = EntityDefs[T.CARBONCAPTURE];
      const live = !!e._capturing;
      titleEl.textContent  = 'Carbon Capture Plant';
      titleEl.style.color  = '#50e0a0';
      statusEl.textContent = live ? 'CAPTURING' : e.powered ? 'IDLE' : 'UNPOWERED';
      statusEl.className   = `ep-status ${live ? 'good' : 'bad'}`;
      const local = PollutionSystem.concAt(e.col + e.width / 2, e.row + e.height / 2);
      const gross = PollutionSystem.grossEmissions(), off = PollutionSystem.captureOffset();
      section(
        row('Function', `Captures ${Math.round(PollutionSystem.CAPTURE_SHARE * 100)}% of the emissions of every polluting plant within ${PollutionSystem.CAPTURE_RADIUS_TILES} tiles, and pulls smog from the air there. Overlapping plants stack.`, 'dim'),
        (() => {
          const cs = PollutionSystem.captureStats(e);
          return row('In range', !live ? 'Not capturing' : cs.plants ? `${cs.plants} plant${cs.plants === 1 ? '' : 's'} · ${cs.units.toFixed(1)} units captured` : 'No running polluters in range',
            live && cs.units > 0.05 ? 'good' : live ? 'dim' : 'bad');
        })(),
        row('Smog here', local < 1 ? 'Clear' : `${Math.round(local)}`, local > 30 ? 'bad' : local > 8 ? '' : 'good'),
        row('City emissions', `${gross.toFixed(1)} − ${off.toFixed(1)} captured = ${PollutionSystem.emissions().toFixed(1)} / ${PollutionSystem.ALLOWANCE}`, PollutionSystem.overAllowance() > 0 ? 'bad' : 'good'),
        row('Carbon tax now', PollutionSystem.carbonTax() > 0 ? `-$${PollutionSystem.carbonTax().toFixed(1)}/s` : 'None', PollutionSystem.carbonTax() > 0 ? 'bad' : 'good'),
        (() => {
          const saved = PollutionSystem.captureSaving(e);
          return row('Tax saved by this plant',
            saved > 0.05 ? `+$${saved.toFixed(1)}/s` : !live ? 'None while not capturing' : 'None: the city is under its allowance without it',
            saved > 0.05 ? 'good' : live ? 'dim' : 'bad');
        })(),
        row('CO₂ captured (all plants)', `${Math.floor(PollutionSystem.capturedTonnes()).toLocaleString('en-US')} t`, 'good'),
        row('Power Draw', `${formatPower(cd.powerInput)}`, live ? 'neutral' : 'bad'),
      );
      section(row('Cost', formatMoney(cd.cost)), row('Upkeep', `-$${cd.upkeep}/s`, 'bad'));
    }

    // ── Surge Protector MK2 ─────────────────────────────────────
    else if (e.type === T.PROTECTOR2) {
      const netLoad = e.networkId >= 0 ? (PowerNetwork.getNetworkDemand?.(e.networkId) || 0) : 0;
      const info    = _protection(e.networkId, 'mk2');
      const effThr  = e._effectiveThreshold || info.networkCap;
      const pct     = Math.min(1, netLoad / effThr);
      const netMK2  = info.count;
      titleEl.textContent  = 'Surge Protector MK2';
      titleEl.style.color  = '#00ffcc';
      statusEl.textContent = e.networkId >= 0 ? 'ACTIVE' : 'ISOLATED';
      statusEl.className   = `ep-status ${e.networkId >= 0 ? 'good' : 'neutral'}`;
      section(
        ..._strandedRow(e),
        row('Network Load',   `${formatPower(netLoad, 1)}`, pct > 0.85 ? 'bad' : pct > 0.5 ? 'warn' : 'good'),
        bar(pct, pct > 0.85 ? '#ff4040' : pct > 0.5 ? '#ffe040' : '#00ffcc'),
        row('Wire Threshold', `${formatPower(effThr, 0)} (base 85 kW, +${formatPower(info.capPerUnit, 0)} per MK2)`, 'good'),
        row('MK2 on network', `${netMK2}`, netMK2 > 0 ? 'good' : 'dim'),
        ..._marginRows(info),
        row('Storm Fault Risk', _faultRiskLabel(e.networkId), 'good'),
        row('Status',         e._noConductor ? 'Isolated \u2014 no wires to raise' : 'Boosting network wire capacity', e._noConductor ? 'bad' : 'good'),
      );
      section(row('Cost', formatMoney(e.def.cost)), row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'));
    }

    // ── Surge Protector MK3 ────────────────────────────
    else if (e.type === T.PROTECTOR3) {
      const netLoad = e.networkId >= 0 ? (PowerNetwork.getNetworkDemand?.(e.networkId) || 0) : 0;
      const info    = _protection(e.networkId, 'mk3');
      const effThr  = e._effectiveThreshold || info.networkCap;
      const pct     = Math.min(1, netLoad / effThr);
      const netMK3  = info.count;
      // Unlike MK1/MK2 this one draws power, so an unpowered bay is a real
      // state worth calling out rather than a detail buried in the rows.
      const live    = e.networkId >= 0 && e.powered;
      titleEl.textContent  = 'Surge Protector MK3';
      titleEl.style.color  = '#b070ff';
      statusEl.textContent = e.networkId < 0 ? 'ISOLATED' : e.powered ? 'ACTIVE' : 'UNPOWERED';
      statusEl.className   = `ep-status ${live ? 'good' : e.networkId < 0 ? 'neutral' : 'bad'}`;
      section(
        ..._strandedRow(e),
        row('Network Load',   `${formatPower(netLoad, 1)}`, pct > 0.85 ? 'bad' : pct > 0.5 ? 'warn' : 'good'),
        bar(pct, pct > 0.85 ? '#ff4040' : pct > 0.5 ? '#ffe040' : '#b070ff'),
        row('Wire Threshold', `${formatPower(effThr, 0)} (base 85 kW, +${formatPower(info.capPerUnit, 0)} per MK3)`, 'good'),
        row('MK3 on network', `${netMK3}`, netMK3 > 0 ? 'good' : 'dim'),
        ..._marginRows(info),
        row('Storm Fault Risk', _faultRiskLabel(e.networkId), 'good'),
        row('Power Draw',     `${formatPower(e.def.powerInput)}`, e.powered ? 'neutral' : 'bad'),
        row('Status',         e.networkId < 0 ? 'Not connected' : e.powered ? 'Boosting network wire capacity' : 'No power: arrester bay offline', live ? 'good' : 'dim'),
      );
      section(row('Cost', formatMoney(e.def.cost)), row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'));
    }

    // ── Wire ─────────────────────────────────────────────────────
    // Which network a wire belongs to is otherwise invisible. The id shown
    // is the same component index the hover highlight groups on (see
    // render_main_loop), so the number here always names the run that
    // lights up — but it is a per-tick index, not a persistent name, and
    // renumbers as the grid changes. The membership counts beside it are
    // what actually let the player tell two networks apart.
    //
    // A wire that doesn't conduct (out of range, or burned out) is rejected
    // as a neighbour by canConnect and so floods into a component of its
    // own — it still carries a networkId, but reporting that as "the
    // network it's on" would be nonsense, since each dead wire in a run
    // would name a different one. Those cases report no network and say
    // why instead.
    else if (e.type === T.WIRE) {
      const net   = e.networkId;
      const dead  = e.outOfRange || e.failed;
      const live  = net >= 0 && !dead;
      let wires = 0, poles = 0, buildings = 0;
      if (live) {
        for (const o of EntityRegistry.all()) {
          if (o.networkId !== net) continue;
          if      (o.type === T.WIRE) wires++;
          else if (o.type === T.POLE) poles++;
          else                        buildings++;
        }
      }
      const cap  = e._effectiveThreshold || EntityDefs[T.WIRE].throughput;
      const load = e.load || 0;
      const pct  = cap > 0 ? Math.min(1, load / cap) : 0;
      const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
      titleEl.textContent  = 'Wire';
      titleEl.style.color  = '#00d4ff';
      statusEl.textContent = e._weatherFailed ? 'STORM DAMAGE'
                           : e.failed         ? 'BURNED OUT'
                           : e.outOfRange     ? 'OUT OF RANGE'
                           : net < 0          ? 'ISOLATED'
                           : e.powered        ? 'LIVE' : 'NO POWER';
      statusEl.className   = `ep-status ${live && e.powered ? 'good' : dead ? 'bad' : 'neutral'}`;
      const netValue = live ? `#${net}`   // same numbering as the Wire Inspector's NET #n
                     : e._weatherFailed ? 'None: storm damage has opened this run'
                     : e.failed         ? 'None: burned out, the circuit is open'
                     : e.outOfRange     ? `None: over ${PowerNetwork.getWireHops()} tiles from an anchor`
                     :                    'None: nothing connected to carry power';
      section(
        row('Network', netValue, live ? 'good' : 'bad'),
        ...(live ? [
          row('On This Network',
              `${plural(wires, 'wire')} · ${plural(poles, 'pole')} · ${plural(buildings, 'building')}`, 'dim'),
          row('Network Load', `${load.toFixed(1)} / ${formatPower(cap, 0)}`,
              pct >= 0.8 ? 'bad' : pct > 0.5 ? 'warn' : 'good'),   // 0.8: where spans start burning out, and the cable turns orange
          bar(pct, pct >= 0.8 ? '#ff4040' : pct > 0.5 ? '#ffe040' : '#00d4ff'),
          row('Storm Fault Risk', _faultRiskLabel(net), 'good'),
          row('Carrying', e.powered ? 'Live current' : 'Nothing: network has no supply',
              e.powered ? 'good' : 'bad'),
        ] : []),
        ...(e._underPipe  ? [row('Placement', 'Run beneath a pipe', 'dim')] : []),
        ...(e._underWater ? [row('Placement', 'Strung across water', 'dim')] : []),
      );
      section(
        row('Cost',   `${formatMoney(EntityDefs[T.WIRE].cost)} per tile`),
        row('Upkeep', `-$${EntityDefs[T.WIRE].upkeep}/s`, 'bad'),
      );
      if (live && typeof GridAnalyzer !== 'undefined') body.appendChild(GridAnalyzer.buttonFor(net));
    }

    // ── Power Pole ───────────────────────────────────────────────
    else if (e.type === T.POLE) {
      const hops = PowerNetwork.getWireHops();
      titleEl.textContent  = 'Power Pole';
      titleEl.style.color  = '#60c060';
      statusEl.textContent = e.powered ? 'ACTIVE' : 'ISOLATED';
      statusEl.className   = `ep-status ${e.powered ? 'good' : 'neutral'}`;
      section(
        row('Function',   'Wire range relay'),
        row('Extends By', `${hops} tiles`),
        row('Status',     e.powered ? 'Carrying power' : 'Not connected', e.powered ? 'good' : 'dim'),
      );
      section(row('Cost', formatMoney(e.def.cost)), row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'));
      if (e.networkId >= 0 && typeof GridAnalyzer !== 'undefined') body.appendChild(GridAnalyzer.buttonFor(e.networkId));
    }

    // ── Solar MK2 ────────────────────────────────────────────────
    else if (e.type === T.SOLAR2) {
      const lvl = e.def.peakOutput > 0 ? e.def.powerOutput / e.def.peakOutput : 0;
      titleEl.textContent  = 'Solar Panel MK2';
      titleEl.style.color  = '#40c8ff';
      statusEl.textContent = lvl > 0.05 ? 'GENERATING' : 'OFFLINE';
      statusEl.className   = `ep-status ${lvl > 0.05 ? 'good' : 'bad'}`;
      section(
        row('Output',     `${formatPower(e.def.powerOutput, 2)}`, lvl > 0.05 ? 'hi' : 'dim'),
        bar(lvl, '#40c8ff'),
        row('Peak',         `${formatPower(e.def.peakOutput)} at noon`),
        row('Cloud cover',   `${Math.round((1-CloudState.factor)*100)}%: ×${CloudState.factor.toFixed(2)}`, CloudState.factor > 0.85 ? '' : 'bad'),
        row('Smog haze',     `×${(e.smogFactor ?? 1).toFixed(2)}`, (e.smogFactor ?? 1) < 0.9 ? 'bad' : (e.smogFactor ?? 1) < 0.99 ? '' : 'good'),
        row('Dust / ash',  (e.dust || 0) > 0.01 ? `${Math.round(e.dust*100)}%: ×${(e.dustFactor ?? 1).toFixed(2)} (rain washes it off)` : 'Clean', (e.dust || 0) > 0.3 ? 'bad' : (e.dust || 0) > 0.01 ? '' : 'good'),
        row('Row shading', `×${(e.shadeFactor ?? 1).toFixed(2)}${(e.shadeFactor ?? 1) < 0.99 ? ' (shaded by panels to the south)' : ''}`, (e.shadeFactor ?? 1) < 0.8 ? 'bad' : (e.shadeFactor ?? 1) < 0.99 ? '' : 'good'),
        row('Panel wear',     `${Math.round((e.wear||0)*100)}%: ×${(e.wearFactor||1).toFixed(2)}`, (e.wear||0) > 0.5 ? 'bad' : (e.wear||0) > 0.2 ? '' : 'good'),
        row('Upkeep',         `-$${e.def.upkeep}/s`, 'bad'),
      );
    }
    // ── Solar Array ──────────────────────────────────────────
    else if (e.type === T.SOLAR3) {
      const d     = e.def;
      const lvl   = d.peakOutput > 0 ? d.powerOutput / d.peakOutput : 0;
      const salt  = e._saltKWh || 0, flow = e._saltFlow || 0;
      const sPct  = d.saltCapacity > 0 ? salt / d.saltCapacity : 0;
      const onSalt = flow < -0.5;
      titleEl.textContent  = 'Solar Array';
      titleEl.style.color  = '#ffb040';
      statusEl.textContent = onSalt ? 'ON STORED HEAT' : lvl > 0.05 ? 'GENERATING' : 'OFFLINE';
      statusEl.className   = `ep-status ${onSalt ? 'warn' : lvl > 0.05 ? 'good' : 'bad'}`;
      section(
        row('Output',      `${formatPower(d.powerOutput, 2)}`, lvl > 0.05 ? 'hi' : 'dim'),
        bar(lvl, '#ffb040'),
        row('Peak',        `${formatPower(d.peakOutput)} in full sun`),
        row('Sun tracking', e.trackingGain > 1.01 ? `×${e.trackingGain.toFixed(2)} vs a fixed panel` : 'Facing the sun', e.trackingGain > 1.01 ? 'good' : ''),
        row('Cloud cover', `${Math.round((1-CloudState.factor)*100)}%: ×${CloudState.factor.toFixed(2)}`, CloudState.factor > 0.85 ? '' : 'bad'),
        row('Smog haze',   `×${(e.smogFactor ?? 1).toFixed(2)}`, (e.smogFactor ?? 1) < 0.9 ? 'bad' : (e.smogFactor ?? 1) < 0.99 ? '' : 'good'),
        row('Dust / ash',  (e.dust || 0) > 0.01 ? `${Math.round(e.dust*100)}%: ×${(e.dustFactor ?? 1).toFixed(2)} (rain washes it off)` : 'Clean', (e.dust || 0) > 0.3 ? 'bad' : (e.dust || 0) > 0.01 ? '' : 'good'),
        row('Row shading', 'None: built to be tiled', 'good'),
      );
      section(
        row('Salt tank',   `${formatWhPair(salt, d.saltCapacity)}  (${Math.round(sPct*100)}%)`, sPct > 0.5 ? 'good' : sPct > 0.15 ? '' : 'bad'),
        bar(sPct, '#ff7a20'),
        row('Tank',        flow > 0.5 ? `Charging: ${formatPower(flow, 1)} diverted`
                         : onSalt     ? `Discharging: +${formatPower(-flow, 1)}`
                         : sPct > 0.99 ? 'Full: whole harvest to the grid'
                         : 'Idle', flow > 0.5 ? 'good' : onSalt ? 'warn' : 'dim'),
        row('Night floor', `Holds up to ${formatPower(d.saltRate)} after sunset`, 'dim'),
      );
      section(
        row('Wash robots', e._washing ? `Running: -${formatPower(d.washerDraw)}` : 'Parked: no power to run', e._washing ? 'good' : 'warn'),
        row('Panel wear',  `${Math.round((e.wear||0)*100)}%: ×${(e.wearFactor||1).toFixed(2)}`, (e.wear||0) > 0.5 ? 'bad' : (e.wear||0) > 0.2 ? '' : 'good'),
        row('Upkeep',      `-$${d.upkeep}/s`, 'bad'),
      );
    }
    // ── Wind Turbine ─────────────────────────────────────────────
    else if (e.type === T.WIND) {
      titleEl.textContent  = 'Wind Turbine';
      titleEl.style.color  = '#80ffb0';
      statusEl.textContent = e._iceStopped ? 'ICED' : e.powered ? 'ACTIVE' : 'ISOLATED';
      statusEl.className   = `ep-status ${e._iceStopped ? 'bad' : e.powered ? 'good' : 'neutral'}`;
      section(
        row('Output',     `${formatPower(e.def.powerOutput, 2)}`, 'good'),
        ..._windIceRows(e),
        bar(WindState.speed, '#80ffb0'),
        row('Wind Speed', `${Math.round(WindState.speed*100)}%`),
        row('Range',      `${e.def.baseOutput}–${formatPower(e.def.maxOutput)} (variable)`),
        row('Speed',      `${Math.round(WindState.speed*100)}%`, WindState.speed < 0.2 ? 'bad' : WindState.speed > 0.7 ? 'good' : ''),
        row('Terrain',    `${TerrainSystem.siteLabel(e)}: ×${(e._terrainWind || 1).toFixed(2)}`, (e._terrainWind || 1) >= 1.1 ? 'good' : (e._terrainWind || 1) < 0.95 ? 'bad' : ''),
        row('Upkeep',     `-$${e.def.upkeep}/s`, 'bad'),
      );
    }
    // ── Wind Turbine MK2 ─────────────────────────────────────────
    else if (e.type === T.WIND2) {
      titleEl.textContent  = 'Wind Turbine MK2';
      titleEl.style.color  = '#60d8ff';
      statusEl.textContent = e._iceStopped ? 'ICED' : e.powered ? 'ACTIVE' : 'ISOLATED';
      statusEl.className   = `ep-status ${e._iceStopped ? 'bad' : e.powered ? 'good' : 'neutral'}`;
      section(
        row('Output',     `${formatPower(e.def.powerOutput, 2)}`, 'good'),
        ..._windIceRows(e),
        bar(WindState.speed, '#60d8ff'),
        row('Wind Speed', `${Math.round(WindState.speed*100)}%`),
        row('Range',      `${e.def.baseOutput}–${formatPower(e.def.maxOutput)} (variable)`),
        row('Speed',      `${Math.round(WindState.speed*100)}%`, WindState.speed < 0.2 ? 'bad' : WindState.speed > 0.7 ? 'good' : ''),
        row('Terrain',    `${TerrainSystem.siteLabel(e)}: ×${(e._terrainWind || 1).toFixed(2)}`, (e._terrainWind || 1) >= 1.1 ? 'good' : (e._terrainWind || 1) < 0.95 ? 'bad' : ''),
        row('Upkeep',     `-$${e.def.upkeep}/s`, 'bad'),
      );
    }
    // ── Wind Turbine MK3 ─────────────────────────────────────────
    else if (e.type === T.WIND3) {
      titleEl.textContent  = 'Wind Turbine MK3';
      titleEl.style.color  = '#48e0ff';
      statusEl.textContent = e._iceStopped ? 'ICED' : e.powered ? 'ACTIVE' : 'ISOLATED';
      statusEl.className   = `ep-status ${e._iceStopped ? 'bad' : e.powered ? 'good' : 'neutral'}`;
      section(
        row('Output',     `${formatPower(e.def.powerOutput, 2)}`, 'good'),
        ..._windIceRows(e),
        bar(WindState.speed, '#48e0ff'),
        row('Wind Speed', `${Math.round(WindState.speed*100)}%`, WindState.speed < 0.2 ? 'bad' : WindState.speed > 0.7 ? 'good' : ''),
        row('Range',      `${e.def.baseOutput}–${formatPower(e.def.maxOutput)} (variable)`),
        row('Terrain',    `${TerrainSystem.siteLabel(e)}: ×${(e._terrainWind || 1).toFixed(2)}`, (e._terrainWind || 1) >= 1.1 ? 'good' : (e._terrainWind || 1) < 0.95 ? 'bad' : ''),
        row('Upkeep',     `-$${e.def.upkeep}/s`, 'bad'),
      );
    }
    // ── Battery Block ─────────────────────────────────────────────
    else if (e.type === T.BATTERY) {
      const pct = e.def.capacity > 0 ? (e.charge||0)/e.def.capacity : 0;
      titleEl.textContent  = 'Battery Block';
      titleEl.style.color  = '#a0ff60';
      const batDischarging = e.powered && !e.charging && (e.charge||0) > 0 && pct < 0.99;
      statusEl.textContent = !e.powered ? 'ISOLATED' : e.charging ? 'CHARGING' : batDischarging ? 'DISCHARGING' : pct > 0.99 ? 'FULL' : 'STANDBY';
      statusEl.className   = `ep-status ${!e.powered ? 'bad' : e.charging ? 'good' : batDischarging ? 'warn' : pct > 0.99 ? 'good' : 'neutral'}`;
      section(
        row('Charge',     `${formatWhPair(pct * EntityDefs[e.type].ratedKWh, EntityDefs[e.type].ratedKWh)}  (${Math.round(pct*100)}%)`, pct > 0.5 ? 'good' : pct > 0.2 ? '' : 'bad'),
        bar(pct, '#a0ff60'),
        row('Max Discharge', `${formatPower(e.def.maxOutput)}`),
        row('Upkeep',     `-$${e.def.upkeep}/s`, 'bad'),
      );
    }
    // ── Industrial ───────────────────────────────────────────────
    else if (e.type === T.INDUSTRIAL) {
      const fee = e.dailyFee ?? 0;
      const iHour = DayNight.hour();
      // Read the exact value power_network.js actually fed into the grid
      // this tick (e._liveDemand) instead of recomputing separately — the
      // old recompute here called DemandCurves.get(T.COMMERCIAL, ...),
      // which silently fell back to the generic commercial day/night curve
      // for every industrial subtype (none of them have a dedicated entry),
      // showing numbers unrelated to the building's actual min/peak spec.
      const iCur = e._liveDemand ?? (e.peakDraw != null
        ? (e.minDraw != null ? (e.minDraw + e.peakDraw) / 2 : (iHour >= 7 && iHour < 19 ? e.peakDraw : (e.idleDraw || 0)))
        : (e.def.powerInput || 30));
      let iMin = Infinity, iPeak = 0;
      for (let h = 0; h < 24; h++) {
        const v = e.commercialSubtype
          ? DemandCurves.resolve(T.COMMERCIAL, e.commercialSubtype, h)
          : (e.def.powerInput || 30);
        if (v < iMin) iMin = v;
        if (v > iPeak) iPeak = v;
      }
      // Fall back to pool minDraw/peakDraw for flat-curve types
      if (iMin === iPeak && e.minDraw != null) iMin = e.minDraw;
      if (e.peakDraw != null) iPeak = e.peakDraw;
      // Authoritative pool override for entities placed before minDraw/peakDraw
      // were copied to the entity itself (or whose curve range disagrees).
      {
        const _pool = HouseRequestSystem.lookupPoolEntry?.(e.businessName);
        if (_pool) {
          if (_pool.minDraw  != null) iMin  = _pool.minDraw;
          if (_pool.peakDraw != null) iPeak = _pool.peakDraw;
        }
        // Daytime-only pool types (peak, no minDraw) bottom out at their
        // overnight idle draw — not the generic commercial curve's minimum.
        const _min = _pool?.minDraw ?? e.minDraw;
        const _pk  = _pool?.peakDraw ?? e.peakDraw;
        if (_min == null && _pk != null) iMin = _pool?.idleDraw ?? e.idleDraw ?? 0;
      }
      // Spike-driven industrial types (Recycling Plant): the pool's peakDraw
      // is only the base load, so quote the spike table's base → rush peak.
      {
        const _spk = (typeof COMMERCIAL_SPIKES !== 'undefined') ? COMMERCIAL_SPIKES[e.commercialSubtype] : null;
        if (_spk) { iMin = _spk.base; iPeak = _spk.peak; }
      }
      // Daytime-only types (peak, no min, no idle draw) are off overnight.
      const iShut = e._activePowerInput == null && e.peakDraw != null && e.minDraw == null && !e.idleDraw && !(iHour >= 7 && iHour < 19);
      titleEl.textContent  = e.businessName || 'Industrial Load';
      titleEl.style.color  = '#ff8040';
      statusEl.textContent = e.powered ? 'OPERATING' : 'OFFLINE';
      statusEl.className   = `ep-status ${e.powered ? 'good' : 'bad'}`;
      section(
        row('Workers',     e._population ? `${e._population} people` : '—', 'good'),
        row('Load Now',    `${formatPower((iCur ?? 0), 1)}`, e.powered ? '' : 'bad'),
        row('Min / Peak',  `${formatPower(iMin)} → ${formatPower(iPeak)}`),
        row('Status',      !e.powered ? 'BLACKOUT' : iShut ? 'Shut down for the evening' : 'Running',
          !e.powered ? 'bad' : iShut ? 'dim' : 'good'),
        viaRow(e),
        row('Reliability', `${Math.round(e.reliability || 100)}%`,
          (e.reliability||100) > 80 ? 'good' : (e.reliability||100) > 50 ? '' : 'bad'),
      );
      const indBlackoutPct = Economy.outagePayPct(e.blackoutSeconds);
      section(row('Revenue', `${formatMoney(e.powered ? fee * ((e.reliability||100)/100) : fee * (indBlackoutPct/100))}/s`, e.powered ? 'gold' : 'warn'));
    }
    // ── Commercial ───────────────────────────────────────────────
    else if (e.type === T.COMMERCIAL) {
      const fee = e.dailyFee ?? 0;
      titleEl.textContent  = e.businessName || 'Commercial Building';
      titleEl.style.color  = '#f0c040';
      statusEl.textContent = e.powered ? 'OPERATING' : 'OFFLINE';
      statusEl.className   = `ep-status ${e.powered ? 'good' : 'bad'}`;
      const cHour = DayNight.hour();
      const cCur  = e._liveDemand ?? DemandCurves.resolve(T.COMMERCIAL, e.commercialSubtype, cHour);
      let cMin = Infinity, cPeak = 0;
      for (let h = 0; h < 24; h++) {
        const v = DemandCurves.resolve(T.COMMERCIAL, e.commercialSubtype, h);
        if (v < cMin) cMin = v;
        if (v > cPeak) cPeak = v;
      }
      // Fall back to pool minDraw/peakDraw for flat-curve types
      if (cMin === cPeak && e.minDraw != null) cMin = e.minDraw;
      if (e.peakDraw != null) cPeak = e.peakDraw;
      // Authoritative pool override
      {
        const _pool = HouseRequestSystem.lookupPoolEntry?.(e.businessName);
        if (_pool) {
          if (_pool.minDraw  != null) cMin  = _pool.minDraw;
          if (_pool.peakDraw != null) cPeak = _pool.peakDraw;
        }
        // For spike-driven subtypes the pool's peakDraw is the BASE draw (its
        // desc reads e.g. "15 kW base · spikes to 45 kW"), so taking it verbatim
        // above understates what the building can actually pull. The spike
        // table holds the real ceiling.
        const _spk = (typeof COMMERCIAL_SPIKES !== 'undefined') ? COMMERCIAL_SPIKES[e.commercialSubtype] : null;
        if (_spk) cPeak = Math.max(cPeak, _spk.peak);
      }
      // Trading hours — drives both the Hours row and the open/closed tag on
      // the live draw, so a building sitting at its overnight floor reads as
      // deliberately shut rather than looking like a fault.
      const cHrs = DemandCurves.hours(e.commercialSubtype, cHour);
      const cShut = cHrs && !cHrs.isOpenNow;
      const cRows = [
        row('Workers',    e._population ? `${e._population} people` : '—', 'good'),
        row('Now',        `${formatPower((cCur??0), 1)}${cShut ? ' · closed' : ''}`,
          !e.powered ? 'bad' : cShut ? 'dim' : ''),
        row('Min / Peak', `${formatPower(cMin)} → ${formatPower(cPeak)}`),
        row('Hours',      cHrs ? cHrs.label : 'Open 24 hours',
          cHrs ? (cShut ? 'dim' : 'good') : 'good'),
      ];
      if (cHrs && cHrs.idle != null) {
        cRows.push(row('Overnight', `${formatPower(cHrs.idle)} standby`, 'dim'));
      } else if (cHrs) {
        cRows.push(row('Overnight', 'Shuts down · 0 kW', 'dim'));
      }
      cRows.push(
        row('Profile',    e.commercialSubtype || 'standard', 'dim'),
        row('Status',      !e.powered ? 'BLACKOUT' : cShut ? 'Closed' : 'Operating',
          !e.powered ? 'bad' : cShut ? 'dim' : 'good'),
        viaRow(e),
        row('Reliability', `${Math.round(e.reliability || 100)}%`,
          (e.reliability||100) > 80 ? 'good' : (e.reliability||100) > 50 ? '' : 'bad'),
        row('Satisfaction', `${Math.round(e.satisfaction??80)}%`,
          (e.satisfaction??80) > 80 ? 'good' : (e.satisfaction??80) > 60 ? '' : 'bad'),
        ...(typeof PollutionSystem !== 'undefined' ? (() => {
          const p = Math.round(PollutionSystem.exposureFor(e)), loc = Math.round(PollutionSystem.localExposureFor(e));
          return [row('Air Quality', p < 1 ? 'Clean' : `−${p} satisfaction cap (${loc} local smog, ${p - loc} city emissions)`, p < 1 ? 'good' : p > 25 ? 'bad' : '')];
        })() : []),
        ...(e._churnTimer > 0 ? [
          row('⚠ Churn Risk', `leaves in ${SatisfactionSystem.churnHoursLeft(e).toFixed(1)} game hours if it stays below 30%`, 'bad'),
          row('Unhappy with', SatisfactionSystem.causeText(e), 'bad'),
        ] : []),
        row('Type',        'Commercial Building', 'dim'),
      );
      section(...cRows);
      const comBlackoutPct = Economy.outagePayPct(e.blackoutSeconds);
      section(row('Revenue', `${formatMoney(e.powered ? fee * ((e.reliability||100)/100) : fee * (comBlackoutPct/100))}/s`, e.powered ? 'gold' : 'warn'));
    }
    // ── Mae's Cabin ──────────────────────────────────────────────
    else if (e.type === T.CELLTOWER) {
      titleEl.textContent = 'Cell Tower';
      titleEl.style.color = '#40c0ff';
      statusEl.textContent = e.powered ? 'ACTIVE' : 'NO POWER';
      statusEl.className   = `ep-status ${e.powered ? 'good' : 'bad'}`;
      // Count residential zone coverage
      let _zoneHouses = 0;
      for (let _r = 0; _r < ROWS; _r++) for (let _c = 0; _c < COLS; _c++) {
        const _ne = GridManager.getEntity(_c, _r);
        if (_ne && _ne.col === _c && _ne.row === _r && _ne.fromRequest && _ne.type === T.HOUSE) {
          const _d = Math.abs(_c - e.col) + Math.abs(_r - e.row);
          if (_d <= 20) _zoneHouses++;
        }
      }
      section(
        row('Status',        e.powered ? 'Broadcasting' : 'Offline', e.powered ? 'good' : 'bad'),
        viaRow(e),
        // All read from the def — these were hardcoded strings, so changing
        // the tower's rate or footprint left the panel quoting the old one.
        row('Income',        e.powered ? `+$${e.def.income}/s` : '$0/s', e.powered ? 'good' : 'dim'),
        row('Power Draw',    `${formatPower(e.def.powerInput)}`),
        row('Houses Served', `${_zoneHouses} nearby`, _zoneHouses >= 8 ? 'good' : 'warn'),
        row('Footprint',     `${e.def.width}×${e.def.height} tiles`, 'dim'),
        row('Cost',          formatMoney(e.def.cost), 'dim'),
      );
    }
    else if (e.type === T.FIBERHUB) {
      titleEl.textContent = 'Fiber Hub';
      titleEl.style.color = '#40ffcc';
      statusEl.textContent = e.powered ? 'ACTIVE' : 'NO POWER';
      statusEl.className   = `ep-status ${e.powered ? 'good' : 'bad'}`;
      // Count all zone buildings nearby
      let _zoneBuildings = 0;
      for (let _r = 0; _r < ROWS; _r++) for (let _c = 0; _c < COLS; _c++) {
        const _ne = GridManager.getEntity(_c, _r);
        if (_ne && _ne.col === _c && _ne.row === _r && _ne.fromRequest) {
          const _d = Math.abs(_c - e.col) + Math.abs(_r - e.row);
          if (_d <= 16) _zoneBuildings++;
        }
      }
      section(
        row('Status',           e.powered ? 'Broadcasting' : 'Offline', e.powered ? 'good' : 'bad'),
        viaRow(e),
        row('Income',           e.powered ? `+$${EntityDefs[T.FIBERHUB].income}/s` : '$0/s', e.powered ? 'good' : 'dim'),
        row('Power Draw',       '8 kW'),
        row('Buildings Served', `${_zoneBuildings} nearby`, _zoneBuildings >= 12 ? 'good' : 'warn'),
        row('Footprint',        `${e.def.width}×${e.def.height} tiles`, 'dim'),
        row('Cost',             '$25,000', 'dim'),
      );
    }
    else if (e.type === T.CIRCUITSWITCH || e.type === T.CIRCUITSWITCH2) {
      const CS   = CircuitSwitchSystem;
      const open = CS.isOpen(e);
      const cap  = e.def.switchCapacity || CS.CAPACITY_W;
      const mem  = CS.members(e);
      const peak = CS.assignedPeak(e);
      const live = CS.assignedLive(e);
      const assigning = InputManager.circuitAssignTarget?.() === e;

      titleEl.textContent  = e.def.label || 'Circuit Switch';
      titleEl.style.color  = open ? '#ff8060' : '#7ad88a';
      const auto     = CS.isAuto(e);
      const tripped  = open && !!e._autoTripped;
      statusEl.textContent = tripped ? 'OPEN: AUTO-SHED' : open ? 'OPEN: CIRCUIT CUT' : 'CLOSED: CIRCUIT LIVE';
      statusEl.className   = `ep-status ${open ? 'bad' : 'good'}`;

      section(
        // Peak governs what may be added (it is a breaker rating); live is
        // what throwing the switch would actually shed right now. Showing
        // only peak would have the player cut a circuit that doesn't close
        // the deficit they're staring at.
        row('Capacity',   `${formatPower(Math.round(peak))} / ${formatPower(cap)} peak`, peak > cap*0.9 ? 'warn' : 'good'),
        bar(cap > 0 ? peak/cap : 0, peak > cap*0.9 ? '#ffb040' : '#40c0ff'),
        row('Shedding now', open ? '— (already cut)' : `${formatPower(Math.round(live))}`, 'good'),
        row('Buildings',  `${mem.length}`),
        ...(CS.hasAuto(e) ? [row('Auto shed',
              !auto    ? 'Off: manual only'
            : tripped  ? `Tripped, closing after ${CS.AUTO_RECLOSE_SECS}s of spare generation (${Math.floor(e._recloseFor || 0)}s)`
            : open     ? 'On: opened by hand, stays open'
            :            'On: opens if the network would go dark',
            !auto ? 'dim' : tripped ? 'warn' : 'good')] : []),
        row('Network',    e.networkId != null ? (getNetworkDisplayName(e.networkId) || 'Not connected') : 'Not connected',
                          e.networkId != null ? '' : 'bad'),
      );

      if (mem.length) {
        // Wrapped in the same scrollable-list idiom as the network roster
        // below (.ep-scroll) — a big MK2 can carry dozens of small
        // buildings, and an unbounded list here would push the controls
        // (and the rest of the panel) off the bottom of the screen.
        const rosterRows = mem.map(m => {
          const nm = m.businessName || m.familyName || (m.def && m.def.label) || m.type;
          return row(nm, `${formatPower(Math.round(CS.peakDrawOf(m)))} peak`, m.powered ? '' : 'dim');
        }).join('');
        const rosterSection = document.createElement('div');
        rosterSection.className = 'ep-section';
        rosterSection.innerHTML = `<div class="ep-scroll">${rosterRows}</div>`;
        body.appendChild(rosterSection);
      } else {
        section(row('Roster', 'Empty: assign buildings below', 'warn'));
      }

      // ── Controls ──
      const ctl = document.createElement('div');
      ctl.className = 'ep-section';

      const mkBtn = (text, color, border, onClick) => {
        const b = document.createElement('button');
        b.textContent = text;
        b.style.cssText = 'display:block;width:100%;margin-top:5px;padding:6px 8px;'
          + 'background:#0d1216;border:1px solid ' + border + ';color:' + color + ';'
          + 'font:inherit;font-size:11px;letter-spacing:.5px;cursor:pointer;border-radius:3px';
        // See note above buildContent: this panel is rebuilt every frame, so a
        // 'click' listener is unreliable — the element it was bound to is gone
        // by the time mouseup happens. Fire on mousedown instead.
        b.onmousedown = (ev) => { ev.preventDefault(); ev.stopPropagation(); onClick(); };
        ctl.appendChild(b);
        return b;
      };

      mkBtn(open ? '⏻  CLOSE CIRCUIT (restore power)' : '⏻  OPEN CIRCUIT (shed load)',
            open ? '#7ad88a' : '#ff8060',
            open ? '#2e5a38' : '#6a2a20',
            () => { CS.setOpen(e, !open); buildContent(); });

      if (CS.hasAuto(e)) {
        mkBtn(auto ? '⚡  AUTO SHED: ON' : '⚡  AUTO SHED: OFF',
              auto ? '#40c0ff' : '#c0c8d0',
              auto ? '#204a66' : '#3a4650',
              () => { CS.setAuto(e, !auto); buildContent(); });
      }

      if (mem.length === 0 && !assigning) {
        // nothing to warn about yet
      } else if (!assigning) {
        mkBtn('✎  ASSIGN BUILDINGS', '#40c0ff', '#204a66',
              () => { InputManager.beginCircuitAssign(e); buildContent(); });
      }
      if (assigning) {
        mkBtn('✔  DONE ASSIGNING', '#ffd060', '#6a5a20',
              () => { InputManager.endCircuitAssign(); buildContent(); });
      } else if (mem.length === 0) {
        mkBtn('✎  ASSIGN BUILDINGS', '#40c0ff', '#204a66',
              () => { InputManager.beginCircuitAssign(e); buildContent(); });
      }

      mkBtn(e._uiListOpen ? '▴  HIDE NETWORK BUILDINGS' : '▾  VIEW NETWORK BUILDINGS',
            '#c0c8d0', '#3a4650',
            () => { e._uiListOpen = !e._uiListOpen; buildContent(); });

      if (assigning) {
        const hint = document.createElement('div');
        hint.className = 'ep-row';
        hint.style.cssText = 'margin-top:6px;color:#8fd0ff;font-size:10px;line-height:1.4';
        hint.textContent = 'Click buildings on the map to add or remove them. '
          + `They must sit on this switch’s network and fit the ${formatPower(cap)} peak rating. Esc to finish.`;
        ctl.appendChild(hint);
      }
      body.appendChild(ctl);

      // ── Every building on this switch's network, by peak draw ──────
      // Sorted heaviest first, because in an emergency the question is
      // "what is the smallest number of buildings that closes my deficit".
      // Rows are clickable, which is a far better way to build a roster
      // than hunting for buildings on the map.
      if (e._uiListOpen) {
        // Candidate sweep is cached for a beat — this panel rebuilds ~60x/sec
        // and scanning every entity that often is not free on a large map.
        const nowMs = performance.now();
        if (!e._uiListCache || nowMs - e._uiListCacheAt > 600 || e._uiListCacheNet !== e.networkId) {
          const scan = [];
          for (const ent of EntityRegistry.all()) {
            if (!ent || !ent.def || CircuitSwitchSystem.isSwitchType(ent.type)) continue;
            if (ent.networkId == null || ent.networkId !== e.networkId) continue;
            const pk = CS.peakDrawOf(ent);
            if (pk <= 0) continue;
            scan.push({ ent, pk });
          }
          scan.sort((a, b) => b.pk - a.pk);
          e._uiListCache = scan; e._uiListCacheAt = nowMs; e._uiListCacheNet = e.networkId;
        }
        const onNet = e._uiListCache.filter(x => EntityRegistry.all().has(x.ent));

        const host = _switchListHost();
        host.style.display = '';

        // Rebuild the ROWS only when what they show actually changes. The
        // host element itself is never replaced, so scrolling is unaffected.
        const sig = [e.col, e.row, e.networkId, getNetworkDisplayName(e.networkId), onNet.length,
                     CS.memberCoords(e).map(m => m.c + ':' + m.r).join('|')].join('#');
        if (host._sig !== sig) {
          // Adding/removing a building changes the signature and rebuilds
          // the scroller from scratch, which would otherwise snap it back to
          // the top — carry the scroll position over when it's the same
          // switch, so you can keep working down the list.
          const _sameSwitch = host._switchKey === e.col + ':' + e.row;
          const _prevScroller = host.querySelector('.ep-scroll');
          const _keepScroll = _sameSwitch && _prevScroller ? _prevScroller.scrollTop : 0;
          const _keepHostScroll = _sameSwitch ? host.scrollTop : 0;
          host._switchKey = e.col + ':' + e.row;
          host._sig = sig;
          host.innerHTML = '';

          const head = document.createElement('div');
          head.className = 'ep-row';
          head.style.cssText = 'color:#8fa0b0;font-size:10px;letter-spacing:.5px';
          head.textContent = onNet.length
            ? `${onNet.length} buildings on ${getNetworkDisplayName(e.networkId) || 'this network'} · ${formatPower(Math.round(onNet.reduce((a,x)=>a+x.pk,0)))} peak total`
            : 'No powered buildings on this network';
          host.appendChild(head);

          const scroller = document.createElement('div');
          scroller.className = 'ep-scroll';   // themed scrollbar, see index.html
          // Keep the map from zooming under a scrolling list.
          scroller.addEventListener('wheel', ev => ev.stopPropagation(), { passive: true });

          for (const { ent, pk } of onNet) {
            const mine  = CS.isMember(e, ent);
            const owner = mine ? null : CS.ownerOf(ent);
            const why   = mine ? null : CS.rejectReason(e, ent);
            const nm    = ent.businessName || ent.familyName || (ent.def && ent.def.label) || ent.type;

            const r = document.createElement('div');
            r.className = 'ep-row';
            r.style.cssText = 'cursor:pointer;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.05)';
            const tag  = mine ? '●' : owner ? '–' : why ? '✕' : '○';
            const tint = mine ? '#7ad88a' : owner ? '#7a6a50' : why ? '#a05a50' : '#c0c8d0';
            r.innerHTML =
              `<span class="ep-label" style="color:${tint}">${tag} ${nm}</span>` +
              `<span class="ep-value" style="color:${tint}">${formatPower(Math.round(pk))}</span>`;
            r.title = mine ? 'On this circuit: click to remove'
                    : owner ? 'On another circuit'
                    : why ? why : 'Click to add to this circuit';
            r.onmousedown = (ev) => {
              ev.preventDefault(); ev.stopPropagation();
              const res = CS.toggleMember(e, ent);
              if (!res.ok) flashMessage(res.why);
              buildContent();
            };
            scroller.appendChild(r);
          }
          host.appendChild(scroller);
          scroller.scrollTop = _keepScroll;
          host.scrollTop = _keepHostScroll;
        }
      }

      section(...costRows(e.def));
    }
    else if (e.type === T.POWERTOWER) {
      titleEl.textContent = 'Power Tower';
      titleEl.style.color = '#40a0ff';
      statusEl.textContent = e.powered ? 'LIVE' : 'UNPOWERED';
      statusEl.className   = `ep-status ${e.powered ? 'good' : 'bad'}`;
      // Footprint, upkeep and price from the tower itself: what was paid,
      // footings in water (water_build.js) included.
      const _td = EntityDefs[T.POWERTOWER];
      const _paid = e._paid !== undefined ? e._paid : _td.cost;
      section(
        row('Function',   '8-tile wire relay', 'dim'),
        row('Upkeep',     `-$${_td.upkeep}/s`, 'bad'),
        row('Footprint',  `${e.width || _td.width}×${e.height || _td.height} tiles`, 'dim'),
        row('Cost',       e._waterFooting ? `${formatMoney(_paid)} (incl. ${formatMoney(WaterBuild.TOWER_FOOTING)} footings)` : formatMoney(_paid), 'dim'),
        ...(e._waterFooting ? [row('Placement', 'On concrete footings in water', 'dim')] : []),
      );
      if (e.networkId >= 0 && typeof GridAnalyzer !== 'undefined') body.appendChild(GridAnalyzer.buttonFor(e.networkId));
    }
    // ── Residential Park Amenities (Small Park, Community Garden,
    //    Tree-Lined Street, Basketball Court, Farmers Market, Fountain) ─
    else if (e.type === T.SMALLPARK || e.type === T.COMMUNITYGARDEN || e.type === T.TREEDSTREET ||
             e.type === T.BASKETBALLCOURT || e.type === T.FARMERSMARKET || e.type === T.FOUNTAIN ||
             e.type === T.SPLASHPAD || e.type === T.BASEBALLFIELD || e.type === T.PLAYGROUND ||
             e.type === T.ALLOTMENTS || e.type === T.DOGPARK || e.type === T.COMMUNITYCENTER ||
             e.type === T.GREENHOUSE || e.type === T.CORNERSTORE || e.type === T.FARM) {
      const def  = EntityDefs[e.type];
      const info = ParkRequestSystem.getParkInfo(e);
      const poweredPark = e.type === T.SPLASHPAD || e.type === T.BASEBALLFIELD || e.type === T.COMMUNITYCENTER || e.type === T.GREENHOUSE || e.type === T.CORNERSTORE;
      const drawNow = poweredPark ? (DemandCurves.get(e.type, null, DayNight.hour()) || 0) : 0;
      const starved = poweredPark && drawNow > 0 && !e.powered;
      // A corner store goes by its own name (Rosa's Bodega…), not 'Corner Store'.
      titleEl.textContent  = e.type === T.CORNERSTORE && typeof cornerStoreName === 'function' ? cornerStoreName(e) : def.label;
      titleEl.style.color  = def.glowColor || '#80d040';
      statusEl.textContent = starved ? 'NO POWER' : 'ACTIVE';
      statusEl.className   = `ep-status ${starved ? 'bad' : 'good'}`;
      section(
        row('Zone',       info.zoneIndex >= 0 ? `Residential Zone ${info.zoneIndex + 1}` : 'Unassigned', 'dim'),
        row('In Zone',    `${info.count} / ${info.max}`, info.count >= info.max ? 'good' : ''),
        row('Footprint',  `${e.width}×${e.height} tiles`, 'dim'),
      );
      if (poweredPark) {
        const sched = e.type === T.SPLASHPAD ? '10:00–19:00, off in rain' : e.type === T.COMMUNITYCENTER ? '08:00–22:00 (lights + heating)'
                    : e.type === T.CORNERSTORE ? 'Open 07:00–23:00 (2.5 kW) · fridges 0.75 kW overnight'
                    : e.type === T.GREENHOUSE ? 'Grow lights 06:00–22:00 (18 kW) · heating 5 kW overnight' : '18:00–22:00 (floodlights)';
        section(
          row('Power Draw', drawNow > 0 ? `${formatPower(Math.round(e._liveDemand ?? drawNow))}` : 'Off', drawNow > 0 ? (e.powered ? 'good' : 'bad') : 'dim'),
          row('Runs',       sched, 'dim'),
          row('Unpowered',  'pays half income while scheduled on', starved ? 'bad' : 'dim'),
          viaRow(e),
        );
      }
      // Parks have no real upkeep — def.upkeep is negative and IS the income
      // (Economy.tick folds it in via "upkeep += e.def.upkeep", the same
      // negative-upkeep-means-income idiom as the Lamp/Camera/Fiber Hub).
      // Showing a separate "-$X/s Upkeep" line here as well as "+$X/s
      // Income" made every park look like it earned and cost the exact same
      // amount for a net of $0/s, when the true net is the full +$X/s.
      const incomeNow = starved ? def.income * 0.5 : def.income;
      section(row('Income', `+$${incomeNow}/s`, starved ? 'bad' : 'good'), row('Built For', formatMoney(def.upfrontPaid), 'dim'));
    }
    else if (e.type === T.TOWNHALL || e.type === T.CIVICCENTER || e.type === T.COURTHOUSE ||
             e.type === T.EMS || e.type === T.HOSPITAL || e.type === T.UNIVERSITY || e.type === T.TRANSPORTHUB || e.type === T.NATIONALGOV || e.type === T.FUSIONLAB || e.type === T.AIRPORT || e.type === T.MILITARYBASE || e.type === T.LAUNCHCOMPLEX || e.type === T.NATIONALGRID || e.type === T.COMPANYHQ) {
      const def = EntityDefs[e.type];
      titleEl.textContent = def.label;
      titleEl.style.color = def.glowColor || '#c0a030';
      statusEl.textContent = e.powered ? 'OPERATIONAL' : 'NO POWER';
      statusEl.className   = `ep-status ${e.powered ? 'good' : 'bad'}`;
      section(
        row('Status',     e.powered ? 'Online' : 'Unpowered', e.powered ? 'good' : 'bad'),
        // A civic building pays twice over: its income, and a government
        // grant carried as negative upkeep (Economy.tick). Both shown, as
        // banked: the difficulty's pay multiplier on the income, any upkeep
        // perk on the grant, and both sliding on the outage curve while dark.
        ...(() => {
          const pct   = e.powered ? 1 : Math.max(0, Economy.outagePayPct(e.blackoutSeconds || 0) / 100);
          const iMult = typeof Difficulty !== 'undefined' ? Difficulty.incomeMult() : 1;
          const uMult = typeof ContractPerks !== 'undefined' ? ContractPerks.upkeepMult() : 1;
          const pay   = (def.income || 0) * pct * iMult;
          const grant = Math.max(0, -(def.upkeep || 0)) * pct * uMult;
          const $ = v => `+$${v.toLocaleString('en-US', { maximumFractionDigits: v < 100 ? 1 : 0 })}/s`;
          const tone = e.powered ? 'good' : 'warn';
          if (!grant) return [row('Income', $(pay), tone)];
          return [row('Income', $(pay), tone), row('Government Grant', $(grant), tone), row('Total', $(pay + grant), tone)];
        })(),
        ...(def.minDraw != null
          ? [row('Power Draw', e.powered ? `${formatPower(Math.round(e._liveDemand ?? def.powerInput))} now` : '0 kW', e.powered ? 'good' : 'dim'),
             row('Draw Range', `${def.minDraw}–${formatPower(def.powerInput)} daily`, 'dim')]
          : [row('Power Draw', `${formatPower(def.powerInput)} constant`)]),
        ...(e.type === T.FUSIONLAB && typeof FusionResearch !== 'undefined'
          ? (() => {
              const v = FusionResearch.visual(e);
              if (v.ignited) return [row('Fusion', 'ACHIEVED: sustained ignition', 'good'),
                                     row('Chain Goals', v.bonusShots >= v.bonusMax
                                       ? `−${Math.round(v.goalCut * 100)}% · fully optimised`
                                       : `−${Math.round(v.goalCut * 100)}% · each good shot trims 1% more`, e.powered ? 'good' : 'dim')];
              if (!v.researching) return [row('Fusion', 'Waiting for the MK5 Research Station', 'dim')];
              return [row('Fusion Research', `${v.shots}/${v.shotsNeeded} good shots · ${FusionResearch.timeLeftText()} to go`, e.powered ? 'good' : 'bad'),
                      row('Shots', 'Half-hourly 09:00–18:00 · need 1 MW throughout', 'dim'),
                      ...(v.lastFailed ? [row('Last Shot', 'Aborted: browned out', 'bad')] : []),
                      ...(v.imminent ? [row('Warning', 'Power loss now costs 2 shots of data', 'bad')] : []),
                      ...(e.powered ? [] : [row('Research', 'Halted: no power', 'bad')])];
            })()
          : []),
        ...(e.type === T.NATIONALGRID && typeof NationalProject !== 'undefined'
          ? (() => {
              const v = NationalProject.visual();
              if (v.complete) return [row('Operation Hyperion', 'COMPLETE: powering the nation', 'good'),
                                      row('Export', v.exporting ? `${formatPower(v.exportKW)} to the nation` : 'Off', v.exporting ? 'good' : 'dim')];
              return [row('Operation Hyperion', `Stage ${v.label} · ${v.waiting ? 'waiting on the MHD Ring' : `${Math.floor(v.progress * 100)}%`}`, e.powered ? 'good' : 'bad'),
                      row('Overall', `${Math.floor(v.overall * 100)}%`, 'dim'),
                      ...(v.ignition && !v.waiting ? [row('Fusion Burn', `${Math.floor(v.dtBurned)}/${v.dtNeeded} pellets in Fusion Reactors`, e.powered ? 'good' : 'bad')] : []),
                      ...(v.stage === 1 ? [row('Surges', `${v.surges}/${v.surgesNeeded} · ${formatPower(NationalProject.SURGE_KW)} each hour`, v.lastFail ? 'bad' : 'good')] : []),
                      ...(v.stage >= 2 ? [row('Export', `${formatPower(v.exportKW)} · ${Math.ceil(v.hoursLeft)}h to go`, e.powered ? 'good' : 'bad')] : [])];
            })()
          : []),
        ...(e.type === T.LAUNCHCOMPLEX && typeof LaunchSystem !== 'undefined' && LaunchSystem.getSite() === e
          ? (() => {
              const n = LaunchSystem.getNext();
              if (!n) return [];
              const left = Math.max(0, n.at - DayNight.getElapsed()), gm = Math.floor(left / DayNight.secondsPerGameHour() * 60);
              const inText = n.fuelling && left < 100 ? `T-${Math.ceil(left)}s`
                : gm >= 1440 ? `in ${Math.floor(gm / 1440)}d ${Math.floor(gm % 1440 / 60)}h` : `in ${Math.floor(gm / 60)}h ${gm % 60}m`;
              const spare = LaunchSystem.spareFor(e), ok = spare >= n.needKw;
              return [row('Next Launch', `Mission ${n.mission} · ${LaunchSystem.clockAt(n.at)} · ${inText}`, n.fuelling ? 'good' : 'dim'),
                      row('Power Needed', `${formatPower(n.needKw)} at liftoff · ${n.cls}`, 'dim'),
                      row('Grid Spare Now', `${formatPower(Math.round(spare))}${ok ? '' : ` · ${formatPower(Math.round(n.needKw - spare))} short`}`, ok ? 'good' : 'bad'),
                      ...(n.result ? [row('Last Launch', `Mission ${n.result.mission} ${n.result.ok ? 'flew' : 'scrubbed'}`, n.result.ok ? 'good' : 'bad')] : [])];
            })()
          : []),
        row('Footprint',  `${e.width}×${e.height} tiles`, 'dim'),
        row('Note',       e.type === T.COMPANYHQ ? 'Your headquarters, a gift from the city: cannot be removed' : 'Government building: cannot be removed', 'dim'),
      );
      if (e.type === T.NATIONALGRID) {
        // Delegated (NationalProject listens for data-open-meridian): this
        // panel is rebuilt every tick, which would eat a bound onclick.
        const btn = document.createElement('button');
        btn.textContent = '◈ OPEN THE HYPERION DOSSIER';
        btn.setAttribute('data-open-meridian', '');
        btn.style.cssText = 'width:100%;margin:8px 0 2px;font-size:9px;letter-spacing:1.5px;padding:8px 0;' +
          'border:1px solid #1a4a66;border-radius:2px;background:#06182a;color:#7ad8ff;cursor:pointer';
        body.appendChild(btn);
      }
    }
    else if (e.type === T.GOVBUILDING) {
      const approval = GovernmentSystem.getApproval();
      const contracts = GovernmentSystem.getContracts();
      const completed = GovernmentSystem.getCompleted();
      const active = contracts.filter(c => !c._completed);
      const done   = contracts.filter(c => c._completed);
      const barColor = approval >= 70 ? 'good' : approval >= 40 ? 'warn' : 'bad';

      titleEl.textContent = 'City Hall';
      titleEl.style.color = '#c0a030';
      statusEl.textContent = e.powered ? 'POWERED' : 'NO POWER';
      statusEl.className   = `ep-status ${e.powered ? 'good' : 'bad'}`;
      section(
        row('Approval Rating', `${approval}%`, barColor),
        row('Power Draw',      '8 kW constant', 'dim'),
        row('Status',         e.powered ? 'Operational' : 'Unpowered', e.powered ? 'good' : 'bad'),
        row('Commissions Done', `${completed}`, completed > 0 ? 'good' : 'dim'),
      );
      if (active.length) {
        section(
          ...active.map(c => row('📋 ' + c.label, `+$${c.reward.toLocaleString()}`, 'warn'))
        );
      } else {
        section(row('Active Commission', 'None pending', 'dim'));
      }
      if (done.length) {
        section(
          ...done.map(c => row('✅ ' + c.label, 'Complete', 'good'))
        );
      }
      // Show static loan section
      if (_ls) { _ls.style.display = 'block'; updateLoanList(); }
      section(row('Note', 'Building cannot be removed', 'dim'));
    }
    else if (e.type === T.CABIN) {
      const fee = e.dailyFee ?? e.def.income ?? 0;
      titleEl.textContent  = "Mae's Cabin";
      titleEl.style.color  = '#a0d080';
      statusEl.textContent = e.powered ? 'POWERED' : 'OFFLINE';
      statusEl.className   = `ep-status ${e.powered ? 'good' : 'bad'}`;
      section(
        row('Residents',   e._population ? `${e._population} people` : '1 person', 'good'),
        row('Status',      e.powered ? 'Receiving power' : 'BLACKOUT', e.powered ? 'good' : 'bad'),
        row('Power Draw',  `${formatPower(e.def.powerInput ?? 1)}`),
        row('Reliability', `${Math.round(e.reliability ?? 100)}%`,
          (e.reliability??100) > 80 ? 'good' : (e.reliability??100) > 50 ? '' : 'bad'),
        row('Satisfaction',`${Math.round(e.satisfaction ?? 80)}%`,
          (e.satisfaction??80) > 80 ? 'good' : (e.satisfaction??80) > 60 ? '' : 'bad'),
      );
      section(row('Revenue', `${formatMoney(fee)}/s`, 'good'));
    }

    // ── Communications Beacon ─────────────────────────────────────
    else if (e.type === T.BEACON) {
      titleEl.textContent  = 'Communications Beacon';
      titleEl.style.color  = '#5aa8ff';
      // Transmitting means sweeping. A powered-but-idle beacon is on
      // standby: connected, drawing its idle 3 kW, hearing nothing.
      const _sweeping = ContractSystem.isSearching();
      statusEl.textContent = !e.powered ? 'OFFLINE' : (_sweeping ? 'TRANSMITTING' : 'STANDBY');
      statusEl.className   = `ep-status ${!e.powered ? 'bad' : (_sweeping ? 'good' : '')}`;
      const sweep = ContractSystem.searchStatus();
      section(
        // Standby draws a little; a sweep draws four times that.
        row('Power Draw', `${formatPower(sweep.watts)} (${sweep.searching ? 'searching' : 'standby'})`,
            sweep.searching ? '' : 'dim'),
        row('Contracts',  e.powered ? 'Board online' : 'Unavailable', e.powered ? 'good' : 'bad'),
        row('Sweep',      sweep.searching ? `Searching: ${ContractSystem.formatSpan(sweep.elapsed)} elapsed`
                                          : (sweep.blocker || 'Idle'),
            sweep.searching ? 'good' : 'dim'),
      );
      if (e.powered) {
        // Start/stop the sweep. Same delegated-listener trick as the board
        // button — buildContent() wipes this element every tick.
        const sBtn = document.createElement('button');
        const canRun = sweep.searching || ContractSystem.canSearch();
        sBtn.textContent = sweep.searching ? 'STOP SEARCHING' : 'SEARCH FOR AVAILABLE CONTRACTS';
        if (canRun) sBtn.setAttribute('data-beacon-search', '');
        sBtn.style.cssText = 'width:100%;margin:8px 0 2px;font-size:9px;letter-spacing:1.5px;padding:8px 0;' +
          `border:1px solid ${sweep.searching ? '#4a2028' : (canRun ? '#23486e' : '#16283a')};border-radius:2px;` +
          `background:${sweep.searching ? 'transparent' : (canRun ? '#0d2138' : 'transparent')};` +
          `color:${sweep.searching ? '#a05868' : (canRun ? '#8ec8ff' : '#2d4054')};` +
          `cursor:${canRun ? 'pointer' : 'default'}`;
        body.appendChild(sBtn);
      }
      if (e.powered) {
        const btn = document.createElement('button');
        // Mid-contract the board is readable but nothing on it can be
        // taken, so say so on the button rather than promising a choice.
        btn.textContent = (ContractSystem.canAcceptMore && !ContractSystem.canAcceptMore())
          ? 'VIEW CONTRACT BOARD' : 'OPEN CONTRACT BOARD';
        // No per-element handler: buildContent() re-runs every tick and
        // wipes this button, so an onclick bound here is destroyed between
        // the player's mousedown and mouseup ~10x a second. ContractSystem
        // owns a delegated mousedown listener keyed off this attribute.
        btn.setAttribute('data-open-contract-board', '');
        btn.style.cssText = 'width:100%;margin:8px 0 2px;font-size:9px;letter-spacing:1.5px;padding:8px 0;' +
          'border:1px solid #23486e;border-radius:2px;background:#0d2138;color:#8ec8ff;cursor:pointer';
        body.appendChild(btn);
      }
      section(row('Cost', formatMoney(e.def.cost)), row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'));
    }

    // ── Monitor Station ──────────────────────────────────────────
    else if (e.type === T.MONITOR) {
      titleEl.textContent  = 'Monitoring Station';
      titleEl.style.color  = '#40ffcc';
      statusEl.textContent = e.powered ? 'ACTIVE' : 'OFFLINE';
      statusEl.className   = `ep-status ${e.powered ? 'good' : 'bad'}`;
      section(
        row('Power Draw',   `${formatPower(e.def.powerInput)}`),
      );
      section(row('Cost', formatMoney(e.def.cost)), row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'));
    }

    // ── Monitoring Station MK2 ────────────────────────────────────
    else if (e.type === T.MONITOR2) {
      titleEl.textContent  = 'Monitoring Station MK2';
      titleEl.style.color  = '#40ffcc';
      statusEl.textContent = e.powered ? 'ACTIVE' : 'OFFLINE';
      statusEl.className   = `ep-status ${e.powered ? 'good' : 'bad'}`;
      const s = PowerNetwork.stats, nets = _gridNetworkOrder(s).length;
      const short = (s.conSources || []).filter(c => { const g = (s.genSources || []).find(n => n.netId === c.netId); return (g ? g.supply : 0) < c.demand - 0.05; }).length;
      section(
        row('Function',    'Grid operations centre'),
        row('Adds',        'Network Breakdown · storage readout · early warnings · 24 h forecast', 'good'),
        row('Also',        'Everything the Monitoring Station does', 'dim'),
        row('Watching',    `${nets} network${nets === 1 ? '' : 's'}${short ? ` · ${short} short of power` : ''}`, short ? 'bad' : 'good'),
        row('Power Draw',  `${formatPower(e.def.powerInput)}`),
      );
      section(row('Cost', formatMoney(e.def.cost)), row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'));
      if (typeof GridAnalyzer !== 'undefined') body.appendChild(GridAnalyzer.buttonFor(''));
    }

    // ── Engineering Office ────────────────────────────────────────
    else if (e.type === T.ENGOFFICE) {
      const open = e.powered && !e._lightningDamaged;
      const rep  = typeof Advisor !== 'undefined' ? Advisor.getReport() : null;
      titleEl.textContent  = 'Engineering Office';
      titleEl.style.color  = '#7ad8ff';
      statusEl.textContent = open ? 'OPEN' : 'OFFLINE';
      statusEl.className   = `ep-status ${open ? 'good' : 'bad'}`;
      section(
        row('Function',    'Audits your pipe and fuel chains'),
        row('An audit',    'What is wrong, why it matters, and the steps to fix it', 'good'),
        row('Takes',       '30 min to 3 h of game time, by how much they find'),
        row('Fee',         `${formatMoney(Advisor.AUDIT_FEE)} per audit`),
        ...(Advisor.jobText() ? [row('In progress', Advisor.jobText(), open ? 'good' : 'bad')] : []),
        row('Last audit',  rep ? `Day ${rep.day}, ${rep.time}: ${rep.findings.length} finding${rep.findings.length === 1 ? '' : 's'}` : 'None yet', rep ? 'neutral' : 'dim'),
        row('Power Draw',  `${formatPower(e.def.powerInput)}`),
      );
      section(row('Cost', formatMoney(e.def.cost)), row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'));
      // Delegated listener below: buildContent() rebuilds this every tick.
      const aBtn = document.createElement('button');
      aBtn.setAttribute('data-open-advisor', '');
      aBtn.textContent = Advisor.getJob() ? 'AUDIT IN PROGRESS: OPEN' : rep ? 'OPEN THE AUDIT' : 'COMMISSION AN AUDIT';
      aBtn.style.cssText = 'width:100%;margin:8px 0 2px;font-size:9px;letter-spacing:1.5px;padding:8px 0;border-radius:2px;cursor:pointer;border:1px solid #2a7090;background:rgba(122,216,255,0.08);color:#9be4ff;';
      body.appendChild(aBtn);
    }

    // ── Resource Survey Station (MK1 and MK2) ─────────────────────
    // Both tiers share one panel: the MK1 shows its single scan, the MK2 one
    // row + bar per dish, and the scan buttons below work out price, gating
    // and which dish to use through CoalSystem (startScan / scanBlocker), so
    // the panel only has to present the answers.
    else if (e.type === T.SURVEY || e.type === T.SURVEY2) {
      const mk2      = e.type === T.SURVEY2;
      const def      = EntityDefs[e.type];
      const free     = CoalSystem.freeScanSlots(e);
      const scanning = !!e._scanning;
      const discount = CoalSystem.scanDiscount(e);
      const scansTotal = CoalSystem.getAllSurveyCount();
      const accent   = mk2 ? '#ffb040' : '#c08030';
      titleEl.textContent  = def.label;
      titleEl.style.color  = accent;
      const _allBusy = free <= 0;
      statusEl.textContent = !e.powered ? 'OFFLINE' : _allBusy ? 'SCANNING' : scanning ? 'SCANNING 1/2' : 'READY';
      statusEl.className   = `ep-status ${!e.powered ? 'bad' : scanning ? 'warn' : 'good'}`;

      // What each dish is doing. The MK1's lone scan reads from its flat
      // fields; the MK2's from its slot array, one entry per dish.
      const _dishRows = [];
      if (mk2) {
        CoalSystem.scanSlots(e).forEach((s, i) => {
          const name = `Dish ${'AB'[i] || i + 1}`;
          if (!s) { _dishRows.push(row(name, e.powered ? 'Ready' : 'Idle', e.powered ? 'good' : 'dim')); return; }
          const k   = CoalSystem.getScanKindInfo(s.type);
          const pct = Math.min(1, (s.progress || 0) / (s.duration || 60));
          _dishRows.push(row(name, `${k.icon} ${k.label} · ${Math.round(pct * 100)}%${e.powered ? '' : ' (stalled)'}`, e.powered ? 'warn' : 'bad'));
          _dishRows.push(bar(pct, accent));
        });
      } else {
        const pct = Math.min(1, (e._scanProgress || 0) / (e._scanDuration || 60));
        _dishRows.push(row('Status', !e.powered ? 'Needs power' : scanning ? `Scanning… ${Math.round(pct*100)}%` : 'Ready', !e.powered ? 'bad' : 'good'));
        if (scanning) {
          const k = CoalSystem.getScanKindInfo(e._scanType);
          _dishRows.push(row('Scanning For', `${k.icon} ${k.label}`));
          _dishRows.push(bar(pct, accent));
        }
      }
      // Power: idle draw plus whatever each running scan adds.
      let _draw;
      if (mk2) { _draw = def.powerInput; for (const s of CoalSystem.scanSlots(e)) if (s) _draw += s.power || def.scanPowerInput; }
      else     { _draw = scanning ? (e._scanPowerInput || def.scanPowerInput) : def.powerInput; }
      section(
        ..._dishRows,
        row('Surveys Done', `${scansTotal}`),
        mk2 ? row('Scan Discount', `−${Math.round(discount * 100)}% on every scan`, 'good') : '',
        mk2 ? row('Dishes', `${def.scanSlots} (${free} free)`, free ? 'good' : 'warn') : '',
        row('Power Draw', `${formatPower(_draw)}${scanning ? ' (scanning)' : ''}`),
      );

      // Update the persistent scan buttons (never recreated — avoids click
      // timing issues). Listed while the station is powered and has a free
      // dish; each one is shown once its scan is researched. An MK2-only scan
      // still shows on an MK1, greyed out and labelled, so the player learns
      // where to run it instead of the button just never appearing.
      const _scanBtns = document.getElementById('ep-scan-btns');
      const _scanWarn = document.getElementById('ep-scan-warning');
      if (_scanBtns) {
        const _open = e.powered && free > 0;
        _scanBtns.style.display = _open ? 'block' : 'none';
        if (_scanWarn) {
          _scanWarn.style.display = _open ? 'block' : 'none';
          const _idle = def.powerInput;
          _scanWarn.textContent = mk2
            ? `⚠ Each running dish draws about ${formatPower(CoalSystem.getNextScanPower())} on top of the ${formatPower(_idle)} idle draw; two at once is double. Check your grid has spare capacity.`
            : `⚠ Scanning draws ${formatPower(CoalSystem.getNextScanPower())} (up from ${formatPower(_idle)} idle) for the duration; check your grid has spare capacity.`;
        }
        // Per-kind button palette: [live bg, live border, live text, dim bg, dim border, dim text]
        const PALETTE = {
          geothermal: ['rgba(255,144,80,0.15)',  '#ff9050', '#ffb070', 'rgba(40,16,0,0.3)',  '#4a2410', '#6a4030'],
          coal:       ['rgba(192,128,48,0.15)',  '#c08030', '#f0c060', 'rgba(40,20,0,0.3)',  '#4a3010', '#6a5030'],
          oil:        ['rgba(180,120,20,0.15)',  '#c08020', '#e0b040', 'rgba(40,20,0,0.3)',  '#4a3010', '#6a5020'],
          uranium:    ['rgba(60,180,80,0.15)',   '#40c060', '#60e080', 'rgba(20,40,20,0.3)', '#204020', '#406040'],
          sulfur:     ['rgba(200,180,20,0.15)',  '#c0b020', '#e8d040', 'rgba(40,35,0,0.3)',  '#4a4010', '#706830'],
          lithium:    ['rgba(140,220,255,0.15)', '#60c0e0', '#a0e0ff', 'rgba(10,30,40,0.3)', '#204050', '#406070'],
          helium:     ['rgba(240,184,255,0.15)', '#c090e0', '#f0b8ff', 'rgba(30,16,40,0.3)', '#402850', '#604870'],
          rareearth:  ['rgba(255,154,90,0.15)',  '#e07a40', '#ffb080', 'rgba(40,20,10,0.3)', '#4a2814', '#704a34'],
        };
        for (const kind of CoalSystem.scanOrder()) {
          const btn = document.getElementById(kind === 'geothermal' ? 'ep-geo-scan-btn' : `ep-${kind}-scan-btn`);
          if (!btn) continue;
          const show = CoalSystem.scanVisible(kind);
          btn.style.display = show ? 'block' : 'none';
          if (!show) continue;
          const k       = CoalSystem.scanKind(kind);
          const cost    = CoalSystem.scanCostAt(e, kind);
          const blocker = CoalSystem.scanBlocker(e, kind);
          const live    = !blocker;
          const pal     = PALETTE[kind] || PALETTE.coal;
          btn.textContent = blocker === 'mk2'
            ? `${k.label} Scan: MK2 station only`
            : live ? `${k.label} Scan: ${formatMoney(cost)}` : `${k.label} Scan (${formatMoney(cost)})`;
          btn.title    = blocker === 'mk2' ? 'Late-game scans need the Survey Station MK2 (unlocked at the MK4 Research stage).'
                       : discount ? `${Math.round(discount * 100)}% MK2 discount applied` : '';
          btn.disabled = !live;
          btn.style.background = live ? pal[0] : pal[3];
          btn.style.border     = `1px solid ${live ? pal[1] : pal[4]}`;
          btn.style.color      = live ? pal[2] : pal[5];
          btn._entity = e;
        }
      }
    }

    // ── Geothermal Deposit ────────────────────────────────
    else if (e.type === T.GEODEPOSIT) {
      const well    = Array.from(EntityRegistry.getByType(T.GEOWELL)).find(w => w._linkedDeposit === e || (w._depositCol === e.col && w._depositRow === e.row));
      const turbine = well ? well._linkedTurbine : null;
      const act     = GeothermalSystem.getActivityLabel();
      const baseW   = GeothermalSystem.getBaseOutputPerTurbine();
      const actW    = GeothermalSystem.getOutputPerTurbine();
      const wMult   = GeothermalSystem.getWeatherMult();
      const wPct    = Math.round((wMult - 1) * 100);
      const wTone   = wPct > 0 ? 'good' : wPct < 0 ? 'warn' : 'dim';
      const wText   = `${wPct > 0 ? '+' : ''}${wPct}% · ${Math.round(WeatherEventSystem.getTemperature())}°C`;
      // Walk the chain deposit → well → turbine so the panel names the exact
      // link that is broken rather than just saying the deposit is idle.
      const stage = !well          ? { text: 'UNDRILLED',       tone: 'neutral' }
                  : !well.powered  ? { text: 'WELL UNPOWERED',  tone: 'bad'     }
                  : !turbine       ? { text: 'NO TURBINE',      tone: 'warn'    }
                  : !turbine._generating ? { text: 'TURBINE IDLE', tone: 'warn' }
                  :                  { text: 'PRODUCING',       tone: 'good'    };
      titleEl.textContent  = 'Geothermal Deposit';
      titleEl.style.color  = '#ff9050';
      statusEl.textContent = stage.text;
      statusEl.className   = `ep-status ${stage.tone}`;
      section(
        row('Size',     `${e.width||2}×${e.height||2} tiles`),
        row('Heat',     'Inexhaustible', 'good'),
        row('Activity', act.text, act.tone),
        row('Potential', `${formatPower(baseW)} once drilled and turbined`, 'dim'),
        row('Weather',  wText, wTone),
        row('Yield now', `${formatPower(actW)} per turbine`, wTone === 'dim' ? '' : wTone),
      );
      section(
        row('Well',     well ? (well.powered ? `#${well._num || '—'}: powered` : `#${well._num || '—'}: unpowered`)
                             : 'None placed: 1 max',
                        well ? (well.powered ? 'good' : 'bad') : 'dim'),
        row('Steam',    well && well._flowing ? `${well._steamOutput || 0} units/s` : 'Not flowing',
                        well && well._flowing ? 'good' : 'dim'),
        row('Turbine',  turbine ? (turbine._generating ? 'Generating' : 'Placed, not generating')
                                : (well ? 'None on the well output port' : '—'),
                        turbine ? (turbine._generating ? 'good' : 'warn') : 'dim'),
        row('Producing', turbine && turbine._generating ? `${formatPower(turbine._currentOutput || 0)}` : `0 / ${formatPower(actW)}`,
                        turbine && turbine._generating ? 'good' : 'bad'),
      );
    }

    // ── Geothermal Well ──────────────────────────────────
    else if (e.type === T.GEOWELL) {
      const def     = EntityDefs[T.GEOWELL];
      const turbine = e._linkedTurbine;
      const dirs    = ['↑ North', '→ East', '↓ South', '← West'];
      titleEl.textContent  = `Geothermal Well${e._num ? ' #' + e._num : ''}`;
      titleEl.style.color  = '#ff9050';
      statusEl.textContent = !e.powered ? 'UNPOWERED' : turbine ? 'PRODUCING' : 'NO TURBINE';
      statusEl.className   = `ep-status ${e.powered && turbine ? 'good' : e.powered ? 'warn' : 'bad'}`;
      section(
        row('Steam Output', `${e._flowing ? (e._steamOutput || 0) : 0} / ${GeothermalSystem.getOutputPerTurbine()} units/s`, e._flowing ? 'good' : 'bad'),
        row('Activity',     `${GeothermalSystem.getActivityLabel().text} · ${GeothermalSystem.getBaseOutputPerTurbine()} units/s base`, GeothermalSystem.getActivityLabel().tone),
        row('Weather',      `${GeothermalSystem.getWeatherMult() >= 1 ? '+' : ''}${Math.round((GeothermalSystem.getWeatherMult()-1)*100)}% · ${Math.round(WeatherEventSystem.getTemperature())}°C`,
                            GeothermalSystem.getWeatherMult() > 1 ? 'good' : GeothermalSystem.getWeatherMult() < 1 ? 'warn' : 'dim'),
        row('Output Port',  dirs[e._rotation || 0], 'dim'),
        row('Turbine',      turbine ? 'Connected' : 'None: build over the output port', turbine ? 'good' : 'warn'),
        row('Power Draw',   `${formatPower(def.powerInput)}`),
      );
      section(row('Cost', formatMoney(def.cost)), row('Upkeep', `-$${def.upkeep}/s`, 'bad'));
    }

    // ── Geothermal Turbine ───────────────────────────────
    else if (e.type === T.GEOTURBINE) {
      const def  = EntityDefs[T.GEOTURBINE];
      const well = e._linkedWell;
      titleEl.textContent  = `Geothermal Turbine${e._num ? ' #' + e._num : ''}`;
      titleEl.style.color  = '#ffb070';
      statusEl.textContent = e._generating ? 'GENERATING' : !well ? 'NO WELL' : !e._hasPower ? 'NOT WIRED' : 'NO STEAM';
      statusEl.className   = `ep-status ${e._generating ? 'good' : 'bad'}`;
      section(
        row('Output',      `${e._generating ? (e._currentOutput || 0) : 0} / ${formatPower(GeothermalSystem.getOutputPerTurbine())}`, e._generating ? 'good' : 'bad'),
        row('Activity',    `${GeothermalSystem.getActivityLabel().text} · ${formatPower(GeothermalSystem.getBaseOutputPerTurbine())} base`, GeothermalSystem.getActivityLabel().tone),
        row('Weather',     `${GeothermalSystem.getWeatherMult() >= 1 ? '+' : ''}${Math.round((GeothermalSystem.getWeatherMult()-1)*100)}% · ${Math.round(WeatherEventSystem.getTemperature())}°C`,
                           GeothermalSystem.getWeatherMult() > 1 ? 'good' : GeothermalSystem.getWeatherMult() < 1 ? 'warn' : 'dim'),
        row('Steam Draw',  `${GeothermalSystem.getOutputPerTurbine()} units/s`),
        row('Well',        well ? 'Connected' : 'Not on a well output port', well ? 'good' : 'bad'),
        row('Well Power',  well ? (well.powered ? 'Powered' : 'Unpowered') : '—', well && well.powered ? 'good' : 'bad'),
        row('Grid Wire',   e._hasPower ? 'Connected' : 'None adjacent', e._hasPower ? 'good' : 'bad'),
      );
      section(row('Cost', formatMoney(def.cost)), row('Upkeep', `-$${def.upkeep}/s`, 'bad'));
    }

    // ── Oil Deposit ───────────────────────────────────────────────────
    else if (e.type === T.OILDEPOSIT) {
      const pct     = e._pressure !== undefined ? e._pressure : 1.0;
      const oilLeft = Math.round((e._totalUnits || 0) * pct);
      const jack    = [...EntityRegistry.getByType(T.PUMPJACK), ...EntityRegistry.getByType(T.PUMPJACK2)].find(p => p._linkedDeposit === e || (p._depositCol === e.col && p._depositRow === e.row));
      titleEl.textContent  = e._tierLabel || 'Oil Deposit';
      titleEl.style.color  = '#d0a030';
      statusEl.textContent = pct <= 0 ? 'EXHAUSTED' : jack ? (jack.powered ? 'BEING PUMPED' : 'PUMP UNPOWERED') : 'UNDRILLED';
      statusEl.className   = `ep-status ${pct <= 0 ? 'bad' : jack && jack.powered ? 'good' : 'neutral'}`;
      section(
        row('Oil Remaining',       `${oilLeft} units`, pct > 0.5 ? 'good' : pct > 0.2 ? '' : 'bad'),
        bar(pct, '#d0a030'),
        row('Reservoir Pressure',  `${Math.round(pct*100)}%`),
        row('Total Capacity',      `${Math.round(e._totalUnits||0)} units`),
        row('Size',                `${e.width||2}×${e.height||2} tiles`),
        row('Pump Jack',           jack ? `${EntityDefs[jack.type].label}: ${jack.powered ? 'active' : 'unpowered'}` : 'None placed', jack ? (jack.powered ? 'good' : 'warn') : 'dim'),
      );
    }

    // ── Uranium Deposit ───────────────────────────────────────────────
    else if (e.type === T.URANIUMDEPOSIT) {
      titleEl.textContent  = e._tierLabel || 'Uranium Deposit';
      titleEl.style.color  = '#60e060';
      statusEl.textContent = 'DISCOVERED';
      statusEl.className   = 'ep-status neutral';
      const uMine = Array.from(EntityRegistry.getByType(T.URANIUMMINE)).find(m => m._linkedDeposit === e || (m._depositCol === e.col && m._depositRow === e.row));
      section(
        row('Size',   `${e.width||2}×${e.height||2} tiles`),
        row('Status', uMine ? (uMine.powered ? 'Being mined' : 'Mine unpowered') : 'No mine placed', uMine && uMine.powered ? 'good' : 'dim'),
      );
    }

    // ── Sulfur Deposit ────────────────────────────────────────────────
    else if (e.type === T.SULFURDEPOSIT) {
      titleEl.textContent  = e._tierLabel || 'Sulfur Deposit';
      titleEl.style.color  = '#e8d040';
      statusEl.textContent = 'DISCOVERED';
      statusEl.className   = 'ep-status neutral';
      const sMine = SulfurSystem.allMines().find(m => m._linkedDeposit === e || (m._depositCol === e.col && m._depositRow === e.row));
      section(
        row('Size',   `${e.width||2}×${e.height||2} tiles`),
        row('Status', sMine ? (sMine.powered ? 'Being mined' : 'Mine unpowered') : 'No mine placed', sMine && sMine.powered ? 'good' : 'dim'),
      );
    }

    // ── Lithium Deposit ───────────────────────────────────────────────
    else if (e.type === T.LITHIUMDEPOSIT) {
      titleEl.textContent  = e._tierLabel || 'Lithium Deposit';
      titleEl.style.color  = '#a0e0ff';
      statusEl.textContent = 'DISCOVERED';
      statusEl.className   = 'ep-status neutral';
      const liMine = Array.from(EntityRegistry.getByType(T.LITHIUMMINE)).find(m => m._linkedDeposit === e || (m._depositCol === e.col && m._depositRow === e.row));
      section(
        row('Size',   `${e.width||2}×${e.height||2} tiles`),
        row('Status', liMine ? (liMine.powered ? 'Being mined' : 'Mine unpowered') : 'No mine placed', liMine && liMine.powered ? 'good' : 'dim'),
      );
    }

    // ── Rare Earth Deposit ────────────────────────────────────────────
    else if (e.type === T.RAREEARTHDEPOSIT) {
      titleEl.textContent  = e._tierLabel || 'Rare Earth Deposit';
      titleEl.style.color  = '#ff9a5a';
      statusEl.textContent = 'DISCOVERED';
      statusEl.className   = 'ep-status neutral';
      const reMine = Array.from(EntityRegistry.getByType(T.RAREEARTHMINE)).find(m => m._linkedDeposit === e || (m._depositCol === e.col && m._depositRow === e.row));
      const fPct = e._oreMax > 0 ? (e._oreAmount || 0) / e._oreMax : null;
      section(
        row('Size',   `${e.width||2}×${e.height||2} tiles`),
        row('Ore',    fPct === null ? 'Unmeasured' : `${Math.round(e._oreAmount)} units (${Math.round(fPct*100)}%)`),
        row('Status', reMine ? (reMine.powered ? 'Being mined' : 'Mine unpowered') : 'No mine placed', reMine && reMine.powered ? 'good' : 'dim'),
      );
    }

    // ── Helium Gas Field ──────────────────────────────────────────────
    else if (e.type === T.HELIUMDEPOSIT) {
      titleEl.textContent  = e._tierLabel || 'Helium Gas Field';
      titleEl.style.color  = '#f0b8ff';
      statusEl.textContent = 'DISCOVERED';
      statusEl.className   = 'ep-status neutral';
      const heWell = HeliumSystem.allWells().find(m => m._linkedDeposit === e || (m._depositCol === e.col && m._depositRow === e.row));
      const fPct = e._oreMax > 0 ? (e._oreAmount || 0) / e._oreMax : null;
      section(
        row('Size',     `${e.width||2}×${e.height||2} tiles`),
        row('Helium',   fPct === null ? 'Unmeasured' : `${Math.round(e._oreAmount)} units (${Math.round(fPct*100)}%)`),
        row('Status',   heWell ? (heWell.powered ? 'Being tapped' : 'Well unpowered') : 'No well placed', heWell && heWell.powered ? 'good' : 'dim'),
      );
    }

    // ── Helium Well ───────────────────────────────────────────────────
    else if (isHeliumWell(e)) {
      let dep = e._linkedDeposit;
      if (!dep && e._depositCol !== undefined) {
        for (const d of EntityRegistry.getByType(T.HELIUMDEPOSIT)) {
          if (d.col === e._depositCol && d.row === e._depositRow) { dep = d; e._linkedDeposit = d; break; }
        }
      }
      const def  = EntityDefs[e.type];
      const mk2  = e.type === T.HELIUMWELL2;
      const cap  = def.heliumCapacity || 1000;
      const dry  = dep && isDepositExhausted(dep);
      const full = !!e._bufferFull;
      const rate = HeliumSystem.wellRate(e);
      titleEl.textContent  = def.label;
      titleEl.style.color  = '#f0b8ff';
      statusEl.textContent = !dep ? 'NO GAS FIELD' : dry ? 'EXHAUSTED' : !e.powered ? 'UNPOWERED' : full ? 'BUFFER FULL' : 'EXTRACTING';
      statusEl.className   = `ep-status ${!dep || dry || !e.powered ? 'bad' : full ? 'warn' : 'good'}`;
      const hPct = dep && dep._oreMax > 0 ? (dep._oreAmount || 0) / dep._oreMax : null;
      const labels = ['→ E', '↓ S', '← W', '↑ N'];
      const active = e.powered && !dry && !full;
      section(
        row('Process',       'Helium-rich natural gas → Helium Gas', 'dim'),
        row('Helium Rate',   active ? `${rate} u/s` : '—', active ? 'good' : 'dim'),
        row('Gas Buffer',    `${Math.floor(e._helium || 0)} / ${cap} u`, full ? 'bad' : ''),
        ...(full ? [row('', 'Full: idle until a Cryo Plant draws it down', 'warn')] : []),
        row('HE OUT',        e._heliumPipeOut ? 'Piped' : 'No pipe', e._heliumPipeOut ? 'good' : 'bad'),
        row('Field Remaining', hPct === null ? 'Unmeasured'
                            : `${Math.round(dep._oreAmount)} units (${Math.max(hPct > 0 ? 1 : 0, Math.round(hPct*100))}%)`,
                              hPct === null ? '' : hPct > 0.5 ? 'good' : hPct > 0.2 ? '' : 'bad'),
        row('Total Extracted', `${Math.floor(HeliumSystem.getTotalExtracted())} units`),
        row('Power Draw',    `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Gas Field',     dep ? (dep._tierLabel || 'Helium Gas Field') : (e._depositTier || 'Not linked'), dep ? 'good' : 'bad'),
        row('Output Stub',   labels[(e._rotation || 0) % 4]),
        ...(mk2 ? [row('Field Drain', `${rate / (EntityDefs[T.HELIUMWELL].heliumPerSec || 2)}× an MK1 well's`, 'dim')] : []),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
      if (!mk2) section(Progression.isUnlocked(T.HELIUMWELL2)
        ? row('MK2', `Build a Helium Well MK2 over this well to replace it (${EntityDefs[T.HELIUMWELL2].heliumPerSec} u/s)`, 'dim')
        : row('MK2', 'Unlocks once an Advanced Fusion Reactor has run', 'dim'));
    }

    // ── Uranium Mine ──────────────────────────────────────────────────
    else if (e.type === T.URANIUMMINE) {
      // Defensive: if _linkedDeposit was lost, try to recover from saved coords
      let dep = e._linkedDeposit;
      if (!dep && e._depositCol !== undefined) {
        for (const d of EntityRegistry.getByType(T.URANIUMDEPOSIT)) {
          if (d.col === e._depositCol && d.row === e._depositRow) { dep = d; e._linkedDeposit = d; break; }
        }
      }
      if (!dep) {
        const ew = e.width || 4, eh = e.height || 5;
        outer: for (let dr = -1; dr <= eh; dr++) for (let dc = -1; dc <= ew; dc++) {
          const nb = GridManager.getEntity(e.col + dc, e.row + dr);
          if (nb && nb.type === T.URANIUMDEPOSIT) { dep = nb; e._linkedDeposit = nb; break outer; }
        }
      }
      titleEl.textContent  = 'Uranium Mine';
      titleEl.style.color  = '#60ff80';
      const uDry = dep && isDepositExhausted(dep);
      statusEl.textContent = !dep ? 'NO DEPOSIT' : uDry ? 'EXHAUSTED' : e.powered ? 'MINING' : 'UNPOWERED';
      statusEl.className   = `ep-status ${dep && !uDry && e.powered ? 'good' : 'bad'}`;
      const uPct = dep && dep._oreMax > 0 ? (dep._oreAmount || 0) / dep._oreMax : null;
      const depLabel = dep ? (dep._tierLabel || 'Uranium Deposit')
                           : (e._depositTier || 'Not linked');
      const depSize  = dep ? `${dep.width||2}×${dep.height||2} tiles`
                           : (e._depositWidth ? `${e._depositWidth}×${e._depositHeight} tiles` : '—');
      section(
        row('Uranium Rate', e.powered && !uDry ? `${ORE_MINE_RATE} units/s` : '—', e.powered && !uDry ? 'good' : 'dim'),
        supportsRow(row, uDry ? 0 : ORE_MINE_RATE, EntityDefs[T.FUELPLANT].uraniumPerSec, EntityDefs[T.FUELPLANT].label || 'Fuel Plant', 'units/s'),
        ...deliveryRows(e, row, 'nothing: belt it to a Fuel Plant or a Storage Container'),
        row('Ore Remaining', uPct === null ? 'Unmeasured'
                           : `${Math.round(dep._oreAmount)} units (${Math.max(uPct > 0 ? 1 : 0, Math.round(uPct*100))}%)`,
                             uPct === null ? '' : uPct > 0.5 ? 'good' : uPct > 0.2 ? '' : 'bad'),
        row('Ore Buffer',   `${Math.floor(e._uraniumStored || 0)} / ${MINE_BUFFER_CAP} units`, e._bufferFull ? 'bad' : ''),
        row('Power Draw',   `${formatPower(e.def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Status',       e.powered ? 'Powered' : 'NEEDS POWER', e.powered ? 'good' : 'bad'),
        row('Deposit',      depLabel, dep ? 'good' : 'bad'),
        row('Deposit Size', depSize),
        row('Footprint',    `${e.width||4}×${e.height||5} tiles`),
        row('Output Stub',  `${((e._rotation || 0) % 2) === 0 ? '↘ Bottom right' : '↙ Bottom left'}: R to flip`),
      );
      section(row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'), row('Cost', formatMoney(e.def.cost)));
    }

    // ── Rare Earth Mine ───────────────────────────────────────────────
    else if (e.type === T.RAREEARTHMINE) {
      let dep = e._linkedDeposit;
      if (!dep && e._depositCol !== undefined) {
        for (const d of EntityRegistry.getByType(T.RAREEARTHDEPOSIT)) {
          if (d.col === e._depositCol && d.row === e._depositRow) { dep = d; e._linkedDeposit = d; break; }
        }
      }
      titleEl.textContent  = 'Rare Earth Mine';
      titleEl.style.color  = '#ff9a5a';
      const reDry  = dep && isDepositExhausted(dep);
      const reFull = !!e._bufferFull;
      statusEl.textContent = !dep ? 'NO DEPOSIT' : reDry ? 'EXHAUSTED' : !e.powered ? 'UNPOWERED' : reFull ? 'BUFFER FULL' : 'MINING';
      statusEl.className   = `ep-status ${!dep || reDry || !e.powered ? 'bad' : reFull ? 'warn' : 'good'}`;
      const rePct = dep && dep._oreMax > 0 ? (dep._oreAmount || 0) / dep._oreMax : null;
      const reActive = e.powered && !reDry;
      section(
        row('Process',       'Monazite sand → Rare Earth Ore', 'dim'),
        row('Ore Rate',      reActive ? `${ORE_MINE_RATE} units/s` : '—', reActive ? 'good' : 'dim'),
        supportsRow(row, reDry ? 0 : ORE_MINE_RATE, EntityDefs[T.LEACHPLANT].orePerSec, EntityDefs[T.LEACHPLANT].label, 'units/s'),
        ...deliveryRows(e, row, 'nothing: belt it to a Leach Plant or a Storage Container'),
        row('Ore Buffer',    `${Math.floor(e._rareEarthStored || 0)} / ${MINE_BUFFER_CAP}`, reFull ? 'warn' : ''),
        row('Ore Remaining', rePct === null ? 'Unmeasured'
                           : `${Math.round(dep._oreAmount)} units (${Math.max(rePct > 0 ? 1 : 0, Math.round(rePct*100))}%)`,
                             rePct === null ? '' : rePct > 0.5 ? 'good' : rePct > 0.2 ? '' : 'bad'),
        row('Total Mined',   `${Math.floor(RareEarthSystem.getTotalMined())} units`),
        row('Power Draw',    `${formatPower(e.def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Deposit',       dep ? (dep._tierLabel || 'Rare Earth Deposit') : (e._depositTier || 'Not linked'), dep ? 'good' : 'bad'),
        row('Output Stub',   `${((e._rotation || 0) % 2) === 0 ? '↘ Bottom right' : '↙ Bottom left'}: R to flip`),
      );
      section(row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'), row('Cost', formatMoney(e.def.cost)));
    }

    // ── Sulfur Mine ───────────────────────────────────────────────────
    else if (isSulfurMine(e)) {
      const sMk2 = e.type === T.SULFURMINE2, sRate = SulfurSystem.mineRate(e);
      let dep = e._linkedDeposit;
      if (!dep && e._depositCol !== undefined) {
        for (const d of EntityRegistry.getByType(T.SULFURDEPOSIT)) {
          if (d.col === e._depositCol && d.row === e._depositRow) { dep = d; e._linkedDeposit = d; break; }
        }
      }
      if (!dep) {
        const ew = e.width || 4, eh = e.height || 5;
        outer: for (let dr = -1; dr <= eh; dr++) for (let dc = -1; dc <= ew; dc++) {
          const nb = GridManager.getEntity(e.col + dc, e.row + dr);
          if (nb && nb.type === T.SULFURDEPOSIT) { dep = nb; e._linkedDeposit = nb; break outer; }
        }
      }
      titleEl.textContent  = sMk2 ? 'Sulfur Mine MK2' : 'Sulfur Mine';
      titleEl.style.color  = '#e8d040';
      const sDry = dep && isDepositExhausted(dep);
      statusEl.textContent = !dep ? 'NO DEPOSIT' : sDry ? 'EXHAUSTED' : e.powered ? 'MINING' : 'UNPOWERED';
      statusEl.className   = `ep-status ${dep && !sDry && e.powered ? 'good' : 'bad'}`;
      const sPct = dep && dep._oreMax > 0 ? (dep._oreAmount || 0) / dep._oreMax : null;
      const depLabel = dep ? (dep._tierLabel || 'Sulfur Deposit')
                           : (e._depositTier || 'Not linked');
      const depSize  = dep ? `${dep.width||2}×${dep.height||2} tiles`
                           : (e._depositWidth ? `${e._depositWidth}×${e._depositHeight} tiles` : '—');
      section(
        row('Sulfur Rate',  e.powered && !sDry ? `${sRate} units/s` : '—', e.powered && !sDry ? 'good' : 'dim'),
        supportsRow(row, sDry ? 0 : sRate, EntityDefs[T.CHEMICALPLANT].sulfurPerSec, EntityDefs[T.CHEMICALPLANT].label || 'Chemical Plant', 'units/s'),
        ...deliveryRows(e, row, 'nothing: belt it to a Chemical Plant or a Storage Container'),
        row('Ore Remaining', sPct === null ? 'Unmeasured'
                           : `${Math.round(dep._oreAmount)} units (${Math.max(sPct > 0 ? 1 : 0, Math.round(sPct*100))}%)`,
                             sPct === null ? '' : sPct > 0.5 ? 'good' : sPct > 0.2 ? '' : 'bad'),
        row('Ore Buffer',   `${Math.floor(e._sulfurStored || 0)} / ${MINE_BUFFER_CAP} units`, e._bufferFull ? 'bad' : ''),
        row('Power Draw',   `${formatPower(e.def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Status',       e.powered ? 'Powered' : 'NEEDS POWER', e.powered ? 'good' : 'bad'),
        row('Deposit',      depLabel, dep ? 'good' : 'bad'),
        row('Deposit Size', depSize),
        row('Footprint',    `${e.width||4}×${e.height||5} tiles`),
      );
      if (!sMk2 && Progression.isUnlocked(T.SULFURMINE2))
        section(row('MK2', `Build a Sulfur Mine MK2 over this mine to replace it (${EntityDefs[T.SULFURMINE2].sulfurPerSec} u/s)`, 'dim'));
      section(row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'), row('Cost', formatMoney(e.def.cost)));
    }

    // ── Lithium Mine ─────────────────────────────────────────────────
    else if (e.type === T.LITHIUMMINE) {
      let dep = e._linkedDeposit;
      if (!dep && e._depositCol !== undefined) {
        for (const d of EntityRegistry.getByType(T.LITHIUMDEPOSIT)) {
          if (d.col === e._depositCol && d.row === e._depositRow) { dep = d; e._linkedDeposit = d; break; }
        }
      }
      if (!dep) {
        const ew = e.width || 4, eh = e.height || 5;
        outer: for (let dr = -1; dr <= eh; dr++) for (let dc = -1; dc <= ew; dc++) {
          const nb = GridManager.getEntity(e.col + dc, e.row + dr);
          if (nb && nb.type === T.LITHIUMDEPOSIT) { dep = nb; e._linkedDeposit = nb; break outer; }
        }
      }
      titleEl.textContent  = 'Lithium Mine';
      titleEl.style.color  = '#a0e0ff';
      const lDry = dep && isDepositExhausted(dep);
      statusEl.textContent = !dep ? 'NO DEPOSIT' : lDry ? 'EXHAUSTED' : !e.powered ? 'UNPOWERED' : e._bufferFull ? 'BUFFER FULL' : 'MINING';
      statusEl.className   = `ep-status ${!dep || lDry || !e.powered ? 'bad' : e._bufferFull ? 'warn' : 'good'}`;
      const lPct = dep && dep._oreMax > 0 ? (dep._oreAmount || 0) / dep._oreMax : null;
      const depLabel = dep ? (dep._tierLabel || 'Lithium Deposit')
                           : (e._depositTier || 'Not linked');
      const depSize  = dep ? `${dep.width||2}×${dep.height||2} tiles`
                           : (e._depositWidth ? `${e._depositWidth}×${e._depositHeight} tiles` : '—');
      section(
        row('Lithium Rate', e.powered && !lDry && !e._bufferFull ? `${LITHIUM_MINE_RATE} units/s` : '—', e.powered && !lDry && !e._bufferFull ? 'good' : 'dim'),
        supportsRow(row, lDry ? 0 : LITHIUM_MINE_RATE, EntityDefs[T.LITHIUMPROCESSPLANT].orePerSec, EntityDefs[T.LITHIUMPROCESSPLANT].label || 'Lithium Processing Plant', 'units/s'),
        ...deliveryRows(e, row, 'nothing: belt it to a Lithium Processing Plant or a Storage Container'),
        row('Ore Buffer',   `${Math.floor(e._lithiumStored || 0)} / ${MINE_BUFFER_CAP} units`, e._bufferFull ? 'bad' : ''),
        ...(e._bufferFull ? [row('', 'Full: stopped mining until a Lithium Process Plant draws it down', 'warn')] : []),
        row('Ore Remaining', lPct === null ? 'Unmeasured'
                           : `${Math.round(dep._oreAmount)} units (${Math.max(lPct > 0 ? 1 : 0, Math.round(lPct*100))}%)`,
                             lPct === null ? '' : lPct > 0.5 ? 'good' : lPct > 0.2 ? '' : 'bad'),
        row('Total Mined',  `${Math.floor(LithiumSystem.getTotalMined())} units`),
        row('Power Draw',   `${formatPower(e.def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Status',       e.powered ? 'Powered' : 'NEEDS POWER', e.powered ? 'good' : 'bad'),
        row('Deposit',      depLabel, dep ? 'good' : 'bad'),
        row('Deposit Size', depSize),
        row('Footprint',    `${e.width||4}×${e.height||5} tiles`),
      );
      section(row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'), row('Cost', formatMoney(e.def.cost)));
    }

    // ── Lithium Processing Plant ────────────────────────────────────────
    else if (e.type === T.LITHIUMPROCESSPLANT) {
      const def       = EntityDefs[T.LITHIUMPROCESSPLANT];
      const compound  = e._compound || 0;
      const cap       = def.compoundCapacity || 300;
      const cpdPct    = Math.round((compound / cap) * 100);
      const hasOre    = !!e._oreConveyor;
      const hasWater  = !!e._waterConnected;
      // Full, and waiting for the buffer to fall to the restart level
      // (LithiumProcessPlantSystem.outputFull).
      const holding   = !!e._compoundHold;
      const active    = e.powered && hasOre && hasWater && !holding;
      const resumeAt  = Math.round((def.compoundResumeFrac ?? 0.5) * 100);
      const status    = !e.powered ? 'UNPOWERED' : !hasOre ? 'NO ORE' : e._waterShort ? 'LOW WATER' : !hasWater ? 'NO WATER'
                      : holding ? (cpdPct >= 99 ? 'BUFFER FULL' : 'STANDBY') : 'PROCESSING';
      const stClass   = active ? 'good' : holding && e.powered && hasOre && hasWater ? 'neutral' : 'bad';
      titleEl.textContent  = 'Lithium Processing Plant';
      titleEl.style.color  = '#c0a0ff';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      section(
        row('Process',         'Lithium Ore + Water → Lithium Compound', 'dim'),
        intake('Ore Intake',      hasOre, def.orePerSec,    hasOre   ? 'good' : 'bad'),
        stored('Ore in Storage', LithiumProcessPlantSystem.getStubs(e).oreIn, 'lithium'),
        e._waterShort ? row('Water Intake', `0 / ${def.waterPerSec} u/s: network out of water`, 'bad')
                      : intake('Water Intake',    active, def.waterPerSec,    hasWater ? 'good' : 'bad'),
        stored('Water in Storage', LithiumProcessPlantSystem.getStubs(e).waterIn, 'water'),
        row('Compound Output', active ? `${def.compoundPerSec} u/s` : '—', active   ? 'good' : 'dim'),
        row('Compound Buffer', `${Math.floor(compound)} / ${cap} u`, cpdPct > 90 ? 'bad' : cpdPct > 50 ? 'neutral' : 'good'),
        ...(holding ? [row('Restarts at', `${resumeAt}% (${Math.round(cap * resumeAt / 100)} u)`, 'dim')] : []),
        row('Power Draw',      `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',       `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Spent Fuel Pool ───────────────────────────────────────────────
    else if (e.type === T.SPENTFUELPOOL) {
      const def     = EntityDefs[T.SPENTFUELPOOL];
      const cap     = def.spentFuelCapacity || 400;
      const cooling = e._cooling || 0;
      const ready   = e._ready   || 0;
      const held    = cooling + ready;
      const pct     = Math.round((held / cap) * 100);
      const linked  = !!e._outLinked;
      const inFlow  = (e._intakeThisTick || 0) > 0;
      const status  = !e.powered ? 'UNPOWERED' : pct >= 99 ? 'POOL FULL'
                    : inFlow ? 'RECEIVING' : ready > 0 ? 'READY' : cooling > 0 ? 'COOLING' : 'EMPTY';
      const stClass = !e.powered || pct >= 99 ? 'bad' : ready > 0 ? 'good' : 'neutral';
      // Seconds until the oldest batch clears the cooling clock.
      const nextIn  = e._nextReadyIn;
      titleEl.textContent  = 'Spent Fuel Pool';
      titleEl.style.color  = '#6ec8ff';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      section(
        row('Purpose',      'Buffers spent fuel between reactor and reprocessing', 'dim'),
        row('Held',         `${held.toFixed(1)} / ${cap} u (${pct}%)`, pct > 90 ? 'bad' : pct > 60 ? 'neutral' : 'good'),
        row('Cooled: ready', `${ready.toFixed(1)} u`, ready > 0 ? 'good' : 'dim'),
        row('Still cooling',  `${cooling.toFixed(1)} u`, cooling > 0 ? 'neutral' : 'dim'),
        row('Next ready in',  nextIn === null || nextIn === undefined ? '—' : `${Math.ceil(nextIn)}s`, 'dim'),
        row('Intake',       `up to ${def.intakeRate} u/s${e.powered ? '' : ': stopped, no power'}`, e.powered ? 'good' : 'bad'),
        row('Discharge',    linked ? `up to ${def.outRate} u/s` : 'no belt out', linked ? 'good' : 'bad'),
        row('Power Draw',   `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',    `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(
        // Stated rather than implied: real pools cool fuel for years.
        row('Cooling time', `${def.coolSeconds}s per batch (gameplay-scaled)`, 'dim'),
        row('Without power', 'Stock stays safe; cooling and intake stop', 'dim'),
        row('Removal',      'Must be emptied down a belt first', 'dim'),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Reprocessing Plant ────────────────────────────────────────────
    else if (e.type === T.DRONECHARGER) {
      const def = EntityDefs[T.DRONECHARGER], pdef = EntityDefs[T.DRONEPORT];
      const DS = typeof DroneSystem !== 'undefined' ? DroneSystem : null;
      const pads = DS ? DS.chargerPads(e) : [];
      const charging = pads.filter(d => d && d._chargingAt === e).length, inbound = pads.filter(d => d && d._chargingAt !== e).length;
      const net = DS ? DS.networkOf(e).squares : [];
      const ports = net.filter(q => q.port.type === T.DRONEPORT).length;
      const draw = e._activePowerInput !== undefined ? e._activePowerInput : def.powerInput;
      titleEl.textContent  = 'Drone Charging Port';
      titleEl.style.color  = '#7df0a4';
      statusEl.textContent = !e.powered ? 'UNPOWERED' : !ports ? 'NO DRONE PORT IN NETWORK' : charging ? `CHARGING ${charging}` : 'STANDING BY';
      statusEl.className   = `ep-status ${!e.powered || !ports ? 'bad' : charging ? 'good' : 'neutral'}`;
      section(
        row('Pads',       `${charging} charging · ${inbound} inbound · ${def.pads - charging - inbound} free`, charging ? 'good' : 'dim'),
        row('Coverage',   `${def.radius * 2}×${def.radius * 2} tile square` + (net.length > 1 ? ` · network of ${ports} port${ports === 1 ? '' : 's'}, ${net.length - ports} charging` : ''), 'dim'),
        row('Charge',     `${pdef.rechargeSecs}s from empty · ${def.pads} drones at once`, 'dim'),
        row('Power Draw', `${formatPower(Math.round(draw))} (${def.powerInput} base` + ((e._chargeDraw || 0) >= 0.5 ? ` + ${Math.round(e._chargeDraw)} charging)` : ')'), e.powered ? 'good' : 'bad'),
        row('Footprint',  `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(
        row('Role',   'Extends a drone network and recharges drones passing through', 'dim'),
        row('Fleet',  'None of its own: the drones come from Drone Ports in the same network', 'dim'),
        ...(!ports ? [row('Warning', 'Its square touches no Drone Port’s coverage, so no drone can reach it', 'bad')] : []),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    else if (e.type === T.DRONEPORT) {
      const def = EntityDefs[T.DRONEPORT];
      const st  = (typeof DroneSystem !== 'undefined') ? DroneSystem.status(e)
                : { total: 0, out: 0, charging: 0, idle: 0, avgBattery: 0 };
      // A storm only slows the fleet (DroneSystem.slowedBy).
      const wx = (typeof DroneSystem !== 'undefined') ? DroneSystem.slowedBy() : null;
      const status = !e.powered ? 'UNPOWERED'
                   : st.out > 0 ? `${st.out} IN FLIGHT${wx ? ` · SLOWED: ${wx.name.toUpperCase()}` : ''}` : 'STANDING BY';
      const stClass = !e.powered ? 'bad' : st.out > 0 ? (wx ? 'neutral' : 'good') : 'neutral';
      const draw = e._activePowerInput !== undefined ? e._activePowerInput : def.powerInput;
      titleEl.textContent  = (typeof DroneFleetPanel !== 'undefined') ? DroneFleetPanel.label(e) : 'Drone Port';
      titleEl.style.color  = '#5ad8ff';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      section(
        row('Fleet',        `${st.idle} on pad · ${st.out} in flight`, st.out > 0 ? 'good' : 'dim'),
        row('Tasking',      st.out > 0 ? [`${st.repairing} repair`, `${st.servicing} line`, `${st.hauling} waste`, `${st.cargo || 0} cargo`,
                                          ...(st.cores ? [`${st.cores} core`] : []), ...(st.returning ? [`${st.returning} returning`] : [])].join(' · ') : '—',
                            st.out > 0 ? 'neutral' : 'dim'),
        row('Charging',     (() => {
          const v = e._visitingChargers || 0;
          if (!st.charging && !v) return '—';
          const own = st.charging ? `${st.charging} on pad` : '';
          const vis = v ? `${v} passing through` : '';
          return [own, vis].filter(Boolean).join(' · ');
        })(), (st.charging || e._visitingChargers) ? 'neutral' : 'dim'),
        row('Avg Battery',  `${Math.round(st.avgBattery * 100)}%`, st.avgBattery < 0.35 ? 'bad' : st.avgBattery < 0.7 ? 'neutral' : 'good'),
        row('Coverage',     (() => {
          // Ports whose squares touch share one network; say so, because it
          // is the network, not this port's square, that its drones work.
          const sq = (typeof DroneSystem !== 'undefined') ? DroneSystem.networkOf(e).squares : [e];
          const n = sq.filter(q => !q.port || q.port.type === T.DRONEPORT).length, ch = sq.length - n;
          return `${def.radius * 2}×${def.radius * 2} tile square` + (sq.length > 1 ? ` · network of ${n} port${n === 1 ? '' : 's'}` + (ch ? `, ${ch} charging` : '') : '');
        })(), 'dim'),
        row('Cruise Speed', `${def.speed} px/s: flies direct, no roads`, 'dim'),
        row('Endurance',    `${def.battery}s airborne · ${def.rechargeSecs}s to recharge`, 'dim'),
        row('Power Draw',   (() => {
          // The breakdown only lists what is actually drawing right now.
          const parts = [`${def.powerInput} base`];
          if ((e._chargeDraw || 0) >= 0.5) parts.push(`${Math.round(e._chargeDraw)} charging`);
          if (st.out > 0) parts.push(`${st.out * def.flightDraw} telemetry`);
          if ((e._hotRuns || 0) > 0) parts.push(`${e._hotRuns * def.hotFlightDraw} shielded`);
          return `${formatPower(Math.round(draw))} (${parts.join(' + ')})`;
        })(), e.powered ? 'good' : 'bad'),
        row('Footprint',    `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(
        row('Jobs',        'Repairs damage · services loaded lines · shaves waste buffers', 'dim'),
        row('Line Service', 'Thermal sweep + insulator wash on lines at 80-100% load', 'dim'),
        row('Not A Fix',    'Cuts the fault roll only; a line over its rating still burns. Surge Protectors raise the rating', 'dim'),
        row('Waste Band',  'Flies a source at 85% full, stands off below 70%', 'dim'),
        row('Payload',     `${def.wastePayload} units · ${def.wastePayloadHot} shielded (truck: 100)`, 'dim'),
        row('In Transit',  (st.reserved || 0) > 0 ? `${st.reserved.toFixed(0)} units reserved` : '—',
                           (st.reserved || 0) > 0 ? 'neutral' : 'dim'),
        row('Limits',      'Waste facility must be in range too; long haul stays a truck job', 'dim'),
        row('Cargo',       `Supplies vessels flagged "Drone Supply" · ${def.cargoPayloadSolid} solid / ${def.cargoPayloadLiquid} liquid / ${def.cargoPayloadGas} gas per sortie · max ${def.cargoMaxConcurrent} at once`, 'dim'),
        row('Delivered',   (st.delivered || 0) > 0 ? `${Math.round(st.delivered).toLocaleString()} units` : '—', (st.delivered || 0) > 0 ? 'good' : 'dim'),
        ...(wx ? [row('Weather', st.out > 0 ? `${wx.name}: no new launches; the ${st.out} out finish their jobs and land`
                                            : `${wx.name}: the fleet flies once it clears`, 'neutral')]
           : DroneSystem.weatherEffect() ? [row('Weather', DroneSystem.weatherEffect().note, 'neutral')] : []),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    else if (e.type === T.MOXPLANT) {
      const def     = EntityDefs[T.MOXPLANT];
      const mox     = e._mox || 0, moxCap = def.moxCapacity || 300;
      const moxPct  = Math.round((mox / moxCap) * 100);
      const hasPlut = !!e._hasPlutonium;
      const hasUran = !!e._hasUranium;
      const active  = !!e._running;
      // `_shortOn` names whichever intake is throttling the line, so a plant
      // that is running but slow says why instead of just looking fine.
      const status  = !e.powered ? 'UNPOWERED' : e._blockedBy ? 'ROD BUFFER FULL'
                    : !hasPlut ? 'NO PLUTONIUM' : !hasUran ? 'NO URANIUM'
                    : active ? (e._shortOn ? `LOW ${e._shortOn.toUpperCase()}` : 'FABRICATING') : 'IDLE';
      const stClass = active ? 'good' : e.powered && !e._blockedBy ? 'neutral' : 'bad';
      titleEl.textContent  = 'Advanced Fuel Processing';
      titleEl.style.color  = '#ff9060';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      section(
        row('Process',           'Plutonium + Uranium → MOX Fuel Rods', 'dim'),
        intake('Plutonium Intake',  hasPlut, (def.moxPerSec * def.plutoniumPerUnit).toFixed(3), hasPlut ? 'good' : 'bad'),
        stored('Plutonium in Storage', MoxPlantSystem.getStubs(e).plutoniumIn, 'plutonium'),
        intake('Uranium Intake',    hasUran, (def.moxPerSec * def.uraniumPerUnit).toFixed(3), hasUran ? 'good' : 'bad'),
        stored('Uranium in Storage', MoxPlantSystem.getStubs(e).uraniumIn, 'uranium', 'recovered'),
        row('Uranium Source',    'Recovered first, then mined ore', 'dim'),
        row('MOX Output',        active ? `${def.moxPerSec} rods/s` : '—', active ? 'good' : 'dim'),
        row('MOX Buffer',        `${mox.toFixed(1)} / ${moxCap} rods`, moxPct > 90 ? 'bad' : moxPct > 50 ? 'neutral' : 'good'),
        row('Power Draw',        `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',         `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(
        // 10% is the top of the real MOX range (5–10% Pu by mass); the rest
        // is the fertile uranium matrix, which is why ore substitutes freely.
        row('Blend',    `${Math.round(def.plutoniumPerUnit * 100)}% plutonium / ${Math.round(def.uraniumPerUnit * 100)}% uranium`, 'dim'),
        row('Process',  'Dry powder metallurgy: no water needed', 'dim'),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    else if (e.type === T.REPROCESSOR) {
      const def      = EntityDefs[T.REPROCESSOR];
      const plut     = e._plutonium || 0, plutCap  = def.plutoniumCapacity || 100;
      const recov    = e._recovered || 0, recovCap = def.recoveredCapacity || 200;
      const hlw      = e._hlw       || 0, hlwCap   = def.hlwCapacity       || 100;
      const plutPct  = Math.round((plut  / plutCap)  * 100);
      const recovPct = Math.round((recov / recovCap) * 100);
      const hlwPct   = Math.round((hlw   / hlwCap)   * 100);
      const hasSpent = !!e._hasSpentFuel;
      const hasWater = !!e._waterConnected;
      const active   = !!e._running;
      // `_blockedBy` is set by ReprocessingSystem when a full output buffer
      // stopped the plant — naming it here is the difference between the
      // player seeing "it's jammed" and seeing WHICH tank jammed it.
      const status   = !e.powered ? 'UNPOWERED' : e._blockedBy ? `${e._blockedBy.toUpperCase()} FULL`
                     : e._waitingOnCooling ? 'FUEL COOLING'
                     : e._reactorDirect ? 'NEEDS A SPENT FUEL POOL'
                     : !hasSpent ? 'NO SPENT FUEL' : !hasWater ? 'NO WATER'
                     : active ? 'REPROCESSING' : 'IDLE';
      const stClass  = active ? 'good' : e.powered && !e._blockedBy ? 'neutral' : 'bad';
      const rate     = def.spentFuelPerSec;
      titleEl.textContent  = 'Reprocessing Plant';
      titleEl.style.color  = '#b070ff';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      section(
        row('Process',          'Spent Fuel + Water → Plutonium + Recovered Uranium', 'dim'),
        intake('Spent Fuel Intake', hasSpent, rate, hasSpent ? 'good' : 'bad'),
        // Only cooled fuel out of a pool is accepted; say so plainly when
        // the belt runs straight from a reactor.
        e._reactorDirect ? row('Feed', 'Belted straight from a reactor: put a Spent Fuel Pool in the line, IN from the reactor and COOLED FUEL OUT to here', 'bad')
                         : row('Feed', 'Cooled spent fuel from a Spent Fuel Pool', 'dim'),
        stored('Spent Fuel in Storage', ReprocessingSystem.getStubs(e).spentIn, 'spent'),
        intake('Water Intake',      active, def.waterPerSec, hasWater ? 'good' : 'bad'),
        stored('Water in Storage', ReprocessingSystem.getStubs(e).waterIn, 'water'),
        row('Plutonium Out',     active ? `${(rate * def.plutoniumPerUnit).toFixed(3)} u/s` : '—', active ? 'good' : 'dim'),
        row('Recovered U Out',   active ? `${(rate * def.recoveredPerUnit).toFixed(3)} u/s` : '—', active ? 'good' : 'dim'),
        row('Plutonium Buffer',  `${plut.toFixed(1)} / ${plutCap} u`,   plutPct  > 90 ? 'bad' : plutPct  > 50 ? 'neutral' : 'good'),
        row('Recovered U Buffer',`${recov.toFixed(1)} / ${recovCap} u`, recovPct > 90 ? 'bad' : recovPct > 50 ? 'neutral' : 'good'),
        row('Power Draw',        `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',         `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(
        row('High-Level Waste', `${hlw.toFixed(1)} / ${hlwCap} u (${hlwPct}%)`, hlwPct > 90 ? 'bad' : hlwPct > 50 ? 'neutral' : 'good'),
        row('Disposal',         'Waste Truck to Nuclear Waste Facility', 'dim'),
        // 0.6 + 0.15 + 0.1 = 0.85. The 15% that is missing is fission
        // products, and is why the plutonium chain can never feed itself.
        row('Mass Balance',     '15% lost as fission products', 'dim'),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Chemical Plant ────────────────────────────────────────────────
    else if (e.type === T.CHEMICALPLANT) {
      const def      = EntityDefs[T.CHEMICALPLANT];
      const acid     = e._acid || 0;
      const cap      = def.acidCapacity || 300;
      const acidPct  = Math.round((acid / cap) * 100);
      const hasSulfur = !!e._sulfurConveyor;
      const hasWater  = !!e._waterConnected;
      const active    = e.powered && hasSulfur && hasWater;
      const status    = !e.powered ? 'UNPOWERED' : !hasSulfur ? 'NO SULFUR' : !hasWater ? 'NO WATER' : acidPct >= 99 ? 'BUFFER FULL' : 'PRODUCING';
      const stClass   = active && acidPct < 99 ? 'good' : active ? 'neutral' : 'bad';
      titleEl.textContent  = 'Chemical Plant';
      titleEl.style.color  = '#40e0c0';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      section(
        row('Process',       'Sulfur + Water → Sulfuric Acid', 'dim'),
        intake('Sulfur Intake', active, def.sulfurPerSec, hasSulfur ? 'good' : 'bad'),
        stored('Sulfur in Storage', ChemicalSystem.getStubs(e).convStubs[0], 'sulfur'),
        intake('Water Intake',  active, def.waterPerSec, hasWater  ? 'good' : 'bad'),
        stored('Water in Storage', ChemicalSystem.getStubs(e).pipeStubs[0], 'water'),
        row('Acid Output',   active ? `${def.acidPerSec} u/s` : '—',  active    ? 'good' : 'dim'),
        row('Acid Buffer',   `${Math.floor(acid)} / ${cap} u`, acidPct > 90 ? 'bad' : acidPct > 50 ? 'neutral' : 'good'),
        row('Power Draw',    `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',     `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
      _pollutionSection(e);
    }


    // ── Electrolyzer ───────────────────────────────────────────────────
    else if (e.type === T.ELECTROLYZER) {
      const def       = EntityDefs[T.ELECTROLYZER];
      const hydrogen  = e._hydrogen || 0;
      const cap       = def.hydrogenCapacity || 300;
      const h2Pct     = Math.round((hydrogen / cap) * 100);
      const hasWater  = !!e._waterConnected;
      const active    = e.powered && hasWater;
      const status    = !e.powered ? 'UNPOWERED' : !hasWater ? 'NO WATER' : h2Pct >= 99 ? 'BUFFER FULL' : 'SPLITTING';
      const stClass   = active && h2Pct < 99 ? 'good' : active ? 'neutral' : 'bad';
      titleEl.textContent  = 'Electrolyzer';
      titleEl.style.color  = '#40c0ff';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      section(
        row('Process',        'Water → Hydrogen Gas', 'dim'),
        intake('Water Intake',   active, def.waterPerSec, hasWater ? 'good' : 'bad'),
        stored('Water in Storage', ElectrolyzerSystem.getStubs(e).waterStub, 'water'),
        row('Hydrogen Output', active ? `${def.hydrogenPerSec} u/s` : '—', active ? 'good' : 'dim'),
        row('Hydrogen Buffer', `${Math.floor(hydrogen)} / ${cap} u`, h2Pct > 90 ? 'bad' : h2Pct > 50 ? 'neutral' : 'good'),
        row('Power Draw',     `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',      `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Atmosphere Collector ────────────────────────────────────────────
    else if (e.type === T.ATMOSCOLLECTOR) {
      const def      = EntityDefs[T.ATMOSCOLLECTOR];
      const nitrogen = e._nitrogen || 0;
      const cap      = def.nitrogenCapacity || 3000;
      const n2Pct    = Math.round((nitrogen / cap) * 100);
      const active   = e.powered;
      const status   = !e.powered ? 'UNPOWERED' : n2Pct >= 99 ? 'BUFFER FULL' : 'COLLECTING';
      const stClass  = active && n2Pct < 99 ? 'good' : active ? 'neutral' : 'bad';
      titleEl.textContent  = 'Atmosphere Collector';
      titleEl.style.color  = '#a0e0ff';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      section(
        row('Process',          'Air → Nitrogen Gas', 'dim'),
        row('Nitrogen Output',  active ? `${def.nitrogenPerSec} u/s` : '—', active ? 'good' : 'dim'),
        row('Nitrogen Buffer',  `${Math.floor(nitrogen)} / ${cap} u`, n2Pct > 90 ? 'bad' : n2Pct > 50 ? 'neutral' : 'good'),
        row('Power Draw',       `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',        `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Haber-Bosch Complex ─────────────────────────────────────────────
    else if (e.type === T.HABERBOSCH) {
      const def       = EntityDefs[T.HABERBOSCH];
      const ammonia   = e._ammonia || 0;
      const cap       = def.ammoniaCapacity || 3000;
      const nh3Pct    = Math.round((ammonia / cap) * 100);
      const hasN2     = !!e._hasNitrogen;
      const hasH2     = !!e._hasHydrogen;
      const active    = e.powered && hasN2 && hasH2;
      const status    = !e.powered ? 'UNPOWERED' : !hasN2 ? 'NO NITROGEN' : !hasH2 ? 'NO HYDROGEN' : nh3Pct >= 99 ? 'BUFFER FULL' : 'SYNTHESIZING';
      const stClass   = active && nh3Pct < 99 ? 'good' : active ? 'neutral' : 'bad';
      titleEl.textContent  = 'Haber-Bosch Complex';
      titleEl.style.color  = '#40e070';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      section(
        row('Process',          'Nitrogen + Hydrogen → Ammonia Gas', 'dim'),
        intake('Nitrogen Intake',  active, def.nitrogenPerSec, hasN2 ? 'good' : 'bad'),
        stored('Nitrogen in Storage', HaberBoschSystem.getStubs(e).nitrogenIn, 'nitrogen'),
        intake('Hydrogen Intake',  active, def.hydrogenPerSec, hasH2 ? 'good' : 'bad'),
        stored('Hydrogen in Storage', HaberBoschSystem.getStubs(e).hydrogenIn, 'hydrogen'),
        row('Ammonia Output',   active ? `${def.ammoniaPerSec} u/s` : '—',  active ? 'good' : 'dim'),
        row('Ammonia Buffer',   `${Math.floor(ammonia)} / ${cap} u`, nh3Pct > 90 ? 'bad' : nh3Pct > 50 ? 'neutral' : 'good'),
        row('Power Draw',       `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',        `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Isotopic Wash Tower ─────────────────────────────────────────────
    else if (e.type === T.WASHTOWER) {
      const def       = EntityDefs[T.WASHTOWER];
      const deuterium = e._deuterium || 0;
      const cap       = def.deuteriumCapacity || 1000;
      const d2Pct     = Math.round((deuterium / cap) * 100);
      const hasWater  = !!e._waterConnected;
      const hasNH3    = !!e._hasAmmonia;
      const active    = e.powered && hasWater && hasNH3;
      const status    = !e.powered ? 'UNPOWERED' : !hasWater ? 'NO WATER' : !hasNH3 ? 'NO AMMONIA' : d2Pct >= 99 ? 'BUFFER FULL' : 'WASHING';
      const stClass   = active && d2Pct < 99 ? 'good' : active ? 'neutral' : 'bad';
      titleEl.textContent  = 'Isotopic Wash Tower';
      titleEl.style.color  = '#ff6eb4';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      section(
        row('Process',           'Water + Ammonia Catalyst → Deuterium Gas', 'dim'),
        intake('Water Intake',      active, def.waterPerSec, hasWater ? 'good' : 'bad'),
        stored('Water in Storage', IsotopicWashTowerSystem.getStubs(e).waterIn, 'water'),
        row('Ammonia Catalyst',  `${hasNH3 ? 'Connected' : 'Not connected'}: must be on the line, 0 u/s used up`, hasNH3 ? 'good' : 'bad'),
        row('Deuterium Output',  active ? `${def.deuteriumPerSec} u/s` : '—', active ? 'good' : 'dim'),
        row('Deuterium Buffer',  `${Math.floor(deuterium)} / ${cap} u`, d2Pct > 90 ? 'bad' : d2Pct > 50 ? 'neutral' : 'good'),
        row('Power Draw',        `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',         `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Fusion Fuel Plant ────────────────────────────────────────────────
    else if (e.type === T.FUSIONFUELPLANT) {
      const def        = EntityDefs[T.FUSIONFUELPLANT];
      const plasma     = e._plasma || 0;
      const cap        = def.plasmaCapacity || 400;
      const plasmaPct  = Math.round((plasma / cap) * 100);
      const hasD2      = !!e._hasDeuterium;
      const isDT       = (e._fuelMode || 'dt') === 'dt';     // false only on a pre-split plant still all-D-He3
      const legacyHe3  = (e._legacyHe3 || 0) > 0;
      // The split: D-He3 line state.
      const hpCap      = def.he3PelletCapacity || 200;
      const hpPct      = Math.round(((e._he3Pellets || 0) / hpCap) * 100);
      const heOpen     = isDT && typeof Progression !== 'undefined' && Progression.isUnlocked(T.HE3SEPARATOR);
      const heReady    = heOpen && (e._he3 || 0) > 0;
      const hasPartner = isDT ? (!!e._hasTritium || heReady) : !!e._hasHe3;
      const active     = e.powered && hasD2 && hasPartner;
      const allFull    = plasmaPct >= 99 && (!heOpen || hpPct >= 99);
      const status     = !e.powered ? 'UNPOWERED' : !hasD2 ? 'NO DEUTERIUM'
                       : !hasPartner ? (isDT ? (e._tritiumLinked ? 'NO TRITIUM' : 'NO TRITIUM: BUILD A BREEDER') : 'NO HELIUM-3')
                       : allFull ? 'BUFFERS FULL'
                       : isDT && heOpen && (e._heRate || 0) > 0.01 ? 'MAKING D-T + D-He3' : 'MAKING PELLETS';
      const stClass    = active && !allFull ? 'good' : active ? 'neutral' : 'bad';
      titleEl.textContent  = 'Fusion Fuel Plant';
      titleEl.style.color  = '#70f0ff';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      const tCap = def.tritiumCapacity || 400, hCap = def.he3Capacity || 300;
      // The fusion unlocks this plant's pellets drive, in order, so the
      // player can see what the D-T pellets are for and what comes next.
      // Totals are game-wide (every plant, every reactor), like the goals.
      const nextUnlock = (() => {
        if (typeof Progression === 'undefined' || typeof FUSION_GOALS === 'undefined') return null;
        const n = v => Math.floor(v).toLocaleString('en-US');
        const made = typeof FusionFuelPlantSystem !== 'undefined' ? FusionFuelPlantSystem.getTotalPlasmaProduced() : 0;
        if (!Progression.isUnlocked(T.HELIUMSCAN)) {
          const g = FUSION_GOALS.pellets1;
          return `Helium Scan (for the Fusion Reactor's magnets): ${n(Math.min(made, g))} / ${n(g)} pellets made`;
        }
        if (!Progression.isUnlocked(T.HULKINGFUSIONREACTOR) && Progression.isUnlocked(T.CRYOPLANT)) {
          return 'Fusion Reactor: produce liquid helium in a Cryo Plant';
        }
        if (!Progression.isUnlocked(T.HULKINGFUSIONREACTOR)) {
          const g = FUSION_GOALS.helium;
          const got = typeof HeliumSystem !== 'undefined' ? HeliumSystem.getTotalExtracted() : 0;
          return `Cryo Plant, then the Fusion Reactor: ${n(Math.min(got, g))} / ${n(g)} helium gas extracted`;
        }
        if (!Progression.isUnlocked(T.HE3SEPARATOR)) {
          const g = FUSION_GOALS.burned;
          const burned = typeof HulkingFusionReactorSystem !== 'undefined' ? HulkingFusionReactorSystem.getTotalPelletsBurned() : 0;
          return `Helium-3 Separator (opens D-He3): ${n(Math.min(burned, g))} / ${n(g)} pellets burned in a reactor`;
        }
        if (!Progression.isUnlocked(T.ADVFUSIONREACTOR)) {
          const g = FUSION_GOALS.he3pellets;
          const hp = FusionFuelPlantSystem.getTotalHe3PelletsProduced ? FusionFuelPlantSystem.getTotalHe3PelletsProduced() : 0;
          return `Advanced Fusion Reactor + MHD Ring: ${n(Math.min(hp, g))} / ${n(g)} D-He3 pellets made`;
        }
        return null;
      })();
      const rateStr = (v) => `${(v || 0).toFixed(2)} u/s`;
      // Tritium and helium-3 as taken per pellet (tick), against the most each
      // line can draw: D-He3 is capped at its share of the pellet rate.
      const perPellet = (fuelRate) => fuelRate / (def.plasmaPerSec || 0.625);
      const he3Max    = def.he3PerSec * (def.he3PelletShare || 0.25);
      section(
        row('Output',            !isDT ? ((typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite && ContractSystem.isAtSite())
                                            ? 'D-He3 only (contract site: fuels the MHD Rings)'
                                            : (typeof ScenarioSystem !== 'undefined' && ScenarioSystem.active())
                                            ? 'D-He3 only (fuels the MHD Rings)' : 'D-He3 only (pre-split plant; switch it to split output)')
                                 : heOpen ? 'D-T + D-He3, 3 : 1' : 'D-T (D-He3 opens with the Helium-3 Separator)', isDT ? 'good' : 'neutral'),
        intake('Deuterium Intake',  active, def.deuteriumPerSec, hasD2 ? 'good' : 'bad'),
        stored('Deuterium in Storage', FusionFuelPlantSystem.getStubs(e).deuteriumIn, 'deuterium'),
        ...(isDT
          ? [row('Tritium Intake', `${active ? +((e._dtRate || 0) * perPellet(def.tritiumPerSec)).toFixed(2) : 0} / ${def.tritiumPerSec} u/s`, e._hasTritium ? 'good' : 'bad'),
             row('Tritium Store',  `${Math.floor(e._tritium || 0)} / ${tCap} u`, (e._tritium || 0) > tCap * 0.2 ? 'good' : 'bad'),
             row('TRITIUM IN',     e._tritiumLinked ? (e._tritiumFromBreeder ? 'Piped from a breeder' : e._tritiumFromHolder ? 'Piped from a Gas Holder' : 'Piped from a reactor')
                                                    : 'No pipe from a Tritium Breeding Facility or reactor', e._tritiumLinked ? 'good' : 'bad'),
             row('D-T Pellets',    `${active ? rateStr(e._dtRate) : '—'} · buffer ${Math.floor(plasma)} / ${cap}`, plasmaPct > 90 ? 'bad' : active ? 'good' : 'dim'),
             ...(heOpen
               ? [row('Helium-3 Use',   `${heReady && e.powered ? +((e._heRate || 0) * perPellet(def.he3PerSec)).toFixed(2) : 0} / ${+he3Max.toFixed(2)} u/s into pellets`, heReady ? 'good' : 'bad'),
                  row('Helium-3 Store', `${Math.floor(e._he3 || 0)} / ${hCap} u`, (e._he3 || 0) > hCap * 0.2 ? 'good' : 'bad'),
                  row('HE-3 IN',        e._he3Linked ? (e._he3FromHolder ? 'Piped from a Gas Holder' : 'Piped from a separator') : 'No pipe from a Helium-3 Separator or Gas Holder', e._he3Linked ? 'good' : 'bad'),
                  row('D-He3 Pellets',  `${heReady && e.powered ? rateStr(e._heRate) : '—'} · buffer ${Math.floor(e._he3Pellets || 0)} / ${hpCap}`, hpPct > 90 ? 'bad' : heReady ? 'good' : 'dim'),
                  // While a reactor it feeds is short, D-T takes the plant's whole
                  // rate ahead of D-He3 (FusionFuelPlantSystem): say so, or the
                  // line just reads as broken.
                  ...(heReady && e.powered && e._dtFirst && hpPct < 100 && (e._heRate || 0) < 0.01
                    ? [row('D-He3 Line', 'Paused: a Fusion Reactor this plant feeds is low on pellets, so D-T has the full rate until its core is stocked', 'neutral')]
                    : []),
                  row('D-He3 OUT',      e._he3PelletConveyorOut ? 'Belt connected' : 'No belt: bank them in a Storage Container', e._he3PelletConveyorOut ? 'good' : 'neutral')]
               : [row('D-He3 Line',     'Locked: opens with the Helium-3 Separator', 'dim')])]
          : [intake('Helium-3 Intake', active, def.he3PerSec, hasPartner ? 'good' : 'bad'),
             row('Helium-3 Store',  legacyHe3 ? `Stored stock: ${Math.ceil(e._legacyHe3 / 60)} min left` : `${Math.floor(e._he3 || 0)} / ${hCap} u`,
                                    legacyHe3 ? 'neutral' : (e._he3 || 0) > hCap * 0.2 ? 'good' : 'bad'),
             row('HE-3 IN',         e._he3Linked ? (e._he3FromHolder ? 'Piped from a Gas Holder' : 'Piped from a separator') : 'No pipe from a Helium-3 Separator or Gas Holder', e._he3Linked ? 'good' : legacyHe3 ? 'neutral' : 'bad'),
             row('Pellet Output',   active ? `${def.plasmaPerSec} u/s D-He3` : '—', active ? 'good' : 'dim')]),
        // Which input is holding the plant back, so a slow plant (and the
        // reactor it feeds) says why. Full burn of one reactor needs ~3 Wash
        // Towers of deuterium.
        ...(active && !allFull ? [(() => {
          const pct = Math.round(Math.max(0, Math.min(1, e._runRate ?? 1)) * 100);
          const why = e._limitedBy === 'deuterium' ? `: short of deuterium, ${Math.ceil(def.deuteriumPerSec / (EntityDefs[T.WASHTOWER].deuteriumPerSec || 1.51))} Wash Towers run it flat out`
                    : e._limitedBy ? `: short of ${e._limitedBy}` : '';
          return row('Running At', `${pct}%${pct < 95 ? why : ''}`, pct >= 95 ? 'good' : 'neutral');
        })()] : []),
        ...(!isDT ? [row('Pellet Buffer', `${Math.floor(plasma)} / ${cap} u`, plasmaPct > 90 ? 'bad' : plasmaPct > 50 ? 'neutral' : 'good')] : []),
        ...(nextUnlock ? [row('Next Unlock', nextUnlock, 'neutral')] : []),
        row('Power Draw',        `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',         `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Hulking Fusion Reactor ───────────────────────────────────────
    else if (e.type === T.HULKINGFUSIONREACTOR) {
      const def       = EntityDefs[T.HULKINGFUSIONREACTOR];
      const R         = HulkingFusionReactorSystem;
      const highBeta  = e._highBeta || 0;
      const cap       = def.highBetaCapacity || 1000;
      const hbPct     = Math.round((highBeta / cap) * 100);
      const gen       = !!e._generating;
      const hasPlasma = !!e._hasPlasma;
      const started   = !!e._started;
      const isDT      = (e._fuelMode || 'dt') === 'dt';
      const K         = e._magnetK ?? 300;
      const heCap     = def.heliumChargeCap || 400;
      const hePct     = Math.round(((e._heCharge || 0) / heCap) * 100);
      const legacy    = (e._legacyCoolant || 0) > 0;
      const ready     = R.magnetsReady(e);
      const warming   = started && !e._coolingOK;
      const status    = (e._quenchVent || 0) > 0 ? 'MAGNET QUENCH'
                      : warming ? 'MAGNETS WARMING'
                      : !started && !ready ? (!e._cryoLinked && !legacy ? 'NO CRYO PLANT'
                                            : K > R.READY_K ? 'MAGNETS COOLING' : 'CHARGING HELIUM')
                      : !e.powered ? (started ? 'UNPOWERED' : 'AWAITING STARTUP SURGE')
                      : e._wrongFuel ? 'D-He3 PELLETS: FOR THE ADVANCED REACTOR'
                      : !hasPlasma ? 'NO FUEL PELLETS' : (!isDT && hbPct >= 99) ? 'BUFFER FULL' : gen ? 'GENERATING' : 'STANDBY';
      const stClass   = warming || (e._quenchVent || 0) > 0 ? 'bad' : gen ? 'good' : e.powered ? 'neutral' : 'bad';
      titleEl.textContent  = 'Fusion Reactor';
      titleEl.style.color  = '#40c0ff';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      const kTone = K <= R.OPERATING_K + 0.05 ? 'good' : K < R.QUENCH_K ? 'neutral' : 'bad';
      const cryo  = legacy ? `Stored coolant: ${Math.ceil(e._legacyCoolant / 60)} min left`
                  : !e._cryoLinked ? 'Not connected'
                  : (e._cryoRunning ? 'Cooling' : `Plant${e._cryoPlants > 1 ? 's' : ''} down, NOT cooling`)
                    + (e._cryoPlants > 1 ? ` (${e._cryoPlants} plants)` : '');
      const tCap = def.tritiumCapacity || 500;
      const blanketPct = Math.round((e._blanketRatio || 0) * 100);
      // How hard it's burning, and whether the blanket breeds back the
      // tritium it burns: the Fuel Plant's tritium per pellet against tritiumBredPerSec at a full
      // blanket. Below ~91% blanket the loop runs down, which otherwise only
      // shows up much later as the Fuel Plant going short of tritium.
      const burn    = gen ? Math.max(0, Math.min(1, e._burnRatio ?? 1)) : 0;
      const burnPct = Math.round(burn * 100);
      const tBred   = (def.tritiumBredPerSec || 4.4) * burn * (e._blanketRatio || 0);
      const ffpDef  = EntityDefs[T.FUSIONFUELPLANT];
      const tUsed   = def.plasmaPerSec * burn * ((ffpDef.tritiumPerSec || 5) / (ffpDef.plasmaPerSec || 0.625));   // tritium per pellet
      const tNet    = tBred - tUsed;
      // Field Cores burn extra pellets on top of the base rate.
      const fuelK      = typeof FieldCoreSystem !== 'undefined' ? FieldCoreSystem.fuelFactor(e) : 1;
      const pelletNeed = def.plasmaPerSec * fuelK;
      const pelletBurn = gen ? def.plasmaPerSec * (burn + (fuelK - 1) * (e._coreFuelK ?? 1)) : 0;
      const tBalance = !gen ? '—'
        : tNet >= 0 ? `+${tNet.toFixed(2)} u/s, self-sustaining`
        : `${tNet.toFixed(2)} u/s, running down: feed the blanket ${def.blanketPerSec || 2} compound/s (about ${Math.ceil((def.blanketPerSec || 2) / (EntityDefs[T.LITHIUMPROCESSPLANT].compoundPerSec || 2.4))} Lithium Processing Plants)`;
      section(
        row('Fuel',             isDT ? 'D-T pellets' : 'D-He3 pellets', 'good'),
        row('Process',          isDT ? 'D-T → neutrons → blanket heat (steam) + bred tritium' : 'D-He3 → charged particles → ion stream', 'dim'),
        // Actual pellets taken (the full rate scaled by the smoothed burn), not
        // just the rated figure — it used to read 0.5 / 0.5 at 25% burn.
        row('Pellet Burn',      `${+pelletBurn.toFixed(3)} / ${+pelletNeed.toFixed(3)} u/s`, !hasPlasma ? 'bad' : burnPct >= 95 ? 'good' : 'neutral'),
        // The core's own pellet store (HulkingFusionReactorSystem): how long
        // it would run at full burn if the PLASMA IN belt stopped now.
        ...(def.pelletCoreCapacity ? [(() => {
          const core = e._corePellets || 0, cCap = def.pelletCoreCapacity;
          const mins = core / (pelletNeed || 0.5) / 60;
          const left = core < 1 ? (e._pelletFeed ? 'filling' : 'EMPTY, no pellet feed') : `${mins >= 1 ? Math.round(mins) + ' min' : Math.round(mins * 60) + ' s'} at full burn`;
          return row('Pellet Core', `${Math.floor(core)} / ${cCap} (${left})`, core < 1 ? (e._pelletFeed ? 'neutral' : 'bad') : core / cCap > 0.25 ? 'good' : 'neutral');
        })()] : []),
        row('Burn Rate',        gen ? `${burnPct}% of full${burnPct < 95 ? ': short of pellets' : ''}` : '—',
                                  !gen ? 'dim' : burnPct >= 95 ? 'good' : 'neutral'),
        // Why pellets are short, read off the Fuel Plant at the head of the
        // PLASMA IN belt — so the answer is here, not one panel away.
        ...((gen ? burnPct < 95 : (e._started && !hasPlasma)) ? [row('Pellets Short', (() => {
          const fp = e._feedPlant;
          if (!fp) return e._pelletFeed ? 'Fed from a Storage Container that is running low' : 'No pellet belt into PLASMA IN';
          if (!fp.powered) return 'Fuel Plant has no power';
          if (!fp._hasDeuterium) return 'Fuel Plant has no deuterium: pipe a Wash Tower into its D₂ IN';
          if (!fp._tritiumLinked) return "Fuel Plant has no tritium supply: pipe this reactor's TRITIUM OUT to its TRITIUM IN";
          if (fp._limitedBy === 'deuterium') {
            const wt = EntityDefs[T.WASHTOWER].deuteriumPerSec || 1.51;
            const need = (ffpDef.deuteriumPerSec || 5) / (ffpDef.plasmaPerSec || 0.625) * def.plasmaPerSec;
            return `Fuel Plant short of deuterium: full burn needs ${+need.toFixed(2)}/s, about ${Math.ceil(need / wt - 0.05)} Wash Towers (${wt}/s each)`;
          }
          if (fp._limitedBy === 'tritium' || !(fp._tritium > 0)) {
            return 'Fuel Plant short of tritium' + (!e._tritiumPipeOut ? ": pipe this reactor's TRITIUM OUT (bottom face) to its TRITIUM IN"
                                                 : (e._blanketRatio || 0) < 0.91 ? ': feed the breeding blanket lithium compound' : '');
          }
          return 'Fuel Plant output is short';
        })(), 'bad')] : []),
        row('Fleet Bonus',      gen ? `×${R.getFleetMultiplier(e).toFixed(2)} conversion output · ${e._fleetCount || 1} reactor${(e._fleetCount || 1) > 1 ? 's' : ''} running (max ×${(1 + R.FLEET_BONUS_CAP).toFixed(1)})` : '—',
                                  gen && R.getFleetMultiplier(e) > 1.005 ? 'good' : 'dim'),
        ...(isDT
          ? [row('Steam Output',   gen ? `${e._steamOutput || 0} u/s (enough for ${Math.floor((e._steamOutput || 0) / (EntityDefs[T.STEAMTURBINE].steamDraw || 100))} MK1 or ${Math.floor((e._steamOutput || 0) / (EntityDefs[T.STEAMTURBINE2].steamDraw || 400))} MK2 turbines)` : '—', gen ? 'good' : 'dim'),
             turbineDrawRow(e, e._steamOutput || 0, gen, row),
             row('Compound Intake', `${gen ? +(def.blanketPerSec * burn * (e._blanketRatio || 0)).toFixed(2) : 0} / ${def.blanketPerSec} u/s`, e._hasBlanket ? 'good' : 'bad'),
             row('Breeding Blanket', e._blanketOreBelt ? 'Belt carries raw Lithium Ore: connect a Processing Plant COMPOUND OUT' : !e._hasBlanket ? 'No Lithium Compound, not breeding' : gen ? `Breeding at ${blanketPct}%` : 'Lithium ready',
                                     !e._hasBlanket ? 'bad' : blanketPct >= 95 || !gen ? 'good' : 'neutral'),
             row('Tritium Balance', tBalance, !gen ? 'dim' : tNet >= 0 ? 'good' : 'bad'),
             row('Tritium Store',  `${Math.floor(e._tritium || 0)} / ${tCap} u${e._tritiumPipeOut ? ': piped out' : ''}`, e._tritiumPipeOut ? 'good' : 'dim')]
          : [row('Ion Stream',     gen ? `${def.highBetaPerSec} u/s` : '—', gen ? 'good' : 'dim'),
             row('Stream Buffer',  `${Math.floor(highBeta)} / ${cap} u`, hbPct > 90 ? 'bad' : hbPct > 50 ? 'neutral' : 'good')]),
        row('Power Draw',       e._activePowerInput === (e._surgeKW || def.startupSurge)
                                  ? `${formatPower(e._surgeKW || def.startupSurge)} (startup surge ${Math.floor(e._surgeProgress || 0)}/${def.startupSurgeSeconds || 5}s)`
                                  : `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        ...(!started && e._surgeCooldown > 0
          ? [row('Startup', `Grid couldn't carry the ${formatPower(def.startupSurge)} surge; retrying in ${Math.ceil(e._surgeCooldown)}s`, 'bad')] : []),
      );
      section(
        row('Magnet Temp',      `${K < 20 ? K.toFixed(1) : Math.round(K)} K  (quench at ${R.QUENCH_K} K)`, kTone),
        bar(Math.min(1, Math.max(0, (R.QUENCH_K - K) / (R.QUENCH_K - R.OPERATING_K))), kTone === 'good' ? '#60d0ff' : kTone === 'bad' ? '#ff5040' : '#ffb040'),
        row('Helium Charge',    `${Math.floor(e._heCharge || 0)} / ${heCap} u (${hePct}%)`,
                                  hePct >= 95 ? 'good' : hePct >= Math.round(R.MIN_CHARGE_FRAC * 100) ? 'neutral' : 'bad'),
        row('LHe',              'Liquid helium, made by a Cryo Plant', 'dim'),
        row('LHe IN',           cryo, legacy || e._cryoRunning ? 'good' : 'bad'),
        cryoNeeded(e, def),
        row('He Ash',           `${Math.floor(e._heAsh || 0)} / ${def.heliumAshCapacity || 200} u${e._ashPipeOut ? ': piped out' : ''}`, 'dim'),
        ...((e._quenchCount || 0) > 0 ? [row('Quenches', `${e._quenchCount}`, 'bad')] : []),
      );
      fieldCoreBlock(e, body, section, row);
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Cryo Plant ───────────────────────────────────────────────────
    else if (e.type === T.CRYOPLANT) {
      const def    = EntityDefs[T.CRYOPLANT];
      const cap    = def.liquidHeCapacity || 500;
      const lhe    = e._liquidHe || 0;
      const pct    = Math.round((lhe / cap) * 100);
      const status = !e.powered ? 'UNPOWERED'
                   : e._tripped ? `COMPRESSORS TRIPPED: ${Math.ceil(e._restart || 0)}s`
                   : e._liquefying ? 'LIQUEFYING'
                   : pct >= 99 ? 'BUFFER FULL: COOLING'
                   : !e._hasHeliumSource ? 'NO HELIUM GAS' : 'COOLING';
      titleEl.textContent  = 'Cryo Plant';
      titleEl.style.color  = '#b8f0ff';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${!e._running ? 'bad' : e._hasHeliumSource || pct >= 99 ? 'good' : 'neutral'}`;
      section(
        row('Process',        'Helium Gas → Liquid Helium, LHe (4 K)', 'dim'),
        row('Compressors',    !e.powered ? 'No power' : e._tripped ? `Tripped: restart in ${Math.ceil(e._restart || 0)}s of steady power` : 'Running',
                                e._running ? 'good' : 'bad'),
        intake('Helium Intake',  e._liquefying, def.heliumPerSec, e._hasHeliumSource ? 'good' : 'bad'),
        stored('Helium in Storage', CryoPlantSystem.getStubs(e).heliumIn, 'helium'),
        row('Sources',        e._hasHeliumSource ? `Connected${e._ashSources ? ` (incl. ${e._ashSources} reactor ash line${e._ashSources > 1 ? 's' : ''})` : ''}` : 'None with gas', e._hasHeliumSource ? 'good' : 'bad'),
        row('Liquid Helium (LHe)', `${Math.floor(lhe)} / ${cap} u`, pct < 20 ? 'bad' : pct < 50 ? 'neutral' : 'good'),
        row('LHe OUT',        e._liquidPipeOut ? 'Piped' : e._liquidPipeLinked ? 'Piped · nothing to send yet' : 'No pipe', e._liquidPipeOut ? 'good' : e._liquidPipeLinked ? 'neutral' : 'bad'),
        row('Total Liquefied', `${Math.floor(CryoPlantSystem.getTotalLiquefied())} u`),
        row('Power Draw',     `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Helium-3 Separator ───────────────────────────────────────────
    else if (e.type === T.HE3SEPARATOR) {
      const def    = EntityDefs[T.HE3SEPARATOR];
      const cap    = def.he3Capacity || 300;
      const he3    = e._he3 || 0;
      const pct    = Math.round((he3 / cap) * 100);
      const status = !e.powered ? 'UNPOWERED' : !e._hasHeliumSource ? 'NO HELIUM GAS'
                   : pct >= 99 ? 'BUFFER FULL' : e._separating ? 'SEPARATING' : 'STANDBY';
      titleEl.textContent  = 'Helium-3 Separator';
      titleEl.style.color  = '#ffd0a0';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${e._separating ? 'good' : pct >= 99 ? 'neutral' : 'bad'}`;
      section(
        row('Process',        'Helium Gas → Helium-3 (cryogenic distillation)', 'dim'),
        intake('Helium Intake',  e._separating, def.heliumPerSec, e._hasHeliumSource ? 'good' : 'bad'),
        stored('Helium in Storage', He3SeparatorSystem.getStubs(e).heliumIn, 'helium'),
        row('Helium-3 Output', e._separating ? `${def.he3PerSec} u/s` : '—', e._separating ? 'good' : 'dim'),
        row('Helium-3 Buffer', `${Math.floor(he3)} / ${cap} u`, pct > 90 ? 'bad' : pct > 50 ? 'neutral' : 'good'),
        row('HE-3 OUT',       e._he3PipeOut ? 'Piped' : 'No pipe', e._he3PipeOut ? 'good' : 'bad'),
        row('Total Separated', `${Math.floor(He3SeparatorSystem.getTotalHe3Produced())} u`),
        row('Note',           'Wells only: fusion ash is pure helium-4', 'dim'),
        row('Power Draw',     `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Tritium Breeding Facility ────────────────────────────────────
    else if (e.type === T.TRITIUMBREEDER) {
      const def    = EntityDefs[T.TRITIUMBREEDER];
      const cap    = def.tritiumCapacity || 300;
      const trit   = e._tritium || 0;
      const pct    = Math.round((trit / cap) * 100);
      // A full buffer idles the beam and drops the 125 kW draw — say so, since
      // that's the state it settles into once a reactor is breeding instead.
      const status = !e.powered ? 'UNPOWERED' : pct >= 99 ? 'IDLE: BUFFER FULL'
                   : !e._hasCompound ? 'NO LITHIUM COMPOUND' : e._breeding ? 'BREEDING' : 'STANDBY';
      titleEl.textContent  = 'Tritium Breeding Facility';
      titleEl.style.color  = '#80ffc0';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${e._breeding ? 'good' : pct >= 99 ? 'neutral' : 'bad'}`;
      section(
        row('Process',         'Lithium Compound → Tritium (accelerator-driven)', 'dim'),
        intake('Compound Intake', e._breeding, def.compoundPerSec, e._hasCompound ? 'good' : 'bad'),
        stored('Compound in Storage', TritiumBreederSystem.getStubs(e).compoundIn, 'compound'),
        row('Tritium Output',  e._breeding ? `${def.tritiumPerSec} u/s` : '—', e._breeding ? 'good' : 'dim'),
        row('Tritium Buffer',  `${Math.floor(trit)} / ${cap} u`, pct > 90 ? 'neutral' : 'good'),
        row('TRITIUM OUT',     e._tritiumPipeOut ? 'Piped' : 'No pipe', e._tritiumPipeOut ? 'good' : 'bad'),
        row('Total Bred',      `${Math.floor(TritiumBreederSystem.getTotalTritiumBred())} u`),
        row('Note',            'A starter: a Fusion Reactor\'s blanket breeds far more', 'dim'),
        row('Power Draw',      e._idleFull ? `${formatPower(e._liveDemand || 0)} (standby: ${formatPower(def.powerInput)} when breeding)` : `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',       `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Advanced Fusion Reactor ──────────────────────────────────────
    // Everything here reads what the reactor has really received
    // (AdvancedFusionReactorSystem.notePellets): it takes each pellet the
    // moment it arrives, so "is the source holding one right now" says
    // nothing, and what the belt shows arriving is what it is running on.
    else if (e.type === T.ADVFUSIONREACTOR) {
      const def = EntityDefs[T.ADVFUSIONREACTOR];
      const gen = !!e._generating;
      const K   = e._magnetK ?? FUSION_MAGNET_AMBIENT_K;
      const heCap = def.heliumChargeCap || 2400, hePct = Math.round(((e._heCharge || 0) / heCap) * 100);
      const rep = e._coilRepair > 0;
      titleEl.textContent  = 'Advanced Fusion Reactor';
      titleEl.style.color  = '#c890ff';
      const ionCap = def.highBetaCapacity || 120000, ionPct = Math.round(((e._highBeta || 0) / ionCap) * 100);
      const surging = e._activePowerInput === (e._surgeKW || def.startupSurge);
      // Field Cores burn extra pellets on top of the base rate.
      const need = +((def.plasmaPerSec || 0.4) * (typeof FieldCoreSystem !== 'undefined' ? FieldCoreSystem.fuelFactor(e) : 1)).toFixed(3);
      const rate = Math.max(0, e._pelletRate || 0);
      const burn = Math.max(0, Math.min(1, e._burnRatio ?? 0)), burnPct = gen ? Math.round(burn * 100) : 0;
      const idle = ionPct >= 99 || e._idleFull;
      const noFuel = e._wrongFuel ? 'D-T PELLETS: NEEDS D-He3' : e._pelletLinked ? 'WAITING FOR D-He3 PELLETS' : 'NO D-He3 PELLETS';
      statusEl.textContent = (e._quenchVent || 0) > 0 ? 'STELLARATOR QUENCH' : rep ? 'COIL REPAIR'
                           : e._started ? (!e.powered ? 'UNPOWERED' : idle ? 'ION BUFFER FULL' : !e._hasPlasma ? noFuel
                                           : gen && burnPct < 95 ? `SHORT OF PELLETS · ${burnPct}% BURN` : gen ? 'GENERATING' : 'STANDBY')
                           : !e._cryoLinked ? 'NO CRYO PLANT' : K > 5 ? 'MAGNETS COOLING' : !e._magnetsReady ? 'CHARGING HELIUM'
                           : !e._hasPlasma ? noFuel
                           : surging ? 'STARTUP SURGE' : 'AWAITING STARTUP SURGE';
      statusEl.className   = `ep-status ${(e._quenchVent || 0) > 0 || rep || e._wrongFuel || (e._started && !e._hasPlasma && !idle) ? 'bad' : gen && burnPct >= 95 ? 'good' : 'neutral'}`;
      const kTone = K <= FUSION_MAGNET_OPERATING_K + 0.05 ? 'good' : K < FUSION_MAGNET_QUENCH_K ? 'neutral' : 'bad';
      // Why pellets are short, and what to do: read off the Fusion Fuel
      // Plants, whose D-He3 line only gets what their D-T line leaves, at
      // most a quarter of their rate (0.156/s each).
      const shortWhy = (() => {
        if (idle || !e._started || (gen && burnPct >= 95)) return [];
        if (e._wrongFuel) return ['The belt on PELLETS IN carries D-T pellets. This reactor burns D-He3 only: belt it from a Fusion Fuel Plant\'s D-He3 OUT.'];
        const fd = EntityDefs[T.FUSIONFUELPLANT] || {}, each = (fd.plasmaPerSec || 0.625) * (fd.he3PelletShare || 0.25);
        const plants = [...EntityRegistry.getByType(T.FUSIONFUELPLANT)];
        const nm = p => `Fusion Fuel Plant${p._num !== undefined ? ` #${p._num}` : ` at ${p.col},${p.row}`}`;
        const out = [];
        if (!e._pelletLinked) out.push('No belt reaches PELLETS IN from a Fusion Fuel Plant\'s D-He3 OUT (or a Storage Container of D-He3 pellets).');
        for (const p of plants.filter(p => p._he3LineOpen && !p._he3PelletConveyorOut).slice(0, 2))
          out.push(`${nm(p)} has no belt on its D-He3 OUT${(p._he3Pellets || 0) >= (fd.he3PelletCapacity || 50) * 0.95 ? ' and is sitting full' : ''}: belt it into the line to PELLETS IN.`);
        const fed = plants.filter(p => p._he3PelletConveyorOut);
        // The split: D-He3 takes up to its share of the plant's rate first,
        // unless a Fusion Reactor the plant feeds is short of pellets; then
        // D-T has first call and the plant can give no D-He3 until that
        // reactor's core is stocked (FusionFuelPlantSystem, _dtFirst).
        const allDT = fed.filter(p => p._dtFirst && (p._dtRate || 0) > each * 3 && (p._heRate || 0) < 0.01);
        // Making D-He3, or able to: one sitting full is only waiting on the belt.
        const making = fed.filter(p => (p._heRate || 0) > 0.01 || ((p._he3Pellets || 0) >= (fd.he3PelletCapacity || 50) * 0.9 && (p._dtRate || 0) < each * 3));
        if (allDT.length) out.push(`${allDT.map(nm).join(' and ')} ${allDT.length > 1 ? 'spend' : 'spends'} ${allDT.length > 1 ? 'their' : 'its'} whole rate on D-T while a Fusion Reactor ${allDT.length > 1 ? 'they feed' : 'it feeds'} is low on pellets, so ${allDT.length > 1 ? 'they give' : 'it gives'} no D-He3 until that core is stocked.`);
        for (const p of fed.slice(0, 3)) {
          if (allDT.includes(p)) continue;
          if (!p.powered) out.push(`${nm(p)} has no power.`);
          else if (!p._hasHe3) out.push(`${nm(p)} has no helium-3 on HE-3 IN.`);
          else if (!p._hasDeuterium) out.push(`${nm(p)} has no deuterium.`);
          else if ((p._heRate || 0) < each * 0.6 && (p._dtRate || 0) > 0.05) out.push(`${nm(p)} is sending most of its rate down its D-T line (a Fusion Reactor it feeds is low on pellets), so only ${(p._heRate || 0).toFixed(2)}/s of D-He3.`);
        }
        const plantsNeeded = Math.ceil(need / each - 0.01), more = Math.max(0, plantsNeeded - making.length);
        out.push(`Full burn takes ${need}/s; each Fusion Fuel Plant gives at most ${each.toFixed(3)}/s of D-He3, so ${plantsNeeded} need rate to spare for it. ${making.length} ${making.length === 1 ? 'has' : 'have'} it now (at most ${(making.length * each).toFixed(3)}/s)${more ? `: build ${more} more Fusion Fuel Plant${more > 1 ? 's' : ''} (deuterium and helium-3 in, D-He3 OUT belted to this line)` : ''}.`);
        return out;
      })();
      section(
        row('Fuel',          e._wrongFuel ? 'D-T pellets on the belt; this machine burns D-He3 only'
                             : e._hasPlasma ? 'D-He3 pellets arriving' : e._pelletLinked ? 'Belted to a D-He3 source, none arriving' : 'No D-He3 source belted to PELLETS IN',
                             e._wrongFuel || !e._hasPlasma ? 'bad' : 'good'),
        row('Pellet Feed',   `${e._started && !idle ? rate.toFixed(3) : 0} / ${need} u/s`, !e._started || idle ? 'dim' : burnPct >= 95 ? 'good' : rate > 0.01 ? 'neutral' : 'bad'),
        row('Burn Rate',     gen ? `${burnPct}% of full${burnPct < 95 ? ': short of pellets' : ''}` : '—', !gen ? 'dim' : burnPct >= 95 ? 'good' : 'neutral'),
        ...shortWhy.slice(0, 4).map((t, i) => row(i ? '' : 'Pellets Short', t, 'bad')),
        row('Ion Stream',    gen && !idle ? `${Math.round((def.highBetaPerSec || 4800) * burn * (e._coolFactor ?? 1))} of ${def.highBetaPerSec || 4800} u/s · buffer ${ionPct}%` : `buffer ${ionPct}%`,
                             !gen ? 'dim' : ionPct > 90 ? 'neutral' : 'good'),
        row('Ion Outlets',   e._ionPipeOut ? 'Piped to MHD Rings' : 'No pipe on ION OUT A or B', e._ionPipeOut ? 'good' : 'bad'),
        row('CRYO IN',       e._cooled ? `${def.coolWaterPerSec} u/s Cryogenic Coolant: converters at full output`
                                       : `Short of Cryogenic Coolant (${Math.floor(e._coolAvailable || 0)} / ${def.coolWaterPerSec} u/s): converters derated to ${Math.round((def.uncooledOutputFrac ?? 0.3) * 100)}%`,
                             e._cooled ? 'good' : 'bad'),
        row('Power Draw',    surging ? `${formatPower(e._surgeKW || def.startupSurge)} (startup surge ${Math.floor(e._surgeProgress || 0)}/${def.startupSurgeSeconds || 6}s)` : formatPower(def.powerInput), e.powered ? 'good' : 'bad'),
        ...(!e._started && e._surgeCooldown > 0 ? [row('Startup', `Grid couldn't carry the ${formatPower(def.startupSurge)} surge; retrying in ${Math.ceil(e._surgeCooldown)}s`, 'bad')] : []),
      );
      section(
        row('Magnet Temp',   `${K < 20 ? K.toFixed(1) : Math.round(K)} K  (quench at ${FUSION_MAGNET_QUENCH_K} K)`, kTone),
        row('Helium Charge', `${Math.floor(e._heCharge || 0)} / ${heCap} u (${hePct}%)`, hePct >= 95 ? 'good' : hePct >= 50 ? 'neutral' : 'bad'),
        row('LHe',           'Liquid helium, made by a Cryo Plant', 'dim'),
        row('LHe IN',        !e._cryoLinked ? 'Not connected' : e._cryoRunning ? `Cooling (${e._cryoPlants || 1} plant${(e._cryoPlants || 1) > 1 ? 's' : ''})` : 'Plants down, NOT cooling',
                             e._cryoRunning ? 'good' : 'bad'),
        cryoNeeded(e, def),
        ...(rep ? [row('Coil Repair', `${Math.ceil(e._coilRepair)}s before the magnets can be cooled again`, 'bad')] : []),
        row('Quench Risk',   `Without cooling, ~${Math.round((FUSION_MAGNET_QUENCH_K - FUSION_MAGNET_OPERATING_K) / (def.magnetWarmRate || 0.2))}s to a quench: vents ${Math.round((def.quenchVentFrac ?? 0.9) * 100)}% of the helium, arcs up to ${def.quenchArcRadius || 8} tiles, ${formatMoney(def.quenchRepairCost || 350000)} coil repair`, 'dim'),
        ...((e._quenchCount || 0) > 0 ? [row('Quenches', `${e._quenchCount}`, 'bad')] : []),
      );
      section(
        row('Process',       'D-He3 → charged particles → ion stream → MHD Rings (4 at full burn)', 'dim'),
        row('Footprint',     `${e.width || 1}×${e.height || 1} tiles`),
      );
      fieldCoreBlock(e, body, section, row);
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── MHD Decelerator Ring ─────────────────────────────────────────
    else if (e.type === T.MHDRING) {
      const def       = EntityDefs[T.MHDRING];
      const gen       = !!e._generating;
      const connected = !!e._highBetaConnected;
      const hasPower  = !!e._hasPower;
      const status    = !connected && !hasPower ? 'NO POWER OR ION STREAM' : !connected ? 'NO D-He3 REACTOR PIPED' : !hasPower ? 'NOT WIRED' : gen ? 'GENERATING' : 'STREAM STARVED';
      const stClass   = gen ? 'good' : (connected || hasPower) ? 'neutral' : 'bad';
      titleEl.textContent  = 'MHD Decelerator Ring';
      titleEl.style.color  = '#60d0ff';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      section(
        row('Function',       'Decelerates a D-He3 ion stream → electricity; needs both', 'dim'),
        row('Ion Stream',     connected ? 'Piped to a D-He3 reactor' : 'No pipe from an Advanced Fusion Reactor\'s ION OUT (D-T fuel makes steam, not ions)', connected ? 'good' : 'bad'),
        row('Grid Wiring',    hasPower ? 'Wire connected' : 'Not wired', hasPower ? 'good' : 'bad'),
        row('Stream Draw',    `${def.highBetaDraw || 1000} units/s`, 'dim'),
        row('Output',         gen ? `${formatPower(e._currentOutput || 0)}` : '0 kW', gen ? 'good' : 'dim'),
        row('Footprint',      `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Fuel Processing Plant ─────────────────────────────────────────
    else if (e.type === T.FUELPLANT) {
      const def     = EntityDefs[T.FUELPLANT];
      const rods    = e._rods || 0;
      const cap     = def.rodCapacity || 150;
      const rodPct  = Math.round((rods / cap) * 100);
      const hasAcid = !!e._hasAcid;
      const hasU    = !!e._hasUranium;
      const active  = e.powered && hasAcid && hasU;
      const status  = !e.powered ? 'UNPOWERED' : !hasAcid ? 'NO ACID' : !hasU ? 'NO URANIUM' : rodPct >= 99 ? 'BUFFER FULL' : 'PROCESSING';
      // What Haulers have unloaded into the plant itself (FuelPlantSystem.truckPut)
      const inPlant = (label, v, c) => row(label, `${Math.floor(v || 0)} / ${c} u`, (v || 0) >= 1 ? 'good' : 'dim');
      const stClass = active && rodPct < 99 ? 'good' : active ? 'neutral' : 'bad';
      titleEl.textContent  = 'Fuel Processing Plant';
      titleEl.style.color  = '#a0ff60';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      section(
        row('Process',         'Uranium + H₂SO₄ → Fuel Rods', 'dim'),
        intake('Acid Intake',     active, def.acidPerSec,    hasAcid ? 'good' : 'bad'),
        inPlant('Acid in Plant',  e._truckAcid, def.acidCapacity || 300),
        stored('Acid in Storage', FuelPlantSystem.getStubs(e).pipeIn, 'acid'),
        intake('Uranium Intake',  active, def.uraniumPerSec, hasU    ? 'good' : 'bad'),
        inPlant('Uranium in Plant', e._truckUranium, def.uraniumCapacity || 300),
        stored('Uranium in Storage', FuelPlantSystem.getStubs(e).convIn, 'uranium'),
        row('Rod Output',      active ? `${def.rodPerSec} rods/s` : '—',  active  ? 'good' : 'dim'),
        row('Rod Buffer',      `${Math.floor(rods)} / ${cap}`, rodPct > 90 ? 'bad' : rodPct > 50 ? 'neutral' : 'good'),
        row('Power Draw',      `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',       `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Leach Plant ───────────────────────────────────────────────────
    else if (e.type === T.LEACHPLANT) {
      const def      = EntityDefs[T.LEACHPLANT];
      const oxide    = e._oxide    || 0, oxCap   = def.oxideCapacity    || 300;
      const tail     = e._tailings || 0, tailCap = def.tailingsCapacity || 100;
      const oxPct    = Math.round((oxide / oxCap) * 100);
      const tailPct  = Math.round((tail / tailCap) * 100);
      const hasAcid  = !!e._hasAcid;
      const hasOre   = !!e._hasOre;
      const active   = !!e._running;
      // `_blockedBy` names the full store that stopped it (LeachPlantSystem).
      const status   = !e.powered ? 'UNPOWERED' : e._blockedBy ? `${e._blockedBy.toUpperCase()} FULL`
                     : !hasOre ? 'NO ORE' : !hasAcid ? 'NO ACID' : active ? 'LEACHING' : 'IDLE';
      const stClass  = active ? 'good' : e.powered && !e._blockedBy ? 'neutral' : 'bad';
      titleEl.textContent  = 'Leach Plant';
      titleEl.style.color  = '#ff9a5a';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      section(
        row('Process',        'Rare Earth Ore + H₂SO₄ → Rare Earth Oxide', 'dim'),
        intake('Ore Intake',  active, def.orePerSec,  hasOre  ? 'good' : 'bad'),
        stored('Ore in Storage', LeachPlantSystem.getStubs(e).oreIn, 'rareearth'),
        intake('Acid Intake', active, def.acidPerSec, hasAcid ? 'good' : 'bad'),
        stored('Acid in Storage', LeachPlantSystem.getStubs(e).acidIn, 'acid'),
        row('Oxide Output',   active ? `${def.oxidePerSec} u/s` : '—', active ? 'good' : 'dim'),
        row('Oxide Buffer',   `${Math.floor(oxide)} / ${oxCap} u`, oxPct > 90 ? 'bad' : oxPct > 50 ? 'neutral' : 'good'),
        row('Power Draw',     `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',      `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(
        row('Thorium Tailings', `${tail.toFixed(1)} / ${tailCap} u (${tailPct}%)`, tailPct > 90 ? 'bad' : tailPct > 50 ? 'neutral' : 'good'),
        row('Disposal',         'Waste Truck or drone to Nuclear Waste Facility', 'dim'),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Coke Oven Battery ─────────────────────────────────────────────
    else if (e.type === T.COKEOVEN) {
      const def     = EntityDefs[T.COKEOVEN];
      const bunker  = e._coalBunker || 0, bunkCap = def.coalCapacity     || 45;
      const coke    = e._coke       || 0, cokeCap = def.cokeCapacity     || 300;
      const gas     = e._hydrogen   || 0, gasCap  = def.hydrogenCapacity || 1000;
      const cokePct = Math.round((coke / cokeCap) * 100);
      const gasPct  = Math.round((gas / gasCap) * 100);
      const active  = !!e._running;
      // Full, then waiting for the store to fall to the restart level (CokeOvenSystem.outputFull).
      const holding = !!e._cokeHold;
      const resume  = Math.round(cokeCap * (def.cokeResumeFrac ?? 0.5));
      const status  = !e.powered ? 'UNPOWERED' : e._blockedBy ? (cokePct >= 99 ? 'COKE FULL' : 'STANDBY')
                    : !e._hasCoal ? 'NO COAL' : active ? (e._flaring ? 'COKING · FLARING' : 'COKING') : 'IDLE';
      titleEl.textContent  = 'Coke Oven Battery';
      titleEl.style.color  = '#ff7a2a';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${active ? 'good' : e.powered ? 'neutral' : 'bad'}`;
      section(
        row('Process',       'Coal → Coke + Coke-Oven Gas (H₂)', 'dim'),
        row('Coal Intake',   e._hasCoal ? `${(e._coalInRate || 0).toFixed(2)} / ${def.coalPerSec} u/s` : `0 / ${def.coalPerSec} u/s: no coal on COAL IN`, e._hasCoal ? 'good' : 'bad'),
        stored('Coal in Storage', CokeOvenSystem.getStubs(e).coalIn, 'coal'),
        row('Coal Bunker',   `${bunker.toFixed(1)} / ${bunkCap} u`, bunker > bunkCap * 0.2 ? 'good' : 'neutral'),
        row('Coke Output',   active ? `${def.cokePerSec} u/s` : '—', active ? 'good' : 'dim'),
        row('Coke Store',    `${Math.floor(coke)} / ${cokeCap} u${holding ? ` · restarts at ${resume}` : ''}`, holding ? 'neutral' : cokePct > 90 ? 'bad' : cokePct > 50 ? 'neutral' : 'good'),
        row('Power Draw',    `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',     `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(
        row('Gas Output',    active ? `${def.hydrogenPerSec} u/s hydrogen` : '—', active ? 'good' : 'dim'),
        row('Gas Buffer',    `${Math.floor(gas)} / ${gasCap} u (${gasPct}%)`, gasPct > 90 ? 'neutral' : 'good'),
        row('GAS OUT',       e._gasPipeOut ? 'piped' : 'not piped: the gas is flared', e._gasPipeOut ? 'good' : 'dim'),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
      _pollutionSection(e);
    }

    // ── Graphitization Furnace ────────────────────────────────────────
    else if (e.type === T.GRAPHITEFURNACE) {
      const def    = EntityDefs[T.GRAPHITEFURNACE];
      const stock  = e._cokeStock || 0, stCap = def.cokeCapacity     || 60;
      const gr     = e._graphite  || 0, grCap = def.graphiteCapacity || 200;
      const grPct  = Math.round((gr / grCap) * 100);
      const active = !!e._running;
      // Full, then waiting for the store to fall to the restart level (GraphiteFurnaceSystem.outputFull).
      const holding = !!e._graphiteHold;
      const resume = Math.round(grCap * (def.graphiteResumeFrac ?? 0.5));
      const status = !e.powered ? 'UNPOWERED' : e._blockedBy ? (grPct >= 99 ? 'GRAPHITE FULL' : 'STANDBY')
                   : !e._hasCoke && stock < 0.01 ? 'NO COKE' : active ? 'GRAPHITIZING' : 'IDLE';
      titleEl.textContent  = 'Graphitization Furnace';
      titleEl.style.color  = '#fff0c0';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${active ? 'good' : e.powered ? 'neutral' : 'bad'}`;
      section(
        row('Process',         'Coke → Graphite (Acheson furnace)', 'dim'),
        intake('Coke Intake',  active, def.cokePerSec, e._hasCoke ? 'good' : 'bad'),
        stored('Coke in Storage', GraphiteFurnaceSystem.getStubs(e).cokeIn, 'coke'),
        row('Trough',          `${stock.toFixed(1)} / ${stCap} coke packed`, stock > 0.5 ? 'good' : 'neutral'),
        row('Graphite Output', active ? `${def.graphitePerSec} u/s` : '—', active ? 'good' : 'dim'),
        row('Graphite Store',  `${Math.floor(gr)} / ${grCap} u${holding ? ` · restarts at ${resume}` : ''}`, holding ? 'neutral' : grPct > 90 ? 'bad' : grPct > 50 ? 'neutral' : 'good'),
        row('Feeds',           `${Math.floor(def.graphitePerSec / (EntityDefs[T.ADVREACTOR].graphitePerSec || 0.1) + 1e-9)} Advanced Reactors' reflectors`, 'dim'),
        row('Power Draw',      `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',       `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
      _pollutionSection(e);
    }

    // ── Superconductor Mill ───────────────────────────────────────────
    else if (e.type === T.SCMILL) {
      const def    = EntityDefs[T.SCMILL];
      const tape   = e._tape || 0, cap = def.tapeCapacity || 300;
      const pct    = Math.round((tape / cap) * 100);
      const active = !!e._running;
      const status = !e.powered ? 'UNPOWERED' : pct >= 99 ? 'TAPE FULL'
                   : !e._hasOxide ? 'NO OXIDE' : !e._hasHydrogen ? 'NO HYDROGEN' : !e._hasNitrogen ? 'NO NITROGEN'
                   : active ? 'GROWING TAPE' : 'IDLE';
      titleEl.textContent  = 'Superconductor Mill';
      titleEl.style.color  = '#c8b0f0';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${active ? 'good' : e.powered && pct < 99 ? 'neutral' : 'bad'}`;
      section(
        row('Process',         'Oxide + H₂ + N₂ → HTS Tape', 'dim'),
        intake('Oxide Intake',    active, def.oxidePerSec,    e._hasOxide    ? 'good' : 'bad'),
        stored('Oxide in Storage', SuperconductorMillSystem.getStubs(e).oxideIn, 'oxide'),
        intake('Hydrogen Intake', active, def.hydrogenPerSec, e._hasHydrogen ? 'good' : 'bad'),
        stored('Hydrogen in Storage', SuperconductorMillSystem.getStubs(e).hydrogenIn, 'hydrogen'),
        intake('Nitrogen Intake', active, def.nitrogenPerSec, e._hasNitrogen ? 'good' : 'bad'),
        stored('Nitrogen in Storage', SuperconductorMillSystem.getStubs(e).nitrogenIn, 'nitrogen'),
        row('Tape Output',     active ? `${def.tapePerSec} u/s` : '—', active ? 'good' : 'dim'),
        row('Tape Buffer',     `${tape.toFixed(1)} / ${cap} u`, pct > 90 ? 'bad' : pct > 50 ? 'neutral' : 'good'),
        row('Power Draw',      `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Footprint',       `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Core Works ────────────────────────────────────────────────────
    else if (e.type === T.COREWORKS) {
      const def   = EntityDefs[T.COREWORKS];
      const bays  = CoreWorksSystem.bays(e);
      const job   = bays.find(c => c.state === 'charging');
      const stock = e._tapeStock || 0;
      const charged = bays.filter(c => c.state === 'charged').length;
      const status = !e.powered ? 'UNPOWERED'
                   : job && !e._window ? 'WAITING FOR OFF-PEAK'
                   : job ? 'CHARGING'
                   : e._waitingFor ? 'NEEDS TAPE'
                   : charged === bays.length ? 'BAYS FULL'
                   : 'IDLE';
      titleEl.textContent  = 'Core Works';
      titleEl.style.color  = '#9fd8ff';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${e._charging ? 'good' : e.powered ? 'neutral' : 'bad'}`;
      const hrs = (secs) => `${(secs / DayNight.secondsPerGameHour()).toFixed(1)} h`;
      const bayRow = (c, i) => {
        if (c.state === 'empty')   return row(`Bay ${i + 1}`, 'Empty', 'dim');
        if (c.state === 'charged') return row(`Bay ${i + 1}`, `${c.id} · charged, awaiting pickup`, 'good');
        if (c.state === 'spent')   return row(`Bay ${i + 1}`, `${c.id} · spent${c.quenched ? ' (quenched)' : ''}, recharge ${CoreWorksSystem.tapeFor(c)} tape`, 'warn');
        const left = Math.max(0, CoreWorksSystem.chargeSecs() - (c.t || 0));
        return row(`Bay ${i + 1}`, `${c.id} · charging ${Math.floor((c.charge || 0) * 100)}% · ${hrs(left)} left`, 'neutral');
      };
      section(
        row('Process',     'HTS Tape → Field Cores (wind, then charge)', 'dim'),
        row('Tape IN',     `${e._hasTape ? 'Connected' : 'No tape belt'}: takes up to ${def.tapeIntakePerSec} u/s`, e._hasTape ? 'good' : 'bad'),
        row('Tape On Hand', `${stock.toFixed(1)} / ${def.tapeCapacity} u`, e._waitingFor && stock < e._waitingFor ? 'warn' : ''),
        ...(e._waitingFor ? [row('Next Job', `needs ${e._waitingFor} tape`, 'warn')] : []),
        ...bays.map(bayRow),
        row('Power Draw',  e._charging ? `${formatPower(def.powerInput)} (charging)` : `${formatPower(def.idleKW)} (idle)`, e.powered ? 'good' : 'bad'),
        row('Charging',    e._offPeak ? 'Off-peak only, 22:00–06:00' : 'Any time', 'dim'),
      );
      section(
        row('New Core',  `${def.coreTape} tape + ${def.chargeHours} h charge`, 'dim'),
        row('Recharge',  `${def.rechargeTape} tape (double after a quench)`, 'dim'),
        row('Cores Built', `${CoreWorksSystem.getTotalCoresBuilt()}`),
      );
      const toggle = (attr, label, on, title) => {
        const b = document.createElement('button');
        b.setAttribute(attr, '');
        b.textContent = label;
        b.title = title;
        b.style.cssText = 'width:100%;margin:6px 0 2px;font-size:9px;letter-spacing:1.5px;padding:8px 0;border-radius:2px;cursor:pointer;' +
          (on ? 'border:1px solid #5aa8d8;background:#0e2a3a;color:#9fd8ff;' : 'border:1px solid #3a4a58;background:transparent;color:#8aa0b0;');
        body.appendChild(b);
      };
      toggle('data-coreworks-offpeak', e._offPeak ? 'OFF-PEAK CHARGING: ON' : 'OFF-PEAK CHARGING: OFF', !!e._offPeak,
        'Charge only between 22:00 and 06:00, so the 800 kW load stays off the evening peak. A 6-hour charge fits in one night.');
      toggle('data-coreworks-build', e._buildCores === false ? 'WIND NEW CORES: OFF' : 'WIND NEW CORES: ON', e._buildCores !== false,
        'Wind a new core into an empty bay whenever there is tape for one. Off: only recharge spent cores.');
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }


    // ── Nuclear Reactor ───────────────────────────────────────────────
    else if (e.type === T.NUCLEARREACTOR || e.type === T.ADVREACTOR) {
      const def      = EntityDefs[e.type];
      const isMox    = e.type === T.ADVREACTOR;
      const rods     = e._rodBuffer || 0;
      const rodCap   = def.rodCapacity || 50;
      const spent    = e._spentFuel || 0;
      const spentCap = def.spentFuelCapacity || 100;
      const spentPct = Math.round((spent / spentCap) * 100);
      const rodPct   = Math.round((rods / rodCap) * 100);
      const gen      = !!e._generating;
      const hasRods  = !!e._hasRods;
      const critical = !!e._meltdownHot;
      // _coolStarved = piped to a tower whose cooled water is already
      // committed to an older reactor, which reads very differently from
      // "you never plumbed it" and wants saying so.
      const starved  = !!e._coolStarved;
      const status   = critical ? 'MELTDOWN' : (gen && !e._cooled) ? 'OVERHEATING' : (!e._cooled && (e._heatRate || 0) > 0) ? 'DECAY HEAT' : e._detonated ? 'DESTROYED' : !e.powered ? 'UNPOWERED' : !hasRods ? 'NO FUEL RODS' : spent >= spentCap ? 'CASKS FULL' : gen ? 'GENERATING' : 'STANDBY';
      const stClass  = critical || (gen && !e._cooled) ? 'bad' : gen ? 'good' : e.powered ? 'neutral' : 'bad';
      titleEl.textContent  = isMox ? 'Advanced Nuclear Reactor' : 'Nuclear Reactor';
      titleEl.style.color  = isMox ? '#40ffd0' : '#60ff80';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      section(
        row('Steam Output',  gen ? `${e._currentOutput || def.steamOutput} u/s` : '0 u/s', gen ? 'good' : 'dim'),
        turbineDrawRow(e, e._currentOutput || def.steamOutput, gen, row),
        intake(isMox ? 'MOX Input' : 'Rod Input', hasRods, def.rodPerSec, hasRods ? 'good' : 'bad', 'rods/s'),
        row('Rod Buffer',    `${Math.floor(rods)} / ${rodCap}`,              rodPct < 20 ? 'bad' : 'good'),
        row('Spent Fuel Out', gen ? `${def.spentFuelPerSec} u/s` : '—',     e._wasteOut ? 'good' : 'dim'),
        row('Cask Store',    `${Math.floor(spent)} / ${spentCap} units`,     spentPct > 90 ? 'bad' : spentPct > 60 ? 'neutral' : 'good'),
        // Received / needed, always — "NONE" hid how far off it was. A
        // reactor takes its full need or nothing, so a short line still
        // delivers 0; the spare it saw is shown so the gap is visible.
        row('Cooling',       (() => {
                               const need  = def.coolWaterPerSec || (isMox ? 44 : 20);
                               const fluid = isMox ? 'cryogenic coolant' : 'cooled water';
                               const got   = e._cooled ? need : 0;
                               const tail  = e._cooled ? ''
                                           : starved ? `: only ${Math.floor(e._coolAvailable || 0)} spare on the line`
                                           : gen ? ': OVERHEATING' : '';
                               return `${got} / ${need} u/s ${fluid}${tail}`;
                             })(),
                             e._cooled ? 'good' : 'bad'),
        row('Core Temp',     `${Math.round((e._coreHeat || 0) * 100)}%`
                             + (MeltdownSystem.timeLeft(e) != null && e._meltdownHot ? `: DETONATION IN ${Math.ceil(MeltdownSystem.timeLeft(e))}s` : ''),
                             (e._coreHeat || 0) >= 1 ? 'bad' : (e._coreHeat || 0) > 0.4 ? 'neutral' : 'good'),
        row('Steam Pressure', `${Math.round((e._steamPressure || 0) * 100)}%`
                             + (e._pressureRising ? ': NO TURBINE DRAWING' : ''),
                             (e._steamPressure || 0) >= 1 || e._pressureRising ? 'bad' : (e._steamPressure || 0) > 0 ? 'neutral' : 'good'),
        row('Grid Power',    'None: feeds a Steam Turbine', 'dim'),
        row('Footprint',     `${e.width || def.width}×${e.height || def.height} tiles`),
      );
      if (isMox && def.graphitePerSec) {
        const gUnlocked = Progression.isUnlocked(T.GRAPHITEFURNACE);
        const g = e._graphite || 0, gCap = def.graphiteCapacity || 40;
        const boostPct = Math.round(((def.graphiteBoost || 1) - 1) * 100);
        section(
          row('Graphite Reflector', e._reflected ? `ON: +${boostPct}% steam` : !gUnlocked ? 'needs the Graphitization Furnace' : e._hasGraphite ? 'stocked, waiting on the core' : `off: belt graphite into GRAPHITE IN for +${boostPct}% steam`,
              e._reflected ? 'good' : 'dim'),
          row('Graphite Blocks', `${g.toFixed(1)} / ${gCap} (wears ${def.graphitePerSec}/s while generating)`, g > gCap * 0.2 ? 'good' : g > 0 ? 'neutral' : 'dim'),
        );
      }
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
      section(
        row('Radioactive Buildup', `${spentPct}%`, spentPct >= 80 ? 'bad' : spentPct >= 60 ? 'neutral' : 'good'),
        ...(spentPct >= 60 ? [row('Waste Facility', 'Available: belt it out or haul it by truck', 'neutral')] : []),
      );
    }


    // ── Cooling Tower ─────────────────────────────────────────────────
    else if (e.type === T.COOLINGTOWER || e.type === T.COOLINGTOWER2) {
      const def    = EntityDefs[e.type];
      const cryo   = e.type === T.COOLINGTOWER2;
      const active = !!e._active && e.powered && !e._pumpTripped;
      const status = e._pumpTripped ? 'PUMPS TRIPPED' : !e.powered ? 'UNPOWERED' : active ? (e._onReserve ? 'COOLING ON RESERVE' : 'COOLING') : !e._hotConnected ? (cryo ? 'NO COOLED WATER' : 'NO WATER') : 'STANDBY';
      // Basin reserve (CoolingTowerSystem): what's left of the water it holds
      // to ride out a cut upstream.
      const resMax = CoolingTowerSystem.RESERVE_SECONDS || 60, res = e._waterReserve ?? 0;
      const reserveRow = row('Basin Reserve', e._onReserve
          ? `${Math.ceil(res)}s left: nothing coming in, find the cut upstream`
          : `${Math.round(res / resMax * 100)}% (${resMax}s of running with the supply cut)`,
        e._onReserve ? 'bad' : res >= resMax - 0.5 ? 'good' : 'warn');
      const water  = cryo
                   ? (e._hasCoolWater ? [`${def.coolWaterPerSec || 70} / ${def.coolWaterPerSec || 70} u/s cooled water`, 'good']
                     : e._coolShort ? (() => {
                         // All-or-nothing: below the full need it gets none. Say how far off.
                         const need = def.coolWaterPerSec || 70, got = Math.floor(e._coolAvailable || 0);
                         const per  = EntityDefs[T.COOLINGTOWER].coldOutput || 12;
                         const more = Math.ceil((need - got) / per);
                         return [`Short: ${got} / ${need} u/s spare (needs ~${more} more Cooling Tower${more === 1 ? '' : 's'})`, 'bad'];
                       })()
                     : e._pipeIn ? ['Pipe not reaching a working Cooling Tower', 'bad']
                     : ['Not connected: pipe cooled water into COOL IN', 'bad'])
                   : (() => {
                       const n = def.waterPerSecond || 12;
                       return e._hasWater ? [`${n} / ${n} u/s`, 'good']
                         : e._waterShort ? [`0 / ${n} u/s: network out of water`, 'bad']
                         : e._pipeIn ? [`0 / ${n} u/s: pipe is dry, connect a Water Extractor`, 'bad']
                         : [`0 / ${n} u/s: pipe water into H₂O IN`, 'bad'];
                     })();
      const stClass = e._pumpTripped ? 'bad' : active ? 'good' : 'neutral';
      const tempOut = e._waterTempOut != null ? formatTemp(e._waterTempOut) : '—';
      const tempClass = e._waterTempOut != null && e._waterTempOut < 100 ? 'good' : e._waterTempOut != null ? 'bad' : 'dim';
      titleEl.textContent  = def.label;
      titleEl.style.color  = def.glowColor;
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      // Cryogenic tower: lay the supply chain out step by step, because the
      // failure is almost always upstream of it — it runs only on its FULL
      // cooled-water draw, and reactors on the same line are served first,
      // so "cooled water going in, nothing coming out" needs saying plainly.
      if (cryo) {
        const need    = def.coolWaterPerSec || 70;
        const per     = EntityDefs[T.COOLINGTOWER].coldOutput || 12;
        const outCap  = def.coldOutput || 48;
        const fed     = !!e._hasCoolWater;
        const got     = fed ? need : Math.floor(e._coolAvailable || 0);
        const more    = Math.max(1, Math.ceil((need - got) / per));
        const towers  = Math.ceil(need / per);
        const reactors = [...EntityRegistry.getByType(T.ADVREACTOR)].filter(r => r._coolTower === e);
        const advNeed = EntityDefs[T.ADVREACTOR].coolWaterPerSec || 44;
        const note = (text, color) => `
          <div class="ep-row" style="display:block;line-height:1.4;font-size:11px;color:${color};white-space:normal">${text}</div>`;

        let problem = null;
        if (e._pumpTripped)     problem = e.powered ? `Pumps tripped after a power cut; restarting in ${Math.ceil(e._pumpRestart || 0)}s.` : 'Pumps tripped: waiting for power.';
        else if (!e.powered)    problem = 'No power: the chiller needs power to run.';
        else if (!e._pipeIn)    problem = "Nothing piped into COOL IN. Pipe cooled water from a Cooling Tower's COLD OUT into it.";
        else if (e._coolShort)  problem = `Only <b>${got} of the ${need} u/s</b> of cooled water it needs is reaching COOL IN, so it makes <b>no</b> coolant. `
                                        + `It runs only on its full ${need} u/s; a partial supply counts as none. `
                                        + `Add about <b>${more} more Cooling Tower${more === 1 ? '' : 's'}</b> (${per} u/s each) to the COOL IN line. `
                                        + `Uranium reactors on the same line are served first and take ${EntityDefs[T.NUCLEARREACTOR].coolWaterPerSec || 20} u/s each; giving them their own towers frees theirs.`;
        else if (!fed)          problem = "The pipe at COOL IN doesn't reach a working Cooling Tower's COLD OUT.";
        else if (!reactors.length) problem = "Producing, but no Advanced Reactor is drawing it; pipe CRYO OUT to a reactor's CRYO IN.";

        const inRow  = e._pumpTripped || !e.powered ? ['—', 'dim']
                     : !e._pipeIn ? ['Not connected', 'bad']
                     : [`${got} / ${need} u/s`, fed ? 'good' : 'bad'];
        const outRow = active || fed
                     ? [`${e._coldDrawn || 0} / ${outCap} u/s`, (e._coldDrawn || 0) > 0 ? 'good' : 'neutral']
                     : [`0 / ${outCap} u/s, not producing`, 'bad'];
        const rxRow  = reactors.length
                     ? [`${reactors.length} fed (${advNeed} u/s each)`, 'good']
                     : ['None receiving coolant', fed ? 'neutral' : 'bad'];
        statusEl.textContent = problem && e._coolShort ? 'NOT ENOUGH COOLED WATER' : status;
        statusEl.className   = `ep-status ${problem ? 'bad' : stClass}`;

        section(
          row('Function', 'Chills cooled water into Cryogenic Coolant for Advanced Reactors', 'dim'),
          row('Needs', `${need} u/s cooled water (${towers} Cooling Tower${towers === 1 ? '' : 's'} at ${per} u/s)`, fed ? 'good' : 'warn'),
          row('① Cooled water in', inRow[0], inRow[1]),
          row('② Cryo coolant out', outRow[0], outRow[1]),
          row('③ Advanced Reactors', rxRow[0], rxRow[1]),
          reserveRow,
          problem ? note('⚠ ' + problem, '#ff9a80')
                  : note(`✓ Chain complete: ${need} u/s cooled water in, coolant flowing to ${reactors.length} reactor${reactors.length === 1 ? '' : 's'}.`, '#70e0a0'),
        );
        section(
          row('Pumps',       e._pumpTripped
                               ? (e.powered ? `Restarting: ${Math.ceil(e._pumpRestart || 0)}s` : `Tripped: waiting for power`)
                               : 'Running', e._pumpTripped ? 'bad' : 'good'),
          row('Power Draw',  `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
          row('Outage Risk', `${Math.round((def.pumpTripChance ?? 0.4) * 100)}% chance pumps trip on power loss`, 'dim'),
          row('Footprint',   `${e.width || def.width}×${e.height || def.height} tiles`),
        );
        section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
      } else {
      section(
        row('Function',    cryo ? 'Turns cooled water into Cryogenic Coolant for an Advanced Reactor'
                                 : 'Reactor water cooling loop', 'dim'),
        row('Cooling Cap', `${Math.round((def.coolingCapacity||1)*100)}%`, 'good'),
        ...(cryo ? [row('Feeds', 'One Advanced Reactor (44 u/s Cryogenic Coolant)', 'good')] : []),
        row(cryo ? 'Cryo Out' : 'Coolant Rate', `${e._coldDrawn || 0} / ${def.coldOutput || 12} u/s`
                            + (e._coolServed ? `: ${e._coolServed} consumer${e._coolServed > 1 ? 's' : ''}` : ''),
                            e._coolServed ? 'good' : 'dim'),
        row('Status',      active ? 'Active' : 'Standby', active ? 'good' : 'dim'),
        row(cryo ? 'Cool Water In' : 'Water In', water[0], water[1]),
        reserveRow,
        row(cryo ? 'Output' : 'Coolant Out', cryo ? 'Cryogenic Coolant' : tempOut, cryo ? (active ? 'good' : 'dim') : tempClass),
        row('Pumps',       e._pumpTripped
                             ? (e.powered ? `Restarting: ${Math.ceil(e._pumpRestart || 0)}s` : `Tripped: waiting for power`)
                             : 'Running', e._pumpTripped ? 'bad' : 'good'),
        row('Power Draw',  `${formatPower(def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Outage Risk', `${Math.round((def.pumpTripChance ?? 0.4) * 100)}% chance pumps trip on power loss`, 'dim'),
        row('Footprint',   `${e.width || def.width}×${e.height || def.height} tiles`),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
      }
    }

    // ── Steam Turbine ────────────────────────────────────────────────
    else if (e.type === T.STEAMTURBINE || e.type === T.STEAMTURBINE2) {
      const def       = EntityDefs[e.type];
      const gen       = !!e._generating;
      const connected = !!e._steamConnected;
      const hasPower  = !!e._hasPower;
      const status    = !connected && !hasPower ? 'NO POWER OR STEAM' : !connected ? 'NO STEAM PIPE' : !hasPower ? 'NOT WIRED' : gen ? 'GENERATING' : 'STEAM STARVED';
      const stClass   = gen ? 'good' : (connected || hasPower) ? 'neutral' : 'bad';
      titleEl.textContent  = def.label || 'Steam Turbine';
      titleEl.style.color  = e.type === T.STEAMTURBINE2 ? '#7af5ff' : '#40e0ff';
      statusEl.textContent = status;
      statusEl.className   = `ep-status ${stClass}`;
      section(
        row('Function',     'Converts reactor steam → electricity; needs both', 'dim'),
        row('Steam Pipe',   connected ? 'Piped to a running reactor' : 'No pipe run to a reactor', connected ? 'good' : 'bad'),
        row('Grid Wiring',  hasPower ? 'Wire connected' : 'Not wired', hasPower ? 'good' : 'bad'),
        row('Steam Draw',   `${def.steamDraw || 100} u/s steam (its full draw or none)`, 'dim'),
        row('Output',       gen ? `${formatPower(e._currentOutput || 0)}` : '0 kW', gen ? 'good' : 'dim'),
        row('Footprint',    `${e.width || 1}×${e.height || 1} tiles`),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Pump Jack ─────────────────────────────────────────────────────
    else if (e.type === T.PUMPJACK || e.type === T.PUMPJACK2) {
      const jdef     = EntityDefs[e.type];
      const isMk2    = e.type === T.PUMPJACK2;
      const dep      = e._linkedDeposit;
      const pressure = e._pressure !== undefined ? e._pressure : 1.0;
      const pct      = pressure;
      const depleted = pressure <= 0;
      const oilLeft  = dep ? Math.round((dep._totalUnits || 0) * pressure) : 0;
      const oilTotal = dep ? Math.round(dep._totalUnits || 0) : 0;
      titleEl.textContent  = jdef.label;
      titleEl.style.color  = isMk2 ? '#40c8e0' : '#d0a030';
      statusEl.textContent = depleted ? 'DEPLETED' : e.powered ? 'PUMPING' : 'UNPOWERED';
      statusEl.className   = `ep-status ${depleted ? 'bad' : e.powered ? 'good' : 'bad'}`;
      section(
        row('Crude Rate',    depleted ? '0 crude/s' : `${fmtFlow(e._crudeRate||0)} crude/s`, !depleted && e.powered ? 'good' : 'bad'),
        supportsRow(row, depleted ? 0 : (e._crudeRate || 0), EntityDefs[T.REFINERY].crudePerSec, EntityDefs[T.REFINERY].label || 'Oil Refinery', 'crude/s'),
        ...deliveryRows(e, row, 'nothing: pipe it to a Refinery or a Liquid Storage Tank'),
        ...(isMk2 ? [row('Pump Tier', `MK2: ×${OilSystem.PUMPJACK2_RATE_MULT.toFixed(1)} MK1 rate`, 'good')] : []),
        row('Power Draw',    `${formatPower(jdef.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Status',        e.powered ? 'Powered' : 'NEEDS POWER', e.powered ? 'good' : 'bad'),
        row('Deposit',       dep ? (dep._tierLabel || 'Oil Deposit') : 'Not linked', dep ? 'good' : 'bad'),
        row('Oil Remaining', dep ? `${oilLeft} units` : '—', pct > 0.5 ? 'good' : pct > 0.2 ? '' : 'bad'),
        bar(pct, '#d0a030'),
        row('Reservoir Pressure', `${Math.round(pct*100)}%`, pct > 0.5 ? 'good' : pct > 0.2 ? '' : 'bad'),
        row('Total Deposit Size', dep ? `${oilTotal} units` : '—'),
      );
      section(row('Upkeep', `-$${jdef.upkeep}/s`, 'bad'), row('Cost', formatMoney(jdef.cost)));
    }

    // ── Liquid Storage Tank ───────────────────────────────────────────
    else if (e.type === T.OILSTORAGE) {
      const crude = e._crude || 0;
      const cap   = OilSystem.getTankCapacity();
      const pct   = Math.round((crude / cap) * 100);
      const pal   = LIQUID_PALETTES[e._liquidType] || null;
      titleEl.textContent  = 'Liquid Storage Tank';
      titleEl.style.color  = pal ? pal.gauge : '#c09030';
      const online = OilSystem.tankOnline(e);
      statusEl.textContent = !online ? 'OFFLINE' : e._draining ? 'EMPTYING' : pct >= 99 ? 'FULL' : crude <= 0 ? 'EMPTY' : 'ACTIVE';
      statusEl.className   = `ep-status ${!online ? 'bad' : pct >= 99 ? 'neutral' : 'good'}`;
      section(
        row('Fluid Type',   pal ? pal.name : 'None: accepts any liquid'),
        row('Fluid Stored', `${Math.floor(crude)} / ${cap} units`),
        row('Fill Level',   `${pct}%`, pct >= 99 ? 'bad' : pct > 60 ? 'neutral' : 'good'),
        ...(() => { const hz = typeof LightningDamageSystem !== 'undefined' && LightningDamageSystem.hazardOf(e); return hz ? [row('Explosion Risk', `${hz.what}: levels ~${Math.round(hz.radius)} tiles if struck or burned`, 'bad')] : []; })(),
        row('Power Draw',   'None: no grid connection needed'),
        row('Upkeep',       `$${EntityDefs[T.OILSTORAGE].upkeep}/s`),
      );
      droneSupplyBlock(e, body, section, row);
      truckSupplyBlock(e, body, section, row);
      drainBlock(e, body, section, row);
    }

    // ── Storage Container (solid ore) ─────────────────────────────────
    else if (e.type === T.SOLIDSTORAGE) {
      const stored = e._stored || 0;
      const cap    = SolidStorageSystem.CAPACITY;
      const frac   = cap > 0 ? stored / cap : 0;
      const pct    = Math.round(frac * 100);
      const online = SolidStorageSystem.online(e);
      const inR    = e._inRate  || 0, outR = e._outRate || 0;
      const kind   = e._solidType
        ? (SolidStorageSystem.label(e._solidType) || e._solidType[0].toUpperCase() + e._solidType.slice(1))
          + (e._solidType === 'pellets' ? (e._pelletMode === 'dhe3' ? ' (D-He3)' : ' (D-T)') : '')
        : null;
      titleEl.textContent  = 'Storage Container';
      titleEl.style.color  = '#d09040';
      statusEl.textContent = !online ? 'OFFLINE' : e._draining ? 'EMPTYING' : pct >= 99 ? 'FULL' : stored <= 0 ? 'EMPTY'
                           : outR > inR + 0.5 ? 'DRAWING DOWN' : inR > 0.5 ? 'FILLING' : 'HOLDING';
      statusEl.className   = `ep-status ${!online ? 'bad' : e._draining || pct >= 99 ? 'neutral' : stored <= 0 ? 'neutral' : 'good'}`;
      section(
        row('Contents',     kind || 'Empty: accepts any belt-carried solid'),
        row('Stored',       `${Math.floor(stored).toLocaleString()} / ${cap.toLocaleString()} units`),
        bar(frac, '#d09040'),
        row('Fill Level',   `${pct}%`, pct >= 99 ? 'bad' : pct > 60 ? 'neutral' : 'good'),
        ...(() => { const hz = typeof LightningDamageSystem !== 'undefined' && LightningDamageSystem.hazardOf(e); return hz ? [row('Explosion Risk', `${hz.what}: levels ~${Math.round(hz.radius)} tiles if struck or burned`, 'bad')] : []; })(),
        row('Coming In',    `${inR.toFixed(1)} units/s`, inR > 0.05 ? 'good' : 'dim'),
        row('Going Out',    `${outR.toFixed(1)} units/s (max ${SolidStorageSystem.OUT_RATE})`, outR > 0.05 ? 'good' : 'dim'),
        row('OUT Belt',     e._outLinked ? (e._solidType === 'coal' || !e._solidType ? 'Feeding generators' : 'Belt connected') : 'Not connected', e._outLinked ? 'good' : 'dim'),
        ...(outR > inR + 0.5 && stored > 0 ? [row('Runs Dry In', `~${Math.ceil(stored / (outR - inR))}s`, 'neutral')] : []),
      );
      section(
        row('Power Draw',   'None: no grid connection needed'),
        row('Upkeep',       `$${EntityDefs[T.SOLIDSTORAGE].upkeep}/s`),
      );
      droneSupplyBlock(e, body, section, row);
      truckSupplyBlock(e, body, section, row);
      drainBlock(e, body, section, row);
    }

    // ── Gas Holder ─────────────────────────────────────────────────────
    else if (e.type === T.GASSTORAGE) {
      const stored = GasStorageSystem.stored(e);
      const cap    = GasStorageSystem.capacity();
      const frac   = cap > 0 ? stored / cap : 0;
      const pct    = Math.round(frac * 100);
      const online = GasStorageSystem.online(e);
      const inR    = e._inRate || 0, outR = e._outRate || 0;
      const color  = GasStorageSystem.color(e._gasType);
      titleEl.textContent  = 'Gas Holder';
      titleEl.style.color  = '#80d8ff';
      statusEl.textContent = !online ? 'OFFLINE' : e._draining ? 'EMPTYING' : pct >= 99 ? 'FULL' : stored <= 0 ? 'EMPTY'
                           : outR > inR + 0.5 ? 'DRAWING DOWN' : inR > 0.5 ? 'FILLING' : 'HOLDING';
      statusEl.className   = `ep-status ${!online ? 'bad' : e._draining || stored <= 0 || pct >= 99 ? 'neutral' : 'good'}`;
      section(
        row('Contents',     GasStorageSystem.label(e._gasType) || 'Empty: accepts hydrogen, nitrogen, ammonia, deuterium, tritium, helium or helium-3'),
        row('Stored',       `${Math.floor(stored).toLocaleString()} / ${cap.toLocaleString()} u`),
        bar(frac, color),
        row('Fill Level',   `${pct}%`, pct >= 99 ? 'bad' : pct > 60 ? 'neutral' : 'good'),
        ...(() => { const hz = typeof LightningDamageSystem !== 'undefined' && LightningDamageSystem.hazardOf(e); return hz ? [row('Explosion Risk', `${hz.what}: levels ~${Math.round(hz.radius)} tiles if struck or burned`, 'bad')] : []; })(),
        row('Coming In',    `${inR.toFixed(1)} u/s`, inR > 0.05 ? 'good' : 'dim'),
        row('Going Out',    `${outR.toFixed(1)} u/s`, outR > 0.05 ? 'good' : 'dim'),
        row('GAS OUT Line', e._outLinked ? 'Pipe connected' : 'Not connected', e._outLinked ? 'good' : 'dim'),
        ...(outR > inR + 0.5 && stored > 0 ? [row('Runs Dry In', `~${Math.ceil(stored / (outR - inR))}s`, 'neutral')] : []),
      );
      section(
        row('Intake Rule',  'Leaves a producer 5 seconds of its output', 'dim'),
        row('Power Draw',   'None: no grid connection needed'),
        row('Upkeep',       `$${EntityDefs[T.GASSTORAGE].upkeep}/s`),
      );
      droneSupplyBlock(e, body, section, row);
      truckSupplyBlock(e, body, section, row);
      drainBlock(e, body, section, row);
    }

    // ── Gas Station ────────────────────────────────────────────────────
    else if (e.type === T.GASSTATION) {
      const def       = EntityDefs[T.GASSTATION];
      const fuel      = e._fuelStored || 0;
      const cap       = def.storageCapacity || 400;
      const pct       = cap > 0 ? fuel / cap : 0;
      const connected = !!e._fuelConnected;
      titleEl.textContent  = 'Gas Station';
      titleEl.style.color  = '#ffc040';
      // A job site's depot runs on the client's deliveries (OilSystem.tickGasStation).
      const depot = !!e._fuelDepot;
      statusEl.textContent = depot ? 'CLIENT FUEL' : !e.powered ? 'OFFLINE' : !connected ? 'NO FUEL LINE' : pct >= 0.99 ? 'FULL' : 'ACTIVE';
      statusEl.className   = `ep-status ${depot ? 'good' : !e.powered ? 'bad' : !connected ? 'warn' : pct >= 0.99 ? 'neutral' : 'good'}`;
      section(
        row('Fuel Stored',     `${Math.floor(fuel)} / ${cap} units`, pct > 0.5 ? 'good' : pct > 0.15 ? 'warn' : 'bad'),
        bar(pct, '#ffc040'),
        // Fuel oil can come from a Refinery's FUEL OUT or a fuel-holding Liquid
        // Storage Tank — both count (_connectedRefineries includes tanks).
        row('Fuel Supply', depot ? 'Delivered by the client'
                           : connected
                             ? `${e._connectedRefineries || 0} fuel source${(e._connectedRefineries || 0) === 1 ? '' : 's'} piped in`
                             : 'Not connected: pipe fuel oil into FUEL IN', connected ? 'good' : 'bad'),
        ...(depot ? [] : [row('Pull Rate', `${connected ? def.pullRate || 8 : 0} / ${def.pullRate || 8} u/s fuel oil`, connected ? '' : 'dim')]),
        row('Power Draw',      depot ? 'None needed' : `${formatPower(def.powerInput)}`),
      );
      section(
        row('Refuel Cost', `${formatMoney(GasStationSystem.getRefuelCost())} (full tank)`),
        row('Refuel Time', `${GasStationSystem.getRefuelSeconds()}s (empty → full)`),
        row('Footprint',   `${def.width}×${def.height} tiles`),
      );
      section(row('Upkeep', `-$${def.upkeep}/s`, 'bad'), row('Cost', formatMoney(def.cost)));
    }

    // ── Aquifer Deposit ──────────────────────────────────────────────
    else if (e.type === T.AQUIFER) {
      titleEl.textContent  = e._tierLabel || 'Aquifer Deposit';
      titleEl.style.color  = '#20d4c8';
      statusEl.textContent = e._hasMine ? 'ACTIVE' : 'UNDEVELOPED';
      statusEl.className   = `ep-status ${e._hasMine ? 'good' : 'neutral'}`;
      section(
        row('Water Output', `${e._waterRate || 0} W/s`),
        row('Size',         `${e.width||5}×${e.height||5} tiles`),
        row('Status',       e._hasMine ? 'Extractor installed' : 'Place a Water Extractor here', e._hasMine ? 'good' : 'dim'),
        row('Inexhaustible', 'Yes', 'good'),
      );
    }

    // ── Water Extractor ───────────────────────────────────────────────
    else if (e.type === T.WATEREXTRACTOR) {
      titleEl.textContent  = 'Water Extractor';
      titleEl.style.color  = '#20d4c8';
      statusEl.textContent = !e.powered ? 'OFFLINE' : e._lakeConnected ? 'EXTRACTING' : 'NO WATER';
      statusEl.className   = `ep-status ${!e.powered ? 'bad' : e._lakeConnected ? 'good' : 'warn'}`;
      // Water is a metered supply: this extractor's rate is shared out among
      // the coal generators on the pipe network it feeds, oldest first.
      const wSupply = e._waterRate || 0;
      const wServed = e._waterServed || 0;
      const wNeed   = EntityDefs[T.COALGENERATOR].waterPerSecond || 8;
      const wSpare  = e._waterSpare || 0;
      section(
        row('Water Rate',  `${wSupply} units/s`, wSupply > 0 ? 'good' : 'dim'),
        row('Power Draw',  `${formatPower(EntityDefs[T.WATEREXTRACTOR].powerInput)}`),
        row('Lake',        e._lakeConnected ? 'Connected' : 'Not connected', e._lakeConnected ? 'good' : 'bad'),
        row('Supplying',   `${wServed} coal generator${wServed === 1 ? '' : 's'} · ${wServed * wNeed} units/s`,
                           wServed > 0 ? 'good' : 'dim'),
        row('Spare',       `${wSpare} units/s${wSpare >= wNeed ? '' : ': full'}`,
                           wSpare >= wNeed ? 'good' : 'warn'),
        row('Buffer',      `${(e._waterBuffer || 0).toFixed(1)} units`),
        row('Size',        '4×4 tiles'),
      );
      section(row('Cost', formatMoney(EntityDefs[T.WATEREXTRACTOR].cost)), row('Upkeep', `-$${EntityDefs[T.WATEREXTRACTOR].upkeep}/s`, 'bad'));
    }

    // ── Hydro Generator ───────────────────────────────────────────────
    else if (e.type === T.HYDROGENERATOR) {
      const tank  = e._waterTank || 0;
      const pct   = Math.min(1, tank / 100);
      titleEl.textContent  = 'Hydroelectric Generator';
      titleEl.style.color  = '#20d4ff';
      statusEl.textContent = !e.powered ? 'OFFLINE' : e._fuelled ? 'GENERATING' : 'NO WATER';
      statusEl.className   = `ep-status ${!e.powered ? 'bad' : e._fuelled ? 'good' : 'warn'}`;
      section(
        row('Output',       e._fuelled ? '120 kW' : '0 kW', e._fuelled ? 'good' : 'bad'),
        row('Water Tank',   `${tank.toFixed(0)} / 100 units`, pct > 0.5 ? 'good' : pct > 0.2 ? 'warn' : 'bad'),
        bar(pct, '#20d4c8'),
        row('Extractors',   `${e._connectedExtractors || 0} connected`, (e._connectedExtractors||0) > 0 ? 'good' : 'bad'),
      );
      section(row('Cost', formatMoney(EntityDefs[T.HYDROGENERATOR].cost)), row('Upkeep', `-$${EntityDefs[T.HYDROGENERATOR].upkeep}/s`, 'bad'));
    }

    // ── Coal Deposit ──────────────────────────────────────────────
    else if (e.type === T.COALDEPOSIT) {
      const pct = e.coalMax > 0 ? (e.coalAmount||0) / e.coalMax : 0;
      titleEl.textContent  = 'Coal Deposit';
      titleEl.style.color  = '#a09080';
      statusEl.textContent = pct > 0 ? 'AVAILABLE' : 'EXHAUSTED';
      statusEl.className   = `ep-status ${pct > 0 ? 'good' : 'bad'}`;
      section(
        row('Coal Remaining', `${Math.round(CoalSystem.coalLeft(e)).toLocaleString()}t`, pct > 0.5 ? 'good' : pct > 0.2 ? '' : 'bad'),
        bar(pct, '#a09080'),
        row('Capacity',  `${Math.round(CoalSystem.coalHeld(e)).toLocaleString()}t`),
        row('Size',      `${e.width||1}×${e.height||1} tiles`),
      );
      if (pct > 0) {
        const gPer = EntityDefs[T.COALGENERATOR].coalPerSecond;
        const mk1 = CoalSystem.coalPerSecondFor(e), mk2 = CoalSystem.coalPerSecondFor(e, true);
        section(row('Coal Mine',     `~${fmtFlow(mk1)} coal/s: runs ~${(Math.floor(mk1 / gPer * 10) / 10)} Coal Generators`, 'dim'),
                row('Coal Mine MK2', `~${fmtFlow(mk2)} coal/s: runs ~${(Math.floor(mk2 / gPer * 10) / 10)} Coal Generators`, 'dim'));
      }
    }

    // ── Reservoir (clicking any of its water) ─────────────────────
    else if (e.type === T.WATER && e._reservoirId !== undefined && typeof ReservoirSystem !== 'undefined' && ReservoirSystem.info(e._reservoirId)) {
      const r = ReservoirSystem.info(e._reservoirId);
      const sharing = r.atFloor && r.share < 0.999, full = r.fill >= 0.99;
      titleEl.textContent = 'Reservoir';
      titleEl.style.color = '#60c8ff';
      statusEl.textContent = sharing ? 'SHARING THE RIVER' : full ? 'FULL' : r.net > 0.05 ? 'FILLING' : r.net < -0.05 ? 'DRAINING' : 'STEADY';
      statusEl.className = `ep-status ${sharing || r.net < -0.05 ? 'warn' : 'good'}`;
      const per = v => `${(Math.round(v * 10) / 10).toLocaleString('en-US')} u/s`;
      section(
        row('Water Level', `${Math.round(r.level).toLocaleString('en-US')} / ${Math.round(r.capacity).toLocaleString('en-US')} (${Math.round(r.fill * 100)}%)`, r.atFloor ? 'warn' : r.fill > 0.5 ? 'good' : ''),
        bar(r.fill, '#3aa8e8'),
        row('Kept Above', `${Math.round(r.minFrac * 100)}%: below it, turbines run on the river alone`, 'dim'),
        row('Inflow', r.inflowSources ? `${per(r.inflow)} (${r.inflowSources} river tile${r.inflowSources === 1 ? '' : 's'})` : 'None: no river feeds it', r.inflowSources ? 'good' : 'bad'),
        row('Turbine Draw', `${per(r.draw)} (${r.turbines} turbine${r.turbines === 1 ? '' : 's'}, ${per(r.perTurbine)} each)`),
        ...(r.spill > 0 ? [row('Spilling', per(r.spill), 'dim')] : []),
        row('Net Flow', `${r.net >= 0 ? '+' : '−'}${per(Math.abs(r.net))}`, r.net > 0.05 ? 'good' : r.net < -0.05 ? 'bad' : ''),
      );
      section(
        row('Turbines Running', `${r.running} of ${r.turbines}`, r.turbines && r.running === r.turbines ? 'good' : r.running ? 'warn' : r.turbines ? 'bad' : 'dim'),
        ...(sharing ? [row('Each Turbine Gets', `${Math.round(r.share * 100)}% of its full flow`, 'warn')] : []),
        row('River Can Feed', `${r.sustainable} turbine${r.sustainable === 1 ? '' : 's'} at full flow`, r.turbines > r.sustainable ? 'warn' : 'dim'),
        row('Valley Head', `×${(Math.round(r.head * 100) / 100).toFixed(2)} generator output`, r.head > 1.01 ? 'good' : 'dim'),
        row('Surface', `${r.tiles} tiles`),
      );
      if (r.turbines > r.sustainable)
        section(row('', `More turbines than the river can feed: once the level reaches ${Math.round(r.minFrac * 100)}% they share its flow and each runs below full output.`, 'warn'));
    }

    // ── Tree ──────────────────────────────────────────────────────
    else if (e.type === T.TREE) {
      titleEl.textContent = 'Tree';
      titleEl.style.color = '#40a020';
      statusEl.textContent = BiofuelSystem.hasAnyPlaced() ? 'HARVESTABLE' : 'PLACE BIOFUEL GEN FIRST';
      statusEl.className = `ep-status ${BiofuelSystem.hasAnyPlaced() ? 'good' : 'bad'}`;
      section(
        row('Biofuel Yield', `${BiofuelSystem.yieldRange(4, 8)} biofuel`, 'good'),
        row('Harvest Time',  '1.5 seconds (hold RMB)'),
        row('Chop Status',   e._chopProgress > 0 ? `${Math.round(e._chopProgress*100)}%` : 'Not chopping'),
      );
    }

    // ── Bush ──────────────────────────────────────────────────────
    else if (e.type === T.BUSH) {
      titleEl.textContent = 'Bush';
      titleEl.style.color = '#30b020';
      statusEl.textContent = BiofuelSystem.hasAnyPlaced() ? 'HARVESTABLE' : 'PLACE BIOFUEL GEN FIRST';
      statusEl.className = `ep-status ${BiofuelSystem.hasAnyPlaced() ? 'good' : 'bad'}`;
      section(
        row('Biofuel Yield', `${BiofuelSystem.yieldRange(1, 5)} biofuel`, 'good'),
        row('Harvest Time',  '0.8 seconds (hold RMB)'),
        row('Chop Status',   e._chopProgress > 0 ? `${Math.round(e._chopProgress*100)}%` : 'Not chopping'),
      );
    }

    // ── Biofuel Generator ─────────────────────────────────────────
    else if (e.type === T.BIOFUELGEN) {
      const fuel   = e._biofuel || 0;
      const pct    = fuel / BiofuelSystem.FULL_TANK;
      const running = fuel >= BiofuelSystem.MIN_TO_RUN;
      titleEl.textContent = 'Biofuel Generator';
      titleEl.style.color = '#60c030';
      statusEl.textContent = running ? 'RUNNING' : fuel > 0 ? 'LOW FUEL' : 'EMPTY';
      statusEl.className = `ep-status ${running ? 'good' : 'bad'}`;
      section(
        row('Output',     running ? '3 kW' : '0 kW', running ? 'good' : 'bad'),
        row('Fuel',       `${fuel.toFixed(1)} / ${BiofuelSystem.FULL_TANK}`, running ? 'good' : 'warn'),
        bar(pct, '#50c020'),
        row('Burn Rate',  '1 biofuel/s (real time)'),
        row('Runtime',    running ? `~${Math.floor(fuel)}s remaining` : fuel > 0 ? `Need ${Math.ceil(BiofuelSystem.MIN_TO_RUN - fuel)} more to start` : 'Empty', running ? 'good' : fuel > 0 ? 'warn' : 'bad'),
      );
      section(
        row('Per Tree',   `${BiofuelSystem.yieldRange(4, 8)} biofuel (hold RMB 1.5s)`),
        row('To Unlock Wire', BiofuelSystem.getTotalCollected() >= 50 ? 'Unlocked ✓' : `${BiofuelSystem.getTotalCollected()}/50 collected`, BiofuelSystem.getTotalCollected() >= 50 ? 'good' : 'dim'),
        row('Total Collected', `${BiofuelSystem.getTotalCollected()} biofuel`),
        row('Research Unlock', BiofuelSystem.getTotalCollected() >= 125 ? 'Unlocked ✓' : `${BiofuelSystem.getTotalCollected()}/125`, BiofuelSystem.getTotalCollected() >= 125 ? 'good' : 'dim'),
      );
      section(row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'), row('Cost', formatMoney(e.def.cost)));
    }

    // ── Coal Mine ─────────────────────────────────────────────────
    else if (e.type === T.COALMINE || e.type === T.COALMINE2) {
      const isMk2 = e.type === T.COALMINE2;
      const dep = e._linkedDeposit;
      const depPct = dep && dep.coalMax > 0 ? (dep.coalAmount||0)/dep.coalMax : 0;
      titleEl.textContent  = isMk2 ? 'Coal Mine MK2' : 'Coal Mine';
      titleEl.style.color  = isMk2 ? '#ff9040' : '#ff8040';
      statusEl.textContent = !dep || dep.coalAmount <= 0 ? 'EXHAUSTED' : !e.powered ? 'UNPOWERED' : e._bufferFull ? 'BUFFER FULL' : 'MINING';
      statusEl.className   = `ep-status ${!dep || dep.coalAmount <= 0 || !e.powered ? 'bad' : e._bufferFull ? 'warn' : 'good'}`;
      section(
        // What it digs flat out, in the generator's own coal/s, and what it's
        // really sending down the belt right now.
        row('Mining Rate',  dep && dep.coalAmount > 0 ? `${fmtFlow(CoalSystem.minedPerSecond(e))} coal/s max${!e.powered ? ', when powered' : e._bufferFull ? ' (paused: buffer full)' : ''}` : '—',
                            dep && dep.coalAmount > 0 && e.powered && !e._bufferFull ? 'good' : 'dim'),
        supportsRow(row, CoalSystem.minedPerSecond(e), EntityDefs[T.COALGENERATOR].coalPerSecond, EntityDefs[T.COALGENERATOR].label || 'Coal Generator', 'coal/s'),
        ...deliveryRows(e, row, 'nothing: belt it to a Coal Generator or a Storage Container'),
        row('Power Draw',   `${formatPower(e.def.powerInput)}`, e.powered ? 'good' : 'bad'),
        row('Status',       e.powered ? 'Powered' : 'NEEDS POWER', e.powered ? 'good' : 'bad'),
        // In mined coal (CoalSystem.coalLeft), with how long it lasts at this
        // mine's full rate; it only drains while the mine is actually digging.
        row('Deposit',      dep ? (() => {
                              const left = CoalSystem.coalLeft(dep), rate = CoalSystem.minedPerSecond(e);
                              const secs = rate > 0 ? left / rate : 0;
                              const life = secs <= 0 ? '' : secs >= 3600 ? ` · ~${(secs / 3600).toFixed(1)}h at full rate` : ` · ~${Math.ceil(secs / 60)} min at full rate`;
                              return `${Math.round(left).toLocaleString()}t left${life}${e._bufferFull || !e.powered ? ' (not digging)' : ''}`;
                            })() : 'Not linked', dep && dep.coalAmount > 0 ? 'good' : 'bad'),
        bar(depPct, '#c06020'),
        row('Coal Buffer',  `${((e._coalBuffer)||0).toFixed(1)} / ${MINE_BUFFER_CAP}t`, e._bufferFull ? 'bad' : ''),
        ...(e._bufferFull ? [row('', 'Full: stopped mining. Belt it to a generator or a Storage Container', 'warn')] : []),
        row('Port Facing',  (isMk2 || CoalSystem.isYardMine(e))
          ? `${(e._rotation || 0) % 2 ? '↙ Bottom left' : '↘ Bottom right'}: R to flip`
          : ['↑ N','→ E','↓ S','← W'][e._rotation||0]),
      );
      section(row('Upkeep', `-$${e.def.upkeep}/s`, 'bad'), row('Cost', formatMoney(e.def.cost)));
    }

    // ── Conveyor Belt ─────────────────────────────────────────────
    else if (e.type === T.CONVEYOR) {
      titleEl.textContent  = e._udgBelt ? 'Underground Belt' : e._splitter ? 'Conveyor Splitter' : 'Conveyor Belt';
      titleEl.style.color  = '#c08030';
      statusEl.textContent = '—';
      statusEl.className   = 'ep-status neutral';
      // Detect what material this conveyor is carrying
      const dirs4 = [[0,-1],[0,1],[-1,0],[1,0]];
      const nbrs4  = dirs4.map(([dc,dr]) => GridManager.getEntity(e.col+dc, e.row+dr));
      const carriesUranium = e._isUraniumConveyor || nbrs4.some(n => n && n.type === T.URANIUMMINE);
      const carriesSulfur  = !carriesUranium && (e._isSulfurConveyor || nbrs4.some(n => n && (isSulfurMine(n) || n.type === T.CHEMICALPLANT)));
      const carriesLithium = !carriesUranium && !carriesSulfur && (e._isLithiumConveyor || nbrs4.some(n => n && n.type === T.LITHIUMMINE));
      const carriesRod     = !carriesUranium && !carriesSulfur && !carriesLithium && (e._isRodConveyor || nbrs4.some(n => n && n.type === T.FUELPLANT));
      const carriesSpentFuel = !carriesUranium && !carriesSulfur && !carriesLithium && !carriesRod && (e._isSpentFuelConveyor || nbrs4.some(n => n && (n.type === T.NUCLEARREACTOR || n.type === T.ADVREACTOR)));
      // The Reprocessing Plant's two product stubs sit on the same face, so
      // adjacency can't tell its outputs apart — only the stamped flag can.
      const carriesPlutonium = !carriesUranium && !carriesSulfur && !carriesLithium && !carriesRod && !carriesSpentFuel && !!e._isPlutoniumConveyor;
      const carriesRecovered = !carriesUranium && !carriesSulfur && !carriesLithium && !carriesRod && !carriesSpentFuel && !carriesPlutonium && !!e._isRecoveredConveyor;
      const carriesMox     = !carriesUranium && !carriesSulfur && !carriesLithium && !carriesRod && !carriesSpentFuel && !carriesPlutonium && !carriesRecovered &&
        (e._isMoxConveyor || nbrs4.some(n => n && n.type === T.MOXPLANT));
      const carriesCompound = !carriesUranium && !carriesSulfur && !carriesLithium && !carriesRod && !carriesSpentFuel && !carriesPlutonium && !carriesRecovered && !carriesMox &&
        (e._isLithiumCompoundConveyor || nbrs4.some(n => n && n.type === T.LITHIUMPROCESSPLANT));
      // D-He3 pellets, by the stamped flag only (the Fusion Fuel Plant's two
      // pellet stubs can't be told apart by adjacency either). Checked ahead
      // of D-T: without it a D-He3 belt fell through to the coal fallback.
      const carriesHe3Pellets = !carriesUranium && !carriesSulfur && !carriesLithium && !carriesRod && !carriesSpentFuel && !carriesPlutonium && !carriesRecovered && !carriesMox && !carriesCompound &&
        !!e._isHe3PelletConveyor;
      const carriesPlasma  = !carriesUranium && !carriesSulfur && !carriesLithium && !carriesRod && !carriesSpentFuel && !carriesPlutonium && !carriesRecovered && !carriesMox && !carriesCompound && !carriesHe3Pellets &&
        (e._isPlasmaFuelConveyor || nbrs4.some(n => n && (n.type === T.FUSIONFUELPLANT || n.type === T.HULKINGFUSIONREACTOR)));
      // What has actually been riding this tile (BeltCargo) beats any guess:
      // the stamped flags come and go with a source's stock, and a belt out of
      // a container its consumer empties as fast as it fills is unflagged most
      // of the time, which used to read as "coal".
      const seen = typeof BeltCargo !== 'undefined' && BeltCargo.kindAt ? BeltCargo.kindAt(e.col, e.row) : null;
      // Spent fuel names its leg: off a reactor it is bound for a pool, past
      // a pool's COOLED FUEL OUT for the Reprocessing Plant.
      const spentLbl = _spentFromPool(e, null) ? 'cooled spent fuel → Reprocessing Plant' : 'spent fuel → Spent Fuel Pool';
      const SEEN_LABEL = { coal: 'coal → generator', uranium: 'uranium ore → Fuel Plant', sulfur: 'sulfur → Chemical Plant', lithium: 'lithium ore',
        compound: 'lithium compound', rods: 'fuel rods → Reactor', mox: 'MOX rods → Advanced Reactor', spent: spentLbl,
        pellets: 'fuel pellets → Reactor', he3pellets: 'D-He3 fuel pellets → Advanced Fusion Reactor', plutonium: 'plutonium → Adv. Fuel Processing',
        recovered: 'recovered uranium', rareearth: 'rare earth ore → Leach Plant', oxide: 'rare earth oxide → Superconductor Mill', tape: 'HTS tape → Core Works' };
      const material = seen && SEEN_LABEL[seen.kind] ? SEEN_LABEL[seen.kind]
                     : carriesUranium ? 'uranium ore → Fuel Plant'
                     : carriesSulfur  ? 'sulfur → Chemical Plant'
                     : carriesLithium ? 'lithium ore'
                     : carriesRod     ? 'fuel rods → Reactor'
                     : carriesSpentFuel ? spentLbl
                     : carriesPlutonium ? 'plutonium → Adv. Fuel Processing'
                     : carriesRecovered ? 'recovered uranium'
                     : carriesMox     ? 'MOX rods → Advanced Reactor'
                     : carriesCompound ? 'lithium compound'
                     : carriesHe3Pellets ? 'D-He3 fuel pellets → Advanced Fusion Reactor'
                     : carriesPlasma  ? 'fuel pellets → Reactor'
                     : e._isRareEarthConveyor ? 'rare earth ore → Leach Plant'
                     : e._isOxideConveyor     ? 'rare earth oxide → Superconductor Mill'
                     : e._isTapeConveyor      ? 'HTS tape → Core Works'
                     : e._isCokeConveyor      ? 'coke → Graphitization Furnace'
                     : e._isGraphiteConveyor  ? 'graphite → Advanced Reactor'
                     // Coal is the one cargo with no stamped flag, so it used to be
                     // the fallback — and every belt that was not (yet) carrying
                     // anything read as "coal". Ask the same chain walk the belt
                     // renderer uses, and say so when the belt is simply empty.
                     : (typeof conveyorChainTouchesCoal === 'function' && conveyorChainTouchesCoal(e.col, e.row)) ? 'coal → generator'
                     : 'Nothing: not connected to a source';
      // The same cargo as a BeltCargo kind, for the Can Feed rows.
      const kind = seen && SEEN_LABEL[seen.kind] ? seen.kind
                 : carriesUranium ? 'uranium' : carriesSulfur ? 'sulfur' : carriesLithium ? 'lithium' : carriesRod ? 'rods'
                 : carriesSpentFuel ? 'spent' : carriesPlutonium ? 'plutonium' : carriesRecovered ? 'recovered' : carriesMox ? 'mox'
                 : carriesCompound ? 'compound' : carriesHe3Pellets ? 'he3pellets' : carriesPlasma ? 'pellets'
                 : e._isRareEarthConveyor ? 'rareearth' : e._isOxideConveyor ? 'oxide' : e._isTapeConveyor ? 'tape' : e._isCokeConveyor ? 'coke' : e._isGraphiteConveyor ? 'graphite'
                 : material === 'coal → generator' ? 'coal' : null;
      // With the line's own supply worked out, the Carrying row leaves its
      // rate to that: the stamp is one producer's, and on a mixed line not
      // even this cargo's.
      const feed = kind ? beltFeedRows(e, kind, row) : [];
      const hasLine = feed.some(r => r.includes('Line Supply'));
      section(
        row('Carrying',  hasLine ? material : withRate(material, e._flowRate)),
        ...feed,
        ...(e._udgBelt ? [
          row('Axis',    e._udgAxis === 'v' ? 'Vertical ▮ (hover + R to rotate)' : 'Horizontal ▬ (hover + R to rotate)', 'dim'),
          row('Tunnel',  (udgBeltPartner(e.col, e.row, e._udgAxis === 'v' ? 0 : 1, e._udgAxis === 'v' ? 1 : 0, e._udgAxis)
                       || udgBeltPartner(e.col, e.row, e._udgAxis === 'v' ? 0 : -1, e._udgAxis === 'v' ? -1 : 0, e._udgAxis))
                         ? 'Linked to its pair' : `No pair within ${UNDERGROUND_BELT_MAX_SPAN} tiles`, 'dim'),
          row('Upkeep',  `-$${EntityDefs[T.UNDERGNDCONVEYOR].upkeep}/s`, 'bad'),
        ] : []),
        ...(e._splitter && e.def?.upkeep ? [row('Upkeep', `-$${e.def.upkeep}/s`, 'bad')] : []),
        row('Cost',      `${formatMoney(beltPieceDef(e).cost)} per tile`),
      );
      if (e._splitter) splitterBlock(e, body, section, row);
    }

    // ── Pipe (surface) ──────────────────────────────────────────────
    else if (e.type === T.PIPE) {
      const mat = pipeMaterial(e);
      titleEl.textContent  = 'Pipe';
      titleEl.style.color  = '#20a0c0';
      statusEl.textContent = mat.flowing ? 'FLOWING' : 'IDLE';
      statusEl.className   = `ep-status ${mat.flowing ? 'good' : 'dim'}`;
      section(
        row('Function',  'Carries fluid between connected buildings', 'dim'),
        row('Carrying',  mat.label, mat.flowing ? 'good' : 'dim'),
        row('Running',   flowUnits(mat), mat.flowing && Number(mat.rate) > 0 ? 'good' : 'dim'),
        ...(e._underWater ? [row('Placement', 'Laid across water', 'dim')] : []),
      );
      section(...pipeNetworkRows(e, row));
      const _line = coolLineRows(e, row);
      if (_line.length) section(..._line);
      section(
        row('Cost',      `${formatMoney(EntityDefs[T.PIPE].cost)} per tile`),
        row('Upkeep',    `-$${EntityDefs[T.PIPE].upkeep}/s`, 'bad'),
      );
      // A Conveyor Splitter under the crossing: its controls live here now.
      if (e._underConveyor && e._underConveyor._splitter) {
        section(row('Under it', 'Conveyor Splitter', 'dim'));
        splitterBlock(e._underConveyor, body, section, row);
      }
    }

    // ── Underground Pipe ──────────────────────────────────────────
    else if (e.type === T.UNDERGNDPIPE) {
      const mat = pipeMaterial(e);
      titleEl.textContent  = 'Underground Pipe';
      titleEl.style.color  = '#1880a0';
      statusEl.textContent = mat.flowing ? 'FLOWING' : 'IDLE';
      statusEl.className   = `ep-status ${mat.flowing ? 'good' : 'dim'}`;
      section(
        row('Function',  'Passes fluid underground, skipping surface tiles', 'dim'),
        row('Axis',      e._udgAxis === 'v' ? 'Vertical ▮ (hover + R to rotate)' : 'Horizontal ▬ (hover + R to rotate)', 'dim'),
        row('Carrying',  mat.label, mat.flowing ? 'good' : 'dim'),
        row('Running',   flowUnits(mat), mat.flowing && Number(mat.rate) > 0 ? 'good' : 'dim'),
      );
      section(...pipeNetworkRows(e, row));
      const _line = coolLineRows(e, row);
      if (_line.length) section(..._line);
      section(
        row('Cost',      `${formatMoney(EntityDefs[T.UNDERGNDPIPE].cost)} per tile`),
        row('Upkeep',    `-$${EntityDefs[T.UNDERGNDPIPE].upkeep}/s`, 'bad'),
      );
    }
    else if (e.type === T.COALGENERATOR) {
      const hasFuel  = e._fuelled;
      const hasWater = e._hasWater;
      const running  = hasFuel && hasWater;
      const _cgMode     = EntityDefs[T.COALGENERATOR].throttleModes[e._cgThrottle] || EntityDefs[T.COALGENERATOR].throttleModes.normal;
      const coalPerSec  = +(EntityDefs[T.COALGENERATOR].coalPerSecond * _cgMode.coal).toFixed(2);
      const waterPerSec = EntityDefs[T.COALGENERATOR].waterPerSecond;
      titleEl.textContent  = 'Coal Generator';
      titleEl.style.color  = '#ff6030';
      const ashPct     = e._ashWaste || 0;
      const statusText = ashPct >= 100 ? 'ASH FULL'
                       : e._waterShort ? 'LOW WATER'
                       : !hasWater ? 'NO WATER'
                       : !hasFuel ? 'NO FUEL' : 'GENERATING';
      const statusCls  = running ? 'good' : 'bad';
      statusEl.textContent = statusText;
      statusEl.className   = `ep-status ${statusCls}`;
      section(
        row('Output',       running ? `${formatPower(Math.round(e.def?.powerOutput ?? EntityDefs[T.COALGENERATOR].powerOutput))}` : '0 kW: offline', running ? 'good' : 'bad'),
        row('Coal Draw',    `${coalPerSec} coal/s when running`),
        row('Water Draw',   `${waterPerSec} units/s when running`),
        row('Coal',         hasFuel  ? 'Supplied ✓' : 'NOT SUPPLIED', hasFuel  ? 'good' : 'bad'),
        ...receivingRows(e, row),
        row('Water',        hasWater ? `${waterPerSec} / ${waterPerSec} u/s ✓`
                            : e._waterShort ? `0 / ${waterPerSec} u/s: extractor is at capacity`
                            : `0 / ${waterPerSec} u/s: needs pipe from Water Extractor`, hasWater ? 'good' : 'bad'),
        row('Footprint',    `${e.width||3}×${e.height||4} tiles`),
      );
      section(
        row('Total Mined',  `${Math.floor(CoalSystem.getTotalMined())}t`),
        row('Upkeep',       `-$${EntityDefs[T.COALGENERATOR].upkeep}/s`, 'bad'),
      );
      const _ashPct = Math.round(e._ashWaste || 0);
      section(
        row('Ash/Slag Buildup', `${_ashPct}%`, _ashPct >= 80 ? 'bad' : _ashPct >= 60 ? 'neutral' : 'good'),
        ...(_ashPct >= 60 ? [row('Waste Facility', 'Spawned: deliver by truck', 'neutral')] : []),
      );
    }

    // Nothing above claimed this type — give it the basics rather than an
    // empty body. Reached by the specialised-panel types listed at the top
    // of this function, which only arrive here once they've been struck.
    if (body.children.length === 0) {
      section(
        row('Footprint', `${e.width || 1}×${e.height || 1} tiles`),
        ...(e.def.powerOutput ? [row('Output', `${formatPower(e.def.powerOutput)}`)] : []),
        ...(e.def.powerInput  ? [row('Power draw', `${formatPower(e.def.powerInput)}`, 'bad')] : []),
      );
      section(
        row('Cost', formatMoney(e.upfrontPaid || e.def.cost || 0)),
        ...(e.def.upkeep ? [row('Upkeep', `-$${e.def.upkeep}/s`, 'bad')] : []),
      );
    }

    // Any other building handing material down a belt or pipe (processing
    // plants, Storage Containers, tanks …): where it is really going. Mines
    // and pump jacks show theirs inside their own panel above.
    if (!_OWN_DELIVERY_ROWS.has(e.type) && typeof FlowMeter !== 'undefined' && FlowMeter.outOf(e).length) {
      section(...deliveryRows(e, row));
    }

    // Distinguish multiple instances of the same utility/generation
    // building — see NUMBERED_ENTITY_TYPES in core.js.
    if (e._num !== undefined && typeof NUMBERED_ENTITY_TYPES !== 'undefined' && NUMBERED_ENTITY_TYPES.has(e.type)) {
      titleEl.textContent += ` #${e._num}`;
    }

    // Lightning damage overrides whatever status the per-type branch above
    // computed — a struck building is neither POWERED nor merely OFFLINE,
    // and the distinction matters because it earns nothing at all until
    // repaired (see economy.js). Appended last so no branch can clobber it.
    if (e._lightningDamaged) {
      const _fixing = LightningDamageSystem.isRepairing(e);
      const _pct    = Math.round(LightningDamageSystem.repairProgress(e) * 100);
      statusEl.textContent = e._irreparable ? '☢ DESTROYED' : _fixing ? '🔧 REPAIRING' : '⚡ STRUCK';
      statusEl.className   = `ep-status ${_fixing ? 'warn' : 'bad'}`;
      const s = document.createElement('div');
      s.className = 'ep-section';
      s.innerHTML = e._irreparable
        ? row('Nuclear Blast', 'Destroyed: irreparable', 'bad')
          + row('Clear Wreckage', formatMoney(LightningDamageSystem.wreckClearCost(e)) + ': no refund', 'bad')
          + row('', 'No output, no income. Delete it to clear the site.', 'dim')
        : _fixing
        ? row('Repair', `${_pct}% complete`, 'warn')
          + bar(LightningDamageSystem.repairProgress(e), '#e0a040')
          + row('', `Still offline until the crew finishes`, 'dim')
        : row('Lightning Damage', 'Offline: no output, no income', 'bad')
          + (e._fireOut ? row('Fire', 'Put out by rain; still needs repair', 'warn') : '')
          + row('', `Repair takes ~${Math.max(1, Math.round(LightningDamageSystem.repairSeconds(e) / 60))} min once dispatched`, 'dim');
      body.insertBefore(s, body.firstChild);
      // Several per-type branches print the generator's rated/weather figure
      // (def.powerOutput) rather than what it's delivering — a wreck delivers
      // nothing, so don't let an Output row contradict the banner above.
      // The same goes for the activity bar under it (a wind turbine's tracks
      // the wind, so it kept moving on a wreck), and for every other
      // "<thing> Output" row.
      const _why = e._irreparable ? 'destroyed' : _fixing ? 'under repair' : e._fireOut ? 'offline' : 'burning';
      for (const r of body.querySelectorAll('.ep-row')) {
        if (s.contains(r)) continue;
        const lbl = r.querySelector('.ep-label')?.textContent.trim() || '';
        const power = lbl === 'Output' || lbl === 'Producing';
        if (!power && !lbl.endsWith(' Output')) continue;
        const v = r.querySelector('.ep-value');
        if (v) { v.textContent = `${power ? '0 kW' : lbl === 'Steam Output' ? '0 u/s' : '0'}: ${_why}`; v.className = 'ep-value bad'; }
        const fill = r.nextElementSibling?.classList.contains('ep-bar-wrap') && r.nextElementSibling.querySelector('.ep-bar-fill');
        if (fill) fill.style.width = '0%';
      }
    }

    // A customer still being built (construction_system.js) has no fee or
    // demand of its own yet — only the site's load — so the same goes here.
    if (e._constructing) {
      const _p = ConstructionSystem.progress(e), _wait = (e._buildDone || 0) < 0;
      statusEl.textContent = _wait ? '🏗 QUEUED' : '🏗 UNDER CONSTRUCTION';
      statusEl.className   = 'ep-status warn';
      const s = document.createElement('div');
      s.className = 'ep-section';
      s.innerHTML = row('Construction', _wait ? 'Waiting for the lots before it' : `${Math.round(_p * 100)}% built`, 'warn')
        + bar(_p, '#e0a040')
        + row('Ready in', ConstructionSystem.formatSecs(ConstructionSystem.secondsLeft(e)), 'warn')
        + (_wait ? ''
          : e._sitePowered ? row('Site power', `${formatPower(ConstructionSystem.drawW(e))}: full speed`, 'good')
          : row('Site power', `Not on the grid: diesel generator, ${Math.round(ConstructionSystem.UNPOWERED_SPEED * 100)}% speed`, 'bad'))
        + row('', 'Takes no customer power and pays no fee until it\'s finished', 'dim');
      body.insertBefore(s, body.firstChild);
      // The customer rows below were written for a building that's open:
      // a site isn't in blackout and isn't earning, and its load is the crew's.
      for (const r of body.querySelectorAll('.ep-row')) {
        if (s.contains(r)) continue;
        const lblEl = r.querySelector('.ep-label'), v = r.querySelector('.ep-value');
        const lbl = lblEl?.textContent.trim() || '';
        if (!v) continue;
        if (lbl === 'Status') { v.textContent = 'Under construction'; v.className = 'ep-value warn'; }
        else if (lbl === 'Revenue' || lbl === 'Income') { v.textContent = '$0/s until it\'s built'; v.className = 'ep-value dim'; }
        else if (lbl === 'Load Now') { lblEl.textContent = 'Site Load'; v.textContent = formatPower(e._liveDemand || 0, 1); v.className = 'ep-value'; }
      }
    }

    reposition();
  }

  const DEMOLISH_PCT  = 0.75;
  const RELOCATE_PCT  = 0.40;

  // State for the confirm overlay
  let pendingAction = null;   // 'demolish' | 'relocate'
  let relocateLocations = null;
  let relocateEntity    = null;

  function actionsEl()   { return document.getElementById('ep-actions'); }
  function confirmEl()   { return document.getElementById('ep-confirm'); }
  function confirmMsg()  { return document.getElementById('ep-confirm-msg'); }
  function confirmYes()  { return document.getElementById('ep-confirm-yes'); }

  function hideConfirm() {
    confirmEl().classList.remove('visible');
    pendingAction = null;
  }

  function showActions(e) {
    const isCustomer = e.fromRequest && CUSTOMER_TYPES.has(e.type);
    actionsEl().style.display = isCustomer ? 'flex' : 'none';
    hideConfirm();
  }

  function askDemolish() {
    const e = target;
    if (e && e._irreparable) { InputManager.askClearWreck(e); return; }
    // Same rule as every other removal path (waste / full tanks).
    const _held = typeof wasteBlocksRemoval === 'function' ? wasteBlocksRemoval(e) : null;
    if (_held !== null) { wasteRemovalBlockedToast(e, _held); return; }
    const fine = Math.round((e.upfrontPaid || 0) * DEMOLISH_PCT);
    const canAfford = Economy.canAfford(fine);
    pendingAction = 'demolish';
    confirmMsg().textContent =
      `Permanently remove this building.\nPenalty: ${formatMoney(fine)} (${Math.round(DEMOLISH_PCT*100)}% of upfront).` +
      (canAfford ? '' : '\n⚠ Insufficient funds!');
    confirmYes().disabled = !canAfford;
    confirmEl().classList.add('visible');
  }

  function askRelocate() {
    const e = target;
    const fine = Math.round((e.upfrontPaid || 0) * RELOCATE_PCT);
    const canAfford = Economy.canAfford(fine);
    pendingAction = 'relocate';
    confirmMsg().textContent =
      `Move this building to a new site: pick one of the lettered sites on the map.\nPenalty: ${formatMoney(fine)} (${Math.round(RELOCATE_PCT*100)}% of upfront).` +
      (canAfford ? '' : '\n⚠ Insufficient funds!');
    confirmYes().disabled = !canAfford;
    confirmEl().classList.add('visible');
  }

  function executeDemolish() {
    const e = target;
    const fine = Math.round((e.upfrontPaid || 0) * DEMOLISH_PCT);
    if (!Economy.canAfford(fine)) return;
    Economy.spend(fine);
    if (e.width > 1 || e.height > 1) GridManager.removeEntityFootprint(e);
    else GridManager.removeEntity(e.col, e.row);
    showToast(`Building demolished: ${formatMoney(fine)} penalty`, '#ff6040', '#180800', '#602010');
    hideConfirm();
    target = null;
    panel().classList.remove('visible');
    actionsEl().style.display = 'none';
  }

  function executeRelocate() {
    const e = target;
    const fine = Math.round((e.upfrontPaid || 0) * RELOCATE_PCT);
    if (!Economy.canAfford(fine)) return;
    Economy.spend(fine);

    const needsSub = e.type === T.COMMERCIAL || e.type === T.INDUSTRIAL;
    const locs = HouseRequestSystem.freshLocations(needsSub, e);
    if (!locs || locs.length === 0) {
      showToast('⚠ No valid relocation sites found.', '#ff8040', '#180a00', '#804020');
      hideConfirm();
      return;
    }

    const from = { col: e.col, row: e.row };
    if (e.width > 1 || e.height > 1) GridManager.removeEntityFootprint(e);
    else GridManager.removeEntity(e.col, e.row);
    ZoneSystem.removeBuilding(e); // call AFTER removing from grid so scan doesn't re-add it
    hideConfirm();
    target = null;
    panel().classList.remove('visible');
    actionsEl().style.display = 'none';
    // Cancelling puts it back where it stood and refunds the penalty.
    RelocatePicker.start(e, locs, { fine, from });
  }

  function initButtons() {
    document.getElementById('ep-relocate-btn').addEventListener('click', askRelocate);
    document.getElementById('ep-demolish-btn').addEventListener('click', askDemolish);
    document.getElementById('ep-confirm-yes').addEventListener('click', () => {
      if (pendingAction === 'demolish') executeDemolish();
      else if (pendingAction === 'relocate') executeRelocate();
    });
    document.getElementById('ep-confirm-no').addEventListener('click', hideConfirm);
  }

  return {
    get target() { return target; },
    isOpen,
    initButtons,

    open(entity) {
      if (!entity || !entity.def) return;
      target = entity;
      panel().classList.add('visible');
      try { buildContent(); } catch(err) { console.error('EntityInfoPanel open error:', err); }
      showActions(entity);  // always show/hide buttons regardless of buildContent errors
      reposition();
    },

    close() {
      target = null;
      panel().classList.remove('visible');
      actionsEl().style.display = 'none';
      hideConfirm();
    },

    refresh() {
      if (!isOpen() || !target) return;
      try { buildContent(); } catch(err) {}
    },

    tick() {
      if (!isOpen()) return;
      // Must be the SAME object still occupying that tile, not just
      // something/anything — a stale `target` (e.g. left over across a
      // save/load reload, which recreates every entity fresh) would
      // otherwise keep passing this check forever, freezing the panel on
      // whatever fields the old, now-untouched object last had.
      if (!target || GridManager.getEntity(target.col, target.row) !== target) { this.close(); return; }
      try { buildContent(); } catch(err) { console.error('EntityInfoPanel error:', err); this.close(); }
    },
  };
})();

