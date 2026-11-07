/* ═══════════════════════════════════════════════════════════════════
   GAS STORAGE SYSTEM
   The pipe-fed counterpart of the Storage Container: a pressurised
   8×8 gas holder with a GAS IN stub on one face and GAS OUT opposite.

   It banks any of the fusion chain's process gases — hydrogen, nitrogen,
   ammonia, deuterium, tritium, helium, helium-3 — one kind at a time (`_gasType`, cleared when it
   empties). The stock sits in the SAME field the gas's producer uses
   (_hydrogen, _nitrogen, ...), so a consumer that finds the tank on its
   input pipe draws from it exactly as it would from the producer.

   Same surplus rule as SolidStorageSystem: the tank only pulls a
   producer's stock above a few seconds of its output, so a plant drawing
   straight off the producer is never starved by a tank hoarding its
   output. Passive — needs no power; only lightning takes it offline.

   Ticked once per gas (tickGas) from the game loop, straight after that
   gas's producers have cleared and re-marked their pipes and before its
   consumers look for a source.
   ═══════════════════════════════════════════════════════════════════ */

const GasStorageSystem = (() => {
  // Left on a producer for what draws straight off it: RESERVE_SECONDS of its
  // output, capped at RESERVE_FRAC of its buffer. This was a flat fifth of the
  // buffer, so a holder got nothing until an Electrolyzer had 600 hydrogen
  // piled up. The holder pulls before consumers look for a source each tick,
  // so it can't be nothing, but a few seconds covers any tick's draw.
  const RESERVE_FRAC = 0.2;
  const RESERVE_SECONDS = 5;

  // Every storable gas: its producer, the buffer field it sits in, the
  // pipe flag that marks lines carrying it, and the producer's OUT stub.
  // A gas with more than one producer lists them all in `producers` (each
  // with its own type, buffer cap, rate and OUT stub) instead of
  // type/cap/rate/outStub.
  const KINDS = {
    // Split from water by an Electrolyzer, or drawn off a Coke Oven as oven gas.
    hydrogen:  { label: 'Hydrogen Gas',  color: '#80d8ff', field: '_hydrogen',  flag: '_hydrogenActive',
                 producers: [
                   { type: () => T.ELECTROLYZER, cap: () => EntityDefs[T.ELECTROLYZER].hydrogenCapacity || 3000, rate: () => EntityDefs[T.ELECTROLYZER].hydrogenPerSec,
                     outStub: (p) => ElectrolyzerSystem.getStubs(p).hydrogenStub },
                   { type: () => T.COKEOVEN,     cap: () => EntityDefs[T.COKEOVEN].hydrogenCapacity || 1000, rate: () => EntityDefs[T.COKEOVEN].hydrogenPerSec,
                     outStub: (p) => CokeOvenSystem.getStubs(p).gasOut },
                 ] },
    nitrogen:  { label: 'Nitrogen Gas',  color: '#a0a8ff', type: () => T.ATMOSCOLLECTOR, field: '_nitrogen',  flag: '_nitrogenActive',
                 cap: () => EntityDefs[T.ATMOSCOLLECTOR].nitrogenCapacity || 3000, rate: () => EntityDefs[T.ATMOSCOLLECTOR].nitrogenPerSec, outStub: (p) => AtmosphereCollectorSystem.getStubs(p).nitrogenStub },
    ammonia:   { label: 'Ammonia Gas',   color: '#c0f080', type: () => T.HABERBOSCH,     field: '_ammonia',   flag: '_ammoniaActive',
                 cap: () => EntityDefs[T.HABERBOSCH].ammoniaCapacity || 3000,     rate: () => EntityDefs[T.HABERBOSCH].ammoniaPerSec, outStub: (p) => HaberBoschSystem.getStubs(p).ammoniaOut },
    deuterium: { label: 'Deuterium Gas', color: '#ff6eb4', type: () => T.WASHTOWER,      field: '_deuterium', flag: '_deuteriumActive',
                 cap: () => EntityDefs[T.WASHTOWER].deuteriumCapacity || 1000,     rate: () => EntityDefs[T.WASHTOWER].deuteriumPerSec, outStub: (p) => IsotopicWashTowerSystem.getStubs(p).deuteriumOut },
    // Bred by a Tritium Breeding Facility and by a Fusion Reactor's blanket.
    tritium:   { label: 'Tritium',       color: '#80ffc0', field: '_tritium', flag: '_tritiumActive',
                 producers: [
                   { type: () => T.TRITIUMBREEDER,       cap: () => EntityDefs[T.TRITIUMBREEDER].tritiumCapacity || 300, rate: () => EntityDefs[T.TRITIUMBREEDER].tritiumPerSec,
                     outStub: (p) => TritiumBreederSystem.getStubs(p).tritiumOut },
                   { type: () => T.HULKINGFUSIONREACTOR, cap: () => EntityDefs[T.HULKINGFUSIONREACTOR].tritiumCapacity || 500, rate: () => EntityDefs[T.HULKINGFUSIONREACTOR].tritiumBredPerSec,
                     outStub: (p) => HulkingFusionReactorSystem.getStubs(p).tritiumOut },
                 ] },
    // Raw helium off the Helium Wells. Wells only: a reactor's HE ASH OUT
    // goes straight to its Cryo Plant, so a tank of helium is always well
    // gas and a He-3 Separator can draw on it too.
    helium:    { label: 'Helium Gas',    color: '#e0c8ff', field: '_helium',    flag: '_heliumActive',
                 producers: [
                   { type: () => T.HELIUMWELL,  cap: () => EntityDefs[T.HELIUMWELL].heliumCapacity || 1000, rate: () => EntityDefs[T.HELIUMWELL].heliumPerSec,
                     outStub: (p) => HeliumSystem.getStubs(p).heliumOut },
                   { type: () => T.HELIUMWELL2, cap: () => EntityDefs[T.HELIUMWELL2].heliumCapacity || 1000, rate: () => EntityDefs[T.HELIUMWELL2].heliumPerSec,
                     outStub: (p) => HeliumSystem.getStubs(p).heliumOut },
                 ] },
    // From Helium-3 Separators; the one gas a separator can't otherwise
    // stockpile past its own small buffer.
    helium3:   { label: 'Helium-3',      color: '#ffd0a0', type: () => T.HE3SEPARATOR,   field: '_he3',       flag: '_he3Active',
                 cap: () => EntityDefs[T.HE3SEPARATOR].he3Capacity || 300,         rate: () => EntityDefs[T.HE3SEPARATOR].he3PerSec, outStub: (p) => He3SeparatorSystem.getStubs(p).he3Out },
  };
  // The producer list for a gas, whichever way its entry is written.
  const producersOf = (K) => K.producers || [{ type: K.type, cap: K.cap, rate: K.rate, outStub: K.outStub }];

  const def      = () => EntityDefs[T.GASSTORAGE];
  const capacity = () => def().gasCapacity || 5000;
  const inRate   = () => def().inRate  || 150;
  const outRate  = () => def().outRate || 150;

  function online(e) { return !!e && !e._lightningDamaged; }

  function stored(e) {
    const K = e._gasType && KINDS[e._gasType];
    return K ? (e[K.field] || 0) : 0;
  }

  // Same transpose / mirror / quarter-turn convention as
  // CryoPlantSystem.getStubs, so the sprite draws in its unrotated frame.
  // rot 0: GAS IN left   (col-1), GAS OUT right  (col+w)
  // rot 1: GAS IN top    (row-1), GAS OUT bottom (row+h)
  // rot 2: GAS IN right  (col+w), GAS OUT left   (col-1)
  // rot 3: GAS IN bottom (row+h), GAS OUT top    (row-1)
  function getStubs(e) {
    const rot = e._rotation || 0;
    const w = e.width || 8, h = e.height || 8;
    const o = Math.floor(((rot % 2) ? w : h) / 2);
    if (rot === 0) return { gasIn: { c: e.col - 1, r: e.row + o }, gasOut: { c: e.col + w, r: e.row + o } };
    if (rot === 1) return { gasIn: { c: e.col + o, r: e.row - 1 }, gasOut: { c: e.col + o, r: e.row + h } };
    if (rot === 2) return { gasIn: { c: e.col + w, r: e.row + o }, gasOut: { c: e.col - 1, r: e.row + o } };
    return               { gasIn: { c: e.col + o, r: e.row + h }, gasOut: { c: e.col + o, r: e.row - 1 } };
  }

  // True if `nb` is a tank holding `gas` whose OUT stub is the pipe tile
  // (c,r) a consumer's walk arrived from. Consumers call this from their
  // own pipe BFS and then draw from nb[KINDS[gas].field].
  function isSourceOf(nb, gas, c, r) {
    if (!nb || nb.type !== T.GASSTORAGE || !online(nb) || nb._gasType !== gas) return false;
    if (stored(nb) <= 0) return false;
    const out = getStubs(nb).gasOut;
    return c === undefined || (out.c === c && out.r === r);
  }

  // Every producer (or upstream tank) of `gas` on the GAS IN pipe network,
  // each reached through its own outlet stub.
  function findSources(e, gas) {
    const prods = producersOf(KINDS[gas]);
    const { gasIn } = getStubs(e);
    // None until the gas has visibly run down the line to GAS IN.
    if (!pipeArrivedAt(gasIn.c, gasIn.r, gas)) return [];
    const run = pipeRun(gasIn.c, gasIn.r, gas);
    const sources = [];
    for (let j = 0; j < run.pn; j++) {
      const nb = run.pe[j], c = run.ptc[j], r = run.ptr[j];
      if (nb === e) continue;
      const P = prods.find(pr => nb.type === pr.type());
      if (P) {
        const out = P.outStub(nb);
        if (out && out.c === c && out.r === r && !sources.includes(nb)) sources.push(nb);
        continue;
      }
      if (isSourceOf(nb, gas, c, r) && !sources.includes(nb)) sources.push(nb);
    }
    return sources;
  }

  // Flag the OUT pipe network as carrying this tank's gas.
  function markOut(e, K) {
    const { gasOut } = getStubs(e);
    const run = pipeRun(gasOut.c, gasOut.r, e._gasType);
    const rate = outRate();
    for (let i = 0; i < run.n; i++) {
      const p = run.pipe[i];
      p[K.flag] = true;
      p._flowRate = rate;
    }
    return run.n > 0;
  }

  function tickTank(e, gas, dt) {
    const K = KINDS[gas];
    if (stored(e) <= 0.001 && e._gasType) { e[KINDS[e._gasType].field] = 0; e._gasType = null; }
    if (e._gasType && e._gasType !== gas) return;
    e._outLinked = false;
    e._filling = false;
    if (!online(e)) return;

    // Intake — only the surplus above each producer's reserve. None at all
    // while the holder is being emptied (StorageDrain).
    if (dt > 0 && !e._draining) {
      let room = Math.min(capacity() - (e[K.field] || 0), inRate() * dt);
      const prods = producersOf(K);
      for (const s of findSources(e, gas)) {
        if (room <= 0) break;
        const P = prods.find(pr => s.type === pr.type());
        // A producer keeps its reserve. Another tank levels out with this one:
        // taking all it held left the upstream tank empty every tick, blinking
        // between its gas and Empty while a trickle passed through it.
        const avail = P ? (s[K.field] || 0) - Math.min(P.cap() * RESERVE_FRAC, P.rate() * RESERVE_SECONDS)
                        : ((s[K.field] || 0) - (e[K.field] || 0)) / 2;
        const take = Math.min(room, avail);
        if (take <= 0) continue;
        s[K.field] -= take;
        e[K.field] = (e[K.field] || 0) + take;
        e._gasType = gas;
        e._inThisTick = (e._inThisTick || 0) + take;
        e._filling = true;
        room -= take;
      }
    }
    if (e._gasType === gas && stored(e) > 0) e._outLinked = markOut(e, K);
  }

  // Smoothed in/out rates for the info panel, and last tick's stock to
  // derive the outflow (consumers draw straight from the field).
  function _smooth(e, dt) {
    if (dt <= 0) return;
    const now = stored(e);
    const out = Math.max(0, (e._prevStored ?? now) + (e._inThisTick || 0) - now);
    const k = Math.min(1, dt * 2);
    e._inRate  = (e._inRate  || 0) + (((e._inThisTick || 0) / dt) - (e._inRate  || 0)) * k;
    e._outRate = (e._outRate || 0) + ((out / dt) - (e._outRate || 0)) * k;
    e._prevStored = now;
    e._inThisTick = 0;
  }

  return {
    KINDS, producersOf, getStubs, isSourceOf, online, stored,
    capacity,
    tickGas(gas, dt) {
      for (const e of EntityRegistry.getByType(T.GASSTORAGE)) tickTank(e, gas, dt);
    },
    // Once per tick, after every gas pass.
    endTick(dt) {
      for (const e of EntityRegistry.getByType(T.GASSTORAGE)) { StorageDrain.tick(e, dt); _smooth(e, dt); }
    },
    label: (g) => KINDS[g]?.label || null,
    color: (g) => KINDS[g]?.color || '#9ab0c0',
  };
})();
