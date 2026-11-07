/* ═══════════════════════════════════════════════════════════════════
   POLLUTION SYSTEM
   Fossil-fuel generation (coal, oil) and chemical processing pump smog
   into a persistent air-quality grid. Smog
   builds up around its sources, drifts downwind (WindState.dir),
   spreads out and only slowly clears — rain washes it out faster and
   trees and parks soak it up. Turning a plant off doesn't clean the
   air overnight.

   What the smog does:
     • Houses/commercial in it lose satisfaction ceiling (local), and the
       city's total emissions shave a little off everyone (city-wide).
     • Solar panels under it lose output — haze blocks sunlight.
     • Emissions above a free allowance drain government approval and
       are billed as a carbon tax (Economy adds carbonTax() to upkeep).
     • Air Quality feeds City Score.

   What the player can do: space plants away from housing and upwind of
   it, leave trees standing between, install scrubbers on coal/fuel/refinery/chemical
   plants (−60% emissions for a one-off fee plus upkeep), or go clean.
   Reactors aren't on the list: they burn nothing, and their spent fuel
   is a waste problem with its own consequence (a full store stops them),
   not a carbon-tax one.
   Unprocessed waste backing up at the source makes a plant dirtier.
   ═══════════════════════════════════════════════════════════════════ */
const PollutionSystem = (() => {
  // base: emission strength while running.
  // wasteField/wasteCap: overflowing waste storage adds up to +100% on top.
  // wasteOnly: no combustion, so a clean plant emits nothing; it only leaks
  // once its waste storage is more than half full (up to 2x base when full).
  // running(e): whether the plant is actually burning/processing this tick.
  // scrubbable: accepts a scrubber upgrade.
  // A generator's smoke follows the fuel it actually burns: its throttle's
  // multiplier, eased back toward Normal by however much a Throttle Governor
  // is trimming its Overdrive (GovernorSystem.effectiveMode sets _govTrim,
  // 0 = full Overdrive, 1 = trimmed to Normal). This used to read the set
  // mode alone, so a governed plant burning far less was charged full smoke.
  function _throttleMult(e, modes, key, field) {
    const m = modes?.[key];
    if (!m) return 1;
    if (key !== 'overdrive' || !(e._govTrim > 0) || !modes.normal) return m[field] ?? 1;
    return m[field] - (m[field] - modes.normal[field]) * Math.min(1, e._govTrim);
  }
  const SOURCES = {
    [T.COALGENERATOR]:  { base: 14, wasteField: '_ashWaste',    wasteCap: 60, scrubbable: true,
                          running: e => !!e._fuelled,
                          // Overdrive burns more coal and puts out more smoke; Eco less.
                          mult: e => _throttleMult(e, EntityDefs[T.COALGENERATOR].throttleModes, e._cgThrottle, 'coal') },
    [T.REFINERY]:       { base: 10, wasteField: '_sludgeWaste', wasteCap: 60, scrubbable: true,
                          running: e => e._refStatus === 'running' },
    [T.FUELGEN]:        { base: 8,  scrubbable: true,
                          running: e => !!e._fuelled,
                          mult: e => _throttleMult(e, EntityDefs[T.FUELGEN].throttleModes, e._fgThrottle, 'fuel') },
    // Sulfur dioxide off the acid line; real contact plants scrub it.
    [T.CHEMICALPLANT]:  { base: 6,  scrubbable: true,
                          running: e => !!e._chemActive },
    // Pushing and quenching a coke oven throws off smoke and steam, and a
    // flare burns whatever gas nobody piped away.
    [T.COKEOVEN]:       { base: 9,  scrubbable: true,
                          running: e => !!e._running,
                          mult: e => e._flaring ? 1.3 : 1 },
    // Carbon monoxide off the furnace bed as the packing burns.
    [T.GRAPHITEFURNACE]: { base: 4, scrubbable: true,
                          running: e => !!e._running },
  };

  // ── Grid ────────────────────────────────────────────────────────
  const CELL = 8;                               // tiles per grid cell
  const GW = Math.ceil(COLS / CELL), GH = Math.ceil(ROWS / CELL);
  let conc = new Float32Array(GW * GH);         // smog concentration per cell
  let scratch = new Float32Array(GW * GH);
  let sink = new Float32Array(GW * GH);         // extra clearing from trees/parks, per second

  const STEP        = 1;      // sim seconds between grid updates
  const EMIT_K      = 1.0;    // concentration added per emission unit per second
  const DIFFUSE_BASE = 0.08;  // fraction exchanged with each neighbour per step
  const ADVECT      = 0.05;   // cells/second drift at full wind speed
  const TAU         = 150;    // natural clearing time constant (sim seconds)
  const RAIN_TAU    = 45;     // clearing time constant while it rains
  const MAX_CONC    = 250;
  const TREE_SINK   = 0.0015; // per tree/bush in a cell (fraction/s)
  const PARK_SINK   = 0.004;  // per park in a cell
  const SINK_CAP    = 0.02;

  // ── Consequences ────────────────────────────────────────────────
  const EXPOSURE_K       = 0.7;   // concentration → satisfaction-ceiling points
  const EXPOSURE_CAP     = 60;    // max local ceiling penalty
  const ALLOWANCE        = 12;    // emission units the city can put out tax- and approval-free
  const CARBON_TAX_RATE  = 1.2;   // $/s per emission unit over the allowance
  const CITY_PENALTY_K   = 0.2;   // city-wide satisfaction points per unit over allowance
  const CITY_PENALTY_CAP = 15;
  // Approval. The public counts dirty plants, not emission units: each
  // polluting building running unsolved costs APPROVAL_PER_PLANT points of
  // the mayor's sentiment target, up to APPROVAL_PLANT_CAP of them, so with
  // 25 or fewer every one that gets fixed is felt, and past 25 the city is
  // already as angry about its plants as it gets. (It used to be 0.25 a
  // unit capped at 50 points, which fifteen coal plants reached; the first
  // scrubbers after that changed nothing.) 25 plants is the same 50 points
  // the old rule topped out at, so nobody is worse off for the change: 3.2
  // a plant was tried first and sank approval on a city already fitting
  // scrubbers. See _plantWeight for what counts as one building, and
  // approvalParts() for the sum.
  const APPROVAL_PER_PLANT   = 2;
  const APPROVAL_PLANT_CAP   = 25;
  const APPROVAL_SCRUBBED    = 0.2;  // what a scrubbed plant still counts for: the public takes it as dealt with, nearly
  const APPROVAL_EXPO_K      = 0.6;  // points per point of average smog at homes and businesses
  const APPROVAL_CAP         = 55;   // plants and smog together
  const SOLAR_SMOG_FULL  = 120;   // concentration at which solar loses its max
  const SOLAR_SMOG_MAX   = 0.5;   // max fraction of solar output lost to smog

  // Carbon Capture Plant (T.CARBONCAPTURE): while powered it pulls smog out
  // of the air around it and captures a share of the emissions of every
  // polluting plant inside its ring, so where it stands is what it's worth.
  // It used to cancel a flat 10 units citywide wherever it was: $12/s off
  // the tax against $10/s upkeep, which made a $120,000 plant all but
  // pointless. Rings that overlap stack on what is left: each takes
  // CAPTURE_SHARE of the remainder (50%, 75%, 87.5%...), so a second plant
  // over the same coal row still pays and capture never passes 100%.
  const CAPTURE_RADIUS  = 5;      // cells (×CELL tiles)
  const CAPTURE_RATE    = 0.035;  // fraction of local smog removed per second at the plant
  const CAPTURE_SHARE   = 0.5;    // share of each in-range plant's emissions it captures
  const T_PER_UNIT      = 0.5;    // tonnes CO₂ shown per unit captured

  const SCRUBBER_COST   = 30000;
  // A contract perk (contract_perks.js) can knock a share off for a few days.
  const scrubberCost = () => {
    const base = typeof Difficulty !== 'undefined' ? Difficulty.price(SCRUBBER_COST) : SCRUBBER_COST;
    return typeof ContractPerks !== 'undefined' && T.SCRUBBER ? ContractPerks.priceFor(T.SCRUBBER, base) : base;
  };
  // Share of what was paid for a scrubber that comes back when the plant it's
  // fitted to is removed: $20,000 of a full-price $30,000. Taken from the price
  // actually paid, so a discounted scrubber can't be sold back at a profit.
  const SCRUBBER_REFUND_SHARE = 2 / 3;
  const SCRUBBER_UPKEEP = 4;      // $/s
  const SCRUBBER_MULT   = 0.4;    // emissions kept with a scrubber fitted

  // A running plant is "causing problems" when its smog is reaching homes
  // or businesses nearby, or when the city is over its allowance (every
  // emitting plant is then adding to the carbon tax and approval loss).
  const HARM_RADIUS = 40;   // tiles from a plant that count as its neighbourhood
  const HARM_ON     = 10;   // local exposure that flags a plant as smogging...
  const HARM_OFF    = 6;    // ...and the lower level it must drop under to clear
  // Share of the smog reaching a property that makes a plant one of its
  // causes; a scrubbed plant has to be the main one.
  const SMOG_SHARE          = 0.15;
  const SMOG_SHARE_SCRUBBED = 0.4;

  let _sources = [];
  let _captures = [];         // powered Carbon Capture Plants: { e, gx, gy (cells), x, y (tiles) }
  let _gross = 0;             // emission units put out this tick, before capture
  let _plants = 0;            // polluting buildings running unsolved, as the public counts them
  let _offset = 0;            // units captured at the source by Carbon Capture Plants
  let _emissions = 0;         // net emission units this tick (what's taxed)
  let _taxPaid = 0;           // $ of carbon tax paid, ever (unlocks carbon capture)
  let _captured = 0;          // units captured, ever
  let _avgExposure = 0;
  let _peak = 0;
  let _stepAcc = 0;
  let _sinkAcc = 999;
  let _problemAcc = 0;
  let _taxNoticeShown = false;
  let _dirty = true;          // haze canvases need re-baking

  const _idx = (gx, gy) => gy * GW + gx;
  const _away = () => typeof ContractSystem !== 'undefined' && ContractSystem.isAway?.();

  function _sourceStrength(e, cfg) {
    if (e._lightningDamaged || !cfg.running(e)) return 0;
    let s = cfg.base;
    if (cfg.wasteOnly) {
      const fill = Math.min(1, (e[cfg.wasteField] || 0) / cfg.wasteCap);
      s = fill > 0.5 ? cfg.base * 2 * (fill - 0.5) * 2 : 0;
      return e._scrubber ? s * SCRUBBER_MULT : s;
    }
    if (cfg.wasteField) s += Math.min(1, (e[cfg.wasteField] || 0) / cfg.wasteCap) * cfg.base;
    if (cfg.mult) s *= cfg.mult(e);
    if (e._scrubber) s *= SCRUBBER_MULT;
    return s;
  }

  // How much of "one polluting building" a running plant is, for approval.
  // A plant at its ordinary output is 1 whatever it burns, and never more:
  // Overdrive and backed-up waste are paid for in smog and carbon tax, not
  // counted as extra buildings, so "20 polluters" on the map is 20 here.
  // Eco counts for less, a reactor only as its spent fuel piles up, and a
  // scrubbed plant for a fifth of what it would otherwise.
  function _plantWeight(e, cfg, strength) {
    const raw = e._scrubber ? strength / SCRUBBER_MULT : strength;
    return Math.min(1, raw / cfg.base) * (e._scrubber ? APPROVAL_SCRUBBED : 1);
  }

  // A plant short of coal or fuel runs in bursts, on one tick and off the
  // next, so its emission (and the city total) flickers between full and
  // zero. Anything that tells the player about pollution reads these
  // averages instead, or the problem card appeared and vanished every few
  // seconds. The smog itself still uses the exact per-tick value. The
  // carbon tax used to as well, and since it goes straight into upkeep the
  // HUD's net rate jumped by a plant's share of the tax every few ticks (a
  // $19 swing twice a second, for one fuel plant running in bursts). It is
  // billed on this average now: the same money over any stretch of time,
  // without the flicker.
  const NOTICE_SMOOTH = 6;    // seconds
  let _overAvg = 0;           // city emissions over the allowance, smoothed
  const _avgStep = (dt) => Math.min(1, dt / NOTICE_SMOOTH);
  // Game seconds the smoothed figure has stayed within the allowance, reset
  // the moment it goes over. The Clean Air Act commission reads this: it
  // used to read the per-tick value, so plants starting up (burning on one
  // tick, off the next) could hand it one clean tick and pay it out while
  // the city was switching four coal generators on.
  let _cleanFor = 0;

  // Share of a plant's emissions that gets past the capture plants whose
  // ring it stands in (centre to centre, the ring the placement ghost
  // draws). `skip` leaves one capture plant out, to price what it saves.
  function _captureKeep(col, row, skip) {
    const R = CAPTURE_RADIUS * CELL;
    let keep = 1;
    for (const cp of _captures) {
      if (cp.e !== skip && Math.hypot(col - cp.x, row - cp.y) <= R) keep *= 1 - CAPTURE_SHARE;
    }
    return keep;
  }
  // Units captured at the source, with `skip` (if given) switched off.
  function _offsetWithout(skip) {
    let off = 0;
    for (const s of _sources) if (!s.fallout) off += s.strength * (1 - _captureKeep(s.col, s.row, skip));
    return off;
  }

  function rebuildSources(dt = 0) {
    _captures.length = 0;
    if (T.CARBONCAPTURE) for (const e of EntityRegistry.getByType(T.CARBONCAPTURE)) {
      e._capturing = !!e.powered && !e._lightningDamaged;
      if (!e._capturing) continue;
      const x = e.col + (e.width || 1) / 2, y = e.row + (e.height || 1) / 2;
      _captures.push({ e, x, y, gx: x / CELL - 0.5, gy: y / CELL - 0.5 });
    }
    _sources.length = 0;
    _gross = 0;
    _plants = 0;
    _offset = 0;
    for (const [type, cfg] of Object.entries(SOURCES)) {
      for (const e of EntityRegistry.getByType(type)) {
        const strength = _sourceStrength(e, cfg);
        const col = e.col + (e.width || 1) / 2, row = e.row + (e.height || 1) / 2;
        e._emission = strength;
        e._emissionAvg = e._emissionAvg === undefined ? strength : e._emissionAvg + (strength - e._emissionAvg) * _avgStep(dt);
        e._captureKeep = _captureKeep(col, row, null);
        if (strength <= 0) continue;
        _gross += strength;
        _offset += strength * (1 - e._captureKeep);
        _plants += _plantWeight(e, cfg, strength);
        _sources.push({ col, row, strength });
      }
    }
    _emissions = _gross - _offset;

    // Nuclear fallout: a live blast zone smoulders and throws radioactive
    // dust over everything downwind, heavy at first and easing as the zone
    // steps down. Spread over ground zero and a ring half way out, so the
    // haze covers the blast rather than one point. Smog only: it reaches
    // homes, solar and the air-quality score like any smog, but it is not
    // an emission the city is taxed for.
    if (typeof LightningDamageSystem !== 'undefined' && LightningDamageSystem.getContaminationZones) {
      for (const z of LightningDamageSystem.getContaminationZones()) {
        const total = FALLOUT_EMIT[z.inner ? z.inner.level : 0] || 0;
        if (!total) continue;
        const cx = z.col + z.w / 2, cy = z.row + z.h / 2, rr = z.rIn * 0.5, each = total / 9;
        _sources.push({ col: cx, row: cy, strength: each, fallout: true });
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4;
          _sources.push({ col: cx + Math.cos(a) * rr, row: cy + Math.sin(a) * rr, strength: each, fallout: true });
        }
      }
    }
  }
  // Smog a fallout zone puts out per second, by stage (residual, hazardous,
  // highly contaminated): ~11 coal plants' worth at first, ~1 by the end.
  const FALLOUT_EMIT  = [0, 15, 60, 160];
  // Points off the air-quality score while fallout hangs over the city.
  const FALLOUT_CLEAN = [0, 15, 35, 60];
  function _falloutLevel() {
    return typeof LightningDamageSystem !== 'undefined' && LightningDamageSystem.falloutLevel ? LightningDamageSystem.falloutLevel() : 0;
  }

  function rebuildSinks() {
    sink.fill(0);
    const add = (e, amt) => {
      const gx = Math.floor((e.col + (e.width || 1) / 2) / CELL), gy = Math.floor((e.row + (e.height || 1) / 2) / CELL);
      if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return;
      sink[_idx(gx, gy)] += amt;
    };
    for (const e of EntityRegistry.getByType(T.TREE)) add(e, TREE_SINK);
    for (const e of EntityRegistry.getByType(T.BUSH)) add(e, TREE_SINK * 0.5);
    if (typeof PARK_TYPES !== 'undefined') for (const t of PARK_TYPES) for (const e of EntityRegistry.getByType(t)) add(e, PARK_SINK);
    for (let i = 0; i < sink.length; i++) if (sink[i] > SINK_CAP) sink[i] = SINK_CAP;
  }

  // Bilinear sample of a field at fractional cell coords.
  function _sample(f, x, y) {
    x = Math.max(0, Math.min(GW - 1.001, x));
    y = Math.max(0, Math.min(GH - 1.001, y));
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const i = _idx(x0, y0);
    return (f[i] * (1 - fx) + f[i + 1] * fx) * (1 - fy) + (f[i + GW] * (1 - fx) + f[i + GW + 1] * fx) * fy;
  }

  // Concentration at a tile position (tile units).
  function concAt(col, row) {
    return _sample(conc, col / CELL - 0.5, row / CELL - 0.5);
  }

  function step(dt) {
    // 1. Emit
    for (const s of _sources) {
      const gx = Math.floor(s.col / CELL), gy = Math.floor(s.row / CELL);
      if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
      conc[_idx(gx, gy)] += s.strength * EMIT_K * dt;
    }

    // 2. Advect downwind — semi-Lagrangian: each cell takes what was upwind.
    const wind = typeof WindState !== 'undefined' ? WindState.speed : 0.3;
    const dir  = typeof WindState !== 'undefined' && WindState.dir !== undefined ? WindState.dir : 0;
    const vx = Math.cos(dir) * wind * ADVECT * dt, vy = Math.sin(dir) * wind * ADVECT * dt;
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) scratch[_idx(gx, gy)] = _sample(conc, gx - vx, gy - vy);
    }

    // 3. Diffuse + decay (rain and greenery clear it faster; a smog day's
    // inversion holds it in place and slows clearing)
    const trap = typeof WeatherEventSystem !== 'undefined' && WeatherEventSystem.getSmogTrap ? WeatherEventSystem.getSmogTrap() : 1;
    const tau = ((typeof RainSystem !== 'undefined' && RainSystem.isActive()) ? RAIN_TAU : TAU) * trap;
    const baseKeep = Math.exp(-dt / tau);
    const DIFFUSE = DIFFUSE_BASE / Math.sqrt(trap);
    let peak = 0;
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const i = _idx(gx, gy), c = scratch[i];
        const l = gx > 0 ? scratch[i - 1] : c, r = gx < GW - 1 ? scratch[i + 1] : c;
        const u = gy > 0 ? scratch[i - GW] : c, d = gy < GH - 1 ? scratch[i + GW] : c;
        let v = c + DIFFUSE * dt * (l + r + u + d - 4 * c);
        v *= baseKeep * (1 - sink[i] * dt);
        if (v < 0.01) v = 0;
        if (v > MAX_CONC) v = MAX_CONC;
        conc[i] = v;
        if (v > peak) peak = v;
      }
    }
    // 4. Carbon Capture Plants pull smog out of the air around them —
    // strongest at the plant, fading to nothing at CAPTURE_RADIUS — and
    // count what they cancel at the source (_offset) as captured too.
    for (const cp of _captures) {
      const x0 = Math.max(0, Math.floor(cp.gx - CAPTURE_RADIUS)), x1 = Math.min(GW - 1, Math.ceil(cp.gx + CAPTURE_RADIUS));
      const y0 = Math.max(0, Math.floor(cp.gy - CAPTURE_RADIUS)), y1 = Math.min(GH - 1, Math.ceil(cp.gy + CAPTURE_RADIUS));
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        const d = Math.hypot(gx - cp.gx, gy - cp.gy);
        if (d >= CAPTURE_RADIUS) continue;
        const i = _idx(gx, gy);
        const took = conc[i] * Math.min(1, CAPTURE_RATE * (1 - d / CAPTURE_RADIUS) * dt);
        conc[i] -= took;
        _captured += took;
      }
    }
    _captured += _offset * dt;

    _peak = peak;
    _dirty = true;
  }

  function overAllowance() { return Math.max(0, _emissions - ALLOWANCE); }

  // ── Rendering ───────────────────────────────────────────────────
  // Two tiny GW×GH canvases, one pixel per cell, scaled up with smoothing
  // for a soft haze: `haze` for the city view, `heat` for the world map.
  let _haze = null, _heat = null;
  function _bake() {
    if (!_dirty) return;
    _dirty = false;
    if (!_haze) {
      _haze = document.createElement('canvas'); _haze.width = GW; _haze.height = GH;
      _heat = document.createElement('canvas'); _heat.width = GW; _heat.height = GH;
    }
    const hz = _haze.getContext('2d'), ht = _heat.getContext('2d');
    const hImg = hz.createImageData(GW, GH), tImg = ht.createImageData(GW, GH);
    for (let i = 0; i < conc.length; i++) {
      const v = conc[i];
      if (v < 0.5) continue;
      const k = Math.min(1, v / 100);
      const o = i * 4;
      // Brown-grey smog, thicker and yellower as it concentrates.
      hImg.data[o]     = 110 + 30 * k;
      hImg.data[o + 1] = 100 + 12 * k;
      hImg.data[o + 2] = 80 - 20 * k;
      hImg.data[o + 3] = Math.round(255 * Math.min(0.5, 0.05 + k * 0.45));
      // Heatmap: yellow → orange → red.
      tImg.data[o]     = 255;
      tImg.data[o + 1] = Math.round(220 * (1 - k));
      tImg.data[o + 2] = 40;
      tImg.data[o + 3] = Math.round(255 * Math.min(0.7, 0.12 + k * 0.6));
    }
    hz.putImageData(hImg, 0, 0);
    ht.putImageData(tImg, 0, 0);
  }

  // One notification counting every plant causing problems, and the
  // e._pollutionProblem flag ('smog' | 'tax' | null) the world map flashes.
  // `hot`: customers with noticeable smog this tick, { x, y, local }.
  function syncProblemNotice(hot) {
    const over = _overAvg > 0.5 ? _overAvg : 0;
    const flagged = [];
    const em = (e) => e._emissionAvg || 0;
    let smogging = 0;
    // Who is actually behind the smog at each affected property. Any hot
    // property within range used to flag every emitting plant near it, so a
    // scrubbed generator sitting beside two dirty refineries was blamed for
    // their smog. Each plant's part is its emission, falling off with
    // distance; it is only flagged if that is a real share of what reaches
    // the property. A scrubbed plant has had the one per-building fix there
    // is, so it must be the main cause to be flagged at all.
    const emitters = [];
    for (const type of Object.keys(SOURCES)) for (const e of EntityRegistry.getByType(type)) {
      if (em(e) > 0.05) emitters.push({ e, x: e.col + (e.width || 1) / 2, y: e.row + (e.height || 1) / 2 });
    }
    const blame = new Map();   // plant -> largest share it has of any hot property's smog
    for (const h of hot) {
      if (h.local < HARM_OFF) continue;
      let total = 0; const near = [];
      for (const s of emitters) {
        const d = Math.hypot(h.x - s.x, h.y - s.y);
        if (d > HARM_RADIUS) continue;
        const part = em(s.e) * (1 - d / HARM_RADIUS);
        if (part <= 0) continue;
        near.push([s.e, part]); total += part;
      }
      if (total <= 0) continue;
      for (const [e, part] of near) {
        const was = e._pollutionProblem === 'smog';
        if (h.local < (was ? HARM_OFF : HARM_ON)) continue;
        const share = part / total;
        if (share > (blame.get(e) || 0)) blame.set(e, share);
      }
    }
    // Before Scrubbers are researched no single plant can do anything about
    // the city being over its allowance (the carbon tax has its own notice),
    // so only smog reaching homes, which moving the plant fixes, is flagged.
    const taxFlags = over > 0 && typeof Progression !== 'undefined' && !!T.SCRUBBER && Progression.isUnlocked(T.SCRUBBER);
    for (const { e } of emitters) {
      const was = e._pollutionProblem === 'smog';
      const need = (e._scrubber ? SMOG_SHARE_SCRUBBED : SMOG_SHARE) * (was ? 0.75 : 1);
      // Over the allowance, every plant that could still do more is flagged;
      // a scrubbed one can't, so it isn't.
      const prob = (blame.get(e) || 0) >= need ? 'smog' : (taxFlags && !e._scrubber ? 'tax' : null);
      e._pollutionProblem = prob;
      if (prob) { flagged.push(e); if (prob === 'smog') smogging++; }
    }
    // Plants that have stopped emitting drop their flag.
    for (const type of Object.keys(SOURCES)) for (const e of EntityRegistry.getByType(type)) {
      if (!(em(e) > 0.05)) e._pollutionProblem = null;
    }
    if (typeof NotificationStack === 'undefined') return;
    // Worst first: smog over homes before tax-only, then by what each puts out.
    flagged.sort((a, b) => ((b._pollutionProblem === 'smog') - (a._pollutionProblem === 'smog')) || (em(b) - em(a)));
    NotificationStack.syncGroup('pollution-problem', flagged, n => {
      const why = [];
      if (smogging) why.push(smogging === n ? 'smog is reaching homes nearby' : `${smogging} are smogging homes nearby`);
      if (taxFlags) why.push(`the city is ${Math.ceil(over)} units over its ${ALLOWANCE}-unit allowance`);
      const reason = why.join('; ');
      return {
        icon: '🏭',
        title: n === 1 ? 'Smog alert: 1 plant is polluting too much' : `Smog alert: ${n} plants are polluting too much`,
        message: `${reason.charAt(0).toUpperCase()}${reason.slice(1)}. Click to see which; ${n === 1 ? 'it also flashes' : 'they also flash'} on the world map`,
        color: '#c0a040', border: '#605020', glow: true,
        // One row per plant; clicking a row jumps to it.
        details: () => flagged.map(e => {
          const name = e.businessName || ((EntityDefs[e.type]?.label || e.type) + (e._num !== undefined ? ` #${e._num}` : ''));
          const canScrub = !e._scrubber && PollutionSystem.canScrub(e) && typeof Progression !== 'undefined' && T.SCRUBBER && Progression.isUnlocked(T.SCRUBBER);
          const canCapture = typeof Progression !== 'undefined' && T.CARBONCAPTURE && Progression.isUnlocked(T.CARBONCAPTURE);
          const cause = e._pollutionProblem === 'smog'
            ? `Its smog is reaching homes and businesses nearby. ${e._scrubber ? `Already scrubbed: move it further from town${canCapture ? ', or put a Carbon Capture Plant beside it' : ''}.` : canScrub ? 'Fit a Scrubber from its panel.' : 'Move it further from town, and leave the trees between them standing.'}`
            : `Adding to the carbon tax while the city is over its allowance.${canScrub ? ' Fit a Scrubber from its panel.' : ''}`;
          return {
            key: e.id ?? `${e.col},${e.row}`,
            label: name,
            meta: `${Math.round(em(e))} units${e._scrubber ? ' · scrubbed' : ''}`,
            cause,
            onClick: () => Camera.recentreOn((e.col + (e.width || 1) / 2) * TILE, (e.row + (e.height || 1) / 2) * TILE),
          };
        }),
      };
    });
  }

  // Called by the save loader and on first tick after load.
  // _overAvg too: the carbon tax is billed on it, so a world loaded in the
  // same session must not start on the last one's tax.
  function _clear() { conc.fill(0); _dirty = true; _peak = 0; _cleanFor = 0; _overAvg = 0; }

  return {
    CELL, SCRUBBER_COST, SCRUBBER_UPKEEP, SCRUBBER_MULT, ALLOWANCE,

    tick(dt) {
      if (dt <= 0) return;
      rebuildSources(dt);

      _sinkAcc += dt;
      if (_sinkAcc >= 10) { _sinkAcc = 0; rebuildSinks(); }
      _stepAcc += dt;
      while (_stepAcc >= STEP) { _stepAcc -= STEP; step(STEP); }
      _overAvg += (overAllowance() - _overAvg) * _avgStep(dt);
      _taxPaid += this.carbonTax() * dt;
      _cleanFor = _overAvg < 0.05 ? _cleanFor + dt : 0;

      const cityPenalty = Math.min(CITY_PENALTY_CAP, overAllowance() * CITY_PENALTY_K);
      let sum = 0, count = 0;
      const hot = [];
      for (const t of [T.HOUSE, T.COMMERCIAL]) {
        for (const e of EntityRegistry.getByType(t)) {
          const x = e.col + (e.width || 1) / 2, y = e.row + (e.height || 1) / 2;
          const local = Math.min(EXPOSURE_CAP, concAt(x, y) * EXPOSURE_K);
          e._pollutionLocal = local;
          e._pollutionExposure = Math.min(EXPOSURE_CAP, local + cityPenalty);
          if (local >= HARM_OFF) hot.push({ x, y, local });
          sum += local;
          count++;
        }
      }
      _avgExposure = count ? sum / count : 0;

      // Government approval: the public minds how much the city burns
      // (whether or not it's next door) and how much smog people breathe.
      // (Approval impact is applied by GovernmentSystem via approvalPenalty().)

      if (!_taxNoticeShown && this.carbonTax() > 0 && typeof NotificationStack !== 'undefined') {
        _taxNoticeShown = true;
        NotificationStack.push({
          icon: '🏭', title: 'Carbon tax in effect',
          message: `Your plants are emitting more than the ${ALLOWANCE}-unit allowance. Every unit over is billed (−$${CARBON_TAX_RATE}/s each), and every dirty plant left running costs approval. Scrubbers, clean power and trees all help.`,
          color: '#c0a040', border: '#605020', tag: 'carbon-tax',
        });
      }

      // Replaces the old "smog is choking your neighbourhoods" toast.
      _problemAcc += dt;
      if (_problemAcc >= 1) { _problemAcc = 0; syncProblemNotice(hot); }
    },

    // Satisfaction-ceiling penalty for a specific house/commercial entity
    exposureFor(entity) { return entity._pollutionExposure || 0; },
    localExposureFor(entity) { return entity._pollutionLocal || 0; },
    concAt,

    // City-wide average local exposure across all customers (0 = pristine)
    average() { return _avgExposure; },
    emissions() { return _emissions; },          // net of carbon capture
    grossEmissions() { return _gross; },
    captureOffset() { return _offset; },
    taxPaid() { return _taxPaid; },
    capturedTonnes() { return _captured * T_PER_UNIT; },
    CAPTURE_RADIUS_TILES: CAPTURE_RADIUS * CELL, CAPTURE_SHARE,
    overAllowance,
    cleanFor() { return _cleanFor; },
    // Points knocked off the mayor's sentiment target: the public minds how much
    // the city burns (next door or not) and how much smog people breathe.
    approvalPenalty() { const p = this.approvalParts(); return Math.min(APPROVAL_CAP, p.plants + p.smog); },
    // The two halves of it, and the building count behind the first. Only
    // the share of the city's output that is over the free allowance counts
    // (so one small plant, or a city whose carbon capture covers it, is
    // forgiven), which also keeps the first plant from landing all at once.
    approvalParts() {
      const share = _gross > 0 ? overAllowance() / _gross : 0;
      const count = _plants * share;
      return { plants: Math.min(APPROVAL_PLANT_CAP, count) * APPROVAL_PER_PLANT, smog: _avgExposure * APPROVAL_EXPO_K,
               count, cap: APPROVAL_PLANT_CAP, perPlant: APPROVAL_PER_PLANT };
    },
    carbonTax() { return (_overAvg > 0.05 ? _overAvg : 0) * CARBON_TAX_RATE; },
    // What one Carbon Capture Plant is knocking off the carbon tax: the tax
    // the city would owe with its offset taken back out, less the tax owed
    // now. Worked from this tick's figures rather than the billed average, so
    // it reads the plant's effect straight away.
    captureSaving(e) {
      if (!e || !e._capturing) return 0;
      const overWithout = Math.max(0, _gross - _offsetWithout(e) - ALLOWANCE);
      return Math.max(0, overWithout - overAllowance()) * CARBON_TAX_RATE;
    },
    // What one Carbon Capture Plant is taking in: the emission units it
    // captures (its own part of any overlap with other plants, priced the
    // same way as captureSaving) and how many running plants are in its ring.
    captureStats(e) {
      if (!e || !e._capturing) return { units: 0, plants: 0 };
      const R = CAPTURE_RADIUS * CELL, x = e.col + (e.width || 1) / 2, y = e.row + (e.height || 1) / 2;
      let plants = 0;
      for (const s of _sources) if (!s.fallout && Math.hypot(s.col - x, s.row - y) <= R) plants++;
      return { units: _offset - _offsetWithout(e), plants };
    },
    // One plant's part of the carbon tax. The tax is billed on the city
    // total, so each plant carries it in proportion to what it puts out
    // after capture: a plant inside a capture plant's ring carries less.
    // Shared by averaged output, like the tax itself, so a plant running in
    // bursts doesn't flick between carrying all of it and none.
    taxShare(e) {
      const tax = this.carbonTax();
      if (!(tax > 0)) return 0;
      let total = 0;
      for (const type of Object.keys(SOURCES)) for (const s of EntityRegistry.getByType(type)) total += (s._emissionAvg || 0) * (s._captureKeep ?? 1);
      return total > 0 ? tax * (e._emissionAvg || 0) * (e._captureKeep ?? 1) / total : 0;
    },

    // Inverse metric for City Score — 100 = clean, 0 = choking. Both what
    // people breathe and what the city puts out count.
    cleanlinessScore() { return Math.max(0, Math.min(100, 100 - _avgExposure * 1.2 - overAllowance() * 0.8 - FALLOUT_CLEAN[_falloutLevel()])); },

    // Multiplier on a solar panel's output from the smog over it.
    solarFactor(e) {
      if (_away()) return 1;
      const c = concAt(e.col + (e.width || 1) / 2, e.row + (e.height || 1) / 2);
      return 1 - SOLAR_SMOG_MAX * Math.min(1, c / SOLAR_SMOG_FULL);
    },

    // ── Scrubbers ──
    canScrub(e) { return !!(e && SOURCES[e.type]?.scrubbable); },
    scrubbersUnlocked() { return typeof Progression === 'undefined' || Progression.isUnlocked(T.SCRUBBER); },
    installScrubber(e) {
      if (!this.canScrub(e) || e._scrubber || !this.scrubbersUnlocked()) return false;
      if (!Economy.canAfford(scrubberCost())) {
        showToast(`⚠ A scrubber costs ${formatMoney(scrubberCost())}`, '#ff6040', '#140800', '#602010');
        return false;
      }
      const price = scrubberCost();
      Economy.spend(price);
      e._scrubber = true;
      // Folded into what the plant cost (`_paid`), so removing it — and
      // undoing that removal — refunds part of the scrubber with it.
      e._paid = (e._paid !== undefined ? e._paid : (e.def?.cost ?? EntityDefs[e.type]?.cost ?? 0)) + Math.round(price * SCRUBBER_REFUND_SHARE);
      SFX.click?.();
      showToast(`🌫 Scrubber fitted: emissions cut by ${Math.round((1 - SCRUBBER_MULT) * 100)}%`, '#80d0a0', '#041008', '#205030');
      return true;
    },
    // Upkeep for every fitted scrubber — Economy adds this to its bill.
    scrubberUpkeep() {
      let n = 0;
      for (const [type, cfg] of Object.entries(SOURCES)) {
        if (!cfg.scrubbable) continue;
        for (const e of EntityRegistry.getByType(type)) if (e._scrubber) n++;
      }
      return n * SCRUBBER_UPKEEP;
    },

    // Just the scrubber part of panelRows: the button with its price, or the
    // running upkeep once fitted. For panels that draw their own emissions
    // rows (the Chemical Plant's, in EntityInfoPanel).
    scrubberHtml(e) {
      if (!this.canScrub(e) || !(e._scrubber || this.scrubbersUnlocked())) return '';
      return e._scrubber
        ? `<div class="ep-row"><span class="ep-label">Scrubber</span><span class="ep-value good">Fitted · upkeep -$${SCRUBBER_UPKEEP}/s</span></div>`
        : `<button data-scrubber="1" style="width:100%;margin-top:4px;padding:4px 0;font:inherit;font-size:8px;cursor:pointer;border-radius:3px;border:1px solid #2a6040;background:rgba(60,200,120,0.08);color:#80e0a0">FIT SCRUBBER · ${formatMoney(scrubberCost())} · −${Math.round((1 - SCRUBBER_MULT) * 100)}% EMISSIONS · +$${SCRUBBER_UPKEEP}/s</button>`;
    },

    // Panel rows (HTML) — emissions + scrubber button, shared by the coal,
    // fuel and refinery panels. The button is handled by a delegated
    // listener below, since those panels rebuild their body every refresh.
    panelRows(e) {
      const em = e._emission || 0;
      const col = em <= 0 ? 'var(--text-dim)' : em > 12 ? '#ff7050' : em > 6 ? '#e0b060' : '#80c040';
      let html = `
      <div class="sp-row">
        <div class="sp-row-header"><span class="sp-label">🏭 Emissions</span><span class="sp-value" style="color:${col}">${em.toFixed(1)} units${e._scrubber ? ' · scrubbed' : ''}</span></div>
        <div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">City total</span><span class="sp-label" style="color:${_emissions > ALLOWANCE ? '#ff9070' : 'var(--text)'}">${_emissions.toFixed(1)} / ${ALLOWANCE} allowance</span></div>`;
      const share = this.taxShare(e);
      html += `<div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">Carbon tax share</span><span class="sp-label" style="color:${share > 0 ? '#ff6040' : 'var(--text-dim)'}">${share > 0 ? `-$${share.toFixed(1)}/s` : 'None'}</span></div>`;
      // A scrubber fitted before the unlock existed keeps running; only the
      // button waits for the unlock.
      if (this.canScrub(e) && (e._scrubber || this.scrubbersUnlocked())) {
        html += e._scrubber
          ? `<div class="sp-row-header" style="margin-top:2px"><span class="sp-label" style="font-size:7px">Scrubber upkeep</span><span class="sp-label" style="color:#ff6040">-$${SCRUBBER_UPKEEP}/s</span></div>`
          : `<button data-scrubber="1" style="width:100%;margin-top:4px;padding:4px 0;font:inherit;font-size:8px;cursor:pointer;border-radius:3px;border:1px solid #2a6040;background:rgba(60,200,120,0.08);color:#80e0a0">FIT SCRUBBER · ${formatMoney(scrubberCost())} · −${Math.round((1 - SCRUBBER_MULT) * 100)}% EMISSIONS · +$${SCRUBBER_UPKEEP}/s</button>`;
      }
      return html + `</div>`;
    },

    // ── Rendering ──
    render(ctx) {
      if (_away()) return;
      // Smog day: a sickly yellow-brown pall over the whole sky, and the
      // haze itself drawn thicker.
      const trapped = typeof WeatherEventSystem !== 'undefined' && WeatherEventSystem.getActiveEvent()?.type === 'smog';
      if (trapped) {
        ctx.save();
        ctx.fillStyle = 'rgba(150,128,72,0.14)';
        ctx.fillRect(0, 0, COLS * TILE, ROWS * TILE);
        ctx.restore();
      }
      if (_peak < 1) return;
      _bake();
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(_haze, 0, 0, GW * CELL * TILE, GH * CELL * TILE);
      if (trapped) { ctx.globalAlpha = 0.6; ctx.drawImage(_haze, 0, 0, GW * CELL * TILE, GH * CELL * TILE); }
      ctx.restore();
    },
    // World map heatmap: draws at origin (ox, oy) with es screen px per tile.
    renderMap(ctx, ox, oy, es) {
      if (_peak < 1) return;
      _bake();
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(_heat, ox, oy, GW * CELL * es, GH * CELL * es);
      ctx.restore();
    },
    hasAny() { return _peak >= 1 || _emissions > 0; },

    // ── Save / load ── sparse [index, value] pairs, one decimal.
    serialise() {
      const out = [];
      for (let i = 0; i < conc.length; i++) if (conc[i] >= 0.5) out.push(i, Math.round(conc[i] * 10) / 10);
      return { v: 1, gw: GW, gh: GH, cells: out, taxNotice: _taxNoticeShown, taxPaid: Math.round(_taxPaid), captured: Math.round(_captured) };
    },
    loadState(data) {
      _clear();
      _taxPaid = data?.taxPaid || 0;
      _captured = data?.captured || 0;
      _taxNoticeShown = !!data?.taxNotice;
      // A save from a different map size: the smog field starts clean and
      // builds back up from what's still burning.
      if (!data || data.gw !== GW || data.gh !== GH || !Array.isArray(data.cells)) return;
      for (let k = 0; k + 1 < data.cells.length; k += 2) {
        const i = data.cells[k];
        if (i >= 0 && i < conc.length) conc[i] = data.cells[k + 1];
      }
      for (const v of conc) if (v > _peak) _peak = v;
    },
  };
})();

// Delegated: the plant panels rebuild their body every refresh, so a
// listener bound to the button itself would be gone by mouseup.
document.addEventListener('pointerdown', ev => {
  const btn = ev.target.closest?.('[data-scrubber]');
  if (!btn) return;
  const owner = [['coalgen-panel', CoalGenPanel], ['fuelgen-panel', FuelGenPanel], ['refinery-panel', RefineryPanel]]
    .find(([id, p]) => p.isOpen() && document.getElementById(id)?.contains(btn));
  if (owner) {
    ev.preventDefault(); ev.stopPropagation();
    if (PollutionSystem.installScrubber(owner[1].target)) owner[1].tick();
    return;
  }
  // The general entity panel (Chemical Plant).
  if (EntityInfoPanel.isOpen() && document.getElementById('entity-panel')?.contains(btn)) {
    ev.preventDefault(); ev.stopPropagation();
    if (PollutionSystem.installScrubber(EntityInfoPanel.target)) EntityInfoPanel.refresh();
  }
}, true);
