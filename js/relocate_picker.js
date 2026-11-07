/* ═══════════════════════════════════════════════════════════════════
   RELOCATE PICKER
   Tile-picker overlay used when relocating an existing entity.
   ═══════════════════════════════════════════════════════════════════ */

const RelocatePicker = (() => {
  let active    = false;
  let entity    = null;
  let locations = [];   // [{col,row}, ...]
  const LABELS  = ['A','B','C','D','E','F','G'];

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

    start(e, locs) {
      entity    = e;
      locations = locs;
      active    = true;
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
          showToast('⚠ No valid spot nearby; relocation cancelled', '#ff8040', '#180a00', '#804020');
          active = false; entity = null; locations = [];
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
      showToast(`↷ Relocated to position ${LABELS[index]}`, '#f0c040', '#0e0a00', '#604010');
      active    = false;
      entity    = null;
      locations = [];
    },

    cancel() {
      if (!active) return;
      // Refund the fine and put entity back? No — the fine is already paid and entity removed.
      // Just cancel — entity is gone (demolished effectively).
      showToast('Relocation cancelled: building removed.', '#ff8040', '#180a00', '#804020');
      active    = false;
      entity    = null;
      locations = [];
    },
  };
})();

// ─── History Manager — undo/redo stack for place/remove/move actions ──
