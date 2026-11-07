/* ═══════════════════════════════════════════════════════════════════
   FLOW METER
   What each building has REALLY handed to each other building, per
   game-second — for the info panel, so a mine can say "1.50 t/s to 2 Coal
   Generators" instead of a nominal figure. Read-only: the sim never asks it
   anything, it only reports.

   record(src, dst, kind, amount) is called at every hand-off (BeltCargo.moved
   covers every belt; the oil pipes call it directly). Each src→dst→kind link
   keeps an exponentially-weighted rate over TAU game-seconds, so a line
   that's ticking along reads steady and one that stops falls to zero within
   a few seconds. Game time, so a paused game holds its readings.
   ═══════════════════════════════════════════════════════════════════ */

const FlowMeter = (() => {
  const TAU = 8;   // game-seconds the rate averages over

  const _out = new WeakMap();   // src -> Map(kind -> Map(dst -> { r, t }))
  const _in  = new WeakMap();   // dst -> Map(kind -> Map(src -> same object))

  const _now = () => (typeof DayNight !== 'undefined' ? DayNight.getElapsed() : performance.now() / 1000);
  // A link's rate as of `now`: decayed since its last hand-off.
  const _read = (l, now) => l.r * Math.exp(-Math.max(0, now - l.t) / TAU);

  function record(src, dst, kind, amount) {
    if (!(amount > 0) || !src || !dst || src === dst) return;
    const now = _now();
    let byKind = _out.get(src);
    if (!byKind) _out.set(src, byKind = new Map());
    let links = byKind.get(kind);
    if (!links) byKind.set(kind, links = new Map());
    let l = links.get(dst);
    if (!l) {
      links.set(dst, l = { r: 0, t: now });
      let inK = _in.get(dst);
      if (!inK) _in.set(dst, inK = new Map());
      let inL = inK.get(kind);
      if (!inL) inK.set(kind, inL = new Map());
      inL.set(src, l);
    }
    l.r = _read(l, now) + amount / TAU;
    l.t = now;
  }

  // [{ kind, total, links: [{ ent, rate }] }] for everything `e` sent out
  // (dir 'out') or took in (dir 'in'), busiest first. Links below `floor`
  // units/s are dropped, as are entities no longer on the map.
  function _list(map, e, floor) {
    const byKind = map.get(e);
    if (!byKind) return [];
    const now = _now(), res = [];
    for (const [kind, links] of byKind) {
      const out = [];
      let total = 0;
      for (const [ent, l] of links) {
        const rate = _read(l, now);
        if (rate < floor || !EntityRegistry.getByType(ent.type).has(ent)) continue;
        out.push({ ent, rate });
        total += rate;
      }
      if (out.length) res.push({ kind, total, links: out.sort((a, b) => b.rate - a.rate) });
    }
    return res.sort((a, b) => b.total - a.total);
  }
  const outOf = (e, floor = 0.005) => _list(_out, e, floor);
  const inTo  = (e, floor = 0.005) => _list(_in,  e, floor);

  return { record, outOf, inTo, TAU };
})();
