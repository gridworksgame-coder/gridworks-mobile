/* ═══════════════════════════════════════════════════════════════════
   POWER PLANT PANELS
   Detail panels for refinery, fuel generator, turbine, shaft, and dam.
   ═══════════════════════════════════════════════════════════════════ */

const RefineryPanel = (() => {
  let target = null;
  const ID = 'refinery-panel';

  function panel() { return document.getElementById(ID); }
  function _initClose() {
    const btn = document.getElementById('rp-close');
    if (btn && !btn._bound) { btn._bound = true; btn.addEventListener('click', () => { target = null; panel().classList.remove('visible'); }); }
  }
  function isOpen() { const p = document.getElementById(ID); return !!target && !!p && p.classList.contains('visible'); }

  function reposition() {
    if (!target) return;
    const { x: wx, y: wy } = GridManager.tileToWorld(target.col, target.row);
    const sx = (wx + (target.width||5)*TILE) * Camera.zoom - Camera.x * Camera.zoom + 8;
    const sy = wy * Camera.zoom - Camera.y * Camera.zoom;
    const p = panel(), pw = 210, ph = p.offsetHeight || 220;
    let left = sx, top = sy;
    if (left + pw > window.innerWidth  - 10) left = sx - (target.width||5)*TILE * Camera.zoom - pw - 8;
    if (top  + ph > window.innerHeight - 10) top  = window.innerHeight - ph - 10;
    if (top  < 10) top  = 10;
    if (left < 10) left = 10;
    p.style.left = `${Math.round(left)}px`;
    p.style.top  = `${Math.round(top)}px`;
    keepPanelOnScreen(p);
  }

  // Light gases (LPG). Before the LPG OUT port exists every unit is flared;
  // after, it shows the port, the recovered stock and what still flares.
  function _lpgRow(e, running) {
    const def  = EntityDefs[T.REFINERY];
    const sub  = (label, value, color) => `<div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">${label}</span><span class="sp-label" style="color:${color || 'var(--text)'}">${value}</span></div>`;
    const made = running ? (e._lpgRate || 0) : 0;
    const flare = running ? (e._lpgFlareRate || 0) : 0;
    if (!refineryLpgUnlocked()) {
      return `
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Light gases (LPG)</span><span class="sp-value" style="color:#ff9070">${running ? 'Flared' : 'Idle'}</span></div>
        ${running ? sub('Burned at flare stack', `${made.toFixed(2)}/s`) : ''}
      </div>`;
    }
    const lpg = e._lpg || 0, cap = def.lpgCapacity;
    const state = !e._lpgPiped ? ['No pipe: flaring', '#ff9070']
      : !running               ? ['Idle', 'var(--text-dim)']
      : flare > 0.001          ? ['Full: flaring surplus', '#ffb040']
      :                          ['Recovering', '#60d040'];
    return `
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">LPG</span><span class="sp-value hi">${Math.floor(lpg)} / ${cap}</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.round(Math.min(1, lpg / cap) * 100)}%;background:#ff7a5a"></div></div>
        ${sub('LPG OUT', state[0], state[1])}
        ${running ? sub('Producing', `${made.toFixed(2)} LPG/s`) : ''}
        ${flare > 0.001 ? sub('Flaring', `${flare.toFixed(2)}/s`, '#ff9070') : ''}
      </div>`;
  }

  function refresh() {
    if (!target) return;
    const crude     = target._crudeBuffer || 0;
    const fuelOil   = target._fuelOil || 0;
    const cap       = EntityDefs[T.REFINERY].fuelCapacity || 400;
    const fuelPct   = Math.min(1, fuelOil / cap);
    const status    = target._refStatus || 'offline';
    const crudeRate = (target._crudeRate || 0).toFixed(1);
    const fuelRate  = (target._fuelRate  || 0).toFixed(1);
    // Full with nothing on the end of FUEL OUT is a plumbing fault, not a
    // refinery that has caught up with demand: say so.
    const deadEnd   = fuelOil > 0.01 && target._fuelConsumers === 0;
    const statusLabel = status === 'full' && deadEnd ? 'FULL: OUTLET NOT CONNECTED'
      : { running:'RUNNING', no_crude:'NO CRUDE', full:'TANK FULL', waste_full:'SLUDGE FULL', offline:'OFFLINE' }[status] || 'OFFLINE';
    const outNote = target._fuelConsumers === undefined || fuelOil <= 0.01 ? null
      : !target._fuelOutPiped ? ['No pipe on the outlet (bottom centre)', '#e04020']
      : deadEnd ? ['Pipe reaches no generator, station or tank', '#e04020']
      : [`Feeding ${target._fuelConsumers}`, '#60d040'];
    const statusColor = { running:'#c0a030', no_crude:'#c05020', full:'#e06010', waste_full:'#e02020', offline:'#506040' }[status] || '#506040';
    const st = document.getElementById('rp-status');
    if (st) { st.textContent = statusLabel; st.className = `sp-status ${status==='running'?'active':'offline'}`; st.style.color = statusColor; }
    const bd = document.getElementById('rp-body');
    if (bd) bd.innerHTML = `
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Fuel Oil</span><span class="sp-value hi">${Math.round(fuelOil)} / ${cap}</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.round(fuelPct*100)}%;background:#c09030"></div></div>
        ${outNote ? `<div class="sp-row-header" style="margin-top:3px"><span class="sp-label" style="font-size:7px">FUEL OUT</span><span class="sp-label" style="color:${outNote[1]}">${outNote[0]}</span></div>` : ''}
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Crude buffer</span><span class="sp-value">${crude.toFixed(1)} units</span></div>
        <div class="sp-row-header" style="margin-top:3px"><span class="sp-label" style="font-size:7px">Consuming</span><span class="sp-label" style="color:var(--text)">${status==='running' ? crudeRate : 0} / ${EntityDefs[T.REFINERY].crudePerSec} crude/s</span></div>
        ${status==='running' ? `<div class="sp-row-header"><span class="sp-label" style="font-size:7px">Producing</span><span class="sp-label" style="color:var(--text)">${fuelRate} fuel/s</span></div>` : ''}
      </div>
      ${_lpgRow(target, status === 'running')}
      ${PollutionSystem.panelRows(target)}
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Power draw</span><span class="sp-value" style="color:#ff8040">${formatPower(EntityDefs[T.REFINERY].powerInput)}</span></div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Cost</span><span class="sp-value">$${EntityDefs[T.REFINERY].cost.toLocaleString()}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label">Upkeep</span><span class="sp-value" style="color:#ff6040">-$${EntityDefs[T.REFINERY].upkeep}/s</span></div>
      </div>
      ${(() => { const sp = Math.round(target._sludgeWaste || 0); const sc2 = sp >= 80 ? '#ff6040' : sp >= 60 ? '#e0a020' : '#80c040'; return `<div class="sp-row"><div class="sp-row-header"><span class="sp-label">Sludge Buildup</span><span class="sp-value" style="color:${sc2}">${sp}%</span></div>${sp >= 60 ? `<div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">Waste facility spawned</span><span class="sp-label" style="color:var(--text)">Deliver by truck</span></div>` : ''}</div>`; })()}`;
    reposition();
  }

  return {
    get target() { return target; },
    isOpen,
    open(entity) { target = entity; _initClose(); panel().classList.add("visible"); SFX.windowpop?.(); const _t = document.getElementById('rp-title'); if (_t) _t.textContent = 'Oil Refinery' + (entity._num !== undefined ? ` #${entity._num}` : ''); reposition(); refresh(); if (!this._interval) this._interval = setInterval(() => { if (this.isOpen()) { this.tick(); } else { clearInterval(this._interval); this._interval = null; } }, 250); },
    close() { target = null; document.getElementById(ID)?.classList.remove('visible'); },
    tick() { if (!isOpen()) return; if (!target || !GridManager.getEntity(target.col, target.row)) { this.close(); return; } refresh(); },
  };
})();

// Governor status row shared by the Fuel and Coal Generator panels — empty
// when no Throttle Governor touches the generator.
function _governorRow(gen, throttleKey) {
  if (!gen._governorCount) return '';
  const trim = gen._govTrim || 0;
  const [txt, col] = !gen._governed ? ['Unpowered', '#e04020']
    : throttleKey !== 'overdrive'  ? ['Standby', 'var(--text-dim)']
    : trim > 0.02                  ? [`Trimming ${Math.round(trim * 100)}%`, '#ffb040']
    :                                ['Holding', '#60d040'];
  return `
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">⚙ Governor${gen._governorCount > 1 ? ` ×${gen._governorCount}` : ''}</span><span class="sp-value" style="color:${col}">${txt}</span></div>
      </div>`;
}

// Safety label under the throttle buttons on the Fuel and Coal Generator
// panels. Overdrive has no trip any more — held at 100% it explodes — so an
// unprotected generator always says so, louder when Overdrive is selected.
// Only Overdrive can get it there: Eco and Normal settle well short of 100%
// heat or pressure (0.62 / 0.65 at Normal, entity_defs.js throttleModes),
// so the label says that rather than warn of a blast Normal can't cause.
function _governorWarning(gen, throttleKey) {
  const box = (border, bg, color, html) => `
      <div class="sp-row">
        <div style="border:1px solid ${border};background:${bg};color:${color};border-radius:3px;padding:3px 5px;font-size:7px;line-height:1.35">${html}</div>
      </div>`;
  if (gen._governed) {
    return box('#2a5a30', 'rgba(60,200,80,0.08)', '#70d070', '✓ Protected by a Throttle Governor; Overdrive is safe');
  }
  const locked = typeof Progression !== 'undefined' && !Progression.isUnlocked(T.GOVERNOR);
  const how = locked ? ' (unlocks with a Research Station MK3 once a generator goes critical)' : '';
  if (gen._governorCount > 0) {
    return box('#a02010', 'rgba(255,40,20,0.14)', '#ff7050',
      '<b>⚠ GOVERNOR UNPOWERED</b>: this generator is NOT protected. Overdrive can melt it down and explode.');
  }
  const hot = throttleKey === 'overdrive';
  return box(hot ? '#a02010' : '#6a5020', hot ? 'rgba(255,40,20,0.14)' : 'rgba(255,170,40,0.07)', hot ? '#ff7050' : '#e0b060',
    hot
      ? `<b>⚠ UNPROTECTED IN OVERDRIVE</b>: Overdrive drives it to 100%, and held there too long the generator explodes, destroying nearby buildings, pipes, wires and belts and setting off nearby generators. Place a Throttle Governor touching it${how}.`
      : `<b>⚠ NOT PROTECTED IN OVERDRIVE</b>: safe at Eco and Normal. In Overdrive it climbs to 100%, and held there too long it explodes, destroying nearby buildings, pipes, wires and belts and setting off nearby generators. Place a Throttle Governor touching it${how} to make Overdrive safe.`);
}

const FuelGenPanel = (() => {
  let target = null;
  const ID = 'fuelgen-panel';

  function panel() { return document.getElementById(ID); }
  function _initClose() {
    const btn = document.getElementById('fg-close');
    if (btn && !btn._bound) { btn._bound = true; btn.addEventListener('click', () => { target = null; panel().classList.remove('visible'); }); }
  }
  function isOpen() { const p = document.getElementById(ID); return !!target && !!p && p.classList.contains('visible'); }

  function reposition() {
    if (!target) return;
    const { x: wx, y: wy } = GridManager.tileToWorld(target.col, target.row);
    const sx = (wx + (target.width||5)*TILE) * Camera.zoom - Camera.x * Camera.zoom + 8;
    const sy = wy * Camera.zoom - Camera.y * Camera.zoom;
    const p = panel(), pw = 210, ph = p.offsetHeight || 220;
    let left = sx, top = sy;
    if (left + pw > window.innerWidth  - 10) left = sx - (target.width||5)*TILE * Camera.zoom - pw - 8;
    if (top  + ph > window.innerHeight - 10) top  = window.innerHeight - ph - 10;
    if (top  < 10) top  = 10;
    if (left < 10) left = 10;
    p.style.left = `${Math.round(left)}px`;
    p.style.top  = `${Math.round(top)}px`;
    keepPanelOnScreen(p);
  }

  const STATE_LABELS = {
    running: ['GENERATING', 'active'], spinup: ['SPINNING UP', 'active'], starved: ['FUEL STARVED', 'offline'], coasting: ['COASTING', 'offline'],
    cranking: ['CRANKING', 'offline'], overheat: ['OVERHEAT', 'offline'], nogrid: ['NO GRID', 'offline'],
    critical: ['MELTDOWN', 'offline'], wrecked: ['WRECKED', 'offline'],
    nopipe: ['NO PIPE', 'offline'], nofuel: ['NO FUEL', 'offline'],
  };

  // Throttle buttons are rebuilt every refresh, so listen on the stable body
  // element. pointerdown (not click) so a re-render between press and release
  // can't swallow the input.
  function _initThrottle() {
    const bd = document.getElementById('fg-body');
    if (!bd || bd._throttleBound) return;
    bd._throttleBound = true;
    bd.addEventListener('pointerdown', ev => {
      const btn = ev.target.closest?.('[data-fg-throttle]');
      if (!btn || !target) return;
      OilSystem.setFuelGenThrottle(target, btn.dataset.fgThrottle);
      SFX.click?.();
      refresh();
    });
  }

  function refresh() {
    if (!target) return;
    const def      = EntityDefs[T.FUELGEN];
    const modes    = def.throttleModes;
    const tKey     = modes[target._fgThrottle] ? target._fgThrottle : 'normal';
    const mode     = modes[tKey];
    const fuelTank = target._fuelTank || 0;
    const tankCap  = 60;
    const tankPct  = Math.min(1, fuelTank / tankCap);
    const output   = target._fuelled ? (target.def?.powerOutput || 0) : 0;
    const maxOut   = def.powerOutput * modes.overdrive.output;
    const rpm      = target._fgRpm  || 0;
    const heat     = target._fgHeat || 0;
    const state    = target._fgState || (target._fuelled ? 'running' : 'nofuel');
    const refs     = target._connectedRefineries || 0;
    const [statusLabel, statusCls] = STATE_LABELS[state] || STATE_LABELS.nofuel;
    const st = document.getElementById('fg-status');
    if (st) { st.textContent = statusLabel; st.className = `sp-status ${statusCls}`; }
    const heatCol  = heat > 0.9 ? '#ff3020' : heat > 0.7 ? '#e0a020' : '#40c040';
    const mdLeft   = MeltdownSystem.timeLeft(target);
    const heatNote = state === 'wrecked' ? (target._rebuildFrac > 0 ? 'Engine destroyed: rebuild to restart' : 'Engine wrecked: repair to restart')
      : state === 'critical' ? `<span style="color:#ff4020;font-weight:bold">CRITICAL: EXPLODES IN ${Math.ceil(mdLeft || 0)}s! Ease off now</span>`
      : mdLeft !== null ? `<span style="color:#ffa040">Cooling from critical: ${Math.ceil(MeltdownSystem.coolingLeft(target))}s</span>`
      : state === 'overheat' ? `Tripped: cooling ${Math.ceil(target._fgTrip || 0)}s`
      : state === 'cranking' ? 'Starter motor engaged'
      : mode.heat >= 1 && heat > 0.5 ? (target._governed ? 'Governor will ease off before it goes critical' : 'Heading for meltdown: ease off!')
      : heat < 0.45 && target._fuelled ? 'Warming up (reduced output)'
      : 'Stable';
    const runtime  = fuelTank / mode.fuel;
    const btn = key => {
      const m = modes[key], sel = key === tKey;
      return `<button data-fg-throttle="${key}" style="flex:1;padding:3px 0;font:inherit;font-size:8px;cursor:pointer;border-radius:3px;
        border:1px solid ${sel ? m.color : '#2a3a4a'};background:${sel ? m.color + '33' : 'transparent'};color:${sel ? m.color : 'var(--text)'}">${m.label}</button>`;
    };
    const bd = document.getElementById('fg-body');
    if (bd) bd.innerHTML = `
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Output</span><span class="sp-value hi">${formatPower(Math.round(output))}</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.round(Math.min(1, output / maxOut) * 100)}%;background:#ffa020"></div></div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Throttle</span><span class="sp-label" style="color:${mode.color}">${Math.round(mode.output*100)}% · ${mode.fuel} fuel/s</span></div>
        <div style="display:flex;gap:3px;margin-top:3px">${btn('eco')}${btn('normal')}${btn('overdrive')}</div>
      </div>${_governorWarning(target, tKey)}${_governorRow(target, tKey)}
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Engine</span><span class="sp-value" style="color:${rpm > 1.2 ? '#ff5030' : 'var(--text)'}">${Math.round(rpm * 1800)} RPM</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.round(Math.min(1, rpm / 1.5) * 100)}%;background:#f0d060"></div></div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Heat</span><span class="sp-value" style="color:${heatCol}">${Math.round(heat * 100)}%</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.round(Math.min(1, heat) * 100)}%;background:${heatCol}"></div></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">${heatNote}</span></div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Fuel tank</span><span class="sp-value" style="color:${tankPct<0.2?'#e04020':'#c09030'}">${state === 'starved' ? 'Burned as it arrives' : `${Math.round(fuelTank)} / ${tankCap}`}</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.round(tankPct*100)}%;background:${tankPct<0.2?'#e04020':'#c09030'}"></div></div>
        <div class="sp-row-header" style="margin-top:2px">${state === 'starved'
          ? `<span class="sp-label" style="font-size:7px">Supply vs demand</span><span class="sp-label" style="color:#e04020">${Math.round((target._fgFuelFrac || 0) * 100)}%</span>`
          : `<span class="sp-label" style="font-size:7px">Runtime at this throttle</span><span class="sp-label" style="color:var(--text)">${Math.floor(runtime)}s</span>`}</div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Fuel sources linked</span><span class="sp-value" style="color:${refs>0?'#c0a030':'#805020'}">${refs}</span></div>
      </div>
      ${PollutionSystem.panelRows(target)}
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Cost</span><span class="sp-value">$${EntityDefs[T.FUELGEN].cost.toLocaleString()}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label">Upkeep</span><span class="sp-value" style="color:#ff6040">-$${EntityDefs[T.FUELGEN].upkeep}/s</span></div>
      </div>`;
    LightningDamageSystem.attachRepairUI(panel(), target, refresh);   // wrecked by lightning or an explosion
    reposition();
  }

  return {
    get target() { return target; },
    isOpen,
    open(entity) { target = entity; _initClose(); _initThrottle(); panel().classList.add("visible"); SFX.windowpop?.(); const _t = document.getElementById('fg-title'); if (_t) _t.textContent = 'Fuel Generator' + (entity._num !== undefined ? ` #${entity._num}` : ''); reposition(); refresh(); if (!this._interval) this._interval = setInterval(() => { if (this.isOpen()) { this.tick(); } else { clearInterval(this._interval); this._interval = null; } }, 250); },
    close() { target = null; document.getElementById(ID)?.classList.remove('visible'); },
    tick() { if (!isOpen()) return; if (!target || !GridManager.getEntity(target.col, target.row)) { this.close(); return; } refresh(); },
  };
})();

const CoalGenPanel = (() => {
  let target = null;
  const ID = 'coalgen-panel';

  function panel() { return document.getElementById(ID); }
  function _initClose() {
    const btn = document.getElementById('cg-close');
    if (btn && !btn._bound) { btn._bound = true; btn.addEventListener('click', () => { target = null; panel().classList.remove('visible'); }); }
  }
  function isOpen() { const p = document.getElementById(ID); return !!target && !!p && p.classList.contains('visible'); }

  function reposition() {
    if (!target) return;
    const { x: wx, y: wy } = GridManager.tileToWorld(target.col, target.row);
    const sx = (wx + (target.width||5)*TILE) * Camera.zoom - Camera.x * Camera.zoom + 8;
    const sy = wy * Camera.zoom - Camera.y * Camera.zoom;
    const p = panel(), pw = 250, ph = p.offsetHeight || 260;
    let left = sx, top = sy;
    if (left + pw > window.innerWidth  - 10) left = sx - (target.width||5)*TILE * Camera.zoom - pw - 8;
    if (top  + ph > window.innerHeight - 10) top  = window.innerHeight - ph - 10;
    if (top  < 10) top  = 10;
    if (left < 10) left = 10;
    p.style.left = `${Math.round(left)}px`;
    p.style.top  = `${Math.round(top)}px`;
    keepPanelOnScreen(p);
  }

  const STATE_LABELS = {
    running: ['GENERATING', 'active'], warming: ['RAISING STEAM', 'active'], starved: ['COAL STARVED', 'offline'],
    unfed: ['NO COAL FEED', 'offline'], nowater: ['NO WATER', 'offline'], lowwater: ['LOW WATER', 'offline'],
    ashfull: ['ASH FULL', 'offline'], tripped: ['SAFETY TRIP', 'offline'], nogrid: ['NO GRID', 'offline'],
    critical: ['MELTDOWN', 'offline'], wrecked: ['WRECKED', 'offline'],
  };

  // Throttle buttons are rebuilt every refresh, so listen on the stable body
  // element — same approach as FuelGenPanel.
  function _initThrottle() {
    const bd = document.getElementById('cg-body');
    if (!bd || bd._throttleBound) return;
    bd._throttleBound = true;
    bd.addEventListener('pointerdown', ev => {
      const btn = ev.target.closest?.('[data-cg-throttle]');
      if (!btn || !target) return;
      CoalSystem.setGeneratorThrottle(target, btn.dataset.cgThrottle);
      SFX.click?.();
      refresh();
    });
  }

  function refresh() {
    if (!target) return;
    const def      = EntityDefs[T.COALGENERATOR];
    const modes    = def.throttleModes;
    const tKey     = modes[target._cgThrottle] ? target._cgThrottle : 'normal';
    const mode     = modes[tKey];
    const running  = target._fuelled && target._hasWater;
    const output   = running ? (target.def?.powerOutput || 0) : 0;
    const maxOut   = def.powerOutput * modes.overdrive.output;
    const coalRate = def.coalPerSecond * mode.coal;
    const hopper   = target._hopperCoal || 0;
    const hopCap   = CoalSystem.getHopperCapacity();
    const hopPct   = Math.min(1, hopper / hopCap);
    const pressure = target._cgPressure || 0;
    const ash      = Math.round(target._ashWaste || 0);
    let state      = target._cgState || (running ? 'running' : 'unfed');
    if (state === 'nowater' && target._waterShort) state = 'lowwater';
    if ((state === 'running' || state === 'warming') && !target.powered) state = 'nogrid';
    const [statusLabel, statusCls] = STATE_LABELS[state] || STATE_LABELS.unfed;
    const st = document.getElementById('cg-status');
    if (st) { st.textContent = statusLabel; st.className = `sp-status ${statusCls}`; }

    const pCol  = pressure > 0.9 ? '#ff3020' : pressure > 0.7 ? '#e0a020' : '#40c040';
    const mdLeft = MeltdownSystem.timeLeft(target);
    const pNote = state === 'wrecked' ? (target._rebuildFrac > 0 ? 'Boiler destroyed: rebuild to relight' : 'Boiler wrecked: repair to relight')
      : state === 'critical' ? `<span style="color:#ff4020;font-weight:bold">CRITICAL: BOILER BURSTS IN ${Math.ceil(mdLeft || 0)}s! Ease off now</span>`
      : mdLeft !== null ? `<span style="color:#ffa040">Bleeding off from critical: ${Math.ceil(MeltdownSystem.coolingLeft(target))}s</span>`
      : state === 'tripped' ? `Safety valve lifted: venting ${Math.ceil(target._cgTrip || 0)}s`
      : mode.pressure >= 1 && pressure > 0.5 ? (target._governed ? 'Governor will ease off before it goes critical' : 'Heading for a boiler burst; ease off!')
      : state === 'warming' ? 'Raising steam (reduced output)'
      : running ? 'Stable'
      : 'Fire banked';
    const hopNote = state === 'unfed'
      ? `<span class="sp-label" style="font-size:7px">Coal feed</span><span class="sp-label" style="color:#e04020">No powered mine on the belt</span>`
      : state === 'starved'
      ? `<span class="sp-label" style="font-size:7px">Coal feed</span><span class="sp-label" style="color:#e04020">Mine can't keep up</span>`
      : `<span class="sp-label" style="font-size:7px">Runtime at this throttle</span><span class="sp-label" style="color:var(--text)">${Math.floor(hopper / coalRate)}s</span>`;
    const waterNeed = def.waterPerSecond;
    const waterTxt  = target._hasWater ? `${waterNeed} / ${waterNeed} u/s` : target._waterShort ? `0 / ${waterNeed} u/s · extractor short` : `0 / ${waterNeed} u/s · not piped in`;
    const ashCol    = ash >= 80 ? '#ff6040' : ash >= 60 ? '#e0a020' : '#80c040';
    const btn = key => {
      const m = modes[key], sel = key === tKey;
      return `<button data-cg-throttle="${key}" style="flex:1;padding:3px 0;font:inherit;font-size:8px;cursor:pointer;border-radius:3px;
        border:1px solid ${sel ? m.color : '#2a3a4a'};background:${sel ? m.color + '33' : 'transparent'};color:${sel ? m.color : 'var(--text)'}">${m.label}</button>`;
    };
    const bd = document.getElementById('cg-body');
    if (bd) bd.innerHTML = `
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Output</span><span class="sp-value hi">${formatPower(Math.round(output))}</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.round(Math.min(1, output / maxOut) * 100)}%;background:#ff7030"></div></div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Throttle</span><span class="sp-label" style="color:${mode.color}">${Math.round(mode.output*100)}% · ${+coalRate.toFixed(2)} coal/s</span></div>
        <div style="display:flex;gap:3px;margin-top:3px">${btn('eco')}${btn('normal')}${btn('overdrive')}</div>
      </div>${_governorWarning(target, tKey)}${_governorRow(target, tKey)}
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Boiler pressure</span><span class="sp-value" style="color:${pCol}">${Math.round(pressure * 100)}%</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.round(Math.min(1, pressure) * 100)}%;background:${pCol}"></div></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">${pNote}</span></div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Coal hopper</span><span class="sp-value" style="color:${hopPct<0.2?'#e04020':'#b0a090'}">${hopper.toFixed(1)} / ${+hopCap.toFixed(1)}</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.round(hopPct*100)}%;background:${hopPct<0.2?'#e04020':'#8a8070'}"></div></div>
        <div class="sp-row-header" style="margin-top:2px">${hopNote}</div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Water</span><span class="sp-value" style="color:${target._hasWater ? '#50a0e0' : '#e04020'}">${waterTxt}</span></div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Ash buildup</span><span class="sp-value" style="color:${ashCol}">${ash}% · ${Math.round(mode.ash*100)}% rate</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${ash}%;background:${ashCol}"></div></div>
        ${ash >= 60 ? `<div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">Waste facility spawned</span><span class="sp-label" style="color:var(--text)">Deliver by truck</span></div>` : ''}
      </div>
      ${PollutionSystem.panelRows(target)}
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Cost</span><span class="sp-value">$${def.cost.toLocaleString()}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label">Upkeep</span><span class="sp-value" style="color:#ff6040">-$${def.upkeep}/s</span></div>
      </div>`;
    LightningDamageSystem.attachRepairUI(panel(), target, refresh);   // wrecked by lightning or an explosion
    reposition();
  }

  return {
    get target() { return target; },
    isOpen,
    open(entity) { target = entity; _initClose(); _initThrottle(); panel().classList.add("visible"); SFX.windowpop?.(); const _t = document.getElementById('cg-title'); if (_t) _t.textContent = 'Coal Generator' + (entity._num !== undefined ? ` #${entity._num}` : ''); reposition(); refresh(); if (!this._interval) this._interval = setInterval(() => { if (this.isOpen()) { this.tick(); } else { clearInterval(this._interval); this._interval = null; } }, 250); },
    close() { target = null; document.getElementById(ID)?.classList.remove('visible'); },
    tick() { if (!isOpen()) return; if (!target || !GridManager.getEntity(target.col, target.row)) { this.close(); return; } refresh(); },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   HOUSE REQUEST SYSTEM
   When the player generates enough power, families appear wanting to
   connect to the grid. Each request offers an upfront payment + daily
   fee. The player accepts (places house within substation range) or
   declines. Houses are never placed by the player directly.
   ═══════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════
   WIRE / POLE NETWORK INSPECTOR
   Shows per-network power stats when clicking a wire or pole.
   ═══════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════
   AMENITY REQUEST SYSTEM
   Properties can issue a one-time request for a street lamp nearby.
   - Fires 60–180s after placement
   - Pin shown above property on canvas
   - Fulfillment: lamp placed within 2 tiles → +15 satisfaction
   - Penalty: after 120s unfulfilled, satisfaction drifts -0.5/s
   - Expiry: after 240s total, -10 satisfaction, never requests again
   ═══════════════════════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════════════════════
   COAL SYSTEM
   Manages Resource Survey Stations and Coal Deposit spawning.
   - Survey takes 90s while station is powered
   - On completion, spawns 4–8 coal deposits in the outer 25% of map
   - Each deposit is 1×1, 2×2, or 3×3 with varying coal amount
   - 1-hour cooldown per station after a successful survey
   ═══════════════════════════════════════════════════════════════════ */
// ─── Particle System ──────────────────────────────────────────────

/* ═══════════════════════════════════════════════════════════════════
   HYDRO TURBINE / SHAFT-GENERATOR / DAM PANELS
   ═══════════════════════════════════════════════════════════════════ */

const TurbinePanel = (() => {
  let target = null;
  const ID = 'turbine-panel';
  function panel() { return document.getElementById(ID); }
  function _initClose() {
    const btn = document.getElementById('tp-close');
    if (btn && !btn._bound) { btn._bound = true; btn.addEventListener('click', () => { target = null; panel().classList.remove('visible'); }); }
  }
  function isOpen() { const p = document.getElementById(ID); return !!target && !!p && p.classList.contains('visible'); }
  function reposition() {
    if (!target) return;
    const { x: wx, y: wy } = GridManager.tileToWorld(target.col, target.row);
    const sx = (wx + (target.width||5)*TILE) * Camera.zoom - Camera.x * Camera.zoom + 8;
    const sy = wy * Camera.zoom - Camera.y * Camera.zoom;
    const p = panel(), pw = 220, ph = p.offsetHeight || 240;
    let left = sx, top = sy;
    if (left + pw > window.innerWidth  - 10) left = sx - (target.width||5)*TILE * Camera.zoom - pw - 8;
    if (top  + ph > window.innerHeight - 10) top  = window.innerHeight - ph - 10;
    if (top  < 10) top  = 10;
    if (left < 10) left = 10;
    p.style.left = `${Math.round(left)}px`;
    p.style.top  = `${Math.round(top)}px`;
    keepPanelOnScreen(p);
  }
  function dirLabel(dc, dr) {
    if (dc > 0) return 'East →';
    if (dc < 0) return '← West';
    if (dr > 0) return 'South ↓';
    if (dr < 0) return '↑ North';
    return '—';
  }
  function refresh() {
    if (!target) return;
    const powered  = target.powered;
    const rate     = target._rotationRate || 0;
    const fillFrac = target._fillFrac || 0;
    const fuelled  = !!target._fuelled;
    const res      = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getReservoir(target._reservoirId) : null;
    const statusLabel = !powered ? 'NO POWER' : !fuelled ? 'LOW WATER' : 'SPINNING';
    const statusCls   = fuelled && powered ? 'active' : 'offline';
    const st = document.getElementById('tp-status');
    if (st) { st.textContent = statusLabel; st.className = `sp-status ${statusCls}`; }
    const def = EntityDefs[T.HYDROTURBINE];
    const bd = document.getElementById('tp-body');
    if (bd) bd.innerHTML = `
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Rotation</span><span class="sp-value hi">${Math.round(rate * 100)}% RPM</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.min(100, Math.round(rate * 100))}%;background:#e0a020"></div></div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Reservoir</span><span class="sp-value" style="color:${fillFrac<0.15?'#e04020':'#30d4ff'}">${Math.round(fillFrac*100)}%</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.round(fillFrac*100)}%;background:${fillFrac<0.15?'#e04020':'#30d4ff'}"></div></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">Water draw</span><span class="sp-label" style="color:var(--text)">${ReservoirSystem.TURBINE_DRAW} u/s</span></div>
        ${res ? `<div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">Water level</span><span class="sp-label" style="color:var(--text)">${Math.round(res.waterLevel)} / ${Math.round(res.capacity)}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">Inflow sources</span><span class="sp-label" style="color:var(--text)">${res.inflowSources}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">Valley head</span><span class="sp-label" style="color:${(res._head || 1) >= 1.1 ? '#60e890' : 'var(--text)'}">×${(res._head || 1).toFixed(2)}</span></div>` : ''}
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Shaft output</span><span class="sp-value" style="color:#e0a020">${dirLabel(target._outSideDc, target._outSideDr)}</span></div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Power draw</span><span class="sp-value" style="color:#ff6040">-${formatPower(def.powerInput)}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label">Cost</span><span class="sp-value">$${def.cost.toLocaleString()}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label">Upkeep</span><span class="sp-value" style="color:#ff6040">-$${def.upkeep}/s</span></div>
      </div>`;
    // panel(), not bd — bd is replaced wholesale by innerHTML above,
    // which would destroy the button between mousedown and mouseup.
    LightningDamageSystem.attachRepairUI(panel(), target, refresh);
    reposition();
  }
  return {
    get target() { return target; },
    isOpen,
    open(entity) { target = entity; _initClose(); panel().classList.add("visible"); SFX.windowpop?.(); const _t = document.getElementById('tp-title'); if (_t) _t.textContent = 'Hydro Turbine' + (entity._num !== undefined ? ` #${entity._num}` : ''); reposition(); refresh(); if (!this._interval) this._interval = setInterval(() => { if (this.isOpen()) { this.tick(); } else { clearInterval(this._interval); this._interval = null; } }, 250); },
    close() { target = null; document.getElementById(ID)?.classList.remove('visible'); },
    tick() { if (!isOpen()) return; if (!target || GridManager.getEntity(target.col, target.row) !== target) { this.close(); return; } refresh(); },
  };
})();

const ShaftGenPanel = (() => {
  let target = null;
  const ID = 'shaftgen-panel';
  function panel() { return document.getElementById(ID); }
  function _initClose() {
    const btn = document.getElementById('sg-close');
    if (btn && !btn._bound) { btn._bound = true; btn.addEventListener('click', () => { target = null; panel().classList.remove('visible'); }); }
  }
  function isOpen() { const p = document.getElementById(ID); return !!target && !!p && p.classList.contains('visible'); }
  function reposition() {
    if (!target) return;
    const { x: wx, y: wy } = GridManager.tileToWorld(target.col, target.row);
    const sx = (wx + (target.width||5)*TILE) * Camera.zoom - Camera.x * Camera.zoom + 8;
    const sy = wy * Camera.zoom - Camera.y * Camera.zoom;
    const p = panel(), pw = 220, ph = p.offsetHeight || 200;
    let left = sx, top = sy;
    if (left + pw > window.innerWidth  - 10) left = sx - (target.width||5)*TILE * Camera.zoom - pw - 8;
    if (top  + ph > window.innerHeight - 10) top  = window.innerHeight - ph - 10;
    if (top  < 10) top  = 10;
    if (left < 10) left = 10;
    p.style.left = `${Math.round(left)}px`;
    p.style.top  = `${Math.round(top)}px`;
    keepPanelOnScreen(p);
  }
  function dirLabel(dc, dr) {
    if (dc > 0) return 'East →';
    if (dc < 0) return '← West';
    if (dr > 0) return 'South ↓';
    if (dr < 0) return '↑ North';
    return '—';
  }
  function refresh() {
    if (!target) return;
    const def     = EntityDefs[T.HYDROGENERATOR];
    const powered = target.powered;
    const rate    = target._shaftRate || 0;
    const out     = target.def?.powerOutput || 0;
    const statusLabel = !powered ? 'OFFLINE' : rate <= 0 ? 'NO SHAFT' : 'GENERATING';
    const statusCls   = rate > 0 && powered ? 'active' : 'offline';
    const st = document.getElementById('sg-status');
    if (st) { st.textContent = statusLabel; st.className = `sp-status ${statusCls}`; }
    const bd = document.getElementById('sg-body');
    if (bd) bd.innerHTML = `
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Output</span><span class="sp-value hi">${formatPower(Math.round(out))}</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.min(100, Math.round((out/(def.powerOutput||120))*100))}%;background:#30d4ff"></div></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">Valley head</span><span class="sp-label" style="color:${(target._headFactor || 1) >= 1.1 ? '#60e890' : 'var(--text)'}">×${(target._headFactor || 1).toFixed(2)}</span></div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Shaft input</span><span class="sp-value" style="color:#e0a020">${dirLabel(target._inSideDc, target._inSideDr)}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label">Rotation</span><span class="sp-value" style="color:${rate>0?'#ffc040':'#604020'}">${Math.round(rate * 100)}% RPM</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.min(100, Math.round(rate*100))}%;background:#e0a020"></div></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">Hover + R to rotate</span><span class="sp-label"></span></div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Max output</span><span class="sp-value">${formatPower(def.powerOutput)}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label">Cost</span><span class="sp-value">$${def.cost.toLocaleString()}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label">Upkeep</span><span class="sp-value" style="color:#ff6040">-$${def.upkeep}/s</span></div>
      </div>`;
    // panel(), not bd — bd is replaced wholesale by innerHTML above,
    // which would destroy the button between mousedown and mouseup.
    LightningDamageSystem.attachRepairUI(panel(), target, refresh);
    reposition();
  }
  return {
    get target() { return target; },
    isOpen,
    open(entity) { target = entity; _initClose(); panel().classList.add("visible"); SFX.windowpop?.(); const _t = document.getElementById('sg-title'); if (_t) _t.textContent = 'Hydro Generator' + (entity._num !== undefined ? ` #${entity._num}` : ''); reposition(); refresh(); if (!this._interval) this._interval = setInterval(() => { if (this.isOpen()) { this.tick(); } else { clearInterval(this._interval); this._interval = null; } }, 250); },
    close() { target = null; document.getElementById(ID)?.classList.remove('visible'); },
    tick() { if (!isOpen()) return; if (!target || GridManager.getEntity(target.col, target.row) !== target) { this.close(); return; } refresh(); },
  };
})();

const ShaftPanel = (() => {
  let target = null;
  const ID = 'shaft-panel';
  function panel() { return document.getElementById(ID); }
  function _initClose() {
    const btn = document.getElementById('shp-close');
    if (btn && !btn._bound) { btn._bound = true; btn.addEventListener('click', () => { target = null; panel().classList.remove('visible'); }); }
  }
  function isOpen() { const p = document.getElementById(ID); return !!target && !!p && p.classList.contains('visible'); }
  function reposition() {
    if (!target) return;
    const { x: wx, y: wy } = GridManager.tileToWorld(target.col, target.row);
    const sx = (wx + (target.width||3)*TILE) * Camera.zoom - Camera.x * Camera.zoom + 8;
    const sy = wy * Camera.zoom - Camera.y * Camera.zoom;
    const p = panel(), pw = 220, ph = p.offsetHeight || 200;
    let left = sx, top = sy;
    if (left + pw > window.innerWidth  - 10) left = sx - (target.width||3)*TILE * Camera.zoom - pw - 8;
    if (top  + ph > window.innerHeight - 10) top  = window.innerHeight - ph - 10;
    if (top  < 10) top  = 10;
    if (left < 10) left = 10;
    p.style.left = `${Math.round(left)}px`;
    p.style.top  = `${Math.round(top)}px`;
    keepPanelOnScreen(p);
  }
  function refresh() {
    if (!target) return;
    const def       = EntityDefs[T.SHAFT];
    const rate      = target._rotationRate || 0;
    const driven    = rate > 0;
    const orientLbl = target._orientation === 'v' ? 'Vertical ▮' : 'Horizontal ▬';
    const connected = !!target._sourceTurbine;
    const statusLabel = driven ? 'DRIVEN' : 'IDLE';
    const statusCls   = driven ? 'active' : 'offline';
    const st = document.getElementById('shp-status');
    if (st) { st.textContent = statusLabel; st.className = `sp-status ${statusCls}`; }
    const bd = document.getElementById('shp-body');
    if (bd) bd.innerHTML = `
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Rotation</span><span class="sp-value hi">${Math.round(rate * 100)}% RPM</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.min(100, Math.round(rate * 100))}%;background:#e0a020"></div></div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Orientation</span><span class="sp-value">${orientLbl}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">Hover + R to rotate</span><span class="sp-label"></span></div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Turbine source</span><span class="sp-value" style="color:${connected?'#e0a020':'#604020'}">${connected ? 'Connected' : 'Not connected'}</span></div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Cost</span><span class="sp-value">$${def.cost.toLocaleString()}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label">Upkeep</span><span class="sp-value" style="color:#ff6040">-$${def.upkeep}/s</span></div>
      </div>`;
    // panel(), not bd — bd is replaced wholesale by innerHTML above,
    // which would destroy the button between mousedown and mouseup.
    LightningDamageSystem.attachRepairUI(panel(), target, refresh);
    reposition();
  }
  return {
    get target() { return target; },
    isOpen,
    open(entity) { target = entity; _initClose(); panel().classList.add("visible"); SFX.windowpop?.(); const _t = document.getElementById('shp-title'); if (_t) _t.textContent = 'Drive Shaft' + (entity._num !== undefined ? ` #${entity._num}` : ''); reposition(); refresh(); if (!this._interval) this._interval = setInterval(() => { if (this.isOpen()) { this.tick(); } else { clearInterval(this._interval); this._interval = null; } }, 250); },
    close() { target = null; document.getElementById(ID)?.classList.remove('visible'); },
    tick() { if (!isOpen()) return; if (!target || GridManager.getEntity(target.col, target.row) !== target) { this.close(); return; } refresh(); },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   WASTE PROCESSING FACILITY PANEL
   Shared panel for the three waste facilities (Coal Ash,
   Oil Sludge, Nuclear Waste) — same fields on every one, just a
   different label/type, so one panel covers all three.
   ═══════════════════════════════════════════════════════════════════ */
const WASTE_FACILITY_TYPES = [T.COALWASTE, T.OILWASTE, T.NUCLEARWASTE];
const WastePanel = (() => {
  let target = null;
  const ID = 'waste-panel';
  function panel() { return document.getElementById(ID); }
  function _initClose() {
    const btn = document.getElementById('wf-close');
    if (btn && !btn._bound) { btn._bound = true; btn.addEventListener('click', () => { target = null; panel().classList.remove('visible'); }); }
  }
  function isOpen() { const p = document.getElementById(ID); return !!target && !!p && p.classList.contains('visible'); }

  function reposition() {
    if (!target) return;
    const { x: wx, y: wy } = GridManager.tileToWorld(target.col, target.row);
    const sx = (wx + (target.width||4)*TILE) * Camera.zoom - Camera.x * Camera.zoom + 8;
    const sy = wy * Camera.zoom - Camera.y * Camera.zoom;
    const p = panel(), pw = 250, ph = p.offsetHeight || 260;
    let left = sx, top = sy;
    if (left + pw > window.innerWidth  - 10) left = sx - (target.width||4)*TILE * Camera.zoom - pw - 8;
    if (top  + ph > window.innerHeight - 10) top  = window.innerHeight - ph - 10;
    if (top  < 10) top  = 10;
    if (left < 10) left = 10;
    p.style.left = `${Math.round(left)}px`;
    p.style.top  = `${Math.round(top)}px`;
    keepPanelOnScreen(p);
  }

  function _incomingTruck() {
    if (typeof EntityRegistry === 'undefined') return null;
    for (const trk of EntityRegistry.getByType(T.TRUCK)) {
      if (trk._haulState === 'unloading' && trk._haulTarget === target) return trk;
    }
    return null;
  }

  function refresh() {
    if (!target) return;
    const def      = EntityDefs[target.type];
    const stored   = target._wasteStored || 0;
    const cap      = def.storageCapacity || 300;
    const pct      = Math.min(1, stored / cap);
    const rate     = def.processRate || 0;
    const powered  = target.powered;
    const truck    = _incomingTruck();
    const statusLabel = !powered ? 'OFFLINE' : truck ? 'RECEIVING' : stored > 0 ? 'PROCESSING' : 'IDLE';
    const statusCls   = powered ? 'active' : 'offline';
    const barColor    = pct >= 0.9 ? '#ff6040' : pct >= 0.6 ? '#e0a020' : '#60c040';

    const titleEl = document.getElementById('wf-title');
    if (titleEl) titleEl.textContent = def.label;
    const st = document.getElementById('wf-status');
    if (st) { st.textContent = statusLabel; st.className = `sp-status ${statusCls}`; }

    const bd = document.getElementById('wf-body');
    if (bd) bd.innerHTML = `
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Waste stored</span><span class="sp-value hi" style="color:${barColor}">${Math.round(stored)} / ${cap}</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.round(pct*100)}%;background:${barColor}"></div></div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Processing rate</span><span class="sp-value" style="color:${powered?'#60c040':'#604020'}">${powered ? rate.toFixed(1) : '0.0'} units/s</span></div>
        ${!powered ? `<div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">Needs power to process</span><span class="sp-label"></span></div>` : ''}
      </div>
      ${truck ? `<div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">🚛 Truck unloading</span><span class="sp-value" style="color:#60a020">${Math.round(truck._cargoAmount||0)} units</span></div>
      </div>` : ''}
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Footprint</span><span class="sp-value">${def.width}×${def.height}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label">Power draw</span><span class="sp-value" style="color:#ff8040">${formatPower(def.powerInput)}</span></div>
      </div>`;
    reposition();
  }

  return {
    get target() { return target; },
    isOpen,
    open(entity) { target = entity; _initClose(); panel().classList.add("visible"); SFX.windowpop?.(); reposition(); refresh(); if (!this._interval) this._interval = setInterval(() => { if (this.isOpen()) { this.tick(); } else { clearInterval(this._interval); this._interval = null; } }, 250); },
    close() { target = null; document.getElementById(ID)?.classList.remove('visible'); },
    tick() { if (!isOpen()) return; if (!target || GridManager.getEntity(target.col, target.row) !== target) { this.close(); return; } refresh(); },
  };
})();

const DamPanel = (() => {
  let target = null;
  const ID = 'dam-panel';
  function panel() { return document.getElementById(ID); }
  function _initClose() {
    const btn = document.getElementById('dp-close');
    if (btn && !btn._bound) { btn._bound = true; btn.addEventListener('click', () => { target = null; panel().classList.remove('visible'); }); }
  }
  function isOpen() { const p = document.getElementById(ID); return !!target && !!p && p.classList.contains('visible'); }
  function reposition() {
    if (!target) return;
    const { x: wx, y: wy } = GridManager.tileToWorld(target.col, target.row);
    const sx = (wx + (target.width||1)*TILE) * Camera.zoom - Camera.x * Camera.zoom + 8;
    const sy = wy * Camera.zoom - Camera.y * Camera.zoom;
    const p = panel(), pw = 220, ph = p.offsetHeight || 200;
    let left = sx, top = sy;
    if (left + pw > window.innerWidth  - 10) left = sx - (target.width||1)*TILE * Camera.zoom - pw - 8;
    if (top  + ph > window.innerHeight - 10) top  = window.innerHeight - ph - 10;
    if (top  < 10) top  = 10;
    if (left < 10) left = 10;
    p.style.left = `${Math.round(left)}px`;
    p.style.top  = `${Math.round(top)}px`;
    keepPanelOnScreen(p);
  }
  function refresh() {
    if (!target) return;
    const res = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getReservoir(target._reservoirId) : null;
    const def = EntityDefs[T.DAM];
    const fillFrac = res && res.capacity > 0 ? res.waterLevel / res.capacity : 0;
    const turbineCount = res ? res.turbines.length : 0;
    const statusLabel = !res ? 'NO RESERVOIR' : fillFrac >= 0.99 ? 'AT CAPACITY' : fillFrac >= 0.15 ? 'STABLE' : 'FILLING';
    const statusCls   = fillFrac >= 0.15 ? 'active' : 'offline';
    const st = document.getElementById('dp-status');
    if (st) { st.textContent = statusLabel; st.className = `sp-status ${statusCls}`; }
    const bd = document.getElementById('dp-body');
    if (bd) bd.innerHTML = `
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Water level</span><span class="sp-value hi">${Math.round(fillFrac*100)}%</span></div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.round(fillFrac*100)}%;background:${fillFrac<0.15?'#e04020':'#30d4ff'}"></div></div>
        ${res ? `<div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">Volume</span><span class="sp-label" style="color:var(--text)">${Math.round(res.waterLevel)} / ${Math.round(res.capacity)}</span></div>` : ''}
      </div>
      ${res ? `<div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Reservoir size</span><span class="sp-value">${res.tiles.length} tiles</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label">Inflow sources</span><span class="sp-value" style="color:#30d4ff">${res.inflowSources}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label">Turbines</span><span class="sp-value" style="color:${turbineCount>0?'#e0a020':'#604020'}">${turbineCount}</span></div>
      </div>` : ''}
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">Cost</span><span class="sp-value">$${def.cost.toLocaleString()}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label">Upkeep</span><span class="sp-value" style="color:#ff6040">-$${def.upkeep}/s</span></div>
      </div>`;
    // panel(), not bd — bd is replaced wholesale by innerHTML above,
    // which would destroy the button between mousedown and mouseup.
    LightningDamageSystem.attachRepairUI(panel(), target, refresh);
    reposition();
  }
  return {
    get target() { return target; },
    isOpen,
    open(entity) { target = entity; _initClose(); panel().classList.add("visible"); SFX.windowpop?.(); const _t = document.getElementById('dp-title'); if (_t) _t.textContent = 'Dam' + (entity._num !== undefined ? ` #${entity._num}` : ''); reposition(); refresh(); if (!this._interval) this._interval = setInterval(() => { if (this.isOpen()) { this.tick(); } else { clearInterval(this._interval); this._interval = null; } }, 250); },
    close() { target = null; document.getElementById(ID)?.classList.remove('visible'); },
    tick() { if (!isOpen()) return; if (!target || GridManager.getEntity(target.col, target.row) !== target) { this.close(); return; } refresh(); },
  };
})();
