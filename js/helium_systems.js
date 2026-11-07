/* ═══════════════════════════════════════════════════════════════════
   HELIUM SYSTEMS
   The fusion chain's cooling leg — keeps the Fusion Reactor's
   superconducting magnets at 4.5 K:
     Helium Scan  → Helium Gas Field (helium-rich natural gas pocket)
     Helium Well  → helium gas (pipe)
     Cryo Plant   → helium gas (+ reactor ash) → liquid helium (pipe)
     Fusion Reactor LHe IN ← liquid helium
   Real helium comes out of natural gas fields, never meaningfully out of
   air (~5 ppm), which is why this is a discoverable deposit rather than
   another Atmosphere Collector product.
   ═══════════════════════════════════════════════════════════════════ */

// ─── Helium System (scan, gas fields, wells) ──────────────────────
// Scan API mirrors LithiumSystem: a flat one-time cost, unlocked by making
// D-T fuel pellets (T.HELIUMSCAN). Fields are finite like the ore
// bodies (oreReserveFor at the well's rate), so a well lasts as long as a
// lithium or uranium mine of the same size.
const HELIUM_WELL_RATE = 2;   // units/sec — keep in step with EntityDefs[T.HELIUMWELL].heliumPerSec (MK1; HeliumSystem.wellRate for a given well)
// Both tiers of well, for the checks that take either (consumers' pipe walks,
// placement, demolition, the field panel).
const isHeliumWell = (e) => !!e && (e.type === T.HELIUMWELL || e.type === T.HELIUMWELL2);

const HeliumSystem = (() => {
  let heliumScans = 0;
  let totalHeliumExtracted = 0;

  const SCAN_COST = 400000;

  function spawnHeliumDeposits() {
    if (!Progression.isUnlocked(T.HELIUMSCAN)) return 0;
    // Rarer than lithium — helium-rich gas is a lucky find.
    const tiers = [
      { size: 2, label: 'Small Helium Gas Field',  chance: 0.65 },
      { size: 3, label: 'Medium Helium Gas Field', chance: 0.29 },
      { size: 4, label: 'Large Helium Gas Field',  chance: 0.06 },
    ];
    const roll = Math.random();
    let tier = tiers[0];
    let acc = 0;
    for (const t of tiers) { acc += t.chance; if (roll < acc) { tier = t; break; } }

    // Guaranteed 1, 30% chance of 2.
    const count = 1 + (Math.random() < 0.30 ? 1 : 0);
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
      if (oreDepositNear(T.HELIUMDEPOSIT, col, row, s, ORE_DEPOSIT_CLEARANCE)) continue;
      let waterBlocked = false;
      for (let dr = 0; dr < s && !waterBlocked; dr++)
        for (let dc = 0; dc < s && !waterBlocked; dc++)
          if (WaterSystem.isWater(col+dc, row+dr)) waterBlocked = true;
      if (waterBlocked) continue;
      if (!depositClearOfWater(T.HELIUMDEPOSIT, col, row, s, s)) continue;   // room for a well (resource_helpers.js)
      const deposit        = new Entity(T.HELIUMDEPOSIT, col, row);
      deposit.width        = s;
      deposit.height       = s;
      deposit._tierLabel   = tier.label;
      deposit._oreAmount   = oreReserveFor(s, HELIUM_WELL_RATE);
      deposit._oreMax      = deposit._oreAmount;
      deposit._heliumPhase = Math.random() * Math.PI * 2;
      GridManager.setEntityFootprint(deposit);
      if (typeof WorldMapSystem !== 'undefined') WorldMapSystem.registerDiscovery(T.HELIUMDEPOSIT, col, row, s, s);
      spawned++;
    }
    return spawned;
  }

  // Single HE OUT stub, mid-face, rotation-aware like
  // AtmosphereCollectorSystem.getStubs (R while placing turns it).
  // rot 0: right (col+w)   rot 1: bottom (row+h)   rot 2: left (col-1)   rot 3: top (row-1)
  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || 4, h = e.height || 4;
    const o = Math.floor(w / 2);
    let heliumOut;
    if (rot === 0)      heliumOut = { c: e.col + w, r: e.row + o };
    else if (rot === 1) heliumOut = { c: e.col + o, r: e.row + h };
    else if (rot === 2) heliumOut = { c: e.col - 1, r: e.row + o };
    else                heliumOut = { c: e.col + o, r: e.row - 1 };
    return { heliumOut };
  }

  // Helium gas pipes are claimed by two producers — wells (here) and the
  // reactor's HE ASH OUT — so this one clear runs before both.
  function clearHeliumPipeFlags() {
    for (const p of allPipes()) p._heliumActive = false;
  }

  // BFS from a stub, flagging every reachable pipe tile as carrying helium
  // gas. Shared with the reactor's ash outlet. Returns true if the stub had
  // a pipe on it at all.
  function markHeliumPipes(stub, rate) {
    const run = pipeRun(stub.c, stub.r, 'helium');
    for (let i = 0; i < run.n; i++) {
      const p = run.pipe[i];
      p._heliumActive = true;
      if (rate !== undefined) p._flowRate = rate;
    }
    return run.n > 0;
  }

  // Helium per second this well makes at full rate: an MK2 (T.HELIUMWELL2)
  // three times an MK1's.
  function wellRate(e) {
    return (EntityDefs[e && e.type] || EntityDefs[T.HELIUMWELL]).heliumPerSec || HELIUM_WELL_RATE;
  }

  return {
    wellRate,
    // Every Helium Well, both tiers.
    allWells() { return [...EntityRegistry.getByType(T.HELIUMWELL), ...EntityRegistry.getByType(T.HELIUMWELL2)]; },
    getScanCost()     { return (typeof Difficulty !== 'undefined' ? Difficulty.price(SCAN_COST) : SCAN_COST); },
    getScanCost()     { return (typeof Difficulty !== 'undefined' ? Difficulty.price(SCAN_COST) : SCAN_COST); },
    isScanUnlocked()  { return Progression.isUnlocked(T.HELIUMSCAN); },
    getTotalScans()   { return heliumScans; },
    incrementScans()  { heliumScans++; },
    loadScans(v)      { if (v !== undefined) heliumScans = v; },
    spawnHeliumDeposits,
    getStubs,
    clearHeliumPipeFlags,
    markHeliumPipes,
    tickWell(e, dt) {
      const def = EntityDefs[e.type] || EntityDefs[T.HELIUMWELL];
      const cap = def.heliumCapacity || 1000;
      e._helium = Math.min(cap, e._helium || 0);
      e._bufferFull = e._helium >= cap;
      if (e.powered && !e._bufferFull && !e._idleFull) {
        // An MK2 drains its field at its own rate, three times as fast.
        const got = drainOreDeposit(e, dt, 'helium', wellRate(e));
        if (got > 0) {
          e._helium = Math.min(cap, e._helium + got);
          totalHeliumExtracted += got;
        }
      }
      // Marked after extraction — a Cryo Plant drains the buffer to zero
      // every tick, so checking before would never see gas to give. Marked
      // whenever there's gas, powered or not: same reasoning as the
      // reactor's High-Beta outlet, a banked buffer stays drawable through
      // a brief outage.
      e._heliumPipeOut = e._helium > 0 && markHeliumPipes(getStubs(e).heliumOut, wellRate(e));
    },
    getTotalExtracted() { return totalHeliumExtracted; },
    loadExtracted(v)    { if (v !== undefined) totalHeliumExtracted = v; },
    hasDeposits() {
      for (const e of EntityRegistry.getByType(T.HELIUMDEPOSIT)) return true;
      return false;
    },
  };
})();

// ─── Cryo Plant System ────────────────────────────────────────────
// Helium gas (pipe, from Helium Wells and/or a reactor's HE ASH OUT) →
// liquid helium (pipe, to a Fusion Reactor's LHe IN). The compressors are
// what actually hold the magnets cold: HulkingFusionReactorSystem only
// counts a plant as cooling while it is powered and not tripped, even if
// its liquid buffer is full.
const CryoPlantSystem = (() => {
  let totalLiquefied = 0;

  // Same transpose / mirror / quarter-turn convention as
  // IsotopicWashTowerSystem.getStubs, so the sprite can draw in its
  // unrotated frame via _plantFrame.
  // rot 0: HE IN left   (col-1), LHe OUT right  (col+w)
  // rot 1: HE IN top    (row-1), LHe OUT bottom (row+h)
  // rot 2: HE IN right  (col+w), LHe OUT left   (col-1)
  // rot 3: HE IN bottom (row+h), LHe OUT top    (row-1)
  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || EntityDefs[T.CRYOPLANT].width, h = e.height || EntityDefs[T.CRYOPLANT].height;
    const face = (rot % 2) ? w : h;
    const oI = 2, oO = Math.floor(face / 2);
    let heliumIn, liquidOut;
    if (rot === 0) {
      heliumIn  = { c: e.col - 1, r: e.row + oI };
      liquidOut = { c: e.col + w, r: e.row + oO };
    } else if (rot === 1) {
      heliumIn  = { c: e.col + oI, r: e.row - 1 };
      liquidOut = { c: e.col + oO, r: e.row + h };
    } else if (rot === 2) {
      heliumIn  = { c: e.col + w, r: e.row + oI };
      liquidOut = { c: e.col - 1, r: e.row + oO };
    } else {
      heliumIn  = { c: e.col + oI, r: e.row + h };
      liquidOut = { c: e.col + oO, r: e.row - 1 };
    }
    return { heliumIn, liquidOut };
  }

  function clearLiquidHePipeFlags() {
    for (const p of allPipes()) p._liquidHeActive = false;
  }

  // Every helium gas source on the HE IN pipe network: wells with gas
  // banked, Gas Holders holding helium, and reactors with ash banked. Deliberately not gated on the
  // sources' own power (see HulkingFusionReactorSystem.findPlasmaSource).
  function findHeliumSources(e) {
    const { heliumIn } = getStubs(e);
    // None until the gas has visibly run down the line to HE IN.
    if (!pipeArrivedAt(heliumIn.c, heliumIn.r, 'helium')) return [];
    const run = pipeRun(heliumIn.c, heliumIn.r, 'helium');
    const sources = [];
    for (let j = 0; j < run.pn; j++) {
      const nb = run.pe[j], c = run.ptc[j], r = run.ptr[j];
      if (isHeliumWell(nb)) {
        if (!sources.includes(nb) && _atStub(HeliumSystem.getStubs(nb).heliumOut, c, r)) sources.push(nb);
      } else if (nb.type === T.GASSTORAGE) {
        if (!sources.includes(nb) && GasStorageSystem.isSourceOf(nb, 'helium', c, r)) sources.push(nb);
      } else if (nb.type === T.HULKINGFUSIONREACTOR) {
        if (!sources.includes(nb) && _atStub(HulkingFusionReactorSystem.getStubs(nb).ashOut, c, r)) sources.push(nb);
      } else if (nb.type === T.ADVFUSIONREACTOR) {
        if (!sources.includes(nb) && _atStub(AdvancedFusionReactorSystem.getStubs(nb).ashOut, c, r)) sources.push(nb);
      }
    }
    return sources;
  }

  const _atStub = (s, c, r) => !!s && s.c === c && s.r === r;

  function markLiquidHePipes(e, rate) {
    const { liquidOut } = getStubs(e);
    const run = pipeRun(liquidOut.c, liquidOut.r, 'liquidhe');
    for (let i = 0; i < run.n; i++) {
      const p = run.pipe[i];
      p._liquidHeActive = true;
      p._flowRate = rate;
    }
    return run.n > 0;
  }

  function _plantName(e) {
    return (EntityDefs[T.CRYOPLANT].label || 'Cryo Plant') + (e._num !== undefined ? ` #${e._num}` : '');
  }
  const _tripTag = (e) => `cryotrip-${e.col},${e.row}`;

  // Compressor trip — the Cooling Tower's pump rule (CoolingTowerSystem._tickPumps).
  function _tickCompressors(e, dt) {
    if (dt <= 0) return;
    const def = EntityDefs[T.CRYOPLANT];
    const restart = def.compressorRestartSeconds || 45;
    const powered = !!e.powered;
    const outage = e._wasPowered === true && !powered;
    e._wasPowered = powered;

    if (outage) {
      if (e._tripped) {
        e._restart = restart;
      } else if (Math.random() < (def.compressorTripChance ?? 0.4)) {
        e._tripped = true;
        e._restart = restart;
        const name = _plantName(e);
        NotificationStack.push({
          icon: '❄', title: 'Cryo compressors tripped',
          message: `${name} lost power and its compressors tripped. They need ${restart}s of steady power to restart; any Fusion Reactor it cools is WARMING until then, and its magnets quench at 9 K.`,
          color: '#ffb040', border: '#a05010', tag: _tripTag(e), glow: true,
          onClick: () => {
            Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE);
            EntityInfoPanel.open(e);
          },
        });
      }
    }

    if (e._tripped && powered) {
      e._restart = (e._restart ?? restart) - dt;
      if (e._restart <= 0) {
        e._tripped = false;
        e._restart = 0;
        NotificationStack.dismissTag(_tripTag(e));
        showToast(`✅ ${_plantName(e)}'s compressors are running again`, '#40c060', '#001408', '#0a4020', 'cryotrip');
      }
    }
  }

  return {
    getStubs,
    clearLiquidHePipeFlags,
    tick(e, dt) {
      const def = EntityDefs[T.CRYOPLANT];
      const cap = def.liquidHeCapacity || 500;
      e._liquidHe = Math.min(cap, e._liquidHe || 0);

      _tickCompressors(e, dt);
      e._running = !!e.powered && !e._tripped;

      const sources = findHeliumSources(e);
      const isAsh = (s) => s.type === T.HULKINGFUSIONREACTOR || s.type === T.ADVFUSIONREACTOR;
      e._hasHeliumSource = sources.some(s => (s[isAsh(s) ? '_heAsh' : '_helium'] || 0) > 0);
      e._ashSources = sources.filter(isAsh).length;

      // The OUT line only carries liquid helium the plant has, or is making:
      // running compressors with no helium coming in used to mark it
      // flowing at full rate from an empty plant. _liquidPipeLinked is just
      // whether a pipe is there, for the panel and the port.
      const canSend = e._liquidHe > 0 || (e._running && e._hasHeliumSource);
      e._liquidPipeOut    = canSend && markLiquidHePipes(e, def.heliumPerSec);
      e._liquidPipeLinked = e._liquidPipeOut || (() => { const { liquidOut } = getStubs(e); return pipeRun(liquidOut.c, liquidOut.r, 'liquidhe').n > 0; })();

      e._liquefying = false;
      if (!e._running || dt <= 0 || e._liquidHe >= cap) return;

      // Ash first — it's already been paid for — then the wells and tanks.
      let need = Math.min(def.heliumPerSec * dt, cap - e._liquidHe);
      const ordered = sources.slice().sort((a, b) => (isAsh(a) ? 0 : 1) - (isAsh(b) ? 0 : 1));
      let taken = 0;
      for (const s of ordered) {
        if (need <= 0) break;
        const field = isAsh(s) ? '_heAsh' : '_helium';
        const got = Math.min(need, s[field] || 0);
        if (got <= 0) continue;
        s[field] -= got;
        need  -= got;
        taken += got;
      }
      if (taken <= 0) return;
      e._liquidHe = Math.min(cap, e._liquidHe + taken);
      e._liquefying = true;
      totalLiquefied += taken;
    },
    getTotalLiquefied() { return totalLiquefied; },
    loadTotalLiquefied(v) { if (v !== undefined) totalLiquefied = v; },
  };
})();

// ─── Helium-3 Separator System ────────────────────────────────────
// Helium gas (pipe, from Helium Wells) → helium-3 (pipe, to a Fusion Fuel
// Plant's HE-3 IN) for D-He3 fuel. Cryogenic distillation really is how
// helium-3 is pulled out of natural helium. Wells only: fusion ash is pure
// helium-4, so a reactor's HE ASH OUT carries none.
const He3SeparatorSystem = (() => {
  let totalHe3Produced = 0;

  // Same stub convention as CryoPlantSystem.getStubs (and the sprite's
  // _plantFrame): HE IN on the left face at offset 2, HE-3 OUT mid right.
  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || 12, h = e.height || 12;
    const face = (rot % 2) ? w : h;
    const oI = 2, oO = Math.floor(face / 2);
    let heliumIn, he3Out;
    if (rot === 0)      { heliumIn = { c: e.col - 1,  r: e.row + oI }; he3Out = { c: e.col + w,  r: e.row + oO }; }
    else if (rot === 1) { heliumIn = { c: e.col + oI, r: e.row - 1 };  he3Out = { c: e.col + oO, r: e.row + h }; }
    else if (rot === 2) { heliumIn = { c: e.col + w,  r: e.row + oI }; he3Out = { c: e.col - 1,  r: e.row + oO }; }
    else                { heliumIn = { c: e.col + oI, r: e.row + h };  he3Out = { c: e.col + oO, r: e.row - 1 }; }
    return { heliumIn, he3Out };
  }

  function clearHe3PipeFlags() {
    for (const p of allPipes()) p._he3Active = false;
  }

  // Helium Wells on the HE IN network whose HE OUT stub the walk reached,
  // and Gas Holders of helium whose GAS OUT stub it reached.
  function findWells(e) {
    const { heliumIn } = getStubs(e);
    if (!pipeArrivedAt(heliumIn.c, heliumIn.r, 'helium')) return [];   // still on its way down the line
    const run = pipeRun(heliumIn.c, heliumIn.r, 'helium');
    const wells = [];
    for (let j = 0; j < run.pn; j++) {
      const nb = run.pe[j], c = run.ptc[j], r = run.ptr[j];
      if (isHeliumWell(nb)) {
        const out = HeliumSystem.getStubs(nb).heliumOut;
        if (out.c === c && out.r === r && !wells.includes(nb)) wells.push(nb);
      } else if (nb.type === T.GASSTORAGE) {
        if (!wells.includes(nb) && GasStorageSystem.isSourceOf(nb, 'helium', c, r)) wells.push(nb);
      }
    }
    return wells;
  }

  function markHe3Pipes(e, rate) {
    const { he3Out } = getStubs(e);
    const run = pipeRun(he3Out.c, he3Out.r, 'helium3');
    for (let i = 0; i < run.n; i++) {
      const p = run.pipe[i];
      p._he3Active = true;
      p._flowRate = rate;
    }
    return run.n > 0;
  }

  return {
    getStubs,
    clearHe3PipeFlags,
    tick(e, dt) {
      const def = EntityDefs[T.HE3SEPARATOR];
      const cap = def.he3Capacity || 300;
      e._he3 = Math.min(cap, e._he3 || 0);

      const wells = findWells(e);
      e._hasHeliumSource = wells.some(w => (w._helium || 0) > 0);
      e._separating = false;

      if (e.powered && dt > 0 && e._he3 < cap && !e._idleFull) {
        // Proportional to the helium actually on hand.
        const need = def.heliumPerSec * dt;
        let got = 0;
        for (const w of wells) {
          if (got >= need) break;
          const take = Math.min(need - got, w._helium || 0);
          if (take > 0) { w._helium -= take; got += take; }
        }
        if (got > 0) {
          const made = def.he3PerSec * dt * (got / need);
          e._he3 = Math.min(cap, e._he3 + made);
          e._separating = true;
          totalHe3Produced += made;
        }
      }
      // Marked after production, like the Helium Well's outlet.
      e._he3PipeOut = e._he3 > 0 && markHe3Pipes(e, def.he3PerSec);
    },
    getTotalHe3Produced() { return totalHe3Produced; },
    loadTotalHe3Produced(v) { if (v !== undefined) totalHe3Produced = v; },
  };
})();
