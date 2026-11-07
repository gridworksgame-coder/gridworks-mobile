/* ═══════════════════════════════════════════════════════════════════
   MINING SYSTEMS
   Uranium and sulfur deposit mining.
   ═══════════════════════════════════════════════════════════════════ */

// ─── Ore reserves ─────────────────────────────────────────────────
// Uranium, sulfur and lithium bodies are finite, but they are meant to outlast
// a coal seam by a wide margin: a medium coal deposit runs roughly 1–5 hours
// of continuous mining, so an ore body is sized in hours per footprint tile
// instead of tonnes. At each mine's own rate that comes out around
//   small (2×2) ~6h    medium (3×3) ~13.5h    large (4×4) ~24h
// of POWERED mining — several times a coal seam at every tier. The reserve
// scales with the mine's rate, so lithium (15/s) lasts exactly as long as
// uranium and sulfur (0.8/s) before the life multipliers below stretch each
// kind by its own amount. Mines run at full rate until the body is empty.
// Move ORE_LIFE_SECONDS_PER_TILE to retune all of them at once.
const ORE_MINE_RATE             = 0.8;    // units/sec, uranium and sulfur mines
const LITHIUM_MINE_RATE         = 15;     // units/sec, lithium mine
const ORE_LIFE_SECONDS_PER_TILE = 5400;   // 1.5 in-game hours per footprint tile

// Ore bodies drain slower than they yield, so a body lasts longer at the same
// mine output. Tuned on the drain side (like the coal seam's DEPOSIT_LIFE_MULT
// in coal_system.js) so the change reaches deposits already on the map, not
// just newly generated ones.
const ORE_LIFE_MULT         = 1.5;    // sulfur
const URANIUM_ORE_LIFE_MULT = 1.75;   // uranium bodies stretch a little further
const LITHIUM_ORE_LIFE_MULT = 2.55;   // 1.5 × 1.7: lithium bodies last 70% longer than they did
const HELIUM_ORE_LIFE_MULT  = 3.36;   // 1.5 × 1.6 × 1.4: helium gas fields last 60% longer, then 40% longer again

// The ore mines are 4×5, so two deposits within that span would each sit in
// the other's mine footprint. The placement rules cover a neighbour rather
// than refusing outright, but keeping them apart at generation is better than
// leaning on that. 5 = the taller side of the mine.
const ORE_DEPOSIT_CLEARANCE = 5;

function oreDepositNear(depType, col, row, size, pad) {
  for (const d of EntityRegistry.getByType(depType)) {
    const dw = d.width || 2, dh = d.height || 2;
    if (col - pad < d.col + dw && col + size + pad > d.col &&
        row - pad < d.row + dh && row + size + pad > d.row) return true;
  }
  return false;
}

// ±15%, so two deposits of the same tier aren't interchangeable.
function oreReserveFor(size, rate = ORE_MINE_RATE) {
  const variance = 0.85 + Math.random() * 0.30;
  return Math.round(size * size * ORE_LIFE_SECONDS_PER_TILE * rate * variance);
}

// Drains a mine's deposit and reports whether there was anything left to
// take. Shared by every ore mine so they can't drift apart.
function drainOreDeposit(mine, dt, kindKey, rate = ORE_MINE_RATE) {
  const dep = mine._linkedDeposit;
  if (!dep || dep._oreAmount === undefined) return rate * dt;  // pre-reserve save: unlimited
  if (dep._oreAmount <= 0) { mine._oreDepleted = true; return 0; }
  mine._oreDepleted = false;
  const lifeMult = (kindKey === 'uranium' ? URANIUM_ORE_LIFE_MULT : kindKey === 'lithium' ? LITHIUM_ORE_LIFE_MULT : kindKey === 'helium' ? HELIUM_ORE_LIFE_MULT : ORE_LIFE_MULT) * (typeof Difficulty !== 'undefined' ? Difficulty.depositMult() : 1);
  // How much OUTPUT the remaining body still supports, which is more than the
  // reserve itself now that the drain is slowed by lifeMult.
  const mined = Math.min(rate * dt, dep._oreAmount * lifeMult);
  dep._oreAmount = Math.max(0, dep._oreAmount - mined / lifeMult);
  if (dep._oreMax > 0) checkDepositDepletion(dep, dep._oreAmount / dep._oreMax, kindKey);
  if (dep._oreAmount <= 0) {
    mine._oreDepleted = true;
    Progression.checkUnlocks?.();
  }
  return mined;
}

// Places up to `count` deposits of the rolled `tier` (80 tries), each with a
// reserve sized for `rate` and a random animation phase in `phaseKey`.
// Shared by every ore scan; returns how many landed.
function placeOreDeposits(depType, tier, count, rate, phaseKey) {
  let spawned = 0;
  const s = tier.size;
  for (let attempt = 0; attempt < 80 && spawned < count; attempt++) {
    // Rolled over the whole map, not just DEPOSIT_FIELD: the band's inner edge
    // (isOuterZone) is still the old map's, so the nearest finds are no closer
    // or further than before, but on the enlarged map they can also turn up in
    // the new land beyond it. Coal, oil and aquifers stay inside the field.
    const col = Math.floor(Math.random() * (COLS - s - 2)) + 1;
    const row = Math.floor(Math.random() * (ROWS - s - 2)) + 1;
    if (!isOuterZone(col, row, s, s)) continue;
    if (!GridManager.canPlaceFootprint(col, row, s, s)) continue;
    if (oreDepositNear(depType, col, row, s, ORE_DEPOSIT_CLEARANCE)) continue;
    let waterBlocked = false;
    for (let dr = 0; dr < s && !waterBlocked; dr++)
      for (let dc = 0; dc < s && !waterBlocked; dc++)
        if (WaterSystem.isWater(col+dc, row+dr)) waterBlocked = true;
    if (waterBlocked) continue;
    if (!depositClearOfWater(depType, col, row, s, s)) continue;   // room for a mine (resource_helpers.js)
    const deposit      = new Entity(depType, col, row);
    deposit.width      = s;
    deposit.height     = s;
    deposit._tierLabel = tier.label;
    deposit._oreAmount = oreReserveFor(s, rate);
    deposit._oreMax    = deposit._oreAmount;
    deposit[phaseKey]  = Math.random() * Math.PI * 2;
    GridManager.setEntityFootprint(deposit);
    if (typeof WorldMapSystem !== 'undefined') WorldMapSystem.registerDiscovery(depType, col, row, s, s);
    spawned++;
  }
  return spawned;
}

// Ore leaves a mine through its one OUT stub (`port`) — not any belt touching
// the footprint. Walks the belt from there, marking flow direction outward
// and tagging every reachable tile as carrying this ore (`flagKey`) from this
// mine (`sourceKey`, read by plants walking their IN belt). w×h is the
// footprint, for the flow direction off the first tile.
function markOreBelt(e, port, w, h, flagKey, sourceKey, rate) {
  if (!port) return;
  const run = beltRun(port.c, port.r);
  for (let i = 0; i < run.n; i++) {
    if (!run.belt[i]) continue;
    const tile = run.ent[i], c = run.c[i], r = run.r[i], pi = run.par[i];
    // The first tile flows out of the footprint cell nearest it: from the
    // centre itself, an odd-sized footprint's half tile made it diagonal,
    // which the belt renderer matches to no side (it then drew it backward).
    const fromC = pi < 0 ? Math.min(Math.max(c, e.col), e.col + w - 1) : run.c[pi];
    const fromR = pi < 0 ? Math.min(Math.max(r, e.row), e.row + h - 1) : run.r[pi];
    tile._flowDC = Math.sign(c - fromC);
    tile._flowDR = Math.sign(r - fromR);
    tile[flagKey] = true;
    tile[sourceKey] = e;
    tile._flowRate = rate;
  }
}

const UraniumSystem = (() => {
  let uraniumScans = 0;
  let totalUraniumMined = 0;

  function spawnUraniumDeposits() {
    if (!Progression.isUnlocked(T.URANIUMSCAN)) return 0;
    // Tiers — smaller and rarer than oil. Single tier rolled per scan.
    const tiers = [
      { size: 2, label: 'Small Uranium Deposit',  chance: 0.65 },
      { size: 3, label: 'Medium Uranium Deposit', chance: 0.30 },
      { size: 4, label: 'Large Uranium Deposit',  chance: 0.05 },
    ];
    const roll = Math.random();
    let tier = tiers[0];
    let acc = 0;
    for (const t of tiers) { acc += t.chance; if (roll < acc) { tier = t; break; } }

    // Uranium scans are expensive — guarantee at least 1, 25% chance of 2.
    const count = 1 + (Math.random() < 0.25 ? 1 : 0);
    return placeOreDeposits(T.URANIUMDEPOSIT, tier, count, ORE_MINE_RATE, '_uraniumPhase');
  }

  return {
    getScanCost()           { return (typeof Difficulty !== 'undefined' ? Difficulty.price(Math.round(115000 * Math.pow(1.25, uraniumScans))) : Math.round(115000 * Math.pow(1.25, uraniumScans))); },
    isScanUnlocked()        { return Progression.isUnlocked(T.URANIUMSCAN); },
    getScanUnlockProgress() {
      const r = (typeof ReservoirSystem !== 'undefined') ? ReservoirSystem.getTotalTurbineRuntime() : 0;
      return Math.min(1, r / 7500);
    },
    getTotalScans()         { return uraniumScans; },
    incrementScans()        { uraniumScans++; },
    loadScans(v)            { if (v !== undefined) uraniumScans = v; },
    spawnUraniumDeposits,
    tickMine(e, dt) {
      if (!e.powered) return;
      // A worked-out ore body stops the mine dead — no output, and the belt
      // BFS below is skipped so the whole line reads as idle rather than
      // still hauling from an empty deposit.
      // Buffer capped at MINE_BUFFER_CAP like the Lithium Mine: a full mine
      // stops extracting until a plant (or a Storage Container) draws it down.
      // This used to floor every whole unit straight into the lifetime counter
      // and leave only the sub-1 remainder for consumers to draw, which starved
      // them at any fast-forward speed — the same bug the Lithium Mine calls out.
      if ((e._uraniumStored || 0) > MINE_BUFFER_CAP) e._uraniumStored = MINE_BUFFER_CAP;
      e._bufferFull = (e._uraniumStored || 0) >= MINE_BUFFER_CAP;
      if (e._bufferFull || e._idleFull) return;
      const mined = drainOreDeposit(e, dt, 'uranium');
      if (mined <= 0) return;
      e._uraniumStored = Math.min(MINE_BUFFER_CAP, (e._uraniumStored || 0) + mined);
      BeltCargo.produced(e, 'uranium', mined);
      totalUraniumMined += mined;

      // Ore leaves through the one OUT stub at the end of the rail track.
      markOreBelt(e, UraniumSystem.outputPort(e), e.width || 3, e.height || 3,
        '_isUraniumConveyor', '_uraniumConveyorSource', ORE_MINE_RATE);
    },
    // The OUT stub: the tile just outside the end of the ore-cart rail on the
    // bottom row — bottom-right by default, bottom-left when flipped with R
    // (even rotations right, odd left; same convention as the Coal Mine yard).
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
    getTotalMined() { return totalUraniumMined; },
    loadMined(v)    { if (v !== undefined) totalUraniumMined = v; },
    clearUraniumConveyorFlags() {
      for (const e of EntityRegistry.getByType(T.CONVEYOR)) { e._isUraniumConveyor = false; e._uraniumConveyorSource = null; }
      for (const e of EntityRegistry.getByType(T.PIPE))     e._isUraniumConveyor = false;
    },
    hasDeposits() {
      for (const e of EntityRegistry.getByType(T.URANIUMDEPOSIT)) return true;
      return false;
    },
  };
})();

// ─── Sulfur System ───────────────────────────────────────────────
// Scan API mirrors UraniumSystem. Unlocked via Research MK3 (T.SULFURSCAN)
// after accumulating 3,000s of hydro turbine runtime. First scan costs $115k; ×1.25 each subsequent.
// Either mark of Sulfur Mine: the MK2 (T.SULFURMINE2) shares the MK1's
// footprint, stub and buffer, and differs only in rate.
const isSulfurMine = (e) => !!e && (e.type === T.SULFURMINE || e.type === T.SULFURMINE2);

const SulfurSystem = (() => {
  let sulfurScans = 0;
  let totalSulfurMined = 0;

  function spawnSulfurDeposits() {
    if (!Progression.isUnlocked(T.SULFURSCAN)) return 0;
    const tiers = [
      { size: 2, label: 'Small Sulfur Deposit',  chance: 0.65 },
      { size: 3, label: 'Medium Sulfur Deposit', chance: 0.30 },
      { size: 4, label: 'Large Sulfur Deposit',  chance: 0.05 },
    ];
    const roll = Math.random();
    let tier = tiers[0];
    let acc = 0;
    for (const t of tiers) { acc += t.chance; if (roll < acc) { tier = t; break; } }

    const count = 1 + (Math.random() < 0.25 ? 1 : 0);
    return placeOreDeposits(T.SULFURDEPOSIT, tier, count, ORE_MINE_RATE, '_sulfurPhase');
  }

  return {
    getScanCost()     { return (typeof Difficulty !== 'undefined' ? Difficulty.price(Math.round(115000 * Math.pow(1.25, sulfurScans))) : Math.round(115000 * Math.pow(1.25, sulfurScans))); },
    isScanUnlocked()  { return Progression.isUnlocked(T.SULFURSCAN); },
    getTotalScans()   { return sulfurScans; },
    incrementScans()  { sulfurScans++; },
    loadScans(v)      { if (v !== undefined) sulfurScans = v; },
    spawnSulfurDeposits,
    tickMine(e, dt) {
      if (!e.powered) return;
      // As above: an exhausted seam idles the mine and its conveyors.
      // Buffer capped at MINE_BUFFER_CAP like the Lithium Mine: a full mine
      // stops extracting until a plant (or a Storage Container) draws it down.
      // This used to floor every whole unit straight into the lifetime counter
      // and leave only the sub-1 remainder for consumers to draw, which starved
      // them at any fast-forward speed — the same bug the Lithium Mine calls out.
      if ((e._sulfurStored || 0) > MINE_BUFFER_CAP) e._sulfurStored = MINE_BUFFER_CAP;
      e._bufferFull = (e._sulfurStored || 0) >= MINE_BUFFER_CAP;
      if (e._bufferFull || e._idleFull) return;
      const rate  = SulfurSystem.mineRate(e);
      const mined = drainOreDeposit(e, dt, 'sulfur', rate);
      if (mined <= 0) return;
      e._sulfurStored = Math.min(MINE_BUFFER_CAP, (e._sulfurStored || 0) + mined);
      BeltCargo.produced(e, 'sulfur', mined);
      totalSulfurMined += mined;

      // Sulfur leaves through the one OUT stub beside the bottom row.
      markOreBelt(e, SulfurSystem.outputPort(e), e.width || 4, e.height || 5,
        '_isSulfurConveyor', '_sulfurConveyorSource', rate);
    },
    // Sulfur per second at full rate: the MK2 reads its def, the MK1 the
    // shared ore rate.
    mineRate(e) {
      return e && e.type === T.SULFURMINE2 ? (EntityDefs[T.SULFURMINE2].sulfurPerSec || ORE_MINE_RATE) : ORE_MINE_RATE;
    },
    allMines() { return [...EntityRegistry.getByType(T.SULFURMINE), ...EntityRegistry.getByType(T.SULFURMINE2)]; },
    // The OUT stub: the tile just outside the bottom row — bottom-right by
    // default, bottom-left when flipped with R (even rotations right, odd
    // left; same convention as the Uranium Mine).
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
    clearSulfurConveyorFlags() {
      for (const e of EntityRegistry.getByType(T.CONVEYOR)) { e._isSulfurConveyor = false; e._sulfurConveyorSource = null; }
      for (const e of EntityRegistry.getByType(T.PIPE))     e._isSulfurConveyor = false;
    },
    getTotalMined() { return totalSulfurMined; },
    loadMined(v)    { if (v !== undefined) totalSulfurMined = v; },
    hasDeposits() {
      for (const e of EntityRegistry.getByType(T.SULFURDEPOSIT)) return true;
      return false;
    },
  };
})();

// ─── Lithium System ───────────────────────────────────────────────
// Scan API mirrors Sulfur/UraniumSystem, but the scan is unlocked by the
// MK4 Research Station (T.LITHIUMSCAN) rather than by tier + hydro runtime,
// and its scans start dearer ($300k) on the same ×1.25 escalation.
const LithiumSystem = (() => {
  let lithiumScans = 0;
  let totalLithiumMined = 0;

  // Escalates ×1.25 per scan, the same curve as the uranium and sulfur scans.
  const FIRST_SCAN_COST = 300000;

  function spawnLithiumDeposits() {
    if (!Progression.isUnlocked(T.LITHIUMSCAN)) return 0;
    const tiers = [
      { size: 2, label: 'Small Lithium Deposit',  chance: 0.60 },
      { size: 3, label: 'Medium Lithium Deposit', chance: 0.32 },
      { size: 4, label: 'Large Lithium Deposit',  chance: 0.08 },
    ];
    const roll = Math.random();
    let tier = tiers[0];
    let acc = 0;
    for (const t of tiers) { acc += t.chance; if (roll < acc) { tier = t; break; } }

    // Reveals 1 to 3 deposits per scan.
    const countRoll = Math.random();
    const count = countRoll < 0.55 ? 1 : countRoll < 0.90 ? 2 : 3;
    return placeOreDeposits(T.LITHIUMDEPOSIT, tier, count, LITHIUM_MINE_RATE, '_lithiumPhase');
  }

  return {
    getScanCost()     { return (typeof Difficulty !== 'undefined' ? Difficulty.price(Math.round(FIRST_SCAN_COST * Math.pow(1.25, lithiumScans))) : Math.round(FIRST_SCAN_COST * Math.pow(1.25, lithiumScans))); },
    isScanUnlocked()  { return Progression.isUnlocked(T.LITHIUMSCAN); },
    // The OUT stub: the tile just outside the bottom row, beside the lithium
    // stockpile — bottom-right by default, bottom-left when flipped with R
    // (same convention as the uranium and sulfur mines).
    outputPort(mine) {
      const w = mine.width || 8, h = mine.height || 10;
      const right = ((mine._rotation || 0) % 2) === 0;
      const c = right ? mine.col + w : mine.col - 1, r = mine.row + h - 1;
      return GridManager.inBounds(c, r) ? { c, r, right } : null;
    },
    isOutputPort(mine, c, r) {
      const p = this.outputPort(mine);
      return !!p && p.c === c && p.r === r;
    },
    getTotalScans()   { return lithiumScans; },
    incrementScans()  { lithiumScans++; },
    loadScans(v)      { if (v !== undefined) lithiumScans = v; },
    spawnLithiumDeposits,
    tickMine(e, dt) {
      if (!e.powered) return;
      // As with uranium and sulfur: a worked-out body idles the mine and its
      // conveyors. Full rate right up to the last unit.
      // Own buffer capped at MINE_BUFFER_CAP — a full mine stops extracting
      // until a process plant draws it down (older saves are trimmed).
      if ((e._lithiumStored || 0) > MINE_BUFFER_CAP) e._lithiumStored = MINE_BUFFER_CAP;
      e._bufferFull = (e._lithiumStored || 0) >= MINE_BUFFER_CAP;
      if (e._bufferFull || e._idleFull) return;
      const mined = drainOreDeposit(e, dt, 'lithium', LITHIUM_MINE_RATE);
      if (mined <= 0) return;
      // Accumulate directly instead of flooring away the whole-unit part
      // each tick (the Uranium/Sulfur mines' pattern) — LithiumProcessPlantSystem
      // draws straight from e._lithiumStored, so discarding production into a
      // separate lifetime counter every tick left only a sub-1-unit remainder
      // to draw from. That's irrelevant at 1x (need = orePerSec*dt is small
      // too) but the Process Plant's need scales with dt while this remainder
      // stayed capped under 1 regardless of speed, so the draw ratio collapsed
      // to ~0 at any fast-forward speed — confirmed by direct testing (33% at
      // 1x, exactly 0 at 2x/10x/20x). Track the lifetime stat off the raw
      // production instead of watching for whole-unit crossings.
      e._lithiumStored = Math.min(MINE_BUFFER_CAP, (e._lithiumStored || 0) + mined);
      BeltCargo.produced(e, 'lithium', mined);
      totalLithiumMined += mined;

      // Ore leaves through the one OUT stub beside the stockpile.
      markOreBelt(e, LithiumSystem.outputPort(e), e.width || 4, e.height || 5,
        '_isLithiumConveyor', '_lithiumConveyorSource', LITHIUM_MINE_RATE);
    },
    clearLithiumConveyorFlags() {
      for (const e of EntityRegistry.getByType(T.CONVEYOR)) { e._isLithiumConveyor = false; e._lithiumConveyorSource = null; }
      for (const e of EntityRegistry.getByType(T.PIPE))     e._isLithiumConveyor = false;
    },
    getTotalMined() { return totalLithiumMined; },
    loadMined(v)    { if (v !== undefined) totalLithiumMined = v; },
    hasDeposits() {
      for (const e of EntityRegistry.getByType(T.LITHIUMDEPOSIT)) return true;
      return false;
    },
  };
})();

// ─── Chemical System ──────────────────────────────────────────────
