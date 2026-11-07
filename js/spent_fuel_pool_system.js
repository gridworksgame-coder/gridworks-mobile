/* ═══════════════════════════════════════════════════════════════════
   SPENT FUEL POOL SYSTEM
   Reactor SPENT FUEL OUT (conveyor) → cooling water → Reprocessing Plant.

   An optional buffer between the reactors and the Reprocessing Plant, and
   the only building that may bank spent fuel — a generic Storage Container
   deliberately cannot (see SolidStorageSystem.KINDS), because letting one
   hoard it would remove the waste pressure the whole loop runs on. A
   purpose-built pool that visibly holds the stuff under water is a
   different proposition from a crate.

   What it buys the player:
     • It DECOUPLES the two ends. It pulls at intakeRate (0.5 u/s — about
       thirty times what one reactor produces), so reactors never sit at
       spentFuelCapacity, which is the level at which a reactor STOPS
       GENERATING. And it keeps feeding the plant through a reactor outage.
     • It is a THROUGHPUT LIMITER, not free storage: fuel arrives far too
       hot to handle and has to sit under water for def.coolSeconds before
       a consumer can draw it. A burst of spent fuel does not become a
       burst of plutonium.

   Cooling is tracked as a FIFO of batches rather than a single scalar,
   because a scalar cannot express "this much arrived 30s ago and this much
   arrived just now" — and an averaged approximation would make some fuel
   reprocessable the instant it landed, which is the exact thing the delay
   exists to prevent. Deposits inside BATCH_GRANULARITY seconds of each
   other merge, so the queue stays at coolSeconds / BATCH_GRANULARITY
   entries (~48) however long the pool runs.

   Power drives circulation only. Stock already in the pool is safe with the
   power off; what stops is the cooling clock (and therefore anything new
   becoming ready) and the intake.
   ═══════════════════════════════════════════════════════════════════ */

const SpentFuelPoolSystem = (() => {
  // Deposits closer together in time than this merge into one batch.
  const BATCH_GRANULARITY = 5;   // seconds

  // Stubs: spent fuel IN on one face, OUT on the opposite one, both a third
  // of the way along so a belt can run straight through the pool. Same
  // bottom→left→top→right rotation order as the other rotatable plants.
  //   rot 0: IN top,    OUT bottom
  //   rot 1: IN right,  OUT left
  //   rot 2: IN bottom, OUT top
  //   rot 3: IN left,   OUT right

  function getStubs(e) {
    const rot = e._rotation || 0;
    const def = EntityDefs[T.SPENTFUELPOOL] || {};
    const w = e.width || def.width || 9, h = e.height || def.height || 7;
    // Centred on the wall rather than pinned one tile in from the corner:
    // on a building this wide a corner stub reads as belonging to the
    // neighbour, not the pool.
    const oc = Math.floor(w / 2), or = Math.floor(h / 2);
    const top    = { c: e.col + oc, r: e.row - 1 };
    const bottom = { c: e.col + oc, r: e.row + h };
    const left   = { c: e.col - 1,  r: e.row + or };
    const right  = { c: e.col + w,  r: e.row + or };
    if (rot === 1) return { spentIn: right,  spentOut: left };
    if (rot === 2) return { spentIn: bottom, spentOut: top };
    if (rot === 3) return { spentIn: left,   spentOut: right };
    return          { spentIn: top,    spentOut: bottom };
  }

  const isOutStub = (e, c, r) => { const s = getStubs(e).spentOut; return s.c === c && s.r === r; };
  const online    = (e) => !!e && !e._lightningDamaged;

  function _ensure(e) {
    if (!Array.isArray(e._batches)) e._batches = [];
    if (e._ready === undefined) e._ready = 0;
  }

  // Everything the pool holds, cooling and cooled. This is what the fill
  // gauge, the removal block and the renderer all read.
  function total(e) {
    _ensure(e);
    let sum = e._ready;
    for (const b of e._batches) sum += b.a;
    return sum;
  }

  // Walk the IN belt back to the reactors feeding it, exactly as the
  // Reprocessing Plant does: NuclearSystem stamps each SPENT FUEL OUT belt tile
  // with a reference to its reactor, and following that reference is what
  // makes a belt of any length and shape work.
  //
  // Only reactors count. A pool deliberately does not draw from another
  // pool — chaining them would let a player launder fuel through a series
  // of pools and reset nothing, while making the cooling clock meaningless.
  function sourcesOnBelt(e) {
    const { spentIn } = getStubs(e);
    const visited = new Set();
    const sources = [];
    const queue = [{ c: spentIn.c, r: spentIn.r, pc: null, pr: null }];
    while (queue.length) {
      const { c, r, pc, pr } = queue.shift();
      const key = `${c},${r}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const ent = GridManager.getEntity(c, r);
      if (!ent) continue;
      // Only through the reactor's SPENT FUEL OUT stub (see arrivedByPort).
      if (ent.type === T.NUCLEARREACTOR) {
        if (arrivedByPort(NuclearSystem.getStubs(ent).wasteOut, pc, pr) && !sources.includes(ent)) sources.push(ent);
        continue;
      }
      if (isConveyorTile(ent)) {
        const src = ent._spentFuelConveyorSource;
        if (src && src.type === T.NUCLEARREACTOR && !sources.includes(src)) sources.push(src);
        for (const [dc, dr] of beltSteps(c, r))
          queue.push({ c: c+dc, r: r+dr, pc: c, pr: r });
      }
    }
    // Fullest reactor first — same reasoning as the Reprocessing Plant's
    // own draw order: the one closest to jamming is the one to relieve.
    sources.sort((a, b) => (b._spentFuel || 0) - (a._spentFuel || 0));
    return sources;
  }

  // Re-stamp the OUT belt so a Reprocessing Plant downstream can BFS back
  // to this pool. Uses the SAME flag and source field the reactor uses
  // (_isSpentFuelConveyor / _spentFuelConveyorSource) so consumers need to
  // know nothing about pools to accept one as a supply — they just follow
  // the reference and ask whatever is on the end of it for fuel.
  // NuclearSystem.clearWasteFlags() wipes these every tick and the reactors
  // re-mark before this runs, so a pool always overwrites the stretch of
  // belt past its own OUT stub. That is deliberate: fuel on that stretch
  // came out of the pool, not straight off a reactor.
  function markOutBelt(e) {
    const def = EntityDefs[T.SPENTFUELPOOL];
    const { spentOut } = getStubs(e);
    const rot = e._rotation || 0;
    const inward = (rot === 0) ? { c: spentOut.c, r: spentOut.r - 1 }
                 : (rot === 1) ? { c: spentOut.c + 1, r: spentOut.r }
                 : (rot === 2) ? { c: spentOut.c, r: spentOut.r + 1 }
                               : { c: spentOut.c - 1, r: spentOut.r };
    e._outLinked = false;
    const visited = new Set();
    const queue = [{ c: spentOut.c, r: spentOut.r, d: 0, fromC: inward.c, fromR: inward.r }];
    while (queue.length) {
      const { c, r, d, fromC, fromR } = queue.shift();
      const key = `${c},${r}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const tile = GridManager.getEntity(c, r);
      if (!tile || !isConveyorTile(tile)) continue;
      tile._isSpentFuelConveyor     = true;
      tile._spentFuelConveyorDist   = d;
      tile._spentFuelConveyorSource = e;
      tile._spentFuelFlowDC         = Math.sign(c - fromC);
      tile._spentFuelFlowDR         = Math.sign(r - fromR);
      tile._flowRate                = def.outRate;
      e._outLinked = true;
      for (const [dc, dr] of beltSteps(c, r))
        queue.push({ c: c+dc, r: r+dr, d: d + 1, fromC: c, fromR: r });
    }
  }

  return {
    tick(e, dt) {
      const def = EntityDefs[T.SPENTFUELPOOL];
      if (!def) return;
      _ensure(e);

      const cap = def.spentFuelCapacity || 400;
      const sources = sourcesOnBelt(e);
      e._hasSpentFuel = sources.length > 0;
      // Belted to a pool means trucks leave this reactor alone (haulBlocked).
      // Stamped regardless of power, so a pool losing power doesn't send a
      // truck to cart off fuel that is waiting for it.
      for (const rx of sources) rx._feedsPool = true;

      // Marked unconditionally, so a Reprocessing Plant sees the physical
      // connection whether or not the pool happens to hold anything yet —
      // the same cold-start bootstrap the rest of the chain allows.
      markOutBelt(e);

      if (dt <= 0 || !online(e)) return;

      // ── Cooling clock ──
      // Power drives circulation. With it off the fuel already in the pool
      // is perfectly safe, but nothing cools and nothing new can come in.
      if (e.powered) {
        let promoted = 0;
        const coolS = def.coolSeconds || 240;
        for (const b of e._batches) b.t += dt;
        while (e._batches.length && e._batches[0].t >= coolS) {
          promoted += e._batches[0].a;
          e._batches.shift();
        }
        e._ready += promoted;
        BeltCargo.produced(e, 'spent', promoted);
      }

      // ── Intake ──
      // Deliberately does NOT require the reactor to be powered: this is
      // fuel it has already burned, sitting in its cask store, and an
      // offline reactor is exactly the one whose backlog needs clearing.
      let held = e._ready;
      for (const b of e._batches) held += b.a;
      const room = Math.max(0, cap - held);
      if (e.powered && room > 0) {
        const want = Math.min(def.intakeRate * dt, room);
        let taken = 0;
        for (const rx of sources) {
          if (taken >= want) break;
          const avail = rx._spentFuel || 0;
          let take  = Math.min(avail, want - taken);
          const share = BeltShare.cap(rx, e, avail, want - taken, 'spent');   // claimed even from an empty store
          if (take <= 0) continue;
          if (!BeltCargo.reach(rx, e, 'spent')) continue;   // still on its way along the belt
          take = Math.min(take, share);
          if (take <= 0) continue;
          rx._spentFuel = avail - take;
          BeltCargo.moved(rx, e, 'spent', take);
          taken += take;
        }
        if (taken > 0) {
          // Merge into the newest batch while it is still young, so the
          // queue length stays bounded no matter how long the pool runs.
          const newest = e._batches[e._batches.length - 1];
          if (newest && newest.t < BATCH_GRANULARITY) newest.a += taken;
          else e._batches.push({ a: taken, t: 0 });
          e._intakeThisTick = taken;
        } else {
          e._intakeThisTick = 0;
        }
      } else {
        e._intakeThisTick = 0;
      }

      // Panel/renderer readouts.
      e._cooling = 0;
      for (const b of e._batches) e._cooling += b.a;
      e._total   = e._cooling + e._ready;
      e._fillPct = (e._total / cap) * 100;
      // Seconds until the next batch is reprocessable, or null if there is
      // nothing cooling. Gives the panel something better than a bare count.
      e._nextReadyIn = e._batches.length
        ? Math.max(0, (def.coolSeconds || 240) - e._batches[0].t) : null;
      // A pool sitting full is a real failure state — it means the reactors
      // behind it are about to jam — so it warns like any other waste store.
      checkWasteBuildup(e, e._fillPct, 'Spent fuel');
    },

    // ── Consumer side ────────────────────────────────────────────────
    // True if `ent` is a pool with cooled fuel that a belt walk reached
    // through its OUT stub. Mirrors SolidStorageSystem.isSourceOf.
    isSourceOf(ent, pc, pr) {
      return !!ent && ent.type === T.SPENTFUELPOOL && online(ent)
          && (ent._ready || 0) > 0
          && (pc === undefined || isOutStub(ent, pc, pr));
    },

    // Draw up to `need` units of COOLED fuel; returns what it got. Fuel
    // still on the clock is not offered at all — that is the limiter.
    // `dt` is the caller's tick length, so the def's outRate is a real
    // units-per-SECOND ceiling rather than a per-call one (which would mean
    // something different at every frame rate). Callers that genuinely have
    // no timestep may omit it and get the rate-limit skipped.
    draw(pool, need, dt) {
      _ensure(pool);
      const def = EntityDefs[T.SPENTFUELPOOL];
      if (!online(pool) || need <= 0) return 0;
      const ceiling = (dt === undefined) ? Infinity : (def.outRate || 0.5) * dt;
      const take = Math.min(need, pool._ready, ceiling);
      if (take <= 0) return 0;
      pool._ready -= take;
      if (pool._ready < 0.0001) pool._ready = 0;
      pool._outThisTick = (pool._outThisTick || 0) + take;
      return take;
    },

    resetTickFlags() {
      for (const e of EntityRegistry.getByType(T.SPENTFUELPOOL)) e._outThisTick = 0;
      // Re-stamped by tick() for every reactor still on a pool's IN belt.
      for (const type of NuclearSystem.REACTOR_TYPES)
        for (const rx of EntityRegistry.getByType(type)) rx._feedsPool = false;
    },

    total,
    getStubs,
    // Save/load: the batch queue is the state that matters. Rounded on the
    // way out so a save doesn't carry 15 decimal places per batch.
    serialise(e) {
      _ensure(e);
      return { ready: e._ready, batches: e._batches.map(b => ({ a: b.a, t: b.t })) };
    },
    restore(e, data) {
      e._batches = (data && Array.isArray(data.batches))
        ? data.batches.map(b => ({ a: b.a || 0, t: b.t || 0 })) : [];
      e._ready = (data && data.ready) || 0;
    },
  };
})();
