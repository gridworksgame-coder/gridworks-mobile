/* ═══════════════════════════════════════════════════════════════════
   OIL SYSTEM
   Pump jack extraction, oil storage, and refinery processing.
   ═══════════════════════════════════════════════════════════════════ */

// Gas Station fuel input port. Pipes connect on the station's left face, on
// the row of its fuel-oil storage tank (the second tile row) — the inlet
// renderGasStation draws running into the tank. Stations used to take fuel
// at the face's vertical centre instead; a pipe still laid there is accepted
// too so existing saves stay connected, and the renderer shows that old
// stub only while one is attached.
const GasStationPorts = {
  tankRow(e)   { return e.row + 1; },
  legacyRow(e) { return e.row + Math.floor((e.height || 5) / 2); },
  inputRows(e) {
    const a = this.tankRow(e), b = this.legacyRow(e);
    return a === b ? [a] : [a, b];
  },
  legacyInUse(e) {
    if (this.legacyRow(e) === this.tankRow(e) || typeof GridManager === 'undefined') return false;
    const c = e.col - 1, r = this.legacyRow(e);
    if (!GridManager.inBounds(c, r)) return false;
    const p = GridManager.getEntity(c, r);
    return !!(p && isPipe(p) && pipeAllowsFluid(p, 'fueloil'));
  },
};

// A refinery's CRUDE IN stub: left face, vertically centred — the tile the
// sprite draws "CRUDE IN" on and the only place crude may enter. Pipes that
// merely touch some other perimeter tile (e.g. above the distillation tower)
// must not count as a crude connection.
function refineryCrudeIn(ref) {
  const h = ref.height || 4;
  return { c: ref.col - 1, r: ref.row + Math.floor(h / 2) };
}
// A refinery's FUEL OUT stub: bottom face, centre column — the tile the
// sprite draws it on and the pipe renderer joins at. Fuel oil only ever
// leaves a refinery here. Every fuel-flow search used to start from ANY pipe
// touching the refinery, so a crude line into CRUDE IN got painted as fuel
// all the way back to the pump jack whenever nothing marked it as crude.
function refineryFuelOut(ref) {
  const w = ref.width || 5, h = ref.height || 4;
  return { c: ref.col + Math.floor(w / 2), r: ref.row + h };
}
// A pump jack's OUT stub: the tile below the bottom-centre of its footprint —
// where both sprites draw it and the pipe renderer joins (render_mining_
// conveyor.js). Crude only ever leaves a pump jack here.
function pumpJackOut(pj) {
  const w = pj.width || 3, h = pj.height || 3;
  return { c: pj.col + Math.floor(w / 2), r: pj.row + h };
}
function refineryFuelSeed(ref) {
  const o = refineryFuelOut(ref);
  if (!GridManager.inBounds(o.c, o.r)) return null;
  const g = GridManager.getEntity(o.c, o.r);
  return (g && isPipe(g) && pipeAllowsFluid(g, 'fueloil')) ? o : null;
}
// A refinery's LPG OUT stub: right face, top row — beside the fin-fan
// condenser the light gases come off. The port only exists once the
// Cryogenic Cooling Tower is unlocked; before that the refinery flares all
// of its LPG and a pipe on this tile is not a connection at all.
function refineryLpgOut(ref) {
  return { c: ref.col + (ref.width || 5), r: ref.row };
}
// Port disabled for now — nothing consumes LPG yet, so every refinery flares
// all of it. Re-enable by gating on Progression.isUnlocked(T.COOLINGTOWER2)
// (and restoring the unlock toast in progression.js) once a consumer exists.
function refineryLpgUnlocked() {
  return false;
}
function refineryLpgSeed(ref) {
  if (!refineryLpgUnlocked()) return null;
  const o = refineryLpgOut(ref);
  if (!GridManager.inBounds(o.c, o.r)) return null;
  const g = GridManager.getEntity(o.c, o.r);
  return (g && isPipe(g) && pipeAllowsFluid(g, 'lpg')) ? o : null;
}

const OilSystem = (() => {
  let oilScans = 0;
  let totalCrudeProduced = 0;
  let totalFuelOilProduced = 0;
  let totalLpgProduced = 0;   // every unit of LPG made, recovered or flared
  let totalLpgFlared   = 0;

  const TANK_CAPACITY = 1000;
  const FLOW_RATE     = 8;   // crude units/s through a pipe connection
  const PUMPJACK_YIELD_MULT = 1.17; // +17% pump jack extraction rate
  // Pump Jack MK2 pumps 30% harder than the MK1. It draws the reservoir down
  // 30% faster to match — the same oil comes out of a deposit, it just comes
  // out sooner (same deal as the Coal Mine MK2: speed, not a bigger seam).
  const PUMPJACK2_RATE_MULT = 1.3;
  // Latched the first time any oil deposit runs dry — gates Pump Jack MK2.
  let depositEverExhausted = false;
  const DEPOSIT_SIZE_MULT   = 2.61; // total oil per deposit (via longer depletion time): 1.74 × 1.5
  const DEPLETION_SPEED_MULT = 1.35; // deposits lose pressure 35% faster

  // Latched each oil pass so resolveTankPorts can reuse its probe within a
  // tick (and across the following render frames) instead of BFS-ing twice
  // per stub per caller. Bumped in clearOilPipeFlags.
  let _tankPortsGen = 0;
  let _tankPortsAllGen = -1;   // the pass resolveAllTankPorts last ran in

  // Liquid Storage Tank stub tiles. Default (rotation even / unset): both on
  // the left face, row+1 and row+3 on a 5- or 6-tall tank (the 6-tall one lost
  // the 7-tall one's empty top row, which had them at row+2 and row+4, so they
  // are on the same tiles). Odd rotation flips both to the right face.
  // Direction (IN vs OUT) is NOT fixed to a row: resolveTankPorts() assigns
  // roles from whatever is plugged in.
  function tankStubs(e) {
    const w = e.width || 5, mid = Math.floor(((e.height || 5) - 1) / 2);
    const right = ((e._rotation || 0) % 2) === 1;
    const c = right ? e.col + w : e.col - 1;
    return {
      a: { c, r: e.row + mid - 1 },
      b: { c, r: e.row + mid + 1 },
      right,
    };
  }
  function stubEq(s, c, r) { return !!s && s.c === c && s.r === r; }
  function isTankStubTile(e, c, r) {
    const { a, b } = tankStubs(e);
    return stubEq(a, c, r) || stubEq(b, c, r);
  }

  // The water IN stub of a plant that draws water off a pipe, or null. Lets a
  // water tank recognise these plants as consumers, so the stub they're piped
  // to becomes the tank's OUT. Without it a tank piped only to one of them
  // fell back to the default roles and could make that stub its IN.
  // (The Chemical Plant has its own branch in probeTankStub, for its acid OUT.)
  const PLANT_WATER_TYPES = new Set([T.LITHIUMPROCESSPLANT, T.ELECTROLYZER, T.WASHTOWER, T.REPROCESSOR]);
  function plantWaterInlet(nb) {
    const sys = nb.type === T.LITHIUMPROCESSPLANT ? (typeof LithiumProcessPlantSystem !== 'undefined' && LithiumProcessPlantSystem)
              : nb.type === T.ELECTROLYZER        ? (typeof ElectrolyzerSystem        !== 'undefined' && ElectrolyzerSystem)
              : nb.type === T.WASHTOWER           ? (typeof IsotopicWashTowerSystem   !== 'undefined' && IsotopicWashTowerSystem)
              : nb.type === T.REPROCESSOR         ? (typeof ReprocessingSystem        !== 'undefined' && ReprocessingSystem)
              : nb.type === T.CHEMICALPLANT       ? (typeof ChemicalSystem            !== 'undefined' && ChemicalSystem)
              : null;
    if (!sys) return null;
    const s = sys.getStubs(nb);
    return nb.type === T.CHEMICALPLANT ? s.pipeStubs[0] : (s.waterIn || s.waterStub || null);
  }

  // Probe one stub's pipe run for producers / consumers. Stops at the tank's
  // other stub so a loop that joins both ports can't read as a supply
  // (self-feed). Returns { producer, consumer, selfLoop }.
  // Every tank's two stubs are walked like this every tick (resolveAllTankPorts),
  // so the walk keeps its queue as flat (col, row) pairs read from an index and
  // its visited set as numbers: with an array shift() per tile and a new string
  // key per neighbour it was the largest single cost in a late-game tick (a
  // seventh of all main-thread time with five acid tanks). Same tiles, same order.
  //
  // The walk itself — which pipe tiles it reaches and which buildings it
  // passes — depends only on what is built where, and that rarely changes:
  // re-walking a late-game pipe network from every tank stub every tick was
  // the largest single cost in the tick (about a fifth of it, with five tanks
  // on one big network). So the walk is kept (_tankWalk) and checked against
  // the map once a tick, the way PipeRuns checks its runs: every tile it
  // read must still hold the same thing with the same pipe links. What it
  // found is read afresh on every call — powered water, a tank's fill, which
  // stub of a plant faces it — so the answer is exactly what a fresh walk
  // gives.
  const _PROBE_DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  const _probeKey = (c, r) => c * 65536 + r;
  const _tankWalks = new WeakMap();   // tank -> { a: walk, b: walk }, keyed by which stub is walked

  function _buildTankWalk(e, stub, other) {
    const w = {
      sc: stub ? stub.c : NaN, sr: stub ? stub.r : NaN, oc: other ? other.c : NaN, or: other ? other.r : NaN,
      empty: true, selfLoop: false,
      pipes: [],                          // pipe tiles reached, in walk order
      adj: [], adjC: [], adjR: [],        // what each one touches, and the pipe tile it touches it from
      tc: [], tr: [], tTop: [], tPipe: [], tLinks: [],   // every tile the walk read, and what was there
      tick: SIM_TICK_ID, topo: EntityRegistry.getTopologyVersion(), linkEp: PipeRuns.linkEpoch(), udg: PipeRuns.udgSignature(),
    };
    const read = new Set();
    const touch = (c, r) => {
      if (!GridManager.inBounds(c, r)) return;
      const k = _probeKey(c, r);
      if (read.has(k)) return;
      read.add(k);
      const top = GridManager.getEntity(c, r), p = getPipe(top);
      w.tc.push(c); w.tr.push(r); w.tTop.push(top); w.tPipe.push(p); w.tLinks.push(p ? p._links : undefined);
    };
    // An underground pipe's partner can be anywhere in range, past other ends,
    // and a new end in range can take it, so read every tile out that far.
    const touchTunnel = (c, r, dc, dr) => {
      for (let dist = 1; dist <= UNDERGROUND_PIPE_MAX_SPAN; dist++) {
        const fc = c + dc * dist, fr = r + dr * dist;
        if (!GridManager.inBounds(fc, fr)) return;
        touch(fc, fr);
      }
    };
    const isUdg = (t) => t && t.type === T.UNDERGNDPIPE && (t._udgAxis === 'h' || t._udgAxis === 'v');

    if (!stub || !GridManager.inBounds(stub.c, stub.r)) return w;
    touch(stub.c, stub.r);
    let seed = GridManager.getEntity(stub.c, stub.r);
    if (seed && seed.type === T.WIRE     && seed._underPipe) seed = seed._underPipe;
    if (seed && seed.type === T.CONVEYOR && seed._underPipe) seed = seed._underPipe;
    if (!seed || !isPipe(seed)) return w;
    w.empty = false;

    const visited = new Set();
    const queue = [stub.c, stub.r];
    for (let qi = 0; qi < queue.length; qi += 2) {
      const c = queue[qi], r = queue[qi + 1];
      const key = _probeKey(c, r);
      if (visited.has(key)) continue;
      visited.add(key);
      touch(c, r);
      // Only a pipe standing on the other stub closes a loop. The open tile
      // there is queued too (pipeBfsCoords offers every side), and a pipe
      // merely running past it is not joined to the tank's other port.
      if (other && c === other.c && r === other.r) { if (getPipe(GridManager.getEntity(c, r))) w.selfLoop = true; continue; }

      const tile = GridManager.getEntity(c, r);
      if (!tile) continue;
      const pipeEnt = getPipe(tile);
      if (!pipeEnt) continue;
      w.pipes.push(pipeEnt);

      for (let k = 0; k < 4; k++) {
        const dc = _PROBE_DIRS[k][0], dr = _PROBE_DIRS[k][1];
        const nc = c + dc, nr = r + dr;
        if (!GridManager.inBounds(nc, nr)) continue;
        touch(nc, nr);
        if (other && nc === other.c && nr === other.r) {
          if (getPipe(GridManager.getEntity(nc, nr)) && pipesJoin(c, r, dc, dr)) w.selfLoop = true;
          continue;
        }
        const nb = GridManager.getEntity(nc, nr);
        if (!nb || nb === e) continue;
        w.adj.push(nb); w.adjC.push(c); w.adjR.push(r);
        if (isUdg(nb)) touchTunnel(nc, nr, -dc, -dr);
        if ((isPipe(nb) || (nb.type === T.WIRE && nb._underPipe) || (nb.type === T.CONVEYOR && nb._underPipe)) && pipesJoin(c, r, dc, dr)) {
          if (!visited.has(_probeKey(nc, nr))) queue.push(nc, nr);
        }
      }
      if (isUdg(tile)) for (const [dc, dr] of (tile._udgAxis === 'h' ? [[-1, 0], [1, 0]] : [[0, -1], [0, 1]])) touchTunnel(c, r, dc, dr);
      for (const [nc, nr] of pipeBfsCoords(c, r, null)) {
        if (!GridManager.inBounds(nc, nr)) continue;
        if (!visited.has(_probeKey(nc, nr))) queue.push(nc, nr);
      }
    }
    return w;
  }

  // Is a kept walk still what a fresh one would find? Checked once a tick,
  // and again whenever anything is built, removed or re-linked mid-tick.
  function _tankWalkHolds(w) {
    const topo = EntityRegistry.getTopologyVersion(), linkEp = PipeRuns.linkEpoch();
    if (w.tick === SIM_TICK_ID && w.topo === topo && w.linkEp === linkEp) return true;
    if (w.udg !== PipeRuns.udgSignature()) return false;
    const tiles = GridManager.tiles;
    for (let i = 0; i < w.tc.length; i++) {
      const top = tiles[w.tr[i]][w.tc[i]];
      if (top !== w.tTop[i]) return false;
      const p = getPipe(top);
      if (p !== w.tPipe[i] || (p && p._links !== w.tLinks[i])) return false;
    }
    w.tick = SIM_TICK_ID; w.topo = topo; w.linkEp = linkEp;
    return true;
  }

  function _tankWalk(e, stub, other, side) {
    let m = _tankWalks.get(e);
    if (!m) _tankWalks.set(e, m = {});
    let w = m[side];
    const same = w && w.sc === (stub ? stub.c : NaN) && w.sr === (stub ? stub.r : NaN)
                   && w.oc === (other ? other.c : NaN) && w.or === (other ? other.r : NaN);
    // (NaN never equals itself: a missing stub is simply walked every time.)
    if (!same || !_tankWalkHolds(w)) w = m[side] = _buildTankWalk(e, stub, other);
    return w;
  }

  function probeTankStub(e, stub, other, side) {
    // hardP / hardC are the same signals with other tanks left out, and links
    // lists those tanks: [tank, reached at its `a` stub?]. See resolveAllTankPorts.
    const w = _tankWalk(e, stub, other, side === 'b' ? 'b' : 'a');
    if (w.empty) return { producer: false, consumer: false, selfLoop: false, hardP: false, hardC: false, links: [] };

    let producer = false, consumer = false;
    const selfLoop = w.selfLoop;
    let tankP = false, tankC = false;
    const links = [];
    // Powered water on this run (not this tank's own outlet) is a producer.
    for (let i = 0; i < w.pipes.length; i++) {
      const pipeEnt = w.pipes[i];
      if (pipeEnt.powered && pipeAllowsFluid(pipeEnt, 'water') && pipeEnt._waterTankSrc !== e) { producer = true; break; }
    }
    for (let j = 0; j < w.adj.length; j++) {
      const nb = w.adj[j], c = w.adjC[j], r = w.adjR[j];
      {
        // Every port below is a tile just OUTSIDE its building's footprint,
        // i.e. the pipe tile (c,r) we are standing on -- never the footprint
        // neighbour (nc,nr), which is inside the building and so can never
        // equal a port. Matching (nc,nr) meant no consumer was ever seen, so
        // a tank with only a consumer on one stub fell back to the default
        // (top = IN) and a generator piped to the top stub never got water.
        if (nb.type === T.PUMPJACK || nb.type === T.PUMPJACK2) producer = true;
        else if (nb.type === T.WATEREXTRACTOR) {
          const port = typeof HydroSystem !== 'undefined' ? HydroSystem.extractorOutputPort(nb) : null;
          if (port && port.c === c && port.r === r) producer = true;
        } else if (nb.type === T.CHEMICALPLANT) {
          // Only its ACID OUT stub produces; its H₂O IN stub is a consumer.
          const ao = ChemicalSystem.getStubs(nb).pipeStubs[1];
          if (ao.c === c && ao.r === r) producer = true;
          const wi = plantWaterInlet(nb);
          if (wi && wi.c === c && wi.r === r) consumer = true;
        }
        else if (nb.type === T.REFINERY) {
          // (c,r) is the pipe we're standing on; stubs are outside the
          // footprint, so match against the current tile — not the footprint
          // neighbour (nc,nr).
          const fo = refineryFuelOut(nb);
          const ci = refineryCrudeIn(nb);
          if (c === fo.c && r === fo.r) producer = true;
          if (c === ci.c && r === ci.r) consumer = true;
        } else if (nb.type === T.FUELPLANT && typeof FuelPlantSystem !== 'undefined') {
          // A Fuel Processing Plant drinks acid at its ACID IN stub (it used
          // not to count, so a tank between the acid works and the fuel
          // plant could not tell which of its stubs faced the customer).
          const ai = FuelPlantSystem.getStubs(nb).pipeIn;
          if (ai && c === ai.c && r === ai.r) consumer = true;
        } else if (nb.type === T.FUELGEN) {
          const gh = nb.height || 5;
          if (c === nb.col - 1 && r === nb.row + Math.floor(gh / 2)) consumer = true;
        } else if (nb.type === T.GASSTATION) {
          if (c === nb.col - 1 && GasStationPorts.inputRows(nb).includes(r)) consumer = true;
        } else if (nb.type === T.COALGENERATOR) {
          const cgW = nb.width || 3, cgH = nb.height || 4;
          if (c === nb.col + Math.floor(cgW / 2) && r === nb.row + cgH) consumer = true;
        } else if (nb.type === T.COOLINGTOWER && typeof CoolingTowerSystem !== 'undefined') {
          const { hotIn } = CoolingTowerSystem.getStubs(nb);
          if (hotIn && c === hotIn.c && r === hotIn.r) consumer = true;
        } else if (PLANT_WATER_TYPES.has(nb.type)) {
          const wi = plantWaterInlet(nb);
          if (wi && c === wi.c && r === wi.r) consumer = true;
        } else if (nb.type === T.OILSTORAGE && nb !== e && isTankStubTile(nb, c, r)) {
          // Another tank on this run: stock can overflow this way (producer)
          // or accept overflow (consumer). Roles on that tank are separate.
          if ((nb._crude || 0) > 0.001) tankP = true;
          if ((nb._crude || 0) < TANK_CAPACITY - 0.001) tankC = true;
          const viaA = stubEq(tankStubs(nb).a, c, r);
          if (!links.some(l => l[0] === nb && l[1] === viaA)) links.push([nb, viaA]);
        }
      }
    }
    // A self-loop means this stub's "supply" may be the tank's own outlet —
    // never treat that as a producer.
    if (selfLoop) producer = false;
    const hardP = producer, hardC = consumer;
    return { producer: producer || (tankP && !selfLoop), consumer: consumer || tankC, selfLoop, hardP, hardC, links };
  }

  // Which stub is IN ('a' or 'b') given a producer / consumer flag for each,
  // or null if they don't say.
  // Producer on a stub → that stub is IN, the other is OUT.
  // Consumer on a stub → that stub is OUT, the other is IN.
  function tankInSide(pA, cA, pB, cB) {
    if (pA && !pB) return 'a';
    if (pB && !pA) return 'b';
    if (cA && !cB) return 'b';
    if (cB && !cA) return 'a';
    if (pA && cB) return 'a';
    if (pB && cA) return 'b';
    return null;
  }

  // One tank's roles from its own two stubs alone.
  // Empty / ambiguous → legacy default (row+1 = IN, row+3 = OUT).
  function tankRolesAlone(sigA, sigB, fedByAir) {
    const anyA = sigA.producer || sigA.consumer, anyB = sigB.producer || sigB.consumer;
    // Its supply arrives by road or air, so the one stub with anything on
    // it is the way OUT. Without this a supplied tank at the head of a row
    // read the stocked tank piped to it as its own supplier, pointed its
    // IN at it, and passed nothing on.
    if (fedByAir && anyA !== anyB) return anyA ? 'b' : 'a';
    return tankInSide(sigA.producer, sigA.consumer, sigB.producer, sigB.consumer) || 'a';
  }

  // Only which stub is IN is kept, and where the tank stood when that was
  // worked out. The tiles themselves are read off the tank afresh each time.
  // (The two port tiles were kept, as map coordinates. A tank picked up and
  // moved, or the ghost of one being placed, went on reporting the tiles it
  // had left until the next oil pass, and with the game paused there is no
  // next pass: its nozzles were drawn sliding about and off the tank, and
  // pipes laid to them joined nothing.)
  // known: something on either stub said which way it runs. Without it the
  // roles are only the default, and the labels are not drawn (see
  // renderOilStorage), so a bare tank doesn't claim fixed IN/OUT ports.
  const _sigsSay = (a, b) => !!(a.producer || a.consumer || b.producer || b.consumer);
  function stampTankPorts(e, stubs, inSide, known) {
    e._tankInSide = inSide;
    e._tankPortsKnown = !!known;
    e._tankRight = stubs.right;
    e._tankPortsGen = _tankPortsGen;
    e._tankPortsRot = e._rotation || 0;
    e._tankPortsAir = !!(e._truckSupply || e._droneSupply);
    e._tankPortsCol = e.col; e._tankPortsRow = e.row;
  }

  // Roles for every tank on the map at once. A tank with a building on one
  // of its stubs (a producer or a consumer that is not another tank) takes
  // its roles from that and keeps them; the tanks piped to it follow on, each
  // one's IN facing the last one's OUT, so a row all points the same way.
  // Only tanks no such row reaches fall back to reading how full their
  // neighbours are.
  // (Every tank used to read its neighbours' fill: stocked meant producer,
  // room meant consumer. In a row of full tanks one sip from the first made
  // it a consumer to the second, which turned round to top it up, became a
  // consumer itself to the first, which turned back... the roles went round
  // every tick, the line they fed lost its supply two ticks in three, and
  // with the first tank empty the row locked solid with the rest still full.)
  function resolveAllTankPorts() {
    const recs = new Map(), queue = [];
    for (const e of EntityRegistry.getByType(T.OILSTORAGE)) {
      const stubs = tankStubs(e);
      const rec = { e, stubs, sigA: probeTankStub(e, stubs.a, stubs.b, 'a'), sigB: probeTankStub(e, stubs.b, stubs.a, 'b'), inSide: null };
      recs.set(e, rec);
      const anyA = rec.sigA.producer || rec.sigA.consumer, anyB = rec.sigB.producer || rec.sigB.consumer;
      // Filled by Haulers or drones rather than by pipe (Truck / Drone Supply).
      if ((e._truckSupply || e._droneSupply) && anyA !== anyB) rec.inSide = anyA ? 'b' : 'a';
      else rec.inSide = tankInSide(rec.sigA.hardP, rec.sigA.hardC, rec.sigB.hardP, rec.sigB.hardC);
      if (rec.inSide) queue.push(rec);
    }
    for (let i = 0; i < queue.length; i++) {
      const x = queue[i];
      for (const side of ['a', 'b']) {
        const isOut = x.inSide !== side;
        for (const [nb, viaA] of (side === 'a' ? x.sigA : x.sigB).links) {
          const y = recs.get(nb);
          if (!y || y.inSide) continue;
          // Off x's OUT: that stub of the next tank is its IN. Off x's IN:
          // the next tank feeds x, so that stub is its OUT.
          y.inSide = isOut === viaA ? 'a' : 'b';
          queue.push(y);
        }
      }
    }
    for (const rec of recs.values()) {
      const e = rec.e;
      stampTankPorts(e, rec.stubs, rec.inSide || tankRolesAlone(rec.sigA, rec.sigB, !!(e._truckSupply || e._droneSupply)),
                     !!rec.inSide || _sigsSay(rec.sigA, rec.sigB));
    }
  }

  // Assign complementary IN / OUT from what's plugged into the two stubs.
  function resolveTankPorts(e) {
    const stubs = tankStubs(e);
    const rot = e._rotation || 0;
    const fedByAir = !!(e._truckSupply || e._droneSupply);
    const fresh = () => e._tankPortsGen === _tankPortsGen && e._tankPortsRot === rot && e._tankPortsAir === fedByAir
                     && e._tankPortsCol === e.col && e._tankPortsRow === e.row && !!e._tankInSide;
    if (!fresh()) {
      // A tank seen before (a new pass, or it was moved, turned or switched
      // to Truck / Drone Supply): work the whole map out again. One that is
      // not on the map yet (just placed, or a ghost) is read on its own.
      if (e._tankPortsGen !== undefined || _tankPortsAllGen !== _tankPortsGen) { _tankPortsAllGen = _tankPortsGen; resolveAllTankPorts(); }
      if (!fresh()) {
        const sA = probeTankStub(e, stubs.a, stubs.b, 'a'), sB = probeTankStub(e, stubs.b, stubs.a, 'b');
        stampTankPorts(e, stubs, tankRolesAlone(sA, sB, fedByAir), _sigsSay(sA, sB));
      }
    }
    const inA = e._tankInSide === 'a';
    return { in: inA ? stubs.a : stubs.b, out: inA ? stubs.b : stubs.a, a: stubs.a, b: stubs.b, right: stubs.right, known: !!e._tankPortsKnown };
  }

  // BFS through T.PIPE tiles from fromEntity perimeter.
  // Marks all reachable pipes _oilActive and _oilFlowDC/_oilFlowDR.
  function findViaOilPipe(fromEntity, targetTypes) {
    return findAllViaOilPipe(fromEntity, targetTypes)[0] || null;
  }

  // Room left for crude in a pump jack / tank destination: a Liquid Storage
  // Tank that isn't holding another liquid (tanks lock to whichever fluid
  // fills them first; see tickStorageTank), or a Refinery's crude intake.
  function crudeSpace(t) {
    if (t.type === T.REFINERY) return Math.max(0, (EntityDefs[T.REFINERY].crudeCapacity || 200) - (t._crudeBuffer || 0));
    if (t._draining) return 0;   // being emptied (StorageDrain): takes nothing in
    const tankType = t._liquidType || ((t._crude || 0) > 0 ? 'oil' : null);
    return (tankType === null || tankType === 'oil') ? Math.max(0, TANK_CAPACITY - (t._crude || 0)) : 0;
  }
  function crudeTargetLive(t) {
    return t.type === T.OILSTORAGE ? OilSystem.tankOnline(t) : !!t.powered;
  }
  // The pipe tile crude enters `t` from: a tank's IN stub, a refinery's CRUDE IN.
  function crudeInTile(t) {
    return t.type === T.REFINERY ? refineryCrudeIn(t) : resolveTankPorts(t).in;
  }
  // Share `amount` of crude across `targets` as evenly as their free room
  // allows (anything one can't take is re-offered to the rest), so every
  // refinery or tank on a line gets fed instead of only the first one the
  // pipe search happened to reach. Returns how much was actually delivered.
  function splitCrude(targets, amount, src) {
    let open = targets.filter(t => crudeSpace(t) > 0);
    let left = amount, moved = 0;
    while (left > 1e-6 && open.length) {
      const share = left / open.length;
      const next = [];
      for (const t of open) {
        const take = Math.min(share, crudeSpace(t));
        if (take <= 0) continue;
        if (t.type === T.REFINERY) t._crudeBuffer = (t._crudeBuffer || 0) + take;
        else { t._crude = (t._crude || 0) + take; t._liquidType = 'oil'; }
        left -= take; moved += take;
        if (src && typeof FlowMeter !== 'undefined') FlowMeter.record(src, t, 'oil', take);
        if (crudeSpace(t) > 0) next.push(t);
      }
      if (next.length === open.length && share <= 1e-9) break;
      open = next;
    }
    return moved;
  }

  // Every entity of `targetTypes` the pipe network from a pump jack's OUT
  // stub reaches (in discovery order).
  function findAllViaOilPipe(fromEntity, targetTypes) {
    // Mark all T.PIPE tiles reachable from fromEntity via pipe adjacency.
    // Uses a simple visited-set BFS. No frills.
    window._oilBFS = window._oilBFS || {calls:0, pipes:0};
    window._oilBFS.calls++;
    const visited = new Set();
    const todo = [];

    // Seed: the OUT stub only. This used to seed from every pipe touching the
    // jack's perimeter, so a fuel-oil line merely running past the jack got
    // flooded with crude — which then blocked the refinery from sending fuel
    // down it (pipes never mix fluids), starving every generator on it.
    const ec = fromEntity.col, er = fromEntity.row;
    const ew = fromEntity.width || 1, eh = fromEntity.height || 1;
    const srcC = ec + ew / 2, srcR = er + eh / 2;
    const out = pumpJackOut(fromEntity);
    if (GridManager.inBounds(out.c, out.r)) {
      const t = GridManager.getEntity(out.c, out.r);
      if (t && isPipe(t) && pipeAllowsFluid(t, 'oil')) todo.push([out.c, out.r, srcC, srcR]);
    }

    const targets = [];
    while (todo.length) {
      const [c, r, fromC, fromR] = todo.pop();
      const key = c + ',' + r;
      if (visited.has(key)) continue;
      visited.add(key);

      const tile = GridManager.getEntity(c, r);
      if (!tile) continue;

      // Also treat a wire with _underPipe as a pipe for BFS purposes
      const effectivePipe = getPipe(tile);
      if (effectivePipe) {
        effectivePipe._oilActive = true;
        effectivePipe._flowRate = FLOW_RATE;
        effectivePipe._oilFlowDC = Math.sign(c - fromC);
        effectivePipe._oilFlowDR = Math.sign(r - fromR);
        window._oilBFS.pipes++;
        const nbrs = pipeBfsCoords(c, r, 'oil');
        for (const [nc, nr] of nbrs) {
          if (!GridManager.inBounds(nc, nr)) continue;
          const nkey = nc + ',' + nr;
          if (visited.has(nkey)) continue;
          const nb = GridManager.getEntity(nc, nr);
          if (!nb) continue;
          if (nb === fromEntity) continue;
          if (isPipe(nb) || (nb.type === T.WIRE && nb._underPipe) || (nb.type === T.CONVEYOR && nb._underPipe)) {
            todo.push([nc, nr, c, r]);
          } else if (targetTypes.includes(nb.type)) {
            // Liquid Storage Tank: only deliver at the resolved IN stub, never
            // through the OUT face or an arbitrary perimeter tile.
            if (nb.type === T.OILSTORAGE) {
              const ports = resolveTankPorts(nb);
              if (!(c === ports.in.c && r === ports.in.r)) continue;
            }
            // Oil Refinery: crude only enters at CRUDE IN — never through
            // FUEL OUT or any other perimeter tile the pipe happens to touch.
            if (nb.type === T.REFINERY) {
              const ci = refineryCrudeIn(nb);
              if (!(c === ci.c && r === ci.r)) continue;
            }
            if (!targets.includes(nb)) targets.push(nb);
          }
        }
      }
    }
    return targets;
  }

  // BFS through pipe tiles starting from a single seed tile (e.g. a Liquid
  // Storage Tank's fixed IN stub), looking for a directly-adjacent entity
  // of targetType that satisfies checkFn. Used for acid/fuel-oil intake,
  // which — unlike oil (push-based) or water (presence-based) — need to
  // find and drain a specific producer's buffer.
  function findViaPipeBFS(startC, startR, targetType, checkFn, fluid) {
    const run = pipeRun(startC, startR, fluid);
    for (let j = 0; j < run.pn; j++) {
      const nb = run.pe[j];
      if (nb.type !== targetType) continue;
      const c = run.ptc[j], r = run.ptr[j];
      // (c,r) is the pipe that reached this building. For a Refinery,
      // fuel oil only leaves via FUEL OUT — ignore any other face.
      if (nb.type === T.REFINERY) {
        const fo = refineryFuelOut(nb);
        if (!(c === fo.c && r === fo.r)) continue;
      }
      // Chemical Plant: acid only leaves via ACID OUT, not the water IN stub.
      if (nb.type === T.CHEMICALPLANT) {
        const ao = ChemicalSystem.getStubs(nb).pipeStubs[1];
        if (!(c === ao.c && r === ao.r)) continue;
      }
      if (checkFn(nb)) return nb;
    }
    return null;
  }

  // A fuel consumer's inlet (column c, any of `rows`) is on `line` and the
  // fuel has visibly run down to it.
  function _fuelReaches(line, c, rows) {
    return !!line && rows.some(r => pipeRunHas(line, c, r) && pipeArrivedAt(c, r, 'fueloil'));
  }

  // Flag every pipe of a run as carrying a liquid and stamp which way it
  // flows: away from the tile the walk reached it from. A tile the run starts
  // on flows the way (seedDC, seedDR) says, out of the port that feeds it.
  function _lightRun(run, flag, rate, seedDC, seedDR) {
    for (let i = 0; i < run.n; i++) {
      const p = run.pipe[i], pi = run.par[i];
      p[flag] = true;
      p._flowRate  = rate;
      p._oilFlowDC = pi < 0 ? seedDC : Math.sign(run.c[i] - run.c[pi]);
      p._oilFlowDR = pi < 0 ? seedDR : Math.sign(run.r[i] - run.r[pi]);
    }
  }

  function spawnOilDeposits() {
    // Gate: oil scanning requires the Oil Scan ability unlocked at
    // Research Station MK2 (which itself requires 30,000t coal mined).
    if (!Progression.isUnlocked(T.OILSCAN)) return 0;
    const tiers = [
      { size: 2, label: 'Small Oil Deposit',  chance: 0.55 },
      { size: 3, label: 'Medium Oil Deposit', chance: 0.35 },
      { size: 4, label: 'Large Oil Deposit',  chance: 0.10 },
    ];
    const roll = Math.random();
    let tier = tiers[0];
    let acc = 0;
    for (const t of tiers) { acc += t.chance; if (roll < acc) { tier = t; break; } }

    const count = 2 + Math.floor(Math.random() * 4);
    let spawned = 0;
    const s = tier.size;
    for (let attempt = 0; attempt < 80 && spawned < count; attempt++) {
      const col = DEPOSIT_FIELD.c0 + Math.floor(Math.random() * (DEPOSIT_FIELD.cols - s - 2)) + 1;
      const row = DEPOSIT_FIELD.r0 + Math.floor(Math.random() * (DEPOSIT_FIELD.rows - s - 2)) + 1;
      if (!isOuterZone(col, row, s, s)) continue;
      if (!GridManager.canPlaceFootprint(col, row, s, s)) continue;
      let waterBlocked = false;
      for (let dr = 0; dr < s && !waterBlocked; dr++)
        for (let dc = 0; dc < s && !waterBlocked; dc++)
          if (WaterSystem.isWater(col+dc, row+dr)) waterBlocked = true;
      if (waterBlocked) continue;
      if (!depositClearOfWater(T.OILDEPOSIT, col, row, s, s)) continue;   // room for a pump jack (resource_helpers.js)
      const deposit       = new Entity(T.OILDEPOSIT, col, row);
      deposit.width       = s;
      deposit.height      = s;
      deposit._tierLabel  = tier.label;
      deposit._oilPhase   = Math.random() * Math.PI * 2;
      deposit._totalUnits = Math.round((3000 + Math.random() * 9000) * s);
      GridManager.setEntityFootprint(deposit);
      if (typeof WorldMapSystem !== 'undefined') WorldMapSystem.registerDiscovery(T.OILDEPOSIT, col, row, s, s);
      spawned++;
    }
    return spawned;
  }

  // Call once per game tick to reset pipe oil/fuel-oil-active flags using
  // EntityRegistry (fast). Acid and cool flags are cleared by their own
  // systems (ChemicalSystem/CoolingTowerSystem) right before they
  // recompute, NOT here — otherwise, at the moment this runs, acid/cool
  // pipes would briefly read back as "unclaimed" even though they're still
  // carrying their fluid from last tick, letting oil's BFS below flood
  // straight through them into whatever they're plumbed to.
  // Networks with a source producing power right now — what tickFuelGenerator
  // needs to know before it lets an engine burn (see the note there). An engine
  // already running counts; one still cranking or coasting down does not.
  //
  // It used to find out by scanning every entity in the world, once per fuel
  // generator per tick. The registry holds every tree and bush too, so with a
  // handful of generators that scan was the single largest cost in the whole
  // frame (~20% of an 11s profile). One scan per tick serves every generator;
  // an engine that stops during the tick is seen on the next one.
  let _poweredNetsTick = null;
  function _poweredNetworks() {
    if (_poweredNetsTick) return _poweredNetsTick;
    const nets = new Set();
    // active(): water, trees and bushes never join a network (no networkId).
    for (const e of EntityRegistry.active()) {
      const id = e.networkId;
      if (id === undefined || id < 0 || nets.has(id)) continue;
      let out = 0;
      if      (e.type === T.FUELGEN)        out = e._fgIgnited ? 1 : 0;
      else if (e.type === T.BIOFUELGEN)     out = e._biofuelOutput || 0;
      else if (e.type === T.COALGENERATOR)  out = (e._fuelled && e._hasWater) ? (e.def.powerOutput || 0) : 0;
      else if (e.type === T.NUCLEARREACTOR) out = e._generating ? (e._currentOutput || 0) : 0;
      else if (e.type === T.SUBSTATION || e.type === T.SUBSTATION2 || e.type === T.SUBSTATION3 || e.type === T.SUBSTATION4 || e.type === T.SUBSTATION5 || e.type === T.BATTERY)
                                            out = (e.charge || 0) > 0.01 ? 1 : 0;  // stored charge counts as power
      else                                  out = (e.def && e.def.powerOutput) || 0;
      if (out > 0.01) nets.add(id);
    }
    return (_poweredNetsTick = nets);
  }

  function clearOilPipeFlags() {
    // Top of every oil tick: the powered-network answer is per tick.
    _poweredNetsTick = null;
    _tankPortsGen++;
    // Every pipe, including those stacked under conveyors or wires.
    for (const p of allPipes()) { p._oilActive = false; p._fuelOilActive = false; p._lpgActive = false; }
  }

  // Light the LPG OUT run while the refinery holds recovered LPG — the same
  // rule FUEL OUT uses for fuel oil. Returns true if a pipe was reached.
  function markRefineryLpgPipes(e) {
    const seed = refineryLpgSeed(e);
    if (!seed) return false;
    const rate = EntityDefs[T.REFINERY].lpgPerSec;
    const visited = new Set();
    const queue = [{ c: seed.c, r: seed.r, fromC: seed.c - 1, fromR: seed.r }];
    while (queue.length) {
      const { c, r, fromC, fromR } = queue.shift();
      const key = `${c},${r}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const tile = GridManager.getEntity(c, r);
      if (!tile || !isPipe(tile)) continue;
      const p = getPipe(tile) || tile;
      if (!pipeAllowsFluid(p, 'lpg')) continue;
      p._lpgActive = true;
      p._flowRate  = rate;
      p._oilFlowDC = Math.sign(c - fromC);
      p._oilFlowDR = Math.sign(r - fromR);
      for (const [nc, nr] of pipeBfsCoords(c, r, 'lpg'))
        if (GridManager.inBounds(nc, nr) && !visited.has(`${nc},${nr}`)) queue.push({ c: nc, r: nr, fromC: c, fromR: r });
    }
    return true;
  }

  // Walks the fuel-oil pipe network from the inlet tiles at (inputCol, each
  // of inputRows) and returns the refineries (reached at FUEL OUT) and fuel
  // tanks (reached at their OUT stub) on it. Then marks the pipes carrying
  // fuel from each running refinery, with flow direction, for rendering.
  // Shared by the Fuel Power Generator and the Gas Station.
  function _scanFuelLine(inputCol, inputRows) {
    const connectedRefineries = [];
    const connectedTanks      = [];   // fuel-holding Liquid Storage Tanks reached at their OUT stub
    // The line is walked once and kept (pipeRunFrom), not flooded afresh for
    // every consumer every tick; what each tile touches is read back in the
    // order the walk met it.
    const seeds = [];
    for (const inputRow of inputRows) seeds.push(inputCol, inputRow);
    const line = pipeRunFrom(seeds, 'fueloil');
    for (let j = 0; j < line.pn; j++) {
      const nt = line.pe[j], c = line.ptc[j], r = line.ptr[j];
      if (nt.type === T.REFINERY && !connectedRefineries.includes(nt)
          && c === refineryFuelOut(nt).c && r === refineryFuelOut(nt).r) connectedRefineries.push(nt);   // reached at FUEL OUT
      else if (nt.type === T.OILSTORAGE && nt._liquidType === 'fuel') {
        const op = resolveTankPorts(nt).out;
        if (c === op.c && r === op.r && !connectedTanks.includes(nt)) connectedTanks.push(nt);
      }
    }

    // Pass 2: out from each refinery, marking the pipes fuel is flowing
    // through and which way (refinery → consumer). A wire or belt laid over a
    // pipe owns the grid tile; it is the pipe underneath that is marked.
    const out = [];
    for (const ref of connectedRefineries) {
      // Only show fuel in the line when there is fuel to send: a refinery
      // that's merely connected (no crude, struck, unpowered) used to light
      // the whole line every running tick — and go dark on pause, the one
      // time this pass doesn't run — even though nothing was flowing.
      if (!ref.powered || ref._lightningDamaged) continue;
      if (!((ref._fuelOil || 0) > 0.01 || ref._refStatus === 'running')) continue;
      const _fo = refineryFuelSeed(ref);   // fuel leaves only via FUEL OUT
      if (_fo) out.push(_fo.c, _fo.r);
    }
    if (out.length) _lightRun(pipeRunFrom(out, 'fueloil'), '_fuelOilActive', EntityDefs[T.REFINERY].fuelPerSec, 0, 1);

    return { connectedRefineries, connectedTanks };
  }

  return {
    clearOilPipeFlags,
    tankStubs,
    resolveTankPorts,
    isTankStubTile,
    hasDeposits() {
      return EntityRegistry.getByType(T.OILDEPOSIT).size > 0;
    },
    isPumpJack(e) { return !!e && (e.type === T.PUMPJACK || e.type === T.PUMPJACK2); },
    PUMPJACK2_RATE_MULT,
    // True once the player has pumped an oil deposit dry. Also true for a save
    // from before this was tracked that already holds an exhausted deposit.
    hasExhaustedDeposit() {
      if (depositEverExhausted) return true;
      for (const d of EntityRegistry.getByType(T.OILDEPOSIT)) {
        if (d._pressure !== undefined && d._pressure <= 0) { depositEverExhausted = true; return true; }
      }
      return false;
    },
    loadDepositExhausted(v) { depositEverExhausted = !!v; },

    // Tick a pump jack: produce crude, push via pipe chain to connected storage tank
    tickPumpJack(e, dt) {
      if (!e.powered) return;
      // Find linked deposit — search EntityRegistry since the pump jack footprint
      // overlaps the deposit, removing it from the grid at placement time.
      if (!e._linkedDeposit) {
        const pw = e.width || 3, ph = e.height || 3;
        for (const dep of EntityRegistry.getByType(T.OILDEPOSIT)) {
          const dw = dep.width || 2, dh = dep.height || 2;
          const overlapC = e.col < dep.col + dw && e.col + pw > dep.col;
          const overlapR = e.row < dep.row + dh && e.row + ph > dep.row;
          if (overlapC && overlapR) { e._linkedDeposit = dep; break; }
        }
        // Fallback: match by coords stored at placement time
        if (!e._linkedDeposit && e._depositCol !== undefined) {
          for (const dep of EntityRegistry.getByType(T.OILDEPOSIT)) {
            if (dep.col === e._depositCol && dep.row === e._depositRow) {
              e._linkedDeposit = dep; break;
            }
          }
        }
      }
      const dep = e._linkedDeposit;
      if (!dep) return;

      if (dep._pressure === undefined) dep._pressure = 1.0;
      if (dep._crudeBuffer === undefined) dep._crudeBuffer = 0;
      e._pressure = dep._pressure;
      if (dep._pressure <= 0) {
        e._crudeRate     = 0;
        e._pipeConnected = false;
        return;
      }

      // Back-pressure: if the connected storage tank is already full and
      // there's still unshipped crude sitting in the deposit's buffer with
      // nowhere to go (typically because the refinery downstream stalled
      // on a full sludge-waste buffer, so it stopped pulling from the
      // tank), hold off drawing more crude from the deposit — the whole
      // line reads as backed up instead of the pump quietly depleting the
      // reservoir into an unbounded buffer.
      // Room left for crude in whatever this jack pipes into: a Liquid Storage
      // Tank that isn't holding another liquid (tanks lock to whichever fluid
      // fills them first; see tickStorageTank), or a Refinery's crude intake.
      // Every tank / refinery this jack's pipe reaches (see crudeSpace).
      const _pumpTargets = findAllViaOilPipe(e, [T.OILSTORAGE, T.REFINERY]);
      if (dep._crudeBuffer > 0 && _pumpTargets.length > 0 &&
          _pumpTargets.every(t => crudeSpace(t) <= 0)) {
        e._crudeRate     = 0;
        e._pipeConnected = false;
        e._backPressured = true;   // PowerNetwork._outputFull: draw nothing while backed up
        return;
      }
      e._backPressured = false;
      // Room opened up, but this tick was solved as idle (no power charged) —
      // start pumping again next tick.
      if (e._idleFull) { e._crudeRate = 0; return; }

      const rateMult = e.type === T.PUMPJACK2 ? PUMPJACK2_RATE_MULT : 1;
      const depletionRate = rateMult * dt * DEPLETION_SPEED_MULT / (14400 * DEPOSIT_SIZE_MULT * 2 * (typeof Difficulty !== 'undefined' ? Difficulty.depositMult() : 1));
      dep._pressure = Math.max(0, dep._pressure - depletionRate);
      if (dep._pressure <= 0) depositEverExhausted = true;
      e._pressure   = dep._pressure;

      // Low/exhausted warnings — see checkDepositDepletion in
      // resource_helpers.js. The low warning used to be a toast, and
      // reaching zero pressure produced no notice at all: the pump simply
      // stopped and the player was left to work out why on their own.
      checkDepositDepletion(dep, dep._pressure, 'oil');

      // A pump jack pumps at its full rated speed for as long as the deposit
      // holds any oil — pressure is how much is LEFT, not how fast it comes
      // out. It used to scale the rate by pressure (and harder still below
      // 30%), so a half-drained deposit quietly halved every generator
      // downstream long before it ran dry.
      // The rate is anchored to the refinery's crudePerSec, so one pump jack
      // keeps a refinery running at its max fuelPerSec output (2.2 fuel
      // oil/s — enough for 2.2 Fuel Generators, each drawing 1/s), boosted by
      // PUMPJACK_YIELD_MULT on top.
      const crudeRate = EntityDefs[T.REFINERY].crudePerSec * PUMPJACK_YIELD_MULT * rateMult;
      dep._crudeBuffer = (dep._crudeBuffer || 0) + crudeRate * dt;
      totalCrudeProduced += crudeRate * dt;
      e._crudeRate = crudeRate;

      // Push crude via the pipe network into Liquid Storage Tanks and/or
      // straight into Refinery crude intakes, split across ALL of them. It
      // used to go only to the first one the pipe search reached, so a
      // second refinery on the same line never received a drop — which left
      // a Pump Jack MK2's extra 30% with nowhere to go (one refinery takes
      // 3.3/s; an MK2 pumps 5.0/s, enough for two refineries → 3.35 fuel/s,
      // three Fuel Generators at Normal).
      if (dep._crudeBuffer > 0) {
        const live = _pumpTargets.filter(crudeTargetLive);
        // Only those the crude has visibly reached down the line take any.
        const reached = live.filter(t => { const p = crudeInTile(t); return pipeArrivedAt(p.c, p.r, 'oil'); });
        const moved = reached.length ? splitCrude(reached, Math.min(dep._crudeBuffer, FLOW_RATE * dt), e) : 0;
        dep._crudeBuffer -= moved;
        // Nothing moves while paused — don't read that as a broken line, nor
        // a line the crude is still running down.
        if (dt > 0) e._pipeConnected = moved > 0 || reached.length < live.length;
      }
    },

    // Tick a Liquid Storage Tank. Auto-detects its fluid type from whichever
    // source it's connected to (oil via pump jack push above, water/acid/
    // fuel oil pulled here) and locks to it until fully drained back to 0 —
    // e._liquidType is null (empty, any fluid welcome) or one of
    // 'oil'/'water'/'acid'/'fuel'. e._crude is the generic amount field
    // (kept for save compatibility with pre-existing oil-only tanks).
    // A tank is a passive vessel: it holds and passes fluid whether or not it
    // sits on a live power network. e.powered can't stand in for that — a
    // building with no draw still reads unpowered unless it's on a network
    // with supply — so only a lightning strike takes a tank offline.
    tankOnline(e) { return !!e && !e._lightningDamaged; },

    // Tank → tank chaining. A tank's OUT stub hands its liquid on to every
    // other Liquid Storage Tank whose IN stub sits on that pipe run, whenever
    // the next tank has room, so stock runs down a row of tanks to whatever
    // the last one feeds. (It used to pass on only the overflow of a FULL
    // tank, which is the same as passing on its inflow: with the producer
    // stopped, a full tank sat beside an empty one and the consumer behind
    // that starved. Storage Containers and Gas Holders pass stock along the
    // same way.)
    // Water is left out: tanks already pass it on through the water network.
    // The pipes on the run are lit with the liquid whenever there's any to
    // show, not only while it's overflowing.
    // IN/OUT roles come from resolveTankPorts (what's plugged into each stub).
    // Every tank chained off `e`'s OUT stub, and off theirs, that could be
    // holding `kind`. A tank teed off a line (maker and user both on its IN
    // stub) passes stock on down its row and cannot push it back, so whoever
    // draws on the line at that stub draws on the whole row behind it.
    // `lines` (optional, a Map): each tank's OUT line once fetched, for a
    // caller asking about several tanks in one go with nothing changing in
    // between (hasAcidPipe walks a chain from every tank on its line, and
    // each fetch re-checks a line of a thousand-odd tiles).
    tanksBehind(e, kind, into = [], lines = null) {
      const fluid = kind === 'acid' ? 'acid' : kind === 'fuel' ? 'fueloil' : 'oil';
      const ports = resolveTankPorts(e);
      let line = lines && lines.get(e);
      if (!line) {
        line = pipeRunFrom([ports.out.c, ports.out.r], fluid, ports.in.c, ports.in.r);
        if (lines) lines.set(e, line);
      }
      for (let k = 0; k < line.an; k++) {
        const n = line.ae[k];
        if (n.type !== T.OILSTORAGE || n === e || into.includes(n) || !this.tankOnline(n)) continue;
        if (n._liquidType != null && n._liquidType !== kind) continue;
        const np = resolveTankPorts(n);
        if (line.atc[k] !== np.in.c || line.atr[k] !== np.in.r) continue;
        into.push(n);
        this.tanksBehind(n, kind, into, lines);
      }
      return into;
    },

    chainTanks(e, dt) {
      e._chainPipes = null; e._chainFluid = null;
      const kind = e._liquidType;
      if (!kind || kind === 'water' || !((e._crude || 0) > 0) || !this.tankOnline(e)) return;
      const fluid = kind === 'acid' ? 'acid' : kind === 'fuel' ? 'fueloil' : 'oil';
      const ports = resolveTankPorts(e);
      const outC = ports.out.c, outR = ports.out.r;
      // The run off the OUT stub, never through this tank's own IN stub (a
      // loop of pipe back to it is a self-feed, not a chain).
      const line = pipeRunFrom([outC, outR], fluid, ports.in.c, ports.in.r);
      if (!line.n) return;
      const pipes = line.pipe, downstream = [];
      const seedDC = Math.sign(outC - e.col);
      for (let i = 0; i < line.n; i++) {
        const p = pipes[i], pi = line.par[i];
        p._chainDC = pi < 0 ? seedDC : Math.sign(line.c[i] - line.c[pi]);
        p._chainDR = pi < 0 ? 0      : Math.sign(line.r[i] - line.r[pi]);
      }
      for (let k = 0; k < line.an; k++) {
        const n = line.ae[k];
        if (n.type !== T.OILSTORAGE || n === e) continue;
        const np = resolveTankPorts(n);
        if (line.atc[k] === np.in.c && line.atr[k] === np.in.r &&
            !downstream.includes(n) && this.tankOnline(n) && !n._draining &&
            (n._liquidType == null || n._liquidType === kind || (n._crude || 0) <= 0.001)) downstream.push(n);
      }
      if (!downstream.length) return;
      // Light the run. Crude and fuel flags survive to render (cleared at the
      // top of the oil pass); acid flags are wiped by clearAcidPipeFlags
      // later in the tick, which re-applies them from _chainPipes.
      for (const p of pipes) {
        if (fluid === 'oil')          { p._oilActive = true;     p._flowRate = FLOW_RATE; p._oilFlowDC = p._chainDC; p._oilFlowDR = p._chainDR; }
        else if (fluid === 'fueloil') { p._fuelOilActive = true; p._flowRate = FLOW_RATE; p._oilFlowDC = p._chainDC; p._oilFlowDR = p._chainDR; }
        else                          { p._acidActive = true;    p._flowRate = FLOW_RATE; }
      }
      e._chainPipes = pipes; e._chainFluid = fluid;
      e._pipeConnected = true;
      // Up to one tick's flow, shared across the next tanks that have room
      // and that the liquid has reached down the run.
      if (dt <= 0) return;
      let budget = Math.min(FLOW_RATE * dt, e._crude);
      let open = downstream.filter(n => TANK_CAPACITY - (n._crude || 0) > 0
        && pipeArrivedAt(resolveTankPorts(n).in.c, resolveTankPorts(n).in.r, fluid));
      while (budget > 1e-6 && open.length) {
        const share = budget / open.length, next = [];
        for (const n of open) {
          const take = Math.min(share, TANK_CAPACITY - (n._crude || 0));
          if (take <= 0) continue;
          n._crude = (n._crude || 0) + take; n._liquidType = kind; n._pipeConnected = true;
          e._crude -= take; budget -= take;
          if (TANK_CAPACITY - n._crude > 0) next.push(n);
        }
        if (next.length === open.length && share <= 1e-9) break;
        open = next;
      }
    },

    tickStorageTank(e, dt) {
      e._pipeConnected = false;
      if (e._liquidType === undefined) e._liquidType = (e._crude || 0) > 0 ? 'oil' : null;
      StorageDrain.tick(e, dt);
      if ((e._crude || 0) <= 0.001) { e._crude = 0; e._liquidType = null; }
      if (!this.tankOnline(e)) return;
      // Being emptied: nothing comes in by any route until it is done.
      const filling = !e._draining;

      const ports = resolveTankPorts(e);
      const inCol = ports.in.c, inRow = ports.in.r;
      const outKey = ports.out.c + ',' + ports.out.r;

      // ── Intake: water (instant, presence-based — the extractor's pipe
      // network is either powered or it isn't, no per-source buffer to
      // drain) and acid/fuel oil (pulled from a directly-adjacent
      // producer's buffer via BFS). Oil intake is handled by the pump
      // jack's push above, since crude has always been push-based here.
      // Only the resolved IN stub accepts intake; OUT is for discharge.
      if (filling && (e._liquidType === null || e._liquidType === 'water')) {
        let inNb = GridManager.getEntity(inCol, inRow);
        if (inNb && inNb.type === T.WIRE     && inNb._underPipe) inNb = inNb._underPipe;
        if (inNb && inNb.type === T.CONVEYOR && inNb._underPipe) inNb = inNb._underPipe;
        // A run lit only by this tank's own outlet isn't a supply — without
        // this a tank piped in a loop would refill itself forever. Also refuse
        // when IN and OUT share a pipe run (self-loop).
        const selfLoop = inNb && isPipe(inNb) && (() => {
          const seen = new Set(), q = [[inCol, inRow]];
          while (q.length) {
            const [c, r] = q.shift();
            const key = c + ',' + r;
            if (seen.has(key)) continue;
            seen.add(key);
            // Pipe tiles only. pipeBfsCoords offers every side a pipe could
            // join, pipe or not, so this walk used to step off the IN stub
            // onto the open tile between the two stubs and from there onto
            // the OUT stub: every pipe-fed water tank read as piped in a loop
            // and never filled.
            if (!getPipe(GridManager.getEntity(c, r))) continue;
            if (key === outKey) return true;
            for (const [nc, nr] of pipeBfsCoords(c, r, 'water'))
              if (GridManager.inBounds(nc, nr) && !seen.has(nc + ',' + nr)) q.push([nc, nr]);
          }
          return false;
        })();
        if (inNb && isPipe(inNb) && inNb.powered && inNb._waterTankSrc !== e && !selfLoop) {
          const space = TANK_CAPACITY - (e._crude || 0);
          if (space > 0 && pipeArrived(inNb, 'water')) {
            e._crude = (e._crude || 0) + Math.min(FLOW_RATE * dt, space);
            e._liquidType = 'water';
          }
          e._pipeConnected = true;
        }
      }
      // Water drawn out of the OUT stub by coal generators this tick — the
      // share PowerNetwork.updatePipeConnectivity billed to this tank.
      if (e._liquidType === 'water' && (e._waterDraw || 0) > 0) {
        e._crude = Math.max(0, (e._crude || 0) - e._waterDraw * dt);
        e._pipeConnected = true;
      }
      if (filling && (e._liquidType === null || e._liquidType === 'acid')) {
        const plant = findViaPipeBFS(inCol, inRow, T.CHEMICALPLANT, p => (p._acid || 0) > 0 && p.powered, 'acid');
        if (plant) {
          const space = pipeArrivedAt(inCol, inRow, 'acid') ? TANK_CAPACITY - (e._crude || 0) : 0;
          const take  = Math.min(plant._acid, FLOW_RATE * dt, space);
          if (take > 0) { plant._acid -= take; plant._acidPulled = true; e._crude = (e._crude || 0) + take; e._liquidType = 'acid'; }
          e._pipeConnected = true;
        }
      }
      if (filling && (e._liquidType === null || e._liquidType === 'fuel')) {
        const ref = findViaPipeBFS(inCol, inRow, T.REFINERY, r => (r._fuelOil || 0) > 0 && r.powered, 'fueloil');
        if (ref) {
          const arrived = pipeArrivedAt(inCol, inRow, 'fueloil');
          const space = arrived ? TANK_CAPACITY - (e._crude || 0) : 0;
          const take  = Math.min(ref._fuelOil, FLOW_RATE * dt, space);
          if (take > 0) { ref._fuelOil -= take; e._crude = (e._crude || 0) + take; e._liquidType = 'fuel'; }
          e._pipeConnected = true;
          // Light the pipes this fuel actually travels through. tickRefinery
          // only marks its network while its own buffer holds fuel, and a tank
          // pulling every tick keeps that buffer at ~0 — so the refinery→tank
          // line rendered empty even while the tank visibly filled. Lit too
          // while the fuel is still running down to the tank, or it never would.
          if (take > 0 || !arrived) {
            const _fo = refineryFuelSeed(ref);
            if (_fo) _lightRun(pipeRun(_fo.c, _fo.r, 'fueloil'), '_fuelOilActive', FLOW_RATE, 0, 1);
          }
        }
      }

      // ── Tank → tank chaining (overflow from a full tank into the next).
      this.chainTanks(e, dt);

      // ── Fuel oil outflow: pushed out of the OUT port to Fuel Generators and
      // Gas Stations on that pipe network (see pushStoredFuel).
      if (e._liquidType === 'fuel' && (e._crude || 0) > 0) {
        this.pushStoredFuel(e, dt);
        return;
      }

      // ── Crude outflow to a Refinery. Water/acid tanks act as buffer storage.
      // Only the resolved OUT stub discharges — never the IN face.
      if (e._liquidType !== 'oil' || (e._crude || 0) <= 0) return;
      const outC = ports.out.c, outR = ports.out.r;
      const line = pipeRunFrom([outC, outR], 'oil', ports.in.c, ports.in.r);
      if (!line.n) return;
      _lightRun(line, '_oilActive', FLOW_RATE, Math.sign(outC - e.col), 0);
      const refineries = [];
      for (let k = 0; k < line.an; k++) {
        const n = line.ae[k];
        if (n.type === T.REFINERY && n.powered && !refineries.includes(n)) {
          // Crude only enters at CRUDE IN — same rule as findAllViaOilPipe.
          const ci = refineryCrudeIn(n);
          if (line.atc[k] === ci.c && line.atr[k] === ci.r && pipeArrivedAt(ci.c, ci.r, 'oil')) refineries.push(n);
        }
      }
      if (refineries.length) {
        const moved = splitCrude(refineries, Math.min(e._crude, FLOW_RATE * dt), e);
        e._crude -= moved;
        if (moved > 0) e._pipeConnected = true;
      }
    },

    // A fuel-holding Liquid Storage Tank acts as a fuel source: BFS the pipe
    // network from its resolved OUT stub, light those pipes as fuel oil
    // flowing away from the tank, and split the stored fuel between every
    // Fuel Generator / Gas Station whose inlet stub is on that network —
    // same fair-share rules as tickRefinery's distribution. Runs before
    // either consumer's tick (game_loop.js order), so they see the delivered
    // fuel this tick.
    pushStoredFuel(e, dt) {
      const ports = resolveTankPorts(e);
      const outCol = ports.out.c, outRow = ports.out.r;
      // The run off the OUT stub (never through this tank's own IN stub),
      // lit as fuel oil flowing away from the tank. A wire or belt laid over
      // a pipe owns the grid tile; it is the pipe underneath that is marked.
      const line = pipeRunFrom([outCol, outRow], 'fueloil', ports.in.c, ports.in.r);
      _lightRun(line, '_fuelOilActive', FLOW_RATE, Math.sign(outCol - e.col), 0);
      if (!line.n) return;
      e._pipeConnected = true;

      const consumers = [];
      for (const gen of EntityRegistry.getByType(T.FUELGEN))
        if (_fuelReaches(line, gen.col - 1, [gen.row + Math.floor((gen.height || 5) / 2)])) consumers.push(gen);
      for (const stn of EntityRegistry.getByType(T.GASSTATION))
        if (_fuelReaches(line, stn.col - 1, GasStationPorts.inputRows(stn))) consumers.push(stn);
      if (!consumers.length) return;

      const share = e._crude / consumers.length;
      for (const c of consumers) {
        if (e._crude <= 0.001) break;
        let take;
        if (c.type === T.FUELGEN) {
          if (c._fuelTank === undefined) c._fuelTank = 0;
          take = Math.max(0, Math.min(share, 60 - c._fuelTank, 8 * dt, e._crude));
          c._fuelTank += take;
        } else {
          const gdef = EntityDefs[T.GASSTATION];
          if (c._fuelStored === undefined) c._fuelStored = 0;
          const space = c._idleFull ? 0 : (gdef.storageCapacity || 400) - c._fuelStored;   // idle station: see PowerNetwork._outputFull
          take = Math.max(0, Math.min(share, space, (gdef.pullRate || 8) * dt, e._crude));
          c._fuelStored += take;
        }
        e._crude -= take;
      }
    },

    getScanCost()           { return (typeof Difficulty !== 'undefined' ? Difficulty.price(Math.round(47500 * Math.pow(1.25, oilScans))) : Math.round(47500 * Math.pow(1.25, oilScans))); },
    isScanUnlocked()        { return Progression.isUnlocked(T.OILSCAN); },
    getScanUnlockProgress() { return Math.min(1, (CoalSystem.getTotalMined?.() || 0) / 30000); },
    getTotalScans()         { return oilScans; },
    incrementScans()        { oilScans++; },
    loadScans(v)            { if (v !== undefined) oilScans = v; },
    getTotalCrude()         { return totalCrudeProduced; },
    loadTotalCrude(v)       { if (v !== undefined) totalCrudeProduced = v; },
    getTotalFuelOil()       { return totalFuelOilProduced; },
    loadTotalFuelOil(v)     { if (v !== undefined) totalFuelOilProduced = v; },
    getTotalLpg()           { return totalLpgProduced; },
    loadTotalLpg(v)         { if (v !== undefined) totalLpgProduced = v; },
    getTotalLpgFlared()     { return totalLpgFlared; },
    loadTotalLpgFlared(v)   { if (v !== undefined) totalLpgFlared = v; },
    getTankCapacity()       { return TANK_CAPACITY; },
    spawnOilDeposits,

    // Tick a fuel generator: consume fuel oil from a connected refinery via oil pipes
    tickFuelGenerator(gen, dt) {
      // Frozen while paused (dt === 0) — otherwise "needed = fuelPerSec*0 = 0"
      // makes "fuelTank >= needed" trivially true even at an empty (0) tank,
      // flipping a legitimately-offline generator back to full power for as
      // long as the game stays paused. Leaving state untouched just holds
      // whatever was last computed.
      if (dt <= 0) return;

      if (gen.def === EntityDefs[T.FUELGEN]) {
        gen.def = { ...EntityDefs[T.FUELGEN] };
      }

      if (gen._fuelTank === undefined) gen._fuelTank = 0;

      // ── An engine needs power on its network to START, and fuel to run. ──
      // gen.powered is unreliable here: it's the network-wide supply>=demand
      // broadcast, which a cold engine can read wrongly either way. Instead,
      // scan this generator's electrical network (networkId assigned by
      // PowerNetwork's flood-fill) for a source currently producing power,
      // using the exact same per-type output rules PowerNetwork uses for
      // supply. A running fuel generator is such a source, itself included, so
      // a plant carries on after the outside supply that started it is
      // disconnected, and can start its other engines. One with every engine
      // stopped has no power on its network and needs starting from outside.
      const hasGridPower = gen.networkId !== undefined && gen.networkId >= 0 &&
                           _poweredNetworks().has(gen.networkId);
      gen._hasGridPower = hasGridPower;   // exposed for inspection panel / renderer
      // A running engine rides out a short gap in outside power — right after
      // a load the other sources' outputs and network ids aren't settled for
      // the first few ticks, which otherwise shut the engine off and re-cranked
      // it every reload.
      gen._fgGridGrace = hasGridPower ? 0 : (gen._fgGridGrace || 0) + dt;
      if (!hasGridPower && !(gen._fgIgnited && gen._fgGridGrace < 3)) {
        this.tickFuelEngine(gen, dt, false, false);
        return;
      }

      // Find connected refineries/tanks from the fuel inlet (left face, vertical centre)
      const { connectedRefineries, connectedTanks } = _scanFuelLine(gen.col - 1, [gen.row + Math.floor((gen.height || 5) / 2)]);

      // Fuel oil is deposited into gen._fuelTank directly by
      // OilSystem.tickRefinery's fair-distribution pass, which runs before
      // this tick (see game_loop.js ordering) — no pull needed here.
      gen._connectedRefineries = connectedRefineries.length + connectedTanks.length;

      // Consume fuel and generate power — requires a pipe path to a refinery or fuel tank
      this.tickFuelEngine(gen, dt, true, gen._connectedRefineries > 0);
    },

    // Diesel engine model for the Fuel Power Generator. Instead of an on/off
    // switch the engine cranks over, catches, spins up to the throttle's RPM,
    // warms up (a cold block runs slightly under rated output), and coasts
    // down on its flywheel when fuel runs out. Overdrive trades fuel and heat
    // for extra watts; letting the block reach 100% heat trips a forced
    // cool-down. Rich/hot/starved running occasionally backfires.
    // Writes gen._fuelled + gen.def.powerOutput, which PowerNetwork reads.
    tickFuelEngine(gen, dt, hasGridPower, hasPipe) {
      const def   = EntityDefs[T.FUELGEN];
      const modes = def.throttleModes;
      if (!modes[gen._fgThrottle]) gen._fgThrottle = 'normal';
      if (gen._fgRpm   === undefined) gen._fgRpm   = 0;
      if (gen._fgHeat  === undefined) gen._fgHeat  = 0;
      // A powered Throttle Governor touching this engine trims Overdrive back
      // toward Normal as the block nears its trip temperature.
      const mode = GovernorSystem.effectiveMode(gen, modes, gen._fgThrottle, gen._fgHeat);
      if (gen._fgPhase === undefined) gen._fgPhase = 0;
      if (gen._fuelTank === undefined) gen._fuelTank = 0;
      gen._fgTrip     = Math.max(0, (gen._fgTrip     || 0) - dt);
      gen._fgBackfire = Math.max(0, (gen._fgBackfire || 0) - dt);
      gen._fgIgniteFx = Math.max(0, (gen._fgIgniteFx || 0) - dt);

      // _fgTrip is only ever set by saves from before meltdowns replaced the
      // overheat trip; it just counts down.
      const canBurn = hasGridPower && hasPipe && gen._fgTrip <= 0 && gen._fuelTank > 0 && !gen._lightningDamaged;
      let cranking = false, burning = false;
      let supply = 1, targetRpm = mode.rpm;

      if (!canBurn) {
        gen._fgIgnited = false;
        gen._fgCrank   = 0;
      } else if (!gen._fgIgnited) {
        // Still spinning from a moment ago → catches straight away.
        if (gen._fgRpm >= 0.3) gen._fgCrank = def.crankSeconds;
        gen._fgCrank = (gen._fgCrank || 0) + dt;
        gen._fgRpm   = Math.max(gen._fgRpm, Math.min(0.22, gen._fgRpm + 0.15 * dt));
        cranking = true;
        if (gen._fgCrank >= def.crankSeconds) {
          gen._fgIgnited  = true;
          gen._fgCrank    = 0;
          gen._fgIgniteFx = 1.2;   // black start-up puff in the renderer
          gen._fgFuelFrac = 1;
          cranking = false;
        }
      }

      if (canBurn && gen._fgIgnited) {
        burning = true;
        // Power follows the fuel actually burned. Suppliers top the tank up
        // before this tick runs, so an under-supplied engine is never quite
        // empty — checking "tank > 0" alone let it run at full output on a
        // fraction of the fuel it needs (4 Normal gens on one 2.2/s refinery).
        const needed = mode.fuel * dt;
        const burned = Math.min(gen._fuelTank, needed);
        gen._fuelTank -= burned;
        if (gen._fgFuelFrac === undefined) gen._fgFuelFrac = 1;
        gen._fgFuelFrac += ((needed > 0 ? burned / needed : 1) - gen._fgFuelFrac) * Math.min(1, 1.5 * dt);  // smooth delivery jitter
        supply    = gen._fgFuelFrac;
        targetRpm = mode.rpm * Math.max(0.35, supply);
        const diff = targetRpm - gen._fgRpm;
        const rate = diff > 0 ? 0.45 : 0.3;   // spin up faster than it settles down
        gen._fgRpm += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
        gen._fgHeat = Math.min(1, gen._fgHeat + (mode.heat * Math.max(0.4, supply) - gen._fgHeat) * Math.min(1, 0.045 * dt));

        // No safety trip: at 100% heat the block keeps running and the
        // meltdown clock runs. Held there too long, it explodes.
        if (MeltdownSystem.tick(gen, gen._fgHeat, true, dt)) {
          gen._fgState        = 'wrecked';
          gen._fuelled        = false;
          gen.def.powerOutput = 0;
          return;
        }
        const chance = 0.015
          + (gen._fgThrottle === 'overdrive' ? 0.08 : 0)
          + (gen._fgHeat > 0.85 ? 0.25 : 0)
          + (gen._fuelTank < 6 ? 0.3 : 0);
        if (gen._fgBackfire <= 0 && Math.random() < chance * dt) {
          gen._fgBackfire    = 0.4;
          gen._fgBackfireSfx = true;   // consumed by FuelGenAudio
        }
      }

      if (!burning && !cranking) {
        gen._fgRpm  = Math.max(0, gen._fgRpm - 0.28 * dt);
        gen._fgHeat = Math.max(0, gen._fgHeat - (gen._fgTrip > 0 ? 0.03 : 0.012) * dt);
      }
      if (!burning) MeltdownSystem.tick(gen, gen._fgHeat, false, dt);
      gen._fgPhase = (gen._fgPhase + gen._fgRpm * 16 * dt) % (Math.PI * 2000);

      let out = 0;
      if (burning) {
        const warm = 0.85 + 0.15 * Math.min(1, gen._fgHeat / 0.45);
        out = def.powerOutput * mode.output * Math.min(1, gen._fgRpm / targetRpm) * warm * supply;
        if (gen._fgBackfire > 0) out *= 0.7;
      } else if (hasGridPower && !cranking && gen._fgRpm > 0.05) {
        out = def.powerOutput * 0.5 * gen._fgRpm;   // flywheel coast-down
      }

      gen._fgState = gen._lightningDamaged ? 'wrecked'
        : gen._fgTrip > 0          ? 'overheat'
        : burning && MeltdownSystem.isCritical(gen) ? 'critical'
        : !hasGridPower            ? 'nogrid'
        : !hasPipe                 ? 'nopipe'
        : cranking                 ? 'cranking'
        : burning                  ? (supply < 0.9 ? 'starved' : gen._fgRpm < targetRpm * 0.95 ? 'spinup' : 'running')
        : gen._fgRpm > 0.05        ? 'coasting'
        :                            'nofuel';
      gen._fuelled        = out > 0.5;
      gen.def.powerOutput = out;
    },

    setFuelGenThrottle(gen, key) {
      if (!gen || !EntityDefs[T.FUELGEN].throttleModes[key]) return;
      gen._fgThrottle = key;
    },

    // Tick a refinery: convert crude buffer → fuel oil
    tickRefinery(e, dt) {
      // LPG rates are per tick; paused ticks keep the last reading so the
      // flare doesn't drop to its pilot every time the game is paused.
      if (dt > 0) { e._lpgRate = 0; e._lpgFlareRate = 0; }
      if (e._lpg === undefined) e._lpg = 0;
      e._lpgPiped = !!refineryLpgSeed(e);
      if (!e.powered) { e._refStatus = 'offline'; return; }
      const def = EntityDefs[T.REFINERY];
      if (e._fuelOil === undefined) e._fuelOil = 0;
      if (e._crudeBuffer === undefined) e._crudeBuffer = 0;
      if (e._lpg > 0.01) markRefineryLpgPipes(e);

      // Producer-side pipe marking + fair distribution: light up connected
      // pipes with fuel oil, and split available fuel oil between every
      // connected Fuel Generator and Gas Station in a single pass — before
      // either consumer's own tick runs. This replaces each consumer
      // independently grabbing straight from e._fuelOil in tick order
      // (Fuel Generator always ticks before Gas Station in game_loop.js):
      // since a refinery only produces a small trickle per tick, whichever
      // consumer went first could take the ENTIRE buffer every single
      // tick, permanently starving the other even though pipes were
      // genuinely connected — which is exactly what "pipe shows connected
      // but Gas Station always reads 0 fuel" turned out to be.
      //
      // "Connected" is checked against the exact same fixed input-stub
      // tile each consumer's own tick logic uses (col-1, row+floor(h/2)),
      // via BFS reachability from the refinery's own border — since pipe
      // adjacency is symmetric, this can never disagree with what a
      // consumer's own outward-BFS would find, so status reporting on
      // either side stays consistent with what actually gets delivered.
      if (e._fuelOil > 0.01) {   // a floating-point crumb isn't fuel to show or send
        // Only the FUEL OUT network gets fuel — not the crude line at CRUDE IN.
        // A wire or belt laid over a pipe owns the grid tile; it is the pipe
        // underneath that is marked, which is what renders the fluid.
        const _fo = refineryFuelSeed(e);
        const line = _fo ? pipeRun(_fo.c, _fo.r, 'fueloil') : null;
        if (line) _lightRun(line, '_fuelOilActive', def.fuelPerSec, 0, 1);
        const reachable = { has: (c, r) => !!line && pipeRunHas(line, c, r) };

        const consumers = [];
        let _onTheWay = 0;   // piped in, fuel still running down the line to them
        for (const gen of EntityRegistry.getByType(T.FUELGEN)) {
          const ggh = gen.height || 5, rows = [gen.row + Math.floor(ggh / 2)];
          if (_fuelReaches(line, gen.col - 1, rows)) consumers.push(gen);
          else if (rows.some(r => reachable.has(gen.col - 1, r))) _onTheWay++;
        }
        // Either inlet a station accepts — the tank-level stub or the old
        // face-centre one (GasStationPorts, same rows tickGasStation checks).
        // This used to test only the old centre row, so a station piped at
        // its current inlet read "connected" but never received any fuel.
        for (const stn of EntityRegistry.getByType(T.GASSTATION)) {
          const rows = GasStationPorts.inputRows(stn);
          if (_fuelReaches(line, stn.col - 1, rows)) consumers.push(stn);
          else if (rows.some(r => reachable.has(stn.col - 1, r))) _onTheWay++;
        }

        // For the panel and the Engineering Audit: is anything on the end of
        // FUEL OUT at all? A refinery whose outlet pipe reaches nothing fills
        // up, stops, and until now gave no sign of why. Fuel tanks pull for
        // themselves (tickStorageTank), so they are counted here separately.
        let _tanksOnLine = 0;
        for (const tk of EntityRegistry.getByType(T.OILSTORAGE)) {
          const tin = resolveTankPorts(tk).in;
          if (reachable.has(tin.c, tin.r)) _tanksOnLine++;
        }
        e._fuelOutPiped   = !!_fo;
        e._fuelConsumers  = consumers.length + _onTheWay + _tanksOnLine;

        if (consumers.length > 0) {
          const share = e._fuelOil / consumers.length;
          for (const c of consumers) {
            if (e._fuelOil <= 0.001) break;
            if (c.type === T.FUELGEN) {
              const TANK_CAPACITY = 60;
              if (c._fuelTank === undefined) c._fuelTank = 0;
              const space = TANK_CAPACITY - c._fuelTank;
              const take  = Math.max(0, Math.min(share, space, 8 * dt, e._fuelOil));
              c._fuelTank += take;
              e._fuelOil  -= take;
            } else {
              const gdef     = EntityDefs[T.GASSTATION];
              const cap      = gdef.storageCapacity || 400;
              const pullRate = gdef.pullRate || 8;
              if (c._fuelStored === undefined) c._fuelStored = 0;
              // A station that was full when the grid was solved drew no power
              // this tick, so it doesn't pump either (see PowerNetwork._outputFull).
              const space = c._idleFull ? 0 : cap - c._fuelStored;
              const take  = Math.max(0, Math.min(share, space, pullRate * dt, e._fuelOil));
              c._fuelStored += take;
              e._fuelOil    -= take;
            }
          }
        }
      }

      // Idle — charged no power this tick because a buffer was full when the
      // grid was solved (PowerNetwork's _outputFull). Fuel oil already stored
      // was still handed out above; refining resumes next tick.
      if (e._idleFull) { e._refStatus = (e._sludgeWaste || 0) >= 100 ? 'waste_full' : 'full'; return; }
      // Latched: holds until the tank drains to REFINERY_RESUME_FRAC — see
      // PowerNetwork._outputFull.
      if (refineryFuelFull(e)) { e._refStatus = 'full'; return; }

      const available = e._crudeBuffer;
      // Paused (dt 0): the pump jack delivers nothing this tick, so a refinery
      // that refines everything it's fed reads an empty intake — keep the
      // last status instead of flipping to NO CRUDE every time the game is
      // paused (it flipped back the moment it resumed).
      if (available < 0.01) { if (dt > 0) e._refStatus = 'no_crude'; return; }

      // Sludge buffer full and awaiting truck pickup — can't refine crude
      // (and therefore can't feed fuel oil downstream) until it's hauled
      // below capacity.
      if (e._sludgeWaste === undefined) e._sludgeWaste = 0;
      checkWasteBuildup(e, e._sludgeWaste, 'Sludge');
      if (e._sludgeWaste >= 100) { e._refStatus = 'waste_full'; return; }

      const consumed = Math.min(available, def.crudePerSec * dt);
      e._crudeBuffer -= consumed;
      const fuelProduced = consumed * (def.fuelPerSec / def.crudePerSec);
      e._fuelOil = Math.min(def.fuelCapacity, e._fuelOil + fuelProduced);
      refineryFuelFull(e);   // latch the moment it tops out, before next tick's draw takes it off 100%
      totalFuelOilProduced += fuelProduced;
      // LPG comes off alongside the fuel oil, never instead of it. With the
      // LPG OUT port piped it is banked up to lpgCapacity; everything else
      // — all of it, before the port exists — goes to the flare stack.
      const lpgMade = consumed * (def.lpgPerSec / def.crudePerSec);
      const lpgRoom = e._lpgPiped ? Math.max(0, def.lpgCapacity - e._lpg) : 0;
      const lpgKept = Math.min(lpgMade, lpgRoom);
      e._lpg += lpgKept;
      totalLpgProduced += lpgMade;
      totalLpgFlared   += lpgMade - lpgKept;
      if (dt > 0) {
        e._lpgRate      = lpgMade / dt;
        e._lpgFlareRate = (lpgMade - lpgKept) / dt;
      }
      e._refStatus  = 'running';
      e._crudeRate  = consumed / dt;
      e._fuelRate   = fuelProduced / dt;
      if (e._sludgeWaste === undefined) e._sludgeWaste = 0;
      const _sludgeSpd = DayNight.secondsPerGameHour() * 24;
      // ×0.6 — sludge builds up 40% slower than the original 9/1.75-day fill
      e._sludgeWaste = Math.min(100, e._sludgeWaste + (100 / (9 / 1.75 * _sludgeSpd)) * 0.6 * dt * WASTE_RATE_MULT);
      WasteSystem.checkAvailability(T.REFINERY, e);
    },

    // Tick a gas station: BFS from the fuel input stub to find connected
    // refineries and report connection status. Actual fuel oil delivery
    // happens in OilSystem.tickRefinery's fair-distribution pass (see
    // comment there) — this only discovers/reports, it doesn't pull.
    tickGasStation(e, dt) {
      if (e._fuelStored === undefined) e._fuelStored = 0;
      // A job site's fuel depot: the client keeps it full, no line or power
      // needed (ContractSystem.ensureFuelDepot).
      if (e._fuelDepot) { e._fuelStored = EntityDefs[T.GASSTATION].storageCapacity || 400; e._connectedRefineries = 0; e._fuelConnected = true; return; }
      if (!e.powered) { e._connectedRefineries = 0; e._fuelConnected = false; return; }

      // Pass 1: BFS from the fuel input stub to find connected refineries.
      // The stub is on the left face level with the fuel-oil storage tank —
      // the station's second tile row (see renderGasStation). It used to sit
      // at the face's vertical centre; a pipe still laid to that old spot is
      // accepted too, so stations in existing saves stay connected.
      const { connectedRefineries, connectedTanks } = _scanFuelLine(e.col - 1, GasStationPorts.inputRows(e));

      // Fuel oil is deposited into e._fuelStored directly by
      // OilSystem.tickRefinery's fair-distribution pass, which runs before
      // this tick (see game_loop.js ordering) — no pull needed here.
      e._connectedRefineries = connectedRefineries.length + connectedTanks.length;
      e._fuelConnected = e._connectedRefineries > 0;
    },
  };
})();

// ─── Gas Station System — truck refueling ──────────────────────────
// Same proximity + timed-transfer pattern as HaulSystem's waste hauling:
// no fixed dock tile, just needs the truck within REFUEL_BUFFER of the
// station's sprite, and it takes REFUEL_SECONDS to go from empty to full.
const GasStationSystem = (() => {
  const REFUEL_BUFFER   = TILE * 3;   // 3-tile radius from the station's sprite edge
  const REFUEL_SECONDS  = 5;          // time to fully refuel an empty truck
  const FULL_REFILL_COST = 500;       // $ cost to go from empty to full; charged proportionally
  // A refuel only starts with at least this much room in the tank. One
  // stops within 0.01 of full, and a truck rolling on to its parking spot
  // burns more than that before the next tick, so with no margin it pulled
  // straight back in for the sip it had just used: dock, fill, roll a few
  // pixels, dock again, never reaching the spot to end its leg, its status
  // flicking between refueling and heading to the station. Same reasoning
  // as HaulSystem's MIN_PICKUP.
  const MIN_TOPUP = 1;

  const _truckCenter = trk => {
    TruckSystem.initWorldPos(trk);
    return { x: trk._wx + TILE / 2, y: trk._wy + TILE * 1.5 };
  };
  // Distance from a point to the NEAREST point on a station's footprint
  // rectangle (0 if the point is already inside it) — same fix HaulSystem's
  // pickup buffer already got: a center + max(width,height)/2 "circle" check
  // under-measures the buffer near corners for anything wider/taller than 1
  // tile, since a rectangle's corner sits farther from center than half its
  // longest side. A circle sized off that side reaches the full buffer along
  // the flat edges but falls short near the corners — which is exactly why
  // refueling felt "intermittent": it worked or didn't depending on which
  // side/angle the truck approached from. True edge distance is consistent
  // all the way around the footprint.
  const _edgeDist = (pt, ent) => {
    const left   = ent.col * TILE;
    const top    = ent.row * TILE;
    const right  = left + (ent.width  || 1) * TILE;
    const bottom = top  + (ent.height || 1) * TILE;
    const nx = Math.max(left, Math.min(pt.x, right));
    const ny = Math.max(top,  Math.min(pt.y, bottom));
    return Math.hypot(pt.x - nx, pt.y - ny);
  };
  const _stillAt = ent => ent && GridManager.getEntity(ent.col, ent.row) === ent;

  // Random-search placement within `radius` tiles of (cx, cy) — same
  // validity checks (footprint clear, no water under any covered tile) as
  // the old single-station spawn, just aimed at a target point instead of
  // the whole map so callers can bias where stations land.
  function _trySpawnStationNear(cx, cy, radius) {
    const def = EntityDefs[T.GASSTATION];
    const w = def.width, h = def.height;
    for (let attempt = 0; attempt < 300; attempt++) {
      const col = Math.round(cx + (Math.random() - 0.5) * 2 * radius);
      const row = Math.round(cy + (Math.random() - 0.5) * 2 * radius);
      if (col < 0 || row < 0 || col + w > COLS || row + h > ROWS) continue;
      if (!GridManager.canPlaceFootprint(col, row, w, h)) continue;
      let blocked = false;
      for (let dr = 0; dr < h && !blocked; dr++)
        for (let dc = 0; dc < w && !blocked; dc++)
          if (WaterSystem.isWater(col+dc, row+dr)) blocked = true;
      if (blocked) continue;
      const stn = new Entity(T.GASSTATION, col, row);
      stn.width = w; stn.height = h;
      stn.def = { ...def };
      GridManager.setEntityFootprint(stn);
      EntityRegistry.add(stn);
      return true;
    }
    return false;
  }

  // Scatters the full set of five stations across the map — one tucked into
  // each of the four corners (inset enough to have room to search for a
  // clear, non-water spot), plus one offset away from dead-center. Players
  // build their own stations now (up to the same five, see PLACEMENT_LIMITS
  // in input_manager.js); this is only reachable from the dev panel, as a
  // way to furnish a test map without clicking five times.
  function _trySpawnStation() {
    const CORNER_INSET  = 90;   // tiles in from each edge to the corner search center
    const CORNER_RADIUS = 60;   // random jitter around each corner target
    const CENTER_OFFSET_C = 220; // how far off dead-center the 5th station sits (cols)
    const CENTER_OFFSET_R = 140; // (rows)
    const CENTER_RADIUS  = 70;

    const targets = [
      { x: CORNER_INSET,        y: CORNER_INSET,        r: CORNER_RADIUS }, // top-left
      { x: COLS - CORNER_INSET, y: CORNER_INSET,        r: CORNER_RADIUS }, // top-right
      { x: CORNER_INSET,        y: ROWS - CORNER_INSET, r: CORNER_RADIUS }, // bottom-left
      { x: COLS - CORNER_INSET, y: ROWS - CORNER_INSET, r: CORNER_RADIUS }, // bottom-right
      { x: COLS / 2 + CENTER_OFFSET_C, y: ROWS / 2 + CENTER_OFFSET_R, r: CENTER_RADIUS }, // off-center
    ];

    let placed = 0;
    for (const t of targets) {
      if (_trySpawnStationNear(t.x, t.y, t.r)) placed++;
    }
    if (placed > 0) {
      showToast(`⛽ [DEV] Spawned ${placed} Gas Station${placed === 1 ? '' : 's'}`, '#ffc040', '#140800', '#402800');
    } else {
      console.warn('[GasStationSystem] could not find spawn location for any gas station');
    }
    return placed;
  }

  return {
    // ── Dev/testing helper — drops the whole set of five at once, ignoring
    // the placement cap the player's own build tool enforces. Returns the
    // number placed.
    devSpawnStations() { return _trySpawnStation(); },

    // ── Fuel supply watch ──
    // Once per logic tick, for the fleet as a whole. A truck running dry
    // only says so once it has already stopped (TruckSystem's toast), and by
    // then the cause is usually minutes old: the stations were never piped
    // to a refinery, lost power, or are being drained faster than they fill.
    // So while any working truck is getting low and the stations can't put
    // that fuel back, a card says why — and stays, kept current, until the
    // supply is good again. It has to hold for a few seconds first, so a
    // station that is merely between deliveries doesn't raise it.
    tickSupply(dt) {
      if (typeof NotificationStack === 'undefined' || !(dt > 0)) return;
      const TAG = 'truck-fuel-supply', LOW = 0.4, HOLD = 8;
      const st = this._supply || (this._supply = { bad: 0, good: 0, shown: false });
      let low = 0, stranded = 0, want = 0, worst = null, worstFrac = Infinity;
      for (const trk of EntityRegistry.getByType(T.TRUCK)) {
        // Only trucks with work to do. Parked, stopped mid-route, or on
        // Auto-dispatch with nothing to haul ("Standing by"), it burns nothing
        // and needs nothing; one stalled on a job for want of fuel still counts.
        const working = trk._autoHaulEnabled ? !trk._autoHaulStandby
          : !!(trk._patrolling || trk._haulState || trk._refuelTarget
               || (trk._autoDispatch && (trk._legDone || trk._awaitingArrivalGrace)));
        if (!working) continue;
        const cap = truckSpec(trk).fuelCapacity || 100;
        const frac = (trk._fuel === undefined ? cap : trk._fuel) / cap;
        if (frac >= LOW) continue;
        low++; want += cap * (1 - frac);
        if (frac <= 0.001) stranded++;
        if (frac < worstFrac) { worstFrac = frac; worst = trk; }
      }
      let stations = 0, powered = 0, piped = 0, stock = 0, nearest = null;
      for (const stn of EntityRegistry.getByType(T.GASSTATION)) {
        stations++;
        if (stn._fuelConnected) piped++;
        if (!stn.powered && !stn._fuelDepot) continue;
        powered++;
        stock += stn._fuelStored || 0;
        if (!nearest) nearest = stn;
      }
      const why = !low ? null
        : !stations ? 'No Gas Station built'
        : !powered ? (stations === 1 ? 'The Gas Station has no power' : 'No Gas Station has power')
        : stock <= 1 ? (piped ? 'Gas Stations are empty: the fuel line is not keeping up' : 'Gas Stations are empty: none is piped to a Refinery or fuel tank')
        : stock < want * 0.5 ? `Gas Stations nearly empty: ${Math.round(stock)} fuel on hand, trucks need ${Math.round(want)}`
        : null;
      if (!why) {
        st.bad = 0;
        if (st.shown && (st.good += dt) >= 3) { st.shown = false; NotificationStack.dismissTag(TAG); }
        return;
      }
      st.good = 0;
      if ((st.bad += dt) < HOLD) return;
      const title = stranded ? `${stranded} truck${stranded === 1 ? '' : 's'} out of fuel` : 'Trucks short of fuel';
      const message = `${why}. ${low} truck${low === 1 ? ' is' : 's are'} running low: click to jump there`;
      if (st.shown && st.title === title) { NotificationStack.updateTag(TAG, { message }); return; }
      // First showing, or it has just got worse (trucks now stopped): say so afresh.
      if (st.shown) NotificationStack.dismissTag(TAG);
      st.shown = true; st.title = title;
      const target = stranded || !nearest ? worst : nearest;
      NotificationStack.push({
        icon: '⛽', title, message, tag: TAG, glow: !!stranded,
        color:  stranded ? '#ff4020' : '#d0a030',
        border: stranded ? '#702010' : '#604010',
        onClick: () => {
          if (!target) return;
          if (target.type === T.TRUCK) { TruckSystem.initWorldPos(target); Camera.recentreOn(target._wx + TILE / 2, target._wy + TILE * 1.5); }
          else Camera.recentreOn((target.col + (target.width || 1) / 2) * TILE, (target.row + (target.height || 1) / 2) * TILE);
        },
      });
    },

    // A waste truck stopped dry where it stands can't reach a gas station
    // however well stocked, so the card above never fires for it. A Hauler on
    // Auto Dispatch brings fuel out to it (AutoHaulSystem's rescue run); say
    // so while any is stranded with no Hauler on the way.
    tickStranded(dt) {
      if (typeof NotificationStack === 'undefined' || typeof truckStranded !== 'function' || !(dt > 0)) return;
      const TAG = 'truck-stranded-rescue', HOLD = 3;
      const st = this._stranded || (this._stranded = { bad: 0, shown: false });
      const coming = new Set();
      for (const h of EntityRegistry.getByType(T.TRUCK))
        if (h._hauler && h._autoHaulEnabled && h._rescueFor) coming.add(h._rescueFor);
      const dry = [];
      for (const t of EntityRegistry.getByType(T.TRUCK))
        if (!t._hauler && truckStranded(t) && !coming.has(t)) dry.push(t);
      if (!dry.length) {
        st.bad = 0;
        if (st.shown) { st.shown = false; NotificationStack.dismissTag(TAG); }
        return;
      }
      if ((st.bad += dt) < HOLD) return;
      const n = dry.length;
      const title = `${n === 1 ? 'Waste truck' : n + ' waste trucks'} out of fuel`;
      const unlocked = typeof Progression === 'undefined' || Progression.isUnlocked(T.HAULER);
      const message = unlocked
        ? `${n === 1 ? 'It is' : 'They are'} stranded where ${n === 1 ? 'it stands' : 'they stand'}. Put a Hauler on Auto Dispatch and it will bring fuel oil out and pump it in: click to jump there`
        : `${n === 1 ? 'It is' : 'They are'} stranded where ${n === 1 ? 'it stands' : 'they stand'}. Once the Hauler is unlocked, one on Auto Dispatch can bring fuel out to ${n === 1 ? 'it' : 'them'}: click to jump there`;
      if (st.shown && st.title === title) { NotificationStack.updateTag(TAG, { message }); return; }
      if (st.shown) NotificationStack.dismissTag(TAG);
      st.shown = true; st.title = title;
      const target = dry[0];
      NotificationStack.push({
        icon: '⛽', title, message, tag: TAG, glow: true, color: '#ff4020', border: '#702010',
        onClick: () => {
          if (!EntityRegistry.getByType(T.TRUCK).has(target)) return;
          TruckSystem.initWorldPos(target); Camera.recentreOn(target._wx + TILE / 2, target._wy + TILE * 1.5);
        },
      });
    },

    // Called once per logic tick for every truck.
    tickTruck(trk, dt) {
      const fuelCap = truckSpec(trk).fuelCapacity || 100;
      if (trk._fuel === undefined) trk._fuel = fuelCap;
      const rate       = fuelCap / REFUEL_SECONDS;
      const costPerUnit = FULL_REFILL_COST / fuelCap;
      const tc = _truckCenter(trk);

      // Currently refueling
      if (trk._refuelTarget) {
        const stn = trk._refuelTarget;
        if (!_stillAt(stn) || !(stn.powered || stn._fuelDepot) || _edgeDist(tc, stn) > REFUEL_BUFFER) {
          trk._refuelTarget = null;
          return;
        }
        const room  = fuelCap - trk._fuel;
        const avail = stn._fuelStored || 0;
        const amt   = Math.max(0, Math.min(rate * dt, room, avail));
        if (amt > 0) {
          const cost = amt * costPerUnit;
          if (!Economy.canAfford(cost)) {
            showToast('⛽ Not enough funds to refuel', '#ff6040', '#180800', '#602010');
            trk._refuelTarget = null;
            return;
          }
          Economy.spend(cost);
          trk._fuel      += amt;
          stn._fuelStored = avail - amt;
        }
        if (room - amt <= 0.01 || avail - amt <= 0.01) {
          trk._refuelTarget = null;
        }
        return;
      }

      // Idle — look for a powered station to start refueling at
      if (fuelCap - trk._fuel < MIN_TOPUP) return;
      let depot = null;
      for (const stn of EntityRegistry.getByType(T.GASSTATION)) {
        if (stn._fuelDepot) depot = stn;
        if (!stn.powered && !stn._fuelDepot) continue;
        if ((stn._fuelStored || 0) <= 0) continue;
        if (_edgeDist(tc, stn) > REFUEL_BUFFER) continue;
        trk._bowser = false;
        trk._refuelTarget = stn;
        return;
      }
      // Run dry out on a job site: the client's bowser brings a fifth of a
      // tank, enough to drive back to their depot. Same price per unit.
      if (depot && (trk._fuel <= 0.001 || trk._bowser)) {
        const amt = Math.min(fuelCap / 20 * dt, fuelCap * 0.2 - trk._fuel);
        if (amt > 0 && Economy.canAfford(amt * costPerUnit)) {
          if (!trk._bowser) showToast('⛽ The client\'s bowser is topping up a stranded truck', '#ffc040', '#140800', '#402800');
          trk._bowser = true;
          Economy.spend(amt * costPerUnit);
          trk._fuel += amt;
        } else {
          trk._bowser = false;
        }
      }
    },

    // ── Dev/testing helpers ──
    devFillStation(target) {
      const list = (target && typeof target === 'object' && target.type === T.GASSTATION)
        ? [target]
        : EntityRegistry.getByType(T.GASSTATION);
      let filled = 0;
      for (const stn of list) {
        stn._fuelStored = EntityDefs[T.GASSTATION].storageCapacity || 400;
        filled++;
      }
      showToast(`🧪 Dev: filled ${filled} gas station(s)`, '#c040ff', '#140020', '#400060');
      return filled;
    },

    devFillTruckFuel(target) {
      const list = (target && typeof target === 'object' && target.type === T.TRUCK)
        ? [target]
        : EntityRegistry.getByType(T.TRUCK);
      let filled = 0;
      for (const trk of list) {
        trk._fuel = truckSpec(trk).fuelCapacity || 100;
        filled++;
      }
      showToast(`🧪 Dev: refuelled ${filled} truck(s)`, '#c040ff', '#140020', '#400060');
      return filled;
    },

    // ── Exposed for EntityInfoPanel so it doesn't have to duplicate these
    // as separate magic numbers ──
    getRefuelCost()    { return FULL_REFILL_COST; },
    getRefuelSeconds() { return REFUEL_SECONDS; },
  };
})();

// ─── Uranium System ───────────────────────────────────────────────
// Scan API mirrors OilSystem. Unlocked via Research MK3 (T.URANIUMSCAN)
// after pumping 50,000 crude. First scan costs $115k; ×1.25 each subsequent.
// Deposit spawning is not yet implemented — that lands in the next step.
