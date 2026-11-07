/* ═══════════════════════════════════════════════════════════════════
   COAL SYSTEM
   Coal deposit extraction, mining, and conveyor delivery logic.
   ═══════════════════════════════════════════════════════════════════ */

const CoalSystem = (() => {
  // The seam drains slower than coal comes out of it, so every deposit
  // (fresh, saved, or contract) lasts 85% longer at the same mine output,
  // then a further 25% on top (1.85 × 1.25), and 50% again twice over.
  // Tuned here rather than at spawn so the change reaches seams that are
  // already on the map, not just newly generated ones. Divided by 20
  // alongside the 20x cut to coalPerSecond: 20x less coal comes out per
  // second, so each unit has to drain 20x more seam for a deposit to last
  // exactly as long as it did.
  const DEPOSIT_LIFE_MULT = 5.203125 / 20;  // 3.46875 × 1.5, ÷ 20
  const _seamYield = () => DEPOSIT_LIFE_MULT * (typeof Difficulty !== 'undefined' ? Difficulty.depositMult() : 1);
  let totalCoalMined = 0;   // cumulative across all mines, for unlock tracking
  let totalScans     = 0;   // number of paid surveys completed
  const HOPPER_SECONDS = 30; // seconds of fuel at full draw, per generator
  // Actual unit cap = seconds * consumption rate. HOPPER_CAPACITY used to be
  // the raw "30" plugged directly in as a coal-unit ceiling (space = 30 -
  // hopperCoal), so a "full" hopper only ever held 2 seconds of runtime
  // (30 units / 15 coal-per-sec) instead of the intended 30 seconds. That
  // tiny ceiling refilled instantly from even a shortfall-level mine supply,
  // so hoppers always looked topped-off and generators never throttled
  // regardless of actual supply vs demand.
  function hopperCapacity() { return HOPPER_SECONDS * EntityDefs[T.COALGENERATOR].coalPerSecond; }
  // What each mine tier digs on average (mid-size deposit, variance=1), in
  // coal/s. tickMine delivers coal to the buffer at e._coalRate * BURN_RATE
  // per second, and outputForDeposit back-solves e._coalRate from these.
  // Fixed in coal/s, not tied to the generator's draw: when Coal Generators
  // were cut to burn 25% less (0.75 → 0.5625 coal/s) the mines kept digging
  // at the same speed, so deposits last exactly as long as before and each
  // mine now runs a third more generators (MK1 2.2 → ~2.9, MK2 5.4 → 7.2).
  const MK1_COAL_PER_SEC = 1.65;   // 2.2 generators at the old 0.75 coal/s
  const MK2_COAL_PER_SEC = 4.05;   // 5.4 generators at the old 0.75 coal/s
  const BURN_RATE = 0.05; // must match the burnRate used in tickMine below

  // ── Fair shares between mines feeding one generator ──
  // Each sim tick, every powered mine's coal/s is summed per generator its
  // belt reaches. The first time a generator is offered coal in a tick its
  // room is noted, and each mine may fill only its rate's part of that, so a
  // line that several mines feed carries coal from all of them.
  let _shareTick = -1;
  const _feedW = new Map();   // generator -> total coal/s of the mines feeding it
  function _feedShare(g, mineW) {
    if (_shareTick !== SIM_TICK_ID) {
      _shareTick = SIM_TICK_ID;
      _feedW.clear();
      for (const t of [T.COALMINE, T.COALMINE2]) for (const m of EntityRegistry.getByType(t)) {
        if (!m.powered || !(m._coalRate > 0)) continue;
        const port = CoalSystem.mineOutputPort(m);
        if (!port) continue;
        const w = m._coalRate * BURN_RATE;
        for (const gg of CoalSystem.beltTargets(port).gens) _feedW.set(gg, (_feedW.get(gg) || 0) + w);
      }
    }
    if (g._shareTick !== SIM_TICK_ID) { g._shareTick = SIM_TICK_ID; g._shareRoom = Math.max(0, hopperCapacity() - (g._hopperCoal || 0)); }
    const total = _feedW.get(g) || 0;
    return total > mineW + 1e-9 ? g._shareRoom * mineW / total : Infinity;
  }
  // Coal-shortage card (syncShortageNotice): share of time starved, averaged
  // over STARVE_SMOOTH seconds, that raises it and that clears it.
  const STARVE_SMOOTH = 10, STARVE_ON = 0.2, STARVE_OFF = 0.05;
  let _starveAcc = 0;

  // Half of an MK2 mine's 6×6 footprint — enough that neither seam's mine
  // reaches the other, at either tier.
  const DEPOSIT_CLEARANCE = 3;

  function _depositNear(col, row, w, h, pad) {
    for (const d of EntityRegistry.getByType(T.COALDEPOSIT)) {
      const dw = d.width || 2, dh = d.height || 2;
      if (col - pad < d.col + dw && col + w + pad > d.col &&
          row - pad < d.row + dh && row + h + pad > d.row) return true;
    }
    return false;
  }

  function spawnDeposits() {
    const count  = 4 + Math.floor(Math.random() * 5); // 4–8
    // [width, height] variants — 2×2, 3×3, 3×2 weighted equally
    const sizes  = [[2,2],[2,2],[3,3],[3,2]];
    let spawned  = 0;
    let attempts = 0;

    while (spawned < count && attempts < 800) {
      attempts++;
      const [sw, sh] = sizes[Math.floor(Math.random() * sizes.length)];
      const col = DEPOSIT_FIELD.c0 + Math.floor(Math.random() * (DEPOSIT_FIELD.cols - sw));
      const row = DEPOSIT_FIELD.r0 + Math.floor(Math.random() * (DEPOSIT_FIELD.rows - sh));

      if (!isOuterZone(col, row, sw, sh)) continue;
      // Keep a mine's worth of clearance from any deposit already placed. A
      // coal mine is the seam plus a one-tile ring (MK2 is 6×6), so two seams
      // spawned shoulder to shoulder used to make each other unminable. The
      // placement rules cover a neighbour now, but generating them apart is
      // better than relying on that.
      if (_depositNear(col, row, sw, sh, DEPOSIT_CLEARANCE)) continue;
      // Only skip if tiles are occupied by non-deposit entities (water blocks too)
      let blocked = false;
      for (let dr = 0; dr < sh && !blocked; dr++)
        for (let dc = 0; dc < sw && !blocked; dc++) {
          const existing = GridManager.getEntity(col+dc, row+dr);
          if (existing && existing.type !== T.COALDEPOSIT) blocked = true;
          if (WaterSystem.isWater(col+dc, row+dr)) blocked = true;
        }
      if (blocked) continue;
      if (!depositClearOfWater(T.COALDEPOSIT, col, row, sw, sh)) continue;   // room for a mine (resource_helpers.js)

      const deposit       = new Entity(T.COALDEPOSIT, col, row);
      deposit.width       = sw;
      deposit.height      = sh;
      deposit.coalAmount  = Math.round((5000 + Math.random() * 25000) * ((sw + sh) / 2) * 3.5 * 2);
      deposit.coalMax     = deposit.coalAmount;
      deposit._revealed   = true;

      GridManager.setEntityFootprint(deposit);
      if (typeof WorldMapSystem !== 'undefined') WorldMapSystem.registerDiscovery(T.COALDEPOSIT, col, row, sw, sh);
      spawned++;
    }
    return spawned;
  }

  // What each scan looks for, and how it reports. `spawn` is called at
  // completion and returns how many deposits it placed.
  //
  // `system` is the module that owns the kind's price ladder and scan count
  // (getScanCost / incrementScans / getTotalScans) — looked up lazily, as
  // most of them load after this file. `unlock` is the Progression id that
  // opens the scan (null: geothermal, always open), and `mk2Only` marks the
  // late-game scans only a Survey Station MK2 can run: the three tier-5
  // targets (lithium, helium, rare earth), each of them a 22-44 hour survey
  // that arrives after the MK4 station has put the MK2 rig on the map. An
  // MK1 that was already running one of them in an older save still
  // finishes it; it just can't start another.
  const SCAN_KINDS = {
    oil:        { deposit: T.OILDEPOSIT,     spawn: () => OilSystem.spawnOilDeposits(),
                  system: () => OilSystem,       unlock: T.OILSCAN,       mk2Only: false,
                  noun: 'oil',        label: 'Oil',        toastTitle: 'Oil survey complete',
                  icon: '🛢', color: '#d0a030', border: '#604010', toastBg: '#0a0600' },
    uranium:    { deposit: T.URANIUMDEPOSIT, spawn: () => UraniumSystem.spawnUraniumDeposits(),
                  system: () => UraniumSystem,   unlock: T.URANIUMSCAN,   mk2Only: false,
                  noun: 'uranium',    label: 'Uranium',    toastTitle: 'Uranium survey complete',
                  icon: '☢',     color: '#60e060', border: '#206020', toastBg: '#041004' },
    sulfur:     { deposit: T.SULFURDEPOSIT,  spawn: () => SulfurSystem.spawnSulfurDeposits(),
                  system: () => SulfurSystem,    unlock: T.SULFURSCAN,    mk2Only: false,
                  noun: 'sulfur',     label: 'Sulfur',     toastTitle: 'Sulfur survey complete',
                  icon: '🟡', color: '#e0d040', border: '#504000', toastBg: '#100e00' },
    lithium:    { deposit: T.LITHIUMDEPOSIT, spawn: () => LithiumSystem.spawnLithiumDeposits(),
                  system: () => LithiumSystem,   unlock: T.LITHIUMSCAN,   mk2Only: true,
                  noun: 'lithium',    label: 'Lithium',    toastTitle: 'Lithium survey complete',
                  icon: '💎', color: '#a0e0ff', border: '#204050', toastBg: '#001018' },
    helium:     { deposit: T.HELIUMDEPOSIT,  spawn: () => HeliumSystem.spawnHeliumDeposits(),
                  system: () => HeliumSystem,    unlock: T.HELIUMSCAN,    mk2Only: true,
                  noun: 'helium',     label: 'Helium',     toastTitle: 'Helium survey complete',
                  icon: '🎈', color: '#f0b8ff', border: '#503060', toastBg: '#100818' },
    rareearth:  { deposit: T.RAREEARTHDEPOSIT, spawn: () => RareEarthSystem.spawnRareEarthDeposits(),
                  system: () => RareEarthSystem, unlock: T.RAREEARTHSCAN, mk2Only: true,
                  noun: 'rare earth', label: 'Rare Earth', toastTitle: 'Rare earth survey complete',
                  icon: '🧲', color: '#ff9a5a', border: '#603018', toastBg: '#140a04' },
    coal:       { deposit: T.COALDEPOSIT,    spawn: () => spawnDeposits(),
                  system: () => CoalSystem,      unlock: T.COALSCAN,      mk2Only: false,
                  noun: 'coal',       label: 'Coal',       toastTitle: 'Survey complete',
                  icon: '⛏',     color: '#c08030', border: '#604010', toastBg: '#0e0800' },
    geothermal: { deposit: T.GEODEPOSIT,     spawn: () => GeothermalSystem.spawnGeoDeposits(),
                  system: () => GeothermalSystem, unlock: null,           mk2Only: false,
                  noun: 'geothermal', label: 'Geothermal', toastTitle: 'Geothermal survey complete',
                  icon: '♨',     color: '#ff9050', border: '#703018', toastBg: '#140800' },
  };
  // The order the panel lists scans in: the order they open up in.
  const SCAN_ORDER = ['geothermal', 'coal', 'oil', 'uranium', 'sulfur', 'lithium', 'helium', 'rareearth'];

  // Survey scans take a random number of in-game hours rather than a fixed
  // time, so a survey is a wait with a little uncertainty in it. Progress is
  // measured at 50 units per in-game hour; the roll is stored on the scan as
  // its duration, which the progress bar reads and the save keeps, so a scan
  // resumed from a save finishes when it was always going to. Rarer/deeper
  // resources take longer to find.
  const SCAN_UNITS_PER_HOUR = 50;
  const SCAN_HOURS = {
    geothermal: [8, 12],
    coal:       [11, 18],
    oil:        [15, 24],
    sulfur:     [16, 25],
    uranium:    [22, 33],
    lithium:    [22, 33],
    helium:     [29, 44],
    rareearth:  [29, 44],
  };
  function _rollScanDuration(scanType) {
    const [minHours, maxHours] = SCAN_HOURS[scanType] || SCAN_HOURS.geothermal;
    return Math.round((minHours + Math.random() * (maxHours - minHours)) * SCAN_UNITS_PER_HOUR);
  }

  function _isMk2(e) { return !!e && e.type === T.SURVEY2; }

  // An MK2 keeps its scans in `_scanSlots`, one entry per dish: null when
  // that dish is free, else { type, progress, duration, power }. The MK1
  // keeps its single scan in the flat _scanning/_scanType/... fields it has
  // always used, so every save with an MK1 mid-scan still reads the same.
  // Padded/trimmed to the def's slot count here, so a slot array from a
  // save (or a hand-built stub) is always the right shape.
  function _slotsOf(e) {
    const n = (EntityDefs[T.SURVEY2] && EntityDefs[T.SURVEY2].scanSlots) || 2;
    if (!Array.isArray(e._scanSlots)) e._scanSlots = [];
    while (e._scanSlots.length < n) e._scanSlots.push(null);
    if (e._scanSlots.length > n) e._scanSlots.length = n;
    return e._scanSlots;
  }
  // Keeps the MK2's `_scanning` flag in step with its slots: everything that
  // only asks "is this station busy?" (the delete guard, undo, the scan hum)
  // reads `_scanning` and works for both tiers without knowing about slots.
  function _syncMk2Flag(e) {
    e._scanning = _slotsOf(e).some(s => !!s);
  }

  // A finished scan — of either tier — spawns its deposits and reports.
  function _completeScan(e, scanType) {
    // The scan types differ only in data, and every one of them reports the
    // same way, so the shape lives in one table — SCAN_KINDS above — rather
    // than near-identical branches.
    //
    // Geothermal is the default/fallback scan: it's the first resource the
    // station can find, and the only one available until the Coal Scan is
    // unlocked.
    const kind = SCAN_KINDS[scanType] || SCAN_KINDS.geothermal;

    // Snapshot the deposits of this kind BEFORE spawning, so the card can
    // single out the ones this scan actually turned up rather than an old
    // one from a previous survey.
    const already = new Set(EntityRegistry.getByType(kind.deposit));
    const found   = kind.spawn();
    const fresh   = [];
    for (const d of EntityRegistry.getByType(kind.deposit))
      if (!already.has(d)) fresh.push(d);

    const noun = `${kind.noun} deposit${found !== 1 ? 's' : ''}`;
    NotificationStack.push({
      icon: kind.icon,
      title: `${kind.label} survey complete`,
      message: `${found} ${noun} revealed: click to jump there`,
      color: kind.color,
      border: kind.border,
      // "Click to jump there" means the find, not the machine that found it.
      // This used to recentre on the survey station — which the player is
      // already looking at, and which tells them nothing about where the
      // deposits are.
      onClick: _jumpToFind(fresh, kind.deposit, e),
    });
    Progression.checkUnlocks();
  }

  // Moves a station's running scans on by dt, finishing any that run out.
  function _runScans(e, dt) {
    if (_isMk2(e)) {
      const slots = _slotsOf(e);
      for (let i = 0; i < slots.length; i++) {
        const s = slots[i];
        if (!s) continue;
        s.progress = (s.progress || 0) + dt;
        if (s.progress >= (s.duration || 60)) {
          slots[i] = null;   // free the dish before reporting, so the panel shows it ready
          _syncMk2Flag(e);
          _completeScan(e, s.type);
        }
      }
      _syncMk2Flag(e);
    } else if (e._scanning) {
      e._scanProgress = (e._scanProgress || 0) + dt;
      if (e._scanProgress >= (e._scanDuration || 60)) {
        e._scanning     = false;
        e._scanProgress = 0;
        const type = e._scanType;
        e._scanType = null;
        _completeScan(e, type);
      }
    }
  }

  function _recentreOn(entity) {
    Camera.recentreOn((entity.col + (entity.width  || 1) * 0.5) * TILE,
                      (entity.row + (entity.height || 1) * 0.5) * TILE);
    try { SFX.click(); } catch (_e) {}
  }

  // Jump to what the scan found, nearest to the station first — the closest
  // one is the one the player can most cheaply reach, and it keeps the survey
  // station in frame often enough to stay oriented.
  //
  // A notification card outlives the moment it was pushed, and a deposit can
  // be mined out or built over before the player clicks it, so the target is
  // re-checked at click time: still-standing finds from THIS scan first, then
  // any deposit of that kind, and only if the map holds none does it fall
  // back to the station rather than doing nothing at all.
  function _jumpToFind(fresh, depositType, station) {
    return () => {
      const live = fresh.filter(d => EntityRegistry.getByType(depositType).has(d));
      const pool = live.length ? live : [...EntityRegistry.getByType(depositType)];
      if (!pool.length) { _recentreOn(station); return; }
      let best = pool[0], bestD = Infinity;
      for (const d of pool) {
        const dx = d.col - station.col, dy = d.row - station.row;
        const dist = dx * dx + dy * dy;
        if (dist < bestD) { bestD = dist; best = d; }
      }
      _recentreOn(best);
    };
  }

  return {
    // Called every game tick for all survey stations, both tiers — scanning
    // is manual/paid (startScan below).
    tickStation(e, dt) {
      if (_isMk2(e)) {
        const def   = EntityDefs[T.SURVEY2];
        const slots = _slotsOf(e);
        // Idle draw plus every running dish's own scan draw — two scans at
        // once really do cost the grid twice the scan power.
        let draw = def.powerInput;
        for (const s of slots) if (s) draw += s.power || def.scanPowerInput;
        e._activePowerInput = draw;
        if (!e.powered) { _syncMk2Flag(e); return; }   // blackout — both scans stall, progress preserved
        _runScans(e, dt);
        return;
      }
      e._activePowerInput = e._scanning ? (e._scanPowerInput || EntityDefs[T.SURVEY].scanPowerInput) : EntityDefs[T.SURVEY].powerInput;
      if (e._scanning) {
        if (!e.powered) return; // blackout / unpowered — scan stalls, progress preserved
        _runScans(e, dt);
      }
    },

    // The time a station spent frozen while the player was away on a contract
    // (away_ledger.js). A scan that ran out meanwhile reports on the way home.
    catchUpScans(e, dt) { _runScans(e, dt); },

    // ── Survey scans, both station tiers ─────────────────────────────
    // The list of scan kinds in panel order, and each one's table entry.
    scanOrder() { return SCAN_ORDER; },
    scanKind(kind) { return SCAN_KINDS[kind] || null; },
    isSurveyStation(e) { return !!e && (e.type === T.SURVEY || e.type === T.SURVEY2); },

    // An MK2's slot array, normalised (see _slotsOf). Empty for an MK1.
    scanSlots(e) { return _isMk2(e) ? _slotsOf(e) : []; },
    // Free dishes on this station: 0 or 1 on an MK1, 0-2 on an MK2.
    freeScanSlots(e) {
      if (_isMk2(e)) return _slotsOf(e).filter(s => !s).length;
      return e && !e._scanning ? 1 : 0;
    },
    // The fraction knocked off every scan started at this station.
    scanDiscount(e) { return _isMk2(e) ? (EntityDefs[T.SURVEY2].scanDiscount || 0) : 0; },
    // What a scan of `kind` costs if started at station `e` right now: the
    // kind's next rung on its own ladder, less the station's discount.
    scanCostAt(e, kind) {
      const k = SCAN_KINDS[kind];
      if (!k) return Infinity;
      const base = k.system().getScanCost();
      return Math.round(base * (1 - this.scanDiscount(e)));
    },
    // Whether the panel should list this scan at all (researched yet?).
    scanVisible(kind) {
      const k = SCAN_KINDS[kind];
      return !!k && (!k.unlock || Progression.isUnlocked(k.unlock));
    },
    // Why `kind` can't be started at `e` right now, or null when it can.
    // 'locked' | 'mk2' (needs a Survey Station MK2) | 'busy' (no free dish)
    // | 'unpowered' | 'funds'.
    scanBlocker(e, kind) {
      const k = SCAN_KINDS[kind];
      if (!k || !this.scanVisible(kind)) return 'locked';
      if (k.mk2Only && !_isMk2(e))         return 'mk2';
      if (!e.powered)                       return 'unpowered';
      if (this.freeScanSlots(e) <= 0)       return 'busy';
      if (!Economy.canAfford(this.scanCostAt(e, kind))) return 'funds';
      return null;
    },
    // Pays for and starts a scan of `kind` at station `e` — in the MK1's
    // single slot, or the MK2's first free dish. Returns true if it started.
    startScan(e, kind) {
      if (this.scanBlocker(e, kind)) return false;
      const k    = SCAN_KINDS[kind];
      const cost = this.scanCostAt(e, kind);
      Economy.spend(cost);
      // Power draw ramps off the station's shared scan counter (coal's), but
      // the PRICE is each kind's own ladder, so only that counter advances.
      const power = this.getNextScanPower();
      k.system().incrementScans();
      const duration = _rollScanDuration(kind);
      if (_isMk2(e)) {
        const slots = _slotsOf(e);
        const i = slots.indexOf(null);
        slots[i] = { type: kind, progress: 0, duration, power };
        _syncMk2Flag(e);
      } else {
        e._scanPowerInput = power;
        e._scanning = true; e._scanProgress = 0; e._scanType = kind;
        e._scanDuration = duration;
      }
      return true;
    },
    // Every survey ever bought, all kinds together — gates the MK2.
    getAllSurveyCount() {
      let n = 0;
      for (const kind of SCAN_ORDER) {
        const sys = SCAN_KINDS[kind].system();
        if (sys && typeof sys.getTotalScans === 'function') n += sys.getTotalScans() || 0;
      }
      return n;
    },

    getScanCost() {
      const scans = CoalSystem.getTotalScans();
      // $25k first, ×1.25 each time after
      return (typeof Difficulty !== 'undefined' ? Difficulty.price(Math.round(25000 * Math.pow(1.25, scans))) : Math.round(25000 * Math.pow(1.25, scans)));
    },

    // Label/icon for whatever a survey station's active scan is looking for,
    // so the panel can show "Scanning for Coal…" instead of just a percentage.
    getScanKindInfo(scanType) {
      const kind = SCAN_KINDS[scanType] || SCAN_KINDS.geothermal;
      return { label: kind.label, icon: kind.icon, noun: kind.noun };
    },

    hasDeposits() {
      return EntityRegistry.getByType(T.COALDEPOSIT).size > 0;
    },

    // Output based on deposit size (set when mine is placed). Anchored so a
    // mid-size (3×2) deposit at average variance digs exactly
    // MK1_COAL_PER_SEC / MK2_COAL_PER_SEC; the small/large tiers keep the
    // original relative spread (20:26:35).
    outputForDeposit(deposit, mk2 = false) {
      const area = (deposit.width || 2) * (deposit.height || 2);
      const sizeRatio = area <= 4 ? 20/26 : area <= 6 ? 1 : 35/26;
      const anchorMk1 = MK1_COAL_PER_SEC / BURN_RATE;
      const mk2Mult   = MK2_COAL_PER_SEC / MK1_COAL_PER_SEC;
      const variance  = deposit._outputVariance || 1;
      const mult      = mk2 ? mk2Mult : 1.0;
      // Floored at 1.0 — a below-average deposit (small footprint and/or a
      // low variance roll) used to push the effective rate BELOW the
      // target generator count, so even the "guaranteed" number of
      // generators could end up intermittently starved purely from deposit
      // RNG. Every deposit now sustains AT LEAST the target count; an
      // above-average deposit still gives a bonus above that floor.
      const sizeVarianceMult = Math.max(1.0, sizeRatio * variance);
      return Math.round(anchorMk1 * sizeVarianceMult * mult * 10) / 10;
    },
    // outputForDeposit / e._coalRate are on an internal scale; what actually
    // comes out of the ground, in the coal/s a Coal Generator's draw is quoted in.
    coalPerSecondFor(deposit, mk2 = false) { return this.outputForDeposit(deposit, mk2) * BURN_RATE; },
    minedPerSecond(mine) { return (mine._coalRate || 0) * BURN_RATE; },
    // A deposit's coalAmount is seam, not coal: each unit of seam yields
    // _seamYield() coal. These give what's left, and what it held, in the
    // same coal a mine's rate and buffer are counted in.
    coalLeft(dep) { return (dep.coalAmount || 0) * _seamYield(); },
    coalHeld(dep) { return (dep.coalMax || 0) * _seamYield(); },

    // Find the deposit under a mine
    depositUnderMine(mine) {
      // Look for a coaldeposit that occupied the same tiles before mine was placed
      // We store a reference at placement time
      return mine._deposit ? GridManager.getEntity(mine._deposit.col, mine._deposit.row) : null;
    },

    // Called once per tick, before any mine ticks, so tickMine can mark
    // which generators are currently reached by a powered mine's conveyor.
    // tickGenerator then only burns hopper coal for generators marked this
    // way — a mine going offline immediately stops its generator(s) from
    // burning whatever coal is still sitting in the hopper, rather than
    // letting them coast on a buffered reserve indefinitely.
    resetGeneratorFeedFlags() {
      for (const g of EntityRegistry.getByType(T.COALGENERATOR)) g._fedByPoweredMine = false;
    },

    // Called every tick for all coal mines
    tickMine(e, dt) {
      const deposit = e._linkedDeposit;
      if (!deposit || deposit.coalAmount <= 0) {
        e.def.powerOutput = 0;
        e._coalRate = 0;
        e._coalBuffer = 0;
        return;
      }
      // Recomputed every tick rather than trusting the value cached at
      // placement — outputForDeposit()'s formula (target-generator
      // constants, size/variance floor, etc.) can change after a mine's
      // already on the grid, and a live mine should track the current
      // balance instead of being permanently locked to whatever formula
      // was in effect the moment it was placed.
      e._coalRate = this.outputForDeposit(deposit, e.type === T.COALMINE2);
      if (!e.powered) return;

      // Mark every generator this mine's conveyor reaches as "fed by a
      // powered mine" this tick — independent of the current buffer level,
      // so a momentarily-empty buffer doesn't wrongly read as disconnected.
      // tickGenerator only burns hopper coal when this flag is set.
      const { gens, bins, ovens } = CoalSystem.beltTargets(CoalSystem.mineOutputPort(e));
      for (const g of gens) g._fedByPoweredMine = true;

      // Back-pressure: if every connected generator's hopper is already
      // full (typically because its ash-waste buffer maxed out and
      // tickGenerator stopped burning hopper coal), there's nowhere left
      // to push newly-mined coal. Hold off extracting from the deposit
      // entirely instead of stockpiling it in an unbounded local buffer —
      // the whole line should read as backed up, not as the mine quietly
      // draining the deposit into the void.
      if (gens.length > 0 || bins.length > 0 || ovens.length > 0) {
        let downstreamSpace = 0;
        for (const g of gens) {
          if (g._hopperCoal === undefined) g._hopperCoal = 0;
          downstreamSpace += Math.max(0, hopperCapacity() - g._hopperCoal);
        }
        for (const b of bins) downstreamSpace += SolidStorageSystem.space(b);
        for (const o of ovens) downstreamSpace += CokeOvenSystem.bunkerRoom(o);
        if (downstreamSpace <= 0 && (e._coalBuffer || 0) <= 0) {
          e._backedUp = true;
          return;
        }
      }
      e._backedUp = false;

      // The mine's own buffer is capped (MINE_BUFFER_CAP): once it's full
      // the mine stops extracting until something draws the coal away.
      // Older saves can hold more than the cap — trim them down to it.
      if (e._coalBuffer === undefined) e._coalBuffer = 0;
      if (e._coalBuffer > MINE_BUFFER_CAP) e._coalBuffer = MINE_BUFFER_CAP;
      e._bufferFull  = MINE_BUFFER_CAP - e._coalBuffer <= 0;
      // Idle (charged no power this tick because the buffer was full when
      // the grid was solved — see PowerNetwork's _outputFull): dig nothing,
      // but still push the buffered coal out below.
      const room     = e._idleFull ? 0 : MINE_BUFFER_CAP - e._coalBuffer;
      if (e._bufferFull) e._backedUp = true;

      const output   = e._coalRate || 0;
      const burnRate = BURN_RATE;
      const burned   = Math.min(output * burnRate * dt, room);
      // Seam drained per coal mined: see DEPOSIT_LIFE_MULT.
      deposit.coalAmount  = Math.max(0, deposit.coalAmount - burned / _seamYield());
      totalCoalMined     += burned;

      if (e._coalBuffer === undefined) e._coalBuffer = 0;
      e._coalBuffer += burned;
      BeltCargo.produced(e, 'coal', burned);

      // Low/exhausted warnings — see checkDepositDepletion in
      // resource_helpers.js. Both of these were toasts, which slide away
      // unseen if the player happens to be looking elsewhere when the
      // deposit they depend on runs dry.
      if (deposit.coalMax > 0) {
        checkDepositDepletion(deposit, deposit.coalAmount / deposit.coalMax, 'coal');
      }

      if (deposit.coalAmount <= 0) {
        deposit.coalAmount = 0;
        e._coalRate    = 0;
        e._coalBuffer  = 0;
        Progression.checkUnlocks();
      }

      // Push buffered coal out to every generator this mine's conveyor
      // network reaches, split proportionally by each one's remaining
      // hopper space. This runs once per mine (not once per generator),
      // so two generators sharing one mine's output both get served in
      // the same tick — previously each generator independently pulled as
      // much as it could straight into its own hopper, so whichever one
      // ticked first drained the entire buffer and starved every other
      // generator on the same line. That defeated the whole point of the
      // MK2 mine's doubled output, which is meant to feed two generators
      // at once.
      // One tick's worth of belt, shared by the generators and then any bins:
      // a mine with a banked buffer used to dump the lot into the first
      // Storage Container it reached the moment the belt arrived. Twice the
      // mine's own rate as a floor, so a running line is never held back.
      let beltBudget = Math.max(BeltCargo.rate ? BeltCargo.rate('coal') : Infinity, 2 * output * burnRate) * dt;
      if (e._coalBuffer > 0) {
        const withRoom = [];
        let totalSpace = 0;
        const mineW = output * burnRate;
        for (const g of gens) {
          if (g._hopperCoal === undefined) g._hopperCoal = 0;
          // A generator several mines feed splits its room between them by
          // their mining rates (_feedShare). It used to go to whichever mine
          // ticked first: with the line oversupplied, the others shipped
          // nothing at all and their belts stood empty while they banked coal.
          const space = Math.min(hopperCapacity() - g._hopperCoal, _feedShare(g, mineW));
          // only once the coal has had time to travel the belt to it
          if (space > 0 && BeltCargo.reach(e, g, 'coal')) { withRoom.push({ g, space }); totalSpace += space; }
        }
        if (totalSpace > 0) {
          const toDistribute = Math.min(e._coalBuffer, totalSpace, beltBudget);
          beltBudget -= toDistribute;
          for (const { g, space } of withRoom) {
            const share = toDistribute * (space / totalSpace);
            g._hopperCoal += share;
            e._coalBuffer -= share;
            BeltCargo.moved(e, g, 'coal', share);
          }
        }
        // Then any Coke Oven on the line, into its coal bunker.
        if (ovens.length && e._coalBuffer > 0 && beltBudget > 0) {
          const took = CokeOvenSystem.pushCoal(e, ovens, Math.min(e._coalBuffer, beltBudget));
          e._coalBuffer -= took;
          beltBudget -= took;
        }
        // Whatever the generators couldn't take overflows into any Storage
        // Container on the line — generators always eat first, so a bin
        // banks surplus rather than competing with them.
        for (const b of bins) {
          if (e._coalBuffer <= 0 || beltBudget <= 0) break;
          if (!BeltCargo.reach(e, b, 'coal')) continue;
          const took = SolidStorageSystem.deposit(b, Math.min(e._coalBuffer, beltBudget), 'coal');
          e._coalBuffer -= took;
          beltBudget -= took;
          BeltCargo.moved(e, b, 'coal', took);
        }
      }

      // Propagate flow direction outward from mine's output port through
      // conveyor chain: each belt tile of the kept run flows away from the
      // tile the walk reached it from (the port's from the mine's middle).
      const port = CoalSystem.mineOutputPort(e);
      if (!port) return;
      const run = beltRun(port.c, port.r);
      const fromC0 = e.col + Math.floor((e.width||2)/2), fromR0 = e.row + Math.floor((e.height||2)/2);
      const flowRate = (e._coalRate || 0) * BURN_RATE;   // coal/s actually mined (minedPerSecond), not the raw output figure
      for (let i = 0; i < run.n; i++) {
        if (!run.belt[i]) continue;
        const p = run.par[i];
        const c = run.c[i], r = run.r[i];
        const fromC = p < 0 ? fromC0 : run.c[p], fromR = p < 0 ? fromR0 : run.r[p];
        const tile = run.ent[i];
        // Flow direction: the direction FROM fromC,fromR TO c,r
        tile._flowDC = Math.sign(c - fromC);
        tile._flowDR = Math.sign(r - fromR);
        tile._flowRate = flowRate;
      }
    },

    getTotalMined()      { return totalCoalMined; },
    getHopperCapacity()  { return hopperCapacity(); },
    setGeneratorThrottle(gen, key) {
      if (!gen || !EntityDefs[T.COALGENERATOR].throttleModes[key]) return;
      gen._cgThrottle = key;
    },
    loadTotalMined(v)    { if (v !== undefined) totalCoalMined = v; },
    getTotalScans()      { return totalScans; },
    incrementScans()     { totalScans++; },
    // First scan $25k, second $42.5k, then ×1.25 each (the escalation was
    // halved — it used to jump to $60k and climb ×1.5; the first scan's price
    // is unchanged).
    getScanCost()        { const c = totalScans === 0 ? 25000 : totalScans === 1 ? 42500 : Math.round(42500 * Math.pow(1.25, totalScans - 1)); return (typeof Difficulty !== 'undefined' ? Difficulty.price(c) : c); },
    // Each successive scan draws +5 kW more than the last while active —
    // mirrors the rising cost, so later scans are a real power-budget cost too.
    getNextScanPower()   { return EntityDefs[T.SURVEY].scanPowerInput + 5 * totalScans; },
    loadTotalScans(v)    { if (v !== undefined) totalScans = v; },

    // Every tile bordering the mine's full footprint (any side) — mirrors
    // generatorInputPort's "any side accepted" perimeter, used as BFS seeds
    // below so a conveyor works from wherever it's actually attached.
    mineAllPorts(mine) {
      const w = mine.width  || 2;
      const h = mine.height || 2;
      const ports = [];
      for (let i = 0; i < h; i++) { ports.push({ c: mine.col - 1, r: mine.row + i }); ports.push({ c: mine.col + w, r: mine.row + i }); }
      for (let i = 0; i < w; i++) { ports.push({ c: mine.col + i, r: mine.row - 1 }); ports.push({ c: mine.col + i, r: mine.row + h }); }
      return ports.filter(p => GridManager.inBounds(p.c, p.r));
    },

    // Collects every generator reachable from the mine OUT stub (the single
    // tile mineOutputPort() returns, set with R at placement / on hover)
    // through a connected conveyor network. One line can fork downstream to
    // feed several generators (how an MK2 mine supplies two at once).
    connectedGenerators(mine) {
      return this.beltTargets(this.mineOutputPort(mine)).gens;
    },

    // Storage Containers whose IN stub the mine's OUT belt reaches.
    connectedBins(mine) {
      return this.beltTargets(this.mineOutputPort(mine)).bins;
    },

    // Everything a belt network starting at `seed` (a stub tile outside a
    // mine or a container) delivers to: coal generators via their Coal IN
    // stub, and Storage Containers via their IN stub. One line can fork to
    // feed several of each.
    //
    // The flood is the kept belt run from `seed` (BeltRuns, resource_helpers.js),
    // and what it reaches is kept on that run: every mine and coal bin asks
    // this every tick, and on a long shared line the walk was most of the
    // tick. A run is only handed back while its tiles are as they were, so
    // the one thing left to check is a Storage Container turned round on
    // the spot (its IN stub follows _rotation). The arrays are shared: read,
    // don't write.
    beltTargets(seed) {
      const NONE = { gens: [], bins: [], ovens: [] };
      if (!seed) return NONE;
      const e0 = GridManager.getEntity(seed.c, seed.r);
      if (!e0 || !isConveyorTile(e0)) return NONE;
      const run = beltRun(seed.c, seed.r);
      const kept = run._coalTargets;
      if (kept && kept.binCands.every((b, i) => (b._rotation || 0) === kept.binRots[i])) return kept.out;
      const gens = [], bins = [], ovens = [], binCands = [];
      for (let i = 0; i < run.n; i++) {
        if (!run.belt[i]) continue;
        const c = run.c[i], r = run.r[i];
        // Check the CONVEYOR tile's own position against each neighbouring
        // generator's port list — generatorInputPort() returns tiles just
        // OUTSIDE the generator's footprint, which is exactly where this
        // conveyor tile sits. Walking a step further onto the generator's
        // own footprint (an interior body tile) and comparing THAT position
        // against the port list can never match, since footprint tiles and
        // port tiles never share a coordinate — that mismatch is why coal
        // never registered as delivered regardless of which side the belt
        // was attached to.
        for (const [dc, dr] of beltSteps(c, r)) {
          const nc = c+dc, nr = r+dr;
          if (!GridManager.inBounds(nc, nr)) continue;
          const n = GridManager.getEntity(nc, nr);
          if (n && n.type === T.COALGENERATOR) {
            if (!gens.includes(n)) {
              const inp = this.generatorInputPort(n);
              if (inp && inp.some(p => p.c === c && p.r === r)) gens.push(n);
            }
          } else if (n && n.type === T.SOLIDSTORAGE) {
            if (!binCands.includes(n)) binCands.push(n);
            if (!bins.includes(n) && SolidStorageSystem.isIn(n, c, r)) bins.push(n);
          } else if (n && n.type === T.COKEOVEN) {
            if (!ovens.includes(n) && CokeOvenSystem.isCoalIn(n, c, r)) ovens.push(n);
          }
        }
      }
      const out = { gens, bins, ovens };
      run._coalTargets = { out, binCands, binRots: binCands.map(b => b._rotation || 0) };
      return out;
    },

    // Output port tile — the single tile just outside the mine's output edge
    // A Coal Mine MK1 built with a yard round its seam — every one placed
    // since the MK1 grew (_coalMineFootprint, input_manager.js) — as opposed
    // to an older mine that exactly covers its deposit. A placement ghost or
    // a job-site mine carries no deposit size and reads as the default 2×2.
    isYardMine(mine) {
      return mine.type === T.COALMINE &&
        (mine.width  || 2) >= (mine._depositWidth  || 2) + 2 &&
        (mine.height || 2) >= (mine._depositHeight || 2) + 2;
    },

    mineOutputPort(mine) {
      // MK2: at either end of its rail spur along the bottom row — just
      // outside the bottom-right corner (even rotations, the default) or the
      // bottom-left one (odd). R flips it, same as the MK1 yard mine and the
      // Uranium Mine.
      if (mine.type === T.COALMINE2) {
        const right = (mine._rotation || 0) % 2 === 0;
        const pc = right ? mine.col + (mine.width || 6) : mine.col - 1;
        const pr = mine.row + (mine.height || 6) - 1;
        return GridManager.inBounds(pc, pr) ? { c: pc, r: pr } : null;
      }
      // MK1 with a yard: at the end of the rail along its bottom row, just
      // outside the bottom-right corner or the bottom-left one. R flips the
      // side (even rotations right, odd left). Older exact-cover mines keep
      // the face-centre port below, so conveyors already laid to them stay
      // connected.
      if (this.isYardMine(mine)) {
        const right = (mine._rotation || 0) % 2 === 0;
        const pc = right ? mine.col + (mine.width || 4) : mine.col - 1;
        const pr = mine.row + (mine.height || 4) - 1;
        return GridManager.inBounds(pc, pr) ? { c: pc, r: pr } : null;
      }
      const rot = mine._rotation || 0;
      const w = mine.width  || 2;
      const h = mine.height || 2;
      // dirs: N=0 E=1 S=2 kW=3
      let oc, or_;
      if      (rot === 0) { oc = mine.col + Math.floor(w/2); or_ = mine.row - 1; }         // N: top center
      else if (rot === 1) { oc = mine.col + w;               or_ = mine.row + Math.floor(h/2); } // E: right center
      else if (rot === 2) { oc = mine.col + Math.floor(w/2); or_ = mine.row + h; }          // S: bottom center
      else                { oc = mine.col - 1;               or_ = mine.row + Math.floor(h/2); } // W: left center
      if (!GridManager.inBounds(oc, or_)) return null;
      return { c: oc, r: or_ };
    },

    // Input port — ONLY the fixed Coal IN stub tile (left face, bottom
    // row) is accepted, matching CoalGeneratorConnections.stubs() in
    // waste_cooling_systems.js exactly. Used to accept a conveyor on any
    // perimeter tile, which meant coal could be fed in from any side —
    // now it only counts if the belt is actually attached at the one
    // dedicated port.
    generatorInputPort(gen) {
      const h = gen.height || 4;
      const p = { c: gen.col - 1, r: gen.row + h - 1 };
      return GridManager.inBounds(p.c, p.r) ? [p] : [];
    },

    // Called every tick for coal generators
    tickGenerator(gen, dt) {
      // Ensure per-instance def
      if (gen.def === EntityDefs[T.COALGENERATOR]) {
        gen.def = { ...EntityDefs[T.COALGENERATOR] };
      }

      // Frozen while paused (dt === 0) — otherwise the strict >= check
      // below would see "0 needed this tick" as always satisfiable and
      // force every generator to flash on, or (with the fraction-based
      // version this replaced) always compute 0/0 and flash off. Leaving
      // fuelled/powerOutput untouched just holds whatever was last computed.
      if (dt <= 0) return;

      const def   = EntityDefs[T.COALGENERATOR];
      const modes = def.throttleModes;
      if (!modes[gen._cgThrottle]) gen._cgThrottle = 'normal';
      if (gen._cgPressure === undefined) gen._cgPressure = 0;
      // A powered Throttle Governor touching this generator trims Overdrive
      // back toward Normal as pressure nears the safety valve.
      const mode  = GovernorSystem.effectiveMode(gen, modes, gen._cgThrottle, gen._cgPressure);
      const coalPerSec = def.coalPerSecond * mode.coal;
      if (gen._hopperCoal === undefined) gen._hopperCoal = 0;
      // Saves from before the hopper shrank can hold more than it now fits.
      if (gen._hopperCoal > hopperCapacity()) gen._hopperCoal = hopperCapacity();
      if (gen._ashWaste === undefined) gen._ashWaste = 0;
      gen._cgTrip = Math.max(0, (gen._cgTrip || 0) - dt);
      checkWasteBuildup(gen, gen._ashWaste, 'Ash');

      // Boiler pressure bleeds off whenever the fire isn't being fed, faster
      // while the safety valve is venting after a trip.
      const stopBurning = (state) => {
        gen._cgState = state;
        gen._cgPressure = Math.max(0, gen._cgPressure - (gen._cgTrip > 0 ? 0.03 : 0.012) * dt);
        gen._fuelled = false;
        gen.def.powerOutput = 0;
        MeltdownSystem.tick(gen, gen._cgPressure, false, dt);
      };

      // Blown apart (or struck) — nothing burns until a crew rebuilds it.
      if (gen._lightningDamaged) { stopBurning('wrecked'); return; }

      // Ash buffer full and awaiting truck pickup — can't burn coal (and
      // therefore can't produce power) until it's hauled below capacity.
      if (gen._ashWaste >= 100) { stopBurning('ashfull'); return; }

      // Water is a hard requirement to RUN, not merely a gate on power
      // output. Only the supply calculation in power_network.js used to
      // check _hasWater, so a generator with coal and wire but no water
      // still burned through its hopper, drained the deposit feeding it,
      // accumulated ash, ran its audio loop and counted as "running" for
      // the Fast Travel unlock — it just produced no wattage. Stopping
      // here instead means nothing downstream can treat it as running.
      if (!gen._hasWater) { stopBurning('nowater'); return; }

      // Safety valve lifted — the hopper holds its charge until it reseats.
      // Only saves from before meltdowns replaced the trip still set this.
      if (gen._cgTrip > 0) { stopBurning('tripped'); return; }

      // Coal arrives here via tickMine's proportional push to every
      // connected generator (see CoalSystem.connectedGenerators) — this
      // used to independently pull straight from each connected mine's
      // buffer, but running that per-generator meant whichever generator
      // ticked first each frame could drain a shared mine's entire buffer
      // before any other generator on the same line got a turn.

      // Only consume hopper coal while at least one currently-powered mine
      // is actively feeding this generator (see resetGeneratorFeedFlags /
      // tickMine). Without this, a generator would keep burning down
      // whatever coal was already sitting in its hopper even after every
      // feeding mine lost power — coasting on a buffered reserve instead
      // of actually stopping. The hopper just holds its charge (no drain,
      // no growth) while unfed, and resumes as soon as a mine is powered
      // again.
      if (gen._fedByPoweredMine) {
        const needed = coalPerSec * dt;
        if (gen._hopperCoal >= needed) {
          // Enough buffered to cover this tick in full — run at the
          // throttle's output. Pressure climbs toward the throttle's
          // setting; a cold boiler runs slightly under output while it
          // raises steam, and Overdrive eventually drives it to 100%, where
          // there is no safety valve — the meltdown clock starts, and held
          // there too long the boiler bursts.
          gen._hopperCoal -= needed;
          gen._cgPressure = Math.min(1, gen._cgPressure + (mode.pressure - gen._cgPressure) * Math.min(1, 0.045 * dt));
          if (MeltdownSystem.tick(gen, gen._cgPressure, true, dt)) {
            gen._cgState = 'wrecked';
            gen._fuelled = false;
            gen.def.powerOutput = 0;
            return;
          }
          const warm = 0.85 + 0.15 * Math.min(1, gen._cgPressure / Math.min(0.45, mode.pressure * 0.9));
          gen._fuelled = true;
          gen.def.powerOutput = def.powerOutput * mode.output * warm;
          gen._cgState = MeltdownSystem.isCritical(gen) ? 'critical' : warm < 0.99 ? 'warming' : 'running';
        } else {
          // NOT enough buffered — stay off THIS tick rather than granting
          // full power for any nonzero scrap of coal (the old behavior).
          // Crucially, don't touch the hopper: it keeps accumulating from
          // the mine's continued (shared) trickle every tick it's off,
          // until it eventually clears the threshold and bursts back on
          // for one or more ticks. That accumulate-then-burst cycle is
          // what makes an oversubscribed mine read as "runs fine, then
          // starts stalling intermittently" as more generators are added,
          // instead of either full power for everyone or a smooth partial
          // wattage — matches how the player wants shortage to read.
          stopBurning('starved');
        }
      } else {
        stopBurning('unfed');
      }
      if (gen._fuelled && gen.powered) {
        if (gen._ashWaste === undefined) gen._ashWaste = 0;
        const _ashSpd = DayNight.secondsPerGameHour() * 24;
        gen._ashWaste = Math.min(100, gen._ashWaste + (100 / (7 * _ashSpd)) * mode.ash * dt * WASTE_RATE_MULT);
        WasteSystem.checkAvailability(T.COALGENERATOR, gen);
      }
    },

    // One card for every Coal Generator its mines can't keep up with. Run
    // once per tick after the generators; it only touches the stack once a
    // second. Flagged once a generator spends over a fifth of its time
    // starved, cleared only once it's back under a twentieth, so it doesn't
    // blink on and off at the edge.
    syncShortageNotice(dt) {
      if (dt <= 0) return;
      // How much of the last few seconds each one spent starved. A starved
      // generator flips on and off tick by tick, so the card reads this
      // average rather than the state of the moment.
      const k = Math.min(1, dt / STARVE_SMOOTH);
      for (const g of EntityRegistry.getByType(T.COALGENERATOR)) {
        const starved = g._cgState === 'starved' ? 1 : 0;
        g._starveAvg = g._starveAvg === undefined ? starved : g._starveAvg + (starved - g._starveAvg) * k;
      }
      _starveAcc += dt;
      if (_starveAcc < 1 || typeof NotificationStack === 'undefined') return;
      _starveAcc = 0;
      const short = [];
      for (const g of EntityRegistry.getByType(T.COALGENERATOR)) {
        const avg = g._starveAvg || 0;
        g._coalShort = g._coalShort ? avg > STARVE_OFF : avg > STARVE_ON;
        if (g._coalShort) short.push(g);
      }
      short.sort((a, b) => (b._starveAvg || 0) - (a._starveAvg || 0));
      NotificationStack.syncGroup('coal-starved', short, n => ({
        icon: '⛏️',
        title: n === 1 ? '1 Coal Generator is short of coal' : `${n} Coal Generators are short of coal`,
        message: `Their mines can't dig fast enough to keep ${n === 1 ? 'it' : 'them all'} burning, so ${n === 1 ? 'it runs' : 'they run'} in bursts and lose power. Add a mine, upgrade to a Coal Mine MK2, or take a generator off the line. Click to see which.`,
        color: '#e0a040', border: '#604010', glow: true,
        details: () => short.map(g => ({
          key: g.id ?? `${g.col},${g.row}`,
          label: `Coal Generator${g._num !== undefined ? ' #' + g._num : ''}`,
          meta: `running ${Math.round((1 - (g._starveAvg || 0)) * 100)}% of the time`,
          cause: 'Not enough coal reaches its hopper to burn continuously.',
          onClick: () => Camera.recentreOn((g.col + (g.width || 1) / 2) * TILE, (g.row + (g.height || 1) / 2) * TILE),
        })),
      }));
    },

    // Serialize/restore
    save(e) {
      return {
        _surveyProgress: e._surveyProgress,
        _surveyCooldown: e._surveyCooldown,
      };
    },
    restore(e, d) {
      if (d._surveyProgress !== undefined) e._surveyProgress = d._surveyProgress;
      if (d._surveyCooldown !== undefined) e._surveyCooldown = d._surveyCooldown;
    },
  };
})();

