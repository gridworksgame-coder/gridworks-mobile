/* ═══════════════════════════════════════════════════════════════════
   DAM / RESERVOIR / HYDRO TURBINE SYSTEM
   ─────────────────────────────────────────────────────────────────
   T.DAM           — barrier placed across a river, auto-fits width.
                     Single Entity with width = river width (perp to flow),
                     height = 1 (along flow). _flowDc/_flowDr cached at build.
                     _reservoirSide ('upstream'|'downstream') picks which bank
                     the reservoir fills on; R flips it during placement / hover.
   T.HYDROTURBINE  — 5×5 generator placed anywhere within a reservoir.
                     Output scales with reservoir waterLevel and flow rate.

   Reservoir formation:
     Normally TWO dams are needed to bound a reservoir: a downstream dam
     and an upstream dam no more than MAX_DAM_GAP tiles apart (measured by
     flood-fill distance along the dam's chosen bank). Placing a dam flood-
     fills that bank through connected water tiles up to MAX_DAM_GAP steps
     looking for either the river's natural end or an existing unpaired dam:
       - end found within range  → single dam is enough, reservoir forms
         immediately (bounded naturally by the river's end).
       - unpaired dam found      → the two dams pair up, reservoir forms
         between them.
       - neither (still flowing past MAX_DAM_GAP) → this dam is left
         "pending" (built, but no reservoir) until a second dam completes
         it from either side.
     A reservoir's extent is never trusted once set: every time a dam is
     built, removed, flipped or restored, ALL reservoirs are worked out
     again from the dams standing now (_rebuildAll), and once more when a
     world loads. Before that the fill was computed at formation and kept,
     so removing or re-siting a dam left stretches of water between two
     dams that belonged to no reservoir, and a turbine could not go there.
     Each tile gets _reservoirId set. Reservoir tracks:
       waterLevel, capacity, tiles[], inflowSources, turbines[]
     Inflow = number of river tiles on the perimeter whose flow points
     INTO the fill region but which are NOT themselves part of it.

   Sim per tick:
     inflow  = inflowSources * INFLOW_PER_SRC * dt
     drain   = sum(turbine demand) * dt + spill (if at capacity)
     level   = clamp(level + inflow - drain, 0, capacity)
     each turbine.powerOutput = base * fillFactor * flowFactor

   Save: reservoirs[] only (river tile _reservoirId tags are rebuilt).
   ═══════════════════════════════════════════════════════════════════ */

// ── T-type registration (add to T enum at runtime if not already present)
if (typeof T !== 'undefined') {
  if (!T.DAM)          T.DAM          = 'dam';
  if (!T.HYDROTURBINE) T.HYDROTURBINE = 'hydroturbine';
}

// ── EntityDefs registration
if (typeof EntityDefs !== 'undefined') {
  if (!EntityDefs[T.DAM]) {
    EntityDefs[T.DAM] = {
      label:       'Dam',
      color:       '#3a3a40',
      glowColor:   '#a0b0c0',
      powerOutput: 0,
      powerInput:  0,
      throughput:  0,
      cost:        35000,
      upkeep:      25.0,
      income:      0,
      width:       1,   // dynamic — set at placement
      height:      1,
    };
  }
  if (!EntityDefs[T.HYDROTURBINE]) {
    EntityDefs[T.HYDROTURBINE] = {
      label:       'Hydro Turbine',
      color:       '#0a1a24',
      glowColor:   '#30d4ff',
      powerOutput: 0,    // No electrical output — produces mechanical rotation
      powerInput:  10,   // Small draw for control electronics / startup
      throughput:  0,
      cost:        62500,
      upkeep:      6.0,
      income:      0,
      width:       5,
      height:      5,
    };
  }
  if (!EntityDefs[T.SHAFT]) {
    EntityDefs[T.SHAFT] = {
      label:       'Drive Shaft',
      color:       '#3a2818',
      glowColor:   '#e0a020',
      powerOutput: 0,
      powerInput:  0,
      throughput:  0,
      cost:        1500,
      upkeep:      0.1,
      income:      0,
      width:       3,
      height:      1,
    };
  }
}

const ReservoirSystem = (() => {
  // Tuning
  const MAX_FILL          = 240;   // hard cap on reservoir tile count
  const MAX_DAM_GAP       = 30;    // max flood-fill steps between paired dams / to a river's natural end
  const TILE_CAPACITY     = 100;   // water units per flooded tile
  const INFLOW_PER_SRC    = 24.0;  // water units / second per inflow tile (one river tile feeds four turbines)
  const SPILL_RATE        = 20.0;  // passive overflow at full
  const MIN_LEVEL_FRAC    = 0.10;  // turbines stop below this fill
  const TURBINE_DRAW      = 6.0;   // water units / second per active turbine
  const INITIAL_FILL_FRAC = 0.75;  // new reservoirs start mostly full

  const reservoirs = new Map(); // id -> reservoir obj
  const pendingDams = [];       // dam entities placed but not yet paired into a reservoir
  let nextId = 1;
  let _totalTurbineRuntime = 0; // cumulative seconds any turbine has been actively spinning, saved/loaded

  function _key(c, r) { return `${c},${r}`; }

  // ── Find the river "span" the cursor is on, perpendicular to flow.
  // Returns { tiles: [{c,r}], flowDc, flowDr, orientDc, orientDr } or null.
  function findRiverSpan(c, r) {
    const e = GridManager.getEntity(c, r);
    if (!e || e.type !== T.WATER || !e._isRiver) return null;
    const fdc = e._flowDc, fdr = e._flowDr;
    if (fdc === 0 && fdr === 0) return null;
    // Perpendicular axis
    const odc = -fdr, odr = fdc;
    const span = [{ c, r }];
    // Walk both directions perpendicular while staying on river
    for (let step = 1; step < 12; step++) {
      const nc = c + odc * step, nr = r + odr * step;
      const ne = GridManager.getEntity(nc, nr);
      if (!ne || ne.type !== T.WATER || !ne._isRiver) break;
      span.unshift({ c: nc, r: nr });
    }
    for (let step = 1; step < 12; step++) {
      const nc = c - odc * step, nr = r - odr * step;
      const ne = GridManager.getEntity(nc, nr);
      if (!ne || ne.type !== T.WATER || !ne._isRiver) break;
      span.push({ c: nc, r: nr });
    }
    return { tiles: span, flowDc: fdc, flowDr: fdr, orientDc: odc, orientDr: odr };
  }

  // Reservoir side on a dam: which bank the flood-fill grows into.
  //   'upstream'   — against river flow (default; classic "behind the dam")
  //   'downstream' — with river flow (opposite bank; R flips between them)
  function _normalizeSide(side) {
    return side === 'downstream' ? 'downstream' : 'upstream';
  }
  function _isUnpairedDam(e) {
    if (!e || e.type !== T.DAM) return false;
    // Mid-rebuild, a dam that is about to re-form its own reservoir is a
    // wall to everyone else, not a partner up for grabs.
    if (_owners && _owners.has(e)) return false;
    return e._reservoirId === undefined || !reservoirs.has(e._reservoirId);
  }
  // fillDc/fillDr = step FROM the dam INTO the fill region.
  function _fillDir(dam) {
    const sign = _normalizeSide(dam._reservoirSide) === 'downstream' ? 1 : -1;
    return { fillDc: sign * (dam._flowDc || 0), fillDr: sign * (dam._flowDr || 0) };
  }

  // ── Flood-fill from a dam's span in a chosen direction, stopping at
  //    maxSteps flood-fill steps, at the river's natural end, or at another
  //    unpaired dam. Returns { tiles, hitDam, truncated }:
  //      hitDam    — an existing unpaired T.DAM entity found within range, if any
  //      truncated — true if the fill was still expanding when the step cap
  //                  was hit (i.e. the river keeps going past maxSteps unbounded)
  //
  //    A turbine stands IN the water, so the fill walks through the water
  //    cells under it (tb._waterTiles) and counts them as reservoir. Treating
  //    it as a wall let a turbine across the channel cut the reservoir in
  //    two the next time it was worked out.
  function bfsFill(spanTiles, fillDc, fillDr, maxSteps) {
    const fillSet = new Map(); // key -> {c,r}
    const spanKeys = new Set(spanTiles.map(t => _key(t.c, t.r)));
    const tbWater = new Map(); // turbine -> Set of the water cells it stands on
    const queue = [];
    let hitDam = null;

    const underTurbine = (tb, k) => {
      let set = tbWater.get(tb);
      if (!set) { set = new Set((tb._waterTiles || []).map(t => _key(t.c, t.r))); tbWater.set(tb, set); }
      return set.has(k);
    };
    const visit = (c, r, depth) => {
      const k = _key(c, r);
      if (fillSet.has(k) || spanKeys.has(k)) return; // never re-cross our own footprint
      const e = GridManager.getEntity(c, r);
      if (!e) return;
      if (e.type === T.DAM) {
        if (_isUnpairedDam(e) && !hitDam) hitDam = e;
        return;
      }
      // (a tag left behind by a reservoir that no longer exists holds nothing back)
      const open = (e.type === T.WATER && (e._reservoirId === undefined || !reservoirs.has(e._reservoirId)))
                || (e.type === T.HYDROTURBINE && underTurbine(e, k));
      if (!open) return;
      fillSet.set(k, { c, r });
      queue.push({ c, r, depth });
    };
    for (const t of spanTiles) visit(t.c + fillDc, t.r + fillDr, 1);

    let truncated = false;
    while (queue.length && fillSet.size < MAX_FILL) {
      const { c, r, depth } = queue.shift();
      if (depth >= maxSteps) { truncated = true; continue; }
      for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]]) visit(c + dc, r + dr, depth + 1);
    }
    return { tiles: [...fillSet.values()], hitDam, truncated };
  }

  // ── Count tiles bordering the reservoir whose flow points INTO it,
  //    OR any water tiles bordering the reservoir (lakes have no flow).
  function countInflowSources(tiles, tileSet) {
    let flowSources = 0;
    let staticSources = 0;
    const seen = new Set();
    for (const t of tiles) {
      for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const nc = t.c + dc, nr = t.r + dr;
        const k = _key(nc, nr);
        if (tileSet.has(k) || seen.has(k)) continue;
        const ne = GridManager.getEntity(nc, nr);
        if (!ne || ne.type !== T.WATER) continue;
        seen.add(k);
        // River with flow pointing INTO reservoir → strong source
        if (ne._isRiver && ne._flowDc === -dc && ne._flowDr === -dr) {
          flowSources++;
        } else {
          // Adjacent lake/still water → weaker static source
          staticSources++;
        }
      }
    }
    // River inflow counts fully; static water contributes at 1/3 rate
    const total = flowSources + staticSources / 3;
    return Math.max(1, total);
  }

  // ── Turn a set of flood-filled tiles into a reservoir bounded by
  //    downstreamDam (and, if paired, upstreamDam). Tags tiles/dams.
  function _formReservoir(downstreamDam, upstreamDam, fillTiles) {
    const tileSet = new Set(fillTiles.map(t => _key(t.c, t.r)));
    const inflowSources = countInflowSources(fillTiles, tileSet);

    // Re-forming during a rebuild: keep the id and how full it was, so a
    // reservoir that only changed shape is still the same reservoir to its
    // turbines, the info panels and the save.
    const keep = _carry && (_carry.get(downstreamDam) || (upstreamDam && _carry.get(upstreamDam)));
    const id = keep && !reservoirs.has(keep.id) ? keep.id : nextId++;
    const reservoir = {
      id,
      damCol: downstreamDam.col, damRow: downstreamDam.row,
      tiles: fillTiles,
      waterLevel: fillTiles.length * TILE_CAPACITY * (keep ? keep.frac : INITIAL_FILL_FRAC),
      capacity: fillTiles.length * TILE_CAPACITY,
      inflowSources,
      flowDc: downstreamDam._flowDc,
      flowDr: downstreamDam._flowDr,
      turbines: [],
    };
    reservoirs.set(id, reservoir);
    downstreamDam._reservoirId = id;
    if (upstreamDam && upstreamDam !== downstreamDam) upstreamDam._reservoirId = id;

    // Tag river tiles as reservoir tiles (keep them as WATER entities so
    // existing render path handles them — but mark _reservoirId so render
    // can theme them differently and so flow stops drawing).
    for (const t of fillTiles) {
      const e = GridManager.getEntity(t.c, t.r);
      if (e && e.type === T.WATER) {
        e._reservoirId = id;
      }
    }
    return reservoir;
  }

  // ── Try to form/pair a reservoir for a dam already on the grid.
  //    Uses dam._reservoirSide to pick the fill bank (never placementRotation).
  function _tryFormReservoir(dam) {
    const { fillDc, fillDr } = _fillDir(dam);
    const probe = bfsFill(dam._spanTiles, fillDc, fillDr, MAX_DAM_GAP);
    let reservoir = null;
    let status;

    if (!probe.tiles.length) {
      // Nothing on that bank to hold back (a dam at the very head of the
      // river, or hard against another). No empty reservoir; it waits.
      if (!pendingDams.includes(dam)) pendingDams.push(dam);
      status = 'pending';
    } else if (probe.hitDam) {
      // Paired with an existing dam on this bank — reservoir forms between them.
      reservoir = _formReservoir(dam, probe.hitDam, probe.tiles);
      const idx = pendingDams.indexOf(probe.hitDam);
      if (idx >= 0) pendingDams.splice(idx, 1);
      status = 'paired';
    } else if (!probe.truncated) {
      // River naturally ends within range — this dam alone is enough.
      reservoir = _formReservoir(dam, dam, probe.tiles);
      status = 'single';
    } else {
      // Too far from the river's end to stand alone. See if this new dam
      // completes an existing pending dam whose own fill now reaches this one.
      for (const p of pendingDams) {
        if (p === dam) continue;
        const pd = _fillDir(p);
        const pProbe = bfsFill(p._spanTiles, pd.fillDc, pd.fillDr, MAX_DAM_GAP);
        if (pProbe.hitDam === dam) {
          reservoir = _formReservoir(p, dam, pProbe.tiles);
          const idx = pendingDams.indexOf(p);
          if (idx >= 0) pendingDams.splice(idx, 1);
          status = 'paired';
          break;
        }
      }
      if (!reservoir) {
        if (!pendingDams.includes(dam)) pendingDams.push(dam);
        status = 'pending';
      }
    }

    return { ok: true, dam, reservoir, status };
  }

  // True while `dam` actually stands on the grid (EntityRegistry can still
  // hold one that is mid-removal).
  function _damOnGrid(dam) {
    const t = dam && dam._spanTiles && dam._spanTiles[0];
    return !!t && GridManager.getEntity(t.c, t.r) === dam;
  }

  // What a dam ended up as after a rebuild.
  function _damResult(dam) {
    const reservoir = (dam._reservoirId !== undefined && reservoirs.get(dam._reservoirId)) || null;
    let status = 'pending';
    if (reservoir) {
      status = 'single';
      for (const d of EntityRegistry.getByType(T.DAM)) {
        if (d !== dam && d._reservoirId === reservoir.id && _damOnGrid(d)) { status = 'paired'; break; }
      }
    }
    return { ok: true, dam, reservoir, status };
  }

  // Set only while _rebuildAll runs: dam -> { id, frac } of the reservoir it
  // had, and the dams still waiting to re-form their own.
  let _carry = null, _owners = null;

  // ── Work every reservoir out again from the dams standing now.
  //    Each existing reservoir re-forms from its own dam first, in the order
  //    they were made, keeping its id and how full it was; then the dams that
  //    had none get their turn, so a dam that could not hold water before can
  //    pick up whatever a change elsewhere has freed. Turbines are re-homed to
  //    the reservoir whose water they stand on.
  //    `carry` (dam -> {id, frac}) adds to / overrides what is carried over —
  //    undo uses it to hand a restored dam its old reservoir back.
  function _rebuildAll(carry) {
    const dams = [];
    for (const d of EntityRegistry.getByType(T.DAM)) if (_damOnGrid(d)) dams.push(d);

    _carry = new Map(); _owners = new Set();
    const order = [];
    const olds = [...reservoirs.values()].sort((a, b) => a.id - b.id);
    for (const res of olds) {
      const rec = { id: res.id, frac: res.capacity > 0 ? res.waterLevel / res.capacity : INITIAL_FILL_FRAC };
      const first = GridManager.getEntity(res.damCol, res.damRow);
      const mine = dams.filter(d => d._reservoirId === res.id).sort((a, b) => (b === first) - (a === first));
      for (const d of mine) _carry.set(d, rec);
      if (mine.length) { _owners.add(mine[0]); order.push(mine[0]); }
      for (const t of res.tiles) {
        const e = GridManager.getEntity(t.c, t.r);
        if (e && e.type === T.WATER && e._reservoirId === res.id) e._reservoirId = undefined;
      }
    }
    if (carry) for (const [d, rec] of carry) _carry.set(d, rec);
    for (const d of dams) { d._reservoirId = undefined; if (!order.includes(d)) order.push(d); }
    reservoirs.clear();
    pendingDams.length = 0;

    for (const d of order) {
      _owners.delete(d);
      // A dam already swept up as someone's partner, or already waiting, is done.
      if (d._reservoirId === undefined && !pendingDams.includes(d)) _tryFormReservoir(d);
    }
    _carry = null; _owners = null;

    // Re-home the turbines.
    const owner = new Map(); // tile key -> reservoir
    for (const res of reservoirs.values()) for (const t of res.tiles) owner.set(_key(t.c, t.r), res);
    for (const tb of EntityRegistry.getByType(T.HYDROTURBINE)) {
      if (GridManager.getEntity(tb.col, tb.row) !== tb) continue;
      let res = null;
      for (const t of (tb._waterTiles || [])) { res = owner.get(_key(t.c, t.r)); if (res) break; }
      if (!res) res = _reservoirBordering(tb);
      if (!res) { tb._reservoirId = undefined; continue; }   // tick() stands it down until water comes back
      tb._reservoirId = res.id;
      tb._damCol = res.damCol; tb._damRow = res.damRow;
      tb._flowDc = res.flowDc; tb._flowDr = res.flowDr;
      for (const t of (tb._waterTiles || [])) t.reservoirId = res.id;
      if (!res.turbines.includes(tb)) res.turbines.push(tb);
    }
  }

  // ── On load: put right any reservoir a save from before _rebuildAll left
  //    short of its own dams. A rebuild from nothing could in principle land
  //    differently from what the player has been running (an old save, a fill
  //    that was hand-patched over time), so it is only kept if every reservoir
  //    survives it with its turbines and at least the water it had; otherwise
  //    the loaded state goes back exactly as it was.
  function _healOnLoad() {
    if (!reservoirs.size) return;
    const before = {
      nextId,
      res: [...reservoirs.values()].map(r => ({ ...r, tiles: r.tiles.slice(), turbines: r.turbines.slice() })),
      dams: [...EntityRegistry.getByType(T.DAM)].map(d => [d, d._reservoirId]),
      turbines: [...EntityRegistry.getByType(T.HYDROTURBINE)].map(tb => ({
        tb, id: tb._reservoirId, damCol: tb._damCol, damRow: tb._damRow, flowDc: tb._flowDc, flowDr: tb._flowDr,
        tiles: (tb._waterTiles || []).map(t => t.reservoirId),
      })),
    };
    _rebuildAll();
    const sound = before.res.every(o => {
      const n = reservoirs.get(o.id);
      return n && n.tiles.length >= o.tiles.length
          && before.turbines.every(x => x.id !== o.id || GridManager.getEntity(x.tb.col, x.tb.row) !== x.tb || n.turbines.includes(x.tb));
    });
    if (sound) return;

    for (const res of reservoirs.values()) {
      for (const t of res.tiles) {
        const e = GridManager.getEntity(t.c, t.r);
        if (e && e.type === T.WATER && e._reservoirId === res.id) e._reservoirId = undefined;
      }
    }
    reservoirs.clear();
    for (const o of before.res) {
      reservoirs.set(o.id, o);
      for (const t of o.tiles) {
        const e = GridManager.getEntity(t.c, t.r);
        if (e && e.type === T.WATER) e._reservoirId = o.id;
      }
    }
    for (const [d, id] of before.dams) d._reservoirId = id;
    for (const x of before.turbines) {
      x.tb._reservoirId = x.id; x.tb._damCol = x.damCol; x.tb._damRow = x.damRow;
      x.tb._flowDc = x.flowDc; x.tb._flowDr = x.flowDr;
      (x.tb._waterTiles || []).forEach((t, i) => { t.reservoirId = x.tiles[i]; });
    }
    nextId = before.nextId;
    pendingDams.length = 0;
    for (const [d, id] of before.dams) if (id === undefined) pendingDams.push(d);
  }

  // ── Build a dam on the given anchor tile. Returns the dam entity or null.
  //    Two dams (no more than MAX_DAM_GAP tiles apart, measured along the
  //    chosen fill bank) are normally needed to bound a reservoir. A single
  //    dam is enough if it's within MAX_DAM_GAP tiles of the river's natural end.
  //    opts.side: 'upstream' | 'downstream' — which bank fills (from R / placementRotation).
  function buildDam(anchorC, anchorR, opts) {
    const span = findRiverSpan(anchorC, anchorR);
    if (!span) return { ok: false, reason: 'Dam must be placed on a river tile.' };
    if (span.tiles.length < 2) return { ok: false, reason: 'River is too narrow for a dam.' };

    // Reject if any tile in span already has a dam. A span inside a reservoir
    // is fine: the rebuild below re-cuts that reservoir at the new dam.
    for (const t of span.tiles) {
      const e = GridManager.getEntity(t.c, t.r);
      if (!e || e.type !== T.WATER) return { ok: false, reason: 'Dam span blocked.' };
      if (e._isDamTile)   return { ok: false, reason: 'A dam already exists here.' };
    }

    // Convert the span into a single dam entity occupying multiple tiles.
    // We anchor at the min-coord tile and set width/height accordingly.
    const cs = span.tiles.map(t => t.c);
    const rs = span.tiles.map(t => t.r);
    const minC = Math.min(...cs), maxC = Math.max(...cs);
    const minR = Math.min(...rs), maxR = Math.max(...rs);
    const width  = maxC - minC + 1;
    const height = maxR - minR + 1;

    // Create the dam entity
    const dam = new Entity(T.DAM, minC, minR);
    dam.width  = width;
    dam.height = height;
    dam._flowDc = span.flowDc;
    dam._flowDr = span.flowDr;
    dam._spanTiles = span.tiles.map(t => ({ c: t.c, r: t.r })); // for save
    dam._reservoirSide = _normalizeSide(opts && opts.side);

    // Remove WATER entities from span tiles, place dam footprint
    for (const t of span.tiles) {
      GridManager.removeEntity(t.c, t.r);
      if (typeof WaterSystem !== 'undefined' && WaterSystem._unregister) {
        WaterSystem._unregister(t.c, t.r);
      }
    }
    // Manually fill footprint (span may not be a clean rectangle if river bends,
    // but we already require min..max bounding box; non-river cells in box stay null)
    for (const t of span.tiles) {
      GridManager.tiles[t.r][t.c] = dam;
    }
    EntityRegistry.add(dam);

    _rebuildAll();
    return _damResult(dam);
  }

  // ── Snapshot everything undo needs to put this dam back exactly as it was
  //    (side + reservoir membership). Captured BEFORE onEntityRemoved runs.
  function captureDamUndoState(dam) {
    if (!dam || dam.type !== T.DAM) return null;
    const side = _normalizeSide(dam._reservoirSide);
    const partners = [];
    let reservoir = null;
    if (dam._reservoirId !== undefined) {
      const res = reservoirs.get(dam._reservoirId);
      if (res) {
        reservoir = {
          id: res.id,
          damCol: res.damCol, damRow: res.damRow,
          waterLevel: res.waterLevel,
          capacity: res.capacity,
          inflowSources: res.inflowSources,
          flowDc: res.flowDc, flowDr: res.flowDr,
          tiles: res.tiles.map(t => ({ c: t.c, r: t.r })),
          turbines: res.turbines.slice(),
        };
        for (const other of EntityRegistry.getByType(T.DAM)) {
          if (other !== dam && other._reservoirId === res.id) partners.push(other);
        }
      }
    }
    return {
      side,
      reservoir,
      partners,
      wasPending: pendingDams.includes(dam),
    };
  }

  // ── Put a dam entity back on its span and restore reservoir membership.
  //    Used by undo/redo — honors the saved side; never reads placementRotation.
  function restoreDam(dam, undoState) {
    if (!dam || dam.type !== T.DAM || !dam._spanTiles) return { ok: false, reason: 'Invalid dam.' };

    const side = _normalizeSide((undoState && undoState.side) || dam._reservoirSide);
    dam._reservoirSide = side;

    // Clear river water on the span and stamp the dam back.
    for (const t of dam._spanTiles) {
      if (!GridManager.inBounds(t.c, t.r)) continue;
      const prev = GridManager.tiles[t.r][t.c];
      if (prev && prev !== dam) {
        GridManager.tiles[t.r][t.c] = null;
        EntityRegistry.remove(prev);
        if (prev.type === T.WATER && typeof WaterSystem !== 'undefined' && WaterSystem._unregister) {
          WaterSystem._unregister(t.c, t.r);
        }
      }
      GridManager.tiles[t.r][t.c] = dam;
    }
    EntityRegistry.add(dam);

    // Hand the dam (and the partners it had) the reservoir from the removal
    // snapshot: same id, same fill. Its extent is worked out afresh like any
    // other change, so it also fits whatever was built while the dam was gone.
    dam._reservoirId = undefined;
    const carry = new Map();
    const snap = undoState && undoState.reservoir;
    if (snap) {
      const rec = { id: snap.id, frac: snap.capacity > 0 ? snap.waterLevel / snap.capacity : INITIAL_FILL_FRAC };
      carry.set(dam, rec);
      for (const p of (undoState.partners || [])) carry.set(p, rec);
      if (snap.id >= nextId) nextId = snap.id + 1;
    }
    _rebuildAll(carry);
    const out = _damResult(dam);
    if (snap && out.reservoir) out.status = 'restored';
    return out;
  }

  // ── Flip which bank a placed dam creates its reservoir on (R while hovering).
  function flipDam(dam) {
    if (!dam || dam.type !== T.DAM) return false;
    dam._reservoirSide = _normalizeSide(dam._reservoirSide) === 'downstream' ? 'upstream' : 'downstream';
    _rebuildAll();
    return true;
  }

  function sideLabel(side) {
    return _normalizeSide(side) === 'downstream' ? 'downstream' : 'upstream';
  }

  // ── Read-only placement check shared by buildTurbine and the placement
  //    ghost preview. Returns { ok, reason?, waterTiles?, reservoirId? }.
  //    ignoreEntity: treat tiles still occupied by this entity as empty —
  //    used by relocateTurbine/canBuildTurbine so a turbine being dragged
  //    doesn't read as "blocked by a building" by its own old footprint.
  //    What it stands on counts for what it is: the water under it comes
  //    back on the drop. Passed over as empty, a turbine nudged a tile or two
  //    came up short of water and read red for a spot the drop accepted.
  function _validateTurbinePlacement(col, row, ignoreEntity) {
    const def = EntityDefs[T.HYDROTURBINE];
    const w = def.width, h = def.height;
    const ownWater = new Set(((ignoreEntity && ignoreEntity._waterTiles) || []).map(t => _key(t.c, t.r)));

    // Bounds check
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        if (!GridManager.inBounds(c, r)) {
          return { ok: false, reason: 'Turbine out of bounds.' };
        }
      }
    }

    // Categorize each footprint tile: reservoir water (clearable, ties the
    // turbine to that reservoir), empty land (buildable), or blocked (other
    // entity — reject).
    const waterTiles = [];
    let totalTiles = 0;
    let reservoirId;
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        totalTiles++;
        const tile = GridManager.getEntity(c, r);
        if (!tile) continue;
        const own = tile === ignoreEntity;
        if (own && !ownWater.has(_key(c, r))) continue;
        if (own || tile.type === T.WATER) {
          const tileRes = tile._reservoirId;
          if (tileRes === undefined) {
            return { ok: false, reason: 'Turbine must be placed in a reservoir.' };
          }
          if (reservoirId === undefined) {
            reservoirId = tileRes;
          } else if (reservoirId !== tileRes) {
            return { ok: false, reason: 'Turbine footprint spans multiple reservoirs.' };
          }
          waterTiles.push({ c, r });
          continue;
        }
        // Trees/bushes can be cleared
        if (tile.type === T.TREE || tile.type === T.BUSH) continue;
        return { ok: false, reason: 'Turbine footprint is blocked by a building.' };
      }
    }

    if (reservoirId === undefined) {
      return { ok: false, reason: 'Turbine must be placed in a reservoir.' };
    }

    // Require at least ~40% of footprint to be reservoir water
    const waterFrac = waterTiles.length / totalTiles;
    if (waterFrac < 0.4) {
      return { ok: false, reason: 'Turbine must sit mostly in the reservoir.' };
    }

    if (!reservoirs.get(reservoirId)) return { ok: false, reason: 'Reservoir not found.' };

    return { ok: true, waterTiles, reservoirId };
  }

  // ── Read-only check for the placement ghost — no mutation.
  function canBuildTurbine(col, row, ignoreEntity) {
    const check = _validateTurbinePlacement(col, row, ignoreEntity);
    return { ok: check.ok, reason: check.reason };
  }

  // ── Build turbine; returns {ok, entity?, reason?}
  function buildTurbine(col, row, rotation = 0) {
    const check = _validateTurbinePlacement(col, row);
    if (!check.ok) return check;
    const { waterTiles, reservoirId } = check;
    const def = EntityDefs[T.HYDROTURBINE];
    const w = def.width, h = def.height;

    const reservoir = reservoirs.get(reservoirId);

    // Capture full state of water tiles (not just coords) for accurate restore on delete
    const waterTileState = waterTiles.map(t => {
      const tile = GridManager.getEntity(t.c, t.r);
      return {
        c: t.c, r: t.r,
        isRiver: tile?._isRiver || false,
        flowDc:  tile?._flowDc || 0,
        flowDr:  tile?._flowDr || 0,
        reservoirId,
      };
    });

    // Clear water tiles (track for restoration on delete)
    for (const t of waterTiles) {
      GridManager.removeEntity(t.c, t.r);
      if (typeof WaterSystem !== 'undefined' && WaterSystem._unregister) {
        WaterSystem._unregister(t.c, t.r);
      }
    }
    // Clear any vegetation in the footprint
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        const tile = GridManager.getEntity(c, r);
        if (tile && (tile.type === T.TREE || tile.type === T.BUSH)) {
          GridManager.removeEntity(c, r);
        }
      }
    }

    // Place the turbine
    const tb = new Entity(T.HYDROTURBINE, col, row);
    tb._damCol = reservoir.damCol; tb._damRow = reservoir.damRow;
    tb._reservoirId = reservoir.id;
    tb._flowDc = reservoir.flowDc;
    tb._flowDr = reservoir.flowDr;
    tb._waterTiles = waterTileState;
    tb._fuelled = false;
    tb._rotationRate = 0;
    // Drive shaft output side: the placement rotation turned from the
    // default (see turbineOutSide).
    const out = turbineOutSide(reservoir.flowDr, rotation);
    tb._outSideDc = out.dc; tb._outSideDr = out.dr;
    GridManager.setEntityFootprint(tb);
    reservoir.turbines.push(tb);
    return { ok: true, entity: tb };
  }

  // ── Relocate an EXISTING turbine (drag-move). No cost, no new entity —
  // the caller (input_manager's drag handler) has already lifted it off
  // the grid via GridManager.removeEntityFootprint, which restores the
  // water under its OLD footprint automatically (see
  // GridManager._restoreWaterUnder). This just re-validates the new spot
  // the same way buildTurbine does, re-captures the water state there, and
  // moves the turbine's reservoir membership over if it changed reservoirs.
  function relocateTurbine(tb, col, row) {
    // Re-home the water just put back under the old footprint first, so a
    // destination overlapping it validates as reservoir water.
    _rejoinTurbineWater(tb);
    const check = _validateTurbinePlacement(col, row, tb);
    if (!check.ok) return check;
    const { waterTiles, reservoirId } = check;
    const def = EntityDefs[T.HYDROTURBINE];
    const w = def.width, h = def.height;
    const reservoir = reservoirs.get(reservoirId);

    const oldReservoir = reservoirs.get(tb._reservoirId);
    if (oldReservoir) {
      const i = oldReservoir.turbines.indexOf(tb);
      if (i >= 0) oldReservoir.turbines.splice(i, 1);
    }

    const waterTileState = waterTiles.map(t => {
      const tile = GridManager.getEntity(t.c, t.r);
      return {
        c: t.c, r: t.r,
        isRiver: tile?._isRiver || false,
        flowDc:  tile?._flowDc || 0,
        flowDr:  tile?._flowDr || 0,
        reservoirId,
      };
    });
    for (const t of waterTiles) {
      GridManager.removeEntity(t.c, t.r);
      if (typeof WaterSystem !== 'undefined' && WaterSystem._unregister) {
        WaterSystem._unregister(t.c, t.r);
      }
    }
    for (let r = row; r < row + h; r++) {
      for (let c = col; c < col + w; c++) {
        const tile = GridManager.getEntity(c, r);
        if (tile && (tile.type === T.TREE || tile.type === T.BUSH)) {
          GridManager.removeEntity(c, r);
        }
      }
    }

    tb.col = col; tb.row = row;
    tb._damCol = reservoir.damCol; tb._damRow = reservoir.damRow;
    tb._reservoirId = reservoir.id;
    tb._flowDc = reservoir.flowDc;
    tb._flowDr = reservoir.flowDr;
    tb._waterTiles = waterTileState;
    tb._waterStubs = null;   // stale cache from the old footprint (render_hydro_coal.js)
    // The output keeps the side the player turned it to; any of the four
    // faces is valid wherever it lands. Only one with no side yet gets the default.
    if (!_OUT_DIRS.some(d => d.dc === tb._outSideDc && d.dr === tb._outSideDr)) {
      const out = turbineOutSide(reservoir.flowDr, 0);
      tb._outSideDc = out.dc; tb._outSideDr = out.dr;
    }
    GridManager.setEntityFootprint(tb);
    reservoir.turbines.push(tb);
    return { ok: true, entity: tb };
  }

  // ── Turbine drive shaft output side ──
  // Defaults to the face perpendicular to the flow (east on a N/S river,
  // south on an E/W one); each R turns it a quarter clockwise from there.
  const _OUT_DIRS = [
    { dc:  0, dr: -1 }, // N
    { dc:  1, dr:  0 }, // E
    { dc:  0, dr:  1 }, // S
    { dc: -1, dr:  0 }, // W
  ];
  function turbineOutSide(flowDr, rotation = 0) {
    return _OUT_DIRS[((flowDr !== 0 ? 1 : 2) + (rotation || 0)) % 4];
  }
  // Cycle a placed turbine's output side: N → E → S → W → N
  function flipTurbine(tb) {
    if (!tb || tb.type !== T.HYDROTURBINE) return false;
    let idx = _OUT_DIRS.findIndex(d => d.dc === tb._outSideDc && d.dr === tb._outSideDr);
    if (idx < 0) idx = 0;
    const next = _OUT_DIRS[(idx + 1) % 4];
    tb._outSideDc = next.dc;
    tb._outSideDr = next.dr;
    return true;
  }

  // The live reservoir whose water touches a turbine's footprint edge, or null.
  function _reservoirBordering(tb) {
    const w = tb.width || EntityDefs[T.HYDROTURBINE].width;
    const h = tb.height || EntityDefs[T.HYDROTURBINE].height;
    const at = (c, r) => {
      const n = GridManager.getEntity(c, r);
      return n && n.type === T.WATER ? reservoirs.get(n._reservoirId) || null : null;
    };
    for (let c = tb.col; c < tb.col + w; c++) {
      const res = at(c, tb.row - 1) || at(c, tb.row + h);
      if (res) return res;
    }
    for (let r = tb.row; r < tb.row + h; r++) {
      const res = at(tb.col - 1, r) || at(tb.col + w, r);
      if (res) return res;
    }
    return null;
  }

  // ── Per-tick simulation
  function tick(dt) {
    let _anyTurbineFuelledThisTick = false;
    // Self-heal: any turbine entity tagged with a _reservoirId but missing from
    // the reservoir's turbines[] gets re-attached. Handles older saves where the
    // array was accidentally pruned to empty.
    const allTurbines = EntityRegistry.getByType(T.HYDROTURBINE);
    for (const tb of allTurbines) {
      let res = tb._reservoirId === undefined ? null : reservoirs.get(tb._reservoirId);
      // Orphaned: its reservoir was dissolved (dam flipped, demolished,
      // undone…) and has since re-formed under a new id around it. Nothing
      // ever re-linked it, so it sat at "LOW WATER" forever with a stale
      // reservoir reading. Adopt it into whichever live reservoir's water
      // it borders.
      if (!res && GridManager.getEntity(tb.col, tb.row) === tb) {
        res = _reservoirBordering(tb);
        if (res) {
          tb._reservoirId = res.id;
          tb._damCol = res.damCol; tb._damRow = res.damRow;
          tb._flowDc = res.flowDc; tb._flowDr = res.flowDr;
        } else {
          tb._fuelled = false;
          tb._rotationRate = 0;
          tb._fillFrac = 0;
        }
      }
      if (res && !res.turbines.includes(tb)) {
        res.turbines.push(tb);
      }
    }
    for (const res of reservoirs.values()) {
      // Inflow
      const inflow = res.inflowSources * INFLOW_PER_SRC * dt;
      // Turbine demand. The reservoir is never drawn below MIN_LEVEL_FRAC:
      // what the turbines can have is the water above it plus what the
      // river brings in this tick, and when they want more than that they
      // SHARE it, each running on its share. They used to take their full
      // draw down to the floor and then stop dead, so a dam with more
      // turbines than its river could feed sat at the floor with every
      // turbine flickering on and off at next to no output.
      let want = 0;
      const activeTurbines = [];
      // A turbine with no power to run its gates (_bayFed: its network is
      // short but has some supply, so it keeps going, see PowerNetwork.tick)
      // passes no water. Counting it anyway drained the reservoir to the
      // floor while nothing turned, and held it there.
      const runs = tb => tb.powered || tb._bayFed;
      for (const tb of res.turbines) {
        // Skip turbines whose entity is currently not on grid (saving/loading mid-state),
        // but DON'T prune them — they may come back next tick.
        const here = GridManager.getEntity(tb.col, tb.row);
        if (here !== tb) continue;
        activeTurbines.push(tb);
        if (runs(tb)) want += TURBINE_DRAW * dt;
      }
      const floor = res.capacity * MIN_LEVEL_FRAC;
      const avail = Math.max(0, res.waterLevel - floor) + inflow;
      const drawn = Math.min(want, avail);
      // Each running turbine's share of its full flow. While paused (dt 0)
      // nothing is wanted or drawn, so the last share stands.
      if (want > 0) res._share = drawn / want;
      const share = res._share ?? 1;
      // Spill if at capacity
      let spill = 0;
      if (res.waterLevel >= res.capacity * 0.99) spill = SPILL_RATE * dt;
      const newLevel = res.waterLevel + inflow - drawn - spill;
      const oldLevel = res.waterLevel;
      res.waterLevel = Math.max(0, Math.min(res.capacity, newLevel));
      // What carries on down the river past the dam, as a share of what the
      // river brings in (the waterfalls below read it, fallState): what came
      // in less what the reservoir kept. Full, that is all of it (it goes over
      // the top); filling, only what the turbines and the spill pass through.
      if (dt > 0) {
        const out = Math.max(0, inflow - (res.waterLevel - oldLevel));
        const f = inflow > 0 ? Math.min(1, out / inflow) : 1;
        res._outFrac = res._outFrac === undefined ? f : res._outFrac + (f - res._outFrac) * Math.min(1, dt * 0.5);
      }

      // Compute turbine output: the flow it gets, times the head the
      // reservoir gives it. A reservoir held at its floor still turns its
      // turbines at 60% strength on what the river brings; a full one
      // drives them at full.
      const fillFrac = res.capacity > 0 ? res.waterLevel / res.capacity : 0;
      const fillFactor = 0.6 + 0.4 * Math.max(0, Math.min(1, (fillFrac - MIN_LEVEL_FRAC) / (1 - MIN_LEVEL_FRAC)));
      // Flow factor: one river tile turns a turbine at full speed; more
      // inflow adds a mild bonus on top (the generator itself caps at 1).
      const flowFactor = Math.min(1.2, 0.9 + 0.1 * res.inflowSources);
      // Head: a dam closing a deep valley drives its generators harder
      // (terrain_system.js). Only recomputed when the terrain changes.
      const _hv = TerrainSystem.version() * 2 + (TerrainSystem.active() ? 1 : 0);
      if (res._headVer !== _hv) { res._head = TerrainSystem.damHead(res.damCol, res.damRow); res._headVer = _hv; }
      for (const tb of activeTurbines) {
        // Force def to be a clean clone with zero power output. The turbine
        // never produces electrical power — only mechanical rotation.
        tb.def = { ...EntityDefs[T.HYDROTURBINE] };
        tb.def.powerOutput = 0; // hard guarantee
        // _rotationRate (0..1.2) is what downstream shafts/generators read.
        if (!runs(tb) || share <= 0.001) {
          tb._fuelled = false;
          tb._rotationRate = 0;
        } else {
          tb._fuelled = true;
          tb._rotationRate = fillFactor * flowFactor * share;
          tb._flowShare = share;
          tb._runtimeSec = (tb._runtimeSec || 0) + dt;
          _anyTurbineFuelledThisTick = true;
        }
        tb._fillFrac = fillFrac;
        tb._headFactor = res._head || 1;
      }
    }
    // Total runtime tracks elapsed time whenever ANY turbine anywhere is
    // actively spinning — not the max of each turbine's own counter. This
    // way replacing/moving a turbine never orphans banked progress.
    if (_anyTurbineFuelledThisTick) {
      _totalTurbineRuntime += dt;
    }
  }

  // ── Dams and the river's waterfalls ────────────────────────────────
  // A fall the reservoir has flooded is drowned: it goes as the water rises
  // over its lip (gone by FALL_DROWN_TO full) and comes back as it drops. A
  // fall downstream of a dam only gets what the dam lets through
  // (res._outFrac): a trickle while the reservoir fills with nothing drawing
  // on it, the turbines' discharge while they run, the whole river once it is
  // full and spilling. Falls above a dam, or on another stream, are left alone.
  const FALL_DROWN_FROM = 0.2, FALL_DROWN_TO = 0.6, FALL_TRICKLE = 0.05;
  let _fedKey = '', _fed = new Map();   // "c,r" -> reservoir id feeding that river tile
  function _riverFed() {
    const key = EntityRegistry.getTopologyVersion() + '|' + [...reservoirs.keys()].join(',');
    if (key === _fedKey) return _fed;
    _fedKey = key; _fed = new Map();
    for (const res of reservoirs.values()) {
      const inRes = new Set(res.tiles.map(t => _key(t.c, t.r)));
      for (const dam of EntityRegistry.getByType(T.DAM)) {
        if (dam._reservoirId !== res.id || !dam._spanTiles) continue;
        const dc = dam._flowDc || 0, dr = dam._flowDr || 0;
        if (!dc && !dr) continue;
        // Water leaves past the dam whose downstream face is not the reservoir.
        const starts = dam._spanTiles.map(t => ({ c: t.c + dc, r: t.r + dr })).filter(t => !inRes.has(_key(t.c, t.r)));
        // Spread through the channel below the dam, with the current or across
        // it but never against it: so it fills the river's width and follows
        // its bends, and doesn't climb a side stream that joins further down
        // (that one brings its own water). Until the river ends, or meets the
        // next dam or reservoir.
        const open = (e) => e && e.type === T.WATER && !(e._reservoirId !== undefined && reservoirs.has(e._reservoirId));
        const seen = new Set(), q = [];
        for (const t of starts) { const k = _key(t.c, t.r); if (!seen.has(k) && open(GridManager.getEntity(t.c, t.r))) { seen.add(k); q.push(t); } }
        for (let i = 0; i < q.length && i < 6000; i++) {
          const t = q[i], k = _key(t.c, t.r);
          if (!_fed.has(k)) _fed.set(k, res.id);
          for (const [sc, sr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = t.c + sc, nr = t.r + sr, nk = _key(nc, nr);
            if (seen.has(nk)) continue;
            const n = GridManager.getEntity(nc, nr);
            if (!open(n)) continue;
            if (sc * (n._flowDc || 0) + sr * (n._flowDr || 0) < 0) continue;   // against its current
            seen.add(nk); q.push({ c: nc, r: nr });
          }
        }
      }
    }
    return _fed;
  }
  // { flow, drown } for a waterfall made of these water tiles: flow 0..1 is
  // how much of the river goes over it, drown 0..1 how far a reservoir has
  // risen over it.
  function fallState(members) {
    let flow = 1, drown = 0;
    const fed = _riverFed();
    for (const m of members) {
      const own = m._reservoirId !== undefined ? reservoirs.get(m._reservoirId) : null;
      if (own) {
        const fill = own.capacity > 0 ? own.waterLevel / own.capacity : 0;
        const k = Math.max(0, Math.min(1, (fill - FALL_DROWN_FROM) / (FALL_DROWN_TO - FALL_DROWN_FROM)));
        drown = Math.max(drown, k * k * (3 - 2 * k));
        continue;
      }
      const res = reservoirs.get(fed.get(_key(m.col, m.row)));
      if (res) flow = Math.min(flow, Math.max(FALL_TRICKLE, res._outFrac ?? 1));
    }
    return { flow, drown };
  }
  // fallState eased on the real clock and kept on `holder`, so a fall dries
  // up or comes back over a few seconds instead of switching.
  function fallStateEased(holder, members) {
    const tgt = fallState(members), now = performance.now() / 1000;
    const s = holder._fallEase || (holder._fallEase = { flow: tgt.flow, drown: tgt.drown, at: now });
    const k = Math.min(1, Math.max(0, now - s.at) * 0.35);
    s.at = now;
    s.flow += (tgt.flow - s.flow) * k;
    s.drown += (tgt.drown - s.drown) * k;
    return s;
  }

  // ── Called when an entity is removed externally (delete tool)
  function onEntityRemoved(e) {
    if (!e) return;
    if (e.type === T.DAM) {
      // Restore river water on this dam's own tiles regardless of whether
      // it ever formed/joined a reservoir.
      if (e._spanTiles) {
        for (const t of e._spanTiles) {
          // Recreate a flowing WATER tile
          const w = new Entity(T.WATER, t.c, t.r);
          w._isRiver = true;
          w._flowDc = e._flowDc; w._flowDr = e._flowDr;
          GridManager.tiles[t.r][t.c] = w;
          EntityRegistry.add(w);
          if (typeof WaterSystem !== 'undefined' && WaterSystem._register) {
            WaterSystem._register(t.c, t.r);
          }
        }
      }
      // The dam itself is already off the grid (keep its _reservoirSide for
      // undo restore). Everything it bounded is worked out again without it:
      // a partner carries the reservoir on if it can still hold the water,
      // and a neighbouring reservoir it was walling off runs on to its next
      // boundary instead of stopping at a dam that is no longer there.
      e._reservoirId = undefined;
      _rebuildAll();
    } else if (e.type === T.HYDROTURBINE) {
      const res = reservoirs.get(e._reservoirId);
      if (res) res.turbines = res.turbines.filter(t => t !== e);
      _rejoinTurbineWater(e);
    }
  }

  // ── Put the water a turbine sat on back on the map and back into its
  //    reservoir. Every removal path (Delete tool, undo/redo, drag-move,
  //    lightning) goes through here, so the water is restored exactly once:
  //    GridManager._restoreWaterUnder fills any still-empty captured tile
  //    (idempotent — it never stacks a second water entity), then each tile
  //    is re-tagged to the reservoir it belongs to NOW. The turbine's own
  //    _reservoirId can be stale (its reservoir dissolved and re-formed
  //    under a new id while it stood there), so fall back to a live
  //    reservoir the surrounding water belongs to. With no reservoir at all
  //    the tag is cleared, so the water can join the next one that forms.
  function _rejoinTurbineWater(tb) {
    if (!tb._waterTiles || !tb._waterTiles.length) return;
    GridManager._restoreWaterUnder(tb);
    let res = reservoirs.get(tb._reservoirId) || null;
    if (!res) {
      search:
      for (const t of tb._waterTiles) {
        for (const [dc, dr] of [[0,-1],[0,1],[-1,0],[1,0]]) {
          const n = GridManager.getEntity(t.c + dc, t.r + dr);
          if (n && n.type === T.WATER && reservoirs.has(n._reservoirId)) {
            res = reservoirs.get(n._reservoirId);
            break search;
          }
        }
      }
    }
    for (const t of tb._waterTiles) {
      const w = GridManager.getEntity(t.c, t.r);
      if (!w || w.type !== T.WATER) continue;
      if (!res) { w._reservoirId = undefined; t.reservoirId = undefined; continue; }
      w._reservoirId = res.id;
      t.reservoirId = res.id;
      if (!res.tiles.some(rt => rt.c === t.c && rt.r === t.r)) {
        res.tiles.push({ c: t.c, r: t.r });
        res.capacity += TILE_CAPACITY;
      }
    }
  }

  // ── Save / load
  function save() {
    const out = [];
    for (const res of reservoirs.values()) {
      out.push({
        id: res.id,
        damCol: res.damCol, damRow: res.damRow,
        waterLevel: res.waterLevel,
        capacity:   res.capacity,
        inflowSources: res.inflowSources,
        flowDc: res.flowDc, flowDr: res.flowDr,
        tiles: res.tiles.map(t => [t.c, t.r]),
        turbines: res.turbines.map(t => [t.col, t.row]),
      });
    }
    return { nextId, reservoirs: out, totalTurbineRuntime: _totalTurbineRuntime };
  }

  function load(data) {
    reservoirs.clear();
    pendingDams.length = 0;
    nextId = 1;
    _totalTurbineRuntime = 0;
    if (!data) return;
    nextId = data.nextId || 1;
    _totalTurbineRuntime = data.totalTurbineRuntime || 0;
    for (const r of (data.reservoirs || [])) {
      const tiles = r.tiles.map(([c, ro]) => ({ c, r: ro }));
      const res = {
        id: r.id,
        damCol: r.damCol, damRow: r.damRow,
        waterLevel: r.waterLevel || 0,
        capacity:   r.capacity,
        inflowSources: r.inflowSources || 1,
        flowDc: r.flowDc, flowDr: r.flowDr,
        tiles,
        turbines: [],
      };
      reservoirs.set(res.id, res);
      // Re-tag water tiles
      for (const t of tiles) {
        const e = GridManager.getEntity(t.c, t.r);
        if (e && e.type === T.WATER) e._reservoirId = res.id;
      }
      // Re-link dam
      const dam = GridManager.getEntity(r.damCol, r.damRow);
      if (dam && dam.type === T.DAM) dam._reservoirId = res.id;
      // Re-link turbines
      for (const [c, ro] of (r.turbines || [])) {
        const tb = GridManager.getEntity(c, ro);
        if (tb && tb.type === T.HYDROTURBINE) {
          tb._reservoirId = res.id;
          res.turbines.push(tb);
        }
      }
    }
  }

  // ── Called once, after all grid entities (including dams) are restored
  //    from a save, to repopulate the pending-dams list from whichever DAM
  //    entities have no _reservoirId (their own field, restored generically
  //    by save.js — this just re-derives which ones are still awaiting a
  //    partner).
  function rebuildPendingDams() {
    pendingDams.length = 0;
    for (const dam of EntityRegistry.getByType(T.DAM)) {
      if (dam._reservoirId === undefined) pendingDams.push(dam);
    }
    _healOnLoad();
  }

  function getReservoir(id) { return reservoirs.get(id); }
  function all() { return reservoirs; }
  // What the reservoir's info panel shows (EntityInfoPanel, clicking its
  // water): how full it is, what flows in and what its turbines take out
  // (per second, at the current state), and whether it is filling or
  // draining.
  function info(id) {
    const res = reservoirs.get(id);
    if (!res) return null;
    const fill = res.capacity > 0 ? res.waterLevel / res.capacity : 0;
    const inflow = res.inflowSources * INFLOW_PER_SRC;
    let turbines = 0, running = 0, drawing = 0;
    for (const tb of res.turbines) {
      if (GridManager.getEntity(tb.col, tb.row) !== tb) continue;
      turbines++;
      if (tb._fuelled) running++;
      if (tb.powered || tb._bayFed) drawing++;
    }
    // Above the floor the turbines take their full draw; held at it, they
    // share what the river brings (see tick).
    const want = drawing * TURBINE_DRAW;
    const atFloor = res.waterLevel <= res.capacity * MIN_LEVEL_FRAC + 1;
    const draw = atFloor ? Math.min(want, inflow) : want;
    const share = want > 0 ? draw / want : 1;
    const spill = res.waterLevel >= res.capacity * 0.99 ? SPILL_RATE : 0;
    return {
      fill, level: res.waterLevel, capacity: res.capacity, tiles: res.tiles.length,
      inflow, inflowSources: res.inflowSources, draw, want, share, atFloor, spill, net: inflow - draw - spill,
      turbines, running, perTurbine: TURBINE_DRAW, minFrac: MIN_LEVEL_FRAC,
      sustainable: res.inflowSources > 0 ? Math.floor(inflow / TURBINE_DRAW) : 0,
      head: res._head || 1, damCol: res.damCol, damRow: res.damRow,
    };
  }

  return {
    buildDam, buildTurbine, canBuildTurbine, relocateTurbine, tick,
    rebuildPendingDams,
    onEntityRemoved,
    captureDamUndoState, restoreDam, flipDam, sideLabel,
    save, load,
    getReservoir, all, info,
    TURBINE_DRAW,
    findRiverSpan,
    flipTurbine, turbineOutSide,
    fallState, fallStateEased,
    hasDams: () => reservoirs.size > 0,
    getTotalTurbineRuntime: () => _totalTurbineRuntime,
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   SHAFT SYSTEM
   ─────────────────────────────────────────────────────────────────
   Shafts are 1x4 (or 4x1 when rotated) mechanical transmission lines.
   They connect to a turbine's output side on one end. Chains of shafts
   propagate the turbine's _rotationRate down the line; the open end
   of the final shaft exposes _rotationRate for a future generator.

   Each shaft tracks:
     - orientation: 'h' (1x4 horizontal) or 'v' (4x1 vertical)
     - _rotationRate: 0..1.2, set each tick by propagation
     - _sourceTurbine: the turbine driving this chain (null if disconnected)
   ═══════════════════════════════════════════════════════════════════ */
