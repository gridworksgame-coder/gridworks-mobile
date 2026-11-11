/* ═══════════════════════════════════════════════════════════════════
   RELOCATE PICKER
   Tile-picker overlay used when relocating an existing entity.
   ═══════════════════════════════════════════════════════════════════ */

const RelocatePicker = (() => {
  let active    = false;
  let entity    = null;
  let locations = [];   // [{col,row}, ...]
  let fine      = 0;    // penalty already paid: refunded if cancelled
  let from      = null; // { col, row } where it stood: put back if cancelled
  const LABELS  = ['A','B','C','D','E','F','G'];

  // A banner while picking: what to do, and a Cancel button (Escape works
  // too). Clicks elsewhere on the map only move it, so there is time to look
  // round for the sites, or open the map (M) where they're marked as well.
  function _banner(show) {
    let b = document.getElementById('relocate-banner');
    if (!show) { if (b) b.remove(); return; }
    if (!b) {
      b = document.createElement('div');
      b.id = 'relocate-banner';
      b.style.cssText = 'position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:9500;display:flex;align-items:center;gap:12px;'
        + 'background:rgba(14,10,0,0.94);border:1px solid #f0c040;border-radius:8px;padding:8px 10px 8px 14px;'
        + 'font:600 13px/1.3 Inter,system-ui,sans-serif;color:#ffe9a8;box-shadow:0 4px 18px rgba(0,0,0,0.5);pointer-events:auto;';
      const txt = document.createElement('span');
      txt.className = 'rb-text';
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = '✕ Cancel';
      btn.style.cssText = 'font:700 12px Inter,system-ui,sans-serif;color:#fff;background:#6a3010;border:1px solid #ff8040;border-radius:6px;padding:6px 10px;cursor:pointer;';
      btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); try { SFX.click?.(); } catch (_e) {} RelocatePicker.cancel(); });
      for (const t of ['mousedown', 'pointerdown', 'touchstart']) b.addEventListener(t, (e) => e.stopPropagation());
      b.append(txt, btn);
      document.body.appendChild(b);
    }
    const n = locations.length;
    b.querySelector('.rb-text').textContent =
      `↷ Relocating: click a site (${LABELS[0]}${n > 1 ? '–' + LABELS[n - 1] : ''}) on the map to move it there · open the map (M) to see them all`;
  }

  // Expanding-ring search for the nearest valid empty footprint around a
  // point — mirrors HouseRequestSystem's version, used so a stale offered
  // spot falls back to somewhere close by rather than failing outright.
  function _findNearbyValidPlacement(originCol, originRow, fw, fh, maxRadius = 25) {
    for (let radius = 1; radius <= maxRadius; radius++) {
      const candidates = [];
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue; // ring perimeter only
          const c = originCol + dc, r = originRow + dr;
          if (c < EDGE_MARGIN || r < EDGE_MARGIN ||
              c >= COLS - EDGE_MARGIN - fw + 1 || r >= ROWS - EDGE_MARGIN - fh + 1) continue;
          if (!GridManager.canPlaceFootprint(c, r, fw, fh)) continue;
          if (ZoneSystem.isInGovZone(c, r)) continue;
          const _d = ZoneSystem.distToGovZone(c, r);
          if (_d < ZoneSystem.GOV_RING_MIN || _d > ZoneSystem.GOV_RING_MAX) continue;
          candidates.push({ col: c, row: r });
        }
      }
      if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
    }
    return null;
  }

  return {
    get active()    { return active; },
    get locations() { return locations; },
    get entity()    { return entity; },

    start(e, locs, opts = {}) {
      entity    = e;
      locations = locs.slice(0, LABELS.length);
      fine      = opts.fine || 0;
      from      = opts.from || { col: e.col, row: e.row };
      active    = true;
      _banner(true);
      const n = locations.length;
      showToast(`Choose a new site: ${LABELS[0]}${n > 1 ? '–' + LABELS[n - 1] : ''}`, '#f0c040', '#0e0a00', '#604010');
    },

    // Which site a tile picks: any tile of a site's outline, or the one just
    // above its first tile, where its pin stands. -1 for none.
    siteAt(col, row) {
      if (!active) return -1;
      const w = (entity && entity.width) || 1, h = (entity && entity.height) || 1;
      for (let i = 0; i < locations.length; i++) {
        const l = locations[i];
        if (!l) continue;
        if (col >= l.col && col < l.col + w && row >= l.row - 1 && row < l.row + h) return i;
      }
      return -1;
    },

    choose(index) {
      if (!active) return;
      let pos = locations[index];
      if (!pos) return;
      if (!GridManager.canPlaceFootprint(pos.col, pos.row, entity.width, entity.height)) {
        // Offered spot is no longer valid (something else claimed it since
        // this picker opened) — search outward from that same spot rather
        // than doing nothing, since by this point the entity has already
        // been demolished from its old position and silently failing here
        // would just lose the building.
        const nearby = _findNearbyValidPlacement(pos.col, pos.row, entity.width, entity.height);
        if (!nearby) {
          // Nowhere to put it: back where it was, penalty refunded.
          RelocatePicker.cancel('⚠ No valid spot nearby; relocation cancelled, building left where it was');
          return;
        }
        pos = nearby;
        showToast('⚠ Chosen spot was occupied; placed nearby instead', '#f0a040', '#141000', '#705000');
      }
      // Place entity at new location first, then update zone
      entity.col = pos.col;
      entity.row = pos.row;
      if (entity.width > 1 || entity.height > 1) GridManager.setEntityFootprint(entity);
      else GridManager.setEntity(pos.col, pos.row, entity);
      // Rebuild zone from scratch for this type (entity already removed from old position above)
      if (entity.fromRequest) {
        ZoneSystem.removeBuilding(entity); // recomputes all rects without this entity temporarily
        ZoneSystem.addBuilding(entity);    // adds at new position
      }
      showToast(`↷ Relocated to site ${LABELS[index]}`, '#f0c040', '#0e0a00', '#604010');
      active    = false;
      entity    = null;
      locations = [];
      fine = 0; from = null;
      _banner(false);
    },

    // Cancelled: the building goes back where it stood (or as close as it
    // can, if something has been built there since) and the penalty is
    // refunded. It is never lost.
    cancel(msg) {
      if (!active) return;
      const e = entity, w = e.width || 1, h = e.height || 1;
      let pos = from;
      if (!pos || !GridManager.canPlaceFootprint(pos.col, pos.row, w, h)) {
        pos = (pos && _findNearbyValidPlacement(pos.col, pos.row, w, h)) || pos;
      }
      if (pos) {
        e.col = pos.col; e.row = pos.row;
        if (w > 1 || h > 1) GridManager.setEntityFootprint(e);
        else GridManager.setEntity(pos.col, pos.row, e);
        if (e.fromRequest) { ZoneSystem.removeBuilding(e); ZoneSystem.addBuilding(e); }
      }
      if (fine > 0) Economy.spend(-fine);
      showToast(msg || `Relocation cancelled: building stays where it was${fine > 0 ? `, ${formatMoney(fine)} refunded` : ''}`,
        '#f0c040', '#0e0a00', '#604010');
      active    = false;
      entity    = null;
      locations = [];
      fine = 0; from = null;
      _banner(false);
    },
  };
})();

// ─── History Manager — undo/redo stack for place/remove/move actions ──
