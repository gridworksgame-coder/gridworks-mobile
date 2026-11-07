/* ═══════════════════════════════════════════════════════════════════
   DEV MODE
   Backtick-toggled developer/cheat panel.
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   PLAY TIME
   Real-time stopwatch for "total play time on this save". Deliberately
   decoupled from everything else — game speed, dev-mode pause, progression,
   balance tuning — so it can never be reset or skewed by unrelated changes
   elsewhere in the codebase. It only knows real elapsed seconds, and only
   counts them while the player is actually playing:

     - 'session' hold: no world loaded yet (main menu, city naming)
     - 'menu'    hold: pause menu open
     - 'hidden'  hold: tab in the background / window minimised
     - 'blur'    hold: another window has focus (alt-tab, second monitor)
     - idle:     no mouse/keyboard/wheel input for IDLE_MS. The first
                 IDLE_MS of stillness still counts (reading a panel or
                 watching the sim is play); anything past it doesn't.

   Game speed (Space / 0×) deliberately does NOT stop it — planning while the
   sim is paused is play. Idle detection covers walking away from a 0× game.
   ═══════════════════════════════════════════════════════════════════ */

const PlayTime = (() => {
  const IDLE_MS    = 60000;
  // Largest single step ever credited. Ticks come every second while the
  // clock is live, so a bigger gap means the machine slept or the thread was
  // frozen (debugger breakpoint) — not play.
  const MAX_GAP_MS = 5000;

  let totalSeconds = 0;
  let _anchor      = null;               // performance.now() counting resumed from; null = held
  let _lastInput   = performance.now();
  const _holds     = new Set(['session']);

  // Credits time since the anchor, capped at the moment idle began.
  // performance.now() is monotonic, so a system clock change can't skew it.
  function _flush(now) {
    if (_anchor === null) return;
    const end = Math.min(now, _lastInput + IDLE_MS);
    const dt  = end - _anchor;
    if (dt > 0) totalSeconds += Math.min(dt, MAX_GAP_MS) / 1000;
    _anchor = now;
  }

  function _isIdle(now) { return now - _lastInput > IDLE_MS; }

  function _status(now) {
    if (_holds.has('session')) return 'not in game';
    if (_holds.has('menu'))    return 'paused';
    if (_holds.has('hidden') || _holds.has('blur')) return 'tab inactive';
    if (_isIdle(now))          return 'idle';
    return '';
  }

  function _render() {
    const el = document.getElementById('dev-playtime-val');
    if (!el) return;
    const s = _status(performance.now());
    el.textContent = _fmt(totalSeconds) + (s ? ` ⏸ ${s}` : '');
  }

  function hold(reason) {
    const now = performance.now();
    _flush(now);
    _holds.add(reason);
    _anchor = null;
    _render();
  }

  function release(reason) {
    if (!_holds.delete(reason)) return;
    if (_holds.size > 0) return;
    const now = performance.now();
    // Coming back to the game (tab refocused, menu closed) is itself
    // activity — don't leave the player "idle" until they next move the mouse.
    _lastInput = now;
    _anchor = now;
    _render();
  }

  function _onInput() {
    const now = performance.now();
    // Waking from idle: restart the anchor so the idle stretch between the
    // last tick and this input is never credited.
    if (_anchor !== null && _isIdle(now)) { _flush(now); _anchor = now; }
    _lastInput = now;
  }

  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart']) {
    window.addEventListener(ev, _onInput, { capture: true, passive: true });
  }
  // Registered at script load, so this runs before menu_system's
  // save-on-hidden listener and the saved total already includes the flush.
  document.addEventListener('visibilitychange', () => {
    document.hidden ? hold('hidden') : release('hidden');
  });
  window.addEventListener('blur',  () => hold('blur'));
  window.addEventListener('focus', () => release('blur'));
  if (document.hidden)       _holds.add('hidden');
  if (!document.hasFocus())  _holds.add('blur');

  setInterval(() => { _flush(performance.now()); _render(); }, 1000);

  function _fmt(sec) {
    sec = Math.floor(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  return {
    // hold/release take a reason string; the clock runs only when no reason
    // is held. menu_system uses 'menu' (pause menu) and 'session' (released
    // once a world is actually loaded).
    hold,
    release,
    getSeconds()    { _flush(performance.now()); return totalSeconds; },
    getFormatted()  { return _fmt(totalSeconds); },
    getStatus()     { return _status(performance.now()) || 'running'; },
    reset() {
      totalSeconds = 0;
      if (_anchor !== null) _anchor = performance.now();
      _render();
    },
    // SaveSystem hooks — this is the ONLY place PlayTime touches the save
    // file. It stores/restores a raw second count, nothing else.
    save() { _flush(performance.now()); return { seconds: totalSeconds }; },
    load(data) {
      totalSeconds = (data && data.seconds) || 0;
      if (_anchor !== null) _anchor = performance.now(); // don't count load-time itself
      _render();
    },
  };
})();

const DevMode = (() => {
  let enabled    = false;
  let _timeScale = 1;
  let fpsVisible = false;
  let _wasteControlsInit = false;
  let _playTimeInit      = false;
  let _panelHidden       = false;   // dev mode on, panel tucked away

  function setSpeed(s) {
    // The pause menu is a hard freeze. Every speed change funnels through
    // here — the playback bar, Space, the tutorial-card observer, fishing's
    // speed lock — and several of them fire while the menu is open (Space
    // clicked Play behind it; a tutorial card closing re-applied the bar's
    // speed), each silently restarting time under the menu. So nothing but a
    // pause is accepted while it's showing. Closing it re-applies the real
    // speed (ui_bootstrap.js's pause-menu observer) once the class is gone.
    if (s !== 0 && document.getElementById('pause-menu')?.classList.contains('visible')) s = 0;
    // The Advanced Reactor's meltdown countdown owns the clock once its song
    // is playing (ApocalypseSystem.lockedSpeed) — overrides everything above.
    const _lock = typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.lockedSpeed ? ApocalypseSystem.lockedSpeed() : null;
    if (_lock !== null) s = _lock;
    _timeScale = s;
    const label = s === 0 ? '⏸ Paused' : `${s}×`;
    const el = document.getElementById('dev-speed-val');
    if (el) el.textContent = label;
  }

  // Injects a live-updating "Play Time" readout at the top of the dev panel
  // the first time it's opened. The readout element gets its text updated
  // directly by PlayTime's own 1-second tick — this function only builds
  // the DOM once.
  function _initPlayTimeDisplay() {
    if (_playTimeInit) return;
    const panel = document.getElementById('dev-panel');
    if (!panel) return;
    _playTimeInit = true;

    const wrap = document.createElement('div');
    wrap.id = 'dev-playtime';
    wrap.style.cssText = 'margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.12); display:flex; justify-content:space-between; align-items:center;';
    wrap.innerHTML = `
      <span style="font-size:11px; font-weight:bold; color:#a0a890;">⏱ Play Time (this save)</span>
      <span id="dev-playtime-val" style="font:12px 'Courier New',monospace; color:#d0d0c0;">${PlayTime.getFormatted()}</span>
    `;
    panel.insertBefore(wrap, panel.firstChild);
  }

  // Injects a small "Fill Waste" test section into the dev panel the first
  // time it's opened. Self-contained — builds its own DOM/buttons, no HTML
  // template changes needed. Calls HaulSystem.devFillWaste() per source type.
  function _initWasteControls() {
    if (_wasteControlsInit) return;
    const panel = document.getElementById('dev-panel');
    if (!panel || typeof HaulSystem === 'undefined') return;
    _wasteControlsInit = true;

    const btnStyle = `
      flex:1; min-width:90px; padding:6px 8px; border-radius:4px;
      border:1px solid rgba(160,160,160,0.3); background:rgba(255,255,255,0.06);
      color:#d0d0c0; font:11px 'Courier New',monospace; cursor:pointer;
    `;
    const wrap = document.createElement('div');
    wrap.id = 'dev-waste-controls';
    wrap.style.cssText = 'margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.12);';
    wrap.innerHTML = `
      <div style="font-size:11px; font-weight:bold; color:#a0a890; margin-bottom:6px;">🧪 Fill Waste (test)</div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button id="dev-fill-coal"    style="${btnStyle}">Coal Ash</button>
        <button id="dev-fill-oil"     style="${btnStyle}">Oil Sludge</button>
        <button id="dev-fill-nuclear" style="${btnStyle}">Nuclear Waste</button>
      </div>
      <div style="font-size:11px; font-weight:bold; color:#a0a890; margin:10px 0 6px;">⛽ Fuel (test)</div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button id="dev-fill-station" style="${btnStyle}">Fill Gas Stations</button>
        <button id="dev-fill-trucks"  style="${btnStyle}">Refuel Trucks</button>
      </div>
    `;
    panel.appendChild(wrap);

    document.getElementById('dev-fill-coal').addEventListener('click',    () => HaulSystem.devFillWaste(T.COALGENERATOR));
    document.getElementById('dev-fill-oil').addEventListener('click',     () => HaulSystem.devFillWaste(T.REFINERY));
    document.getElementById('dev-fill-nuclear').addEventListener('click', () => HaulSystem.devFillWaste(T.NUCLEARREACTOR));
    document.getElementById('dev-fill-station').addEventListener('click', () => GasStationSystem.devFillStation());
    document.getElementById('dev-fill-trucks').addEventListener('click',  () => GasStationSystem.devFillTruckFuel());
  }

  // Injects a "Spawn Property" section into the dev panel the first time
  // it's opened — one dropdown + button per tier (house/commercial/
  // industrial), listing every pool entry (including rare/locked ones) so
  // any property type can be force-spawned into `pending` for testing
  // sprites and demand curves, without waiting on RNG or unlock gates.
  let _spawnControlsInit = false;
  function _initSpawnControls() {
    if (_spawnControlsInit) return;
    const panel = document.getElementById('dev-panel');
    if (!panel || typeof HouseRequestSystem === 'undefined') return;
    _spawnControlsInit = true;

    const selStyle = `
      flex:1; min-width:120px; padding:5px 6px; border-radius:4px;
      border:1px solid rgba(160,160,160,0.3); background:rgba(0,0,0,0.3);
      color:#d0d0c0; font:11px 'Courier New',monospace;
    `;
    const btnStyle = `
      padding:5px 10px; border-radius:4px;
      border:1px solid rgba(160,160,160,0.3); background:rgba(255,255,255,0.06);
      color:#d0d0c0; font:11px 'Courier New',monospace; cursor:pointer;
    `;
    const rows = [
      { id: 'house',      label: '🏠', pool: HouseRequestSystem.getFamilyPool(),     valueKey: 'name' },
      { id: 'commercial', label: '🏢', pool: HouseRequestSystem.getCommercialPool(), valueKey: 'subtype' },
      { id: 'industrial', label: '🏭', pool: HouseRequestSystem.getIndustrialPool(), valueKey: 'subtype' },
    ];

    const wrap = document.createElement('div');
    wrap.id = 'dev-spawn-controls';
    wrap.style.cssText = 'margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.12);';
    wrap.innerHTML = `<div style="font-size:11px; font-weight:bold; color:#a0a890; margin-bottom:6px;">🧪 Spawn Property (any type)</div>` +
      rows.map(r => `
        <div style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
          <select id="dev-spawn-sel-${r.id}" style="${selStyle}">
            ${r.pool.map(p => `<option value="${p[r.valueKey]}">${r.label} ${p.name}${p.rare ? ' ★' : ''}</option>`).join('')}
          </select>
          <button id="dev-spawn-btn-${r.id}" style="${btnStyle}">Spawn</button>
        </div>
      `).join('');
    panel.appendChild(wrap);

    document.getElementById('dev-spawn-btn-house').addEventListener('click', () => {
      HouseRequestSystem.devSpawnHouse(document.getElementById('dev-spawn-sel-house').value);
    });
    document.getElementById('dev-spawn-btn-commercial').addEventListener('click', () => {
      HouseRequestSystem.devSpawnCommercial(document.getElementById('dev-spawn-sel-commercial').value);
    });
    document.getElementById('dev-spawn-btn-industrial').addEventListener('click', () => {
      HouseRequestSystem.devSpawnIndustrial(document.getElementById('dev-spawn-sel-industrial').value);
    });
  }

  // Injects a "Lightning" section: fire a bolt at a chosen building on
  // demand instead of waiting for a rainstorm to roll one. Everything
  // downstream — rod interception, storage detonations, blast damage,
  // spreading fire — runs through the same code a real strike does, so this
  // is a trigger, not a simulation of one.
  let _lightningControlsInit = false;
  function _initLightningControls() {
    if (_lightningControlsInit) return;
    const panel = document.getElementById('dev-panel');
    if (!panel || typeof LightningDamageSystem === 'undefined') return;
    _lightningControlsInit = true;

    const btnStyle = `
      flex:1; min-width:90px; padding:6px 8px; border-radius:4px;
      border:1px solid rgba(160,160,160,0.3); background:rgba(255,255,255,0.06);
      color:#d0d0c0; font:11px 'Courier New',monospace; cursor:pointer;
    `;
    const wrap = document.createElement('div');
    wrap.id = 'dev-lightning-controls';
    wrap.style.cssText = 'margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.12);';
    wrap.innerHTML = `
      <div style="font-size:11px; font-weight:bold; color:#a0a890; margin-bottom:6px;">⚡ Lightning Strike (test)</div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button id="dev-strike-selected" style="${btnStyle}">Strike Selected</button>
        <button id="dev-strike-random"   style="${btnStyle}">Strike Random</button>
      </div>
      <div style="font-size:10px; color:#807868; margin-top:5px;">
        Select a building first, or hit a random one. Rods still protect.
      </div>
    `;
    panel.appendChild(wrap);

    document.getElementById('dev-strike-selected').addEventListener('click', () => {
      // Whatever the info panel is pointed at is what the player thinks is
      // "selected", so that is what gets hit.
      const sel = (typeof EntityInfoPanel !== 'undefined') ? EntityInfoPanel.target : null;
      if (!sel) {
        showToast('Select a building first', '#c08020', '#100c00', '#604010');
        return;
      }
      LightningDamageSystem.devStrike(sel);
    });
    document.getElementById('dev-strike-random').addEventListener('click', () => {
      LightningDamageSystem.devStrike();
    });
  }

  // Injects a "Power" section: force buildings powered regardless of the
  // grid, for looking at sprites and systems without wiring anything up.
  // PowerNetwork.tick applies the override after its own pass. "All" is a
  // global switch; "Selected" toggles a flag on one building. Neither is
  // saved, and both clear when dev mode is turned off.
  let _powerAll = false;
  let _runAll   = false;   // "Run All Machines" — see _forceRunPass
  const _devPowered = new Set();
  // Terrain, deposits and transport pieces aren't buildings; forcing them
  // "powered" would only confuse pipe/wire rendering.
  const _POWER_SKIP = new Set([
    T.TREE, T.BUSH, T.WATER, T.AQUIFER, T.COALDEPOSIT, T.OILDEPOSIT, T.URANIUMDEPOSIT,
    T.SULFURDEPOSIT, T.LITHIUMDEPOSIT, T.HELIUMDEPOSIT, T.RAREEARTHDEPOSIT, T.GEODEPOSIT, T.WIRE, T.POLE, T.POWERTOWER,
    T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR, T.ROAD, T.TRUCK,
  ]);
  let _powerControlsInit = false;
  function _refreshPowerButtons() {
    const all = document.getElementById('dev-power-all');
    if (all) {
      all.textContent = `Power All Buildings: ${_powerAll ? 'ON' : 'OFF'}`;
      all.style.background = _powerAll ? 'rgba(80,200,90,0.25)' : 'rgba(255,255,255,0.06)';
    }
    const run = document.getElementById('dev-run-all');
    if (run) {
      run.textContent = `Run All Machines: ${_runAll ? 'ON' : 'OFF'}`;
      run.style.background = _runAll ? 'rgba(80,200,90,0.25)' : 'rgba(255,255,255,0.06)';
    }
    const cnt = document.getElementById('dev-power-count');
    if (cnt) cnt.textContent = _devPowered.size ? `${_devPowered.size} building${_devPowered.size > 1 ? 's' : ''} force-powered individually` : 'Select a building first to power just that one.';
  }
  function _initPowerControls() {
    if (_powerControlsInit) return;
    const panel = document.getElementById('dev-panel');
    if (!panel) return;
    _powerControlsInit = true;

    const btnStyle = `
      flex:1; min-width:90px; padding:6px 8px; border-radius:4px;
      border:1px solid rgba(160,160,160,0.3); background:rgba(255,255,255,0.06);
      color:#d0d0c0; font:11px 'Courier New',monospace; cursor:pointer;
    `;
    const wrap = document.createElement('div');
    wrap.id = 'dev-power-controls';
    wrap.style.cssText = 'padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.12);';
    wrap.innerHTML = `
      <div style="font-size:11px; font-weight:bold; color:#a0a890; margin-bottom:6px;">🔌 Power (test)</div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button id="dev-power-all"      style="${btnStyle}">Power All Buildings: OFF</button>
        <button id="dev-power-selected" style="${btnStyle}">Power Selected</button>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
        <button id="dev-run-all" style="${btnStyle}">Run All Machines: OFF</button>
      </div>
      <div style="font-size:10px; color:#807868; margin-top:5px;">
        Run All powers every building and forces every generator to full output
        (fuel, water, steam, plasma checks bypassed). Generators still need a wire.
      </div>
      <div id="dev-power-count" style="font-size:10px; color:#807868; margin-top:5px;"></div>
    `;
    // Right under the header — the most-used toggles shouldn't need a scroll.
    const header = panel.querySelector('.dev-header');
    panel.insertBefore(wrap, header ? header.nextSibling : panel.firstChild);

    document.getElementById('dev-power-all').addEventListener('click', () => {
      _powerAll = !_powerAll;
      _refreshPowerButtons();

    });
    document.getElementById('dev-run-all').addEventListener('click', () => {
      _runAll = !_runAll;
      if (_runAll) _powerAll = true;   // running implies powered
      _refreshPowerButtons();
    });
    document.getElementById('dev-power-selected').addEventListener('click', () => {
      const sel = (typeof EntityInfoPanel !== 'undefined') ? EntityInfoPanel.target : null;
      if (!sel) { showToast('Select a building first', '#c08020', '#100c00', '#604010'); return; }
      if (_POWER_SKIP.has(sel.type)) { showToast(`${sel.def?.label || 'That'} isn't a building`, '#c08020', '#100c00', '#604010'); return; }
      const on = !_devPowered.has(sel);
      if (on) _devPowered.add(sel); else _devPowered.delete(sel);
      showToast(`${sel.businessName || sel.def?.label || 'Building'} ${on ? 'force-powered' : 'back on the grid'}`, '#60d070', '#041008', '#206030');
      _refreshPowerButtons();

    });
    _refreshPowerButtons();
  }

  // Runs once per logic tick, AFTER every production system has ticked, so it
  // has the last word on each machine's state; PowerNetwork reads these flags
  // on its next tick, which is what makes the generators actually feed the
  // grid. Pipe/conveyor topology stays the player's to build, and turbines
  // still need a wire (PowerNetwork ignores unwired output).
  function _forceRunPass() {
    const each = (type, fn) => { for (const e of EntityRegistry.getByType(type)) fn(e, EntityDefs[type]); };
    // Systems clone e.def lazily; never write through the shared def.
    const setOut = (e, d) => { if (e.def !== d) e.def.powerOutput = d.powerOutput; };

    each(T.COALGENERATOR, (e, d) => {
      e._hasWater = true; e._fedByPoweredMine = true; e._fuelled = true;
      e._ashWaste = 0;    // a full ash bin would stall it until a truck came
      setOut(e, d);
    });
    each(T.FUELGEN, (e, d) => { e._fuelled = true; e._fuelTank = 60; setOut(e, d); });
    each(T.HYDROGENERATOR, (e, d) => { e._fuelled = true; setOut(e, d); });
    for (const t of [T.STEAMTURBINE, T.STEAMTURBINE2, T.MHDRING, T.GEOTURBINE])
      each(t, (e, d) => { e._generating = true; e._currentOutput = d.powerOutput; });
    each(T.NUCLEARREACTOR, e => { e._generating = true; e._nuclearWastePct = 0; });
    each(T.HULKINGFUSIONREACTOR, e => { e._generating = true; });
    // No burn logic yet: Run All Machines is the only way to see it running.
    each(T.ADVFUSIONREACTOR, e => { e._generating = true; e._magnetK = 4.5; });

    // Processing plants and chain machines. Each system derives these flags
    // from real belts, pipes and buffers every tick; the renderers and the
    // production step read the same flags, so asserting them here is what
    // makes the machine both animate and behave as running.
    const RUN_FLAGS = {
      MOXPLANT:      { _running: true, _hasPlutonium: true, _hasUranium: true, _blockedBy: null, _idleFull: false },
      REPROCESSOR:   { _running: true, _hasSpentFuel: true, _waterConnected: true, _blockedBy: null, _idleFull: false, _waitingOnCooling: false },
      FUELPLANT:     { _hasAcid: true, _hasUranium: true, _running: true, _blockedBy: null },
      CHEMICALPLANT: { _sulfurConveyor: true, _waterConnected: true },
      ELECTROLYZER:  { _waterConnected: true },
      LITHIUMPROCESSPLANT: { _oreConveyor: true, _waterConnected: true },
      HABERBOSCH:    { _hasNitrogen: true, _hasHydrogen: true },
      WASHTOWER:     { _hasAmmonia: true, _waterConnected: true },
      CRYOPLANT:     { _hasHeliumSource: true, _liquefying: true, _running: true, _tripped: false },
      HE3SEPARATOR:  { _hasHeliumSource: true, _separating: true },
      TRITIUMBREEDER: { _hasCompound: true, _breeding: true },
      FUSIONFUELPLANT: { _generating: true, _hasDeuterium: true, _hasHe: true, _hasTritium: true },
      HULKINGFUSIONREACTOR: { _hasPlasma: true, _hasBlanket: true, _started: true, _magnetsReady: true, _cryoRunning: true, _cryoLinked: true },
      ADVFUSIONREACTOR: { _hasPlasma: true, _started: true, _magnetsReady: true, _cryoRunning: true, _cryoLinked: true, _ashPipeOut: true, _coolantLinked: true },
      COOLINGTOWER:  { _active: true, _coolConnected: true, _hotConnected: true, _pumpTripped: false },
      COOLINGTOWER2: { _active: true, _coolConnected: true, _hotConnected: true, _pumpTripped: false },
      NUCLEARREACTOR: { _hasRods: true, _cooled: true },
      ADVREACTOR:    { _generating: true, _hasRods: true, _cooled: true },
      STEAMTURBINE:  { _steamConnected: true, _hasPower: true },
      STEAMTURBINE2: { _steamConnected: true, _hasPower: true },
      MHDRING:       { _highBetaConnected: true, _hasPower: true },
      GEOTURBINE:    { _hasPower: true },
      PUMPJACK:      { _pipeConnected: true },
      PUMPJACK2:     { _pipeConnected: true },
    };
    for (const [name, flags] of Object.entries(RUN_FLAGS)) {
      const type = T[name];
      if (!type) continue;
      for (const e of EntityRegistry.getByType(type)) Object.assign(e, flags);
    }
    for (const e of EntityRegistry.getByType(T.REFINERY)) e._refStatus = 'running';
    each(T.WATEREXTRACTOR, (e, d) => { e._lakeConnected = true; e._waterRate = d.waterPerSecond || 20; });
  }

  return {
    get enabled()    { return enabled; },
    forceRunPass()   { if (enabled && _runAll) _forceRunPass(); },
    // Read by PowerNetwork.tick — cheap gate so the override loop only runs
    // while something is actually being forced.
    get hasPowerOverrides() { return _powerAll || _devPowered.size > 0; },
    forcesPower(e) {
      if (_POWER_SKIP.has(e.type)) return false;
      // A demolished building just lingers in the set harmlessly — the
      // override loop only walks entities still in the registry.
      return _powerAll || _devPowered.has(e);
    },
    get timeScale()  { return _timeScale; },
    get fpsVisible() { return fpsVisible; },
    setSpeed(v)     { setSpeed(v); },
    setTimeScale(s) { setSpeed(s); },

    toggleFps() {
      fpsVisible = !fpsVisible;
      document.getElementById('fps-counter').classList.toggle('visible', fpsVisible);
      const btn = document.getElementById('dev-fps-toggle');
      if (btn) btn.textContent = `FPS Counter: ${fpsVisible ? 'ON' : 'OFF'}`;
    },

    // Hides the panel without leaving dev mode, so Power All / Run All and
    // the rest keep running while the map is visible. The badge, the DEV
    // button or ` bring it back.
    setPanelHidden(hidden) {
      if (!enabled) return;
      _panelHidden = hidden;
      document.getElementById('dev-panel').classList.toggle('visible', !hidden);
      document.getElementById('dev-badge').classList.toggle('panel-hidden', hidden);
    },

    toggle() {
      // Dev mode is browser-only: the shipped desktop build (which exposes
      // GridworksDesktop) has no DEV button and ignores the ` shortcut.
      if (window.GridworksDesktop && !enabled) return;
      if (enabled && _panelHidden) { DevMode.setPanelHidden(false); return; }
      enabled = !enabled;
      _panelHidden = false;
      document.getElementById('dev-badge').classList.remove('panel-hidden');
      if (enabled) {
        Progression.saveSnapshot();
        _initWasteControls();
        _initSpawnControls();
        _initLightningControls();
        _initPowerControls();
        _initPlayTimeDisplay();
      } else {
        _powerAll = false;
        _runAll = false;
        _devPowered.clear();
        _refreshPowerButtons();
        Progression.restoreSnapshot();
        refreshHotbar();
      }
      document.getElementById('dev-badge').classList.toggle('visible', enabled);
      document.getElementById('dev-panel').classList.toggle('visible', enabled);
      document.getElementById('btn-dev').classList.toggle('active', enabled);
    },

    initSpeedControls() {
      const btns = {
        'dev-speed-pause': 0,
        'dev-speed-half':  0.5,
        'dev-speed-1x':    1,
        'dev-speed-2x':    2,
        'dev-speed-5x':    5,
        'dev-speed-10x':   10,
        'dev-speed-20x':   20,
      };
      Object.entries(btns).forEach(([id, scale]) => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => setSpeed(scale));
      });
      const fpsBtn = document.getElementById('dev-fps-toggle');
      if (fpsBtn) fpsBtn.addEventListener('click', () => DevMode.toggleFps());
      document.getElementById('dev-panel-hide')?.addEventListener('click', () => DevMode.setPanelHidden(true));
      document.getElementById('dev-badge')?.addEventListener('click', () => DevMode.setPanelHidden(false));
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   PROGRESSION
   Two-stage unlock tree driven by two independent counters:

   totalWs       — cumulative watt-seconds from any solar output
   totalResearch — research points from powered Research Stations

   Unlock tree:
     START        Solar MK1, Wire
     50 Ws     →  Research Station  (first consumer; burns power to research)
     120 rp    →  Consumer MK1      (starts earning money)
     300 rp    →  Battery MK1       (store surplus solar)
   ═══════════════════════════════════════════════════════════════════ */
