/* ═══════════════════════════════════════════════════════════════════
   HISTORY MANAGER
   Undo/redo action history stack.
   ═══════════════════════════════════════════════════════════════════ */

const HistoryManager = (() => {
  const undoStack = [];
  const redoStack = [];
  const MAX = 60;

  // Adjust balance without DevMode guard — undo/redo always works
  function adjustBalance(amount) {
    Economy.setBalance(Economy.balance - amount);
  }

  // Redo of a turbine placement: take the water it sits on back off the
  // map. Only actual water is removed — never whatever else now occupies a
  // captured tile (setEntityFootprint claims those afterwards, as for any
  // redo). The removed entity stays cached on the capture so the next
  // removal hands the same one back instead of stacking a new one.
  function _clearTurbineWaters(waterArr) {
    if (!waterArr) return;
    for (const t of waterArr) {
      const w = GridManager.getEntity(t.c, t.r);
      if (!w || w.type !== T.WATER) continue;
      GridManager.tiles[t.r][t.c] = null;
      EntityRegistry.remove(w);
      if (typeof WaterSystem !== 'undefined' && WaterSystem._unregister) WaterSystem._unregister(t.c, t.r);
      t.entity = w;
    }
  }
  // Redo of a shaft placement: shafts never destroy water — the live water
  // entity stays registered under the shaft (see ShaftSystem). Just point
  // the capture at whatever water is there now; setEntityFootprint then
  // claims the grid slot.
  function _relinkShaftWaters(waterArr) {
    if (!waterArr) return;
    for (const t of waterArr) {
      const w = GridManager.getEntity(t.c, t.r);
      if (w && w.type === T.WATER) t.entity = w;
    }
  }

  // ── Resource deposits under buildings ───────────────────────────
  // A resource deposit must never disappear because of something the player
  // did. Mines, pump jacks and geothermal wells are stamped over their
  // deposit's grid tiles; the Delete tool puts the deposit back, and undo/redo
  // has to do exactly the same — previously undoing a mine placement cleared
  // the tiles and left the deposit gone from the map.
  let _depositOfType = null;
  function _depositTypeFor(type) {
    if (!_depositOfType) {
      _depositOfType = {
        [T.COALMINE]:    T.COALDEPOSIT,
        [T.COALMINE2]:   T.COALDEPOSIT,
        [T.URANIUMMINE]: T.URANIUMDEPOSIT,
        [T.SULFURMINE]:  T.SULFURDEPOSIT,
        [T.SULFURMINE2]: T.SULFURDEPOSIT,
        [T.LITHIUMMINE]: T.LITHIUMDEPOSIT,
        [T.RAREEARTHMINE]: T.RAREEARTHDEPOSIT,
        [T.HELIUMWELL]:  T.HELIUMDEPOSIT,
        [T.HELIUMWELL2]: T.HELIUMDEPOSIT,
        [T.PUMPJACK]:    T.OILDEPOSIT,
        [T.PUMPJACK2]:   T.OILDEPOSIT,
        [T.GEOWELL]:     T.GEODEPOSIT,
      };
    }
    return _depositOfType[type];
  }
  function _depositFor(e) {
    if (e._linkedDeposit) return e._linkedDeposit;
    const depType = _depositTypeFor(e.type);
    if (depType === undefined || e._depositCol === undefined) return null;
    for (const d of EntityRegistry.getByType(depType)) {
      if (d.col === e._depositCol && d.row === e._depositRow) return d;
    }
    return null;
  }
  const _depositFlag = e => e.type === T.GEOWELL ? '_hasWell' : '_hasMine';

  function _restoreDepositUnder(e) {
    const dep = _depositFor(e);
    if (!dep) return;
    dep[_depositFlag(e)] = false;
    // A worked-out deposit goes with the building, as with the Delete tool.
    if (isDepositExhausted(dep)) { EntityRegistry.remove(dep); return; }
    dep.width  = dep.width  || 2;
    dep.height = dep.height || 2;
    // Fill only tiles that are empty now, so nothing placed since is stomped.
    for (let r = dep.row; r < dep.row + dep.height; r++)
      for (let c = dep.col; c < dep.col + dep.width; c++)
        if (GridManager.inBounds(c, r) && !GridManager.tiles[r][c]) GridManager.tiles[r][c] = dep;
    EntityRegistry.add(dep);
  }

  function _coverDepositUnder(e) {
    const dep = _depositFor(e);
    if (!dep) return;
    e._linkedDeposit = dep;
    dep[_depositFlag(e)] = true;
  }

  function applyRemove(action) {
    const e = action.entity;
    // Stacked tile (a belt laid over a wire, a pipe over a belt, …): hand the
    // tile back to whatever was underneath, exactly as the Delete tool does,
    // instead of clearing it and losing the lower layer. This is what makes
    // undoing "conveyor onto wire" leave the wire, matching "wire onto
    // conveyor" (see _unstackWire), which leaves the belt.
    const under = GridManager.lowerLayer(e);   // every lower layer, not just the first found
    if (under && (e.type === T.CONVEYOR || e.type === T.PIPE || e.type === T.UNDERGNDPIPE || e.type === T.WIRE)
        && GridManager.getEntity(e.col, e.row) === e) {
      under.col = e.col; under.row = e.row;
      GridManager.setEntity(e.col, e.row, under);   // unregisters e, registers the lower layer
      adjustBalance(-action.cost);
      return;
    }
    // Water Extractor: restore the lake water tiles it was sitting on —
    // matches the direct-bulldoze path in input_manager.js. Without this,
    // undoing a placement (or redoing a removal) left the footprint tiles
    // null instead of water, since removeEntityFootprint() below just
    // clears the tiles rather than restoring what was underneath.
    if (e.type === T.WATEREXTRACTOR) {
      const mw = e.width || 4, mh = e.height || 4;
      for (let r = e.row; r < e.row + mh; r++)
        for (let c = e.col; c < e.col + mw; c++)
          if (GridManager.inBounds(c, r) && GridManager.tiles[r][c] === e)
            GridManager.tiles[r][c] = null;
      if (e._savedWaterTiles) {
        for (const { c, r, tile } of e._savedWaterTiles)
          if (GridManager.inBounds(c, r) && !GridManager.tiles[r][c])
            GridManager.tiles[r][c] = tile;
      }
      EntityRegistry.remove(e);
      adjustBalance(-action.cost);
      return;
    }
    // Shaft: claim grid slots only — water entities stay alive under the
    // capture list. removeEntityFootprint puts them back on the grid.
    if (e.type === T.SHAFT) {
      if (e.width > 1 || e.height > 1) GridManager.removeEntityFootprint(e);
      else                              GridManager.removeEntity(e.col, e.row);
      adjustBalance(-action.cost);
      return;
    }
    // Turbine: removeEntityFootprint puts the captured water back, then
    // onEntityRemoved re-tags it into its reservoir — the same pair the
    // Delete tool runs. (Restoring it a second time here used to stack
    // duplicate water entities on each tile.)
    if (e.type === T.HYDROTURBINE) {
      if (e.width > 1 || e.height > 1) GridManager.removeEntityFootprint(e);
      else                              GridManager.removeEntity(e.col, e.row);
      if (typeof ReservoirSystem !== 'undefined') {
        ReservoirSystem.onEntityRemoved?.(e);
      }
      adjustBalance(-action.cost);
      return;
    }
    if (e.type === T.DAM) {
      // Snapshot before dissolve so undoing this remove (or redoing a place)
      // can restore the exact side + reservoir membership.
      if (!action.damUndo && typeof ReservoirSystem !== 'undefined') {
        action.damUndo = ReservoirSystem.captureDamUndoState?.(e);
      }
      // Dam: clear irregular span first, then onEntityRemoved restores river
      if (e._spanTiles) {
        for (const t of e._spanTiles) {
          if (GridManager.inBounds(t.c, t.r) && GridManager.tiles[t.r][t.c] === e) {
            GridManager.tiles[t.r][t.c] = null;
          }
        }
        EntityRegistry.remove(e);
      } else {
        if (e.width > 1 || e.height > 1) GridManager.removeEntityFootprint(e);
        else                              GridManager.removeEntity(e.col, e.row);
      }
      if (typeof ReservoirSystem !== 'undefined') ReservoirSystem.onEntityRemoved?.(e);
      adjustBalance(-action.cost);
      return;
    }
    // Buildings sitting on a resource deposit: clear the building, then put
    // the deposit back (matches the Delete tool in input_manager.js).
    if (_depositTypeFor(e.type) !== undefined) {
      if (e.type === T.GEOWELL && e._linkedTurbine) {
        e._linkedTurbine._linkedWell = null;
        e._linkedTurbine._generating = false;
        e._linkedTurbine._currentOutput = 0;
        e._linkedTurbine = null;
      }
      if (e.width > 1 || e.height > 1) GridManager.removeEntityFootprint(e);
      else                              GridManager.removeEntity(e.col, e.row);
      _restoreDepositUnder(e);
      adjustBalance(-action.cost);
      return;
    }
    if (e.width > 1 || e.height > 1) GridManager.removeEntityFootprint(e);
    else                              GridManager.removeEntity(e.col, e.row);
    adjustBalance(-action.cost);  // refund
  }

  function _reapplyPlace(action) {
    // Redo: re-place an entity that was removed via undo.
    // For water-overwriting entities, also re-clear the water tiles they captured.
    const e = action.entity;
    // Dam: restore onto its irregular span and rejoin the same reservoir /
    // side from the undo snapshot — never re-run fresh placementRotation.
    if (e.type === T.DAM && typeof ReservoirSystem !== 'undefined') {
      ReservoirSystem.restoreDam(e, action.damUndo);
      adjustBalance(action.cost);
      return;
    }
    if (e.type === T.HYDROTURBINE) _clearTurbineWaters(e._waterTiles);
    if (e.type === T.SHAFT)        _relinkShaftWaters(e._waterTiles);
    // Built over water (water_build.js): a filled building takes its water
    // off the map again; a bridge (or a tower on footings) goes back over
    // the water it spans.
    if (e._filled) WaterBuild.reclaimFill(e);
    if (e._bridge || e._waterFooting) WaterBuild.relinkBridge(e);
    if (e.width > 1 || e.height > 1) GridManager.setEntityFootprint(e);
    else                              GridManager.setEntity(e.col, e.row, e);
    // Back over its deposit: the building's footprint covers the deposit
    // tiles again and the deposit is marked as in use (it stays registered).
    if (_depositTypeFor(e.type) !== undefined) {
      _coverDepositUnder(e);
      if (e.type === T.GEOWELL && typeof GeothermalSystem !== 'undefined') GeothermalSystem.relinkWell?.(e);
    }
    adjustBalance(action.cost);
  }

  function applyMove(action) {
    const e = action.entity;
    if (e.type === T.TRUCK) {
      // Not stamped on the grid, and placed by world position, not tile.
      TruckSystem.relocate(e, action.toCol, action.toRow);
    } else if (e.type === T.WATEREXTRACTOR) {
      // Restore water at current pos
      const mw = e.width || 4, mh = e.height || 4;
      for (let r = e.row; r < e.row + mh; r++)
        for (let c = e.col; c < e.col + mw; c++)
          if (GridManager.inBounds(c, r) && GridManager.tiles[r][c] === e)
            GridManager.tiles[r][c] = null;
      if (e._savedWaterTiles)
        for (const { c, r, tile } of e._savedWaterTiles)
          if (GridManager.inBounds(c, r) && !GridManager.tiles[r][c])
            GridManager.tiles[r][c] = tile;
      // Save and stamp at new pos
      e.col = action.toCol;
      e.row = action.toRow;
      e._savedWaterTiles = [];
      for (let r = e.row; r < e.row + mh; r++)
        for (let c = e.col; c < e.col + mw; c++) {
          e._savedWaterTiles.push({ c, r, tile: GridManager.tiles[r][c] });
          GridManager.tiles[r][c] = e;
        }
    } else if (e.type === T.HYDROTURBINE) {
      // GridManager.removeEntityFootprint restores the water under the
      // turbine's current footprint (its captured _waterTiles), then
      // relocateTurbine re-validates and re-captures a fresh snapshot at
      // the undo/redo target — same path the live drag handler uses.
      GridManager.removeEntityFootprint(e);
      ReservoirSystem.relocateTurbine(e, action.toCol, action.toRow);
    } else {
      // Remove from current pos, place at target
      if (e.width > 1 || e.height > 1) GridManager.removeEntityFootprint(e);
      else                              GridManager.removeEntity(e.col, e.row);
      e.col = action.toCol;
      e.row = action.toRow;
      WaterBuild.refillAfterMove(e);   // the lake under its old spot is back; take any under the new one
      if (e.width > 1 || e.height > 1) GridManager.setEntityFootprint(e);
      else                              GridManager.setEntity(e.col, e.row, e);
      ZoneSystem.removeBuilding(e); // rescans grid, rebuilds zone at new position
    }
  }

  // Wire laid under an existing conveyor (input_manager.js tryPlace). The
  // belt stays on the grid throughout; only its _underWire changes, so the
  // host is cycled through the registry to bump PowerNetwork's topology
  // version. If the belt has since been deleted, its wire was restored onto
  // the grid on its own — undo removes that wire instead.
  function _touchTopology(e) { EntityRegistry.remove(e); EntityRegistry.add(e); }
  function _unstackWire(action) {
    const { host, wire } = action;
    if (GridManager.getEntity(wire.col, wire.row) === wire) {
      GridManager.removeEntity(wire.col, wire.row);
    } else if (host._underWire === wire) {
      host._underWire = null;
      _touchTopology(host);
    } else {
      return;   // already gone some other way — nothing to refund
    }
    adjustBalance(-action.cost);
  }
  function _restackWire(action) {
    const { host, wire } = action;
    if (GridManager.getEntity(host.col, host.row) !== host || host._underWire || host._underPipe) return;
    wire.col = host.col; wire.row = host.row;
    host._underWire = wire;
    _touchTopology(host);
    adjustBalance(action.cost);
  }

  // Belt laid over an UNDERGROUND pipe. Same shape as the wire pair above,
  // except the host tunnel can never be promoted onto the grid in the belt's
  // place — it is already the grid tile — so there is no "restored on its
  // own" case to check for.
  function _unstackBelt(action) {
    const { host, belt } = action;
    if (host._underConveyor !== belt) return;
    host._underConveyor = null;
    _touchTopology(host);
    adjustBalance(-action.cost);
  }
  function _restackBelt(action) {
    const { host, belt } = action;
    if (GridManager.getEntity(host.col, host.row) !== host || host._underConveyor) return;
    belt.col = host.col; belt.row = host.row;
    host._underConveyor = belt;
    _touchTopology(host);
    adjustBalance(action.cost);
  }

  // A recorded move is only replayable while the building still exists.
  // Once it has been demolished (a customer building, or a waste facility —
  // both non-undoable removals) replaying the move would stamp it straight
  // back onto the map and refund the relocation fee on top.
  function _stillStanding(e) {
    return EntityRegistry.all().has(e) || GridManager.getEntity(e.col, e.row) === e;
  }

  function _undoOne(action) {
    if (action.type === 'stackWire') _unstackWire(action);
    if (action.type === 'stackBelt') _unstackBelt(action);
    // Pulling a rider back off its host is the same pair run backwards.
    if (action.type === 'unstackWire') _restackWire(action);
    if (action.type === 'unstackBelt') _restackBelt(action);
    if (action.type === 'place')  applyRemove({ entity: action.entity, cost: action.cost, damUndo: action.damUndo });
    if (action.type === 'remove') _reapplyPlace({ entity: action.entity, cost: action.cost, damUndo: action.damUndo });
    if (action.type === 'move' && _stillStanding(action.entity)) {
      applyMove({ entity: action.entity, toCol: action.fromCol, toRow: action.fromRow });
      if (action.fine) adjustBalance(-action.fine); // refund the relocation fine
    }
    // A selection moved together (Select tool): lifted and set back as one,
    // so pieces that took each other's tiles can't land on each other.
    if (action.type === 'groupMove') InputManager.applyGroupMove(action.entities, -action.dc, -action.dr);
  }

  function _redoOne(action) {
    if (action.type === 'stackWire') _restackWire(action);
    if (action.type === 'stackBelt') _restackBelt(action);
    if (action.type === 'unstackWire') _unstackWire(action);
    if (action.type === 'unstackBelt') _unstackBelt(action);
    if (action.type === 'place')  _reapplyPlace({ entity: action.entity, cost: action.cost, damUndo: action.damUndo });
    if (action.type === 'remove') applyRemove({ entity: action.entity, cost: action.cost, damUndo: action.damUndo });
    if (action.type === 'move' && _stillStanding(action.entity)) {
      applyMove({ entity: action.entity, toCol: action.toCol, toRow: action.toRow });
      if (action.fine) adjustBalance(action.fine); // recharge the relocation fine
    }
    if (action.type === 'groupMove') InputManager.applyGroupMove(action.entities, action.dc, action.dr);
  }

  // Undoing a placement (or redoing a removal) demolishes the building just
  // like the Delete tool, so the same waste rule applies. Checked before the
  // action leaves its stack, so a refused undo/redo can simply be retried
  // once the waste has been hauled away.
  function _blockedByWaste(action, removingType) {
    if (!action) return false;
    const list = action.type === 'batch' ? action.actions : [action];
    for (const a of list) {
      if (a.type !== removingType || !a.entity) continue;
      // Same rule as the delete tool: a Survey Station mid-scan stays put.
      if ((a.entity.type === T.SURVEY || a.entity.type === T.SURVEY2) && a.entity._scanning) {
        showToast('⚠ Survey Station is scanning; wait for the scan to finish', '#ff6040', '#140800', '#602010');
        return true;
      }
      // Nor a bridge out from under a truck crossing it.
      if (a.entity._bridge && WaterBuild.truckOn(a.entity)) {
        showToast('⚠ A truck is on this bridge; wait for it to cross', '#ff6040', '#140800', '#602010');
        return true;
      }
      // Nor can a requested amenity be undone back into a refund.
      if (typeof requestedAmenityLocked === 'function' && requestedAmenityLocked(a.entity)) {
        requestedAmenityLockedToast(a.entity);
        return true;
      }
      if (typeof wasteBlocksRemoval === 'undefined') continue;
      const pct = wasteBlocksRemoval(a.entity);
      if (pct !== null) { wasteRemovalBlockedToast(a.entity, pct); return true; }
    }
    return false;
  }

  // Batch recording — groups every record() call made between beginBatch()
  // and endBatch() into a single undo/redo stack entry, so a multi-entity
  // operation (e.g. stamping a blueprint) undoes/redoes as one unit instead
  // of one entity at a time.
  let _batch = null;
  // While muted, record() drops actions — for removals that must not be
  // undoable (clearing a nuclear ruin).
  let _muted = 0;

  return {
    mute()   { _muted++; },
    unmute() { _muted = Math.max(0, _muted - 1); },
    // Record a new action (clears redo stack, unless a batch is open)
    record(action) {
      if (_muted > 0) return;
      if (_batch) { _batch.push(action); return; }
      undoStack.push(action);
      if (undoStack.length > MAX) undoStack.shift();
      redoStack.length = 0;
    },

    beginBatch() {
      _batch = _batch || [];
    },

    // Collapses everything recorded since beginBatch() into one stack entry.
    // No-ops (pushes nothing) if nothing was recorded.
    endBatch() {
      const actions = _batch;
      _batch = null;
      if (!actions || actions.length === 0) return;
      undoStack.push(actions.length === 1 ? actions[0] : { type: 'batch', actions });
      if (undoStack.length > MAX) undoStack.shift();
      redoStack.length = 0;
    },

    undo() {
      if (_blockedByWaste(undoStack[undoStack.length - 1], 'place')) return;
      const action = undoStack.pop();
      if (!action) { try { SFX.error?.(); } catch (_e) {} showToast('Nothing to undo', '#506070', '#08100c', '#1e3040'); return; }

      if (action.type === 'batch') {
        for (let i = action.actions.length - 1; i >= 0; i--) _undoOne(action.actions[i]);
      } else {
        _undoOne(action);
      }

      PowerNetwork.recomputeWireHops();
      redoStack.push(action);
      try { SFX.undo?.(); } catch (_e) {}
    },

    redo() {
      if (_blockedByWaste(redoStack[redoStack.length - 1], 'remove')) return;
      const action = redoStack.pop();
      if (!action) { try { SFX.error?.(); } catch (_e) {} showToast('Nothing to redo', '#506070', '#08100c', '#1e3040'); return; }

      if (action.type === 'batch') {
        for (const a of action.actions) _redoOne(a);
      } else {
        _redoOne(action);
      }

      PowerNetwork.recomputeWireHops();
      undoStack.push(action);
      try { SFX.redo?.(); } catch (_e) {}
    },

    clear() { undoStack.length = 0; redoStack.length = 0; _batch = null; },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   INPUT MANAGER
   Translates raw DOM events into game actions.
   Never does game logic — delegates to placeEntity / removeEntity.
   ═══════════════════════════════════════════════════════════════════ */
