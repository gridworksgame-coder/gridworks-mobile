/* ═══════════════════════════════════════════════════════════════════
   BELT CARGO
   What you see riding the conveyors. The simulation itself moves solids
   straight from a producer's buffer into a consumer's (CoalSystem,
   FuelPlantSystem, SolidStorageSystem …) — a belt holds nothing. This
   module turns those hand-offs into individual items travelling the
   actual belt between the two buildings, so the picture follows the sim:

     • Every hand-off calls BeltCargo.moved(src, dst, kind, amount) — that
       is what the machine at the far end has really received. Each
       KIND[kind].upi units of it becomes one item, spawned on the source's
       OUT stub and routed tile by tile to the IN stub of the building that
       took it. So items leave a building at the rate its stock really does,
       down the branch it really went.
     • Before a hand-off, the sim asks BeltCargo.reach(src, dst, kind). A
       line that has only just started says no until the head of the stream
       has had time to travel the belt, so a building's buffer starts to
       fill when the first item gets to its door and not the instant the
       belt is laid. Once a line is running it always says yes.
     • Routes are found from the producer's side (a walk along its OUT
       belt), so a line shows up even before anything has been delivered.
     • Items travel at SPEED tiles/s of game time (frozen while paused,
       faster on fast-forward) and never pass the one in front.
     • At the IN stub an item goes into the machine only as fast as the
       sim actually delivers to it (each delivered item's worth is one
       "eat" credit). A machine taking less than the source could send
       leaves a queue at its door; one that has stopped taking altogether
       (buffer full, no power, …) for BLOCK_T holds the head item at the
       machine face, and while the source still has stock it keeps pushing
       items on until the belt is packed solid back to the source — a
       backed-up line looks backed up.

   The items themselves are saved (serialise / loadState), so a reload
   puts every line back as it was; routes and delivery credits are
   re-derived from the running sim.
   ═══════════════════════════════════════════════════════════════════ */

const BeltCargo = (() => {
  const SPEED      = 1.2;   // tiles per game-second; renderConveyor's cleats run at the same speed
  const BLOCK_T    = 1.5;   // game-seconds without a delivery before a destination counts as not taking
  const PACK_SOLID = 20;    // items' worth of stock at a source that packs a backed-up belt right back to it
  const CREDIT_CAP = 3;     // items waiting to spawn per route — beyond that the belt is the limit
  const ROUTE_TTL  = 2000;  // ms a resolved route / routing field is trusted before it is re-walked

  // upi: units of the sim's quantity per item. Tuned so a line running at
  // its building's nominal rate shows roughly one item a second or so.
  // gap: centre-to-centre spacing (tiles) when items are packed nose to tail.
  const KIND = {
    coal:      { upi: 0.75,   gap: 0.30 },  // an MK1 Coal Mine digs ~1.65/s — about two lumps a second
    uranium:   { upi: 0.8,    gap: 0.34 },  // a Uranium Mine yields 0.8/s — one chunk a second
    sulfur:    { upi: 0.8,    gap: 0.34 },  // a Sulfur Mine yields 0.8/s
    lithium:   { upi: 15,     gap: 0.34 },  // a Lithium Mine yields 15/s
    compound:  { upi: 2.4,    gap: 0.40 },  // 2.4/s out of the Lithium Processing Plant (was 12, its old rate: one sack every five seconds)
    rods:      { upi: 1,      gap: 0.50 },  // one fuel assembly per rod
    mox:       { upi: 1,      gap: 0.50 },
    spent:     { upi: 0.6,    gap: 0.50 },  // a burned rod leaves 0.6 units of spent fuel
    pellets:   { upi: 0.625,  gap: 0.36 },  // 0.625/s out of the Fusion Fuel Plant
    he3pellets: { upi: 0.16,  gap: 0.36 },  // the split's D-He3 share: ~0.156/s, about one cartridge a second
    // One can is one unit, so each can into a Storage Container ticks its
    // whole-unit count up by one. At the Reprocessing Plant's full 0.0075/s
    // that is a can every ~133s (longer when fewer than ~3 reactors feed
    // it). upi 0.0075 showed a can a second; 0.1 still showed ten cans
    // per unit the container's count went up by.
    plutonium: { upi: 1,      gap: 0.36 },
    // Likewise one drum per unit: a drum every ~33s at the plant's 0.03/s,
    // where upi 0.03 showed one a second.
    recovered: { upi: 1,      gap: 0.38 },
    rareearth: { upi: 0.8,    gap: 0.34 },  // a Rare Earth Mine yields 0.8/s — one scoop of sand a second
    oxide:     { upi: 0.4,    gap: 0.40 },  // 0.4/s out of the Leach Plant — one sack a second
    tape:      { upi: 0.1,    gap: 0.46 },  // 0.1/s out of the Superconductor Mill — one spool a second
    coke:      { upi: 1.1,    gap: 0.32 },  // 1.1/s out of the Coke Oven Battery — one lump a second
    graphite:  { upi: 0.3,    gap: 0.42 },  // 0.3/s out of the Graphitization Furnace — one block a second
  };
  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  // Tile keys are numbers (every item asks for several each update, and
  // building "c,r" strings for them was a steady part of the cost). The
  // offset keeps a step just off the map edge, or a tunnel's long jump,
  // from wrapping onto another tile. route() still hands out "c,r" strings.
  const key = (c, r) => (r + 32) * 65536 + c + 32;
  const keyC = (k) => (k & 65535) - 32;
  const keyR = (k) => (k >>> 16) - 32;

  let _simTime = 0;
  let _lastFrame = 0;
  const _tiles  = new Map();   // tile key -> items on that tile
  const _lanes  = new Map();   // route key -> lane
  const _fields = new Map();   // dst port key -> { at, dist: Map }
  const _taken  = new WeakMap(); // dst entity -> { kind: game time of last delivery }
  const _eat    = new WeakMap(); // dst entity -> { kind: items' worth delivered, not yet eaten off the belt }
  // The picture may never show more than the sim has moved. A machine's real
  // intake (items/s, smoothed) sets how many items can honestly be on their
  // way to it: its rate times the belt's travel time, plus a little slack.
  // Anything queued beyond that while the line is flowing (left over from a
  // stretch when it backed up, or from a save) is absorbed at its door.
  const _inAcc  = new Map();   // dst entity -> { kind: { n: items handed over this window, t0: window start } }
  const _inRate = new Map();   // dst entity -> { kind: items per game-second, last full window }
  const RATE_WINDOW = 4;       // game-seconds per intake count
  const _gameNow = () => (typeof DayNight !== 'undefined' ? DayNight.getElapsed() : _simTime);
  const QUEUE_SLACK = 3;       // items over the in-transit figure a flowing line may still show
  // The last kind seen riding each tile, for the belt's info panel: the
  // flags producers stamp on their OUT belts come and go with stock (a
  // container's OUT belt is only flagged while it holds something), but an
  // item on the tile is what the sim actually moved along it.
  const _seenOn = new Map();   // tile key -> { kind, t }
  const SEEN_KEEP = 20;        // game-seconds a sighting counts
  // Items' worth a machine may have received but not yet seen arrive. Kept
  // small: anything a belt couldn't have carried anyway is simply not shown.
  // At 400, a fast-filling Storage Container banked hundreds of credits and
  // went on swallowing items long after it was full — so a full building
  // never held its queue at the door, and freeing one item's worth didn't
  // map to one item going in.
  const EAT_CAP = 4;
  const _found  = new WeakMap(); // producer -> { kind: { at, lanes, rr } } — its routes, from a walk along its OUT belt
  const STUCK_T = 3;             // game-seconds a routed item may sit with no way forward before it carries on loose
  const STRAY_T = 30;            // game-seconds a loose item may sit off its source's OUT belt before it is dropped
  const ACCEL   = 2.4;           // tiles/s² — up to belt speed in half a second
  const DECEL   = 3.2;           // tiles/s² — easing into the back of a queue
  const SCAN_MS = 2000;          // how often every stocked producer re-walks its OUT belt
  const TILE_CAP = 16;           // most items one tile can ever carry (a few per side, packed)
  let _scanAt = 0;
  // The re-walk is done a slice at a time over the frames that follow: with
  // dozens of stocked producers the whole pass is ~10ms, and done at once it
  // was a hitch every two seconds. The lists it builds are swapped in when
  // the pass completes.
  const SCAN_SLICE_MS = 0.5;
  let _scanQ = null, _scanI = 0, _scanLoose = [], _scanSpill = [];
  // Game time and real time not yet handed to update() — see render().
  const IDLE_STEP = 0.1;         // real seconds between updates while no item is on screen
  const WATCHED_STEP = 1 / 12;   // ...and while one is (see render(): drawn gliding between them)
  const FAR_STEP = 1 / 8;        // ...zoomed out to where an item is a dot of a few pixels
  const GLIDE_MAX = 0.25;        // tiles an item may travel between two updates (fast-forward updates more often)
  let _owed = 0, _owedReal = 0;
  let _updN = 0, _updAt = 0, _glideMs = 0, _frameN = 0;   // the latest update, and how long its glide lasts

  // Which buildings take each kind off a belt (their IN stubs: _dstPorts).
  let _DST = null;
  function _dstTypes(kind) {
    if (!_DST) _DST = {
      coal:      [T.COALGENERATOR, T.COKEOVEN, T.SOLIDSTORAGE],
      uranium:   [T.FUELPLANT, T.MOXPLANT, T.SOLIDSTORAGE],
      sulfur:    [T.CHEMICALPLANT, T.SOLIDSTORAGE],
      lithium:   [T.LITHIUMPROCESSPLANT, T.SOLIDSTORAGE],
      compound:  [T.TRITIUMBREEDER, T.HULKINGFUSIONREACTOR, T.SOLIDSTORAGE],
      rods:      [T.NUCLEARREACTOR, T.SOLIDSTORAGE],
      mox:       [T.ADVREACTOR, T.SOLIDSTORAGE],
      pellets:   [T.HULKINGFUSIONREACTOR, T.ADVFUSIONREACTOR, T.SOLIDSTORAGE],
      he3pellets: [T.ADVFUSIONREACTOR, T.SOLIDSTORAGE],
      plutonium: [T.MOXPLANT, T.SOLIDSTORAGE],
      recovered: [T.MOXPLANT, T.SOLIDSTORAGE],
      spent:     [T.SPENTFUELPOOL, T.REPROCESSOR],
      rareearth: [T.LEACHPLANT, T.SOLIDSTORAGE],
      oxide:     [T.SCMILL, T.SOLIDSTORAGE],
      tape:      [T.COREWORKS, T.SOLIDSTORAGE],
      coke:      [T.GRAPHITEFURNACE, T.SOLIDSTORAGE],
      graphite:  [T.ADVREACTOR, T.SOLIDSTORAGE],
    };
    return _DST[kind] || [];
  }
  // What a building sends out along its OUT belt(s).
  function _srcKinds(src) {
    switch (src.type) {
      case T.COALMINE: case T.COALMINE2: return ['coal'];
      case T.URANIUMMINE:  return ['uranium'];
      case T.SULFURMINE: case T.SULFURMINE2: return ['sulfur'];
      case T.LITHIUMMINE:  return ['lithium'];
      case T.RAREEARTHMINE: return ['rareearth'];
      case T.LEACHPLANT:   return ['oxide'];
      case T.SCMILL:       return ['tape'];
      case T.COKEOVEN:     return ['coke'];
      case T.GRAPHITEFURNACE: return ['graphite'];
      case T.SOLIDSTORAGE: return src._solidType ? [src._solidType] : [];
      case T.FUELPLANT:    return ['rods'];
      case T.MOXPLANT:     return ['mox'];
      case T.LITHIUMPROCESSPLANT: return ['compound'];
      case T.FUSIONFUELPLANT:     return ['pellets', 'he3pellets'];
      case T.REPROCESSOR:  return ['plutonium', 'recovered'];
      case T.NUCLEARREACTOR: case T.ADVREACTOR: case T.SPENTFUELPOOL: return ['spent'];
    }
    return [];
  }
  let _SRC_TYPES = null;
  const _srcTypes = () => _SRC_TYPES || (_SRC_TYPES = [T.COALMINE, T.COALMINE2, T.URANIUMMINE, T.SULFURMINE, T.SULFURMINE2, T.LITHIUMMINE,
    T.SOLIDSTORAGE, T.FUELPLANT, T.MOXPLANT, T.LITHIUMPROCESSPLANT, T.FUSIONFUELPLANT, T.REPROCESSOR,
    T.NUCLEARREACTOR, T.ADVREACTOR, T.SPENTFUELPOOL, T.RAREEARTHMINE, T.LEACHPLANT, T.SCMILL, T.COKEOVEN, T.GRAPHITEFURNACE]);

  const _alive = (e) => !!e && GridManager.getEntity(e.col, e.row) === e;
  const _beltAt = (c, r) => (typeof beltOf === 'function') ? beltOf(GridManager.getEntity(c, r)) : null;
  // beltSteps for a tile, kept until anything is built, removed or re-linked
  // (and for a second at most regardless: see update()). A drag-linked belt
  // works its ways out afresh, into a new list, every time it is asked, and
  // routing walks, hops and the scan ask about the same tiles over and over.
  const _stepsMemo = new Map();
  let _stepsTopo = -1, _stepsLinks = -1;
  function _steps(c, r) {
    const topo = EntityRegistry.getTopologyVersion();
    if (topo !== _stepsTopo || BELT_LINK_EPOCH !== _stepsLinks) { _stepsMemo.clear(); _stepsTopo = topo; _stepsLinks = BELT_LINK_EPOCH; }
    const k = key(c, r);
    let s = _stepsMemo.get(k);
    if (s === undefined) { s = beltSteps(c, r); _stepsMemo.set(k, s); }
    return s;
  }

  // ── Stub tables ─────────────────────────────────────────────────
  // The same stubs each system's own belt walk uses.
  function _srcPorts(src, kind) {
    try {
      switch (src.type) {
        case T.COALMINE: case T.COALMINE2: return [CoalSystem.mineOutputPort(src)];
        case T.URANIUMMINE:  return [UraniumSystem.outputPort(src)];
        case T.SULFURMINE: case T.SULFURMINE2: return [SulfurSystem.outputPort(src)];
        case T.LITHIUMMINE:  return [LithiumSystem.outputPort(src)];
        case T.RAREEARTHMINE: return [RareEarthSystem.outputPort(src)];
        case T.LEACHPLANT:   return [LeachPlantSystem.getStubs(src).oxideOut];
        case T.SCMILL:       return [SuperconductorMillSystem.getStubs(src).tapeOut];
        case T.COKEOVEN:     return [CokeOvenSystem.getStubs(src).cokeOut];
        case T.GRAPHITEFURNACE: return [GraphiteFurnaceSystem.getStubs(src).graphiteOut];
        case T.SOLIDSTORAGE: return [SolidStorageSystem.ports(src).out];
        case T.FUELPLANT:    return [FuelPlantSystem.getStubs(src).convOut];
        case T.MOXPLANT:     return [MoxPlantSystem.getStubs(src).moxOut];
        case T.LITHIUMPROCESSPLANT: return [LithiumProcessPlantSystem.getStubs(src).compoundOut];
        case T.FUSIONFUELPLANT: { const s = FusionFuelPlantSystem.getStubs(src); return [kind === 'he3pellets' ? s.he3PelletOut : s.plasmaOut]; }
        case T.REPROCESSOR: { const s = ReprocessingSystem.getStubs(src); return [kind === 'plutonium' ? s.plutoniumOut : s.recoveredOut]; }
        case T.NUCLEARREACTOR: case T.ADVREACTOR: return [NuclearSystem.getStubs(src).wasteOut];
        case T.SPENTFUELPOOL: return [SpentFuelPoolSystem.getStubs(src).spentOut];
      }
    } catch (_e) {}
    return [];
  }
  function _dstPorts(dst, kind) {
    try {
      switch (dst.type) {
        case T.COALGENERATOR: return CoalSystem.generatorInputPort(dst) || [];
        case T.SOLIDSTORAGE:  return [SolidStorageSystem.ports(dst).in];
        case T.CHEMICALPLANT: return [ChemicalSystem.getStubs(dst).convStubs[0]];
        case T.FUELPLANT:     return [FuelPlantSystem.getStubs(dst).convIn];
        case T.NUCLEARREACTOR: case T.ADVREACTOR: { const s = NuclearSystem.getStubs(dst); return [kind === 'graphite' ? s.graphiteIn : s.rodIn].filter(Boolean); }
        case T.LITHIUMPROCESSPLANT: return [LithiumProcessPlantSystem.getStubs(dst).oreIn];
        case T.TRITIUMBREEDER: return [TritiumBreederSystem.getStubs(dst).compoundIn];
        case T.HULKINGFUSIONREACTOR: { const s = HulkingFusionReactorSystem.getStubs(dst); return [kind === 'pellets' ? s.plasmaIn : s.blanketIn]; }
        case T.ADVFUSIONREACTOR: return [AdvancedFusionReactorSystem.getStubs(dst).plasmaIn];
        case T.MOXPLANT: { const s = MoxPlantSystem.getStubs(dst); return [kind === 'plutonium' ? s.plutoniumIn : s.uraniumIn]; }
        case T.REPROCESSOR:   return [ReprocessingSystem.getStubs(dst).spentIn];
        case T.SPENTFUELPOOL: return [SpentFuelPoolSystem.getStubs(dst).spentIn];
        case T.LEACHPLANT:    return [LeachPlantSystem.getStubs(dst).oreIn];
        case T.SCMILL:        return [SuperconductorMillSystem.getStubs(dst).oxideIn];
        case T.COREWORKS:     return [CoreWorksSystem.getStubs(dst).tapeIn];
        case T.COKEOVEN:      return [CokeOvenSystem.getStubs(dst).coalIn];
        case T.GRAPHITEFURNACE: return [GraphiteFurnaceSystem.getStubs(dst).cokeIn];
      }
    } catch (_e) {}
    return [];
  }
  // Whether `src` may send anything out: not if it needs power and has none.
  function _canShip(src) {
    const d = (typeof EntityDefs !== 'undefined' && EntityDefs[src.type]) || src.def;
    return !(d && d.powerInput > 0) || !!src.powered;
  }
  // Stock the source still holds of `kind` — while there is some, a stalled
  // line keeps filling up. An unpowered producer's stock is not on offer
  // (see reach), so nothing is drawn leaving it.
  function _stock(src, kind) {
    if (!_canShip(src)) return 0;
    switch (src.type) {
      case T.COALMINE: case T.COALMINE2: return src._coalBuffer || 0;
      case T.URANIUMMINE:  return src._uraniumStored || 0;
      case T.SULFURMINE: case T.SULFURMINE2: return src._sulfurStored || 0;
      case T.LITHIUMMINE:  return src._lithiumStored || 0;
      case T.RAREEARTHMINE: return src._rareEarthStored || 0;
      case T.LEACHPLANT:   return src._oxide || 0;
      case T.SCMILL:       return src._tape || 0;
      case T.COKEOVEN:     return src._coke || 0;
      case T.GRAPHITEFURNACE: return src._graphite || 0;
      case T.SOLIDSTORAGE: return src._solidType === kind ? (src._stored || 0) : 0;
      case T.FUELPLANT:    return src._rods || 0;
      case T.MOXPLANT:     return src._mox || 0;
      case T.LITHIUMPROCESSPLANT: return src._compound || 0;
      case T.FUSIONFUELPLANT:     return kind === 'he3pellets' ? (src._he3Pellets || 0) : (src._plasma || 0);
      case T.REPROCESSOR:  return kind === 'plutonium' ? (src._plutonium || 0) : (src._recovered || 0);
      case T.NUCLEARREACTOR: case T.ADVREACTOR: return src._spentFuel || 0;
      case T.SPENTFUELPOOL: return src._ready || 0;
    }
    return 0;
  }
  // Of that, what `dst` can actually draw. A Storage Container only takes a
  // producer's surplus above the reserve it leaves for direct consumers
  // (SolidStorageSystem._pullFromBelt), so a plant sitting on less than that
  // sends the bin nothing — and its stock was drawn queued at the bin's door
  // for good (an idle Fuel Plant's last rods, waiting on a bin at 10%).
  function _offer(src, dst, kind) {
    const s = _stock(src, kind);
    if (!dst || dst.type !== T.SOLIDSTORAGE || src.type === T.SOLIDSTORAGE) return s;
    return Math.max(0, s - SolidStorageSystem.reserveOf(kind));
  }
  // Unit step from a stub tile into the building beside it.
  function _faceDir(p, e) {
    const w = e.width || 1, h = e.height || 1;
    for (const [dc, dr] of D4) {
      const c = p.c + dc, r = p.r + dr;
      if (c >= e.col && c < e.col + w && r >= e.row && r < e.row + h) return [dc, dr];
    }
    return null;
  }

  // ── Routing ─────────────────────────────────────────────────────
  // Belt distance of every tile from one IN stub, walked outward from it.
  // Belt steps are symmetric (beltStepAllowed checks both ends; a tunnel
  // pairs both ways), so this is also each tile's distance TO the stub.
  // `now`: the caller's reading of the clock, when it has one already (update()
  // asks for a field per item).
  function _field(pk, p, now = performance.now()) {
    let f = _fields.get(pk);
    if (f && now - f.at < ROUTE_TTL && f.links === BELT_LINK_EPOCH) return f;
    const dist = new Map();
    if (_beltAt(p.c, p.r)) {
      dist.set(pk, 0);
      const q = [key(p.c, p.r)];
      for (let i = 0; i < q.length && i < 6000; i++) {
        const qk = q[i], c = keyC(qk), r = keyR(qk);
        const d = dist.get(qk);
        for (const s of _steps(c, r)) {
          const nc = c + s[0], nr = r + s[1], nk = key(nc, nr);
          if (dist.has(nk) || !_beltAt(nc, nr)) continue;
          dist.set(nk, d + 1);
          q.push(nk);
        }
      }
    }
    f = { at: now, dist, links: BELT_LINK_EPOCH };
    _fields.set(pk, f);
    return f;
  }
  // Next tile toward the stub the field was built from, or null. The step
  // handed back is shared (beltSteps' own list): read it, never change it.
  function _nextHop(c, r, f) {
    const d = f.dist.get(key(c, r));
    if (d === undefined || d === 0) return null;
    for (const s of _steps(c, r)) {
      if (f.dist.get(key(c + s[0], r + s[1])) === d - 1) return s;
    }
    return null;
  }

  function _lane(src, dst, kind) {
    const lk = _laneKey(src, dst, kind);
    let lane = _lanes.get(lk);
    const now = performance.now();
    if (lane && lane.src === src && lane.dst === dst) {
      if (now - lane.at < ROUTE_TTL) return lane.dead ? null : lane;
      // Re-walked in place. This used to make a new lane object every
      // ROUTE_TTL, while a producer's list of its lanes (_found) kept the old
      // one for up to as long again: every item produced() credited to it in
      // between was never spawned, so a line showed a fraction of what its
      // source made while the machine at the end filled all the same.
      lane.at = now; lane.dead = true;
    } else {
      const prev = lane;
      lane = { src, dst, kind, lk, at: now, dead: true, credit: prev ? prev.credit : 0, acc: prev ? prev.acc : 0, lastT: prev ? prev.lastT : _simTime };
      _lanes.set(lk, lane);
    }
    // Shortest belt route from any of the source's OUT stubs to any of the
    // destination's IN stubs.
    let best = null;
    for (const dp of _dstPorts(dst, kind)) {
      if (!dp) continue;
      const pk = key(dp.c, dp.r);
      const f = _field(pk, dp);
      for (const sp of _srcPorts(src, kind)) {
        if (!sp) continue;
        const d = f.dist.get(key(sp.c, sp.r));
        if (d !== undefined && (!best || d < best.d)) best = { d, sp, dp, pk };
      }
    }
    if (!best) return null;
    const inD  = _faceDir(best.sp, src);
    const outD = _faceDir(best.dp, dst);
    if (!inD || !outD) return null;
    Object.assign(lane, { dead: false, sp: best.sp, pk: best.pk, dp: best.dp, inD, outD, len: best.d + 1, path: null });
    return lane;
  }
  // The belt tiles from `src`'s OUT stub to `dst`'s IN stub, in order, as
  // "c,r" strings: the way an item bound for dst travels. BeltShare splits a
  // shared source's stock where these part ways. Null with no belt between.
  function route(src, dst, kind) {
    if (!src || !dst || !KIND[kind]) return null;
    const lane = _lane(src, dst, kind);
    if (!lane) return null;
    if (!lane.path) {
      const f = _field(lane.pk, lane.dp);
      const path = [], cs = [], rs = [];
      let c = lane.sp.c, r = lane.sp.r;
      for (let n = 0; n < 6000; n++) {
        path.push(c + ',' + r); cs.push(c); rs.push(r);
        if (key(c, r) === lane.pk) break;
        const h = _nextHop(c, r, f);
        if (!h) break;
        c += h[0]; r += h[1];
      }
      lane.path = path;
      // Conveyor Splitters on the way, with the side each is left by, so
      // moved() can meter every splitter's ways out for its info panel.
      lane.splits = [];
      for (let i = 0; i + 1 < path.length; i++) {
        const c = cs[i], r = rs[i];
        const sp = beltOf(GridManager.getEntity(c, r));
        if (!sp || !sp._splitter) continue;
        const nc = cs[i + 1], nr = rs[i + 1];
        const dc = Math.sign(nc - c), dr = Math.sign(nr - r);
        const side = SPLIT_SIDES.findIndex(([sc, sr]) => sc === dc && sr === dr);
        if (side >= 0) lane.splits.push([sp, side]);
      }
    }
    return lane.path;
  }

  // Units a second leaving a splitter by each side, counted over RATE_WINDOW
  // game-seconds like the intake rates below; read by the info panel.
  function _meterSplit(sp, side, amount, gt) {
    const m = sp._splitMeter || (sp._splitMeter = { n: [0, 0, 0, 0], t0: gt, rate: [0, 0, 0, 0] });
    if (gt < m.t0) { m.n = [0, 0, 0, 0]; m.t0 = gt; }
    m.n[side] += amount;
    if (gt - m.t0 >= RATE_WINDOW) {
      m.rate = m.n.map(n => n / (gt - m.t0));
      m.n = [0, 0, 0, 0]; m.t0 = gt;
    }
  }

  // ── Travel time ─────────────────────────────────────────────────
  // The sim hands solids across instantly; this is what stops that showing.
  // Each belt link is either running (the stream reaches from one building
  // to the other) or still on its way. reach() is asked by every consumer
  // before it draws, and for a new stream answers no for the belt's travel
  // time (sooner if an item bound for that machine is already on the last
  // tile of its belt). While it waits, the source keeps its stock and
  // update()'s packing spawns send that stock out along the belt, so the
  // items are seen travelling and the far buffer starts filling about as
  // the first of them arrives.
  //
  // The picture is only a picture, so it never decides whether a machine is
  // fed: once a new stream has been going for as long as the belt takes to
  // travel, it is running, whether or not an item was ever drawn reaching
  // the door. An item arriving sooner (a line already packed) only starts it
  // early. Waiting on the item itself was a deadlock: items only spawn as
  // stock is handed over, and the hand-off waited on the item, so a jammed
  // OUT stub (stranded cans), a slow material (a plutonium can is a whole
  // unit, ~133s of a plant's output) or a load landing just after
  // LOAD_GRACE left a Reprocessing Plant's output piling up for minutes.
  //
  // A link stops being "running" once its source has had nothing to send for
  // longer than the belt takes to empty; the next stream waits again. Links
  // first asked about within LOAD_GRACE of a load are taken as running: a
  // reload must not stall every working line for a few seconds.
  const LOAD_GRACE = 4;     // game-seconds after a load in which lines are taken as already running
  const RUNNING    = -1e9;  // `since` of a link whose stream has arrived
  const _prime = new Map(); // lane key -> { src, dst, kind, len, since, wetAt }
  let _graceUntil = 0;
  function _laneKey(src, dst, kind) { return `${src.col},${src.row}>${dst.col},${dst.row}:${kind}`; }

  function reach(src, dst, kind) {
    // A building that runs on power ships nothing while it has none: the
    // stock it is holding stays put until it is back on. (Storage Containers
    // and reactors, which draw no power, are never held by this.) An idle
    // building on standby still reads as powered, so a full one empties.
    if (src && !_canShip(src)) return false;
    if (!src || !dst || src === dst || !KIND[kind]) return true;
    const lane = _lane(src, dst, kind);
    if (!lane) return true;                       // nothing belt-borne between them
    let p = _prime.get(lane.lk);
    if (!p || p.src !== src || p.dst !== dst) {
      _prime.set(lane.lk, p = { src, dst, kind, len: lane.len, since: _simTime < _graceUntil ? RUNNING : _simTime, wetAt: _simTime });
    }
    p.len = lane.len;
    if (p.since === null) p.since = _simTime;     // a fresh stream setting off
    p.wetAt = _simTime;
    if (p.since === RUNNING) return true;
    const door = _tiles.get(lane.pk);
    // Its own item: on a door two sources share, the other one's would start
    // this stream a whole belt early.
    const arrived = !!door && door.some(it => it.kind === kind && it.src === src && it.dst === dst && !it.loose && !it.sink);
    if (arrived || _simTime - p.since >= p.len / SPEED) { p.since = RUNNING; return true; }
    return false;
  }

  // ── Sim hooks ───────────────────────────────────────────────────
  // `amount` units of `kind` just went from `src` to `dst` along a belt.
  function moved(src, dst, kind, amount) {
    if (!(amount > 0) || !src || !dst || src === dst || !KIND[kind]) return;
    if (typeof FlowMeter !== 'undefined') FlowMeter.record(src, dst, kind, amount);   // for the info panel
    let m = _taken.get(dst);
    if (!m) _taken.set(dst, m = {});
    m[kind] = _gameNow();
    const lane = _lane(src, dst, kind);
    if (!lane) return;   // no belt between them (a sim draw that isn't belt-borne)
    let ec = _eat.get(dst);
    if (!ec) _eat.set(dst, ec = {});
    const paidBefore = Math.max(0, Math.floor(ec[kind] || 0));
    ec[kind] = Math.min(EAT_CAP, (ec[kind] || 0) + amount / KIND[kind].upi);
    // Intake rate, counted over a few game-seconds on the sim's own clock (the
    // picture's update() steps don't line up with sim ticks).
    {
      const gt = typeof DayNight !== 'undefined' ? DayNight.getElapsed() : _simTime;
      let ia = _inAcc.get(dst);
      if (!ia) _inAcc.set(dst, ia = {});
      const w = ia[kind] || (ia[kind] = { n: 0, t0: gt });
      w.n += amount / KIND[kind].upi;
      if (gt < w.t0) { w.n = 0; w.t0 = gt; }                 // clock went back (a load)
      else if (gt - w.t0 >= RATE_WINDOW) {
        let r = _inRate.get(dst);
        if (!r) _inRate.set(dst, r = {});
        r[kind] = w.n / (gt - w.t0);
        w.n = 0; w.t0 = gt;
      }
      route(src, dst, kind);   // builds lane.splits with the path
      if (lane.splits) for (const [sp, side] of lane.splits) _meterSplit(sp, side, amount, gt);
    }
    lane.lastT = _simTime;
    const pr = _prime.get(lane.lk);
    if (pr) pr.wetAt = _simTime;
    // Items leave a building as its stock is actually taken, one for every
    // upi units handed over, whatever kind of building it is. A producer's
    // used to leave as it MADE them instead, which only matches while it makes
    // exactly what is taken: a plant feeding a line from a full buffer (a
    // Lithium Processing Plant makes nothing between full and half full) sent
    // no items at all while the machines on its belt went on filling, and one
    // out-making its consumer jammed its belt with stock the sim still held
    // in the building.
    lane.acc += amount / KIND[kind].upi;
    if (lane.acc >= 1) {
      let whole = Math.floor(lane.acc);
      lane.acc -= whole;
      // Items already waiting at the door that nothing has paid for: put on
      // the belt while the machine wasn't taking (a backed-up line), or
      // carried in a save. This delivery is theirs — it lets them in rather
      // than sending out one more, which would wait at the door in turn.
      // Without this a slow line ran one item behind for good: each rod sat
      // at the bin's door until the next one came down the belt.
      const door = _tiles.get(lane.pk);
      if (door) {
        let skip = paidBefore;   // the door's own count already covers this many
        for (const it of door) {
          if (whole <= 0) break;
          if (it.paid || it.src !== src || it.dst !== dst || it.kind !== kind || it.loose || it.sink || it.pos < 1 - it.g) continue;
          if (skip > 0) { skip--; continue; }
          it.paid = true; whole--;
        }
      }
      lane.credit = Math.min(CREDIT_CAP, lane.credit + whole);
    }
  }

  // Every building on `src`'s OUT belt that takes `kind` through an IN stub
  // the belt reaches — as lanes. Cached for ROUTE_TTL.
  function _discover(src, kind) {
    let m = _found.get(src);
    if (!m) _found.set(src, m = {});
    const now = performance.now();
    const hit = m[kind];
    if (hit && now - hit.at < ROUTE_TTL) return hit.lanes;
    const lanes = [];
    const types = _dstTypes(kind);
    const seen = new Set(), dsts = new Set();
    const q = [];
    for (const p of _srcPorts(src, kind)) if (p && _beltAt(p.c, p.r)) { q.push([p.c, p.r]); seen.add(key(p.c, p.r)); }
    for (let i = 0; i < q.length && i < 4000; i++) {
      const [c, r] = q[i];
      for (const [dc, dr] of D4) {
        const n = GridManager.getEntity(c + dc, r + dr);
        if (!n || n === src || dsts.has(n) || !types.includes(n.type)) continue;
        if (_dstPorts(n, kind).some(p => p && p.c === c && p.r === r)) dsts.add(n);
      }
      for (const [dc, dr] of _steps(c, r)) {
        const nk = key(c + dc, r + dr);
        if (seen.has(nk) || !_beltAt(c + dc, r + dr)) continue;
        seen.add(nk);
        q.push([c + dc, r + dr]);
      }
    }
    for (const d of dsts) { const l = _lane(src, d, kind); if (l) lanes.push(l); }
    m[kind] = { at: now, lanes, rr: hit ? hit.rr : 0 };
    return lanes;
  }

  // `amount` units of `kind` were just made by `src`. Nothing goes onto the
  // belt for that (see moved()); it only keeps the producer's routes fresh
  // for the items already out there.
  function produced(src, kind, amount) {
    if (!(amount > 0) || !src || !KIND[kind]) return;
    _discover(src, kind);
  }
  // Credit a list of Storage Containers for what SolidStorageSystem.drawFrom
  // just took out of them, one hand-off each. `before` is each bin's stock
  // captured before the draw.
  function movedFromBins(bins, before, dst, kind) {
    if (!bins) return;
    for (let i = 0; i < bins.length; i++) {
      const b = bins[i];
      moved(b, dst, kind, (before[i] || 0) - (b._stored || 0));
    }
  }
  const snapshot = (bins) => (bins || []).map(b => b._stored || 0);

  // On the sim's own clock: the picture's clock runs on while a slow sim tick
  // is still being worked out, and against it a machine taking every tick
  // read as having stopped after any tick that ran long.
  function _taking(dst, kind) {
    const m = _taken.get(dst);
    const now = _gameNow();
    if (m && m[kind] !== undefined && now < m[kind]) m[kind] = now;   // clock went back (a load)
    return !!m && m[kind] !== undefined && now - m[kind] <= BLOCK_T;
  }

  // ── Items ───────────────────────────────────────────────────────
  let _seed = 1;
  const _nextSeed = () => (_seed = (_seed * 16807) % 2147483647) / 2147483647;
  function _items(k) { let a = _tiles.get(k); if (!a) _tiles.set(k, a = []); return a; }
  // Every item is made here, with all of its fields in one order, so that
  // they all share one shape. update() and render() read a dozen fields off
  // thousands of items, and items made four different ways, then growing
  // fields as they went, turned every one of those reads into a slow lookup.
  function _mkItem(kind, src, c, r, sc, sr, pos, ix, iy, ij, seed) {
    return {
      kind, src, dst: null, pk: null, dp: null, c, r, sc, sr, pos,
      // entry side (unit step from the tile centre toward where it came in),
      // exit side, and whether either is a tunnel jump; the step to its next tile
      ix, iy, ij, ox: 0, oy: 0, oj: false, hop: null,
      loose: false, sink: false, v: undefined, stuck: 0, doorWait: 0, seed,
      paid: false,           // sent out for a hand-off the sim has made: goes straight in at the door
      g: KIND[kind].gap,     // its kind's spacing
      _k: 0, _rem: 0,        // update()'s scratch: the tile it is on, belt left to go
      // render()'s glide: where it was last drawn and when, where the glide set off from
      _lx: 0, _ly: 0, _la: 0, _lf: -10, _gx: 0, _gy: 0, _ga: 0, _gk: false, _gu: -1,
    };
  }
  function _roomIn(a, gap) {
    if (!a) return true;
    for (const it of a) if (it.pos < gap) return false;
    return true;
  }
  const _roomAtEntry = (k, gap) => _roomIn(_tiles.get(k), gap);
  // When each source last put an item of each kind on a belt (sim time), so
  // a building can animate its OUT feed as items actually leave rather than
  // nonstop: a slow producer's port otherwise reads as a steady stream.
  const _outAt = new WeakMap();   // src entity -> { kind: _simTime of its latest item }
  function _shipped(src, kind) {
    let m = _outAt.get(src);
    if (!m) _outAt.set(src, m = {});
    m[kind] = _simTime;
  }
  // Game-seconds since `src` last sent a `kind` item out, or Infinity.
  function sinceOut(src, kind) {
    const m = _outAt.get(src);
    // A stamp ahead of the clock is from before it was reset (a load).
    return (m && m[kind] !== undefined && m[kind] <= _simTime) ? _simTime - m[kind] : Infinity;
  }

  function _spawn(lane) {
    const { sp } = lane;
    const k = key(sp.c, sp.r);
    const K = KIND[lane.kind];
    if (!_roomAtEntry(k, K.gap)) return false;
    const it = _mkItem(lane.kind, lane.src, sp.c, sp.r, sp.c, sp.r, 0, lane.inD[0], lane.inD[1], false, _nextSeed());
    it.dst = lane.dst; it.pk = lane.pk; it.dp = lane.dp;
    _aimExit(it);
    _items(k).push(it);
    _shipped(lane.src, lane.kind);
    return it;
  }
  // ── Loose items ─────────────────────────────────────────────────
  // An item with no route to a machine — its belt was cut, its destination
  // removed, or its source's belt simply leads nowhere — doesn't vanish: it
  // rolls on along the belt the way it was going and queues at the end of
  // the line. Each frame it looks for a route again (its old destination,
  // or any its source now reaches), so reconnecting the belt sets it off.
  function _loosen(it) { it.loose = true; it.hop = null; it.stuck = 0; _looseAim(it); }
  // Which way `kind` from `src` really runs over belt tile (c, r): the step
  // toward the nearest machine it is routed to, or null when none of its
  // routes crosses the tile. A producer flooding its OUT belt can only point
  // tiles away from itself, so on a network two producers share the one that
  // flooded last painted the other's OUT belt running back into it.
  function flowDir(src, kind, c, r) {
    const m = _alive(src) && _found.get(src);
    const k = key(c, r);
    let best = null, bestD = Infinity, bestLane = null;
    for (const lane of (m && m[kind] && m[kind].lanes) || []) {
      if (lane.dead || !_alive(lane.dst)) continue;
      const f = _field(lane.pk, lane.dp);
      const d = f.dist.get(k);
      if (d === undefined || d >= bestD) continue;
      bestD = d; best = f; bestLane = lane;
    }
    if (!best) return null;
    if (bestD === 0) return _faceDir(bestLane.dp, bestLane.dst);   // the machine's own door: into it
    const h = _nextHop(c, r, best);
    return h ? [Math.sign(h[0]), Math.sign(h[1])] : null;
  }
  // Whether `it` sits off every belt its source's OUT stub reaches (or its
  // source is gone): then it isn't the source's stock on its way anywhere.
  function _offOwnBelt(it, k) {
    if (!_alive(it.src)) return true;
    // A container that has moved on to another material no longer stands
    // behind what it rolled out: coal it once held sat on its belt for good.
    if (it.src.type === T.SOLIDSTORAGE && it.src._solidType !== it.kind) return true;
    for (const sp of _srcPorts(it.src, it.kind))
      if (sp && _field(key(sp.c, sp.r), sp).dist.has(k)) return false;
    return true;
  }
  // Next tile along the belt: straight on if it can, else a turn (picked
  // per item, so a fork shares them out), never back the way it came.
  function _looseAim(it) {
    const opts = [];
    for (const h of _steps(it.c, it.r)) {
      const sx = Math.sign(h[0]), sy = Math.sign(h[1]);
      if (sx === it.ix && sy === it.iy) continue;                 // back where it came from
      if (!_beltAt(it.c + h[0], it.r + h[1])) continue;
      opts.push(h);
    }
    let h = opts.find(o => Math.sign(o[0]) === -it.ix && Math.sign(o[1]) === -it.iy);
    if (!h && opts.length) h = opts[Math.floor(it.seed * opts.length) % opts.length];
    if (!h) {   // end of the line: face straight on, and stop there
      it.hop = null; it.ox = -it.ix; it.oy = -it.iy; it.oj = false;
      return false;
    }
    it.hop = h; it.ox = Math.sign(h[0]); it.oy = Math.sign(h[1]);
    it.oj = Math.abs(h[0]) + Math.abs(h[1]) > 1;
    return true;
  }
  // A loose item rejoins a route if one reaches the tile it's on. Material
  // only ever travels toward a machine that takes it: a route carrying on
  // forward from here is taken first, and with none ahead the item turns
  // round for the nearest one behind it rather than rolling on down the
  // belt — which, on a line several mines feed, is another mine's feeder
  // and ends at that mine (coal ran from one mine to the next).
  function _tryRoute(it, k) {
    const forward = (pk, dp) => {
      const f = _field(pk, dp);
      if (!f.dist.has(k)) return false;
      if (k === pk) return true;
      const h = _nextHop(it.c, it.r, f);
      return !!h && !_isBack(it, h);
    };
    const adopt = (dst, pk, dp) => { it.dst = dst; it.pk = pk; it.dp = dp; it.loose = false; it.hop = null; it.stuck = 0; _aimExit(it); };
    const cands = [];
    if (it.dst && it.pk && _alive(it.dst)) cands.push([it.dst, it.pk, it.dp]);
    const m = _alive(it.src) && _found.get(it.src);
    for (const lane of (m && m[it.kind] && m[it.kind].lanes) || []) {
      if (!lane.dead && _alive(lane.dst)) cands.push([lane.dst, lane.pk, lane.dp]);
    }
    for (const [dst, pk, dp] of cands) if (forward(pk, dp)) { adopt(dst, pk, dp); return; }
    // Nothing ahead: the nearest machine this belt reaches, behind or not —
    // its source's first, else any that takes this kind.
    let best = null;
    const consider = (dst, pk, dp) => {
      const d = _field(pk, dp).dist.get(k);
      if (d !== undefined && (!best || d < best.d)) best = { dst, pk, dp, d };
    };
    for (const c of cands) consider(...c);
    if (!best) {
      for (const ty of _dstTypes(it.kind)) for (const dst of EntityRegistry.getByType(ty)) {
        if (dst === it.src) continue;
        for (const dp of _dstPorts(dst, it.kind)) if (dp && _beltAt(dp.c, dp.r)) consider(dst, key(dp.c, dp.r), dp);
      }
    }
    if (!best) return;   // a belt that reaches no machine at all: roll on and queue at its end
    if (k !== best.pk) {
      const h = _nextHop(it.c, it.r, _field(best.pk, best.dp));
      if (!h) return;
      if (_isBack(it, h)) {
        // Turn round where it stands: it now came in from the side it was
        // heading for, the same distance along the tile.
        it.ix = -Math.sign(h[0]); it.iy = -Math.sign(h[1]); it.ij = Math.abs(h[0]) + Math.abs(h[1]) > 1;
        it.pos = Math.max(0, 1 - it.pos); it.v = 0;
      }
    }
    adopt(best.dst, best.pk, best.dp);
  }
  // Whether hop `h` would send the item back the way it came in. Nothing on
  // a belt ever reverses: a re-route that needs to is simply not taken.
  const _isBack = (it, h) => Math.sign(h[0]) === it.ix && Math.sign(h[1]) === it.iy;
  // Key of the tile an item's hop leads to.
  const _hopKey = (it) => key(it.c + it.hop[0], it.r + it.hop[1]);
  // Belt tiles reachable from each tile, for _divert's fork test. Kept while
  // nothing has been built, removed or re-linked (and for a second at most
  // regardless), so a belt laid or removed is seen at once: it was cleared at
  // every update(), and every item in a backed-up queue then worked its
  // tile's ways out afresh each time.
  const _waysMemo = new Map();
  let _waysTopo = -1, _waysLinks = -1, _waysAt = 0;

  // Re-target a blocked item to another of its source's machines whose way
  // on from this tile leaves along a different, clear belt — only ever a
  // forward turn at a fork. Returns true if it switched.
  function _divert(it, k, gap) {
    // Only at a fork. Every item in a backed-up queue asks this on every
    // update, and nearly all of them are on a plain run of belt with one way
    // on: the lane search below was most of a jammed line's cost.
    let ways = _waysMemo.get(k);
    if (ways === undefined) {
      ways = _steps(it.c, it.r).filter(([dc, dr]) => _beltAt(it.c + dc, it.r + dr));
      _waysMemo.set(k, ways);
    }
    let fwd = 0;
    for (const h of ways) if (!_isBack(it, h)) fwd++;
    if (fwd < 2) return false;
    const m = _alive(it.src) && _found.get(it.src);
    const lanes = (m && m[it.kind] && m[it.kind].lanes) || [];
    if (lanes.length < 2) return false;
    // prefer machines that are taking right now
    const order = lanes.filter(l => _taking(l.dst, l.kind)).concat(lanes.filter(l => !_taking(l.dst, l.kind)));
    for (const lane of order) {
      if (lane.dead || lane.dst === it.dst || !_alive(lane.dst)) continue;
      const f = _field(lane.pk, lane.dp);
      if (!f.dist.has(k)) continue;
      const h = k === lane.pk ? null : _nextHop(it.c, it.r, f);
      if (!h || (h[0] === it.hop[0] && h[1] === it.hop[1])) continue;   // same way on: no help
      if (_isBack(it, h)) continue;                                        // would turn it round
      if (!_beltAt(it.c + h[0], it.r + h[1]) || !_roomAtEntry(key(it.c + h[0], it.r + h[1]), gap)) continue;
      it.dst = lane.dst; it.pk = lane.pk; it.dp = lane.dp;
      it.hop = h; it.ox = Math.sign(h[0]); it.oy = Math.sign(h[1]); it.oj = Math.abs(h[0]) + Math.abs(h[1]) > 1;
      // Already past the middle toward the old exit: pivot from the centre
      // onto the new one, rather than jumping sideways between the two arms.
      if (it.pos > 0.5) { it.pos = 0.5; it.v = Math.min(it.v || 0, SPEED * 0.5); }
      return true;
    }
    return false;
  }

  // Whether the item's source still has a belt into its destination.
  function _reaches(it) {
    const f = _field(it.pk, it.dp);
    return _srcPorts(it.src, it.kind).some(p => p && f.dist.has(key(p.c, p.r)));
  }
  // Producers whose OUT belt reaches no machine at all: [src, kind, port, inD]
  // Refreshed with the periodic scan; their stock rolls out loose.
  let _looseSrc = [];
  function _spawnLoose(src, kind, sp, inD) {
    const k = key(sp.c, sp.r);
    if (!_roomAtEntry(k, KIND[kind].gap)) return false;
    const it = _mkItem(kind, src, sp.c, sp.r, sp.c, sp.r, 0, inD[0], inD[1], false, _nextSeed());
    it.loose = true;
    _looseAim(it);
    _items(k).push(it);
    _shipped(src, kind);
    return true;
  }

  // ── Side branches ───────────────────────────────────────────────
  // A dead-end spur hanging off a working line fills up the way a real belt
  // would: items peel off into it until it's packed to the end, then the
  // rest carry on past to the machine. Each spur is found from the belt
  // network around a source (tiles off every route to a machine, ending in a
  // dead end, joining a route tile with no fork of their own) and its items
  // head for the spur's end tile like a destination they never enter.
  let _spill = [];   // { src, kind, E, pk, branch: Set<tileKey>, cap }
  function _spillFor(src, kind, lanes) {
    const path = new Set();
    for (const lane of lanes) {
      const f = _field(lane.pk, lane.dp);
      let c = lane.sp.c, r = lane.sp.r;
      for (let n = 0; n < 4000; n++) {
        path.add(key(c, r));
        if (key(c, r) === lane.pk) break;
        const h = _nextHop(c, r, f);
        if (!h) break;
        c += h[0]; r += h[1];
      }
    }
    const seen = new Set(), q = [];
    for (const p of _srcPorts(src, kind)) if (p && _beltAt(p.c, p.r)) { q.push([p.c, p.r]); seen.add(key(p.c, p.r)); }
    for (let i = 0; i < q.length && i < 4000; i++) {
      const [c, r] = q[i];
      for (const [dc, dr] of _steps(c, r)) {
        const nk = key(c + dc, r + dr);
        if (seen.has(nk) || !_beltAt(c + dc, r + dr)) continue;
        seen.add(nk); q.push([c + dc, r + dr]);
      }
    }
    const nbrs = (c, r) => _steps(c, r).filter(([dc, dr]) => _beltAt(c + dc, r + dr));
    const out = [];
    for (const [c, r] of q) {
      const k = key(c, r);
      if (path.has(k) || nbrs(c, r).length !== 1) continue;   // only dead-end tiles off the routes
      // A branch that ends against a building isn't a spur, it's a hook-up —
      // most often a second mine's OUT belt merging into this line. Filling it
      // sent this source's ore up the feeder toward the other mine.
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => {
        const b = GridManager.getEntity(c + dc, r + dr);
        return b && !_beltAt(c + dc, r + dr) && !GridManager.isVegetation(b) && b.type !== T.WIRE && b.type !== T.POLE;
      })) continue;
      // walk back to the route it hangs off; a fork part-way means it's not a simple spur
      const branch = new Set([k]);
      let pc = c, pr = r, prev = null, joined = false;
      for (let n = 0; n < 400; n++) {
        const steps = nbrs(pc, pr).filter(([dc, dr]) => key(pc + dc, pr + dr) !== prev);
        if (steps.length !== 1) break;
        prev = key(pc, pr); pc += steps[0][0]; pr += steps[0][1];
        if (path.has(key(pc, pr))) { joined = true; break; }
        branch.add(key(pc, pr));
      }
      if (!joined) continue;
      // Room for this many: the spur's length up to where the lead item stops
      // (about mid-tile on the end tile), one gap each, less one so the
      // queue never backs out across the junction into the line.
      out.push({ src, kind, E: { c, r }, pk: k, branch, cap: Math.max(1, Math.floor((branch.size - 0.5) / KIND[kind].gap) - 1) });
      if (out.length >= 8) break;
    }
    return out;
  }
  // Whether a tile is still a genuine spur end: a belt dead end standing on
  // open ground (see _spillFor). Spur items heading for one that isn't — a
  // spur since hooked up to a building, or one restored from a save made
  // before feeder lines were excluded — are dropped: they were only ever
  // there for show, never real material.
  function _validSpurEnd(pk) {
    const c = keyC(pk), r = keyR(pk);
    if (!_beltAt(c, r)) return false;
    if (_steps(c, r).filter(([dc, dr]) => _beltAt(c + dc, r + dr)).length !== 1) return false;
    return ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => {
      const b = GridManager.getEntity(c + dc, r + dr);
      return b && !_beltAt(c + dc, r + dr) && !GridManager.isVegetation(b) && b.type !== T.WIRE && b.type !== T.POLE;
    });
  }
  function _spawnSink(S) {
    const f = _field(S.pk, S.E);
    const sp = _srcPorts(S.src, S.kind).find(p => p && f.dist.has(key(p.c, p.r)));
    const inD = sp && _faceDir(sp, S.src);
    if (!inD) return false;
    const k = key(sp.c, sp.r);
    if (!_roomAtEntry(k, KIND[S.kind].gap)) return false;
    const it = _mkItem(S.kind, S.src, sp.c, sp.r, sp.c, sp.r, 0, inD[0], inD[1], false, _nextSeed());
    it.sink = true; it.pk = S.pk; it.dp = S.E; it.v = SPEED * 0.6;
    _aimExit(it);
    _items(k).push(it);
    _shipped(S.src, S.kind);
    return true;
  }

  // Point an item at its next hop from the tile it is on.
  function _aimExit(it) {
    if (it.sink && key(it.c, it.r) === it.pk) {   // reached the end of its spur
      it.hop = null; it.ox = -it.ix; it.oy = -it.iy; it.oj = false;
      return false;
    }
    if (key(it.c, it.r) === it.pk) {
      const d = _faceDir(it.dp, it.dst) || [it.ox, it.oy];
      it.ox = d[0]; it.oy = d[1]; it.oj = false;
      return true;
    }
    const f = _fields.get(it.pk);
    const h = f && _nextHop(it.c, it.r, f);
    // A route cached from before the belt was cut can point at a tile that
    // has no belt now; stepping onto it is what made items vanish at a cut.
    if (!h || !_beltAt(it.c + h[0], it.r + h[1])) { it.hop = null; return false; }
    // A route that now runs back the way the item came (the belt changed
    // under it) isn't followed: it waits, then carries on loose — forward.
    if (it.pos > 0 && _isBack(it, h)) { it.hop = null; return false; }
    it.ox = Math.sign(h[0]); it.oy = Math.sign(h[1]);
    it.oj = Math.abs(h[0]) + Math.abs(h[1]) > 1;
    it.hop = h;
    return true;
  }

  // all.sort((a, b) => a._rem - b._rem), ties keeping their order as in a
  // stable sort: every item's _rem is read once into a typed array and the
  // indices are merge-sorted on it here, comparisons written out inline.
  // (A typed-array sort with a comparator calls back into script for every
  // one of the ~60,000 comparisons a few thousand items take.) The order is
  // by (_rem, index), with no two items equal, so it is the same order.
  let _sRem = new Float64Array(0), _sA = new Uint32Array(0), _sB = new Uint32Array(0);
  const _sWas = [];
  function _sortByRem(all) {
    const n = all.length;
    if (n < 2) return;
    if (_sRem.length < n) { const m = Math.max(n, 2 * _sRem.length); _sRem = new Float64Array(m); _sA = new Uint32Array(m); _sB = new Uint32Array(m); }
    const rem = _sRem;
    let src = _sA, dst = _sB;
    for (let i = 0; i < n; i++) { rem[i] = all[i]._rem; src[i] = i; }
    const RUN = 16;
    for (let lo = 0; lo < n; lo += RUN) {         // insertion-sort short runs
      const hi = Math.min(lo + RUN, n);
      for (let i = lo + 1; i < hi; i++) {
        const x = src[i], rx = rem[x];
        let j = i - 1;
        for (; j >= lo; j--) {
          const y = src[j], d = rem[y] - rx;
          if (d > 0 || (d === 0 && y > x)) src[j + 1] = y; else break;
        }
        src[j + 1] = x;
      }
    }
    for (let w = RUN; w < n; w *= 2) {            // then merge them pairwise
      for (let lo = 0; lo < n; lo += 2 * w) {
        const mid = Math.min(lo + w, n), hi = Math.min(lo + 2 * w, n);
        let i = lo, j = mid, k = lo;
        while (i < mid && j < hi) {
          const x = src[i], y = src[j], d = rem[y] - rem[x];
          if (d < 0 || (d === 0 && y < x)) { dst[k++] = y; j++; } else { dst[k++] = x; i++; }
        }
        while (i < mid) dst[k++] = src[i++];
        while (j < hi) dst[k++] = src[j++];
      }
      const t = src; src = dst; dst = t;
    }
    const was = _sWas;
    for (let i = 0; i < n; i++) was[i] = all[i];
    for (let i = 0; i < n; i++) all[i] = was[src[i]];
  }

  function update(dt) {
    if (!(dt > 0)) return;
    _simTime += dt;
    {
      const topo = EntityRegistry.getTopologyVersion(), t = performance.now();
      if (topo !== _waysTopo || BELT_LINK_EPOCH !== _waysLinks || t - _waysAt > 1000) {
        _waysMemo.clear(); _waysTopo = topo; _waysLinks = BELT_LINK_EPOCH; _waysAt = t;
        _stepsMemo.clear();
      }
    }

    // Producers holding stock re-walk their OUT belts now and then, so a
    // line to a building that isn't taking anything still shows its queue —
    // even one that has never had a delivery (or just came back from a load).
    const nowMs = performance.now();
    if (!_scanQ && nowMs - _scanAt > SCAN_MS) {
      _scanAt = nowMs;
      _scanQ = [];
      for (const ty of _srcTypes()) for (const src of EntityRegistry.getByType(ty)) _scanQ.push(src);
      _scanI = 0; _scanLoose = []; _scanSpill = [];
    }
    if (_scanQ) {
      const until = nowMs + SCAN_SLICE_MS;
      do {
        if (_scanI >= _scanQ.length) { _looseSrc = _scanLoose; _spill = _scanSpill; _scanQ = null; break; }
        const src = _scanQ[_scanI++];
        if (!_alive(src)) continue;   // removed since the pass began
        for (const k of _srcKinds(src)) {
          if (_stock(src, k) <= 0.0001) continue;
          const lanes = _discover(src, k);
          if (lanes.length) { for (const S of _spillFor(src, k, lanes)) _scanSpill.push(S); continue; }
          // A belt that reaches no machine: the stock rolls out onto it loose.
          for (const sp of _srcPorts(src, k)) {
            if (!sp || !_beltAt(sp.c, sp.r)) continue;
            const inD = _faceDir(sp, src);
            if (inD) { _scanLoose.push([src, k, sp, inD]); break; }
          }
        }
      } while (performance.now() < until);
    }

    // Travel time: a link whose source has had nothing to send for longer
    // than its belt takes to empty is no longer running (see reach()).
    for (const [lk, p] of _prime) {
      if (!_alive(p.src) || !_alive(p.dst)) { _prime.delete(lk); continue; }
      if (_stock(p.src, p.kind) > 0.0001) p.wetAt = _simTime;
      else if (p.since !== null && _simTime - p.wetAt > p.len / SPEED + 1) p.since = null;
    }

    // A machine gone, or one that has stopped taking: its intake figure goes.
    for (const [dst, r] of _inRate) {
      if (!_alive(dst)) { _inRate.delete(dst); _inAcc.delete(dst); continue; }
      for (const kind in r) if (!_taking(dst, kind)) r[kind] = 0;
    }

    // Items already out on the belts, per source and kind, and routed items
    // per destination and kind (for the in-transit cap at the door).
    const out = new Map(), bound = new Map(), standing = new Map();
    for (const arr of _tiles.values()) for (const it of arr) {
      let m = out.get(it.src);
      if (!m) out.set(it.src, m = {});
      m[it.kind] = (m[it.kind] || 0) + 1;
      if (!it.loose && !it.sink && it.dst) {
        let b = bound.get(it.dst);
        if (!b) bound.set(it.dst, b = {});
        b[it.kind] = (b[it.kind] || 0) + 1;
        if ((it.v ?? SPEED) < 0.05) {   // stopped in a queue
          let s = standing.get(it.dst);
          if (!s) standing.set(it.dst, s = {});
          s[it.kind] = (s[it.kind] || 0) + 1;
        }
      }
    }
    const QUEUE_STANDING = 2;   // items a machine that is taking may have waiting at its door
    // How many items a machine's real intake can have in transit to it: the
    // longest belt feeding it, at belt speed, times its rate.
    const longest = new Map();
    for (const lane of _lanes.values()) {
      if (lane.dead) continue;
      let m = longest.get(lane.dst);
      if (!m) longest.set(lane.dst, m = {});
      m[lane.kind] = Math.max(m[lane.kind] || 0, lane.len || 0);
    }
    const allowedTo = (dst, kind) => {
      const len = (longest.get(dst) || {})[kind] || 0, rate = (_inRate.get(dst) || {})[kind] || 0;
      return Math.ceil(len / SPEED * rate) + QUEUE_SLACK;
    };

    // Spawns. Lanes that put an item on go to the back of the queue for the
    // next one, so two lanes sharing an OUT stub take strict turns at it: in
    // fixed order the first always won the stub when both had items waiting,
    // and the other's waiting items overflowed CREDIT_CAP and were never shown.
    const spawned = [];
    for (const [lk, lane] of _lanes) {
      if (lane.dead || !_alive(lane.src) || !_alive(lane.dst)) {
        if (performance.now() - lane.at > ROUTE_TTL) _lanes.delete(lk);
        continue;
      }
      const taking = _taking(lane.dst, lane.kind);
      // Backed up: the line shows the stock the source is holding, so it
      // tops the belt up to that — and no further — while nothing is taken.
      // A source sitting on a real backlog (PACK_SOLID items' worth or more)
      // is not held to that count: one item can stand for a lot of stock (a
      // lithium lump is 15 units, so a full mine was "worth" 34 of them),
      // which queued a short tail at the far door and left the rest of a
      // long belt, and everything near the source, looking empty. The belt
      // itself is the limit then, and it fills back to the source.
      const onBelt = (out.get(lane.src) || {})[lane.kind] || 0;
      const worth = _offer(lane.src, lane.dst, lane.kind) / KIND[lane.kind].upi;
      const packing = !taking && (worth >= PACK_SOLID || onBelt < worth);
      if (taking ? lane.credit >= 1 : packing) {
        // Keep the route fresh while it is in use.
        if (performance.now() - lane.at >= ROUTE_TTL && !_lane(lane.src, lane.dst, lane.kind)) continue;
        const it = _spawn(lane);
        if (it) {
          spawned.push(lk);
          // One for a hand-off already made is paid for: it goes in when it
          // gets there. Waiting on the door's own count instead, which runs
          // out of step with the lane's, held each item of a slow line at the
          // door for seconds (a rod a few seconds, until the next was made).
          if (lane.credit >= 1) { lane.credit--; it.paid = true; }
          const m = out.get(lane.src) || {}; m[lane.kind] = onBelt + 1; out.set(lane.src, m);
        }
      } else if (_simTime - lane.lastT > 30) {
        _lanes.delete(lk);
      }
    }
    for (const lk of spawned) { const lane = _lanes.get(lk); if (lane) { _lanes.delete(lk); _lanes.set(lk, lane); } }
    // Loose spawns: a dead-end line fills with what its source is holding.
    for (const [src, kind, sp, inD] of _looseSrc) {
      if (!_alive(src)) continue;
      const onBelt = (out.get(src) || {})[kind] || 0;
      if (onBelt < _stock(src, kind) / KIND[kind].upi && _spawnLoose(src, kind, sp, inD)) {
        const m = out.get(src) || {}; m[kind] = onBelt + 1; out.set(src, m);
      }
    }
    // Spur spawns: top each side branch up until it's packed. What's already
    // in it, plus what's on its way there, counts against its room.
    if (_spill.length) {
      const enRoute = new Map();
      for (const arr of _tiles.values()) for (const it of arr) if (it.sink) enRoute.set(it.pk, (enRoute.get(it.pk) || 0) + 1);
      for (const S of _spill) {
        if (!_alive(S.src) || _stock(S.src, S.kind) <= 0.0001) continue;
        // Never more out on the belts than the source really holds.
        if (((out.get(S.src) || {})[S.kind] || 0) >= _stock(S.src, S.kind) / KIND[S.kind].upi) continue;
        let n = 0;
        for (const bk of S.branch) { const a = _tiles.get(bk); if (a) for (const it of a) if (!it.sink) n++; }
        n += enRoute.get(S.pk) || 0;
        if (n < S.cap) _spawnSink(S);
      }
    }

    // Movement. Nearest-to-destination first, so each item sees where the
    // one in front of it has already moved to this frame. Loose items have no
    // destination to measure against and go last.
    // A queue of items shares one destination and a spur's items one spur, so
    // the routing field and the spur check are looked up once per run of
    // them, not once per item: the last field asked for, and each spur end's
    // verdict for this update.
    const all = [];
    const spurOk = new Map();
    let lastPk = null, lastF = null;
    for (const [k, arr] of _tiles) {
      // More than a belt tile can hold from all four sides at once: a pile
      // left in a save by the tunnel-mouth bug (see the queue check below).
      // Every item on a tile is checked against every other one, so a pile
      // of a thousand cost over 100ms a frame. Items are only the picture
      // of what the sim has moved, so the ones furthest along are kept and
      // the rest simply go.
      if (arr.length > TILE_CAP) { arr.sort((a, b) => b.pos - a.pos); arr.length = TILE_CAP; }
      // Every item on a tile carries that tile's own column and row.
      const b = arr.length ? beltOf(GridManager.getEntity(arr[0].c, arr[0].r)) : null;
      let seenKind = null;
      for (let i = arr.length - 1; i >= 0; i--) {
        const it = arr[i];
        if (!b) { arr.splice(i, 1); continue; }   // the belt itself is gone
        if (it.sink) {
          let okEnd = spurOk.get(it.pk);
          if (okEnd === undefined) spurOk.set(it.pk, okEnd = _validSpurEnd(it.pk));
          if (!okEnd) { arr.splice(i, 1); continue; }   // its spur isn't one any more
        }
        it._k = k;   // the tile it is on, for the movement pass below
        seenKind = it.kind;
        if (it.loose) _tryRoute(it, k);
        // A loose item its source's OUT belt no longer reaches stands for no
        // stock in transit: a bin rotated or a belt re-laid stranded it, and
        // with no machine to head for it queued at the line's far end for
        // good, filling another building's OUT stub (a Reprocessing Plant
        // whose plutonium cans then never showed). Given STRAY_T to be
        // reconnected, then it goes.
        if (it.loose && _offOwnBelt(it, k)) {
          it.strayT = (it.strayT || 0) + dt;
          if (it.strayT > STRAY_T) { arr.splice(i, 1); continue; }
        } else it.strayT = 0;
        if (!it.loose) {
          let f = null;
          if (it.sink || _alive(it.dst)) {
            if (it.pk !== lastPk) { lastF = _field(it.pk, it.dp, nowMs); lastPk = it.pk; }
            f = lastF;
          }
          const d = f && f.dist.get(k);
          if (d === undefined || d === null) _loosen(it);   // route cut: roll on and queue
          else { it._rem = d + (1 - it.pos); all.push(it); continue; }
        }
        it._rem = 1e9;
        all.push(it);
      }
      // What this belt really carries (kindAt): the last item looked at on
      // it, in one record per tile kept up in place.
      if (seenKind !== null) {
        const seen = _seenOn.get(k);
        if (seen) { seen.kind = seenKind; seen.t = _simTime; } else _seenOn.set(k, { kind: seenKind, t: _simTime });
      }
      if (!arr.length) _tiles.delete(k);
    }
    _sortByRem(all);
    // Items within the last few tiles of their machine's door. A real stream
    // at the machine's intake rate spaces them out at SPEED / rate tiles; a
    // queue packs them nose to tail (and creeps, so "stopped" can't tell it).
    const NEAR_DOOR = 8;
    const nearDoor = new Map();
    for (const it of all) {
      if (it.loose || it.sink || !it.dst || !(it._rem <= NEAR_DOOR)) continue;
      let m = nearDoor.get(it.dst);
      if (!m) nearDoor.set(it.dst, m = {});
      m[it.kind] = (m[it.kind] || 0) + 1;
    }
    // `block`: how far it may go before touching what's in front of it (or
    // a stop); its speed then eases toward that rather than jumping.
    // `blockV`: the speed of whatever sets `block` (0 for a fixed stop), so
    // an item following a moving one doesn't brake for it needlessly.
    // Both reset for each item below; one `by` serves the whole pass.
    let block = Infinity, blockV = 0;
    const by = (b, bv) => { if (b < block) { block = b; blockV = bv || 0; } };
    for (const it of all) {
      const k = it._k;
      const here = _tiles.get(k);
      if (!here) continue;
      const gap = it.g;
      block = Infinity; blockV = 0;
      let swallow = false;
      for (const o of here) {
        if (o === it || o.pos < it.pos) continue;
        // Exactly level (two spawned or merged onto the same spot): one has to
        // go first, or each waits on the other for ever.
        if (o.pos === it.pos && (o._rem > it._rem || (o._rem === it._rem && o.seed > it.seed))) continue;
        // Belts have no direction, so one tile can carry streams that only
        // share part of it. Before the centre an item is only in the way of
        // others that came in the same side; past it, of others leaving the
        // same side. Without this a queue backed up down one branch of a
        // fork held everything bound for the other branch, and two streams
        // running opposite ways along a belt jammed head-on for good.
        const sameIn  = o.ix === it.ix && o.iy === it.iy;
        const sameOut = !o.hop || !it.hop || (o.hop[0] === it.hop[0] && o.hop[1] === it.hop[1]);
        if (o.pos < 0.5 ? !sameIn : !sameOut) continue;
        by(o.pos - (gap + o.g) / 2, o.v);
      }
      if (!it.loose && !it.sink && k === it.pk) {
        // Into the machine, if it has taken an item's worth — or, when the
        // line has stalled with nothing left behind it (or its source's belt
        // no longer reaches this machine), just let it run off.
        const ec = _eat.get(it.dst);
        const credit = it.paid || (ec && ec[it.kind] >= 1);
        const drain = !credit && !_taking(it.dst, it.kind) && !(_alive(it.src) && _offer(it.src, it.dst, it.kind) > 0.0001 && _reaches(it));
        // More queued for this machine than its real intake has in transit:
        // the surplus is a picture of nothing, so it goes in.
        // And a standing queue: credits arrive as fast as items are sent, so an
        // item that has waited at the door well past the machine's real
        // intake interval is one more than the sim moved.
        const b = bound.get(it.dst);
        const rateIt = (_inRate.get(it.dst) || {})[it.kind] || 0;
        if (!credit && it.pos >= 1 - gap) it.doorWait = (it.doorWait || 0) + dt; else it.doorWait = 0;
        // A machine that is taking eats each item the moment it gets there (the
        // sim already handed it over), so a queue standing at its door is
        // items the sim never moved.
        const sq = standing.get(it.dst), nd = nearDoor.get(it.dst);
        const streamNear = Math.ceil(NEAR_DOOR * rateIt / SPEED) + QUEUE_STANDING;
        const excess = !credit && !drain && _taking(it.dst, it.kind) && b &&
                       (b[it.kind] > allowedTo(it.dst, it.kind) || (sq && sq[it.kind] > QUEUE_STANDING)
                        || (nd && nd[it.kind] > streamNear)
                        || it.doorWait > Math.max(2, 2.5 / Math.max(rateIt, 0.05)));
        if (excess) { b[it.kind]--; if (sq && sq[it.kind] > 0) sq[it.kind]--; if (nd && nd[it.kind] > 0) nd[it.kind]--; }
        if (credit || drain || excess) swallow = credit ? 'credit' : 'drain';
        else by(1 - gap / 2, 0);
      } else {
        if (!it.hop || !_beltAt(it.c + it.hop[0], it.r + it.hop[1])) { if (it.loose) _looseAim(it); else _aimExit(it); }
        if (!it.hop) {
          // A routed item with nowhere to go (the belt was rerouted) waits a
          // moment for a new route, then carries on loose. A loose one at the
          // end of the line — or a spur item at the end of its spur — just
          // stops there and the rest queue behind it.
          if (!it.loose && !(it.sink && k === it.pk)) { it.stuck = (it.stuck || 0) + dt; if (it.stuck > STUCK_T) _loosen(it); }
          // stop short of the belt's end cap rather than hanging off it
          by((it.loose || it.sink) ? Math.min(1 - gap, 0.52) : 1 - gap / 2, 0);
        } else {
          it.stuck = 0;
          // At a fork, a real belt sends things down whichever way has room.
          // An item whose own way on is jammed (its machine has stopped
          // taking and the queue for it reaches back past the fork) switches
          // to another machine its source feeds, if that way is clear —
          // otherwise one stalled machine's queue blocked everything behind
          // it, and the other branch of the split never got a thing.
          let next = _tiles.get(_hopKey(it));
          if (!it.loose && !it.sink && !_roomIn(next, gap) && _divert(it, k, gap)) next = _tiles.get(_hopKey(it));
          if (next) for (const o of next) {
            // Coming the other way, or still on another way in to that tile:
            // not in the queue this one is joining (see above).
            if (o.hop && o.hop[0] === -it.hop[0] && o.hop[1] === -it.hop[1]) continue;
            // ix/iy are unit steps, a hop through a tunnel is 3-4 tiles: compare
            // its sign. Against the raw hop nothing queued at a tunnel's far
            // mouth was ever in the way, so the stream piled up on that one
            // tile without end (over a thousand items, all checked against
            // each other every update).
            if (o.pos < 0.5 && (o.ix !== -Math.sign(it.hop[0]) || o.iy !== -Math.sign(it.hop[1]))) continue;
            by(1 + o.pos - (gap + o.g) / 2, o.v);
          }
        }
      }
      // Ease: accelerate toward belt speed, and brake so as to come to rest
      // at `block` rather than stopping dead on it.
      const room = block - it.pos;
      let v = it.v === undefined ? SPEED : it.v;
      v = Math.min(SPEED, v + ACCEL * dt, room > 0 ? Math.sqrt(2 * DECEL * room + blockV * blockV) : 0);
      const lim = Math.min(block, it.pos + v * dt);
      it.v = lim > it.pos ? (lim - it.pos) / dt : 0;
      if (swallow && lim >= 1) {
        if (swallow === 'credit') { const ec = _eat.get(it.dst); if (ec) ec[it.kind] = (ec[it.kind] || 0) - 1; }
        here.splice(here.indexOf(it), 1);
        continue;
      }
      if (lim <= it.pos) { if (it.pos > 1) it.pos = 1; continue; }   // a queued item left past its tile end (an old save made at speed)
      it.pos = lim;
      // Hop on as many tiles as the step carried it (render() sub-steps so
      // this is normally one), and never leave it past the end of a tile it
      // can't leave — that drew it hanging off the belt, straight on.
      let kk = k;
      while (it.pos >= 1 && it.hop && (it.loose || kk !== it.pk) && _beltAt(it.c + it.hop[0], it.r + it.hop[1])) {
        const list = _tiles.get(kk);
        if (list) list.splice(list.indexOf(it), 1);
        const h = it.hop;
        it.c += h[0]; it.r += h[1]; it.pos -= 1;
        it.ix = -Math.sign(h[0]); it.iy = -Math.sign(h[1]); it.ij = Math.abs(h[0]) + Math.abs(h[1]) > 1;
        it.hop = null;
        if (it.loose) _looseAim(it); else _aimExit(it);
        kk = key(it.c, it.r);
        _items(kk).push(it);
      }
      if (it.pos > 1) it.pos = 1;
    }
  }

  // ── Drawing ─────────────────────────────────────────────────────
  // After the entity pass (render_main_loop), so no belt tile drawn later
  // in row order paints over an item crossing onto it.
  function render(t) {
    const now = performance.now();
    const realDt = _lastFrame ? Math.min(0.1, (now - _lastFrame) / 1000) : 0;
    _lastFrame = now;
    const scale = (typeof DevMode !== 'undefined' && DevMode.timeScale !== undefined) ? DevMode.timeScale : 1;
    const z = Camera.zoom;
    const tl = Camera.screenToWorld(0, 0), br = Camera.screenToWorld(window.innerWidth, window.innerHeight);
    const vx0 = tl.x - TILE * 2, vy0 = tl.y - TILE * 2;
    const vx1 = br.x + TILE, vy1 = br.y + TILE;

    // Is anything on a belt actually on screen?
    let watched = false;
    for (const arr of _tiles.values()) {
      if (!arr.length) continue;
      const px = arr[0].c * TILE, py = arr[0].r * TILE;
      if (px < vx0 || px > vx1 || py < vy0 || py > vy1) continue;
      watched = true;
      break;
    }

    // Moving every item on the map is the dear part of this (thousands of
    // them on a built-up map, over 10 ms an update), and nearly all of it is
    // spent on motion nobody can see. So time is banked and handed to
    // update() in steps: twelve a second while an item is in view, ten while
    // none is. The belts run at the same speed either way; update() is simply
    // given the same game time in fewer, larger steps, exactly as it is on a
    // machine with a lower frame rate. In between, each item on screen is
    // drawn gliding from where it was last drawn to where the latest update
    // put it, so it moves every frame all the same. Eight a second once the
    // camera is out far enough that an item is a dot (the far LOD below).
    // (Updates used to follow the screen instead: one whenever what was owed
    // would carry an item a whole pixel. Zoomed in on a belt that was every
    // frame, and with every item on the map moved each time, a busy late-game
    // map lost a third of its frame time to it.)
    // Faster at fast-forward, so an item never travels more than GLIDE_MAX of
    // a tile between two updates: a longer glide would cut across the corners.
    _owed += realDt * scale;
    _owedReal += realDt;
    const _step = watched ? Math.min(z > 0.4 ? WATCHED_STEP : FAR_STEP, GLIDE_MAX / (SPEED * Math.max(scale, 1e-6))) : IDLE_STEP;
    if (_owedReal >= _step) {
      const sim = _owed;
      _owed = 0; _owedReal = 0;
      _updN++; _updAt = now; _glideMs = _step * 1000;
      // Sub-step so no item travels more than about half a tile per update.
      // An item only hops onto its next tile once per update, so at 10x a
      // frame's single 1-game-second step (1.2 tiles) left it drawn past the
      // end of its tile, straight on — off the belt at every corner.
      const steps = Math.min(24, Math.max(1, Math.ceil(sim * SPEED / 0.45)));
      for (let i = 0; i < steps; i++) update(sim / steps);
    }
    _frameN++;
    if (!_tiles.size || !watched) return;
    const glide = _glideMs > 0 ? Math.min(1, (now - _updAt) / _glideMs) : 1;
    const GLIDE_JUMP = (TILE * 1.2) * (TILE * 1.2);   // further than this (a tunnel's two mouths) it just moves

    // The flat far-away blob below 0.4: an item is under three screen pixels
    // there. (It used to start at 0.25, which is below the furthest the camera
    // zooms out, so every item was drawn in full at any distance.)
    const lod = z > 0.5 ? 2 : z > 0.4 ? 1 : 0;
    for (const [k, arr] of _tiles) {
      if (!arr.length) continue;
      const c = arr[0].c, r = arr[0].r;
      const { x: px, y: py } = GridManager.tileToWorld(c, r);
      if (px < vx0 || px > vx1 || py < vy0 || py > vy1) continue;
      const top = GridManager.getEntity(c, r);
      // A belt carried under a pipe crossing still shows its cargo; the pipe
      // is drawn over it afterwards (renderPipesOverBelts).
      const ent = top && top.type !== T.CONVEYOR && top.type === T.PIPE ? top._underConveyor : top;
      if (!ent || ent.type !== T.CONVEYOR) continue;
      const udg = !!ent._udgBelt;
      const cx = px + TILE / 2, cy = py + TILE / 2;
      for (const it of arr) {
        // Into / out of a tunnel mouth: only the surface half shows.
        if (udg && ((it.pos < 0.5 && it.ij) || (it.pos >= 0.5 && it.oj) || Math.abs(it.pos - 0.5) < 0.18)) continue;
        let x, y;
        if (it.pos < 0.5) { const s = (0.5 - it.pos) * TILE; x = cx + it.ix * s; y = cy + it.iy * s; }
        else              { const s = (it.pos - 0.5) * TILE; x = cx + it.ox * s; y = cy + it.oy * s; }
        // Heading: along the entry leg, easing onto the exit leg round the centre.
        const aIn = Math.atan2(-it.iy, -it.ix), aOut = Math.atan2(it.oy, it.ox);
        let dA = aOut - aIn; while (dA > Math.PI) dA -= Math.PI * 2; while (dA < -Math.PI) dA += Math.PI * 2;
        const u = Math.max(0, Math.min(1, (it.pos - 0.3) / 0.4));
        let ang = aIn + dA * u * u * (3 - 2 * u);
        // The glide (see above): the first time it is drawn after an update,
        // it sets off from where the last frame drew it.
        if (it._gu !== _updN) {
          it._gu = _updN;
          it._gk = it._lf === _frameN - 1 && (x - it._lx) * (x - it._lx) + (y - it._ly) * (y - it._ly) < GLIDE_JUMP;
          if (it._gk) { it._gx = it._lx; it._gy = it._ly; it._ga = it._la; }
        }
        if (it._gk && glide < 1) {
          x = it._gx + (x - it._gx) * glide;
          y = it._gy + (y - it._gy) * glide;
          let dg = ang - it._ga; while (dg > Math.PI) dg -= Math.PI * 2; while (dg < -Math.PI) dg += Math.PI * 2;
          ang = it._ga + dg * glide;
        }
        it._lx = x; it._ly = y; it._la = ang; it._lf = _frameN;
        // Ease in as it emerges from a machine's OUT port and out as it is
        // swallowed by the IN port, instead of popping at the stub edge.
        let f = 1;
        if (it.pos < 0.45 && it.c === it.sc && it.r === it.sr) { const q = it.pos / 0.45; f = q * q * (3 - 2 * q); }
        else if (it.pos > 0.55 && k === it.pk) { const q = (1 - it.pos) / 0.45; f = Math.max(0, q * q * (3 - 2 * q)); }
        if (f < 1) {
          ctx.save(); ctx.globalAlpha *= f; ctx.translate(x, y); const s = 0.55 + 0.45 * f; ctx.scale(s, s); ctx.translate(-x, -y);
          drawCargo(it.kind, x, y, ang, t, lod, it.seed);
          ctx.restore();
        } else drawCargo(it.kind, x, y, ang, t, lod, it.seed);
      }
    }
  }

  function clear() { _tiles.clear(); _lanes.clear(); _fields.clear(); _prime.clear(); _seenOn.clear(); _inAcc.clear(); _inRate.clear(); _scanQ = null; _owed = 0; _owedReal = 0; }

  // ── Save / load ─────────────────────────────────────────────────
  // Every item out on the belts, where it is and where it's headed, so a
  // reload puts the lines back exactly as they were instead of empty. The
  // source and destination buildings are recreated by the load, so they're
  // stored by anchor tile + type and looked up again; an item whose either
  // end no longer resolves is dropped. Routes and hops are re-derived.
  function serialise() {
    const out = [];
    for (const arr of _tiles.values()) for (const it of arr) {
      if (!_alive(it.src)) continue;
      const routed = !it.loose && !it.sink && _alive(it.dst);
      // a loose item (queued at the end of a line) has no destination: -1s;
      // a spur item stores the spur's end tile with type 'sink'
      const sink = !it.loose && it.sink;
      out.push([it.kind, it.c, it.r, +it.pos.toFixed(3), it.sc, it.sr, it.ix, it.iy, it.ij ? 1 : 0, +it.seed.toFixed(4),
                it.src.col, it.src.row, it.src.type,
                routed ? it.dst.col : -1, routed ? it.dst.row : -1, routed ? it.dst.type : sink ? 'sink' : '',
                (routed || sink) ? it.dp.c : -1, (routed || sink) ? it.dp.r : -1]);
    }
    return out;
  }
  function loadState(data) {
    clear();
    _graceUntil = _simTime + LOAD_GRACE;
    if (!Array.isArray(data)) return;
    const at = (c, r, type) => { const e = GridManager.getEntity(c, r); return e && e.col === c && e.row === r && e.type === type ? e : null; };
    for (const a of data) {
      const [kind, c, r, pos, sc, sr, ix, iy, ij, seed, scol, srow, stype, dcol, drow, dtype, dpc, dpr] = a;
      if (!KIND[kind]) continue;
      const src = at(scol, srow, stype);
      if (!src || !_beltAt(c, r)) continue;
      const dst = dcol >= 0 ? at(dcol, drow, dtype) : null;
      const it = _mkItem(kind, src, c, r, sc, sr, pos, ix, iy, !!ij, seed);
      if (dst) {
        it.dst = dst; it.dp = { c: dpc, r: dpr }; it.pk = key(dpc, dpr);
        _field(it.pk, it.dp);
        _aimExit(it);
      } else if (dtype === 'sink' && _beltAt(dpc, dpr)) {
        it.sink = true; it.dp = { c: dpc, r: dpr }; it.pk = key(dpc, dpr);
        _field(it.pk, it.dp);
        _aimExit(it);
      } else _loosen(it);
      _items(key(c, r)).push(it);
    }
  }
  // Debug / tests: items on the belts, per kind.
  function stats() {
    const out = {};
    for (const arr of _tiles.values()) for (const it of arr) out[it.kind] = (out[it.kind] || 0) + 1;
    return out;
  }

  // What a belt can physically carry of `kind`, units per game-second:
  // items packed nose to tail (gap apart) moving at SPEED. The sim uses it to
  // keep a hand-off from emptying a whole buffer in one tick (a mine's
  // backlog into a fresh Storage Container, say), so stock arrives at the
  // pace the belt shows it arriving.
  function rate(kind) {
    const K = KIND[kind];
    return K ? SPEED / K.gap * K.upi : Infinity;
  }

  // What has really been riding this belt tile lately: { kind, ago } or null.
  // An item on it right now wins; otherwise the last one seen within SEEN_KEEP.
  function kindAt(c, r) {
    const k = key(c, r), here = _tiles.get(k);
    if (here && here.length) return { kind: here[here.length - 1].kind, ago: 0 };
    const s = _seenOn.get(k);
    if (!s) return null;
    if (_simTime - s.t > SEEN_KEEP) { _seenOn.delete(k); return null; }
    return { kind: s.kind, ago: _simTime - s.t };
  }

  return { KIND, SPEED, rate, route, moved, produced, reach, movedFromBins, snapshot, update, render, clear, stats, serialise, loadState, kindAt, sinceOut, flowDir,
           srcPorts: _srcPorts, dstPorts: _dstPorts, srcKinds: _srcKinds,   // a building's OUT / IN stubs and what it ships (the belt's info panel)
           _debug: { tiles: _tiles, lanes: _lanes, srcPorts: _srcPorts, dstPorts: _dstPorts, faceDir: _faceDir, inRate: _inRate, taking: _taking, prime: _prime } };
})();
