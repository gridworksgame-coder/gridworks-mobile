/* ═══════════════════════════════════════════════════════════════════
   STORAGE CONTAINER (solids)
   The belt-fed counterpart of the Liquid Storage Tank. A 5×5 bulk bin
   with a conveyor IN stub on its left face and an OUT stub on its right.

   It banks ANY belt-carried solid — coal, the three ores, lithium
   compound, uranium fuel rods, fusion fuel pellets — one kind at a time
   (`_solidType`, cleared when it empties). Whatever consumes that solid
   always eats first and the bin takes the surplus:
     • Coal is pushed in by the mines themselves (CoalSystem.tickMine),
       which feed their generators first, and pushed back out to hoppers
       here in tick().
     • Everything else is PULLED in here from a producer on the IN belt
       (or from another bin whose OUT stub that belt comes from, so bins
       chain), and from a producer only the stock it holds above a small
       reserve (a few seconds of its output — see RESERVE_SECONDS),
       so a plant drawing straight off that producer is never starved by
       a bin hoarding its output. Consumers then find the bin on their own
       input belt exactly like they find the producer (see KINDS below).

   That makes a bin useful the same way it is for coal: it keeps a plant
   running through a mine outage, a power cut upstream, or a worked-out
   deposit, for as long as the stock lasts.

   Passive like the liquid tank: it needs no power, and only a lightning
   strike takes it offline.
   ═══════════════════════════════════════════════════════════════════ */

const SolidStorageSystem = (() => {
  const CAPACITY = 1000;  // units of ore (was 600 — raised so the fusion chain's larger lithium goals need a few bins, not a wall of them)
  const OUT_RATE = 90;    // max units/s it can discharge through its OUT stub
  // A belt hand-off can't outrun the belt: what one carries of this kind
  // (BeltCargo.rate), but never less than twice what feeds it (its producer's
  // rate, or `need`) so a line running flat out is never throttled. Without
  // this a fresh bin swallowed a producer's whole banked buffer in one tick.
  function beltRate(kind, need = 0) {
    const belt = typeof BeltCargo !== 'undefined' && BeltCargo.rate ? BeltCargo.rate(kind) : Infinity;
    const prod = KINDS[kind] && KINDS[kind].rate ? KINDS[kind].rate() : 0;
    return Math.min(IN_RATE, Math.max(belt, 2 * prod, 2 * need));
  }
  const IN_RATE  = 90;    // max units/s it can pull in through its IN stub
  // Coal a container's line burns: the generators and coke ovens on its OUT
  // belt, and those fed by every container further down it. Counting only
  // its own belt, a container that feeds another container saw no need at
  // all and handed on coal at the bare belt rate (3/s), so a stock pile one
  // bin back from a row of five generators (3.75/s at Normal) kept them all
  // running short, taking turns to fire, with a full bin behind them.
  function _lineNeed(e, seen = new Set()) {
    if (seen.has(e)) return 0;
    seen.add(e);
    const { gens, bins, ovens } = CoalSystem.beltTargets(ports(e).out);
    let need = gens.length * (EntityDefs[T.COALGENERATOR].coalPerSecond || 0.75)
             + ovens.length * (EntityDefs[T.COKEOVEN].coalPerSec || 1.5);
    for (const b of bins) if (b !== e) need += _lineNeed(b, seen);
    return need;
  }
  // Left on the producer for its own direct consumers before a bin takes
  // any surplus: RESERVE_SECONDS of its output, capped at RESERVE_FRAC of
  // its buffer. This was a flat fifth of the buffer, which for a Uranium
  // Mine (500 buffer, 0.8/s) meant 100 units had to pile up first — over
  // three minutes of a belt branch to a bin sitting empty while the plant
  // on the other branch was fed, which read as the split not working. A few
  // seconds of stock is plenty: the producer keeps making more, and the
  // plant drawing off it still comes first.
  const RESERVE_FRAC = 0.2;
  const RESERVE_SECONDS = 10;

  // Every belt-carried solid: which building makes it, the buffer field it
  // sits in, how big that buffer is, and the conveyor flag that marks belts
  // carrying it (used by consumers' BFS and by the belt renderer).
  // Coal is deliberately absent: mines push it (they feed generators first),
  // and its belts are detected by chain-walking rather than a flag.
  const KINDS = {
    uranium:  { type: () => T.URANIUMMINE,         field: '_uraniumStored', flag: '_isUraniumConveyor',        cap: () => MINE_BUFFER_CAP,                                    rate: () => ORE_MINE_RATE },
    sulfur:   { type: () => T.SULFURMINE, alt: () => T.SULFURMINE2, field: '_sulfurStored',  flag: '_isSulfurConveyor',         cap: () => MINE_BUFFER_CAP,                                    rate: () => ORE_MINE_RATE },
    lithium:  { type: () => T.LITHIUMMINE,         field: '_lithiumStored', flag: '_isLithiumConveyor',        cap: () => MINE_BUFFER_CAP,                                    rate: () => LITHIUM_MINE_RATE },
    compound: { type: () => T.LITHIUMPROCESSPLANT, field: '_compound',      flag: '_isLithiumCompoundConveyor', cap: () => EntityDefs[T.LITHIUMPROCESSPLANT].compoundCapacity || 300, rate: () => EntityDefs[T.LITHIUMPROCESSPLANT].compoundPerSec },
    rods:     { type: () => T.FUELPLANT,           field: '_rods',          flag: '_isRodConveyor',            cap: () => EntityDefs[T.FUELPLANT].rodCapacity || 150,          rate: () => EntityDefs[T.FUELPLANT].rodPerSec },
    pellets:  { type: () => T.FUSIONFUELPLANT,     field: '_plasma',        flag: '_isPlasmaFuelConveyor',     cap: () => EntityDefs[T.FUSIONFUELPLANT].plasmaCapacity || 400, rate: () => EntityDefs[T.FUSIONFUELPLANT].plasmaPerSec },
    // The Fuel Plant's second output since the split: D-He3 pellets off D-He3
    // OUT. Its own kind (not 'pellets' with a mode) so a bin can never mix
    // them, and told apart from the D-T belt by its flag, like the
    // Reprocessing Plant's two products.
    he3pellets: { type: () => T.FUSIONFUELPLANT,   field: '_he3Pellets',    flag: '_isHe3PelletConveyor',      cap: () => EntityDefs[T.FUSIONFUELPLANT].he3PelletCapacity || 200, rate: () => EntityDefs[T.FUSIONFUELPLANT].plasmaPerSec * (EntityDefs[T.FUSIONFUELPLANT].he3PelletShare || 0.25) },
    // Reprocessing Plant products. Recovered uranium is deliberately a
    // SEPARATE kind from mined `uranium` rather than more of the same pile:
    // it only partially substitutes for ore at the Fuel Processing Plant,
    // and a bin holds one kind at a time, so keeping them distinct is what
    // stops the two stocks quietly merging into one.
    // Plutonium being bankable here is also what gives it somewhere to sit
    // as a stockpile — which is what a contamination hazard needs to exist.
    // (Spent fuel is deliberately NOT in this table: a generic container
    // must not be able to bank it, or the waste pressure disappears.)
    recovered: { type: () => T.REPROCESSOR, field: '_recovered', flag: '_isRecoveredConveyor', cap: () => EntityDefs[T.REPROCESSOR].recoveredCapacity || 200, rate: () => EntityDefs[T.REPROCESSOR].spentFuelPerSec * EntityDefs[T.REPROCESSOR].recoveredPerUnit },
    plutonium: { type: () => T.REPROCESSOR, field: '_plutonium', flag: '_isPlutoniumConveyor', cap: () => EntityDefs[T.REPROCESSOR].plutoniumCapacity || 100, rate: () => EntityDefs[T.REPROCESSOR].spentFuelPerSec * EntityDefs[T.REPROCESSOR].plutoniumPerUnit },
    // MOX rods, from Advanced Fuel Processing. Bankable exactly like uranium
    // fuel rods are — a finished fuel, not a waste stream.
    mox:       { type: () => T.MOXPLANT,    field: '_mox',       flag: '_isMoxConveyor',       cap: () => EntityDefs[T.MOXPLANT].moxCapacity || 300,         rate: () => EntityDefs[T.MOXPLANT].moxPerSec },
    // Field Core chain (rare_earth_systems.js). Thorium tailings are
    // deliberately NOT here, for the reason spent fuel isn't: a bin that
    // could bank them would take the pressure off the waste haul.
    rareearth: { type: () => T.RAREEARTHMINE, field: '_rareEarthStored', flag: '_isRareEarthConveyor', cap: () => MINE_BUFFER_CAP,                             rate: () => ORE_MINE_RATE },
    oxide:     { type: () => T.LEACHPLANT,    field: '_oxide',           flag: '_isOxideConveyor',     cap: () => EntityDefs[T.LEACHPLANT].oxideCapacity || 300, rate: () => EntityDefs[T.LEACHPLANT].oxidePerSec },
    tape:      { type: () => T.SCMILL,        field: '_tape',            flag: '_isTapeConveyor',      cap: () => EntityDefs[T.SCMILL].tapeCapacity || 300,      rate: () => EntityDefs[T.SCMILL].tapePerSec },
    // Coke Oven Battery (coke_oven_system.js).
    coke:      { type: () => T.COKEOVEN,      field: '_coke',            flag: '_isCokeConveyor',      cap: () => EntityDefs[T.COKEOVEN].cokeCapacity || 300,    rate: () => EntityDefs[T.COKEOVEN].cokePerSec },
    graphite:  { type: () => T.GRAPHITEFURNACE, field: '_graphite',      flag: '_isGraphiteConveyor',  cap: () => EntityDefs[T.GRAPHITEFURNACE].graphiteCapacity || 200, rate: () => EntityDefs[T.GRAPHITEFURNACE].graphitePerSec },
  };
  // Which solid a producer is offering to a bin that reached it along
  // `fromTile`. Most producers make exactly one kind, so the belt tile is
  // irrelevant. The Reprocessing Plant makes TWO (recovered uranium and
  // plutonium, on two separate OUT belts), so for it the answer depends on
  // which of those belts the walk actually arrived on — matching the kind
  // to the flag the producer stamped on that tile. A producer with several
  // kinds reached along an unflagged tile offers nothing rather than
  // guessing, which is what stops a bin on the plutonium belt quietly
  // draining the recovered-uranium buffer instead.
  const kindOfProducer = (ent, fromTile) => {
    if (!ent) return null;
    const matches = [];
    // `alt`: a second mark of the same producer (the Sulfur Mine MK2).
    for (const k in KINDS) if (KINDS[k].type() === ent.type || (KINDS[k].alt && KINDS[k].alt() === ent.type)) matches.push(k);
    if (matches.length <= 1) return matches[0] || null;
    if (!fromTile) return null;
    for (const k of matches) if (fromTile[KINDS[k].flag]) return k;
    return null;
  };
  // Human-readable, for the info panel and compendium.
  const LABELS = { coal: 'Coal', uranium: 'Uranium Ore', sulfur: 'Sulfur Ore', lithium: 'Lithium Ore',
                   compound: 'Lithium Compound', rods: 'Fuel Rods', pellets: 'Fuel Pellets', he3pellets: 'D-He3 Fuel Pellets',
                   recovered: 'Recovered Uranium', plutonium: 'Plutonium', mox: 'MOX Fuel Rods',
                   rareearth: 'Rare Earth Ore', oxide: 'Rare Earth Oxide', tape: 'HTS Tape', coke: 'Coke', graphite: 'Graphite' };

  function online(e) { return !!e && !e._lightningDamaged; }

  // Conveyor stub tiles, just outside the footprint: IN on the left face,
  // OUT on the right face, both on the middle row so a belt runs straight
  // through (IN used to sit a row from the top, OUT a row from the bottom). An odd
  // rotation (R while placing) mirrors both: IN on the right face, OUT on
  // the left. Every system finds the stubs through here, so the flip only
  // lives in this function and the renderer's mirror.
  function ports(e) {
    const w = e.width || 5, h = e.height || 5;
    const flip = ((e._rotation || 0) % 2) === 1;
    const inR = e.row + Math.floor(h / 2), outR = inR;
    // inInside/outInside: the footprint cells directly behind each stub --
    // what a flood-fill that steps from the stub into the building lands on.
    return flip ? {
      in:  { c: e.col + w, r: inR },  inInside:  { c: e.col + w - 1, r: inR },
      out: { c: e.col - 1, r: outR }, outInside: { c: e.col,         r: outR },
    } : {
      in:  { c: e.col - 1, r: inR },  inInside:  { c: e.col,         r: inR },
      out: { c: e.col + w, r: outR }, outInside: { c: e.col + w - 1, r: outR },
    };
  }
  const isIn  = (e, c, r) => { const p = ports(e).in;  return p.c === c && p.r === r; };
  const isOut = (e, c, r) => { const p = ports(e).out; return p.c === c && p.r === r; };

  // No room while it is being emptied (StorageDrain): every way in, the
  // mines' push, the belt pull, drones and trucks, asks here first.
  function space(e) { return online(e) && !e._draining ? Math.max(0, CAPACITY - (e._stored || 0)) : 0; }

  // Accept up to `amount` units into the container; returns what it took.
  function deposit(e, amount, kind = 'coal') {
    // One solid at a time: a bin with stock in it refuses anything else, so
    // a belt carrying something different can't quietly relabel the pile.
    if ((e._stored || 0) > 0.001 && e._solidType && e._solidType !== kind) return 0;
    const take = Math.min(amount, space(e));
    if (take <= 0) return 0;
    e._stored = (e._stored || 0) + take;
    e._solidType = kind;
    e._inThisTick = (e._inThisTick || 0) + take;
    return take;
  }

  // Stock a producer keeps back from a bin's belt pull (see RESERVE_SECONDS).
  function reserveOf(kind) {
    const K = KINDS[kind];
    return K ? Math.min(K.cap() * RESERVE_FRAC, K.rate() * RESERVE_SECONDS) : 0;
  }

  // ── Non-coal intake ──────────────────────────────────────────────
  // Walk the IN belt back to a producer and pull its surplus. Only stock
  // above the producer's reserve (see RESERVE_SECONDS) is surplus, so whatever
  // draws straight off it keeps priority over the bin.
  function _pullFromBelt(e, dt) {
    if (dt <= 0 || !online(e)) return;
    const room = space(e);
    if (room <= 0) return;
    const inStub = ports(e).in;
    // `prev` is the tile the walk stepped from — needed to tell apart the
    // two OUT belts of a producer that makes more than one solid.
    const run = beltRun(inStub.c, inStub.r);
    // Every source on the belt is drawn from each tick, nearest first, out of
    // one shared allowance: the room left, and per solid what one belt carries
    // (all of them arrive on this one IN belt). It used to stop at the first
    // source that had anything, so on a belt two plants feed, the nearer one —
    // which has a sliver of new output every tick — was the only one ever
    // drawn, and the further one's output piled up for good. A source whose
    // stream is still on its way (BeltCargo.reach) is skipped, not waited on.
    let left = room;
    const budget = {};
    const allow = (kind) => (budget[kind] ??= beltRate(kind) * dt);
    for (let _i = 0; _i < run.n && left > 0; _i++) {
      const ent = run.ent[_i], _p = run.par[_i];
      const prev = _p < 0 ? null : run.ent[_p];
      // Bin to bin. The walk has come up this bin's IN belt and arrived at
      // another Storage Container through THAT bin's OUT stub: take from its
      // stock, so a row of bins belted OUT to IN passes its contents down
      // the line to whatever the last one feeds. Before this only producers
      // counted as a source, so a bin behind a full one stayed empty and the
      // plant at the end of the row starved beside three full bins. An
      // upstream bin keeps no reserve (it is storage, not a producer with
      // consumers of its own), and coal is left to its mines' push, which
      // already carries on down a row of bins (see tick below).
      if (ent.type === T.SOLIDSTORAGE) {
        if (ent === e || !online(ent) || !((ent._stored || 0) > 0.001)) continue;
        const from = prev ? { c: prev.col, r: prev.row } : inStub;   // no belt between: the stubs coincide
        if (!isOut(ent, from.c, from.r)) continue;
        const bk = ent._solidType;
        if (!bk || bk === 'coal') continue;
        if (e._stored > 0.001 && e._solidType && e._solidType !== bk) continue;
        const bMode = bk === 'pellets' ? (ent._pelletMode || 'dt') : null;
        if (bMode && e._stored > 0.001 && (e._pelletMode || 'dt') !== bMode) continue;
        if (!BeltCargo.reach(ent, e, bk)) continue;   // still on its way along the belt
        const _want = Math.min(ent._stored, allow(bk), left);
        const took = deposit(e, Math.min(_want, BeltShare.cap(ent, e, ent._stored, _want, bk)), bk);
        if (took > 0) {
          ent._stored -= took;
          ent._outThisTick = (ent._outThisTick || 0) + took;
          BeltCargo.moved(ent, e, bk, took);
          if (bMode) e._pelletMode = bMode;
          if ((ent._stored || 0) <= 0.001) { ent._stored = 0; ent._solidType = null; }
          left -= took; budget[bk] -= took;
        }
        continue;
      }
      const kind = kindOfProducer(ent, prev);
      if (kind) {
        // A bin already holding something else won't take this.
        if (e._stored > 0 && e._solidType && e._solidType !== kind) continue;
        // Fuel pellets come in two fuels that don't mix: a bin holding D-T
        // pellets won't take D-He3 ones (and vice versa), and it remembers
        // which it holds so the reactor burns them as the right fuel.
        const pelletMode = kind === 'pellets' ? (ent._fuelMode === 'dhe3' ? 'dhe3' : 'dt') : null;
        if (pelletMode && e._stored > 0.001 && (e._pelletMode || 'dt') !== pelletMode) continue;
        const K = KINDS[kind];
        const surplus = (ent[K.field] || 0) - reserveOf(kind);
        if (surplus <= 0) continue;
        if (!BeltCargo.reach(ent, e, kind)) continue;   // still on its way along the belt
        const _want = Math.min(surplus, allow(kind), left);
        const took = deposit(e, Math.min(_want, BeltShare.cap(ent, e, surplus, _want, kind)), kind);
        ent[K.field] -= took;
        BeltCargo.moved(ent, e, kind, took);
        if (pelletMode && took > 0) e._pelletMode = pelletMode;
        left -= took; budget[kind] -= took;
        continue;
      }
    }
  }

  // Mark the OUT belt as carrying this bin's solid, so the belt renders
  // right and consumers whose BFS follows those flags can reach back to it.
  function _markOutBelt(e) {
    const kind = e._solidType;
    const K = kind && KINDS[kind];
    e._outBeltMarked = false;
    if (!K || (e._stored || 0) <= 0) return;
    const out = ports(e).out;
    const run = beltRun(out.c, out.r);
    // The first tile flows out of the footprint cell behind the stub. This
    // was the bin's centre (row + 2.5), and half a row off made that tile's
    // direction diagonal, which the belt renderer matches to no side and so
    // drew the tile running backward.
    const seed = ports(e).outInside;
    for (let i = 0; i < run.n; i++) {
      if (!run.belt[i]) continue;
      const tile = run.ent[i], c = run.c[i], r = run.r[i], pi = run.par[i];
      const fromC = pi < 0 ? seed.c : run.c[pi], fromR = pi < 0 ? seed.r : run.r[pi];
      tile[K.flag] = true;
      e._outBeltMarked = true;
      tile._flowDC = Math.sign(c - fromC);
      tile._flowDR = Math.sign(r - fromR);
      tile._flowRate = K.rate();
    }
  }

  // Re-flag the OUT belt of every bin holding `kind`. A producer system
  // wipes its conveyor flag off the whole map right before its own tick,
  // which comes after the bins have ticked — so the stretch of belt past a
  // bin was unflagged again by the time a consumer walked it, and a consumer
  // whose walk follows the flag (the Tritium Breeder, the reactor blanket)
  // never reached the bin it was belted to. Called straight after that wipe.
  // Not for a struck bin: it hands nothing out (isSourceOf), and a reactor
  // that sees a rod-marked belt with no bin behind it takes that as a Fuel
  // Plant's line and draws from one it has no belt to (hasRodConveyor).
  function remarkOutBelts(kind) {
    for (const e of EntityRegistry.getByType(T.SOLIDSTORAGE)) if (e._solidType === kind && online(e)) _markOutBelt(e);
  }

  // ── Consumer-side lookup ─────────────────────────────────────────
  // True if `ent` is a bin holding `kind` that a belt walk reached through
  // its OUT stub (arriving from the tile pc,pr). Consumers call this from
  // their own conveyor BFS and then draw from `_stored`.
  // A bin that held `kind` when it ticked still counts for the rest of that
  // tick after an earlier consumer has emptied it, so a consumer ticking later
  // still claims its BeltShare (and is given its part next tick). Without
  // that, the last machine on a short line dropped out of the claimants and
  // stayed out for as long as the line was short, whatever a splitter said.
  function isSourceOf(ent, kind, pc, pr) {
    if (!ent || ent.type !== T.SOLIDSTORAGE || !online(ent)) return false;
    const holds = ent._solidType === kind && (ent._stored || 0) > 0;
    const held  = ent._heldTick === SIM_TICK_ID && ent._heldKind === kind;
    return (holds || held) && (pc === undefined || isOut(ent, pc, pr));
  }

  // Draw up to `need` of `kind` from a list of bins; returns what it got.
  // `dst` (the building drawing) and `kind` only feed the belt picture
  // (BeltCargo) — the draw itself doesn't need them.
  function drawFrom(bins, need, dst, kind) {
    let taken = 0;
    for (const b of bins) {
      if (taken >= need) break;
      let take = Math.min(need - taken, b._stored || 0);
      const share = dst ? BeltShare.cap(b, dst, b._stored || 0, need - taken, kind || b._solidType) : Infinity;   // fair share of a shared bin, claimed even while it is empty
      if (take <= 0) continue;
      if (dst && !BeltCargo.reach(b, dst, kind || b._solidType)) continue;   // still on its way along the belt
      take = Math.min(take, share);
      if (take <= 0) continue;
      b._stored -= take;
      b._outThisTick = (b._outThisTick || 0) + take;
      taken += take;
      if (dst) BeltCargo.moved(b, dst, kind || b._solidType, take);
      if ((b._stored || 0) <= 0.001) { b._stored = 0; b._solidType = null; }
    }
    return taken;
  }

  // Per tick, before any mine ticks: reset the per-tick flow counters.
  function resetTickFlags() {
    for (const e of EntityRegistry.getByType(T.SOLIDSTORAGE)) { e._inThisTick = 0; e._outThisTick = 0; }
  }

  // Discharge stock through the OUT stub to whatever its belt reaches.
  // Runs after the mines (which fill it) and before the generators (which
  // burn what it delivered).
  function tick(e, dt) {
    // A client's stocked pellet bin on a contract job site is kept topped up
    // while the crew is there (3 pellets/s, six reactors' burn). A D-T Fusion
    // Reactor burns half a pellet a second whether or not anything is drawing
    // its steam, so a fixed stock could run dry before the rest of the job
    // was wired, on a job the crew was never paid to make fuel for.
    // A scenario's client bin (Field Strength) is kept topped up the same way.
    if (dt > 0 && e._clientOwned && e._pelletMode && (e._solidType === 'pellets' || !e._solidType)
        && ((typeof ContractSystem !== 'undefined' && ContractSystem.isAtSite && ContractSystem.isAtSite()
             && !(ContractSystem.ownFuelJob && ContractSystem.ownFuelJob()))
            || (typeof ScenarioSystem !== 'undefined' && ScenarioSystem.active()))) {
      e._stored = Math.min(CAPACITY, (e._stored || 0) + 3 * dt);
      e._solidType = 'pellets';
    }
    if (e._draining) e._outThisTick = (e._outThisTick || 0) + StorageDrain.tick(e, dt);
    if ((e._stored || 0) <= 0.001) { e._stored = 0; e._solidType = null; }
    if (e._stored > CAPACITY) e._stored = CAPACITY;   // saves from when it held 3,000

    // Everything except coal is pulled in here (coal's mines push it), and
    // its OUT belt is flagged so consumers and the renderer can follow it.
    _pullFromBelt(e, dt);
    // What it held this tick, for isSourceOf after a consumer has emptied it.
    e._heldKind = e._solidType || null;
    e._heldTick = SIM_TICK_ID;
    if (e._solidType && e._solidType !== 'coal') {
      _markOutBelt(e);
      e._outLinked = !!e._outBeltMarked;
      e._pushing = (e._outThisTick || 0) > 0.0001;   // set by consumers drawing (drawFrom)
      _smoothRates(e, dt);
      return;
    }

    const out = ports(e).out;
    const { gens, bins, ovens } = CoalSystem.beltTargets(out);
    e._outLinked = gens.length > 0 || ovens.length > 0 || bins.some(b => b !== e);
    e._pushing = false;

    if (online(e) && dt > 0 && e._stored > 0) {
      // Stock on hand counts as a live feed for every generator it reaches,
      // same as a powered mine would (CoalSystem.tickGenerator only burns
      // hopper coal for generators flagged this way).
      for (const g of gens) g._fedByPoweredMine = true;

      // At belt pace, but enough to keep every generator and oven on the line going.
      const genNeed = _lineNeed(e);
      let budget = Math.min(e._stored, Math.min(OUT_RATE, beltRate('coal', genNeed)) * dt);
      const cap = CoalSystem.getHopperCapacity();
      // Generators first, split by hopper room...
      const withRoom = [];
      let total = 0;
      for (const g of gens) {
        if (g._hopperCoal === undefined) g._hopperCoal = 0;
        const room = cap - g._hopperCoal;
        if (room > 0 && BeltCargo.reach(e, g, 'coal')) { withRoom.push({ g, room }); total += room; }
      }
      let moved = 0;
      if (total > 0) {
        const give = Math.min(budget, total);
        for (const { g, room } of withRoom) {
          g._hopperCoal += give * (room / total);
          BeltCargo.moved(e, g, 'coal', give * (room / total));
        }
        moved += give; budget -= give;
      }
      // ...then Coke Ovens, into their bunkers...
      if (ovens.length && budget > 0) {
        const took = CokeOvenSystem.pushCoal(e, ovens, budget);
        moved += took; budget -= took;
      }
      // ...then any further containers down the line.
      for (const b of bins) {
        if (budget <= 0) break;
        if (b === e) continue;
        if (!BeltCargo.reach(e, b, e._solidType || 'coal')) continue;
        const took = deposit(b, budget, e._solidType || 'coal');
        BeltCargo.moved(e, b, e._solidType || 'coal', took);
        moved += took; budget -= took;
      }
      e._stored -= moved;
      e._outThisTick += moved;
      e._pushing = moved > 0.0001;
    }

    _smoothRates(e, dt);
  }

  // Smoothed rates for the info panel (units/s).
  function _smoothRates(e, dt) {
    if (dt <= 0) return;
    const k = Math.min(1, dt * 2);
    e._inRate  = (e._inRate  || 0) + (((e._inThisTick  || 0) / dt) - (e._inRate  || 0)) * k;
    e._outRate = (e._outRate || 0) + (((e._outThisTick || 0) / dt) - (e._outRate || 0)) * k;
  }

  return { CAPACITY, OUT_RATE, online, ports, isIn, isOut, space, deposit, resetTickFlags, tick,
           isSourceOf, drawFrom, remarkOutBelts, label: (k) => LABELS[k] || null, KINDS, reserveOf };
})();
