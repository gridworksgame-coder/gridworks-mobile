/* ═══════════════════════════════════════════════════════════════════
   CONTRACT PERKS
   ──────────────
   Non-cash rewards. Some contracts offer a perk alongside (a little less)
   money: a client who cannot pay in cash pays in favours. A perk is a
   time-limited effect on the player's own grid, counted in in-game days of
   HOME time — it does not tick while the player is away on a job site.

     discount   a share off what a class of equipment costs to build
                (wires free, batteries and substations 30% off, ...)
     repairs    a share off the cost of repairing storm and fire damage
     upkeep     a share off the grid's running costs
     sweep      beacon sweeps finish faster
     finds      beacon sweeps turn up an extra job

   Discounts work through buildCost() (house_request_system.js), which the
   hotbar prices and the placement path both read. Anything bought at a
   discount remembers what it cost (`_paid`), so selling it back refunds what
   was actually paid — a perk can never turn into free money.
   ═══════════════════════════════════════════════════════════════════ */

const ContractPerks = (() => {

  // Which equipment a discount can apply to. Types a build does not define
  // are simply dropped, so the table is safe whatever has been added.
  const SCOPES = {
    wire:       { label: 'Wires',                     types: () => [T.WIRE] },
    lines:      { label: 'Wires and poles',           types: () => [T.WIRE, T.POLE] },
    pipes:      { label: 'Pipes and belts',           types: () => [T.PIPE, T.UNDERGNDPIPE, T.CONVEYOR, T.UNDERGNDCONVEYOR, T.CONVEYORSPLITTER] },
    storage:    { label: 'Batteries and substations', types: () => [T.BATTERY, T.SUBSTATION, T.SUBSTATION2, T.SUBSTATION3, T.SUBSTATION4, T.SUBSTATION5] },
    protection: { label: 'Surge protection',          types: () => [T.PROTECTOR, T.LIGHTNINGROD, T.LIGHTNINGROD2, T.LIGHTNINGROD3] },
    renewables: { label: 'Wind and solar',            types: () => [T.WIND, T.WIND2, T.WIND3, T.SOLAR, T.SOLAR2, T.SOLAR3] },
    thermal:    { label: 'Coal, oil and geothermal',  types: () => [T.COALGENERATOR, T.FUELGEN, T.GEOTURBINE, T.GEOWELL, T.COALMINE, T.PUMPJACK, T.REFINERY] },
    nuclear:    { label: 'Nuclear equipment',         anchor: () => [T.NUCLEARREACTOR, T.ADVREACTOR], types: () => [T.NUCLEARREACTOR, T.ADVREACTOR, T.STEAMTURBINE, T.COOLINGTOWER, T.COOLINGTOWER2, T.SOLIDSTORAGE] },
    fusion:     { label: 'Fusion equipment',          anchor: () => [T.HULKINGFUSIONREACTOR], types: () => [T.HULKINGFUSIONREACTOR, T.MHDRING, T.CRYOPLANT, T.FUSIONFUELPLANT] },
    // Fitted from a plant's panel, not placed — PollutionSystem prices it
    // through priceFor(). A short window only: 1-3 days, never stretched.
    scrubbers:  { label: 'Scrubbers',                 maxDays: 3, types: () => [T.SCRUBBER] },
  };
  // Longest a perk may run: its scope's cap, if it has one.
  const maxDays = (p) => (p && p.kind === 'discount' && SCOPES[p.scope] && SCOPES[p.scope].maxDays) || Infinity;
  const typesOf = (scope) => (SCOPES[scope] ? SCOPES[scope].types() : []).filter(Boolean);

  // Perks carried by the player right now.
  let active = [];   // [{ kind, scope, pct, remaining, total, label }]

  const dayLen = () => (typeof DayNight !== 'undefined' ? DayNight.secondsPerGameHour() * 24 : 1200);

  function describe(p) {
    const d = p.days === 1 ? '1 day' : `${p.days} days`;
    if (p.kind === 'discount') {
      const what = SCOPES[p.scope] ? SCOPES[p.scope].label : 'Equipment';
      return p.pct >= 1 ? `${what} free for ${d}` : `${what} ${Math.round(p.pct * 100)}% off for ${d}`;
    }
    if (p.kind === 'repairs') return p.pct >= 1 ? `Repairs free for ${d}` : `Repairs ${Math.round(p.pct * 100)}% off for ${d}`;
    if (p.kind === 'upkeep')  return `Running costs ${Math.round(p.pct * 100)}% lower for ${d}`;
    if (p.kind === 'sweep')   return `Beacon sweeps ${Math.round(p.pct * 100)}% faster for ${d}`;
    if (p.kind === 'finds')   return `Beacon sweeps find ${p.pct} extra job${p.pct === 1 ? '' : 's'} for ${d}`;
    return 'Perk';
  }

  // ── Rolling a reward for an offer ────────────────────────────────
  //
  // Only scopes the player could actually use are offered: a discount on
  // reactors is worthless to someone who has never built one. `size` is the
  // job's size name; bigger jobs pay in bigger and longer perks.
  // A scope with an `anchor` (the headline machine) is only usable if the
  // player can use THAT: a nuclear discount means nothing to someone who
  // only has a cooling tower.
  function scopeUsable(scope, isUsable) {
    const s = SCOPES[scope];
    if (s && s.anchor) return s.anchor().filter(Boolean).some(isUsable);
    return typesOf(scope).some(isUsable);
  }
  function roll(size, isUsable, rand = Math.random) {
    const tier = { Small: 0, Medium: 1, Large: 2, Flagship: 3 }[size] ?? 0;
    const days = [2, 3, 4, 6][tier];
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const options = [];
    // Discounts, stronger and broader as the job grows.
    const add = (scope, pct, d = days) => { if (scopeUsable(scope, isUsable)) options.push({ kind: 'discount', scope, pct, days: d }); };
    if (tier === 0) { add('wire', 1);  add('lines', 0.4); add('pipes', 0.4); add('renewables', 0.15); add('scrubbers', 0.25, 1); }
    if (tier === 1) { add('lines', 1); add('storage', 0.3); add('renewables', 0.25); add('thermal', 0.2); add('protection', 0.5); add('pipes', 0.5); add('scrubbers', 0.35, 2); }
    if (tier === 2) { add('lines', 1); add('storage', 0.4); add('renewables', 0.35); add('thermal', 0.3); add('nuclear', 0.25); add('pipes', 0.6); add('scrubbers', 0.45, 2); }
    if (tier === 3) { add('lines', 1); add('storage', 0.5); add('renewables', 0.45); add('thermal', 0.4); add('nuclear', 0.35); add('fusion', 0.3); add('pipes', 0.75); add('scrubbers', 0.5, 3); }
    // Other kinds of favour.
    options.push({ kind: 'repairs', pct: tier >= 2 ? 1 : 0.5, days });
    if (tier >= 1) options.push({ kind: 'upkeep', pct: [0, 0.1, 0.15, 0.2][tier], days });
    options.push({ kind: 'sweep', pct: [0.3, 0.4, 0.5, 0.6][tier], days });
    if (tier >= 2) options.push({ kind: 'finds', pct: 1, days });
    const p = pick(options);
    return { ...p, label: describe(p) };
  }

  // ── Holding perks ────────────────────────────────────────────────
  function grant(perk) {
    if (!perk) return null;
    const total = Math.min(perk.days || 1, maxDays(perk)) * dayLen();
    // The same favour twice does not stack; it refreshes to the longer of the two.
    const same = active.find(a => a.kind === perk.kind && a.scope === perk.scope && a.pct === perk.pct);
    if (same) { same.remaining = Math.max(same.remaining, total); same.total = Math.max(same.total, total); return same; }
    const p = { kind: perk.kind, scope: perk.scope, pct: perk.pct, remaining: total, total, days: perk.days, label: perk.label || describe(perk) };
    active.push(p);
    return p;
  }

  // Counts down in home time only, and only while the game runs.
  function tick(dt, away) {
    if (!(dt > 0) || away || !active.length) return;
    for (let i = active.length - 1; i >= 0; i--) {
      active[i].remaining -= dt;
      if (active[i].remaining <= 0) {
        const gone = active.splice(i, 1)[0];
        if (typeof MessageLog !== 'undefined') MessageLog.add(`Perk ended: ${gone.label}`, '#a0a8b0');
      }
    }
  }

  // ── Effects, read by the rest of the game ────────────────────────
  // The price of building `type`, given its list price. The best discount
  // that applies wins; discounts do not stack.
  function priceFor(type, base) {
    let best = 0;
    for (const p of active) {
      if (p.kind !== 'discount') continue;
      if (typesOf(p.scope).includes(type)) best = Math.max(best, p.pct);
    }
    return best > 0 ? Math.round(base * (1 - best)) : base;
  }
  const strongest = (kind) => active.reduce((m, p) => p.kind === kind ? Math.max(m, p.pct) : m, 0);
  const repairMult = () => 1 - Math.min(1, strongest('repairs'));
  const upkeepMult = () => 1 - Math.min(0.9, strongest('upkeep'));
  const sweepMult  = () => 1 - Math.min(0.9, strongest('sweep'));
  const extraFinds = () => strongest('finds') | 0;

  const list = () => active.map(p => ({ ...p }));
  function timeLeftText(p) {
    const days = p.remaining / dayLen();
    return days >= 1 ? `${days.toFixed(1)} d` : `${Math.max(1, Math.round(days * 24))} h`;
  }

  // ── Save / load ──────────────────────────────────────────────────
  const serialise = () => active.map(p => ({ ...p }));
  function load(rows) { active = Array.isArray(rows) ? rows.filter(r => r && r.remaining > 0).map(r => ({ ...r })) : []; }
  function reset() { active = []; }

  return { SCOPES, roll, describe, maxDays, grant, tick, priceFor, repairMult, upkeepMult, sweepMult, extraFinds,
           list, timeLeftText, serialise, load, reset, isActive: () => active.length > 0 };
})();
