/* ═══════════════════════════════════════════════════════════════════
   TRUCK ROUTING
   Grid-based A* pathfinder for auto-dispatched trucks. Treats solid
   entities (anything not in TruckSystem's drive-through set) as hard
   obstacles; the area within ZONE_BUFFER tiles of any residential/
   commercial/industrial/government zone rect, within WATER_BUFFER tiles
   of any water tile, and within BUILDING_BUFFER tiles of any building
   OTHER than the one actually being visited, as heavily-penalized (not
   hard-blocked) terrain — penalized rather than blocked so a destination
   that happens to sit near a zone, a lake, or another building doesn't
   become permanently unreachable. The building buffer in particular is
   what keeps the truck's fixed-size, non-rotating collision box from
   grazing (and in practice clipping) buildings it isn't actually headed
   toward.
   ═══════════════════════════════════════════════════════════════════ */
const TruckRouting = (() => {
  const ZONE_BUFFER      = 10;   // tiles — matches ZoneSystem.NEW_ZONE_DIST intent
  const ZONE_PENALTY     = 20;   // extra cost per step while inside a zone buffer
  const WATER_BUFFER      = 5;   // tiles — requested clearance from any water body
  const WATER_PENALTY     = 30;  // extra cost per step while inside the water buffer
  const BUILDING_BUFFER   = 4;   // tiles — general clearance from any building not being visited
  const BUILDING_PENALTY  = 18;  // extra cost per step while inside another building's buffer
  const BASE_MARGIN       = 30;  // minimum bbox padding around start/dest
  const MARGIN_FROM_DIST  = 0.35;// bbox padding scales with start-dest distance too
  const MAX_MARGIN_TRIES  = 5;   // margin doubles each retry before giving up on this candidate
  const MAX_APPROACH_CANDIDATES = 4; // how many approach tiles to try before giving up entirely

  // ── Zone buffer test ──────────────────────────────────────────────
  // Returns true if (col,row) falls inside any zone rect expanded by
  // ZONE_BUFFER tiles on every side. Rebuilt lazily per findPath() call
  // (zones rarely change mid-frame, and a snapshot is fine for one route).
  // A* asks this of eight neighbours per step, and walking every zone rect
  // each time was most of a route's cost, so the rects are painted into a
  // map-sized mask, kept until the rects themselves change. Off the map the
  // rects are still tested directly.
  let _zoneMask = null, _zoneSig = '';
  function _buildZoneTest() {
    const rects = [];
    if (typeof ZoneSystem === 'undefined') return () => false;
    let sig = COLS + 'x' + ROWS;
    for (const key of ['residential', 'commercial', 'industrial', 'government']) {
      for (const r of ZoneSystem.getZoneRects(key)) {
        rects.push({
          minC: r.minC - ZONE_BUFFER, maxC: r.maxC + ZONE_BUFFER,
          minR: r.minR - ZONE_BUFFER, maxR: r.maxR + ZONE_BUFFER,
        });
        sig += '|' + r.minC + ',' + r.maxC + ',' + r.minR + ',' + r.maxR;
      }
    }
    if (!rects.length) return () => false;
    if (!_zoneMask || sig !== _zoneSig) {
      _zoneMask = new Uint8Array(COLS * ROWS);
      for (const z of rects) {
        const c0 = Math.max(0, Math.ceil(z.minC)), c1 = Math.min(COLS - 1, Math.floor(z.maxC));
        for (let r = Math.max(0, Math.ceil(z.minR)); r <= Math.min(ROWS - 1, Math.floor(z.maxR)); r++)
          if (c1 >= c0) _zoneMask.fill(1, r * COLS + c0, r * COLS + c1 + 1);
      }
      _zoneSig = sig;
    }
    const mask = _zoneMask;
    return (c, r) => {
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) return mask[r * COLS + c] === 1;
      for (const z of rects) if (c >= z.minC && c <= z.maxC && r >= z.minR && r <= z.maxR) return true;
      return false;
    };
  }

  // ── Water buffer test ─────────────────────────────────────────────
  // Water bodies aren't stored as rects (just a flat per-tile set), so the
  // buffer is built with a multi-source BFS out to WATER_BUFFER rings from
  // every water tile — cheap relative to per-cell brute-force scanning
  // (11x11 isWater() calls per candidate) since each cell is only ever
  // visited once. Rebuilt lazily per findPath() call, same as the zone test.
  // The buffer only changes when water or roads do, and either of those is
  // an entity coming or going, so it is kept until the registry's topology
  // moves on. Rebuilt for every route it was ~10ms of each one on a map with
  // fifteen thousand water tiles.
  let _waterKept = null, _waterKeptTopo = -1, _waterKeptSize = -1, _waterKeptDims = '';
  function _buildWaterBufferTest() {
    if (typeof WaterSystem === 'undefined' || typeof WaterSystem.getWaterTiles !== 'function') return () => false;
    const waterTiles = WaterSystem.getWaterTiles();
    if (!waterTiles || waterTiles.size === 0) return () => false;
    const topo = EntityRegistry.getDriveVersion(), dims = COLS + 'x' + ROWS;
    if (!_waterKept || topo !== _waterKeptTopo || waterTiles.size !== _waterKeptSize || dims !== _waterKeptDims) {
      _waterKept = _waterBuffer(waterTiles);
      _waterKeptTopo = topo; _waterKeptSize = waterTiles.size; _waterKeptDims = dims;
    }
    const buffered = _waterKept;
    return (c, r) => !!buffered[r * COLS + c];
  }
  function _waterBuffer(waterTiles) {
    // Flat typed array indexed by row*COLS+col — this predicate gets called
    // millions of times during a long A* search, so a string-keyed Set
    // (allocating a template-string key per lookup) was measurably the
    // dominant cost on cross-map routes; plain arithmetic + array access
    // is orders of magnitude cheaper.
    const buffered = new Uint8Array(COLS * ROWS);
    let frontier = [];
    for (const key of waterTiles) {
      const comma = key.indexOf(',');
      const c = +key.slice(0, comma), r = +key.slice(comma + 1);
      if (!GridManager.inBounds(c, r)) continue;
      const idx = r * COLS + c;
      if (buffered[idx]) continue;
      buffered[idx] = 1;
      frontier.push(idx);
    }
    for (let depth = 0; depth < WATER_BUFFER && frontier.length; depth++) {
      const next = [];
      for (const idx of frontier) {
        const c = idx % COLS, r = (idx / COLS) | 0;
        if (c + 1 < COLS) { const ni = idx + 1;    if (!buffered[ni]) { buffered[ni] = 1; next.push(ni); } }
        if (c - 1 >= 0)   { const ni = idx - 1;    if (!buffered[ni]) { buffered[ni] = 1; next.push(ni); } }
        if (r + 1 < ROWS) { const ni = idx + COLS; if (!buffered[ni]) { buffered[ni] = 1; next.push(ni); } }
        if (r - 1 >= 0)   { const ni = idx - COLS; if (!buffered[ni]) { buffered[ni] = 1; next.push(ni); } }
      }
      frontier = next;
    }
    // Roads are where trucks are meant to be, and a bridge is a road over
    // the water: no shoreline penalty on them, or routes would avoid the
    // very bridges built to carry them (water_build.js).
    // On a bridge, though, the outer tile either side is truss and open
    // water beyond the deck: it keeps the penalty, so trucks drive the deck.
    for (const rd of EntityRegistry.getByType(T.ROAD)) {
      const vertDeck = ((rd._rotation || 0) % 2) === 0;
      for (let r = Math.max(0, rd.row); r < Math.min(ROWS, rd.row + rd.height); r++)
        for (let c = Math.max(0, rd.col); c < Math.min(COLS, rd.col + rd.width); c++) {
          const edge = rd._bridge && (vertDeck ? (c === rd.col || c === rd.col + rd.width - 1)
                                               : (r === rd.row || r === rd.row + rd.height - 1));
          buffered[r * COLS + c] = edge ? 1 : 0;
        }
    }
    return buffered;
  }

  // Tiles a truck has recently wedged on (TruckSystem records them, see
  // findPath's `wedges`), treated as solid for the one search in progress so
  // the reroute can't hand back the same line that just trapped it.
  let _wedged = null;   // Set of row*COLS+col, or null
  function _isBlocked(col, row) {
    if (_wedged && _wedged.has(row * COLS + col)) return true;
    const ent = GridManager.getEntity(col, row);
    if (!ent) return false;
    if (ent._bridge) return WaterBuild.railAt(ent, col, row);   // a bridge's truss edge is solid
    return !TruckSystem.isPassthrough(ent.type);
  }

  // Route tiles are the truck's CENTRE, but its collision box is 1×3 and
  // never rotates: centred on (col,row) it covers rows row-1..row+1. Testing
  // only the centre tile let routes squeeze through gaps — and stop at
  // approach tiles — where the real body hits a building, so the truck
  // wedged, backed out, rerouted to the same spot and eventually gave up.
  function _truckBlocked(col, row) {
    return _isBlocked(col, row) || _isBlocked(col, row - 1) || _isBlocked(col, row + 1);
  }

  // A tile the box fits on only flush between solid things on both sides: a
  // one-tile gap between two buildings (with solid either side of the body's
  // rows), or a corridor exactly three tiles tall. The truck is steered, not
  // placed, and never sits exactly on a tile's centre line, so it clips one
  // side or the other and wedges. A Waste Truck routed up the single-tile
  // belt gap between two Coal Generators drove in, stuck, backed out, was
  // given the same route, and shuttled there until its tank ran dry.
  function _truckSlot(col, row) {
    return (_truckBlocked(col - 1, row) && _truckBlocked(col + 1, row))
        || (_isBlocked(col, row - 2) && _isBlocked(col, row + 2));
  }

  // _isBlocked for every tile of a search box, and the rows just above and
  // below it, read once. A* asks _truckBlocked of up to sixteen tiles per
  // step (three grid reads each) and the building buffer asks of every tile
  // in the box: both read this instead. The grid can't change during a
  // search, so the answers are the same.
  // (_isBlocked inlined: the grid's rows read directly, and the drive-through
  // test asked once per entity type rather than once per tile.)
  function _blockedGrid(box) {
    const w = box.maxC - box.minC + 1, h = box.maxR - box.minR + 3;
    const a = new Uint8Array(w * h);
    const tiles = GridManager.tiles, solid = new Map();
    let i = 0;
    for (let r = box.minR - 1; r <= box.maxR + 1; r++) {
      const row = r >= 0 && r < ROWS ? tiles[r] : null;
      if (!row) { i += w; continue; }
      for (let c = box.minC; c <= box.maxC; c++, i++) {
        if (_wedged && _wedged.has(r * COLS + c)) { a[i] = 1; continue; }
        const ent = row[c];   // the box's columns are always on the map
        if (!ent) continue;
        if (ent._bridge) { if (WaterBuild.railAt(ent, c, r)) a[i] = 1; continue; }
        let s = solid.get(ent.type);
        if (s === undefined) solid.set(ent.type, s = !TruckSystem.isPassthrough(ent.type));
        if (s) a[i] = 1;
      }
    }
    return { a, w, minC: box.minC, maxC: box.maxC, minR: box.minR, maxR: box.maxR };
  }
  // _truckBlocked(c, r), from the grid wherever it covers the tile.
  function _truckBlockedIn(B, c, r) {
    if (c < B.minC || c > B.maxC || r < B.minR || r > B.maxR) return _truckBlocked(c, r);
    const i = (r - B.minR + 1) * B.w + (c - B.minC);
    return B.a[i] === 1 || B.a[i - B.w] === 1 || B.a[i + B.w] === 1;
  }

  // ── Building clearance buffer (box-scoped) ────────────────────────
  // Every building EXCEPT destEntity radiates a BUILDING_BUFFER-tile buffer
  // of penalized terrain — the truck's collision box doesn't rotate with
  // its sprite, so grazing a building's corner in practice means clipping
  // it, and a general "keep your distance" rule cuts that off at the
  // source instead of relying solely on stuck-detection to recover after
  // the fact. destEntity's own footprint is excluded from seeding so the
  // approach to the actual target isn't penalized against itself.
  // Scoped to the current search box (rebuilt per attempt) rather than
  // computed map-wide — seeding requires scanning every cell in range, and
  // most routes only need a small local window, not the full 1170x700 map.
  let _bbQ = null;
  function _buildBuildingBufferTest(box, destEntity, startC, startR, B) {
    const w = box.maxC - box.minC + 1;
    const h = box.maxR - box.minR + 1;
    const idx = (c, r) => (r - box.minR) * w + (c - box.minC);
    const buffered = new Uint8Array(w * h);
    const dc0 = destEntity ? destEntity.col : null;
    const dr0 = destEntity ? destEntity.row : null;
    const dw  = destEntity ? (destEntity.width  || 1) : 0;
    const dh  = destEntity ? (destEntity.height || 1) : 0;
    // One queue for the whole flood, ring after ring (a cell joins it once).
    if (!_bbQ || _bbQ.length < w * h) _bbQ = new Int32Array(w * h);
    const q = _bbQ;
    let qn = 0;
    const a = B ? B.a : null;
    for (let r = box.minR, i = 0; r <= box.maxR; r++) {
      const destRow = destEntity && r >= dr0 && r < dr0 + dh;
      for (let c = box.minC; c <= box.maxC; c++, i++) {
        if (destRow && c >= dc0 && c < dc0 + dw) continue;
        if (a ? a[i + w] !== 1 : !_isBlocked(c, r)) continue;   // B's row r is one down
        buffered[i] = 1;
        q[qn++] = i;
      }
    }
    let head = 0;
    for (let depth = 0; depth < BUILDING_BUFFER && head < qn; depth++) {
      const end = qn;
      for (; head < end; head++) {
        const i = q[head];
        const c = (i % w) + box.minC, r = ((i / w) | 0) + box.minR;
        if (c + 1 <= box.maxC) { const ni = i + 1; if (!buffered[ni]) { buffered[ni] = 1; q[qn++] = ni; } }
        if (c - 1 >= box.minC) { const ni = i - 1; if (!buffered[ni]) { buffered[ni] = 1; q[qn++] = ni; } }
        if (r + 1 <= box.maxR) { const ni = i + w; if (!buffered[ni]) { buffered[ni] = 1; q[qn++] = ni; } }
        if (r - 1 >= box.minR) { const ni = i - w; if (!buffered[ni]) { buffered[ni] = 1; q[qn++] = ni; } }
      }
    }
    // Forgive the buffer within BUILDING_BUFFER tiles of the truck's own
    // starting position — a leg very often starts right next to whatever
    // building the PREVIOUS leg just visited, which is now "just another
    // building" as far as this buffer is concerned. Without this, the start
    // point sits inside a penalized zone with no way to leave it: A*
    // zigzags out at minimum cost, and the line-of-sight simplification
    // pass rejects nearly every straight segment near the start (each one
    // grazes back through the same buffer while escaping it), so the raw
    // zigzag survives ungrouped as several tightly-packed waypoints —
    // visually the truck spinning in place before actually setting off.
    if (startC != null && startR != null) {
      for (let r = Math.max(box.minR, startR - BUILDING_BUFFER); r <= Math.min(box.maxR, startR + BUILDING_BUFFER); r++) {
        for (let c = Math.max(box.minC, startC - BUILDING_BUFFER); c <= Math.min(box.maxC, startC + BUILDING_BUFFER); c++) {
          buffered[idx(c, r)] = 0;
        }
      }
    }
    return (c, r) => {
      if (c < box.minC || c > box.maxC || r < box.minR || r > box.maxR) return false;
      return !!buffered[idx(c, r)];
    };
  }

  const NEIGHBOURS = [
    { dc: 1,  dr: 0,  cost: 1 },
    { dc: -1, dr: 0,  cost: 1 },
    { dc: 0,  dr: 1,  cost: 1 },
    { dc: 0,  dr: -1, cost: 1 },
    { dc: 1,  dr: 1,  cost: Math.SQRT2 },
    { dc: 1,  dr: -1, cost: Math.SQRT2 },
    { dc: -1, dr: 1,  cost: Math.SQRT2 },
    { dc: -1, dr: -1, cost: Math.SQRT2 },
  ];

  // A* over a bounded col/row box. Returns array of {col,row} tile path
  // (inclusive of start & goal), or null if unreachable within the box
  // (or the box is too large to fully search within maxIter).
  //
  // Scores, parents and the visited set live in typed arrays indexed by the
  // box cell, and the open list is a binary min-heap on f held in three
  // parallel arrays. It sifts exactly as the object heap it replaced did, so
  // ties break the same way and the route found is the same one. Maps, Sets
  // and an object per heap entry made a cross-map route 40-200ms, all of it
  // inside one logic tick (an auto-hauler setting off was a visible hitch).
  // B: the box's _blockedGrid.
  //
  // Each cell's blocked flag is read off B into a box-sized array up front,
  // and its zone / water / building penalties are worked out the first time
  // the search reaches it and kept (bits 1/2/4, 8 = known): a cell is a
  // neighbour of up to eight others, and asking the three tests afresh every
  // time was most of a cross-map route. The tests are pure, so the costs and
  // the route are exactly what they were.
  //
  // hw weights the heuristic (1 = plain A*, the shortest route). Above 1 the
  // search heads for the goal far more directly and the route may cost up to
  // hw times the best one — still penalty-aware, unlike _bfsFallback.
  // _astarCapped: the last search gave up at maxIter rather than running out
  // of cells (so a bigger budget, not a different box, is what it lacked).
  let _asG = null, _asFrom = null, _asSeen = null, _asBlk = null, _asPen = null;
  let _astarCapped = false;
  function _astar(startC, startR, goalC, goalR, box, avoid, maxIter, B, hw = 1) {
    _astarCapped = false;
    const w = box.maxC - box.minC + 1, cells = w * (box.maxR - box.minR + 1);
    const idx = (c, r) => (r - box.minR) * w + (c - box.minC);
    if (!_asG || _asG.length < cells) {
      _asG = new Float64Array(cells); _asFrom = new Int32Array(cells); _asSeen = new Uint8Array(cells);
      _asBlk = new Uint8Array(cells); _asPen = new Uint8Array(cells);
    }
    const g = _asG, from = _asFrom, seen = _asSeen, blk = _asBlk, pen = _asPen;
    g.fill(Infinity, 0, cells); from.fill(-1, 0, cells); seen.fill(0, 0, cells); pen.fill(0, 0, cells);
    // _truckBlocked for every cell of the box. B holds a row either side of
    // the box, so a cell's own row in it is one down: _truckBlockedIn.
    if (B) {
      const a = B.a, w2 = w * 2;
      for (let k = 0; k < cells; k++) blk[k] = a[k + w] | a[k] | a[k + w2];
    } else {
      for (let k = 0; k < cells; k++) blk[k] = _truckBlocked(box.minC + k % w, box.minR + ((k / w) | 0)) ? 1 : 0;
    }
    // Slots the box only fits flush into (_truckSlot) are closed too, worked
    // out from the plain blocked flags before any slot is marked. Bit 2 marks
    // them so the pass doesn't read its own output. The start tile stays open
    // (a truck already standing in one has to be able to leave it).
    {
      const raw =(c, r) => (r >= box.minR - 1 && r <= box.maxR + 1 && B) ? B.a[(r - box.minR + 1) * w + (c - box.minC)] === 1 : _isBlocked(c, r);
      for (let k = 0; k < cells; k++) {
        if (blk[k] & 1) continue;
        const c = box.minC + k % w, r = box.minR + ((k / w) | 0);
        const left  = c > box.minC ? (blk[k - 1] & 1) === 1 : _truckBlocked(c - 1, r);
        const right = c < box.maxC ? (blk[k + 1] & 1) === 1 : _truckBlocked(c + 1, r);
        if ((left && right) || (raw(c, r - 2) && raw(c, r + 2))) blk[k] |= 2;
      }
      for (let k = 0; k < cells; k++) if (blk[k] & 2) blk[k] = 1;
    }
    blk[idx(startC, startR)] = 0;

    // The heap: hf[i] its f, hc/hr the tile.
    const hf = [], hc = [], hr = [];
    const push = (c, r, f) => {
      hf.push(f); hc.push(c); hr.push(r);
      let i = hf.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (hf[p] <= hf[i]) break;
        let t = hf[p]; hf[p] = hf[i]; hf[i] = t;
        t = hc[p]; hc[p] = hc[i]; hc[i] = t;
        t = hr[p]; hr[p] = hr[i]; hr[i] = t;
        i = p;
      }
    };
    let popC = 0, popR = 0;
    const pop = () => {
      popC = hc[0]; popR = hr[0];
      const lf = hf.pop(), lc = hc.pop(), lr = hr.pop();
      const n = hf.length;
      if (n) {
        hf[0] = lf; hc[0] = lc; hr[0] = lr;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = i * 2 + 2;
          let s = i;
          if (l < n && hf[l] < hf[s]) s = l;
          if (r < n && hf[r] < hf[s]) s = r;
          if (s === i) break;
          let t = hf[i]; hf[i] = hf[s]; hf[s] = t;
          t = hc[i]; hc[i] = hc[s]; hc[s] = t;
          t = hr[i]; hr[i] = hr[s]; hr[s] = t;
          i = s;
        }
      }
    };

    g[idx(startC, startR)] = 0;
    push(startC, startR, hw * _heuristic(startC, startR, goalC, goalR));
    let iterations = 0;

    while (hf.length) {
      if (++iterations > maxIter) { _astarCapped = true; return null; }
      pop();
      const cc0 = popC, cr0 = popR;
      const curKey = idx(cc0, cr0);
      if (seen[curKey]) continue;
      seen[curKey] = 1;

      if (cc0 === goalC && cr0 === goalR) {
        // Reconstruct
        const path = [];
        let k = curKey;
        while (k !== -1) {
          path.push({ col: box.minC + k % w, row: box.minR + ((k / w) | 0) });
          k = from[k];
        }
        path.reverse();
        return path;
      }

      const curG = g[curKey];
      for (let ni = 0; ni < 8; ni++) {
        const n = NEIGHBOURS[ni];
        const nc = cc0 + n.dc, nr = cr0 + n.dr;
        // (The box never reaches past the map's edges, so all of it is in bounds.)
        if (nc < box.minC || nc > box.maxC || nr < box.minR || nr > box.maxR) continue;
        const nKey = curKey + n.dr * w + n.dc;
        const isGoal = nc === goalC && nr === goalR;
        if (blk[nKey] === 1 && !isGoal) continue;
        // Disallow cutting diagonally between two blocked orthogonal cells
        if (n.dc !== 0 && n.dr !== 0) {
          if (blk[curKey + n.dc] === 1 || blk[curKey + n.dr * w] === 1) continue;
        }
        let p = pen[nKey];
        if (p === 0) {
          p = 8 | (avoid.zone(nc, nr) ? 1 : 0) | (avoid.water(nc, nr) ? 2 : 0) | (avoid.building(nc, nr) ? 4 : 0);
          pen[nKey] = p;
        }
        let stepCost = n.cost;
        if (p & 1) stepCost += ZONE_PENALTY;
        if (p & 2) stepCost += WATER_PENALTY;
        if (!isGoal && (p & 4)) stepCost += BUILDING_PENALTY;
        const tentativeG = curG + stepCost;
        if (seen[nKey]) continue;
        if (tentativeG < g[nKey]) {
          g[nKey] = tentativeG;
          from[nKey] = curKey;
          push(nc, nr, tentativeG + hw * _heuristic(nc, nr, goalC, goalR));
        }
      }
    }
    return null;
  }

  function _heuristic(c0, r0, c1, r1) {
    const dc = Math.abs(c1 - c0), dr = Math.abs(r1 - r0);
    // Octile distance — admissible for 8-directional movement.
    return (dc + dr) + (Math.SQRT2 - 2) * Math.min(dc, dr);
  }

  // Free (unblocked, in-bounds) tiles on the rings 1 and 2 tiles outside an
  // entity's footprint — ring 2 is included because HaulSystem/GasStationSystem
  // trigger on edge-distance <= 2 tiles, so it's a perfectly valid stopping
  // point and matters when every ring-1 tile happens to be boxed in by other
  // structures (common in dense factory layouts). Returned nearest-first so
  // callers can try several before giving up on a destination entirely.
  function _approachCandidates(entity, fromC, fromR, exclude) {
    const w = entity.width || 1, h = entity.height || 1;
    const raw = [];
    for (const dist of [1, 2]) {
      for (let c = entity.col - dist; c <= entity.col + w - 1 + dist; c++) {
        raw.push({ c, r: entity.row - dist });
        raw.push({ c, r: entity.row + h - 1 + dist });
      }
      for (let r = entity.row - dist + 1; r <= entity.row + h - 1 + dist - 1; r++) {
        raw.push({ c: entity.col - dist, r });
        raw.push({ c: entity.col + w - 1 + dist, r });
      }
    }
    const seen = new Set();
    const valid = [];
    for (const cand of raw) {
      if (!GridManager.inBounds(cand.c, cand.r)) continue;
      if (_truckBlocked(cand.c, cand.r)) continue;
      const key = `${cand.c},${cand.r}`;
      if (seen.has(key)) continue;
      seen.add(key);
      valid.push(cand);
    }
    // A stop the truck only fits flush into (_truckSlot) is a last choice:
    // it can be reached as the goal, but the truck tends to wedge getting in.
    for (const v of valid) v.slot = _truckSlot(v.c, v.r) ? 1 : 0;
    valid.sort((a, b) => (a.slot - b.slot) || (Math.hypot(a.c - fromC, a.r - fromR) - Math.hypot(b.c - fromC, b.r - fromR)));
    // Spots a previous attempt on this leg got stuck reaching go to the back
    // rather than being dropped, so a truck that has failed every side still
    // has something to try instead of reporting no route.
    if (exclude && exclude.length) {
      const bad = new Set(exclude);
      return [...valid.filter(v => !bad.has(`${v.c},${v.r}`)), ...valid.filter(v => bad.has(`${v.c},${v.r}`))];
    }
    return valid;
  }

  // Line-of-sight check for collapsing a run of route tiles into one straight
  // leg: true if the truck can drive the straight line between the two tile
  // centres. The whole 1×3 box is swept along it, not just the tile under its
  // centre: on a slanting line the box straddles two columns, and a Bresenham
  // walk of the centre let a leg shave a building's corner (or thread a gap)
  // the box can't, which is where trucks wedged. Tiles the line's centre
  // crosses must also be outside the zone/water/building buffers (keeps
  // simplified legs off wall corners the way the A* search itself is biased
  // away from them), and clear of slots (_truckSlot) the search wouldn't use.
  function _clearLine(c0, r0, c1, r1, avoid) {
    const x0 = c0 + 0.5, y0 = r0 + 0.5, dx = c1 - c0, dy = r1 - r0;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 4));
    const E = 1e-6;
    let lastC = null, lastR = null;
    for (let i = 0; i <= n; i++) {
      const x = x0 + dx * i / n, y = y0 + dy * i / n;
      for (let c = Math.floor(x - 0.5 + E); c <= Math.floor(x + 0.5 - E); c++)
        for (let r = Math.floor(y - 1.5 + E); r <= Math.floor(y + 1.5 - E); r++)
          if (_isBlocked(c, r)) return false;
      const c = Math.floor(x), r = Math.floor(y);
      if (c === lastC && r === lastR) continue;
      lastC = c; lastR = r;
      const isEndpoint = (c === c0 && r === r0) || (c === c1 && r === r1);
      if (avoid.zone(c, r) || avoid.water(c, r)) return false;
      if (!isEndpoint && (avoid.building(c, r) || _truckSlot(c, r))) return false;
    }
    return true;
  }

  // Collapse a raw grid path into far fewer waypoints by greedily
  // extending straight-line runs as far as line-of-sight allows.
  function _simplify(tilePath, avoid) {
    if (tilePath.length <= 2) return tilePath;
    const out = [tilePath[0]];
    let anchor = 0;
    for (let i = 1; i < tilePath.length; i++) {
      const a = tilePath[anchor], b = tilePath[i];
      if (!_clearLine(a.col, a.row, b.col, b.row, avoid)) {
        out.push(tilePath[i - 1]);
        anchor = i - 1;
      }
    }
    out.push(tilePath[tilePath.length - 1]);
    return out;
  }

  function _tileCenter(t) {
    return { wx: t.col * TILE + TILE / 2, wy: t.row * TILE + TILE / 2 };
  }

  // Tries increasingly large search boxes around (startC,startR)-(goalC,goalR)
  // — scaled to the distance between them so nearby destinations resolve fast
  // and far-off ones still get enough room to detour — then finally the whole
  // map as a last resort. The building buffer is box-scoped and rebuilt per
  // attempt (it depends on the box), unlike zone/water which are global and
  // passed in via baseAvoid. Returns { tilePath, avoid } (avoid included so
  // the caller can reuse the same building buffer for simplification) or null.
  //
  // _searchCapped: every attempt of the last call gave up at its iteration
  // budget. Then the route isn't missing, just expensive (a long haul whose
  // straight line runs through buffered ground), and another approach tile
  // of the same building would cap out the same way.
  let _searchCapped = false;
  function _searchWithRetries(startC, startR, goalC, goalR, baseAvoid, destEntity, allowFullMap) {
    const dist = Math.hypot(goalC - startC, goalR - startR);
    let margin = Math.max(BASE_MARGIN, Math.round(dist * MARGIN_FROM_DIST));
    const fullMapCells = COLS * ROWS;
    let capped = true;
    _searchCapped = false; _astarCapped = false;
    for (let attempt = 0; attempt < MAX_MARGIN_TRIES; attempt++) {
      const box = {
        minC: Math.max(0, Math.min(startC, goalC) - margin),
        maxC: Math.min(COLS - 1, Math.max(startC, goalC) + margin),
        minR: Math.max(0, Math.min(startR, goalR) - margin),
        maxR: Math.min(ROWS - 1, Math.max(startR, goalR) + margin),
      };
      const boxCells = (box.maxC - box.minC + 1) * (box.maxR - box.minR + 1);
      // Once the box covers most of the map, the full-map attempt below
      // is the same search with a bigger budget: go straight to it.
      if (allowFullMap && boxCells >= fullMapCells * 0.8) break;
      const B = _blockedGrid(box);
      const avoid = { ...baseAvoid, building: _buildBuildingBufferTest(box, destEntity, startC, startR, B) };
      const tilePath = _astar(startC, startR, goalC, goalR, box, avoid, Math.min(300000, boxCells * 3), B);
      if (tilePath) return { tilePath, avoid };
      capped = capped && _astarCapped;
      // Out of budget rather than out of box: a bigger box with the same
      // budget gives up the same way, so skip to the full-map search.
      if (_astarCapped) break;
      // Once the box already covers most of the map, doubling the margin
      // further barely changes it (clamped at the map edges) — retrying
      // just re-runs a near-identical search and burns time for nothing.
      if (boxCells >= fullMapCells * 0.8) break;
      margin *= 2;
    }
    if (allowFullMap) {
      const box = { minC: 0, maxC: COLS - 1, minR: 0, maxR: ROWS - 1 };
      const B = _blockedGrid(box);
      const avoid = { ...baseAvoid, building: _buildBuildingBufferTest(box, destEntity, startC, startR, B) };
      // Plain A* floods everything cheaper than the best route, which on a
      // long haul across buffered ground is most of the map: over a second
      // of searching, all in one tick, and it still ran out of budget. Once
      // a search has run out of budget (not out of map), head straight for
      // the goal instead: a fraction of the work, and the route still keeps
      // clear of buildings, which the penalty-blind _bfsFallback does not.
      let tilePath = null;
      if (!_astarCapped) tilePath = _astar(startC, startR, goalC, goalR, box, avoid, 400000, B);
      if (!tilePath && _astarCapped) tilePath = _astar(startC, startR, goalC, goalR, box, avoid, 400000, B, 3);
      if (tilePath) return { tilePath, avoid };
      capped = capped && _astarCapped;
    }
    _searchCapped = capped;
    return null;
  }

  // Last-resort guarantee: plain multi-target BFS over the ENTIRE map,
  // ignoring zone/water/building penalties and box/iteration budgets
  // entirely — the only thing that stops it is a hard-blocked entity.
  // The penalty-aware A* passes above can fail to find a route that
  // genuinely exists (a box too small, an iteration cap hit on a huge
  // map, or every approach candidate sitting in a heavily-penalized
  // pocket that starves the heap) even though the destination is
  // perfectly reachable by *some* path. Since PASSTHROUGH tiles are the
  // only thing a truck can't drive over, any tile reachable at all is
  // reachable via BFS in O(COLS*ROWS) — this is what makes "no route
  // found" essentially never legitimate on a connected map. Returns a
  // raw (unsimplified) tile path to whichever candidate is closest by
  // BFS distance, or null only if truly disconnected (a sealed-off
  // island of terrain).
  // When every way to the destination goes through at least one slot
  // (_truckSlot): the whole-map search again, with slots allowed but each
  // slot tile costing SLOT_PENALTY steps, so the route uses only the slots it
  // has to. A plain BFS here took the shortest line, slots and all: a truck
  // whose only tight squeeze was a city street hundreds of tiles away was
  // still sent up the belt gap between two generators beside it.
  const SLOT_PENALTY = 60;
  function _slotFallback(startC, startR, candidates) {
    const N = COLS * ROWS, targets = new Set(candidates.map(c => c.r * COLS + c.c));
    const start = startR * COLS + startC;
    if (targets.has(start)) return [{ col: startC, row: startR }];
    const dist = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1);
    const hf = [], hi = [];
    const push = (i, f) => {
      hf.push(f); hi.push(i);
      let k = hf.length - 1;
      while (k > 0) { const p = (k - 1) >> 1; if (hf[p] <= hf[k]) break; [hf[p], hf[k]] = [hf[k], hf[p]]; [hi[p], hi[k]] = [hi[k], hi[p]]; k = p; }
    };
    const pop = () => {
      const top = hi[0], lf = hf.pop(), li = hi.pop(), n = hf.length;
      if (n) {
        hf[0] = lf; hi[0] = li;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1, r = l + 1; let s = k;
          if (l < n && hf[l] < hf[s]) s = l;
          if (r < n && hf[r] < hf[s]) s = r;
          if (s === k) break;
          [hf[s], hf[k]] = [hf[k], hf[s]]; [hi[s], hi[k]] = [hi[k], hi[s]]; k = s;
        }
      }
      return top;
    };
    dist[start] = 0; push(start, 0);
    const done = new Uint8Array(N);
    // Each tile's _truckBlocked / _truckSlot, worked out once (bits: 1 known,
    // 2 blocked, 4 slot); a tile is asked about by up to eight neighbours.
    const info = new Uint8Array(N);
    const tile = (c, r) => {
      const i = r * COLS + c;
      let v = info[i];
      if (!v) { v = 1 | (_truckBlocked(c, r) ? 2 : 0); if (!(v & 2) && _truckSlot(c, r)) v |= 4; info[i] = v; }
      return v;
    };
    while (hf.length) {
      const f = hf[0], idx = pop();
      if (done[idx]) continue;
      done[idx] = 1;
      if (targets.has(idx)) {
        const path = [];
        for (let k = idx; k !== -1; k = from[k]) path.push({ col: k % COLS, row: (k / COLS) | 0 });
        return path.reverse();
      }
      const c = idx % COLS, r = (idx / COLS) | 0;
      for (const n of NEIGHBOURS) {
        const nc = c + n.dc, nr = r + n.dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
        const nIdx = nr * COLS + nc;
        if (done[nIdx]) continue;
        if (n.dc !== 0 && n.dr !== 0 && ((tile(c + n.dc, r) & 2) || (tile(c, r + n.dr) & 2))) continue;
        const isTarget = targets.has(nIdx), v = tile(nc, nr);
        if ((v & 2) && !isTarget) continue;
        const g = f + n.cost + (!isTarget && (v & 4) ? SLOT_PENALTY : 0);
        if (g < dist[nIdx]) { dist[nIdx] = g; from[nIdx] = idx; push(nIdx, g); }
      }
    }
    return null;
  }

  // `strict` also keeps out of slots (_truckSlot); findPath tries that first
  // and only takes a route through one when there is no other way at all.
  function _bfsFallback(startC, startR, candidates, strict) {
    const targets = new Set(candidates.map(c => `${c.c},${c.r}`));
    if (targets.has(`${startC},${startR}`)) return [{ col: startC, row: startR }];

    const visited = new Uint8Array(COLS * ROWS);
    const cameFrom = new Int32Array(COLS * ROWS).fill(-1);
    const startIdx = startR * COLS + startC;
    visited[startIdx] = 1;
    let frontier = [startIdx];

    while (frontier.length) {
      const next = [];
      for (const idx of frontier) {
        const c = idx % COLS, r = (idx / COLS) | 0;
        for (const n of NEIGHBOURS) {
          const nc = c + n.dc, nr = r + n.dr;
          if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
          const nIdx = nr * COLS + nc;
          if (visited[nIdx]) continue;
          if (n.dc !== 0 && n.dr !== 0 && (_truckBlocked(c + n.dc, r) || _truckBlocked(c, r + n.dr))) continue;
          const isTarget = targets.has(`${nc},${nr}`);
          if ((_truckBlocked(nc, nr) || (strict && _truckSlot(nc, nr))) && !isTarget) continue;
          visited[nIdx] = 1;
          cameFrom[nIdx] = idx;
          if (isTarget) {
            const path = [];
            let k = nIdx;
            while (k !== -1) {
              path.push({ col: k % COLS, row: (k / COLS) | 0 });
              k = cameFrom[k];
            }
            path.reverse();
            return path;
          }
          next.push(nIdx);
        }
      }
      frontier = next;
    }
    return null;
  }

  // Whether water is what stands between a truck and destEntity: a call made
  // after findPath came back with nothing (so no route exists at all). The
  // same whole-map search, with open water counted as ground: if the
  // destination is reachable that way, a bridge would get the truck there.
  // Bridge decks are already roads, so they are driven either way.
  function acrossWater(fromWx, fromWy, destEntity) {
    return _floodReach(fromWx, fromWy, destEntity, true);
  }
  // Whether destEntity can be driven to at all: the same flood, water solid.
  // A quick yes/no for choosing between destinations. findPath reaching the
  // same verdict on a cut-off target searched for seconds on a big map,
  // where this flood takes a fraction of that.
  function landReachable(fromWx, fromWy, destEntity) {
    return _floodReach(fromWx, fromWy, destEntity, false);
  }
  function _floodReach(fromWx, fromWy, destEntity, waterOk) {
    if (!destEntity) return false;
    const isWater = (c, r) => { const e = GridManager.getEntity(c, r); return !!e && e.type === T.WATER; };
    const dry = (c, r) => !GridManager.inBounds(c, r) || (waterOk && isWater(c, r)) || !_isBlocked(c, r);
    const fits = (c, r) => dry(c, r) && dry(c, r - 1) && dry(c, r + 1);
    const startC = Math.max(0, Math.min(COLS - 1, Math.floor(fromWx / TILE)));
    const startR = Math.max(0, Math.min(ROWS - 1, Math.floor(fromWy / TILE)));
    const goals = new Set(_approachCandidates(destEntity, startC, startR, null).map(c => c.r * COLS + c.c));
    if (!goals.size) return false;
    const seen = new Uint8Array(COLS * ROWS), q = new Int32Array(COLS * ROWS);
    let head = 0, tail = 0;
    seen[startR * COLS + startC] = 1; q[tail++] = startR * COLS + startC;
    while (head < tail) {
      const i = q[head++];
      if (goals.has(i)) return true;
      const c = i % COLS, r = (i / COLS) | 0;
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const n = nr * COLS + nc;
        if (seen[n]) continue;
        seen[n] = 1;
        if (goals.has(n) || fits(nc, nr)) q[tail++] = n;
      }
    }
    return false;
  }

  return {
    acrossWater,
    landReachable,
    // Finds a route from a world position to a free tile adjacent to
    // destEntity's footprint. Returns an array of {wx,wy} waypoints
    // (tile-center based, simplified), or null if no route was found.
    //
    // `avoidApproaches` is an optional list of "col,row" approach tiles the
    // truck already got stuck trying to reach on this leg — they're tried
    // last, so a reroute heads for a different side of the building.
    //
    // `wedges` is an optional list of { c, r } tiles the truck has recently
    // got wedged on; they count as solid for this search. Only as a
    // preference, though: if routing round them leaves no way there at all,
    // the search is run again without them. A truck held up on a bridge (by
    // another truck coming the other way) wedged on the only crossing, and
    // for the next two minutes every route over the river failed. The truck
    // was halted and a "build a bridge" card raised beside the bridge it had
    // used for hours.
    findPath(fromWx, fromWy, destEntity, avoidApproaches, wedges) {
      if (!destEntity) return null;
      if (wedges && wedges.length) {
        _wedged = new Set(wedges.map(w => w.r * COLS + w.c));
        let path;
        try { path = this._findPath(fromWx, fromWy, destEntity, avoidApproaches); }
        finally { _wedged = null; }
        if (path) return path;
      }
      return this._findPath(fromWx, fromWy, destEntity, avoidApproaches);
    },
    _findPath(fromWx, fromWy, destEntity, avoidApproaches) {
      let startC = Math.max(0, Math.min(COLS - 1, Math.floor(fromWx / TILE)));
      let startR = Math.max(0, Math.min(ROWS - 1, Math.floor(fromWy / TILE)));
      // A truck that loaded in a tight spot can be standing where its own
      // box does not fit (the tile above or below it is a building). Every
      // search from there failed at the first step and the leg was reported
      // as "no route". Start from the nearest tile it does fit on, within
      // three; it drives the tile or two across to pick the route up.
      if (_truckBlocked(startC, startR)) {
        let best = null, bd = Infinity;
        for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) {
          const c = startC + dc, r = startR + dr, d = Math.hypot(c + 0.5 - fromWx / TILE, r + 0.5 - fromWy / TILE);
          if (d < bd && GridManager.inBounds(c, r) && !_truckBlocked(c, r)) { bd = d; best = [c, r]; }
        }
        if (best) { startC = best[0]; startR = best[1]; }
      }

      const candidates = _approachCandidates(destEntity, startC, startR, avoidApproaches);
      if (!candidates.length) return null;

      const baseAvoid = { zone: _buildZoneTest(), water: _buildWaterBufferTest() };
      const tried = Math.min(candidates.length, MAX_APPROACH_CANDIDATES);

      for (let i = 0; i < tried; i++) {
        const { c: goalC, r: goalR } = candidates[i];
        // Only the closest candidate gets the expensive whole-map fallback —
        // if that one's truly unreachable, farther candidates are unlikely
        // to be within a normal search box either, so save the extra work
        // for the case that most often actually explains it: a different
        // side of the building being on a disconnected pocket of road.
        const result = _searchWithRetries(startC, startR, goalC, goalR, baseAvoid, destEntity, i === 0);
        if (result) {
          const { tilePath, avoid } = result;
          // Truck's own tile IS the chosen approach tile — it's already
          // sitting right next to the destination (common mid-queue, e.g.
          // right after finishing the previous leg nearby). There's nothing
          // to drive; return an empty array as a distinct "already there"
          // signal so callers don't mistake it for "no route found" (null).
          if (tilePath.length < 2) return [];
          const simplified = _simplify(tilePath, avoid);
          return simplified.map(_tileCenter);
        }
        // Ran out of budget everywhere: the other sides would too (three
        // more rounds of the same full-size searches), so go to the BFS.
        if (_searchCapped) break;
      }

      // Every penalty-aware attempt failed — fall back to the guaranteed
      // BFS above rather than reporting "no route found" for a destination
      // that's actually reachable, just not within the box/iteration
      // budgets or past the penalized buffers the A* passes were tuned for.
      // Every approach tile, not just the few A* tried: when the nearest
      // sides are walled in, a far side may still be open.
      const bfsPath = _bfsFallback(startC, startR, candidates, true) || _slotFallback(startC, startR, candidates);
      if (!bfsPath) return null;
      if (bfsPath.length < 2) return [];
      // No `avoid` context worth reusing here (this path may cut through
      // penalized buffers on purpose to guarantee arrival) — simplify against
      // an all-clear predicate so line-of-sight collapsing still only checks
      // hard blocks, not the buffers this path may already be crossing.
      const clear = { zone: () => false, water: () => false, building: () => false };
      const simplified = _simplify(bfsPath, clear);
      return simplified.map(_tileCenter);
    },
  };
})();
