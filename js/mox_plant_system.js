/* ═══════════════════════════════════════════════════════════════════
   ADVANCED FUEL PROCESSING SYSTEM
   Plutonium (conveyor) + Uranium (conveyor) → MOX Fuel Rods (conveyor)

   The second half of the MK4 plutonium tier, and the thing that gives
   reprocessing a point: it blends the Reprocessing Plant's plutonium back
   into a uranium matrix as MOX, the fuel the Advanced Nuclear Reactor
   burns.

   MOX is Mixed OXide — plutonium dioxide milled into uranium dioxide. Real
   fuel runs roughly 5–10% plutonium by mass with the balance being depleted
   or reprocessed uranium, so def.plutoniumPerUnit sits at the top of that
   range rather than being invented. Two consequences shape the building:

     • The uranium intake takes RECOVERED uranium and MINED ore
       interchangeably. Both are the fertile matrix and neither needs
       enriching, so there is no reason for the plant to care which arrived
       — and a player whose reprocessor cannot keep up simply belts ore in
       to make up the difference. This is also what stops recovered uranium
       becoming a stranded by-product.
     • It is DRY. No water pipe: fabrication is powder metallurgy, and the
       wet chemistry lives upstream at the Reprocessing Plant. That is a
       mechanical difference between the tier's two plants, not a cosmetic
       one.

   Structurally this is the Reprocessing Plant inverted — two belt inputs
   and one belt output instead of one in and two out — so it follows the
   same connectivity patterns: flood-fill from each IN stub following the
   producer's stamped `_...ConveyorSource` reference (and accepting Storage
   Containers through their OUT stub), and the fuel plant's rod-belt marking
   run on the way out.
   ═══════════════════════════════════════════════════════════════════ */

const MoxPlantSystem = (() => {
  let totalMoxProduced = 0;

  // Both intakes sit on one face and the product leaves on the opposite one,
  // so the feed side and the fuel side of the plant are physically separated
  // — which is also how the building is drawn.
  //   rot 0: inputs top,    MOX out bottom
  //   rot 1: inputs right,  MOX out left
  //   rot 2: inputs bottom, MOX out top
  //   rot 3: inputs left,   MOX out right
  // (Same rotation order as ReprocessingSystem.getStubs, so a rotated plant's
  // ports land where a player who has built one of those expects them.)
  //
  // The offsets spread along whichever face they land on, so the ports stay
  // at the corners and middle of the wall at any size: PuO₂ two in from the
  // near corner, UO₂ three in from the far one, MOX out dead centre. On the
  // old 11×9 footprint that gives 2 / 8 / 5 along the 11-wide faces, which is
  // exactly where they used to be — but the 9-tall faces used to use those
  // same three numbers, so a plant SAVED at the old size keeps the literal
  // 2 / 8 / 5 on every face and its already-laid belts stay connected.
  const legacySize = (e) => (e.width || 15) <= 11 && (e.height || 13) <= 9;
  const spread = (len) => ({ plut: 2, uran: len - 3, mox: Math.round(len/2) });

  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || 15, h = e.height || 13;
    const hz = legacySize(e) ? { plut: 2, uran: 8, mox: 5 } : spread(w);   // top / bottom faces
    const vt = legacySize(e) ? { plut: 2, uran: 8, mox: 5 } : spread(h);   // left / right faces
    const top    = (o) => ({ c: e.col + o, r: e.row - 1 });
    const bottom = (o) => ({ c: e.col + o, r: e.row + h });
    const left   = (o) => ({ c: e.col - 1, r: e.row + o });
    const right  = (o) => ({ c: e.col + w, r: e.row + o });
    if (rot === 1) return { plutoniumIn: right(vt.plut),  uraniumIn: right(vt.uran),  moxOut: left(vt.mox) };
    if (rot === 2) return { plutoniumIn: bottom(hz.plut), uraniumIn: bottom(hz.uran), moxOut: top(hz.mox) };
    if (rot === 3) return { plutoniumIn: left(vt.plut),   uraniumIn: left(vt.uran),   moxOut: right(vt.mox) };
    return           { plutoniumIn: top(hz.plut),    uraniumIn: top(hz.uran),    moxOut: bottom(hz.mox) };
  }

  // Generic belt walk: from `stub`, collect every producer of one belt solid
  // plus every Storage Container banking it. `accept` decides what counts as
  // a direct producer; `srcField` is the reference the producer stamps onto
  // its own OUT belt each tick, which is what makes a belt of any length and
  // shape work.
  function walkInput(stub, kind, srcField, accept) {
    const visited = new Set();
    const sources = [];
    const bins    = [];
    const queue = [{ c: stub.c, r: stub.r, pc: null, pr: null }];
    while (queue.length) {
      const { c, r, pc, pr } = queue.shift();
      const key = `${c},${r}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const ent = GridManager.getEntity(c, r);
      if (!ent) continue;
      if (accept(ent, pc, pr)) {
        if (!sources.includes(ent)) sources.push(ent);
        continue;
      }
      if (SolidStorageSystem.isSourceOf(ent, kind, pc, pr)) {
        if (!bins.includes(ent)) bins.push(ent);
        continue;
      }
      if (isConveyorTile(ent)) {
        const src = ent[srcField];
        if (src && !sources.includes(src)) sources.push(src);
        for (const [dc, dr] of beltSteps(c, r))
          queue.push({ c: c+dc, r: r+dr, pc: c, pr: r });
      }
    }
    return { sources, bins, found: sources.length > 0 || bins.length > 0 };
  }

  // Plutonium comes off a Reprocessing Plant, or a bin holding its output.
  function findPlutonium(e) {
    return walkInput(getStubs(e).plutoniumIn, 'plutonium', '_plutoniumConveyorSource',
      (ent, pc, pr) => ent.type === T.REPROCESSOR
                    && arrivedByPort(ReprocessingSystem.getStubs(ent).plutoniumOut, pc, pr));
  }

  // Uranium: recovered from a Reprocessing Plant, or straight off a mine —
  // the plant does not care which, so both are collected from the one belt.
  // A mine only counts when the walk arrived at its actual output port; a
  // belt merely brushing the side of the footprint carries nothing.
  function findUranium(e) {
    const stub = getStubs(e).uraniumIn;
    const recovered = walkInput(stub, 'recovered', '_recoveredConveyorSource',
      (ent, pc, pr) => ent.type === T.REPROCESSOR
                    && arrivedByPort(ReprocessingSystem.getStubs(ent).recoveredOut, pc, pr));
    const ore = walkInput(stub, 'uranium', '_uraniumConveyorSource',
      (ent, pc, pr) => ent.type === T.URANIUMMINE && ent.powered
                    && pc !== null && UraniumSystem.isOutputPort(ent, pc, pr));
    return {
      recovered:     recovered.sources.filter(s => s.type === T.REPROCESSOR),
      recoveredBins: recovered.bins,
      mines:         ore.sources.filter(s => s.type === T.URANIUMMINE),
      oreBins:       ore.bins,
      found: recovered.found || ore.found,
    };
  }

  // Stamp the MOX belt with flag / BFS distance / source reference / travel
  // direction, so the Advanced Reactor can walk back here and the renderer
  // can animate a rod along it. Same shape as FuelPlantSystem's rod belt,
  // including its known limitation: this is a flood-fill shortest-path
  // distance, not a walk along the belt's real route, so a belt that loops
  // back beside an earlier segment of itself can show a rod jumping lanes.
  function markMoxBelt(e, stub, inward, rate) {
    const visited = new Set();
    const queue = [{ c: stub.c, r: stub.r, d: 0, fromC: inward.c, fromR: inward.r }];
    while (queue.length) {
      const { c, r, d, fromC, fromR } = queue.shift();
      const key = `${c},${r}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const tile = GridManager.getEntity(c, r);
      if (!tile || !isConveyorTile(tile)) continue;
      tile._isMoxConveyor     = true;
      tile._moxConveyorDist   = d;
      tile._moxConveyorSource = e;
      tile._moxFlowDC         = Math.sign(c - fromC);
      tile._moxFlowDR         = Math.sign(r - fromR);
      tile._flowRate          = rate;
      for (const [dc, dr] of beltSteps(c, r))
        queue.push({ c: c+dc, r: r+dr, d: d + 1, fromC: c, fromR: r });
    }
  }

  // Work out what one input could supply this tick, up to `need` — live
  // producers first and bins second, so a container never starves the plant
  // that is feeding it directly — WITHOUT taking any of it. Each draw that
  // would make it up is appended to `plan`, and takePlanned() below removes
  // only as much as the plant really turns into rods.
  // (This used to take the stock on the spot, before the other input had
  // been looked at: a plant with plutonium on its belt and no uranium made
  // nothing and still ate a full tick's plutonium every tick, and any plant
  // throttled by one input over-drew the other.)
  // The fair-share claim (BeltShare) is still made here, every tick and for
  // the full `need`, whether or not anything ends up being taken.
  function planInput(sources, field, bins, need, dst, kind, plan) {
    let avail = 0;
    for (const s of sources) {
      if (avail >= need) break;
      if (!BeltCargo.reach(s, dst, kind)) continue;   // still on its way along the belt
      const stock = s[field] || 0;
      const take  = Math.min(stock, need - avail, BeltShare.cap(s, dst, stock, need - avail, kind));
      if (take > 0) plan.push({ src: s, field, kind, amount: take });
      avail += take;
    }
    // Same rules as SolidStorageSystem.drawFrom, which can only take there
    // and then: the share is claimed even while the bin is empty.
    for (const b of bins) {
      if (avail >= need) break;
      const stock = b._stored || 0;
      const share = BeltShare.cap(b, dst, stock, need - avail, kind);
      if (stock <= 0 || !BeltCargo.reach(b, dst, kind)) continue;
      const take = Math.min(stock, need - avail, share);
      if (take > 0) plan.push({ bin: b, kind, amount: take });
      avail += take;
    }
    return avail;
  }

  // Take `owe` out of the draws planInput lined up, in the order it listed
  // them (so recovered uranium still goes before ore, and producers before
  // bins). The belt picture (BeltCargo) is told what really left, no more.
  function takePlanned(plan, owe, dst) {
    for (const p of plan) {
      if (owe <= 0) break;
      const want = Math.min(p.amount, owe);
      let got;
      if (p.bin) {
        // No `dst`: the share was claimed in planInput, and a second claim
        // would count this plant's want twice in next tick's split.
        got = SolidStorageSystem.drawFrom([p.bin], want, null, p.kind);
      } else {
        got = Math.min(want, p.src[p.field] || 0);
        p.src[p.field] = (p.src[p.field] || 0) - got;
      }
      BeltCargo.moved(p.bin || p.src, dst, p.kind, got);
      owe -= got;
    }
  }

  return {
    tick(e, dt) {
      const def = EntityDefs[T.MOXPLANT];
      if (!def) return;

      const moxCap = def.moxCapacity || 300;
      if (e._mox === undefined) e._mox = 0;

      const plut = findPlutonium(e);
      const uran = findUranium(e);
      e._hasPlutonium = plut.found;
      e._hasUranium   = uran.found;

      // Mark the MOX belt unconditionally — the reactor detects a physical
      // connection whether or not this plant happens to be running, the same
      // cold-start bootstrap the Fuel Processing Plant's rod belt allows.
      {
        const { moxOut } = getStubs(e);
        const rot = e._rotation || 0;
        // The footprint cell just inside the OUT stub, so the first belt
        // tile's travel direction points away from the building.
        const inward = (rot === 0) ? { c: moxOut.c, r: moxOut.r - 1 }
                     : (rot === 1) ? { c: moxOut.c + 1, r: moxOut.r }
                     : (rot === 2) ? { c: moxOut.c, r: moxOut.r + 1 }
                                   : { c: moxOut.c - 1, r: moxOut.r };
        e._moxConveyorOut = true;
        markMoxBelt(e, moxOut, inward, def.moxPerSec);
      }

      // Rods still in flight on the belt, as seconds since each one finished
      // (the renderer places them at age × belt speed). Ages every tick
      // regardless of production, so rods already travelling keep moving.
      e._moxPulses = (e._moxPulses || []).map(a => a + dt).filter(a => a < 120);

      if (dt <= 0) return;
      if (!e.powered || !plut.found || !uran.found) { e._running = false; return; }
      // A full output buffer stops the plant rather than venting, the same
      // rule every other plant in the game follows. `_blockedBy` tells the
      // panel which buffer is holding things up.
      if (e._mox >= moxCap || e._idleFull) { e._running = false; e._blockedBy = 'MOX rod buffer'; return; }
      e._blockedBy = null;

      const plutNeed = def.moxPerSec * def.plutoniumPerUnit * dt;
      const uranNeed = def.moxPerSec * def.uraniumPerUnit   * dt;

      // What each input could supply this tick. Nothing is taken yet: both
      // are measured first and drained below by what the shorter one allows,
      // as the Fuel Processing Plant does with its acid.
      const plutPlan = [], uranPlan = [];
      const plutGot = planInput(plut.sources, '_plutonium', plut.bins, plutNeed, e, 'plutonium', plutPlan);
      // Recovered uranium first, ore second: recovered is the by-product with
      // nowhere else to go, and burning it off before touching the mines is
      // what keeps the Reprocessing Plant from backing up and stalling on a
      // full recovered-uranium buffer.
      let uranGot = planInput(uran.recovered, '_recovered', uran.recoveredBins, uranNeed, e, 'recovered', uranPlan);
      if (uranGot < uranNeed) {
        uranGot += planInput(uran.mines, '_uraniumStored', uran.oreBins, uranNeed - uranGot, e, 'uranium', uranPlan);
      }

      // Throttled by whichever input is shorter — the same ratio rule the
      // Fuel Processing Plant uses for its uranium supply.
      const ratio = Math.min(plutNeed > 0 ? plutGot / plutNeed : 0,
                             uranNeed > 0 ? uranGot / uranNeed : 0);
      e._running = ratio > 0;
      const plutRatio = plutNeed > 0 ? plutGot / plutNeed : 1;
      const uranRatio = uranNeed > 0 ? uranGot / uranNeed : 1;
      e._shortOn = (ratio <= 0 || ratio >= 0.999) ? null
                 : (plutRatio < uranRatio) ? 'Plutonium' : 'Uranium';
      if (ratio <= 0) return;

      // Only now do the inputs leave their sources, each by the share of a
      // full tick's draw that is actually being made into rods.
      takePlanned(plutPlan, plutNeed * ratio, e);
      takePlanned(uranPlan, uranNeed * ratio, e);

      const produced  = def.moxPerSec * dt * ratio;
      const prevWhole = Math.floor(e._mox);
      e._mox = Math.min(moxCap, e._mox + produced);
      BeltCargo.produced(e, 'mox', produced);
      totalMoxProduced += produced;
      // A whole rod just finished — start a fresh pellet at the plant.
      if (Math.floor(e._mox) > prevWhole && e._moxPulses.length < 24) e._moxPulses.push(0);
    },

    clearMoxConveyorFlags() {
      for (const c of EntityRegistry.getByType(T.CONVEYOR)) {
        c._isMoxConveyor     = false;
        c._moxConveyorSource = null;
      }
    },

    getStubs,
    getTotalMox()   { return totalMoxProduced; },
    loadTotalMox(v) { totalMoxProduced = v || 0; },
  };
})();
