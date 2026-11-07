/* ═══════════════════════════════════════════════════════════════════
   WIRE TOOLS
   Wire repair selector and wire inspector overlay.
   ═══════════════════════════════════════════════════════════════════ */

// Repairs every storm-opened wire on the map in one go. It used to open a
// window of its own (the fault count, the bill and a Repair All button) on
// top of the wire's panel, so a repair was two windows and two clicks. Now
// the wire panel's own button starts it: the bill is on that button, the
// work takes REPAIR_DURATION, and the button shows the progress.
const WireRepairSelector = (() => {
  let _selected = new Set();
  let _repairing = false;
  let _repairProgress = 0; // game-seconds accumulated, scaled by DevMode.timeScale
  let _lastTickTime = 0;   // wall-clock anchor, used only to measure frame delta
  const REPAIR_DURATION = 8; // game seconds (now scales with fast-forward)

  function costPer() {
    const base = Progression.isUnlocked(T.COALGENERATOR) ? 150 : 75;
    return hasActiveMonitor() ? Math.round(base*0.75) : base;
  }
  function failedCount() {
    let n = 0;
    for (const e of EntityRegistry.getByType(T.WIRE)) if (e._weatherFailed) n++;
    return n;
  }
  // What repairing every fault on the map would cost right now.
  function totalCost() { return costPer() * failedCount(); }

  // Pays for and starts the repair of every failed wire. False if there is
  // nothing to repair, one is already under way, or the money is not there.
  function repairAll() {
    if (_repairing) return false;
    _selected.clear();
    for (const e of EntityRegistry.getByType(T.WIRE)) if (e._weatherFailed) _selected.add(e);
    if (_selected.size === 0) return false;
    const total = costPer() * _selected.size;
    if (!Economy.canAfford(total)) { _selected.clear(); showToast('Not enough funds to repair', '#ff4040', '#140000', '#600000'); return false; }
    Economy.spend(total);
    _repairing = true;
    _repairProgress = 0;
    _lastTickTime = performance.now();
    showToast(`🔧 Repairing ${_selected.size} wire${_selected.size!==1?'s':''}... (${total.toLocaleString()})`, '#c06020', '#100800', '#503010');
    return true;
  }

  function tick() {
    if (!_repairing) return;
    const now = performance.now();
    const frameDt = (now - _lastTickTime) / 1000;
    _lastTickTime = now;
    // Real seconds → game seconds via the current speed multiplier, same as
    // every other timed system. At 0× (paused) progress simply holds.
    const speed = (typeof DevMode !== 'undefined') ? DevMode.timeScale : 1;
    _repairProgress += frameDt * speed;
    if (_repairProgress >= REPAIR_DURATION) {
      // Replacing the cable puts the fire on it out — so a bulk repair
      // also stops that stretch of line passing the fire along.
      _selected.forEach(e => { e._weatherFailed = false; e.failed = false;
                               LightningDamageSystem.clearWireFire?.(e); });
      PowerNetwork.recomputeWireHops();
      if (typeof GridBreakWatch !== 'undefined') GridBreakWatch.noteChanged();
      showToast(`✅ All wires repaired`, '#40c060', '#001408', '#0a4020');
      _repairing = false;
      _repairProgress = 0;
      _selected.clear();
    }
  }

  return {
    repairAll, tick, costPer, failedCount, totalCost,
    isRepairing: () => _repairing,
    progress: () => _repairing ? Math.min(1, _repairProgress / REPAIR_DURATION) : 0,
    has: (e) => _selected.has(e),
  };
})();

const WireInspector = (() => {
  let target = null;

  function panel()   { return document.getElementById('wire-panel'); }
  function bodyEl()  { return document.getElementById('wp-body'); }
  function statusEl(){ return document.getElementById('wp-status'); }
  function titleEl() { return document.getElementById('wp-title'); }

  function _countFailedWires() {
    let n = 0;
    for (const e of EntityRegistry.getByType(T.WIRE)) if (e._weatherFailed) n++;
    return n;
  }

  function getNetworkStats(netId) {
    let gen = 0, con = 0, wires = 0, consumers = 0, generators = 0, overloaded = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const e = GridManager.getEntity(c, r);
        if (!e || e.networkId !== netId) continue;
        if (e.col !== c || e.row !== r) continue; // anchor only for multi-tile
        gen += e.def.powerOutput || 0;
        const dynDemand = DemandCurves.get(e.type, e.commercialSubtype, DayNight.hour());
        con += (dynDemand !== null) ? dynDemand : (e._activePowerInput ?? e.def.powerInput ?? 0);
        if (e.type === T.WIRE) { wires++; if (e.overloaded) overloaded++; }
        else if (e.type !== T.POLE) {
          if (e.def.powerOutput > 0) generators++;
          if ((e.def.powerInput || 0) > 0 || dynDemand) consumers++;
        }
      }
    }
    return { gen, con, wires, consumers, generators, overloaded, surplus: gen - con };
  }

  function refresh() {
    if (!target || !panel().classList.contains('visible')) return;
    const netId = target.networkId;
    const isPole = target.type === T.POLE;
    titleEl().textContent = isPole ? 'POLE NETWORK' : 'WIRE NETWORK';

    // A conductor that doesn't conduct — out of hop range, or an open
    // circuit from overload or storm damage — is rejected as a neighbour by
    // PowerNetwork.canConnect, so it floods into a component all of its own.
    // That id is an artifact, not a network: every dead segment along a run
    // would name a different one. Report no network and say why instead.
    const deadReason = target.outOfRange       ? `over ${PowerNetwork.getWireHops()} tiles from an anchor`
                     : target._weatherFailed   ? 'storm damage has opened this run'
                     : target.failed           ? 'burned out, the circuit is open'
                     : null;
    const onNet  = netId >= 0 && !deadReason;
    const netRow = (val, cls) => `<div class="wp-row"><span class="wp-label">Network</span><span class="wp-val ${cls}">${val}</span></div>`;

    if (!onNet) {
      statusEl().textContent = 'ISOLATED';
      bodyEl().innerHTML =
        netRow(deadReason ? `None: ${deadReason}` : 'None, not connected', 'bad') +
        (target.outOfRange
          ? `<div class="wp-row"><span class="wp-label">Wire hops</span><span class="wp-val bad">OUT OF RANGE</span></div>`
          : '');
    } else {

    const s = getNetworkStats(netId);
    const surplus = s.surplus;
    const surplusClass = surplus > 0.05 ? 'good' : surplus < -0.05 ? 'bad' : 'warn';
    const loadPct = s.gen > 0 ? Math.round((s.con / s.gen) * 100) : (s.con > 0 ? 999 : 0);

    // Same name the GRID panel shows (custom name or POWER NETWORK n) — the
    // raw networkId is re-assigned by flood fill every tick and means nothing
    // to the player.
    const netName = getNetworkDisplayName(netId);
    const esc = (v) => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    statusEl().textContent = netName;

    bodyEl().innerHTML = `
      ${netRow(esc(netName), 'good')}
      <hr class="wp-divider">
      <div class="wp-row"><span class="wp-label">Generated</span><span class="wp-val good">${formatPower(s.gen, 1)}</span></div>
      <div class="wp-row"><span class="wp-label">Consumed</span><span class="wp-val">${formatPower(s.con, 1)}</span></div>
      <div class="wp-row"><span class="wp-label">Surplus</span><span class="wp-val ${surplusClass}">${surplus >= 0 ? '+' : ''}${formatPower(surplus, 1)}</span></div>
      <hr class="wp-divider">
      <div class="wp-row"><span class="wp-label">This wire load</span><span class="wp-val ${target.overloaded ? 'bad' : target.load > 0 ? 'warn' : ''}">${formatPower((target.load || 0), 1)}</span></div>
      <div class="wp-row"><span class="wp-label">Wire hops</span><span class="wp-val ${target.outOfRange ? 'bad' : ''}">${target.outOfRange ? 'OUT OF RANGE' : (target.hopCount ?? '—')}</span></div>
      <hr class="wp-divider">
      <div class="wp-row"><span class="wp-label">Wires in net</span><span class="wp-val">${s.wires}</span></div>
      ${s.overloaded > 0 ? `<div class="wp-row"><span class="wp-label">Overloaded</span><span class="wp-val bad">${s.overloaded}</span></div>` : ''}
      <div class="wp-row"><span class="wp-label">Generators</span><span class="wp-val">${s.generators}</span></div>
      <div class="wp-row"><span class="wp-label">Consumers</span><span class="wp-val">${s.consumers}</span></div>
      ${target._weatherFailed ? `<hr class="wp-divider"><div class="wp-row"><span class="wp-label" style="color:#ff4020">⚡ FAULT</span><span class="wp-val bad">Weather damage</span></div>` : ''}
    `;
    }

    // Repair button
    let _rb = document.getElementById('wp-repair-btn');
    if (!_rb) {
      _rb = document.createElement('button');
      _rb.id = 'wp-repair-btn';
      _rb.style.cssText = 'width:calc(100% - 16px);margin:6px 8px 4px;padding:6px;background:#1a0800;border:1px solid #804020;color:#ff6030;font-family:monospace;font-size:10px;cursor:pointer;border-radius:3px;';
      _rb.addEventListener('mousedown', e => e.stopPropagation());
      _rb.addEventListener('click', e => {
        e.stopPropagation();
        if (!target || !target._weatherFailed || WireRepairSelector.has(target)) return;
        const _cost = WireRepairSelector.costPer();
        if (!Economy.canAfford(_cost)) { showToast('Not enough funds to repair', '#ff4040', '#140000', '#600000'); return; }
        Economy.spend(_cost);
        target._weatherFailed = false;
        target.failed = false;
        LightningDamageSystem.clearWireFire?.(target);
        PowerNetwork.recomputeWireHops();
        if (typeof GridBreakWatch !== 'undefined') GridBreakWatch.noteChanged();
        showToast('✅ Wire repaired', '#40c060', '#001408', '#0a4020');
        refresh();
      });
      panel().appendChild(_rb);
    }
    if (target._weatherFailed && !WireRepairSelector.has(target)) {
      _rb.textContent = `⚡ Repair Wire: $${WireRepairSelector.costPer()}`;
      _rb.style.display = 'block';
    } else {
      _rb.style.display = 'none';
    }

    // Repair-all-faults shortcut, shown regardless of whether this specific
    // wire is failed — lets the player fix faults elsewhere without hunting
    // for the exact failed segment. One click starts it: the bill is on the
    // button, and while the crews are out the button is the progress.
    let _rab = document.getElementById('wp-repair-all-btn');
    if (!_rab) {
      _rab = document.createElement('button');
      _rab.id = 'wp-repair-all-btn';
      _rab.style.cssText = 'width:calc(100% - 16px);margin:2px 8px 6px;padding:6px;background:#1a0800;border:1px solid #804020;color:#ff8040;font-family:monospace;font-size:10px;cursor:pointer;border-radius:3px;';
      _rab.addEventListener('mousedown', e => e.stopPropagation());
      _rab.addEventListener('click', e => {
        e.stopPropagation();
        if (WireRepairSelector.repairAll()) refresh();
      });
      panel().appendChild(_rab);
    }
    const _failedCount = _countFailedWires();
    if (WireRepairSelector.isRepairing()) {
      _rab.textContent = `🔧 Repairing… ${Math.round(WireRepairSelector.progress() * 100)}%`;
      _rab.style.display = 'block'; _rab.style.opacity = '0.6'; _rab.style.cursor = 'default';
    } else if (_failedCount > (target._weatherFailed ? 1 : 0)) {
      // (On a failed wire with no other fault, Repair Wire above is the same thing.)
      _rab.textContent = `⚡ Repair All Faults (${_failedCount}): $${WireRepairSelector.totalCost().toLocaleString()}`;
      _rab.style.display = 'block'; _rab.style.opacity = '1'; _rab.style.cursor = 'pointer';
    } else {
      _rab.style.display = 'none';
    }
  }

  function reposition() {
    if (!target) return;
    const p = panel();
    const { x: wx, y: wy } = GridManager.tileToWorld(target.col, target.row);
    // Convert world → screen using same formula as SolarPanelInspector
    const screenX = (wx + TILE) * Camera.zoom - Camera.x * Camera.zoom + 8;
    const screenY = wy          * Camera.zoom - Camera.y * Camera.zoom;

    const W  = window.innerWidth, H = window.innerHeight;
    const pw = p.offsetWidth  || 220;
    const ph = p.offsetHeight || 180;

    let left = screenX;
    let top  = screenY;

    if (left + pw > W - 10) left = screenX - TILE * Camera.zoom - pw - 8;
    if (top  + ph > H - 10) top  = H - ph - 10;
    if (top  < 10)          top  = 10;
    if (left < 10)          left = 10;

    p.style.bottom = '';
    p.style.right  = '';
    p.style.left   = `${Math.round(left)}px`;
    p.style.top    = `${Math.round(top)}px`;
    keepPanelOnScreen(p);
  }

  return {
    get target() { return target; },
    isOpen() { return !!panel()?.classList.contains('visible'); },
    open(entity) {
      const p = panel(); if (!p) return;
      target = entity;
      p.classList.add('visible');
      refresh();      // fill it first, so it's placed at its real size
      reposition();
    },
    close() {
      target = null;
      panel()?.classList.remove('visible');
    },
    tick() { if (panel()?.classList.contains('visible')) refresh(); },
    init() {
      document.getElementById('wp-close').addEventListener('click', () => WireInspector.close());
    },
  };
})();

