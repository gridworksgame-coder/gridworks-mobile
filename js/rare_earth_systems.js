/* ═══════════════════════════════════════════════════════════════════
   RARE EARTH SYSTEMS
   The head of the Field Core chain (docs/FIELD_CORE_SPEC.md):
     Rare Earth Deposit → Rare Earth Mine → Leach Plant → (oxide)

   The scan, deposit and mine are the Uranium Mine's, kind for kind: the
   same ORE_MINE_RATE, 4×5 footprint, OUT stub at the end of the rail and
   ore-body sizing (placeOreDeposits / drainOreDeposit), so a rare earth
   line behaves like every other ore line the player has already built.

   The Leach Plant is the Fuel Processing Plant's shape — ore on a belt and
   sulfuric acid by pipe in, a solid out on a belt — with one extra stream:
   thorium tailings. Monazite carries thorium, so leaching it leaves a
   mildly radioactive residue. That accrues in `_tailings` and is
   registered in WASTE_CFG against the Nuclear Waste Processing Facility,
   the way the Reprocessing Plant's HLW is, so truck and drone hauling and
   the "can't demolish a building full of waste" rule come with it. A full
   tailings store stops the plant, like every other waste source.
   ═══════════════════════════════════════════════════════════════════ */

const RareEarthSystem = (() => {
  let rareEarthScans = 0;
  let totalRareEarthMined = 0;

  // Dearer than lithium's $300k: the scan opens with the Advanced Fusion Reactor burning.
  // Escalates ×1.25 per scan, the same curve as every other ore scan. Only a
  // Survey Station MK2 runs it, and the MK2 takes 25% off (scanDiscount), so
  // the base is set for $500,000 at the dish.
  const FIRST_SCAN_COST = 500000 / 0.75;

  function spawnRareEarthDeposits() {
    if (!Progression.isUnlocked(T.RAREEARTHSCAN)) return 0;
    const tiers = [
      { size: 2, label: 'Small Rare Earth Deposit',  chance: 0.60 },
      { size: 3, label: 'Medium Rare Earth Deposit', chance: 0.32 },
      { size: 4, label: 'Large Rare Earth Deposit',  chance: 0.08 },
    ];
    const roll = Math.random();
    let tier = tiers[0];
    let acc = 0;
    for (const t of tiers) { acc += t.chance; if (roll < acc) { tier = t; break; } }

    // A late, expensive scan: at least 1, 30% chance of 2.
    const count = 1 + (Math.random() < 0.3 ? 1 : 0);
    return placeOreDeposits(T.RAREEARTHDEPOSIT, tier, count, ORE_MINE_RATE, '_rareEarthPhase');
  }

  return {
    getScanCost()     { const c = Math.round(FIRST_SCAN_COST * Math.pow(1.25, rareEarthScans)); return typeof Difficulty !== 'undefined' ? Difficulty.price(c) : c; },
    isScanUnlocked()  { return Progression.isUnlocked(T.RAREEARTHSCAN); },
    getTotalScans()   { return rareEarthScans; },
    incrementScans()  { rareEarthScans++; },
    loadScans(v)      { if (v !== undefined) rareEarthScans = v; },
    spawnRareEarthDeposits,
    tickMine(e, dt) {
      if (!e.powered) return;
      // As the Uranium Mine: buffer capped at MINE_BUFFER_CAP, a full mine
      // stops digging until the plant (or a Storage Container) draws it
      // down, and a worked-out body idles the mine and its belt.
      if ((e._rareEarthStored || 0) > MINE_BUFFER_CAP) e._rareEarthStored = MINE_BUFFER_CAP;
      e._bufferFull = (e._rareEarthStored || 0) >= MINE_BUFFER_CAP;
      if (e._bufferFull || e._idleFull) return;
      const mined = drainOreDeposit(e, dt, 'rareearth');
      if (mined <= 0) return;
      e._rareEarthStored = Math.min(MINE_BUFFER_CAP, (e._rareEarthStored || 0) + mined);
      BeltCargo.produced(e, 'rareearth', mined);
      totalRareEarthMined += mined;

      markOreBelt(e, RareEarthSystem.outputPort(e), e.width || 4, e.height || 5,
        '_isRareEarthConveyor', '_rareEarthConveyorSource', ORE_MINE_RATE);
    },
    // The OUT stub: the tile just outside the end of the ore-cart rail on the
    // bottom row — bottom-right by default, bottom-left when flipped with R
    // (same convention as the Uranium Mine).
    outputPort(mine) {
      const w = mine.width || 4, h = mine.height || 5;
      const right = ((mine._rotation || 0) % 2) === 0;
      const c = right ? mine.col + w : mine.col - 1, r = mine.row + h - 1;
      return GridManager.inBounds(c, r) ? { c, r, right } : null;
    },
    isOutputPort(mine, c, r) {
      const p = this.outputPort(mine);
      return !!p && p.c === c && p.r === r;
    },
    getTotalMined() { return totalRareEarthMined; },
    loadMined(v)    { if (v !== undefined) totalRareEarthMined = v; },
    clearRareEarthConveyorFlags() {
      for (const e of EntityRegistry.getByType(T.CONVEYOR)) { e._isRareEarthConveyor = false; e._rareEarthConveyorSource = null; }
      for (const e of EntityRegistry.getByType(T.PIPE))     e._isRareEarthConveyor = false;
    },
    hasDeposits() {
      for (const e of EntityRegistry.getByType(T.RAREEARTHDEPOSIT)) return true;
      return false;
    },
  };
})();

// ─── Leach Plant ──────────────────────────────────────────────────
// Rare Earth Ore (belt) + Sulfuric Acid (pipe)
//   → Rare Earth Oxide (belt) + Thorium Tailings (truck/drone waste)
const LeachPlantSystem = (() => {
  let totalOxideProduced = 0;

  // All three stubs on the bottom face, like the Fuel Processing Plant (no
  // rotation): ore IN on the left, acid IN beside it, oxide OUT on the right
  // under the drying kiln.
  function getStubs(e) {
    const h = e.height || 9;
    return {
      oreIn:    { c: e.col + 1, r: e.row + h },
      acidIn:   { c: e.col + 3, r: e.row + h },
      oxideOut: { c: e.col + 7, r: e.row + h },
    };
  }

  // Acid reaching the ACID IN stub: a powered Chemical Plant whose ACID OUT
  // is on this line, and any Liquid Storage Tank holding acid on it. The
  // Fuel Processing Plant's rule, stub for stub (FuelPlantSystem.hasAcidPipe).
  function hasAcidPipe(e) {
    const { acidIn } = getStubs(e);
    const run = pipeRun(acidIn.c, acidIn.r, 'acid');
    let source = null;
    const tanks = [];
    const lines = new Map();   // each tank's OUT line, fetched once (see OilSystem.tanksBehind)
    for (let j = 0; j < run.pn; j++) {
      const nb = run.pe[j];
      if (nb.type === T.OILSTORAGE) {
        if (nb._liquidType != null && nb._liquidType !== 'acid') continue;
        if (typeof OilSystem === 'undefined' || !OilSystem.tankOnline(nb)) continue;
        const ports = OilSystem.resolveTankPorts(nb);
        const atIn  = run.ptc[j] === ports.in.c  && run.ptr[j] === ports.in.r;
        const atOut = run.ptc[j] === ports.out.c && run.ptr[j] === ports.out.r;
        if (!atIn && !atOut) continue;
        for (const tk of atIn ? [nb, ...OilSystem.tanksBehind(nb, 'acid', [], lines)] : [nb])
          if (tk._liquidType === 'acid' && (tk._crude || 0) > 0 && !tanks.includes(tk)) tanks.push(tk);
        continue;
      }
      if (nb.type !== T.CHEMICALPLANT || source) continue;
      const ao = ChemicalSystem.getStubs(nb).pipeStubs[1];
      if (run.ptc[j] === ao.c && run.ptr[j] === ao.r && (nb._acid || 0) > 0 && nb.powered) source = nb;
    }
    // Nothing drawn until the acid has visibly run down to ACID IN (see
    // FuelPlantSystem.hasAcidPipe); `stocked` still lights the line meanwhile.
    const arrived = pipeArrivedAt(acidIn.c, acidIn.r, 'acid');
    return { found: arrived && (!!source || tanks.length > 0), source: arrived ? source : null,
             tanks: arrived ? tanks : [], stocked: tanks.length > 0, run };
  }

  // Ore reaching the ORE IN stub: mines reached at their OUT stub or named
  // by a belt tile they stamped, and Storage Containers banking it.
  function hasOreConveyor(e) {
    const { oreIn } = getStubs(e);
    let found = false;
    const bins = [];
    const mines = [];
    const addMine = m => { if (m && m.type === T.RAREEARTHMINE && !mines.includes(m)) mines.push(m); };
    const run = beltRun(oreIn.c, oreIn.r);
    for (let _i = 0; _i < run.n; _i++) {
      const ent = run.ent[_i], _p = run.par[_i];
      const pc = _p < 0 ? null : run.c[_p], pr = _p < 0 ? null : run.r[_p];
      if (ent.type === T.RAREEARTHMINE) {
        if (ent.powered && pc !== null && RareEarthSystem.isOutputPort(ent, pc, pr)) { found = true; addMine(ent); }
        continue;
      }
      if (SolidStorageSystem.isSourceOf(ent, 'rareearth', pc, pr)) {
        if (!bins.includes(ent)) bins.push(ent);
        found = true;
        continue;
      }
      if (isConveyorTile(ent) && ent._isRareEarthConveyor) { found = true; addMine(ent._rareEarthConveyorSource); }
    }
    return { found, bins, mines };
  }

  // Which buffer is holding the plant up, or null. Any full output stops it:
  // backing up rather than venting is the rule every plant follows, and a
  // tailings store that overflowed into nothing would be the loophole the
  // waste chain exists to close.
  function blockedBy(e) {
    const def = EntityDefs[T.LEACHPLANT];
    if ((e._tailings || 0) >= (def.tailingsCapacity || 100)) return 'Thorium tailings';
    if ((e._oxide    || 0) >= (def.oxideCapacity    || 300)) return 'Rare earth oxide';
    return null;
  }

  return {
    tick(e, dt) {
      const def = EntityDefs[T.LEACHPLANT];
      if (!def) return;
      if (e._oxide    === undefined) e._oxide    = 0;
      if (e._tailings === undefined) e._tailings = 0;

      const acidResult = hasAcidPipe(e);
      e._hasAcid = acidResult.found;
      // Light the line from here while tank stock is on it, as the Fuel
      // Processing Plant does, so the pipe shows what it carries.
      if (acidResult.stocked) for (let i = 0; i < acidResult.run.n; i++) { const top = acidResult.run.top[i]; top._acidActive = true; top._flowRate = def.acidPerSec; }
      const oreResult = hasOreConveyor(e);
      e._hasOre = oreResult.found;

      // Mark the oxide belt unconditionally, so a Storage Container or the
      // next plant down the line sees the physical connection on a cold start.
      const { oxideOut } = getStubs(e);
      markOreBelt(e, oxideOut, e.width || 10, e.height || 9, '_isOxideConveyor', '_oxideConveyorSource', def.oxidePerSec);

      // The tailings store warns and blocks demolition through the same
      // helpers every other waste source uses.
      checkWasteBuildup(e, ((e._tailings || 0) / (def.tailingsCapacity || 100)) * 100, 'Thorium tailings');

      if (dt <= 0) return;
      e._running = false;
      e._blockedBy = blockedBy(e);
      if (!e.powered || !e._hasAcid || !e._hasOre) return;
      if (e._blockedBy || e._idleFull) return;

      // Acid first: whatever the line holds, up to a tick's worth, then the
      // ore it can leach is scaled to match (FuelPlantSystem's order).
      const acidNeed = def.acidPerSec * dt;
      let acidStock = acidResult.source ? (acidResult.source._acid || 0) : 0;
      for (const tk of acidResult.tanks) acidStock += tk._crude || 0;
      const acidHad = Math.min(acidNeed, acidStock);
      if (acidHad <= 0) return;
      const acidK = acidHad / acidNeed;

      const oFull = def.orePerSec * dt, oNeed = oFull * acidK;
      let oTaken = 0;
      for (const mine of oreResult.mines) {
        if (!mine.powered) continue;
        if (!BeltCargo.reach(mine, e, 'rareearth')) continue;   // still on its way along the belt
        const avail = mine._rareEarthStored || 0;
        const take  = Math.min(avail, oNeed - oTaken, BeltShare.cap(mine, e, avail, oNeed - oTaken, 'rareearth'));
        mine._rareEarthStored = avail - take;
        BeltCargo.moved(mine, e, 'rareearth', take);
        oTaken += take;
        if (oTaken >= oNeed) break;
      }
      if (oTaken < oNeed) oTaken += SolidStorageSystem.drawFrom(oreResult.bins, oNeed - oTaken, e, 'rareearth');
      const ratio = oFull > 0 ? oTaken / oFull : 0;
      if (ratio <= 0) return;

      let owe = acidNeed * ratio;
      const src = acidResult.source;
      if (src) {
        const take = Math.min(owe, src._acid || 0);
        src._acid = (src._acid || 0) - take; owe -= take;
        if (src._acid < 1e-6) src._acid = 0;
        src._acidPulled = true;
      }
      for (const tk of acidResult.tanks) {
        if (owe <= 1e-9) break;
        const take = Math.min(owe, tk._crude || 0);
        if (take <= 0) continue;
        tk._crude -= take; owe -= take;
        tk._outThisTick = (tk._outThisTick || 0) + take;
        if (tk._crude <= 0.001) { tk._crude = 0; tk._liquidType = null; }
      }

      const oxide = def.oxidePerSec * dt * ratio;
      e._oxide    = Math.min(def.oxideCapacity    || 300, e._oxide + oxide);
      e._tailings = Math.min(def.tailingsCapacity || 100, e._tailings + def.tailingsPerSec * dt * ratio);
      e._running  = true;
      BeltCargo.produced(e, 'oxide', oxide);
      totalOxideProduced += oxide;
    },

    clearOxideConveyorFlags() {
      for (const e of EntityRegistry.getByType(T.CONVEYOR)) { e._isOxideConveyor = false; e._oxideConveyorSource = null; }
      for (const e of EntityRegistry.getByType(T.PIPE))     e._isOxideConveyor = false;
    },

    outputFull(e) { return !!blockedBy(e); },
    getStubs,
    getTotalOxide()   { return totalOxideProduced; },
    loadTotalOxide(v) { if (v !== undefined) totalOxideProduced = v; },
  };
})();
