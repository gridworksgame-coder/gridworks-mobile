/* ═══════════════════════════════════════════════════════════════════
   SOLAR PANEL INSPECTOR
   ═══════════════════════════════════════════════════════════════════ */
const SolarPanelInspector = (() => {
  let target = null;

  function panel()  { return document.getElementById('solar-panel'); }
  function isOpen() { return panel().classList.contains('visible'); }

  function reposition() {
    if (!target) return;
    const { x: wx, y: wy } = GridManager.tileToWorld(target.col, target.row);
    const sx = (wx + TILE) * Camera.zoom - Camera.x * Camera.zoom + 8;
    const sy = wy          * Camera.zoom - Camera.y * Camera.zoom;
    const p  = panel();
    const pw = 210, ph = p.offsetHeight || 200;
    let left = sx, top = sy;
    if (left + pw > window.innerWidth  - 10) left = sx - TILE * Camera.zoom - pw - 8;
    if (top  + ph > window.innerHeight - 10) top  = window.innerHeight - ph - 10;
    if (top  < 10) top  = 10;
    if (left < 10) left = 10;
    p.style.left = `${Math.round(left)}px`;
    p.style.top  = `${Math.round(top)}px`;
    keepPanelOnScreen(p);
  }

  function sunlightLabel() {
    const h = DayNight.hour();
    if (h < 5  || h >= 20) return 'Night';
    if (h < 7)              return 'Dawn';
    if (h < 10)             return 'Morning';
    if (h < 14)             return 'Midday';
    if (h < 17)             return 'Afternoon';
    return 'Evening';
  }

  // Count entities in the same network component as target
  function networkStats() {
    if (!target) return { wires: 0, consumers: 0, batteries: 0, isolated: true };
    const netId = target.networkId;
    if (netId < 0) return { wires: 0, consumers: 0, batteries: 0, isolated: true };
    let wires = 0, consumers = 0, batteries = 0;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const e = GridManager.getEntity(c, r);
        if (!e || e.networkId !== netId || e === target) continue;
        if (e.type === T.WIRE)     wires++;
        if (e.type === T.HOUSE) consumers++;
        if (e.type === T.BATTERY)  batteries++;
      }
    return { wires, consumers, batteries, isolated: wires === 0 && consumers === 0 };
  }

  function refresh() {
    if (!target) return;
    const sunlight  = Math.max(0, 1 - DayNight.darkness());
    const output    = target.def.powerOutput;
    const peak      = target.def.peakOutput;
    const pct       = peak > 0 ? output / peak : 0;
    const generating = output > 0.01;
    const net       = networkStats();

    document.getElementById('sp-status').textContent = generating ? 'GENERATING' : 'OFFLINE';
    document.getElementById('sp-status').className   = `sp-status ${generating ? 'active' : 'offline'}`;

    document.getElementById('sp-body').innerHTML = `
      <div class="sp-row">
        <div class="sp-row-header">
          <span class="sp-label">Output</span>
          <span class="sp-value hi">${formatPower(output, 2)}</span>
        </div>
        <div class="sp-bar"><div class="sp-bar-fill" style="width:${Math.round(pct*100)}%"></div></div>
        <div class="sp-row-header" style="margin-top:2px">
          <span class="sp-label" style="font-size:7px">Peak output</span>
          <span class="sp-label" style="color:var(--text)">${formatPower(peak)} at noon</span>
        </div>
      </div>

      <div class="sp-row">
        <div class="sp-row-header">
          <span class="sp-label">Sunlight</span>
          <span class="sp-value ${generating ? 'hi' : 'dim'}">${Math.round(sunlight * 100)}%</span>
        </div>
        <div class="sp-row-header">
          <span class="sp-label" style="font-size:7px">Conditions</span>
          <span class="sp-label" style="color:var(--text)">${sunlightLabel()} · ${DayNight.timeString()}</span>
        </div>${(target.smogFactor ?? 1) < 0.99 ? `
        <div class="sp-row-header">
          <span class="sp-label" style="font-size:7px">Smog haze</span>
          <span class="sp-label" style="color:#e0a060">−${Math.round((1 - target.smogFactor) * 100)}% output</span>
        </div>` : ''}${(target.dust || 0) > 0.01 ? `
        <div class="sp-row-header">
          <span class="sp-label" style="font-size:7px">Dust / ash</span>
          <span class="sp-label" style="color:#d0a060">−${Math.round((1 - (target.dustFactor ?? 1)) * 100)}% output · rain washes it off</span>
        </div>` : ''}
      </div>

      <div class="sp-row">
        <div class="sp-label" style="margin-bottom:5px">Network</div>
        <div class="sp-network-grid">
          <div class="sp-net-item">
            <span class="sp-net-label">Wires</span>
            <span class="sp-net-value">${net.wires}</span>
          </div>
          <div class="sp-net-item">
            <span class="sp-net-label">Consumers</span>
            <span class="sp-net-value">${net.consumers}</span>
          </div>
          <div class="sp-net-item">
            <span class="sp-net-label">Batteries</span>
            <span class="sp-net-value">${net.batteries}</span>
          </div>
          <div class="sp-net-item">
            <span class="sp-net-label">Status</span>
            <span class="sp-net-value" style="font-size:8px;color:${net.isolated ? '#5a8090' : '#70c0ff'}">${net.isolated ? 'Isolated' : 'Connected'}</span>
          </div>
        </div>
      </div>

      <div class="sp-row">
        <div class="sp-row-header">
          <span class="sp-label">Cost</span>
          <span class="sp-value">$${target.def.cost}</span>
        </div>
        <div class="sp-row-header">
          <span class="sp-label" style="font-size:7px">Refund on remove</span>
          <span class="sp-label" style="color:var(--text)">$${target.def.cost}</span>
        </div>
      </div>
      <div class="sp-row">
        <div class="sp-row-header">
          <span class="sp-label">Upkeep</span>
          <span class="sp-value" style="color:#ff6040">-$${target.def.upkeep}/s</span>
        </div>
      </div>
    `;
    // The panel root, not #sp-body — that body is rewritten via innerHTML on
    // every refresh, which would destroy the button mid-click.
    LightningDamageSystem.attachRepairUI(panel(), target, refresh);
    reposition();
  }

  return {
    get target()  { return target; },
    isOpen,

    open(entity) {
      target = entity;
      panel().classList.add('visible');
      reposition();
      refresh();
    },

    close() {
      target = null;
      panel().classList.remove('visible');
    },

    tick() {
      if (!isOpen()) return;
      if (!target || !GridManager.getEntity(target.col, target.row)) { this.close(); return; }
      refresh();
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   RESEARCH STATION INSPECTOR  (was InspectionPanel)
   Opens when player clicks a Research Station in cursor mode.
   Refreshes each game tick while open.
   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   TRUCK PATROL PANEL
   Small floating panel shown when clicking a truck that has a path.
   Lets player Start / Stop patrol and clear the path.
   ═══════════════════════════════════════════════════════════════════ */
const TruckPatrolPanel = (() => {
  let _target = null;
  let _el = null;
  let _built = false;   // has the static button/label DOM been built yet?
  const _refs = {};     // cached references to the elements tick() updates
  let _editMode = false;
  let _lastEditSig = null;

  function _handleButton(btn) {
    if (!_target) return;
    const action = btn.dataset.action;
    if (action === 'toggleEdit') {
      _editMode = !_editMode;
      _lastEditSig = null;
      _render();
      return;
    }
    if (action === 'jumpWaypoint') {
      const wx = Number(btn.dataset.wx), wy = Number(btn.dataset.wy);
      if (isFinite(wx) && isFinite(wy)) Camera.recentreOn(wx, wy);
      return;
    }
    if (action === 'removeWaypoint') {
      const idx = Number(btn.dataset.index);
      if (!_target._path || idx < 0 || idx >= _target._path.length) return;
      _target._path.splice(idx, 1);
      // Keep the in-progress patrol pointer valid/sane after the shift.
      if (_target._patrolIdx > idx) _target._patrolIdx--;
      if (_target._patrolIdx >= _target._path.length) _target._patrolIdx = 0;
      _lastEditSig = null;
      _render();
      return;
    }
    if (action === 'addDest') {
      if (!_target._destQueue) _target._destQueue = [];
      const kind = btn.dataset.kind;
      if (kind === 'facility') {
        _target._destQueue.push({ kind: 'facility', facilityType: btn.dataset.facilityType });
      } else if (kind === 'source') {
        _target._destQueue.push({ kind: 'source', sourceType: btn.dataset.sourceType, col: Number(btn.dataset.col), row: Number(btn.dataset.row) });
      } else if (kind === 'gasstation') {
        _target._destQueue.push({ kind: 'gasstation', col: Number(btn.dataset.col), row: Number(btn.dataset.row) });
      }
      _lastQueueSig = null;
      _render();
      return;
    }
    if (action === 'removeDest') {
      const idx = Number(btn.dataset.index);
      if (_target._destQueue && idx >= 0 && idx < _target._destQueue.length) {
        _target._destQueue.splice(idx, 1);
        if (_target._queueIdx > idx) _target._queueIdx--;
      }
      _lastQueueSig = null;
      _render();
      return;
    }
    if (action === 'jumpToDest') {
      const idx = Number(btn.dataset.index);
      TruckDispatchSystem.jumpTo(_target, idx);
      _lastQueueSig = null;
      _render();
      return;
    }
    if (action === 'assign' || action === 'rename' || action === 'delete') {
      const pathId = Number(btn.closest('[data-path-id]')?.dataset.pathId);
      const saved  = pathId ? SavedPathSystem.get(pathId) : null;
      if (!saved) return;
      if (action === 'assign') {
        TruckSystem.setPath(_target, saved.waypoints);
        showToast(`🛤 "${saved.name}" assigned: click Start to patrol`, '#c0a020', '#0e0a00', '#604800');
        _render();
      } else if (action === 'delete') {
        SavedPathSystem.remove(pathId);
        showToast(`🗑 "${saved.name}" deleted`, '#ff7a7a', '#180800', '#602010');
        _lastPathIds = null; // force list rebuild
        _render();
      } else if (action === 'rename') {
        _beginRename(btn.closest('[data-path-id]'), saved);
      }
      return;
    }
    const id = btn.id;
    if (id === 'tp-rename') {
      _beginTruckRename();
      return;
    }
    if (id === 'tp-auto-toggle' && _target._hauler) {
      // A Hauler has one switch: hauling, or parked for you to drive.
      const on = AutoHaulSystem.isHauling(_target);
      AutoHaulSystem.setHauling(_target, !on);
      showToast(on ? `${TruckSystem.displayName(_target)} parked: it is yours to drive` : `${TruckSystem.displayName(_target)} is hauling again`,
                on ? '#ff7a7a' : '#6cb8ff', on ? '#180800' : '#0b1119', on ? '#602010' : '#16304f');
      _lastQueueSig = null;
      _render();
      return;
    }
    if (id === 'tp-auto-toggle') {
      // Automation owns the truck's queue and patrol state while it's on, so
      // this is a hard handover in both directions rather than something
      // that layers on top of a manual queue.
      if (AutoHaulSystem.isEnabled(_target)) {
        AutoHaulSystem.disable(_target);
        showToast('🤖 Auto-dispatch off: truck is yours again', '#ff7a7a', '#180800', '#602010');
      } else if (!AutoHaulSystem.isUnlocked()) {
        showToast(`🔒 Auto-dispatch locked: ${AutoHaulSystem.lockReason()}`, '#e0c060', '#140e00', '#605010');
      } else {
        AutoHaulSystem.enable(_target, _refs.autoJob.value);
        showToast(`🤖 ${TruckSystem.displayName(_target)} automated: ${AutoHaulSystem.jobLabel(_refs.autoJob.value)}`,
                  '#6cb8ff', '#0b1119', '#16304f');
      }
      _lastQueueSig = null;
      _render();
      return;
    }
    if (id === 'tp-startstop') {
      const wasPatrolling = TruckSystem.isPatrolling(_target);
      const pathLen = _target._path ? _target._path.length : 0;
      const busy = _target._haulState || _target._refuelTarget;
      const hasQueue = _target._destQueue && _target._destQueue.length > 0;
      if (AutoHaulSystem.isEnabled(_target)) {
        // Start/Stop is a manual control; with automation on, the planner
        // would just re-issue a leg on its next pass and the button would
        // look broken. Say which switch actually applies instead.
        showToast('🤖 Auto-dispatch is running this truck; turn it off to drive the queue yourself',
                  '#e0c060', '#140e00', '#605010');
      } else if (wasPatrolling && busy) {
        const label = _target._refuelTarget ? 'refueling' : (_target._haulState === 'loading' ? 'loading' : _target._haulState === 'fuelling' ? 'refuelling a stranded truck' : 'unloading');
        showToast(`⏳ Truck is ${label}; it'll resume automatically in a few seconds`, '#e0c060', '#140e00', '#605010');
      } else if (wasPatrolling) {
        TruckSystem.stopPatrol(_target);
        showToast('⏹ Patrol stopped', '#ff7a7a', '#180800', '#602010');
      } else if (_target._autoDispatch) {
        // Resume a paused auto-dispatch trip on its current leg.
        TruckSystem.startPatrol(_target);
        showToast('▶ Dispatch resumed', '#6cb8ff', '#0b1119', '#16304f');
      } else if (hasQueue) {
        TruckDispatchSystem.beginQueue(_target);
      } else if (!TruckSystem.hasPath(_target)) {
        showToast(`🚛 No valid path (path length: ${pathLen}); draw one with the Path Tool first, or add a destination above`, '#ff5d5d', '#180800', '#602010');
      } else {
        TruckSystem.startPatrol(_target);
        const nowPatrolling = TruckSystem.isPatrolling(_target);
        showToast(nowPatrolling ? `▶ Patrol started (${pathLen} waypoints)` : '⚠ startPatrol() ran but isPatrolling() is still false', nowPatrolling ? '#6cb8ff' : '#ff2020', '#0b1119', '#16304f');
      }
      _render();
    } else if (id === 'tp-focus') {
      // Toggle, so the same button both grabs the camera and hands it back.
      // Focusing a truck you're driving is meaningless — driving already
      // follows it — so say so rather than setting a focus that never runs.
      if (TruckSystem.isFocused(_target)) {
        TruckSystem.clearFocus();
        showToast('👁 Camera released', '#aebccb', '#0b1018', '#1f3552');
      } else if (TruckSystem.isDriven(_target)) {
        showToast('👁 Already following: this truck is being driven', '#e0c060', '#140e00', '#605010');
      } else {
        TruckSystem.setFocus(_target);
        showToast('👁 Camera following truck; pan to release', '#6cb8ff', '#0b1119', '#16304f');
      }
      _render();
    } else if (id === 'tp-clear') {
      // Clearing by hand while automation is on would be undone by the next
      // planning pass, so turn it off first — the player asked for a blank
      // slate, not a one-tick flicker.
      if (AutoHaulSystem.isEnabled(_target)) AutoHaulSystem.disable(_target);
      _target._destQueue = [];
      _target._autoDispatch = false;
      _lastQueueSig = null;
      TruckSystem.clearPath(_target);
      close();
    } else if (id === 'tp-close') {
      close();
    }
  }

  // Turns a saved-path row's name into an inline text input so it can be
  // renamed without a native prompt() dialog (nothing else in this UI uses
  // browser-native dialogs, so keep it consistent). Confirms on Enter/blur,
  // cancels on Escape.
  function _beginRename(rowEl, saved) {
    if (!rowEl) return;
    const nameEl = rowEl.querySelector('.tp-path-name');
    if (!nameEl || rowEl.querySelector('input')) return; // already editing
    const input = document.createElement('input');
    input.type = 'text';
    input.value = saved.name;
    input.style.cssText = `
      flex:1; min-width:0; background:#121824; color:#f0f5fb;
      border:1px solid #2f3d52; border-radius:3px;
      font:11px 'Courier New',monospace; padding:2px 4px;`;
    nameEl.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      SavedPathSystem.rename(saved.id, input.value);
      _lastPathIds = null;
      _render();
    };
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation(); // don't let Escape/Enter fall through to global handlers
      if (ev.key === 'Enter') { commit(); }
      else if (ev.key === 'Escape') { _lastPathIds = null; _render(); }
    });
    input.addEventListener('blur', commit);
  }

  // Renames the truck from the panel header. Same inline-input approach as
  // the saved-path rename above (no native prompt() anywhere in this UI), but
  // the title is a STATIC node that _render() rewrites every tick — so
  // instead of replacing it, hide it, park an input beside it, and set
  // _renaming so _render leaves the header alone until the edit ends.
  let _renaming = false;
  function _beginTruckRename() {
    if (!_target || _renaming || !_refs.title) return;
    _renaming = true;
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = TruckSystem.MAX_NAME_LEN;
    input.value = TruckSystem.displayName(_target);
    input.placeholder = 'Truck name';
    input.style.cssText = `
      flex:1; min-width:0; background:#121824; color:#f0f5fb;
      border:1px solid #3b9eff; border-radius:3px;
      font:11px 'Courier New',monospace; padding:2px 4px;`;
    _refs.title.style.display = 'none';
    _refs.renameBtn.style.display = 'none';
    _refs.title.parentElement.insertBefore(input, _refs.title);
    input.focus();
    input.select();

    const subject = _target;   // the edit belongs to THIS truck even if the panel retargets
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      _renaming = false;
      if (commit) TruckSystem.setName(subject, input.value);
      input.remove();
      _refs.title.style.display = '';
      _refs.renameBtn.style.display = '';
      _render();
    };
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();  // don't let typing reach the game's global key handlers
      if (ev.key === 'Enter') finish(true);
      else if (ev.key === 'Escape') finish(false);
    });
    // Typing must not reach the game either — WASD would drive the truck and
    // SPACE would pause, both while the caret is sitting in this box.
    input.addEventListener('keyup',    (ev) => ev.stopPropagation());
    input.addEventListener('keypress', (ev) => ev.stopPropagation());
    input.addEventListener('blur', () => finish(true));
  }

  function _ensureEl() {
    if (_el) return _el;
    _el = document.createElement('div');
    _el.id = 'truck-patrol-panel';
    _el.style.cssText = `
      position:fixed; z-index:99999; display:none; pointer-events:auto; zoom:1.15;
      background:rgba(13,18,27,0.92); border:1px solid rgba(150,180,215,0.20); border-radius:12px;
      padding:10px 14px; min-width:160px; color:#c3d0de; font:13px/1.4 'Inter',system-ui,sans-serif;
      box-shadow:0 18px 50px rgba(0,0,0,0.50), 0 2px 6px rgba(0,0,0,0.35);
      -webkit-backdrop-filter:blur(18px) saturate(140%); backdrop-filter:blur(18px) saturate(140%);
    `;
    document.body.appendChild(_el);
    _el.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button');
      if (btn) _handleButton(btn);
    });

    // ── Drag the panel by its header ──
    // Delegated on the panel root, NOT bound to #tp-drag directly: _ensureEl
    // runs before _buildStatic writes the innerHTML, so the header element
    // doesn't exist yet at this point and querySelector would hand back null.
    // Pointer events (not mouse) so a pen/touch drag works too, with capture
    // on the root so the panel keeps receiving moves even when the pointer
    // outruns it. Everything here is real screen px; _reposition converts to
    // the element's zoomed coordinate space when it writes left/top.
    const onHandle = (ev) => {
      const h = ev.target.closest && ev.target.closest('#tp-drag');
      // The header also holds the rename/focus controls — let those be clicked.
      return h && !ev.target.closest('button, input, select');
    };
    _el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || !onHandle(ev)) return;
      const r = _el.getBoundingClientRect();
      _dragOffset = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      _el.setPointerCapture(ev.pointerId);
      // The map pans on drag and panels close on outside-click; neither should
      // fire because the player grabbed this panel's title bar.
      ev.preventDefault();
      ev.stopPropagation();
    });
    _el.addEventListener('pointermove', (ev) => {
      if (!_dragOffset) return;
      _pos = { left: ev.clientX - _dragOffset.x, top: ev.clientY - _dragOffset.y };
      _reposition();
      ev.preventDefault();
      ev.stopPropagation();
    });
    const endDrag = (ev) => {
      if (!_dragOffset) return;
      _dragOffset = null;
      if (_el.hasPointerCapture(ev.pointerId)) _el.releasePointerCapture(ev.pointerId);
      ev.stopPropagation();
    };
    _el.addEventListener('pointerup', endDrag);
    _el.addEventListener('pointercancel', endDrag);
    // Double-clicking the title bar snaps it back to the default corner —
    // the way out if it's been dragged somewhere awkward.
    _el.addEventListener('dblclick', (ev) => {
      if (!onHandle(ev)) return;
      _pos = null;
      _reposition();
      ev.stopPropagation();
    });
    _el.addEventListener('change', (ev) => {
      if (ev.target.id === 'tp-loop' && _target) {
        _target._queueLoop = ev.target.checked;
        // Hand keyboard focus straight back to the page. SPACE is the game's
        // pause key, and its handler deliberately ignores keystrokes aimed at
        // an <input> — so a checkbox left holding focus silently turned every
        // later SPACE into "toggle Loop" instead of "pause".
        ev.target.blur();
      }
      if (ev.target.id === 'tp-auto-job' && _target) {
        // Changing the job mid-run re-plans immediately rather than waiting
        // out the current leg — picking "Oil" while the truck is halfway to
        // a coal generator should visibly change its mind.
        AutoHaulSystem.setJob(_target, ev.target.value);
        // A <select> holds focus after a click exactly like the Loop
        // checkbox does, and would swallow the game's SPACE the same way.
        ev.target.blur();
        _render();
      }
    });

    // Belt and braces for the same thing: if anything does contrive to focus
    // the box, SPACE still must not flip it.
    _el.addEventListener('keydown', (ev) => {
      if ((ev.target.id === 'tp-loop' || ev.target.id === 'tp-auto-job')
          && (ev.code === 'Space' || ev.key === ' ')) {
        ev.preventDefault();
        ev.target.blur();
      }
    });

    // ── Queue drag-to-reorder ──
    // Pointer-driven rather than native HTML5 drag-and-drop, which paints the
    // OS's translucent ghost image and no-drop cursor. The grabbed row lifts
    // and follows the pointer inside the list; the rows it passes slide out
    // of the way to open the slot it will drop into. Delegated on the panel
    // root because rows are rebuilt via innerHTML whenever the queue changes.
    const QUEUE_EASE = 'transform 140ms cubic-bezier(.2,.8,.2,1)';
    const clearRowStyles = () => {
      for (const r of _qDrag.rows) {
        r.style.transform = ''; r.style.transition = ''; r.style.boxShadow = '';
        r.style.zIndex = ''; r.style.position = ''; r.style.cursor = '';
      }
      document.body.style.cursor = '';
    };
    _el.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || ev.target.closest('button')) return;
      const row = ev.target.closest('[data-queue-index]');
      if (!row || !_target || !_target._destQueue) return;
      const rows = [..._refs.queueList.querySelectorAll('[data-queue-index]')];
      const pitch = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : row.offsetHeight;
      _qDrag = { row, rows, pitch, src: Number(row.dataset.queueIndex), dest: Number(row.dataset.queueIndex),
                 startY: ev.clientY, lastY: ev.clientY, startScroll: _refs.queueList.scrollTop,
                 lifted: false, pointerId: ev.pointerId, raf: 0 };
      // Capture keeps moves coming if the pointer leaves the list; a drag
      // still works without it, so a refused capture mustn't abort it.
      try { _refs.queueList.setPointerCapture(ev.pointerId); } catch (_) {}
      ev.preventDefault();      // no text selection
      ev.stopPropagation();     // no map pan / outside-click close
    });
    // Lay the rows out for the pointer at d.lastY. The list may have scrolled
    // since the grab, which carries the grabbed row's slot with it, so the
    // scroll since then counts towards how far it has moved.
    const placeQueueRows = (d) => {
      // The panel is zoomed (PANEL_ZOOM), so screen px shrink back to layout px.
      let dy = (d.lastY - d.startY) / PANEL_ZOOM + (_refs.queueList.scrollTop - d.startScroll);
      const n = d.rows.length;
      dy = Math.max(-d.src * d.pitch, Math.min((n - 1 - d.src) * d.pitch, dy));
      d.row.style.transform = `translateY(${dy}px) scale(1.02)`;
      d.dest = Math.max(0, Math.min(n - 1, d.src + Math.round(dy / d.pitch)));
      d.rows.forEach((r, i) => {
        if (i === d.src) return;
        let shift = 0;
        if (d.dest > d.src && i > d.src && i <= d.dest) shift = -d.pitch;
        else if (d.dest < d.src && i >= d.dest && i < d.src) shift = d.pitch;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    // Held near the top or bottom of the list (or past it), the list scrolls
    // that way so a row can be carried past the part on show — faster the
    // nearer the edge. Runs per frame while the pointer is held still there.
    const QUEUE_EDGE = 22, QUEUE_SCROLL_MAX = 9;   // screen px band; layout px per frame at the very edge
    const autoScrollQueue = () => {
      const d = _qDrag;
      if (!d || !d.lifted) return;
      d.raf = 0;
      const list = _refs.queueList, box = list.getBoundingClientRect();
      const up = box.top + QUEUE_EDGE - d.lastY, down = d.lastY - (box.bottom - QUEUE_EDGE);
      let v = 0;
      if (up > 0) v = -Math.min(1, up / QUEUE_EDGE) * QUEUE_SCROLL_MAX;
      else if (down > 0) v = Math.min(1, down / QUEUE_EDGE) * QUEUE_SCROLL_MAX;
      if (!v) return;
      const before = list.scrollTop;
      list.scrollTop = before + v;
      if (list.scrollTop === before) return;   // already at that end
      placeQueueRows(d);
      d.raf = requestAnimationFrame(autoScrollQueue);
    };
    _el.addEventListener('pointermove', (ev) => {
      if (!_qDrag || ev.pointerId !== _qDrag.pointerId) return;
      const d = _qDrag;
      d.lastY = ev.clientY;
      if (!d.lifted) {
        if (Math.abs((ev.clientY - d.startY) / PANEL_ZOOM) < 4) return;   // a plain click on a row stays a click
        d.lifted = true;
        for (const r of d.rows) { r.style.transition = QUEUE_EASE; r.style.position = 'relative'; }
        d.row.style.transition = 'box-shadow 120ms, background 120ms';
        d.row.style.zIndex = '2';
        d.row.style.boxShadow = '0 6px 14px rgba(0,0,0,0.55), 0 0 0 1px #6cb8ff';
        d.row.style.cursor = 'grabbing';
        document.body.style.cursor = 'grabbing';
      }
      placeQueueRows(d);
      if (!d.raf) autoScrollQueue();
      ev.preventDefault();
      ev.stopPropagation();
    });
    const endQueueDrag = (ev, commit) => {
      if (!_qDrag || ev.pointerId !== _qDrag.pointerId) return;
      const d = _qDrag;
      if (d.raf) cancelAnimationFrame(d.raf);
      if (_refs.queueList.hasPointerCapture(ev.pointerId)) _refs.queueList.releasePointerCapture(ev.pointerId);
      clearRowStyles();
      _qDrag = null;
      ev.stopPropagation();
      if (!d.lifted) return;
      if (commit && d.dest !== d.src && _target && _target._destQueue) _moveQueueEntry(d.src, d.dest);
      _lastQueueSig = null;
      _render();
    };
    _el.addEventListener('pointerup',     (ev) => endQueueDrag(ev, true));
    _el.addEventListener('pointercancel', (ev) => endQueueDrag(ev, false));
    return _el;
  }

  // The panel is zoomed 15% (see _ensureEl) and Chrome scales an element's
  // own offsets by its zoom, so every px written to left/top/right has to be
  // divided back out to land where intended on screen.
  const PANEL_ZOOM = 1.15;
  let _pos = null;        // player-dragged position in screen px, or null for the default anchor
  let _dragOffset = null; // grab point within the panel while a drag is in progress
  // Difference between where we ask the panel to sit and where it actually
  // lands, in screen px. It isn't zero: the panelIn entrance animation leaves
  // a small translateY on the element, which the 1.15 zoom scales up to about
  // 7px. Rather than hard-coding that (the animation is free to change, and
  // it's mid-flight for the first 0.18s after every open), _reposition reads
  // back where the panel ended up and folds the error in. The relationship is
  // affine with slope 1, so it converges in a single frame and re-converges
  // on its own if the transform shifts underneath it.
  let _anchorFix = { dx: 0, dy: 0 };

  function _reposition() {
    if (!_target || !_el) return;
    if (_pos) {
      // Keep it on screen — a panel dragged off the edge (or left behind by a
      // window resize) would otherwise be unreachable, including its own
      // Close button. offsetWidth/Height are pre-zoom layout px, so scale up
      // to compare against the viewport.
      const w = _el.offsetWidth  * PANEL_ZOOM;
      const h = _el.offsetHeight * PANEL_ZOOM;
      const left = Math.min(Math.max(0, _pos.left), Math.max(0, window.innerWidth  - w));
      const top  = Math.min(Math.max(0, _pos.top),  Math.max(0, window.innerHeight - h));
      _el.style.right = '';
      _el.style.left  = `${(left + _anchorFix.dx) / PANEL_ZOOM}px`;
      _el.style.top   = `${(top  + _anchorFix.dy) / PANEL_ZOOM}px`;
      const r = _el.getBoundingClientRect();
      _anchorFix = { dx: _anchorFix.dx + (left - r.left), dy: _anchorFix.dy + (top - r.top) };
      return;
    }
    // Back on the default anchor — drop the correction so a later drag
    // recalibrates from scratch instead of inheriting a stale offset.
    _anchorFix = { dx: 0, dy: 0 };
    // Default: fixed upper-right anchor (same convention as
    // #wire-repair-panel) — this used to track the truck's on-screen position
    // every tick, which meant the panel visibly drifted/jumped around while
    // patrolling or being driven. A stationary panel is easier to read and
    // interact with regardless of what the truck is doing.
    _el.style.left  = '';
    _el.style.right = `calc(16px / ${PANEL_ZOOM})`;
    _el.style.top   = `calc(60px / ${PANEL_ZOOM})`;
  }

  const CARGO_LABEL = {
    [T.COALWASTE]:    { name: 'Coal Ash',      color: '#c09050' },
    [T.OILWASTE]:      { name: 'Oil Sludge',    color: '#4a98e0' },
    [T.NUCLEARWASTE]:  { name: 'Nuclear Waste', color: '#6cb8ff' },
  };

  // Builds the panel's DOM ONCE (buttons + labels as stable nodes).
  //
  // ROOT CAUSE OF THE UNRESPONSIVE BUTTON: tick() runs every game frame and
  // used to call a _render() that did `_el.innerHTML = ...`, tearing down
  // and rebuilding every element — including the Start/Stop <button> — on
  // every single tick. If a re-render landed between the player's mousedown
  // and mouseup (extremely likely at 60 ticks/sec), the button node that
  // received the mousedown no longer existed by mouseup. Browsers silently
  // drop the click event when its target is removed from the DOM mid-click,
  // so the click never fired. That's why it felt "randomly" unresponsive
  // instead of reliably broken — it only worked on the rare click that
  // completed within a single frame's window, hence needing a coordinate
  // hit-test fallback that itself only caught the same rare surviving
  // clicks.
  //
  // Fix: build the buttons/labels once and keep the same nodes alive for as
  // long as the panel is open. tick() only ever updates text/style on the
  // existing nodes, so a click gesture in progress is never interrupted.
  function _buildStatic() {
    if (_built) return;
    _el.innerHTML = `
      <div id="tp-drag" title="Drag to move · double-click to reset" style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;cursor:move;user-select:none">
        <span style="display:flex;align-items:center;gap:5px;min-width:0;flex:1">
          <span id="tp-panel-title" style="font-weight:bold;color:#f0f5fb;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🚛 Truck Patrol</span>
          <button id="tp-rename" title="Rename this truck" style="
            flex:none; padding:1px 5px; border-radius:3px; border:1px solid #334052;
            background:#141a24; color:#c3d0de; cursor:pointer;
            font:10px 'Courier New',monospace">✎</button>
        </span>
        <button id="tp-focus" style="
          padding:2px 7px; border-radius:3px; border:1px solid #2f3d52;
          background:#1a2230; color:#c3d0de; cursor:pointer;
          font:10px 'Courier New',monospace; white-space:nowrap"></button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span id="tp-waypoints" style="font-size:11px;color:#7a8b9f"></span>
        <button data-action="toggleEdit" id="tp-editbtn" style="
          padding:2px 7px; border-radius:3px; border:1px solid #2f3d52;
          background:#1a2230; color:#c3d0de; cursor:pointer; font:10px 'Courier New',monospace">✎ Edit</button>
      </div>
      <div id="tp-status" style="font-size:11px;color:#8ccaff;margin-bottom:6px;line-height:1.3"></div>
      <div id="tp-editlist" style="display:none;max-height:140px;overflow-y:auto;flex-direction:column;gap:3px;margin-bottom:8px"></div>
      <div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">
          <span style="color:#7a8b9f">Fuel</span>
          <span id="tp-fuel-label" style="font-weight:bold"></span>
        </div>
        <div style="height:5px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden">
          <div id="tp-fuel-fill" style="height:100%;width:0%"></div>
        </div>
      </div>
      <div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">
          <span style="color:#7a8b9f">Cargo</span>
          <span id="tp-cargo-label" style="font-weight:bold"></span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#5d6c7e;margin-bottom:3px">
          <span>Load</span>
          <span id="tp-cargo-amt"></span>
        </div>
        <div style="height:5px;border-radius:3px;background:rgba(255,255,255,0.08);overflow:hidden">
          <div id="tp-cargo-fill" style="height:100%;width:0%"></div>
        </div>
      </div>
      <div id="tp-auto" style="margin-bottom:8px">
        <div style="font-size:11px;color:#7a8b9f;margin-bottom:3px">🤖 Auto Dispatch</div>
        <div id="tp-auto-box" style="background:#141b26;border:1px solid #263244;border-radius:4px;padding:5px 6px;display:flex;flex-direction:column;gap:5px">
          <div id="tp-auto-name" style="font-size:11px;font-weight:bold;color:#c3d0de;letter-spacing:0.05em;text-transform:uppercase"></div>
          <select id="tp-auto-job" class="tp-select" tabindex="-1"></select>
          <button id="tp-auto-toggle" style="
            padding:4px 6px; border-radius:4px; border:1px solid #2f3d52;
            cursor:pointer; font:11px 'Courier New',monospace"></button>
          <div id="tp-auto-status" style="font-size:10px;color:#7a8b9f;line-height:1.35"></div>
        </div>
      </div>
      <div id="tp-sendto" style="margin-bottom:8px">
        <div style="font-size:11px;color:#7a8b9f;margin-bottom:3px">🎯 Send To</div>
        <div id="tp-sendto-list" style="max-height:120px;overflow-y:auto;display:flex;flex-direction:column;gap:3px"></div>
      </div>
      <div id="tp-queue" style="margin-bottom:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">
          <span style="font-size:11px;color:#7a8b9f">Queue</span>
          <label style="font-size:10px;color:#aebccb;display:flex;align-items:center;gap:4px;cursor:pointer">
            <input type="checkbox" id="tp-loop" class="tp-check" tabindex="-1"> 🔁 Loop
          </label>
        </div>
        <div id="tp-queue-list" style="max-height:120px;overflow-y:auto;display:flex;flex-direction:column;gap:3px"></div>
      </div>
      <div id="tp-pathsection" style="margin-bottom:8px">
        <div style="font-size:11px;color:#7a8b9f;margin-bottom:3px">Saved paths</div>
        <div id="tp-pathlist" style="max-height:120px;overflow-y:auto;display:flex;flex-direction:column;gap:3px"></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button id="tp-startstop" style="
          flex:1; padding:4px 6px; border-radius:4px; border:1px solid #2f3d52;
          cursor:pointer; font:12px 'Courier New',monospace"></button>
        <button id="tp-clear" style="
          flex:1; padding:4px 6px; border-radius:4px; border:1px solid #4a3010;
          background:#1a1208; color:#c08040;
          cursor:pointer; font:12px 'Courier New',monospace">
          🗑 Clear
        </button>
        <button id="tp-close" style="
          width:100%;margin-top:4px; padding:3px; border-radius:4px; border:1px solid #2a3444;
          background:#121824; color:#5d6c7e;
          cursor:pointer; font:11px 'Courier New',monospace">
          Close
        </button>
      </div>
    `;
    // NOT "tp-title" — the Hydro Turbine panel in index.html already owns
    // that id, and a duplicate would make getElementById elsewhere return
    // whichever happens to come first in the document.
    _refs.title      = _el.querySelector('#tp-panel-title');
    _refs.renameBtn  = _el.querySelector('#tp-rename');
    _refs.waypoints  = _el.querySelector('#tp-waypoints');
    _refs.status     = _el.querySelector('#tp-status');
    _refs.focusBtn   = _el.querySelector('#tp-focus');
    _refs.editBtn    = _el.querySelector('#tp-editbtn');
    _refs.editList   = _el.querySelector('#tp-editlist');
    _refs.fuelLabel  = _el.querySelector('#tp-fuel-label');
    _refs.fuelFill   = _el.querySelector('#tp-fuel-fill');
    _refs.cargoLabel = _el.querySelector('#tp-cargo-label');
    _refs.cargoAmt   = _el.querySelector('#tp-cargo-amt');
    _refs.cargoFill  = _el.querySelector('#tp-cargo-fill');
    _refs.startStop  = _el.querySelector('#tp-startstop');
    _refs.pathSection = _el.querySelector('#tp-pathsection');
    _refs.pathList    = _el.querySelector('#tp-pathlist');
    _refs.autoSection = _el.querySelector('#tp-auto');
    _refs.autoBox     = _el.querySelector('#tp-auto-box');
    _refs.autoName    = _el.querySelector('#tp-auto-name');
    _refs.autoJob     = _el.querySelector('#tp-auto-job');
    _refs.autoToggle  = _el.querySelector('#tp-auto-toggle');
    _refs.autoStatus  = _el.querySelector('#tp-auto-status');
    _refs.sendToSection = _el.querySelector('#tp-sendto');
    _refs.queueSection  = _el.querySelector('#tp-queue');
    // Job options never change, so they're part of the one-time build —
    // rebuilding a <select>'s options on a tick would reset an open dropdown
    // under the player's cursor.
    _refs.autoJob.innerHTML = AutoHaulSystem.JOBS
      .map(j => `<option value="${j.id}">${j.label}</option>`).join('');
    _refs.sendToList  = _el.querySelector('#tp-sendto-list');
    _refs.queueList   = _el.querySelector('#tp-queue-list');
    _refs.loopCheckbox = _el.querySelector('#tp-loop');
    _built = true;
  }

  // Candidates are only ever waste source buildings (coal generator/refinery/
  // reactor — where a truck picks up), the matching processing facilities
  // (where it drops off), and any gas stations that already exist on the
  // map — nothing hypothetical/unbuilt is ever offered, since this scans
  // live entities each call. Sources are included alongside facilities
  // because HaulSystem only ever loads cargo AT a source building — sending
  // an empty truck straight to the facility with nothing to unload is a
  // no-op, so the source buildings need to be reachable destinations too.
  const _SENDTO_FACILITY_TYPES = [T.COALWASTE, T.OILWASTE, T.NUCLEARWASTE];
  // Appends " #N" when the entity is one of the numbered utility/generation
  // types (see NUMBERED_ENTITY_TYPES in core.js) — without it, multiple
  // Refineries/Gas Stations etc. show up as identical, indistinguishable
  // rows in the Send To list.
  function _numberedLabel(label, entity) {
    if (entity && entity._num !== undefined && typeof NUMBERED_ENTITY_TYPES !== 'undefined' && NUMBERED_ENTITY_TYPES.has(entity.type)) {
      return `${label} #${entity._num}`;
    }
    return label;
  }

  // Waste buildup readout for a waste source row ("42%"), coloured the same
  // way the entity info panel grades its waste buffer. Every source's waste
  // field already counts 0–100 (see coal_system / oil_system /
  // nuclear_chain_systems), so the field value is the percentage.
  function _paintWastePct(el, entity) {
    if (!el) return;
    const cfg = entity && WASTE_CFG[entity.type];
    if (!cfg) { el.textContent = ''; return; }
    const pct = Math.max(0, Math.min(100, Math.round(entity[cfg.field] || 0)));
    el.textContent = `${pct}%`;
    el.style.color = pct >= 90 ? '#ff5d5d' : pct >= 60 ? '#e0a020' : '#5aa8f0';
  }
  const _WASTE_SPAN_STYLE = 'font-size:10px;font-weight:bold;white-space:nowrap';

  // A Hauler's stops are the other half of the map: whatever makes a solid
  // or liquid it can carry, and the Storage Containers and Liquid Storage
  // Tanks it loads from or delivers to. They ride the queue as ordinary
  // 'source' descriptors (a type plus a tile), so dispatch, labels and saves
  // need nothing new; HaulSystem works out load or unload on arrival.
  function _collectHaulerCandidates() {
    const list = [], seen = new Set();
    const C = typeof DroneSystem !== 'undefined' ? DroneSystem.cargo : null;
    const add = (e) => {
      if (seen.has(e)) return;
      seen.add(e);
      list.push({ kind: 'source', sourceType: e.type, col: e.col, row: e.row, stock: true,
                  label: _numberedLabel(EntityDefs[e.type]?.label || 'Building', e), entity: e });
    };
    if (C) {
      const kinds = C.kinds();
      for (const k in kinds) {
        for (const t of kinds[k].types) for (const e of EntityRegistry.getByType(t)) add(e);
      }
      for (const ph of ['solid', 'liquid', 'gas']) for (const e of EntityRegistry.getByType(C.vessels[ph].type())) add(e);
    }
    for (const stn of EntityRegistry.getByType(T.GASSTATION)) {
      list.push({ kind: 'gasstation', col: stn.col, row: stn.row, label: _numberedLabel('Gas Station', stn), entity: stn });
    }
    return list;
  }

  // What a Hauler would find at a stop: a producer's surplus, or what a
  // vessel is asking for (Truck Supply) or holding.
  function _paintStock(el, entity) {
    if (!el) return;
    const C = typeof DroneSystem !== 'undefined' ? DroneSystem.cargo : null;
    if (!C || !entity) { el.textContent = ''; return; }
    const kinds = C.kinds();
    const amt = (n) => (n === Infinity ? '∞' : Math.floor(n));
    if (C.isVessel(entity)) {
      const V = Object.values(C.vessels).find(v => v.type() === entity.type);
      const held = V.held(entity), want = entity._truckSupply;
      if (want && kinds[want]) {
        el.textContent = `Wants ${kinds[want].label}`;
        el.style.color = '#6cd08a';
      } else {
        el.textContent = held && kinds[held] ? `${kinds[held].label} ${amt(V.amount(entity))}` : 'Empty';
        el.style.color = held ? '#5aa8f0' : '#5d6c7e';
      }
      return;
    }
    let best = null, bestAmt = -1;
    for (const k in kinds) {
      if (!kinds[k].types.includes(entity.type)) continue;
      const a = C.avail(k, entity);
      if (a > bestAmt) { bestAmt = a; best = k; }
    }
    el.textContent = best ? `${kinds[best].label} ${amt(bestAmt)}` : '';
    el.style.color = bestAmt >= 1 ? '#5aa8f0' : '#5d6c7e';
  }

  function _collectSendToCandidates() {
    if (_target && _target._hauler) return _collectHaulerCandidates();
    const list = [];
    for (const srcType of WASTE_SOURCES) {
      for (const e of EntityRegistry.getByType(srcType)) {
        list.push({ kind: 'source', sourceType: srcType, col: e.col, row: e.row, label: _numberedLabel(EntityDefs[srcType].label, e), entity: e });
      }
    }
    for (const facType of _SENDTO_FACILITY_TYPES) {
      // EntityRegistry.getByType returns a Set, not an array — no .length/[0].
      for (const e of EntityRegistry.getByType(facType)) {
        list.push({ kind: 'facility', facilityType: facType, label: EntityDefs[facType].label, entity: e });
        break;
      }
    }
    for (const stn of EntityRegistry.getByType(T.GASSTATION)) {
      list.push({ kind: 'gasstation', col: stn.col, row: stn.row, label: _numberedLabel('Gas Station', stn), entity: stn });
    }
    return list;
  }

  function _entityDistTiles(trk, entity) {
    const ec = entity.col + (entity.width  || 1) / 2;
    const er = entity.row + (entity.height || 1) / 2;
    return Math.hypot(ec - trk.col, er - trk.row);
  }

  // Rebuilds the Send To list only when the underlying candidate set
  // changes (facility/gas-station instances appearing) — distance readouts
  // are patched in place every tick via the cached row refs, same
  // click-safety rationale as the saved-paths / edit lists above.
  let _lastSendToSig = null;
  let _sendToRows = [];
  function _refreshSendToList() {
    const candidates = _collectSendToCandidates();
    // Prefixed with the fleet: a Truck and a Hauler never share a list, even
    // when the panel hops from one to the other with the same buildings up.
    const hauler = !!_target._hauler;
    const sig = (hauler ? 'h|' : 't|') + candidates.map(c => c.kind === 'facility' ? `f:${c.facilityType}` : `${c.kind === 'source' ? 's' : 'g'}:${c.col},${c.row}`).join('|');
    if (sig !== _lastSendToSig) {
      _lastSendToSig = sig;
      if (!candidates.length) {
        _refs.sendToList.innerHTML = `<div style="font-size:11px;color:#5d6c7e;padding:4px">${hauler ? 'No producers, storage or gas stations on the map yet' : 'No facilities or gas stations on the map yet'}</div>`;
        _sendToRows = [];
      } else {
        _refs.sendToList.innerHTML = candidates.map((c, i) => `
          <div style="display:flex;align-items:center;gap:4px;background:#141b26;border:1px solid #263244;border-radius:4px;padding:3px 4px">
            <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px">${c.label}</span>
            ${c.stock ? `<span data-stock-idx="${i}" title="Surplus to collect, or what this storage wants" style="${_WASTE_SPAN_STYLE}"></span>`
              : c.kind === 'source' ? `<span data-waste-idx="${i}" title="Waste buildup" style="${_WASTE_SPAN_STYLE}"></span>` : ''}
            <span data-dist-idx="${i}" style="font-size:10px;color:#5d6c7e;white-space:nowrap"></span>
            <button data-action="addDest" data-kind="${c.kind}"
              ${c.kind === 'facility' ? `data-facility-type="${c.facilityType}"`
                : c.kind === 'source' ? `data-source-type="${c.sourceType}" data-col="${c.col}" data-row="${c.row}"`
                : `data-col="${c.col}" data-row="${c.row}"`}
              title="Add to queue" style="
              padding:1px 6px; border-radius:3px; border:1px solid #2f3d52;
              background:#1a2230; color:#6cb8ff; cursor:pointer; font:11px 'Courier New',monospace">➕</button>
          </div>
        `).join('');
        _sendToRows = candidates.map((c, i) => ({
          entity: c.entity,
          el: _refs.sendToList.querySelector(`[data-dist-idx="${i}"]`),
          wasteEl: _refs.sendToList.querySelector(`[data-waste-idx="${i}"]`),
          stockEl: _refs.sendToList.querySelector(`[data-stock-idx="${i}"]`),
        }));
      }
    }
    for (const row of _sendToRows) {
      if (row.el) row.el.textContent = `${Math.round(_entityDistTiles(_target, row.entity))} tiles`;
      if (row.wasteEl) _paintWastePct(row.wasteEl, row.entity);
      if (row.stockEl) _paintStock(row.stockEl, row.entity);
    }
  }

  // Rebuilds the Queue list only when its contents actually change (add/
  // remove/reorder) — same rationale as above.
  let _lastQueueSig = null;
  let _qDrag = null; // in-progress queue row drag (see the pointer handlers in _ensureEl)

  // Moves a queue entry, keeping the "currently active" pointer aimed at the
  // same descriptor it was before the reorder, not just the same index.
  function _moveQueueEntry(srcIndex, destIndex) {
    const queue = _target._destQueue;
    const [moved] = queue.splice(srcIndex, 1);
    queue.splice(destIndex, 0, moved);
    if (_target._autoDispatch) {
      if (_target._queueIdx === srcIndex) _target._queueIdx = destIndex;
      else if (srcIndex < _target._queueIdx && destIndex >= _target._queueIdx) _target._queueIdx--;
      else if (srcIndex > _target._queueIdx && destIndex <= _target._queueIdx) _target._queueIdx++;
    }
  }
  // Waste percentages on queued source rows change every tick while the
  // rows themselves don't, so they're patched in place like the Send To
  // distances rather than forcing a rebuild.
  function _patchQueueWaste() {
    for (const el of _refs.queueList.querySelectorAll('[data-queue-waste]')) {
      const [c, r] = el.dataset.queueWaste.split(',').map(Number);
      if (_target._hauler) _paintStock(el, GridManager.getEntity(c, r));
      else _paintWastePct(el, GridManager.getEntity(c, r));
    }
  }
  function _refreshQueueList() {
    // Never rebuild under a row being dragged — the truck reaching a stop
    // mid-drag bumps _queueIdx, and a rebuild would drop the grabbed row.
    if (_qDrag) { _patchQueueWaste(); return; }
    const queue = _target._destQueue || [];
    const sig = (_target._hauler ? 'h|' : 't|') + queue.map(d => d.kind === 'facility' ? `f:${d.facilityType}` : `${d.kind === 'source' ? 's' : 'g'}:${d.col},${d.row}`).join('|')
      + '#' + (_target._autoDispatch ? _target._queueIdx : -1);
    if (sig === _lastQueueSig) { _patchQueueWaste(); return; }
    _lastQueueSig = sig;
    if (!queue.length) {
      _refs.queueList.innerHTML = `<div style="font-size:11px;color:#5d6c7e;padding:4px">Empty: add a destination above</div>`;
      return;
    }
    _refs.queueList.innerHTML = queue.map((d, i) => {
      const label = d.kind === 'facility' ? (EntityDefs[d.facilityType]?.label || 'Facility')
        : d.kind === 'source' ? _numberedLabel(EntityDefs[d.sourceType]?.label || 'Source', GridManager.getEntity(d.col, d.row))
        : _numberedLabel('Gas Station', GridManager.getEntity(d.col, d.row));
      const active = _target._autoDispatch && i === _target._queueIdx;
      return `
      <div data-queue-index="${i}" title="Drag to reorder" style="display:flex;align-items:center;gap:4px;background:${active ? '#1a2536' : '#141b26'};border:1px solid ${active ? '#6cb8ff' : '#263244'};border-radius:4px;padding:3px 4px;cursor:grab;user-select:none;touch-action:none">
        <span style="color:#3a4658;font-size:10px">⠿</span>
        <span style="color:#6cb8ff;font-weight:bold;min-width:14px;font-size:11px">${i + 1}.</span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px">${label}${active ? ' (en route)' : ''}</span>
        ${d.kind === 'source' ? `<span data-queue-waste="${d.col},${d.row}" title="${_target._hauler ? 'Surplus to collect, or what this storage wants' : 'Waste buildup'}" style="${_WASTE_SPAN_STYLE}"></span>` : ''}
        <button data-action="jumpToDest" data-index="${i}" title="Send truck here now" style="
          padding:1px 6px; border-radius:3px; border:1px solid #2f3d52;
          background:#1a2230; color:#6cb8ff; cursor:pointer; font:11px 'Courier New',monospace">▶</button>
        <button data-action="removeDest" data-index="${i}" title="Remove" style="
          padding:1px 6px; border-radius:3px; border:1px solid #4a3010;
          background:#1a1208; color:#c08040; cursor:pointer; font:11px 'Courier New',monospace">✕</button>
      </div>`;
    }).join('');
    _patchQueueWaste();
  }

  // Rebuilds the numbered waypoint-edit list — only when edit mode or the
  // path itself actually changed (same signature-diff pattern as
  // _refreshPathList, for the same reason: tick() calls this every frame,
  // and tearing down a button mid-click drops the click).
  function _refreshEditList() {
    if (!_editMode) {
      _refs.editList.style.display = 'none';
      return;
    }
    _refs.editList.style.display = 'flex';
    const pts  = _target._path || [];
    const sig  = _editMode + ':' + pts.map(p => `${p.wx},${p.wy}`).join('|');
    if (sig === _lastEditSig) return;
    _lastEditSig = sig;
    _refs.editList.innerHTML = pts.map((p, i) => `
      <div style="
        display:flex; align-items:center; gap:6px; background:#141b26;
        border:1px solid #263244; border-radius:4px; padding:3px 6px;font-size:11px">
        <span style="color:#6cb8ff;font-weight:bold;min-width:16px">${i + 1}.</span>
        <span style="flex:1;color:#aebccb">(${Math.round(p.wx / TILE)}, ${Math.round(p.wy / TILE)})</span>
        <button data-action="jumpWaypoint" data-wx="${p.wx}" data-wy="${p.wy}" title="Jump camera here" style="
          padding:1px 6px; border-radius:3px; border:1px solid #2f3d52;
          background:#1a2230; color:#6cb8ff; cursor:pointer; font:11px 'Courier New',monospace">🎯</button>
        <button data-action="removeWaypoint" data-index="${i}" title="Remove waypoint" style="
          padding:1px 6px; border-radius:3px; border:1px solid #4a3010;
          background:#1a1208; color:#c08040; cursor:pointer; font:11px 'Courier New',monospace">✕</button>
      </div>
    `).join('') || `<div style="font-size:11px;color:#5d6c7e;padding:4px">No waypoints left</div>`;
  }

  // Rebuilds the saved-path row list — only when the underlying data has
  // actually changed (id/name/point-count signature), since tick() calls
  // this every frame. Rows are only ever torn down by user-triggered
  // changes (assign/rename/delete), never mid-gesture, so this doesn't
  // reintroduce the dropped-click bug described above.
  let _lastPathIds = null;
  function _refreshPathList() {
    const paths = SavedPathSystem.all();
    _refs.pathSection.style.display = paths.length ? 'block' : 'none';
    const idsKey = paths.map(p => `${p.id}:${p.name}:${p.waypoints.length}`).join('|');
    if (idsKey === _lastPathIds) return;
    _lastPathIds = idsKey;
    _refs.pathList.innerHTML = paths.map(p => `
      <div data-path-id="${p.id}" style="
        display:flex; align-items:center; gap:4px; background:#141b26;
        border:1px solid #263244; border-radius:4px; padding:3px 4px">
        <span class="tp-path-name" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px" title="${p.name}: ${p.waypoints.length} pts">${p.name}</span>
        <button data-action="assign" title="Assign to this truck" style="
          padding:1px 5px; border-radius:3px; border:1px solid #2f3d52;
          background:#1a2230; color:#6cb8ff; cursor:pointer; font:11px 'Courier New',monospace">▶</button>
        <button data-action="rename" title="Rename" style="
          padding:1px 5px; border-radius:3px; border:1px solid #334052;
          background:#141a24; color:#c3d0de; cursor:pointer; font:11px 'Courier New',monospace">✎</button>
        <button data-action="delete" title="Delete" style="
          padding:1px 5px; border-radius:3px; border:1px solid #4a3010;
          background:#1a1208; color:#c08040; cursor:pointer; font:11px 'Courier New',monospace">🗑</button>
      </div>
    `).join('');
  }

  // The Auto Dispatch block: truck name, job picker, on/off switch and a
  // live status line. Text/style only — every node here is built once in
  // _buildStatic, for the same dropped-click reason as the rest of the panel.
  function _refreshAutoSection() {
    // A Hauler has no job to pick: it serves whatever storage is asking for
    // Truck Supply, and needs no Auto-Dispatch research to do it.
    const hauler = !!_target._hauler;
    _refs.autoJob.style.display = hauler ? 'none' : '';
    if (hauler) {
      const on = AutoHaulSystem.isHauling(_target);
      _refs.autoName.textContent = TruckSystem.displayName(_target);
      _refs.autoToggle.textContent = on ? '⏹ Stop Hauling' : '⚡ Start Hauling';
      _refs.autoToggle.style.background  = on ? '#3a1010' : '#173150';
      _refs.autoToggle.style.color       = on ? '#ff7a7a' : '#6cb8ff';
      _refs.autoToggle.style.borderColor = on ? '#5c2020' : '#2f3d52';
      _refs.autoBox.style.borderColor    = on ? '#3b9eff' : '#263244';
      _refs.autoStatus.textContent = on ? AutoHaulSystem.statusOf(_target)
        : 'Parked. Queue stops below to run it by hand, or flag storage for Truck Supply and start hauling.';
      _refs.autoStatus.style.color = on ? '#8ccaff' : '#7a8b9f';
      _refs.sendToSection.style.opacity = on ? '0.4' : '1';
      _refs.queueSection.style.opacity  = on ? '0.4' : '1';
      return;
    }
    const unlocked = AutoHaulSystem.isUnlocked();
    const on       = unlocked && AutoHaulSystem.isEnabled(_target);

    _refs.autoName.textContent = TruckSystem.displayName(_target);

    // Only write the select back when it disagrees with the truck — an
    // unconditional assignment every tick would slam an open dropdown shut
    // under the player's cursor.
    const job = AutoHaulSystem.jobOf(_target);
    if (_refs.autoJob.value !== job) _refs.autoJob.value = job;
    _refs.autoJob.disabled = !unlocked;

    _refs.autoToggle.textContent = !unlocked ? '🔒 Locked'
                                 : on        ? '⏹ Disable Auto Dispatch'
                                             : '⚡ Enable Auto Dispatch';
    _refs.autoToggle.style.background  = !unlocked ? '#171d26' : on ? '#3a1010' : '#173150';
    _refs.autoToggle.style.color       = !unlocked ? '#5d6c7e' : on ? '#ff7a7a' : '#6cb8ff';
    _refs.autoToggle.style.borderColor = !unlocked ? '#2a3444' : on ? '#5c2020' : '#2f3d52';
    _refs.autoBox.style.borderColor    = on ? '#3b9eff' : '#263244';

    if (!unlocked) {
      _refs.autoStatus.textContent = AutoHaulSystem.lockReason();
      _refs.autoStatus.style.color = '#5d6c7e';
    } else if (on) {
      _refs.autoStatus.textContent = AutoHaulSystem.statusOf(_target);
      _refs.autoStatus.style.color = '#8ccaff';
    } else {
      _refs.autoStatus.textContent = 'Pick a job, then enable to run this truck hands-off.';
      _refs.autoStatus.style.color = '#7a8b9f';
    }

    // The manual Send To / Queue controls still work, but automation
    // rewrites the queue every leg — dim them so it's obvious which set of
    // controls is actually in charge right now.
    _refs.sendToSection.style.opacity = on ? '0.4' : '1';
    _refs.queueSection.style.opacity  = on ? '0.4' : '1';
  }

  function _render() {
    if (!_target || !_el) return;
    _buildStatic();
    _refreshPathList();
    _refreshSendToList();
    _refreshQueueList();
    _refreshAutoSection();
    _refs.loopCheckbox.checked = !!_target._queueLoop;

    const patrolling = TruckSystem.isPatrolling(_target);
    const pts = _target._path ? _target._path.length : 0;

    // What the truck is actually doing right now — a specific destination
    // while it's driving somewhere, or the specific action while it's
    // stopped, rather than a vague "En route"/"Busy" that doesn't say where
    // or why. Automation already narrates itself in the Auto Dispatch box
    // below, so this line stays quiet while that's running.
    const auto = AutoHaulSystem.isEnabled(_target);
    if (auto) {
      _refs.status.textContent = '';
    } else {
      const activity = TruckDispatchSystem.statusText(_target);
      _refs.status.textContent = activity ? activity
                                : patrolling ? 'Patrolling waypoints'
                                : '';
      _refs.status.style.color = _target._refuelTarget || _target._haulState ? '#f5c451' : '#8ccaff';
    }

    const cargoAmt   = _target._cargoAmount || 0;
    const cap        = truckCargoCap(_target, _target._cargoKind);
    const pct        = Math.max(0, Math.min(1, cargoAmt / cap));
    const info       = _target._hauler
      ? (_target._cargoKind ? { name: _target._cargoLabel || 'Cargo', color: '#5ab0e8' } : null)
      : (CARGO_LABEL[_target._cargoFacility] || null);
    const haulState  = _target._haulState || null;   // 'loading' | 'unloading' | 'fuelling' | null
    const cargoName  = haulState === 'loading'   ? `Loading ${info ? info.name : '…'}…`
                      : haulState === 'unloading' ? `Unloading…`
                      : haulState === 'fuelling'  ? `Refuelling a truck…`
                      : cargoAmt > 0 && info      ? info.name
                      : 'Empty';
    const cargoColor = cargoAmt > 0 && info ? info.color : '#3a4658';

    const fuelCap   = truckSpec(_target).fuelCapacity || 100;
    const fuel      = _target._fuel !== undefined ? _target._fuel : fuelCap;
    const fuelPct   = Math.max(0, Math.min(1, fuel / fuelCap));
    const refueling = !!_target._refuelTarget;
    const fuelColor = refueling ? '#f5c451' : fuelPct > 0.3 ? '#6cb8ff' : '#ff5d5d';

    // Skipped mid-rename: the header is hidden and an input is standing in
    // for it (see _beginTruckRename).
    if (!_renaming) _refs.title.textContent = `🚛 ${TruckSystem.displayName(_target)}`;
    _refs.waypoints.textContent = `${pts} waypoints`;
    _refs.editBtn.textContent   = _editMode ? '✕ Close Edit' : '✎ Edit';
    _refreshEditList();

    _refs.fuelLabel.textContent     = refueling ? 'Refueling…' : `${fuel.toFixed(0)} / ${fuelCap}`;
    _refs.fuelLabel.style.color     = fuelColor;
    _refs.fuelFill.style.width      = `${Math.round(fuelPct * 100)}%`;
    _refs.fuelFill.style.background = fuelColor;

    _refs.cargoLabel.textContent     = cargoName;
    _refs.cargoLabel.style.color     = cargoColor;
    _refs.cargoAmt.textContent       = `${cargoAmt.toFixed(0)} / ${cap}`;
    _refs.cargoFill.style.width      = `${Math.round(pct * 100)}%`;
    _refs.cargoFill.style.background = cargoColor;

    const following = TruckSystem.isFocused(_target) || TruckSystem.isDriven(_target);
    _refs.focusBtn.textContent      = following ? '👁 Following' : '👁 Focus';
    _refs.focusBtn.style.background = following ? '#1d3a5c' : '#1a2230';
    _refs.focusBtn.style.color      = following ? '#8ccaff' : '#c3d0de';
    _refs.focusBtn.style.borderColor = following ? '#3b9eff' : '#2f3d52';

    const btn = _refs.startStop;
    btn.textContent       = auto ? '🤖 Automated' : patrolling ? (haulState || refueling ? '⏳ Busy…' : '⏹ Stop') : '▶ Start';
    btn.style.background  = auto ? '#173150' : patrolling ? (haulState || refueling ? '#4a3808' : '#3a1010') : '#173150';
    btn.style.color       = auto ? '#8ccaff' : patrolling ? (haulState || refueling ? '#f5c451' : '#ff7a7a') : '#6cb8ff';
    const hasQueue = _target._destQueue && _target._destQueue.length > 0;
    btn.style.opacity     = (auto || patrolling || TruckSystem.hasPath(_target) || hasQueue) ? '1' : '0.45';
  }

  function open(entity) {
    _target = entity;
    _editMode = false;
    _lastEditSig = null;
    // Selecting a truck (from the map or from the Trucks list) hands over to
    // this panel, so the Trucks list closes rather than stacking beside it.
    const list = document.getElementById('trucks-panel');
    if (list && list.classList.contains('visible')) {
      list.classList.remove('visible');
      document.getElementById('btn-trucks')?.classList.remove('open');
    }
    const el = _ensureEl();
    // Play the same entrance as the other HUD panels (panelIn, 0.18s) each
    // time it appears; like them, it closes instantly.
    const wasHidden = el.style.display === 'none';
    el.style.display = 'block';
    if (wasHidden) {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = 'panelIn 0.18s cubic-bezier(0.4,0,0.2,1)';
    }
    _render();
    _reposition();
  }

  function close() {
    // Commit-on-blur fires when the input is removed with the panel, but the
    // panel can also be closed by a key/Escape path that never blurs it.
    // Blurring first routes both cases through the same finish().
    if (_renaming) _el?.querySelector('input')?.blur();
    _target = null;
    _editMode = false;
    if (_el) _el.style.display = 'none';
  }

  function isOpen() { return !!_target && _el && _el.style.display !== 'none'; }

  function tick() {
    if (!isOpen()) return;
    // Its truck is gone (deleted, a save loaded, off to a contract site):
    // a panel left driving a truck that is no longer in the game is what the
    // drag bug that deleted trucks left behind.
    if (!EntityRegistry.getByType(T.TRUCK).has(_target)) { close(); return; }
    _render();
    _reposition();
  }

  return { open, close, isOpen, tick, target: () => _target };
})();

/* ═══════════════════════════════════════════════════════════════════
   SAVED PATH PANEL
   Opened by clicking any waypoint dot of an unassigned SavedPathSystem
   path on the map (a truck's own path opens TruckPatrolPanel instead,
   which already has full Start/Stop/Clear control over it). Shows the
   path's info with rename/delete — the same actions available from the
   Patrol panel's saved-paths list, just reachable directly from the map.
   ═══════════════════════════════════════════════════════════════════ */
const SavedPathPanel = (() => {
  let _target = null;   // the SavedPathSystem path object
  let _anchor = null;   // { x, y } world point it was opened at
  let _el = null;
  let _built = false;
  const _refs = {};
  let _editMode = false;
  let _lastEditSig = null;

  function _handleButton(btn) {
    if (!_target) return;
    const action = btn.dataset.action;
    if (action === 'toggleEdit') {
      _editMode = !_editMode;
      _lastEditSig = null;
      _render();
      return;
    }
    if (action === 'jumpWaypoint') {
      const wx = Number(btn.dataset.wx), wy = Number(btn.dataset.wy);
      if (isFinite(wx) && isFinite(wy)) Camera.recentreOn(wx, wy);
      return;
    }
    if (action === 'removeWaypoint') {
      const idx = Number(btn.dataset.index);
      if (!_target.waypoints || idx < 0 || idx >= _target.waypoints.length) return;
      _target.waypoints.splice(idx, 1);
      _lastEditSig = null;
      _render();
      return;
    }
    if (action === 'rename') {
      _beginRename();
    } else if (action === 'delete') {
      const name = _target.name;
      SavedPathSystem.remove(_target.id);
      showToast(`🗑 "${name}" deleted`, '#ff8060', '#180800', '#602010');
      close();
    } else if (action === 'close') {
      close();
    }
  }

  function _ensureEl() {
    if (_el) return _el;
    _el = document.createElement('div');
    _el.id = 'saved-path-panel';
    _el.style.cssText = `
      position:fixed; z-index:99999; display:none; pointer-events:auto;
      background:#0a1620; border:1.5px solid #2a5a7a; border-radius:8px;
      padding:10px 14px; min-width:170px; color:#a0d0f0; font:13px/1.4 'Courier New',monospace;
      box-shadow:0 4px 16px rgba(0,0,0,0.6);
    `;
    document.body.appendChild(_el);
    _el.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button');
      if (btn) _handleButton(btn);
    });
    return _el;
  }

  function _buildStatic() {
    if (_built) return;
    _el.innerHTML = `
      <div style="font-weight:bold;margin-bottom:6px;color:#c0e8ff;display:flex;align-items:center;gap:6px">
        <span>🛤</span><span id="sp-name" style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <span id="sp-info" style="font-size:11px;color:#5a90b0"></span>
        <button data-action="toggleEdit" id="sp-editbtn" style="
          padding:2px 7px; border-radius:3px; border:1px solid #2a5a7a;
          background:#0e2030; color:#a0d0f0; cursor:pointer; font:10px 'Courier New',monospace">✎ Edit</button>
      </div>
      <div id="sp-editlist" style="display:none;max-height:140px;overflow-y:auto;flex-direction:column;gap:3px;margin-bottom:8px"></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button data-action="rename" style="
          flex:1; padding:4px 6px; border-radius:4px; border:1px solid #2a5a7a;
          background:#0e2030; color:#a0d0f0;
          cursor:pointer; font:12px 'Courier New',monospace">✎ Rename</button>
        <button data-action="delete" style="
          flex:1; padding:4px 6px; border-radius:4px; border:1px solid #4a3010;
          background:#1a1208; color:#c08040;
          cursor:pointer; font:12px 'Courier New',monospace">🗑 Delete</button>
        <button data-action="close" style="
          width:100%;margin-top:4px; padding:3px; border-radius:4px; border:1px solid #1a3040;
          background:#081018; color:#4a7090;
          cursor:pointer; font:11px 'Courier New',monospace">Close</button>
      </div>
    `;
    _refs.name = _el.querySelector('#sp-name');
    _refs.info = _el.querySelector('#sp-info');
    _refs.editBtn  = _el.querySelector('#sp-editbtn');
    _refs.editList = _el.querySelector('#sp-editlist');
    _built = true;
  }

  // Same signature-diff rebuild pattern as TruckPatrolPanel's edit list —
  // see the comment there for why this can't just rebuild every tick.
  function _refreshEditList() {
    if (!_editMode) {
      _refs.editList.style.display = 'none';
      return;
    }
    _refs.editList.style.display = 'flex';
    const pts = _target.waypoints || [];
    const sig = _editMode + ':' + pts.map(p => `${p.wx},${p.wy}`).join('|');
    if (sig === _lastEditSig) return;
    _lastEditSig = sig;
    _refs.editList.innerHTML = pts.map((p, i) => `
      <div style="
        display:flex; align-items:center; gap:6px; background:#0e1c28;
        border:1px solid #1a3a50; border-radius:4px; padding:3px 6px;font-size:11px">
        <span style="color:#5ab0e0;font-weight:bold;min-width:16px">${i + 1}.</span>
        <span style="flex:1;color:#80b0d0">(${Math.round(p.wx / TILE)}, ${Math.round(p.wy / TILE)})</span>
        <button data-action="jumpWaypoint" data-wx="${p.wx}" data-wy="${p.wy}" title="Jump camera here" style="
          padding:1px 6px; border-radius:3px; border:1px solid #2a5a7a;
          background:#0e2030; color:#a0d0f0; cursor:pointer; font:11px 'Courier New',monospace">🎯</button>
        <button data-action="removeWaypoint" data-index="${i}" title="Remove waypoint" style="
          padding:1px 6px; border-radius:3px; border:1px solid #4a3010;
          background:#1a1208; color:#c08040; cursor:pointer; font:11px 'Courier New',monospace">✕</button>
      </div>
    `).join('') || `<div style="font-size:11px;color:#4a7090;padding:4px">No waypoints left</div>`;
  }

  // Same inline-edit approach as the Patrol panel's saved-path rows — no
  // native prompt() dialogs anywhere in this UI, stay consistent. Swaps the
  // name span back in on commit/cancel (rather than leaving _refs.name
  // pointing at a detached/nonexistent node), since this panel patches
  // fields in place instead of rebuilding its whole body like the Patrol
  // panel's row list does.
  function _beginRename() {
    if (!_target || _el.querySelector('input')) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = _target.name;
    input.style.cssText = `
      width:100%; box-sizing:border-box; background:#0e2030; color:#c0e8ff;
      border:1px solid #2a5a7a; border-radius:3px;
      font:12px 'Courier New',monospace; padding:2px 4px; margin-bottom:6px;`;
    _refs.name.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const restore = () => {
      if (!input.isConnected) return;
      const span = document.createElement('span');
      span.id = 'sp-name';
      span.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      input.replaceWith(span);
      _refs.name = span;
    };
    const commit = () => {
      if (done) return;
      done = true;
      SavedPathSystem.rename(_target.id, input.value);
      restore();
      _render();
    };
    const cancel = () => {
      if (done) return;
      done = true;
      restore();
      _render();
    };
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') commit();
      else if (ev.key === 'Escape') cancel();
    });
    input.addEventListener('blur', commit);
  }

  function _render() {
    if (!_target || !_el) return;
    _buildStatic();
    if (_refs.name) _refs.name.textContent = _target.name;
    _refs.info.textContent = `${_target.waypoints.length} waypoints`;
    _refs.editBtn.textContent = _editMode ? '✕ Close Edit' : '✎ Edit';
    _refreshEditList();
  }

  function _reposition() {
    if (!_anchor || !_el) return;
    const sx = (_anchor.x - Camera.x) * Camera.zoom + 14;
    const sy = (_anchor.y - Camera.y) * Camera.zoom;
    const pw = _el.offsetWidth  || 200;
    const ph = _el.offsetHeight || 140;
    let left = sx, top = sy;
    if (left + pw > window.innerWidth  - 10) left = sx - pw - 28;
    if (left < 10) left = 10;
    if (top  + ph > window.innerHeight - 10) top = window.innerHeight - ph - 10;
    if (top  < 10) top = 10;
    _el.style.left = `${Math.round(left)}px`;
    _el.style.top  = `${Math.round(top)}px`;
    keepPanelOnScreen(_el);
  }

  function open(path, worldPoint) {
    _target = path;
    _anchor = worldPoint || { x: path.waypoints[0].wx, y: path.waypoints[0].wy };
    _editMode = false;
    _lastEditSig = null;
    const el = _ensureEl();
    el.style.display = 'block';
    _render();
    _reposition();
  }

  function close() {
    _target = null; _anchor = null;
    _editMode = false;
    if (_el) _el.style.display = 'none';
  }

  function isOpen() { return !!_target && _el && _el.style.display !== 'none'; }

  function tick() {
    if (!isOpen()) return;
    if (!SavedPathSystem.get(_target.id)) { close(); return; }
    _render();
    _reposition();
  }

  return { open, close, isOpen, tick, get target() { return _target; } };
})();

