/* ═══════════════════════════════════════════════════════════════════
   TRUCK STATUS PANEL
   ─────────────────────────────────────────────────────────────────
   Roster view of every active truck, with a per-truck button to pan
   the camera to that truck's current position.
   ═══════════════════════════════════════════════════════════════════ */
const TruckStatusPanel = (() => {
  // Row DOM is kept alive across renders and only its text is patched in
  // place (see renderPanel). Rebuilding rows via innerHTML every tick used
  // to destroy the Locate button mid-press — a native browser click is
  // cancelled outright (not just "fails to fire") if the element you
  // pressed down on is removed from the document before mouseup, so no
  // amount of event delegation on a parent can recover it. Keeping the
  // button node itself stable is the only real fix.
  const rows = new Map(); // truck entity -> { el, labelEl, statusEl, btn }

  function isOpen() {
    const panel = document.getElementById('trucks-panel');
    return !!panel && panel.classList.contains('visible');
  }

  function statusLabel(trk) {
    // Automation is the most useful thing to know about a truck at a glance,
    // so it replaces the raw motion state below — "En route" says far less
    // than "Collecting from Coal Power Generator #3 (91%)".
    if (AutoHaulSystem.isEnabled(trk)) return '🤖 ' + AutoHaulSystem.statusOf(trk);
    // A destination/queue-driven truck knows exactly what it's doing (driving
    // to a named stop, loading, unloading, refueling) — say that instead of
    // the generic motion state below, which is all that's left for a truck
    // just following freehand waypoints.
    const activity = TruckDispatchSystem.statusText(trk);
    if (activity) return activity;
    if (trk._patrolling) return 'Patrolling';
    // Moving means patrolling or being driven (truck.js steps nothing
    // else). A stopped truck keeps its last path so a patrol can resume,
    // and reading that as "En route" showed trucks taken off Auto-Dispatch
    // as busy while they stood still.
    if (TruckSystem.isDriven(trk)) return 'Driving';
    // A queue counts only while it has stops left: one run to its end (an
    // Auto-Dispatch leg leaves its single stop behind) is done with.
    const q = trk._destQueue;
    if (q && q.length && (trk._queueLoop || (trk._queueIdx || 0) < q.length)) return 'Queued';
    return 'Idle';
  }

  function locateTruck(trk) {
    const wx = trk._wx !== undefined ? trk._wx : (trk.col + (trk.width  || 1) * 0.5) * TILE;
    const wy = trk._wy !== undefined ? trk._wy : (trk.row + (trk.height || 1) * 0.5) * TILE;
    Camera.recentreOn(wx, wy);
    SFX.click();
  }

  function createRow(trk) {
    const el = document.createElement('div');
    el.style.cssText = 'display:flex;gap:10px;align-items:center;padding:8px 4px;border-bottom:1px solid rgba(255,255,255,0.05);';
    el.innerHTML = `<div style="font-size:18px;line-height:1;">🚚</div>
      <div style="flex:1;min-width:0;">
        <div class="truck-row-label" style="font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#c0e0a0;font-weight:600;"></div>
        <div class="truck-row-status" style="font-size:10px;color:var(--text-dim);margin-top:2px;"></div>
      </div>
      <button class="truck-locate-btn" style="background:rgba(128,192,64,0.12);border:1px solid rgba(128,192,64,0.4);color:#a0d070;font-size:10px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;padding:5px 9px;border-radius:4px;cursor:pointer;white-space:nowrap;">Locate</button>`;
    const labelEl  = el.querySelector('.truck-row-label');
    const statusEl = el.querySelector('.truck-row-status');
    const btn      = el.querySelector('.truck-locate-btn');
    btn.addEventListener('click', () => locateTruck(trk));
    // Clicking the truck's name/icon opens its TRUCK PANEL straight from the
    // roster without moving the camera — moving to the truck is Locate's job.
    const info = el.querySelector('.truck-row-label').parentElement;
    for (const target of [info, el.firstElementChild]) {
      target.style.cursor = 'pointer';
      target.title = 'Open truck panel';
      target.addEventListener('click', () => {
        TruckPatrolPanel.open(trk);
        SFX.click();
      });
    }
    labelEl.addEventListener('mouseenter', () => { labelEl.style.textDecoration = 'underline'; });
    labelEl.addEventListener('mouseleave', () => { labelEl.style.textDecoration = ''; });
    return { el, labelEl, statusEl, btn };
  }

  function renderPanel() {
    const body = document.getElementById('trucks-body');
    if (!body) return;
    // Alphabetical by name, numbers in order ("Hauler 2" before "Hauler 10").
    // Ties (identical names) fall back to build order so rows don't swap.
    const trucks = Array.from(EntityRegistry.getByType(T.TRUCK))
      .map(trk => ({ trk, name: TruckSystem.displayName(trk) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
                   || (a.trk._placedAt || 0) - (b.trk._placedAt || 0))
      .map(o => o.trk);
    const countEl = document.getElementById('trucks-count');
    if (countEl) countEl.textContent = trucks.length ? `(${trucks.length})` : '';

    if (!trucks.length) {
      rows.clear();
      body.innerHTML = `<div style="padding:12px 4px;font-size:11px;color:var(--text-dim);">No trucks on the map.</div>`;
      return;
    }

    // Drop rows for trucks that no longer exist.
    for (const trk of rows.keys()) {
      if (!trucks.includes(trk)) rows.delete(trk);
    }

    trucks.forEach((trk, i) => {
      let row = rows.get(trk);
      if (!row) {
        row = createRow(trk);
        rows.set(trk, row);
      }
      row.labelEl.textContent = TruckSystem.displayName(trk);
      const fuel = trk._fuel !== undefined ? Math.round(trk._fuel) : '?';
      const fuelMax = (trk.def && trk.def.fuelCapacity) || 100;
      const cargo = Math.round(trk._cargoAmount || 0);
      const cargoMax = truckCargoCap(trk, trk._cargoKind);
      row.statusEl.textContent = `${statusLabel(trk)} · Fuel ${fuel}/${fuelMax} · Cargo ${cargo}/${cargoMax}`;
      // Keep DOM order in sync with the truck list without touching nodes
      // that are already in the right place.
      const wantedIdx = i;
      const current = body.children[wantedIdx];
      if (current !== row.el) body.insertBefore(row.el, current || null);
    });

    // Trim any leftover DOM nodes past the current truck count.
    while (body.children.length > trucks.length) body.removeChild(body.lastChild);
  }

  return {
    tick() {
      const btn = document.getElementById('btn-trucks');
      if (btn) btn.classList.toggle('unlocked', Progression.isUnlocked(T.TRUCK));
      if (isOpen()) renderPanel();
    },
    renderPanel,
    isOpen,
  };
})();
