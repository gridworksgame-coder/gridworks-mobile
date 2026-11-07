/* ═══════════════════════════════════════════════════════════════════
   RENDER: MINING & LOGISTICS
   Survey stations, coal/uranium/sulfur mines, conveyor belts, aquifers,
   water extractors, and above/underground pipes.
   ═══════════════════════════════════════════════════════════════════ */

// Find which immediate neighbour direction leads (through connected conveyors)
  // to a coal generator. Computed fresh each call so it's always correct
  // regardless of chain length, layout, or where the generator sits.
  function conveyorDownstreamDir(col, row, material, t) {
    // (c, r) is the specific tile being tested as a possible target — for
    // the coal generator this must be the exact footprint cell directly
    // behind its Coal IN port (matches CoalGeneratorConnections.stubs()
    // and the connected-array check above), not just "any tile that
    // belongs to a coal generator." Without this, a belt touching the
    // generator's north or east side would get treated as a valid
    // downstream path even though no arm renders there (connected=false),
    // so lumps would travel toward a direction with no visible belt —
    // i.e. visually flying off the sprite.
    const isDownstreamTarget = (ent, c, r) => {
      if (!ent) return false;
      if (material === 'rod') {
        // Only the reactor's fixed rod-IN stub tile counts — matches
        // NuclearSystem.getStubs().rodIn exactly (same fix as sulfur below).
        // Without this, any tile touching the reactor's footprint counted
        // as a valid downstream target even though no belt arm renders
        // there, sending the rod pellet toward empty space beside the
        // reactor instead of the one tile that's actually connected — read
        // by the player as the rod "going into" the plant/nowhere instead
        // of traveling on to the reactor.
        if (ent.type !== T.NUCLEARREACTOR) return false;
        const rodIn = NuclearSystem.getStubs(ent).rodIn;
        return c === rodIn.c && r === rodIn.r;
      }
      if (material === 'uranium') {
        // Only the fuel plant's fixed uranium-IN stub tile counts — matches
        // FuelPlantSystem.getStubs().convIn exactly (same fix as sulfur
        // below). Without this, any tile touching the plant's footprint
        // counted as a valid downstream target even though no belt arm
        // renders there, sending the ore lump toward empty space beside the
        // plant instead of the one tile that's actually connected — i.e.
        // visually flying off the belt.
        if (ent.type !== T.FUELPLANT) return false;
        const convIn = FuelPlantSystem.getStubs(ent).convIn;
        return c === convIn.c && r === convIn.r;
      }
      if (material === 'sulfur') {
        // Only the footprint cell immediately behind the plant's single
        // sulfur-IN stub counts — this is what GridManager.getEntity()
        // resolves to when the flood-fill steps from the external stub
        // tile into the building (matches the COALGENERATOR check below).
        if (ent.type !== T.CHEMICALPLANT) return false;
        const inside = ChemicalSystem.getStubs(ent).convInside;
        return c === inside.c && r === inside.r;
      }
      if (ent.type === T.COALGENERATOR) {
        const cgH = ent.height || 4;
        return c === ent.col && r === ent.row + cgH - 1;
      }
      // Storage Container: the footprint cell behind its IN stub.
      if (ent.type === T.SOLIDSTORAGE) {
        const inside = SolidStorageSystem.ports(ent).inInside;
        return c === inside.c && r === inside.r;
      }      // Coke Oven: the footprint cell behind its COAL IN stub.
      if (ent.type === T.COKEOVEN) {
        const ci = CokeOvenSystem.getStubs(ent).coalIn;
        return c === ci.c && r === ci.r - 1;
      }
      return ent.type === T.CHEMICALPLANT || ent.type === T.FUELPLANT || ent.type === T.NUCLEARREACTOR;
    };
    // Downstream = the neighbour one step closer to the nearest input port.
    // This used to return the FIRST direction (up, down, left, right) whose
    // search reached any target at all — on a trunk line feeding several
    // generators, a feeder's "up" search would run along the trunk and down
    // into a neighbouring generator, so stretches of belt animated away from
    // the generator they actually feed. A shared distance field makes every
    // tile agree.
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    const field = _conveyorDistanceField(col, row, material, isDownstreamTarget, t);
    for (const [dc, dr] of dirs) {
      const ent = GridManager.getEntity(col+dc, row+dr);
      if (ent && isDownstreamTarget(ent, col+dc, row+dr)) return [dc, dr];
    }
    const myD = field.get(`${col},${row}`);
    if (myD === undefined || myD < 0) return null;
    for (const [dc, dr] of beltSteps(col, row)) {
      if (field.get(`${col+dc},${row+dr}`) === myD - 1) return [Math.sign(dc), Math.sign(dr)];
    }
    return null;
  }

  // Conveyor tile at (c, r), unwrapping a pipe crossing over a belt.
  function _conveyorAt(c, r) {
    let ent = GridManager.getEntity(c, r);
    if (ent && (ent.type === T.PIPE || ent.type === T.UNDERGNDPIPE) && ent._underConveyor) ent = ent._underConveyor;
    return ent && ent.type === T.CONVEYOR ? ent : null;
  }

  // Steps from every belt tile in (col, row)'s network to the nearest input
  // port tile (multi-source BFS from the tiles touching a target). -1 marks a
  // tile with no reachable target. Cached per frame (keyed on t) and per
  // material so each network is solved once, not once per tile per side.
  const _convFieldCache = { t: null, maps: {} };
  function _conveyorDistanceField(col, row, material, isTarget, t) {
    const mKey = material || 'default';
    if (t === undefined || _convFieldCache.t !== t) { _convFieldCache.t = t; _convFieldCache.maps = {}; }
    const map = _convFieldCache.maps[mKey] || (_convFieldCache.maps[mKey] = new Map());
    if (map.has(`${col},${row}`)) return map;
    const D4 = [[0,-1],[0,1],[-1,0],[1,0]];
    const tiles = [], seen = new Set([`${col},${row}`]);
    const stack = [[col, row]];
    while (stack.length && tiles.length < 20000) {
      const [c, r] = stack.pop();
      if (!_conveyorAt(c, r)) continue;
      tiles.push([c, r]);
      for (const [dc, dr] of beltSteps(c, r)) {
        const k = `${c+dc},${r+dr}`;
        if (!seen.has(k)) { seen.add(k); stack.push([c+dc, r+dr]); }
      }
    }
    const queue = [];
    tiles.forEach(([c, r]) => {
      map.set(`${c},${r}`, -1);
      for (const [dc, dr] of beltSteps(c, r)) {
        const ent = GridManager.getEntity(c+dc, r+dr);
        if (ent && isTarget(ent, c+dc, r+dr)) { map.set(`${c},${r}`, 0); queue.push([c, r]); break; }
      }
    });
    for (let qi = 0; qi < queue.length; qi++) {
      const [c, r] = queue[qi], d = map.get(`${c},${r}`);
      for (const [dc, dr] of beltSteps(c, r)) {
        const k = `${c+dc},${r+dr}`;
        if (map.get(k) === -1) { map.set(k, d + 1); queue.push([c+dc, r+dr]); }
      }
    }
    return map;
  }

  // Distance (in belt tiles) from (col, row) to its network's nearest input
  // port for the given material, or -1 when none is reachable.
  function conveyorFlowDist(col, row, material, t) {
    conveyorDownstreamDir(col, row, material, t);
    const map = _convFieldCache.maps[material || 'default'];
    const d = map ? map.get(`${col},${row}`) : undefined;
    return d === undefined ? -1 : d;
  }

  // Coal has no external "_isCoalConveyor" propagation flag (unlike uranium/
  // rod/sulfur, which get tagged tile-by-tile elsewhere). Flood-fill through
  // the connected conveyor network to see if a coal mine or coal generator
  // sits anywhere along the chain, so mid-belt tiles pick up coal too.
  //
  // The walk has no length limit (a belt can be as long as the player likes),
  // and this is asked once per belt tile per frame — so the answer is shared
  // with every tile the walk covered and kept for a moment (_beltWalkCached).
  const _touchesCoalCache = new Map();
  function _beltWalkCached(cache, col, row, walk) {
    const now = performance.now();
    const hit = cache.get(`${col},${row}`);
    if (hit && now - hit.t < 400) return hit.v;
    const visited = new Set([`${col},${row}`]);
    const rec = { v: walk(col, row, visited), t: now };
    for (const k of visited) cache.set(k, rec);
    return rec.v;
  }
  const conveyorChainTouchesCoal = (col, row) => _beltWalkCached(_touchesCoalCache, col, row, _walkTouchesCoal);

  function _walkTouchesCoal(col, row, visited) {
    const targets = new Set([T.COALMINE, T.COALMINE2, T.COALGENERATOR, T.SOLIDSTORAGE]);
    const queue = [[col, row]];
    while (queue.length) {
      const [c, r] = queue.shift();
      for (const [dc, dr] of beltSteps(c, r)) {
        const nc = c+dc, nr = r+dr;
        const key = `${nc},${nr}`;
        if (visited.has(key)) continue;
        // A pipe crossing over a conveyor reports as T.PIPE at this grid
        // cell, not T.CONVEYOR — unwrap to the conveyor underneath (same
        // as the neighbour lookup at the top of renderConveyor) so the
        // flood-fill doesn't dead-end at every pipe/belt crossing and cut
        // off coal-lump animation for everything downstream of it.
        let ent = GridManager.getEntity(nc, nr);
        if (ent && ent.type === T.PIPE && ent._underConveyor) ent = ent._underConveyor;
        if (!ent) continue;
        // A Storage Container only counts while it could have coal in it:
        // empty, or holding coal. One banking another solid (ore, rods,
        // pellets) puts no coal on a belt, and counting it made any unmarked
        // belt beside it draw, and read in the info panel, as coal.
        if (targets.has(ent.type) && _isCoalMinePort(ent, c, r)
            && (ent.type !== T.SOLIDSTORAGE || ((!ent._solidType || ent._solidType === 'coal')
                && (SolidStorageSystem.isIn(ent, c, r) || SolidStorageSystem.isOut(ent, c, r))))) return true;
        if (ent.type === T.COKEOVEN && CokeOvenSystem.isCoalIn(ent, c, r)) return true;
        if (ent.type === T.CONVEYOR) { visited.add(key); queue.push([nc, nr]); }
      }
    }
    return false;
  }

// The belt's static layers (shadow, cross-members, steel frame, rubber belt,
// rails and idler bolts) — everything drawn BEFORE the scrolling cleats.
// They depend only on which sides connect, never on the entity or the clock.
// Draws through the global ctx, so it can run live or into a bake canvas.
function _convStaticLayers(cx, cy, drawArms, straight) {
    const S = TILE / 40;
    const beltHalfW  = TILE*0.18;
    const frameHalfW = beltHalfW + 3*S;
    const L = TILE / 2;
    const back = straight ? 0 : frameHalfW;
    const eachArm = fn => drawArms.forEach(a => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(a.ang); fn(a, a.stub ? L*0.55 : L); ctx.restore();
    });

    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.save(); ctx.translate(1.5*S, 2.5*S);
    eachArm((a, len) => ctx.fillRect(-back, -frameHalfW, len + back, frameHalfW*2));
    ctx.restore();

    eachArm((a, len) => {
      ctx.fillStyle = '#2a2d31';
      ctx.fillRect(len*0.5 - 1.5*S, -frameHalfW - 1.8*S, 3*S, frameHalfW*2 + 3.6*S);
    });

    eachArm((a, len) => {
      ctx.fillStyle = '#5d646b';
      ctx.fillRect(-back, -frameHalfW, len + back, frameHalfW*2);
    });

    eachArm((a, len) => {
      ctx.fillStyle = '#303338';
      ctx.fillRect(-(straight ? 0 : beltHalfW), -beltHalfW, len + (straight ? 0 : beltHalfW), beltHalfW*2);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(0, -beltHalfW, len, beltHalfW*0.6);
    });

    eachArm((a, len) => {
      ctx.fillStyle = '#9ea6ae';
      ctx.fillRect(0, -frameHalfW, len, 1*S);
      ctx.fillStyle = '#3e4449';
      ctx.fillRect(0, frameHalfW - 1*S, len, 1*S);
      ctx.fillStyle = '#16181b';
      ctx.fillRect(0, -beltHalfW - 0.8*S, len, 0.8*S);
      ctx.fillRect(0, beltHalfW, len, 0.8*S);
      ctx.fillStyle = '#c8ced4';
      [0.28, 0.78].forEach(f => {
        ctx.beginPath(); ctx.arc(len*f, -beltHalfW - 1.6*S, 0.8*S, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(len*f,  beltHalfW + 1.6*S, 0.8*S, 0, Math.PI*2); ctx.fill();
      });
    });
}

// One baked bitmap per connection pattern, at the scale the world is drawn
// at. While the zoom is changing it steps aside (tiles draw live) and
// re-bakes once the zoom has held still for a moment. Turn it off with
// ConveyorStatic.enabled = false to compare against the plain draw.
const ConveyorStatic = (() => {
  const M = TILE / 2, SIZE = TILE + 2 * M;   // margin for the shadow and frame overhang
  const DIRS = [[0,-1],[0,1],[-1,0],[1,0]];
  const SETTLE_MS = 150;     // a scale must be seen this long before it is baked
  const MAX_SETS = 4;
  const sets = new Map();    // rounded scale -> { sc, born, bitmaps: Map(mask -> canvas) }
  const api = { enabled: true, M, SIZE };
  function armsFor(mask) {
    const arms = [];
    DIRS.forEach(([dc, dr], i) => { if (mask & (1 << i)) arms.push({ ang: Math.atan2(dr, dc) }); });
    return arms.length ? arms : [{ ang: 0, stub: true }, { ang: Math.PI, stub: true }];
  }
  function bake(st, mask) {
    const sc = st.sc;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(SIZE * sc); cv.height = Math.ceil(SIZE * sc);
    const g = cv.getContext('2d');
    g.setTransform(sc, 0, 0, sc, 0, 0);
    const prev = ctx; ctx = g;
    try { _convStaticLayers(M + TILE / 2, M + TILE / 2, armsFor(mask), mask === 3 || mask === 12); }
    finally { ctx = prev; }
    st.bitmaps.set(mask, cv);
    return cv;
  }
  api.clear = () => sets.clear();
  // Each zoom level has its own set, so contexts drawn at different scales
  // never fight over one. While the zoom is changing every frame is a new
  // scale that never reaches SETTLE_MS, so tiles simply draw live.
  api.blit = (mask, px, py) => {
    if (!api.enabled) return false;
    // Translucent draws (a belt seen under a pipe crossing, placement ghosts)
    // blend layer by layer; a pre-composed bitmap would not look the same.
    if (ctx.globalAlpha !== 1) return false;
    const m = ctx.getTransform();
    const sc = m.a;
    if (!(sc > 0.05) || m.b !== 0 || m.c !== 0 || Math.abs(m.d - sc) > 1e-6) return false;
    const key = Math.round(sc * 1000);
    let st = sets.get(key);
    if (!st) {
      st = { sc, born: performance.now(), bitmaps: new Map() };
      sets.set(key, st);
      if (sets.size > MAX_SETS) sets.delete(sets.keys().next().value);
    }
    if (performance.now() - st.born < SETTLE_MS) return false;
    const cv = st.bitmaps.get(mask) || bake(st, mask);
    ctx.drawImage(cv, px - M, py - M, cv.width / st.sc, cv.height / st.sc);
    return true;
  };
  return api;
})();

// Which sides of a belt tile join something, and which way it runs — all of
// renderConveyor that does not depend on the clock. It is by far the dear
// part of drawing a belt (a neighbour survey, a dozen material tests and
// three searches along the line, per tile), and its answer only changes when
// something is built or a line starts or stops carrying; ConveyorLayout
// below keeps it for a few ticks instead of working it out sixty times a
// second for every belt on screen.
function _conveyorLayout(e, t, full = true) {
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    const neighbours = dirs.map(([dc,dr]) => {
      let n = GridManager.getEntity(e.col+dc, e.row+dr);
      // A pipe sitting on top of a conveyor counts as that conveyor, so the
      // belt doesn't visually break wherever a pipe crosses over it — the
      // crossing tile's top-level type isn't T.CONVEYOR at all.
      //
      // But only for a real CROSSING: the buried belt has to carry on out the
      // far side of the pipe. A belt that merely dead-ends under a pipe used
      // to pull an arm out of its neighbour, which read as the belt plugging
      // into the pipework — belts and pipes carry different things and should
      // never look joined.
      if (n && (n.type === T.PIPE || n.type === T.UNDERGNDPIPE) && n._underConveyor) {
        const beyond = GridManager.getEntity(e.col + dc*2, e.row + dr*2);
        n = (typeof isConveyorTile === 'function' ? isConveyorTile(beyond) : false) ? n._underConveyor : null;
      }
      return n;
    });
    const connected  = neighbours.map(n => {
      if (!n) return false;
      // Coal generator: ONLY the fixed Coal IN stub tile (left face, bottom
      // row) is valid — matches CoalGeneratorConnections.stubs() and
      // coal_system.js's generatorInputPort() exactly. Used to accept a
      // conveyor on any side of the building, which is why a belt laid
      // anywhere around the sprite would visually connect regardless of
      // where it actually touched.
      if (n.type === T.COALGENERATOR) {
        const cgH = n.height || 4;
        return e.col === n.col - 1 && e.row === n.row + cgH - 1;
      }
      // Chemical plant: ONLY the fixed sulfur-IN stub tile is valid — matches
      // ChemicalSystem.getStubs()/hasSulfurConveyor() exactly. Used to accept
      // a conveyor on any side of the building, which is why a belt laid
      // anywhere around the sprite would visually connect regardless of
      // where it actually touched.
      if (n.type === T.CHEMICALPLANT) {
        const stub = ChemicalSystem.getStubs(n).convStubs[0];
        return e.col === stub.c && e.row === stub.r;
      }
      // Fuel processing plant: ONLY the fixed U-IN / ROD-OUT conveyor stub
      // tiles are valid — matches FuelPlantSystem.getStubs() exactly. Used
      // to accept a conveyor on any side of the building, which is why a
      // belt laid anywhere around the sprite would visually connect
      // regardless of where it actually touched.
      if (n.type === T.FUELPLANT) {
        const { convIn, convOut } = FuelPlantSystem.getStubs(n);
        return (e.col === convIn.c  && e.row === convIn.r) ||
               (e.col === convOut.c && e.row === convOut.r);
      }
      // Nuclear reactor: ONLY the fixed rod-IN stub tile is valid — matches
      // NuclearSystem.getStubs().rodIn exactly. Without this, a belt
      // touching any side of the reactor's 6x6 footprint counted as
      // connected, drawing an arm into the building at every contact point
      // instead of just the one tile that's actually wired up.
      // The Advanced Reactor shares the same stub layout (its MOX IN is the
      // rodIn tile) — it used to be missing here, so its belt never joined.
      if (n.type === T.NUCLEARREACTOR || n.type === T.ADVREACTOR) {
        const { rodIn, wasteOut, graphiteIn } = NuclearSystem.getStubs(n);
        return [rodIn, wasteOut, graphiteIn].some(p => p && e.col === p.c && e.row === p.r);
      }
      // Spent Fuel Pool: ONLY its SPENT FUEL IN / COOLED FUEL OUT stubs —
      // SpentFuelPoolSystem.getStubs(). It wasn't listed, so belts stopped
      // short of its hatches.
      if (n.type === T.SPENTFUELPOOL) {
        const { spentIn, spentOut } = SpentFuelPoolSystem.getStubs(n);
        return [spentIn, spentOut].some(p => p && e.col === p.c && e.row === p.r);
      }
      // Lithium processing plant: ONLY the fixed ORE-IN / CPD-OUT conveyor
      // stub tiles are valid — matches LithiumProcessPlantSystem.getStubs().
      if (n.type === T.LITHIUMPROCESSPLANT) {
        const { oreIn, compoundOut } = LithiumProcessPlantSystem.getStubs(n);
        return (e.col === oreIn.c       && e.row === oreIn.r) ||
               (e.col === compoundOut.c && e.row === compoundOut.r);
      }
      // Tritium Breeding Facility: ONLY its LITHIUM IN stub —
      // TritiumBreederSystem.getStubs(). Its other port is a pipe.
      if (n.type === T.TRITIUMBREEDER) {
        const { compoundIn } = TritiumBreederSystem.getStubs(n);
        return e.col === compoundIn.c && e.row === compoundIn.r;
      }
      // Reprocessing Plant: ONLY its SPENT FUEL IN / PLUTONIUM OUT /
      // RECOVERED U OUT stubs — ReprocessingSystem.getStubs(). It wasn't
      // listed here at all, so belts never drew an arm into it.
      if (n.type === T.REPROCESSOR) {
        const { spentIn, plutoniumOut, recoveredOut } = ReprocessingSystem.getStubs(n);
        return [spentIn, plutoniumOut, recoveredOut].some(p => p && e.col === p.c && e.row === p.r);
      }
      // Advanced Fuel Processing (MOX) plant: ONLY its PuO₂ IN / UO₂ IN /
      // MOX OUT stubs — MoxPlantSystem.getStubs(). Same omission as above.
      if (n.type === T.MOXPLANT) {
        const { plutoniumIn, uraniumIn, moxOut } = MoxPlantSystem.getStubs(n);
        return [plutoniumIn, uraniumIn, moxOut].some(p => p && e.col === p.c && e.row === p.r);
      }
      // Fusion fuel plant: ONLY the fixed pellets-OUT conveyor stub tile is
      // valid — its inputs are all pipes now (FusionFuelPlantSystem.getStubs()).
      if (n.type === T.FUSIONFUELPLANT) {
        const { plasmaOut, he3PelletOut } = FusionFuelPlantSystem.getStubs(n);
        return (e.col === plasmaOut.c && e.row === plasmaOut.r) || (e.col === he3PelletOut.c && e.row === he3PelletOut.r);
      }
      // Hulking Fusion Reactor: ONLY the PELLETS IN and Li COMPOUND IN conveyor
      // stubs — matches HulkingFusionReactorSystem.getStubs().
      if (n.type === T.HULKINGFUSIONREACTOR) {
        const { plasmaIn, blanketIn } = HulkingFusionReactorSystem.getStubs(n);
        return (e.col === plasmaIn.c && e.row === plasmaIn.r) || (e.col === blanketIn.c && e.row === blanketIn.r);
      }
      // Advanced Fusion Reactor: ONLY its PELLETS IN belt stub.
      if (n.type === T.ADVFUSIONREACTOR) {
        const { plasmaIn } = AdvancedFusionReactorSystem.getStubs(n);
        return e.col === plasmaIn.c && e.row === plasmaIn.r;
      }
      // Coal mines: ONLY the OUT stub tile (CoalSystem.mineOutputPort) connects.
      if (n.type === T.COALMINE || n.type === T.COALMINE2) return _isCoalMinePort(n, e.col, e.row);
      // Uranium mine: ONLY its OUT stub at the end of the rail track.
      if (n.type === T.URANIUMMINE) return UraniumSystem.isOutputPort(n, e.col, e.row);
      // Sulfur mine: ONLY its OUT stub beside the bottom row.
      if (isSulfurMine(n)) return SulfurSystem.isOutputPort(n, e.col, e.row);
      // Lithium mine: ONLY its OUT stub beside the stockpile.
      if (n.type === T.LITHIUMMINE) return LithiumSystem.isOutputPort(n, e.col, e.row);
      // Rare Earth Mine: ONLY its OUT stub at the end of the rail track.
      if (n.type === T.RAREEARTHMINE) return RareEarthSystem.isOutputPort(n, e.col, e.row);
      // Leach Plant: ONLY its ORE IN / OXIDE OUT belt stubs (ACID IN is a pipe).
      if (n.type === T.LEACHPLANT) {
        const { oreIn, oxideOut } = LeachPlantSystem.getStubs(n);
        return (e.col === oreIn.c && e.row === oreIn.r) || (e.col === oxideOut.c && e.row === oxideOut.r);
      }
      // Superconductor Mill: ONLY its OXIDE IN / TAPE OUT belt stubs (the gases are pipes).
      if (n.type === T.SCMILL) {
        const { oxideIn, tapeOut } = SuperconductorMillSystem.getStubs(n);
        return (e.col === oxideIn.c && e.row === oxideIn.r) || (e.col === tapeOut.c && e.row === tapeOut.r);
      }
      // Graphitization Furnace: ONLY its COKE IN / GRAPHITE OUT stubs.
      if (n.type === T.GRAPHITEFURNACE) {
        const { cokeIn, graphiteOut } = GraphiteFurnaceSystem.getStubs(n);
        return (e.col === cokeIn.c && e.row === cokeIn.r) || (e.col === graphiteOut.c && e.row === graphiteOut.r);
      }
      // Coke Oven: ONLY its COAL IN / COKE OUT belt stubs (GAS OUT is a pipe).
      if (n.type === T.COKEOVEN) {
        const { coalIn, cokeOut } = CokeOvenSystem.getStubs(n);
        return (e.col === coalIn.c && e.row === coalIn.r) || (e.col === cokeOut.c && e.row === cokeOut.r);
      }      // Core Works: ONLY its TAPE IN stub.
      if (n.type === T.COREWORKS) {
        const { tapeIn } = CoreWorksSystem.getStubs(n);
        return e.col === tapeIn.c && e.row === tapeIn.r;
      }
      // Storage Container: ONLY its IN (left) and OUT (right) stub tiles.
      if (n.type === T.SOLIDSTORAGE) return SolidStorageSystem.isIn(n, e.col, e.row) || SolidStorageSystem.isOut(n, e.col, e.row);
      return n.type === T.CONVEYOR || isSulfurMine(n) || n.type === T.URANIUMMINE || n.type === T.LITHIUMMINE;
    });
    for (let i = 0; i < 4; i++)
      if (connected[i] && !beltStepAllowed(e.col, e.row, dirs[i][0], dirs[i][1])) connected[i] = false;
    // Below CONVEYOR_CLEAT_MIN_ZOOM no cleats are drawn, and they are all the
    // way it runs is for: the sides it joins are the whole answer there.
    if (!full) return { connected, pdc: 0, pdr: 0, full: false };
    // A belt running alongside that this one doesn't join says nothing about
    // what this one carries.
    for (let i = 0; i < 4; i++)
      if (!connected[i] && neighbours[i] && neighbours[i].type === T.CONVEYOR) neighbours[i] = null;
    // Detect belt material — sulfur if touching a sulfur mine directly, its
    // stub-connected chemical plant, or propagated along the belt chain via
    // _isSulfurConveyor (set by SulfurSystem.tickMine, mirrors uranium/rod).
    const isSulfur  = neighbours.some(n => n && ((isSulfurMine(n) && SulfurSystem.isOutputPort(n, e.col, e.row)) || n.type === T.CHEMICALPLANT))
                    || neighbours.some(n => n && n.type === T.CONVEYOR && n._isSulfurConveyor);
    const isLithium = !isSulfur && (neighbours.some(n => n && n.type === T.LITHIUMMINE && LithiumSystem.isOutputPort(n, e.col, e.row)) || neighbours.some(n => n && n.type === T.CONVEYOR && n._isLithiumConveyor));
    // Rare earth ore and oxide ride with uranium here: markOreBelt stamps all
    // three with the same _flowDC/_flowDR, which is all this needs.
    const _reOre    = e._isRareEarthConveyor || e._isOxideConveyor || e._isTapeConveyor || e._isCokeConveyor || e._isGraphiteConveyor
                   || neighbours.some(n => n && ((n.type === T.RAREEARTHMINE && RareEarthSystem.isOutputPort(n, e.col, e.row))
                                             || (n.type === T.CONVEYOR && (n._isRareEarthConveyor || n._isOxideConveyor || n._isTapeConveyor || n._isCokeConveyor || n._isGraphiteConveyor))));
    const isUranium = !isSulfur && !isLithium && (_reOre || neighbours.some(n => n && n.type === T.URANIUMMINE && UraniumSystem.isOutputPort(n, e.col, e.row)) || neighbours.some(n => n && n.type === T.CONVEYOR && n._isUraniumConveyor));
    const isRod    = !isSulfur && !isLithium && !isUranium && (neighbours.some(n => n && n.type === T.FUELPLANT) || neighbours.some(n => n && n.type === T.CONVEYOR && n._isRodConveyor));
    const isSpentFuel = !isSulfur && !isLithium && !isUranium && !isRod && (neighbours.some(n => n && (n.type === T.NUCLEARREACTOR || n.type === T.ADVREACTOR)) || neighbours.some(n => n && n.type === T.CONVEYOR && n._isSpentFuelConveyor));
    // MK4 plutonium tier. Reached only through the stamped belt flags: the
    // Reprocessing Plant has two product stubs on the same face, so "touches
    // the building" cannot tell plutonium from recovered uranium — only the
    // flag the plant wrote on each belt can. A tile's OWN flag wins: the two
    // product belts leave from neighbouring stubs, so going by neighbours
    // alone let a uranium tile beside the plutonium belt draw plutonium.
    const _mk4Base = !isSulfur && !isLithium && !isUranium && !isRod && !isSpentFuel;
    const _ownMk4  = e._isPlutoniumConveyor || e._isRecoveredConveyor || e._isMoxConveyor;
    const isPlutonium = _mk4Base && (_ownMk4 ? !!e._isPlutoniumConveyor :
                     neighbours.some(n => n && n.type === T.CONVEYOR && n._isPlutoniumConveyor));
    const isRecovered = _mk4Base && !isPlutonium && (_ownMk4 ? !!e._isRecoveredConveyor :
                     neighbours.some(n => n && n.type === T.CONVEYOR && n._isRecoveredConveyor));
    const isMox    = _mk4Base && !isPlutonium && !isRecovered && (_ownMk4 ? !!e._isMoxConveyor :
                     (neighbours.some(n => n && n.type === T.MOXPLANT) || neighbours.some(n => n && n.type === T.CONVEYOR && n._isMoxConveyor)));
    // Only the exact Compound-Out stub tile counts as touching the plant —
    // otherwise the Ore-In stub (also directly adjacent to the same building)
    // would falsely read as carrying compound once it's no longer touching a
    // mine of its own (which is what isLithium above would normally catch).
    const touchesCompoundOutStub = neighbours.some(n => {
      if (!n || n.type !== T.LITHIUMPROCESSPLANT) return false;
      const { compoundOut } = LithiumProcessPlantSystem.getStubs(n);
      return e.col === compoundOut.c && e.row === compoundOut.r;
    });
    const isCompound = !isSulfur && !isLithium && !isUranium && !isRod && !isSpentFuel && !isPlutonium && !isRecovered && !isMox &&
                     (touchesCompoundOutStub || neighbours.some(n => n && n.type === T.CONVEYOR && n._isLithiumCompoundConveyor));
    const isPlasma = !isSulfur && !isLithium && !isUranium && !isRod && !isSpentFuel && !isPlutonium && !isRecovered && !isMox && !isCompound &&
                     (neighbours.some(n => n && n.type === T.FUSIONFUELPLANT) || neighbours.some(n => n && n.type === T.CONVEYOR && (n._isPlasmaFuelConveyor || n._isHe3PelletConveyor)));
    // Coal: connected anywhere along the belt to a mine or generator, not
    // just directly touching one — mirrors how the other materials propagate.
    const isCoal   = !isSulfur && !isLithium && !isUranium && !isRod && !isSpentFuel && !isPlutonium && !isRecovered && !isMox && !isCompound && !isPlasma &&
                     conveyorChainTouchesCoal(e.col, e.row);

    // Determine the primary downstream (outward) direction and, for
    // uranium/rod, the upstream (incoming) direction too.
    //
    // Uranium and rod read the authoritative BFS parent-direction stamped
    // onto every tile by the mine/plant tick (_flowDC/_flowDR for uranium,
    // _rodFlowDC/_rodFlowDR for rod) instead of re-deriving "downstream"
    // independently on every tile via a fresh search. A per-tile search can
    // legitimately disagree with its neighbours about which way is
    // "downstream" at branch points (different tie-breaks), which read as
    // some stretches of belt animating backward and the material
    // snapping/looping in place instead of flowing smoothly end to end.
    let pdc, pdr, idc = null, idr = null;
    // Spent fuel uses the same stamped-parent approach: the reactor (and a
    // pool re-stamping its OUT belt) record _spentFuelFlowDC/DR on every tile.
    // So do the MK4 products: the Reprocessing Plant stamps its plutonium and
    // recovered-uranium belts, the MOX plant its MOX belt. They used to fall
    // through to the coal/sulfur downstream search below, which knows none of
    // their destinations and could point a tile's cargo the wrong way.
    const isMk4 = isPlutonium || isRecovered || isMox;
    const _flowField = isRod ? '_rodFlow' : isSpentFuel ? '_spentFuelFlow'
                     : isPlutonium ? '_plutoniumFlow' : isRecovered ? '_recoveredFlow'
                     : isMox ? '_moxFlow' : '_flow';
    if (isUranium || isRod || isSpentFuel || isMk4) {
      const flowDC = e[_flowField + 'DC'];
      const flowDR = e[_flowField + 'DR'];
      const inDC = -(flowDC || 0), inDR = -(flowDR || 0);
      const inIdx = dirs.findIndex(([dc, dr]) => dc === inDC && dr === inDR);
      if ((inDC !== 0 || inDR !== 0) && inIdx >= 0 && connected[inIdx]) { idc = inDC; idr = inDR; }
      // Downstream: the connected side that is either the final
      // destination's exact stub tile, or another belt tile whose own
      // recorded parent direction points back at this tile — i.e. this
      // tile is that neighbour's BFS parent, so it's the true next hop.
      let out = null;
      dirs.forEach(([dc, dr], i) => {
        if (out || !connected[i]) return;
        if (dc === idc && dr === idr) return;
        const n = neighbours[i];
        if (!n) return;
        if (isRod && n.type === T.NUCLEARREACTOR) {
          const rodIn = NuclearSystem.getStubs(n).rodIn;
          if (e.col + dc === rodIn.c && e.row + dr === rodIn.r) out = [dc, dr];
          return;
        }
        if (isUranium && n.type === T.FUELPLANT) {
          const convIn = FuelPlantSystem.getStubs(n).convIn;
          if (e.col + dc === convIn.c && e.row + dr === convIn.r) out = [dc, dr];
          return;
        }
        if (isUranium && n.type === T.LEACHPLANT) {
          const { oreIn } = LeachPlantSystem.getStubs(n);
          if (e.col === oreIn.c && e.row === oreIn.r) out = [dc, dr];
          return;
        }
        if (isUranium && n.type === T.SCMILL) {
          const { oxideIn } = SuperconductorMillSystem.getStubs(n);
          if (e.col === oxideIn.c && e.row === oxideIn.r) out = [dc, dr];
          return;
        }
        if (isUranium && n.type === T.COREWORKS) {
          const { tapeIn } = CoreWorksSystem.getStubs(n);
          if (e.col === tapeIn.c && e.row === tapeIn.r) out = [dc, dr];
          return;
        }
        if (n.type === T.CONVEYOR) {
          const nFlowDC = n[_flowField + 'DC'];
          const nFlowDR = n[_flowField + 'DR'];
          if (nFlowDC === dc && nFlowDR === dr) out = [dc, dr];
        }
      });
      if (!out) {
        // No confirmed next hop yet (e.g. belt doesn't reach the plant/
        // reactor on this side of the network) — fall back to any other
        // connected side, but never back toward the mine/plant source.
        dirs.forEach(([dc, dr], i) => {
          if (out || !connected[i]) return;
          if (dc === idc && dr === idr) return;
          const n = neighbours[i];
          if (n && (n.type === T.URANIUMMINE || n.type === T.RAREEARTHMINE || (isRod && n.type === T.FUELPLANT))) return;
          if (n && isUranium && n.type === T.LEACHPLANT && e._isOxideConveyor) return;   // the oxide belt's own source
          if (n && isUranium && n.type === T.SCMILL && e._isTapeConveyor) return;        // the tape belt's own source
          if (n && isUranium && n.type === T.COKEOVEN && e._isCokeConveyor) return;      // the coke belt's own source
          if (n && isUranium && n.type === T.GRAPHITEFURNACE && e._isGraphiteConveyor) return;   // the graphite belt's own source
          if (n && isSpentFuel && (n.type === T.NUCLEARREACTOR || n.type === T.ADVREACTOR)) return;
          if (n && (isPlutonium || isRecovered) && n.type === T.REPROCESSOR) return;
          if (n && isMox && n.type === T.MOXPLANT) return;
          out = [dc, dr];
        });
      }
      if (!out) out = idc !== null ? [-idc, -idr] : (connected.some(c => c) ? dirs[connected.findIndex(c => c)] : [0, 0]);
      [pdc, pdr] = out;
    } else {
      // Sulfur/coal/waste: a fresh search through connected conveyors wins
      // (always correct, any chain length/orientation); only fall back
      // when no generator/plant is reachable yet.
      const found = conveyorDownstreamDir(e.col, e.row, isSulfur ? 'sulfur' : null, t);
      const fdc = e._flowDC, fdr = e._flowDR;
      const fdIdx = dirs.findIndex(([dc, dr]) => dc === fdc && dr === fdr);
      if (found) {
        [pdc, pdr] = found;
      } else if (fdc !== undefined && fdr !== undefined && (fdc !== 0 || fdr !== 0) && fdIdx >= 0 && connected[fdIdx]) {
        pdc = fdc; pdr = fdr;
      } else {
        let fb = null;
        dirs.forEach(([dc, dr], i) => {
          if (fb || !connected[i]) return;
          const n = neighbours[i];
          if (n && (n.type === T.COALMINE || n.type === T.COALMINE2 || isSulfurMine(n) || n.type === T.LITHIUMMINE)) return;
          if (n && n.type === T.SOLIDSTORAGE && SolidStorageSystem.isOut(n, e.col, e.row)) return;   // a source, not a sink
          fb = [dc, dr];
        });
        if (!fb) { const fi = connected.findIndex(c => c); fb = fi >= 0 ? dirs[fi] : [0, 0]; }
        [pdc, pdr] = fb;
      }
      // Representative upstream (incoming) side — prefer the connected belt one
      // step further from the port, else the first connected non-downstream side
      const myFlowD = conveyorFlowDist(e.col, e.row, isSulfur ? 'sulfur' : null, t);
      if (myFlowD >= 0) dirs.forEach(([dc, dr], i) => {
        if (idc !== null || !connected[i]) return;
        if (conveyorFlowDist(e.col + dc, e.row + dr, isSulfur ? 'sulfur' : null, t) === myFlowD + 1) { idc = dc; idr = dr; }
      });
      dirs.forEach(([dc, dr], i) => {
        if (idc !== null || !connected[i]) return;
        if (dc === pdc && dr === pdr) return;
        idc = dc; idr = dr;
      });
    }
    return { connected, pdc, pdr, full: true };
}

const ConveyorLayout = (() => {
  const HOLD = 3;                 // logic ticks (0.3 s) an answer is reused for
  const kept = new WeakMap();     // belt entity -> its last answer
  return {
    // full: the way it runs (pdc/pdr) is wanted too, not only which sides join.
    of(e, t, full = true) {
      const topo = EntityRegistry.getTopologyVersion();
      let k = kept.get(e);
      if (k && (k.full || !full) && k.topo === topo && k.links === BELT_LINK_EPOCH && k.col === e.col && k.row === e.row && SIM_TICK_ID - k.tick < HOLD) return k;
      const fresh = !k || (full && !k.full);
      k = _conveyorLayout(e, t, full);
      // First seen: start part-way through the hold, by position, so a
      // screenful of belts does not all come due on the same frame.
      k.tick = fresh ? SIM_TICK_ID - ((e.col * 7 + e.row * 13) % HOLD) : SIM_TICK_ID;
      k.topo = topo; k.links = BELT_LINK_EPOCH; k.col = e.col; k.row = e.row;
      kept.set(e, k);
      return k;
    },
  };
})();

// Below this zoom the moving cleats on belts are not drawn (see renderConveyor).
// The camera stops at ~0.31, so this is only the last stretch of zooming out.
let CONVEYOR_CLEAT_MIN_ZOOM = 0.35;

// One belt cleat, the chevron (x0,y0)-(x1,y1)-(x2,y2) in an arm's own frame
// (x along the arm from the tile centre at cx,cy; the arm points along the
// unit axis ux,uy), added to the current path and trimmed to 0 <= x <= len.
function _cleatPath(cx, cy, ux, uy, len, x0, y0, x1, y1, x2, y2) {
    if (x0 >= 0 && x0 <= len && x1 >= 0 && x1 <= len && x2 >= 0 && x2 <= len) {
      ctx.moveTo(cx + x0*ux - y0*uy, cy + x0*uy + y0*ux);
      ctx.lineTo(cx + x1*ux - y1*uy, cy + x1*uy + y1*ux);
      ctx.lineTo(cx + x2*ux - y2*uy, cy + x2*uy + y2*ux);
      return;
    }
    _cleatSeg(cx, cy, ux, uy, len, x0, y0, x1, y1);
    _cleatSeg(cx, cy, ux, uy, len, x1, y1, x2, y2);
}
function _cleatSeg(cx, cy, ux, uy, len, xa, ya, xb, yb) {
    const dx = xb - xa, dy = yb - ya;
    let t0 = 0, t1 = 1;
    if (dx === 0) { if (xa < 0 || xa > len) return; }
    else {
      let ta = -xa / dx, tb = (len - xa) / dx;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 >= t1) return;
    }
    const X0 = xa + dx*t0, Y0 = ya + dy*t0, X1 = xa + dx*t1, Y1 = ya + dy*t1;
    ctx.moveTo(cx + X0*ux - Y0*uy, cy + X0*uy + Y0*ux);
    ctx.lineTo(cx + X1*ux - Y1*uy, cy + X1*uy + Y1*ux);
}

// One registered wire per network (every wire on a network carries the same
// load), for drawing a wire under a belt in its network's colour. Rebuilt
// once per sim tick.
let _netWireRefTick = -1;
const _netWireRefMap = new Map();
function _netWireRef(netId) {
  if (netId === undefined || netId < 0) return null;
  const tick = typeof SIM_TICK_ID !== 'undefined' ? SIM_TICK_ID : 0;
  if (tick !== _netWireRefTick) {
    _netWireRefTick = tick; _netWireRefMap.clear();
    for (const w of EntityRegistry.getByType(T.WIRE)) if (w.networkId >= 0 && !_netWireRefMap.has(w.networkId)) _netWireRefMap.set(w.networkId, w);
  }
  return _netWireRefMap.get(netId) || null;
}

function renderConveyor(e, px, py, t) {
    if (e._udgBelt) { renderUndergndBelt(e, px, py, t); return; }
    if (e._underWire) {
      ctx.save(); ctx.globalAlpha = 0.4;
      const uw = e._underWire;
      uw.col = e.col; uw.row = e.row;
      // PowerNetwork walks the tile, so the belt on top is what it marks
      // powered / on a network / out of range; the wire object under it
      // (rebuilt bare on load) never is, and drew dead while the line was
      // live. Draw it in the state the network gave the tile, with the load
      // of a neighbouring wire on the same network for the colour.
      uw.powered = !!e.powered; uw.networkId = e.networkId; uw.outOfRange = !!e.outOfRange;
      uw.load = 0; uw._effectiveThreshold = undefined;
      const ref = e.powered ? _netWireRef(e.networkId) : null;
      if (ref) { uw.load = ref.load || 0; uw._effectiveThreshold = ref._effectiveThreshold; }
      renderWire(uw, px, py, t);
      ctx.restore();
    }
    if (e._underPipe) {
      ctx.save(); ctx.globalAlpha = 0.4;
      e._underPipe.col = e.col; e._underPipe.row = e.row;
      renderPipe(e._underPipe, px, py, t);
      ctx.restore();
    }
    const cx = px + TILE/2, cy = py + TILE/2;
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    const { connected, pdc, pdr } = ConveyorLayout.of(e, t, Camera.zoom >= CONVEYOR_CLEAT_MIN_ZOOM);

    // Belt structure — each connected side is drawn as an "arm" in a local
    // frame rotated to point along +x from the tile centre, so one set of
    // drawing code covers straights, corners, T/cross junctions and ends.
    // Layers: drop shadow → cross-members → steel frame → rubber belt → rail
    // highlights + idler bolts → scrolling chevron cleats → centre piece
    // (turntable at bends/junctions, head drum at dead ends). The downstream
    // arm's cleats run outward, every other arm's run inward, so motion reads
    // as one continuous pass-through.
    const S = TILE / 40;
    const beltHalfW  = TILE*0.18;
    const frameHalfW = beltHalfW + 3*S;
    // Cleats run at the speed items travel (BeltCargo.SPEED tiles/s; one
    // cycle is L = half a tile).
    const phase = (t * BeltCargo.SPEED * 2) % 1;
    const L = TILE / 2;
    const nConn = connected.filter(Boolean).length;
    const straight = nConn === 2 && ((connected[0] && connected[1]) || (connected[2] && connected[3]));
    const arms = [];
    dirs.forEach(([dc, dr], i) => { if (connected[i]) arms.push({ ang: Math.atan2(dr, dc), down: dc === pdc && dr === pdr }); });
    // A lone tile still reads as a short belt section running along x.
    const drawArms = arms.length ? arms : [{ ang: 0, down: true, stub: true }, { ang: Math.PI, down: false, stub: true }];

    // Everything below the moving cleats depends only on which sides connect,
    // so it is baked once per connection pattern (16 of them) and blitted.
    const _convMask = (connected[0] ? 1 : 0) | (connected[1] ? 2 : 0) | (connected[2] ? 4 : 0) | (connected[3] ? 8 : 0);
    if (!ConveyorStatic.blit(_convMask, px, py)) _convStaticLayers(cx, cy, drawArms, straight);

    // Cleats: every arm's in one path and one stroke. This used to be a
    // save, rotate, clip and stroke per arm, and the clips were most of what
    // a belt tile cost to draw. Arms only ever point along the axes, so each
    // is placed by swapping and negating coordinates, and trimmed to its own
    // length by hand where the clip used to cut it.
    // LOD: zoomed right out a cleat is a third of a pixel wide, and a few
    // hundred belt tiles' worth of them was most of the belts' cost there
    // (measured ~18 vs ~28 fps over a belt yard at the furthest zoom).
    if (Camera.zoom >= CONVEYOR_CLEAT_MIN_ZOOM) {
    ctx.save();
    ctx.strokeStyle = 'rgba(128,136,146,0.7)'; ctx.lineWidth = 1.1*S; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    {
      const nTreads = 4, cw = 1.6*S, ch = beltHalfW*0.7;
      for (const a of drawArms) {
        const len = a.stub ? L*0.55 : L;
        const ux = Math.round(Math.cos(a.ang)), uy = Math.round(Math.sin(a.ang));
        const d = a.down ? cw : -cw;
        for (let k = 0; k < nTreads + 1; k++) {
          let tph = ((k/nTreads) + phase) % 1;
          if (!a.down) tph = 1 - tph;
          const x = L * tph;
          _cleatPath(cx, cy, ux, uy, len, x - d, -ch, x + d, 0, x - d, ch);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
    }

    _conveyorTop(e, cx, cy, t, connected);

    // What rides the belt is drawn by BeltCargo.render, after every tile.
  }

// Over a belt tile's static layers and cleats: the transfer turntable at a
// bend or junction (or the drum at a dead end), a splitter's housing and the
// hover highlight. BeltPipeRows draws these on their own for the tiles it
// batches.
function _conveyorTop(e, cx, cy, t, connected) {
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    const S = TILE / 40;
    const beltHalfW  = TILE*0.18;
    const frameHalfW = beltHalfW + 3*S;
    const phase = (t * BeltCargo.SPEED * 2) % 1;
    const L = TILE / 2;
    const nConn = connected.filter(Boolean).length;
    const straight = nConn === 2 && ((connected[0] && connected[1]) || (connected[2] && connected[3]));
    const back = straight ? 0 : frameHalfW;
    if (!straight) {
      const arms = [];
      dirs.forEach(([dc, dr], i) => { if (connected[i]) arms.push({ ang: Math.atan2(dr, dc) }); });
      if (nConn >= 2) {
        // Transfer turntable at bends and junctions
        const r = beltHalfW*0.9;
        ctx.fillStyle = '#3c4147';
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#8c949c'; ctx.lineWidth = 1*S; ctx.stroke();
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t*1.6);
        ctx.strokeStyle = '#6a7279'; ctx.lineWidth = 1.2*S;
        for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI*2/3); ctx.beginPath(); ctx.moveTo(r*0.25, 0); ctx.lineTo(r*0.8, 0); ctx.stroke(); }
        ctx.restore();
        ctx.fillStyle = '#e0b020';
        ctx.beginPath(); ctx.arc(cx, cy, 1.6*S, 0, Math.PI*2); ctx.fill();
      } else {
        // Head/tail drum across the belt at a dead end (or both ends of a lone tile)
        const ends = arms.length ? [{ ang: arms[0].ang, x: -back*0.35 }]
                                 : [{ ang: 0, x: L*0.55 }, { ang: Math.PI, x: L*0.55 }];
        ends.forEach(({ ang, x }) => {
          ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
          const dw = 4.5*S, dh = beltHalfW*2 + 2*S;
          const dg = ctx.createLinearGradient(x - dw/2, 0, x + dw/2, 0);
          dg.addColorStop(0, '#5a6168'); dg.addColorStop(0.5, '#b8c0c8'); dg.addColorStop(1, '#4a5056');
          ctx.fillStyle = dg;
          ctx.beginPath(); ctx.roundRect(x - dw/2, -dh/2, dw, dh, 2*S); ctx.fill();
          ctx.strokeStyle = '#1e2124'; ctx.lineWidth = 0.8*S; ctx.stroke();
          ctx.fillStyle = 'rgba(30,33,36,0.6)';
          for (let k = 0; k < 4; k++) {
            const yy = -dh/2 + ((k/4 + phase) % 1)*dh;
            ctx.fillRect(x - dw/2 + 0.6*S, yy, dw - 1.2*S, 0.8*S);
          }
          ctx.fillStyle = '#2a2d31';
          ctx.fillRect(x - 1.5*S, -frameHalfW - 1.8*S, 3*S, 1.8*S);
          ctx.fillRect(x - 1.5*S,  frameHalfW, 3*S, 1.8*S);
          ctx.restore();
        });
      }
    }

    // The housing sits over the items passing through it: in the main pass
    // it is queued and drawn after BeltCargo.render (renderPipesOverBelts).
    if (e._splitter) {
      if (_pipeOverBelt.armed && !e._bpPreview) _pipeOverBelt.sq.push(e, cx, cy);
      else renderSplitterHousing(e, cx, cy, t);
    }

    // Conveyor network hover highlight — pulse over every connected arm,
    // same treatment pipes get (see renderPipe), in a warm belt tone.
    if (e._conveyorHighlight) {
      ctx.save();
      ctx.globalAlpha = 0.14 + 0.05 * Math.sin(t * 4);
      ctx.strokeStyle = '#ffd890';
      ctx.lineWidth   = beltHalfW * 2 + 1.5;
      ctx.lineCap     = 'round';
      dirs.forEach(([dc, dr], i) => {
        if (!connected[i]) return;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dc * TILE/2, cy + dr * TILE/2); ctx.stroke();
      });
      if (!connected.some(Boolean)) {
        ctx.beginPath(); ctx.arc(cx, cy, beltHalfW + 0.75, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
}

// Conveyor Splitter: a steel diverter box over the junction's turntable,
// hazard-striped, with an amber arrow to its favoured way out (Priority and
// Ratio) or three small arrows fanning out (Even). The tag under the arrow
// names the mode: P, or the favoured share in Ratio. Also draws the ghost.
function renderSplitterHousing(e, cx, cy, t) {
    const S = TILE / 40, h = TILE * 0.27;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.roundRect(cx - h + 1.5*S, cy - h + 2*S, h*2, h*2, 3*S); ctx.fill();
    const g = ctx.createLinearGradient(cx - h, cy - h, cx + h, cy + h);
    g.addColorStop(0, '#5a6168'); g.addColorStop(0.5, '#3a3f45'); g.addColorStop(1, '#25292d');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(cx - h, cy - h, h*2, h*2, 3*S); ctx.fill();
    // Hazard stripe round the rim.
    ctx.save();
    ctx.beginPath(); ctx.roundRect(cx - h, cy - h, h*2, h*2, 3*S); ctx.clip();
    ctx.lineWidth = 2.4*S; ctx.strokeStyle = '#e0b020';
    ctx.beginPath(); ctx.roundRect(cx - h, cy - h, h*2, h*2, 3*S); ctx.stroke();
    ctx.strokeStyle = '#1a1c1e'; ctx.lineWidth = 1.4*S;
    for (let k = -4; k <= 4; k++) {
      const o = k * 4*S;
      ctx.beginPath(); ctx.moveTo(cx - h + o, cy - h); ctx.lineTo(cx - h + o + 2*h, cy + h); ctx.stroke();
    }
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(cx - h + 2.2*S, cy - h + 2.2*S, h*2 - 4.4*S, h*2 - 4.4*S, 2*S); ctx.fill();
    ctx.restore();

    const mode = e._splitMode || 'even';
    const arrow = (side, len, w, col) => {
      const [dc, dr] = SPLIT_SIDES[side];
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.atan2(dr, dc));
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(len, 0); ctx.lineTo(len - w*1.4, -w); ctx.lineTo(len - w*1.4, -w*0.4);
      ctx.lineTo(1*S, -w*0.4); ctx.lineTo(1*S, w*0.4); ctx.lineTo(len - w*1.4, w*0.4); ctx.lineTo(len - w*1.4, w);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    };
    if (mode === 'even') {
      for (let s = 0; s < 4; s++) arrow(s, h*0.72, 1.6*S, 'rgba(255,208,128,0.75)');
    } else {
      const side = e._splitSide || 0;
      for (let s = 0; s < 4; s++) if (s !== side) arrow(s, h*0.55, 1.2*S, 'rgba(160,168,176,0.6)');
      const pulse = 0.8 + 0.2 * Math.sin(t * 4);
      arrow(side, h*0.85, 2.4*S, `rgba(255,192,64,${pulse})`);
      if (Camera.zoom > 0.6) {
        ctx.font = `bold ${Math.round(5.5*S)}px Courier New`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#101214';
        ctx.beginPath(); ctx.arc(cx, cy, 3.6*S, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#ffd080';
        ctx.fillText(mode === 'priority' ? 'P' : String(Math.round((e._splitRatio || 0.7) * 10)), cx, cy + 0.3*S);
      }
    }
    ctx.restore();
}

function renderAquifer(e, px, py, t) {
    if (e.col !== e.col) return;
    const s    = e.width || 5;
    const tw   = s * TILE, th = s * TILE;
    const mask = e._shapeMask || [];
    const on   = true; // always visible

    // Animated glow
    if (Camera.zoom > 0.5) {  // LOD: skip glow gradient when zoomed out — imperceptible at this scale, but costly to paint for every visible entity
    ctx.save();
    ctx.globalAlpha = 0.12 + 0.06 * Math.sin(t * 1.5);
    const g = ctx.createRadialGradient(px+tw/2, py+th/2, 0, px+tw/2, py+th/2, tw*0.6);
    g.addColorStop(0, '#20d4c8'); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px+tw/2, py+th/2, tw*0.6, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    }

    // Draw masked tile grid
    for (let r = 0; r < s; r++) {
      for (let c = 0; c < s; c++) {
        const idx = r * s + c;
        if (mask[idx] === 0) continue;
        const tx = px + c * TILE, ty = py + r * TILE;
        const ripple = 0.35 + 0.15 * Math.sin(t * 2 + c * 0.8 + r * 1.1);
        ctx.fillStyle = `rgba(8,60,70,${ripple})`;
        ctx.fillRect(tx+1, ty+1, TILE-2, TILE-2);
        // Water shimmer lines
        ctx.save();
        ctx.globalAlpha = 0.18 + 0.1 * Math.sin(t * 3 + c + r);
        ctx.strokeStyle = '#20d4c8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx+3, ty+TILE*0.4 + Math.sin(t*2+c)*2);
        ctx.lineTo(tx+TILE-3, ty+TILE*0.4 + Math.sin(t*2+c+1)*2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tx+3, ty+TILE*0.65 + Math.sin(t*2+r)*2);
        ctx.lineTo(tx+TILE-3, ty+TILE*0.65 + Math.sin(t*2+r+1)*2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Border
    ctx.strokeStyle = `rgba(32,212,200,${0.4+0.15*Math.sin(t*2)})`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(px+1, py+1, tw-2, th-2);

    // Label
    ctx.fillStyle = '#20d4c8';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(e._tierLabel || 'AQUIFER', px+tw/2, py+th/2+3);
    ctx.textAlign = 'left';
  }

function renderWaterExtractor(e, px, py, t) {
    // Water Extractor (4×4, on a lake): a floating pump barge — rounded hull
    // with hazard bumpers, a pump house with fan, gauge and beacon, and an
    // intake cage dropped into rippling, bubbling water. The rotatable pipe
    // output stub is drawn in its own deferred pass (renderWaterExtractorStub).
    const tw = TILE*(e.width||4), th = TILE*(e.height||4);
    const cx = px+tw/2, cy = py+th/2;
    const on = e.powered;
    const running = on && (e._waterRate || 0) > 0;
    const S = TILE / 40;
    ctx.save();

    // ── Ripples + intake bubbles ──
    const inX = cx, inY = py + th*0.66;
    if (running) {
      for (let i = 0; i < 3; i++) {
        const rp = ((t*0.4 + i*0.34) % 1);
        ctx.strokeStyle = `rgba(160,245,240,${0.45*(1 - rp)})`; ctx.lineWidth = 1.2*S;
        ctx.beginPath(); ctx.ellipse(cx, cy, tw*(0.44 + rp*0.12), th*(0.40 + rp*0.12), 0, 0, Math.PI*2); ctx.stroke();
      }
      if (Camera.zoom > 0.5) drawGlowHalo(inX, inY, TILE*1.2, [[0,'#20d4c8'],[1,'transparent']], 0.14+0.06*Math.sin(t*2));
    }

    // ── Hull ──
    const hx = px + tw*0.08, hy = py + th*0.12, hw = tw*0.84, hh = th*0.76;
    ctx.fillStyle = 'rgba(0,20,30,0.35)'; ctx.beginPath(); ctx.roundRect(hx + 4*S, hy + 6*S, hw, hh, 18*S); ctx.fill();
    ctx.fillStyle = '#2a3a44'; ctx.beginPath(); ctx.roundRect(hx, hy, hw, hh, 18*S); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(hx, hy, hw, hh, 18*S); ctx.clip();
    for (let x = hx - hh; x < hx + hw + hh; x += 12*S) {
      ctx.fillStyle = '#e0b020';
      ctx.beginPath(); ctx.moveTo(x, hy); ctx.lineTo(x + 6*S, hy); ctx.lineTo(x + 6*S + hh, hy + hh); ctx.lineTo(x + hh, hy + hh); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    const dx = hx + 5*S, dy = hy + 5*S, dw = hw - 10*S, dh = hh - 10*S;
    const dg = ctx.createLinearGradient(dx, dy, dx + dw, dy + dh);
    dg.addColorStop(0, '#9aa8b0'); dg.addColorStop(1, '#5a6a72');
    ctx.fillStyle = dg; ctx.beginPath(); ctx.roundRect(dx, dy, dw, dh, 14*S); ctx.fill();
    ctx.strokeStyle = 'rgba(30,40,46,0.3)'; ctx.lineWidth = 0.8*S;
    for (let y = dy + 5*S; y < dy + dh; y += 5*S) { ctx.beginPath(); ctx.moveTo(dx + 8*S, y); ctx.lineTo(dx + dw - 8*S, y); ctx.stroke(); }
    // bollards
    [[dx + 10*S, dy + 10*S], [dx + dw - 10*S, dy + 10*S], [dx + 10*S, dy + dh - 10*S], [dx + dw - 10*S, dy + dh - 10*S]].forEach(([bx, by]) => {
      ctx.fillStyle = '#2a2a2e'; ctx.beginPath(); ctx.arc(bx, by, 2.5*S, 0, Math.PI*2); ctx.fill();
    });

    // ── Intake cage ──
    const cgR = tw*0.13;
    ctx.fillStyle = '#062a30'; ctx.beginPath(); ctx.arc(inX, inY, cgR + 3*S, 0, Math.PI*2); ctx.fill();
    const wg = ctx.createRadialGradient(inX, inY, 1, inX, inY, cgR);
    wg.addColorStop(0, running ? '#80fff0' : '#2a6a6a'); wg.addColorStop(1, running ? '#0a6a78' : '#0a3a40');
    ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(inX, inY, cgR, 0, Math.PI*2); ctx.fill();
    if (running) {
      ctx.save(); ctx.translate(inX, inY); ctx.rotate(t*5);
      ctx.strokeStyle = 'rgba(200,255,250,0.85)'; ctx.lineWidth = 1.6*S; ctx.lineCap = 'round';
      for (let b = 0; b < 4; b++) { ctx.rotate(Math.PI/2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(cgR*0.4, -cgR*0.3, cgR*0.8, 0); ctx.stroke(); }
      ctx.restore();
      for (let i = 0; i < 5; i++) {
        const p = ((t*0.9 + i*0.21) % 1);
        ctx.fillStyle = `rgba(220,255,250,${0.8*(1 - p)})`;
        ctx.beginPath(); ctx.arc(inX + Math.sin(i*2.1 + t)*cgR*0.5, inY - p*cgR*0.9, (0.8 + (1 - p)*0.8)*S, 0, Math.PI*2); ctx.fill();
      }
    }
    ctx.strokeStyle = '#c8d0d4'; ctx.lineWidth = 1.2*S;
    ctx.beginPath(); ctx.arc(inX, inY, cgR + 1.5*S, 0, Math.PI*2); ctx.stroke();
    for (let k = 0; k < 8; k++) { const a = k*Math.PI/4; ctx.beginPath(); ctx.moveTo(inX + Math.cos(a)*cgR*0.3, inY + Math.sin(a)*cgR*0.3); ctx.lineTo(inX + Math.cos(a)*(cgR + 1.5*S), inY + Math.sin(a)*(cgR + 1.5*S)); ctx.stroke(); }

    // ── Pump house ──
    const phX = px + tw*0.22, phY = py + th*0.20, phW = tw*0.56, phH = th*0.28;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.roundRect(phX + 4*S, phY + 5*S, phW, phH, 3*S); ctx.fill();
    const hg = ctx.createLinearGradient(0, phY, 0, phY + phH);
    hg.addColorStop(0, on ? '#3ab0a8' : '#2a5a58'); hg.addColorStop(1, on ? '#1a6a66' : '#16302e');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.roundRect(phX, phY, phW, phH, 3*S); ctx.fill();
    ctx.strokeStyle = '#0a2a28'; ctx.lineWidth = S; ctx.stroke();
    _fcFan(phX + phW*0.28, phY + phH*0.5, phH*0.32, S, t, running, 7);
    const gx = phX + phW*0.66, gy = phY + phH*0.5, gr = phH*0.26;
    ctx.fillStyle = '#f0ece0'; ctx.beginPath(); ctx.arc(gx, gy, gr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.8*S; ctx.stroke();
    const na = -Math.PI*0.75 + (running ? (0.55 + 0.15*Math.sin(t*3)) : 0.05) * Math.PI*1.5;
    ctx.strokeStyle = '#c02010'; ctx.lineWidth = 1*S;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(na)*gr*0.8, gy + Math.sin(na)*gr*0.8); ctx.stroke();
    const blink = running && Math.sin(t*4) > 0;
    ctx.fillStyle = blink ? '#60ffe0' : (on ? '#1a4844' : '#0a1818');
    ctx.beginPath(); ctx.arc(phX + phW - 5*S, phY + 4*S, 1.8*S, 0, Math.PI*2); ctx.fill();
    if (blink) { ctx.fillStyle = 'rgba(96,255,224,0.3)'; ctx.beginPath(); ctx.arc(phX + phW - 5*S, phY + 4*S, 5*S, 0, Math.PI*2); ctx.fill(); }
    // riser from intake to pump house
    _wfPipe([[inX, inY - cgR - 3*S], [inX, phY + phH]], S, t, running, 'rgba(120,240,230,0.95)');

    _wfPlate(running ? `WATER ${(e._waterRate||0).toFixed(0)}/s` : on ? 'IDLE' : 'OFF', cx, py + th*0.90, S, running ? '#40e8dc' : '#5a8a88', on);

    if (InspectionPanel.isOpen() && InspectionPanel.target === e) {
      ctx.save(); ctx.strokeStyle='#20d4c8'; ctx.lineWidth=2/Camera.zoom;
      ctx.globalAlpha=0.7+0.3*Math.sin(t*4);
      ctx.strokeRect(px+1,py+1,tw-2,th-2); ctx.restore();
    }
    ctx.restore();
  }

// Water Extractor's pipe output stub — drawn in its own deferred pass
// (render_main_loop.js, after the main per-tile entity loop) instead of
// inline inside renderWaterExtractor. The stub extends past the sprite's
// own edge into whichever neighbouring tile is the rotatable output port,
// and that neighbour is very often plain lake water — since the main loop
// paints tiles in row-major scan order, a south- or east-facing port's
// water tile gets scanned (and painted) AFTER the extractor itself,
// covering the stub. Drawing it in a separate pass that always runs after
// the whole tile grid is painted guarantees it stays on top regardless of
// which direction it's rotated to face.
function renderWaterExtractorStub(e, px, py, t) {
    const tw = TILE*(e.width||4), th = TILE*(e.height||4);
    const on = e.powered;
    const rot = e._rotation || 0;
    const S = TILE / 40;
    const port = HydroSystem.extractorOutputPort(e);
    let pipeConnected = false;
    if (port) {
      let nb = GridManager.getEntity(port.c, port.r);
      if (nb && nb.type === T.WIRE     && nb._underPipe) nb = nb._underPipe;
      if (nb && nb.type === T.CONVEYOR && nb._underPipe) nb = nb._underPipe;
      pipeConnected = !!(nb && (nb.type === T.PIPE || nb.type === T.UNDERGNDPIPE));
    }
    const lit = pipeConnected && on;
    const dirs = [[0,-1],[1,0],[0,1],[-1,0]]; // N, E, S, W — matches rotation 0..3
    const [ddx, ddy] = dirs[rot % 4];
    // Attach point: centred on the port tile's own column (N/S) or row
    // (E/W), at the sprite edge — not cx/cy, which is the whole
    // footprint's centre and can land on a tile seam instead of inside
    // the port tile for an even-sized building.
    const portDX = (port ? port.c - e.col : Math.floor((e.width||4)/2)) ;
    const portDY = (port ? port.r - e.row : Math.floor((e.height||4)/2));
    const baseX = ddx !== 0 ? (ddx > 0 ? px + tw : px) : px + (portDX + 0.5) * TILE;
    const baseY = ddy !== 0 ? (ddy > 0 ? py + th : py) : py + (portDY + 0.5) * TILE;
    const isH = ddy === 0; // stub runs horizontally (E/W) vs vertically (N/S)
    const running = lit && (e._waterRate || 0) > 0;

    // Drawn in a local frame: +x points out of the barge, x = 0 is the
    // footprint edge. The pipe starts back on the deck (the hull sits ~13px
    // inside the footprint) so it reads as coming out of the barge rather
    // than floating over the water gap, and ends where the next tile's pipe
    // joins it.
    const L = 14*S, IN = 13*S;
    const x0 = -IN + 4*S, x1 = L - 2.5*S;
    const ang = Math.atan2(ddy, ddx);
    const frame = (ox, oy) => {
      ctx.translate(baseX + ox, baseY + oy); ctx.rotate(ang);
      // Mirror S/W stubs so the highlight stays on the lit (upper-left) side
      if (rot % 4 === 2 || rot % 4 === 3) ctx.scale(1, -1);
    };

    ctx.save(); frame(2.5*S, 3.5*S);                       // drop shadow
    ctx.fillStyle = 'rgba(0,12,22,0.35)';
    ctx.beginPath(); ctx.roundRect(-IN - 2*S, -5*S, IN + L + 4*S, 10*S, 3*S); ctx.fill();
    ctx.restore();

    ctx.save(); frame(0, 0);
    // Deck mounting plate
    ctx.fillStyle = '#3e4e56'; ctx.strokeStyle = '#141c20'; ctx.lineWidth = 0.8*S;
    ctx.beginPath(); ctx.roundRect(-IN - 2*S, -6*S, 7*S, 12*S, 1.5*S); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1a2226';
    for (const oy of [-4, 4]) { ctx.beginPath(); ctx.arc(-IN + 1.5*S, oy*S, 0.8*S, 0, Math.PI*2); ctx.fill(); }
    // Barrel with cylindrical shading
    ctx.fillStyle = '#10181c'; ctx.fillRect(x0, -3.6*S, x1 - x0, 7.2*S);
    ctx.fillStyle = lit ? '#3a8ea4' : '#2e4c58'; ctx.fillRect(x0, -2.7*S, x1 - x0, 5.4*S);
    ctx.fillStyle = lit ? '#1f5c6c' : '#1c343c'; ctx.fillRect(x0, 0.9*S, x1 - x0, 1.8*S);
    ctx.fillStyle = 'rgba(255,255,255,0.32)'; ctx.fillRect(x0, -2.1*S, x1 - x0, 0.9*S);
    // Water moving through while pumping
    if (running) {
      ctx.strokeStyle = 'rgba(150,245,255,0.9)'; ctx.lineWidth = 1.3*S; ctx.lineCap = 'round';
      ctx.setLineDash([2.5*S, 3.5*S]); ctx.lineDashOffset = -t*18*S;
      ctx.beginPath(); ctx.moveTo(x0 + 1*S, -0.2*S); ctx.lineTo(x1 - 1*S, -0.2*S); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.lineCap = 'butt';
    }
    // Clamp bands
    ctx.fillStyle = '#6c7c84';
    for (const bx of [x0 + 2*S, x1 - 3.5*S]) ctx.fillRect(bx, -3.9*S, 1.4*S, 7.8*S);
    // Gate valve with handwheel, just off the hull
    const vx = -5*S;
    ctx.fillStyle = '#4a5a62'; ctx.strokeStyle = '#141c20'; ctx.lineWidth = 0.7*S;
    ctx.beginPath(); ctx.moveTo(vx - 3.5*S, -4.2*S); ctx.lineTo(vx, 0); ctx.lineTo(vx - 3.5*S, 4.2*S); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(vx + 3.5*S, -4.2*S); ctx.lineTo(vx, 0); ctx.lineTo(vx + 3.5*S, 4.2*S); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = lit ? '#d0402a' : '#6a4a44'; ctx.lineWidth = 1*S;
    ctx.beginPath(); ctx.arc(vx, 0, 3*S, 0, Math.PI*2); ctx.stroke();
    ctx.lineWidth = 0.6*S;
    ctx.beginPath(); ctx.moveTo(vx - 3*S, 0); ctx.lineTo(vx + 3*S, 0); ctx.moveTo(vx, -3*S); ctx.lineTo(vx, 3*S); ctx.stroke();
    ctx.fillStyle = '#1a1e20'; ctx.beginPath(); ctx.arc(vx, 0, 0.9*S, 0, Math.PI*2); ctx.fill();
    // Outlet: open bolted flange when piped, red blanking cap when not
    ctx.fillStyle = '#7a8a92'; ctx.strokeStyle = '#1a2226'; ctx.lineWidth = 0.8*S;
    ctx.beginPath(); ctx.roundRect(x1, -5*S, 2.5*S, 10*S, 0.8*S); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a3236';
    for (const oy of [-3.4, 3.4]) { ctx.beginPath(); ctx.arc(x1 + 1.25*S, oy*S, 0.6*S, 0, Math.PI*2); ctx.fill(); }
    if (!pipeConnected) {
      ctx.fillStyle = '#c23a22'; ctx.strokeStyle = '#4a120a';
      ctx.beginPath(); ctx.roundRect(x1 + 2.5*S, -3.2*S, 1.8*S, 6.4*S, 0.8*S); ctx.fill(); ctx.stroke();
    }
    ctx.restore();

    // Status tag (upright, beside the stub): same style as the coal
    // generator's port tags. Amber blink = powered but not piped.
    {
      const accent = '#40d8e8', text = 'H₂O OUT';
      ctx.font = `bold ${Math.max(3.5, 4*S)}px Courier New`;
      const tagW = ctx.measureText(text).width + 8.5*S, tagH = 7*S;
      const tx = isH ? (ddx > 0 ? baseX + 1*S : baseX - 1*S - tagW) : baseX + 7*S;
      const ty = isH ? baseY + 10*S : baseY + ddy*(L*0.55);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.roundRect(tx + 1*S, ty - tagH/2 + 1.5*S, tagW, tagH, 3*S); ctx.fill();
      ctx.fillStyle = '#16181c'; ctx.strokeStyle = lit ? accent : '#3a3e44'; ctx.lineWidth = 0.9*S;
      ctx.beginPath(); ctx.roundRect(tx, ty - tagH/2, tagW, tagH, 3*S); ctx.fill(); ctx.stroke();
      const warn = on && !pipeConnected && Math.sin(t*4) > 0;
      const lamp = lit ? accent : warn ? '#f0a020' : '#4a4e54';
      ctx.fillStyle = lamp;
      ctx.beginPath(); ctx.arc(tx + 3.3*S, ty, 1.3*S, 0, Math.PI*2); ctx.fill();
      if (lit || warn) { ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(tx + 3.3*S, ty, 2.6*S, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.fillStyle = lit ? '#f2f4f0' : '#9aa0a6';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(text, tx + 6*S, ty + 0.3*S);
      ctx.textBaseline = 'alphabetic';
    }
  }

// Pipe colours per fluid: rim = outline, body = tube, flange = joints and
// collars, hi = specular line, core = the fluid's glow line (none when dry).
const PIPE_PALETTE = {
  dry:       { rim: '#0a1214', body: '#2a3a3e', flange: '#46585c', hi: 'rgba(190,215,220,0.35)', core: null },
  water:     { rim: '#061a1a', body: '#1a4744', flange: '#2f6662', hi: 'rgba(150,255,240,0.45)', core: '#3ee6d4' },
  oil:       { rim: '#170c02', body: '#452a0a', flange: '#6a4418', hi: 'rgba(255,195,120,0.40)', core: '#ff9a20' },
  fueloil:   { rim: '#161204', body: '#443a10', flange: '#6a5c20', hi: 'rgba(255,240,150,0.40)', core: '#e8d040' },
  acid:      { rim: '#161606', body: '#44441a', flange: '#66662a', hi: 'rgba(250,250,180,0.45)', core: '#f0f080' },
  steam:     { rim: '#0c0c18', body: '#30304a', flange: '#4c4c6a', hi: 'rgba(215,215,255,0.45)', core: '#b8b8ff' },
  // Cooled water — blue.
  cool:      { rim: '#051220', body: '#16385a', flange: '#285478', hi: 'rgba(150,200,255,0.45)', core: '#40a0f0' },
  // Cryogenic Coolant — white (was periwinkle), on a pale frosted casing.
  cryocool:  { rim: '#22282e', body: '#a4aeb6', flange: '#d0d8de', hi: 'rgba(255,255,255,0.70)', core: '#ffffff' },
  hydrogen:  { rim: '#051a26', body: '#154254', flange: '#266074', hi: 'rgba(150,230,255,0.45)', core: '#60d0ff' },
  nitrogen:  { rim: '#051e14', body: '#164c3c', flange: '#286c58', hi: 'rgba(160,255,210,0.45)', core: '#50e0a0' },
  ammonia:   { rim: '#05180a', body: '#17421c', flange: '#285e2e', hi: 'rgba(150,255,170,0.45)', core: '#40c860' },
  // Deuterium — rose pink. It used to be a pale sky blue, too close to both
  // water teal and hydrogen blue to tell apart at a glance.
  deuterium: { rim: '#1e0814', body: '#4c1a36', flange: '#722a52', hi: 'rgba(255,180,220,0.45)', core: '#ff6eb4' },
  highbeta:  { rim: '#050b1e', body: '#142a5c', flange: '#243f80', hi: 'rgba(140,180,255,0.50)', core: '#4080ff' },
  helium:    { rim: '#140a1c', body: '#3a2450', flange: '#583a72', hi: 'rgba(240,200,255,0.45)', core: '#f0b8ff' },
  liquidhe:  { rim: '#0a1a22', body: '#2a5a6c', flange: '#a8d8e8', hi: 'rgba(235,252,255,0.65)', core: '#e8fcff' },
  tritium:   { rim: '#061a10', body: '#1a4a30', flange: '#2a6a48', hi: 'rgba(170,255,210,0.45)', core: '#80ffc0' },
  helium3:   { rim: '#1c1206', body: '#4a3418', flange: '#6a4c28', hi: 'rgba(255,225,190,0.45)', core: '#ffd0a0' },
  // LPG (propane) — coral, clear of fuel-oil yellow and helium-3 peach.
  lpg:       { rim: '#1c0a08', body: '#4a2420', flange: '#6c3a32', hi: 'rgba(255,190,175,0.45)', core: '#ff7a5a' },
};
const PIPE_ELBOW_R = 7;

// Pipe tile geometry, cached as tile-local Path2D per connection mask and
// layer. Every pipe tile with the same connected sides has identical geometry,
// so it's traced once and stroked under a translate — pixel-identical to
// tracing it per tile, and cheaper for what is often the most numerous entity
// on screen. A layer is the centreline shifted perpendicular to each leg by `o`
// toward the top-left light (negative = toward the bottom-right, for the
// underside shade and ground shadow); `layer` must map to one fixed `o`.
// Shifting perpendicular, rather than translating the whole path, keeps every
// layer ending exactly on the tile edge, so neighbouring tiles join seamlessly.
const _pipePathCache = new Map();
function _pipePath(conn, mask, layer, o) {
  const key = mask * 16 + layer;
  let p = _pipePathCache.get(key);
  if (p) return p;
  p = new Path2D();
  const c = TILE / 2;
  if (conn.length === 2) {
    const a = conn[0], b = conn[1];
    p.moveTo(a.dc < 0 ? 0 : a.dc > 0 ? TILE : c - o,
             a.dr < 0 ? 0 : a.dr > 0 ? TILE : c - o);
    const bx = b.dc < 0 ? 0 : b.dc > 0 ? TILE : c - o;
    const by = b.dr < 0 ? 0 : b.dr > 0 ? TILE : c - o;
    p.arcTo(c - o, c - o, bx, by, PIPE_ELBOW_R);   // collinear sides → plain straight line
    p.lineTo(bx, by);
  } else {
    for (const d of conn) {
      p.moveTo(d.dc < 0 ? 0 : d.dc > 0 ? TILE : c - o,
               d.dr < 0 ? 0 : d.dr > 0 ? TILE : c - o);
      p.lineTo(d.dc !== 0 ? c : c - o, d.dr !== 0 ? c : c - o);
    }
  }
  _pipePathCache.set(key, p);
  return p;
}

// Joint flanges — a thin plate at each connected tile edge, half-height `fh`.
// Each tile draws only its own half; the neighbour draws the other half, so
// every joint reads as one flange.
function _pipeFlangePath(conn, mask, fh) {
  const key = mask * 16 + 15;
  let p = _pipePathCache.get(key);
  if (p) return p;
  p = new Path2D();
  const c = TILE / 2, fw = 2.5;
  for (const d of conn) {
    if (d.dc !== 0) p.rect(d.dc < 0 ? 0 : TILE - fw, c - fh, fw, fh * 2);
    else            p.rect(c - fh, d.dr < 0 ? 0 : TILE - fw, fh * 2, fw);
  }
  _pipePathCache.set(key, p);
  return p;
}

// The sides of a pipe tile that join something (bit 1 up, 2 down, 4 left,
// 8 right), kept per pipe for a few logic ticks. Dropped at once when
// anything is built or removed, when the pipe starts carrying something
// else, or when it moves; never kept for a blueprint ghost.
const PipeLayout = (() => {
  const HOLD = 3;                 // logic ticks (0.3 s)
  const kept = new WeakMap();     // pipe entity -> { tick, topo, fluid, col, row, mask }
  return {
    get(e, fluid) {
      if (e._bpPreview) return -1;
      const k = kept.get(e);
      if (!k || k.fluid !== fluid || k.col !== e.col || k.row !== e.row
          || k.topo !== EntityRegistry.getTopologyVersion() || SIM_TICK_ID - k.tick >= HOLD) return -1;
      return k.mask;
    },
    put(e, fluid, mask) {
      if (e._bpPreview) return;
      const k = kept.get(e);
      // First seen: start part-way through the hold, by position, so a
      // screenful of pipes does not all come due on the same frame.
      const tick = k ? SIM_TICK_ID : SIM_TICK_ID - ((e.col * 7 + e.row * 13) % HOLD);
      kept.set(e, { tick, topo: EntityRegistry.getTopologyVersion(), fluid, col: e.col, row: e.row, mask });
    },
  };
})();

// Which building types a pipe may draw an arm into. Built once: these were
// two fresh 30-entry Sets per pipe tile per frame.
let _PIPE_HYDRO_NBRS = null, _PIPE_OIL_NBRS = null, _UPIPE_HYDRO_NBRS = null, _UPIPE_OIL_NBRS = null;

// ── Pipes crossing over belts ──
// A pipe laid over a conveyor stands on a little gantry above it: the belt
// runs at full strength underneath (it used to be drawn at 40%, a ghostly
// patch at every crossing), two posts stand either side of the belt with a
// cross-beam under the pipe, and the pipe throws its shadow down onto the
// belt. What rides the belt (BeltCargo, drawn after every tile) passes
// under it, so during the main frame these pipes are queued and drawn
// after the cargo — see renderPipesOverBelts, called from render_main_loop.
const _pipeOverBelt = { armed: false, q: [], sq: [] };   // q: pipes over belts; sq: splitter housings
function _pipeGantry(belt, px, py, t) {
    const S = TILE / 40;
    const { connected } = ConveyorLayout.of(belt, t, false);
    const vert = (connected[0] || connected[1]) || !(connected[2] || connected[3]);
    const cx = px + TILE / 2, cy = py + TILE / 2;
    const off = TILE * 0.18 + 6 * S;              // just outside the belt's frame
    const half = 9.5 * S;                         // frame half-length: reaches past the pipe each side
    // One support frame on each side of the belt. Each is a bar running the
    // way the belt runs (so it shows either side of a pipe crossing over it)
    // standing on two feet, with the cross-beam joining the pair under the pipe.
    const frames = vert ? [[cx - off, cy], [cx + off, cy]] : [[cx, cy - off], [cx, cy + off]];
    const bar = (x, y, w, col) => {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath();
      if (vert) { ctx.moveTo(x, y - half); ctx.lineTo(x, y + half); } else { ctx.moveTo(x - half, y); ctx.lineTo(x + half, y); }
      ctx.stroke();
    };
    ctx.lineCap = 'butt';
    // shadows on the ground
    ctx.save(); ctx.translate(3 * S, 4 * S);
    for (const [x, y] of frames) bar(x, y, 3.2 * S, 'rgba(0,0,0,0.32)');
    ctx.restore();
    // cross-beam under the pipe
    ctx.strokeStyle = '#2e353e'; ctx.lineWidth = 3 * S;
    ctx.beginPath(); ctx.moveTo(frames[0][0], frames[0][1]); ctx.lineTo(frames[1][0], frames[1][1]); ctx.stroke();
    for (const [x, y] of frames) {
      bar(x, y, 3.2 * S, '#3e4852');
      bar(x - (vert ? 0.7 * S : 0), y - (vert ? 0 : 0.7 * S), 1.1 * S, '#9aa6b2');    // lit edge
      // feet at both ends, hazard-striped
      for (const k of [-1, 1]) {
        const fx = vert ? x : x + k * half, fy = vert ? y + k * half : y;
        ctx.fillStyle = '#e8b030'; ctx.fillRect(fx - 2.6 * S, fy - 2.6 * S, 5.2 * S, 5.2 * S);
        ctx.fillStyle = '#1e2228'; ctx.fillRect(fx - 2.6 * S, fy - 0.6 * S, 5.2 * S, 1.2 * S);
        ctx.fillStyle = '#c8ccd0'; ctx.beginPath(); ctx.arc(fx, fy, 0.9 * S, 0, Math.PI * 2); ctx.fill();   // bolt
      }
    }
}
// Draw the queued crossings: after BeltCargo.render, so the pipe is on top.
function renderPipesOverBelts(t) {
    const q = _pipeOverBelt.q, sq = _pipeOverBelt.sq;
    _pipeOverBelt.armed = false;
    for (let i = 0; i < sq.length; i += 3) renderSplitterHousing(sq[i], sq[i + 1], sq[i + 2], t);
    sq.length = 0;
    for (let i = 0; i < q.length; i += 3) renderPipe(q[i], q[i + 1], q[i + 2], t, true);
    q.length = 0;
}
function _armPipesOverBelts() { _pipeOverBelt.armed = true; _pipeOverBelt.q.length = 0; _pipeOverBelt.sq.length = 0; }

// A pipe tile's body: ground shadow, tube, shading, the fluid's core line,
// joint flanges and the collar, cap or socket. Tile-local (0,0 is the tile's
// top-left corner). bake: drawing into a PipeStatic bitmap, which leaves out
// the one moving part, a flowing junction's pulsing core.
function _pipeBody(conn, mask, pal, detail, hasFlow, a0, t, bake) {
    const c = TILE / 2, PIPE_R = 5.5, n = conn.length;
    ctx.lineCap  = 'butt';
    ctx.lineJoin = 'round';
    if (n > 0) {
      const centre = _pipePath(conn, mask, 1, 0);
      if (detail) {
        ctx.strokeStyle = 'rgba(0,0,0,0.28)';
        ctx.lineWidth = PIPE_R * 2 + 1;
        ctx.stroke(_pipePath(conn, mask, 0, -2.2));
      }
      ctx.strokeStyle = pal.rim;  ctx.lineWidth = PIPE_R * 2 + 2; ctx.stroke(centre);
      ctx.strokeStyle = pal.body; ctx.lineWidth = PIPE_R * 2 - 1; ctx.stroke(centre);
      if (detail) {
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth = PIPE_R * 0.8;
        ctx.stroke(_pipePath(conn, mask, 2, -PIPE_R * 0.45));
        ctx.strokeStyle = pal.hi;
        ctx.lineWidth = 1.5;
        ctx.stroke(_pipePath(conn, mask, 3, PIPE_R * 0.5));
      }
      // Fluid core — a glowing sight line in the fluid's colour, so what's
      // flowing stays readable even at LOD, where the droplets are skipped.
      if (hasFlow) {
        ctx.globalAlpha = a0 * 0.6;
        ctx.strokeStyle = pal.core;
        ctx.lineWidth = 2;
        ctx.stroke(centre);
        ctx.globalAlpha = a0;
      }
      if (detail) {
        ctx.fillStyle = pal.flange;
        ctx.fill(_pipeFlangePath(conn, mask, PIPE_R + 2.5));
      }
    }

    if (n >= 3) {
      // Junction collar — a small rect stroked with a round join gives a
      // rounded square without needing roundRect().
      ctx.beginPath(); ctx.rect(c - 4, c - 4, 8, 8);
      ctx.strokeStyle = pal.rim;    ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = pal.flange; ctx.lineWidth = 5; ctx.stroke();
      if (hasFlow) { if (!bake) _pipeJunctionGlow(pal, a0, t, c, c); }
      else {
        ctx.beginPath(); ctx.arc(c, c, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = pal.rim; ctx.fill();
      }
    } else if (n === 1) {
      // Blind-flange cap across the open end
      const d = conn[0];
      ctx.beginPath();
      if (d.dc !== 0) ctx.rect(c - 1, c - PIPE_R - 1, 2, PIPE_R * 2 + 2);
      else            ctx.rect(c - PIPE_R - 1, c - 1, PIPE_R * 2 + 2, 2);
      ctx.strokeStyle = pal.rim;    ctx.lineWidth = 5;   ctx.stroke();
      ctx.strokeStyle = pal.flange; ctx.lineWidth = 2.5; ctx.stroke();
    } else if (n === 0) {
      // Unconnected — a pipe socket seen from above
      ctx.beginPath(); ctx.rect(c - 4, c - 4, 8, 8);
      ctx.strokeStyle = pal.rim;    ctx.lineWidth = 9; ctx.stroke();
      ctx.strokeStyle = pal.flange; ctx.lineWidth = 5; ctx.stroke();
      ctx.beginPath(); ctx.arc(c, c, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#040a0b'; ctx.fill();
      ctx.strokeStyle = pal.hi; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.lineJoin = 'miter';
}
// The pulsing core at the middle of a flowing junction.
function _pipeJunctionGlow(pal, a0, t, x, y) {
    ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2);
    ctx.globalAlpha = a0 * (0.6 + 0.2 * Math.sin(t * 4));
    ctx.fillStyle = pal.core; ctx.fill();
    ctx.globalAlpha = a0;
}

// Pipe bodies baked like ConveyorStatic's belts: _pipeBody depends only on
// the connected sides, the fluid, whether it flows and the zoom's detail
// level, so each combination is drawn once per zoom scale and blitted — one
// drawImage instead of up to seven strokes and fills per pipe tile. Steps
// aside (tiles draw live) while the zoom is changing, for translucent draws,
// and when zoomed in so far that the bitmaps would be large and the tiles
// on screen few. PipeStatic.enabled = false compares against the live draw.
const PipeStatic = (() => {
  const M = 8, SIZE = TILE + 2 * M;   // margin for the shadow and the cap's overhang
  const SETTLE_MS = 150, MAX_SETS = 4, MAX_SCALE = 3;
  const sets = new Map();             // rounded scale -> { sc, born, bitmaps: Map(key -> canvas) }
  const FLUID = {};
  Object.keys(PIPE_PALETTE).forEach((k, i) => { FLUID[k] = i; });
  const api = { enabled: true, M, SIZE };
  api.clear = () => sets.clear();
  api.key = (mask, fluid, hasFlow, detail) => mask | (FLUID[fluid] << 4) | (hasFlow ? 1024 : 0) | (detail ? 2048 : 0);
  api.blit = (key, px, py, conn, mask, pal, detail, hasFlow) => {
    if (!api.enabled || ctx.globalAlpha !== 1) return false;
    const m = ctx.getTransform();
    const sc = m.a;
    if (!(sc > 0.05) || sc > MAX_SCALE || m.b !== 0 || m.c !== 0 || Math.abs(m.d - sc) > 1e-6) return false;
    const sk = Math.round(sc * 1000);
    let st = sets.get(sk);
    if (!st) {
      st = { sc, born: performance.now(), bitmaps: new Map() };
      sets.set(sk, st);
      if (sets.size > MAX_SETS) sets.delete(sets.keys().next().value);
    }
    if (performance.now() - st.born < SETTLE_MS) return false;
    let cv = st.bitmaps.get(key);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = Math.ceil(SIZE * st.sc); cv.height = Math.ceil(SIZE * st.sc);
      const g = cv.getContext('2d');
      g.setTransform(st.sc, 0, 0, st.sc, M * st.sc, M * st.sc);
      const prev = ctx; ctx = g;
      try { _pipeBody(conn, mask, pal, detail, hasFlow, 1, 0, true); }
      finally { ctx = prev; }
      st.bitmaps.set(key, cv);
    }
    ctx.drawImage(cv, px - M, py - M, cv.width / st.sc, cv.height / st.sc);
    return true;
  };
  return api;
})();

// The flags that decide what a pipe tile shows, as one number: which fluid
// flags are up, and `powered` (water flowing). Its fluid and whether it is
// flowing follow from that alone (_pipeSigFluid / _pipeSigFlow), so
// BeltPipeRows can tell from this whether a tile still looks the same.
const _PS_CRYO = 1, _PS_COOL = 2, _PS_STEAM = 4, _PS_ACID = 8, _PS_LPG = 16, _PS_FUELOIL = 32, _PS_OIL = 64,
      _PS_H2 = 128, _PS_N2 = 256, _PS_NH3 = 512, _PS_D2 = 1024, _PS_HIBETA = 2048, _PS_HE = 4096, _PS_LHE = 8192,
      _PS_T2 = 16384, _PS_HE3 = 32768, _PS_POWERED = 65536;
function _pipeLookSig(e) {
    return (e._cryoCoolActive ? _PS_CRYO : 0) | (e._coolActive ? _PS_COOL : 0) | (e._steamActive ? _PS_STEAM : 0)
         | (e._acidActive ? _PS_ACID : 0) | (e._lpgActive ? _PS_LPG : 0) | (e._fuelOilActive ? _PS_FUELOIL : 0)
         | (e._oilActive ? _PS_OIL : 0) | (e._hydrogenActive ? _PS_H2 : 0) | (e._nitrogenActive ? _PS_N2 : 0)
         | (e._ammoniaActive ? _PS_NH3 : 0) | (e._deuteriumActive ? _PS_D2 : 0) | (e._highBetaActive && e._highBetaFlow ? _PS_HIBETA : 0)
         | (e._heliumActive ? _PS_HE : 0) | (e._liquidHeActive ? _PS_LHE : 0) | (e._tritiumActive ? _PS_T2 : 0)
         | (e._he3Active ? _PS_HE3 : 0) | (e.powered ? _PS_POWERED : 0);
}
// Water flow: a pipe is powered when it joins a powered water extractor (updatePipeConnectivity).
const _pipeSigWater = (s) => !(s & _PS_OIL) && !!(s & _PS_POWERED);
function _pipeSigFlow(s) {
    return _pipeSigWater(s) || !!(s & (_PS_OIL | _PS_ACID | _PS_STEAM | _PS_COOL | _PS_CRYO | _PS_H2 | _PS_N2 | _PS_NH3
                                       | _PS_D2 | _PS_HIBETA | _PS_HE | _PS_LHE | _PS_T2 | _PS_HE3 | _PS_LPG));
}
function _pipeSigFluid(s) {
    return (s & _PS_CRYO) ? 'cryocool' : (s & _PS_COOL) ? 'cool' : (s & _PS_STEAM) ? 'steam' : (s & _PS_ACID) ? 'acid'
         : (s & _PS_LPG) ? 'lpg' : (s & _PS_FUELOIL) ? 'fueloil' : (s & _PS_OIL) ? 'oil' : (s & _PS_H2) ? 'hydrogen'
         : (s & _PS_N2) ? 'nitrogen' : (s & _PS_NH3) ? 'ammonia' : (s & _PS_D2) ? 'deuterium' : (s & _PS_HIBETA) ? 'highbeta'
         : (s & _PS_HE) ? 'helium' : (s & _PS_LHE) ? 'liquidhe' : (s & _PS_T2) ? 'tritium' : (s & _PS_HE3) ? 'helium3'
         : (_pipeSigWater(s) ? 'water' : null);
}

// The building types a pipe may draw an arm into (see the survey below).
function _pipeNbrSets() {
    if (!_PIPE_HYDRO_NBRS) _PIPE_HYDRO_NBRS = new Set([T.PIPE, T.UNDERGNDPIPE, T.WATEREXTRACTOR, T.HYDROGENERATOR, T.COALGENERATOR, T.CHEMICALPLANT, T.FUELPLANT, T.COOLINGTOWER, T.COOLINGTOWER2, T.NUCLEARREACTOR, T.ADVREACTOR, T.STEAMTURBINE, T.STEAMTURBINE2, T.ELECTROLYZER, T.ATMOSCOLLECTOR, T.HABERBOSCH, T.WASHTOWER, T.FUSIONFUELPLANT, T.LITHIUMPROCESSPLANT, T.REPROCESSOR, T.HULKINGFUSIONREACTOR, T.ADVFUSIONREACTOR, T.MHDRING, T.HELIUMWELL, T.HELIUMWELL2, T.CRYOPLANT, T.HE3SEPARATOR, T.TRITIUMBREEDER, T.GASSTORAGE, T.LEACHPLANT, T.SCMILL, T.COKEOVEN]);
    if (!_PIPE_OIL_NBRS)   _PIPE_OIL_NBRS   = new Set([T.PIPE, T.UNDERGNDPIPE, T.PUMPJACK, T.PUMPJACK2, T.OILSTORAGE, T.REFINERY, T.FUELGEN, T.GASSTATION]);
}
// Which sides of pipe tile `e` join something (bit 1 up, 2 down, 4 left,
// 8 right) for a pipe carrying `myFluid`: kept per pipe by PipeLayout, the
// survey of all four neighbours run only when that has lapsed.
const _PIPE_SIDES = [{ dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 }];
function _pipeMask(e, myFluid) {
    let mask = PipeLayout.get(e, myFluid);
    if (mask >= 0) return mask;
    mask = 0;
    for (const d of _PIPE_SIDES) if (_pipeSideJoins(e, d, myFluid)) mask |= d.dr < 0 ? 1 : d.dr > 0 ? 2 : d.dc < 0 ? 4 : 8;
    PipeLayout.put(e, myFluid, mask);
    return mask;
}
// Whether pipe `e` draws an arm out of side d (d.dc, d.dr).
function _pipeSideJoins(e, d, myFluid) {
    _pipeNbrSets();
    const HYDRO_NBRS = _PIPE_HYDRO_NBRS, OIL_NBRS = _PIPE_OIL_NBRS;
    let nb = GridManager.getEntity(e.col+d.dc, e.row+d.dr);
    // If neighbour is a wire or conveyor sitting on top of a pipe, treat
    // the underlying pipe as the real neighbour — otherwise the pipe
    // visually breaks wherever a wire/conveyor crosses over it, since
    // the crossing tile's top-level type isn't T.PIPE at all.
    if (nb && nb.type === T.WIRE     && nb._underPipe) nb = nb._underPipe;
    if (nb && nb.type === T.CONVEYOR && nb._underPipe) nb = nb._underPipe;
    // An underground pipe only exposes its two axis-aligned ends, and a
    // side with a paired tunnel partner in range refuses direct adjacency
    // entirely (even to a same-axis pipe sitting right there) — so a
    // crossing pipe sitting on top of the tunnel must not visually connect.
    if (nb && nb.type === T.UNDERGNDPIPE && !pipeStepAllowed(nb.col, nb.row, d.dc, d.dr)) return false;
    // Drag-connected pipes: two pipe tiles join only if both open toward
    // each other (pipesJoin). Blueprint ghosts aren't on the grid, so they
    // keep drawing against whatever they overlap.
    if (nb && (nb.type === T.PIPE || nb.type === T.UNDERGNDPIPE) && !e._bpPreview &&
        !(pipeOpensToward(e, d.dc, d.dr) && pipeOpensToward(nb, -d.dc, -d.dr))) return false;
    // Different, already-established fluids on adjacent pipe tiles must
    // never visually connect — otherwise two independently laid pipe
    // runs (e.g. a water line and a sulfuric acid line) look bridged
    // just because they happen to sit next to each other.
    if (nb && (nb.type === T.PIPE || nb.type === T.UNDERGNDPIPE)) {
      const nbFluid = pipeCurrentFluid(nb);
      if (myFluid && nbFluid && myFluid !== nbFluid) return false;
    }
    // Connect if neighbour is in either set (pipe connects to anything pipe-like)
    const inHydro = HYDRO_NBRS.has(nb?.type);
    const inOil   = OIL_NBRS.has(nb?.type);
    if (!nb || (!inHydro && !inOil)) return false;
    // Refinery: connect only at its stubs — CRUDE IN on the left face
    // (row floor(h/2)), FUEL OUT on the bottom face (col floor(w/2)) and,
    // once unlocked, LPG OUT on the right face's top row. Same formula for
    // old 5×4 refineries and the current 7×6 one.
    if (nb.type === T.REFINERY) {
      const refW = nb.width || 5, refH = nb.height || 4;
      const atIn  = e.col === nb.col - 1 && e.row === nb.row + Math.floor(refH / 2);
      const atOut = e.col === nb.col + Math.floor(refW / 2) && e.row === nb.row + refH;
      const lo    = refineryLpgOut(nb);
      const atLpg = refineryLpgUnlocked() && e.col === lo.c && e.row === lo.r;
      if (!atIn && !atOut && !atLpg) return false;
    }
    // Fuel generator: IN port (left face, vertically centred)
    if (nb.type === T.FUELGEN) {
      const fgH = nb.height || 5;
      const inPortRow = nb.row + Math.floor(fgH / 2);
      if (!(e.col === nb.col - 1 && e.row === inPortRow)) return false;
    }
    // Gas station: FUEL IN on its left face — the tank-level stub, or the
    // older face-centre one (GasStationPorts, same rows the gameplay
    // accepts). Stations weren't pipe neighbours at all before, so a fuel
    // line never visibly joined the FUEL IN stub.
    if (nb.type === T.GASSTATION) {
      if (!(e.col === nb.col - 1 && GasStationPorts.inputRows(nb).includes(e.row))) return false;
    }
    // Oil storage: both stubs on one face (left default, right when rotated).
    // Either stub may be IN or OUT — roles come from what's plugged in.
    if (nb.type === T.OILSTORAGE) {
      if (!OilSystem.isTankStubTile(nb, e.col, e.row)) return false;
    }
    // Pump jack: single output port (rotatable, bottom-center by default)
    // Pump jack: its single OUT stub, bottom-centre — exactly where both
    // sprites draw it (renderPumpJack / renderPumpJackMK2). Pump jacks never
    // rotate, and this used to read their rotation 0 as the TOP edge, so a
    // pipe laid to the drawn stub never showed an arm into the jack.
    if (nb.type === T.PUMPJACK || nb.type === T.PUMPJACK2) {
      const pw = nb.width || 3, ph = nb.height || 3;
      if (!(e.col === nb.col + Math.floor(pw/2) && e.row === nb.row + ph)) return false;
    }
    // Water extractor: ONLY the single rotatable output stub connects —
    // was previously any of the 4 perimeter sides, which is why a pipe
    // would visually connect no matter where around the building it was
    // routed. Press R while hovering the extractor to rotate the stub.
    if (nb.type === T.WATEREXTRACTOR) {
      const port = HydroSystem.extractorOutputPort(nb);
      if (!port || !(e.col === port.c && e.row === port.r)) return false;
    }
    // Hydro generator: any perimeter tile is valid (accepts from all sides)
    // No restriction needed — leave open
    // Nuclear reactor: ONLY its two fixed pipe stubs (cool IN, steam OUT)
    // are valid — matches NuclearSystem.getStubs() exactly, so the pipe's
    // visible end lines up with the COOL IN / STEAM OUT valve icons drawn
    // in render_oil_nuclear.js instead of connecting at an arbitrary
    // perimeter tile that the valve graphic doesn't sit next to.
    if (nb.type === T.NUCLEARREACTOR || nb.type === T.ADVREACTOR) {
      const { coolIn, steamOut } = NuclearSystem.getStubs(nb);
      if (!((e.col === coolIn.c && e.row === coolIn.r) || (e.col === steamOut.c && e.row === steamOut.r))) return false;
    }
    // Cooling towers: ONLY H₂O/COOL IN and COOL/CRYO OUT stubs.
    if (nb.type === T.COOLINGTOWER || nb.type === T.COOLINGTOWER2) {
      const { hotIn, coldOut } = CoolingTowerSystem.getStubs(nb);
      if (!((e.col === hotIn.c && e.row === hotIn.r) || (e.col === coldOut.c && e.row === coldOut.r))) return false;
    }
    // Chemical plant: ONLY its two fixed pipe stubs (water IN, acid OUT)
    // are valid — matches ChemicalSystem.getStubs() exactly. Used to
    // accept any perimeter tile, which is why a pipe laid anywhere around
    // the building would visually connect regardless of where it touched.
    if (nb.type === T.CHEMICALPLANT) {
      const stubs = ChemicalSystem.getStubs(nb).pipeStubs;
      if (!stubs.some(s => e.col === s.c && e.row === s.r)) return false;
    }
    // Coal generator: ONLY the fixed Water IN stub tile (bottom face,
    // middle column) is valid — matches CoalGeneratorConnections.stubs()
    // and updatePipeConnectivity's gameplay check exactly. Used to accept
    // any perimeter tile, which is why a pipe laid anywhere around the
    // building would visually connect regardless of where it actually touched.
    if (nb.type === T.COALGENERATOR) {
      const cgW = nb.width || 3, cgH = nb.height || 4;
      const midCol = nb.col + Math.floor(cgW / 2);
      if (!(e.col === midCol && e.row === nb.row + cgH)) return false;
    }
    // Fuel processing plant: ONLY the fixed ACID-IN pipe stub tile is
    // valid — matches FuelPlantSystem.getStubs().pipeIn exactly. Used to
    // accept any perimeter tile, which is why a pipe laid anywhere around
    // the building would visually connect regardless of where it touched.
    if (nb.type === T.FUELPLANT) {
      const { pipeIn } = FuelPlantSystem.getStubs(nb);
      if (!(e.col === pipeIn.c && e.row === pipeIn.r)) return false;
    }
    // Steam turbine: ONLY its fixed STEAM IN pipe stub tile is valid —
    // matches SteamTurbineSystem.getStubs().steamIn exactly, so the pipe
    // only visually plugs into the STEAM IN valve, not anywhere else
    // around the building's perimeter.
    if (nb.type === T.STEAMTURBINE || nb.type === T.STEAMTURBINE2) {
      const { steamIn } = SteamTurbineSystem.getStubs(nb);
      if (!(e.col === steamIn.c && e.row === steamIn.r)) return false;
    }
    // Electrolyzer: ONLY its two fixed pipe stubs (water IN, hydrogen OUT)
    // are valid — matches ElectrolyzerSystem.getStubs() exactly, so the
    // pipe's visible end lines up with the WATER IN / H2 OUT valve icons.
    if (nb.type === T.ELECTROLYZER) {
      const { waterStub, hydrogenStub } = ElectrolyzerSystem.getStubs(nb);
      if (!((e.col === waterStub.c && e.row === waterStub.r) || (e.col === hydrogenStub.c && e.row === hydrogenStub.r))) return false;
    }
    // Atmosphere Collector / Haber-Bosch Complex / Isotopic Wash Tower:
    // ONLY their fixed pipe stub tiles are valid — matches each system's
    // getStubs() exactly, same guard shape as Electrolyzer above.
    if (nb.type === T.ATMOSCOLLECTOR) {
      const { nitrogenStub } = AtmosphereCollectorSystem.getStubs(nb);
      if (!(e.col === nitrogenStub.c && e.row === nitrogenStub.r)) return false;
    }
    if (nb.type === T.HABERBOSCH) {
      const { nitrogenIn, hydrogenIn, ammoniaOut } = HaberBoschSystem.getStubs(nb);
      if (!((e.col === nitrogenIn.c && e.row === nitrogenIn.r) || (e.col === hydrogenIn.c && e.row === hydrogenIn.r) || (e.col === ammoniaOut.c && e.row === ammoniaOut.r))) return false;
    }
    if (nb.type === T.WASHTOWER) {
      const { waterIn, ammoniaIn, deuteriumOut } = IsotopicWashTowerSystem.getStubs(nb);
      if (!((e.col === waterIn.c && e.row === waterIn.r) || (e.col === ammoniaIn.c && e.row === ammoniaIn.r) || (e.col === deuteriumOut.c && e.row === deuteriumOut.r))) return false;
    }
    // Fusion Fuel Plant: ONLY its fixed DEUTERIUM IN pipe stub tile is
    // valid — its other two ports (compound in, plasma out) are conveyors,
    // not pipes — matches FusionFuelPlantSystem.getStubs().deuteriumIn.
    if (nb.type === T.FUSIONFUELPLANT) {
      const { deuteriumIn, tritiumIn, he3In } = FusionFuelPlantSystem.getStubs(nb);
      if (![deuteriumIn, tritiumIn, he3In].some(p => e.col === p.c && e.row === p.r)) return false;
    }
    // Hulking Fusion Reactor: ONLY its fixed HIGH-BETA OUT pipe stub tile
    // is valid — its other port (plasma in) is a conveyor, not a pipe —
    // matches HulkingFusionReactorSystem.getStubs().highBetaOut.
    if (nb.type === T.HULKINGFUSIONREACTOR) {
      const { highBetaOut, cryoIn, ashOut, tritiumOut } = HulkingFusionReactorSystem.getStubs(nb);
      if (![highBetaOut, cryoIn, ashOut, tritiumOut].some(p => e.col === p.c && e.row === p.r)) return false;
    }
    // Advanced Fusion Reactor: ONLY its ION OUT A/B, LHe IN, HE ASH OUT and CRYO IN stubs.
    if (nb.type === T.ADVFUSIONREACTOR) {
      const { ionOutA, ionOutB, cryoIn, ashOut, coolantIn } = AdvancedFusionReactorSystem.getStubs(nb);
      if (![ionOutA, ionOutB, cryoIn, ashOut, coolantIn].some(p => e.col === p.c && e.row === p.r)) return false;
    }
    // Helium Well: ONLY its HE OUT stub; Cryo Plant: ONLY HE IN / LHe OUT.
    if (isHeliumWell(nb)) {
      const { heliumOut } = HeliumSystem.getStubs(nb);
      if (!(e.col === heliumOut.c && e.row === heliumOut.r)) return false;
    }
    if (nb.type === T.CRYOPLANT) {
      const { heliumIn, liquidOut } = CryoPlantSystem.getStubs(nb);
      if (!((e.col === heliumIn.c && e.row === heliumIn.r) || (e.col === liquidOut.c && e.row === liquidOut.r))) return false;
    }
    if (nb.type === T.HE3SEPARATOR) {
      const { heliumIn, he3Out } = He3SeparatorSystem.getStubs(nb);
      if (!((e.col === heliumIn.c && e.row === heliumIn.r) || (e.col === he3Out.c && e.row === he3Out.r))) return false;
    }
    // Tritium Breeding Facility: ONLY its TRITIUM OUT (LITHIUM IN is a belt).
    if (nb.type === T.TRITIUMBREEDER) {
      const { tritiumOut } = TritiumBreederSystem.getStubs(nb);
      if (!(e.col === tritiumOut.c && e.row === tritiumOut.r)) return false;
    }
    if (nb.type === T.GASSTORAGE) {
      const { gasIn, gasOut } = GasStorageSystem.getStubs(nb);
      if (!((e.col === gasIn.c && e.row === gasIn.r) || (e.col === gasOut.c && e.row === gasOut.r))) return false;
    }
    // MHD Decelerator Ring: ONLY its fixed HIGH-BETA IN pipe stub tile is
    // valid — matches MHDDeceleratorRingSystem.getStubs().highBetaIn.
    if (nb.type === T.MHDRING) {
      const { highBetaIn } = MHDDeceleratorRingSystem.getStubs(nb);
      if (!(e.col === highBetaIn.c && e.row === highBetaIn.r)) return false;
    }
    // Lithium Processing Plant: ONLY its fixed WATER IN pipe stub tile is
    // valid — its other two ports (ore in, compound out) are conveyors,
    // not pipes — matches LithiumProcessPlantSystem.getStubs().waterIn.
    if (nb.type === T.LITHIUMPROCESSPLANT) {
      const { waterIn } = LithiumProcessPlantSystem.getStubs(nb);
      if (!(e.col === waterIn.c && e.row === waterIn.r)) return false;
    }
    // Reprocessing Plant: ONLY its WATER IN (spent fuel in and the two
    // outputs are belts) — ReprocessingSystem.getStubs().waterIn.
    if (nb.type === T.REPROCESSOR) {
      const { waterIn } = ReprocessingSystem.getStubs(nb);
      if (!(e.col === waterIn.c && e.row === waterIn.r)) return false;
    }
    // Leach Plant: ONLY its ACID IN (ore in and oxide out are belts);
    // Superconductor Mill: ONLY its H₂ IN and N₂ IN. Neither was a pipe
    // neighbour at all, so a line laid to the stub stopped half a tile
    // short of it with a blind cap.
    if (nb.type === T.LEACHPLANT) {
      const { acidIn } = LeachPlantSystem.getStubs(nb);
      if (!(e.col === acidIn.c && e.row === acidIn.r)) return false;
    }
    if (nb.type === T.SCMILL) {
      const { hydrogenIn, nitrogenIn } = SuperconductorMillSystem.getStubs(nb);
      if (!((e.col === hydrogenIn.c && e.row === hydrogenIn.r) || (e.col === nitrogenIn.c && e.row === nitrogenIn.r))) return false;
    }
    // Coke Oven: ONLY its GAS OUT (coal in and coke out are belts).
    if (nb.type === T.COKEOVEN) {
      const { gasOut } = CokeOvenSystem.getStubs(nb);
      if (!(e.col === gasOut.c && e.row === gasOut.r)) return false;
    }
    return true;
}

// ── Pipes filling up ─────────────────────────────────────────────
// The sims light a whole line in one tick the moment it connects, so on
// its own a new line would pop from empty to flowing. This is a purely
// visual layer over that: a pipe that starts carrying something begins
// empty and fills from the side the liquid comes in at, and the tile past
// it starts once it is full, so a front runs down the line at SPEED tiles
// a second. The droplets and full look come on behind it.
//
// Where it comes in: a full neighbour carrying the same thing; for crude,
// fuel oil and LPG the side upstream of the flow the oil sim stamps; else
// a building that puts that fluid out (SOURCES). If a line has no tile
// that can start that way (a source this list misses), after RELAX it may
// start from any building it touches, and after STALL from its middle.
// Lines already flowing when a save loads are shown full straight away.
const PipeFill = (() => {
  const SPEED = 6, RELAX = 0.6, STALL = 2.5, DRY_FORGET = 1.0;
  const st = new WeakMap();      // pipe -> { fluid, u (0..1), from (side 0-3, -1 middle, -2 not started), full, dryAt }
  const filling = new Set();
  let lastNow = 0, lastStart = 0;
  let SOURCES = null;
  const DIRECTED = new Set(['oil', 'fueloil', 'lpg']);
  function sources() {
    if (SOURCES) return SOURCES;
    const S = (...types) => new Set(types.filter(x => x !== undefined));
    const gas = T.GASSTORAGE;
    SOURCES = {
      water:     S(T.WATEREXTRACTOR, T.OILSTORAGE),
      oil:       S(T.PUMPJACK, T.PUMPJACK2, T.OILSTORAGE),
      fueloil:   S(T.REFINERY, T.OILSTORAGE),
      lpg:       S(T.REFINERY),
      acid:      S(T.CHEMICALPLANT, T.OILSTORAGE),
      steam:     S(T.NUCLEARREACTOR, T.ADVREACTOR, T.HULKINGFUSIONREACTOR),
      cool:      S(T.COOLINGTOWER, T.COOLINGTOWER2),
      cryocool:  S(T.COOLINGTOWER2),
      hydrogen:  S(T.ELECTROLYZER, T.COKEOVEN, gas),
      nitrogen:  S(T.ATMOSCOLLECTOR, gas),
      ammonia:   S(T.HABERBOSCH, gas),
      deuterium: S(T.WASHTOWER, gas),
      highbeta:  S(T.HULKINGFUSIONREACTOR, T.ADVFUSIONREACTOR),
      helium:    S(T.HELIUMWELL, T.HELIUMWELL2, T.HULKINGFUSIONREACTOR, T.ADVFUSIONREACTOR, gas),
      liquidhe:  S(T.CRYOPLANT),
      tritium:   S(T.TRITIUMBREEDER, T.HULKINGFUSIONREACTOR, gas),
      helium3:   S(T.HE3SEPARATOR, gas),
    };
    return SOURCES;
  }
  const fluidOf = (p) => _pipeSigFluid(_pipeLookSig(p));
  const fullWith = (q, fluid) => { const s = q && st.get(q); return !!(s && s.full && s.fluid === fluid); };
  // A building on the far side of side d, unwrapping stacked crossings.
  function across(p, d) {
    const nb = GridManager.getEntity(p.col + d.dc, p.row + d.dr);
    const pipe = getPipe(nb);
    return { pipe, bldg: pipe ? null : nb };
  }
  // The side p fills from, or null if it can't start yet.
  function entry(p, s, now) {
    const stalled = now - lastStart;
    if (p.type === T.UNDERGNDPIPE) {
      const axis = p._udgAxis === 'v' ? [1, 0] : [3, 2];   // [down, up] / [right, left] side indices
      for (const i of [axis[1], axis[0]]) {
        const d = _PIPE_SIDES[i];
        if (fullWith(across(p, d).pipe, s.fluid)) return i;
        const pr = udgPartner(p.col, p.row, d.dc, d.dr, p._udgAxis === 'v' ? 'v' : 'h');
        if (pr && fullWith(GridManager.getEntity(pr[0], pr[1]), s.fluid)) return i;
      }
      return stalled > STALL ? -1 : null;
    }
    const mask = _pipeMask(p, s.fluid);
    if (!mask) return -1;
    const dc = p._oilFlowDC || 0, dr = p._oilFlowDR || 0;
    if (DIRECTED.has(s.fluid) && (dc || dr)) {
      const i = _PIPE_SIDES.findIndex(d => d.dc === -dc && d.dr === -dr);
      if (mask & (1 << i)) {
        const { pipe } = across(p, _PIPE_SIDES[i]);
        if (!pipe || fullWith(pipe, s.fluid)) return i;
        return stalled > STALL ? -1 : null;
      }
    }
    let anyBldg = -1;
    for (let i = 0; i < 4; i++) {
      if (!(mask & (1 << i))) continue;
      const { pipe, bldg } = across(p, _PIPE_SIDES[i]);
      if (pipe) { if (fullWith(pipe, s.fluid)) return i; continue; }
      if (!bldg) continue;
      const src = sources()[s.fluid];
      if (src && src.has(bldg.type)) return i;
      anyBldg = i;
    }
    if (anyBldg >= 0 && stalled > RELAX) return anyBldg;
    return stalled > STALL ? -1 : null;
  }
  const loadGrace = () => typeof PowerNetwork !== 'undefined' && PowerNetwork.inLoadGrace && PowerNetwork.inLoadGrace();
  function begin(p, f, loaded, now) {
    if (!filling.size) lastStart = now;
    const s = { fluid: f, u: loaded ? 1 : 0, from: -2, full: loaded, dryAt: 0 };
    st.set(p, s);
    if (!loaded) filling.add(p);
    return s;
  }
  return {
    // Once a frame, before pipes draw.
    step() {
      const now = performance.now() / 1000;
      const dt = Math.min(0.1, Math.max(0, now - (lastNow || now)));
      lastNow = now;
      // New or changed lines. Every frame: a logic tick is spread over
      // several frames (game_loop.js), and the flags are cleared and set
      // again partway through one, so a once-a-tick look could land between.
      if (typeof allPipes === 'function') {
        const loaded = loadGrace();
        for (const p of allPipes()) {
          const f = fluidOf(p);
          let s = st.get(p);
          if (!f) {
            // A flag can drop for a tick while a line re-settles; only a pipe
            // dry for a while forgets it was full.
            if (s) { if (!s.dryAt) s.dryAt = now; else if (now - s.dryAt > DRY_FORGET) { st.delete(p); filling.delete(p); } }
            continue;
          }
          if (s && s.fluid === f) { s.dryAt = 0; continue; }
          begin(p, f, loaded, now);
        }
      }
      if (!filling.size) return;
      let started = false;
      for (const p of filling) {
        const s = st.get(p);
        if (!s || s.full) { filling.delete(p); continue; }
        if (s.from === -2) {
          const from = entry(p, s, now);
          if (from === null) continue;
          s.from = from;
          started = true;
        }
        s.u += dt * SPEED;
        if (s.u >= 1) { s.u = 1; s.full = true; filling.delete(p); started = true; }
      }
      if (started) lastStart = now;
    },
    // The fill state of pipe `e`, now carrying `fluid`, while it is still
    // filling; null once it is full. A pipe drawn carrying something before
    // the per-tick scan has met it starts empty here, so it never shows full
    // for a frame first. Blueprint ghosts aren't tracked.
    partial(e, fluid) {
      if (e._bpPreview) return null;
      let s = st.get(e);
      if (!s || s.fluid !== fluid) s = begin(e, fluid, loadGrace(), performance.now() / 1000);
      else s.dryAt = 0;
      return s.full ? null : s;
    },
    // Whether pipe `p` is full of `fluid` as drawn — the front has got
    // through it. The sims ask this of the pipe at a building's IN stub
    // (pipeArrived) so nothing is taken in before the liquid is seen to
    // reach it. A pipe not met yet counts only in the post-load settle,
    // when lines already flowing are shown full.
    arrived(p, fluid) {
      const s = st.get(p);
      if (s && s.fluid === fluid) return s.full;
      return loadGrace();
    },
  };
})();

// The liquid inside a filling pipe tile, over its empty body. Runs in from
// side `from` to the middle over the first half of the fill and out to the
// other sides over the second; an elbow follows its curve. A tile that
// started from its middle (from -1) fills outward to every side at once.
// Tile-local coordinates (0,0 is the top-left corner).
function _pipeFillOverlay(conn, fill, pal, a0, t) {
    const c = TILE / 2, R = PIPE_ELBOW_R, PIPE_R = 5.5;
    const edge = (d) => [c + d.dc * c, c + d.dr * c];
    const sd = fill.from >= 0 ? _PIPE_SIDES[fill.from] : null;
    const entryD = sd ? conn.find(x => x.dc === sd.dc && x.dr === sd.dr) || null : null;
    const runs = [];   // [polyline, u0, u1]
    if (entryD && conn.length === 2) {
      const exitD = conn[0] === entryD ? conn[1] : conn[0];
      if (entryD.dc === -exitD.dc && entryD.dr === -exitD.dr) {
        runs.push([[edge(entryD), edge(exitD)], 0, 1]);
      } else {
        // Elbow: in to the tangent point, round the quarter arc, out.
        const ax = c + R * (entryD.dc + exitD.dc), ay = c + R * (entryD.dr + exitD.dr);
        const a1 = Math.atan2(-exitD.dr, -exitD.dc), a2 = Math.atan2(-entryD.dr, -entryD.dc);
        let da = a2 - a1; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
        const pts = [edge(entryD)];
        for (let k = 0; k <= 6; k++) { const a = a1 + da * (k / 6); pts.push([ax + R * Math.cos(a), ay + R * Math.sin(a)]); }
        // The arc above runs from the entry tangent point to the exit one.
        pts.push(edge(exitD));
        runs.push([pts, 0, 1]);
      }
    } else if (entryD) {
      runs.push([[edge(entryD), [c, c]], 0, 0.5]);
      for (const d of conn) if (d !== entryD) runs.push([[[c, c], edge(d)], 0.5, 1]);
    } else {
      for (const d of conn) runs.push([[[c, c], edge(d)], 0, 1]);
    }
    const tips = [];
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    for (const [pts, u0, u1] of runs) {
      const f = Math.max(0, Math.min(1, (fill.u - u0) / (u1 - u0)));
      if (f <= 0) continue;
      let total = 0;
      for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k][0] - pts[k-1][0], pts[k][1] - pts[k-1][1]);
      let left = total * f;
      const path = new Path2D();
      path.moveTo(pts[0][0], pts[0][1]);
      let tip = pts[0];
      for (let k = 1; k < pts.length && left > 0; k++) {
        const [x0, y0] = pts[k-1], [x1, y1] = pts[k];
        const seg = Math.hypot(x1 - x0, y1 - y0);
        const g = seg > 0 ? Math.min(1, left / seg) : 1;
        tip = [x0 + (x1 - x0) * g, y0 + (y1 - y0) * g];
        path.lineTo(tip[0], tip[1]);
        left -= seg;
      }
      ctx.strokeStyle = pal.body; ctx.lineWidth = PIPE_R * 2 - 1; ctx.stroke(path);
      ctx.globalAlpha = a0 * 0.6; ctx.strokeStyle = pal.core; ctx.lineWidth = 2; ctx.stroke(path);
      ctx.globalAlpha = a0;
      if (f < 1) tips.push(tip);
    }
    // The leading edge: a rounded slug of liquid with a bright meniscus.
    for (const [x, y] of tips) {
      ctx.beginPath(); ctx.arc(x, y, PIPE_R - 0.5, 0, Math.PI * 2);
      ctx.fillStyle = pal.body; ctx.fill();
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.globalAlpha = a0 * (0.75 + 0.2 * Math.sin(t * 12));
      ctx.fillStyle = pal.core; ctx.fill();
      ctx.globalAlpha = a0;
    }
    ctx.lineJoin = 'miter';
}

function renderPipe(e, px, py, t, _overPass = false) {
    if (e._underConveyor && !_overPass) {
      e._underConveyor.col = e.col; e._underConveyor.row = e.row;
      renderConveyor(e._underConveyor, px, py, t);
      // A real crossing in the main frame waits for the cargo pass; anything
      // else (a blueprint ghost, an offscreen render) draws its pipe now.
      if (_pipeOverBelt.armed && !e._bpPreview && GridManager.getEntity(e.col, e.row) === e) {
        _pipeOverBelt.q.push(e, px, py);
        return;
      }
    }
    if (e._underConveyor) _pipeGantry(e._underConveyor, px, py, t);
    const cx = px+TILE/2, cy = py+TILE/2;
    const dirs = [
      {dc:0,dr:-1,sx:cx,sy:py,      ex:cx,ey:cy},
      {dc:0,dr: 1,sx:cx,sy:py+TILE, ex:cx,ey:cy},
      {dc:-1,dr:0,sx:px,      sy:cy,ex:cx,ey:cy},
      {dc: 1,dr:0,sx:px+TILE, sy:cy,ex:cx,ey:cy},
    ];
    _pipeNbrSets();
    const HYDRO_NBRS  = _PIPE_HYDRO_NBRS;
    const OIL_NBRS    = _PIPE_OIL_NBRS;

    const oilActive     = !!e._oilActive;
    const fuelOilActive = !!e._fuelOilActive;
    const acidActive    = !!e._acidActive;
    const steamActive   = !!e._steamActive;
    const coolActive    = !!e._coolActive;
    const cryoCoolActive = !!e._cryoCoolActive;
    const hydrogenActive = !!e._hydrogenActive;
    const nitrogenActive = !!e._nitrogenActive;
    const ammoniaActive = !!e._ammoniaActive;
    const deuteriumActive = !!e._deuteriumActive;
    const highBetaActive = !!e._highBetaActive && !!e._highBetaFlow;   // ions only once the reactor streams them
    const heliumActive   = !!e._heliumActive;
    const liquidHeActive = !!e._liquidHeActive;
    const tritiumActive  = !!e._tritiumActive;
    const he3Active      = !!e._he3Active;
    const lpgActive      = !!e._lpgActive;
    // Note: flags cleared at start of each game tick, not here

    // Water flow, whether anything flows, and the fluid it shows: one reading
    // of the flags, shared with BeltPipeRows (see _pipeLookSig).
    const _look = _pipeLookSig(e);
    const hasWaterFlow = _pipeSigWater(_look);
    const hasFlow = _pipeSigFlow(_look);

    const conn = [];   // connected sides, collected first so the body is drawn as one shape
    let mask = 0;      // the same sides as a bitmask — keys the cached tile geometry
    const PIPE_R = 5.5;
    const myFluid = _pipeSigFluid(_look);

    // Determine neighbour set — oil pipes connect to oil entities too
    const NBRS = oilActive ? OIL_NBRS : HYDRO_NBRS;

    // Which sides connect is a long survey of the four neighbours and only
    // changes when something is built or a line changes what it carries, so
    // it is kept for a few ticks (PipeLayout) rather than redone every frame.
    mask = _pipeMask(e, myFluid);
    for (let i = 0; i < 4; i++) if (mask & (1 << i)) conn.push(dirs[i]);

    // ── Body ────────────────────────────────────────────────────────
    // Drawn once from the full set of connected sides instead of a separate
    // stroke per side with a hub dot stamped on the centre, which read as a
    // chain of beads. A straight run is now one continuous tube, a two-sided
    // tile bends with a rounded elbow, tile joints get a flange, T/cross tiles
    // get a collar and open ends get a blind-flange cap.
    const pal    = PIPE_PALETTE[myFluid || 'dry'];
    const detail = Camera.zoom > 0.5;   // LOD: shadow, shading and flanges are sub-pixel when zoomed out
    const n      = conn.length;
    const a0     = ctx.globalAlpha;     // pipes are drawn faded under conveyors — scale alpha, don't overwrite it
    // Still filling (PipeFill): an empty pipe with the liquid running in over it.
    const fill    = myFluid ? PipeFill.partial(e, myFluid) : null;
    const bodyPal = fill ? PIPE_PALETTE.dry : pal;
    const bodyKey = fill ? 'dry' : (myFluid || 'dry');
    const bodyFlow = fill ? false : hasFlow;
    // Raised over a belt, the pipe also throws its shadow down onto the belt;
    // those few tiles draw live rather than add a bitmap per crossing.
    if (!e._underConveyor && PipeStatic.blit(PipeStatic.key(mask, bodyKey, bodyFlow, detail), px, py, conn, mask, bodyPal, detail, bodyFlow)) {
      if (n >= 3 && bodyFlow) _pipeJunctionGlow(pal, a0, t, cx, cy);
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
    } else {
      ctx.translate(px, py);   // cached geometry is tile-local
      if (e._underConveyor && n > 0) {
        // raised over a belt: its shadow falls on the belt below, well offset
        ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
        ctx.save(); ctx.translate(4, 6.5);
        ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = PIPE_R * 2 + 1;
        ctx.stroke(_pipePath(conn, mask, 1, 0));
        ctx.restore();
      }
      _pipeBody(conn, mask, bodyPal, detail, bodyFlow, a0, t, false);
      ctx.translate(-px, -py);
    }
    if (fill && n > 0) {
      ctx.translate(px, py);
      _pipeFillOverlay(conn, fill, pal, a0, t);
      ctx.translate(-px, -py);
    }

    // Flow droplets — LOD: skipped when zoomed out (same threshold used for
    // glow halos in render_grid_electric.js). This is the most expensive part
    // of pipe rendering — up to 3 particles per connected side, each up to 2
    // arc()+fill() calls — and pipes are often the most numerous entity in an
    // industrial city. The fluid core line above keeps the colour readable.
    if (!fill && Camera.zoom > 0.5) conn.forEach(d => {
      const px1 = d.sx, py1 = d.sy, px2 = d.ex, py2 = d.ey;
      if (oilActive) {
        // Oil — smooth amber stream, flow direction from BFS-stored _oilFlowDC/_oilFlowDR
        const segDX = px2 - px1, segDY = py2 - py1;
        const segLen = Math.hypot(segDX, segDY);
        if (segLen < 1) return;
        const tileSeed = (e.col * 7 + e.row * 13) / 20;
        const SPEED = 0.4;
        const numDrops = 2;
        // Determine if this segment's direction matches oil flow direction
        // segDX/segDY points from edge→center; flow direction is _oilFlowDC/_oilFlowDR
        // If they align, phase runs 0→1 (edge to center). If opposite, reverse.
        const flowDC = e._oilFlowDC || 0;
        const flowDR = e._oilFlowDR || 0;
        const segAligned = (segDX * flowDC + segDY * flowDR) > 0;
        for (let i = 0; i < numDrops; i++) {
          let phase = ((t * SPEED + tileSeed + i / numDrops) % 1);
          if (!segAligned) phase = 1 - phase; // reverse for segments pointing opposite to flow
          const fx = px1 + segDX * phase;
          const fy = py1 + segDY * phase;
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = '#ffaa20';
          ctx.beginPath(); ctx.arc(fx, fy, 2.5, 0, Math.PI*2); ctx.fill();
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = '#ff6000';
          ctx.beginPath(); ctx.arc(fx, fy, 4.5, 0, Math.PI*2); ctx.fill();
        }
        ctx.globalAlpha = a0;
      } else if (fuelOilActive) {
        // Fuel oil — lighter yellow-green droplets, distinct from amber crude
        const segDX = px2 - px1, segDY = py2 - py1;
        const segLen = Math.hypot(segDX, segDY);
        if (segLen > 0) {
          const tileSeed = (e.col * 11 + e.row * 17) / 20;
          const flowDC = e._oilFlowDC || 0, flowDR = e._oilFlowDR || 0;
          const segAligned = (segDX * flowDC + segDY * flowDR) > 0;
          for (let i = 0; i < 2; i++) {
            let phase = ((t * 0.4 + tileSeed + i / 2) % 1);
            if (!segAligned) phase = 1 - phase;
            const fx = px1 + segDX * phase;
            const fy = py1 + segDY * phase;
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = '#e8d040';
            ctx.beginPath(); ctx.arc(fx, fy, 2.5, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 0.2;
            ctx.fillStyle = '#a0c020';
            ctx.beginPath(); ctx.arc(fx, fy, 4.5, 0, Math.PI*2); ctx.fill();
          }
          ctx.globalAlpha = a0;
        }
      } else if (acidActive) {
        // Sulfuric acid — pale yellow-white droplets
        const segDX = px2 - px1, segDY = py2 - py1;
        const segLen = Math.hypot(segDX, segDY);
        if (segLen > 0) {
          const tileSeed = (e.col * 9 + e.row * 19) / 20;
          for (let i = 0; i < 3; i++) {
            const phase = ((t * 0.45 + tileSeed + i / 3) % 1);
            const fx = px1 + segDX * phase;
            const fy = py1 + segDY * phase;
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = '#f0f0a0';
            ctx.beginPath(); ctx.arc(fx, fy, 2.2, 0, Math.PI*2); ctx.fill();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = '#e0e060';
            ctx.beginPath(); ctx.arc(fx, fy, 4, 0, Math.PI*2); ctx.fill();
          }
          ctx.globalAlpha = a0;
        }
      } else if (steamActive) {
        // Steam — white wisps
        const segDX = px2-px1, segDY = py2-py1;
        if (Math.hypot(segDX,segDY) > 0) {
          const seed = (e.col*11+e.row*17)/23;
          for (let i=0; i<3; i++) {
            const ph = ((t*0.5+seed+i/3)%1);
            const fx = px1+segDX*ph, fy = py1+segDY*ph;
            ctx.globalAlpha = 0.7*(1-ph*0.5);
            ctx.fillStyle = '#d0d8ff';
            ctx.beginPath(); ctx.ellipse(fx,fy,2.5,1.8,0,0,Math.PI*2); ctx.fill();
          }
          ctx.globalAlpha = a0;
        }
      } else if (coolActive) {
        // Cooled water — blue droplets
        const segDX = px2-px1, segDY = py2-py1;
        if (Math.hypot(segDX,segDY) > 0) {
          const seed = (e.col*13+e.row*19)/29;
          for (let i=0; i<3; i++) {
            const ph = ((t*0.4+seed+i/3)%1);
            const fx = px1+segDX*ph, fy = py1+segDY*ph;
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = '#40a0f0';
            ctx.beginPath(); ctx.arc(fx,fy,2.2,0,Math.PI*2); ctx.fill();
          }
          ctx.globalAlpha = a0;
        }
      } else if (cryoCoolActive) {
        // Cryogenic Coolant — white droplets with a frosty halo
        const segDX = px2-px1, segDY = py2-py1;
        if (Math.hypot(segDX,segDY) > 0) {
          const seed = (e.col*13+e.row*19)/29;
          for (let i=0; i<3; i++) {
            const ph = ((t*0.45+seed+i/3)%1);
            const fx = px1+segDX*ph, fy = py1+segDY*ph;
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(fx,fy,2.2,0,Math.PI*2); ctx.fill();
            ctx.globalAlpha = 0.28;
            ctx.fillStyle = '#e8f6ff';
            ctx.beginPath(); ctx.arc(fx,fy,3.8,0,Math.PI*2); ctx.fill();
          }
          ctx.globalAlpha = a0;
        }
      } else if (hydrogenActive) {
        // Hydrogen gas — small rising cyan bubbles
        const segDX = px2-px1, segDY = py2-py1;
        if (Math.hypot(segDX,segDY) > 0) {
          const seed = (e.col*15+e.row*23)/31;
          for (let i=0; i<3; i++) {
            const ph = ((t*0.6+seed+i/3)%1);
            const fx = px1+segDX*ph, fy = py1+segDY*ph;
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = '#80e0ff';
            ctx.beginPath(); ctx.arc(fx,fy,1.8,0,Math.PI*2); ctx.fill();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = '#40c0ff';
            ctx.beginPath(); ctx.arc(fx,fy,3.2,0,Math.PI*2); ctx.fill();
          }
          ctx.globalAlpha = a0;
        }
      } else if (nitrogenActive) {
        // Nitrogen gas — small rising mint-green bubbles
        const segDX = px2-px1, segDY = py2-py1;
        if (Math.hypot(segDX,segDY) > 0) {
          const seed = (e.col*17+e.row*29)/37;
          for (let i=0; i<3; i++) {
            const ph = ((t*0.6+seed+i/3)%1);
            const fx = px1+segDX*ph, fy = py1+segDY*ph;
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = '#a0ffc8';
            ctx.beginPath(); ctx.arc(fx,fy,1.8,0,Math.PI*2); ctx.fill();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = '#30c880';
            ctx.beginPath(); ctx.arc(fx,fy,3.2,0,Math.PI*2); ctx.fill();
          }
          ctx.globalAlpha = a0;
        }
      } else if (ammoniaActive) {
        // Ammonia gas — small rising dark-green bubbles
        const segDX = px2-px1, segDY = py2-py1;
        if (Math.hypot(segDX,segDY) > 0) {
          const seed = (e.col*19+e.row*31)/41;
          for (let i=0; i<3; i++) {
            const ph = ((t*0.6+seed+i/3)%1);
            const fx = px1+segDX*ph, fy = py1+segDY*ph;
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = '#80ffa0';
            ctx.beginPath(); ctx.arc(fx,fy,1.8,0,Math.PI*2); ctx.fill();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = '#30a050';
            ctx.beginPath(); ctx.arc(fx,fy,3.2,0,Math.PI*2); ctx.fill();
          }
          ctx.globalAlpha = a0;
        }
      } else if (deuteriumActive) {
        // Deuterium gas — small rising rose-pink bubbles
        const segDX = px2-px1, segDY = py2-py1;
        if (Math.hypot(segDX,segDY) > 0) {
          const seed = (e.col*23+e.row*37)/43;
          for (let i=0; i<3; i++) {
            const ph = ((t*0.6+seed+i/3)%1);
            const fx = px1+segDX*ph, fy = py1+segDY*ph;
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = '#ffb8dc';
            ctx.beginPath(); ctx.arc(fx,fy,1.8,0,Math.PI*2); ctx.fill();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = '#ff6eb4';
            ctx.beginPath(); ctx.arc(fx,fy,3.2,0,Math.PI*2); ctx.fill();
          }
          ctx.globalAlpha = a0;
        }
      } else if (highBetaActive) {
        // D-He3 ion stream — bright cool-blue streaking particles
        const segDX = px2-px1, segDY = py2-py1;
        if (Math.hypot(segDX,segDY) > 0) {
          const seed = (e.col*29+e.row*41)/47;
          for (let i=0; i<3; i++) {
            const ph = ((t*0.9+seed+i/3)%1);
            const fx = px1+segDX*ph, fy = py1+segDY*ph;
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = '#c0f0ff';
            ctx.beginPath(); ctx.arc(fx,fy,1.8,0,Math.PI*2); ctx.fill();
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = '#4090ff';
            ctx.beginPath(); ctx.arc(fx,fy,3.6,0,Math.PI*2); ctx.fill();
          }
          ctx.globalAlpha = a0;
        }
      } else if (lpgActive) {
        // LPG — small coral gas bubbles, following the flow direction
        const segDX = px2-px1, segDY = py2-py1;
        if (Math.hypot(segDX,segDY) > 0) {
          const seed = (e.col*31+e.row*43)/53;
          const segAligned = (segDX * (e._oilFlowDC || 0) + segDY * (e._oilFlowDR || 0)) > 0;
          for (let i=0; i<3; i++) {
            let ph = ((t*0.55+seed+i/3)%1);
            if (!segAligned) ph = 1 - ph;
            const fx = px1+segDX*ph, fy = py1+segDY*ph;
            ctx.globalAlpha = 0.85;
            ctx.fillStyle = '#ffa088';
            ctx.beginPath(); ctx.arc(fx,fy,1.8,0,Math.PI*2); ctx.fill();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = '#ff6040';
            ctx.beginPath(); ctx.arc(fx,fy,3.2,0,Math.PI*2); ctx.fill();
          }
          ctx.globalAlpha = a0;
        }
      } else if (hasWaterFlow) {
        // Water — teal droplets
        const segLen = Math.hypot(px2-px1, py2-py1);
        const numDrops = Math.max(2, Math.floor(segLen / 6));
        for (let i = 0; i < numDrops; i++) {
          const phase = ((t * 3.5 + e.col * 0.4 + e.row * 0.6 + i / numDrops) % 1);
          const fx = px1 + (px2-px1)*phase;
          const fy = py1 + (py2-py1)*phase;
          const alpha = Math.sin(phase * Math.PI);
          ctx.globalAlpha = alpha * 0.9;
          ctx.fillStyle = '#80ffee';
          ctx.beginPath(); ctx.arc(fx, fy, 2.2, 0, Math.PI*2); ctx.fill();
          ctx.globalAlpha = alpha * 0.3;
          ctx.fillStyle = '#20d4c8';
          ctx.beginPath(); ctx.arc(fx, fy, 4, 0, Math.PI*2); ctx.fill();
          ctx.globalAlpha = a0;
        }
      }
    }); // end flow-droplet LOD gate (Camera.zoom > 0.5)

    // Pipe network hover highlight — pulse white over connected segments
    if (e._pipeHighlight) {
      ctx.save();
      ctx.globalAlpha = 0.22 + 0.08 * Math.sin(t * 4);
      ctx.strokeStyle = '#80e8ff';
      ctx.lineWidth   = PIPE_R * 2 + 2;
      ctx.lineCap     = 'round';
      dirs.forEach(d => {
        let nb = GridManager.getEntity(e.col + d.dc, e.row + d.dr);
        if (nb && nb.type === T.WIRE     && nb._underPipe) nb = nb._underPipe;
        if (nb && nb.type === T.CONVEYOR && nb._underPipe) nb = nb._underPipe;
        if (!nb || (!HYDRO_NBRS.has(nb.type) && !OIL_NBRS.has(nb.type))) return;
        if (nb.type === T.UNDERGNDPIPE && !pipeStepAllowed(nb.col, nb.row, d.dc, d.dr)) return;
        if ((nb.type === T.PIPE || nb.type === T.UNDERGNDPIPE) &&
            !(pipeOpensToward(e, d.dc, d.dr) && pipeOpensToward(nb, -d.dc, -d.dr))) return;
        if (nb.type === T.PIPE || nb.type === T.UNDERGNDPIPE) {
          const myFluid = pipeCurrentFluid(e), nbFluid = pipeCurrentFluid(nb);
          if (myFluid && nbFluid && myFluid !== nbFluid) return;
        }
        ctx.beginPath(); ctx.moveTo(d.sx, d.sy); ctx.lineTo(d.ex, d.ey); ctx.stroke();
      });
      ctx.restore();
    }
  }

// Underground belt end: a recessed tile with a tunnel mouth. The open side
// (no partner that way) gets a short run of surface belt feeding the mouth;
// the paired side shows the tunnel carrying on under the ground.
// ── Tunnel mouths (underground belts and pipes) ─────────────────────
// Both kinds share the ground work: a concrete pad the mouth is set in, and
// on the side that is paired with a partner further along, a strip of packed
// earth over the buried run with a faint dashed trace of what it carries, so
// a tunnel reads as "the line goes on under here" rather than a dead end.
function _udgPad(px, py, S, tint) {
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.roundRect(px + 2.5, py + 3.5, TILE - 3, TILE - 3, 2.5 * S); ctx.fill();
    const g = ctx.createLinearGradient(px, py, px + TILE, py + TILE);
    g.addColorStop(0, '#8a8e88'); g.addColorStop(1, '#5a5e5a');
    ctx.fillStyle = g; ctx.strokeStyle = '#262a28'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3, 2.5 * S); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(px + 3, py + TILE - 4); ctx.lineTo(px + 3, py + 3); ctx.lineTo(px + TILE - 4, py + 3); ctx.stroke();
    // corner anchor bolts
    ctx.fillStyle = '#3a3e3a';
    for (const [bx, by] of [[0.18, 0.18], [0.82, 0.18], [0.18, 0.82], [0.82, 0.82]]) {
      ctx.beginPath(); ctx.arc(px + TILE * bx, py + TILE * by, 0.55 * S, 0, Math.PI * 2); ctx.fill();
    }
    if (tint) { ctx.fillStyle = tint; ctx.beginPath(); ctx.roundRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3, 2.5 * S); ctx.fill(); }
}
// Packed earth from the centre out through side (dc, dr), half-width hw,
// with the buried line traced along it in `trace` (null: no trace).
function _udgEarth(px, py, S, dc, dr, hw, trace, t, live) {
    const cx = px + TILE / 2, cy = py + TILE / 2;
    const x0 = dc < 0 ? px + 1.5 : dc > 0 ? cx : cx - hw, x1 = dc < 0 ? cx : dc > 0 ? px + TILE - 1.5 : cx + hw;
    const y0 = dr < 0 ? py + 1.5 : dr > 0 ? cy : cy - hw, y1 = dr < 0 ? cy : dr > 0 ? py + TILE - 1.5 : cy + hw;
    ctx.fillStyle = '#4a3a28'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = 'rgba(120,96,64,0.55)';
    for (let k = 0; k < 7; k++) {
      const u = ((k * 37) % 11) / 11, w = ((k * 53) % 7) / 7;
      ctx.fillRect(x0 + (x1 - x0) * u, y0 + (y1 - y0) * w, 1, 1);
    }
    ctx.strokeStyle = 'rgba(30,22,14,0.6)'; ctx.lineWidth = 0.8; ctx.strokeRect(x0 + 0.4, y0 + 0.4, x1 - x0 - 0.8, y1 - y0 - 0.8);
    if (trace) {
      ctx.strokeStyle = trace; ctx.lineWidth = 1.4;
      ctx.setLineDash([2 * S, 1.6 * S]); ctx.lineDashOffset = live ? -(t || 0) * 6 * S * (dc + dr) : 0;
      ctx.beginPath();
      if (dc !== 0) { ctx.moveTo(x0, cy); ctx.lineTo(x1, cy); } else { ctx.moveTo(cx, y0); ctx.lineTo(cx, y1); }
      ctx.stroke(); ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
}
// A utility marker post at the edge where a buried run leaves the tile.
function _udgMarker(px, py, S, dc, dr, cap) {
    const cx = px + TILE / 2, cy = py + TILE / 2;
    const mx = cx + dc * TILE * 0.36 + (dr !== 0 ? TILE * 0.30 : 0);
    const my = cy + dr * TILE * 0.36 + (dc !== 0 ? TILE * 0.30 : 0);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(mx + 0.8, my + 1.2, 1.3 * S, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d8d4c8'; ctx.beginPath(); ctx.arc(mx, my, 1.3 * S, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = cap; ctx.beginPath(); ctx.arc(mx, my, 0.75 * S, 0, Math.PI * 2); ctx.fill();
}

function renderUndergndBelt(e, px, py, t) {
    // A belt tunnel portal: the surface belt runs in, darkens as it ramps
    // down under a striped concrete headwall, and on the paired side packed
    // earth carries a dashed amber trace over the buried run.
    const S = TILE / 16;
    const axis = (e._udgAxis === 'v') ? 'v' : 'h';
    const live = !!e._flowRate;
    const cx = px + TILE / 2, cy = py + TILE / 2;
    const sides = axis === 'h' ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]];
    const paired = sides.map(([dc, dr]) => !!(typeof udgBeltPartner === 'function' && e.col !== undefined
                                              && udgBeltPartner(e.col, e.row, dc, dr, axis)));
    const amber = live ? '#e0a040' : '#8a6a40';

    _udgPad(px, py, S);

    const bw = 4.4 * S;   // half-width of the belt across the axis (the surface belt's)
    // The headwall stands just on the buried side of the centre; with no
    // partner either way it stands at the centre.
    const bi = paired.indexOf(true);
    const [hdc, hdr] = bi >= 0 ? sides[bi] : [0, 0];
    const hx = cx + hdc * 2 * S, hy = cy + hdr * 2 * S;

    sides.forEach(([dc, dr], i) => {
      if (paired[i]) { _udgEarth(px, py, S, dc, dr, bw * 0.8, live ? 'rgba(224,160,64,0.75)' : 'rgba(150,110,60,0.5)', t, live); return; }
      // Surface belt from the edge to the headwall: frame, belt, moving slats,
      // shading toward black where it dips under the wall.
      const ex = dc !== 0 ? (dc < 0 ? px + 1.5 : px + TILE - 1.5) : cx, ey = dr !== 0 ? (dr < 0 ? py + 1.5 : py + TILE - 1.5) : cy;
      const x0 = dc !== 0 ? Math.min(ex, hx) : cx - bw, x1 = dc !== 0 ? Math.max(ex, hx) : cx + bw;
      const y0 = dr !== 0 ? Math.min(ey, hy) : cy - bw, y1 = dr !== 0 ? Math.max(ey, hy) : cy + bw;
      ctx.fillStyle = '#4a4e52'; ctx.fillRect(x0 - (dr !== 0 ? 1.2 : 0), y0 - (dc !== 0 ? 1.2 : 0), x1 - x0 + (dr !== 0 ? 2.4 : 0), y1 - y0 + (dc !== 0 ? 2.4 : 0));
      ctx.fillStyle = '#1c1e20'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
      const phase = live ? ((t || 0) * 8 * S) % (3 * S) : 0;
      ctx.strokeStyle = live ? 'rgba(214,156,72,0.75)' : 'rgba(120,100,70,0.55)'; ctx.lineWidth = S * 0.45;
      for (let k = -3 * S + phase; k < TILE; k += 3 * S) {
        ctx.beginPath();
        if (dc !== 0) { const lx = ex - dc * k; ctx.moveTo(lx, y0 + 0.8); ctx.lineTo(lx, y1 - 0.8); }
        else          { const ly = ey - dr * k; ctx.moveTo(x0 + 0.8, ly); ctx.lineTo(x1 - 0.8, ly); }
        ctx.stroke();
      }
      const sg = dc !== 0 ? ctx.createLinearGradient(ex, 0, hx, 0) : ctx.createLinearGradient(0, ey, 0, hy);
      sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.85)');
      ctx.fillStyle = sg; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
      ctx.strokeStyle = 'rgba(200,205,210,0.35)'; ctx.lineWidth = 0.7;
      ctx.beginPath();
      if (dc !== 0) { ctx.moveTo(x0, y0 - 0.6); ctx.lineTo(x1, y0 - 0.6); } else { ctx.moveTo(x0 - 0.6, y0); ctx.lineTo(x0 - 0.6, y1); }
      ctx.stroke();
    });

    // Headwall: a concrete beam across the belt with hazard striping on its
    // face and a dark mouth where the belt goes under.
    const hwL = bw + 2.5 * S, hwT = 2.2 * S;   // half-length across the axis, thickness along it
    const rx = axis === 'h' ? hx - hwT / 2 : hx - hwL, ry = axis === 'h' ? hy - hwL : hy - hwT / 2;
    const rw = axis === 'h' ? hwT : hwL * 2, rh = axis === 'h' ? hwL * 2 : hwT;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(rx + 1, ry + 1.5, rw, rh);
    ctx.fillStyle = '#9a9e98'; ctx.strokeStyle = '#2a2e2a'; ctx.lineWidth = 0.9;
    ctx.fillRect(rx, ry, rw, rh); ctx.strokeRect(rx, ry, rw, rh);
    ctx.save(); ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
    ctx.fillStyle = '#d8a820';
    for (let k = -TILE; k < TILE; k += 2.2 * S) {
      ctx.beginPath();
      if (axis === 'h') { ctx.moveTo(rx, ry + k); ctx.lineTo(rx + rw, ry + k + rw); ctx.lineTo(rx + rw, ry + k + rw + 1.1 * S); ctx.lineTo(rx, ry + k + 1.1 * S); }
      else              { ctx.moveTo(rx + k, ry); ctx.lineTo(rx + k + rh, ry + rh); ctx.lineTo(rx + k + rh + 1.1 * S, ry + rh); ctx.lineTo(rx + k + 1.1 * S, ry); }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // the mouth itself, trimmed in belt amber
    ctx.fillStyle = '#050302'; ctx.strokeStyle = amber; ctx.lineWidth = 1;
    if (axis === 'h') { ctx.fillRect(hx - hwT * 0.3, hy - bw, hwT * 0.6, bw * 2); ctx.strokeRect(hx - hwT * 0.3, hy - bw, hwT * 0.6, bw * 2); }
    else              { ctx.fillRect(hx - bw, hy - hwT * 0.3, bw * 2, hwT * 0.6); ctx.strokeRect(hx - bw, hy - hwT * 0.3, bw * 2, hwT * 0.6); }
    if (bi >= 0) _udgMarker(px, py, S, hdc, hdr, amber);

    if (e._conveyorHighlight) {
      ctx.strokeStyle = 'rgba(255,200,90,0.8)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(px + 1.5, py + 1.5, TILE - 3, TILE - 3);
    }
}

// ── Belt and pipe rows at the far zoom ───────────────────────────────
// Below CONVEYOR_CLEAT_MIN_ZOOM a belt or pipe tile draws as one baked bitmap
// (ConveyorStatic / PipeStatic) plus, on some tiles, a small moving part, and
// over a yard that was well over a thousand drawImage calls a frame, each
// with its own bookkeeping. The entity pass draws row by row, left to right;
// between two things it draws that are not plain belt or pipe tiles, a row's
// plain tiles are drawn one after another with nothing else in between. So
// each such run is drawn once into a bitmap (pieces of one atlas), on the
// frame's own device pixels, and goes down as one drawImage at the point the
// first of its tiles would have. Everything is painted in the order it always
// was, so every shadow and overhang lands on or under a belt exactly as
// before. The moving parts (a turntable or end drum, a splitter's housing, a
// flowing junction's glow) are drawn live straight after their run.
//
// The runs are recorded while drawing live, on the first frame of a view that
// has held still (same transform, same tile range) for settleMs, and kept
// until the view moves or anything is built, removed or re-linked. Each frame
// every batched tile's look (the sides it joins; a pipe's fluid and flow) is
// worked out the way its renderer would, and a run with a changed tile is
// redrawn before it is used. A run with a tile in a network highlighted
// under the cursor draws live, tile by tile, while it is. Off above the far
// zoom. BeltPipeRows.enabled = false compares against the plain draw.
const BeltPipeRows = (() => {
  const api = { enabled: true, settleMs: 250 };   // settle: longer than the tile bitmaps' own, so they exist at this scale
  const GAP = 40;            // a run splits into atlas pieces where its tiles are further apart than this
  let viewKey = '', viewSince = 0, failKey = '';
  let mode = 0;              // 0 off, 1 recording (this frame draws live), 2 in use
  let segs = [];             // runs: { tiles: [rec], pieces: [{ tiles, ax, ay, w, h, dx, dy }], dirty, live }
  const byEnt = new Map();   // batched entity -> its rec
  let cur = null, pending = null;
  let M0 = null, frameT = 0; // the frame's world transform [a, b, c, d, e, f], and its clock
  let atlas = null, actx = null;

  const isBelt = (e) => e.type === T.CONVEYOR && !e._udgBelt && !e._underWire && !e._underPipe && !e._underWater && !e._irreparable;
  const isPipe = (e) => e.type === T.PIPE && !e._underConveyor && !e._underWater && !e._irreparable && !e._bpPreview;
  const lit = (e) => !!(e._conveyorHighlight || e._pipeHighlight);
  const beltMask = (cn) => (cn[0] ? 1 : 0) | (cn[1] ? 2 : 0) | (cn[2] ? 4 : 0) | (cn[3] ? 8 : 0);
  const straightMask = (m) => m === 3 || m === 12;
  const bitCount = (m) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1) + ((m >> 3) & 1);

  // A tile's current look, as its renderer would work it out this frame
  // (the same layout caches are asked, the same way). True if it changed.
  function look(rec) {
    const e = rec.e;
    if (rec.pipe) {
      const sig = _pipeLookSig(e);
      if (sig !== rec.sig) { rec.sig = sig; rec.fluid = _pipeSigFluid(sig); rec.flow = _pipeSigFlow(sig); }
      const mask = _pipeMask(e, rec.fluid);
      const key = PipeStatic.key(mask, rec.fluid || 'dry', rec.flow, false);
      if (key === rec.key) return false;
      rec.key = key; rec.mask = mask; rec.ov = rec.flow && bitCount(mask) >= 3;
      return true;
    }
    const k = ConveyorLayout.of(e, frameT, false);
    rec.conn = k.connected;
    const mask = beltMask(k.connected), sp = !!e._splitter;
    if (mask === rec.mask && sp === rec.sp) return false;
    rec.mask = mask; rec.sp = sp; rec.ov = sp || !straightMask(mask);
    return true;
  }

  // A tile's static layers, into whatever ctx is now (the atlas).
  function drawStatic(rec) {
    if (!rec.pipe) return ConveyorStatic.blit(rec.mask, rec.x, rec.y);
    const conn = [];
    for (let i = 0; i < 4; i++) if (rec.mask & (1 << i)) conn.push(_PIPE_SIDES[i]);
    return PipeStatic.blit(rec.key, rec.x, rec.y, conn, rec.mask, PIPE_PALETTE[rec.fluid || 'dry'], false, rec.flow);
  }

  function drawPiece(pc) {
    actx.setTransform(1, 0, 0, 1, 0, 0);
    actx.clearRect(pc.ax, pc.ay, pc.w, pc.h);
    actx.save();
    actx.beginPath(); actx.rect(pc.ax, pc.ay, pc.w, pc.h); actx.clip();
    actx.setTransform(M0[0], 0, 0, M0[3], M0[4] - pc.dx + pc.ax, M0[5] - pc.dy + pc.ay);
    const prev = ctx; ctx = actx;
    let ok = true;
    try { for (const rec of pc.tiles) if (!drawStatic(rec)) { ok = false; break; } }
    finally { ctx = prev; actx.restore(); }
    return ok;
  }

  // The recorded runs, cut into pieces, packed into the atlas and drawn.
  // 'ok'; 'big' when the atlas would be too tall; 'unsettled' when a tile
  // bitmap is not ready at this scale yet.
  function build() {
    const a = M0[0], d = M0[3], ex = M0[4], fy = M0[5];
    const pieces = [];
    for (const sg of segs) {
      sg.pieces = [];
      let pc = null, lastC = 0;
      for (const rec of sg.tiles) {
        const c = Math.round(rec.x / TILE);
        if (!pc || c - lastC > GAP) { pc = { tiles: [], x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; sg.pieces.push(pc); pieces.push(pc); }
        lastC = c;
        pc.tiles.push(rec);
        const m = rec.pipe ? PipeStatic.M : ConveyorStatic.M, sz = rec.pipe ? PipeStatic.SIZE : ConveyorStatic.SIZE;
        pc.x0 = Math.min(pc.x0, rec.x - m); pc.y0 = Math.min(pc.y0, rec.y - m);
        pc.x1 = Math.max(pc.x1, rec.x - m + sz); pc.y1 = Math.max(pc.y1, rec.y - m + sz);
      }
    }
    // Device-pixel rects (a pixel of slack all round: a bitmap's drawn size
    // rounds up), shelf-packed.
    const aw = Math.max(2048, canvas.width + 64);
    let x = 0, y = 0, shelf = 0;
    for (const pc of pieces) {
      pc.dx = Math.floor(a * pc.x0 + ex) - 1; pc.dy = Math.floor(d * pc.y0 + fy) - 1;
      pc.w = Math.ceil(a * pc.x1 + ex) + 2 - pc.dx; pc.h = Math.ceil(d * pc.y1 + fy) + 2 - pc.dy;
      if (x + pc.w > aw) { x = 0; y += shelf + 1; shelf = 0; }
      pc.ax = x; pc.ay = y; x += pc.w + 1; shelf = Math.max(shelf, pc.h);
    }
    const ah = y + shelf;
    if (!pieces.length || ah > 8192) return 'big';
    if (!atlas) { atlas = document.createElement('canvas'); actx = atlas.getContext('2d'); }
    if (atlas.width !== aw || atlas.height < ah || atlas.height > ah * 2) { atlas.width = aw; atlas.height = ah; }
    actx.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
    if (ctx.imageSmoothingQuality) actx.imageSmoothingQuality = ctx.imageSmoothingQuality;
    for (const pc of pieces) if (!drawPiece(pc)) return 'unsettled';
    return 'ok';
  }

  function drawSeg(sg) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const pc of sg.pieces) ctx.drawImage(atlas, pc.ax, pc.ay, pc.w, pc.h, pc.dx, pc.dy, pc.w, pc.h);
    ctx.setTransform(M0[0], M0[1], M0[2], M0[3], M0[4], M0[5]);
    // The moving parts, in tile order, and the canvas state a pipe's own
    // draw leaves behind (its blit path ends by setting these two).
    const a0 = ctx.globalAlpha;
    let pipeSeen = false;
    for (const rec of sg.tiles) {
      if (rec.pipe && !pipeSeen) { ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; pipeSeen = true; }
      if (!rec.ov) continue;
      if (rec.pipe) _pipeJunctionGlow(PIPE_PALETTE[rec.fluid || 'dry'], a0, frameT, rec.x + TILE / 2, rec.y + TILE / 2);
      else _conveyorTop(rec.e, rec.x + TILE / 2, rec.y + TILE / 2, frameT, rec.conn);
    }
  }

  function off(now) { mode = 0; segs = []; byEnt.clear(); cur = null; pending = null; viewSince = now; }

  // Called once a frame, just before the entity rows. Returns this object to
  // draw the frame through (take and flush per tile, end after), or null.
  api.begin = function (m, cS, cE, rS, rE, vC0, vC1, vR0, vR1, t, highlighted) {
    const now = performance.now();
    if (!api.enabled || Camera.zoom >= CONVEYOR_CLEAT_MIN_ZOOM || m.b !== 0 || m.c !== 0
        || ctx.globalAlpha !== 1 || ctx.globalCompositeOperation !== 'source-over' || (ctx.filter && ctx.filter !== 'none')) {
      if (mode !== 0) off(now);
      viewKey = '';
      return null;
    }
    const key = m.a + ',' + m.d + ',' + m.e + ',' + m.f + ',' + cS + ',' + cE + ',' + rS + ',' + rE + ',' + vC0 + ',' + vC1 + ',' + vR0 + ',' + vR1
              + ',' + canvas.width + ',' + canvas.height + ',' + ctx.imageSmoothingEnabled + ',' + ctx.imageSmoothingQuality
              + ',' + EntityRegistry.getTopologyVersion() + ',' + BELT_LINK_EPOCH;
    if (key !== viewKey) { viewKey = key; off(now); return null; }
    if (key === failKey) return null;
    M0 = [m.a, m.b, m.c, m.d, m.e, m.f]; frameT = t; pending = null;
    if (mode === 2) {
      for (const sg of segs) {
        sg.dirty = false; sg.live = false;
        for (const rec of sg.tiles) {
          if (!(rec.pipe ? isPipe(rec.e) : isBelt(rec.e))) { off(now); return null; }   // drawn some other way now
          if (look(rec)) sg.dirty = true;
          if (highlighted && lit(rec.e)) sg.live = true;
        }
      }
      for (const sg of segs) if (sg.dirty) for (const pc of sg.pieces) if (!drawPiece(pc)) { off(now); return null; }
      return api;
    }
    if (now - viewSince < api.settleMs) return null;
    mode = 1; segs = []; byEnt.clear(); cur = null;
    return api;
  };

  // Per belt or pipe tile, in the entity pass's order. True when the tile is
  // taken care of here: drawn now while recording, or part of a run.
  api.take = function (e, x, y) {
    if (mode === 2) {
      const rec = byEnt.get(e);
      if (rec === undefined) return false;
      if (rec.sg.live) { if (pending !== null) { drawSeg(pending); pending = null; } renderEntityAt(e, x, y, frameT); return true; }
      if (rec.sg !== pending) { if (pending !== null) drawSeg(pending); pending = rec.sg; }
      return true;
    }
    const pipe = e.type === T.PIPE;
    if (!(pipe ? isPipe(e) : isBelt(e))) return false;
    renderEntityAt(e, x, y, frameT);
    if (cur === null) { cur = { tiles: [], pieces: null, dirty: false, live: false }; segs.push(cur); }
    const rec = { e, x, y, sg: cur, pipe, mask: -1, key: -1, sig: -1, fluid: null, flow: false, sp: false, conn: null, ov: false };
    look(rec);
    byEnt.set(e, rec);
    cur.tiles.push(rec);
    return true;
  };

  // Before anything else the pass draws, and at the end of every row.
  api.flush = function () {
    if (mode === 2) { if (pending !== null) { drawSeg(pending); pending = null; } }
    else cur = null;
  };

  api.end = function () {
    if (mode === 2) { api.flush(); return; }
    cur = null;
    const b = build();
    if (b === 'ok') { mode = 2; return; }
    off(performance.now());                    // try again once settled
    if (b === 'big') failKey = viewKey;        // or not until the view changes
  };

  api._debug = { byEnt, segs: () => segs };
  api.stats = () => ({ mode, runs: segs.length, tiles: byEnt.size, pieces: segs.reduce((n, s) => n + (s.pieces ? s.pieces.length : 0), 0),
                       moving: segs.reduce((n, s) => n + s.tiles.filter(r => r.ov).length, 0), atlas: atlas ? [atlas.width, atlas.height] : null });
  return api;
})();

function renderUndergndPipe(e, px, py, t) {
    const cx = px + TILE / 2, cy = py + TILE / 2;
    const S = TILE / 16;
    const HYDRO_NBRS = _UPIPE_HYDRO_NBRS || (_UPIPE_HYDRO_NBRS = new Set([T.PIPE, T.UNDERGNDPIPE, T.WATEREXTRACTOR, T.HYDROGENERATOR, T.COALGENERATOR, T.CHEMICALPLANT, T.FUELPLANT, T.COOLINGTOWER, T.COOLINGTOWER2, T.NUCLEARREACTOR, T.ADVREACTOR, T.STEAMTURBINE, T.STEAMTURBINE2, T.ELECTROLYZER, T.ATMOSCOLLECTOR, T.HABERBOSCH, T.WASHTOWER, T.FUSIONFUELPLANT, T.LITHIUMPROCESSPLANT, T.REPROCESSOR, T.HULKINGFUSIONREACTOR, T.ADVFUSIONREACTOR, T.MHDRING, T.HELIUMWELL, T.HELIUMWELL2, T.CRYOPLANT, T.HE3SEPARATOR, T.TRITIUMBREEDER, T.GASSTORAGE, T.LEACHPLANT, T.SCMILL, T.COKEOVEN]));
    const OIL_NBRS   = _UPIPE_OIL_NBRS || (_UPIPE_OIL_NBRS = new Set([T.PIPE, T.UNDERGNDPIPE, T.PUMPJACK, T.PUMPJACK2, T.OILSTORAGE, T.REFINERY, T.FUELGEN, T.GASSTATION]));

    const oilActive   = !!e._oilActive;
    const acidActive  = !!e._acidActive;
    const coolActive  = !!e._coolActive;
    const cryoCoolActive = !!e._cryoCoolActive;
    const steamActive = !!e._steamActive;
    const hydrogenActive = !!e._hydrogenActive;
    const nitrogenActive = !!e._nitrogenActive;
    const ammoniaActive = !!e._ammoniaActive;
    const deuteriumActive = !!e._deuteriumActive;
    const highBetaActive = !!e._highBetaActive && !!e._highBetaFlow;   // ions only once the reactor streams them
    const heliumActive   = !!e._heliumActive;
    const liquidHeActive = !!e._liquidHeActive;
    const tritiumActive  = !!e._tritiumActive;
    const he3Active      = !!e._he3Active;
    const lpgActive      = !!e._lpgActive;
    const hasWaterFlow = !oilActive && !!e.powered;
    const hasFlow = hasWaterFlow || oilActive || acidActive || coolActive || cryoCoolActive || steamActive || hydrogenActive || nitrogenActive || ammoniaActive || deuteriumActive || highBetaActive || heliumActive || liquidHeActive || tritiumActive || he3Active || lpgActive;

    // Find connected directions — an underground pipe only exposes its two
    // axis-aligned ends (set by rotation, e._udgAxis), never the perpendicular
    // sides, so a crossing pipe of a different liquid can sit right next to
    // it without visually (or functionally) connecting.
    const axis = (e._udgAxis === 'v') ? 'v' : 'h';
    const dirs = axis === 'v'
      ? [{ dc: 0, dr: -1 }, { dc: 0, dr: 1 }]
      : [{ dc: -1, dr: 0 }, { dc: 1, dr: 0 }];
    const connected = [];
    dirs.forEach(d => {
      // A side with a paired tunnel partner in range is connected regardless
      // of what's sitting on the immediate tile — it jumps straight past it.
      if (udgPartner(e.col, e.row, d.dc, d.dr, axis)) { connected.push(d); return; }
      let nb = GridManager.getEntity(e.col + d.dc, e.row + d.dr);
      if (nb && nb.type === T.WIRE     && nb._underPipe) nb = nb._underPipe;
      if (nb && nb.type === T.CONVEYOR && nb._underPipe) nb = nb._underPipe;
      if (nb && nb.type === T.WATEREXTRACTOR) {
        const port = HydroSystem.extractorOutputPort(nb);
        if (!port || !(e.col === port.c && e.row === port.r)) return;
      }
      if (nb && (nb.type === T.NUCLEARREACTOR || nb.type === T.ADVREACTOR)) {
        const { coolIn, steamOut } = NuclearSystem.getStubs(nb);
        if (!((e.col === coolIn.c && e.row === coolIn.r) || (e.col === steamOut.c && e.row === steamOut.r))) return;
      }
      if (nb && (nb.type === T.COOLINGTOWER || nb.type === T.COOLINGTOWER2)) {
        const { hotIn, coldOut } = CoolingTowerSystem.getStubs(nb);
        if (!((e.col === hotIn.c && e.row === hotIn.r) || (e.col === coldOut.c && e.row === coldOut.r))) return;
      }
      if (nb && nb.type === T.CHEMICALPLANT) {
        const stubs = ChemicalSystem.getStubs(nb).pipeStubs;
        if (!stubs.some(s => e.col === s.c && e.row === s.r)) return;
      }
      if (nb && nb.type === T.FUELPLANT) {
        const { pipeIn } = FuelPlantSystem.getStubs(nb);
        if (!(e.col === pipeIn.c && e.row === pipeIn.r)) return;
      }
      if (nb && (nb.type === T.STEAMTURBINE || nb.type === T.STEAMTURBINE2)) {
        const { steamIn } = SteamTurbineSystem.getStubs(nb);
        if (!(e.col === steamIn.c && e.row === steamIn.r)) return;
      }
      if (nb && nb.type === T.ELECTROLYZER) {
        const { waterStub, hydrogenStub } = ElectrolyzerSystem.getStubs(nb);
        if (!((e.col === waterStub.c && e.row === waterStub.r) || (e.col === hydrogenStub.c && e.row === hydrogenStub.r))) return;
      }
      if (nb && nb.type === T.ATMOSCOLLECTOR) {
        const { nitrogenStub } = AtmosphereCollectorSystem.getStubs(nb);
        if (!(e.col === nitrogenStub.c && e.row === nitrogenStub.r)) return;
      }
      if (nb && nb.type === T.HABERBOSCH) {
        const { nitrogenIn, hydrogenIn, ammoniaOut } = HaberBoschSystem.getStubs(nb);
        if (!((e.col === nitrogenIn.c && e.row === nitrogenIn.r) || (e.col === hydrogenIn.c && e.row === hydrogenIn.r) || (e.col === ammoniaOut.c && e.row === ammoniaOut.r))) return;
      }
      if (nb && nb.type === T.WASHTOWER) {
        const { waterIn, ammoniaIn, deuteriumOut } = IsotopicWashTowerSystem.getStubs(nb);
        if (!((e.col === waterIn.c && e.row === waterIn.r) || (e.col === ammoniaIn.c && e.row === ammoniaIn.r) || (e.col === deuteriumOut.c && e.row === deuteriumOut.r))) return;
      }
      if (nb && nb.type === T.FUSIONFUELPLANT) {
        const { deuteriumIn, tritiumIn, he3In } = FusionFuelPlantSystem.getStubs(nb);
        if (![deuteriumIn, tritiumIn, he3In].some(p => e.col === p.c && e.row === p.r)) return;
      }
      if (nb && nb.type === T.HULKINGFUSIONREACTOR) {
        const { highBetaOut, cryoIn, ashOut, tritiumOut } = HulkingFusionReactorSystem.getStubs(nb);
        if (![highBetaOut, cryoIn, ashOut, tritiumOut].some(p => e.col === p.c && e.row === p.r)) return;
      }
      if (nb && nb.type === T.ADVFUSIONREACTOR) {
        const { ionOutA, ionOutB, cryoIn, ashOut, coolantIn } = AdvancedFusionReactorSystem.getStubs(nb);
        if (![ionOutA, ionOutB, cryoIn, ashOut, coolantIn].some(p => e.col === p.c && e.row === p.r)) return;
      }
      if (isHeliumWell(nb)) {
        const { heliumOut } = HeliumSystem.getStubs(nb);
        if (!(e.col === heliumOut.c && e.row === heliumOut.r)) return;
      }
      if (nb && nb.type === T.CRYOPLANT) {
        const { heliumIn, liquidOut } = CryoPlantSystem.getStubs(nb);
        if (!((e.col === heliumIn.c && e.row === heliumIn.r) || (e.col === liquidOut.c && e.row === liquidOut.r))) return;
      }
      if (nb && nb.type === T.HE3SEPARATOR) {
        const { heliumIn, he3Out } = He3SeparatorSystem.getStubs(nb);
        if (!((e.col === heliumIn.c && e.row === heliumIn.r) || (e.col === he3Out.c && e.row === he3Out.r))) return;
      }
      if (nb && nb.type === T.TRITIUMBREEDER) {
        const { tritiumOut } = TritiumBreederSystem.getStubs(nb);
        if (!(e.col === tritiumOut.c && e.row === tritiumOut.r)) return;
      }
      if (nb && nb.type === T.GASSTORAGE) {
        const { gasIn, gasOut } = GasStorageSystem.getStubs(nb);
        if (!((e.col === gasIn.c && e.row === gasIn.r) || (e.col === gasOut.c && e.row === gasOut.r))) return;
      }
      if (nb && nb.type === T.LITHIUMPROCESSPLANT) {
        const { waterIn } = LithiumProcessPlantSystem.getStubs(nb);
        if (!(e.col === waterIn.c && e.row === waterIn.r)) return;
      }
      if (nb && nb.type === T.REPROCESSOR) {
        const { waterIn } = ReprocessingSystem.getStubs(nb);
        if (!(e.col === waterIn.c && e.row === waterIn.r)) return;
      }
      if (nb && nb.type === T.LEACHPLANT) {
        const { acidIn } = LeachPlantSystem.getStubs(nb);
        if (!(e.col === acidIn.c && e.row === acidIn.r)) return;
      }
      if (nb && nb.type === T.SCMILL) {
        const { hydrogenIn, nitrogenIn } = SuperconductorMillSystem.getStubs(nb);
        if (!((e.col === hydrogenIn.c && e.row === hydrogenIn.r) || (e.col === nitrogenIn.c && e.row === nitrogenIn.r))) return;
      }
      if (nb && nb.type === T.COKEOVEN) {
        const { gasOut } = CokeOvenSystem.getStubs(nb);
        if (!(e.col === gasOut.c && e.row === gasOut.r)) return;
      }
      if (nb && (nb.type === T.PIPE || nb.type === T.UNDERGNDPIPE) && !e._bpPreview && !pipeOpensToward(nb, -d.dc, -d.dr)) return;
      if (nb && (nb.type === T.PIPE || nb.type === T.UNDERGNDPIPE)) {
        const myFluid = cryoCoolActive ? 'cryocool' : coolActive ? 'cool' : steamActive ? 'steam' : acidActive ? 'acid' : lpgActive ? 'lpg' : oilActive ? 'oil' : hydrogenActive ? 'hydrogen' : nitrogenActive ? 'nitrogen' : ammoniaActive ? 'ammonia' : deuteriumActive ? 'deuterium' : highBetaActive ? 'highbeta' : heliumActive ? 'helium' : liquidHeActive ? 'liquidhe' : tritiumActive ? 'tritium' : he3Active ? 'helium3' : (hasWaterFlow ? 'water' : null);
        const nbFluid = pipeCurrentFluid(nb);
        if (myFluid && nbFluid && myFluid !== nbFluid) return;
      }
      if (nb && nb.type === T.GASSTATION &&
          !(e.col === nb.col - 1 && GasStationPorts.inputRows(nb).includes(e.row))) return;   // FUEL IN stub only
      if (nb && nb.type === T.OILSTORAGE && !OilSystem.isTankStubTile(nb, e.col, e.row)) return;
      if (nb && nb.type === T.REFINERY) {
        const refW = nb.width || 5, refH = nb.height || 4;
        const atIn  = e.col === nb.col - 1 && e.row === nb.row + Math.floor(refH / 2);
        const atOut = e.col === nb.col + Math.floor(refW / 2) && e.row === nb.row + refH;
        const lo    = refineryLpgOut(nb);
        const atLpg = refineryLpgUnlocked() && e.col === lo.c && e.row === lo.r;
        if (!atIn && !atOut && !atLpg) return;
      }
      if (nb && (HYDRO_NBRS.has(nb.type) || OIL_NBRS.has(nb.type))) connected.push(d);
    });

    // The fluid this mouth carries, named the way the pipe palette is.
    const fluid = cryoCoolActive ? 'cryocool' : coolActive ? 'cool' : steamActive ? 'steam' : acidActive ? 'acid' : lpgActive ? 'lpg' : oilActive ? 'oil' : hydrogenActive ? 'hydrogen' : nitrogenActive ? 'nitrogen' : ammoniaActive ? 'ammonia' : deuteriumActive ? 'deuterium' : highBetaActive ? 'highbeta' : heliumActive ? 'helium' : liquidHeActive ? 'liquidhe' : tritiumActive ? 'tritium' : he3Active ? 'helium3' : (hasWaterFlow ? 'water' : null);
    const pal = PIPE_PALETTE[hasFlow && fluid ? fluid : 'dry'] || PIPE_PALETTE.dry;
    const portColor = hasFlow && pal.core ? pal.core : '#1a4858';
    const PR = 5.5;   // surface pipe radius (_pipeBody)

    // A valve pit: concrete pad, the surface pipe coming in and turning down
    // through a bolted flange into the ground, and packed earth with a dashed
    // trace over the buried run on the side paired with the far mouth.
    _udgPad(px, py, S);
    const pairedSide = d => !!udgPartner(e.col, e.row, d.dc, d.dr, axis);
    const flow = e._bpPreview ? 0 : udgPipeFlow(e);
    dirs.forEach(d => {
      if (!pairedSide(d)) return;
      _udgEarth(px, py, S, d.dc, d.dr, PR + 1, hasFlow ? _hexA(portColor, 0.7) : 'rgba(60,110,120,0.5)', t, hasFlow);
      _udgMarker(px, py, S, d.dc, d.dr, hasFlow ? portColor : '#4a6a70');
    });
    connected.forEach(d => {
      if (pairedSide(d)) return;
      // Surface stub from the edge to the elbow, in the line's own colours.
      const ex = cx + d.dc * (TILE / 2 - 1.5), ey = cy + d.dr * (TILE / 2 - 1.5);
      ctx.lineCap = 'butt';
      const seg = (w, col) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(cx, cy); ctx.stroke(); };
      seg(PR * 2 + 2, pal.rim); seg(PR * 2 - 1, pal.body);
      ctx.strokeStyle = pal.hi; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(ex - d.dr * PR * 0.5, ey - d.dc * PR * 0.5); ctx.lineTo(cx - d.dr * PR * 0.5, cy - d.dc * PR * 0.5); ctx.stroke();
      if (hasFlow) { ctx.globalAlpha = 0.6; seg(2, pal.core); ctx.globalAlpha = 1; }
      // flange where it meets the neighbouring pipe
      const fx = cx + d.dc * (TILE / 2 - 4), fy = cy + d.dr * (TILE / 2 - 4);
      ctx.fillStyle = pal.flange;
      if (d.dc !== 0) ctx.fillRect(fx - 1.2, fy - PR - 1.5, 2.4, PR * 2 + 3); else ctx.fillRect(fx - PR - 1.5, fy - 1.2, PR * 2 + 3, 2.4);
      // Which way it runs (udgPipeFlow reads it off the ports either side of
      // the tunnel): a chevron on the stub. No claim when it can't tell.
      if (flow) {
        const fxv = (axis === 'v' ? 0 : 1) * flow, fyv = (axis === 'v' ? 1 : 0) * flow;
        const perpX = -d.dr, perpY = d.dc;
        const mx = (ex + cx) / 2, my = (ey + cy) / 2;
        ctx.beginPath();
        ctx.moveTo(mx + fxv * S * 2.0, my + fyv * S * 2.0);
        ctx.lineTo(mx - fxv * S * 1.4 + perpX * S * 1.8, my - fyv * S * 1.4 + perpY * S * 1.8);
        ctx.lineTo(mx - fxv * S * 1.4 - perpX * S * 1.8, my - fyv * S * 1.4 - perpY * S * 1.8);
        ctx.closePath();
        ctx.fillStyle = hasFlow ? pal.core : pal.flange; ctx.fill();
        ctx.strokeStyle = pal.rim; ctx.lineWidth = 0.6; ctx.stroke();
      }
    });
    // The elbow seen from above: a bolted flange round the bore where the
    // line drops into the ground, glowing with the fluid while it flows.
    const fr = PR + 3;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(cx + 1, cy + 1.5, fr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pal.flange; ctx.strokeStyle = pal.rim; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, fr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = pal.rim;
    for (let q = 0; q < 6; q++) { const a = q * Math.PI / 3 + Math.PI / 6; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (fr - 1.6), cy + Math.sin(a) * (fr - 1.6), 0.7, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#050a0c'; ctx.beginPath(); ctx.arc(cx, cy, PR - 1, 0, Math.PI * 2); ctx.fill();
    if (hasFlow) {
      const ga = 0.55 + 0.25 * Math.sin(t * 3);
      if (Camera.zoom > 0.5) {   // LOD: the gradient is imperceptible zoomed out
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, PR);
        g.addColorStop(0, _hexA(portColor, ga)); g.addColorStop(1, _hexA(portColor, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, PR, 0, Math.PI * 2); ctx.fill();
      } else { ctx.fillStyle = _hexA(portColor, ga * 0.6); ctx.beginPath(); ctx.arc(cx, cy, PR - 1, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(cx, cy, fr - 0.5, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke();

    // Pipe network hover highlight
    if (e._pipeHighlight) {
      ctx.save();
      ctx.globalAlpha = 0.28 + 0.08 * Math.sin(t * 4);
      ctx.fillStyle = '#80e8ff';
      ctx.fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
      ctx.restore();
    }
  }

// ── Survey station shared parts ───────────────────────────────────
// Both survey tiers carry the same instrument — a steerable parabolic dish
// with a feed horn on a tripod — so it is drawn once here. Drawn around the
// dish hub at (hx, hy); `tilt` rotates it (sweeping while scanning, parked
// near vertical when idle); `beam` is a colour to project a scan cone in, or
// null when the dish isn't scanning. `s` scales the fixed small details.
function _hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function _drawSurveyDish(hx, hy, dR, tilt, on, s, beam, lod, t) {
  const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  ctx.save();
  ctx.translate(hx, hy); ctx.rotate(tilt);
  // Convex back first, so the face ellipse sits on top of it
  ctx.fillStyle = on ? '#3e3830' : '#211e18';
  ctx.beginPath(); ctx.moveTo(-dR, 0); ctx.quadraticCurveTo(0, dR * 0.85, dR, 0); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = on ? '#241f18' : '#131108'; ctx.lineWidth = s * 0.6;
  ctx.beginPath();
  for (const f of [-0.55, 0, 0.55]) { ctx.moveTo(dR * f, dR * 0.05); ctx.lineTo(dR * f * 0.3, dR * 0.55); }
  ctx.stroke();
  // Face — lit from the left so it doesn't read as a flat disc
  const fg = ctx.createLinearGradient(-dR, -dR * 0.3, dR, dR * 0.3);
  fg.addColorStop(0,    on ? '#8d8878' : '#2e2b25');
  fg.addColorStop(0.42, on ? '#ece6d4' : '#46423a');
  fg.addColorStop(1,    on ? '#7a7568' : '#26241f');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.ellipse(0, 0, dR, dR * 0.36, 0, 0, Math.PI * 2); ctx.fill();
  if (lod) {   // panel seams
    ctx.strokeStyle = 'rgba(0,0,0,0.20)'; ctx.lineWidth = s * 0.5;
    ctx.beginPath();
    ctx.ellipse(0, 0, dR * 0.62, dR * 0.22, 0, 0, Math.PI * 2);
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3 + 0.35;
      ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * dR, Math.sin(a) * dR * 0.36);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = on ? '#efe7d2' : '#3c3830'; ctx.lineWidth = s * 1.1;
  ctx.beginPath(); ctx.ellipse(0, 0, dR, dR * 0.36, 0, 0, Math.PI * 2); ctx.stroke();
  // Feed horn on its tripod, at the focus
  ctx.strokeStyle = on ? '#9c9480' : '#4d483e'; ctx.lineWidth = s * 0.8;
  ctx.beginPath();
  ctx.moveTo(-dR * 0.72, -dR * 0.10); ctx.lineTo(0, -dR * 0.64);
  ctx.moveTo( dR * 0.72, -dR * 0.10); ctx.lineTo(0, -dR * 0.64);
  ctx.moveTo(0, dR * 0.20);           ctx.lineTo(0, -dR * 0.64);
  ctx.stroke();
  ctx.fillStyle = on ? '#6e6656' : '#38342b';
  ctx.beginPath(); ctx.roundRect(-s * 2, -dR * 0.64 - s * 2.2, s * 4, s * 4.4, s); ctx.fill();
  if (beam) {
    if (lod) { ctx.fillStyle = _hexA(beam, 0.28); dot(0, -dR * 0.64, s * 3.4); }
    ctx.fillStyle = _hexA(beam, 0.95); dot(0, -dR * 0.64, s * 1.2);
    // Beam cone projected out along the dish's current facing
    const spread = 0.30, reach = dR * 4.2;
    const cg = ctx.createLinearGradient(0, 0, 0, -reach);
    cg.addColorStop(0, _hexA(beam, 0.24 + 0.10 * Math.sin(t * 6)));
    cg.addColorStop(1, _hexA(beam, 0));
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(0, -dR * 0.64);
    ctx.lineTo(Math.sin(-spread) * reach, -Math.cos(-spread) * reach);
    ctx.lineTo(Math.sin(spread) * reach,  -Math.cos(spread) * reach);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}
// A scan's progress strip, drawn plate-less with a drop shadow so it reads
// against bare terrain or a concrete pad alike.
function _drawSurveyBar(cx, cy, bw, s, pct, fill, label) {
  const bh = s * 6, bx0 = cx - bw / 2, by0 = cy - bh / 2;
  ctx.fillStyle = 'rgba(14,10,6,0.85)';
  ctx.beginPath(); ctx.roundRect(bx0, by0, bw, bh, s); ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.roundRect(bx0, by0, Math.max(s * 2, bw * pct), bh, s); ctx.fill();
  ctx.strokeStyle = 'rgba(255,192,64,0.55)'; ctx.lineWidth = s * 0.5;
  ctx.beginPath(); ctx.roundRect(bx0, by0, bw, bh, s); ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(label, cx + s * 0.5, cy + s * 0.5);
  ctx.fillStyle = '#fff2dc';         ctx.fillText(label, cx, cy);
}

// Resource Survey Station (4×4) — a mobile field survey crew: a six-wheel
// survey truck parked on its outrigger jacks, with an instrument cabin on
// the bed and a telescoping mast carrying the steerable dish; beside it a
// tracked vibroseis thumper whose baseplate shakes the ground during a
// scan, and a line of flagged geophones cabled back to the truck to hear
// the echoes. The MK2 is the permanent version of the same job, so this one
// deliberately reads as temporary kit on trampled ground.
// Everything derives from the entity's footprint so the sprite can't drift
// apart from the def; `S` scales the small fixed details (1 at a 2×2
// footprint, 2 at the 4×4 it ships as).
function renderSurvey(e, px, py, t) {
    if (e.col !== e.col || e.row !== e.row) return;  // skip ghost tiles
    const tw = TILE * (e.width || 4), th = TILE * (e.height || 4);
    const S  = tw / (TILE * 2);
    const cx = px + tw / 2;
    const on = e.powered;
    // A scan can only be VISUALLY running if the station also has power. The
    // _scanning flag can stay set through a blackout, and keying the dish
    // sweep / thumper / beam off it alone left an unpowered rig still
    // sweeping and blinking. Everything animated below gates on this instead.
    const scanning = !!e._scanning && on;
    const pct  = scanning ? Math.min(1, (e._scanProgress || 0) / (e._scanDuration || 60)) : 0;
    const kind = scanning && typeof CoalSystem !== 'undefined' ? CoalSystem.scanKind(e._scanType) : null;
    const beam = scanning ? '#ffc864' : null;
    const lod  = Camera.zoom > 0.5;   // fine detail only while it can be seen
    const hr   = DayNight.hour();
    const night = hr < 6.5 || hr >= 19.5;

    const X = f => px + tw * f, Y = f => py + th * f;
    const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    const dot  = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
    const shade = (x, y, rx, ry, a) => {
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    };
    // Survey-orange livery over weathered steel — everything dims together
    // when the station has no power, so `on` only gets branched on once.
    const c = on
      ? { deep: '#241f18', dark: '#3e3830', mid: '#6e6656', lite: '#9c9480', trim: '#d07820', paint: '#c8681c', paintLt: '#e88a34', lamp: '#ffc040', glass: '#5a7a88' }
      : { deep: '#131108', dark: '#211e18', mid: '#38342b', lite: '#4d483e', trim: '#5a4022', paint: '#4a2c14', paintLt: '#5c3a1c', lamp: '#6a5030', glass: '#1e2428' };

    const groundY = Y(0.78);          // where the truck's tyres meet the ground

    // ── Glow ────────────────────────────────────────────────────────
    if (on && lod) {
      drawGlowHalo(cx, Y(0.46), TILE * 1.4, [[0, '#c08030'], [1, 'transparent']], 0.12 + 0.06 * Math.sin(t * 2));
    }

    // ── Trampled ground and tyre tracks ─────────────────────────────
    // A soft dirt patch, not a pad: the crew is camped on bare terrain.
    ctx.save();
    ctx.translate(cx, groundY + th * 0.03); ctx.scale(1, 0.34);
    const dirt = ctx.createRadialGradient(0, 0, tw * 0.08, 0, 0, tw * 0.52);
    dirt.addColorStop(0,   'rgba(58,44,28,0.42)');
    dirt.addColorStop(0.7, 'rgba(58,44,28,0.16)');
    dirt.addColorStop(1,   'rgba(58,44,28,0)');
    ctx.fillStyle = dirt;
    ctx.beginPath(); ctx.arc(0, 0, tw * 0.52, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (lod) {   // the truck drove in from the left; two ruts curving in
      ctx.strokeStyle = 'rgba(30,22,14,0.30)'; ctx.lineWidth = S * 1.6;
      for (const off of [0, th * 0.05]) {
        ctx.beginPath();
        ctx.moveTo(px, groundY + th * 0.10 + off);
        ctx.quadraticCurveTo(X(0.14), groundY + th * 0.02 + off, X(0.30), groundY + off * 0.4);
        ctx.stroke();
      }
    }

    // ── Geophone line ───────────────────────────────────────────────
    // A row of flagged geophones across the front of the site, daisy-chained
    // on one cable that runs back to the truck's instrument cabin.
    const geoY = Y(0.895);
    const geos = [0.10, 0.26, 0.42, 0.58, 0.74, 0.90].map((f, i) => [X(f), geoY + (i % 2 ? -th * 0.012 : th * 0.008)]);
    ctx.strokeStyle = on ? 'rgba(18,15,10,0.60)' : 'rgba(12,10,7,0.45)';
    ctx.lineWidth = S * 0.8;
    ctx.beginPath();
    ctx.moveTo(X(0.30), groundY - th * 0.02);
    ctx.quadraticCurveTo(X(0.26), Y(0.86), geos[1][0], geos[1][1]);
    for (let i = 1; i < geos.length; i++) {
      const a = geos[i - 1], b = geos[i];
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo((a[0] + b[0]) / 2, Math.max(a[1], b[1]) + th * 0.02, b[0], b[1]);
    }
    ctx.stroke();
    ctx.lineCap = 'round';
    geos.forEach((p, i) => {
      shade(p[0] + S * 0.6, p[1] + S * 0.6, S * 3, S * 1.1, 0.28);
      ctx.fillStyle = c.mid;  ctx.fillRect(p[0] - S * 1.6, p[1] - S * 2.2, S * 3.2, S * 2.4);
      ctx.fillStyle = c.lite; ctx.fillRect(p[0] - S * 1.6, p[1] - S * 2.2, S * 3.2, S * 0.7);
      // Flag on a whip so the line can be found in long grass
      const fh = th * 0.06, flut = Math.sin(t * 1.7 + i * 1.3) * S;
      ctx.strokeStyle = c.lite; ctx.lineWidth = S * 0.5;
      line(p[0] + S * 1.2, p[1] - S * 2, p[0] + S * 1.2, p[1] - fh);
      ctx.fillStyle = c.trim;
      ctx.beginPath();
      ctx.moveTo(p[0] + S * 1.2, p[1] - fh);
      ctx.lineTo(p[0] + S * 4.6 + flut, p[1] - fh + S * 1.1);
      ctx.lineTo(p[0] + S * 1.2, p[1] - fh + S * 2.2);
      ctx.closePath(); ctx.fill();
      // LEDs chase down the line while a scan runs, idle-pulse otherwise
      const lit = on && (scanning ? ((Math.floor(t * 8) % geos.length) === i) : Math.sin(t * 1.4 + i) > 0.6);
      if (lit && lod) { ctx.fillStyle = 'rgba(255,190,80,0.25)'; dot(p[0] - S * 0.4, p[1] - S * 1.2, S * 2.6); }
      ctx.fillStyle = lit ? c.lamp : (on ? '#3a2c18' : '#171208');
      dot(p[0] - S * 0.4, p[1] - S * 1.2, S * 0.75);
    });

    // ── Vibroseis thumper ───────────────────────────────────────────
    // A compact tracked carrier with a hydraulic frame lowering a steel
    // baseplate onto the ground. While scanning the plate judders and the
    // ground rings out from under it; idle, it is raised clear.
    const vbL = X(0.70), vbR = X(0.97), vbG = groundY + th * 0.01;
    const vbMid = (vbL + vbR) / 2;
    const plateY = scanning ? vbG - S * 0.6 + Math.abs(Math.sin(t * 22)) * S * 0.9 : vbG - S * 3.2;
    if (scanning) {   // seismic rings spreading from the plate
      for (let i = 0; i < 3; i++) {
        const rph = ((t * 1.4 + i * 0.5) % 1.5);
        if (rph > 1) continue;
        ctx.save(); ctx.globalAlpha = (1 - rph) * 0.40;
        ctx.strokeStyle = kind ? kind.color : '#f0a030'; ctx.lineWidth = S * 0.7;
        ctx.beginPath();
        ctx.ellipse(vbMid, vbG + S, rph * tw * 0.40, rph * th * 0.12, 0, 0, Math.PI * 2);
        ctx.stroke(); ctx.restore();
      }
    }
    shade(vbMid + S, vbG + S * 1.6, (vbR - vbL) * 0.56, th * 0.028, 0.32);
    // Tracks, one each side — the far one peeks out above the near one
    const trH = th * 0.05;
    ctx.fillStyle = c.deep;
    ctx.beginPath(); ctx.roundRect(vbL + S * 2, vbG - trH - S * 2.2, vbR - vbL - S * 4, trH, trH * 0.5); ctx.fill();
    ctx.fillStyle = c.dark;
    ctx.beginPath(); ctx.roundRect(vbL, vbG - trH, vbR - vbL, trH, trH * 0.5); ctx.fill();
    if (lod) {   // road wheels and grousers
      ctx.fillStyle = c.mid;
      for (let k = 0; k < 4; k++) dot(vbL + trH * 0.5 + k * (vbR - vbL - trH) / 3, vbG - trH * 0.5, trH * 0.30);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = S * 0.5;
      ctx.beginPath();
      for (let x = vbL + S * 1.5; x < vbR - S; x += S * 2.2) { ctx.moveTo(x, vbG - S * 0.4); ctx.lineTo(x, vbG); }
      ctx.stroke();
    }
    // Body: engine deck at the back, cab at the front (right)
    const vbTop = vbG - trH - th * 0.10;
    ctx.fillStyle = c.paint;
    ctx.beginPath(); ctx.roundRect(vbL + S, vbTop + th * 0.035, (vbR - vbL) * 0.55, th * 0.065, S); ctx.fill();
    ctx.fillStyle = c.paintLt;
    ctx.fillRect(vbL + S, vbTop + th * 0.035, (vbR - vbL) * 0.55, S * 1.2);
    const cabL = vbL + (vbR - vbL) * 0.62;
    ctx.fillStyle = c.paint;
    ctx.beginPath(); ctx.roundRect(cabL, vbTop, vbR - cabL - S, th * 0.10, S * 1.2); ctx.fill();
    ctx.fillStyle = c.glass;
    ctx.fillRect(cabL + S * 1.4, vbTop + S * 1.6, vbR - cabL - S * 4.2, th * 0.035);
    // Exhaust stack on the engine deck — a puff with each thump
    ctx.fillStyle = c.deep; ctx.fillRect(vbL + S * 3, vbTop + th * 0.035 - S * 5, S * 1.6, S * 5);
    if (scanning && lod) {
      for (let i = 0; i < 3; i++) {
        const ph = (t * 0.9 + i / 3) % 1;
        ctx.fillStyle = `rgba(90,84,76,${0.30 * (1 - ph)})`;
        dot(vbL + S * 3.8 + ph * S * 6, vbTop + th * 0.035 - S * 5 - ph * S * 10, S * (1.2 + ph * 2.4));
      }
    }
    // Hydraulic lift frame and baseplate between the tracks' mid-point
    const frX = vbL + (vbR - vbL) * 0.40;
    ctx.strokeStyle = c.lite; ctx.lineWidth = S * 1.1;
    line(frX - S * 3, vbTop + th * 0.035, frX - S * 3, plateY - S * 1.2);
    line(frX + S * 3, vbTop + th * 0.035, frX + S * 3, plateY - S * 1.2);
    ctx.strokeStyle = c.trim; ctx.lineWidth = S * 1.6;   // ram
    line(frX, vbTop + th * 0.02, frX, plateY - S * 1.2);
    ctx.fillStyle = c.mid;
    ctx.fillRect(frX - S * 5.5, plateY - S * 1.4, S * 11, S * 1.6);
    ctx.fillStyle = c.deep;
    ctx.fillRect(frX - S * 5.5, plateY + S * 0.2, S * 11, S * 0.6);
    // Amber beacon on the cab roof — turns while the plate is working
    const bcX = cabL + (vbR - cabL) * 0.5, bcY = vbTop - S * 1.2;
    ctx.fillStyle = c.dark; ctx.fillRect(bcX - S * 1.6, bcY + S * 0.4, S * 3.2, S * 1.2);
    const bcLit = on && scanning && Math.sin(t * 9) > -0.2;
    if (bcLit && lod) { ctx.fillStyle = 'rgba(255,170,40,0.28)'; dot(bcX, bcY, S * 4.2); }
    ctx.fillStyle = bcLit ? '#ffb030' : (on ? '#6a4818' : '#241808');
    ctx.beginPath(); ctx.arc(bcX, bcY + S * 0.4, S * 1.3, Math.PI, 0); ctx.fill();

    // ── Survey truck ────────────────────────────────────────────────
    // Side elevation: cab on the left, flat bed carrying the instrument
    // cabin and the mast, three axles, outrigger jacks planted either end.
    const trL = X(0.03), trR = X(0.66);
    const chTop = groundY - th * 0.085, chBot = groundY - th * 0.045;
    const wR = th * 0.042;
    shade((trL + trR) / 2 + S * 2, groundY + S * 1.4, (trR - trL) * 0.54, th * 0.03, 0.34);
    // Outrigger jacks — deployed, so the truck sits level while it listens
    for (const jx of [X(0.205), X(0.645)]) {
      ctx.fillStyle = c.dark; ctx.fillRect(jx - S * 1.2, chBot, S * 2.4, groundY - chBot + S * 0.6);
      ctx.fillStyle = c.trim; ctx.fillRect(jx - S * 1.2, chBot + S * 1.5, S * 2.4, S * 1.2);
      ctx.fillStyle = c.deep; ctx.fillRect(jx - S * 3, groundY + S * 0.2, S * 6, S * 1.2);
    }
    // Chassis rail + bed deck
    ctx.fillStyle = c.deep; ctx.fillRect(trL + S * 2, chTop, trR - trL - S * 2, chBot - chTop);
    ctx.fillStyle = c.mid;  ctx.fillRect(X(0.20), chTop - S * 1.4, trR - X(0.20), S * 1.6);
    ctx.fillStyle = c.trim; // hazard chevrons along the deck edge
    if (lod) {
      for (let x = X(0.21); x < trR - S * 2; x += S * 4) {
        ctx.beginPath(); ctx.moveTo(x, chTop + S * 0.2); ctx.lineTo(x + S * 1.6, chTop + S * 0.2);
        ctx.lineTo(x + S * 3.2, chBot - S * 0.4); ctx.lineTo(x + S * 1.6, chBot - S * 0.4); ctx.closePath(); ctx.fill();
      }
    }
    // Wheels: one steer axle under the cab, a tandem under the bed
    for (const wx of [X(0.11), X(0.43), X(0.555)]) {
      ctx.fillStyle = '#0c0b09'; dot(wx, groundY - wR, wR);
      ctx.fillStyle = c.mid;     dot(wx, groundY - wR, wR * 0.46);
      ctx.fillStyle = c.deep;    dot(wx, groundY - wR, wR * 0.16);
    }
    // Cab — sloped windscreen facing left, door, mirror, roof light bar
    const cabT = groundY - th * 0.23, cabR = X(0.205);
    ctx.fillStyle = c.paint;
    ctx.beginPath();
    ctx.moveTo(trL, chBot); ctx.lineTo(trL, cabT + th * 0.07);
    ctx.lineTo(trL + tw * 0.045, cabT); ctx.lineTo(cabR, cabT);
    ctx.lineTo(cabR, chBot); ctx.closePath(); ctx.fill();
    ctx.fillStyle = c.paintLt; ctx.fillRect(trL + tw * 0.045, cabT, cabR - trL - tw * 0.045, S * 1.2);
    ctx.fillStyle = on ? (night ? 'rgba(255,214,140,0.65)' : c.glass) : c.glass;
    ctx.beginPath();
    ctx.moveTo(trL + S * 1.2, cabT + th * 0.07); ctx.lineTo(trL + tw * 0.05, cabT + S * 1.8);
    ctx.lineTo(cabR - S * 2, cabT + S * 1.8); ctx.lineTo(cabR - S * 2, cabT + th * 0.07); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = c.deep; ctx.lineWidth = S * 0.6;
    line(X(0.125), cabT + S * 1.8, X(0.125), chBot - S);           // door shut line
    ctx.fillStyle = c.deep; ctx.fillRect(X(0.135), cabT + th * 0.095, S * 1.8, S * 0.7);  // handle
    ctx.fillStyle = c.trim; ctx.fillRect(trL, chBot - S * 2.4, cabR - trL, S * 1.1);       // livery stripe
    // Headlamp at the nose
    ctx.fillStyle = on ? '#ffe2a0' : '#3a3428'; ctx.fillRect(trL - S * 0.2, chBot - S * 4.4, S * 1.4, S * 1.6);
    if (on && night && lod) {
      const hl = ctx.createLinearGradient(trL, 0, trL - tw * 0.06, 0);
      hl.addColorStop(0, 'rgba(255,226,160,0.22)'); hl.addColorStop(1, 'rgba(255,226,160,0)');
      ctx.fillStyle = hl;
      ctx.beginPath(); ctx.moveTo(trL, chBot - S * 4.4); ctx.lineTo(px, chBot - S * 7); ctx.lineTo(px, chBot); ctx.closePath(); ctx.fill();
    }
    // Whip antenna off the cab roof
    ctx.strokeStyle = c.lite; ctx.lineWidth = S * 0.5;
    line(cabR - S * 3, cabT, cabR - S * 4.5, cabT - th * 0.08);
    ctx.fillStyle = c.lamp; dot(cabR - S * 4.5, cabT - th * 0.08, S * 0.7);

    // ── Instrument cabin on the bed ─────────────────────────────────
    const icL = X(0.225), icR = X(0.445), icT = chTop - S * 1.4 - th * 0.15, icB = chTop - S * 1.4;
    const bodyG = ctx.createLinearGradient(0, icT, 0, icB);
    bodyG.addColorStop(0, on ? '#5c564a' : '#2b2822');
    bodyG.addColorStop(1, on ? '#38342c' : '#1a1814');
    ctx.fillStyle = bodyG;
    ctx.beginPath(); ctx.roundRect(icL, icT, icR - icL, icB - icT, S * 1.2); ctx.fill();
    if (lod) {   // ribbed walls
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = S * 0.5;
      ctx.beginPath();
      for (let x = icL + S * 2; x < icR - S; x += S * 2.4) { ctx.moveTo(x, icT + S * 1.5); ctx.lineTo(x, icB - S * 0.8); }
      ctx.stroke();
    }
    ctx.fillStyle = c.mid; ctx.fillRect(icL - S, icT - S * 1.6, icR - icL + S * 2, S * 1.8);   // roof
    ctx.fillStyle = c.dark; ctx.fillRect(icL + S * 2, icT - S * 3.6, (icR - icL) * 0.28, S * 2);   // AC box
    // Seismogram screen in the side wall — traces scroll while a scan runs,
    // drawn in the colour of what the crew is listening for.
    const scX = icL + (icR - icL) * 0.12, scY = icT + (icB - icT) * 0.22, scW = (icR - icL) * 0.50, scH = (icB - icT) * 0.42;
    ctx.fillStyle = '#0e1410'; ctx.fillRect(scX, scY, scW, scH);
    if (on && lod) {
      ctx.save();
      ctx.beginPath(); ctx.rect(scX, scY, scW, scH); ctx.clip();
      ctx.strokeStyle = scanning ? _hexA(kind ? kind.color : '#ffc450', 0.95) : 'rgba(150,120,60,0.55)';
      ctx.lineWidth = S * 0.5;
      for (let r = 0; r < 2; r++) {
        const baseY = scY + scH * (0.30 + r * 0.40);
        ctx.beginPath();
        for (let k = 0; k <= 10; k++) {
          const xx = scX + (scW * k) / 10;
          const amp = scanning ? scH * 0.17 : scH * 0.03;
          const yy = baseY + Math.sin(k * 1.7 + t * (scanning ? 5 : 0.6) + r * 2.1) * amp;
          k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.strokeStyle = c.dark; ctx.lineWidth = S * 0.6; ctx.strokeRect(scX, scY, scW, scH);
    // Rear door with a lit porthole, and a status LED stack beside it
    const dX = icL + (icR - icL) * 0.72, dW = (icR - icL) * 0.20;
    ctx.fillStyle = c.deep; ctx.fillRect(dX, icT + (icB - icT) * 0.18, dW, (icB - icT) * 0.78);
    ctx.fillStyle = on ? `rgba(255,206,124,${night ? 0.9 : 0.5})` : 'rgba(16,14,10,0.85)';
    dot(dX + dW / 2, icT + (icB - icT) * 0.38, dW * 0.26);
    for (let i = 0; i < 3; i++) {
      const lit = on && (scanning ? ((Math.floor(t * 7) % 3) === i) : i === 0);
      ctx.fillStyle = lit ? c.lamp : (on ? '#3a2c18' : '#171208');
      dot(icL + (icR - icL) * 0.66, icT + (icB - icT) * (0.30 + i * 0.18), S * 0.7);
    }
    ctx.fillStyle = c.trim; ctx.fillRect(icL, icB - S * 2.2, icR - icL, S * 1);   // hazard band

    // ── Telescoping mast ────────────────────────────────────────────
    // Three nested sections rising from a turntable on the back of the bed,
    // guyed to the outrigger jacks; the dish rides on top.
    const mX = X(0.555), mBot = chTop - S * 1.4, mTop = Y(0.16);
    const secs = [[0, 0.40, S * 3.2], [0.38, 0.72, S * 2.4], [0.70, 1, S * 1.7]];
    ctx.fillStyle = c.dark; ctx.fillRect(mX - S * 4.5, mBot - S * 2, S * 9, S * 2.2);    // turntable
    ctx.fillStyle = c.lite; ctx.fillRect(mX - S * 4.5, mBot - S * 2, S * 9, S * 0.6);
    for (const [f0, f1, hw] of secs) {
      const y0 = mBot + (mTop - mBot) * f0, y1 = mBot + (mTop - mBot) * f1;
      const g = ctx.createLinearGradient(mX - hw, 0, mX + hw, 0);
      g.addColorStop(0, c.dark); g.addColorStop(0.45, c.lite); g.addColorStop(1, c.dark);
      ctx.fillStyle = g; ctx.fillRect(mX - hw, y1, hw * 2, y0 - y1);
      ctx.fillStyle = c.deep; ctx.fillRect(mX - hw - S * 0.4, y1, hw * 2 + S * 0.8, S * 0.9);   // collar
    }
    // Cable spiralling down the mast to the cabin
    if (lod) {
      ctx.strokeStyle = 'rgba(18,15,10,0.65)'; ctx.lineWidth = S * 0.6;
      ctx.beginPath();
      for (let k = 0; k <= 14; k++) {
        const f = k / 14, y = mBot + (mTop - mBot) * f * 0.92;
        const xx = mX + Math.sin(f * Math.PI * 5) * S * 2.2;
        k ? ctx.lineTo(xx, y) : ctx.moveTo(icR, icT + S * 3);
      }
      ctx.stroke();
    }
    // Guys from the top collar out to the two jacks
    ctx.strokeStyle = on ? 'rgba(150,140,120,0.40)' : 'rgba(58,54,46,0.40)'; ctx.lineWidth = S * 0.5;
    const guyY = mBot + (mTop - mBot) * 0.70;
    line(mX, guyY, X(0.205), groundY); line(mX, guyY, X(0.645) + S * 4, groundY);
    // Obstruction light at the top collar
    const obX = mX + S * 2.6, obY = mTop + S * 2;
    const beaconOn = on && (scanning ? Math.sin(t * 3.4) > 0.35 : Math.sin(t * 1.1) > 0.75);
    if (beaconOn && lod) { ctx.fillStyle = 'rgba(255,70,60,0.30)'; dot(obX, obY, S * 3.6); }
    ctx.fillStyle = beaconOn ? 'rgba(255,80,66,0.95)' : (on ? 'rgba(120,45,35,0.9)' : '#241010');
    dot(obX, obY, S * 1.3);
    // Floodlight throw after dark
    if (on && night) {
      const fl = ctx.createLinearGradient(mX, mTop, mX, groundY + th * 0.06);
      fl.addColorStop(0, 'rgba(255,224,160,0.12)');
      fl.addColorStop(1, 'rgba(255,224,160,0)');
      ctx.fillStyle = fl;
      ctx.beginPath();
      ctx.moveTo(mX - S * 2, mTop + S * 6); ctx.lineTo(mX - tw * 0.24, groundY + th * 0.06);
      ctx.lineTo(mX + tw * 0.22, groundY + th * 0.06); ctx.lineTo(mX + S * 2, mTop + S * 6);
      ctx.closePath(); ctx.fill();
    }
    // Yoke + dish. Sweeps back and forth while scanning, 0.9 rad/s —
    // deliberately unhurried; parks near vertical when idle.
    ctx.strokeStyle = c.mid; ctx.lineWidth = S * 1.2;
    line(mX - S * 1.5, mTop, mX - S * 4.5, mTop - S * 3.5);
    line(mX + S * 1.5, mTop, mX + S * 4.5, mTop - S * 3.5);
    const tilt = scanning ? Math.sin(t * 0.9) * 0.55 : -0.12;
    _drawSurveyDish(mX, mTop - S * 4, tw * 0.13, tilt, on, S, beam, lod, t);

    // ── Status strip ────────────────────────────────────────────────
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.max(6, Math.round(S * 6.5))}px monospace`;
    const sy = Y(0.965);
    if (scanning) {
      _drawSurveyBar(cx, sy, tw * 0.62, S, pct, '#c08030', `${kind ? kind.label.toUpperCase() + ' ' : ''}${Math.round(pct * 100)}%`);
    } else {
      const lbl = on ? 'READY' : 'OFFLINE';
      ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(lbl, cx + S * 0.6, sy + S * 0.6);
      ctx.fillStyle = on ? '#c08030' : '#6a5030'; ctx.fillText(lbl, cx, sy);
    }
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.lineCap = 'butt';

    // Selection ring
    if (InspectionPanel.isOpen() && InspectionPanel.target === e) {
      ctx.save();
      ctx.strokeStyle = '#c08030'; ctx.lineWidth = 2/Camera.zoom;
      ctx.globalAlpha = 0.7 + 0.3*Math.sin(t*4);
      ctx.strokeRect(px+1, py+1, tw-2, th-2);
      ctx.restore();
    }
  }

// Survey Station MK2 (6×6) — a permanent geophysics observatory rather than
// the MK1's field crew: a concrete pad with two lattice towers, each
// carrying its own large dish (one per scan slot, so each sweeps, beams and
// rings the ground on its own, in the colour of what it's looking for), a
// two-storey control block with one live seismogram wall per dish, a core-
// drilling derrick with racked core boxes, a genset and a geophone array.
// `S` scales the small fixed details to match the MK1 (2 at 6×6, the same
// pixel size as the MK1's 2 at 4×4), so the two read as the same family.
function renderSurvey2(e, px, py, t) {
    if (e.col !== e.col || e.row !== e.row) return;  // skip ghost tiles
    const tw = TILE * (e.width || 6), th = TILE * (e.height || 6);
    const S  = tw / (TILE * 3);
    const cx = px + tw / 2;
    const on = e.powered;
    const lod  = Camera.zoom > 0.5;
    const hr   = DayNight.hour();
    const night = hr < 6.5 || hr >= 19.5;
    // One entry per dish. A slot only animates while the station also has
    // power — a blackout stalls the scan and should freeze the dish too.
    const rawSlots = Array.isArray(e._scanSlots) ? e._scanSlots : [];
    const slots = [0, 1].map(i => {
      const s = rawSlots[i];
      if (!s) return null;
      const kind = typeof CoalSystem !== 'undefined' ? CoalSystem.scanKind(s.type) : null;
      return { kind, color: kind ? kind.color : '#ffc864', running: on,
               pct: Math.min(1, (s.progress || 0) / (s.duration || 60)) };
    });
    const anyRunning = on && slots.some(s => s);

    const X = f => px + tw * f, Y = f => py + th * f;
    const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    const dot  = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
    const shade = (x, y, rx, ry, a) => {
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    };
    const c = on
      ? { deep: '#1c1d20', dark: '#34363a', mid: '#5c6066', lite: '#8e939a', pad: '#4a4a46', padLt: '#5a5a55',
          wall: '#d8d2c2', wallSh: '#a8a292', trim: '#e89a30', lamp: '#ffc040', glass: '#3c5868' }
      : { deep: '#0e0e10', dark: '#1a1b1d', mid: '#2e3033', lite: '#45484c', pad: '#262624', padLt: '#2e2e2b',
          wall: '#4a4740', wallSh: '#3a3832', trim: '#5a4022', lamp: '#6a5030', glass: '#1a2228' };

    // ── Glow ────────────────────────────────────────────────────────
    if (on && lod) {
      drawGlowHalo(cx, Y(0.45), TILE * 2.2, [[0, '#ffb040'], [1, 'transparent']], 0.10 + 0.05 * Math.sin(t * 2));
    }

    // ── Concrete pad ────────────────────────────────────────────────
    // A permanent installation, so it stands on a poured slab with
    // expansion joints and a painted walkway, not trampled dirt.
    const padT = Y(0.30), padB = Y(0.975), padL = X(0.025), padR = X(0.975);
    shade(cx + S * 2, padB - S, tw * 0.49, th * 0.03, 0.25);
    const pg = ctx.createLinearGradient(0, padT, 0, padB);
    pg.addColorStop(0, c.padLt); pg.addColorStop(1, c.pad);
    ctx.fillStyle = pg;
    ctx.beginPath(); ctx.roundRect(padL, padT, padR - padL, padB - padT, S * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = S * 0.6;
    ctx.beginPath(); ctx.roundRect(padL, padT, padR - padL, padB - padT, S * 2); ctx.stroke();
    if (lod) {
      ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = S * 0.5;
      ctx.beginPath();
      for (const f of [0.25, 0.5, 0.75]) { ctx.moveTo(X(0.025 + 0.95 * f), padT); ctx.lineTo(X(0.025 + 0.95 * f), padB); }
      for (const f of [0.5]) { ctx.moveTo(padL, padT + (padB - padT) * f); ctx.lineTo(padR, padT + (padB - padT) * f); }
      ctx.stroke();
      // Yellow walkway lines from the front edge to the control block door
      ctx.strokeStyle = on ? 'rgba(232,190,60,0.55)' : 'rgba(90,74,30,0.5)'; ctx.lineWidth = S * 0.8;
      ctx.setLineDash([S * 3, S * 2]);
      line(X(0.46), Y(0.76), X(0.46), padB - S * 1.5);
      line(X(0.54), Y(0.76), X(0.54), padB - S * 1.5);
      ctx.setLineDash([]);
    }

    // Tower geometry — needed early for the cable trays and ripples.
    const towers = [
      { x: X(0.18), top: Y(0.12), bot: Y(0.66), park: -0.14, phase: 0 },
      { x: X(0.82), top: Y(0.10), bot: Y(0.64), park: 0.14, phase: 2.1 },
    ];

    // ── Seismic rings, one set per running dish, in that scan's colour ──
    towers.forEach((tw_, i) => {
      const s = slots[i];
      if (!s || !s.running) return;
      for (let k = 0; k < 3; k++) {
        const rph = ((t * 1.3 + k * 0.5 + i * 0.27) % 1.6);
        if (rph > 1) continue;
        ctx.save(); ctx.globalAlpha = (1 - rph) * 0.36;
        ctx.strokeStyle = s.color; ctx.lineWidth = S * 0.7;
        ctx.beginPath();
        ctx.ellipse(tw_.x, tw_.bot + S * 2, rph * tw * 0.30, rph * th * 0.09, 0, 0, Math.PI * 2);
        ctx.stroke(); ctx.restore();
      }
    });

    // ── Cable trays from each tower base into the control block ──────
    ctx.fillStyle = c.dark;
    ctx.fillRect(X(0.18), Y(0.665), X(0.33) - X(0.18), S * 1.6);
    ctx.fillRect(X(0.67), Y(0.645), X(0.82) - X(0.67), S * 1.6);
    if (lod) {
      ctx.strokeStyle = c.mid; ctx.lineWidth = S * 0.4;
      ctx.beginPath();
      for (let x = X(0.19); x < X(0.33); x += S * 2.5) { ctx.moveTo(x, Y(0.665)); ctx.lineTo(x, Y(0.665) + S * 1.6); }
      for (let x = X(0.68); x < X(0.82); x += S * 2.5) { ctx.moveTo(x, Y(0.645)); ctx.lineTo(x, Y(0.645) + S * 1.6); }
      ctx.stroke();
    }

    // ── Lattice towers ──────────────────────────────────────────────
    towers.forEach((tw_, i) => {
      const hB = tw * 0.045, hT = tw * 0.018;
      const legY = f => tw_.bot + (tw_.top - tw_.bot) * f;
      const face = (spread, yOff, stroke, w) => {
        const RUNGS = 7;
        ctx.strokeStyle = stroke; ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(tw_.x - hB * spread, tw_.bot + yOff); ctx.lineTo(tw_.x - hT * spread, tw_.top + yOff);
        ctx.moveTo(tw_.x + hB * spread, tw_.bot + yOff); ctx.lineTo(tw_.x + hT * spread, tw_.top + yOff);
        ctx.stroke();
        ctx.lineWidth = w * 0.6;
        ctx.beginPath();
        for (let k = 0; k < RUNGS; k++) {
          const f0 = k / RUNGS, f1 = (k + 1) / RUNGS;
          const y0 = legY(f0) + yOff, y1 = legY(f1) + yOff;
          const h0 = (hB + (hT - hB) * f0) * spread, h1 = (hB + (hT - hB) * f1) * spread;
          ctx.moveTo(tw_.x - h0, y0); ctx.lineTo(tw_.x + h1, y1);
          ctx.moveTo(tw_.x + h0, y0); ctx.lineTo(tw_.x - h1, y1);
          ctx.moveTo(tw_.x - h1, y1); ctx.lineTo(tw_.x + h1, y1);
        }
        ctx.stroke();
      };
      shade(tw_.x + S * 2, tw_.bot + S * 1.4, tw * 0.08, th * 0.018, 0.32);
      face(0.5, -th * 0.016, c.dark, S * 0.9);
      face(1,    0,          c.mid,  S * 1.3);
      // Concrete footing blocks
      ctx.fillStyle = c.padLt;
      for (const sg of [-1, 1]) {
        ctx.fillRect(tw_.x + sg * hB - S * 2.2, tw_.bot - S * 1.2, S * 4.4, S * 2.6);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(tw_.x + sg * hB - S * 2.2, tw_.bot + S * 0.8, S * 4.4, S * 0.6);
        ctx.fillStyle = c.padLt;
      }
      // Equipment shelter halfway up: the slot's own receiver
      const shY = legY(0.30);
      ctx.fillStyle = c.wallSh; ctx.fillRect(tw_.x - S * 3.6, shY - S * 4, S * 7.2, S * 5);
      ctx.fillStyle = c.wall;   ctx.fillRect(tw_.x - S * 3.6, shY - S * 4, S * 7.2, S * 1.2);
      // Slot letter + state lamp on the shelter: amber idle, scan colour busy
      const s = slots[i];
      const lit = on && (s ? Math.sin(t * 5 + i) > -0.3 : true);
      ctx.fillStyle = !on ? '#241808' : s ? s.color : '#c08030';
      if (lit && lod) { ctx.save(); ctx.globalAlpha = 0.3; dot(tw_.x + S * 2.2, shY - S * 1.4, S * 2.6); ctx.restore(); }
      if (lit) dot(tw_.x + S * 2.2, shY - S * 1.4, S * 0.9);
      if (lod) {
        ctx.save();
        ctx.font = `bold ${Math.max(5, Math.round(S * 3.6))}px monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = on ? '#2a2a2a' : '#151515';
        ctx.fillText('AB'[i], tw_.x - S * 1.2, shY - S * 1.2);
        ctx.restore();
      }
      // Platform and handrail under the dish
      const pfY = tw_.top + th * 0.006;
      ctx.fillStyle = c.mid;
      ctx.beginPath(); ctx.ellipse(tw_.x, pfY, tw * 0.05, th * 0.010, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c.lite; ctx.lineWidth = S * 0.5;
      ctx.beginPath();
      ctx.moveTo(tw_.x - tw * 0.048, pfY); ctx.lineTo(tw_.x - tw * 0.048, pfY - S * 3);
      ctx.lineTo(tw_.x + tw * 0.048, pfY - S * 3); ctx.lineTo(tw_.x + tw * 0.048, pfY);
      ctx.stroke();
      // Obstruction light on the rail
      const obX = tw_.x + (i ? -1 : 1) * tw * 0.048, obY = pfY - S * 3.6;
      const blink = on && (s ? Math.sin(t * 3.4 + i * 1.7) > 0.35 : Math.sin(t * 1.1 + i * 1.7) > 0.75);
      if (blink && lod) { ctx.fillStyle = 'rgba(255,70,60,0.30)'; dot(obX, obY, S * 3.6); }
      ctx.fillStyle = blink ? 'rgba(255,80,66,0.95)' : (on ? 'rgba(120,45,35,0.9)' : '#241010');
      dot(obX, obY, S * 1.3);
      // Slew ring and yoke
      const dishCy = pfY - S * 5;
      ctx.fillStyle = c.dark; ctx.fillRect(tw_.x - S * 3, dishCy, S * 6, S * 5);
      ctx.fillStyle = c.lite; ctx.fillRect(tw_.x - S * 4.2, dishCy + S * 3.2, S * 8.4, S * 1.4);
      ctx.strokeStyle = c.mid; ctx.lineWidth = S * 1.3;
      line(tw_.x - S * 3, dishCy + S * 2, tw_.x - S * 5.5, dishCy - S * 2);
      line(tw_.x + S * 3, dishCy + S * 2, tw_.x + S * 5.5, dishCy - S * 2);
      // The dish: each sweeps on its own phase while its slot runs
      const running = s && s.running;
      const tilt = running ? Math.sin(t * 0.8 + tw_.phase) * 0.55 : tw_.park;
      _drawSurveyDish(tw_.x, dishCy - S * 2, tw * 0.105, tilt, on, S, running ? s.color : null, lod, t);
    });

    // ── Core-drilling derrick (front left) ──────────────────────────
    // An A-frame mast over a borehole; the drill string turns while any
    // scan runs, and the cores come out into racked boxes beside it.
    const drX = X(0.12), drB = Y(0.90), drT = Y(0.68);
    shade(drX + S * 2, drB + S, tw * 0.07, th * 0.016, 0.3);
    ctx.fillStyle = c.dark; ctx.fillRect(drX - S * 6, drB - S * 2, S * 12, S * 2.4);   // drill floor
    ctx.strokeStyle = c.trim; ctx.lineWidth = S * 1.2;
    line(drX - S * 5, drB - S * 2, drX - S * 0.6, drT);
    line(drX + S * 5, drB - S * 2, drX + S * 0.6, drT);
    ctx.lineWidth = S * 0.6;
    line(drX - S * 3.6, drB - S * 2 - (drB - drT) * 0.33, drX + S * 3.6, drB - S * 2 - (drB - drT) * 0.33);
    line(drX - S * 2.2, drB - S * 2 - (drB - drT) * 0.66, drX + S * 2.2, drB - S * 2 - (drB - drT) * 0.66);
    ctx.fillStyle = c.mid; ctx.fillRect(drX - S * 2, drT - S * 1.6, S * 4, S * 2);       // crown block
    // Drill string with a rotating stripe
    ctx.fillStyle = c.lite; ctx.fillRect(drX - S * 0.7, drT, S * 1.4, drB - drT - S * 2);
    if (lod) {
      ctx.fillStyle = c.deep;
      const spin = anyRunning ? (t * 3) % 1 : 0.3;
      for (let y = drT + spin * S * 4; y < drB - S * 2; y += S * 4) ctx.fillRect(drX - S * 0.7, y, S * 1.4, S * 0.8);
    }
    // Racked core boxes
    for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
      const bx = X(0.20) + k * S * 5.4, by = Y(0.905) - r * S * 3;
      ctx.fillStyle = r ? '#7a5a34' : '#6a4c2a';
      if (!on) ctx.fillStyle = r ? '#3a2c1a' : '#2e2414';
      ctx.fillRect(bx, by - S * 2.6, S * 5, S * 2.6);
      if (lod) {
        ctx.fillStyle = on ? '#9c9480' : '#3a3630';
        for (let q = 0; q < 3; q++) ctx.fillRect(bx + S * 0.5, by - S * 2.2 + q * S * 0.8, S * 4, S * 0.4);
      }
    }

    // ── Genset and fuel tank (front right) ──────────────────────────
    const gnL = X(0.72), gnT = Y(0.80), gnW = tw * 0.14, gnH = th * 0.075;
    shade(gnL + gnW / 2 + S, gnT + gnH + S, gnW * 0.6, th * 0.014, 0.3);
    ctx.fillStyle = c.wallSh; ctx.beginPath(); ctx.roundRect(gnL, gnT, gnW, gnH, S); ctx.fill();
    ctx.fillStyle = c.wall;   ctx.fillRect(gnL, gnT, gnW, S * 1.2);
    if (lod) {   // louvres
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = S * 0.5;
      ctx.beginPath();
      for (let y = gnT + S * 2.4; y < gnT + gnH - S; y += S * 1.4) { ctx.moveTo(gnL + S * 1.5, y); ctx.lineTo(gnL + gnW * 0.55, y); }
      ctx.stroke();
    }
    ctx.fillStyle = c.trim; ctx.fillRect(gnL + gnW * 0.66, gnT + gnH * 0.35, gnW * 0.24, S * 1.2);
    const tkX = X(0.915), tkY = Y(0.86);
    ctx.fillStyle = c.mid;
    ctx.beginPath(); ctx.roundRect(tkX - S * 4, tkY - S * 5, S * 8, S * 6.5, S * 3); ctx.fill();
    ctx.fillStyle = c.lite; ctx.fillRect(tkX - S * 3, tkY - S * 4.4, S * 6, S * 0.9);

    // ── Control block ───────────────────────────────────────────────
    // Two storeys; the upper floor is offices (windows lit after dark), the
    // ground floor carries one big seismogram wall per dish so the player
    // can read both scans off the building at a glance.
    const cbL = X(0.31), cbR = X(0.69), cbT = Y(0.42), cbB = Y(0.76);
    const cbW = cbR - cbL, cbH = cbB - cbT;
    shade(cx + S * 2, cbB + S * 1.2, cbW * 0.56, th * 0.02, 0.34);
    const bg = ctx.createLinearGradient(cbL, 0, cbR, 0);
    bg.addColorStop(0, c.wallSh); bg.addColorStop(0.35, c.wall); bg.addColorStop(1, c.wallSh);
    ctx.fillStyle = bg; ctx.fillRect(cbL, cbT, cbW, cbH);
    // Roof parapet, HVAC and a comms radome
    ctx.fillStyle = c.mid; ctx.fillRect(cbL - S, cbT - S * 2, cbW + S * 2, S * 2.4);
    ctx.fillStyle = c.dark;
    ctx.fillRect(cbL + cbW * 0.08, cbT - S * 5, cbW * 0.18, S * 3);
    ctx.fillRect(cbL + cbW * 0.30, cbT - S * 4, cbW * 0.12, S * 2);
    if (lod) {   // HVAC fan, turning
      ctx.strokeStyle = c.lite; ctx.lineWidth = S * 0.5;
      const fx = cbL + cbW * 0.17, fy = cbT - S * 3.5, a = on ? t * 6 : 0.4;
      line(fx - Math.cos(a) * S * 1.6, fy - Math.sin(a) * S * 0.5, fx + Math.cos(a) * S * 1.6, fy + Math.sin(a) * S * 0.5);
    }
    const rdX = cbL + cbW * 0.74, rdY = cbT - S * 2;
    ctx.fillStyle = c.dark; ctx.fillRect(rdX - S * 1, rdY - S * 3, S * 2, S * 3);
    const rg = ctx.createRadialGradient(rdX - S * 1.5, rdY - S * 7, S, rdX, rdY - S * 5, S * 5);
    rg.addColorStop(0, on ? '#ffffff' : '#5a5a5a'); rg.addColorStop(1, on ? '#c8c8c0' : '#3a3a38');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(rdX, rdY - S * 4.5, S * 4.2, Math.PI, 0); ctx.lineTo(rdX + S * 4.2, rdY - S * 3); ctx.lineTo(rdX - S * 4.2, rdY - S * 3); ctx.closePath(); ctx.fill();
    // Upper-floor window band
    const wy = cbT + cbH * 0.10, wh = cbH * 0.20;
    for (let k = 0; k < 5; k++) {
      const wx = cbL + cbW * (0.06 + k * 0.185), ww = cbW * 0.15;
      const litW = on && (night ? (k * 7 + Math.floor(t * 0.05)) % 4 !== 0 : false);
      ctx.fillStyle = litW ? 'rgba(255,214,140,0.92)' : c.glass;
      ctx.fillRect(wx, wy, ww, wh);
      if (lod && !litW) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(wx, wy, ww * 0.35, wh); }
    }
    // Floor band + sign
    ctx.fillStyle = c.trim; ctx.fillRect(cbL, cbT + cbH * 0.36, cbW, S * 1.6);
    if (lod) {
      ctx.save();
      ctx.font = `bold ${Math.max(5, Math.round(S * 3.2))}px monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = on ? '#1a1206' : '#0c0904';
      ctx.fillText('SURVEY · MK2', cx, cbT + cbH * 0.36 + S * 0.85);
      ctx.restore();
    }
    // Two seismogram walls, one per dish, either side of the door
    const scrY = cbT + cbH * 0.48, scrH = cbH * 0.30, scrW = cbW * 0.34;
    [cbL + cbW * 0.05, cbR - cbW * 0.05 - scrW].forEach((sx, i) => {
      const s = slots[i];
      ctx.fillStyle = '#0c1210'; ctx.fillRect(sx, scrY, scrW, scrH);
      if (on && lod) {
        ctx.save();
        ctx.beginPath(); ctx.rect(sx, scrY, scrW, scrH); ctx.clip();
        ctx.strokeStyle = s ? _hexA(s.color, 0.95) : 'rgba(150,120,60,0.55)';
        ctx.lineWidth = S * 0.5;
        for (let r = 0; r < 3; r++) {
          const baseY = scrY + scrH * (0.22 + r * 0.28);
          ctx.beginPath();
          for (let k = 0; k <= 14; k++) {
            const xx = sx + (scrW * k) / 14;
            const amp = s ? scrH * 0.10 : scrH * 0.02;
            const yy = baseY + Math.sin(k * 1.9 + t * (s ? 5 + i : 0.6) + r * 2.1 + i) * amp;
            k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy);
          }
          ctx.stroke();
        }
        // Progress fill creeping along the bottom of the screen
        if (s) { ctx.fillStyle = _hexA(s.color, 0.55); ctx.fillRect(sx, scrY + scrH - S, scrW * s.pct, S); }
        ctx.restore();
      }
      ctx.strokeStyle = c.dark; ctx.lineWidth = S * 0.7; ctx.strokeRect(sx, scrY, scrW, scrH);
    });
    // Door with a lit transom
    const dW = cbW * 0.13, dX = cx - dW / 2, dY = cbT + cbH * 0.50;
    ctx.fillStyle = c.dark; ctx.fillRect(dX, dY, dW, cbB - dY);
    ctx.fillStyle = on ? `rgba(255,206,124,${night ? 0.9 : 0.5})` : 'rgba(16,14,10,0.85)';
    ctx.fillRect(dX + S * 0.6, dY + S * 0.6, dW - S * 1.2, S * 1.6);
    ctx.fillStyle = c.lamp; ctx.fillRect(dX + dW * 0.72, dY + (cbB - dY) * 0.5, S * 0.8, S * 0.8);
    ctx.fillStyle = c.mid; ctx.fillRect(dX - S * 1.4, cbB, dW + S * 2.8, S * 1.2);   // step

    // ── Geophone array along the front edge ─────────────────────────
    const gp = [0.06, 0.94].flatMap(f0 => [0, 1].map(k => [X(f0 + (f0 < 0.5 ? k : -k) * 0.05), Y(0.95)]));
    gp.forEach((p, i) => {
      ctx.fillStyle = c.mid;  ctx.fillRect(p[0] - S * 1.4, p[1] - S * 1.8, S * 2.8, S * 2);
      const lit = on && (anyRunning ? ((Math.floor(t * 6) % gp.length) === i) : Math.sin(t * 1.3 + i) > 0.6);
      ctx.fillStyle = lit ? c.lamp : (on ? '#3a2c18' : '#171208');
      dot(p[0], p[1] - S * 2.2, S * 0.7);
    });

    // ── Status: one strip per dish ──────────────────────────────────
    ctx.save();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.max(6, Math.round(S * 5.2))}px monospace`;
    [Y(0.835), Y(0.905)].forEach((sy, i) => {
      const s = slots[i];
      const bx = cx;
      if (s) {
        _drawSurveyBar(bx, sy, tw * 0.36, S, s.pct, s.color,
          `${'AB'[i]} ${s.kind ? s.kind.label.toUpperCase() : ''} ${Math.round(s.pct * 100)}%`);
      } else {
        const lbl = `${'AB'[i]} ${on ? 'READY' : 'OFFLINE'}`;
        ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillText(lbl, bx + S * 0.6, sy + S * 0.6);
        ctx.fillStyle = on ? '#ffb040' : '#6a5030'; ctx.fillText(lbl, bx, sy);
      }
    });
    ctx.restore();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';

    // Selection ring
    if (typeof InspectionPanel !== 'undefined' && InspectionPanel.isOpen() && InspectionPanel.target === e) {
      ctx.save();
      ctx.strokeStyle = '#ffb040'; ctx.lineWidth = 2/Camera.zoom;
      ctx.globalAlpha = 0.7 + 0.3*Math.sin(t*4);
      ctx.strokeRect(px+1, py+1, tw-2, th-2);
      ctx.restore();
    }
  }

// Coal Mine MK2 — a modern electrified colliery, deliberately unlike MK1's
// timber headframe and steam stack: a steel box headframe with twin
// counter-rotating sheaves and a skip running inside it, an enclosed
// conveyor gallery into a corrugated coal preparation plant, a stacker
// building a stockpile that grows and shrinks with the linked deposit, and
// a loadout silo filling hopper wagons on the rail spur. No smoke (it runs
// on grid power) — instead a transformer, dust at the stacker, a blinking
// aviation light and floodlights on the tower after dark. Drawn in its own
// w×h pixel space; `s` scales small details with the footprint (1 at 2×2).
function renderCoalMineMK2(e, px, py, t) {
    const w = (e.width  || 2) * TILE, h = (e.height || 2) * TILE;
    const s = w / 80;
    const on  = e.powered;
    const dep = e._linkedDeposit;
    const pct = dep && dep.coalMax > 0 ? (dep.coalAmount || 0) / dep.coalMax : 0;
    const out = e._coalRate || 0;
    const running = on && pct > 0;
    const hr    = DayNight.hour();
    const night = hr < 6.5 || hr >= 19.5;
    const S    = n => { const x = Math.sin(e.col * 127.1 + e.row * 311.7 + n * 74.3) * 43758.5; return x - Math.floor(x); };
    const dot  = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
    const line = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
    const X = f => px + w * f, Y = f => py + h * f;

    ctx.save();

    // ── Rail spur along the bottom ───────────────────────────────────
    const railY = py + h - TILE / 2;   // bottom-row centre — the OUT stub sits at the spur end
    ctx.fillStyle = '#221e1a'; ctx.fillRect(px + 2, railY - 4 * s, w - 4, 8 * s);
    ctx.strokeStyle = '#3a3430'; ctx.lineWidth = 1 * s;
    for (let x = px + 4 * s; x < px + w - 2; x += 4 * s) line(x, railY - 3.5 * s, x, railY + 3.5 * s);
    ctx.strokeStyle = '#8a8e94'; ctx.lineWidth = 0.9 * s;
    line(px + 2, railY - 2 * s, px + w - 2, railY - 2 * s);
    line(px + 2, railY + 2 * s, px + w - 2, railY + 2 * s);

    // ── Coal preparation plant (top-left) ────────────────────────────
    const pX = X(0.05), pY = Y(0.20), pW = w * 0.40, pH = h * 0.30;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(pX + 2 * s, pY + 2 * s, pW, pH);
    ctx.fillStyle = '#2e4454'; ctx.fillRect(pX, pY, pW, pH);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.6;
    for (let x = pX + 2.2 * s; x < pX + pW; x += 2.2 * s) line(x, pY + 3 * s, x, pY + pH);   // corrugations
    ctx.fillStyle = '#4a6272'; ctx.fillRect(pX - 1 * s, pY, pW + 2 * s, 3 * s);                 // roof edge
    ctx.fillStyle = '#3c5464'; ctx.fillRect(pX + pW * 0.2, pY - 3.5 * s, pW * 0.45, 3.5 * s);   // monitor roof
    ctx.fillStyle = running ? 'rgba(190,225,255,0.75)' : '#16222c';
    ctx.fillRect(pX + pW * 0.24, pY - 2.5 * s, pW * 0.37, 1.4 * s);
    for (let i = 0; i < 5; i++) {                                                               // window row
      ctx.fillStyle = running ? `rgba(200,230,255,${0.65 + 0.1 * Math.sin(t * 1.5 + i)})` : '#141e26';
      ctx.fillRect(pX + 2.5 * s + i * (pW - 5 * s) / 5, pY + pH * 0.3, 3.4 * s, 2.4 * s);
    }
    ctx.fillStyle = '#d06a20'; ctx.fillRect(pX, pY + pH * 0.6, pW, 1.6 * s);                    // safety band
    ctx.fillStyle = '#56606a'; ctx.fillRect(pX + pW * 0.08, pY + pH * 0.68, 8 * s, pH * 0.32);  // roller door
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.5;
    for (let y = pY + pH * 0.68 + 1.5 * s; y < pY + pH; y += 1.5 * s) line(pX + pW * 0.08, y, pX + pW * 0.08 + 8 * s, y);
    ctx.fillStyle = 'rgba(235,240,245,0.75)';
    ctx.font = `bold ${Math.max(4, Math.round(5 * s))}px monospace`; ctx.textAlign = 'center';
    ctx.fillText('MK2', pX + pW * 0.7, pY + pH * 0.94);
    ctx.textAlign = 'left';
    for (let i = 0; i < 2; i++) {                                                               // roof vents
      const vx = pX + pW * (0.78 + i * 0.12), vy = pY - 1 * s;
      ctx.fillStyle = '#5a6c7c'; ctx.fillRect(vx - 1.6 * s, vy - 2 * s, 3.2 * s, 3 * s);
      ctx.strokeStyle = '#9aaaba'; ctx.lineWidth = 0.5;
      const a = running ? t * 6 + i : 0.4;
      line(vx - Math.cos(a) * 1.3 * s, vy - 2 * s, vx + Math.cos(a) * 1.3 * s, vy - 2 * s);
    }

    // ── Transformer feeding the site ─────────────────────────────────
    const trX = X(0.34), trY = Y(0.70);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(trX + 1 * s, trY + 1 * s, 7 * s, 6 * s);
    ctx.fillStyle = '#4e5a48'; ctx.fillRect(trX, trY, 7 * s, 6 * s);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.5;
    for (let x = trX + 1.2 * s; x < trX + 7 * s; x += 1.2 * s) line(x, trY + 1 * s, x, trY + 6 * s);
    ctx.fillStyle = '#c8b890';
    for (let i = 0; i < 3; i++) ctx.fillRect(trX + 1 * s + i * 2.2 * s, trY - 2 * s, 0.9 * s, 2 * s);
    ctx.fillStyle = on ? (Math.sin(t * 3) > -0.6 ? '#40e060' : '#186028') : '#e03020';
    dot(trX + 6 * s, trY + 1.2 * s, 0.7 * s);

    // ── Loadout silo over the rails (bottom-left) ────────────────────
    const siX = X(0.18), siW = 14 * s, siTop = Y(0.50), siBot = Y(0.70);
    ctx.strokeStyle = '#4a525a'; ctx.lineWidth = 1.2 * s;
    line(siX - siW / 2 + 1 * s, siBot, siX - siW / 2 + 1 * s, railY - 5 * s);
    line(siX + siW / 2 - 1 * s, siBot, siX + siW / 2 - 1 * s, railY - 5 * s);
    const sg = ctx.createLinearGradient(siX - siW / 2, 0, siX + siW / 2, 0);
    sg.addColorStop(0, '#4c5660'); sg.addColorStop(0.45, '#8e9aa6'); sg.addColorStop(1, '#3a424a');
    ctx.fillStyle = sg; ctx.fillRect(siX - siW / 2, siTop, siW, siBot - siTop);
    ctx.fillStyle = '#9aa6b2';
    ctx.beginPath(); ctx.ellipse(siX, siTop, siW / 2, 2 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3e464e';
    ctx.beginPath();
    ctx.moveTo(siX - siW / 2, siBot); ctx.lineTo(siX + siW / 2, siBot);
    ctx.lineTo(siX + 2 * s, siBot + 5 * s); ctx.lineTo(siX - 2 * s, siBot + 5 * s);
    ctx.closePath(); ctx.fill();
    ctx.save();                                                                                 // hazard band
    ctx.beginPath(); ctx.rect(siX - siW / 2, siTop + 3 * s, siW, 2.2 * s); ctx.clip();
    for (let i = -1; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#141414' : '#e0b020';
      ctx.beginPath();
      const x0 = siX - siW / 2 + i * 3 * s;
      ctx.moveTo(x0, siTop + 5.2 * s); ctx.lineTo(x0 + 3 * s, siTop + 5.2 * s);
      ctx.lineTo(x0 + 5 * s, siTop + 3 * s); ctx.lineTo(x0 + 2 * s, siTop + 3 * s);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // ── Hopper wagon shuttling under the silo ────────────────────────
    ctx.save();
    ctx.beginPath(); ctx.rect(px + 2, py + 2, w - 4, h - 4); ctx.clip();
    const wgW = 18 * s;
    const wPh = running ? (t * 0.06 + S(1)) % 1 : 0.62;
    const wgC = px - wgW + wPh * (w + wgW * 2);
    const wgTop = railY - 9 * s, wgBot = railY - 2.5 * s;
    ctx.fillStyle = '#6a3a24';
    ctx.beginPath();
    ctx.moveTo(wgC - wgW / 2, wgTop); ctx.lineTo(wgC + wgW / 2, wgTop);
    ctx.lineTo(wgC + wgW / 2 - 2 * s, wgBot); ctx.lineTo(wgC - wgW / 2 + 2 * s, wgBot);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.6;
    for (let k = 1; k < 4; k++) line(wgC - wgW / 2 + k * wgW / 4, wgTop, wgC - wgW / 2 + k * wgW / 4, wgBot);
    if (wgC > siX && pct > 0) {
      ctx.fillStyle = '#0c0b0a';
      ctx.beginPath(); ctx.ellipse(wgC, wgTop, wgW * 0.42, 2 * s, 0, Math.PI, 0); ctx.fill();
    }
    ctx.fillStyle = '#26282a';
    dot(wgC - wgW * 0.3, railY - 2 * s, 1.6 * s); dot(wgC + wgW * 0.3, railY - 2 * s, 1.6 * s);
    if (running && Math.abs(wgC - siX) < 7 * s) {
      ctx.fillStyle = '#0a0a0a';
      for (let k = 0; k < 4; k++) {
        const f = (t * 2 + k / 4) % 1;
        ctx.fillRect(siX - 0.8 * s + (S(k + 9) - 0.5) * 2 * s, siBot + 5 * s + f * (wgTop - siBot - 5 * s), 1.4 * s, 1.4 * s);
      }
    }
    ctx.restore();

    // ── Stockpile — sized by what's left in the deposit ──────────────
    const pileX = X(0.64), pileB = railY - 5 * s;
    const pHalf = (6 + 9 * pct) * s, pHt = (3 + 9 * pct) * s, peakY = pileB - pHt;
    if (pct > 0) {
      ctx.fillStyle = '#0e0c0b';
      ctx.beginPath();
      ctx.moveTo(pileX - pHalf, pileB);
      ctx.quadraticCurveTo(pileX - pHalf * 0.35, peakY - 1 * s, pileX, peakY);
      ctx.quadraticCurveTo(pileX + pHalf * 0.35, peakY - 1 * s, pileX + pHalf, pileB);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(150,160,180,0.22)';
      for (let k = 0; k < 7; k++) {
        const u = S(k + 40) * 0.8;
        dot(pileX - (1 - u) * pHalf * 0.7 * S(k + 30), pileB - u * pHt, 0.6 * s);
      }
    }

    // ── Enclosed conveyor gallery: headframe → prep plant ────────────
    const tX = X(0.70), tW = w * 0.20, tTop = Y(0.10), tBot = Y(0.50);
    const gx1 = pX + pW - 1 * s, gy1 = pY + pH * 0.22, gx2 = tX + 1 * s, gy2 = Y(0.42);
    const gLen = Math.hypot(gx2 - gx1, gy2 - gy1), gAng = Math.atan2(gy2 - gy1, gx2 - gx1);
    ctx.strokeStyle = '#48586a'; ctx.lineWidth = 0.9 * s;
    const gmx = (gx1 + gx2) / 2, gmy = (gy1 + gy2) / 2;
    line(gmx, gmy + 3 * s, gmx - 1.5 * s, Y(0.62)); line(gmx, gmy + 3 * s, gmx + 1.5 * s, Y(0.62));
    ctx.save();
    ctx.translate(gx1, gy1); ctx.rotate(gAng);
    ctx.fillStyle = '#3c4e5e'; ctx.fillRect(0, -3 * s, gLen, 6 * s);
    ctx.fillStyle = '#56697c'; ctx.fillRect(0, -3 * s, gLen, 1 * s);
    ctx.fillStyle = '#10151a'; ctx.fillRect(1.5 * s, -0.8 * s, gLen - 3 * s, 2.2 * s);
    if (running) {
      ctx.fillStyle = '#2a2a2a';
      for (let k = 0; k < 4; k++) {
        const f = 1 - ((t * 0.5 + k / 4) % 1);
        ctx.fillRect(1.5 * s + f * (gLen - 5 * s), -0.2 * s, 1.8 * s, 1.2 * s);
      }
    }
    ctx.restore();

    // ── Floodlight wash from the tower after dark ────────────────────
    if (on && night && Camera.zoom > 0.5) {
      // Filled as a circle, not the footprint rect, so the wash fades out
      // softly instead of ending in a hard square edge.
      const flR = w * 0.45;
      const fl = ctx.createRadialGradient(tX + tW / 2, tBot, 0, tX + tW / 2, tBot, flR);
      fl.addColorStop(0, 'rgba(220,235,255,0.16)'); fl.addColorStop(1, 'rgba(220,235,255,0)');
      ctx.fillStyle = fl;
      ctx.beginPath(); ctx.arc(tX + tW / 2, tBot, flR, 0, Math.PI * 2); ctx.fill();
    }

    // ── Steel box headframe with a skip running inside ───────────────
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(tX + 2 * s, tBot - 2 * s, tW + 3 * s, 3 * s);
    ctx.fillStyle = 'rgba(40,52,64,0.55)'; ctx.fillRect(tX, tTop, tW, tBot - tTop);
    const skY = tTop + 3 * s + (running ? 0.5 - 0.5 * Math.cos(t * 0.9) : 0.85) * (tBot - tTop - 10 * s);
    ctx.strokeStyle = 'rgba(210,210,210,0.55)'; ctx.lineWidth = 0.5;
    line(tX + tW * 0.5, tTop, tX + tW * 0.5, skY);
    ctx.fillStyle = '#e0b020'; ctx.fillRect(tX + tW * 0.25, skY, tW * 0.5, 5 * s);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(tX + tW * 0.25, skY + 3.5 * s, tW * 0.5, 1.5 * s);
    ctx.strokeStyle = '#48586a'; ctx.lineWidth = 0.8 * s;
    const panels = 5, pnH = (tBot - tTop) / panels;
    for (let i = 0; i < panels; i++) {
      const y0 = tTop + i * pnH;
      line(tX, y0, tX + tW, y0 + pnH); line(tX + tW, y0, tX, y0 + pnH); line(tX, y0, tX + tW, y0);
    }
    ctx.strokeStyle = '#6a7c8e'; ctx.lineWidth = 1.6 * s;
    line(tX, tBot, tX, tTop); line(tX + tW, tBot, tX + tW, tTop);
    line(tX - 1 * s, tBot, tX + tW + 1 * s, tBot);
    // Floodlight heads on the tower
    ctx.fillStyle = on && night ? '#f4f8ff' : '#707a84';
    ctx.fillRect(tX - 2 * s, tTop + pnH * 2, 2 * s, 1.4 * s);
    ctx.fillRect(tX + tW, tTop + pnH * 2, 2 * s, 1.4 * s);

    // Machine house on top, with the twin sheaves in front of it
    const mhY = tTop - 7 * s;
    ctx.fillStyle = '#3a4a5a'; ctx.fillRect(tX - 2 * s, mhY, tW + 4 * s, 7 * s);
    ctx.fillStyle = '#56697c'; ctx.fillRect(tX - 2 * s, mhY, tW + 4 * s, 1.4 * s);
    const sheaveR = 4 * s, shY = mhY + 3.6 * s;
    [[tX + tW * 0.27, 1], [tX + tW * 0.73, -1]].forEach(([sx, d]) => {
      ctx.fillStyle = '#1c2228'; dot(sx, shY, sheaveR);
      ctx.strokeStyle = '#c8d0d8'; ctx.lineWidth = 0.9 * s;
      ctx.beginPath(); ctx.arc(sx, shY, sheaveR, 0, Math.PI * 2); ctx.stroke();
      const a0 = running ? t * 2.4 * d : 0;
      ctx.strokeStyle = '#8a96a2'; ctx.lineWidth = 0.6 * s;
      for (let k = 0; k < 4; k++) {
        const a = a0 + k * Math.PI / 4;
        line(sx - Math.cos(a) * sheaveR, shY - Math.sin(a) * sheaveR, sx + Math.cos(a) * sheaveR, shY + Math.sin(a) * sheaveR);
      }
      ctx.fillStyle = '#e0b020'; dot(sx, shY, 1 * s);
    });
    // Aviation warning light
    if (on) {
      const blink = (t % 1.4) < 0.25;
      ctx.fillStyle = blink ? '#ff3020' : '#501008';
      dot(tX + tW / 2, mhY - 0.4 * s, 1.1 * s);
      if (blink) { ctx.fillStyle = 'rgba(255,60,30,0.25)'; dot(tX + tW / 2, mhY - 0.4 * s, 3 * s); }
    }

    // ── Stacker boom from the headframe out over the stockpile ───────
    const bX1 = tX + tW * 0.5, bY1 = tBot - 2 * s;
    const headX = pileX + (running ? Math.sin(t * 0.3) * 3 * s : 0), headY = peakY - 5 * s;
    ctx.strokeStyle = '#8a7a3a'; ctx.lineWidth = 1 * s;
    line(bX1, bY1, headX, headY);
    line(bX1, bY1 + 2 * s, headX, headY + 1.5 * s);
    ctx.lineWidth = 0.5;
    for (let k = 1; k < 4; k++) {
      const f0 = (k - 1) / 3, f1 = k / 3;
      line(bX1 + (headX - bX1) * f0, bY1 + (headY - bY1) * f0,
           bX1 + (headX - bX1) * f1, bY1 + 2 * s + (headY + 1.5 * s - bY1 - 2 * s) * f1);
    }
    ctx.fillStyle = '#e0b020'; ctx.fillRect(headX - 1.4 * s, headY - 0.5 * s, 2.8 * s, 2.6 * s);
    if (running) {
      ctx.fillStyle = 'rgba(10,10,10,0.9)';
      for (let k = 0; k < 4; k++) {
        const f = (t * 1.6 + k / 4) % 1;
        ctx.fillRect(headX - 0.6 * s, headY + 2 * s + f * (peakY - headY - 2 * s), 1.2 * s, 1.5 * s);
      }
      for (let k = 0; k < 3; k++) {
        const f = (t * 0.4 + k / 3) % 1;
        ctx.fillStyle = `rgba(110,100,90,${0.35 * (1 - f)})`;
        dot(headX + (k - 1) * 3 * s * f, peakY - f * 6 * s, (1.5 + f * 3) * s);
      }
    }

    // ── Coal OUT stub at the end of the rail spur (bottom-right, fixed) ──
    _coalMineOutStub(e, px, py, w, h, t, running);

    // ── Status label ─────────────────────────────────────────────────
    ctx.fillStyle = running ? 'rgba(255,170,80,0.95)' : '#4a3a2a';
    ctx.font = `${Math.max(7, Math.round(9 / Camera.zoom))}px Courier New`;
    ctx.textAlign = 'center';
    ctx.fillText(running ? `${out.toFixed(1)} t/s` : (pct <= 0 ? 'EMPTY' : 'OFFLINE'), px + w * 0.25, py + h * 0.07);  // top-left, clear of the rail spur
    ctx.textAlign = 'left';

    ctx.restore();
}

function renderCoalMine(e, px, py, t) {
    if (e.type === T.COALMINE2) { renderCoalMineMK2(e, px, py, t); return; }
    // Coal Mine (MK1) — an old timber-headframe colliery built around its
    // seam. New mines stand a tile out from the deposit on every side (2×2
    // seam → 4×4 mine, 3×3 → 5×5; see _coalMineFootprint); mines built
    // before that keep their old exact-cover size and draw the same layout
    // fitted into it.
    // The shaft sits over the seam in a timber-lined collar, the headframe
    // straddling it and throwing its shadow across the yard: while the mine
    // runs the sheave spins and the cage rides up and down. A brick winding
    // house with an arched front and banded stack drives the hoist; coal
    // comes up a covered belt to the timber loading bin, drops into ore
    // carts, and the carts run the rail to the heap, which shrinks as the
    // deposit runs down. A plank lamp room, a stack of pit props and miners
    // with cap lamps round out the yard; the yard lamps, windows and the
    // headframe lamp come on after dark.
    // Laid out in fractions of the footprint; plain fills and a handful of
    // small gradients only.
    const w = (e.width  || 4) * TILE, h = (e.height || 4) * TILE;
    const on  = e.powered;
    const dep = e._linkedDeposit;
    const pct = dep && dep.coalMax > 0 ? (dep.coalAmount || 0) / dep.coalMax : 0;
    const out = e._coalRate || 0;
    const running = on && pct > 0;
    const s = Math.min(w, h) / 160;                                        // detail scale — 1 at 4×4
    const X = (f) => px + w*f, Y = (f) => py + h*f;
    const R = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(X(x), Y(y), w*ww, h*hh); };
    const RR = (x, y, ww, hh, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(X(x), Y(y), w*ww, h*hh, r*s); ctx.fill(); };
    const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), Math.max(0.01, r*s), 0, Math.PI*2); ctx.fill(); };
    const ell = (x, y, rx, ry, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(X(x), Y(y), Math.max(0.01, w*rx), Math.max(0.01, h*ry), 0, 0, Math.PI*2); ctx.fill(); };
    const ln = (x1, y1, x2, y2, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = lw*s; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    const poly = (pts, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(X(pts[0][0]), Y(pts[0][1])); for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1])); ctx.closePath(); ctx.fill(); };
    const shadow = (x, y, ww, hh) => R(x + 0.02, y + 0.025, ww, hh, 'rgba(0,0,0,0.3)');
    const S = (n) => { const v = Math.sin((e.col || 0) * 127.1 + (e.row || 0) * 311.7 + n * 74.3) * 43758.5; return v - Math.floor(v); };
    const dark  = typeof DayNight !== 'undefined' ? DayNight.darkness() : 0;
    const lamps = on && dark > 0.3;
    const glow = (x, y, r, rgb, a) => {
      const g = ctx.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r*s);
      g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g; ctx.fillRect(X(x) - r*s, Y(y) - r*s, r*s*2, r*s*2);
    };
    const lit = (a = 0.85) => on ? (dark > 0.3 ? `rgba(255,206,120,${a})` : 'rgba(170,190,200,0.85)') : '#1e1a16';

    ctx.save();

    // ── Yard: packed earth darkened with coal dust, ruts and puddles ──
    const yg = ctx.createRadialGradient(X(0.5), Y(0.55), 0, X(0.5), Y(0.55), Math.max(w, h)*0.7);
    yg.addColorStop(0, '#4a3e2e'); yg.addColorStop(1, '#2e271e');
    ctx.fillStyle = yg; ctx.beginPath(); ctx.roundRect(X(0.02), Y(0.02), w*0.96, h*0.96, 4*s); ctx.fill();
    for (let i = 0; i < 26; i++) ell(0.06 + S(i)*0.88, 0.06 + S(i + 9)*0.88, 0.012 + S(i + 3)*0.02, 0.008 + S(i + 5)*0.012, i % 3 ? 'rgba(20,16,12,0.35)' : 'rgba(120,100,70,0.25)');
    ln(0.30, 0.97, 0.36, 0.66, 'rgba(18,14,10,0.35)', 2.2);                   // cart ruts up to the collar
    ln(0.40, 0.97, 0.44, 0.66, 'rgba(18,14,10,0.35)', 2.2);
    ell(0.56, 0.70, 0.035, 0.012, 'rgba(70,90,110,0.55)');                    // puddles
    ell(0.12, 0.62, 0.025, 0.009, 'rgba(70,90,110,0.5)');
    for (let i = 0; i < 14; i++) {                                            // grass tufts at the fence
      const ex = S(i + 60) < 0.5, fx = ex ? (S(i + 61) < 0.5 ? 0.045 : 0.955) : 0.05 + S(i + 62)*0.9, fy = ex ? 0.08 + S(i + 63)*0.6 : (S(i + 64) < 0.5 ? 0.045 : 0.045);
      dot(fx, fy, 1.8, '#4e6a2e'); dot(fx + 0.008, fy - 0.004, 1.2, '#6a8a3a');
    }
    // post-and-rail fence, open where the rail leaves the yard
    ctx.strokeStyle = '#7a5e3c'; ctx.lineWidth = 0.9*s;
    ctx.beginPath();
    ctx.moveTo(X(0.03), Y(0.76)); ctx.lineTo(X(0.03), Y(0.03)); ctx.lineTo(X(0.97), Y(0.03)); ctx.lineTo(X(0.97), Y(0.76));
    ctx.moveTo(X(0.03), Y(0.88)); ctx.lineTo(X(0.03), Y(0.97)); ctx.lineTo(X(0.97), Y(0.97)); ctx.lineTo(X(0.97), Y(0.88));
    ctx.stroke();
    for (let k = 0; k <= 8; k++) { dot(0.03 + k*0.1175, 0.03, 1.3, '#5a4228'); dot(0.03 + k*0.1175, 0.97, 1.3, '#5a4228'); }
    for (let k = 1; k < 7; k++) { if (k*0.13 + 0.03 > 0.76 && k*0.13 + 0.03 < 0.88) continue; dot(0.03, 0.03 + k*0.13, 1.3, '#5a4228'); dot(0.97, 0.03 + k*0.13, 1.3, '#5a4228'); }

    // ── Rail across the bottom: sleepers, steel with a highlight ──
    for (let k = 0; k < 16; k++) R(0.045 + k*0.058, 0.785, 0.022, 0.085, '#3e2e1e');
    for (const ry of [0.80, 0.855]) { ln(0.03, ry, 0.97, ry, '#4a4a4a', 1.6); ln(0.03, ry - 0.004, 0.97, ry - 0.004, '#b8b0a0', 0.5); }

    // ── Coal heap by the rail, sized by what's left in the seam ──
    const hgt = 0.05 + 0.13*pct;
    poly([[0.58, 0.785], [0.66, 0.785 - hgt*0.55], [0.72, 0.785 - hgt*0.92], [0.78, 0.785 - hgt], [0.86, 0.785 - hgt*0.6], [0.95, 0.785]], '#141110');
    poly([[0.66, 0.785 - hgt*0.55], [0.72, 0.785 - hgt*0.92], [0.78, 0.785 - hgt], [0.74, 0.785]], '#221d19');   // lit face
    poly([[0.72, 0.785 - hgt*0.92], [0.78, 0.785 - hgt], [0.76, 0.785 - hgt*0.55]], '#2e2722');
    for (let g = 0; g < 9; g++) {
      const gx = 0.63 + S(g + 30)*0.3, gy = 0.785 - S(g + 40)*hgt*0.7;
      dot(gx, gy, 0.7, `rgba(190,200,215,${(0.35 + 0.4*Math.max(0, Math.sin(t*1.3 + g*2.1))).toFixed(3)})`);   // glints
    }

    // ── Lamp room (top left): plank walls, pitched roof, stovepipe ──
    shadow(0.06, 0.15, 0.22, 0.15);
    R(0.06, 0.15, 0.22, 0.15, '#7a6248');
    for (let k = 1; k < 7; k++) ln(0.06 + k*0.0314, 0.15, 0.06 + k*0.0314, 0.30, 'rgba(40,26,14,0.35)', 0.4);
    poly([[0.045, 0.155], [0.17, 0.075], [0.295, 0.155]], '#4a423c');
    poly([[0.17, 0.075], [0.295, 0.155], [0.17, 0.155]], '#38312c');
    ln(0.045, 0.155, 0.295, 0.155, '#2a2420', 0.8);
    R(0.15, 0.22, 0.045, 0.08, '#3a2a1c');
    dot(0.188, 0.262, 0.5, '#c8a050');
    for (const wx of [0.08, 0.215]) { R(wx, 0.19, 0.045, 0.045, lit()); ln(wx + 0.0225, 0.19, wx + 0.0225, 0.235, '#3a2a1c', 0.4); }
    R(0.235, 0.06, 0.016, 0.05, '#2a2622');                                   // stovepipe
    if (on) for (let q = 0; q < 3; q++) { const ph = (t*0.25 + q/3) % 1; dot(0.243 + ph*0.02, 0.055 - ph*0.06, 1.2 + ph*3, `rgba(150,140,130,${((1 - ph)*0.3).toFixed(3)})`); }
    if (lamps) { glow(0.17, 0.26, 26, '255,210,140', 0.22); dot(0.172, 0.21, 1.4, '#ffe2a0'); }

    // ── Pit props: a stack of logs showing end grain ──
    for (let k = 0; k < 7; k++) {
      const lx = 0.08 + (k % 4)*0.05 + Math.floor(k/4)*0.025, ly = 0.47 - Math.floor(k/4)*0.038;
      dot(lx + 0.004, ly + 0.006, 3.6, 'rgba(0,0,0,0.3)');
      dot(lx, ly, 3.6, '#a0784a'); dot(lx, ly, 2.4, '#c8a070'); dot(lx, ly, 1.1, '#8a6238');
    }

    // ── Winding house (top right): brick, arched windows, slate roof ──
    shadow(0.64, 0.17, 0.26, 0.20);
    R(0.64, 0.17, 0.26, 0.20, '#8a4630');
    for (let k = 1; k < 9; k++) ln(0.64, 0.17 + k*0.022, 0.90, 0.17 + k*0.022, 'rgba(40,16,10,0.22)', 0.35);
    R(0.64, 0.17, 0.26, 0.012, '#b8a888');                                    // stone string course
    poly([[0.625, 0.175], [0.77, 0.085], [0.915, 0.175]], '#4a4648');
    poly([[0.77, 0.085], [0.915, 0.175], [0.77, 0.175]], '#36333a');
    ln(0.625, 0.175, 0.915, 0.175, '#26242a', 0.9);
    for (let k = 0; k < 3; k++) {
      const wx = 0.665 + k*0.075;
      R(wx, 0.225, 0.045, 0.06, on ? (dark > 0.3 ? `rgba(255,190,90,${(0.6 + 0.15*Math.sin(t*2 + k)).toFixed(3)})` : 'rgba(150,170,180,0.8)') : '#1e1a16');
      ctx.fillStyle = on ? (dark > 0.3 ? 'rgba(255,190,90,0.7)' : 'rgba(150,170,180,0.8)') : '#1e1a16';
      ctx.beginPath(); ctx.ellipse(X(wx + 0.0225), Y(0.225), w*0.0225, h*0.02, 0, Math.PI, 0); ctx.fill();
      ln(wx, 0.226, wx + 0.045, 0.226, '#c8b898', 0.4);
    }
    R(0.755, 0.30, 0.04, 0.07, '#3a2616');
    if (lamps) glow(0.74, 0.26, 30, '255,190,100', 0.18);
    // banded stack
    R(0.905, 0.02, 0.05, 0.35, '#6a3a2a');
    R(0.905, 0.02, 0.016, 0.35, 'rgba(255,255,255,0.08)');
    for (let k = 1; k < 4; k++) R(0.905, 0.02 + k*0.085, 0.05, 0.01, '#3e2418');
    R(0.9, 0.015, 0.06, 0.016, '#3a2418');
    if (running) for (let q = 0; q < 5; q++) {
      const ph = (t*0.3 + q/5) % 1;
      dot(0.93 + ph*0.04 + Math.sin(t + q)*0.012, 0.015 - ph*0.13, 2 + ph*7, `rgba(${dark > 0.3 ? '70,64,60' : '96,88,80'},${((1 - ph)*0.45).toFixed(3)})`);
    }

    // ── Headframe shadow across the yard ──
    poly([[0.38, 0.63], [0.62, 0.63], [0.80, 0.52], [0.66, 0.50]], 'rgba(0,0,0,0.16)');

    // ── Shaft collar: timber-lined, depth shading, safety rail ──
    RR(0.33, 0.40, 0.34, 0.25, 2, '#5a4430');
    for (let k = 0; k < 6; k++) ln(0.33, 0.41 + k*0.04, 0.67, 0.41 + k*0.04, 'rgba(30,20,12,0.35)', 0.4);   // planking
    const sg = ctx.createLinearGradient(0, Y(0.47), 0, Y(0.60));
    sg.addColorStop(0, '#000'); sg.addColorStop(1, '#1a1410');
    ctx.fillStyle = sg; ctx.fillRect(X(0.41), Y(0.47), w*0.18, h*0.13);
    ctx.strokeStyle = '#8a6a40'; ctx.lineWidth = 1.6*s; ctx.strokeRect(X(0.41), Y(0.47), w*0.18, h*0.13);
    ln(0.40, 0.455, 0.60, 0.455, '#c8b070', 0.6);                             // rail
    for (const rx of [0.40, 0.50, 0.60]) ln(rx, 0.455, rx, 0.47, '#c8b070', 0.6);
    if (running) glow(0.50, 0.55, 18, '255,200,120', 0.12);                   // lamps down the shaft

    // ── Covered belt from the collar up to the loading bin ──
    ln(0.43, 0.565, 0.27, 0.59, '#2a2018', 4.2);
    ln(0.43, 0.555, 0.27, 0.58, '#6a5a44', 1.4);                              // gallery roof edge
    for (let k = 0; k < 5; k++) { const f = k/4; dot(0.43 - f*0.16, 0.567 + f*0.025, 0.9, '#5a4a38'); }   // rollers
    if (running) for (let k = 0; k < 4; k++) { const f = (t*0.5 + k/4) % 1; dot(0.43 - f*0.16, 0.565 + f*0.025, 1.5, '#0e0c0a'); }

    // ── Timber loading bin on legs, chute to the carts ──
    for (const lx of [0.15, 0.27]) { ln(lx, 0.66, lx, 0.75, '#5a4226', 1.6); ln(lx + 0.004, 0.66, lx + 0.004, 0.75, 'rgba(255,220,160,0.15)', 0.4); }
    ln(0.15, 0.70, 0.27, 0.74, '#4a3620', 0.8); ln(0.27, 0.70, 0.15, 0.74, '#4a3620', 0.8);
    R(0.135, 0.58, 0.15, 0.08, '#6a5038');
    for (let k = 1; k < 4; k++) ln(0.135, 0.58 + k*0.02, 0.285, 0.58 + k*0.02, 'rgba(30,20,10,0.35)', 0.4);
    R(0.135, 0.58, 0.15, 0.01, '#8a6c4a');
    poly([[0.135, 0.66], [0.285, 0.66], [0.235, 0.705], [0.185, 0.705]], '#4a3826');
    if (running) for (let k = 0; k < 3; k++) { const f = (t*1.6 + k/3) % 1; dot(0.21, 0.705 + f*0.04, 1.3, '#0e0c0a'); }

    // ── Ore carts between the bin and the heap ──
    for (let i = 0; i < 2; i++) {
      const p = running ? (t*0.10 + i*0.5) % 1 : 0.2 + i*0.45;
      const toPile = p < 0.5, pos = toPile ? p*2 : 2 - p*2;
      const cx0 = 0.14 + pos*0.56;
      R(cx0 + 0.012, 0.758, 0.10, 0.045, 'rgba(0,0,0,0.3)');
      poly([[cx0, 0.745], [cx0 + 0.10, 0.745], [cx0 + 0.09, 0.795], [cx0 + 0.01, 0.795]], '#5a4a36');
      ln(cx0, 0.745, cx0 + 0.10, 0.745, '#8a7a60', 0.9);
      ln(cx0 + 0.05, 0.75, cx0 + 0.05, 0.79, 'rgba(30,24,16,0.5)', 0.5);
      if (running ? toPile : i === 0) {
        ctx.fillStyle = '#121010'; ctx.beginPath();
        ctx.ellipse(X(cx0 + 0.05), Y(0.745), w*0.042, h*0.018, 0, Math.PI, 0); ctx.fill();
        dot(cx0 + 0.04, 0.737, 0.6, 'rgba(190,200,215,0.6)'); dot(cx0 + 0.065, 0.74, 0.5, 'rgba(190,200,215,0.5)');
      }
      dot(cx0 + 0.025, 0.80, 2.6, '#1e1a16'); dot(cx0 + 0.075, 0.80, 2.6, '#1e1a16');
      dot(cx0 + 0.025, 0.80, 0.9, '#6a6458'); dot(cx0 + 0.075, 0.80, 0.9, '#6a6458');
    }

    // ── Timber headframe straddling the shaft ──
    ln(0.50, 0.085, 0.70, 0.24, 'rgba(170,150,110,0.85)', 0.6);              // hoist rope to the winding house
    ln(0.50, 0.12, 0.66, 0.30, '#5a4226', 1.8);                               // back-stay strut
    ln(0.40, 0.62, 0.50, 0.13, '#4a3620', 1.8);                               // back legs, in shade
    ln(0.60, 0.62, 0.50, 0.13, '#4a3620', 1.8);
    ln(0.35, 0.645, 0.50, 0.10, '#6a4c2c', 3.4);                              // front legs
    ln(0.65, 0.645, 0.50, 0.10, '#6a4c2c', 3.4);
    ln(0.348, 0.640, 0.498, 0.10, '#a07c4c', 1.0);                            // lit edge on the front legs
    ln(0.648, 0.640, 0.498, 0.10, 'rgba(160,124,76,0.5)', 0.8);
    for (const [x, y] of [[0.35, 0.645], [0.65, 0.645]]) R(x - 0.02, y - 0.006, 0.04, 0.016, '#7a7068');   // stone footings
    const legHW = (y) => 0.15*(y - 0.10)/0.54;
    for (const by of [0.26, 0.38, 0.50]) ln(0.50 - legHW(by), by, 0.50 + legHW(by), by, '#7a5a34', 1.4);
    ln(0.50 - legHW(0.26), 0.26, 0.50 + legHW(0.38), 0.38, '#5a4226', 0.9);
    ln(0.50 + legHW(0.26), 0.26, 0.50 - legHW(0.38), 0.38, '#5a4226', 0.9);
    ln(0.50 - legHW(0.38), 0.38, 0.50 + legHW(0.50), 0.50, '#5a4226', 0.9);
    ln(0.50 + legHW(0.38), 0.38, 0.50 - legHW(0.50), 0.50, '#5a4226', 0.9);
    R(0.445, 0.098, 0.11, 0.022, '#5a4226');                                  // sheave platform
    ln(0.445, 0.098, 0.555, 0.098, '#a07c4c', 0.6);
    const cageY = running ? 0.20 + 0.24*(0.5 + 0.5*Math.sin(t*0.6)) : 0.44;
    ln(0.508, 0.10, 0.508, cageY, 'rgba(200,180,130,0.9)', 0.55);
    R(0.49, cageY, 0.036, 0.04, '#9a8a64');
    ln(0.49, cageY + 0.02, 0.526, cageY + 0.02, '#5a4a30', 0.5);
    {
      const wr = 9.5, ang = running ? t*2.2 : 0, wx = X(0.50), wy = Y(0.082);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.arc(wx + 1.5*s, wy + 2*s, wr*s, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#6a5030'; ctx.lineWidth = 2.6*s;
      ctx.beginPath(); ctx.arc(wx, wy, wr*s, 0, Math.PI*2); ctx.stroke();
      ctx.strokeStyle = '#c8a060'; ctx.lineWidth = 0.8*s;
      ctx.beginPath(); ctx.arc(wx, wy, wr*s, Math.PI*1.1, Math.PI*1.7); ctx.stroke();
      ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = 0.9*s;
      for (let k = 0; k < 8; k++) {
        const a = ang + k*Math.PI/4;
        ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(a)*wr*s, wy + Math.sin(a)*wr*s); ctx.stroke();
      }
      dot(0.50, 0.082, 2, '#3a2a18'); dot(0.50, 0.082, 0.8, '#c8a060');
    }
    // headframe lamp
    dot(0.555, 0.11, 1.2, lamps ? '#ffe6a8' : '#4a4038');
    if (lamps) glow(0.555, 0.11, 18, '255,220,150', 0.3);

    // ── Miners with cap lamps, lamp room ↔ shaft ──
    if (running) for (let m = 0; m < 3; m++) {
      const p = (t*0.05 + m/3) % 1, f = p < 0.5 ? p*2 : 2 - p*2;
      const mx = 0.17 + f*0.27, my = 0.31 + f*0.30;
      ell(mx + 0.004, my + 0.002, 0.012, 0.005, 'rgba(0,0,0,0.3)');
      R(mx - 0.009, my - 0.026, 0.018, 0.024, '#2e3440');
      dot(mx, my - 0.031, 1.7, '#e8c8a0');
      dot(mx, my - 0.038, 1.3, '#f0c020');
      dot(mx + 0.006, my - 0.038, 0.8, '#fff6c0');
      if (lamps) glow(mx + 0.01, my - 0.035, 8, '255,240,190', 0.35);
    }

    // ── Yard lamps after dark ──
    for (const lx of [0.33, 0.62]) {
      ln(lx, 0.70, lx, 0.62, '#4a4440', 0.9);
      dot(lx, 0.62, 1.4, lamps ? '#ffe6a8' : '#5a5048');
      if (lamps) glow(lx, 0.64, 34, '255,220,150', 0.18);
    }

    // ── Coal OUT stub (rotates with the mine) ──
    _coalMineOutStub(e, px, py, w, h, t, running);

    // ── Status label (not on the placement ghost) ──
    // Kept clear of the output stub: a yard mine's port is at a bottom
    // corner, so bottom-centre is free; an older exact-cover mine's port can
    // be at the centre of any face, so its label sits bottom-left instead.
    if (!e._ghost) {
      ctx.fillStyle = running ? 'rgba(255,150,60,0.9)' : '#8a6a48';
      ctx.font = `${Math.max(7, Math.round(9 / Camera.zoom))}px Courier New`;
      ctx.textAlign = 'center';
      const labelX = CoalSystem.isYardMine(e) ? 0.5 : 0.26;
      ctx.fillText(running ? `${out.toFixed(1)} t/s` : (pct <= 0 ? 'EMPTY' : 'OFFLINE'), px + w * labelX, py + h - 5);
      ctx.textAlign = 'left';
    }

    ctx.restore();
  }

// ── Uranium Mine (4×5) ──
// Steel headframe straddling a glowing shaft collar — sheave wheels spin and
// the cage rides up and down while powered. A winding house with a turning
// drum feeds the hoist cables; a lead-shielded ore silo, a yellowcake drum
// yard, a Geiger mast pulsing detection rings, and ore carts shuttling on a
// rail across the bottom. Shares the _wf* drawing helpers with the waste
// facilities (render_hydro_coal.js). No backdrop — terrain shows through.
function renderUraniumMine(e, px, py, t) {
  const w = (e.width  || 4) * TILE;
  const h = (e.height || 5) * TILE;
  const S = TILE / 40;
  const on = e.powered;
  const accent = '#7cff70';
  ctx.save();

  // ── Ore cart rail (bottom) ──
  // Runs out to the footprint edge on the OUT-stub side (where the ore is
  // handed to the belt) and ends at a hazard buffer on the other side.
  const _uPortRight = ((e._rotation || 0) % 2) === 0;
  const railY = py + h*0.90;
  const rx0 = _uPortRight ? px + w*0.06 : px;
  const rx1 = _uPortRight ? px + w : px + w*0.94;
  ctx.strokeStyle = '#2a2620'; ctx.lineWidth = 9*S;
  ctx.beginPath(); ctx.moveTo(rx0, railY); ctx.lineTo(rx1, railY); ctx.stroke();
  ctx.strokeStyle = '#5a4a30'; ctx.lineWidth = 1.2*S;
  for (let x = rx0 + 3*S; x < rx1; x += 7*S) { ctx.beginPath(); ctx.moveTo(x, railY - 4*S); ctx.lineTo(x, railY + 4*S); ctx.stroke(); }
  ctx.strokeStyle = '#9a9a90'; ctx.lineWidth = 1.2*S;
  [-2.5, 2.5].forEach(o => { ctx.beginPath(); ctx.moveTo(rx0, railY + o*S); ctx.lineTo(rx1, railY + o*S); ctx.stroke(); });
  _wfHazardStripe(_uPortRight ? rx0 : rx1 - 4*S, railY - 6*S, 4*S, 12*S, S);

  // ── Shaft collar ──
  const colX = px + w*0.40, colTop = py + h*0.42;
  const cw = w*0.34, ch = h*0.15;
  _wfShadow(colX - cw/2, colTop, cw, ch, S, 3*S);
  ctx.fillStyle = '#5a5850'; ctx.strokeStyle = '#2a2824'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.roundRect(colX - cw/2, colTop, cw, ch, 3*S); ctx.fill(); ctx.stroke();
  const ox = colX - cw*0.34, oy = colTop + ch*0.18, ow = cw*0.68, oh = ch*0.64;
  ctx.fillStyle = '#030805';
  ctx.fillRect(ox, oy, ow, oh);
  if (on) {
    const gg = ctx.createRadialGradient(colX, oy + oh/2, 1, colX, oy + oh/2, ow*0.6);
    gg.addColorStop(0, `rgba(140,255,120,${0.75 + 0.2*Math.sin(t*2.4)})`); gg.addColorStop(1, 'rgba(40,120,40,0)');
    ctx.fillStyle = gg; ctx.fillRect(ox, oy, ow, oh);
  }
  // cage — shrinks as it descends, grows as it rises
  const depth = on ? 0.5 + 0.5*Math.sin(t*0.9) : 0;
  const cs = 1 - depth*0.55;
  const cgw = ow*0.62*cs, cgh = oh*0.72*cs;
  ctx.globalAlpha = 1 - depth*0.5;
  ctx.fillStyle = '#8a8a7a'; ctx.strokeStyle = '#2a2a24'; ctx.lineWidth = S;
  ctx.fillRect(colX - cgw/2, oy + oh/2 - cgh/2, cgw, cgh); ctx.strokeRect(colX - cgw/2, oy + oh/2 - cgh/2, cgw, cgh);
  ctx.strokeStyle = '#4a4a40';
  ctx.beginPath(); ctx.moveTo(colX - cgw/2, oy + oh/2); ctx.lineTo(colX + cgw/2, oy + oh/2); ctx.stroke();
  ctx.globalAlpha = 1;
  _wfHazardStripe(colX - cw/2, colTop + ch - 4*S, cw, 4*S, S);

  // ── Winding house ──
  const hx = px + w*0.04, hy = py + h*0.62, hw = w*0.40, hh = h*0.20;
  _wfShadow(hx, hy, hw, hh, S, 3*S);
  const rg = ctx.createLinearGradient(0, hy, 0, hy + hh*0.6);
  rg.addColorStop(0, '#6a7068'); rg.addColorStop(1, '#3a403a');
  ctx.fillStyle = rg; ctx.strokeStyle = '#262a26'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.roundRect(hx, hy, hw, hh*0.6, 2*S); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = S;
  for (let k = 1; k < 5; k++) { const lx = hx + hw*k/5; ctx.beginPath(); ctx.moveTo(lx, hy + 2*S); ctx.lineTo(lx, hy + hh*0.6 - 2*S); ctx.stroke(); }
  ctx.fillStyle = '#20241f'; ctx.fillRect(hx, hy + hh*0.6, hw, hh*0.4);
  ctx.strokeStyle = '#3a4038'; ctx.strokeRect(hx, hy + hh*0.6, hw, hh*0.4);
  // drum window
  const dwx = hx + hw*0.14, dwy = hy + hh*0.66, dww = hw*0.56, dwh = hh*0.28;
  ctx.fillStyle = on ? 'rgba(255,200,110,0.35)' : '#101210'; ctx.fillRect(dwx, dwy, dww, dwh);
  ctx.save(); ctx.beginPath(); ctx.rect(dwx, dwy, dww, dwh); ctx.clip();
  ctx.fillStyle = '#6a5a3a'; ctx.fillRect(dwx + 3*S, dwy + dwh*0.2, dww - 6*S, dwh*0.6);
  ctx.strokeStyle = '#2a2014'; ctx.lineWidth = 1.2*S;
  const doff = on ? (t*14*S) % (4*S) : 0;
  for (let x = dwx + doff; x < dwx + dww; x += 4*S) { ctx.beginPath(); ctx.moveTo(x, dwy + dwh*0.2); ctx.lineTo(x + 2*S, dwy + dwh*0.8); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = '#0e100e'; ctx.lineWidth = S; ctx.strokeRect(dwx, dwy, dww, dwh);
  ctx.fillStyle = on ? (Math.sin(t*3) > 0 ? '#ffb030' : '#6a4a18') : '#2a2418';
  ctx.beginPath(); ctx.arc(hx + hw*0.86, hy + hh*0.8, 2.5*S, 0, Math.PI*2); ctx.fill();

  // ── Headframe ──
  const topY = py + h*0.12;
  const legL = colX - cw*0.44, legR = colX + cw*0.44, legBase = colTop + ch*0.5;
  const topL = colX - 7*S, topR = colX + 7*S;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 4*S;
  ctx.beginPath(); ctx.moveTo(legL + 6*S, legBase + 6*S); ctx.lineTo(topL + 6*S, topY + 6*S); ctx.moveTo(legR + 6*S, legBase + 6*S); ctx.lineTo(topR + 6*S, topY + 6*S); ctx.stroke();
  ctx.strokeStyle = '#b04a28'; ctx.lineWidth = 3*S; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(legL, legBase); ctx.lineTo(topL, topY); ctx.moveTo(legR, legBase); ctx.lineTo(topR, topY); ctx.stroke();
  ctx.strokeStyle = '#8a3a20'; ctx.lineWidth = 1.2*S;
  ctx.beginPath();
  const braces = 4;
  for (let k = 0; k < braces; k++) {
    const f0 = k/braces, f1 = (k + 1)/braces;
    const y0 = legBase + (topY - legBase)*f0, y1 = legBase + (topY - legBase)*f1;
    const l0 = legL + (topL - legL)*f0, r0 = legR + (topR - legR)*f0;
    const l1 = legL + (topL - legL)*f1, r1 = legR + (topR - legR)*f1;
    ctx.moveTo(l0, y0); ctx.lineTo(r1, y1); ctx.moveTo(r0, y0); ctx.lineTo(l1, y1);
    ctx.moveTo(l1, y1); ctx.lineTo(r1, y1);
  }
  ctx.stroke();
  // back-stay down toward the winding house
  ctx.strokeStyle = '#b04a28'; ctx.lineWidth = 2.5*S;
  ctx.beginPath(); ctx.moveTo(topL, topY + 4*S); ctx.lineTo(hx + hw*0.78, hy + 2*S); ctx.stroke();
  // hoist cables — drum up to the sheaves
  ctx.strokeStyle = '#1a1a18'; ctx.lineWidth = 0.9*S;
  [-3, 3].forEach(o => { ctx.beginPath(); ctx.moveTo(hx + hw*0.42 + o*S, hy + hh*0.3); ctx.lineTo(colX + o*S, topY); ctx.lineTo(colX + o*S, oy + oh/2); ctx.stroke(); });
  // sheave wheels
  ctx.fillStyle = '#3a3630'; ctx.fillRect(topL - 3*S, topY - 3*S, (topR - topL) + 6*S, 6*S);
  [-1, 1].forEach((sd, i) => {
    const sx = colX + sd*5*S, sy = topY - 4*S, sr = 6.5*S;
    ctx.fillStyle = '#1a1a18'; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#c8c0a8'; ctx.lineWidth = 1.4*S; ctx.stroke();
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(on ? t*3*(i ? -1 : 1) : 0.3);
    ctx.lineWidth = S;
    for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI/3); ctx.beginPath(); ctx.moveTo(-sr*0.85, 0); ctx.lineTo(sr*0.85, 0); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = '#c8c0a8'; ctx.beginPath(); ctx.arc(sx, sy, 1.5*S, 0, Math.PI*2); ctx.fill();
  });

  // ── Shielded ore silo ──
  const sx = px + w*0.80, sy = py + h*0.24, sr = w*0.13;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(sx + 5*S, sy + 6*S, sr, 0, Math.PI*2); ctx.fill();
  const sg = ctx.createRadialGradient(sx - sr*0.4, sy - sr*0.4, sr*0.1, sx, sy, sr);
  sg.addColorStop(0, '#9aa294'); sg.addColorStop(0.6, '#55604e'); sg.addColorStop(1, '#262c22');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.arc(sx, sy, sr*0.7, 0, Math.PI*2); ctx.stroke();
  for (let k = 0; k < 8; k++) { const a = k*Math.PI/4; ctx.beginPath(); ctx.moveTo(sx + Math.cos(a)*sr*0.7, sy + Math.sin(a)*sr*0.7); ctx.lineTo(sx + Math.cos(a)*sr, sy + Math.sin(a)*sr); ctx.stroke(); }
  _wfTrefoil(sx, sy, sr*0.5, '#e8c820', '#1a1608');
  if (on) {
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.35 + 0.25*Math.sin(t*2); ctx.lineWidth = 1.5*S;
    ctx.beginPath(); ctx.arc(sx, sy, sr + 2*S, 0, Math.PI*2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  // chute from silo down to the rail
  _wfPipe([[sx, sy + sr], [sx, py + h*0.56], [px + w*0.72, py + h*0.56]], S, t, on, accent);

  // ── Yellowcake drum yard ──
  const drums = [[0.60, 0.68], [0.71, 0.68], [0.60, 0.79], [0.71, 0.79], [0.655, 0.735]];
  drums.forEach(([fx, fy], i) => {
    const dx = px + w*fx, dy = py + h*fy, dr = 5.5*S;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.arc(dx + 2.5*S, dy + 3*S, dr, 0, Math.PI*2); ctx.fill();
    const dgr = ctx.createRadialGradient(dx - dr*0.4, dy - dr*0.4, 0.5, dx, dy, dr);
    dgr.addColorStop(0, '#fff07a'); dgr.addColorStop(0.6, '#e0b020'); dgr.addColorStop(1, '#7a5a08');
    ctx.fillStyle = dgr; ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#1a1406'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.arc(dx, dy, dr*0.62, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = '#2a2008'; ctx.beginPath(); ctx.arc(dx + dr*0.3, dy - dr*0.3, 0.9*S, 0, Math.PI*2); ctx.fill();
    if (i === 4) { ctx.fillStyle = '#1a1406'; ctx.font = `bold ${Math.max(4, 4.5*S)}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('U', dx, dy + 0.5*S); ctx.textBaseline = 'alphabetic'; }
  });

  // ── Geiger mast ──
  const gx = px + w*0.90, gBase = py + h*0.80, gTop = py + h*0.54;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3*S;
  ctx.beginPath(); ctx.moveTo(gx + 4*S, gBase + 3*S); ctx.lineTo(gx + 4*S, gTop + 5*S); ctx.stroke();
  ctx.strokeStyle = '#a8aca0'; ctx.lineWidth = 2*S;
  ctx.beginPath(); ctx.moveTo(gx, gBase); ctx.lineTo(gx, gTop); ctx.stroke();
  ctx.fillStyle = '#3a3e36'; ctx.fillRect(gx - 4*S, gBase - 3*S, 8*S, 6*S);
  if (on) {
    for (let k = 0; k < 2; k++) {
      const ph = (t*0.7 + k*0.5) % 1;
      ctx.strokeStyle = `rgba(124,255,112,${0.6*(1 - ph)})`; ctx.lineWidth = 1.2*S;
      ctx.beginPath(); ctx.arc(gx, gTop, (3 + ph*16)*S, 0, Math.PI*2); ctx.stroke();
    }
  }
  const click = on && ((t*5) % 1) < 0.3;
  ctx.fillStyle = click ? '#c0ff90' : (on ? '#3a8a30' : '#2a3a24');
  ctx.beginPath(); ctx.arc(gx, gTop, 2.5*S, 0, Math.PI*2); ctx.fill();

  // ── Ore carts ── (shuttle along the track, stopping short of the
  // discharge housing at the OUT-stub end)
  const cartX0 = _uPortRight ? rx0 : rx0 + 26*S, cartX1 = _uPortRight ? rx1 - 26*S : rx1;
  const trackLen = Math.max(0, cartX1 - cartX0 - 22*S);
  [0, 0.5].forEach(off => {
    const ph = on ? ((t*0.08 + off) % 1) : off*0.6 + 0.15;
    const tri = ph < 0.5 ? ph*2 : 2 - ph*2;
    const cx = cartX0 + 11*S + tri*trackLen;
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(cx - 9*S + 3*S, railY - 6*S + 4*S, 18*S, 12*S);
    ctx.fillStyle = '#4a4238'; ctx.strokeStyle = '#1a1612'; ctx.lineWidth = S;
    ctx.fillRect(cx - 9*S, railY - 6*S, 18*S, 12*S); ctx.strokeRect(cx - 9*S, railY - 6*S, 18*S, 12*S);
    ctx.fillStyle = '#1a2a16'; ctx.fillRect(cx - 7*S, railY - 4*S, 14*S, 8*S);
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = on ? `rgba(140,255,110,${0.55 + 0.35*Math.sin(t*3 + k + off*9)})` : '#3a6a30';
      ctx.beginPath(); ctx.arc(cx - 4.5*S + k*2.3*S, railY - 1*S + ((k*7) % 3 - 1)*S, 1.6*S, 0, Math.PI*2); ctx.fill();
    }
  });

  _wfPlate('URANIUM MINE', px + w*0.64, py + h*0.035, S, accent, on);
  _wfLamp(px + w - 7*S, py + 7*S, S, t, accent, on);

  // ── OUT stub: discharge housing + belt lip at the end of the rail ──
  // Same art as the Coal Mine's rail-yard stub; the tile comes from
  // UraniumSystem.outputPort, so drawing and simulation always agree.
  if (typeof UraniumSystem !== 'undefined') {
    const _dry = e._linkedDeposit && typeof isDepositExhausted === 'function' && isDepositExhausted(e._linkedDeposit);
    _coalMineOutStub(e, px, py, w, h, t, on && !_dry, null, UraniumSystem.outputPort(e));
  }
  ctx.restore();
}

// ── Sulfur Mine (4×5) ──
// Frasch process: a boiler house drives superheated steam down two wellheads,
// molten sulfur comes back up a glowing line and pours into a solidifying
// vat, where it cools into a bright yellow crystalline block. Cut blocks are
// stacked at the bottom, a vent burns with sulfur's signature blue flame, and
// a yellow haze drifts over the vat while powered.
// The MK2 (T.SULFURMINE2) has its own, bigger plant: renderSulfurMine2.
function renderSulfurMine(e, px, py, t) {
  if (e.type === T.SULFURMINE2) return renderSulfurMine2(e, px, py, t);
  const w = (e.width  || 4) * TILE;
  const h = (e.height || 5) * TILE;
  const S = TILE / 40;
  const on = e.powered;
  const accent = '#ffd83a';
  ctx.save();

  // ── Steam main + molten sulfur line (under the equipment) ──
  const bx = px + w*0.05, by = py + h*0.09, bw = w*0.40, bh = h*0.24;
  const w1x = px + w*0.64, w1y = py + h*0.15, w2x = px + w*0.86, w2y = py + h*0.33;
  const spoutX = px + w*0.60, spoutY = py + h*0.47;
  _wfPipe([[bx + bw, by + bh*0.35], [w1x, by + bh*0.35], [w1x, w1y]], S, t, on, 'rgba(230,240,255,0.9)');
  _wfPipe([[w1x, by + bh*0.35], [w2x, by + bh*0.35], [w2x, w2y]], S, t, on, 'rgba(230,240,255,0.9)');
  // molten line is thicker and glows orange-yellow
  const molten = [[w2x, w2y], [w2x, spoutY - 8*S], [spoutX + 8*S, spoutY - 8*S]];
  const path = () => { ctx.beginPath(); ctx.moveTo(molten[0][0], molten[0][1]); for (let i = 1; i < molten.length; i++) ctx.lineTo(molten[i][0], molten[i][1]); ctx.stroke(); };
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = '#141008'; ctx.lineWidth = 9*S; path();
  ctx.strokeStyle = '#6a5030'; ctx.lineWidth = 6*S; path();
  if (on) {
    ctx.strokeStyle = 'rgba(255,170,40,0.35)'; ctx.lineWidth = 10*S; path();
    ctx.strokeStyle = '#ffc030'; ctx.lineWidth = 2.5*S;
    ctx.setLineDash([5*S, 4*S]); ctx.lineDashOffset = -t*22*S; path();
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }

  // ── Boiler house ──
  _wfShadow(bx, by, bw, bh, S, 3*S);
  const rg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  rg.addColorStop(0, '#6a5a46'); rg.addColorStop(1, '#3a3026');
  ctx.fillStyle = rg; ctx.strokeStyle = '#221a12'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh*0.62, 2*S); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = S;
  for (let k = 1; k < 4; k++) { const ly = by + bh*0.62*k/4; ctx.beginPath(); ctx.moveTo(bx + 2*S, ly); ctx.lineTo(bx + bw - 2*S, ly); ctx.stroke(); }
  ctx.fillStyle = '#241c14'; ctx.fillRect(bx, by + bh*0.62, bw, bh*0.38);
  ctx.strokeStyle = '#3a3024'; ctx.strokeRect(bx, by + bh*0.62, bw, bh*0.38);
  const fdx = bx + bw*0.52, fdy = by + bh*0.70, fdw = bw*0.34, fdh = bh*0.26;
  const fg = ctx.createLinearGradient(0, fdy, 0, fdy + fdh);
  fg.addColorStop(0, on ? `rgba(255,190,70,${0.85 + 0.15*Math.sin(t*7)})` : '#2a1e14');
  fg.addColorStop(1, on ? '#b03010' : '#140e0a');
  ctx.fillStyle = fg; ctx.fillRect(fdx, fdy, fdw, fdh);
  ctx.strokeStyle = '#0e0a06'; ctx.lineWidth = S; ctx.strokeRect(fdx, fdy, fdw, fdh);
  ctx.beginPath(); for (let k = 1; k < 4; k++) { ctx.moveTo(fdx + fdw*k/4, fdy); ctx.lineTo(fdx + fdw*k/4, fdy + fdh); } ctx.stroke();
  // gauge dial
  ctx.fillStyle = '#d8d0b8'; ctx.beginPath(); ctx.arc(bx + bw*0.22, by + bh*0.82, 3.5*S, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#a02010'; ctx.lineWidth = S;
  const na = on ? -0.4 + 0.25*Math.sin(t*1.7) : -2.4;
  ctx.beginPath(); ctx.moveTo(bx + bw*0.22, by + bh*0.82); ctx.lineTo(bx + bw*0.22 + Math.cos(na)*3*S, by + bh*0.82 + Math.sin(na)*3*S); ctx.stroke();
  // stack
  const stx = bx + bw*0.18, stTop = py + h*0.005, stW = 10*S;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(stx - stW/2 + 4*S, stTop + 5*S, stW, by + bh*0.3 - stTop);
  const sg = ctx.createLinearGradient(stx - stW/2, 0, stx + stW/2, 0);
  sg.addColorStop(0, '#7a6a58'); sg.addColorStop(0.5, '#54483a'); sg.addColorStop(1, '#2a2218');
  ctx.fillStyle = sg; ctx.fillRect(stx - stW/2, stTop, stW, by + bh*0.3 - stTop);
  ctx.fillStyle = '#e8c830'; ctx.fillRect(stx - stW/2, stTop + 4*S, stW, 3*S);
  ctx.fillStyle = '#1a1410'; ctx.beginPath(); ctx.ellipse(stx, stTop, stW/2 + S, 2.2*S, 0, 0, Math.PI*2); ctx.fill();
  _wfSmoke(stx, stTop - 2*S, S*0.7, t, '120,110,90', on, 0.4);

  // ── Wellheads ──
  [[w1x, w1y, 0], [w2x, w2y, 1.7]].forEach(([wx, wy, ph]) => {
    ctx.fillStyle = 'rgba(90,80,60,0.55)'; ctx.beginPath(); ctx.ellipse(wx, wy + 3*S, 11*S, 8*S, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = S; ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(wx - 3*S + 3*S, wy - 10*S + 4*S, 6*S, 14*S);
    ctx.fillStyle = '#8a8478'; ctx.strokeStyle = '#2a2620';
    ctx.fillRect(wx - 3*S, wy - 10*S, 6*S, 14*S); ctx.strokeRect(wx - 3*S, wy - 10*S, 6*S, 14*S);
    ctx.fillRect(wx - 8*S, wy - 5*S, 16*S, 4*S); ctx.strokeRect(wx - 8*S, wy - 5*S, 16*S, 4*S);
    [-8, 8].forEach(dx => { ctx.fillStyle = '#b02820'; ctx.beginPath(); ctx.arc(wx + dx*S, wy - 3*S, 2.5*S, 0, Math.PI*2); ctx.fill(); });
    ctx.fillStyle = '#b02820'; ctx.beginPath(); ctx.arc(wx, wy - 11*S, 2.5*S, 0, Math.PI*2); ctx.fill();
    if (on) {
      for (let k = 0; k < 3; k++) {
        const p = (t*0.9 + ph + k/3) % 1;
        ctx.fillStyle = `rgba(245,245,240,${0.55*(1 - p)})`;
        ctx.beginPath(); ctx.arc(wx + 6*S + p*8*S, wy - 12*S - p*16*S, (2 + p*5)*S, 0, Math.PI*2); ctx.fill();
      }
    }
  });

  // ── Solidifying vat ──
  const vx = px + w*0.05, vy = py + h*0.47, vw = w*0.68, vh = h*0.33;
  _wfShadow(vx, vy, vw, vh, S, 2*S);
  ctx.fillStyle = '#4a3a26'; ctx.strokeStyle = '#1a140c'; ctx.lineWidth = 1.2*S;
  ctx.fillRect(vx, vy, vw, vh); ctx.strokeRect(vx, vy, vw, vh);
  ctx.strokeStyle = '#2a2014'; ctx.lineWidth = S;
  for (let x = vx + 12*S; x < vx + vw; x += 12*S) { ctx.beginPath(); ctx.moveTo(x, vy); ctx.lineTo(x, vy + 4*S); ctx.moveTo(x, vy + vh - 4*S); ctx.lineTo(x, vy + vh); ctx.stroke(); }
  const ix = vx + 4*S, iy = vy + 4*S, iw = vw - 8*S, ih = vh - 8*S;
  const yg = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
  yg.addColorStop(0, '#fff27a'); yg.addColorStop(0.5, '#f0cc20'); yg.addColorStop(1, '#b08a08');
  ctx.fillStyle = yg; ctx.fillRect(ix, iy, iw, ih);
  ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
  // crystalline facets
  ctx.strokeStyle = 'rgba(140,100,0,0.45)'; ctx.lineWidth = 0.8*S;
  for (let i = 0; i < 14; i++) {
    const fx = ix + iw*((i*0.618) % 1), fy = iy + ih*((i*0.382 + 0.1) % 1), fr = (4 + (i % 4)*2)*S;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) { const a = k*Math.PI/3 + i; const X = fx + Math.cos(a)*fr, Y = fy + Math.sin(a)*fr*0.7; k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
    ctx.closePath(); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,220,0.35)';
  for (let i = 0; i < 10; i++) { ctx.fillRect(ix + iw*((i*0.73) % 1), iy + ih*((i*0.29 + 0.05) % 1), 1.5*S, 1.5*S); }
  // molten pool around the pour point
  const poolX = spoutX, poolY = iy + ih*0.22;
  const pool = ctx.createRadialGradient(poolX, poolY, 1, poolX, poolY, iw*0.34);
  pool.addColorStop(0, on ? '#ff9a20' : '#8a5a10'); pool.addColorStop(0.45, on ? 'rgba(255,170,30,0.85)' : 'rgba(150,100,20,0.6)'); pool.addColorStop(1, 'rgba(240,200,40,0)');
  ctx.fillStyle = pool; ctx.fillRect(ix, iy, iw, ih);
  if (on) {
    for (let k = 0; k < 3; k++) {
      const p = (t*0.8 + k/3) % 1;
      ctx.strokeStyle = `rgba(255,240,160,${0.7*(1 - p)})`; ctx.lineWidth = S;
      ctx.beginPath(); ctx.ellipse(poolX, poolY, (3 + p*22)*S, (2 + p*12)*S, 0, 0, Math.PI*2); ctx.stroke();
    }
  }
  ctx.restore();
  // pour spout + stream
  ctx.fillStyle = '#5a4a36'; ctx.strokeStyle = '#1a140c'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.moveTo(spoutX + 8*S, spoutY - 11*S); ctx.lineTo(spoutX - 3*S, spoutY - 6*S); ctx.lineTo(spoutX - 3*S, spoutY - 2*S); ctx.lineTo(spoutX + 8*S, spoutY - 5*S); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (on) {
    const sw = 2.2*S + 0.6*S*Math.sin(t*11);
    const sgr = ctx.createLinearGradient(0, spoutY - 3*S, 0, poolY);
    sgr.addColorStop(0, '#ffe070'); sgr.addColorStop(1, '#ff9a20');
    ctx.fillStyle = sgr; ctx.fillRect(spoutX - 1.5*S - sw/2, spoutY - 3*S, sw, poolY - spoutY + 3*S);
    ctx.fillStyle = 'rgba(255,200,60,0.25)'; ctx.beginPath(); ctx.arc(spoutX - 1.5*S, poolY, 8*S, 0, Math.PI*2); ctx.fill();
  }
  // yellow haze
  if (on) {
    for (let k = 0; k < 4; k++) {
      const p = (t*0.12 + k/4) % 1;
      ctx.fillStyle = `rgba(230,220,90,${0.16*Math.sin(p*Math.PI)})`;
      ctx.beginPath(); ctx.ellipse(vx + vw*(0.15 + p*0.8), vy + vh*(0.25 + 0.5*((k*0.37) % 1)) - p*10*S, 16*S, 7*S, 0, 0, Math.PI*2); ctx.fill();
    }
  }

  // ── Blue-flame vent ──
  const fvx = px + w*0.88, fvTop = py + h*0.58, fvBase = py + h*0.78;
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(fvx - 3*S + 4*S, fvTop + 4*S, 6*S, fvBase - fvTop);
  ctx.fillStyle = '#5a5448'; ctx.fillRect(fvx - 3*S, fvTop, 6*S, fvBase - fvTop);
  ctx.fillStyle = '#e8c830'; ctx.fillRect(fvx - 3*S, fvTop + 5*S, 6*S, 2.5*S);
  ctx.fillStyle = '#2a261e'; ctx.fillRect(fvx - 4.5*S, fvTop - 2*S, 9*S, 3*S);
  if (on) {
    const fh = 13*S*(1 + 0.2*Math.sin(t*10) + 0.1*Math.sin(t*27));
    const sway = Math.sin(t*2.7)*1.5*S;
    ctx.fillStyle = 'rgba(80,140,255,0.18)'; ctx.beginPath(); ctx.arc(fvx, fvTop - fh*0.45, fh*0.8, 0, Math.PI*2); ctx.fill();
    const flame = (fw, fhh, col) => {
      ctx.fillStyle = col; ctx.beginPath();
      ctx.moveTo(fvx - fw, fvTop - 2*S);
      ctx.quadraticCurveTo(fvx - fw*1.1, fvTop - fhh*0.5, fvx + sway, fvTop - 2*S - fhh);
      ctx.quadraticCurveTo(fvx + fw*1.1, fvTop - fhh*0.5, fvx + fw, fvTop - 2*S);
      ctx.closePath(); ctx.fill();
    };
    flame(4*S, fh, 'rgba(60,110,255,0.85)');
    flame(2.2*S, fh*0.6, 'rgba(170,210,255,0.95)');
  }

  // ── Cut sulfur block stack ──
  const blocks = [[0.08, 0.86], [0.24, 0.86], [0.40, 0.86], [0.16, 0.80], [0.32, 0.80]];
  blocks.forEach(([fx, fy]) => {
    const bxx = px + w*fx, byy = py + h*fy, bs = 13*S, top = 4*S;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(bxx + 3*S, byy + 4*S, bs, bs*0.7);
    ctx.fillStyle = '#c89a10'; ctx.fillRect(bxx, byy + top, bs, bs*0.7 - top);
    ctx.fillStyle = '#ffe050'; ctx.fillRect(bxx, byy, bs, top);
    ctx.strokeStyle = '#6a5008'; ctx.lineWidth = 0.8*S; ctx.strokeRect(bxx, byy, bs, bs*0.7);
    ctx.beginPath(); ctx.moveTo(bxx, byy + top); ctx.lineTo(bxx + bs, byy + top); ctx.stroke();
  });

  // ── OUT stub: discharge housing + belt lip beside the bottom row ──
  // Same art as the Uranium Mine's; the tile comes from
  // SulfurSystem.outputPort, so drawing and simulation always agree.
  if (typeof SulfurSystem !== 'undefined') {
    const _dry = e._linkedDeposit && typeof isDepositExhausted === 'function' && isDepositExhausted(e._linkedDeposit);
    _coalMineOutStub(e, px, py, w, h, t, on && !_dry, null, SulfurSystem.outputPort(e));
  }
  _wfPlate('SULFUR MINE', px + w*0.50, py + h*0.955, S, accent, on);
  _wfLamp(px + w - 7*S, py + 7*S, S, t, accent, on);
  ctx.restore();
}

// ── Sulfur Mine MK2 (6×7) ──
// The Frasch plant scaled up. A three-furnace boiler house with twin stacks
// and a steam accumulator feeds a main across a field of four wellheads;
// their molten sulfur runs along a glowing header into a heated sump, and
// from there down open launders into two solidifying vats. A travelling
// gantry crane works the vats, lifting cut blocks to the crusher, which
// feeds the loadout belt to the OUT stub. Blue flares burn off vent gas.
// Drawn for OUT at the bottom-right and mirrored for bottom-left.
function renderSulfurMine2(e, px, py, t) {
  const w = (e.width  || 6) * TILE;
  const h = (e.height || 7) * TILE;
  const S = TILE / 40;
  const on = e.powered;
  const dry = !!(e._linkedDeposit && typeof isDepositExhausted === 'function' && isDepositExhausted(e._linkedDeposit));
  const run = on && !dry;
  const accent = '#ffd83a', cyan = '#40d0e0';
  const flip = ((e._rotation || 0) % 2) === 1;
  const X = f => px + w*f, Y = f => py + h*f;
  const steam = 'rgba(230,240,255,0.9)';
  ctx.save();
  if (flip) { ctx.translate(2*px + w, 0); ctx.scale(-1, 1); }
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';

  // A thick glowing line of molten sulfur (header, launders).
  const moltenLine = (pts, width) => {
    const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); };
    ctx.strokeStyle = '#141008'; ctx.lineWidth = (width + 3)*S; path();
    ctx.strokeStyle = '#6a5030'; ctx.lineWidth = width*S; path();
    if (run) {
      ctx.strokeStyle = 'rgba(255,170,40,0.35)'; ctx.lineWidth = (width + 4)*S; path();
      ctx.strokeStyle = '#ffc030'; ctx.lineWidth = width*0.42*S;
      ctx.setLineDash([5*S, 4*S]); ctx.lineDashOffset = -t*22*S; path();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
  };

  // ── Wellfield pad ──
  const padX = X(0.03), padY = Y(0.30), padW = w*0.94, padH = h*0.205;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.roundRect(padX + 3*S, padY + 4*S, padW, padH, 5*S); ctx.fill();
  const padG = ctx.createLinearGradient(0, padY, 0, padY + padH);
  padG.addColorStop(0, '#665c4c'); padG.addColorStop(1, '#4e4638');
  ctx.fillStyle = padG; ctx.strokeStyle = '#2a261e'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(padX, padY, padW, padH, 5*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,200,0.10)';
  for (let i = 0; i < 70; i++) ctx.fillRect(padX + padW*((i*0.618) % 1), padY + padH*((i*0.371 + 0.13) % 1), 1.4*S, 1.4*S);
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  for (let i = 0; i < 45; i++) ctx.fillRect(padX + padW*((i*0.437 + 0.2) % 1), padY + padH*((i*0.713) % 1), 1.6*S, 1.6*S);
  ctx.fillStyle = 'rgba(230,200,40,0.13)';
  ctx.beginPath(); ctx.ellipse(X(0.5), Y(0.41), w*0.43, h*0.065, 0, 0, Math.PI*2); ctx.fill();

  // ── Steam main + molten header (under the equipment) ──
  const wells = [0.13, 0.37, 0.61, 0.85].map((f, i) => [X(f), Y(0.405), i*0.9]);
  const mainY = Y(0.325), headY = Y(0.478);
  _wfPipe([[X(0.16), Y(0.25)], [X(0.16), mainY], [X(0.88), mainY]], S, t, run, steam);
  _wfPipe([[X(0.80), Y(0.27)], [X(0.80), mainY]], S, t, run, steam);
  wells.forEach(([wx, wy]) => _wfPipe([[wx, mainY], [wx, wy - 12*S]], S, t, run, steam));
  const sumpX = X(0.875), sumpY = Y(0.605), sumpR = 21*S;
  moltenLine([[wells[0][0], wells[0][1] + 6*S], [wells[0][0], headY], [X(0.875), headY], [sumpX, sumpY - sumpR]], 6);
  wells.slice(1).forEach(([wx, wy]) => moltenLine([[wx, wy + 6*S], [wx, headY]], 4));

  // ── Boiler house ──
  const bx = X(0.035), by = Y(0.06), bw = w*0.40, bh = h*0.19;
  _wfShadow(bx, by, bw, bh, S, 3*S);
  const wallG = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  wallG.addColorStop(0, '#6e5e48'); wallG.addColorStop(1, '#3a3026');
  ctx.fillStyle = wallG; ctx.strokeStyle = '#221a12'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, bh*0.58, 2*S); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = S;
  for (let k = 1; k < 5; k++) { const ly = by + bh*0.58*k/5; ctx.beginPath(); ctx.moveTo(bx + 2*S, ly); ctx.lineTo(bx + bw - 2*S, ly); ctx.stroke(); }
  // roof vents
  for (let k = 0; k < 3; k++) {
    const vx = bx + bw*(0.52 + k*0.15), vy = by + bh*0.12;
    ctx.fillStyle = '#2a2219'; ctx.fillRect(vx, vy, bw*0.10, bh*0.14);
    ctx.fillStyle = '#5a4c3a'; ctx.fillRect(vx, vy, bw*0.10, 1.5*S);
  }
  ctx.fillStyle = '#241c14'; ctx.fillRect(bx, by + bh*0.58, bw, bh*0.42);
  ctx.strokeStyle = '#3a3024'; ctx.strokeRect(bx, by + bh*0.58, bw, bh*0.42);
  // three furnace doors
  for (let k = 0; k < 3; k++) {
    const fdx = bx + bw*(0.10 + k*0.30), fdy = by + bh*0.66, fdw = bw*0.22, fdh = bh*0.26;
    const fg = ctx.createLinearGradient(0, fdy, 0, fdy + fdh);
    fg.addColorStop(0, run ? `rgba(255,190,70,${0.85 + 0.15*Math.sin(t*7 + k*1.3)})` : '#2a1e14');
    fg.addColorStop(1, run ? '#b03010' : '#140e0a');
    ctx.fillStyle = fg; ctx.fillRect(fdx, fdy, fdw, fdh);
    ctx.strokeStyle = '#0e0a06'; ctx.lineWidth = S; ctx.strokeRect(fdx, fdy, fdw, fdh);
    ctx.beginPath(); for (let j = 1; j < 4; j++) { ctx.moveTo(fdx + fdw*j/4, fdy); ctx.lineTo(fdx + fdw*j/4, fdy + fdh); } ctx.stroke();
    if (run) { ctx.fillStyle = 'rgba(255,140,40,0.18)'; ctx.beginPath(); ctx.ellipse(fdx + fdw/2, fdy + fdh + 3*S, fdw*0.7, 4*S, 0, 0, Math.PI*2); ctx.fill(); }
  }
  // twin stacks, banded in the MK2's cyan
  [[bx + bw*0.13, 12*S, 0], [bx + bw*0.33, 10*S, 0.9]].forEach(([sx, sw, ph]) => {
    const top = py + h*0.004 + ph*3*S, base = by + bh*0.3;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(sx - sw/2 + 4*S, top + 5*S, sw, base - top);
    const sg = ctx.createLinearGradient(sx - sw/2, 0, sx + sw/2, 0);
    sg.addColorStop(0, '#7a6a58'); sg.addColorStop(0.5, '#54483a'); sg.addColorStop(1, '#2a2218');
    ctx.fillStyle = sg; ctx.fillRect(sx - sw/2, top, sw, base - top);
    ctx.fillStyle = '#e8c830'; ctx.fillRect(sx - sw/2, top + 4*S, sw, 3*S);
    ctx.fillStyle = cyan; ctx.fillRect(sx - sw/2, top + 9*S, sw, 2*S);
    ctx.fillStyle = '#1a1410'; ctx.beginPath(); ctx.ellipse(sx, top, sw/2 + S, 2.4*S, 0, 0, Math.PI*2); ctx.fill();
    _wfSmoke(sx, top - 2*S, S*0.75, t + ph, '120,110,90', run, 0.42);
  });

  // ── Steam accumulator ──
  const ax = X(0.465), ay = Y(0.07), aw = w*0.13, ah = h*0.17;
  _wfShadow(ax, ay, aw, ah, S, aw/2);
  const ag = ctx.createLinearGradient(ax, 0, ax + aw, 0);
  ag.addColorStop(0, '#b8b4a8'); ag.addColorStop(0.35, '#e8e4d8'); ag.addColorStop(1, '#6a665c');
  ctx.fillStyle = ag; ctx.strokeStyle = '#2a2822'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(ax, ay, aw, ah, aw/2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  [0.3, 0.7].forEach(f => { ctx.beginPath(); ctx.moveTo(ax + 1.5*S, ay + ah*f); ctx.lineTo(ax + aw - 1.5*S, ay + ah*f); ctx.stroke(); });
  ctx.fillStyle = cyan; ctx.fillRect(ax + 1.5*S, ay + ah*0.44, aw - 3*S, ah*0.12);
  // gauge
  ctx.fillStyle = '#d8d0b8'; ctx.beginPath(); ctx.arc(ax + aw/2, ay + ah*0.18, 3.5*S, 0, Math.PI*2); ctx.fill();
  ctx.strokeStyle = '#a02010'; ctx.lineWidth = S;
  const na = run ? -0.3 + 0.3*Math.sin(t*1.9) : -2.4;
  ctx.beginPath(); ctx.moveTo(ax + aw/2, ay + ah*0.18); ctx.lineTo(ax + aw/2 + Math.cos(na)*3*S, ay + ah*0.18 + Math.sin(na)*3*S); ctx.stroke();
  // relief valve plume
  if (run && Math.sin(t*0.7) > 0.6) {
    for (let k = 0; k < 3; k++) {
      const p = (t*1.4 + k/3) % 1;
      ctx.fillStyle = `rgba(245,245,240,${0.5*(1 - p)})`;
      ctx.beginPath(); ctx.arc(ax + aw/2 + p*6*S, ay - 2*S - p*14*S, (2 + p*5)*S, 0, Math.PI*2); ctx.fill();
    }
  }

  // ── Control room + superheater ──
  const cx0 = X(0.655), cy0 = Y(0.06), cw = w*0.305, chh = h*0.11;
  _wfShadow(cx0, cy0, cw, chh, S, 2*S);
  ctx.fillStyle = '#4a4c48'; ctx.strokeStyle = '#1c1e1c'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.roundRect(cx0, cy0, cw, chh, 2*S); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5c605a'; ctx.fillRect(cx0, cy0, cw, chh*0.22);
  for (let k = 0; k < 4; k++) {
    const wx = cx0 + cw*(0.08 + k*0.23), wy = cy0 + chh*0.38;
    ctx.fillStyle = run ? (k === 2 && Math.sin(t*2.3) > 0.7 ? '#fff0a0' : '#f0d070') : '#1a2024';
    ctx.fillRect(wx, wy, cw*0.16, chh*0.36);
    if (run) { ctx.fillStyle = 'rgba(255,220,120,0.15)'; ctx.fillRect(wx - S, wy - S, cw*0.16 + 2*S, chh*0.36 + 2*S); }
  }
  // roof AC + antenna
  ctx.fillStyle = '#6a6e68'; ctx.fillRect(cx0 + cw*0.70, cy0 - 3*S, cw*0.18, 6*S);
  ctx.strokeStyle = '#2a2c2a'; ctx.lineWidth = S; ctx.strokeRect(cx0 + cw*0.70, cy0 - 3*S, cw*0.18, 6*S);
  ctx.save(); ctx.translate(cx0 + cw*0.79, cy0); ctx.rotate(run ? t*6 : 0);
  ctx.strokeStyle = '#2a2c2a'; ctx.beginPath(); ctx.moveTo(-2*S, 0); ctx.lineTo(2*S, 0); ctx.moveTo(0, -2*S); ctx.lineTo(0, 2*S); ctx.stroke(); ctx.restore();
  // superheater: a horizontal pressure vessel on saddles
  const hx = X(0.665), hy = Y(0.19), hw = w*0.29, hh = h*0.065;
  ctx.fillStyle = '#2a261e'; [0.2, 0.8].forEach(f => ctx.fillRect(hx + hw*f - 3*S, hy + hh*0.5, 6*S, hh*0.75));
  _wfShadow(hx, hy, hw, hh, S, hh/2);
  const hg = ctx.createLinearGradient(0, hy, 0, hy + hh);
  hg.addColorStop(0, '#d0ccc0'); hg.addColorStop(0.4, '#f0ece0'); hg.addColorStop(1, '#6a665c');
  ctx.fillStyle = hg; ctx.strokeStyle = '#2a2822'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(hx, hy, hw, hh, hh/2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  for (let k = 1; k < 5; k++) { const lx = hx + hw*k/5; ctx.beginPath(); ctx.moveTo(lx, hy + S); ctx.lineTo(lx, hy + hh - S); ctx.stroke(); }
  if (run) { ctx.fillStyle = `rgba(255,120,40,${0.18 + 0.08*Math.sin(t*3)})`; ctx.beginPath(); ctx.roundRect(hx + 2*S, hy + hh*0.55, hw - 4*S, hh*0.3, 2*S); ctx.fill(); }

  // ── Wellheads (Frasch: steam down, molten sulfur up) ──
  wells.forEach(([wx, wy, ph]) => {
    ctx.fillStyle = 'rgba(90,80,60,0.6)'; ctx.beginPath(); ctx.ellipse(wx, wy + 4*S, 14*S, 9*S, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = S; ctx.stroke();
    // concrete cellar ring
    ctx.strokeStyle = '#8a8270'; ctx.lineWidth = 2*S; ctx.beginPath(); ctx.ellipse(wx, wy + 4*S, 11*S, 7*S, 0, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(wx, wy - 8*S, 7*S, 16*S);
    ctx.fillStyle = '#8a8478'; ctx.strokeStyle = '#2a2620'; ctx.lineWidth = S;
    ctx.fillRect(wx - 3.5*S, wy - 12*S, 7*S, 16*S); ctx.strokeRect(wx - 3.5*S, wy - 12*S, 7*S, 16*S);
    ctx.fillRect(wx - 9*S, wy - 6*S, 18*S, 4.5*S); ctx.strokeRect(wx - 9*S, wy - 6*S, 18*S, 4.5*S);
    ctx.fillStyle = cyan; ctx.fillRect(wx - 3.5*S, wy - 1*S, 7*S, 1.6*S);
    [-9, 9].forEach(dx => { ctx.fillStyle = '#b02820'; ctx.beginPath(); ctx.arc(wx + dx*S, wy - 3.8*S, 2.7*S, 0, Math.PI*2); ctx.fill(); });
    ctx.fillStyle = '#b02820'; ctx.beginPath(); ctx.arc(wx, wy - 13*S, 2.7*S, 0, Math.PI*2); ctx.fill();
    if (run) {
      for (let k = 0; k < 3; k++) {
        const p = (t*0.9 + ph + k/3) % 1;
        ctx.fillStyle = `rgba(245,245,240,${0.5*(1 - p)})`;
        ctx.beginPath(); ctx.arc(wx + 6*S + p*8*S, wy - 14*S - p*15*S, (2 + p*5)*S, 0, Math.PI*2); ctx.fill();
      }
    }
  });

  // ── Solidifying vats ──
  const drawVat = (vx, vy, vw, vh, spoutF, ph) => {
    _wfShadow(vx, vy, vw, vh, S, 2*S);
    ctx.fillStyle = '#4a3a26'; ctx.strokeStyle = '#1a140c'; ctx.lineWidth = 1.2*S;
    ctx.fillRect(vx, vy, vw, vh); ctx.strokeRect(vx, vy, vw, vh);
    ctx.strokeStyle = '#2a2014'; ctx.lineWidth = S;
    for (let x = vx + 12*S; x < vx + vw; x += 12*S) { ctx.beginPath(); ctx.moveTo(x, vy); ctx.lineTo(x, vy + 4*S); ctx.moveTo(x, vy + vh - 4*S); ctx.lineTo(x, vy + vh); ctx.stroke(); }
    const ix = vx + 4*S, iy = vy + 4*S, iw = vw - 8*S, ih = vh - 8*S;
    const yg = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
    yg.addColorStop(0, '#fff27a'); yg.addColorStop(0.5, '#f0cc20'); yg.addColorStop(1, '#b08a08');
    ctx.fillStyle = yg; ctx.fillRect(ix, iy, iw, ih);
    ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, iw, ih); ctx.clip();
    // cut lines where blocks have been lifted out
    ctx.strokeStyle = 'rgba(120,85,0,0.5)'; ctx.lineWidth = 0.9*S;
    for (let x = ix + iw*0.55; x < ix + iw; x += 14*S) { ctx.beginPath(); ctx.moveTo(x, iy); ctx.lineTo(x, iy + ih); ctx.stroke(); }
    for (let y = iy + 14*S; y < iy + ih; y += 14*S) { ctx.beginPath(); ctx.moveTo(ix + iw*0.55, y); ctx.lineTo(ix + iw, y); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(140,100,0,0.4)'; ctx.lineWidth = 0.8*S;
    for (let i = 0; i < 10; i++) {
      const fx = ix + iw*0.55*((i*0.618 + ph) % 1), fy = iy + ih*((i*0.382 + 0.1) % 1), fr = (4 + (i % 4)*2)*S;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = k*Math.PI/3 + i; const Xp = fx + Math.cos(a)*fr, Yp = fy + Math.sin(a)*fr*0.7; k ? ctx.lineTo(Xp, Yp) : ctx.moveTo(Xp, Yp); }
      ctx.closePath(); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,220,0.35)';
    for (let i = 0; i < 12; i++) ctx.fillRect(ix + iw*((i*0.73 + ph) % 1), iy + ih*((i*0.29 + 0.05) % 1), 1.5*S, 1.5*S);
    const poolX = vx + vw*spoutF, poolY = iy + ih*0.22;
    const pool = ctx.createRadialGradient(poolX, poolY, 1, poolX, poolY, Math.min(iw, ih*1.6)*0.45);
    pool.addColorStop(0, run ? '#ff9a20' : '#8a5a10'); pool.addColorStop(0.45, run ? 'rgba(255,170,30,0.85)' : 'rgba(150,100,20,0.6)'); pool.addColorStop(1, 'rgba(240,200,40,0)');
    ctx.fillStyle = pool; ctx.fillRect(ix, iy, iw, ih);
    if (run) {
      for (let k = 0; k < 3; k++) {
        const p = (t*0.8 + ph + k/3) % 1;
        ctx.strokeStyle = `rgba(255,240,160,${0.7*(1 - p)})`; ctx.lineWidth = S;
        ctx.beginPath(); ctx.ellipse(poolX, poolY, (3 + p*20)*S, (2 + p*11)*S, 0, 0, Math.PI*2); ctx.stroke();
      }
      for (let k = 0; k < 3; k++) {
        const p = (t*0.12 + ph + k/3) % 1;
        ctx.fillStyle = `rgba(230,220,90,${0.15*Math.sin(p*Math.PI)})`;
        ctx.beginPath(); ctx.ellipse(ix + iw*(0.1 + p*0.8), iy + ih*(0.3 + 0.4*((k*0.37) % 1)) - p*8*S, 14*S, 6*S, 0, 0, Math.PI*2); ctx.fill();
      }
    }
    ctx.restore();
    return [poolX, poolY];
  };
  const v1 = drawVat(X(0.035), Y(0.545), w*0.44, h*0.235, 0.30, 0);
  const v2 = drawVat(X(0.50),  Y(0.545), w*0.25, h*0.235, 0.45, 0.4);

  // ── Heated sump ──
  _wfShadow(sumpX - sumpR, sumpY - sumpR, sumpR*2, sumpR*2, S, sumpR);
  ctx.fillStyle = '#5a4a36'; ctx.strokeStyle = '#1a140c'; ctx.lineWidth = 1.5*S;
  ctx.beginPath(); ctx.arc(sumpX, sumpY, sumpR, 0, Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#2a2014'; ctx.lineWidth = S;
  for (let k = 0; k < 12; k++) { const a = k*Math.PI/6; ctx.beginPath(); ctx.moveTo(sumpX + Math.cos(a)*(sumpR - 3*S), sumpY + Math.sin(a)*(sumpR - 3*S)); ctx.lineTo(sumpX + Math.cos(a)*sumpR, sumpY + Math.sin(a)*sumpR); ctx.stroke(); }
  const mg = ctx.createRadialGradient(sumpX, sumpY, 1, sumpX, sumpY, sumpR - 4*S);
  mg.addColorStop(0, run ? '#ffd060' : '#8a6a20'); mg.addColorStop(0.7, run ? '#ff9a20' : '#6a4a10'); mg.addColorStop(1, run ? '#c06010' : '#4a3008');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(sumpX, sumpY, sumpR - 4*S, 0, Math.PI*2); ctx.fill();
  if (run) {
    ctx.fillStyle = `rgba(255,170,40,${0.22 + 0.08*Math.sin(t*4)})`; ctx.beginPath(); ctx.arc(sumpX, sumpY, sumpR + 6*S, 0, Math.PI*2); ctx.fill();
    // ripples spreading off the stirrer
    for (let k = 0; k < 2; k++) {
      const p = (t*0.6 + k/2) % 1;
      ctx.strokeStyle = `rgba(255,235,150,${0.55*(1 - p)})`; ctx.lineWidth = S;
      ctx.beginPath(); ctx.arc(sumpX, sumpY, 5*S + p*(sumpR - 9*S), 0, Math.PI*2); ctx.stroke();
    }
  }
  // three-arm stirrer
  ctx.save(); ctx.translate(sumpX, sumpY); ctx.rotate(run ? t*2 : 0.4);
  ctx.strokeStyle = 'rgba(58,42,20,0.85)'; ctx.lineWidth = 2*S;
  for (let k = 0; k < 3; k++) {
    ctx.rotate(Math.PI*2/3);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(sumpR*0.3, -sumpR*0.15, sumpR*0.5, 0); ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = '#2a2219'; ctx.beginPath(); ctx.arc(sumpX, sumpY, 3*S, 0, Math.PI*2); ctx.fill();

  // ── Launders: sump → each vat ──
  const laY = Y(0.565);
  moltenLine([[sumpX - sumpR + 2*S, laY], [v1[0], laY]], 5);
  [v1, v2].forEach(([sx]) => {
    ctx.fillStyle = '#5a4a36'; ctx.strokeStyle = '#1a140c'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(sx - 4*S, laY - 4*S, 8*S, 8*S, 1.5*S); ctx.fill(); ctx.stroke();
    if (run) { ctx.fillStyle = 'rgba(255,200,60,0.35)'; ctx.beginPath(); ctx.arc(sx, laY + 6*S, 6*S, 0, Math.PI*2); ctx.fill(); }
  });

  // ── Gantry crane over the vats ──
  const r0 = Y(0.525), r1 = Y(0.80), gx0 = X(0.03), gx1 = X(0.77);
  [r0, r1].forEach(ry => {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(gx0 + 2*S, ry + 3*S, gx1 - gx0, 4*S);
    ctx.fillStyle = '#5a5e62'; ctx.fillRect(gx0, ry - 2*S, gx1 - gx0, 4*S);
    ctx.fillStyle = '#8a9096'; ctx.fillRect(gx0, ry - 2*S, gx1 - gx0, 1.2*S);
    _wfHazardStripe(gx0, ry - 2*S, 8*S, 4*S, S); _wfHazardStripe(gx1 - 8*S, ry - 2*S, 8*S, 4*S, S);
  });
  const gPos = run ? 0.5 + 0.45*Math.sin(t*0.32) : 0.62;
  const gX = gx0 + 12*S + (gx1 - gx0 - 24*S)*gPos;
  const tPos = run ? 0.5 + 0.4*Math.sin(t*0.71 + 1) : 0.5;
  const tY = r0 + 8*S + (r1 - r0 - 16*S)*tPos;
  ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fillRect(gX - 5*S + 6*S, r0 + 6*S, 10*S, r1 - r0);
  [-4.5, 4.5].forEach(dx => {
    ctx.fillStyle = accent; ctx.fillRect(gX + dx*S - 1.8*S, r0 - 3*S, 3.6*S, r1 - r0 + 6*S);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(gX + dx*S + 0.6*S, r0 - 3*S, 1.2*S, r1 - r0 + 6*S);
  });
  ctx.strokeStyle = '#8a6a10'; ctx.lineWidth = 0.8*S;
  for (let y = r0; y < r1; y += 8*S) { ctx.beginPath(); ctx.moveTo(gX - 4.5*S, y); ctx.lineTo(gX + 4.5*S, y + 8*S); ctx.stroke(); }
  [r0, r1].forEach(ry => { ctx.fillStyle = '#2a2a28'; ctx.fillRect(gX - 7*S, ry - 3.5*S, 14*S, 7*S); });
  // trolley with a block on the hoist
  ctx.fillStyle = '#3a3e42'; ctx.strokeStyle = '#141618'; ctx.lineWidth = S;
  ctx.fillRect(gX - 7*S, tY - 5*S, 14*S, 10*S); ctx.strokeRect(gX - 7*S, tY - 5*S, 14*S, 10*S);
  ctx.fillStyle = '#c89a10'; ctx.fillRect(gX - 5*S, tY - 3*S, 10*S, 6*S);
  ctx.fillStyle = '#ffe050'; ctx.fillRect(gX - 5*S, tY - 3*S, 10*S, 2*S);
  ctx.fillStyle = run && Math.sin(t*6) > 0 ? '#ff8030' : '#5a3020'; ctx.beginPath(); ctx.arc(gX, tY - 7*S, 1.6*S, 0, Math.PI*2); ctx.fill();

  // ── Blue sulfur flares ──
  [[X(0.83), 0], [X(0.935), 1.3]].forEach(([fx, ph]) => {
    const fTop = Y(0.70), fBase = Y(0.80);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(fx + S, fTop + 4*S, 6*S, fBase - fTop);
    ctx.fillStyle = '#5a5448'; ctx.fillRect(fx - 3*S, fTop, 6*S, fBase - fTop);
    ctx.fillStyle = '#e8c830'; ctx.fillRect(fx - 3*S, fTop + 5*S, 6*S, 2.5*S);
    ctx.fillStyle = cyan; ctx.fillRect(fx - 3*S, fTop + 9*S, 6*S, 1.6*S);
    ctx.fillStyle = '#2a261e'; ctx.fillRect(fx - 4.5*S, fTop - 2*S, 9*S, 3*S);
    if (run) {
      const fh = 14*S*(1 + 0.2*Math.sin(t*10 + ph) + 0.1*Math.sin(t*27 + ph));
      const sway = Math.sin(t*2.7 + ph)*1.5*S;
      ctx.fillStyle = 'rgba(80,140,255,0.18)'; ctx.beginPath(); ctx.arc(fx, fTop - fh*0.45, fh*0.8, 0, Math.PI*2); ctx.fill();
      const flame = (fw, fhh, col) => {
        ctx.fillStyle = col; ctx.beginPath();
        ctx.moveTo(fx - fw, fTop - 2*S);
        ctx.quadraticCurveTo(fx - fw*1.1, fTop - fhh*0.5, fx + sway, fTop - 2*S - fhh);
        ctx.quadraticCurveTo(fx + fw*1.1, fTop - fhh*0.5, fx + fw, fTop - 2*S);
        ctx.closePath(); ctx.fill();
      };
      flame(4*S, fh, 'rgba(60,110,255,0.85)');
      flame(2.2*S, fh*0.6, 'rgba(170,210,255,0.95)');
    }
  });

  // ── Cut block stacks ──
  const blocks = [[0.05, 0.875], [0.13, 0.875], [0.21, 0.875], [0.29, 0.875], [0.09, 0.835], [0.17, 0.835], [0.25, 0.835], [0.13, 0.80]];
  blocks.forEach(([fx, fy]) => {
    const bxx = X(fx), byy = Y(fy), bs = 15*S, top = 4.5*S;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(bxx + 3*S, byy + 4*S, bs, bs*0.7);
    ctx.fillStyle = '#c89a10'; ctx.fillRect(bxx, byy + top, bs, bs*0.7 - top);
    ctx.fillStyle = '#ffe050'; ctx.fillRect(bxx, byy, bs, top);
    ctx.strokeStyle = '#6a5008'; ctx.lineWidth = 0.8*S; ctx.strokeRect(bxx, byy, bs, bs*0.7);
    ctx.beginPath(); ctx.moveTo(bxx, byy + top); ctx.lineTo(bxx + bs, byy + top); ctx.stroke();
  });

  // ── Crusher + loadout belt to the OUT stub ──
  const outY = Y(1 - 0.5 / (e.height || 7));
  _wfConveyor(X(0.60), outY, X(0.90), outY, S, t, run, '#e8cc30');
  const kx = X(0.45), ky = Y(0.835), kw = w*0.16, kh = h*0.125;
  _wfShadow(kx, ky, kw, kh, S, 2*S);
  ctx.fillStyle = '#4a4e52'; ctx.strokeStyle = '#16181a'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.roundRect(kx, ky, kw, kh, 2*S); ctx.fill(); ctx.stroke();
  // hopper mouth
  ctx.fillStyle = '#1c1e20'; ctx.beginPath();
  ctx.moveTo(kx + kw*0.15, ky + kh*0.12); ctx.lineTo(kx + kw*0.85, ky + kh*0.12); ctx.lineTo(kx + kw*0.65, ky + kh*0.5); ctx.lineTo(kx + kw*0.35, ky + kh*0.5); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.translate(kx + kw*0.5, ky + kh*0.3); ctx.rotate(run ? t*4 : 0);
  ctx.strokeStyle = '#8a8e92'; ctx.lineWidth = 1.2*S;
  for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI/4); ctx.beginPath(); ctx.moveTo(-4*S, 0); ctx.lineTo(4*S, 0); ctx.stroke(); }
  ctx.restore();
  _wfHazardStripe(kx, ky + kh*0.78, kw, kh*0.14, S);
  if (run) {
    for (let k = 0; k < 4; k++) {
      const p = (t*0.5 + k/4) % 1;
      ctx.fillStyle = `rgba(230,210,90,${0.25*(1 - p)})`;
      ctx.beginPath(); ctx.arc(kx + kw*0.5 + Math.sin(k*2 + t)*4*S, ky - p*10*S, (3 + p*5)*S, 0, Math.PI*2); ctx.fill();
    }
  }
  ctx.restore();   // end of the mirrored drawing

  // ── OUT stub (drawn unmirrored: the tile comes from SulfurSystem) ──
  ctx.save();
  if (typeof SulfurSystem !== 'undefined') _coalMineOutStub(e, px, py, w, h, t, run, null, SulfurSystem.outputPort(e));
  // The accumulator's stencil, placed by hand so text never reads mirrored.
  const stencilF = (ax - px + aw/2) / w;
  ctx.fillStyle = '#0c1a1e'; ctx.font = `bold ${Math.max(6, 6.5*S)}px Courier New`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('MK2', px + w*(flip ? 1 - stencilF : stencilF), ay + ah*0.505);
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const plateF = 0.21;
  _wfPlate('SULFUR MINE MK2', flip ? px + w*(1 - plateF) : px + w*plateF, py + h*0.965, S, accent, on);
  _wfLamp(flip ? px + 7*S : px + w - 7*S, py + 7*S, S, t, cyan, on);
  ctx.restore();
}

// ── Lithium Mine (4×5) ──
// Brine operation: a well pump feeds four evaporation ponds that step from
// deep blue through turquoise and pale green to a white salt crust, where a
// harvester scrapes the lithium salts. A processing shed sends product up a
// belt to a white stockpile that grows with the mine's ore buffer. No
// backdrop. Shares the _wf* helpers.
function renderLithiumMine(e, px, py, t) {
  const w = (e.width  || 8) * TILE;
  const h = (e.height || 10) * TILE;
  const S = TILE / 40;
  const on = e.powered;
  const accent = '#a0e0ff';
  const fill = Math.max(0, Math.min(1, (e._lithiumStored || 0) / 300));
  ctx.save();

  const pondX = px + w*0.06, pondY = py + h*0.21, pondW = w*0.88, pondH = h*0.46;
  const gap = 7*S, cw = (pondW - gap)/2, chh = (pondH - gap)/2;
  const ponds = [
    { x: pondX,            y: pondY,             c0: '#1a5ea8', c1: '#2a86c8', crust: 0    },
    { x: pondX + cw + gap, y: pondY,             c0: '#1f9aa8', c1: '#3cc8c0', crust: 0.15 },
    { x: pondX + cw + gap, y: pondY + chh + gap, c0: '#6ac8a0', c1: '#a8e8b8', crust: 0.4  },
    { x: pondX,            y: pondY + chh + gap, c0: '#d8dcc0', c1: '#f4f4e4', crust: 1    },
  ];

  // ── Brine well pump ──
  const wx = px + w*0.15, wy = py + h*0.10;
  _wfPipe([[wx + 10*S, wy], [pondX + cw*0.5, wy], [pondX + cw*0.5, pondY + 3*S]], S, t, on, 'rgba(120,200,255,0.95)');
  _wfShadow(wx - 11*S, wy - 8*S, 22*S, 16*S, S, 2*S);
  ctx.fillStyle = '#5a6a70'; ctx.strokeStyle = '#1e2628'; ctx.lineWidth = S;
  ctx.beginPath(); ctx.roundRect(wx - 11*S, wy - 8*S, 22*S, 16*S, 2*S); ctx.fill(); ctx.stroke();
  ctx.save(); ctx.translate(wx - 3*S, wy); ctx.rotate(on ? t*5 : 0.4);
  ctx.strokeStyle = '#c8d4d8'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.arc(0, 0, 5*S, 0, Math.PI*2); ctx.stroke();
  for (let k = 0; k < 3; k++) { ctx.rotate(Math.PI/3); ctx.beginPath(); ctx.moveTo(-5*S, 0); ctx.lineTo(5*S, 0); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = on ? accent : '#3a5058'; ctx.fillRect(wx + 5*S, wy - 4*S, 3*S, 8*S);

  // ── Evaporation ponds ──
  ponds.forEach((p, i) => {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.roundRect(p.x + 3*S, p.y + 4*S, cw, chh, 4*S); ctx.fill();
    ctx.fillStyle = '#c8b898'; ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = S;
    ctx.beginPath(); ctx.roundRect(p.x, p.y, cw, chh, 4*S); ctx.fill(); ctx.stroke();
    const ix = p.x + 3.5*S, iy = p.y + 3.5*S, iw = cw - 7*S, ih = chh - 7*S;
    const g = ctx.createLinearGradient(ix, iy, ix + iw, iy + ih);
    g.addColorStop(0, p.c1); g.addColorStop(1, p.c0);
    ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(ix, iy, iw, ih, 3*S); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(ix, iy, iw, ih, 3*S); ctx.clip();
    // salt crust specks, denser in later stages
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const specks = Math.round(p.crust*40);
    for (let k = 0; k < specks; k++) {
      const sx = ix + iw*((k*0.618 + i*0.13) % 1), sy = iy + ih*((k*0.382 + i*0.29) % 1);
      ctx.fillRect(sx, sy, (1 + (k % 3)*0.6)*S, (1 + (k % 2)*0.6)*S);
    }
    if (on && p.crust < 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8*S;
      for (let k = 0; k < 3; k++) {
        const off = ((t*6*S + k*14*S) % (iw + 20*S)) - 10*S;
        ctx.beginPath(); ctx.moveTo(ix + off, iy + ih*(0.25 + k*0.25)); ctx.lineTo(ix + off + 10*S, iy + ih*(0.25 + k*0.25) - 2*S); ctx.stroke();
      }
    }
    ctx.restore();
  });
  // weirs between stages
  const weirs = [
    [pondX + cw, pondY + chh*0.5, pondX + cw + gap, pondY + chh*0.5],
    [pondX + cw + gap + cw*0.5, pondY + chh, pondX + cw + gap + cw*0.5, pondY + chh + gap],
    [pondX + cw + gap, pondY + chh + gap + chh*0.5, pondX + cw, pondY + chh + gap + chh*0.5],
  ];
  weirs.forEach(([x0, y0, x1, y1], k) => {
    ctx.strokeStyle = '#6a6a60'; ctx.lineWidth = 4*S;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (on) {
      ctx.strokeStyle = 'rgba(170,230,255,0.9)'; ctx.lineWidth = 1.6*S;
      ctx.setLineDash([2*S, 2*S]); ctx.lineDashOffset = -t*10*S;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    }
  });

  // ── Harvester scraping the crust pond ──
  const hp = ponds[3];
  const hPhase = on ? (Math.sin(t*0.5) * 0.5 + 0.5) : 0.3;
  const hx = hp.x + 8*S + hPhase*(cw - 22*S), hy = hp.y + chh*0.5;
  ctx.fillStyle = 'rgba(160,150,120,0.5)'; ctx.fillRect(hp.x + 5*S, hy - 3*S, hx - hp.x - 5*S, 6*S);
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(hx + 2*S, hy - 4*S + 3*S, 12*S, 9*S);
  ctx.fillStyle = '#e0a020'; ctx.strokeStyle = '#4a3408'; ctx.lineWidth = S;
  ctx.fillRect(hx, hy - 4*S, 12*S, 9*S); ctx.strokeRect(hx, hy - 4*S, 12*S, 9*S);
  ctx.fillStyle = '#2a2a24'; ctx.fillRect(hx + 7*S, hy - 3*S, 4*S, 4*S);
  ctx.fillStyle = '#9a9a90'; ctx.fillRect(hx - 3*S, hy - 5*S, 2.5*S, 11*S);
  ctx.fillStyle = on && Math.sin(t*6) > 0 ? '#ffb030' : '#6a4a18';
  ctx.beginPath(); ctx.arc(hx + 9*S, hy - 4*S, 1.2*S, 0, Math.PI*2); ctx.fill();

  // ── Processing shed ──
  const shX = px + w*0.05, shY = py + h*0.73, shW = w*0.42, shH = h*0.20;
  _wfShadow(shX, shY, shW, shH, S, 2*S);
  const rg = ctx.createLinearGradient(0, shY, 0, shY + shH*0.6);
  rg.addColorStop(0, '#8aa0a8'); rg.addColorStop(1, '#4a5a60');
  ctx.fillStyle = rg; ctx.strokeStyle = '#1e2628'; ctx.lineWidth = 1.2*S;
  ctx.beginPath(); ctx.roundRect(shX, shY, shW, shH*0.6, 2*S); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = S;
  for (let k = 1; k < 6; k++) { const lx = shX + shW*k/6; ctx.beginPath(); ctx.moveTo(lx, shY + 2*S); ctx.lineTo(lx, shY + shH*0.6 - 2*S); ctx.stroke(); }
  ctx.fillStyle = '#243034'; ctx.fillRect(shX, shY + shH*0.6, shW, shH*0.4);
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = on ? `rgba(170,230,255,${0.45 + 0.25*Math.sin(t*1.8 + k)})` : '#1a2226';
    ctx.fillRect(shX + shW*(0.1 + k*0.3), shY + shH*0.7, shW*0.18, shH*0.18);
  }
  ctx.fillStyle = '#5a6a70'; ctx.fillRect(shX + shW*0.78, shY - 10*S, 5*S, 12*S);
  _wfSmoke(shX + shW*0.78 + 2.5*S, shY - 11*S, S*0.5, t, '235,245,250', on, 0.4);

  // ── Belt + lithium stockpile ──
  const spX = px + w*0.76, spBY = py + h*0.93;
  const spR = (14 + 10*fill)*S, spTop = spBY - (10 + 10*fill)*S;
  _wfConveyor(shX + shW, shY + shH*0.3, spX - 3*S, spTop + 3*S, S, t, on, '#8ab0c0');
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(spX + 4*S, spBY + 2*S, spR*1.05, 4*S, 0, 0, Math.PI*2); ctx.fill();
  const pg = ctx.createLinearGradient(spX - spR, spTop, spX + spR, spBY);
  pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.5, '#dce8ee'); pg.addColorStop(1, '#8aa0aa');
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.moveTo(spX - spR, spBY);
  ctx.quadraticCurveTo(spX - spR*0.25, spTop - 3*S, spX, spTop);
  ctx.quadraticCurveTo(spX + spR*0.25, spTop - 3*S, spX + spR, spBY);
  ctx.ellipse(spX, spBY, spR, 3.5*S, 0, 0, Math.PI);
  ctx.closePath(); ctx.fill();
  if (on) {
    ctx.fillStyle = `rgba(200,240,255,${0.6 + 0.4*Math.sin(t*4)})`;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(spX - spR*0.5 + k*spR*0.33, spBY - 4*S - ((k*7) % 3)*2*S, 0.9*S, 0, Math.PI*2); ctx.fill(); }
  }

  // Feed belt from the process line to the OUT stub: from the stockpile to
  // the bottom-right stub, or from the shed to the bottom-left one when R
  // has flipped it (LithiumSystem.outputPort).
  {
    const right = ((e._rotation || 0) % 2) === 0;
    const portY = py + h - TILE * 0.5;
    if (right) _wfConveyor(spX + spR * 0.7, spBY - 3*S, px + w - 8*S, portY, S, t, on, '#8ab0c0');
    else       _wfConveyor(shX + 6*S, shY + shH * 0.8, px + 8*S, portY, S, t, on, '#8ab0c0');
  }
  _wfPlate('LITHIUM MINE', px + w*0.56, py + h*0.035, S, accent, on);
  _wfLamp(px + w - 7*S, py + 7*S, S, t, accent, on);
  ctx.restore();
  // The one OUT stub beside the stockpile — drawn from
  // LithiumSystem.outputPort, so drawing and simulation always agree.
  if (typeof LithiumSystem !== 'undefined' && e.col !== undefined) {
    const _dry = e._depositOreAmount !== undefined && e._depositOreAmount <= 0;
    _coalMineOutStub(e, px, py, w, h, t, on && !_dry, null, LithiumSystem.outputPort(e));
  }
}

// ── Coal mine OUT stub ──
// Discharge head on the mine's output face — the one tile CoalSystem.
// mineOutputPort() returns (rotated with R at placement / on hover). Drawn in
// a local frame where +y points out of the building, so one drawing covers
// all four rotations: a steel discharge housing inside the footprint edge
// with an arrow and status lamp, and a belt lip (same width as a conveyor)
// running out to the edge with chevrons moving outward.
// Lamp: green when a belt sits on the port, blinking amber when the mine is
// running with nothing attached, dim otherwise.
// hub (optional, {x, y, r}): a transfer tower inside the plant, straight
// inboard of the port — an enclosed elevated gallery then carries coal from
// the tower's edge (r from its centre) out to the housing, so the stub reads
// as the end of the plant's process line rather than a box on the edge.
function _coalMineOutStub(e, px, py, w, h, t, running, hub, portOverride) {
  const S = TILE / 40;
  const port = portOverride || ((typeof CoalSystem !== 'undefined') ? CoalSystem.mineOutputPort(e) : null);
  if (!port) return;
  // Face and position come from the port tile itself, so the drawing always
  // matches the sim (MK1: bottom-right or bottom-left corner of the bottom
  // row, or the centre of the rotated face on older exact-cover mines; MK2:
  // fixed at the bottom-right end of its rail spur).
  const wT = e.width || 2, hT = e.height || 2;
  const rot = port.r < e.row ? 0 : port.c >= e.col + wT ? 1 : port.r >= e.row + hT ? 2 : 3;
  const ex = rot === 1 ? px + w : rot === 3 ? px : px + (port.c - e.col + 0.5) * TILE;
  const ey = rot === 0 ? py : rot === 2 ? py + h : py + (port.r - e.row + 0.5) * TILE;
  const tile = port ? GridManager.getEntity(port.c, port.r) : null;
  const connected = !!(tile && typeof isConveyorTile === 'function' && isConveyorTile(tile));
  const moving = running && connected;
  const beltHW = TILE*0.18, frameHW = beltHW + 3*S;
  const ang = [Math.PI, -Math.PI/2, 0, Math.PI/2][rot];

  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(ang);

  const hx = -12*S, hy = -22*S, hw = 24*S, hh = 14*S;

  // Elevated gallery from the transfer tower to the housing
  if (hub) {
    const dx = hub.x - ex, dy = hub.y - ey, a = -ang;
    const hubLY = dx*Math.sin(a) + dy*Math.cos(a);
    const g0 = hubLY + (hub.r || 0), g1 = hy + 1*S, gw = 6*S;
    if (g1 > g0) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(-gw - 2.5*S, g0, gw*2 + 5*S, g1 - g0);
      ctx.fillStyle = '#26303a';
      for (let y = g0 + 8*S; y < g1 - 4*S; y += 14*S) ctx.fillRect(-gw - 2.5*S, y, gw*2 + 5*S, 2.2*S);
      ctx.fillStyle = '#3c4e5e'; ctx.fillRect(-gw, g0, gw*2, g1 - g0);
      ctx.fillStyle = '#5a6e82'; ctx.fillRect(-gw, g0, 1.3*S, g1 - g0);
      ctx.fillStyle = '#2a3844'; ctx.fillRect(gw - 1.3*S, g0, 1.3*S, g1 - g0);
      ctx.fillStyle = '#10151a'; ctx.fillRect(-2.4*S, g0 + 1.5*S, 4.8*S, g1 - g0 - 1.5*S);
      const span = g1 - g0 - 3*S;
      if (running && span > 0) {
        const n = Math.max(2, Math.floor(span / (7*S)));
        ctx.fillStyle = '#34302a';
        for (let k = 0; k < n; k++) {
          const f = ((t * 18*S / span) + k/n) % 1;
          ctx.fillRect(-1.3*S, g0 + 1.5*S + f*span, 2.6*S, 2*S);
        }
      }
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      for (let y = g0 + 5*S; y < g1; y += 5*S) ctx.fillRect(-gw, y, gw*2, 0.7*S);
    }
  }

  // Belt lip out to the footprint edge
  const lipY = -9*S;
  ctx.fillStyle = '#5d646b'; ctx.fillRect(-frameHW, lipY, frameHW*2, -lipY);
  ctx.fillStyle = '#303338'; ctx.fillRect(-beltHW, lipY, beltHW*2, -lipY);
  ctx.fillStyle = '#9ea6ae'; ctx.fillRect(-frameHW, lipY, 1*S, -lipY);
  ctx.fillStyle = '#3e4449'; ctx.fillRect(frameHW - 1*S, lipY, 1*S, -lipY);
  ctx.fillStyle = '#16181b';
  ctx.fillRect(-beltHW - 0.8*S, lipY, 0.8*S, -lipY); ctx.fillRect(beltHW, lipY, 0.8*S, -lipY);
  ctx.save();
  ctx.beginPath(); ctx.rect(-beltHW, lipY, beltHW*2, -lipY); ctx.clip();
  ctx.strokeStyle = 'rgba(128,136,146,0.7)'; ctx.lineWidth = 1.1*S; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let k = 0; k < 3; k++) {
    const y = lipY + (((k/2) + (moving ? t*1.2 : 0)) % 1) * (-lipY + 4*S);
    ctx.beginPath(); ctx.moveTo(-beltHW*0.7, y - 1.6*S); ctx.lineTo(0, y + 1.6*S); ctx.lineTo(beltHW*0.7, y - 1.6*S); ctx.stroke();
  }
  ctx.restore();
  // No cargo is drawn on the lip: the real items (BeltCargo) emerge from the
  // port in their own material. This used to scroll three coal lumps here
  // for every mine that shares this stub, sulfur and uranium included.

  // Discharge housing
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(hx - 1*S, hy - 1*S, hw + 2*S, hh + 2*S);
  const hg = ctx.createLinearGradient(hx, 0, hx + hw, 0);
  hg.addColorStop(0, '#7a8188'); hg.addColorStop(0.5, '#5a6168'); hg.addColorStop(1, '#3e444a');
  ctx.fillStyle = hg; ctx.fillRect(hx, hy, hw, hh);
  ctx.strokeStyle = '#1e2124'; ctx.lineWidth = 0.9*S; ctx.strokeRect(hx, hy, hw, hh);
  ctx.save(); ctx.beginPath(); ctx.rect(hx, hy, hw, 3*S); ctx.clip();
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(hx, hy, hw, 3*S);
  ctx.fillStyle = '#e0b020';
  for (let x = hx - 4*S; x < hx + hw; x += 5*S) {
    ctx.beginPath(); ctx.moveTo(x, hy + 3*S); ctx.lineTo(x + 2.5*S, hy + 3*S); ctx.lineTo(x + 5.5*S, hy); ctx.lineTo(x + 3*S, hy); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  // Mouth the belt emerges from
  ctx.fillStyle = '#0c0c0e'; ctx.fillRect(-beltHW + 1*S, hy + hh - 2.5*S, beltHW*2 - 2*S, 2.5*S);
  // Outward arrow
  ctx.fillStyle = connected ? '#f0e8d0' : '#9aa0a6';
  ctx.beginPath(); ctx.moveTo(-3.5*S, hy + 5*S); ctx.lineTo(3.5*S, hy + 5*S); ctx.lineTo(0, hy + 9.5*S); ctx.closePath(); ctx.fill();
  // Status lamp
  const lampX = hx + hw - 3.5*S, lampY = hy + hh - 4.5*S;
  const lampOn = connected || (running && Math.sin(t*5) > 0);
  const lampCol = connected ? '#70ff60' : '#ffb020';
  ctx.fillStyle = lampOn ? lampCol : '#2a2c30';
  ctx.beginPath(); ctx.arc(lampX, lampY, 1.5*S, 0, Math.PI*2); ctx.fill();
  if (lampOn) { ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(lampX, lampY, 3.4*S, 0, Math.PI*2); ctx.fill(); ctx.globalAlpha = 1; }

  ctx.restore();
}

// True unless ent is a coal mine and (c, r) is not its OUT stub tile.
function _isCoalMinePort(ent, c, r) {
  if (ent.type !== T.COALMINE && ent.type !== T.COALMINE2) return true;
  const p = CoalSystem.mineOutputPort(ent);
  return !!p && p.c === c && p.r === r;
}

function renderSolidStorage(e, px, py, t) {
    // Storage Container — a 5×5 bulk ore bin (SolidStorageSystem). A ribbed
    // steel bin on a concrete pad, open at the top so the coal heap inside
    // can be seen rising and falling with the stock. An inclined feed belt
    // on a steel truss climbs from the IN stub (left face, middle row) and
    // drops into the bin; a discharge gate on the right wall runs a short
    // feeder out to the OUT stub (right face, same row).
    // A level gauge on the front, a hazard band, a stencilled plate and a
    // rooftop beacon that flashes when the bin is full round it out.
    // Authored in a 200-unit square scaled by `u`.
    const w = (e.width || 5) * TILE, h = (e.height || 5) * TILE;
    const u = Math.min(w, h) / 200;
    // R (odd rotation) mirrors the whole bin left <-> right so the IN stub
    // sits on the right face and OUT on the left (SolidStorageSystem.ports).
    // Done by mirroring the X mapping rather than the canvas, so text stays
    // readable: XR() places a rect of width ww, and AL() swaps text sides.
    const flip = ((e._rotation || 0) % 2) === 1;
    const X = (v) => flip ? px + w - v*u : px + v*u, Y = (v) => py + v*u;
    const XR = (x, ww) => flip ? X(x) - ww*u : X(x);
    const AL = (a) => !flip || a === 'center' ? a : a === 'left' ? 'right' : 'left';
    const detail = Camera.zoom > 0.45;
    const dark = DayNight.darkness();
    const cap = (typeof SolidStorageSystem !== 'undefined') ? SolidStorageSystem.CAPACITY : 1000;
    const stored = e._stored || 0;
    const fill = Math.max(0, Math.min(1, stored / cap));
    const online = !e._lightningDamaged;
    const filling = online && (e._inRate || 0) > 0.3;
    const draining = online && !!e._pushing;
    const R  = (x, y, ww, hh, c) => { ctx.fillStyle = c; ctx.fillRect(XR(x, ww), Y(y), ww*u, hh*u); };
    const RR = (x, y, ww, hh, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.roundRect(XR(x, ww), Y(y), ww*u, hh*u, r*u); ctx.fill(); };
    const dot = (x, y, r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(X(x), Y(y), r*u, 0, Math.PI*2); ctx.fill(); };
    const ln = (x1, y1, x2, y2, c, lw) => { ctx.strokeStyle = c; ctx.lineWidth = lw*u; ctx.beginPath(); ctx.moveTo(X(x1), Y(y1)); ctx.lineTo(X(x2), Y(y2)); ctx.stroke(); };
    // Stable per-building jitter for the coal lumps.
    const S = (k) => { const v = Math.sin((e.col || 0) * 12.9898 + (e.row || 0) * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };

    const WALL = '#8a5a2e', WALL_DK = '#6a4222', WALL_HI = '#a8703c';
    const STEEL = '#4c535c', STEEL_HI = '#6a737e';
    // The heap takes the colour of whatever the bin holds (SolidStorageSystem
    // tracks one solid at a time in _solidType), so a full yard reads at a
    // glance. Same palette the belts carry each material in.
    // Four tones each (shadow, body, lit face, highlight), the shape its
    // pieces take, and for the ones that would, a glow after dark.
    const HEAP = {
      coal:      { c: ['#0b0b0f', '#1c1c22', '#30303a', '#666b7c'], shape: 'lump' },
      uranium:   { c: ['#0c2012', '#1a3a22', '#2f6a3a', '#62f088'], shape: 'lump',   glow: '#50ff82', glint: true },
      sulfur:    { c: ['#4a3a06', '#8a7212', '#cbb026', '#fff39a'], shape: 'shard',  glint: true },
      lithium:   { c: ['#3a464e', '#687a84', '#a6bac4', '#f2fcff'], shape: 'shard',  glint: true },
      compound:  { c: ['#2a2042', '#4a3a6a', '#7860a6', '#d2bcff'], shape: 'powder' },
      rods:      { c: ['#14260c', '#2a4a1a', '#4c8830', '#b6ff7c'], shape: 'rod',    glow: '#a0ff60' },
      pellets:   { c: ['#0a2a30', '#1a4a52', '#2c8896', '#8ef7ff'], shape: 'pellet', glow: '#70f0ff', glint: true },
      he3pellets: { c: ['#1e1230', '#3a2652', '#7a5aa8', '#e2c8ff'], shape: 'pellet', glow: '#c890ff', glint: true },
      recovered: { c: ['#1c2016', '#363e2c', '#5c684a', '#aab892'], shape: 'lump' },
      plutonium: { c: ['#202228', '#444852', '#787e8c', '#e2e8f6'], shape: 'lump',   glow: '#ff9a50', glint: true },
      mox:       { c: ['#0e2428', '#1e4448', '#38787a', '#9cf2e2'], shape: 'rod',    glow: '#70e8d0' },
    };
    const MAT = HEAP[e._solidType] || HEAP.coal;
    const [HEAP_SH, COAL, HEAP_LIT, COAL_HI] = MAT.c;
    const A = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;

    // Steel-framed belt stub, the same build as the Fuel Plant's U IN /
    // ROD OUT belts, laid horizontally: side rails, belt deck, rollers that
    // turn while it runs, cargo riding it, and a direction arrow. `dir` is
    // +1 when material travels rightward. Local 200-unit coords.
    const beltStub = (xa, xb, cy, dir, running, trim) => {
      const len = xb - xa, bw = 16, y0 = cy - bw / 2;
      if (running) {
        const g = ctx.createRadialGradient(X((xa + xb) / 2), Y(cy), 0, X((xa + xb) / 2), Y(cy), len * u);
        g.addColorStop(0, 'rgba(255,208,110,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(XR(xa - 4, len + 8), Y(y0 - 6), (len + 8) * u, (bw + 12) * u);
      }
      R(xa, y0 - 1.5, len, 2, running ? trim : '#8a8a74');          // side rails
      R(xa, y0 + bw - 0.5, len, 2, running ? trim : '#8a8a74');
      R(xa, y0 + 0.5, len, bw - 1, running ? '#2e3428' : '#44463c'); // belt deck
      // rollers, marching with the belt while it runs
      const step = 4, phase = running ? ((t * 1.2) % 1) * step * dir : 0;
      ctx.save();
      ctx.beginPath(); ctx.rect(XR(xa, len), Y(y0), len * u, bw * u); ctx.clip();
      for (let x = xa - step; x <= xb + step; x += step)
        ln(x + phase, y0 + 1, x + phase, y0 + bw - 1,
           running ? 'rgba(210,220,190,0.45)' : 'rgba(160,160,140,0.35)', 0.8);
      if (running) {                                                   // cargo
        for (let k = 0; k < 2; k++) {
          const f = (t * 0.6 + k * 0.5) % 1;
          dot(dir > 0 ? xa + f * len : xb - f * len, cy, 2.2, COAL_HI);
        }
      }
      ctx.restore();
      // direction arrow at the downstream end
      const ax = dir > 0 ? xb - 4 : xa + 4;
      ctx.fillStyle = running ? trim : 'rgba(200,200,170,0.7)';
      ctx.beginPath();
      ctx.moveTo(X(ax + dir * 2.5), Y(cy));
      ctx.lineTo(X(ax - dir * 1.5), Y(cy - 3));
      ctx.lineTo(X(ax - dir * 1.5), Y(cy + 3));
      ctx.closePath(); ctx.fill();
    };

    ctx.save();
    ctx.lineCap = 'round';

    // No pad — the bin sits straight on the ground.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';                            // bin shadow
    ctx.beginPath(); ctx.ellipse(X(104), Y(176), 76*u, 7*u, 0, 0, Math.PI*2); ctx.fill();

    // ── Bin interior + coal heap (seen over the rim) ──────────────────
    RR(34, 30, 132, 72, 3, '#4a4238');                             // steel lining inside the bin
    if (detail) for (let x = 38; x < 166; x += 8) R(x, 35, 1, 64, 'rgba(0,0,0,0.18)');
    R(34, 30, 132, 5, '#6a5e4c');                                  // back wall lip
    if (detail) {                                                  // the walls shade the inside
      R(34, 35, 132, 3, 'rgba(0,0,0,0.22)');
      const sl = px + 34*u, sr = px + 166*u;                       // screen-space: the bin is symmetric
      for (const [x0, x1] of [[sl, sl + 9*u], [sr, sr - 9*u]]) {
        const g = ctx.createLinearGradient(x0, 0, x1, 0);
        g.addColorStop(0, 'rgba(0,0,0,0.30)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(Math.min(x0, x1), Y(35), 9*u, 66*u);
      }
    }
    if (fill > 0.001) {
      // The heap is a cone poured under the head pulley on top of a bed that
      // rises against the walls as the bin fills, so a full bin reads as
      // full rather than as the same pointed pile drawn taller.
      const FLOOR = 101, HL = 34, HR = 166;
      const peak = 100 - fill * 64;                                // heap crest height
      const px0 = 96 + (S(3) - 0.5) * 16;
      const side = FLOOR - Math.max(0, fill - 0.12) * 44;          // bed level at the walls
      const rough = Math.min(1, fill * 6) * (MAT.shape === 'powder' ? 0.4 : 1.1);
      const n1 = S(5) * 9, n2 = S(6) * 9;
      const surf = (x) => {
        const f = x < px0 ? (px0 - x) / (px0 - HL) : (x - px0) / (HR - px0);
        let y = peak + (side - peak) * Math.pow(f, 1.5);
        y += (Math.sin(x * 0.31 + n1) + Math.sin(x * 0.77 + n2) * 0.5) * rough;   // an uneven crest, not a drawn curve
        if (draining && x > 128) y += 6 * Math.pow((x - 128) / (HR - 128), 2);   // drawn down toward the gate
        return Math.min(FLOOR, y);
      };
      const trace = (off) => {
        ctx.beginPath();
        ctx.moveTo(X(HL), Y(FLOOR));
        for (let x = HL; x <= HR; x += 4) ctx.lineTo(X(x), Y(Math.min(FLOOR, surf(x) + off)));
        ctx.lineTo(X(HR), Y(FLOOR));
        ctx.closePath();
      };
      ctx.save();
      ctx.beginPath(); ctx.rect(XR(35, 130), Y(31), 130*u, 70*u); ctx.clip();
      // Body: lit along the crest, falling into shadow toward the floor.
      const bg = ctx.createLinearGradient(0, Y(peak), 0, Y(FLOOR));
      bg.addColorStop(0, HEAP_LIT); bg.addColorStop(0.45, COAL); bg.addColorStop(1, HEAP_SH);
      ctx.fillStyle = bg;
      trace(0); ctx.fill();
      ctx.save();
      ctx.clip();                                                  // everything below stays on the heap
      if (detail) {
        // Light from the upper left: a bright shoulder, and the far slope in shade.
        const lxp = X(px0) - 16*u, lyp = Y(peak + 8);
        const lg = ctx.createRadialGradient(lxp, lyp, 0, lxp, lyp, 46*u);
        lg.addColorStop(0, A(COAL_HI, 0.26)); lg.addColorStop(1, A(COAL_HI, 0));
        ctx.fillStyle = lg; ctx.fillRect(px + 34*u, Y(31), 132*u, 70*u);
        const sg = ctx.createLinearGradient(X(px0), 0, px + 166*u, 0);
        sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.34)');
        ctx.fillStyle = sg; ctx.fillRect(Math.min(X(px0), px + 166*u), Y(31), Math.abs(px + 166*u - X(px0)), 70*u);
        // Slump lines, where each pour has slid down over the last.
        ctx.lineWidth = 0.7*u;
        for (const off of [8, 17, 28]) {
          ctx.strokeStyle = 'rgba(0,0,0,0.16)';
          ctx.beginPath();
          for (let x = HL; x <= HR; x += 4) {
            const yy = surf(x) + off + Math.sin(x * 0.19 + off) * 1.5;
            if (x === HL) ctx.moveTo(X(x), Y(yy)); else ctx.lineTo(X(x), Y(yy));
          }
          ctx.stroke();
        }

        // The pieces themselves, laid in rows from the crest down so the
        // nearer (lower, larger) ones overlap the ones behind.
        const tones = [HEAP_SH, COAL, HEAP_LIT, HEAP_LIT];
        const poly = (pts) => { ctx.beginPath(); ctx.moveTo(X(pts[0]), Y(pts[1])); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(X(pts[i]), Y(pts[i + 1])); ctx.closePath(); ctx.fill(); };
        const NROWS = MAT.shape === 'powder' ? 9 : 7;
        for (let r = 0; r < NROWS; r++) {
          const d = (r + 0.5) / NROWS, n = (MAT.shape === 'powder' ? 16 : 9) + r;
          for (let i = 0; i < n; i++) {
            const k = r * 31 + i;
            const lx = 37 + ((i + S(k + 100)) / n) * 126;
            const s0 = surf(lx);
            if (FLOOR - s0 < 2) continue;
            const ly = s0 + 1.5 + (d + (S(k + 200) - 0.5) / NROWS) * (FLOOR - s0);
            if (ly > FLOOR - 0.5 || ly < s0 + 1) continue;
            const sz = (1.5 + d * 1.6) * (0.7 + S(k + 300) * 0.7);
            const lit = lx < px0 ? 1 : 0.55;                       // the far slope catches less light
            const tone = tones[Math.floor(S(k + 400) * 4)];
            if (MAT.shape === 'lump') {
              // An irregular five-sided lump, a lit facet on its upper left.
              const a0 = S(k + 500) * 6.28, pts = [];
              for (let j = 0; j < 5; j++) {
                const a = a0 + j * 1.2566, rr = sz * (0.7 + S(k + 510 + j) * 0.55);
                pts.push(lx + Math.cos(a) * rr, ly + Math.sin(a) * rr * 0.85);
              }
              ctx.fillStyle = 'rgba(0,0,0,0.28)'; poly(pts.map((v, j) => v + (j % 2 ? 0.7 : 0.5)));   // cast shadow
              ctx.fillStyle = tone; poly(pts);
              ctx.fillStyle = A(COAL_HI, 0.5 * lit);
              poly([lx - sz * 0.55, ly - sz * 0.1, lx - sz * 0.1, ly - sz * 0.6, lx + sz * 0.15, ly - sz * 0.05]);
            } else if (MAT.shape === 'shard') {
              // A crystal: a long diamond with one bright edge.
              const a = S(k + 500) * 3.14, ca = Math.cos(a), sa = Math.sin(a);
              const hl = sz * 1.35, hw = sz * 0.5;
              const pts = [lx + ca * hl, ly + sa * hl, lx - sa * hw, ly + ca * hw, lx - ca * hl, ly - sa * hl, lx + sa * hw, ly - ca * hw];
              ctx.fillStyle = 'rgba(0,0,0,0.25)'; poly(pts.map((v, j) => v + (j % 2 ? 0.7 : 0.5)));
              ctx.fillStyle = tone === HEAP_SH ? COAL : tone; poly(pts);
              ctx.fillStyle = A(COAL_HI, 0.7 * lit);
              poly([pts[0], pts[1], pts[6], pts[7], pts[4], pts[5], lx, ly]);
            } else if (MAT.shape === 'rod') {
              // A fuel rod lying where it fell: a bar, a highlight, an end cap.
              const a = (S(k + 500) - 0.5) * 1.1, ca = Math.cos(a), sa = Math.sin(a), hl = sz * 1.5;
              ctx.lineCap = 'round';
              ln(lx - ca * hl + 0.5, ly - sa * hl + 0.7, lx + ca * hl + 0.5, ly + sa * hl + 0.7, 'rgba(0,0,0,0.3)', sz * 0.85);
              ln(lx - ca * hl, ly - sa * hl, lx + ca * hl, ly + sa * hl, tone === HEAP_SH ? COAL : HEAP_LIT, sz * 0.85);
              ln(lx - ca * hl, ly - sa * hl - sz * 0.2, lx + ca * hl, ly + sa * hl - sz * 0.2, A(COAL_HI, 0.6 * lit), sz * 0.22);
              dot(lx + ca * hl, ly + sa * hl, sz * 0.3, HEAP_SH);
            } else if (MAT.shape === 'pellet') {
              dot(lx + 0.4, ly + 0.5, sz * 0.62, 'rgba(0,0,0,0.3)');
              dot(lx, ly, sz * 0.62, tone === HEAP_SH ? COAL : HEAP_LIT);
              dot(lx - sz * 0.2, ly - sz * 0.22, sz * 0.24, A(COAL_HI, 0.85 * lit));
            } else {
              // Powder: no pieces to see, only grain.
              dot(lx, ly, 0.4 + S(k + 300) * 0.45, S(k + 400) > 0.55 ? A(COAL_HI, 0.55 * lit) : 'rgba(0,0,0,0.3)');
            }
          }
        }
        // Sheen along the crest.
        ctx.strokeStyle = A(COAL_HI, 0.3); ctx.lineWidth = 0.8*u;
        ctx.beginPath();
        for (let x = px0 - 22; x <= px0 + 18; x += 4) { if (x === px0 - 22) ctx.moveTo(X(x), Y(surf(x) + 1.2)); else ctx.lineTo(X(x), Y(surf(x) + 1.2)); }
        ctx.stroke();
        // Glints off crystal faces and polished shells.
        if (MAT.glint) {
          ctx.strokeStyle = A(COAL_HI, 1); ctx.lineWidth = 0.6*u;
          for (let k = 0; k < 6; k++) {
            const tw = Math.pow(Math.max(0, Math.sin(t * 1.7 + k * 2.3)), 6);
            if (tw < 0.05) continue;
            const gx = 44 + S(k + 700) * 112, gs = surf(gx), gy = gs + 3 + S(k + 710) * Math.max(0, FLOOR - gs - 6);
            if (gy > FLOOR - 2) continue;
            ctx.globalAlpha = tw;
            const gr = 2.4 * tw;
            ctx.beginPath(); ctx.moveTo(X(gx - gr), Y(gy)); ctx.lineTo(X(gx + gr), Y(gy)); ctx.moveTo(X(gx), Y(gy - gr)); ctx.lineTo(X(gx), Y(gy + gr)); ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();                                               // off the heap, still inside the bin
      // Snow lying on the heap, drawn here rather than by BuildingSnow so it
      // sits on the heap as it stands now: higher as the bin fills, gone
      // with the stock. It fades in over the same ground cover as the snow
      // on the buildings around it.
      const snowA = typeof FrostSystem !== 'undefined' ? Math.max(0, Math.min(1, (FrostSystem.coverage - 0.3) / 0.32)) : 0;
      if (snowA > 0.01) {
        const deep = (x) => 2.2 + (Math.sin(x * 0.23 + n1) * 0.5 + 0.5) * 2.4 * Math.min(1, fill * 4);
        ctx.beginPath();
        for (let x = HL; x <= HR; x += 3) { const y = Math.min(FLOOR, surf(x) - 0.8); if (x === HL) ctx.moveTo(X(x), Y(y)); else ctx.lineTo(X(x), Y(y)); }
        for (let x = HR; x >= HL; x -= 3) ctx.lineTo(X(x), Y(Math.min(FLOOR, surf(x) + deep(x))));
        ctx.closePath();
        const sg2 = ctx.createLinearGradient(0, Y(peak - 1), 0, Y(peak + 10));
        sg2.addColorStop(0, `rgba(246,250,255,${(0.95 * snowA).toFixed(3)})`); sg2.addColorStop(1, `rgba(206,218,234,${(0.9 * snowA).toFixed(3)})`);
        ctx.fillStyle = sg2; ctx.fill();
      }
      // Hot or luminous stock lights the lining above it after dark.
      if (MAT.glow && dark > 0.25 && detail) {
        const ga = Math.min(0.42, (dark - 0.25) * 0.6) * (0.85 + Math.sin(t * 1.3) * 0.15);
        const gg = ctx.createRadialGradient(X(px0), Y(peak + 14), 0, X(px0), Y(peak + 14), 70*u);
        gg.addColorStop(0, A(MAT.glow, ga)); gg.addColorStop(1, A(MAT.glow, 0));
        ctx.fillStyle = gg; ctx.fillRect(px + 34*u, Y(31), 132*u, 70*u);
      }
      // Falling stream under the head pulley while filling, and the dust it
      // kicks up where it lands.
      if (filling) {
        const land = surf(58);
        for (let k = 0; k < 7; k++) {
          const f = (t * 1.8 + k / 7) % 1;
          dot(58 + Math.sin(k*2.1)*1.6, 44 + f * f * (land - 44), 1.1 + (k % 3) * 0.3, k % 2 ? HEAP_LIT : COAL);
        }
        if (detail) {
          for (let k = 0; k < 3; k++) {
            const f = (t * 0.9 + k / 3) % 1;
            dot(58 + (k - 1) * 4 * f, land - 1 - f * 4, 1.5 + f * 4, A(HEAP_LIT, 0.32 * (1 - f)));
          }
        }
      }
      ctx.restore();
    }

    // ── Front wall: ribbed steel, hazard band, stencil, gauge ─────────
    R(30, 100, 140, 70, WALL);
    if (detail) for (let x = 34; x < 170; x += 6) { R(x, 100, 1.4, 62, WALL_DK); R(x + 1.4, 100, 0.8, 62, WALL_HI); }
    R(30, 100, 140, 3, '#5a3a1e');
    ctx.save();                                                    // hazard band
    ctx.beginPath(); ctx.rect(XR(30, 140), Y(162), 140*u, 8*u); ctx.clip();
    R(30, 162, 140, 8, '#d8b020');
    ctx.fillStyle = '#1e1e20';
    for (let x = 22; x < 176; x += 10) { ctx.beginPath(); ctx.moveTo(X(x), Y(170)); ctx.lineTo(X(x + 5), Y(162)); ctx.lineTo(X(x + 9), Y(162)); ctx.lineTo(X(x + 4), Y(170)); ctx.fill(); }
    ctx.restore();
    if (e._lightningDamaged) { ctx.fillStyle = 'rgba(20,10,6,0.45)'; ctx.fillRect(XR(30, 140), Y(100), 140*u, 70*u); }
    // top rim + corner posts
    R(28, 96, 144, 5, STEEL); R(28, 96, 144, 1.2, STEEL_HI);
    R(28, 34, 5, 136, STEEL); R(167, 34, 5, 136, STEEL);
    R(29, 34, 1.2, 136, STEEL_HI); R(168, 34, 1.2, 136, STEEL_HI);
    // guard rail along the top
    if (detail) {
      ln(33, 24, 167, 24, '#d8b020', 1.2);
      for (const rx of [33, 78, 122, 167]) ln(rx, 24, rx, 34, '#d8b020', 1);
    }
    // stencil plate
    RR(84, 116, 52, 16, 2, 'rgba(20,16,12,0.85)');
    if (detail) {
      ctx.font = `bold ${Math.max(4, 8*u)}px Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e8c070';
      ctx.fillText('ORE STORE', X(110), Y(124.5));
    }
    // level gauge: sight strip with ticks, filled from the bottom
    RR(40, 106, 12, 52, 2, '#2a2420');
    const gc = fill > 0.9 ? '#ff6040' : fill > 0.6 ? '#e8b030' : '#60c060';
    R(42, 108 + 48 * (1 - fill), 8, 48 * fill, gc);
    if (detail) for (let k = 1; k < 4; k++) R(40, 106 + k * 13, 4, 0.8, '#d8d0c0');
    // ladder up the right corner
    if (detail) {
      ln(156, 100, 156, 24, STEEL_HI, 0.8); ln(162, 100, 162, 24, STEEL_HI, 0.8);
      for (let y = 96; y > 26; y -= 6) ln(156, y, 162, y, STEEL_HI, 0.6);
    }

    // ── Feed conveyor: IN stub → up the truss → head pulley ───────────
    const beltC = filling ? '#3a3a3e' : '#2e2e32';
    ln(16, 98, 16, 128, STEEL, 2); ln(34, 74, 34, 128, STEEL, 2);   // truss legs
    if (detail) { ln(16, 124, 34, 84, STEEL, 0.8); ln(16, 104, 34, 122, STEEL, 0.8); }
    // incline: from the stub at (−8, 100) to the head pulley at (58, 40)
    ln(-6, 100, 12, 100, beltC, 6);
    ln(12, 100, 58, 40, beltC, 6);
    ln(12, 97, 58, 37, 'rgba(255,255,255,0.12)', 0.8);
    dot(12, 100, 3.2, STEEL_HI); dot(58, 40, 4, STEEL_HI); dot(58, 40, 1.4, '#2a2e34');
    RR(52, 34, 14, 6, 1.5, WALL_DK);                              // head chute hood
    if (filling && detail) {
      for (let k = 0; k < 5; k++) {
        const f = (t * 0.6 + k / 5) % 1;
        const bx = f < 0.28 ? -6 + (f / 0.28) * 18 : 12 + ((f - 0.28) / 0.72) * 46;
        const by = f < 0.28 ? 98 : 98 - ((f - 0.28) / 0.72) * 60;
        dot(bx, by, 1.5, '#15151a');
      }
    }
    beltStub(-8, 14, 100, +1, filling, '#e0b060');                 // IN belt stub
    if (detail) {
      ctx.font = `bold ${Math.max(4, Math.round(5.5*u))}px Arial, sans-serif`;
      ctx.textAlign = AL('left'); ctx.textBaseline = 'middle';
      ctx.fillStyle = filling ? 'rgba(220,170,90,0.95)' : 'rgba(150,120,80,0.8)';
      ctx.fillText('IN', X(2), Y(112));
    }

    // ── Discharge gate + feeder → OUT stub ────────────────────────────
    R(160, 92, 12, 16, '#3a3e44');                                 // gate housing on the wall
    R(162, 94, 8, 2, draining ? '#e0b030' : '#6a6e72');
    RR(172, 94, 30, 12, 2, '#2e2e32');                             // feeder belt
    ln(174, 95.5, 200, 95.5, 'rgba(255,255,255,0.12)', 0.7);
    dot(175, 100, 2.2, STEEL_HI); dot(197, 100, 2.2, STEEL_HI);
    if (draining && detail) {
      for (let k = 0; k < 4; k++) {
        const f = (t * 0.9 + k / 4) % 1;
        dot(172 + f * 34, 99 + Math.sin(t * 30 + k) * 0.3, 1.5, '#15151a');
      }
    }
    beltStub(184, 208, 100, +1, draining, '#e0b060');              // OUT belt stub
    if (detail) {
      ctx.font = `bold ${Math.max(4, Math.round(5.5*u))}px Arial, sans-serif`;
      ctx.textAlign = AL('right'); ctx.textBaseline = 'middle';
      ctx.fillStyle = draining ? 'rgba(220,170,90,0.95)' : 'rgba(150,120,80,0.8)';
      ctx.fillText('OUT', X(198), Y(114));
    }

    // ── Beacon: amber flash when full, steady green while holding stock ─
    {
      const full = fill >= 0.99;
      const lit = online && (full ? Math.sin(t * 6) > 0 : true);
      const bc = !online ? '#3a2a20' : full ? (lit ? '#ffb020' : '#6a4a10') : (stored > 0 || filling ? '#50d060' : '#4a6a4a');
      R(136, 18, 3, 8, STEEL);
      dot(137.5, 16, 3, bc);
      if (online && lit && dark > 0.3 && detail) {
        const g = ctx.createRadialGradient(X(137.5), Y(16), 0, X(137.5), Y(16), 12*u);
        g.addColorStop(0, full ? 'rgba(255,176,32,0.45)' : 'rgba(80,208,96,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(XR(125, 25), Y(4), 25*u, 25*u);
      }
    }

    // ── Stock tag ─────────────────────────────────────────────────────
    if (!e._ghost) {
      const label = !online ? 'OFFLINE' : stored <= 0 ? 'EMPTY' : `${Math.round(fill * 100)}%`;
      ctx.font = `bold ${Math.max(5, Math.round(8*u))}px Arial, sans-serif`;
      const tw = ctx.measureText(label).width / u + 8;
      RR(4, 2, tw, 12, 2, !online ? 'rgba(120,20,16,0.85)' : 'rgba(20,18,14,0.75)');
      ctx.textAlign = AL('left'); ctx.textBaseline = 'middle';
      ctx.fillStyle = !online ? '#ffb0a0' : fill > 0.9 ? '#ff9070' : '#e8c070';
      ctx.fillText(label, X(8), Y(8.5));
    }

    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }
