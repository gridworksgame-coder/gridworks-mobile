/* ═══════════════════════════════════════════════════════════════════
   BLUEPRINT SYSTEM
   Lets the player rubber-band select any number of placed entities,
   save their relative layout as a named blueprint, and stamp copies
   of that layout back into the world. Becomes ready to unlock once a
   Research Station MK3 has been placed, then requires a manual UNLOCK
   click from that station's panel (see Progression / inspection_panel.js).
   Placement still costs full price per entity — this only remembers a
   layout, it doesn't discount it.
   ═══════════════════════════════════════════════════════════════════ */

// Entity types a blueprint selection will never capture — terrain
// features, resource deposits, and request-driven customer buildings
// don't go through the generic hotbar placement path that stamping
// relies on (InputManager.tryPlaceAt), so they can't be reproduced.
const BLUEPRINT_EXCLUDE_TYPES = new Set([
  T.TREE, T.BUSH, T.WATER,
  T.COALDEPOSIT, T.OILDEPOSIT, T.URANIUMDEPOSIT, T.SULFURDEPOSIT, T.LITHIUMDEPOSIT, T.HELIUMDEPOSIT, T.RAREEARTHDEPOSIT, T.GEODEPOSIT, T.AQUIFER,
  T.HOUSE, T.CABIN, T.COMMERCIAL, T.INDUSTRIAL, T.GOVBUILDING,
  T.CELLTOWER, T.FIBERHUB, T.TOWNHALL, T.CIVICCENTER, T.COURTHOUSE,
  T.EMS, T.HOSPITAL, T.UNIVERSITY, T.TRANSPORTHUB, T.NATIONALGOV, T.FUSIONLAB, T.AIRPORT, T.MILITARYBASE, T.LAUNCHCOMPLEX, T.NATIONALGRID, T.COMPANYHQ,
  T.TRUCK, T.ROAD,
  // One of each allowed (PLACEMENT_LIMITS in input_manager.js), so a
  // blueprint copy could only ever be a second, over-the-cap facility.
  T.COALWASTE, T.OILWASTE, T.NUCLEARWASTE,
]);

const BlueprintSystem = (() => {
  let blueprints   = [];   // [{ id, name, entities:[{type,dcol,drow,width,height,rotated,shaftOri}], cost, power, w, h }]
  let nextId        = 1;
  let panelOpen      = false;
  let _wasUnlocked   = false;

  // Pending capture awaiting the name/save modal. editId is set when the
  // modal is editing a saved blueprint rather than saving a new selection;
  // its sources are then preview-only entities rebuilt from the layout
  // (never placed on the map), and tiles maps each covered tile to the one
  // shown there, so neighbour-aware sprites join up inside the preview.
  let _pendingCapture = null; // { sources, excluded, editId?, tiles? }

  // Copy/paste (Ctrl+C / Ctrl+V): a selection made in copy mode skips the
  // save modal and goes straight onto the cursor as an unsaved blueprint.
  // _clipboard keeps the last copy so Ctrl+V can re-arm it later.
  let _copyMode  = false;
  let _clipboard = null;

  // Active stamp placement
  let _stampBp   = null; // blueprint currently armed for placement (0° layout)
  let _stampView = null; // current rotated view of _stampBp — see _computeStampView

  function isUnlocked() {
    return Progression.isUnlocked(T.BLUEPRINT);
  }

  // ── Unlock visibility (called every tick — cheap Set lookup) ──
  // Actual unlocking happens via the Research Station MK3 panel
  // (Progression.manualUnlock); this just mirrors that state onto the
  // hotbar button.
  function tick() {
    const unlocked = isUnlocked();
    if (unlocked === _wasUnlocked) return;
    _wasUnlocked = unlocked;
    const btn = document.getElementById('hotbar-blueprint-btn');
    if (btn) btn.style.display = unlocked ? '' : 'none';
    if (!unlocked && panelOpen) closePanel();
    updateBadge();
  }

  function updateBadge() {
    const badge = document.getElementById('hotbar-blueprint-badge');
    if (!badge) return;
    badge.textContent = blueprints.length;
    badge.style.display = blueprints.length > 0 ? 'block' : 'none';
  }

  // ── Capture ─────────────────────────────────────────────────────
  // Gathers every eligible entity whose footprint overlaps the given
  // tile rectangle, and stages it for naming/saving.
  // Everything stacked on one tile, top first: a wire or belt laid over a
  // pipe owns the tile and carries the pipe as _underPipe; a belt over a
  // wire carries _underWire; a pipe over a belt _underConveyor; and those
  // can nest. Only the top one is in the grid, so reading the grid alone
  // silently dropped every pipe run under a wire from a blueprint.
  function _tileStack(top) {
    const out = [], seen = new Set();
    const walk = e => {
      if (!e || seen.has(e)) return;
      seen.add(e); out.push(e);
      walk(e._underPipe); walk(e._underWire); walk(e._underConveyor);
    };
    walk(top);
    return out;
  }

  function captureSelection(minC, minR, maxC, maxR) {
    const seen = new Set();
    const found = [];
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        for (const e of _tileStack(GridManager.getEntity(c, r))) {
          if (seen.has(e) || BLUEPRINT_EXCLUDE_TYPES.has(e.type)) continue;
          // Stacked items don't always carry their own tile position — the
          // renderers set it on the fly — so pin it to the tile they're on.
          if (e !== GridManager.getEntity(c, r)) { e.col = c; e.row = r; }
          seen.add(e);
          found.push(e);
        }
      }
    }
    if (found.length === 0) {
      showToast('No blueprintable entities in that area', '#ff8040', '#180c00', '#603010');
      return;
    }

    if (_copyMode) {
      _copyMode = false;
      const L = _layoutOf(found);
      _clipboard = { id: 'clipboard', name: 'Copied selection', ...L };
      _armStamp(_clipboard);
      showToast(`📋 Copied ${found.length} item${found.length === 1 ? '' : 's'}: ${formatMoney(L.cost)} to paste`,
        '#40c0ff', '#001824', '#1e4a60');
      return;
    }

    // Keep the live entities rather than a baked layout: the save modal
    // previews them and lets the player right-click any out before saving.
    _pendingCapture = { sources: found, excluded: new Set() };
    openSaveModal();
  }

  // Layout + totals for the captured entities the player kept, anchored to
  // the top-left of what's left, so leaving out an edge object shrinks the
  // saved footprint instead of leaving an empty margin in the blueprint.
  function _layoutOf(list) {
    if (!list.length) return { entities: [], cost: 0, power: 0, w: 0, h: 0 };
    const anchorC = Math.min(...list.map(e => e.col));
    const anchorR = Math.min(...list.map(e => e.row));
    let cost = 0, power = 0, maxDC = 0, maxDR = 0;
    const entities = list.map(e => {
      const def = EntityDefs[beltPieceType(e)] || {};
      const baseW = def.width || 1, baseH = def.height || 1;
      const w = e.width || 1, h = e.height || 1;
      cost  += def.cost || 0;
      power += def.powerInput || 0;
      const dcol = e.col - anchorC, drow = e.row - anchorR;
      maxDC = Math.max(maxDC, dcol + w);
      maxDR = Math.max(maxDR, drow + h);
      const rotated = (w !== baseW || h !== baseH);
      return {
        type: beltPieceType(e), dcol, drow, width: w, height: h,
        rotated,
        // Facing 0–3 (N/E/S/W). Buildings that store one keep it — the old
        // "rotated or not" flag alone turned every 180°/270° building back
        // to 0°/90° on the way into a blueprint.
        rot: typeof e._rotation === 'number' ? (e._rotation & 3) : (rotated ? 1 : 0),
        shaftOri: e.type === T.SHAFT ? (w >= h ? 'h' : 'v') : undefined,
        udgAxis:  (e.type === T.UNDERGNDPIPE || e._udgBelt) ? (e._udgAxis === 'v' ? 'v' : 'h') : undefined,
        // Which ends of an underground pipe or belt tunnel, and how far (udgPairNew).
        udgSpans: (e.type === T.UNDERGNDPIPE || e._udgBelt) && e._udgNeg !== undefined ? [e._udgNeg, e._udgPos] : undefined,
        // Drag-connected pipe sides; null = legacy pipe that joins everything.
        links:    e.type === T.PIPE ? (e._links === undefined ? null : e._links)
                : beltPieceType(e) === T.CONVEYOR ? (beltLinksOf(e) ?? null) : undefined,
        split:    beltPieceType(e) === T.CONVEYORSPLITTER ? splitterSettings(e) : undefined,
      };
    });
    return { entities, cost, power, w: maxDC, h: maxDR };
  }

  function _keptSources() {
    if (!_pendingCapture) return [];
    return _pendingCapture.sources.filter(e => !_pendingCapture.excluded.has(e));
  }

  // ── Save modal ──────────────────────────────────────────────────
  function openSaveModal() {
    const modal = document.getElementById('blueprint-save-modal');
    const nameInput = document.getElementById('blueprint-save-name');
    if (!modal || !_pendingCapture) return;
    const editing = _pendingCapture.editId != null;
    const bp = editing ? blueprints.find(b => b.id === _pendingCapture.editId) : null;
    const title = document.getElementById('blueprint-save-title');
    const confirmBtn = document.getElementById('blueprint-save-confirm');
    if (title) title.textContent = editing ? 'EDIT BLUEPRINT' : 'SAVE BLUEPRINT';
    if (confirmBtn) confirmBtn.textContent = editing ? 'Save changes' : 'Save';
    _renderSaveSummary();
    nameInput.value = bp ? bp.name : `Blueprint ${blueprints.length + 1}`;
    modal.style.display = 'flex';
    _previewHover = null;
    _initPreview();
    _renderPreview();   // after display:flex, so the canvas has a layout size
    nameInput.focus();
    nameInput.select();
  }

  function _renderSaveSummary() {
    const summary = document.getElementById('blueprint-save-summary');
    if (!summary || !_pendingCapture) return;
    const L = _layoutOf(_keptSources());
    const removed = _pendingCapture.excluded.size;
    summary.innerHTML = `
      <div class="bp-row"><span>Entities</span><span class="bp-val">${L.entities.length}${removed ? ` <span class="bp-removed">(${removed} removed)</span>` : ''}</span></div>
      <div class="bp-row"><span>Footprint</span><span class="bp-val">${L.w}×${L.h}</span></div>
      <div class="bp-row"><span>Cost to place</span><span class="bp-val">${formatMoney(L.cost)}</span></div>
      <div class="bp-row"><span>Power draw</span><span class="bp-val">${formatPower(L.power, 1)}</span></div>
    `;
    const confirmBtn = document.getElementById('blueprint-save-confirm');
    if (confirmBtn) confirmBtn.disabled = L.entities.length === 0;
  }

  // ── Save-modal preview ──────────────────────────────────────────
  // Shows the captured entities with their real map sprites. The sprite
  // renderers paint into the shared game canvas (`ctx` is a global const),
  // so the preview borrows that canvas's top-left corner for one synchronous
  // draw: snapshot the corner, render the layout there, copy it into the
  // preview canvas, and put the snapshot back — all in the same task, so the
  // browser never presents the borrowed pixels.
  let _previewView  = null;   // { k, ox, oy, minC, minR } device-px mapping, for hit tests
  let _previewHover = null;
  let _previewWired = false;
  let _previewSnap  = null;

  function _previewPick(cv, ev) {
    if (!_pendingCapture || !_previewView) return null;
    const r = cv.getBoundingClientRect();
    const dx = (ev.clientX - r.left) * (cv.width  / r.width);
    const dy = (ev.clientY - r.top)  * (cv.height / r.height);
    const V = _previewView;
    const col = V.minC + (dx - V.ox) / (V.k * TILE);
    const row = V.minR + (dy - V.oy) / (V.k * TILE);
    // Smallest footprint wins where things overlap (a pole over a wire run)
    let best = null, bestArea = Infinity;
    for (const e of _pendingCapture.sources) {
      const w = e.width || 1, h = e.height || 1;
      if (col >= e.col && col < e.col + w && row >= e.row && row < e.row + h && w * h < bestArea) {
        best = e; bestArea = w * h;
      }
    }
    return best;
  }

  function _initPreview() {
    if (_previewWired) return;
    const cv = document.getElementById('blueprint-save-preview');
    if (!cv) return;
    _previewWired = true;
    cv.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const hit = _previewPick(cv, ev);
      if (!hit) return;
      const ex = _pendingCapture.excluded;
      if (ex.has(hit)) ex.delete(hit); else ex.add(hit);
      SFX.click();
      _renderSaveSummary();
      _renderPreview();
    });
    cv.addEventListener('mousedown', ev => ev.stopPropagation());
    cv.addEventListener('mousemove', ev => {
      const hit = _previewPick(cv, ev);
      if (hit !== _previewHover) { _previewHover = hit; _renderPreview(); }
    });
    cv.addEventListener('mouseleave', () => {
      if (_previewHover) { _previewHover = null; _renderPreview(); }
    });
  }

  function _renderPreview() {
    const cv = document.getElementById('blueprint-save-preview');
    if (!cv || !_pendingCapture || !_pendingCapture.sources.length) return;
    const src = _pendingCapture.sources, ex = _pendingCapture.excluded;
    const dpr  = window.devicePixelRatio || 1;
    const main = ctx.canvas;
    const pw = Math.max(1, Math.min(Math.round((cv.clientWidth  || 440) * dpr), main.width));
    const ph = Math.max(1, Math.min(Math.round((cv.clientHeight || 260) * dpr), main.height));
    if (cv.width  !== pw) cv.width  = pw;
    if (cv.height !== ph) cv.height = ph;
    const pc = cv.getContext('2d');

    // Fit the bounds of everything captured — removed objects included, so
    // the layout doesn't jump as the player toggles things on and off.
    const minC = Math.min(...src.map(e => e.col)), minR = Math.min(...src.map(e => e.row));
    const maxC = Math.max(...src.map(e => e.col + (e.width  || 1)));
    const maxR = Math.max(...src.map(e => e.row + (e.height || 1)));
    const gw = (maxC - minC) * TILE, gh = (maxR - minR) * TILE, pad = 14 * dpr;
    const k  = Math.min((pw - pad * 2) / gw, (ph - pad * 2) / gh, 2 * dpr);
    const ox = (pw - gw * k) / 2, oy = (ph - gh * k) / 2;
    _previewView = { k, ox, oy, minC, minR };

    // Borrow the game canvas corner
    if (!_previewSnap) _previewSnap = document.createElement('canvas');
    _previewSnap.width = pw; _previewSnap.height = ph;
    const sc = _previewSnap.getContext('2d');
    sc.drawImage(main, 0, 0, pw, ph, 0, 0, pw, ph);
    const t = performance.now() / 1000;
    // Editing a saved blueprint: its entities aren't on the map, so while
    // they draw, tile lookups answer from the blueprint's own layout — a
    // wire, belt or pipe then joins its neighbours in the blueprint rather
    // than whatever happens to sit at those coordinates on the real map.
    const _realGet = GridManager.getEntity;
    if (_pendingCapture.tiles) {
      const tiles = _pendingCapture.tiles;
      GridManager.getEntity = (c, r) => {
        const e = tiles.get(c + ',' + r);
        return e && !ex.has(e) ? e : null;
      };
    }
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(0, 0, pw, ph);
      ctx.beginPath(); ctx.rect(0, 0, pw, ph); ctx.clip();
      ctx.setTransform(k, 0, 0, k, ox - minC * TILE * k, oy - minR * TILE * k);
      // Wires first, then everything else top-to-bottom — the map's order
      const kept = src.filter(e => !ex.has(e)).sort((a, b) =>
        ((a.type === T.WIRE ? 0 : 1) - (b.type === T.WIRE ? 0 : 1)) || (a.row - b.row) || (a.col - b.col));
      for (const e of kept) {
        ctx.save();
        try {
          if (e.type === T.WIRE) renderWire(e, e.col * TILE, e.row * TILE, t);
          else renderEntityAt(e, e.col * TILE, e.row * TILE, t);
        } catch (_err) {
          // One sprite failing shouldn't blank the whole preview — fall back
          // to a plain footprint block in the entity's map colour.
          ctx.fillStyle = (EntityDefs[e.type] && EntityDefs[e.type].glowColor) || '#40c0ff';
          ctx.globalAlpha = 0.5;
          ctx.fillRect(e.col * TILE, e.row * TILE, (e.width || 1) * TILE, (e.height || 1) * TILE);
        }
        ctx.restore();
      }
    } finally {
      ctx.restore();
      GridManager.getEntity = _realGet;
    }
    pc.setTransform(1, 0, 0, 1, 0, 0);
    pc.clearRect(0, 0, pw, ph);
    pc.drawImage(main, 0, 0, pw, ph, 0, 0, pw, ph);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, pw, ph);
    ctx.drawImage(_previewSnap, 0, 0);
    ctx.restore();

    // Faint tile grid over the captured area
    pc.strokeStyle = 'rgba(64,192,255,0.10)'; pc.lineWidth = 1;
    pc.beginPath();
    for (let c = 0; c <= maxC - minC; c++) { const x = ox + c * TILE * k; pc.moveTo(x, oy); pc.lineTo(x, oy + gh * k); }
    for (let r = 0; r <= maxR - minR; r++) { const y = oy + r * TILE * k; pc.moveTo(ox, y); pc.lineTo(ox + gw * k, y); }
    pc.stroke();

    const rectOf = e => [ox + (e.col - minC) * TILE * k, oy + (e.row - minR) * TILE * k,
                         (e.width || 1) * TILE * k, (e.height || 1) * TILE * k];
    // Removed objects: dashed red outline with a cross, so they can be restored
    for (const e of ex) {
      const [x, y, w, h] = rectOf(e);
      pc.fillStyle = 'rgba(255,60,60,0.10)'; pc.fillRect(x, y, w, h);
      pc.strokeStyle = 'rgba(255,90,90,0.85)'; pc.lineWidth = 1.2 * dpr;
      pc.setLineDash([4 * dpr, 3 * dpr]);
      pc.strokeRect(x + 1, y + 1, w - 2, h - 2);
      pc.setLineDash([]);
      const m = Math.min(w, h) * 0.22;
      pc.beginPath();
      pc.moveTo(x + w / 2 - m, y + h / 2 - m); pc.lineTo(x + w / 2 + m, y + h / 2 + m);
      pc.moveTo(x + w / 2 + m, y + h / 2 - m); pc.lineTo(x + w / 2 - m, y + h / 2 + m);
      pc.stroke();
    }
    // Hover: outline + what a right-click will do
    cv.style.cursor = _previewHover ? 'pointer' : 'default';
    if (_previewHover) {
      const [x, y, w, h] = rectOf(_previewHover);
      const removed = ex.has(_previewHover);
      pc.strokeStyle = removed ? 'rgba(120,255,160,0.95)' : 'rgba(255,200,64,0.95)';
      pc.lineWidth = 1.6 * dpr;
      pc.strokeRect(x + 1, y + 1, w - 2, h - 2);
      const how = typeof GamepadInput !== 'undefined' && GamepadInput.active ? 'Press B' : 'Right-click';
      const label = `${how} to ${removed ? 'restore' : 'remove'}: ${(EntityDefs[_previewHover.type] && EntityDefs[_previewHover.type].label) || _previewHover.type}`;
      pc.font = `${Math.round(10 * dpr)}px 'JetBrains Mono', monospace`;
      const tw = pc.measureText(label).width;
      pc.fillStyle = 'rgba(4,8,14,0.88)';
      pc.fillRect(6 * dpr, ph - 22 * dpr, tw + 12 * dpr, 16 * dpr);
      pc.fillStyle = removed ? '#80ffa0' : '#f0c040';
      pc.fillText(label, 12 * dpr, ph - 10 * dpr);
    }
  }

  function closeSaveModal(discard) {
    const modal = document.getElementById('blueprint-save-modal');
    if (modal) modal.style.display = 'none';
    _previewHover = null;
    if (discard) _pendingCapture = null;
  }

  function confirmSave() {
    if (!_pendingCapture) return;
    const L = _layoutOf(_keptSources());
    if (!L.entities.length) {
      showToast('Nothing left in this blueprint; right-click a removed object to restore it', '#ff8040', '#180c00', '#603010');
      return;
    }
    const nameInput = document.getElementById('blueprint-save-name');
    const editBp = _pendingCapture.editId != null ? blueprints.find(b => b.id === _pendingCapture.editId) : null;
    if (editBp) {
      // Edit: rewrite the same blueprint in place, keeping its id and slot.
      editBp.name = (nameInput.value || '').trim() || editBp.name;
      Object.assign(editBp, { entities: L.entities, cost: L.cost, power: L.power, w: L.w, h: L.h });
      _pendingCapture = null;
      closeSaveModal(false);
      SFX.click();
      showToast(`📐 Updated blueprint "${editBp.name}"`, '#40c0ff', '#001824', '#1e4a60');
      if (panelOpen) renderPanel();
      return;
    }
    const name = (nameInput.value || '').trim() || `Blueprint ${blueprints.length + 1}`;
    blueprints.push({
      id: nextId++,
      name,
      entities: L.entities,
      cost: L.cost,
      power: L.power,
      w: L.w,
      h: L.h,
    });
    _pendingCapture = null;
    closeSaveModal(false);
    SFX.click();
    showToast(`📐 Saved blueprint "${name}"`, '#40c0ff', '#001824', '#1e4a60');
    updateBadge();
    if (panelOpen) renderPanel();
  }

  // ── Edit a saved blueprint ──────────────────────────────────────
  // Rebuilds the saved layout as preview-only entities (the inverse of
  // _layoutOf — same size, facing and axis fields) and opens the save modal
  // on them, so viewing and editing use exactly the preview, right-click
  // remove/restore and totals that saving does. Nothing touches the map.
  function openEditModal(id) {
    const bp = blueprints.find(b => b.id === id);
    if (!bp) return;
    const sources = [], tiles = new Map();
    for (const it of bp.entities) {
      let e;
      try { e = new Entity(it.type, it.dcol, it.drow); } catch (_) { continue; }
      e.width = it.width || 1; e.height = it.height || 1;
      if (typeof it.rot === 'number') e._rotation = it.rot;
      if (it.udgAxis) e._udgAxis = it.udgAxis;
      if (it.type === T.UNDERGNDCONVEYOR) { e.type = T.CONVEYOR; e._udgBelt = true; }
      if (it.type === T.CONVEYORSPLITTER) initSplitter(e, it.split);
      e.powered = true;
      e._bpPreview = true;
      sources.push(e);
    }
    // Wires first so anything sharing their tile (a pole) wins the lookup.
    for (const e of [...sources].sort((a, b) => (a.type === T.WIRE ? 0 : 1) - (b.type === T.WIRE ? 0 : 1)))
      for (let r = e.row; r < e.row + e.height; r++)
        for (let c = e.col; c < e.col + e.width; c++) tiles.set(c + ',' + r, e);
    if (!sources.length) {
      showToast('This blueprint has nothing left to show', '#ff8040', '#180c00', '#603010');
      return;
    }
    _pendingCapture = { sources, excluded: new Set(), editId: bp.id, tiles };
    closePanel();
    openSaveModal();
  }

  // ── List panel ──────────────────────────────────────────────────
  function togglePanel() {
    if (!isUnlocked()) return;
    panelOpen = !panelOpen;
    const btn = document.getElementById('hotbar-blueprint-btn');
    if (panelOpen) {
      if (typeof closeCategoryPopup === 'function') closeCategoryPopup();
      if (btn) { btn.classList.add('open'); openCategoryId = '__blueprints__'; }
      renderPanel();
    } else {
      closePanel();
    }
  }

  function closePanel() {
    panelOpen = false;
    const btn = document.getElementById('hotbar-blueprint-btn');
    if (btn) btn.classList.remove('open');
    if (typeof openCategoryId !== 'undefined' && openCategoryId === '__blueprints__') openCategoryId = null;
  }

  function renderPanel() {
    const body = document.getElementById('blueprint-panel-body');
    if (!body) return;
    body.innerHTML = '';

    const selectBtn = document.createElement('div');
    selectBtn.className = 'bp-select-btn';
    selectBtn.textContent = isSelecting() ? 'Drag a rectangle over entities...' : '+ Select area to save';
    selectBtn.addEventListener('click', () => beginAreaSelect());
    body.appendChild(selectBtn);

    if (blueprints.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'bp-empty';
      empty.textContent = 'No blueprints saved yet';
      body.appendChild(empty);
      return;
    }

    for (const bp of blueprints) {
      const entry = document.createElement('div');
      entry.className = 'bp-entry';
      entry.innerHTML = `
        <input class="bp-entry-name" type="text" value="${bp.name.replace(/"/g, '&quot;')}" maxlength="40" />
        <div class="bp-entry-meta">
          <span>${bp.entities.length} items</span>
          <span>${bp.w}×${bp.h}</span>
          <span>${formatMoney(bp.cost)}</span>
          <span>${formatPower(bp.power, 1)}</span>
        </div>
        <div class="bp-entry-btns">
          <button class="bp-btn bp-place">Place</button>
          <button class="bp-btn bp-edit">Edit</button>
          <button class="bp-btn bp-delete">Delete</button>
        </div>
      `;
      const nameEl = entry.querySelector('.bp-entry-name');
      const commitRename = () => {
        const v = (nameEl.value || '').trim();
        if (v) bp.name = v;
        else nameEl.value = bp.name;
      };
      nameEl.addEventListener('keydown', ev => {
        ev.stopPropagation();
        if (ev.key === 'Enter') { commitRename(); nameEl.blur(); }
        else if (ev.key === 'Escape') { nameEl.value = bp.name; nameEl.blur(); }
      });
      nameEl.addEventListener('blur', commitRename);
      // Deleting can't be undone, so Delete first asks in place: the button
      // row swaps for a confirm prompt, and only "Yes, delete" removes it.
      const btnsEl = entry.querySelector('.bp-entry-btns');
      const btnsHtml = btnsEl.innerHTML;
      const wireButtons = () => {
        btnsEl.querySelector('.bp-place').addEventListener('click', () => {
          SFX.click();
          startStamp(bp.id);
          closePanel();
        });
        btnsEl.querySelector('.bp-edit').addEventListener('click', () => {
          SFX.click();
          openEditModal(bp.id);
        });
        btnsEl.querySelector('.bp-delete').addEventListener('click', askDelete);
      };
      function askDelete() {
        SFX.click();
        btnsEl.innerHTML = `
          <span class="bp-confirm-msg">Delete this blueprint?</span>
          <button class="bp-btn bp-confirm-yes">Yes, delete</button>
          <button class="bp-btn bp-confirm-no">Cancel</button>
        `;
        btnsEl.querySelector('.bp-confirm-yes').addEventListener('click', () => {
          blueprints = blueprints.filter(b => b.id !== bp.id);
          SFX.click();
          updateBadge();
          renderPanel();
        });
        btnsEl.querySelector('.bp-confirm-no').addEventListener('click', () => {
          SFX.click();
          btnsEl.innerHTML = btnsHtml;
          wireButtons();
        });
      }
      wireButtons();
      body.appendChild(entry);
    }
  }

  // ── Area selection mode ────────────────────────────────────────
  function beginAreaSelect(copy = false) {
    _copyMode = copy;
    closePanel();
    cancelStamp();
    // Drop any hotbar tool that was still selected — a leftover
    // selectedTool takes priority over the blueprint overlays in both
    // the render branch chain and the drag-paint placement path.
    InputManager.selectTool(null);
    InputManager.setBlueprintSelect(true, copy);
    showToast(copy ? '📋 Hold LMB and drag over entities to copy'
                   : '📐 Hold LMB and drag over entities to capture', '#40c0ff', '#001824', '#1e4a60');
  }

  // Ctrl+C: select an area, then place copies of it (each paste pays the
  // full price of every item, same as a blueprint stamp).
  function beginCopySelect() {
    beginAreaSelect(true);
  }

  // Ctrl+C with a Select-tool selection up: copy those, stacks and all
  // (the belt over a pipe over a wire on a tile), straight to the
  // clipboard, then place copies as a stamp, as after a drag-to-copy.
  function copyEntities(tops) {
    const seen = new Set(), found = [];
    for (const top of tops) {
      for (const e of _tileStack(top)) {
        if (seen.has(e) || BLUEPRINT_EXCLUDE_TYPES.has(e.type)) continue;
        if (e !== top) { e.col = top.col; e.row = top.row; }   // as captureSelection pins stacked layers
        seen.add(e);
        found.push(e);
      }
    }
    if (!found.length) {
      showToast('Nothing in the selection can be copied', '#ff8040', '#180c00', '#603010');
      return false;
    }
    closePanel();
    const L = _layoutOf(found);
    _clipboard = { id: 'clipboard', name: 'Copied selection', ...L };
    _armStamp(_clipboard);
    showToast(`📋 Copied ${found.length} item${found.length === 1 ? '' : 's'}: ${formatMoney(L.cost)} to paste`,
      '#40c0ff', '#001824', '#1e4a60');
    return true;
  }

  // Ctrl+V: re-arm the last copied selection.
  function pasteClipboard() {
    if (!_clipboard) {
      showToast('Nothing copied yet: press Ctrl+C and drag over entities', '#ff8040', '#180c00', '#603010');
      return;
    }
    closePanel();
    _armStamp(_clipboard);
  }

  function isSelecting() {
    return InputManager.blueprintSelectActive;
  }

  // ── Stamp (placement) mode ─────────────────────────────────────
  // _stampView holds the *currently rotated* layout — recomputed from the
  // blueprint's saved (0°) layout whenever the player presses R. Rotating
  // a w×h bounding box 90° clockwise maps a piece at (dcol,drow,w,h) to
  // (H-drow-h, dcol, h, w) in a new H×W box; applying that once per step
  // keeps 1/2/3-step rotations correct without separate closed forms.
  let _stampRotSteps = 0;

  // Buildings whose footprint never swaps with rotation (their rotation only
  // moves their ports) — see the matching exception in InputManager.tryPlace.
  // That is every building that doesn't turn (footprintTurns); a Shaft is
  // the one piece that swaps by its own orientation instead.
  const _fixedFootprint = (e) => e.type !== T.SHAFT && (e.width || 1) !== (e.height || 1) && !footprintTurns(e.type);

  function _rotateLayoutOnce(view) {
    const { entities, w, h } = view;
    return {
      w: h, h: w,
      entities: entities.map(e => {
        const fixed = _fixedFootprint(e);
        // Position: rotate the piece's rectangle 90° clockwise inside the box.
        // A fixed-footprint building keeps its w×h, anchored so its centre
        // lands where the rotated rectangle's centre would.
        const rw = e.height, rh = e.width;                       // rotated rectangle
        let dcol = h - e.drow - e.height, drow = e.dcol;
        let width = rw, height = rh;
        if (fixed) {
          width = e.width; height = e.height;
          dcol += Math.round((rw - width) / 2);
          drow += Math.round((rh - height) / 2);
        }
        return {
          type: e.type, dcol, drow, width, height,
          rotated: fixed ? e.rotated : !e.rotated,
          // The object's own facing turns with the blueprint, so ports,
          // outlets and lanes keep pointing the same way relative to the
          // rest of the layout.
          rot: ((e.rot ?? (e.rotated ? 1 : 0)) + 1) & 3,
          shaftOri: e.shaftOri ? (e.shaftOri === 'h' ? 'v' : 'h') : undefined,
          udgAxis:  e.udgAxis  ? (e.udgAxis  === 'h' ? 'v' : 'h') : undefined,
          // Clockwise, left stays the "negative" end (it becomes up), but up
          // becomes right, so a vertical pair's two spans swap.
          udgSpans: e.udgSpans ? (e.udgAxis === 'v' ? [e.udgSpans[1], e.udgSpans[0]] : e.udgSpans) : undefined,
          links:    rotatePipeLinksCW(e.links),
          split:    e.split ? { ...e.split, side: ((e.split.side || 0) + 1) & 3 } : undefined,
        };
      }),
    };
  }

  // The stamp is held by its centre: the tile under the cursor is the
  // middle of the layout (the centre-left / centre-top tile when a side is
  // even), not its top-left corner. Ghost, cost tag and placement all go
  // through here so what you see is where it lands; R turns it about the
  // same point.
  function _anchorFromCursor(col, row) {
    const w = (_stampView && _stampView.w) || 1, h = (_stampView && _stampView.h) || 1;
    const anchorC = col - Math.floor((w - 1) / 2), anchorR = row - Math.floor((h - 1) / 2);
    // A geothermal well over its deposit takes the whole stamp onto the
    // deposit with it, as placing one by hand snaps it there. Left at the
    // cursor, the well still built on the deposit, but away from the rest of
    // the layout, and a turbine beside it missed its steam port.
    for (const be of (_stampView ? _stampView.entities : [])) {
      if (be.type !== T.GEOWELL) continue;
      const dep = InputManager.stampWellDeposit(anchorC + be.dcol, anchorR + be.drow, be.width, be.height);
      if (dep) return [dep.col - be.dcol, dep.row - be.drow];
    }
    return [anchorC, anchorR];
  }

  function _computeStampView() {
    if (!_stampBp) { _stampView = null; return; }
    let view = { entities: _stampBp.entities, w: _stampBp.w, h: _stampBp.h };
    for (let i = 0; i < _stampRotSteps; i++) view = _rotateLayoutOnce(view);
    if (_stampRotSteps) _reseatGeoTurbines(_stampBp.entities, view.entities);
    _stampView = view;
  }

  // A well (3×2) and its turbine (5×4) keep their footprints when the stamp
  // turns, so at 90° and 270° the two come out overlapping or a tile apart,
  // and the turbine is refused or misses the steam port. So each turbine
  // that sat on a well's port in the saved layout (0°, indexes matching the
  // turned one) is set back on that well's port here, flush against the well.
  function _reseatGeoTurbines(saved, turned) {
    const portOf = (w) => GeothermalSystem.wellOutputPort({ col: w.dcol, row: w.drow, width: w.width, height: w.height, _rotation: w.rot ?? 0 });
    const covers = (tb, p) => p.c >= tb.dcol && p.c < tb.dcol + tb.width && p.r >= tb.drow && p.r < tb.drow + tb.height;
    saved.forEach((tb, i) => {
      if (tb.type !== T.GEOTURBINE) return;
      const j = saved.findIndex(w => w.type === T.GEOWELL && covers(tb, portOf(w)));
      if (j < 0) return;
      const well = turned[j], t = turned[i], port = portOf(well);
      const rot = (well.rot ?? 0) & 3;
      if (rot % 2 === 0) {   // steam goes north or south
        t.drow = rot === 0 ? port.r - t.height + 1 : port.r;
        t.dcol = Math.max(port.c - t.width + 1, Math.min(port.c, t.dcol));
      } else {               // east or west
        t.dcol = rot === 1 ? port.c : port.c - t.width + 1;
        t.drow = Math.max(port.r - t.height + 1, Math.min(port.r, t.drow));
      }
    });
  }

  function startStamp(id) {
    const bp = blueprints.find(b => b.id === id);
    if (bp) _armStamp(bp);
  }

  function _armStamp(bp) {
    InputManager.setBlueprintSelect(false);
    InputManager.selectTool(null);
    // Blueprints are shared across worlds, and each world has its own build
    // prices (difficulty) — reprice from today's defs, not the saved total.
    if (Array.isArray(bp.entities)) {
      bp.cost = bp.entities.reduce((s, e) => s + ((EntityDefs[e.type] || {}).cost || 0), 0);
    }
    _stampBp = bp;
    _stampRotSteps = 0;
    _computeStampView();
    InputManager.setBlueprintStamp(true);
    const hud = document.getElementById('blueprint-stamp-hud');
    if (hud) hud.style.display = 'block';
    updateStampHud();
  }

  function cancelStamp() {
    _stampBp = null;
    _stampView = null;
    _stampRotSteps = 0;
    InputManager.setBlueprintStamp(false);
    const hud = document.getElementById('blueprint-stamp-hud');
    if (hud) hud.style.display = 'none';
  }

  function rotateStamp() {
    if (!_stampBp) return;
    _stampRotSteps = (_stampRotSteps + 1) % 4;
    _computeStampView();
    SFX.click();
    updateStampHud();
  }

  function isStamping() {
    return !!_stampBp;
  }

  function activeStampBlueprint() {
    return _stampBp;
  }

  function updateStampHud() {
    const hud = document.getElementById('blueprint-stamp-hud');
    if (!hud || !_stampBp) return;
    const canAfford = Economy.canAfford(_stampBp.cost);
    hud.innerHTML = `
      <span class="bp-hud-title">📐 ${_stampBp.name}</span>
      &nbsp;—&nbsp; <span class="bp-hud-cost ${canAfford ? 'good' : 'bad'}">${formatMoney(_stampBp.cost)}</span>
      &nbsp;·&nbsp; ${formatPower(_stampBp.power, 1)} draw
      &nbsp;·&nbsp; <span style="color:#6090a8">click to place · R to rotate · RMB/Esc to cancel</span>
    `;
  }

  // Called by InputManager on LMB click while stamp mode is active.
  // Reuses InputManager.tryPlaceAt (the normal hotbar placement path)
  // for every entity in the blueprint so costs, collision checks, and
  // type-specific placement rules all stay identical to placing by hand.
  function stampAt(cursorCol, cursorRow) {
    if (!_stampBp || !_stampView) return;
    const [anchorCol, anchorRow] = _anchorFromCursor(cursorCol, cursorRow);
    if (!Economy.canAfford(_stampBp.cost)) {
      showToast('Not enough funds for this blueprint', '#ff4040', '#140000', '#600000');
      return;
    }

    const savedTool = InputManager.state.selectedTool;
    const savedRot  = InputManager.state.placementRotation;
    const savedOri  = InputManager.state.shaftOrientation;
    const savedAxis = InputManager.state.undergndPipeAxis;

    // Build order: buildings, then pipes, then wires, then belts — so pieces
    // that share a tile stack the same way they were captured (a wire laid
    // onto its pipe, a belt onto its wire) instead of the second one being
    // refused as "occupied". A geothermal turbine goes after the other
    // buildings: it can only be built over a well that's already there.
    const LAYER = { [T.GEOTURBINE]: 0.5, [T.PIPE]: 1, [T.UNDERGNDPIPE]: 1, [T.WIRE]: 2, [T.POLE]: 2, [T.CONVEYOR]: 3, [T.UNDERGNDCONVEYOR]: 3, [T.CONVEYORSPLITTER]: 3 };
    const savedSplit = InputManager.state.splitter;
    const order = _stampView.entities.slice().sort((a, b) => (LAYER[a.type] || 0) - (LAYER[b.type] || 0));

    let placed = 0, skipped = 0;
    const whys = new Set();   // why pieces were skipped, for the summary toast
    // Group every entity placement below into a single undo/redo step, so
    // Ctrl+Z after a stamp removes the whole blueprint at once instead of
    // walking it back one piece at a time.
    HistoryManager.beginBatch();
    InputManager.state.bpStamping = true;   // pieces keep the facing they were captured with
    for (const be of order) {
      const col = anchorCol + be.dcol, row = anchorRow + be.drow;
      const chk = InputManager.stampPieceCheck(be.type, col, row, be.width || 1, be.height || 1);
      if (chk && !chk.ok) { skipped++; whys.add(chk.why); continue; }
      const before = _tileStack(GridManager.getEntity(col, row));
      InputManager.state.selectedTool = be.type;
      InputManager.state.placementRotation = be.rot ?? (be.rotated ? 1 : 0);
      if (be.shaftOri) InputManager.state.shaftOrientation = be.shaftOri;
      if (be.udgAxis)  InputManager.state.undergndPipeAxis = be.udgAxis;
      if (be.udgAxis)  InputManager.state.undergndBeltAxis = be.udgAxis;
      if (be.split)    InputManager.state.splitter = be.split;
      // A stamped pipe takes the sides it was captured with (older blueprints
      // carry none: legacy pipe, joins everything) instead of drag linking.
      InputManager.state.bpPipeLinks = be.type === T.PIPE ? (be.links ?? null) : undefined;
      InputManager.state.bpBeltLinks = be.type === T.CONVEYOR ? (be.links ?? null) : undefined;
      InputManager.state.bpUdgSpans = be.udgSpans;
      InputManager.tryPlaceAt(col, row);
      InputManager.state.bpUdgSpans = undefined;
      InputManager.state.bpPipeLinks = undefined;
      InputManager.state.bpBeltLinks = undefined;
      // Placed if a new piece of this type is now anywhere in the tile's
      // stack — a pipe that ends up under an existing wire counts too.
      const after = _tileStack(GridManager.getEntity(col, row));
      if (after.some(e => beltPieceType(e) === be.type && !before.includes(e))) placed++;
      else skipped++;
    }
    InputManager.state.bpStamping = false;
    HistoryManager.endBatch();

    InputManager.state.selectedTool = savedTool;
    InputManager.state.placementRotation = savedRot;
    InputManager.state.shaftOrientation = savedOri;
    InputManager.state.undergndPipeAxis = savedAxis;
    InputManager.state.splitter = savedSplit;
    PowerNetwork.recomputeWireHops();

    if (placed > 0) {
      SFX.click();
      const why = whys.size ? ` (${[...whys].join(' ')})` : '';
      showToast(`📐 Blueprint placed: ${placed} item${placed === 1 ? '' : 's'}${skipped ? `, ${skipped} skipped${why}` : ''}`,
        '#40c0ff', '#001824', '#1e4a60');
    } else {
      showToast(`Blueprint could not be placed here${whys.size ? `: ${[...whys].join(' ')}` : ''}`, '#ff8040', '#180c00', '#603010');
    }
  }

  // Preview entities for the stamp ghost, built once per stamp view (the
  // same stubs openEditModal makes) and moved to the cursor each frame.
  let _ghostView = null, _ghostEnts = null;
  function _ghostEntities() {
    if (_ghostView === _stampView && _ghostEnts) return _ghostEnts;
    _ghostView = _stampView;
    _ghostEnts = [];
    for (const be of _stampView.entities) {
      let e;
      try { e = new Entity(be.type, be.dcol, be.drow); } catch (_) { continue; }
      e.width = be.width || 1; e.height = be.height || 1;
      if (typeof be.rot === 'number') e._rotation = be.rot;
      if (be.udgAxis) e._udgAxis = be.udgAxis;
      if (be.shaftOri) e._orientation = be.shaftOri;
      if (be.type === T.UNDERGNDCONVEYOR) { e.type = T.CONVEYOR; e._udgBelt = true; }
      if (be.type === T.CONVEYORSPLITTER) initSplitter(e, be.split);
      if (e.def === EntityDefs[e.type]) e.def = { ...EntityDefs[e.type] };
      // Lit like a working building — except pipes, where "powered" is the
      // water network's flag and would paint every copied pipe as water.
      e.powered = !(e.type === T.PIPE || e.type === T.UNDERGNDPIPE);
      e._bpPreview = true;
      e._be = be;
      _ghostEnts.push(e);
    }
    return _ghostEnts;
  }

  // Draw the stamp ghost: each copied object's real sprite, faded, at the
  // cursor — not a flat block in its map colour (most of those colours are
  // near-black, so the ghost read as black boxes). While it draws, tile
  // lookups answer from the ghost's own layout, so copied wires, belts and
  // pipes join each other the way they will once stamped. Pieces whose tiles
  // aren't free get a red wash. Returns false when not stamping.
  function renderStampGhost(cursorCol, cursorRow, t) {
    if (!_stampBp || !_stampView) return false;
    const [hoverCol, hoverRow] = _anchorFromCursor(cursorCol, cursorRow);
    const ents  = _ghostEntities();
    const tiles = new Map();
    for (const e of ents) {
      e.col = hoverCol + e._be.dcol; e.row = hoverRow + e._be.drow;
    }
    for (const e of [...ents].sort((a, b) => (a.type === T.WIRE ? 0 : 1) - (b.type === T.WIRE ? 0 : 1)))
      for (let r = e.row; r < e.row + e.height; r++)
        for (let c = e.col; c < e.col + e.width; c++) tiles.set(c + ',' + r, e);
    const free = (e) => GridManager.canPlaceFootprint(e.col, e.row, e.width, e.height)
      || (e.width === 1 && e.height === 1 && !GridManager.getEntity(e.col, e.row));
    // Build caps and deposit pieces (a pump jack on its oil) go by the real
    // placement rules; everything else by whether its tiles are free.
    const seen = {};
    const fits = (e) => {
      const chk = InputManager.stampPieceCheck(e._be.type, e.col, e.row, e.width, e.height, seen[e._be.type] || 0);
      seen[e._be.type] = (seen[e._be.type] || 0) + 1;
      return chk ? chk.ok : free(e);
    };
    const blocked = new Set(ents.filter(e => !fits(e)));   // checked against the REAL map

    const _realGet = GridManager.getEntity;
    GridManager.getEntity = function (c, r) { return tiles.get(c + ',' + r) || null; };
    try {
      const order = [...ents].sort((a, b) =>
        ((a.type === T.WIRE ? 0 : 1) - (b.type === T.WIRE ? 0 : 1)) || (a.row - b.row) || (a.col - b.col));
      for (const e of order) {
        const x = e.col * TILE, y = e.row * TILE;
        ctx.save();
        ctx.globalAlpha = blocked.has(e) ? 0.35 : 0.6;
        try {
          if (e.type === T.WIRE) renderWire(e, x, y, t);
          else renderEntityAt(e, x, y, t);
        } catch (_err) {
          ctx.fillStyle = (EntityDefs[e.type] && EntityDefs[e.type].glowColor) || '#40c0ff';
          ctx.fillRect(x, y, e.width * TILE, e.height * TILE);
        }
        ctx.restore();
      }
    } finally {
      GridManager.getEntity = _realGet;
    }
    // Outlines on top: blue where it fits, red wash + outline where it doesn't.
    for (const e of ents) {
      const x = e.col * TILE, y = e.row * TILE, w = e.width * TILE, h = e.height * TILE;
      ctx.save();
      if (blocked.has(e)) {
        ctx.globalAlpha = 0.28; ctx.fillStyle = '#ff2200'; ctx.fillRect(x, y, w, h);
      }
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = blocked.has(e) ? 'rgba(255,60,60,0.9)' : 'rgba(64,192,255,0.55)';
      ctx.lineWidth   = 1.5 / Camera.zoom;
      ctx.strokeRect(x, y, w, h);
      ctx.restore();
    }
    _drawGhostCostTag(hoverCol, hoverRow, ents.length, blocked.size);
    return true;
  }

  // Price tag pinned under the ghost: what this paste will cost, green when
  // affordable and red when not, with the item count and how many pieces
  // would be skipped as blocked. Sized in screen pixels (÷ zoom) so it reads
  // the same at every zoom level.
  function _drawGhostCostTag(hoverCol, hoverRow, count, blockedCount) {
    const z = Camera.zoom || 1, px = 1 / z;
    const afford = Economy.canAfford(_stampBp.cost);
    const main = formatMoney(_stampBp.cost);
    const sub  = `${count} item${count === 1 ? '' : 's'}` + (blockedCount ? ` · ${blockedCount} blocked` : '');
    const x = hoverCol * TILE, y = (hoverRow + _stampView.h) * TILE + 6 * px;
    ctx.save();
    ctx.font = `bold ${13 * px}px Arial, sans-serif`;
    const mw = ctx.measureText(main).width;
    ctx.font = `${10.5 * px}px Arial, sans-serif`;
    const sw = ctx.measureText(sub).width;
    const padX = 7 * px, gap = 7 * px, h = 20 * px, w = padX * 2 + mw + gap + sw;
    ctx.fillStyle = 'rgba(0,16,26,0.88)';
    ctx.strokeStyle = afford ? 'rgba(64,192,255,0.9)' : 'rgba(255,70,70,0.95)';
    ctx.lineWidth = 1.2 * px;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 4 * px); ctx.fill(); ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.font = `bold ${13 * px}px Arial, sans-serif`;
    ctx.fillStyle = afford ? '#60e890' : '#ff6060';
    ctx.fillText(main, x + padX, y + h / 2 + 0.5 * px);
    ctx.font = `${10.5 * px}px Arial, sans-serif`;
    ctx.fillStyle = blockedCount ? '#ffb070' : '#8ab8d0';
    ctx.fillText(sub, x + padX + mw + gap, y + h / 2 + 0.5 * px);
    ctx.restore();
  }

  // Ghost preview for the render loop — array of {type,x,y,w,h} in
  // world coordinates, or null when not stamping.
  function getStampGhost(cursorCol, cursorRow) {
    if (!_stampBp || !_stampView) return null;
    const [hoverCol, hoverRow] = _anchorFromCursor(cursorCol, cursorRow);
    return _stampView.entities.map(be => {
      const col = hoverCol + be.dcol, row = hoverRow + be.drow;
      const { x, y } = GridManager.tileToWorld(col, row);
      const def = EntityDefs[be.type] || {};
      const free = GridManager.canPlaceFootprint(col, row, be.width, be.height)
        || (be.width === 1 && be.height === 1 && !GridManager.getEntity(col, row));
      return { type: be.type, x, y, w: be.width, h: be.height, color: def.color || '#4090ff', free };
    });
  }

  // ── Save / load ─────────────────────────────────────────────────
  function reset() {
    blueprints = [];
    nextId = 1;
    _pendingCapture = null;
    _clipboard = null;
    _copyMode = false;
    cancelStamp();
    _wasUnlocked = false;
    const btn = document.getElementById('hotbar-blueprint-btn');
    if (btn) btn.style.display = 'none';
    updateBadge();
  }

  function save() {
    return { nextId, blueprints };
  }

  function load(data) {
    if (!data) return;
    // If the saved field is present but malformed (corrupted localStorage,
    // a future save format, etc.), keep whatever is already in memory
    // rather than defaulting to [] — a malformed field should never be
    // able to wipe out a real list.
    if (Array.isArray(data.blueprints)) blueprints = data.blueprints;
    // A tank captured at 7×7 builds at 6×6 now: step it in the way
    // trimLegacyTanks does, so its stubs still meet the pipes captured with it.
    for (const b of blueprints) {
      for (const be of (b && b.entities) || []) {
        if (be.type !== T.OILSTORAGE || be.width !== 7 || be.height !== 7) continue;
        be.drow += 1;
        if ((be.rot ?? 0) % 2 === 1) be.dcol += 1;
        be.width = 6; be.height = 6;
      }
    }
    nextId = data.nextId || (blueprints.reduce((m, b) => Math.max(m, b.id), 0) + 1);
    _wasUnlocked = isUnlocked();
    const btn = document.getElementById('hotbar-blueprint-btn');
    if (btn) btn.style.display = _wasUnlocked ? '' : 'none';
    updateBadge();
  }

  return {
    isUnlocked, tick, togglePanel, closePanel, isSelecting, beginAreaSelect,
    beginCopySelect, copyEntities, pasteClipboard,
    captureSelection, confirmSave, closeSaveModal,
    startStamp, cancelStamp, rotateStamp, isStamping, stampAt, getStampGhost, renderStampGhost, activeStampBlueprint,
    refreshStampHud: updateStampHud,
    save, load, reset,
  };
})();
