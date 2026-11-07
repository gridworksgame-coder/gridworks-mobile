/* ═══════════════════════════════════════════════════════════════════
   RESOURCE HELPERS
   Shared pipe/conveyor predicates plus the Biofuel production system.
   ═══════════════════════════════════════════════════════════════════ */

// Helper: treat underground pipe identically to surface pipe throughout all BFS/checks
// Also treats a conveyor or wire sitting on top of a pipe as a traversable pipe tile
const isPipe = (e) => e && (e.type === T.PIPE || e.type === T.UNDERGNDPIPE ||
  ((e.type === T.WIRE || e.type === T.CONVEYOR) && !!e._underPipe));

// Get the actual pipe entity from a tile (unwraps wire/conveyor stacking)
const getPipe = (e) => {
  if (!e) return null;
  if (e.type === T.PIPE || e.type === T.UNDERGNDPIPE) return e;
  if ((e.type === T.WIRE || e.type === T.CONVEYOR) && e._underPipe) return e._underPipe;
  return null;
};

// Most ore a mine will hold in its own output buffer before it stops
// extracting. Anything beyond this has to go somewhere — a generator, a
// process plant, or a Storage Container (SolidStorageSystem) — so running a
// mine into nothing no longer banks unlimited ore (or unlimited progress
// toward "mine N tonnes" unlocks). Buffers saved above the cap are trimmed
// back to it on the mine's next tick.
const MINE_BUFFER_CAP = 500;

// What gets built on each kind of deposit (MK1 and MK2).
const DEPOSIT_BUILDERS = {
  [T.COALDEPOSIT]:      [T.COALMINE, T.COALMINE2],
  [T.OILDEPOSIT]:       [T.PUMPJACK, T.PUMPJACK2],
  [T.URANIUMDEPOSIT]:   [T.URANIUMMINE],
  [T.SULFURDEPOSIT]:    [T.SULFURMINE, T.SULFURMINE2],
  [T.LITHIUMDEPOSIT]:   [T.LITHIUMMINE],
  [T.RAREEARTHDEPOSIT]: [T.RAREEARTHMINE],
  [T.HELIUMDEPOSIT]:    [T.HELIUMWELL, T.HELIUMWELL2],
  [T.GEODEPOSIT]:       [T.GEOWELL],
};
// A newly found deposit keeps water — and the map edge — at least as far away
// as the longest side of the biggest mine, pump or well built on it, on every
// side. However that building sits on the deposit, it can't reach water or
// run off the map, so a find is never one nothing can be built on.
function depositClearOfWater(depType, col, row, w, h) {
  let m = 0;
  for (const t of DEPOSIT_BUILDERS[depType] || []) {
    const d = t && EntityDefs[t];
    if (d) m = Math.max(m, d.width || 1, d.height || 1);
  }
  if (!GridManager.inBounds(col - m, row - m) || !GridManager.inBounds(col + w - 1 + m, row + h - 1 + m)) return false;
  for (let r = row - m; r < row + h + m; r++)
    for (let c = col - m; c < col + w + m; c++)
      if (WaterSystem.isWater(c, r)) return false;
  return true;
}

// A full refinery fuel tank restarts refining once it drains below this
// fraction of capacity (deadband — see PowerNetwork._outputFull). 5% of the
// 2000-unit tank is ~100s of one generator's draw, so the status plate
// changes every minute or so instead of every tick.
const REFINERY_RESUME_FRAC = 0.95;

// Updates and returns a refinery's latched "tank full" state. Called from
// both PowerNetwork._outputFull and tickRefinery so the two always agree.
function refineryFuelFull(e) {
  const cap = EntityDefs[T.REFINERY].fuelCapacity, fuel = e._fuelOil || 0;
  if (fuel >= cap) e._fuelFull = true;
  else if (fuel < cap * REFINERY_RESUME_FRAC) e._fuelFull = false;
  return !!e._fuelFull;
}

// ── Emptying a storage vessel ────────────────────────────────────
// A Gas Holder, Liquid Storage Tank or Storage Container locks to whatever
// it first receives and only frees up at zero, so a vessel holding the wrong
// thing (or something nothing downstream takes) was stuck with it. The
// player can pay to have one emptied from its info panel: the fee is charged
// up front on what it holds, the contents then drain away over a few seconds
// (a full vessel takes SECONDS of sim time, a part-full one proportionally
// less) and are discarded, and while that runs the vessel takes nothing in,
// from pipe, belt, drone or truck, or it would never reach empty. Stopping
// part-way keeps what is left; the fee is not returned.
// Each vessel's own system calls tick() once per logic tick and refuses
// intake while e._draining is set. The flag is saved.
const StorageDrain = {
  SECONDS: 20,
  FEE_PER_UNIT: 0.5,
  MIN_FEE: 250,
  isVessel(e) { return !!e && (e.type === T.GASSTORAGE || e.type === T.OILSTORAGE || e.type === T.SOLIDSTORAGE); },
  amount(e) {
    if (e.type === T.GASSTORAGE) return GasStorageSystem.stored(e);
    return (e.type === T.OILSTORAGE ? e._crude : e._stored) || 0;
  },
  capacity(e) {
    return e.type === T.GASSTORAGE ? GasStorageSystem.capacity()
         : e.type === T.OILSTORAGE ? OilSystem.getTankCapacity()
         : SolidStorageSystem.CAPACITY;
  },
  _set(e, v) {
    const empty = v <= 0.001;
    if (e.type === T.GASSTORAGE) {
      const K = e._gasType && GasStorageSystem.KINDS[e._gasType];
      if (K) e[K.field] = empty ? 0 : v;
      if (empty) e._gasType = null;
    } else if (e.type === T.OILSTORAGE) {
      e._crude = empty ? 0 : v; if (empty) e._liquidType = null;
    } else {
      e._stored = empty ? 0 : v; if (empty) e._solidType = null;
    }
  },
  fee(e) { return Math.max(this.MIN_FEE, Math.round(this.amount(e) * this.FEE_PER_UNIT / 10) * 10); },
  secondsLeft(e) { return this.amount(e) / (this.capacity(e) / this.SECONDS); },
  // A client's vessel on a contract job site isn't the player's to empty.
  allowed(e) { return this.isVessel(e) && !e._clientOwned; },
  // Charges the fee and starts the drain. False if the player can't pay.
  start(e) {
    const fee = this.fee(e);
    if (!Economy.canAfford(fee)) return false;
    Economy.spend(fee);
    e._draining = true;
    return true;
  },
  stop(e) { e._draining = false; },
  // Returns how much was discarded this tick.
  tick(e, dt) {
    if (!e._draining) return 0;
    const have = this.amount(e);
    const out = Math.min(have, this.capacity(e) / this.SECONDS * Math.max(0, dt));
    this._set(e, have - out);
    if (have - out <= 0.001) e._draining = false;
    return out;
  },
};

// Helper: true for conveyor tiles, including pipe tiles that have a conveyor underneath
const isConveyorTile = (e) => e && (e.type === T.CONVEYOR || ((e.type === T.PIPE || e.type === T.UNDERGNDPIPE) && !!e._underConveyor));

// ── Ports, not walls ─────────────────────────────────────────────
// A building gives or takes a material through one stub tile, the one its
// valve or chute is drawn on. A pipe or belt that merely runs alongside the
// footprint carries nothing. Every source search ends on one of these two
// tests so that rule holds for every material:
//   atOutPort      a PIPE walk standing on pipe tile (c,r) has found a
//                  producer next to it; true only if (c,r) is the producer's
//                  own OUT stub.
//   arrivedByPort  a BELT walk has stepped onto a producer from (pc,pr);
//                  true only if that tile is the producer's OUT stub. A walk
//                  that starts on the producer (pc === null: the two
//                  buildings simply abut, with no belt between) does not
//                  count, the same as for the ore mines.
function atOutPort(stub, c, r) {
  return !!stub && stub.c === c && stub.r === r;
}
function arrivedByPort(stub, pc, pr) {
  return !!stub && pc !== null && pc !== undefined && stub.c === pc && stub.r === pr;
}

// The belt entity on a tile, unwrapping a pipe laid over it — or null.
const beltOf = (e) => !e ? null
  : e.type === T.CONVEYOR ? e
  : ((e.type === T.PIPE || e.type === T.UNDERGNDPIPE) && e._underConveyor) ? e._underConveyor
  : null;

// Conveyor Splitters are built the same way as underground belts (below): an
// ordinary T.CONVEYOR flagged `_splitter`, def = EntityDefs[T.CONVEYORSPLITTER],
// so every belt walk treats it as a plain junction tile. What it changes is
// BeltShare: where the routes to several consumers part ways on it, a short
// supply divides by its mode instead of evenly.
//   _splitMode   'even' | 'priority' | 'ratio'
//   _splitSide   0–3, the favoured way out (N/E/S/W, clockwise, R turns it)
//   _splitRatio  the favoured way's share in 'ratio' mode (0.1–0.9)
const SPLIT_SIDES = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const SPLIT_SIDE_NAMES = ['North', 'East', 'South', 'West'];
const SPLIT_MODES = ['even', 'priority', 'ratio'];

// The tool a belt-borne piece is placed with: what blueprints, contract
// crews and the hover-pick record for it.
// An automatic splitter counts as the plain belt it was: copied, stamped or
// rebuilt as one, it turns back into a splitter wherever it is a junction.
function beltPieceType(e) {
  return !e ? null : e._udgBelt ? T.UNDERGNDCONVEYOR : (e._splitter && !e._autoSplit) ? T.CONVEYORSPLITTER : e.type;
}
// The drag links a blueprint or crew keeps for belt `e` (an automatic
// splitter's are the sides it joins).
const beltLinksOf = (e) => e._autoSplit ? (e._preSplitLinks === undefined ? undefined : beltJoinBits(e)) : e._links;

// A splitter the game made where a line forks (or rebuilt from a blueprint,
// a save or a contract) costs no upkeep, like the plain belt it is: only one
// placed with the Conveyor Splitter tool (`s.placed`, kept as
// e._placedSplitter) pays the splitter's. The fork def is the splitter's
// with the upkeep taken off, made on first use.
let _forkSplitterDef = null;
const forkSplitterDef = () => _forkSplitterDef || (_forkSplitterDef = { ...EntityDefs[T.CONVEYORSPLITTER], upkeep: 0 });

// Make `e` a splitter, keeping whatever settings `s` gives.
function initSplitter(e, s = {}) {
  e.type        = T.CONVEYOR;
  e._splitter   = true;
  e._placedSplitter = !!s.placed;
  e.def         = s.placed ? EntityDefs[T.CONVEYORSPLITTER] : forkSplitterDef();
  e._splitMode  = SPLIT_MODES.includes(s.mode) ? s.mode : 'even';
  e._splitSide  = ((s.side | 0) % 4 + 4) % 4;
  e._splitRatio = Math.min(0.9, Math.max(0.1, Math.round((+s.ratio || 0.7) * 10) / 10));
  return e;
}
const splitterSettings = (e) => ({ mode: e._splitMode, side: e._splitSide, ratio: e._splitRatio });

// Underground belts are the conveyor twin of the underground pipe below: two
// same-axis ends up to UNDERGROUND_BELT_MAX_SPAN tiles apart pair up, and a
// paired side jumps straight to its partner, refusing direct adjacency, so a
// crossing belt can occupy every tile in between without joining the tunnel.
// An underground belt is an ordinary T.CONVEYOR entity flagged `_udgBelt`
// (with `_udgAxis` 'h'|'v' and def = EntityDefs[T.UNDERGNDCONVEYOR]), so every
// system that clears or reads conveyor flags picks it up with no changes —
// only the neighbour step differs, and that goes through beltSteps().
// Pairs are remembered the same way as the pipe's (see udgPairNew).
const UNDERGROUND_BELT_MAX_SPAN = 8;

function udgBeltPartner(c, r, dc, dr, axis) {
  return _udgFind(_udgBeltEnd, UNDERGROUND_BELT_MAX_SPAN, c, r, dc, dr, axis);
}

// Drag-connected belts, the belt twin of drag-connected pipes (pipesJoin
// below). A plain belt laid by the player records which of its four sides
// join another belt (e._links, pipeSideBit bits): belts laid in one drag join
// each other along the drag, a drag's end tiles join the END of a line they
// touch, and a drag started on a belt branches off it (input_manager.js). Two
// belt tiles connect only if both open toward each other, so a line laid right
// alongside another stays separate. _links undefined (belts from before this,
// underground belts and splitters) opens every side. Only belt-to-belt joins
// are restricted; building ports are unaffected.
// BELT_LINK_EPOCH moves whenever any belt's links change, so cached belt runs
// (BeltRuns) know to walk again.
let BELT_LINK_EPOCH = 0;
function beltOpensToward(b, dc, dr) {
  return !b || b._links === undefined || !!(b._links & pipeSideBit(dc, dr));
}
// True unless (c,r) and (c+dc,r+dr) are both belts and either one is closed
// toward the other.
function beltsJoin(c, r, dc, dr) {
  const a = beltOf(GridManager.getEntity(c, r));
  const b = a && beltOf(GridManager.getEntity(c + dc, r + dr));
  if (!a || !b) return true;
  return beltOpensToward(a, dc, dr) && beltOpensToward(b, -dc, -dr);
}
// Open belt `a` toward `b` at a + (dc,dr), and `b` back toward `a`.
function linkBelts(a, b, dc, dr) {
  const a0 = a && a._links, b0 = b && b._links;
  if (a && a._links !== undefined) a._links |= pipeSideBit(dc, dr);
  if (b && b._links !== undefined) b._links |= pipeSideBit(-dc, -dr);
  if ((a && a._links !== a0) || (b && b._links !== b0)) BELT_LINK_EPOCH++;
}

// ── Automatic splitters ──────────────────────────────────────────
// Wherever a plain belt joins three or more belts — a line split, however it
// was laid — it becomes a Conveyor Splitter (Even, which shares out exactly
// as the bare junction did) so the split can be set from its panel, and it
// goes back to a plain belt if the branch is taken away. Marked _autoSplit:
// only those revert, and one the player sets (panel, R) stops being
// automatic and stays. Refunds as the belt it was (_paid). Checked whenever
// belts change, including straight after a load, which is what converts the
// junctions in a save from before this existed.
// Sides of belt `b` that join another belt, as pipeSideBit bits.
function beltJoinBits(b) {
  let bits = 0;
  for (const [dc, dr] of _BELT_D4) {
    if (beltOf(GridManager.getEntity(b.col + dc, b.row + dr)) && beltStepAllowed(b.col, b.row, dc, dr)) bits |= pipeSideBit(dc, dr);
  }
  return bits;
}
const _bitCount = (n) => ((n & 1) ? 1 : 0) + ((n & 2) ? 1 : 0) + ((n & 4) ? 1 : 0) + ((n & 8) ? 1 : 0);
function makeAutoSplitter(b) {
  b._preSplitLinks = b._links;
  if (b._paid === undefined) b._paid = (b.def && b.def.cost) || EntityDefs[T.CONVEYOR].cost;
  initSplitter(b);
  b._links = undefined;
  b._autoSplit = true;
}
function clearAutoSplitter(b) {
  const bits = beltJoinBits(b);   // the sides it joins now, before it closes up
  b._splitter = false; b._autoSplit = false; delete b._placedSplitter;
  delete b._splitMode; delete b._splitSide; delete b._splitRatio; delete b._splitMeter;
  b.def = EntityDefs[T.CONVEYOR];
  b._links = b._preSplitLinks === undefined ? undefined : bits;
  delete b._preSplitLinks;
}
let _autoSplitKey = '', _autoSplitAt = 0;
function syncAutoSplitters() {
  const key = EntityRegistry.getTopologyVersion() + ':' + BELT_LINK_EPOCH;
  if (key === _autoSplitKey) return;
  const now = performance.now();
  if (now - _autoSplitAt < 200 && _autoSplitKey) return;   // a drag lays a tile a frame
  _autoSplitAt = now;
  let changed = false;
  for (const b of EntityRegistry.getByType(T.CONVEYOR)) {
    if (b._udgBelt || (b._splitter && !b._autoSplit)) continue;
    if (GridManager.getEntity(b.col, b.row) !== b) continue;   // under a pipe crossing
    const n = _bitCount(beltJoinBits(b));
    if (!b._splitter && n >= 3) { makeAutoSplitter(b); changed = true; }
    else if (b._autoSplit && n < 3) { clearAutoSplitter(b); changed = true; }
  }
  if (changed) BELT_LINK_EPOCH++;
  _autoSplitKey = EntityRegistry.getTopologyVersion() + ':' + BELT_LINK_EPOCH;
}

// True when tunnel geometry and drag links let a belt walk step one tile from
// (c,r) along (dc,dr). Checked from both ends: an underground belt only opens
// along its axis, and never on a side that is paired to a partner.
function beltStepAllowed(c, r, dc, dr) {
  if (!beltsJoin(c, r, dc, dr)) return false;
  const from = beltOf(GridManager.getEntity(c, r));
  if (from && from._udgBelt) {
    if ((dc !== 0) !== (from._udgAxis === 'h')) return false;
    if (udgBeltPartner(c, r, dc, dr, from._udgAxis)) return false;
  }
  const to = beltOf(GridManager.getEntity(c + dc, r + dr));
  if (to && to._udgBelt) {
    if ((dc !== 0) !== (to._udgAxis === 'h')) return false;
    if (udgBeltPartner(c + dc, r + dr, -dc, -dr, to._udgAxis)) return false;
  }
  return true;
}

// Neighbour OFFSETS a belt walk may take from (c,r) — a drop-in for the
// literal four-direction list every conveyor flood-fill uses. A paired
// tunnel side comes back as one long offset straight to its partner, so
// `c + dc` lands on it and Math.sign(c - fromC) still gives the travel
// direction.
const _BELT_D4 = [[1,0],[-1,0],[0,1],[0,-1]];
function beltSteps(c, r) {
  const here = beltOf(GridManager.getEntity(c, r));
  // Only an underground belt or a drag-linked belt (here, or on a
  // neighbouring tile) ever narrows the four directions. Everywhere else the
  // answer is all four, so hand back the shared list rather than building a
  // new one per tile: this is the inner step of every belt walk, for every
  // machine, every tick. Callers only read it.
  if (!(here && (here._udgBelt || here._links !== undefined))) {
    let plain = true;
    for (let i = 0; i < 4; i++) {
      const to = beltOf(GridManager.getEntity(c + _BELT_D4[i][0], r + _BELT_D4[i][1]));
      if (to && (to._udgBelt || to._links !== undefined)) { plain = false; break; }
    }
    if (plain) return _BELT_D4;
  }
  const out = [];
  for (const [dc, dr] of _BELT_D4) {
    if (here && here._udgBelt && (dc !== 0) === (here._udgAxis === 'h')) {
      const p = udgBeltPartner(c, r, dc, dr, here._udgAxis);
      if (p) { out.push([p[0] - c, p[1] - r]); continue; }
    }
    // Across its axis an end stays shut to belts but meets a building, so
    // one set on a port feeds it whichever way the tunnel runs (see the
    // pipe twin in pipeBfsCoords).
    if (here && here._udgBelt && (dc !== 0) !== (here._udgAxis === 'h')) {
      if (!beltOf(GridManager.getEntity(c + dc, r + dr))) out.push([dc, dr]);
      continue;
    }
    if (beltStepAllowed(c, r, dc, dr)) out.push([dc, dr]);
  }
  return out;
}

// Belts carrying the same material connect, the belt twin of
// autoJoinSameFluidPipes below. A line laid alongside another stays separate
// while either is empty or they carry different things; once both have been
// carrying the same material (BeltCargo.kindAt: what has really been riding
// the tile) they open toward each other for good. Two tiles already on one
// belt network are left alone, so a line that doubles back beside itself is
// not short-cut, and two separate lines join once, at the first touching
// pair, rather than at every tile along them. Where they join is an ordinary
// fork: syncAutoSplitters makes it a splitter and BeltShare splits there.
let _beltAutoJoinT = 0;
function autoJoinSameMaterialBelts(dt) {
  _beltAutoJoinT += dt;
  if (_beltAutoJoinT < 0.5) return;
  _beltAutoJoinT = 0;
  if (typeof BeltCargo === 'undefined' || !BeltCargo.kindAt) return;
  const kindOf = (b) => { const s = BeltCargo.kindAt(b.col, b.row); return s ? s.kind : null; };
  // Belt networks, labelled on first need and merged as lines are joined.
  let comp = null;
  const parent = [];
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const compOf = (b) => {
    if (!comp) comp = new Map();
    const k = b.col + ',' + b.row;
    let id = comp.get(k);
    if (id !== undefined) return find(id);
    id = parent.length; parent.push(id);
    const q = [[b.col, b.row]];
    comp.set(k, id);
    for (let i = 0; i < q.length; i++) {
      const [c, r] = q[i];
      for (const [dc, dr] of beltSteps(c, r)) {
        const nk = (c + dc) + ',' + (r + dr);
        if (comp.has(nk) || !beltOf(GridManager.getEntity(c + dc, r + dr))) continue;
        comp.set(nk, id); q.push([c + dc, r + dr]);
      }
    }
    return id;
  };
  // Belts under a pipe crossing are carried by the pipe, not registered:
  // take them too, at their host's tile.
  const belts = [...EntityRegistry.getByType(T.CONVEYOR)];
  for (const t of [T.PIPE, T.UNDERGNDPIPE]) for (const h of EntityRegistry.getByType(t)) {
    const u = h._underConveyor;
    if (u && GridManager.getEntity(h.col, h.row) === h) { u.col = h.col; u.row = h.row; belts.push(u); }
  }
  for (const p of belts) {
    if (p._links === undefined) continue;                 // already opens every side
    const kind = kindOf(p);
    if (!kind) continue;                                  // an empty belt waits
    for (const [dc, dr] of _BELT_D4) {
      if (beltOpensToward(p, dc, dr)) continue;
      const nc = p.col + dc, nr = p.row + dr;
      if (!GridManager.inBounds(nc, nr)) continue;
      const q = beltOf(GridManager.getEntity(nc, nr));
      if (!q || q === p || q._udgBelt) continue;
      if (kindOf(q) !== kind) continue;                   // different materials never join
      const a = compOf(p), b = compOf(q);
      if (a === b) continue;
      linkBelts(p, q, dc, dr);
      if (!beltStepAllowed(p.col, p.row, dc, dr)) continue;
      parent[b] = a;
    }
  }
}

// Underground pipes work like Factorio underground belts: place one, then
// place a second matching one (same e._udgAxis, set by rotation) up to
// UNDERGROUND_PIPE_MAX_SPAN tiles away in a straight line to complete the
// run. Each of the two axis-aligned ends independently searches for a
// same-axis partner in its direction; if one's in range, that end becomes
// "sealed" — it jumps straight to the partner and refuses ANY direct
// adjacency on that side (even to a pipe tile sitting right next to it),
// so a crossing pipe of a different liquid can occupy every tile in between
// without ever touching the tunnel. An end with no partner in range just
// falls back to a normal, plain adjacent connection (e.g. to the rest of
// its own line, or as a dead end).
//
// A pair is remembered: each end keeps how far its partner is on either side
// (e._udgNeg left/up, e._udgPos right/down, 0 for none), and both ends have to
// agree. A new end only takes a partner that has none yet (udgPairNew), so a
// second pair laid on the same line leaves the first alone, and the two can
// even overlap. It used to be whichever end was nearest, which made the far
// end of a pair tunnel on to the next one too and sealed it off from the
// surface pipe it fed. Undefined spans (a save from before this, until
// udgAdoptLegacy runs) still pair with the nearest end, as they always did.
const UNDERGROUND_PIPE_MAX_SPAN = 8;

function udgSpan(e, dc, dr) { return (dc < 0 || dr < 0) ? e._udgNeg : e._udgPos; }

// The underground pipe or belt end standing on a tile, or null.
const _udgPipeEnd = (c, r) => { const e = GridManager.getEntity(c, r); return e && e.type === T.UNDERGNDPIPE ? e : null; };
const _udgBeltEnd = (c, r) => { const b = beltOf(GridManager.getEntity(c, r)); return b && b._udgBelt ? b : null; };

function _udgFind(endAt, maxSpan, c, r, dc, dr, axis) {
  const span = udgSpan(endAt(c, r) || {}, dc, dr);
  if (span === undefined) {
    for (let dist = 1; dist <= maxSpan; dist++) {
      const fc = c + dc * dist, fr = r + dr * dist;
      if (!GridManager.inBounds(fc, fr)) return null;
      const fe = endAt(fc, fr);
      if (fe && fe._udgAxis === axis && udgSpan(fe, -dc, -dr) === undefined) return [fc, fr];
    }
    return null;
  }
  if (!span) return null;
  const fc = c + dc * span, fr = r + dr * span;
  if (!GridManager.inBounds(fc, fr)) return null;
  const fe = endAt(fc, fr);
  return fe && fe._udgAxis === axis && udgSpan(fe, -dc, -dr) === span ? [fc, fr] : null;
}

// The partner of the underground pipe at (c,r) in direction (dc,dr), or null
// if that side has none.
function udgPartner(c, r, dc, dr, axis) {
  return _udgFind(_udgPipeEnd, UNDERGROUND_PIPE_MAX_SPAN, c, r, dc, dr, axis);
}

function _udgSides(axis) { return axis === 'v' ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]; }
const _udgPartnerOf = (e) => e._udgBelt ? udgBeltPartner : udgPartner;
function _udgHasPartner(e) {
  return _udgSides(e._udgAxis).some(([dc, dr]) => !!_udgPartnerOf(e)(e.col, e.row, dc, dr, e._udgAxis));
}

// Give a just-placed (or just-turned) end its partner: the nearest same-axis
// end in range that has none yet, passing under any that are already paired.
function udgPairNew(e) {
  udgAdoptLegacy();
  e._udgNeg = 0; e._udgPos = 0;
  const belt = !!e._udgBelt, endAt = belt ? _udgBeltEnd : _udgPipeEnd;
  const maxSpan = belt ? UNDERGROUND_BELT_MAX_SPAN : UNDERGROUND_PIPE_MAX_SPAN;
  const sides = _udgSides(e._udgAxis);
  search:
  for (let dist = 1; dist <= maxSpan; dist++) {
    for (const [dc, dr] of sides) {
      const fc = e.col + dc * dist, fr = e.row + dr * dist;
      if (!GridManager.inBounds(fc, fr)) continue;
      const fe = endAt(fc, fr);
      if (!fe || fe === e || fe._udgAxis !== e._udgAxis || _udgHasPartner(fe)) continue;
      if (dc < 0 || dr < 0) { e._udgNeg = dist; fe._udgPos = dist; }
      else                  { e._udgPos = dist; fe._udgNeg = dist; }
      break search;
    }
  }
  if (belt) BELT_LINK_EPOCH++;
  else if (typeof PipeRuns !== 'undefined') PipeRuns.linksChanged();
}

// Write down the pairs of ends from a save that predates remembered pairs,
// exactly as the nearest-end rule had them, chains included. Run whenever a
// world goes onto the grid, and before a new end picks its partner.
function udgAdoptLegacy() {
  const legacy = [];
  const note = (u) => { if (u._udgNeg === undefined) legacy.push(u); };
  for (const u of EntityRegistry.getByType(T.UNDERGNDPIPE)) {
    note(u);
    if (u._underConveyor && u._underConveyor._udgBelt) note(u._underConveyor);
  }
  for (const b of EntityRegistry.getByType(T.CONVEYOR)) if (b._udgBelt) note(b);
  for (const q of EntityRegistry.getByType(T.PIPE)) if (q._underConveyor && q._underConveyor._udgBelt) note(q._underConveyor);
  const spans = legacy.map(u => _udgSides(u._udgAxis).map(([dc, dr]) => {
    const p = _udgPartnerOf(u)(u.col, u.row, dc, dr, u._udgAxis);
    return p ? Math.abs(p[0] - u.col) + Math.abs(p[1] - u.row) : 0;
  }));
  legacy.forEach((u, i) => { u._udgNeg = spans[i][0]; u._udgPos = spans[i][1]; });
}

// Drag-connected pipes. A surface pipe laid by the player records which of
// its four sides join another pipe (e._links, bits below): pipes laid in one
// drag join each other along the drag, and the drag's end tiles join the END
// of any line they touch (input_manager.js). Two pipe tiles connect only if
// both open toward each other, so a line dragged right alongside another one
// never merges with it, whatever each carries. _links undefined — every pipe
// from before this existed, underground pipes, and pipes built by code —
// opens every side, exactly as pipes always behaved. Only pipe-to-pipe joins
// are restricted; building ports are unaffected.
function pipeSideBit(dc, dr) { return dr < 0 ? 1 : dr > 0 ? 2 : dc < 0 ? 4 : 8; }
function pipeOpensToward(p, dc, dr) {
  return !p || p._links === undefined || !!(p._links & pipeSideBit(dc, dr));
}
// True unless (c,r) and (c+dc,r+dr) are both pipes and either one is closed
// toward the other.
function pipesJoin(c, r, dc, dr) {
  if (!GridManager.inBounds(c, r) || !GridManager.inBounds(c + dc, r + dr)) return true;
  const a = getPipe(GridManager.getEntity(c, r));
  const b = a && getPipe(GridManager.getEntity(c + dc, r + dr));
  if (!a || !b) return true;
  return pipeOpensToward(a, dc, dr) && pipeOpensToward(b, -dc, -dr);
}
// Open pipe `a` toward `b` at a + (dc,dr), and `b` back toward `a`.
function linkPipes(a, b, dc, dr) {
  const a0 = a && a._links, b0 = b && b._links;
  if (a && a._links !== undefined) a._links |= pipeSideBit(dc, dr);
  if (b && b._links !== undefined) b._links |= pipeSideBit(-dc, -dr);
  if ((a && a._links !== a0) || (b && b._links !== b0)) PipeRuns.linksChanged();
}
// Pipes carrying the same fluid always connect. The drag rules above keep a
// freshly laid line from merging sideways into its neighbours, but once two
// touching pipes both carry the same fluid there is nothing to keep apart —
// so open them toward each other for good (a tee into the middle of a line,
// or two parallel runs of the same fluid). Different fluids never join, and
// a dry pipe waits until it carries something. Called from the game loop
// after the fluid systems have set this tick's flags (pipeCurrentFluid).
// The fluid building `b`'s port at pipe tile (c,r) sends or takes, or null.
// Only the oil chain's ports so far: its crude is traced first each tick, so
// a dry fuel line beside a crude one is the pair that went wrong.
function pipePortFluid(b, c, r) {
  if (!b) return null;
  const at = (s) => !!s && s.c === c && s.r === r;
  if (b.type === T.REFINERY) {
    if (at(refineryFuelOut(b))) return 'fueloil';
    if (at(refineryCrudeIn(b))) return 'oil';
    if (refineryLpgUnlocked() && at(refineryLpgOut(b))) return 'lpg';
  }
  if ((b.type === T.PUMPJACK || b.type === T.PUMPJACK2) && at(pumpJackOut(b))) return 'oil';
  if (b.type === T.FUELGEN && c === b.col - 1 && r === b.row + Math.floor((b.height || 5) / 2)) return 'fueloil';
  if (b.type === T.GASSTATION && c === b.col - 1 && typeof GasStationPorts !== 'undefined' && GasStationPorts.inputRows(b).includes(r)) return 'fueloil';
  return null;
}
// What a pipe run is laid for: the fluid of the first port on it that says.
function runPortFluid(run) {
  for (let k = 0; k < run.an; k++) {
    const f = pipePortFluid(run.ae[k], run.atc[k], run.atr[k]);
    if (f) return f;
  }
  return null;
}

let _pipeAutoJoinT = 0;
function autoJoinSameFluidPipes(dt) {
  _pipeAutoJoinT += dt;
  if (_pipeAutoJoinT < 0.5) return;
  _pipeAutoJoinT = 0;
  // Every surface pipe, including those lying under a belt or a wire: a
  // stacked pipe is carried by what is on top of it and is not in the
  // registry, so walking the registry alone never joined a pipe run laid
  // beneath a conveyor. Its tile is its host's (a stacked layer's own
  // col/row is not always kept up to date).
  const list = [...EntityRegistry.getByType(T.PIPE)];
  for (const t of [T.CONVEYOR, T.WIRE]) for (const h of EntityRegistry.getByType(t)) {
    const u = h._underPipe;
    if (u && u.type === T.PIPE && GridManager.getEntity(h.col, h.row) === h) { u.col = h.col; u.row = h.row; list.push(u); }
  }
  for (const p of list) {
    if (p._links === undefined) continue;                 // already opens every side
    // A line end (or lone pipe) sitting squarely on an underground pipe's
    // open mouth joins it, wet or dry. The mouth only faces along its axis
    // and only on the side with no tunnel partner, so there is nothing else
    // that tile could have been meant for. The joins made at placement cover
    // the usual order of building; this catches the rest (a mouth rotated to
    // face a pipe laid earlier, and runs saved before that was handled).
    {
      let open = 0;
      for (const b of [1, 2, 4, 8]) if (p._links & b) open++;
      if (open <= 1) {
        const mine = pipeCurrentFluid(p);
        for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          if (pipeOpensToward(p, dc, dr)) continue;
          const nc = p.col + dc, nr = p.row + dr;
          if (!GridManager.inBounds(nc, nr)) continue;
          const u = GridManager.getEntity(nc, nr);
          if (!u || u.type !== T.UNDERGNDPIPE) continue;
          if ((dc !== 0) !== (u._udgAxis === 'h')) continue;            // mouth faces the other way
          if (udgPartner(nc, nr, -dc, -dr, u._udgAxis)) continue;       // that side is the tunnel
          const theirs = pipeCurrentFluid(u);
          if (mine && theirs && mine !== theirs) continue;              // different fluids never join
          linkPipes(p, u, dc, dr);
        }
      }
    }
    const fluid = pipeCurrentFluid(p);
    if (!fluid) {
      // A dry dead end butting into a live line is a branch the player meant
      // to join: a stub dragged from a building's port up to an existing line,
      // a single pipe placed on its own, or a new run started just below an
      // existing corner. It can't wait for "both carry the same fluid" — it
      // only gets fluid once it IS joined (an inlet's branch never would).
      // Join it to the first live line it touches. A tile open on two or more
      // sides is mid-run in a line laid alongside, which stays separate.
      // But not to a line of another fluid than its own run is laid for: a
      // fuel line off a refinery's FUEL OUT is dry until it reaches a
      // generator, and its tip touching a crude line used to join it and go crude.
      let open = 0;
      for (const b of [1, 2, 4, 8]) if (p._links & b) open++;
      if (open > 1) continue;
      let want;   // looked up only once a live neighbour turns up
      for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nc = p.col + dc, nr = p.row + dr;
        if (!GridManager.inBounds(nc, nr)) continue;
        const q = getPipe(GridManager.getEntity(nc, nr));
        if (!q || q === p || q.type === T.UNDERGNDPIPE) continue;
        const theirs = pipeCurrentFluid(q);
        if (!theirs || pipesJoin(p.col, p.row, dc, dr)) continue;
        if (want === undefined) want = runPortFluid(pipeRun(p.col, p.row, null));
        if (want && want !== theirs) continue;
        linkPipes(p, q, dc, dr);
        break;
      }
      continue;
    }
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nc = p.col + dc, nr = p.row + dr;
      if (!GridManager.inBounds(nc, nr)) continue;
      const q = getPipe(GridManager.getEntity(nc, nr));
      if (!q || q === p || q.type === T.UNDERGNDPIPE) continue;
      if (pipeCurrentFluid(q) !== fluid || pipesJoin(p.col, p.row, dc, dr)) continue;
      linkPipes(p, q, dc, dr);
    }
  }
}

// ── Which way a pipe run flows ───────────────────────────────────
// A pipe has no direction of its own; what it carries goes from the OUT
// ports on the run to the IN ports. These read that off the buildings, so
// anything drawn on a pipe (the underground mouths' arrows) can show the way
// the run actually flows instead of a fixed guess.

// 'out' if pipe tile (c,r) is a liquid/gas OUT stub of building `nb`, 'in'
// if it is one of its IN stubs, else null. Pipe stubs only: belt chutes are
// not listed.
function pipePortRole(nb, c, r) {
  if (!nb) return null;
  const at = s => !!s && s.c === c && s.r === r;
  const sys = (name) => { try { return (0, eval)(name); } catch (_e) { return null; } };
  if (nb.type === T.WATEREXTRACTOR) {
    return (typeof HydroSystem !== 'undefined' && at(HydroSystem.extractorOutputPort(nb))) ? 'out' : null;
  }
  if (nb.type === T.CHEMICALPLANT) {
    const ps = ChemicalSystem.getStubs(nb).pipeStubs;
    return at(ps[1]) ? 'out' : at(ps[0]) ? 'in' : null;
  }
  const P = _PIPE_PORTS[nb.type];
  if (!P) return null;
  const S = sys(P[0]);
  if (!S || typeof S.getStubs !== 'function') return null;
  const stubs = S.getStubs(nb);
  for (const k of P[2]) if (at(stubs[k])) return 'out';
  for (const k of P[1]) if (at(stubs[k])) return 'in';
  return null;
}
// type -> [system, IN stub names, OUT stub names]
const _PIPE_PORTS = {
  [T.NUCLEARREACTOR]:       ['NuclearSystem',              ['coolIn'], ['steamOut']],
  [T.ADVREACTOR]:           ['NuclearSystem',              ['coolIn'], ['steamOut']],
  [T.COOLINGTOWER]:         ['CoolingTowerSystem',         ['hotIn'], ['coldOut']],
  [T.COOLINGTOWER2]:        ['CoolingTowerSystem',         ['hotIn'], ['coldOut']],
  [T.FUELPLANT]:            ['FuelPlantSystem',            ['pipeIn'], []],
  [T.STEAMTURBINE]:         ['SteamTurbineSystem',         ['steamIn'], []],
  [T.ELECTROLYZER]:         ['ElectrolyzerSystem',         ['waterStub'], ['hydrogenStub']],
  [T.ATMOSCOLLECTOR]:       ['AtmosphereCollectorSystem',  [], ['nitrogenStub']],
  [T.HABERBOSCH]:           ['HaberBoschSystem',           ['nitrogenIn', 'hydrogenIn'], ['ammoniaOut']],
  [T.WASHTOWER]:            ['IsotopicWashTowerSystem',    ['waterIn', 'ammoniaIn'], ['deuteriumOut']],
  [T.FUSIONFUELPLANT]:      ['FusionFuelPlantSystem',      ['deuteriumIn', 'tritiumIn', 'he3In'], []],
  [T.HULKINGFUSIONREACTOR]: ['HulkingFusionReactorSystem', ['cryoIn'], ['highBetaOut', 'tritiumOut', 'ashOut', 'powerOut']],
  [T.MHDRING]:              ['MHDDeceleratorRingSystem',   ['highBetaIn'], []],
  // Its helium ports only, so the advisor sees its ash coming back to a Cryo Plant.
  [T.ADVFUSIONREACTOR]:     ['AdvancedFusionReactorSystem', ['cryoIn'], ['ashOut']],
  [T.HELIUMWELL]:           ['HeliumSystem',               [], ['heliumOut']],
  [T.HELIUMWELL2]:          ['HeliumSystem',               [], ['heliumOut']],
  [T.CRYOPLANT]:            ['CryoPlantSystem',            ['heliumIn'], ['liquidOut']],
  [T.HE3SEPARATOR]:         ['He3SeparatorSystem',         ['heliumIn'], ['he3Out']],
  [T.TRITIUMBREEDER]:       ['TritiumBreederSystem',       [], ['tritiumOut']],
  [T.GASSTORAGE]:           ['GasStorageSystem',           ['gasIn'], ['gasOut']],
  [T.LITHIUMPROCESSPLANT]:  ['LithiumProcessPlantSystem',  ['waterIn'], []],
  [T.REPROCESSOR]:          ['ReprocessingSystem',         ['waterIn'], []],
  [T.LEACHPLANT]:           ['LeachPlantSystem',           ['acidIn'], []],
  [T.SCMILL]:               ['SuperconductorMillSystem',   ['hydrogenIn', 'nitrogenIn'], []],
  [T.COKEOVEN]:             ['CokeOvenSystem',             [], ['gasOut']],
};

// Which way an underground pipe mouth `e` flows along its axis: +1 toward
// the right / down, -1 toward the left / up, 0 when the run does not say
// (nothing on it yet, or sources and sinks on both sides). Each side is
// judged by what lies BEYOND it: past the tunnel partner if that side is
// the tunnel, else along the surface run joined there. It flows toward the
// side that has somewhere to deliver to, and failing that away from the
// side that has a source. Asked every frame, so the answer is kept for a
// moment on the entity.
function udgPipeFlow(e) {
  const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
  if (e._udgFlow && now - e._udgFlow.t < 600) return e._udgFlow.v;
  const axis = e._udgAxis === 'v' ? 'v' : 'h';
  const pos = axis === 'v' ? [0, 1] : [1, 0];
  const beyond = (dc, dr) => {
    const res = { in: false, out: false };
    const seen = new Set([`${e.col},${e.row}`]);
    let mc = e.col, mr = e.row;                       // the mouth this side opens from
    const partner = udgPartner(e.col, e.row, dc, dr, axis);
    if (partner) { mc = partner[0]; mr = partner[1]; seen.add(`${mc},${mr}`); }
    const sc = mc + dc, sr = mr + dr;
    if (!GridManager.inBounds(sc, sr)) return res;
    const first = GridManager.getEntity(sc, sr);
    if (!getPipe(first)) {                            // the mouth sits straight on a building's stub
      const role = pipePortRole(first, mc, mr);
      if (role) res[role] = true;
      return res;
    }
    if (!pipeStepAllowed(sc, sr, dc, dr)) return res; // a pipe is there but not joined to this mouth
    const queue = [[sc, sr]];
    seen.add(`${sc},${sr}`);
    for (let head = 0; head < queue.length && head < 4000; head++) {
      const [c, r] = queue[head];
      for (const [qc, qr] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const nb = GridManager.inBounds(c + qc, r + qr) ? GridManager.getEntity(c + qc, r + qr) : null;
        if (!nb || getPipe(nb)) continue;
        const role = pipePortRole(nb, c, r);
        if (role) res[role] = true;
      }
      for (const [nc, nr] of pipeBfsCoords(c, r)) {
        const k = `${nc},${nr}`;
        if (seen.has(k) || !getPipe(GridManager.getEntity(nc, nr))) continue;
        seen.add(k);
        queue.push([nc, nr]);
      }
    }
    return res;
  };
  const A = beyond(-pos[0], -pos[1]), B = beyond(pos[0], pos[1]);   // A: left/up side, B: right/down side
  let v = 0;
  if (A.in !== B.in)        v = B.in ? 1 : -1;      // toward the only side with a consumer
  else if (A.out !== B.out) v = A.out ? 1 : -1;     // away from the only side with a source
  e._udgFlow = { t: now, v };
  return v;
}

// ── Panels stay on screen ────────────────────────────────────────
// Every panel that opens beside a building works out its own spot, mostly
// from a width and height written into its code, and those have drifted from
// what the panels really measure (the building panel assumed 210px and is
// 340), so the far edge ran off the window. This is the last word after any
// of them has placed itself: measure the panel as actually drawn and slide it
// back inside the window, whatever size it turned out to be. A panel taller
// or wider than the window is pinned to the top-left so its header and close
// button are the part that stays reachable.
function keepPanelOnScreen(p, margin = 10) {
  if (!p || !p.getBoundingClientRect) return;
  const r = p.getBoundingClientRect();
  if (!r.width || !r.height) return;                       // hidden
  const W = window.innerWidth, H = window.innerHeight;
  let dx = 0, dy = 0;
  if (r.right + dx > W - margin)  dx = W - margin - r.right;
  if (r.left  + dx < margin)      dx = margin - r.left;
  if (r.bottom + dy > H - margin) dy = H - margin - r.bottom;
  if (r.top   + dy < margin)      dy = margin - r.top;
  if (!dx && !dy) return;
  // style.left/top are in the panel's own CSS pixels; a zoomed or scaled
  // panel covers more (or fewer) screen pixels per unit.
  const z = (p.offsetWidth ? r.width / p.offsetWidth : 1) || 1;
  const cs = getComputedStyle(p);
  const left = parseFloat(p.style.left) || parseFloat(cs.left) || 0;
  const top  = parseFloat(p.style.top)  || parseFloat(cs.top)  || 0;
  if (dx) p.style.left = `${Math.round(left + dx / z)}px`;
  if (dy) p.style.top  = `${Math.round(top  + dy / z)}px`;
}

// The same rule for every floating panel, all the time. A panel placed when
// it opens can still end up off the edge: placed before its content was
// filled in (the wire panel measured empty, then grew past the bottom), or
// grown since (a row or a button added on a later tick), or left behind when
// the window shrank. So anything placed by an inline left/top that is up on
// screen is checked a few times a second and slid back inside; one taller
// than the window is capped to it and scrolls. Small or click-through things
// (cursors, labels, tooltips' arrows) are left alone, as is anything marked
// data-offscreen-ok.
const PanelOnScreenGuard = (() => {
  const EVERY = 150;   // ms between sweeps
  let last = 0;
  function fitHeight(p, margin) {
    const H = window.innerHeight;
    const r = p.getBoundingClientRect();
    const z = (p.offsetHeight ? r.height / p.offsetHeight : 1) || 1;
    if (r.height > H - margin * 2 + 1) {
      p.style.maxHeight = `${Math.floor((H - margin * 2) / z)}px`;
      p.style.overflowY = 'auto';
      p._panelCapped = true;
    } else if (p._panelCapped && p.scrollHeight * z <= H - margin * 2) {
      p.style.maxHeight = ''; p.style.overflowY = ''; p._panelCapped = false;
    }
  }
  function sweep() {
    for (const p of document.querySelectorAll('body [style*="left"], body [style*="top"]')) {
      if (p.dataset.offscreenOk !== undefined || p.id === 'canvas' || p.tagName === 'CANVAS') continue;
      if (!p.style.left && !p.style.top) continue;
      const r = p.getBoundingClientRect();
      if (r.width < 80 || r.height < 40) continue;
      const cs = getComputedStyle(p);
      if ((cs.position !== 'fixed' && cs.position !== 'absolute') || cs.pointerEvents === 'none'
          || cs.visibility === 'hidden' || cs.display === 'none') continue;   // (not opacity: a panel fading in reads 0)
      // Only top-level floaters: a piece positioned inside a panel moves with it.
      if (p.parentElement && p.parentElement !== document.body && p.parentElement.closest('[style*="left"], [style*="top"]')) continue;
      fitHeight(p, 10);
      keepPanelOnScreen(p);
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    if (now - last < EVERY) return;
    last = now;
    try { sweep(); } catch (_e) {}
  }
  if (typeof window !== 'undefined') {
    requestAnimationFrame(frame);
    window.addEventListener('resize', () => { try { sweep(); } catch (_e) {} });
  }
  return { sweep };
})();

// Blueprint rotation: the same links turned 90° clockwise.
function rotatePipeLinksCW(links) {
  if (links === undefined || links === null) return links;
  return ((links & 1) ? 8 : 0) | ((links & 8) ? 2 : 0) | ((links & 2) ? 4 : 0) | ((links & 4) ? 1 : 0);
}

// True if a pipe-ish tile may step from some source toward (nc,nr) along
// (dc,dr). Checked from the perspective of whatever's being entered, so a
// plain surface pipe reaching sideways into an underground pipe is blocked
// exactly the same as an underground pipe reaching out of itself.
// `fluid`, if given, additionally refuses to enter a neighbour tile that's
// already carrying a different fluid (see pipeAllowsFluid below).
function pipeStepAllowed(nc, nr, dc, dr, fluid) {
  if (!GridManager.inBounds(nc, nr)) return false;
  if (!pipesJoin(nc - dc, nr - dr, dc, dr)) return false;
  const nb = GridManager.getEntity(nc, nr);
  if (!pipeAllowsFluid(nb, fluid)) return false;
  if (nb && nb.type === T.UNDERGNDPIPE && (nb._udgAxis === 'h' || nb._udgAxis === 'v')) {
    const wantsHoriz = nb._udgAxis === 'h';
    if ((dc !== 0) !== wantsHoriz) return false;           // wrong axis entirely
    // The source sits on nb's (-dc,-dr) side — refuse if that side is sealed.
    if (udgPartner(nc, nr, -dc, -dr, nb._udgAxis)) return false;
  }
  return true;
}

// Which fluid (if any) a pipe-ish tile currently carries — derived from the
// same per-tick active flags the renderer uses, so it needs no separate
// bookkeeping. null means empty/unclaimed and free to carry anything.
function pipeCurrentFluid(p) {
  if (!p) return null;
  if (p._cryoCoolActive) return 'cryocool';
  if (p._coolActive)    return 'cool';
  if (p._steamActive)   return 'steam';
  if (p._acidActive)    return 'acid';
  if (p._hydrogenActive) return 'hydrogen';
  if (p._nitrogenActive) return 'nitrogen';
  if (p._ammoniaActive) return 'ammonia';
  if (p._deuteriumActive) return 'deuterium';
  if (p._highBetaActive) return 'highbeta';
  if (p._heliumActive)   return 'helium';
  if (p._liquidHeActive) return 'liquidhe';
  if (p._tritiumActive)  return 'tritium';
  if (p._he3Active)      return 'helium3';
  if (p._lpgActive)      return 'lpg';
  if (p._fuelOilActive) return 'fueloil';
  if (p._oilActive)     return 'oil';
  if (p.powered)        return 'water';
  return null;
}

// True if a pipe-ish tile is free to carry `fluid` — either it's empty, or
// it's already carrying that exact fluid. Two adjacent pipe runs carrying
// different fluids must never connect, so BFS traversal refuses to cross
// into a tile already committed to something else.
function pipeAllowsFluid(tile, fluid) {
  if (!fluid) return true;
  const p = getPipe(tile) || (tile && isPipe(tile) ? tile : null);
  if (!p) return true;
  const cur = pipeCurrentFluid(p);
  return cur === null || cur === fluid;
}

const _PBC_DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
function pipeBfsCoords(c, r, fluid) {
  const tile = GridManager.getEntity(c, r);
  const isUdg = tile && tile.type === T.UNDERGNDPIPE && (tile._udgAxis === 'h' || tile._udgAxis === 'v');

  if (!isUdg) {
    // The same four checks pipeStepAllowed() makes for each side, inlined: the
    // source pipe is looked up once instead of once per side, and each
    // neighbour tile is fetched once instead of three times. This is the
    // innermost loop of every pipe search in the game (fuel, steam, cooling),
    // run for every generator and consumer on every logic tick.
    const out = [];
    const a = getPipe(tile);
    for (let i = 0; i < 4; i++) {
      const d = _PBC_DIRS[i], dc = d[0], dr = d[1];
      const nc = c + dc, nr = r + dr;
      if (!GridManager.inBounds(nc, nr)) continue;
      const nb = GridManager.getEntity(nc, nr);
      // pipesJoin: only two pipe tiles can be closed toward each other.
      if (a) {
        const b = getPipe(nb);
        if (b && !(pipeOpensToward(a, dc, dr) && pipeOpensToward(b, -dc, -dr))) continue;
      }
      // pipeAllowsFluid: refuse to enter a pipe already carrying a different fluid.
      if (fluid) {
        const p = getPipe(nb);
        if (p) { const cur = pipeCurrentFluid(p); if (cur !== null && cur !== fluid) continue; }
      }
      // An underground pipe only opens along its own axis, never on a sealed side.
      if (nb && nb.type === T.UNDERGNDPIPE && (nb._udgAxis === 'h' || nb._udgAxis === 'v')) {
        if ((dc !== 0) !== (nb._udgAxis === 'h')) continue;
        if (udgPartner(nc, nr, -dc, -dr, nb._udgAxis)) continue;
      }
      out.push([nc, nr]);
    }
    return out;
  }

  const dirs = tile._udgAxis === 'h' ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
  const out = [];
  for (const [dc, dr] of dirs) {
    const partner = udgPartner(c, r, dc, dr, tile._udgAxis);
    if (partner) {
      const partnerEnt = GridManager.getEntity(partner[0], partner[1]);
      if (pipeAllowsFluid(partnerEnt, fluid)) out.push(partner);   // sealed side — jump straight to the paired tile
    } else {
      const nc = c + dc, nr = r + dr;
      if (pipeStepAllowed(nc, nr, dc, dr, fluid)) out.push([nc, nr]);   // open side — normal adjacency
    }
  }
  // Its other two sides stay shut to pipes but meet a building, as a surface
  // pipe's would, so an end set on a port feeds it whichever way the tunnel
  // runs: one leaving along the wall used to sit on the stub and do nothing.
  for (const [dc, dr] of tile._udgAxis === 'h' ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]) {
    const nc = c + dc, nr = r + dr;
    if (!GridManager.inBounds(nc, nr)) continue;
    const nb = GridManager.getEntity(nc, nr);
    if (nb && !getPipe(nb)) out.push([nc, nr]);
  }
  return out;
}

// Counts logic ticks (GameLoop bumps it at the top of each one). The caches
// below use it to do their expensive re-checks once per tick rather than
// once per machine.
let SIM_TICK_ID = 0;

// ── BeltShare: fair shares of a shared source ──
// Every building that PULLS material off a belt (a plant drawing ore from a
// mine, a reactor drawing pellets from a fuel plant, a bin filling from a
// producer...) used to take its whole want from each source in turn, so the
// one that ticked first — usually the nearest — took everything a scarce
// source had and the rest got only what it left. Now each draw is capped
// by BeltShare.cap: the source's stock at its first draw of the tick, split
// between the buildings that drew on it last tick by water-filling (a
// building wanting less than an even share gets all it wants, and the rest
// is split evenly among the others). One consumer per source, or plenty of
// stock to go round, behaves exactly as before. A building new to a source
// gets an even slice until the next tick counts it.
//
// The split follows the belt, not a head count: wherever the routes to the
// claimants part ways the stock divides evenly between the ways on (two ways,
// half each; three, a third each), and each part divides again at the next
// fork down its branch. A branch that wants less than its part passes the
// rest to the others. Two machines on one branch and one on the other get a
// quarter, a quarter and a half.
//
// A building must claim (call cap) every tick it wants material, stock or no
// stock: one that only asks when it sees stock never gets a share from a
// source an earlier-ticking neighbour has just emptied.
// Shares are kept per `kind`, since a source's outputs are separate stocks
// (a Fusion Fuel Plant's D-T and D-He3 pellets).
const BeltShare = (() => {
  const S = new WeakMap();   // source -> { kind: { tick, base, prev: Map(dst->want), cur, alloc } }
  // Route steps are BeltCargo tile keys, "c,r".
  function _splitterOn(k) {
    const i = k.indexOf(',');
    const b = beltOf(GridManager.getEntity(+k.slice(0, i), +k.slice(i + 1)));
    return b && b._splitter ? b : null;
  }
  function _splitFavKey(sp, k) {
    const i = k.indexOf(','), [dc, dr] = SPLIT_SIDES[sp._splitSide || 0];
    return (+k.slice(0, i) + dc) + ',' + (+k.slice(i + 1) + dr);
  }
  function forkfill(base, wants, src, kind) {
    const out = new Map();
    const route = (d) => (kind && typeof BeltCargo !== 'undefined' && BeltCargo.route) ? BeltCargo.route(src, d, kind) : null;
    const all = [...wants].map(([d, w]) => ({ d, w, p: route(d) }));
    // `list` shares the first `depth` tiles of its routes; split `amount` at
    // the tile where they stop agreeing.
    const split = (list, amount, depth) => {
      if (list.length === 1) { out.set(list[0].d, Math.min(list[0].w, amount)); return; }
      const first = list[0].p;
      while (first && depth < first.length && list.every(x => x.p && x.p[depth] === first[depth])) depth++;
      const groups = new Map();
      list.forEach((x, i) => {
        const k = x.p && depth < x.p.length ? x.p[depth] : '#' + i;   // off the belt, or at its own door
        let g = groups.get(k);
        if (!g) groups.set(k, g = { list: [], want: 0 });
        g.list.push(x); g.want += x.w;
      });
      const arr = [...groups.values()].sort((a, b) => a.want - b.want);
      // A Conveyor Splitter on the fork tile sets the division instead.
      // Priority: its favoured way is filled first, the rest share what is
      // left. Ratio: the favoured way gets its share and the others theirs,
      // and either side's unused part goes to the other.
      const fork = depth > 0 && first ? first[depth - 1] : null;
      const sp = fork ? _splitterOn(fork) : null;
      const fav = sp && sp._splitMode !== 'even' ? groups.get(_splitFavKey(sp, fork)) : null;
      if (fav && arr.length > 1) {
        const rest = arr.filter(g => g !== fav);
        const restWant = rest.reduce((s, g) => s + g.want, 0);
        const favGive = sp._splitMode === 'priority' ? Math.min(fav.want, amount)
                      : Math.min(fav.want, Math.max(amount * sp._splitRatio, amount - restWant));
        split(fav.list, favGive, depth + 1);
        let left = amount - favGive, n = rest.length;
        for (const g of rest) { const give = Math.min(g.want, left / n); split(g.list, give, depth + 1); left -= give; n--; }
        return;
      }
      let left = amount, n = arr.length;
      for (const g of arr) { const give = Math.min(g.want, left / n); split(g.list, give, depth + 1); left -= give; n--; }
    };
    split(all, base, 0);
    return out;
  }
  return {
    // The most `dst` may take from `src` this tick. `stock` is what src holds
    // now (read at the source's first draw of the tick), `want` what dst is after.
    cap(src, dst, stock, want, kind) {
      if (!src || !dst || !(want > 0)) return Infinity;
      let m = S.get(src);
      if (!m) S.set(src, m = {});
      let s = m[kind || ''];
      if (!s) s = m[kind || ''] = { tick: -1, base: 0, prev: null, cur: new Map(), alloc: null };
      if (s.tick !== SIM_TICK_ID) {
        s.prev  = s.tick === SIM_TICK_ID - 1 ? s.cur : null;   // only last tick's claimants count
        s.cur   = new Map();
        s.tick  = SIM_TICK_ID;
        s.base  = Math.max(0, stock || 0);
        s.alloc = null;
      }
      s.cur.set(dst, (s.cur.get(dst) || 0) + want);
      const prev = s.prev;
      if (!prev || prev.size === 0 || (prev.size === 1 && prev.has(dst))) return Infinity;
      if (!s.alloc) s.alloc = forkfill(s.base, prev, src, kind);
      return s.alloc.has(dst) ? s.alloc.get(dst) : s.base / (prev.size + 1);
    },
  };
})();

// True once per wholesale change of the map (a save loaded, a contract trip):
// the registry's change counter jumps by thousands between two looks at it,
// which ordinary building never does. The run caches below drop everything
// when it does, rather than go on holding the old map's entities.
function _worldReplaced(state) {
  const topo = EntityRegistry.getTopologyVersion();
  const jumped = Math.abs(topo - state.topo) > 5000;
  state.topo = topo;
  return jumped;
}

// Every pipe on the map: surface, underground, and those lying under a wire
// or a belt, in that order. Each fluid system wipes its "carrying X" flag off
// all of them at the top of its tick, and each used to walk every pipe, belt
// and wire in the registry to do it — seventeen times a tick. The list is
// gathered once per tick (and again if anything is built or removed mid-tick)
// and shared.
let _allPipesTick = -1, _allPipesTopo = -1;
const _allPipes = [];
function allPipes() {
  const topo = EntityRegistry.getTopologyVersion();
  if (_allPipesTick === SIM_TICK_ID && _allPipesTopo === topo) return _allPipes;
  _allPipesTick = SIM_TICK_ID; _allPipesTopo = topo;
  _allPipes.length = 0;
  for (const e of EntityRegistry.getByType(T.PIPE))         _allPipes.push(e);
  for (const e of EntityRegistry.getByType(T.UNDERGNDPIPE)) _allPipes.push(e);
  for (const e of EntityRegistry.getByType(T.CONVEYOR)) if (e._underPipe) _allPipes.push(e._underPipe);
  for (const e of EntityRegistry.getByType(T.WIRE))     if (e._underPipe) _allPipes.push(e._underPipe);
  return _allPipes;
}

/* ── Pipe runs ───────────────────────────────────────────────────────
   Nearly every machine asks the same question every tick: starting from
   this stub, which pipe tiles can `fluid` reach, and what do they touch?
   Each one answered it with its own flood fill, so a steam line was walked
   once per turbine and a cooling line once per tower, ten times a second —
   on a built-up map, most of the logic tick.

   pipeRun(c, r, fluid) is that walk, kept. It visits exactly the tiles the
   hand-written fills did, in the same order (breadth-first from the stub,
   neighbours in pipeBfsCoords order):

     run.n                      pipe tiles reached
     run.c[i], run.r[i]         where each one is
     run.pipe[i]                the pipe entity there (under a wire or belt
                                if need be)
     run.top[i]                 what is on top of that tile: the pipe itself,
                                or the wire or belt laid over it
     run.pn                     "ports": every non-pipe thing a reached tile
                                touches, in walk order
     run.pe[j]                  the entity (a building, a truck, a tree…)
     run.pc[j], run.pr[j]       the tile of it that was touched
     run.ptc[j], run.ptr[j]     the pipe tile it was touched FROM — what the
                                OUT-stub tests (atOutPort) compare against
     run.par[i]                 the tile the walk reached tile i from (an index
                                into the run), or -1 for a tile it started on —
                                which way the fluid flows along the run
     run.an, run.ae[k],         every non-pipe thing on any of a reached tile's
       run.atc[k], run.atr[k]   four sides, and the tile it sits beside — ports
                                above leaves out the sides an underground pipe
                                does not open onto; this does not
     pipeRunHas(run, c, r)      is tile (c,r) one of the pipe tiles reached?

   pipeRunFrom(seeds, fluid, blockC, blockR) is the same walk started from
   several tiles at once ([c0, r0, c1, r1, …], as one flood), optionally
   treating one tile as a wall (a tank's other stub, so a loop of pipe back
   to it is not walked through).

   A kept run is only handed back if the world still agrees with it:
     • once per tick (and again whenever something is built, removed or
       linked mid-tick) every tile of the run and every tile bordering it is
       checked to be the same entity with the same pipe links, and the
       underground pipes to be where they were;
     • on every call, every pipe is checked to still accept the fluid, and
       every bordering pipe that refused it to still refuse — those flags
       change within a tick as each fluid system clears and re-marks.
   Anything else and the run is walked afresh, so this returns what a fresh
   flood fill would, always. The arrays belong to the cache: read, don't
   write.
   ─────────────────────────────────────────────────────────────────── */
const PipeRuns = (() => {
  const byFluid = new Map();        // fluid -> Map<startKey, run>
  const byKey   = new Map();        // "fluid|wall|seeds" -> run, for pipeRunFrom
  let linkEpoch = 0;                // bumped whenever a pipe's _links change
  let count = 0;

  let _udgSig = 0, _udgTick = -1, _udgTopo = -1;
  function udgSignature() {
    const topo = EntityRegistry.getTopologyVersion();
    if (_udgTick === SIM_TICK_ID && _udgTopo === topo) return _udgSig;
    let h = 7;
    for (const u of EntityRegistry.getByType(T.UNDERGNDPIPE))
      h = (Math.imul(h, 31) + u.col * 4099 + u.row * 4 + (u._udgAxis === 'h' ? 1 : u._udgAxis === 'v' ? 2 : 0) + (u._udgNeg || 0) * 16 + (u._udgPos || 0) * 256) | 0;
    _udgSig = h; _udgTick = SIM_TICK_ID; _udgTopo = topo;
    return h;
  }

  const _D4 = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  const keyOf = (c, r) => (r + 16) * 4096 + (c + 16);

  // seeds: [c0, r0, c1, r1, …]. wallKey: keyOf() of a tile the walk may not
  // enter, or -1.
  function build(seeds, fluid, wallKey) {
    const tiles = GridManager.tiles;
    const inRun = new Set();
    const run = {
      fluid, n: 0, c: [], r: [], pipe: [], top: [], par: [], _links: [],
      pn: 0, pe: [], pc: [], pr: [], ptc: [], ptr: [],
      an: 0, ae: [], atc: [], atr: [],
      _in: inRun,
      _bn: 0, _bc: [], _br: [], _bTop: [], _bPipe: [], _bLinks: [], _bAllow: [],
      _tick: SIM_TICK_ID, _topo: EntityRegistry.getTopologyVersion(), _linkEp: linkEpoch, _udg: udgSignature(),
    };
    const allows = (p) => { if (!fluid) return true; const cur = pipeCurrentFluid(p); return cur === null || cur === fluid; };
    const visited = new Set();
    const qc = [], qr = [], qp = [];
    for (let s = 0; s + 1 < seeds.length; s += 2) { qc.push(seeds[s]); qr.push(seeds[s + 1]); qp.push(-1); }
    for (let head = 0; head < qc.length; head++) {
      const c = qc[head], r = qr[head];
      const key = keyOf(c, r);
      if (visited.has(key)) continue;
      visited.add(key);
      if (key === wallKey) continue;
      if (!GridManager.inBounds(c, r)) continue;
      const top = tiles[r][c];
      const p = top ? getPipe(top) : null;
      if (!p || !allows(p)) continue;
      inRun.add(key);
      const idx = run.n++;
      run.c.push(c); run.r.push(r); run.pipe.push(p); run.top.push(top); run.par.push(qp[head]); run._links.push(p._links);
      const nbs = pipeBfsCoords(c, r, fluid);
      for (let k = 0; k < nbs.length; k++) {
        const nc = nbs[k][0], nr = nbs[k][1];
        if (!GridManager.inBounds(nc, nr)) continue;
        const nb = tiles[nr][nc];
        if (nb && !getPipe(nb)) {
          run.pe.push(nb); run.pc.push(nc); run.pr.push(nr); run.ptc.push(c); run.ptr.push(r);
          run.pn++;
        }
        if (!visited.has(keyOf(nc, nr))) { qc.push(nc); qr.push(nr); qp.push(idx); }
      }
    }
    // The border: every tile next to the run (and every tunnel mouth an
    // underground pipe in it could pair with) that is not part of it. If any
    // of these changes hands, the run may no longer be what a fresh walk
    // would find.
    const bSeen = new Set();
    const border = (c, r) => {
      if (!GridManager.inBounds(c, r)) return;
      const key = keyOf(c, r);
      if (inRun.has(key) || bSeen.has(key)) return;
      bSeen.add(key);
      const top = tiles[r][c];
      const p = top ? getPipe(top) : null;
      run._bc.push(c); run._br.push(r); run._bTop.push(top); run._bPipe.push(p);
      run._bLinks.push(p ? p._links : undefined);
      run._bAllow.push(p ? allows(p) : false);
      run._bn++;
    };
    if (run.n === 0) for (let s = 0; s + 1 < seeds.length; s += 2) border(seeds[s], seeds[s + 1]);
    for (let i = 0; i < run.n; i++) {
      const c = run.c[i], r = run.r[i];
      for (let k = 0; k < 4; k++) {
        const nc = c + _D4[k][0], nr = r + _D4[k][1];
        border(nc, nr);
        if (!GridManager.inBounds(nc, nr)) continue;
        const nb = tiles[nr][nc];
        if (nb && !getPipe(nb)) { run.ae.push(nb); run.atc.push(c); run.atr.push(r); run.an++; }
      }
      const top = run.top[i];
      if (top.type === T.UNDERGNDPIPE && (top._udgAxis === 'h' || top._udgAxis === 'v')) {
        for (const d of (top._udgAxis === 'h' ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]])) {
          const partner = udgPartner(c, r, d[0], d[1], top._udgAxis);
          if (partner) border(partner[0], partner[1]);
        }
      }
    }
    group(run);
    return run;
  }

  // Runs walked from different stubs of one network cover the same tiles (a
  // steam line seeded from each of its turbines, a helium line from each of
  // its wells), and every one of them was checked tile by tile once a tick:
  // on a late-game map four times as many checks as there were networks. A
  // run built while another with exactly the same tiles is known good joins
  // it in a group, and one member's check then stands for all of them. Both
  // were read off the map in the same window (tick, build count, link epoch),
  // which the once-a-tick check already treats as a time nothing moves in, so
  // they hold the same entities, links and border and pass or fail together.
  // One that fails is walked afresh outside the group; the rest find out with
  // a check of their own.
  const byShape = new Map();        // "fluid|lowest tile key|n" -> a run with those tiles
  function group(run) {
    if (!run.n) return;
    let min = Infinity;
    for (let i = 0; i < run.n; i++) { const k = keyOf(run.c[i], run.r[i]); if (k < min) min = k; }
    const sk = run.fluid + '|' + min + '|' + run.n;
    const o = byShape.get(sk);
    if (o && o !== run && o._tick === run._tick && o._topo === run._topo && o._linkEp === run._linkEp
        && o._udg === run._udg && o._bn === run._bn) {
      let same = true;
      for (let i = 0; i < run.n && same; i++) if (!o._in.has(keyOf(run.c[i], run.r[i]))) same = false;
      if (same) { run._grp = o._grp || (o._grp = { tick: o._tick, topo: o._topo, linkEp: o._linkEp }); return; }
    }
    byShape.set(sk, run);
  }

  // Same entities, same links, same tunnels as when the run was walked?
  function structureHolds(run) {
    if (run._udg !== udgSignature()) return false;
    const tiles = GridManager.tiles;
    for (let i = 0; i < run.n; i++) {
      const top = tiles[run.r[i]][run.c[i]], p = run.pipe[i];
      if (top !== run.top[i] || getPipe(top) !== p || p._links !== run._links[i]) return false;
    }
    for (let j = 0; j < run._bn; j++) {
      const top = tiles[run._br[j]][run._bc[j]];
      if (top !== run._bTop[j]) return false;
      const p = run._bPipe[j];
      if ((top ? getPipe(top) : null) !== p) return false;
      if (p && p._links !== run._bLinks[j]) return false;
    }
    return true;
  }

  // Does every pipe still take (or still refuse) the fluid as it did?
  function fluidHolds(run) {
    const fluid = run.fluid;
    if (!fluid) return true;
    const pipes = run.pipe;
    for (let i = 0; i < run.n; i++) {
      const cur = pipeCurrentFluid(pipes[i]);
      if (cur !== null && cur !== fluid) return false;
    }
    for (let j = 0; j < run._bn; j++) {
      const p = run._bPipe[j];
      if (!p) continue;
      const cur = pipeCurrentFluid(p);
      if ((cur === null || cur === fluid) !== run._bAllow[j]) return false;
    }
    return true;
  }

  // Is a kept run still what a fresh walk would find?
  function holds(run) {
    const topo = EntityRegistry.getTopologyVersion();
    if (run._tick !== SIM_TICK_ID || run._topo !== topo || run._linkEp !== linkEpoch) {
      const g = run._grp;
      if (!(g && g.tick === SIM_TICK_ID && g.topo === topo && g.linkEp === linkEpoch)) {
        if (!structureHolds(run)) return false;
        if (g) { g.tick = SIM_TICK_ID; g.topo = topo; g.linkEp = linkEpoch; }
      }
      run._tick = SIM_TICK_ID; run._topo = topo; run._linkEp = linkEpoch;
    }
    return fluidHolds(run);
  }

  // Stubs come and go as buildings do; don't keep their runs forever.
  function made() { if (++count > 4000) { byFluid.clear(); byKey.clear(); byShape.clear(); count = 1; } }

  const _world = { topo: 0 };

  function get(c, r, fluid) {
    fluid = fluid || null;
    if (_worldReplaced(_world)) { byFluid.clear(); byKey.clear(); byShape.clear(); count = 0; }
    const key = keyOf(c, r);
    let m = byFluid.get(fluid);
    let run = m && m.get(key);
    if (run && holds(run)) return run;
    if (!run) made();
    run = build([c, r], fluid, -1);
    m = byFluid.get(fluid);
    if (!m) { m = new Map(); byFluid.set(fluid, m); }
    m.set(key, run);
    return run;
  }

  function getFrom(seeds, fluid, wallC, wallR) {
    fluid = fluid || null;
    if (_worldReplaced(_world)) { byFluid.clear(); byKey.clear(); byShape.clear(); count = 0; }
    const wallKey = wallC === undefined || wallC === null ? -1 : keyOf(wallC, wallR);
    const key = fluid + '|' + wallKey + '|' + seeds.join(',');
    let run = byKey.get(key);
    if (run && holds(run)) return run;
    if (!run) made();
    run = build(seeds, fluid, wallKey);
    byKey.set(key, run);
    return run;
  }

  return {
    get, getFrom,
    has(run, c, r) { return run._in.has(keyOf(c, r)); },
    linksChanged() { linkEpoch++; },
    // For walks kept elsewhere and checked the same way (oil_system.js's tank stubs).
    linkEpoch() { return linkEpoch; },
    udgSignature,
    clear() { byFluid.clear(); byKey.clear(); byShape.clear(); count = 0; },
  };
})();
function pipeRun(c, r, fluid) { return PipeRuns.get(c, r, fluid); }
function pipeRunFrom(seeds, fluid, wallC, wallR) { return PipeRuns.getFrom(seeds, fluid, wallC, wallR); }
function pipeRunHas(run, c, r) { return PipeRuns.has(run, c, r); }

// Whether `fluid` has reached the pipe on a building's IN stub, as the player
// sees it. A newly lit line fills from its source at a few tiles a second
// (PipeFill), and the building at the end takes nothing in until the front
// has run all the way to its door. `p` may be the pipe or whatever lies over
// it. Without the renderer (no PipeFill) the fluid is there at once.
// Some producers flag the wire or belt laid over a pipe rather than the pipe
// under it, which is then drawn dry and never seen to fill; a stub like that
// isn't held back. (Water is always marked on the pipe; a wire's own
// `powered` is its electricity.)
const _FLUID_FLAG = {
  oil: '_oilActive', fueloil: '_fuelOilActive', lpg: '_lpgActive', acid: '_acidActive',
  steam: '_steamActive', cool: '_coolActive', cryocool: '_cryoCoolActive', hydrogen: '_hydrogenActive',
  nitrogen: '_nitrogenActive', ammonia: '_ammoniaActive', deuterium: '_deuteriumActive',
  highbeta: '_highBetaActive', helium: '_heliumActive', liquidhe: '_liquidHeActive',
  tritium: '_tritiumActive', helium3: '_he3Active',
};
function pipeArrived(p, fluid) {
  if (typeof PipeFill === 'undefined') return true;
  const pipe = getPipe(p);
  if (!pipe) return false;
  const flag = _FLUID_FLAG[fluid];
  if (pipe !== p && flag && p[flag] && !pipe[flag]) return true;
  return PipeFill.arrived(pipe, fluid);
}
function pipeArrivedAt(c, r, fluid) {
  return GridManager.inBounds(c, r) && pipeArrived(GridManager.getEntity(c, r), fluid);
}

/* ── Belt runs ───────────────────────────────────────────────────────
   The conveyor twin of pipeRun above. A machine looking back along its IN
   belt for a mine, or stamping its OUT belt with what it carries, flooded
   the belt from its stub every tick; beltRun(c, r) is that flood, kept.

   It records every tile the hand-written walks visited, in the order they
   visited them (breadth-first from the stub, stepping on through belt
   tiles only):

     run.n                 tiles visited that had something on them
     run.c[i], run.r[i]    where
     run.ent[i]            what is on top of the tile — a belt, a pipe
                           laid over a belt, or the building the belt ran
                           into
     run.belt[i]           whether it is a belt tile (isConveyorTile)
     run.par[i]            the tile the walk stepped from to get here (an
                           index into the run; -1 for the stub it started
                           on) — the "arrived by this port" tests need it
     run.d[i]              steps from the stub

   beltRun(c, r, flag) walks on only through belt tiles that carry `flag`
   (a belt marked as carrying lithium compound, say), as the walks that
   follow one material's flags do.

   Kept runs are checked like pipe runs: once a tick (and after anything is
   built or removed) every visited tile and every empty tile the walk
   looked at must be as it was, and the underground belts where they were;
   a flag-following run also has its flags re-read on every call. The
   arrays belong to the cache: read, don't write.
   ─────────────────────────────────────────────────────────────────── */
const BeltRuns = (() => {
  const byGate = new Map();   // flag ('' for none) -> Map<startKey, run>
  let count = 0;
  const keyOf = (c, r) => (r + 16) * 4096 + (c + 16);

  let _udgSig = 0, _udgTick = -1, _udgTopo = -1;
  function udgSignature() {
    const topo = EntityRegistry.getTopologyVersion();
    if (_udgTick === SIM_TICK_ID && _udgTopo === topo) return _udgSig;
    let h = 7;
    const mix = (b) => { h = (Math.imul(h, 31) + b.col * 4099 + b.row * 4 + (b._udgAxis === 'h' ? 1 : b._udgAxis === 'v' ? 2 : 3) + (b._udgNeg || 0) * 16 + (b._udgPos || 0) * 256) | 0; };
    for (const b of EntityRegistry.getByType(T.CONVEYOR)) if (b._udgBelt) mix(b);
    for (const t of [T.PIPE, T.UNDERGNDPIPE])
      for (const q of EntityRegistry.getByType(t)) if (q._underConveyor && q._underConveyor._udgBelt) mix(q._underConveyor);
    _udgSig = h; _udgTick = SIM_TICK_ID; _udgTopo = topo;
    return h;
  }

  function build(c0, r0, gate) {
    const run = {
      n: 0, c: [], r: [], ent: [], belt: [], par: [], d: [],
      _gate: gate, _open: [], _bn: 0, _bc: [], _br: [],
      _tick: SIM_TICK_ID, _topo: EntityRegistry.getTopologyVersion(), _udg: udgSignature(), _links: BELT_LINK_EPOCH,
    };
    const visited = new Set();
    const qc = [c0], qr = [r0], qp = [-1];
    for (let head = 0; head < qc.length; head++) {
      const c = qc[head], r = qr[head];
      const key = keyOf(c, r);
      if (visited.has(key)) continue;
      visited.add(key);
      const ent = GridManager.getEntity(c, r);
      if (!ent) { run._bc.push(c); run._br.push(r); run._bn++; continue; }
      const idx = run.n++, par = qp[head];
      const isBelt = !!isConveyorTile(ent);
      const open = isBelt && (!gate || !!ent[gate]);
      run.c.push(c); run.r.push(r); run.ent.push(ent); run.belt.push(isBelt); run._open.push(open);
      run.par.push(par); run.d.push(par < 0 ? 0 : run.d[par] + 1);
      if (!open) continue;
      const steps = beltSteps(c, r);
      for (let k = 0; k < steps.length; k++) { qc.push(c + steps[k][0]); qr.push(r + steps[k][1]); qp.push(idx); }
    }
    group(run);
    return run;
  }

  // Runs over exactly the same tiles share their once-a-tick check, as pipe
  // runs do (see PipeRuns' group()). A belt run's walk follows the belts'
  // own directions, so the same tiles seen from two stubs also means the
  // same empty tiles stepped onto.
  const byShape = new Map();        // "gate|lowest tile key|n" -> a run with those tiles
  function group(run) {
    if (!run.n) return;
    let min = Infinity;
    const keys = new Set();
    for (let i = 0; i < run.n; i++) { const k = keyOf(run.c[i], run.r[i]); keys.add(k); if (k < min) min = k; }
    run._keys = keys;
    const bkeys = new Set();
    for (let j = 0; j < run._bn; j++) bkeys.add(keyOf(run._bc[j], run._br[j]));
    run._bkeys = bkeys;
    const sk = run._gate + '|' + min + '|' + run.n;
    const o = byShape.get(sk);
    if (o && o !== run && o._tick === run._tick && o._topo === run._topo && o._links === run._links
        && o._udg === run._udg && o._bn === run._bn) {
      let same = true;
      for (let i = 0; i < run.n && same; i++) if (!o._keys.has(keyOf(run.c[i], run.r[i]))) same = false;
      if (o._bkeys.size !== bkeys.size) same = false;
      for (const k of bkeys) if (!same || !o._bkeys.has(k)) { same = false; break; }
      if (same) { run._grp = o._grp || (o._grp = { tick: o._tick, topo: o._topo, links: o._links }); return; }
    }
    byShape.set(sk, run);
  }

  function structureHolds(run) {
    if (run._links !== BELT_LINK_EPOCH) return false;
    if (run._udg !== udgSignature()) return false;
    const tiles = GridManager.tiles;
    for (let i = 0; i < run.n; i++) {
      const ent = tiles[run.r[i]][run.c[i]];
      if (ent !== run.ent[i] || !!isConveyorTile(ent) !== run.belt[i]) return false;
    }
    for (let j = 0; j < run._bn; j++) if (GridManager.getEntity(run._bc[j], run._br[j])) return false;
    return true;
  }

  function flagsHold(run) {
    const gate = run._gate;
    if (!gate) return true;
    for (let i = 0; i < run.n; i++) if (run.belt[i] && !!run.ent[i][gate] !== run._open[i]) return false;
    return true;
  }

  const _world = { topo: 0 };

  function get(c, r, gate) {
    gate = gate || '';
    if (_worldReplaced(_world)) { byGate.clear(); byShape.clear(); count = 0; }
    const key = keyOf(c, r);
    let m = byGate.get(gate);
    let run = m && m.get(key);
    if (run) {
      const topo = EntityRegistry.getTopologyVersion();
      let ok = true;
      if (run._tick !== SIM_TICK_ID || run._topo !== topo) {
        const g = run._grp;
        if (g && g.tick === SIM_TICK_ID && g.topo === topo && g.links === BELT_LINK_EPOCH && run._links === BELT_LINK_EPOCH) ok = true;
        else {
          ok = structureHolds(run);
          if (ok && g) { g.tick = SIM_TICK_ID; g.topo = topo; g.links = BELT_LINK_EPOCH; }
        }
        if (ok) { run._tick = SIM_TICK_ID; run._topo = topo; }
      }
      if (ok && flagsHold(run)) return run;
    } else if (++count > 4000) {
      byGate.clear(); byShape.clear(); count = 1;   // stubs come and go as buildings do
    }
    run = build(c, r, gate);
    m = byGate.get(gate);
    if (!m) { m = new Map(); byGate.set(gate, m); }
    m.set(key, run);
    return run;
  }

  return { get, clear() { byGate.clear(); byShape.clear(); count = 0; } };
})();
function beltRun(c, r, gate) { return BeltRuns.get(c, r, gate); }

/* ── Deposit depletion alerts ────────────────────────────────────────
   Two warnings per deposit, as notification cards only. Deliberately not
   toasts: a toast slides away after a few seconds, and "the thing your
   generators burn is about to run out" is exactly the kind of news that
   needs to still be on screen when the player next looks at the stack.

     LOW    at 10% remaining — amber, dismissible, click to jump to it
     EMPTY  at 0%            — red and glowing, the urgent one

   Tagged per deposit so a card never stacks with itself, and latched on
   the deposit entity so each warning fires once instead of every tick.
   The latches are not saved, so a reload re-arms them — the right way
   round, since re-warning once about a dead deposit beats silently
   swallowing the only notice the player gets.
   ─────────────────────────────────────────────────────────────────── */
const DEPOSIT_LOW_FRACTION = 0.10;

const DEPOSIT_KINDS = {
  coal:    { icon: '⛏', noun: 'Coal',    offline: 'Mine is offline' },
  oil:     { icon: '🛢', noun: 'Oil',     offline: 'Pump jack is offline' },
  uranium: { icon: '☢', noun: 'Uranium', offline: 'Mine is offline' },
  sulfur:  { icon: '🜍', noun: 'Sulfur',  offline: 'Mine is offline' },
  lithium: { icon: '💎', noun: 'Lithium', offline: 'Mine is offline' },
  helium:  { icon: '🎈', noun: 'Helium',  offline: 'Well is offline' },
  rareearth: { icon: '🧲', noun: 'Rare earth', offline: 'Mine is offline' },
};

// Take down both cards for a deposit that is leaving the map. Called from
// EntityRegistry.remove(), which every route that removes a mine, well or
// pump jack over a worked-out deposit goes through (the Delete tool, undo,
// sweeps), so a card can't outlive the thing it points at.
function dismissDepositAlerts(deposit) {
  if (!deposit || typeof NotificationStack === 'undefined') return;
  const kindKey = deposit.type === T.COALDEPOSIT ? 'coal' : deposit.type === T.OILDEPOSIT ? 'oil'
    : deposit.type === T.URANIUMDEPOSIT ? 'uranium' : deposit.type === T.SULFURDEPOSIT ? 'sulfur'
    : deposit.type === T.LITHIUMDEPOSIT ? 'lithium' : deposit.type === T.HELIUMDEPOSIT ? 'helium'
    : deposit.type === T.RAREEARTHDEPOSIT ? 'rareearth' : null;
  if (!kindKey) return;
  const base = `deposit-${kindKey}-${deposit.col}-${deposit.row}`;
  NotificationStack.dismissTag(base + '-low');
  NotificationStack.dismissTag(base + '-empty');
}

// `remaining` is 0..1. Call it every tick the deposit is being worked; it
// decides for itself whether anything needs saying.
function checkDepositDepletion(deposit, remaining, kindKey) {
  if (!deposit || typeof NotificationStack === 'undefined') return;
  const kind = DEPOSIT_KINDS[kindKey];
  if (!kind) return;
  const base = `deposit-${kindKey}-${deposit.col}-${deposit.row}`;
  const jump = () => Camera.recentreOn(
    (deposit.col + (deposit.width  || 1) * 0.5) * TILE,
    (deposit.row + (deposit.height || 1) * 0.5) * TILE);

  if (remaining <= 0) {
    if (deposit._emptyNotified) return;
    deposit._emptyNotified = true;
    deposit._lowNotified   = true;   // the low card is moot now
    NotificationStack.dismissTag(base + '-low');
    NotificationStack.push({
      icon:    kind.icon,
      title:   `${kind.noun} deposit exhausted`,
      message: `${kind.offline}: click to jump there`,
      color:   '#ff4020',
      border:  '#702010',
      tag:     base + '-empty',
      glow:    true,
      onClick: jump,
    });
    return;
  }

  // The low card stays up for as long as the deposit lasts, so its figure has
  // to keep pace with the seam: one still reading 10% while the deposit is
  // down to 3% is worse than no number at all. Floored at 1% so it never
  // claims 0% while the deposit is still producing — 0% is the exhausted
  // card's job, and it replaces this one the moment it applies.
  const lowTag = base + '-low';
  const lowMsg = `${Math.max(1, Math.round(remaining * 100))}% remaining: click to jump there`;

  if (deposit._lowNotified) {
    // Patched in place rather than re-pushed: re-pushing would re-announce
    // the card (sound and all) and, worse, would silently resurrect one the
    // player had dismissed. updateTag() no-ops on a dismissed card.
    NotificationStack.updateTag(lowTag, { message: lowMsg });
    return;
  }

  if (remaining <= DEPOSIT_LOW_FRACTION) {
    deposit._lowNotified = true;
    NotificationStack.push({
      icon:    kind.icon,
      title:   `${kind.noun} deposit running low`,
      message: lowMsg,
      color:   '#d0a030',
      border:  '#604010',
      tag:     lowTag,
      onClick: jump,
    });
  }
}

/* ───────────────────────────────────────────────────────────────────
   WASTE BUILDUP WARNING
   A building that fills its waste buffer stops running until a truck
   hauls it down, so warn while there's still time to send one: a card at
   WASTE_WARN_PCT, kept current as the buffer climbs, cleared once it has
   been hauled back under WASTE_REARM_PCT. The gap between the two keeps a
   buffer hovering around 90% from re-announcing itself on every pickup.
   Latched on the entity like the deposit cards above (and likewise not
   saved, so a reload re-warns once).
   ─────────────────────────────────────────────────────────────────── */
const WASTE_WARN_PCT  = 90;
const WASTE_REARM_PCT = 80;

// `pct` is the building's truck-hauled waste buffer, 0..100. Call every tick.
function checkWasteBuildup(e, pct, wasteNoun) {
  if (!e || typeof NotificationStack === 'undefined') return;
  // A cleanup job's units arrive full on purpose; the contract checklist
  // tracks them, and a card per unit would bury the screen on arrival.
  if (e._decommissioned) return;
  const tag = `waste-${e.type}-${e.col}-${e.row}`;

  if (e._wasteWarned) {
    if (pct < WASTE_REARM_PCT) {
      e._wasteWarned = false;
      NotificationStack.dismissTag(tag);
      return;
    }
    NotificationStack.updateTag(tag, { title: _wasteTitle(e, pct), message: _wasteMsg(pct, wasteNoun, e) });
    return;
  }
  if (pct < WASTE_WARN_PCT) return;

  e._wasteWarned = true;
  NotificationStack.push({
    icon:    (e.type === T.SPENTFUELPOOL || e._feedsPool) ? '☢' : '🚚',
    title:   _wasteTitle(e, pct),
    message: _wasteMsg(pct, wasteNoun, e),
    color:   '#d0a030',
    border:  '#604010',
    tag,
    glow:    true,
    onClick: () => Camera.recentreOn(
      (e.col + (e.width  || 1) * 0.5) * TILE,
      (e.row + (e.height || 1) * 0.5) * TILE),
  });
}

// The card stays up while the buffer keeps filling, so its heading is
// refreshed with the message: set once, it sat at the level that raised it
// while the line under it counted on.
function _wasteTitle(e, pct) {
  return `${EntityDefs[e.type]?.label || 'Building'} waste at ${Math.min(100, Math.floor(pct))}%`;
}

function _wasteMsg(pct, wasteNoun, e) {
  // No truck serves a Spent Fuel Pool, nor a reactor belted to one
  // (haulBlocked), so "send a truck" would point at a fix that never comes.
  if (e && e.type === T.SPENTFUELPOOL) {
    return pct >= 100
      ? `${wasteNoun} full: the reactors behind it will stop. Belt it out to a Reprocessing Plant. Click to jump there`
      : `${wasteNoun} ${Math.floor(pct)}% full: belt it out to a Reprocessing Plant before it fills. Click to jump there`;
  }
  if (e && e._feedsPool) {
    return pct >= 100
      ? `${wasteNoun} full: stopped. Its Spent Fuel Pool is not keeping up (full or unpowered). Click to jump there`
      : `${wasteNoun} ${Math.floor(pct)}% full: its Spent Fuel Pool is not keeping up (full or unpowered). Click to jump there`;
  }
  return pct >= 100
    ? `${wasteNoun} full: stopped until a truck hauls it away. Click to jump there`
    : `${wasteNoun} ${Math.floor(pct)}% full: send a truck before it stops. Click to jump there`;
}

const BiofuelSystem = (() => {
  let totalBiofuelCollected = 0;
  const BURN_RATE  = 1;     // biofuel/real-second
  const FULL_TANK  = 300;
  const MIN_TO_RUN = 25;
  const MAX_OUTPUT = 3;     // W

  function tick(dt) {
    const realDt = dt / (DevMode.timeScale || 1);
    for (const e of EntityRegistry.getByType(T.BIOFUELGEN)) {
      if (!e._biofuel) e._biofuel = 0;
      // Struck generators are offline: no output, and no fuel burned either.
      if (e._lightningDamaged) { e._biofuelOutput = 0; e.def.powerOutput = 0; continue; }
      // Always burn when running — so fuel drains to 0
      const _isRunning = (e._biofuelOutput || 0) > 0;
      if (_isRunning) {
        e._biofuel = Math.max(0, e._biofuel - BURN_RATE * realDt);
      }
      // Hysteresis: turn on at MIN_TO_RUN (25), turn off at 0
      const _wasOn = _isRunning;
      const _newOut = (_wasOn && e._biofuel > 0) || (!_wasOn && e._biofuel >= MIN_TO_RUN) ? MAX_OUTPUT : 0;
      e._biofuelOutput = _newOut;
      e.def.powerOutput = _newOut;
    }
  }

  function addFuel(amount) {
    const gens = EntityRegistry.getByType(T.BIOFUELGEN);
    if (!gens.size) return;
    for (const gen of gens) {
      if (!gen._biofuel) gen._biofuel = 0;
      gen._biofuel = Math.min(FULL_TANK, gen._biofuel + amount);
    }
    totalBiofuelCollected += amount;
  }

  // Harvested biofuel (trees, bushes, fish oil) follows the Deposit Supply
  // difficulty slider, like the coal, oil and ore a deposit holds.
  function _yieldMult() { return typeof Difficulty !== 'undefined' ? Difficulty.depositMult() : 1; }
  function scaleYield(n) { return Math.max(1, Math.round(n * _yieldMult())); }
  // Random whole-number yield in [lo, hi] before scaling.
  function rollYield(lo, hi) { return scaleYield(lo + Math.floor(Math.random() * (hi - lo + 1))); }
  function yieldRange(lo, hi) { const a = scaleYield(lo), b = scaleYield(hi); return a === b ? `${a}` : `${a}–${b}`; }

  function hasAnyRunning() {
    for (const e of EntityRegistry.getByType(T.BIOFUELGEN)) {
      if ((e._biofuel || 0) >= MIN_TO_RUN) return true;
    }
    return false;
  }

  function hasAnyPlaced() {
    return EntityRegistry.getByType(T.BIOFUELGEN).size > 0;
  }

  return {
    tick, addFuel, hasAnyRunning, hasAnyPlaced,
    scaleYield, rollYield, yieldRange,
    getTotalCollected:    () => totalBiofuelCollected,
    loadTotalCollected:  (v) => { totalBiofuelCollected = v || 0; },
    FULL_TANK, MIN_TO_RUN,
  };
})();


// True once a deposit has nothing left in it. Coal tracks tonnes and oil
// tracks pressure; uranium, sulfur and lithium carry an _oreAmount reserve
// (see mining_systems.js) that lasts far longer than a coal seam. Geothermal
// is still inexhaustible, so it never is.
// A worked-out deposit is removed along with the mine on it rather than
// being put back (input_manager.js, history_manager.js), and any left bare
// in an older save are cleared on load (save.js).
function isDepositExhausted(dep) {
  if (!dep) return false;
  if (dep.type === T.COALDEPOSIT) return dep.coalAmount !== undefined && dep.coalAmount <= 0;
  if (dep.type === T.OILDEPOSIT)  return dep._pressure  !== undefined && dep._pressure  <= 0;
  if (dep.type === T.URANIUMDEPOSIT || dep.type === T.SULFURDEPOSIT || dep.type === T.LITHIUMDEPOSIT || dep.type === T.HELIUMDEPOSIT
      || dep.type === T.RAREEARTHDEPOSIT)
    return dep._oreAmount !== undefined && dep._oreAmount <= 0;
  return false;
}
