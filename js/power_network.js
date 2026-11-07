/* ═══════════════════════════════════════════════════════════════════
   POWER NETWORK SYSTEM
   ─────────────────────────────────────────────────────────────────
   Why BFS flood-fill?
   Power in this game is "presence-based" not "flow-based". 
   A network either has enough supply to meet demand, or it doesn't.
   BFS finds all connected entities in O(N) per network, which is
   fast enough for our grid sizes.

   Each tick:
   1. Reset all entity power state
   2. Find all connected components (flood-fill ignoring entity type)
   3. For each component: sum generators, sum consumers
   4. If supply >= demand: all consumers in component are powered
      Wire load = total demand flowing through that wire's segment
   5. Overloaded wires = load > their throughput cap
   ═══════════════════════════════════════════════════════════════════ */

// Perf breakdown for the power solve. Console-driven diagnostic:
//   PNPerf()            -> phase averages over the last 5s
// Phases are recorded from inside PowerNetwork.tick / updatePipeConnectivity.
function PNPerf() {
  const a = (k) => +PerfMonitor.avg(k).toFixed(2);
  const out = {
    'total PowerNetwork.tick': a('PowerNetwork.tick'),
    '  reset pass (all entities)': a('PN: reset pass'),
    '  component loop': a('PN: component loop'),
    '    of which floodFill': a('PN: floodFill total'),
    '  applyWireLoads': a('PN: applyWireLoads'),
    'updatePipeConnectivity': a('PN: updatePipeConnectivity'),
    'floodFill calls/tick': a('PN: floodFill calls'),
    'components/tick': a('PN: components'),
    'entities total': (typeof EntityRegistry !== 'undefined') ? EntityRegistry.all().size : -1,
  };
  console.table(out);
  return out;
}

const PowerNetwork = (() => {
  const isPipeType = (e) => e && (e.type === T.PIPE || e.type === T.UNDERGNDPIPE);

  let networkStats = {
    totalGenerated: 0,
    totalConsumed:  0,
    poweredCount:   0,
    totalConsumers: 0,
  };

  const WIRE_RECLOSE_MS = 6000;   // a tripped wire/pole retries after this long (see reset pass)
  let MAX_WIRE_HOPS = 4;   // max wire hops between anchors; increases with Wire MK2 unlock

  // Surge Protector advisory — tracks how long an overload episode has been
  // continuously ongoing, so we can nudge the player toward Surge Protectors
  // if it doesn't clear itself quickly.
  let _overloadSince   = null;
  let _overloadAdvised = false;
  // Sticky: set the first time any wire/pole runs at REDLINE_STRESS or more of
  // its network's cap — i.e. the first time a line the player is looking at
  // goes red. Read by the tutorial so the Surge Protector card fires while
  // the wire is still glowing rather than after it burns out. Session-scoped;
  // the tutorial's own `completed` set is what keeps it from re-firing.
  // 0.85 rather than 1.0: the wire colour ramp is already deep red well
  // before the cap (r hits 255 at half load and green drains out from
  // there), so this is about where a player says "my line went red".
  const REDLINE_STRESS = 0.85;
  let _everRedlined    = false;
  // Highest stress any single wire/pole has ever reached, so the Surge
  // Protector's unlock bar can show the approach to that redline instead of
  // a consumption figure that has nothing to do with why wires fail. Sticky
  // (a max, never decayed) so the bar doesn't slide backwards when load dips.
  let _peakStress      = 0;
  const OVERLOAD_ADVISORY_DELAY = 7000; // ms

  // Reused across ticks instead of `new Uint8Array(ROWS*COLS)` every tick —
  // that's an 819,000-byte allocation 10x/sec regardless of entity count,
  // which was a steady source of GC pressure. .fill(0) is a plain memset,
  // dramatically cheaper than allocate+zero+eventually-collect.
  const _visited = new Uint8Array(ROWS * COLS);

  // Scratch buffer for computeWireHops' per-wire BFS below — reused the same
  // way as _visited above, but each wire's search only ever touches a small
  // local patch, so instead of a per-wire fill(0) (which would cost the same
  // ROWS*COLS memset 3000+ times a tick) we just track which indices got
  // marked and clear only those once that wire's BFS is done.
  const _hopVisited = new Uint8Array(ROWS * COLS);
  const _hopTouched = [];

  // Connection-eligibility helpers used inside floodFill's hot neighbour
  // loop — hoisted to module scope instead of being re-declared as fresh
  // closures on every single neighbour check (up to 4x per visited tile,
  // and a large built-up network visits thousands of tiles per tick). Pure
  // functions of their argument, no captured per-call state, so hoisting
  // changes nothing but allocation count.
  const isAmenity      = (e) => e && (e.type === T.LAMP || e.type === T.CAMERA);
  const isWind          = (e) => e && (e.type === T.WIND || e.type === T.WIND2 || e.type === T.WIND3);
  // The requested amenities that draw power count as properties for
  // touch-sharing too: the house-requested Cell Tower, Fiber Hub and EV
  // Charger (lamps and cameras have their own rule above), and the powered
  // parks (POWERED_PARK_TYPES: Splash Pad, Baseball Field, Community Center,
  // Corner Store). Built lazily — park_request_system.js loads after this.
  let _poweredParkSet = null;
  const isProperty      = (e) => {
    if (!e) return false;
    if (e.type === T.HOUSE || e.type === T.COMMERCIAL || e.type === T.INDUSTRIAL) return true;
    if (e.type === T.CELLTOWER || e.type === T.FIBERHUB || e.type === T.EVCHARGER) return true;
    if (!_poweredParkSet) _poweredParkSet = new Set(typeof POWERED_PARK_TYPES !== 'undefined' ? POWERED_PARK_TYPES : []);
    return _poweredParkSet.has(e.type);
  };
  const isGovernedGen   = (e) => e && (e.type === T.FUELGEN || e.type === T.COALGENERATOR);
  // A Geothermal Well and the turbine bolted onto it are one plant: a line
  // run to either one carries the turbine's output.
  const isGeoPair       = (a, b) => a && b && ((a.type === T.GEOWELL && b.type === T.GEOTURBINE) || (a.type === T.GEOTURBINE && b.type === T.GEOWELL));
  // A surface pipe laid over a wire, or an underground pipe hosting one run
  // through it (input_manager tryPlace) — both conduct.
  const pipeOnWire      = (e) => e && (e.type === T.PIPE || e.type === T.UNDERGNDPIPE) && e._underWire;
  // A lightning-struck Power Tower is fully out of service: it stops
  // conducting (canConnect) AND stops anchoring wire runs, so wires that
  // were only in range because of it drop out of range too. Anchoring and
  // conduction are separate systems here, so both need the check.
  const isDeadRelay     = (e) => e && e.type === T.POWERTOWER && e._lightningDamaged;
  // Parks are decorative: powerInput 0, powerOutput 0. They must never join a
  // network at all — otherwise a park touching a wire pulls itself onto the
  // grid and reads as "powered", and any rule that later treats network
  // membership as conduction would let a building draw through it. PARK_TYPES
  // is declared in park_request_system.js, which loads AFTER this file, so the
  // set is built lazily on first use rather than at module scope.
  // POWERED_PARK_TYPES (Splash Pad, Lit Baseball Diamond) are the exception:
  // they have a real scheduled draw, so they connect like any other consumer.
  let _parkSet = null;
  const isPark = (e) => {
    if (!e) return false;
    if (!_parkSet) {
      _parkSet = new Set(typeof PARK_TYPES !== 'undefined' ? PARK_TYPES : []);
      if (typeof POWERED_PARK_TYPES !== 'undefined') for (const t of POWERED_PARK_TYPES) _parkSet.delete(t);
    }
    return _parkSet.has(e.type);
  };
  const conveyorOnWire  = (e) => e && e.type === T.CONVEYOR && e._underWire;
  // What a wire run can be anchored to for range: something on the grid that
  // carries power. Scenery used to count too — a road, tree, bush or deposit
  // beside a span kept it "in range", and when that tree was chopped or the
  // vegetation changed the span suddenly dropped out minutes later.
  const _NO_ANCHOR = new Set([T.ROAD, T.BRIDGE, T.AQUIFER, T.GEODEPOSIT, T.COALDEPOSIT, T.OILDEPOSIT,
    T.URANIUMDEPOSIT, T.SULFURDEPOSIT, T.LITHIUMDEPOSIT, T.HELIUMDEPOSIT, T.RAREEARTHDEPOSIT].filter(t => t !== undefined));
  const isRangeAnchor = (e) => canConnect(e) && !_NO_ANCHOR.has(e.type);

  // Out-of-range and failed wires don't conduct; all other entities connect.
  function canConnect(entity) {
    if (!entity) return false;
    if (entity.type === T.WIRE && entity.outOfRange) return false;
    if (entity.type === T.WIRE && entity.failed)     return false;
    if (entity.type === T.POLE && entity.outOfRange) return false;
    // A lightning-struck Power Tower is an open circuit until repaired —
    // everything past it on the run goes dark, the same way a failed wire
    // cuts its downstream. Buildings knocked out by a strike are handled
    // separately (they're skipped in the component pass and forced
    // unpowered); they must keep conducting, since a struck house sitting
    // mid-run would otherwise sever the whole street behind it.
    if (entity.type === T.POWERTOWER && entity._lightningDamaged) return false;
    if (entity.type === T.TREE || entity.type === T.BUSH) return false;
    // Parks conduct nothing and consume nothing — same as scenery.
    if (isPark(entity)) return false;
    // Water tiles block connection — UNLESS a wire or pipe is sitting on top
    if (entity.type === T.WATER) return false;
    return true;
  }

  // Hydro pipe network connectivity — separate from wire network
  // Pipes are powered if connected to a powered water extractor
  function updatePipeConnectivity() {
    const PIPE_NBRS = new Set([T.PIPE, T.WATEREXTRACTOR, T.HYDROGENERATOR, T.COALGENERATOR]);
    // Clear all pipe powered state and coal gen water state first
    for (const t of [T.PIPE, T.UNDERGNDPIPE]) for (const e of EntityRegistry.getByType(t)) { e.powered = false; e._waterTankSrc = null; e._waterFlow = undefined; e._waterNet = null; }
    for (const e of EntityRegistry.getByType(T.CONVEYOR)) if (e._underPipe) { e._underPipe.powered = false; e._underPipe._waterFlow = undefined; e._underPipe._waterNet = null; }
    for (const e of EntityRegistry.getByType(T.WIRE))     if (e._underPipe) { e._underPipe.powered = false; e._underPipe._waterFlow = undefined; e._underPipe._waterNet = null; }
    for (const e of EntityRegistry.getByType(T.COALGENERATOR)) e._hasWater = false;
    // BFS out from every powered extractor's output stub, LABELLING each pipe
    // with the network (component) it belongs to. Water is metered, not just
    // topological: each extractor puts a fixed number of units/s into the
    // network it feeds (WATEREXTRACTOR.waterPerSecond) and every coal
    // generator hanging off that network draws COALGENERATOR.waterPerSecond
    // back out. The component labelling is what makes that possible — two
    // extractors piped into the same run pool their output, while separate
    // runs keep separate budgets.
    // Tiles are keyed by number (_wk) and each walk reads its queue by index:
    // with a string per tile and an Array.shift() per step (which moves the
    // whole queue up one) this pass was a few ms of every tick on a
    // late-game water network. Same tiles, same order.
    const _wk = (c, r) => (c + 16) * 65536 + (r + 16);
    const visited    = new Set();
    const compOf     = new Map();   // _wk(c, r) -> component id
    const compSupply = [];          // component id -> units/s still unclaimed
    const compServed = [];          // component id -> generators supplied
    const compExt    = [];          // component id -> units/s put in by extractors
    const compTanks  = [];          // component id -> [{ tank, rate }] tanks discharging into it
    const compPipes  = [];          // component id -> pipes, so the info panel can quote the flow
    for (const ext of EntityRegistry.getByType(T.WATEREXTRACTOR)) {
        ext._waterComp   = null;
        ext._waterSpare  = 0;
        ext._waterServed = 0;
        if (!ext.powered) continue;
        // Seed only from the extractor's single rotatable output stub —
        // water only flows out of that one tile, not the whole perimeter.
        const port = HydroSystem.extractorOutputPort(ext);
        if (!port) continue;
        const pk = _wk(port.c, port.r);
        // Supply is the same number the info panel quotes, so what the player
        // reads and what the network actually allocates can't disagree.
        const rate = ext._waterRate || 0;
        if (visited.has(pk)) {
          // Another extractor already mapped this network — pool into it.
          const cid = compOf.get(pk);
          if (cid !== undefined) { compSupply[cid] += rate; compExt[cid] += rate; ext._waterComp = cid; }
          continue;
        }
        const cid = compSupply.length;
        compSupply.push(rate);
        compServed.push(0);
        compExt.push(rate);
        compTanks.push([]);
        ext._waterComp = cid;
        visited.add(pk);
        const queue = [port.c, port.r];
        for (let qi = 0; qi < queue.length; qi += 2) {
          const c = queue[qi], r = queue[qi + 1];
          const e = GridManager.getEntity(c,r);
          if (!e) continue;
          const pipeEnt = isPipeType(e) ? e : ((e.type === T.CONVEYOR || e.type === T.WIRE) && e._underPipe ? e._underPipe : null);
          if (!pipeEnt) continue;
          // Skip a pipe already carrying a different fluid (still marked from
          // last tick — oil/fuel-oil/acid/cool haven't been re-cleared yet this
          // tick since this runs first) so water never floods across into it.
          if (!pipeAllowsFluid(pipeEnt, 'water')) continue;
          pipeEnt.powered = true;
          (compPipes[cid] || (compPipes[cid] = [])).push(pipeEnt);
          compOf.set(_wk(c, r), cid);
          const nbs = pipeBfsCoords(c, r, 'water');
          for (let k = 0; k < nbs.length; k++) {
            const nc = nbs[k][0], nr = nbs[k][1];
            const key = _wk(nc, nr);
            if (!visited.has(key) && GridManager.inBounds(nc,nr)) {
              visited.add(key);
              const n = GridManager.getEntity(nc,nr);
              if (n && (isPipeType(n) || ((n.type === T.CONVEYOR || n.type === T.WIRE) && n._underPipe))) queue.push(nc, nr);
            }
          }
        }
      }

    // Liquid Storage Tanks holding water discharge from their resolved OUT
    // stub (see OilSystem.resolveTankPorts). A tank is a metered source like
    // an extractor, but a finite one: its speed is no limit (it used to stop at
    // an extractor's 25 units/s, so two Cooling Towers on one tank ran one short
    // beside a tank full of water), and OilSystem.tickStorageTank drains
    // whatever share the generators actually take (e._waterDraw). If its outlet
    // run is already part of an extractor's network the tank pools into it, and
    // extractors are spent first so a topped-up tank only drains to cover the
    // shortfall.
    for (const tank of EntityRegistry.getByType(T.OILSTORAGE)) {
      tank._waterDraw = 0;
      tank._waterComp = null;
      if (tank._lightningDamaged || tank._liquidType !== 'water' || !((tank._crude || 0) > 0)) continue;
      // Offer what's actually stored, as one second's worth. Offering more
      // whenever the tank held a drop meant a tank being refilled slower than
      // it's drawn would sit at ~0 and switch every generator on it on and off
      // each tick; this way it settles on running as many as its refill can
      // sustain, and the oldest plants keep their water.
      const rate = tank._crude;
      const ports = OilSystem.resolveTankPorts(tank);
      const oc = ports.out.c, orow = ports.out.r;
      const inKey = _wk(ports.in.c, ports.in.r);
      if (!GridManager.inBounds(oc, orow)) continue;
      const ok = _wk(oc, orow);
      if (ok === inKey) continue;   // shouldn't happen, but never seed a self-loop
      const seedEnt = GridManager.getEntity(oc, orow);
      const seedPipe = seedEnt ? (isPipeType(seedEnt) ? seedEnt : (seedEnt._underPipe || null)) : null;
      if (!seedPipe || !pipeAllowsFluid(seedPipe, 'water')) continue;
      if (visited.has(ok)) {
        const cid = compOf.get(ok);
        if (cid === undefined) continue;
        compSupply[cid] += rate;
        compTanks[cid].push({ tank, rate });
        tank._waterComp = cid;
        continue;
      }
      const cid = compSupply.length;
      compSupply.push(rate);
      compServed.push(0);
      compExt.push(0);
      compTanks.push([{ tank, rate }]);
      tank._waterComp = cid;
      visited.add(ok);
      const queue = [oc, orow];
      for (let qi = 0; qi < queue.length; qi += 2) {
        const c = queue[qi], r = queue[qi + 1];
        const e = GridManager.getEntity(c, r);
        if (!e) continue;
        const pipeEnt = isPipeType(e) ? e : ((e.type === T.CONVEYOR || e.type === T.WIRE) && e._underPipe ? e._underPipe : null);
        if (!pipeEnt || !pipeAllowsFluid(pipeEnt, 'water')) continue;
        // Skip the tank's own IN stub so a looped pipe can't refill from itself.
        if (_wk(c, r) === inKey) continue;
        pipeEnt.powered = true;
        (compPipes[cid] || (compPipes[cid] = [])).push(pipeEnt);
        // Remember which tank alone is feeding this run, so that tank's own
        // intake can't refill itself from its outlet (tickStorageTank).
        pipeEnt._waterTankSrc = tank;
        compOf.set(_wk(c, r), cid);
        const nbs = pipeBfsCoords(c, r, 'water');
        for (let k = 0; k < nbs.length; k++) {
          const nc = nbs[k][0], nr = nbs[k][1];
          const key = _wk(nc, nr);
          if (key === inKey) continue;
          if (!visited.has(key) && GridManager.inBounds(nc, nr)) {
            visited.add(key);
            const n = GridManager.getEntity(nc, nr);
            if (n && (isPipeType(n) || ((n.type === T.CONVEYOR || n.type === T.WIRE) && n._underPipe))) queue.push(nc, nr);
          }
        }
      }
    }

    // Coal generators only accept water at their fixed Water IN stub tile
    // (bottom face, middle column) — matches CoalGeneratorConnections.stubs()
    // in waste_cooling_systems.js exactly. Being on a live pipe is now only
    // half of it: the network's budget has to have a share left over too.
    const _thirsty = [];
    const _addThirsty = (e, c, r, need) => {
      e._hasWater   = false;
      e._waterShort = false;            // plumbed in, but the budget ran dry
      e._waterArriving = false;         // plumbed in, but the water is still on its way down the line
      const nb = GridManager.getEntity(c, r);
      const pipeEnt = nb ? (isPipeType(nb) ? nb : (nb._underPipe || null)) : null;
      if (!pipeEnt || !pipeEnt.powered) return;
      if (!pipeArrived(pipeEnt, 'water')) { e._waterArriving = true; return; }
      const cid = compOf.get(_wk(c, r));
      if (cid === undefined) return;
      _thirsty.push({ e, cid, need });
    };
    const _genNeed = EntityDefs[T.COALGENERATOR].waterPerSecond || 8;
    for (const e of EntityRegistry.getByType(T.COALGENERATOR)) {
      const cgW = e.width || 3, cgH = e.height || 4;
      _addThirsty(e, e.col + Math.floor(cgW / 2), e.row + cgH, _genNeed);
    }
    // Cooling Towers take their water in at H₂O IN (CoolingTowerSystem.getStubs)
    // and share the same metered budget as the coal generators. Only the MK1
    // draws raw network water — the Cryogenic tower runs on already-cooled
    // water instead (NuclearSystem.resolveCooling handles its H₂O IN there,
    // the same pass that feeds reactors), so it's excluded here.
    for (const e of EntityRegistry.getByType(T.COOLINGTOWER)) {
      const _towerNeed = EntityDefs[T.COOLINGTOWER].waterPerSecond || 12;
      const { hotIn } = CoolingTowerSystem.getStubs(e);
      _addThirsty(e, hotIn.c, hotIn.r, _towerNeed);
    }
    // Lithium Processing Plants draw real water too (5 u/s at WATER IN),
    // out of the same budget. Only while they would actually run: a plant
    // that is unpowered, struck, or sitting on a full compound buffer claims
    // nothing, so it does not starve a generator for water it is not using.
    for (const e of EntityRegistry.getByType(T.LITHIUMPROCESSPLANT)) {
      const _def = EntityDefs[T.LITHIUMPROCESSPLANT];
      e._hasWater = false; e._waterShort = false;
      const idle = !e.powered || e._lightningDamaged || LithiumProcessPlantSystem.outputFull(e);
      if (idle) continue;
      const { waterIn } = LithiumProcessPlantSystem.getStubs(e);
      _addThirsty(e, waterIn.c, waterIn.r, _def.waterPerSec || 5);
    }
    // Oldest first, then by position. Allocation order has to be STABLE —
    // iterating the registry directly would let the set of supplied
    // generators change from tick to tick as entities are added or removed,
    // so a plant would flicker between running and NO WATER for no visible
    // reason. Seniority also makes the rule legible: plumbing a third
    // generator into a two-generator extractor starves the new one rather
    // than a plant that has been running all game.
    _thirsty.sort((a, b) => (a.e._placedAt || 0) - (b.e._placedAt || 0)
                         || a.e.col - b.e.col || a.e.row - b.e.row);
    const compDrawn = compSupply.map(() => 0);   // component id -> units/s handed out
    for (const g of _thirsty) {
      if (compSupply[g.cid] >= g.need) {
        compSupply[g.cid] -= g.need;
        compDrawn[g.cid]  += g.need;
        compServed[g.cid]++;
        g.e._hasWater = true;
      } else {
        g.e._waterShort = true;
      }
    }
    // Tanks pay only for the water extractors on the same run couldn't cover.
    for (let cid = 0; cid < compTanks.length; cid++) {
      if (!compTanks[cid].length) continue;
      let fromTanks = Math.max(0, compDrawn[cid] - compExt[cid]);
      for (const src of compTanks[cid]) {
        const take = Math.min(src.rate, fromTanks);
        src.tank._waterDraw = take;
        fromTanks -= take;
        if (fromTanks <= 0) break;
      }
    }
    // Units/s this run is actually moving: what consumers took, plus whatever
    // supply is still spare. A pipe with an extractor and no generator is
    // still carrying that extractor's output.
    // The run's whole budget, stamped on every pipe of it for the pipe info
    // panel: supply, what was handed out, what's left, who got it, and how
    // many plumbed-in buildings went without.
    const compShort = compSupply.map(() => 0), compSources = compSupply.map(() => 0);
    for (const g of _thirsty) if (g.e._waterShort) compShort[g.cid]++;
    for (const ext of EntityRegistry.getByType(T.WATEREXTRACTOR)) if (ext._waterComp != null) compSources[ext._waterComp]++;
    for (let cid = 0; cid < compTanks.length; cid++) compSources[cid] += compTanks[cid].length;
    for (let cid = 0; cid < compPipes.length; cid++) {
      const list = compPipes[cid];
      if (!list) continue;
      const flow = (compDrawn[cid] || 0) + (compSupply[cid] || 0);
      const net = { supply: flow, drawn: compDrawn[cid] || 0, spare: compSupply[cid] || 0,
                    served: compServed[cid] || 0, short: compShort[cid], sources: compSources[cid] };
      for (const p of list) { p._waterFlow = flow; p._waterNet = net; }
    }
    // Report what's left so the extractor panel can show real headroom.
    for (const ext of EntityRegistry.getByType(T.WATEREXTRACTOR)) {
      if (ext._waterComp == null) continue;
      ext._waterSpare  = compSupply[ext._waterComp];
      ext._waterServed = compServed[ext._waterComp];
    }
  }

  // computeWireHops() depends on grid topology, MAX_WIRE_HOPS, and which
  // Power Towers are lightning-dead relays (isDeadRelay — a struck tower
  // stops anchoring). Topology alone is not enough: strike/repair flips
  // _lightningDamaged without EntityRegistry.add/remove, so the hop cache
  // must also key on a dead-relay signature. Call sites that place/remove
  // entities still call recomputeWireHops() afterward; lightning damage
  // and repair do the same.
  //
  // Hop results also drive wire.outOfRange, which floodFill's canConnect
  // reads — so whenever hops actually recompute we drop the component
  // cache too. Otherwise a repaired tower (or a Wire MK2 hop unlock) can
  // leave an undamaged tower stranded next to a still-green span that the
  // stale membership never rejoined.
  //
  // Skipping the BFS on unchanged ticks matters: it used to re-run in full
  // every 100ms on thousands of wires for a result that, while the player
  // just watches the city, never changes.
  let _hopsCacheTopoVer    = -1;
  let _hopsCacheMaxHops    = -1;
  let _hopsCacheRelaySig   = -1;
  let _hopsCacheRelayCount = -1;

  // Cheap signature of lightning-open Power Towers — dozens of towers, not
  // thousands of wires. Used by both hop and component caches.
  function _deadRelaySignature() {
    let sig = 0, n = 0;
    for (const e of EntityRegistry.getByType(T.POWERTOWER)) {
      if (!e._lightningDamaged) continue;
      n++;
      sig = (sig * 31 + (e.row * COLS + e.col)) | 0;
    }
    return { sig, n };
  }

  // ── Drag batching ──
  // Drag-placing wire / pipe / poles changes the topology on EVERY tick, and
  // each change costs a full component flood-fill (~125ms on a 30k-entity
  // city) plus a wire-hop pass (~16ms) — at 10 ticks a second that is more
  // work than there is time, and the frame rate collapses while the player
  // holds LMB and pans. While a drag is live the two rebuilds are held off
  // entirely (even one every ¾s still showed as a ~150ms stutter);
  // releasing the button forces the rebuild. Freshly laid tiles just read
  // as unconnected until then. DRAG_REBUILD_MS is only a safety valve so a
  // stuck mouse-down state can't freeze the grid's topology forever.
  const DRAG_REBUILD_MS = 15000;
  let _dragBatching = false;
  let _hopsBuiltAt = 0, _compBuiltAt = 0;
  function setDragBatching(on) {
    on = !!on;
    if (on === _dragBatching) return;
    _dragBatching = on;
    if (!on) { _hopsCacheTopoVer = -1; invalidateComponents(); }   // settle on release
  }
  const _dragHold = (builtAt) => _dragBatching && (performance.now() - builtAt) < DRAG_REBUILD_MS;

  function ensureWireHopsFresh() {
    // See apocalypse_system.js — once the run has ended there is no grid to
    // solve, and every destroyed building would otherwise pay for a full
    // rebuild of the wire graph on its way out.
    if (typeof ApocalypseSystem !== 'undefined' && ApocalypseSystem.hasEnded()) return;
    if (_hopsBuiltAt && _dragHold(_hopsBuiltAt)) return;
    const ver = EntityRegistry.getTopologyVersion();
    const { sig: relaySig, n: relayCount } = _deadRelaySignature();
    if (ver === _hopsCacheTopoVer && MAX_WIRE_HOPS === _hopsCacheMaxHops
        && relaySig === _hopsCacheRelaySig && relayCount === _hopsCacheRelayCount) return;
    computeWireHops();
    _hopsBuiltAt         = performance.now();
    _hopsCacheTopoVer    = ver;
    _hopsCacheMaxHops    = MAX_WIRE_HOPS;
    _hopsCacheRelaySig   = relaySig;
    _hopsCacheRelayCount = relayCount;
    // outOfRange flags may have flipped — membership must be rediscovered.
    invalidateComponents();
  }

  // Public entry used by lightning / weather / placement. Dirties the hop
  // cache so the next ensureWireHopsFresh (or this call) cannot no-op on a
  // stale topology match after a relay-only change that somehow skipped
  // the signature path.
  function forceRecomputeWireHops() {
    _hopsCacheTopoVer    = -1;
    _hopsCacheMaxHops    = -1;
    _hopsCacheRelaySig   = -1;
    _hopsCacheRelayCount = -1;
    // Mid-drag (placing OR deleting a run) every tile calls this; the full
    // pass waits for the release, which settles it (setDragBatching).
    if (_dragHold(_hopsBuiltAt)) return;
    ensureWireHopsFresh();
  }

  // For each wire, BFS outward to find distances to all reachable anchors.
  // A wire is out-of-range if:
  //   - its nearest anchor is > MAX hops away, OR
  //   - it sits between two anchors whose combined distance through it exceeds MAX
  //     (i.e. the two closest anchor distances sum to > MAX)
  function computeWireHops() {
    const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    // An open crater tile counts as its well here too (see _buildCraterMap).
    _buildCraterMap();
    const _hopEntity = (c, r) => GridManager.getEntity(c, r) || (_craterOf && _craterOf.get(r * COLS + c)) || null;

    // Pre-pass: a pole is in-range if within MAX_WIRE_HOPS wires of a real
    // anchor OR of an in-range pole, so in-range status runs down a chain of
    // poles. This used to sweep every pole up to 20 times, and each sweep
    // only reached as far down a chain as registry order allowed: a line
    // whose poles were saved in the wrong order (a reload re-adds them in
    // grid order) got about 20 poles out and left the rest stranded until
    // it was rebuilt. A worklist follows a chain to its end: whenever a pole
    // comes into range, the poles within its reach are checked again.
    //
    // `d` is the wires between this pole and the other one. Up to
    // MAX_WIRE_HOPS of them, the same span the wire tool lets you lay
    // between two anchors: this was a fixed 3, so a run of 4 (or a longer
    // one after Wire MK2) laid without complaint and left the pole on the
    // end dead. Nothing further away counts, so the walk stops there.
    const poleReach = (e) => {
      const seen = new Set([e.row * COLS + e.col]);
      let frontier = [[e.col, e.row, 0]];
      let anchored = false;
      const poles = [];
      while (frontier.length) {
        const next = [];
        for (const [fc, fr, d] of frontier) {
          for (const [dc, dr] of dirs) {
            const nc = fc+dc, nr = fr+dr;
            if (!GridManager.inBounds(nc, nr)) continue;
            const idx = nr * COLS + nc;
            if (seen.has(idx)) continue;
            seen.add(idx);
            const ne = _hopEntity(nc, nr);
            if (!ne) continue;
            if (ne.type === T.WIRE || pipeOnWire(ne) || (ne.type === T.CONVEYOR && ne._underWire)) { if (d + 1 <= MAX_WIRE_HOPS) next.push([nc, nr, d+1]); }
            else if (ne.type === T.POLE) { if (d <= MAX_WIRE_HOPS) poles.push(ne); }
            else if (isRangeAnchor(ne) && d <= MAX_WIRE_HOPS) anchored = true;
          }
        }
        frontier = next;
      }
      return { anchored, poles };
    };
    const _poleWork = [...EntityRegistry.getByType(T.POLE)];
    for (const e of _poleWork) e.outOfRange = true;
    for (let i = 0; i < _poleWork.length; i++) {
      const e = _poleWork[i];
      if (!e.outOfRange) continue;
      const reach = poleReach(e);
      if (!reach.anchored && !reach.poles.some(p => !p.outOfRange)) continue;
      e.outOfRange = false;
      for (const p of reach.poles) if (p.outOfRange) _poleWork.push(p);
    }

    for (const e of EntityRegistry.getByType(T.WIRE)) {
        const c = e.col, r = e.row;

        // BFS from this wire tile outward through wires to find all anchor distances
        // Poles only count as anchors if they are themselves in-range (outOfRange===false)
        const POLE_LIMIT = 4;
        // _hopVisited/_hopTouched: a reused numeric scratch buffer instead of
        // `new Set()` + template-string keys (`${nc},${nr}`) per tile — string
        // concatenation and hash-set insertion/lookup per visited tile added
        // up fast across thousands of wires each running their own BFS below.
        // Every index marked here gets unmarked in the cleanup pass at the
        // bottom before moving to the next wire, so the buffer is safe to share.
        _hopTouched.length = 0;
        const startIdx = r * COLS + c;
        _hopVisited[startIdx] = 1;
        _hopTouched.push(startIdx);
        let frontier  = [[c, r, 0]];
        const anchors = []; // { dist, isPole }

        while (frontier.length) {
          const next = [];
          for (const [fc, fr, d] of frontier) {
            for (const [dc, dr] of dirs) {
              const nc = fc + dc, nr = fr + dr;
              if (!GridManager.inBounds(nc, nr)) continue;
              const nidx = nr * COLS + nc;
              if (_hopVisited[nidx]) continue;
              _hopVisited[nidx] = 1;
              _hopTouched.push(nidx);
              const ne = _hopEntity(nc, nr);
              if (!ne) continue;
              if (ne.type === T.WIRE || pipeOnWire(ne) || (ne.type === T.CONVEYOR && ne._underWire)) {
                next.push([nc, nr, d + 1]);
              } else if (ne.type === T.POLE) {
                // Only count pole as anchor if it's in-range itself
                if (!ne.outOfRange) anchors.push({ dist: d + 1, isPole: true });
                // Always stop BFS at poles (don't traverse through them)
              } else {
                // Generator, substation, research stn etc. — always valid anchor.
                // A struck tower still blocks the BFS (it's a solid building
                // wires can't route through) but no longer anchors anything.
                if (isRangeAnchor(ne)) anchors.push({ dist: d + 1, isPole: false });
              }
            }
          }
          frontier = next;
          // PERF: only the two globally-nearest anchors are ever used below
          // (nearest-anchor check + bridging check between anchors[0]/[1]).
          // BFS visits nodes in non-decreasing distance order and a whole
          // frontier level is fully drained above before this point, so once
          // 2+ anchors have been collected, every remaining unexplored node
          // is provably no closer than the anchors already found — walking
          // the rest of the wire network can't change the answer. Without
          // this, every single wire tile BFS'd the ENTIRE connected wire
          // network to its full extent (a wire has no special-cased anchor
          // to stop at, unlike poles), making this O(wires²) — on a city
          // with a few thousand wires in one network that's tens of millions
          // of visited-set operations per tick, tanking frame rate. Most
          // wires sit within a couple of hops of 2 anchors, so this exits
          // almost immediately in the common case.
          if (anchors.length >= 2) break;
        }

        // Cleanup: unmark only the indices this wire's BFS actually touched,
        // so the shared scratch buffer is clean for the next wire without
        // paying for a full ROWS*COLS reset.
        for (let ti = 0; ti < _hopTouched.length; ti++) _hopVisited[_hopTouched[ti]] = 0;

        if (anchors.length === 0) {
          e.hopCount   = 999;
          e.outOfRange = true;
          continue;
        }

        anchors.sort((a, b) => a.dist - b.dist);
        const nearest = anchors[0].dist;
        e.hopCount = nearest;

        // Per-anchor limit: pole caps at 4, tower/gen at MAX_WIRE_HOPS
        const effectiveLimit = (anchor) => anchor.isPole ? POLE_LIMIT : MAX_WIRE_HOPS;

        // Out of range if nearest anchor is too far for its type
        const nearestOOR = nearest > effectiveLimit(anchors[0]);

        // Bridging check
        let bridgedOOR = false;
        if (anchors.length >= 2) {
          const a1 = anchors[0], a2 = anchors[1];
          bridgedOOR = (a1.dist + a2.dist) > (effectiveLimit(a1) + effectiveLimit(a2));
        }

        e.outOfRange = nearestOOR || bridgedOOR;
    }
  }

  // ── Component cache ────────────────────────────────────────────────
  // Rebuilding every network from scratch with floodFill was measured at
  // 41.6ms of a 49.9ms PowerNetwork.tick on a 30k-entity city — 10x/sec,
  // i.e. about half of all wall-clock time, which is what was capping the
  // frame rate regardless of zoom, weather or graphics quality.
  //
  // floodFill's dynamic inputs (beyond topology) are:
  //   • wire/pole `.failed` (overload / storm) — signed in the reset pass
  //   • wire/pole `.outOfRange` — refreshed by ensureWireHopsFresh; that
  //     path calls invalidateComponents() whenever hops actually recompute
  //   • Power Tower `_lightningDamaged` (dead relay) — signed here so a
  //     strike/repair that somehow skipped hop invalidation still busts
  //     membership instead of leaving an undamaged tower dark beside a
  //     live green span
  // Topology changes when something is built, demolished or moved —
  // EntityRegistry bumps a version for exactly that. If none of the above
  // moved, this tick's components are identical to last tick's, so reuse
  // them outright.
  //
  // The common case — a player watching a city run — is a cache hit, and
  // the whole BFS cost disappears. The pipeline downstream (supply/demand,
  // wire loads, stats) still runs every tick against the same arrays, so
  // power state stays exactly as live as before; only the membership
  // discovery is skipped. A cache miss costs what the old code cost.
  let _compCache           = null;
  let _compCacheVer        = -1;
  let _compCacheSig        = -1;
  let _compCacheFails      = -1;
  let _compCacheRelaySig   = -1;
  let _compCacheRelayCount = -1;

  function _getComponents(failSig, failCount, relaySig, relayCount) {
    const ver = EntityRegistry.getTopologyVersion();
    if (_compCache && _dragHold(_compBuiltAt)) return _compCache;   // mid-drag: see setDragBatching
    if (_compCache && ver === _compCacheVer &&
        failSig === _compCacheSig && failCount === _compCacheFails &&
        relaySig === _compCacheRelaySig && relayCount === _compCacheRelayCount) {
      PerfMonitor.record('PN: floodFill total', 0);
      PerfMonitor.record('PN: floodFill calls', 0);
      return _compCache;
    }

    const _ffT0 = performance.now();
    _buildCraterMap();
    const visited = _visited;
    visited.fill(0);
    const out = [];
    let calls = 0;
    for (const entity of EntityRegistry.all()) {
      // Water/trees/bushes are terrain, never power-network participants
      // (canConnect() always rejects them as neighbours) — each one would
      // otherwise form its own trivial 1-entity "network" and pay for the
      // full component pipeline (demand-curve lookup, substation filter,
      // congestion reduce, hasPower distribution, stats accumulation — a
      // dozen-odd operations apiece). On a heavily-treed map that's 10,000+
      // wasted component builds every single tick.
      //
      // Pipes/underground pipes/conveyors are the same story for a
      // fluid-carrying city: a plain one (no wire stacked underneath, the
      // overwhelming majority) can never connect to anything here — two
      // adjacent plain pipes don't satisfy floodFill's hasWire rule, so each
      // is always its own singleton "network" too, and whatever this
      // computes for its .powered is immediately overwritten anyway by
      // updatePipeConnectivity(). The rarer wire-under-pipe/conveyor tiles
      // that DO conduct power aren't lost by skipping them as seeds — they
      // still get swept into whichever real network they border when THAT
      // entity is processed as a seed instead; floodFill's neighbour
      // traversal doesn't care which entity started the search.
      if (entity.type === T.WATER || entity.type === T.TREE || entity.type === T.BUSH ||
          entity.type === T.PIPE || entity.type === T.UNDERGNDPIPE || entity.type === T.CONVEYOR ||
          entity.type === T.GOVERNOR) continue;
      // A tripped or storm-failed span is an open circuit: no neighbour can
      // enter it (see floodFill), so it belongs to no network. Seeding it
      // made each one a one-wire "network" of its own — an overloaded grid
      // with no surge protection trips every span at once, which turned 13
      // components into ~1,540 on a 1,200-wire city, each paying the full
      // pipeline below and rebuilt on every trip and reclose — the whole
      // tick ran ~40% slower for as long as the lines stayed red.
      // Worse, a tripped span reached as a seed flooded out into the live
      // wire beside it and conducted, depending only on registry order.
      // Left unseeded it keeps the reset pass's networkId -1 / unpowered.
      if ((entity.type === T.WIRE || entity.type === T.POLE) && entity.failed) continue;
      const c = entity.col, r = entity.row;
      if (visited[r * COLS + c]) continue;
      const component = floodFill(c, r, visited);
      calls++;
      if (!component.length) continue;
      out.push(component);
    }

    _compCache           = out;
    _compBuiltAt         = performance.now();
    _compCacheVer        = ver;
    _compCacheSig        = failSig;
    _compCacheFails      = failCount;
    _compCacheRelaySig   = relaySig;
    _compCacheRelayCount = relayCount;
    PerfMonitor.record('PN: floodFill total', performance.now() - _ffT0);
    PerfMonitor.record('PN: floodFill calls', calls);
    return out;
  }

  // Drop the cached components — forces a full rebuild on the next tick.
  function invalidateComponents() { _compCache = null; }

  // Each component split into its conductors (wires and poles) and the rest,
  // in their original order, plus the Protector bays / Geothermal Wells in it.
  // On a built-up grid the conductors are most of a network, and all tick()
  // does to one is the same few writes, so its passes run over whichever part
  // they concern. Kept per component array: those live exactly as long as
  // _getComponents' cache, and an entity's type never changes on the grid.
  const _splits = new WeakMap();
  function _pnSplit(component) {
    let s = _splits.get(component);
    if (s) return s;
    const wires = [], rest = [], bays = [];
    for (let i = 0; i < component.length; i++) {
      const e = component[i];
      if (e.type === T.WIRE || e.type === T.POLE) { wires.push(e); continue; }
      rest.push(e);
      if (e.type === T.PROTECTOR || e.type === T.PROTECTOR2 || e.type === T.PROTECTOR3 || e.type === T.GEOWELL || e.type === T.HYDROTURBINE) bays.push(e);
    }
    s = { wires, rest, bays, hasWire: wires.length > 0 };
    _splits.set(component, s);
    return s;
  }

  // A Geothermal Well sitting on a 3-tall deposit only takes the top two
  // rows, but the crater is drawn across all three, so a wire run up to the
  // crater's edge looks attached and would touch nothing. Each open crater
  // tile (index → well) conducts as part of its well, both ways: a wire
  // beside one reaches the well, and the well reaches the wire. Rebuilt with
  // the components. _craterWired tells GeothermalSystem its well is wired.
  let _craterOf = null;
  const _wireLike = (e) => e && (e.type === T.WIRE || pipeOnWire(e) || conveyorOnWire(e));
  const _D4N = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  function _buildCraterMap() {
    _craterOf = null;
    for (const w of EntityRegistry.getByType(T.GEOWELL)) {
      w._craterWired = false;
      if (w._depositCol === undefined) continue;
      const r1 = w._depositRow + (w._depositHeight || 2), c1 = w._depositCol + (w._depositWidth || 2);
      for (let r = w.row + (w.height || 2); r < r1; r++)
        for (let c = w._depositCol; c < c1; c++)
          if (GridManager.inBounds(c, r) && !GridManager.getEntity(c, r)) (_craterOf ||= new Map()).set(r * COLS + c, w);
    }
  }
  // Wires beside `well`'s open crater tiles.
  function _craterWires(well) {
    const out = [];
    for (const [idx, w] of _craterOf) {
      if (w !== well) continue;
      const c = idx % COLS, r = (idx - c) / COLS;
      for (const [dc, dr] of _D4N) {
        const nc = c + dc, nr = r + dr;
        if (!GridManager.inBounds(nc, nr)) continue;
        const n = GridManager.getEntity(nc, nr);
        if (_wireLike(n) && canConnect(n)) out.push({ col: nc, row: nr, entity: n });
      }
    }
    return out;
  }

  // BFS from a seed tile; returns deduplicated connected entities
  function floodFill(startCol, startRow, visited) {
    const component = [];
    const seen      = new Set();   // dedup multi-tile entities
    const queue = [{ col: startCol, row: startRow }];
    let   head  = 0;   // index-pointer dequeue — queue.shift() is O(n) per call
                        // (re-indexes the whole array), which turns this BFS
                        // O(n²) once a network has many wire tiles. Advancing
                        // a pointer instead is O(1) per dequeue.
    visited[startRow * COLS + startCol] = 1;

    while (head < queue.length) {
      const { col, row } = queue[head++];
      const entity = GridManager.getEntity(col, row);
      if (!entity) continue;

      // For multi-tile entities, mark all footprint tiles visited so the
      // outer scan loop doesn't start a separate component from a non-anchor tile,
      // and enqueue all footprint tiles so all sides get their neighbours checked.
      // getNeighbours on any tile of a multi-tile entity returns the whole
      // entity's perimeter, so its neighbours are expanded once, the first
      // time it is reached; a second pass from another of its tiles could
      // only find tiles already handled. It used to run from every footprint
      // tile, which on a 64×40 building was 2,560 perimeter walks of ~200
      // tiles each, and made a full rebuild take 1–2 s on a large city: the
      // multi-second freezes whenever the grid changed or a storm tripped a line.
      if (seen.has(entity)) continue;
      {
        seen.add(entity);
        component.push(entity);
        const w = entity.width  || 1;
        const h = entity.height || 1;
        for (let dr = 0; dr < h; dr++) {
          for (let dc = 0; dc < w; dc++) {
            const fc = entity.col + dc, fr = entity.row + dr;
            const fidx = fr * COLS + fc;
            if (!visited[fidx]) {
              visited[fidx] = 1;
              // Its own tiles need no visit of their own (see above); only a
              // tile under its footprint holding something else does.
              if (GridManager.getEntity(fc, fr) !== entity) queue.push({ col: fc, row: fr });
            }
          }
        }
      }

      // A lightning-struck Power Tower is an open circuit. Neighbours cannot
      // enter it (canConnect), but if the outer scan seeds the tower itself
      // first it would otherwise flood out through its footprint and glue
      // the wire runs on both sides back into one component — defeating the
      // dead-relay split. Stay in the component alone; do not expand.
      if (isDeadRelay(entity)) continue;

      const neighbours = GridManager.getNeighbours(col, row);
      for (let ni = 0; ni < neighbours.length; ni++) {
        const n = neighbours[ni];
        const nidx = n.row * COLS + n.col;
        if (visited[nidx] || !canConnect(n.entity)) continue;
        // Skip wires that failed last tick — they're open circuit
        if (n.entity && (n.entity.type === T.WIRE || n.entity.type === T.POLE) && n.entity.failed) continue;
        // At least one side of every connection must be a wire —
        // non-wire entities cannot power each other directly.
        // Exception: lamps and cameras can RECEIVE power from any adjacent
        // entity (they tap power wirelessly at short range), but they
        // cannot CONDUCT it onward — power doesn't flow through an
        // amenity into a non-amenity. Amenity → amenity is fine so
        // lamp clusters share a single wire tap.
        // Exception: wind turbines placed directly adjacent to each
        // other share the same network — only one needs an actual
        // wire link to the grid; turbines touching it (or each other)
        // connect through automatically.
        // Exception: houses/commercial/industrial and the powered requested
        // amenities ("properties") sitting
        // directly next to each other can pass power between themselves
        // too — GridManager.getNeighbours only ever returns tiles exactly
        // one square away, so this can never bridge two properties with
        // a gap between them; it's strictly touching-tile-to-touching-tile,
        // the same way the wind exception above works.
        const hasWire = (entity.type === T.WIRE || pipeOnWire(entity) || conveyorOnWire(entity))
                     || (n.entity    && (n.entity.type    === T.WIRE    || pipeOnWire(n.entity)    || conveyorOnWire(n.entity)))
                     || isAmenity(n.entity)
                     || (isAmenity(entity) && isAmenity(n.entity))
                     || (isWind(entity) && isWind(n.entity))
                     || (isProperty(entity) && isProperty(n.entity))
                     || isGeoPair(entity, n.entity)
                     // A Throttle Governor draws its control power from the
                     // generator it's bolted to, like a lamp tapping a wire.
                     || (isGovernedGen(entity) && n.entity && n.entity.type === T.GOVERNOR);
        if (hasWire) {
          visited[nidx] = 1;
          queue.push({ col: n.col, row: n.row });
        }
      }

      // Across a well's open crater tiles (see _buildCraterMap).
      if (_craterOf) {
        if (entity.type === T.GEOWELL) {
          for (const n of _craterWires(entity)) {
            if (n.entity.failed) continue;
            entity._craterWired = true;
            const nidx = n.row * COLS + n.col;
            if (visited[nidx]) continue;
            visited[nidx] = 1;
            queue.push({ col: n.col, row: n.row });
          }
        } else if (_wireLike(entity)) {
          for (const [dc, dr] of _D4N) {
            const w = _craterOf.get((row + dr) * COLS + (col + dc));
            if (!w || !canConnect(w)) continue;
            w._craterWired = true;
            const widx = w.row * COLS + w.col;
            if (visited[widx]) continue;
            visited[widx] = 1;
            queue.push({ col: w.col, row: w.row });
          }
        }
      }
    }
    return component;
  }

  /* computeDetailedWireLoads — spanning-tree load model
   *
   * Why spanning tree?
   * The old model put total network demand on every wire which is wrong.
   * A wire connecting one solar to one research station carries 5 kW, not
   * the full network's 20 kW. The spanning tree correctly isolates each
   * wire's downstream demand so overloads only fire where power actually
   * bottlenecks — exactly the routing puzzle we want.
   *
   * Algorithm:
   *   1. BFS from every non-wire, non-house entity outward through wires.
   *      Records parent/child relationships → spanning tree.
   *   2. Walk tree leaves → roots, accumulating demand upward.
   *      Each wire's accumulated value = everything downstream of it.
   *   3. wire.load = downstream demand. wire.failed = load > throughput.
   *      Failed wires are excluded from the connectivity BFS.
   */
  // networkDemand: netId → total consumption for that network component.
  // Populated by the component loop in tick(); used by applyWireLoads().
  const networkDemand = new Map();
  // netId → { cap, demand }: what the network could supply this tick
  // (generation after the congestion derate, plus what its storage can still
  // put out) and what it drew. Kept until the next tick, unlike
  // networkDemand; LaunchSystem reads it for a launch's power check.
  const networkHeadroom = new Map();

  /* ── Storm fault resistance ────────────────────────────────────────
     A surge protector's job is clamping transients, so it should matter
     most exactly when the weather is throwing them. It didn't:
     WeatherEventSystem.triggerWeatherFailures() computed wire stress
     straight off the raw 85 kW throughput and never looked at protectors at
     all, so a $45,000 MK2 bank bought precisely nothing during a storm —
     it only ever helped against steady-state overload, handled below.

     These scale the storm fault roll multiplicatively per unit on the
     network, so banks stack with diminishing returns, and are floored so
     that a storm is never completely harmless no matter how much hardware
     is standing. Eligibility (which wires are at risk) is deliberately
     left on raw wire capacity — a conductor is still a conductor; what
     the protectors buy you is surviving the surge, not being exempt.
     ─────────────────────────────────────────────────────────────────── */
  // How much a drone-serviced span's yellow-band fault roll is reduced.
  // A quarter, not zero: servicing is mitigation, not a repair, and a line
  // running at 95% of its rating is still a line running at 95% of its
  // rating. Raising the rating is the Surge Protector's job.
  const WIRE_SERVICE_SUPPRESS = 0.25;

  /* ── Protection tiers ───────────────────────────────────────
     CAPACITY is linear and has no ceiling: every unit on a network adds a
     fixed amount to its wire rating, and enough of ANY tier fixes ANY
     capacity problem. What separates the tiers is how much one unit does:
       network rating = base wire rating + Σ (units × capPerUnit)
     MK1 +170 kW, MK2 +2.1 MW, MK3 +9 MW. Per dollar MK2 and MK3 are level
     (~46 kW per $1k; MK1 ~14), so a higher tier buys fewer pads, less
     upkeep and less ground, not a capability the lower ones lack.

     It used to be a saturating curve per tier, MK1 converging on 680 kW and
     MK2 on 7.65 MW. A grid that outgrew a tier before the next was unlocked
     could not be fixed at all: nine MK1s sat at 649 kW under 590 kW of
     load, every wire yellow, the congestion derate cutting supply and
     random trips splitting the grid, and a tenth MK1 bought ~9 kW.

     STORM FAULT resistance still saturates per tier (a floor no number of
     units passes), since some risk should always remain in a storm:
       resist(n) = FLOOR + (1 - FLOOR) * (1 - resistK)^n   → 1 at n=0, → FLOOR
     ──────────────────────────────────────────────────────── */
  const PROTECTION_TIERS = [
    // MK1: 85 kW → 255 → 425 → 595 …  Storm faults → 0.35.
    { key: 'mk1', label: 'MK1', type: T.PROTECTOR,
      capPerUnit:  170, resistFloor: 0.35, resistK: 0.20 },
    // MK2: +2.1 MW a unit, about what one unit gave under the old curve.
    // Storm faults → 0.12.
    { key: 'mk2', label: 'MK2', type: T.PROTECTOR2,
      capPerUnit: 2100, resistFloor: 0.12, resistK: 0.45 },
    // MK3: +9 MW a unit. Storm faults → 0.03. (Filtered out below if the
    // type constant is missing.)
    { key: 'mk3', label: 'MK3', type: T.PROTECTOR3,
      capPerUnit: 9000, resistFloor: 0.03, resistK: 0.60 },
  ].filter(t => t.type !== undefined);

  // Throttles the stranded-protector advisory (see applyWireLoads).
  let _lastStrandedToast = 0;
  // Throttles the early-game "build more Biofuel Generators" hint (see tick).
  let _lastBiofuelHintToast = 0;

  // Ticks left in the post-load settle window. Right after a load, systems
  // that key off last tick's power state (MK3 bays, fuel gens, pumps, fuel
  // deliveries) haven't caught up yet, so the first few ticks can show a
  // dead or starved network. MK3 bays dropping out on that phantom outage
  // collapsed the wire cap and tripped a healthy grid on every reload.
  // While this runs, wires can't burn out and powered bays keep counting.
  const LOAD_GRACE_TICKS = 40;   // ~4 s at the 0.1 s power tick
  let _loadGrace = 0;
  // Topology settle: for a moment after any change to the grid (a wire cut
  // or laid, a building placed) nothing trips on overload, while plants and
  // pumps catch up with the new wiring — e.g. a line reattached after a cut
  // brings everything past it back at once. A span tripped on that one-tick
  // spike would sit open for WIRE_RECLOSE_MS and leave the line dark for
  // ~6 s. Real, sustained overloads still trip once it's over. (A network
  // left short carries no load at all — see step 5 of tick.)
  const TOPO_SETTLE_TICKS = 5;   // ~0.5 s
  let _topoSettle = 0, _settleTopoVer = -1;

  // netId → unit count, per tier. Hoisted out of applyWireLoads so
  // faultResistance() and the info panel read the same counts rather than
  // rebuilding them with another full scan per tier.
  for (const tier of PROTECTION_TIERS) tier.counts = new Map();

  // Wire throughput is read through a function, not captured at module eval:
  // EntityDefs is not guaranteed to be populated when this file evaluates.
  const _baseCap = () => EntityDefs[T.WIRE].throughput;

  // n units of one tier's storm fault resistance: start at 1, close `k` of
  // the remaining gap per unit, approach `limit` without reaching it.
  function _tierCurve(limit, k, n) {
    return limit + (1 - limit) * Math.pow(1 - k, n);
  }

  // A network's wire rating: the base plus every unit's fixed contribution,
  // less whatever a geomagnetic storm is taking off every line.
  function _networkCap(netId) {
    let cap = _baseCap();
    for (const tier of PROTECTION_TIERS) cap += (tier.counts.get(netId) || 0) * tier.capPerUnit;
    return cap * (typeof WeatherEventSystem !== 'undefined' ? WeatherEventSystem.getLineMult() : 1);
  }

  function applyWireLoads() {
    // Re-count every protection tier standing on each network.
    // Iterate only the relevant type sets instead of the entire registry —
    // protectors/wires/poles are a small fraction of a city's entities
    // (trees, houses, pipes, etc. can never be any of these four types), so
    // this avoids a full O(all entities) scan per tier for state that only
    // ever lives on these specific types.
    //
    // A protector only does anything if it is standing on a network that has
    // conductors to raise. Dropped on open ground it floods into a component
    // of its OWN — a one-entity "network" with a perfectly valid networkId
    // and no wire in it — so a networkId >= 0 test alone happily counts ten
    // protectors that are each boosting nothing. That is invisible from the
    // outside: the player places a bank, no threshold moves, and there is no
    // error to read. So conductor-less units are excluded from the count and
    // flagged, and the flag is what the info panel and the advisory below
    // report.
    const _netHasConductor = new Set();
    for (const type of [T.WIRE, T.POLE, T.POWERTOWER]) {
      for (const e of EntityRegistry.getByType(type)) {
        if (e.networkId >= 0) _netHasConductor.add(e.networkId);
      }
    }
    let _strandedProtectors = 0;
    for (const tier of PROTECTION_TIERS) {
      tier.counts.clear();
      // A wire's rating is about THROUGHPUT, and nothing about whether supply
      // is meeting demand may move it. MK3 bays draw power, and they used to
      // drop out of the count whenever their network had no supply: the
      // rating collapsed from tens of MW to a bare few hundred kW, and any
      // line still live at that moment (an island with its own generators,
      // the first plant back after a blackout) tripped against it. A
      // shortfall turned into "Grid Overloaded". So a bay now counts whenever
      // it stands on a conductor; only damage takes it offline. (A short
      // network's wires carry nothing anyway, see step 5 of tick.)
      const needsPower = (EntityDefs[tier.type]?.powerInput || 0) > 0;
      for (const e of EntityRegistry.getByType(tier.type)) {  // already deduped by floodFill's seen-set
        const stranded = e.networkId < 0 || !_netHasConductor.has(e.networkId);
        e._noConductor  = stranded;
        e._unpoweredBay = !stranded && needsPower && !!e._lightningDamaged;
        if (stranded) { _strandedProtectors++; continue; }
        if (e._unpoweredBay) continue;
        tier.counts.set(e.networkId, (tier.counts.get(e.networkId) || 0) + 1);
      }
    }
    // Advisory, throttled the same way the overload one is: this is the single
    // most likely reason a player reports "I placed a bank and nothing
    // happened", and it costs them real money to not know.
    if (_strandedProtectors > 0) {
      const _now = Date.now();
      if (!_lastStrandedToast || _now - _lastStrandedToast > 30000) {
        _lastStrandedToast = _now;
        if (typeof showToast === 'function') {
          showToast(`\u26a0 ${_strandedProtectors} Surge Protector${_strandedProtectors > 1 ? 's are' : ' is'} not on a wire network \u2014 place them touching a wire or pole to do anything`,
                    '#ff8040', '#180a00', '#804020');
        }
      }
    }

    // Once per network rather than once per wire: the tier counts are final
    // by now, and a network's thousands of spans all share its rating.
    const _capOf = new Map();
    function _effectiveCap(netId) {
      let cap = _capOf.get(netId);
      if (cap === undefined) { cap = _networkCap(netId); _capOf.set(netId, cap); }
      return cap;
    }

    for (const e of EntityRegistry.getByType(T.PROTECTOR)) {
      if (e.col !== e._anchorCol) continue;
      e.load = networkDemand.get(e.networkId) || 0;
      e._effectiveThreshold = _effectiveCap(e.networkId);
    }
    for (const e of EntityRegistry.getByType(T.PROTECTOR2)) {
      e.load = networkDemand.get(e.networkId) || 0;
      e._effectiveThreshold = _effectiveCap(e.networkId);
    }
    // Wire/pole overload logic — identical for both types, so factored into
    // a shared function instead of duplicating the body or concatenating
    // both type-sets into one throwaway array just to share a single loop.
    const _applyLoad = (e) => {
      e.load = networkDemand.get(e.networkId) || 0;
      const effectiveThreshold = _effectiveCap(e.networkId);
      // A tripped span stays OPEN until the reset pass recloses it
      // (WIRE_RECLOSE_MS). It used to be re-judged here on the very next
      // tick -- but an open wire is cut off from the network, so it read
      // zero load, "healed", reconnected, overloaded and tripped again: a
      // 5Hz flap. Every flip changed the failed-wire signature, so the
      // component cache missed on every tick and floodFill rebuilt the whole
      // grid, thousands of one-wire islands at a time -- ~100ms a tick on a
      // 4k-wire city, which is what tanked the frame rate only while lines
      // were red. Held open, the signature is stable between recloses and
      // the cache hits again. Still drawn red and sparking while open.
      if (e.failed && e._failedAt) {
        e.overloaded = true;
        e._effectiveThreshold = effectiveThreshold;
        e.congestionFactor = 0;
        return;
      }
      // Storm or fire damage stays open until it is repaired — there is no
      // reclose for it. It used to fall through to the load test below, where
      // an open span (cut off, so zero load) read as healthy and had .failed
      // cleared: the wire went on sparking and reporting STORM DAMAGE while
      // quietly conducting again one tick after the fault.
      if (e._weatherFailed) {
        e.failed = true;
        e._wasOverloaded = false;
        e._effectiveThreshold = effectiveThreshold;
        e.congestionFactor = 0;
        return;
      }
      const stress = effectiveThreshold > 0 ? e.load / effectiveThreshold : 0;
      // Failure logic: green (stress ≤ 0.8) NEVER fails. Red (>1.0) always fails.
      // Yellow (0.8–1.0) has a small per-tick chance, ramping quadratically with stress.
      const settled = _loadGrace <= 0 && _topoSettle <= 0;
      let nowOverloaded = stress > 1.0 && settled;
      if (!nowOverloaded && settled && stress > 0.8 && !e._prevFailed) {
        const yellowProgress = (stress - 0.8) / 0.2;             // 0..1 across yellow band
        let failChance       = yellowProgress * yellowProgress * 0.005;  // up to 0.5%/tick at top of yellow
        // A recently serviced span fails less often. A drone sweep is thermal
        // imaging and insulator washing: it finds the hot joint and removes
        // the contamination that causes a flashover, so the odds of an
        // unexpected fault drop. It is deliberately applied ONLY here, inside
        // the yellow band -- see WIRE_SERVICE_SUPPRESS. Note this cannot
        // touch `stress > 1.0` above: a conductor past its rating is past its
        // rating, and no amount of washing changes what it can carry. That is
        // what keeps Surge Protectors the actual answer to a loaded grid.
        if (e._wireServiced) failChance *= WIRE_SERVICE_SUPPRESS;
        if (Math.random() < failChance) nowOverloaded = true;
      }
      if (nowOverloaded && !e._wasOverloaded) {
        const now = Date.now();
        e._failedAt = now;                         // for the reclose in the reset pass
        // What it tripped on, for the advisory: the load, the rating, and
        // whether that rating had just collapsed. A span whose rating fell to
        // under half what it carried while healthy has been cut off from the
        // protection it relied on (a broken line, a dark MK3 bay), which is a
        // different fault from a grid that has outgrown its bank.
        e._tripLoad = e.load;
        e._tripCap  = effectiveThreshold;
        e._tripCutOff = effectiveThreshold < (e._healthyCap || effectiveThreshold) * 0.5;
        if (!e._lastBurnout || now - e._lastBurnout > 3000) { SFX.burnout(); e._lastBurnout = now; }
      }
      // The rating it held while working normally (carrying power, not
      // tripped), for the cut-off test above. A dark network's spans carry
      // nothing and an unfed MK3 bay stops counting, so a blackout must not
      // overwrite it with that collapsed rating.
      if (!nowOverloaded && settled && e.load > 0) e._healthyCap = effectiveThreshold;
      e._wasOverloaded    = nowOverloaded;
      e.overloaded        = nowOverloaded;
      e.failed            = nowOverloaded;
      e._effectiveThreshold = effectiveThreshold;
      // Congestion factor: 0 at ≤80% load, ramps to 1.0 at 100% load
      e.congestionFactor = Math.max(0, Math.min(1, (stress - 0.8) / 0.2));
      if (stress > _peakStress) _peakStress = stress;
      // Any burnout counts too, not just the stress threshold: a wire in the
      // 0.8–1.0 band can fail on the random roll below REDLINE_STRESS, and
      // that is unambiguously the overload the player just watched happen.
      if (stress >= REDLINE_STRESS || nowOverloaded) _everRedlined = true;
    };
    for (const e of EntityRegistry.getByType(T.WIRE)) _applyLoad(e);
    for (const e of EntityRegistry.getByType(T.POLE)) _applyLoad(e);
  }

  // Step 2: finding each panel's shaders is O(n²) across all solar panels. Only
  // recompute when a SOLAR/SOLAR2 entity is placed/removed/moved (tracked
  // via EntityRegistry's solar version counter) instead of every tick.
  let _lastSolarVersion = -1;
  // ── Idle-when-full ──────────────────────────────────────────────
  // Share of its normal draw a producer keeps pulling while on standby.
  const IDLE_STANDBY_FRAC = 0.12;
  // True when a production building's output buffer is maxed out, so it
  // should stop drawing power; it resumes the moment anything is taken.
  // Read from the same fields/capacities each system caps its buffer at.
  // The pump jack's "full" (every tank/refinery it feeds is full) is only
  // known inside its own tick, so it flags itself (_backPressured).
  function _outputFull(e) {
    const d = EntityDefs[e.type];
    if (!d) return false;
    switch (e.type) {
      case T.CHEMICALPLANT:        return (e._acid      || 0) >= (d.acidCapacity      || 300);
      case T.FUELPLANT:            return (e._rods      || 0) >= (d.rodCapacity       || 150);
      case T.LITHIUMPROCESSPLANT:  return LithiumProcessPlantSystem.outputFull(e);   // stops at full, restarts at half
      case T.MOXPLANT:             return (e._mox       || 0) >= (d.moxCapacity       || 300);
      // Any one of its three outputs full stops the whole plant (tickPlant's _blockedBy).
      case T.REPROCESSOR:          return (e._hlw       || 0) >= (d.hlwCapacity       || 100)
                                       || (e._plutonium || 0) >= (d.plutoniumCapacity || 100)
                                       || (e._recovered || 0) >= (d.recoveredCapacity || 200);
      case T.ELECTROLYZER:         return (e._hydrogen  || 0) >= (d.hydrogenCapacity  || 300);
      case T.ATMOSCOLLECTOR:       return (e._nitrogen  || 0) >= (d.nitrogenCapacity  || 3000);
      case T.HABERBOSCH:           return (e._ammonia   || 0) >= (d.ammoniaCapacity   || 3000);
      case T.WASHTOWER:            return (e._deuterium || 0) >= (d.deuteriumCapacity || 1000);
      // Both lines of the split: D-T full, and the D-He3 line either closed
      // (separator not unlocked, or a legacy D-He3 plant) or full too.
      case T.FUSIONFUELPLANT:      return (e._plasma    || 0) >= (d.plasmaCapacity    || 400)
                                       && (!e._he3LineOpen || (e._he3Pellets || 0) >= (d.he3PelletCapacity || 200));
      // Only once the magnets are up — the startup surge still has to be paid.
      // And only on D-He3: D-T steam isn't buffered, so it never backs up.
      case T.HULKINGFUSIONREACTOR: return !!e._started && e._fuelMode === 'dhe3' && (e._highBeta || 0) >= (d.highBetaCapacity || 1000);
      case T.ADVFUSIONREACTOR:     return !!e._started && (e._highBeta || 0) >= (d.highBetaCapacity || 1000);
      case T.HE3SEPARATOR:         return (e._he3      || 0) >= (d.he3Capacity       || 300);
      case T.TRITIUMBREEDER:       return (e._tritium  || 0) >= (d.tritiumCapacity   || 300);
      case T.COALMINE:
      case T.COALMINE2:            return (e._coalBuffer     || 0) >= MINE_BUFFER_CAP;
      case T.LITHIUMMINE:          return (e._lithiumStored  || 0) >= MINE_BUFFER_CAP;
      case T.URANIUMMINE:          return (e._uraniumStored  || 0) >= MINE_BUFFER_CAP;
      case T.RAREEARTHMINE:        return (e._rareEarthStored || 0) >= MINE_BUFFER_CAP;
      // Oxide or tailings full stops the plant (LeachPlantSystem's _blockedBy).
      case T.LEACHPLANT:           return LeachPlantSystem.outputFull(e);
      case T.SCMILL:               return (e._tape     || 0) >= (d.tapeCapacity      || 300);
      // Coke store full stops the battery; a full gas buffer only flares.
      case T.COKEOVEN:             return CokeOvenSystem.outputFull(e);
      case T.GRAPHITEFURNACE:      return GraphiteFurnaceSystem.outputFull(e);
      // The Core Works sets its own draw (_activePowerInput): idle or charging.
      case T.SULFURMINE2:
      case T.SULFURMINE:           return (e._sulfurStored   || 0) >= MINE_BUFFER_CAP;
      case T.HELIUMWELL2:
      case T.HELIUMWELL:           return (e._helium   || 0) >= (d.heliumCapacity    || 1000);
      // The Cryo Plant is deliberately absent: a full liquid buffer doesn't
      // mean the refrigeration can stop — it's what holds the magnets cold.
      // Fuel oil tank full, or the sludge buffer full (it can't refine either way).
      // The tank runs on a level controller with a deadband, like a real one:
      // it stops at full and doesn't restart until the level falls below
      // REFINERY_RESUME_FRAC. Without that, every sip a generator took dropped
      // it to 99.9%, it refined one tick back to full, and the plate, power
      // draw and flow all flickered FULL / RUNNING every tick. Latched here
      // (refineryFuelFull, resource_helpers.js — tickRefinery reads it too.)
      case T.REFINERY:             return refineryFuelFull(e) || (e._sludgeWaste || 0) >= 100;
      case T.GASSTATION:           return (e._fuelStored || 0) >= (d.storageCapacity || 400);
      case T.PUMPJACK:
      case T.PUMPJACK2:            return !!e._backPressured;
    }
    return false;
  }

  // ── Grid-link notifications ─────────────────────────────────────
  // A building "leaves the grid" when the network it sits on goes from
  // containing a generator to containing none — a wire removed or burnt out,
  // a pole knocked down, the last generator demolished. That's different
  // from a brownout (generators present, just not enough), which the grid
  // panel already reports, and from night (solar still counts as a
  // generator), so neither triggers it. Checked once a second rather than
  // every tick: it costs an extra pass over each network's members.
  const GRID_CHECK_MS = 1000;
  let _lastGridCheck = 0;
  function _gridCheckDue() {
    const now = performance.now();
    if (now - _lastGridCheck < GRID_CHECK_MS) return false;
    _lastGridCheck = now;
    return true;
  }
  // Anything built to generate, judged from its type rather than this
  // tick's output, so a coal plant waiting on coal or a solar farm at night
  // still counts as the grid being there.
  function _isGridSource(e) {
    const d = EntityDefs[e.type];
    return !!d && (d.powerOutput > 0 || d.peakOutput > 0 || d.baseOutput > 0);
  }
  // Buildings that draw power are the ones worth telling the player about.
  function _tracksGridLink(e) {
    const d = EntityDefs[e.type];
    return !!d && d.powerInput > 0 && !_isGridSource(e);
  }
  function _gridLabel(e) {
    let label = e.businessName || EntityDefs[e.type]?.label || 'Building';
    if (e._num !== undefined && typeof NUMBERED_ENTITY_TYPES !== 'undefined' && NUMBERED_ENTITY_TYPES.has(e.type)) label += ` #${e._num}`;
    return label;
  }
  // Every building currently cut off, tracked persistently (not just the
  // ones that transitioned this check) so the summary card can be kept in
  // sync as buildings reconnect — a one-shot push() per transition batch
  // had no way to know later that the outage it reported was over, so a
  // grouped "N buildings cut off" card (which was never even given a tag)
  // sat on screen forever once raised, even after every building in it
  // came back online.
  const _offGridSet = new Set();

  // ── Stranded generators ──
  // Generators producing on a network that has nothing to use the power —
  // a turbine hall or wind farm that was never wired to the city. Easy to
  // miss, because the overview's generation total still counts it. Flagged
  // once a network has sat like that for STRANDED_SECS of play.
  const STRANDED_SECS = 300;
  let _strandedNets = [];
  let _strandedShownCount = 0;
  function _syncStrandedGenNotification() {
    const nets = _strandedNets; _strandedNets = [];
    if (typeof NotificationStack === 'undefined') return;
    const long = nets.filter(n => n.gens.some(g => (g._strandedFor || 0) >= STRANDED_SECS));
    const gens = long.flatMap(n => n.gens);
    if (!gens.length) {
      if (NotificationStack.hasTag('stranded-gen')) NotificationStack.dismissTag('stranded-gen');
      _strandedShownCount = 0;
      return;
    }
    const watts = Math.round(long.reduce((a, n) => a + n.w, 0));
    const first = gens[0];
    const label = (first.def?.label || EntityDefs[first.type]?.label || 'Generator') + (first._num !== undefined ? ` #${first._num}` : '');
    const title = gens.length === 1 ? 'Generator powering nothing' : `${gens.length} generators powering nothing`;
    const message = `${label}${gens.length > 1 ? ` and ${gens.length - 1} more are` : ' is'} producing ${formatPower(watts)} on a network with nothing connected to use it. Wire ${gens.length > 1 ? 'them' : 'it'} into your grid. Click to jump there`;
    // Re-raise only when MORE generators become stranded than last shown, so
    // dismissing the card isn't undone every second.
    if (!NotificationStack.updateTag('stranded-gen', { title, message }) && gens.length > _strandedShownCount) {
      NotificationStack.push({
        icon: '🔌', title, message, color: '#ffc040', border: '#705010', tag: 'stranded-gen',
        onClick: () => Camera.recentreOn((first.col + (first.width || 1) / 2) * TILE, (first.row + (first.height || 1) / 2) * TILE),
      });
    }
    _strandedShownCount = Math.max(_strandedShownCount, gens.length);
  }

  // ── Backup-power warnings ──
  // A network short on generation quietly draws on its substations until
  // they run dry, then the whole network browns out. Warn well before that:
  // once the reserve falls to 20%, and also as soon as the substations are
  // releasing near their maximum rate — then any more demand (the evening
  // peak) is more than they can cover, and the grid goes dark with charge
  // still in them.
  let _backupNets = [];
  let _backupLowShown = false, _backupLimitShown = false;
  const BACKUP_LOW_PCT = 0.20, BACKUP_LIMIT_FRAC = 0.5;
  function _syncBackupNotification() {
    const nets = _backupNets; _backupNets = [];
    if (typeof NotificationStack === 'undefined') return;
    const draining = nets.filter(n => n.rel > 0.5);
    const jump = (n) => () => Camera.recentreOn((n.anchor.col + (n.anchor.width || 1) / 2) * TILE, (n.anchor.row + (n.anchor.height || 1) / 2) * TILE);
    // 1) reserve low
    const low = draining.map(n => ({ n, pct: n.ch / n.cap })).filter(o => o.pct <= BACKUP_LOW_PCT).sort((a, b) => a.pct - b.pct)[0];
    if (low) {
      const n = low.n;
      const secs = n.ch * n.dscale / Math.max(1, n.rel);
      const hrs = secs / (typeof DayNight !== 'undefined' && DayNight.secondsPerGameHour ? DayNight.secondsPerGameHour() : 50);
      const title = `Backup power at ${Math.round(low.pct * 100)}%`;
      const message = `Your grid is ${formatPower(Math.round(n.deficit))} short and living on substation reserves; about ${hrs < 1 ? 'under an hour' : Math.round(hrs) + ' in-game hour' + (Math.round(hrs) === 1 ? '' : 's')} left before it blacks out. Add generation or connect idle plants. Click to jump there`;
      if (!NotificationStack.updateTag('backup-low', { title, message }) && !_backupLowShown) {
        NotificationStack.push({ icon: '🔋', title, message, color: '#ff8040', border: '#703010', tag: 'backup-low', onClick: jump(n), glow: true });
      }
      _backupLowShown = true;
    } else {
      if (NotificationStack.hasTag('backup-low')) NotificationStack.dismissTag('backup-low');
      _backupLowShown = false;
    }
    // 2) releasing near the substations' maximum rate
    const hot = draining.filter(n => n.maxOut > 0 && n.rel >= n.maxOut * BACKUP_LIMIT_FRAC).sort((a, b) => b.rel / b.maxOut - a.rel / a.maxOut)[0];
    if (hot && !low) {
      const title = 'Running on backup power';
      const message = `Generation is ${formatPower(Math.round(hot.deficit))} short, so substations are releasing ${formatPower(Math.round(hot.rel))} of their ${formatPower(Math.round(hot.maxOut))} maximum. If demand climbs past what they can release (the evening peak), the grid goes dark. Add generation. Click to jump there`;
      if (!NotificationStack.updateTag('backup-limit', { title, message }) && !_backupLimitShown) {
        NotificationStack.push({ icon: '⚡', title, message, color: '#ffc040', border: '#705010', tag: 'backup-limit', onClick: jump(hot) });
      }
      _backupLimitShown = true;
    } else {
      if (NotificationStack.hasTag('backup-limit')) NotificationStack.dismissTag('backup-limit');
      _backupLimitShown = false;
    }
  }
  const _CUTOFF_TAG = 'grid-cutoff-summary';
  function _syncCutOffNotification() {
    if (typeof NotificationStack === 'undefined') return;
    if (_offGridSet.size === 0) { NotificationStack.dismissTag(_CUTOFF_TAG); return; }
    const list  = [..._offGridSet];
    const first = list[0];
    const title = list.length === 1 ? 'Building cut off from the grid' : `${list.length} buildings cut off from the grid`;
    const message = list.length === 1
      ? `${_gridLabel(first)} is no longer connected to any network; click to jump there`
      : `${_gridLabel(first)} and ${list.length - 1} more lost their connection to any network; click to jump there`;
    if (!NotificationStack.updateTag(_CUTOFF_TAG, { title, message })) {
      // Jump to a building that is STILL cut off when clicked — the card
      // outlives the building it was first raised for.
      const jump = () => {
        const tgt = _offGridSet.values().next().value || first;
        Camera.recentreOn((tgt.col + (tgt.width || 1) * 0.5) * TILE, (tgt.row + (tgt.height || 1) * 0.5) * TILE);
      };
      NotificationStack.push({
        icon: '🔌', title, message,
        color: '#ff8040', border: '#703010', tag: _CUTOFF_TAG, onClick: jump, glow: list.length >= 5,
      });
    }
  }

  // Every panel needs its own powerOutput: with the shared EntityDefs entry,
  // each one overwrote the last, so every MK1 (and every MK2) reported
  // whichever panel was computed last, and shading, wear and smog never
  // landed per panel. Object.create rather than a copy, so everything else
  // (peakOutput, and the upkeep difficulty.js rescales) still reads through
  // to the shared def live.
  function _ownSolarDef(e) {
    if (e.def === EntityDefs[e.type]) e.def = Object.create(EntityDefs[e.type]);
  }

  // Row shading. The sun is to the south (down the map), so a panel is only
  // shaded by panels on its south side that share some of its columns —
  // side-by-side panels never shade each other, and rows with enough of a
  // gap between them never do either. The shadow reaches farther the lower
  // the sun: longest at dawn and dusk and in winter, shortest at a summer
  // noon. Shading only costs direct sun; diffuse light still gets through,
  // so a fully shaded panel keeps 1 - SHADE_MAX_LOSS of its output.
  const SHADE_MAX_LOSS   = 0.35;
  const SHADE_MIN_REACH  = 0.5;   // tiles of shadow north of a panel with the sun at its highest
  const SHADE_EXTRA_REACH = 2.5;  // more tiles of shadow as the sun drops to the horizon
  const SHADE_MAX_GAP = SHADE_MIN_REACH + SHADE_EXTRA_REACH;   // a row farther than this never shades

  // 0 with the sun at its highest (a summer noon) up to 1 at the horizon.
  function _lowSun() {
    const dayLow = Math.min(1, Math.abs(DayNight.hour() - 12.3) / 6);
    // Seasons off sits halfway: the year-round sun of a spring or autumn noon.
    const seasonLow = typeof Seasons !== 'undefined' && Seasons.enabled() ? (1 - Seasons.warmth()) / 2 : 0.5;
    return 1 - (1 - dayLow) * (1 - 0.5 * seasonLow);
  }

  // Southern neighbours that can ever shade e, as [share of e's columns
  // covered, empty rows between them]. Geometry only, so it's cached until a
  // panel is placed or removed; the sun-dependent part is _shadeFactor.
  function _findShaders(e, panels) {
    const w = e.width || 1, h = e.height || 1, out = [];
    for (const o of panels) {
      if (o === e) continue;
      const gap = o.row - (e.row + h);
      if (gap < 0 || gap >= SHADE_MAX_GAP) continue;
      const overlap = Math.min(e.col + w, o.col + (o.width || 1)) - Math.max(e.col, o.col);
      if (overlap > 0) out.push([overlap / w, gap]);
    }
    return out;
  }

  function _shadeFactor(e, reach) {
    const h = e.height || 1;
    let shaded = 0;
    for (const [share, gap] of e._shaders || []) shaded += share * Math.min(1, Math.max(0, (reach - gap) / h));
    return 1 - SHADE_MAX_LOSS * Math.min(1, shaded);
  }

  // ── Dust on the panels ────────────────────────────────────────────
  // A dust storm (weather_events.js 'dust') leaves a film on every panel
  // that costs output until something takes it off: rain washes it (a
  // downpour fast, a shower slowly), it blows clear on its own over most of
  // an in-game day, and a Solar Array's wash robots strip their own while
  // they run, storm or no storm. `e.dust` is 0..1 and saved with the panel.
  // Wildfire smoke ('smoke') drops ash into the same film, about a third as
  // fast, and it comes off the same ways.
  const DUST_SETTLE = 0.0035;   // per second while a dust storm blows (a full storm leaves ~0.6-1)
  const ASH_SETTLE  = 0.0011;   // per second under wildfire smoke (a full event leaves ~0.3-0.65)
  const DUST_CLEAR  = 0.0004;   // per second blowing clear on its own
  const DUST_WASH   = { rainfall: 0.005, rainstorm: 0.012, snowfall: 0.002, blizzard: 0.004, storm: 0.002 };
  const DUST_ROBOTS = 0.008;    // per second off a Solar Array while its robots run
  const DUST_LOSS   = 0.4;      // share of output a fully dusted panel loses
  // Timed off the game clock per panel (rates are per game second), so it
  // runs true at any sim speed however often the network happens to tick.
  function _dustFactor(e, washing) {
    const now = DayNight.getElapsed();
    let dt = e._dustT === undefined ? 0 : now - e._dustT;
    e._dustT = now;
    if (dt < 0 || dt > 30) dt = 0;   // a load or a clock jump, not elapsed time
    const type = typeof WeatherEventSystem !== 'undefined' ? (WeatherEventSystem.getActiveEvent() || {}).type : null;
    let d = e.dust || 0;
    const settle = type === 'dust' ? DUST_SETTLE : type === 'smoke' ? ASH_SETTLE : 0;
    d += settle * dt;
    d -= ((settle ? 0 : DUST_CLEAR + (DUST_WASH[type] || 0)) + (washing ? DUST_ROBOTS : 0)) * dt;
    e.dust = Math.max(0, Math.min(1, d));
    return (e.dustFactor = 1 - DUST_LOSS * e.dust);
  }

  function _applySolarOutput(e, sunlight, cloudFactor, reach) {
    _ownSolarDef(e);
    const shadeFactor = _shadeFactor(e, reach);
    // Wear degrades output (very slowly — 1% per real hour → 0.1% per game min)
    e.wear = Math.min(1, (e.wear || 0) + 0.000008);  // ~35 hours to reach 30% degradation
    const wearFactor = 1 - e.wear * 0.4;    // max 40% degradation at full wear
    e.shadeFactor   = shadeFactor;
    e.wearFactor     = wearFactor;
    const _solarWMult = typeof WeatherEventSystem !== 'undefined' ? WeatherEventSystem.getSolarMult() : 1;
    // Smog overhead blocks sunlight (pollution_system.js).
    e.smogFactor = typeof PollutionSystem !== 'undefined' ? PollutionSystem.solarFactor(e) : 1;
    const dustFactor = _dustFactor(e, false);
    e.def.powerOutput = e.def.peakOutput * sunlight * cloudFactor * shadeFactor * wearFactor * _solarWMult * e.smogFactor * dustFactor;
  }

  // Solar Array. Unlike the MK1/MK2 it:
  //   • tracks the sun, so the dawn and dusk ramps climb much faster
  //     (sunlight^trackingExp instead of sunlight);
  //   • takes no row-shading penalty — its trackers are built to be tiled into farms;
  //   • has wash robots that strip wear off while the array can feed them,
  //     paid for out of its own output;
  //   • banks part of the midday harvest as molten-salt heat and spends it
  //     topping the array back up to saltRate once the sun can't, which is
  //     what carries it a few hours past sunset.
  // Time steps off the game clock (hours), so it's right at any sim speed.
  function _applySolar3Output(e, sunlight, cloudFactor) {
    _ownSolarDef(e);
    const d   = e.def;
    const hr  = DayNight.hour();
    let   dh  = e._saltLastHour == null ? 0 : hr - e._saltLastHour;
    if (dh < 0) dh += 24;
    if (dh > 0.25) dh = 0;         // a load or a clock jump, not elapsed time
    e._saltLastHour = hr;

    const _solarWMult = typeof WeatherEventSystem !== 'undefined' ? WeatherEventSystem.getSolarMult() : 1;
    e.smogFactor = typeof PollutionSystem !== 'undefined' ? PollutionSystem.solarFactor(e) : 1;
    e.trackingGain = sunlight > 0 ? Math.pow(sunlight, d.trackingExp) / sunlight : 1;
    e.shadeFactor = 1;
    const wearFactor = 1 - (e.wear || 0) * 0.4;
    e.wearFactor = wearFactor;
    // Dust: its wash robots (running last tick) take theirs off.
    const dustFactor = _dustFactor(e, !!e._washing);
    const raw = d.peakOutput * Math.pow(sunlight, d.trackingExp) * cloudFactor * wearFactor * _solarWMult * e.smogFactor * dustFactor;

    let salt = e._saltKWh || 0;
    salt = Math.max(0, salt - salt * d.saltLeak * dh);
    let out = raw, flow = 0;       // flow: + into the tank, − out of it (kW)
    if (raw > d.saltRate && salt < d.saltCapacity) {
      const room = dh > 0 ? (d.saltCapacity - salt) / (dh * d.saltEff) : Infinity;
      flow = Math.min(raw * d.saltDivert, raw - d.saltRate, room);
      salt += flow * d.saltEff * dh;
      out  -= flow;
    } else if (raw < d.saltRate && salt > 0) {
      // Full rate down to the last quarter of the tank, then tapering, so
      // the evening tail fades out instead of dropping off a cliff.
      const taper = Math.min(1, salt / (d.saltCapacity * 0.25));
      const give  = Math.min((d.saltRate - raw) * taper, dh > 0 ? salt / dh : d.saltRate);
      flow  = -give;
      salt -= give * dh;
      out  += give;
    }
    e._saltKWh  = Math.min(d.saltCapacity, salt);
    e._saltFlow = flow;

    // Wash robots run on the array's own output. While they run, wear comes
    // off; parked (dead of night, tank empty) it builds like any panel's.
    e._washing = out >= d.washerDraw;
    if (e._washing) {
      out -= d.washerDraw;
      e.wear = Math.max(0, (e.wear || 0) - 0.00004);
    } else {
      e.wear = Math.min(1, (e.wear || 0) + 0.000008);
    }
    d.powerOutput = Math.max(0, out);
  }

  // Properties touching each other share power (see the BFS exception
  // above), so a building with no wire of its own can be running off its
  // neighbour. Returns the touching powered properties it is fed through,
  // or [] when it has its own wire (or isn't a property at all).
  function powerVia(e) {
    if (!isProperty(e)) return [];
    const out = new Set();
    for (const n of GridManager.getNeighbours(e.col, e.row)) {
      const ne = n.entity;
      if (!ne || ne === e) continue;
      if (ne.type === T.WIRE || pipeOnWire(ne) || conveyorOnWire(ne)) return [];
      if (isProperty(ne) && ne.powered) out.add(ne);
    }
    return [...out];
  }

  return {
    stats: networkStats,
    powerVia,
    get MAX_WIRE_HOPS() { return MAX_WIRE_HOPS; },
    getNetworkDemand(netId) { return networkDemand.get(netId) || 0; },
    getNetworkHeadroom(netId) { return networkHeadroom.get(netId) || null; },
    recomputeWireHops: forceRecomputeWireHops,
    // Escape hatch: drop the cached network components. The cache keys off
    // topology, wire-failure signature, and dead-relay signature; hops
    // recompute also clears it when outOfRange may have changed. Use this
    // if something mutates conduction without going through those paths.
    invalidateComponents,
    updatePipeConnectivity,
    setWireHops(v) { MAX_WIRE_HOPS = v; },
    isRangeAnchor,
    getWireHops()  { return MAX_WIRE_HOPS; },
    setDragBatching,
    isDragBatching() { return _dragBatching; },
    // Has any wire/pole run at 90%+ of its network cap this session?
    everRedlined() { return _everRedlined; },
    // 0..1 progress toward that redline, for unlock bars.
    redlineProgress() { return Math.min(1, _peakStress / REDLINE_STRESS); },

    // Multiplier applied to a wire's storm fault chance, from the surge
    // protection standing on its network. 1 = unprotected.
    faultResistance(netId) {
      if (netId === undefined || netId < 0) return 1;
      let r = 1;
      for (const tier of PROTECTION_TIERS) {
        const n = tier.counts.get(netId) || 0;
        if (n > 0) r *= _tierCurve(tier.resistFloor, tier.resistK, n);
      }
      return r;
    },

    // Everything the info panel needs about one tier on one network, so the
    // readout never has to re-derive the curve (or rescan the grid counting
    // units) and can't drift from the math above. `nextCapGain` /
    // `nextResistGain` are what a player actually wants to know before
    // spending: what the NEXT unit buys (a fixed amount of capacity, and a
    // shrinking cut in storm faults).
    protectionInfo(netId, tierKey) {
      const tier = PROTECTION_TIERS.find(t => t.key === tierKey);
      if (!tier) return null;
      const base = _baseCap();
      const n    = (netId === undefined || netId < 0) ? 0 : (tier.counts.get(netId) || 0);
      const cap  = (k) => base + k * tier.capPerUnit;
      const res  = (k) => _tierCurve(tier.resistFloor, tier.resistK, k);
      return {
        count:          n,
        label:          tier.label,
        // This tier's own contribution, isolated from the others, so the
        // panel can say what THIS bank is doing. `networkCap` below is the
        // combined figure that actually governs the wires.
        tierCap:        cap(n),
        capPerUnit:     tier.capPerUnit,
        nextCapGain:    tier.capPerUnit,
        tierResist:     res(n),
        resistFloor:    tier.resistFloor,
        nextResistGain: res(n) - res(n + 1),
        networkCap:     _networkCap(netId),
        // Capacity never saturates, so there is no ceiling to warn about.
        atCeiling:      false,
      };
    },
    // Persisted with the save: without this a reload forgets that the player
    // ever redlined, so anything gated on it (Surge Protector unlock, the
    // Running Hot tutorial) would wait for them to do it all over again.
    // Called by SaveSystem once a save has been applied; see _loadGrace.
    beginLoadGrace() {
      _loadGrace = LOAD_GRACE_TICKS;
      for (const e of EntityRegistry.all()) {
        if (e.type === T.WIRE || e.type === T.POLE) { e.failed = false; e._prevFailed = false; e._wasOverloaded = false; e._failedAt = 0; }
      }
    },

    // True for the few seconds after a save is applied (see _loadGrace).
    inLoadGrace() { return _loadGrace > 0; },

    loadRedlined(v) {
      if (!v) return;
      _everRedlined = true;
      _peakStress   = Math.max(_peakStress, REDLINE_STRESS);
    },

    tick(dt = 0.1) {
      if (_loadGrace > 0) _loadGrace--;
      const _tv = EntityRegistry.getTopologyVersion();
      const _topoChanged = _tv !== _settleTopoVer;
      if (_topoChanged) { _settleTopoVer = _tv; _topoSettle = TOPO_SETTLE_TICKS; }
      else if (_topoSettle > 0) _topoSettle--;
      // 0. Compute wire hop out-of-range flags — skipped when nothing about
      // the grid has changed since the last computation (see
      // ensureWireHopsFresh's comment above).
      ensureWireHopsFresh();

      // Store last-tick failed state BEFORE reset, so floodFill this tick
      // can exclude wires that were overloaded last tick. This is the
      // standard deferred-failure pattern: overload is detected one tick,
      // the wire opens next tick. Avoids the chicken-and-egg where we need
      // connectivity to know load but need load to know connectivity.
      //
      // Folded into one pass over EntityRegistry.all() instead of two (a
      // capture pass building a `_prevFailed` Set, then a separate reset
      // pass, then a third pass restoring `.failed` for whatever ended up
      // in that Set) — each entity's old `.failed` value is read once and
      // written straight to its final post-reset value, so the Set and its
      // dedicated restore pass aren't needed at all.
      const _phT0 = performance.now();
      // Signature of which wires/poles are open-circuit. floodFill's only
      // dynamic input (everything else it reads is grid topology), so this
      // plus the topology version is enough to know whether last tick's
      // components are still valid — see _getComponents below. Accumulated
      // here because this pass already reads every entity's .failed.
      let _failSig = 0, _failCount = 0;
      const _nowMs = Date.now();
      for (const e of EntityRegistry.active()) {
        // Reclose: a tripped span retries after WIRE_RECLOSE_MS. While open it
        // is judged against the island it cut off — which has none of the main
        // network's Surge Protectors and so only the bare 85 kW cap — so a random
        // amber-band trip used to latch a branch dead for good. Reclosing lets
        // the span rejoin and be re-tested against the whole network's load and
        // cap; if that really is over, it trips again on this tick's load pass.
        // Any change to the wiring recloses everything at once: a span that
        // tripped on an island (say, one cut off with its own generator) is
        // re-judged on the network it's part of now — reattach the cut wire
        // and the line comes straight back, rather than after the timer. If
        // it really is over, it trips again once the settle window is up.
        // (Storm/fire damage never recloses: it waits for a repair.)
        const failed = e.failed, type = e.type;
        const reclose = failed && e._failedAt && !e._weatherFailed && ((_nowMs - e._failedAt) > WIRE_RECLOSE_MS || _topoChanged);
        if (reclose) { e._failedAt = 0; e._wasOverloaded = false; }
        const wasFailed = (type === T.WIRE || type === T.POLE) && failed && !reclose;
        if (wasFailed) { _failCount++; _failSig = (_failSig * 31 + (e.row * COLS + e.col)) | 0; }
        e._prevFailed = reclose ? false : failed;  // keep on entity for floodFill
        e.powered    = false;
        if (e._constructing) e._sitePowered = false;
        e.load       = 0;
        e.overloaded = false;
        // Wires/poles that were overloaded last tick stay failed (open
        // circuit) until load drops below threshold; everything else
        // resets to not-failed.
        e.failed     = wasFailed;
        e.networkId  = -1;
      }
      PerfMonitor.record('PN: reset pass', performance.now() - _phT0);

      // 1c. Wire loads assigned after component loop — see applyWireLoads() below.

      // 1b. Update dynamic power outputs
      const sunlight = Math.max(0, 1 - DayNight.darkness());
      CloudState.tick(dt);
      WindState.tick(dt);
      const cloudFactor = CloudState.factor;

      // Row shading — which panels sit in each other's shadow path is only
      // recomputed when solar panels are placed/removed/moved (Step 2); how
      // far the shadows reach follows the sun every tick.
      const solarSet  = EntityRegistry.getByType(T.SOLAR);
      const solar2Set = EntityRegistry.getByType(T.SOLAR2);
      const _solarVer = EntityRegistry.getSolarVersion();
      if (_solarVer !== _lastSolarVersion) {
        const solarEntities = [...solarSet, ...solar2Set];
        for (const e of solarEntities) e._shaders = _findShaders(e, solarEntities);
        _lastSolarVersion = _solarVer;
      }
      const shadeReach = SHADE_MIN_REACH + SHADE_EXTRA_REACH * _lowSun();
      for (const e of solarSet)  _applySolarOutput(e, sunlight, cloudFactor, shadeReach);
      for (const e of solar2Set) _applySolarOutput(e, sunlight, cloudFactor, shadeReach);
      for (const e of EntityRegistry.getByType(T.SOLAR3)) _applySolar3Output(e, sunlight, cloudFactor);

      // Each turbine gets its own def: terrain gives every site its own
      // multiplier (terrain_system.js), and a def shared across the type
      // would hand every turbine the last one's output. Blade ice from
      // freezing fog (TurbineIcing) cuts it, or stops the turbine.
      for (const t of [T.WIND, T.WIND2, T.WIND3])
        for (const e of EntityRegistry.getByType(t)) {
          if (e.def === EntityDefs[t]) e.def = { ...EntityDefs[t] };
          e._terrainWind = TerrainSystem.windMult(e);
          e.def.powerOutput = (e.def.baseOutput * WindState.lull + (e.def.maxOutput - e.def.baseOutput) * WindState.speed) * e._terrainWind
                            * TurbineIcing.outputMult(e);
        }


      // 2. Connected components — served from _getComponents' cache when
      // topology, wire-failure state, and dead-relay state are unchanged.
      let   netId    = 0;
      let   totGen   = 0;
      networkHeadroom.clear();
      // Storage (Substations + Battery Blocks) across every network, for the
      // GRID panel: what it is putting in and taking out right now, what it
      // holds in nameplate kWh, and how long that lasts at the current draw.
      let   stOut = 0, stIn = 0, stKWh = 0, stCapKWh = 0, stMaxOut = 0, stDrain = 0, stUnits = 0;
      let   totCon   = 0;
      let   powered  = 0;
      let   conTotal = 0;
      // What each network's supply is actually made of, recorded at the exact
      // points supply is summed below, so the GRID panel's breakdown adds up
      // to totalGenerated by construction. The panel used to rebuild this
      // from its own hand-kept generator list, which missed hydro turbines,
      // storage discharge, rod surges and networks with no wire or pole —
      // the total and the breakdown could differ by hundreds of watts.
      const genSources = [];   // [{ netId, supply, sources: Map<key, {w, count}> }]
      const _checkGrid = _gridCheckDue();
      // Consumption counterpart, keyed by entity type and recorded where each
      // load is added to `demand`, so the GRID panel's per-network consumption
      // adds up to totalConsumed the same way generation does.
      const conSources = [];   // [{ netId, demand, sources: Map<type, {w, count}> }]

      // Governors are never seeds (below): one only joins a network by being
      // swept in from the generator or wire it touches, so one touching
      // neither must read as unpowered rather than keep last tick's state.
      for (const g of EntityRegistry.getByType(T.GOVERNOR)) { g.powered = false; g.networkId = -1; }

      const _phT1 = performance.now();
      const { sig: _relaySig, n: _relayCount } = _deadRelaySignature();
      const _components = _getComponents(_failSig, _failCount, _relaySig, _relayCount);
      PerfMonitor.record('PN: components', _components.length);
      for (const component of _components) {

          // 3. Sum supply and demand; dynamic curves applied to consumers
          const currentHour = DayNight.hour();
          let supply = 0;
          let demand = 0;
          const _split = _pnSplit(component);
          const _wires = _split.wires, _rest = _split.rest;

          // Coal generator (and fuel generator) have powerInput: 0 (no
          // control-power draw), so an isolated generator with no wire
          // touching it forms its own single-entity component with demand=0
          // — and since its own output counted as that component's supply,
          // supply>=demand was trivially true regardless of any actual grid
          // connection. Require an actual wire (or pole) present in the
          // component before the generator's output counts at all, so it
          // truly needs to be wired in — not just self-sufficient — to run.
          const _hasWire = _split.hasWire;

          // 3b/3c setup — substations and worst wire congestion are both
          // structural properties of the component (independent of this
          // tick's supply/demand totals being computed alongside), so they're
          // collected here as a side effect of the single full pass below
          // instead of two additional dedicated full-component passes
          // (a .filter() + a .reduce()) further down.
          const substations = [];
          let _autoSwitches = null;   // Circuit Switch MK2s, for automatic load shedding (step 3d)
          let worstCongestion = 0;
          let _gridSrc = false;   // any working generator in this component (see _isGridSource)
          let _srcs = null;   // lazily created — most components generate nothing
          let _cons = null;
          let _consEntities = null;   // per-building detail for the consumption breakdown's drill-down
          const _addSrc = (key, w) => {
            if (!_srcs) _srcs = new Map();
            const r = _srcs.get(key);
            if (r) { r.w += w; r.count++; } else _srcs.set(key, { w, count: 1 });
          };

          // Wires/poles are pure conductors — both powerOutput and powerInput
          // are always exactly 0 in their entity defs (see entity_defs.js),
          // so the demand-curve lookup, per-type noise randomisation, and
          // weather-multiplier below would all compute a 0 contribution to
          // `demand` no matter what values they produce. All a conductor
          // gets is its network id, its congestion read and its (always-0)
          // demand, in one pass of its own — they are typically the large
          // majority of a component's members, since a built-up city's wire
          // count usually dwarfs every other entity type combined.
          for (let _ci = 0; _ci < _wires.length; _ci++) {
            const e = _wires[_ci];
            e.networkId = netId;
            e.charging  = false;
            // A lightning-struck span is dead weight: no congestion either.
            if (!e._lightningDamaged) {
              const cf = e.congestionFactor || 0;
              if (cf > worstCongestion) worstCongestion = cf;
            }
            e._liveDemand = 0;
          }
          for (let _ci = 0; _ci < _rest.length; _ci++) {
            _rest[_ci].networkId = netId;
            _rest[_ci].charging  = false;
          }

          _rest.forEach(e => {
            // Lightning-struck buildings are dead weight on the network:
            // no draw, no output, until repaired. Bailing here (rather
            // than zeroing powerOutput/powerInput downstream) also keeps
            // them out of the demand-curve and noise work entirely.
            if (e._lightningDamaged) { e._liveDemand = 0; return; }
            const ty = e.type;   // read once: entities come in hundreds of shapes, so every e.type is a slow lookup
            // A customer still being built draws only its construction load
            // (construction_system.js) — none of its own demand curve yet.
            // Whether the site has grid power goes in e._sitePowered (step 4),
            // which sets how fast the crew builds; e.powered stays false.
            if (e._constructing) {
              const _site = (typeof CircuitSwitchSystem !== 'undefined' && CircuitSwitchSystem.isShed(e)) ? 0 : ConstructionSystem.drawW(e);
              e._liveDemand = _site;
              demand += _site;
              if (_site > 0) {
                if (!_cons) _cons = new Map();
                const _cr = _cons.get(ty);
                if (_cr) { _cr.w += _site; _cr.count++; } else _cons.set(ty, { w: _site, count: 1 });
                if (!_consEntities) _consEntities = [];
                _consEntities.push(e);
              }
              return;
            }
            if (!_gridSrc && _isGridSource(e)) _gridSrc = true;
            // Storage knocked offline by lightning is out of the charge/
            // discharge loop until it is repaired. Without this a struck bank
            // refills from the next surplus while still visibly broken, which
            // both undoes the strike's charge loss
            // (lightning_damage_system.js:_dumpCharge) within seconds and lets
            // a dead building go on backing the grid.
            if (ty === T.SUBSTATION || ty === T.SUBSTATION2 || ty === T.SUBSTATION3 || ty === T.SUBSTATION4 || ty === T.SUBSTATION5 || ty === T.BATTERY) {
              if (!e._lightningDamaged) substations.push(e);
            }
            if (ty === T.CIRCUITSWITCH2) (_autoSwitches || (_autoSwitches = [])).push(e);
            const _coalGenOutput  = (ty === T.COALGENERATOR) ? (e._fuelled && e._hasWater && _hasWire ? e.def.powerOutput : 0) : 0;
            const _fuelGenOutput  = (ty === T.FUELGEN)       ? (e._fuelled && _hasWire ? e.def.powerOutput : 0) : 0;
            const _turbineOutput  = (ty === T.STEAMTURBINE || ty === T.STEAMTURBINE2) ? (e._generating && _hasWire ? (e._currentOutput || 0) : 0) : 0;
            const _mhdOutput      = (ty === T.MHDRING)       ? (e._generating && _hasWire ? (e._currentOutput || 0) : 0) : 0;
            const _geoTurbOutput  = (ty === T.GEOTURBINE)    ? (e._generating && _hasWire ? (e._currentOutput || 0) : 0) : 0;
            // A Lightning Rod that just intercepted a strike feeds the surge
            // back into its network as it bleeds off. Gated on _hasWire like
            // the other generators — an unwired rod still protects, it just
            // has nowhere to put the energy.
            const _rodSurge       = (ty === T.LIGHTNINGROD || ty === T.LIGHTNINGROD2 || ty === T.LIGHTNINGROD3)
              ? (_hasWire && typeof LightningDamageSystem !== 'undefined'
                  ? LightningDamageSystem.surgeWatts(e) : 0)
              : 0;
            const _out = ty === T.BIOFUELGEN ? (e._biofuelOutput || 0) : ty === T.COALGENERATOR ? _coalGenOutput : ty === T.GEOTURBINE ? _geoTurbOutput : (ty === T.STEAMTURBINE || ty === T.STEAMTURBINE2) ? _turbineOutput : ty === T.MHDRING ? _mhdOutput : ty === T.FUELGEN ? _fuelGenOutput : (ty === T.LIGHTNINGROD || ty === T.LIGHTNINGROD2 || ty === T.LIGHTNINGROD3) ? _rodSurge : e.def.powerOutput;
            supply += _out;
            if (_out > 0) _addSrc(ty, _out);
            // What each generator actually put in this tick, and whether it
            // had a wire to put it into, for GeneratorWatch below.
            if (_isGridSource(e)) { e._genOut = _out; e._genWired = _hasWire; }
            // Apply demand curve if applicable
            const dynDemand = DemandCurves.get(ty, e.commercialSubtype, currentHour);
            let scaledDemand;
            let _peakIsCeiling = false;   // set for flat "peak all day" pool types
            let _idleFloor = 0;           // off-shift minimum for pool types with an idleDraw
            let _drawRange = null;        // [min, peak] for min/peak industrial pool types
            if (dynDemand !== null) {
              scaledDemand = dynDemand;
              // A curve value IS the quoted figure for that hour, so the jitter
              // below may only pull downward from it — otherwise a customer
              // advertising a 28 kW peak quietly draws 34 kW at midday. Spike-driven
              // subtypes are exempt: their curve only covers closed hours and
              // the spike system deliberately drives them above base.
              if ((ty === T.UNIVERSITY || ty === T.TRANSPORTHUB || ty === T.NATIONALGOV || ty === T.FUSIONLAB || ty === T.AIRPORT || ty === T.MILITARYBASE || ty === T.LAUNCHCOMPLEX || ty === T.NATIONALGRID || ty === T.COMPANYHQ) ||
                  ty === T.COMMERCIAL &&
                  !(typeof COMMERCIAL_SPIKES !== 'undefined' && COMMERCIAL_SPIKES[e.commercialSubtype])) {
                _peakIsCeiling = true;
              }
            } else if (e._activePowerInput != null) {
              scaledDemand = e._activePowerInput;
              // Spike-driven: the rush figure in COMMERCIAL_SPIKES is the quoted
              // peak, so the ±20–25% jitter below may only pull downward from
              // it. Without this a Recycling Plant quoting a 42 kW peak drew 52 kW.
              _peakIsCeiling = true;
            } else if (ty === T.INDUSTRIAL && e.peakDraw != null) {
              // Industrial subtypes have no dedicated DemandCurves entry, so
              // without this every industrial building — regardless of its
              // pool's minDraw/peakDraw/desc — drew a flat, shared
              // e.def.powerInput (30 kW). minDraw present means the pool
              // entry runs all day cycling between min and peak; minDraw
              // absent means a "daytime only" entry (per its desc) that's
              // off overnight.
              if (e.minDraw != null) {
                // Mapped onto [minDraw, peakDraw] after the noise walk below
                // (see _drawRange) — midpoint × ±25% overshot the quoted peak
                // for any type whose min sits above 60% of its peak (a
                // 140–170 kW fab reached 194 kW).
                scaledDemand = (e.minDraw + e.peakDraw) / 2;
                _drawRange = [e.minDraw, e.peakDraw];
              } else {
                const isDay = currentHour >= 7 && currentHour < 19;
                // idleDraw: pool entries that keep a slower off-shift cycle
                // running overnight (e.g. the Bottling Plant) instead of going dark.
                scaledDemand = isDay ? e.peakDraw : (e.idleDraw || 0);
                // The idle draw is a floor, not a centre — the jitter below may
                // lift it but must never dip the overnight load under it.
                _idleFloor = isDay ? 0 : (e.idleDraw || 0);
                // Flat daytime types sit exactly AT their quoted peak, so the
                // ±25% industrial jitter below would push them a quarter above
                // the "peak" the panel and the pool entry both advertise. Cap
                // the jitter at 1.0 for these — peak has to mean peak. Types
                // with a minDraw are unaffected: their midpoint × 1.25 lands
                // on peak by construction.
                _peakIsCeiling = true;
              }
            } else {
              scaledDemand = e.def.powerInput;
            }
            // Demand noise — varies by building type
            if (e._demandNoise === undefined) e._demandNoise = 1.0;
            const _isInfra = ty === T.RESEARCH || ty === T.RESEARCH2 || ty === T.MONITOR || ty === T.MONITOR2 || ty === T.ENGOFFICE || ty === T.BEACON || ty === T.BIOFUELGEN;
            if (_isInfra) {
              e._demandNoise = 1.0;  // fixed draw
            } else if (ty === T.HOUSE) {
              // Population scales base demand — more people = more power
              const _popScale = DemandCurves.popScale(e._population);
              // Residential ±15% — lights, appliances vary
              e._demandNoise += (Math.random() - 0.5) * 0.005;
              e._demandNoise = Math.max(0.85 * _popScale, Math.min(1.15 * _popScale, e._demandNoise));
            } else if (ty === T.COMMERCIAL) {
              // Commercial ±20% — business activity spikes
              e._demandNoise += (Math.random() - 0.5) * 0.006;
              e._demandNoise = Math.max(0.80, Math.min(1.20, e._demandNoise));
            } else if (ty === T.INDUSTRIAL) {
              // Industrial ±25% — heavy machinery cycles
              e._demandNoise += (Math.random() - 0.5) * 0.008;
              e._demandNoise = Math.max(0.75, Math.min(1.25, e._demandNoise));
            } else if (ty === T.COALMINE) {
              // Coal Mine — varies 7-12 kW (base 12 kW * 0.583-1.0)
              e._demandNoise += (Math.random() - 0.5) * 0.01;
              e._demandNoise = Math.max(0.583, Math.min(1.0, e._demandNoise));
            } else {
              e._demandNoise += (Math.random() - 0.5) * 0.003;
              e._demandNoise = Math.max(0.92, Math.min(1.08, e._demandNoise));
            }
            // Applied after the random walk above, which would otherwise step
            // the value straight back over 1.0 on the next tick.
            if (_peakIsCeiling && e._demandNoise > 1) e._demandNoise = 1;
            const _wMult = (typeof WeatherEventSystem !== 'undefined' ? WeatherEventSystem.getActiveMult(ty) : 1)
                         * (typeof SeasonalEvents !== 'undefined' ? SeasonalEvents.demandMult(e) : 1)    // the town's calendar
                         * (typeof LaunchSystem !== 'undefined' ? LaunchSystem.demandMult(e) : 1);       // a launch count at the spaceport
            // Min/peak industrials: the industrial noise band (0.75–1.25) spans
            // exactly the advertised min–peak range, same midpoint as before.
            const _base = _drawRange
              ? _drawRange[0] + (_drawRange[1] - _drawRange[0]) * (e._demandNoise - 0.75) / 0.5
              : scaledDemand * (ty === T.HOUSE ? DemandCurves.houseScale(e.demandScale, e._population) : 1) * e._demandNoise;
            // A building whose output buffer is full has nothing to do, so it
            // drops to a standby draw (controls, lighting, keeping warm) until
            // something takes from it (see _outputFull). Its production code
            // checks _idleFull too, so it makes nothing while on standby.
            e._idleFull = _outputFull(e);
            const _fullDemand   = Math.max(_idleFloor, _base * _wMult);
            const _entityDemand = e._idleFull ? _fullDemand * IDLE_STANDBY_FRAC : _fullDemand;
            e._liveDemand = _entityDemand; // cached so info panels show the exact value actually fed into the grid, instead of recomputing (and potentially disagreeing)
            // Shed by an open Circuit Switch: the whole point is that the
            // load LEAVES the network, so the remaining supply covers the
            // rest. Cutting the building without dropping its demand would
            // cost the player the income and save them nothing.
            if (typeof CircuitSwitchSystem !== 'undefined' && CircuitSwitchSystem.isShed(e)) return;
            demand += _entityDemand;
            if (_entityDemand > 0) {
              if (!_cons) _cons = new Map();
              const _cr = _cons.get(ty);
              if (_cr) { _cr.w += _entityDemand; _cr.count++; } else _cons.set(ty, { w: _entityDemand, count: 1 });
              if (!_consEntities) _consEntities = [];
              _consEntities.push(e);
            }
          });

          // 3b. Wire congestion derate — if any wire in this component is stressed
          // (80-100% of its effective throughput cap), linearly reduce supply.
          // At 80% load: no derate. At 100% load: supply x 0.5 (moderate brownout).
          // — worstCongestion already collected in the main pass above.
          // Taken off BEFORE storage dispatches, so reserves cover the loss
          // like any other shortfall. It used to come off after storage had
          // topped supply up to exactly meet demand, which made the smallest
          // derate a guaranteed blackout on any network leaning on storage —
          // a 6 kW loss darkened a city holding 480 kWh in reserve.
          let _congLoss = 0;
          if (worstCongestion > 0) {
            _congLoss = supply * worstCongestion * 0.5;  // 0->no derate, 1->50% derate
            supply -= _congLoss;
            if (_congLoss > 0) _addSrc('congestion', -_congLoss);
          }

          // 3c. Storage charge / discharge (Substation + Battery Block)
          // — substations[] already collected in the main pass above.
          let surplus = supply - demand;
          const _genHeadroom = surplus;   // generation alone, before storage — see step 3d
          const _genSupply = supply;
          let _stAvail = 0;               // what storage could release, before it does
          for (const sub of substations) if (sub.charge > 0) _stAvail += Math.min(sub.def.maxOutput || sub.def.maxRate, dt > 0 ? sub.charge / dt : Infinity);

          // A geomagnetic storm stops storage taking charge at all.
          const _storeCharge = typeof WeatherEventSystem !== 'undefined' ? WeatherEventSystem.getStoreChargeMult() : 1;
          substations.forEach(sub => {
            const def = sub.def;
            stUnits++;
            stCapKWh += def.ratedKWh || 0;
            stMaxOut += def.maxOutput || 0;
            if (surplus > 0) {
              const absorb  = Math.min(surplus, def.maxRate * _storeCharge, def.capacity - sub.charge);
              sub.charge    = Math.min(def.capacity, sub.charge + absorb * dt * 0.85 * (def.chargeRate || 1)); // chargeRate multiplier
              sub.charging  = absorb > 0.01;
              surplus      -= absorb;
              stIn         += absorb;
            } else if (surplus < 0 && sub.charge > 0) {
              // Release enough to cover deficit, capped at maxOutput and available charge
              const maxRelease = def.maxOutput || def.maxRate;
              const needed     = -surplus;  // deficit in watts
              const release    = Math.min(needed, maxRelease, sub.charge / dt);
              const dscale = def.dischargeScale || 1;
              sub.charge       = Math.max(0, sub.charge - (release * dt) / dscale);
              sub.charging     = false;
              supply          += release;  // full release — loss already implicit in capacity
              if (release > 0) _addSrc('storage', release);
              stOut           += release;
              surplus          = supply - demand;
              sub.overloaded   = (-surplus > 0.5);
            }
            stKWh   += def.capacity > 0 ? (sub.charge / def.capacity) * (def.ratedKWh || 0) : 0;
            stDrain += sub.charge * (def.dischargeScale || 1);   // kW·s it can still deliver
          });

          // 3d. Automatic load shedding — Circuit Switch MK2s in auto mode.
          // Still short after storage means this network is about to go
          // dark: open just enough switches to cover the gap, and take their
          // members' draw back out of this tick's demand so the shed happens
          // instead of the blackout rather than a tick after it. Skipped in
          // the post-load grace (the network is held up anyway) and with no
          // generation at all (shedding can't bring that back).
          if (_autoSwitches && typeof CircuitSwitchSystem !== 'undefined') {
            if (supply > 0 && _loadGrace <= 0 && supply < demand - 0.01) {
              const shed = CircuitSwitchSystem.autoShed(_autoSwitches, demand - supply);
              if (shed) {
                for (const m of shed) {
                  const w = m._liveDemand || 0;
                  if (w <= 0) continue;
                  demand -= w;
                  const _cr = _cons && _cons.get(m.type);
                  if (_cr) { _cr.w -= w; _cr.count--; }
                  if (_consEntities) { const i = _consEntities.indexOf(m); if (i >= 0) _consEntities.splice(i, 1); }
                }
                surplus = supply - demand;
              }
            }
            CircuitSwitchSystem.autoReclose(_autoSwitches, _genHeadroom, dt);
          }

          const _rawSupply = supply + _congLoss;   // before the derate — see step 5

          // 4. Distribute power state
          // During the post-load settle window a network with ANY supply is
          // held up. Geothermal wells, water extractors and fuel generators
          // all need grid power to feed the generators behind them, and
          // steam/fuel plants are still spinning back up for the first few
          // ticks -- so a single phantom deficit tick here cut the wells and
          // pumps, which cut the generators they feed, and the network could
          // never climb back: a healthy grid dying a second after every load.
          const hasPower = (supply >= demand - 0.01 && supply > 0)  // epsilon for float precision
                        || (_loadGrace > 0 && supply > 0);
          // Protector bays stay fed through a brownout (see applyWireLoads).
          // So do Geothermal Wells: a well cut by a brownout takes its turbine
          // down with it, and losing that output deepens the very shortfall
          // that cut it (GeothermalSystem.tickWell). Hydro Turbines likewise:
          // cut, their Hydroelectric Generators stop, and the grid that was
          // short never gets them back (ReservoirSystem.tick).
          for (let _ci = 0; _ci < _split.bays.length; _ci++) _split.bays[_ci]._bayFed = supply > 0;
          // Stranded-generator watch: producing, but nothing on this network
          // draws power (e.g. a turbine hall never wired to the city).
          if (_checkGrid && _gridSrc) {
            const idle = supply > 0.5 && demand < 0.5;
            let w = 0; const gens = [];
            for (let _ci = 0; _ci < component.length; _ci++) {
              const ge = component[_ci];
              if (!_isGridSource(ge)) continue;
              ge._strandedFor = idle ? (ge._strandedFor || 0) + GRID_CHECK_MS / 1000 : 0;
              if (idle) gens.push(ge);
            }
            if (idle) { w = supply; _strandedNets.push({ w, gens }); }
          }
          // Backup-power watch: networks running on substation reserves.
          if (_checkGrid && substations.length) {
            let ch = 0, cap = 0, maxOut = 0;
            for (const sb of substations) { ch += sb.charge || 0; cap += sb.def.capacity || 0; maxOut += sb.def.maxOutput || sb.def.maxRate || 0; }
            const rel = (_srcs && _srcs.get('storage')) ? _srcs.get('storage').w : 0;
            if (cap > 0) _backupNets.push({ ch, cap, maxOut, rel, deficit: demand - (supply - rel), dscale: substations[0].def.dischargeScale || 1, anchor: substations[0], browned: !hasPower });
          }

          // Burnout SFX — fires exactly ONCE on transition into insufficient state.
          // _insufficient flag persists on entities between ticks so we only trigger
          // on the first tick where supply < demand, not every subsequent tick.
          // _houseCount piggybacks on these same full-component passes — every
          // entity gets e.powered assigned here regardless, so tallying
          // house/commercial membership alongside avoids two more dedicated
          // .filter(...).length passes (each an O(n) scan plus a throwaway
          // array) immediately afterward for the exact same information.
          let _houseCount = 0;
          if (!hasPower && supply > 0 && demand > 0) {
            // Was ANY entity in this component NOT already marked insufficient?
            const isNewDeficit = component.some(e => !e._insufficient);
            if (isNewDeficit) {
              SFX.burnout(0.6);
              // Stamp the outage start so we can gate the "back online" chime
              // on how long it actually lasted — short flicker/brownouts firing
              // that sound on every recovery got extremely annoying.
              const _outageStart = Date.now();
              component.forEach(e => { e._deficitStartTime = _outageStart; });
              // Before Solar unlocks, Biofuel Generators are the only plant the
              // player can build, so a grid falling short has exactly one fix —
              // say so. Not during the post-load settle (phantom outages).
              if (_loadGrace <= 0 && typeof Progression !== 'undefined' && !Progression.isUnlocked(T.SOLAR) &&
                  _outageStart - _lastBiofuelHintToast > 45000 && typeof showToast === 'function') {
                _lastBiofuelHintToast = _outageStart;
                showToast('⚡ Your grid ran out of power — build more Biofuel Generators to cover demand',
                          '#ff8040', '#180a00', '#804020', 'early-biofuel-hint');
              }
            }
            component.forEach(e => {
              if (e._lightningDamaged) { e.powered = false; return; }
              if (e._constructing) e._sitePowered = false;
              e._insufficient = true;  e.powered = false;
              if ((e.type === T.HOUSE || e.type === T.COMMERCIAL) && !e._constructing) _houseCount++;
            });
          } else {
            // Struck buildings stay dark regardless of how healthy the rest
            // of the component is, and don't count toward the powered-
            // customer tally. A building on an OPEN circuit switch is off for
            // the same reason — the player cut it deliberately.
            // Whether ANY entity was previously marked insufficient (→ good
            // connection event, below) is read off each one as it is cleared,
            // rather than by a pass of its own first.
            const _shedOn = typeof CircuitSwitchSystem !== 'undefined' && CircuitSwitchSystem.anyShed();
            let wasDeficit = false;
            for (let _ci = 0; _ci < _wires.length; _ci++) {
              const e = _wires[_ci];
              if (e._insufficient) wasDeficit = true;
              if (e._lightningDamaged) { e.powered = false; continue; }
              if (_shedOn && CircuitSwitchSystem.isShed(e)) { e._insufficient = false; e.powered = false; continue; }
              e._insufficient = false; e.powered = hasPower;
            }
            for (let _ci = 0; _ci < _rest.length; _ci++) {
              const e = _rest[_ci];
              if (e._insufficient) wasDeficit = true;
              if (e._lightningDamaged) { e.powered = false; continue; }
              // A building site has grid power for its crew, not a powered
              // customer: nothing that counts customers should see it lit.
              if (e._constructing) { e._insufficient = false; e.powered = false; e._sitePowered = hasPower && !(_shedOn && CircuitSwitchSystem.isShed(e)); continue; }
              if (_shedOn && CircuitSwitchSystem.isShed(e)) { e._insufficient = false; e.powered = false; continue; }
              e._insufficient = false; e.powered = hasPower;
              if ((e.type === T.HOUSE || e.type === T.COMMERCIAL) && !e._constructing) _houseCount++;
            }
            if (wasDeficit && hasPower && demand > 0) {
              const _startEntity = component.find(e => e._deficitStartTime !== undefined);
              const outageMs = _startEntity ? Date.now() - _startEntity._deficitStartTime : 0;
              // Only play the "back online" chime for real outages (12s+) —
              // brief flickers just silently reconnect.
              if (outageMs >= 12000) SFX.goodConnect();
            }
          }

          // 5. Store network demand so applyWireLoads() can assign it to each wire.
          // A network that can't meet its demand powers nothing (step 4), so
          // its conductors carry nothing either. Judging them on the demand
          // hanging off them tripped a line the moment it was cut off from its
          // source: the island past the cut (none of the main grid's
          // protectors, only the bare 85 kW cap) still had a hydro generator
          // running down its tank, fell short, and every span on it tripped
          // and sat open for WIRE_RECLOSE_MS — so reattaching the cut wire
          // left the line dark for ~6 s instead of coming straight back.
          // Exception: short only because of the congestion derate (step 3c),
          // it keeps its load — dropping it would clear the congestion, lift
          // the derate and flip the network on and off every tick.
          const _carrying = hasPower || (supply > 0 && _rawSupply >= demand - 0.01);
          networkDemand.set(netId, _carrying ? demand : 0);
          networkHeadroom.set(netId, { cap: Math.max(0, _genSupply) + _stAvail, demand });

          // 5b. Grid-link tracking (throttled — see _gridCheckDue): keep the
          // persistent off-grid set in sync with every consumer's current
          // state, not just this tick's transitions.
          if (_checkGrid) {
            const onGrid = _gridSrc && _hasWire;
            for (let _ci = 0; _ci < component.length; _ci++) {
              const e = component[_ci];
              if (!_tracksGridLink(e)) continue;
              // A building actually receiving power is connected, whatever
              // this component holds — power can arrive through a substation
              // link or batteries rather than a generator in the same wire
              // component, and those used to stay listed as cut off forever,
              // so the card never counted down as things came back.
              const linked = onGrid || !!e.powered;
              e._gridLinked = linked;
              // Only something that WAS connected can be "cut off". A building
              // just placed and not wired up yet has never been linked, so it
              // stays off the card until it has been connected at least once.
              if (linked) { e._everGridLinked = true; _offGridSet.delete(e); }
              else if (e._everGridLinked) _offGridSet.add(e);
            }
          }

          // Accumulate global stats
          totGen   += supply;
          if (_srcs) genSources.push({ netId, supply, sources: _srcs });
          // Only count demand from components with at least one wire (physically connected)
          if (_hasWire) totCon += demand;
          if (_hasWire && _cons) conSources.push({ netId, demand, sources: _cons, entities: _consEntities });
          conTotal += _houseCount;
          if (hasPower) powered += _houseCount;

          netId++;
      }

      if (_checkGrid) { _syncBackupNotification(); _syncStrandedGenNotification(); }
      if (_checkGrid) {
        // Drop anything bulldozed away while it was sitting cut off — it
        // would otherwise keep inflating the count forever.
        for (const e of _offGridSet) if (!EntityRegistry.all().has(e)) _offGridSet.delete(e);
        _syncCutOffNotification();
      }

      // Apply wire loads now that all networkIds and demands are known.
      PerfMonitor.record('PN: component loop', performance.now() - _phT1);
      const _phT2 = performance.now();
      applyWireLoads();
      PerfMonitor.record('PN: applyWireLoads', performance.now() - _phT2);
      networkDemand.clear();

      // Dev-mode power override (DevMode "Power All Buildings" / "Power
      // Selected"). Applied last so the real network result is computed and
      // then overruled, and every system ticking after this reads it as
      // powered. Lightning-wrecked buildings stay dark — they're out of service.
      if (typeof DevMode !== 'undefined' && DevMode.hasPowerOverrides) {
        for (const e of EntityRegistry.all()) {
          if (e.powered || e._lightningDamaged || !DevMode.forcesPower(e)) continue;
          e.powered = true;
          e._insufficient = false;
        }
      }


      networkStats.totalGenerated = totGen;
      networkStats.storage        = { out: stOut, in: stIn, kWh: stKWh, capKWh: stCapKWh, maxOut: stMaxOut, units: stUnits,
                                      secondsLeft: stOut > 0.01 ? stDrain / stOut : null };
      networkStats.genSources     = genSources;
      networkStats.conSources     = conSources;
      networkStats.totalConsumed  = totCon;
      networkStats.poweredCount   = powered;
      networkStats.totalConsumers = conTotal;

      // Surge Protector advisory — if any wire/pole is currently failed from
      // overload and stays that way for OVERLOAD_ADVISORY_DELAY straight,
      // nudge the player once per episode. Resets as soon as the grid clears
      // so it can fire again on a later, separate overload.
      // Storm/fire damage is not an overload (it has its own Wire Fault card,
      // and a Surge Protector won't mend it), so it doesn't count here.
      //
      // Two very different faults trip lines, and they need opposite advice:
      //  • OVERLOAD: the network's demand really is over its wire rating.
      //    More Surge Protectors is the fix.
      //  • CUT OFF: a broken line (storm or fire damage, a wire removed) or a
      //    dark MK3 bay has separated part of the grid from the protectors
      //    it relies on. That part falls back to the bare 85 kW rating while
      //    still carrying megawatts, so its every span trips at once and its
      //    generators drop off with it, which reads as a supply shortfall.
      //    Placing yet another protector beside the bank fixes nothing; the
      //    break has to be repaired, and protectors spread across the grid
      //    stop one break doing it again.
      // Classified by majority of the spans that tripped (stamped on each in
      // applyWireLoads), and the card is cleared once the lines recover so a
      // stale one never sits over a later, unrelated outage.
      // The cheap any-tripped test runs every tick; the full classifying
      // scan only once, when the card is actually due.
      let _anyFailed = false;
      for (const e of EntityRegistry.getByType(T.WIRE))  { if (e.failed && !e._weatherFailed) { _anyFailed = true; break; } }
      if (!_anyFailed) for (const e of EntityRegistry.getByType(T.POLE)) { if (e.failed && !e._weatherFailed) { _anyFailed = true; break; } }
      if (_anyFailed) {
        if (_overloadSince === null) _overloadSince = Date.now();
        else if (!_overloadAdvised && Date.now() - _overloadSince >= OVERLOAD_ADVISORY_DELAY) {
          _overloadAdvised = true;
          let _nFailed = 0, _nCutOff = 0, _worstLoad = 0, _worstCap = 0, _cutCap = 0;
          for (const type of [T.WIRE, T.POLE]) for (const e of EntityRegistry.getByType(type)) {
            if (!e.failed || e._weatherFailed) continue;
            _nFailed++;
            if (e._tripCutOff) { _nCutOff++; _cutCap = Math.max(_cutCap, e._tripCap || 0); }
            else if ((e._tripLoad || 0) > _worstLoad) { _worstLoad = e._tripLoad || 0; _worstCap = e._tripCap || 0; }
          }
          let card;
          if (_nCutOff * 2 >= _nFailed) {
            let storm = false, darkBay = false;
            for (const type of [T.WIRE, T.POLE]) { for (const e of EntityRegistry.getByType(type)) if (e._weatherFailed) { storm = true; break; } if (storm) break; }
            if (typeof T.PROTECTOR3 !== 'undefined') for (const b of EntityRegistry.getByType(T.PROTECTOR3)) if (b._unpoweredBay) { darkBay = true; break; }
            const cause = storm ? ' by a storm- or fire-damaged line'
                        : darkBay ? ' because an MK3 arrester bay was knocked out'
                        : '';
            const fix = storm ? 'Repair the damaged line to reconnect it.'
                      : darkBay ? 'Repair the MK3 bay.'
                      : 'Reconnect it to the part of the grid with the protectors.';
            card = {
              icon: '✂',
              title: 'Grid Cut Off From Surge Protectors',
              message: `Part of the grid was separated from its Surge Protectors${cause}, so its lines fell back to a ${formatPower(_cutCap || _baseCap())} rating and tripped, taking its generators with them. ${fix} Another protector next to the bank won't help; spreading protectors across the grid stops one break doing this.`,
            };
          } else {
            card = {
              icon: '⚡',
              title: 'Grid Overloaded',
              message: _worstCap > 0
                ? `Demand of ${formatPower(_worstLoad)} is over the lines' ${formatPower(_worstCap)} rating, so they are tripping. Place Surge Protectors on this network to raise it.`
                : 'Wires are failing under load. Place a Surge Protector to raise the throughput cap.',
            };
          }
          NotificationStack.push({ ...card, color: '#ff8040', border: '#804020', glow: true, tag: 'grid-overload' });
        }
      } else {
        _overloadSince   = null;
        _overloadAdvised = false;
        if (NotificationStack.hasTag && NotificationStack.hasTag('grid-overload')) NotificationStack.dismissTag('grid-overload');
      }
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   GENERATOR WATCH
   A generator that has put nothing into the grid for FLAG_HOURS of
   in-game time gets a notification, saying why where that can be told
   (no coal, no water, no steam, no wire), with a click that jumps to it
   and on to the next. Several at once share one card. The card goes
   when every one of them is producing again, and comes back only for a
   generator that newly stops.

   Solar and wind are left out: nothing at night or in still air is just
   the weather. So are generators wrecked by lightning (they have their
   own alert) and ones still being built. Output is what PowerNetwork
   counted from each generator this tick (_genOut), so a plant that is
   fuelled but has no wire to deliver into counts as not producing too.
   Not saved: after a load the hour starts again.
   ═══════════════════════════════════════════════════════════════════ */
const GeneratorWatch = (() => {
  const FLAG_HOURS = 1;
  const SCAN_EVERY = 1;     // seconds of sim time between passes
  const TAG = 'gen-idle';
  let _types = null;
  let _acc = 0;
  let _flagged = [];        // generators past the hour, in the order they got there
  let _shown = new Set();   // flagged generators the card has already reported
  let _jump = 0;

  function genTypes() {
    if (_types) return _types;
    const weather = new Set([T.SOLAR, T.SOLAR2, T.SOLAR3, T.WIND, T.WIND2, T.WIND3]);
    _types = Object.entries(EntityDefs)
      .filter(([t, d]) => d && (d.powerOutput > 0 || d.peakOutput > 0 || d.baseOutput > 0) && !weather.has(t))
      .map(([t]) => t);
    return _types;
  }
  const threshold = () => FLAG_HOURS * (typeof DayNight !== 'undefined' ? DayNight.secondsPerGameHour() : 50);

  function nameOf(e) {
    const base = EntityDefs[e.type]?.label || 'Generator';
    return e._num !== undefined && typeof NUMBERED_ENTITY_TYPES !== 'undefined' && NUMBERED_ENTITY_TYPES.has(e.type)
      ? `${base} #${e._num}` : base;
  }
  function why(e) {
    if (e._genWired === false) return "isn't wired into the grid";
    switch (e.type) {
      case T.COALGENERATOR:  return !e._fuelled ? 'has no coal' : !e._hasWater ? 'has no water' : "isn't producing";
      case T.FUELGEN:        return !e._fuelled ? 'has no fuel oil' : "isn't producing";
      case T.STEAMTURBINE:
      case T.STEAMTURBINE2:  return 'is getting no steam';
      case T.GEOTURBINE:     return 'is getting no steam from its well';
      case T.HYDROGENERATOR: return "isn't being turned by a turbine shaft";
      case T.BIOFUELGEN:     return 'has nothing to burn';
      case T.MHDRING:        return 'is getting no plasma';
    }
    return "isn't producing";
  }

  function _jumpTo(e) {
    if (typeof Camera === 'undefined') return;
    Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE);
  }
  function _card(isNew) {
    if (typeof NotificationStack === 'undefined') return;
    if (!_flagged.length) { NotificationStack.dismissTag(TAG); return; }
    const e = _flagged[0], n = _flagged.length;
    const title = n === 1 ? `${nameOf(e)} not producing` : `${n} generators not producing`;
    const message = n === 1
      ? `It ${why(e)} and has made no power for over an hour: click to jump there`
      : `${nameOf(e)} ${why(e)}, and ${n - 1} more ${n === 2 ? 'has' : 'have'} made no power for over an hour: click to jump to each`;
    if (NotificationStack.hasTag(TAG)) { NotificationStack.updateTag(TAG, { title, message }); return; }
    if (!isNew) return;   // dismissed by the player: wait for a newly stopped one
    NotificationStack.push({
      icon: '⚡', title, message, tag: TAG, color: '#f0a040', border: '#604010',
      onClick: () => {
        const live = _flagged.filter(g => EntityRegistry.getByType(g.type).has(g));
        if (!live.length) return;
        _jumpTo(live[_jump++ % live.length]);
      },
    });
  }

  function tick(dt) {
    if (dt <= 0) return;
    _acc += dt;
    if (_acc < SCAN_EVERY) return;
    const step = _acc;
    _acc = 0;
    // Just after a load nothing has settled yet; don't count it as idle.
    if (typeof PowerNetwork !== 'undefined' && PowerNetwork.inLoadGrace && PowerNetwork.inLoadGrace()) return;
    const limit = threshold();
    const now = [];
    for (const type of genTypes()) {
      for (const e of EntityRegistry.getByType(type)) {
        if (e._lightningDamaged || e._irreparable || e._constructing || (e._genOut || 0) > 0) { e._genIdleFor = 0; continue; }
        e._genIdleFor = (e._genIdleFor || 0) + step;
        if (e._genIdleFor >= limit) now.push(e);
      }
    }
    // Keep the order they got there in, so the card names the longest-idle one.
    const still = new Set(now);
    const kept = _flagged.filter(e => still.has(e));
    const added = now.filter(e => !_flagged.includes(e));
    const changed = added.length || kept.length !== _flagged.length;
    _flagged = kept.concat(added);
    for (const e of [..._shown]) if (!still.has(e)) _shown.delete(e);
    const fresh = added.some(e => !_shown.has(e));
    for (const e of added) _shown.add(e);
    if (changed) _card(fresh);
  }

  return {
    tick,
    isFlagged(e) { return _flagged.includes(e); },
    flagHours() { return FLAG_HOURS; },
    reset() { _acc = 0; _flagged = []; _shown = new Set(); _jump = 0; if (typeof NotificationStack !== 'undefined') NotificationStack.dismissTag(TAG); },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   OUTAGE WATCH
   How long each power-drawing building has been dark, so one that has
   been cut off for a while can be picked out both in the world and on
   the world map. A brief brownout or a flicker while you re-wire is
   normal and stays unmarked; FLAG_HOURS of in-game time without power
   is not, and that's what gets highlighted.

   Only real consumers are tracked (powerInput > 0, and not a generator
   — a coal plant waiting on coal isn't "cut off"). Buildings wrecked by
   lightning are left alone: they draw as burning ruins and have their
   own alert, and a building the player deliberately shed with a Circuit
   Switch is off on purpose, so neither is flagged here.
   ═══════════════════════════════════════════════════════════════════ */
const OutageWatch = (() => {
  const FLAG_HOURS = 3;     // in-game hours dark before a building is flagged
  const SCAN_EVERY = 1;     // seconds of sim time between passes

  let _types = null;        // consumer types, resolved once from EntityDefs
  let _acc   = 0;           // sim seconds banked since the last pass
  let _any   = false;       // is anything currently flagged? (cheap render gate)

  function consumerTypes() {
    if (_types) return _types;
    _types = [];
    for (const [type, d] of Object.entries(EntityDefs)) {
      if (!d || !(d.powerInput > 0)) continue;
      if (d.powerOutput > 0 || d.peakOutput > 0 || d.baseOutput > 0) continue;
      _types.push(type);
    }
    return _types;
  }

  function threshold() {
    return FLAG_HOURS * (typeof DayNight !== 'undefined' ? DayNight.secondsPerGameHour() : 50);
  }

  // One pass over every consumer, banking the sim time since the last one.
  // Throttled to SCAN_EVERY rather than run every tick: on a built-up city
  // this walks thousands of houses, and a second's resolution is plenty for
  // something measured in in-game hours.
  function tick(dt) {
    if (dt <= 0) return;
    _acc += dt;
    if (_acc < SCAN_EVERY) return;
    const step = _acc;
    _acc = 0;
    const shedOn = typeof CircuitSwitchSystem !== 'undefined' && CircuitSwitchSystem.anyShed();
    let any = false;
    const limit = threshold();
    for (const type of consumerTypes()) {
      for (const e of EntityRegistry.getByType(type)) {
        if (e.powered || e._lightningDamaged || e._irreparable || e._constructing
            || (shedOn && CircuitSwitchSystem.isShed(e))) { e._darkFor = 0; continue; }
        e._darkFor = (e._darkFor || 0) + step;
        if (e._darkFor >= limit) any = true;
      }
    }
    _any = any;
  }

  return {
    tick,
    // True once a building has been dark long enough to be worth showing.
    isFlagged(e) { return (e._darkFor || 0) >= threshold(); },
    // Whole hours dark, for labels.
    hoursDark(e) {
      const h = (e._darkFor || 0) / (typeof DayNight !== 'undefined' ? DayNight.secondsPerGameHour() : 50);
      return Math.floor(h);
    },
    anyFlagged() { return _any; },
    flagHours() { return FLAG_HOURS; },
    reset() { _acc = 0; _any = false; },
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   GRID BREAK WATCH
   Open-circuit spots that can shatter one wire network into many:
   lightning-struck Power Towers (dead relays / lost hop anchors) and
   weather-failed / burned wires and poles. Keeps a jump-list so the
   player can pan to each break instead of scrolling the whole map,
   flashes them on the world map, and clears entries once repaired.
   ═══════════════════════════════════════════════════════════════════ */
const GridBreakWatch = (() => {
  const TAG = 'gridbreak';
  let _breaks = [];     // [{ e, kind, label }]
  let _jumpIdx = 0;
  let _notifOn = false;
  let _prevCount = 0;

  function _labelFor(e, kind) {
    const defLabel = (typeof EntityDefs !== 'undefined' && EntityDefs[e.type]?.label) || e.type;
    const num = (e._num !== undefined && typeof NUMBERED_ENTITY_TYPES !== 'undefined'
                 && NUMBERED_ENTITY_TYPES.has(e.type)) ? ` #${e._num}` : '';
    if (kind === 'tower') return `${defLabel}${num}: lightning open circuit`;
    if (kind === 'wire')  return e._wireOnFire ? `Wire on fire @ (${e.col}, ${e.row})`
                                               : `Wire fault @ (${e.col}, ${e.row})`;
    if (kind === 'pole')  return `${defLabel}${num}: open circuit`;
    return `${defLabel}${num}`;
  }

  function _isBreakEntity(e) {
    if (!e) return false;
    // Struck Power Tower: open circuit + lost hop anchor (the usual
    // "one network → dozens" cut). Poles/wires only count when the storm
    // or a wire fire marked them — ordinary overload trips are transient
    // and would drown the list during peak demand.
    if (e.type === T.POWERTOWER && e._lightningDamaged) return true;
    if ((e.type === T.WIRE || e.type === T.POLE) && e._weatherFailed) return true;
    return false;
  }

  function _centre(e) {
    if (typeof GridManager !== 'undefined' && GridManager.tileToWorld) {
      const { x, y } = GridManager.tileToWorld(e.col, e.row);
      return { wx: x + (e.width || 1) * TILE / 2, wy: y + (e.height || 1) * TILE / 2 };
    }
    return { wx: (e.col + (e.width || 1) / 2) * TILE, wy: (e.row + (e.height || 1) / 2) * TILE };
  }

  function _rescan() {
    const list = [];
    // Towers first — a struck tower is the usual "one network → dozens" cut.
    for (const e of EntityRegistry.getByType(T.POWERTOWER)) {
      if (e._lightningDamaged) list.push({ e, kind: 'tower', label: _labelFor(e, 'tower') });
    }
    for (const e of EntityRegistry.getByType(T.POLE)) {
      if (e._weatherFailed) list.push({ e, kind: 'pole', label: _labelFor(e, 'pole') });
    }
    for (const e of EntityRegistry.getByType(T.WIRE)) {
      if (e._weatherFailed) list.push({ e, kind: 'wire', label: _labelFor(e, 'wire') });
    }
    _breaks = list;
    if (_jumpIdx >= _breaks.length) _jumpIdx = 0;
    return list;
  }

  function _syncNotif() {
    if (typeof NotificationStack === 'undefined') return;
    const n = _breaks.length;
    if (n <= 0) {
      if (NotificationStack.hasTag(TAG)) NotificationStack.dismissTag(TAG);
      _notifOn = false;
      _prevCount = 0;
      return;
    }
    // Honour dismiss: if the player closed the card, stay quiet until a
    // NEW break appears (count rises). Clearing all then striking again
    // also re-opens via the n > _prevCount path after a zero stretch.
    _notifOn = NotificationStack.hasTag(TAG);
    const head = _breaks[0];
    const title = n === 1 ? 'Grid Break' : `Grid Breaks (${n})`;
    const message = n === 1
      ? `${head.label}: click to jump`
      : `${n} open circuits (towers / wires / poles); click to jump to next`;
    if (_notifOn) {
      NotificationStack.updateTag(TAG, { title, message });
    } else if (n > _prevCount) {
      NotificationStack.push({
        icon: '⚡',
        title,
        message,
        color: '#ff6040',
        border: '#702010',
        tag: TAG,
        glow: true,
        onClick: () => { jumpNext(); },
      });
      _notifOn = true;
    }
    _prevCount = n;
  }

  function tick(_dt) {
    _rescan();
    _syncNotif();
  }

  function list() { return _breaks.slice(); }
  function count() { return _breaks.length; }
  function isBreak(e) { return _isBreakEntity(e); }
  function any() { return _breaks.length > 0; }

  function jumpTo(index) {
    _rescan();
    if (!_breaks.length) return false;
    _jumpIdx = ((index % _breaks.length) + _breaks.length) % _breaks.length;
    const b = _breaks[_jumpIdx];
    const { wx, wy } = _centre(b.e);
    if (typeof Camera !== 'undefined') Camera.recentreOn(wx, wy);
    if (b.kind === 'wire' || b.kind === 'pole') {
      if (typeof WireInspector !== 'undefined') WireInspector.open?.(b.e);
    } else if (typeof EntityInfoPanel !== 'undefined') {
      EntityInfoPanel.open?.(b.e);
    }
    return true;
  }

  function jumpNext() {
    _rescan();
    if (!_breaks.length) return false;
    const idx = _jumpIdx;
    const ok = jumpTo(idx);
    _jumpIdx = (idx + 1) % _breaks.length;
    return ok;
  }

  // Force an immediate rescan + notification (e.g. right after a strike).
  function noteChanged() {
    _rescan();
    _syncNotif();
  }

  return { tick, list, count, isBreak, any, jumpTo, jumpNext, noteChanged, rescan: _rescan };
})();

/* ═══════════════════════════════════════════════════════════════════
   DEV MODE
   Toggle with backtick (`). Exposes:
   - Unlimited funds (Economy checks this before spending)
   - Time-of-day slider that writes directly into DayNight.setHour()
   ═══════════════════════════════════════════════════════════════════ */
