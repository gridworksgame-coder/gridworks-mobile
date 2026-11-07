/* ═══════════════════════════════════════════════════════════════════
   DIFFICULTY
   Chosen on the Found Your Company screen and stored in the save, so a
   world keeps the rules it was started with.

   Every setting is a multiplier on the game's own balance — NORMAL is 1×
   across the board, i.e. the game exactly as tuned. EASY and HARD are
   presets; moving any slider switches the pick to CUSTOM.

     buildCost — every building, wire and survey scan price. Applied by
                 rewriting EntityDefs[*].cost once, so the hotbar, the info
                 panels, canAfford(), refunds and blueprints all agree.
     upkeep    — per-second running costs of plants and buildings
                 (positive def.upkeep).
     deposits  — how much a coal seam, oil field or ore body holds. Scaled
                 on the DRAIN side like the existing *_LIFE_MULTs: a mine
                 extracts at the same rate, the deposit just lasts longer
                 or shorter. Also scales biofuel harvested from trees,
                 bushes and fish (BiofuelSystem.scaleYield).
     income    — what customers pay for power (Economy.tick's income sum,
                 plus civic buildings' negative upkeep, which is income).
     funds     — starting balance on a new world.

   Nuclear Timer is separate from the presets too (it isn't really
   "harder" or "easier", it's how long a reactor meltdown gives you):
   a multiplier on every reactor's meltdownSeconds — see
   MeltdownSystem.limitFor, which also floors an Advanced Reactor at the
   length of its countdown song.

   Permadeath is separate from the sliders: one save file, no manual
   saves or exports, the game saves itself on the way out — and if an
   Advanced Reactor detonates, every file of that world is deleted.
   ═══════════════════════════════════════════════════════════════════ */

const Difficulty = (() => {
  const BASE_FUNDS = 20000;

  const SLIDERS = [
    { key: 'buildCost', label: 'Build Prices',      min: 0.5,  max: 2.5, step: 0.05,
      desc: 'Price of every building, wire and survey scan' },
    { key: 'upkeep',    label: 'Running Costs',     min: 0.5,  max: 2.5, step: 0.05,
      desc: 'Upkeep your plants and buildings bill every second' },
    { key: 'deposits',  label: 'Deposit Supply',    min: 0.25, max: 3,   step: 0.05,
      desc: 'How much coal, oil and ore a deposit holds, and biofuel per tree, bush and fish' },
    { key: 'income',    label: 'Customer Payments', min: 0.5,  max: 1.5, step: 0.05,
      desc: 'What homes, businesses and civic buildings pay for power' },
    { key: 'funds',     label: 'Starting Funds',    min: 0.25, max: 5,   step: 0.25,
      desc: 'Cash in the bank on day one', money: true },
  ];

  const NUKE_TIMER = { min: 0.25, max: 3, step: 0.05 };

  const PRESETS = {
    easy:   { label: 'Easy',   buildCost: 0.75, upkeep: 0.75, deposits: 1.5,  income: 1.15, funds: 2 },
    normal: { label: 'Normal', buildCost: 1,    upkeep: 1,    deposits: 1,    income: 1,    funds: 1 },
    hard:   { label: 'Hard',   buildCost: 1.4,  upkeep: 1.35, deposits: 0.6,  income: 0.85, funds: 0.6 },
  };

  // seasons: the four-season year (daynight.js, Seasons). On unless a world says otherwise, so saves from before the setting get it.
  const _defaults = () => ({ preset: 'normal', values: _presetValues('normal'), permadeath: false, nukeTimer: 1, seasons: true });
  function _presetValues(p) {
    const src = PRESETS[p] || PRESETS.normal, out = {};
    for (const s of SLIDERS) out[s.key] = src[s.key];
    return out;
  }
  function _clamp(s, v) {
    v = Number(v);
    if (!Number.isFinite(v)) return 1;
    return Math.min(s.max, Math.max(s.min, v));
  }

  let state = _defaults();

  // Rescale EntityDefs from their original numbers. The originals are kept
  // on the def (_baseCost/_baseUpkeep) the first time through, so applying
  // twice — or loading a second world in one session — never compounds.
  function apply() {
    if (typeof EntityDefs === 'undefined') return;
    const v = state.values;
    for (const def of Object.values(EntityDefs)) {
      if (!def || typeof def !== 'object') continue;
      if (typeof def.cost === 'number') {
        if (def._baseCost === undefined) def._baseCost = def.cost;
        def.cost = Math.round(def._baseCost * v.buildCost);
      }
      if (typeof def.upkeep === 'number') {
        if (def._baseUpkeep === undefined) def._baseUpkeep = def.upkeep;
        // Civic buildings carry NEGATIVE upkeep — that's them paying you,
        // so it follows the income slider, not running costs.
        const m = def._baseUpkeep >= 0 ? v.upkeep : v.income;
        def.upkeep = Math.round(def._baseUpkeep * m * 100) / 100;
      }
    }
    if (typeof refreshHotbar === 'function') { try { refreshHotbar(); } catch (_e) {} }
  }

  function set(cfg) {
    const next = _defaults();
    if (cfg && typeof cfg === 'object') {
      next.preset = (cfg.preset === 'custom' || PRESETS[cfg.preset]) ? cfg.preset : 'normal';
      const src = cfg.values || {};
      for (const s of SLIDERS) next.values[s.key] = _clamp(s, src[s.key] ?? next.values[s.key]);
      next.permadeath = !!cfg.permadeath;
      next.nukeTimer  = _clamp(NUKE_TIMER, cfg.nukeTimer ?? 1);
      next.seasons    = cfg.seasons !== false;
    }
    state = next;
    apply();
  }

  // A save from before difficulty existed is Normal, no permadeath.
  function load(data) { set(data || null); }

  function serialise() {
    return {
      preset: state.preset,
      values: { ...state.values },
      permadeath: state.permadeath,
      nukeTimer: state.nukeTimer,
      seasons: state.seasons,
      worldSize: typeof WORLD_SIZE !== 'undefined' ? WORLD_SIZE : 'normal',
    };
  }

  function label(cfg = state) {
    return cfg.preset === 'custom' ? 'Custom' : (PRESETS[cfg.preset] || PRESETS.normal).label;
  }

  // What the load lists show about a save file, read from its data.
  function badges(data) {
    const d = data && data.difficulty;
    return {
      permadeath: !!(d && d.permadeath),
      difficulty: d ? label(d) : 'Normal',
      worldSize:  (d && d.worldSize) || (typeof worldSizeForDims === 'function'
                    ? worldSizeForDims(data && data.vegMigratedCols, data && data.vegMigratedRows) : 'normal'),
    };
  }

  return {
    SLIDERS, PRESETS, BASE_FUNDS, NUKE_TIMER, badges,
    set, load, apply, serialise, label,
    presetValues: _presetValues,
    get: () => ({ preset: state.preset, values: { ...state.values }, permadeath: state.permadeath, nukeTimer: state.nukeTimer, seasons: state.seasons }),
    permadeath: () => state.permadeath,
    seasons: () => state.seasons !== false,
    // Multipliers read by the systems.
    price:        (n) => Math.round(n * state.values.buildCost),
    incomeMult:   () => state.values.income,
    depositMult:  () => state.values.deposits,
    nukeTimerMult: () => state.nukeTimer,
    startingFunds: () => Math.round(BASE_FUNDS * state.values.funds),
  };
})();
